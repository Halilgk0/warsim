// Harita süsü (yalnız görsel): ormanlarda 3B ağaçlar, dağlarda kayalar, şehirleri ve üsleri bağlayan yollar,
// yol boyunca köyler, tarlalarda çiftlikler ve dekor şehirleri (sokak ızgarası, evler, apartmanlar, parklar).
// Ağaç ve kayalar arazi parçası başına, kameraya yakınken üretilir; yollar ve yerleşimler açılışta bir kez.

import * as THREE from 'three';
import { CITIES, MAP_SIZE, TEAM_SITES } from '../sim/mapData';
import { TERRAIN_CELL, TERRAIN_N, groundLevel, terrainHeight, terrainMap } from '../sim/terrain';
import { clamp, mulberry32, smoothstep } from '../core/math';
import { cleared, clearingsVersion, fieldGrid, forestGrid, sampleGrid, sampleSmooth, slopeGrid } from './landcover';
import { BOX, CYL, GABLE, broadleafGeo, coniferGeo, rockGeo } from './props';

const HALF = MAP_SIZE / 2;
/** Parça kenarı (m) — arazi parçalarıyla aynı. */
const CHUNK = 64 * TERRAIN_CELL;
const NC = TERRAIN_N / 64;

const WALLS = [0xf3e9d9, 0xebdcc7, 0xe8d5cb, 0xdfe3d1, 0xf1e0cf, 0xe4dde8, 0xf0e4c6];
const ROOFS = [0xd39a85, 0xc98f7d, 0xb9a3a0, 0xd8b48f, 0xa9aeb9, 0xcf8f7f];
const TREES_B = [0x93c07f, 0x86b67b, 0x9ec88a, 0x7fae77, 0xa3c584];
const TREES_C = [0x79a983, 0x6f9e7c, 0x84b08a];
const ROCKS = [0xc9c3c8, 0xbcb6b9, 0xd3cdc4, 0xb3afb6];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

/** Büyüyebilen örnek listesi → InstancedMesh. */
class InstList {
  readonly mats: number[] = [];
  readonly cols: number[] = [];
  push(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, color: number): void {
    _p.set(x, y, z);
    _q.setFromAxisAngle(_up, yaw);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    this.mats.push(..._m.elements);
    _c.setHex(color);
    this.cols.push(_c.r, _c.g, _c.b);
  }
  get count(): number {
    return this.cols.length / 3;
  }
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh | null {
    const n = this.count;
    if (!n) return null;
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.array.set(this.mats);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cols), 3);
    m.computeBoundingSphere();
    return m;
  }
}

interface Chunk {
  group: THREE.Group | null;
  version: number;
  /** Ağaç ağları ve uzak görünümde gösterilecek (ilk geçiş) örnek sayıları. */
  trees: { mesh: THREE.InstancedMesh; far: number; all: number }[];
}

