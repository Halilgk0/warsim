// İnşaat görünümü (2026-11-17; eskiden yarı saydam bina ve bej tel kafes kutu): bina yerden yukarı yükselir (kırpma
// düzlemi, structures.ts), gövdesinin çevresinde 1940'lar ahşap iskelesi (dikmeler, iki sıra kuşak, kat kat tahta döşeme,
// çapraz bağlantılar); büyük yapıda kule vinç ve malzeme yığınları (tuğla paletleri, kereste, çimento torbaları,
// betoniyer). İskele tek ağ (köşe rengi), yapı bitince kaldırılır. Hava üssünün binaları kilometrelere yayıldığı için
// orada iskele yok, yalnız yükselme.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const POLE = 0x8a6c4a;
const PLANK = 0x9e8058;
const CRANE = 0xb8902e;

function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const cnt = n.getAttribute('position').count;
  const arr = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) arr.set([c.r, c.g, c.b], i * 3);
  n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return n;
}

/** Kutu: boyut, alt orta noktası (taban y), Y dönüşü. */
const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, hex: number, ry = 0) =>
  paint(new THREE.BoxGeometry(sx, sy, sz).rotateY(ry).translate(x, y + sy / 2, z), hex);

/** İki nokta arası kiriş. */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, hex: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, w, a.distanceTo(b));
  g.lookAt(b.clone().sub(a));
  const m = a.clone().add(b).multiplyScalar(0.5);
  return paint(g.translate(m.x, m.y, m.z), hex);
}

/** Bina gövdesi sayılan yüzeyler (arch.ts SURF): duvar, cephe, çatı, cam ve kapı; ağaç, çit, araç, zemin sayılmaz. */
const BODY = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 21, 22, 25, 26, 27, 28, 29]);

export interface BodyInfo {
  /** Ayrı binalar (yerel kutular), büyükten küçüğe. */
  clusters: THREE.Box3[];
  /** Ana gövdenin yüksekliği (ince baca ve kuleler hariç; yerel y). */
  mainTop: number;
}

/**
 * Yapının bina gövdeleri (yerel): bina yüzeyli, 2,5 m'den yüksek parçalar; birbirine 3 m'den yakın olanlar bir bina
 * sayılır. Parça bilgisi ArchBatch'ten (userData.parts: [n, x0, y0, z0, x1, y1, z1], userData.surfs: yüzey türü).
 */
export function bodyInfo(group: THREE.Group): BodyInfo | null {
  const boxes: THREE.Box3[] = [];
  /** Gövde parçalarının tepesi ve taban alanı: ana yükseklik alanca ağırlıklı (geniş holler belirler, kule değil). */
  const tops: [number, number][] = [];
  const v = new THREE.Vector3();
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  group.traverse((o) => {
    const meta = o.userData?.parts as Float32Array | undefined;
    const surfs = o.userData?.surfs as Uint8Array | undefined;
    if (!(o as THREE.Mesh).isMesh || !meta || !surfs) return;
    const m = inv.clone().multiply(o.matrixWorld);
    for (let p = 0; p < surfs.length; p++) {
      const k = p * 7;
      if (!BODY.has(surfs[p]) || meta[k + 5] - meta[k + 2] < 2.5) continue;
      const bx = new THREE.Box3();
      for (const [x, y, z] of [[meta[k + 1], meta[k + 2], meta[k + 3]], [meta[k + 4], meta[k + 5], meta[k + 6]]]) bx.expandByPoint(v.set(x, y, z).applyMatrix4(m));
      boxes.push(bx);
      tops.push([bx.max.y, (bx.max.x - bx.min.x) * (bx.max.z - bx.min.z)]);
    }
  });
  if (!boxes.length) return null;
  // Ana yükseklik: taban alanının %80'ini kapsayan tepe (ince baca ve kuleler son %10'da çıkar)
  tops.sort((a, b) => a[0] - b[0]);
  const total = tops.reduce((a, t) => a + t[1], 0);
  let acc = 0;
  let mainTop = tops[tops.length - 1][0];
  for (const [y, a] of tops) {
    acc += a;
    if (acc >= total * 0.8) {
      mainTop = y;
      break;
    }
  }
  // Kümeleme: 3 m içindekiler birleşir (değişiklik kalmayana dek)
  const clusters: THREE.Box3[] = [];
  for (const bx of boxes) {
    const c = bx.clone();
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = clusters.length - 1; i >= 0; i--) {
        if (clusters[i].clone().expandByScalar(3).intersectsBox(c)) {
          c.union(clusters[i]);
          clusters.splice(i, 1);
          merged = true;
        }
      }
    }
    clusters.push(c);
  }
  const area = (c: THREE.Box3) => (c.max.x - c.min.x) * (c.max.z - c.min.z);
  clusters.sort((a, b) => area(b) - area(a));
  return { clusters: clusters.filter((c) => Math.max(c.max.x - c.min.x, c.max.z - c.min.z) > 4).slice(0, 6), mainTop };
}

