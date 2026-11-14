// MiG-15 videosu (geceden gün doğumuna, 13 çekim): gece pist ve apron ışıkları, iniş farı, kumanda denetimi, ışıklı
// hangar; şafakta apron siluetleri, kanopi, kalkış, katlanan takım; gün doğumunda bulut üstü, yoğuşma izi, siluet.
// Kurgu tools/rec/mig.mjs.

import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Aircraft } from '../sim/aircraft/aircraft';
import type { Airbase } from '../sim/structures/airbase';
import { newAirframe } from '../sim/structures/airbase';
import { plan, theater } from '../sim/scenarios';
import { footprintStats, groundLevel } from '../sim/terrain';
import { addClearings, forestGrid, sampleGrid } from '../render/landcover';
import { ArchBatch, SURF, archMaterial } from '../render/arch';
import { buildCityModel } from '../render/cityModels';
import { mulberry32 } from '../core/math';
import type { StructureKind } from '../sim/structures/structure';
import { sunAt } from '../render/atmosphere';
import type { Shot } from './director';
import type { Subject, Take, TakeCtx } from './takes';

const SEED = 71;
const NIGHT = 20.3;

const baseOf = (w: World): Airbase => w.structures.find((s) => s.kind === 'airbase' && s.team === 0)!.airbase!;
const mig = (w: World): Aircraft | undefined => w.aircraft.find((a) => a.team === 0 && a.spec.id === 'mig15');

/** Üs ekseninde nokta (x pistten batıya doğru eksi, z pist boyunca; y zeminden yükseklik) → dünya. */
function local(ab: Airbase, lx: number, y: number, lz: number): THREE.Vector3 {
  const a = Math.PI - ab.s.heading;
  return new THREE.Vector3(ab.s.pos.x + lx * Math.cos(a) + lz * Math.sin(a), ab.s.pos.y + y, ab.s.pos.z - lx * Math.sin(a) + lz * Math.cos(a));
}

/** Kalkış koşusu ekseninde nokta: başlangıçtan ileri (along), sağa (lateral), pist üstünden yükseklik. */
function runway(ab: Airbase, along: number, lateral: number, y: number): THREE.Vector3 {
  const s = ab.takeoffStart(0);
  const d = ab.runwayPoint(0, 0).sub(s).setY(0).normalize();
  return s.addScaledVector(d, along).add(new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(lateral)).setY(ab.s.pos.y + 1.2 + y);
}

