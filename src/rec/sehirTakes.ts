// Şehir güncellemesi videosu için yapı klipleri (2026-11-14; yeni sürüm, kasaba yeni kurallarla): maden ocağı, radar ve kasaba; kuş bakışı, kamera yapının
// çevresinde yavaşça döner (güneş kameranın arkasında). Eski sürüm (canlı kod) ve yeni sürüm aynı çekimle kaydedilir.
// Kayıt: node tools/rec/record.mjs --size=2340x1080 --dir=sehir s_maden s_radar s_kasaba

import * as THREE from 'three';
import type { World } from '../sim/world';
import type { StructureKind } from '../sim/structures/structure';
import { landCenter, plan, theater } from '../sim/scenarios';
import { footprintStats, groundLevel } from '../sim/terrain';
import { sunAt } from '../render/atmosphere';
import { lerp, phase, ease } from './director';
import { foundTown } from '../sim/campaign';
import { AASite } from '../sim/structures/airDefense';
import type { AAWeaponId } from '../sim/structures/aaWeapons';
import { STRUCTURE_DEFS } from '../sim/structures/structure';
import { GRID, ROAD_VERGE, lotAt, projectOnRoad } from '../sim/roads';
import type { Take } from './takes';

const DEG = Math.PI / 180;
/** Kadrajın kurulduğu yatay telefon tuvali (2340×1080). */
const WIDE_ASPECT = 2340 / 1080;
/** Dikey tuvalin dikey görüş açısı (derece) ve yapının ekran genişliğindeki payının yatay klibe oranı. */
const TALL_FOV = 46;
const TALL_FILL = 1.4;
const wide = (): boolean => innerWidth > innerHeight;

/** near çevresinde (rMin–rMax) öbür yapılardan uzak, w × h yarı ölçülü en düz kuru yer. */
function flatSpot(w: World, near: THREE.Vector3, rMin: number, rMax: number, hw: number, hh: number): THREE.Vector3 {
  let best = near.clone();
  let bestRelief = Infinity;
  for (let d = rMin; d <= rMax; d += 200) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = near.x + Math.cos(a) * d;
      const z = near.z + Math.sin(a) * d;
      if (w.structures.some((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < (s.kind === 'airbase' ? 2000 : 700))) continue;
      const st = footprintStats(x, z, hw, hh, 0);
      if (st.outside || st.water > 0) continue;
      if (st.max - st.min < bestRelief) {
        bestRelief = st.max - st.min;
        best = new THREE.Vector3(x, 0, z);
      }
    }
  }
  return best;
}

/** Çekimlerin merkezleri (kurulumda yazılır). */
const at = new Map<string, THREE.Vector3>();
/** Kasabanın yarıçapı (m; merkezden en uzak binanın ucu): kamera uzaklığı buna göre (SiteOpts.fit). */
const extOf = new Map<string, number>();
let lastExt = 0;
/** Dönüşün ortası (pusula, derece): kurulumda verilirse güneş yerine bu (yapının ön cephesi). */
const faceOf = new Map<string, number>();
let lastFace: number | null = null;

interface SiteOpts {
  /** Kameranın bakış noktasına uzaklığı (m; yatay tuvalde). */
  dist: number;
  /** Verilirse uzaklık = fit × kasabanın yarıçapı (dist yok sayılır). */
  fit?: number;
  /** Kameranın yükseklik açısı (derece; 90 tam tepeden). */
  elev: number;
  /** Dönüş (derece), süre boyunca sabit hızla. */
  sweep: number;
  dur: number;
  /** Bakış noktasının yerden yüksekliği (m). */
  lookUp: number;
  /** Bakış noktası merkezden kaydırılır (doğu, güney; m): yapının görsel ortası. */
  shift?: [number, number];
  /** Bakış noktası kameraya doğru kayar (m): özne kadrajda yukarı çıkar, öndeki sıra alt kenara değmez. */
  near?: number;
  /** Dikey tuvalde yapının ekran genişliğindeki payının yatay klibe oranı (verilmezse TALL_FILL). */
  tallFill?: number;
  clock: number;
  /** Dikey görüş açısı (yatay telefon tuvalinde gerçekleşen; derece). */
  fov: number;
}

