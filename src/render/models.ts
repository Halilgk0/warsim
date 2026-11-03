// Prosedürel uçak modelleri: tanınabilir siluet (kanat planformu, burun, kanopi, naseller, kuyruk düzeni) ve yüksek
// ayrıntıda pürüzsüz gövde, gerçek kanat profili, küçük parçalar (pilot, anten, pitot, namlular, yuvarlak egzozlar).
// Boya, kamuflaj, malzeme dokusu ve armalar skin.ts'te (gölgelendirici). Düşük kalitede eski low-poly düzey.
// Eksenler: burun +Z, üst +Y, kanat açıklığı X. Ölçüler metre, gerçek boyutlara yakın.
// Dış yükler (bomba, roket, atılabilir tank) ayrı parçadır; harcanınca gizlenir.

import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPEC_LIST, type AircraftSpec } from '../sim/aircraft/specs';
import type { Hardpoint, StoreDef } from '../sim/aircraft/stores';
import { gearHeight } from '../sim/aircraft/flightModel';
import { ATMO_PARS, linkAtmosphere } from './atmosphere';
import { FALLBACK_LIVERY, LIVERIES, nationOf, type MarkSpot } from './liveries';
import { skinMaterial, type SkinInfo } from './skin';
import { LAMP, LampSet } from './lamps';

type V3 = [number, number, number];
type Geo = THREE.BufferGeometry;

/** Ayrıntı düzeyi: 0 low-poly (düşük kalite), 1 yüksek. cached() model kurarken ayarlar. */
let DETAIL = 1;
/** Yüksek ayrıntıda ek çözünürlük çarpanı (videosu çekilen uçaklarda daha çok kenar ve profil noktası). */
let RES = 1;
const HIRES: Record<string, number> = { mig15: 2.4, sabre: 1.6, f84: 1.6, p80: 1.6, me262: 1.6, meteor: 1.6, vampire: 1.6, he162: 1.6 };
/** Dönel parçaların kenar sayısı ayrıntıya göre. */
const sg = (n: number) => (DETAIL ? Math.round(n * 2.25 * RES) : n);

/** Profil yumuşatma (Chaikin köşe kesme, uçlar sabit): taşma yapmaz, kırık çizgi kavise döner. */
function chaikin(p: [number, number][], it: number): [number, number][] {
  let a = p;
  for (let k = 0; k < it; k++) {
    const b: [number, number][] = [a[0]];
    for (let i = 0; i < a.length - 1; i++) {
      const [z0, r0] = a[i];
      const [z1, r1] = a[i + 1];
      b.push([z0 * 0.75 + z1 * 0.25, r0 * 0.75 + r1 * 0.25], [z0 * 0.25 + z1 * 0.75, r0 * 0.25 + r1 * 0.75]);
    }
    b.push(a[a.length - 1]);
    a = b;
  }
  return a;
}

/** Geometriyi cam ya da koyu parça olarak işaretle (ayrı malzemeyle çizilir). */
function tag(g: Geo, part: 'glass' | 'dark'): Geo {
  g.userData.part = part;
  return g;
}

/** Eklem bilgisi: ad, dönme noktası (model ekseninde), gövde siluetinin parçası mı, menteşe ekseni (varsa). */
interface JointTag { name: string; pivot: V3; big: boolean; axis?: V3 }

/**
 * Hareketli parça (eklem): pervane, taret, kumanda yüzeyi, kapak, değişken açılı kanat. Eklemin parçaları sabit
 * gövdeden ayrı, kendi içinde türlerine göre birleşir (kaç parça olursa olsun gövde, cam ve ayrıntı için en çok üç
 * çizim); grup pivot noktasında durur, oyun onu döndürür (model.joints[ad]). Geometri model ekseninde kalır: boya
 * deseni ve armalar dönen parçada kaymaz. big: siluetin parçası (kanat gibi), uzakta da çizilir; değilse küçük
 * ayrıntı sayılır, ekranda küçük kalan uçakta gizlenir. Yapılardaki dönen top ve antenler de aynı ilkeyle kurulu.
 */
function joint(name: string, pivot: V3, geos: Geo[], big = false, axis?: V3): Geo[] {
  const j: JointTag = { name, pivot, big, axis };
  for (const g of geos) g.userData.joint = j;
  return geos;
}

/** 8 köşeli kutu benzeri gövde (0-3 alt halka, 4-7 üst halka, aynı sırada). */
function hexa(v: V3[]): Geo {
  const quads = [
    [0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],
  ];
  const pos: number[] = [];
  for (const [a, b, c, d] of quads) pos.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Kanat istasyonu: x yanal uzaklık, z hücum kenarı, c veter, y yükseklik, t kalınlık. */
interface Station { x: number; z: number; c: number; y: number; t: number }

/** İstasyonlar arası kanat dilimleri, iki yana simetrik. */
/** Aynalanan parçada üçgen sırasını çevir (yüzey normalleri dışa baksın: aydınlatma ve karın boyası doğru olsun). */
function flipWinding(g: Geo): Geo {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i + 1);
    const y = p.getY(i + 1);
    const z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, x, y, z);
  }
  return g;
}

/** Profil kesitinin veter noktaları (0 hücum, 1 firar kenarı), kosinüs aralıklı: burun yuvarlaklığı sık örneklenir. */
let AF_N = 10;
const afX = (n: number) => Array.from({ length: n + 1 }, (_, i) => 0.5 * (1 - Math.cos((Math.PI * i) / n)));
let AF_X = afX(AF_N);
/** Profil nokta sayısı (RES ile): cached() ayarlar, bitince 10'a döner. */
function setAirfoilRes(n: number): void {
  if (n === AF_N) return;
  AF_N = n;
  AF_X = afX(n);
}
/** NACA 00xx yarım kalınlık (tam kalınlık 1 için; en kalın yer %30 veterde 0,5), firar kenarında 0. */
const nacaT = (x: number) => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);

/** Profil kesiti: hücum kenarı noktası, veter (−z yönünde), kalınlık (m). */
interface Section { le: THREE.Vector3; c: number; t: number }

/**
 * Taşıyıcı yüzeyin veter aralığı [x0, x1] (0 hücum, 1 firar kenarı): kesitler aynı profilden kesilir, böylece ana yüzey
 * ve kumanda yüzeyi aynı kalınlıkta birleşir (aralarında yalnız menteşe aralığı kalır). Eğri yüz pürüzsüz, kesik kenar
 * (ana yüzeyin arkası, kumanda yüzeyinin önü) ve iki uç düz yüzle kapanır (keskin köşe).
 */
function airfoilPart(secs: Section[], thick: THREE.Vector3, x0: number, x1: number): Geo {
  const M = AF_N;
  const xs = AF_X.map((a) => x0 + (x1 - x0) * a);
  const sharedLe = x0 === 0;
  const pt = (s: Section, x: number, up: boolean) => {
    const h = s.t * nacaT(x) * (up ? 1 : -1) + s.t * 0.12 * Math.sin(Math.PI * x);
    return new THREE.Vector3(s.le.x + thick.x * h, s.le.y + thick.y * h, s.le.z - s.c * x + thick.z * h);
  };
  // Halka: üst yüz x1 → x0, alt yüz x0 → x1 (hücum kenarından kesilmemişse burun noktası ortak)
  const ring = (s: Section) => [
    ...xs.slice().reverse().map((x) => pt(s, x, true)),
    ...xs.slice(sharedLe ? 1 : 0).map((x) => pt(s, x, false)),
  ];
  const rings = secs.map(ring);
  const R = rings[0].length;
  const cut = sharedLe ? -1 : M; // kumanda yüzeyinde ön kesik: M (üst x0) ile M+1 (alt x0) arası
  const pos: number[] = [];
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  const surf: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < R - 1; k++) {
      if (k === cut) continue;
      const a = i * R + k;
      const b = (i + 1) * R + k;
      surf.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Üst yüzün ortasındaki üçgen kalınlık yönüne baksın
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const mid = Math.floor(M * 0.5) * 6;
  const n0 = P(surf[mid + 1]).sub(P(surf[mid])).cross(P(surf[mid + 2]).sub(P(surf[mid])));
  if (n0.dot(thick) < 0) for (let i = 0; i < surf.length; i += 3) [surf[i + 1], surf[i + 2]] = [surf[i + 2], surf[i + 1]];
  const sg0 = new THREE.BufferGeometry();
  sg0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg0.setIndex(surf);
  sg0.computeVertexNormals();
  const smooth = sg0.toNonIndexed();
  // Düz yüzler: kesik kenar şeritleri ve iki uç kapağı, istenen yöne bakacak sarımla
  const flat: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, want: THREE.Vector3) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.dot(want) < 0) [b, c] = [c, b];
    flat.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const chord = new THREE.Vector3(0, 0, -1);
  for (let i = 0; i < rings.length - 1; i++) {
    const [ra, rb] = [rings[i], rings[i + 1]];
    if (sharedLe) {
      // Arka kesik: üst x1 (0) ile alt x1 (R-1)
      tri(ra[0], rb[0], ra[R - 1], chord);
      tri(ra[R - 1], rb[0], rb[R - 1], chord);
    } else {
      const want = chord.clone().negate();
      tri(ra[M], rb[M], ra[M + 1], want);
      tri(ra[M + 1], rb[M], rb[M + 1], want);
    }
  }
  const span = secs[secs.length - 1].le.clone().sub(secs[0].le).normalize();
  for (const [r, want] of [[rings[0], span.clone().negate()], [rings[rings.length - 1], span]] as [THREE.Vector3[], THREE.Vector3][]) {
    const c = r.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(r.length);
    for (let k = 0; k < R; k++) tri(c, r[k], r[(k + 1) % R], want);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
  fg.computeVertexNormals();
  return mergeGeometries([smooth, fg], false)!;
}

/**
 * Taşıyıcı yüzey (kanat, yatay ve dikey kuyruk): kesitler arası pürüzsüz profil yüzeyi, uçta kapak. thick: kalınlık
 * yönü (kanatta yukarı, dikey kuyrukta yan); üst yüzün normali bu yöne bakacak biçimde sarılır. Firar kenarında üst
 * ve alt yüz ayrı köşe: keskin kenar.
 */
function airfoilSurface(secs: Section[], thick: THREE.Vector3): Geo {
  const R = AF_N * 2 + 1;
  const pos: number[] = [];
  const ring = (s: Section) => {
    for (let k = 0; k < R; k++) {
      const up = k <= AF_N;
      const x = AF_X[up ? AF_N - k : k - AF_N];
      const h = s.t * nacaT(x) * (up ? 1 : -1) + s.t * 0.12 * Math.sin(Math.PI * x);
      pos.push(s.le.x + thick.x * h, s.le.y + thick.y * h, s.le.z - s.c * x + thick.z * h);
    }
  };
  for (const s of secs) ring(s);
  // Uç kapağı: son kesitin kopyası (kenarı keskin kalsın) ve ortası
  ring(secs[secs.length - 1]);
  const last = secs[secs.length - 1];
  const capC = pos.length / 3;
  pos.push(last.le.x, last.le.y, last.le.z - last.c * 0.4);
  const surf: number[] = [];
  for (let i = 0; i < secs.length - 1; i++) {
    for (let k = 0; k < R - 1; k++) {
      const a = i * R + k;
      const b = (i + 1) * R + k;
      surf.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const cap = secs.length * R;
  const capIdx: number[] = [];
  for (let k = 0; k < R - 1; k++) capIdx.push(cap + k, capC, cap + k + 1);
  capIdx.push(cap + R - 1, capC, cap);
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const triN = (list: number[], t: number) => {
    const a = P(list[t]);
    return P(list[t + 1]).sub(a).cross(P(list[t + 2]).sub(a));
  };
  const flip = (list: number[]) => {
    for (let i = 0; i < list.length; i += 3) [list[i + 1], list[i + 2]] = [list[i + 2], list[i + 1]];
  };
  // Sarım yönü: üst yüzün orta veterdeki üçgeni kalınlık yönüne, uç kapağı açıklık yönüne baksın
  const mid = Math.round(AF_N * 0.45) * 6;
  if (secs.length > 1 && triN(surf, mid).dot(thick) < 0) flip(surf);
  const out = secs.length > 1 ? last.le.clone().sub(secs[secs.length - 2].le) : thick;
  if (triN(capIdx, Math.round(AF_N / 2) * 3).dot(out) < 0) flip(capIdx);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([...surf, ...capIdx]);
  g.computeVertexNormals();
  return g;
}

function wingFrom(st: Station[]): Geo[] {
  const out: Geo[] = [];
  // Kök dilimi gövdenin içine uzat: gövde kuyruğa doğru daralınca kanat kökünde boşluk kalmasın
  if (st.length && st[0].x > 0.05) st = [{ ...st[0], x: st[0].x * 0.3 }, ...st];
  if (DETAIL) {
    for (const s of [1, -1]) {
      out.push(airfoilSurface(st.map((p) => ({ le: new THREE.Vector3(s * p.x, p.y, p.z), c: p.c, t: p.t })), new THREE.Vector3(0, 1, 0)));
    }
    return out;
  }
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i];
    const b = st[i + 1];
    for (const s of [1, -1]) {
      const g = hexa([
        [s * a.x, a.y - a.t / 2, a.z], [s * a.x, a.y - a.t / 2, a.z - a.c], [s * b.x, b.y - b.t / 2, b.z - b.c], [s * b.x, b.y - b.t / 2, b.z],
        [s * a.x, a.y + a.t / 2, a.z], [s * a.x, a.y + a.t / 2, a.z - a.c], [s * b.x, b.y + b.t / 2, b.z - b.c], [s * b.x, b.y + b.t / 2, b.z],
      ]);
      out.push(s < 0 ? flipWinding(g) : g);
    }
  }
  return out;
}

interface WingOpts {
  /** Kök: gövde kenarı (x), hücum kenarı z, veter, y. */
  x0: number;
  z: number;
  root: number;
  y: number;
  /** Yarı açıklık ucu (x). */
  tipX: number;
  tip: number;
  /** Uçta hücum kenarının geri kayması (m). */
  sweep: number;
  dihedral: number;
  t: number;
  shape?: 'tapered' | 'elliptic' | 'rounded' | 'gull';
  /** Martı kanatta kırılma noktası (açıklık oranı) ve iç panel dihedrali (negatif: ters martı). */
  breakAt?: number;
  innerDihedral?: number;
}

const tanD = (deg: number) => Math.tan((deg * Math.PI) / 180);

function wing(w: WingOpts): Geo[] {
  // Yatay kuyruk, yükselen gövde ekseniyle birlikte kalkar (ana kanatta kaldırma sıfır)
  const o = { ...w, y: w.y + tailLift(w.z - w.root * 0.5) };
  const span = o.tipX - o.x0;
  const st: Station[] = [];
  const shape = o.shape ?? 'tapered';
  if (shape === 'elliptic') {
    // Hücum ve firar kenarı eğri, uçlar yuvarlak
    const fs = DETAIL ? [0, 0.2, 0.36, 0.5, 0.62, 0.72, 0.8, 0.87, 0.92, 0.96, 0.985, 1] : [0, 0.35, 0.62, 0.82, 0.94, 1];
    for (const f of fs) {
      const c = Math.max(o.root * Math.sqrt(1 - f * f * 0.97), o.root * 0.12);
      const zMid = o.z - o.root * 0.32 - o.sweep * f;
      st.push({ x: o.x0 + span * f, z: zMid + c * 0.32, c, y: o.y + span * f * tanD(o.dihedral), t: o.t * (1 - 0.65 * f) });
    }
  } else if (shape === 'gull') {
    const b = o.breakAt ?? 0.3;
    const yb = o.y + span * b * tanD(o.innerDihedral ?? 14);
    const cb = o.root + (o.tip - o.root) * b * 0.5;
    st.push({ x: o.x0, z: o.z, c: o.root, y: o.y, t: o.t });
    st.push({ x: o.x0 + span * b, z: o.z - o.sweep * b, c: cb, y: yb, t: o.t * 0.9 });
    st.push({ x: o.x0 + span * 0.93, z: o.z - o.sweep * 0.93, c: cb + (o.tip - cb) * 0.9, y: yb + span * (0.93 - b) * tanD(o.dihedral), t: o.t * 0.45 });
    st.push({ x: o.tipX, z: o.z - o.sweep - o.tip * 0.12, c: o.tip * 0.6, y: yb + span * (1 - b) * tanD(o.dihedral), t: o.t * 0.3 });
  } else {
    st.push({ x: o.x0, z: o.z, c: o.root, y: o.y, t: o.t });
    if (shape === 'rounded' && DETAIL) {
      // Yuvarlak uç: son %10 açıklıkta veter çeyrek daire gibi kısalır
      const at = (f: number, cm: number, back: number, tm: number) => st.push({
        x: o.x0 + span * f, z: o.z - o.sweep * f - o.tip * back, c: (o.root + (o.tip - o.root) * f) * cm,
        y: o.y + span * f * tanD(o.dihedral), t: o.t * tm,
      });
      at(0.5, 1, 0, 0.75);
      at(0.9, 1, 0, 0.5);
      at(0.95, 0.9, 0.04, 0.42);
      at(0.98, 0.74, 0.1, 0.34);
      at(1, 0.5, 0.2, 0.25);
    } else if (shape === 'rounded') {
      const f = 0.92;
      st.push({ x: o.x0 + span * f, z: o.z - o.sweep * f, c: o.root + (o.tip - o.root) * f, y: o.y + span * f * tanD(o.dihedral), t: o.t * 0.5 });
      st.push({ x: o.tipX, z: o.z - o.sweep - o.tip * 0.15, c: o.tip * 0.55, y: o.y + span * tanD(o.dihedral), t: o.t * 0.3 });
    } else {
      st.push({ x: o.tipX, z: o.z - o.sweep, c: o.tip, y: o.y + span * tanD(o.dihedral), t: o.t * 0.45 });
    }
  }
  return wingFrom(st);
}

interface Fin {
  x?: number; y0: number; z0: number; h: number; root: number; tip: number; sweep: number; t: number;
  /** Dışa yatma açısı (derece). x verilirse çift kuyruk üretilir. */
  cant?: number;
}

function fins(fin: Fin): Geo[] {
  const f = { ...fin, y0: fin.y0 + tailLift(fin.z0 - fin.root * 0.5) };
  const sides = f.x ? [1, -1] : [1];
  return sides.map((s) => {
    const c = (((f.cant ?? 0) * Math.PI) / 180) * s;
    const x0 = (f.x ?? 0) * s;
    const x1 = x0 + Math.sin(c) * f.h;
    const y1 = f.y0 + Math.cos(c) * f.h;
    const nx = Math.cos(c);
    const ny = -Math.sin(c);
    const chordMid = (f.root + f.tip) / 2;
    finSink.push({
      x: x1, yTop: y1, yRoot: f.y0, zTop: f.z0 - f.sweep - f.tip * 0.35, zMid: f.z0 - f.sweep * 0.5 - chordMid * 0.5, chordMid,
    });
    if (DETAIL) {
      // Profilli dikey kuyruk: kök gövdeye gömülü, uç yuvarlatılmış
      const at = (k: number, cm: number, back: number, tm: number): Section => ({
        le: new THREE.Vector3(x0 + (x1 - x0) * k, f.y0 - 0.25 + (y1 - f.y0 + 0.25) * k, f.z0 - f.sweep * k - f.tip * back),
        c: (f.root + (f.tip - f.root) * k) * cm,
        t: f.t * (1 - 0.5 * k) * tm,
      });
      return airfoilSurface([at(0, 1, 0, 1), at(0.5, 1, 0, 1), at(0.9, 1, 0, 1), at(0.96, 0.88, 0.05, 0.85), at(1, 0.6, 0.18, 0.6)], new THREE.Vector3(nx, ny, 0));
    }
    const rt = f.t / 2;
    const tt = f.t / 4;
    const zl0 = f.z0;
    const zt0 = f.z0 - f.root;
    const zl1 = f.z0 - f.sweep;
    const zt1 = f.z0 - f.sweep - f.tip;
    // Dikey kuyruk gövdeye hafif gömülür (arada ışık sızmasın)
    const g = hexa([
      [x0 - nx * rt, f.y0 - 0.25 - ny * rt, zl0], [x0 - nx * rt, f.y0 - 0.25 - ny * rt, zt0],
      [x1 - nx * tt, y1 - ny * tt, zt1], [x1 - nx * tt, y1 - ny * tt, zl1],
      [x0 + nx * rt, f.y0 - 0.25 + ny * rt, zl0], [x0 + nx * rt, f.y0 - 0.25 + ny * rt, zt0],
      [x1 + nx * tt, y1 + ny * tt, zt1], [x1 + nx * tt, y1 + ny * tt, zl1],
    ]);
    return s < 0 ? flipWinding(g) : g;
  });
}

/**
 * Kavisli dikey kuyruk (sırt yüzgeciyle bütün, ortada): yükseklik başına [y, hücum kenarı z, veter]. Kök kesit
 * gövdeye gömülü; kalınlık tepeye doğru incelir.
 */
function curvedFin(t: number, secs: [number, number, number][]): Geo {
  const y0 = secs[0][0];
  const top = secs[secs.length - 1];
  const mid = secs[Math.floor(secs.length / 2)];
  finSink.push({ x: 0, yTop: top[0], yRoot: y0, zTop: top[1] - top[2] * 0.35, zMid: mid[1] - mid[2] * 0.5, chordMid: mid[2] });
  const h = top[0] - y0;
  return airfoilSurface(
    secs.map(([y, le, c]) => ({ le: new THREE.Vector3(0, y, le), c, t: t * (1 - (0.6 * (y - y0)) / h) })),
    new THREE.Vector3(1, 0, 0),
  );
}

interface BodyOpts { x?: number; y?: number; z?: number; sx?: number; sy?: number; rot?: number; smooth?: boolean }

/** Dönel gövde. profile: [z, yarıçap] çiftleri (burundan kuyruğa); smooth: yüksek ayrıntıda profil kavislenir. */
function body(profile: [number, number][], seg = 8, o: BodyOpts = {}): Geo {
  const prof = DETAIL && o.smooth ? chaikin(profile, 2) : profile;
  const pts = prof.map(([z, r]) => new THREE.Vector2(Math.max(r, 0.001), z));
  const g = new THREE.LatheGeometry(pts, sg(seg), o.rot ?? 0);
  g.rotateX(Math.PI / 2);
  g.scale(o.sx ?? 1, o.sy ?? 1, 1);
  g.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  return g;
}

/** Gövde kesiti: z, yarı en, yarı yükseklik, eksen yüksekliği (kuyruğa doğru yükselen gövde için). */
type LoftSec = [number, number, number, number];

/** Çok boyutlu Chaikin (uçlar sabit). */
function chaikinN(p: number[][], it: number): number[][] {
  let a = p;
  for (let k = 0; k < it; k++) {
    const b: number[][] = [a[0]];
    for (let i = 0; i < a.length - 1; i++) {
      b.push(a[i].map((v, j) => v * 0.75 + a[i + 1][j] * 0.25), a[i].map((v, j) => v * 0.25 + a[i + 1][j] * 0.75));
    }
    b.push(a[a.length - 1]);
    a = b;
  }
  return a;
}

/**
 * Kesitlerden gövde (burundan kuyruğa): eliptik kesit, en ve yükseklik ayrı, ekseni kuyruğa doğru yükselebilir
 * (dönel gövdenin "puro" görünümü yerine gerçek yan görünüş: üst çizgi düz kalır, karın çizgisi kuyruğa kalkar).
 * Dışa bakan sarım ve pürüzsüz normaller; uçlarda kesit büyükse kapak.
 */
function loft(secs: LoftSec[], seg = 8): Geo {
  const s = (DETAIL ? chaikinN(secs, 2) : secs) as LoftSec[];
  const n = DETAIL ? Math.round(seg * 3.5) : seg;
  const pos: number[] = [];
  for (const [z, w, h, c] of s) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      pos.push(Math.cos(a) * Math.max(w, 0.001), c + Math.sin(a) * Math.max(h, 0.001), z);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const a = i * n + k;
      const b = (i + 1) * n + k;
      const a1 = i * n + ((k + 1) % n);
      const b1 = (i + 1) * n + ((k + 1) % n);
      idx.push(a, b, a1, a1, b, b1);
    }
  }
  const cap = (i: number, front: boolean) => {
    const [z, , , c] = s[i];
    const ci = pos.length / 3;
    pos.push(0, c, z + (front ? 0.02 : -0.02));
    for (let k = 0; k < n; k++) {
      const a = i * n + k;
      const a1 = i * n + ((k + 1) % n);
      idx.push(...(front ? [ci, a, a1] : [ci, a1, a]));
    }
  };
  if (Math.min(s[0][1], s[0][2]) > 0.01) cap(0, true);
  if (Math.min(s[s.length - 1][1], s[s.length - 1][2]) > 0.01) cap(s.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Kuyruk yükselmesi: son kurulan gövdenin ekseninin z'deki yüksekliği (fuselage() ayarlar, cached() sıfırlar).
 * Yatay ve dikey kuyruk buna göre yukarı taşınır: model tanımlarındaki kuyruk yükseklikleri eksene göre kalır.
 */
let tailLift: (z: number) => number = () => 0;

function box(w: number, h: number, l: number, x: number, y: number, z: number): Geo {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, z);
  return g;
}

const mirror = (x: number, make: (x: number) => Geo) => [make(x), make(-x)];

/**
 * Kanopi çerçeveleri: canopy() üretir, model kurulduktan sonra koyu parçalara eklenir (her model tanımına ayrı ayrı
 * eklemek gerekmesin). cached() her model için boşaltır.
 */
let frameSink: Geo[] = [];
/** Kanopiler ve dikey kuyruk tepeleri (pilot, anten direği ve teli için); cached() her model için boşaltır. */
interface CanopyRec { z: number; len: number; h: number; y: number; w: number; bubble: boolean }
/** Dikey kuyruk: uç x'i, tepe ve kök yüksekliği, tepe noktasının z'si, orta yükseklikte veter ortası ve veter. */
interface FinRec { x: number; yTop: number; yRoot: number; zTop: number; zMid: number; chordMid: number }
let canopySink: CanopyRec[] = [];
let finSink: FinRec[] = [];

/** Menteşe aralığı (veter oranı): ana yüzeyle kumanda yüzeyi arasında ince çizgi. */
const HINGE_GAP = 0.005;

/** Sivrilen yüzeyin açıklık oranı f'deki kesiti (wing() ile aynı biçim); side +1 sol (+x), −1 sağ. */
function taperSec(w: WingOpts, f: number, side: number): Section {
  const span = w.tipX - w.x0;
  return {
    le: new THREE.Vector3(side * (w.x0 + span * f), w.y + tailLift(w.z - w.root * 0.5) + span * f * tanD(w.dihedral), w.z - w.sweep * f),
    c: w.root + (w.tip - w.root) * f,
    t: w.t * (1 - 0.55 * f),
  };
}

/** Kesitin veterin x'indeki orta çizgi noktası (menteşe). */
function chordPt(s: Section, thick: THREE.Vector3, x: number): THREE.Vector3 {
  const h = s.t * 0.12 * Math.sin(Math.PI * x);
  return new THREE.Vector3(s.le.x + thick.x * h, s.le.y + thick.y * h, s.le.z - s.c * x + thick.z * h);
}

/**
 * Menteşe aralığının ortasında koyu şerit: aralıktan arkası (gök) görünmesin, menteşe ince koyu çizgi olsun. Yüzey
 * kesitleri boyunca, iki yüzü de dolu.
 */