/** Güneşin yatay yönü (saat). */
function sunDir(hour: number): THREE.Vector3 {
  const a = (sunAt(hour).azimuth * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
}

/** Üssü kurar: MiG-15'ler (en yeniler hangar ağızlarında) ve apronda eski avcılar; launch: iki MiG-15 devriyeye kalkar. */
function base(launch: boolean) {
  return (w: World): void => {
    const ab = theater(w, { forward: false }).blueMain;
    for (let i = 0; i < 10; i++) ab.addAirframe(newAirframe('mig15', 0, 0.8));
    for (const id of ['la7', 'yak3', 'il2', 'il2']) ab.addAirframe(newAirframe(id, 0, 0.8));
    if (launch) {
      w.launchPackage(ab, plan('cap', 'mig15', { targetPos: runway(ab, 30000, 0, 0), altitude: 3000, patrolRadius: 3000, stationTime: 600 }), [{ specId: 'mig15', count: 2 }]);
    }
  };
}

/** Havada MiG-15 kolu: üssün yakınında, verilen irtifa ve pusula yönünde. */
function airborne(alt: number, hdg: number, n = 1) {
  return (w: World): void => {
    const ab = theater(w, { forward: false }).blueMain;
    const p = ab.s.pos.clone().setY(alt);
    const h = (hdg * Math.PI) / 180;
    const far = p.clone().add(new THREE.Vector3(Math.sin(h), 0, -Math.cos(h)).multiplyScalar(60000));
    w.spawnAirborneFlight(0, 'mig15', n, p, hdg, plan('cap', 'mig15', { targetPos: far, altitude: alt, patrolRadius: 4000, stationTime: 600 }), null);
  };
}

/** Yerde koşuya hazır MiG-15 (kalkış sırasından doğduğu an). */
const onRunway = (w: World): Subject | null => {
  const a = mig(w);
  return a && a.onGround ? { ids: [a.id] } : null;
};
const firstMig = (w: World): Subject | null => {
  const a = mig(w);
  return a ? { ids: [a.id] } : null;
};

/** Sabit kamera (çekimin ilk karesinde konum hesaplanır, sonra aynı kalır): pos(c), uçağa döner. */
function tripodOn(pos: (c: TakeCtx, a: Aircraft) => THREE.Vector3, fov: number, lag = 0.12) {
  let at: THREE.Vector3 | null = null;
  let last = new THREE.Vector3();
  return (c: TakeCtx): Shot => {
    const a = c.ac(c.s.ids[0]);
    if (a) last = a.pos.clone().add(new THREE.Vector3(0, 1, 0));
    if (!at || c.t <= c.dt) at = a ? pos(c, a) : last.clone();
    return c.d.tripod(at, last, c.dt, fov, lag);
  };
}

/** Sabit kamera, doğrudan uçağa bakar (yumuşatmasız). */
function fixedOn(c: TakeCtx, pos: THREE.Vector3, fov: number): Shot {
  const a = c.ac(c.s.ids[0]);
  return { pos, look: a ? a.pos.clone().add(new THREE.Vector3(0, 0.8, 0)) : pos.clone().add(new THREE.Vector3(0, 0, 1)), fov };
}

/** Uçağı frende tutar (kumanda denetimi): kaydın ilk sn saniyesinde hız sıfır. */
function hold(c: TakeCtx, sec: number): Aircraft | undefined {
  const a = c.ac(c.s.ids[0]);
  if (a && c.t < sec) a.speed = 0;
  return a;
}

/** Yürüyen kamera: kayıt boyunca a'dan b'ye, look'a bakar. */
function dolly(c: TakeCtx, dur: number, a: THREE.Vector3, b: THREE.Vector3, look: THREE.Vector3, fov: number): Shot {
  const k = Math.min(1, Math.max(0, c.t / dur));
  const e = k * k * (3 - 2 * k);
  return { pos: a.clone().lerp(b, e), look: look.clone(), fov };
}

export const MIG_TAKES: Take[] = [
  // 1 Karanlık pist: uzakta kalkışa başlayan MiG-15'in iniş farı, pist kenarı lambaları (kamera pistin ilerisinde)
  {
    id: 'mig_g1_uzak', map: 'anakara', seed: SEED, clock: NIGHT, clouds: 0.3,
    setup: base(true), trigger: onRunway, offset: 0, maxWait: 120, duration: 5,
    shot: (c) => fixedOn(c, runway(baseOf(c.w), 720, 5, 1.2), 9),
  },
  // 2 Kafa kafaya: far parlıyor, kırmızı ve yeşil seyir lambaları (alçak, pistin yanında)
  {
    id: 'mig_g2_kafa', map: 'anakara', seed: SEED, clock: NIGHT, clouds: 0.3,
    setup: base(true), trigger: onRunway, offset: 3, maxWait: 120, duration: 4,
    shot: (c) => fixedOn(c, runway(baseOf(c.w), 125, -13, 0.9), 19),
  },
  // 3 Gece apron: projektör havuzlarında park hâlindeki uçakların önünden yan kayan kamera, arkada ışıklı hangarlar
  {
    id: 'mig_g3_apron', map: 'anakara', seed: SEED, clock: NIGHT, clouds: 0.3,
    setup: base(false), at: 4, offset: 0, maxWait: 10, duration: 4.5,
    shot: (c) => {
      const ab = baseOf(c.w);
      return dolly(c, 4.5, local(ab, -183, 2.0, -330), local(ab, -183, 2.0, -262), local(ab, -216, 1.6, -215), 40);
    },
  },
  // 4 Kumanda denetimi: pist başında frende bekleyen MiG-15'in kuyruğu, dümenler oynuyor
  {
    id: 'mig_g4_kuyruk', map: 'anakara', seed: SEED, clock: NIGHT, clouds: 0.3,
    setup: base(true), trigger: onRunway, offset: 0, maxWait: 120, duration: 3.5,
    shot: (c) => {
      const a = hold(c, 3.5)!;
      return c.d.wing(a, { offset: [-4.2, 2.6, -10.5], look: [0, 1.5, -4.6], fov: 40 });
    },
  },
  // 5 Işıklı hangar ağzındaki MiG-15'e yavaş yaklaşma
  {
    id: 'mig_g5_hangar', map: 'anakara', seed: SEED, clock: NIGHT, clouds: 0.3,
    setup: base(false), at: 4, offset: 0, maxWait: 10, duration: 4.5,
    shot: (c) => {
      const ab = baseOf(c.w);
      return dolly(c, 4.5, local(ab, -300, 5, 34), local(ab, -338, 3.6, 14), local(ab, -386, 3.5, 0), 40);
    },
  },
  // 6 Şafak: apron sırasındaki uçaklar turuncu gök önünde siluet (kamera alçakta, güneşe bakar, yana kayar)
  {
    id: 'mig_s6_siluet', map: 'anakara', seed: SEED, clock: 4.72, clouds: 0.5,
    setup: base(false), at: 4, offset: 0, maxWait: 10, duration: 4.5,
    shot: (c) => {
      const ab = baseOf(c.w);
      const sd = sunDir(4.72);
      const side = new THREE.Vector3(-sd.z, 0, sd.x);
      const p = local(ab, -212, 0, -200);
      const cam = p.clone().addScaledVector(sd, -34).setY(groundLevel(p.x, p.z) + 1.3);
      return dolly(c, 4.5, cam.clone().addScaledVector(side, -6), cam.clone().addScaledVector(side, 6), p.clone().addScaledVector(sd, 400).setY(cam.y + 14), 32);
    },
  },
  // 7 Kanopi: yanından pilot, camda gün doğumu (uçuşta)
  {
    id: 'mig_s7_kanopi', map: 'anakara', seed: SEED, clock: 5.05, clouds: 0.6,
    setup: airborne(2600, (sunAt(5.05).azimuth + 200) % 360), trigger: firstMig, offset: 2, maxWait: 20, duration: 3.5,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      return { ...c.d.wing(a, { offset: [4.2, 1.7, 0.6], look: [0, 0.7, 2.2], roll: 1, fov: 50 }), handheld: 0.15 };
    },
  },
  // 8 Pist başında hizalanma: flap 20°, far açık (önden yandan, alçak)
  {
    id: 'mig_s8_hizalan', map: 'anakara', seed: SEED, clock: 4.95, clouds: 0.5,
    setup: base(true), trigger: onRunway, offset: 0, maxWait: 120, duration: 3.5,
    shot: (c) => {
      hold(c, 1.6);
      return tripodOn((cc) => runway(baseOf(cc.w), 34, 15, 1.3), 36, 0.1)(c);
    },
  },
  // 9 Kalkış koşusu ve tekerlerin yerden kesilişi (pist kenarından, alçak)
  {
    id: 'mig_s9_kalkis', map: 'anakara', seed: SEED, clock: 5.0, clouds: 0.5,
    setup: base(true),
    trigger: (w) => {
      const a = mig(w);
      return a && a.onGround && a.speed > 42 ? { ids: [a.id] } : null;
    },
    offset: -1, maxWait: 160, duration: 5,
    shot: tripodOn((c, a) => {
      const ab = baseOf(c.w);
      const s = ab.takeoffStart(0);
      const along = Math.hypot(a.pos.x - s.x, a.pos.z - s.z) + 240;
      return runway(ab, along, 48, 1.0);
    }, 30, 0.06),
  },
  // 10 Havalanınca: alttan arkadan, takım katlanıyor, flaplar kalkıyor
  {
    id: 'mig_s10_takim', map: 'anakara', seed: SEED, clock: 5.0, clouds: 0.5,
    setup: base(true),
    trigger: (w) => {
      const a = mig(w);
      return a && !a.onGround && a.status === 'flying' ? { ids: [a.id] } : null;
    },
    offset: 0, maxWait: 160, duration: 5,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      return c.d.wing(a, { offset: [-5.5, -2.2, -9], look: [0, -0.7, 1.5], roll: 0.6, fov: 48 });
    },
  },
  // 11 Mavi saatte bulutlara tırmanış (arkadan, alttan)
  {
    id: 'mig_s11_tirmanis', map: 'anakara', seed: SEED, clock: 4.9, clouds: 1,
    setup: airborne(1500, (sunAt(4.9).azimuth + 160) % 360), trigger: firstMig, offset: 1, maxWait: 20, duration: 4.5,
    clearClouds: true,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      return c.d.chase(a, c.dt, { back: 26, up: -3, side: 7, lookUp: 2, fov: 46 });
    },
  },
  // 12 Yüksekte yoğuşma izi, arkada gün doğumu ufku
  {
    id: 'mig_s12_iz', map: 'anakara', seed: SEED, clock: 4.88, clouds: 1, warm: 14,
    setup: airborne(9400, (sunAt(4.88).azimuth + 120) % 360, 2), trigger: firstMig, offset: 14, maxWait: 30, duration: 4.5,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      return c.d.chase(a, c.dt, { back: 34, up: 5, side: -14, fov: 44 });
    },
  },
  // 13 Siluet: kamera önde, geriye bakar; uçağın arkasında doğan güneş
  {
    id: 'mig_s13_siluet', map: 'anakara', seed: SEED, clock: 4.97, clouds: 0.6,
    setup: airborne(3200, (sunAt(4.97).azimuth + 180) % 360), trigger: firstMig, offset: 2, maxWait: 20, duration: 4,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      return c.d.wing(a, { offset: [5, 0.6, 21], look: [0, 0.3, 0], roll: 1, fov: 38 });
    },
  },
];