/** Durağan yapının çevresinde yavaş dönen kuş bakışı kamera; güneş arkada, dönüş güneş yönünün iki yanına yayılır. */
function site(id: string, build: (w: World) => THREE.Vector3, o: SiteOpts): Take {
  return {
    id,
    map: 'anakara',
    seed: 17,
    clock: o.clock,
    clouds: 0.45,
    setup(w) {
      lastExt = 0;
      lastFace = null;
      at.set(id, build(w));
      extOf.set(id, lastExt);
      if (lastFace !== null) faceOf.set(id, lastFace);
      else faceOf.delete(id);
      if (lastExt) console.warn(`${id}: yarıçap ${Math.round(lastExt)} m, ${w.structures.filter((s) => s.def.category === 'city').length} bina, ${w.roads.length} yol`);
    },
    at: 20,
    offset: 0,
    maxWait: 0,
    duration: o.dur,
    shot(c) {
      const ctr = at.get(id)!.clone();
      if (o.shift) ctr.add(new THREE.Vector3(o.shift[0], 0, o.shift[1]));
      ctr.y = groundLevel(ctr.x, ctr.z) + o.lookUp;
      const az = ((faceOf.get(id) ?? sunAt(o.clock).azimuth) + lerp(-o.sweep / 2, o.sweep / 2, phase(c.t, 0, o.dur, ease.linear))) * DEG;
      const e = o.elev * DEG;
      const toCam = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az));
      if (o.near) ctr.addScaledVector(toCam, o.near);
      // Yatay tuval (2340×1080): kadraj buna göre kurulu; kayıt kipi yatayda açıyı 0,6 ile çarpar. Dikey tuvalde (1080×1920)
      // normal lens (TALL_FOV) ve aynı bakış açısı: yapı ekran genişliğinde yatay klipteki payın TALL_FILL katı yer kaplar
      // (geniş açı bükülmesi yok; uzaklık, yapı o büyüklükte görünecek kadar artar)
      const ext = extOf.get(id) ?? 0;
      const base = o.fit && ext ? o.fit * ext : o.dist;
      let dist = base;
      let fov = o.fov / 0.6;
      if (!wide()) {
        const aspect = innerWidth / innerHeight;
        const tanWide = Math.tan((o.fov / 2) * DEG) * WIDE_ASPECT;
        const tanTall = Math.tan((TALL_FOV / 2) * DEG) * aspect;
        dist = (base * tanWide) / ((o.tallFill ?? TALL_FILL) * tanTall);
        fov = TALL_FOV;
      }
      const pos = ctr.clone().addScaledVector(toCam, dist * Math.cos(e));
      pos.y = ctr.y + dist * Math.sin(e);
      // Sabit tripod (titremesiz): dönüş pürüzsüz kalsın
      return { pos, look: ctr, fov, handheld: 0 };
    },
  };
}

const mine = (w: World): THREE.Vector3 => {
  theater(w, { forward: false });
  const c = flatSpot(w, landCenter(), 0, 4000, 90, 90);
  w.addStructure(0, 'mine', w.structureName(0, 'mine'), c.x, c.z, 20);
  return c.setY(groundLevel(c.x, c.z));
};

const radar = (level: 1 | 2) => (w: World): THREE.Vector3 => {
  theater(w, { forward: false });
  const c = flatSpot(w, landCenter(), 0, 4000, 70, 70);
  const r = w.addStructure(0, 'radar', w.structureName(0, 'radar'), c.x, c.z, 0);
  r.radar!.level = level;
  return c.setY(groundLevel(c.x, c.z));
};

/** Tohumlu rastgele (mulberry32): kasaba her kayıtta aynı kurulur. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Yan sokak aralığı (world.ts JUNCTION ile aynı). */
const JUNCTION = 100;

interface TownPlan {
  seed: number;
  /** Belediyenin yeri: üsten pusula açısı (derece) ve uzaklık (m); belediyenin yönü (derece). Yoksa harekâttaki yer. */
  place?: { ang: number; dist: number; hdg: number };
  /** Başlangıçtaki 4 evden sonra sırayla kurulanlar. */
  build: StructureKind[];
  /** Arsa seçimi: belediyeye en yakın boş arsa (sıkı), rastgele ya da en uzak (yol boyunca uzayan). */
  lots: 'near' | 'random' | 'far';
  /** Arsa bitince: kavşak yerlerinden yan sokak, yolun ucundan hafif kıvrılarak uzama ya da karışık. */
  roads: 'side' | 'extend' | 'mix';
  /** Oyunun kendi işlevleriyle (findLot, growRoads; botlar gibi): önceki klipteki kasaba. */
  native?: boolean;
  /** Kasaba bitince itfaiye merkezi ortasına kurulur (merkeze en yakın evler yer açmak için kaldırılır). */
  fireMid?: boolean;
}

