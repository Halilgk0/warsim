// Şehir ve ekonomi yapılarının modelleri: ev, apartman bloğu, çarşı, iş merkezi, ambar, park, maden ocağı.
// Her yapı köşe renkli tek bir ağdır (tek çizim çağrısı). Yerel eksen: x enine, z boyuna, y yukarı; taban y=0.
// Ölçüler gerçeğe yakın (ev 9×10 m, apartman katı 3,1 m, ofis katı 3,4 m).

import * as THREE from 'three';
import type { StructureKind } from '../sim/structures/structure';
import { ARCH, BOX, Batch, CYL, DISC, GABLE, broadleafGeo, coniferGeo } from './props';

const C = {
  wall: [0xf3e9d9, 0xebdcc7, 0xe8d5cb, 0xdfe3d1, 0xf1e0cf, 0xe4dde8, 0xf0e4c6],
  roof: [0xd39a85, 0xc98f7d, 0xb9a3a0, 0xd8b48f, 0xa9aeb9, 0xcf8f7f],
  glass: 0x93abc2,
  glassLight: 0xb4c8d9,
  grass: 0xc9dfb0,
  hedge: 0xa3c58f,
  pave: 0xe6dfd2,
  road: 0xd2cbbf,
  water: 0xa6cedb,
  awning: [0xe9a58f, 0x9cc5b2, 0xe8c98a, 0xa9b8e0, 0xd9a3c3],
  car: [0xd98c7a, 0x8aa6d6, 0xe8d38a, 0xf2f2ee, 0x9a9aa6, 0x9cc5b2],
  metal: 0xb3b0b9,
  dark: 0x8d8994,
  crate: [0xc9a983, 0xa9b58f, 0xb8a58a],
  tree: [0x92c07f, 0x84b67c, 0x9dc68a, 0x7faf78],
};

const TREE_B = broadleafGeo(0xffffff);
const TREE_C = coniferGeo(0xffffff);

type Rng = () => number;
const pick = <T>(rng: Rng, a: T[]): T => a[Math.floor(rng() * a.length)];

/** Köşe renkleri ağaç geometrisinde beyazdır; ağaç rengi parça rengiyle çarpılır. */
function tree(b: Batch, mat: THREE.Material, rng: Rng, x: number, z: number, h = 7 + rng() * 5, conifer = rng() < 0.25): void {
  const g = (conifer ? TREE_C : TREE_B).clone();
  const col = new THREE.Color(pick(rng, C.tree));
  const c = g.getAttribute('color');
  // Gövde (koyu kahve) köşelerini koru: yalnız açık renkli (taç) köşeleri boya
  for (let i = 0; i < c.count; i++) {
    if (c.getX(i) > 0.9) c.setXYZ(i, col.r, col.g, col.b);
  }
  g.scale(h * (conifer ? 0.75 : 1), h, h * (conifer ? 0.75 : 1));
  g.rotateY(rng() * 6.28);
  g.translate(x, 0, z);
  b.push(mat, g);
}

function house(b: Batch, m: THREE.Material, rng: Rng): void {
  // Tek müstakil ev: bahçe, çit, patika, ağaç; bazen garaj ve araba
  b.add(BOX, m, 32, 0.3, 32, 0, -0.1, 0, 0, C.grass);
  const w = 9 + rng() * 2.5;
  const d = 10 + rng() * 2;
  const two = rng() < 0.45;
  const h = two ? 6.2 : 3.6;
  const wall = pick(rng, C.wall);
  const roof = pick(rng, C.roof);
  b.add(BOX, m, w, h, d, -2, 0, -2, 0, wall);
  b.add(GABLE, m, w + 1, 2.6 + rng() * 1.2, d + 1, -2, h, -2, rng() < 0.5 ? 0 : Math.PI / 2, roof);
  b.add(BOX, m, 0.8, 2.4, 0.8, -2 + w * 0.25, h + 0.8, -2 - d * 0.2, 0, C.dark);
  // Ön cephe: pencereler, kapı, sundurma
  const fz = -2 + d / 2 + 0.05;
  for (const x of [-2 - w * 0.28, -2 + w * 0.28]) b.add(BOX, m, 1.4, 1.1, 0.12, x, h * 0.5 - 0.4, fz, 0, C.glass);
  b.add(BOX, m, 1.1, 2.1, 0.14, -2, 0, fz, 0, roof);
  b.add(BOX, m, 3, 0.3, 2, -2, 2.4, fz + 1, 0, C.metal);
  b.add(BOX, m, 1.4, 0.32, 9, -2, 0, fz + 5, 0, C.pave);
  // Çit
  b.add(BOX, m, 32, 0.9, 0.3, 0, 0, 15.8, 0, C.hedge);
  b.add(BOX, m, 32, 0.9, 0.3, 0, 0, -15.8, 0, C.hedge);
  b.add(BOX, m, 0.3, 0.9, 32, 15.8, 0, 0, 0, C.hedge);
  b.add(BOX, m, 0.3, 0.9, 32, -15.8, 0, 0, 0, C.hedge);
  if (rng() < 0.5) {
    b.add(BOX, m, 4, 2.6, 6, 9, 0, 4, 0, wall);
    b.add(BOX, m, 2, 1.4, 4.4, 9, 0.4, 10, 0, pick(rng, C.car));
  }
  tree(b, m, rng, 10, -9, 8 + rng() * 4);
  if (rng() < 0.6) tree(b, m, rng, -11, -11, 6 + rng() * 3);
}

