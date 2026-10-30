// İşçi: haritanın bir satır diliminin yüksekliklerini ve arazi örtüsünü üretir (mapLoad.ts). terrain.ts'i içe aktarmaz
// (yalnız saf hesap modülleri): ana iş parçacığındaki tek seferlik üretimle aynı işlevler, aynı sonuç.

import { CITIES, MAP_BASE, MAP_HALF, TEAM_SITES } from '../sim/mapData';
import { mapById } from '../sim/maps';
import { TERRAIN_N, TERRAIN_W, fillRows, prepareMap } from '../sim/terrainGen';
import { type LandcoverGrids, fillLandcover } from './landcoverGen';

export interface MapJob { id: string; size: number; j0: number; j1: number }
export interface MapPart { j0: number; heights: Float32Array; lc: LandcoverGrids }

self.onmessage = (e: MessageEvent<MapJob>) => {
  const { id, size, j0, j1 } = e.data;
  const def = mapById(id);
  const cell = prepareMap(def, size);
  // Eğim için komşu satırlar da gerekir (kenarda kırpılır)
  const a = Math.max(0, j0 - 1);
  const b = Math.min(TERRAIN_W, j1 + 1);
  const h = new Float32Array((b - a) * TERRAIN_W);
  fillRows(def, cell, a, b, h);
  const rows = (j1 - j0) * TERRAIN_W;
  const lc: LandcoverGrids = {
    forest: new Uint8Array(rows), field: new Uint8Array(rows), kind: new Uint8Array(rows),
    slope: new Float32Array(rows), urban: new Uint8Array(rows),
  };
  fillLandcover(h, a, j0, j1, {
    n: TERRAIN_N, w: TERRAIN_W, cell, half: MAP_HALF,
    cellK: MAP_BASE / TERRAIN_N / cell,
    cities: CITIES,
    statics: TEAM_SITES.map((t) => ({ x: t.site.x, z: t.site.z, r: 2600 })),
  }, lc);
  const heights = h.slice((j0 - a) * TERRAIN_W, (j1 - a) * TERRAIN_W);
  const part: MapPart = { j0, heights, lc };
  (self as unknown as Worker).postMessage(part, [heights.buffer, lc.forest.buffer, lc.field.buffer, lc.kind.buffer, lc.slope.buffer, lc.urban.buffer]);
};
