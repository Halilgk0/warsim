// Video çekimleri: her çekim bir dünya kurulumu, kaydı başlatan tetik ve her karede kamera. Zamanlar saniye;
// t = 0 kaydın ilk karesi (ısınmada negatif). Tetik simülasyonun her adımında sınanır, ilk tuttuğu an kayıt
// noktasıdır (offset kadar önce ya da sonra başlar).

import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Aircraft } from '../sim/aircraft/aircraft';
import type { MapLayer } from '../ui/settings';
import { SCENARIOS, landCenter, plan, theater } from '../sim/scenarios';
import { footprintStats, groundLevel, highestPointNear } from '../sim/terrain';
import { AASite } from '../sim/structures/airDefense';
import { newAirframe } from '../sim/structures/airbase';
import type { StructureKind } from '../sim/structures/structure';
import { Director, ease, flightDir, lerp, phase, type Shot } from './director';

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
  /** Günün saati (0–24): gün döngüsü olan kodda kayıt bu saatte başlar (eski kod yok sayar). */
  clock?: number;
  /** Saatin akış hızı (saat / kayıt saniyesi): hızlandırılmış gün döngüsü çekimi. */
  clockSpeed?: number;
  /** Isınma süresi (s): kayıttan önce çizilen kısım (yoğuşma izi gibi zamanla biriken görseller için uzun tutulur). */
  warm?: number;
  /** Kamera ile baktığı nokta arasındaki bulut açılsın (özne bulutun arkasında kalmasın). */
  clearClouds?: boolean;
  /** Bulut miktarı (0 açık hava, 1 olağan; verilmezse 1). */
  clouds?: number;
  /** Yapı duman sütunlarının ömür çarpanı (uzaktan görünen yüksek sütunlar; verilmezse 1). */
  smoke?: number;
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

/**
 * Ufukta yangın kamerası: yangına göre pusulası, uzaklığı ve yerden yüksekliği (ağaçların üstünden), bakış yüksekliği
 * ve görüş açısı (başta, sonda).
 */
interface SmokeCam {
  az: number;
  dist: number;
  height: number;
  /** Bakışın yangından sağa kayması (m; tepe rüzgârla sağa yayılır). */
  right: number;
  look: [number, number];
  fov: [number, number];
}
/** Yandan: güneş solda; dumanın tepesi rüzgârla sağa ve kameraya doğru yayılır. */
const SMOKE_SIDE: SmokeCam = { az: 105, dist: 3800, height: 15, right: 300, look: [420, 650], fov: [44, 40] };
/** Ufukta yangının merkezi (kurulumda yazılır). */
const fireAt = new THREE.Vector3();

/**
 * Ufukta yangın: ağır hasarlı fabrika ve çevresindeki yapılardan yükselen kara duman sütunları, gün batımına yakın.
 * Kamera kilometrelerce uzakta, ağaçların üstünden bakar; sütunlar tepede rüzgârla bükülüp göğe yayılır, yavaşça
 * tırmanmayı sürdürür. Bakış çok yavaş kalkar. Sütunlar uzun ömürlü (smoke): uzun ısınma.
 */