/**
 * Yeni sürümün kasabası, oyunun kurallarıyla: belediye ana caddesiyle, 4 başlangıç evi, sonra plandaki binalar yol
 * kenarındaki arsalara yola dönük (lotAt, checkPlacement); arsa bitince yeni yol (placeRoad). Yol boyunca her JUNCTION
 * metrede kavşak yeri boş kalır (oyundaki gibi).
 */
function newTown(w: World, team: number, p: TownPlan): THREE.Vector3 {
  const r = rng(p.seed);
  const base = w.structures.find((s) => s.kind === 'airbase' && s.team === team)!.airbase!;
  w.roadRules = true;
  let hall: THREE.Vector3 | null = null;
  if (p.place) {
    const a = p.place.ang * DEG;
    const cx = base.s.pos.x + Math.sin(a) * p.place.dist;
    const cz = base.s.pos.z - Math.cos(a) * p.place.dist;
    const q = w.findSpot(team, 'townhall', cx, cz, 0, 1500, p.seed, p.place.hdg * DEG, true);
    if (q) {
      w.addStructure(team, 'townhall', w.structureName(team, 'townhall'), q.x, q.z, p.place.hdg);
      hall = new THREE.Vector3(q.x, 0, q.z);
    }
  }
  if (!hall) {
    foundTown(w, team, base, 0);
    const th = w.structures.find((s) => s.team === team && s.kind === 'townhall');
    if (th) hall = th.pos.clone().setY(0);
  }
  const H = hall ?? base.s.pos.clone();
  const lotFor = (kind: StructureKind, mode = p.lots): { x: number; z: number; heading: number } | null => {
    const def = STRUCTURE_DEFS[kind];
    let best: { x: number; z: number; heading: number } | null = null;
    let bestScore = Infinity;
    for (const road of w.roads) {
      if (road.team !== team) continue;
      const h = projectOnRoad(road, road.ax, road.az);
      for (let sAlong = def.halfW + 4; sAlong <= h.len - def.halfW; sAlong += GRID) {
        const m = sAlong % JUNCTION;
        if (Math.min(m, JUNCTION - m) < def.halfW + ROAD_VERGE + 3) continue;
        for (const side of [1, -1] as const) {
          const q = lotAt(h, sAlong, side, def.halfL);
          const d = Math.hypot(q.x - H.x, q.z - H.z);
          const score = mode === 'near' ? d : mode === 'far' ? -d : r();
          if (score >= bestScore) continue;
          if (!w.checkPlacement(team, kind, q.x, q.z, q.heading, null, true).ok) continue;
          best = q;
          bestScore = score;
        }
      }
    }
    return best;
  };
  const shuffle = <T,>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const k = Math.floor(r() * (i + 1));
      [a[i], a[k]] = [a[k], a[i]];
    }
    return a;
  };
  const grow = (): boolean => {
    const side: [number, number, number, number][] = [];
    const ext: [number, number, number, number][] = [];
    for (const road of w.roads) {
      if (road.team !== team) continue;
      const h = projectOnRoad(road, road.ax, road.az);
      for (let sAlong = JUNCTION; sAlong <= h.len + 1; sAlong += JUNCTION) {
        const x = road.ax + h.dx * Math.min(sAlong, h.len);
        const z = road.az + h.dz * Math.min(sAlong, h.len);
        for (const sd of [1, -1]) side.push([x, z, x - h.dz * sd * JUNCTION, z + h.dx * sd * JUNCTION]);
      }
      // Uzama: yolun ucundan, hafif kıvrılarak (±20°)
      const bend = (r() - 0.5) * 40 * DEG;
      const ex = h.dx * Math.cos(bend) - h.dz * Math.sin(bend);
      const ez = h.dz * Math.cos(bend) + h.dx * Math.sin(bend);
      ext.push([road.bx, road.bz, road.bx + ex * JUNCTION * 1.2, road.bz + ez * JUNCTION * 1.2]);
    }
    const order = p.roads === 'side' ? [...shuffle(side), ...ext] : p.roads === 'extend' ? [...shuffle(ext), ...side] : shuffle([...side, ...ext]);
    for (const c of order) if (w.placeRoad(team, ...c, true)) return true;
    return false;
  };
  for (const kind of ['house', 'house', 'house', 'house', ...p.build] as StructureKind[]) {
    for (let k = 0; k < 5; k++) {
      const lot = p.native ? w.findLot(team, kind, true) : lotFor(kind);
      if (lot) {
        w.addStructure(team, kind, w.structureName(team, kind), lot.x, lot.z, (lot.heading * 180) / Math.PI);
        break;
      }
      if (!(p.native ? w.growRoads(team, true) : grow())) break;
    }
  }
  if (p.fireMid) {
    // Merkez: binaların ortası; itfaiye oraya en yakın arsaya, sığmazsa merkeze en yakın ev kaldırılıp yeniden denenir
    const all = w.structures.filter((s) => s.team === team && s.def.category === 'city');
    H.copy(all.reduce((sum, s) => sum.add(s.pos.clone().setY(0)), new THREE.Vector3()).divideScalar(all.length));
    const homes = all.filter((s) => s.kind === 'smallhouse' || s.kind === 'midhouse' || s.kind === 'house')
      .sort((a, b) => Math.hypot(a.pos.x - H.x, a.pos.z - H.z) - Math.hypot(b.pos.x - H.x, b.pos.z - H.z));
    for (const h of [null, ...homes]) {
      if (h) w.structures.splice(w.structures.indexOf(h), 1);
      const lot = lotFor('firestation', 'near');
      if (lot && Math.hypot(lot.x - H.x, lot.z - H.z) < 60) {
        w.addStructure(team, 'firestation', w.structureName(team, 'firestation'), lot.x, lot.z, (lot.heading * 180) / Math.PI);
        // Kaldırılanların yerine, kalan boş arsalara merkezin çevresinde küçük ve orta evler
        for (let k = 0; k < 6; k++) {
          const kind: StructureKind = k % 2 ? 'midhouse' : 'smallhouse';
          const q = lotFor(kind, 'near');
          if (!q || Math.hypot(q.x - H.x, q.z - H.z) > 160) break;
          w.addStructure(team, kind, w.structureName(team, kind), q.x, q.z, (q.heading * 180) / Math.PI);
        }
        break;
      }
    }
  }
  const city = w.structures.filter((s) => s.team === team && s.def.category === 'city');
  const ctr = city.reduce((sum, s) => sum.add(s.pos.clone().setY(0)), new THREE.Vector3()).divideScalar(Math.max(1, city.length));
  lastExt = Math.max(...city.map((s) => Math.hypot(s.pos.x - ctr.x, s.pos.z - ctr.z) + Math.max(s.def.halfW, s.def.halfL)));
  return ctr.setY(groundLevel(ctr.x, ctr.z));
}

