// Hava üssünün araçları (2026-11-17; eskiden kutu ve silindirler): Bedford QL benzeri yakıt tankeri, David Brown benzeri
// uçak çekicisi, Austin K2 benzeri ambulans, akü arabası (çalıştırma arabası). Parçalar yapının yığınına eklenir
// (arch.ts: boyalı metalde kenar aşınması ve perçin); kavisli çamurluk ve kaput yarım silindir kabuklarla. Yerel eksen:
// burun +z, tekerlek altı y = 0 (y parametresi zeminin kotu: apron betonu 0,9 m).

import * as THREE from 'three';
import { BOX } from './props';
import { SURF, type ArchBatch, type Surf } from './arch';

const BLACK = 0x18191b;
const TYRE = 0x1d1e1f;
const CHROME = 0xa9adb0;
const GLASS = 0x2c3842;
const OLIVE = 0x4f5638;
const OLIVE_DARK = 0x3e4430;

/** Teker ekseni x boyunca: lastik, jant, göbek. */
const TYRE_G = new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2);
const RIM_G = new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2);
/** Küçük teker (akü arabası): az dilimli lastik, jant ve göbek yok (o boyda görünmez; 16 araba üssü ~10 bin üçgen ağırlaştırıyordu). */
const TYRE_S = new THREE.CylinderGeometry(1, 1, 1, 8).rotateZ(Math.PI / 2);
/** Çamurluk kabuğu: tekerin üstünde yarım daire (ekseni x boyunca, açık). */
const FENDER_G = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
/** Yuvarlak üst (kaput, tavan, tank): ekseni z boyunca yarım silindir, taban y=0. */
const HALF_Z = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
/** Yatay disk (kapak, tavan işareti): ekseni y boyunca, merkezde. */
const DISC_Y = new THREE.CylinderGeometry(1, 1, 1, 14);
/** Tam silindir, ekseni z boyunca (tank, makara). */
const CYL_Z = new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2);
/** Kubbe kapak (tank ucu): ekseni z boyunca yarım küre. */
const CAP_Z = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
/** Far: ekseni z boyunca kısa silindir. */
const LAMP_G = new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2);

/** Aracın yerel çizicisi: (lx, ly, lz) yerelde, ry dönüşü ve (x, y, z) konumu. */
class Kit {
  private readonly c: number;
  private readonly s: number;
  constructor(private readonly b: ArchBatch, private readonly x: number, private readonly y: number, private readonly z: number, private readonly ry: number) {
    this.c = Math.cos(ry);
    this.s = Math.sin(ry);
  }

  private wx(lx: number, lz: number): number {
    return this.x + lx * this.c + lz * this.s;
  }

  private wz(lx: number, lz: number): number {
    return this.z - lx * this.s + lz * this.c;
  }

  /** Birim geometri: ölçek, yerel konum (taban ya da merkez geometriye göre), renk, yüzey; ek dönüş. */
  part(g: THREE.BufferGeometry, sx: number, sy: number, sz: number, lx: number, ly: number, lz: number, col: number, surf: Surf = SURF.metal, rot = 0): void {
    this.b.add(g, sx, sy, sz, this.wx(lx, lz), this.y + ly, this.wz(lx, lz), this.ry + rot, col, surf);
  }

  /** Kutu: taban ly'de. */
  box(sx: number, sy: number, sz: number, lx: number, ly: number, lz: number, col: number, surf: Surf = SURF.metal): void {
    this.part(BOX, sx, sy, sz, lx, ly, lz, col, surf);
  }

  /** Teker: lastik, jant ve göbek; çamurluk istenirse üstünde kavisli kabuk. */
  wheel(lx: number, lz: number, r: number, w: number, col: number, fender = 0): void {
    if (r < 0.25) {
      this.part(TYRE_S, w, r, r, lx, r, lz, TYRE, SURF.plain);
      return;
    }
    this.part(TYRE_G, w, r, r, lx, r, lz, TYRE, SURF.plain);
    this.part(RIM_G, w + 0.02, r * 0.58, r * 0.58, lx, r, lz, col);
    this.part(RIM_G, w + 0.05, r * 0.2, r * 0.2, lx, r, lz, CHROME);
    if (fender) this.part(FENDER_G, w + 0.12, r + fender, r + fender, lx, r, lz, col);
  }

