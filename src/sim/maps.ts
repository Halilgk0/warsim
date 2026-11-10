// Haritalar: doğal yükseklik fonksiyonu, tarafların ana üs yerleri, dekor şehirleri ve düzleştirilecek ovalar.
// Tanımlar 300 × 300 km (taban) için; küçük haritada (150, 200 km) büyük şekiller ve yerler k = büyüklük / 300 km
// oranında küçülür, yerel ayrıntı (tepeler, sırtlar, nehir genişliği) gerçek ölçüde kalır. k = 1'de arazi değişmez.
// Araziyi terrain.ts bu tanımlardan üretir (harita ya da büyüklük değişince yeniden).

import { makeFbm } from '../core/noise';
import { clamp, smoothstep } from '../core/math';
import { L } from '../i18n';
import {
  BLUE_FACTORY, BLUE_FORWARD, BLUE_MAIN, MAP_BASE, RED_FACTORY, RED_FORWARD, RED_MAIN, type CityDef, type LandPoint, type SiteDef,
} from './mapData';

export interface MapDef {
  id: string;
  name: string;
  desc: string;
  /** Tarafların ana üs yerleri (oyuncu, sonra düşmanlar sırayla). */
  sites: SiteDef[];
  cities: CityDef[];
  /** Ayrıca düzleştirilecek noktalar (test senaryolarının tesisleri vb.). */
  extraLand: LandPoint[];
  /**
   * Rastgele başlangıç bölgeleri (taban ölçekte daireler): varsa her taraf ayrı bir bölgede başlar (Takımadalar: her ülke
   * kendi adasında, ortadaki tarafsız ada ve adacıklar dışında). Yoksa harita her yerinde serbest.
   */
  startZones?: LandPoint[];
  /** Düzleştirme öncesi doğal yükseklik (m). k: harita büyüklüğü / 300 km (x, z gerçek konum). */
  natural(x: number, z: number, k?: number): number;
}

/** Taban haritanın yarı kenarı (tanımların ölçeği). */
const HALF = MAP_BASE / 2;

const fbmBase = makeFbm(1337, 5);
const fbmHill = makeFbm(4242, 5);
const fbmRidge = makeFbm(9157, 4);
const fbmMask = makeFbm(2741, 3);
const fbmMask2 = makeFbm(3613, 3);
const fbmWarp = makeFbm(777, 3);
const fbmCoast = makeFbm(5309, 4);

/** Yükseklik ölçeği: 0..1 civarı biçim değeri → metre (deniz tabanı negatif). */
const toMeters = (h: number) => (h > 0 ? Math.pow(h, 1.3) * 1200 : h * 320);

/** Kıvrılan nehir yatağına uzaklık (m). */
function riverDist(x: number, z: number, x0: number, amp: number, z0: number, z1: number, wl: number): number {
  if (z < z0 || z > z1) return Infinity;
  const rx = x0 + amp * Math.sin(z / wl) + amp * 0.4 * Math.sin(z / (wl * 0.39) + 0.7);
  return Math.abs(x - rx);
}

// ---------------------------------------------------------------- 1. Anakara

/** Eski 150 km haritanın büyük şekilleri 2 kat ölçekte; yerel tepe ayrıntısı aynı ölçekte kalır. */
const S = 2;