const S: StructureKind = 'smallhouse';
const M: StructureKind = 'midhouse';
const B: StructureKind = 'house';
const A: StructureKind = 'apartment';
const P: StructureKind = 'park';
const F: StructureKind = 'firestation';
const times = (n: number, ...a: StructureKind[]): StructureKind[] => Array.from({ length: n }, () => a).flat();

const TOWNS: Record<string, TownPlan> = {
  // Önceki klipteki kasaba: harekâttaki yerde, merkeze yakın sıkı dolar, yan sokaklar
  s_kasaba: { seed: 1, native: true, lots: 'near', roads: 'side', build: [S, M, B, S, M, P, B, S, A, M, B, S, M, F, B, S, M, A, B, S, M, B, S, M] },
  // Yol boyu köy: küçük ve orta evler, cadde kıvrılarak uzar, evler yolun ucuna doğru dizilir
  s_kasaba_yol: { seed: 23, place: { ang: 60, dist: 4200, hdg: 35 }, lots: 'far', roads: 'extend', build: [...times(9, S, M), P, S, M, B] },
  // Apartmanlı merkez: belediyenin çevresinde apartmanlar ve parklar, dışta evler; yan sokaklar
  s_kasaba_merkez: { seed: 41, place: { ang: 200, dist: 3800, hdg: 110 }, lots: 'near', roads: 'side', build: [A, P, A, A, P, F, A, ...times(6, B, M), P, A, ...times(4, S, B)] },
  // Dağınık kasaba: her boydan ev, rastgele arsalar, karışık yollar
  s_kasaba_dagnik: { seed: 67, place: { ang: 300, dist: 4600, hdg: 250 }, lots: 'random', roads: 'mix', build: [...times(5, S, M, B), P, A, F, ...times(4, S, M), P, B] },
  // Büyük kasaba: her şeyden, çok sokak
  s_kasaba_buyuk: { seed: 89, place: { ang: 130, dist: 5200, hdg: 0 }, lots: 'near', roads: 'mix', build: [...times(4, S, M, B, M), A, P, F, ...times(4, S, M, B), A, A, P, ...times(4, M, S, B), A, P] },
};