/** Tek kenar boyunca iskele: (x0, z0)'dan (x1, z1)'e, dışa doğru normal (nx, nz), yükseklik H. */
function side(parts: THREE.BufferGeometry[], x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, H: number, rng: () => number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const dx = (x1 - x0) / len;
  const dz = (z1 - z0) / len;
  const ry = Math.atan2(dx, dz);
  const bays = Math.max(1, Math.round(len / 2.6));
  const lifts = Math.max(1, Math.floor(H / 2));
  for (const off of [0, 1.2]) {
    const ox = nx * off;
    const oz = nz * off;
    for (let i = 0; i <= bays; i++) {
      const t = (i / bays) * len;
      parts.push(box(0.1, H, 0.1, x0 + dx * t + ox, 0, z0 + dz * t + oz, POLE));
    }
    for (let l = 1; l <= lifts; l++) {
      parts.push(box(len + 0.3, 0.08, 0.08, (x0 + x1) / 2 + ox, l * 2 - 0.1, (z0 + z1) / 2 + oz, POLE, ry + Math.PI / 2));
    }
  }
  // Döşeme: her iki katta bir, iki sıra arasında tahta
  for (let l = 1; l <= lifts; l += 2) {
    parts.push(box(len, 0.05, 1.1, (x0 + x1) / 2 + nx * 0.6, l * 2, (z0 + z1) / 2 + nz * 0.6, PLANK, ry + Math.PI / 2));
  }
  // Çapraz bağlantılar: dış yüzde, her üç bölmede bir, kat kat
  for (let i = 0; i < bays; i += 3) {
    for (let l = 0; l < lifts; l++) {
      const t0 = (i / bays) * len;
      const t1 = (Math.min(bays, i + 1) / bays) * len;
      const flip = (i + l) % 2 === 0;
      const a = new THREE.Vector3(x0 + dx * (flip ? t0 : t1) + nx * 1.25, l * 2, z0 + dz * (flip ? t0 : t1) + nz * 1.25);
      const b = new THREE.Vector3(x0 + dx * (flip ? t1 : t0) + nx * 1.25, l * 2 + 2, z0 + dz * (flip ? t1 : t0) + nz * 1.25);
      if (rng() < 0.85) parts.push(beam(a, b, 0.07, POLE));
    }
  }
}

/** Kule vinç (yapının köşesinde): kafes görünümlü direk, kabin, ön ve arka kol, karşı ağırlık, halat ve kanca. */
function crane(parts: THREE.BufferGeometry[], x: number, z: number, H: number, reach: number, ang: number): void {
  const top = H + 10;
  // Direk: dört köşe borusu ve kuşaklar (kafes)
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push(box(0.18, top, 0.18, x + sx * 0.8, 0, z + sz * 0.8, CRANE));
  for (let y = 0; y < top; y += 2.2) {
    for (const [ax, az, bx, bz] of [[-0.8, -0.8, 0.8, -0.8], [0.8, -0.8, 0.8, 0.8], [0.8, 0.8, -0.8, 0.8], [-0.8, 0.8, -0.8, -0.8]]) {
      parts.push(beam(new THREE.Vector3(x + ax, y, z + az), new THREE.Vector3(x + bx, y + 2.2, z + bz), 0.07, CRANE));
    }
  }
  parts.push(box(2.2, 0.8, 2.2, x, 0, z, 0x6e6a64));
  const dx = Math.sin(ang);
  const dz = Math.cos(ang);
  parts.push(box(1.8, 2.0, 1.8, x - dx * 0.4, top, z - dz * 0.4, 0x4a5a6a, ang));
  // Ön kol ve arka kol (karşı ağırlıkla), tepe direği ve gergi
  const jibEnd = new THREE.Vector3(x + dx * reach, top + 2.4, z + dz * reach);
  parts.push(beam(new THREE.Vector3(x, top + 2.4, z), jibEnd, 0.6, CRANE));
  const back = new THREE.Vector3(x - dx * reach * 0.35, top + 2.4, z - dz * reach * 0.35);
  parts.push(beam(new THREE.Vector3(x, top + 2.4, z), back, 0.6, CRANE));
  parts.push(box(1.6, 1.6, 2.4, back.x, top + 0.9, back.z, 0x8a8680, ang));
  const peak = new THREE.Vector3(x, top + 7, z);
  parts.push(beam(new THREE.Vector3(x, top + 2.4, z), peak, 0.3, CRANE));
  parts.push(beam(peak, jibEnd, 0.05, 0x2a2a2a));
  parts.push(beam(peak, back, 0.05, 0x2a2a2a));
  // Halat ve kanca: kolun ortasından aşağı, ucunda kereste demeti
  const hx = x + dx * reach * 0.6;
  const hz = z + dz * reach * 0.6;
  parts.push(beam(new THREE.Vector3(hx, top + 2.1, hz), new THREE.Vector3(hx, H * 0.7 + 1.5, hz), 0.04, 0x2a2a2a));
  parts.push(box(0.4, 0.5, 0.4, hx, H * 0.7 + 1, hz, 0x2a2a2a));
  parts.push(box(3.2, 0.45, 0.8, hx, H * 0.7, hz, PLANK, ang));
}

