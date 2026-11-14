// Şehir ve ekonomi yapılarının modelleri: küçük, orta ve büyük ev, apartman, çarşı meydanı, büro binası, ambar, park, maden ocağı.
// 1940'lar Avrupa kasabası: sıvalı, tuğla ve Fachwerk evler, kiremit ve arduvaz çatılar, kesme taş belediye ve büro
// binaları. Parçalar gerçek malzemeleriyle yapının tek ağına eklenir (arch.ts); pencere, panjur, derz ve silme gibi ince
// ayrıntı gölgelendiricide çizilir (üçgen maliyeti yok). Çatılar saçaklıdır; arsalar kenarlarıyla toprağa iner.
// Yerel eksen: x enine, z boyuna, y yukarı; taban y=0, ön cephe +z. Ölçüler gerçeğe yakın (ev 9×8 m, kat 2,9–3,6 m).

import * as THREE from 'three';
import type { StructureKind } from '../sim/structures/structure';
import { ARCH, BOX, CYL, DISC, GABLE, broadleafGeo, coniferGeo } from './props';
import { SURF, type ArchBatch, type Surf } from './arch';
import { autoParts } from './vehicleParts';

const C = {
  // Sıva: beyaz, krem, aşı boyası, açık gri, soluk sarı, gül, soluk yeşil
  // 2026-11-12: pastel yerine yaşlanmış sıva tonları (kirli beyaz, aşı sarısı, toprak, gri, kum, bej, kiremit yıkaması, zeytin grisi)
  wall: [0xd6d0c0, 0xc8b68c, 0xb5936a, 0xb9b4a8, 0xc9b98c, 0xc0ac96, 0xb99a82, 0xa9af98],
  brick: [0x9a5640, 0x8c4d3a, 0xa86a50],
  // Kiremit (kızıl, kahve) ve arduvaz (koyu gri); bakır (yeşil pas)
  tile: [0x8e4a30, 0x7c422c, 0x985436, 0x84503a],
  slate: [0x55595f, 0x5f6066, 0x4c5157],
  copper: 0x5f8f7a,
  stone: [0xc9c0ae, 0xbdb6a6, 0xd2c8b4],
  timberFill: 0xe6dcc4,
  trim: 0xd6cfbf,
  grass: 0x66803f,
  hedge: 0x4d6a36,
  pave: 0xb3ab9c,
  cobble: 0x9d968a,
  gravel: 0xb5a88e,
  water: 0x4a6a78,
  awning: [0xa8463c, 0x3e6a52, 0xc89a3e, 0x3e5684, 0x8a3e6a, 0xd8d0bc],
  sign: [0x2e3a2e, 0x5a2a24, 0x2a344a, 0x3a3026],
  car: [0x3a3c40, 0x3a4252, 0x5e3a32, 0x4a5642, 0x6e6a5c, 0x3e4e62],
  truck: [0x4f5638, 0x5a5444, 0x3e4430, 0x6a5a3a],
  canvas: [0x8a8468, 0x7a7a5e, 0x9a9278],
  metal: 0x7c8084,
  dark: 0x2f3236,
  wood: 0x6e5238,
  door: [0x5a3e2a, 0x3e4a3a, 0x4a3226, 0x34404e],
  crate: [0x9a7a55, 0x7e6a4a, 0x8a7458],
  tree: [0x5e8a44, 0x527e3e, 0x6a9450, 0x4c7438],
  glass: 0x5d6b78,
  concrete: 0xaaa69d,
  felt: 0x4a4b50,
  earth: 0x6b5034,
  flowers: [0xb8483c, 0xd8b440, 0xc86a8a, 0xe8e0d0],
};

const TREE_B = broadleafGeo(0xffffff);
const TREE_C = coniferGeo(0xffffff);
const CONE = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0);

type Rng = () => number;
const pick = <T>(rng: Rng, a: T[]): T => a[Math.floor(rng() * a.length)];

/** Kısaltma: birim geometri, ölçek, konum, Y dönüşü, renk, yüzey. */
const A = (b: ArchBatch, geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry: number, color: number, surf: Surf) =>
  b.add(geo, sx, sy, sz, x, y, z, ry, color, surf);

/** Yüzeyin üstü (arsa ve yer döşemesi bunun üstünde). */
const TOP = 0.15;

// ------------------------------------------------------------------ ortak parçalar

/**
 * Arsa zemini: üstü w×d (y=TOP); kenarlar eğimle toprağın altına iner (havada levha gibi durmaz). edge verilirse kenar
 * şevi o renk ve yüzeyde (taş döşemenin kenarı çim ya da toprak).
 */
function pad(b: ArchBatch, w: number, d: number, color: number, surf: Surf, edge?: [number, Surf], x = 0, z = 0): void {
  const a = w / 2;
  const c = d / 2;
  const f = 1.6;
  const bot = -0.9;
  const T = [[-a, TOP, -c], [a, TOP, -c], [a, TOP, c], [-a, TOP, c]];
  const B = [[-a - f, bot, -c - f], [a + f, bot, -c - f], [a + f, bot, c + f], [-a - f, bot, c + f]];
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute([...T[0], ...T[3], ...T[2], ...T[0], ...T[2], ...T[1]], 3));
  const sides: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    sides.push(...T[i], ...T[j], ...B[j], ...T[i], ...B[j], ...B[i]);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
  top.computeVertexNormals();
  sg.computeVertexNormals();
  b.push(top, color, surf, 0, x, 0, z);
  b.push(sg, edge ? edge[0] : color, edge ? edge[1] : surf, 0, x, 0, z);
}

/** Yer döşemesi (yol, patika, tarh): arsanın hemen üstünde ince kutu. */
function flat(b: ArchBatch, w: number, d: number, x: number, z: number, color: number, surf: Surf, ry = 0, h = 0.08): void {
  A(b, BOX, w, h, d, x, TOP - 0.02, z, ry, color, surf);
}

/**
 * Beşik çatı, saçaklı: mahya yerel z boyunca (uzunluk d), açıklık w, yükseklik h; taban y'de. Alın üçgeni duvar
 * malzemesinde, eğimler kalın kiremit levha (saçak o kadar taşar, alın tarafında 0,35 m), mahyada kapak.
 */
function gableRoof(b: ArchBatch, w: number, d: number, h: number, x: number, y: number, z: number, ry: number,
  wallCol: number, wallSurf: Surf, roofCol: number, roofSurf: Surf = SURF.tile, o = 0.55): void {
  A(b, GABLE, w, h, d, x, y, z, ry, wallCol, wallSurf);
  const th = Math.atan2(h, w / 2);
  const len = Math.hypot(w / 2, h) + o;
  const t = 0.2;
  const L = d + 0.7;
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(len, t, L);
    g.rotateZ(-s * th);
    g.translate(s * (len / 2) * cs + s * sn * (t / 2), h - (len / 2) * sn + cs * (t / 2), 0);
    b.push(g, roofCol, roofSurf, ry, x, y, z);
  }
  A(b, BOX, 0.34, 0.24, L, x, y + h + t * 0.45, z, ry, roofCol, SURF.felt);
  // Saçak oluğu: iki saçak boyunca çinko oluk
  const ex = len * cs + 0.05;
  const ey = h - len * sn;
  for (const s of [-1, 1]) A(b, BOX, 0.17, 0.13, L, x + s * ex * Math.cos(ry), y + ey - 0.04, z - s * ex * Math.sin(ry), ry, 0x55585c, SURF.metal);
}

/**
 * Kırma çatı (dört yana eğimli), saçaklı: duvarların w×d üstüne, saçak o kadar taşar; yükseklik h duvar hizasında.
 * Uzun kenar boyunca mahya; kare tabanda piramit. Altı kapalı (aşağıdan bakınca saçak boşluğu görünmez).
 */
