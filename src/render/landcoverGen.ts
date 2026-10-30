// Arazi örtüsü hesabı (saf, durum tutmaz): landcover.ts bütün ızgarayı ana iş parçacığında, açılışta ise harita
// işçileri (mapWorker.ts) satır dilimlerini paralel hesaplar. Aynı işlev aynı motorda aynı sonucu verir.

import { clamp, smoothstep } from '../core/math';
import { makeFbm } from '../core/noise';

/** Parsel renkleri: olgun buğday, yeşil ekin, sürülmüş toprak, çayır, kolza (sRGB 0-255). */
export const FIELD_COLORS: [number, number, number][] = [
  [212, 186, 104], [140, 172, 80], [150, 122, 88], [166, 190, 108], [216, 200, 86],
];

export interface Circle { x: number; z: number; r: number }

/** Köşe başına ızgaralar (0..1 değerliler 8 bit: 0..255). */
export interface LandcoverGrids {
  forest: Uint8Array;
  field: Uint8Array;
  kind: Uint8Array;
  slope: Float32Array;
  urban: Uint8Array;
}

/** Izgara ve harita bilgisi (terrain.ts / mapData canlı değerleri). */
export interface LandcoverMap {
  /** TERRAIN_N ve TERRAIN_W. */
  n: number;
  w: number;
  cell: number;
  half: number;
  /** 300 km hücresinin bu haritanın hücresine oranı (300 km'de 1, 150 km'de 2). */
  cellK: number;
  cities: readonly Circle[];
  /** Ana üs yerleri (orman ve tarla yok). */
  statics: readonly Circle[];
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

/**
 * j0 ≤ j < j1 satırlarının arazi örtüsü. heights satır hRow0'dan başlar ve komşu satırları (j − 1, j + 1; kenarda
 * kırpılır) da içermeli; out satır j0'dan başlar ve sıfırlanmış olmalı (deniz ve çok alçak köşeler yazılmaz).
 */
export function fillLandcover(heights: Float32Array, hRow0: number, j0: number, j1: number, map: LandcoverMap, out: LandcoverGrids): void {
  const { n: N, w: W, cell, half, cellK, cities, statics } = map;
  for (let j = j0; j < j1; j++) {
    const row = (j - hRow0) * W;
    for (let i = 0; i < W; i++) {
      const k = (j - j0) * W + i;
      const x = -half + i * cell;
      const z = -half + j * cell;
      const h = heights[row + i];
      const hx = heights[row + Math.min(i + 1, N)] - heights[row + Math.max(i - 1, 0)];
      const hz = heights[(Math.min(j + 1, N) - hRow0) * W + i] - heights[(Math.max(j - 1, 0) - hRow0) * W + i];
      const slope = Math.hypot(hx, hz) / (2 * cell);
      out.slope[k] = slope;
      if (h < 18) continue;
      // Şehir çevresinde orman açılmış, tarla yoğun
      let cityNear = 0;
      let cityClear = 1;
      let urban = 0;
      for (const c of cities) {
        // Uzak şehirler etkisiz (6 yarıçap ötesi)
        if (Math.abs(x - c.x) > c.r * 6 || Math.abs(z - c.z) > c.r * 6) continue;
        const d = Math.hypot(x - c.x, z - c.z);
        cityNear = Math.max(cityNear, 1 - smoothstep(c.r * 1.5, c.r * 6, d));
        cityClear = Math.min(cityClear, smoothstep(c.r * 1.05, c.r * 2.4, d));
        urban = Math.max(urban, 1 - smoothstep(c.r * 0.75, c.r * 1.15, d));
      }
      out.urban[k] = Math.round(urban * 255);
      let site = 1;
      for (const c of statics) {
        if (Math.abs(x - c.x) > c.r * 1.6 || Math.abs(z - c.z) > c.r * 1.6) continue;
        site = Math.min(site, smoothstep(c.r * 0.8, c.r * 1.6, Math.hypot(x - c.x, z - c.z)));
      }
      // Orman: büyük lekeler + küçük ayrıntı; tepelerde daha çok, çok dik yamaçta ve ağaç sınırı üstünde yok
      const n = fbmForest(x / 9000, z / 9000) * 0.8 + fbmForest2(x / 2400, z / 2400) * 0.35;
      const hill = 0.45 + 0.55 * smoothstep(120, 650, h);
      const treeLine = 1 - smoothstep(1650, 2050, h);
      const steep = 1 - smoothstep(0.75, 1.15, slope);
      const f = smoothstep(-0.02, 0.2, n) * hill * treeLine * steep * cityClear * site * (1 - cityNear * 0.55);
      out.forest[k] = Math.round(clamp(f, 0, 1) * 255);
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
        out.kind[k] = Math.floor(hash(cu, cv) * FIELD_COLORS.length);
        // Bazı parseller nadasta/çayır: tarla etkisi azalır
        if (hash(cv + 91, cu - 17) < 0.18) fv *= 0.3;
        out.field[k] = Math.round(clamp(fv, 0, 1) * 255);
      }
    }
  }
}
