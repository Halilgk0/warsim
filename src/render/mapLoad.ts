// Açılışta haritanın paralel yüklenmesi: yükseklikler ve arazi örtüsü satır dilimleri hâlinde birkaç işçide üretilir
// (mapWorker.ts). Sonuç tek seferlik üretimle (terrain.ts loadMap + landcover.ts computeLandcover) birebir aynı; ana iş
// parçacığı bu sırada yükleme ekranını çizebilir. Yalnız dünya kurulmadan önce kullanılır (araziyi okuyan bir şey
// çalışmıyorken). İşçi açılamazsa tek seferde yüklenir.

import { TERRAIN_W, beginExternalLoad, endExternalLoad, heights, loadMap } from '../sim/terrain';
import { adoptLandcoverRows, landcoverReady } from './landcover';
import type { MapJob, MapPart } from './mapWorker';

export async function loadMapParallel(id: string, size: number): Promise<void> {
  if (typeof Worker === 'undefined') {
    loadMap(id, size);
    return;
  }
  if (!beginExternalLoad(id, size)) return;
  const n = Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4));
  try {
    await Promise.all(Array.from({ length: n }, (_, w) => new Promise<void>((resolve, reject) => {
      const job: MapJob = { id, size, j0: Math.floor((TERRAIN_W * w) / n), j1: Math.floor((TERRAIN_W * (w + 1)) / n) };
      const worker = new Worker(new URL('./mapWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<MapPart>) => {
        heights.set(e.data.heights, e.data.j0 * TERRAIN_W);
        adoptLandcoverRows(e.data.j0, e.data.lc);
        worker.terminate();
        resolve();
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      worker.postMessage(job);
    })));
  } catch (e) {
    console.warn('harita işçileri açılamadı, tek seferde yükleniyor', e);
    loadMap(id, size);
    return;
  }
  endExternalLoad(id, size);
  landcoverReady();
}
