// Video çekimleri: her çekim bir dünya kurulumu, kaydı başlatan tetik ve her karede kamera. Zamanlar saniye;
// t = 0 kaydın ilk karesi (ısınmada negatif). Tetik simülasyonun her adımında sınanır, ilk tuttuğu an kayıt
// noktasıdır (offset kadar önce ya da sonra başlar).

import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Aircraft } from '../sim/aircraft/aircraft';
import type { MapLayer } from '../ui/settings';
import { SCENARIOS, landCenter, plan, theater } from '../sim/scenarios';
import { groundLevel, highestPointNear } from '../sim/terrain';
import { AASite } from '../sim/structures/airDefense';
import { Director, ease, lerp, phase, type Shot } from './director';

export interface Subject {
  /** Çekimin uçakları (ilki ana özne). */
  ids: number[];
  /** Hedef ya da olay noktası. */
  at?: THREE.Vector3;
  /** Yerden çekimde kameranın olaya göre yönü (radyan). */
  ang?: number;
}

export interface TakeCtx {
  t: number;
  dt: number;
  w: World;
  s: Subject;
  d: Director;
  ac(id: number): Aircraft | undefined;
}

export interface Take {
  id: string;
  map: string;
  seed: number;
  setup(w: World): void;
  trigger?: (w: World) => Subject | null;
  /** Tetik yoksa kaydın başladığı oyun zamanı. */
  at?: number;
  /** Tetikten kaç saniye sonra kayda başlansın (önce: negatif). */
  offset: number;
  maxWait: number;
  duration: number;
  layers?: Partial<Record<MapLayer, boolean>>;
  rings?: boolean;
  /** Patlama sarsıntısı çarpanı. */
  shake?: number;
  /**
   * Efekt ve model ölçeğinin hesaplandığı bakış uzaklığı (m). Verilmezse kameranın baktığı noktaya uzaklık; yakındaki
   * toplara bakarken uzağa nişan alan çekimde namlu alevleri dev görünmesin diye küçük verilir.
   */
  fxDist?: number;
  shot(c: TakeCtx): Shot;
}

const scenario = (id: string) => (w: World): void => SCENARIOS.find((s) => s.id === id)!.build(w);

const DEG = Math.PI / 180;

const factoryOf = (w: World, team: number) => w.structures.find((s) => s.kind === 'factory' && s.team === team)!;

/** Son bilinen konum: özne düşüp silinse de kamera bir anda boşa bakmasın (negatif anahtarlar: çekimin kendi notları). */
const lastPos = new Map<number, THREE.Vector3>();

/** Her kaydın başında: önceki çekimden kalan notlar silinir. */
export function beginTake(): void {
  lastPos.clear();
}
function track(c: TakeCtx, id: number): Aircraft | null {
  const a = c.ac(id);
  if (a) lastPos.set(id, a.pos.clone());
  return a ?? null;
}

/** Bir Stuka bombasını bıraktı mı (bırakılan bomba uçağın hemen yanında). */
function stukaRelease(w: World): Subject | null {
  for (const b of w.bombs) {
    const a = w.aircraft.find((x) => x.spec.id === 'ju87b' && x.status === 'flying' && x.pos.distanceTo(b.pos) < 40);
    if (a) return { ids: [a.id], at: factoryOf(w, 1).pos.clone() };
  }
  return null;
}

/**
 * Yerden çekim için açık bir bakış yönü: olaydan dist kadar uzakta, kamera height metre yüksekte; arazi görüşü
 * kesmeyen ve yapıların üstünden geçen (en büyük açıklıklı) yön.
 */
function openAngle(at: THREE.Vector3, dist: number, height: number): number {
  let best = 0;
  let bestClear = -Infinity;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const cx = at.x + Math.cos(a) * dist;
    const cz = at.z + Math.sin(a) * dist;
    const cy = groundLevel(cx, cz) + height;
    let clear = Infinity;
    for (let s = 0.08; s < 0.95; s += 0.04) {
      const x = cx + (at.x - cx) * s;
      const z = cz + (at.z - cz) * s;
      const y = cy + (at.y + 40 - cy) * s;
      clear = Math.min(clear, y - groundLevel(x, z));
    }
    if (clear > bestClear) {
      bestClear = clear;
      best = a;
    }
  }
  return best;
}