export class Scenery {
  readonly group = new THREE.Group();
  private readonly vegMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly bldMat = new THREE.MeshLambertMaterial({ flatShading: true });
  private readonly treeB = broadleafGeo(0xffffff);
  private readonly treeC = coniferGeo(0xffffff);
  private readonly rock = rockGeo(0xffffff);
  private readonly chunks: Chunk[] = [];
  private readonly chunkGroup = new THREE.Group();
  private roadNear: THREE.Mesh | null = null;
  private roadFar: THREE.LineSegments | null = null;
  private settle: THREE.Group = new THREE.Group();
  private roads: THREE.Vector3[][] = [];
  private settleVersion = 0;
  private settleDirtyAt = -1;
  /** Hangi harita için kuruldu. */
  private mapVersion = -1;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < NC * NC; i++) this.chunks.push({ group: null, version: -1, trees: [] });
    this.group.add(this.chunkGroup, this.settle);
    scene.add(this.group);
    this.rebuild();
  }

  /** Yollar, yerleşimler ve ağaç parçaları yüklü haritaya göre (harita değişince) yeniden kurulur. */
  rebuild(): void {
    if (this.mapVersion === terrainMap.version) return;
    this.mapVersion = terrainMap.version;
    for (const ch of this.chunks) {
      if (ch.group) {
        this.chunkGroup.remove(ch.group);
        disposeGroup(ch.group);
      }
      ch.group = null;
      ch.trees = [];
      ch.version = -1;
    }
    for (const m of [this.roadNear, this.roadFar]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.clearSettlements();
    const roads = buildRoads();
    this.roads = roads;
    this.roadNear = roadRibbon(roads);
    this.roadFar = roadLines(roads);
    this.group.add(this.roadNear, this.roadFar);
    this.buildSettlements(roads);
    this.settleVersion = clearingsVersion();
  }

  private clearSettlements(): void {
    for (const c of [...this.settle.children]) {
      this.settle.remove(c);
      if (c instanceof THREE.InstancedMesh) c.dispose();
      else if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
  }

  /** Yeni yapı tabanları: üstünde kalan dekor evleri ve ağaçları kaldırmak için yerleşimleri yeniden kur. */
  private refreshSettlements(): void {
    const ver = clearingsVersion();
    if (ver === this.settleVersion) return;
    const now = performance.now();
    if (this.settleDirtyAt < 0) this.settleDirtyAt = now;
    if (now - this.settleDirtyAt < 600) return;
    this.settleDirtyAt = -1;
    this.settleVersion = ver;
    this.clearSettlements();
    this.buildSettlements(this.roads);
  }

  /** Kameraya göre ağaç/kaya parçalarını üret, göster, gizle. */
  update(target: THREE.Vector3, camDist: number, enabled: boolean): void {
    this.group.visible = enabled;
    if (!enabled) return;
    this.refreshSettlements();
    // Uzakta ağaçlar piksel altına düşer ve kaydırırken kıvılcım gibi titrer: yalnız yakın/orta görünümde
    const show = camDist < 9000;
    const radius = Math.max(4500, camDist * 1.35);
    const nearR = Math.max(2200, camDist * 0.6);
    let budget = 1;
    const ver = clearingsVersion();
    for (let cj = 0; cj < NC; cj++) {
      for (let ci = 0; ci < NC; ci++) {
        const ch = this.chunks[cj * NC + ci];
        const cx = -HALF + (ci + 0.5) * CHUNK;
        const cz = -HALF + (cj + 0.5) * CHUNK;
        const d = Math.max(0, Math.hypot(cx - target.x, cz - target.z) - CHUNK * 0.71);
        const want = show && d < radius;
        if (want && (!ch.group || ch.version !== ver) && budget > 0) {
          budget--;
          if (ch.group) {
            this.chunkGroup.remove(ch.group);
            disposeGroup(ch.group);
          }
          ch.group = this.buildChunk(ci, cj, ch);
          ch.version = ver;
          this.chunkGroup.add(ch.group);
        }
        if (ch.group) {
          ch.group.visible = want;
          // Yakın parçada bütün ağaçlar, uzakta yalnız seyrek ilk geçiş
          const full = d < nearR;
          for (const t of ch.trees) t.mesh.count = full ? t.all : t.far;
          // Çok uzaktaki parçaları bellekten at
          if (!want && d > radius + CHUNK * 3) {
            this.chunkGroup.remove(ch.group);
            disposeGroup(ch.group);
            ch.group = null;
            ch.trees = [];
          }
        }
      }
    }
    // Yol şeridi yalnız arazinin tam çözünürlükte olduğu yakın görünümde (uzakta kaba arazinin altında kalıp yanıp sönüyordu)
    if (this.roadNear) this.roadNear.visible = camDist < 11000;
    if (this.roadFar) this.roadFar.visible = camDist >= 9000;
    // Yerleşimler: uzakta piksel altı (şehirler arazide renk olarak görünür); ayrıntılar yalnız yakında
    this.settle.visible = camDist < 20000;
    this.settle.children.forEach((c) => {
      if (c.userData.near) c.visible = camDist < 9000;
    });
  }

  private buildChunk(ci: number, cj: number, ch: Chunk): THREE.Group {
    const rng = mulberry32(ci * 7919 + cj * 104729 + 17);
    const g = new THREE.Group();
    const tb = new InstList();
    const tc = new InstList();
    const rk = new InstList();
    const x0 = -HALF + ci * CHUNK;
    const z0 = -HALF + cj * CHUNK;
    // 4 geçiş: her geçiş 84 m ızgara, kaydırmalı → ilk geçiş tek başına düzgün seyrek bir orman
    const step = 84;
    const far = { b: 0, c: 0 };
    for (let pass = 0; pass < 4; pass++) {
      const ox = (pass & 1) * step * 0.5;
      const oz = (pass >> 1) * step * 0.5;
      for (let z = z0 + oz; z < z0 + CHUNK; z += step) {
        for (let x = x0 + ox; x < x0 + CHUNK; x += step) {
          const px = x + (rng() - 0.5) * step * 0.5;
          const pz = z + (rng() - 0.5) * step * 0.5;
          const r = rng();
          const forest = sampleSmooth(forestGrid, px, pz);
          // Ormanda sık; açık arazide tek tük (tarlada çok seyrek)
          const p = forest > 0.06 ? Math.min(1, forest * 1.15) : sampleGrid(fieldGrid, px, pz) > 0.3 ? 0.003 : 0.012;
          if (r > p) continue;
          const h = terrainHeight(px, pz);
          if (h < 6 || cleared(px, pz, 60)) continue;
          const conifer = rng() < 0.1 + 0.8 * smoothstep(500, 1250, h);
          const size = (conifer ? 17 : 15) + rng() * 10;
          const y = groundLevel(px, pz) - 0.8;
          if (conifer) tc.push(px, y, pz, size * 0.75, size, size * 0.75, rng() * 6.28, TREES_C[Math.floor(rng() * TREES_C.length)]);
          else tb.push(px, y, pz, size * 1.1, size * (0.85 + rng() * 0.3), size * 1.1, rng() * 6.28, TREES_B[Math.floor(rng() * TREES_B.length)]);
        }
      }
      if (pass === 0) {
        far.b = tb.count;
        far.c = tc.count;
      }
    }
    // Kayalar: dik yamaç ve yüksek dağ
    const rstep = 150;
    for (let z = z0; z < z0 + CHUNK; z += rstep) {
      for (let x = x0; x < x0 + CHUNK; x += rstep) {
        const px = x + rng() * rstep;
        const pz = z + rng() * rstep;
        const slope = sampleGrid(slopeGrid, px, pz);
        const h = terrainHeight(px, pz);
        if (h < 30) continue;
        const p = smoothstep(0.32, 0.9, slope) * 0.55 + (h > 1500 ? 0.12 : 0) + (h > 250 ? 0.012 : 0);
        if (rng() > p || cleared(px, pz, 40)) continue;
        // Küme: 1-4 kaya
        const n = 1 + Math.floor(rng() * 3.5);
        for (let i = 0; i < n; i++) {
          const qx = px + (rng() - 0.5) * 50;
          const qz = pz + (rng() - 0.5) * 50;
          const sc = (h > 1400 ? 10 : 5) + rng() * (h > 1400 ? 22 : 12);
          rk.push(qx, groundLevel(qx, qz) - sc * 0.22, qz, sc * (0.8 + rng() * 0.5), sc * (0.6 + rng() * 0.5), sc, rng() * 6.28, ROCKS[Math.floor(rng() * ROCKS.length)]);
        }
      }
    }
    ch.trees = [];
    const mb = tb.mesh(this.treeB, this.vegMat);
    const mc = tc.mesh(this.treeC, this.vegMat);
    if (mb) ch.trees.push({ mesh: mb, far: far.b, all: tb.count });
    if (mc) ch.trees.push({ mesh: mc, far: far.c, all: tc.count });
    for (const m of [mb, mc, rk.mesh(this.rock, this.vegMat)]) if (m) g.add(m);
    return g;
  }

  // ------------------------------------------------------------------ yerleşimler

  private buildSettlements(roads: THREE.Vector3[][]): void {
    const walls = new InstList();
    const roofs = new InstList();
    const caps = new InstList();
    const bands = new InstList();
    const silos = new InstList();
    const trees = new InstList();
    const streets: THREE.Vector3[][] = [];
    const rng = mulberry32(4242);
    const house = (x: number, z: number, yaw: number, s = 1) => {
      const w = (8 + rng() * 4) * s;
      const d = (9 + rng() * 4) * s;
      const h = rng() < 0.35 ? 6.4 : 3.8;
      const y = groundLevel(x, z) - 0.6;
      walls.push(x, y, z, w, h + 0.6, d, yaw, WALLS[Math.floor(rng() * WALLS.length)]);
      roofs.push(x, y + h + 0.6, z, w + 1, 2.6 + rng() * 1.2, d + 1, yaw + (rng() < 0.5 ? 0 : Math.PI / 2), ROOFS[Math.floor(rng() * ROOFS.length)]);
    };
    const tower = (x: number, z: number, yaw: number, floors: number, w: number, d: number) => {
      const H = floors * 3.2;
      const y = groundLevel(x, z) - 0.6;
      const wall = WALLS[Math.floor(rng() * WALLS.length)];
      walls.push(x, y, z, w, H + 0.6, d, yaw, wall);
      caps.push(x, y + H + 0.6, z, w + 0.6, 0.7, d + 0.6, yaw, 0xb3b0b9);
      for (let f = 0; f < floors; f++) bands.push(x, y + 0.6 + f * 3.2 + 1.0, z, w + 0.3, 1.3, d - 2, yaw, 0x93abc2);
    };
    const tree = (x: number, z: number, s = 1) => {
      const size = (9 + rng() * 6) * s;
      trees.push(x, groundLevel(x, z) - 0.4, z, size, size, size, rng() * 6.28, TREES_B[Math.floor(rng() * TREES_B.length)]);
    };

    // Dekor şehirleri: sokak ızgarası, merkezde apartman/ofis, çevrede evler, parklar
    for (const c of CITIES) {
      const yaw = rng() * Math.PI;
      const fx = Math.cos(yaw);
      const fz = Math.sin(yaw);
      const B = 130;
      const n = Math.ceil(c.r / B);
      for (let a = -n; a <= n; a++) {
        // Ana caddeler
        if (a % 2 === 0) {
          for (const dir of [0, 1]) {
            const pts: THREE.Vector3[] = [];
            const L = Math.sqrt(Math.max(0, c.r * c.r - (a * B) ** 2)) * 0.95;
            for (let t = -L; t <= L; t += 90) {
              const u = dir ? a * B : t;
              const v = dir ? t : a * B;
              const x = c.x + fx * u - fz * v;
              const z = c.z + fz * u + fx * v;
              pts.push(new THREE.Vector3(x, 0, z));
            }
            if (pts.length > 1) streets.push(pts);
          }
        }
        for (let b = -n; b <= n; b++) {
          const u0 = (a + 0.5) * B;
          const v0 = (b + 0.5) * B;
          const dist = Math.hypot(u0, v0);
          if (dist > c.r * (0.85 + rng() * 0.25)) continue;
          const cx = c.x + fx * u0 - fz * v0;
          const cz = c.z + fz * u0 + fx * v0;
          if (terrainHeight(cx, cz) < 5 || cleared(cx, cz, 80)) continue;
          const central = 1 - dist / c.r;
          const r = rng();
          if (r < 0.07) {
            for (let i = 0; i < 6; i++) tree(cx + (rng() - 0.5) * 90, cz + (rng() - 0.5) * 90);
            continue;
          }
          if (central > 0.5 && r < 0.85) {
            // Merkez: 2-4 blok, kat sayısı merkeze doğru artar
            const k = 2 + Math.floor(rng() * 3);
            for (let i = 0; i < k; i++) {
              const ox = (rng() - 0.5) * 70;
              const oz = (rng() - 0.5) * 70;
              const floors = Math.round(4 + central * 8 + rng() * 4);
              tower(cx + fx * ox - fz * oz, cz + fz * ox + fx * oz, -yaw, floors, 14 + rng() * 12, 16 + rng() * 20);
            }
          } else {
            const k = 3 + Math.floor(rng() * 5);
            for (let i = 0; i < k; i++) {
              const ox = (rng() - 0.5) * 95;
              const oz = (rng() - 0.5) * 95;
              house(cx + fx * ox - fz * oz, cz + fz * ox + fx * oz, -yaw);
              if (rng() < 0.45) tree(cx + fx * ox - fz * oz + 8, cz + fz * ox + fx * oz + 6, 0.8);
            }
          }
        }
      }
    }

    // Köyler: yol boyunca aralıklı, şehirlerden ve üslerden uzak
    const sites = TEAM_SITES.map((t) => t.site);
    for (const road of roads) {
      let acc = 4000 + rng() * 4000;
      for (let i = 1; i < road.length; i++) {
        acc -= road[i].distanceTo(road[i - 1]);
        if (acc > 0) continue;
        acc = 6500 + rng() * 6000;
        const p = road[i];
        const q = road[i - 1];
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        const l = Math.hypot(dx, dz) || 1;
        const h = terrainHeight(p.x, p.z);
        if (h < 15 || h > 1300) continue;
        if (CITIES.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r * 2.4)) continue;
        if (sites.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 5000)) continue;
        const side = rng() < 0.5 ? -1 : 1;
        const cx = p.x - (dz / l) * side * 160;
        const cz = p.z + (dx / l) * side * 160;
        const yaw = Math.atan2(dx, dz);
        const n = 6 + Math.floor(rng() * 10);
        for (let k = 0; k < n; k++) {
          const a = rng() * Math.PI * 2;
          const r = 30 + rng() * 170;
          const x = cx + Math.cos(a) * r;
          const z = cz + Math.sin(a) * r;
          if (sampleGrid(slopeGrid, x, z) > 0.3 || terrainHeight(x, z) < 4 || cleared(x, z, 40)) continue;
          house(x, z, yaw + (rng() < 0.3 ? Math.PI / 2 : 0));
          if (rng() < 0.6) tree(x + 10, z - 8);
        }
        // Köy camisi / kilisesi yerine nötr bir kule: yüksek tek yapı
        const y = groundLevel(cx, cz) - 0.5;
        walls.push(cx, y, cz, 7, 18, 7, yaw, 0xf2ece2);
        roofs.push(cx, y + 18, cz, 7.6, 6, 7.6, yaw, 0xb9a3a0);
      }
    }

    // Çiftlikler: tarla bölgelerinde ahır + silo + birkaç ağaç
    // Çiftlik denemeleri harita alanıyla orantılı
    const farmTries = Math.round(1800 * (MAP_SIZE / 150000) ** 2);
    for (let i = 0; i < farmTries; i++) {
      const x = (rng() - 0.5) * MAP_SIZE * 0.9;
      const z = (rng() - 0.5) * MAP_SIZE * 0.9;
      if (sampleGrid(fieldGrid, x, z) < 0.45 || rng() > 0.18) continue;
      if (CITIES.some((c) => Math.hypot(c.x - x, c.z - z) < c.r * 1.3) || cleared(x, z, 300)) continue;
      const yaw = rng() * Math.PI;
      const y = groundLevel(x, z) - 0.5;
      walls.push(x, y, z, 14, 7.5, 26, yaw, 0xe6c9b5);
      roofs.push(x, y + 7.5, z, 15, 5, 27, yaw, 0xc98f7d);
      house(x + 28 * Math.cos(yaw), z - 28 * Math.sin(yaw), yaw);
      silos.push(x - 14 * Math.cos(yaw) + 10 * Math.sin(yaw), y, z + 14 * Math.sin(yaw) + 10 * Math.cos(yaw), 3.4, 15, 3.4, 0, 0xd8d4dc);
      for (let k = 0; k < 4; k++) tree(x + (rng() - 0.5) * 70, z + (rng() - 0.5) * 70);
    }

    const near = (m: THREE.Object3D | null) => {
      if (m) m.userData.near = true;
      return m;
    };
    for (const m of [
      walls.mesh(BOX, this.bldMat), roofs.mesh(GABLE, this.bldMat), caps.mesh(BOX, this.bldMat),
      near(bands.mesh(BOX, this.bldMat)), near(silos.mesh(CYL, this.bldMat)), trees.mesh(this.treeB, this.vegMat),
    ]) if (m) this.settle.add(m);
    // Şehir sokakları (yakın görünümde şerit)
    const st = roadRibbon(streets, 9, 0xe3dccf);
    st.userData.near = true;
    this.settle.add(st);
  }
}