function anakara(x: number, z: number, k = 1): number {
  // Büyük şekiller taban koordinatında (X, Z), yerel ayrıntı gerçek koordinatta (lx, lz)
  const X = x / k;
  const Z = z / k;
  const wx = X + fbmWarp(X / 60000, Z / 60000) * 12000;
  const wz = Z + fbmWarp(X / 60000 + 5.3, Z / 60000 - 3.1) * 12000;
  const lx = wx * k;
  const lz = wz * k;
  let h = fbmBase(wx / 62000, wz / 62000) * 0.5 + 0.2;
  h += fbmHill(lx / 9000, lz / 9000) * 0.15;
  const ridge = clamp(1 - Math.abs(fbmRidge(lx / 7500, lz / 7500)) * 2.3, 0, 1);
  // Orta silsile (kuzey–güney) ve iki geçit
  const cx = S * (7000 * Math.sin(Z / (26000 * S)) + 3500 * Math.sin(Z / (9500 * S) + 1.1));
  const dr = (X - cx) / 22000;
  const range = Math.exp(-dr * dr);
  const passes = 1 - 0.8 * Math.exp(-(((Z + 26000 * S) / (5500 * S)) ** 2)) - 0.78 * Math.exp(-(((Z - 30000 * S) / (5000 * S)) ** 2));
  h += range * passes * (0.3 + ridge * ridge * 0.62);
  // Kuzey yaylaları
  const north = smoothstep(-36000 * S, -64000 * S, Z);
  h += north * (0.1 + ridge * ridge * ridge * 0.38);
  // Dağınık sırtlar (iki ölçekte)
  const mask = smoothstep(0.05, 0.35, fbmMask(X / 40000, Z / 40000));
  const mask2 = smoothstep(0.15, 0.42, fbmMask2(X / 18000, Z / 18000));
  h += Math.max(mask, mask2 * 0.7) * ridge * ridge * ridge * 0.42;
  // Körfeze akan iki nehir (yatak genişliği gerçek ölçüde)
  const rv = Math.min(
    riverDist(X, Z, -20000 * S, 5000 * S, -42000 * S, 60000 * S, 11000 * S),
    riverDist(X, Z, 24000 * S, 4500 * S, -45000 * S, 60000 * S, 11000 * S),
  ) * k;
  h -= 0.2 * Math.exp(-((rv / 1300) ** 2));
  // Güney körfezi
  const gx = (X - 6000 * S - 6000 * S * Math.sin(Z / (14000 * S))) / (21000 * S);
  const gz = (Z - 72000 * S) / (34000 * S);
  h -= 1.45 * Math.exp(-(gx * gx + gz * gz));
  // Kenarlar açık deniz
  const e = Math.max(Math.abs(X), Math.abs(Z)) / HALF;
  h -= smoothstep(0.86, 1.0, e) * 1.4;
  return toMeters(h);
}

const ANAKARA: MapDef = {
  id: 'anakara',
  name: L('Anakara', 'Mainland'),
  desc: L('Ortada iki geçitli dağ silsilesi, kuzeyde yaylalar, güneyde körfez; iki yanda geniş ovalar ve nehirler.',
    'A mountain range with two passes in the middle, uplands to the north, a gulf to the south; wide plains and rivers on both sides.'),
  sites: [BLUE_MAIN, RED_MAIN,
    { x: 92000, z: 108000, heading: 75 }, { x: -108000, z: -88000, heading: 15 },
    { x: 102000, z: -108000, heading: 150 }, { x: -104000, z: 98000, heading: 90 }],
  cities: [
    { x: -88000, z: -12000, r: 2600, n: 220 }, { x: -120000, z: -60000, r: 1500, n: 80 },
    { x: -64000, z: 64000, r: 1700, n: 95 }, { x: -28000, z: -100000, r: 1200, n: 55 },
    { x: -124000, z: 76000, r: 1100, n: 45 }, { x: 88000, z: 8000, r: 2600, n: 220 },
    { x: 120000, z: 60000, r: 1500, n: 80 }, { x: 64000, z: -64000, r: 1700, n: 95 },
    { x: 32000, z: 100000, r: 1200, n: 55 }, { x: 124000, z: -80000, r: 1100, n: 45 },
    { x: -70000, z: 118000, r: 1300, n: 60 }, { x: 70000, z: 122000, r: 1300, n: 60 },
    { x: -78000, z: -118000, r: 1300, n: 60 }, { x: 74000, z: -124000, r: 1300, n: 60 },
    { x: -40000, z: 20000, r: 1400, n: 70 }, { x: 44000, z: -24000, r: 1400, n: 70 },
  ],
  extraLand: [
    { x: BLUE_FORWARD.x, z: BLUE_FORWARD.z, r: 4200 },
    { x: RED_FORWARD.x, z: RED_FORWARD.z, r: 4200 },
    { x: BLUE_FACTORY.x, z: BLUE_FACTORY.z, r: 2600 },
    { x: RED_FACTORY.x, z: RED_FACTORY.z, r: 2600 },
  ],
  natural: anakara,
};

// ---------------------------------------------------------------- 2. Takımadalar

interface Island { x: number; z: number; r: number; mountain: number }

/** İç denizin çevresinde altı büyük ada (taraf sırasıyla: batı, doğu, GD, KB, KD, GB), ortada tarafsız ada, aralarda adacıklar. */
const RING_R = 92000;
const RING_ANGLES = [180, 0, 60, 240, 300, 120];
const ISLANDS: Island[] = [
  ...RING_ANGLES.map((a) => ({ x: Math.cos((a * Math.PI) / 180) * RING_R, z: Math.sin((a * Math.PI) / 180) * RING_R, r: 36000, mountain: 1 })),
  { x: 0, z: 0, r: 30000, mountain: 1.35 },
  ...[30, 90, 150, 210, 270, 330].map((a) => ({ x: Math.cos((a * Math.PI) / 180) * 98000, z: Math.sin((a * Math.PI) / 180) * 98000, r: 9000, mountain: 0.6 })),
];