function hipGeo(w: number, d: number, h: number, o = 0.55): THREE.BufferGeometry {
  if (w > d) return hipGeo(d, w, h, o).rotateY(Math.PI / 2);
  const W = w + 2 * o;
  const D = d + 2 * o;
  const H = h * (W / w);
  const r = (D - W) / 2;
  const b0 = [-W / 2, 0, -D / 2];
  const b1 = [W / 2, 0, -D / 2];
  const b2 = [W / 2, 0, D / 2];
  const b3 = [-W / 2, 0, D / 2];
  const r0 = [0, H, -r];
  const r1 = [0, H, r];
  // Ön ve arka üçgen, iki yan yüz. Kare tabanda (r = 0) mahya tek noktadır: yan yüzler de üçgen (piramit)
  const pos = [...b0, ...r0, ...b1, ...b2, ...r1, ...b3, ...b1, ...r1, ...b2, ...b3, ...r0, ...b0];
  if (r > 0.01) pos.push(...b1, ...r0, ...r1, ...b3, ...r1, ...r0);
  pos.push(...b0, ...b1, ...b2, ...b0, ...b2, ...b3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function hipRoof(b: ArchBatch, w: number, d: number, h: number, x: number, y: number, z: number, col: number, o = 0.55): void {
  b.push(hipGeo(w, d, h, o), col, SURF.tile, 0, x, y, z);
  // Saçak oluğu: dört kenarda
  for (const s of [-1, 1]) {
    A(b, BOX, w + 2 * o + 0.3, 0.13, 0.17, x, y - 0.1, z + s * (d / 2 + o + 0.06), 0, 0x55585c, SURF.metal);
    A(b, BOX, 0.17, 0.13, d + 2 * o + 0.3, x + s * (w / 2 + o + 0.06), y - 0.1, z, 0, 0x55585c, SURF.metal);
  }
}

/** Baca: tuğla gövde ve beton başlık; taban y'de (çatının içinden çıkar). */
function chimney(b: ArchBatch, x: number, y: number, z: number, h: number, col: number): void {
  A(b, BOX, 0.7, h, 0.7, x, y, z, 0, col, SURF.brick);
  A(b, BOX, 0.95, 0.16, 0.95, x, y + h, z, 0, 0x6a655e, SURF.concrete);
  // Pişmiş toprak külah
  A(b, CYL, 0.17, 0.5, 0.17, x, y + h + 0.16, z, 0, 0x9a5a40, SURF.plain);
}

/** Yağmur borusu: saçaktan yere inen ince boru ve dipte dirsek; cephe düzleminde (x, z), boyu h. */
function downpipe(b: ArchBatch, x: number, z: number, h: number): void {
  A(b, BOX, 0.13, h, 0.13, x, 0, z + 0.1, 0, 0x4a4d50, SURF.metal);
  A(b, BOX, 0.13, 0.13, 0.5, x, 0.1, z + 0.3, 0, 0x4a4d50, SURF.metal);
}

/** Çamaşır ipi: iki direk, ip ve asılı çamaşırlar; x boyunca len. */
function washLine(b: ArchBatch, rng: Rng, x: number, z: number, len: number): void {
  for (const s of [-1, 1]) A(b, BOX, 0.1, 2.0, 0.1, x + (s * len) / 2, TOP, z, 0, C.dark, SURF.metal);
  A(b, BOX, len, 0.04, 0.04, x, TOP + 1.9, z, 0, C.dark, SURF.metal);
  for (let i = 0; i < 4; i++) {
    if (rng() < 0.3) continue;
    const w = 0.5 + rng() * 0.5;
    A(b, BOX, w, 0.6 + rng() * 0.5, 0.04, x - len / 2 + 0.6 + (i * (len - 1.2)) / 3, TOP + 1.9 - 0.62 - rng() * 0.4, z, 0, pick(rng, [0xe8e4da, 0xd8d0bc, 0x8fa3b8, 0xb8483c, 0xe1d3a6]), SURF.canvas);
  }
}

/** Düz çatı ekipmanı: havalandırma bacaları, su deposu, çatı çıkışı kapağı; (x, z) çevresinde w × d alana dağılır. */
function roofClutter(b: ArchBatch, rng: Rng, x: number, y: number, z: number, w: number, d: number): void {
  for (let i = 0; i < 4; i++) {
    const px = x + (rng() - 0.5) * w;
    const pz = z + (rng() - 0.5) * d;
    A(b, CYL, 0.22, 0.9 + rng() * 0.6, 0.22, px, y, pz, 0, 0x8a8d90, SURF.metal);
    A(b, CYL, 0.34, 0.12, 0.34, px, y + 1.3, pz, 0, 0x6a6d70, SURF.metal);
  }
  A(b, BOX, 1.6, 0.5, 1.6, x + w * 0.3, y, z - d * 0.3, 0, 0x6a655e, SURF.concrete);
  A(b, CYL, 0.9, 1.5, 0.9, x - w * 0.35, y + 0.3, z + d * 0.25, 0, 0x7c8084, SURF.metal);
}

/** Kapı: taş söve, boyalı ahşap kanat; ry yönüne bakan cephe düzleminde (x, z). Önünde basamak. */
function door(b: ArchBatch, rng: Rng, x: number, z: number, ry: number, w = 1.1, h = 2.2, step = true): void {
  const dx = Math.sin(ry);
  const dz = Math.cos(ry);
  A(b, BOX, w + 0.5, h + 0.3, 0.1, x + dx * 0.03, 0, z + dz * 0.03, ry, 0xc9c0ae, SURF.concrete);
  A(b, BOX, w, h, 0.14, x + dx * 0.06, 0, z + dz * 0.06, ry, pick(rng, C.door), SURF.wood);
  if (step) A(b, BOX, w + 0.9, 0.2, 0.8, x + dx * 0.4, 0, z + dz * 0.4, ry, 0xb8b0a2, SURF.concrete);
  // Duvar feneri ve kapı kolu
  const sx = Math.cos(ry) * (w / 2 + 0.55);
  const sz = -Math.sin(ry) * (w / 2 + 0.55);
  A(b, BOX, 0.2, 0.32, 0.2, x + sx + dx * 0.12, h - 0.25, z + sz + dz * 0.12, ry, C.dark, SURF.metal);
  A(b, BOX, 0.08, 0.14, 0.08, x + Math.cos(ry) * (w / 2 - 0.16) + dx * 0.15, 1.0, z - Math.sin(ry) * (w / 2 - 0.16) + dz * 0.15, ry, 0xb8a060, SURF.metal);
}

/** Tek pencere parçası (çatı penceresi gibi duvar dokusunun çizemediği yer): açık çerçeve ve cam. */
function windowPart(b: ArchBatch, x: number, y: number, z: number, w: number, h: number): void {
  A(b, BOX, w + 0.2, h + 0.2, 0.06, x, y - 0.1, z, 0, C.trim, SURF.plain);
  A(b, BOX, w, h, 0.1, x, y, z, 0, 0x3a4650, SURF.curtain);
}

/** Ağaç: taç rengi parça rengiyle, gövde kahve (köşe renkleri korunur). */
function tree(b: ArchBatch, rng: Rng, x: number, z: number, h = 7 + rng() * 5, conifer = rng() < 0.25): void {
  const g = (conifer ? TREE_C : TREE_B).clone();
  const col = new THREE.Color(pick(rng, C.tree));
  const c = g.getAttribute('color');
  for (let i = 0; i < c.count; i++) {
    // Taç köşeleri ton taşır (0,7–1,12; gövde bunun altında): taç rengi tonla çarpılır
    const v = c.getX(i);
    if (v > 0.6) c.setXYZ(i, col.r * v, col.g * v, col.b * v);
  }
  g.scale(h * (conifer ? 0.75 : 1), h, h * (conifer ? 0.75 : 1));
  g.rotateY(rng() * 6.28);
  g.translate(x, 0, z);
  b.push(g, null, SURF.plain);
}

/** 1940'lar otomobili (park hâlinde): tekerlekli, çamurluklu binek araç; bazen kamyonet (vehicleParts.ts). */
function car(b: ArchBatch, rng: Rng, x: number, z: number, ry = 0): void {
  const k = rng();
  autoParts(b, k < 0.75 ? 'sedan' : k < 0.9 ? 'pickup' : 'van', pick(rng, C.car), x, z, ry, TOP - 0.05);
}

/** Kamyon (Opel Blitz benzeri): tekerlek bloğu, kaput, kabin, ahşap kasa ve branda. */
function truck(b: ArchBatch, rng: Rng, x: number, z: number, ry = 0): void {
  const col = pick(rng, C.truck);
  const dx = Math.sin(ry);
  const dz = Math.cos(ry);
  const at = (f: number): [number, number] => [x + dx * f, z + dz * f];
  A(b, BOX, 2.1, 0.8, 5.4, x, 0, z, ry, 0x1c1d1e, SURF.metal);
  let [px, pz] = at(2.15);
  A(b, BOX, 1.3, 0.85, 1.3, px, 0.75, pz, ry, col, SURF.metal);
  [px, pz] = at(0.9);
  A(b, BOX, 2.1, 1.55, 1.4, px, 0.75, pz, ry, col, SURF.metal);
  [px, pz] = at(-1.25);
  A(b, BOX, 2.3, 0.6, 3.4, px, 0.85, pz, ry, 0x7a6248, SURF.wood);
  A(b, ARCH, 1.15, 1.1, 3.4, px, 1.45, pz, ry, pick(rng, C.canvas), SURF.canvas);
}

/** Sokak lambası: dökme demir kaide ve direk, kol, camlı fener. */
function lamp(b: ArchBatch, x: number, z: number): void {
  A(b, BOX, 0.3, 0.5, 0.3, x, TOP, z, 0, C.dark, SURF.metal);
  A(b, CYL, 0.07, 3.7, 0.07, x, TOP + 0.5, z, 0, C.dark, SURF.metal);
  A(b, BOX, 0.5, 0.06, 0.06, x, TOP + 3.7, z, 0, C.dark, SURF.metal);
  A(b, BOX, 0.3, 0.38, 0.3, x, TOP + 4.2, z, 0, 0xe6d9a0, SURF.plain);
  A(b, BOX, 0.4, 0.08, 0.4, x, TOP + 4.58, z, 0, C.dark, SURF.metal);
  A(b, BOX, 0.12, 0.14, 0.12, x, TOP + 4.66, z, 0, C.dark, SURF.metal);
}

/** Bank: dökme ayaklar, ahşap oturak ve sırtlık. */
function bench(b: ArchBatch, x: number, z: number, ry: number): void {
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  for (const s of [-1, 1]) A(b, BOX, 0.07, 0.42, 0.5, x + s * 0.75 * cs, TOP, z - s * 0.75 * sn, ry, C.dark, SURF.metal);
  A(b, BOX, 1.8, 0.07, 0.5, x, TOP + 0.42, z, ry, C.wood, SURF.wood);
  A(b, BOX, 1.8, 0.42, 0.06, x - 0.26 * sn, TOP + 0.55, z - 0.26 * cs, ry, C.wood, SURF.wood);
}

/** Çit: direkler, iki kuşak ve tahta perde (beyaz ya da kahve), boyu len, yön ry. */
function fence(b: ArchBatch, len: number, x: number, z: number, ry: number, col: number): void {
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  A(b, BOX, len, 0.62, 0.03, x, TOP + 0.2, z, ry, col, SURF.wood);
  for (const y of [0.32, 0.72]) A(b, BOX, len, 0.09, 0.07, x, TOP + y, z, ry, col, SURF.wood);
  const n = Math.max(1, Math.round(len / 2.6));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (i * len) / n;
    A(b, BOX, 0.13, 1.05, 0.13, x + t * cs, TOP, z - t * sn, ry, col, SURF.wood);
  }
}

/** Çalı çit: budanmış, üstü yuvarlatılmış iki kademe. */
function hedge(b: ArchBatch, len: number, x: number, z: number, ry: number): void {
  A(b, BOX, len, 0.72, 0.6, x, TOP, z, ry, C.hedge, SURF.grass);
  A(b, BOX, len - 0.1, 0.2, 0.4, x, TOP + 0.72, z, ry, 0x567340, SURF.grass);
}

// ------------------------------------------------------------------ evler

/**
 * Bahçe: arsa yarı genişliği P (16 büyük, 13,5 orta, 11 küçük ev). Önde kapı boşluklu çalı çit ve kapıdan bahçe
 * kapısına patika, yanlarda ve arkada tahta çit, arkada sebze tarhları ve kulübe, meyve ağaçları; büyük evde bazen yan
 * yolda araba (1940'larda otomobil seyrek).
 */
function garden(b: ArchBatch, rng: Rng, P: number, doorX: number, fz: number, car4: boolean, body?: [number, number, number, number]): void {
  if (body) {
    // Evin çevresi: beton subasman, arka kapı basamağı ve saçağı, yan duvarda odunluk ya da sarmaşık, yağmur borusu ve
    // fıçısı, kiler kapağı, ön pencere altında bank
    const [hx, hz, w, d] = body;
    const bz = hz - d / 2;
    A(b, BOX, w + 0.5, 0.32, d + 0.5, hx, 0, hz, 0, 0x8a8378, SURF.concrete);
    A(b, BOX, 1.5, 0.2, 0.9, hx + w * 0.2, 0, bz - 0.45, 0, 0xb8b0a2, SURF.concrete);
    A(b, BOX, 1.7, 0.1, 1.0, hx + w * 0.2, 2.35, bz - 0.5, 0, 0x4a4b50, SURF.felt);
    A(b, BOX, 0.95, 2.05, 0.1, hx + w * 0.2, 0.2, bz - 0.04, 0, pick(rng, C.door), SURF.wood);
    downpipe(b, hx - w / 2 + 0.2, bz - 0.25, 2.6);
    A(b, CYL, 0.36, 0.85, 0.36, hx - w / 2 + 0.2, TOP, bz - 0.75, 0, 0x5a4632, SURF.wood);
    if (rng() < 0.55) {
      A(b, BOX, 0.7, 1.05, 2.6, hx + w / 2 + 0.4, TOP, hz - d * 0.15, 0, 0x8a6a48, SURF.wood);
      A(b, BOX, 0.95, 0.08, 2.9, hx + w / 2 + 0.45, TOP + 1.12, hz - d * 0.15, 0, C.felt, SURF.felt);
    }
    if (rng() < 0.45) {
      A(b, BOX, 0.07, 1.9 + rng(), 2.2 + rng() * 1.5, hx - w / 2 - 0.05, 0.3, hz + d * 0.1, 0, 0x4a6a34, SURF.grass);
      A(b, BOX, 0.08, 1.0, 1.2, hx - w / 2 - 0.06, 1.6, hz - d * 0.2, 0, 0x577a3e, SURF.grass);
    }
    if (rng() < 0.35) b.push(new THREE.BoxGeometry(1.3, 0.12, 1.5).rotateX(-0.45).translate(0, 0.45, 0), 0x4a3a2c, SURF.wood, 0, hx + w * 0.3, 0, fz + 0.6);
    if (rng() < 0.4) bench(b, hx + w * 0.28, fz + 0.45, 0);
  }
  const k = P / 16;
  const e = P - 0.6;
  pad(b, P * 2 - 1, P * 2 - 1, C.grass, SURF.grass);
  flat(b, 1.3, e - fz, doorX, (fz + e) / 2, C.pave, SURF.paving);
  hedge(b, doorX - 1 + e, (-e + doorX - 1) / 2, e - 0.3, 0);
  hedge(b, e - doorX - 1, (e + doorX + 1) / 2, e - 0.3, 0);
  const fc = rng() < 0.5 ? 0xd8d2c4 : 0x7a5e44;
  fence(b, e * 2, e - 0.1, 0, Math.PI / 2, fc);
  fence(b, e * 2, -e + 0.1, 0, Math.PI / 2, fc);
  fence(b, e * 2, 0, -e + 0.1, 0, fc);
  const beds = P > 12 ? 3 : 2;
  for (let i = 0; i < beds; i++) flat(b, 5.5 * k, 1.1, 8.5 * k, -12.5 * k + i * 1.8, i === 1 ? 0x5f7a3a : C.earth, SURF.earth, 0, 0.2);
  const sk = Math.max(k, 0.8);
  A(b, BOX, 2.6 * sk, 2.1, 2.2, -12 * k, TOP, -12.6 * k, 0, 0x7a5a3c, SURF.wood);
  A(b, BOX, 3.0 * sk, 0.14, 2.6, -12 * k, TOP + 2.1, -12.6 * k, 0, C.felt, SURF.felt);
  tree(b, rng, 9 * k, -4 * k, 4.5 + rng() * 1.5, false);
  if (P > 12 || rng() < 0.5) tree(b, rng, 4 * k, -11 * k, 4 + rng() * 1.5, false);
  if (rng() < 0.6) tree(b, rng, -12 * k, 10 * k, 7 + rng() * 4);
  if (car4 && rng() < 0.25) {
    flat(b, 3.2, 14, 10.5, 7.5, C.gravel, SURF.earth);
    car(b, rng, 10.5, 6, 0);
  }
  // Bahçe kapısı direkleri ve posta kutusu
  for (const s of [-1, 1]) A(b, BOX, 0.28, 1.25, 0.28, doorX + s * 0.95, TOP, e - 0.3, 0, 0xb8b0a2, SURF.concrete);
  A(b, BOX, 0.3, 0.26, 0.2, doorX + 1.3, TOP + 0.85, e - 0.05, 0, pick(rng, [0x8a3a2c, 0x34404e, 0x3e4a3a]), SURF.metal);
  // Arka bahçe: çamaşır ipi, yağmur fıçısı, odun yığını (her evde değil)
  if (rng() < 0.55) washLine(b, rng, -5 * k, -9.5 * k, 4.2 * k);
  if (rng() < 0.6) A(b, CYL, 0.42, 0.95, 0.42, -12 * k + 1.9 * sk, TOP, -12.6 * k + 0.6, 0, 0x5a4632, SURF.wood);
  if (rng() < 0.5) {
    A(b, BOX, 2.2 * k, 0.9, 0.7, 2 * k, TOP, -e + 0.9, 0, 0x8a6a48, SURF.wood);
    A(b, BOX, 2.4 * k, 0.08, 0.9, 2 * k, TOP + 0.9, -e + 0.9, 0, C.felt, SURF.felt);
  }
  // Ön bahçe: bank ya da çiçek tarhı
  if (rng() < 0.5) bench(b, doorX + 3.2, fz + 1.6, 0);
  else for (let i = 0; i < 3; i++) A(b, BOX, 0.9, 0.5 + rng() * 0.3, 0.9, doorX - 2.2 - i * 1.1, TOP, fz + 1.2, 0, i === 1 ? 0x6a9450 : C.hedge, SURF.grass);
}

/** Ön eğimde çatı penceresi: ön yüzü duvardan 0,5 m içeride, tabanı ve arkası çatının içinde. */
function dormer(b: ArchBatch, x: number, top: number, fz: number, wall: number, roof: number): void {
  const zf = fz - 0.5;
  const yb = top + 0.3;
  A(b, BOX, 1.9, 1.8, 2.2, x, yb, zf - 1.1, 0, wall, SURF.plaster);
  gableRoof(b, 2.3, 2.4, 0.9, x, yb + 1.8, zf - 1.0, 0, wall, SURF.plaster, roof, SURF.tile, 0.2);
  windowPart(b, x, yb + 0.45, zf + 0.02, 0.8, 0.95);
}

/** Ev çatısının rengi: çoğu kiremit, bazıları arduvaz. */
const houseRoof = (rng: Rng, slate = 0.25): number => (rng() < slate ? pick(rng, C.slate) : pick(rng, C.tile));

/** Sokağa dayalı (bahçesiz) tiplerin arsası: çim, yan ve arka çit, binanın önünde kaldırıma kadar taş döşeme, arkada ağaç. */
function yard(b: ArchBatch, rng: Rng, P: number, fz: number, paveW: number, cx = 0): void {
  const e = P - 0.6;
  pad(b, P * 2 - 1, P * 2 - 1, C.grass, SURF.grass);
  flat(b, paveW, e - fz + 0.4, cx, (fz + e + 0.4) / 2, C.pave, SURF.paving);
  const fc = rng() < 0.5 ? 0xd8d2c4 : 0x7a5e44;
  fence(b, e * 2, e - 0.1, 0, Math.PI / 2, fc);
  fence(b, e * 2, -e + 0.1, 0, Math.PI / 2, fc);
  fence(b, e * 2, 0, -e + 0.1, 0, fc);
  tree(b, rng, -e + 3.5, -e + 4.5, 5 + rng() * 3, false);
  if (rng() < 0.6) tree(b, rng, e - 4, -e + 5.5, 4.5 + rng() * 2, false);
  for (let i = 0; i < 2; i++) A(b, CYL, 0.3, 0.8, 0.3, e - 1.2 - i * 0.8, TOP, fz - 2.5, 0, 0x6a6d70, SURF.metal);
  if (rng() < 0.6) washLine(b, rng, -e + 5, -e + 8.5, 3.6);
}

/** Dükkân cephesi: vitrin camı, tabela ve tente; ön yüz z = fz, eni w, merkezi x. */
function shopFront(b: ArchBatch, rng: Rng, x: number, fz: number, w: number): void {
  A(b, BOX, w, 2.6, 0.2, x, 0.5, fz + 0.06, 0, C.glass, SURF.curtain);
  A(b, BOX, w + 0.4, 0.55, 0.14, x, 3.3, fz + 0.08, 0, pick(rng, C.sign), SURF.plain);
  A(b, BOX, w + 0.2, 0.16, 1.6, x, 2.95, fz + 0.85, 0, pick(rng, C.awning), SURF.canvas);
}

/** Balkon: beton döşeme ve korkuluk (demir ya da renkli pano); ön yüz z = fz, döşeme altı y. */
function balcony(b: ArchBatch, x: number, y: number, fz: number, w: number, col: number = C.dark): void {
  A(b, BOX, w, 0.2, 1.3, x, y, fz + 0.65, 0, C.concrete, SURF.concrete);
  A(b, BOX, w, 0.95, 0.07, x, y + 0.2, fz + 1.27, 0, col, col === C.dark ? SURF.metal : SURF.plain);
  for (const s of [-1, 1]) A(b, BOX, 0.06, 0.95, 1.25, x + s * (w / 2 - 0.03), y + 0.2, fz + 0.66, 0, C.dark, SURF.metal);
  A(b, BOX, w, 0.05, 0.08, x, y + 1.15, fz + 1.27, 0, C.dark, SURF.metal);
}

/** Bahçe kulübesi. */
function shed(b: ArchBatch, x: number, z: number, w = 2.6): void {
  A(b, BOX, w, 2.1, 2.2, x, TOP, z, 0, 0x7a5a3c, SURF.wood);
  A(b, BOX, w + 0.4, 0.14, 2.6, x, TOP + 2.1, z, 0, C.felt, SURF.felt);
}

function smallHouse(b: ArchBatch, rng: Rng): void {
  // 2 kişilik küçük ev, altı ayrı biçim: badanalı kır evi (dik beşik çatı), çatısı yere inen A çatılı kulübe, kaldırıma
  // dayalı iki katlı dar kasaba evi, düz çatılı 1950'ler evi, ahşap kaplama ev, kırma çatılı tuğla bungalov
  const type = Math.floor(rng() * 6);
  const brick = pick(rng, C.brick);
  if (type === 2) {
    const w = 5 + rng() * 0.8;
    const d = 7.5;
    const hz = 5.5;
    const fz = hz + d / 2;
    const wall = pick(rng, C.wall);
    const top = 5.7;
    A(b, BOX, w, top, d, 0, 0, hz, 0, wall, SURF.house);
    A(b, BOX, w + 0.2, 0.22, d + 0.2, 0, 2.85, hz, 0, C.trim, SURF.plaster);
    gableRoof(b, w, d, w * 0.85, 0, top, hz, 0, wall, SURF.plaster, houseRoof(rng), SURF.tile, 0.35);
    windowPart(b, 0, top + 1.0, fz + 0.06, 0.7, 0.9);
    chimney(b, w * 0.2, top, hz - 2, w * 0.85 + 0.3, brick);
    door(b, rng, -w * 0.2, fz, 0, 1.0, 2.1);
    downpipe(b, w / 2 - 0.2, fz, top);
    yard(b, rng, 11, fz, w + 2);
    shed(b, 7, -7);
    return;
  }
  const w = 6.5 + rng() * 1.2;
  const d = 6 + rng() * 1;
  const hx = -2;
  const hz = -1;
  let fz = hz + d / 2;
  let doorX = hx + w * 0.22;
  if (type === 0) {
    const wall = pick(rng, [0xece6d8, 0xe8e2d4, 0xe6dcc4]);
    const top = 2.9;
    A(b, BOX, w, top, d, hx, 0, hz, 0, wall, SURF.house);
    gableRoof(b, d, w, d * 0.68, hx, top, hz, Math.PI / 2, wall, SURF.plaster, houseRoof(rng, 0.15), SURF.tile, 0.45);
    chimney(b, hx - w * 0.25, top, hz - 0.3, d * 0.68 + 0.5, brick);
  } else if (type === 1) {
    // A çatılı kulübe: ahşap alın, çatı kaideye kadar iner; alında geniş cam ve üstte küçük pencere, soba borusu
    const span = w + 1.5;
    const h = span * 0.95;
    const wood = pick(rng, [0x6e5238, 0x7a5a3c, 0x5a4632, 0x8a3a2c]);
    A(b, BOX, span, 0.5, d + 1, hx, 0, hz, 0, 0x8a8378, SURF.concrete);
    gableRoof(b, span, d + 1, h, hx, 0.5, hz, 0, wood, SURF.wood, pick(rng, [0x4a4b50, 0x8e4a32, 0x3e5a48, 0x55595f]), SURF.tile, 0.7);
    fz = hz + (d + 1) / 2;
    windowPart(b, hx + 1.3, 1.3, fz + 0.06, 1.4, 1.5);
    windowPart(b, hx, 4.0, fz + 0.06, 1.0, 1.0);
    A(b, BOX, 0.28, h * 0.5, 0.28, hx + span * 0.22, h * 0.5, hz - 1.2, 0, C.dark, SURF.metal);
    doorX = hx - 1.3;
  } else if (type === 4) {
    // Ahşap kaplama ev: boyalı tahta duvar, taş kaide, alnı sokağa
    const wall = pick(rng, [0x8a3a2c, 0x4a5a3e, 0x6e5238, 0x9a8a6a]);
    const top = 2.8;
    A(b, BOX, w + 0.6, 0.4, d + 0.6, hx, 0, hz, 0, 0x8a8378, SURF.concrete);
    A(b, BOX, w, top, d, hx, 0.4, hz, 0, wall, SURF.wood);
    gableRoof(b, w, d, w * 0.55, hx, top + 0.4, hz, 0, wall, SURF.wood, pick(rng, [0x4a4b50, 0x55595f, 0x8e4a32]), SURF.tile, 0.5);
    for (const x of [hx - w * 0.22, hx + w * 0.3]) windowPart(b, x, 1.4, fz + 0.06, 0.8, 1.0);
    windowPart(b, hx, top + 1.0, fz + 0.06, 0.6, 0.7);
    chimney(b, hx + w * 0.2, top + 0.4, hz - d * 0.15, w * 0.55 + 0.4, brick);
  } else if (type === 5) {
    // Tuğla bungalov: kırma çatı, ortada baca
    const top = 3.0;
    A(b, BOX, w, top, d, hx, 0, hz, 0, brick, SURF.brickHouse);
    hipRoof(b, w, d, 2.4, hx, top, hz, houseRoof(rng, 0.3), 0.5);
    chimney(b, hx, top, hz, 3.0, brick);
    downpipe(b, hx + w / 2 - 0.2, fz, top);
  } else {
    // 1950'ler düz çatılı ev: beyaz küp gövde, geniş saçaklı beton çatı, bant pencere, tuğla yan duvar
    const wall = pick(rng, [0xf0ece2, 0xe9e4d6, 0xdfe3dc]);
    const top = 3.0;
    A(b, BOX, w + 0.8, top, d, hx, 0, hz, 0, wall, SURF.plaster);
    A(b, BOX, w + 2.6, 0.26, d + 2.0, hx, top, hz + 0.3, 0, 0x5a5d62, SURF.concrete);
    A(b, BOX, 0.5, top + 0.5, d + 1.2, hx - w / 2 - 0.5, 0, hz, 0, brick, SURF.brick);
    A(b, BOX, w * 0.52, 1.25, 0.1, hx + w * 0.2, 1.05, fz + 0.05, 0, 0x3a4650, SURF.curtain);
    A(b, BOX, w * 0.52 + 0.2, 0.1, 0.16, hx + w * 0.2, 1.0, fz + 0.06, 0, C.trim, SURF.plain);
    A(b, BOX, 0.9, 1.6, 0.9, hx + w * 0.3, top, hz - d * 0.2, 0, wall, SURF.plaster);
    doorX = hx - w * 0.2;
  }
  door(b, rng, doorX, fz, 0, 1.0, 2.1);
  garden(b, rng, 11, doorX, fz, false, [hx, hz, type === 1 ? w + 1.5 : w, type === 1 ? d + 1 : d]);
}

function midHouse(b: ArchBatch, rng: Rng): void {
  // 3 kişilik orta ev, beş ayrı biçim: çatı katlı bahçeli ev (çatı penceresi), alnı sokağa Fachwerk ev, kaldırıma
  // dayalı dükkânlı ev (altı vitrin, üstü konut), iki kapılı tuğla ikiz sıra ev, yanında eklentisi olan sıvalı ev
  const type = Math.floor(rng() * 5);
  const brick = pick(rng, C.brick);
  const roof = houseRoof(rng);
  if (type === 2) {
    const w = 9 + rng() * 1.2;
    const d = 8.5;
    const fz = 11.3;
    const hz = fz - d / 2;
    const wall = pick(rng, C.wall);
    const top = 7.3;
    A(b, BOX, w, top, d, 0, 0, hz, 0, wall, SURF.town);
    A(b, BOX, w + 0.3, 0.3, d + 0.3, 0, top - 0.3, hz, 0, C.trim, SURF.plaster);
    if (rng() < 0.5) gableRoof(b, w, d, w * 0.5, 0, top, hz, 0, wall, SURF.plaster, roof, SURF.tile, 0.3);
    else hipRoof(b, w, d, 3.0, 0, top, hz, roof, 0.4);
    chimney(b, w * 0.25, top, hz - 2, 4.2, brick);
    shopFront(b, rng, -0.9, fz, w - 3.6);
    door(b, rng, w / 2 - 1.1, fz, 0, 1.0, 2.3, false);
    downpipe(b, -w / 2 + 0.2, fz, top);
    yard(b, rng, 13.5, fz, w + 3);
    shed(b, 8.5, -9, 3.4);
    for (const [x, z] of [[-6, 3.5], [-4.6, 3.8]]) A(b, BOX, 1.1, 0.9, 1.1, x, TOP, z, 0, pick(rng, C.crate), SURF.wood);
    return;
  }
  const w = 8 + rng() * 1.2;
  const d = 7.2 + rng() * 1;
  const hx = -2.5;
  const hz = -1.2;
  const fz = hz + d / 2;
  let doorX = hx - w * 0.2;
  if (type === 0) {
    const wall = pick(rng, C.wall);
    const top = 3.2;
    A(b, BOX, w, top, d, hx, 0, hz, 0, wall, SURF.house);
    const rh = d * 0.62;
    gableRoof(b, d, w, rh, hx, top, hz, Math.PI / 2, wall, SURF.plaster, roof);
    dormer(b, hx + 1.2, top, fz, wall, roof);
    chimney(b, hx - w * 0.28, top, hz - 0.4, rh + 0.7, brick);
  } else if (type === 1) {
    const top = 3.0;
    A(b, BOX, w, 0.5, d, hx, 0, hz, 0, 0x8a8378, SURF.concrete);
    A(b, BOX, w, top - 0.5, d, hx, 0.5, hz, 0, C.timberFill, SURF.timber);
    gableRoof(b, w, d, w * 0.72, hx, top, hz, 0, C.timberFill, SURF.plaster, roof);
    windowPart(b, hx, top + 1.1, fz + 0.06, 0.9, 1.1);
    chimney(b, hx + w * 0.2, top, hz - d * 0.2, w * 0.72 + 0.5, brick);
  } else if (type === 4) {
    // Eklentili ev: alnı sokağa sıvalı gövde, yanında tek katlı alçak kırma çatılı eklenti
    const wall = pick(rng, C.wall);
    const top = 4.2;
    A(b, BOX, w, top, d, hx, 0, hz, 0, wall, SURF.house);
    gableRoof(b, w, d, w * 0.62, hx, top, hz, 0, wall, SURF.plaster, roof);
    windowPart(b, hx, top + 1.0, fz + 0.06, 0.9, 1.0);
    const ax = hx + w / 2 + 1.9;
    A(b, BOX, 3.8, 2.6, d - 1.6, ax, 0, hz - 0.8, 0, wall, SURF.house);
    hipRoof(b, 3.8, d - 1.6, 1.2, ax, 2.6, hz - 0.8, roof, 0.35);
    chimney(b, hx - w * 0.2, top, hz - d * 0.2, w * 0.62 + 0.4, brick);
    downpipe(b, hx - w / 2 + 0.2, fz, top);
    doorX = hx + w * 0.2;
  } else {
    // İkiz sıra ev: iki katlı dar tuğla ev çifti, ortak duvar ve mahyası sokağa koşut çatı; iki kapı, iki saçak
    const W = w + 2.4;
    const top = 5.6;
    A(b, BOX, W, top, d, hx, 0, hz, 0, brick, SURF.brickHouse);
    A(b, BOX, 0.5, top + 0.4, d + 0.3, hx, 0, hz, 0, 0xb8b0a2, SURF.concrete);
    gableRoof(b, d, W, d * 0.5, hx, top, hz, Math.PI / 2, brick, SURF.brick, roof);
    for (const s of [-1, 1]) {
      chimney(b, hx + s * W * 0.25, top, hz - 0.5, d * 0.5 + 0.7, brick);
      A(b, BOX, 1.9, 0.16, 1.2, hx + s * 1.5, 2.5, fz + 0.6, 0, roof, SURF.felt);
    }
    door(b, rng, hx + 1.5, fz, 0);
    for (const s of [-1, 1]) downpipe(b, hx + s * (W / 2 - 0.2), fz, top);
    doorX = hx - 1.5;
  }
  door(b, rng, doorX, fz, 0);
  garden(b, rng, 13.5, doorX, fz, false, [hx, hz, type === 3 ? w + 2.4 : w, d]);
}

function house(b: ArchBatch, rng: Rng): void {
  // 4 kişilik büyük ev, altı ayrı biçim: kırma çatılı villa (girişte saçak), dar ve yüksek küçük apartman (üç kat,
  // ön balkonlar), Fachwerk üst katlı ev, üçlü sıra ev (bitişik üç dar ev, ortadaki yüksek ve alnı sokağa), alnı sokağa
  // tuğla ev, çatı pencereli sıvalı ev
  const type = Math.floor(rng() * 6);
  const brick = pick(rng, C.brick);
  const roof = houseRoof(rng);
  if (type === 1) {
    const w = 8.5;
    const d = 11;
    const hx = -2;
    const hz = -1;
    const fz = hz + d / 2;
    const wall = pick(rng, C.wall);
    const panel = pick(rng, [0x9a5640, 0x4a6a78, 0x6e8a48, C.dark]);
    const H = 0.7 + 3 * 3.1;
    A(b, BOX, w + 0.3, 0.7, d + 0.3, hx, 0, hz, 0, 0x8a8378, SURF.concrete);
    A(b, BOX, w, 3 * 3.1, d, hx, 0.7, hz, 0, wall, SURF.aptWin);
    A(b, BOX, w + 0.4, 0.4, d + 0.4, hx, H - 0.4, hz, 0, C.trim, SURF.plaster);
    hipRoof(b, w, d, 3.0, hx, H, hz, roof, 0.4);
    for (const z of [-3, 2]) chimney(b, hx + 1.5, H, hz + z, 3.6, brick);
    for (let f = 1; f <= 2; f++) balcony(b, hx + 1.7, 0.7 + f * 3.1, fz, 3.8, panel);
    A(b, BOX, 2.4, 0.2, 1.3, hx - 2.3, 2.9, fz + 0.65, 0, C.concrete, SURF.concrete);
    door(b, rng, hx - 2.3, fz, 0, 1.3, 2.4);
    downpipe(b, hx - w / 2 + 0.2, fz, H);
    garden(b, rng, 16, hx - 2.3, fz, true);
    return;
  }
  if (type === 3) {
    const d = 8.5;
    const hz = -1.5;
    const fz = hz + d / 2;
    const uw = 5.2;
    const cols = [...C.wall].sort(() => rng() - 0.5);
    for (let i = -1; i <= 1; i++) {
      const x = i * uw;
      const col = cols[i + 1];
      const top = i === 0 ? 6.5 : 5.6;
      A(b, BOX, uw, top, d, x, 0, hz, 0, col, SURF.house);
      if (i === 0) {
        gableRoof(b, uw, d, uw * 0.8, x, top, hz, 0, col, SURF.plaster, roof, SURF.tile, 0.3);
        windowPart(b, x, top + 0.9, fz + 0.06, 0.7, 0.9);
      } else {
        gableRoof(b, d, uw, d * 0.42, x, top, hz, Math.PI / 2, col, SURF.plaster, roof, SURF.tile, 0.3);
      }
      door(b, rng, x - 1.3, fz, 0, 0.95, 2.1);
      chimney(b, x + 1.6, top, hz - 1.5, 3.8, brick);
    }
    flat(b, uw * 2 + 1.3, 1.1, -1.3, fz + 2.3, C.pave, SURF.paving);
    for (const s of [-1, 1]) flat(b, 1.1, 2.4, s * uw - 1.3, fz + 1.1, C.pave, SURF.paving);
    garden(b, rng, 16, -1.3, fz, false);
    return;
  }
  const w = 9 + rng() * 2;
  const d = 8 + rng() * 1.5;
  const hx = -3;
  const hz = -1.5;
  const fz = hz + d / 2;
  const doorX = hx - w * 0.18;
  if (type === 0) {
    const wall = pick(rng, C.wall);
    const top = 6.0;
    A(b, BOX, w, top, d, hx, 0, hz, 0, wall, SURF.house);
    A(b, BOX, w + 0.2, 0.25, d + 0.2, hx, 2.95, hz, 0, C.trim, SURF.plaster);
    hipRoof(b, w, d, 3.0, hx, top, hz, roof);
    chimney(b, hx - w * 0.25, top, hz, 3.6, brick);
    chimney(b, hx + w * 0.25, top, hz, 3.6, brick);
    // Giriş saçağı ve iki direk
    A(b, BOX, 2.6, 0.18, 1.6, doorX, 2.6, fz + 0.8, 0, roof, SURF.felt);
    for (const s of [-1, 1]) A(b, BOX, 0.16, 2.6, 0.16, doorX + s * 1.1, 0, fz + 1.4, 0, C.trim, SURF.plaster);
    downpipe(b, hx + w / 2 - 0.2, fz, top);
  } else if (type === 4) {
    // Tuğla ev: iki katlı, alnı sokağa
    const top = 5.8;
    A(b, BOX, w, top, d, hx, 0, hz, 0, brick, SURF.brickHouse);
    gableRoof(b, w, d, w * 0.5, hx, top, hz, 0, brick, SURF.brick, roof);
    windowPart(b, hx, top + 0.8, fz + 0.06, 0.9, 1.1);
    chimney(b, hx + w * 0.22, top, hz - d * 0.2, w * 0.5 + 0.4, brick);
    downpipe(b, hx + w / 2 - 0.2, fz, top);
  } else if (type === 5) {
    // İki katlı sıvalı ev: beşik çatı, iki çatı penceresi, kat silmesi
    const wall = pick(rng, C.wall);
    const top = 5.9;
    A(b, BOX, w, top, d, hx, 0, hz, 0, wall, SURF.house);
    A(b, BOX, w + 0.2, 0.25, d + 0.2, hx, 2.9, hz, 0, C.trim, SURF.plaster);
    const rh = d * 0.55;
    gableRoof(b, d, w, rh, hx, top, hz, Math.PI / 2, wall, SURF.plaster, roof);
    for (const x of [hx - w * 0.22, hx + w * 0.22]) dormer(b, x, top, fz, wall, roof);
    chimney(b, hx, top, hz - 0.6, rh + 0.6, brick);
    downpipe(b, hx - w / 2 + 0.2, fz, top);
  } else {
    // Fachwerk: zemin kat sıvalı, üst kat 0,25 m taşar
    A(b, BOX, w, 2.8, d, hx, 0, hz, 0, 0xd8cdb6, SURF.house);
    A(b, BOX, w + 0.5, 2.8, d + 0.5, hx, 2.8, hz, 0, C.timberFill, SURF.timber);
    A(b, BOX, w + 0.6, 0.22, d + 0.6, hx, 2.75, hz, 0, 0x3a2a1c, SURF.wood);
    const sp = d + 0.5;
    gableRoof(b, sp, w + 0.5, sp * 0.62, hx, 5.6, hz, Math.PI / 2, C.timberFill, SURF.plaster, roof);
    chimney(b, hx + w * 0.26, 5.6, hz - 0.4, sp * 0.62 + 0.6, brick);
  }
  door(b, rng, doorX, fz, 0);
  garden(b, rng, 16, doorX, fz, true, [hx, hz, w, d]);
}

// ------------------------------------------------------------------ apartman

/** 1930'lar konut bloğu: taş kaide, dört kat sıvalı cephe, kiremit çatı ve çatı pencereleri; önde üç merdiven girişi, arkada balkonlar. */
function apartmentBlock(b: ArchBatch, rng: Rng): void {
  pad(b, 59, 43, C.grass, SURF.grass);
  const L = 40;
  const D = 12;
  const bx = -4;
  const bz = -4;
  const fz = bz + D / 2;
  const floors = 4;
  const H = 0.9 + floors * 3.1;
  const wall = pick(rng, C.wall);
  const roof = rng() < 0.7 ? pick(rng, C.tile) : pick(rng, C.slate);
  const brick = pick(rng, C.brick);
  A(b, BOX, L + 0.3, 0.9, D + 0.3, bx, 0, bz, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, L, floors * 3.1, D, bx, 0.9, bz, 0, wall, SURF.aptWin);
  A(b, BOX, L + 0.5, 0.45, D + 0.5, bx, H - 0.45, bz, 0, C.trim, SURF.plaster);
  const rh = 4.3;
  if (rng() < 0.6) hipRoof(b, L, D, rh, bx, H, bz, roof);
  else gableRoof(b, D, L, rh, bx, H, bz, Math.PI / 2, wall, SURF.plaster, roof);
  for (const x of [-15, -5, 5, 15]) chimney(b, bx + x, H, bz - 1, rh + 0.8, brick);
  for (const x of [-10, 0, 10]) {
    const zf = fz - 0.6;
    A(b, BOX, 1.8, 1.7, 2.2, bx + x, H + 0.3, zf - 1.1, 0, wall, SURF.plaster);
    A(b, BOX, 2.2, 0.16, 2.5, bx + x, H + 2.0, zf - 1.05, 0, roof, SURF.felt);
    windowPart(b, bx + x, H + 0.75, zf + 0.02, 0.8, 0.9);
  }
  for (const x of [-13, 0, 13]) {
    door(b, rng, bx + x, fz, 0, 1.4, 2.5);
    A(b, BOX, 2.6, 0.2, 1.4, bx + x, 2.95, fz + 0.7, 0, C.concrete, SURF.concrete);
    flat(b, 1.6, 15.4 - fz, bx + x, (fz + 21.4) / 2, C.pave, SURF.paving);
  }
  flat(b, L + 6, 2.2, bx, fz + 4, C.pave, SURF.paving);
  const rz = bz - D / 2;
  for (let f = 1; f < floors; f++) {
    for (const x of [-12, 0, 12]) {
      A(b, BOX, 3.6, 0.22, 1.3, bx + x, 0.9 + f * 3.1, rz - 0.65, 0, C.concrete, SURF.concrete);
      A(b, BOX, 3.6, 0.95, 0.06, bx + x, 1.12 + f * 3.1, rz - 1.27, 0, C.dark, SURF.metal);
    }
  }
  flat(b, 5, 4, bx - 14, -17, 0xc8b48a, SURF.earth, 0, 0.3);
  washLine(b, rng, bx - 2.5, -17, 5);
  bench(b, bx + 8, -16.5, 0);
  bench(b, bx + 13, -16.5, 0);
  for (const x of [-22, -6, 6, 20]) tree(b, rng, bx + x, -19 + rng() * 1.5, 8 + rng() * 3, false);
  for (const x of [-20, 16]) tree(b, rng, bx + x, 17.5, 7 + rng() * 3, false);
  flat(b, 7, 16, 23.5, -6, C.gravel, SURF.earth);
  for (let i = 0; i < 2; i++) if (rng() < 0.6) car(b, rng, 23.5, -11 + i * 6, Math.PI / 2);
  hedge(b, 18, 27.6, -6, Math.PI / 2);
}

/** 1950'ler modern blok: beş kat, düz çatı ve parapet, ön cephede boydan boya balkonlar, ortada camlı merdiven kulesi. */
function apartmentModern(b: ArchBatch, rng: Rng): void {
  pad(b, 59, 43, C.grass, SURF.grass);
  const L = 38;
  const D = 11;
  const bx = -4;
  const bz = -5;
  const fz = bz + D / 2;
  const floors = 5;
  const H = 0.6 + floors * 3;
  const wall = pick(rng, [0xf0ece2, 0xe6e2d2, 0xdde3e0, 0xe9d9c0]);
  const panel = pick(rng, [0x9a5640, 0x4a6a78, 0x6e8a48, 0xc89a3e]);
  A(b, BOX, L, 0.6, D, bx, 0, bz, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, L, floors * 3, D, bx, 0.6, bz, 0, wall, SURF.aptWin);
  A(b, BOX, L + 0.6, 0.5, D + 0.6, bx, H, bz, 0, C.concrete, SURF.concrete);
  A(b, BOX, 5, 2.4, 4, bx, H + 0.5, bz - 1.5, 0, wall, SURF.plaster);
  roofClutter(b, rng, bx, H + 0.5, bz, L - 8, D - 4);
  A(b, BOX, 4.6, H + 1.2, 2.2, bx, 0, fz + 1.1, 0, wall, SURF.plaster);
  A(b, BOX, 1.6, H - 3.4, 0.12, bx, 3.0, fz + 2.22, 0, 0x3a4650, SURF.curtain);
  door(b, rng, bx, fz + 2.2, 0, 1.6, 2.5);
  for (let f = 1; f <= floors - 1; f++) {
    for (const s of [-1, 1]) balcony(b, bx + s * (L / 4 + 1.2), 0.6 + f * 3, fz, L / 2 - 4, f % 2 ? panel : C.trim);
  }
  flat(b, 2.2, 21 - fz - 2.2, bx, (fz + 2.2 + 21) / 2, C.pave, SURF.paving);
  flat(b, L + 8, 2, bx, fz + 4.5, C.pave, SURF.paving);
  flat(b, 5, 4, bx + 12, -17.5, 0xc8b48a, SURF.earth, 0, 0.3);
  washLine(b, rng, bx - 9.5, -17, 5);
  bench(b, bx + 4, -16, 0);
  for (const x of [-22, -2, 20]) tree(b, rng, bx + x, -18.5 + rng(), 8 + rng() * 3, false);
  for (const x of [-18, 14]) tree(b, rng, bx + x, 16.5, 7 + rng() * 2, false);
  flat(b, 7, 22, 23.5, -4, C.gravel, SURF.earth);
  for (let i = 0; i < 3; i++) if (rng() < 0.65) car(b, rng, 23.5, -12 + i * 6, Math.PI / 2);
}

/** Tuğla işçi konutu: L biçimli, dört katlı iki kanat, beşik çatılar, avluda çamaşır ve ağaçlar. */
function apartmentBrick(b: ArchBatch, rng: Rng): void {
  pad(b, 59, 43, C.grass, SURF.grass);
  const brick = pick(rng, C.brick);
  const roof = pick(rng, C.tile);
  const H = 0.8 + 4 * 3;
  const az = -11;
  A(b, BOX, 46, H, 10.5, 0, 0, az, 0, brick, SURF.brickHouse);
  gableRoof(b, 10.5, 46, 3.8, 0, H, az, Math.PI / 2, brick, SURF.brick, roof);
  const wx = -17.75;
  const wz = 5;
  A(b, BOX, 10.5, H, 21.5, wx, 0, wz, 0, brick, SURF.brickHouse);
  gableRoof(b, 10.5, 21.5, 3.8, wx, H, wz, 0, brick, SURF.brick, roof);
  for (const x of [-18, -6, 6, 18]) chimney(b, x, H, az - 1, 4.6, brick);
  chimney(b, wx, H, wz + 4, 4.6, brick);
  for (const x of [-4, 12]) {
    door(b, rng, x, az + 5.25, 0, 1.4, 2.5);
    A(b, BOX, 2.6, 0.2, 1.3, x, 2.95, az + 5.9, 0, C.concrete, SURF.concrete);
    flat(b, 1.6, 21 - (az + 5.25), x, (az + 5.25 + 21) / 2, C.pave, SURF.paving);
    downpipe(b, x + 6, az + 5.3, H);
  }
  door(b, rng, wx + 5.25, wz, Math.PI / 2, 1.4, 2.5);
  flat(b, 34, 2, 5, 12, C.pave, SURF.paving);
  washLine(b, rng, 5, 4, 6);
  bench(b, 16, 3, 0);
  for (const [x, z] of [[-4, 2], [14, 8], [24, 0], [22, 16], [-24, -18], [10, -19]]) tree(b, rng, x, z, 7 + rng() * 3, false);
  shed(b, 25, -17, 6);
  if (rng() < 0.6) car(b, rng, 25.5, 9, 0);
}

/** Şehir içi blok: zemin katta dükkânlar (vitrin, tente), üstte üç kat, dik mansart çatı ve çatı pencereleri. */
function apartmentTown(b: ArchBatch, rng: Rng): void {
  pad(b, 59, 43, C.pave, SURF.paving, [C.grass, SURF.grass]);
  const L = 44;
  const D = 12;
  const bz = 4;
  const fz = bz + D / 2;
  const H = 4.2 + 3 * 3.2;
  const wall = pick(rng, C.wall);
  const roof = rng() < 0.6 ? pick(rng, C.slate) : pick(rng, C.tile);
  A(b, BOX, L, H, D, 0, 0, bz, 0, wall, SURF.town);
  A(b, BOX, L + 0.5, 0.45, D + 0.5, 0, H - 0.45, bz, 0, C.trim, SURF.plaster);
  hipRoof(b, L, D, 3.2, 0, H, bz, roof, 0.3);
  A(b, BOX, L - 6, 0.3, D - 6, 0, H + 2.3, bz, 0, C.felt, SURF.felt);
  for (let x = -18; x <= 18; x += 6) {
    A(b, BOX, 1.6, 1.5, 1.6, x, H + 0.35, fz - 1.4, 0, wall, SURF.plaster);
    A(b, BOX, 1.9, 0.14, 1.9, x, H + 1.85, fz - 1.4, 0, roof, SURF.felt);
    windowPart(b, x, H + 0.7, fz - 0.58, 0.75, 0.85);
  }
  for (const x of [-16, -5, 6, 17]) chimney(b, x, H, bz - 2, 4.4, pick(rng, C.brick));
  for (let i = 0; i < 5; i++) shopFront(b, rng, -17.6 + i * 8.8, fz, 6.2);
  for (const x of [-13.2, 4.4]) door(b, rng, x, fz, 0, 1.2, 2.5, false);
  for (const x of [-22, 22]) downpipe(b, x - Math.sign(x) * 0.3, fz + 0.1, H);
  for (const x of [-22, -11, 11, 22]) lamp(b, x, 17);
  for (const x of [-16.5, 0, 16.5]) tree(b, rng, x, 17.5, 7 + rng() * 2, false);
  flat(b, 40, 12, 0, -13, C.grass, SURF.grass, 0, 0.12);
  for (const x of [-16, 14]) shed(b, x, -17, 7);
  for (const x of [-4, 6]) tree(b, rng, x, -14, 7 + rng() * 3, false);
  if (rng() < 0.7) truck(b, rng, 25, -6, 0);
  if (rng() < 0.6) car(b, rng, -25, -8, 0);
}

/** Kule blok: dokuz–on bir katlı nokta blok, köşe balkonları, camlı merdiven; yanında tek katlı dükkân eki, otopark. */
function apartmentTower(b: ArchBatch, rng: Rng): void {
  pad(b, 59, 43, C.grass, SURF.grass);
  const W = 17;
  const D = 15;
  const bx = -7;
  const bz = -3;
  const fz = bz + D / 2;
  const floors = 9 + Math.floor(rng() * 3);
  const H = 1 + floors * 3;
  const wall = pick(rng, [0xf0ece2, 0xe6e2d2, 0xdde3e0, 0xe9d9c0, 0xd9cdb8]);
  const panel = pick(rng, [0x9a5640, 0x4a6a78, 0x6e8a48, 0xc89a3e]);
  A(b, BOX, W + 0.6, 1, D + 0.6, bx, 0, bz, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, W, floors * 3, D, bx, 1, bz, 0, wall, SURF.aptWin);
  for (let f = 1; f < floors; f++) {
    for (const s of [-1, 1]) balcony(b, bx + s * (W / 2 - 2.4), 1 + f * 3, fz, 4.6, f % 2 ? panel : C.trim);
  }
  A(b, BOX, 2.2, H - 4.6, 0.12, bx, 3.6, fz + 0.07, 0, 0x3a4650, SURF.curtain);
  A(b, BOX, W + 0.8, 0.5, D + 0.8, bx, H, bz, 0, C.concrete, SURF.concrete);
  A(b, BOX, 5.5, 3, 5, bx - 2, H + 0.5, bz - 1, 0, wall, SURF.plaster);
  A(b, BOX, 0.12, 6, 0.12, bx + 4, H + 0.5, bz - 3, 0, C.dark, SURF.metal);
  roofClutter(b, rng, bx + 3, H + 0.5, bz + 2, 8, 7);
  for (const s of [-1, 1]) downpipe(b, bx + s * (W / 2 - 0.25), bz - D / 2 - 0.25, H);
  // Giriş saçağı
  A(b, BOX, 6, 0.25, 2.6, bx, 3.0, fz + 1.3, 0, C.concrete, SURF.concrete);
  for (const s of [-1, 1]) A(b, BOX, 0.2, 3, 0.2, bx + s * 2.7, 0, fz + 2.4, 0, C.dark, SURF.metal);
  door(b, rng, bx, fz, 0, 1.8, 2.5, false);
  flat(b, 2.4, 21 - fz, bx, (fz + 21) / 2, C.pave, SURF.paving);
  // Tek katlı ek: dükkân
  const ax = bx + W / 2 + 6.5;
  A(b, BOX, 13, 3.6, 9, ax, 0, bz + 2, 0, wall, SURF.plaster);
  A(b, BOX, 13.6, 0.3, 9.6, ax, 3.6, bz + 2, 0, C.concrete, SURF.concrete);
  shopFront(b, rng, ax, bz + 6.5, 9.5);
  flat(b, 13, 21 - (bz + 6.5), ax, (bz + 6.5 + 21) / 2, C.pave, SURF.paving);
  // Otopark, oyun alanı, ağaçlar
  flat(b, 12, 22, 22.5, -8, C.gravel, SURF.earth);
  for (let i = 0; i < 4; i++) if (rng() < 0.65) car(b, rng, 20 + (i % 2) * 5, -14 + Math.floor(i / 2) * 7, 0);
  flat(b, 6, 5, -23, 12, 0xc8b48a, SURF.earth, 0, 0.3);
  bench(b, -23, 7.5, 0);
  for (const [x, z] of [[-24, -16], [-21, -3], [-12, 17], [24, 14], [6, -17], [-8, -17]]) tree(b, rng, x, z, 8 + rng() * 3, false);
}

/** Bitişik nizam sokak: beş ayrı kasaba evi, her biri ayrı renkte, katta ve çatıda; çoğunun altı dükkân. */
function apartmentRow(b: ArchBatch, rng: Rng): void {
  pad(b, 59, 43, C.pave, SURF.paving, [C.grass, SURF.grass]);
  const dep = 11.5;
  const bz = 6;
  const fz = bz + dep / 2;
  const widths = [9, 10, 11, 11.5, 12.5].sort(() => rng() - 0.5);
  let x0 = -27;
  for (const w of widths) {
    const cx = x0 + w / 2;
    x0 += w;
    const H = 4.2 + (2 + Math.floor(rng() * 3)) * 3.1;
    const brickF = rng() < 0.3;
    const col = brickF ? pick(rng, C.brick) : pick(rng, C.wall);
    const roof = houseRoof(rng, 0.4);
    A(b, BOX, w, H, dep, cx, 0, bz, 0, col, brickF ? SURF.brickHouse : SURF.town);
    A(b, BOX, w + 0.05, 0.35, dep + 0.3, cx, H - 0.35, bz, 0, C.trim, SURF.plaster);
    const k = Math.floor(rng() * 3);
    if (k === 0) {
      gableRoof(b, w, dep, Math.min(w * 0.6, 6), cx, H, bz, 0, col, SURF.plaster, roof, SURF.tile, 0.2);
      windowPart(b, cx, H + 1.0, fz + 0.06, 0.8, 1.0);
    } else if (k === 1) {
      gableRoof(b, dep, w, dep * 0.42, cx, H, bz, Math.PI / 2, col, SURF.plaster, roof, SURF.tile, 0.2);
    } else {
      // Mansart: dik etek, üstü düz
      hipRoof(b, w, dep, 3.0, cx, H, bz, roof, 0.2);
      A(b, BOX, w - 5, 0.3, dep - 5, cx, H + 1.9, bz, 0, C.felt, SURF.felt);
    }
    chimney(b, cx + w * 0.25, H, bz - 2.5, 5.2, pick(rng, C.brick));
    downpipe(b, cx + w / 2 - 0.18, fz, H);
    if (rng() < 0.65) {
      shopFront(b, rng, cx - 0.8, fz, w - 3.8);
      door(b, rng, cx + w / 2 - 1.1, fz, 0, 1.0, 2.3, false);
    } else {
      door(b, rng, cx, fz, 0, 1.3, 2.4);
      for (const s of [-1, 1]) windowPart(b, cx + s * w * 0.3, 1.2, fz + 0.06, 1.1, 1.5);
    }
  }
  for (const x of [-22, -11, 0, 11, 22]) lamp(b, x, 18.5);
  for (const x of [-16.5, 5.5, 16.5]) tree(b, rng, x, 18.5, 6 + rng() * 2, false);
  // Arka avlular: çim, kulübeler, ağaçlar
  flat(b, 54, 15, 0, -10.5, C.grass, SURF.grass, 0, 0.12);
  for (const x of [-20, -2, 17]) shed(b, x, -17, 4);
  for (const x of [-11, 8, 23]) tree(b, rng, x, -12 + rng() * 3, 7 + rng() * 3, false);
  for (const x of [-14, 12]) washLine(b, rng, x, -7, 5);
  if (rng() < 0.6) car(b, rng, -24, 16, Math.PI / 2);
}

/** Bahçe içinde üç küp blok: üçer katlı, piramit çatılı, her biri ayrı renkte; aralarında patikalar ve oyun alanı. */
function apartmentVillas(b: ArchBatch, rng: Rng): void {
  pad(b, 59, 43, C.grass, SURF.grass);
  const S = 12;
  const H = 0.7 + 3 * 3.1;
  const roof = houseRoof(rng, 0.4);
  const cols = [...C.wall].sort(() => rng() - 0.5);
  const back = rng() < 0.5 ? 1 : -1;
  [[-19, -3 - back * 4], [0, -3 + back * 4], [19, -3 - back * 4]].forEach(([x, z], i) => {
    const fz = z + S / 2;
    A(b, BOX, S + 0.3, 0.7, S + 0.3, x, 0, z, 0, 0x8a8378, SURF.concrete);
    A(b, BOX, S, 3 * 3.1, S, x, 0.7, z, 0, cols[i], SURF.aptWin);
    A(b, BOX, S + 0.4, 0.4, S + 0.4, x, H - 0.4, z, 0, C.trim, SURF.plaster);
    hipRoof(b, S, S, 4.4, x, H, z, roof, 0.5);
    chimney(b, x + 2.5, H, z - 2, 3.8, pick(rng, C.brick));
    for (let f = 1; f <= 2; f++) balcony(b, x + 2.6, 0.7 + f * 3.1, fz, 4.4);
    A(b, BOX, 2.6, 0.2, 1.3, x - 2.6, 2.95, fz + 0.65, 0, C.concrete, SURF.concrete);
    door(b, rng, x - 2.6, fz, 0, 1.3, 2.4);
    downpipe(b, x + S / 2 - 0.2, fz, H);
    flat(b, 1.5, 17 - fz, x - 2.6, (fz + 17) / 2, C.pave, SURF.paving);
  });
  flat(b, 52, 1.6, 0, 17.5, C.pave, SURF.paving);
  flat(b, 6, 5, 9.5, -15, 0xc8b48a, SURF.earth, 0, 0.3);
  bench(b, 9.5, -11, 0);
  bench(b, -9.5, -13, 0);
  for (const [x, z] of [[-27, 12], [-9.5, -17], [9.5, 12], [27, 12], [-27, -17], [26, -17]]) tree(b, rng, x, z, 7 + rng() * 3, false);
}

/** Kademeli modern blok: altı, dört ve iki katlı üç gövde yan yana; alçalan damlarda korkuluklu teras ve çardak. */
function apartmentStepped(b: ArchBatch, rng: Rng): void {
  pad(b, 59, 43, C.grass, SURF.grass);
  const m = rng() < 0.5 ? 1 : -1;
  const D = 12;
  const bz = -4;
  const fz = bz + D / 2;
  const wall = pick(rng, [0xf0ece2, 0xe6e2d2, 0xdde3e0, 0xe9d9c0]);
  const panel = pick(rng, [0x9a5640, 0x4a6a78, 0x6e8a48, 0xc89a3e]);
  for (const [x, fl] of [[-17, 6], [-3, 4], [11, 2]]) {
    const cx = m * x;
    const H = 0.6 + fl * 3;
    A(b, BOX, 14, H, D, cx, 0, bz, 0, wall, SURF.aptWin);
    A(b, BOX, 14.4, 0.4, D + 0.4, cx, H, bz, 0, C.concrete, SURF.concrete);
    for (let f = 1; f < fl; f++) balcony(b, cx, 0.6 + f * 3, fz, 9, f % 2 ? panel : C.trim);
    if (fl < 6) {
      // Teras: korkuluk, çardak
      A(b, BOX, 14, 1.0, 0.07, cx, H + 0.4, fz - 0.1, 0, C.dark, SURF.metal);
      A(b, BOX, 0.07, 1.0, D, cx + m * 6.9, H + 0.4, bz, 0, C.dark, SURF.metal);
      for (const [px, pz] of [[-2.4, -2], [2.4, -2], [-2.4, 2], [2.4, 2]]) A(b, BOX, 0.16, 2.4, 0.16, cx + px, H + 0.4, bz + pz, 0, C.wood, SURF.wood);
      A(b, BOX, 5.6, 0.14, 4.8, cx, H + 2.8, bz, 0, C.wood, SURF.wood);
    } else {
      A(b, BOX, 5, 2.6, 4.5, cx, H + 0.4, bz - 1.5, 0, wall, SURF.plaster);
      roofClutter(b, rng, cx, H + 0.4, bz + 2.5, 10, 4);
    }
  }
  // Merdiven kulesi: yüksek gövde ile ortanca arasında, camlı
  const sx = m * -10;
  A(b, BOX, 3.4, 0.6 + 6 * 3 + 1.4, 2.4, sx, 0, fz + 0.9, 0, wall, SURF.plaster);
  A(b, BOX, 1.4, 15, 0.12, sx, 3.2, fz + 2.12, 0, 0x3a4650, SURF.curtain);
  door(b, rng, sx, fz + 2.1, 0, 1.5, 2.5);
  flat(b, 2, 21 - fz - 2.1, sx, (fz + 2.1 + 21) / 2, C.pave, SURF.paving);
  flat(b, 44, 1.8, m * -3, fz + 5, C.pave, SURF.paving);
  // Otopark alçak ucun yanında, ağaçlar
  flat(b, 8, 18, m * 24, -6, C.gravel, SURF.earth);
  for (let i = 0; i < 3; i++) if (rng() < 0.65) car(b, rng, m * 24, -12 + i * 6, Math.PI / 2);
  for (const [x, z] of [[-25, 16], [-8, 17], [12, 16], [-20, -17], [0, -17], [14, -17]]) tree(b, rng, m * x, z, 7 + rng() * 3, false);
}

/** Apartman: sekiz ayrı biçimden biri (kimliğin tohumundan). */
function apartment(b: ArchBatch, rng: Rng): void {
  const all = [apartmentTower, apartmentRow, apartmentVillas, apartmentStepped, apartmentBlock, apartmentModern, apartmentBrick, apartmentTown];
  all[Math.floor(rng() * all.length)](b, rng);
  // Hepsinde: arsanın ön köşesinde çöp bidonları, bisiklet demiri ve bisikletler, ilan sütunu, sokak lambası
  for (let i = 0; i < 3; i++) A(b, CYL, 0.3, 0.85, 0.3, -27.6 + i * 0.75, TOP, 19.6, 0, pick(rng, [0x6a6d70, 0x55585c, 0x4a5642]), SURF.metal);
  A(b, BOX, 3.2, 0.05, 0.05, -24, TOP + 0.75, 19.9, 0, C.dark, SURF.metal);
  for (let i = 0; i < 3; i++) {
    A(b, BOX, 0.05, 0.75, 0.05, -25.4 + i * 1.4, TOP, 19.9, 0, C.dark, SURF.metal);
    if (rng() < 0.6) bicycle(b, rng, -24.8 + i * 1.3, 19.4);
  }
  b.push(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 10).translate(0, 1.3, 0), 0x6a5a48, SURF.plaster, 0, 27, TOP, 19.4);
  b.push(new THREE.ConeGeometry(0.75, 0.5, 10).translate(0, 0.25, 0), 0x3e5a48, SURF.metal, 0, 27, TOP + 2.6, 19.4);
  lamp(b, 20, 20);
}

