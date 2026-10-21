// Dış yük sistemi: mühimmat katalogu, uçak başına askı noktaları (gövde altı, kanat altı, roket rayı, bomba bölmesi,
// kanat ucu) ve hazır yükler. Oyuncu her askıya katalogdan uygun bir mühimmat seçip sayısını belirleyebilir
// (ör. Ju 87 D: gövde altına 1 × 500 kg, kanatlara 2 × 250 kg). Sınırlar: askı başına kg ve adet, uçağın azami yükü,
// mühimmatın ülke ailesi (Alman SC, Sovyet FAB, İngiliz/Amerikan libre bombaları) ve araştırma.
// Jet aşamasında füze, bomba ve pod türleri aynı düzene eklenecek.
//
// Bu modül specs.ts'ten yalnız tür alır (döngüsel bağımlılık olmasın); specs.ts türetmede buradaki tabloları kullanır.

import type { AircraftSpec, BombDef, GunSpec, Loadout, Placement, RocketDef } from './specs';

export type StoreKind = 'bomb' | 'rocket' | 'tank' | 'gunpod';
export type Family = 'de' | 'uk' | 'us' | 'su' | 'fr';
export type HardpointKind = 'center' | 'wing' | 'rail' | 'bay' | 'tip';

export interface StoreDef {
  id: string;
  name: string;
  /** Kısa ad (yük özetleri). */
  short: string;
  kind: StoreKind;
  /** Tek mühimmatın kütlesi (kg; tankta boş tank + yakıt). */
  mass: number;
  /** Parazit sürüklemeye katkı (bölme içinde 0). */
  drag: number;
  /** Kullanabilen ülke aileleri (yoksa hepsi). */
  families?: Family[];
  /** Yalnız bu askı türlerine takılır. */
  mounts?: HardpointKind[];
  requires?: string[];
  bomb?: BombDef;
  rocket?: RocketDef;
  /** Tank yakıtı (kg). */
  fuelKg?: number;
  gun?: GunSpec;
}

export interface Hardpoint {
  id: string;
  name: string;
  kind: HardpointKind;
  /** Aynı mühimmatı taşıyan askı sayısı (kanat çifti 2, tek gövde askısı 1, bölme hücreleri 4 …). */
  pylons: number;
  /** Askı başına en fazla adet. */
  maxN: number;
  /** Askı başına en fazla kg. */
  cap: number;
  /** Ağır bomba askısı araştırılınca askı başına kg. */
  heavyCap?: number;
  accepts: StoreKind[];
  /** Görsel yerleşim: kanat açıklığı oranı (kanat, ray). */
  at?: number;
}

export interface AircraftStores {
  /** Azami dış yük (kg, yakıt tankları dahil). */
  maxLoad: number;
  hardpoints: Hardpoint[];
  presets: { id: string; name: string; place: Placement[] }[];
}

// ---------------------------------------------------------------- mühimmat katalogu

export const BOMBS: Record<string, BombDef> = {
  b50: { name: '50 kg', mass: 50, blastRadius: 18, damage: 35 },
  lb100: { name: '100 lb (45 kg)', mass: 45, blastRadius: 17, damage: 32 },
  b100: { name: '100 kg', mass: 100, blastRadius: 25, damage: 55 },
  lb250: { name: '250 lb (113 kg)', mass: 113, blastRadius: 26, damage: 60 },
  lb500: { name: '500 lb (227 kg)', mass: 227, blastRadius: 38, damage: 90 },
  b250: { name: '250 kg', mass: 250, blastRadius: 40, damage: 95 },
  lb1000: { name: '1000 lb (454 kg)', mass: 454, blastRadius: 52, damage: 150 },
  b500: { name: '500 kg', mass: 500, blastRadius: 55, damage: 160 },
  b1000: { name: '1000 kg', mass: 1000, blastRadius: 75, damage: 290 },
};

export const ROCKETS: Record<string, RocketDef> = {
  r82: { name: 'RS-82', damage: 60, blastRadius: 16, speed: 360, mass: 7 },
  rp3: { name: 'RP-3 (60 lb)', damage: 110, blastRadius: 22, speed: 430, mass: 36 },
  hvar: { name: 'HVAR (5 inç)', damage: 95, blastRadius: 20, speed: 420, mass: 64 },
};

const bombDrag = (kg: number) => 0.006 + 0.05 * Math.pow(kg / 1000, 0.75);
const bomb = (id: string, name: string, short: string, def: BombDef, families: Family[], requires?: string[]): StoreDef => ({
  id, name, short, kind: 'bomb', mass: def.mass, drag: bombDrag(def.mass), families, bomb: def, requires,
});
const tank = (id: string, name: string, fuel: number, empty: number, drag: number, requires: string[], mounts?: HardpointKind[]): StoreDef => ({
  id, name, short: name, kind: 'tank', mass: fuel + empty, drag, fuelKg: fuel, requires, mounts,
});

const DE: Family[] = ['de'];
const SU: Family[] = ['su'];
const LB: Family[] = ['uk', 'us', 'fr'];