/** Malzeme yığınları: tuğla paletleri, kereste, çimento torbaları, betoniyer. */
function materials(parts: THREE.BufferGeometry[], x: number, z: number, ry: number, rng: () => number): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (let i = 0; i < 3; i++) {
    const [px, pz] = at(i * 1.6, 0);
    parts.push(box(1.2, 0.12, 1.0, px, 0, pz, 0x7a6a50, ry));
    parts.push(box(1.1, 0.7 + rng() * 0.3, 0.9, px, 0.12, pz, 0x9a5640, ry));
  }
  for (let l = 0; l < 4; l++) {
    const [px, pz] = at(-3.2, 0.2 * l);
    parts.push(box(0.9, 0.18, 5.2, px, l * 0.18, pz, l % 2 ? 0xb89a68 : 0xa88a5a, ry));
  }
  for (let i = 0; i < 6; i++) {
    const [px, pz] = at(1 + (i % 3) * 0.75, 2 + Math.floor(i / 3) * 0.5);
    parts.push(box(0.7, 0.25, 0.45, px, Math.floor(i / 3) * 0.25, pz, 0xb4b0a6, ry));
  }
  // Betoniyer: tekerlekli şasi, eğik tambur
  const [mx, mz] = at(5.5, 1);
  parts.push(box(1.2, 0.5, 2.0, mx, 0.3, mz, 0x4a5a3a, ry));
  const drum = new THREE.CylinderGeometry(0.55, 0.75, 1.2, 10).rotateX(0.9).rotateY(ry).translate(mx, 1.5, mz);
  parts.push(paint(drum, 0x7a8a5a));
}

let matCache: THREE.MeshLambertMaterial | null = null;

/**
 * Yapının iskelesi, vinci ve malzemeleri (yerel eksenlerde, yapı grubuna eklenir): her binanın çevresinde iskele, en büyük
 * binanın yanında malzeme yığını ve (büyükse) vinç. Gövde yoksa ya da hava üssüyse null.
 */
export function buildScaffold(kind: string, seed: number, info: BodyInfo | null): THREE.Mesh | null {
  if (kind === 'airbase' || !info?.clusters.length) return null;
  let s = seed >>> 0;
  const rng = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const parts: THREE.BufferGeometry[] = [];
  info.clusters.forEach((bb, i) => {
    const H = Math.max(3, bb.max.y + 1.2);
    const x0 = bb.min.x - 1.2;
    const x1 = bb.max.x + 1.2;
    const z0 = bb.min.z - 1.2;
    const z1 = bb.max.z + 1.2;
    side(parts, x0, z1, x1, z1, 0, 1, H, rng);
    side(parts, x1, z0, x0, z0, 0, -1, H, rng);
    side(parts, x0, z0, x0, z1, -1, 0, H, rng);
    side(parts, x1, z1, x1, z0, 1, 0, H, rng);
    if (i > 0) return;
    const w = x1 - x0;
    const d = z1 - z0;
    if (Math.max(w, d) > 26 && H > 8) crane(parts, x1 + 5, z0 - 5, H, Math.min(60, Math.max(w, d) * 0.7), Math.atan2(-(x1 + 5 - (x0 + x1) / 2), (z0 + z1) / 2 - (z0 - 5)));
    materials(parts, x0 + 1, z1 + 4.5, 0, rng);
  });
  const g = mergeGeometries(parts);
  if (!g) return null;
  g.computeVertexNormals();
  matCache ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(g, matCache);
  mesh.castShadow = true;
  return mesh;
}
