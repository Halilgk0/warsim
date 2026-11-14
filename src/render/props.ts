// Ortak küçük geometriler: ağaçlar, kaya, beşik çatı; ve çok parçalı statik modelleri malzeme başına
// tek ağa birleştiren yardımcı (çizim çağrısı sayısını düşük tutar).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Konum + normal (+ isteğe bağlı renk) içeren indekssiz geometri. */
function clean(g: THREE.BufferGeometry, color?: THREE.Color): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', n.getAttribute('position'));
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  out.setAttribute('normal', n.getAttribute('normal'));
  if (color) {
    const cnt = out.getAttribute('position').count;
    const arr = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      arr[i * 3] = color.r;
      arr[i * 3 + 1] = color.g;
      arr[i * 3 + 2] = color.b;
    }
    out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  } else if (n.getAttribute('color')) out.setAttribute('color', n.getAttribute('color'));
  return out;
}

/** Birim beşik çatı: taban y=0, x∈[-.5,.5], z∈[-.5,.5], mahya y=1 boyunca z. */
export const GABLE = (() => {
  const v = [
    [-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5],
    [-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5],
  ];
  const tri = (a: number, b: number, c: number) => [...v[a], ...v[b], ...v[c]];
  const pos = [
    ...tri(0, 2, 1), ...tri(3, 4, 5),
    ...tri(0, 3, 5), ...tri(0, 5, 2),
    ...tri(1, 2, 5), ...tri(1, 5, 4),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
})();

export const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
export const CYL = new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0);
export const DISC = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0);
/** Kemer çatı (yarım silindir), uzunluk Z ekseninde. */
export const ARCH = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);

const TRUNK = new THREE.Color(0x7a6552);

/**
 * Taç parçası: köşe rengi yüksekliğe göre (dipte gölge, tepede ışık) ve yüz başına hafif oynar; düz renkli biçim gibi
 * durmaz. Ton 0,7–1,12 arasıdır (gövde rengi bunun altında kalır: cityModels.ts tacı tondan ayırır). y0, y1: tacın alt
 * ve üst yüksekliği.
 */
function crown(g: THREE.BufferGeometry, color: THREE.Color, y0: number, y1: number, seed: number): THREE.BufferGeometry {
  const out = clean(g);
  const p = out.getAttribute('position');
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const face = Math.floor(i / 3);
    const jit = (Math.abs(Math.sin((face + seed) * 12.9898) * 43758.5453) % 1) * 0.1 - 0.05;
    const v = 0.72 + 0.38 * t * t * (3 - 2 * t) + jit;
    arr[i * 3] = color.r * v;
    arr[i * 3 + 1] = color.g * v;
    arr[i * 3 + 2] = color.b * v;
  }
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}

/** İğne yapraklı ağaç (birim yükseklik), köşe renkli: dört kademe dal, her kademe bir öncekine göre dönük. */
export function coniferGeo(crownColor: number): THREE.BufferGeometry {
  const c = new THREE.Color(crownColor);
  const parts = [clean(new THREE.CylinderGeometry(0.035, 0.055, 0.3, 4, 1, true).translate(0, 0.15, 0), TRUNK)];
  const tiers: [number, number, number][] = [[0.33, 0.34, 0.33], [0.27, 0.32, 0.51], [0.2, 0.3, 0.69], [0.13, 0.28, 0.86]];
  tiers.forEach(([r, h, y], i) => {
    parts.push(crown(new THREE.ConeGeometry(r, h, 6, 1, true).rotateY(i * 0.5).translate(0, y, 0), c, y - h / 2, y + h / 2, i * 7));
  });
  return mergeGeometries(parts)!;
}