function horizonSmoke(id: string, cam: SmokeCam): Take {
  return {
    id,
    map: 'anakara',
    seed: 84,
    clock: 18.5,
    clouds: 0.4,
    smoke: 4,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      const c = flatSpot(w, landCenter(), 0, 8000, 260);
      fireAt.copy(c).setY(groundLevel(c.x, c.z));
      // Yerleşim kameranın bakış ekseninde: fwd kameradan uzağa, rt sağa (m)
      const va = (cam.az + 180) * DEG;
      const fwd = new THREE.Vector3(Math.sin(va), 0, -Math.cos(va));
      const rt = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const burn = (kind: StructureKind, depth: number, side: number, hp: number) => {
        const s = w.addStructure(1, kind, w.structureName(1, kind), c.x + fwd.x * depth + rt.x * side, c.z + fwd.z * depth + rt.z * side, 0);
        s.hp = s.maxHp * hp;
      };
      // Ana yangın kümesi derinlemesine dizili (yandan bakınca sütunlar tek kalın sütunda birleşir; yanında açık gri) ve
      // solda, uzakta ayrı bir yangın (kadrajın içinde; sol kenarda yarım kalmasın)
      burn('factory', 0, 0, 0.12);
      burn('depot', 200, -25, 0.15);
      burn('house', -180, 30, 0.45);
      burn('house', -250, 45, 0.5);
      burn('mine', 1300, -450, 0.18);
    },
    at: 120,
    offset: 0,
    maxWait: 0,
    duration: 10,
    warm: 100,
    shot(c) {
      if (!lastPos.has(-56)) {
        // Kamera yangının cam.az yönünde (± 25° içinde görüşü en açık yer)
        let best = cam.az;
        let bestClear = -Infinity;
        for (let d = -25; d <= 25; d += 5) {
          const az = (cam.az + d) * DEG;
          const cx = fireAt.x + Math.sin(az) * cam.dist;
          const cz = fireAt.z - Math.cos(az) * cam.dist;
          const cy = groundLevel(cx, cz) + cam.height;
          let clear = Infinity;
          for (let s = 0.05; s < 0.95; s += 0.03) {
            const x = cx + (fireAt.x - cx) * s;
            const z = cz + (fireAt.z - cz) * s;
            clear = Math.min(clear, cy + (fireAt.y + 150 - cy) * s - groundLevel(x, z));
          }
          if (clear > bestClear) {
            bestClear = clear;
            best = cam.az + d;
          }
        }
        const az = best * DEG;
        const p = new THREE.Vector3(fireAt.x + Math.sin(az) * cam.dist, 0, fireAt.z - Math.cos(az) * cam.dist);
        p.y = groundLevel(p.x, p.z) + cam.height;
        lastPos.set(-56, p);
      }
      const p = lastPos.get(-56)!;
      const k = phase(c.t, -1, 10, ease.smooth);
      const fwd = fireAt.clone().sub(p).setY(0).normalize();
      const look = fireAt.clone().add(new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(cam.right)).add(new THREE.Vector3(0, lerp(cam.look[0], cam.look[1], k), 0));
      return { pos: p.clone(), look, fov: lerp(cam.fov[0], cam.fov[1], k), handheld: 0.5 };
    },
  };
}

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
  // ---- Geliştirici günlüğü: grafik önce/sonra (aynı çekim eski ve yeni kodla kaydedilip geçişle birleştirilir) ----
  {
    // Vadi: alçak uçan Spitfire çiftinin arkasından; altta ağaçlar ve tepeler, ortada ufuk, üstte gök
    id: 'gfx_valley',
    map: 'anakara',
    seed: 71,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      // Batı ovası, doğudaki tepelere doğru (14 km ötede ~1 km)
      const start = new THREE.Vector3(-30000, groundLevel(-30000, -40000) + 300, -40000);
      w.spawnAirborneFlight(0, 'spitfire9', 2, start, 90, plan('cap', 'spitfire9', {
        targetPos: new THREE.Vector3(30000, 0, -40000), altitude: start.y, patrolRadius: 3000, stationTime: 600,
      }), null);
    },
    at: 24,
    offset: 0,
    maxWait: 0,
    duration: 5,
    shot(c) {
      const a = track(c, 1);
      const k = phase(c.t, -1, 5, (x) => x);
      if (!a) return { pos: lastPos.get(1)!.clone().add(new THREE.Vector3(-60, 20, 0)), look: lastPos.get(1)!, fov: 55 };
      return c.d.chase(a, c.dt, { back: lerp(44, 30, k), up: lerp(7, 4, k), side: lerp(-7, -3, k), ahead: 160, lookUp: 26, fov: 55 });
    },
  },
  {
    // Bulutlar: 2,6 km'de Spitfire çifti kümülüslerin tepeleri arasından geçer; kamera arkada ve biraz üstte, altta
    // bulut gölgeli arazi
    id: 'gfx_clouds',
    map: 'anakara',
    seed: 72,
    clock: 10.5,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      // Haritanın en bulutlu bölgelerinden biri (batı, x ≈ -80 km, z ≈ 40 km)
      const start = new THREE.Vector3(-86000, 2600, 40000);
      w.spawnAirborneFlight(0, 'spitfire9', 2, start, 90, plan('cap', 'spitfire9', {
        targetPos: new THREE.Vector3(-50000, 0, 40000), altitude: start.y, patrolRadius: 3000, stationTime: 600,
      }), null);
    },
    at: 30,
    offset: 0,
    maxWait: 0,
    duration: 6,
    shot(c) {
      const a = track(c, 1);
      const k = phase(c.t, -1, 6, (x) => x);
      if (!a) return { pos: lastPos.get(1)!.clone().add(new THREE.Vector3(-60, 20, 0)), look: lastPos.get(1)!, fov: 55 };
      return c.d.chase(a, c.dt, { back: lerp(32, 22, k), up: lerp(7, 4, k), side: lerp(5, 3, k), ahead: 220, lookUp: 16, fov: 56 });
    },
  },
  {
    // Deniz: Takımadalar'da adanın güney açığında 180 m'de iki F4U, batan güneşe doğru; kamera arkada ve yukarıda,
    // önde güneşin denizdeki parıltı yolu, dalgalar, solda kıyı
    id: 'gfx_sea',
    map: 'takimada',
    seed: 84,
    clock: 17.2,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      const start = new THREE.Vector3(14000, 180, 33500);
      w.spawnAirborneFlight(0, 'f4u4', 2, start, 270, plan('cap', 'f4u4', {
        targetPos: new THREE.Vector3(-30000, 0, 33500), altitude: start.y, patrolRadius: 3000, stationTime: 600,
      }), null);
    },
    at: 20,
    offset: 0,
    maxWait: 0,
    duration: 6,
    shot(c) {
      const a = track(c, 1);
      const k = phase(c.t, -1, 6, (x) => x);
      if (!a) return { pos: lastPos.get(1)!.clone().add(new THREE.Vector3(60, 20, 0)), look: lastPos.get(1)!, fov: 55 };
      return c.d.chase(a, c.dt, { back: lerp(46, 30, k), up: lerp(16, 10, k), side: lerp(6, 3, k), ahead: 260, lookUp: -20, fov: 56 });
    },
  },
  {
    // Yoğuşma izleri: 8,6 km'de altı B-17, kamera kolun arkasında ve üstünde; izler kameraya doğru uzanır, kamera
    // yavaşça yana kayar. İzler zamanla birikir: 24 sn ısınma
    id: 'gfx_contrail',
    map: 'anakara',
    seed: 81,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      const start = new THREE.Vector3(-50000, 8600, -10000);
      w.spawnAirborneFlight(0, 'b17g', 6, start, 80, plan('cap', 'b17g', {
        targetPos: new THREE.Vector3(60000, 0, 10000), altitude: 8600, patrolRadius: 3000, stationTime: 900,
      }), null);
    },
    at: 40,
    offset: 0,
    maxWait: 0,
    duration: 5,
    warm: 24,
    shot(c) {
      const ids = c.w.aircraft.map((a) => a.id);
      const ctr = centroid(c, ids) ?? lastPos.get(-2)!;
      lastPos.set(-2, ctr.clone());
      const a = track(c, ids[0]);
      const f = a ? flightDir(a, new THREE.Vector3()).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const k = phase(c.t, -1, 5, (x) => x);
      const pos = ctr.clone().addScaledVector(f, -lerp(520, 430, k)).addScaledVector(r, lerp(-160, 120, k)).add(new THREE.Vector3(0, 95, 0));
      return { pos, look: ctr.clone().addScaledVector(f, 120), fov: 50, handheld: 0.5 };
    },
  },
  {
    // Ayrıntı: P-51D'nin sağ yanına bağlı kamera; kanopi yansıması, egzoz boruları ve pervane diski, güneş sağdan
    id: 'gfx_detail',
    map: 'anakara',
    seed: 82,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      const start = new THREE.Vector3(-30000, groundLevel(-30000, -40000) + 2200, -40000);
      w.spawnAirborneFlight(0, 'p51d', 1, start, 200, plan('cap', 'p51d', {
        targetPos: new THREE.Vector3(-45000, 0, -80000), altitude: start.y, patrolRadius: 3000, stationTime: 600,
      }), null);
    },
    at: 20,
    offset: 0,
    maxWait: 0,
    duration: 4.5,
    shot(c) {
      const a = track(c, 1);
      if (!a) return { pos: lastPos.get(1)!.clone().add(new THREE.Vector3(6, 2, 0)), look: lastPos.get(1)!, fov: 42 };
      // Önden çapraz: pervane diski, burun egzozları ve kanopi birlikte; kamera yavaşça yana süzülür
      const k = phase(c.t, -1, 4.5);
      return c.d.wing(a, { offset: [lerp(7, 9, k), lerp(2.2, 1.4, k), lerp(17, 14, k)], look: [0.6, 0.3, lerp(3.0, 3.8, k)], roll: 0.85, fov: 46 });
    },
  },
  {
    // Açılış: kırmızı fabrikanın 350 m üstünden 14 km'ye yükselen kamera; Stukalar pikeye girerken arazi, ormanlar,
    // ufuk ve gök açılır
    id: 'gfx_rise',
    map: 'anakara',
    seed: 11,
    setup: scenario('raid_dive'),
    at: 258,
    offset: 0,
    maxWait: 0,
    duration: 6,
    shot(c) {
      const f = factoryOf(c.w, 1).pos;
      const k = phase(c.t, -0.5, 6, ease.inOut);
      // Uzaklık logaritmik büyür (yükselme hızı yükseldikçe artar)
      const d = Math.exp(lerp(Math.log(900), Math.log(14000), k));
      const ang = 0.35 * Math.PI + k * 0.25;
      const pitch = lerp(14, 22, k) * DEG;
      const pos = new THREE.Vector3(f.x + Math.cos(ang) * Math.cos(pitch) * d, groundLevel(f.x, f.z) + Math.sin(pitch) * d,
        f.z + Math.sin(ang) * Math.cos(pitch) * d);
      return { pos, look: f.clone().setY(groundLevel(f.x, f.z) + 60), fov: 55 };
    },
  },
  {
    // Gün döngüsü (hızlandırılmış): Takımadalar'da volkanlı ada, kamera doğu-kuzeydoğuda 2,5 km yükseklikte ve batıya
    // bakar; güneş volkanın arkasında batar, gök altın rengiden pembeye, sonra yıldızlı geceye döner. 7 sn'de 2,8 saat.
    id: 'gfx_gun',
    map: 'takimada',
    seed: 83,
    clock: 17.8,
    clockSpeed: 0.4,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      peak = highestPointNear(0, 0, 12000);
    },
    at: 5,
    offset: 0,
    maxWait: 0,
    duration: 7,
    shot(c) {
      const k = phase(c.t, -1, 7, (x) => x);
      const az = lerp(64, 76, k) * DEG;
      const d = 21000;
      const pos = new THREE.Vector3(peak.x + Math.sin(az) * d, 2500, peak.z - Math.cos(az) * d);
      return { pos, look: new THREE.Vector3(peak.x, 1300, peak.z), fov: 50 };
    },
  },
  {
    // Duman ve ateş: Stuka bombası fabrikaya düşer; kamera 600 m uzakta, alçakta, yavaşça yana süzülür. Parlama, kora
    // dönen ateş topu, yere yayılan toz, sonra rüzgârla yatan duman sütunu; bakış sütunla birlikte yükselir.
    id: 'gfx_smoke',
    map: 'anakara',
    seed: 11,
    setup: scenario('raid_dive'),
    trigger: factoryHit,
    offset: -0.8,
    maxWait: 600,
    duration: 8,
    shake: 0.8,
    shot(c) {
      const at = c.s.at!;
      const k = phase(c.t, -1, 8, (x) => x);
      const a = (c.s.ang ?? 0) + lerp(-0.12, 0.12, k);
      const pos = at.clone().add(new THREE.Vector3(Math.cos(a) * 420, 0, Math.sin(a) * 420));
      pos.y = groundLevel(pos.x, pos.z) + 30;
      return { pos, look: at.clone().add(new THREE.Vector3(0, lerp(45, 120, phase(c.t, 0.5, 8)), 0)), fov: 42, handheld: 1 };
    },
  },
  {
    // Duman sütunu: ağır hasarlı fabrikadan yükselen, dibinde alev, tepesi rüzgârla bükülen kara duman; kamera
    // 750 m uzakta yavaşça döner
    id: 'gfx_column',
    map: 'anakara',
    seed: 51,
    setup: scenario('b17_raid'),
    trigger: (w) => {
      const f = factoryOf(w, 1);
      return f.hp < f.maxHp * 0.3 ? { ids: [], at: f.pos.clone(), ang: openAngle(f.pos, 750, 70) } : null;
    },
    offset: 28,
    maxWait: 900,
    duration: 7,
    // Duman yalnız çizilen karelerde birikir: sütunlar çekim başlamadan tam boyuna ulaşsın
    warm: 25,
    shot(c) {
      const at = c.s.at!;
      const k = phase(c.t, -1, 7, (x) => x);
      const a = (c.s.ang ?? 0) + lerp(-0.18, 0.18, k);
      const pos = at.clone().add(new THREE.Vector3(Math.cos(a) * 750, 0, Math.sin(a) * 750));
      pos.y = groundLevel(pos.x, pos.z) + 70;
      return { pos, look: at.clone().add(new THREE.Vector3(0, 130, 0)), fov: 48, handheld: 0.8 };
    },
  },
  // ---- Vitrin çekimleri: grafik güncellemesinden önce ve sonra aynı açı (önce/sonra karşılaştırması) ----
  {
    // Dost uçaksavar: kamera Mavi 20 mm topun arkasında, yerde; Kırmızı bir Bf 109 alçaktan (yapay zekânın tuttuğu
    // ~250 m) bataryanın 100 m yanından geçer, toplar ateşte; kamera yaklaşan uçağı tepeden geçip uzaklaşana kadar
    // çevirir. Saldırı emriyle uçaklar önce irtifa alıp yukarıdan dalıyor, bataryanın yanından alçakta geçmiyordu.
    id: 'vitrin_ucaksavar',
    map: 'anakara',
    seed: 91,
    setup(w) {
      const t = theater(w, { forward: false, blueTech: ['hd_20', 'hd_37'] });
      const c = landCenter();
      const site = w.addStructure(0, 'aa', 'Mavi vitrin bataryası', c.x, c.z, 0);
      site.aa!.level = 2;
      site.aa!.mounts.length = 0;
      // Yalnız hafif toplar: 37 mm'nin mermileri dalan uçağın çevresinde, kameranın dibinde patlayıp ekranı kaplıyordu
      for (const id of ['aa20', 'mg', 'aa20', 'mg'] as const) site.aa!.addMount(id);
      // Doğudan, bataryanın 350 m doğusundaki radara makineli tüfekle dalış (bombasız); taradıktan sonra alçaktan
      // bataryanın üstünden geçer. Hedef batarya olunca hasar dumanı kameranın önünü kapatıyordu; hedef uzakken yapay
      // zekâ bataryanın menzilinden yana sapıyor (hedefin 4 km yakınındaki bataryayı dolanmaz)
      const radar = w.addStructure(0, 'radar', 'Mavi radar', c.x + 350, c.z + 40, 0);
      const start = new THREE.Vector3(c.x + 7000, 0, c.z);
      start.y = groundLevel(start.x, start.z) + 250;
      w.spawnAirborneFlight(1, 'bf109g', 1, start, 270, plan('attack', 'bf109g', { targetStructureId: radar.id, passes: 2 }), t.redMain);
    },
    // En yakın geçişe 2 sn kala (geçişte bataryaya 350 m'den yakın)
    trigger: (w) => {
      const site = w.structures.find((s) => s.name === 'Mavi vitrin bataryası');
      const a = w.aircraft.find((x) => x.team === 1 && x.status === 'flying');
      if (!site || !a) return null;
      const v = a.velocity(new THREE.Vector3());
      const rel = a.pos.clone().sub(site.pos);
      const tca = -rel.dot(v) / Math.max(v.lengthSq(), 1);
      const miss = rel.addScaledVector(v, tca).length();
      return tca > 0 && tca < 2 && miss < 350 ? { ids: [a.id], at: site.pos.clone() } : null;
    },
    offset: 0,
    maxWait: 600,
    duration: 4.5,
    fxDist: 120,
    shot(c) {
      const site = c.s.at!;
      const a = track(c, c.s.ids[0]);
      const p = a ? a.pos : lastPos.get(c.s.ids[0])!;
      if (!lastPos.has(-5)) {
        // Kamera ilk 20 mm topun arkasında, uçağın geldiği yönün tersinde
        const st = c.w.structures.find((s) => s.aa && s.pos.distanceTo(site) < 1);
        const i = Math.max(0, st?.aa!.mounts.findIndex((m) => m.weapon === 'aa20') ?? 0);
        const [ox, oz] = AASite.mountOffset(i);
        const gun = new THREE.Vector3(site.x + ox, 0, site.z + oz);
        gun.y = groundLevel(gun.x, gun.z) + 1.6;
        const away = gun.clone().sub(p).setY(0).normalize();
        const cam = gun.clone().addScaledVector(away, 28);
        cam.y = groundLevel(cam.x, cam.z) + 3;
        lastPos.set(-5, cam);
        lastPos.set(-6, gun);
      }
      const cam = lastPos.get(-5)!;
      const gun = lastPos.get(-6)!;
      // Başta top ve uçak birlikte, uçak yaklaştıkça bakış ona kayar
      const k = phase(c.t, 0, 2.2);
      const toGun = gun.clone().sub(cam).normalize();
      const toAc = p.clone().sub(cam).normalize();
      const look = cam.clone().add(toGun.multiplyScalar(lerp(0.9, 0.15, k)).add(toAc).normalize().multiplyScalar(100));
      return c.d.tripod(cam, look, c.dt, lerp(52, 66, k), 0.1);
    },
  },
  {
    // Bombardıman yandan: B-17 kutusu bombaları bırakırken aynı irtifadan, 380 m yandan, dar açıyla; kamera bombaları
    // izleyerek aşağı eğilir
    id: 'vitrin_bombardiman',
    map: 'anakara',
    seed: 51,
    setup: scenario('b17_raid'),
    trigger: (w) => {
      if (w.bombs.length < 4) return null;
      const b = w.bombs[0].pos;
      const ids = w.aircraft.filter((a) => a.spec.id === 'b17g' && a.status === 'flying' && a.pos.distanceTo(b) < 1500)
        .sort((x, y) => x.pos.distanceTo(b) - y.pos.distanceTo(b)).map((a) => a.id);
      return ids.length ? { ids } : null;
    },
    offset: -1.2,
    maxWait: 900,
    duration: 6,
    shot(c) {
      // Özne bombayı ilk bırakan uçak; kamera onun kutunun dışına bakan yanında (kutunun kalanı arkasında)
      const ctr = centroid(c, c.s.ids) ?? lastPos.get(-7)!;
      lastPos.set(-7, ctr.clone());
      const a = track(c, c.s.ids[0]);
      const p = a ? a.pos : lastPos.get(c.s.ids[0])!;
      if (!lastPos.has(-8)) {
        const v = a ? a.velocity(new THREE.Vector3()).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
        const r = new THREE.Vector3(-v.z, 0, v.x);
        if (r.dot(p.clone().sub(ctr)) < 0) r.negate();
        lastPos.set(-8, v);
        lastPos.set(-11, r);
      }
      const f = lastPos.get(-8)!;
      const r = lastPos.get(-11)!;
      const k = phase(c.t, -1, 6, (x) => x);
      const tilt = phase(c.t, 1.2, 6);
      const pos = p.clone().addScaledVector(r, 190).addScaledVector(f, lerp(35, -25, k)).add(new THREE.Vector3(0, 6, 0));
      const look = p.clone().add(new THREE.Vector3(0, lerp(-6, -95, tilt), 0)).addScaledVector(f, lerp(-8, -30, tilt));
      return { pos, look, fov: lerp(38, 46, tilt), handheld: 0.6 };
    },
  },
  {
    // Alçak dalaş: sırtların hemen üstünde Spitfire, Bf 109'un arkasında ateşte; kamera atış hattının arkasında ve
    // biraz yukarısında (altta arazi ve ağaçlar akar)
    id: 'vitrin_dalas',
    map: 'anakara',
    seed: 93,
    setup: scenario('df_low'),
    trigger: (w) => {
      for (const e of w.events) {
        if (e.kind !== 'hit') continue;
        const tgt = w.aircraft.find((x) => x.status === 'flying' && x.pos.distanceTo(e.pos) < 25);
        if (!tgt) continue;
        const att = w.aircraft.filter((x) => x.team !== tgt.team && x.status === 'flying' && x.firing && x.pos.distanceTo(tgt.pos) < 600)
          .sort((p, q) => p.pos.distanceTo(tgt.pos) - q.pos.distanceTo(tgt.pos))[0];
        if (att) return { ids: [att.id, tgt.id] };
      }
      return null;
    },
    offset: -2.2,
    maxWait: 400,
    duration: 5,
    shot(c) {
      const s = track(c, c.s.ids[0]);
      const b = track(c, c.s.ids[1]);
      const sp = s ? s.pos : lastPos.get(c.s.ids[0])!;
      const bp = b ? b.pos : lastPos.get(c.s.ids[1])!;
      c.d.heading.time = 0.22;
      const f = c.d.heading.update(bp.clone().sub(sp).normalize(), c.dt).clone().normalize();
      const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
      const k = phase(c.t, -1, 5);
      const pos = sp.clone().addScaledVector(f, -lerp(30, 22, k)).addScaledVector(r, -3).add(new THREE.Vector3(0, 10, 0));
      const look = sp.clone().lerp(bp, 0.42);
      const up = new THREE.Vector3(0, 1, 0).lerp(s ? s.upv : new THREE.Vector3(0, 1, 0), 0.3).normalize();
      return { pos, look, up, fov: lerp(52, 46, k), handheld: 0.8 };
    },
  },
  {
    // Gün batımında B-17 kolu (vitrin): bulut tepelerinin hemen üstünde (3,2 km) doğuya uçar; kamera kolun batısında,
    // arkasında ve biraz yukarıda: alçalan güneş kameranın arkasından metal gövdeleri turuncuya boyar, önde pembe
    // bulut denizi ve karşı ufukta Venüs kuşağı
    id: 'vitrin_b17_batim',
    map: 'takimada',
    seed: 22,
    clock: 18.75,
    clearClouds: true,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      const alt = 3200;
      const z = 26000;
      w.spawnAirborneFlight(0, 'b17g', 9, new THREE.Vector3(-30000, alt, z), 90, plan('cap', 'b17g', {
        targetPos: new THREE.Vector3(60000, 0, z), altitude: alt, patrolRadius: 3000, stationTime: 900,
      }), null);
    },
    at: 60,
    offset: 0,
    maxWait: 0,
    duration: 8,
    warm: 2,
    shot(c) {
      // Kolun en arkadaki uçağına bağlı: onun gerisinde (batı) ve solunda, kol önde açılır
      const ids = c.w.aircraft.map((a) => a.id);
      if (!lastPos.has(-12)) {
        const back = ids.map((id) => c.ac(id)).filter((a) => a).sort((a, b) => a!.pos.x - b!.pos.x)[0];
        lastPos.set(-12, new THREE.Vector3(back ? back.id : ids[0], 0, 0));
      }
      const a = track(c, lastPos.get(-12)!.x);
      if (!a) return { pos: lastPos.get(-13)!.clone(), look: lastPos.get(-14)!.clone(), fov: 46 };
      const k = phase(c.t, -1, 8, (x) => x);
      const shot = c.d.chase(a, c.dt, { back: lerp(95, 70, k), up: lerp(14, 9, k), side: lerp(-12, -6, k), ahead: 300, lookUp: 14, fov: 46 });
      lastPos.set(-13, shot.pos.clone());
      lastPos.set(-14, shot.look.clone());
      return shot;
    },
  },
  {
    // Altın saatte fabrika baskını (vitrin): kamera fabrikanın kenarında, yerden 8 m; tuğla holler ve bacalar ön
    // planda, Stuka dalışı ve bomba isabeti; bakış dalan uçaktan isabete iner
    id: 'vitrin_fabrika',
    map: 'anakara',
    seed: 11,
    clock: 18.1,
    setup: scenario('raid_dive'),
    trigger: factoryHit,
    offset: -3.4,
    maxWait: 600,
    duration: 7.5,
    shake: 1.0,
    shot(c) {
      const at = c.s.at!;
      const f = factoryOf(c.w, 1);
      if (!lastPos.has(-13)) {
        const a = openAngle(f.pos, 330, 10) + 0.5;
        const p = f.pos.clone().add(new THREE.Vector3(Math.cos(a) * 330, 0, Math.sin(a) * 330));
        p.y = groundLevel(p.x, p.z) + 9;
        lastPos.set(-13, p);
      }
      const cam = lastPos.get(-13)!;
      const st = track(c, 1);
      const sp = st ? st.pos : lastPos.get(1) ?? at;
      const k = phase(c.t, 1.6, 3.6);
      const look = sp.clone().lerp(at.clone().add(new THREE.Vector3(0, 35, 0)), k);
      return c.d.tripod(cam, look, c.dt, lerp(34, 48, k), 0.25);
    },
  },
  {
    // Manzaralı B-17: Takımadalar'da iç denizin üstünde kol kameraya doğru gelir, arkada volkanlı ada; kamera batıya
    // bakar (gün batımı sürümünde güneş kolun arkasında). Gün döngüsü olan kodda saat 18:36 (güneş 5°, altın ışık).
    id: 'vitrin_b17',
    map: 'takimada',
    seed: 21,
    clock: 18.6,
    // Kol bulut tabakasının içinde uçar: önündeki bulut açılır, arkadaki gün batımı bulutları kalır
    clearClouds: true,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      const alt = 1800;
      const z = 33000;
      w.spawnAirborneFlight(0, 'b17g', 9, new THREE.Vector3(-16000, alt, z), 90, plan('cap', 'b17g', {
        targetPos: new THREE.Vector3(60000, 0, z), altitude: alt, patrolRadius: 3000, stationTime: 900,
      }), null);
    },
    at: 95,
    offset: 0,
    maxWait: 0,
    duration: 6,
    shot(c) {
      const ids = c.w.aircraft.map((a) => a.id);
      const ctr = centroid(c, ids) ?? lastPos.get(-9)!;
      lastPos.set(-9, ctr.clone());
      if (!lastPos.has(-10)) lastPos.set(-10, ctr.clone());
      const c0 = lastPos.get(-10)!;
      // Kolun güneyinde, aynı irtifada, yavaş kayan kamera; kuzeye bakar: kol soldan sağa geçer, 33 km arkada volkan
      // kolun hemen arkasına denk gelir
      const k = phase(c.t, -1, 6, (x) => x);
      const pos = c0.clone().add(new THREE.Vector3(lerp(120, 300, k), lerp(-25, -15, k), 430));
      return c.d.tripod(pos, ctr.clone().add(new THREE.Vector3(40, 25, 0)), c.dt, 44, 0.2);
    },
  },
  {
    // Altın saatte hava üssü (yapılar): kamera apronda, ilk hangarın önünde yerden kalkıp yükselir; oluklu sac
    // hangarlar, apronda bekleyen avcılar, araçlar, barakalar, arkada kule. Bir çift Spitfire kameranın arkasından
    // gelip pistin üstünden geçer.
    id: 'yapi_us',
    map: 'anakara',
    seed: 5,
    clock: 17.5,
    setup(w) {
      const t = theater(w, { forward: false });
      const ab = t.blueMain;
      for (const id of ['spitfire1', 'spitfire1', 'spitfire1', 'hurricane1', 'hurricane1', 'spitfire1']) ab.addAirframe(newAirframe(id, 0, 0.8));
      const y = ab.s.pos.y + 260;
      const hdg = (ab.s.heading * 180) / Math.PI;
      w.spawnAirborneFlight(0, 'spitfire1', 2, ab.runwayPoint(-9000, 90).setY(y), hdg, plan('cap', 'spitfire1', {
        targetPos: ab.runwayPoint(40000, 90), altitude: y, speed: 'max', patrolRadius: 3000, stationTime: 600,
      }), null);
    },
    // Öndeki Spitfire üssün 850 m gerisindeyken başlar: kayıt boyunca pistin üstünden geçer
    trigger: (w) => {
      const ab = blueMainBase(w);
      const a = w.aircraft[0];
      if (!a) return null;
      return ab.toRunway(a.pos.x, a.pos.z).u > -850 ? { ids: [a.id], at: ab.s.pos.clone() } : null;
    },
    offset: 0,
    maxWait: 200,
    duration: 8,
    shot(c) {
      // Kamera öndeki Spitfire'ın sol arkasında; bakış uçakla sağda kalan hangar dizisinin arasında: uçak kadrajın
      // üstünde, altında pist, apronda bekleyen avcılar ve hangarlar (akşam güneşi batıdan, hangarların önü aydınlık)
      const a = track(c, c.s.ids[0]);
      if (!a) return { pos: lastPos.get(-30)!.clone(), look: lastPos.get(-31)!.clone(), fov: 56 };
      const sh = c.d.chase(a, c.dt, { back: 30, up: 8, side: -9, fov: 56 });
      const f = flightDir(a, new THREE.Vector3()).setY(0).normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      sh.look.copy(a.pos).addScaledVector(f, 150).addScaledVector(r, 60).add(new THREE.Vector3(0, -90, 0));
      lastPos.set(-30, sh.pos.clone());
      lastPos.set(-31, sh.look.clone());
      return sh;
    },
  },
  {
    // Akşam ışığında kasaba (yapılar): fabrikanın yanında sokak düzeninde evler, apartmanlar, çarşı, iş merkezi,
    // park ve ambar; kamera ana caddenin batı ucundan ev sıraları arasında doğuya ilerler (güneş arkada, batıda)
    id: 'yapi_kasaba',
    map: 'anakara',
    seed: 6,
    clock: 17.6,
    setup(w) {
      const t = theater(w, { forward: false });
      town(w, 0, t.blueFactory.pos);
    },
    at: 20,
    offset: 0,
    maxWait: 0,
    duration: 8,
    shot(c) {
      // Güneybatıdan, kasabanın çaprazından yavaş yay (dikey kadrajda binalar derinlikte üst üste dizilir); güneş
      // batıdan, kameranın yan arkasında
      const o = townAt;
      const k = phase(c.t, 0, 8, ease.smooth);
      const a = lerp(150, 122, k) * DEG;
      const R = lerp(270, 215, k);
      const pos = o.clone().add(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
      pos.y = groundLevel(pos.x, pos.z) + lerp(80, 52, k);
      const look = o.clone().add(new THREE.Vector3(-30, 0, 0));
      look.y = groundLevel(look.x, look.z);
      return c.d.tripod(pos, look, c.dt, 40, 0.15);
    },
  },
  {
    // Gece baskını (yapılar): mavi saatte fabrika; pencerelerde ışık, uçaksavar iz mermileri gökyüzünü tarar, Stuka
    // dalar ve bomba tuğla holün yanına düşer. Kamera fabrikanın kenarında, yerden 7 m; bakış pencerelerden dalan
    // uçağa çıkar, isabete iner.
    id: 'yapi_gece',
    map: 'anakara',
    seed: 11,
    clock: 20.4,
    setup: scenario('raid_dive'),
    trigger: factoryHit,
    offset: -5,
    maxWait: 600,
    duration: 8,
    shake: 1.0,
    shot(c) {
      const at = c.s.at!;
      const f = factoryOf(c.w, 1);
      if (!lastPos.has(-13)) {
        const a = openAngle(f.pos, 300, 10) + 0.5;
        const p = f.pos.clone().add(new THREE.Vector3(Math.cos(a) * 300, 0, Math.sin(a) * 300));
        p.y = groundLevel(p.x, p.z) + 7;
        lastPos.set(-13, p);
      }
      const cam = lastPos.get(-13)!;
      const st = track(c, 1);
      const sp = st ? st.pos : lastPos.get(1) ?? at;
      const halls = f.pos.clone().setY(groundLevel(f.pos.x, f.pos.z) + 22);
      const up = phase(c.t, 1.2, 3.0);
      const down = phase(c.t, 3.4, 5.0);
      // Yukarı bakarken de çatılar kadrajın altında kalır: gökte iz mermileri, altta ışıklı pencereler
      const look = halls.clone().lerp(sp, up * 0.45).lerp(at.clone().add(new THREE.Vector3(0, 30, 0)), down);
      return c.d.tripod(cam, look, c.dt, lerp(lerp(42, 56, up), 46, down), 0.25);
    },
  },
  {
    // Ağır uçaksavar mevzisi (yapılar): akşam ışığında 4. seviye batarya (8,8 cm, 12,8 cm, Bofors, 37 mm, dörtlü
    // 20 mm; Würzburg radarı, telemetre, hesap makinesi). B-17 kolu 4,2 km'den tepeden geçer; kamera 8,8 cm topun
    // arkasında, yerde: altta top, yukarıda flak patlamaları ve bombardıman uçakları
    id: 'yapi_ucaksavar',
    map: 'anakara',
    seed: 7,
    clock: 17.4,
    setup(w) {
      theater(w, { forward: false });
      const c = flatSpot(w, landCenter(), 0, 3000, 120);
      const site = w.addStructure(0, 'aa', 'Vitrin ağır bataryası', c.x, c.z, 0);
      const aa = site.aa!;
      aa.level = 4;
      aa.mounts.length = 0;
      for (const id of ['aa88', 'aa40', 'aa128', 'aa88', 'aa37', 'aa20q'] as const) aa.addMount(id);
      for (const id of ['gunRadar', 'rangefinder', 'predictor'] as const) aa.sensors.add(id);
      // Hedef bataryanın kendisi: yapay zekâ hedefinin uzağındaki bataryanın menzilinden sapar, hedefe düz gider
      // (kayıt bombalar bırakılmadan biter)
      const y = groundLevel(c.x, c.z) + 2600;
      w.spawnAirborneFlight(1, 'b17g', 6, new THREE.Vector3(c.x + 9000, y, c.z + 300), 270,
        plan('levelBomb', 'b17g', { targetStructureId: site.id, altitude: y }), null);
    },
    trigger: (w) => {
      const site = w.structures.find((s) => s.name === 'Vitrin ağır bataryası');
      const a = w.aircraft.find((x) => x.status === 'flying');
      if (!site || !a) return null;
      return Math.hypot(a.pos.x - site.pos.x, a.pos.z - site.pos.z) < 2000 ? { ids: w.aircraft.map((x) => x.id), at: site.pos.clone() } : null;
    },
    offset: 0,
    maxWait: 800,
    duration: 9,
    shake: 0.6,
    fxDist: 120,
    shot(c) {
      // Mevzinin yanından (kol soldan sağa geçer), 20 m yukarıdan yay çizen kamera; bakış mevzinin ortasına: çukurlarda
      // ateş eden toplar, namlular kola dönük, dönen Würzburg çanağı, yukarıda iz mermileri
      const site = c.s.at!;
      if (!lastPos.has(-40)) {
        const ctr = centroid(c, c.s.ids) ?? site;
        lastPos.set(-40, site.clone().sub(ctr).setY(0).normalize());
      }
      const away = lastPos.get(-40)!;
      const side = new THREE.Vector3(-away.z, 0, away.x);
      if (c.t < 4.5) {
        // Önce ateş eden 8,8 cm topun çevresinde alçak yay (11 m)
        const st = c.w.structures.find((s) => s.aa && s.pos.distanceTo(site) < 1)!;
        const [ox, oz] = AASite.mountOffset(Math.max(0, st.aa!.mounts.findIndex((m) => m.weapon === 'aa88')));
        const gun = new THREE.Vector3(site.x + ox, 0, site.z + oz);
        gun.y = groundLevel(gun.x, gun.z) + 1.8;
        // Topun yanından (namlu kola, kamera ona dik), duvarın üstünden; hafif öne doğru yay
        const a0 = Math.atan2(side.z, side.x);
        const a = a0 + lerp(0.15, -0.55, phase(c.t, 0, 4.5, ease.smooth));
        const pos = gun.clone().add(new THREE.Vector3(Math.cos(a) * 12, 0, Math.sin(a) * 12));
        pos.y = groundLevel(pos.x, pos.z) + 6;
        return c.d.tripod(pos, gun, c.dt, 54, 0.15);
      }
      if (!lastPos.has(-43)) {
        c.d.cut();
        lastPos.set(-43, site.clone());
      }
      // Sonra komuta yeri: Würzburg, telemetre, hesap makinesi, arkada çukurlarda toplar
      const k = phase(c.t, 4.5, 9, ease.smooth);
      const pos = site.clone().addScaledVector(side, 36).addScaledVector(away, lerp(-10, 10, k));
      pos.y = groundLevel(pos.x, pos.z) + lerp(21, 17, k);
      const look = site.clone().addScaledVector(side, -4);
      look.y = groundLevel(look.x, look.z) + 1;
      return c.d.tripod(pos, look, c.dt, 58, 0.3);
    },
  },
  {
    // Radar istasyonu (yapılar): akşam ışığında Radar II, yukarı daralan kafes kule ve tepede dönen anten, yanında
    // dönen Freya; kamera istasyonun çevresinde yavaşça döner ve yükselir
    id: 'yapi_radar',
    map: 'anakara',
    seed: 8,
    clock: 17.6,
    setup(w) {
      theater(w, { forward: false });
      const c = flatSpot(w, landCenter(), 0, 3000, 70);
      const r = w.addStructure(0, 'radar', 'Vitrin radarı', c.x, c.z, 0);
      r.radar!.level = 2;
      radarAt.copy(r.pos);
    },
    at: 30,
    offset: 0,
    maxWait: 0,
    duration: 8,
    shot(c) {
      const k = phase(c.t, 0, 8, ease.smooth);
      const a = lerp(200, 245, k) * DEG;
      const R = lerp(95, 80, k);
      const pos = radarAt.clone().add(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
      pos.y = groundLevel(pos.x, pos.z) + lerp(6, 22, k);
      // Yapı grubu π − yön kadar döner: kule (yerelde −26, −4) dünyada istasyonun +26, +4 tarafında
      const look = radarAt.clone().add(new THREE.Vector3(13, 0, 2));
      look.y = groundLevel(look.x, look.z) + lerp(24, 30, k);
      return c.d.tripod(pos, look, c.dt, 58, 0.2);
    },
  },
  // ---- Akşam çekimleri (geliştirici günlüğü 2): gün batımı ışığında manzara ----
  {
    // Gün batımında yoğuşma izleri: 8,6 km'de altı B-17 batan güneşe doğru uçar; izler turuncu-pembe ışır, önde
    // turuncu gök ve ufkun üstünde güneş, aşağıda dağınık bulutlar. Kamera kolun arkasında ve üstünde, çevresinde
    // yavaşça döner (10 sn'de 30°). İzler 32 sn yaşar: ısınma tam boylarına ulaşsınlar diye
    id: 'aksam_b17_iz',
    map: 'anakara',
    seed: 81,
    clock: 18.8,
    clouds: 0.6,
    clearClouds: true,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      // Güneşe doğru (pusula 250°)
      const start = new THREE.Vector3(30000, 8600, -5000);
      w.spawnAirborneFlight(0, 'b17g', 6, start, 250, plan('cap', 'b17g', {
        targetPos: new THREE.Vector3(-90000, 0, 35000), altitude: 8600, patrolRadius: 3000, stationTime: 900,
      }), null);
    },
    at: 50,
    offset: 0,
    maxWait: 0,
    duration: 10,
    warm: 34,
    shot(c) {
      // Yön ve özne kayıt başında bir kez: kol hafif dönse de yörünge sarsılmasın. Kol kilometrelerce açık uçar
      // (öndekiler ufukta, izlerin başladığı yerde): yörünge en arkadaki uçağın çevresinde
      if (!lastPos.has(-51)) {
        const list = c.w.aircraft.filter((x) => x.status === 'flying');
        const f0 = list[0] ? flightDir(list[0], new THREE.Vector3()).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
        const back = list.sort((p, q) => p.pos.dot(f0) - q.pos.dot(f0))[0];
        lastPos.set(-51, f0);
        lastPos.set(-58, new THREE.Vector3(back ? back.id : 1, 0, 0));
      }
      const a = track(c, lastPos.get(-58)!.x);
      const ctr = a ? a.pos.clone() : lastPos.get(lastPos.get(-58)!.x)!.clone();
      const f = lastPos.get(-51)!;
      const r = new THREE.Vector3(-f.z, 0, f.x);
      // Açı uçuş yönünden (180 tam arka): arkada, bir yandan öbür yana doğru yavaş yay
      const k = phase(c.t, -1, 10, ease.smooth);
      const th = lerp(B17_ORBIT[0], B17_ORBIT[1], k) * DEG;
      // Kamera izlerin üstünde kalır (alçalınca yakın izler kadrajı kaplayan bantlara dönüşüyordu)
      const R = lerp(500, 470, k);
      const pos = ctr.clone().addScaledVector(f, Math.cos(th) * R).addScaledVector(r, Math.sin(th) * R).add(new THREE.Vector3(0, lerp(125, 115, k), 0));
      // Bakış uçağın hemen önüne: uçak kadrajın ortasında (alttaki yazı payının üstünde), ufuk ve güneş üst üçte birde
      return { pos, look: ctr.addScaledVector(f, 60), fov: 52, handheld: 0.25 };
    },
  },
  {
    // Akşam alçak geçiş: P-51D, dost hafif uçaksavar mevzisinin 70 m yanından yerden ~35 m yüksekte tam gazla
    // (~590 km/s) geçer ve batan güneşe doğru uzaklaşır. Kamera mevzinin öbür yanında bir Bofors'un arkasında, yerde:
    // uçak altın ışıkta yaklaşır, top ön planda; geçtikten sonra kamera onu izleyerek yavaşça yakınlaşır (gün
    // batımının önünde siluet)
    id: 'aksam_p51_gecis',
    map: 'anakara',
    seed: 82,
    clock: 18.45,
    clouds: 0.45,
    setup(w) {
      w.addTeam('Mavi', '#5b7ec9');
      w.addTeam('Kırmızı', '#d9725f');
      const c = flatSpot(w, landCenter(), 0, 3000, 120);
      const site = w.addStructure(0, 'aa', 'Akşam bataryası', c.x, c.z, 0);
      site.aa!.level = 3;
      site.aa!.mounts.length = 0;
      for (const id of ['aa40', 'aa20', 'aa37', 'mg', 'aa20', 'aa40'] as const) site.aa!.addMount(id);
      // Güneşe (pusula 250°) doğru uçar; mevzinin 110 m kuzeyinden geçecek doğrultuda, 7 km geriden başlar
      const h = P51_HEADING * DEG;
      const f = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const start = c.clone().addScaledVector(f, -7000).addScaledVector(r, P51_SIDE);
      start.y = groundLevel(start.x, start.z) + 60;
      const goal = c.clone().addScaledVector(f, 45000).addScaledVector(r, P51_SIDE);
      w.spawnAirborneFlight(0, 'p51d', 1, start, P51_HEADING, plan('cap', 'p51d', {
        targetPos: goal, altitude: start.y, speed: 'max', lowLevel: true, agl: 30, patrolRadius: 3000, stationTime: 600,
      }), null);
    },
    // En yakın geçişe 3 sn kala
    trigger: (w) => {
      const site = w.structures.find((s) => s.name === 'Akşam bataryası');
      const a = w.aircraft.find((x) => x.status === 'flying');
      if (!site || !a) return null;
      const v = a.velocity(new THREE.Vector3());
      const rel = a.pos.clone().sub(site.pos);
      const tca = -rel.dot(v) / Math.max(v.lengthSq(), 1);
      return tca > 0 && tca < 3 ? { ids: [a.id], at: site.pos.clone() } : null;
    },
    offset: 0,
    maxWait: 120,
    duration: 11,
    fxDist: 120,
    shot(c) {
      const site = c.s.at!;
      const a = track(c, c.s.ids[0]);
      const p = a ? a.pos : lastPos.get(c.s.ids[0])!;
      if (!lastPos.has(-52)) {
        // Uçağın geçeceği yanın karşısındaki Bofors; kamera onun 9 m ilerisinde (uçağın gideceği yönde) ve 4 m dışında,
        // yerden 2,5 m: gelen uçağa bakınca top ön planda
        const v = a ? a.velocity(new THREE.Vector3()).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
        const r = new THREE.Vector3(-v.z, 0, v.x);
        if (r.dot(p.clone().sub(site).setY(0)) > 0) r.negate();
        const st = c.w.structures.find((s) => s.aa && s.pos.distanceTo(site) < 1)!;
        let gun = site.clone();
        let best = -Infinity;
        st.aa!.mounts.forEach((m, i) => {
          if (m.weapon !== 'aa40') return;
          const [ox, oz] = AASite.mountOffset(i);
          const g = new THREE.Vector3(site.x + ox, 0, site.z + oz);
          const far = r.dot(g.clone().sub(site));
          if (far > best) {
            best = far;
            gun = g;
          }
        });
        gun.y = groundLevel(gun.x, gun.z) + 1.6;
        const cam = gun.clone().addScaledVector(v, 9).addScaledVector(r, 4);
        cam.y = groundLevel(cam.x, cam.z) + 2.5;
        lastPos.set(-52, cam);
        lastPos.set(-57, gun);
      }
      const cam = lastPos.get(-52)!;
      const gun = lastPos.get(-57)!;
      // Başta top ve yaklaşan uçak birlikte; uçak yaklaştıkça bakış ona kayar. Geçişten sonra (≈3 sn) yavaş yakınlaşma
      const k = phase(c.t, 0, 2.6);
      const toGun = gun.clone().sub(cam).normalize();
      const toAc = p.clone().sub(cam).normalize();
      const look = cam.clone().add(toGun.multiplyScalar(lerp(0.9, 0, k)).add(toAc).normalize().multiplyScalar(100));
      // Yakınlaşma logaritmik (görüntü sabit hızla büyür): geçişten hemen sonra başlar, yavaşça sürer. Bakış uçağın
      // 0,7° üstüne kalkar: dar açıda öndeki ağaç kadrajın ortasına büyümesin, uçak alttaki yazı payının üstünde kalsın
      const z = phase(c.t, 3.4, 10.6, ease.smooth);
      const fov = Math.exp(lerp(Math.log(lerp(56, 64, k)), Math.log(6), z));
      look.y += 1.2 * z;
      return c.d.tripod(cam, look, c.dt, fov, lerp(0.1, 0.25, phase(c.t, 3.6, 6)));
    },
  },
  {
    // Kuyruk kamerası: alçak dalaşta ateş eden Spitfire'ın kuyruğunun sağ yanına sabitlenmiş kamera; gövde boyunca
    // ileri bakar, uçakla birlikte yatar. Güneş ufkun hemen altında (alacakaranlık başlarken); hava açık
    id: 'aksam_kuyruk',
    map: 'anakara',
    seed: 93,
    clock: 19.1,
    clouds: 0,
    setup: scenario('df_low'),
    trigger: (w) => {
      for (const e of w.events) {
        if (e.kind !== 'hit') continue;
        const tgt = w.aircraft.find((x) => x.status === 'flying' && x.pos.distanceTo(e.pos) < 25);
        if (!tgt) continue;
        const att = w.aircraft.filter((x) => x.team !== tgt.team && x.status === 'flying' && x.firing && x.pos.distanceTo(tgt.pos) < 600)
          .sort((p, q) => p.pos.distanceTo(tgt.pos) - q.pos.distanceTo(tgt.pos))[0];
        if (att) return { ids: [att.id, tgt.id] };
      }
      return null;
    },
    offset: -4,
    maxWait: 400,
    duration: 9,
    shot(c) {
      const a = track(c, c.s.ids[0]);
      if (!a) return { pos: lastPos.get(-53)!.clone(), look: lastPos.get(-54)!.clone(), up: lastPos.get(-55)!.clone(), fov: TAIL_CAM.fov };
      const shot = c.d.wing(a, { offset: TAIL_CAM.offset, look: TAIL_CAM.look, roll: 1, fov: TAIL_CAM.fov });
      lastPos.set(-53, shot.pos.clone());
      lastPos.set(-54, shot.look.clone());
      lastPos.set(-55, shot.up!.clone());
      return { ...shot, handheld: 0.2 };
    },
  },
  horizonSmoke('aksam_duman', SMOKE_SIDE),
];

