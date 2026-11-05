// Pist operasyonları: kalkış koşusu, ilk tırmanış, bekleme paterni, yaklaşma, son yaklaşma (süzülüş yolu),
// düzleştirme (flare), teker koyma ve iniş koşusu. Pas geçme (go-around) dahil.
// Pist iki yönlüdür: üs, arazi taramasıyla en temiz yaklaşma koridorunu seçer (Airbase.approach).
// Her iniş denemesinin kendi tarzı var (LandingStyle): uçaklar aynı rotayı aynı hızla izlemez, aynı noktada durmaz.

import { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Brain } from './brain';
import type { World } from '../world';
import type { FlyCommand } from '../aircraft/pilot';
import { approachSpeed, gearHeight, rotateSpeed, stallSpeed, stepGround } from '../aircraft/flightModel';
import { RUNWAY_HALF, TOUCHDOWN_IN, type Airbase } from '../structures/airbase';
import { groundLevel } from '../terrain';
import { DEG, clamp, mulberry32 } from '../../core/math';
import { headingWithAlt, orbitDir } from './nav';
import { L } from '../../i18n';

export type OpsMode = 'none' | 'takeoff' | 'climbout' | 'landing';
export type LandingStage = 'hold' | 'toIaf' | 'final' | 'flare' | 'rollout' | 'missed';

/** Bir iniş denemesinin tarzı: pilotların aynı işi biraz farklı yapması. */
export interface LandingStyle {
  /** Son yaklaşma uzunluğu çarpanı (yalnız kısalır: koridor bu uzunluk için tarandı). */
  finalK: number;
  /** Süzülüş açısı çarpanı. */
  glideK: number;
  /** Eksene giriş noktasının yanal kayması (m). */
  lane: number;
  /** Teker koyma noktası: pist boyunca ve yana kayma (m). */
  tdShift: number;
  tdLat: number;
  /** Yaklaşma hızı çarpanı. */
  speedK: number;
  /** Düzleştirme yüksekliği (m) ve bu sıradaki alçalma. */
  flareH: number;
  flareSink: number;
  /** Bekleme: yarıçap, merkez kayması, irtifa kayması, hız çarpanı. */
  holdR: number;
  holdDx: number;
  holdDz: number;
  holdAlt: number;
  holdSpeedK: number;
  /** İniş koşusu: frenin başladığı hız (m/s), fren dozu (0–1), ufak yalpa (rad) ve evresi. */
  brakeAt: number;
  brakeDuty: number;
  /** Pist bitmeden durmak için tam fren başladı (bırakılmaz). */
  hardBrake: boolean;
  weave: number;
  weaveW: number;
  phase: number;
  /** Pas geçme: yana dönüş yüksekliği ve eksenden uzaklık (m). */
  missAgl: number;
  missDist: number;
}

/** Uçak kimliği ve deneme sayısından: kayıt kipinde tekrarlanabilir, ortak rastgele akışı bozmaz. */
function newStyle(ac: Aircraft, attempt: number): LandingStyle {
  const r = mulberry32((ac.id * 2654435761 + attempt * 40503 + 12345) >>> 0);
  const between = (a: number, b: number) => a + (b - a) * r();
  const side = () => (r() < 0.5 ? -1 : 1);
  return {
    finalK: between(0.68, 1),
    glideK: between(0.94, 1.1),
    lane: side() * between(30, 240),
    tdShift: between(-110, 260),
    tdLat: between(-9, 9),
    speedK: between(1, 1.1),
    flareH: between(10, 22),
    flareSink: between(0.02, 0.05),
    holdR: between(1400, 2300),
    holdDx: between(-450, 450),
    holdDz: between(-450, 450),
    holdAlt: between(-35, 35),
    holdSpeedK: between(0.72, 0.88),
    brakeAt: between(26, 60),
    brakeDuty: between(0.45, 1),
    hardBrake: false,
    weave: between(0.002, 0.01),
    weaveW: between(0.35, 0.8),
    phase: between(0, 6.28),
    missAgl: between(130, 260),
    missDist: between(1500, 2600),
  };
}

function styleOf(ac: Aircraft, ops: OpsState): LandingStyle {
  return (ops.style ??= newStyle(ac, ops.goArounds));
}

export interface OpsState {
  mode: OpsMode;
  baseId: number;
  stage: LandingStage;
  /** 0 = iniş izni, >0 = bekleme sırası. */
  queue: number;
  requestTimer: number;
  goArounds: number;
  /** Bu denemenin tarzı (ilk kullanımda seçilir). */
  style: LandingStyle | null;
}