function apartment(b: Batch, m: THREE.Material, rng: Rng): void {
  // Dört katlı tek blok, otopark ve oyun alanı
  b.add(BOX, m, 60, 0.3, 44, 0, -0.1, 0, 0, C.pave);
  b.add(BOX, m, 58, 0.34, 12, 0, 0, 14, 0, C.grass);
  const floors = 4;
  const H = floors * 3.1;
  const wall = pick(rng, C.wall);
  b.add(BOX, m, 34, H, 13, -6, 0, -6, 0, wall);
  for (let f = 0; f < floors; f++) b.add(BOX, m, 32, 1.3, 13.3, -6, f * 3.1 + 1.05, -6, 0, C.glass);
  b.add(BOX, m, 34.6, 0.6, 13.6, -6, H, -6, 0, C.metal);
  b.add(BOX, m, 4, 2.6, 4, -14, H + 0.6, -6, 0, wall);
  // Balkonlar ve giriş
  for (let f = 1; f < floors; f++) for (const x of [-18, -6, 6]) b.add(BOX, m, 4, 0.25, 1.4, x, f * 3.1, 1.2, 0, C.metal);
  b.add(BOX, m, 3, 2.6, 1.6, -6, 0, 1.3, 0, pick(rng, C.roof));
  for (let i = 0; i < 5; i++) {
    if (rng() < 0.25) continue;
    b.add(BOX, m, 2, 1.4, 4.4, 18 + (i % 2) * 5, 0.4, -15 + Math.floor(i / 2) * 7, 0, pick(rng, C.car));
  }
  b.add(BOX, m, 8, 0.4, 7, 18, 0.2, 13, 0, 0xe8d7b0);
  for (let i = 0; i < 4; i++) tree(b, m, rng, -26 + i * 10, 16, 7 + rng() * 3, false);
}

function shops(b: Batch, m: THREE.Material, rng: Rng): void {
  b.add(BOX, m, 132, 0.3, 104, 0, -0.1, 0, 0, C.pave);
  for (const side of [-1, 1]) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const z = -45 + i * 15 + 7.5;
      const h = 6.5 + rng() * 2.5;
      const x = side * 46;
      const wall = pick(rng, C.wall);
      b.add(BOX, m, 14, h, 14.4, x, 0, z, 0, wall);
      b.add(BOX, m, 14.6, 0.7, 15, x, h, z, 0, C.metal);
      // Vitrin ve tente (meydana bakan yüz)
      const fx = x - side * 7.05;
      b.add(BOX, m, 0.12, 2.4, 10, fx, 0.4, z, 0, C.glassLight);
      b.add(BOX, m, 3.2, 0.3, 13, fx - side * 1.6, 3.2, z, 0, pick(rng, C.awning));
      b.add(BOX, m, 0.12, 1.2, 9, fx, 4.4, z, 0, C.glass);
    }
  }
  // Pazar meydanı: çeşme, tezgâhlar, ağaçlar
  b.add(DISC, m, 9, 0.6, 9, 0, 0, 0, 0, C.metal);
  b.add(DISC, m, 8, 0.65, 8, 0, 0.05, 0, 0, C.water);
  b.add(CYL, m, 0.8, 2.6, 0.8, 0, 0, 0, 0, C.metal);
  for (let i = 0; i < 10; i++) {
    const x = -24 + (i % 5) * 12;
    const z = (i < 5 ? -1 : 1) * 24;
    b.add(BOX, m, 4, 1.1, 3, x, 0, z, 0, C.crate[i % 3]);
    b.add(GABLE, m, 4.8, 1.2, 3.8, x, 2.2, z, Math.PI / 2, pick(rng, C.awning));
  }
  for (const [x, z] of [[-30, -44], [30, -44], [-30, 44], [30, 44]]) tree(b, m, rng, x, z, 9, false);
}

