// 3. Kanyonlar (2026-11-25): gerçek coğrafyadan (Colorado Platosu) esinlenmiş özgün bir harita. Üç basamaklı plato (~820,
// ~1.060, ~1.300 m) arasında uzun sarp yarlar; haritayı batıdan doğuya kıvrılarak kesen ana kanyon (9–13 km geniş, ~1–1,25 km
// derin; dibinde nehir, doğuda baraj gölü); ana kanyonun iki yanında ve yer yer platoda labirent gibi yan kanyonlar; kanyonda
// basamaklı kule kayalar, platoda taş sütunlar (anıt vadisi gibi öbek öbek). Ağır bombardıman uçağı kalkabilsin diye platolar
// gerçek 2.100 m'den alçak. Kanyon duvarları kaya katmanları gibi basamaklı. Tanımlar 300 km taban ölçeğinde; yerel ayrıntı
// (yan kanyon, sütun) gerçek ölçüde (k).

import { makeFbm } from '../core/noise';
import { clamp, smoothstep } from '../core/math';
import { LAND_POINTS, MAP_BASE } from './mapData';
import { pickShape, pillarLocal, type Pillar } from './pillars';

const HALF = MAP_BASE / 2;

const fbmTier = makeFbm(1601, 4);
const fbmRim = makeFbm(2707, 4);
const fbmWidth = makeFbm(3803, 3);
const fbmButte = makeFbm(4909, 4);
const fbmRough = makeFbm(5011, 4);
const fbmNet = makeFbm(6113, 4);
const fbmNetMask = makeFbm(8317, 3);
const fbmWarp = makeFbm(7219, 3);
const fbmSpur = makeFbm(8641, 3);
const fbmGully = makeFbm(9767, 3);
const fbmBench = makeFbm(1093, 3);
const fbmDune = makeFbm(2203, 3);
const fbmWash = makeFbm(3307, 3);
const fbmSlick = makeFbm(4409, 3);

/** Ana kanyonun ekseni: batıdan doğuya kıvrılır (taban koordinatı). */
export function canyonZ(X: number): number {
  return 14000 * Math.sin(X / 23000 + 0.6) + 6000 * Math.sin(X / 8300 + 2.1) + 22000 * Math.sin(X / 61000 - 0.4) - 6000;
}

/**
 * Basamaklı geçiş: 0..1 t'yi katmanlara böler; her basamak düz sekü, sonra içbükey moloz eteği (yükün %30'u), en üstte
 * dik yar. cliff: basamakta eğimli kısmın payı. Simetrik yumuşak basamak yapay görünüyordu.
 */
function terraced(t: number, steps: number, cliff: number): number {
  const q = clamp(t, 0, 0.9999) * steps;
  const i = Math.floor(q);
  const f = q - i;
  const a = 1 - cliff;
  const b = 1 - cliff * 0.38;
  const talus = Math.pow(smoothstep(a, b, f), 1.6) * 0.3;
  const wall = smoothstep(b, 1, f) * 0.7;
  return (i + talus + wall) / steps;
}

/**
 * Kanyon profili: u = merkezden uzaklık / yarı genişlik (0 eksen, 1 kenar). 0 dip … 1 plato.
 * Dik iç boğaz, geniş sekü (~%28), üstte basamaklı yarlar.
 */
function profile(u: number, j = 0): number {
  if (u >= 1) return 1;
  const gorge = smoothstep(0.03, 0.1, u) * 0.24;
  // j: basamakların yeri duvar boyunca kayar (sekü genişliği yerden yere değişir)
  const upper = terraced(clamp(smoothstep(0.2, 1, u) + j, 0, 1), 3, 0.72) * 0.76;
  return gorge + upper;
}

/** Dar (yan) kanyon profili: iki basamak, geniş yar payı (dar kanyonda ince basamak ızgarada tırtık yapıyordu). */
function narrowProfile(u: number): number {
  if (u >= 1) return 1;
  return smoothstep(0.02, 0.2, u) * 0.22 + terraced(smoothstep(0.26, 1, u), 2, 0.92) * 0.78;
}