function hingeStrip(secs: Section[], thick: THREE.Vector3, xh: number): Geo {
  const pos: number[] = [];
  const put = (...ps: THREE.Vector3[]) => {
    for (const p of ps) pos.push(p.x, p.y, p.z);
  };
  for (let i = 0; i < secs.length - 1; i++) {
    const a = chordPt(secs[i], thick, xh);
    const b = chordPt(secs[i], thick, xh + HINGE_GAP);
    const c = chordPt(secs[i + 1], thick, xh);
    const d = chordPt(secs[i + 1], thick, xh + HINGE_GAP);
    put(a, b, c, c, b, d, a, c, b, c, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return tag(g, 'dark');
}

/**
 * Kumanda yüzeyli kanat ya da yatay kuyruk (iki yan). parts: açıklık parçaları [f0, f1, ad]: adlı parçada veterin
 * xh'tan arkası eklem (ad + 'L' sol/+x, 'R'; menteşe ekseni iki yanda da +x'e bakar, pozitif açı firar kenarını
 * kaldırır), önü sabit; ad null ise tam veter (kumanda yüzeyleri arası, uç). İki parça aynı profilden kesilir.
 * roundTip: uçta düz kapak yerine yuvarlanan parça, boyu katsayıyla (son f = 1 olmalı; 0 düz kapak).
 */
function controlWing(w: WingOpts, xh: number, parts: [number, number, string | null][], roundTip = 0): Geo[] {
  const up = new THREE.Vector3(0, 1, 0);
  const out: Geo[] = [];
  for (const s of [1, -1]) {
    for (const [f0, f1, name] of parts) {
      const secs = [taperSec(w, f0, s), taperSec(w, f1, s)];
      if (!name) {
        out.push(airfoilPart(secs, up, 0, 1));
        continue;
      }
      out.push(airfoilPart(secs, up, 0, xh), hingeStrip(secs, up, xh));
      const a = chordPt(secs[0], up, xh + HINGE_GAP);
      const ax = chordPt(secs[1], up, xh + HINGE_GAP).sub(a).multiplyScalar(s);
      out.push(...joint(`${name}${s > 0 ? 'L' : 'R'}`, [a.x, a.y, a.z], [airfoilPart(secs, up, xh + HINGE_GAP, 1)], true, [ax.x, ax.y, ax.z]));
    }
    if (roundTip) {
      const t = taperSec(w, 1, s);
      // Uç kesitinden dışa: veter hücum kenarından da firar kenarından da kısalır, kalınlık incelir
      const cap = ([dx, cm, back, tm]: number[]): Section => ({
        le: new THREE.Vector3(t.le.x + s * dx * roundTip * t.c, t.le.y, t.le.z - t.c * back), c: t.c * cm, t: t.t * tm,
      });
      out.push(airfoilPart([t, ...[[0.018, 0.96, 0.012, 0.86], [0.04, 0.86, 0.05, 0.66], [0.056, 0.68, 0.13, 0.44], [0.066, 0.4, 0.27, 0.22]].map(cap)], up, 0, 1));
    }
  }
  return out;
}

/** Dikey kuyruk kesiti (fins() ile aynı biçim): yükseklik oranı k, veter ve kalınlık çarpanı, uçta geri kayma. */
function finSec(f: Fin, k: number, cm = 1, back = 0, tm = 1): Section {
  const y0 = f.y0 + tailLift(f.z0 - f.root * 0.5);
  return { le: new THREE.Vector3(0, y0 - 0.25 + (f.h + 0.25) * k, f.z0 - f.sweep * k - f.tip * back), c: (f.root + (f.tip - f.root) * k) * cm, t: f.t * (1 - 0.5 * k) * tm };
}

/**
 * İstikamet dümenli dikey kuyruk (ortada, tek): [k0, k1] yükseklik aralığında veterin xh'tan arkası 'rudder' eklemi
 * (menteşe ekseni yukarı), altı ve yuvarlak tepesi tam veter. Arma ve anten yerleri için finSink'e yazar.
 */
function controlFin(f: Fin, xh: number, k0: number, k1: number): Geo[] {
  const side = new THREE.Vector3(1, 0, 0);
  const y0 = f.y0 + tailLift(f.z0 - f.root * 0.5);
  const chordMid = (f.root + f.tip) / 2;
  finSink.push({ x: 0, yTop: y0 + f.h, yRoot: y0, zTop: f.z0 - f.sweep - f.tip * 0.35, zMid: f.z0 - f.sweep * 0.5 - chordMid * 0.5, chordMid });
  const a = finSec(f, k0);
  const b = finSec(f, k1);
  const h0 = chordPt(a, side, xh + HINGE_GAP);
  const ax = chordPt(b, side, xh + HINGE_GAP).sub(h0);
  return [
    airfoilPart([finSec(f, 0), a], side, 0, 1),
    airfoilPart([a, b], side, 0, xh),
    hingeStrip([a, b], side, xh),
    ...joint('rudder', [h0.x, h0.y, h0.z], [airfoilPart([a, b], side, xh + HINGE_GAP, 1)], true, [ax.x, ax.y, ax.z]),
    airfoilPart([b, finSec(f, 0.965, 0.88, 0.05, 0.85), finSec(f, 1, 0.6, 0.18, 0.6)], side, 0, 1),
  ];
}

/**
 * Çizimden alınan dikey kuyruk (ortada, tek): yükseklik başına [y, hücum kenarı z, veter], alttan üste (ilk kesit
 * gövdeye gömülü). [i0, i1] kesitleri arasında veterin xh'tan arkası 'rudder' eklemi. Kalınlık tepeye doğru incelir.
 */
function jetFin(raw: [number, number, number][], t: number, xh: number, r0: number, r1: number, x = 0, rudder = 'rudder', lean = 0, yRef = 0): Geo[] {
  const side = new THREE.Vector3(1, 0, 0);
  // Yüksek ayrıntıda kesitler yumuşar (kenar köşeli kalmasın); dümen sınırları en yakın kesite
  const list = (DETAIL ? chaikinN(raw, 2) : raw) as [number, number, number][];
  const near = (y: number) => list.reduce((b, q, i) => (Math.abs(q[0] - y) < Math.abs(list[b][0] - y) ? i : b), 0);
  const i0 = near(raw[r0][0]);
  const i1 = near(raw[r1][0]);
  const y0 = list[0][0];
  const top = list[list.length - 1];
  const mid = list[Math.floor(list.length / 2)];
  finSink.push({ x, yTop: top[0], yRoot: list[1][0], zTop: top[1] - top[2] * 0.35, zMid: mid[1] - mid[2] * 0.5, chordMid: mid[2] });
  const secs: Section[] = list.map(([y, le, c]) => ({ le: new THREE.Vector3(x + lean * (y - yRef), y, le), c, t: t * (1 - (0.6 * (y - y0)) / (top[0] - y0)) }));
  const span = secs.slice(i0, i1 + 1);
  const h0 = chordPt(secs[i0], side, xh + HINGE_GAP);
  const ax = chordPt(secs[i1], side, xh + HINGE_GAP).sub(h0);
  return [
    airfoilPart(secs.slice(0, i0 + 1), side, 0, 1),
    airfoilPart(span, side, 0, xh),
    hingeStrip(span, side, xh),
    ...joint(rudder, [h0.x, h0.y, h0.z], [airfoilPart(span, side, xh + HINGE_GAP, 1)], true, [ax.x, ax.y, ax.z]),
    airfoilPart(secs.slice(i1), side, 0, 1),
  ];
}

/** Lastikli tekerlek (aks X ekseninde): yuvarlak omuzlu lastik, jant, göbek. */
function wheelParts(r: number, w: number, x: number, y: number, z: number): Geo[] {
  const prof: [number, number][] = [[r * 0.6, w * 0.46], [r * 0.84, w * 0.5], [r * 0.96, w * 0.38], [r, w * 0.12], [r, -w * 0.12], [r * 0.96, -w * 0.38], [r * 0.84, -w * 0.5], [r * 0.6, -w * 0.46]];
  return [
    new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), sg(18)).rotateZ(Math.PI / 2).translate(x, y, z),
    new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 0.86, sg(14)).rotateZ(Math.PI / 2).translate(x, y, z),
    new THREE.CylinderGeometry(r * 0.22, r * 0.28, w * 1.1, sg(10)).rotateZ(Math.PI / 2).translate(x, y, z),
  ];
}

/**
 * MiG-15 iniş takımı (katlanır, eklemli). Ana bacaklar kanat kökünde, içe (gövdenin içine) toplanır; burun bacağı öne,
 * burnun içine. Her bacakta amortisör silindiri ve krom piston, makas bağlantısı, aks, lastikli tekerlek ve bacakla
 * dönen kapak (toplanınca altta kalır, yuvayı örter). Tekerlek altları yer çizgisinde (−gh).
 */
function migGear(gh: number): Geo[] {
  const out: Geo[] = [];
  const cyl = (r: number, y0: number, y1: number, x: number, z: number) => new THREE.CylinderGeometry(r, r, y0 - y1, sg(10)).translate(x, (y0 + y1) / 2, z);
  const bar = (a: V3, b: V3, w: number) => rod(new THREE.Vector3(...a), new THREE.Vector3(...b), w, 6);
  const RW = 0.33;
  for (const s of [1, -1]) {
    const x = s * 1.55;
    const z = -0.45;
    const top = -0.12;
    const axle = -gh + RW;
    const parts = [
      cyl(0.075, top, -0.95, x, z),
      cyl(0.052, -0.9, axle + 0.04, x, z),
      new THREE.CylinderGeometry(0.045, 0.045, 0.2, sg(8)).rotateZ(Math.PI / 2).translate(x - s * 0.1, axle, z),
      bar([x, -0.92, z - 0.06], [x, -1.18, z - 0.17], 0.022),
      bar([x, -1.18, z - 0.17], [x, axle + 0.05, z - 0.05], 0.022),
      bar([x, -0.7, z], [x - s * 0.4, -0.16, z + 0.04], 0.03),
      ...wheelParts(RW, 0.16, x - s * 0.17, axle, z),
    ];
    // Kapak gövde boyasında (gümüş), bacak ve tekerlek koyu
    const door = new THREE.BoxGeometry(0.025, 0.85, 0.42).translate(x + s * 0.11, -0.62, z);
    out.push(...joint(s > 0 ? 'takimL' : 'takimR', [x, top, z], [...parts.map((g) => tag(g, 'dark')), door], false, [0, 0, 1]));
  }
  const NR = 0.24;
  const nz = 2.35;
  const ntop = -0.4;
  const naxle = -gh + NR;
  const nose = [
    cyl(0.06, ntop, -0.8, 0, nz),
    cyl(0.044, -0.75, -1.0, 0, nz),
    new THREE.BoxGeometry(0.3, 0.07, 0.12).translate(0, -1.02, nz),
    ...[1, -1].map((s) => new THREE.BoxGeometry(0.03, -1.02 - naxle + 0.04, 0.1).translate(s * 0.11, (-1.02 + naxle) / 2, nz)),
    new THREE.CylinderGeometry(0.03, 0.03, 0.26, sg(8)).rotateZ(Math.PI / 2).translate(0, naxle, nz),
    ...wheelParts(NR, 0.13, 0, naxle, nz),
  ];
  const nDoor = new THREE.BoxGeometry(0.36, 0.6, 0.025).translate(0, -0.7, nz - 0.13);
  out.push(...joint('takimN', [0, ntop, nz], [...nose.map((g) => tag(g, 'dark')), nDoor], false, [1, 0, 0]));
  return out;
}

/** MiG-15 gövde çizgisi [z, yarıçap] (dudak içinden kuyruğa) ve kesitin yükseklik oranı. */
const MIG_SKIN: [number, number][] = [
  [4.36, 0.405], [4.48, 0.42], [4.55, 0.45], [4.54, 0.485], [4.47, 0.51], [4.3, 0.545], [3.8, 0.6], [3.0, 0.665], [2.0, 0.72],
  [1.0, 0.74], [0.0, 0.735], [-1.0, 0.705], [-2.0, 0.65], [-3.0, 0.575], [-4.0, 0.49], [-4.7, 0.425], [-5.08, 0.39], [-5.12, 0.37],
];
const MIG_SY = 1.08;
/** Hava freni kapağı: ön kenar z, boy, yükseklik, orta y. */
const MIG_BRAKE = { zf: -2.85, len: 0.85, h: 0.55, y: 0.05 };

/** Gövdenin z'deki yarıçapı (dış çizgiden). */
function migRadius(z: number): number {
  for (let i = 3; i < MIG_SKIN.length - 1; i++) {
    const [z0, r0] = MIG_SKIN[i];
    const [z1, r1] = MIG_SKIN[i + 1];
    if (z <= z0 && z >= z1) return r0 + ((z - z0) / (z1 - z0)) * (r1 - r0);
  }
  return MIG_SKIN[MIG_SKIN.length - 1][1];
}

/**
 * Gövde yüzeyine oturan kavisli yama (hava freni kapağı ve yuvası): s yanında, z ve y aralığında. off: yüzeyden dışarı
 * pay; inner verilirse iç yüzü ve kenarları da kurulur (kalınlıklı kapak, açılınca içi de görünür).
 */