function disposeGroup(g: THREE.Group): void {
  for (const c of g.children) if (c instanceof THREE.InstancedMesh) c.dispose();
}

// ---------------------------------------------------------------------- yollar

/** Kaba ızgarada A*: dik yamaç, yükseklik ve su pahalı; yollar geçitlerden kıvrılarak geçer. */
function buildRoads(): THREE.Vector3[][] {
  const G = 900;
  const N = Math.floor(MAP_SIZE / G);
  const hgt = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hgt[j * N + i] = terrainHeight(-HALF + (i + 0.5) * G, -HALF + (j + 0.5) * G);
  const idx = (x: number, z: number) => {
    const i = clamp(Math.floor((x + HALF) / G), 0, N - 1);
    const j = clamp(Math.floor((z + HALF) / G), 0, N - 1);
    return j * N + i;
  };
  // trim: yol bu yarıçapta biter (üs pistine, fabrika avlusuna girmesin)
  const nodes = [
    ...CITIES.map((c) => ({ x: c.x, z: c.z, trim: 0 })),
    ...TEAM_SITES.map((t) => ({ x: t.site.x, z: t.site.z, trim: 1650 })),
  ];
  // Her düğümü en yakın iki komşusuna bağla
  const pairs = new Set<string>();
  nodes.forEach((a, ia) => {
    const near = nodes.map((b, ib) => ({ ib, d: Math.hypot(a.x - b.x, a.z - b.z) })).filter((e) => e.ib !== ia).sort((p, q) => p.d - q.d);
    for (const e of near.slice(0, ia < CITIES.length ? 3 : 2)) {
      if (e.d > 90000) continue;
      pairs.add(ia < e.ib ? `${ia}:${e.ib}` : `${e.ib}:${ia}`);
    }
  });
  const used = new Float32Array(N * N);
  // Üslerin içinden geçmek pahalı (yollar pistin üstünden geçmesin)
  const avoid = new Float32Array(N * N).fill(1);
  for (const n of nodes) {
    if (!n.trim || n.trim < 1000) continue;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(-HALF + (i + 0.5) * G - n.x, -HALF + (j + 0.5) * G - n.z);
        if (d < 2000) avoid[j * N + i] = 10;
      }
    }
  }
  const out: THREE.Vector3[][] = [];
  for (const key of pairs) {
    const [ia, ib] = key.split(':').map(Number);
    const path = astar(hgt, N, G, idx(nodes[ia].x, nodes[ia].z), idx(nodes[ib].x, nodes[ib].z), used, avoid);
    if (!path) continue;
    // Denizi uzun geçen yol yok (adalar arası köprü kurulmaz)
    let wet = 0;
    for (const k of path) if (hgt[k] < 1) wet++;
    if (wet > 3 && wet / path.length > 0.06) continue;
    for (const k of path) used[k] = 1;
    let pts = path.map((k) => new THREE.Vector3(-HALF + ((k % N) + 0.5) * G, 0, -HALF + (Math.floor(k / N) + 0.5) * G));
    pts[0].set(nodes[ia].x, 0, nodes[ia].z);
    pts[pts.length - 1].set(nodes[ib].x, 0, nodes[ib].z);
    for (let it = 0; it < 3; it++) pts = chaikin(pts);
    const a = nodes[ia];
    const b = nodes[ib];
    const road = resample(pts, 110).filter((p) => Math.hypot(p.x - a.x, p.z - a.z) >= a.trim && Math.hypot(p.x - b.x, p.z - b.z) >= b.trim);
    if (road.length > 1) out.push(road);
  }
  return out;
}