/** Akşam B-17 yörüngesi: uçuş yönünden açı (derece; 180 tam arka, sağ +), başta ve sonda. */
const B17_ORBIT: [number, number] = [200, 170];
/** Akşam P-51 geçişi: uçuş yönü (pusula) ve mevziye yanal uzaklık (m; sağ +). */
const P51_HEADING = 250;
const P51_SIDE = 70;
/** Kuyruk kamerası: uçağın ekseninde konum ve bakış (x sağ, y üst, z burun; m). */
const TAIL_CAM = { offset: [1.0, 0.55, -5.6] as [number, number, number], look: [0.15, 1.4, 60] as [number, number, number], fov: 66 };

/** Radar çekiminin istasyonu (kurulumda yazılır; çekim notları kayıt başında silinir). */
const radarAt = new THREE.Vector3();

/** near çevresinde (rMin–rMax) öbür yapılardan uzak, yarıçapı r olan en düz yer. */
function flatSpot(w: World, near: THREE.Vector3, rMin: number, rMax: number, r: number): THREE.Vector3 {
  let best = near.clone();
  let bestRelief = Infinity;
  for (let d = rMin; d <= rMax; d += 250) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = near.x + Math.cos(a) * d;
      const z = near.z + Math.sin(a) * d;
      if (w.structures.some((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < (s.kind === 'airbase' ? 2000 : 600))) continue;
      const st = footprintStats(x, z, r, r, 0);
      if (st.outside || st.water > 0) continue;
      if (st.max - st.min < bestRelief) {
        bestRelief = st.max - st.min;
        best = new THREE.Vector3(x, 0, z);
      }
    }
  }
  return best;
}

