// Şehir ve ekonomi yapılarının modelleri: ev, apartman bloğu, çarşı, iş merkezi, ambar, park, maden ocağı.
// Parçalar gerçek malzemeleriyle yapının tek ağına eklenir (arch.ts): sıvalı ve tuğla duvarlar pencereli (pencereler
// gölgelendiricide duvara ortalanır), kiremit ve arduvaz çatılar, cam cephe, oluklu sac, kaldırım taşı, çim.
// Yerel eksen: x enine, z boyuna, y yukarı; taban y=0. Ölçüler gerçeğe yakın (ev 9×10 m, apartman katı 3,1 m).

import * as THREE from 'three';
import type { StructureKind } from '../sim/structures/structure';
import { ARCH, BOX, CYL, DISC, GABLE, broadleafGeo, coniferGeo } from './props';
import { SURF, type ArchBatch, type Surf } from './arch';

const C = {
  // Sıva: beyaz, krem, aşı boyası, açık gri, soluk sarı (Avrupa kasabası)
  wall: [0xe8e2d4, 0xdccfb2, 0xc9a77e, 0xcfcbc2, 0xe1d3a6, 0xd6c3b0],
  brick: [0x9a5640, 0x8c4d3a, 0xa86a50],
  // Kiremit (kızıl, kahve) ve arduvaz (koyu gri)
  roof: [0xa45838, 0x8e4a32, 0xb06844, 0x5a5e66, 0x6a5a50],
  grass: 0x6e8a48,
  hedge: 0x4d6a34,
  pave: 0xb3ab9c,
  road: 0x5f6062,
  water: 0x4a6a78,
  awning: [0xa8463c, 0x3e6a52, 0xc89a3e, 0x3e5684, 0x8a3e6a],
  car: [0x2d2e30, 0x5a5f4a, 0x6e2e28, 0x3a4a5e, 0x8a8478, 0x4a3a2e],
  metal: 0x7c8084,
  dark: 0x45484c,
  crate: [0x9a7a55, 0x7e6a4a, 0x8a7458],
  tree: [0x5e8a44, 0x527e3e, 0x6a9450, 0x4c7438],
  glass: 0x5d6b78,
  concrete: 0xaaa69d,
  felt: 0x4a4b50,
  corrugated: 0x8a8f8c,
};

const TREE_B = broadleafGeo(0xffffff);
const TREE_C = coniferGeo(0xffffff);

type Rng = () => number;
const pick = <T>(rng: Rng, a: T[]): T => a[Math.floor(rng() * a.length)];

/** Kısaltma: birim geometri, ölçek, konum, Y dönüşü, renk, yüzey. */
const A = (b: ArchBatch, geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry: number, color: number, surf: Surf) =>
  b.add(geo, sx, sy, sz, x, y, z, ry, color, surf);

/** Ağaç: taç rengi parça rengiyle, gövde kahve (köşe renkleri korunur). */
function tree(b: ArchBatch, rng: Rng, x: number, z: number, h = 7 + rng() * 5, conifer = rng() < 0.25): void {
  const g = (conifer ? TREE_C : TREE_B).clone();
  const col = new THREE.Color(pick(rng, C.tree));
  const c = g.getAttribute('color');
  for (let i = 0; i < c.count; i++) {
    if (c.getX(i) > 0.9) c.setXYZ(i, col.r, col.g, col.b);
  }
  g.scale(h * (conifer ? 0.75 : 1), h, h * (conifer ? 0.75 : 1));
  g.rotateY(rng() * 6.28);
  g.translate(x, 0, z);
  b.push(g, null, SURF.plain);
}

/** Araba: gövde ve kabin (boyalı metal), koyu camlar. */
function car(b: ArchBatch, rng: Rng, x: number, z: number, ry = 0): void {
  const col = pick(rng, C.car);
  const dx = Math.sin(ry);
  const dz = Math.cos(ry);
  A(b, BOX, 1.8, 0.8, 4.3, x, 0.3, z, ry, col, SURF.metal);
  A(b, BOX, 1.6, 0.6, 2.2, x - dx * 0.3, 1.1, z - dz * 0.3, ry, C.glass, SURF.metal);
}

