import { Vector3 } from 'three';

/** Harita kenar uzunluğu (m). Merkez orijinde. İki harita da aynı boyutta (sonraki nesil jetler için geniş). */
export const MAP_SIZE = 300000;

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
  { name: 'Mavi', color: '#5b7ec9' },
  { name: 'Kırmızı', color: '#d9725f' },
  { name: 'Mor', color: '#9a72c6' },
  { name: 'Sarı', color: '#c99a2e' },
  { name: 'Turkuaz', color: '#3b9fa3' },
  { name: 'Pembe', color: '#cf6a9d' },
];

// Seçili haritanın yerleri (canlı bağlar: harita değişince terrain.loadMap günceller)
export let MAP_ID = '';
export let TEAM_SITES: TeamSite[] = [];
export let CITIES: CityDef[] = [];
/** Arazi üretiminde düzleştirilen (ova) noktalar. */
export let LAND_POINTS: LandPoint[] = [];

export function setMapPlaces(id: string, sites: SiteDef[], cities: CityDef[], extra: LandPoint[]): void {
  MAP_ID = id;
  TEAM_SITES = TEAMS.map((t, i) => ({ ...t, site: sites[i] }));
  CITIES = cities;
  LAND_POINTS = [
    ...sites.map((s) => ({ x: s.x, z: s.z, r: 5200 })),
    ...extra,
    ...cities.map((c) => ({ x: c.x, z: c.z, r: c.r * 2 })),
  ];
}

// Anakara'daki test senaryoları (it dalaşı, saldırı) için sabit tesisler
export const BLUE_MAIN: SiteDef = { x: -100000, z: 12000, heading: 20 };
export const RED_MAIN: SiteDef = { x: 100000, z: -16000, heading: 200 };
export const BLUE_FORWARD: SiteDef = { x: -48000, z: -48000, heading: 160 };
export const RED_FORWARD: SiteDef = { x: 50000, z: 48000, heading: 150 };
export const BLUE_FACTORY = new Vector3(-82000, 0, -24000);
export const RED_FACTORY = new Vector3(82000, 0, 26000);