export function newOps(): OpsState {
  return { mode: 'none', baseId: -1, stage: 'hold', queue: 99, requestTimer: 0, goArounds: 0, style: null };
}

const _t = new Vector3();
const _iaf = new Vector3();
const _carrot = new Vector3();
const _hold = new Vector3();
/** Frenle yavaşlama (m/s²), durma mesafesi denetimi için. */
const BRAKE_DECEL = 3.5;

/** Yerdeki uçak: kalkış koşusu ya da iniş sonrası frenleme. */
export function groundUpdate(ac: Aircraft, brain: Brain, world: World, dt: number): void {
  const ops = brain.ops;
  const c = ac.controls;
  if (ops.mode === 'takeoff') {
    c.throttle = 1;
    c.brake = false;
    const vr = rotateSpeed(ac);
    stepGround(ac, dt, ac.speed > vr * 0.92);
    brain.status = `${L('Kalkış koşusu', 'Takeoff roll')}: ${Math.round(ac.speed * 3.6)} km/${L('sa', 'h')}`;
    if (ac.speed >= vr) {
      ac.onGround = false;
      ac.pos.y += 0.6;
      ac.setAttitude(ac.groundHeading / DEG, 7);
      ac.n = 1;
      ops.mode = 'climbout';
      brain.status = L('Kalkış: ilk tırmanış', 'Takeoff: initial climb');
    }
    return;
  }
  // İniş koşusu: kimi pilot erken ve sert, kimi geç ve hafif frenler; pist bitecekse tam fren
  const st = styleOf(ac, ops);
  const rb = world.airbaseById(ops.baseId);
  c.throttle = 0;
  c.brake = ac.speed < st.brakeAt && ((world.time * 0.8 + st.phase) % 1) < st.brakeDuty;
  if (rb) {
    const left = 2 * RUNWAY_HALF - TOUCHDOWN_IN - rb.alongApproach(ac.pos.x, ac.pos.z) - 80;
    if ((ac.speed * ac.speed) / (2 * BRAKE_DECEL) > left * 0.8) st.hardBrake = true;
    if (st.hardBrake) c.brake = true;
    // Burun tam eksende kalmaz, hızla azalan ufak bir yalpa; eksenden fazla kaçarsa düzeltir
    rb.touchdownPoint(_t);
    const pl = rb.approach();
    const lx = rb.dirX * pl.sign;
    const lz = rb.dirZ * pl.sign;
    const cross = -(ac.pos.x - _t.x) * lz + (ac.pos.z - _t.z) * lx;
    const fix = Math.abs(cross) > 16 ? -clamp(cross / 400, -0.04, 0.04) : 0;
    ac.groundHeading = rb.landingHeading() + fix + st.weave * Math.sin(world.time * st.weaveW + st.phase) * clamp(ac.speed / 30, 0, 1);
  }
  stepGround(ac, dt, false);
  brain.status = `${L('İniş koşusu', 'Landing roll')}: ${Math.round(ac.speed * 3.6)} km/${L('sa', 'h')}`;
  if (ac.speed < 2.5) {
    const base = world.airbaseById(ops.baseId);
    if (base) world.recover(ac, base);
    else world.destroyQuietly(ac);
  }
}

export function climbout(ac: Aircraft, brain: Brain, cmd: FlyCommand): void {
  const h = ac.groundHeading;
  cmd.dir.set(Math.sin(h), 0.2, -Math.cos(h));
  cmd.throttle = 1;
  cmd.speed = null;
  cmd.maxG = 2;
  cmd.minAlt = 40;
  brain.status = L('Kalkış: ilk tırmanış', 'Takeoff: initial climb');
  const agl = ac.pos.y - groundLevel(ac.pos.x, ac.pos.z);
  if (agl > 220) brain.ops.mode = 'none';
}

