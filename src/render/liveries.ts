// Gerçek boyalar ve ulusal armalar: her model savaş döneminin tipik boyasıyla çizilir (takım rengiyle değil; dost ve
// düşman etiket renginden ve bilgi panelinden anlaşılır). Renkler dönemin boya standartlarının yaklaşık sRGB
// karşılıkları (RAF, RLM, ANA/FS, AMT, IJN). Boya, kamuflaj deseni, panel dokusu ve armalar gölgelendiricide
// çizilir (skin.ts): desen yüzlere değil modelin kendi eksenine oturur, armalar kavisli gövdeye çıkartma gibi yapışır.
//
// Kamuflaj türleri gerçeğe göre:
//   - wavy: RAF, sert kenarlı dalgalı lekeler (şablonla boyanırdı);
//   - splinter: erken Luftwaffe (RLM 70/71, 71/02), köşeli "kıymık" parçalar;
//   - soft: püskürtme, yumuşak kenarlı (geç Luftwaffe 74/75, 81/82; Sovyet AMT; modern iki ton gri).
// Yapı malzemesi dokuyu belirler: metal (panel çizgileri, perçin sıraları, panel tonları), ahşap (kontrplak:
// pürüzsüz, yalnız büyük birleşim çizgileri), kumaş (gövde arkası: nervür bantları ve aralarında hafif sarkma).

import * as THREE from 'three';

// RAF
const DARK_EARTH = 0x66523a;
const DARK_GREEN = 0x435038;
const OCEAN_GREY = 0x6c7276;
const SKY = 0xc4c8a4;
const MED_SEA_GREY = 0x9da3a6;
const NIGHT = 0x232427;
const XD_SEA_GREY = 0x434b50;
const SLATE_GREY = 0x5c6468;
// Luftwaffe (RLM)
const RLM70 = 0x3b4737;
const RLM71 = 0x505c42;
const RLM02 = 0x7a7b6c;
const RLM65 = 0x9fb4c4;
const RLM74 = 0x4a5158;
const RLM75 = 0x6f7276;
const RLM76 = 0xb7c4cc;
const RLM81 = 0x5c5644;
const RLM82 = 0x4b5b3c;
const RLM04 = 0xd9b13a;
// ABD
const OLIVE_DRAB = 0x4b4c35;
const NEUTRAL_GREY = 0x8e9090;
const GLOSSY_SEA_BLUE = 0x22304a;
const SEA_BLUE = 0x2d3b58;
const INT_BLUE = 0x50637c;
const NAVY_WHITE = 0xe2e3de;
const BLUE_GRAY = 0x5c6f83;
const LIGHT_GRAY = 0xc7c9c4;
// ABD, Vietnam "SEA" düzeni ve geç dönem griler (FS 595)
const FS30219 = 0x9b8565;
const FS34102 = 0x5e6a40;
const FS34079 = 0x3f4835;
const FS36622 = 0xd3d3cb;
const FS36320 = 0x8b9298;
const FS36375 = 0xa6abae;
const FS36170 = 0x5f6467;
const FS36176 = 0x6d7377;
// Fransa (Rafale)
const FR_GREY_DARK = 0x7f8a92;
const FR_GREY = 0x939da4;
// Sovyet (AMT)
const AMT4 = 0x4d5932;
const AMT6 = 0x363634;
const AMT7 = 0x93b2c4;
const AMT11 = 0x6f7f8a;
const AMT12 = 0x4c565d;
const AII_GREEN = 0x4d5e35;
// Japonya
const AMEIRO = 0xb5b096;
/** Çıplak alüminyum. */
const ALUMINIUM = 0xd0d5d9;

export type Finish = 'matte' | 'gloss' | 'metal';
export type Camo = 'wavy' | 'splinter' | 'soft';
export type Skin = 'metal' | 'wood';