/** Tamsayı hücreden 0..1 sözde rastgele (taş sütunların yeri). */
function hash2(a: number, b: number, s: number): number {
  let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Sütun ızgarası (m, gerçek ölçü): her hücrede en çok bir sütun ya da üç sütunluk öbek. */
const PILLAR_CELL = 5200;
const fbmMonuMask2 = makeFbm(9533, 3);

/** Anıt vadisi bölgesi (0..1): kayaların sık olduğu, zemini alçalmış kızıl kumlu havzalar. Taban koordinatından. */
function monumentRaw(X: number, Z: number): number {
  return smoothstep(0.05, 0.3, fbmMonuMask2(X / 38000 + 3, Z / 38000));
}

/** Havzanın payı (render: zemin kızıl kuma döner): 0 platoda, 1 havza tabanında. */
export function monumentShare(x: number, z: number, k: number): number {
  return smoothstep(0.3, 0.42, monumentRaw(x / k, z / k));
}

const SLICK_CELL = 2600;

/** Slickrock kubbeleri: bazı bölgelerde yuvarlak, düz yüzlü kumtaşı tümsekleri (40–150 m). Gerçek ölçüde. */
function slickDomes(lx: number, lz: number, X: number, Z: number): number {
  const reg = smoothstep(0.15, 0.4, fbmSlick(X / 30000 - 7, Z / 30000 + 2));
  if (reg <= 0) return 0;
  const ci = Math.floor(lx / SLICK_CELL);
  const cj = Math.floor(lz / SLICK_CELL);
  let h = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (hash2(i, j, 61) > 0.65 * reg) continue;
      const px = (i + 0.2 + hash2(i, j, 62) * 0.6) * SLICK_CELL;
      const pz = (j + 0.2 + hash2(i, j, 63) * 0.6) * SLICK_CELL;
      const r = 500 + hash2(i, j, 64) * 700;
      const d = Math.hypot(lx - px, lz - pz) / r;
      if (d >= 1) continue;
      // Yuvarlak omuz, hafif düz tepe; çapraz katmanlı kumtaşında bir iki sığ basamak
      const prof = Math.pow(1 - d * d, 0.75);
      const top = 40 + hash2(i, j, 65) * 110;
      h = Math.max(h, top * (prof * 0.8 + terraced(prof, 3, 0.85) * 0.2));
    }
  }
  return h;
}

/**
 * Platodaki taş sütunlar (anıt vadisi gibi): her yerde seyrek, bazı bölgelerde öbek öbek. Her biri iki parça: geniş,
 * içbükey, loblu moloz kaidesi (yükseklik haritasında: araziyle kaynaşır, kaya gölgelendiricisini ve kapalılığı alır) ve
 * kaidenin üstünde dik kaya (pillars.ts: sim çarpışması, render modeli). Gerçek anıt vadisi kayalarında boyun neredeyse
 * yarısı kaidedir; düz zeminden çıkan prizmalar "yerden çıkan basit şekil" gibi duruyordu (2026-11-25 kullanıcı).
 * Yalnız düz platoda, üs ve şehir yerlerinden uzak. Harita büyüklüğü başına bir kez hesaplanır (işçiler de aynısını).
 */