function takimada(x: number, z: number, k = 1): number {
  // Adalar ve büyük kıyı şekilleri taban koordinatında (X, Z), yerel ayrıntı gerçek koordinatta
  const X = x / k;
  const Z = z / k;
  const wx = X + fbmWarp(X / 40000, Z / 40000) * 7000;
  const wz = Z + fbmWarp(X / 40000 + 5.3, Z / 40000 - 3.1) * 7000;
  const lx = wx * k;
  const lz = wz * k;
  let land = -2;
  let best: Island = ISLANDS[0];
  let ox = 0;
  let oz = 0;
  for (const I of ISLANDS) {
    const dx = wx - I.x;
    const dz = wz - I.z;
    const l = 1 - Math.hypot(dx, dz) / I.r;
    if (l > land) {
      land = l;
      best = I;
      ox = dx / I.r;
      oz = dz / I.r;
    }
  }
  // Koylar ve burunlar: iki ölçekte kıyı gürültüsü (kıyıya yakın yerde etkili)
  const coast = 1 - smoothstep(0.25, 0.6, land);
  land += (fbmCoast(X / 16000 - 3, Z / 16000 + 2) * 0.26 + fbmCoast(x / 6000, z / 6000) * 0.14) * coast + fbmCoast(x / 2200 + 7, z / 2200) * 0.04;
  if (land <= 0) return toMeters(Math.max(land * 1.5, -1.1) - 0.04);
  // Kıyıda kumsal ve ova, içeride tepeler; dağlar adanın dış (açık deniz) yüzünde
  let h = 0.035 + smoothstep(0, 0.4, land) * 0.16;
  h += fbmHill(lx / 9000, lz / 9000) * 0.12 * smoothstep(0, 0.25, land);
  const ridge = clamp(1 - Math.abs(fbmRidge(lx / 7000, lz / 7000)) * 2.2, 0, 1);
  const rl = Math.hypot(best.x, best.z);
  const outward = rl > 1 ? (ox * best.x + oz * best.z) / rl : 0.35;
  const mount = smoothstep(0.18, 0.65, land) * smoothstep(-0.1, 0.45, outward) * best.mountain;
  h += mount * (0.25 + ridge * ridge * 0.75);
  // Ortadaki adanın tepesinde sönmüş volkan
  if (rl < 1) h += Math.exp(-((Math.hypot(ox, oz) / 0.32) ** 2)) * 0.9;
  return toMeters(h);
}

/** Her büyük adada üs: adanın iç denize bakan ovasında. */
const islandSite = (i: number, heading: number): SiteDef => {
  const I = ISLANDS[i];
  const k = (RING_R - 13000) / RING_R;
  return { x: Math.round(I.x * k), z: Math.round(I.z * k), heading };
};

const islandCities = (): CityDef[] => {
  const out: CityDef[] = [];
  ISLANDS.slice(0, 6).forEach((I, i) => {
    const a = Math.atan2(I.z, I.x);
    for (const da of [-0.55, 0.55]) {
      const d = RING_R - 6000;
      out.push({ x: Math.round(Math.cos(a + da * 0.18) * d), z: Math.round(Math.sin(a + da * 0.18) * d), r: i < 2 ? 1800 : 1400, n: i < 2 ? 110 : 75 });
    }
  });
  out.push({ x: -9000, z: 14000, r: 2000, n: 140 }, { x: 12000, z: -12000, r: 1400, n: 70 });
  return out;
};

const TAKIMADA: MapDef = {
  id: 'takimada',
  name: L('Takımadalar', 'Archipelago'),
  desc: L('İç denizin çevresinde altı büyük ada; her ülke kendi adasında başlar. Ortada volkanlı tarafsız ada. Her baskın deniz aşar.',
    'Six large islands around an inland sea; each nation starts on its own island. A neutral volcanic island in the middle. Every raid crosses water.'),
  sites: [islandSite(0, 90), islandSite(1, 90), islandSite(2, 150), islandSite(3, 150), islandSite(4, 30), islandSite(5, 30)],
  cities: islandCities(),
  extraLand: [],
  startZones: ISLANDS.slice(0, 6).map(({ x, z, r }) => ({ x, z, r })),
  natural: takimada,
};

export const MAPS: MapDef[] = [ANAKARA, TAKIMADA];

export function mapById(id: string | undefined): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