function brakeShell(s: number, z0: number, z1: number, y0: number, y1: number, off: number, inner: number | null): Geo {
  const NZ = sg(4);
  const NY = sg(3);
  const at = (i: number, j: number, o: number): V3 => {
    const z = z0 + ((z1 - z0) * i) / NZ;
    const y = y0 + ((y1 - y0) * j) / NY;
    const r = migRadius(z);
    return [s * (Math.sqrt(Math.max(r * r - (y / MIG_SY) ** 2, 0.01)) + o), y, z];
  };
  const pos: number[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3, want: V3) => {
    const n = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
    const flip = n.dot(new THREE.Vector3(...want)) < 0;
    const list = flip ? [a, c, b, b, c, d] : [a, b, c, c, b, d];
    for (const p of list) pos.push(...p);
  };
  for (let i = 0; i < NZ; i++) {
    for (let j = 0; j < NY; j++) {
      quad(at(i, j, off), at(i + 1, j, off), at(i, j + 1, off), at(i + 1, j + 1, off), [s, 0, 0]);
      if (inner !== null) quad(at(i, j, inner), at(i + 1, j, inner), at(i, j + 1, inner), at(i + 1, j + 1, inner), [-s, 0, 0]);
    }
  }
  if (inner !== null) {
    for (let i = 0; i < NZ; i++) {
      quad(at(i, 0, off), at(i + 1, 0, off), at(i, 0, inner), at(i + 1, 0, inner), [0, -1, 0]);
      quad(at(i, NY, off), at(i + 1, NY, off), at(i, NY, inner), at(i + 1, NY, inner), [0, 1, 0]);
    }
    for (let j = 0; j < NY; j++) {
      quad(at(0, j, off), at(0, j + 1, off), at(0, j, inner), at(0, j + 1, inner), [0, 0, 1]);
      quad(at(NZ, j, off), at(NZ, j + 1, off), at(NZ, j, inner), at(NZ, j + 1, inner), [0, 0, -1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * MiG-15 gövdesi: yuvarlak dudaklı burun hava girişi, içinde kanal, ortada dikey ayırıcı, dipte kompresör yüzü ve
 * göbeği; arkaya incelen gövde, kuyrukta egzoz borusu, türbin yüzü ve göbeği. Kesit biraz yüksek. Profil çizgileri dış
 * yüzde burundan kuyruğa, kanal ve borunun içinde ters yönde (yüzleri içe bakar).
 */
function migFuselage(): Geo[] {
  const sy = MIG_SY;
  const skin = MIG_SKIN;
  const { zf, len, h, y } = MIG_BRAKE;
  // Hava freni yuvası: kapağın altında koyu, gövdeye oturan kavisli yama. Kapaktan küçük: kapalıyken görünmez, uzakta
  // kesik kesik çizgi vermez; kapak açılınca ortaya çıkar.
  const wells = [1, -1].map((s) => tag(brakeShell(s, zf - 0.02, zf - len + 0.02, y - h / 2 + 0.02, y + h / 2 - 0.02, 0.004, null), 'dark'));
  const disc = (r: number, z: number, back: boolean) => {
    const g = new THREE.CircleGeometry(r, sg(14)).scale(1, sy, 1);
    if (back) g.rotateY(Math.PI);
    return tag(g.translate(0, 0, z), 'dark');
  };
  const hubCone = (r: number, len: number, z: number, dir: number) =>
    tag(new THREE.ConeGeometry(r, len, sg(10)).rotateX((dir * Math.PI) / 2).translate(0, 0, z + (dir * len) / 2), 'dark');
  return [
    ...wells,
    body(skin, 12, { sy, smooth: true }),
    tag(body([[3.9, 0.376], [4.1, 0.388], [4.36, 0.405]], 12, { sy }), 'dark'),
    disc(0.377, 3.9, false),
    hubCone(0.12, 0.26, 3.9, 1),
    new THREE.BoxGeometry(0.04, 0.8, 0.6).translate(0, 0, 4.2),
    tag(body([[-5.12, 0.37], [-5.06, 0.35], [-4.75, 0.336]], 12, { sy }), 'dark'),
    disc(0.337, -4.75, true),
    hubCone(0.13, 0.3, -4.75, -1),
  ];
}

// ---------------------------------------------------------------- çizimden kurulan jetler (F-84, F-86)

/** Gövde kesiti: z, yarı en, üst çizgi y, alt çizgi y, en geniş yerin y'si (kesit yumurta: üst ve alt yarı ayrı). */
type JetSec = [number, number, number, number, number];

const spow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

/**
 * Üç görünüş çiziminden alınmış kesitlerle yüzey (gövde, kanopi, kanal). Kesitler sırayla bağlanır: z azalırken yüz
 * dışa, artarken içe bakar; böylece hava girişi kanalın içinden başlayıp dudağı dönerek gövdeye geçebilir. Yüksek
 * ayrıntıda kesitler Chaikin ile yumuşar. p: kesit dolgunluğu (2 elips, büyüdükçe kare); pTop: üst yarının ayrı
 * dolgunluğu (2'nin altı sivrilir: Me 262'nin üçgen kesiti).
 */
class JetHull {
  readonly secs: JetSec[];
  /** Dış yüzey: en öndeki kesitten kuyruğa (z azalan). */
  private readonly outer: JetSec[];

  constructor(raw: JetSec[], private readonly p = 2.2, smooth = true, private readonly pTop = p) {
    this.secs = (DETAIL && smooth ? chaikinN(raw, 2) : raw) as JetSec[];
    let nose = 0;
    this.secs.forEach((s, i) => {
      if (s[0] > this.secs[nose][0]) nose = i;
    });
    this.outer = this.secs.slice(nose);
  }

  /** Dış yüzeyin z'deki kesiti. */
  at(z: number): JetSec {
    const o = this.outer;
    for (let i = 0; i < o.length - 1; i++) {
      if (z <= o[i][0] && z >= o[i + 1][0]) {
        const k = (o[i][0] - z) / (o[i][0] - o[i + 1][0] || 1);
        return o[i].map((v, j) => v + (o[i + 1][j] - v) * k) as JetSec;
      }
    }
    return z > o[0][0] ? o[0] : o[o.length - 1];
  }

  /** Kesit halkasının a açısındaki noktası [x, y] (0 +x yanı, π/2 üst); off: yüzeyden dışarı pay. */
  ring(s: JetSec, a: number, off = 0): [number, number] {
    const [, w, top, bot, wy] = s;
    const sn = Math.sin(a);
    const e = 2 / (sn >= 0 ? this.pTop : this.p);
    const x = w * spow(Math.cos(a), e);
    const y = (sn >= 0 ? top - wy : wy - bot) * spow(sn, e);
    const k = 1 + off / (Math.hypot(x, y) || 1);
    return [x * k, wy + y * k];
  }

  /** Dış yüzey noktası (s: yan, −1'de x aynalı). */
  pt(z: number, a: number, off = 0, s = 1): V3 {
    const [x, y] = this.ring(this.at(z), a, off);
    return [s * x, y, z];
  }

  /** Bütün yüzey. caps: birinci ve son kesite kapak. */
  geo(seg: number, caps: [boolean, boolean] = [false, false]): Geo {
    const n = sg(seg);
    const list = this.secs;
    const pos: number[] = [];
    for (const s of list) {
      for (let k = 0; k < n; k++) {
        const [x, y] = this.ring(s, (k / n) * Math.PI * 2);
        pos.push(x, y, s[0]);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < list.length - 1; i++) {
      for (let k = 0; k < n; k++) {
        const a = i * n + k;
        const b = (i + 1) * n + k;
        const a1 = i * n + ((k + 1) % n);
        const b1 = (i + 1) * n + ((k + 1) % n);
        idx.push(a, b, a1, a1, b, b1);
      }
    }
    const cap = (i: number, front: boolean) => {
      const s = list[i];
      const ci = pos.length / 3;
      pos.push(0, (s[2] + s[3]) / 2, s[0]);
      for (let k = 0; k < n; k++) {
        const a = i * n + k;
        const a1 = i * n + ((k + 1) % n);
        idx.push(...(front ? [ci, a, a1] : [ci, a1, a]));
      }
    };
    if (caps[0]) cap(0, true);
    if (caps[1]) cap(list.length - 1, false);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** Kesitin z'deki düz kapağı (kanal ve boru dibi); facing: bakış yönü (+1 burna, −1 kuyruğa). */
  disc(z: number, facing: number, seg: number): Geo {
    const s = this.at(z);
    const n = sg(seg);
    const pos: number[] = [];
    for (let k = 0; k < n; k++) {
      const [x0, y0] = this.ring(s, (k / n) * Math.PI * 2);
      const [x1, y1] = this.ring(s, ((k + 1) / n) * Math.PI * 2);
      const c: V3 = [0, (s[2] + s[3]) / 2, z];
      if (facing > 0) pos.push(...c, x0, y0, z, x1, y1, z);
      else pos.push(...c, x1, y1, z, x0, y0, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * Gövdeye oturan kavisli yama: z aralığı, açı aralığı (ring ile aynı), yüzeyden pay. inner verilirse iç yüzü ve
   * kenarları da kurulur (kalınlıklı kapak, açılınca içi de görünür). Dış yüz pürüzsüz, kenarlar köşeli.
   */
  patch(s: number, z0: number, z1: number, a0: number, a1: number, off: number, inner: number | null = null): Geo {
    const NZ = sg(3);
    const NA = sg(3);
    const at = (i: number, j: number, o: number) => this.pt(z0 + ((z1 - z0) * i) / NZ, a0 + ((a1 - a0) * j) / NA, o, s);
    const [mx, my] = this.ring(this.at((z0 + z1) / 2), (a0 + a1) / 2);
    const out = new THREE.Vector3(s * mx, my - this.at((z0 + z1) / 2)[4], 0);
    const pos: number[] = [];
    const face: number[] = [];
    const quad = (list: number[], a: V3, b: V3, c: V3, d: V3, want: THREE.Vector3) => {
      const n = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
      for (const p of n.dot(want) < 0 ? [a, c, b, b, c, d] : [a, b, c, c, b, d]) list.push(...p);
    };
    for (let i = 0; i < NZ; i++) {
      for (let j = 0; j < NA; j++) {
        quad(face, at(i, j, off), at(i + 1, j, off), at(i, j + 1, off), at(i + 1, j + 1, off), out);
        if (inner !== null) quad(pos, at(i, j, inner), at(i + 1, j, inner), at(i, j + 1, inner), at(i + 1, j + 1, inner), out.clone().negate());
      }
    }
    if (inner !== null) {
      const along = new THREE.Vector3(0, 0, Math.sign(z0 - z1));
      for (let j = 0; j < NA; j++) {
        quad(pos, at(0, j, off), at(0, j + 1, off), at(0, j, inner), at(0, j + 1, inner), along);
        quad(pos, at(NZ, j, off), at(NZ, j + 1, off), at(NZ, j, inner), at(NZ, j + 1, inner), along.clone().negate());
      }
      for (let i = 0; i < NZ; i++) {
        const e0 = new THREE.Vector3(...at(i, 0, off)).sub(new THREE.Vector3(...at(i, 1, off)));
        const e1 = new THREE.Vector3(...at(i, NA, off)).sub(new THREE.Vector3(...at(i, NA - 1, off)));
        quad(pos, at(i, 0, off), at(i + 1, 0, off), at(i, 0, inner), at(i + 1, 0, inner), e0);
        quad(pos, at(i, NA, off), at(i + 1, NA, off), at(i, NA, inner), at(i + 1, NA, inner), e1);
      }
    }
    // Dış yüzün normalleri komşu dörtgenlerde ortak (pürüzsüz); gövde eğrisini izler
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(face, 3));
    const smooth = toCreasedNormals(fg, Math.PI / 3);
    if (!pos.length) return smooth;
    const rest = new THREE.BufferGeometry();
    rest.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rest.computeVertexNormals();
    return mergeGeometries([smooth, rest], false)!;
  }

  /** Yan yüzeyde y yüksekliğindeki x (silah ağızları için). */
  sideX(z: number, y: number): number {
    const [, w, top, bot, wy] = this.at(z);
    const h = y >= wy ? top - wy : wy - bot;
    const e = 2 / (y >= wy ? this.pTop : this.p);
    const sn = Math.min(0.999, Math.abs(y - wy) / h) ** (1 / e);
    return w * Math.sqrt(1 - sn * sn) ** e;
  }

  /** Üst yüzeyde yanal x'teki y. */
  topY(z: number, x: number): number {
    const [, w, top, , wy] = this.at(z);
    const e = 2 / this.pTop;
    const c = Math.min(0.999, Math.abs(x) / w) ** (1 / e);
    return wy + (top - wy) * Math.sqrt(1 - c * c) ** e;
  }
}

/** Kanat çiti: üst yüzde, hücum kenarından veterin üçte birine, ince levha; arkaya doğru yüzeye iner. */
function wingFence(x: number, s: Section): Geo {
  const top = (k: number) => s.t * nacaT(k) + s.t * 0.12 * Math.sin(Math.PI * k);
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.02);
  for (const k of [0, 0.03, 0.08, 0.14, 0.21, 0.28, 0.34]) sh.lineTo(s.c * k, top(k) + 0.07 * (1 - (k / 0.34) ** 3));
  sh.lineTo(s.c * 0.34, -0.02);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false });
  return g.rotateY(Math.PI / 2).translate(x - 0.006, s.le.y, s.le.z);
}

/** Gövdeye gömülü oval ağız (silah ağzı): boyuna uzun, koyu, yüzeyden hafif kabarık. */
const portAt = (x: number, y: number, z: number, h: number, l: number) =>
  tag(new THREE.SphereGeometry(1, sg(3), sg(2)).scale(0.018, h, l).translate(x, y, z), 'dark');

/**
 * Gövde yanı hava girişi (iki yan): kanaldan dudağa dönüp arkaya kanat köküne inen çıkıntı, içinde koyu kanal. rake:
 * ağız eğimi (üst dudak bu kadar geride; birim yükseklik başına), z0'ın gerisine etki etmez. İç yarısı gövdeye gömülür.
 */
function sideIntake(x: number, secs: JetSec[], duct: JetSec[], rake: number, z0: number): Geo[] {
  const zf = Math.max(...secs.map((q) => q[0]));
  const yc = secs[0][4];
  const shear = (g: Geo) => {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const k = Math.min(1, Math.max(0, (p.getZ(i) - z0) / (zf - z0)));
      p.setZ(i, p.getZ(i) - rake * (p.getY(i) - yc) * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const dh = new JetHull(duct, 2.1, false);
  return [1, -1].flatMap((sd) => [
    shear(new JetHull(secs, 2.1).geo(10)).translate(sd * x, 0, 0),
    tag(shear(dh.geo(10)).translate(sd * x, 0, 0), 'dark'),
    tag(shear(dh.disc(duct[0][0], 1, 10)).translate(sd * x, 0, 0), 'dark'),
  ]);
}

/**
 * Damla kanopi: öndeki köşeli ön cam, sürgülü kapağın kavisli camı, arkasında gövdeye inen metal bitiş. Çerçeveler
 * (ön cam dikmeleri ve kavisi, kapakta verilen z'ler) koyu, cam kesitinin biraz dışında. Pilot ve gösterge paneli
 * cached()'te canopySink'teki kayda göre yerleşir.
 */
function jetCanopy(o: {
  screen: JetSec[]; glass: JetSec[]; aft: JetSec[]; frames: number[]; posts: [V3, V3];
  pilot: { z: number; len: number; h: number; y: number; w: number };
}): Geo[] {
  canopySink.push({ ...o.pilot, bubble: true });
  const hull = new JetHull(o.glass, 2.1);
  const band = (z: number) => {
    const s = hull.at(z);
    const grow = ([zz, w, t, b, wy]: JetSec): JetSec => [zz, w + 0.012, t + 0.012, b, wy];
    return tag(new JetHull([grow([z + 0.02, s[1], s[2], s[3], s[4]]), grow([z - 0.02, s[1], s[2], s[3], s[4]])], 2.1, false).geo(10), 'dark');
  };
  return [
    tag(new JetHull(o.screen, 3.2, false).geo(10, [true, false]), 'glass'),
    tag(hull.geo(10), 'glass'),
    new JetHull(o.aft, 2.1).geo(10, [false, true]),
    ...o.frames.map(band),
    ...[1, -1].map((s) => tag(rod(new THREE.Vector3(s * o.posts[0][0], o.posts[0][1], o.posts[0][2]), new THREE.Vector3(s * o.posts[1][0], o.posts[1][1], o.posts[1][2]), 0.013, 5), 'dark')),
  ];
}

/** Bacağa ya da gövdeye bağlı ince kapak (düzlemi x'e dik): z'de w geniş, alt köşeleri yuvarlak, gövde boyasında. */
function gearDoor(x: number, yTop: number, yBot: number, z: number, w: number, r: number): Geo {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, yTop);
  sh.lineTo(w / 2, yTop);
  sh.lineTo(w / 2, yBot + r);
  sh.quadraticCurveTo(w / 2, yBot, w / 2 - r, yBot);
  sh.lineTo(-w / 2 + r, yBot);
  sh.quadraticCurveTo(-w / 2, yBot, -w / 2, yBot + r);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.024, bevelEnabled: false, curveSegments: sg(2) });
  return g.rotateY(Math.PI / 2).translate(x - 0.012, 0, z);
}

interface JetGearOpts {
  /** Ana bacak: x, z, üst ucu (menteşe) y, aks y, tekerlek yarıçapı ve genişliği, tekerleğin bacağa göre içe kayması; out: dışa katlanır. */
  main: { out?: boolean; x: number; z: number; top: number; axle: number; rw: number; tw: number; dx: number; door: { dx: number; top: number; bot: number; w: number; r: number } };
  /** Burun bacağı: menteşe (üst uç) y ve z, aks y ve z, tekerlek; öne bakan küçük kapak (varsa). */
  nose: { topY: number; topZ: number; axle: number; z: number; rw: number; tw: number; door?: { top: number; bot: number; w: number } };
  /** Burun takımı yuvasının boyuna iki kapağı: menteşe x'i ve y'si, z aralığı, yükseklik. */
  belly: { x: number; y: number; z0: number; z1: number; h: number };
}

/**
 * Katlanır takım (F-84, F-86): ana bacaklar içe, burun bacağı arkaya toplanır. Bacakta amortisör silindiri, krom
 * piston, makas, yan destek, aks ve lastikli tekerlek; bacakla dönen kapak gövde boyasında. Burun yuvasının iki kapağı
 * kendi eklemlerinde (kapakL, kapakR), takım toplanınca kapanır.
 */
function jetGear(o: JetGearOpts): Geo[] {
  const out: Geo[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const { main: m, nose: n, belly: b } = o;
  for (const s of [1, -1]) {
    const x = s * m.x;
    const low = m.axle + 0.44;
    const parts = [
      rod(v(x, m.top, m.z), v(x, low, m.z), 0.072, 8),
      rod(v(x, low + 0.04, m.z), v(x, m.axle + 0.01, m.z), 0.046, 8),
      rod(v(x, m.axle, m.z), v(x - s * (m.dx + m.tw * 0.55), m.axle, m.z), 0.04, 6),
      rod(v(x, low - 0.02, m.z - 0.05), v(x, low - 0.22, m.z - 0.16), 0.02, 4),
      rod(v(x, low - 0.22, m.z - 0.16), v(x, m.axle + 0.05, m.z - 0.05), 0.02, 4),
      rod(v(x, low + 0.1, m.z), v(x - s * 0.42, m.top + 0.03, m.z + 0.06), 0.028, 5),
      ...wheelParts(m.rw, m.tw, x - s * m.dx, m.axle, m.z),
    ];
    const door = gearDoor(x + s * m.door.dx, m.door.top, m.door.bot, m.z, m.door.w, m.door.r);
    out.push(...joint(s > 0 ? 'takimL' : 'takimR', [x, m.top, m.z], [...parts.map((g) => tag(g, 'dark')), door], false, [0, 0, m.out ? -1 : 1]));
  }
  // Burun bacağı: üst ucu arkada, tekerlek önde (eğik); menteşe ekseni −x: pozitif açı tekerleği arkaya toplar
  const top = v(0, n.topY, n.topZ);
  const axle = v(0, n.axle, n.z);
  const along = (k: number) => top.clone().lerp(axle, k);
  const crown = along(0.9);
  const fork = n.tw * 0.62;
  const nose = [
    rod(top, along(0.52), 0.06, 8),
    rod(along(0.48), crown, 0.04, 8),
    rod(crown.clone().setX(-0.03), crown.clone().setX(fork), 0.03, 5),
    rod(crown.clone().setX(fork), axle.clone().setX(fork), 0.026, 5),
    rod(axle.clone().setX(-fork * 0.4), axle.clone().setX(fork), 0.026, 5),
    rod(along(0.5).add(v(0, 0, -0.05)), along(0.68).add(v(0, 0, -0.14)), 0.016, 4),
    rod(along(0.68).add(v(0, 0, -0.14)), along(0.88).add(v(0, 0, -0.04)), 0.016, 4),
    ...wheelParts(n.rw, n.tw, 0, n.axle, n.z),
  ];
  const noseDoor = n.door
    ? [new THREE.BoxGeometry(n.door.w, n.door.top - n.door.bot, 0.024).translate(0, (n.door.top + n.door.bot) / 2, n.topZ + 0.09)]
    : [];
  out.push(...joint('takimN', [0, n.topY, n.topZ], [...nose.map((g) => tag(g, 'dark')), ...noseDoor], false, [-1, 0, 0]));
  for (const s of [1, -1]) {
    const z = (b.z0 + b.z1) / 2;
    // Açıkken dışa biraz yatık
    const door = gearDoor(s * b.x, b.y, b.y - b.h, z, b.z0 - b.z1, 0.09).translate(-s * b.x, -b.y, 0).rotateZ(s * 0.4).translate(s * b.x, b.y, 0);
    out.push(...joint(s > 0 ? 'kapakL' : 'kapakR', [s * b.x, b.y, z], [door], false, [0, 0, 1]));
  }
  return out;
}

/** F-86F takımı: dar iz (2,25 m), kısa ana bacak, tekerlek bacağın içinde, burun tekerleği hava girişinin altında. */
function sabreGear(gh: number): Geo[] {
  return jetGear({
    main: { x: 1.33, z: -0.12, top: -0.55, axle: -gh + 0.34, rw: 0.34, tw: 0.17, dx: 0.2, door: { dx: 0.09, top: -0.62, bot: -1.2, w: 0.25, r: 0.07 } },
    nose: { topY: -0.6, topZ: 4.32, axle: -gh + 0.24, z: 4.65, rw: 0.24, tw: 0.15, door: { top: -0.72, bot: -1.08, w: 0.36 } },
    belly: { x: 0.24, y: -0.74, z0: 4.2, z1: 3.2, h: 0.2 },
  });
}

/** F-84G takımı: geniş iz (5,4 m), bacak kanattan iner ve tekerleği örten büyük kapak, eğik uzun burun bacağı. */
function thunderjetGear(gh: number): Geo[] {
  return jetGear({
    main: { x: 2.78, z: -0.54, top: -0.22, axle: -gh + 0.36, rw: 0.36, tw: 0.2, dx: 0.06, door: { dx: 0.13, top: -0.24, bot: -1.16, w: 0.78, r: 0.28 } },
    nose: { topY: -0.38, topZ: 4.5, axle: -gh + 0.25, z: 4.98, rw: 0.25, tw: 0.14 },
    belly: { x: 0.3, y: -0.6, z0: 4.25, z1: 2.85, h: 0.24 },
  });
}

/** F-80C takımı: 2,65 m iz, geniş kapaklı ana bacak, burun tekerleği kokpitin önünde. */
function shootingStarGear(gh: number): Geo[] {
  return jetGear({
    main: { x: 1.33, z: -0.21, top: -0.35, axle: -gh + 0.345, rw: 0.345, tw: 0.18, dx: 0.08, door: { dx: 0.12, top: -0.42, bot: -1.0, w: 0.66, r: 0.16 } },
    nose: { topY: -0.46, topZ: 3.25, axle: -gh + 0.28, z: 3.37, rw: 0.28, tw: 0.15 },
    belly: { x: 0.24, y: -0.58, z0: 3.3, z1: 2.35, h: 0.2 },
  });
}

/** Me 262 takımı: yüksek duruş, 2,5 m iz, büyük ana tekerlekler gövdeye toplanır, uzun burun bacağı arkaya. */
function schwalbeGear(gh: number): Geo[] {
  return jetGear({
    main: { x: 1.6, z: -0.08, top: -0.4, axle: -gh + 0.42, rw: 0.42, tw: 0.2, dx: 0.33, door: { dx: 0.09, top: -0.47, bot: -1.3, w: 0.3, r: 0.08 } },
    nose: { topY: -0.36, topZ: 3.7, axle: -gh + 0.33, z: 3.87, rw: 0.33, tw: 0.16 },
    belly: { x: 0.26, y: -0.5, z0: 3.2, z1: 2.2, h: 0.26 },
  });
}

/** Meteor takımı: iç kanattan iner (3,1 m iz), burun bacağı arkaya toplanır. */
function meteorGear(gh: number): Geo[] {
  return jetGear({
    main: { x: 1.57, z: 0, top: -0.4, axle: -gh + 0.39, rw: 0.39, tw: 0.2, dx: 0.04, door: { dx: 0.11, top: -0.46, bot: -1.14, w: 0.52, r: 0.12 } },
    nose: { topY: -0.5, topZ: 3.75, axle: -gh + 0.31, z: 3.97, rw: 0.31, tw: 0.15 },
    belly: { x: 0.26, y: -0.58, z0: 3.7, z1: 2.6, h: 0.26 },
  });
}

/** Vampire takımı: kısa, ana bacaklar kirişlerin hemen dışında ve dışa, kanadın içine katlanır; burun tekerleği çok önde. */
function vampireGear(gh: number): Geo[] {
  return jetGear({
    main: { out: true, x: 1.72, z: -0.06, top: -0.02, axle: -gh + 0.335, rw: 0.335, tw: 0.15, dx: 0.04, door: { dx: 0.1, top: -0.05, bot: -0.7, w: 0.4, r: 0.1 } },
    nose: { topY: -0.42, topZ: 3.05, axle: -gh + 0.216, z: 3.38, rw: 0.216, tw: 0.12 },
    belly: { x: 0.24, y: -0.52, z0: 2.9, z1: 2.0, h: 0.22 },
  });
}

/** He 162 takımı: kısa, dar iz (1,5 m), ana bacaklar gövdeye yakın; burun tekerleği kokpitin önünde, büyük kapaklı. */
function salamanderGear(gh: number): Geo[] {
  return jetGear({
    main: { x: 0.6, z: 0.15, top: -0.18, axle: -gh + 0.32, rw: 0.32, tw: 0.13, dx: -0.16, door: { dx: 0.26, top: -0.3, bot: -0.62, w: 0.45, r: 0.14 } },
    nose: { topY: -0.33, topZ: 3.25, axle: -gh + 0.235, z: 3.65, rw: 0.235, tw: 0.12 },
    belly: { x: 0.22, y: -0.34, z0: 3.2, z1: 2.25, h: 0.22 },
  });
}

/**
 * Kanopi: gövde üstünde yarı gömülü damla. Çerçeve: ön cam kenarında ince koyu bant; kabarcık olmayan (çerçeveli)
 * kanopide ortada ve arkada da birer bant.
 */
function canopy(z: number, len: number, h: number, y: number, w = 0.42, bubble = false): Geo {
  canopySink.push({ z, len, h, y, w, bubble });
  const raw: [number, number][] = bubble
    ? [[z + len * 0.5, 0], [z + len * 0.35, h * 0.75], [z, h], [z - len * 0.25, h * 0.95], [z - len * 0.5, 0]]
    : [[z + len * 0.5, 0], [z + len * 0.3, h * 0.7], [z, h], [z - len * 0.35, h * 0.7], [z - len * 0.5, 0]];
  // Kabarcık kanopi yüksek ayrıntıda kavisli; çerçeveli kanopi köşeli kalır (düz cam paneller)
  const prof = DETAIL && bubble ? chaikin(raw, 2) : raw;
  const sx = w / h;
  const radiusAt = (zz: number): number => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [z0, r0] = prof[i];
      const [z1, r1] = prof[i + 1];
      if (zz <= z0 && zz >= z1) return r0 + ((zz - z0) / (z1 - z0 || 1)) * (r1 - r0);
    }
    return 0;
  };
  const band = (zz: number) => {
    const r = radiusAt(zz) * 1.05 + 0.012;
    frameSink.push(tag(body([[zz + 0.035, r], [zz - 0.035, r]], 7, { y, sx }), 'dark'));
  };
  band(z + len * (bubble ? 0.33 : 0.3));
  if (!bubble) {
    band(z - len * 0.04);
    band(z - len * 0.3);
  }
  return tag(body(prof, 7, { y, sx }), 'glass');
}

/** Radyal motor kaportası (önü kesik, geniş halka) + pervane göbeği. */
function radialCowl(z: number, r: number, len: number, y = 0, x = 0): Geo[] {
  const out = [
    body([[z, r * 0.55], [z - 0.05, r * 0.92], [z - len * 0.25, r], [z - len, r * 0.9]], 10, { x, y }),
    tag(body([[z + 0.5, 0], [z + 0.32, r * 0.25], [z, r * 0.3]], 8, { x, y, smooth: true }), 'dark'),
  ];
  if (DETAIL) {
    // Kaporta ağzının içinde motor yüzü: koyu disk ve yıldız dizilimli silindir başları
    out.push(tag(body([[z - 0.1, r * 0.56], [z - 0.11, 0.001]], 10, { x, y }), 'dark'));
    const n = r > 0.75 ? 18 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (n > 9 && i % 2 ? 0.36 : 0.43);
      const g = new THREE.CylinderGeometry(r * 0.075, r * 0.09, r * 0.22, sg(5)).rotateZ(Math.PI / 2).rotateZ(a);
      g.translate(x + Math.cos(a) * rr, y + Math.sin(a) * rr, z - 0.06);
      out.push(tag(g, 'dark'));
    }
  }
  return out;
}

/** Motor naseli: sıra motorlu (sivri) ya da radyal/halka radyatörlü (küt). */
function nacelle(x: number, y: number, zFront: number, len: number, r: number, blunt = false): Geo {
  const prof: [number, number][] = blunt
    ? [[zFront + 0.45, 0], [zFront + 0.3, r * 0.3], [zFront, r * 0.6], [zFront - 0.1, r * 0.95], [zFront - len * 0.3, r], [zFront - len, r * 0.25]]
    : [[zFront + 0.45, 0], [zFront + 0.28, r * 0.42], [zFront, r * 0.78], [zFront - len * 0.3, r], [zFront - len, r * 0.25]];
  return body(prof, 8, { x, y, smooth: true });
}

function jetPod(x: number, y: number, zFront: number, len: number, r: number): Geo {
  return body([[zFront, r * 0.75], [zFront - 0.3, r], [zFront - len * 0.6, r * 0.95], [zFront - len, r * 0.6]], 9, { x, y, smooth: true });
}

/** Sabit tekerlek kaportası (spat) + bacak. */
function spats(x: number, y: number, z: number, len = 1.3, r = 0.28, leg = 1.0): Geo[] {
  return [
    ...mirror(x, (xx) => body([[z + len * 0.55, 0], [z + len * 0.3, r * 0.85], [z - len * 0.2, r], [z - len * 0.45, 0.04]], 7, { x: xx, y, smooth: true })),
    ...mirror(x, (xx) => box(0.2, leg, 0.45, xx * 0.95, y + leg / 2, z)),
  ];
}

/** Taret kubbesi (y < 0: alt kubbe). */
function dome(x: number, y: number, z: number, r: number): Geo {
  const g = new THREE.SphereGeometry(r, sg(7), sg(4), 0, Math.PI * 2, 0, Math.PI / 2);
  if (y < 0) g.rotateX(Math.PI);
  g.translate(x, y + tailLift(z), z);
  return tag(g, 'glass');
}

/** Küçük bomba (kanat altı / gövde altı). */
const bombAt = (x: number, y: number, z: number, scale = 1) =>
  body([[0.9 * scale, 0], [0.65 * scale, 0.18 * scale], [-0.5 * scale, 0.18 * scale], [-0.85 * scale, 0.05]], 6, { x, y, z, smooth: true });
/** Roket rayı + roket. */
const rocketAt = (x: number, y: number, z: number) => body([[1.0, 0], [0.8, 0.09], [-0.9, 0.09], [-1.0, 0.05]], 5, { x, y, z });
const rocketRow = (xs: number[], y: number, z: number) => xs.flatMap((x) => mirror(x, (xx) => rocketAt(xx, y, z)));
/** Atılabilir yakıt tankı. */
const tankAt = (y: number, z: number, x = 0, s = 1) => body([[1.5 * s, 0], [1.1 * s, 0.3 * s], [-1.0 * s, 0.3 * s], [-1.7 * s, 0]], 6, { x, y, z, smooth: true });

interface PropDef { z: number; r: number; blades: number; x?: number; y?: number }

interface ModelDef {
  solids: Geo[];
  props: PropDef[];
  /** Gövde yanı armasının z'si (yoksa arka gövdede, bel penceresi gibi parçalarla çakışıyorsa verilir). */
  markZ?: number;
  /** Arma gövdede değil de yandaki kirişteyse kirişin o z'deki yüksekliği. */
  markY?: number;
  bombs?: Geo[];
  rockets?: Geo[];
  tank?: Geo[];
  /** Dış ışıklar (model ekseninde): seyir lambaları ve iniş farı (yalnız ışıkları tanımlı uçaklarda). */
  lights?: { p: V3; kind: 'red' | 'green' | 'white' | 'landing' }[];
}

interface FuseOpts {
  noseZ: number;
  tailZ: number;
  r: number;
  sy?: number;
  sx?: number;
  /** Burun yarıçap oranı: 0.35 sivri sıra motor, 0.9 küt. */
  noseR?: number;
  /** En kalın noktanın burundan oranı. */
  peak?: number;
  /**
   * Kuyruk yükselmesi (0..1): gövdenin arka yarısında eksen yükselir; 1'de üst çizgi düz kalır, yalnız karın kalkar.
   * Pervaneli uçakların çoğunda gerçek yan görünüş böyle (varsayılan 0,5); düz geçişli jet gövdesinde 0.
   */
  rise?: number;
}

/** Gövde: burundan kuyruğa incelen, arka yarısında ekseni yükselen gövde. */
function fuselage(o: FuseOpts): Geo {
  const { noseZ: n, tailZ: t, r } = o;
  const L = n - t;
  const pk = o.peak ?? 0.35;
  const sy = o.sy ?? 1.18;
  const sx = o.sx ?? 1;
  const prof: [number, number][] = [
    [n, r * (o.noseR ?? 0.35)], [n - L * 0.05, r * 0.75], [n - L * pk * 0.6, r * 0.95], [n - L * pk, r], [n - L * 0.68, r * 0.62],
    [t + L * 0.04, r * 0.22], [t, r * 0.1],
  ];
  const rise = o.rise ?? 0.5;
  if (!rise) return body(prof, 8, { sy, sx, smooth: true });
  const radAt = (z: number): number => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [z0, r0] = prof[i];
      const [z1, r1] = prof[i + 1];
      if (z <= z0 && z >= z1) return r0 + ((z - z0) / (z1 - z0 || 1)) * (r1 - r0);
    }
    return z > n ? prof[0][1] : prof[prof.length - 1][1];
  };
  // Yükselme gövdenin ortasından (kanat ve kanopinin gerisinden) başlar
  const zs = n - L * Math.max(0.5, pk);
  const rs = radAt(zs);
  const lift = (z: number) => (z < zs ? rise * sy * Math.max(0, rs - radAt(z)) : 0);
  tailLift = lift;
  const zList = [...prof.map((p) => p[0]), zs, t + L * 0.25, t + L * 0.13].sort((a, b) => b - a);
  return loft(zList.map((z) => [z, radAt(z) * sx, radAt(z) * sy, lift(z)]), 8);
}

const spinner = (z: number, r: number, len = 0.55, y = 0, x = 0) => tag(body([[z + len, 0], [z + len * 0.45, r * 0.8], [z, r]], 8, { x, y, smooth: true }), 'dark');

/** Camlı (sera) burun. */
const glassNose = (z: number, r: number, len: number, sy = 1.1) =>
  tag(body([[z + len, 0], [z + len * 0.8, r * 0.55], [z + len * 0.45, r * 0.88], [z, r]], 9, { sy, smooth: true }), 'glass');

function defineModel(key: string): ModelDef {
  switch (key) {
    // ================================================================ İngiliz avcıları
    case 'hurricane':
      return {
        solids: [
          fuselage({ noseZ: 4.3, tailZ: -5.5, r: 0.78, sy: 1.25, noseR: 0.4, peak: 0.42, rise: 0.6 }),
          spinner(4.3, 0.3),
          canopy(0.5, 1.8, 0.45, 0.82, 0.4),
          box(0.7, 0.5, 1.6, 0, -0.95, -0.4),
          ...wing({ x0: 0.6, z: 1.7, root: 2.6, y: -0.55, tipX: 6.1, tip: 1.3, sweep: 0.6, dihedral: 6, t: 0.42, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -4.2, root: 1.2, y: 0.25, tipX: 1.9, tip: 0.7, sweep: 0.4, dihedral: 0, t: 0.14, shape: 'rounded' }),
          ...fins({ y0: 0.5, z0: -3.9, h: 1.7, root: 1.6, tip: 0.8, sweep: 0.9, t: 0.14 }),
        ],
        props: [{ z: 4.75, r: 1.6, blades: 3 }],
        tank: mirror(2.2, (x) => tankAt(-0.85, 0.9, x, 0.7)),
      };
    case 'spitfire':
    case 'spitfire9': {
      const n9 = key === 'spitfire9';
      const nose = n9 ? 4.55 : 4.2;
      return {
        solids: [
          fuselage({ noseZ: nose, tailZ: -5.0, r: 0.62, sy: 1.28, noseR: 0.42, rise: 0.55 }),
          spinner(nose, 0.27, 0.6),
          canopy(0.35, 1.5, 0.42, 0.66, 0.38),
          ...wing({ x0: 0.45, z: 1.6, root: 2.5, y: -0.45, tipX: 5.6, tip: 0.4, sweep: 0.3, dihedral: 6, t: 0.34, shape: 'elliptic' }),
          ...(n9 ? mirror(1.6, (x) => box(0.45, 0.3, 1.1, x, -0.72, 0.3)) : [box(0.45, 0.3, 1.1, 1.6, -0.72, 0.3), box(0.4, 0.25, 0.8, -1.6, -0.7, 0.4)]),
          ...wing({ x0: 0.1, z: -3.9, root: 1.05, y: 0.15, tipX: 1.6, tip: 0.35, sweep: 0.35, dihedral: 0, t: 0.12, shape: 'elliptic' }),
          ...fins({ y0: 0.35, z0: -3.7, h: 1.5, root: 1.3, tip: 0.6, sweep: 0.75, t: 0.12 }),
        ],
        props: [{ z: nose + 0.45, r: 1.65, blades: n9 ? 4 : 3 }],
        tank: [tankAt(-0.85, 0.6, 0, 0.8)],
        bombs: n9 ? [bombAt(0, -0.95, 0.5, 1.2)] : undefined,
      };
    }
    case 'typhoon':
      return {
        solids: [
          fuselage({ noseZ: 4.4, tailZ: -5.3, r: 0.82, sy: 1.18, noseR: 0.45, peak: 0.4 }),
          spinner(4.4, 0.34, 0.6),
          // Büyük çene radyatörü
          box(0.95, 0.75, 1.7, 0, -0.95, 3.0),
          canopy(0.6, 1.6, 0.44, 0.86, 0.42, true),
          ...wing({ x0: 0.7, z: 1.9, root: 2.9, y: -0.55, tipX: 6.3, tip: 1.4, sweep: 0.5, dihedral: 6, t: 0.5, shape: 'gull', breakAt: 0.25, innerDihedral: 0 }),
          ...wing({ x0: 0.1, z: -4.1, root: 1.3, y: 0.25, tipX: 2.2, tip: 0.7, sweep: 0.4, dihedral: 0, t: 0.14, shape: 'rounded' }),
          ...fins({ y0: 0.5, z0: -3.8, h: 1.8, root: 1.6, tip: 0.8, sweep: 0.8, t: 0.14 }),
        ],
        props: [{ z: 4.9, r: 2.0, blades: 4 }],
        rockets: rocketRow([3.0, 3.5, 4.0, 4.5], -0.85, 1.4),
        bombs: mirror(2.4, (x) => bombAt(x, -0.9, 1.0, 1.3)),
      };
    case 'meteor': {
      // Meteor F.3, ölçüler F.4 üç görünüş çiziminden; kanat ucu F.3'ün 13,1 m açıklığına uzatıldı. İnce uzun gövde,
      // burun yanlarında dört 20 mm ağzı. Kanadın ortasından geçen kalın Derwent naselleri: geniş dudak, ortada dikey
      // ayırıcı. Kökte büyük içbükey firar kaplaması, iç kanat üstünde dalış frenleri. Yatay kuyruk dikey kuyruğu haç
      // gibi keser; dikey kuyruk gövdenin altına da iner, tepesi yuvarlak.
      const H = new JetHull([
        [4.6, 0.01, -0.1, -0.14, -0.12], [4.46, 0.26, 0.11, -0.355, -0.12], [4.09, 0.4, 0.33, -0.51, -0.1], [3.24, 0.56, 0.51, -0.635, -0.08], [2.31, 0.63, 0.64, -0.69, -0.04],
        [1.0, 0.645, 0.72, -0.73, -0.02], [-0.87, 0.61, 0.68, -0.61, 0.02], [-2.92, 0.5, 0.65, -0.42, 0.08], [-5.54, 0.26, 0.58, -0.14, 0.22], [-6.5, 0.14, 0.53, -0.08, 0.24], [-7.0, 0.03, 0.46, 0.0, 0.24],
      ], 2.15);
      const Wi: WingOpts = { x0: 0.4, z: 1.25, root: 3.4, y: -0.28, tipX: 2.5, tip: 3.25, sweep: 0.08, dihedral: 0, t: 0.42 };
      const W: WingOpts = { x0: 2.97, z: 1.05, root: 2.96, y: -0.26, tipX: 6.55, tip: 1.07, sweep: 0.93, dihedral: 3.9, t: 0.35 };
      const T: WingOpts = { x0: 0.06, z: -6.01, root: 1.85, y: 1.28, tipX: 2.0, tip: 0.95, sweep: 0.55, dihedral: 0, t: 0.13 };
      const tipY = W.y + (W.tipX - W.x0) * tanD(W.dihedral);
      const up = new THREE.Vector3(0, 1, 0);
      const NX = 2.3;
      const NY = -0.31;
      const nacelle = (sd: number): Geo[] => {
        const o = { x: sd * NX, y: NY };
        return [
          body([[1.75, 0.24], [2.1, 0.26], [2.24, 0.31], [2.26, 0.37], [2.2, 0.43], [1.84, 0.55], [0.86, 0.62], [0.21, 0.625], [-0.87, 0.56], [-2.32, 0.37], [-2.92, 0.26], [-3.02, 0.25]], 12, { ...o, smooth: true }),
          tag(body([[1.4, 0.21], [1.76, 0.235]], 12, o), 'dark'),
          tag(new THREE.CircleGeometry(0.21, sg(12)).translate(o.x, o.y, 1.4), 'dark'),
          new THREE.BoxGeometry(0.13, 0.5, 0.55).translate(o.x, o.y, 1.72),
          tag(body([[-3.01, 0.235], [-2.5, 0.2]], 12, o), 'dark'),
          tag(new THREE.CircleGeometry(0.2, sg(12)).rotateY(Math.PI).translate(o.x, o.y, -2.5), 'dark'),
          tag(new THREE.ConeGeometry(0.09, 0.26, sg(8)).rotateX(-Math.PI / 2).translate(o.x, o.y, -2.64), 'dark'),
        ];
      };
      return {
        solids: [
          H.geo(13),
          ...[1, -1].flatMap((sd) => [[-0.02, 3.5], [-0.31, 3.5]].map(([y, z]) => portAt(sd * H.sideX(z, y), y, z, 0.035, 0.27))),
          tag(H.patch(1, 2.7, 1.3, Math.PI / 2 - 0.4, Math.PI / 2 + 0.4, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[3.29, 0.16, 0.56, 0.3, 0.52], [2.64, 0.355, 0.95, 0.3, 0.68]],
            glass: [[2.64, 0.355, 0.95, 0.3, 0.68], [2.31, 0.38, 1.01, 0.3, 0.7], [1.98, 0.38, 0.98, 0.3, 0.7], [1.5, 0.33, 0.88, 0.3, 0.7], [1.12, 0.12, 0.76, 0.4, 0.7]],
            aft: [[1.15, 0.14, 0.77, 0.4, 0.7], [1.05, 0.06, 0.745, 0.4, 0.69], [0.92, 0.015, 0.725, 0.5, 0.68]],
            frames: [2.64, 1.98],
            posts: [[0.1, 0.57, 3.27], [0.26, 0.92, 2.66]],
            pilot: { z: 2.15, len: 1.6, h: 0.34, y: 0.68, w: 0.36 },
          }),
          // İç kanat (nasele kadar, flaplı) ve dış kanat (kanatçık); uç yuvarlak
          ...controlWing(Wi, 0.78, [[0, 0.62, 'flap'], [0.62, 1, null]]),
          ...controlWing(W, 0.76, [[-0.2, 0, null], [0, 0.92, 'aileron'], [0.92, 1, null]], 3),
          // Kökteki içbükey firar kaplaması
          ...[1, -1].map((sd) => airfoilPart([
            { le: new THREE.Vector3(sd * 0.35, -0.28, -1.95), c: 1.0, t: 0.13 },
            { le: new THREE.Vector3(sd * 0.72, -0.28, -2.0), c: 0.42, t: 0.08 },
            { le: new THREE.Vector3(sd * 1.25, -0.28, -2.05), c: 0.1, t: 0.03 },
          ], up, 0, 1)),
          ...nacelle(1),
          ...nacelle(-1),
          // Dalış frenleri: iç kanat üstünde, arka kenarından menteşeli, ön kenarı kalkar; altında koyu yuva
          ...[1, -1].flatMap((sd) => [
            tag(new THREE.BoxGeometry(0.74, 0.008, 0.17).translate(sd * 1.26, -0.178, -1.2), 'dark'),
            ...joint(sd > 0 ? 'airbrakeL' : 'airbrakeR', [sd * 1.26, -0.17, -1.3], [new THREE.BoxGeometry(0.78, 0.014, 0.2).translate(sd * 1.26, -0.17, -1.2)], false, [sd, 0, 0]),
          ]),
          ...controlWing(T, 0.6, [[0, 0.96, 'elevator'], [0.96, 1, null]], 2.5),
          ...jetFin([[-0.35, -6.1, 0.7], [-0.14, -5.96, 1.26], [0.6, -5.8, 2.12], [1.12, -6.05, 1.93], [1.4, -6.24, 1.71], [1.78, -6.52, 1.31], [2.06, -6.77, 0.82], [2.2, -7.04, 0.33]], 0.17, 0.58, 1, 5),
          body([[-5.75, 0.01], [-6.1, 0.08], [-7.2, 0.08], [-8.08, 0.01]], 8, { y: 1.28, sy: 0.7, smooth: true }),
        ],
        props: [],
        markZ: -3.6,
        lights: [
          { p: [W.tipX + 0.2, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'red' },
          { p: [-W.tipX - 0.2, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'green' },
          { p: [0, 0.9, -8.0], kind: 'white' },
          { p: [1.2, -0.56, 0.9], kind: 'landing' },
        ],
      };
    }
    case 'sabre': {
      // F-86F, ölçüler üç görünüş çiziminden. Yumurta kesitli derin gövde, üst dudağında siyah radar kubbesi olan oval
      // burun girişi, burun yanlarında üçer silah ağzı, damla kanopi. 6-3 kanat (35° ok, 3° dihedral, açıklığın
      // ortasında küçük çit), 10° dihedralli yatay kuyruk, sırt yüzgeciyle kaynaşan dikey kuyruk. Egzoz gövde sonunda
      // biraz yukarıda; üstünde yatay kuyruğun kaportası uzanır. Hava frenleri arka gövdenin yanlarında.
      const H = new JetHull([
        [4.85, 0.35, 0.09, -0.49, -0.2], [5.0, 0.37, 0.11, -0.51, -0.2], [5.08, 0.4, 0.14, -0.54, -0.2], [5.12, 0.45, 0.2, -0.575, -0.2],
        [5.1, 0.495, 0.28, -0.6, -0.2], [5.0, 0.54, 0.39, -0.635, -0.2], [4.82, 0.58, 0.52, -0.675, -0.2], [4.13, 0.645, 0.66, -0.75, -0.2],
        [3.5, 0.69, 0.72, -0.82, -0.2], [2.53, 0.72, 0.8, -0.82, -0.2], [0.93, 0.71, 0.84, -0.82, -0.2], [-0.9, 0.7, 0.84, -0.79, -0.16],
        [-1.94, 0.63, 0.82, -0.6, -0.06], [-3.53, 0.47, 0.72, -0.32, 0.12], [-4.79, 0.36, 0.6, -0.1, 0.25], [-5.3, 0.32, 0.56, 0, 0.28], [-5.39, 0.31, 0.55, 0.01, 0.28],
      ], 2.25);
      const W: WingOpts = { x0: 0.72, z: 2.44, root: 3.01, y: -0.6, tipX: 5.65, tip: 1.45, sweep: 4.1, dihedral: 3, t: 0.32 };
      const T: WingOpts = { x0: 0.25, z: -4.03, root: 1.37, y: 0.51, tipX: 2.36, tip: 0.71, sweep: 1.63, dihedral: 10, t: 0.13 };
      const tipY = W.y + (W.tipX - W.x0) * tanD(W.dihedral);
      const duct = new JetHull([[4.86, 0.34, 0.08, -0.48, -0.2], [4.2, 0.31, 0.04, -0.44, -0.2]], 2.1, false);
      const pipe = new JetHull([[-5.385, 0.292, 0.532, 0.028, 0.28], [-4.85, 0.265, 0.5, 0.05, 0.28]], 2.1, false);
      const fenceX = W.x0 + (W.tipX - W.x0) * 0.5;
      const fenceSec = taperSec(W, 0.5, 1);
      return {
        solids: [
          H.geo(12),
          tag(duct.geo(12), 'dark'),
          tag(duct.disc(4.2, 1, 12), 'dark'),
          tag(pipe.geo(12), 'dark'),
          tag(pipe.disc(-4.85, -1, 12), 'dark'),
          tag(new THREE.ConeGeometry(0.13, 0.3, sg(10)).rotateX(-Math.PI / 2).translate(0, 0.28, -5.0), 'dark'),
          // Radar telemetre kubbesi (üst dudak) ve burun yanlarının silah ağızları
          tag(new THREE.SphereGeometry(1, sg(7), sg(4)).scale(0.16, 0.11, 0.24).translate(0, 0.26, 4.97), 'dark'),
          ...[1, -1].flatMap((s) => [[0.13, 4.02], [-0.06, 4.1], [-0.26, 4.02]].map(([y, z]) => portAt(s * H.sideX(z, y), y, z, 0.034, 0.2))),
          // Kokpit: gövde üstü koyu tekne
          tag(H.patch(1, 3.05, 1.7, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[4.13, 0.25, 0.7, 0.4, 0.68], [3.25, 0.385, 1.14, 0.4, 0.8]],
            glass: [[3.25, 0.385, 1.14, 0.4, 0.8], [2.9, 0.41, 1.21, 0.4, 0.82], [2.5, 0.43, 1.24, 0.4, 0.82], [2.0, 0.41, 1.2, 0.4, 0.82], [1.56, 0.33, 1.08, 0.4, 0.84]],
            aft: [[1.58, 0.335, 1.09, 0.4, 0.84], [1.3, 0.25, 0.99, 0.4, 0.84], [1.0, 0.13, 0.89, 0.5, 0.82], [0.75, 0.03, 0.835, 0.6, 0.8]],
            frames: [3.25, 1.6],
            posts: [[0.17, 0.72, 4.1], [0.255, 1.08, 3.27]],
            pilot: { z: 2.35, len: 1.7, h: 0.42, y: 0.86, w: 0.42 },
          }),
          // Kanat: flap açıklığın yarısına, sonra kanatçık; uç yuvarlak. Çit üst yüzde, hücum kenarından veterin ortasına
          ...controlWing(W, 0.72, [[-0.1, 0.455, 'flap'], [0.455, 0.47, null], [0.47, 0.95, 'aileron'], [0.95, 1, null]], 1),
          ...mirror(fenceX, (x) => wingFence(x, fenceSec)),
          ...controlWing(T, 0.68, [[0, 0.96, 'elevator'], [0.96, 1, null]], 1),
          ...jetFin([[0.55, -3.02, 2.3], [0.85, -3.29, 2.11], [1.05, -3.46, 1.95], [1.4, -3.77, 1.75], [2.0, -4.31, 1.38], [2.55, -4.79, 1.04], [2.76, -4.96, 0.9], [2.86, -5.1, 0.72], [2.89, -5.28, 0.42]], 0.15, 0.7, 2, 5),
          // Sırt yüzgeci: gövdeden dikey kuyruğun hücum kenarına kavisle kalkar
          airfoilPart([[0.7, -1.9, 1.7], [0.9, -2.62, 1.0], [1.02, -3.12, 0.55], [1.12, -3.53, 0.2]].map(([y, le, c]) => ({ le: new THREE.Vector3(0, y, le), c, t: 0.1 })), new THREE.Vector3(1, 0, 0), 0, 1),
          // Yatay kuyruk kaportası: egzozun üstünde arkaya uzanır
          body([[-3.9, 0.02], [-4.6, 0.14], [-5.4, 0.13], [-5.9, 0.05], [-6.02, 0.01]], 8, { y: 0.66, sx: 1.25, smooth: true }),
          // Hava frenleri: ön kenarından menteşeli, dışa açılır
          ...[1, -1].flatMap((s) => {
            const [a0, a1, zf, zb] = [-0.52, 0.17, -2.02, -3.05];
            const p = H.pt(zf, (a0 + a1) / 2, 0.02, s);
            return [
              tag(H.patch(s, zf - 0.03, zb + 0.03, a0 + 0.02, a1 - 0.02, 0.004), 'dark'),
              ...joint(s > 0 ? 'airbrakeL' : 'airbrakeR', p, [H.patch(s, zf, zb, a0, a1, 0.012, -0.012)], false, [0, 1, 0]),
            ];
          }),
        ],
        props: [],
        markZ: -3.5,
        lights: [
          { p: [W.tipX + 0.06, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'red' },
          { p: [-W.tipX - 0.06, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'green' },
          { p: [0, 2.4, -5.8], kind: 'white' },
          { p: [-1.17, -0.74, 1.5], kind: 'landing' },
        ],
      };
    }
    // ================================================================ Alman ve Amerikan avcıları
    case 'bf109e':
    case 'bf109f':
    case 'bf109g': {
      const late = key !== 'bf109e';
      const shape: WingOpts['shape'] = late ? 'rounded' : 'tapered';
      const solids: Geo[] = [
        fuselage({ noseZ: 4.0, tailZ: -4.6, r: 0.6, sy: 1.32, noseR: 0.45, peak: 0.36, rise: 0.55 }),
        spinner(4.0, late ? 0.36 : 0.3, late ? 0.7 : 0.55),
        canopy(0.5, 1.5, 0.38, 0.7, 0.36),
        ...mirror(1.5, (x) => box(0.4, 0.22, 1.0, x, -0.62, 0.0)),
        ...wing({ x0: 0.42, z: 1.4, root: 2.1, y: -0.5, tipX: 4.93, tip: 1.0, sweep: 0.25, dihedral: 6.5, t: 0.3, shape }),
        ...wing({ x0: 0.08, z: -3.75, root: 1.0, y: 0.45, tipX: 1.5, tip: 0.55, sweep: 0.3, dihedral: 0, t: 0.11, shape }),
        ...fins({ y0: 0.4, z0: -3.4, h: 1.45, root: 1.25, tip: 0.6, sweep: 0.7, t: 0.12 }),
      ];
      if (!late) solids.push(...mirror(0.45, (x) => box(0.05, 0.6, 0.06, x, 0.1 + tailLift(-3.95), -3.95)));
      if (key === 'bf109g') solids.push(...mirror(0.42, (x) => box(0.2, 0.18, 0.6, x, 0.42, 2.8)));
      return {
        solids,
        props: [{ z: 4.45, r: 1.5, blades: 3 }],
        tank: late ? [tankAt(-0.82, 0.3, 0, 0.75)] : undefined,
        bombs: [bombAt(0, -0.85, 0.4, 1.3)],
        rockets: key === 'bf109g' ? mirror(2.3, (x) => body([[1.0, 0], [0.7, 0.13], [-0.7, 0.13], [-0.9, 0]], 6, { x, y: -0.72, z: 0.8 })) : undefined,
      };
    }
    case 'fw190':
      return {
        solids: [
          ...radialCowl(4.1, 0.66, 1.3),
          fuselage({ noseZ: 2.9, tailZ: -4.85, r: 0.64, sy: 1.15, noseR: 0.98, peak: 0.08 }),
          canopy(0.1, 1.7, 0.42, 0.72, 0.4, true),
          ...wing({ x0: 0.5, z: 1.25, root: 2.3, y: -0.45, tipX: 5.25, tip: 1.15, sweep: 0.15, dihedral: 5, t: 0.3, shape: 'rounded' }),
          ...wing({ x0: 0.08, z: -3.9, root: 1.15, y: 0.25, tipX: 1.8, tip: 0.6, sweep: 0.4, dihedral: 0, t: 0.12 }),
          ...fins({ y0: 0.35, z0: -3.55, h: 1.55, root: 1.3, tip: 0.7, sweep: 0.6, t: 0.13 }),
        ],
        props: [{ z: 4.45, r: 1.65, blades: 3 }],
        bombs: [bombAt(0, -0.9, 0.4, 1.5)],
        tank: [tankAt(-0.85, 0.3, 0, 0.75)],
      };
    case 'p51d':
      return {
        solids: [
          fuselage({ noseZ: 4.5, tailZ: -5.3, r: 0.62, sy: 1.3, noseR: 0.42 }),
          spinner(4.5, 0.32, 0.6),
          canopy(0.15, 1.8, 0.48, 0.7, 0.42, true),
          // Karın soğutucu kanalı
          box(0.72, 0.5, 2.3, 0, -0.95, -1.0),
          ...wing({ x0: 0.5, z: 1.6, root: 2.6, y: -0.48, tipX: 5.64, tip: 1.1, sweep: 0.05, dihedral: 5, t: 0.32 }),
          ...wing({ x0: 0.08, z: -4.05, root: 1.2, y: 0.25, tipX: 2.05, tip: 0.6, sweep: 0.4, dihedral: 0, t: 0.12 }),
          ...fins({ y0: 0.35, z0: -3.4, h: 1.75, root: 1.9, tip: 0.7, sweep: 1.1, t: 0.13 }),
        ],
        props: [{ z: 5.0, r: 1.7, blades: 4 }],
        tank: mirror(2.1, (x) => tankAt(-0.8, 0.9, x, 0.75)),
        bombs: mirror(2.1, (x) => bombAt(x, -0.85, 0.9, 1.2)),
        rockets: rocketRow([2.8, 3.3, 3.8], -0.75, 1.2),
      };
    case 'p47':
      return {
        solids: [
          ...radialCowl(4.6, 0.84, 1.5),
          fuselage({ noseZ: 3.2, tailZ: -6.4, r: 0.85, sy: 1.2, noseR: 0.96, peak: 0.1 }),
          canopy(0.55, 1.9, 0.5, 0.95, 0.44, true),
          ...wing({ x0: 0.7, z: 1.8, root: 2.9, y: -0.6, tipX: 6.2, tip: 0.8, sweep: 0.45, dihedral: 5, t: 0.4, shape: 'elliptic' }),
          ...wing({ x0: 0.1, z: -4.8, root: 1.4, y: 0.3, tipX: 2.25, tip: 0.6, sweep: 0.45, dihedral: 0, t: 0.13, shape: 'elliptic' }),
          ...fins({ y0: 0.5, z0: -4.2, h: 2.0, root: 2.0, tip: 0.8, sweep: 1.1, t: 0.15 }),
        ],
        props: [{ z: 5.0, r: 1.85, blades: 4 }],
        bombs: mirror(2.5, (x) => bombAt(x, -1.0, 1.1, 1.3)),
        rockets: rocketRow([3.1, 3.5, 3.9, 4.3, 4.7], -0.9, 1.4),
        tank: [tankAt(-1.05, 0.6, 0, 0.9)],
      };
    case 'bf110':
      return {
        solids: [
          fuselage({ noseZ: 6.2, tailZ: -6.1, r: 0.62, sy: 1.25, noseR: 0.55, peak: 0.3, rise: 0.45 }),
          canopy(1.2, 4.4, 0.5, 0.72, 0.42),
          ...wing({ x0: 0.5, z: 1.7, root: 3.2, y: -0.4, tipX: 8.1, tip: 1.3, sweep: 0.8, dihedral: 6, t: 0.42, shape: 'rounded' }),
          ...mirror(2.6, (x) => nacelle(x, -0.2, 3.0, 4.6, 0.55)),
          ...wing({ x0: 0.1, z: -4.8, root: 1.5, y: 0.2, tipX: 3.0, tip: 1.1, sweep: 0.2, dihedral: 0, t: 0.13 }),
          ...fins({ x: 3.0, y0: -0.55, z0: -4.6, h: 1.9, root: 1.4, tip: 1.0, sweep: 0.3, t: 0.13 }),
        ],
        props: [
          { x: 2.6, y: -0.2, z: 3.45, r: 1.5, blades: 3 },
          { x: -2.6, y: -0.2, z: 3.45, r: 1.5, blades: 3 },
        ],
        bombs: mirror(0.35, (x) => bombAt(x, -0.85, 0.9, 1.3)),
        tank: mirror(4.0, (x) => tankAt(-0.75, 1.0, x, 0.8)),
      };
    case 'me262': {
      // Me 262 A-1a, ölçüler üç görünüş çiziminden. Üçgen kesitli gövde (geniş alt, dar üst), sivri burun ve üstünde dört
      // MK 108 ağzı, yana açılan kanopi. Kanat kökte kalın, firar kenarı motorun içinde kırılır; hücum kenarı oklu.
      // Kanat altında yuvarlak Jumo 004 naselleri: küçük giriş ve içinde göbek, arkada koyu egzoz ve soğan biçimli koni.
      const H = new JetHull([
        [4.4, 0.01, 0.01, -0.02, 0], [4.25, 0.3, 0.18, -0.18, -0.04], [3.95, 0.4, 0.36, -0.3, -0.08], [3.29, 0.58, 0.48, -0.46, -0.16], [2.01, 0.79, 0.61, -0.57, -0.24],
        [0.38, 0.85, 0.63, -0.66, -0.3], [-1.2, 0.76, 0.55, -0.66, -0.3], [-2.65, 0.52, 0.42, -0.46, -0.16], [-3.87, 0.36, 0.36, -0.3, -0.04], [-5.08, 0.18, 0.27, -0.18, 0.02], [-6.3, 0.03, 0.07, -0.11, -0.02],
      ], 2.15, true, 1.6);
      const W: WingOpts = { x0: 1.85, z: 0.997, root: 1.757, y: -0.25, tipX: 6.24, tip: 0.86, sweep: 1.51, dihedral: 4.5, t: 0.22 };
      const T: WingOpts = { x0: 0.1, z: -4.52, root: 1.28, y: 0.72, tipX: 1.79, tip: 0.63, sweep: 0.79, dihedral: 0, t: 0.11 };
      const tipY = W.y + (W.tipX - W.x0) * tanD(W.dihedral);
      const up = new THREE.Vector3(0, 1, 0);
      const NX = 2.25;
      const NY = -0.74;
      const nacelle = (sd: number): Geo[] => {
        const o = { x: sd * NX, y: NY };
        return [
          body([[1.9, 0.17], [2.15, 0.2], [2.25, 0.25], [2.22, 0.3], [2.1, 0.36], [1.75, 0.43], [1.2, 0.45], [0.3, 0.455], [-0.6, 0.44], [-1.2, 0.34], [-1.6, 0.22], [-1.72, 0.18]], 12, { ...o, smooth: true }),
          tag(body([[1.3, 0.14], [1.92, 0.175]], 12, o), 'dark'),
          tag(new THREE.CircleGeometry(0.14, sg(12)).translate(o.x, o.y, 1.3), 'dark'),
          tag(body([[2.12, 0.001], [2.0, 0.06], [1.75, 0.09], [1.3, 0.09]], 8, { ...o, smooth: true }), 'dark'),
          tag(body([[-1.72, 0.17], [-1.2, 0.15]], 12, o), 'dark'),
          tag(body([[-1.98, 0.001], [-1.8, 0.05], [-1.55, 0.1], [-1.2, 0.09]], 8, { ...o, smooth: true }), 'dark'),
        ];
      };
      return {
        solids: [
          H.geo(14),
          ...[1, -1].flatMap((sd) => [[0.4, 3.45], [0.2, 3.45]].map(([y, z]) => portAt(sd * H.sideX(z, y), y, z, 0.03, 0.24))),
          tag(H.patch(1, 0.35, -0.85, Math.PI / 2 - 0.34, Math.PI / 2 + 0.34, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[0.86, 0.16, 0.66, 0.35, 0.6], [0.41, 0.27, 0.97, 0.35, 0.68]],
            glass: [[0.41, 0.27, 0.97, 0.35, 0.68], [0.19, 0.3, 1.02, 0.35, 0.68], [-0.2, 0.3, 1.02, 0.35, 0.68], [-0.59, 0.27, 0.97, 0.35, 0.68], [-1.0, 0.18, 0.84, 0.35, 0.66]],
            aft: [[-0.95, 0.19, 0.86, 0.3, 0.6], [-1.2, 0.15, 0.75, 0.3, 0.55], [-1.68, 0.05, 0.56, 0.25, 0.48], [-1.9, 0.01, 0.47, 0.25, 0.42]],
            frames: [0.41, -0.6, -0.95],
            posts: [[0.1, 0.67, 0.84], [0.19, 0.93, 0.43]],
            pilot: { z: -0.05, len: 1.4, h: 0.36, y: 0.74, w: 0.3 },
          }),
          // İç kanat tek parça (kalın kök, firar kenarı kırılır); dışında flap ve kanatçık, uç yuvarlak
          ...[1, -1].map((sd) => airfoilPart([
            { le: new THREE.Vector3(sd * 0.4, -0.37, 1.5), c: 2.9, t: 0.32 },
            { le: new THREE.Vector3(sd * 0.88, -0.33, 1.33), c: 2.58, t: 0.3 },
            { le: new THREE.Vector3(sd * W.x0, W.y, W.z), c: W.root, t: W.t },
          ], up, 0, 1)),
          ...controlWing(W, 0.75, [[0, 0.47, 'flap'], [0.47, 0.485, null], [0.485, 0.95, 'aileron'], [0.95, 1, null]], 3),
          ...nacelle(1),
          ...nacelle(-1),
          ...controlWing(T, 0.7, [[0, 0.96, 'elevator'], [0.96, 1, null]], 3),
          ...jetFin([[0.1, -3.62, 2.69], [0.36, -3.93, 2.36], [0.8, -4.47, 1.78], [1.3, -4.99, 1.19], [1.75, -5.42, 0.72], [1.9, -5.56, 0.55], [1.97, -5.76, 0.27]], 0.14, 0.72, 1, 4),
          body([[-4.35, 0.01], [-4.7, 0.07], [-5.6, 0.07], [-6.1, 0.01]], 8, { y: 0.72, sy: 0.7, smooth: true }),
        ],
        props: [],
        markZ: -2.6,
        lights: [
          { p: [W.tipX + 0.17, tipY, W.z - W.sweep - W.tip * 0.4], kind: 'red' },
          { p: [-W.tipX - 0.17, tipY, W.z - W.sweep - W.tip * 0.4], kind: 'green' },
          { p: [0, 1.5, -6.12], kind: 'white' },
          { p: [1.4, -0.46, 0.9], kind: 'landing' },
        ],
      };
    }
    case 'mig15': {
      // Hareketli yüzeyler (eklem, menteşe ekseninde döner): kanadın firar kenarında içte flap, dışta kanatçık (%25
      // veter); yatay kuyrukta irtifa dümeni, dikey kuyrukta istikamet dümeni (%30). Hava frenleri ve katlanır iniş
      // takımı cached()'te (gövde yüzeyine göre). Işıklar: kanat uçlarında seyir lambaları (sol kırmızı, sağ yeşil),
      // dümen firar kenarında beyaz kuyruk lambası, sol kanat altında iniş farı (MiG-15bis).
      const W: WingOpts = { x0: 0.65, z: 1.4, root: 3.3, y: -0.1, tipX: 5.04, tip: 1.6, sweep: 3.0, dihedral: -2, t: 0.3 };
      const T: WingOpts = { x0: 0.05, z: -4.35, root: 1.2, y: 2.3, tipX: 1.7, tip: 0.6, sweep: 1.0, dihedral: 0, t: 0.1 };
      const F: Fin = { y0: 0.5, z0: -2.4, h: 2.4, root: 2.8, tip: 1.2, sweep: 2.4, t: 0.15 };
      const tipY = W.y + (W.tipX - W.x0) * tanD(W.dihedral);
      return {
        solids: [
          ...migFuselage(),
          canopy(2.2, 1.6, 0.46, 0.72, 0.42, true),
          // Kanat: kökten (gövde içinden) flap, arada kısa sabit parça, kanatçık, uç; firar kenarının arka %25'i hareketli
          ...controlWing(W, 0.75, [[-0.1, 0.46, 'flap'], [0.46, 0.48, null], [0.48, 0.96, 'aileron'], [0.96, 1, null]]),
          ...controlFin(F, 0.7, 0.1, 0.93),
          ...controlWing(T, 0.7, [[0, 0.96, 'elevator'], [0.96, 1, null]]),
        ],
        props: [],
        tank: mirror(2.6, (x) => tankAt(-0.4, 0.6, x, 0.85)),
        lights: [
          { p: [W.tipX + 0.04, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'red' },
          { p: [-W.tipX - 0.04, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'green' },
          { p: [0, F.y0 - 0.25 + (F.h + 0.25) * 0.85, F.z0 - F.sweep * 0.85 - (F.root + (F.tip - F.root) * 0.85) + 0.04], kind: 'white' },
          { p: [1.9, W.y - 0.3, 0.25], kind: 'landing' },
        ],
      };
    }
    case 'f84': {
      // F-84G, ölçüler üç görünüş çiziminden. Uzun, neredeyse silindirik gövde, kalın dudaklı yuvarlak burun girişi ve
      // içinde yatay ayırıcı, burun üstünde dört silah ağzı. Düz kanat, uçlarında sabit tanklar (F-84G neredeyse hep
      // tanklı uçtu; bu yüzden gövdenin parçası, yük seçimi görüntüyü değiştirmez). Egzoz önünde karın hafif şişkin,
      // yatay kuyruk dikey kuyruğun üstünde, yuvarlak tepeli dikey kuyruk. Hava freni karında tek kapak.
      const H = new JetHull([
        [4.85, 0.28, 0.33, -0.23, 0.05], [5.06, 0.3, 0.355, -0.25, 0.05], [5.15, 0.32, 0.375, -0.27, 0.05], [5.2, 0.345, 0.405, -0.295, 0.05],
        [5.19, 0.375, 0.44, -0.32, 0.05], [5.1, 0.395, 0.47, -0.345, 0.05], [4.87, 0.43, 0.5, -0.37, 0.04], [3.78, 0.575, 0.65, -0.6, -0.02],
        [2.98, 0.66, 0.77, -0.7, -0.05], [1.14, 0.71, 0.84, -0.79, -0.08], [-0.55, 0.7, 0.81, -0.83, -0.1], [-2.02, 0.63, 0.72, -0.585, -0.02],
        [-3.86, 0.45, 0.62, -0.34, 0.08], [-4.8, 0.38, 0.53, -0.415, 0.06], [-6.03, 0.36, 0.415, -0.48, -0.03], [-6.5, 0.31, 0.385, -0.35, 0.02], [-6.61, 0.295, 0.37, -0.32, 0.02],
      ], 2.1);
      const W: WingOpts = { x0: 0.7, z: 1.125, root: 2.81, y: -0.25, tipX: 5.55, tip: 1.7, sweep: 0.55, dihedral: 5, t: 0.33 };
      const T: WingOpts = { x0: 0.06, z: -4.72, root: 1.25, y: 0.78, tipX: 2.34, tip: 0.73, sweep: 0.36, dihedral: 0, t: 0.13 };
      const tank = (s: number) => body([[1.93, 0.001], [1.8, 0.21], [1.52, 0.31], [1.05, 0.38], [0.2, 0.415], [-0.55, 0.4], [-1.5, 0.28], [-2.25, 0.13], [-2.61, 0.02]], 9, { x: s * 5.97, y: 0.22, smooth: true });
      const duct = new JetHull([[4.86, 0.27, 0.32, -0.22, 0.05], [4.1, 0.25, 0.3, -0.2, 0.05]], 2.05, false);
      const pipe = new JetHull([[-6.6, 0.275, 0.35, -0.3, 0.02], [-6.05, 0.25, 0.32, -0.27, 0.02]], 2.05, false);
      return {
        solids: [
          H.geo(12),
          tag(duct.geo(12), 'dark'),
          tag(duct.disc(4.1, 1, 12), 'dark'),
          tag(pipe.geo(12), 'dark'),
          tag(pipe.disc(-6.05, -1, 12), 'dark'),
          tag(new THREE.ConeGeometry(0.12, 0.3, sg(10)).rotateX(-Math.PI / 2).translate(0, 0.02, -6.2), 'dark'),
          // Girişin ortasında yatay ayırıcı; burun üstünde dört silah ağzı; gövde yanında soğutma ağızları
          new THREE.BoxGeometry(0.56, 0.03, 0.62).translate(0, -0.02, 4.72),
          ...mirror(1, (s) => portAt(s * 0.27, H.topY(4.98, 0.27), 4.98, 0.03, 0.16)),
          ...mirror(1, (s) => portAt(s * 0.41, H.topY(4.68, 0.41), 4.68, 0.03, 0.16)),
          ...[1, -1].map((s) => tag(H.patch(s, 1.55, 1.2, -0.62, -0.42, 0.006), 'dark')),
          // Kokpit: gövde üstü koyu tekne
          tag(H.patch(1, 2.15, 0.85, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[2.98, 0.25, 0.8, 0.5, 0.78], [2.23, 0.4, 1.2, 0.5, 0.84]],
            glass: [[2.23, 0.4, 1.2, 0.5, 0.84], [1.8, 0.43, 1.29, 0.5, 0.86], [1.2, 0.42, 1.27, 0.5, 0.86], [0.95, 0.38, 1.17, 0.5, 0.86], [0.5, 0.29, 1.05, 0.5, 0.86], [0.15, 0.2, 0.96, 0.5, 0.86]],
            aft: [[0.2, 0.21, 0.975, 0.5, 0.86], [-0.1, 0.13, 0.9, 0.5, 0.82], [-0.4, 0.03, 0.8, 0.5, 0.76]],
            frames: [2.23, 0.95, 0.2],
            posts: [[0.17, 0.82, 2.95], [0.27, 1.14, 2.25]],
            pilot: { z: 1.62, len: 1.7, h: 0.42, y: 0.9, w: 0.42 },
          }),
          // Kanat: uç tankın içine girer; firar kenarında flap ve kanatçık
          ...controlWing(W, 0.72, [[-0.1, 0.44, 'flap'], [0.44, 0.46, null], [0.46, 0.98, 'aileron'], [0.98, 1.05, null]]),
          ...joint('ucTank', [0, 0, 0], [
            tank(1), tank(-1),
            ...[1, -1].flatMap((s) => [new THREE.BoxGeometry(0.34, 0.012, 0.36).translate(s * 5.97, 0.22, -2.4), new THREE.BoxGeometry(0.012, 0.34, 0.36).translate(s * 5.97, 0.22, -2.4)]),
          ], true),
          ...controlWing(T, 0.68, [[0, 0.96, 'elevator'], [0.96, 1, null]], 1),
          ...jetFin([[0.49, -3.95, 2.6], [0.6, -4.2, 2.33], [0.7, -4.42, 2.09], [1.03, -4.72, 1.75], [1.64, -5.06, 1.34], [2.3, -5.38, 0.88], [2.54, -5.54, 0.61], [2.6, -5.62, 0.45], [2.65, -5.74, 0.2]], 0.14, 0.72, 2, 5),
          // Yatay kuyruğun dikey kuyruktaki kaportası
          body([[-4.6, 0.01], [-4.85, 0.1], [-5.6, 0.11], [-6.05, 0.02]], 8, { y: 0.78, sy: 0.6, smooth: true }),
          // Hava freni: karında, ön kenarından menteşeli, firar kenarı aşağı iner
          tag(H.patch(1, 1.08, 0.37, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62, 0.004), 'dark'),
          ...joint('airbrakeL', H.pt(1.1, -Math.PI / 2, 0.02), [H.patch(1, 1.1, 0.35, -Math.PI / 2 - 0.65, -Math.PI / 2 + 0.65, 0.012, -0.012)], false, [1, 0, 0]),
        ],
        props: [],
        markZ: -3.7,
        lights: [
          { p: [6.39, 0.22, 0.2], kind: 'red' },
          { p: [-6.39, 0.22, 0.2], kind: 'green' },
          { p: [0, 2.2, -6.28], kind: 'white' },
          { p: [-1.35, -0.42, 0.75], kind: 'landing' },
        ],
      };
    }
    // ================================================================ Taarruz
    case 'il2':
    case 'il2m3':
    case 'il10': {
      const il10 = key === 'il10';
      return {
        solids: [
          fuselage({ noseZ: il10 ? 5.3 : 5.6, tailZ: il10 ? -5.8 : -6.0, r: 0.78, sy: 1.2, noseR: 0.5, peak: 0.3 }),
          spinner(il10 ? 5.3 : 5.6, 0.34, 0.6),
          // Zırhlı motor ve kokpit küveti
          box(1.45, 1.25, il10 ? 2.6 : 3.4, 0, -0.05, il10 ? 3.3 : 3.6),
          canopy(0.9, key === 'il2' ? 2.0 : 2.8, 0.5, 0.9, 0.44),
          ...wing({ x0: 0.75, z: 1.9, root: il10 ? 2.9 : 3.2, y: -0.5, tipX: il10 ? 6.7 : 7.3, tip: 1.3, sweep: key === 'il2m3' ? 1.9 : il10 ? 0.8 : 1.4, dihedral: 6, t: 0.45, shape: 'rounded' }),
          ...(il10 ? [] : mirror(2.4, (x) => body([[1.8, 0.1], [1.2, 0.36], [-0.8, 0.3], [-1.4, 0.05]], 6, { x, y: -0.75, z: 1.2 }))),
          ...wing({ x0: 0.1, z: -4.4, root: 1.4, y: 0.2, tipX: 2.6, tip: 0.8, sweep: 0.4, dihedral: 0, t: 0.15, shape: 'rounded' }),
          ...fins({ y0: 0.4, z0: -4.1, h: 1.8, root: 1.6, tip: 0.8, sweep: 0.8, t: 0.14 }),
        ],
        props: [{ z: (il10 ? 5.3 : 5.6) + 0.5, r: 1.8, blades: 3 }],
        rockets: rocketRow([3.4, 3.9, 4.4, 4.9], -0.85, 1.2),
        bombs: mirror(1.5, (x) => bombAt(x, -0.95, 0.4)),
      };
    }
    // ================================================================ Pike bombardıman
    case 'ju87b':
    case 'ju87d': {
      const d = key === 'ju87d';
      return {
        solids: [
          fuselage({ noseZ: 5.4, tailZ: -5.7, r: 0.75, sy: 1.22, noseR: 0.55, peak: 0.32 }),
          spinner(5.4, 0.32, 0.5),
          box(0.85, 0.55, 1.2, 0, -0.85, 4.2),
          canopy(0.6, 3.0, 0.5, 0.86, 0.44),
          ...wing({ x0: 0.45, z: 1.6, root: 2.6, y: -0.55, tipX: d ? 7.5 : 6.9, tip: 1.3, sweep: 0.15, dihedral: 9, t: 0.42, shape: 'gull', breakAt: 0.3, innerDihedral: -14 }),
          ...spats(2.25, -2.2, 1.0, d ? 1.1 : 1.35, d ? 0.24 : 0.3, 0.95),
          ...wing({ x0: 0.1, z: -4.2, root: 1.3, y: 0.2, tipX: 2.5, tip: 0.85, sweep: 0.25, dihedral: 0, t: 0.15 }),
          ...mirror(1.3, (x) => box(0.06, 0.9, 0.08, x, -0.25 + tailLift(-4.6), -4.6)),
          ...fins({ y0: 0.4, z0: -3.95, h: 1.9, root: 1.7, tip: 1.0, sweep: 0.6, t: 0.14 }),
        ],
        props: [{ z: 5.8, r: 1.7, blades: 3 }],
        bombs: [
          body([[1.4, 0], [1.05, 0.26], [0.2, 0.32], [-0.9, 0.26], [-1.3, 0.08]], 6, { y: -1.2, z: 0.6 }),
          ...mirror(3.6, (x) => bombAt(x, -1.15, 1.0, 0.8)),
        ],
      };
    }
    case 'sbd':
    case 'sb2c': {
      const big = key === 'sb2c';
      const n = big ? 5.0 : 4.6;
      return {
        solids: [
          ...radialCowl(n, big ? 0.76 : 0.68, 1.2),
          fuselage({ noseZ: n - 1.1, tailZ: big ? -6.1 : -5.4, r: big ? 0.8 : 0.72, sy: 1.2, noseR: 0.95, peak: 0.12 }),
          canopy(0.4, big ? 3.4 : 3.2, 0.5, big ? 0.92 : 0.84, 0.44),
          ...wing({ x0: 0.65, z: 1.6, root: big ? 3.3 : 3.1, y: -0.55, tipX: big ? 7.6 : 6.33, tip: big ? 1.6 : 1.3, sweep: big ? 0.6 : 1.0, dihedral: 7, t: 0.42, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: big ? -4.7 : -4.1, root: 1.5, y: 0.2, tipX: big ? 2.9 : 2.3, tip: 0.8, sweep: 0.5, dihedral: 0, t: 0.14, shape: 'rounded' }),
          ...fins({ y0: 0.45, z0: big ? -4.2 : -3.8, h: big ? 2.4 : 2.0, root: big ? 2.4 : 1.8, tip: 1.0, sweep: 0.8, t: 0.15 }),
        ],
        props: [{ z: n + 0.35, r: big ? 1.85 : 1.65, blades: 3 }],
        bombs: [body([[1.3, 0], [1.0, 0.25], [0.2, 0.3], [-0.8, 0.25], [-1.2, 0.08]], 6, { y: -1.05, z: 0.6 }), ...(big ? mirror(3.2, (x) => bombAt(x, -1.0, 1.2, 1.1)) : [])],
      };
    }
    // ================================================================ Bombardıman
    case 'he111':
      return {
        solids: [
          glassNose(6.4, 0.98, 1.7),
          fuselage({ noseZ: 6.4, tailZ: -8.4, r: 1.0, sy: 1.2, noseR: 0.98, peak: 0.08 }),
          box(0.8, 0.6, 3.2, 0, -1.25, 0.6),
          dome(0, 1.15, -2.0, 0.42),
          ...wing({ x0: 1.0, z: 2.8, root: 4.9, y: -0.35, tipX: 11.3, tip: 1.4, sweep: 1.6, dihedral: 4.5, t: 0.7, shape: 'elliptic' }),
          ...mirror(4.0, (x) => nacelle(x, -0.3, 3.9, 5.0, 0.78, true)),
          ...wing({ x0: 0.2, z: -6.3, root: 2.4, y: 0.35, tipX: 4.1, tip: 0.9, sweep: 0.8, dihedral: 0, t: 0.2, shape: 'elliptic' }),
          ...fins({ y0: 0.7, z0: -6.0, h: 3.0, root: 2.3, tip: 1.1, sweep: 1.2, t: 0.2 }),
        ],
        props: [{ x: 4.0, y: -0.3, z: 4.4, r: 1.75, blades: 3 }, { x: -4.0, y: -0.3, z: 4.4, r: 1.75, blades: 3 }],
      };
    case 'ju88':
      return {
        solids: [
          fuselage({ noseZ: 7.0, tailZ: -7.4, r: 0.85, sy: 1.15, noseR: 0.55, peak: 0.25 }),
          canopy(4.8, 2.7, 0.7, 0.85, 0.72, true),
          box(0.75, 0.55, 2.4, 0.15, -1.0, 3.1),
          ...wing({ x0: 0.8, z: 2.0, root: 4.2, y: -0.35, tipX: 10.0, tip: 1.6, sweep: 1.6, dihedral: 5, t: 0.6, shape: 'rounded' }),
          ...mirror(2.95, (x) => nacelle(x, -0.3, 3.6, 5.0, 0.78, true)),
          ...wing({ x0: 0.2, z: -5.6, root: 2.1, y: 0.3, tipX: 3.6, tip: 0.9, sweep: 0.6, dihedral: 0, t: 0.18, shape: 'rounded' }),
          ...fins({ y0: 0.6, z0: -5.2, h: 2.8, root: 2.0, tip: 1.2, sweep: 0.8, t: 0.18 }),
        ],
        props: [{ x: 2.95, y: -0.3, z: 4.1, r: 1.7, blades: 3 }, { x: -2.95, y: -0.3, z: 4.1, r: 1.7, blades: 3 }],
        bombs: mirror(1.7, (x) => bombAt(x, -0.85, 2.4, 1.4)),
      };
    case 'b25':
      return {
        solids: [
          glassNose(6.4, 0.85, 1.5),
          fuselage({ noseZ: 6.4, tailZ: -7.9, r: 0.88, sy: 1.2, noseR: 0.95, peak: 0.1, rise: 0.35 }),
          canopy(4.6, 2.3, 0.55, 0.95, 0.6),
          dome(0, 1.0, 3.0, 0.48),
          ...wing({ x0: 0.9, z: 2.1, root: 4.2, y: 0.0, tipX: 10.3, tip: 1.8, sweep: 1.4, dihedral: -1, t: 0.6, shape: 'gull', breakAt: 0.32, innerDihedral: 5 }),
          ...mirror(3.0, (x) => nacelle(x, 0.1, 3.9, 5.5, 0.78, true)),
          ...wing({ x0: 0.2, z: -6.6, root: 2.1, y: 0.4, tipX: 3.35, tip: 1.7, sweep: 0.3, dihedral: 0, t: 0.18 }),
          ...fins({ x: 3.35, y0: -0.8, z0: -6.4, h: 2.6, root: 1.6, tip: 1.2, sweep: 0.3, t: 0.16 }),
        ],
        props: [{ x: 3.0, y: 0.1, z: 4.4, r: 1.9, blades: 3 }, { x: -3.0, y: 0.1, z: 4.4, r: 1.9, blades: 3 }],
      };
    case 'b17': {
      // B-17G: gövde silindir değil. Burun camından kokpite genişler, kanat boyunca en kalın, bel nişancılarından
      // sonra karın çizgisi kuyruk nişancısına doğru kalkar, üst çizgi neredeyse düz. Dikey kuyruk radyo odasının
      // gerisinden başlayan uzun sırt yüzgeciyle bütün. Çene, sırt, top ve kuyruk taretleri çift namlulu.
      const gun = (x: number, a: V3, b: V3) => tag(rod(new THREE.Vector3(x + a[0], a[1], a[2]), new THREE.Vector3(x + b[0], b[1], b[2]), 0.028, 5), 'dark');
      const pair = (a: V3, b: V3) => [gun(0.11, a, b), gun(-0.11, a, b)];
      return {
        solids: [
          glassNose(9.0, 0.98, 1.6, 1.07),
          loft([
            [9.0, 0.98, 1.05, 0], [8.1, 1.07, 1.19, 0.02], [6.8, 1.14, 1.31, 0.04], [4.5, 1.17, 1.37, 0.05], [1.0, 1.17, 1.37, 0.05],
            [-2.0, 1.13, 1.32, 0.08], [-4.5, 1.0, 1.15, 0.18], [-7.0, 0.8, 0.92, 0.34], [-9.2, 0.58, 0.68, 0.5],
            [-10.9, 0.42, 0.5, 0.6], [-11.6, 0.32, 0.38, 0.63],
          ], 9),
          canopy(6.6, 2.4, 0.6, 1.24, 0.85),
          // Çene tareti (metal), sırt tareti (cam kubbe, metal halka), top taret (karında), kuyruk nişancı camı
          tag(new THREE.SphereGeometry(0.45, sg(8), sg(5), 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, -0.9, 9.4), 'dark'),
          ...pair([0, -1.12, 9.6], [0, -1.12, 10.6]),
          dome(0, 1.4, 4.4, 0.58),
          tag(new THREE.CylinderGeometry(0.6, 0.66, 0.14, sg(10)).translate(0, 1.4, 4.4), 'dark'),
          ...pair([0, 1.72, 4.6], [0, 1.82, 5.8]),
          tag(new THREE.SphereGeometry(0.58, sg(9), sg(6)).translate(0, -1.42, -0.8), 'dark'),
          ...pair([0, -1.55, -1.1], [0, -1.78, -2.3]),
          tag(body([[-11.5, 0.33], [-11.85, 0.3], [-12.12, 0.15], [-12.22, 0]], 8, { y: 0.63, sy: 1.15 }), 'glass'),
          ...pair([0, 0.6, -12.0], [0, 0.6, -12.9]),
          // Bel nişancı pencereleri (G'de çaprazlı: sağdaki önde)
          tag(box(0.08, 0.6, 1.0, 0.95, 0.5, -4.0), 'dark'),
          tag(box(0.08, 0.6, 1.0, -0.95, 0.5, -4.6), 'dark'),
          ...wing({ x0: 1.2, z: 3.6, root: 6.0, y: -0.5, tipX: 15.8, tip: 2.2, sweep: 3.5, dihedral: 4.5, t: 0.85, shape: 'rounded' }),
          ...mirror(3.7, (x) => nacelle(x, -0.3, 5.5, 4.2, 0.78, true)),
          ...mirror(7.7, (x) => nacelle(x, -0.1, 4.6, 3.8, 0.74, true)),
          ...wing({ x0: 0.3, z: -8.7, root: 3.1, y: 0.55, tipX: 6.6, tip: 1.3, sweep: 1.4, dihedral: 0, t: 0.25, shape: 'rounded' }),
          curvedFin(0.5, [
            [0.95, -2.4, 9.15], [1.55, -4.3, 7.25], [2.1, -5.9, 5.65], [2.8, -7.2, 4.3], [3.8, -8.15, 3.3],
            [4.6, -8.75, 2.6], [5.05, -9.2, 2.0], [5.3, -9.75, 1.25],
          ]),
        ],
        markZ: -6.6,
        props: [
          { x: 3.7, y: -0.3, z: 6.0, r: 1.75, blades: 3 }, { x: -3.7, y: -0.3, z: 6.0, r: 1.75, blades: 3 },
          { x: 7.7, y: -0.1, z: 5.1, r: 1.75, blades: 3 }, { x: -7.7, y: -0.1, z: 5.1, r: 1.75, blades: 3 },
        ],
      };
    }
    // ================================================================ Son pervaneliler
    case 'seafury':
      return {
        solids: [
          ...radialCowl(4.9, 0.74, 1.55),
          spinner(4.9, 0.42, 0.75),
          fuselage({ noseZ: 3.45, tailZ: -5.7, r: 0.72, sy: 1.2, noseR: 0.97, peak: 0.1 }),
          canopy(0.3, 1.6, 0.46, 0.82, 0.42, true),
          // Kanat kökünde yağ soğutucu ağızları
          ...mirror(1.15, (x) => tag(box(0.75, 0.16, 0.3, x, -0.5, 2.0), 'dark')),
          ...wing({ x0: 0.65, z: 2.0, root: 2.8, y: -0.55, tipX: 5.85, tip: 0.6, sweep: 0.5, dihedral: 6, t: 0.4, shape: 'elliptic' }),
          ...wing({ x0: 0.1, z: -4.3, root: 1.3, y: 0.25, tipX: 2.3, tip: 0.5, sweep: 0.4, dihedral: 0, t: 0.13, shape: 'elliptic' }),
          ...fins({ y0: 0.45, z0: -3.9, h: 1.85, root: 1.8, tip: 0.7, sweep: 1.0, t: 0.14 }),
        ],
        props: [{ z: 5.4, r: 1.95, blades: 5 }],
      };
    case 'f8f':
      return {
        solids: [
          ...radialCowl(4.0, 0.76, 1.4),
          fuselage({ noseZ: 2.7, tailZ: -4.6, r: 0.74, sy: 1.18, noseR: 0.97, peak: 0.08 }),
          canopy(0.6, 1.5, 0.5, 0.86, 0.44, true),
          ...wing({ x0: 0.7, z: 1.5, root: 2.6, y: -0.5, tipX: 5.46, tip: 1.2, sweep: 0.25, dihedral: 6, t: 0.36, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -3.7, root: 1.3, y: 0.3, tipX: 2.1, tip: 0.6, sweep: 0.4, dihedral: 0, t: 0.12 }),
          // Küçük gövdeye uzun dikey kuyruk
          ...fins({ y0: 0.45, z0: -3.15, h: 2.05, root: 1.95, tip: 0.8, sweep: 1.15, t: 0.14 }),
        ],
        props: [{ z: 4.45, r: 1.9, blades: 4 }],
      };
    case 'f4u':
      return {
        solids: [
          ...radialCowl(4.7, 0.72, 1.3),
          fuselage({ noseZ: 3.5, tailZ: -5.6, r: 0.72, sy: 1.22, noseR: 0.97, peak: 0.1 }),
          // Uzun burun: kokpit geride
          canopy(-0.6, 1.7, 0.46, 0.82, 0.4),
          ...mirror(1.3, (x) => tag(box(1.0, 0.16, 0.25, x, -0.62, 2.3), 'dark')),
          // Ters martı kanat
          ...wing({ x0: 0.6, z: 2.3, root: 2.9, y: -0.4, tipX: 6.25, tip: 1.3, sweep: 0.3, dihedral: 9, t: 0.42, shape: 'gull', breakAt: 0.3, innerDihedral: -16 }),
          ...wing({ x0: 0.1, z: -4.3, root: 1.4, y: 0.3, tipX: 2.6, tip: 0.6, sweep: 0.45, dihedral: 0, t: 0.13, shape: 'rounded' }),
          ...fins({ y0: 0.45, z0: -3.8, h: 1.9, root: 1.8, tip: 0.8, sweep: 1.0, t: 0.14 }),
        ],
        props: [{ z: 5.15, r: 2.0, blades: 4 }],
      };
    case 'ad4':
      return {
        solids: [
          ...radialCowl(5.4, 0.84, 1.5),
          fuselage({ noseZ: 4.0, tailZ: -6.4, r: 0.86, sy: 1.25, noseR: 0.96, peak: 0.1 }),
          canopy(1.6, 2.1, 0.5, 1.02, 0.46, true),
          // Gövde yanı hava frenleri
          ...mirror(0.66, (x) => tag(box(0.06, 0.8, 1.0, x, -0.1, -1.5), 'dark')),
          // Düz, kalın kanat (çok askılı)
          ...wing({ x0: 0.8, z: 2.4, root: 3.4, y: -0.6, tipX: 7.6, tip: 1.6, sweep: 0.5, dihedral: 6, t: 0.5, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -4.9, root: 1.7, y: 0.3, tipX: 3.0, tip: 0.8, sweep: 0.4, dihedral: 0, t: 0.15 }),
          ...fins({ y0: 0.5, z0: -4.1, h: 2.7, root: 2.5, tip: 1.0, sweep: 1.25, t: 0.16 }),
        ],
        props: [{ z: 5.85, r: 2.05, blades: 4 }],
      };
    case 'a26':
      return {
        solids: [
          fuselage({ noseZ: 7.3, tailZ: -7.9, r: 0.8, sy: 1.3, noseR: 0.5, peak: 0.28, rise: 0.4 }),
          // Burunda sekiz makineli
          ...[0.13, 0.3].flatMap((x) => mirror(x, (xx) => tag(box(0.07, 0.07, 0.55, xx, x > 0.2 ? -0.05 : 0.15, 7.35), 'dark'))),
          canopy(3.6, 2.4, 0.55, 0.98, 0.55, true),
          dome(0, 1.15, -1.0, 0.42),
          dome(0, -1.1, -3.0, 0.4),
          ...wing({ x0: 0.8, z: 2.3, root: 4.0, y: 0.1, tipX: 10.67, tip: 1.5, sweep: 1.4, dihedral: 4, t: 0.6, shape: 'rounded' }),
          ...mirror(3.1, (x) => nacelle(x, -0.1, 3.7, 5.3, 0.8, true)),
          ...wing({ x0: 0.15, z: -6.3, root: 2.2, y: 0.5, tipX: 4.0, tip: 1.0, sweep: 0.6, dihedral: 7, t: 0.17 }),
          ...fins({ y0: 0.7, z0: -5.6, h: 2.8, root: 2.6, tip: 1.1, sweep: 1.2, t: 0.18 }),
        ],
        props: [{ x: 3.1, y: -0.1, z: 4.2, r: 1.9, blades: 3 }, { x: -3.1, y: -0.1, z: 4.2, r: 1.9, blades: 3 }],
      };
    case 'b29': {
      const inner = 5.0;
      const outer = 10.5;
      return {
        solids: [
          // Basınçlı, silindir gövde ve basamaksız camlı burun
          glassNose(13.0, 1.45, 2.0, 1.0),
          body([[13.0, 1.45], [9.0, 1.45], [-6.0, 1.45], [-10.5, 1.15], [-14.2, 0.55], [-14.9, 0.4]], 10),
          tag(body([[-14.6, 0.48], [-15.2, 0.32], [-15.5, 0]], 7), 'glass'),
          dome(0, 1.42, 9.0, 0.5),
          dome(0, 1.42, -6.0, 0.5),
          dome(0, -1.42, 7.0, 0.5),
          dome(0, -1.42, -5.0, 0.5),
          // Yüksek açıklık oranlı uzun kanat
          ...wing({ x0: 1.3, z: 4.2, root: 5.8, y: -0.3, tipX: 21.5, tip: 1.9, sweep: 2.6, dihedral: 4.5, t: 0.9 }),
          ...mirror(inner, (x) => nacelle(x, -0.2, 6.4, 6.6, 0.82, true)),
          ...mirror(outer, (x) => nacelle(x, 0.25, 5.7, 5.6, 0.8, true)),
          ...wing({ x0: 0.4, z: -10.6, root: 3.6, y: 0.5, tipX: 6.6, tip: 1.6, sweep: 1.5, dihedral: 0, t: 0.28 }),
          // Dev dikey kuyruk (sırt yüzgeciyle)
          ...fins({ y0: 1.0, z0: -7.4, h: 5.7, root: 7.0, tip: 2.0, sweep: 4.8, t: 0.28 }),
        ],
        props: [
          { x: inner, y: -0.2, z: 6.9, r: 2.5, blades: 4 }, { x: -inner, y: -0.2, z: 6.9, r: 2.5, blades: 4 },
          { x: outer, y: 0.25, z: 6.2, r: 2.5, blades: 4 }, { x: -outer, y: 0.25, z: 6.2, r: 2.5, blades: 4 },
        ],
      };
    }
    case 'canberra':
      return {
        solids: [
          fuselage({ noseZ: 9.8, tailZ: -10.0, r: 0.98, sy: 1.05, noseR: 0.3, peak: 0.35, rise: 0.3 }),
          canopy(6.6, 2.0, 0.55, 0.92, 0.5, true),
          ...wing({ x0: 1.0, z: 3.5, root: 6.5, y: 0, tipX: 9.75, tip: 2.6, sweep: 3.0, dihedral: 2, t: 0.6, shape: 'rounded' }),
          ...mirror(3.4, (x) => jetPod(x, 0, 2.7, 6.0, 0.82)),
          ...fins({ y0: 0.6, z0: -6.4, h: 3.0, root: 3.0, tip: 1.3, sweep: 2.0, t: 0.18 }),
          ...wing({ x0: 0.1, z: -7.6, root: 2.4, y: 1.1, tipX: 4.25, tip: 1.0, sweep: 1.0, dihedral: 10, t: 0.16 }),
        ],
        props: [],
      };
    // ================================================================ Çeşitlilik: pervaneliler
    case 'i16':
      return {
        solids: [
          ...radialCowl(2.75, 0.68, 1.1),
          // Kısa, fıçı gövde
          fuselage({ noseZ: 1.75, tailZ: -3.6, r: 0.7, sy: 1.12, noseR: 0.98, peak: 0.1, rise: 0.45 }),
          canopy(-0.25, 1.0, 0.34, 0.74, 0.36),
          ...wing({ x0: 0.6, z: 1.3, root: 2.3, y: -0.4, tipX: 4.5, tip: 1.2, sweep: 0.4, dihedral: 3, t: 0.34, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -2.55, root: 1.1, y: 0.15, tipX: 1.6, tip: 0.6, sweep: 0.35, dihedral: 0, t: 0.11, shape: 'rounded' }),
          ...fins({ y0: 0.4, z0: -2.35, h: 1.3, root: 1.2, tip: 0.6, sweep: 0.6, t: 0.12 }),
        ],
        props: [{ z: 3.1, r: 1.4, blades: 2 }],
      };
    case 'a6m':
      return {
        solids: [
          ...radialCowl(3.7, 0.64, 1.2),
          fuselage({ noseZ: 2.6, tailZ: -5.4, r: 0.62, sy: 1.18, noseR: 0.97, peak: 0.12, rise: 0.55 }),
          // Uzun, çerçeveli kanopi
          canopy(0.1, 2.6, 0.42, 0.68, 0.4),
          ...wing({ x0: 0.6, z: 1.6, root: 2.6, y: -0.45, tipX: 6.0, tip: 1.1, sweep: 0.5, dihedral: 6, t: 0.34, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -4.1, root: 1.2, y: 0.2, tipX: 2.4, tip: 0.6, sweep: 0.45, dihedral: 0, t: 0.11, shape: 'rounded' }),
          ...fins({ y0: 0.4, z0: -3.7, h: 1.6, root: 1.6, tip: 0.7, sweep: 0.9, t: 0.12 }),
        ],
        props: [{ z: 4.05, r: 1.45, blades: 3 }],
      };
    case 'blenheim':
      return {
        solids: [
          // Kısa camlı burun ve hemen arkasında kokpit
          glassNose(4.6, 0.78, 0.8),
          fuselage({ noseZ: 4.6, tailZ: -7.9, r: 0.82, sy: 1.15, noseR: 0.95, peak: 0.12 }),
          canopy(3.9, 1.5, 0.4, 0.78, 0.6),
          dome(0, 0.92, -1.8, 0.45),
          ...wing({ x0: 0.9, z: 2.3, root: 3.6, y: -0.4, tipX: 8.58, tip: 1.3, sweep: 1.2, dihedral: 6, t: 0.55, shape: 'rounded' }),
          ...mirror(2.65, (x) => nacelle(x, -0.2, 3.7, 4.2, 0.72, true)),
          ...wing({ x0: 0.15, z: -5.9, root: 1.8, y: 0.3, tipX: 3.4, tip: 1.0, sweep: 0.4, dihedral: 0, t: 0.16, shape: 'rounded' }),
          ...fins({ y0: 0.6, z0: -5.5, h: 2.2, root: 2.0, tip: 1.0, sweep: 0.9, t: 0.16 }),
        ],
        props: [{ x: 2.65, y: -0.2, z: 4.2, r: 1.6, blades: 3 }, { x: -2.65, y: -0.2, z: 4.2, r: 1.6, blades: 3 }],
      };
    case 'p40':
      return {
        solids: [
          fuselage({ noseZ: 4.6, tailZ: -5.1, r: 0.64, sy: 1.3, noseR: 0.45, peak: 0.38, rise: 0.55 }),
          spinner(4.6, 0.3, 0.6),
          // Derin çene radyatörü ("köpekbalığı ağzı")
          box(0.9, 0.7, 1.6, 0, -0.85, 3.3),
          tag(box(0.7, 0.4, 0.1, 0, -0.85, 4.1), 'dark'),
          canopy(0.2, 1.7, 0.42, 0.72, 0.4),
          ...wing({ x0: 0.55, z: 1.7, root: 2.6, y: -0.5, tipX: 5.69, tip: 1.2, sweep: 0.5, dihedral: 6, t: 0.36, shape: 'rounded' }),
          ...wing({ x0: 0.08, z: -4.0, root: 1.2, y: 0.25, tipX: 2.05, tip: 0.6, sweep: 0.4, dihedral: 0, t: 0.12, shape: 'rounded' }),
          ...fins({ y0: 0.4, z0: -3.5, h: 1.75, root: 1.7, tip: 0.8, sweep: 0.9, t: 0.13 }),
        ],
        props: [{ z: 5.05, r: 1.7, blades: 3 }],
      };
    case 'pe2':
      return {
        solids: [
          glassNose(5.9, 0.62, 0.7),
          fuselage({ noseZ: 5.9, tailZ: -6.5, r: 0.7, sy: 1.2, noseR: 0.85, peak: 0.25, rise: 0.45 }),
          // Pilot ve nişancının uzun ortak kanopisi
          canopy(3.4, 2.8, 0.5, 0.78, 0.5),
          ...wing({ x0: 0.7, z: 2.0, root: 3.1, y: -0.3, tipX: 8.58, tip: 1.2, sweep: 1.0, dihedral: 6, t: 0.45 }),
          ...mirror(2.6, (x) => nacelle(x, -0.15, 3.4, 5.0, 0.62)),
          // Dihedralli yatay kuyruk, uçlarında ikiz dikey kuyruk
          ...wing({ x0: 0.1, z: -5.2, root: 1.5, y: 0.45, tipX: 2.9, tip: 1.1, sweep: 0.3, dihedral: 8, t: 0.14 }),
          ...fins({ x: 2.9, y0: 0.25, z0: -5.1, h: 1.6, root: 1.3, tip: 0.9, sweep: 0.2, t: 0.12 }),
        ],
        props: [{ x: 2.6, y: -0.15, z: 3.85, r: 1.55, blades: 3 }, { x: -2.6, y: -0.15, z: 3.85, r: 1.55, blades: 3 }],
      };
    case 'yak3':
      return {
        solids: [
          fuselage({ noseZ: 4.1, tailZ: -4.4, r: 0.58, sy: 1.3, noseR: 0.42, peak: 0.36, rise: 0.55 }),
          spinner(4.1, 0.28, 0.6),
          canopy(0.1, 1.5, 0.42, 0.68, 0.38, true),
          // Kanat altı karın radyatörü
          box(0.7, 0.42, 1.8, 0, -0.85, 0.2),
          ...wing({ x0: 0.45, z: 1.5, root: 2.2, y: -0.45, tipX: 4.6, tip: 1.0, sweep: 0.4, dihedral: 6, t: 0.3, shape: 'rounded' }),
          ...wing({ x0: 0.08, z: -3.5, root: 1.0, y: 0.25, tipX: 1.6, tip: 0.55, sweep: 0.35, dihedral: 0, t: 0.11, shape: 'rounded' }),
          ...fins({ y0: 0.35, z0: -3.15, h: 1.45, root: 1.3, tip: 0.65, sweep: 0.7, t: 0.12 }),
        ],
        props: [{ z: 4.55, r: 1.5, blades: 3 }],
      };
    case 'la7':
      return {
        solids: [
          ...radialCowl(4.0, 0.66, 1.3),
          fuselage({ noseZ: 2.8, tailZ: -4.6, r: 0.64, sy: 1.18, noseR: 0.97, peak: 0.1 }),
          canopy(0.1, 1.6, 0.42, 0.74, 0.4, true),
          box(0.5, 0.35, 1.0, 0, -0.8, -0.6),
          ...wing({ x0: 0.5, z: 1.4, root: 2.3, y: -0.45, tipX: 4.9, tip: 1.0, sweep: 0.4, dihedral: 6, t: 0.32, shape: 'rounded' }),
          ...wing({ x0: 0.08, z: -3.7, root: 1.1, y: 0.25, tipX: 1.75, tip: 0.55, sweep: 0.35, dihedral: 0, t: 0.11, shape: 'rounded' }),
          ...fins({ y0: 0.35, z0: -3.35, h: 1.5, root: 1.3, tip: 0.65, sweep: 0.7, t: 0.12 }),
        ],
        props: [{ z: 4.35, r: 1.55, blades: 3 }],
      };
    case 'p38': {
      const bx = 2.95;
      return {
        solids: [
          // Orta gondol: kokpit ve burunda toplanmış silahlar
          body([[4.2, 0.12], [3.8, 0.45], [2.8, 0.7], [0.5, 0.75], [-1.2, 0.62], [-2.2, 0.25]], 9, { sy: 1.1 }),
          canopy(1.2, 1.9, 0.48, 0.72, 0.44, true),
          // Motor naselleriyle bütün kuyruk kirişleri
          ...mirror(bx, (x) => body([[4.0, 0.25], [3.6, 0.6], [2.5, 0.68], [0.5, 0.62], [-2.0, 0.45], [-5.5, 0.32], [-7.2, 0.28], [-7.6, 0.1]], 8, { x, sy: 1.15 })),
          ...mirror(bx, (x) => spinner(4.0, 0.3, 0.55, 0, x)),
          // Turbo süperşarjlar
          ...mirror(bx, (x) => box(0.4, 0.22, 0.9, x, 0.68, -0.6)),
          ...wing({ x0: 0.5, z: 1.6, root: 3.1, y: -0.25, tipX: 7.92, tip: 1.0, sweep: 0.9, dihedral: 4, t: 0.42 }),
          // Kirişler arasında yatay kuyruk
          ...wing({ x0: 0.05, z: -6.0, root: 1.4, y: 0.25, tipX: bx + 0.3, tip: 1.3, sweep: 0, dihedral: 0, t: 0.14 }),
          ...fins({ x: bx, y0: -0.3, z0: -5.8, h: 2.0, root: 1.7, tip: 1.0, sweep: 0.3, t: 0.13 }),
        ],
        props: [{ x: bx, y: 0, z: 4.6, r: 1.75, blades: 3 }, { x: -bx, y: 0, z: 4.6, r: 1.75, blades: 3 }],
      };
    }
    case 'f6f':
      return {
        solids: [
          ...radialCowl(4.5, 0.84, 1.45),
          // Kaporta altı hava alıkları
          tag(box(0.9, 0.28, 0.35, 0, -0.72, 4.25), 'dark'),
          fuselage({ noseZ: 3.15, tailZ: -5.6, r: 0.84, sy: 1.25, noseR: 0.96, peak: 0.12 }),
          canopy(0.5, 1.9, 0.48, 1.0, 0.42),
          ...wing({ x0: 0.75, z: 1.9, root: 3.0, y: -0.75, tipX: 6.53, tip: 1.5, sweep: 0.45, dihedral: 7, t: 0.44, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -4.3, root: 1.5, y: 0.25, tipX: 2.6, tip: 0.7, sweep: 0.45, dihedral: 0, t: 0.13, shape: 'rounded' }),
          ...fins({ y0: 0.55, z0: -3.8, h: 2.0, root: 2.0, tip: 0.8, sweep: 1.0, t: 0.15 }),
        ],
        props: [{ z: 4.9, r: 2.0, blades: 3 }],
      };
    case 'lancaster': {
      const inner = 4.0;
      const outer = 8.4;
      return {
        solids: [
          glassNose(9.0, 0.6, 0.9, 1.35),
          fuselage({ noseZ: 9.0, tailZ: -11.4, r: 1.0, sy: 1.35, noseR: 0.6, peak: 0.15, rise: 0.4 }),
          canopy(6.2, 2.6, 0.6, 1.25, 0.7),
          dome(0, 1.3, 0.5, 0.5),
          // Kuyruk tareti
          tag(body([[-11.2, 0.5], [-11.8, 0.42], [-12.2, 0]], 7, { y: 0.35 + tailLift(-11.5) }), 'glass'),
          // Uzun bomba bölmesi
          box(1.2, 0.35, 10.0, 0, -1.25, 2.0),
          ...wing({ x0: 1.1, z: 3.6, root: 5.3, y: -0.2, tipX: 15.55, tip: 1.8, sweep: 2.5, dihedral: 4, t: 0.85, shape: 'rounded' }),
          ...mirror(inner, (x) => nacelle(x, -0.3, 5.4, 5.2, 0.72)),
          ...mirror(outer, (x) => nacelle(x, -0.15, 4.9, 4.6, 0.7)),
          ...wing({ x0: 0.3, z: -8.8, root: 2.6, y: 0.4, tipX: 5.0, tip: 2.2, sweep: 0.3, dihedral: 0, t: 0.24 }),
          // Oval ikiz dikey kuyruklar
          ...fins({ x: 5.0, y0: -0.5, z0: -8.5, h: 3.0, root: 2.3, tip: 1.8, sweep: 0.2, t: 0.18 }),
        ],
        props: [
          { x: inner, y: -0.3, z: 5.85, r: 1.6, blades: 3 }, { x: -inner, y: -0.3, z: 5.85, r: 1.6, blades: 3 },
          { x: outer, y: -0.15, z: 5.35, r: 1.6, blades: 3 }, { x: -outer, y: -0.15, z: 5.35, r: 1.6, blades: 3 },
        ],
      };
    }
    case 'mosquito':
      return {
        solids: [
          fuselage({ noseZ: 6.0, tailZ: -6.4, r: 0.72, sy: 1.25, noseR: 0.5, peak: 0.3 }),
          // Burunda dört makineli
          ...mirror(0.12, (x) => tag(box(0.06, 0.06, 0.5, x, 0.2, 6.0), 'dark')),
          canopy(3.4, 1.9, 0.5, 0.78, 0.55),
          ...wing({ x0: 0.7, z: 2.1, root: 3.6, y: -0.15, tipX: 8.26, tip: 1.3, sweep: 1.3, dihedral: 2, t: 0.5, shape: 'rounded' }),
          ...mirror(2.45, (x) => nacelle(x, -0.15, 3.9, 4.8, 0.62)),
          ...wing({ x0: 0.1, z: -4.9, root: 1.8, y: 0.3, tipX: 3.0, tip: 0.9, sweep: 0.5, dihedral: 0, t: 0.15, shape: 'rounded' }),
          ...fins({ y0: 0.5, z0: -4.6, h: 2.3, root: 2.2, tip: 0.9, sweep: 1.1, t: 0.15 }),
        ],
        props: [{ x: 2.45, y: -0.15, z: 4.35, r: 1.65, blades: 3 }, { x: -2.45, y: -0.15, z: 4.35, r: 1.65, blades: 3 }],
      };
    // ================================================================ Çeşitlilik: ilk nesil jetler
    case 'he162': {
      // He 162 A-2, ölçüler üç görünüş çiziminden. Küçük gövde, sivri burun ve burun borusu, altında iki top ağzı, tek
      // parça damla kanopi. Sırtta BMW 003: geniş dudaklı giriş kanopinin hemen üstünde, alt çizgisi düz, üstü arkaya
      // incelir. Hücum kenarı düz kanat, firar kenarı kökte kırılır, uçları aşağı kıvrık. Yukarı açılı yatay kuyruk ve
      // uçlarında ona dik, içe yatık ikiz dikey kuyruk.
      const H = new JetHull([
        [4.2, 0.01, 0.0, -0.03, -0.01], [4.06, 0.14, 0.16, -0.19, -0.01], [3.74, 0.26, 0.29, -0.3, -0.01], [3.24, 0.41, 0.38, -0.37, 0], [1.88, 0.53, 0.45, -0.45, -0.03], [1.1, 0.53, 0.56, -0.44, -0.03],
        [0.74, 0.53, 0.66, -0.43, -0.03], [-1.1, 0.41, 0.73, -0.26, 0.04], [-2.05, 0.3, 0.73, -0.1, 0.12], [-2.4, 0.28, 0.52, -0.07, 0.13], [-3.85, 0.21, 0.36, 0.06, 0.2], [-4.5, 0.08, 0.33, 0.16, 0.24], [-4.87, 0.005, 0.25, 0.22, 0.235],
      ], 2.1);
      const W: WingOpts = { x0: 1.01, z: 0.68, root: 1.84, y: 0.47, tipX: 3.3, tip: 0.87, sweep: 0, dihedral: 5.5, t: 0.26 };
      const T: WingOpts = { x0: 0.12, z: -3.91, root: 0.84, y: 0.33, tipX: 1.66, tip: 0.84, sweep: 0, dihedral: 12.5, t: 0.09 };
      const tipY = W.y + (W.tipX - W.x0) * tanD(W.dihedral);
      const up = new THREE.Vector3(0, 1, 0);
      const pod = new JetHull([
        [1.05, 0.2, 1.28, 0.88, 1.08], [1.3, 0.22, 1.3, 0.86, 1.08], [1.38, 0.27, 1.35, 0.81, 1.08], [1.34, 0.32, 1.41, 0.75, 1.08], [1.2, 0.36, 1.47, 0.69, 1.08], [0.59, 0.38, 1.54, 0.62, 1.08],
        [-0.62, 0.37, 1.45, 0.62, 1.06], [-1.26, 0.31, 1.31, 0.64, 1.0], [-1.84, 0.2, 1.14, 0.72, 0.96], [-2.05, 0.135, 1.09, 0.85, 0.97], [-2.09, 0.13, 1.09, 0.85, 0.97],
      ], 2.1);
      const duct = new JetHull([[0.6, 0.17, 1.25, 0.91, 1.08], [1.06, 0.19, 1.27, 0.89, 1.08]], 2.05, false);
      const pipe = new JetHull([[-2.08, 0.11, 1.07, 0.87, 0.97], [-1.6, 0.095, 1.06, 0.88, 0.97]], 2.05, false);
      const FIN: [number, number, number][] = [[0.06, -4.05, 0.5], [0.2, -3.89, 0.82], [0.7, -3.87, 0.87], [1.2, -3.89, 0.85], [1.33, -3.97, 0.78], [1.43, -4.12, 0.58], [1.46, -4.3, 0.3]];
      return {
        solids: [
          H.geo(12),
          tag(rod(new THREE.Vector3(0, -0.02, 4.15), new THREE.Vector3(0, -0.02, 5.05), 0.012, 4), 'dark'),
          ...[1, -1].map((sd) => portAt(sd * H.sideX(2.88, -0.29), -0.29, 2.88, 0.035, 0.3)),
          tag(H.patch(1, 2.7, 1.9, Math.PI / 2 - 0.45, Math.PI / 2 + 0.45, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[3.24, 0.12, 0.4, 0.1, 0.36], [2.72, 0.33, 0.76, 0.1, 0.44]],
            glass: [[2.72, 0.33, 0.76, 0.1, 0.44], [2.31, 0.37, 0.83, 0.1, 0.46], [1.95, 0.37, 0.82, 0.1, 0.46], [1.76, 0.35, 0.77, 0.1, 0.46]],
            aft: [[1.78, 0.36, 0.78, 0.1, 0.46], [1.65, 0.3, 0.68, 0.1, 0.44], [1.4, 0.12, 0.6, 0.1, 0.44], [1.2, 0.02, 0.55, 0.1, 0.42]],
            frames: [2.72, 1.77],
            posts: [[0.08, 0.41, 3.22], [0.22, 0.72, 2.74]],
            pilot: { z: 2.2, len: 1.4, h: 0.33, y: 0.56, w: 0.33 },
          }),
          // Sırttaki motor: giriş dudağı, koyu kanal, egzoz
          pod.geo(12),
          tag(duct.geo(11), 'dark'),
          tag(duct.disc(0.6, 1, 11), 'dark'),
          new THREE.BoxGeometry(0.34, 0.02, 0.3).translate(0, 1.08, 0.95),
          tag(pipe.geo(11), 'dark'),
          tag(pipe.disc(-1.6, -1, 11), 'dark'),
          tag(new THREE.ConeGeometry(0.06, 0.2, sg(8)).rotateX(-Math.PI / 2).translate(0, 0.97, -1.72), 'dark'),
          // Kök parça (firar kenarı kırılır), dışında flap ve kanatçık; uçta aşağı kıvrık kanatçık
          ...[1, -1].flatMap((sd) => [
            airfoilPart([
              { le: new THREE.Vector3(sd * 0.3, 0.42, W.z), c: 2.4, t: 0.32 },
              { le: new THREE.Vector3(sd * W.x0, W.y, W.z), c: W.root, t: W.t },
            ], up, 0, 1),
            airfoilPart([
              { le: new THREE.Vector3(sd * W.tipX, tipY, W.z), c: W.tip, t: W.t * 0.45 },
              { le: new THREE.Vector3(sd * (W.tipX + 0.16), tipY - 0.11, W.z - 0.04), c: W.tip * 0.82, t: W.t * 0.34 },
              { le: new THREE.Vector3(sd * (W.tipX + 0.3), tipY - 0.25, W.z - 0.14), c: W.tip * 0.5, t: W.t * 0.16 },
            ], new THREE.Vector3(sd * 0.6, 0.8, 0), 0, 1),
          ]),
          ...controlWing(W, 0.78, [[0, 0.5, 'flap'], [0.5, 0.51, null], [0.51, 0.97, 'aileron'], [0.97, 1, null]]),
          ...controlWing(T, 0.6, [[0, 1, 'elevator']]),
          ...jetFin(FIN, 0.1, 0.57, 1, 4, 1.66, 'rudder', -0.27, 0.67),
          ...jetFin(FIN, 0.1, 0.57, 1, 4, -1.66, 'rudderR', 0.27, 0.67),
        ],
        props: [],
        markZ: -2.6,
        lights: [
          { p: [W.tipX + 0.31, tipY - 0.25, W.z - 0.3], kind: 'red' },
          { p: [-W.tipX - 0.31, tipY - 0.25, W.z - 0.3], kind: 'green' },
          { p: [1.5, 1.0, -4.75], kind: 'white' },
          { p: [-1.5, 1.0, -4.75], kind: 'white' },
          { p: [0, -0.46, 3.0], kind: 'landing' },
        ],
      };
    }
    case 'p80': {
      // F-80C, ölçüler üç görünüş çiziminden. Sivri, kapalı burun (altı makineli tüfek), kanat köküne inen eğik yan hava
      // girişleri, kuyruğa doğru alçalan gövde ve uzun sırt yüzgeci, yuvarlak uçlu dikey ve yatay kuyruk. Kanat kökünde
      // hücum kenarı öne genişler. Uçlarda altta sabit tanklar (Kore'de hep tanklı uçtu). Hava frenleri ön karında.
      const H = new JetHull([
        [5.0, 0.01, 0.0, -0.04, -0.02], [4.91, 0.08, 0.09, -0.15, -0.03], [4.78, 0.16, 0.2, -0.25, -0.03], [4.23, 0.29, 0.45, -0.5, -0.02],
        [3.54, 0.48, 0.58, -0.575, -0.02], [2.48, 0.59, 0.67, -0.64, -0.02], [1.33, 0.7, 0.69, -0.66, -0.02], [-0.35, 0.71, 0.69, -0.67, -0.02],
        [-1.61, 0.725, 0.655, -0.63, -0.02], [-2.48, 0.61, 0.575, -0.585, -0.02], [-3.63, 0.48, 0.32, -0.495, -0.08], [-4.42, 0.35, 0.26, -0.41, -0.07],
        [-5.13, 0.27, 0.23, -0.29, -0.03], [-5.38, 0.215, 0.215, -0.235, -0.01], [-5.42, 0.205, 0.205, -0.225, -0.01],
      ], 2.1);
      const W: WingOpts = { x0: 1.7, z: 0.96, root: 2.33, y: -0.27, tipX: 5.73, tip: 1.08, sweep: 0.61, dihedral: 3, t: 0.3 };
      const T: WingOpts = { x0: 0.1, z: -3.77, root: 1.38, y: 0.31, tipX: 2.19, tip: 0.42, sweep: 0.66, dihedral: 0, t: 0.12 };
      const up = new THREE.Vector3(0, 1, 0);
      const tank = (sd: number) => body([[1.19, 0.001], [1.06, 0.16], [0.71, 0.29], [0, 0.365], [-0.71, 0.3], [-1.42, 0.12], [-1.93, 0.01]], 9, { x: sd * 6.05, y: -0.4, smooth: true });
      const pipe = new JetHull([[-5.41, 0.188, 0.188, -0.208, -0.01], [-4.9, 0.165, 0.165, -0.185, -0.01]], 2.05, false);
      const mid = -Math.PI / 2;
      return {
        solids: [
          H.geo(12),
          tag(pipe.geo(12), 'dark'),
          tag(pipe.disc(-4.9, -1, 12), 'dark'),
          tag(new THREE.ConeGeometry(0.09, 0.26, sg(10)).rotateX(-Math.PI / 2).translate(0, -0.01, -5.05), 'dark'),
          ...sideIntake(0.6, [
            [1.4, 0.25, -0.05, -0.56, -0.31], [1.85, 0.27, -0.03, -0.59, -0.31], [1.96, 0.29, -0.01, -0.61, -0.31], [2.02, 0.325, 0.02, -0.635, -0.31], [1.99, 0.355, 0.05, -0.655, -0.31],
            [1.8, 0.375, 0.07, -0.67, -0.31], [1.25, 0.375, 0.06, -0.66, -0.31], [0.5, 0.33, 0.0, -0.62, -0.31], [-0.2, 0.2, -0.12, -0.5, -0.31], [-0.7, 0.03, -0.27, -0.35, -0.31],
          ], [[0.85, 0.22, -0.09, -0.52, -0.31], [1.42, 0.245, -0.055, -0.555, -0.31]], 0.55, 0.2),
          ...[1, -1].flatMap((sd) => [[-0.28, 4.5], [-0.12, 4.32], [0.05, 4.2]].map(([y, z]) => portAt(sd * H.sideX(z, y), y, z, 0.026, 0.11))),
          tag(H.patch(1, 1.95, 1.0, Math.PI / 2 - 0.38, Math.PI / 2 + 0.38, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[2.48, 0.2, 0.69, 0.35, 0.66], [2.02, 0.31, 0.965, 0.35, 0.72]],
            glass: [[2.02, 0.31, 0.965, 0.35, 0.72], [1.73, 0.35, 1.01, 0.35, 0.72], [1.3, 0.35, 0.95, 0.35, 0.72], [0.9, 0.26, 0.84, 0.35, 0.72], [0.66, 0.15, 0.755, 0.35, 0.7]],
            aft: [[0.7, 0.165, 0.77, 0.35, 0.7], [0.55, 0.09, 0.72, 0.35, 0.68], [0.38, 0.02, 0.69, 0.4, 0.66]],
            frames: [2.02, 0.68],
            posts: [[0.13, 0.7, 2.46], [0.2, 0.94, 2.04]],
            pilot: { z: 1.65, len: 1.4, h: 0.34, y: 0.68, w: 0.35 },
          }),
          // Kanat: kökten (gövde içinden) flap, kanatçık; uç yuvarlak. Kökte hücum kenarının öne genişlemesi ayrı parça
          ...controlWing(W, 0.75, [[-0.3, 0.417, 'flap'], [0.417, 0.43, null], [0.43, 0.97, 'aileron'], [0.97, 1, null]], 7),
          ...[1, -1].map((sd) => airfoilPart([
            { le: new THREE.Vector3(sd * 0.6, -0.33, 1.4), c: 0.75, t: 0.26 },
            { le: new THREE.Vector3(sd * 1.72, -0.27, 0.97), c: 0.12, t: 0.15 },
          ], up, 0, 1)),
          ...joint('ucTank', [0, 0, 0], [tank(1), tank(-1)], true),
          ...controlWing(T, 0.64, [[0, 0.96, 'elevator'], [0.96, 1, null]], 8),
          ...jetFin([[0.25, -1.77, 3.57], [0.66, -2.26, 3.0], [0.72, -3.27, 1.96], [0.92, -3.76, 1.42], [1.27, -4.04, 1.07], [1.8, -4.29, 0.73], [2.04, -4.4, 0.6], [2.2, -4.53, 0.42], [2.31, -4.65, 0.2]], 0.16, 0.79, 2, 6),
          body([[-3.75, 0.01], [-4.0, 0.08], [-4.8, 0.09], [-5.2, 0.015]], 8, { y: 0.31, sy: 0.7, smooth: true }),
          // Hava frenleri: ön karında yan yana iki kapak, ön kenarından menteşeli, firar kenarı iner
          ...[1, -1].flatMap((sd) => {
            const [a0, a1, zf, zb] = [mid + 0.08, mid + 0.8, 2.1, 0.95];
            return [
              tag(H.patch(sd, zf - 0.03, zb + 0.03, a0 + 0.02, a1 - 0.02, 0.004), 'dark'),
              ...joint(sd > 0 ? 'airbrakeL' : 'airbrakeR', H.pt(zf, (a0 + a1) / 2, 0.02, sd), [H.patch(sd, zf, zb, a0, a1, 0.012, -0.012)], false, [sd, 0, 0]),
            ];
          }),
        ],
        props: [],
        markZ: -3.3,
        lights: [
          { p: [6.2, -0.03, -0.28], kind: 'red' },
          { p: [-6.2, -0.03, -0.28], kind: 'green' },
          { p: [0, 1.6, -5.07], kind: 'white' },
          { p: [0, -0.85, 3.4], kind: 'landing' },
        ],
      };
    }
    case 'vampire': {
      // Vampire FB.5, ölçüler üç görünüş çiziminden. Kısa, yumurta gövde kapsülü: kanopinin arkasında kambur, sonda kısa
      // egzoz. Kanat kökünde hücum kenarındaki hava girişleri, burnun altında dört 20 mm ağzı. Kanadın içinden çıkan
      // iki ince kuyruk kirişi yukarı eğimli; uçlarında yuvarlak ikiz dikey kuyruk, aralarında tek parça yatay kuyruk.
      const H = new JetHull([
        [3.7, 0.01, 0.0, -0.04, -0.02], [3.56, 0.22, 0.2, -0.24, -0.03], [3.08, 0.46, 0.48, -0.48, -0.05], [2.68, 0.58, 0.56, -0.54, -0.06], [1.8, 0.62, 0.64, -0.6, -0.06],
        [0.52, 0.53, 0.8, -0.56, -0.02], [-0.6, 0.53, 0.72, -0.46, 0], [-1.64, 0.5, 0.48, -0.32, -0.03], [-2.24, 0.27, 0.08, -0.25, -0.09], [-2.35, 0.26, 0.07, -0.25, -0.09],
      ], 2.1);
      const W: WingOpts = { x0: 1.42, z: 1.32, root: 2.84, y: 0.1, tipX: 5.79, tip: 0.86, sweep: 0.88, dihedral: 3.9, t: 0.3 };
      const T: WingOpts = { x0: 0, z: -4.51, root: 1.16, y: 0.8, tipX: 1.5, tip: 1.16, sweep: 0, dihedral: 0, t: 0.12 };
      const tipY = W.y + (W.tipX - W.x0) * tanD(W.dihedral);
      const up = new THREE.Vector3(0, 1, 0);
      const pipe = new JetHull([[-2.34, 0.24, 0.05, -0.23, -0.09], [-1.85, 0.21, 0.03, -0.2, -0.09]], 2.05, false);
      const boom = new JetHull([[0.44, 0.01, 0.2, 0.16, 0.18], [-0.2, 0.14, 0.42, 0.04, 0.22], [-0.6, 0.16, 0.44, 0.04, 0.24], [-1.64, 0.15, 0.48, 0.03, 0.26], [-4.92, 0.11, 0.68, 0.34, 0.51], [-5.16, 0.11, 0.68, 0.36, 0.52], [-5.67, 0.02, 0.6, 0.5, 0.55]], 2.05);
      const FIN: [number, number, number][] = [[0.32, -4.96, 0.6], [0.6, -4.12, 1.54], [0.84, -4.4, 1.26], [1.16, -4.67, 0.99], [1.4, -4.86, 0.78], [1.6, -5.12, 0.5], [1.68, -5.32, 0.22]];
      return {
        solids: [
          H.geo(13),
          tag(pipe.geo(12), 'dark'),
          tag(pipe.disc(-1.85, -1, 12), 'dark'),
          tag(new THREE.ConeGeometry(0.1, 0.26, sg(8)).rotateX(-Math.PI / 2).translate(0, -0.09, -2.0), 'dark'),
          ...[1, -1].flatMap((sd) => [[-0.34, 2.85], [-0.34, 3.2]].map(([y, z]) => portAt(sd * H.sideX(z, y), y, z, 0.03, 0.19))),
          tag(H.patch(1, 2.15, 1.25, Math.PI / 2 - 0.4, Math.PI / 2 + 0.4, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[2.8, 0.12, 0.5, 0.25, 0.46], [2.2, 0.31, 0.96, 0.25, 0.68]],
            glass: [[2.2, 0.31, 0.96, 0.25, 0.68], [1.96, 0.32, 1.06, 0.25, 0.7], [1.4, 0.32, 1.02, 0.25, 0.7], [1.08, 0.26, 0.9, 0.25, 0.7]],
            aft: [[1.1, 0.27, 0.91, 0.25, 0.7], [0.9, 0.2, 0.84, 0.3, 0.68], [0.65, 0.05, 0.775, 0.4, 0.66]],
            frames: [2.2, 1.1],
            posts: [[0.08, 0.5, 2.78], [0.24, 0.93, 2.22]],
            pilot: { z: 1.75, len: 1.5, h: 0.36, y: 0.72, w: 0.31 },
          }),
          // Kök parça (gövdeden kirişe) öne doğru genişler, hücum kenarında koyu hava girişi; dışında flap ve kanatçık
          ...[1, -1].flatMap((sd) => [
            airfoilPart([
              { le: new THREE.Vector3(sd * 0.35, 0.04, 1.8), c: 3.5, t: 0.42 },
              { le: new THREE.Vector3(sd * 0.72, 0.06, 1.75), c: 3.45, t: 0.4 },
              { le: new THREE.Vector3(sd * W.x0, W.y, W.z), c: W.root, t: W.t },
            ], up, 0, 1),
            tag(airfoilPart([
              { le: new THREE.Vector3(sd * 0.68, 0.055, 1.775), c: 0.3, t: 0.15 },
              { le: new THREE.Vector3(sd * 1.36, 0.095, 1.355), c: 0.2, t: 0.05 },
            ], up, 0, 1), 'dark'),
          ]),
          ...controlWing(W, 0.8, [[0, 0.41, 'flap'], [0.41, 0.42, null], [0.42, 0.96, 'aileron'], [0.96, 1, null]], 3),
          // Dalış frenleri: dış kanat üstünde, arka kenarından menteşeli, ön kenarı kalkar
          ...[1, -1].flatMap((sd) => [
            tag(new THREE.BoxGeometry(0.5, 0.008, 0.26).translate(sd * 2.72, 0.325, -0.86), 'dark'),
            ...joint(sd > 0 ? 'airbrakeL' : 'airbrakeR', [sd * 2.72, 0.335, -1.01], [new THREE.BoxGeometry(0.55, 0.014, 0.3).translate(sd * 2.72, 0.335, -0.86)], false, [sd, 0, 0]),
          ]),
          ...[1, -1].map((sd) => boom.geo(9).translate(sd * 1.5, 0, 0)),
          ...jetFin(FIN, 0.11, 0.62, 1, 4, 1.5, 'rudder'),
          ...jetFin(FIN, 0.11, 0.62, 1, 4, -1.5, 'rudderR'),
          ...controlWing(T, 0.61, [[0, 0.96, 'elevator'], [0.96, 1.03, null]]),
          ...mirror(1.5, (x) => body([[-4.32, 0.01], [-4.5, 0.07], [-5.1, 0.07], [-5.72, 0.01]], 7, { x, y: 0.8, sy: 0.7, smooth: true })),
        ],
        props: [],
        markZ: -3.4,
        markY: 0.41,
        lights: [
          { p: [W.tipX + 0.17, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'red' },
          { p: [-W.tipX - 0.17, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'green' },
          { p: [1.5, 1.1, -5.68], kind: 'white' },
          { p: [-1.5, 1.1, -5.68], kind: 'white' },
          { p: [0.95, -0.12, 1.1], kind: 'landing' },
        ],
      };
    }
    case 'ar234':
      return {
        solids: [
          fuselage({ noseZ: 5.8, tailZ: -6.6, r: 0.72, sy: 1.25, noseR: 0.7, peak: 0.12, rise: 0.3 }),
          // Tamamen camlı burun kokpiti
          tag(body([[6.6, 0], [6.35, 0.35], [5.7, 0.55]], 9, { sy: 1.25 }), 'glass'),
          // Yüksek kanat, altında iki motor
          ...wing({ x0: 0.6, z: 1.5, root: 3.0, y: 0.45, tipX: 7.2, tip: 1.3, sweep: 0.5, dihedral: 2, t: 0.38 }),
          ...mirror(2.9, (x) => jetPod(x, -0.2, 2.6, 4.2, 0.48)),
          ...mirror(2.9, (x) => tag(body([[2.65, 0.32], [2.5, 0.38], [2.2, 0.4]], 9, { x, y: -0.2 }), 'dark')),
          ...wing({ x0: 0.1, z: -4.9, root: 1.6, y: 0.4, tipX: 2.6, tip: 0.8, sweep: 0.5, dihedral: 0, t: 0.12 }),
          ...fins({ y0: 0.5, z0: -4.4, h: 2.0, root: 2.0, tip: 0.9, sweep: 1.0, t: 0.14 }),
        ],
        props: [],
      };
    case 'il28':
      return {
        solids: [
          glassNose(7.9, 0.85, 1.2, 1.15),
          fuselage({ noseZ: 7.9, tailZ: -7.8, r: 0.95, sy: 1.15, noseR: 0.9, peak: 0.2, rise: 0.3 }),
          canopy(5.6, 2.0, 0.55, 1.0, 0.55, true),
          // Kuyruk taret kabini
          tag(body([[-7.6, 0.42], [-8.2, 0.38], [-8.6, 0]], 7, { y: 0.1 + tailLift(-7.9) }), 'glass'),
          ...wing({ x0: 1.0, z: 2.2, root: 4.0, y: 0.2, tipX: 10.72, tip: 1.6, sweep: 0.8, dihedral: 2, t: 0.5 }),
          // Kanat altında, hücum kenarının önüne uzanan motor naselleri
          ...mirror(3.25, (x) => jetPod(x, -0.35, 4.6, 6.6, 0.7)),
          ...mirror(3.25, (x) => tag(body([[4.65, 0.48], [4.5, 0.58], [4.1, 0.62]], 9, { x, y: -0.35 }), 'dark')),
          // Ok açılı kuyruk
          ...fins({ y0: 0.7, z0: -5.0, h: 3.0, root: 3.0, tip: 1.3, sweep: 2.2, t: 0.18 }),
          ...wing({ x0: 0.1, z: -6.0, root: 2.2, y: 0.8, tipX: 3.6, tip: 1.0, sweep: 1.5, dihedral: 7, t: 0.15 }),
        ],
        props: [],
      };
    // ================================================================ Sonraki nesil jetler (yer tutucu)
    case 'jetDelta':
      return {
        solids: [
          body([[7.3, 0], [6.7, 0.22], [6.5, 0.5], [5.8, 0.62], [2.0, 0.68], [-4.0, 0.65], [-6.0, 0.56], [-6.6, 0.52]]),
          body([[4.6, 0], [4.2, 0.25], [3.4, 0.32], [0, 0.26], [-3.0, 0]], 6, { y: 0.52, sx: 0.8 }),
          ...wing({ x0: 0.5, z: 1.8, root: 5.4, y: -0.1, tipX: 3.6, tip: 0.35, sweep: 4.9, dihedral: -2, t: 0.18 }),
          ...wing({ x0: 0.3, z: -4.6, root: 1.6, y: -0.05, tipX: 1.8, tip: 0.5, sweep: 1.4, dihedral: 0, t: 0.1 }),
          ...fins({ y0: 0.5, z0: -2.4, h: 2.0, root: 3.2, tip: 0.9, sweep: 2.9, t: 0.12 }),
        ],
        props: [],
      };
    case 'jetHeavy':
      return {
        solids: [
          body([[8.8, 0], [8.0, 0.45], [6.5, 0.75], [3.0, 0.92], [-2.0, 0.92], [-6.0, 0.8], [-8.6, 0.7], [-9.0, 0.66]]),
          body([[5.6, 0], [5.0, 0.3], [3.5, 0.42], [1.8, 0.36], [1.0, 0]], 6, { y: 0.78, sx: 0.85 }),
          ...mirror(1.15, (x) => box(0.7, 1.3, 4.6, x, -0.05, 2.6)),
          ...wing({ x0: 1.0, z: 2.4, root: 5.8, y: -0.35, tipX: 4.6, tip: 3.4, sweep: 3.2, dihedral: 0, t: 0.36 }),
          ...wing({ x0: 4.6, z: -0.8, root: 3.4, y: -0.35, tipX: 6.3, tip: 1.6, sweep: 1.6, dihedral: 12, t: 0.25 }),
          ...wing({ x0: 0.6, z: -6.4, root: 2.2, y: 0.3, tipX: 3.2, tip: 1.0, sweep: 1.5, dihedral: -23, t: 0.12 }),
          ...fins({ y0: 0.7, z0: -4.4, h: 2.7, root: 3.6, tip: 1.2, sweep: 3.0, t: 0.16 }),
        ],
        props: [],
      };
    case 'jetTwinTail':
      return {
        solids: [
          body([[9.6, 0], [8.6, 0.4], [6.5, 0.72], [3.5, 0.85], [0, 0.8], [-3.0, 0.6]]),
          box(3.6, 0.7, 10.5, 0, -0.05, -2.8),
          ...mirror(0.9, (x) => body([[0, 0.62], [-8.6, 0.62], [-9.6, 0.55]], 8, { x, y: -0.1 })),
          ...mirror(1.55, (x) => box(1.1, 1.15, 4.2, x, -0.3, 1.9)),
          body([[6.6, 0], [5.9, 0.33], [4.6, 0.45], [3.3, 0.38], [2.6, 0]], 6, { y: 0.7, sx: 0.85 }),
          ...wing({ x0: 1.8, z: 1.8, root: 6.0, y: 0.05, tipX: 6.5, tip: 1.5, sweep: 4.8, dihedral: -1, t: 0.3 }),
          ...wing({ x0: 1.5, z: -6.6, root: 2.8, y: -0.05, tipX: 4.1, tip: 1.1, sweep: 1.8, dihedral: 0, t: 0.12 }),
          ...fins({ x: 1.35, y0: 0.3, z0: -4.5, h: 3.0, root: 3.4, tip: 1.3, sweep: 2.6, t: 0.14, cant: 8 }),
        ],
        props: [],
      };
    case 'jetCanard':
      return {
        solids: [
          body([[7.8, 0], [7.0, 0.34], [5.5, 0.6], [2.0, 0.8], [-3.0, 0.78], [-6.5, 0.62], [-7.4, 0.58]]),
          body([[5.0, 0], [4.4, 0.3], [3.3, 0.4], [2.2, 0.3], [1.6, 0]], 6, { y: 0.68, sx: 0.85 }),
          box(1.4, 0.75, 3.4, 0, -0.85, 1.4),
          ...wing({ x0: 0.7, z: 0.9, root: 6.8, y: -0.25, tipX: 5.4, tip: 0.9, sweep: 5.4, dihedral: -1, t: 0.22 }),
          ...wing({ x0: 0.6, z: 4.4, root: 1.5, y: 0.2, tipX: 2.3, tip: 0.6, sweep: 1.1, dihedral: 4, t: 0.1 }),
          ...fins({ y0: 0.65, z0: -2.6, h: 2.6, root: 3.6, tip: 1.1, sweep: 2.9, t: 0.13 }),
        ],
        props: [],
      };
    case 'jetStealth':
      return {
        solids: [
          // 4 dilimli torna = elmas kesit (yanlarda keskin kenar)
          body([[9.5, 0], [7.5, 0.7], [4.0, 1.1], [0, 1.2], [-5.0, 1.1], [-8.8, 0.8], [-9.4, 0.72]], 4, { sx: 1.55, sy: 0.6 }),
          body([[6.2, 0], [5.5, 0.3], [4.3, 0.4], [3.0, 0.3], [2.4, 0]], 6, { y: 0.6, sx: 0.85 }),
          ...mirror(1.7, (x) => box(1.0, 1.0, 4.2, x, -0.25, 2.6)),
          ...wing({ x0: 1.5, z: 2.6, root: 7.4, y: 0, tipX: 6.8, tip: 1.3, sweep: 5.0, dihedral: -3, t: 0.24 }),
          ...wing({ x0: 1.3, z: -5.6, root: 3.1, y: 0, tipX: 3.8, tip: 1.2, sweep: 2.0, dihedral: 0, t: 0.12 }),
          ...fins({ x: 1.5, y0: 0.3, z0: -3.8, h: 2.6, root: 3.4, tip: 1.4, sweep: 2.2, t: 0.12, cant: 27 }),
        ],
        props: [],
      };
    default:
      return defineModel('spitfire');
  }
}

type Part = 'body' | 'glass' | 'dark' | 'pilot';

/** Parça türüne göre ayrı malzemeyle çizilir (cam kanopi, koyu pervane göbeği/hava alığı/egzoz, pilot). */
function partOf(g: Geo): Part {
  return (g.userData.part as Part | undefined) ?? 'body';
}

/** Yalnız konum ve normal (indekssiz). Normali olmayan parça (düşük ayrıntıda kutu kanat) yüz normali alır. */
function cleanGeo(g: Geo): Geo {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  const c = new THREE.BufferGeometry();
  c.setAttribute('position', n.getAttribute('position'));
  c.setAttribute('normal', n.getAttribute('normal'));
  return c;
}

/** Parçaları birleştirir; her parça kendi normalini taşır (dönel gövde ve profil pürüzsüz, kutu köşeli). */
function merge(list: Geo[]): Geo {
  const m = mergeGeometries(list.map(cleanGeo), false);
  if (!m) throw new Error('model birleştirilemedi');
  m.computeBoundingSphere();
  return m;
}

/** Eklemin birleşmiş ağları (gövde rengi, cam, küçük parçalar). */
interface JointModel { name: string; pivot: THREE.Vector3; big: boolean; axis: THREE.Vector3 | null; solid: Geo | null; glass: Geo | null; detail: Geo | null }

interface CachedModel {
  solid: Geo;
  glass: Geo | null;
  /** Küçük parçalar tek ağda (koyu metal, pilot, seyir lambaları). */
  detail: Geo | null;
  /** Hareketli parçalar (pervaneler dahil). */
  joints: JointModel[];
  /** Bütün pervane diskleri. */
  disc: Geo | null;
  /** Kaplama malzemesi (boya, doku, armalar; model başına). */
  skin: THREE.Material;
  gear: Geo | null;
  props: PropDef[];
  emitters: THREE.Vector3[];
  lights: NonNullable<ModelDef['lights']>;
  length: number;
  radius: number;
  probe: Probe;
  bb: THREE.Box3;
}

const geoCache = new Map<string, CachedModel>();
const _ray = new THREE.Raycaster();
const _o = new THREE.Vector3();
const _dn = new THREE.Vector3();

/** Model geometrisi üzerinde ışın yoklaması (arma, iniş takımı, egzoz yerleşimi için). */
class Probe {
  private readonly mesh: THREE.Mesh;
  constructor(g: Geo) {
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  }
  /** (x, z) noktasında yukarıdan / aşağıdan ilk yüzey. */
  vertical(x: number, z: number, fromTop: boolean): THREE.Intersection | null {
    _o.set(x, fromTop ? 40 : -40, z);
    _dn.set(0, fromTop ? -1 : 1, 0);
    _ray.set(_o, _dn);
    return _ray.intersectObject(this.mesh, false)[0] ?? null;
  }
  /** (y, z) noktasında sağ yandan ilk yüzey. */
  side(y: number, z: number): THREE.Intersection | null {
    _o.set(40, y, z);
    _dn.set(-1, 0, 0);
    _ray.set(_o, _dn);
    return _ray.intersectObject(this.mesh, false)[0] ?? null;
  }
  /** (x0, y, z) noktasından x yönünde (dir ±1) ilk yüzey. */
  across(x0: number, y: number, z: number, dir: number): THREE.Intersection | null {
    _o.set(x0, y, z);
    _dn.set(dir, 0, 0);
    _ray.set(_o, _dn);
    return _ray.intersectObject(this.mesh, false)[0] ?? null;
  }
  /** x açıklığında kanadın veteri: [ön kenar z, arka kenar z] (en uzun kesintisiz parça). */
  chord(x: number, zMax: number, zMin: number): [number, number] | null {
    let best: [number, number] | null = null;
    let cur: [number, number] | null = null;
    for (let z = zMax; z >= zMin; z -= 0.08) {
      const hit = this.vertical(x, z, true);
      if (hit) {
        if (!cur) cur = [z, z];
        else cur[1] = z;
      } else if (cur) {
        if (!best || cur[0] - cur[1] > best[0] - best[1]) best = cur;
        cur = null;
      }
    }
    if (cur && (!best || cur[0] - cur[1] > best[0] - best[1])) best = cur;
    return best && best[0] - best[1] > 0.4 ? best : null;
  }
}

function specOfModel(kind: string): AircraftSpec | undefined {
  return SPEC_LIST.find((s) => s.model === kind);
}

/** a'dan b'ye ince silindir (anten, tel, namlu, pitot). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 5): Geo {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), sg(seg));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** Arma yerleri: kanat üstü (alt yüzde de çizilir), gövde yanları, ortadaki dikey kuyruğun iki yüzü. */
function markSpots(probe: Probe, bb: THREE.Box3, fins: FinRec[], markZ?: number, markY?: number): (MarkSpot & { fin?: boolean })[] {
  const out: (MarkSpot & { fin?: boolean })[] = [];
  const half = bb.max.x;
  const x = half * 0.68;
  const ch = probe.chord(x, bb.max.z, bb.min.z);
  if (ch) {
    const z = (ch[0] + ch[1]) / 2;
    const hit = probe.vertical(x, z, true);
    if (hit && hit.face) {
      const r = Math.min((ch[0] - ch[1]) * 0.36, half * 0.11);
      // Kanat yüzeyine (dihedral eğimine) oturt; yön: armanın "üstü" buruna baksın
      const fn = hit.face.normal.clone();
      if (fn.y < 0) fn.negate();
      for (const s of [1, -1]) {
        out.push({
          p: new THREE.Vector3(hit.point.x * s, hit.point.y, hit.point.z), n: new THREE.Vector3(fn.x * s, fn.y, fn.z),
          t: new THREE.Vector3(-1, 0, 0), r, fuselage: false,
        });
      }
    }
  }
  // Gövde yanı: arka gövdede
  const zf = markZ ?? bb.min.z * 0.42;
  const sh = probe.side(markY ?? 0.05, zf);
  if (sh && sh.face && sh.point.x > 0.2) {
    const top = probe.vertical(0, zf, true);
    const bot = probe.vertical(0, zf, false);
    const hgt = top && bot ? top.point.y - bot.point.y : 1;
    const r = markY !== undefined ? 0.2 : Math.min(hgt * 0.3, 0.75);
    const yc = markY ?? (top && bot ? (top.point.y + bot.point.y) / 2 : 0);
    const hit = probe.side(yc, zf);
    if (hit && hit.face) {
      for (const s of [1, -1]) {
        out.push({
          p: new THREE.Vector3(hit.point.x * s, hit.point.y, hit.point.z), n: new THREE.Vector3(s, 0, 0),
          t: new THREE.Vector3(0, 0, -s), r, fuselage: true,
        });
      }
    }
  }
  // Dikey kuyruk (tek, ortada): yarı yükseklikte, iki yüz; yön burna doğru (kuyruk bayrağı önden başlar)
  const f = fins.find((q) => Math.abs(q.x) < 0.3);
  if (f) {
    const y = f.yRoot + (f.yTop - f.yRoot) * 0.5;
    const hit = probe.across(3, y, f.zMid, -1);
    if (hit && Math.abs(hit.point.x) < 0.5) {
      const r = Math.min((f.yTop - f.yRoot) * 0.3, f.chordMid * 0.3);
      for (const s of [1, -1]) {
        out.push({
          p: new THREE.Vector3(hit.point.x * s, hit.point.y, hit.point.z), n: new THREE.Vector3(s, 0, 0),
          t: new THREE.Vector3(0, 0, 1), r, fuselage: true, fin: true,
        });
      }
    }
  }
  return out;
}

/** Katlanır iniş takımı: ana bacaklar kanat altında, kuyruk ya da burun tekerleği. */
/** İniş takımı katlanarak açılıp kapanan (eklemli) modeller; diğerlerinde takım görünür ya da gizli. */
const FOLDING_GEAR = new Set(['mig15']);

/**
 * Hava frenleri (MiG-15): arka gövdenin iki yanında, gövde yüzeyine oturan dikdörtgen kapaklar; ön kenarından
 * menteşeli (dikey eksen), dışa 55° açılır. Eklemler airbrakeL (+x) ve airbrakeR.
 */
function airbrakes(): Geo[] {
  const { zf, len, h, y } = MIG_BRAKE;
  return [1, -1].flatMap((s) => {
    const r = migRadius(zf);
    const x = s * (Math.sqrt(Math.max(r * r - ((y - 0) / MIG_SY) ** 2, 0.01)) + 0.02);
    return joint(s > 0 ? 'airbrakeL' : 'airbrakeR', [x, y, zf], [brakeShell(s, zf, zf - len, y - h / 2, y + h / 2, 0.012, 0.012 - 0.022)], false, [0, 1, 0]);
  });
}

function landingGear(probe: Probe, bb: THREE.Box3, spec: AircraftSpec | undefined, kind: string): Geo[] {
  if (!spec || kind === 'ju87b' || kind === 'ju87d') return [];
  if (kind === 'mig15') return migGear(gearHeight(spec));
  if (kind === 'sabre') return sabreGear(gearHeight(spec));
  if (kind === 'f84') return thunderjetGear(gearHeight(spec));
  if (kind === 'p80') return shootingStarGear(gearHeight(spec));
  if (kind === 'me262') return schwalbeGear(gearHeight(spec));
  if (kind === 'meteor') return meteorGear(gearHeight(spec));
  if (kind === 'vampire') return vampireGear(gearHeight(spec));
  if (kind === 'he162') return salamanderGear(gearHeight(spec));
  const gh = spec.span > 25 ? 3.4 : spec.engines > 1 ? 2.6 : 1.9;
  const half = bb.max.x;
  const tricycle = !spec.tailDragger;
  const x = half * (spec.engines > 1 ? (spec.engines > 2 ? 0.24 : 0.3) : 0.2);
  const ch = probe.chord(x, bb.max.z, bb.min.z);
  if (!ch) return [];
  const z = ch[0] - (ch[0] - ch[1]) * (tricycle ? 0.55 : 0.3);
  const bot = probe.vertical(x, z, false);
  const yb = bot ? bot.point.y : -0.4;
  const wr = gh * 0.2;
  const out: Geo[] = [];
  const strut = (sx: number, top: number, zz: number, w: number) => {
    const len = top - (-gh + wr);
    const g = DETAIL ? new THREE.CylinderGeometry(w * 0.5, w * 0.55, len, sg(5)) : new THREE.BoxGeometry(w, len, w);
    g.translate(sx, top - len / 2, zz);
    out.push(g);
  };
  const wheel = (sx: number, zz: number, r: number, tw: number) => {
    const g = new THREE.CylinderGeometry(r, r, tw, sg(12)).rotateZ(Math.PI / 2);
    g.translate(sx, -gh + r, zz);
    out.push(g);
    if (DETAIL) {
      // Jant göbeği: lastikten biraz dışarıda
      const hub = new THREE.CylinderGeometry(r * 0.45, r * 0.5, tw * 1.08, sg(8)).rotateZ(Math.PI / 2);
      hub.translate(sx, -gh + r, zz);
      out.push(hub);
    }
  };
  // Katlanır takım (FOLDING_GEAR): her bacak kendi ekleminde, üst ucundan döner; ana bacaklar içe (Z ekseni), burun
  // bacağı öne (X ekseni) toplanır
  const fold = FOLDING_GEAR.has(kind);
  const leg = (from: number, name: string, pivot: V3, axis: V3) => {
    if (fold) for (const g of out.slice(from)) joint(name, pivot, [tag(g, 'dark')], false, axis);
  };
  for (const s of [1, -1]) {
    const n0 = out.length;
    strut(x * s, yb, z, wr * 0.35);
    wheel(x * s, z, wr, wr * 0.55);
    // Kapak
    const door = new THREE.BoxGeometry(0.05, (yb + gh) * 0.6, wr * 1.6);
    door.translate(x * s + s * wr * 0.6, yb - (yb + gh) * 0.3, z);
    out.push(door);
    leg(n0, s > 0 ? 'takimL' : 'takimR', [x * s, yb, z], [0, 0, 1]);
  }
  if (tricycle) {
    const zn = bb.max.z * 0.62;
    const nb = probe.vertical(0, zn, false);
    const yn = nb ? nb.point.y : -0.3;
    const n0 = out.length;
    strut(0, yn, zn, wr * 0.3);
    wheel(0, zn, wr * 0.75, wr * 0.45);
    leg(n0, 'takimN', [0, yn, zn], [1, 0, 0]);
  } else {
    const zt = bb.min.z * 0.86;
    const tb = probe.vertical(0, zt, false);
    const yt = tb ? tb.point.y : 0;
    strut(0, yt, zt, wr * 0.22);
    wheel(0, zt, wr * 0.45, wr * 0.35);
  }
  return out;
}

/**
 * Egzoz çıkıntıları (motor tipine göre) ve is izlerinin başladığı yerler:
 * - sıra motorlu tek motorlu: burun yanlarında altışar boru (geriye eğik ejektör);
 * - yıldız motorlu tek motorlu: kaporta arkasında iki yanda üçer çıkış;
 * - pervaneli çok motorlu: her motor naselinin dış yanında iki çıkış.
 */
function exhausts(probe: Probe, bb: THREE.Box3, spec: AircraftSpec | undefined, props: PropDef[]): { geos: Geo[]; soot: THREE.Vector4[] } {
  const geos: Geo[] = [];
  const soot: THREE.Vector4[] = [];
  if (!spec || spec.engine.kind === 'jet') return { geos, soot };
  /** s: yan (+1 sağ). Yüksek ayrıntıda yuvarlak boru, dışa ve geriye bakar. */
  const stub = (x: number, y: number, z: number, w: number, h: number, l: number, s: number) => {
    if (DETAIL) {
      const g = new THREE.CylinderGeometry(h * 0.42, h * 0.5, w * 1.2, sg(6)).rotateZ(-s * Math.PI / 2).rotateY(s * 0.6);
      g.translate(x, y, z);
      geos.push(g);
      return;
    }
    const g = new THREE.BoxGeometry(w, h, l);
    g.translate(x, y, z);
    geos.push(g);
  };
  if (spec.engines === 1 && spec.engine.kind === 'inline') {
    const nose = bb.max.z;
    let last: THREE.Vector3 | null = null;
    for (let i = 0; i < 6; i++) {
      const z = nose - 0.95 - i * 0.26;
      const hit = probe.side(0.14, z);
      if (!hit) continue;
      for (const s of [1, -1]) stub((hit.point.x + 0.06) * s, 0.14, z, 0.18, 0.13, 0.2, s);
      last = new THREE.Vector3(hit.point.x, 0.14, z);
    }
    if (last) soot.push(new THREE.Vector4(last.x, last.y, last.z + 0.4, 2.8));
  } else if (spec.engines === 1) {
    const z = (props[0]?.z ?? bb.max.z) - 1.9;
    for (const y of [-0.3, 0, 0.3]) {
      const hit = probe.side(y, z);
      if (!hit) continue;
      for (const s of [1, -1]) stub((hit.point.x + 0.05) * s, y, z, 0.16, 0.16, 0.34, s);
      soot.push(new THREE.Vector4(hit.point.x, y, z, 2.2));
    }
  } else {
    for (const p of props) {
      if (!p.x) continue;
      const s = Math.sign(p.x);
      for (const dz of [1.4, 1.8]) {
        const z = p.z - dz;
        const hit = probe.across(p.x + s * 4, p.y ?? 0, z, -s);
        if (hit && Math.abs(hit.point.x - p.x) < 1.5) {
          stub(hit.point.x + s * 0.05, p.y ?? 0, z, 0.16, 0.14, 0.3, s);
          if (s > 0 && dz > 1.5) soot.push(new THREE.Vector4(hit.point.x, p.y ?? 0, z, 2.6));
        }
      }
    }
  }
  return { geos, soot };
}

/**
 * Yoğuşma izinin çıktığı noktalar (model ekseninde): pervaneli çok motorluda her motorun arkası, tek motorluda gövde
 * arkası; jette lüle (çift motorlu jette kanat naselleri).
 */
function contrailEmitters(bb: THREE.Box3, spec: AircraftSpec | undefined, props: PropDef[]): THREE.Vector3[] {
  if (props.length > 1) return props.map((p) => new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z - 3));
  if (spec?.engine.kind === 'jet' && spec.engine.count === 2) {
    const x = spec.span * 0.2;
    return [new THREE.Vector3(x, -0.3, bb.min.z * 0.15), new THREE.Vector3(-x, -0.3, bb.min.z * 0.15)];
  }
  return [new THREE.Vector3(0, 0, bb.min.z * (spec?.engine.kind === 'jet' ? 0.95 : 0.4))];
}

/**
 * Yüksek ayrıntının küçük parçaları: kanopinin altında pilot(lar) ve zırhlı başlık plakası; 1950 öncesi pervaneli tek
 * motorlularda anten (çerçeveli kanopide direk ve kuyruğa tel, kabarcıkta kırbaç anten); sağ kanat altında pitot
 * borusu; kanat hücum kenarından taşan top ve makineli tüfek namluları, pervane göbeğinden top.
 */
function smallParts(
  probe: Probe, bb: THREE.Box3, spec: AircraftSpec | undefined, def: ModelDef, canopies: CanopyRec[], fins: FinRec[],
): { dark: Geo[]; pilot: Geo[]; navRed: Geo[]; navGreen: Geo[] } {
  const dark: Geo[] = [];
  const pilot: Geo[] = [];
  const navRed: Geo[] = [];
  const navGreen: Geo[] = [];
  if (!spec) return { dark, pilot, navRed, navGreen };
  const half = bb.max.x;
  // Seyir lambaları: kanat uçlarında, sol kırmızı, sağ yeşil (gece ışıksız malzemeyle parlar). Işığı tanımlı uçakta
  // ışığın yerinde; yoksa kanat ucunun üstünde
  const tipX = half * 0.985;
  const lampR = def.lights?.find((l) => l.kind === 'red');
  const lampG = def.lights?.find((l) => l.kind === 'green');
  const tch = lampR ? null : probe.chord(tipX, bb.max.z, bb.min.z) ?? probe.chord(half * 0.95, bb.max.z, bb.min.z);
  if (lampR && lampG) {
    const r = Math.min(0.07, Math.max(0.035, spec.span * 0.004));
    navRed.push(new THREE.SphereGeometry(r, sg(5), sg(3)).translate(...lampR.p));
    navGreen.push(new THREE.SphereGeometry(r, sg(5), sg(3)).translate(...lampG.p));
  } else if (tch) {
    const zc = tch[0] - (tch[0] - tch[1]) * 0.3;
    const top = probe.vertical(tipX, zc, true);
    if (top) {
      const r = Math.min(0.07, Math.max(0.035, spec.span * 0.004));
      navRed.push(new THREE.SphereGeometry(r, sg(5), sg(3)).translate(top.point.x, top.point.y - r * 0.3, zc));
      navGreen.push(new THREE.SphereGeometry(r, sg(5), sg(3)).translate(-top.point.x, top.point.y - r * 0.3, zc));
    }
  }
  const c0 = canopies[0];
  if (c0) {
    const s = Math.min(1, c0.h / 0.45);
    const seats: [number, number][] = c0.w > 0.62
      ? [[c0.w * 0.32, c0.z], [-c0.w * 0.32, c0.z]]
      : c0.len > 3.2 ? [[0, c0.z + c0.len * 0.18], [0, c0.z - c0.len * 0.22]] : [[0, c0.z - c0.len * 0.05]];
    for (const [x, z] of seats) {
      // Pilot: omuzlu gövde (kapsül), boyun, kask; kask üstünde gözlük, önünde gösterge kaplaması ve nişangâh
      const yb = c0.y + c0.h * 0.02;
      // Kokpit içi: koyu tekne (taban ve yan konsollar), camdan görünür
      dark.push(new THREE.BoxGeometry(c0.w * 1.7, 0.06, c0.len * 0.8).translate(x, c0.y - 0.12, z));
      for (const k of [1, -1]) dark.push(new THREE.BoxGeometry(0.1 * s, 0.14 * s, c0.len * 0.45).translate(x + k * c0.w * 0.62, c0.y - 0.04, z + 0.1));
      pilot.push(new THREE.CapsuleGeometry(0.15 * s, 0.16 * s, sg(3), sg(8)).scale(1.45, 1, 0.85).translate(x, yb, z - 0.04));
      pilot.push(new THREE.CylinderGeometry(0.05 * s, 0.06 * s, 0.1 * s, sg(6)).translate(x, yb + 0.19 * s, z - 0.03));
      pilot.push(new THREE.SphereGeometry(0.118 * s, sg(9), sg(7)).scale(1, 1.05, 1.12).translate(x, c0.y + c0.h * 0.42, z - 0.01));
      dark.push(new THREE.BoxGeometry(0.17 * s, 0.045 * s, 0.05 * s).translate(x, c0.y + c0.h * 0.42, z + 0.1 * s));
      dark.push(new THREE.BoxGeometry(0.46 * s, 0.1 * s, 0.22 * s).translate(x, c0.y + c0.h * 0.08, z + 0.52 * s));
      dark.push(new THREE.BoxGeometry(0.07 * s, 0.12 * s, 0.07 * s).translate(x, c0.y + c0.h * 0.08 + 0.1 * s, z + 0.5 * s));
      dark.push(new THREE.BoxGeometry(0.34 * s, 0.32 * s, 0.04).translate(x, c0.y + c0.h * 0.38, z - 0.2 * s));
    }
  }
  const single = spec.engines === 1 && spec.engine.kind !== 'jet';
  if (c0 && single && spec.year < 1950) {
    const zm = c0.z - c0.len * 0.5 - 0.2;
    const top = probe.vertical(0, zm, true);
    if (top) {
      const base = top.point.clone();
      const tip = new THREE.Vector3(0, base.y + (c0.bubble ? 0.55 : 0.42), zm - (c0.bubble ? 0.25 : 0.12));
      dark.push(rod(base.clone().setY(base.y - 0.05), tip, c0.bubble ? 0.012 : 0.022));
      const f = fins.find((q) => Math.abs(q.x) < 0.3);
      if (!c0.bubble && f) dark.push(rod(tip, new THREE.Vector3(0, f.yTop - 0.08, f.zTop), 0.006, 3));
    }
  }
  if (spec.engine.kind !== 'jet') {
    const x = half * 0.8;
    const ch = probe.chord(x, bb.max.z, bb.min.z);
    const bot = ch ? probe.vertical(x, ch[0] - 0.2, false) : null;
    if (ch && bot) dark.push(rod(new THREE.Vector3(x, bot.point.y - 0.05, ch[0] - 0.25), new THREE.Vector3(x, bot.point.y - 0.05, ch[0] + 0.45), 0.018, 4));
  }
  for (const g of spec.guns) {
    const cannon = g.caliber === 'cannon';
    const count = Number(/^(\d+) ×/.exec(g.name)?.[1] ?? 1);
    if (g.mount === 'wing' || g.mount === 'root') {
      const per = g.paired ? Math.ceil(count / 2) : count;
      for (let k = 0; k < per; k++) {
        const x = Math.abs(g.x || half * 0.4) + (k - (per - 1) / 2) * (cannon ? 0.45 : 0.22);
        const ch = probe.chord(x, bb.max.z, bb.min.z);
        if (!ch) continue;
        const t = probe.vertical(x, ch[0] - 0.25, true);
        const b = probe.vertical(x, ch[0] - 0.25, false);
        if (!t || !b) continue;
        const y = (t.point.y + b.point.y) / 2;
        for (const s of g.paired ? [1, -1] : [Math.sign(g.x) || 1]) {
          dark.push(rod(new THREE.Vector3(x * s, y, ch[0] - 0.3), new THREE.Vector3(x * s, y, ch[0] + (cannon ? 0.75 : 0.18)), cannon ? 0.042 : 0.016, 6));
        }
      }
    } else if (g.mount === 'hub' && def.props[0]) {
      const p = def.props[0];
      dark.push(rod(new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z), new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z + 0.36), 0.032, 6));
    }
  }
  return { dark, pilot, navRed, navGreen };
}