/** Bisiklet: iki teker, gövde, gidon (duvara ya da demire dayalı). */
function bicycle(b: ArchBatch, rng: Rng, x: number, z: number): void {
  const col = pick(rng, [0x2e3032, 0x5e3a32, 0x3a4252, 0x4a5642]);
  for (const s of [-1, 1]) b.push(new THREE.TorusGeometry(0.33, 0.025, 5, 12).rotateY(Math.PI / 2), 0x1c1d1e, SURF.plain, 0, x, TOP + 0.35, z + s * 0.52);
  b.push(beam(0, 0.4, -0.5, 0, 0.85, 0.3, 0.04), col, SURF.metal, 0, x, TOP, z);
  b.push(beam(0, 0.85, 0.3, 0, 0.4, 0.5, 0.04), col, SURF.metal, 0, x, TOP, z);
  A(b, BOX, 0.4, 0.04, 0.04, x, TOP + 1.0, z + 0.36, 0, col, SURF.metal);
  A(b, BOX, 0.14, 0.05, 0.24, x, TOP + 0.9, z - 0.32, 0, 0x3a2a1c, SURF.wood);
}

// ------------------------------------------------------------------ çarşı

/**
 * Kasaba evi: x yönüne (dir: −1 meydan solda) bakan dar ev; derinlik dep, cephe eni w (z boyunca). Zemin katta vitrin
 * camı, tabela ve tente; üst katlar silmeli. Çatı ya saçağı meydana (mahya boyuna) ya da alnı meydana.
 */