export const STORES: Record<string, StoreDef> = Object.fromEntries([
  // Alman SC serisi
  bomb('sc50', 'SC 50 bombası (50 kg)', 'SC 50', BOMBS.b50, DE),
  bomb('sc250', 'SC 250 bombası (250 kg)', 'SC 250', BOMBS.b250, DE),
  bomb('sc500', 'SC 500 bombası (500 kg)', 'SC 500', BOMBS.b500, DE),
  bomb('sc1000', 'SC 1000 “Hermann” (1000 kg)', 'SC 1000', BOMBS.b1000, DE, ['w_heavybomb']),
  // Sovyet FAB serisi
  bomb('fab50', 'FAB-50 (50 kg)', 'FAB-50', BOMBS.b50, SU),
  bomb('fab100', 'FAB-100 (100 kg)', 'FAB-100', BOMBS.b100, SU),
  bomb('fab250', 'FAB-250 (250 kg)', 'FAB-250', BOMBS.b250, SU),
  bomb('fab500', 'FAB-500 (500 kg)', 'FAB-500', BOMBS.b500, SU),
  // İngiliz / Amerikan libre serisi
  bomb('lb100', 'AN-M30 (100 lb)', '100 lb', BOMBS.lb100, LB),
  bomb('lb250', 'GP 250 lb (113 kg)', '250 lb', BOMBS.lb250, LB),
  bomb('lb500', 'GP 500 lb (227 kg)', '500 lb', BOMBS.lb500, LB),
  bomb('lb1000', 'GP 1000 lb (454 kg)', '1000 lb', BOMBS.lb1000, LB),
  // Roketler
  { id: 'rs82', name: 'RS-82 roketi', short: 'RS-82', kind: 'rocket', mass: 7, drag: 0.003, families: SU, rocket: ROCKETS.r82, requires: ['rockets'] },
  { id: 'rp3', name: 'RP-3 roketi (60 lb)', short: 'RP-3', kind: 'rocket', mass: 36, drag: 0.006, families: ['uk'], rocket: ROCKETS.rp3, requires: ['rockets'] },
  { id: 'hvar', name: 'HVAR roketi (5 inç)', short: 'HVAR', kind: 'rocket', mass: 64, drag: 0.006, families: ['us', 'fr'], rocket: ROCKETS.hvar, requires: ['rockets'] },
  // Atılabilir yakıt tankları
  tank('tank150', 'Küçük tank (200 L)', 150, 22, 0.035, ['drop_tanks']),
  tank('tank220', 'Orta tank (300 L)', 220, 28, 0.04, ['drop_tanks']),
  tank('tank300', 'Büyük tank (410 L)', 300, 36, 0.05, ['drop_tanks', 'f_bigtank']),
  tank('tank450', 'Jet tankı (600 L)', 450, 45, 0.045, ['drop_tanks', 'f_bigtank']),
  tank('tip550', 'Kanat ucu tankı (870 L)', 550, 60, 0.025, ['j_tiptank'], ['tip']),
  // Top gondolu (askı başına bir top)
  {
    id: 'pod151', name: 'MG 151/20 top gondolu', short: '20 mm gondol', kind: 'gunpod', mass: 135, drag: 0.03, families: DE,
    gun: {
      name: '20 mm MG 151/20 (gondol)', caliber: 'cannon', mount: 'pod', x: 0, paired: false,
      rate: 700 / 60, damage: 6, muzzleVel: 790, dispersion: 0.017, range: 700, ammo: 135,
    },
  },
].map((s) => [s.id, s as StoreDef]));

export const STORE_KIND_NAMES: Record<StoreKind, string> = { bomb: 'Bomba', rocket: 'Roket', tank: 'Yakıt tankı', gunpod: 'Top gondolu' };

export function familyOf(origin: string): Family {
  if (origin === 'Almanya') return 'de';
  if (origin === 'Sovyetler Birliği') return 'su';
  if (origin === 'ABD') return 'us';
  if (origin === 'Fransa') return 'fr';
  return 'uk';
}

// ---------------------------------------------------------------- askı noktaları

const hp = (id: string, name: string, kind: HardpointKind, pylons: number, maxN: number, cap: number, accepts: StoreKind[], o: Partial<Hardpoint> = {}): Hardpoint => ({
  id, name, kind, pylons, maxN, cap, accepts, ...o,
});
const C = (cap: number, accepts: StoreKind[], maxN = 1, o: Partial<Hardpoint> = {}) => hp('c', 'Gövde altı', 'center', 1, maxN, cap, accepts, o);
const W = (cap: number, accepts: StoreKind[], maxN = 1, o: Partial<Hardpoint> = {}) => hp('w', 'Kanat altı', 'wing', 2, maxN, cap, accepts, { at: 0.36, ...o });
const R = (maxN: number, o: Partial<Hardpoint> = {}) => hp('r', 'Roket rayları', 'rail', 2, maxN, 400, ['rocket'], { at: 0.62, ...o });
const P = (h: string, store: string, n = 1): Placement => ({ hp: h, store, n });