/** Fabrikanın yakınına düşen ilk bomba. */
function factoryHit(w: World): Subject | null {
  const f = factoryOf(w, 1);
  for (const e of w.events) {
    if (e.kind === 'groundExplosion' && Math.hypot(e.pos.x - f.pos.x, e.pos.z - f.pos.z) < 400) {
      // Kamera isabetin fabrika merkezine göre dış yanında: patlama önde, binalar arkada
      const off = Math.hypot(e.pos.x - f.pos.x, e.pos.z - f.pos.z);
      const ang = off > 30 ? Math.atan2(e.pos.z - f.pos.z, e.pos.x - f.pos.x) : openAngle(e.pos, 520, 110);
      return { ids: [], at: e.pos.clone(), ang };
    }
  }
  return null;
}


/** Kolun ortası (canlı uçakların ortalaması). */
function centroid(c: TakeCtx, ids: number[]): THREE.Vector3 | null {
  const p = new THREE.Vector3();
  let n = 0;
  for (const id of ids) {
    const a = c.ac(id);
    if (!a || a.status !== 'flying') continue;
    p.add(a.pos);
    n++;
  }
  return n ? p.multiplyScalar(1 / n) : null;
}

interface FlybyOpts {
  seed: number;
  team: number;
  /** Uçuş yönü (derece, pusula). */
  heading: number;
  /** Uçağın kameraya göre yanal (sağ +) ve dikey kaçıklığı (m). */
  side: number;
  dy: number;
  /** Başta ve sonda görüş açısı. */
  fov: [number, number];
  /** Kameranın yerden yüksekliği. */
  agl?: number;
}

/** Tek uçak kameranın yanından tam gazla geçer; kamera sabit, operatör gibi çevirir (geçiş sesi Doppler'li). */
function flyby(id: string, specId: string, o: FlybyOpts): Take {
  const cam = new THREE.Vector3();
  const _v = new THREE.Vector3();
  return {
    id,
    map: 'anakara',
    seed: o.seed,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      const c = landCenter();
      cam.set(c.x, groundLevel(c.x, c.z) + (o.agl ?? 220), c.z);
      const h = o.heading * DEG;
      const f = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const start = cam.clone().addScaledVector(f, -2600).addScaledVector(r, o.side);
      start.y += o.dy;
      const goal = cam.clone().addScaledVector(f, 40000).addScaledVector(r, o.side);
      w.spawnAirborneFlight(o.team, specId, 1, start, o.heading, plan('cap', specId, {
        targetPos: goal, altitude: start.y, speed: 'max', patrolRadius: 3000, stationTime: 600,
      }), null);
    },
    // En yakın geçişe 1,5 sn kala kayıt başlar. Yapay zekâ irtifasını kendi ayarladığı için kamera o an, uçağın
    // geçeceği noktanın yanına (side) ve altına/üstüne (dy) konur.
    trigger: (w) => {
      const a = w.aircraft[0];
      if (!a) return null;
      const p = a.pos.clone().sub(cam);
      a.velocity(_v);
      const tca = -p.dot(_v) / Math.max(_v.lengthSq(), 1);
      if (tca <= 0 || tca > 1.5) return null;
      const at = a.pos.clone().addScaledVector(_v, tca);
      const f = new THREE.Vector3(_v.x, 0, _v.z).normalize();
      at.addScaledVector(new THREE.Vector3(-f.z, 0, f.x), -o.side);
      at.y -= o.dy;
      return { ids: [a.id], at };
    },
    offset: 0,
    maxWait: 90,
    duration: 2.8,
    shot(c) {
      // Yaklaşırken tele (uçak büyük), geçerken geniş açıya açılır
      const a = track(c, c.s.ids[0]);
      const p = a ? a.pos : lastPos.get(c.s.ids[0])!;
      return c.d.tripod(c.s.at!, p, c.dt, lerp(o.fov[0], o.fov[1], phase(c.t, 0.7, 1.9)), 0.04);
    },
  };
}