/** İniş: bekleme → yaklaşma → son yaklaşma → düzleştirme. Teker koyma world içinde algılanır. */
export function landing(ac: Aircraft, brain: Brain, world: World, dt: number, cmd: FlyCommand): void {
  const ops = brain.ops;
  const base = world.airbaseById(ops.baseId);
  if (!base || !base.usable) {
    const alt = world.nearestAirbase(ac.team, ac.pos, (b) => b.usable);
    if (alt && alt !== base) {
      base?.cancelLanding(ac.id);
      brain.beginLanding(alt);
      world.log(L(`${ac.callsign}: üs kullanılamıyor, ${alt.s.name} üssüne yöneliyor`, `${ac.callsign}: base unusable, diverting to ${alt.s.name}`), ac.team, 'ops');
      return;
    }
    if (!base) {
      ops.mode = 'none';
      return;
    }
  }
  // Pas geçen uçak sırasını bırakmıştır: turu bitene kadar yeniden istemez, arkadakiler inmeye devam eder
  if (ops.stage !== 'missed') {
    ops.requestTimer -= dt;
    if (ops.requestTimer <= 0) {
      ops.requestTimer = 1;
      ops.queue = base.requestLanding(ac.id);
    }
  }
  const s = ac.spec;
  const st = styleOf(ac, ops);
  const plan = base.approach();
  const dx = base.dirX * plan.sign;
  const dz = base.dirZ * plan.sign;
  base.touchdownPoint(_t);
  _t.x += dx * st.tdShift - dz * st.tdLat;
  _t.z += dz * st.tdShift + dx * st.tdLat;
  const rx = ac.pos.x - _t.x;
  const rz = ac.pos.z - _t.z;
  /** Teker koyma noktasına göre pist ekseni boyunca konum (yaklaşmada negatif). */
  const along = rx * dx + rz * dz;
  const cross = -rx * dz + rz * dx;
  const vBase = approachSpeed(ac);
  const vApp = vBase * st.speedK;
  const rwyY = _t.y + gearHeight(s);
  // Arazi payı azsa sığ süzülüş yok
  const glide = plan.glideTan * (plan.margin < 40 ? Math.max(st.glideK, 1) : st.glideK);
  const finalLen = plan.finalDist * st.finalK;

  // İniş izni çıksa da önce bekleme paterninde uygun irtifaya alçalınır
  if (ops.stage === 'hold' && ops.queue === 0 && ac.pos.y < base.holdAltitude(0) + 350) ops.stage = 'toIaf';
  if (ops.stage !== 'hold' && ops.stage !== 'missed' && ops.queue > 0) ops.stage = 'hold';
  // Yaklaşmada flap ve iniş takımı açık. Pas geçerken flapsız tutunma hızının üstüne çıkınca toplanır: tam flapın sürüklemesiyle
  // ağır uçak ne hızlanır ne tırmanır
  cmd.flaps = ops.stage !== 'hold' && !(ops.stage === 'missed' && ac.speed > stallSpeed(ac) * 1.15);

  switch (ops.stage) {
    case 'hold': {
      base.holdCenter(_hold);
      _hold.x += st.holdDx;
      _hold.z += st.holdDz;
      orbitDir(cmd.dir, ac, _hold, st.holdR, base.holdAltitude(ops.queue - 1) + st.holdAlt);
      cmd.speed = s.cruiseSpeed * st.holdSpeedK;
      cmd.maxG = 2.2;
      brain.status = `${L('Bekleme paterni: iniş sırası', 'Holding pattern: landing order')} ${ops.queue}`;
      break;
    }
    case 'toIaf': {
      const iafAlt = rwyY + finalLen * glide;
      // Eksene herkes aynı noktadan girmez; kısa son yaklaşmada kayma az (eksene oturacak yer kalsın)
      const lane = st.lane * clamp((finalLen - 1500) / 3000, 0, 1);
      _iaf.set(_t.x - dx * finalLen - dz * lane, iafAlt, _t.z - dz * finalLen + dx * lane);
      cmd.dir.subVectors(_iaf, ac.pos);
      // Yüksekteyse alçal ama IAF'a varmadan tırmanma
      if (ac.pos.y > iafAlt + 50) cmd.dir.y = Math.min(cmd.dir.y, -Math.hypot(cmd.dir.x, cmd.dir.z) * 0.12);
      cmd.speed = vApp * 1.25;
      cmd.maxG = 2.5;
      cmd.pushTheta = 1.2;
      // Hızlıysa erkenden yavaşla: gaz kapalı, flaplar açık; çok hızlıysa alçalmayı da kes, pike freni ve yan kayış
      if (ac.speed > cmd.speed * 1.05) cmd.throttle = 0;
      if (ac.speed > vApp * 1.5) {
        cmd.dir.y = Math.max(cmd.dir.y, 0);
        cmd.diveBrake = true;
        cmd.sideslip = true;
      }
      const aligned = ac.fwd.x * dx + ac.fwd.z * dz > 0.92;
      const dIaf = Math.hypot(_iaf.x - ac.pos.x, _iaf.z - ac.pos.z);
      brain.status = L(`Yaklaşma: ilk yaklaşma noktasına ${(dIaf / 1000).toFixed(1)} km`, `Approach: ${(dIaf / 1000).toFixed(1)} km to the initial approach fix`);
      const onLine = aligned && along < -1800 && along > -finalLen - 2500 && Math.abs(cross) < 300;
      // Son yaklaşmaya yüksekte ya da hızlı girilmez: yetişmek için pike yapmak temiz uçağı hızlandırır, inemez
      const altOk = Math.abs(ac.pos.y - iafAlt) < 110;
      const slowOk = ac.speed < vApp * 1.4;
      if ((dIaf < 1000 || onLine) && altOk && slowOk) ops.stage = 'final';
      else if (dIaf < 2500 && !(altOk && slowOk)) {
        // İlk yaklaşma noktasının gerisinde helezonla irtifa ve hız ayarla
        _hold.set(_iaf.x - dx * 2500, iafAlt, _iaf.z - dz * 2500);
        orbitDir(cmd.dir, ac, _hold, 1500, iafAlt);
        brain.status = `${L('Yaklaşma: irtifa ayarlıyor', 'Approach: adjusting altitude')} (${Math.round(ac.pos.y - rwyY)} m)`;
      }
      break;
    }
    case 'final': {
      // Öndeki uçak: fazla yaklaştıysa yavaşla, pist hâlâ doluysa pas geç
      const gap = gapAhead(ac, base, world);
      const carrotA = Math.min(along + 1300, 300);
      _carrot.set(_t.x + dx * carrotA, rwyY + Math.max(0, -carrotA) * glide, _t.z + dz * carrotA);
      // Koridorda tepe varsa hedef noktası arazinin altına inmesin
      if (carrotA < -800) _carrot.y = Math.max(_carrot.y, groundLevel(_carrot.x, _carrot.z) + 70);
      cmd.dir.subVectors(_carrot, ac.pos);
      // Uzak kısımda hızlı, son 2,5 km'de yaklaşma hızına yavaşla
      cmd.speed = along < -2500 ? vApp * 1.25 : vApp;
      if (gap < 1500) cmd.speed = Math.min(cmd.speed, vBase * 1.02);
      cmd.maxG = 2;
      cmd.allowPush = true;
      cmd.pushTheta = 1.2;
      cmd.terrainAvoid = along < -1100;
      cmd.minAlt = 30;
      const hgt = ac.pos.y - rwyY;
      const gpErr = hgt - Math.max(0, -along) * glide;
      // Süzülüş yolunun çok üstündeyse yavaşla (hız tutma gazı keser)
      if (gpErr > 40) cmd.speed = Math.min(cmd.speed, vApp * 0.95);
      brain.status = `${L('Son yaklaşma', 'Final approach')}: ${Math.round(-along)} m, ${Math.round(hgt)} m`;
      const offCourse = along > -1200 && Math.abs(cross) > 110;
      // Hız fazlaysa önce onu at: gaz kapalı, yan kayış, süzülüş yolundan dik inilmez (hız alır)
      if (ac.speed > cmd.speed * 1.04) cmd.throttle = 0;
      if (ac.speed > vApp * 1.1) {
        cmd.sideslip = true;
        cmd.dir.y = Math.max(cmd.dir.y, -Math.hypot(cmd.dir.x, cmd.dir.z) * glide);
      }
      if (ac.speed > vApp * 1.25) cmd.diveBrake = true;
      // Pas geçme kararı son düzlükte; her denemede biraz daha hoşgörülü, sonsuza dek dönülmez
      const tooHigh = (along > -700 && gpErr > 60 + 25 * ops.goArounds) || gpErr > 260;
      const tooFast = along > -700 && ac.speed > vBase * Math.min(1.6 + 0.05 * ops.goArounds, 1.8);
      const blocked = along > -500 && gap < 450;
      if (offCourse || tooHigh || tooFast || blocked || along > RUNWAY_HALF) {
        goAround(ac, brain, world, blocked ? L('pist dolu', 'runway busy') : offCourse ? L('eksenden saptı', 'off the centreline') : tooFast ? L('çok hızlı', 'too fast') : L('yüksek kaldı', 'too high'));
        break;
      }
      if (hgt < st.flareH && along > -450) ops.stage = 'flare';
      break;
    }
    case 'flare': {
      cmd.dir.set(dx, -st.flareSink, dz);
      cmd.throttle = 0;
      cmd.speed = null;
      cmd.maxG = 1.6;
      cmd.terrainAvoid = false;
      cmd.pushTheta = 1.2;
      brain.status = L('Düzleştirme', 'Flare');
      if (along > RUNWAY_HALF * 1.3 || ac.pos.y - rwyY > 40) goAround(ac, brain, world, L('uzun indi', 'landed long'));
      break;
    }
    case 'missed': {
      // Pas geçme: önce düz ve tam gazla tırman, sonra yana dön ve eksenden uzakta geri uç. Yaklaşma hattına karşıdan girmez,
      // arkadan gelenler kendi yaklaşmasına devam eder. Yan, bekleme paterninin olduğu yan.
      cmd.throttle = 1;
      cmd.speed = null;
      cmd.maxG = 2.2;
      const agl = ac.pos.y - rwyY;
      // Önce hız: düz uçarak hızlan, hız varsa tırman. Zayıf tırmanan uçak fazla uzaklaşmadan döner.
      if (agl < st.missAgl && (along < 3500 || agl < 60)) {
        cmd.dir.set(dx, ac.speed < vBase * 1.15 ? 0.01 : ac.speed < vBase * 1.3 ? 0.05 : 0.11, dz);
        brain.status = L('Pas geçiyor: tırmanış', 'Going around: climbing');
        break;
      }
      const hx = -dz * st.missDist - rx - dx * 500;
      const hz = dx * st.missDist - rz - dz * 500;
      const l = Math.hypot(hx, hz) || 1;
      headingWithAlt(cmd.dir, ac, hx / l, hz / l, Math.max(base.holdAltitude(0), rwyY + 250));
      brain.status = L('Pas geçiyor: pistin yanından dönüyor', 'Going around: flying back beside the runway');
      if (cross > st.missDist * 0.75) {
        ops.stage = 'hold';
        ops.queue = 99;
        ops.requestTimer = 0;
        ops.style = null;
      }
      break;
    }
    case 'rollout':
      break;
  }
}

