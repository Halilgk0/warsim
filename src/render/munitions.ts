// Bomba, roket ve paraşüt modelleri (2026-11-17; eskiden tek renk pastel silindir, düz yarım küre ve gri kutu).
// Parçalar renkleriyle tek geometride (köşe rengi): çizim çağrısı artmaz. Yerel eksen: burun +z (bomba, roket), paraşütte
// y yukarı. Gerçek örneklere yakın: 1940'lar genel amaçlı bombası (SC/GP), RP-3 roketi, ipek paraşüt.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Geometriyi indekssiz yap, tek renk ver. */
function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const cnt = n.getAttribute('position').count;
  const arr = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) arr.set([c.r, c.g, c.b], i * 3);
  n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  return n;
}

const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, hex: number, ry = 0, rz = 0) =>
  paint(new THREE.BoxGeometry(sx, sy, sz).rotateZ(rz).rotateY(ry).translate(x, y, z), hex);

/** z ekseni boyunca dönmüş profil: (z, yarıçap) noktaları, burun +z. */
function lathe(pts: [number, number][], seg: number, hex: number): THREE.BufferGeometry {
  const v = pts.map(([z, r]) => new THREE.Vector2(Math.max(r, 0.001), z));
  return paint(new THREE.LatheGeometry(v, seg).rotateX(Math.PI / 2), hex);
}

/** z ekseni boyunca halka (bant): z0–z1 arası, yarıçap r. */
function band(z0: number, z1: number, r: number, seg: number, hex: number): THREE.BufferGeometry {
  return paint(new THREE.CylinderGeometry(r, r, z1 - z0, seg, 1, true).rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2), hex);
}

/**
 * Genel amaçlı bomba (boy 2,3 m; ölçeği gameRenderer büyütür): zeytin yeşili gövde, burunda tapa, gövdede sarı tanıma
 * bantları (patlayıcı dolu), arkada daralan kuyruk konisi, artı biçimli dört kanatçık ve kanatçıkları bağlayan kutu.
 */
export function bombGeometry(): THREE.BufferGeometry {
  const body = 0x646a4c;
  const parts = [
    lathe([[1.2, 0], [1.12, 0.1], [0.95, 0.2], [0.6, 0.27], [0.1, 0.29], [-0.45, 0.27], [-0.8, 0.18], [-1.0, 0.1], [-1.02, 0]], 12, body),
    lathe([[1.27, 0], [1.25, 0.05], [1.17, 0.06], [1.15, 0]], 8, 0x9a8a5a),
    band(0.5, 0.58, 0.29, 12, 0xc9a43a),
    band(-0.3, -0.22, 0.285, 12, 0xc9a43a),
    band(0.68, 0.72, 0.268, 12, 0x8a2a22),
  ];
  // Kanatçıklar (artı) ve kutu: kuyrukta, gövdeden biraz geniş
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    parts.push(paint(new THREE.BoxGeometry(0.02, 0.32, 0.5).translate(0, 0.2, -1.05).rotateZ(a), 0x3e4232));
  }
  const ringR = 0.34;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    parts.push(paint(new THREE.BoxGeometry(2 * ringR * Math.SQRT1_2 + 0.02, 0.02, 0.22).translate(0, ringR * Math.SQRT1_2, -1.18).rotateZ(a), 0x3e4232));
  }
  return mergeGeometries(parts)!;
}

/**
 * RP-3 roketi (boy 1,8 m): gri çelik boru gövde, önde koyu harp başlığı, kuyrukta dört kare kanatçık, ucunda nozul.
 */
export function rocketGeometry(): THREE.BufferGeometry {
  const parts = [
    band(-0.9, 0.45, 0.042, 8, 0x9a9ea2),
    lathe([[0.85, 0], [0.8, 0.04], [0.68, 0.075], [0.5, 0.08], [0.45, 0.06], [0.45, 0]], 8, 0x55574f),
    lathe([[0.86, 0], [0.84, 0.02], [0.8, 0]], 6, 0xb08a3a),
    band(-0.94, -0.9, 0.034, 8, 0x2a2a2a),
  ];
  for (let k = 0; k < 4; k++) {
    parts.push(paint(new THREE.BoxGeometry(0.012, 0.16, 0.22).translate(0, 0.12, -0.78).rotateZ((k * Math.PI) / 2), 0x5e6266));
  }
  return mergeGeometries(parts)!;
}