export interface Livery {
  /** Üst yüz ve yan kamuflaj renkleri (bir, iki ya da üç ton). */
  top: number[];
  /** Alt yüz. */
  under: number;
  finish: Finish;
  /** Desen türü (iki ve üç tonda; varsayılan dalgalı). */
  camo?: Camo;
  /** Yanlar alt renkte, üstünde seyrek benek (Luftwaffe 1941 sonrası avcı düzeni). */
  highSides?: boolean;
  /** Burun üstünde parlama önleyici bant ya da renkli burun. */
  nose?: { color: number; len: number; top?: boolean };
  /** Üç tonlu ABD Donanması düzeni: üst, yan, alt ayrı. */
  sides?: number;
  /** Yapı malzemesi (doku): varsayılan metal. */
  skin?: Skin;
  /** Gövdenin bu z'den gerisi farklı kaplama (Hurricane: kumaş; Il-2: ahşap). */
  aft?: { z: number; skin: 'fabric' | 'wood' };
}

const two = (a: number, b: number, under: number, o: Partial<Livery> = {}): Livery => ({ top: [a, b], under, finish: 'matte', ...o });
const metal = (o: Partial<Livery> = {}): Livery => ({ top: [ALUMINIUM], under: ALUMINIUM, finish: 'metal', ...o });
const gloss = (c: number): Livery => ({ top: [c], under: c, finish: 'gloss' });

/** Model anahtarına göre boya. */
export const LIVERIES: Record<string, Livery> = {
  // İngiliz: 1940 Dark Earth / Dark Green, 1941 sonrası Ocean Grey / Dark Green
  hurricane: two(DARK_EARTH, DARK_GREEN, SKY, { aft: { z: -0.7, skin: 'fabric' } }),
  spitfire: two(DARK_EARTH, DARK_GREEN, SKY),
  spitfire9: two(OCEAN_GREY, DARK_GREEN, MED_SEA_GREY),
  typhoon: two(OCEAN_GREY, DARK_GREEN, MED_SEA_GREY),
  meteor: two(OCEAN_GREY, DARK_GREEN, MED_SEA_GREY),
  mosquito: two(OCEAN_GREY, DARK_GREEN, MED_SEA_GREY, { skin: 'wood' }),
  blenheim: two(DARK_EARTH, DARK_GREEN, NIGHT),
  lancaster: two(DARK_EARTH, DARK_GREEN, NIGHT),
  canberra: two(SLATE_GREY, DARK_GREEN, NIGHT),
  seafury: { top: [XD_SEA_GREY], under: SKY, finish: 'matte' },
  vampire: metal(),
  // Alman: erken dönem köşeli kıymık deseni, 1941 sonrası avcılarda yumuşak benekli griler
  bf109e: two(RLM71, RLM02, RLM65, { camo: 'splinter', nose: { color: RLM04, len: 0.9 } }),
  bf109f: two(RLM74, RLM75, RLM76, { camo: 'soft', highSides: true }),
  bf109g: two(RLM74, RLM75, RLM76, { camo: 'soft', highSides: true }),
  fw190: two(RLM74, RLM75, RLM76, { camo: 'soft', highSides: true }),
  bf110: two(RLM71, RLM02, RLM65, { camo: 'splinter' }),
  ju87b: two(RLM70, RLM71, RLM65, { camo: 'splinter' }),
  ju87d: two(RLM70, RLM71, RLM65, { camo: 'splinter' }),
  he111: two(RLM70, RLM71, RLM65, { camo: 'splinter' }),
  ju88: two(RLM70, RLM71, RLM65, { camo: 'splinter' }),
  me262: two(RLM81, RLM82, RLM76, { camo: 'soft' }),
  he162: two(RLM81, RLM82, RLM76, { camo: 'soft' }),
  ar234: two(RLM81, RLM82, RLM76, { camo: 'soft' }),
  // ABD: geç dönem çıplak metal; erken dönem zeytin yeşili; donanma lacivert
  p51d: metal({ nose: { color: OLIVE_DRAB, len: 2.6, top: true } }),
  p47: metal({ nose: { color: OLIVE_DRAB, len: 3.0, top: true } }),
  p38: metal(),
  b17: metal(),
  b29: metal(),
  a26: metal(),
  sabre: metal(),
  p80: metal(),
  f84: metal(),
  b25: { top: [OLIVE_DRAB], under: NEUTRAL_GREY, finish: 'matte' },
  p40: { top: [OLIVE_DRAB], under: NEUTRAL_GREY, finish: 'matte' },
  sbd: { top: [BLUE_GRAY], under: LIGHT_GRAY, finish: 'matte' },
  sb2c: { top: [SEA_BLUE], sides: INT_BLUE, under: NAVY_WHITE, finish: 'matte' },
  f6f: gloss(GLOSSY_SEA_BLUE),
  f4u: gloss(GLOSSY_SEA_BLUE),
  f8f: gloss(GLOSSY_SEA_BLUE),
  ad4: gloss(GLOSSY_SEA_BLUE),
  // Sovyet: püskürtme iki ton; Il-2 arka gövdesi, Yak-3, La-7 ve I-16 ahşap
  il2: two(AMT4, AMT6, AMT7, { camo: 'soft', aft: { z: -1.2, skin: 'wood' } }),
  il2m3: two(AMT4, AMT6, AMT7, { camo: 'soft', aft: { z: -1.2, skin: 'wood' } }),
  pe2: two(AMT4, AMT6, AMT7, { camo: 'soft' }),
  il10: two(AMT11, AMT12, AMT7, { camo: 'soft' }),
  yak3: two(AMT11, AMT12, AMT7, { camo: 'soft', skin: 'wood' }),
  la7: two(AMT11, AMT12, AMT7, { camo: 'soft', skin: 'wood' }),
  i16: { top: [AII_GREEN], under: AMT7, finish: 'matte', skin: 'wood' },
  mig15: metal(),
  il28: metal(),
  // Japon: erken Sıfır açık gri (ameiro), yarı parlak
  a6m: { top: [AMEIRO], under: AMEIRO, finish: 'gloss' },
  // Sonraki aşama: MiG-21 çıplak metal; F-4E Vietnam üç tonu; F-15A Compass Ghost; Rafale ve F-22A iki ton gri
  jetDelta: metal(),
  jetHeavy: { top: [FS30219, FS34102, FS34079], under: FS36622, finish: 'matte', camo: 'wavy' },
  jetTwinTail: two(FS36320, FS36375, FS36375, { camo: 'soft' }),
  jetCanard: two(FR_GREY_DARK, FR_GREY, FR_GREY, { camo: 'soft' }),
  jetStealth: two(FS36170, FS36176, FS36176, { camo: 'soft' }),
};