/** Alçak uçuş: MiG-15 hedefe 20 km'den, agl metre yüksekte; hedef çevresinde küçük devriye (sık dönüş). */
function lowFlight(target: (w: World) => THREE.Vector3, agl: number, radius: number) {
  return (w: World): void => {
    theater(w, { forward: false });
    const t = target(w);
    const start = t.clone().add(new THREE.Vector3(-14000, 0, 9000));
    start.y = groundLevel(start.x, start.z) + agl + 150;
    const hdg = (Math.atan2(t.x - start.x, -(t.z - start.z)) * 180) / Math.PI;
    w.spawnAirborneFlight(0, 'mig15', 1, start, hdg, plan('cap', 'mig15', {
      targetPos: t.clone().setY(0), altitude: start.y, speed: 'max', lowLevel: true, agl, patrolRadius: radius, stationTime: 900,
    }), null);
  };
}
const cityOf = (w: World) => (w.structures.find((s) => s.def.category === 'city') ?? w.structures[0]).pos.clone();

/** Şehir çekimi: üssün 7 km doğusunda sokak düzeninde evler, apartmanlar, çarşı ve iş merkezi. */
function withTown(w: World): THREE.Vector3 {
  const ab = baseOf(w);
  const c = ab.s.pos.clone().add(new THREE.Vector3(7000, 0, 2000));
  const kinds = ['shops', 'apartment', 'office', 'apartment', 'house', 'house', 'house', 'house'] as const;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const k = kinds[(i * 3 + j) % kinds.length];
    w.addStructure(0, k, w.structureName(0, k), c.x + (i - 2.5) * 90, c.z + (j - 1.5) * 80, 0);
  }
  return c;
}

MIG_TAKES.push(
  // Dağlarda alçak uçuş, kuyruk kamerası: haritanın ortasındaki sıradağlarda sık dönüşler
  {
    id: 'mig_dag_kuyruk', map: 'anakara', seed: SEED, clock: 17.2, clouds: 0.6,
    setup: lowFlight(() => new THREE.Vector3(0, 0, 0), 70, 1400),
    trigger: (w) => {
      const a = mig(w);
      return a && Math.hypot(a.pos.x, a.pos.z) < 1600 ? { ids: [a.id] } : null;
    },
    offset: 4, maxWait: 400, duration: 12,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      return { ...c.d.wing(a, { offset: [0, 1.5, -9.5], look: [0, 0.9, 60], roll: 1, fov: 62 }), handheld: 0.2 };
    },
  },
  // Şehir üstünden alçak geçiş: kamera önde, sol çaprazda, biraz yukarıda; uçak ve arkasındaki şehir birlikte
  {
    id: 'mig_sehir', map: 'anakara', seed: SEED, clock: 16.5, clouds: 0.6,
    setup: lowFlight(withTown, 60, 3000),
    trigger: (w) => {
      const a = mig(w);
      const city = cityOf(w);
      return a && Math.hypot(a.pos.x - city.x, a.pos.z - city.z) < 250 ? { ids: [a.id] } : null;
    },
    offset: 0, maxWait: 400, duration: 8,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      return c.d.wing(a, { offset: [-13, 4.5, 24], look: [0, -1, -25], fov: 48 });
    },
  },
);

/** En ağaçlı ve engebeli yer (arazi örtüsünden; harita ortasının ±60 km'si): çevresinde orman yoğunluğu + yükselti farkı. */
export function forestSpot(): THREE.Vector3 {
  let best = new THREE.Vector3();
  let bestS = -Infinity;
  for (let x = -60000; x <= 60000; x += 3000) {
    for (let z = -60000; z <= 60000; z += 3000) {
      let f = 0;
      const hs: number[] = [];
      for (const [dx, dz] of [[0, 0], [700, 0], [-700, 0], [0, 700], [0, -700], [1400, 1400], [-1400, -1400]]) {
        f += sampleGrid(forestGrid, x + dx, z + dz);
        hs.push(groundLevel(x + dx, z + dz));
      }
      const relief = Math.max(...hs) - Math.min(...hs);
      const s = f * 2 + Math.min(relief, 300) / 100;
      if (s > bestS) {
        bestS = s;
        best = new THREE.Vector3(x, 0, z);
      }
    }
  }
  return best;
}
const forestAt = new THREE.Vector3();

/** Kalabalık şehir: üssün 7 km doğusunda 9 × 7 bloklu sokak düzeni (apartman, iş merkezi, çarşı ağırlıklı). */
function bigTown(w: World): THREE.Vector3 {
  const c = baseOf(w).s.pos.clone().add(new THREE.Vector3(7000, 0, 2000));
  const kinds = ['apartment', 'office', 'shops', 'apartment', 'house', 'apartment', 'office', 'house', 'shops'] as const;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) {
    const k = kinds[(i * 4 + j * 3) % kinds.length];
    w.addStructure(0, k, w.structureName(0, k), c.x + (i - 4) * 75, c.z + (j - 3) * 68, 0);
  }
  return c;
}
const TOWN_DIR = new THREE.Vector3(1, 0, 0.35).normalize();
const townAt = new THREE.Vector3();

MIG_TAKES.push(
  // Ağaçlı dağlarda alçak uçuş, sabah 06:00; kamera dikey kuyruğun sağ yüzüne yapışık (kuyruk kamerası açısı)
  {
    id: 'mig_dag_kuyruk2', map: 'anakara', seed: SEED, clock: 6.0, clouds: 0.6,
    setup: (w) => {
      forestAt.copy(forestSpot());
      lowFlight(() => forestAt.clone(), 45, 1400)(w);
    },
    trigger: (w) => {
      const a = mig(w);
      return a && Math.hypot(a.pos.x - forestAt.x, a.pos.z - forestAt.z) < 1600 ? { ids: [a.id] } : null;
    },
    offset: 4, maxWait: 500, duration: 12,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      return { ...c.d.wing(a, { offset: [0.85, 1.05, -5.4], look: [0.12, 1.5, 60], roll: 1, fov: 66 }), handheld: 0.15 };
    },
  },
  // Kalabalık şehrin üstünden dümdüz alçak geçiş, şafak alacakaranlığı; kamera önde, hafif solda ve yukarıda, uçak ortada
  {
    id: 'mig_sehir2', map: 'anakara', seed: SEED, clock: 4.75, clouds: 0.5,
    setup: (w) => {
      theater(w, { forward: false });
      townAt.copy(bigTown(w));
      const start = townAt.clone().addScaledVector(TOWN_DIR, -7000);
      start.y = groundLevel(start.x, start.z) + 70;
      const end = townAt.clone().addScaledVector(TOWN_DIR, 40000);
      const hdg = (Math.atan2(TOWN_DIR.x, -TOWN_DIR.z) * 180) / Math.PI;
      w.spawnAirborneFlight(0, 'mig15', 1, start, hdg, plan('cap', 'mig15', {
        targetPos: end.setY(0), altitude: start.y, speed: 'max', lowLevel: true, agl: 60, patrolRadius: 3000, stationTime: 900,
      }), null);
    },
    trigger: (w) => {
      const a = mig(w);
      return a && Math.hypot(a.pos.x - townAt.x, a.pos.z - townAt.z) < 700 ? { ids: [a.id] } : null;
    },
    offset: -1, maxWait: 300, duration: 6,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      return c.d.wing(a, { offset: [-4.5, 2.6, 27], look: [0, 0.4, 0], fov: 44 });
    },
  },
);

