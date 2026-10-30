// Arazi yüksekliği üretimi (saf hesap, durum tutmaz). terrain.ts bütün ızgarayı tek seferde, tarayıcıda açılışta ise
// terrainWorker.ts satır dilimlerini birkaç işçide paralel üretir. Aynı işlev aynı motorda bit bit aynı sonucu verir:
// 300 km arazisi eski kayıtlar için birebir korunur, burada sonucu değiştiren bir kısaltma yapılmaz.

import { clamp, smoothstep } from '../core/math';
import { LAND_POINTS, MAP_HALF as HALF, MAP_SCALE, MAP_SIZE, setMapPlaces } from './mapData';
import type { MapDef } from './maps';

/** Izgara: her büyüklükte 2048 hücre (terrain.ts). */
export const TERRAIN_N = 2048;
export const TERRAIN_W = TERRAIN_N + 1;

/** Haritanın yerlerini kur (mapData canlı bağları); hücre boyunu döndür. */
export function prepareMap(def: MapDef, size: number): number {
  setMapPlaces(def.id, size, def.sites, def.cities, def.extraLand);
  return MAP_SIZE / TERRAIN_N;
}

/**
 * j0 ≤ j < j1 satırlarının yükseklikleri: doğal yükseklik + üs/şehir ovalarının düzleştirilmesi. out satır j0'dan
 * başlar (out[(j − j0) · TERRAIN_W + i]). Önce prepareMap çağrılmış olmalı.
 */
export function fillRows(def: MapDef, cell: number, j0: number, j1: number, out: Float32Array): void {
  const k = MAP_SCALE;
  const pts = LAND_POINTS;
  const targets = pts.map((p) => clamp(def.natural(p.x, p.z, k), 40, 320));
  for (let j = j0; j < j1; j++) {
    const z = -HALF + j * cell;
    for (let i = 0; i < TERRAIN_W; i++) {
      const x = -HALF + i * cell;
      let m = def.natural(x, z, k);
      for (let q = 0; q < pts.length; q++) {
        const p = pts[q];
        const dx = x - p.x;
        const dz = z - p.z;
        const r2 = p.r * p.r;
        if (Math.abs(dx) > p.r * 3 || Math.abs(dz) > p.r * 3) continue;
        const dd = (dx * dx + dz * dz) / r2;
        if (dd > 8) continue;
        const k = smoothstep(0, 1, Math.exp(-dd) * 1.3);
        m += (targets[q] - m) * k;
      }
      out[(j - j0) * TERRAIN_W + i] = m;
    }
  }
}
