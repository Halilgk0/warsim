// Yapıyı araziye oturtma (eğime göre inşa). Simülasyon yapının altını düzleştirir (structure.ts flattenStructure), ama
// düz alanın kenarındaki geçişte kalan parçalar ve sonradan yanına kurulan yapının düzleştirmesiyle arazisi değişen
// binalar havada kalabilir ya da gömülebilir. Burada ArchBatch ağlarının parça bilgisiyle (userData.parts) parçalar
// araziye indirilir:
// - İnce ve geniş parçalar (arsa, yol, pist, çit, araç): her köşe arazinin eğimini izler.
// - Yere değen gövdeler (duvar, ağaç, sütun): parça merkezindeki arazi farkı kadar bütün olarak kayar; alt köşeler
//   arazi daha aşağıdaysa toprağa kadar uzar (yokuş aşağı yanda temel görünür, havada kalmaz; yokuş yukarı yan gömülür).
// - Yerden yüksek parçalar (çatı, baca, üst kat): merkezinin altındaki en küçük gövdenin kaymasını alır, binayla
//   birlikte kayar.
// Düz zeminde fark sıfırdır, bir şey değişmez. Yalnız görüntü: simülasyon (isabet, görüş) yapının kendi yüksekliğini
// kullanır.

import type * as THREE from 'three';
import { groundLevel } from '../sim/terrain';

/** Parça bilgisi: 7 sayı (köşe sayısı, sınır kutusu en küçük ve en büyük köşesi). */
const STRIDE = 7;
/** Yere değen parça: alt yüzü yapı tabanına bu kadar yakın. */
const GROUND_Y = 0.6;
/** İnce parça (köşeleri eğimi izler): bu kadar alçak ve bundan geniş. */
const THIN_H = 1.6;
const THIN_W = 2.5;

/** Yapı grubunun doğrudan ArchBatch ağlarını araziye oturtur. baseY: yapının (grubun) yüksekliği. */
export function groundStructure(group: THREE.Group, baseY: number): void {
  group.updateMatrixWorld(true);
  for (const o of group.children) {
    const mesh = o as THREE.Mesh;
    const meta = mesh.userData?.parts as Float32Array | undefined;
    if (!mesh.isMesh || !meta) continue;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const e = mesh.matrixWorld.elements;
    // Yerel (x, z) noktasında arazinin yapı tabanına göre farkı
    const f = (x: number, z: number): number => groundLevel(e[0] * x + e[8] * z + e[12], e[2] * x + e[10] * z + e[14]) - baseY;
    const parts = meta.length / STRIDE;
    // Hiç oynatılmamış ağda önce bak: yere değen parçaların köşe ve merkezleri düz zemindeyse iş yok (çoğu yapı; kopya da
    // tutulmaz)
    if (!mesh.userData.orig) {
      let need = false;
      for (let p = 0; p < parts && !need; p++) {
        const k = p * STRIDE;
        if (meta[k + 2] >= GROUND_Y) continue;
        // Büyük parçada (geniş asfalt, arsa) yalnız köşelere bakmak ortadaki tümseği kaçırır: ızgarayla örnekle
        const big = Math.max(meta[k + 4] - meta[k + 1], meta[k + 6] - meta[k + 3]) > 30;
        const nS = big ? 6 : 2;
        for (let ix = 0; ix <= nS && !need; ix++) {
          for (let iz = 0; iz <= nS && !need; iz++) {
            const x = meta[k + 1] + ((meta[k + 4] - meta[k + 1]) * ix) / nS;
            const z = meta[k + 3] + ((meta[k + 6] - meta[k + 3]) * iz) / nS;
            if (Math.abs(f(x, z)) > 0.02) need = true;
          }
        }
      }
      if (!need) continue;
    }
    const orig: Float32Array = (mesh.userData.orig ??= arr.slice()) as Float32Array;
    const offs = new Float32Array(parts);
    const kind = new Uint8Array(parts); // 0 yüksek, 1 gövde, 2 ince
    let moved = false;
    // Önce yere değenler
    let v = 0;
    for (let p = 0; p < parts; p++) {
      const k = p * STRIDE;
      const n = meta[k];
      const [x0, y0, z0, x1, y1, z1] = [meta[k + 1], meta[k + 2], meta[k + 3], meta[k + 4], meta[k + 5], meta[k + 6]];
      if (y0 < GROUND_Y) {
        if (y1 - y0 < THIN_H && Math.max(x1 - x0, z1 - z0) > THIN_W) {
          kind[p] = 2;
          for (let i = v; i < v + n; i++) {
            const d = f(orig[i * 3], orig[i * 3 + 2]);
            arr[i * 3 + 1] = orig[i * 3 + 1] + d;
            if (Math.abs(d) > 0.02) moved = true;
          }
        } else {
          kind[p] = 1;
          const o2 = f((x0 + x1) / 2, (z0 + z1) / 2);
          offs[p] = o2;
          for (let i = v; i < v + n; i++) {
            const y = orig[i * 3 + 1];
            let ny = y + o2;
            // Alt köşe: arazi daha aşağıdaysa toprağa kadar uzar
            if (y - y0 < 0.05) ny = Math.min(ny, y + f(orig[i * 3], orig[i * 3 + 2]));
            arr[i * 3 + 1] = ny;
            if (Math.abs(ny - y) > 0.02) moved = true;
          }
        }
      }
      v += n;
    }
    // Sonra yüksekte duranlar: merkezlerinin altındaki en küçük gövdenin kayması
    v = 0;
    for (let p = 0; p < parts; p++) {
      const k = p * STRIDE;
      const n = meta[k];
      if (kind[p] === 0) {
        const cx = (meta[k + 1] + meta[k + 4]) / 2;
        const cz = (meta[k + 3] + meta[k + 6]) / 2;
        let best = -1;
        let area = Infinity;
        for (let q = 0; q < parts; q++) {
          if (kind[q] !== 1) continue;
          const m = q * STRIDE;
          if (cx < meta[m + 1] || cx > meta[m + 4] || cz < meta[m + 3] || cz > meta[m + 6]) continue;
          const a = (meta[m + 4] - meta[m + 1]) * (meta[m + 6] - meta[m + 3]);
          if (a < area) {
            area = a;
            best = q;
          }
        }
        const o2 = best >= 0 ? offs[best] : f(cx, cz);
        for (let i = v; i < v + n; i++) arr[i * 3 + 1] = orig[i * 3 + 1] + o2;
        if (Math.abs(o2) > 0.02) moved = true;
      }
      v += n;
    }
    if (moved || mesh.userData.grounded) {
      pos.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
      mesh.geometry.computeBoundingBox();
    }
    mesh.userData.grounded = moved;
  }
}
