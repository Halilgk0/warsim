// Taş sütunların modeli (2026-11-25, Kanyonlar haritası; sim/pillars.ts). Anıt vadisi kayaları gibi: eklem çatlaklarından
// kırılmış düzlem kaya yüzleri (keskin dikey kenar, yüz başına ayrı köşe), düzensiz çokgen taban, bir iki sekü basamağı,
// tırtıklı tepe; eteğinde içbükey moloz yamacı. Yumuşak silindir ağaç gövdesi ya da kil gibi duruyordu.
// Renk sütunun kendi koordinatından (köşe özniteliği aPil: boy payı, sütun tohumu, parça, yay uzunluğu): sütuna özgü ton
// (koyu kızıl, pas, turuncu, devetüyü), alttan üste koyu → açık geçiş, tepede açık kapak kayası, yatay katman çizgileri,
// dikey oluklar ve yukarıdan akan çöl verniği, eteğinde pembe gri moloz, tepede toprak. Simdeki çarpışma elipsinin içinde
// kalır (köşeler ≤ r). 20 km'lik parçalara bölünür (görüş dışındakiler çizilmez).

import * as THREE from 'three';
import type { Pillar } from '../sim/pillars';
import { NOISE_GLSL } from './desertRock';
import { linkAtmosphere } from './atmosphere';
import { linkCloudShadow } from './clouds';

const RING = 45;
const CHUNK = 20000;
/** Parça kodları (aPil.z; 0 eski etek, artık kullanılmıyor). */
const WALL = 1;
const TOP = 2;