  /** İki nokta arası ince çubuk (korkuluk, merdiven, ok). */
  rod(a: [number, number, number], b2: [number, number, number], w: number, col: number): void {
    const A = new THREE.Vector3(this.wx(a[0], a[2]), this.y + a[1], this.wz(a[0], a[2]));
    const B = new THREE.Vector3(this.wx(b2[0], b2[2]), this.y + b2[1], this.wz(b2[0], b2[2]));
    const g = new THREE.BoxGeometry(w, w, A.distanceTo(B));
    g.lookAt(B.clone().sub(A));
    const m = A.add(B).multiplyScalar(0.5);
    this.b.push(g.translate(m.x, m.y, m.z), col, SURF.metal);
  }

  /** 1940'lar ön yüzü: dikey çubuklu ızgara, çamurluk üstünde iki far, tampon, plaka. */
  front(w: number, zf: number, gy: number, gh: number, col: number): void {
    this.box(w * 0.55, gh, 0.08, 0, gy, zf, BLACK, SURF.plain);
    for (let k = -3; k <= 3; k++) this.box(0.03, gh - 0.06, 0.1, k * w * 0.075, gy + 0.03, zf + 0.01, CHROME);
    this.box(w * 0.6, 0.06, 0.12, 0, gy + gh, zf, col);
    for (const sd of [-1, 1]) {
      this.part(LAMP_G, 0.13, 0.13, 0.16, sd * w * 0.42, gy + gh - 0.05, zf - 0.05, CHROME);
      this.part(LAMP_G, 0.11, 0.11, 0.02, sd * w * 0.42, gy + gh - 0.05, zf + 0.04, 0xe6dcb0, SURF.plain);
    }
    this.box(w + 0.12, 0.14, 0.14, 0, 0.42, zf + 0.12, BLACK);
    this.box(0.5, 0.14, 0.03, 0, 0.58, zf + 0.2, 0x1c1c1c, SURF.plain);
  }
}

/**
 * Yakıt tankeri (Bedford QL refueller benzeri, 7,8 m, üç dingil): uzun kaputlu kabin (dik ön cam, yarım yuvarlak tavan,
 * kapılar), kavisli ön çamurluklar ve farlar; şasi üstünde oval kesitli, kubbeli uçlu tank; üstte iki dolum kapağı ve
 * korkuluklu yürüme yolu; arkada hortum makaralı kumanda dolabı ve basamaklı merdiven; yanda dolaplar, kabin arkasında
 * yedek teker ve bidonlar.
 */