/** Kıyı şehri: kıyı noktası, denize bakan yön ve kıyı boyunca yön (kurulumda yazılır). */
const coast = { found: false, at: new THREE.Vector3(), sea: new THREE.Vector3(), along: new THREE.Vector3() };
const isWater = (x: number, z: number) => footprintStats(x, z, 40, 40, 0).water > 0;

/**
 * Haritada düz ve uzun bir kıyı şeridi bulur: kıyı boyunca ±1,8 km karada, 350 m içeride düz; deniz bir yanda
 * 500 m'de. Sonra kıyı boyunca 3,4 km, 650 m derinlikte sık sokak düzeninde büyük şehir kurar (deniz yanında
 * apartman ve iş merkezleri, içeride ev ve çarşılar).
 */
function findCoast(): void {
  if (coast.found) return;
  coast.found = true;
  let best = -Infinity;
  for (let x = -110000; x <= 110000; x += 2500) {
    for (let z = -110000; z <= 110000; z += 2500) {
      if (isWater(x, z) || groundLevel(x, z) < 1) continue;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const sea = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        if (!isWater(x + sea.x * 500, z + sea.z * 500) || isWater(x - sea.x * 400, z - sea.z * 400)) continue;
        const al = new THREE.Vector3(-sea.z, 0, sea.x);
        let ok = 0;
        const hs: number[] = [];
        for (let u = -1800; u <= 1800; u += 300) {
          const px = x + al.x * u - sea.x * 350;
          const pz = z + al.z * u - sea.z * 350;
          if (!isWater(px, pz) && isWater(px + sea.x * 650, pz + sea.z * 650)) ok++;
          hs.push(groundLevel(px, pz));
        }
        const s = ok * 10 - (Math.max(...hs) - Math.min(...hs)) / 10;
        if (s > best) {
          best = s;
          coast.at.set(x, 0, z);
          coast.sea.copy(sea);
          coast.along.copy(al);
        }
      }
    }
  }
}

function coastCity(w: World): void {
  findCoast();
  // Bloklar: kıyı boyunca 64 m, içeri 62 m aralık; her 4 sütunda bir ara sokak, her 3 sırada bir cadde boş kalır
  const kinds = ['apartment', 'office', 'apartment', 'shops', 'office', 'apartment', 'house', 'shops', 'apartment', 'house'] as const;
  for (let i = -60; i <= 110; i++) {
    if (i % 4 === 0) continue;
    for (let j = 0; j < 17; j++) {
      if (j % 3 === 2) continue;
      const p = cityPt(i * 64, j * 62);
      if (isWater(p.x, p.z)) continue;
      const k = j < 4 ? (['apartment', 'office', 'apartment', 'office'] as const)[(i + j + 60) % 4] : kinds[(i * 5 + j * 7 + 999) % kinds.length];
      w.addStructure(0, k, w.structureName(0, k), p.x, p.z, 0);
    }
  }
}

/** Şehir ızgarasında nokta: kıyı boyunca u, kıyıdan içeri v (m). */
const cityPt = (u: number, v: number) => coast.at.clone().addScaledVector(coast.along, u).addScaledVector(coast.sea, 120 - v);

