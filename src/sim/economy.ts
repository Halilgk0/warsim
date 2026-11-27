// Ekonomi: para (kr), fiyatlar ve maliyetler, maden verimi ve uluslararası uçak pazarı.
//
// Gelir yolları:
//  - Düşman yapısı yıkmak (yapı maliyetinin bir kısmı ganimet/ödül)
//  - Düşman uçağı düşürmek (uçak fiyatının bir kısmı)
//  - Görev ödülleri (missionResult.ts)
//  - Maden ocağı: pasif gelir; verim yere göre değişir ve haritada görünmez (kurmadan bilinmez)
//  - Evler: pasif gelir (kira), ev büyüdükçe artar; yakındaki her park +%10
// Giderler: her inşaat, üs tesisi, uçaksavar kurulumu, araştırma ve uçak üretimi.
// Uluslararası pazar (alım ve satım) 2026-11-11'de kapatıldı (MARKET_ON); kodu duruyor.
//
// Fiyat artışı (2026-11-11, kullanıcı kararı): uçaklar ×1,4, hava savunması (batarya, toplar, yükseltmeler) ×1,5,
// araştırmalar ×1,6, öbür yapılar ve üs tesisleri ×3. Ödüller fiyata bağlı olduğu için onlar da aynı oranda arttı.
// Aynı gün ikinci ayar (kullanıcı): ev kirası yükseldi, apartman 6.300, maden 11.000 ve 800 kr/dk (verim 1; sonra 550), başlangıç
// parası 35.000; çarşı, iş merkezi ve ambar inşa menüsünden kalktı. Üçüncü ayar: radar 15.000, son hava üssü yarı fiyatına
// yeniden kurulur (world.structureCost), görev ödüllerinin sabit kısmı ×2, yapı yıkma ödülü %25 → %15; Hurricane I, Spitfire I
// ve Ar 234'ün fiyatı elle düzeltildi (PRICE_OVERRIDE).

import type { AircraftSpec } from './aircraft/specs';
import type { StructureKind } from './structures/structure';
import type { BaseUpgrade } from './structures/airbase';
import type { TechNode } from './tech';
import { MAP_SIZE } from './mapData';
import { makeFbm, terrainHeight } from './terrain';
import { clamp, smoothstep } from '../core/math';
import { L, LOCALE } from '../i18n';

export const CURRENCY = 'kr';

/** Harekâtta iki tarafın başlangıç parası. */
export const START_MONEY = 35000;

/** Fiyat çarpanları (2026-11-11). Uçak araştırması uçağın artışsız fiyatından hesaplanır, yalnız araştırma çarpanını alır. */
export const PRICE_UP = { aircraft: 1.4, airDefense: 1.5, research: 1.6, structure: 3 };

/** Uluslararası pazar açık mı (kapalıyken teklif gelmez, hazine penceresinde alım-satım bölümü yok). */
export const MARKET_ON = false;

/**
 * Formülün tutmadığı uçakların fiyatı (kr, artışlı). Hurricane I boş kütlesi yüzünden Spitfire I'dan pahalı çıkıyordu;
 * gerçekte Spitfire'ın yapımı 2–3 kat pahalıydı. Ar 234 tek kişilik ekip yüzünden Ju 88'den ucuz çıkıyordu.
 */
const PRICE_OVERRIDE: Record<string, number> = { hurricane1: 2600, spitfire1: 3400, ar234: 14500 };

/** Uçak fiyatı: boş kütle, motor gücü (jette itki), mürettebat ve nesle göre. */
export function aircraftPrice(s: AircraftSpec): number {
  const fixed = PRICE_OVERRIDE[s.id];
  if (fixed) return fixed;
  const e = s.engine;
  const power = e.kind === 'jet' ? (e.kn ?? 0) * e.count * 100 : (e.kw ?? 0) * e.count * 1.1;
  const gen = s.generation === 'P1' ? 1 : s.generation === 'P2' ? 1.25 : s.generation === 'J1' ? 1.8 : 2.6;
  const base = s.massEmpty * 0.55 + power + s.crew * 150 + s.turrets.length * 250;
  // ×0,91: 2026-10'daki ×1,3'ün %30 indirimlisi (oyun, özellikle üs yıkma, yarı sürede ilerlesin); 2026-11-11 ×1,4
  return Math.max(650, Math.round((base * gen * 0.91 * PRICE_UP.aircraft) / 50) * 50);
}