/** İtfaiye çekimleri: merkez belediyenin yanında erken kurulur, büyük kasaba çevresinde büyür (kamera hep şehrin üstünde). */
const FIRE_TOWN: TownPlan = {
  seed: 89, place: { ang: 130, dist: 5200, hdg: 0 }, lots: 'near', roads: 'mix',
  fireMid: true,
  build: [...times(4, S, M, B, M), A, P, ...times(4, S, M, B), A, A, P, ...times(5, M, S, B), A, P, ...times(3, S, M)],
};

const fireAt = (level: 1 | 2 | 3) => (w: World): THREE.Vector3 => {
  theater(w, { forward: false });
  newTown(w, 0, FIRE_TOWN);
  lastExt = 0;
  const f = w.structures.find((s) => s.kind === 'firestation')!;
  f.fire!.level = level;
  // Kamera ön cepheyi (araç kapıları, yol tarafı) üç çeyrek açıdan görür
  lastFace = (f.heading * 180) / Math.PI + 25;
  return f.pos.clone().setY(groundLevel(f.pos.x, f.pos.z));
};

const town = (id: string) => (w: World): THREE.Vector3 => {
  theater(w, { forward: false });
  return newTown(w, 0, TOWNS[id]);
};

// ------------------------------------------------------------------ araçlar

/** Kayıt kipinin çizicisi (recorder.ts): sivil trafik yalnız görüntüde. */
interface TrafficCar {
  team: number;
  mesh: THREE.Mesh;
}
const trafficCars = (): TrafficCar[] =>
  ((window as unknown as { __recRenderer?: { traffic: { cars: TrafficCar[] } } }).__recRenderer?.traffic.cars ?? []);

/** İzlenen aracın yumuşatılmış yönü (yatay birim vektör) ve son konumu: köşede kamera savrulmasın. */
const chase = { dir: new THREE.Vector3(0, 0, -1), last: new THREE.Vector3(), has: false, moved: false, target: -1, car: -1 };

/** Konumdan yön: hareket varsa ona doğru yumuşakça döner (yalnız yön yumuşar, konum gecikmez). */
function follow(pos: THREE.Vector3, dt: number, tau: number): THREE.Vector3 {
  if (chase.has) {
    const v = pos.clone().sub(chase.last).setY(0);
    if (v.lengthSq() > 1e-4) {
      // İlk hareket yönü hemen alınır (kamera aracın arkasından başlasın), sonra yumuşakça döner
      if (!chase.moved) chase.dir.copy(v.normalize());
      else chase.dir.lerp(v.normalize(), 1 - Math.exp(-dt / tau)).normalize();
      chase.moved = true;
    }
  }
  chase.last.copy(pos);
  chase.has = true;
  return chase.dir.clone();
}

/** İtfaiye kasabası: merkez 2. seviye, alanında üç bina hasarlı (biri apartman: büyük araç da çıkar). */
const fireTown = (w: World): void => {
  theater(w, { forward: false });
  newTown(w, 0, FIRE_TOWN);
  lastExt = 0;
  w.teams[0].money = 2_000_000;
  const f = w.structures.find((s) => s.kind === 'firestation')!;
  f.fire!.level = 2;
  const r = f.fire!.radius;
  const cands = w.structures
    .filter((s) => s.team === 0 && s.def.category === 'city' && s.kind !== 'firestation' && s.kind !== 'park')
    .map((s) => ({ s, d: Math.hypot(s.pos.x - f.pos.x, s.pos.z - f.pos.z) }))
    .filter((x) => x.d > 140 && x.d < r * 0.9)
    .sort((a, b) => b.d - a.d);
  const pick = [cands.find((x) => x.s.kind === 'apartment'), ...cands.filter((x) => x.s.kind !== 'apartment').slice(0, 2)];
  for (const x of pick) if (x) w.damageStructure(x.s, x.s.maxHp * 0.55, 'test', 1);
};

const station = (w: World) => w.structures.find((s) => s.kind === 'firestation')!;

