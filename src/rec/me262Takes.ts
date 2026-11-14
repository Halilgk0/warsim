// Me 262 videosu (05:30, biraz bulutlu, dikey): ikili kol, bombardıman kolunun üstünde tek jet, ikili takla, üçlü yoğuşma
// izli ayrılış, bombacıya saldırı, kutunun altında jet. Uçaklar elle uçar (migTakes.ts Kine): yapay zekâ her karede
// geçersiz kalır, aynı çekim hep aynı oynar. Kayıt: node record.mjs --dir=me262 me_ikili me_bombaci me_takla me_uclu me_saldiri me_alttan

import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Aircraft } from '../sim/aircraft/aircraft';
import { plan, theater } from '../sim/scenarios';
import { groundLevel } from '../sim/terrain';
import { DEG_R, forestSpot, kineApply, kineStart, kineStep, newKine, smooth01, type Kine } from './migTakes';
import type { Subject, Take, TakeCtx } from './takes';
import { Damp3 } from './director';
import { sunAt } from '../render/atmosphere';

const SEED = 72;
const DAWN = 5.5;
const CLOUDS = 0.75;

/** Ormanlı, engebeli yer (dosya içinde bir kez aranır). */
let spot: THREE.Vector3 | null = null;
const place = (): THREE.Vector3 => (spot ??= forestSpot()).clone();

const dirOf = (hdg: number): THREE.Vector3 => new THREE.Vector3(Math.sin(hdg * DEG_R), 0, -Math.cos(hdg * DEG_R));
const rightOf = (f: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(-f.z, 0, f.x);

/** Me 262'ler (yapay zekâlı; çekimde elle uçar). */
function spawn262(w: World, team: number, pos: THREE.Vector3, hdg: number, n: number, spec = 'me262'): void {
  const far = pos.clone().addScaledVector(dirOf(hdg), 60000);
  w.spawnAirborneFlight(team, spec, n, pos.clone(), hdg, plan('cap', spec, { targetPos: far.setY(0), altitude: pos.y, patrolRadius: 3000, stationTime: 900 }), null);
}

const jets = (team: number, n: number) => (w: World): Subject | null => {
  const m = w.aircraft.filter((a) => a.team === team && a.spec.id.startsWith('me262'));
  return m.length >= n ? { ids: m.slice(0, n).map((a) => a.id) } : null;
};

/** Uçağı verilen konum ve yöne koyar (kanat adamı: öndekinin eksenine göre). */
function placeAt(a: Aircraft, pos: THREE.Vector3, q: THREE.Quaternion, fwd: THREE.Vector3, speed: number): void {
  a.pos.copy(pos);
  a.prevPos.copy(pos);
  a.quat.copy(q);
  a.prevQuat.copy(q);
  a.fwd.copy(fwd);
  a.speed = speed;
  a.controls.throttle = 1;
}

/** Öndekinin ekseninde nokta: left (+ sol), up, ahead (+ ileri). */
function rel(lead: Aircraft, left: number, up: number, ahead: number): THREE.Vector3 {
  const lf = new THREE.Vector3(0, 0, 1).applyQuaternion(lead.quat);
  const lu = new THREE.Vector3(0, 1, 0).applyQuaternion(lead.quat);
  const ll = new THREE.Vector3(1, 0, 0).applyQuaternion(lead.quat);
  return lead.pos.clone().addScaledVector(ll, left).addScaledVector(lu, up).addScaledVector(lf, ahead);
}

// --- 1 İkili kol: kamera öndekinin önünde, biraz sağında ve aşağısında, geriye bakar; arkadaki sol arka çaprazda, yukarıda
const K_IKILI = newKine();

// --- 2 Bombardıman kolunun üstünde: kamera jetin üstünde, aşağı bakar, sola dönerek jeti ortalayıp geçer
const K_BOMB = newKine();
const bomb0 = { t: -1, pos: new Map<number, THREE.Vector3>(), v: 85 };
const BOMB_ABOVE = 520;

// --- 3 Takla: öndeki (sol ön çapraz) ve arkadaki birlikte sağa tırmanıp yuvarlanır, sırt üstü dalışa geçer
const K_LEAD = newKine();
const K_WING = newKine();
const cam3 = { off: new THREE.Vector3(), y: new Damp3(0.7), ready: false };

/** Takla takvimi: 1,5 sn düz; çekiş (5 G) ve hafif sağ yatış; 4,2 sn'den sağa yuvarlanıp sırt üstü; sırt üstü çekiş. */
function loopStep(k: Kine, t: number, dt: number): void {
  if (t < 1.5) {
    kineStep(k, dt, 0, { alt: k.alt });
    return;
  }
  if (t < 4.2) {
    kineStep(k, dt, 25 * smooth01((t - 1.5) / 1.0), { n: 1 + 4 * smooth01((t - 1.5) / 0.6) });
    return;
  }
  const r = smooth01((t - 4.2) / 1.5);
  kineStep(k, dt, 25 + 150 * r, { n: 5 - 2 * r + 0.5 * smooth01((t - 5.7) / 0.8) });
}

export const ME262_TAKES: Take[] = [
  {
    id: 'me_ikili', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      spawn262(w, 0, p.setY(groundLevel(p.x, p.z) + 1800), 75, 2);
      K_IKILI.w = null;
    },
    trigger: jets(0, 2), offset: 0.2, maxWait: 20, duration: 7,
    shot: (c: TakeCtx) => {
      const lead = c.ac(c.s.ids[0])!;
      const wing = c.ac(c.s.ids[1]);
      if (K_IKILI.w !== c.w) {
        const p = place();
        kineStart(K_IKILI, c.w, p.setY(groundLevel(p.x, p.z) + 1800), 75, 205);
      }
      kineStep(K_IKILI, c.dt, 0, { alt: K_IKILI.alt });
      kineApply(lead, K_IKILI);
      // Arkadaki: 13 m solda, 16 m geride, 3,5 m yukarıda
      if (wing) placeAt(wing, rel(lead, 15, 5, -15), lead.quat, lead.fwd, lead.speed);
      return { ...c.d.wing(lead, { offset: [7, -4.2, 19], look: [-3.2, 1.0, -6], roll: 0.2, fov: 46 }), handheld: 0.5 };
    },
  },
  {
    id: 'me_bombaci', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS,
    setup: (w) => {
      const t = theater(w, { forward: false });
      const f = t.redFactory.pos;
      const alt = groundLevel(f.x, f.z) + 3800;
      const hdg = 85;
      const fd = dirOf(hdg);
      const rd = rightOf(fd);
      const start = f.clone().addScaledVector(fd, -42000).setY(alt);
      // Kalabalık kol: üç dokuzlu kutu, kademeli
      for (const [back, side, dy] of [[0, 0, 0], [450, -650, -120], [900, 600, 120]]) {
        const s = start.clone().addScaledVector(fd, -back).addScaledVector(rd, side);
        s.y += dy;
        w.spawnAirborneFlight(0, 'b17g', 9, s, hdg, plan('levelBomb', 'b17g', { targetStructureId: t.redFactory.id, altitude: alt }), t.blueMain);
      }
      spawn262(w, 1, start.clone().setY(alt + BOMB_ABOVE).addScaledVector(fd, -700), hdg, 1);
      K_BOMB.w = null;
    },
    trigger: jets(1, 1), offset: 2, maxWait: 20, duration: 7,
    shot: (c: TakeCtx) => {
      const a = c.ac(c.s.ids[0])!;
      a.gunAmmo.fill(0);
      // Kolun nişancıları ateş etmesin (jet menzillerine yakın uçuyor; çekim sessiz ve temiz kalsın)
      for (const b of c.w.aircraft) if (b.spec.id === 'b17g') for (const tr of b.turrets) tr.ammo = 0;
      if (K_BOMB.w !== c.w) {
        // Kolun ortasının 1,3 km üstünde, biraz gerisinde ve yanında; kolla aynı yönde, biraz hızlı
        const bs = c.w.aircraft.filter((b) => b.spec.id === 'b17g').slice(0, 9);
        const mid = bs.reduce((s, b) => s.add(b.pos), new THREE.Vector3()).divideScalar(Math.max(1, bs.length));
        const v = bs.length ? bs[0].speed : 85;
        const fd = dirOf(85);
        bomb0.t = c.t;
        bomb0.v = v;
        bomb0.pos.clear();
        for (const b of c.w.aircraft) if (b.spec.id === 'b17g') bomb0.pos.set(b.id, b.pos.clone());
        kineStart(K_BOMB, c.w, mid.clone().addScaledVector(fd, -350).addScaledVector(rightOf(fd), 180).setY(mid.y + BOMB_ABOVE), 85, v * 1.3);
      }
      kineStep(K_BOMB, c.dt, 0, { alt: K_BOMB.alt });
      kineApply(a, K_BOMB);
      const f = dirOf(85);
      // Bombacılar düz ve aynı hızda (yapay zekâ kutuyu toplarken yalpalıyordu)
      const qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0).cross(f).normalize(), new THREE.Vector3(0, 1, 0), f));
      for (const [id, p0] of bomb0.pos) {
        const b = c.ac(id);
        if (b) placeAt(b, p0.clone().addScaledVector(f, bomb0.v * (c.t - bomb0.t)), qb, f, bomb0.v);
      }
      const r = rightOf(f);
      const k = smooth01(c.t / 7);
      // Kamera jetin sağ önünden sol arkasına geçer (üstünde kalarak), jete bakar
      const pos = a.pos.clone().addScaledVector(r, 22 - 44 * k).addScaledVector(f, 20 - 40 * k).add(new THREE.Vector3(0, 30, 0));
      return { pos, look: a.pos.clone(), up: f.clone(), fov: 58, handheld: 0.35 };
    },
  },
  {
    id: 'me_takla', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      spawn262(w, 0, p.setY(groundLevel(p.x, p.z) + 1500), 75, 2);
      K_LEAD.w = null;
      cam3.ready = false;
    },
    trigger: jets(0, 2), offset: 0.2, maxWait: 20, duration: 6.8,
    shot: (c: TakeCtx) => {
      const lead = c.ac(c.s.ids[0])!;
      const wing = c.ac(c.s.ids[1])!;
      const t = Math.max(0, c.t);
      if (K_LEAD.w !== c.w) {
        const p = place();
        p.y = groundLevel(p.x, p.z) + 1500;
        kineStart(K_LEAD, c.w, p, 75, 195);
        // Arkadaki: öndekinin sağ arka çaprazında (öndeki onun sol ön çaprazında)
        const f = dirOf(75);
        kineStart(K_WING, c.w, p.clone().addScaledVector(rightOf(f), 15).addScaledVector(f, -17).add(new THREE.Vector3(0, -1, 0)), 75, 195);
        cam3.ready = false;
      }
      loopStep(K_LEAD, t, c.dt);
      loopStep(K_WING, t, c.dt);
      kineApply(lead, K_LEAD);
      kineApply(wing, K_WING);
      if (!cam3.ready) {
        const f = dirOf(75);
        cam3.off.copy(f).multiplyScalar(30).addScaledVector(rightOf(f), -22);
        cam3.y.reset();
        cam3.ready = true;
      }
      // Kamera yatayda öndekinin sol önünde kalır; dikeyde gecikerek izler ve yavaşça alçalır: kol tırmanınca altlarında kalır
      const yT = cam3.y.update(new THREE.Vector3(0, lead.pos.y + 2 - 40 * smooth01((t - 1.5) / 4.5), 0), c.dt).y;
      const pos = lead.pos.clone().add(cam3.off).setY(yT);
      const look = lead.pos.clone().lerp(wing.pos, 0.12);
      return { pos, look, fov: 42, handheld: 0.8 + 0.8 * smooth01((t - 1.5) / 1.5) };
    },
  },
];