function cached(kind: string, detail: number): CachedModel {
  const key = `${kind}|${detail}`;
  let c = geoCache.get(key);
  if (c) return c;
  // Yerleşim yoklamaları (arma, takım, egzoz, namlu) düşük ayrıntılı geometride: sonuç aynı, ışın testi çok daha az
  const low = detail ? cached(kind, 0) : null;
  DETAIL = detail;
  RES = detail ? HIRES[kind] ?? 1 : 1;
  // Düşük ayrıntıda ayrıntılı uçakların parça sayısı çok: profil noktaları da azalır
  setAirfoilRes(detail ? Math.round(10 * RES) : HIRES[kind] ? 7 : 10);
  frameSink = [];
  canopySink = [];
  finSink = [];
  tailLift = () => 0;
  const def = defineModel(kind);
  tailLift = () => 0;
  const frames = frameSink;
  const canopies = canopySink;
  const finRecs = finSink;
  frameSink = [];
  canopySink = [];
  finSink = [];
  const jointOf = (g: Geo) => g.userData.joint as JointTag | undefined;
  const split = (list: Geo[]) => {
    const out: Record<Part, Geo[]> = { body: [], glass: [], dark: [], pilot: [] };
    for (const g of list) out[partOf(g)].push(g);
    return out;
  };
  const byPart = split(def.solids.filter((g) => !jointOf(g)));
  const solid = merge(byPart.body);
  solid.computeBoundingBox();
  const bb = solid.boundingBox!;
  const all = merge(def.solids);
  const probe = low ? low.probe : new Probe(all);
  const spec = specOfModel(kind);
  const ex = exhausts(probe, bb, spec, def.props);
  const extra = detail ? smallParts(probe, bb, spec, def, canopies, finRecs) : { dark: [], pilot: [], navRed: [], navGreen: [] };
  const info: SkinInfo = {
    livery: LIVERIES[kind] ?? FALLBACK_LIVERY, noseZ: bb.max.z, span: bb.max.x * 2, soot: ex.soot,
    marks: markSpots(probe, bb, finRecs, def.markZ, def.markY), nation: nationOf(spec?.origin),
  };
  // Katlanır takımın bacakları ve hava frenleri eklem olur
  const gearAll = landingGear(probe, bb, spec, kind);
  const gear = gearAll.filter((g) => !jointOf(g));
  const extraJoints = [...gearAll.filter((g) => jointOf(g)), ...(kind === 'mig15' ? airbrakes() : [])];
  const opt = (g?: Geo[]) => (g && g.length ? merge(g) : null);
  all.computeBoundingSphere();
  const dark = LOOK.dark[detail];
  // Eklemler: model tanımındakiler ve pervaneler (palalar göbek çevresinde döner)
  const jointGeos = [...def.solids.filter((g) => jointOf(g)), ...extraJoints, ...def.props.flatMap((p, i) => joint(`pervane${i}`, [p.x ?? 0, p.y ?? 0, p.z], [bladeSet(p)]))];
  const joints: JointModel[] = [...new Set(jointGeos.map((g) => jointOf(g)!.name))].map((name) => {
    const list = jointGeos.filter((g) => jointOf(g)!.name === name);
    const j = jointOf(list[0])!;
    const bp = split(list);
    return {
      name, pivot: new THREE.Vector3(...j.pivot), big: j.big, axis: j.axis ? new THREE.Vector3(...j.axis).normalize() : null, solid: opt(bp.body), glass: opt(bp.glass),
      detail: detailGeo([{ geos: bp.dark, ...dark }, { geos: bp.pilot, ...LOOK.pilot }]),
    };
  });
  c = {
    solid,
    glass: opt(byPart.glass),
    detail: detailGeo([
      { geos: [...byPart.dark, ...frames, ...ex.geos, ...extra.dark], ...dark },
      { geos: [...byPart.pilot, ...extra.pilot], ...LOOK.pilot },
      { geos: extra.navRed, ...LOOK.navRed },
      { geos: extra.navGreen, ...LOOK.navGreen },
    ]),
    joints,
    disc: discGeo(def.props),
    skin: skinMaterial(info, detail),
    gear: opt(gear),
    props: def.props,
    emitters: contrailEmitters(bb, spec, def.props),
    lights: def.lights ?? [],
    length: bb.max.z - bb.min.z,
    radius: all.boundingSphere!.radius,
    probe,
    bb,
  };
  DETAIL = 1;
  RES = 1;
  setAirfoilRes(10);
  geoCache.set(key, c);
  return c;
}

