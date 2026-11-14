// İtfaiye araçları (sim/structures/fireStation.ts ekipleri): küçük araç (1–2 kişi) ve büyük araç (3 kişi), 1940'lar.
// Küçük: kısa şasili hafif itfaiye kamyoneti (kapalı kabin, arkada hortum makarası ve kısa merdiven). Büyük: uzun kaputlu
// merdivenli araç (açık ekip kabini, dolap gövde, tavanda uzun merdiven, yanlarda hortum makaraları, arkada pompa).
// Yapı gölgelendiricisiyle çizilir (boyalı metalde kenar aşınması, ahşapta tahta dokusu). Yerel eksen: burun +z, y yukarı,
// tekerlek altı y = 0. Geometriler bir kez kurulur; her araç aynı geometriyi paylaşan bir ağdır.

import * as THREE from 'three';
import { BOX } from './props';
import { SURF, ArchBatch, archMaterial, type Surf } from './arch';

const RED = 0xa02a20;
const RED_DARK = 0x7a1e18;
const BLACK = 0x18191b;
const CHROME = 0xb9bcc0;
const BRASS = 0xb8a060;
const WOOD = 0xb89a62;
const GLASS = 0x34424e;

const A = (b: ArchBatch, sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number, surf: Surf = SURF.metal) =>
  b.add(BOX, sx, sy, sz, x, y, z, 0, color, surf);

/** Teker çifti: lastik, jant, çamurluk. */
function axle(b: ArchBatch, z: number, half: number, r: number, w: number, fender = true): void {
  for (const s of [-1, 1]) {
    b.push(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), BLACK, SURF.plain, 0, s * half, r, z);
    b.push(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.04, 10).rotateZ(Math.PI / 2), RED_DARK, SURF.metal, 0, s * half, r, z);
    b.push(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w + 0.08, 8).rotateZ(Math.PI / 2), CHROME, SURF.metal, 0, s * half, r, z);
    if (fender) {
      A(b, w + 0.12, 0.07, r * 2.5, s * half, r * 2.05, z, RED);
      A(b, w + 0.12, r * 0.7, 0.07, s * half, r * 1.4, z + r * 1.25, RED);
      A(b, w + 0.12, r * 0.7, 0.07, s * half, r * 1.4, z - r * 1.25, RED);
    }
  }
}

/** Merdiven: z boyunca len; iki kiriş ve basamaklar. */
function ladder(b: ArchBatch, x: number, y: number, z: number, len: number, wide = 0.42): void {
  for (const s of [-1, 1]) A(b, 0.05, 0.09, len, x + (s * wide) / 2, y, z, WOOD, SURF.wood);
  const n = Math.round(len / 0.38);
  for (let i = 0; i <= n; i++) A(b, wide, 0.035, 0.035, x, y + 0.03, z - len / 2 + (i * len) / n, WOOD, SURF.wood);
}

/** Hortum makarası: yanal eksenli tambur, sarılı hortum, iki yan disk. */
function reel(b: ArchBatch, x: number, y: number, z: number, r: number, w: number): void {
  b.push(new THREE.CylinderGeometry(r * 0.82, r * 0.82, w, 14).rotateZ(Math.PI / 2), 0xc9b98a, SURF.canvas, 0, x, y, z);
  for (const s of [-1, 1]) b.push(new THREE.CylinderGeometry(r, r, 0.05, 14).rotateZ(Math.PI / 2), RED_DARK, SURF.metal, 0, x + s * (w / 2), y, z);
}

/** Ön: ızgara, farlar, tampon, kaput üstü çan. */
function nose(b: ArchBatch, z: number, w: number, hoodY: number): void {
  A(b, w * 0.62, 0.62, 0.08, 0, hoodY - 0.72, z + 0.02, CHROME);
  for (let i = -2; i <= 2; i++) A(b, 0.035, 0.56, 0.1, i * w * 0.11, hoodY - 0.7, z + 0.04, BLACK, SURF.plain);
  for (const s of [-1, 1]) {
    b.push(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 12).rotateX(Math.PI / 2), CHROME, SURF.metal, 0, s * w * 0.42, hoodY - 0.42, z + 0.02);
    b.push(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 12).rotateX(Math.PI / 2), 0xe8e0c0, SURF.plain, 0, s * w * 0.42, hoodY - 0.42, z + 0.04);
  }
  A(b, w + 0.16, 0.14, 0.12, 0, 0.42, z + 0.2, CHROME);
  // Çan
  A(b, 0.05, 0.3, 0.05, w * 0.22, hoodY, z - 0.5, BRASS);
  b.push(new THREE.CylinderGeometry(0.07, 0.15, 0.2, 10), BRASS, SURF.metal, 0, w * 0.22, hoodY + 0.34, z - 0.5);
}

