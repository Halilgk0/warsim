// Paylaşılan yükseklik haritası. Simülasyon (çarpışma, arazi takibi, radar görüş hattı) ve
// render (3B arazi ağı) aynı ızgarayı ve aynı üçgenlemeyi kullanır; uçağın "gördüğü" zemin ekrandakiyle aynıdır.

import { smoothstep } from '../core/math';
import { MAP_BASE, MAP_HALF as HALF } from './mapData';
import { MAPS, mapById, type MapDef } from './maps';
import { TERRAIN_N, TERRAIN_W, fillRows, prepareMap } from './terrainGen';

export { makeFbm } from '../core/noise';
export { TERRAIN_N, TERRAIN_W };

/**
 * Izgara: her büyüklükte 2048 hücre (TERRAIN_N). Hücre haritayla ölçeklenir (300 km'de ≈146 m, 150 km'de ≈73 m):
 * çizim ve bellek aynı kalır, küçük haritada arazi daha ayrıntılı. Canlı bağ (harita yüklenince değişir).
 */
export let TERRAIN_CELL = MAP_BASE / TERRAIN_N;
/** Etkin dünya yarıçapı (4/3 kuralı) — radar ufku için. */
const EARTH_R_EFF = 8.5e6;

/** Izgara yükseklikleri (m), satır = z, sütun = x. */
export const heights = new Float32Array(TERRAIN_W * TERRAIN_W);
/** Düzenlenmemiş arazi (yeni oyun ya da kayıt yüklenince düzleştirmeler geri alınır). */
const pristine = new Float32Array(TERRAIN_W * TERRAIN_W);

/** Yüklü harita (kimlik, büyüklük, ikisinin anahtarı); sürüm her yeni haritada artar (render katmanı her şeyi yeniden kurar). */
export const terrainMap = { id: '', size: MAP_BASE, key: '', version: 0 };

/** Harita + büyüklük anahtarı ("anakara@150000"). */
export const mapKey = (id: string, size: number): string => `${id}@${size}`;

/** Haritanın arazisini üret: doğal yükseklik + üs/şehir ovalarının düzleştirilmesi (terrainGen.ts). */
function generate(def: MapDef, size: number): void {
  TERRAIN_CELL = prepareMap(def, size);
  fillRows(def, TERRAIN_CELL, 0, TERRAIN_W, heights);
  finish(def, size);
}

/** Üretilen araziyi yüklü harita yap. */
function finish(def: MapDef, size: number): void {
  pristine.set(heights);
  edited = [];
  terrainEdits.dirty.length = 0;
  terrainEdits.version++;
  terrainMap.id = def.id;
  terrainMap.size = size;
  terrainMap.key = mapKey(def.id, size);
  terrainMap.version++;
}

/** Haritayı verilen büyüklükte yükle (zaten yüklüyse bir şey yapmaz). Yeni dünya kurulmadan önce çağrılır. */
export function loadMap(id: string, size: number = MAP_BASE): void {
  const def = mapById(id);
  if (terrainMap.key === mapKey(def.id, size)) return;
  generate(def, size);
}

/**
 * Dışarıda (işçilerde) üretilecek harita için hazırlık: yerler ve hücre boyu kurulur, heights'ı çağıran doldurur, sonra
 * endExternalLoad. render/mapLoad.ts açılışta böyle yükler. Yüklü haritaysa false.
 */
export function beginExternalLoad(id: string, size: number): boolean {
  const def = mapById(id);
  if (terrainMap.key === mapKey(def.id, size)) return false;
  TERRAIN_CELL = prepareMap(def, size);
  return true;
}

/** Dışarıda üretilen heights'ı yüklü harita yap. */
export function endExternalLoad(id: string, size: number): void {
  finish(mapById(id), size);
}

/** Arazi düzenlendiğinde (inşaat) render katmanına haber vermek için. */
export const terrainEdits = {
  version: 0,
  dirty: [] as { i0: number; j0: number; i1: number; j1: number }[],
};

/** Bu oyunda düzenlenen bölgeler. */
let edited: { i0: number; j0: number; i1: number; j1: number }[] = [];

// İlk harita (taban büyüklükte). Tarayıcıda açılışta işçilerde üretilir (render/mapLoad.ts; ana iş parçacığı
// kilitlenmesin); başsız simülasyonda (Node) modül yüklenirken burada.
if (typeof document === 'undefined' && !('WorkerGlobalScope' in globalThis)) generate(MAPS[0], MAP_BASE);

/** Tüm inşaat düzleştirmelerini geri al (her yeni dünya temiz araziyle başlar). */
export function resetTerrainEdits(): void {
  if (!edited.length) return;
  for (const r of edited) {
    for (let j = r.j0; j <= r.j1; j++) {
      const a = j * TERRAIN_W + r.i0;
      heights.set(pristine.subarray(a, a + (r.i1 - r.i0) + 1), a);
    }
    terrainEdits.dirty.push(r);
  }
  edited = [];
  terrainEdits.version++;
}