// --- Bombardıman kutusu (elle, düz): yapay zekânın dizdiği dokuzlu kutu ilk karedeki yerinden aynı yönde sabit hızla gider
interface Box { t0: number; v: number; f: THREE.Vector3; q: THREE.Quaternion; pos: Map<number, THREE.Vector3>; free: Set<number> }
const newBox = (): Box => ({ t0: 0, v: 85, f: new THREE.Vector3(), q: new THREE.Quaternion(), pos: new Map(), free: new Set() });

/** Burun f yönünde, kanatlar yatay (üst yön burna dik: dik olmayan taban gövdeyi çarpıtıyordu, burun ile atış yönü ayrışıyordu). */
function levelQuat(f: THREE.Vector3): THREE.Quaternion {
  const left = new THREE.Vector3(0, 1, 0).cross(f).normalize();
  const up = f.clone().cross(left).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, f));
}

function boxStart(b: Box, c: TakeCtx, hdg: number): void {
  b.t0 = c.t;
  b.f.copy(dirOf(hdg));
  b.q.copy(levelQuat(b.f));
  b.pos.clear();
  b.free.clear();
  const bs = c.w.aircraft.filter((a) => a.spec.id === 'b17g');
  b.v = bs.length ? bs[0].speed : 85;
  for (const a of bs) b.pos.set(a.id, a.pos.clone());
}

function boxStep(b: Box, c: TakeCtx): void {
  for (const [id, p0] of b.pos) {
    if (b.free.has(id)) continue;
    const a = c.ac(id);
    if (a && a.status === 'flying') {
      placeAt(a, p0.clone().addScaledVector(b.f, b.v * (c.t - b.t0)), b.q, b.f, b.v);
      for (const tr of a.turrets) tr.ammo = 0;
    }
  }
}

function spawnBox(w: World, center: THREE.Vector3, hdg: number): void {
  const far = center.clone().addScaledVector(dirOf(hdg), 60000).setY(0);
  w.spawnAirborneFlight(0, 'b17g', 9, center.clone(), hdg, plan('cap', 'b17g', { targetPos: far, altitude: center.y, patrolRadius: 3000, stationTime: 900 }), null);
}

/** Kutunun en arkadaki uçağı (uçuş yönüne göre). */
function rearOf(b: Box, c: TakeCtx): Aircraft | undefined {
  let best: Aircraft | undefined;
  let bestS = Infinity;
  for (const id of b.pos.keys()) {
    const a = c.ac(id);
    if (!a) continue;
    const s = a.pos.dot(b.f);
    if (s < bestS) {
      bestS = s;
      best = a;
    }
  }
  return best;
}

function rollKeysLocal(keys: [number, number][]): (t: number) => number {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, a0] = keys[i];
      const [t1, a1] = keys[i + 1];
      if (t <= t1) return a0 + (a1 - a0) * smooth01((t - t0) / (t1 - t0));
    }
    return keys[keys.length - 1][1];
  };
}

// --- 4 Üçlü, yoğuşma izli: öndeki kamera ortadakini ortalar; sağdaki sağa, soldaki biraz sonra sola yuvarlanıp aşağı ayrılır
const K4 = [newKine(), newKine(), newKine()];
const TRIO_ALT = 9000;

// --- 5 Saldırı: jet kutunun en arkadakine arkadan, yukarıdan hafif dalışla ateş eder; bombacı dumanlanır, kanadı kopar
const BOX5 = newBox();
const atk = { target: -1, killed: false, last: 0, prev: new THREE.Vector3() };
const KILL_AT = 3.2;

// --- 6 Kutunun altında: jet sağa hafif yatıkken düzelir; kamera sol altında, sallantılı, ortalamaz
const BOX6 = newBox();
const K6 = newKine();
const ROLL6 = rollKeysLocal([[0, 24], [2.8, 0]]);

type Killer = { kill(target: Aircraft, cause: string, attacker: Aircraft | null, sourceName: string, sourceTeam: number, explode?: boolean): void };