function buildPillars(k: number): Pillar[] {
  const half = (MAP_BASE * k) / 2;
  const out: Pillar[] = [];
  const n0 = Math.floor(-half / PILLAR_CELL);
  const n1 = Math.ceil(half / PILLAR_CELL);
  for (let j = n0; j < n1; j++) {
    for (let i = n0; i < n1; i++) {
      const cx = (i + 0.5) * PILLAR_CELL;
      const cz = (j + 0.5) * PILLAR_CELL;
      const region = monumentRaw(cx / k, cz / k);
      if (hash2(i, j, 1) > 0.06 + region * 0.5) continue;
      const n = hash2(i, j, 2) < 0.4 ? 3 : 1;
      for (let q = 0; q < n; q++) {
        const x = (i + 0.2 + hash2(i, j, 3 + q) * 0.6) * PILLAR_CELL;
        const z = (j + 0.2 + hash2(i, j, 7 + q) * 0.6) * PILLAR_CELL;
        if (Math.abs(x) > half * 0.94 || Math.abs(z) > half * 0.94) continue;
        // Çeşit: uzun duvarlı mesa (%18), ince kule (%30; bir kısmı üçlü öbek), geniş dik kaya (kalanı)
        const kind = hash2(i, j, 23 + q);
        const mesa = kind < 0.18;
        const spire = !mesa && kind < 0.48;
        const r = mesa ? 380 + hash2(i, j, 11 + q) * 320 : spire ? 110 + hash2(i, j, 11 + q) * 80 : 220 + hash2(i, j, 11 + q) * 220;
        const tall = mesa ? 210 + hash2(i, j, 15 + q) * 150 : spire ? 300 + hash2(i, j, 15 + q) * 220 : 250 + hash2(i, j, 15 + q) * 200;
        const pedH = (spire ? 110 : 120) + hash2(i, j, 35 + q) * 90;
        const ped = mesa ? 1.9 + hash2(i, j, 39 + q) * 0.5 : spire ? 3.2 + hash2(i, j, 39 + q) * 1.2 : 2.3 + hash2(i, j, 39 + q) * 0.9;
        const ax = mesa ? 1.9 + hash2(i, j, 19 + q) * 1.3 : 0.75 + hash2(i, j, 19 + q) * 0.5;
        const rot = hash2(i, j, 47 + q) * Math.PI;
        const reach = r * ped * 1.25 * Math.max(ax, 1 / ax);
        if (LAND_POINTS.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + reach + 1500)) continue;
        // Düz plato mu: merkez ve kaidenin dışındaki sekiz nokta
        let lo = Infinity;
        let hi = -Infinity;
        for (let a = -1; a < 8; a++) {
          const rr = a < 0 ? 0 : reach * 1.1;
          const h = kanyonBase(x + Math.cos(a * 0.785) * rr, z + Math.sin(a * 0.785) * rr, k);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
        if (hi - lo > 70 || lo < 450) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r * o.ped + r * ped) * 0.8)) continue;
        const ph = hash2(i, j, 43 + q) * 6.28;
        const shape = pickShape(mesa ? 'mesa' : spire ? 'spire' : 'broad', ax, hash2(i, j, 61 + q));
        out.push({ x, z, r, ax, tall, ground: lo - 2, base: lo - 2 + pedH, ped, ph, rot, shape });
        // Kule öbeği (üç kız kardeş gibi): aynı kaideden yükselen iki ince kule daha
        if (spire && hash2(i, j, 51 + q) < 0.45) {
          for (let m = 1; m <= 2; m++) {
            const a = rot + m * 2.1;
            const sx = x + Math.cos(a) * r * 2.1;
            const sz = z + Math.sin(a) * r * 2.1;
            out.push({ x: sx, z: sz, r: r * (0.7 + hash2(i, j, 53 + m) * 0.3), ax, tall: tall * (0.75 + hash2(i, j, 55 + m) * 0.35), ground: lo - 2, base: lo - 2 + pedH * 0.92, ped: ped * 0.75, ph: ph + m, rot, shape: pickShape('spire', ax, hash2(i, j, 63 + m)) });
          }
        }
      }
    }
  }
  return out;
}

const PED_BUCKET = 4000;
let pillarCache: { key: string; list: Pillar[]; buckets: Map<number, Pillar[]> } | null = null;

function pillarsFor(k: number): { list: Pillar[]; buckets: Map<number, Pillar[]> } {
  const key = `${k}|${LAND_POINTS.length}|${LAND_POINTS[0]?.x ?? 0}`;
  if (pillarCache?.key === key) return pillarCache;
  const list = buildPillars(k);
  const buckets = new Map<number, Pillar[]>();
  for (const p of list) {
    const e = p.r * p.ped * 1.9 * Math.max(p.ax, 1 / p.ax);
    for (let j = Math.floor((p.z - e) / PED_BUCKET); j <= Math.floor((p.z + e) / PED_BUCKET); j++) {
      for (let i = Math.floor((p.x - e) / PED_BUCKET); i <= Math.floor((p.x + e) / PED_BUCKET); i++) {
        const kk = (i + 10000) * 20000 + (j + 10000);
        const b = buckets.get(kk);
        if (b) b.push(p);
        else buckets.set(kk, [p]);
      }
    }
  }
  pillarCache = { key, list, buckets };
  return pillarCache;
}

export function kanyonPillars(size: number): Pillar[] {
  return pillarsFor(size / MAP_BASE).list;
}

/**
 * Kaide: kayanın altında düz (1,08 r'ye dek), dışa doğru içbükey moloz yamacı; yarıçapı yöne göre loblu, yamaçta
 * ışınsal yağmur oyukları. Bu noktada kaidelerin en yüksek yüzeyi (yoksa −∞).
 */