export const STORE_TABLE: Record<string, AircraftStores> = {
  // ---------------------------------------------------------- avcılar
  hurricane1: { maxLoad: 340, hardpoints: [W(170, ['tank'])], presets: [{ id: 'tank', name: 'Kanat altı tanklar', place: [P('w', 'tank150')] }] },
  spitfire1: { maxLoad: 180, hardpoints: [C(170, ['tank'])], presets: [{ id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank150')] }] },
  spitfire5: {
    maxLoad: 480, hardpoints: [C(250, ['bomb', 'tank']), W(120, ['bomb'])],
    presets: [
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank220')] },
      { id: 'fb', name: 'Avcı-bombardıman: 1 × 500 lb', place: [P('c', 'lb500')] },
      { id: 'fb3', name: '1 × 500 lb + 2 × 250 lb', place: [P('c', 'lb500'), P('w', 'lb250')] },
    ],
  },
  spitfire9: {
    maxLoad: 480, hardpoints: [C(250, ['bomb', 'tank']), W(120, ['bomb'])],
    presets: [
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank220')] },
      { id: 'fb', name: 'Avcı-bombardıman: 1 × 500 lb', place: [P('c', 'lb500')] },
      { id: 'fb3', name: '1 × 500 lb + 2 × 250 lb', place: [P('c', 'lb500'), P('w', 'lb250')] },
    ],
  },
  meteor3: { maxLoad: 600, hardpoints: [C(500, ['tank'])], presets: [{ id: 'tank', name: 'Karın tankı', place: [P('c', 'tank450')] }] },
  f86f: {
    maxLoad: 1600, hardpoints: [W(500, ['bomb', 'tank'], 1, { name: 'Kanat altı (iç)', at: 0.3 }), hp('o', 'Kanat altı (dış)', 'wing', 2, 1, 240, ['bomb'], { at: 0.55 })],
    presets: [
      { id: 'tank', name: 'İki dış tank', place: [P('w', 'tank450')] },
      { id: 'fb', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
      { id: 'fb4', name: '2 × 1000 lb + 2 × 500 lb', place: [P('w', 'lb1000'), P('o', 'lb500')] },
    ],
  },
  bf109e: {
    maxLoad: 300, hardpoints: [C(250, ['bomb', 'tank'], 4)],
    presets: [
      { id: 'fb', name: 'Jabo: 1 × SC 250', place: [P('c', 'sc250')] },
      { id: 'fb4', name: 'Jabo: 4 × SC 50', place: [P('c', 'sc50', 4)] },
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank220')] },
    ],
  },
  bf109f: {
    maxLoad: 350, hardpoints: [C(250, ['bomb', 'tank'], 4)],
    presets: [
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank220')] },
      { id: 'fb', name: 'Jabo: 1 × SC 250', place: [P('c', 'sc250')] },
      { id: 'fb4', name: 'Jabo: 4 × SC 50', place: [P('c', 'sc50', 4)] },
    ],
  },
  bf109g: {
    maxLoad: 600, hardpoints: [C(500, ['bomb', 'tank'], 4), W(140, ['gunpod'], 1, { at: 0.42 })],
    presets: [
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank220')] },
      { id: 'r6', name: 'Kanat altı top gondolları (2 × 20 mm)', place: [P('w', 'pod151')] },
      { id: 'fb', name: 'Jabo: 1 × SC 250', place: [P('c', 'sc250')] },
      { id: 'fb500', name: 'Jabo: 1 × SC 500', place: [P('c', 'sc500')] },
    ],
  },
  p51d: {
    maxLoad: 1000, hardpoints: [W(454, ['bomb', 'tank'], 1, { at: 0.3 }), R(3, { at: 0.6 })],
    presets: [
      { id: 'tank', name: 'İki dış tank (75 gal)', place: [P('w', 'tank220')] },
      { id: 'bigtank', name: 'Büyük dış tanklar (108 gal)', place: [P('w', 'tank300')] },
      { id: 'fb', name: '2 × 500 lb', place: [P('w', 'lb500')] },
      { id: 'fb1000', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
      { id: 'rk', name: '6 × HVAR roket', place: [P('r', 'hvar', 3)] },
      { id: 'rkfb', name: '6 × HVAR + 2 × 500 lb', place: [P('r', 'hvar', 3), P('w', 'lb500')] },
    ],
  },
  me262: {
    maxLoad: 600, hardpoints: [hp('c', 'Burun altı ETC', 'center', 2, 1, 250, ['bomb'])],
    presets: [{ id: 'fb', name: 'Sturmvogel: 2 × SC 250', place: [P('c', 'sc250')] }],
  },
  mig15: {
    maxLoad: 700, hardpoints: [W(480, ['bomb', 'tank'], 1, { at: 0.42 })],
    presets: [
      { id: 'tank', name: 'İki dış tank', place: [P('w', 'tank220')] },
      { id: 'fb', name: '2 × FAB-250', place: [P('w', 'fab250')] },
    ],
  },
  bf110c: {
    maxLoad: 1200, hardpoints: [hp('c', 'Gövde altı ETC', 'center', 2, 1, 500, ['bomb']), W(300, ['bomb', 'tank'], 2, { at: 0.45 })],
    presets: [
      { id: 'fb', name: 'Jabo: 2 × SC 250', place: [P('c', 'sc250')] },
      { id: 'fb500', name: 'Jabo: 2 × SC 500', place: [P('c', 'sc500')] },
      { id: 'mix', name: '2 × SC 250 + 4 × SC 50', place: [P('c', 'sc250'), P('w', 'sc50', 2)] },
      { id: 'tank', name: 'Kanat altı tanklar', place: [P('w', 'tank220')] },
    ],
  },
  fw190a5: {
    maxLoad: 750, hardpoints: [C(500, ['bomb', 'tank'], 4), W(120, ['bomb'], 2, { at: 0.4 })],
    presets: [
      { id: 'fb', name: 'Jabo: 1 × SC 500', place: [P('c', 'sc500')] },
      { id: 'fb2', name: '1 × SC 250', place: [P('c', 'sc250')] },
      { id: 'mix', name: '1 × SC 250 + 4 × SC 50', place: [P('c', 'sc250'), P('w', 'sc50', 2)] },
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank220')] },
    ],
  },
  p47d: {
    maxLoad: 1150, hardpoints: [C(454, ['bomb', 'tank']), W(227, ['bomb', 'tank'], 1, { heavyCap: 454, at: 0.36 }), R(5, { at: 0.62 })],
    presets: [
      { id: 'fb', name: '2 × 500 lb', place: [P('w', 'lb500')] },
      { id: 'fb3', name: '3 × 500 lb', place: [P('c', 'lb500'), P('w', 'lb500')] },
      { id: 'heavy', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
      { id: 'rk', name: '10 × HVAR roket + 2 × 500 lb', place: [P('r', 'hvar', 5), P('w', 'lb500')] },
      { id: 'tank', name: 'İki dış tank', place: [P('w', 'tank220')] },
    ],
  },
  f84g: {
    maxLoad: 2000, hardpoints: [W(454, ['bomb'], 1, { at: 0.32 }), R(4, { at: 0.6 }), hp('t', 'Kanat ucu', 'tip', 2, 1, 620, ['tank'])],
    presets: [
      { id: 'tank', name: 'Kanat ucu tankları', place: [P('t', 'tip550')] },
      { id: 'fb', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
      { id: 'rk', name: '8 × HVAR roket', place: [P('r', 'hvar', 4)] },
      { id: 'fbt', name: '2 × 1000 lb + uç tankları', place: [P('w', 'lb1000'), P('t', 'tip550')] },
    ],
  },
  // ---------------------------------------------------------- çeşitlilik (yeni uçaklar)
  i16: {
    maxLoad: 200, hardpoints: [W(100, ['bomb'], 1, { at: 0.42 }), R(3, { at: 0.62 })],
    presets: [
      { id: 'fb', name: '2 × FAB-100', place: [P('w', 'fab100')] },
      { id: 'rk', name: '6 × RS-82 roket', place: [P('r', 'rs82', 3)] },
    ],
  },
  a6m2: { maxLoad: 320, hardpoints: [C(330, ['tank'])], presets: [{ id: 'tank', name: 'Gövde altı tank (330 L)', place: [P('c', 'tank220')] }] },
  blenheim: {
    maxLoad: 700, hardpoints: [hp('b', 'Bomba bölmesi', 'bay', 1, 4, 460, ['bomb']), W(113, ['bomb'], 1, { at: 0.55 })],
    presets: [
      { id: 'lb250x4', name: '4 × 250 lb', place: [P('b', 'lb250', 4)] },
      { id: 'lb500x2', name: '2 × 500 lb', place: [P('b', 'lb500', 2)] },
      { id: 'mix', name: '4 × 250 lb + 2 × 250 lb (kanat)', place: [P('b', 'lb250', 4), P('w', 'lb250')] },
    ],
  },
  p40e: {
    maxLoad: 700, hardpoints: [C(454, ['bomb', 'tank']), W(45, ['bomb'], 1, { at: 0.4 })],
    presets: [
      { id: 'fb', name: '1 × 500 lb', place: [P('c', 'lb500')] },
      { id: 'mix', name: '1 × 500 lb + 2 × 100 lb', place: [P('c', 'lb500'), P('w', 'lb100')] },
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank220')] },
    ],
  },
  pe2: {
    maxLoad: 1200,
    hardpoints: [hp('b', 'Bomba bölmesi', 'bay', 1, 4, 400, ['bomb']), hp('n', 'Motor naseli bölmeleri', 'bay', 2, 1, 100, ['bomb']), W(250, ['bomb'], 1, { at: 0.3 })],
    presets: [
      { id: 'b100x6', name: '6 × FAB-100', place: [P('b', 'fab100', 4), P('n', 'fab100')] },
      { id: 'heavy', name: '4 × FAB-100 + 2 × FAB-250', place: [P('b', 'fab100', 4), P('w', 'fab250')] },
      { id: 'b250', name: '2 × FAB-250 (dış)', place: [P('w', 'fab250')] },
    ],
  },
  la7: { maxLoad: 200, hardpoints: [W(100, ['bomb'], 1, { at: 0.36 })], presets: [{ id: 'fb', name: '2 × FAB-100', place: [P('w', 'fab100')] }] },
  p38j: {
    maxLoad: 1800, hardpoints: [W(908, ['bomb', 'tank'], 1, { at: 0.3, heavyCap: 908 })],
    presets: [
      { id: 'tank', name: 'İki büyük tank', place: [P('w', 'tank300')] },
      { id: 'fb', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
      { id: 'fb500', name: '2 × 500 lb', place: [P('w', 'lb500')] },
    ],
  },
  f6f5: {
    maxLoad: 1800, hardpoints: [C(454, ['bomb', 'tank']), W(454, ['bomb'], 1, { at: 0.28 }), R(3, { at: 0.6 })],
    presets: [
      { id: 'fb', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
      { id: 'rk', name: '6 × HVAR + gövde tankı', place: [P('r', 'hvar', 3), P('c', 'tank220')] },
      { id: 'mix', name: '2 × 500 lb + 6 × HVAR', place: [P('w', 'lb500'), P('r', 'hvar', 3)] },
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank300')] },
    ],
  },
  lancaster: {
    maxLoad: 6400, hardpoints: [hp('b', 'Bomba bölmesi', 'bay', 1, 14, 6400, ['bomb'])],
    presets: [
      { id: 'lb1000x14', name: '14 × 1000 lb', place: [P('b', 'lb1000', 14)] },
      { id: 'lb500x14', name: '14 × 500 lb', place: [P('b', 'lb500', 14)] },
      { id: 'area', name: '14 × 250 lb (alan)', place: [P('b', 'lb250', 14)] },
    ],
  },
  mosquito: {
    maxLoad: 1100, hardpoints: [hp('b', 'Bomba bölmesi', 'bay', 1, 2, 454, ['bomb']), W(227, ['bomb', 'tank'], 1, { at: 0.42 }), R(4, { at: 0.56 })],
    presets: [
      { id: 'bombs', name: '4 × 500 lb', place: [P('b', 'lb500', 2), P('w', 'lb500')] },
      { id: 'rk', name: '8 × RP-3 + 2 × 500 lb', place: [P('r', 'rp3', 4), P('b', 'lb500', 2)] },
      { id: 'tank', name: 'Kanat altı tanklar', place: [P('w', 'tank150')] },
    ],
  },
  f80c: {
    maxLoad: 1900, hardpoints: [W(454, ['bomb'], 1, { at: 0.4 }), R(4, { at: 0.62 }), hp('t', 'Kanat ucu', 'tip', 2, 1, 620, ['tank'])],
    presets: [
      { id: 'tank', name: 'Kanat ucu tankları', place: [P('t', 'tip550')] },
      { id: 'fb', name: '2 × 1000 lb + uç tankları', place: [P('w', 'lb1000'), P('t', 'tip550')] },
      { id: 'rk', name: '8 × HVAR + uç tankları', place: [P('r', 'hvar', 4), P('t', 'tip550')] },
    ],
  },
  vampire: {
    maxLoad: 1000, hardpoints: [W(454, ['bomb', 'tank'], 1, { at: 0.45 }), R(4, { at: 0.64 })],
    presets: [
      { id: 'fb', name: '2 × 500 lb', place: [P('w', 'lb500')] },
      { id: 'rk', name: '8 × RP-3', place: [P('r', 'rp3', 4)] },
      { id: 'tank', name: 'İki dış tank', place: [P('w', 'tank220')] },
    ],
  },
  ar234: {
    maxLoad: 1500, hardpoints: [C(500, ['bomb']), W(500, ['bomb'], 1, { at: 0.4 })],
    presets: [
      { id: 'b500x3', name: '3 × SC 500', place: [P('c', 'sc500'), P('w', 'sc500')] },
      { id: 'b250x3', name: '3 × SC 250', place: [P('c', 'sc250'), P('w', 'sc250')] },
    ],
  },
  il28: {
    maxLoad: 3000, hardpoints: [hp('b', 'Bomba bölmesi', 'bay', 1, 12, 3000, ['bomb'])],
    presets: [
      { id: 'fab250x12', name: '12 × FAB-250', place: [P('b', 'fab250', 12)] },
      { id: 'fab500x4', name: '4 × FAB-500', place: [P('b', 'fab500', 4)] },
      { id: 'fab100x12', name: '12 × FAB-100', place: [P('b', 'fab100', 12)] },
    ],
  },
  // ---------------------------------------------------------- taarruz
  il2: ilTable(),
  il2m3: ilTable(),
  il10: ilTable(),
  typhoon: {
    maxLoad: 1000, hardpoints: [W(227, ['bomb', 'tank'], 1, { heavyCap: 454, at: 0.4 }), R(4, { at: 0.62 })],
    presets: [
      { id: 'rp3', name: '8 × RP-3 roket', place: [P('r', 'rp3', 4)] },
      { id: 'bombs', name: '2 × 500 lb', place: [P('w', 'lb500')] },
      { id: 'heavy', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
    ],
  },
  // ---------------------------------------------------------- pike
  ju87b: {
    maxLoad: 700, hardpoints: [hp('c', 'Gövde altı (dalış çatalı)', 'center', 1, 1, 500, ['bomb']), W(120, ['bomb'], 2, { at: 0.5 })],
    presets: [
      { id: 'b500', name: '1 × SC 500', place: [P('c', 'sc500')] },
      { id: 'mix', name: '1 × SC 250 + 4 × SC 50', place: [P('c', 'sc250'), P('w', 'sc50', 2)] },
      { id: 'b500mix', name: '1 × SC 500 + 4 × SC 50', place: [P('c', 'sc500'), P('w', 'sc50', 2)] },
    ],
  },
  sbd3: {
    maxLoad: 560, hardpoints: [hp('c', 'Gövde altı (dalış çatalı)', 'center', 1, 1, 454, ['bomb']), W(50, ['bomb'], 1, { at: 0.45 })],
    presets: [
      { id: 'lb1000', name: '1 × 1000 lb', place: [P('c', 'lb1000')] },
      { id: 'lb500', name: '1 × 500 lb + 2 × 100 lb', place: [P('c', 'lb500'), P('w', 'lb100')] },
    ],
  },
  ju87d: {
    maxLoad: 1800, hardpoints: [hp('c', 'Gövde altı (dalış çatalı)', 'center', 1, 1, 500, ['bomb'], { heavyCap: 1000 }), W(250, ['bomb'], 2, { at: 0.45 })],
    presets: [
      { id: 'b500', name: '1 × SC 500', place: [P('c', 'sc500')] },
      { id: 'mix', name: '1 × SC 500 + 2 × SC 250', place: [P('c', 'sc500'), P('w', 'sc250')] },
      { id: 'b250', name: '3 × SC 250', place: [P('c', 'sc250'), P('w', 'sc250')] },
      { id: 'b1000', name: '1 × SC 1000', place: [P('c', 'sc1000')] },
    ],
  },
  sb2c: {
    maxLoad: 1300, hardpoints: [hp('b', 'Bomba bölmesi', 'bay', 1, 2, 454, ['bomb'], { heavyCap: 908 }), W(227, ['bomb'], 1, { at: 0.42 })],
    presets: [
      { id: 'mix', name: '1 × 1000 lb', place: [P('b', 'lb1000')] },
      { id: 'mix2', name: '1 × 1000 lb + 2 × 500 lb', place: [P('b', 'lb1000'), P('w', 'lb500')] },
      { id: 'heavy', name: '2 × 1000 lb', place: [P('b', 'lb1000', 2)] },
    ],
  },
  // ---------------------------------------------------------- bombardıman
  he111: {
    maxLoad: 2500,
    hardpoints: [
      hp('a', 'Bomba bölmesi (ön)', 'bay', 4, 4, 250, ['bomb']), hp('b', 'Bomba bölmesi (arka)', 'bay', 4, 4, 250, ['bomb']),
      hp('e', 'Gövde altı ETC', 'center', 2, 1, 500, ['bomb'], { heavyCap: 1000 }),
    ],
    presets: [
      { id: 'b250x8', name: '8 × SC 250', place: [P('a', 'sc250'), P('b', 'sc250')] },
      { id: 'b50x32', name: '32 × SC 50 (alan)', place: [P('a', 'sc50', 4), P('b', 'sc50', 4)] },
      { id: 'mix', name: '2 × SC 500 (dış) + 4 × SC 250', place: [P('e', 'sc500'), P('a', 'sc250')] },
      { id: 'b1000x2', name: '2 × SC 1000 (dış)', place: [P('e', 'sc1000')] },
    ],
  },
  ju88a4: {
    maxLoad: 2500,
    hardpoints: [
      hp('b', 'Bomba bölmesi', 'bay', 2, 5, 250, ['bomb']),
      W(500, ['bomb'], 1, { name: 'Kanat altı (iç)', heavyCap: 1000, at: 0.22 }), hp('o', 'Kanat altı (dış)', 'wing', 2, 1, 250, ['bomb'], { at: 0.42 }),
    ],
    presets: [
      { id: 'b250x4', name: '4 × SC 250', place: [P('w', 'sc250'), P('o', 'sc250')] },
      { id: 'b500x2', name: '2 × SC 500', place: [P('w', 'sc500')] },
      { id: 'mix', name: '10 × SC 50 + 2 × SC 500', place: [P('b', 'sc50', 5), P('w', 'sc500')] },
      { id: 'b500x4', name: '2 × SC 500 + 2 × SC 250', place: [P('w', 'sc500'), P('o', 'sc250')] },
      { id: 'b1000', name: '2 × SC 1000', place: [P('w', 'sc1000')] },
    ],
  },
  b25j: {
    maxLoad: 1900, hardpoints: [hp('b', 'Bomba bölmesi', 'bay', 3, 2, 454, ['bomb']), R(4, { at: 0.55 })],
    presets: [
      { id: 'lb500x6', name: '6 × 500 lb', place: [P('b', 'lb500', 2)] },
      { id: 'lb1000x3', name: '3 × 1000 lb', place: [P('b', 'lb1000')] },
      { id: 'rk', name: '6 × 500 lb + 8 × HVAR', place: [P('b', 'lb500', 2), P('r', 'hvar', 4)] },
    ],
  },
  b17g: {
    maxLoad: 2800,
    hardpoints: [hp('a', 'Bomba bölmesi (sol)', 'bay', 1, 12, 1362, ['bomb']), hp('b', 'Bomba bölmesi (sağ)', 'bay', 1, 12, 1362, ['bomb'])],
    presets: [
      { id: 'lb500x12', name: '12 × 500 lb', place: [P('a', 'lb500', 6), P('b', 'lb500', 6)] },
      { id: 'lb1000x6', name: '6 × 1000 lb', place: [P('a', 'lb1000', 3), P('b', 'lb1000', 3)] },
      { id: 'lb100x24', name: '24 × 100 lb (alan)', place: [P('a', 'lb100', 12), P('b', 'lb100', 12)] },
      { id: 'mix', name: '3 × 1000 lb + 6 × 500 lb', place: [P('a', 'lb1000', 3), P('b', 'lb500', 6)] },
    ],
  },
  canberra: {
    maxLoad: 3700, hardpoints: [hp('b', 'Bomba bölmesi', 'bay', 2, 4, 1362, ['bomb']), W(454, ['bomb'], 1, { at: 0.5 })],
    presets: [
      { id: 'lb1000x6', name: '6 × 1000 lb', place: [P('b', 'lb1000', 3)] },
      { id: 'lb500x8', name: '8 × 500 lb', place: [P('b', 'lb500', 4)] },
      { id: 'mix', name: '6 × 1000 lb + 2 × 1000 lb (kanat)', place: [P('b', 'lb1000', 3), P('w', 'lb1000')] },
    ],
  },
  // ---------------------------------------------------------- son pervaneliler
  seafury: {
    maxLoad: 1000, hardpoints: [W(454, ['bomb', 'tank'], 1, { at: 0.3 }), R(6, { at: 0.6 })],
    presets: [
      { id: 'tank', name: 'İki dış tank', place: [P('w', 'tank220')] },
      { id: 'fb', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
      { id: 'rk', name: '12 × RP-3 roket', place: [P('r', 'rp3', 6)] },
      { id: 'fbrk', name: '2 × 500 lb + 8 × RP-3', place: [P('w', 'lb500'), P('r', 'rp3', 4)] },
    ],
  },
  f8f: {
    maxLoad: 900, hardpoints: [C(454, ['bomb', 'tank']), W(454, ['bomb', 'tank'], 1, { at: 0.34 }), R(2, { at: 0.62 })],
    presets: [
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank300')] },
      { id: 'fb', name: '2 × 500 lb', place: [P('w', 'lb500')] },
      { id: 'fb1000', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
      { id: 'rk', name: '4 × HVAR + gövde tankı', place: [P('r', 'hvar', 2), P('c', 'tank220')] },
    ],
  },
  f4u4: {
    maxLoad: 1800, hardpoints: [C(454, ['bomb', 'tank']), W(454, ['bomb', 'tank'], 1, { at: 0.24 }), R(4, { at: 0.6 })],
    presets: [
      { id: 'tank', name: 'Gövde altı tank', place: [P('c', 'tank300')] },
      { id: 'fb', name: '2 × 1000 lb', place: [P('w', 'lb1000')] },
      { id: 'fbrk', name: '2 × 1000 lb + 8 × HVAR', place: [P('w', 'lb1000'), P('r', 'hvar', 4)] },
      { id: 'heavy', name: '3 × 1000 lb', place: [P('c', 'lb1000'), P('w', 'lb1000')] },
    ],
  },
  ad4: {
    maxLoad: 3600,
    hardpoints: [
      hp('c', 'Gövde altı', 'center', 1, 2, 908, ['bomb', 'tank']),
      W(908, ['bomb', 'tank'], 2, { name: 'Kanat altı (iç)', at: 0.2 }),
      hp('o', 'Kanat altı (dış, 6 askı)', 'rail', 2, 6, 700, ['bomb', 'rocket'], { at: 0.55 }),
    ],
    presets: [
      { id: 'bombs', name: '3 × 1000 lb + 12 × 250 lb', place: [P('c', 'lb1000'), P('w', 'lb1000'), P('o', 'lb250', 6)] },
      { id: 'rk', name: '1 × 1000 lb + 12 × HVAR', place: [P('c', 'lb1000'), P('o', 'hvar', 6)] },
      { id: 'heavy', name: '6 × 1000 lb', place: [P('c', 'lb1000', 2), P('w', 'lb1000', 2)] },
      { id: 'mix', name: '4 × 500 lb + 8 × HVAR', place: [P('w', 'lb500', 2), P('o', 'hvar', 4)] },
    ],
  },
  a26b: {
    maxLoad: 2800,
    hardpoints: [hp('b', 'Bomba bölmesi', 'bay', 2, 4, 908, ['bomb']), W(454, ['bomb'], 2, { at: 0.42 }), R(7, { at: 0.68 })],
    presets: [
      { id: 'lb500x8', name: '8 × 500 lb', place: [P('b', 'lb500', 4)] },
      { id: 'mix', name: '8 × 500 lb + 14 × HVAR', place: [P('b', 'lb500', 4), P('r', 'hvar', 7)] },
      { id: 'lb1000x4', name: '4 × 1000 lb', place: [P('b', 'lb1000', 2)] },
      { id: 'heavy', name: '8 × 500 lb + 4 × 500 lb (kanat)', place: [P('b', 'lb500', 4), P('w', 'lb500', 2)] },
    ],
  },
  b29: {
    maxLoad: 9100,
    hardpoints: [hp('a', 'Ön bomba bölmesi', 'bay', 1, 40, 4540, ['bomb']), hp('b', 'Arka bomba bölmesi', 'bay', 1, 40, 4540, ['bomb'])],
    presets: [
      { id: 'lb500x36', name: '36 × 500 lb', place: [P('a', 'lb500', 18), P('b', 'lb500', 18)] },
      { id: 'lb1000x18', name: '18 × 1000 lb', place: [P('a', 'lb1000', 9), P('b', 'lb1000', 9)] },
      { id: 'lb100x80', name: '80 × 100 lb (alan)', place: [P('a', 'lb100', 40), P('b', 'lb100', 40)] },
      { id: 'mix', name: '9 × 1000 lb + 18 × 500 lb', place: [P('a', 'lb1000', 9), P('b', 'lb500', 18)] },
    ],
  },
};

function ilTable(): AircraftStores {
  return {
    maxLoad: 650,
    hardpoints: [
      hp('b', 'Kanat bomba bölmeleri', 'bay', 4, 2, 100, ['bomb']), W(250, ['bomb'], 1, { at: 0.3 }), R(4, { at: 0.58 }),
    ],
    presets: [
      { id: 'mix', name: '8 × RS-82 + 4 × FAB-100', place: [P('r', 'rs82', 4), P('b', 'fab100')] },
      { id: 'bombs', name: '6 × FAB-100', place: [P('b', 'fab100'), P('w', 'fab100')] },
      { id: 'heavy', name: '2 × FAB-250', place: [P('w', 'fab250')] },
      { id: 'area', name: '8 × FAB-50 + 8 × RS-82', place: [P('b', 'fab50', 2), P('r', 'rs82', 4)] },
    ],
  };
}

// ---------------------------------------------------------------- doğrulama ve yük özetleri

/** Askı başına izinli kg (ağır bomba askısı araştırılmışsa yüksek sınır). */
export function capOf(h: Hardpoint, has: (id?: string) => boolean): number {
  return h.heavyCap && has('w_heavybomb') ? h.heavyCap : h.cap;
}

/** Bu mühimmat bu askıya uyar mı (araştırma hariç). */
export function fits(spec: AircraftSpec, h: Hardpoint, s: StoreDef): boolean {
  if (!h.accepts.includes(s.kind)) return false;
  if (s.mounts && !s.mounts.includes(h.kind)) return false;
  if (!s.mounts && h.kind === 'tip') return false;
  if (s.families && !s.families.includes(spec.family)) return false;
  return (h.heavyCap ?? h.cap) >= s.mass;
}

export interface LoadCheck {
  ok: boolean;
  /** Toplam yük (kg). */
  kg: number;
  /** Eksik araştırmalar. */
  missing: string[];
  errors: string[];
}

/** Yerleşimi doğrula: askı sınırları, azami yük, araştırma. */
export function checkPlacement(spec: AircraftSpec, place: Placement[], has: (id?: string) => boolean): LoadCheck {
  const errors: string[] = [];
  const missing = new Set<string>();
  let kg = 0;
  const seen = new Set<string>();
  for (const p of place) {
    if (p.n <= 0) continue;
    const h = spec.hardpoints.find((x) => x.id === p.hp);
    const s = STORES[p.store];
    if (!h || !s) {
      errors.push('Bilinmeyen askı ya da mühimmat');
      continue;
    }
    if (seen.has(h.id)) errors.push(`${h.name}: iki ayrı yük`);
    seen.add(h.id);
    if (!fits(spec, h, s)) errors.push(`${h.name}: ${s.short} takılamaz`);
    if (p.n > h.maxN) errors.push(`${h.name}: askı başına en fazla ${h.maxN}`);
    if (s.mass * p.n > capOf(h, has)) {
      if (h.heavyCap && s.mass * p.n <= h.heavyCap) missing.add('w_heavybomb');
      else errors.push(`${h.name}: askı başına en fazla ${capOf(h, has)} kg`);
    }
    for (const r of s.requires ?? []) if (!has(r)) missing.add(r);
    kg += s.mass * p.n * h.pylons;
  }
  if (kg > spec.maxLoad) errors.push(`Azami yük aşıldı (${Math.round(kg)} / ${spec.maxLoad} kg)`);
  return { ok: errors.length === 0 && missing.size === 0, kg, missing: [...missing], errors };
}

/** Yerleşimden yük nesnesi (özet alanlarıyla). */
export function makeLoadout(spec: AircraftSpec, id: string, name: string, place: Placement[], replaceGuns?: GunSpec[], kitReq?: string): Loadout {
  let bombCount = 0;
  let bombKg = 0;
  let maxBombKg = 0;
  let rocketCount = 0;
  let tankFuel = 0;
  let mass = 0;
  let drag = 0;
  const extraGuns: GunSpec[] = [];
  const reqs = new Set<string>();
  if (kitReq) reqs.add(kitReq);
  const clean: Placement[] = [];
  for (const p of place) {
    const h = spec.hardpoints.find((x) => x.id === p.hp);
    const s = STORES[p.store];
    if (!h || !s || p.n <= 0) continue;
    clean.push({ hp: p.hp, store: p.store, n: p.n });
    const total = p.n * h.pylons;
    mass += s.mass * total;
    if (h.kind !== 'bay') drag += s.drag * total;
    for (const r of s.requires ?? []) reqs.add(r);
    if (h.heavyCap && s.mass * p.n > h.cap) reqs.add('w_heavybomb');
    if (s.kind === 'bomb') {
      bombCount += total;
      bombKg += s.mass * total;
      maxBombKg = Math.max(maxBombKg, s.mass);
    } else if (s.kind === 'rocket') rocketCount += total;
    else if (s.kind === 'tank') tankFuel += (s.fuelKg ?? 0) * total;
    else if (s.kind === 'gunpod' && s.gun) {
      // Her gondol kendi askısında: iki yana dönüşümlü
      for (let i = 0; i < total; i++) extraGuns.push({ ...s.gun, x: (i % 2 ? -1 : 1) * (h.at ?? 0.36) * (spec.span / 2) });
    }
  }
  return {
    id, name, place: clean, replaceGuns, reqs: [...reqs], bombCount, bombKg, maxBombKg, rocketCount, tankFuel,
    extraGuns: extraGuns.length ? extraGuns : undefined, mass, drag,
  };
}

/** Yük özeti metni (ör. "1 × SC 500 · 2 × SC 250"). */
export function loadoutSummary(spec: AircraftSpec, lo: Loadout): string {
  const parts = lo.place.map((p) => {
    const h = spec.hardpoints.find((x) => x.id === p.hp);
    const s = STORES[p.store];
    return h && s ? `${p.n * h.pylons} × ${s.short}` : '';
  }).filter(Boolean);
  if (lo.replaceGuns) parts.unshift(lo.replaceGuns.map((g) => g.name).join(', '));
  return parts.join(' · ');
}

/** Hazır yükler + standart (boş) yük + silah kitleri. */
export function buildLoadouts(spec: AircraftSpec, kits: { id: string; name: string; replaceGuns: GunSpec[]; requires?: string }[]): Loadout[] {
  const t = STORE_TABLE[spec.id];
  const out: Loadout[] = [makeLoadout(spec, 'std', 'Standart', [])];
  for (const k of kits) out.push(makeLoadout(spec, k.id, k.name, [], k.replaceGuns, k.requires));
  for (const p of t?.presets ?? []) out.push(makeLoadout(spec, p.id, p.name, p.place));
  return out;
}

/** Bu yük için gereken araştırmalar tamam mı. */
export function loadoutAllowed(l: Loadout, has: (id?: string) => boolean): boolean {
  return l.reqs.every((r) => has(r));
}
