// Şehir yolları (2026-11-12): belediye binasından çıkan ana cadde ve oyuncunun (ya da botun) eklediği sokaklar.
// Yol düz bir parçadır (iki uç); her yeni parça mevcut bir yoldan başlar, böylece ağ hep belediyeye bağlıdır. Evler
// yolun iki yanındaki arsalara kurulur: arsa çizgisi yol ekseninden LOT_LINE uzakta, ev ön cephesiyle yola bakar.
// Yol araziyi düzleştirmez, eğimi izler (çizim render/roads.ts). Yıkılmaz, bombalanmaz.
//
// Bu dosya saf geometri: dünya kuralları (para, bölge, yapılarla çakışma) world.ts'te.

/** Yerleşim ızgarası (m): inşa ederken yapı bu aralıklarla gezer; yol boyunca arsalar da bu adımla kayar. */
export const GRID = 5;
/** Asfaltın yarı genişliği ve kaldırım dahil yarı genişlik (m). */
export const ROAD_HALF = 3.5;
export const ROAD_VERGE = 5;
/** Arsa çizgisi: yol ekseninden bu kadar uzakta başlar (2 × LOT_LINE ızgaranın katı: iki yan da ızgaraya oturur). */
export const LOT_LINE = 7.5;
/** Evin yola en çok bu kadar uzak durabileceği pay (serbest yerleşimde). */
export const ROAD_REACH = 10;
/** Tek parçanın en kısa ve en uzun boyu (m). */
export const ROAD_MIN = 20;
export const ROAD_MAX = 600;
/** Belediye binasının önünden çıkan ana caddenin boyu (m). */
export const TOWN_ROAD = 200;
/** En dik yol eğimi (yükseklik / yatay). */
export const ROAD_SLOPE = 0.3;