/** Yapraklı ağaç (birim yükseklik), köşe renkli: ana taç ve iki yan öbek (düzgün top gibi durmaz). */
export function broadleafGeo(crownColor: number): THREE.BufferGeometry {
  const c = new THREE.Color(crownColor);
  const parts = [
    clean(new THREE.CylinderGeometry(0.04, 0.07, 0.46, 4, 1, true).translate(0, 0.23, 0), TRUNK),
    crown(new THREE.IcosahedronGeometry(0.36, 0).scale(1, 0.85, 1).translate(0, 0.66, 0), c, 0.36, 0.97, 1),
    crown(new THREE.IcosahedronGeometry(0.23, 0).scale(1, 0.8, 1).rotateY(0.6).translate(0.21, 0.55, 0.09), c, 0.36, 0.97, 5),
    crown(new THREE.IcosahedronGeometry(0.2, 0).scale(1, 0.85, 1).rotateY(1.9).translate(-0.18, 0.6, -0.15), c, 0.36, 0.97, 9),
  ];
  return mergeGeometries(parts)!;
}

/** Uzak yapraklı ağaç: yakın modelin ana tacı, gövdesiz ve yan öbeksiz (1,3 km ötede ayrıntı görünmez). */
export function broadleafFarGeo(crownColor: number): THREE.BufferGeometry {
  return crown(new THREE.IcosahedronGeometry(0.36, 0).scale(1, 0.85, 1).translate(0, 0.66, 0), new THREE.Color(crownColor), 0.36, 0.97, 1);
}

/** Uzak iğne yapraklı ağaç: yakın modelin dış çizgisinde iki koni, gövdesiz. */
export function coniferFarGeo(crownColor: number): THREE.BufferGeometry {
  const c = new THREE.Color(crownColor);
  return mergeGeometries([
    crown(new THREE.ConeGeometry(0.33, 0.6, 5, 1, true).translate(0, 0.46, 0), c, 0.16, 0.76, 2),
    crown(new THREE.ConeGeometry(0.2, 0.46, 5, 1, true).translate(0, 0.77, 0), c, 0.5, 1.0, 4),
  ])!;
}

/** Kaya (birim boyut), köşe renkli. */
export function rockGeo(color: number): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(0.5, 0);
  const p = g.getAttribute('position');
  // Hafif bozulma: her kaya biraz yassı ve köşeli
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setY(i, y * 0.62 + 0.18);
    p.setX(i, p.getX(i) * (1 + 0.12 * Math.sin(i * 1.7)));
  }
  g.computeVertexNormals();
  return clean(g, new THREE.Color(color));
}

/**
 * Sabit nesne: konum matrisini bir kez hesapla, her karedeki matris güncellemesinden çıkar (arazi ve süs binlerce
 * nesne; her kare hepsinin matrisi baştan hesaplanıyordu). Üst grup dünyanın başlangıcında olmalı.
 */
export function freeze(o: THREE.Object3D): void {
  o.updateMatrixWorld(true);
  o.traverse((c) => {
    c.matrixAutoUpdate = false;
    c.matrixWorldAutoUpdate = false;
  });
}

/** Malzeme başına parça biriktirip tek ağa birleştirir. */
export class Batch {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** Birim geometriyi ölçekle, Y etrafında döndür, konumla. */
  add(
    geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, ry = 0, color?: number,
  ): void {
    const g = geo.clone();
    g.scale(sx, sy, sz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.push(mat, g, color);
  }

  push(mat: THREE.Material, g: THREE.BufferGeometry, color?: number): void {
    const colored = (mat as THREE.MeshLambertMaterial).vertexColors;
    const c = clean(g, color !== undefined && colored ? new THREE.Color(color) : undefined);
    if (colored && !c.getAttribute('color')) {
      const cnt = c.getAttribute('position').count;
      c.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(1), 3));
    }
    if (!colored) c.deleteAttribute('color');
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(c);
  }

  /** Birleştirilmiş ağları gruba ekler. */
  build(into: THREE.Object3D): void {
    for (const [mat, list] of this.parts) {
      const m = mergeGeometries(list);
      if (!m) continue;
      m.computeBoundingSphere();
      into.add(new THREE.Mesh(m, mat));
    }
    this.parts.clear();
  }
}