const blueMainBase = (w: World) => w.structures.find((s) => s.kind === 'airbase' && s.team === 0)!.airbase!;

/** Vitrin kasabasının düzeni: [tür, doğu (m), güney (m)]; ana cadde ortada doğu-batı. */
const TOWN: [StructureKind, number, number][] = [
  ['shops', 0, 62], ['office', 152, 72], ['apartment', -112, 52], ['apartment', -112, -56], ['park', 0, -82], ['depot', 304, -64],
  ['house', -202, 46], ['house', -242, 46], ['house', -282, 46], ['house', -322, 46], ['house', -202, -46], ['house', -242, -46],
  ['house', -282, -46], ['house', -322, -46], ['house', 150, -58], ['house', 190, -58], ['house', 242, 62], ['house', 282, 62],
  // Arka sokaklar: ana caddenin iki yanında ikinci sıra evler ve apartmanlar
  ['house', -202, 132], ['house', -242, 132], ['house', -282, 132], ['house', -322, 132], ['apartment', -112, 140],
  ['house', -202, -132], ['house', -242, -132], ['house', -282, -132], ['house', -322, -132], ['apartment', -112, -146],
  ['house', 40, -170], ['house', 80, -170], ['house', -40, -170], ['house', 40, 160], ['house', 80, 160], ['house', -40, 160],
];

/** Vitrin kasabasının merkezi (town() kurar; çekim notları kayıt başında silindiği için ayrı). */
const townAt = new THREE.Vector3();

/** Kasabayı fabrikanın 1–2,6 km çevresinde, öbür yapılardan uzak, en düz yere kurar. */
function town(w: World, team: number, near: THREE.Vector3): void {
  let best = near.clone();
  let bestRelief = Infinity;
  for (let r = 1000; r <= 2600; r += 200) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = near.x + Math.cos(a) * r;
      const z = near.z + Math.sin(a) * r;
      if (w.structures.some((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < (s.kind === 'airbase' ? 1800 : 700))) continue;
      const st = footprintStats(x, z, 420, 180, 0);
      if (st.outside || st.water > 0) continue;
      if (st.max - st.min < bestRelief) {
        bestRelief = st.max - st.min;
        best = new THREE.Vector3(x, 0, z);
      }
    }
  }
  for (const [kind, u, v] of TOWN) w.addStructure(team, kind, w.structureName(team, kind), best.x + u, best.z + v, 0);
  townAt.copy(best).setY(groundLevel(best.x, best.z));
}