function house(b: ArchBatch, rng: Rng): void {
  // Tek müstakil ev: bahçe, çit, patika, ağaç; bazen garaj ve araba
  A(b, BOX, 32, 0.3, 32, 0, -0.1, 0, 0, C.grass, SURF.grass);
  const w = 9 + rng() * 2.5;
  const d = 10 + rng() * 2;
  const two = rng() < 0.45;
  const h = two ? 6.2 : 3.6;
  const brick = rng() < 0.3;
  const wall = brick ? pick(rng, C.brick) : pick(rng, C.wall);
  const roof = pick(rng, C.roof);
  // Duvar pencerelerini gölgelendirici çizer (ortalanmış, köşelerden uzak)
  A(b, BOX, w, h, d, -2, 0, -2, 0, wall, brick ? SURF.brickWin : SURF.plasterWin);
  A(b, BOX, w + 0.3, 0.45, d + 0.3, -2, 0, -2, 0, 0x8d877c, SURF.concrete);
  // Beşik çatı: mahya ya boyuna ya enine (döndürülünce ölçüler yer değiştirir)
  const across = rng() < 0.5;
  const rh = 2.6 + rng() * 1.2;
  if (across) A(b, GABLE, d + 1, rh, w + 1, -2, h, -2, Math.PI / 2, roof, SURF.tile);
  else A(b, GABLE, w + 1, rh, d + 1, -2, h, -2, 0, roof, SURF.tile);
  A(b, BOX, 0.8, 2.4, 0.8, -2 + w * 0.25, h + 0.8, -2 - d * 0.2, 0, pick(rng, C.brick), SURF.brick);
  // Ön cephe: ahşap kapı, sundurma, taş patika
  const fz = -2 + d / 2 + 0.05;
  A(b, BOX, 1.1, 2.1, 0.14, -2, 0, fz, 0, 0x5a3e2a, SURF.wood);
  A(b, BOX, 3, 0.3, 2, -2, 2.4, fz + 1, 0, roof, SURF.tile);
  A(b, BOX, 1.4, 0.32, 9, -2, 0, fz + 5, 0, C.pave, SURF.paving);
  // Çit (çalı)
  A(b, BOX, 32, 0.9, 0.5, 0, 0, 15.8, 0, C.hedge, SURF.grass);
  A(b, BOX, 32, 0.9, 0.5, 0, 0, -15.8, 0, C.hedge, SURF.grass);
  A(b, BOX, 0.5, 0.9, 32, 15.8, 0, 0, 0, C.hedge, SURF.grass);
  A(b, BOX, 0.5, 0.9, 32, -15.8, 0, 0, 0, C.hedge, SURF.grass);
  if (rng() < 0.5) {
    A(b, BOX, 4, 2.6, 6, 9, 0, 4, 0, wall, SURF.plaster);
    A(b, BOX, 4.4, 0.25, 6.4, 9, 2.6, 4, 0, C.felt, SURF.felt);
    car(b, rng, 9, 10);
  }
  tree(b, rng, 10, -9, 8 + rng() * 4);
  if (rng() < 0.6) tree(b, rng, -11, -11, 6 + rng() * 3);
}