export const ARAC_TAKES: Take[] = [
  {
    // Büyük itfaiye aracı (merdivenli) merkezden çıkıp hasarlı binaya gider: kamera arkasında ve yukarıda, yol boyunca izler
    id: 's_arac_itfaiye',
    map: 'anakara',
    seed: 17,
    clock: 15,
    clouds: 0.45,
    setup(w) {
      fireTown(w);
      chase.has = false;
      chase.moved = false;
      chase.target = -1;
    },
    trigger: (w) => {
      const f = station(w);
      const c = f.fire!.crews.find((x) => x.big && x.state === 'out' && x.wait <= 0 && Math.hypot(x.x - f.pos.x, x.z - f.pos.z) > 25);
      if (!c) return null;
      chase.target = c.targetId;
      return { ids: [], at: new THREE.Vector3(c.x, 0, c.z) };
    },
    offset: 0.5,
    maxWait: 240,
    duration: 12,
    shot(c) {
      const crew = station(c.w).fire!.crews.find((x) => x.big && x.targetId === chase.target) ?? station(c.w).fire!.crews.find((x) => x.big);
      const f = station(c.w);
      // Garajda beklerken (ya da bulunamazsa) merkezin önü
      const p = crew && crew.wait <= 0 ? new THREE.Vector3(crew.x, 0, crew.z) : chase.has ? chase.last.clone() : f.pos.clone();
      p.y = groundLevel(p.x, p.z);
      const dir = follow(p, c.dt, 1.2);
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const pos = p.clone().addScaledVector(dir, -20).addScaledVector(side, 6);
      pos.y = Math.max(groundLevel(pos.x, pos.z), p.y) + 10;
      const look = p.clone().addScaledVector(dir, 9).add(new THREE.Vector3(0, 1.5, 0));
      return { pos, look, fov: 46, handheld: 0 };
    },
  },
  {
    // Onarım yeri: araçlar hasarlı binanın önünde, ekip çalışıyor; kamera binanın önünde yavaşça döner
    id: 's_arac_onarim',
    map: 'anakara',
    seed: 17,
    clock: 15,
    clouds: 0.45,
    setup(w) {
      fireTown(w);
    },
    trigger: (w) => {
      const f = station(w);
      const c = f.fire!.crews.find((x) => x.big && x.state === 'work');
      if (!c) return null;
      const t = w.structures.find((s) => s.id === c.targetId)!;
      return { ids: [], at: new THREE.Vector3(c.x, 0, c.z), ang: t.heading };
    },
    offset: 4,
    maxWait: 400,
    duration: 12,
    shot(c) {
      const car = c.s.at!.clone();
      const k = phase(c.t, 0, 12, ease.linear);
      // Ön cepheye göre üç çeyrek açı (aracın binaya bakan tarafı görünür), 40° dönüş
      // Sokak boyunca (binanın ön cephesine dik), karşıdaki çatıların üstünden: araç ve hasarlı bina birlikte görünür
      const az = c.s.ang! + lerp(70, 110, k) * DEG;
      const ctr = car.clone();
      ctr.y = groundLevel(ctr.x, ctr.z) + 2;
      const e = 30 * DEG;
      const dist = 38;
      const pos = ctr.clone().add(new THREE.Vector3(Math.sin(az), 0, -Math.cos(az)).multiplyScalar(dist * Math.cos(e)));
      pos.y = ctr.y + dist * Math.sin(e);
      return { pos, look: ctr, fov: 46, handheld: 0 };
    },
  },
  {
    // Sivil trafik: büyük kasabanın sokaklarında bir otomobil; kamera yanından ve biraz önünden izler
    id: 's_arac_trafik',
    map: 'anakara',
    seed: 17,
    clock: 15,
    clouds: 0.45,
    setup(w) {
      theater(w, { forward: false });
      newTown(w, 0, TOWNS.s_kasaba_buyuk);
      lastExt = 0;
      chase.has = false;
      chase.moved = false;
      chase.car = -1;
    },
    at: 30,
    offset: 0,
    maxWait: 0,
    duration: 12,
    shot(c) {
      const cars = trafficCars().filter((x) => x.team === 0);
      if (chase.car < 0 && cars.length) chase.car = 0;
      const m = cars[chase.car]?.mesh;
      const p = m ? m.position.clone() : chase.last.clone();
      const dir = follow(p, c.dt, 1.0);
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const pos = p.clone().addScaledVector(side, 16).addScaledVector(dir, 4);
      pos.y = Math.max(groundLevel(pos.x, pos.z), p.y) + 10;
      const look = p.clone().addScaledVector(dir, 3).add(new THREE.Vector3(0, 0.8, 0));
      return { pos, look, fov: 46, handheld: 0 };
    },
  },
];


// ------------------------------------------------------------------ şehirde hava savunması

