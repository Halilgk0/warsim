// 3B low-poly pastel arazi. Simülasyonla aynı yükseklik ızgarası; yakında aynı üçgenleme (köşegen 00→11), uzakta daha seyrek.
// Harita değişince (terrainMap.version) parçalar baştan kurulur; arazi örtüsü de önce yeniden hesaplanmalı.
// Deniz: yüksekliği 0'ın altındaki köşeler deniz yüzeyine indirilir ve derinliğe göre maviye boyanır.

import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { MAP_SIZE } from '../sim/mapData';
import { TERRAIN_CELL, TERRAIN_N, TERRAIN_W, heights, terrainEdits, terrainMap, groundLevel } from '../sim/terrain';
import { PALETTE } from './palette';
import { FIELD_COLORS, clearFactor, fieldGrid, fieldKind, forestGrid, slopeGrid, urbanGrid } from './landcover';

const HALF = MAP_SIZE / 2;

/** Yüksekliğe göre renk duraklar (m). */
const STOPS: [number, [number, number, number]][] = [
  [-260, PALETTE.terrain.seaDeep],
  [-2, PALETTE.terrain.seaShallow],
  [0, PALETTE.terrain.sand],
  [18, PALETTE.terrain.sand],
  [40, PALETTE.terrain.grass1],
  [320, PALETTE.terrain.grass2],
  [650, PALETTE.terrain.grass3],
  [1000, PALETTE.terrain.hill],
  [1600, PALETTE.terrain.rock],
  [2300, PALETTE.terrain.peak],
];

/** Köşe renkleri doğrusal uzayda olmalı (palet sRGB). */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const FOREST: [number, number, number] = [138, 182, 126];
const FOREST_HIGH: [number, number, number] = [126, 168, 132];
const URBAN: [number, number, number] = [226, 221, 208];
const CLIFF: [number, number, number] = [190, 184, 182];

/**
 * Köşe rengi: yüksekliğe göre temel renk, üstüne dik yamaçta kaya, ormanda koyu yeşil, ovada tarla parselleri.
 * k: ızgara köşe indeksi (arazi örtüsü ızgaraları), x/z: dünya konumu (yapı tabanları temizlenir).
 */
function colorAt(h: number, jitter: number, out: number[], k = -1, x = 0, z = 0): void {
  let i = 0;
  while (i < STOPS.length - 1 && h > STOPS[i + 1][0]) i++;
  const [h0, c0] = STOPS[i];
  const [h1, c1] = STOPS[Math.min(i + 1, STOPS.length - 1)];
  const t = h1 > h0 ? smoothstep(h0, h1, h) : 0;
  let r = c0[0] + (c1[0] - c0[0]) * t;
  let g = c0[1] + (c1[1] - c0[1]) * t;
  let b = c0[2] + (c1[2] - c0[2]) * t;
  if (k >= 0 && h > 0) {
    const mix = (c: [number, number, number], a: number) => {
      r += (c[0] - r) * a;
      g += (c[1] - g) * a;
      b += (c[2] - b) * a;
    };
    const keep = clearFactor(x, z);
    const slope = slopeGrid[k];
    if (slope > 0.45 && h > 150) mix(CLIFF, smoothstep(0.45, 1.1, slope) * 0.5);
    const fl = (fieldGrid[k] / 255) * keep;
    if (fl > 0.02) mix(FIELD_COLORS[fieldKind[k]], fl * 0.72);
    const fo = (forestGrid[k] / 255) * keep;
    if (fo > 0.02) mix(h > 900 ? FOREST_HIGH : FOREST, Math.min(1, fo * 1.25) * 0.92);
    const ur = urbanGrid[k] / 255;
    if (ur > 0.02) mix(URBAN, ur * 0.8);
  }
  const j = h > 0 ? 1 + jitter : 1;
  out[0] = toLinear(Math.min(1, (r / 255) * j));
  out[1] = toLinear(Math.min(1, (g / 255) * j));
  out[2] = toLinear(Math.min(1, (b / 255) * j));
}