function apartment(b: ArchBatch, rng: Rng): void {
  // Dört katlı tek blok (pencereli sıva), düz keçe çatı, balkonlar, otopark ve oyun alanı
  A(b, BOX, 60, 0.3, 44, 0, -0.1, 0, 0, C.road, SURF.asphalt);
  A(b, BOX, 58, 0.34, 12, 0, 0, 14, 0, C.grass, SURF.grass);
  const floors = 4;
  const H = floors * 3.1;
  const wall = pick(rng, C.wall);
  A(b, BOX, 34, H, 13, -6, 0, -6, 0, wall, SURF.aptWin);
  A(b, BOX, 34.6, 0.6, 13.6, -6, H, -6, 0, C.concrete, SURF.concrete);
  A(b, BOX, 34.2, 0.5, 13.2, -6, H + 0.1, -6, 0, C.felt, SURF.felt);
  A(b, BOX, 4, 2.6, 4, -14, H + 0.6, -6, 0, wall, SURF.plaster);
  // Balkonlar (beton, demir korkuluk) ve giriş saçağı
  for (let f = 1; f < floors; f++) {
    for (const x of [-18, -6, 6]) {
      A(b, BOX, 4, 0.25, 1.4, x, f * 3.1, 1.2, 0, C.concrete, SURF.concrete);
      A(b, BOX, 4, 0.9, 0.06, x, f * 3.1 + 0.25, 1.88, 0, C.dark, SURF.metal);
    }
  }
  A(b, BOX, 3, 0.3, 1.8, -6, 2.6, 1.3, 0, C.concrete, SURF.concrete);
  A(b, BOX, 1.6, 2.3, 0.15, -6, 0, 0.55, 0, 0x5a3e2a, SURF.wood);
  for (let i = 0; i < 5; i++) {
    if (rng() < 0.25) continue;
    car(b, rng, 18 + (i % 2) * 5, -15 + Math.floor(i / 2) * 7);
  }
  A(b, BOX, 8, 0.4, 7, 18, 0.2, 13, 0, 0xc8b48a, SURF.earth);
  for (let i = 0; i < 4; i++) tree(b, rng, -26 + i * 10, 16, 7 + rng() * 3, false);
}

function shops(b: ArchBatch, rng: Rng): void {
  A(b, BOX, 132, 0.3, 104, 0, -0.1, 0, 0, C.pave, SURF.paving);
  for (const side of [-1, 1]) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const z = -45 + i * 15 + 7.5;
      const h = 6.5 + rng() * 2.5;
      const x = side * 46;
      const brick = rng() < 0.35;
      const wall = brick ? pick(rng, C.brick) : pick(rng, C.wall);
      // Üst kat pencereli, zemin katta vitrin camı ve tente
      A(b, BOX, 14, h, 14.4, x, 0, z, 0, wall, brick ? SURF.brickWin : SURF.plasterWin);
      A(b, BOX, 14.6, 0.7, 15, x, h, z, 0, C.concrete, SURF.concrete);
      A(b, GABLE, 14.4, 2.2, 15, x, h + 0.7, z, 0, pick(rng, C.roof), SURF.tile);
      const fx = x - side * 7.05;
      A(b, BOX, 0.12, 2.6, 11, fx, 0.3, z, 0, C.glass, SURF.curtain);
      A(b, BOX, 3.2, 0.3, 13, fx - side * 1.6, 3.2, z, 0, pick(rng, C.awning), SURF.plain);
    }
  }
  // Pazar meydanı: çeşme, tezgâhlar, ağaçlar
  A(b, DISC, 9, 0.6, 9, 0, 0, 0, 0, C.concrete, SURF.concrete);
  A(b, DISC, 8, 0.65, 8, 0, 0.05, 0, 0, C.water, SURF.water);
  A(b, CYL, 0.8, 2.6, 0.8, 0, 0, 0, 0, C.concrete, SURF.concrete);
  for (let i = 0; i < 10; i++) {
    const x = -24 + (i % 5) * 12;
    const z = (i < 5 ? -1 : 1) * 24;
    A(b, BOX, 4, 1.1, 3, x, 0, z, 0, C.crate[i % 3], SURF.wood);
    A(b, GABLE, 3.8, 1.2, 4.8, x, 2.2, z, Math.PI / 2, pick(rng, C.awning), SURF.plain);
  }
  for (const [x, z] of [[-30, -44], [30, -44], [-30, 44], [30, 44]]) tree(b, rng, x, z, 9, false);
}