/**
 * Kanopi camı: koyu iç, bakış açısına göre gökyüzü yansıması (Fresnel: dik bakınca içi ve pilot görünür, sıyırarak
 * bakınca gök) ve güneş parlaması (Phong). Yansıyan renk gök kubbesiyle aynı işlevden; aşağı bakan yüz yeri yansıtır.
 */
function glassMaterial(detail: number): THREE.Material {
  const m = new THREE.MeshPhongMaterial({
    color: 0x3e4e5e, specular: 0xffffff, shininess: 90, flatShading: !detail, side: THREE.DoubleSide, transparent: !!detail,
  });
  m.onBeforeCompile = (shader) => {
    linkAtmosphere(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ATMO_PARS}`)
      .replace('#include <opaque_fragment>', /* glsl */ `
        vec3 gN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
        vec3 gV = normalize( ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz );
        vec3 gR = reflect( gV, gN );
        vec3 env = mix( atmoSky( gR ), vec3( 0.06, 0.08, 0.05 ), smoothstep( 0.0, -0.3, gR.y ) );
        float fres = 0.38 + 0.62 * pow( 1.0 - clamp( dot( - gV, gN ), 0.0, 1.0 ), 3.0 );
        outgoingLight = mix( outgoingLight, env, fres * 0.9 );
        diffuseColor.a = mix( 0.35, 0.97, fres );
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `canopyGlass-${detail}`;
  return m;
}
const GLASS = [glassMaterial(0), glassMaterial(1)];

/** Pervane diski dokusu (pala sayısına göre): saydam göbek, soluk bulanık palalar, sarı uç halkası. */
const discTex = new Map<number, THREE.Texture>();
function propDiscTexture(blades: number): THREE.Texture {
  let t = discTex.get(blades);
  if (t) return t;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const c = S / 2;
  // Bulanık pala izi: pala sayısı kadar yumuşak dilim
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const grd = g.createRadialGradient(c, c, S * 0.08, c, c, S * 0.47);
    grd.addColorStop(0, 'rgba(40,38,44,0)');
    grd.addColorStop(0.25, 'rgba(40,38,44,0.32)');
    grd.addColorStop(1, 'rgba(40,38,44,0.17)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, S * 0.47, a - 0.55, a + 0.55);
    g.closePath();
    g.fill();
  }
  // Genel bulanıklık ve sarı uçlar
  const base = g.createRadialGradient(c, c, S * 0.06, c, c, S * 0.5);
  base.addColorStop(0, 'rgba(40,38,44,0)');
  base.addColorStop(0.2, 'rgba(40,38,44,0.10)');
  base.addColorStop(0.86, 'rgba(40,38,44,0.10)');
  base.addColorStop(0.88, 'rgba(236,196,64,0.45)');
  base.addColorStop(0.96, 'rgba(236,196,64,0.32)');
  base.addColorStop(1, 'rgba(236,196,64,0)');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  discTex.set(blades, t);
  return t;
}
/** Pervane diskinin yavaş dönüşü (radyan; çizici her karede ilerletir, bütün disklerde ortak). */
export const propU = { discSpin: { value: 0 } };

const discMats = new Map<number, THREE.Material>();
/**
 * Bir uçağın bütün pervane diskleri tek ağda (motor başına bir çizim yerine bir). Dönüş dokuda: disk başına evre
 * kayması (pdi: motor numarası; ileride motor başına söndürme de bununla yapılır).
 */
function discMaterial(blades: number): THREE.Material {
  let m = discMats.get(blades);
  if (!m) {
    // Işıklı: gece ve gölgede disk de kararır
    // Düz daire: çift yüzlü saydam malzeme tek geçişte çizilir (iki geçiş yalnız kapalı saydam cisimde gerekir)
    m = new THREE.MeshLambertMaterial({
      map: propDiscTexture(blades), transparent: true, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true,
    });
    m.onBeforeCompile = (shader) => {
      linkAtmosphere(shader);
      Object.assign(shader.uniforms, propU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float pdi;\nuniform float discSpin;')
        .replace('#include <uv_vertex>', /* glsl */ `#include <uv_vertex>
          float dsA = discSpin + pdi * 2.1;
          vMapUv = mat2( cos( dsA ), sin( dsA ), - sin( dsA ), cos( dsA ) ) * ( vMapUv - 0.5 ) + 0.5;`);
    };
    m.customProgramCacheKey = () => 'propDisc';
    discMats.set(blades, m);
  }
  return m;
}

/** İniş takımı (yerde ve son yaklaşmada görünür): koyu metal. */
const DARK = [
  new THREE.MeshLambertMaterial({ color: 0x4a4850, flatShading: true, side: THREE.DoubleSide }),
  new THREE.MeshPhongMaterial({ color: 0x38373c, specular: 0x3a3a3a, shininess: 36, side: THREE.DoubleSide }),
];

/**
 * Küçük parçalar tek ağda (koyu metal parçalar, pervane palaları, pilot, seyir lambaları): renk ve görünüş köşede.
 * dk.x kendinden ışıklı (seyir lambası: gece de görünür, ışıksız malzemeyle aynı), dk.y parlaklık (metal 1, deri
 * başlık ve ceket 0: Lambert ile aynı). Eskiden dört malzeme, dört çizimdi.
 */
function detailMaterial(detail: number): THREE.Material {
  if (!detail) return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x3a3a3a, shininess: 36, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    linkAtmosphere(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 dk;\nvarying vec2 vDk;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDk = dk;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDk;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular *= vDk.y;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, diffuseColor.rgb, vDk.x );\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'acDetail';
  return m;
}
const DETAIL_MAT = [detailMaterial(0), detailMaterial(1)];

/** Ayrıntı ağındaki görünüşler: koyu metal (ayrıntı düzeyine göre ton), pilot, seyir lambaları. */
const LOOK = {
  dark: [{ color: 0x4a4850, glow: 0, shine: 1 }, { color: 0x38373c, glow: 0, shine: 1 }],
  pilot: { color: 0x4d3d2c, glow: 0, shine: 0 },
  navRed: { color: 0xff3b2a, glow: 1, shine: 0 },
  navGreen: { color: 0x3bff6a, glow: 1, shine: 0 },
};

/** Ayrıntı ağı: parça kümeleri görünüşleriyle (renk ve dk köşelere yazılır), boşsa null. */
function detailGeo(sets: { geos: Geo[]; color: number; glow: number; shine: number }[]): Geo | null {
  const parts: Geo[] = [];
  for (const s of sets) {
    const col = new THREE.Color(s.color);
    for (const g of s.geos) {
      const c = cleanGeo(g);
      const n = c.getAttribute('position').count;
      const ca = new Float32Array(n * 3);
      const dk = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        ca[i * 3] = col.r;
        ca[i * 3 + 1] = col.g;
        ca[i * 3 + 2] = col.b;
        dk[i * 2] = s.glow;
        dk[i * 2 + 1] = s.shine;
      }
      c.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      c.setAttribute('dk', new THREE.BufferAttribute(dk, 2));
      parts.push(c);
    }
  }
  if (!parts.length) return null;
  const m = mergeGeometries(parts, false);
  if (!m) throw new Error('ayrıntı birleştirilemedi');
  m.computeBoundingSphere();
  return m;
}

/** Sivrilen pervane palası (kökte dar, ortada geniş). */
const BLADE_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.05, 0);
  s.lineTo(0.05, 0);
  s.lineTo(0.1, 0.35);
  s.lineTo(0.07, 0.95);
  s.lineTo(0, 1);
  s.lineTo(-0.07, 0.95);
  s.lineTo(-0.1, 0.35);
  s.lineTo(-0.05, 0);
  return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }).translate(0, 0, -0.02);
})();