ME262_TAKES.push(
  {
    id: 'me_uclu', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 8,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      spawn262(w, 0, p.setY(TRIO_ALT), 75, 3);
      K4[0].w = null;
    },
    trigger: jets(0, 3), offset: 0.2, maxWait: 20, duration: 6.5,
    shot: (c: TakeCtx) => {
      const [mid, left, right] = c.s.ids.map((id) => c.ac(id)!);
      const f = dirOf(75);
      const r = rightOf(f);
      if (K4[0].w !== c.w) {
        const p = place().setY(TRIO_ALT);
        kineStart(K4[0], c.w, p, 75, 215);
        kineStart(K4[1], c.w, p.clone().addScaledVector(r, -19).addScaledVector(f, -2).add(new THREE.Vector3(0, 1.5, 0)), 75, 215);
        kineStart(K4[2], c.w, p.clone().addScaledVector(r, 19).addScaledVector(f, -3).add(new THREE.Vector3(0, -1, 0)), 75, 215);
      }
      const t = c.t;
      kineStep(K4[0], c.dt, 0, { alt: K4[0].alt });
      // Sağdaki 2,0 sn'de sağa, soldaki 2,4 sn'de sola (biraz farklı hız ve açıyla): tırmanmadan yatıp aşağı döner
      const kr = smooth01((t - 2.0) / 1.1);
      const kl = smooth01((t - 2.4) / 1.25);
      if (t < 2.0) kineStep(K4[2], c.dt, 0, { alt: K4[2].alt });
      else kineStep(K4[2], c.dt, 118 * kr, { n: 1 + 1.3 * smooth01((t - 2.1) / 0.9) });
      if (t < 2.4) kineStep(K4[1], c.dt, 0, { alt: K4[1].alt });
      else kineStep(K4[1], c.dt, -108 * kl, { n: 1 + 1.15 * smooth01((t - 2.5) / 1.0) });
      kineApply(mid, K4[0]);
      kineApply(left, K4[1]);
      kineApply(right, K4[2]);
      // Kamera önde, biraz uzakta, çok az alçakta; ortadakine bakar
      const pos = mid.pos.clone().addScaledVector(f, 78).add(new THREE.Vector3(0, -4, 0));
      return { pos, look: mid.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), fov: 62, handheld: 0.5 };
    },
  },
  {
    id: 'me_saldiri', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 1,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 4300;
      spawnBox(w, p, 75);
      spawn262(w, 0, p.clone().addScaledVector(dirOf(75), -900).add(new THREE.Vector3(0, 120, 0)), 75, 1);
      atk.target = -1;
    },
    trigger: jets(0, 1), offset: 3, maxWait: 20, duration: 7,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      if (atk.target < 0 || !c.ac(atk.target)) {
        boxStart(BOX5, c, 75);
        atk.target = rearOf(BOX5, c)?.id ?? -1;
        atk.killed = false;
        atk.last = -1;
        atk.prev.set(0, 0, 0);
      }
      boxStep(BOX5, c);
      const tg = c.ac(atk.target)!;
      const f = BOX5.f;
      const r = rightOf(f);
      const t = c.t;
      // Kutudaki yerinden ilerlerken: jet arkadan ve yukarıdan yaklaşır, geçişte üstünden aşar
      const base = BOX5.pos.get(atk.target)!.clone().addScaledVector(f, BOX5.v * (t - BOX5.t0));
      const k = smooth01(t / KILL_AT);
      const k2 = smooth01((t - KILL_AT) / 2.6);
      const back = -230 + 160 * k + 110 * k2;
      const up = 95 - 67 * k + 22 * k2;
      const p = base.clone().addScaledVector(f, back).addScaledVector(r, 9).add(new THREE.Vector3(0, up, 0));
      const vel = atk.prev.lengthSq() > 0 ? p.clone().sub(atk.prev).divideScalar(c.dt) : f.clone().multiplyScalar(BOX5.v + 40);
      atk.prev.copy(p);
      // Burun ateş ederken bombacıda, sonra uçuş yönünde
      const aimF = leadPoint(p, tg.pos, f.clone().multiplyScalar(BOX5.v), me.guns[0].muzzleVel).sub(p).normalize();
      const fwd = vel.clone().normalize().lerp(aimF, 1 - smooth01((t - KILL_AT + 0.1) / 1.2)).normalize();
      placeAt(me, p, levelQuat(fwd), fwd, vel.length());
      // Ateş: 0,6–4,2 sn; izli mermiler (dost takım: hasarı çekim verir) ve isabet kıvılcımları
      const firing = t > 0.3 && t < KILL_AT - 0.2;
      me.firing = firing;
      if (firing && t - atk.last >= 1 / 11) {
        atk.last = t;
        fireNose(c, me, p.clone().addScaledVector(fwd, 4.5), fwd);
        if (t > 1.0 && Math.random() < 0.35) {
          c.w.events.push({ kind: 'hit', pos: tg.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 6)) });
        }
      }
      // Bombacı: önce bir motoru, sonra ikincisi dumanlanır; 4,6 sn'de kanadı kopar (yuvarlanarak düşer, kanat parçası)
      if (!atk.killed && tg.status === 'flying') {
        // Video boyunca duman: bir motoru baştan yanık, ikincisi ateşle
        tg.damage.engines[1] = Math.max(tg.damage.engines[1], 0.8);
        if (t > 1.2) tg.damage.engines[0] = Math.max(tg.damage.engines[0], 0.6);
        if (t >= KILL_AT) {
          atk.killed = true;
          BOX5.free.add(tg.id);
          (c.w as unknown as Killer).kill(tg, 'kanat koptu', null, 'Me 262', 1, false);
        }
      }
      // Kamera: jetin sağ arkasında, onunla aynı yükseklikte; bakış jetle bombacının arasında (ikisi de kadrajda, ortada
      // değil), sonra yarı yarıya ufka döner (jet kadrajda kalır)
      const cam = me.pos.clone().addScaledVector(r, 8).addScaledVector(f, -14).add(new THREE.Vector3(0, 4, 0));
      const kh = smooth01((t - 3.0) / 3.5);
      const dMe = me.pos.clone().sub(cam).normalize();
      const dTg = tg.pos.clone().sub(cam).normalize();
      const dHz = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 12 * DEG_R).add(new THREE.Vector3(0, -0.06, 0)).normalize();
      const dir = dMe.clone().multiplyScalar(0.42).addScaledVector(dTg, 0.58).normalize().lerp(dMe.clone().add(dHz).normalize(), kh).normalize();
      const look = cam.clone().addScaledVector(dir, 100);
      const upv = new THREE.Vector3(0, 1, 0).applyAxisAngle(dir, (-6 - 14 * kh) * DEG_R);
      return { pos: cam, look, up: upv, fov: 60, handheld: 0.9 };
    },
  },
  {
    id: 'me_alttan', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 1,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 4300;
      spawnBox(w, p, 75);
      spawn262(w, 0, p.clone().addScaledVector(dirOf(75), -700).add(new THREE.Vector3(0, -330, 0)), 75, 1);
      K6.w = null;
    },
    trigger: jets(0, 1), offset: 3, maxWait: 20, duration: 6,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      if (K6.w !== c.w) {
        boxStart(BOX6, c, 75);
        const bs = [...BOX6.pos.values()];
        const mid = bs.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(Math.max(1, bs.length));
        kineStart(K6, c.w, mid.clone().addScaledVector(BOX6.f, -520).addScaledVector(rightOf(BOX6.f), 6).add(new THREE.Vector3(0, -180, 0)), 75, BOX6.v * 1.25);
      }
      boxStep(BOX6, c);
      kineStep(K6, c.dt, ROLL6(c.t), { alt: K6.alt });
      kineApply(me, K6);
      const f = BOX6.f;
      const r = rightOf(f);
      // Kamera jetin sol altında (yatışla dönmez), sallantılı; bakış jetin önüne ve yukarısına (bombacılar kadrajda)
      const cam = me.pos.clone().addScaledVector(r, -12).addScaledVector(f, -22).add(new THREE.Vector3(0, -6, 0));
      const bs = [...BOX6.pos.keys()].map((id) => c.ac(id)).filter((a): a is Aircraft => !!a);
      const box = bs.reduce((sum, a) => sum.add(a.pos), new THREE.Vector3()).divideScalar(Math.max(1, bs.length));
      const dir = me.pos.clone().sub(cam).normalize().multiplyScalar(0.72).addScaledVector(box.sub(cam).normalize(), 0.28).normalize();
      return { pos: cam, look: cam.clone().addScaledVector(dir, 100), fov: 62, handheld: 2.2 };
    },
  },
);

// --- Ortak: yatışlı yön, nişancı ateşi (yalnız görüntü), en yakın uçak ------------------------------------------------

/** Burun f yönünde, phi derece sağa yatık. */
function bankQuat(f: THREE.Vector3, phiDeg: number): THREE.Quaternion {
  const left0 = new THREE.Vector3(0, 1, 0).cross(f).normalize();
  const up0 = f.clone().cross(left0).normalize();
  const phi = phiDeg * DEG_R;
  // Sağa yatış: üst yön sağa (−left) döner
  const up = up0.clone().multiplyScalar(Math.cos(phi)).addScaledVector(left0, -Math.sin(phi)).normalize();
  const left = up.clone().cross(f).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, f));
}

/**
 * Bombacı nişancıları ateş eder (dost takım: mermiler kimseye zarar vermez): seçilen taretlerden hedefin çevresine,
 * ıskalayan izli mermiler; taretin ağzında alev ve ses (firing).
 */
const gunState = new Map<number, number>();
function gunnersFire(c: TakeCtx, b: Aircraft, at: THREE.Vector3, turrets: number[]): void {
  const last = gunState.get(b.id) ?? -1e9;
  for (const [i, tr] of b.turrets.entries()) tr.firing = turrets.includes(i);
  if (c.t - last < 0.075) return;
  gunState.set(b.id, c.t);
  const i = turrets[Math.floor(Math.random() * turrets.length)];
  const tr = b.turrets[i];
  if (!tr) return;
  const o = tr.spec.offset;
  const from = b.pos.clone().add(new THREE.Vector3(o[0], o[1], o[2]).applyQuaternion(b.quat));
  const miss = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(14 + Math.random() * 22);
  c.w.spawnGunRound(b, tr.gun, from, at.clone().add(miss).sub(from).normalize());
}

/** Önlemeli nişan noktası: mermi uçuş süresi sonunda hedefin olacağı yer, düşüş payı kadar yukarı. */
function leadPoint(from: THREE.Vector3, tgPos: THREE.Vector3, tgVel: THREE.Vector3, mv: number): THREE.Vector3 {
  const tof = tgPos.distanceTo(from) / mv;
  return tgPos.clone().addScaledVector(tgVel, tof).add(new THREE.Vector3(0, 4.9 * tof * tof, 0));
}

/** Burundan atış: mermi burun ekseninde çıkar (top uçağa sabit). Nişan, burnu nişan noktasına çevirerek alınır. */
function fireNose(c: TakeCtx, ac: Aircraft, muzzle: THREE.Vector3, nose: THREE.Vector3): void {
  c.w.spawnGunRound(ac, ac.guns[0], muzzle, nose.clone().normalize());
}

