// Taş sütunlar (2026-11-25, Kanyonlar haritası): arazi ızgarası (98–146 m) dik duvarlı sütun çizemiyor, küçük koni
// oluyordu. Sütunlar ayrı tutulur: render kendi modelini çizer (render/pillars.ts), simülasyon zemin yüksekliğine katar
// (terrain.ts groundLevel, footprintStats): uçak sütuna çarpar, arazi koruması onu görür, üstüne yapı kurulmaz.
// Biçim: dik duvarlı iki basamak (dış halka %68, iç çekirdek tam boy) ve eteğinde moloz yamacı; taban hafif elips.

export interface Pillar {
  x: number;
  z: number;
  /** Dış duvarın yarıçapı (m). */
  r: number;
  /** Elips oranı: x yönünde r / ax, z yönünde r · ax. */
  ax: number;
  /** Tabandan tepeye (m). */
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
  /** Çekirdeğin yarıçap payı (iki basamaklı sütunda 0,6; tek parça kulede 1). */
  core: number;
  /** Dış halkanın boy payı (iki basamaklıda 0,68; kulede 1). */
  shoulder: number;
}

/** Etek (moloz yamacı) yarıçapı (dış duvarın katı) ve yüksekliği (boyun payı). */
export const PILLAR_SKIRT = 1.35;
export const PILLAR_TALUS = 0.16;

const BUCKET = 4000;
let list: Pillar[] = [];
let buckets = new Map<number, number[]>();

const key = (i: number, j: number): number => (i + 10000) * 20000 + (j + 10000);

export function setPillars(p: Pillar[]): void {
  list = p;
  buckets = new Map();
  p.forEach((q, n) => {
    const e = q.r * PILLAR_SKIRT * Math.max(q.ax, 1 / q.ax);
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

/** Sütuna göre uzaklık (1 = dış duvar). */
export function pillarDist(p: Pillar, x: number, z: number): number {
  const [a, b] = pillarLocal(p, x, z);
  return Math.hypot(a, b) / p.r;
}

/** Bu noktada sütunun üst yüzeyi (m); sütun yoksa −∞. */
export function pillarTop(x: number, z: number): number {
  if (!list.length) return -Infinity;
  const b = buckets.get(key(Math.floor(x / BUCKET), Math.floor(z / BUCKET)));
  if (!b) return -Infinity;
  let top = -Infinity;
  for (const n of b) {
    const p = list[n];
    const d = pillarDist(p, x, z);
    // Kaide yükseklik ızgarasında (mapKanyon pedestalAt); burada yalnız dik kaya
    if (d >= 1) continue;
    const h = d < p.core ? p.tall : p.tall * p.shoulder;
    top = Math.max(top, p.base + h);
  }
  return top;
}
