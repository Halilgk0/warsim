// Yollarda dolaşan sivil araçlar (yalnız görüntü; simülasyona dokunmaz). Her tarafın kasabasında yol uzunluğuna göre
// birkaç araç (en çok 6) yol ağında gezer: kavşakta rastgele bir kola döner, çıkmazda geri döner, yolun sağından gider.
// Oyun duraklayınca durur (simülasyon süresiyle ilerler). Araçlar vehicleParts.ts'ten; aynı tip ve renk tek geometriyi
// paylaşır. Kendi tohumlu rastgelesini kullanır (simülasyonun Math.random akışına dokunmaz).

import * as THREE from 'three';
import type { World } from '../sim/world';
import { roadGraph, type RoadGraph } from '../sim/roads';
import { groundLevel } from '../sim/terrain';
import { mulberry32 } from '../core/math';
import { ArchBatch, archMaterial } from './arch';
import { autoParts, type AutoKind } from './vehicleParts';

/** Bir araç başına düşen yol (m) ve taraf başına en çok araç. */
const ROAD_PER_CAR = 230;
const MAX_CARS = 6;
/** Bu kamera uzaklığından sonra trafik çizilmez ve ilerletilmez (m). */
const FAR = 9000;

const MODELS: [AutoKind, number][] = [
  ['sedan', 0x2e3032], ['sedan', 0x3a4252], ['sedan', 0x5e3a32], ['sedan', 0x4a5642], ['sedan', 0x8a8468], ['sedan', 0x6e7074],
  ['van', 0x7a6a4a], ['van', 0x3e4e62], ['pickup', 0x4f5638], ['pickup', 0x6a5a3a],
];

interface Car {
  team: number;
  mesh: THREE.Mesh;
  from: number;
  to: number;
  /** Kenarda kat edilen yol (m) ve kenarın boyu. */
  t: number;
  len: number;
  speed: number;
}

export class Traffic {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  private graphs = new Map<number, RoadGraph>();
  private key = '';
  private world: World | null = null;
  private readonly geos = new Map<number, THREE.BufferGeometry>();
  private material: THREE.Material | null = null;
  private rng = mulberry32(4711);

  private geometry(i: number): THREE.BufferGeometry {
    let g = this.geos.get(i);
    if (!g) {
      const b = new ArchBatch();
      autoParts(b, MODELS[i][0], MODELS[i][1], 0, 0, 0);
      g = b.build(new THREE.Group(), new THREE.MeshBasicMaterial())!.geometry;
      this.geos.set(i, g);
    }
    return g;
  }

  /** Yollar ya da ev sayısı değişince ağ ve araçlar yeniden kurulur. */
  private rebuild(w: World): void {
    for (const c of this.cars) this.group.remove(c.mesh);
    this.cars = [];
    this.graphs.clear();
    this.material ??= archMaterial();
    for (const t of w.teams) {
      const roads = w.roads.filter((r) => r.team === t.id);
      if (!roads.length || t.eliminated) continue;
      const homes = w.structures.filter((s) => s.team === t.id && s.active && (s.def.population ?? 0) > 0).length;
      if (!homes) continue;
      const g = roadGraph(w.roads, t.id);
      const starts = g.nodes.map((_, i) => i).filter((i) => g.adj[i].length > 0);
      if (!starts.length) continue;
      this.graphs.set(t.id, g);
      const total = roads.reduce((a, r) => a + Math.hypot(r.bx - r.ax, r.bz - r.az), 0);
      const n = Math.min(MAX_CARS, Math.max(1, Math.round(total / ROAD_PER_CAR)), homes);
      for (let i = 0; i < n; i++) {
        const from = starts[Math.floor(this.rng() * starts.length)];
        const [to, len] = g.adj[from][Math.floor(this.rng() * g.adj[from].length)];
        const mesh = new THREE.Mesh(this.geometry(Math.floor(this.rng() * MODELS.length)), this.material);
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.cars.push({ team: t.id, mesh, from, to, t: this.rng() * len, len, speed: 7 + this.rng() * 4 });
      }
    }
  }

  update(w: World, dt: number, camDist: number): void {
    const homes = w.structures.reduce((a, s) => a + (s.active && (s.def.population ?? 0) > 0 ? 1 : 0), 0);
    const key = `${w.roadVersion}:${w.roads.length}:${homes}`;
    if (w !== this.world || key !== this.key) {
      this.world = w;
      this.key = key;
      this.rebuild(w);
    }
    this.group.visible = camDist < FAR;
    if (!this.group.visible) return;
    for (const c of this.cars) {
      const g = this.graphs.get(c.team);
      if (!g) continue;
      // Kavşağa yaklaşırken ve çıkarken yavaşlar
      const edge = Math.min(c.t, c.len - c.t);
      c.t += c.speed * (edge < 9 ? 0.55 : 1) * dt;
      while (c.t >= c.len) {
        c.t -= c.len;
        const opts = g.adj[c.to].filter(([v]) => v !== c.from);
        const [next, len] = opts.length ? opts[Math.floor(this.rng() * opts.length)] : g.adj[c.to][0];
        c.from = c.to;
        c.to = next;
        c.len = len;
      }
      const a = g.nodes[c.from];
      const b = g.nodes[c.to];
      const f = c.len > 0 ? c.t / c.len : 0;
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      const x = a.x + (b.x - a.x) * f - Math.cos(heading) * 1.75;
      const z = a.z + (b.z - a.z) * f + Math.sin(heading) * 1.75;
      c.mesh.position.set(x, groundLevel(x, z) + 0.45, z);
      c.mesh.rotation.y = heading;
    }
  }
}