/** Bir pervanenin palaları tek geometride (model ekseninde, göbek pervane noktasında). */
function bladeSet(p: PropDef): Geo {
  const list: Geo[] = [];
  for (let i = 0; i < p.blades; i++) {
    list.push(BLADE_GEO.clone().scale(p.r * 0.9, p.r, 1).rotateZ((i / p.blades) * Math.PI * 2).translate(p.x ?? 0, p.y ?? 0, p.z));
  }
  return tag(merge(list), 'dark');
}

/** Bütün pervane diskleri tek geometride; disk palaların biraz önünde (aynı düzlemde titreşmesin). */
function discGeo(props: PropDef[]): Geo | null {
  if (!props.length) return null;
  const parts = props.map((p, i) => {
    const g = new THREE.CircleGeometry(p.r, 24).translate(p.x ?? 0, p.y ?? 0, p.z + 0.05);
    g.setAttribute('pdi', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(i), 1));
    return g;
  });
  const m = mergeGeometries(parts, false);
  if (!m) throw new Error('pervane diskleri birleştirilemedi');
  m.computeBoundingSphere();
  return m;
}

export interface AircraftModel {
  root: THREE.Group;
  /** Dönen pervane palaları (eklem grupları, Z ekseninde döndürülür; yavaş dönerken görünür). */
  props: THREE.Object3D[];
  /** Bütün pervane diskleri tek ağda (hızlı dönerken palaların yerine görünür). */
  disc: THREE.Object3D | null;
  /** Hareketli parçalar (eklemler) adlarıyla: pivot noktasında, döndürülmek için (pervaneler: pervane0, pervane1…). */
  joints: Record<string, THREE.Object3D>;
  /** Ekranda küçük kalan uçakta gizlenen küçük ayrıntılar (cam, koyu parçalar, pilot, lambalar, küçük eklemler). */
  fine: THREE.Object3D[];
  /** Yoğuşma izi çıkış noktaları (model ekseninde, gerçek ölçek). */
  emitters: THREE.Vector3[];
  /** Katlanır iniş takımı (yerde ve son yaklaşmada görünür). */
  gear: THREE.Object3D | null;
  /** İniş farı (ışıkları tanımlı uçaklarda; takım inikken açılır). */
  landing: THREE.Object3D | null;
  /** İniş farının yerdeki ışığı (yalnız yerde). */
  landingPool: THREE.Object3D | null;
  length: number;
  /** Sınır küresi yarıçapı (kanat açıklığı dahil). */
  radius: number;
}