/** Kutudaki uçaklar, verilen noktaya yakından uzağa. */
function nearest(b: Box, c: TakeCtx, p: THREE.Vector3): Aircraft[] {
  return [...b.pos.keys()].map((id) => c.ac(id)).filter((a): a is Aircraft => !!a && a.status === 'flying')
    .sort((x, y) => x.pos.distanceTo(p) - y.pos.distanceTo(p));
}

/** Kameradan iki noktaya bakış yönlerinin ağırlıklı karışımı (ikisi de kadrajda, ortada değil). */
function mixLook(cam: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, wa: number): THREE.Vector3 {
  const d = a.clone().sub(cam).normalize().multiplyScalar(wa).addScaledVector(b.clone().sub(cam).normalize(), 1 - wa).normalize();
  return cam.clone().addScaledVector(d, 100);
}

// --- 7 Yakından: jet sola yatık, öndeki bombacıya ateş eder; bombacı dumanlanır, kanadı kopar; nişancılar karşılık verir
const BOX7 = newBox();
const s7 = { target: -1, last: 0, killed: false };
const KILL7 = 2.6;

// --- 8 Karanlık: güneşe karşı, yoğun bulut ve dumanlı bombacılar; kamera jetin sol kuyruk yanından sol arkasına geçer
const BOX8 = newBox();
const HDG8 = (sunAt(DAWN).azimuth + 180 + 360) % 360;
const s8 = { jet0: new THREE.Vector3(), t0: 0, v: 100, hit: -1, last: 0 };

const mist: { group: THREE.Group | null } = { group: null };
let mistTex: THREE.Texture | null = null;
function mistTexture(): THREE.Texture {
  if (mistTex) return mistTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  mistTex = new THREE.CanvasTexture(cv);
  return mistTex;
}
/** Jetin yolunda bulut tülleri: kayıt boyunca geçeceği yerde, yolun iki yanına ve üstüne-altına dağılmış. */
function placeMist(from: THREE.Vector3, f: THREE.Vector3, v: number): void {
  const g = mist.group;
  if (!g) return;
  g.clear();
  const r = rightOf(f);
  const rnd = (i: number, k: number) => {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 26; i++) {
    const along = 60 + i * v * 0.32;
    const m = new THREE.SpriteMaterial({ map: mistTexture(), color: 0xd9d4d6, transparent: true, depthWrite: false, fog: false, opacity: 0.35 + 0.3 * rnd(i, 1) });
    const sp = new THREE.Sprite(m);
    const size = 35 + 70 * rnd(i, 2);
    sp.scale.set(size * 1.6, size, 1);
    sp.position.copy(from).addScaledVector(f, along).addScaledVector(r, (rnd(i, 3) - 0.5) * 70).add(new THREE.Vector3(0, (rnd(i, 4) - 0.5) * 30, 0));
    g.add(sp);
  }
}

// --- 9 Yoğuşma izli iki U4: S çizerek gelir, birbirinden bağımsız sağa yuvarlanır; arkadaki dalar, öndeki daha çok sağa
const K9 = [newKine(), newKine()];
const cam9 = { pos: new THREE.Vector3(), f: new THREE.Vector3(), aim: new Damp3(0.25), ready: false };
const ALT9 = 9000;

ME262_TAKES.push(
  {
    id: 'me_yakin', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 1,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 4500;
      spawnBox(w, p, 75);
      spawn262(w, 0, p.clone().addScaledVector(dirOf(75), -900).add(new THREE.Vector3(0, 60, 0)), 75, 1);
      s7.target = -1;
    },
    trigger: jets(0, 1), offset: 3, maxWait: 20, duration: 6,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      if (s7.target < 0 || !c.ac(s7.target)) {
        boxStart(BOX7, c, 75);
        s7.target = rearOf(BOX7, c)?.id ?? -1;
        s7.killed = false;
        s7.last = -1;
        gunState.clear();
      }
      boxStep(BOX7, c);
      const tg = c.ac(s7.target)!;
      const f = BOX7.f;
      const r = rightOf(f);
      const t = c.t;
      const base = BOX7.pos.get(s7.target)!.clone().addScaledVector(f, BOX7.v * (t - BOX7.t0));
      // Jet hedefin sol arkasında, biraz yukarıda; yaklaşır, sonra sola kırıp uzaklaşır
      const k = smooth01(t / 3);
      const k2 = smooth01((t - 2.8) / 3);
      const p = base.clone().addScaledVector(f, -80 + 32 * k + 6 * k2).addScaledVector(r, -18 - 4 * k - 10 * k2).add(new THREE.Vector3(0, -42 + 26 * k + 4 * k2, 0));
      const aimF = leadPoint(p, tg.pos, f.clone().multiplyScalar(BOX7.v), me.guns[0].muzzleVel).sub(p).normalize();
      const away = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 14 * DEG_R);
      const fwd = aimF.clone().lerp(away, k2).normalize();
      const bank = -18 - 30 * smooth01((t - 0.5) / 4.5);
      placeAt(me, p, bankQuat(fwd, bank), fwd, BOX7.v + 30);
      // Dört MK 108: 0,3–2,8 sn, izli mermiler ve isabet kıvılcımları
      const firing = t > 0.3 && t < 2.8;
      me.firing = firing;
      if (firing && t - s7.last >= 1 / 14) {
        s7.last = t;
        fireNose(c, me, p.clone().addScaledVector(fwd, 4.5), fwd);
        if (t > 0.6 && Math.random() < 0.45) c.w.events.push({ kind: 'hit', pos: tg.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 6)) });
      }
      if (!s7.killed && tg.status === 'flying') {
        if (t > 0.7) tg.damage.engines[1] = Math.max(tg.damage.engines[1], 0.8);
        if (t > 1.6) tg.damage.engines[2] = Math.max(tg.damage.engines[2], 0.7);
        if (t >= KILL7) {
          s7.killed = true;
          BOX7.free.add(tg.id);
          (c.w as unknown as Killer).kill(tg, 'kanat koptu', null, 'Me 262', 1, false);
          c.w.events.push({ kind: 'debris', pos: tg.pos.clone(), vel: f.clone().multiplyScalar(BOX7.v * 0.8), count: 3, size: 1.6, burning: true });
        }
      }
      // Nişancılar: hedef ve yanındaki iki uçak, ilk 3,5 sn
      if (t < 3.5) for (const b of nearest(BOX7, c, me.pos).slice(0, 3)) gunnersFire(c, b, me.pos, [0, 1, 2, 3, 4, 5].filter((i) => i < b.turrets.length));
      else for (const b of nearest(BOX7, c, me.pos)) for (const tr of b.turrets) tr.firing = false;
      // Kamera jetin sağ arka altında, ona yakın; jetle bombacının arasına bakar, jetin yatışının bir kısmı kameraya geçer
      const cam = me.pos.clone().addScaledVector(r, 9).addScaledVector(f, -19).add(new THREE.Vector3(0, -7, 0));
      const look = mixLook(cam, me.pos, tg.pos, 0.5 + 0.22 * smooth01((t - KILL7) / 1.5));
      const view = look.clone().sub(cam).normalize();
      return { pos: cam, look, up: new THREE.Vector3(0, 1, 0).applyAxisAngle(view, bank * 0.25 * DEG_R), fov: 62, handheld: 0.8 };
    },
  },
  {
    id: 'me_karanlik', map: 'anakara', seed: SEED, clock: DAWN, clouds: 1, warm: 5,
    decorate: (g) => {
      mist.group = g;
    },
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 4500;
      spawnBox(w, p, HDG8);
      spawn262(w, 0, p.clone().addScaledVector(dirOf(HDG8), -900).add(new THREE.Vector3(0, -60, 0)), HDG8, 1);
      s8.hit = -1;
    },
    trigger: jets(0, 1), offset: 3, maxWait: 20, duration: 6.5,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      const f = dirOf(HDG8);
      const r = rightOf(f);
      if (s8.hit < 0 || !c.ac(s8.hit)) {
        boxStart(BOX8, c, HDG8);
        const rear = rearOf(BOX8, c)!;
        s8.jet0.copy(rear.pos).addScaledVector(f, -150).add(new THREE.Vector3(0, -3, 0));
        placeMist(s8.jet0, f, BOX8.v * 1.06);
        s8.t0 = c.t;
        s8.v = BOX8.v * 1.06;
        // Dumanlı bombacılar: en yakın dördünün motorları yanık; en yakını vurulmuş (kıvılcım, parça)
        const near = nearest(BOX8, c, s8.jet0);
        near.slice(0, 7).forEach((b, i) => {
          b.damage.engines[i % 4] = 0.8;
          b.damage.engines[(i + 1) % 4] = 0.5;
        });
        s8.hit = near[0]?.id ?? -1;
        s8.last = -1;
        gunState.clear();
      }
      boxStep(BOX8, c);
      const t = c.t;
      const p = s8.jet0.clone().addScaledVector(f, s8.v * (t - s8.t0));
      const bank = 16 - 9 * smooth01(t / 6);
      placeAt(me, p, bankQuat(f, bank), f, s8.v);
      const hit = c.ac(s8.hit);
      if (hit && t - s8.last > 0.22) {
        s8.last = t;
        c.w.events.push({ kind: 'hit', pos: hit.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 8)) });
        if (Math.random() < 0.3) c.w.events.push({ kind: 'debris', pos: hit.pos.clone(), vel: f.clone().multiplyScalar(BOX8.v * 0.85), count: 1, size: 0.8, burning: Math.random() < 0.5 });
      }
      for (const b of nearest(BOX8, c, me.pos).slice(0, 3)) gunnersFire(c, b, me.pos, [0, 1, 2, 3, 4, 5].filter((i) => i < b.turrets.length));
      // Kamera: önce jetin sol kuyruk yanında (ileri ve sağa bakar), sonra sol arkasında (ileri ve yukarı, kutuya)
      // Kamera jetin sol ön çaprazında, yakın; jete (biraz arkasına) bakar: arkada güneş, jet siluet
      const k = smooth01(t / 6.5);
      const cam = p.clone().addScaledVector(f, 15 - 3 * k).addScaledVector(r, -9 - 1.5 * k).add(new THREE.Vector3(0, 1.2 - 1.5 * k, 0));
      const look = p.clone().addScaledVector(f, -2).add(new THREE.Vector3(0, 0.4, 0));
      return { pos: cam, look, fov: 56, handheld: 1.4 };
    },
  },
  {
    id: 'me_iz', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 10,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      spawn262(w, 0, p.setY(ALT9), 75, 2, 'me262u4');
      K9[0].w = null;
      cam9.ready = false;
    },
    trigger: jets(0, 2), offset: 0.2, maxWait: 20, duration: 4,
    shot: (c: TakeCtx) => {
      const [front, rear] = c.s.ids.map((id) => c.ac(id)!);
      const f = dirOf(75);
      const r = rightOf(f);
      if (K9[0].w !== c.w) {
        const p = place().setY(ALT9);
        kineStart(K9[1], c.w, p, 75, 210);
        kineStart(K9[0], c.w, p.clone().addScaledVector(f, 38).addScaledVector(r, -24).add(new THREE.Vector3(0, 4, 0)), 75, 210);
        cam9.ready = false;
      }
      const t = c.t;
      // S'ler (ısınmada izi dalgalandırır), sonra bağımsız kırılış: arkadaki 0,8 sn'de sağa 130° ve çekiş (tam dalış),
      // öndeki 1,5 sn'de sağa 78° ve daha hafif çekiş (daha çok sağa döner)
      const weave = (_ph: number, _amp: number) => 0;
      const kr = smooth01((t - 0.8) / 1.0);
      const kf = smooth01((t - 1.5) / 1.2);
      if (t < 0.8) kineStep(K9[1], c.dt, weave(0.35, 28), { alt: K9[1].alt });
      else kineStep(K9[1], c.dt, 130 * kr, { n: 1 + 2.6 * smooth01((t - 0.9) / 0.8) });
      if (t < 1.5) kineStep(K9[0], c.dt, weave(0, 32), { alt: K9[0].alt });
      else kineStep(K9[0], c.dt, 78 * kf, { n: 1 + 1.5 * smooth01((t - 1.6) / 0.9) });
      kineApply(front, K9[0]);
      kineApply(rear, K9[1]);
      // Isınmada yanal S (yoğuşma izi dalgalı kalır); kayıt başlarken söner
      const fade = 1 - smooth01((t + 1.2) / 1.2);
      if (fade > 0) {
        front.pos.addScaledVector(r, 34 * Math.sin((2 * Math.PI * t) / 2.4) * fade);
        rear.pos.addScaledVector(r, 30 * Math.sin((2 * Math.PI * (t + 0.5)) / 2.6) * fade);
        front.prevPos.copy(front.pos);
        rear.prevPos.copy(rear.pos);
      }
      // Kamera kolun önünde ve çok altında, onlardan yavaş ilerler (uzak odak); ikisinin arasına hafif gecikmeyle bakar
      if (!cam9.ready) {
        // Kayıt başında (t = 0) 520 m önde olsun: ısınmada kol kameraya saniyede 60 m yaklaşır
        cam9.pos.copy(rear.pos).addScaledVector(f, 520 + 60 * Math.max(0, -t)).addScaledVector(r, 45).add(new THREE.Vector3(0, -18, 0));
        cam9.f.copy(f);
        cam9.aim.reset();
        cam9.ready = true;
      }
      cam9.pos.addScaledVector(cam9.f, 150 * c.dt);
      const mid = front.pos.clone().add(rear.pos).multiplyScalar(0.5);
      const look = mid.clone();
      return { pos: cam9.pos.clone(), look, fov: 15 + 24 * smooth01((t - 1.0) / 2.2), handheld: 1 };
    },
  },
);