function townHouse(b: ArchBatch, rng: Rng, cx: number, z: number, w: number, dir: number, dep: number): void {
  const upper = 2 + Math.floor(rng() * 2);
  const H = 4.2 + upper * 3.2 + 0.3;
  const brickFront = rng() < 0.2;
  const col = brickFront ? pick(rng, C.brick) : pick(rng, C.wall);
  const roof = rng() < 0.8 ? pick(rng, C.tile) : pick(rng, C.slate);
  A(b, BOX, dep, H, w, cx, 0, z, 0, col, brickFront ? SURF.brickHouse : SURF.town);
  A(b, BOX, dep + 0.3, 0.3, w + 0.05, cx, H - 0.3, z, 0, C.trim, SURF.plaster);
  if (rng() < 0.5) gableRoof(b, dep, w, dep * 0.45, cx, H, z, 0, col, SURF.plaster, roof, SURF.tile, 0.4);
  else gableRoof(b, w, dep, w * 0.7, cx, H, z, Math.PI / 2, col, SURF.plaster, roof, SURF.tile, 0.3);
  chimney(b, cx + dir * dep * 0.2, H, z + (rng() - 0.5) * w * 0.4, 3.6, pick(rng, C.brick));
  const fx = cx + (dir * dep) / 2;
  A(b, BOX, 0.2, 2.7, w - 1.8, fx + dir * 0.06, 0.5, z, 0, C.glass, SURF.curtain);
  A(b, BOX, 0.14, 0.55, w - 1.2, fx + dir * 0.08, 3.35, z, 0, pick(rng, C.sign), SURF.plain);
  A(b, BOX, 1.7, 0.16, w - 1.4, fx + dir * 0.85, 3.0, z, 0, pick(rng, C.awning), SURF.canvas);
  door(b, rng, fx, z + (w - 1.8) / 2 + 0.25, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0.4, 2.3, false);
}

/** Pazar tezgâhı: ahşap tezgâh, kanvas tente. */
function stall(b: ArchBatch, rng: Rng, x: number, z: number): void {
  A(b, BOX, 3, 0.95, 2, x, TOP, z, 0, pick(rng, C.crate), SURF.wood);
  for (const s of [-1, 1]) A(b, BOX, 0.1, 2.2, 0.1, x + s * 1.45, TOP, z - 0.9, 0, C.wood, SURF.wood);
  A(b, GABLE, 3.4, 0.7, 2.6, x, TOP + 2.2, z, Math.PI / 2, pick(rng, C.awning), SURF.canvas);
}

function shops(b: ArchBatch, rng: Rng): void {
  // Pazar meydanı: iki yanda kasaba evleri (dükkânlı zemin kat), kuzey ucunda saat kuleli belediye binası, ortada
  // heykelli çeşme, tezgâh sıraları, güney ucunda ağaç sırası ve sokak lambaları. Zemin parke taşı
  pad(b, 131, 103, C.cobble, SURF.paving, [C.grass, SURF.grass]);
  for (const dir of [-1, 1]) {
    const cx = -dir * 57.5;
    let z0 = -50;
    while (z0 < 49) {
      let w = 7 + rng() * 4;
      if (49 - (z0 + w) < 5) w = 49 - z0;
      townHouse(b, rng, cx, z0 + w / 2, w, dir, 13);
      z0 += w;
    }
  }
  // Belediye binası: kesme taş, arduvaz kırma çatı, ortada saat kulesi ve bakır piramit külah, taş söveli kapı
  const stone = pick(rng, C.stone);
  const rz = -44;
  const H = 12.6;
  A(b, BOX, 40, H, 13, 0, 0, rz, 0, stone, SURF.stone);
  A(b, BOX, 40.5, 0.5, 13.5, 0, H - 0.5, rz, 0, C.trim, SURF.concrete);
  hipRoof(b, 40, 13, 5.5, 0, H, rz, pick(rng, C.slate));
  const tz = rz + 3.5;
  A(b, BOX, 6.4, 27, 6.4, 0, 0, tz, 0, stone, SURF.concrete);
  A(b, BOX, 7, 0.5, 7, 0, 27, tz, 0, C.trim, SURF.concrete);
  A(b, BOX, 5.6, 3.2, 5.6, 0, 27.5, tz, 0, 0x4a4844, SURF.metal);
  hipRoof(b, 6.4, 6.4, 8, 0, 30.7, tz, C.copper, 0.3);
  for (const [sx, sz, ry] of [[0, 3.25, 0], [3.25, 0, Math.PI / 2], [-3.25, 0, Math.PI / 2], [0, -3.25, 0]] as const) {
    b.push(new THREE.CylinderGeometry(1.35, 1.35, 0.12, 16).rotateX(Math.PI / 2), 0xe8e2d4, SURF.plain, ry, sx, 22, tz + sz);
  }
  door(b, rng, 0, tz + 3.25, 0, 2.4, 3.6);
  A(b, BOX, 8, 0.3, 2.4, 0, 0, tz + 4.6, 0, 0xb8b0a2, SURF.concrete);
  // Çeşme: sekizgen taş havuz, su, sütun ve heykel
  b.push(new THREE.CylinderGeometry(5.2, 5.4, 0.8, 8).translate(0, 0.4, 0), C.concrete, SURF.concrete, 0, 0, TOP, 2);
  A(b, DISC, 4.7, 0.85, 4.7, 0, TOP, 2, 0, C.water, SURF.water);
  A(b, CYL, 0.6, 4.2, 0.6, 0, TOP, 2, 0, C.concrete, SURF.concrete);
  A(b, BOX, 0.7, 1.8, 0.55, 0, TOP + 4.2, 2, 0, 0x4d5a4a, SURF.metal);
  // Tezgâhlar
  for (const z of [-24, 18, 28]) {
    for (let x = -30; x <= 30; x += 12) if (Math.abs(x) > 8 || z !== -24) stall(b, rng, x + (rng() - 0.5) * 2, z);
  }
  for (let x = -40; x <= 40; x += 16) tree(b, rng, x, 46, 8 + rng() * 2, false);
  for (const [x, z] of [[-9, -6], [9, -6], [-9, 10], [9, 10]]) tree(b, rng, x, z, 7, false);
  for (const z of [-30, -6, 18, 40]) for (const x of [-46, 46]) lamp(b, x, z);
  car(b, rng, -42, 30, 0);
  truck(b, rng, 44, -20, Math.PI);
}

// ------------------------------------------------------------------ belediye binası

/** Meydanın ön kenarından ana caddenin başına kadar yol (sim caddesi tabanın 5 m önünden başlar: roads.ts). */
function townApron(b: ArchBatch): void {
  A(b, BOX, 10, 0.3, 7, 0, 0, 29.7, 0, 0xcfc6b4, SURF.paving);
  A(b, BOX, 7, 0.44, 7.2, 0, 0, 29.8, 0, 0x7f7a72, SURF.asphalt);
  flat(b, 7, 12, 0, 21, 0x8a857c, SURF.paving, 0, 0.1);
}

/** Belediye binası: iki tasarımdan biri (kimliğin tohumundan). */
function townhall(b: ArchBatch, rng: Rng): void {
  if (rng() < 0.5) townhallTower(b, rng);
  else townhallBaroque(b, rng);
  townApron(b);
  // Meydanın ortak ayrıntıları: yol kenarında zincirli babalar, girişin iki yanında çiçekli taş saksılar, ilan panosu,
  // bisiklet demiri, çöp kutuları, köşelerde çift fenerli lambalar
  for (let x = -30; x <= 30; x += 3.75) {
    if (Math.abs(x) < 5) continue;
    A(b, CYL, 0.14, 0.75, 0.14, x, TOP, 26.2, 0, 0x2f3236, SURF.metal);
    A(b, CYL, 0.18, 0.1, 0.18, x, TOP + 0.75, 26.2, 0, 0x2f3236, SURF.metal);
  }
  for (const s of [-1, 1]) {
    A(b, BOX, 22.5, 0.04, 0.04, s * 18.75, TOP + 0.6, 26.2, 0, 0x2f3236, SURF.metal);
    A(b, BOX, 1.5, 0.75, 1.5, s * 6.2, TOP, -0.5, 0, 0xb8b0a2, SURF.concrete);
    A(b, BOX, 1.25, 0.35, 1.25, s * 6.2, TOP + 0.75, -0.5, 0, pick(rng, C.flowers), SURF.grass);
    A(b, BOX, 0.3, 0.5, 0.3, s * 30.5, TOP, 23, 0, C.dark, SURF.metal);
    A(b, CYL, 0.09, 4.4, 0.09, s * 30.5, TOP + 0.5, 23, 0, C.dark, SURF.metal);
    A(b, BOX, 1.5, 0.07, 0.07, s * 30.5, TOP + 4.6, 23, 0, C.dark, SURF.metal);
    for (const t of [-1, 1]) A(b, BOX, 0.32, 0.4, 0.32, s * 30.5 + t * 0.7, TOP + 4.15, 23, 0, 0xe6d9a0, SURF.plain);
    A(b, CYL, 0.28, 0.8, 0.28, s * 14.5, TOP, 24.6, 0, 0x4a5642, SURF.metal);
  }
  A(b, BOX, 2.4, 1.5, 0.12, -13.5, TOP + 0.9, 3, 0, 0x2e3a2e, SURF.wood);
  for (const s of [-1, 1]) A(b, BOX, 0.1, 2.4, 0.1, -13.5 + s * 1.15, TOP, 3, 0, 0x5a4632, SURF.wood);
  A(b, BOX, 1.9, 0.9, 0.04, -13.5, TOP + 1.2, 3.08, 0, 0xd8d0bc, SURF.plain);
  A(b, BOX, 3.2, 0.05, 0.05, 13.5, TOP + 0.75, 3, 0, C.dark, SURF.metal);
  for (let i = 0; i < 3; i++) {
    A(b, BOX, 0.05, 0.75, 0.05, 12.1 + i * 1.4, TOP, 3, 0, C.dark, SURF.metal);
    if (rng() < 0.6) bicycle(b, rng, 12.7 + i * 1.3, 2.5);
  }
}