/** Uçak modeli. detail: 1 yüksek çözünürlük ve küçük parçalar (varsayılan), 0 low-poly (düşük kalite). */
export function buildAircraftModel(kind: string, opts: { gear?: boolean; detail?: number } = {}): AircraftModel {
  const detail = opts.detail ?? 1;
  const c = cached(kind, detail);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(c.solid, c.skin));
  const fine: THREE.Object3D[] = [];
  const add = (into: THREE.Object3D, g: Geo | null, m: THREE.Material) => {
    if (!g) return null;
    const mesh = new THREE.Mesh(g, m);
    into.add(mesh);
    return mesh;
  };
  for (const m of [add(root, c.glass, GLASS[detail]), add(root, c.detail, DETAIL_MAT[detail])]) if (m) fine.push(m);
  const gear = add(root, c.gear, DARK[detail]);
  if (gear) gear.visible = !!opts.gear;
  // Eklemler: dış grup pivotta (döndürülen), iç grup −pivotta (geometri model ekseninde kalır)
  const joints: Record<string, THREE.Object3D> = {};
  for (const j of c.joints) {
    const outer = new THREE.Group();
    outer.position.copy(j.pivot);
    const inner = new THREE.Group();
    inner.position.copy(j.pivot).negate();
    outer.add(inner);
    add(inner, j.solid, c.skin);
    add(inner, j.glass, GLASS[detail]);
    add(inner, j.detail, DETAIL_MAT[detail]);
    if (j.axis) outer.userData.axis = j.axis;
    root.add(outer);
    joints[j.name] = outer;
    if (!j.big && !j.name.startsWith('pervane')) fine.push(outer);
  }
  // Katlanır takımın bacakları: takımsız istenirse (uçuşta) gizli; oyunda animateParts açar
  if (!opts.gear) for (const n of ['takimL', 'takimR', 'takimN', 'kapakL', 'kapakR']) if (joints[n]) joints[n].visible = false;
  const props = c.props.map((_, i) => joints[`pervane${i}`]);
  const disc = add(root, c.disc, discMaterial(c.props[0]?.blades ?? 3));
  if (disc) {
    disc.visible = false;
    // Saydamlar uzaklığa göre sıralanır: kanopi camları (0) ve diskler (0,5) kendi aralarında toplu çizilsin, her
    // uçakta camdan diske gölgelendirici değişmesin (ikisi de bulut ve dumandan önce, eskisi gibi)
    disc.renderOrder = 0.5;
  }
  // Işıklar (tanımlı uçaklarda): seyir lambaları sürekli, iniş farı ayrı grupta (takım inince açılır); gece yanar
  let landing: THREE.Object3D | null = null;
  let landingPool: THREE.Object3D | null = null;
  if (c.lights.length) {
    const nav = new LampSet();
    const land = new LampSet();
    const pool = new LampSet();
    for (const l of c.lights) {
      if (l.kind === 'landing') {
        land.lamp(...l.p, LAMP.white, 0.3, 3.2);
        // Farın yerde aydınlattığı yer (takım inikken gövde ekseni yerden ~1,9 m yukarıda); yalnız yerdeyken görünür
        pool.pool(l.p[0], -1.85, l.p[2] + 24, 12, LAMP.white, 0.3);
      }
      else nav.lamp(...l.p, l.kind === 'red' ? LAMP.red : l.kind === 'green' ? LAMP.green : LAMP.white, 0.035, 1.1);
    }
    nav.build(root);
    landingPool = new THREE.Group();
    pool.build(landingPool);
    landingPool.visible = false;
    root.add(landingPool);
    landing = new THREE.Group();
    land.build(landing);
    landing.visible = false;
    root.add(landing);
  }
  return { root, props, disc, joints, fine, emitters: c.emitters, gear, landing, landingPool, length: c.length, radius: c.radius };
}