// --- 10 Yandan: jet bombacıya yandan, biraz alttan ve uzaktan ateş eder, giderek sola yatar; bombacı dumanlanıp patlar
const BOX10 = newBox();
const s10 = { target: -1, last: 0, killed: false, ready: false, lastPos: new THREE.Vector3() };
const BOOM10 = 3.9;

// --- 11 Eskort: jet hafif tırmanan düşman avcısını kovalar ve ateş eder (vuramaz); bulutlu
const s11 = { p: new THREE.Vector3(), f: new THREE.Vector3(), yaw: 0, last: 0, ready: false };
const K11 = newKine();

// --- 12 Kafa kafaya: jet yukarıdan avcıya dalar, avcı aşağıdan jete tırmanır; ikisi de ateş eder, havada patlayan mermiler
const s12 = { t0: 0, me0: new THREE.Vector3(), en0: new THREE.Vector3(), dMe: new THREE.Vector3(), dEn: new THREE.Vector3(), last: 0, lastE: 0, ready: false };

/** Elle uçan tek avcı (dost takım: kimse kimseye zarar vermez). */
function spawnFighter(w: World, spec: string, pos: THREE.Vector3, hdg: number): void {
  const far = pos.clone().addScaledVector(dirOf(hdg), 60000).setY(0);
  w.spawnAirborneFlight(0, spec, 1, pos.clone(), hdg, plan('cap', spec, { targetPos: far, altitude: pos.y, patrolRadius: 3000, stationTime: 900 }), null);
}
const pair = (a: string, b: string) => (w: World): Subject | null => {
  const x = w.aircraft.find((p) => p.spec.id === a);
  const y = w.aircraft.find((p) => p.spec.id === b);
  return x && y ? { ids: [x.id, y.id] } : null;
};