/** Tanımsız model için yedek (görünmemeli; yeni model eklenince listeye boya da eklenir). */
export const FALLBACK_LIVERY: Livery = { top: [NEUTRAL_GREY], under: LIGHT_GRAY, finish: 'matte' };

// ------------------------------------------------------------------------------------------------ ulusal armalar

export type Nation = 'uk' | 'de' | 'us' | 'su' | 'jp' | 'fr';

/** Gölgelendiricideki arma çizim kodu. */
export const NATION_ID: Record<Nation, number> = { uk: 1, de: 2, us: 3, su: 4, jp: 5, fr: 6 };

export function nationOf(origin: string | undefined): Nation | null {
  switch (origin) {
    case 'Birleşik Krallık': return 'uk';
    case 'Almanya': return 'de';
    case 'ABD': return 'us';
    case 'Sovyetler Birliği': return 'su';
    case 'Japonya': return 'jp';
    case 'Fransa': return 'fr';
    default: return null;
  }
}

/** Armanın yeri: yüzey noktası, normal, yüzeydeki "yatay" yön (kanatta açıklık, gövdede boy), yarıçap. */
export interface MarkSpot {
  p: THREE.Vector3;
  n: THREE.Vector3;
  t: THREE.Vector3;
  r: number;
  fuselage: boolean;
}
