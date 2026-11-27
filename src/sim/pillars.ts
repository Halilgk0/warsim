// Taş sütunlar (2026-11-25, Kanyonlar haritası): arazi ızgarası (98–146 m) dik duvarlı sütun çizemiyor, küçük koni
// oluyordu. Sütunlar ayrı tutulur: render kendi modelini çizer (render/pillars.ts), simülasyon zemin yüksekliğine katar
// (terrain.ts groundLevel, footprintStats): uçak sütuna çarpar, arazi koruması onu görür, üstüne yapı kurulmaz.
// Biçim (2026-11-27): Blender'da oyulmuş 9 çeşitten biri (pillarShapes.ts, tools/blender/kaya.py). Simin yükseklik
// kalıbı modelin kendisinden (64×64, daire uzayında, hücre içinin en yükseği): uçak görünen kayaya çarpar.

import { PILLAR_HM, PILLAR_HM_TOP, PILLAR_SHAPES, type PillarKind } from './pillarShapes';

export interface Pillar {
  x: number;
  z: number;
  /** Dış elipsin yarıçapı (m): kaya bunun içinde kalır. */
  r: number;
  /** Elips oranı: x yönünde r / ax, z yönünde r · ax. */
  ax: number;
  /** Tabandan tasarım tepesine (m); kapak ya da kubbe biraz aşabilir. */
  tall: number;
  /** Kayanın tabanı: kaidenin tepesi (m). */
  base: number;
  /** Platonun yüksekliği (kaidenin dibi, m). */
  ground: number;
  /** Kaidenin yarıçapı (r'nin katı; yöne göre loblu). */
  ped: number;
  /** Lob ve oyukların evresi. */
  ph: number;
  /** Elipsin dönüşü (rad): uzun mesalar her yöne uzanır. */
  rot: number;
  /** Biçim (PILLAR_SHAPES sırası). */
  shape: number;
}

const BUCKET = 4000;
let list: Pillar[] = [];
let buckets = new Map<number, number[]>();

const key = (i: number, j: number): number => (i + 10000) * 20000 + (j + 10000);

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Biçimlerin yükseklik kalıpları (ilk kullanımda çözülür). */
let hms: Uint8Array[] | null = null;
function heightMaps(): Uint8Array[] {
  hms ??= PILLAR_SHAPES.map((s) => b64(s.hm));
  return hms;
}

/** Çeşit seçimi: türüne uyan biçimler; mesada çoğunlukla elips oranı en yakın olan, ötekilerde karışık (h ∈ [0, 1)). */
export function pickShape(kind: PillarKind, ax: number, h: number): number {
  const ids = PILLAR_SHAPES.map((s, i) => [s, i] as const).filter(([s]) => s.kind === kind);
  if (kind === 'mesa') {
    ids.sort((a, b) => Math.abs(a[0].axd - ax) - Math.abs(b[0].axd - ax));
    return ids[h < 0.55 ? 0 : Math.min(1, ids.length - 1)][1];
  }
  return ids[Math.floor(h * ids.length) % ids.length][1];
}

export function setPillars(p: Pillar[]): void {
  list = p;
  buckets = new Map();
  p.forEach((q, n) => {
    const e = q.r * Math.max(q.ax, 1 / q.ax);
    for (let j = Math.floor((q.z - e) / BUCKET); j <= Math.floor((q.z + e) / BUCKET); j++) {
      for (let i = Math.floor((q.x - e) / BUCKET); i <= Math.floor((q.x + e) / BUCKET); i++) {
        const k = key(i, j);
        const b = buckets.get(k);
        if (b) b.push(n);
        else buckets.set(k, [n]);
      }
    }
  });
}

export function pillarList(): readonly Pillar[] {
  return list;
}

/** Noktanın sütunun yerel eksenindeki konumu (dönüş geri alınmış, elips ölçeği uygulanmış; r'ye bölünmemiş). */
export function pillarLocal(p: Pillar, x: number, z: number): [number, number] {
  const dx = x - p.x;
  const dz = z - p.z;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return [(c * dx + s * dz) * p.ax, (-s * dx + c * dz) / p.ax];
}

/** Sütuna göre uzaklık (1 = dış elips). */
export function pillarDist(p: Pillar, x: number, z: number): number {
  const [a, b] = pillarLocal(p, x, z);
  return Math.hypot(a, b) / p.r;
}

/** Biçimin bu noktadaki üst yüzeyi (boy payı; kaya yoksa −1). Komşu dört hücrenin en yükseği: kenarda uçak kayaya erken çarpar, geç değil. */
function shapeTop(shape: number, a: number, b: number): number {
  const N = PILLAR_HM;
  const fx = ((a + 1) / 2) * N - 0.5;
  const fz = ((b + 1) / 2) * N - 0.5;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fz);
  const hm = heightMaps()[shape];
  let v = 0;
  for (let j = j0; j <= j0 + 1; j++) {
    if (j < 0 || j >= N) continue;
    for (let i = i0; i <= i0 + 1; i++) {
      if (i < 0 || i >= N) continue;
      v = Math.max(v, hm[j * N + i]);
    }
  }
  return v ? ((v - 1) / 254) * PILLAR_HM_TOP : -1;
}

/** Bu noktada sütunun üst yüzeyi (m); sütun yoksa −∞. */
export function pillarTop(x: number, z: number): number {
  if (!list.length) return -Infinity;
  const b = buckets.get(key(Math.floor(x / BUCKET), Math.floor(z / BUCKET)));
  if (!b) return -Infinity;
  let top = -Infinity;
  for (const n of b) {
    const p = list[n];
    const [la, lb] = pillarLocal(p, x, z);
    const a = la / p.r;
    const c = lb / p.r;
    // Kaide yükseklik ızgarasında (mapKanyon pedestalAt); burada yalnız kaya
    if (a <= -1 || a >= 1 || c <= -1 || c >= 1) continue;
    const t = shapeTop(p.shape, a, c);
    if (t >= 0) top = Math.max(top, p.base + t * p.tall);
  }
  return top;
}