/** Takımadalar: ortadaki volkanlı adanın tepesi. */
export let peak = { x: 0, z: 0, h: 0 };

export const TAKES: Take[] = [
  {
    // Açılış: Stuka'nın pikesi, yandan; kamera uçakla birlikte süzülür, yakınlaşırken öne doğru döner.
    // Bomba bırakılınca biter (kesme).
    id: 'stuka_dive',
    map: 'anakara',
    seed: 11,
    setup: scenario('raid_dive'),
    trigger: stukaRelease,
    offset: -3.6,
    maxWait: 600,
    duration: 4.2,
    shot(c) {
      // Arkadan-yukarıdan, pike doğrultusunda hedefe: uçak kadrajın altında, hedef ortada büyür.
      // Ekranın yukarısı yaklaşma yönü (dik bakışta kamera dönmesin)
      const a = track(c, c.s.ids[0]);
      const p = a ? a.pos : lastPos.get(c.s.ids[0])!;
      const v = a ? a.velocity(new THREE.Vector3()) : new THREE.Vector3(0, -1, 0);
      const f = c.d.heading.update(v.clone().normalize(), c.dt).clone().normalize();
      const az = new THREE.Vector3(v.x, 0, v.z).normalize();
      const u = az.clone().addScaledVector(f, -az.dot(f)).normalize();
      // Uçak hep ekranın ~%65'inde (alttaki yazıların üstünde), hedef ortanın biraz üstünde
      const k = phase(c.t, -0.3, 3.8);
      const fov = lerp(56, 46, k);
      const half = (fov / 2) * (Math.PI / 180);
      const back = lerp(28, 21, k);
      const pos = p.clone().addScaledVector(f, -back).addScaledVector(u, back * Math.tan(half * 0.55));
      const look = p.clone().addScaledVector(f, 400).addScaledVector(u, -400 * Math.tan(half * 0.25));
      return { pos, look, up: u, fov, handheld: 0.5 };
    },
  },
  {
    // Başlık: B-17 kolu iç denizin üstünde, volkanlı adanın yanından geçer. Kamera kolun yanında ve yukarısında
    // onunla birlikte uçar, kol yavaşça öne geçer (arkada ada ve deniz).
    id: 'title_b17',
    map: 'takimada',
    seed: 21,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      peak = highestPointNear(0, 0, 12000);
      // Ortadaki adanın güney kıyısının açığı (deniz), doğuya
      const alt = 1600;
      const z = 31500;
      w.spawnAirborneFlight(1, 'b17g', 9, new THREE.Vector3(-16000, alt, z), 90, plan('cap', 'b17g', {
        targetPos: new THREE.Vector3(60000, 0, z), altitude: alt, patrolRadius: 3000, stationTime: 900,
      }), null);
    },
    trigger: (w) => {
      const a = w.aircraft[0];
      return a && a.pos.x > -4000 ? { ids: w.aircraft.map((x) => x.id) } : null;
    },
    offset: 0,
    maxWait: 400,
    duration: 4.5,
    shot(c) {
      // Kolun güneyinde ve yukarısında; arkada kıyı ve ada
      const ctr = centroid(c, c.s.ids) ?? lastPos.get(-1)!;
      lastPos.set(-1, ctr.clone());
      const k = phase(c.t, -1, 4.5, (x) => x);
      const dx = lerp(150, -40, k);
      const pos = ctr.clone().add(new THREE.Vector3(dx, lerp(115, 130, k), 270));
      return { pos, look: ctr.clone().add(new THREE.Vector3(-0.5 * dx, -10, -200)), fov: 50, handheld: 0.7 };
    },
  },
  // "51 gerçek uçak": dört geçiş, her biri başka açıdan
  flyby('pass_spitfire', 'spitfire9', { seed: 31, team: 0, heading: 90, side: -28, dy: 9, fov: [20, 46] }),
  flyby('pass_bf109', 'bf109g', { seed: 32, team: 1, heading: 270, side: -24, dy: -16, fov: [18, 44] }),
  flyby('pass_p51', 'p51d', { seed: 33, team: 0, heading: 0, side: 10, dy: 16, fov: [22, 55] }),
  flyby('pass_me262', 'me262', { seed: 34, team: 1, heading: 135, side: 32, dy: -6, fov: [16, 40] }),
  {
    // İt dalaşı: Spitfire, Bf 109'un arkasında; omzun üstünden ikisi birden, iz mermileri ve isabet. Kamera
    // Spitfire'ın yatışının bir kısmını alır (ufuk hafif yatar)
    id: 'dogfight',
    map: 'anakara',
    seed: 41,
    setup: scenario('df_1v1'),
    trigger: (w) => {
      const s = w.aircraft.find((x) => x.spec.id === 'spitfire1' && x.status === 'flying' && x.firing);
      const b = w.aircraft.find((x) => x.spec.id === 'bf109e' && x.status === 'flying');
      if (!s || !b) return null;
      const hit = w.events.some((e) => e.kind === 'hit' && e.pos.distanceTo(b.pos) < 25);
      return hit ? { ids: [s.id, b.id] } : null;
    },
    offset: -1.6,
    maxWait: 300,
    duration: 4.2,
    shot(c) {
      const s = track(c, c.s.ids[0]);
      const b = track(c, c.s.ids[1]);
      const sp = s ? s.pos : lastPos.get(c.s.ids[0])!;
      const bp = b ? b.pos : lastPos.get(c.s.ids[1])!;
      // Kamera ateş hattının (Spitfire → 109) arkasında: ikisi hep aynı hizada kalır
      c.d.heading.time = 0.18;
      const f = c.d.heading.update(bp.clone().sub(sp).normalize(), c.dt).clone().normalize();
      const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
      const k = phase(c.t, -1, 4.2);
      const pos = sp.clone().addScaledVector(f, -lerp(26, 20, k)).addScaledVector(r, 5).add(new THREE.Vector3(0, 6.5, 0));
      const look = sp.clone().lerp(bp, 0.6);
      const up = new THREE.Vector3(0, 1, 0).lerp(s ? s.upv : new THREE.Vector3(0, 1, 0), 0.3).normalize();
      return { pos, look, up, fov: lerp(50, 44, k), handheld: 0.8 };
    },
  },
  {
    // B-17 taretleri önleyiciye ateş eder: kamera bombardıman uçağının saldırgana göre öbür yanında, iz mermileri
    // kameradan uzağa, saldırgana doğru akar
    id: 'b17_turrets',
    map: 'anakara',
    seed: 51,
    setup: scenario('b17_raid'),
    trigger: (w) => {
      for (const a of w.aircraft) {
        if (a.spec.id !== 'b17g' || a.status !== 'flying') continue;
        const t = a.turrets.find((x) => x.firing && x.targetId !== null);
        if (t) return { ids: [a.id, t.targetId!] };
      }
      return null;
    },
    offset: -0.3,
    maxWait: 900,
    duration: 4,
    shot(c) {
      const b = track(c, c.s.ids[0]);
      const e = track(c, c.s.ids[1]);
      const bp = b ? b.pos : lastPos.get(c.s.ids[0])!;
      const ep = e ? e.pos : lastPos.get(c.s.ids[1])!;
      c.d.heading.time = 0.6;
      const away = c.d.heading.update(bp.clone().sub(ep).normalize(), c.dt).clone().normalize();
      const k = phase(c.t, -1, 4);
      const pos = bp.clone().addScaledVector(away, lerp(75, 60, k)).add(new THREE.Vector3(0, 14, 0));
      return { pos, look: bp.clone().lerp(ep, 0.3), fov: 48, handheld: 0.8 };
    },
  },
  {
    // Bomba bırakılıyor: kolun yanından ve biraz altından, bombalar bölmelerden dökülür, çevrede flak
    id: 'b17_bombs',
    map: 'anakara',
    seed: 51,
    setup: scenario('b17_raid'),
    // Bomba bırakan kol (kolundan kopan hasarlı uçak sayılmaz)
    trigger: (w) => {
      if (w.bombs.length < 12) return null;
      const b = w.bombs[0].pos;
      const ids = w.aircraft.filter((a) => a.spec.id === 'b17g' && a.status === 'flying' && a.pos.distanceTo(b) < 1500)
        .sort((x, y) => x.pos.distanceTo(b) - y.pos.distanceTo(b)).map((a) => a.id);
      return ids.length ? { ids } : null;
    },
    offset: -0.5,
    maxWait: 900,
    duration: 4,
    shot(c) {
      // Bombayı ilk bırakan uçak yakın planda, öbürleri arkada; kamera yanında ve biraz altında
      const a = track(c, c.s.ids[0]);
      const p = a ? a.pos : lastPos.get(c.s.ids[0])!;
      const v = a ? a.velocity(new THREE.Vector3()).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
      const r = new THREE.Vector3(-v.z, 0, v.x);
      const k = phase(c.t, -1, 4, (x) => x);
      const pos = p.clone().addScaledVector(r, 95).addScaledVector(v, lerp(35, -25, k)).add(new THREE.Vector3(0, -30, 0));
      return { pos, look: p.clone().add(new THREE.Vector3(0, -14, 0)), fov: 52, handheld: 0.8 };
    },
  },
  {
    // B-17 taretleri bir Bf 109'u düşürür: alev ve duman içinde düşüşü yandan izlenir
    id: 'b17_kill',
    map: 'anakara',
    seed: 51,
    setup: scenario('b17_raid'),
    trigger: (w) => {
      const a = w.aircraft.find((x) => x.team === 1 && x.status === 'falling');
      return a ? { ids: [a.id] } : null;
    },
    offset: -1.2,
    maxWait: 900,
    duration: 4,
    shot(c) {
      // Arkadan ve yukarıdan: vurulma, alev ve geride kalan duman izi; kamera yavaşça geri çekilir
      const a = track(c, c.s.ids[0]);
      const p = a ? a.pos : lastPos.get(c.s.ids[0])!;
      const v = a ? a.velocity(new THREE.Vector3()) : new THREE.Vector3(0, -1, 0);
      c.d.heading.time = 0.4;
      const f = c.d.heading.update(v.clone().normalize(), c.dt).clone().normalize();
      const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
      const k = phase(c.t, -1, 4);
      const pos = p.clone().addScaledVector(f, -lerp(45, 70, k)).addScaledVector(r, 18).add(new THREE.Vector3(0, lerp(14, 22, k), 0));
      return { pos, look: p.clone().addScaledVector(f, 20), fov: lerp(40, 46, k), handheld: 1 };
    },
  },
  {
    // Doruk: halı bombardımanı fabrikayı yıkar; ardından kamera yükselip haritanın strateji görünümüne açılır
    id: 'factory_boom',
    map: 'anakara',
    seed: 51,
    setup: scenario('b17_raid'),
    trigger: (w) => {
      for (const e of w.events) {
        if (e.kind !== 'structureDestroyed') continue;
        const s = w.structureById(e.id);
        if (s?.kind === 'factory') return { ids: [], at: s.pos.clone(), ang: openAngle(s.pos, 1500, 380) };
      }
      return null;
    },
    offset: -2.6,
    maxWait: 900,
    duration: 6,
    shake: 0.6,
    layers: { icons: true },
    shot(c) {
      const at = c.s.at!;
      const a = c.s.ang ?? 0;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      // 0–3 sn: yerden 1,5 km uzaktan yıkım; 3–5,8 sn: vinç, logaritmik yükselme (60 km) ve dik bakış
      const k = phase(c.t, 3, 5.8, ease.inOut);
      const h = Math.exp(lerp(Math.log(380), Math.log(60000), k));
      const back = lerp(1500, 30000, phase(c.t, 3, 5.8, ease.inOut));
      const pos = at.clone().addScaledVector(dir, back);
      pos.y = groundLevel(pos.x, pos.z) + h;
      const look = at.clone().add(new THREE.Vector3(0, lerp(60, 0, k), 0));
      return { pos, look, fov: lerp(30, 45, k), handheld: lerp(1, 0.2, k) };
    },
  },
  {
    // Uçaksavar: Il-2'ler alçaktan gelir; kamera yerde, bataryanın arkasında; toplar ön planda, mermiler uçaklara
    // akar. Bataryanın yanında radar istasyonu.
    id: 'aa_ground',
    map: 'anakara',
    seed: 61,
    setup(w) {
      // Il-2'lerin hedefi doğrudan batarya (üstüne dalarlar)
      const t = theater(w, {
        forward: false, redTech: ['hd_20', 'hd_37', 'hd_88', 'hd_rangefinder'],
        redFactoryAA: ['aa20', 'aa37', 'aa88', 'aa20'], redFactorySensors: ['rangefinder'], redFactoryLevel: 2,
      });
      const site = t.redAA[0];
      w.addStructure(1, 'radar', 'Kırmızı radar', site.pos.x - 170, site.pos.z + 120, 0);
      const ia = site.pos.clone().add(new THREE.Vector3(-9000, 0, 800));
      w.spawnAirborneFlight(0, 'il2m3', 4, ia.setY(groundLevel(ia.x, ia.z) + 150), 85,
        plan('attack', 'il2m3', { targetStructureId: site.id, lowLevel: true, agl: 110, passes: 2, loadoutId: 'mix' }), t.blueMain);
    },
    trigger: (w) => {
      const site = w.structures.find((s) => s.aa && s.team === 1 && s.aa.mounts.some((m) => m.weapon === 'aa88'));
      if (!site || !site.aa!.mounts.some((m) => w.time - m.lastFire < 0.02)) return null;
      const il2 = w.aircraft.filter((a) => a.spec.id === 'il2m3' && a.status === 'flying' && a.pos.distanceTo(site.pos) < 1300)
        .sort((x, y) => x.pos.distanceTo(site.pos) - y.pos.distanceTo(site.pos))[0];
      return il2 ? { ids: [il2.id], at: site.pos.clone() } : null;
    },
    offset: 0,
    maxWait: 600,
    duration: 4,
    fxDist: 140,
    shot(c) {
      const site = c.s.at!;
      const a = track(c, c.s.ids[0]);
      const p = a ? a.pos : lastPos.get(c.s.ids[0])!;
      // Kamera bataryanın, uçağa göre arkasında (ilk andaki yönde sabit), alçakta
      // Kamera 37 mm topun arkasında, yerde: alt ön planda top, yukarıda dalan uçak; bakış ikisinin ortası
      if (!lastPos.has(-3)) {
        const i = Math.max(0, c.w.structures.find((s) => s.aa && s.pos.distanceTo(site) < 1)?.aa!.mounts.findIndex((m) => m.weapon === 'aa37') ?? 0);
        const [ox, oz] = AASite.mountOffset(i);
        const gun = new THREE.Vector3(site.x + ox, 0, site.z + oz);
        gun.y = groundLevel(gun.x, gun.z) + 2;
        const away = gun.clone().sub(p).setY(0).normalize();
        const cam = gun.clone().addScaledVector(away, 14);
        cam.y = groundLevel(cam.x, cam.z) + 3;
        lastPos.set(-3, cam);
        lastPos.set(-4, gun);
      }
      const cam = lastPos.get(-3)!;
      const gun = lastPos.get(-4)!;
      const toGun = gun.clone().sub(cam).normalize();
      const toAc = p.clone().sub(cam).normalize();
      const look = cam.clone().add(toGun.multiplyScalar(0.8).add(toAc).normalize().multiplyScalar(100));
      return c.d.tripod(cam, look, c.dt, 54, 0.12);
    },
  },
  {
    // Bomba fabrikaya düşer: yerden, patlamaya doğru yavaş yakınlaşma ve sarsıntı
    id: 'stuka_impact',
    map: 'anakara',
    seed: 11,
    setup: scenario('raid_dive'),
    trigger: factoryHit,
    offset: -0.9,
    maxWait: 600,
    duration: 3,
    shake: 1.4,
    shot(c) {
      const at = c.s.at!;
      const pos = at.clone().add(new THREE.Vector3(Math.cos(c.s.ang ?? 0) * 520, 0, Math.sin(c.s.ang ?? 0) * 520));
      pos.y = groundLevel(pos.x, pos.z) + 110;
      const k = phase(c.t, -1, 3, (x) => x);
      return { pos, look: at.clone().add(new THREE.Vector3(0, 22, 0)), fov: lerp(32, 26, k), handheld: 1.2 };
    },
  },
];