export function refueller(b: ArchBatch, x: number, z: number, ry: number, y = 0): void {
  const k = new Kit(b, x, y, z, ry);
  const col = OLIVE;
  const w = 2.3;
  // Şasi ve tekerler (önde tek, arkada çift dingil)
  k.box(0.9, 0.28, 7.4, 0, 0.62, -0.2, BLACK);
  for (const sd of [-1, 1]) {
    k.wheel(sd * 0.95, 2.55, 0.5, 0.3, OLIVE_DARK, 0.1);
    k.wheel(sd * 0.95, -1.55, 0.5, 0.34, OLIVE_DARK);
    k.wheel(sd * 0.95, -2.7, 0.5, 0.34, OLIVE_DARK);
  }
  for (const sd of [-1, 1]) k.box(0.4, 0.05, 2.5, sd * 1.0, 1.08, -2.12, OLIVE_DARK);
  // Kaput ve ön
  k.box(1.3, 0.75, 1.6, 0, 0.82, 2.6, col);
  k.part(HALF_Z, 0.65, 0.2, 1.6, 0, 1.57, 2.6, col);
  k.front(1.4, 3.42, 0.86, 0.72, col);
  for (const sd of [-1, 1]) k.box(0.36, 0.06, 0.6, sd * 0.95, 1.12, 2.0, col);
  // Kabin: gövde, ön ve yan camlar, kapı çizgileri, yuvarlak tavan, ayna
  k.box(w, 1.25, 1.55, 0, 0.82, 1.2, col);
  k.box(w - 0.2, 0.62, 0.06, 0, 1.42, 1.98, GLASS, SURF.plain);
  k.box(0.04, 0.62, 0.06, 0, 1.42, 2.0, col);
  for (const sd of [-1, 1]) {
    k.box(0.06, 0.5, 0.75, sd * (w / 2 + 0.01), 1.5, 1.35, GLASS, SURF.plain);
    k.box(0.03, 1.1, 0.03, sd * (w / 2 + 0.02), 0.9, 0.62, BLACK, SURF.plain);
    k.box(0.05, 0.05, 0.18, sd * (w / 2 + 0.05), 1.55, 1.0, CHROME);
    k.box(0.04, 0.22, 0.15, sd * (w / 2 + 0.22), 1.95, 1.95, BLACK);
    k.rod([sd * (w / 2), 1.9, 1.9], [sd * (w / 2 + 0.22), 2.0, 1.95], 0.025, BLACK);
  }
  k.part(HALF_Z, w / 2, 0.3, 1.6, 0, 2.07, 1.2, col);
  // Kabin arkası: yedek teker ve bidon rafı
  k.part(TYRE_G, 0.24, 0.48, 0.48, 0, 1.55, 0.3, TYRE, SURF.plain);
  for (let i = 0; i < 3; i++) k.box(0.16, 0.45, 0.34, -0.85 + i * 0.2, 0.92, 0.3, 0x3a4030);
  // Tank: oval kesit, kubbeli uçlar, kuşaklar
  const tz = -1.1;
  const tl = 4.3;
  k.part(CYL_Z, 1.08, 0.82, tl, 0, 1.78, tz, col);
  k.part(CAP_Z, 1.08, 0.82, 0.32, 0, 1.78, tz + tl / 2, col);
  k.part(CAP_Z, 1.08, 0.82, 0.32, 0, 1.78, tz - tl / 2, col, SURF.metal, Math.PI);
  for (const f of [-0.35, 0, 0.35]) k.part(CYL_Z, 1.1, 0.84, 0.08, 0, 1.78, tz + f * tl, OLIVE_DARK);
  for (const sd of [-1, 1]) k.box(0.18, 0.25, tl - 0.4, sd * 0.85, 0.88, tz, OLIVE_DARK);
  // Yürüme yolu, korkuluk, dolum kapakları
  k.box(0.6, 0.05, tl - 0.3, 0, 2.6, tz, BLACK);
  for (const sd of [-1, 1]) {
    for (const f of [-0.45, -0.15, 0.15, 0.45]) k.rod([sd * 0.32, 2.62, tz + f * tl], [sd * 0.32, 3.1, tz + f * tl], 0.03, BLACK);
    k.rod([sd * 0.32, 3.1, tz - 0.45 * tl], [sd * 0.32, 3.1, tz + 0.45 * tl], 0.03, BLACK);
  }
  for (const f of [-0.25, 0.25]) {
    k.part(DISC_Y, 0.28, 0.16, 0.28, 0, 2.7, tz + f * tl, OLIVE_DARK);
    k.box(0.12, 0.04, 0.3, 0.18, 2.75, tz + f * tl, CHROME);
  }
  // Arka kumanda dolabı: kapak, hortum makaraları, sayaç; basamak ve merdiven
  k.box(w, 1.3, 0.85, 0, 0.82, -3.75, col);
  k.box(w - 0.2, 1.0, 0.04, 0, 0.95, -4.19, 0x2e2a24, SURF.plain);
  for (const sd of [-1, 1]) {
    k.part(RIM_G, 0.5, 0.36, 0.36, sd * 0.5, 1.45, -4.15, 0x8a8a7a);
    k.part(RIM_G, 0.52, 0.12, 0.12, sd * 0.5, 1.45, -4.15, CHROME);
  }
  k.part(LAMP_G, 0.13, 0.13, 0.05, 0, 1.15, -4.2, 0xe8e4d8, SURF.plain);
  k.box(w, 0.08, 0.35, 0, 0.62, -4.3, BLACK);
  for (const sd of [-1, 1]) k.rod([sd * 0.25, 0.7, -4.25], [sd * 0.25, 2.6, -3.4], 0.04, BLACK);
  for (let i = 1; i < 6; i++) k.rod([-0.25, 0.7 + i * 0.32, -4.25 + i * 0.14], [0.25, 0.7 + i * 0.32, -4.25 + i * 0.14], 0.03, BLACK);
  for (const sd of [-1, 1]) k.box(0.1, 0.1, 0.05, sd * 0.95, 0.8, -4.32, 0xb0342a, SURF.plain);
  // Yan dolaplar (tankın altında)
  for (const sd of [-1, 1]) k.box(0.4, 0.55, 1.4, sd * 1.0, 0.62, -0.1, col);
}