function hash(a: number, b: number): number {
  let h = (Math.round(a * 10) * 374761393 + Math.round(b * 10) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type V = [number, number, number];

class Builder {
  readonly pos: number[] = [];
  readonly pil: number[] = [];
  readonly idx: number[] = [];

  private v(p: V, t: number, seed: number, part: number, arc: number): number {
    const n = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    this.pil.push(t, seed, part, arc);
    return n;
  }

  /**
   * Halkalar arası yüzler. rings: alttan üste halkalar (köşe konumu ve boy payı). Her kenar ayrı sütun: yüzler arasında
   * keskin dikey kenar, halkalar arasında yumuşak.
   */
  faces(rings: { pts: V[]; t: number }[], seed: number, part: number): void {
    const n = rings[0].pts.length;
    let arc = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const w = Math.hypot(rings[0].pts[j][0] - rings[0].pts[i][0], rings[0].pts[j][2] - rings[0].pts[i][2]);
      let prev: [number, number] | null = null;
      for (const r of rings) {
        const a = this.v(r.pts[i], r.t, seed, part, arc);
        const b = this.v(r.pts[j], r.t, seed, part, arc + w);
        if (prev) this.idx.push(prev[0], a, prev[1], prev[1], a, b);
        prev = [a, b];
      }
      arc += w;
    }
  }

  /** Halkanın içini kapat (tepe ya da sekü düzlüğü; merkez hafif yüksek). */
  cap(pts: V[], center: V, t: number, seed: number, part: number): void {
    const c = this.v(center, t, seed, part, 0);
    const r = pts.map((p) => this.v(p, t, seed, part, 0));
    for (let i = 0; i < r.length; i++) this.idx.push(r[i], c, r[(i + 1) % r.length]);
  }

  /** Dış halka ile içteki halka arası düz sekü. */
  ledge(outer: V[], inner: V[], t: number, seed: number): void {
    const o = outer.map((p) => this.v(p, t, seed, TOP, 0));
    const n = inner.map((p) => this.v(p, t, seed, TOP, 0));
    for (let i = 0; i < o.length; i++) {
      const j = (i + 1) % o.length;
      this.idx.push(o[i], n[i], o[j], o[j], n[i], n[j]);
    }
  }
}

/** Sütunun yerel ekseninden (dönüşsüz, elips ölçekli) dünyaya (sim pillarLocal ile ters). */
function toWorld(p: Pillar, u: number, v: number): [number, number] {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return [p.x + c * u - s * v, p.z + s * u + c * v];
}

function addPillar(B: Builder, p: Pillar): void {
  const seed = hash(p.x * 0.37, p.z * 0.11);
  const spire = p.r < 200;
  // Sütun sütun bölünmüş taban (anıt vadisi kayaları gibi): 2–4 köşelik dış yüzler arasında derin dikey yarıklar
  const ang: number[] = [];
  const rad: number[] = [];
  const cleft: boolean[] = [];
  // Bloklar: her biri 2–3 köşe (1–2 düz yüz), dış yüzü kendi uzaklığında; arada iki köşelik dar ve derin yarık
  const blocks = spire ? 4 : 5 + Math.floor(hash(p.x, p.z + 5) * 3);
  const span: number[] = [];
  for (let b = 0; b < blocks; b++) span.push(0.7 + hash(p.x + b * 3, p.z - b) * 0.6);
  const tot = span.reduce((a, b) => a + b, 0);
  let a0 = hash(p.x + 1, p.z + 1) * Math.PI * 2;
  for (let b = 0; b < blocks; b++) {
    const w = (span[b] / tot) * Math.PI * 2;
    const gap = Math.min(0.09, w * 0.12);
    const out = 0.86 + hash(p.x - b, p.z + b * 7) * 0.14;
    const n = 2 + (w > 1.1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      ang.push(a0 + gap + ((w - 2 * gap) * i) / (n - 1));
      rad.push(out * (i === 0 || i === n - 1 ? 0.97 : 1));
      cleft.push(false);
    }
    // Yarık: blok sınırında iki köşe içeride (dar V)
    const depth = 0.66 + hash(p.x + b * 5, p.z + 3) * 0.12;
    ang.push(a0 + w - gap * 0.6);
    rad.push(depth);
    cleft.push(true);
    ang.push(a0 + w + gap * 0.6 - 0.0001);
    rad.push(depth);
    cleft.push(true);
    a0 += w;
  }
  const sides = ang.length;
  // Sütun tepeleri farklı boyda; yarıklarda çentik; bir iki "parmak" yükselir
  const yTop = p.base + p.tall;
  const fingerAt = hash(p.x + 2, p.z + 2) < 0.55 ? Math.floor(hash(p.x + 4, p.z) * sides) : -1;
  const top = Array.from({ length: sides }, (_, i) => {
    if (cleft[i]) return yTop - p.tall * (0.02 + hash(p.x + i, p.z + 31) * 0.035);
    return yTop - p.tall * Math.pow(hash(p.x + i * 3, p.z + 17), 3) * 0.07;
  });
  const leanX = (hash(p.x, p.z + 9) - 0.5) * p.r * 0.25;
  const leanZ = (hash(p.x + 9, p.z) - 0.5) * p.r * 0.25;
  const y0 = p.base - 14;
  const tOf = (y: number) => (y - p.base) / p.tall;
  /** Halka: s 0 dipte, 1 tepede (köşe başına kendi tepe yüksekliğiyle); r çarpanı; daralma. */
  const ringAt = (s: number, rk: number, _lv: number): { pts: V[]; t: number } => {
    const pts = Array.from({ length: sides }, (_, i) => {
      const y = y0 + (top[i] - y0) * s;
      const tt = Math.max(0, (y - p.base) / p.tall);
      const taper = spire ? 1 - 0.3 * tt : 1 - 0.08 * tt;
      const rr = p.r * rad[i] * rk * taper;
      const [wx, wz] = toWorld(p, (Math.cos(ang[i]) * rr) / p.ax, Math.sin(ang[i]) * rr * p.ax);
      return [wx + leanX * tt * tt, y, wz + leanZ * tt * tt] as V;
    });
    return { pts, t: tOf(pts.reduce((m, q) => m + q[1], 0) / sides) };
  };
  const n = Math.max(3, Math.round(p.tall / RING));
  const ledgeAt = 0.4 + hash(p.x + 8, p.z + 8) * 0.25;
  const rings: { pts: V[]; t: number }[] = [];
  for (let s = 0; s <= n; s++) {
    // Basamak: büyük kayada bir yükseklikte gövde biraz içe çekilir (yatay sekü çizgisi); dalgalı gövde kumaş gibi duruyordu
    const st = s / n;
    const ledge = !spire && st > ledgeAt ? 0.95 : 1;
    rings.push(ringAt(st, ledge, s));
    if (!spire && s < n && st <= ledgeAt && (s + 1) / n > ledgeAt) {
      // Basamağın kendisi: aynı yükseklikte dış ve iç halka
      rings.push(ringAt(ledgeAt, 1, s));
      rings.push(ringAt(ledgeAt + 0.004, 0.95, s));
    }
  }
  // Yuvarlanmış tepe kenarı: son halkadan biraz yukarıda ve içeride bir halka daha (yumuşak geçiş)
  const last = rings[rings.length - 1];
  const bevel = last.pts.map((q) => [p.x + (q[0] - p.x) * 0.86, q[1] + p.tall * 0.025, p.z + (q[2] - p.z) * 0.86] as V);
  rings.push({ pts: bevel, t: 1 });
  B.faces(rings, seed, WALL);
  const cy = bevel.reduce((m, q) => m + q[1], 0) / sides + 4;
  B.cap(bevel, [p.x + leanX, cy, p.z + leanZ], 1, seed, TOP);
  // Parmak: kenara yakın, kendi kalınlığı olan ayrı kule (iki köşeyi yükseltmek bıçak gibi ince sivrilik yapıyordu)
  if (fingerAt >= 0) {
    const a = ang[fingerAt];
    const fr = p.r * (spire ? 0.32 : 0.2);
    const off = p.r * (spire ? 0.35 : 0.62);
    const [fx0, fz0] = toWorld(p, (Math.cos(a) * off) / p.ax, Math.sin(a) * off * p.ax);
    const fx = fx0 + leanX;
    const fz = fz0 + leanZ;
    const fy0 = top[fingerAt] - 20;
    const fh = p.tall * (spire ? 0.22 : 0.3);
    const fs = 8;
    const fa = Array.from({ length: fs }, (_, i) => (i / fs) * Math.PI * 2 + hash(fx + i, fz) * 0.4);
    const frad = Array.from({ length: fs }, (_, i) => 0.75 + hash(fx - i, fz + i) * 0.25);
    const fring = (yy: number, k: number): V[] => fa.map((q, i) => [fx + Math.cos(q) * fr * frad[i] * k, yy, fz + Math.sin(q) * fr * frad[i] * k] as V);
    const fr0 = fring(fy0, 1);
    const fr1 = fring(fy0 + fh * 0.55, 0.95);
    const fr2 = fring(fy0 + fh, 0.82);
    const fr3 = fring(fy0 + fh + 6, 0.66);
    B.faces([{ pts: fr0, t: tOf(fy0) }, { pts: fr1, t: tOf(fy0 + fh * 0.55) }, { pts: fr2, t: 1 }, { pts: fr3, t: 1 }], seed, WALL);
    B.cap(fr3, [fx, fy0 + fh + 10, fz], 1, seed, TOP);
  }
}

const PILLAR_FS = /* glsl */ `
  /** Sütuna özgü ana ton (doğrusal): koyu kızıl, pas, turuncu kızıl, kahverengi kızıl, devetüyü. */
  vec3 pBase( float s ) {
    if ( s < 0.24 ) return vec3( 0.46, 0.105, 0.038 );
    if ( s < 0.48 ) return vec3( 0.52, 0.13, 0.045 );
    if ( s < 0.68 ) return vec3( 0.40, 0.088, 0.034 );
    if ( s < 0.86 ) return vec3( 0.56, 0.16, 0.055 );
    return vec3( 0.48, 0.115, 0.04 );
  }
  vec3 pillarColor( vec3 wp, vec4 pil, vec3 n, float lfw ) {
    float t = pil.x;
    float seed = pil.y;
    float part = pil.z;
    float arc = pil.w;
    vec2 lp = mod( wp.xz, 8192.0 );
    float near = 1.0 - smoothstep( 1.0, 10.0, lfw );
    vec3 base = pBase( seed );
    if ( part > 1.5 ) {
      // Tepe ve sekü: kırmızımsı toprak, çalı benekleri
      vec3 c = mix( base * 1.1, vec3( 0.48, 0.2, 0.09 ), 0.5 );
      c *= 0.85 + 0.3 * tNoise( lp, 900.0 );
      c = mix( c, vec3( 0.14, 0.14, 0.09 ), smoothstep( 0.62, 0.8, tNoise( lp + 3.0, 3200.0 ) ) * 0.6 * near );
      return c;
    }
    // Yatay koordinat (yüzey boyunca) ve dikey
    vec2 q = vec2( arc, wp.y );
    if ( part < 0.5 ) {
      // Moloz eteği: pembe gri şeyl, üstten düşmüş kızıl kaya parçaları, dibe doğru toprağa karışır
      // Moloz eteği: duvardan düşmüş kızıl kaya ve kum; dipte platonun toprağına karışır (kaide gibi durmasın)
      vec3 shale = mix( base * 0.95, vec3( 0.36, 0.20, 0.12 ), 0.45 );
      float frag = tNoise( lp, 2400.0 ) * 0.6 + tNoise( lp + 7.0, 7000.0 ) * 0.4;
      vec3 c = mix( shale, base * 0.7, smoothstep( 0.55, 0.85, frag ) * 0.8 );
      c *= 0.78 + 0.34 * tNoise( lp + 1.0, 600.0 );
      // Yağmur oyukları: yamaçtan aşağı açık koyu şeritler
      c *= 0.93 + 0.1 * tNoise( vec2( arc * 0.7, wp.y * 0.2 ) + seed * 500.0, 900.0 );
      // Üstte duvarın dibine, altta platonun toprağına geçiş (ayrı şerit gibi durmasın)
      c = mix( c, base * 0.72, smoothstep( 0.55, 1.0, t / 0.16 ) * 0.6 );
      return mix( c, vec3( 0.50, 0.33, 0.19 ), smoothstep( 0.55, 0.0, t / 0.16 ) * 0.75 );
    }
    // Duvar: alttan üste koyu → açık; katman çizgileri bükülür
    float warp = ( tNoise( q * vec2( 1.0, 0.3 ) + seed * 900.0, 120.0 ) - 0.5 ) * 0.06;
    float tt = t + warp;
    vec3 c = base * mix( 0.82, 1.1, smoothstep( 0.1, 0.85, tt ) );
    // Kapak kayası: tepede ince, biraz açık ve kahverengimsi bant; altında koyu çizgi (zayıf katman)
    c = mix( c, c * vec3( 1.25, 1.2, 1.25 ) + vec3( 0.03, 0.03, 0.02 ), smoothstep( 0.91, 0.95, tt ) * 0.7 );
    c *= 1.0 - 0.25 * smoothstep( 0.86, 0.89, tt ) * ( 1.0 - smoothstep( 0.9, 0.92, tt ) );
    // Dikey paneller: kaya, aralarında koyu oluklar olan açık ve koyu dikey levhalardan oluşur (dördüncü görsel)
    float panel = tNoise( vec2( arc * 0.22 + seed * 50.0, wp.y * 0.004 + seed * 900.0 ), 520.0 );
    c *= 0.72 + 0.5 * smoothstep( 0.2, 0.8, panel );
    float groove = smoothstep( 0.78, 0.95, tNoise( vec2( arc * 0.55 + seed * 11.0, wp.y * 0.006 ), 900.0 ) );
    c *= 1.0 - 0.45 * groove;
    // Kayanın dibinde ince yatay katmanlı bant (kaideye geçiş): açık koyu sık çizgiler, biraz kahverengi
    float lower = 1.0 - smoothstep( 0.08, 0.2, t );
    float strata = 0.5 + 0.5 * sin( wp.y * 0.9 + tNoise( q * 0.3, 200.0 ) * 3.0 );
    c = mix( c, c * mix( vec3( 0.7, 0.66, 0.64 ), vec3( 1.1, 1.0, 0.92 ), strata ), lower * 0.8 );
    // Ortada bir ikinci formasyon geçişi (bazı sütunlarda daha açık turuncu üst gövde)
    c = mix( c, c * vec3( 1.08, 1.14, 1.18 ), smoothstep( 0.5, 0.58, tt ) * step( 0.5, fract( seed * 7.3 ) ) * 0.5 );
    // İnce yatay katman çizgileri (yakında)
    float bed = sin( wp.y * 0.55 + tNoise( q * 0.5 + seed * 300.0, 400.0 ) * 4.0 ) * 0.5 + sin( wp.y * 1.7 ) * 0.25;
    c *= 1.0 + 0.07 * bed * near;
    // Dikey oluklar: yüzey boyunca açık koyu şeritler (yuvarlak gövde değil, oluklu kaya)
    // Geniş oluklar ağırlıklı (ince çizgiler tahta damarı gibi duruyordu)
    float flute = tNoise( vec2( arc * 1.0 + seed * 400.0, wp.y * 0.04 ), 1600.0 ) * 0.25 + tNoise( vec2( arc * 0.35, wp.y * 0.02 ) + seed * 77.0, 700.0 ) * 0.5 + tNoise( vec2( arc * 0.12, wp.y * 0.01 ) + seed * 31.0, 260.0 ) * 0.25;
    c *= 0.82 + 0.36 * flute;
    // Çöl verniği: tepeden aşağı uzanan koyu izler, üstte güçlü
    float v = smoothstep( 0.58, 0.82, tNoise( vec2( arc * 0.9 + seed * 211.0, wp.y * 0.012 ), 1100.0 ) );
    c *= 1.0 - v * 0.42 * smoothstep( 0.15, 0.9, tt ) * ( 1.0 - smoothstep( 4.0, 25.0, lfw ) * 0.6 );
    // Dibe yakın (moloz üstünde) nem ve gölge
    c *= mix( 0.8, 1.0, smoothstep( 0.0, 0.25, t ) );
    return c;
  }
`;

/** Sütun malzemesi (renk gölgelendiricide, aPil özniteliğinden). */
export function pillarMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = (shader) => {
    linkAtmosphere(shader);
    linkCloudShadow(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aPil;\nvarying vec4 vPil;\nvarying vec3 vPN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPil = aPil;\nvPN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vPil;\nvarying vec3 vPN;\n${NOISE_GLSL}\n${PILLAR_FS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = pillarColor( vCloudW, vPil, normalize( vPN ), length( fwidth( vCloudW ) ) );`);
  };
  m.customProgramCacheKey = () => 'pillarRock2';
  return m;
}

/** Sütunları parça parça ağlara çevirir. */
export function buildPillarGroup(list: readonly Pillar[], mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'pillars';
  const parts = new Map<string, Builder>();
  for (const p of list) {
    const key = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
    let B = parts.get(key);
    if (!B) parts.set(key, (B = new Builder()));
    addPillar(B, p);
  }
  for (const B of parts.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    geo.setAttribute('aPil', new THREE.Float32BufferAttribute(B.pil, 4));
    geo.setIndex(B.idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    g.add(m);
  }
  return g;
}
