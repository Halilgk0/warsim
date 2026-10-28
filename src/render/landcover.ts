// Arazi örtüsü (yalnız görsel): orman yoğunluğu, tarla parselleri ve eğim. Arazi rengi ve 3B ağaç/kaya
// yerleşimi aynı ızgaradan okunur; böylece uzaktan görülen orman lekesi yakından ağaç olur.
// Yapı tabanları (üsler, fabrikalar, şehir binaları) ormandan ve tarladan temizlenir.

import { CITIES, MAP_BASE, MAP_HALF as HALF, TEAM_SITES } from '../sim/mapData';
import { TERRAIN_CELL, TERRAIN_N, TERRAIN_W, heights, makeFbm, terrainMap } from '../sim/terrain';
import { clamp, smoothstep } from '../core/math';



// 300 km haritada 4,2 milyon köşe: 0..1 değerli ızgaralar 8 bit (0..255) tutulur, okurken /255.
/** Köşe başına orman yoğunluğu (0..255). */
export const forestGrid = new Uint8Array(TERRAIN_W * TERRAIN_W);
/** Köşe başına tarla etkisi (0..255). */
export const fieldGrid = new Uint8Array(TERRAIN_W * TERRAIN_W);
/** Köşe başına parsel türü (renk). */
export const fieldKind = new Uint8Array(TERRAIN_W * TERRAIN_W);
/** Köşe başına eğim (yükselti / yatay). */
export const slopeGrid = new Float32Array(TERRAIN_W * TERRAIN_W);
/** Köşe başına şehir zemini (0..255, dekor şehirleri). */
export const urbanGrid = new Uint8Array(TERRAIN_W * TERRAIN_W);

type Grid = Float32Array | Uint8Array;
const unit = (g: Grid) => (g instanceof Uint8Array ? 1 / 255 : 1);

/** Parsel renkleri (sRGB 0-255): buğday, taze ekin, sürülmüş, çayır, kolza. */
/** Parsel renkleri: olgun buğday, yeşil ekin, sürülmüş toprak, çayır, kolza. */
export const FIELD_COLORS: [number, number, number][] = [
  [212, 186, 104], [140, 172, 80], [150, 122, 88], [166, 190, 108], [216, 200, 86],
];

interface Circle { x: number; z: number; r: number }

/** Haritanın ana üs yerleri (orman ve tarla yok). Harita değişince yenilenir. */
let STATIC_CLEAR: Circle[] = [];

/** Oyunda kurulan yapıların tabanları (her kare güncellenir). */
let dynamicClear: Circle[] = [];
let clearVersion = 0;

export function setClearings(list: Circle[]): void {
  dynamicClear = list;
  clearVersion++;
}

export function clearingsVersion(): number {
  return clearVersion;
}

/** Bu nokta bir yapı tabanında mı (ağaç/kaya konmaz). */
export function cleared(x: number, z: number, pad = 0): boolean {
  for (const c of dynamicClear) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
  for (const c of STATIC_CLEAR) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
  return false;
}

/** Yapı tabanındaysa 0, kenarına doğru 1 (arazi rengi yumuşak geçsin). */
export function clearFactor(x: number, z: number): number {
  let f = 1;
  for (const c of dynamicClear) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r * 1.4) f = Math.min(f, smoothstep(c.r * 0.9, c.r * 1.4, d));
  }
  return f;
}

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fbmForest = makeFbm(5151, 4);
const fbmForest2 = makeFbm(6262, 3);
const fbmField = makeFbm(7373, 3);
const fbmAngle = makeFbm(8484, 2);

/** Hangi harita sürümü için hesaplandı. */
let computedFor = -1;

