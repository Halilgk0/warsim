import { Vector3 } from 'three';
import { L } from '../i18n';

/**
 * Haritalar 300 km için çizildi (taban). Küçük haritalar bunun ölçekli hâli: büyük şekiller (silsile, körfez, adalar),
 * üs ve şehir yerleri küçülür; yerel tepeler, nehir genişliği, pist ve şehir büyüklüğü gerçek ölçüde kalır.
 */
export const MAP_BASE = 300000;
/** Seçilebilen harita büyüklükleri (kenar, m): küçükte üsler yakın, savaş çabuk başlar. */
export const MAP_SIZES = [150000, 200000, 300000] as const;
/** Yeni harekâtın varsayılan büyüklüğü. */
export const MAP_SIZE_DEFAULT = 200000;

// Yüklü haritanın ölçüsü (canlı bağlar: terrain.loadMap günceller). Merkez orijinde.
/** Harita kenar uzunluğu (m). */
export let MAP_SIZE = MAP_BASE;
export let MAP_HALF = MAP_BASE / 2;
/** Büyüklük / taban (300 km'de 1). */
export let MAP_SCALE = 1;

/** Büyüklüğün adı: Küçük, Orta, Büyük. */
export function mapSizeName(size: number): string {
  return size <= 160000 ? L('Küçük', 'Small') : size <= 220000 ? L('Orta', 'Medium') : L('Büyük', 'Large');
}

export interface SiteDef {
  x: number;
  z: number;
  /** Pist yönü (pusula, derece). */
  heading: number;
}

export interface CityDef {
  x: number;
  z: number;
  r: number;
  n: number;
}

export interface LandPoint {
  x: number;
  z: number;
  r: number;
}

/** Taraflar: ad, renk ve (seçili haritada) ana üs yeri. Oyuncu ilk; düşmanlar sırayla. */
export interface TeamSite {
  name: string;
  color: string;
  site: SiteDef;
}

const TEAMS: { name: string; color: string }[] = [
  { name: L('Mavi', 'Blue'), color: '#5b7ec9' },
  { name: L('Kırmızı', 'Red'), color: '#d9725f' },
  { name: L('Mor', 'Purple'), color: '#9a72c6' },
  { name: L('Sarı', 'Yellow'), color: '#c99a2e' },
  { name: L('Turkuaz', 'Teal'), color: '#3b9fa3' },
  { name: L('Pembe', 'Pink'), color: '#cf6a9d' },
];

// Seçili haritanın yerleri (canlı bağlar: harita değişince terrain.loadMap günceller)
export let MAP_ID = '';
export let TEAM_SITES: TeamSite[] = [];
export let CITIES: CityDef[] = [];
/** Arazi üretiminde düzleştirilen (ova) noktalar. */
export let LAND_POINTS: LandPoint[] = [];

/** Haritanın yerleri (taban ölçekte tanımlı) seçilen büyüklüğe göre: konumlar küçülür, yarıçaplar gerçek kalır. */
export function setMapPlaces(id: string, size: number, sites: SiteDef[], cities: CityDef[], extra: LandPoint[]): void {
  MAP_ID = id;
  MAP_SIZE = size;
  MAP_HALF = size / 2;
  MAP_SCALE = size / MAP_BASE;
  const k = MAP_SCALE;
  const scaledSites = sites.map((s) => ({ ...s, x: s.x * k, z: s.z * k }));
  TEAM_SITES = TEAMS.map((t, i) => ({ ...t, site: scaledSites[i] }));
  CITIES = cities.map((c) => ({ ...c, x: c.x * k, z: c.z * k }));
  LAND_POINTS = [
    ...scaledSites.map((s) => ({ x: s.x, z: s.z, r: 5200 })),
    ...extra.map((p) => ({ ...p, x: p.x * k, z: p.z * k })),
    ...CITIES.map((c) => ({ x: c.x, z: c.z, r: c.r * 2 })),
  ];
}

// Anakara'daki test senaryoları (it dalaşı, saldırı) için sabit tesisler
export const BLUE_MAIN: SiteDef = { x: -100000, z: 12000, heading: 20 };
export const RED_MAIN: SiteDef = { x: 100000, z: -16000, heading: 200 };
export const BLUE_FORWARD: SiteDef = { x: -48000, z: -48000, heading: 160 };
export const RED_FORWARD: SiteDef = { x: 50000, z: 48000, heading: 150 };
export const BLUE_FACTORY = new Vector3(-82000, 0, -24000);
export const RED_FACTORY = new Vector3(82000, 0, 26000);