export interface Road {
  id: number;
  team: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface RoadHit {
  road: Road;
  /** Yol üstündeki en yakın nokta ve a ucundan uzaklığı. */
  x: number;
  z: number;
  s: number;
  /** Noktanın yol eksenine uzaklığı ve hangi yanda olduğu (+1: sol normal yönü). */
  dist: number;
  side: 1 | -1;
  /** Yolun birim yönü (a → b) ve boyu. */
  dx: number;
  dz: number;
  len: number;
}

export function roadLength(r: Road): number {
  return Math.hypot(r.bx - r.ax, r.bz - r.az);
}

/** Noktanın bir yola göre konumu (en yakın nokta parçanın içinde kalır). */
export function projectOnRoad(r: Road, x: number, z: number): RoadHit {
  const len = roadLength(r) || 1;
  const dx = (r.bx - r.ax) / len;
  const dz = (r.bz - r.az) / len;
  const px = x - r.ax;
  const pz = z - r.az;
  const s = Math.min(len, Math.max(0, px * dx + pz * dz));
  const cx = r.ax + dx * s;
  const cz = r.az + dz * s;
  // Sol normal (−dz, dx)
  const lat = px * -dz + pz * dx;
  return { road: r, x: cx, z: cz, s, dist: Math.hypot(x - cx, z - cz), side: lat >= 0 ? 1 : -1, dx, dz, len };
}

/** Verilen tarafın (team < 0: herkesin) noktaya en yakın yolu; maxDist dışındaysa null. */
export function nearestRoad(roads: readonly Road[], team: number, x: number, z: number, maxDist: number): RoadHit | null {
  let best: RoadHit | null = null;
  for (const r of roads) {
    if (team >= 0 && r.team !== team) continue;
    // Kaba eleme: parçanın sınır kutusu
    if (x < Math.min(r.ax, r.bx) - maxDist || x > Math.max(r.ax, r.bx) + maxDist || z < Math.min(r.az, r.bz) - maxDist || z > Math.max(r.az, r.bz) + maxDist) continue;
    const h = projectOnRoad(r, x, z);
    if (h.dist <= maxDist && (!best || h.dist < best.dist)) best = h;
  }
  return best;
}

/**
 * Parça, yönlü bir dikdörtgene (merkez, yarı en/boy, yön; pad kadar genişletilmiş) giriyor mu. Yapı tabanı ile yol
 * çakışması için. Dikdörtgenin boyu (halfL) yön doğrultusunda.
 */
export function roadHitsRect(r: Road, cx: number, cz: number, halfW: number, halfL: number, headingRad: number, pad: number): boolean {
  const fx = Math.sin(headingRad);
  const fz = -Math.cos(headingRad);
  // Yerel eksenler: u ileri (boy), v yana (en)
  const ua = (r.ax - cx) * fx + (r.az - cz) * fz;
  const va = (r.ax - cx) * -fz + (r.az - cz) * fx;
  const ub = (r.bx - cx) * fx + (r.bz - cz) * fz;
  const vb = (r.bx - cx) * -fz + (r.bz - cz) * fx;
  const L = halfL + pad;
  const W = halfW + pad;
  // Parça–kutu kesişimi (Liang–Barsky)
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  const du = ub - ua;
  const dv = vb - va;
  return clip(-du, ua + L) && clip(du, L - ua) && clip(-dv, va + W) && clip(dv, W - va);
}

/** Yolun yanındaki arsa: yapının merkezi ve yola bakan yönü. s: a ucundan uzaklık; side: hangi yan; depth: yarı derinlik. */
export function lotAt(h: Pick<RoadHit, 'road' | 'dx' | 'dz'>, s: number, side: 1 | -1, depth: number): { x: number; z: number; heading: number } {
  const off = (LOT_LINE + depth) * side;
  const x = h.road.ax + h.dx * s + -h.dz * off;
  const z = h.road.az + h.dz * s + h.dx * off;
  // Ön cephe yola bakar: ileri yön −normal·side. Yön açısı: ileri = (sin h, −cos h)
  const fx = h.dz * side;
  const fz = -h.dx * side;
  return { x, z, heading: Math.atan2(fx, -fz) };
}

export interface RoadPoint {
  x: number;
  z: number;
}

export interface RoadGraph {
  nodes: RoadPoint[];
  /** Düğüm başına komşular: [komşu düğüm, uzaklık]. */
  adj: [number, number][][];
}

/**
 * Bir tarafın yol ağı: düğümler yol uçları, bir yolun başka yola değdiği yerler ve ortadan kesişimler; kenarlar aynı yol
 * üstündeki ardışık düğümler. extra: ağa eklenecek yol üstü noktalar (güzergâhın başı ve sonu); düğüm numaraları
 * extraNodes'ta döner.
 */
export function roadGraph(roads: readonly Road[], team: number, extra: RoadHit[] = []): RoadGraph & { extraNodes: number[] } {
  const own = roads.filter((r) => r.team === team);
  const nodes: RoadPoint[] = [];
  const adj: [number, number][][] = [];
  const node = (x: number, z: number): number => {
    for (let i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].x - x) < 1.5 && Math.abs(nodes[i].z - z) < 1.5) return i;
    nodes.push({ x, z });
    adj.push([]);
    return nodes.length - 1;
  };
  const extraNodes = extra.map((h) => node(h.x, h.z));
  for (const r of own) {
    const len = roadLength(r) || 1;
    const dx = (r.bx - r.ax) / len;
    const dz = (r.bz - r.az) / len;
    const on: [number, number][] = [[0, node(r.ax, r.az)], [len, node(r.bx, r.bz)]];
    for (const o of own) {
      if (o === r) continue;
      for (const [x, z] of [[o.ax, o.az], [o.bx, o.bz]]) {
        const h = projectOnRoad(r, x, z);
        if (h.dist < 1.5) on.push([h.s, node(h.x, h.z)]);
      }
      // Ortadan kesişen iki yol
      const ol = roadLength(o) || 1;
      const ox = (o.bx - o.ax) / ol;
      const oz = (o.bz - o.az) / ol;
      const den = dx * oz - dz * ox;
      if (Math.abs(den) > 1e-6) {
        const t = ((o.ax - r.ax) * oz - (o.az - r.az) * ox) / den;
        const u = ((o.ax - r.ax) * dz - (o.az - r.az) * dx) / den;
        if (t > 0 && t < len && u > 0 && u < ol) on.push([t, node(r.ax + dx * t, r.az + dz * t)]);
      }
    }
    extra.forEach((h, i) => {
      if (h.road === r) on.push([h.s, extraNodes[i]]);
    });
    on.sort((p, q) => p[0] - q[0]);
    for (let i = 1; i < on.length; i++) {
      const [s0, n0] = on[i - 1];
      const [s1, n1] = on[i];
      if (n0 === n1 || adj[n0].some(([v]) => v === n1)) continue;
      adj[n0].push([n1, s1 - s0]);
      adj[n1].push([n0, s1 - s0]);
    }
  }
  return { nodes, adj, extraNodes };
}

