// Pist operasyonları: kalkış koşusu, ilk tırmanış, bekleme paterni, yaklaşma, son yaklaşma (süzülüş yolu),
// düzleştirme (flare), teker koyma ve iniş koşusu. Pas geçme (go-around) dahil.
// Pist iki yönlüdür: üs, arazi taramasıyla en temiz yaklaşma koridorunu seçer (Airbase.approach).

import { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Brain } from './brain';
import type { World } from '../world';
import type { FlyCommand } from '../aircraft/pilot';
import { approachSpeed, gearHeight, rotateSpeed, stallSpeed, stepGround } from '../aircraft/flightModel';
import { RUNWAY_HALF } from '../structures/airbase';
import { groundLevel } from '../terrain';
import { DEG, clamp } from '../../core/math';
import { orbitDir } from './nav';
import { L } from '../../i18n';

export type OpsMode = 'none' | 'takeoff' | 'climbout' | 'landing';
export type LandingStage = 'hold' | 'toIaf' | 'final' | 'flare' | 'rollout';

export interface OpsState {
  mode: OpsMode;
  baseId: number;
  stage: LandingStage;
  /** 0 = iniş izni, >0 = bekleme sırası. */
  queue: number;
  requestTimer: number;
  goArounds: number;
}

export function newOps(): OpsState {
  return { mode: 'none', baseId: -1, stage: 'hold', queue: 99, requestTimer: 0, goArounds: 0 };
}

const _t = new Vector3();
const _iaf = new Vector3();
const _carrot = new Vector3();
const _hold = new Vector3();

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
  // İniş koşusu
  c.throttle = 0;
  c.brake = ac.speed < 45;
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
  ops.requestTimer -= dt;
  if (ops.requestTimer <= 0) {
    ops.requestTimer = 1;
    ops.queue = base.requestLanding(ac.id);
  }
  const s = ac.spec;
  const plan = base.approach();
  const dx = base.dirX * plan.sign;
  const dz = base.dirZ * plan.sign;
  base.touchdownPoint(_t);
  const rx = ac.pos.x - _t.x;
  const rz = ac.pos.z - _t.z;
  /** Teker koyma noktasına göre pist ekseni boyunca konum (yaklaşmada negatif). */
  const along = rx * dx + rz * dz;
  const cross = -rx * dz + rz * dx;
  const vApp = approachSpeed(ac);
  const rwyY = _t.y + gearHeight(s);
  const glide = plan.glideTan;

  // İniş izni çıksa da önce bekleme paterninde uygun irtifaya alçalınır
  if (ops.stage === 'hold' && ops.queue === 0 && ac.pos.y < base.holdAltitude(0) + 350) ops.stage = 'toIaf';
  if (ops.stage !== 'hold' && ops.queue > 0) ops.stage = 'hold';
  // Yaklaşmada flap ve iniş takımı açık
  cmd.flaps = ops.stage !== 'hold';

  switch (ops.stage) {
    case 'hold': {
      base.holdCenter(_hold);
      orbitDir(cmd.dir, ac, _hold, 1800, base.holdAltitude(ops.queue - 1));
      cmd.speed = s.cruiseSpeed * 0.8;
      cmd.maxG = 2.2;
      brain.status = `${L('Bekleme paterni: iniş sırası', 'Holding pattern: landing order')} ${ops.queue}`;
      break;
    }
    case 'toIaf': {
      const iafAlt = rwyY + plan.finalDist * glide;
      _iaf.set(_t.x - dx * plan.finalDist, iafAlt, _t.z - dz * plan.finalDist);
      cmd.dir.subVectors(_iaf, ac.pos);
      // Yüksekteyse alçal ama IAF'a varmadan tırmanma
      if (ac.pos.y > iafAlt + 50) cmd.dir.y = Math.min(cmd.dir.y, -Math.hypot(cmd.dir.x, cmd.dir.z) * 0.12);
      cmd.speed = vApp * 1.35;
      cmd.maxG = 2.5;
      cmd.pushTheta = 1.2;
      // Çok hızlıysa alçalmayı kes, yavaşla (pike freni varsa aç)
      if (ac.speed > vApp * 1.6) {
        cmd.dir.y = Math.max(cmd.dir.y, 0);
        cmd.diveBrake = true;
      }
      const aligned = ac.fwd.x * dx + ac.fwd.z * dz > 0.92;
      const dIaf = Math.hypot(_iaf.x - ac.pos.x, _iaf.z - ac.pos.z);
      brain.status = L(`Yaklaşma: ilk yaklaşma noktasına ${(dIaf / 1000).toFixed(1)} km`, `Approach: ${(dIaf / 1000).toFixed(1)} km to the initial approach fix`);
      const onLine = aligned && along < -1800 && along > -plan.finalDist - 2500 && Math.abs(cross) < 300;
      const altOk = Math.abs(ac.pos.y - iafAlt) < 300;
      if ((dIaf < 1000 || onLine) && altOk) ops.stage = 'final';
      else if (dIaf < 2500 && !altOk) {
        // Çok yüksek ya da alçak: ilk yaklaşma noktasının gerisinde helezonla irtifa ayarla
        _hold.set(_iaf.x - dx * 2500, iafAlt, _iaf.z - dz * 2500);
        orbitDir(cmd.dir, ac, _hold, 1500, iafAlt);
        brain.status = `${L('Yaklaşma: irtifa ayarlıyor', 'Approach: adjusting altitude')} (${Math.round(ac.pos.y - rwyY)} m)`;
      }
      break;
    }
    case 'final': {
      const carrotA = Math.min(along + 1300, 300);
      _carrot.set(_t.x + dx * carrotA, rwyY + Math.max(0, -carrotA) * glide, _t.z + dz * carrotA);
      // Koridorda tepe varsa hedef noktası arazinin altına inmesin
      if (carrotA < -800) _carrot.y = Math.max(_carrot.y, groundLevel(_carrot.x, _carrot.z) + 70);
      cmd.dir.subVectors(_carrot, ac.pos);
      // Uzak kısımda hızlı, son 2,5 km'de yaklaşma hızına yavaşla
      cmd.speed = along < -2500 ? vApp * 1.4 : vApp;
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
      const tooHigh = (along > -700 && gpErr > 60) || gpErr > 260;
      const tooFast = along > -1300 && ac.speed > vApp * 1.55;
      if (ac.speed > vApp * 1.25) cmd.diveBrake = true;
      if (offCourse || tooHigh || tooFast || along > RUNWAY_HALF) {
        goAround(ac, brain, world, offCourse ? L('eksenden saptı', 'off the centreline') : tooFast ? L('çok hızlı', 'too fast') : L('yüksek kaldı', 'too high'));
        break;
      }
      if (hgt < 16 && along > -450) ops.stage = 'flare';
      break;
    }
    case 'flare': {
      cmd.dir.set(dx, -0.035, dz);
      cmd.throttle = 0;
      cmd.speed = null;
      cmd.maxG = 1.6;
      cmd.terrainAvoid = false;
      cmd.pushTheta = 1.2;
      brain.status = L('Düzleştirme', 'Flare');
      if (along > RUNWAY_HALF * 1.3 || ac.pos.y - rwyY > 40) goAround(ac, brain, world, L('uzun indi', 'landed long'));
      break;
    }
    case 'rollout':
      break;
  }
}