/**
 * İnşaat maliyetleri: 2026-10'daki ×1,5'in %30 indirimlisi; 2026-11-11'de yapılar ×3, uçaksavar bataryası ×1,5 (hava
 * savunması). Eski değerler: hava üssü 18.900, batarya 2.650, radar 6.300, fabrika 12.600, maden 6.300, evler 300/425/550,
 * apartman 1.900, çarşı 1.550, iş merkezi 3.650, ambar 2.100, park 400.
 */
export const STRUCTURE_COST: Record<StructureKind, number> = {
  airbase: 56700,
  aa: 4000,
  radar: 15000,
  factory: 37800,
  mine: 11000,
  townhall: 5500,
  firestation: 4200,
  smallhouse: 900,
  midhouse: 1275,
  house: 1650,
  apartment: 6300,
  shops: 4650,
  office: 10950,
  depot: 6300,
  park: 1200,
};

/** Yolun metre fiyatı (kr): 100 m yol 300 kr. Belediyenin ana caddesi binayla birlikte gelir. */
export const ROAD_COST = 3;

/**
 * Bakım personeli (2026-11-13): her uçak bu kadar kişi ister. Sipariş verilince (ya da pazardan alınınca) ayrılır, uçak
 * var oldukça (bantta, hangarda, havada) başka işe geçmez; uçak düşünce, satılınca ya da sipariş iptal edilince boşa çıkar.
 * Uçuş mürettebatı ayrıdır, kalkışta ayrılır.
 */
export const MAINT_CREW = 1;

/** Gelir ve gider kalemleri (belediye ekranındaki tablolar; Team.flow). */
export const INCOME_CATS = ['mine', 'rent', 'mission', 'kill', 'wreck', 'refund'] as const;
export const EXPENSE_CATS = ['aircraft', 'gun', 'research', 'build', 'road', 'facility', 'repair', 'market'] as const;
export type IncomeCat = (typeof INCOME_CATS)[number];
export type ExpenseCat = (typeof EXPENSE_CATS)[number];
export type MoneyCat = IncomeCat | ExpenseCat;

export function moneyCatName(c: MoneyCat): string {
  switch (c) {
    case 'mine': return L('Madenler', 'Mines');
    case 'rent': return L('Ev kirası', 'Rent');
    case 'mission': return L('Görev ödülleri', 'Mission rewards');
    case 'kill': return L('Düşürülen uçaklar', 'Aircraft shot down');
    case 'wreck': return L('Yıkılan düşman yapıları', 'Enemy structures destroyed');
    case 'refund': return L('İade ve satış', 'Refunds and sales');
    case 'aircraft': return L('Uçak üretimi', 'Aircraft production');
    case 'gun': return L('Uçaksavar topları', 'Flak guns');
    case 'research': return L('Araştırma', 'Research');
    case 'build': return L('İnşaat', 'Construction');
    case 'road': return L('Yollar', 'Roads');
    case 'facility': return L('Üs ve batarya tesisleri', 'Base and battery facilities');
    case 'repair': return L('Onarım', 'Repairs');
    case 'market': return L('Pazardan alım', 'Market purchases');
  }
}

/** Üs tesisleri (yapı sayılır, ×3; eski: 2.650, 4.200, 1.550). */
export const BASE_UPGRADE_COST: Record<BaseUpgrade, number> = {
  workshop: 7950,
  hangars: 12600,
  revetments: 4650,
};

/**
 * Evlerin pasif geliri (kr/dk, sağlam evde; hasar düşürür). Büyük ev daha çok getirir; ev kendini 45–55 dakikada, apartman
 * ~2 saatte öder (150/200/250/500 denendi: 6 dakikada ödüyordu, kartopu oluyordu; 25/35/50/70 fazla, 15/20/25/50 az geldi). Yakındaki her park (PARK_RANGE)
 * kirayı %10 artırır: iki park +%20.
 */
export const HOUSE_INCOME: Partial<Record<StructureKind, number>> = {
  smallhouse: 20,
  midhouse: 25,
  house: 30,
  apartment: 60,
};
/** Park bonusu: evin merkezine bu kadar yakın (m) her bitmiş park kirayı PARK_BONUS kadar artırır. */
export const PARK_RANGE = 300;
export const PARK_BONUS = 0.1;