function pedestalAt(x: number, z: number, k: number): number {
  const c = pillarsFor(k);
  if (!c.list.length) return -Infinity;
  const b = c.buckets.get((Math.floor(x / PED_BUCKET) + 10000) * 20000 + (Math.floor(z / PED_BUCKET) + 10000));
  if (!b) return -Infinity;
  let top = -Infinity;
  for (const p of b) {
    const [dx, dz] = pillarLocal(p, x, z);
    const d = Math.hypot(dx, dz) / p.r;
    // Erken eleme: lobların en geniş yerinin dışı (açı ve sinüs hesabı pahalı, ızgaranın çoğu buraya düşer)
    if (d >= p.ped * 1.31) continue;
    const th = Math.atan2(dz, dx);
    const lobe = 1 + 0.16 * Math.sin(3 * th + p.ph) + 0.09 * Math.sin(5 * th + 2 * p.ph) + 0.05 * Math.sin(9 * th + 3 * p.ph);
    const R = p.ped * lobe;
    if (d >= R) continue;
    let h: number;
    if (d < 1.08) h = p.base;
    else {
      const u = (d - 1.08) / Math.max(R - 1.08, 0.3);
      const drop = p.base - p.ground;
      const gully = Math.pow(Math.max(0, Math.cos(13 * th + p.ph * 3)), 6) * Math.sin(Math.PI * u) * 0.12;
      // Yatay katman çıkıntıları: içbükey yamaç üç basamağa bölünür (her basamakta kısa düzlük ve dik kenar)
      const s = Math.pow(1 - u, 1.8);
      const q = s * 3.2;
      const stepped = (Math.floor(q) + smoothstep(0.45, 1, q - Math.floor(q))) / 3.2;
      h = p.ground + drop * (s * 0.45 + Math.min(stepped, 1) * 0.55 - gully);
    }
    top = Math.max(top, h);
  }
  return top;
}

export function kanyon(x: number, z: number, k = 1): number {
  return Math.max(kanyonBase(x, z, k), pedestalAt(x, z, k));
}

/**
 * Kaide payı (render): kaide yamacında 0,5–1 (kaya dibinde 1), çevresindeki kızıl kum yaygısında 0–0,5 (dışa doğru
 * söner). Kaide kaya ile aynı kızıl aileden boyanır, zemine kum yaygısıyla karışır.
 */
export function pedestalShare(x: number, z: number, k: number): number {
  const c = pillarsFor(k);
  const b = c.buckets.get((Math.floor(x / PED_BUCKET) + 10000) * 20000 + (Math.floor(z / PED_BUCKET) + 10000));
  if (!b) return 0;
  let best = 0;
  for (const p of b) {
    const [dx, dz] = pillarLocal(p, x, z);
    const d = Math.hypot(dx, dz) / p.r;
    if (d >= p.ped * 1.9) continue;
    const th = Math.atan2(dz, dx);
    const R = p.ped * (1 + 0.16 * Math.sin(3 * th + p.ph) + 0.09 * Math.sin(5 * th + 2 * p.ph) + 0.05 * Math.sin(9 * th + 3 * p.ph));
    const u = (d - 1.08) / Math.max(R - 1.08, 0.3);
    const share = u <= 1 ? 1 - smoothstep(0.6, 1, u) * 0.5 : 0.5 * (1 - smoothstep(1, 1.75, u));
    best = Math.max(best, share);
  }
  return best;
}