/** Şehrin yolları (kayıt kipi süsü): sokak ve cadde boşluklarında asfalt şeritler ve kıyı yolu. */
function cityRoads(g: THREE.Group, o = { i0: -60, i1: 110, di: 4, rows: 17, pu: 64, pv: 62, lift: 0.45 }): void {
  const mat = new THREE.MeshLambertMaterial({ color: 0x55575a });
  const cars: { p: THREE.Vector3; ry: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Yol: araziyi izleyen tek parça şerit (15 m'de bir kesit; yükseklik en yüksek kenar noktasının üstünde, komşularla
  // yumuşatılmış: basamak yerine hafif rampa); suya rastlayınca şerit kesilir
  const strip = (u0: number, v0: number, u1: number, v1: number, wd: number) => {
    const a = cityPt(u0, v0);
    const b = cityPt(u1, v1);
    const n = Math.max(2, Math.round(a.distanceTo(b) / 15));
    const ry = Math.atan2(b.x - a.x, b.z - a.z);
    const side = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const pts = Array.from({ length: n + 1 }, (_, i) => a.clone().lerp(b, i / n));
    const raw = pts.map((p) => Math.max(groundLevel(p.x, p.z), groundLevel(p.x + side.x * wd * 0.5, p.z + side.z * wd * 0.5), groundLevel(p.x - side.x * wd * 0.5, p.z - side.z * wd * 0.5)) + o.lift);
    const ys = raw.map((y, i) => Math.max(y, (raw[Math.max(0, i - 2)] + raw[Math.max(0, i - 1)] + y + raw[Math.min(n, i + 1)] + raw[Math.min(n, i + 2)]) / 5));
    const pos: number[] = [];
    for (let i = 0; i < n; i++) {
      const [p, q] = [pts[i], pts[i + 1]];
      if (isWater(p.x, p.z) || isWater(q.x, q.z)) continue;
      const corner = (o: THREE.Vector3, y: number, s: number) => [o.x + side.x * wd * 0.5 * s, y, o.z + side.z * wd * 0.5 * s];
      const [l0, r0, l1, r1] = [corner(p, ys[i], -1), corner(p, ys[i], 1), corner(q, ys[i + 1], -1), corner(q, ys[i + 1], 1)];
      pos.push(...l0, ...r0, ...l1, ...r0, ...r1, ...l1);
      // Arabalar: iki şeritte rastgele aralıkla
      for (let t = rnd() * 15; t < 15; t += 14 + rnd() * 24) {
        const lane = (rnd() < 0.5 ? -1 : 1) * wd * 0.22;
        const k = t / 15;
        cars.push({ p: p.clone().lerp(q, k).addScaledVector(side, lane).setY(ys[i] + (ys[i + 1] - ys[i]) * k + 0.72), ry: ry + (lane > 0 ? Math.PI : 0) });
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.material.side = THREE.DoubleSide;
    g.add(m);
  };
  for (let i = o.i0; i <= o.i1; i += o.di) strip(i * o.pu, -40, i * o.pu, (o.rows - 1) * o.pv + 30, 14);
  for (let j = 2; j < o.rows; j += 3) strip(o.i0 * o.pu, j * o.pv, o.i1 * o.pu, j * o.pv, 18);
  strip(o.i0 * o.pu, -45, o.i1 * o.pu, -45, 22);
  const colors = [0x2d2e30, 0x8a2a24, 0x2f4a6e, 0xd9d4c8, 0x4f5638, 0x6e6a60, 0xb8862e];
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.45, 4.3), new THREE.MeshLambertMaterial(), cars.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  cars.forEach((c, i) => {
    im.setMatrixAt(i, m4.makeRotationY(c.ry).setPosition(c.p));
    im.setColorAt(i, col.setHex(colors[i % colors.length]));
  });
  im.computeBoundingSphere();
  g.add(im);
}

MIG_TAKES.push(
  // Kıyı şehri üstünden dümdüz alçak geçiş, saat 05:00; uçak kıyı boyunca, denize yakın, şehrin üstünde
  {
    id: 'mig_kiyi', map: 'anakara', seed: SEED, clock: 5.0, clouds: 0.5,
    setup: (w) => {
      theater(w, { forward: false });
      coastCity(w);
      const line = coast.at.clone().addScaledVector(coast.sea, 30);
      const start = line.clone().addScaledVector(coast.along, -6500);
      start.y = Math.max(groundLevel(start.x, start.z), 0) + 75;
      const end = line.clone().addScaledVector(coast.along, 40000);
      const hdg = (Math.atan2(coast.along.x, -coast.along.z) * 180) / Math.PI;
      w.spawnAirborneFlight(0, 'mig15', 1, start, hdg, plan('cap', 'mig15', {
        targetPos: end.setY(0), altitude: start.y, speed: 'max', lowLevel: true, agl: 65, patrolRadius: 3000, stationTime: 900,
      }), null);
    },
    trigger: (w) => {
      const a = mig(w);
      if (!a) return null;
      const d = a.pos.clone().sub(coast.at).dot(coast.along);
      return d > -1900 ? { ids: [a.id] } : null;
    },
    offset: 0, maxWait: 300, duration: 7,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      const sh = c.d.wing(a, { offset: [-4.5, 2.8, 27], look: [0, 0.4, 0], fov: 50 });
      // Bakış biraz deniz yanına: uçak ortada kalır, kıyı ve deniz kadraja girer
      sh.look.copy(a.pos).addScaledVector(coast.sea, 3).add(new THREE.Vector3(0, 0.4, 0));
      return sh;
    },
  },
);

MIG_TAKES.push(
  // Büyük kıyı şehri, saat 06:00: uçak baştan sona şehrin üstünde, kulelerin üstünde dümdüz; deniz sağında
  {
    id: 'mig_kiyi2', map: 'anakara', seed: SEED, clock: 6.0, clouds: 0.5,
    setup: (w) => {
      theater(w, { forward: false });
      coastCity(w);
      const dir = coast.along.clone().negate();
      const line = cityPt(0, 260);
      const start = line.clone().addScaledVector(dir, -2700);
      start.y = Math.max(groundLevel(start.x, start.z), 0) + 125;
      const end = line.clone().addScaledVector(dir, 40000);
      const hdg = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
      w.spawnAirborneFlight(0, 'mig15', 1, start, hdg, plan('cap', 'mig15', {
        targetPos: end.setY(0), altitude: start.y, speed: 'max', lowLevel: true, agl: 120, patrolRadius: 3000, stationTime: 900,
      }), null);
    },
    decorate: (g) => cityRoads(g),
    trigger: (w) => {
      const a = mig(w);
      if (!a) return null;
      return a.pos.clone().sub(coast.at).dot(coast.along) < 1300 ? { ids: [a.id] } : null;
    },
    offset: 0, maxWait: 300, duration: 7,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      const sh = c.d.wing(a, { offset: [-4.5, 2.8, 27], look: [0, 0.4, 0], fov: 50 });
      sh.look.copy(a.pos).addScaledVector(coast.sea, 3).add(new THREE.Vector3(0, 0.4, 0));
      return sh;
    },
  },
);

/** İkili kolun kanat adamı: çekim boyunca konumu ve yönü kamerada elle (kayıt notu, kayıt başında sıfırlanır). */
const wing2 = { t0: -1, pos: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(), roll: 0 };
const BREAK_AT = 3.5;

MIG_TAKES.push(
  // İki MiG-15, 06:00, ağaçlı dağların üstünde yüksekte: kamera öndekinde (önde, sağda, az yukarıda); kanat adamı sol
  // arka çaprazda yakın; 3,5 sn'de yavaşça sola yuvarlanıp aşağı ayrılır
  {
    id: 'mig_ikili', map: 'anakara', seed: SEED, clock: 6.0, clouds: 0.6,
    setup: (w) => {
      forestAt.copy(forestSpot());
      theater(w, { forward: false });
      const hdg = 75;
      const h = (hdg * Math.PI) / 180;
      const dir = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
      const start = forestAt.clone().addScaledVector(dir, -4000);
      start.y = groundLevel(forestAt.x, forestAt.z) + 1100;
      w.spawnAirborneFlight(0, 'mig15', 2, start, hdg, plan('cap', 'mig15', {
        targetPos: forestAt.clone().addScaledVector(dir, 60000).setY(0), altitude: start.y, speed: 'max', patrolRadius: 3000, stationTime: 900, formation: 'echelonL',
      }), null);
      wing2.t0 = -1;
    },
    trigger: (w) => {
      const m = w.aircraft.filter((a) => a.team === 0 && a.spec.id === 'mig15');
      return m.length >= 2 ? { ids: [m[0].id, m[1].id] } : null;
    },
    offset: 3, maxWait: 30, duration: 9,
    shot: (c) => {
      const lead = c.ac(c.s.ids[0])!;
      const wing = c.ac(c.s.ids[1]);
      const lf = new THREE.Vector3(0, 0, 1).applyQuaternion(lead.quat);
      const lu = new THREE.Vector3(0, 1, 0).applyQuaternion(lead.quat);
      const ll = new THREE.Vector3(1, 0, 0).applyQuaternion(lead.quat);
      if (wing) {
        if (c.t < BREAK_AT || wing2.t0 < 0) {
          // Sol arka çaprazda yakın düzen: 16 m solda, 13 m geride, 1 m aşağıda; aynı yön
          wing2.pos.copy(lead.pos).addScaledVector(ll, 11).addScaledVector(lf, -12).addScaledVector(lu, -1);
          wing2.fwd.copy(lf);
          wing2.up.copy(lu);
          wing2.roll = 0;
          if (c.t >= BREAK_AT) wing2.t0 = c.t;
        } else {
          // Ayrılış: 2,5 sn'de yumuşakça ~110° sola yatar; kaldırma kuvveti yönünde (sola ve aşağı) döner
          const k = Math.min(1, (c.t - wing2.t0) / 2.5);
          wing2.roll = 1.9 * k * k * (3 - 2 * k);
          const lift = wing2.up.clone().applyAxisAngle(wing2.fwd, -wing2.roll);
          wing2.fwd.addScaledVector(lift, 0.32 * k * c.dt).addScaledVector(new THREE.Vector3(0, -1, 0), 0.05 * c.dt).normalize();
          wing2.pos.addScaledVector(wing2.fwd, lead.speed * c.dt);
        }
        const up = wing2.up.clone().applyAxisAngle(wing2.fwd, -wing2.roll);
        const left = up.clone().cross(wing2.fwd).normalize();
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up.clone().crossVectors(wing2.fwd, left), wing2.fwd));
        wing.pos.copy(wing2.pos);
        wing.prevPos.copy(wing2.pos);
        wing.quat.copy(q);
        wing.prevQuat.copy(q);
        wing.speed = lead.speed;
      }
      return c.d.wing(lead, { offset: [5, 1.3, 36], look: [-5.5, 0, -6], fov: 50 });
    },
  },
);

