// Harita önizlemesi: haritanın doğal yükseklik fonksiyonundan küçük bir resim (arazi üretmeden, birkaç ms).

import { MAP_BASE } from '../sim/mapData';
import type { MapDef } from '../sim/maps';
import { TERRAIN_CELL, TERRAIN_N, TERRAIN_W, heights, terrainMap } from '../sim/terrain';

const cache = new Map<string, string>();

/** Pastel harita renkleri (deniz, kumsal, ova, tepe, dağ, zirve). */
function color(h: number): [number, number, number] {
  if (h < 0) {
    const k = Math.min(1, -h / 250);
    return [186 - 40 * k, 221 - 29 * k, 229 - 18 * k];
  }
  if (h < 25) return [238, 229, 203];
  if (h < 350) return [214 - (h / 350) * 18, 231 - (h / 350) * 11, 186 - (h / 350) * 20];
  if (h < 1100) {
    const k = (h - 350) / 750;
    return [196 + 4 * k, 220 - 24 * k, 166 + 2 * k];
  }
  const k = Math.min(1, (h - 1100) / 1500);
  return [200 + 41 * k, 196 + 43 * k, 168 + 66 * k];
}

/** Çöl haritası (Kanyonlar): kanyon dibi kızıl, plato devetüyü, yüksek plato açık. */
function desertColor(h: number): [number, number, number] {
  if (h < 0) return [150, 196, 210];
  if (h < 300) return [176 + h * 0.06, 104 + h * 0.08, 72 + h * 0.06];
  const k = Math.min(1, (h - 300) / 900);
  return [214 - 6 * k, 168 + 8 * k, 120 + 18 * k];
}

let terrCache: { key: string; url: string } | null = null;

/** Yüklü haritanın gölgeli resmi hazırsa (yoksa null; üretmez). */
export function terrainImageCached(): string | null {
  return terrCache && terrCache.key.startsWith(`${terrainMap.key}:`) ? terrCache.url : null;
}

/**
 * Yüklü haritanın tepe gölgeli resmi (2026-11-25, görev planlayıcının yakınlaştırılabilen devriye haritası): oyunun kendi arazi
 * ızgarasından (önizleme işlevinden değil: yapı düzlükleri dahil), ışık kuzeybatıdan. Harita başına bir kez, JPEG data URL.
 */
export function terrainImage(desert: boolean, px = 1024): string {
  const key = `${terrainMap.key}:${px}`;
  if (terrCache?.key === key) return terrCache.url;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(px, px);
  const N = TERRAIN_N;
  const at = (i: number, j: number) => heights[Math.min(N, Math.max(0, j)) * TERRAIN_W + Math.min(N, Math.max(0, i))];
  const step = N / px;
  const s = Math.max(1, Math.round(step));
  const run = 2 * s * TERRAIN_CELL;
  for (let j = 0; j < px; j++) {
    const gj = Math.floor((j + 0.5) * step);
    for (let i = 0; i < px; i++) {
      const gi = Math.floor((i + 0.5) * step);
      const h = at(gi, gj);
      const [r, g, b] = desert ? desertColor(h) : color(h);
      // Eğim gölgesi: yüzü batıya ve kuzeye dönük yamaç aydınlık (deniz düz)
      const k = h < 0 ? 1 : Math.min(1.2, Math.max(0.68, 0.94 + ((at(gi + s, gj) - at(gi - s, gj)) / run + (at(gi, gj + s) - at(gi, gj - s)) / run) * 1.4));
      const o = (j * px + i) * 4;
      img.data[o] = Math.min(255, r * k);
      img.data[o + 1] = Math.min(255, g * k);
      img.data[o + 2] = Math.min(255, b * k);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL('image/jpeg', 0.88);
  terrCache = { key, url };
  return url;
}

/** Haritanın küçük resmi (data URL, önbellekli). */
export function mapPreview(def: MapDef, px = 120): string {
  const key = `${def.id}:${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(px, px);
  // Biçim her büyüklükte aynı: taban ölçekte çizilir
  const half = MAP_BASE / 2;
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const x = -half + ((i + 0.5) / px) * MAP_BASE;
      const z = -half + ((j + 0.5) / px) * MAP_BASE;
      const h = def.preview ? def.preview(x, z) : def.natural(x, z);
      const [r, g, b] = def.biome === 'desert' ? desertColor(h) : color(h);
      const o = (j * px + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
