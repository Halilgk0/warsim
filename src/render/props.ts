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
function crown(g: THREE.BufferGeometry, color: THREE.Color, y0: number, y1: number, seed: number, round = false): THREE.BufferGeometry {
  const out = clean(g);
  const p = out.getAttribute('position');
  if (round) roundNormals(out);
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const face = Math.floor(i / 3);
    // Yüz başına ton farkı az (yuvarlak gölgelenmede iri yüzler yine seçilmesin)
    const jit = (Math.abs(Math.sin((face + seed) * 12.9898) * 43758.5453) % 1) * 0.05 - 0.025;
    const v = 0.72 + 0.38 * t * t * (3 - 2 * t) + jit;
    arr[i * 3] = color.r * v;
    arr[i * 3 + 1] = color.g * v;
    arr[i * 3 + 2] = color.b * v;
  }
  out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return out;
}

/**
 * Yuvarlak taç gölgelenmesi (2026-11-17): yüz normali yerine öbeğin merkezinden dışa bakan normal (biraz yukarı eğik,
 * yüz normaliyle az karışık). Yirmi yüzlü taç köşeli bir taş gibi değil, ışığı yumuşakça döndüren yaprak öbeği gibi
 * görünür ("oyuncak" görünümün en belirgin izi köşeli taçlardı). Üçgen sayısı değişmez.
 */