// --- Elle uçuş: yatış takvimiyle gerçek kuvvetlerle uçan uçak (yapay zekâ her karede geçersiz kalır) ---------------

const G0 = 9.81;
export const DEG_R = Math.PI / 180;
const clampV = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smooth01 = (x: number) => {
  const k = clampV(x, 0, 1);
  return k * k * (3 - 2 * k);
};

export interface Kine { w: World | null; pos: THREE.Vector3; f: THREE.Vector3; phi: number; rate: number; n: number; v: number; alt: number }
export const newKine = (): Kine => ({ w: null, pos: new THREE.Vector3(), f: new THREE.Vector3(), phi: 0, rate: 0, n: 1, v: 200, alt: 0 });

export function kineStart(k: Kine, w: World, pos: THREE.Vector3, hdg: number, v: number): void {
  const h = hdg * DEG_R;
  k.w = w;
  k.pos.copy(pos);
  k.f.set(Math.sin(h), 0, -Math.cos(h));
  k.phi = 0;
  k.rate = 0;
  k.n = 1;
  k.v = v;
  k.alt = pos.y;
}

/** Yatış takvimi [zaman, derece]; aralar yumuşak geçiş (pozitif sağa). */
export function rollKeys(keys: [number, number][]): (t: number) => number {
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

const groundOrSea = (x: number, z: number) => Math.max(groundLevel(x, z), 0);
const UP_Y = new THREE.Vector3(0, 1, 0);

/** Yatmış uçağın üst yönü: dünya üstünün burna dik kısmı, burun ekseninde sağa phi kadar döner. */
function bankedUp(f: THREE.Vector3, phi: number): THREE.Vector3 {
  const up0 = UP_Y.clone().addScaledVector(f, -f.y).normalize();
  const right = f.clone().cross(up0);
  return up0.multiplyScalar(Math.cos(phi)).addScaledVector(right, Math.sin(phi));
}

/**
 * Bir adım: kaldırma kuvveti yatmış üst yönde, yerçekimi aşağıda. law.n verilirse o yük faktörü; yoksa yük faktörü
 * irtifayı tutacak kadar (law.alt sabit irtifa, law.agl arazi izleme: 600 m ilerisine kadar en yüksek yerin üstü).
 */
export function kineStep(k: Kine, dt: number, phiDeg: number, law: { n?: number; alt?: number; agl?: number }): void {
  const phi = phiDeg * DEG_R;
  k.rate = (phi - k.phi) / dt;
  k.phi = phi;
  const up = bankedUp(k.f, phi);
  let n = law.n ?? 1;
  if (law.n === undefined) {
    if (law.agl !== undefined) {
      const hx = new THREE.Vector3(k.f.x, 0, k.f.z).normalize();
      let h = groundOrSea(k.pos.x, k.pos.z);
      for (const d of [120, 250, 400, 600]) h = Math.max(h, groundOrSea(k.pos.x + hx.x * d, k.pos.z + hx.z * d));
      k.alt += clampV(h + law.agl - k.alt, -30 * dt, 70 * dt);
    } else if (law.alt !== undefined) k.alt = law.alt;
    const ay = 2.5 * (clampV(k.alt - k.pos.y, -30, 45) - k.f.y * k.v);
    n = Math.abs(up.y) > 0.12 ? clampV((ay + G0) / up.y, -2.5, 6.5) : 1;
  }
  k.n = n;
  const a = up.multiplyScalar(n * G0);
  a.y -= G0;
  a.addScaledVector(k.f, -a.dot(k.f));
  k.f.addScaledVector(a, dt / k.v).normalize();
  k.pos.addScaledVector(k.f, k.v * dt);
}

/** Uçağı elle uçuş durumuna getirir (görüntü, kumanda yüzeyleri ve ses buna uyar). */
export function kineApply(a: Aircraft, k: Kine): void {
  const up0 = bankedUp(k.f, k.phi);
  const left = up0.clone().cross(k.f).normalize();
  const up = k.f.clone().cross(left);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, k.f));
  a.pos.copy(k.pos);
  a.prevPos.copy(k.pos);
  a.quat.copy(q);
  a.prevQuat.copy(q);
  a.fwd.copy(k.f);
  a.speed = k.v;
  a.rollRate = k.rate;
  a.controls.rollRate = k.rate;
  a.controls.nCmd = k.n;
  a.controls.throttle = 1;
}

/** Elle uçurulacak MiG-15 doğurur (yeri ve yönü sonra kamera kancasında). */
function spawnMigs(w: World, pos: THREE.Vector3, hdg: number, n: number): void {
  const h = hdg * DEG_R;
  const far = pos.clone().add(new THREE.Vector3(Math.sin(h), 0, -Math.cos(h)).multiplyScalar(60000));
  w.spawnAirborneFlight(0, 'mig15', n, pos.clone(), hdg, plan('cap', 'mig15', { targetPos: far.setY(0), altitude: pos.y, patrolRadius: 3000, stationTime: 900 }), null);
}

/** Kuyruk kamerası: dikey kuyruğun sağ yüzüne yapışık, uçakla yatar. */
const tailCam = (c: TakeCtx, a: Aircraft, lookX = 0.12, lookY = 1.5, fov = 66, shake = 0.15): Shot =>
  ({ ...c.d.wing(a, { offset: [0.85, 1.05, -5.4], look: [lookX, lookY, 60], roll: 1, fov }), handheld: shake });

// --- Büyük kıyı şehri (süs: simülasyona girmez; binalar tür başına tek çizim, çok sayıda) --------------------------