/**
 * Araştırma maliyeti: süreyle, uçaklarda ayrıca uçağın fiyatıyla orantılı (price: uçağın bugünkü fiyatı; araştırma onun
 * artışsız hâlinden hesaplanır, yoksa uçak araştırması ×1,4 × 1,6 artardı).
 */
export function researchCost(t: TechNode, price?: number): number {
  if (t.starting || t.future) return 0;
  const c = (t.kind === 'aircraft' ? ((price ?? 0) / PRICE_UP.aircraft) * 1.0 + t.time * 3 : t.time * 5) * 0.98 * PRICE_UP.research;
  return Math.round(c / 50) * 50;
}

/**
 * Ödüller: düşürme fiyatın %20'si, yıkılan yapı maliyetin %15'i (2026-11-11'e kadar %25: yapılar ×3 olunca bir üs baskını
 * 50 avcı düşürmeye eşit oluyordu).
 */
export const KILL_REWARD = 0.2;
export const STRUCTURE_REWARD = 0.15;
/** Pazarda satış oranı (fiyatın). */
export const SELL_RATE = 0.45;

/** Üretim menüsünden satış ya da parçalama: üretim maliyetinin üçte biri (hasar ve yıpranma fark etmez). */
export function disposeRefund(s: AircraftSpec): number {
  return Math.round(aircraftPrice(s) / 3);
}

// ---------------------------------------------------------------- maden

/**
 * Madenin saniyelik taban geliri (verim 1'de, dakikada 550 kr). 2026-11-11: 6 → 800/60 → 550/60 (800'de botların 4 saatteki
 * toplam kazancı ~368.000'di; hedef 250–270 bin).
 */
export const MINE_RATE = 550 / 60;

const fbmOre = makeFbm(31337, 4);
const fbmOre2 = makeFbm(27182, 3);

/**
 * Maden verimi (0,1 … 2,2): birkaç zengin damar bölgesi, çoğu yer orta ya da zayıf. Tepelerde biraz daha zengin.
 * Haritada gösterilmez; oyuncu kurduktan sonra öğrenir.
 */
export function oreRichness(x: number, z: number): number {
  const half = MAP_SIZE / 2;
  if (Math.abs(x) > half || Math.abs(z) > half) return 0.1;
  // Damar kuşakları birkaç km boyunda: her tarafın bölgesinde hem zengin hem fakir yerler olur
  const big = fbmOre(x / 6500, z / 6500) * 0.5 + 0.5;
  const small = fbmOre2(x / 2200, z / 2200);
  const h = terrainHeight(x, z);
  const hill = 1 + 0.15 * smoothstep(250, 1200, h);
  const v = Math.pow(clamp(big + small * 0.35 - 0.2, 0, 1), 1.5) * 3.6 * hill;
  return clamp(0.1 + v, 0.1, 2.2);
}

/** Verim kademesi 0 (çok zayıf) … 4 (zengin damar). */
export function richnessTier(r: number): number {
  return r >= 1.5 ? 4 : r >= 0.9 ? 3 : r >= 0.5 ? 2 : r >= 0.25 ? 1 : 0;
}

export function richnessName(r: number): string {
  if (r >= 1.5) return L('Zengin damar', 'Rich vein');
  if (r >= 0.9) return L('Verimli', 'Good');
  if (r >= 0.5) return L('Orta', 'Average');
  if (r >= 0.25) return L('Zayıf', 'Poor');
  return L('Çok zayıf', 'Very poor');
}

// ---------------------------------------------------------------- pazar

export const SELLERS = [L('İsveç', 'Sweden'), L('İsviçre', 'Switzerland'), L('İspanya', 'Spain'), L('Portekiz', 'Portugal'), L('Arjantin', 'Argentina'), L('Türkiye', 'Türkiye')];

export interface MarketOffer {
  id: number;
  specId: string;
  /** Kalan adet. */
  count: number;
  unitPrice: number;
  seller: string;
  /** Teklifin sona ereceği zaman (s). */
  expires: number;
}

const MONEY_NF = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export interface LedgerEntry {
  time: number;
  /** Ekranda gösterilen an: gerçek oynanma süresi. Eski kayıtlarda yok. */
  played?: number;
  amount: number;
  reason: string;
}

export function fmtMoney(v: number): string {
  return `${MONEY_NF.format(Math.round(v))} ${CURRENCY}`;
}
