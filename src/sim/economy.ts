// Ekonomi: para (kr), fiyatlar ve maliyetler, maden verimi ve uluslararası uçak pazarı.
//
// Gelir yolları:
//  - Düşman yapısı yıkmak (yapı maliyetinin bir kısmı ganimet/ödül)
//  - Düşman uçağı düşürmek (uçak fiyatının bir kısmı)
//  - Pazarda uçak satmak (başka ülkelere)
//  - Maden ocağı: pasif gelir; verim yere göre değişir ve haritada görünmez (kurmadan bilinmez)
// Giderler: her inşaat, üs tesisi, uçaksavar kurulumu, araştırma ve uçak üretimi (ve pazardan alım).

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
export const START_MONEY = 25000;

/** Uçak fiyatı: boş kütle, motor gücü (jette itki), mürettebat ve nesle göre. */
export function aircraftPrice(s: AircraftSpec): number {
  const e = s.engine;
  const power = e.kind === 'jet' ? (e.kn ?? 0) * e.count * 100 : (e.kw ?? 0) * e.count * 1.1;
  const gen = s.generation === 'P1' ? 1 : s.generation === 'P2' ? 1.25 : s.generation === 'J1' ? 1.8 : 2.6;
  const base = s.massEmpty * 0.55 + power + s.crew * 150 + s.turrets.length * 250;
  // ×0,91: 2026-10'daki ×1,3'ün %30 indirimlisi (oyun, özellikle üs yıkma, yarı sürede ilerlesin)
  return Math.max(450, Math.round((base * gen * 0.91) / 50) * 50);
}

/**
 * İnşaat maliyetleri: 2026-10'daki ×1,5'in %30 indirimlisi (oyun, özellikle üs yıkma, yarı sürede ilerlesin; uçak,
 * araştırma, üs tesisi ve uçaksavar işleri de %30 ucuzladı).
 */
export const STRUCTURE_COST: Record<StructureKind, number> = {
  airbase: 18900,
  aa: 2650,
  radar: 6300,
  factory: 12600,
  mine: 6300,
  house: 550,
  apartment: 1900,
  shops: 1550,
  office: 3650,
  depot: 2100,
  park: 400,
};

export const BASE_UPGRADE_COST: Record<BaseUpgrade, number> = {
  workshop: 2650,
  hangars: 4200,
  revetments: 1550,
};

/** Araştırma maliyeti: süreyle, uçaklarda ayrıca uçağın fiyatıyla orantılı. */
export function researchCost(t: TechNode, price?: number): number {
  if (t.starting || t.future) return 0;
  const c = (t.kind === 'aircraft' ? (price ?? 0) * 1.0 + t.time * 3 : t.time * 5) * 0.98;
  return Math.round(c / 50) * 50;
}

/** Ödüller (gelirler kısıldı: düşürme fiyatın %20'si, yıkılan yapı maliyetin %25'i). */
export const KILL_REWARD = 0.2;
export const STRUCTURE_REWARD = 0.25;
/** Pazarda satış oranı (fiyatın). */
export const SELL_RATE = 0.45;

// ---------------------------------------------------------------- maden

/** Madenin saniyelik taban geliri (verim 1'de). */
export const MINE_RATE = 6;

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