/** Sütunsuz şekil (ana menüdeki küçük önizleme: sütun listesi kurulmasın). */
export function kanyonBase(x: number, z: number, k = 1): number {
  const X = x / k;
  const Z = z / k;
  const wx = X + fbmWarp(X / 30000, Z / 30000) * 3000;
  const wz = Z + fbmWarp(X / 30000 + 4.1, Z / 30000 - 2.7) * 3000;
  const lx = x;
  const lz = z;

  // Basamaklı plato: büyük dalgalı yüzey üç düzeye bölünür, aralarında 1–2 km'lik sarp yarlar (escarpment)
  const t = clamp(fbmTier(wx / 70000, wz / 70000) * 1.1 + 0.5, 0, 1);
  // Yar payı birkaç ızgara hücresine yayılır (dar yar 98–146 m ızgarada testere dişi yapıyordu)
  const tier = terraced(t, 3, 0.13);
  let plateau = 820 + tier * 480 + fbmRough(lx / 3500, lz / 3500) * 14 + fbmRough(lx / 900 + 3, lz / 900) * 4;
  // Anıt vadisi havzası: bölgenin içinde zemin ~240 m alçak; kenarında yar ve moloz eteği (kayalar platonun kalıntısı)
  const basin = smoothstep(0.26, 0.46, monumentRaw(X, Z));
  plateau -= 240 * (basin * 0.55 + terraced(basin, 1, 0.9) * 0.45);
  // Havza tabanında alçak kum tepecikleri ve kuru dere yatakları (dışarıda daha hafif)
  const floorK = 0.35 + 0.65 * basin;
  plateau += (fbmDune(lx / 850, lz / 850) * 9 + fbmDune(lx / 260 + 5, lz / 260) * 2.5) * floorK;
  const wash = Math.abs(fbmWash(lx / 6500, lz / 6500) + fbmWash(lx / 1700 + 3, lz / 1700) * 0.08);
  plateau -= (1 - smoothstep(0.012, 0.035, wash)) * 16 * floorK;
  plateau += slickDomes(lx, lz, X, Z);

  // Ana kanyon: genişlik 18–28 km, kenarı girintili çıkıntılı; doğuda baraj gölüne açılır
  const cz = canyonZ(wx);
  const lake = smoothstep(86000, 114000, wx);
  // Kenar: büyük girinti çıkıntı + keskin çıkıntılar (sırt gibi uzanan burunlar)
  const spur = Math.abs(fbmSpur(lx / 1900, lz / 1900)) * 2 - 0.55;
  const halfW = (5400 + fbmWidth(wx / 40000, 1.7) * 1600) * (1 + fbmRim(lx / 6000, lz / 6000) * 0.2 + spur * 0.13) * (1 + lake * 0.6);
  const off = Math.abs(wz - cz);
  let du = off / halfW;
  // Duvarı kesen dereler: duvar bandında dar oluklar, kenarı içeri çeker (oyuklar, amfitiyatrolar)
  const wallZone = smoothstep(0.25, 0.4, du) * (1 - smoothstep(1.0, 1.15, du));
  if (wallZone > 0) {
    const gully = 1 - smoothstep(0, 0.09, Math.abs(fbmGully(lx / 2300, lz / 2300)));
    du -= gully * 0.13 * wallZone;
  }
  const bench = fbmBench(lx / 5000, lz / 5000) * 0.12;
  let depth = profile(du, bench);

  // Yan kanyon labirenti: gürültünün sıfır çizgileri boyunca 1,5–2,5 km'lik kanyonlar; ana kanyonun iki yanında 40 km'lik
  // şeritte yoğun, uzakta seyrek (platolar üs yeri kalsın). Dibi ana kanyondan yüksekte (asılı vadi), ağza doğru alçalır.
  const near = 1 - smoothstep(halfW + 14000, halfW + 42000, off);
  const patch = smoothstep(0.05, 0.3, fbmNetMask(X / 45000, Z / 45000));
  // Kanyon ya tam derin ya hiç: bölge kenarında sığ hendek kalmasın, kanyon başına doğru daralarak biter
  const mask = smoothstep(0.15, 0.45, Math.max(near, patch));
  if (mask > 0.01) {
    const v = Math.abs(fbmNet(lx / 16000, lz / 16000) + fbmNet(lx / 6000 + 11, lz / 6000) * 0.045);
    const w = (0.17 + 0.05 * fbmRim(lx / 9000 + 5, lz / 9000)) * mask;
    const u = v / Math.max(w, 0.02);
    if (u < 1.2) {
      // Ağza yakın (ana kanyona) daha derin
      const floor = 0.03 + 0.2 * smoothstep(0, 32000, off - halfW);
      const net = floor + (1 - floor) * narrowProfile(Math.min(u, 1));
      depth = Math.min(depth, net);
    }
  }

  // Kule kayalar: ana kanyonun orta bandında tek başına kalmış basamaklı tepeler
  const band = smoothstep(0.2, 0.36, du) * (1 - smoothstep(0.74, 0.92, du));
  if (band > 0) {
    const m = fbmButte(lx / 3800, lz / 3800);
    const butte = terraced(smoothstep(0.05, 0.4, m), 3, 0.45) * 0.9;
    depth = Math.max(depth, butte * band);
  }

  // Dip ~30–70 m; nehir yatağı (yarı genişlik ~300 m, gölde birkaç km) deniz seviyesinin altında
  const floorH = 30 + (1 - smoothstep(-HALF, HALF, wx)) * 40;
  let h = floorH + (plateau - floorH) * depth;
  const riverHalf = 320 + lake * 5200;
  const rd = off / riverHalf;
  h -= (1 - smoothstep(0.6, 1.1, rd)) * (floorH + 18 + lake * 30) * (1 - smoothstep(0.35, 0.6, depth));
  return h;
}