ME262_TAKES.push(
  {
    id: 'me_yandan', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 1,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 4500;
      spawnBox(w, p, 75);
      spawn262(w, 0, p.clone().addScaledVector(dirOf(75), -900).add(new THREE.Vector3(0, -150, 0)), 75, 1);
      s10.target = -1;
      s10.ready = false;
    },
    trigger: jets(0, 1), offset: 3, maxWait: 20, duration: 6,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      const f = dirOf(75);
      const r = rightOf(f);
      if (!s10.ready) {
        s10.ready = true;
        boxStart(BOX10, c, 75);
        // Hedef: kutunun sol kenarındaki (jete bakan) uçak
        let best: Aircraft | undefined;
        for (const id of BOX10.pos.keys()) {
          const a = c.ac(id);
          if (a && (!best || a.pos.dot(r) < best.pos.dot(r))) best = a;
        }
        s10.target = best?.id ?? -1;
        s10.killed = false;
        s10.last = -1;
      }
      boxStep(BOX10, c);
      const t = c.t;
      const p0 = BOX10.pos.get(s10.target);
      const base = (p0 ? p0.clone() : me.pos.clone()).addScaledVector(f, BOX10.v * (t - BOX10.t0));
      // Patlayan bombacı dünyadan silinir: son yeri kalır
      const tgA = c.ac(s10.target);
      if (tgA) s10.lastPos.copy(tgA.pos);
      const tg = tgA ?? me;
      // Jet hedefin solunda ~230 m, biraz gerisinde ve 80 m altında; yavaşça yaklaşır
      const p = base.clone().addScaledVector(r, -235 + 40 * smooth01(t / 6)).addScaledVector(f, -70 + 25 * smooth01(t / 6)).add(new THREE.Vector3(0, -85, 0));
      const lead = leadPoint(p, tgA && tgA.status === 'flying' ? tgA.pos : base, f.clone().multiplyScalar(BOX10.v), me.guns[0].muzzleVel);
      const fwd = lead.clone().sub(p).normalize();
      const bank = -8 - 50 * smooth01(t / 6);
      placeAt(me, p, bankQuat(fwd, bank), fwd, BOX10.v + 10);
      const firing = t > 0.4 && t < BOOM10 - 0.2 && !!tgA;
      me.firing = firing;
      if (firing && t - s10.last >= 1 / 14) {
        s10.last = t;
        fireNose(c, me, p.clone().addScaledVector(fwd, 4.5), fwd);
        if (t > 0.8 && Math.random() < 0.4) c.w.events.push({ kind: 'hit', pos: tg.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 6)) });
      }
      if (tgA && !s10.killed && tg.status === 'flying') {
        tg.damage.engines[0] = Math.max(tg.damage.engines[0], 0.8);
        if (t > 1.5) tg.damage.engines[1] = Math.max(tg.damage.engines[1], 0.7);
        if (t > 2.6) tg.damage.engines[2] = Math.max(tg.damage.engines[2], 0.6);
        if (t >= BOOM10) {
          s10.killed = true;
          BOX10.free.add(tg.id);
          (c.w as unknown as Killer).kill(tg, 'yakıt deposu infilak etti', null, 'Me 262', 1, true);
        }
      }
      // Kamera jetin arkasında, biraz altında ve hafif sağında; kimseyi ortalamaz
      const cam = p.clone().addScaledVector(fwd, -17).addScaledVector(r, 3.5).add(new THREE.Vector3(0, -4.5, 0));
      const look = mixLook(cam, me.pos, tgA && tgA.status === 'flying' ? tgA.pos : base, 0.5);
      const view = look.clone().sub(cam).normalize();
      return { pos: cam, look, up: new THREE.Vector3(0, 1, 0).applyAxisAngle(view, bank * 0.3 * DEG_R), fov: 60, handheld: 0.7 };
    },
  },
  {
    id: 'me_eskort', map: 'anakara', seed: SEED, clock: DAWN, clouds: 1, warm: 1,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 3200;
      spawnFighter(w, 'p51d', p, 75);
      spawn262(w, 0, p.clone().addScaledVector(dirOf(75), -400).add(new THREE.Vector3(0, -40, 0)), 75, 1);
      s11.ready = false;
    },
    trigger: pair('me262', 'p51d'), offset: 1, maxWait: 20, duration: 5,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      const en = c.ac(c.s.ids[1])!;
      const f = dirOf(75);
      const t = c.t;
      if (!s11.ready) {
        // Düşman jetin 420 m önünde, 150 m sağında, biraz yukarıda; jetin uçuş yönüne dik, soluna doğru uçar
        const e0 = me.pos.clone().addScaledVector(f, 720).addScaledVector(rightOf(f), 230).add(new THREE.Vector3(0, 30, 0));
        // Jetin yönünden 55° sola açılı (önünden sağdan sola geçer)
        const left = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 55 * DEG_R);
        kineStart(K11, c.w, e0, Math.atan2(left.x, -left.z) / DEG_R, 150);
        s11.p.copy(me.pos);
        s11.f.copy(f);
        s11.yaw = 0;
        s11.last = -1;
        s11.ready = true;
      }
      // Düşman: 1,4 sn düz, sonra çekerek yukarı kıvrılır (jetten bakınca sola gidip yukarı döner)
      if (t < 1.4) kineStep(K11, c.dt, 0, { alt: K11.alt });
      else kineStep(K11, c.dt, 0, { n: 1 + 3.6 * smooth01((t - 1.4) / 1.2) });
      kineApply(en, K11);
      en.gunAmmo.fill(0);
      // Jet: düşmanın biraz önüne döner (sınırlı dönüş hızı), yetişmeye çalışır; dönüş yönüne yatar, burnu kalkar
      const lead = en.pos.clone().addScaledVector(K11.f, K11.v * 0.3);
      const want = lead.sub(s11.p).normalize();
      const f0 = s11.f.clone();
      s11.f.lerp(want, 1 - Math.exp(-c.dt * 0.65)).normalize();
      const yawRate = Math.atan2(f0.x * s11.f.z - f0.z * s11.f.x, f0.x * s11.f.x + f0.z * s11.f.z) / c.dt;
      s11.yaw += (yawRate - s11.yaw) * (1 - Math.exp(-c.dt * 4));
      s11.p.addScaledVector(s11.f, 195 * c.dt);
      const p = s11.p.clone();
      const fwd = s11.f.clone();
      const bank = Math.max(-38, Math.min(38, s11.yaw * 110));
      placeAt(me, p, bankQuat(fwd, bank), fwd, 195);
      const firing = (t > 1.0 && t < 2.3) || (t > 3.0 && t < 4.4);
      me.firing = firing;
      if (firing && t - s11.last >= 1 / 14) {
        s11.last = t;
        // Burun düşmana yakın bakar (önleme az): mermiler ona doğru gider, ıskalar
        fireNose(c, me, p.clone().addScaledVector(fwd, 4.5), fwd);
      }
      // Kamera jetin sağ arkasında, biraz altında
      const r = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
      const cam = p.clone().addScaledVector(fwd, -15).addScaledVector(r, 10).add(new THREE.Vector3(0, -3.5, 0));
      return { pos: cam, look: mixLook(cam, me.pos, en.pos, 0.45), fov: 60, handheld: 0.9 };
    },
  },
  {
    id: 'me_kafa', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 1,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 3000;
      spawnFighter(w, 'p51d', p.clone().addScaledVector(dirOf(255), -100), 255);
      spawn262(w, 0, p.clone().addScaledVector(dirOf(75), -900).add(new THREE.Vector3(0, 350, 0)), 75, 1);
      s12.ready = false;
    },
    trigger: pair('me262', 'p51d'), offset: 1, maxWait: 20, duration: 2.05, fxDist: 14,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      const en = c.ac(c.s.ids[1])!;
      const f = dirOf(75);
      const t = c.t;
      if (!s12.ready) {
        // Takvim kayıt başına (t = 0) göre: karşılaşma kayıt başladıktan 2,2 sn sonra
        s12.t0 = 0;
        // Karşılaşma noktası: 2,6 sn sonra; jet 22° dalışla 200 m/sn, avcı 12° tırmanışla 165 m/sn gelir; avcı jetin
        // 14 m solundan ve 9 m altından geçer
        const meet = place();
        meet.y = groundLevel(meet.x, meet.z) + 3000;
        s12.dMe.copy(f).multiplyScalar(Math.cos(22 * DEG_R)).add(new THREE.Vector3(0, -Math.sin(22 * DEG_R), 0)).normalize();
        s12.dEn.copy(f).negate().multiplyScalar(Math.cos(12 * DEG_R)).add(new THREE.Vector3(0, Math.sin(12 * DEG_R), 0)).normalize();
        s12.me0.copy(meet).addScaledVector(s12.dMe, -160 * 2.2);
        s12.en0.copy(meet).addScaledVector(rightOf(f), -14).add(new THREE.Vector3(0, -9, 0)).addScaledVector(s12.dEn, -125 * 2.2);
        s12.last = -1;
        s12.lastE = -1;
        s12.ready = true;
      }
      const k = t - s12.t0;
      const p = s12.me0.clone().addScaledVector(s12.dMe, 160 * k);
      const ep = s12.en0.clone().addScaledVector(s12.dEn, 125 * k);
      placeAt(me, p, bankQuat(s12.dMe, 4), s12.dMe, 200);
      placeAt(en, ep, bankQuat(s12.dEn, -10), s12.dEn, 165);
      // İkisi de ateş eder (ıskalar); havada patlayan mermiler ve hafif duman
      me.firing = k > 0.2 && k < 1.9;
      en.firing = k > 0.35 && k < 1.85;
      if (me.firing && t - s12.last >= 1 / 14) {
        s12.last = t;
        fireNose(c, me, p.clone().addScaledVector(s12.dMe, 4.5), s12.dMe);
        if (Math.random() < 0.5) {
          const along = 0.3 + 0.6 * Math.random();
          const at = p.clone().lerp(ep, along).add(new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 30));
          c.w.events.push({ kind: 'flak', pos: at, size: 0.35 });
        }
      }
      if (en.firing && t - s12.lastE >= 1 / 16) {
        s12.lastE = t;
        const side = Math.random() < 0.5 ? -1 : 1;
        const er = new THREE.Vector3(-s12.dEn.z, 0, s12.dEn.x).normalize();
        fireNose(c, en, ep.clone().addScaledVector(er, side * 2.6).addScaledVector(s12.dEn, 1.5), s12.dEn);
      }
      // Kamera dikey kuyruğun tepesinde, ileri bakar: burun kısmen, düşman ortaya yakın
      const upJ = new THREE.Vector3(0, 1, 0).applyQuaternion(me.quat);
      const cam = me.pos.clone().addScaledVector(upJ, 3.4).addScaledVector(s12.dMe, -5.2);
      const look = mixLook(cam, me.pos.clone().addScaledVector(s12.dMe, 4).addScaledVector(upJ, 0.3), ep, 0.3);
      return { pos: cam, look, up: upJ, fov: 40, handheld: 0.5 };
    },
  },
);

// --- 13 Soldan: jet sola yatık, yanan bombacıya soldan ateş eder (isabetlerde küçük patlamalar); bombacı yoluna devam
// edip burnun hizasından sola çıkar, jet ateşi keser; çevrede başka uçakların saçılan mermileri. Kamera sol kuyruk yanında.
const BOX13 = newBox();
const s13 = { target: -1, ready: false, last: 0, lastBoom: 0, p: new THREE.Vector3(), f: new THREE.Vector3() };