function astar(hgt: Float32Array, N: number, G: number, start: number, goal: number, used: Float32Array, avoid: Float32Array): number[] | null {
  const cost = new Float32Array(N * N).fill(Infinity);
  const from = new Int32Array(N * N).fill(-1);
  const heap: [number, number][] = [];
  const push = (k: number, f: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const gx = goal % N;
  const gz = Math.floor(goal / N);
  cost[start] = 0;
  push(start, 0);
  while (heap.length) {
    const [, k] = pop();
    if (k === goal) break;
    const x = k % N;
    const z = Math.floor(k / N);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 3 || nz < 3 || nx >= N - 3 || nz >= N - 3) continue;
        const nk = nz * N + nx;
        const h0 = hgt[k];
        const h1 = hgt[nk];
        const len = Math.hypot(dx, dz) * G;
        const grade = Math.abs(h1 - h0) / len;
        let c = len * (1 + grade * grade * 900 + Math.max(0, h1 - 600) / 500);
        if (h1 < 2) c *= 6;
        c *= avoid[nk];
        // Var olan yolu paylaşmak ucuz (ağ birleşsin)
        if (used[nk]) c *= 0.55;
        const nc = cost[k] + c;
        if (nc < cost[nk]) {
          cost[nk] = nc;
          from[nk] = k;
          push(nk, nc + Math.hypot(nx - gx, nz - gz) * G);
        }
      }
    }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const path: number[] = [];
  for (let k = goal; k >= 0; k = from[k]) {
    path.push(k);
    if (k === start) break;
  }
  return path.reverse();
}