/**
 * Uçak çekicisi (David Brown VIG benzeri): alçak, öne doğru yuvarlanan kaput ve ızgara, iri tekerleri saran geniş
 * çamurluklar, açık sürücü yeri (koltuk, direksiyon) ve dört dikmeli branda tente, arkada vinç tamburu ve çeki kancası.
 */
export function aircraftTractor(b: ArchBatch, x: number, z: number, ry: number, y = 0): void {
  const k = new Kit(b, x, y, z, ry);
  const col = OLIVE;
  k.box(1.2, 0.35, 3.4, 0, 0.42, 0, BLACK);
  for (const sd of [-1, 1]) {
    k.wheel(sd * 0.82, 1.05, 0.48, 0.38, OLIVE_DARK, 0.1);
    k.wheel(sd * 0.82, -1.0, 0.52, 0.42, OLIVE_DARK, 0.1);
    // Çamurlukları birleştiren basamak
    k.box(0.5, 0.06, 1.0, sd * 0.82, 0.8, 0.02, col);
  }
  k.box(1.25, 0.6, 1.5, 0, 0.75, 1.0, col);
  k.part(HALF_Z, 0.62, 0.2, 1.5, 0, 1.35, 1.0, col);
  k.front(1.2, 1.78, 0.78, 0.55, col);
  // Sürücü yeri
  k.box(1.5, 0.12, 1.4, 0, 0.78, -0.75, OLIVE_DARK);
  k.box(0.6, 0.12, 0.5, 0, 1.25, -0.95, 0x2a2622, SURF.canvas);
  k.box(0.6, 0.5, 0.1, 0, 1.3, -1.2, 0x2a2622, SURF.canvas);
  k.rod([0, 0.9, -0.1], [0, 1.65, -0.45], 0.05, BLACK);
  k.part(RIM_G, 0.03, 0.2, 0.2, 0, 1.68, -0.47, BLACK, SURF.metal, Math.PI / 2);
  // Tente
  for (const [lx, lz] of [[-0.72, -0.05], [0.72, -0.05], [-0.72, -1.45], [0.72, -1.45]]) k.rod([lx, 0.84, lz], [lx, 2.15, lz], 0.05, BLACK);
  k.box(1.6, 0.06, 1.6, 0, 2.15, -0.75, 0x6e6a52, SURF.canvas);
  k.box(1.6, 0.35, 0.04, 0, 1.8, -1.55, 0x6e6a52, SURF.canvas);
  // Vinç tamburu ve kanca
  k.part(RIM_G, 0.9, 0.22, 0.22, 0, 0.75, -1.7, OLIVE_DARK);
  k.box(0.25, 0.25, 0.4, 0, 0.45, -1.95, BLACK);
  for (const sd of [-1, 1]) k.box(0.1, 0.1, 0.05, sd * 0.55, 0.6, -1.72, 0xb0342a, SURF.plain);
}

/**
 * Ambulans (Austin K2 benzeri): kabinin üstüne taşan kare kasa, dik ön cam ve kısa kaput, kavisli çamurluklar; kasanın
 * yanlarında, arkasında ve tavanında beyaz daire içinde kızılhaç; arka çift kapı, basamak, yedek teker.
 */