function office(b: Batch, m: THREE.Material, rng: Rng): void {
  b.add(BOX, m, 92, 0.3, 92, 0, -0.1, 0, 0, C.pave);
  b.add(BOX, m, 44, 7.5, 40, 0, 0, -8, 0, pick(rng, C.wall));
  b.add(BOX, m, 44.4, 2.6, 40.4, 0, 1.2, -8, 0, C.glassLight);
  const floors = 13 + Math.floor(rng() * 5);
  const H = floors * 3.4;
  const core = 0xe9e6ee;
  b.add(BOX, m, 22, H, 22, 0, 7.5, -8, 0, core);
  for (let f = 0; f < floors; f++) b.add(BOX, m, 22.6, 2.5, 22.6, 0, 7.5 + f * 3.4 + 0.5, -8, 0, f % 4 === 3 ? C.glassLight : C.glass);
  b.add(BOX, m, 23, 1, 23, 0, 7.5 + H, -8, 0, C.metal);
  b.add(BOX, m, 8, 3.4, 6, -4, 8.5 + H, -10, 0, C.metal);
  b.add(CYL, m, 0.3, 14, 0.3, 6, 8.5 + H, -4, 0, C.dark);
  // Meydan: çeşme ve ağaçlar
  b.add(DISC, m, 6, 0.5, 6, 0, 0, 30, 0, C.metal);
  b.add(DISC, m, 5.2, 0.55, 5.2, 0, 0.05, 30, 0, C.water);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    tree(b, m, rng, Math.cos(a) * 34, 26 + Math.sin(a) * 12, 8, false);
  }
  for (let i = 0; i < 6; i++) b.add(BOX, m, 2, 1.4, 4.4, 30, 0.4, -30 + i * 6, Math.PI / 2, pick(rng, C.car));
}

function depot(b: Batch, m: THREE.Material, rng: Rng): void {
  b.add(BOX, m, 164, 0.3, 124, 0, -0.1, 0, 0, C.road);
  const shell = 0xe2d8c6;
  for (let i = 0; i < 3; i++) {
    const x = -52 + i * 34;
    b.add(BOX, m, 26, 5, 70, x, 0, -10, 0, shell);
    b.add(ARCH, m, 13, 7, 70, x, 5, -10, 0, pick(rng, [0xc9c6cf, 0xbfb7aa, 0xb9c3c9]));
    b.add(BOX, m, 8, 4.4, 0.3, x, 0, 25.2, 0, C.dark);
  }
  // Yükleme sahası: sandık yığınları, kamyonlar
  for (let i = 0; i < 14; i++) {
    const x = -60 + (i % 7) * 14 + rng() * 4;
    const z = 40 + Math.floor(i / 7) * 12;
    const h = 1.2 + Math.floor(rng() * 3) * 1.2;
    b.add(BOX, m, 4, h, 4, x, 0, z, 0, pick(rng, C.crate));
  }
  for (let i = 0; i < 3; i++) {
    const x = 50 + i * 7;
    b.add(BOX, m, 2.4, 2.6, 7, x, 0.5, 40, 0, pick(rng, C.car));
    b.add(BOX, m, 2.3, 2.0, 2.2, x, 0.5, 45, 0, C.metal);
  }
  // Su kulesi ve büro
  for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) b.add(BOX, m, 0.5, 18, 0.5, 62 + dx, 0, -30 + dz, 0, C.dark);
  b.add(CYL, m, 4.5, 7, 4.5, 62, 18, -30, 0, C.metal);
  b.add(BOX, m, 14, 6, 10, 60, 0, 10, 0, pick(rng, C.wall));
  b.add(GABLE, m, 15, 2.5, 11, 60, 6, 10, Math.PI / 2, pick(rng, C.roof));
}

