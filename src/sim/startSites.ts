// Rastgele başlangıç yerleri (2026-11-10): harekâtta oyuncu ve düşmanların ana üsleri haritanın sabit yerlerinde değil,
// yüklü haritada uygun rastgele yerlerde başlar. Arazi sabit kalır (eski kayıtlar bit bit aynı); yer, arazinin zaten uygun
// olduğu noktalardan seçilir: karada, pist sığar, iniş ve kalkış koridoru açık, şehirlerden ve harita kenarından uzak.
// Uzaklıklar değişir ama ortalaması haritanın sabit yerlerindekine yakın kalır; kimse ötekinin dibinde ya da tek başına
// uzakta başlamaz.

import { CITIES, MAP_HALF, MAP_ID, MAP_SCALE, MAP_SIZE, TEAM_SITES, type SiteDef } from './mapData';
import { mapById } from './maps';
import { footprintStats, terrainMap } from './terrain';
import { bestRunwayHeading, runwayScore } from './structures/airbase';
import { STRUCTURE_DEFS } from './structures/structure';

/** zone: haritanın başlangıç bölgesi (Takımadalar'da ada; bölgesiz haritada -1). */
interface Spot { x: number; z: number; heading: number; zone: number }

/** Noktanın başlangıç bölgesi: bölgeli haritada içinde olduğu bölge (kıyıdan payla), yoksa null (uygun değil). */
function zoneOf(x: number, z: number): number | null {
  const zones = mapById(MAP_ID).startZones;
  if (!zones) return -1;
  for (const [i, c] of zones.entries()) if (Math.hypot(x - c.x * MAP_SCALE, z - c.z * MAP_SCALE) < c.r * MAP_SCALE * 0.8) return i;
  return null;
}

/** Her taraf için en yakın rakibin uzaklığı, sabit yerlerdeki ortalamanın bu katları arasında. */
const NEAR_MIN = 0.6;
const NEAR_MAX = 1.5;
/** Ortalama en yakın rakip uzaklığı, sabit yerlerdekinin ±%15'i içinde. */
const MEAN_TOL = 0.15;
/** Uygun nokta havuzu (harita başına bir kez). */
const POOL_SIZE = 140;
const POOL_TRIES = 5000;

let pool: { key: string; spots: Spot[]; tries: number } | null = null;

/** Nokta ana üs için uygun mu; uygunsa pist yönüyle. */
function suitable(x: number, z: number, rng: () => number): Spot | null {
  const edge = Math.max(12000, MAP_SIZE * 0.07);
  if (Math.abs(x) > MAP_HALF - edge || Math.abs(z) > MAP_HALF - edge) return null;
  const zone = zoneOf(x, z);
  if (zone === null) return null;
  for (const c of CITIES) if (Math.hypot(c.x - x, c.z - z) < c.r * 2.5 + 3000) return null;
  // Ucuz ön eleme: çevre karada ve fazla engebeli değil (fabrika, ev ve maden de sığsın)
  const wide = footprintStats(x, z, 2600, 2600, 0);
  if (wide.outside || wide.water > 0.25 || wide.max - wide.min > 700) return null;
  const def = STRUCTURE_DEFS.airbase;
  const core = footprintStats(x, z, def.halfW, def.halfL, 0);
  if (core.water > 0 || core.max - core.min > def.maxRelief * 1.6) return null;
  const elev = Math.max(core.mean, 6);
  const heading = bestRunwayHeading(x, z, elev, rng() * Math.PI);
  const st = footprintStats(x, z, def.halfW, def.halfL, heading);
  if (st.outside || st.water > 0.02 || st.max - st.min > def.maxRelief * 0.9) return null;
  if (runwayScore(x, z, Math.max(st.mean, 6), heading) < -20) return null;
  return { x, z, heading, zone };
}