function townhallBaroque(b: ArchBatch, rng: Rng): void {
  // Aşı sarısı barok konak: uzun iki katlı gövde, dik arduvaz ya da bakır çatı, ortada sütunlu ve alınlıklı giriş
  // bölümü, balkon, mahyada bakır külahlı fener kule. Önünde simetrik çiçek tarhları, ortada anıt, ıhlamur sıraları
  pad(b, 66, 54, C.cobble, SURF.paving, [C.grass, SURF.grass]);
  const wall = pick(rng, [0xe2c878, 0xdcc48a, 0xe6d6a6]);
  const roof = rng() < 0.5 ? C.copper : pick(rng, C.slate);
  const rz = -15;
  const H = 9.6;
  A(b, BOX, 50, H, 13, 0, 0, rz, 0, wall, SURF.stone);
  A(b, BOX, 50.6, 0.5, 13.6, 0, H - 0.5, rz, 0, C.trim, SURF.concrete);
  A(b, BOX, 50.3, 0.3, 13.3, 0, 4.6, rz, 0, C.trim, SURF.concrete);
  hipRoof(b, 50, 13, 5.2, 0, H, rz, roof, 0.5);
  for (const x of [-19, -12, 12, 19]) {
    A(b, BOX, 1.7, 1.6, 2.0, x, H + 0.4, rz + 4.9, 0, wall, SURF.plaster);
    A(b, BOX, 2.1, 0.16, 2.3, x, H + 2.0, rz + 4.95, 0, roof, SURF.felt);
    windowPart(b, x, H + 0.75, rz + 5.92, 0.75, 0.9);
  }
  for (const x of [-21, 21]) chimney(b, x, H, rz - 3, 6, pick(rng, C.brick));
  // Giriş bölümü: öne çıkan, daha yüksek; dört sütun, balkon, alınlık
  const RH = 12.4;
  const pz = rz + 6.5;
  A(b, BOX, 16, RH, 4, 0, 0, pz, 0, wall, SURF.stone);
  A(b, BOX, 16.6, 0.6, 4.6, 0, RH - 0.6, pz, 0, C.trim, SURF.concrete);
  gableRoof(b, 16.6, 4.6, 3.0, 0, RH, pz, 0, wall, SURF.concrete, roof, SURF.tile, 0.3);
  for (const x of [-6, -2.2, 2.2, 6]) A(b, CYL, 0.45, RH - 1.2, 0.45, x, 0.6, pz + 2.9, 0, C.trim, SURF.concrete);
  A(b, BOX, 15, 0.3, 2.2, 0, 4.7, pz + 2.9, 0, C.trim, SURF.concrete);
  A(b, BOX, 15, 0.9, 0.08, 0, 5.0, pz + 3.96, 0, C.dark, SURF.metal);
  door(b, rng, 0, pz + 2.0, 0, 2.6, 3.8, false);
  for (let i = 0; i < 3; i++) A(b, BOX, 16 - i * 1.2, 0.3 * (3 - i), 1.0, 0, 0, pz + 3.4 + (2 - i) * 1.0, 0, 0xb8b0a2, SURF.concrete);
  // Fener kule: mahyada sekizgen gövde, bakır külah
  b.push(new THREE.CylinderGeometry(1.9, 2.1, 4.2, 8).translate(0, 2.1, 0), wall, SURF.plaster, 0, 0, H + 4.2, rz);
  b.push(new THREE.CylinderGeometry(2.4, 2.4, 0.3, 8).translate(0, 0.15, 0), C.trim, SURF.concrete, 0, 0, H + 8.4, rz);
  b.push(new THREE.ConeGeometry(2.3, 4.6, 8).translate(0, 2.3, 0), C.copper, SURF.tile, 0, 0, H + 8.7, rz);
  A(b, BOX, 0.12, 2.2, 0.12, 0, H + 13.2, rz, 0, C.dark, SURF.metal);
  // Meydan: iki yanda çiçek tarhlı çim, ortada anıt, bayrak direkleri, ıhlamurlar, lambalar
  for (const s of [-1, 1]) {
    flat(b, 16, 16, s * 18, 10, C.grass, SURF.grass, 0, 0.12);
    // Çiçek tarhı: toprak zemin üstünde alçak çiçek öbekleri
    flat(b, 9, 9, s * 18, 10, C.earth, SURF.earth, 0, 0.2);
    for (let i = 0; i < 9; i++) {
      A(b, BOX, 1.9, 0.3 + rng() * 0.2, 1.9, s * 18 + ((i % 3) - 1) * 2.8, TOP + 0.1, 10 + (Math.floor(i / 3) - 1) * 2.8, 0, i % 2 ? pick(rng, C.flowers) : C.hedge, SURF.grass);
    }
    for (const z of [0, 20]) tree(b, rng, s * 28.5, z, 8 + rng() * 2, false);
    tree(b, rng, s * 28.5, 10, 8 + rng() * 2, false);
    for (const z of [0, 20]) lamp(b, s * 8, z);
    bench(b, s * 8.5, 10, Math.PI / 2);
    A(b, BOX, 0.18, 12, 0.18, s * 10.5, TOP, -3.5, 0, 0xd8d6d0, SURF.metal);
  }
  A(b, BOX, 3.2, 1.6, 3.2, 0, TOP, 10, 0, C.concrete, SURF.concrete);
  A(b, BOX, 1.1, 3.4, 0.9, 0, TOP + 1.6, 10, 0, 0x4d5a4a, SURF.metal);
  if (rng() < 0.7) car(b, rng, 24, 24, Math.PI / 2);
}

function townhallTower(b: ArchBatch, rng: Rng): void {
  // Kasabanın merkezi: kesme taş ana blok (arduvaz kırma çatı), iki yanında alçak kanatlar, önde saat kulesi ve bakır
  // külah, taş söveli kapı ve geniş merdiven. Önünde parke taşı meydan: çeşme, bayrak direkleri, ıhlamurlar, lambalar,
  // banklar. Ana cadde meydanın ön kenarından (+z) başlar (sim: roads.ts TOWN_ROAD)
  pad(b, 66, 54, C.cobble, SURF.paving, [C.grass, SURF.grass]);
  const stone = pick(rng, C.stone);
  const slate = pick(rng, C.slate);
  const rz = -15;
  const H = 12.6;
  A(b, BOX, 34, H, 14, 0, 0, rz, 0, stone, SURF.stone);
  A(b, BOX, 34.6, 0.5, 14.6, 0, H - 0.5, rz, 0, C.trim, SURF.concrete);
  hipRoof(b, 34, 14, 5.5, 0, H, rz, slate);
  for (const x of [-11, 11]) chimney(b, x, H, rz - 3, 6.2, pick(rng, C.brick));
  // Çatı pencereleri
  for (const x of [-11, -5.5, 5.5, 11]) {
    A(b, BOX, 1.8, 1.6, 2.2, x, H + 0.5, rz + 5.4, 0, stone, SURF.plaster);
    A(b, BOX, 2.2, 0.16, 2.5, x, H + 2.1, rz + 5.45, 0, slate, SURF.felt);
    windowPart(b, x, H + 0.85, rz + 6.52, 0.8, 0.95);
  }
  // Yan kanatlar: iki katlı, kiremit kırma çatı
  const wing = pick(rng, C.tile);
  for (const s of [-1, 1]) {
    A(b, BOX, 11, 8.2, 12, s * 22.5, 0, rz, 0, stone, SURF.stone);
    A(b, BOX, 11.5, 0.4, 12.5, s * 22.5, 7.8, rz, 0, C.trim, SURF.concrete);
    hipRoof(b, 11, 12, 3.8, s * 22.5, 8.2, rz, wing);
  }
  // Saat kulesi: ana bloğun önünde, dört yüzünde saat, bakır külah
  const tz = rz + 4.5;
  A(b, BOX, 6.4, 27, 6.4, 0, 0, tz, 0, stone, SURF.concrete);
  A(b, BOX, 7, 0.5, 7, 0, 27, tz, 0, C.trim, SURF.concrete);
  A(b, BOX, 5.6, 3.2, 5.6, 0, 27.5, tz, 0, 0x4a4844, SURF.metal);
  hipRoof(b, 6.4, 6.4, 8, 0, 30.7, tz, C.copper, 0.3);
  for (const [sx, sz, ry] of [[0, 3.25, 0], [3.25, 0, Math.PI / 2], [-3.25, 0, Math.PI / 2], [0, -3.25, 0]] as const) {
    b.push(new THREE.CylinderGeometry(1.35, 1.35, 0.12, 16).rotateX(Math.PI / 2), 0xe8e2d4, SURF.plain, ry, sx, 22, tz + sz);
  }
  door(b, rng, 0, tz + 3.25, 0, 2.4, 3.6, false);
  for (let i = 0; i < 3; i++) A(b, BOX, 10 - i * 1.2, 0.3 * (3 - i), 1.0, 0, 0, tz + 3.8 + (2 - i) * 1.0, 0, 0xb8b0a2, SURF.concrete);
  // Meydan: sekizgen çeşme, bayrak direkleri, ağaç sıraları, lambalar, banklar
  b.push(new THREE.CylinderGeometry(4.2, 4.4, 0.7, 8).translate(0, 0.35, 0), C.concrete, SURF.concrete, 0, 0, TOP, 10);
  A(b, DISC, 3.7, 0.75, 3.7, 0, TOP, 10, 0, C.water, SURF.water);
  A(b, CYL, 0.5, 3.2, 0.5, 0, TOP, 10, 0, C.concrete, SURF.concrete);
  for (const x of [-8, 8]) A(b, BOX, 0.18, 13, 0.18, x, TOP, 0, 0, 0xd8d6d0, SURF.metal);
  for (const s of [-1, 1]) {
    for (const z of [-2, 8, 18]) tree(b, rng, s * 22, z, 8 + rng() * 2, false);
    for (const z of [3, 22]) lamp(b, s * 12.5, z);
    bench(b, s * 9, 16, s * 0.5);
    flat(b, 12, 18, s * 20.5, 10, C.grass, SURF.grass, 0, 0.12);
  }
  if (rng() < 0.8) car(b, rng, -24, 23.5, Math.PI / 2);
  if (rng() < 0.4) car(b, rng, 22, 23.5, Math.PI / 2);
}

// ------------------------------------------------------------------ itfaiye merkezi

const FIRE_RED = 0x9a2a22;

/** Garaj kapısı: kemerli beton lento, kırmızı pano kanatlar, üstte cam sırası, önünde beton eşik. Ön yüz z = fz. */
function engineDoor(b: ArchBatch, x: number, fz: number, open: boolean): void {
  A(b, BOX, 4.4, 4.5, 0.16, x, 0, fz + 0.02, 0, 0xc9c0ae, SURF.concrete);
  if (open) {
    // Açık kapı: karanlık garaj içi, yanlara katlanmış kanatlar
    A(b, BOX, 3.8, 4.0, 0.1, x, 0, fz + 0.08, 0, 0x16181a, SURF.plain);
    for (const s of [-1, 1]) A(b, BOX, 0.5, 4.0, 0.14, x + s * 1.7, 0, fz + 0.16, 0, FIRE_RED, SURF.hangarDoor);
  } else {
    A(b, BOX, 3.8, 3.0, 0.14, x, 0, fz + 0.1, 0, FIRE_RED, SURF.hangarDoor);
    A(b, BOX, 3.8, 1.0, 0.12, x, 3.0, fz + 0.1, 0, 0x3a4650, SURF.curtain);
    A(b, BOX, 0.1, 4.0, 0.18, x, 0, fz + 0.12, 0, 0x6a1c18, SURF.metal);
    for (const s of [-1, 1]) A(b, BOX, 0.12, 0.5, 0.1, x + s * 0.35, 1.3, fz + 0.2, 0, 0x2f3236, SURF.metal);
  }
  A(b, BOX, 4.6, 0.12, 2.2, x, TOP, fz + 1.2, 0, 0x9a968c, SURF.paving);
  A(b, BOX, 0.5, 0.5, 0.3, x - 2.45, 0, fz + 0.2, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, 0.5, 0.5, 0.3, x + 2.45, 0, fz + 0.2, 0, 0x8a8378, SURF.concrete);
}

/** Hortum kulesi: tuğla gövde, üstte panjurlu kurutma katı, piramit çatı, rüzgârgülü; üst seviyede gözetleme balkonu ve çan. */
function hoseTower(b: ArchBatch, x: number, z: number, h: number, brick: number, roof: number, gallery: boolean): void {
  A(b, BOX, 3.6, 0.6, 3.6, x, 0, z, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, 3.2, h, 3.2, x, 0.6, z, 0, brick, SURF.brick);
  for (let y = 4; y < h - 3; y += 3.6) windowPart(b, x, y, z + 1.62, 0.7, 1.3);
  A(b, BOX, 3.5, 0.3, 3.5, x, 0.6 + h, z, 0, C.trim, SURF.concrete);
  // Panjurlu kat: dört yüzde koyu ahşap panjur
  A(b, BOX, 3.0, 2.6, 3.0, x, 0.9 + h, z, 0, brick, SURF.brick);
  for (const [dx, dz, w, d] of [[0, 1.52, 2.0, 0.08], [0, -1.52, 2.0, 0.08], [1.52, 0, 0.08, 2.0], [-1.52, 0, 0.08, 2.0]]) {
    A(b, BOX, w, 1.9, d, x + dx, 1.2 + h, z + dz, 0, 0x3a3026, SURF.wood);
  }
  if (gallery) {
    A(b, BOX, 4.6, 0.2, 4.6, x, 0.7 + h, z, 0, C.concrete, SURF.concrete);
    for (const [dx, dz, w, d] of [[0, 2.25, 4.6, 0.06], [0, -2.25, 4.6, 0.06], [2.25, 0, 0.06, 4.6], [-2.25, 0, 0.06, 4.6]]) {
      A(b, BOX, w, 1.0, d, x + dx, 0.9 + h, z + dz, 0, C.dark, SURF.metal);
    }
  }
  A(b, BOX, 3.5, 0.25, 3.5, x, 3.5 + h, z, 0, C.trim, SURF.concrete);
  hipRoof(b, 3.2, 3.2, 3.2, x, 3.75 + h, z, roof, 0.35);
  A(b, BOX, 0.08, 1.8, 0.08, x, 6.9 + h, z, 0, C.dark, SURF.metal);
  A(b, BOX, 0.9, 0.06, 0.06, x, 8.2 + h, z, 0, C.dark, SURF.metal);
}

/** Siren: çatıda direk üstünde çift borulu elektrikli siren. */
function siren(b: ArchBatch, x: number, y: number, z: number): void {
  A(b, CYL, 0.07, 1.6, 0.07, x, y, z, 0, C.dark, SURF.metal);
  b.push(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 12), 0x7c8084, SURF.metal, 0, x, y + 1.85, z);
  b.push(new THREE.CylinderGeometry(0.55, 0.3, 0.2, 12), 0xb0342a, SURF.metal, 0, x, y + 2.2, z);
}

/** Yangın musluğu. */
function hydrant(b: ArchBatch, x: number, z: number): void {
  A(b, CYL, 0.16, 0.75, 0.16, x, TOP, z, 0, 0xb0342a, SURF.metal);
  A(b, CYL, 0.2, 0.12, 0.2, x, TOP + 0.75, z, 0, 0x8a2a22, SURF.metal);
  A(b, BOX, 0.5, 0.14, 0.14, x, TOP + 0.45, z, 0, 0x8a2a22, SURF.metal);
}

/** Merdiven: iki kiriş ve basamaklar; x boyunca len, (x, y, z) ortası. */
function ladderPart(b: ArchBatch, x: number, y: number, z: number, len: number, ry = 0): void {
  const dx = Math.cos(ry);
  const dz = -Math.sin(ry);
  for (const s of [-1, 1]) A(b, BOX, len, 0.07, 0.05, x - dz * s * 0.22, y, z + dx * s * 0.22, ry, 0xb89a62, SURF.wood);
  const n = Math.round(len / 0.45);
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (i * len) / n;
    A(b, BOX, 0.04, 0.04, 0.44, x + dx * t, y + 0.01, z + dz * t, ry, 0xa88a55, SURF.wood);
  }
}

function firestation(b: ArchBatch, rng: Rng, level: number): void {
  // 1930'lar itfaiye binası: tuğla garaj bloğu (seviyeye göre 2, 3, 4 kapı), yanda nöbet odası, arkada hortum kulesi.
  // 2. seviyede üstüne yatakhane katı ve atölye, 3. seviyede çatı pencereleri, gözetleme balkonlu yüksek kule ve
  // beton talim kulesi gelir. Önde beton manevra sahası: yangın musluğu, hortum arabası, merdiven askısı, kovalar,
  // bayrak direği, çan; arkada yakıt ve su deposu
  pad(b, 41, 33, 0xa9a59b, SURF.runway, [C.grass, SURF.grass]);
  const brick = pick(rng, [0x8c4d3a, 0x94523c, 0x7e4636]);
  const roof = rng() < 0.3 ? pick(rng, C.slate) : pick(rng, C.tile);
  const bays = 1 + level;
  const W = bays * 5 + 1.6;
  const D = 10.5;
  const gx = -3.5 + (4 - bays) * 0.6;
  const gz = -8.5;
  const fz = gz + D / 2;
  const g0 = 5.2;
  const up = level >= 2 ? 3.4 : 0;
  const H = g0 + up;
  // Kaide ve garaj bloğu
  A(b, BOX, W + 0.3, 0.5, D + 0.3, gx, 0, gz, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, W, g0, D, gx, 0, gz, 0, brick, SURF.brick);
  A(b, BOX, W + 0.2, 0.7, 0.2, gx, 4.5, fz + 0.06, 0, 0xe4ddcf, SURF.plaster);
  A(b, BOX, W * 0.5, 0.36, 0.1, gx, 4.67, fz + 0.2, 0, FIRE_RED, SURF.plain);
  if (up) {
    // Yatakhane katı: tuğla, pencereli; kat silmesi
    A(b, BOX, W + 0.25, 0.25, D + 0.25, gx, g0, gz, 0, C.trim, SURF.concrete);
    A(b, BOX, W, up, D, gx, g0, gz, 0, brick, SURF.brickHouse);
  }
  A(b, BOX, W + 0.4, 0.35, D + 0.4, gx, H - 0.35, gz, 0, C.trim, SURF.concrete);
  const rh = level === 1 ? 3.0 : 3.6;
  hipRoof(b, W, D, rh, gx, H, gz, roof, 0.6);
  for (let i = 0; i < bays; i++) engineDoor(b, gx - ((bays - 1) * 5) / 2 + i * 5, fz, i === bays - 1 && rng() < 0.6);
  for (const s of [-1, 1]) downpipe(b, gx + s * (W / 2 - 0.2), fz, H);
  chimney(b, gx + W * 0.3, H, gz - 2, rh + 0.6, brick);
  siren(b, gx - W * 0.25, H + rh * 0.55, gz);
  if (level >= 3) {
    for (let i = 0; i < 3; i++) dormer(b, gx - 6 + i * 6, H, fz, 0xd8d0bc, roof);
  }
  // Nöbet odası: yanda tek katlı (2. seviyeden sonra iki katlı), kapısı öne
  const ox = gx + W / 2 + 3.4;
  const oh = level >= 2 ? 6.2 : 3.4;
  A(b, BOX, 6.8, 0.5, 8.3, ox, 0, gz + 1, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, 6.5, oh, 8, ox, 0, gz + 1, 0, brick, SURF.brickHouse);
  A(b, BOX, 6.9, 0.3, 8.4, ox, oh - 0.3, gz + 1, 0, C.trim, SURF.concrete);
  hipRoof(b, 6.5, 8, 2.2, ox, oh, gz + 1, roof, 0.5);
  door(b, rng, ox - 1.4, gz + 5, 0, 1.1, 2.3);
  A(b, BOX, 2.4, 0.16, 1.2, ox - 1.4, 2.7, gz + 5.6, 0, roof, SURF.felt);
  // Nöbet odası önünde çan direği ve ilan tahtası
  A(b, BOX, 0.14, 2.6, 0.14, ox + 3.9, TOP, gz + 6.8, 0, C.dark, SURF.metal);
  A(b, BOX, 0.7, 0.1, 0.14, ox + 3.6, TOP + 2.5, gz + 6.8, 0, C.dark, SURF.metal);
  b.push(new THREE.CylinderGeometry(0.12, 0.26, 0.36, 10), 0xb8a060, SURF.metal, 0, ox + 3.3, TOP + 2.1, gz + 6.8);
  A(b, BOX, 1.4, 1.0, 0.08, ox + 0.9, 1.1, gz + 5.06, 0, 0x2e3a2e, SURF.wood);
  // Hortum kulesi: arkada, bloğun köşesinde
  hoseTower(b, gx - W / 2 - 0.4, gz - 3.4, level === 1 ? 10.5 : level === 2 ? 13.5 : 17.5, brick, roof, level >= 3);
  // Atölye (2. seviye): arkada oluklu sac çatılı tuğla kanat
  if (level >= 2) {
    A(b, BOX, 9, 3.4, 5, ox - 1, 0, gz - 6.2, 0, brick, SURF.brick);
    A(b, BOX, 9.6, 0.2, 5.8, ox - 1, 3.4, gz - 6.2, 0, 0x8a8d90, SURF.corrugated);
    A(b, BOX, 3.2, 2.8, 0.12, ox - 1, 0, gz - 3.66, 0, 0x5e6058, SURF.hangarDoor);
  }
  // Talim kulesi (3. seviye): beton iskelet, dört kat, dış merdiven
  if (level >= 3) {
    const tx = 15.5;
    const tz = -11;
    for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) A(b, BOX, 0.4, 13, 0.4, tx + dx, 0, tz + dz, 0, C.concrete, SURF.concrete);
    for (let f = 1; f <= 4; f++) {
      A(b, BOX, 4.2, 0.25, 4.2, tx, f * 3.1, tz, 0, C.concrete, SURF.concrete);
      A(b, BOX, 4.0, 0.9, 0.06, tx, f * 3.1 + 0.25, tz + 2.0, 0, C.dark, SURF.metal);
    }
    A(b, BOX, 4.0, 3.0, 0.2, tx, 0, tz - 1.9, 0, brick, SURF.brick);
    ladderPart(b, tx + 2.2, 6.2, tz + 0.4, 12.4, 0);
    b.push(new THREE.BoxGeometry(0.05, 12.4, 0.5).translate(0, 6.2, 0), 0xb89a62, SURF.wood, 0, tx + 2.2, 0, tz + 0.4);
  }
  // Manevra sahası: çizgiler, yangın musluğu, hortum arabası, merdiven askısı, kovalar, kum sandığı
  for (let i = 0; i <= bays; i++) flat(b, 0.14, 12, gx - (bays * 5) / 2 + i * 5, fz + 8.2, 0xd8d0bc, SURF.plain, 0, 0.05);
  hydrant(b, gx - W / 2 - 1.5, 12.5);
  if (level >= 2) hydrant(b, 17.5, 12.5);
  // Hortum arabası: iki tekerlekli makara
  const hx = gx - W / 2 - 2.6;
  b.push(new THREE.CylinderGeometry(0.75, 0.75, 0.9, 14).rotateZ(Math.PI / 2), 0x6e5238, SURF.wood, 0, hx, TOP + 0.85, fz + 2.5);
  for (const s of [-1, 1]) b.push(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 14).rotateZ(Math.PI / 2), FIRE_RED, SURF.metal, 0, hx + s * 0.55, TOP + 0.85, fz + 2.5);
  A(b, BOX, 0.08, 0.08, 1.8, hx, TOP + 0.85, fz + 3.6, 0, C.dark, SURF.metal);
  // Merdiven askısı: yan duvarda yatay iki merdiven
  ladderPart(b, gx - W / 2 - 0.2, 1.6, gz + 1, 7.5, Math.PI / 2);
  ladderPart(b, gx - W / 2 - 0.2, 2.5, gz + 1, 6.5, Math.PI / 2);
  // Kova sırası ve kum sandığı (ön duvarda, nöbet odası yanında)
  A(b, BOX, 1.5, 0.06, 0.1, ox + 2.3, 1.35, gz + 5.08, 0, C.dark, SURF.metal);
  for (let i = 0; i < 5; i++) A(b, CYL, 0.12, 0.3, 0.12, ox + 1.74 + i * 0.28, 1.0, gz + 5.2, 0, FIRE_RED, SURF.metal);
  A(b, BOX, 1.6, 0.8, 0.9, ox + 2.3, TOP, gz + 5.6, 0, FIRE_RED, SURF.wood);
  // Bayrak direği, lambalar, bank
  A(b, BOX, 0.16, 11, 0.16, 17.5, TOP, 9.5, 0, 0xd8d6d0, SURF.metal);
  A(b, BOX, 1.6, 1.0, 0.04, 16.6, TOP + 9.6, 9.5, 0, FIRE_RED, SURF.canvas);
  lamp(b, -17, 14.5);
  lamp(b, 6, 14.5);
  bench(b, ox, gz + 7.2, 0);
  // Arka avlu: yakıt varilleri, su deposu, hortum kurutma teli
  for (let i = 0; i < 3 + level; i++) A(b, CYL, 0.3, 0.9, 0.3, -17 + (i % 3) * 0.75, TOP, -13.5 + Math.floor(i / 3) * 0.75, 0, pick(rng, [0x4f5638, 0x8a2a22, 0x3a4252]), SURF.metal);
  A(b, CYL, 1.3, 2.6, 1.3, 9.5 - (level >= 3 ? 4 : 0), TOP, -13.2, 0, 0x7c8084, SURF.metal);
  washLine(b, rng, 0, -14.6, 8);
  // Çevre: arkada ve yanlarda alçak tuğla duvar, ağaç
  A(b, BOX, 41, 1.2, 0.3, 0, 0, -16.3, 0, brick, SURF.brick);
  for (const s of [-1, 1]) A(b, BOX, 0.3, 1.2, 20, s * 20.3, 0, -6.4, 0, brick, SURF.brick);
  tree(b, rng, -17.5, 4, 8 + rng() * 2, false);
  if (level < 3) tree(b, rng, 17, -11, 7 + rng() * 2, false);
}