/**
 * Paraşüt kubbesi (birim yarıçap, taban y=0): 16 dilimli ipek, dilimler iki tonda (dikiş yerleri seçilir), tepede
 * havalandırma deliği, eteğinden aşağıda bir noktada (y = −lineEnd) toplanan sekiz askı ipi.
 */
export function canopyGeometry(lineEnd: number): THREE.BufferGeometry {
  const seg = 16;
  const g = new THREE.SphereGeometry(1, seg, 6, 0, Math.PI * 2, 0.12, Math.PI / 2 - 0.12).scale(1, 0.62, 1).toNonIndexed();
  g.deleteAttribute('uv');
  // Dilim rengi: yüzün açısına göre iki ton
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(0xf4f0e4);
  const b = new THREE.Color(0xdcd4c0);
  for (let f = 0; f < p.count; f += 3) {
    const x = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
    const z = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    const k = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * seg) % 2;
    const c = k ? a : b;
    for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (f + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const parts: THREE.BufferGeometry[] = [g];
  // Etek kenarı (koyu şerit) ve askı ipleri
  parts.push(paint(new THREE.CylinderGeometry(1.0, 1.0, 0.05, seg, 1, true).translate(0, 0.02, 0), 0xb8ae98));
  const end = new THREE.Vector3(0, -lineEnd, 0);
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2;
    const s = new THREE.Vector3(Math.cos(t), 0.02, Math.sin(t));
    const len = s.distanceTo(end);
    const line = new THREE.BoxGeometry(0.012, 0.012, len);
    line.lookAt(end.clone().sub(s));
    const mid = s.clone().add(end).multiplyScalar(0.5);
    parts.push(paint(line.translate(mid.x, mid.y, mid.z), 0x8a8270));
  }
  return mergeGeometries(parts)!;
}

/**
 * Paraşütçü (boy ~1,8 m, ayak y=0): haki uçuş tulumu, kemer takımı ve göğüste toka, deri başlık, kahverengi botlar; kollar
 * yukarıda askılara tutunur, bacaklar hafif açık.
 */
export function jumperGeometry(): THREE.BufferGeometry {
  const suit = 0x6a6248;
  const strap = 0x3a3428;
  const skin = 0xc8a080;
  const parts = [
    box(0.42, 0.62, 0.26, 0, 1.12, 0, suit),
    box(0.44, 0.08, 0.28, 0, 1.0, 0, strap),
    box(0.06, 0.62, 0.28, -0.12, 1.12, 0.01, strap),
    box(0.06, 0.62, 0.28, 0.12, 1.12, 0.01, strap),
    box(0.12, 0.1, 0.06, 0, 1.25, 0.15, 0xa8a090),
    box(0.22, 0.24, 0.24, 0, 1.56, 0, skin),
    box(0.25, 0.16, 0.27, 0, 1.64, -0.01, 0x4a3628),
    box(0.17, 0.48, 0.2, -0.11, 0.62, 0, suit, 0, 0.08),
    box(0.17, 0.48, 0.2, 0.11, 0.62, 0, suit, 0, -0.08),
    box(0.15, 0.36, 0.17, -0.14, 0.2, 0.02, suit, 0, 0.05),
    box(0.15, 0.36, 0.17, 0.14, 0.2, 0.02, suit, 0, -0.05),
    box(0.16, 0.12, 0.28, -0.15, 0.0, 0.05, 0x3a2a1e),
    box(0.16, 0.12, 0.28, 0.15, 0.0, 0.05, 0x3a2a1e),
    // Kollar yukarıda (askı tutar), sırtta paket
    box(0.11, 0.5, 0.11, -0.26, 1.55, 0, suit, 0, -0.25),
    box(0.11, 0.5, 0.11, 0.26, 1.55, 0, suit, 0, 0.25),
    box(0.36, 0.3, 0.12, 0, 1.12, -0.18, 0x5a5440),
  ];
  // Askılar: omuzlardan yukarı
  for (const s of [-1, 1]) parts.push(box(0.03, 0.9, 0.03, s * 0.17, 1.75, 0, strap, 0, s * 0.12));
  return mergeGeometries(parts)!;
}