/**
 * Uygun nokta havuzunu (yüklü harita için) en çok maxMs boyunca doldurur; bitti mi. Havuz harita başına bir kez kurulur;
 * telefonda yüzlerce ms sürebildiği için ana menü bunu dilimler hâlinde çağırır (startSitesReady).
 */
export function buildStartSitePool(maxMs = Infinity, rng: () => number = Math.random): boolean {
  if (pool?.key !== terrainMap.key) pool = { key: terrainMap.key, spots: [], tries: 0 };
  const p = pool;
  const t0 = performance.now();
  while (p.tries < POOL_TRIES && p.spots.length < POOL_SIZE) {
    p.tries++;
    const s = suitable((rng() * 2 - 1) * MAP_HALF, (rng() * 2 - 1) * MAP_HALF, rng);
    if (s) p.spots.push(s);
    if (performance.now() - t0 > maxMs) break;
  }
  return p.tries >= POOL_TRIES || p.spots.length >= POOL_SIZE;
}

/** Yüklü haritanın havuzu hazır mı (yoksa rollStartSites onu bir seferde kurar). */
export function startSitesReady(): boolean {
  return pool?.key === terrainMap.key && (pool.tries >= POOL_TRIES || pool.spots.length >= POOL_SIZE);
}

function spots(rng: () => number): Spot[] {
  buildStartSitePool(Infinity, rng);
  return pool!.spots;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Her tarafın en yakın rakibine uzaklığı. */
function nearest(list: { x: number; z: number }[]): number[] {
  return list.map((a, i) => Math.min(...list.filter((_, j) => j !== i).map((b) => dist(a, b))));
}

/** Haritanın sabit yerlerinde (bu büyüklükte) en yakın rakip uzaklıklarının ortalaması: rastgele dizilişin hedefi. */
export function referenceSpacing(teams: number): number {
  const fixed = TEAM_SITES.slice(0, teams).map((t) => t.site);
  const n = nearest(fixed);
  return n.reduce((a, b) => a + b, 0) / n.length;
}

/**
 * Yüklü haritada teams tarafın (oyuncu + düşmanlar) rastgele ana üs yerleri, oyuncu ilk. Uygun diziliş bulunamazsa null:
 * çağıran haritanın sabit yerlerini kullanır.
 */
export function rollStartSites(teams: number, rng: () => number = Math.random): SiteDef[] | null {
  const all = spots(rng);
  if (all.length < teams) return null;
  const ref = referenceSpacing(teams);
  const lo = ref * NEAR_MIN;
  const hi = ref * NEAR_MAX;
  let best: { list: Spot[]; err: number } | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const list: Spot[] = [all[Math.floor(rng() * all.length)]];
    while (list.length < teams) {
      // Herkesten en az lo uzakta, en yakınına en çok hi uzaklıkta (kimse tek başına uzakta kalmasın)
      const cand = all.filter((p) => {
        let m = Infinity;
        for (const q of list) {
          // Bölgeli haritada her taraf ayrı bölgede (ayrı adada)
          if (p.zone >= 0 && p.zone === q.zone) return false;
          const d = dist(p, q);
          if (d < lo) return false;
          m = Math.min(m, d);
        }
        return m <= hi;
      });
      if (!cand.length) break;
      list.push(cand[Math.floor(rng() * cand.length)]);
    }
    if (list.length < teams) continue;
    const near = nearest(list);
    if (near.some((d) => d < lo || d > hi)) continue;
    const err = Math.abs(near.reduce((a, b) => a + b, 0) / near.length / ref - 1);
    if (err <= MEAN_TOL) return list.map(({ x, z, heading }) => ({ x, z, heading: (heading * 180) / Math.PI }));
    if (!best || err < best.err) best = { list, err };
  }
  // Ortalama tam tutmadıysa en yakın olan (sınırlar yine sağlanmış)
  return best ? best.list.map(({ x, z, heading }) => ({ x, z, heading: (heading * 180) / Math.PI })) : null;
}