// --- 14 Alttan geçiş: jet kameranın üstünden, hafif tırmanıp sağa yatarak geçer; uzakta yoğuşma izli avcılar
const K14 = newKine();
const K14b = [newKine(), newKine()];
const s14 = { cam: new THREE.Vector3(), f: new THREE.Vector3(), ready: false };

ME262_TAKES.push(
  {
    id: 'me_soldan', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 2,
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 4500;
      spawnBox(w, p, 75);
      spawn262(w, 0, p.clone().addScaledVector(dirOf(75), -900).add(new THREE.Vector3(0, -40, 0)), 75, 1);
      s13.ready = false;
    },
    trigger: jets(0, 1), offset: 3, maxWait: 20, duration: 6,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      const f = dirOf(75);
      const r = rightOf(f);
      const t = c.t;
      if (!s13.ready) {
        s13.ready = true;
        boxStart(BOX13, c, 75);
        // Hedef: kutunun sol kenarındaki uçak; jet onun 110 m solunda, 120 m gerisinde, 15 m altında
        let best: Aircraft | undefined;
        for (const id of BOX13.pos.keys()) {
          const a = c.ac(id);
          if (a && (!best || a.pos.dot(r) < best.pos.dot(r))) best = a;
        }
        s13.target = best?.id ?? -1;
        const tg0 = best!.pos.clone().addScaledVector(f, BOX13.v * (t - BOX13.t0));
        s13.p.copy(tg0).addScaledVector(r, -110).addScaledVector(f, -120).add(new THREE.Vector3(0, -15, 0));
        // Burun başta bombacının önlemeli yerine bakar; jet bu yönde, bombacıdan yavaş gider: bombacı hizadan sola çıkar
        s13.f.copy(leadPoint(s13.p, tg0, f.clone().multiplyScalar(BOX13.v), me.guns[0].muzzleVel)).sub(s13.p).normalize();
        s13.last = -1;
        s13.lastBoom = -1;
      }
      boxStep(BOX13, c);
      const tg = c.ac(s13.target)!;
      // Bombacı video boyunca yanar (yangın patlama eşiğinin altında tutulur, uçak düşmez)
      tg.damage.fire = 1;
      tg.damage.engines[0] = Math.max(tg.damage.engines[0], 0.8);
      tg.hp = Math.max(tg.hp, tg.hpMax * 0.6);
      // Jet bombacının sol arkasında, hemen hemen aynı yönde ve hızda; yavaşça yaklaşır
      const base = BOX13.pos.get(s13.target)!.clone().addScaledVector(f, BOX13.v * (t - BOX13.t0));
      const p = base.clone().addScaledVector(f, -210 + 14 * t).addScaledVector(r, -48 + 2.5 * t).add(new THREE.Vector3(0, -12, 0));
      // Burun önlemeli nişan noktasının biraz sağında (bombacı kanopinin solunda görünür); 2,4 sn'den sonra burun sağa
      // kayar, bombacı hizadan sola çıkar ve ateş kesilir
      const aim = leadPoint(p, tg.pos, f.clone().multiplyScalar(BOX13.v), me.guns[0].muzzleVel).sub(p).normalize();
      const yawOff = 1.6 + 7 * smooth01((t - 2.4) / 2.2);
      const fwd = aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -yawOff * DEG_R).normalize();
      const bank = -26 - 6 * Math.sin(t * 0.7);
      placeAt(me, p, bankQuat(fwd, bank), fwd, BOX13.v + 14);
      me.firing = yawOff < 3.2 && t > 0.2;
      if (me.firing && t - s13.last >= 1 / 14) {
        s13.last = t;
        fireNose(c, me, p.clone().addScaledVector(fwd, 4.5), aim);
        if (Math.random() < 0.5) c.w.events.push({ kind: 'hit', pos: tg.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.4) * 3, (Math.random() - 0.5) * 7)) });
        if (t - s13.lastBoom > 0.35 && Math.random() < 0.5) {
          s13.lastBoom = t;
          c.w.events.push({ kind: 'flak', pos: tg.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 6)), size: 0.5 });
        }
      }
      // Çevrede saçılan mermiler: kutunun nişancıları jete ateş eder, ıskalar
      for (const b of nearest(BOX13, c, me.pos).slice(0, 4)) gunnersFire(c, b, me.pos, [0, 1, 2, 3, 4, 5].filter((i) => i < b.turrets.length));
      // Kamera sol kuyruk yanına yapışık, ileri bakar; uçakla yatar
      return { ...c.d.wing(me, { offset: [-1.35, 1.25, -4.6], look: [-1.2, 1.0, 40], roll: 1, fov: 66 }), handheld: 0.35 };
    },
  },
  {
    id: 'me_alttan_gecis', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 8,
    decorate: (g) => {
      deco.k14 = g;
    },
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = 8200;
      spawn262(w, 0, p, 75, 1);
      // Uzakta, aşağıda yoğuşma izi bırakan iki avcı (başka yöne)
      spawnFighter(w, 'p51d', p.clone().addScaledVector(dirOf(75), -1300).addScaledVector(rightOf(dirOf(75)), -500).add(new THREE.Vector3(0, 260, 0)), 330);
      spawnFighter(w, 'p51d', p.clone().addScaledVector(dirOf(75), -1360).addScaledVector(rightOf(dirOf(75)), -560).add(new THREE.Vector3(0, 280, 0)), 330);
      s14.ready = false;
      s14.cam.set(0, 0, 0);
      lastPuff.k14 = -99;
      deco.k14?.clear();
    },
    trigger: (w) => {
      const j = w.aircraft.find((a) => a.spec.id === 'me262');
      const ps = w.aircraft.filter((a) => a.spec.id === 'p51d');
      return j && ps.length >= 2 ? { ids: [j.id, ps[0].id, ps[1].id] } : null;
    },
    offset: 0.2, maxWait: 20, duration: 5,
    shot: (c: TakeCtx) => {
      const [me, e1, e2] = c.s.ids.map((id) => c.ac(id)!);
      const f = dirOf(75);
      const t = c.t;
      if (!s14.ready) {
        s14.ready = true;
        kineStart(K14, c.w, me.pos.clone(), 75, 205);
        kineStart(K14b[0], c.w, e1.pos.clone(), 330, 170);
        kineStart(K14b[1], c.w, e2.pos.clone(), 330, 170);
        s14.f.copy(f);
      }
      // Jet: hafif tırmanış, sağa yatar (kayıtta); avcılar uzakta hafif dönerek
      if (t < 0) kineStep(K14, c.dt, 0, { alt: K14.alt });
      else kineStep(K14, c.dt, 35 * smooth01(t / 3), { n: 1.25 });
      kineStep(K14b[0], c.dt, -25, { alt: K14b[0].alt });
      kineStep(K14b[1], c.dt, -25, { alt: K14b[1].alt });
      kineApply(me, K14);
      kineApply(e1, K14b[0]);
      kineApply(e2, K14b[1]);
      e1.gunAmmo.fill(0);
      e2.gunAmmo.fill(0);
      // Duman: jetin önüne, geçeceği yere bırakılan koyu lekeler (içinden geçer)
      const g14 = deco.k14;
      if (g14 && t > -0.8 && t - lastPuff.k14 > 0.32) {
        lastPuff.k14 = t;
        for (let i = 0; i < 2; i++) {
          const at = me.pos.clone().addScaledVector(me.fwd, 120 + 40 * Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 24));
          puff(g14, at, 24 + 26 * Math.random(), SMOKE, 0.26 + 0.14 * Math.random());
        }
      }
      // Kamera jetin sağ arka çaprazında, biraz yukarıda; jetle birlikte gider, sırtı görünür
      const fh = new THREE.Vector3(me.fwd.x, 0, me.fwd.z).normalize();
      const rh = rightOf(fh);
      const pos = me.pos.clone().addScaledVector(fh, -22).addScaledVector(rh, 12).add(new THREE.Vector3(0, 4, 0));
      return { pos, look: me.pos.clone().addScaledVector(rh, 2), fov: 48, handheld: 0.6 };
    },
  },
);

/** Çekime özel yumuşak leke (duman ya da bulut; ışıktan etkilenmez). */
function puff(g: THREE.Group, at: THREE.Vector3, size: number, color: number, opacity: number): void {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color, transparent: true, depthWrite: false, fog: false, opacity }));
  sp.scale.set(size * 1.3, size, 1);
  sp.position.copy(at);
  g.add(sp);
}
const deco: Record<string, THREE.Group | null> = {};
const lastPuff: Record<string, number> = {};
const SMOKE = 0x3b3633;

// --- 15 İkili, üstten: iki jet kameranın altında yan yana, sırtları görünür; kamera onlarla gider. Sağdaki yakın, soldaki
// biraz geride ve aşağıda, yavaşça sağdakine yaklaşır. Bulut katmanının üstünde (bulutlar aşağıda, arkada)
const K15 = [newKine(), newKine()];
/** Yerden yükseklik: bulutların üstünde. */
const ALT15 = 3000;
const sky15: { group: THREE.Group | null } = { group: null };