/**
 * İki nokta arasında yollardan giden güzergâh (itfaiye araçları): her iki nokta en yakın kendi yoluna iner, aradaki yol
 * ağında en kısa yol bulunur. Dönen noktalar yol üstündedir (binanın önü): ilk nokta başlangıcın, son nokta hedefin
 * yola indiği yer. Yol yoksa ya da ağ kopuksa iki nokta arasında düz çizgi.
 */
export function roadPath(roads: readonly Road[], team: number, ax: number, az: number, bx: number, bz: number): RoadPoint[] {
  const own = roads.filter((r) => r.team === team);
  const A = nearestRoad(own, -1, ax, az, 400);
  const B = nearestRoad(own, -1, bx, bz, 400);
  if (!A || !B) return [{ x: ax, z: az }, { x: bx, z: bz }];
  const { nodes, adj, extraNodes } = roadGraph(own, team, [A, B]);
  const [start, end] = extraNodes;
  // En kısa yol (düğüm sayısı az: basit Dijkstra)
  const dist = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  dist[start] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === end) break;
    done[u] = true;
    for (const [v, w] of adj[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
  }
  if (dist[end] === Infinity) return [nodes[start], nodes[end]];
  const out: RoadPoint[] = [];
  for (let n = end; n >= 0; n = prev[n]) out.push(nodes[n]);
  return out.reverse();
}

/**
 * Birbirine bağlı yol kümeleri (yol kimliği → küme numarası): bir yolun ucu ötekinin üstüne değiyorsa ya da ikisi ortadan
 * kesişiyorsa aynı kümededir. Her belediye kendi kümesini başlatır; ikinci bir belediyenin sokakları birinciye bir yolla
 * bağlanana kadar ayrı küme kalır (itfaiye yalnız kendi kümesindeki yapılara yoldan gidebilir).
 */
export function roadComponents(roads: readonly Road[]): Map<number, number> {
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let x = a;
    while (parent.get(x) !== r) {
      const n = parent.get(x)!;
      parent.set(x, r);
      x = n;
    }
    return r;
  };
  for (const r of roads) parent.set(r.id, r.id);
  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    for (let j = i + 1; j < roads.length; j++) {
      const o = roads[j];
      if (o.team !== r.team) continue;
      let touch = false;
      for (const [x, z] of [[o.ax, o.az], [o.bx, o.bz]]) if (projectOnRoad(r, x, z).dist < 1.5) touch = true;
      for (const [x, z] of [[r.ax, r.az], [r.bx, r.bz]]) if (projectOnRoad(o, x, z).dist < 1.5) touch = true;
      if (!touch) {
        const rl = roadLength(r) || 1;
        const ol = roadLength(o) || 1;
        const dx = (r.bx - r.ax) / rl;
        const dz = (r.bz - r.az) / rl;
        const ox = (o.bx - o.ax) / ol;
        const oz = (o.bz - o.az) / ol;
        const den = dx * oz - dz * ox;
        if (Math.abs(den) > 1e-6) {
          const t = ((o.ax - r.ax) * oz - (o.az - r.az) * ox) / den;
          const u = ((o.ax - r.ax) * dz - (o.az - r.az) * dx) / den;
          touch = t >= 0 && t <= rl && u >= 0 && u <= ol;
        }
      }
      if (touch) parent.set(find(o.id), find(r.id));
    }
  }
  const out = new Map<number, number>();
  for (const r of roads) out.set(r.id, find(r.id));
  return out;
}