const BIG = { i0: -75, i1: 120, di: 3, rows: 50, pu: 64, pv: 60, lift: 0.75 };
let bigGroup: THREE.Group | null = null;

/**
 * Şehir: asfaltla örtülü zemin, sokak ve caddeler (arabalı), sokak düzeninde binalar. Kıyı şeridi ve merkez kule
 * apartman ve iş merkezi ağırlıklı, dışa doğru apartman, çarşı ve ev. Kurulum bir kez, sonraki çekimlerde aynısı.
 */
function bigCity(g: THREE.Group): void {
  if (bigGroup) {
    g.add(bigGroup);
    return;
  }
  findCoast();
  const cg = new THREE.Group();
  const mat = archMaterial();
  const depth = BIG.rows * BIG.pv;
  // Ağaç ve köy kalksın
  const circles = [];
  for (let u = BIG.i0 * BIG.pu; u <= BIG.i1 * BIG.pu; u += 1400) {
    const p = cityPt(u, depth / 2);
    circles.push({ x: p.x, z: p.z, r: 2300 });
  }
  addClearings(circles);
  // Zemin: 40 m ızgara, araziyi izler, suda yok
  const pos: number[] = [];
  const CELL = 40;
  const v3 = (u: number, v: number) => {
    const p = cityPt(u, v);
    return [p.x, groundOrSea(p.x, p.z) + 0.4, p.z];
  };
  for (let u = BIG.i0 * BIG.pu - 60; u < BIG.i1 * BIG.pu + 60; u += CELL) {
    for (let v = -70; v < depth + 40; v += CELL) {
      const c = cityPt(u + CELL / 2, v + CELL / 2);
      if (isWater(c.x, c.z)) continue;
      const [a, b, d, e] = [v3(u, v), v3(u + CELL, v), v3(u, v + CELL), v3(u + CELL, v + CELL)];
      pos.push(...a, ...b, ...d, ...b, ...e, ...d);
    }
  }
  const ground = new THREE.BufferGeometry();
  ground.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ground.computeVertexNormals();
  if (ground.getAttribute('normal').getY(0) < 0) {
    for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
    ground.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ground.computeVertexNormals();
  }
  const gb = new ArchBatch();
  gb.push(ground, 0x8f8d86, SURF.paving);
  gb.build(cg, mat);
  cityRoads(cg, BIG);
  // Binalar: tür başına birkaç biçim, her biri tek InstancedMesh
  const holder = new THREE.Group();
  const lists = new Map<THREE.BufferGeometry, THREE.Matrix4[]>();
  const tpl = new Map<string, THREE.BufferGeometry>();
  const geoOf = (kind: StructureKind, nr: number): THREE.BufferGeometry => {
    const key = kind + nr;
    let geo = tpl.get(key);
    if (!geo) {
      const b = new ArchBatch();
      buildCityModel(kind, mulberry32(nr * 971 + kind.length * 31), b);
      geo = b.build(holder, mat)!.geometry;
      tpl.set(key, geo);
      lists.set(geo, []);
    }
    return geo;
  };
  const rng = mulberry32(4242);
  const baseRy = Math.atan2(coast.along.x, coast.along.z);
  const q = new THREE.Quaternion();
  const put = (kind: StructureKind, x: number, z: number, sx: number, sy: number) => {
    const y = groundOrSea(x, z) + 0.35;
    q.setFromAxisAngle(UP_Y, baseRy + (rng() < 0.5 ? 0 : Math.PI));
    lists.get(geoOf(kind, Math.floor(rng() * 5)))?.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sx)));
  };
  for (let i = BIG.i0; i <= BIG.i1; i++) {
    if (i % BIG.di === 0) continue;
    for (let j = 0; j < BIG.rows; j++) {
      if (j % 3 === 2) continue;
      const u = i * BIG.pu;
      const p = cityPt(u, j * BIG.pv);
      if (isWater(p.x, p.z)) continue;
      const core = Math.abs(u - 500) < 2600;
      const r = rng();
      const tower = j < 6 ? r < 0.6 : core ? r < 0.38 : r < 0.1;
      const apart = j < 6 ? true : core ? r < 0.82 : r < 0.6;
      if (tower) put('office', p.x, p.z, 0.68, 0.85 + rng() * 0.65);
      else if (apart) put('apartment', p.x, p.z, 1, 0.9 + rng() * 0.5);
      else if (r < (core ? 0.92 : 0.74)) put('shops', p.x, p.z, 0.48, 1);
      else if (r < 0.97) {
        for (const [dx, dz] of [[-15, -14], [15, -14], [-15, 14], [15, 14]]) {
          put('house', p.x + coast.along.x * dx + coast.sea.x * dz, p.z + coast.along.z * dx + coast.sea.z * dz, 0.8, 1);
        }
      } else put('park', p.x, p.z, 0.55, 1);
    }
  }
  let total = 0;
  for (const [geo, ms] of lists) {
    if (!ms.length) continue;
    total += ms.length;
    const im = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((m, k) => im.setMatrixAt(k, m));
    im.computeBoundingSphere();
    cg.add(im);
  }
  console.log('büyük şehir: bina', total);
  bigGroup = cg;
  g.add(cg);
}

/** Kıyı çizgisinin şehir ızgarasındaki v'si (kıyı noktasından denize doğru ilk su). */
function shoreV(u: number): number {
  for (let v = 120; v > -900; v -= 20) {
    const p = cityPt(u, v);
    if (isWater(p.x, p.z)) return v;
  }
  return -900;
}

const K1 = newKine();
const K2 = newKine();
const K3 = newKine();
const rollDag = rollKeys([[1, 0], [2, 72], [5, 72], [8, 288], [11, 288], [12.2, 360]]);
const ROLL_TWO = rollKeys([[2.2, 0], [3.2, -55], [4.6, -55], [5.6, 0]]);
const BREAK_T = 6.3;
const cityTurn = { turned: 0, outAt: -1 };

