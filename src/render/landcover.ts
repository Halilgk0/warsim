// Arazi örtüsü (yalnız görsel): orman yoğunluğu, tarla parselleri ve eğim. Arazi rengi ve 3B ağaç/kaya
// yerleşimi aynı ızgaradan okunur; böylece uzaktan görülen orman lekesi yakından ağaç olur.
// Yapı tabanları (üsler, fabrikalar, şehir binaları) ormandan ve tarladan temizlenir.

import { CITIES, MAP_BASE, MAP_HALF as HALF, TEAM_SITES } from '../sim/mapData';
import { TERRAIN_CELL, TERRAIN_N, TERRAIN_W, heights, terrainMap } from '../sim/terrain';
import { clamp, smoothstep } from '../core/math';
import { type Circle, type LandcoverGrids, type LandcoverMap, fillLandcover } from './landcoverGen';

export { FIELD_COLORS } from './landcoverGen';


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

/** Hangi harita sürümü için hesaplandı. */
let computedFor = -1;

/** Yüklü haritanın ızgara bilgisi (arazi örtüsü hesabı için; mapWorker.ts de aynısını kurar). */
export function landcoverMap(): LandcoverMap {
  return {
    n: TERRAIN_N, w: TERRAIN_W, cell: TERRAIN_CELL, half: HALF,
    cellK: MAP_BASE / TERRAIN_N / TERRAIN_CELL,
    cities: CITIES,
    statics: TEAM_SITES.map((t) => ({ x: t.site.x, z: t.site.z, r: 2600 })),
  };
}

const GRIDS: LandcoverGrids = { forest: forestGrid, field: fieldGrid, kind: fieldKind, slope: slopeGrid, urban: urbanGrid };

/** Yüklü haritanın arazi örtüsünü hesapla (harita değişince bir kez). */
export function computeLandcover(): void {
  if (computedFor === terrainMap.version) return;
  computedFor = terrainMap.version;
  const map = landcoverMap();
  STATIC_CLEAR = [...map.statics];
  forestGrid.fill(0);
  fieldGrid.fill(0);
  fieldKind.fill(0);
  urbanGrid.fill(0);
  fillLandcover(heights, 0, 0, TERRAIN_W, map, GRIDS);
}

/** Harita işçilerinin hesapladığı satırları yerleştir (mapLoad.ts); hepsi gelince landcoverReady. */
export function adoptLandcoverRows(j0: number, part: LandcoverGrids): void {
  const at = j0 * TERRAIN_W;
  forestGrid.set(part.forest, at);
  fieldGrid.set(part.field, at);
  fieldKind.set(part.kind, at);
  slopeGrid.set(part.slope, at);
  urbanGrid.set(part.urban, at);
}

/** İşçilerden gelen arazi örtüsü yüklü haritanın: computeLandcover yeniden hesaplamaz. */
export function landcoverReady(): void {
  computedFor = terrainMap.version;
  STATIC_CLEAR = [...landcoverMap().statics];
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