function chaikin(pts: THREE.Vector3[]): THREE.Vector3[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function resample(pts: THREE.Vector3[], step: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [pts[0].clone()];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = a.distanceTo(b);
    let t = step - carry;
    while (t < L) {
      out.push(a.clone().lerp(b, t / L));
      t += step;
    }
    carry = L - (t - step);
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

/** Araziye oturan yol şeridi (köprüler deniz/nehir üstünde düz geçer). */
function roadRibbon(roads: THREE.Vector3[][], width = 11, color = 0xe9e0cd): THREE.Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of roads) {
    if (r.length < 2) continue;
    const base = pos.length / 3;
    for (let i = 0; i < r.length; i++) {
      const a = r[Math.max(0, i - 1)];
      const b = r[Math.min(r.length - 1, i + 1)];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const nx = -dz * width * 0.5;
      const nz = dx * width * 0.5;
      for (const s of [-1, 1]) {
        const x = r[i].x + nx * s;
        const z = r[i].z + nz * s;
        const h = terrainHeight(x, z);
        pos.push(x, h < 1 ? 4 : groundLevel(x, z) + 1.6, z);
      }
    }
    for (let i = 0; i < r.length - 1; i++) {
      const v = base + i * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

/** Uzak görünümde ince çizgi yollar (harita görünümü). */
function roadLines(roads: THREE.Vector3[][]): THREE.LineSegments {
  const pos: number[] = [];
  for (const r of roads) {
    for (let i = 0; i < r.length - 1; i += 2) {
      const a = r[i];
      const b = r[Math.min(i + 2, r.length - 1)];
      pos.push(a.x, groundLevel(a.x, a.z) + 30, a.z, b.x, groundLevel(b.x, b.z) + 30, b.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Harita çizgisi: derinlik sınaması yok (kaba arazi düzeyinin altında kalıp kesik kesik görünmesin)
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xcdbfa6, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
  l.renderOrder = 1;
  return l;
}