/** Küçük araç: 4,7 m, kapalı iki kişilik kabin, arkada makara ve merdiven. */
function buildSmall(b: ArchBatch): void {
  const w = 1.78;
  // Şasi ve tekerler
  A(b, w - 0.5, 0.16, 4.5, 0, 0.42, 0, BLACK, SURF.plain);
  axle(b, 1.45, w / 2 - 0.08, 0.4, 0.22);
  axle(b, -1.35, w / 2 - 0.08, 0.4, 0.22);
  // Kaput ve kabin
  A(b, w - 0.42, 0.62, 1.5, 0, 0.6, 1.55, RED);
  A(b, w - 0.6, 0.08, 1.46, 0, 1.22, 1.55, RED_DARK);
  nose(b, 2.3, w - 0.3, 1.25);
  A(b, w, 0.75, 1.35, 0, 0.6, 0.15, RED);
  A(b, w - 0.06, 0.62, 1.2, 0, 1.35, 0.1, GLASS, SURF.plain);
  for (const [x, z] of [[-1, 0.7], [1, 0.7], [-1, -0.5], [1, -0.5]]) A(b, 0.07, 0.66, 0.07, (x * (w - 0.08)) / 2, 1.35, z + 0.1, RED);
  A(b, w + 0.04, 0.08, 1.4, 0, 1.97, 0.1, RED);
  for (const s of [-1, 1]) A(b, 0.04, 0.4, 0.06, s * (w / 2 + 0.02), 0.95, 0.35, CHROME);
  // Basamak
  for (const s of [-1, 1]) A(b, 0.22, 0.05, 1.3, s * (w / 2 + 0.08), 0.48, 0.15, BLACK, SURF.plain);
  // Kasa: alçak yan panolar, içinde makara ve alet sandığı
  A(b, w, 0.12, 1.9, 0, 0.6, -1.45, RED_DARK);
  for (const s of [-1, 1]) A(b, 0.07, 0.5, 1.9, s * (w / 2 - 0.035), 0.72, -1.45, RED);
  A(b, w, 0.5, 0.07, 0, 0.72, -2.37, RED);
  reel(b, 0, 1.2, -1.75, 0.42, 1.1);
  for (const s of [-1, 1]) A(b, 0.06, 0.62, 0.06, s * 0.62, 0.72, -1.75, BLACK, SURF.plain);
  A(b, 1.3, 0.38, 0.6, 0, 0.72, -0.9, 0x6e5238, SURF.wood);
  // Tavanda kısa merdiven, yanında kanca
  for (const z of [0.6, -2.2]) A(b, 1.0, 0.05, 0.05, 0, 2.06, z, BLACK, SURF.plain);
  for (const s of [-1, 1]) A(b, 0.05, 0.9, 0.05, s * 0.5, 1.2, -2.2, BLACK, SURF.plain);
  ladder(b, -0.2, 2.1, -0.8, 3.4);
  A(b, 0.05, 0.05, 3.0, 0.42, 2.1, -0.8, 0x6e5238, SURF.wood);
  // Tepe lambası ve arka lambalar
  b.push(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 10), 0xc8463c, SURF.plain, 0, 0, 2.05, 0.45);
  for (const s of [-1, 1]) A(b, 0.1, 0.1, 0.05, s * (w / 2 - 0.12), 0.78, -2.42, 0xc8463c, SURF.plain);
}