ME262_TAKES.push({
  id: 'me_alttan_ikili', map: 'anakara', seed: SEED, clock: DAWN, clouds: 1, warm: 2,
  decorate: (g) => {
    sky15.group = g;
  },
  setup: (w) => {
    theater(w, { forward: false });
    const p = place();
    spawn262(w, 0, p.setY(groundLevel(p.x, p.z) + ALT15), 75, 2);
    K15[0].w = null;
  },
  trigger: jets(0, 2), offset: 0.2, maxWait: 20, duration: 5,
  shot: (c: TakeCtx) => {
    const [near, far] = c.s.ids.map((id) => c.ac(id)!);
    const f = dirOf(75);
    const r = rightOf(f);
    const t = c.t;
    if (K15[0].w !== c.w) {
      const p = place();
      p.y = groundLevel(p.x, p.z) + ALT15;
      kineStart(K15[0], c.w, p, 75, 210);
      kineStart(K15[1], c.w, p.clone(), 75, 210);
      // Jetlerin altında, geçecekleri yol boyunca kümülüs: yumuşak beyaz lekeler (yalnız bu çekimde süs)
      const g = sky15.group;
      if (g) {
        g.clear();
        const rnd = (i: number, k: number) => {
          const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        for (let i = 0; i < 46; i++) {
          const m = new THREE.SpriteMaterial({ map: mistTexture(), color: 0xf4f1ef, transparent: true, depthWrite: false, fog: false, opacity: 0.75 + 0.2 * rnd(i, 1) });
          const sp = new THREE.Sprite(m);
          const size = 160 + 260 * rnd(i, 2);
          sp.scale.set(size * 1.5, size, 1);
          sp.position.copy(p).addScaledVector(f, -300 + i * 42).addScaledVector(r, (rnd(i, 3) - 0.5) * 900).add(new THREE.Vector3(0, -380 - 300 * rnd(i, 4), 0));
          g.add(sp);
        }
      }
    }
    kineStep(K15[0], c.dt, 6 * Math.sin(t * 0.6), { alt: K15[0].alt });
    kineApply(near, K15[0]);
    // Uzaktaki: yakındakinin 20 m solunda (yaklaşır 14 m'ye), 7 m gerisinde, 12 m aşağısında; aynı yön, hafif yatık
    const k = smooth01((t + 0.5) / 5);
    const fp = near.pos.clone().addScaledVector(r, -20 + 6 * k).addScaledVector(f, -7).add(new THREE.Vector3(0, -12, 0));
    placeAt(far, fp, bankQuat(near.fwd, 8 - 4 * k), near.fwd, near.speed);
    // Kamera ikisinin üstünde, aşağı bakar; ekranda burunlar sağa yukarı
    const look = near.pos.clone().lerp(fp, 0.22);
    const cam = look.clone().addScaledVector(f, -3).add(new THREE.Vector3(0, 26, 0));
    const up = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 35 * DEG_R);
    return { pos: cam, look, up, fov: 70, handheld: 0.6 };
  },
});

// --- 16 U4 önden siluet: güneş jetin arkasında; kamera önünde, sol alttan sağ üste yavaşça kayar. Arkada dumanlı
// bombacılar, bulut ve duman
const K16 = newKine();
const BOX16 = newBox();
const s16 = { ready: false };

// --- 17 Alçakta, arkadan (4 toplu): jet yere yakın, hafif sağa yatık; kamera sağ arka çaprazında, ortalamaz; duman sütunları
const K17 = newKine();
const s17 = { ready: false };

ME262_TAKES.push(
  {
    id: 'me_siluet', map: 'anakara', seed: SEED, clock: DAWN, clouds: 1, warm: 4,
    decorate: (g) => {
      deco.k16 = g;
    },
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 3800;
      spawn262(w, 0, p, HDG8, 1, 'me262u4');
      spawnBox(w, p.clone().addScaledVector(dirOf(HDG8), -520).add(new THREE.Vector3(0, 70, 0)), HDG8);
      s16.ready = false;
      deco.k16?.clear();
    },
    trigger: jets(0, 1), offset: 0.2, maxWait: 20, duration: 6,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      const f = dirOf(HDG8);
      const r = rightOf(f);
      const t = c.t;
      if (!s16.ready) {
        s16.ready = true;
        kineStart(K16, c.w, me.pos.clone(), HDG8, 200);
        boxStart(BOX16, c, HDG8);
        // Kutu düzeninden çıkar: her bombacı ileri-geri, yana ve yukarı-aşağı rastgele kayık (dağınık kol)
        for (const p0 of BOX16.pos.values()) {
          p0.addScaledVector(f, (Math.random() - 0.5) * 420).addScaledVector(r, (Math.random() - 0.5) * 520).add(new THREE.Vector3(0, (Math.random() - 0.5) * 160, 0));
        }
        // Bombacıların dördü dumanlı (arkada koyu izler)
        nearest(BOX16, c, me.pos).slice(0, 4).forEach((b, i) => {
          b.damage.engines[i % 4] = 0.85;
        });
        // Arkada duman ve bulut lekeleri (jetle güneş arasında)
        const g = deco.k16;
        if (g) {
          for (let i = 0; i < 18; i++) {
            const at = me.pos.clone().addScaledVector(f, -250 - 900 * Math.random()).addScaledVector(r, (Math.random() - 0.5) * 900).add(new THREE.Vector3(0, (Math.random() - 0.3) * 260, 0));
            puff(g, at, 90 + 160 * Math.random(), i % 3 ? SMOKE : 0xd8d2cf, 0.35 + 0.25 * Math.random());
          }
        }
      }
      kineStep(K16, c.dt, 0, { alt: K16.alt });
      kineApply(me, K16);
      boxStep(BOX16, c);
      // Kamera jetin önünde: sol alttan sağ üste yavaşça; jete (arkasında güneş) bakar
      const k = smooth01(t / 6);
      const fj = new THREE.Vector3(me.fwd.x, 0, me.fwd.z).normalize();
      const pos = me.pos.clone().addScaledVector(fj, 19).addScaledVector(rightOf(fj), -8 + 16 * k).add(new THREE.Vector3(0, -4 + 6 * k, 0));
      return { pos, look: me.pos.clone(), fov: 50, handheld: 0.5 };
    },
  },
);

/** 17: alçak uçuş, kamera sağ (side 1) ya da sol (side −1) arka çaprazda; uçuş ve duman aynı. */
function alcakTake(side: number): Take {
  return {
    id: side > 0 ? 'me_alcak' : 'me_alcak_sol', map: 'anakara', seed: SEED, clock: DAWN, clouds: CLOUDS, warm: 1,
    decorate: (g) => {
      deco.k17 = g;
    },
    setup: (w) => {
      theater(w, { forward: false });
      const p = place();
      p.y = groundLevel(p.x, p.z) + 140;
      spawn262(w, 0, p, 75, 1);
      s17.ready = false;
      deco.k17?.clear();
    },
    trigger: jets(0, 1), offset: 0.2, maxWait: 20, duration: 6,
    shot: (c: TakeCtx) => {
      const me = c.ac(c.s.ids[0])!;
      const t = c.t;
      if (!s17.ready) {
        s17.ready = true;
        kineStart(K17, c.w, me.pos.clone(), 75, 200);
        // Önde ve yanlarda yerden yükselen duman sütunları (yanan hedefler)
        const g = deco.k17;
        const f = dirOf(75);
        const r = rightOf(f);
        if (g) {
          for (let j = 0; j < 7; j++) {
            const base = me.pos.clone().addScaledVector(f, 900 + j * 260).addScaledVector(r, -700 + 200 * j + 120 * Math.random());
            base.y = groundLevel(base.x, base.z);
            for (let i = 0; i < 11; i++) {
              const at = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 18 + i * 10, 30 + i * 45, (Math.random() - 0.5) * 18));
              puff(g, at, 40 + i * 16, i < 3 ? 0x4a4440 : 0x6d6763, 0.65 - i * 0.04);
            }
          }
        }
      }
      // Yere yakın (araziyi izler), hafif sağa yatık, yumuşak sağ dönüş
      kineStep(K17, c.dt, 16 + 3 * Math.sin(t * 0.8), { agl: 130 });
      kineApply(me, K17);
      // Kamera sağ (ya da sol) arka çaprazda; jet ortada değil
      const fh = new THREE.Vector3(me.fwd.x, 0, me.fwd.z).normalize();
      const rh = rightOf(fh);
      const pos = me.pos.clone().addScaledVector(fh, -15).addScaledVector(rh, 6 * side).add(new THREE.Vector3(0, 2.5, 0));
      const look = me.pos.clone().addScaledVector(fh, 3).addScaledVector(rh, -2.5 * side);
      return { pos, look, fov: 56, handheld: 0.8 };
    },
  };
}
ME262_TAKES.push(alcakTake(1), alcakTake(-1));