const parkedCache = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material }[]>();

/**
 * Yerde duran uçağın parçaları malzeme başına tek geometride (eklemler dönmemiş hâlde model ekseninde kalır): gövde ve
 * hareketli yüzeyler, cam, küçük parçalar, iniş takımı. Hava üssünde aynı türden uçaklar InstancedMesh ile tek çizimde.
 */
export function parkedParts(kind: string, detail: number): { geo: THREE.BufferGeometry; mat: THREE.Material }[] {
  const key = `${kind}|${detail}`;
  const hit = parkedCache.get(key);
  if (hit) return hit;
  const c = cached(kind, detail);
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  const add = (list: (Geo | null)[], mat: THREE.Material) => {
    const geos = list.filter((g): g is Geo => !!g);
    if (!geos.length) return;
    const m = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (m) out.push({ geo: m, mat });
    else for (const g of geos) out.push({ geo: g, mat });
  };
  add([c.solid, ...c.joints.map((j) => j.solid)], c.skin);
  add([c.glass, ...c.joints.map((j) => j.glass)], GLASS[detail]);
  add([c.detail, ...c.joints.map((j) => j.detail)], DETAIL_MAT[detail]);
  add([c.gear], DARK[detail]);
  for (const p of out) p.geo.computeBoundingSphere();
  parkedCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- dış yükler

const STORE_MAT = {
  bomb: new THREE.MeshLambertMaterial({ color: 0x6d705f, flatShading: true }),
  tank: new THREE.MeshLambertMaterial({ color: 0xcfcdd4, flatShading: true }),
  rocket: new THREE.MeshLambertMaterial({ color: 0x7b7786, flatShading: true }),
  gunpod: new THREE.MeshLambertMaterial({ color: 0x5e5a68, flatShading: true }),
};

const unitBomb = body([[0.5, 0], [0.4, 0.11], [0.05, 0.12], [-0.32, 0.09], [-0.5, 0.03]], 7).rotateX(0);
const finBomb = mergeGeometries([
  unitBomb.toNonIndexed(),
  new THREE.BoxGeometry(0.26, 0.012, 0.12).translate(0, 0, -0.44).toNonIndexed(),
  new THREE.BoxGeometry(0.012, 0.26, 0.12).translate(0, 0, -0.44).toNonIndexed(),
].map(cleanGeo))!;
finBomb.computeVertexNormals();
const unitTank = body([[0.5, 0], [0.32, 0.12], [-0.2, 0.13], [-0.5, 0.01]], 8);
unitTank.computeVertexNormals();
const unitRocket = body([[0.5, 0], [0.38, 0.05], [-0.5, 0.05]], 6);
unitRocket.computeVertexNormals();
const unitPod = mergeGeometries([
  cleanGeo(body([[0.45, 0.05], [0.3, 0.13], [-0.4, 0.13], [-0.5, 0.06]], 8).toNonIndexed()),
  cleanGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 5).rotateX(Math.PI / 2).translate(0, 0, 0.7).toNonIndexed()),
])!;
unitPod.computeVertexNormals();

/** Bir askıdaki her mühimmatın konumu (çift askıda sıra sol-sağ dönüşümlü: bırakılınca dengeli eksilir). */
function hardpointSlots(c: CachedModel, h: Hardpoint, n: number, len: number, rad: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const half = c.bb.max.x;
  if (h.kind === 'bay') return out;
  const wingAt = (x: number) => {
    const ch = c.probe.chord(Math.abs(x), c.bb.max.z, c.bb.min.z);
    const z = ch ? ch[0] - (ch[0] - ch[1]) * 0.42 : 0;
    const bot = c.probe.vertical(Math.abs(x), z, false);
    return { z, y: bot ? bot.point.y : -0.4 };
  };
  if (h.kind === 'center') {
    const root = c.probe.chord(Math.min(1.0, half * 0.12), c.bb.max.z, c.bb.min.z);
    const z0 = root ? root[0] - (root[0] - root[1]) * 0.4 : 0;
    const bot = c.probe.vertical(0, z0, false);
    const y0 = (bot ? bot.point.y : -0.6) - rad - 0.12;
    const sideX = h.pylons > 1 ? Math.max(0.35, rad * 1.5) : 0;
    for (let k = 0; k < n; k++) {
      // Çoklu raf: 2'li yan yana, sonra arka arkaya
      const col = n > 1 ? (k % 2 === 0 ? -1 : 1) * rad * 1.25 : 0;
      const row = Math.floor(k / 2) - (Math.ceil(n / 2) - 1) / 2;
      for (let p = 0; p < h.pylons; p++) {
        const sx = h.pylons > 1 ? (p === 0 ? -sideX : sideX) : 0;
        out.push(new THREE.Vector3(sx + col, y0, z0 - row * len * 1.05));
      }
    }
    return out;
  }
  if (h.kind === 'tip') {
    const w = wingAt(half * 0.96);
    for (const sgn of [-1, 1]) out.push(new THREE.Vector3(sgn * (half + rad * 0.6), w.y + rad * 0.9, w.z + len * 0.15));
    return out;
  }
  const at = h.at ?? 0.36;
  for (let k = 0; k < n; k++) {
    // Ray: roketler kanat boyunca yan yana; kanat altı: aynı askıda arka arkaya / yan yana
    const dx = h.kind === 'rail' ? (k - (n - 1) / 2) * Math.max(0.42, half * 0.06) : n > 1 ? (k % 2 === 0 ? -1 : 1) * rad * 1.2 : 0;
    const dz = h.kind === 'rail' ? 0 : n > 1 ? -Math.floor(k / 2) * len * 0.6 : 0;
    for (const sgn of [-1, 1]) {
      const x = sgn * (half * at + dx);
      const w = wingAt(x);
      out.push(new THREE.Vector3(x, w.y - rad - 0.1, w.z + len * 0.12 + dz));
    }
  }
  return out;
}

/** Uçağın askılarındaki mühimmat: askı (yuva) başına örnekli ağ; count kalan adede eşitlenir. */
export function buildStoreMeshes(
  kind: string, spec: AircraftSpec, slots: { hp: string; store: StoreDef; n0: number }[], detail = 1,
): (THREE.InstancedMesh | null)[] {
  const c = cached(kind, detail);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  return slots.map((slot) => {
    const h = spec.hardpoints.find((x) => x.id === slot.hp);
    if (!h || h.kind === 'bay') return null;
    // Uç tankları gövdenin parçası olan modelde (F-84) yük ayrıca çizilmez
    if (h.kind === 'tip' && c.joints.some((j) => j.name === 'ucTank')) return null;
    const st = slot.store;
    const perPylon = Math.max(1, Math.round(slot.n0 / h.pylons));
    let geo: Geo;
    let len: number;
    let rad: number;
    if (st.kind === 'bomb') {
      const k = Math.cbrt(st.mass / 250);
      len = 1.65 * k;
      rad = 0.2 * k;
      geo = finBomb;
    } else if (st.kind === 'tank') {
      const k = Math.cbrt((st.fuelKg ?? 200) / 220);
      len = (h.kind === 'tip' ? 4.6 : 2.4) * k;
      rad = (h.kind === 'tip' ? 0.42 : 0.3) * k;
      geo = unitTank;
    } else if (st.kind === 'rocket') {
      len = 0.85 + st.mass / 70;
      rad = 0.07 + st.mass / 900;
      geo = unitRocket;
    } else {
      len = 1.7;
      rad = 0.16;
      geo = unitPod;
    }
    const pos = hardpointSlots(c, h, perPylon, len, rad);
    if (!pos.length) return null;
    const mesh = new THREE.InstancedMesh(geo, STORE_MAT[st.kind], pos.length);
    // Ünite geometrisi: uzunluk 1, yarıçap ~0.12 → gerçek boyuta ölçek
    pos.forEach((p, i) => {
      sc.set(rad / 0.12, rad / 0.12, len);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    return mesh;
  });
}