function roundNormals(g: THREE.BufferGeometry): void {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const c = bb.getCenter(new THREE.Vector3());
  const h = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const v = new THREE.Vector3();
  const f = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set((p.getX(i) - c.x) / h.x, (p.getY(i) - c.y) / h.y, (p.getZ(i) - c.z) / h.z).normalize();
    f.set(n.getX(i), n.getY(i), n.getZ(i));
    v.multiplyScalar(0.78).addScaledVector(f, 0.22);
    v.y += 0.12;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
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

/**
 * Yapraklı ağaç (birim yükseklik), köşe renkli: ana taç ve iki yan öbek (düzgün top gibi durmaz). fine: yapıların
 * ağaçları (şehir, çiftlik, üs; sayısı az) için ince bölünmüş ve gürültüyle bozulmuş öbekler, gövdede iki dal
 * (248 yerine ~270 üçgen); arazideki binlerce ağaç kaba modelde kalır (68 üçgen).
 */
export function broadleafGeo(crownColor: number, fine = false): THREE.BufferGeometry {
  const c = new THREE.Color(crownColor);
  const lump = (r: number, seed: number): THREE.BufferGeometry => {
    const g = new THREE.IcosahedronGeometry(r, fine ? 1 : 0);
    if (fine) lumpy(g, r, seed);
    return g;
  };
  const parts = [
    clean(new THREE.CylinderGeometry(0.04, 0.07, 0.46, fine ? 6 : 4, 1, true).translate(0, 0.23, 0), TRUNK),
    crown(lump(0.36, 1).scale(1, 0.85, 1).translate(0, 0.66, 0), c, 0.36, 0.97, 1, true),
    crown(lump(0.23, 5).scale(1, 0.8, 1).rotateY(0.6).translate(0.21, 0.55, 0.09), c, 0.36, 0.97, 5, true),
    crown(lump(0.2, 9).scale(1, 0.85, 1).rotateY(1.9).translate(-0.18, 0.6, -0.15), c, 0.36, 0.97, 9, true),
  ];
  if (fine) {
    // Taca giren iki kalın dal (taç seyrek yerde görünür)
    for (const [a, l] of [[0.7, 0.24], [3.6, 0.2]] as const) {
      const br = new THREE.CylinderGeometry(0.014, 0.026, l, 4, 1, true).translate(0, l / 2, 0).rotateZ(0.75).rotateY(a).translate(0, 0.4, 0);
      parts.push(clean(br, TRUNK));
    }
  }
  return mergeGeometries(parts)!;
}

/** Öbeği gürültüyle boz: köşe konumundan türeyen sapma (aynı köşe her yüzde aynı kayar, yarık açılmaz). */
function lumpy(g: THREE.BufferGeometry, r: number, seed: number): void {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / r;
    const y = p.getY(i) / r;
    const z = p.getZ(i) / r;
    const n = Math.sin(x * 4.1 + seed) * 0.5 + Math.sin(z * 3.7 - seed * 1.7) * 0.5 + Math.sin((x - y + z) * 6.3 + seed * 2.3) * 0.4;
    const k = 1 + 0.11 * n;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
}

/** Uzak yapraklı ağaç: yakın modelin ana tacı, gövdesiz ve yan öbeksiz (1,3 km ötede ayrıntı görünmez). */
export function broadleafFarGeo(crownColor: number): THREE.BufferGeometry {
  return crown(new THREE.IcosahedronGeometry(0.36, 0).scale(1, 0.85, 1).translate(0, 0.66, 0), new THREE.Color(crownColor), 0.36, 0.97, 1, true);
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
/**
 * Kaya biçimleri (2026-11-17; eskiden tek yassı on iki yüzlü, tek renk): 0 iri yuvarlak kaya, 1 yassı levha, 2 sivri ve
 * kırık yüzlü kaya. Gürültüyle bozulmuş on iki yüzlü (36 üçgen); taban gömülü ve düz. Her yüz kendi tonunda (kırık taş):
 * altta koyu ve nemli, yatay katman izleri, üste bakan yüzlerde liken (sarımsı) ve yosun (yeşil). Renkler birim: örnek
 * rengiyle çarpılır.
 */
export function rockGeos(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let v = 0; v < 3; v++) {
    // On iki yüzlü (36 üçgen): binlerce kaya var, 80 üçgenlik yirmi yüzlü ekranı ~%10 ağırlaştırıyordu (2026-11-17 ölçümü)
    const g = new THREE.DodecahedronGeometry(0.5, 0).toNonIndexed();
    const p = g.getAttribute('position');
    const sd = v * 13.7 + 1.3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      // Aynı köşe her yüzde aynı kaysın (konumdan türeyen sapma): yüzeyde yarık açılmaz
      const n = Math.sin(x * 7.3 + sd) * 0.5 + Math.sin(z * 6.1 - sd * 1.3) * 0.5 + Math.sin((x + y - z) * 11.7 + sd * 2.1) * 0.35;
      const k = 1 + 0.2 * n;
      let nx = x * k;
      let ny = y * k;
      let nz = z * k;
      if (v === 1) {
        ny *= 0.5;
        nx *= 1.25;
        nz *= 1.1;
      } else if (v === 2) {
        ny *= 1.3;
        // Kırık yüzler: iki yan düzlemle kesik
        if (nx > 0.3) nx = 0.3 + (nx - 0.3) * 0.25;
        if (nz < -0.28) nz = -0.28 + (nz + 0.28) * 0.25;
      }
      ny = ny * 0.78 + 0.16;
      if (ny < 0) ny *= 0.3;
      p.setXYZ(i, nx, ny, nz);
    }
    g.computeVertexNormals();
    const nrm = g.getAttribute('normal');
    const col = new Float32Array(p.count * 3);
    for (let f = 0; f < p.count; f += 3) {
      const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
      const up = nrm.getY(f);
      const h = Math.abs(Math.sin(f * 12.9898 + v * 78.233) * 43758.5453) % 1;
      let s = 0.84 + 0.26 * h;
      if (cy < 0.18) s *= 0.78;
      if (Math.sin(cy * 34 + v * 2.3) > 0.7) s *= 0.9;
      let r = s;
      let gg = s;
      let bb = s;
      if (up > 0.5 && h > 0.5) {
        if (h > 0.82) {
          r *= 0.66;
          gg *= 0.86;
          bb *= 0.52;
        } else {
          r *= 1.02;
          gg *= 1.0;
          bb *= 0.8;
        }
      }
      for (let j = 0; j < 3; j++) col.set([r, gg, bb], (f + j) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.push(clean(g));
  }
  return out;
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