/** Aynı piste inen, önümüzdeki en yakın uçağa eksen boyunca uzaklık (m). */
function gapAhead(ac: Aircraft, base: Airbase, world: World): number {
  const me = base.alongApproach(ac.pos.x, ac.pos.z);
  let gap = Infinity;
  for (const id of base.approaching) {
    if (id === ac.id) continue;
    const o = world.aircraftById(id);
    if (!o || (!o.onGround && o.brain.ops.stage !== 'final' && o.brain.ops.stage !== 'flare')) continue;
    const d = base.alongApproach(o.pos.x, o.pos.z) - me;
    if (d > 0 && d < gap) gap = d;
  }
  return gap;
}

function goAround(ac: Aircraft, brain: Brain, world: World, why: string): void {
  brain.ops.stage = 'missed';
  brain.ops.goArounds++;
  // Sıra bırakılır: arkadaki uçak beklemez, pas geçen en sona döner
  world.airbaseById(brain.ops.baseId)?.cancelLanding(ac.id);
  brain.ops.queue = 99;
  if (brain.ops.goArounds <= 3) world.log(L(`${ac.callsign} pas geçti (${why}), yeniden yaklaşıyor`, `${ac.callsign} went around (${why}), approaching again`), ac.team, 'ops');
}

/** Teker koyma uygun mu (world, zemin temasında çağırır). */
export function canTouchDown(ac: Aircraft, brain: Brain, world: World): boolean {
  const ops = brain.ops;
  if (ops.mode !== 'landing' || (ops.stage !== 'flare' && ops.stage !== 'final')) return false;
  const base = world.airbaseById(ops.baseId);
  if (!base || !base.onRunway(ac.pos.x, ac.pos.z)) return false;
  const runwayAligned = Math.abs(ac.fwd.x * base.dirX + ac.fwd.z * base.dirZ) > 0.94;
  // Birkaç denemeden sonra pilot biraz hızlı da olsa koyar
  return runwayAligned && ac.fwd.y > -0.14 && ac.speed < stallSpeed(ac, true) * (2.2 + 0.2 * Math.min(ops.goArounds, 3)) && Math.abs(ac.bankDeg) < 15;
}

export function touchDown(ac: Aircraft, brain: Brain, world: World): void {
  const base = world.airbaseById(brain.ops.baseId)!;
  ac.onGround = true;
  ac.groundHeading = base.landingHeading();
  ac.pos.y = groundLevel(ac.pos.x, ac.pos.z) + gearHeight(ac.spec);
  ac.speed = clamp(ac.speed, 0, stallSpeed(ac, true) * 1.7);
  brain.ops.stage = 'rollout';
}