function office(b: ArchBatch, rng: Rng): void {
  A(b, BOX, 92, 0.3, 92, 0, -0.1, 0, 0, C.pave, SURF.paving);
  // Beton kaide katları (bant pencereli), cam cepheli kule, çatıda makine dairesi ve anten
  A(b, BOX, 44, 7.5, 40, 0, 0, -8, 0, C.concrete, SURF.officeWin);
  A(b, BOX, 44.6, 0.5, 40.6, 0, 7.5, -8, 0, C.felt, SURF.felt);
  const floors = 13 + Math.floor(rng() * 5);
  const H = floors * 3.4;
  A(b, BOX, 22, H, 22, 0, 7.5, -8, 0, pick(rng, [0x5d6b78, 0x60706c, 0x6a6e78]), SURF.curtain);
  A(b, BOX, 23, 1, 23, 0, 7.5 + H, -8, 0, C.concrete, SURF.concrete);
  A(b, BOX, 8, 3.4, 6, -4, 8.5 + H, -10, 0, C.metal, SURF.metal);
  A(b, CYL, 0.3, 14, 0.3, 6, 8.5 + H, -4, 0, C.dark, SURF.metal);
  // Meydan: çeşme ve ağaçlar
  A(b, DISC, 6, 0.5, 6, 0, 0, 30, 0, C.concrete, SURF.concrete);
  A(b, DISC, 5.2, 0.55, 5.2, 0, 0.05, 30, 0, C.water, SURF.water);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    tree(b, rng, Math.cos(a) * 34, 26 + Math.sin(a) * 12, 8, false);
  }
  for (let i = 0; i < 6; i++) car(b, rng, 30, -30 + i * 6, Math.PI / 2);
}

function depot(b: ArchBatch, rng: Rng): void {
  A(b, BOX, 164, 0.3, 124, 0, -0.1, 0, 0, C.road, SURF.asphalt);
  for (let i = 0; i < 3; i++) {
    const x = -52 + i * 34;
    // Ambar: tuğla alt duvar, oluklu sac kemer çatı, sürgülü kapı
    A(b, BOX, 26, 5, 70, x, 0, -10, 0, pick(rng, C.brick), SURF.brick);
    A(b, ARCH, 13, 7, 70, x, 5, -10, 0, pick(rng, [0x8a8f8c, 0x7a8272, 0x9a9890]), SURF.corrugated);
    A(b, BOX, 8, 4.4, 0.3, x, 0, 25.2, 0, 0x5e6058, SURF.hangarDoor);
  }
  // Yükleme sahası: sandık yığınları, kamyonlar
  for (let i = 0; i < 14; i++) {
    const x = -60 + (i % 7) * 14 + rng() * 4;
    const z = 40 + Math.floor(i / 7) * 12;
    const h = 1.2 + Math.floor(rng() * 3) * 1.2;
    A(b, BOX, 4, h, 4, x, 0, z, 0, pick(rng, C.crate), SURF.wood);
  }
  for (let i = 0; i < 3; i++) {
    const x = 50 + i * 7;
    A(b, BOX, 2.4, 2.6, 7, x, 0.5, 40, 0, 0x4f5638, SURF.metal);
    A(b, BOX, 2.3, 2.0, 2.2, x, 0.5, 45, 0, 0x3e4430, SURF.metal);
  }
  // Su kulesi ve büro
  for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) A(b, BOX, 0.5, 18, 0.5, 62 + dx, 0, -30 + dz, 0, C.dark, SURF.metal);
  A(b, CYL, 4.5, 7, 4.5, 62, 18, -30, 0, 0x7d8279, SURF.metal);
  A(b, BOX, 14, 6, 10, 60, 0, 10, 0, pick(rng, C.wall), SURF.plasterWin);
  A(b, GABLE, 11, 2.5, 15, 60, 6, 10, Math.PI / 2, pick(rng, C.roof), SURF.tile);
}