// ------------------------------------------------------------------ büro binası

function office(b: ArchBatch, rng: Rng): void {
  // 1930'lar büro binası: U biçimli, beş katlı kesme taş blok; ortada bir kat yüksek, öne çıkan giriş bölümü (pilastrlar,
  // alınlık, geniş merdiven), bakır ya da arduvaz kırma çatılar, çatı pencereleri. Önde ıhlamurlu meydan ve çeşme,
  // iç avluda çim ve ağaçlar, yanda park yeri
  pad(b, 91, 91, C.pave, SURF.paving, [C.grass, SURF.grass]);
  const stone = pick(rng, C.stone);
  const roof = rng() < 0.6 ? C.copper : pick(rng, C.slate);
  const H = 19.2;
  // Ön kanat ve yan kanatlar
  A(b, BOX, 60, H, 14, 0, 0, 7, 0, stone, SURF.stone);
  for (const s of [-1, 1]) A(b, BOX, 14, H, 38, s * 23, 0, -19, 0, stone, SURF.stone);
  A(b, BOX, 60.6, 0.6, 14.6, 0, H - 0.6, 7, 0, C.trim, SURF.concrete);
  for (const s of [-1, 1]) A(b, BOX, 14.6, 0.6, 38.6, s * 23, H - 0.6, -19, 0, C.trim, SURF.concrete);
  hipRoof(b, 60, 14, 5.5, 0, H, 7, roof);
  for (const s of [-1, 1]) hipRoof(b, 14, 38, 5.5, s * 23, H, -21.5, roof);
  for (const x of [-22, -12, 12, 22]) {
    A(b, BOX, 1.8, 1.7, 2.2, x, H + 0.5, 12.3, 0, stone, SURF.plaster);
    A(b, BOX, 2.2, 0.16, 2.5, x, H + 2.2, 12.35, 0, roof, SURF.felt);
    windowPart(b, x, H + 0.9, 13.42, 0.8, 0.95);
  }
  for (const x of [-26, 26]) chimney(b, x, H, 4, 6.5, pick(rng, C.brick));
  // Giriş bölümü: öne çıkan, daha yüksek; pilastrlar, alınlık, kapı, merdiven
  const RH = 22.4;
  A(b, BOX, 20, RH, 3, 0, 0, 15.2, 0, stone, SURF.stone);
  for (const x of [-8, -4, 0, 4, 8]) A(b, BOX, 0.9, RH - 4.4, 0.45, x, 3.6, 16.9, 0, C.trim, SURF.concrete);
  A(b, BOX, 20.6, 0.7, 3.6, 0, RH - 0.7, 15.2, 0, C.trim, SURF.concrete);
  gableRoof(b, 20.6, 3.6, 2.8, 0, RH, 15.2, 0, stone, SURF.concrete, roof, SURF.tile, 0.3);
  door(b, rng, 0, 16.7, 0, 3.4, 4.6, false);
  for (let i = 0; i < 3; i++) A(b, BOX, 12 - i * 1.2, 0.35 * (3 - i), 1.0, 0, 0, 17.4 + (2 - i) * 1.0, 0, 0xb8b0a2, SURF.concrete);
  // Meydan: çeşme, ıhlamur sıraları, lambalar, bayrak direkleri
  b.push(new THREE.CylinderGeometry(4.6, 4.8, 0.7, 8).translate(0, 0.35, 0), C.concrete, SURF.concrete, 0, 0, TOP, 33);
  A(b, DISC, 4.1, 0.75, 4.1, 0, TOP, 33, 0, C.water, SURF.water);
  for (let x = -38; x <= 38; x += 9.5) if (Math.abs(x) > 8) tree(b, rng, x, 42, 8 + rng() * 2, false);
  for (const x of [-14, 14]) {
    A(b, BOX, 0.18, 13, 0.18, x, TOP, 22, 0, 0xd8d6d0, SURF.metal);
    lamp(b, x * 1.8, 26);
  }
  // İç avlu: çim ve ağaçlar
  flat(b, 30, 36, 0, -19, C.grass, SURF.grass, 0, 0.12);
  for (const [x, z] of [[-8, -10], [8, -12], [-6, -28], [7, -30]]) tree(b, rng, x, z, 9 + rng() * 3, false);
  // Yan park yeri
  for (let i = 0; i < 4; i++) if (rng() < 0.7) car(b, rng, -40, 20 + i * 5.5, Math.PI / 2);
  truck(b, rng, 40, 30, 0);
}

// ------------------------------------------------------------------ ambar

function depot(b: ArchBatch, rng: Rng): void {
  // Ambarlar: tuğla duvar, oluklu sac kemer çatı, iki ucunda tuğla alın duvarı ve sürgülü kapı, yanında yükleme rampası.
  // Güneyde demiryolu yan hattı ve yük vagonları, ötesinde sandık yığınları ve kamyonlar; su kulesi, büro, tuğla çevre
  // duvarı (güneyde kapı)
  pad(b, 163, 123, 0x9c978c, SURF.paving, [0x8a7a60, SURF.earth]);
  for (let i = 0; i < 3; i++) {
    const x = -52 + i * 34;
    const br = pick(rng, C.brick);
    A(b, BOX, 26, 5, 70, x, 0, -10, 0, br, SURF.brick);
    A(b, ARCH, 13, 7, 70, x, 5, -10, 0, pick(rng, [0x8a8f8c, 0x7a8272, 0x9a9890]), SURF.corrugated);
    for (const e of [-1, 1]) {
      A(b, ARCH, 12.9, 6.9, 0.5, x, 5, -10 + e * 35.1, 0, br, SURF.brick);
      A(b, BOX, 8, 4.4, 0.3, x, 0, -10 + e * 35.25, 0, 0x5e6058, SURF.hangarDoor);
    }
    A(b, BOX, 2.6, 1.2, 66, x + 14.3, 0, -10, 0, C.concrete, SURF.concrete);
  }
  // Demiryolu: balast, raylar, dört kapalı yük vagonu
  A(b, BOX, 160, 0.35, 3.4, 0, TOP - 0.1, 33, 0, 0x6f665a, SURF.earth);
  for (const s of [-0.72, 0.72]) A(b, BOX, 160, 0.18, 0.1, 0, TOP + 0.25, 33 + s, 0, C.dark, SURF.metal);
  for (let i = 0; i < 4; i++) {
    const x = -62 + i * 11;
    A(b, BOX, 8, 0.75, 2.2, x, TOP + 0.3, 33, 0, 0x1c1d1e, SURF.metal);
    A(b, BOX, 9.2, 2.7, 2.8, x, TOP + 1.05, 33, 0, pick(rng, [0x6e3a2c, 0x5c3a2e, 0x6a4a34]), SURF.wood);
    A(b, ARCH, 1.45, 0.35, 9.2, x, TOP + 3.75, 33, Math.PI / 2, 0x4a4b50, SURF.metal);
  }
  // Yükleme sahası: sandık yığınları, fıçılar, kamyonlar
  for (let i = 0; i < 14; i++) {
    const x = -60 + (i % 7) * 14 + rng() * 4;
    const z = 42 + Math.floor(i / 7) * 10;
    const h = 1.2 + Math.floor(rng() * 3) * 1.2;
    A(b, BOX, 4, h, 4, x, TOP, z, 0, pick(rng, C.crate), SURF.wood);
  }
  for (let i = 0; i < 8; i++) A(b, CYL, 0.35, 0.9, 0.35, 32 + (i % 4) * 0.8, TOP, 44 + Math.floor(i / 4) * 0.8, 0, 0x4a3a2c, SURF.metal);
  for (let i = 0; i < 3; i++) truck(b, rng, 46 + i * 5, 50, Math.PI);
  // Su kulesi: kafes ayaklar, perçinli tank, konik çatı
  for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) A(b, BOX, 0.5, 18, 0.5, 62 + dx, 0, -30 + dz, 0, C.dark, SURF.metal);
  A(b, CYL, 4.5, 7, 4.5, 62, 18, -30, 0, 0x7d8279, SURF.metal);
  b.push(CONE.clone().scale(4.8, 2.4, 4.8).translate(62, 25, -30), 0x4a4b50, SURF.metal);
  // Büro: iki katlı sıvalı, kırma çatı
  A(b, BOX, 14, 6, 10, 60, 0, 10, 0, pick(rng, C.wall), SURF.house);
  hipRoof(b, 14, 10, 2.6, 60, 6, 10, pick(rng, C.tile));
  door(b, rng, 53, 10, -Math.PI / 2);
  // Çevre duvarı (güneyde kapı boşluğu)
  const br = pick(rng, C.brick);
  A(b, BOX, 162, 2.2, 0.4, 0, 0, -61.3, 0, br, SURF.brick);
  for (const s of [-1, 1]) A(b, BOX, 0.4, 2.2, 122, s * 81.3, 0, 0, 0, br, SURF.brick);
  A(b, BOX, 134, 2.2, 0.4, -14, 0, 61.3, 0, br, SURF.brick);
  for (const x of [-30, 10, 50]) lamp(b, x, 27);
}

// ------------------------------------------------------------------ park

function park(b: ArchBatch, rng: Rng): void {
  // Mahalle parkı (orta ev arsası kadar, 27 × 27 m): önde taş ayaklı demir parmaklık ve kemerli kapı, öbür üç yanda
  // çalı çit; parke taşı yollar ve ortada yuvarlak meydan; ortası dört tasarımdan biri (havuzlu çeşme, heykel, müzik
  // çardağı, çocuk oyun alanı); taş kenarlı çiçek tarhları, sırtlıklı banklar, fenerler, çeşme, çöp kutusu, ağaçlar
  const P = 13.5;
  const e = P - 0.6;
  pad(b, P * 2 - 1, P * 2 - 1, C.grass, SURF.grass);
  for (const ry of [0, Math.PI / 2]) flat(b, 2.0, e * 2 - 0.6, 0, 0, C.pave, SURF.paving, ry);
  b.push(new THREE.CylinderGeometry(4.4, 4.4, 0.1, 16).translate(0, 0.05, 0), C.pave, SURF.paving, 0, 0, TOP - 0.02, 0);
  // Ön: taş ayaklar, demir parmaklık, kapı kemeri
  for (const s of [-1, 1]) {
    for (const x of [1.4, 6.6, e - 0.2]) {
      A(b, BOX, 0.5, 1.5, 0.5, s * x, TOP, e - 0.2, 0, 0xb0a898, SURF.concrete);
      A(b, BOX, 0.62, 0.14, 0.62, s * x, TOP + 1.5, e - 0.2, 0, 0x9a9284, SURF.concrete);
    }
    A(b, BOX, e - 1.6, 0.3, 0.3, s * (e / 2 + 0.6), TOP, e - 0.2, 0, 0xb0a898, SURF.concrete);
    for (const y of [0.55, 1.25]) A(b, BOX, e - 1.6, 0.05, 0.05, s * (e / 2 + 0.6), TOP + y, e - 0.2, 0, C.dark, SURF.metal);
    for (let x = 1.9; x < e - 0.4; x += 0.42) A(b, BOX, 0.035, 1.05, 0.035, s * x, TOP + 0.3, e - 0.2, 0, C.dark, SURF.metal);
  }
  b.push(new THREE.TorusGeometry(1.4, 0.05, 5, 12, Math.PI), C.dark, SURF.metal, 0, 0, TOP + 1.6, e - 0.2);
  // Öbür üç yan: çalı çit (yanlarda giriş boşluğu)
  hedge(b, e * 2, 0, -e + 0.2, 0);
  for (const sx of [-1, 1]) for (const s of [-1, 1]) hedge(b, e - 1.6, sx * (e - 0.2), s * (e / 2 + 0.8), Math.PI / 2);
  const type = Math.floor(rng() * 4);
  if (type === 0) {
    b.push(new THREE.CylinderGeometry(2.6, 2.8, 0.6, 12).translate(0, 0.3, 0), 0xa8a296, SURF.concrete, 0, 0, TOP, 0);
    A(b, DISC, 2.3, 0.65, 2.3, 0, TOP, 0, 0, C.water, SURF.water);
    A(b, CYL, 0.26, 1.5, 0.26, 0, TOP, 0, 0, 0xa8a296, SURF.concrete);
    b.push(new THREE.CylinderGeometry(0.9, 0.3, 0.3, 12), 0xa8a296, SURF.concrete, 0, 0, TOP + 1.65, 0);
    A(b, CYL, 0.12, 0.6, 0.12, 0, TOP + 1.8, 0, 0, 0x4d5a4a, SURF.metal);
  } else if (type === 1) {
    for (let i = 0; i < 3; i++) A(b, BOX, 3.0 - i * 0.6, 0.25, 3.0 - i * 0.6, 0, TOP + i * 0.25, 0, 0, 0xa8a296, SURF.concrete);
    A(b, BOX, 1.3, 1.8, 1.3, 0, TOP + 0.75, 0, 0, 0xb0a898, SURF.stone);
    A(b, BOX, 1.5, 0.14, 1.5, 0, TOP + 2.55, 0, 0, 0x9a9284, SURF.concrete);
    A(b, BOX, 0.55, 1.5, 0.4, 0, TOP + 2.69, 0, 0, 0x4d5a4a, SURF.metal);
    A(b, BOX, 0.3, 0.3, 0.3, 0, TOP + 4.19, 0, 0, 0x4d5a4a, SURF.metal);
    A(b, BOX, 1.1, 0.12, 0.12, 0, TOP + 3.7, 0, 0, 0x4d5a4a, SURF.metal);
  } else if (type === 2) {
    b.push(new THREE.CylinderGeometry(2.8, 3.0, 0.5, 8).translate(0, 0.25, 0), 0xa8a296, SURF.concrete, 0, 0, TOP, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      A(b, CYL, 0.07, 2.6, 0.07, Math.cos(a) * 2.5, TOP + 0.5, Math.sin(a) * 2.5, 0, C.dark, SURF.metal);
      if (i !== 1) A(b, BOX, 1.95, 0.05, 0.05, Math.cos(a + Math.PI / 8) * 2.32, TOP + 1.3, Math.sin(a + Math.PI / 8) * 2.32, -(a + Math.PI / 8) + Math.PI / 2, C.dark, SURF.metal);
    }
    b.push(new THREE.CylinderGeometry(3.3, 3.3, 0.14, 8), C.dark, SURF.metal, 0, 0, TOP + 3.15, 0);
    b.push(new THREE.ConeGeometry(3.4, 1.6, 8).translate(0, 0.8, 0), C.copper, SURF.tile, 0, 0, TOP + 3.2, 0);
    A(b, CYL, 0.05, 0.9, 0.05, 0, TOP + 4.8, 0, 0, C.dark, SURF.metal);
  } else {
    // Oyun alanı: kum havuzu, salıncak, kaydırak, tahterevalli
    A(b, BOX, 3.6, 0.25, 3.6, 0, TOP, 0, 0, 0x8a6a48, SURF.wood);
    A(b, BOX, 3.2, 0.3, 3.2, 0, TOP, 0, 0, 0xc8b48a, SURF.earth);
    for (const s of [-1, 1]) {
      b.push(beam(-7.2 + s * 0.9, 0, 4.6, -7.2, 2.4, 4.6, 0.09), C.dark, SURF.metal, 0, 0, TOP, 0);
      b.push(beam(-7.2 + s * 0.9, 0, 7.4, -7.2, 2.4, 7.4, 0.09), C.dark, SURF.metal, 0, 0, TOP, 0);
      A(b, BOX, 0.03, 1.7, 0.03, -7.2 + s * 0.22, TOP + 0.65, 5.4, 0, C.dark, SURF.metal);
      A(b, BOX, 0.03, 1.7, 0.03, -7.2 + s * 0.22, TOP + 0.65, 6.6, 0, C.dark, SURF.metal);
    }
    A(b, BOX, 0.09, 0.09, 2.9, -7.2, TOP + 2.36, 6, 0, C.dark, SURF.metal);
    for (const z of [5.4, 6.6]) A(b, BOX, 0.5, 0.05, 0.2, -7.2, TOP + 0.62, z, 0, 0x8a3a2c, SURF.wood);
    A(b, BOX, 0.9, 1.9, 0.9, 7, TOP, 6.2, 0, 0x6e5238, SURF.wood);
    b.push(beam(7, 1.9, 5.7, 7, 0.15, 2.4, 0.7, 0.06), 0x9aa0a4, SURF.metal, 0, 0, TOP, 0);
    ladderPart(b, 7, TOP + 0.95, 6.8, 1.9, 0);
    A(b, BOX, 0.3, 0.6, 0.3, 6.5, TOP, -6.5, 0, 0x6e5238, SURF.wood);
    b.push(beam(4.6, 0.95, -6.5, 8.4, 0.35, -6.5, 0.3, 0.07), 0x8a3a2c, SURF.wood, 0, 0, TOP, 0);
  }
  // Çiçek tarhları: taş kenar, toprak, çiçek öbekleri (meydanın çevresinde dört çeyrek)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      if (type !== 3) {
        A(b, BOX, 3.2, 0.22, 1.5, sx * 5.6, TOP, sz * 3.4, 0, 0xa8a296, SURF.concrete);
        A(b, BOX, 2.9, 0.26, 1.2, sx * 5.6, TOP, sz * 3.4, 0, C.earth, SURF.earth);
        for (let i = 0; i < 4; i++) A(b, BOX, 0.55, 0.22 + rng() * 0.2, 0.9, sx * (4.55 + i * 0.7), TOP + 0.2, sz * 3.4, 0, i % 2 ? pick(rng, C.flowers) : 0x567340, SURF.grass);
      }
      tree(b, rng, sx * (8 + rng() * 2), sz * (8 + rng() * 2), 6.5 + rng() * 3, rng() < 0.2);
      if (rng() < 0.55) tree(b, rng, sx * (4.5 + rng() * 2), sz * (10 + rng()), 4.5 + rng() * 2, false);
    }
    bench(b, sx * 2.3, 7.2, sx * Math.PI / 2);
    bench(b, sx * 7.2, -2.3, Math.PI);
    lamp(b, sx * 3.3, sx * 3.3);
  }
  // Çeşme ve çöp kutusu
  A(b, BOX, 0.5, 1.0, 0.5, -3.6, TOP, 2.6, 0, 0xa8a296, SURF.concrete);
  A(b, BOX, 0.7, 0.1, 0.5, -3.6, TOP + 0.7, 2.75, 0, 0x8a8680, SURF.concrete);
  A(b, CYL, 0.24, 0.75, 0.24, 3.4, TOP, -3.6, 0, 0x4a5642, SURF.metal);
}