/** Büyük araç: 7,6 m, uzun kaput, açık ekip kabini, dolap gövde, uzun merdiven, makaralar, pompa. */
function buildBig(b: ArchBatch): void {
  const w = 2.25;
  A(b, w - 0.7, 0.2, 7.3, 0, 0.56, 0, BLACK, SURF.plain);
  axle(b, 2.55, w / 2 - 0.1, 0.52, 0.28);
  axle(b, -2.0, w / 2 - 0.1, 0.52, 0.5);
  // Kaput: uzun, yanlarda havalandırma çizgileri
  A(b, w - 0.75, 0.75, 2.0, 0, 0.78, 2.75, RED);
  A(b, w - 0.95, 0.08, 1.96, 0, 1.53, 2.75, RED_DARK);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) A(b, 0.03, 0.4, 0.06, s * (w / 2 - 0.37), 0.95, 2.0 + i * 0.28, BLACK, SURF.plain);
  nose(b, 3.75, w - 0.6, 1.55);
  // Açık kabin: torpido, ön cam çerçevesi, direksiyon, iki koltuk sırası
  A(b, w, 0.85, 0.5, 0, 0.76, 1.55, RED);
  A(b, w - 0.1, 0.66, 0.05, 0, 1.62, 1.72, GLASS, SURF.plain);
  A(b, w - 0.04, 0.06, 0.07, 0, 2.28, 1.72, CHROME);
  for (const s of [-1, 1]) A(b, 0.06, 0.7, 0.07, s * (w / 2 - 0.05), 1.6, 1.72, CHROME);
  b.push(new THREE.TorusGeometry(0.2, 0.025, 6, 14).rotateX(-1.1), BLACK, SURF.plain, 0, -0.5, 1.72, 1.32);
  A(b, w, 0.5, 2.2, 0, 0.76, 0.2, RED);
  for (const z of [0.95, -0.1]) {
    A(b, w - 0.3, 0.16, 0.6, 0, 1.26, z, 0x3a2a1c, SURF.wood);
    A(b, w - 0.3, 0.55, 0.12, 0, 1.4, z - 0.34, 0x3a2a1c, SURF.wood);
  }
  for (const s of [-1, 1]) {
    A(b, 0.06, 0.4, 2.1, s * (w / 2 - 0.03), 1.26, 0.25, RED);
    A(b, 0.3, 0.06, 2.4, s * (w / 2 + 0.12), 0.6, 0.4, BLACK, SURF.plain);
  }
  // Gövde: dolaplar (pano çizgileri), üstte tırabzan
  A(b, w, 1.25, 3.5, 0, 0.76, -2.65, RED);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      A(b, 0.03, 0.85, 0.95, s * (w / 2 + 0.01), 0.95, -1.45 - i * 1.1, RED_DARK);
      A(b, 0.05, 0.05, 0.3, s * (w / 2 + 0.04), 1.35, -1.45 - i * 1.1, CHROME);
    }
    A(b, 0.04, 0.04, 3.5, s * (w / 2 - 0.05), 2.3, -2.65, CHROME);
    for (const z of [-1.0, -2.65, -4.3]) A(b, 0.04, 0.3, 0.04, s * (w / 2 - 0.05), 2.01, z, CHROME);
    // Yan makaralar
    reel(b, s * (w / 2 - 0.45), 2.25, -1.6, 0.34, 0.5);
  }
  // Tavanda uzun merdiven: iki parçalı, önde kabin üstüne taşar; taşıyıcı ayaklar
  for (const z of [1.2, -4.2]) {
    A(b, 1.3, 0.06, 0.06, 0, 2.72, z, BLACK, SURF.plain);
    for (const s of [-1, 1]) A(b, 0.06, z > 0 ? 1.5 : 0.72, 0.06, s * 0.62, z > 0 ? 1.26 : 2.01, z, BLACK, SURF.plain);
  }
  ladder(b, 0, 2.78, -1.4, 6.6, 0.55);
  ladder(b, 0, 2.9, -1.1, 5.4, 0.4);
  // Arkada pompa: gövde, iki çıkış, hortum bağlantısı, basamak
  A(b, 1.1, 0.7, 0.5, 0, 0.8, -4.6, BRASS);
  for (const s of [-1, 1]) b.push(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10).rotateX(Math.PI / 2), CHROME, SURF.metal, 0, s * 0.3, 1.1, -4.9);
  b.push(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12).rotateX(Math.PI / 2), RED_DARK, SURF.metal, 0, 0, 1.3, -4.88);
  A(b, w, 0.06, 0.4, 0, 0.6, -4.75, BLACK, SURF.plain);
  // Projektör, tepe lambası, arka lambalar, kazma ve balta (yan panoda)
  b.push(new THREE.CylinderGeometry(0.16, 0.12, 0.2, 12).rotateX(Math.PI / 2), CHROME, SURF.metal, 0, 0.75, 2.42, 1.6);
  b.push(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 10), 0xc8463c, SURF.plain, 0, -0.7, 2.36, 1.7);
  for (const s of [-1, 1]) A(b, 0.12, 0.12, 0.05, s * (w / 2 - 0.15), 1.0, -4.42, 0xc8463c, SURF.plain);
  A(b, 0.03, 0.06, 1.1, w / 2 + 0.03, 1.75, -2.6, WOOD, SURF.wood);
  A(b, 0.03, 0.2, 0.16, w / 2 + 0.03, 1.7, -2.1, 0x55595f);
}

let small: THREE.BufferGeometry | null = null;
let big: THREE.BufferGeometry | null = null;
let material: THREE.Material | null = null;

function geometry(isBig: boolean): THREE.BufferGeometry {
  const have = isBig ? big : small;
  if (have) return have;
  const b = new ArchBatch();
  if (isBig) buildBig(b);
  else buildSmall(b);
  const holder = new THREE.Group();
  const mesh = b.build(holder, new THREE.MeshBasicMaterial())!;
  const geo = mesh.geometry;
  if (isBig) big = geo;
  else small = geo;
  return geo;
}

/** Araç ağı (geometri ve malzeme ortak). */
export function fireVehicle(isBig: boolean): THREE.Mesh {
  material ??= archMaterial();
  const m = new THREE.Mesh(geometry(isBig), material);
  m.frustumCulled = false;
  return m;
}