function park(b: ArchBatch, rng: Rng): void {
  A(b, DISC, 52, 0.3, 52, 0, -0.1, 0, 0, C.grass, SURF.grass);
  A(b, BOX, 4, 0.4, 104, 0, 0, 0, 0.6, 0xc2b392, SURF.earth);
  A(b, BOX, 4, 0.4, 104, 0, 0, 0, -0.9, 0xc2b392, SURF.earth);
  A(b, DISC, 15, 0.42, 11, 18, 0, 14, 0, C.water, SURF.water);
  A(b, DISC, 4, 3.2, 4, -14, 0, -10, 0, 0xe8e2d4, SURF.plaster);
  A(b, GABLE, 9, 2.6, 9, -14, 3.2, -10, 0, pick(rng, C.roof), SURF.tile);
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = 10 + rng() * 38;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - 18, z - 14) < 17 || Math.hypot(x + 14, z + 10) < 7) continue;
    tree(b, rng, x, z, 7 + rng() * 6);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    A(b, BOX, 2, 0.6, 0.6, Math.cos(a) * 26, 0.2, Math.sin(a) * 26, a, 0x6e5238, SURF.wood);
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

const CONE = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0);

function mine(b: ArchBatch, rng: Rng): void {
  // Maden ocağı: kuyu kulesi, vinç dairesi, cevher hazırlama tesisi, konveyör, siloslar, pasa yığınları, vagonlu ray
  const steel = 0x4a4e52;
  const brick = pick(rng, C.brick);
  const plant = pick(rng, [0xc9c3b6, 0xbfc3c6, 0xd0c6b2]);
  const roof = pick(rng, [0x5a5e66, 0x6a5a50]);
  const M = SURF.metal;
  A(b, BOX, 140, 0.3, 110, 0, -0.1, 0, 0, 0x8a7a60, SURF.earth);
  // Kuyu kulesi (çelik kafes) ve kuyu ağzı binası
  const hx = -15;
  const hz = -5;
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) A(b, BOX, 0.7, 28, 0.7, hx + dx, 0, hz + dz, 0, steel, M);
  for (let y = 7; y < 28; y += 5) {
    A(b, BOX, 6.7, 0.35, 0.35, hx, y, hz - 3, 0, steel, M);
    A(b, BOX, 6.7, 0.35, 0.35, hx, y, hz + 3, 0, steel, M);
    A(b, BOX, 0.35, 0.35, 6.7, hx - 3, y, hz, 0, steel, M);
    A(b, BOX, 0.35, 0.35, 6.7, hx + 3, y, hz, 0, steel, M);
  }
  A(b, BOX, 8, 1.2, 8, hx, 28, hz, 0, steel, M);
  for (const dx of [-3, 3]) b.push(beam(hx + dx, 27, hz + 2.5, hx + dx * 1.5, 0, hz + 19, 0.7), steel, M);
  for (const dx of [-1.6, 1.6]) b.push(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 18).rotateZ(Math.PI / 2).translate(hx + dx, 31.6, hz), steel, M);
  A(b, BOX, 13, 7, 13, hx, 0, hz, 0, brick, SURF.brickWin);
  A(b, GABLE, 14, 3, 14, hx, 7, hz, 0, roof, SURF.tile);
  // Vinç dairesi, baca ve halatlar
  A(b, BOX, 16, 10, 14, hx, 0, hz + 30, 0, brick, SURF.brickWin);
  A(b, GABLE, 15, 4, 17, hx, 10, hz + 30, Math.PI / 2, roof, SURF.tile);
  A(b, CYL, 1.3, 32, 1.3, hx + 11, 0, hz + 37, 0, brick, SURF.brick);
  A(b, CYL, 1.6, 1.2, 1.6, hx + 11, 32, hz + 37, 0, 0x2c2826, M);
  for (const dx of [-1.6, 1.6]) b.push(beam(hx + dx, 33.5, hz, hx + dx, 9, hz + 23, 0.15), steel, M);
  // Cevher hazırlama tesisi: yamaca basamaklı binalar (oluklu sac cephe)
  const mx = 26;
  const mz = -25;
  const steps: [number, number, number][] = [[0, 16, 20], [18, 11, 18], [33, 7, 15]];
  for (const [dx, h, d] of steps) {
    A(b, BOX, 19, h, d, mx + dx, 0, mz + (20 - d) / 2, 0, plant, SURF.corrugated);
    A(b, BOX, 19.6, 0.6, d + 0.6, mx + dx, h, mz + (20 - d) / 2, 0, roof, SURF.felt);
  }
  A(b, BOX, 5, 6, 5, mx - 3, 16, mz - 2, 0, plant, SURF.corrugated);
  // Konveyör: kuyu ağzından tesisin tepesine
  b.push(beam(hx + 6.5, 6, hz, mx - 9.5, 19, mz + 2, 2.2, 1.6), steel, M);
  for (const t of [0.3, 0.65]) {
    const x = hx + 6.5 + (mx - 9.5 - hx - 6.5) * t;
    const z = hz + (mz + 2 - hz) * t;
    A(b, BOX, 0.6, 6 + 13 * t, 0.6, x, 0, z, 0, steel, M);
  }
  // Cevher siloları ve yükleme rampası
  for (const x of [22, 31]) {
    A(b, CYL, 4, 13, 4, x, 3, 10, 0, 0x9a9890, SURF.concrete);
    b.push(CONE.clone().scale(4, 2.5, 4).translate(x, 16, 10), roof, SURF.felt);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) A(b, BOX, 0.5, 3, 0.5, x + dx, 0, 10 + dz, 0, steel, M);
  }
  // Ray, cevher vagonları, kamyonlar
  A(b, BOX, 3, 0.4, 72, 26.5, 0, 26, 0, 0x6f665a, SURF.earth);
  A(b, BOX, 0.2, 0.55, 72, 25.8, 0, 26, 0, steel, M);
  A(b, BOX, 0.2, 0.55, 72, 27.2, 0, 26, 0, steel, M);
  for (let i = 0; i < 6; i++) A(b, BOX, 2.2, 1.6, 3, 26.5, 0.5, 18 + i * 4, 0, pick(rng, [0x6e4a35, 0x5c4a3a, 0x4a4038]), M);
  for (let i = 0; i < 3; i++) {
    const x = 40 + i * 6;
    A(b, BOX, 2.6, 2.2, 6.5, x, 0.5, 22, 0, pick(rng, [0x4f5638, 0x6a5a3a, 0x3e4430]), M);
    A(b, BOX, 2.5, 1.4, 4, x, 2.7, 21, 0, 0x3a3430, SURF.earth);
  }
  // Pasa yığınları
  const spoil = [0x4e4842, 0x5a524a, 0x625646];
  for (const [x, z, r, h] of [[-48, 28, 20, 13], [-50, -32, 15, 9], [56, 38, 11, 7]]) {
    b.push(CONE.clone().scale(r, h, r * 0.85).rotateY(rng() * 3).translate(x, 0, z), pick(rng, spoil), SURF.earth);
  }
  // Yönetim ve soyunma binası
  A(b, BOX, 14, 5, 9, 52, 0, 12, 0, pick(rng, C.wall), SURF.plasterWin);
  A(b, GABLE, 10, 2.4, 15, 52, 5, 12, Math.PI / 2, pick(rng, C.roof), SURF.tile);
  // Çevre çiti
  A(b, BOX, 140, 1.8, 0.25, 0, 0, 54.5, 0, steel, M);
  A(b, BOX, 140, 1.8, 0.25, 0, 0, -54.5, 0, steel, M);
  A(b, BOX, 0.25, 1.8, 110, 69.5, 0, 0, 0, steel, M);
  A(b, BOX, 0.25, 1.8, 110, -69.5, 0, 0, 0, steel, M);
}

/** Şehir yapısının parçalarını yapının yığınına ekler. */
export function buildCityModel(kind: StructureKind, rng: Rng, b: ArchBatch): void {
  switch (kind) {
    case 'house': house(b, rng); break;
    case 'apartment': apartment(b, rng); break;
    case 'shops': shops(b, rng); break;
    case 'office': office(b, rng); break;
    case 'depot': depot(b, rng); break;
    case 'park': park(b, rng); break;
    case 'mine': mine(b, rng); break;
    default: break;
  }
}