/** Yüklü haritanın arazi örtüsünü hesapla (harita değişince bir kez). */
export function computeLandcover(): void {
  if (computedFor === terrainMap.version) return;
  computedFor = terrainMap.version;
  STATIC_CLEAR = TEAM_SITES.map((t) => ({ x: t.site.x, z: t.site.z, r: 2600 }));
  /** 300 km hücresinin bu haritanın hücresine oranı (300 km'de 1, 150 km'de 2). */
  const cellK = MAP_BASE / TERRAIN_N / TERRAIN_CELL;
  forestGrid.fill(0);
  fieldGrid.fill(0);
  fieldKind.fill(0);
  urbanGrid.fill(0);
  for (let j = 0; j < TERRAIN_W; j++) {
    for (let i = 0; i < TERRAIN_W; i++) {
      const k = j * TERRAIN_W + i;
      const x = -HALF + i * TERRAIN_CELL;
      const z = -HALF + j * TERRAIN_CELL;
      const h = heights[k];
      const hx = heights[j * TERRAIN_W + Math.min(i + 1, TERRAIN_N)] - heights[j * TERRAIN_W + Math.max(i - 1, 0)];
      const hz = heights[Math.min(j + 1, TERRAIN_N) * TERRAIN_W + i] - heights[Math.max(j - 1, 0) * TERRAIN_W + i];
      const slope = Math.hypot(hx, hz) / (2 * TERRAIN_CELL);
      slopeGrid[k] = slope;
      if (h < 18) continue;
      // Şehir çevresinde orman açılmış, tarla yoğun
      let cityNear = 0;
      let cityClear = 1;
      let urban = 0;
      for (const c of CITIES) {
        // Uzak şehirler etkisiz (6 yarıçap ötesi)
        if (Math.abs(x - c.x) > c.r * 6 || Math.abs(z - c.z) > c.r * 6) continue;
        const d = Math.hypot(x - c.x, z - c.z);
        cityNear = Math.max(cityNear, 1 - smoothstep(c.r * 1.5, c.r * 6, d));
        cityClear = Math.min(cityClear, smoothstep(c.r * 1.05, c.r * 2.4, d));
        urban = Math.max(urban, 1 - smoothstep(c.r * 0.75, c.r * 1.15, d));
      }
      urbanGrid[k] = Math.round(urban * 255);
      let site = 1;
      for (const c of STATIC_CLEAR) {
        if (Math.abs(x - c.x) > c.r * 1.6 || Math.abs(z - c.z) > c.r * 1.6) continue;
        site = Math.min(site, smoothstep(c.r * 0.8, c.r * 1.6, Math.hypot(x - c.x, z - c.z)));
      }
      // Orman: büyük lekeler + küçük ayrıntı; tepelerde daha çok, çok dik yamaçta ve ağaç sınırı üstünde yok
      const n = fbmForest(x / 9000, z / 9000) * 0.8 + fbmForest2(x / 2400, z / 2400) * 0.35;
      const hill = 0.45 + 0.55 * smoothstep(120, 650, h);
      const treeLine = 1 - smoothstep(1650, 2050, h);
      const steep = 1 - smoothstep(0.75, 1.15, slope);
      const f = smoothstep(-0.02, 0.2, n) * hill * treeLine * steep * cityClear * site * (1 - cityNear * 0.55);
      forestGrid[k] = Math.round(clamp(f, 0, 1) * 255);
      // Tarla: düz ovalarda, ormansız yerde, şehir çevresinde yoğun
      if (h < 560 && slope < 0.14) {
        const region = smoothstep(-0.12, 0.22, fbmField(x / 15000, z / 15000));
        const fl = clamp(region * 0.85 + cityNear * 0.6, 0, 1) * (1 - smoothstep(0.1, 0.35, f)) * (1 - smoothstep(0.08, 0.14, slope)) * site * (1 - urban);
        let fv = fl * smoothstep(18, 40, h) * (1 - smoothstep(420, 560, h));
        // Parseller: köşe ızgarasına hizalı dikdörtgenler (bölgeye göre 3-5 × 2-4 köşe, 300 km hücresinde), hücre başına
        // renk. Küçük haritada hücre küçük: köşe sayısı artar, parsel gerçek boyunda kalır
        const region2 = Math.floor((fbmAngle(x / 30000, z / 30000) + 1) * 3);
        const pw = Math.round((3 + (region2 % 3)) * cellK);
        const ph = Math.round((2 + ((region2 + 1) % 3)) * cellK);
        const cu = Math.floor((i + region2 * 7) / pw);
        const cv = Math.floor((j + region2 * 3 + (cu % 2)) / ph);
        fieldKind[k] = Math.floor(hash(cu, cv) * FIELD_COLORS.length);
        // Bazı parseller nadasta/çayır: tarla etkisi azalır
        if (hash(cv + 91, cu - 17) < 0.18) fv *= 0.3;
        fieldGrid[k] = Math.round(clamp(fv, 0, 1) * 255);
      }
    }
  }
}

/** Izgaradan en yakın köşe değeri. */
export function sampleGrid(grid: Grid, x: number, z: number): number {
  const i = clamp(Math.round((x + HALF) / TERRAIN_CELL), 0, TERRAIN_N);
  const j = clamp(Math.round((z + HALF) / TERRAIN_CELL), 0, TERRAIN_N);
  return grid[j * TERRAIN_W + i] * unit(grid);
}

/** Çift doğrusal örnekleme (yumuşak geçiş). */
export function sampleSmooth(grid: Grid, x: number, z: number): number {
  const gx = clamp((x + HALF) / TERRAIN_CELL, 0, TERRAIN_N - 0.001);
  const gz = clamp((z + HALF) / TERRAIN_CELL, 0, TERRAIN_N - 0.001);
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const k = j * TERRAIN_W + i;
  const a = grid[k] + (grid[k + 1] - grid[k]) * fx;
  const b = grid[k + TERRAIN_W] + (grid[k + TERRAIN_W + 1] - grid[k + TERRAIN_W]) * fx;
  return (a + (b - a) * fz) * unit(grid);
}