MIG_TAKES.push(
  // Dağ klibinin devamı (06:00, ağaçlı dağlar, kuyruk kamerası): sağa yatış, bir süre öyle; yuvarlanma aynı yönde sürer,
  // sırt üstü geçer, sol yatışa gelince düzelmez, bir süre sola döner, sonra düzelir
  {
    id: 'mig_dag_takla', map: 'anakara', seed: SEED, clock: 6.0, clouds: 0.6,
    setup: (w) => {
      forestAt.copy(forestSpot());
      theater(w, { forward: false });
      spawnMigs(w, forestAt.clone().setY(groundLevel(forestAt.x, forestAt.z) + 200), 75, 1);
    },
    trigger: firstMig, offset: 0.2, maxWait: 20, duration: 14,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      if (K1.w !== c.w) kineStart(K1, c.w, forestAt.clone().setY(groundLevel(forestAt.x, forestAt.z) + 75), 75, 205);
      kineStep(K1, c.dt, rollDag(Math.max(0, c.t)), { agl: 70 });
      kineApply(a, K1);
      return tailCam(c, a);
    },
  },
  // Şehrin üstünde, kuyruk kamerası (06:00): 4 sn düz, sağa denize yatar, deniz solunda kalana dek döner (biraz denizin
  // üstüne çıkar), dönüşü sürdürüp yeniden şehrin üstüne gelir
  {
    id: 'mig_sehir_kuyruk', map: 'anakara', seed: SEED, clock: 6.0, clouds: 0.5,
    setup: (w) => {
      theater(w, { forward: false });
      findCoast();
      spawnMigs(w, cityPt(1200, shoreV(1200) + 1000).setY(400), 90, 1);
    },
    decorate: (g) => bigCity(g),
    trigger: firstMig, offset: 0.2, maxWait: 20, duration: 25,
    shot: (c) => {
      const a = c.ac(c.s.ids[0])!;
      if (K1.w !== c.w) {
        const v0 = shoreV(1200) + 1000;
        const p = cityPt(1200, v0);
        const dir = coast.along.clone().negate();
        const hdg = Math.atan2(dir.x, -dir.z) / DEG_R;
        p.y = groundOrSea(p.x, p.z) + 145;
        kineStart(K1, c.w, p, hdg, 170);
        cityTurn.turned = 0;
        cityTurn.outAt = -1;
      }
      const t = Math.max(0, c.t);
      let bank = 78 * smooth01(t - 4);
      if (cityTurn.outAt < 0 && Math.abs(cityTurn.turned) > 230 * DEG_R) cityTurn.outAt = t;
      if (cityTurn.outAt >= 0) bank = 78 * (1 - smooth01((t - cityTurn.outAt) / 1.2));
      const f0 = K1.f.clone();
      kineStep(K1, c.dt, bank, { alt: K1.alt });
      cityTurn.turned += Math.atan2(f0.x * K1.f.z - f0.z * K1.f.x, f0.x * K1.f.x + f0.z * K1.f.z);
      kineApply(a, K1);
      return tailCam(c, a);
    },
  },
  // İkili kol ağaçlı dağların üstünde (06:00): kamera arkadaki uçağın kuyruğunun sağ yüzünde, hafif dışarı bakar, öndeki
  // görünür, hafif sallantı. İkisi birlikte sola yatıp düzelir; sonra öndeki yeniden sola yatıp aşağı gider
  {
    id: 'mig_ikili_kuyruk', map: 'anakara', seed: SEED, clock: 6.0, clouds: 0.6,
    setup: (w) => {
      forestAt.copy(forestSpot());
      theater(w, { forward: false });
      spawnMigs(w, forestAt.clone().setY(groundLevel(forestAt.x, forestAt.z) + 600), 75, 2);
    },
    trigger: (w) => {
      const m = w.aircraft.filter((a) => a.team === 0 && a.spec.id === 'mig15');
      return m.length >= 2 ? { ids: [m[0].id, m[1].id] } : null;
    },
    offset: 0.2, maxWait: 20, duration: 11.5,
    shot: (c) => {
      const lead = c.ac(c.s.ids[0])!;
      const wing = c.ac(c.s.ids[1])!;
      if (K2.w !== c.w) {
        let peak = 0;
        for (let k = 0; k < 24; k++) {
          const r = 800 + k * 200;
          const a0 = k * 0.9;
          peak = Math.max(peak, groundLevel(forestAt.x + Math.cos(a0) * r, forestAt.z + Math.sin(a0) * r));
        }
        const h = 75 * DEG_R;
        const p = forestAt.clone().add(new THREE.Vector3(-Math.sin(h) * 1200, 0, Math.cos(h) * 1200));
        p.y = Math.max(peak, groundLevel(forestAt.x, forestAt.z)) + 280;
        kineStart(K2, c.w, p, 75, 215);
        K3.w = null;
      }
      const t = Math.max(0, c.t);
      if (t < BREAK_T) {
        kineStep(K2, c.dt, ROLL_TWO(t), { alt: K2.alt });
        kineApply(lead, K2);
        // Arkadaki: sol arka çaprazda yakın düzen (ikili klibiyle aynı), aynı yatış
        const ll = new THREE.Vector3(1, 0, 0).applyQuaternion(lead.quat);
        const lu = new THREE.Vector3(0, 1, 0).applyQuaternion(lead.quat);
        K3.pos.copy(K2.pos).addScaledVector(ll, 11).addScaledVector(K2.f, -20).addScaledVector(lu, -1);
        K3.f.copy(K2.f);
        K3.phi = K2.phi;
        K3.rate = K2.rate;
        K3.n = K2.n;
        K3.v = K2.v;
        K3.alt = K3.pos.y;
        K3.w = c.w;
      } else {
        // Öndeki: 1,4 sn'de 125° sola yatar, çekerek aşağı döner; arkadaki düz uçar
        const k = (t - BREAK_T) / 1.4;
        kineStep(K2, c.dt, -125 * smooth01(k), { n: 1 + 1.2 * smooth01(k) });
        kineApply(lead, K2);
        kineStep(K3, c.dt, 0, { alt: K3.alt });
      }
      kineApply(wing, K3);
      // Bakış öndekini azıcık izler (çok takip etmez)
      const follow = smooth01((t - BREAK_T) / 3);
      return tailCam(c, wing, 23 - 10 * follow, 1.5 - 7 * follow, 68, 0.35);
    },
  },
);

// Şafak kalkış çekimlerinin gece hâli (kafa ve apron çekimleriyle aynı saat)
/** Gece kalkışı: karanlıkta uzaktaki uçak seçilmez; uzun odak uçağı kadrajda hep aynı boyda tutar. */
function nightKalkis() {
  let at: THREE.Vector3 | null = null;
  let last = new THREE.Vector3();
  return (c: TakeCtx): Shot => {
    const a = c.ac(c.s.ids[0]);
    if (a) last = a.pos.clone().add(new THREE.Vector3(0, 1, 0));
    if (!at || c.t <= c.dt) {
      const ab = baseOf(c.w);
      const s = ab.takeoffStart(0);
      const along = a ? Math.hypot(a.pos.x - s.x, a.pos.z - s.z) + 240 : 240;
      at = runway(ab, along, 48, 1.0);
    }
    const fov = clampV(2 * Math.atan(17 / at.distanceTo(last)) / DEG_R, 12, 34);
    return { pos: at, look: last, fov };
  };
}

for (const id of ['mig_s8_hizalan', 'mig_s9_kalkis', 'mig_s10_takim', 'mig_s11_tirmanis']) {
  const t = MIG_TAKES.find((x) => x.id === id)!;
  MIG_TAKES.push({ ...t, id: id.replace('mig_s', 'mig_g'), clock: NIGHT, clouds: 0.3, ...(id === 'mig_s9_kalkis' ? { shot: nightKalkis() } : {}) });
}