/** Parça (chunk) kenarı, ızgara hücresi cinsinden. */
const CH = 64;
const NC = TERRAIN_N / CH;
/** Ayrıntı düzeylerinin adımı (hücre). 0: tam, 1: yarım, 2: çeyrek çözünürlük. */
const STEPS = [1, 2, 4];
/** Düzeye geçilen kamera uzaklığı (m): tam çözünürlük uzağa kadar, geçişler sisli ufukta. */
const LOD_DIST = [0, 65000, 120000];
/** Düzey geçişinde gidip gelmeyi önleyen pay (oran). */
const LOD_HYSTERESIS = 0.12;
/** Bu uzaklığın ötesinde ince düzeyler bellekten atılır. */
const DROP_DIST = [150000, 240000];
/** Kare başına üretilecek en çok ağ (kaydırırken takılma olmasın). */
const BUILD_BUDGET = 6;
/** Farklı ayrıntı düzeyindeki komşu parçalar arasındaki çatlakları örten etek derinliği (m). */
const SKIRT = 90;

/** Köşe başına sabit renk titreşimi (her yükleniste aynı). */
function jitterAt(k: number): number {
  return ((((k * 2654435761) >>> 0) / 4294967296) - 0.5) * 0.04;
}

/** İnce ızgaranın köşe renkleri (doğrusal uzay, 8 bit). Parça parça, gerektiğinde doldurulur. */
const fineCol = new Uint8Array(TERRAIN_W * TERRAIN_W * 3);
/** Parçanın ince renkleri hazır mı (komşu payıyla). */
const fineReady = new Uint8Array(NC * NC);

function fillFine(i0: number, i1: number, j0: number, j1: number): void {
  const c = [0, 0, 0];
  for (let j = Math.max(0, j0); j <= Math.min(TERRAIN_N, j1); j++) {
    for (let i = Math.max(0, i0); i <= Math.min(TERRAIN_N, i1); i++) {
      const k = j * TERRAIN_W + i;
      colorAt(heights[k], jitterAt(k), c, k, -HALF + i * TERRAIN_CELL, -HALF + j * TERRAIN_CELL);
      fineCol[k * 3] = Math.round(c[0] * 255);
      fineCol[k * 3 + 1] = Math.round(c[1] * 255);
      fineCol[k * 3 + 2] = Math.round(c[2] * 255);
    }
  }
}

/** Parçanın (ve süzgeç payının) ince renklerini hazırla. */
function ensureFine(ci: number, cj: number): void {
  const n = cj * NC + ci;
  if (fineReady[n]) return;
  fineReady[n] = 1;
  fillFine(ci * CH - 4, (ci + 1) * CH + 4, cj * CH - 4, (cj + 1) * CH + 4);
}

const clampN = (v: number) => (v < 0 ? 0 : v > TERRAIN_N ? TERRAIN_N : v);

/**
 * Yarım düzey köşe rengi: kapsadığı ince köşelerin üçgen (çadır) ağırlıklı ortalaması.
 * Tek noktadan örneklemek tarla/orman lekelerini düzey değişiminde zıplatıyordu (kaydırırken titreme).
 */
function coarseColor(i: number, j: number, s: number, out: number[]): void {
  let r = 0;
  let g = 0;
  let b = 0;
  let ws = 0;
  for (let dj = 1 - s; dj < s; dj++) {
    const jj = clampN(j + dj);
    const wj = s - Math.abs(dj);
    for (let di = 1 - s; di < s; di++) {
      const k = (jj * TERRAIN_W + clampN(i + di)) * 3;
      const w = wj * (s - Math.abs(di));
      r += fineCol[k] * w;
      g += fineCol[k + 1] * w;
      b += fineCol[k + 2] * w;
      ws += w;
    }
  }
  out[0] = r / ws / 255;
  out[1] = g / ws / 255;
  out[2] = b / ws / 255;
}