// ------------------------------------------------------------------ maden

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

/** Pasa ya da cevher yığını: düzensiz, tepesi basık koni (köşeleri oynatılmış; düz koni gibi durmaz). */
function heap(b: ArchBatch, rng: Rng, x: number, z: number, r: number, h: number, col: number, y = 0): void {
  const g = new THREE.ConeGeometry(r, h, 11, 3, true).translate(0, h / 2, 0).toNonIndexed();
  const p = g.getAttribute('position');
  // Aynı yerdeki köşeler aynı kaysın (yüzeyde yarık açılmasın): konumdan türeyen sapma
  const j = (v: number, k: number): number => Math.sin(v * 12.9898 + k * 78.233) * 43758.5453 % 1;
  const seed = rng() * 10;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    const k = j(px * 0.37 + pz * 0.71 + py * 0.13, seed);
    const top = py / h;
    p.setXYZ(i, px * (1 + 0.22 * k) + (top > 0.9 ? 0.25 * r * j(0.5, seed) : 0), Math.min(py, h * 0.82) * (1 + 0.12 * k), pz * (1 - 0.18 * k));
  }
  g.computeVertexNormals();
  g.rotateY(rng() * 6.28);
  b.push(g, col, SURF.earth, 0, x, y, z);
}

/** Çelik kafes kule: dört dikme, yatay kuşaklar ve dört yüzde çapraz bağlar. Taban (x, z), yarı açıklık a, yükseklik h. */
function lattice(b: ArchBatch, x: number, z: number, a: number, h: number, bay: number, col: number, t = 0.32): void {
  for (const [dx, dz] of [[-a, -a], [a, -a], [-a, a], [a, a]]) A(b, BOX, t * 1.6, h, t * 1.6, x + dx, 0, z + dz, 0, col, SURF.metal);
  for (let y = 0; y < h - 0.1; y += bay) {
    const y1 = Math.min(y + bay, h);
    for (const s of [-1, 1]) {
      A(b, BOX, 2 * a, t, t, x, y1 - t, z + s * a, 0, col, SURF.metal);
      A(b, BOX, t, t, 2 * a, x + s * a, y1 - t, z, 0, col, SURF.metal);
      const flip = Math.round(y / bay) % 2 ? 1 : -1;
      b.push(beam(x - a * flip, y, z + s * a, x + a * flip, y1, z + s * a, t * 0.8), col, SURF.metal);
      b.push(beam(x + s * a, y, z - a * flip, x + s * a, y1, z + a * flip, t * 0.8), col, SURF.metal);
    }
  }
}

/** Dekovil vagonu: demir şasi, devrilir tekne, içinde cevher. */
function tub(b: ArchBatch, rng: Rng, x: number, z: number, ry: number, full: boolean): void {
  A(b, BOX, 1.5, 0.3, 2.6, x, 0.45, z, ry, 0x2c2a28, SURF.metal);
  A(b, BOX, 1.9, 1.0, 2.3, x, 0.75, z, ry, pick(rng, [0x5c4634, 0x4a4038, 0x6a4e3a, 0x55504a]), SURF.metal);
  if (full) A(b, BOX, 1.6, 0.35, 2.0, x, 1.7, z, ry, 0x3a3632, SURF.earth);
}

function mine(b: ArchBatch, rng: Rng): void {
  // Maden ocağı (1930'lar): çapraz bağlı çelik kuyu kulesi ve halat makaraları, tuğla kuyu ağzı ve vinç dairesi, bantlı
  // yüksek tuğla baca ve kazan dairesi, oluklu sac kaplı kapalı konveyör galerisi, basamaklı cevher hazırlama tesisi,
  // beton silolar ve ray üstünde yükleme oluğu, dekovil hattı ve vagonlar, düzensiz pasa ve cevher yığınları, direk
  // (maden direği) istifleri, çöktürme havuzu, su kulesi, atölye, yönetim binası, kapı kulübesi, tel çit
  const steel = 0x3e4246;
  const rustSteel = 0x5a4a3e;
  const brick = pick(rng, [0x7e4636, 0x8c4d3a, 0x74422f]);
  const sheet = pick(rng, [0x8a8d88, 0x7c8084, 0x93897a]);
  const roof = pick(rng, [0x4a4d52, 0x5a4e46]);
  const ore = pick(rng, [0x3a3632, 0x4a3e34, 0x44403c]);
  const M = SURF.metal;
  pad(b, 139, 109, 0x6e6252, SURF.earth);
  // Çamurlu iç yollar ve taş dolgu saha
  flat(b, 9, 100, 44, 2, 0x5a5146, SURF.earth, 0, 0.1);
  flat(b, 70, 8, 8, 44, 0x5a5146, SURF.earth, 0, 0.1);
  flat(b, 46, 34, -14, 12, 0x7a7266, SURF.earth, 0, 0.12);

  // ---- Kuyu kulesi: kafes gövde, arkaya payandalar, tepede makara platformu ve çift makara
  const hx = -15;
  const hz = -8;
  lattice(b, hx, hz, 3, 27, 4.5, steel);
  A(b, BOX, 8.4, 0.5, 8.4, hx, 27, hz, 0, steel, M);
  for (const s of [-1, 1]) {
    A(b, BOX, 8.4, 1.0, 0.08, hx, 27.5, hz + s * 4.1, 0, steel, M);
    A(b, BOX, 0.08, 1.0, 8.4, hx + s * 4.1, 27.5, hz, 0, steel, M);
    // Payanda: makaradan vinç dairesine doğru eğik çift kiriş, aralarında bağlar
    b.push(beam(hx + s * 2.6, 27, hz + 2.5, hx + s * 4.2, 0, hz + 21, 0.75), steel, M);
  }
  for (const t of [0.25, 0.5, 0.75]) {
    const y = 27 * (1 - t);
    const zz = hz + 2.5 + 18.5 * t;
    A(b, BOX, 5.2 + 3.2 * t, 0.3, 0.3, hx, y, zz, 0, steel, M);
  }
  for (const dx of [-1.5, 1.5]) {
    b.push(new THREE.CylinderGeometry(2.7, 2.7, 0.3, 20).rotateZ(Math.PI / 2), steel, M, 0, hx + dx, 31.2, hz);
    b.push(new THREE.CylinderGeometry(2.2, 2.2, 0.36, 20).rotateZ(Math.PI / 2), rustSteel, M, 0, hx + dx, 31.2, hz);
    A(b, BOX, 0.5, 4.4, 0.5, hx + dx * 2, 27.5, hz, 0, steel, M);
    // Halatlar: makaradan vinç dairesine ve kuyuya
    b.push(beam(hx + dx, 33.6, hz + 0.8, hx + dx, 8.5, hz + 25, 0.12), 0x2a2a2a, M);
    A(b, BOX, 0.1, 27, 0.1, hx + dx, 4, hz - 1.2, 0, 0x2a2a2a, M);
  }
  A(b, BOX, 9, 0.3, 1.2, hx, 33.6, hz, 0, steel, M);
  // Kuyu ağzı binası: tuğla, oluklu sac çatı, vagon kapıları
  A(b, BOX, 13.6, 0.6, 13.6, hx, 0, hz, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, 13, 7.2, 13, hx, 0, hz, 0, brick, SURF.brickWin);
  gableRoof(b, 13, 13, 2.6, hx, 7.2, hz, 0, brick, SURF.brick, sheet, SURF.corrugated, 0.5);
  for (const s of [-1, 1]) A(b, BOX, 3, 3.2, 0.2, hx + s * 3.2, 0, hz + 6.55, 0, 0x4a4038, SURF.hangarDoor);

  // ---- Vinç dairesi ve kazan dairesi, yüksek baca
  const wz = hz + 30;
  A(b, BOX, 17, 0.6, 15, hx, 0, wz, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, 16, 10, 14, hx, 0, wz, 0, brick, SURF.brickWin);
  A(b, BOX, 16.5, 0.4, 14.5, hx, 9.6, wz, 0, 0xb8b0a2, SURF.concrete);
  gableRoof(b, 14, 16, 3.6, hx, 10, wz, Math.PI / 2, brick, SURF.brick, roof, SURF.tile, 0.45);
  A(b, BOX, 5, 1.2, 1.4, hx, 12.6, wz - 2, 0, sheet, SURF.corrugated);
  A(b, BOX, 11, 6, 9, hx - 14, 0, wz + 1.5, 0, brick, SURF.brick);
  A(b, BOX, 11.6, 0.3, 9.6, hx - 14, 6, wz + 1.5, 0, sheet, SURF.corrugated);
  const cx = hx - 22;
  const cz = wz + 5;
  A(b, BOX, 4.4, 2.2, 4.4, cx, 0, cz, 0, brick, SURF.brick);
  b.push(new THREE.CylinderGeometry(1.25, 1.9, 34, 14).translate(0, 17, 0), brick, SURF.brick, 0, cx, 2.2, cz);
  for (const y of [9, 17, 25, 32]) b.push(new THREE.CylinderGeometry(1.9 - y * 0.018, 1.92 - y * 0.018, 0.22, 14), 0x2c2826, M, 0, cx, 2.2 + y, cz);
  b.push(new THREE.CylinderGeometry(1.45, 1.3, 1.2, 14), 0x2a2624, SURF.plain, 0, cx, 36.6, cz);
  // Buhar boruları: kazan dairesinden vinç dairesine, direkler üstünde
  A(b, BOX, 9, 0.5, 0.5, hx - 9, 5.2, wz - 3, 0, 0x8a8d90, M);
  for (const x of [hx - 6, hx - 11]) A(b, BOX, 0.3, 5.2, 0.3, x, 0, wz - 3, 0, steel, M);

  // ---- Cevher hazırlama: basamaklı oluklu sac binalar, çatı fenerleri, toz çıkışları
  const mx = 24;
  const mz = -27;
  const steps: [number, number, number][] = [[0, 17, 20], [17, 12, 18], [31, 8, 15]];
  for (const [dx, h, d] of steps) {
    const zc = mz + (20 - d) / 2;
    A(b, BOX, 17.6, 1.4, d + 0.6, mx + dx, 0, zc, 0, 0x8a8378, SURF.concrete);
    A(b, BOX, 17, h, d, mx + dx, 0, zc, 0, sheet, SURF.corrugated);
    gableRoof(b, d, 17, 1.8, mx + dx, h, zc, Math.PI / 2, sheet, SURF.corrugated, roof, SURF.corrugated, 0.4);
    A(b, BOX, 9, 1.0, 2.4, mx + dx, h + 1.5, zc, 0, sheet, SURF.corrugated);
    A(b, BOX, 9.6, 0.18, 3.0, mx + dx, h + 2.5, zc, 0, roof, SURF.corrugated);
    A(b, BOX, 12, 1.6, 0.1, mx + dx, h * 0.55, zc + d / 2 + 0.06, 0, 0x34424e, SURF.curtain);
    b.push(new THREE.CylinderGeometry(0.45, 0.45, 3.2, 10).translate(0, 1.6, 0), rustSteel, M, 0, mx + dx + 6, h + 1.2, zc - d * 0.3);
  }
  A(b, BOX, 5.5, 6.5, 5.5, mx - 2, 17, mz - 2, 0, sheet, SURF.corrugated);
  A(b, BOX, 6.1, 0.3, 6.1, mx - 2, 23.5, mz - 2, 0, roof, SURF.corrugated);
  // Kapalı konveyör galerisi: kuyu ağzından tesisin tepesine, kafes ayaklar üstünde
  const gA: [number, number, number] = [hx + 6.5, 6.2, hz];
  const gB: [number, number, number] = [mx - 5, 20, mz + 1];
  b.push(beam(gA[0], gA[1], gA[2], gB[0], gB[1], gB[2], 2.6, 2.4), sheet, SURF.corrugated);
  b.push(beam(gA[0], gA[1] + 1.35, gA[2], gB[0], gB[1] + 1.35, gB[2], 3.0, 0.2), roof, SURF.corrugated);
  for (const t of [0.28, 0.6]) {
    const x = gA[0] + (gB[0] - gA[0]) * t;
    const z = gA[2] + (gB[2] - gA[2]) * t;
    lattice(b, x, z, 1.1, gA[1] + (gB[1] - gA[1]) * t - 1.2, 3.2, steel, 0.22);
  }
  // İkinci bant: tesisten silolara, açık lastik bant
  b.push(beam(mx + 36, 7.5, mz + 9, 30.5, 17.5, 10, 1.4, 0.3), 0x2a2a2a, M);
  b.push(beam(mx + 36, 7.0, mz + 9, 30.5, 17.0, 10, 1.7, 0.25), steel, M);
  lattice(b, 44, 0, 0.9, 11, 3, steel, 0.2);

  // ---- Silolar, yükleme oluğu ve dekovil hattı
  for (const x of [22, 31]) {
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) A(b, BOX, 0.6, 4.2, 0.6, x + dx, 0, 10 + dz, 0, 0x8a8680, SURF.concrete);
    A(b, CYL, 4.1, 0.5, 4.1, x, 3.9, 10, 0, 0x8a8680, SURF.concrete);
    A(b, CYL, 4, 12.5, 4, x, 4.2, 10, 0, 0x9a968c, SURF.concrete);
    for (const y of [7, 11, 15]) b.push(new THREE.CylinderGeometry(4.06, 4.06, 0.25, 18), rustSteel, M, 0, x, y, 10);
    b.push(CONE.clone().scale(4.2, 2.2, 4.2), roof, SURF.corrugated, 0, x, 16.7, 10);
    b.push(new THREE.ConeGeometry(1.6, 2.4, 10).rotateX(Math.PI).translate(0, 1.2, 0), rustSteel, M, 0, x, 1.6, 10);
  }
  A(b, BOX, 10, 0.4, 2, 26.5, 17.4, 10, 0, steel, M);
  ladderPart(b, 26.5, 8.6, 13.9, 17, Math.PI / 2);
  b.push(new THREE.BoxGeometry(0.06, 17, 0.55).translate(0, 8.5, 0), steel, M, 0, 26.5, 0, 14.1);
  const rx = 26.5;
  A(b, BOX, 3.4, 0.35, 78, rx, 0, 14, 0, 0x5c554c, SURF.earth);
  for (const s of [-1, 1]) A(b, BOX, 0.16, 0.5, 78, rx + s * 0.6, 0, 14, 0, 0x34363a, M);
  for (let z = -23; z <= 52; z += 2.2) A(b, BOX, 2.2, 0.42, 0.3, rx, 0, z, 0, 0x4a3a2c, SURF.wood);
  // Yan hat ve makas
  b.push(beam(rx, 0.35, 34, rx + 9, 0.35, 50, 0.16, 0.3), 0x34363a, M);
  b.push(beam(rx + 1.2, 0.35, 34, rx + 10.2, 0.35, 50, 0.16, 0.3), 0x34363a, M);
  for (let i = 0; i < 7; i++) tub(b, rng, rx, 16 + i * 3.4, 0, i < 5);
  for (let i = 0; i < 2; i++) tub(b, rng, rx + 7.6 + i * 1.8, 47 + i * 3.2, 0.51, false);
  // Küçük lokomotif
  A(b, BOX, 1.9, 0.5, 4.2, rx, 0.45, 42.5, 0, 0x2c2a28, M);
  A(b, BOX, 1.7, 1.3, 2.4, rx, 0.95, 43.2, 0, 0x4a5642, M);
  A(b, BOX, 1.9, 1.5, 1.4, rx, 0.95, 41.3, 0, 0x4a5642, M);
  A(b, CYL, 0.18, 1.0, 0.18, rx, 2.25, 43.8, 0, 0x2a2624, M);

  // ---- Yığınlar: pasa (büyük, katmanlı), cevher stokları, kül
  const spoil = [0x4a4640, 0x57504a, 0x5e5448, 0x44403c];
  heap(b, rng, -50, 30, 19, 14, pick(rng, spoil));
  heap(b, rng, -40, 42, 12, 8, pick(rng, spoil));
  heap(b, rng, -58, 14, 11, 7, pick(rng, spoil));
  heap(b, rng, -52, -34, 15, 9.5, pick(rng, spoil));
  heap(b, rng, -40, -42, 9, 5.5, pick(rng, spoil));
  heap(b, rng, 57, 40, 10, 6.5, ore);
  heap(b, rng, 46, 46, 6, 3.6, ore);
  heap(b, rng, 12, 12, 4.5, 2.8, ore);
  heap(b, rng, cx + 6, cz + 6, 3.5, 1.8, 0x6a665e);
  // Pasa hattı: yığının tepesine çıkan eğik ray ve devrilmiş vagon
  b.push(beam(-24, 0.4, 20, -47, 11, 30, 1.6, 0.3), rustSteel, M);
  for (const t of [0.35, 0.7]) A(b, BOX, 0.3, 11 * t, 0.3, -24 - 23 * t, 0, 20 + 10 * t, 0, steel, M);
  tub(b, rng, -45.5, 29.4, 1.15, false);

  // ---- Direk istifleri, su kulesi, çöktürme havuzu, atölye
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3; k++) b.push(new THREE.CylinderGeometry(0.22, 0.22, 7, 7).rotateZ(Math.PI / 2), pick(rng, [0x8a6a48, 0x7a5a3c, 0x9a7a55]), SURF.wood, 0, 0, 0.3 + k * 0.42, 36 + i * 1.1 + (k % 2) * 0.25);
  }
  for (let i = 0; i < 4; i++) A(b, BOX, 0.3, 1.6, 0.3, -3.2 + (i % 2) * 6.4, 0, 35.6 + Math.floor(i / 2) * 3.2, 0, 0x5a4632, SURF.wood);
  lattice(b, 58, -8, 1.8, 9, 3, steel, 0.24);
  A(b, CYL, 3.0, 3.6, 3.0, 58, 9, -8, 0, 0x6a655e, M);
  for (const y of [9.4, 11.2, 12.4]) b.push(new THREE.CylinderGeometry(3.05, 3.05, 0.14, 16), rustSteel, M, 0, 58, y, -8);
  b.push(CONE.clone().scale(3.2, 1.2, 3.2), roof, SURF.corrugated, 0, 58, 12.6, -8);
  A(b, BOX, 0.3, 9, 0.3, 58, 0, -8, 0, 0x8a8d90, M);
  A(b, BOX, 22, 0.5, 14, -38, 0, -8, 0, 0x8a8680, SURF.concrete);
  A(b, DISC, 9.8, 0.42, 5.8, -38, 0.12, -8, 0, 0x4a5a52, SURF.water);
  A(b, BOX, 0.4, 0.9, 12, -27.5, 0.3, -8, 0, 0x8a8d90, M);
  A(b, BOX, 16, 5.2, 10, 52, 0, -40, 0, brick, SURF.brickWin);
  gableRoof(b, 10, 16, 2.4, 52, 5.2, -40, Math.PI / 2, brick, SURF.brick, roof, SURF.corrugated, 0.4);
  A(b, BOX, 4, 3.4, 0.2, 49, 0, -34.9, 0, 0x4a4038, SURF.hangarDoor);
  for (let i = 0; i < 4; i++) A(b, CYL, 0.3, 0.9, 0.3, 61.5 + (i % 2) * 0.75, 0, -34 + Math.floor(i / 2) * 0.75, 0, pick(rng, [0x4f5638, 0x8a2a22, 0x3a4252]), M);

  // ---- Yönetim binası, lamba dairesi, kapı kulübesi, kamyonlar
  A(b, BOX, 14.4, 0.5, 9.4, 55, 0, 16, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, 14, 5.6, 9, 55, 0, 16, 0, pick(rng, C.wall), SURF.house);
  hipRoof(b, 14, 9, 2.6, 55, 5.6, 16, pick(rng, C.tile));
  chimney(b, 59, 5.6, 15, 3.2, brick);
  door(b, rng, 52, 20.5, 0, 1.1, 2.2);
  A(b, BOX, 7, 3.2, 5, 60, 0, 28, 0, brick, SURF.brickHouse);
  A(b, BOX, 7.6, 0.25, 5.6, 60, 3.2, 28, 0, sheet, SURF.corrugated);
  A(b, BOX, 3, 2.6, 3, 40, 0, 51, 0, 0x6e5238, SURF.wood);
  A(b, BOX, 3.6, 0.2, 3.6, 40, 2.6, 51, 0, roof, SURF.felt);
  b.push(beam(42, 1.1, 53.6, 48, 1.1, 53.6, 0.16), 0xc8463c, M);
  for (let i = 0; i < 2; i++) truck(b, rng, 44, -8 + i * 9, 0);
  truck(b, rng, 36, 44, Math.PI / 2);
  for (const [x, z] of [[8, -30], [34, 30], [-8, 22], [50, 2], [-30, -30]]) lamp(b, x, z);

  // ---- Tel çit: direkler ve üç sıra tel, kapıda boşluk
  const post = (x: number, z: number): void => A(b, BOX, 0.18, 2.2, 0.18, x, 0, z, 0, 0x6a655e, SURF.concrete);
  for (let x = -69; x <= 69; x += 6) {
    post(x, -54.2);
    if (x < 40 || x > 50) post(x, 54.2);
  }
  for (let z = -48; z <= 48; z += 6) {
    post(-69.2, z);
    post(69.2, z);
  }
  for (const y of [0.7, 1.3, 1.9]) {
    A(b, BOX, 138.4, 0.05, 0.05, 0, y, -54.2, 0, steel, M);
    A(b, BOX, 108.5, 0.05, 0.05, -15, y, 54.2, 0, steel, M);
    A(b, BOX, 19, 0.05, 0.05, 59.7, y, 54.2, 0, steel, M);
    A(b, BOX, 0.05, 0.05, 108.4, -69.2, y, 0, 0, steel, M);
    A(b, BOX, 0.05, 0.05, 108.4, 69.2, y, 0, 0, steel, M);
  }
}