/** Hücre içinde, render ağıyla aynı üçgenleme ile yükseklik (köşegen 00→11). */
export function terrainHeight(x: number, z: number): number {
  const gx = (x + HALF) / TERRAIN_CELL;
  const gz = (z + HALF) / TERRAIN_CELL;
  if (gx < 0 || gz < 0 || gx >= TERRAIN_N || gz >= TERRAIN_N) return -300;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const k = j * TERRAIN_W + i;
  const h00 = heights[k];
  const h10 = heights[k + 1];
  const h01 = heights[k + TERRAIN_W];
  const h11 = heights[k + TERRAIN_W + 1];
  if (fx >= fz) return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
  return h00 + (h01 - h00) * fz + (h11 - h01) * fx;
}

/** Çarpışma yüzeyi: kara ya da deniz yüzeyi. */
export function groundLevel(x: number, z: number): number {
  const h = terrainHeight(x, z);
  return h > 0 ? h : 0;
}

export function isWater(x: number, z: number): boolean {
  return terrainHeight(x, z) < 1;
}

/**
 * İki nokta arasında arazi görüş hattı. Dünya eğriliği (radar ufku) dahil.
 * a ve b dünya koordinatları; adım ızgara hücresinden biraz küçük.
 */
export function lineOfSight(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist < 1) return true;
  const steps = Math.ceil(dist / (TERRAIN_CELL * 0.8));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const sd = dist * t;
    const lineY = ay + (by - ay) * t;
    const bulge = (sd * (dist - sd)) / (2 * EARTH_R_EFF);
    if (groundLevel(ax + dx * t, az + dz * t) + bulge > lineY) return false;
  }
  return true;
}

/** Dikdörtgen taban altındaki arazi istatistikleri (yerleşim uygunluğu için). */
export function footprintStats(
  cx: number, cz: number, halfW: number, halfL: number, headingRad: number,
): { min: number; max: number; mean: number; water: number; outside: boolean } {
  const fx = Math.sin(headingRad);
  const fz = -Math.cos(headingRad);
  const rx = -fz;
  const rz = fx;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  let water = 0;
  let outside = false;
  const su = Math.max(2, Math.ceil(halfL / (TERRAIN_CELL * 0.6)));
  const sv = Math.max(2, Math.ceil(halfW / (TERRAIN_CELL * 0.6)));
  for (let a = -su; a <= su; a++) {
    for (let b = -sv; b <= sv; b++) {
      const u = (a / su) * halfL;
      const v = (b / sv) * halfW;
      const x = cx + fx * u + rx * v;
      const z = cz + fz * u + rz * v;
      if (Math.abs(x) > HALF * 0.97 || Math.abs(z) > HALF * 0.97) outside = true;
      const h = terrainHeight(x, z);
      if (h < 2) water++;
      min = Math.min(min, h);
      max = Math.max(max, h);
      sum += h;
      n++;
    }
  }
  return { min, max, mean: sum / n, water: water / n, outside };
}

/** İnşaat için zemini düzleştirir (kenarlarda yumuşak geçiş). */
export function flattenFootprint(
  cx: number, cz: number, halfW: number, halfL: number, headingRad: number, target: number, margin: number,
): void {
  const fx = Math.sin(headingRad);
  const fz = -Math.cos(headingRad);
  const ext = Math.hypot(halfW, halfL) + margin;
  const i0 = Math.max(0, Math.floor((cx - ext + HALF) / TERRAIN_CELL));
  const i1 = Math.min(TERRAIN_N, Math.ceil((cx + ext + HALF) / TERRAIN_CELL));
  const j0 = Math.max(0, Math.floor((cz - ext + HALF) / TERRAIN_CELL));
  const j1 = Math.min(TERRAIN_N, Math.ceil((cz + ext + HALF) / TERRAIN_CELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = -HALF + i * TERRAIN_CELL - cx;
      const z = -HALF + j * TERRAIN_CELL - cz;
      const u = Math.abs(x * fx + z * fz);
      const v = Math.abs(x * -fz + z * fx);
      const out = Math.max(u - halfL, v - halfW);
      const w = out <= 0 ? 1 : 1 - smoothstep(0, margin, out);
      if (w <= 0) continue;
      const k = j * TERRAIN_W + i;
      heights[k] += (target - heights[k]) * w;
    }
  }
  terrainEdits.version++;
  terrainEdits.dirty.push({ i0, j0, i1, j1 });
  edited.push({ i0, j0, i1, j1 });
}

/** Bir bölgedeki en yüksek noktayı bulur (radar için tepe seçimi). */
export function highestPointNear(cx: number, cz: number, radius: number): { x: number; z: number; h: number } {
  let best = { x: cx, z: cz, h: terrainHeight(cx, cz) };
  const step = TERRAIN_CELL;
  for (let z = cz - radius; z <= cz + radius; z += step) {
    for (let x = cx - radius; x <= cx + radius; x += step) {
      if ((x - cx) ** 2 + (z - cz) ** 2 > radius * radius) continue;
      const h = terrainHeight(x, z);
      if (h > best.h) best = { x, z, h };
    }
  }
  return best;
}