const hAt = (i: number, j: number) => Math.max(heights[clampN(j) * TERRAIN_W + clampN(i)], 0);

interface Chunk {
  ci: number;
  cj: number;
  cx: number;
  cz: number;
  /** Düzey başına ağ (çeyrek düzey hep var; ince düzeyler gerektikçe). */
  meshes: (THREE.Mesh | null)[];
  /** Çizilen düzey. */
  level: number;
}

/**
 * Parçalı arazi: 32×32 parça. Çeyrek çözünürlük her parçada hep var; tam ve yarım çözünürlük kameraya yakın
 * parçalar için kare başına birkaç tane üretilir, uzaklaşınca bırakılır (300 km haritada bellek sınırlı kalsın).
 * Yakında simülasyonla aynı üçgenleme. Görüş dışındaki parçalar çizilmez.
 */
export class TerrainView {
  readonly group = new THREE.Group();
  /** Yakın düzey köşeli (low-poly); uzak düzeyler yumuşak gölgeli (düzey değişiminde yüzey parlaklığı zıplamasın). */
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  private readonly materialFar = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private chunks: Chunk[] = [];
  private mapVersion = -1;
  private editVersion = -1;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    // Harita dışı açık deniz: harita kadar delikli büyük düzlem
    const big = MAP_SIZE * 8;
    const shape = new THREE.Shape();
    shape.moveTo(-big, -big);
    shape.lineTo(big, -big);
    shape.lineTo(big, big);
    shape.lineTo(-big, big);
    shape.lineTo(-big, -big);
    const hole = new THREE.Path();
    hole.moveTo(-HALF, -HALF);
    hole.lineTo(-HALF, HALF);
    hole.lineTo(HALF, HALF);
    hole.lineTo(HALF, -HALF);
    hole.lineTo(-HALF, -HALF);
    shape.holes.push(hole);
    const outer = new THREE.Mesh(
      new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: PALETTE.seaOuter, side: THREE.DoubleSide }),
    );
    outer.position.y = 0;
    scene.add(outer);
    this.rebuild();
  }

  /** Yüklü harita değiştiyse bütün parçaları baştan kur (çeyrek düzey hemen, ince düzeyler gerektikçe). */
  private rebuild(): void {
    if (this.mapVersion === terrainMap.version) return;
    this.mapVersion = terrainMap.version;
    this.editVersion = terrainEdits.version;
    terrainEdits.dirty.length = 0;
    for (const c of this.chunks) for (const m of c.meshes) if (m) this.disposeMesh(m);
    this.chunks = [];
    fineReady.fill(0);
    for (let cj = 0; cj < NC; cj++) {
      for (let ci = 0; ci < NC; ci++) {
        const c: Chunk = {
          ci, cj, cx: -HALF + (ci + 0.5) * CH * TERRAIN_CELL, cz: -HALF + (cj + 0.5) * CH * TERRAIN_CELL, meshes: [null, null, null], level: 2,
        };
        c.meshes[2] = this.makeMesh(c, 2);
        this.chunks.push(c);
      }
    }
  }

  private makeMesh(c: Chunk, level: number): THREE.Mesh {
    if (level < 2) ensureFine(c.ci, c.cj);
    const m = new THREE.Mesh(this.chunkGeometry(c.ci, c.cj, level), level === 0 ? this.material : this.materialFar);
    m.position.set(c.cx, 0, c.cz);
    m.visible = false;
    this.group.add(m);
    return m;
  }

  private disposeMesh(m: THREE.Mesh): void {
    this.group.remove(m);
    m.geometry.dispose();
  }

  /** Her kare: harita/inşaat değişiklikleri, kameraya göre düzey seçimi ve ince düzeylerin üretimi. */
  update(camera: THREE.Camera): void {
    this.rebuild();
    this.sync();
    const p = camera.position;
    let budget = BUILD_BUDGET;
    // Yakındakiler önce üretilsin
    const order = this.chunks
      .map((c) => ({ c, d: Math.hypot(c.cx - p.x, p.y, c.cz - p.z) }))
      .sort((a, b) => a.d - b.d);
    for (const { c, d } of order) {
      // İstenen düzey (geçişte pay: mevcut düzeyde kalmaya eğilimli)
      let want = 0;
      for (let l = 1; l < 3; l++) {
        const th = LOD_DIST[l] * (c.level >= l ? 1 - LOD_HYSTERESIS : 1 + LOD_HYSTERESIS);
        if (d >= th) want = l;
      }
      // İnce düzey yoksa bütçe elverdikçe üret; yetmezse eldeki en iyi düzeyde kal
      let show = want;
      while (!c.meshes[show]) {
        if (budget > 0) {
          c.meshes[show] = this.makeMesh(c, show);
          budget--;
        } else show++;
      }
      if (show !== c.level || !c.meshes[c.level]?.visible) {
        for (let l = 0; l < 3; l++) if (c.meshes[l]) c.meshes[l]!.visible = l === show;
        c.level = show;
      }
      // Uzaktaki ince düzeyleri bırak
      for (let l = 0; l < 2; l++) {
        const m = c.meshes[l];
        if (m && l !== c.level && d > DROP_DIST[l]) {
          this.disposeMesh(m);
          c.meshes[l] = null;
        }
      }
    }
  }

  /** Bir parçanın verilen düzeydeki ağı (parça merkezine göre yerel), kenar etekleriyle. */
  private chunkGeometry(ci: number, cj: number, level: number): THREE.BufferGeometry {
    const step = STEPS[level];
    const n = CH / step;
    const w = n + 1;
    const cx = -HALF + (ci + 0.5) * CH * TERRAIN_CELL;
    const cz = -HALF + (cj + 0.5) * CH * TERRAIN_CELL;
    const ring = 4 * n;
    const pos = new Float32Array((w * w + ring) * 3);
    const col = new Float32Array((w * w + ring) * 3);
    const nrm = step > 1 ? new Float32Array((w * w + ring) * 3) : null;
    const c = [0, 0, 0];
    const vert = (a: number, b: number, o: number, drop: number) => {
      const i = ci * CH + a * step;
      const j = cj * CH + b * step;
      const k = j * TERRAIN_W + i;
      const h = heights[k];
      pos[o * 3] = -HALF + i * TERRAIN_CELL - cx;
      pos[o * 3 + 1] = Math.max(h, 0) - drop;
      pos[o * 3 + 2] = -HALF + j * TERRAIN_CELL - cz;
      if (step === 1) {
        c[0] = fineCol[k * 3] / 255;
        c[1] = fineCol[k * 3 + 1] / 255;
        c[2] = fineCol[k * 3 + 2] / 255;
      } else if (step === 2) coarseColor(i, j, step, c);
      // Çeyrek düzey yalnız ufukta (sisin içinde): doğrudan örnek yeter
      else colorAt(h, jitterAt(k), c, k, -HALF + i * TERRAIN_CELL, -HALF + j * TERRAIN_CELL);
      col[o * 3] = c[0];
      col[o * 3 + 1] = c[1];
      col[o * 3 + 2] = c[2];
      if (nrm) {
        // Düzgün normal: yükseklik ızgarasından merkezi fark (etek köşeleri üstteki köşeyle aynı)
        const nx = hAt(i - step, j) - hAt(i + step, j);
        const nz = hAt(i, j - step) - hAt(i, j + step);
        const ny = 2 * step * TERRAIN_CELL;
        const l = Math.hypot(nx, ny, nz);
        nrm[o * 3] = nx / l;
        nrm[o * 3 + 1] = ny / l;
        nrm[o * 3 + 2] = nz / l;
      }
    };
    for (let b = 0; b < w; b++) for (let a = 0; a < w; a++) vert(a, b, b * w + a, 0);
    const idx = new Uint16Array(n * n * 6 + ring * 6);
    let q = 0;
    for (let b = 0; b < n; b++) {
      for (let a = 0; a < n; a++) {
        const v00 = b * w + a;
        const v10 = v00 + 1;
        const v01 = v00 + w;
        const v11 = v01 + 1;
        idx[q++] = v00; idx[q++] = v11; idx[q++] = v10;
        idx[q++] = v00; idx[q++] = v01; idx[q++] = v11;
      }
    }
    // Etek: kenar halkası boyunca aşağı sarkan şerit (ayrıntı düzeyi farkından doğan yarıkları kapatır)
    const edge: number[] = [];
    for (let a = 0; a < n; a++) edge.push(a);
    for (let b = 0; b < n; b++) edge.push(b * w + n);
    for (let a = n; a > 0; a--) edge.push(n * w + a);
    for (let b = n; b > 0; b--) edge.push(b * w);
    const base = w * w;
    edge.forEach((v, e) => {
      const a = v % w;
      const b = Math.floor(v / w);
      vert(a, b, base + e, SKIRT);
    });
    for (let e = 0; e < ring; e++) {
      const v0 = edge[e];
      const v1 = edge[(e + 1) % ring];
      const s0 = base + e;
      const s1 = base + ((e + 1) % ring);
      idx[q++] = v0; idx[q++] = s0; idx[q++] = v1;
      idx[q++] = v1; idx[q++] = s0; idx[q++] = s1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  /** İnşaat düzleştirmelerini yansıt: etkilenen parçaların renkleri ve ağları yenilenir. */
  private sync(): void {
    if (this.editVersion === terrainEdits.version) return;
    this.editVersion = terrainEdits.version;
    for (const d of terrainEdits.dirty) {
      for (const c of this.chunks) {
        if (c.ci * CH > d.i1 + 4 || (c.ci + 1) * CH < d.i0 - 4 || c.cj * CH > d.j1 + 4 || (c.cj + 1) * CH < d.j0 - 4) continue;
        fineReady[c.cj * NC + c.ci] = 0;
        for (let l = 0; l < 3; l++) {
          const m = c.meshes[l];
          if (!m) continue;
          // Çizilen düzey ve çeyrek düzey hemen yenilenir; diğer ince düzey gerektiğinde yeniden üretilir
          if (l === c.level || l === 2) {
            if (l < 2) ensureFine(c.ci, c.cj);
            m.geometry.dispose();
            m.geometry = this.chunkGeometry(c.ci, c.cj, l);
          } else {
            this.disposeMesh(m);
            c.meshes[l] = null;
          }
        }
      }
    }
    terrainEdits.dirty.length = 0;
  }
}

/** Ekran ışınının araziyle kesişimi (kaba adım + ikiye bölme). */
export function rayTerrain(ray: THREE.Ray, out: THREE.Vector3, maxDist = 900000): boolean {
  const o = ray.origin;
  const d = ray.direction;
  let t = 0;
  let step = Math.max(20, Math.abs(o.y) * 0.01);
  let prevT = 0;
  let above = o.y - groundLevel(o.x, o.z) > 0;
  if (!above) return false;
  while (t < maxDist) {
    t += step;
    const x = o.x + d.x * t;
    const y = o.y + d.y * t;
    const z = o.z + d.z * t;
    if (y - groundLevel(x, z) <= 0) {
      let lo = prevT;
      let hi = t;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        const my = o.y + d.y * mid;
        if (my - groundLevel(o.x + d.x * mid, o.z + d.z * mid) > 0) lo = mid;
        else hi = mid;
      }
      out.set(o.x + d.x * hi, 0, o.z + d.z * hi);
      out.y = groundLevel(out.x, out.z);
      return true;
    }
    if (d.y > 0 && y > 20000) return false;
    prevT = t;
    step = Math.min(step * 1.08, 400);
    above = true;
  }
  return false;
}