export function ambulance(b: ArchBatch, x: number, z: number, ry: number, y = 0): void {
  const k = new Kit(b, x, y, z, ry);
  const col = OLIVE;
  const w = 2.0;
  k.box(0.9, 0.25, 5.0, 0, 0.55, -0.1, BLACK);
  for (const sd of [-1, 1]) {
    k.wheel(sd * 0.85, 1.75, 0.42, 0.26, OLIVE_DARK, 0.1);
    k.wheel(sd * 0.85, -1.4, 0.42, 0.3, OLIVE_DARK);
  }
  k.box(1.15, 0.65, 1.0, 0, 0.75, 2.05, col);
  k.part(HALF_Z, 0.58, 0.16, 1.0, 0, 1.4, 2.05, col);
  k.front(1.25, 2.57, 0.78, 0.62, col);
  // Kabin ve kasa (kasa kabinin üstüne taşar)
  k.box(w, 1.2, 1.1, 0, 0.75, 1.0, col);
  k.box(w - 0.25, 0.55, 0.05, 0, 1.35, 1.56, GLASS, SURF.plain);
  for (const sd of [-1, 1]) k.box(0.05, 0.5, 0.6, sd * (w / 2 + 0.01), 1.4, 1.05, GLASS, SURF.plain);
  k.box(w + 0.08, 1.95, 3.35, 0, 0.75, -1.1, col);
  k.box(w + 0.14, 0.08, 4.55, 0, 2.7, -0.55, OLIVE_DARK);
  k.box(w + 0.12, 0.3, 1.15, 0, 2.4, 1.05, col);
  // Kızılhaç: beyaz daire ve iki kırmızı çubuk (iki yanda, arkada, tavanda)
  const cross = (lx: number, ly: number, lz: number, rot: number, r: number): void => {
    k.part(LAMP_G, r, r, 0.02, lx, ly, lz, 0xece8dc, SURF.plain, rot);
    k.part(BOX, r * 1.2, r * 0.36, 0.03, lx, ly - r * 0.18, lz, 0xb02a24, SURF.plain, rot);
    k.part(BOX, r * 0.36, r * 1.2, 0.03, lx, ly - r * 0.6, lz, 0xb02a24, SURF.plain, rot);
  };
  for (const sd of [-1, 1]) cross(sd * (w / 2 + 0.06), 1.75, -1.1, Math.PI / 2, 0.5);
  cross(0, 1.85, -2.8, 0, 0.42);
  k.part(DISC_Y, 0.6, 0.02, 0.6, 0, 2.79, -1.1, 0xece8dc, SURF.plain);
  k.box(0.72, 0.03, 0.22, 0, 2.8, -1.1, 0xb02a24, SURF.plain);
  k.box(0.22, 0.03, 0.72, 0, 2.8, -1.1, 0xb02a24, SURF.plain);
  // Arka kapılar ve basamak
  k.box(0.03, 1.7, 0.04, 0, 0.82, -2.79, BLACK, SURF.plain);
  for (const sd of [-1, 1]) k.box(0.06, 0.25, 0.04, sd * 0.15, 1.5, -2.8, CHROME);
  k.box(1.2, 0.07, 0.35, 0, 0.5, -2.95, BLACK);
  for (const sd of [-1, 1]) k.box(0.1, 0.1, 0.05, sd * 0.85, 0.85, -2.8, 0xb0342a, SURF.plain);
}

/** Akü arabası (çalıştırma arabası): kutu gövde, kapaklı üst, iki sap, dört küçük teker, üstte kablo makarası. */
export function starterTrolley(b: ArchBatch, x: number, z: number, ry: number, y = 0): void {
  const k = new Kit(b, x, y, z, ry);
  const col = OLIVE_DARK;
  k.box(0.95, 0.75, 1.5, 0, 0.32, 0, col);
  k.box(1.0, 0.06, 1.55, 0, 1.07, 0, OLIVE);
  for (const sd of [-1, 1]) k.box(0.02, 0.4, 1.2, sd * 0.48, 0.5, 0, 0x2a2e26, SURF.plain);
  k.part(TYRE_S, 0.5, 0.26, 0.26, 0, 1.4, -0.2, 0x2a2a2a);
  for (const sd of [-1, 1]) k.rod([sd * 0.3, 1.0, 0.75], [sd * 0.3, 1.25, 1.45], 0.04, BLACK);
  k.rod([-0.3, 1.25, 1.45], [0.3, 1.25, 1.45], 0.05, BLACK);
  for (const [lx, lz] of [[-0.42, 0.55], [0.42, 0.55], [-0.42, -0.55], [0.42, -0.55]]) k.wheel(lx, lz, 0.17, 0.1, 0x3a3a3a);
}