// ------------------------------------------------------------------ harita süsleri (decor.ts)
// Harekâtta haritaya serpilen köy evleri, yıkık evler, ahır, kuyu ve terk edilmiş maden ocağı. Yıkıklar ve terk edilmiş
// maden decor.ts'te hasar gölgelendiricili ayrı malzemeyle çizilir (yanık lekesi, kararmış cam).

/** Yıkık duvar: (x0, z0)–(x1, z1) arası, parçalar halinde kırık yükseklikler (en çok H); pencereler duvar dokusunda. */
function brokenWall(b: ArchBatch, rng: Rng, x0: number, z0: number, x1: number, z1: number, H: number, col: number, surf: Surf, keep = 0.3, y = 0.5): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
  const n = 2 + Math.floor(rng() * 3);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const seg = i === n - 1 ? 1 - t : (0.18 + rng() * 0.4) * (1 - t);
    // Kapı ya da yıkılmış boşluk: bazen hiç duvar yok
    const h = rng() < 0.15 ? 0 : H * (keep + (1 - keep) * rng());
    if (h > 0.4) {
      const m = t + seg / 2;
      A(b, BOX, seg * len + 0.02, h, 0.45, x0 + (x1 - x0) * m, y, z0 + (z1 - z0) * m, ry, col, surf);
      // Kırık üst kenar: yarım taşlar
      if (rng() < 0.7) A(b, BOX, seg * len * (0.3 + rng() * 0.4), 0.3 + rng() * 0.5, 0.45, x0 + (x1 - x0) * (m + (rng() - 0.5) * seg * 0.4), y + h, z0 + (z1 - z0) * (m + (rng() - 0.5) * seg * 0.4), ry, col, SURF.plaster);
    }
    t += seg;
  }
}

/** Yerde dağılmış kiremit ve taş parçaları. */
function debris(b: ArchBatch, rng: Rng, x: number, z: number, r: number, n: number, cols: number[]): void {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * r;
    A(b, BOX, 0.3 + rng() * 0.6, 0.12 + rng() * 0.2, 0.25 + rng() * 0.5, x + Math.cos(a) * d, TOP, z + Math.sin(a) * d, rng() * 3, pick(rng, cols), SURF.plain);
  }
}

/**
 * Yıkık ev (bombalanmış ya da terk edilmiş kır evi): taş kaide, yer yer yıkılmış duvarlar, ayakta kalan baca, içeri
 * çökmüş çatı levhası ve açıkta kalan mertekler, kömürleşmiş kiriş, moloz yığınları, dağılmış kiremit, otlanmış arsa,
 * yarım çit ve evin içinden çıkan çalılar.
 */
function ruinHouse(b: ArchBatch, rng: Rng, W: ArchBatch = b): void {
  const P = 11;
  pad(b, 2 * P, 2 * P, pick(rng, [0x6e7a46, 0x737c48, 0x667240]), SURF.grass);
  flat(b, 5 + rng() * 3, 4 + rng() * 3, (rng() - 0.5) * 6, 5 + rng() * 3, 0x6a5c48, SURF.earth, rng() * 0.8, 0.1);
  const w = 8 + rng() * 1.6;
  const d = 7 + rng() * 1.2;
  const hz = -1.5;
  const two = rng() < 0.5;
  const H = two ? 5.4 : 3.0;
  const brick = rng() < 0.35;
  const wall = brick ? pick(rng, C.brick) : pick(rng, C.wall);
  const surf: Surf = brick ? SURF.brickHouse : SURF.house;
  const roof = houseRoof(rng);
  A(b, BOX, w + 0.4, 0.5, d + 0.4, 0, 0, hz, 0, 0x8a8378, SURF.concrete);
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = hz - d / 2;
  const z1 = hz + d / 2;
  // Arka duvar çoğunlukla ayakta, ön ve yanlar kırık
  brokenWall(W, rng, x0, z0, x1, z0, H, wall, surf, 0.75);
  brokenWall(W, rng, x0, z1, x1, z1, H, wall, surf, 0.15);
  brokenWall(W, rng, x0, z0, x0, z1, H, wall, surf, 0.3);
  brokenWall(W, rng, x1, z0, x1, z1, H, wall, surf, 0.2);
  // Ayakta kalan baca (yıkık evin simgesi)
  const cx = rng() < 0.5 ? x0 + 0.6 : x1 - 0.6;
  chimney(W, cx, 0.5, hz - d * 0.2, H + 1.4, pick(rng, C.brick));
  // İçeri çökmüş çatı levhası: arka duvarın üstünden tabana eğik
  const slab = new THREE.BoxGeometry(w * (0.55 + rng() * 0.35), 0.22, d * 0.62).rotateX(-0.62);
  W.push(slab, roof, SURF.tile, (rng() - 0.5) * 0.3, (rng() - 0.5) * 1.5, H * 0.45 + 0.5, hz - d * 0.12);
  // Açıkta mertekler: arka duvardan mahyaya, bazıları kırık
  const rafter = 0x3a2e24;
  for (let i = 0; i < 4; i++) {
    if (rng() < 0.35) continue;
    const x = x0 + 0.8 + (i * (w - 1.6)) / 3;
    const len = 0.45 + rng() * 0.55;
    W.push(beam(x, H + 0.5, z0 + 0.2, x, H + 0.5 + 1.8 * len, z0 + 0.2 + (d / 2) * len, 0.16), rafter, SURF.wood);
  }
  // Kömürleşmiş kiriş: içeride çapraz
  W.push(beam(x0 + 1, 0.7, z1 - 1.2, x1 - 1.5, 2.2, z0 + 1.2, 0.24), 0x2a2420, SURF.wood);
  // Moloz yığınları: içeride ve yıkık duvarların dibinde
  const rubble = [wall, 0x7a6a5a, 0x8a8378, pick(rng, C.brick)];
  heap(b, rng, (rng() - 0.5) * w * 0.5, hz + (rng() - 0.5) * d * 0.4, 1.6 + rng() * 1.0, 0.9 + rng() * 0.8, pick(rng, rubble), 0.5);
  heap(b, rng, x1 + 0.6, z1 - 1, 1.2 + rng() * 0.8, 0.6 + rng() * 0.5, pick(rng, rubble));
  heap(b, rng, x0 + 1.5, z1 + 0.8, 1.1 + rng() * 0.7, 0.5 + rng() * 0.4, pick(rng, rubble));
  debris(b, rng, 0, hz, 8, 14, [roof, roof, 0x8a8378, wall]);
  // Çalılar ve evin içinden çıkan genç ağaç
  tree(b, rng, (rng() - 0.5) * 3, hz + (rng() - 0.5) * 2, 3 + rng() * 2.5, false);
  for (let i = 0; i < 3; i++) tree(b, rng, (rng() < 0.5 ? -1 : 1) * (6 + rng() * 3), -6 + rng() * 14, 1.6 + rng() * 1.8, false);
  if (rng() < 0.7) tree(b, rng, -P + 2 + rng() * 3, -P + 2 + rng() * 3, 8 + rng() * 4);
  // Yarım çit: ön kenarda aralıklı parçalar, biri yerde
  const fc = pick(rng, [0x6e5a44, 0x7a6a50, 0x5a4a38]);
  fence(b, 3 + rng() * 2, -P + 3, P - 0.6, 0, fc);
  if (rng() < 0.6) fence(b, 2 + rng() * 2, P - 3.5, P - 0.6, 0, fc);
  A(b, BOX, 2.6, 0.08, 0.7, 1.5, TOP, P - 1.4, 0.4, fc, SURF.wood);
}

/** Ahşap ahır (köy ve tek çiftlik evinin yanında): taş kaide, tahta duvar, büyük kapı, beşik çatı, saman yığını. */
function barn(b: ArchBatch, rng: Rng): void {
  pad(b, 16, 20, pick(rng, [0x6e6a4a, 0x76704c]), SURF.earth);
  const wood = pick(rng, [0x6e5238, 0x7a5a3c, 0x8a3a2c, 0x5a4632]);
  A(b, BOX, 9.6, 0.6, 13.6, 0, 0, -1, 0, 0x8a8378, SURF.concrete);
  A(b, BOX, 9, 4.2, 13, 0, 0.6, -1, 0, wood, SURF.wood);
  gableRoof(b, 9, 13, 3.8, 0, 4.8, -1, 0, wood, SURF.wood, pick(rng, [0x5a5e66, 0x8e4a30, 0x4a4b50]), SURF.tile, 0.6);
  A(b, BOX, 3.6, 3.4, 0.16, 0, 0.6, 5.55, 0, 0x4a3a2a, SURF.wood);
  heap(b, rng, 3.5, 7.5, 1.8, 1.8, pick(rng, [0xb8a060, 0xa89050, 0xc0aa6a]));
  if (rng() < 0.6) tub(b, rng, -3.5, 7, rng() * 3, false);
}

/** Köy kuyusu: taş bilezik, iki direk, çatı ve makara. */
function well(b: ArchBatch, rng: Rng): void {
  flat(b, 7, 7, 0, 0, 0x8a8070, SURF.paving, 0, 0.1);
  A(b, CYL, 1.1, 0.9, 1.1, 0, TOP, 0, 0, pick(rng, C.stone), SURF.concrete);
  A(b, DISC, 0.85, 0.05, 0.85, 0, TOP + 0.6, 0, 0, C.water, SURF.water);
  for (const s of [-1, 1]) A(b, BOX, 0.16, 2.4, 0.16, s * 0.95, TOP, 0, 0, C.wood, SURF.wood);
  A(b, BOX, 2.2, 0.12, 0.12, 0, TOP + 2.0, 0, 0, C.wood, SURF.wood);
  gableRoof(b, 1.8, 2.6, 0.8, 0, TOP + 2.4, 0, Math.PI / 2, C.wood, SURF.wood, pick(rng, C.tile), SURF.tile, 0.3);
  bench(b, 2.6, 0, Math.PI / 2);
}

/**
 * Terk edilmiş maden ocağı (savaş öncesi kapanmış): paslı kafes kule ve düşmüş makara, çatısı çökmüş tuğla kuyu ağzı,
 * çatısız vinç dairesi, kırık baca, otlanmış pasa yığını, kopuk dekovil hattı ve devrik vagonlar, çökmüş kulübe, yer yer
 * kalmış tel çit, su birikintisi; sahayı çalı ve genç ağaç basmış.
 */
function oldMine(b: ArchBatch, rng: Rng, W: ArchBatch = b): void {
  const rust = pick(rng, [0x5e4636, 0x6a4a34, 0x584238]);
  const brick = pick(rng, [0x7e4636, 0x74422f, 0x6e4434]);
  const sheet = pick(rng, [0x7a6a5a, 0x6e665c]);
  const M = SURF.metal;
  pad(b, 84, 66, pick(rng, [0x666a48, 0x6a6a4a, 0x625f46]), SURF.earth);
  for (let i = 0; i < 5; i++) flat(b, 10 + rng() * 14, 8 + rng() * 10, (rng() - 0.5) * 60, (rng() - 0.5) * 46, pick(rng, [0x616a44, 0x666c46, 0x5d6643]), SURF.grass, rng() * 3, 0.1);
  flat(b, 7, 60, 22, 0, 0x5e5446, SURF.earth, 0.1, 0.11);

  // Kuyu kulesi: paslı kafes, tepede platform, tek makara yerinde, öbürü yere düşmüş
  const hx = -14;
  const hz = -6;
  lattice(W, hx, hz, 2.6, 20, 4, rust, 0.3);
  A(W, BOX, 7, 0.4, 7, hx, 20, hz, 0, rust, M);
  W.push(new THREE.CylinderGeometry(2.3, 2.3, 0.28, 18).rotateZ(Math.PI / 2), rust, M, 0, hx + 1.2, 23.2, hz);
  A(W, BOX, 0.45, 3.2, 0.45, hx + 2.6, 20.4, hz, 0, rust, M);
  W.push(new THREE.CylinderGeometry(2.3, 2.3, 0.28, 18).rotateZ(Math.PI / 2).rotateX(1.25), rust, M, 0.6, hx + 7, 0.9, hz + 5);
  for (const s of [-1, 1]) W.push(beam(hx + s * 2.2, 20, hz + 2, hx + s * 3.4, 0, hz + 15, 0.6), rust, M);
  // Kuyu ağzı: tuğla duvarlar, çatısı içeri çökmüş, kapıları tahtayla kapatılmış
  A(b, BOX, 12.6, 0.5, 12.6, hx, 0, hz, 0, 0x7e786e, SURF.concrete);
  brokenWall(W, rng, hx - 6, hz - 6, hx + 6, hz - 6, 6.4, brick, SURF.brickWin, 0.8);
  brokenWall(W, rng, hx - 6, hz + 6, hx + 6, hz + 6, 6.4, brick, SURF.brickWin, 0.6);
  brokenWall(W, rng, hx - 6, hz - 6, hx - 6, hz + 6, 6.4, brick, SURF.brickWin, 0.6);
  brokenWall(W, rng, hx + 6, hz - 6, hx + 6, hz + 6, 6.4, brick, SURF.brickWin, 0.5);
  W.push(new THREE.BoxGeometry(11, 0.2, 7).rotateX(-0.5), sheet, SURF.corrugated, 0, hx, 3.6, hz - 1.5);
  for (let i = 0; i < 3; i++) W.push(beam(hx - 4 + i * 4, 6.9, hz - 5.5, hx - 4 + i * 4, 6.9 + 1.4 * rng(), hz - 1, 0.18), 0x3a2e24, SURF.wood);
  // Vinç dairesi: çatısız, pencere boşlukları kararmış
  const wz = hz + 24;
  A(b, BOX, 14.6, 0.5, 12.6, hx, 0, wz, 0, 0x7e786e, SURF.concrete);
  brokenWall(W, rng, hx - 7, wz - 6, hx + 7, wz - 6, 8.5, brick, SURF.brickWin, 0.7);
  brokenWall(W, rng, hx - 7, wz + 6, hx + 7, wz + 6, 8.5, brick, SURF.brickWin, 0.7);
  brokenWall(W, rng, hx - 7, wz - 6, hx - 7, wz + 6, 8.5, brick, SURF.brickWin, 0.85);
  brokenWall(W, rng, hx + 7, wz - 6, hx + 7, wz + 6, 8.5, brick, SURF.brickWin, 0.5);
  for (let i = 0; i < 4; i++) if (rng() < 0.6) A(W, BOX, 14.4, 0.3, 0.3, hx, 8.6, wz - 4.5 + i * 3, 0, 0x3a2e24, SURF.wood);
  // Kırık baca: başlıksız, tepesi yarım
  const cx = hx - 13;
  const cz = wz + 2;
  A(W, BOX, 3.6, 2.0, 3.6, cx, 0, cz, 0, brick, SURF.brick);
  const ch = 13 + rng() * 6;
  W.push(new THREE.CylinderGeometry(1.15, 1.6, ch, 12).translate(0, ch / 2, 0), brick, SURF.brick, 0, cx, 2, cz);
  A(W, BOX, 1.1, 1.2, 0.6, cx + 0.4, 2 + ch, cz, 0.5, brick, SURF.brick);
  // Pasa yığını: büyük, otlanmış; eteğinde genç ağaçlar
  const spoil = pick(rng, [0x5a5a48, 0x5e5a4a, 0x55584a]);
  heap(b, rng, 24, -20, 15, 10, spoil);
  heap(b, rng, 32, -8, 8, 5, spoil);
  for (let i = 0; i < 4; i++) tree(b, rng, 24 + (rng() - 0.5) * 30, -20 + (rng() < 0.5 ? -1 : 1) * (14 + rng() * 4), 4 + rng() * 4);
  // Dekovil: kopuk raylar, eksik traversler, devrik ve yarım vagonlar
  const rx = 6;
  for (const [z0, z1] of [[-26, -8], [-3, 14], [19, 28]]) {
    for (const s of [-1, 1]) A(W, BOX, 0.14, 0.4, z1 - z0, rx + s * 0.6, 0, (z0 + z1) / 2, 0.02, 0x4a3a30, M);
    for (let z = z0; z <= z1; z += 2.2) if (rng() < 0.7) A(W, BOX, 2.1, 0.36, 0.28, rx, 0, z, (rng() - 0.5) * 0.3, 0x3e3226, SURF.wood);
  }
  tub(W, rng, rx, 4, 0.05, false);
  W.push(new THREE.BoxGeometry(1.9, 1.0, 2.3).rotateZ(1.35), pick(rng, [0x5c4634, 0x4a4038]), M, 0.5, rx + 3, 1.0, 17);
  W.push(new THREE.BoxGeometry(1.5, 0.3, 2.6).rotateZ(-0.4), 0x2c2a28, M, 0.5, rx + 4.2, 0.5, 18.5);
  // Çökmüş kulübe: duvarlar yarım, çatı yerde
  const sx = 28;
  const sz = 18;
  brokenWall(W, rng, sx - 4, sz - 3, sx + 4, sz - 3, 3, 0x6e5238, SURF.wood, 0.6, 0);
  brokenWall(W, rng, sx - 4, sz - 3, sx - 4, sz + 3, 3, 0x6e5238, SURF.wood, 0.4, 0);
  W.push(new THREE.BoxGeometry(9, 0.16, 7).rotateZ(0.35), C.felt, SURF.felt, 0.2, sx + 0.5, 1.2, sz);
  // Su birikintisi ve paslı varil
  A(b, DISC, 6, 0.2, 4, -32, 0.02, -18, 0.4, 0x4a5a52, SURF.water);
  for (let i = 0; i < 3; i++) {
    if (rng() < 0.4) W.push(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10).rotateZ(Math.PI / 2), rust, M, rng() * 3, -26 + i * 1.4, 0.3, -12 + rng());
    else A(W, CYL, 0.3, 0.9, 0.3, -26 + i * 1.4, 0, -12, 0, rust, M);
  }
  // Tel çit: aralıklı kalmış direkler, sarkık teller, devrik kapı
  const post = (x: number, z: number, lean = 0): void => {
    W.push(new THREE.BoxGeometry(0.18, 2.2, 0.18).translate(0, 1.1, 0).rotateZ(lean), 0x6a655e, SURF.concrete, 0, x, 0, z);
  };
  for (let x = -40; x <= 40; x += 6) {
    if (rng() < 0.65) post(x, -32.5, rng() < 0.2 ? 0.5 : 0);
    if (rng() < 0.65) post(x, 32.5, rng() < 0.2 ? -0.5 : 0);
  }
  for (const [ax, bx] of [[-40, -16], [4, 22]]) A(W, BOX, bx - ax, 0.05, 0.05, (ax + bx) / 2, 1.1 + rng() * 0.6, -32.5, 0.02, 0x3e4246, M);
  W.push(new THREE.BoxGeometry(4, 1.8, 0.1).translate(0, 0.9, 0).rotateX(-1.3), rust, M, 0, 34, 0.2, 33.5);
  // Sahayı basan çalı ve genç ağaçlar
  for (let i = 0; i < 9; i++) {
    const x = (rng() - 0.5) * 74;
    const z = (rng() - 0.5) * 56;
    if (Math.abs(x - hx) < 9 && Math.abs(z - hz) < 9) continue;
    tree(b, rng, x, z, rng() < 0.5 ? 1.6 + rng() * 1.6 : 5 + rng() * 5);
  }
}

/** Süs modelleri (decor.ts). */
export type DecorModel = 'ruin' | 'barn' | 'well' | 'oldmine';

/** worn: yıkık ve terk edilmiş yapıların yıpranmış parçaları (hasar gölgelendiricili malzeme); zemin ve bitki b'de kalır. */
export function buildDecorModel(kind: DecorModel, rng: Rng, b: ArchBatch, worn: ArchBatch = b): void {
  switch (kind) {
    case 'ruin': ruinHouse(b, rng, worn); break;
    case 'barn': barn(b, rng); break;
    case 'well': well(b, rng); break;
    case 'oldmine': oldMine(b, rng, worn); break;
  }
}

/** Ortak parçalar (askerî yapılar da kullanır: structures.ts). */
export const cityParts = { pad, flat, gableRoof, hipRoof, chimney, door, truck, car, lamp, tree };

/** Şehir yapısının parçalarını yapının yığınına ekler. */
export function buildCityModel(kind: StructureKind, rng: Rng, b: ArchBatch, level = 1): void {
  switch (kind) {
    case 'firestation': firestation(b, rng, level); break;
    case 'townhall': townhall(b, rng); break;
    case 'smallhouse': smallHouse(b, rng); break;
    case 'midhouse': midHouse(b, rng); break;
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