function park(b: Batch, m: THREE.Material, rng: Rng): void {
  b.add(DISC, m, 52, 0.3, 52, 0, -0.1, 0, 0, C.grass);
  b.add(BOX, m, 4, 0.4, 104, 0, 0, 0, 0.6, C.pave);
  b.add(BOX, m, 4, 0.4, 104, 0, 0, 0, -0.9, C.pave);
  b.add(DISC, m, 15, 0.42, 11, 18, 0, 14, 0, C.water);
  b.add(DISC, m, 4, 3.2, 4, -14, 0, -10, 0, 0xf2ece2);
  b.add(GABLE, m, 9, 2.6, 9, -14, 3.2, -10, 0, pick(rng, C.roof));
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = 10 + rng() * 38;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - 18, z - 14) < 17 || Math.hypot(x + 14, z + 10) < 7) continue;
    tree(b, m, rng, x, z, 7 + rng() * 6);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(BOX, m, 2, 0.6, 0.6, Math.cos(a) * 26, 0.2, Math.sin(a) * 26, a, C.crate[0]);
  }
}

/** İki nokta arasında dikdörtgen kesitli kiriş (halat, eğik destek, konveyör). */
function beam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, h = w): THREE.BufferGeometry {
  const a = new THREE.Vector3(x0, y0, z0);
  const e = new THREE.Vector3(x1, y1, z1);
  const g = new THREE.BoxGeometry(w, h, a.distanceTo(e));
  g.lookAt(e.clone().sub(a));
  const mid = a.add(e).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

const CONE = new THREE.ConeGeometry(1, 1, 9).translate(0, 0.5, 0);

function mine(b: Batch, m: THREE.Material, rng: Rng): void {
  // Maden ocağı: kuyu kulesi, vinç dairesi, cevher hazırlama tesisi, konveyör, siloslar, pasa yığınları, vagonlu ray
  const steel = C.dark;
  const brick = pick(rng, [0xcf9f88, 0xc4a08c, 0xd2ab92]);
  const plant = pick(rng, [0xd9d2c4, 0xcfd3d6, 0xe0d6c2]);
  const roof = pick(rng, [0xa9aeb9, 0xb9a3a0]);
  b.add(BOX, m, 140, 0.3, 110, 0, -0.1, 0, 0, 0xd8c9ab);
  // Kuyu kulesi (çelik kafes) ve kuyu ağzı binası
  const hx = -15;
  const hz = -5;
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) b.add(BOX, m, 0.7, 28, 0.7, hx + dx, 0, hz + dz, 0, steel);
  for (let y = 7; y < 28; y += 5) {
    b.add(BOX, m, 6.7, 0.35, 0.35, hx, y, hz - 3, 0, steel);
    b.add(BOX, m, 6.7, 0.35, 0.35, hx, y, hz + 3, 0, steel);
    b.add(BOX, m, 0.35, 0.35, 6.7, hx - 3, y, hz, 0, steel);
    b.add(BOX, m, 0.35, 0.35, 6.7, hx + 3, y, hz, 0, steel);
  }
  b.add(BOX, m, 8, 1.2, 8, hx, 28, hz, 0, steel);
  for (const dx of [-3, 3]) b.push(m, beam(hx + dx, 27, hz + 2.5, hx + dx * 1.5, 0, hz + 19, 0.7), steel);
  for (const dx of [-1.6, 1.6]) b.push(m, new THREE.CylinderGeometry(2.6, 2.6, 0.4, 14).rotateZ(Math.PI / 2).translate(hx + dx, 31.6, hz), steel);
  b.add(BOX, m, 13, 7, 13, hx, 0, hz, 0, brick);
  b.add(GABLE, m, 14, 3, 14, hx, 7, hz, 0, roof);
  // Vinç dairesi, baca ve halatlar
  b.add(BOX, m, 16, 10, 14, hx, 0, hz + 30, 0, brick);
  b.add(GABLE, m, 17, 4, 15, hx, 10, hz + 30, Math.PI / 2, roof);
  for (const x of [hx - 4, hx + 4]) b.add(BOX, m, 2.2, 3, 0.12, x, 5, hz + 22.95, 0, C.glass);
  b.add(CYL, m, 1.3, 32, 1.3, hx + 11, 0, hz + 37, 0, brick);
  b.add(CYL, m, 1.6, 1.2, 1.6, hx + 11, 32, hz + 37, 0, steel);
  for (const dx of [-1.6, 1.6]) b.push(m, beam(hx + dx, 33.5, hz, hx + dx, 9, hz + 23, 0.15), steel);
  // Cevher hazırlama tesisi: yamaca basamaklı binalar
  const mx = 26;
  const mz = -25;
  const steps: [number, number, number][] = [[0, 16, 20], [18, 11, 18], [33, 7, 15]];
  for (const [dx, h, d] of steps) {
    b.add(BOX, m, 19, h, d, mx + dx, 0, mz + (20 - d) / 2, 0, plant);
    b.add(BOX, m, 19.6, 0.6, d + 0.6, mx + dx, h, mz + (20 - d) / 2, 0, roof);
    for (let k = -1; k <= 1; k++) b.add(BOX, m, 3.4, 2, 0.12, mx + dx + k * 5.5, h * 0.55, mz + 10.05, 0, C.glass);
  }
  b.add(BOX, m, 5, 6, 5, mx - 3, 16, mz - 2, 0, plant);
  // Konveyör: kuyu ağzından tesisin tepesine
  b.push(m, beam(hx + 6.5, 6, hz, mx - 9.5, 19, mz + 2, 2.2, 1.6), steel);
  for (const t of [0.3, 0.65]) {
    const x = hx + 6.5 + (mx - 9.5 - hx - 6.5) * t;
    const z = hz + (mz + 2 - hz) * t;
    b.add(BOX, m, 0.6, 6 + 13 * t, 0.6, x, 0, z, 0, steel);
  }
  // Cevher siloları ve yükleme rampası
  for (const x of [22, 31]) {
    b.add(CYL, m, 4, 13, 4, x, 3, 10, 0, plant);
    b.push(m, CONE.clone().scale(4, 2.5, 4).translate(x, 16, 10), roof);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) b.add(BOX, m, 0.5, 3, 0.5, x + dx, 0, 10 + dz, 0, steel);
  }
  // Ray, cevher vagonları, kamyonlar
  b.add(BOX, m, 3, 0.4, 72, 26.5, 0, 26, 0, C.road);
  b.add(BOX, m, 0.2, 0.55, 72, 25.8, 0, 26, 0, steel);
  b.add(BOX, m, 0.2, 0.55, 72, 27.2, 0, 26, 0, steel);
  for (let i = 0; i < 6; i++) b.add(BOX, m, 2.2, 1.6, 3, 26.5, 0.5, 18 + i * 4, 0, pick(rng, [0xb07a5e, 0xa3866e, 0x8f7b6b]));
  for (let i = 0; i < 3; i++) {
    const x = 40 + i * 6;
    b.add(BOX, m, 2.6, 2.2, 6.5, x, 0.5, 22, 0, pick(rng, C.car));
    b.add(BOX, m, 2.5, 1.4, 4, x, 2.7, 21, 0, 0x9e938a);
  }
  // Pasa yığınları
  const spoil = [0x9e938a, 0xa89c8e, 0xb0a08a];
  for (const [x, z, r, h] of [[-48, 28, 20, 13], [-50, -32, 15, 9], [56, 38, 11, 7]]) {
    b.push(m, CONE.clone().scale(r, h, r * 0.85).rotateY(rng() * 3).translate(x, 0, z), pick(rng, spoil));
  }
  // Yönetim ve soyunma binası
  b.add(BOX, m, 14, 5, 9, 52, 0, 12, 0, pick(rng, C.wall));
  b.add(GABLE, m, 15, 2.4, 10, 52, 5, 12, Math.PI / 2, pick(rng, C.roof));
  // Çevre çiti
  b.add(BOX, m, 140, 1.8, 0.25, 0, 0, 54.5, 0, steel);
  b.add(BOX, m, 140, 1.8, 0.25, 0, 0, -54.5, 0, steel);
  b.add(BOX, m, 0.25, 1.8, 110, 69.5, 0, 0, 0, steel);
  b.add(BOX, m, 0.25, 1.8, 110, -69.5, 0, 0, 0, steel);
}

/** Şehir yapısının köşe renkli tek ağını verilen gruba ekler. */
export function buildCityModel(kind: StructureKind, rng: Rng, mat: THREE.Material, into: THREE.Object3D): void {
  const b = new Batch();
  switch (kind) {
    case 'house': house(b, mat, rng); break;
    case 'apartment': apartment(b, mat, rng); break;
    case 'shops': shops(b, mat, rng); break;
    case 'office': office(b, mat, rng); break;
    case 'depot': depot(b, mat, rng); break;
    case 'park': park(b, mat, rng); break;
    case 'mine': mine(b, mat, rng); break;
    default: break;
  }
  b.build(into);
}