/**
 * Kasabanın içinde, evlerle çevrili boşluğa batarya: binalara ve yollara değmeyen, çevresinde en çok bina olan yer.
 * Dönen: bataryanın yeri ve kasabanın ortası.
 */
function batteryInTown(w: World): { at: THREE.Vector3; mid: THREE.Vector3 } {
  const city = w.structures.filter((s) => s.team === 0 && s.def.category === 'city');
  const mid = city.reduce((sum, s) => sum.add(s.pos.clone().setY(0)), new THREE.Vector3()).divideScalar(city.length);
  let best = mid.clone();
  let bestN = -1;
  for (let dx = -360; dx <= 360; dx += 15) {
    for (let dz = -360; dz <= 360; dz += 15) {
      const x = mid.x + dx;
      const z = mid.z + dz;
      if (city.some((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < 62)) continue;
      if (w.roads.some((r) => projectOnRoad(r, x, z).dist < 48)) continue;
      const st = footprintStats(x, z, 40, 40, 0);
      if (st.outside || st.water > 0 || st.max - st.min > 6) continue;
      const n = city.filter((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < 230).length;
      if (n > bestN) {
        bestN = n;
        best = new THREE.Vector3(x, 0, z);
      }
    }
  }
  return { at: best, mid };
}

/** Bataryanın adı: senaryonun kendi bataryalarından ayırmak için. */
const HS_NAME = 'Kasaba bataryası';
const HS_GUNS: AAWeaponId[] = ['aa41', 'aa88', 'aa40', 'aa20q'];
interface HsOpts {
  /** Kameranın arkasında durduğu top. */
  gun: AAWeaponId;
  /** Saldırgan: yüksekten B-17 kolu (ağır toplar) ya da alçaktan dalan Il-2'ler (hafif toplar da ateş eder). */
  attack: 'b17' | 'il2';
  /** Kameranın topa uzaklığı ve yerden yüksekliği (m), yana kayış (m). */
  dist: number;
  h: number;
  slide: number;
  /** Bakış noktasının top hizasındaki yüksekliği (m; az: top kadrajda yukarı çıkar). */
  lookUp: number;
  fxDist: number;
}

/** Çekim başına bataryanın topu ve kameranın yanı (kurulumda yazılır). */
const hsAt = new Map<string, { gun: THREE.Vector3; away: THREE.Vector3 }>();

/**
 * Kasabanın içindeki ağır batarya ateş ediyor: dört yuva (Flak 41, Flak 36, Bofors, Flakvierling), radar ve hesap
 * makinesi; kamera yerde, seçilen topun arkasında, kasabaya göre dış yanda (arkada evler). Hedef görünmez.
 */
function hsTake(id: string, o: HsOpts): Take {
  return {
    id,
    map: 'anakara',
    seed: 17,
    clock: 15,
    clouds: 0.45,
    setup(w) {
      theater(w, { forward: false });
      newTown(w, 0, TOWNS.s_kasaba_buyuk);
      lastExt = 0;
      const { at: p, mid } = batteryInTown(w);
      const site = w.addStructure(0, 'aa', HS_NAME, p.x, p.z, 0);
      const aa = site.aa!;
      aa.level = 4;
      aa.mounts.length = 0;
      for (const g of HS_GUNS) aa.addMount(g);
      for (const sn of ['gunRadar', 'rangefinder', 'predictor'] as const) aa.sensors.add(sn);
      const [ox, oz] = AASite.mountOffset(Math.max(0, HS_GUNS.indexOf(o.gun)));
      const gun = new THREE.Vector3(p.x + ox, 0, p.z + oz);
      gun.y = groundLevel(gun.x, gun.z) + 1.8;
      const away = p.clone().sub(mid).setY(0);
      if (away.lengthSq() < 1) away.set(1, 0, 0);
      away.normalize();
      hsAt.set(id, { gun, away });
      const from = p.clone().addScaledVector(away, -9000);
      const hdg = (Math.atan2(away.x, -away.z) * 180) / Math.PI;
      if (o.attack === 'b17') {
        const y = groundLevel(p.x, p.z) + 3200;
        w.spawnAirborneFlight(1, 'b17g', 6, new THREE.Vector3(from.x, y, from.z), hdg,
          plan('levelBomb', 'b17g', { targetStructureId: site.id, altitude: y }), null);
      } else {
        // Alçaktan taarruz: Il-2'ler bataryaya dalar, 20 mm'lik dörtlü top menziline girerler
        w.spawnAirborneFlight(1, 'il2m3', 4, new THREE.Vector3(from.x, groundLevel(from.x, from.z) + 150, from.z), hdg,
          plan('attack', 'il2m3', { targetStructureId: site.id, lowLevel: true, agl: 110, passes: 2, loadoutId: 'mix' }), null);
      }
    },
    trigger: (w) => {
      const site = w.structures.find((s) => s.name === HS_NAME);
      if (!site || !site.aa!.mounts.some((m) => m.weapon === o.gun && w.time - m.lastFire < 0.02)) return null;
      return { ids: [], at: site.pos.clone() };
    },
    offset: -0.6,
    maxWait: 900,
    duration: 12,
    shake: 0.5,
    fxDist: o.fxDist,
    shot(c) {
      const { gun, away } = hsAt.get(id)!;
      const side = new THREE.Vector3(-away.z, 0, away.x);
      const k = phase(c.t, 0, 12, ease.linear);
      // Topun dış yanında, yerde; yavaşça yana kayar
      const pos = gun.clone().addScaledVector(away, o.dist).addScaledVector(side, lerp(-o.slide, o.slide, k));
      pos.y = groundLevel(pos.x, pos.z) + o.h;
      // Bakış topun hizasında, ötesinde: top kadrajın ortasında kalır, kamera kaydıkça arkadaki kasaba kayar
      const ahead = gun.clone().sub(pos).setY(0).normalize();
      const look = gun.clone().addScaledVector(ahead, 30).add(new THREE.Vector3(0, o.lookUp, 0));
      return { pos, look, fov: 50, handheld: 0.15 };
    },
  };
}

export const HS_TAKES: Take[] = [
  hsTake('s_hs_sehir', { gun: 'aa41', attack: 'b17', dist: 15, h: 5.5, slide: 7, lookUp: 4, fxDist: 70 }),
  // 2 cm Flakvierling: dört namlu, hızlı atış; alçaktan gelen taarruz uçaklarına
  hsTake('s_hs_sehir_20mm', { gun: 'aa20q', attack: 'il2', dist: 8, h: 5, slide: 3, lookUp: -7, fxDist: 22 }),
];

export const SEHIR_TAKES: Take[] = [
  site('s_maden', mine, { dist: 240, elev: 40, sweep: 50, dur: 12, lookUp: 4, clock: 15, fov: 32 }),
  site('s_radar', radar(1), { dist: 150, elev: 35, sweep: 50, dur: 12, lookUp: 4, tallFill: 1.7, clock: 15, fov: 32 }),
  site('s_radar2', radar(2), { dist: 190, elev: 30, sweep: 50, dur: 12, lookUp: 30, tallFill: 1.65, clock: 15, fov: 32 }),
  site('s_kasaba', town('s_kasaba'), { dist: 400, fit: 1.35, elev: 35, sweep: 50, dur: 12, lookUp: 6, near: 30, clock: 15, fov: 32 }),
  site('s_kasaba_yol', town('s_kasaba_yol'), { dist: 400, fit: 0.95, elev: 35, sweep: 50, dur: 12, lookUp: 6, clock: 15, fov: 32 }),
  site('s_kasaba_merkez', town('s_kasaba_merkez'), { dist: 400, fit: 1.35, elev: 35, sweep: 50, dur: 12, lookUp: 6, clock: 15, fov: 32 }),
  site('s_kasaba_dagnik', town('s_kasaba_dagnik'), { dist: 400, fit: 1.35, elev: 35, sweep: 50, dur: 12, lookUp: 6, clock: 15, fov: 32 }),
  site('s_kasaba_buyuk', town('s_kasaba_buyuk'), { dist: 400, fit: 1.35, elev: 35, sweep: 50, dur: 12, lookUp: 6, clock: 15, fov: 32 }),
  site('s_itfaiye1', fireAt(1), { dist: 62, elev: 26, sweep: 50, dur: 12, lookUp: 7, tallFill: 1.6, clock: 15, fov: 32 }),
  site('s_itfaiye2', fireAt(2), { dist: 62, elev: 26, sweep: 50, dur: 12, lookUp: 7, tallFill: 1.6, clock: 15, fov: 32 }),
  site('s_itfaiye3', fireAt(3), { dist: 62, elev: 26, sweep: 50, dur: 12, lookUp: 7, tallFill: 1.6, clock: 15, fov: 32 }),
  ...ARAC_TAKES,
  ...HS_TAKES,
];
