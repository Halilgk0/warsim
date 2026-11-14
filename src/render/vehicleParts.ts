// Sivil araçların parçaları (1940'lar): binek otomobil, kapalı kasa kamyonet, açık kasa kamyonet. Hem arsalarda park
// eden araçlar (cityModels.ts) hem yollarda dolaşan trafik (traffic.ts) bunu kullanır. Parçalar yapı yığınına eklenir
// (arch.ts: boyalı metalde kenar aşınması). Yerel eksen: burun +z, tekerlek altı y = 0.

import * as THREE from 'three';
import { BOX } from './props';
import { SURF, type ArchBatch, type Surf } from './arch';

export type AutoKind = 'sedan' | 'van' | 'pickup';

const BLACK = 0x17181a;
const CHROME = 0xb4b7ba;
const GLASS = 0x2f3c46;

/** Aracı (x, y, z) noktasına, ry yönüne kurar. */
export function autoParts(b: ArchBatch, kind: AutoKind, color: number, x: number, z: number, ry = 0, y = 0): void {
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  // Yerel (lx, lz) → dünya (Y etrafında ry)
  const px = (lx: number, lz: number): number => x + lx * cs + lz * sn;
  const pz = (lx: number, lz: number): number => z - lx * sn + lz * cs;
  const box = (sx: number, sy: number, sz: number, lx: number, ly: number, lz: number, col: number, surf: Surf = SURF.metal): void => {
    b.add(BOX, sx, sy, sz, px(lx, lz), y + ly, pz(lx, lz), ry, col, surf);
  };
  const cyl = (g: THREE.BufferGeometry, lx: number, ly: number, lz: number, col: number, surf: Surf = SURF.metal): void => {
    b.push(g, col, surf, ry, px(lx, lz), y + ly, pz(lx, lz));
  };
  const wheel = (lx: number, lz: number, r: number, w: number): void => {
    cyl(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), lx, r, lz, BLACK, SURF.plain);
    cyl(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.03, 8).rotateZ(Math.PI / 2), lx, r, lz, CHROME);
  };
  const front = (w: number, hoodY: number, zf: number): void => {
    box(w * 0.5, 0.42, 0.06, 0, hoodY - 0.5, zf, CHROME);
    for (const s of [-1, 1]) {
      cyl(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 10).rotateX(Math.PI / 2), s * w * 0.4, hoodY - 0.28, zf - 0.02, 0xe8e0c0, SURF.plain);
      box(0.1, 0.1, 0.04, s * w * 0.4, hoodY - 0.5, zf + 0.02, 0xc8a040, SURF.plain);
    }
    box(w + 0.1, 0.1, 0.1, 0, 0.34, zf + 0.12, CHROME);
  };
  if (kind === 'sedan') {
    const w = 1.62;
    box(w - 0.3, 0.14, 4.1, 0, 0.3, 0, BLACK, SURF.plain);
    for (const lz of [1.3, -1.25]) {
      for (const s of [-1, 1]) {
        wheel(s * (w / 2 - 0.06), lz, 0.34, 0.2);
        // Çamurluk: tekerin üstünde kavis yerine üç parça
        box(0.3, 0.07, 0.95, s * (w / 2 - 0.02), 0.72, lz, color);
        box(0.3, 0.3, 0.07, s * (w / 2 - 0.02), 0.45, lz + 0.5, color);
        box(0.3, 0.3, 0.07, s * (w / 2 - 0.02), 0.45, lz - 0.5, color);
      }
    }
    for (const s of [-1, 1]) box(0.2, 0.05, 1.5, s * (w / 2 + 0.02), 0.34, 0.02, BLACK, SURF.plain);
    // Kaput (öne doğru daralan iki basamak), gövde, bagaj
    box(w - 0.5, 0.5, 1.25, 0, 0.44, 1.5, color);
    box(w - 0.7, 0.1, 1.2, 0, 0.94, 1.5, color);
    box(w - 0.12, 0.62, 2.1, 0, 0.44, -0.1, color);
    box(w - 0.3, 0.5, 0.85, 0, 0.44, -1.5, color);
    box(w - 0.5, 0.12, 0.6, 0, 0.94, -1.42, color);
    // Kabin: cam kuşağı, direkler, tavan
    box(w - 0.22, 0.42, 1.75, 0, 1.06, -0.2, GLASS, SURF.plain);
    for (const lz of [0.66, -0.2, -1.06]) for (const s of [-1, 1]) box(0.06, 0.44, 0.07, s * (w / 2 - 0.1), 1.06, lz, color);
    box(w - 0.2, 0.09, 1.85, 0, 1.48, -0.2, color);
    front(w, 1.0, 2.14);
    box(w + 0.06, 0.09, 0.1, 0, 0.36, -2.0, CHROME);
    for (const s of [-1, 1]) box(0.09, 0.09, 0.04, s * (w / 2 - 0.2), 0.7, -1.94, 0xb0342a, SURF.plain);
    box(0.04, 0.05, 0.14, w / 2 - 0.06, 0.82, 0.25, CHROME);
    return;
  }
  // Kamyonet: uzun şasi, kaput ve kabin; arkada kapalı kasa (van) ya da açık kasa (pickup)
  const w = 1.8;
  box(w - 0.4, 0.16, 4.9, 0, 0.36, 0, BLACK, SURF.plain);
  for (const lz of [1.6, -1.45]) {
    for (const s of [-1, 1]) {
      wheel(s * (w / 2 - 0.06), lz, 0.4, 0.24);
      if (lz > 0) {
        box(0.32, 0.07, 1.05, s * (w / 2 - 0.02), 0.84, lz, color);
        box(0.32, 0.3, 0.07, s * (w / 2 - 0.02), 0.55, lz + 0.55, color);
      }
    }
  }
  box(w - 0.5, 0.55, 1.3, 0, 0.52, 1.8, color);
  box(w - 0.7, 0.08, 1.25, 0, 1.07, 1.8, color);
  front(w, 1.1, 2.47);
  box(w, 0.7, 1.2, 0, 0.52, 0.6, color);
  box(w - 0.1, 0.5, 1.05, 0, 1.22, 0.55, GLASS, SURF.plain);
  for (const lz of [1.06, 0.04]) for (const s of [-1, 1]) box(0.07, 0.52, 0.07, s * (w / 2 - 0.05), 1.22, lz, color);
  box(w + 0.02, 0.09, 1.25, 0, 1.72, 0.55, color);
  for (const s of [-1, 1]) box(0.2, 0.05, 1.1, s * (w / 2 + 0.04), 0.42, 0.6, BLACK, SURF.plain);
  if (kind === 'van') {
    box(w + 0.04, 1.45, 2.5, 0, 0.52, -1.3, color);
    box(w + 0.1, 0.07, 2.56, 0, 1.97, -1.3, 0xd8d0bc);
    for (const s of [-1, 1]) box(0.03, 0.5, 1.6, s * (w / 2 + 0.03), 1.1, -1.3, 0xd8d0bc, SURF.plain);
    box(0.04, 1.2, 0.03, 0, 0.6, -2.56, BLACK, SURF.plain);
    for (const s of [-1, 1]) box(0.06, 0.12, 0.04, s * 0.14, 1.15, -2.57, CHROME);
  } else {
    box(w, 0.12, 2.5, 0, 0.6, -1.3, 0x6e5238, SURF.wood);
    for (const s of [-1, 1]) box(0.06, 0.45, 2.5, s * (w / 2 - 0.03), 0.72, -1.3, 0x7a5e44, SURF.wood);
    box(w, 0.45, 0.06, 0, 0.72, -2.52, 0x7a5e44, SURF.wood);
    box(w, 0.75, 0.06, 0, 0.72, -0.08, 0x7a5e44, SURF.wood);
    // Yük: sandıklar ya da çuvallar
    box(0.9, 0.5, 0.8, -0.3, 0.72, -1.0, 0x9a7a55, SURF.wood);
    box(0.7, 0.4, 0.7, 0.4, 0.72, -1.9, 0x8a7458, SURF.wood);
    box(0.8, 0.3, 0.9, 0.35, 0.72, -0.85, 0x9a9278, SURF.canvas);
  }
  for (const s of [-1, 1]) box(0.09, 0.09, 0.04, s * (w / 2 - 0.2), 0.75, -2.58, 0xb0342a, SURF.plain);
}