function goAround(ac: Aircraft, brain: Brain, world: World, why: string): void {
  brain.ops.stage = 'toIaf';
  brain.ops.goArounds++;
  if (brain.ops.goArounds <= 3) world.log(L(`${ac.callsign} pas geçti (${why}), yeniden yaklaşıyor`, `${ac.callsign} went around (${why}), approaching again`), ac.team, 'ops');
}

/** Teker koyma uygun mu (world, zemin temasında çağırır). */
export function canTouchDown(ac: Aircraft, brain: Brain, world: World): boolean {
  const ops = brain.ops;
  if (ops.mode !== 'landing' || (ops.stage !== 'flare' && ops.stage !== 'final')) return false;
  const base = world.airbaseById(ops.baseId);
  if (!base || !base.onRunway(ac.pos.x, ac.pos.z)) return false;
  const runwayAligned = Math.abs(ac.fwd.x * base.dirX + ac.fwd.z * base.dirZ) > 0.94;
  return runwayAligned && ac.fwd.y > -0.14 && ac.speed < stallSpeed(ac, true) * 2.2 && Math.abs(ac.bankDeg) < 15;
}

export function touchDown(ac: Aircraft, brain: Brain, world: World): void {
  const base = world.airbaseById(brain.ops.baseId)!;
  ac.onGround = true;
  ac.groundHeading = base.landingHeading();
  ac.pos.y = groundLevel(ac.pos.x, ac.pos.z) + gearHeight(ac.spec);
  ac.speed = clamp(ac.speed, 0, stallSpeed(ac, true) * 1.7);
  brain.ops.stage = 'rollout';
}
