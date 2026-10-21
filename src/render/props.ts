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

const TRUNK = new THREE.Color(0x9b8470);

/** İğne yapraklı ağaç (birim yükseklik), köşe renkli. */
export function coniferGeo(crown: number): THREE.BufferGeometry {
  const c = new THREE.Color(crown);
  const parts = [
    clean(new THREE.CylinderGeometry(0.045, 0.06, 0.25, 4, 1, true).translate(0, 0.125, 0), TRUNK),
    clean(new THREE.ConeGeometry(0.3, 0.6, 5, 1, true).translate(0, 0.48, 0), c),
    clean(new THREE.ConeGeometry(0.2, 0.45, 5, 1, true).translate(0, 0.77, 0), c.clone().multiplyScalar(1.08)),
  ];
  return mergeGeometries(parts)!;
}

/** Yapraklı ağaç (birim yükseklik), köşe renkli. */
export function broadleafGeo(crown: number): THREE.BufferGeometry {
  const c = new THREE.Color(crown);
  const parts = [
    clean(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 4, 1, true).translate(0, 0.2, 0), TRUNK),
    clean(new THREE.IcosahedronGeometry(0.36, 0).scale(1, 0.85, 1).translate(0, 0.66, 0), c),
  ];
  return mergeGeometries(parts)!;
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
