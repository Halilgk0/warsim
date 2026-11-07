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
const HIRES: Record<string, number> = { b29: 1.25, a26: 1.35, lancaster: 1.25, b17: 1.25, b25: 1.3, ju88: 1.3, he111: 1.3, blenheim: 1.4, pe2: 1.4, p38: 1.4, mosquito: 1.4, bf110: 1.4, ad4: 1.5, sb2c: 1.5, sbd: 1.5, ju87d: 1.5, ju87b: 1.5, il10: 1.5, il2m3: 1.5, il2: 1.5, seafury: 1.5, a6m: 1.5, i16: 1.5, f8f: 1.5, f4u: 1.5, f6f: 1.5, p40: 1.5, la7: 1.5, yak3: 1.5, p47: 1.5, typhoon: 1.5, fw190: 1.5, p51d: 1.5, bf109g: 1.5, bf109f: 1.5, bf109e: 1.5, hurricane: 1.5, spitfire: 1.5, spitfire5: 1.5, spitfire9: 1.5, mig15: 2.4, sabre: 1.6, f84: 1.6, p80: 1.6, me262: 1.6, meteor: 1.6, vampire: 1.6, he162: 1.6, ar234: 1.5, canberra: 1.5, il28: 1.5 };
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
  /** Kalınlığın uca doğru azalma oranı (controlWing; varsayılan 0,55). */
  tTaper?: number;
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
    t: w.t * (1 - (w.tTaper ?? 0.55) * f),
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

/**
 * Düz menteşeli dikey kuyruk (pervaneli uçaklar): menteşe gerçekteki gibi dik, sabit kısım ve dümen kendi sınırlarından
 * çizilir. fin: [y, hücum kenarı z], rudder: [y, firar kenarı z], alttan üste; dümen gövdenin altına da inebilir. İki
 * parça menteşede aynı kalınlıkta birleşir. Menteşe boyunca koyu direk aralığı örter. Tek kuyrukta (x = 0) gövde verilir:
 * çizimin satırları gövde çizgisinin üstünde kalsa da sabit kısım gövdenin içine iner, dümen gövdeye değer; arada boşluk kalmaz.
 */
function hingedFin(hull: JetHull, fin: [number, number][], rudder: [number, number][], hz: number, t0: number, t1: number, x = 0, name = 'rudder'): Geo[] {
  const side = new THREE.Vector3(1, 0, 0);
  const XH = 0.75;
  const fl = (DETAIL ? chaikinN(fin, 2) : fin) as [number, number][];
  const rl = (DETAIL ? chaikinN(rudder, 2) : rudder) as [number, number][];
  const y0 = rl[0][0];
  const y1 = rl[rl.length - 1][0];
  const tAt = (y: number) => t0 + (t1 - t0) * ((y - y0) / (y1 - y0));
  const yMid = (fl[0][0] + fl[fl.length - 1][0]) / 2;
  const mid = fl.reduce((b, q) => (Math.abs(q[0] - yMid) < Math.abs(b[0] - yMid) ? q : b));
  finSink.push({ x, yTop: fl[fl.length - 1][0], yRoot: fl[0][0], zTop: hz, zMid: (mid[1] + hz) / 2, chordMid: mid[1] - hz });
  const fixed: Section[] = fl.map(([y, raw]) => {
    // Çizim satırı menteşeyi geçmesin (ters parça çıkmasın)
    const le = Math.max(raw, hz + 0.02);
    return { le: new THREE.Vector3(x, y, le), c: (le - hz) / XH, t: tAt(y) };
  });
  const moving: Section[] = rl.map(([y, te]) => {
    const c = (hz - te) / (1 - XH);
    return { le: new THREE.Vector3(x, y, hz + XH * c), c, t: tAt(y) };
  });
  let yb = y0;
  if (x === 0) {
    const [, , top, bot] = hull.at(hz);
    const inside = (top + bot) / 2;
    if (inside < fl[0][0]) fixed.unshift({ ...fixed[0], le: fixed[0].le.clone().setY(inside), t: t0 });
    if (top - 0.02 < y0) {
      yb = top - 0.02;
      moving.unshift({ ...moving[0], le: moving[0].le.clone().setY(yb), t: t0 });
    }
  }
  return [
    airfoilPart(fixed, side, 0, XH),
    tag(rod(new THREE.Vector3(x, yb + 0.02, hz), new THREE.Vector3(x, y1 - 0.02, hz), Math.max(t0, t1) * 0.05, 4), 'dark'),
    ...joint(name, [x, (y0 + y1) / 2, hz], [airfoilPart(moving, side, XH + HINGE_GAP, 1)], true, [0, 1, 0]),
  ];
}

/**
 * Ayrık flap: yalnız alt yüzün arka parçası iner, üst yüz yerinde kalır (Hurricane, Spitfire gibi). secs içten dışa, bir
 * yan için; eklem adı name + L/R, firar kenarını indirme yönü controlWing'in flap'iyle aynı.
 */
function splitFlap(secs: Section[], name: string, xh: number, s: number, axisSign = s): Geo[] {
  const low = (q: Section, x: number) => new THREE.Vector3(q.le.x, q.le.y - q.t * nacaT(x) + q.t * 0.12 * Math.sin(Math.PI * x) - 0.005, q.le.z - q.c * x);
  const N = sg(3);
  const pos: number[] = [];
  for (let i = 0; i < secs.length - 1; i++) {
    for (let k = 0; k < N; k++) {
      const x0 = xh + ((1 - xh) * k) / N;
      const x1 = xh + ((1 - xh) * (k + 1)) / N;
      const [a, b, c, d] = [low(secs[i], x0), low(secs[i], x1), low(secs[i + 1], x0), low(secs[i + 1], x1)];
      for (const p of [a, b, c, c, b, d, a, c, b, c, d, b]) pos.push(p.x, p.y, p.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const a = low(secs[0], xh);
  const ax = low(secs[secs.length - 1], xh).sub(a).multiplyScalar(axisSign);
  return joint(`${name}${s > 0 ? 'L' : 'R'}`, [a.x, a.y, a.z], [g], false, [ax.x, ax.y, ax.z]);
}

/** Pike freni: firar kenarında alt yüz levhası (SBD, SB2C); açılınca iki yanda da aşağı iner. */
function rowBrake(rows: WingRow[], x0: number, x1: number, xh: number): Geo[] {
  return [1, -1].flatMap((s) => splitFlap([rowSec(rowAt(rows, x0), s), rowSec(rowAt(rows, x1), s)], 'airbrake', xh, s, 1));
}

/** Yuvarlak kanat ucu çizimden: uç kesitinden dışa [dx (m), hücum kenarı geri kayması (m), veter (m)], kalınlık incelir. */
function wingTip(t: Section, s: number, rows: [number, number, number][]): Geo {
  const up = new THREE.Vector3(0, 1, 0);
  const list = DETAIL ? rows : rows.filter((_, i) => i % 2 === 1);
  const last = rows[rows.length - 1][0];
  const secs: Section[] = list.map(([dx, back, c]) => ({
    le: new THREE.Vector3(t.le.x + s * dx, t.le.y, t.le.z - back), c, t: t.t * (1 - 0.72 * (dx / last) ** 2),
  }));
  return airfoilPart([t, ...secs], up, 0, 1);
}

/**
 * Alt renkte boyanacak parça (takım kapağı, radyatör): boya yüzeyin normaline göre seçildiği için yan yüzler de aşağı
 * eğilir; yalnız bu parçanın ışığı değişir.
 */
function underPaint(g: Geo): Geo {
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(n.getX(i), n.getY(i) - 1.2, n.getZ(i)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** Bacağa bağlı kapak, çizilen çokgen: [z, y] noktaları; x düzleminde ince levha, alt renkte. */
function legFairing(x: number, pts: [number, number][]): Geo {
  const sh = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? sh.lineTo(-z, y) : sh.moveTo(-z, y)));
  sh.closePath();
  return underPaint(new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: false }).rotateY(Math.PI / 2).translate(x - 0.011, 0, 0));
}

/** Çizimden kanat satırı: [x, y, hücum kenarı z, veter, kalınlık]; uçtan uca sıralı. */
type WingRow = [number, number, number, number, number];

function rowAt(rows: WingRow[], x: number): WingRow {
  for (let i = 0; i < rows.length - 1; i++) {
    if (x <= rows[i + 1][0]) {
      const k = (x - rows[i][0]) / (rows[i + 1][0] - rows[i][0] || 1);
      return rows[i].map((v, j) => v + (rows[i + 1][j] - v) * k) as WingRow;
    }
  }
  return rows[rows.length - 1];
}

const rowSec = (r: WingRow, s: number): Section => ({ le: new THREE.Vector3(s * r[0], r[1], r[2]), c: r[3], t: r[4] });

/**
 * Çizimden satır satır taşıyıcı yüzey (eliptik ya da kırık planlı kanat, yatay kuyruk), iki yan. [a0, a1] açıklığında
 * veterin xh'tan arkası kumanda yüzeyi (name + L/R). Yüksek ayrıntıda satırlar yumuşar. Kök gövde eksenine uzar.
 */
function planWing(raw: WingRow[], o: { xh: number; span: [number, number]; name?: string }): Geo[] {
  const up = new THREE.Vector3(0, 1, 0);
  const list = (DETAIL ? chaikinN(raw, 2) : raw) as WingRow[];
  // Kök gövdenin içine kadar: gövde kanadın arkasında daralsa da aralık kalmaz
  if (list[0][0] > 0.12) list.unshift([0.02, list[0][1], list[0][2], list[0][3], list[0][4]]);
  const near = (x: number) => list.reduce((b, q, i) => (Math.abs(q[0] - x) < Math.abs(list[b][0] - x) ? i : b), 0);
  const i0 = near(o.span[0]);
  const i1 = Math.max(i0 + 1, near(o.span[1]));
  const out: Geo[] = [];
  for (const s of [1, -1]) {
    const secs = list.map((r) => rowSec(r, s));
    const mid = secs.slice(i0, i1 + 1);
    const a = chordPt(mid[0], up, o.xh + HINGE_GAP);
    const ax = chordPt(mid[mid.length - 1], up, o.xh + HINGE_GAP).sub(a).multiplyScalar(s);
    if (i0 > 0) out.push(airfoilPart(secs.slice(0, i0 + 1), up, 0, 1));
    out.push(airfoilPart(mid, up, 0, o.xh), hingeStrip(mid, up, o.xh));
    out.push(...joint(`${o.name ?? 'aileron'}${s > 0 ? 'L' : 'R'}`, [a.x, a.y, a.z], [airfoilPart(mid, up, o.xh + HINGE_GAP, 1)], true, [ax.x, ax.y, ax.z]));
    if (i1 < secs.length - 1) out.push(airfoilPart(secs.slice(i1), up, 0, 1));
  }
  return out;
}

/** Ayrık flap satırlardan: [x0, x1] açıklığı, iki yan. */
function rowFlap(rows: WingRow[], x0: number, x1: number, xh: number, name = 'flap'): Geo[] {
  return [1, -1].flatMap((s) => splitFlap([rowSec(rowAt(rows, x0), s), rowSec(rowAt(rows, (x0 + x1) / 2), s), rowSec(rowAt(rows, x1), s)], name, xh, s));
}

/** Eğik bacakla inen levhalar için: y0'ın altında x, y ile orantılı kayar. */
function slantX(g: Geo, k: number, y0: number): Geo {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + k * (y0 - p.getY(i)));
  g.computeVertexNormals();
  return g;
}

interface PropGearOpts {
  /** Üst menteşe (x, y, z), aks (x, y, z), tekerlek yarıçapı ve genişliği, tekerleğin bacağa göre kayması (+ içe). */
  top: V3; axle: V3; rw: number; tw: number; dx: number;
  /** Bacağa bağlı kapak: [z, y] çokgeni; yeri ve eğimi bacaktan (gearDoorOn). */
  door?: { pts: [number, number][] };
  /** Destekler: bacak üstünde oran k'dan gövdeye nokta (x hep +yan için). */
  stays?: { k: number; to: V3 }[];
  /** Dışa toplanır (Spitfire, Bf 109). */
  out?: boolean;
  /** Geriye toplanır (P-40, Lancaster gibi; menteşe yatay). */
  back?: boolean;
  /** Öne toplanır (B-17, B-29). */
  fore?: boolean;
  /** Yan başına çift tekerlek aralığı. */
  twin?: number;
}

/**
 * Teker bacağın tam altındaysa (kayma yok, tek teker) bacak lastiğin içinden geçmesin: çatal. h iki bacağın eksenden
 * uzaklığı, k boyunduruğun bacak üstündeki oranı (lastiğin hemen üstü).
 */
function forkOf(o: PropGearOpts, r: number): { h: number; k: number } | null {
  if (o.dx || o.twin) return null;
  const len = o.top[1] - o.axle[1];
  const k = Math.max(0, Math.min(0.7, (o.top[1] - (o.axle[1] + o.rw + 0.05)) / len));
  return { h: o.tw / 2 + r * 0.62 + 0.02, k };
}

/**
 * Bacak kapağı bacağın üstüne yaslanır: tekerleğin karşı yüzünde (teker içteyse dışta), bacağın eğimiyle iner. Kapak
 * tekerleğin hizasına iniyorsa lastiğe değmeyecek kadar açılır. Elle verilen x eski çizimlerde bacaktan 15 cm kopuktu.
 */
function gearDoorOn(o: PropGearOpts, s: number, r: number): Geo {
  const pts = o.door!.pts;
  const y0 = pts[0][1];
  const k = (o.axle[0] - o.top[0]) / (o.top[1] - o.axle[1]);
  const side = o.dx < 0 ? -1 : 1;
  const yb = Math.min(...pts.map((p) => p[1]));
  const wheelTop = o.axle[1] + o.rw;
  const fork = forkOf(o, r);
  let off = (fork ? fork.h + r * 0.62 : r) + 0.011 + 0.006;
  if (yb < wheelTop) off = Math.max(off, o.tw / 2 + 0.025 - side * o.dx);
  const x = o.top[0] + k * (o.top[1] - y0) + side * off;
  return underPaint(slantX(legFairing(s * x, pts), s * k, y0));
}

/**
 * Pervanelilerin ana takımı: amortisörlü bacak, aks, lastik, kapak ve destekler; her yan kendi ekleminde. Kuyruk tekeri
 * (sabitse) modelin parçası.
 */
function propGear(o: PropGearOpts): Geo[] {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const out: Geo[] = [];
  for (const s of [1, -1]) {
    const top = v(s * o.top[0], o.top[1], o.top[2]);
    const axle = v(s * o.axle[0], o.axle[1], o.axle[2]);
    const at = (k: number) => top.clone().lerp(axle, k);
    const wx = axle.x - s * o.dx;
    const r = Math.min(0.09, o.rw * 0.2);
    const legs = forkOf(o, r);
    let strut: Geo[];
    if (legs) {
      // Çatal: üst bacak lastiğin üstündeki boyunduruğa, oradan lastiğin iki yanında iki bacak aksa
      const y = at(legs.k);
      const side = (p: THREE.Vector3, k: number) => p.clone().setX(p.x + k * legs.h);
      strut = [
        ...(legs.k > 0.02 ? [rod(top, y, r, 8)] : []),
        rod(side(y, 1), side(y, -1), r * 0.7, 6),
        ...[1, -1].map((k) => rod(side(y, k), side(axle, k), r * 0.62, 8)),
        rod(side(axle, 1), side(axle, -1), r * 0.5, 6),
      ];
    } else strut = [rod(top, at(0.62), r, 8), rod(at(0.56), axle, r * 0.66, 8), rod(axle, v(wx, axle.y, axle.z), r * 0.6, 6)];
    const parts = [
      ...strut,
      ...(o.twin ? [1, -1].flatMap((k) => wheelParts(o.rw, o.tw, wx + k * o.twin!, axle.y, axle.z)) : wheelParts(o.rw, o.tw, wx, axle.y, axle.z)),
      ...(o.stays ?? []).map((q) => rod(at(q.k), v(s * q.to[0], q.to[1], q.to[2]), r * 0.42, 5)),
    ];
    const door = o.door ? [gearDoorOn(o, s, r)] : [];
    const axis: V3 = o.fore ? [s, 0, 0] : o.back ? [-s, 0, 0] : [0, 0, o.out ? -1 : 1];
    out.push(...joint(s > 0 ? 'takimL' : 'takimR', [top.x, top.y, top.z], [...parts.map((g) => tag(g, 'dark')), ...door], false, axis));
  }
  return out;
}

/** Sabit kuyruk tekeri: üstte bağlantı, çatal, lastik (modelin parçası). */
function fixedTailWheel(z: number, y: number, r: number, w: number, topY: number, topZ: number): Geo[] {
  return [tag(rod(new THREE.Vector3(0, topY, topZ), new THREE.Vector3(0, y, z), Math.max(0.018, r * 0.18), 5), 'dark'), ...wheelParts(r, w, 0, y, z).map((g) => tag(g, 'dark'))];
}

/** Camlı burun (bombardıman uçakları): cam yüzey ve çerçeveler; pilot verilirse kokpit de burada. */
function noseGlass(rows: JetSec[], zs: number[], bands: number[], pilot?: { z: number; len: number; h: number; y: number; w: number }, p = 2.2): Geo[] {
  if (pilot) canopySink.push({ ...pilot, bubble: true });
  const g = new JetHull(rows, p);
  return [tag(g.geo(12, [true, false]), 'glass'), ...glassFrames(g, zs, bands)];
}

/** Taret: cam kubbe ve namlular. guns: [x, y, z] namlu ucu (x aynalı, x 0 ise tek). */
function turretDome(y: number, z: number, r: number, sy: number, muzzle: V3, dx = 0.07, sz = 1): Geo[] {
  const base = new THREE.Vector3(0, y + r * sy * 0.3, z);
  return [
    tag(new THREE.SphereGeometry(r, sg(10), sg(7)).scale(1, sy, sz).translate(0, y, z), 'glass'),
    ...(dx ? [1, -1] : [0]).map((s) => tag(rod(base.clone().setX(s * dx), new THREE.Vector3(s * dx + muzzle[0], muzzle[1], muzzle[2]), 0.016, 5), 'dark')),
  ];
}

/** Burun tekeri (burun takımlı pervaneliler): üst menteşe, aks, lastik; arkaya toplanır (takimN). */
function noseWheel(topY: number, topZ: number, axleY: number, axleZ: number, r: number, w: number, twin = 0): Geo[] {
  const a = new THREE.Vector3(0, topY, topZ);
  const b = new THREE.Vector3(0, axleY, axleZ);
  const parts = [rod(a, a.clone().lerp(b, 0.6), 0.055, 8), rod(a.clone().lerp(b, 0.55), b, 0.038, 8), ...(twin ? [1, -1].flatMap((k) => wheelParts(r, w, k * twin, axleY, axleZ)) : wheelParts(r, w, 0, axleY, axleZ))];
  return joint('takimN', [0, topY, topZ], parts.map((g) => tag(g, 'dark')), false, [-1, 0, 0]);
}

/** Toplanır kuyruk tekeri: takimN eklemi, uçuşta görünmez. */
function retractTailWheel(z: number, y: number, r: number, w: number, topY: number, topZ: number): Geo[] {
  return joint('takimN', [0, topY, topZ], fixedTailWheel(z, y, r, w, topY, topZ), false, [-1, 0, 0]);
}

/** Gövde yanında sıra egzoz boruları: n adet, z0'dan dz arayla kuyruğa, y yüksekliğinde, iki yan. */
function stubRow(H: JetHull, n: number, z0: number, dz: number, y: number, r = 0.04): Geo[] {
  return [1, -1].flatMap((s) => Array.from({ length: n }, (_, i) => {
    const z = z0 - i * dz;
    return tag(new THREE.CylinderGeometry(r * 0.75, r * 1.1, r * 2.6, sg(5)).rotateZ(-s * Math.PI / 2).rotateY(s * 0.55).translate(s * (H.sideX(z, y) + r * 0.6), y, z), 'dark');
  }));
}

/** Çizimden sivri pervane göbeği: [z, yarıçap] öndeki uçtan arkaya. */
const spinnerRows = (rows: [number, number][], y = 0, x = 0) => tag(body(rows, 10, { x, y, smooth: true }), 'dark');

/** Anten direği (dik ya da eğik), dark. Dibi gövdenin içine girer, aralık kalmaz. */
const mastRod = (y0: number, z0: number, y1: number, z1: number, r = 0.018) => tag(rod(new THREE.Vector3(0, y0 - 0.2, z0), new THREE.Vector3(0, y1, z1), r, 5), 'dark');

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
 * Camlı burnun çerçeveleri: yüzeyde boyuna ince çubuklar (zs istasyonları boyunca; yanlarda, üstte, altta) ve enine halkalar.
 */
function glassFrames(g: JetHull, zs: number[], bands: number[]): Geo[] {
  const line = (a: number, sd: number) => zs.slice(1).map((z, i) => {
    const p = g.pt(zs[i], a, 0.006, sd);
    const q = g.pt(z, a, 0.006, sd);
    return tag(rod(new THREE.Vector3(...p), new THREE.Vector3(...q), 0.014, 4), 'dark');
  });
  const band = (z: number) => {
    const q = g.at(z);
    const grow = (zz: number): JetSec => [zz, q[1] + 0.01, q[2] + 0.01, q[3] - 0.01, q[4]];
    return tag(new JetHull([grow(z + 0.02), grow(z - 0.02)], 2.2, false).geo(14), 'dark');
  };
  return [...bands.map(band), ...line(0, 1), ...line(0, -1), ...line(Math.PI / 2, 1), ...line(-Math.PI / 2, 1)];
}

/**
 * Damla kanopi: öndeki köşeli ön cam, sürgülü kapağın kavisli camı, arkasında gövdeye inen metal bitiş. Çerçeveler
 * (ön cam dikmeleri ve kavisi, kapakta verilen z'ler) koyu, cam kesitinin biraz dışında. Pilot ve gösterge paneli
 * cached()'te canopySink'teki kayda göre yerleşir. p: cam kesitinin dolgunluğu; rails: kafesli kapakta boyuna çubukların
 * halka açıları (0 yan, π/2 üst).
 */
function jetCanopy(o: {
  screen: JetSec[]; glass: JetSec[]; aft: JetSec[]; frames: number[]; posts: [V3, V3];
  pilot: { z: number; len: number; h: number; y: number; w: number };
  p?: number; rails?: number[];
}): Geo[] {
  canopySink.push({ ...o.pilot, bubble: true });
  const p = o.p ?? 2.1;
  const hull = new JetHull(o.glass, p);
  const band = (z: number) => {
    const s = hull.at(z);
    const grow = ([zz, w, t, b, wy]: JetSec): JetSec => [zz, w + 0.012, t + 0.012, b, wy];
    return tag(new JetHull([grow([z + 0.02, s[1], s[2], s[3], s[4]]), grow([z - 0.02, s[1], s[2], s[3], s[4]])], p, false).geo(10), 'dark');
  };
  const z0 = o.glass[0][0];
  const z1 = o.glass[o.glass.length - 1][0];
  const rails = (o.rails ?? []).flatMap((a) => [1, -1].map((s) =>
    tag(rod(new THREE.Vector3(...hull.pt(z0, a, 0.006, s)), new THREE.Vector3(...hull.pt(z1, a, 0.006, s)), 0.012, 4), 'dark')));
  return [
    tag(new JetHull(o.screen, 3.2, false).geo(10, [true, false]), 'glass'),
    tag(hull.geo(10), 'glass'),
    new JetHull(o.aft, 2.1).geo(10, [false, true]),
    ...o.frames.map(band),
    ...rails,
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
  /** Ana bacak: x, z, üst ucu (menteşe) y, aks y, tekerlek yarıçapı ve genişliği, tekerleğin bacağa göre içe kayması; out: dışa, fore: öne katlanır. */
  main: { out?: boolean; fore?: boolean; x: number; z: number; top: number; axle: number; rw: number; tw: number; dx: number; door: { dx: number; top: number; bot: number; w: number; r: number } };
  /** Burun bacağı: menteşe (üst uç) y ve z, aks y ve z, tekerlek; öne bakan küçük kapak (varsa). */
  nose: { topY: number; topZ: number; axle: number; z: number; rw: number; tw: number; twin?: number; door?: { top: number; bot: number; w: number } };
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
    out.push(...joint(s > 0 ? 'takimL' : 'takimR', [x, m.top, m.z], [...parts.map((g) => tag(g, 'dark')), door], false, m.fore ? [s, 0, 0] : [0, 0, m.out ? -1 : 1]));
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
    ...(n.twin ? [1, -1].flatMap((sd) => wheelParts(n.rw, n.tw, sd * n.twin!, n.axle, n.z)) : wheelParts(n.rw, n.tw, 0, n.axle, n.z)),
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

/**
 * Hurricane Mk I takımı (çizimden): dar iz (2,3 m), bacaklar orta kanattan iner ve içe, gövde altına toplanır. Bacağın
 * dışında tekerleğin önünü de örten büyük üçgen kapak, içe ve arkaya iki destek. Kuyruk tekeri sabit, modelin parçası.
 */
function hurricaneGear(): Geo[] {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const AX = -1.81;
  const out: Geo[] = [];
  for (const s of [1, -1]) {
    const x = s * 1.29;
    const parts = [
      rod(v(x, -0.76, 0.6), v(x, -1.36, 0.66), 0.058, 8),
      rod(v(x, -1.3, 0.65), v(x, AX, 0.75), 0.038, 8),
      rod(v(x, AX, 0.75), v(s * 1.03, AX, 0.75), 0.034, 6),
      rod(v(x, -1.22, 0.64), v(s * 0.9, -0.84, 0.62), 0.024, 5),
      rod(v(x, -1.28, 0.66), v(x, -0.88, -0.02), 0.024, 5),
      ...wheelParts(0.335, 0.22, s * 1.14, AX, 0.75),
    ];
    const door = legFairing(s * 1.37, [[0.69, -0.86], [0.5, -0.86], [0.44, -1.55], [0.42, -1.83], [1.28, -1.91]]);
    out.push(...joint(s > 0 ? 'takimL' : 'takimR', [x, -0.76, 0.6], [...parts.map((g) => tag(g, 'dark')), door], false, [0, 0, 1]));
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

/** Ar 234 B takımı: gövdeye toplanan çok dar izli ana bacaklar (1,4 m), camlı burnun arkasında uzun burun bacağı. */
function blitzGear(gh: number): Geo[] {
  return jetGear({
    main: { x: 0.71, z: -0.5, top: -0.33, axle: -gh + 0.38, rw: 0.38, tw: 0.18, dx: -0.03, door: { dx: 0.12, top: -0.4, bot: -0.95, w: 0.45, r: 0.12 } },
    nose: { topY: -0.58, topZ: 3.85, axle: -gh + 0.33, z: 4.0, rw: 0.33, tw: 0.16 },
    belly: { x: 0.2, y: -0.62, z0: 3.8, z1: 2.75, h: 0.2 },
  });
}

/** Canberra takımı: ana bacaklar naselin içinde ve dışa toplanır, büyük lastikler; burunda çift tekerlek. */
function canberraGear(gh: number): Geo[] {
  return jetGear({
    main: { out: true, x: 2.5, z: -1.0, top: -0.25, axle: -gh + 0.45, rw: 0.45, tw: 0.22, dx: 0.05, door: { dx: 0.14, top: -0.35, bot: -1.0, w: 0.7, r: 0.15 } },
    nose: { topY: -0.88, topZ: 3.9, axle: -gh + 0.3, z: 4.0, rw: 0.3, tw: 0.13, twin: 0.14 },
    belly: { x: 0.26, y: -0.92, z0: 3.85, z1: 2.9, h: 0.24 },
  });
}

/** Il-28 takımı: yüksek duruş; ana bacaklar nasel altından iner ve öne toplanır, büyük lastikler; uzun tek burun bacağı. */
function beagleGear(gh: number): Geo[] {
  return jetGear({
    main: { fore: true, x: 3.21, z: -0.22, top: -1.05, axle: -gh + 0.62, rw: 0.62, tw: 0.26, dx: -0.3, door: { dx: -0.16, top: -1.2, bot: -1.72, w: 0.6, r: 0.12 } },
    nose: { topY: -0.76, topZ: 6.7, axle: -gh + 0.37, z: 6.82, rw: 0.37, tw: 0.18, door: { top: -0.85, bot: -1.5, w: 0.45 } },
    belly: { x: 0.3, y: -0.76, z0: 6.6, z1: 5.4, h: 0.3 },
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





/** Küçük bomba (kanat altı / gövde altı). */
const bombAt = (x: number, y: number, z: number, scale = 1) =>
  body([[0.9 * scale, 0], [0.65 * scale, 0.18 * scale], [-0.5 * scale, 0.18 * scale], [-0.85 * scale, 0.05]], 6, { x, y, z, smooth: true });
/** Roket rayı + roket. */
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
  /** Gövde armasının yarıçapı (m; yoksa gövde yüksekliğinden). */
  markR?: number;
  bombs?: Geo[];
  rockets?: Geo[];
  tank?: Geo[];
  /** Dış ışıklar (model ekseninde): seyir lambaları ve iniş farı (yalnız ışıkları tanımlı uçaklarda). */
  lights?: { p: V3; kind: 'red' | 'green' | 'white' | 'landing' }[];
  /** Egzozlar modelde çizildi: yalnız is izleri [x, y, z, uzunluk]. */
  soot?: [number, number, number, number][];
  /** Anten direği modelde çizildi. */
  ownMast?: boolean;
  /** Kanat silahları gömülü: namlu çıkmaz (ağızlar modelde). */
  flushGuns?: boolean;
}



function defineModel(key: string): ModelDef {
  switch (key) {
    // ================================================================ İngiliz avcıları
    case 'hurricane': {
      // Hurricane Mk I, ölçüler üç görünüş çiziminden (114 piksel/m; y = 0 pervane ekseni, z = 0 kanat çeyrek veteri
      // yakını). Derin, kambur gövde: kokpitin gerisinde sırt yükselip kuyruğa iner. Kafesli sürgülü kapak. Kalın kök
      // kanat, gövdeye geniş kavisli köklerle bağlanır, orta kısmı düz, dış kısmı 3,5° yukarı. Karında büyük radyatör.
      // Her kanatta dört gömülü makineli tüfek. Flaplar ayrık, ana takım içe toplanır, kuyruk tekeri sabit. Arka gövde kumaş.
      const H = new JetHull([
        [2.51, 0.33, 0.3, -0.3, 0], [2.32, 0.38, 0.35, -0.45, -0.04], [1.96, 0.42, 0.42, -0.65, -0.1], [1.61, 0.46, 0.44, -0.75, -0.15],
        [1.26, 0.5, 0.46, -0.82, -0.18], [0.91, 0.53, 0.48, -0.84, -0.2], [0.56, 0.535, 0.5, -0.86, -0.2], [0.17, 0.535, 0.52, -0.88, -0.2],
        [-0.14, 0.535, 0.5, -0.89, -0.2], [-1.1, 0.535, 0.5, -0.89, -0.2], [-1.32, 0.535, 0.72, -0.89, -0.2], [-1.54, 0.53, 0.75, -0.88, -0.2],
        [-1.89, 0.52, 0.69, -0.86, -0.18], [-2.25, 0.5, 0.6, -0.84, -0.18], [-2.6, 0.48, 0.53, -0.82, -0.17], [-2.95, 0.45, 0.46, -0.8, -0.17],
        [-3.3, 0.42, 0.39, -0.77, -0.17], [-3.65, 0.37, 0.32, -0.74, -0.18], [-4.0, 0.33, 0.26, -0.7, -0.19], [-4.35, 0.29, 0.22, -0.67, -0.2],
        [-4.7, 0.25, 0.2, -0.64, -0.21], [-5.05, 0.2, 0.2, -0.6, -0.2], [-5.4, 0.13, 0.18, -0.55, -0.19], [-5.77, 0.05, 0.14, -0.5, -0.18],
      ], 2.35, true, 2.1);
      const W: WingOpts = { x0: 1.45, z: 1.02, root: 2.406, y: -0.6, tipX: 5.57, tip: 1.2, sweep: 0.395, dihedral: 3.5, t: 0.5, tTaper: 0.7 };
      const T: WingOpts = { x0: 0.1, z: -4.75, root: 1.25, y: 0.08, tipX: 1.27, tip: 0.94, sweep: 0.24, dihedral: 0, t: 0.13 };
      const up = new THREE.Vector3(0, 1, 0);
      // Kök: gövde kenarından orta kanadın sonuna, hücum ve firar kenarı kavisle gövdeye iner [x, hücum z, firar z]
      const ROOT: [number, number, number][] = [[0.45, 1.34, -2.3], [0.53, 1.22, -2.11], [0.62, 1.1, -1.85], [0.75, 1.03, -1.63], [1.0, 1.02, -1.47], [1.18, 1.02, -1.41], [1.45, 1.02, -1.386]];
      const rootSec = (x: number, le: number, te: number, s: number): Section => ({ le: new THREE.Vector3(s * x, W.y, le), c: le - te, t: W.t });
      const TIP: [number, number, number][] = [[0.13, 0.06, 1.08], [0.26, 0.15, 0.92], [0.35, 0.25, 0.73], [0.44, 0.37, 0.5], [0.49, 0.47, 0.25], [0.52, 0.58, 0.07]];
      const tipF = (x: number) => (x - W.x0) / (W.tipX - W.x0);
      const yTip = W.y + (W.tipX - W.x0) * tanD(W.dihedral);
      // Kanat hücum kenarı boyunca nokta (silah ağzı, iniş farı)
      const lePt = (x: number, s: number) => taperSec(W, tipF(x), s).le;
      const stack = (sd: number, z0: number, z1: number) => tag(body([[z0, 0.001], [z0 - 0.04, 0.05], [z1 + 0.03, 0.058], [z1, 0.04]], 6, { x: sd * (H.sideX((z0 + z1) / 2, 0.08) + 0.012), y: 0.08, sx: 1.1, sy: 0.9, smooth: true }), 'dark');
      const rad = new JetHull([
        [-0.1, 0.42, -0.78, -1.14, -0.95], [-0.17, 0.46, -0.78, -1.2, -0.97], [-0.6, 0.46, -0.78, -1.28, -0.98], [-1.0, 0.44, -0.78, -1.24, -0.96], [-1.28, 0.4, -0.78, -1.15, -0.92], [-1.42, 0.28, -0.78, -0.92, -0.85],
      ], 3);
      const radDuct = new JetHull([[-0.1, 0.39, -0.83, -1.1, -0.96], [-0.45, 0.37, -0.85, -1.05, -0.96]], 2.2, false);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(body([[3.105, 0], [3.02, 0.1], [2.85, 0.2], [2.66, 0.265], [2.5, 0.305]], 10, { smooth: true }), 'dark'),
          // Üç blok egzoz
          ...[1, -1].flatMap((sd) => [stack(sd, 2.23, 1.89), stack(sd, 1.88, 1.57), stack(sd, 1.55, 1.25)]),
          // Kokpit: gövde üstü koyu tekne; kafesli kapak
          tag(H.patch(1, -0.08, -1.12, Math.PI / 2 - 0.62, Math.PI / 2 + 0.62, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[0.17, 0.2, 0.53, 0.3, 0.4], [-0.12, 0.31, 0.78, 0.3, 0.5]],
            glass: [[-0.12, 0.31, 0.78, 0.3, 0.5], [-0.3, 0.33, 0.79, 0.3, 0.5], [-0.8, 0.33, 0.79, 0.3, 0.5], [-1.2, 0.32, 0.77, 0.3, 0.5]],
            aft: [[-1.15, 0.31, 0.77, 0.3, 0.5], [-1.34, 0.3, 0.76, 0.3, 0.5], [-1.6, 0.27, 0.72, 0.3, 0.5]],
            frames: [-0.13, -0.5, -0.82, -1.14],
            posts: [[0.18, 0.46, 0.17], [0.28, 0.75, -0.12]],
            pilot: { z: -0.55, len: 1.4, h: 0.36, y: 0.46, w: 0.3 },
            p: 3,
            rails: [0.4, 1.32],
          }),
          // Anten direği, kuyruktaki kısa direk ve aradaki tel
          tag(rod(new THREE.Vector3(0, 0.6, -2.12), new THREE.Vector3(0, 1.45, -2.12), 0.02, 5), 'dark'),
          tag(rod(new THREE.Vector3(0, 1.28, -5.74), new THREE.Vector3(0, 1.47, -5.74), 0.012, 4), 'dark'),
          tag(rod(new THREE.Vector3(0, 1.45, -2.12), new THREE.Vector3(0, 1.47, -5.74), 0.005, 3), 'dark'),
          // Kök ve orta kanat, dışında kanatçıklı kanat, çizimden yuvarlak uç
          ...[1, -1].flatMap((s) => [
            airfoilPart(ROOT.map(([x, le, te]) => rootSec(x, le, te, s)), up, 0, 1),
            wingTip(taperSec(W, 1, s), s, TIP),
            // Ayrık flap: orta kanat ve dış kanatta ayrı parça
            ...splitFlap([rootSec(0.56, 1.02, -1.386, s), rootSec(1.45, 1.02, -1.386, s)], 'flapD', 0.76, s),
            ...splitFlap([taperSec(W, 0, s), taperSec(W, tipF(3.24), s)], 'flap', 0.76, s),
            // Dört gömülü makineli tüfek ağzı
            ...[1.96, 2.13, 2.3, 2.47].map((x) => {
              const q = lePt(x, s);
              return tag(new THREE.SphereGeometry(1, sg(4), sg(3)).scale(0.022, 0.022, 0.04).translate(q.x, q.y + 0.012, q.z - 0.004), 'dark');
            }),
            // İniş farı camı
            (() => {
              const q = lePt(3.0, s);
              return tag(new THREE.BoxGeometry(0.24, 0.075, 0.05).translate(q.x, q.y + 0.012, q.z - 0.022), 'dark');
            })(),
          ]),
          ...controlWing(W, 0.8, [[0, tipF(3.24), null], [tipF(3.24), 1, 'aileron']]),
          // Karın radyatörü: geniş ağız, içi koyu, ayırıcılar ve üstte yağ soğutucusu
          underPaint(rad.geo(14)),
          tag(radDuct.geo(12), 'dark'),
          tag(radDuct.disc(-0.45, 1, 12), 'dark'),
          ...mirror(1, (s) => underPaint(new THREE.BoxGeometry(0.014, 0.25, 0.12).translate(s * 0.23, -0.97, -0.13))),
          underPaint(new THREE.BoxGeometry(0.34, 0.1, 0.22).translate(0, -0.86, -0.16)),
          // Karbüratör girişi
          underPaint(new THREE.BoxGeometry(0.2, 0.09, 0.26).translate(0, -0.9, 0.92)),
          tag(new THREE.BoxGeometry(0.15, 0.05, 0.02).translate(0, -0.9, 1.05), 'dark'),
          // Kuyruk: yatay kuyruk ve dümenler, sabit kuyruk tekeri ve önündeki kaporta
          ...controlWing(T, 0.65, [[0, 0.96, 'elevator'], [0.96, 1, null]], 6),
          ...hingedFin(H, 
            [[-0.04, -4.75], [0.19, -4.54], [0.32, -4.63], [0.77, -4.88], [1.08, -5.18], [1.22, -5.46], [1.31, -5.67]],
            [[-0.59, -5.77], [-0.46, -6.25], [-0.3, -6.39], [-0.04, -6.44], [0.19, -6.43], [0.77, -6.35], [1.08, -6.19], [1.22, -6.02], [1.31, -5.84]],
            -5.73, 0.12, 0.05,
          ),
          underPaint(new JetHull([[-3.74, 0.015, -0.71, -0.75, -0.73], [-4.6, 0.07, -0.64, -0.8, -0.72], [-4.92, 0.06, -0.6, -0.82, -0.7], [-5.0, 0.02, -0.6, -0.76, -0.68]], 2.2, false).geo(8)),
          tag(rod(new THREE.Vector3(0, -0.62, -4.86), new THREE.Vector3(0, -0.88, -5.03), 0.026, 5), 'dark'),
          ...wheelParts(0.14, 0.085, 0, -0.88, -5.03).map((g) => tag(g, 'dark')),
        ],
        props: [{ z: 2.68, r: 1.72, blades: 3 }],
        markZ: -2.75,
        markR: 0.47,
        tank: mirror(2.2, (x) => tankAt(-1.0, 0.3, x, 0.72)),
        soot: [[0.47, 0.08, 1.65, 2.8]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [W.tipX + 0.5, yTip, 0.1], kind: 'red' },
          { p: [-W.tipX - 0.5, yTip, 0.1], kind: 'green' },
          { p: [0, 0.4, -6.46], kind: 'white' },
          { p: [3.0, -0.51, 0.85], kind: 'landing' },
        ],
      };
    }
    case 'spitfire':
    case 'spitfire5':
    case 'spitfire9': {
      // Spitfire, Mk Vb üç görünüş çiziminden (eliptik kanat 174,5 piksel/m; gövde boyu gerçek 9,12 m'ye 182 piksel/m).
      // Sivri burun, dar gövde, kabarık kapak. Kanat 6° yukarı, ince ve eliptik; alt yüzde düzensiz soğutucular: Mk I ve
      // V'te sağda dikdörtgen radyatör, solda yuvarlak yağ soğutucu; Mk IX'da iki yanda dikdörtgen. Takım dışa toplanır,
      // kuyruk tekeri sabit. Mk IX'un burnu 35 cm uzun, pervanesi dört palalı.
      const n9 = key === 'spitfire9';
      const v5 = key === 'spitfire5';
      const Z = (px: number) => (673 - px) / 182;
      const nz = (z: number) => (n9 ? z + 0.35 : z);
      const H = new JetHull(([
        [240, 0.31, 0.32, -0.32, 0, 1], [272, 0.33, 0.325, -0.62, -0.12, 1], [331, 0.39, 0.33, -0.785, -0.18, 1], [412, 0.43, 0.345, -0.87, -0.25, 1],
        [493, 0.46, 0.355, -0.89, -0.27, 0.5], [576, 0.47, 0.37, -0.92, -0.28, 0], [718, 0.47, 0.4, -0.95, -0.3, 0], [855, 0.46, 0.43, -0.93, -0.28, 0],
        [900, 0.455, 0.45, -0.915, -0.27, 0], [917, 0.45, 0.57, -0.905, -0.26, 0], [985, 0.43, 0.56, -0.88, -0.25, 0], [1103, 0.38, 0.52, -0.82, -0.24, 0],
        [1206, 0.335, 0.487, -0.75, -0.2, 0], [1346, 0.26, 0.42, -0.665, -0.17, 0], [1471, 0.19, 0.35, -0.57, -0.13, 0], [1596, 0.09, 0.25, -0.46, -0.12, 0], [1690, 0.03, 0.13, -0.38, -0.12, 0],
      ] as number[][]).map(([px, w, t, b, wy, k]) => [Z(px) + (n9 ? 0.35 * k : 0), w, t, b, wy] as JetSec), 2.35, true, 2.1);
      // Kanat: [x, hücum kenarı (piksel), firar kenarı (piksel), kalınlık]
      const yAt = (x: number) => -0.7 + (x - 0.47) * tanD(6);
      const WR: WingRow[] = ([
        [0.47, 468, 1000, 0.38], [0.6, 468, 944, 0.34], [0.8, 468, 919, 0.33], [1.5, 470, 916, 0.31], [2.3, 478, 903, 0.27], [3.0, 488, 885, 0.235],
        [3.7, 503, 860, 0.19], [4.3, 522, 828, 0.15], [4.8, 549, 787, 0.11], [5.2, 581, 743, 0.08], [5.45, 606, 691, 0.05], [5.615, 632, 654, 0.015],
      ] as number[][]).map(([x, le, te, t]) => [x, yAt(x), Z(le), (te - le) / 174.5, t]);
      const TR: WingRow[] = ([[0.06, 1529, 1750], [0.26, 1529, 1750], [0.6, 1537, 1750], [1.02, 1556, 1743], [1.36, 1596, 1728], [1.53, 1625, 1699], [1.61, 1655, 1668]] as number[][])
        .map(([x, le, te]) => [x, 0.14, Z(le), (te - le) / 182, 0.11 * (1 - 0.5 * (x / 1.61) ** 2)]);
      const lePt = (x: number, s: number) => { const r = rowAt(WR, x); return new THREE.Vector3(s * x, r[1], r[2]); };
      const stack = (sd: number, z0: number, z1: number) => tag(body([[z0, 0.001], [z0 - 0.04, 0.05], [z1 + 0.03, 0.058], [z1, 0.04]], 6, { x: sd * (H.sideX((z0 + z1) / 2, 0.07) + 0.012), y: 0.07, sx: 1.1, sy: 0.9, smooth: true }), 'dark');
      const radiator = (x: number, deep: number, len: number, w: number) => {
        const r = rowAt(WR, Math.abs(x));
        const zf = r[2] - r[3] * 0.32;
        const top = r[1] - 0.1;
        const shell = new JetHull([[zf, w * 0.9, top, top - deep * 0.72, top - deep * 0.4], [zf - 0.1, w, top, top - deep * 0.92, top - deep * 0.45], [zf - len * 0.55, w, top, top - deep, top - deep * 0.45], [zf - len, w * 0.7, top, top - deep * 0.25, top - deep * 0.1]], 3.2, false);
        const duct = new JetHull([[zf, w * 0.8, top - 0.03, top - deep * 0.66, top - deep * 0.36], [zf - 0.3, w * 0.75, top - 0.03, top - deep * 0.6, top - deep * 0.36]], 2.6, false);
        return [underPaint(shell.geo(10).translate(x, 0, 0)), tag(duct.geo(8).translate(x, 0, 0), 'dark'), tag(duct.disc(zf - 0.3, 1, 8).translate(x, 0, 0), 'dark')];
      };
      const round = (x: number) => {
        const r = rowAt(WR, Math.abs(x));
        const zf = r[2] - r[3] * 0.28;
        return [underPaint(body([[zf - 0.85, 0.05], [zf - 0.55, 0.17], [zf - 0.1, 0.17], [zf, 0.12]], 10, { x, y: r[1] - 0.2, smooth: true })), tag(body([[zf + 0.005, 0.001], [zf + 0.002, 0.1]], 10, { x, y: r[1] - 0.2 }), 'dark')];
      };
      const ports = n9 ? [2.5] : v5 ? [2.65, 2.85, 3.05, 3.25] : [2.15, 2.45, 2.75, 3.0];
      return {
        solids: [
          H.geo(14, [true, true]),
          spinnerRows([[Z(127) + (n9 ? 0.35 : 0), 0], [nz(2.89), 0.17], [nz(2.69), 0.27], [nz(2.39), 0.325]]),
          ...[1, -1].flatMap((sd) => [stack(sd, nz(2.04), nz(1.67)), stack(sd, nz(1.66), nz(1.33)), stack(sd, nz(1.32), nz(1.05))]),
          tag(H.patch(1, -0.68, -1.34, Math.PI / 2 - 0.62, Math.PI / 2 + 0.62, 0.006), 'dark'),
          // Kapağın gerisinde yan camlar
          ...[1, -1].map((sd) => tag(H.patch(sd, -1.4, -1.68, 0.72, 1.12, 0.005), 'dark')),
          ...jetCanopy({
            screen: [[-0.25, 0.2, 0.4, 0.15, 0.3], [-0.63, 0.29, 0.64, 0.15, 0.42]],
            glass: [[-0.63, 0.29, 0.64, 0.15, 0.42], [-0.8, 0.31, 0.67, 0.15, 0.44], [-1.05, 0.31, 0.67, 0.15, 0.44], [-1.31, 0.285, 0.58, 0.15, 0.42]],
            aft: [[-1.27, 0.28, 0.57, 0.2, 0.4], [-1.42, 0.27, 0.56, 0.2, 0.4]],
            frames: [-0.64, -1.3],
            posts: [[0.19, 0.38, -0.25], [0.27, 0.61, -0.63]],
            pilot: { z: -0.98, len: 1.3, h: 0.34, y: 0.33, w: 0.28 },
            p: 2.6,
          }),
          mastRod(0.5, Z(1014), 1.22, Z(1012)),
          ...planWing(WR, { xh: 0.85, span: [2.8, 4.9] }),
          ...rowFlap(WR, 0.62, 2.7, 0.8),
          ...[1, -1].flatMap((s) => ports.map((x) => {
            const q = lePt(x, s);
            return tag(new THREE.SphereGeometry(1, sg(4), sg(3)).scale(0.02, 0.02, 0.035).translate(q.x, q.y + 0.01, q.z - 0.004), 'dark');
          })),
          // Mk Vb ve IX: kanatta 20 mm top ve dış gövdesi
          ...(v5 || n9 ? [1, -1].flatMap((s) => {
            const q = lePt(2.07, s);
            return [tag(rod(new THREE.Vector3(q.x, q.y + 0.01, q.z - 0.1), new THREE.Vector3(q.x, q.y + 0.01, q.z + 0.82), 0.022, 6), 'dark'), body([[q.z + 0.3, 0.03], [q.z + 0.05, 0.06], [q.z - 0.4, 0.06]], 8, { x: q.x, y: q.y + 0.01, smooth: true })];
          }) : []),
          // Radyatör ve yağ soğutucu (model +x sol kanat)
          ...radiator(-1.25, 0.34, 1.25, 0.24),
          ...(n9 ? radiator(1.25, 0.34, 1.25, 0.24) : round(1.25)),
          // Karbüratör girişi
          underPaint(new THREE.BoxGeometry(0.22, 0.12, 0.42).translate(0, -0.93, nz(1.0))),
          tag(new THREE.BoxGeometry(0.17, 0.07, 0.02).translate(0, -0.93, nz(1.0) + 0.21), 'dark'),
          ...planWing(TR, { xh: 0.58, span: [0.26, 1.53], name: 'elevator' }),
          ...hingedFin(H, 
            [[0.1, Z(1440)], [0.35, Z(1515)], [0.55, Z(1573)], [0.8, Z(1600)], [1.09, Z(1636)], [1.24, Z(1676)]],
            [[-0.38, Z(1720)], [-0.14, Z(1780)], [0.25, Z(1787)], [0.8, Z(1765)], [1.09, Z(1730)], [1.26, Z(1695)]],
            Z(1681), 0.11, 0.04,
          ),
          ...fixedTailWheel(Z(1640), -0.55, 0.11, 0.07, -0.34, Z(1610)),
        ],
        props: [{ z: nz(2.6), r: 1.64, blades: n9 ? 4 : 3 }],
        markZ: -2.75,
        markR: 0.4,
        tank: [tankAt(-1.18, 0.6, 0, 0.8)],
        bombs: n9 ? [bombAt(0, -1.15, 0.5, 1.2)] : undefined,
        soot: [[0.42, 0.07, nz(1.45), 2.6]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [5.63, yAt(5.6), Z(640)], kind: 'red' },
          { p: [-5.63, yAt(5.6), Z(640)], kind: 'green' },
          { p: [0, 0.3, Z(1790)], kind: 'white' },
          { p: [2.6, yAt(2.6) - 0.1, Z(500)], kind: 'landing' },
        ],
      };
    }
    case 'typhoon': {
      // Typhoon Mk Ib, üç görünüş çiziminden (74 piksel/m; yan görünüş 12° yer açısıyla çizilmiş). Burun altında büyük çene
      // radyatörü, yanlarda altı egzoz, damla kapak. Kalın kanat: iç kısım aşağı, dış kısım yukarı kırık (ters martı).
      // Hücum kenarından çıkan dört Hispano ve kılıfları. Takım içe, kuyruk tekeri toplanır.
      const H = new JetHull([[2.44,0.405,0.437,-0.221,0.081],[2.26,0.415,0.468,-0.745,-0.187],[2.08,0.487,0.5,-1.119,-0.374],[1.28,0.602,0.641,-1.246,-0.378],[1.16,0.609,0.64,-1.265,-0.389],[0.04,0.604,0.629,-1.083,-0.295],[-0.34,0.596,0.779,-1.02,-0.193],[-0.85,0.577,0.836,-0.937,-0.121],[-1.02,0.571,0.853,-0.921,-0.105],[-1.83,0.541,0.612,-0.846,-0.175],[-2.88,0.541,0.558,-0.749,-0.148],[-3.15,0.541,0.534,-0.724,-0.146],[-4.57,0.527,0.407,-0.635,-0.156],[-4.99,0.518,0.378,-0.609,-0.155],[-5.55,0.506,0.339,-0.569,-0.151],[-6.41,0.471,0.203,-0.507,-0.181],[-6.55,0.464,0.203,-0.497,-0.175]] as JetSec[], 2.5, true, 2.15);
      const WR = [[0.5,-0.429,1.608,3.311,0.5],[0.7,-0.45,1.365,2.662,0.48],[1.5,-0.535,1.311,2.433,0.42],[2.3,-0.62,1.23,2.216,0.34],[3.7,-0.474,1.135,1.932,0.26],[5.8,-0.256,1.027,1.486,0.14],[6,-0.235,0.973,1.392,0.11],[6.2,-0.215,0.797,1.013,0.07],[6.33,-0.201,0.351,0.108,0.02]] as WingRow[];
      const TR = [[0.08,0.403,-4.541,1.527,0.128],[0.25,0.403,-4.568,1.459,0.124],[1,0.403,-4.649,1.243,0.105],[1.6,0.403,-4.743,1.014,0.09],[1.9,0.403,-4.905,0.649,0.082],[2.06,0.403,-5.176,0.108,0.078]] as WingRow[];
      const lePt = (x: number, s: number) => { const r = rowAt(WR, x); return new THREE.Vector3(s * x, r[1], r[2]); };
      return {
        solids: [
          H.geo(14, [true, true]),
          spinnerRows([[3.0, 0], [2.85, 0.16], [2.62, 0.3], [2.4, 0.36]], -0.02),
          // Çene radyatörünün ağzı
          tag(new THREE.SphereGeometry(1, sg(10), sg(6)).scale(0.42, 0.25, 0.06).translate(0, -0.62, 2.287), 'dark'),
          ...stubRow(H, 6, 1.974, 0.2, -0.01, 0.05),
          tag(H.patch(1, -0.357, -1.83, Math.PI / 2 - 0.72, Math.PI / 2 + 0.72, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[0.004, 0.17, 0.595, 0.295, 0.475], [-0.318, 0.27, 0.899, 0.295, 0.6990000000000001]],
            glass: [[-0.318, 0.27, 0.899, 0.295, 0.6990000000000001], [-0.784, 0.3, 0.984, 0.295, 0.764], [-1.368, 0.27, 0.832, 0.295, 0.6319999999999999], [-1.859, 0.08, 0.605, 0.355, 0.505]],
            aft: [[-1.832, 0.06, 0.579, 0.299, 0.479], [-1.976, 0.02, 0.5439999999999999, 0.27399999999999997, 0.45399999999999996]],
            frames: [-0.331],
            posts: [[0.16, 0.5449999999999999, 0.004], [0.25, 0.869, -0.318]],
            pilot: { z: -0.872, len: 1.3, h: 0.36, y: 0.47200000000000003, w: 0.28 },
          }),
          mastRod(0.49500000000000005, -2.88, 1.114, -2.828, 0.012),
          ...planWing(WR, { xh: 0.82, span: [3.7, 5.9] }),
          ...rowFlap(WR, 0.75, 3.65, 0.78),
          // Dört Hispano: kılıf ve namlu
          ...[1, -1].flatMap((s) => [2.57, 3.35].flatMap((x) => {
            const q = lePt(x, s);
            return [body([[q.z + 0.45, 0.03], [q.z + 0.1, 0.07], [q.z - 0.3, 0.07]], 8, { x: q.x, y: q.y, smooth: true }), tag(rod(new THREE.Vector3(q.x, q.y, q.z + 0.3), new THREE.Vector3(q.x, q.y, q.z + 0.95), 0.024, 6), 'dark')];
          })),
          ...planWing(TR, { xh: 0.6, span: [0.25, 1.85], name: 'elevator' }),
          ...hingedFin(H, [[0.08,-4.982],[0.399,-5.052],[1.026,-5.403],[1.455,-5.795],[1.565,-6.117]], [[-0.62,-6.236],[-0.503,-6.529],[-0.043,-6.873],[0.911,-6.809],[1.411,-6.564],[1.579,-6.183]], -6.183, 0.13, 0.05),
          ...retractTailWheel(-5.668, -0.741, 0.16, 0.09, -0.446, -5.301),
        ],
        props: [{ z: 2.58, y: -0.02, r: 2.1, blades: 4 }],
        markZ: -2.7,
        markR: 0.44,
        soot: [[0.5, -0.01, 1.5, 2.8]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [6.35, -0.20415841584158417, 0.297], kind: 'red' },
          { p: [-6.35, -0.20415841584158417, 0.297], kind: 'green' },
          { p: [0, 0.911, -6.835], kind: 'white' },
          { p: [3.0, -0.5972277227722773, 1.203], kind: 'landing' },
        ],
      };
    }
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
      // Bf 109, gövde E sürümünün ayrıntılı yan görünüşünden (205,7 piksel/m), kanat bilinen ölçülerden. Dar, derin gövde;
      // alçak kanat, köşeli ve çerçeveli kapak, altta geniş yağ soğutucu, kanat altında sığ radyatörler. E'de kuyruk
      // destekli ve kanat ucu köşeli, sıkıştırıcı girişi köşeli. F ve G'de burun 30 cm uzun ve yuvarlak, göbek büyük,
      // kuyruk desteksiz, kanat ucu yuvarlak. G'de burunda iki MG 131 kabartısı. Takım dışa toplanır, geniş bir açıyla iner.
      const E = key === 'bf109e';
      const G = key === 'bf109g';
      const Z = (d: number) => (600 - d) / 205.7;
      const dN = E ? 0 : G ? 0.38 : 0.3;
      const nz = (z: number) => z + dN;
      const H = new JetHull(([
        [103, 0.29, 0.3, -0.28, 0.01, 1], [125, 0.32, 0.37, -0.36, 0, 1], [170, 0.35, 0.46, -0.43, 0.02, 1], [250, 0.385, 0.51, -0.45, 0.05, 1], [410, 0.42, 0.6, -0.465, 0.07, 0.4],
        [587, 0.44, 0.637, -0.47, 0.1, 0], [640, 0.44, 0.55, -0.47, 0.1, 0], [800, 0.44, 0.52, -0.46, 0.1, 0], [872, 0.43, 0.865, -0.42, 0.12, 0], [1000, 0.38, 0.83, -0.35, 0.14, 0],
        [1200, 0.3, 0.754, -0.205, 0.2, 0], [1400, 0.21, 0.705, -0.04, 0.26, 0], [1495, 0.16, 0.685, 0.03, 0.3, 0], [1600, 0.1, 0.62, 0.12, 0.33, 0], [1700, 0.03, 0.46, 0.23, 0.34, 0],
      ] as number[][]).map(([d, w, t, b, wy, k]) => [Z(d) + dN * k, w, t, b, wy] as JetSec), 2.5, true, 2.2);
      const yAt = (x: number) => -0.33 + (x - 0.44) * tanD(6.5);
      const WR: WingRow[] = (E
        ? [[0.44, 0.875, 2.07, 0.29], [1.5, 0.79, 1.85, 0.25], [2.7, 0.68, 1.62, 0.2], [3.9, 0.57, 1.38, 0.15], [4.45, 0.5, 1.2, 0.11], [4.75, 0.4, 0.92, 0.07], [4.9, 0.22, 0.45, 0.035], [4.935, 0.06, 0.12, 0.012]]
        : [[0.44, 0.875, 2.07, 0.29], [1.5, 0.79, 1.85, 0.25], [2.7, 0.68, 1.62, 0.2], [3.6, 0.6, 1.42, 0.16], [4.1, 0.52, 1.2, 0.12], [4.55, 0.38, 0.85, 0.075], [4.85, 0.18, 0.4, 0.035], [4.96, 0.0, 0.08, 0.01]]
      ).map(([x, le, c, t]) => [x, yAt(x), le, c, t]);
      const TR: WingRow[] = ([[0.05, -4.56, 1.02], [0.2, -4.58, 0.98], [1.0, -4.68, 0.88], [1.3, -4.82, 0.66], [1.45, -4.97, 0.34], [1.5, -5.08, 0.1]] as number[][])
        .map(([x, le, c]) => [x, 0.82, le, c, 0.1 * (1 - 0.4 * x / 1.5)]);
      const exh = (sd: number) => Array.from({ length: 6 }, (_, i) => {
        const z = nz(Z(238) - i * 0.15);
        return tag(new THREE.CylinderGeometry(0.03, 0.045, 0.1, sg(5)).rotateZ(-sd * Math.PI / 2).rotateY(sd * 0.55).translate(sd * (H.sideX(z, -0.13) + 0.025), -0.13, z), 'dark');
      });
      const rad = (s: number) => {
        const r = rowAt(WR, 1.6);
        const zf = -0.18;
        const y = r[1] - 0.08;
        const shell = new JetHull([[zf, 0.33, y, y - 0.14, y - 0.07], [zf - 0.12, 0.36, y, y - 0.19, y - 0.08], [zf - 0.5, 0.36, y, y - 0.19, y - 0.08], [zf - 0.8, 0.3, y, y - 0.03, y - 0.01]], 3.2, false);
        const duct = new JetHull([[zf, 0.3, y - 0.02, y - 0.12, y - 0.07], [zf - 0.2, 0.28, y - 0.02, y - 0.11, y - 0.07]], 2.8, false);
        return [underPaint(shell.geo(8).translate(s * 1.6, 0, 0)), tag(duct.geo(8).translate(s * 1.6, 0, 0), 'dark'), tag(duct.disc(zf - 0.2, 1, 8).translate(s * 1.6, 0, 0), 'dark')];
      };
      const oil = new JetHull([[nz(Z(245)), 0.1, -0.42, -0.47, -0.45], [nz(Z(270)), 0.17, -0.42, -0.53, -0.46], [nz(Z(350)), 0.19, -0.42, -0.55, -0.46], [nz(Z(390)), 0.16, -0.42, -0.5, -0.45], [Z(430), 0.05, -0.42, -0.45, -0.43]], 3, false);
      const hb = E ? 0.29 : 0.34;
      const glassY = 0.33;
      return {
        solids: [
          H.geo(14, [true, true]),
          spinnerRows(E
            ? [[Z(45), 0], [Z(60), 0.13], [Z(80), 0.22], [Z(103), hb]]
            : [[nz(Z(45)), 0], [nz(Z(50)), 0.08], [nz(Z(66)), 0.2], [nz(Z(90)), 0.29], [nz(Z(112)), hb]], 0.01),
          ...[1, -1].flatMap(exh),
          // Sıkıştırıcı girişi (sol yan): E'de köşeli, F ve G'de yuvarlak dirsek
          E ? underPaint(new THREE.BoxGeometry(0.1, 0.13, 0.34).translate(H.sideX(0.75, 0.12) + 0.02, 0.12, 0.75)) : body([[0.7, 0.03], [0.82, 0.07], [1.02, 0.075], [1.08, 0.05]], 8, { x: H.sideX(0.85, 0.12) + 0.02, y: 0.12 }),
          tag(new THREE.BoxGeometry(0.075, 0.1, 0.02).translate(H.sideX(E ? 0.75 : 0.85, 0.12) + 0.02, 0.12, E ? 0.92 : 1.08), 'dark'),
          ...(G ? [1, -1].map((s) => body([[nz(0.95), 0.02], [nz(1.1), 0.075], [nz(1.3), 0.075], [nz(1.42), 0.02]], 8, { x: s * 0.24, y: 0.53, sy: 0.75, smooth: true })) : []),
          ...[1, -1].map((s) => tag(new THREE.CylinderGeometry(0.018, 0.018, 0.1, sg(5)).rotateX(Math.PI / 2).translate(s * 0.13, 0.46, nz(Z(170))), 'dark')),
          tag(H.patch(1, -0.1, -1.3, Math.PI / 2 - 0.72, Math.PI / 2 + 0.72, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[Z(587), 0.2, 0.64, glassY, 0.47], [Z(625), 0.285, 0.865, glassY, 0.56]],
            glass: [[Z(625), 0.285, 0.865, glassY, 0.56], [Z(800), 0.3, 0.865, glassY, 0.56], [Z(872), 0.26, 0.865, glassY, 0.56]],
            aft: [[Z(868), 0.24, 0.86, 0.5, 0.56], [Z(880), 0.22, 0.86, 0.5, 0.56]],
            frames: [Z(630), Z(655), Z(800)],
            posts: [[0.18, 0.5, Z(587)], [0.25, 0.85, Z(625)]],
            pilot: { z: -0.72, len: 1.3, h: 0.36, y: 0.46, w: 0.28 },
            p: 4,
            rails: [1.12],
          }),
          mastRod(0.82, -1.25, 1.33, -1.25),
          tag(rod(new THREE.Vector3(0, 1.33, -1.25), new THREE.Vector3(0, 1.48, Z(1622)), 0.005, 3), 'dark'),
          ...planWing(WR, { xh: 0.72, span: E ? [2.9, 4.62] : [2.9, 4.5] }),
          ...rowFlap(WR, 0.5, 2.85, 0.72),
          ...rad(1),
          ...rad(-1),
          underPaint(oil.geo(10)),
          tag(new THREE.BoxGeometry(0.2, 0.05, 0.02).translate(0, -0.47, nz(Z(262))), 'dark'),
          ...planWing(TR, { xh: 0.55, span: [0.2, 1.42], name: 'elevator' }),
          ...(E ? [1, -1].map((s) => tag(rod(new THREE.Vector3(s * 0.75, 0.81, -4.92), new THREE.Vector3(s * 0.12, 0.2, Z(1570)), 0.018, 4), 'dark')) : []),
          ...hingedFin(H, 
            [[0.45, Z(1460)], [0.685, Z(1495)], [0.94, Z(1530)], [1.23, Z(1578)], [1.42, Z(1610)], [1.51, Z(1628)]],
            [[0.21, Z(1725)], [0.345, Z(1810)], [0.45, Z(1822)], [0.647, Z(1815)], [0.987, Z(1800)], [1.376, Z(1760)], [1.536, Z(1695)]],
            Z(1692), 0.1, 0.035,
          ),
          ...fixedTailWheel(Z(1625), -0.06, 0.14, 0.08, 0.17, Z(1590)),
        ],
        props: [{ z: nz(Z(85)), r: 1.5, blades: 3 }],
        markZ: -2.77,
        markR: 0.46,
        tank: E ? undefined : [tankAt(-0.75, 0.3, 0, 0.75)],
        bombs: [bombAt(0, -0.75, 0.4, 1.3)],
        soot: [[0.4, -0.13, nz(Z(420)), 2.2]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [WR[WR.length - 1][0] + 0.005, yAt(4.9), 0.0], kind: 'red' },
          { p: [-WR[WR.length - 1][0] - 0.005, yAt(4.9), 0.0], kind: 'green' },
          { p: [0, 0.5, Z(1825)], kind: 'white' },
        ],
      };
    }
    case 'fw190': {
      // Fw 190 A, üç görünüş çiziminden (plan 92,9, yan 85,4 piksel/m). Yuvarlak BMW 801 kaportası, önünde soğutma fanı ve
      // büyük göbek; kısa, kalın gövde, kabarık kapak, arkasında gövdeye inen metal bitiş. Düz kenarlı geniş kanat, uzun
      // açıklıklı takım iç kanattan iner ve içe toplanır. Kanatta dışa uzanan top namluları.
      const Z = (d: number) => (920.9 - d) / 85.4;
      const H = new JetHull(([
        [740, 0.5, 0.47, -0.47, 0], [760, 0.55, 0.585, -0.64, -0.03], [850, 0.57, 0.667, -0.667, 0], [955, 0.5, 0.56, -0.67, -0.05], [1090, 0.45, 0.5, -0.6, -0.05],
        [1180, 0.38, 0.47, -0.5, -0.03], [1300, 0.22, 0.27, -0.35, -0.02], [1412, 0.05, 0.15, -0.24, -0.04],
      ] as number[][]).map(([d, w, t, b, wy]) => [Z(d), w, t, b, wy] as JetSec), 2.15, true, 2.15);
      const yAt = (x: number) => -0.5 + (x - 0.55) * tanD(5.5);
      const WR: WingRow[] = ([[0.55, 1.06, 2.4, 0.36], [1.5, 0.95, 2.18, 0.3], [3.0, 0.77, 1.82, 0.22], [4.5, 0.6, 1.46, 0.15], [5.04, 0.52, 1.22, 0.1], [5.18, 0.38, 0.85, 0.06], [5.25, 0.16, 0.3, 0.02]] as number[][])
        .map(([x, le, c, t]) => [x, yAt(x), le, c, t]);
      const TR: WingRow[] = ([[0.08, -4.66, 0.87], [1.2, -4.72, 0.8], [1.6, -4.86, 0.6], [1.78, -5.02, 0.32], [1.82, -5.12, 0.12]] as number[][])
        .map(([x, le, c]) => [x, 0.14, le, c, 0.1 * (1 - 0.4 * x / 1.82)]);
      const lePt = (x: number, s: number) => { const r = rowAt(WR, x); return new THREE.Vector3(s * x, r[1], r[2]); };
      const gill = (s: number, a0: number, a1: number) => tag(H.patch(s, 1.9, 0.92, a0, a1, 0.006), 'dark');
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(Z(740), 1, 16), 'dark'),
          // Soğutma fanı: göbeğin gerisinde parlak halka ve palalar
          new THREE.TorusGeometry(0.44, 0.03, sg(4), sg(10)).translate(0, 0, Z(742)),
          spinnerRows([[2.75, 0], [2.58, 0.14], [2.35, 0.28], [2.14, 0.38]]),
          ...[1, -1].flatMap((s) => [gill(s, -0.08, -0.03), gill(s, -0.58, -0.53)]),
          ...stubRow(H, 4, Z(852), 0.14, -0.3, 0.05),
          tag(H.patch(1, -0.5, -2.05, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[Z(955), 0.2, 0.65, 0.35, 0.44], [Z(1000), 0.32, 0.93, 0.35, 0.55]],
            glass: [[Z(1000), 0.32, 0.93, 0.35, 0.55], [Z(1040), 0.34, 0.95, 0.35, 0.56], [Z(1090), 0.26, 0.74, 0.35, 0.52]],
            aft: [[Z(1085), 0.25, 0.74, 0.3, 0.5], [Z(1125), 0.2, 0.62, 0.3, 0.45], [Z(1180), 0.03, 0.48, 0.3, 0.36]],
            frames: [Z(1002), Z(1085)],
            posts: [[0.18, 0.55, Z(955)], [0.3, 0.9, Z(1000)]],
            pilot: { z: -1.45, len: 1.3, h: 0.36, y: 0.5, w: 0.3 },
            p: 2.5,
          }),
          mastRod(0.72, Z(1090), 0.98, Z(1093), 0.012),
          tag(rod(new THREE.Vector3(0, 0.98, Z(1093)), new THREE.Vector3(0, 1.3, Z(1388)), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.74, span: [2.8, 4.9] }),
          ...rowFlap(WR, 0.6, 2.75, 0.74),
          ...[1, -1].flatMap((s) => [2.32, 2.67].map((x) => {
            const q = lePt(x, s);
            return tag(rod(new THREE.Vector3(q.x, q.y, q.z - 0.08), new THREE.Vector3(q.x, q.y, q.z + 0.4), 0.018, 5), 'dark');
          })),
          ...[1, -1].map((s) => tag(new THREE.BoxGeometry(0.03, 0.05, 0.5).translate(s * 0.12, H.topY(1.7, 0.12) + 0.004, 1.7), 'dark')),
          ...planWing(TR, { xh: 0.6, span: [0.08, 1.7], name: 'elevator' }),
          ...hingedFin(H, 
            [[0.1, Z(1290)], [0.29, Z(1310)], [0.7, Z(1335)], [1.0, Z(1358)], [1.22, Z(1382)]],
            [[-0.24, Z(1420)], [-0.12, Z(1445)], [0.3, Z(1450)], [0.75, Z(1440)], [1.1, Z(1428)], [1.31, Z(1400)]],
            Z(1410), 0.11, 0.05,
          ),
          ...retractTailWheel(Z(1385), -0.375, 0.13, 0.08, -0.2, Z(1370)),
        ],
        props: [{ z: 2.27, r: 1.65, blades: 3 }],
        markZ: -2.9,
        markR: 0.4,
        tank: [tankAt(-0.95, 0.25, 0, 0.75)],
        bombs: [bombAt(0, -0.95, 0.2, 1.3)],
        soot: [[0.55, -0.3, 0.95, 2.4]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [5.27, yAt(5.2), 0.02], kind: 'red' },
          { p: [-5.27, yAt(5.2), 0.02], kind: 'green' },
          { p: [0, 0.5, Z(1452)], kind: 'white' },
        ],
      };
    }
    case 'p51d': {
      // P-51D Mustang, üç görünüş çiziminden (74,5 piksel/m). Düz yanlı uzun burun, damla kapak, karın altında uzun radyatör
      // kanalı. Laminer kanat: düz kenarlar, köşeli uç, 5° yukarı. Köşeli kuyruk. Takım içe, kuyruk tekeri de toplanır.
      const Z = (d: number) => (316.5 - d) / 74.5;
      const H = new JetHull(([
        [140, 0.33, 0.28, -0.33, 0], [170, 0.39, 0.37, -0.58, -0.06], [200, 0.44, 0.44, -0.71, -0.1], [270, 0.47, 0.5, -0.81, -0.15], [340, 0.49, 0.54, -0.81, -0.15], [420, 0.48, 0.52, -0.81, -0.15],
        [510, 0.41, 0.55, -0.8, -0.15], [585, 0.35, 0.48, -0.72, -0.13], [630, 0.3, 0.5, -0.6, -0.08], [710, 0.2, 0.62, -0.42, 0.02], [775, 0.05, 0.4, -0.25, 0.06],
      ] as number[][]).map(([d, w, t, b, wy]) => [Z(d), w, t, b, wy] as JetSec), 2.5, true, 2.1);
      const yAt = (x: number) => -0.55 + (x - 0.45) * tanD(5);
      const WR: WingRow[] = ([[0.45, 0.34, 2.68, 0.42], [1.5, 0.26, 2.45, 0.33], [3.0, 0.12, 1.98, 0.24], [4.5, -0.02, 1.5, 0.16], [5.3, -0.12, 1.29, 0.11], [5.52, -0.16, 1.0, 0.08], [5.62, -0.24, 0.62, 0.045], [5.66, -0.35, 0.25, 0.015]] as number[][])
        .map(([x, le, c, t]) => [x, yAt(x), le, c, t]);
      const TR: WingRow[] = ([[0.1, -4.81, 1.22], [1.0, -5.09, 1.05], [1.7, -5.27, 0.76], [1.93, -5.36, 0.5], [2.0, -5.6, 0.2]] as number[][])
        .map(([x, le, c]) => [x, 0.28, le, c, 0.13 * (1 - 0.4 * x / 2)]);
      const scoop = new JetHull([[Z(385), 0.28, -0.7, -0.87, -0.8], [Z(390), 0.33, -0.7, -1.12, -0.9], [Z(440), 0.33, -0.7, -1.14, -0.9], [Z(520), 0.3, -0.62, -0.93, -0.78], [Z(590), 0.16, -0.5, -0.62, -0.56]], 3, false);
      const sd = new JetHull([[Z(388), 0.28, -0.82, -1.08, -0.94], [Z(415), 0.26, -0.84, -1.05, -0.94]], 2.6, false);
      const lePt = (x: number, s: number) => { const r = rowAt(WR, x); return new THREE.Vector3(s * x, r[1], r[2]); };
      return {
        solids: [
          H.geo(14, [true, true]),
          spinnerRows([[3.0, 0], [2.78, 0.17], [2.57, 0.26], [2.37, 0.315]]),
          ...stubRow(H, 6, 1.83, 0.17, 0.07),
          tag(H.patch(1, -0.7, -2.5, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[Z(340), 0.18, 0.55, 0.25, 0.36], [Z(375), 0.33, 0.8, 0.25, 0.42]],
            glass: [[Z(375), 0.33, 0.8, 0.25, 0.42], [Z(420), 0.37, 0.84, 0.25, 0.42], [Z(470), 0.33, 0.84, 0.25, 0.42], [Z(508), 0.13, 0.57, 0.38, 0.47]],
            aft: [[Z(503), 0.12, 0.57, 0.4, 0.47], [Z(515), 0.03, 0.55, 0.4, 0.47]],
            frames: [Z(376)],
            posts: [[0.18, 0.5, Z(340)], [0.31, 0.77, Z(375)]],
            pilot: { z: -1.65, len: 1.4, h: 0.36, y: 0.42, w: 0.3 },
          }),
          mastRod(0.46, Z(585), 1.04, Z(585), 0.012),
          tag(rod(new THREE.Vector3(0, 0.84, Z(452)), new THREE.Vector3(0, 1.5, Z(735)), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.8, span: [3.37, 5.45] }),
          ...rowFlap(WR, 0.55, 3.35, 0.76),
          ...[1, -1].flatMap((s) => [2.3, 2.55, 2.8].map((x) => {
            const q = lePt(x, s);
            return tag(new THREE.SphereGeometry(1, sg(4), sg(3)).scale(0.022, 0.022, 0.035).translate(q.x, q.y + 0.01, q.z - 0.004), 'dark');
          })),
          underPaint(scoop.geo(12)),
          tag(sd.geo(8), 'dark'),
          tag(sd.disc(Z(415), 1, 8), 'dark'),
          ...planWing(TR, { xh: 0.7, span: [0.1, 1.85], name: 'elevator' }),
          ...hingedFin(H, 
            [[0.45, Z(690)], [0.64, Z(710)], [1.0, Z(722)], [1.58, Z(740)], [1.64, Z(746)]],
            [[-0.25, Z(785)], [-0.16, Z(812)], [0.1, Z(820)], [0.85, Z(808)], [1.62, Z(795)]],
            Z(772), 0.12, 0.06,
          ),
          ...retractTailWheel(Z(675), -0.67, 0.14, 0.08, -0.36, Z(660)),
        ],
        props: [{ z: 2.46, r: 1.71, blades: 4 }],
        markZ: -3.0,
        markR: 0.36,
        tank: mirror(2.5, (x) => tankAt(-0.82, -0.15, x, 0.85)),
        bombs: mirror(2.5, (x) => bombAt(x, -0.82, -0.1, 1.0)),
        soot: [[0.5, 0.07, 1.1, 2.6]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [5.67, yAt(5.6), -0.45], kind: 'red' },
          { p: [-5.67, yAt(5.6), -0.45], kind: 'green' },
          { p: [0, 1.0, Z(807)], kind: 'white' },
          { p: [1.2, yAt(1.2) - 0.2, 0.25], kind: 'landing' },
        ],
      };
    }
    case 'p47': {
      // P-47D "razorback", üç görünüş çiziminden (68 piksel/m; 12° yer açısı çizimde). Çok geniş yıldız motor kaportası, derin
      // karın (turbo kanalı), keskin sırt ve çerçeveli kapak; eliptik büyük kanat ve dört palalı büyük pervane. Kanatta
      // sekiz silah ağzı. Takım içe, kuyruk tekeri toplanır.
      const H = new JetHull([[2.38,0.559,0.53,-0.796,-0.204],[2.19,0.594,0.59,-1.029,-0.307],[1.82,0.652,0.706,-1.076,-0.284],[1.01,0.676,0.779,-1.179,-0.317],[0.79,0.676,0.79,-1.206,-0.33],[-0.53,0.662,0.853,-1.183,-0.303],[-0.97,0.653,0.882,-1.176,-0.291],[-1.85,0.622,0.882,-1.103,-0.258],[-2.52,0.586,0.632,-1.047,-0.338],[-2.73,0.57,0.626,-1.029,-0.332],[-4.21,0.411,0.588,-0.808,-0.23],[-5.82,0.212,0.485,-0.501,-0.101],[-6.56,0.136,0.338,-0.316,-0.053],[-7.12,0.092,0.235,-0.176,-0.012]] as JetSec[], 2.3, true, 1.95);
      const WR = [[0.55,-0.781,0.618,2.986,0.58],[0.75,-0.76,0.574,2.824,0.54],[3,-0.524,0.382,2.411,0.32],[5.2,-0.292,0.235,1.617,0.17],[5.85,-0.224,0.132,1.103,0.11],[6.15,-0.192,-0.206,0.397,0.05],[6.21,-0.186,-0.397,0.088,0.015]] as WingRow[];
      const TR = [[0.1,0.338,-6,1.5,0.148],[1.2,0.338,-6.28,1.32,0.121],[2,0.338,-6.55,0.95,0.101],[2.35,0.338,-6.8,0.5,0.092],[2.45,0.338,-7,0.18,0.09]] as WingRow[];
      const lePt = (x: number, s: number) => { const r = rowAt(WR, x); return new THREE.Vector3(s * x, r[1], r[2]); };
      return {
        solids: [
          H.geo(16, [false, true]),
          // Kaporta ağzı: ince halka, içeride koyu motor yüzü, küçük göbek
          tag(H.disc(2.38, 1, 16).translate(0, 0, -0.12), 'dark'),
          tag(new JetHull([[2.38, 0.509, 0.48000000000000004, -0.746, -0.204], [2.26, 0.49900000000000005, 0.47000000000000003, -0.736, -0.204]], 2.2, false).geo(16), 'dark'),
          new THREE.CylinderGeometry(0.42, 0.42, 0.12, sg(10)).rotateX(Math.PI / 2).translate(0, -0.03, 2.2399999999999998),
          spinnerRows([[3.0, 0], [2.86, 0.1], [2.66, 0.17], [2.4, 0.2]], 0),
          tag(H.patch(1, -0.603, -2.515, Math.PI / 2 - 0.62, Math.PI / 2 + 0.62, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[-0.529, 0.22, 0.873, 0.5760000000000001, 0.753], [-0.926, 0.31, 1.118, 0.5760000000000001, 0.8980000000000001]],
            glass: [[-0.926, 0.31, 1.118, 0.5760000000000001, 0.8980000000000001], [-1.412, 0.33, 1.118, 0.5760000000000001, 0.8980000000000001], [-2, 0.31, 1.088, 0.5760000000000001, 0.8680000000000001], [-2.515, 0.22, 0.647, 0.5760000000000001, 0.527]],
            aft: [[-2.471, 0.2, 0.647, 0.5760000000000001, 0.527], [-3.029, 0.04, 0.676, 0.5760000000000001, 0.5760000000000001]],
            frames: [-0.941, -1.324, -1.721, -2.118],
            posts: [[0.2, 0.853, -0.529], [0.29, 1.088, -0.926]],
            pilot: { z: -1.485, len: 1.4, h: 0.36, y: 0.656, w: 0.3 },
            p: 3,
          }),
          // Sırtta anten direği
          mastRod(0.588, -2.926, 1.735, -2.926, 0.016),
          tag(rod(new THREE.Vector3(0, 1.735, -2.926), new THREE.Vector3(0, 2.103, -7), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.74, span: [3.4, 5.7] }),
          ...rowFlap(WR, 0.75, 3.35, 0.74),
          ...[1, -1].flatMap((s) => [2.55, 2.85, 3.15, 3.45].map((x) => {
            const q = lePt(x, s);
            return tag(new THREE.SphereGeometry(1, sg(4), sg(3)).scale(0.024, 0.024, 0.05).translate(q.x, q.y + 0.01, q.z - 0.006), 'dark');
          })),
          ...planWing(TR, { xh: 0.68, span: [0.1, 2.15], name: 'elevator' }),
          ...hingedFin(H, [[0.338,-5.529],[0.485,-5.824],[1.441,-6.412],[1.853,-6.706],[2.088,-7]], [[-0.191,-7.221],[-0.103,-7.559],[0.118,-7.735],[1.074,-7.735],[1.735,-7.515],[2.103,-7.147]], -7.074, 0.16, 0.06),
          ...retractTailWheel(-6.015, -0.647, 0.18, 0.1, -0.324, -5.824),
        ],
        props: [{ z: 2.515, r: 1.85, blades: 4 }],
        markZ: -3.0,
        markR: 0.4,
        soot: [[0.55, -0.5, 0.7, 2.6]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [6.22, -0.18718191780206328, -0.441], kind: 'red' },
          { p: [-6.22, -0.18718191780206328, -0.441], kind: 'green' },
          { p: [0, 0.559, -7.765], kind: 'white' },
          { p: [4.0, -0.5184112353865515, 0.059], kind: 'landing' },
        ],
      };
    }
    case 'bf110': {
      // Bf 110 C, üç görünüş çiziminden (70 piksel/m). İnce uzun gövde, çok çerçeveli uzun kapak, burunda silah ağızları, uç plakası gibi iki dikey kuyruk. DB 601 motorları ince nacellerde, kanat ucu köşeli. Takım geriye nacelle içine, kuyruk tekeri sabit.
      const H = new JetHull([[4.54,0.052,0.102,-0.102,-0.008],[4.17,0.26,0.286,-0.286,-0.023],[3.17,0.43,0.5,-0.471,-0.024],[2.67,0.444,0.529,-0.531,-0.044],[2.31,0.454,0.471,-0.575,-0.094],[1.74,0.47,0.471,-0.643,-0.131],[-0.61,0.47,0.471,-0.643,-0.131],[-1.11,0.459,0.657,-0.643,-0.045],[-2.69,0.388,0.591,-0.571,-0.037],[-3.11,0.365,0.564,-0.6,-0.064],[-5.97,0.14,0.386,-0.312,0.009],[-6.94,0.05,0.243,-0.214,-0.004]] as JetSec[], 2.3, true, 2.1);
      const WR = [[0.4,-0.428,1.943,3.514,0.5],[0.5,-0.42,1.914,3.428,0.48],[2.6,-0.252,1.629,2.572,0.38],[5,-0.06,1.429,2.043,0.25],[7.5,0.14,1.171,1.428,0.13],[8.08,0.186,1.071,1.257,0.09],[8.14,0.191,0.886,0.857,0.02]] as WingRow[];
      const TR = [[0.08,0.257,-6.043,1.471,0.12],[0.15,0.257,-6.043,1.471,0.12],[2.2,0.257,-6.114,1.257,0.12],[2.3,0.257,-6.4,0.714,0.12]] as WingRow[];
      const NR = [[3.171,0.3,0.2,-0.44,-0.12],[2.6,0.44,0.24,-0.86,-0.28],[1.6,0.47,0.29,-1.08,-0.36],[0.171,0.42,0.21,-1.08,-0.38],[-0.971,0.25,0.07,-0.86,-0.38],[-1.686,0.04,-0.3,-0.56,-0.4]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, 0, 0),
        tag(pod.disc(3.171, 1, 12).translate(s * x, 0, 0), 'dark'),
        spinnerRows([[3.557,0],[3.386,0.16],[3.143,0.28]], -0.12, s * x),
        ...[],
        ...Array.from({ length: 6 }, (_, i) => tag(new THREE.CylinderGeometry(0.035, 0.05, 0.13, sg(5)).rotateZ(-s * Math.PI / 2).rotateY(s * 0.55).translate(s * (x + 0.3 + 0.02), -0.35, 2.671 - i * 0.17), 'dark')),
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(H.patch(1, 2.364, -0.614, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7, 0.006), 'dark'),
          ...jetCanopy({ screen: [[2.671,0.196,0.529,0.21,0.409],[2.314,0.3168,0.843,0.21,0.612]], glass: [[2.314,0.3168,0.843,0.21,0.612],[2.1,0.33,0.857,0.21,0.62],[0.171,0.33,0.857,0.21,0.62],[-0.614,0.28,0.643,0.21,0.502]], aft: [[-0.574,0.258,0.633,0.21,0.502],[-0.754,0.168,0.613,0.21,0.502]], frames: [2.314,1.6,1.314,0.886,0.457,0.171], posts: [[0.176,0.489,2.671],[0.291,0.813,2.314]], pilot: { z: 1.814, len: 1.35, h: 0.36, y: 0.39, w: 0.3 }, p: 3.4, rails: [1.2] }),
          ...podAt(2.34),
          ...planWing(WR, { xh: 0.78, span: [4.7,7.9] }),
          ...rowFlap(WR, 0.55, 4.65, 0.76),
          mastRod(0.857, 0.957, 1.757, 0.957, 0.014),
          tag(rod(new THREE.Vector3(0, 1.757, 0.957), new THREE.Vector3(2.32, 1.186, -6.857), 0.004, 3), 'dark'),
          tag(rod(new THREE.Vector3(0, 1.757, 0.957), new THREE.Vector3(-2.32, 1.186, -6.857), 0.004, 3), 'dark'),
          ...[0.09, -0.09, 0.2, -0.2].map((x) => tag(rod(new THREE.Vector3(x, 0.171, 4.171), new THREE.Vector3(x, 0.143, 4.714), 0.012, 5), 'dark')),
          tag(rod(new THREE.Vector3(0, 0.5, -0.614), new THREE.Vector3(0, 0.571, -1.257), 0.015, 5), 'dark'),
          ...planWing(TR, { xh: 0.55, span: [0.15,2.2], name: 'elevator' }),
          ...hingedFin(H, [[-0.286,-6.614],[0.357,-6.143],[0.929,-6.4],[1.186,-6.829]], [[-0.286,-6.943],[-0.071,-7.257],[0.286,-7.4],[0.786,-7.286],[1.186,-6.943]], -6.943, 0.1, 0.05, 2.32, 'rudder'),
          ...hingedFin(H, [[-0.286,-6.614],[0.357,-6.143],[0.929,-6.4],[1.186,-6.829]], [[-0.286,-6.943],[-0.071,-7.257],[0.286,-7.4],[0.786,-7.286],[1.186,-6.943]], -6.943, 0.1, 0.05, -2.32, 'rudderR'),
          ...fixedTailWheel(-6.757, -0.643, 0.19, 0.1, -0.157, -6.571),
          
        ],
        props: [{ z: 3.343, x: 2.34, y: -0.12, r: 1.6, blades: 3 }, { z: 3.343, x: -2.34, y: -0.12, r: 1.6, blades: 3 }],
        markZ: -2.2,
        markR: 0.42,
        soot: [[2.8,-0.35,2.5,3]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [8.16, 0.191, 0.458], kind: 'red' },
          { p: [-8.16, 0.191, 0.458], kind: 'green' },
          { p: [0,0.286,-7], kind: 'white' },
        ],
      };
    }
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
    case 'il2': {
      // Il-2 Şturmovik, üç görünüş çiziminden (79 piksel/m). Zırhlı, sivri burun; üstünde hava girişi ve yanlarda altı egzoz. Tek kişilik kapak, gerisinde kaplamalı sırt. Geniş, sivrilen kanat, altında takım kaportaları; takım geriye toplanır, tekerleğin yarısı dışarıda kalır.
      const H = new JetHull([[2.54,0.38,0.291,-0.343,-0.051],[1.81,0.519,0.466,-0.657,-0.141],[1.11,0.568,0.633,-0.736,-0.106],[0.67,0.599,0.664,-0.785,-0.119],[-0.34,0.595,0.734,-0.694,-0.037],[-1.86,0.539,0.688,-0.557,0.016],[-2.88,0.506,0.633,-0.546,-0.004],[-4.14,0.506,0.582,-0.532,-0.02],[-5.85,0.338,0.544,-0.361,0.055],[-7.31,0.126,0.353,-0.097,0.11],[-8.45,0.013,0.101,0.076,0.088]] as JetSec[], 2.4, true, 2.2);
      const WR = [[0.42,-0.56,0.858,4.114,0.56],[0.55,-0.55,0.82,3.949,0.54],[1,-0.516,0.795,3.506,0.5],[2.1,-0.434,0.732,3.165,0.42],[4,-0.291,0.263,2.544,0.27],[5.5,-0.179,-0.154,1.962,0.16],[6.4,-0.111,-0.42,1.443,0.1],[7,-0.066,-0.724,0.76,0.05],[7.3,-0.044,-1.104,0.063,0.012]] as WingRow[];
      const TR = [[0.1,0.165,-5.471,2.848,0.148],[0.4,0.165,-5.559,2.697,0.14],[1,0.165,-5.977,2.19,0.126],[1.8,0.165,-6.547,1.392,0.106],[2.3,0.165,-6.927,0.632,0.094],[2.47,0.165,-7.243,0.063,0.09]] as WingRow[];
      return {
        solids: [
          H.geo(14, [true, true]),
          
          spinnerRows([[3.2,0],[3,0.14],[2.75,0.24],[2.56,0.29]], 0),
          ...stubRow(H, 6, 1.997, 0.2, 0.165, 0.04),
          tag(H.patch(1, -0.547, -1.99, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.344,0.208,0.734,0.36,0.587],[-0.597,0.33599999999999997,1.089,0.36,0.815]], glass: [[-0.597,0.33599999999999997,1.089,0.36,0.815],[-0.787,0.35,1.089,0.36,0.815],[-1.42,0.38,1.089,0.36,0.815],[-1.99,0.32,1.025,0.36,0.78]], aft: [[-1.95,0.294,1.015,0.36,0.78],[-2.813,0.24,0.759,0.36,0.633],[-4.142,0.04,0.582,0.36,0.536]], frames: [-0.597,-0.787,-1.382,-1.99], posts: [[0.187,0.694,-0.344],[0.309,1.059,-0.597]], pilot: { z: -1.104, len: 1.35, h: 0.36, y: 0.54, w: 0.3 }, p: 3.4, rails: [1.2] }),
          mastRod(0.987, -1.927, 1.392, -1.927, 0.012),
          tag(rod(new THREE.Vector3(0, 1.392, -1.927), new THREE.Vector3(0, 1.899, -7.053), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.74, span: [3.8,6.7] }),
          ...rowFlap(WR, 0.6, 3.75, 0.76),
          
          ...[1, -1].flatMap((s) => [[2.67,0.85],[0.82,0.55]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          underPaint(body([[-1.059, 0.05], [-0.409, 0.27], [0.591, 0.3], [0.991, 0.1]], 10, { x: 1.75, y: -0.82, sy: 0.85, smooth: true })),
          underPaint(body([[-1.059, 0.05], [-0.409, 0.27], [0.591, 0.3], [0.991, 0.1]], 10, { x: -1.75, y: -0.82, sy: 0.85, smooth: true })),
          // Burun üstü hava girişi
          tag(new THREE.BoxGeometry(0.24, 0.07, 0.03).translate(0, 0.228, 2.466), 'dark'),
          
          ...planWing(TR, { xh: 0.6, span: [0.4,2.2], name: 'elevator' }),
          ...hingedFin(H, [[0.354,-5.408],[0.544,-5.851],[1.873,-6.927],[2.025,-7.243]], [[-0.025,-7.686],[0.076,-8.446],[0.228,-8.319],[1.494,-7.939],[1.937,-7.686],[2.025,-7.306]], -7.243, 0.14, 0.05),
          ...fixedTailWheel(-7.977, -0.304, 0.21, 0.1, 0, -7.876),
        ],
        props: [{ z: 2.668, y: 0, r: 1.8, blades: 3 }],
        markZ: -3.4,
        markR: 0.38,
        soot: [[0.42,0.165,2.124,2.8]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [7.32, -0.044, -1.136], kind: 'red' },
          { p: [-7.32, -0.044, -1.136], kind: 'green' },
          { p: [0, 0.076, -8.466], kind: 'white' },
        ],
      };
    }
    case 'ju87b': {
      // Ju 87 B Stuka, üç görünüş çiziminden (81 piksel/m). Ters martı kanat, sabit takım ve teker tulumları, çene radyatörü, uzun çerçeveli kapak ve arkada nişancının tüfeği. Yatay kuyruk altından destekli. Kanat altında açılan pike frenleri.
      const H = new JetHull([[2.32,0.34,0.309,-0.31,-0.025],[1.95,0.5,0.393,-0.494,-0.086],[1.4,0.5,0.518,-0.597,-0.084],[0.96,0.5,0.577,-0.679,-0.101],[0.22,0.46,0.68,-0.765,-0.1],[-0.21,0.447,0.741,-0.781,-0.081],[-0.77,0.431,0.736,-0.802,-0.094],[-2.86,0.37,0.716,-0.642,-0.017],[-4.22,0.28,0.527,-0.432,0.009],[-5.46,0.193,0.494,-0.308,0.061],[-6.69,0.108,0.346,-0.185,0.059],[-7.99,0.02,0.123,0.062,0.09]] as JetSec[], 2.6, true, 2.3);
      const WR = [[0.6,-0.38,0.222,3.358,0.54],[1.5,-0.6,0.198,3.025,0.5],[3,-0.35,0.074,2.691,0.36],[5,-0.017,-0.049,1.951,0.22],[6.5,0.233,-0.173,1.148,0.13],[6.85,0.292,-0.272,0.74,0.08],[6.9,0.3,-0.457,0.494,0.02]] as WingRow[];
      const TR = [[0.08,0.593,-6.383,1.024,0.13],[0.15,0.593,-6.383,1.024,0.13],[2.3,0.593,-6.383,1.024,0.13],[2.42,0.593,-6.568,0.679,0.13],[2.45,0.593,-6.753,0.247,0.13]] as WingRow[];
      return {
        solids: [
          H.geo(14, [true, true]),
          
          spinnerRows([[3,0],[2.85,0.18],[2.6,0.33],[2.35,0.38]], 0),
          ...stubRow(H, 6, 2.136, 0.21, -0.16, 0.045),
          tag(H.patch(1, -0.469, -2.864, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.21,0.185,0.802,0.43,0.656],[-0.519,0.2976,1.086,0.43,0.845]], glass: [[-0.519,0.2976,1.086,0.43,0.845],[-0.765,0.31,1.086,0.43,0.845],[-2,0.33,1.086,0.43,0.845],[-2.617,0.32,1.086,0.43,0.845],[-2.864,0.18,0.704,0.43,0.635]], aft: [[-2.824,0.166,0.694,0.43,0.635],[-3.004,0.108,0.674,0.43,0.635]], frames: [-0.519,-1.074,-1.383,-1.691,-2.062,-2.617], posts: [[0.167,0.762,-0.21],[0.274,1.056,-0.519]], pilot: { z: -1.074, len: 1.35, h: 0.36, y: 0.61, w: 0.3 }, p: 3.2, rails: [1.2,0.5] }),
          mastRod(1.049, -1.84, 1.914, -1.84, 0.018),
          tag(rod(new THREE.Vector3(0, 1.914, -1.84), new THREE.Vector3(0, 1.951, -7.37), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.8, span: [4,6.5] }),
          ...rowFlap(WR, 0.6, 3.95, 0.78),
          
          ...[1, -1].flatMap((s) => [[2.45,0.1]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          // Çene radyatörü
          underPaint(new JetHull([[1.951, 0.36, -0.4, -0.72, -0.56], [1.765, 0.42, -0.4, -1.02, -0.68], [0.988, 0.42, -0.5, -1.05, -0.72], [0.654, 0.3, -0.6, -0.72, -0.66]], 3.2, false).geo(10)),
          tag(new JetHull([[1.951, 0.32, -0.45, -0.68, -0.56], [1.642, 0.3, -0.46, -0.66, -0.56]], 2.6, false).geo(8), 'dark'),
          tag(new JetHull([[1.951, 0.32, -0.45, -0.68, -0.56], [1.642, 0.3, -0.46, -0.66, -0.56]], 2.6, false).disc(1.642, 1, 8), 'dark'),
          // Sabit takım: üst kaporta, tulum, tekerlek; kuyruk destekleri; nişancı tüfeği
          ...[1, -1].flatMap((s) => [
            new JetHull([[0.654, 0.03, -1.92, -1.99, -1.96], [0.407, 0.16, -1.6, -2.1, -1.85], [-0.148, 0.2, -1.45, -2.1, -1.78], [-0.765, 0.12, -1.7, -1.95, -1.82], [-1.012, 0.02, -1.8, -1.86, -1.83]], 2.3, false).geo(10).translate(s * 1.46, 0, 0),
            legFairing(s * 1.46, [[0.222, -0.72], [-0.519, -0.72], [-0.765, -1.8], [0.407, -1.8]]).translate(-s * 1.46, 0, 0).scale(4, 1, 1).translate(s * 1.46, 0, 0),
            ...wheelParts(0.4, 0.18, s * 1.46, -1.91, 0.136).map((g) => tag(g, 'dark')),
            tag(rod(new THREE.Vector3(s * 0.08, -0.123, -6.321), new THREE.Vector3(s * 1.0, 0.568, -6.691), 0.016, 4), 'dark'),
            ...joint(s > 0 ? 'airbrakeL' : 'airbrakeR', [s * 3.4 * 1, -0.453, 0.2], [tag(new THREE.BoxGeometry(1.5, 0.02, 0.22).translate(s * 3.4 * 1, -0.453, 0.09), 'dark')], false, [s, 0, 0]),
          ]),
          tag(rod(new THREE.Vector3(0, 0.704, -2.864), new THREE.Vector3(0, 0.864, -3.481), 0.016, 5), 'dark'),
          ...planWing(TR, { xh: 0.6, span: [0.15,2.3], name: 'elevator' }),
          ...hingedFin(H, [[0.247,-5.704],[0.617,-5.889],[0.716,-6.136],[1.914,-6.753],[1.951,-7.309]], [[-0.247,-6.691],[0.062,-7.988],[0.123,-8.025],[1.605,-7.988],[1.914,-7.864],[1.938,-7.432]], -7.37, 0.16, 0.08),
          ...fixedTailWheel(-7.185, -0.531, 0.14, 0.08, -0.247, -7.037),
        ],
        props: [{ z: 2.444, y: 0, r: 1.7, blades: 3 }],
        markZ: -3,
        markR: 0.42,
        soot: [[0.5,-0.16,1.6,2.6]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [6.92, 0.3, -0.704], kind: 'red' },
          { p: [-6.92, 0.3, -0.704], kind: 'green' },
          { p: [0, 0.123, -8.045], kind: 'white' },
        ],
      };
    }
    case 'sbd': {
      // SBD-3 Dauntless, üç görünüş çiziminden (84,5 piksel/m). Yıldız motor, uzun çerçeveli kapak ve arkada çift tüfek. Geniş kanat, firar kenarında delikli pike flapları (delikler alt yüzde koyu), takım içe. Hem iniş flabı hem pike freni açılır.
      const H = new JetHull([[2.33,0.601,0.534,-0.534,-0.043],[1.54,0.72,0.734,-0.769,-0.078],[0.89,0.6,0.769,-0.791,-0.074],[-0.18,0.578,0.748,-0.828,-0.103],[-2.07,0.54,0.71,-0.661,-0.031],[-2.48,0.488,0.792,-0.593,0.044],[-3.25,0.39,0.71,-0.439,0.09],[-3.96,0.301,0.71,-0.297,0.166],[-4.56,0.25,0.711,-0.236,0.199],[-5.27,0.184,0.887,-0.165,0.319],[-6.09,0.081,0.705,-0.083,0.279],[-6.92,0.01,0.415,0,0.191]] as JetSec[], 2.35, true, 2.1);
      const WR = [[0.5,-0.62,0.912,3.574,0.58],[0.92,-0.62,0.829,3.053,0.55],[1.7,-0.62,0.711,2.923,0.48],[3.5,-0.314,0.509,2.343,0.32],[5.3,0.01,0.296,1.716,0.18],[6,0.136,0.119,1.302,0.1],[6.2,0.172,-0.118,0.828,0.06],[6.33,0.195,-0.591,0.118,0.012]] as WingRow[];
      const TR = [[0.1,0.355,-5.029,1.68,0.128],[0.3,0.355,-5.053,1.633,0.124],[1.2,0.355,-5.289,1.302,0.107],[2.2,0.355,-5.502,1.006,0.088],[2.55,0.355,-5.68,0.745,0.081],[2.7,0.355,-5.976,0.059,0.078]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(2.33, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[2.33, 0.551, 0.484, -0.484, -0.043], [2.23, 0.541, 0.474, -0.474, -0.043]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.331, 0.331, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, 0, 2.23),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.417;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, 0 + Math.sin(a) * r, 2.24), 'dark');
          }),
          spinnerRows([[2.9,0],[2.72,0.14],[2.5,0.26],[2.36,0.28]], 0),
          ...stubRow(H, 3, 1.835, 0.18, -0.42, 0.05),
          tag(H.patch(1, 0.228, -2.485, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[0.829,0.179,0.769,0.51,0.679],[0.178,0.288,1.183,0.51,0.934]], glass: [[0.178,0.288,1.183,0.51,0.934],[0.036,0.3,1.183,0.51,0.934],[-1.42,0.32,1.16,0.51,0.921],[-2.07,0.28,1.065,0.51,0.869],[-2.485,0.16,0.793,0.51,0.72]], aft: [[-2.445,0.147,0.783,0.51,0.72],[-2.625,0.096,0.763,0.51,0.72]], frames: [0.178,-0.65,-1.42,-1.715], posts: [[0.161,0.729,0.829],[0.265,1.153,0.178]], pilot: { z: -0.414, len: 1.35, h: 0.36, y: 0.69, w: 0.3 }, p: 3.2, rails: [1.2,0.4] }),
          mastRod(0.828, 0.971, 1.811, 0.971, 0.014),
          tag(rod(new THREE.Vector3(0, 1.811, 0.971), new THREE.Vector3(0, 2.308, -6.272), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.78, span: [4.2,5.9] }),
          ...rowFlap(WR, 0.55, 1.8, 0.74),
          
          
          ...rowBrake(WR, 1.85, 4.15, 0.74),
          tag(rod(new THREE.Vector3(0.05, 0.911, -2.425), new THREE.Vector3(0.05, 1.03, -3.076), 0.014, 5), 'dark'),
          tag(rod(new THREE.Vector3(-0.05, 0.911, -2.425), new THREE.Vector3(-0.05, 1.03, -3.076), 0.014, 5), 'dark'),
          ...planWing(TR, { xh: 0.58, span: [0.3,2.45], name: 'elevator' }),
          ...hingedFin(H, [[0.355,-4.733],[0.769,-4.911],[0.888,-5.266],[2.308,-6.272],[2.308,-6.508]], [[-0.355,-6.331],[-0.059,-6.922],[0.414,-7.064],[1.124,-6.922],[2.213,-6.686]], -6.295, 0.14, 0.05),
          ...fixedTailWheel(-6.414, -0.414, 0.1, 0.07, -0.118, -6.272),
        ],
        props: [{ z: 2.486, y: 0, r: 1.64, blades: 3 }],
        markZ: -3.1,
        markR: 0.38,
        soot: [[0.72,-0.42,1.25,2.4]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [6.35, 0.195, -0.65], kind: 'red' },
          { p: [-6.35, 0.195, -0.65], kind: 'green' },
          { p: [0, 0.414, -7.084], kind: 'white' },
        ],
      };
    }
    case 'he111': {
      // He 111 H, üç görünüş çiziminden (49,6 piksel/m). Bütünüyle camlı, asimetrik burun; sırtta açık nişancı yeri, karında gondol. Geniş eliptik kanat ve kuyruk, Jumo motorları kanat önünde. Takım geriye toplanır, kuyruk tekeri sabit.
      const H = new JetHull([[6.53,0.8,0.907,-0.927,-0.083],[5.32,0.846,1.149,-1.065,-0.046],[4.11,0.838,1.182,-1.21,-0.109],[3.1,0.831,1.21,-1.139,-0.059],[2.09,0.824,1.21,-1.069,-0.021],[-1.13,0.594,1.048,-0.706,0.101],[-5.17,0.34,0.664,-0.362,0.11],[-8.15,0.04,0.141,0.04,0.086]] as JetSec[], 2.35, true, 2.15);
      const WR = [[0.75,-0.1,5.822,5.746,0.9],[1,-0.1,5.822,4.496,0.82],[3.2,-0.1,5.822,4.839,0.72],[5.4,0.087,5.298,4.154,0.55],[10.3,0.504,4.108,2.661,0.25],[11,0.563,3.503,1.713,0.12],[11.3,0.589,2.898,0.242,0.02]] as WingRow[];
      const TR = [[0.1,0.101,-5.267,2.823,0.148],[1,0.101,-5.408,2.682,0.135],[2,0.101,-5.731,2.217,0.119],[3,0.101,-6.174,1.512,0.104],[3.7,0.101,-6.577,0.605,0.094],[3.93,0.101,-6.739,0.141,0.09]] as WingRow[];
      const NR = [[7.374,0.42,0.3,-0.52,-0.1],[6.83,0.55,0.42,-0.66,-0.1],[5.721,0.58,0.35,-0.62,-0.12],[4.41,0.38,0.22,-0.45,-0.12],[3.342,0.04,0,-0.25,-0.12]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number, dy: number, dz: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, dy, dz),
        tag(pod.disc(7.374, 1, 12).translate(s * x, dy, dz + 0), 'dark'),
        spinnerRows([[7.898,0],[7.737,0.18],[7.334,0.33]], -0.1, s * x).translate(0, dy, dz),
        ...[],
        ...Array.from({ length: 6 }, (_, i) => tag(new THREE.CylinderGeometry(0.035, 0.05, 0.13, sg(5)).rotateZ(-s * Math.PI / 2).rotateY(s * 0.55).translate(s * (x + 0.5 + 0.02), 0.12 + dy, 6.729 + dz - i * 0.17), 'dark')),
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          
          ...podAt(2.58, 0, 0),
          ...planWing(WR, { xh: 0.78, span: [6.5,10.3] }),
          ...rowFlap(WR, 0.8, 6.4, 0.76),
          ...noseGlass([[8.04,0.03,0.081,-0.081,0],[7.737,0.45,0.403,-0.444,0],[7.233,0.7,0.706,-0.766,0],[6.527,0.8,0.907,-0.927,0]] as JetSec[], [8.04, 7.737, 7.233, 6.527], [7.495, 6.931, 6.527], { z: 6.931, len: 1.3, h: 0.4, y: 0.202, w: 0.3 }),
          tag(H.disc(6.53, 1, 14), 'dark'),
          // Sırt nişancısı, gondol ve yan pencereler
          ...turretDome(1.31, 2.596, 0.42, 0.55, [0, 1.573, 1.386], 0, 1.5),
          underPaint(new JetHull([[2.092,0.02,-1.008,-1.069,-1.028],[1.79,0.32,-0.968,-1.31,-1.089],[0.277,0.3,-0.907,-1.25,-1.008],[-0.731,0.05,-0.806,-0.887,-0.847]] as JetSec[], 2.6, false).geo(10)),
          tag(rod(new THREE.Vector3(0, -1.149, 0.076), new THREE.Vector3(0, -1.21, -0.831), 0.016, 5), 'dark'),
          ...[1, -1].map((s) => tag(H.patch(s, 1.185, 0.479, 0.1, 0.5, 0.006), 'dark')),
          mastRod(1.21, 1.044, 2.016, 1.044, 0.016),
          tag(rod(new THREE.Vector3(0, 2.016, 1.044), new THREE.Vector3(0, 2.964, -6.88), 0.005, 3), 'dark'),
          ...planWing(TR, { xh: 0.6, span: [0.1,3.5], name: 'elevator' }),
          ...hingedFin(H, [[0.504,-5.065],[0.706,-5.408],[1.915,-5.771],[2.722,-6.376],[2.964,-6.88]], [[0.403,-6.94],[0.706,-7.888],[1.815,-7.787],[2.621,-7.384],[2.964,-6.94]], -6.92, 0.18, 0.06),
          ...fixedTailWheel(-6.376, -0.645, 0.28, 0.14, -0.302, -6.073),
          
        ],
        props: [{ z: 7.535, x: 2.58, y: -0.1, r: 1.75, blades: 3 }, { z: 7.535, x: -2.58, y: -0.1, r: 1.75, blades: 3 }],
        markZ: -3.7,
        markR: 0.5,
        soot: [[3,0.1,3.5,3.2]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [11.32, 0.589, 2.777], kind: 'red' },
          { p: [-11.32, 0.589, 2.777], kind: 'green' },
          { p: [0,0.806,-7.888], kind: 'white' },
        ],
      };
    }
    case 'ju88': {
      // Ju 88 A-4, üç görünüş çiziminden (55,2 piksel/m). Böcek gözü camlı burun ve kokpit tek parça, altında geriye ateş eden Bola. Yuvarlak halka radyatörlü Jumo motorları, uzun düz kanat, kanat altında pike frenleri. Takım geriye toplanır, kuyruk tekeri de.
      const H = new JetHull([[6.15,0.62,0.453,-0.815,-0.232],[5.61,0.641,0.502,-0.995,-0.306],[4.16,0.67,0.634,-0.996,-0.246],[0.9,0.67,0.634,-0.825,-0.154],[-4,0.3,0.507,-0.542,-0.06],[-5.45,0.139,0.474,-0.271,0.071],[-6.35,0.04,0.453,-0.181,0.111]] as JetSec[], 2.3, true, 2.1);
      const WR = [[0.6,-0.06,4.791,3.678,0.72],[3.26,0.206,4.791,3.569,0.6],[5.5,0.43,4.338,2.899,0.4],[9.45,0.825,3.396,1.323,0.12],[9.9,0.87,3.07,0.634,0.06],[10.04,0.884,2.852,0.109,0.015]] as WingRow[];
      const TR = [[0.1,0.217,-3.724,1.866,0.129],[0.6,0.217,-3.778,1.812,0.122],[3,0.217,-4.213,1.268,0.091],[3.8,0.217,-4.449,0.851,0.08],[3.95,0.217,-4.72,0.363,0.078]] as WingRow[];
      const NR = [[6.693,0.55,0.097,-1.003,-0.453],[6.24,0.65,0.227,-1.253,-0.453],[4.881,0.55,0.147,-1.233,-0.453],[3.613,0.32,-0.003,-0.953,-0.453],[2.617,0.04,-0.153,-0.403,-0.453]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number, dy: number, dz: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, dy, dz),
        tag(pod.disc(6.693, 1, 12).translate(s * x, dy, dz + -0.08), 'dark'),
        spinnerRows([[7.2,0],[7.055,0.2],[6.693,0.38]], -0.453, s * x).translate(0, dy, dz),
        ...[new THREE.TorusGeometry(0.44, 0.035, sg(4), sg(10)).translate(s * x, -0.453 + dy, 6.673 + dz)],
        ...[],
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          
          ...podAt(2.78, 0, 0),
          ...planWing(WR, { xh: 0.76, span: [5.6,9.4] }),
          ...rowFlap(WR, 0.8, 5.5, 0.74),
          ...noseGlass([[7.164,0.03,0.091,-0.272,-0.091],[6.783,0.4,0.453,-0.634,-0.091],[6.149,0.62,0.906,-0.815,0],[5.606,0.65,0.996,-0.453,0.362],[4.247,0.62,0.906,0,0.453]] as JetSec[], [7.164, 6.783, 6.149, 5.606, 4.247], [6.475, 5.878, 5.062, 4.247], { z: 5.515, len: 1.3, h: 0.4, y: 0.634, w: 0.3 }),
          // Karında Bola ve iki tüfek
          underPaint(new JetHull([[5.968, 0.03, -0.833, -0.87, -0.851], [5.696, 0.32, -0.87, -1.232, -0.996], [4.519, 0.32, -0.906, -1.304, -1.051], [3.885, 0.25, -0.942, -1.196, -1.014]], 2.8, false).geo(10)),
          ...[0.08, -0.08].flatMap((x) => [tag(rod(new THREE.Vector3(x, -1.123, 3.975), new THREE.Vector3(x, -1.214, 3.251), 0.014, 5), 'dark'), tag(rod(new THREE.Vector3(x, 0.87, 4.247), new THREE.Vector3(x, 0.906, 3.649), 0.014, 5), 'dark')]),
          ...[1, -1].flatMap((s) => joint(s > 0 ? 'airbrakeL' : 'airbrakeR', [s * 7.2, 0.5, 3.935], [tag(new THREE.BoxGeometry(2.0, 0.03, 0.24).translate(s * 7.2, 0.5, 3.815), 'dark')], false, [s, 0, 0])),
          mastRod(0.996, 5.461, 2.083, 5.461, 0.016),
          tag(rod(new THREE.Vector3(0, 2.083, 5.461), new THREE.Vector3(0, 2.264, -5.807), 0.004, 3), 'dark'),
          ...planWing(TR, { xh: 0.6, span: [0.1,3.6], name: 'elevator' }),
          ...hingedFin(H, [[0.453,-4.358],[0.543,-4.72],[2.21,-5.717],[2.536,-6.26]], [[-0.181,-6.387],[0.326,-7.166],[1.63,-6.985],[2.391,-6.622],[2.536,-6.387]], -6.351, 0.16, 0.06),
          ...retractTailWheel(-4.72, -0.906, 0.25, 0.13, -0.362, -4.449),
          
        ],
        props: [{ z: 6.512, x: 2.78, y: -0.453, r: 1.8, blades: 3 }, { z: 6.512, x: -2.78, y: -0.453, r: 1.8, blades: 3 }],
        markZ: -2.9,
        markR: 0.48,
        soot: [[3.2,-0.2,3.5,3]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [10.06, 0.884, 2.797], kind: 'red' },
          { p: [-10.06, 0.884, 2.797], kind: 'green' },
          { p: [0,1.087,-7.075], kind: 'white' },
        ],
      };
    }
    case 'b25': {
      // B-25J Mitchell, üç görünüş çiziminden (53,6 piksel/m). Camlı nişancı burnu, sırtta çift tüfekli taret, gövdede yan nişancı yerleri, kuyrukta nişancı. Kırık kanat: iç kısım yukarı, dış kısım düz. Wright motorları derin nacellerde, iki dikey kuyruk. Burun tekerlekli takım.
      const H = new JetHull([[6.29,0.62,0.784,-0.877,-0.113],[5.54,0.7,0.84,-0.939,-0.121],[4.42,0.7,1.119,-0.973,-0.01],[0.5,0.7,1.119,-0.986,-0.018],[-0.43,0.654,1.064,-0.989,-0.045],[-4.16,0.441,0.845,-0.653,0.036],[-5.84,0.326,0.746,-0.401,0.127],[-8.12,0.04,0.56,0.093,0.308]] as JetSec[], 2.6, true, 2.2);
      const WR = [[0.6,-0.16,3.116,3.713,0.64],[3.33,0.11,2.985,3.134,0.55],[6,0.083,2.743,2.463,0.35],[9,0.053,2.519,1.772,0.2],[9.9,0.044,2.276,1.343,0.1],[10.3,0.04,1.773,0.131,0.015]] as WingRow[];
      const TR = [[0.1,0.653,-5.503,2.333,0.15],[0.6,0.653,-5.559,2.277,0.15],[2.6,0.653,-5.97,1.81,0.15],[3,0.653,-6.119,1.343,0.15],[3.33,0.653,-6.25,0.839,0.15]] as WingRow[];
      const NR = [[4.291,0.62,0.56,-0.746,-0.093],[3.918,0.72,0.69,-0.914,-0.093],[2.799,0.72,0.69,-0.914,-0.093],[1.12,0.55,0.56,-0.802,-0.131],[-1.25,0.04,-0.093,-0.466,-0.28]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number, dy: number, dz: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, dy, dz),
        tag(pod.disc(4.291, 1, 12).translate(s * x, dy, dz + -0.08), 'dark'),
        spinnerRows([[4.758,0],[4.571,0.12],[4.291,0.18]], -0.093, s * x).translate(0, dy, dz),
        ...[new THREE.TorusGeometry(0.496, 0.035, sg(4), sg(10)).translate(s * x, -0.093 + dy, 4.271 + dz)],
        ...[],
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(H.patch(1, 5.591, 4.385, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7, 0.006), 'dark'),
          ...jetCanopy({ screen: [[5.914,0.25,0.84,0.5,0.71],[5.541,0.40319999999999995,1.157,0.5,0.915]], glass: [[5.541,0.40319999999999995,1.157,0.5,0.915],[5.261,0.42,1.175,0.5,0.925],[4.515,0.42,1.175,0.5,0.925],[4.385,0.3,1.082,0.5,0.874]], aft: [[4.425,0.276,1.072,0.5,0.874],[4.245,0.18,1.052,0.5,0.874]], frames: [5.541], posts: [[0.225,0.8,5.914],[0.371,1.127,5.541]], pilot: { z: 5.075, len: 1.35, h: 0.36, y: 0.68, w: 0.3 }, p: 3, rails: [1.15] }),
          ...podAt(2.96, 0, 0),
          ...planWing(WR, { xh: 0.78, span: [6.3,9.6] }),
          ...rowFlap(WR, 0.8, 6.2, 0.74),
          ...noseGlass([[8.023,0.03,0.037,-0.187,-0.056],[7.78,0.3,0.373,-0.56,-0.056],[7.22,0.5,0.653,-0.746,-0.056],[6.288,0.62,0.784,-0.877,-0.056]] as JetSec[], [8.023, 7.78, 7.22, 6.288], [7.5, 6.885, 6.288]),
          tag(H.disc(6.29, 1, 14), 'dark'),
          tag(rod(new THREE.Vector3(0, -0.093, 7.967), new THREE.Vector3(0, -0.187, 8.564), 0.016, 5), 'dark'),
          ...turretDome(1.213, 3.116, 0.45, 0.8, [0, 1.213, 2.034], 0.08),
          ...[1, -1].flatMap((s) => [tag(H.patch(s, -1.455, -2.294, 0.2, 0.75, 0.01), 'dark'), tag(rod(new THREE.Vector3(s * 0.7, 0.075, -2.108), new THREE.Vector3(s * 0.72, 0.075, -2.761), 0.014, 5), 'dark')]),
          // Kuyruk nişancısı
          ...[0.07, -0.07].map((x) => tag(rod(new THREE.Vector3(x, 0.429, -7.985), new THREE.Vector3(x, 0.429, -8.675), 0.016, 5), 'dark')),
          ...planWing(TR, { xh: 0.62, span: [0.1,3], name: 'elevator' }),
          ...hingedFin(H, [[0.131,-5.839],[1.772,-6.119],[2.369,-6.306],[2.444,-6.679]], [[-0.056,-6.772],[0.093,-7.798],[1.399,-7.705],[2.108,-7.612],[2.444,-6.772]], -6.772, 0.16, 0.06, 3.33, 'rudder'),
          ...hingedFin(H, [[0.131,-5.839],[1.772,-6.119],[2.369,-6.306],[2.444,-6.679]], [[-0.056,-6.772],[0.093,-7.798],[1.399,-7.705],[2.108,-7.612],[2.444,-6.772]], -6.772, 0.16, 0.06, -3.33, 'rudderR'),
          
          ...noseWheel(-0.9, 6.288, -1.884, 6.437, 0.32, 0.14),
        ],
        props: [{ z: 4.515, x: 2.96, y: -0.093, r: 1.92, blades: 3 }, { z: 4.515, x: -2.96, y: -0.093, r: 1.92, blades: 3 }],
        markZ: -3.8,
        markR: 0.42,
        soot: [[3.5,0,3.5,3]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [10.32, 0.04, 1.708], kind: 'red' },
          { p: [-10.32, 0.04, 1.708], kind: 'green' },
          { p: [0, 0.55, -7.742], kind: 'white' },
        ],
      };
    }
    case 'b17': {
      // B-17G, üç görünüş çiziminden (38,1 piksel/m). Camlı burun, altında çift tüfekli çene tareti, sırtta ve karında taretler, gövdede bel nişancıları, kuyrukta nişancı. Sırttan yükselen uzun dikey kuyruk, dört Wright motoru. Takım geriye, tekerlek yarı dışarıda; kuyruk tekeri toplanır.
      const H = new JetHull([[10.25,0.85,0.787,-1.234,-0.304],[8.73,0.982,0.944,-1.391,-0.317],[7.55,1.058,1.311,-1.391,-0.148],[3.74,1.139,1.312,-1.391,-0.148],[0.85,1.011,0.866,-1.391,-0.353],[-4.92,0.59,0.394,-0.971,-0.343],[-11.35,0.1,0.184,-0.262,-0.057]] as JetSec[], 2.15, true, 2.1);
      const WR = [[1,-0.5,6.681,5.775,1.05],[3.5,-0.302,6.366,5.25,0.9],[7,-0.026,5.709,4.12,0.62],[11,0.29,5.106,2.992,0.38],[14.4,0.559,4.633,2.204,0.2],[15.4,0.638,4.135,1.181,0.1],[15.81,0.67,3.741,0.263,0.02]] as WingRow[];
      const TR = [[0.3,0.21,-5.445,3.203,0.166],[2,0.21,-5.839,2.704,0.145],[4,0.21,-6.285,2.048,0.119],[5.2,0.21,-6.627,1.496,0.104],[6,0.21,-7.414,0.262,0.094]] as WingRow[];
      const NR = [[8.334,0.6,0.025,-1.075,-0.525],[7.94,0.72,0.175,-1.225,-0.525],[6.366,0.72,0.175,-1.225,-0.525],[5.053,0.5,-0.025,-1.025,-0.525],[4.082,0.05,-0.425,-0.625,-0.525]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number, dy: number, dz: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, dy, dz),
        tag(pod.disc(8.334, 1, 12).translate(s * x, dy, dz + -0.08), 'dark'),
        spinnerRows([[8.938,0],[8.675,0.12],[8.334,0.2]], -0.525, s * x).translate(0, dy, dz),
        ...[new THREE.TorusGeometry(0.44, 0.035, sg(4), sg(10)).translate(s * x, -0.525 + dy, 8.314 + dz)],
        ...[],
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(H.patch(1, 7.728, 6.628, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7, 0.006), 'dark'),
          ...jetCanopy({ screen: [[8.465,0.298,0.971,0.93,0.99],[7.678,0.48,1.365,0.93,1.223]], glass: [[7.678,0.48,1.365,0.93,1.223],[7.284,0.5,1.391,0.93,1.238],[6.628,0.52,1.391,0.93,1.238]], aft: [[6.668,0.478,1.381,0.93,1.238],[6.488,0.312,1.361,0.93,1.238]], frames: [7.678,6.891], posts: [[0.268,0.931,8.465],[0.442,1.335,7.678]], pilot: { z: 7.206, len: 1.35, h: 0.36, y: 1.11, w: 0.3 }, p: 3 }),
          ...podAt(2.75, 0, 0),
          ...podAt(6.35, 0.28, -0.45),
          ...planWing(WR, { xh: 0.76, span: [9.2,14.6] }),
          ...rowFlap(WR, 1.2, 9, 0.76),
          ...noseGlass([[11.248,0.03,0.131,-0.262,-0.079],[10.959,0.4,0.394,-0.604,-0.079],[10.25,0.85,0.787,-1.234,-0.184]] as JetSec[], [11.248, 10.959, 10.25], [10.696, 10.25]),
          tag(H.disc(10.25, 1, 14), 'dark'),
          // Çene, sırt, küre taret, telsizci, bel ve kuyruk
          ...turretDome(-1.181, 10.434, 0.42, 0.8, [0, -1.391, 11.09], 0.08),
          ...turretDome(1.575, 6.156, 0.55, 0.7, [0, 1.549, 5.001], 0.09),
          ...turretDome(-1.654, 0.198, 0.58, 1, [0, -1.759, -0.852], 0.09),
          tag(rod(new THREE.Vector3(0, 1.234, 1.51), new THREE.Vector3(0, 1.575, 1.169), 0.016, 5), 'dark'),
          ...[1, -1].flatMap((s) => [tag(H.patch(s, -1.771, -2.952, -0.1, 0.5, 0.012), 'dark'), tag(rod(new THREE.Vector3(s * 0.72, -0.184, -2.427), new THREE.Vector3(s * 1.05, -0.184, -2.69), 0.016, 5), 'dark')]),
          ...[0.07, -0.07].map((x) => tag(rod(new THREE.Vector3(x, 0, -11.22), new THREE.Vector3(x, 0, -11.955), 0.016, 5), 'dark')),
          tag(new THREE.SphereGeometry(0.38, sg(8), sg(5)).scale(1, 0.9, 1.5).translate(0, 0.262, -10.039), 'glass'),
          ...planWing(TR, { xh: 0.6, span: [0.3,5.2], name: 'elevator' }),
          ...hingedFin(H, [[0.709,0.329],[1.312,-4.396],[2.1,-5.708],[3.543,-6.495],[4.462,-7.151],[4.541,-7.939]], [[0.394,-8.464],[0.656,-9.907],[2.756,-9.514],[4.199,-8.857],[4.514,-8.333]], -8.333, 0.28, 0.08),
          ...retractTailWheel(-5.393, -1.391, 0.24, 0.13, -0.866, -4.92),
          
        ],
        props: [{ z: 8.518, x: 2.75, y: -0.525, r: 1.77, blades: 3 }, { z: 8.518, x: -2.75, y: -0.525, r: 1.77, blades: 3 }, { z: 8.068, x: 6.35, y: -0.245, r: 1.77, blades: 3 }, { z: 8.068, x: -6.35, y: -0.245, r: 1.77, blades: 3 }],
        markZ: -4.6,
        markR: 0.62,
        soot: [[3.2,-0.525,5.5,3.5]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [15.83, 0.67, 3.61], kind: 'red' },
          { p: [-15.83, 0.67, 3.61], kind: 'green' },
          { p: [0,2.756,-9.645], kind: 'white' },
        ],
      };
    }
    case 'seafury': {
      // Sea Fury FB.11, üç görünüş silüetinden (70 piksel/m). Centaurus yıldız motoru dar ve düzgün kaportada, uzun göbek, beş palalı pervane. Damla kapak, kısa açıklıklı eliptiğe yakın kanat, kanatta dört Hispano. Takım içe, kuyruk tekeri toplanır.
      const H = new JetHull([[1.87,0.629,0.629,-0.557,-0.012],[1.27,0.709,0.686,-0.729,-0.078],[-1.3,0.654,0.871,-0.703,0.021],[-3.01,0.505,0.8,-0.636,0.025],[-5.87,0.154,0.586,-0.343,0.084],[-7.19,0.048,0.4,-0.271,0.038]] as JetSec[], 2.3, true, 2);
      const WR = [[0.45,-0.531,0.629,3.115,0.5],[0.6,-0.52,0.514,2.857,0.48],[1.93,-0.42,0.371,2.671,0.42],[3.6,-0.295,0.257,2.1,0.28],[5,-0.19,0.157,1.471,0.15],[5.6,-0.145,0.014,0.957,0.08],[5.82,-0.129,-0.129,0.642,0.04],[5.85,-0.126,-0.343,0.286,0.012]] as WingRow[];
      const TR = [[0.08,0.486,-6.171,1.172,0.118],[0.3,0.486,-6.171,1.172,0.113],[1.5,0.486,-6.2,1.071,0.083],[1.85,0.486,-6.414,0.715,0.074],[1.95,0.486,-6.7,0.186,0.072]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(1.87, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[1.87, 0.579, 0.579, -0.507, -0.012], [1.77, 0.569, 0.569, -0.497, -0.012]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.39, 0.39, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, 0.036, 1.77),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.491;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, 0.036 + Math.sin(a) * r, 1.78), 'dark');
          }),
          spinnerRows([[2.7,0],[2.52,0.18],[2.25,0.32],[1.88,0.38]], 0),
          ...stubRow(H, 3, 0.343, 0.17, -0.3, 0.05),
          tag(H.patch(1, -1.679, -3.043, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-1.3,0.196,0.871,0.73,0.841],[-1.729,0.3168,1.186,0.73,1.035]], glass: [[-1.729,0.3168,1.186,0.73,1.035],[-2.014,0.33,1.2,0.73,1.042],[-2.586,0.33,1.057,0.73,0.964],[-3.043,0.12,0.8,0.73,0.823]], aft: [[-3.003,0.11,0.79,0.73,0.823],[-3.183,0.072,0.77,0.73,0.823]], frames: [-1.729], posts: [[0.176,0.831,-1.3],[0.291,1.156,-1.729]], pilot: { z: -2.229, len: 1.35, h: 0.36, y: 0.91, w: 0.3 }, p: 2.2 }),
          
          
          ...planWing(WR, { xh: 0.78, span: [3.4,5.5] }),
          ...rowFlap(WR, 0.7, 3.35, 0.76),
          
          ...[1, -1].flatMap((s) => [[2.05,0.28],[2.6,0.28]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          
          ...planWing(TR, { xh: 0.62, span: [0.3,1.8], name: 'elevator' }),
          ...hingedFin(H, [[0.543,-5.8],[0.686,-6.086],[1.729,-6.657],[2.014,-7.229]], [[-0.3,-7.014],[-0.057,-7.8],[0.229,-7.8],[1.657,-7.657],[2.014,-7.3]], -7.186, 0.13, 0.05),
          ...retractTailWheel(-6.157, -0.343, 0.16, 0.09, -0.129, -5.943),
        ],
        props: [{ z: 2.057, y: 0, r: 1.96, blades: 5 }],
        markZ: -3.1,
        markR: 0.38,
        soot: [[0.58,-0.3,0.95,2.4]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [5.87, -0.126, -0.486], kind: 'red' },
          { p: [-5.87, -0.126, -0.486], kind: 'green' },
          { p: [0, -0.057, -7.82], kind: 'white' },
        ],
      };
    }
    case 'f8f': {
      // F8F-1 Bearcat, Bahriye düzenleme çiziminden (66,7 piksel/m; dikey kuyruk -1 sürümünün boyunda). Kısa, iri burun, küçük gövde, damla kapak; kısa açıklıklı köşeli kanat. Dört palalı büyük pervane, takım içe.
      const H = new JetHull([[2.23,0.692,0.72,-0.255,0.194],[1.75,0.716,0.8,-0.66,0.012],[1.15,0.746,0.9,-0.693,0.04],[0.1,0.733,1.029,-0.75,0.069],[-0.42,0.725,1.094,-0.732,0.108],[-2.42,0.57,0.945,-0.661,0.078],[-3.2,0.453,0.87,-0.55,0.104],[-4.7,0.24,1.006,-0.329,0.285],[-6.08,0.06,0.57,-0.03,0.246]] as JetSec[], 2.3, true, 2);
      const WR = [[0.7,-0.5,0.746,2.294,0.56],[1.54,-0.416,0.626,1.874,0.5],[3.5,-0.22,0.401,1.349,0.28],[5.2,-0.05,0.251,1.244,0.13],[5.4,-0.03,-0.124,0.449,0.04]] as WingRow[];
      const TR = [[0.08,0.495,-4.292,1.454,0.128],[0.2,0.495,-4.322,1.424,0.126],[1.2,0.495,-4.696,1.05,0.104],[2,0.495,-5.041,0.63,0.087],[2.3,0.495,-5.221,0.33,0.081],[2.42,0.495,-5.341,0.105,0.078]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(2.23, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[2.23, 0.642, 0.67, -0.205, 0.194], [2.13, 0.632, 0.66, -0.195, 0.194]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.429, 0.429, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, 0.232, 2.13),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.54;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, 0.232 + Math.sin(a) * r, 2.14), 'dark');
          }),
          spinnerRows([[2.5,0],[2.36,0.13],[2.15,0.17],[2,0.18]], 0),
          ...stubRow(H, 3, 1.525, 0.16, -0.5, 0.05),
          tag(H.patch(1, -0.823, -2.418, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.424,0.196,1.094,0.73,0.952],[-0.873,0.3168,1.439,0.73,1.174]], glass: [[-0.873,0.3168,1.439,0.73,1.174],[-1.248,0.33,1.469,0.73,1.19],[-1.848,0.31,1.319,0.73,1.108],[-2.418,0.1,0.945,0.73,0.902]], aft: [[-2.378,0.092,0.935,0.73,0.902],[-2.558,0.06,0.915,0.73,0.902]], frames: [-0.873], posts: [[0.176,1.054,-0.424],[0.291,1.409,-0.873]], pilot: { z: -1.4, len: 1.35, h: 0.36, y: 0.91, w: 0.3 }, p: 2.2 }),
          
          
          ...planWing(WR, { xh: 0.78, span: [3.3,5.2] }),
          ...rowFlap(WR, 0.7, 3.25, 0.76),
          ...[1, -1].flatMap((s) => [2.05,2.3].map((x: number) => {
            const q = rowAt(WR, x);
            return tag(new THREE.SphereGeometry(1, sg(4), sg(3)).scale(0.022, 0.022, 0.04).translate(s * x, q[1] + 0.012, q[2] - 0.005), 'dark');
          })),
          
          
          ...planWing(TR, { xh: 0.62, span: [0.2,2.2], name: 'elevator' }),
          ...hingedFin(H, [[0.87,-4.621],[1.019,-4.846],[1.994,-5.221],[2.144,-5.446]], [[-0.03,-6.076],[0.72,-6.121],[1.919,-6.046],[2.144,-5.746]], -5.566, 0.14, 0.06),
          ...retractTailWheel(-4.846, -0.66, 0.13, 0.07, -0.255, -4.726),
        ],
        props: [{ z: 2.455, y: 0, r: 1.92, blades: 4 }],
        markZ: -2.6,
        markR: 0.38,
        soot: [[0.58,-0.5,0.75,2.2]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [5.42, -0.03, -0.349], kind: 'red' },
          { p: [-5.42, -0.03, -0.349], kind: 'green' },
          { p: [0, 0.72, -6.141], kind: 'white' },
        ],
      };
    }
    case 'f4u': {
      // F4U-4 Corsair, üç görünüş çiziminden (85 piksel/m). Ters martı kanat: kök aşağı iner, dirsekten yukarı kalkar; kökte koyu soğutma girişleri. Uzun burun, geride kapak, kısa takım dirsekten geriye toplanır.
      const H = new JetHull([[2.29,0.682,0.682,-0.612,-0.017],[1.17,0.729,0.738,-0.753,-0.067],[0.7,0.707,0.763,-0.847,-0.106],[-1.06,0.654,0.859,-0.755,-0.013],[-2.01,0.595,0.859,-0.706,0.014],[-2.54,0.552,0.86,-0.654,0.043],[-3.12,0.48,1.034,-0.598,0.153],[-3.95,0.376,0.925,-0.517,0.146],[-4.89,0.251,0.8,-0.338,0.185],[-6.42,0.083,0.575,-0.046,0.24],[-7.3,0.012,0.329,0.271,0.298]] as JetSec[], 2.3, true, 2);
      const WR = [[0.65,-0.55,0.676,2.705,0.55],[1.4,-0.744,0.676,2.705,0.5],[2.2,-0.95,0.676,2.682,0.42],[3.5,-0.661,0.641,2.47,0.3],[5,-0.327,0.582,2.117,0.17],[5.7,-0.171,0.406,1.647,0.1],[6,-0.105,0.171,1.177,0.06],[6.2,-0.06,-0.124,0.294,0.012]] as WingRow[];
      const TR = [[0.08,0.447,-5.712,1.435,0.138],[0.2,0.447,-5.735,1.389,0.136],[1.4,0.447,-5.853,1.106,0.109],[2.1,0.447,-6.006,0.882,0.093],[2.4,0.447,-6.241,0.471,0.086],[2.5,0.447,-6.476,0.059,0.084]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(2.29, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[2.29, 0.632, 0.632, -0.562, -0.017], [2.19, 0.622, 0.622, -0.552, -0.017]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.423, 0.423, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, 0.035, 2.19),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.532;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, 0.035 + Math.sin(a) * r, 2.2), 'dark');
          }),
          spinnerRows([[2.9,0],[2.7,0.13],[2.45,0.17],[2.28,0.18]], 0),
          ...stubRow(H, 4, 0.994, 0.16, -0.5, 0.05),
          tag(H.patch(1, -1.603, -2.559, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-1.065,0.179,0.859,0.68,0.809],[-1.653,0.288,1.271,0.68,1.059]], glass: [[-1.653,0.288,1.271,0.68,1.059],[-1.829,0.3,1.294,0.68,1.072],[-2.359,0.3,1.176,0.68,1.007],[-2.559,0.14,0.8,0.68,0.8]], aft: [[-2.519,0.129,0.79,0.68,0.8],[-2.699,0.084,0.77,0.68,0.8]], frames: [-1.653,-2.359], posts: [[0.161,0.819,-1.065],[0.265,1.241,-1.653]], pilot: { z: -2.1, len: 1.35, h: 0.36, y: 0.86, w: 0.3 }, p: 2.6 }),
          mastRod(0.8, -3.218, 1.506, -3.218, 0.012),
          tag(rod(new THREE.Vector3(0, 1.506, -3.218), new THREE.Vector3(0, 2.306, -5.359), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.78, span: [3.6,5.8] }),
          ...rowFlap(WR, 0.7, 3.5, 0.78),
          ...[1, -1].flatMap((s) => [2.95,3.2,3.45].map((x: number) => {
            const q = rowAt(WR, x);
            return tag(new THREE.SphereGeometry(1, sg(4), sg(3)).scale(0.022, 0.022, 0.04).translate(s * x, q[1] + 0.012, q[2] - 0.005), 'dark');
          })),
          
          ...[1, -1].map((s) => tag(new THREE.BoxGeometry(0.75, 0.1, 0.04).translate(s * 1.3, -0.688, 0.666), 'dark')),
          ...planWing(TR, { xh: 0.6, span: [0.2,2.2], name: 'elevator' }),
          ...hingedFin(H, [[0.682,-4.747],[0.8,-4.888],[2.212,-5.335],[2.353,-5.653]], [[-0.047,-6.441],[0.271,-6.653],[1.153,-6.476],[2.153,-6.3],[2.329,-5.947]], -5.712, 0.15, 0.06),
          ...retractTailWheel(-5.629, -0.812, 0.16, 0.08, -0.435, -5.535),
        ],
        props: [{ z: 2.429, y: 0, r: 2.04, blades: 4 }],
        markZ: -3.1,
        markR: 0.44,
        soot: [[0.62,-0.5,1,2.4]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [6.22, -0.06, -0.271], kind: 'red' },
          { p: [-6.22, -0.06, -0.271], kind: 'green' },
          { p: [0, 0.271, -6.673], kind: 'white' },
        ],
      };
    }
    case 'ad4': {
      // AD-4 Skyraider, Bahriye düzenleme çiziminden ve bilinen ölçülerden (çizim küçük). Çok büyük tek motorlu taarruz uçağı: iri gövde, yüksek damla kapak, geniş ve düz kanat, yüksek köşeli kuyruk. Gövde yanlarında açılan hava frenleri, kanatta dört 20 mm top. Takım geriye toplanır.
      const H = new JetHull([[2.42,0.6,0.62,-0.66,-0.02],[2.1,0.63,0.68,-0.72,-0.02],[1.2,0.62,0.82,-0.82,0],[-0.5,0.6,0.95,-0.9,0.02],[-1.8,0.56,0.92,-0.92,0],[-3,0.5,0.8,-0.85,0],[-4.5,0.38,0.62,-0.6,0.02],[-6,0.24,0.48,-0.32,0.08],[-7,0.12,0.38,-0.12,0.14],[-7.8,0.03,0.28,0.02,0.16]] as JetSec[], 2.3, true, 2.05);
      const WR = [[0.45,-0.613,1.34,3.89,0.64],[0.6,-0.6,1.3,3.8,0.62],[2.5,-0.429,1.15,3.5,0.52],[5,-0.204,0.8,2.65,0.34],[7,-0.024,0.5,1.85,0.2],[7.4,0.012,0.35,1.55,0.12],[7.62,0.032,0,0.85,0.015]] as WingRow[];
      const TR = [[0.1,0.5,-6.15,1.67,0.16],[0.3,0.5,-6.15,1.65,0.16],[1.5,0.5,-6.4,1.3,0.14],[2.6,0.5,-6.8,0.8,0.09],[2.9,0.5,-7.1,0.2,0.04]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(2.42, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[2.42, 0.55, 0.57, -0.61, -0.02], [2.32, 0.54, 0.56, -0.6, -0.02]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.372, 0.372, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, -0.02, 2.32),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.468;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, -0.02 + Math.sin(a) * r, 2.33), 'dark');
          }),
          spinnerRows([[3.1,0],[2.92,0.18],[2.6,0.27],[2.35,0.29]], 0),
          ...stubRow(H, 4, 1.6, 0.2, -0.2, 0.06),
          tag(H.patch(1, -1, -3.1, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.55, 0.22, 1.0, 0.7, 0.85], [-1.05, 0.36, 1.35, 0.7, 0.95]], glass: [[-1.05, 0.36, 1.35, 0.7, 0.95], [-1.6, 0.4, 1.42, 0.7, 1.0], [-2.4, 0.35, 1.32, 0.7, 0.95], [-3.1, 0.1, 0.88, 0.65, 0.8]], aft: [[-3.05, 0.09, 0.87, 0.65, 0.8], [-3.3, 0.03, 0.8, 0.62, 0.75]], frames: [-1.06], posts: [[0.2, 0.92, -0.55], [0.33, 1.3, -1.05]], pilot: { z: -1.75, len: 1.4, h: 0.38, y: 0.94, w: 0.3 } }),
          
          
          ...planWing(WR, { xh: 0.8, span: [4.8,7] }),
          ...rowFlap(WR, 0.6, 4.75, 0.78),
          
          ...[1, -1].flatMap((s) => [[2.6,0.2],[2.9,0.2]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          ...[1, -1].flatMap((s) => joint(s > 0 ? 'airbrakeL' : 'airbrakeR', [s * H.sideX(-3.0, 0.15), 0.15, -3.0], [H.patch(s, -3.0, -3.9, -0.15, 0.55, 0.012, -0.012)], false, [0, 1, 0])),
          ...planWing(TR, { xh: 0.6, span: [0.3,2.6], name: 'elevator' }),
          ...hingedFin(H, [[0.2,-5.85],[0.4,-6],[0.6,-6.2],[1.5,-6.9],[2.4,-7.35],[2.7,-7.6]], [[-0.2,-8],[0.3,-8.35],[1.5,-8.3],[2.4,-8],[2.72,-7.75]], -7.62, 0.16, 0.07),
          ...retractTailWheel(-6.6, -0.5, 0.14, 0.09, -0.25, -6.45),
        ],
        props: [{ z: 2.62, y: 0, r: 2.06, blades: 4 }],
        markZ: -3.8,
        markR: 0.42,
        soot: [[0.68,-0.2,1.2,2.8]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [7.64, 0.032, -0.425], kind: 'red' },
          { p: [-7.64, 0.032, -0.425], kind: 'green' },
          { p: [0, 0.3, -8.37], kind: 'white' },
        ],
      };
    }
    case 'a26': {
      // A-26B Invader, üç görünüş çiziminden (46,2 piksel/m). Düz, silahlı burun, tek pilot kapağı, ince laminer kanat, iki büyük R-2800 motoru; uzaktan kumandalı sırt ve karın taretleri. Burun tekerlekli takım.
      const H = new JetHull([[7.51,0.101,0.217,-0.261,-0.041],[6.75,0.407,0.493,-0.758,-0.183],[5.46,0.682,0.797,-0.866,-0.101],[4.81,0.76,0.908,-0.86,-0.046],[3.51,0.747,1.039,-0.847,0.021],[1.13,0.724,0.856,-0.823,-0.05],[-2.34,0.5,0.714,-0.505,0.056],[-4.5,0.3,0.866,-0.176,0.303],[-5.58,0.2,0.791,0,0.364],[-7.64,0.04,0.649,0.368,0.497]] as JetSec[], 2.5, true, 2.1);
      const WR = [[0.8,-0.1,3.665,3.09,0.72],[3.5,0.116,3.597,2.659,0.62],[6,0.316,3.529,2.318,0.46],[9,0.556,3.415,1.75,0.28],[10.2,0.652,3.325,1.319,0.15],[10.55,0.68,3.029,0.682,0.06],[10.67,0.69,2.688,0.113,0.015]] as WingRow[];
      const TR = [[0.25,0.823,-5.085,2,0.16],[1.5,0.823,-5.494,1.477,0.14],[3.4,0.823,-6.016,0.682,0.1],[3.55,0.823,-6.107,0.5,0.05]] as WingRow[];
      const NR = [[5.564,0.5,0.606,-0.649,-0.022],[5.023,0.74,0.758,-0.823,-0.032],[2.425,0.72,0.758,-0.866,-0.054],[0.694,0.35,0.541,-0.541,0],[-1.038,0.04,0,-0.13,-0.065]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number, dy: number, dz: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, dy, dz),
        tag(pod.disc(5.564, 1, 12).translate(s * x, dy, dz + -0.08), 'dark'),
        spinnerRows([[6.148,0],[5.932,0.1],[5.564,0.17]], 0, s * x).translate(0, dy, dz),
        ...[new THREE.TorusGeometry(0.4, 0.035, sg(4), sg(10)).translate(s * x, 0 + dy, 5.544 + dz)],
        ...[],
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(H.patch(1, 3.016, 1.451, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7, 0.006), 'dark'),
          ...jetCanopy({ screen: [[3.507,0.268,1.039,0.83,0.974],[2.966,0.432,1.342,0.83,1.166]], glass: [[2.966,0.432,1.342,0.83,1.166],[2.642,0.45,1.364,0.83,1.178],[1.884,0.45,1.299,0.83,1.142],[1.451,0.25,0.974,0.83,0.963]], aft: [[1.491,0.23,0.964,0.83,0.963],[1.311,0.15,0.944,0.83,0.963]], frames: [2.966,2.209], posts: [[0.241,0.999,3.507],[0.397,1.312,2.966]], pilot: { z: 2.468, len: 1.35, h: 0.36, y: 1.01, w: 0.3 }, p: 2.6 }),
          ...podAt(2.97, 0, 0),
          ...planWing(WR, { xh: 0.78, span: [6.2,9.8] }),
          ...rowFlap(WR, 0.9, 6.1, 0.74),
          ...turretDome(0.823, -0.172, 0.34, 0.55, [0, 0.952, -1.146], 0.06),
          ...turretDome(-0.563, -2.337, 0.34, 0.55, [0, -0.693, -3.311], 0.06),
          ...[0.09, -0.09, 0.22, -0.22, 0.34, -0.34].map((x) => tag(rod(new THREE.Vector3(x, 0.39 - Math.abs(x) * 0.5, 6.646), new THREE.Vector3(x, 0.39 - Math.abs(x) * 0.5, 7.079), 0.014, 5), 'dark')),
          ...planWing(TR, { xh: 0.6, span: [0.25,3.2], name: 'elevator' }),
          ...hingedFin(H, [[0.823,-4.177],[1.299,-4.609],[2.165,-4.826],[3.247,-5.215],[3.528,-6.016]], [[0.541,-6.233],[0.433,-7.532],[1.732,-7.142],[3.03,-6.774],[3.528,-6.341]], -6.233, 0.17, 0.06),
          
          ...noseWheel(-0.75, 6.321, -1.775, 6.105, 0.39, 0.16),
        ],
        props: [{ z: 5.78, x: 2.97, y: 0, r: 1.9, blades: 3 }, { z: 5.78, x: -2.97, y: 0, r: 1.9, blades: 3 }],
        markZ: -3.4,
        markR: 0.42,
        soot: [[3.5,0,2.5,3]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [10.69, 0.69, 2.631], kind: 'red' },
          { p: [-10.69, 0.69, 2.631], kind: 'green' },
          { p: [0,1.948,-7.207], kind: 'white' },
        ],
      };
    }
    case 'b29': {
      // B-29 Superfortress, üç görünüş çiziminden (28 piksel/m). Silindir gövde, kokpitsiz yuvarlak camlı burun, uzaktan kumandalı dört taret ve kuyruk nişancısı, çok ince uzun kanat ve dört R-3350 motoru. Burun tekerlekli çift lastikli takım.
      const H = new JetHull([[12.68,1.2,1.212,-1.283,-0.035],[10.54,1.402,1.497,-1.47,0.013],[-0.16,1.47,1.497,-1.426,0.036],[-3.72,1.47,1.497,-1.07,0.214],[-7.29,1.257,1.414,-0.713,0.351],[-14.95,0.121,0.965,0.428,0.696]] as JetSec[], 2.05, true, 2.05);
      const WR = [[1.4,-0.1,6.294,5.347,1.05],[7,0.32,5.724,4.528,0.75],[13,0.77,4.833,3.28,0.5],[18,1.145,4.298,2.674,0.3],[20.8,1.355,3.977,2.246,0.18],[21.4,1.4,3.514,1.426,0.08],[21.53,1.41,2.801,0.179,0.015]] as WingRow[];
      const TR = [[0.7,1.212,-10.319,3.351,0.3],[2.5,1.212,-10.854,2.673,0.24],[4.5,1.212,-11.281,2.068,0.18],[5.8,1.212,-11.567,1.568,0.1],[6.6,1.212,-12.422,0.143,0.02]] as WingRow[];
      const NR = [[8.612,0.6,0.6,-0.6,0],[7.97,0.82,0.8,-0.8,0],[6.187,0.82,0.8,-0.8,0],[4.761,0.4,0.45,-0.45,0],[4.227,0.04,0.08,-0.08,0]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number, dy: number, dz: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, dy, dz),
        tag(pod.disc(8.612, 1, 12).translate(s * x, dy, dz + -0.08), 'dark'),
        spinnerRows([[9.218,0],[8.968,0.16],[8.612,0.25]], 0, s * x).translate(0, dy, dz),
        ...[new THREE.TorusGeometry(0.48, 0.035, sg(4), sg(10)).translate(s * x, 0 + dy, 8.592 + dz)],
        ...[],
      ]);
      return {
        solids: [
          H.geo(16, [true, true]),
          
          ...podAt(4.38, 0, 0),
          ...podAt(9.5, 0.38, -0.64),
          ...planWing(WR, { xh: 0.76, span: [13,20.5] }),
          ...rowFlap(WR, 1.6, 12.8, 0.74),
          ...noseGlass([[15.029,0.05,0.428,-0.463,0],[14.637,0.7,0.784,-0.82,0],[13.745,1.05,1.141,-1.07,0],[12.676,1.2,1.212,-1.283,0]] as JetSec[], [15.029, 14.637, 13.745, 12.676], [14.28, 13.389, 12.676], { z: 13.211, len: 1.5, h: 0.42, y: 0.606, w: 0.7 }),
          tag(H.disc(12.68, 1, 16), 'dark'),
          // Dört taret, kuyruk ve gözetleme kubbeleri
          ...turretDome(1.533, 10.644, 0.48, 0.55, [0, 1.711, 9.289], 0.07),
          ...turretDome(1.533, -3.117, 0.48, 0.55, [0, 1.711, -4.508], 0.07),
          ...turretDome(-1.604, 10.323, 0.48, 0.5, [0, -1.711, 8.932], 0.07),
          ...turretDome(-0.499, -8.822, 0.48, 0.5, [0, -0.642, -10.212], 0.07),
          ...[0.08, -0.08].map((x) => tag(rod(new THREE.Vector3(x, 0.927, -14.847), new THREE.Vector3(x, 0.927, -15.773), 0.018, 5), 'dark')),
          tag(new THREE.SphereGeometry(0.25, sg(8), sg(5)).translate(0, 1.462, 7.328), 'glass'),
          ...planWing(TR, { xh: 0.62, span: [0.7,5.8], name: 'elevator' }),
          ...hingedFin(H, [[1.497,-4.258],[2.032,-7.289],[3.458,-9.428],[5.241,-10.497],[6.667,-11.21],[7.166,-12.28]], [[0.963,-12.636],[1.319,-14.526],[3.636,-14.24],[6.132,-13.706],[7.166,-12.636]], -12.458, 0.3, 0.1),
          
          ...noseWheel(-1.05, 13.567, -2.55, 14.03, 0.45, 0.18, 0.22),
        ],
        props: [{ z: 8.861, x: 4.38, y: 0, r: 2.52, blades: 4 }, { z: 8.861, x: -4.38, y: 0, r: 2.52, blades: 4 }, { z: 8.221, x: 9.5, y: 0.38, r: 2.52, blades: 4 }, { z: 8.221, x: -9.5, y: 0.38, r: 2.52, blades: 4 }],
        markZ: -6,
        markR: 0.75,
        soot: [[5.2,0,7,4]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [21.55, 1.41, 2.712], kind: 'red' },
          { p: [-21.55, 1.41, 2.712], kind: 'green' },
          { p: [0,4.349,-14.49], kind: 'white' },
        ],
      };
    }
    case 'canberra': {
      // Canberra B.2, ölçüler üç görünüş siluetinden. Yuvarlak, kalın gövde; alçak, sivri burun ve ucunda bomba nişancısının
      // saydam konisi; önde damla kanopi. Çok geniş kök veterli kanat, kalın Avon naselleri kanadın ortasından geçer:
      // yuvarlak giriş ve ortada üç kollu göbek. Geniş dihedralli yatay kuyruk, kavisle kalkan büyük dikey kuyruk.
      const NOSE: JetSec[] = [[8.1, 0.01, -0.48, -0.52, -0.5], [8.0, 0.2, -0.3, -0.64, -0.48], [7.62, 0.41, -0.07, -0.69, -0.38]];
      const GL = new JetHull(NOSE, 2.1);
      const H = new JetHull([
        [7.62, 0.41, -0.07, -0.69, -0.38], [6.79, 0.68, 0.33, -0.86, -0.25], [5.72, 0.85, 0.6, -0.95, -0.15], [4.77, 0.98, 0.9, -0.98, -0.05], [-0.23, 1.0, 0.98, -0.98, 0], [-4.52, 0.98, 0.98, -0.79, 0.08],
        [-7.4, 0.5, 1.02, 0.17, 0.6], [-8.8, 0.45, 1.0, 0.4, 0.7], [-10.4, 0.25, 0.95, 0.55, 0.75], [-11.5, 0.06, 0.85, 0.7, 0.77],
      ], 2.05);
      const Wi: WingOpts = { x0: 0.4, z: 1.81, root: 5.75, y: 0.0, tipX: 3.5, tip: 5.55, sweep: 0.03, dihedral: 3, t: 0.75 };
      const W: WingOpts = { x0: 3.78, z: 1.76, root: 5.44, y: 0.2, tipX: 9.5, tip: 1.7, sweep: 1.42, dihedral: 4.5, t: 0.68 };
      const T: WingOpts = { x0: 0.3, z: -8.35, root: 2.3, y: 0.72, tipX: 3.78, tip: 1.27, sweep: 1.55, dihedral: 9.5, t: 0.2 };
      const tipY = W.y + (W.tipX - W.x0) * tanD(W.dihedral);
      const NX = 3.17;
      const NY = 0.15;
      const nacelle = (sd: number): Geo[] => {
        const o = { x: sd * NX, y: NY };
        return [
          body([[2.2, 0.3], [2.7, 0.34], [2.92, 0.4], [2.96, 0.46], [2.88, 0.52], [2.5, 0.6], [1.6, 0.64], [0, 0.63], [-2, 0.56], [-3.6, 0.38], [-4.3, 0.3], [-4.4, 0.29]], 12, { ...o, smooth: true }),
          tag(body([[1.8, 0.27], [2.22, 0.3]], 12, o), 'dark'),
          tag(new THREE.CircleGeometry(0.27, sg(12)).translate(o.x, o.y, 1.8), 'dark'),
          body([[3.0, 0.001], [2.88, 0.08], [2.62, 0.13], [1.9, 0.14]], 8, { ...o, smooth: true }),
          ...[0, 1, 2].map((i) => {
            const an = Math.PI / 2 + (i * Math.PI * 2) / 3;
            return tag(rod(new THREE.Vector3(o.x + Math.cos(an) * 0.1, o.y + Math.sin(an) * 0.1, 2.5), new THREE.Vector3(o.x + Math.cos(an) * 0.32, o.y + Math.sin(an) * 0.32, 2.5), 0.02, 4), 'dark');
          }),
          tag(body([[-4.4, 0.26], [-3.9, 0.24]], 12, o), 'dark'),
          tag(new THREE.CircleGeometry(0.24, sg(12)).rotateY(Math.PI).translate(o.x, o.y, -3.9), 'dark'),
          tag(new THREE.ConeGeometry(0.12, 0.3, sg(8)).rotateX(-Math.PI / 2).translate(o.x, o.y, -4.05), 'dark'),
        ];
      };
      return {
        solids: [
          tag(GL.geo(13), 'glass'),
          tag(H.disc(7.62, 1, 13), 'dark'),
          H.geo(14),
          tag(H.patch(1, 5.95, 4.85, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[6.35, 0.2, 0.5, 0.1, 0.45], [5.95, 0.38, 0.84, 0.1, 0.55]],
            glass: [[5.95, 0.38, 0.84, 0.1, 0.55], [5.6, 0.44, 0.97, 0.1, 0.6], [5.1, 0.44, 0.99, 0.1, 0.62], [4.75, 0.38, 0.99, 0.2, 0.68]],
            aft: [[4.8, 0.39, 1.0, 0.2, 0.68], [4.2, 0.22, 0.98, 0.2, 0.72], [3.4, 0.02, 0.93, 0.3, 0.7]],
            frames: [5.95, 4.78],
            posts: [[0.1, 0.5, 6.32], [0.27, 0.8, 5.97]],
            pilot: { z: 5.35, len: 1.5, h: 0.42, y: 0.62, w: 0.4 },
          }),
          // İç kanat flaplı, dış kanat kanatçıklı; uç yuvarlak. Parmak hava frenleri iç kanadın üstünde
          ...controlWing(Wi, 0.85, [[0, 0.75, 'flap'], [0.75, 1, null]]),
          ...controlWing(W, 0.8, [[-0.15, 0, null], [0, 0.36, 'flapD'], [0.36, 0.37, null], [0.37, 0.98, 'aileron'], [0.98, 1, null]], 2.5),
          ...nacelle(1),
          ...nacelle(-1),
          ...[1, -1].flatMap((sd) => [
            tag(new THREE.BoxGeometry(1.4, 0.008, 0.72).translate(sd * 1.9, 0.46, -0.2), 'dark'),
            ...joint(sd > 0 ? 'airbrakeL' : 'airbrakeR', [sd * 1.9, 0.47, -0.6], [new THREE.BoxGeometry(1.5, 0.02, 0.8).translate(sd * 1.9, 0.47, -0.2)], false, [sd, 0, 0]),
          ]),
          ...controlWing(T, 0.7, [[0, 0.96, 'elevator'], [0.96, 1, null]], 3),
          ...jetFin([[0.85, -6.8, 4.6], [1.25, -7.38, 3.95], [1.7, -7.85, 3.4], [2.4, -8.6, 2.6], [3.0, -9.1, 2.05], [3.12, -9.3, 1.8], [3.19, -9.75, 1.25]], 0.24, 0.68, 2, 4),
        ],
        props: [],
        markZ: -5.6,
        lights: [
          { p: [W.tipX + 0.26, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'red' },
          { p: [-W.tipX - 0.26, tipY, W.z - W.sweep - W.tip * 0.45], kind: 'green' },
          { p: [0, 2.2, -11.28], kind: 'white' },
          { p: [1.6, -0.36, 1.6], kind: 'landing' },
        ],
      };
    }
    // ================================================================ Çeşitlilik: pervaneliler
    case 'i16': {
      // I-16 tip 24, üç görünüş çiziminden (120,9 piksel/m). Çok kısa, fıçı gibi gövde; açık kokpit ve küçük ön cam, arkasında baş dayanağı. Düz kanat boyunca kanatçık. İki palalı pervane, kuyruk kızağı. Takım krankla içe toplanır.
      const H = new JetHull([[1.93,0.513,0.587,-0.571,-0.038],[0.81,0.637,0.637,-0.653,-0.06],[0.15,0.616,0.627,-0.612,-0.042],[-0.3,0.601,0.62,-0.565,-0.02],[-0.64,0.579,0.794,-0.528,0.08],[-1.03,0.54,0.901,-0.438,0.178],[-1.46,0.497,0.835,-0.339,0.201],[-1.71,0.472,0.792,-0.281,0.213],[-2.08,0.409,0.729,-0.202,0.226],[-2.87,0.232,0.475,-0.033,0.201],[-3.43,0.04,0.175,0.115,0.143]] as JetSec[], 2.2, true, 2.05);
      const WR = [[0.6,-0.341,1.349,2.358,0.46],[0.75,-0.339,1.307,2.233,0.44],[1.14,-0.333,1.266,1.985,0.4],[2.2,-0.317,1.183,1.761,0.28],[3.5,-0.297,1.076,1.448,0.16],[4.1,-0.288,1.001,1.058,0.1],[4.4,-0.284,0.811,0.604,0.05],[4.5,-0.282,0.48,0.082,0.012]] as WingRow[];
      const TR = [[0.08,0.091,-2.439,1.274,0.098],[0.2,0.091,-2.456,1.257,0.095],[0.65,0.091,-2.456,1.257,0.085],[1.2,0.091,-2.828,0.885,0.072],[1.55,0.091,-3.076,0.579,0.064],[1.7,0.091,-3.283,0.124,0.06]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(1.93, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[1.93, 0.463, 0.537, -0.521, -0.038], [1.83, 0.453, 0.527, -0.511, -0.038]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.318, 0.318, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, 0.008, 1.83),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.4;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, 0.008 + Math.sin(a) * r, 1.84), 'dark');
          }),
          spinnerRows([[2.3,0],[2.12,0.12],[1.97,0.2],[1.95,0.22]], 0),
          
          tag(H.patch(1, -0.38, -0.653, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.239,0.143,0.604,0.6,0.642],[-0.43,0.2304,0.877,0.6,0.806]], glass: [[-0.43,0.2304,0.877,0.6,0.806],[-0.537,0.24,0.902,0.6,0.82],[-0.653,0.22,0.902,0.6,0.82]], aft: [[-0.613,0.202,0.892,0.6,0.82],[-0.793,0.132,0.872,0.6,0.82]], frames: [-0.43], posts: [[0.129,0.564,-0.239],[0.212,0.847,-0.43]], pilot: { z: -0.926, len: 1.35, h: 0.36, y: 0.78, w: 0.3 }, p: 2.4 }),
          
          
          ...planWing(WR, { xh: 0.74, span: [1.14,3.9] }),
          ...rowFlap(WR, 0.6, 1.1, 0.74),
          
          ...[1, -1].flatMap((s) => [[1.5,0.15]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          
          ...planWing(TR, { xh: 0.55, span: [0.2,1.5], name: 'elevator' }),
          ...hingedFin(H, [[0.687,-2.042],[0.794,-2.291],[1.514,-3.035],[1.514,-3.2]], [[0.116,-3.382],[0.339,-3.655],[0.67,-3.68],[1.166,-3.531],[1.514,-3.2]], -3.035, 0.1, 0.04),
          ...fixedTailWheel(-3.225, -0.289, 0.04, 0.03, -0.033, -2.952),
        ],
        props: [{ z: 2.052, y: 0, r: 1.4, blades: 2 }],
        markZ: -1.7,
        markR: 0.3,
        soot: [[0.55,0.1,1.2,1.6]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [4.52, -0.282, 0.439], kind: 'red' },
          { p: [-4.52, -0.282, 0.439], kind: 'green' },
          { p: [0, 0.67, -3.7], kind: 'white' },
        ],
      };
    }
    case 'a6m': {
      // A6M2 Zero, üç görünüş çiziminden (96,5 piksel/m). İnce uzun gövde, uzun ve çok çerçeveli kapak, çok hafif yuvarlak uçlu geniş kanat. Eğik anten direği, kanatta 20 mm top, burunda iki tüfek. Takım içe, kuyruk tekeri sabit.
      const H = new JetHull([[2.07,0.487,0.418,-0.468,-0.06],[1.67,0.544,0.582,-0.652,-0.085],[1.2,0.558,0.599,-0.601,-0.049],[0.37,0.582,0.694,-0.601,-0.005],[-1.7,0.526,0.647,-0.497,0.029],[-2.12,0.498,0.601,-0.469,0.023],[-4.29,0.284,0.446,-0.325,0.03],[-5.54,0.124,0.257,-0.19,0.015],[-5.85,0.086,0.143,-0.155,-0.018],[-6.47,0.01,-0.083,-0.124,-0.105]] as JetSec[], 2.3, true, 2.05);
      const WR = [[0.45,-0.437,0.973,2.725,0.44],[0.6,-0.42,0.869,2.518,0.42],[2,-0.26,0.787,2.156,0.33],[4,-0.033,0.631,1.627,0.2],[5,0.081,0.548,1.368,0.13],[5.4,0.127,0.424,1.192,0.1],[5.75,0.167,0.217,0.778,0.05],[6,0.195,-0.146,0.031,0.012]] as WingRow[];
      const TR = [[0.08,0.124,-4.136,1.419,0.108],[0.3,0.124,-4.156,1.379,0.104],[1.2,0.124,-4.447,1.036,0.087],[1.9,0.124,-4.726,0.653,0.074],[2.2,0.124,-4.892,0.332,0.068],[2.33,0.124,-5.017,0.02,0.066]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(2.07, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[2.07, 0.437, 0.368, -0.418, -0.06], [1.97, 0.427, 0.358, -0.408, -0.06]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.259, 0.259, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, -0.025, 1.97),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.326;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, -0.025 + Math.sin(a) * r, 1.98), 'dark');
          }),
          spinnerRows([[2.6,0],[2.42,0.17],[2.2,0.25],[2.08,0.27]], 0),
          ...stubRow(H, 2, 1.667, 0.22, -0.45, 0.05),
          tag(H.patch(1, 0.059, -1.804, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[0.393,0.179,0.694,0.42,0.597],[0.009,0.288,0.984,0.42,0.784]], glass: [[0.009,0.288,0.984,0.42,0.784],[-0.198,0.3,1.005,0.42,0.796],[-0.872,0.31,0.984,0.42,0.784],[-1.338,0.29,0.85,0.42,0.711],[-1.804,0.17,0.674,0.42,0.614]], aft: [[-1.764,0.156,0.664,0.42,0.614],[-1.944,0.102,0.644,0.42,0.614]], frames: [0.009,-0.198,-0.561,-0.872,-1.338], posts: [[0.161,0.654,0.393],[0.265,0.954,0.009]], pilot: { z: -0.664, len: 1.35, h: 0.36, y: 0.6, w: 0.3 }, p: 2.8, rails: [1.2] }),
          mastRod(0.725, -1.721, 1.503, -1.545, 0.012),
          tag(rod(new THREE.Vector3(0, 1.503, -1.545), new THREE.Vector3(0, 1.606, -5.597), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.76, span: [3.1,5.5] }),
          ...rowFlap(WR, 0.6, 3.05, 0.76),
          
          ...[1, -1].flatMap((s) => [[2.3,0.5]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          
          ...planWing(TR, { xh: 0.6, span: [0.3,2.05], name: 'elevator' }),
          ...hingedFin(H, [[0.311,-4.032],[0.446,-4.291],[1.451,-5.224],[1.637,-5.535]], [[-0.166,-5.97],[-0.104,-6.467],[0.518,-6.208],[1.554,-5.846],[1.637,-5.618]], -5.587, 0.1, 0.04),
          ...fixedTailWheel(-5.98, -0.363, 0.06, 0.05, -0.187, -5.846),
        ],
        props: [{ z: 2.185, y: 0, r: 1.45, blades: 3 }],
        markZ: -2.9,
        markR: 0.32,
        soot: [[0.53,-0.45,1.25,2]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [6.02, 0.195, -0.161], kind: 'red' },
          { p: [-6.02, 0.195, -0.161], kind: 'green' },
          { p: [0, -0.104, -6.487], kind: 'white' },
        ],
      };
    }
    case 'blenheim': {
      // Blenheim Mk IV, üç görünüş çiziminden (48,6 piksel/m). Kısa camlı burun, kanat önünde iki Mercury motoru, sırtta küçük kubbeli taret. Düz, sivrilen kanat, yüksek oval dikey kuyruk. Takım geriye nacelleye, kuyruk tekeri sabit.
      const H = new JetHull([[4.06,0.2,0.247,-0.309,-0.053],[2.92,0.58,0.544,-0.864,-0.216],[1.48,0.62,0.926,-0.748,0.022],[-0.16,0.62,0.926,-0.617,0.093],[-3.25,0.47,0.926,-0.35,0.237],[-6.54,0.155,0.866,0.206,0.509],[-7.88,0.03,0.761,0.37,0.55]] as JetSec[], 2.3, true, 2.1);
      const WR = [[0.55,-0.162,1.75,3.67,0.64],[0.7,-0.15,1.7,3.55,0.62],[2.6,0.002,1.55,3.3,0.52],[5,0.194,1.15,2.35,0.33],[7.5,0.394,0.55,1.15,0.2],[8.3,0.458,0.25,0.6,0.1],[8.58,0.48,-0.05,0.1,0.015]] as WingRow[];
      const TR = [[0.08,0.926,-6.3,1.75,0.16],[0.1,0.926,-6.3,1.75,0.16],[1.5,0.926,-6.6,1.35,0.13],[2.6,0.926,-7,0.8,0.09],[3,0.926,-7.3,0.25,0.04]] as WingRow[];
      const NR = [[2.719,0.45,0.98,-0.2,0.4],[1.381,0.5,1,-0.38,0.4],[-0.162,0.36,0.72,-0.55,0.1],[-1.5,0.04,0.05,-0.4,-0.15]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, 0, 0),
        tag(pod.disc(2.719, 1, 12).translate(s * x, 0, -0.08), 'dark'),
        spinnerRows([[3.027,0],[2.883,0.14],[2.719,0.2]], 0.4, s * x),
        ...[new THREE.TorusGeometry(0.36, 0.035, sg(4), sg(10)).translate(s * x, 0.4, 2.699)],
        ...[],
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(H.patch(1, 3.386, 2.04, Math.PI / 2 - 0.9, Math.PI / 2 + 0.9, 0.006), 'dark'),
          ...jetCanopy({ screen: [[4.056,0.18,0.247,-0.206,0],[3.747,0.44,0.494,-0.412,0]], glass: [[3.747,0.44,0.494,-0.412,0],[3.13,0.52,0.679,-0.514,0.103],[1.998,0.5,0.864,-0.206,0.309]], aft: [[2.04,0.48,0.844,-0.206,0.309],[1.484,0.3,0.905,0,0.412]], frames: [3.542,2.924,2.41], posts: [[0.1, 0.103, 3.994], [0.4, 0.453, 3.747]], pilot: { z: 2.821, len: 1.3, h: 0.34, y: 0.247, w: 0.3 }, p: 2.8, rails: [0.5, 1.15] }),
          ...podAt(2.3),
          ...planWing(WR, { xh: 0.76, span: [4.8,7.6] }),
          ...rowFlap(WR, 0.7, 4.7, 0.76),
          // Sırt tareti, kubbe ve iki tüfek
          tag(new THREE.SphereGeometry(0.42, sg(10), sg(6)).scale(1, 0.75, 1).translate(0, 0.926, -3.002), 'glass'),
          ...[0.05, -0.05].map((x) => tag(rod(new THREE.Vector3(x, 1.132, -3.002), new THREE.Vector3(x, 1.399, -3.598), 0.012, 5), 'dark')),
          mastRod(0.926, -0.368, 1.914, -0.43, 0.014),
          tag(rod(new THREE.Vector3(0, 1.914, -0.43), new THREE.Vector3(0, 2.366, -7.57), 0.004, 3), 'dark'),
          ...planWing(TR, { xh: 0.6, span: [0.1,2.7], name: 'elevator' }),
          ...hingedFin(H, [[0.7,-6.335],[1.029,-6.644],[2.305,-7.467],[2.675,-7.94]], [[0.514,-8.187],[0.617,-8.804],[1.44,-8.845],[2.058,-8.64],[2.675,-8.084]], -7.94, 0.15, 0.05),
          ...fixedTailWheel(-7.2, -0.31, 0.18, 0.09, -0.12, -7),
          
        ],
        props: [{ z: 2.883, x: 2.3, y: 0.4, r: 1.6, blades: 3 }, { z: 2.883, x: -2.3, y: 0.4, r: 1.6, blades: 3 }],
        markZ: -3.8,
        markR: 0.4,
        soot: [[2.75,0.4,2,2.4]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [8.6, 0.48, -0.1], kind: 'red' },
          { p: [-8.6, 0.48, -0.1], kind: 'green' },
          { p: [0,1.2,-8.2], kind: 'white' },
        ],
      };
    }
    case 'p40': {
      // P-40E, üç görünüş çiziminden (70,3 piksel/m). Derin çene radyatörü ve köpek balığı ağzı, sıra motor, çok çerçeveli kapak. Üçer makineli tüfek, takım geriye ve kanada yatarak toplanır.
      const H = new JetHull([[2.25,0.313,0.313,-0.327,-0.033],[1.85,0.406,0.465,-0.99,-0.32],[1.14,0.435,0.503,-1.123,-0.375],[0.42,0.464,0.541,-1.017,-0.3],[0,0.469,0.541,-0.854,-0.212],[-0.64,0.459,0.541,-0.833,-0.201],[-1.43,0.421,0.541,-0.808,-0.187],[-3.3,0.299,0.541,-0.748,-0.155],[-3.91,0.241,0.597,-0.69,-0.098],[-5.26,0.1,0.544,-0.499,-0.019],[-6.33,0.033,0.427,-0.398,-0.018]] as JetSec[], 2.5, true, 2.1);
      const WR = [[0.5,-0.55,0.14,3.627,0.42],[0.9,-0.508,-0.102,2.603,0.38],[2,-0.392,-0.159,2.048,0.31],[4,-0.182,-0.201,1.437,0.2],[5,-0.077,-0.216,1.067,0.13],[5.4,-0.035,-0.244,0.825,0.09],[5.6,-0.014,-0.429,0.398,0.05],[5.69,-0.005,-0.614,0.043,0.012]] as WingRow[];
      const TR = [[0.08,0.327,-5.294,1.678,0.128],[0.2,0.327,-5.337,1.635,0.124],[1,0.327,-5.621,1.351,0.101],[1.5,0.327,-5.834,0.925,0.086],[1.7,0.327,-6.048,0.498,0.08],[1.78,0.327,-6.19,0.142,0.078]] as WingRow[];
      return {
        solids: [
          H.geo(14, [true, true]),
          
          spinnerRows([[2.8,0],[2.68,0.16],[2.45,0.28],[2.28,0.32]], 0),
          ...stubRow(H, 6, 1.591, 0.19, 0, 0.04),
          tag(H.patch(1, -1.304, -3.302, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.642,0.173,0.541,0.14,0.381],[-1.354,0.2784,0.882,0.14,0.602]], glass: [[-1.354,0.2784,0.882,0.14,0.602],[-1.638,0.29,0.882,0.14,0.602],[-2.207,0.3,0.882,0.14,0.602],[-3.302,0.13,0.569,0.14,0.43]], aft: [[-3.262,0.12,0.559,0.14,0.43],[-3.442,0.078,0.539,0.14,0.43]], frames: [-1.354,-1.809,-2.207,-2.492,-2.876], posts: [[0.156,0.501,-0.642],[0.256,0.852,-1.354]], pilot: { z: -1.8, len: 1.35, h: 0.36, y: 0.32, w: 0.3 }, p: 3, rails: [1.15] }),
          
          tag(rod(new THREE.Vector3(0, 0.902, -1.851), new THREE.Vector3(0, 1.536, -6.261), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.78, span: [3.5,5.3] }),
          ...rowFlap(WR, 0.6, 3.45, 0.74),
          
          ...[1, -1].flatMap((s) => [[1.91,0.2],[2.15,0.2],[2.39,0.2]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          tag(new THREE.SphereGeometry(1, sg(10), sg(6)).scale(0.36, 0.22, 0.07).translate(0, -0.72, 1.961), 'dark'),
          ...planWing(TR, { xh: 0.62, span: [0.2,1.6], name: 'elevator' }),
          ...hingedFin(H, [[0.427,-5.194],[0.569,-5.408],[1.422,-6.048],[1.536,-6.332]], [[-0.398,-6.332],[-0.356,-6.617],[-0.142,-6.972],[0.427,-7.072],[1.138,-6.83],[1.536,-6.375]], -6.29, 0.13, 0.05),
          ...retractTailWheel(-5.735, -0.754, 0.14, 0.07, -0.427, -5.621),
        ],
        props: [{ z: 2.203, y: 0, r: 1.69, blades: 3 }],
        markZ: -3,
        markR: 0.36,
        soot: [[0.46,0,1.705,2.6]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [5.71, -0.005, -0.635], kind: 'red' },
          { p: [-5.71, -0.005, -0.635], kind: 'green' },
          { p: [0, 0.427, -7.092], kind: 'white' },
        ],
      };
    }
    case 'pe2': {
      // Pe-2, üç görünüş çiziminden (67 piksel/m). Dar, uzun gövde, öne alınmış kokpit ve arkada nişancı; Klimov motorları çene radyatörlü kalın nacellerde. Yuvarlak uçlu iki dikey kuyruk, kanat altında kafes pike frenleri. Takım geriye nacelleye.
      const H = new JetHull([[4.64,0.05,0.09,-0.09,-0.007],[4.15,0.293,0.268,-0.333,-0.056],[3.33,0.479,0.492,-0.521,-0.055],[2.88,0.532,0.448,-0.561,-0.097],[1.61,0.669,0.471,-0.672,-0.146],[1.01,0.664,0.627,-0.683,-0.081],[-2.27,0.595,0.514,-0.746,-0.166],[-3.31,0.493,0.478,-0.668,-0.141],[-4.66,0.36,0.373,-0.567,-0.134],[-6,0.147,0.269,-0.395,-0.089],[-6.82,0.05,0.119,-0.299,-0.107]] as JetSec[], 2.3, true, 2.1);
      const WR = [[0.7,-0.47,1.581,3.553,0.48],[0.9,-0.45,1.536,3.388,0.46],[2.9,-0.25,1.312,2.911,0.37],[5,-0.04,1.043,2.194,0.26],[7,0.16,0.79,1.493,0.15],[8,0.26,0.64,1.089,0.09],[8.38,0.298,0.416,0.597,0.05],[8.58,0.318,0.148,0.06,0.012]] as WingRow[];
      const TR = [[0.08,0.179,-5.599,2.343,0.13],[0.15,0.179,-5.628,2.314,0.13],[1.5,0.179,-5.852,2.015,0.13],[2.4,0.179,-6.151,1.462,0.13],[2.55,0.179,-6.599,0.82,0.13]] as WingRow[];
      const NR = [[3.222,0.38,0,-1,-0.55],[1.984,0.65,0.07,-1.22,-0.55],[0.118,0.55,-0.05,-1.22,-0.6],[-1.524,0.3,-0.3,-1.1,-0.65],[-2.419,0.04,-0.62,-0.8,-0.7]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, 0, 0),
        tag(pod.disc(3.222, 1, 12).translate(s * x, 0, 0), 'dark'),
        spinnerRows([[3.924,0],[3.625,0.18],[3.193,0.3]], -0.52, s * x),
        ...[],
        ...Array.from({ length: 6 }, (_, i) => tag(new THREE.CylinderGeometry(0.035, 0.05, 0.13, sg(5)).rotateZ(-s * Math.PI / 2).rotateY(s * 0.55).translate(s * (x + 0.38 + 0.02), -0.3, 3.028 - i * 0.17), 'dark')),
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(H.patch(1, 2.929, 1.237, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7, 0.006), 'dark'),
          ...jetCanopy({ screen: [[3.327,0.226,0.493,0.33,0.452],[2.879,0.3648,0.94,0.33,0.72]], glass: [[2.879,0.3648,0.94,0.33,0.72],[2.655,0.38,0.97,0.33,0.736],[1.685,0.4,0.97,0.33,0.736],[1.237,0.25,0.672,0.33,0.572]], aft: [[1.277,0.23,0.662,0.33,0.572],[1.097,0.15,0.642,0.33,0.572]], frames: [2.879,2.655,2.282,1.909,1.536], posts: [[0.203,0.453,3.327],[0.336,0.91,2.879]], pilot: { z: 2.431, len: 1.35, h: 0.36, y: 0.51, w: 0.3 }, p: 3, rails: [1.2] }),
          ...podAt(2.33),
          ...planWing(WR, { xh: 0.76, span: [4.8,7.6] }),
          ...rowFlap(WR, 0.7, 4.7, 0.76),
          ...[1, -1].flatMap((s) => joint(s > 0 ? 'airbrakeL' : 'airbrakeR', [s * 5.0, -0.19, 0.5], [tag(new THREE.BoxGeometry(2.4, 0.03, 0.26).translate(s * 5.0, -0.19, 0.38), 'dark')], false, [s, 0, 0])),
          tag(rod(new THREE.Vector3(0, 0.746, 1.237), new THREE.Vector3(0, 0.776, 0.491), 0.016, 5), 'dark'),
          ...[0.1, -0.1].map((x) => tag(rod(new THREE.Vector3(x, 0.075, 4.297), new THREE.Vector3(x, 0, 4.655), 0.015, 5), 'dark')),
          mastRod(0.896, 2.879, 1.716, 2.879, 0.012),
          ...planWing(TR, { xh: 0.6, span: [0.15,2.3], name: 'elevator' }),
          ...hingedFin(H, [[-0.373,-6.599],[0.299,-6.046],[0.821,-6.225],[1.373,-6.822]], [[-0.373,-6.897],[0.149,-7.494],[0.746,-7.569],[1.194,-7.27],[1.373,-6.897]], -6.822, 0.12, 0.05, 2.55, 'rudder'),
          ...hingedFin(H, [[-0.373,-6.599],[0.299,-6.046],[0.821,-6.225],[1.373,-6.822]], [[-0.373,-6.897],[0.149,-7.494],[0.746,-7.569],[1.194,-7.27],[1.373,-6.897]], -6.822, 0.12, 0.05, -2.55, 'rudderR'),
          ...fixedTailWheel(-5.449, -0.94, 0.24, 0.11, -0.328, -5.255),
          
        ],
        props: [{ z: 3.476, x: 2.33, y: -0.52, r: 1.55, blades: 3 }, { z: 3.476, x: -2.33, y: -0.52, r: 1.55, blades: 3 }],
        markZ: -2.9,
        markR: 0.44,
        soot: [[3,-0.3,2.5,2.8]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [8.6, 0.318, 0.118], kind: 'red' },
          { p: [-8.6, 0.318, 0.118], kind: 'green' },
          { p: [0,0.1,-6.867], kind: 'white' },
        ],
      };
    }
    case 'yak3': {
      // Yak-3, üç görünüş silüetinden (34 piksel/m; ayrıntılar fotoğraflardan bilinen düzen). Çok küçük ve temiz: ince sıra
      // motor burnu, alçak damla kapak, kanat altında tek orta radyatör, kısa uçlu ahşap kanat. Takım içe, kuyruk tekeri
      // toplanır. Göbekten top, burun üstünde iki makineli tüfek.
      const H = new JetHull([[2.39,0.265,0.257,-0.257,-0.021],[1.76,0.331,0.37,-0.513,-0.106],[0.61,0.434,0.457,-0.686,-0.16],[-0.47,0.441,0.486,-0.751,-0.182],[-0.81,0.441,0.486,-0.771,-0.193],[-1.96,0.357,0.486,-0.79,-0.203],[-2.53,0.308,0.414,-0.8,-0.241],[-3.1,0.259,0.343,-0.715,-0.228],[-3.67,0.209,0.257,-0.629,-0.221],[-4.24,0.159,0.171,-0.543,-0.215],[-4.81,0.103,0.115,-0.458,-0.194],[-5.1,0.075,0.086,-0.409,-0.181],[-5.33,0.053,0.086,-0.371,-0.161]] as JetSec[], 2.4, true, 2.1);
      const WR = [[0.45,-0.42,0.524,2.177,0.34],[0.6,-0.404,0.494,2.059,0.32],[2,-0.257,0.259,1.53,0.24],[3.5,-0.099,0.024,1.059,0.15],[4.2,-0.026,-0.153,0.823,0.1],[4.5,0.006,-0.329,0.5,0.06],[4.6,0.016,-0.535,0.089,0.02]] as WingRow[];
      const TR = [[0.08,0.229,-4.418,1.058,0.088],[0.7,0.229,-4.447,1,0.074],[1.25,0.229,-4.594,0.735,0.061],[1.5,0.229,-4.8,0.353,0.056],[1.57,0.229,-4.947,0.088,0.054]] as WingRow[];
      const rad = new JetHull([[0.15, 0.22, -0.5, -0.72, -0.6], [0.0, 0.3, -0.5, -0.84, -0.66], [-0.75, 0.3, -0.5, -0.88, -0.66], [-1.25, 0.27, -0.5, -0.76, -0.62], [-1.75, 0.12, -0.5, -0.56, -0.52]], 3, false);
      const duct = new JetHull([[0.15, 0.18, -0.54, -0.7, -0.6], [-0.15, 0.17, -0.55, -0.68, -0.6]], 2.4, false);
      return {
        solids: [
          H.geo(14, [true, true]),
          spinnerRows([[2.7, 0], [2.55, 0.11], [2.33, 0.22], [2.1, 0.26]], 0),
          ...stubRow(H, 6, 1.55, 0.14, 0.05, 0.033),
          ...[1, -1].map((s) => tag(new THREE.BoxGeometry(0.035, 0.03, 0.55).translate(s * 0.1, H.topY(1.35, 0.1) + 0.006, 1.35), 'dark')),
          tag(H.patch(1, -0.32, -1.65, Math.PI / 2 - 0.72, Math.PI / 2 + 0.72, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[-0.471, 0.16, 0.51, 0.18, 0.34], [-0.55, 0.26, 0.75, 0.18, 0.44]],
            glass: [[-0.55, 0.26, 0.75, 0.18, 0.44], [-0.9, 0.28, 0.77, 0.18, 0.44], [-1.3, 0.26, 0.74, 0.18, 0.44], [-1.75, 0.15, 0.53, 0.18, 0.38]],
            aft: [[-1.7, 0.14, 0.54, 0.2, 0.38], [-1.95, 0.04, 0.46, 0.2, 0.36]],
            frames: [-0.56, -1.27],
            posts: [[0.15, 0.42, -0.471], [0.24, 0.72, -0.55]],
            pilot: { z: -1.1, len: 1.3, h: 0.34, y: 0.33, w: 0.27 },
          }),
          ...planWing(WR, { xh: 0.76, span: [2.55, 4.2] }),
          ...rowFlap(WR, 0.55, 2.5, 0.76),
          underPaint(rad.geo(12)),
          tag(duct.geo(8), 'dark'),
          tag(duct.disc(-0.15, 1, 8), 'dark'),
          ...planWing(TR, { xh: 0.6, span: [0.08, 1.35], name: 'elevator' }),
          ...hingedFin(H, [[0.229,-3.9],[0.429,-4.3],[0.914,-4.671],[1.229,-4.957]], [[-0.343,-5.186],[0,-5.643],[0.571,-5.757],[1,-5.529],[1.286,-5.1]], -5.043, 0.1, 0.04),
          ...retractTailWheel(-4.871, -0.617, 0.13, 0.07, -0.4, -4.671),
        ],
        props: [{ z: 2.3, y: 0, r: 1.42, blades: 3 }],
        markZ: -2.6,
        markR: 0.4,
        soot: [[0.38, 0.05, 1.0, 2.2]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [4.61, 0.016182576352557265, -0.594], kind: 'red' },
          { p: [-4.61, 0.016182576352557265, -0.594], kind: 'green' },
          { p: [0, 0.429, -5.786], kind: 'white' },
        ],
      };
    }
    case 'la7': {
      // La-7, üç görünüş çiziminden (111,7 piksel/m). ASh-82 yıldız motoru dar kaportada, kısa gövde, kabarık arka bölümlü kapak, ahşap kanat. Karında arka radyatör, takım içe, kuyruk tekeri toplanır.
      const H = new JetHull([[2.18,0.502,0.421,-0.474,-0.062],[1.73,0.627,0.618,-0.636,-0.059],[0.75,0.615,0.618,-0.636,-0.059],[-0.37,0.555,0.618,-0.636,-0.059],[-1.22,0.487,0.618,-0.636,-0.059],[-1.58,0.458,0.618,-0.615,-0.048],[-2.48,0.389,0.734,-0.563,0.034],[-4.26,0.202,0.716,-0.225,0.208],[-5.23,0.057,0.467,-0.027,0.2]] as JetSec[], 2.3, true, 2.1);
      const WR = [[0.41,-0.42,0.82,2.757,0.42],[0.73,-0.395,0.748,2.462,0.38],[0.99,-0.374,0.766,2.435,0.36],[1.71,-0.318,0.569,2.059,0.3],[3.05,-0.212,0.435,1.567,0.2],[4.13,-0.127,0.319,1.093,0.12],[4.49,-0.099,0.283,0.922,0.09],[4.75,-0.078,0.211,0.671,0.06],[4.89,-0.067,-0.057,0.135,0.015]] as WingRow[];
      const TR = [[0.08,0.421,-4.086,1.504,0.098],[0.15,0.421,-4.131,1.459,0.096],[0.7,0.421,-4.498,1.092,0.084],[1.2,0.421,-4.713,0.85,0.072],[1.55,0.421,-4.874,0.51,0.064],[1.7,0.421,-5.053,0.107,0.06]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(2.18, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[2.18, 0.452, 0.371, -0.424, -0.062], [2.08, 0.442, 0.361, -0.414, -0.062]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.261, 0.261, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, -0.026, 2.08),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.328;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, -0.026 + Math.sin(a) * r, 2.09), 'dark');
          }),
          spinnerRows([[2.7,0],[2.45,0.15],[2.2,0.24],[2.18,0.25]], 0),
          ...stubRow(H, 4, 1.554, 0.14, -0.45, 0.045),
          tag(H.patch(1, -0.661, -2.475, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.371,0.214,0.618,0.34,0.519],[-0.711,0.34559999999999996,0.904,0.34,0.704]], glass: [[-0.711,0.34559999999999996,0.904,0.34,0.704],[-0.863,0.36,0.904,0.34,0.704],[-1.49,0.37,0.904,0.34,0.704],[-2.027,0.27,0.824,0.34,0.66],[-2.475,0.08,0.734,0.34,0.611]], aft: [[-2.435,0.074,0.724,0.34,0.611],[-2.615,0.048,0.704,0.34,0.611]], frames: [-0.711,-0.908,-1.535], posts: [[0.193,0.578,-0.371],[0.318,0.874,-0.711]], pilot: { z: -1.15, len: 1.35, h: 0.36, y: 0.52, w: 0.3 }, p: 2.8, rails: [1.2] }),
          mastRod(0.75, -2.385, 1.15, -2.385, 0.012),
          
          ...planWing(WR, { xh: 0.75, span: [3.05,4.7] }),
          ...rowFlap(WR, 0.5, 3, 0.75),
          
          
          underPaint(new JetHull([[-1.382, 0.16, -0.6, -0.68, -0.64], [-1.579, 0.27, -0.6, -0.76, -0.66], [-2.116, 0.26, -0.56, -0.72, -0.62], [-2.403, 0.12, -0.52, -0.6, -0.56]], 3, false).geo(10)),
          tag(new THREE.BoxGeometry(0.34, 0.06, 0.02).translate(0, -0.67, -1.418), 'dark'),
          ...planWing(TR, { xh: 0.62, span: [0.15,1.55], name: 'elevator' }),
          ...hingedFin(H, [[0.618,-3.997],[0.716,-4.22],[1.003,-4.623],[1.316,-4.981],[1.495,-5.205]], [[-0.027,-5.232],[-0.009,-5.608],[0.242,-5.921],[0.51,-5.984],[1.047,-5.832],[1.406,-5.563],[1.54,-5.295]], -5.223, 0.11, 0.05),
          ...retractTailWheel(-4.757, -0.385, 0.15, 0.08, -0.161, -4.534),
        ],
        props: [{ z: 2.288, y: 0, r: 1.55, blades: 3 }],
        markZ: -2.75,
        markR: 0.34,
        soot: [[0.55,-0.45,1.2,2.2]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [4.91, -0.067, -0.124], kind: 'red' },
          { p: [-4.91, -0.067, -0.124], kind: 'green' },
          { p: [0, 0.51, -6.004], kind: 'white' },
        ],
      };
    }
    case 'p38': {
      // P-38J Lightning, üç görünüş çiziminden (64 piksel/m). Ortada silahlı kısa gövde, iki yanda Allison motorlu uzun kirişler; aralarında yatay kuyruk, uçlarda oval dikey kuyruklar. Kirişlerin yanlarında radyatör yanakları. Burun tekerlekli takım.
      const H = new JetHull([[4.49,0.1,0.186,-0.202,-0.024],[3.72,0.365,0.494,-0.509,-0.048],[2.18,0.48,0.64,-0.617,-0.038],[0.63,0.48,0.648,-0.616,-0.035],[-0.29,0.398,0.494,-0.393,0.015],[-1.47,0.03,0.062,-0.046,0.004]] as JetSec[], 2.3, true, 2.1);
      const WR = [[0.3,-0.011,1.581,3.034,0.56],[0.4,0,1.503,2.956,0.54],[2,0.176,1.392,2.405,0.48],[3,0.286,1.235,2.138,0.4],[5,0.506,1.078,1.62,0.26],[6.9,0.715,0.921,1.069,0.14],[7.4,0.77,0.764,0.677,0.09],[7.72,0.805,0.559,0.157,0.04],[7.92,0.827,0.512,0.063,0.012]] as WingRow[];
      const TR = [[0,0.386,-5.667,1.132,0.13],[3.2,0.386,-5.746,0.975,0.13],[3.35,0.386,-5.966,0.55,0.13],[3.4,0.386,-6.155,0.157,0.13]] as WingRow[];
      const NR = [[2.839,0.3,0.3,-0.3,0],[2.053,0.42,0.56,-0.58,0],[0.952,0.5,0.65,-0.8,-0.04],[-0.62,0.47,0.68,-0.72,-0.02],[-3.765,0.33,0.5,-0.34,0.06],[-5.337,0.2,0.36,-0.16,0.1],[-6.595,0.1,0.28,-0.04,0.12],[-7.035,0.02,0.2,0.04,0.12]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, 0, 0),
        tag(pod.disc(2.839, 1, 12).translate(s * x, 0, 0), 'dark'),
        spinnerRows([[3.499,0],[3.232,0.19],[2.682,0.32]], 0, s * x),
        ...[],
        ...[],
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(H.patch(1, 1.456, 0.449, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7, 0.006), 'dark'),
          ...jetCanopy({ screen: [[2.1,0.208,0.648,0.6,0.664],[1.406,0.33599999999999997,1.08,0.6,0.918]], glass: [[1.406,0.33599999999999997,1.08,0.6,0.918],[1.174,0.35,1.111,0.6,0.935],[0.634,0.36,1.034,0.6,0.893],[0.449,0.25,0.88,0.6,0.808]], aft: [[0.489,0.23,0.87,0.6,0.808],[0.309,0.15,0.85,0.6,0.808]], frames: [1.406], posts: [[0.187,0.608,2.1],[0.309,1.05,1.406]], pilot: { z: 1.02, len: 1.35, h: 0.36, y: 0.78, w: 0.3 }, p: 2.2 }),
          ...podAt(2.48),
          ...planWing(WR, { xh: 0.78, span: [4.2,6.9] }),
          ...rowFlap(WR, 0.5, 4.15, 0.76),
          // Kiriş yanaklarında radyatörler
          ...[2.48, -2.48].flatMap((x) => [1, -1].map((s) => underPaint(body([[-3.608, 0.03], [-2.979, 0.13], [-2.35, 0.11]].reverse() as [number, number][], 8, { x: x + s * 0.38, y: 0.05, sy: 1.1, smooth: true })))),
          // Burun silahları
          ...[[0.08, 0.4], [-0.08, 0.4], [0.2, 0.34], [-0.2, 0.34], [0, 0.26]].map(([x, y]) => tag(rod(new THREE.Vector3(x, y, 3.94), new THREE.Vector3(x, y, 4.474), 0.016, 5), 'dark')),
          ...planWing(TR, { xh: 0.6, span: [0,3.2], name: 'elevator' }),
          ...hingedFin(H, [[-0.355,-6.002],[0.34,-5.462],[1.111,-5.616],[1.574,-5.925],[1.775,-6.31]], [[-0.432,-6.156],[0.185,-6.897],[0.494,-6.928],[1.111,-6.773],[1.574,-6.619],[1.775,-6.341]], -6.156, 0.12, 0.05, 2.48, 'rudder'),
          ...hingedFin(H, [[-0.355,-6.002],[0.34,-5.462],[1.111,-5.616],[1.574,-5.925],[1.775,-6.31]], [[-0.432,-6.156],[0.185,-6.897],[0.494,-6.928],[1.111,-6.773],[1.574,-6.619],[1.775,-6.341]], -6.156, 0.12, 0.05, -2.48, 'rudderR'),
          
          ...noseWheel(-0.72, 3.15, -1.56, 3.35, 0.31, 0.14),
        ],
        props: [{ z: 2.918, x: 2.48, y: 0, r: 1.6, blades: 3 }, { z: 2.918, x: -2.48, y: 0, r: 1.6, blades: 3 }],
        markZ: -3.8,
        markR: 0.3,
        soot: [[2.9,0.1,2,2.8]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [7.94, 0.827, 0.481], kind: 'red' },
          { p: [-7.94, 0.827, 0.481], kind: 'green' },
          { p: [0,0.4,-1.5], kind: 'white' },
        ],
      };
    }
    case 'f6f': {
      // F6F-5 Hellcat, üç görünüş çiziminden (81 piksel/m). İri gövde, yüksek kapak ve ilerisinde derin kaporta; altında yağ soğutucu. Geniş, düz kenarlı kanat, takım geriye toplanır.
      const H = new JetHull([[2.31,0.654,0.457,-0.469,-0.043],[0.95,0.802,0.889,-1.025,-0.145],[-0.35,0.72,1.012,-0.993,-0.07],[-1.71,0.651,1.013,-0.956,-0.05],[-2.26,0.623,1.111,-0.941,0.003],[-4.48,0.374,0.581,-0.745,-0.135],[-5.22,0.234,0.519,-0.677,-0.127],[-7.08,0.025,0.272,-0.469,-0.128]] as JetSec[], 2.3, true, 2);
      const WR = [[0.7,-0.62,0.702,3.086,0.58],[2,-0.458,0.579,2.654,0.46],[4,-0.208,0.394,2.099,0.3],[6,0.042,0.246,1.667,0.15],[6.3,0.08,0.209,1.605,0.11],[6.45,0.099,0.06,1.358,0.07],[6.53,0.109,-0.223,0.741,0.015]] as WingRow[];
      const TR = [[0.08,0.185,-5.322,1.778,0.148],[0.2,0.185,-5.347,1.728,0.146],[1.5,0.185,-5.656,1.321,0.119],[2.5,0.185,-5.927,1.05,0.098],[2.8,0.185,-6.088,0.679,0.092],[2.9,0.185,-6.396,0.124,0.09]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(2.31, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[2.31, 0.604, 0.407, -0.419, -0.043], [2.21, 0.594, 0.397, -0.409, -0.043]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.283, 0.283, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, -0.006, 2.21),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.356;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, -0.006 + Math.sin(a) * r, 2.22), 'dark');
          }),
          spinnerRows([[2.9,0],[2.78,0.14],[2.55,0.18],[2.32,0.19]], 0),
          ...stubRow(H, 3, 0.826, 0.2, -0.55, 0.06),
          tag(H.patch(1, -0.704, -1.705, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.347,0.202,1.012,0.76,0.926],[-0.754,0.3264,1.358,0.76,1.143]], glass: [[-0.754,0.3264,1.358,0.76,1.143],[-0.964,0.34,1.42,0.76,1.177],[-1.495,0.35,1.383,0.76,1.157],[-1.705,0.2,1.074,0.76,0.987]], aft: [[-1.665,0.184,1.064,0.76,0.987],[-1.845,0.12,1.044,0.76,0.987]], frames: [-0.754,-1.088,-1.458], posts: [[0.182,0.972,-0.347],[0.3,1.328,-0.754]], pilot: { z: -1.4, len: 1.35, h: 0.36, y: 0.94, w: 0.3 }, p: 3.2, rails: [1.2] }),
          mastRod(1.012, -2.075, 1.753, -2.112, 0.012),
          tag(rod(new THREE.Vector3(0, 1.753, -2.112), new THREE.Vector3(0, 1.877, -6.396), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.8, span: [4.3,6.2] }),
          ...rowFlap(WR, 0.7, 4.2, 0.78),
          ...[1, -1].flatMap((s) => [2.25,2.5,2.75].map((x: number) => {
            const q = rowAt(WR, x);
            return tag(new THREE.SphereGeometry(1, sg(4), sg(3)).scale(0.022, 0.022, 0.04).translate(s * x, q[1] + 0.012, q[2] - 0.005), 'dark');
          })),
          
          underPaint(new JetHull([[1.69, 0.16, -0.72, -0.86, -0.78], [1.381, 0.22, -0.72, -0.92, -0.8], [0.702, 0.2, -0.78, -0.92, -0.84]], 2.8, false).geo(10)),
          ...planWing(TR, { xh: 0.55, span: [0.2,2.6], name: 'elevator' }),
          ...hingedFin(H, [[0.086,-5.347],[0.642,-5.47],[0.704,-5.619],[1.691,-6.088],[1.852,-6.396]], [[-0.593,-6.705],[-0.469,-7.075],[-0.099,-7.174],[1.63,-6.977],[1.852,-6.767]], -6.643, 0.15, 0.06),
          ...retractTailWheel(-5.865, -0.938, 0.12, 0.07, -0.531, -5.779),
        ],
        props: [{ z: 2.431, y: 0, r: 1.98, blades: 3 }],
        markZ: -3.1,
        markR: 0.42,
        soot: [[0.62,-0.55,0.9,2.4]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [6.55, 0.109, -0.594], kind: 'red' },
          { p: [-6.55, 0.109, -0.594], kind: 'green' },
          { p: [0, -0.099, -7.194], kind: 'white' },
        ],
      };
    }
    case 'lancaster': {
      // Lancaster B Mk III, üç görünüş çiziminden (28,5 piksel/m). Düz yanlı derin gövde, geniş kapak ve önünde burun tareti, sırtta orta taret, kuyrukta dört tüfekli taret. Çene radyatörlü dört Merlin motoru, oval iki dikey kuyruk. Takım geriye nacelleye, kuyruk tekeri sabit.
      const H = new JetHull([[9.43,0.75,0.772,-1.228,-0.308],[8.55,0.797,1.053,-1.283,-0.208],[6.62,0.9,1.088,-1.404,-0.258],[4.69,0.895,1.123,-1.388,-0.233],[-1.8,0.88,0.891,-1.333,-0.31],[-7.06,0.55,0.702,-0.702,-0.056],[-10.22,0.2,0.07,-0.07,-0.006]] as JetSec[], 2.7, true, 2.3);
      const WR = [[1,-0.2,6.269,5.965,1.15],[4,0.115,5.989,5.158,1],[8,0.535,5.217,3.685,0.62],[12,0.955,4.515,2.456,0.38],[14.9,1.26,3.989,1.404,0.2],[15.4,1.312,3.462,0.421,0.08],[15.55,1.328,3.287,0.105,0.02]] as WingRow[];
      const TR = [[0.3,0.772,-5.941,2.702,0.16],[2.5,0.772,-6.187,2.281,0.16],[4.2,0.772,-6.538,1.579,0.16],[5.05,0.772,-7.239,0.351,0.16]] as WingRow[];
      const NR = [[7.497,0.32,0.32,-0.45,-0.05],[6.445,0.55,0.5,-0.82,-0.12],[3.462,0.58,0.48,-0.85,-0.15],[0.48,0.25,0.25,-0.55,-0.15],[-0.397,0.04,0.05,-0.25,-0.1]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number, dy: number, dz: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, dy, dz),
        tag(pod.disc(7.497, 1, 12).translate(s * x, dy, dz + 0), 'dark'),
        spinnerRows([[8.445,0],[8.024,0.2],[7.322,0.34]], 0, s * x).translate(0, dy, dz),
        ...[],
        ...Array.from({ length: 6 }, (_, i) => tag(new THREE.CylinderGeometry(0.035, 0.05, 0.13, sg(5)).rotateZ(-s * Math.PI / 2).rotateY(s * 0.55).translate(s * (x + 0.55 + 0.02), 0.1 + dy, 6.445 + dz - i * 0.2), 'dark')),
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(H.patch(1, 8.004, 4.69, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7, 0.006), 'dark'),
          ...jetCanopy({ screen: [[8.55,0.298,1.053,0.63,0.881],[7.954,0.48,1.404,0.63,1.11]], glass: [[7.954,0.48,1.404,0.63,1.11],[7.497,0.5,1.474,0.63,1.148],[5.568,0.5,1.404,0.63,1.11],[4.69,0.28,1.123,0.63,0.955]], aft: [[4.73,0.258,1.113,0.63,0.955],[4.55,0.168,1.093,0.63,0.955]], frames: [7.954,6.796,5.918], posts: [[0.268,1.013,8.55],[0.442,1.374,7.954]], pilot: { z: 7.146, len: 1.35, h: 0.36, y: 0.81, w: 0.3 }, p: 3, rails: [1.1] }),
          ...podAt(3.7, 0, 0),
          ...podAt(8, 0.25, 0.1),
          ...planWing(WR, { xh: 0.76, span: [8.5,14.7] }),
          ...rowFlap(WR, 1.2, 8.2, 0.76),
          ...noseGlass([[10.48,0.03,-0.351,-0.702,-0.526],[10.199,0.42,0.07,-1.053,-0.526],[9.427,0.75,0.772,-1.228,-0.281]] as JetSec[], [10.48, 10.199, 9.427], [9.778]),
          tag(H.disc(9.43, 1, 14), 'dark'),
          ...turretDome(0.702, 9.497, 0.45, 0.85, [0, 0.772, 10.655], 0.08),
          ...turretDome(0.842, -3.029, 0.52, 0.72, [0, 1.193, -4.432], 0.08),
          ...turretDome(0.175, -9.59, 0.5, 0.95, [0, 0.175, -10.854], 0.14),
          ...[1, -1].flatMap((s) => [-0.046, -1.275, -2.503].map((z) => tag(H.patch(s, z, z - 0.3, 0.45, 0.62, 0.006), 'dark'))),
          ...planWing(TR, { xh: 0.62, span: [0.3,4.3], name: 'elevator' }),
          ...hingedFin(H, [[-1.579,-6.994],[0,-6.959],[1.404,-7.134],[2.456,-7.59],[2.632,-7.941]], [[-1.614,-7.941],[-0.351,-8.713],[1.404,-8.713],[2.351,-8.292],[2.632,-7.941]], -7.941, 0.18, 0.06, 5, 'rudder'),
          ...hingedFin(H, [[-1.579,-6.994],[0,-6.959],[1.404,-7.134],[2.456,-7.59],[2.632,-7.941]], [[-1.614,-7.941],[-0.351,-8.713],[1.404,-8.713],[2.351,-8.292],[2.632,-7.941]], -7.941, 0.18, 0.06, -5, 'rudderR'),
          ...fixedTailWheel(-7.59, -1.263, 0.26, 0.14, -0.526, -7.064),
          
        ],
        props: [{ z: 7.848, x: 3.7, y: 0, r: 1.98, blades: 3 }, { z: 7.848, x: -3.7, y: 0, r: 1.98, blades: 3 }, { z: 7.948, x: 8, y: 0.25, r: 1.98, blades: 3 }, { z: 7.948, x: -8, y: 0.25, r: 1.98, blades: 3 }],
        markZ: -3,
        markR: 0.68,
        soot: [[4.3,0.1,4.5,3.5]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [15.57, 1.328, 3.234], kind: 'red' },
          { p: [-15.57, 1.328, 3.234], kind: 'green' },
          { p: [0,0.351,-10.503], kind: 'white' },
        ],
      };
    }
    case 'mosquito': {
      // Mosquito FB, üç görünüş çiziminden (64 piksel/m). Ahşap, pürüzsüz, ince gövde; kapak iki kişilik yan yana, Merlin motorları uzun sivri nacellerde. Kanat hücum kenarının iç kısmında radyatör ağızları, burunda dört tüfek. Takım geriye nacelleye, kuyruk tekeri toplanır.
      const H = new JetHull([[4.75,0.201,0.157,-0.158,-0.013],[4.21,0.421,0.358,-0.544,-0.129],[3.11,0.663,0.5,-0.788,-0.196],[1,0.7,0.705,-0.764,-0.088],[-0.79,0.644,0.875,-0.625,0.065],[-4.7,0.336,0.834,-0.156,0.3],[-5.33,0.264,0.828,-0.054,0.351],[-6.34,0.149,0.736,0.109,0.397],[-7.04,0.051,0.672,0.312,0.478]] as JetSec[], 2.3, true, 2.1);
      const WR = [[0.6,-0.211,2.722,4.531,0.66],[0.75,-0.2,2.644,4.25,0.62],[3.1,-0.024,2.175,3.047,0.5],[6,0.194,2.05,2.063,0.27],[7.7,0.321,1.925,1.344,0.13],[8,0.344,1.784,0.859,0.08],[8.25,0.362,1.425,0.063,0.012]] as WingRow[];
      const TR = [[0.1,0.547,-5.825,1.719,0.138],[0.2,0.547,-5.872,1.641,0.136],[1.5,0.547,-6.028,1.485,0.114],[2.5,0.547,-6.341,1.093,0.096],[3,0.547,-6.653,0.625,0.087],[3.18,0.547,-6.966,0.078,0.084]] as WingRow[];
      const NR = [[3.941,0.3,0.3,-0.35,-0.03],[3.112,0.42,0.42,-0.75,-0.14],[1.55,0.43,0.55,-0.85,-0.14],[0.144,0.35,0.35,-0.78,-0.2],[-1.263,0.04,-0.1,-0.4,-0.24]] as JetSec[];
      const pod = new JetHull(NR, 2.2);
      const podAt = (x: number): Geo[] => [1, -1].flatMap((s) => [
        pod.geo(12, [false, true]).translate(s * x, 0, 0),
        tag(pod.disc(3.941, 1, 12).translate(s * x, 0, 0), 'dark'),
        spinnerRows([[4.644,0],[4.362,0.17],[3.894,0.3]], 0, s * x),
        ...[],
        ...Array.from({ length: 6 }, (_, i) => tag(new THREE.CylinderGeometry(0.035, 0.05, 0.13, sg(5)).rotateZ(-s * Math.PI / 2).rotateY(s * 0.55).translate(s * (x + 0.45 + 0.02), 0, 3.503 - i * 0.19), 'dark')),
      ]);
      return {
        solids: [
          H.geo(14, [true, true]),
          tag(H.patch(1, 2.694, 1.003, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7, 0.006), 'dark'),
          ...jetCanopy({ screen: [[3.112,0.25,0.5,0.5,0.54],[2.644,0.40319999999999995,1.016,0.5,0.838]], glass: [[2.644,0.40319999999999995,1.016,0.5,0.838],[2.409,0.42,1.047,0.5,0.855],[1.394,0.42,0.984,0.5,0.82],[1.003,0.25,0.891,0.5,0.769]], aft: [[1.043,0.23,0.881,0.5,0.769],[0.863,0.15,0.861,0.5,0.769]], frames: [2.644,2.253,1.862,1.394], posts: [[0.225,0.46,3.112],[0.371,0.986,2.644]], pilot: { z: 2.019, len: 1.35, h: 0.36, y: 0.68, w: 0.3 }, p: 2.8, rails: [1.1] }),
          ...podAt(2.45),
          ...planWing(WR, { xh: 0.8, span: [4.8,7.4] }),
          ...rowFlap(WR, 0.7, 4.7, 0.78),
          mastRod(0.891, -0.169, 1.844, -0.169, 0.014),
          ...[1, -1].map((s) => tag(new THREE.BoxGeometry(1.05, 0.14, 0.03).translate(s * 1.35, -0.125, rowAt(WR, 1.35)[2] - 0.015), 'dark')),
          ...[0.1, -0.1, 0.24, -0.24].map((x) => tag(rod(new THREE.Vector3(x, 0.234, 4.519), new THREE.Vector3(x, 0.125, 4.737), 0.014, 5), 'dark')),
          ...planWing(TR, { xh: 0.62, span: [0.2,2.8], name: 'elevator' }),
          ...hingedFin(H, [[0.625,-5.013],[0.859,-5.403],[1.953,-5.716],[2.5,-6.028],[2.922,-6.342]], [[0.672,-6.497],[0.672,-7.122],[0.781,-7.044],[1.797,-7.013],[2.422,-6.809],[2.922,-6.402]], -6.372, 0.14, 0.05),
          ...retractTailWheel(-6.653, -0.156, 0.17, 0.09, 0.156, -6.419),
          
        ],
        props: [{ z: 4.284, x: 2.45, y: 0, r: 1.75, blades: 3 }, { z: 4.284, x: -2.45, y: 0, r: 1.75, blades: 3 }],
        markZ: -3.1,
        markR: 0.42,
        soot: [[2.9,0,2.7,3]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [8.27, 0.362, 1.393], kind: 'red' },
          { p: [-8.27, 0.362, 1.393], kind: 'green' },
          { p: [0,1.5,-7.075], kind: 'white' },
          { p: [3.4,-0.10125000000000003,1.5], kind: 'landing' },
        ],
      };
    }
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
    case 'ar234': {
      // Ar 234 B-2, ölçüler üç görünüş çiziminden. Burun tamamen cam: kokpit gövdenin ön ucu, çerçeveleri ve yanlarda
      // perçinli yatay bant, tepesinde nişan periskopu. Gövde arkaya doğru yükselen ince tüp, omuz kanat dihedralsiz,
      // altında Jumo 004 naselleri. Yatay kuyruk dikey kuyruğun ortasında.
      const FRONT: JetSec[] = [[5.4, 0.01, -0.08, -0.14, -0.11], [5.37, 0.14, 0.04, -0.27, -0.11], [5.25, 0.3, 0.24, -0.44, -0.1], [4.95, 0.5, 0.42, -0.58, -0.09], [4.4, 0.65, 0.53, -0.65, -0.07], [3.39, 0.72, 0.58, -0.66, -0.06]];
      const GL = new JetHull(FRONT, 2.2);
      const H = new JetHull([
        [3.39, 0.72, 0.58, -0.66, -0.06], [0.1, 0.69, 0.66, -0.53, 0.04], [-2.36, 0.58, 0.74, -0.28, 0.2], [-4.83, 0.36, 0.82, -0.03, 0.38], [-6.2, 0.2, 0.66, 0.16, 0.4], [-6.8, 0.1, 0.5, 0.24, 0.38], [-7.5, 0.004, 0.42, 0.38, 0.4],
      ], 2.2);
      const W: WingOpts = { x0: 0.67, z: 1.07, root: 2.5, y: 0.52, tipX: 6.84, tip: 0.91, sweep: 0.85, dihedral: 0, t: 0.33 };
      const T: WingOpts = { x0: 0.12, z: -5.6, root: 1.14, y: 0.95, tipX: 2.32, tip: 0.66, sweep: 0.38, dihedral: 0, t: 0.12 };
      const NX = 1.99;
      const NY = -0.09;
      const nacelle = (sd: number): Geo[] => {
        const o = { x: sd * NX, y: NY };
        return [
          body([[1.85, 0.17], [2.06, 0.2], [2.14, 0.25], [2.1, 0.3], [1.95, 0.37], [1.6, 0.43], [1.0, 0.44], [-0.4, 0.44], [-1.0, 0.41], [-1.45, 0.3], [-1.72, 0.2], [-1.8, 0.17]], 12, { ...o, smooth: true }),
          tag(body([[1.3, 0.14], [1.87, 0.17]], 12, o), 'dark'),
          tag(new THREE.CircleGeometry(0.14, sg(12)).translate(o.x, o.y, 1.3), 'dark'),
          body([[2.02, 0.001], [1.9, 0.06], [1.65, 0.09], [1.3, 0.09]], 8, { ...o, smooth: true }),
          tag(body([[-1.8, 0.16], [-1.3, 0.14]], 12, o), 'dark'),
          tag(body([[-2.0, 0.001], [-1.85, 0.05], [-1.6, 0.09], [-1.3, 0.08]], 8, { ...o, smooth: true }), 'dark'),
        ];
      };
      canopySink.push({ z: 4.0, len: 1.6, h: 0.5, y: 0.12, w: 0.5, bubble: false });
      return {
        solids: [
          tag(GL.geo(14), 'glass'),
          H.geo(14),
          tag(H.disc(3.39, 1, 14), 'dark'),
          ...glassFrames(GL, [5.36, 5.28, 5.1, 4.8, 4.4, 3.9, 3.42], [3.42, 4.35]),
          // Tepedeki periskop
          tag(new THREE.CylinderGeometry(0.035, 0.05, 0.5, sg(6)).translate(0, 0.72, 4.46), 'dark'),
          tag(new THREE.SphereGeometry(0.05, sg(5), sg(3)).scale(1, 1.4, 1).translate(0, 0.99, 4.46), 'dark'),
          // Kanat: gövdeden flap, sonra kanatçık, uç yuvarlak
          ...controlWing(W, 0.78, [[-0.1, 0.56, 'flap'], [0.56, 0.57, null], [0.57, 0.97, 'aileron'], [0.97, 1, null]], 6),
          ...nacelle(1),
          ...nacelle(-1),
          ...controlWing(T, 0.7, [[0, 0.96, 'elevator'], [0.96, 1, null]], 4),
          ...jetFin([[0.6, -4.7, 2.8], [0.82, -4.91, 2.52], [1.3, -5.27, 2.1], [1.9, -5.72, 1.53], [2.4, -6.1, 1.02], [2.68, -6.31, 0.74], [2.78, -6.55, 0.45]], 0.16, 0.77, 1, 4),
          body([[-5.4, 0.01], [-5.6, 0.07], [-6.6, 0.07], [-6.9, 0.01]], 8, { y: 0.95, sy: 0.7, smooth: true }),
        ],
        props: [],
        markZ: -4.0,
        lights: [
          { p: [W.tipX + 0.38, W.y, W.z - W.sweep - W.tip * 0.45], kind: 'red' },
          { p: [-W.tipX - 0.38, W.y, W.z - W.sweep - W.tip * 0.45], kind: 'green' },
          { p: [0, 2.0, -7.26], kind: 'white' },
          { p: [1.2, 0.33, 0.9], kind: 'landing' },
        ],
      };
    }
    case 'il28': {
      // Il-28, boyutlar gerçek ölçülerde, biçim üç görünüş çiziminden. Silindirik gövde, ucunda camlı nişancı burnu,
      // karnında radar kubbesi, önde damla kanopi ve anten direği. Kanat düz hücum kenarlı ve omuzda; altında derin
      // VK-1 naselleri: yuvarlak giriş, ortada göbek ve dikey ayırıcı, altta ana takım bölmesi. Ok açılı kuyruk, arkada
      // pencereli nişancı kabini ve iki 23 mm top.
      const FRONT: JetSec[] = [[9.0, 0.01, -0.03, -0.07, -0.05], [8.95, 0.17, 0.1, -0.2, -0.05], [8.82, 0.42, 0.31, -0.33, -0.03], [8.18, 0.6, 0.54, -0.54, 0], [7.85, 0.67, 0.62, -0.62, 0]];
      const GL = new JetHull(FRONT, 2.2);
      const H = new JetHull([
        [7.85, 0.67, 0.62, -0.62, 0], [6.42, 0.81, 0.82, -0.78, 0.02], [3.32, 0.87, 0.88, -0.88, 0], [-3.44, 0.87, 0.82, -0.88, -0.03], [-5.27, 0.8, 0.8, -0.81, -0.05], [-6.82, 0.56, 1.08, -0.78, -0.1],
        [-8.2, 0.52, 1.14, -0.8, -0.1], [-8.42, 0.48, 0.5, -0.8, -0.14], [-8.6, 0.3, 0.3, -0.56, -0.12], [-8.66, 0.04, 0.0, -0.22, -0.11],
      ], 2.2);
      const Wi: WingOpts = { x0: 0.4, z: 0.93, root: 3.85, y: 0.66, tipX: 3.4, tip: 3.2, sweep: 0, dihedral: 2, t: 0.52 };
      const W: WingOpts = { x0: 3.9, z: 0.93, root: 3.07, y: 0.77, tipX: 10.72, tip: 1.5, sweep: 0, dihedral: 2, t: 0.4 };
      const T: WingOpts = { x0: 0.26, z: -5.55, root: 2.04, y: 1.24, tipX: 3.6, tip: 0.89, sweep: 2.04, dihedral: 6, t: 0.2 };
      const tipY = W.y + (W.tipX - W.x0) * tanD(W.dihedral);
      const NX = 3.21;
      const pod = new JetHull([
        [3.7, 0.38, 0.2, -0.56, -0.18], [4.1, 0.42, 0.24, -0.6, -0.18], [4.17, 0.47, 0.3, -0.66, -0.18], [4.14, 0.52, 0.36, -0.72, -0.18], [3.9, 0.58, 0.46, -0.82, -0.18], [2.97, 0.66, 0.62, -0.92, -0.15],
        [0.93, 0.7, 0.68, -1.28, -0.1], [-0.3, 0.7, 0.64, -1.36, -0.1], [-2.03, 0.6, 0.52, -0.98, -0.1], [-3.6, 0.31, 0.17, -0.47, -0.15], [-3.69, 0.3, 0.16, -0.46, -0.15],
      ], 2.25);
      const duct = new JetHull([[3.1, 0.35, 0.16, -0.52, -0.18], [3.72, 0.375, 0.195, -0.555, -0.18]], 2.1, false);
      const pipe = new JetHull([[-3.68, 0.27, 0.13, -0.43, -0.15], [-3.2, 0.25, 0.11, -0.41, -0.15]], 2.05, false);
      const nacelle = (sd: number): Geo[] => {
        const x = sd * NX;
        return [
          pod.geo(13).translate(x, 0, 0),
          tag(duct.geo(12).translate(x, 0, 0), 'dark'),
          tag(duct.disc(3.1, 1, 12).translate(x, 0, 0), 'dark'),
          body([[4.05, 0.001], [3.9, 0.08], [3.6, 0.17], [3.1, 0.19]], 8, { x, y: -0.18, smooth: true }),
          new THREE.BoxGeometry(0.05, 0.72, 0.5).translate(x, -0.18, 3.4),
          tag(pipe.geo(12).translate(x, 0, 0), 'dark'),
          tag(pipe.disc(-3.2, -1, 12).translate(x, 0, 0), 'dark'),
          tag(new THREE.ConeGeometry(0.12, 0.3, sg(8)).rotateX(-Math.PI / 2).translate(x, -0.15, -3.35), 'dark'),
        ];
      };
      return {
        solids: [
          tag(GL.geo(14), 'glass'),
          H.geo(14),
          tag(H.disc(7.85, 1, 14), 'dark'),
          ...glassFrames(GL, [8.96, 8.84, 8.6, 8.3, 7.87], [7.87, 8.4]),
          ...[1, -1].map((sd) => portAt(sd * H.sideX(7.5, -0.42), -0.42, 7.5, 0.035, 0.16)),
          // Karındaki radar kubbesi
          new THREE.SphereGeometry(1, sg(12), sg(7)).scale(0.56, 0.3, 1.0).translate(0, -0.84, 3.9),
          tag(H.patch(1, 5.75, 4.98, Math.PI / 2 - 0.45, Math.PI / 2 + 0.45, 0.006), 'dark'),
          ...jetCanopy({
            screen: [[6.39, 0.22, 0.85, 0.4, 0.8], [5.83, 0.5, 1.29, 0.4, 0.95]],
            glass: [[5.83, 0.5, 1.29, 0.4, 0.95], [5.44, 0.55, 1.35, 0.4, 1.0], [4.94, 0.52, 1.29, 0.4, 1.0]],
            aft: [[4.96, 0.53, 1.3, 0.4, 1.0], [4.03, 0.38, 1.16, 0.4, 0.98], [3.3, 0.02, 0.89, 0.6, 0.86]],
            frames: [5.83, 4.96],
            posts: [[0.14, 0.86, 6.36], [0.36, 1.24, 5.85]],
            pilot: { z: 5.35, len: 1.6, h: 0.45, y: 0.98, w: 0.5 },
          }),
          // Anten direği ve kuyruğa uzanan tel
          tag(rod(new THREE.Vector3(0, 1.2, 4.62), new THREE.Vector3(0, 1.65, 4.28), 0.018, 4), 'dark'),
          tag(rod(new THREE.Vector3(0, 1.65, 4.28), new THREE.Vector3(0, 2.95, -6.4), 0.006, 3), 'dark'),
          // İç kanat ve dış kanat ayrı flaplı; uç köşeleri yuvarlak
          ...controlWing(Wi, 0.72, [[0, 0.75, 'flap'], [0.75, 1, null]]),
          ...controlWing(W, 0.78, [[-0.1, 0, null], [0, 0.48, 'flapD'], [0.48, 0.49, null], [0.49, 0.97, 'aileron'], [0.97, 1, null]], 1.2),
          ...nacelle(1),
          ...nacelle(-1),
          ...controlWing(T, 0.66, [[0, 0.96, 'elevator'], [0.96, 1, null]], 1),
          ...jetFin([[0.82, -3.58, 4.64], [1.16, -4.42, 3.83], [1.86, -5.06, 3.25], [2.95, -6.35, 2.35], [3.8, -7.38, 1.64], [4.19, -7.87, 1.27], [4.26, -8.16, 0.91]], 0.3, 0.72, 2, 4),
          body([[-4.92, 0.01], [-5.4, 0.1], [-7.6, 0.1], [-8.44, 0.01]], 8, { y: 1.24, sy: 0.8, smooth: true }),
          // Arkadaki nişancı kabini pencereleri ve iki top
          ...[1, -1].flatMap((sd) => [
            tag(H.patch(sd, -7.0, -7.42, 0.55, 1.0, 0.006), 'dark'),
            tag(H.patch(sd, -7.55, -7.97, 0.55, 1.0, 0.006), 'dark'),
            tag(rod(new THREE.Vector3(sd * 0.2, -0.08, -8.4), new THREE.Vector3(sd * 0.2, -0.08, -9.6), 0.03, 6), 'dark'),
          ]),
        ],
        props: [],
        markZ: -3.4,
        lights: [
          { p: [W.tipX + 0.1, tipY, W.z - W.tip * 0.45], kind: 'red' },
          { p: [-W.tipX - 0.1, tipY, W.z - W.tip * 0.45], kind: 'green' },
          { p: [0, 3.0, -8.72], kind: 'white' },
          { p: [2.0, 0.25, 0.6], kind: 'landing' },
        ],
      };
    }
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
    case 'il2m3': {
      // Il-2M3 Şturmovik, üç görünüş çiziminden (79 piksel/m). Zırhlı, sivri burun; üstünde hava girişi ve yanlarda altı egzoz. İki kişilik uzun kapak, arkada nişancının 12,7 mm tüfeği. Geniş, sivrilen kanat, altında takım kaportaları; takım geriye toplanır, tekerleğin yarısı dışarıda kalır.
      const H = new JetHull([[2.54,0.38,0.291,-0.343,-0.051],[1.81,0.519,0.466,-0.657,-0.141],[1.11,0.568,0.633,-0.736,-0.106],[0.67,0.599,0.664,-0.785,-0.119],[-0.34,0.595,0.734,-0.694,-0.037],[-1.86,0.539,0.688,-0.557,0.016],[-2.88,0.506,0.633,-0.546,-0.004],[-4.14,0.506,0.582,-0.532,-0.02],[-5.85,0.338,0.544,-0.361,0.055],[-7.31,0.126,0.353,-0.097,0.11],[-8.45,0.013,0.101,0.076,0.088]] as JetSec[], 2.4, true, 2.2);
      const WR = [[0.42,-0.56,0.858,4.114,0.56],[0.55,-0.55,0.82,3.949,0.54],[1,-0.516,0.795,3.506,0.5],[2.1,-0.434,0.732,3.165,0.42],[4,-0.291,0.263,2.544,0.27],[5.5,-0.179,-0.154,1.962,0.16],[6.4,-0.111,-0.42,1.443,0.1],[7,-0.066,-0.724,0.76,0.05],[7.3,-0.044,-1.104,0.063,0.012]] as WingRow[];
      const TR = [[0.1,0.165,-5.471,2.848,0.148],[0.4,0.165,-5.559,2.697,0.14],[1,0.165,-5.977,2.19,0.126],[1.8,0.165,-6.547,1.392,0.106],[2.3,0.165,-6.927,0.632,0.094],[2.47,0.165,-7.243,0.063,0.09]] as WingRow[];
      return {
        solids: [
          H.geo(14, [true, true]),
          
          spinnerRows([[3.2,0],[3,0.14],[2.75,0.24],[2.56,0.29]], 0),
          ...stubRow(H, 6, 1.997, 0.2, 0.165, 0.04),
          tag(H.patch(1, -0.547, -2.673, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.344,0.208,0.734,0.36,0.587],[-0.597,0.33599999999999997,1.089,0.36,0.815]], glass: [[-0.597,0.33599999999999997,1.089,0.36,0.815],[-0.787,0.35,1.089,0.36,0.815],[-1.42,0.38,1.089,0.36,0.815],[-1.99,0.34,1.025,0.36,0.78],[-2.673,0.3,0.987,0.36,0.759]], aft: [[-2.633,0.276,0.977,0.36,0.759],[-2.813,0.18,0.957,0.36,0.759]], frames: [-0.597,-0.787,-1.382,-1.99,-2.496], posts: [[0.187,0.694,-0.344],[0.309,1.059,-0.597]], pilot: { z: -1.104, len: 1.35, h: 0.36, y: 0.54, w: 0.3 }, p: 3.4, rails: [1.2] }),
          mastRod(0.987, -1.927, 1.392, -1.927, 0.012),
          tag(rod(new THREE.Vector3(0, 1.392, -1.927), new THREE.Vector3(0, 1.899, -7.053), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.74, span: [3.8,6.7] }),
          ...rowFlap(WR, 0.6, 3.75, 0.76),
          
          ...[1, -1].flatMap((s) => [[2.67,0.85],[0.82,0.55]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          underPaint(body([[-1.059, 0.05], [-0.409, 0.27], [0.591, 0.3], [0.991, 0.1]], 10, { x: 1.75, y: -0.82, sy: 0.85, smooth: true })),
          underPaint(body([[-1.059, 0.05], [-0.409, 0.27], [0.591, 0.3], [0.991, 0.1]], 10, { x: -1.75, y: -0.82, sy: 0.85, smooth: true })),
          // Burun üstü hava girişi
          tag(new THREE.BoxGeometry(0.24, 0.07, 0.03).translate(0, 0.228, 2.466), 'dark'),
          tag(rod(new THREE.Vector3(0, 0.759, -2.686), new THREE.Vector3(0, 0.709, -3.509), 0.022, 6), 'dark'),
          ...planWing(TR, { xh: 0.6, span: [0.4,2.2], name: 'elevator' }),
          ...hingedFin(H, [[0.354,-5.408],[0.544,-5.851],[1.873,-6.927],[2.025,-7.243]], [[-0.025,-7.686],[0.076,-8.446],[0.228,-8.319],[1.494,-7.939],[1.937,-7.686],[2.025,-7.306]], -7.243, 0.14, 0.05),
          ...fixedTailWheel(-7.977, -0.304, 0.21, 0.1, 0, -7.876),
        ],
        props: [{ z: 2.668, y: 0, r: 1.8, blades: 3 }],
        markZ: -3.4,
        markR: 0.38,
        soot: [[0.42,0.165,2.124,2.8]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [7.32, -0.044, -1.136], kind: 'red' },
          { p: [-7.32, -0.044, -1.136], kind: 'green' },
          { p: [0, 0.076, -8.466], kind: 'white' },
        ],
      };
    }
    case 'il10': {
      // Il-10, üç görünüş silüetinden (52,6 piksel/m). Il-2 çizgisinde ama temiz ve kısa: zırhlı sivri burun, altı egzoz, iki kişilik kapak, arkada nişancı. Radyatörler gövde içinde, altta ağızlar. Takım geriye dönerek kanat içine girer, kapaklar kapanır.
      const H = new JetHull([[2.59,0.32,0.342,-0.191,0.055],[1.49,0.448,0.552,-0.532,-0.033],[0.54,0.54,0.57,-0.76,-0.148],[-0.41,0.54,0.57,-0.824,-0.183],[-1.74,0.54,0.53,-0.913,-0.249],[-2.31,0.515,0.513,-0.883,-0.241],[-4.59,0.38,0.166,-0.76,-0.334],[-5.36,0.299,0.094,-0.656,-0.311],[-6.69,0.144,-0.072,-0.475,-0.289],[-7.87,0.01,-0.304,-0.342,-0.325]] as JetSec[], 2.4, true, 2.2);
      const WR = [[0.42,-0.556,1.14,3.1,0.52],[0.5,-0.55,1.1,3,0.5],[2,-0.445,0.95,2.7,0.4],[4,-0.305,0.6,2,0.25],[6,-0.165,0.25,1.25,0.12],[6.5,-0.13,0.1,0.95,0.07],[6.7,-0.116,-0.25,0.3,0.015]] as WingRow[];
      const TR = [[0.08,0.152,-4.6,1.32,0.14],[0.2,0.152,-4.6,1.3,0.14],[1.2,0.152,-4.85,1,0.12],[2,0.152,-5.2,0.6,0.09],[2.3,0.152,-5.45,0.25,0.05]] as WingRow[];
      return {
        solids: [
          H.geo(14, [true, true]),
          
          spinnerRows([[3.2,0],[3,0.14],[2.8,0.23],[2.62,0.3]], 0),
          ...stubRow(H, 6, 1.679, 0.2, 0.095, 0.04),
          tag(H.patch(1, -0.894, -2.408, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.412,0.202,0.57,0.33,0.49],[-0.944,0.3264,0.894,0.33,0.694]], glass: [[-0.944,0.3264,0.894,0.33,0.694],[-1.268,0.34,0.894,0.33,0.694],[-2.218,0.34,0.856,0.33,0.673],[-2.408,0.28,0.456,0.33,0.453]], aft: [[-2.368,0.258,0.446,0.33,0.453],[-2.548,0.168,0.426,0.33,0.453]], frames: [-0.944,-1.553,-1.933], posts: [[0.182,0.53,-0.412],[0.3,0.864,-0.944]], pilot: { z: -1.173, len: 1.35, h: 0.36, y: 0.51, w: 0.3 }, p: 3, rails: [1.2] }),
          
          
          ...planWing(WR, { xh: 0.74, span: [3.6,6.2] }),
          ...rowFlap(WR, 0.6, 3.55, 0.76),
          
          ...[1, -1].flatMap((s) => [[2.3,0.45],[2.5,0.3]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          tag(new THREE.BoxGeometry(0.5, 0.06, 0.03).translate(0, -0.92, 0.729), 'dark'),
          tag(rod(new THREE.Vector3(0, 0.437, -2.408), new THREE.Vector3(0, 0.76, -3.112), 0.022, 6), 'dark'),
          ...planWing(TR, { xh: 0.6, span: [0.2,2.1], name: 'elevator' }),
          ...hingedFin(H, [[0,-4.975],[0.095,-5.355],[1.426,-6.401],[1.521,-6.971]], [[-0.418,-7.446],[-0.342,-7.865],[0.856,-7.541],[1.331,-7.256],[1.521,-7.028]], -7.009, 0.13, 0.05),
          ...retractTailWheel(-6.23, -0.703, 0.15, 0.08, -0.475, -6.021),
        ],
        props: [{ z: 2.72, y: 0, r: 1.75, blades: 3 }],
        markZ: -3.1,
        markR: 0.36,
        soot: [[0.42,0.095,2.05,2.8]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [6.72, -0.116, -0.4], kind: 'red' },
          { p: [-6.72, -0.116, -0.4], kind: 'green' },
          { p: [0, -0.342, -7.885], kind: 'white' },
        ],
      };
    }
    case 'ju87d': {
      // Ju 87 D Stuka, üç görünüş çiziminden (81 piksel/m; kanat D sürümünün 15 m açıklığına göre). Ters martı kanat, sabit takım ve teker tulumları, çene radyatörü, uzun çerçeveli kapak ve arkada nişancının tüfeği. Yatay kuyruk altından destekli. Kanat altında açılan pike frenleri.
      const H = new JetHull([[2.32,0.34,0.309,-0.31,-0.025],[1.95,0.5,0.393,-0.494,-0.086],[1.4,0.5,0.518,-0.597,-0.084],[0.96,0.5,0.577,-0.679,-0.101],[0.22,0.46,0.68,-0.765,-0.1],[-0.21,0.447,0.741,-0.781,-0.081],[-0.77,0.431,0.736,-0.802,-0.094],[-2.86,0.37,0.716,-0.642,-0.017],[-4.22,0.28,0.527,-0.432,0.009],[-5.46,0.193,0.494,-0.308,0.061],[-6.69,0.108,0.346,-0.185,0.059],[-7.99,0.02,0.123,0.062,0.09]] as JetSec[], 2.6, true, 2.3);
      const WR = [[0.6,-0.38,0.222,3.358,0.54],[1.5,-0.6,0.198,3.025,0.5],[3.13,-0.37,0.074,2.691,0.36],[5.304,-0.037,-0.049,1.951,0.22],[6.935,0.213,-0.173,1.148,0.13],[7.315,0.272,-0.272,0.74,0.08],[7.37,0.28,-0.457,0.494,0.02]] as WingRow[];
      const TR = [[0.08,0.593,-6.383,1.024,0.13],[0.15,0.593,-6.383,1.024,0.13],[2.3,0.593,-6.383,1.024,0.13],[2.42,0.593,-6.568,0.679,0.13],[2.45,0.593,-6.753,0.247,0.13]] as WingRow[];
      return {
        solids: [
          H.geo(14, [true, true]),
          
          spinnerRows([[3,0],[2.85,0.18],[2.6,0.33],[2.35,0.38]], 0),
          ...stubRow(H, 6, 2.136, 0.21, -0.16, 0.045),
          tag(H.patch(1, -0.469, -2.864, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.21,0.185,0.802,0.43,0.656],[-0.519,0.2976,1.086,0.43,0.845]], glass: [[-0.519,0.2976,1.086,0.43,0.845],[-0.765,0.31,1.086,0.43,0.845],[-2,0.33,1.086,0.43,0.845],[-2.617,0.32,1.086,0.43,0.845],[-2.864,0.18,0.704,0.43,0.635]], aft: [[-2.824,0.166,0.694,0.43,0.635],[-3.004,0.108,0.674,0.43,0.635]], frames: [-0.519,-1.074,-1.383,-1.691,-2.062,-2.617], posts: [[0.167,0.762,-0.21],[0.274,1.056,-0.519]], pilot: { z: -1.074, len: 1.35, h: 0.36, y: 0.61, w: 0.3 }, p: 3.2, rails: [1.2,0.5] }),
          mastRod(1.049, -1.84, 1.914, -1.84, 0.018),
          tag(rod(new THREE.Vector3(0, 1.914, -1.84), new THREE.Vector3(0, 1.951, -7.37), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.8, span: [4.3478260869565215,7.065217391304348] }),
          ...rowFlap(WR, 0.6, 4.293478260869565, 0.78),
          
          ...[1, -1].flatMap((s) => [[2.45,0.1]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          // Çene radyatörü
          underPaint(new JetHull([[1.951, 0.36, -0.4, -0.72, -0.56], [1.765, 0.42, -0.4, -0.92, -0.68], [0.988, 0.42, -0.5, -0.92, -0.72], [0.654, 0.3, -0.6, -0.72, -0.66]], 3.2, false).geo(10)),
          tag(new JetHull([[1.951, 0.32, -0.45, -0.68, -0.56], [1.642, 0.3, -0.46, -0.66, -0.56]], 2.6, false).geo(8), 'dark'),
          tag(new JetHull([[1.951, 0.32, -0.45, -0.68, -0.56], [1.642, 0.3, -0.46, -0.66, -0.56]], 2.6, false).disc(1.642, 1, 8), 'dark'),
          // Sabit takım: üst kaporta, tulum, tekerlek; kuyruk destekleri; nişancı tüfeği
          ...[1, -1].flatMap((s) => [
            new JetHull([[0.654, 0.03, -1.92, -1.99, -1.96], [0.407, 0.16, -1.6, -2.1, -1.85], [-0.148, 0.2, -1.45, -2.1, -1.78], [-0.765, 0.12, -1.7, -1.95, -1.82], [-1.012, 0.02, -1.8, -1.86, -1.83]], 2.3, false).geo(10).translate(s * 1.46, 0, 0),
            legFairing(s * 1.46, [[0.222, -0.72], [-0.519, -0.72], [-0.765, -1.8], [0.407, -1.8]]).translate(-s * 1.46, 0, 0).scale(4, 1, 1).translate(s * 1.46, 0, 0),
            ...wheelParts(0.4, 0.18, s * 1.46, -1.91, 0.136).map((g) => tag(g, 'dark')),
            tag(rod(new THREE.Vector3(s * 0.08, -0.123, -6.321), new THREE.Vector3(s * 1.0, 0.568, -6.691), 0.016, 4), 'dark'),
            ...joint(s > 0 ? 'airbrakeL' : 'airbrakeR', [s * 3.4 * 1.0869565217391304, -0.453, 0.2], [tag(new THREE.BoxGeometry(1.5, 0.02, 0.22).translate(s * 3.4 * 1.0869565217391304, -0.453, 0.09), 'dark')], false, [s, 0, 0]),
          ]),
          tag(rod(new THREE.Vector3(0, 0.704, -2.864), new THREE.Vector3(0, 0.864, -3.481), 0.016, 5), 'dark'),
          ...planWing(TR, { xh: 0.6, span: [0.15,2.3], name: 'elevator' }),
          ...hingedFin(H, [[0.247,-5.704],[0.617,-5.889],[0.716,-6.136],[1.914,-6.753],[1.951,-7.309]], [[-0.247,-6.691],[0.062,-7.988],[0.123,-8.025],[1.605,-7.988],[1.914,-7.864],[1.938,-7.432]], -7.37, 0.16, 0.08),
          ...fixedTailWheel(-7.185, -0.531, 0.14, 0.08, -0.247, -7.037),
        ],
        props: [{ z: 2.444, y: 0, r: 1.7, blades: 3 }],
        markZ: -3,
        markR: 0.42,
        soot: [[0.5,-0.16,1.6,2.6]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [7.39, 0.28, -0.704], kind: 'red' },
          { p: [-7.39, 0.28, -0.704], kind: 'green' },
          { p: [0, 0.123, -8.045], kind: 'white' },
        ],
      };
    }
    case 'sb2c': {
      // SB2C-3 Helldiver, üç görünüş çiziminden (70 piksel/m). Kalın gövde, büyük dikey kuyruk, uzun çerçeveli kapak ve dört palalı pervane. Geniş kanat, delikli pike flapları, kanatta iki 20 mm top. Takım dışa değil içe toplanır.
      const H = new JetHull([[2.24,0.661,0.643,-0.787,-0.129],[1.31,0.74,0.786,-0.909,-0.129],[-0.11,0.67,0.929,-0.929,-0.074],[-2.26,0.647,0.929,-0.929,-0.074],[-4.11,0.548,0.929,-0.743,0.026],[-5.11,0.319,1.071,-0.566,0.187],[-5.61,0.215,1.213,-0.462,0.308],[-6.11,0.157,1.023,-0.358,0.278],[-6.54,0.106,0.858,-0.243,0.263],[-7.19,0.03,0.571,-0.071,0.224]] as JetSec[], 2.35, true, 2.1);
      const WR = [[0.6,-0.652,-0.086,3.814,0.62],[0.8,-0.62,-0.143,3.614,0.6],[2.5,-0.348,-0.186,3.071,0.46],[4.5,-0.028,-0.214,2.4,0.3],[6,0.212,-0.214,1.972,0.2],[7,0.372,-0.214,1.5,0.11],[7.35,0.428,-0.286,1.043,0.06],[7.57,0.463,-0.757,0.143,0.012]] as WingRow[];
      const TR = [[0.1,0.786,-5.329,2.385,0.138],[0.3,0.786,-5.357,2.329,0.134],[1.3,0.786,-5.857,1.786,0.115],[2.4,0.786,-6.257,1.286,0.093],[2.75,0.786,-6.571,0.686,0.087],[2.88,0.786,-6.829,0.142,0.084]] as WingRow[];
      return {
        solids: [
          H.geo(16, [false, true]),
          tag(H.disc(2.24, 1, 16).translate(0, 0, -0.1), 'dark'),
          tag(new JetHull([[2.24, 0.611, 0.593, -0.737, -0.129], [2.14, 0.601, 0.583, -0.727, -0.129]], 2.2, false).geo(16), 'dark'),
          // Motor yüzü ve silindirler
          new THREE.CylinderGeometry(0.399, 0.399, 0.1, sg(10)).rotateX(Math.PI / 2).translate(0, -0.072, 2.14),
          ...Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const r = 0.502;
            return tag(new THREE.BoxGeometry(0.1, 0.1, 0.1).rotateZ(a).translate(Math.cos(a) * r, -0.072 + Math.sin(a) * r, 2.15), 'dark');
          }),
          spinnerRows([[3,0],[2.86,0.12],[2.6,0.16],[2.32,0.17]], 0),
          ...stubRow(H, 3, 0.957, 0.18, -0.25, 0.055),
          tag(H.patch(1, -0.493, -4.329, Math.PI / 2 - 0.68, Math.PI / 2 + 0.68, 0.006), 'dark'),
          ...jetCanopy({ screen: [[-0.114,0.179,0.929,0.58,0.794],[-0.543,0.288,1.214,0.58,0.983]], glass: [[-0.543,0.288,1.214,0.58,0.983],[-0.757,0.3,1.214,0.58,0.983],[-2.971,0.32,1.214,0.58,0.983],[-4.114,0.3,1.214,0.58,0.983],[-4.329,0.2,1.071,0.58,0.904]], aft: [[-4.289,0.184,1.061,0.58,0.904],[-4.469,0.12,1.041,0.58,0.904]], frames: [-0.543,-1.257,-2.614,-3.043,-3.543,-4.043], posts: [[0.161,0.889,-0.114],[0.265,1.184,-0.543]], pilot: { z: -0.971, len: 1.35, h: 0.36, y: 0.76, w: 0.3 }, p: 3.2, rails: [1.2] }),
          mastRod(0.886, 0.529, 1.743, 0.529, 0.012),
          tag(rod(new THREE.Vector3(0, 1.743, 0.529), new THREE.Vector3(0, 2.857, -7.043), 0.004, 3), 'dark'),
          ...planWing(WR, { xh: 0.78, span: [4.7,7] }),
          ...rowFlap(WR, 0.7, 2.4, 0.74),
          
          ...[1, -1].flatMap((s) => [[2.6,0.3]].map(([x, l]: number[]) => {
            const q = rowAt(WR, x);
            return tag(rod(new THREE.Vector3(s * x, q[1] + 0.01, q[2] - 0.06), new THREE.Vector3(s * x, q[1] + 0.01, q[2] + l), 0.02, 5), 'dark');
          })),
          ...rowBrake(WR, 2.45, 4.65, 0.74),
          tag(rod(new THREE.Vector3(0.05, 1.214, -4.329), new THREE.Vector3(0.05, 1.314, -5.043), 0.014, 5), 'dark'),
          tag(rod(new THREE.Vector3(-0.05, 1.214, -4.329), new THREE.Vector3(-0.05, 1.314, -5.043), 0.014, 5), 'dark'),
          ...planWing(TR, { xh: 0.6, span: [0.3,2.6], name: 'elevator' }),
          ...hingedFin(H, [[0.643,-5.043],[1.071,-5.257],[1.214,-5.614],[2.714,-6.543],[2.957,-7.114]], [[-0.071,-7.043],[0.571,-7.971],[1.571,-8.157],[2.571,-7.829],[2.957,-7.186]], -7.143, 0.15, 0.06),
          ...fixedTailWheel(-6.729, -0.571, 0.11, 0.07, -0.257, -6.543),
        ],
        props: [{ z: 2.486, y: 0, r: 1.85, blades: 4 }],
        markZ: -3.2,
        markR: 0.42,
        soot: [[0.7,-0.25,1.1,2.4]],
        ownMast: true,
        flushGuns: true,
        lights: [
          { p: [7.59, 0.463, -0.829], kind: 'red' },
          { p: [-7.59, 0.463, -0.829], kind: 'green' },
          { p: [0, 1.571, -8.177], kind: 'white' },
        ],
      };
    }
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
function markSpots(probe: Probe, bb: THREE.Box3, fins: FinRec[], markZ?: number, markY?: number, markR?: number): (MarkSpot & { fin?: boolean })[] {
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
    const r = markR ?? (markY !== undefined ? 0.2 : Math.min(hgt * 0.3, 0.75));
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
  if (kind === 'bf109e' || kind === 'bf109f' || kind === 'bf109g') return propGear({
    top: [0.52, -0.4, 0.75], axle: [1.02, -1.42, 0.92], rw: 0.33, tw: 0.15, dx: 0.08, out: true,
    door: { pts: [[0.92, -0.5], [0.62, -0.5], [0.72, -1.2], [1.16, -1.2]] },
    stays: [{ k: 0.45, to: [0.5, -0.42, 0.25] }],
  });
  if (kind === 'p51d') return propGear({
    top: [1.72, -0.72, 0.28], axle: [1.82, -1.64, 0.29], rw: 0.36, tw: 0.17, dx: 0.1,
    door: { pts: [[0.62, -0.76], [-0.04, -0.76], [0.0, -1.42], [0.6, -1.42]] },
    stays: [{ k: 0.45, to: [1.25, -0.72, 0.1] }],
  });
  if (kind === 'fw190') return propGear({
    top: [2.25, -0.62, 0.55], axle: [1.85, -1.8, 0.7], rw: 0.33, tw: 0.2, dx: 0.1,
    door: { pts: [[0.95, -0.72], [0.28, -0.72], [0.34, -1.38], [0.98, -1.5]] },
    stays: [{ k: 0.42, to: [1.65, -0.68, 0.45] }],
  });
  if (kind === 'typhoon') return propGear({
    top: [2.08, -0.72, 1.05], axle: [2.1, -2.035, 1.2], rw: 0.44, tw: 0.22, dx: 0.12,
    door: { pts: [[1.7999999999999998, -0.78], [0.8999999999999999, -0.78], [0.8799999999999999, -1.8350000000000002], [1.8199999999999998, -1.935]] },
    stays: [{ k: 0.45, to: [1.55, -0.78, 0.95] }],
  });
  if (kind === 'yak3') return propGear({
    top: [1.05, -0.5, 0.75], axle: [1.2, -1.47, 0.95], rw: 0.31, tw: 0.15, dx: 0.1,
    door: { pts: [[1.15, -0.56], [0.55, -0.56], [0.68, -1.3], [1.18, -1.32]] },
    stays: [{ k: 0.45, to: [0.85, -0.52, 0.3] }],
  });
  if (kind === 'p47') return propGear({
    top: [2.32, -0.72, 0.303], axle: [2.38, -1.794, 0.353], rw: 0.44, tw: 0.22, dx: 0.13,
    door: { pts: [[0.7729999999999999, -0.78], [-0.067, -0.78], [-0.04700000000000004, -1.544], [0.7729999999999999, -1.544]] },
    stays: [{ k: 0.42, to: [1.72, -0.8, 0.15299999999999997] }],
  });
  if (kind === 'la7') return propGear({
    top: [1.42, -0.55, 0.633], axle: [1.42, -1.53, 0.533], rw: 0.31, tw: 0.15, dx: 0.08, door: { pts: [[0.983, -0.62], [0.283, -0.62], [0.333, -1.3], [0.983, -1.3]] }, stays: [{ k: 0.45, to: [0.95, -0.62, 0.433] }] 
  });
  if (kind === 'p40') return propGear({
    top: [1.07, -0.75, -0.25], axle: [1.07, -1.707, -0.287], rw: 0.4, tw: 0.17, dx: -0.24, back: true, door: { pts: [[0.02, -0.82], [-0.5, -0.82], [-0.52, -1.3], [0.0, -1.3]] }, stays: [{ k: 0.42, to: [1.07, -0.8, -0.85] }] 
  });
  if (kind === 'f6f') return propGear({
    top: [1.65, -0.85, 0.55], axle: [1.65, -1.975, 0.517], rw: 0.4, tw: 0.18, dx: 0.05, back: true, door: { pts: [[0.95, -0.92], [0.2, -0.92], [0.22, -1.5], [0.92, -1.5]] }, stays: [{ k: 0.45, to: [1.65, -0.85, -0.1] }] 
  });
  if (kind === 'f4u') return propGear({
    top: [2.2, -1.0, 0.48], axle: [2.2, -1.965, 0.594], rw: 0.41, tw: 0.19, dx: 0, back: true, door: { pts: [[0.98, -1.05], [0.15, -1.05], [0.2, -1.62], [0.95, -1.62]] }, stays: [{ k: 0.42, to: [2.2, -1.05, -0.1] }] 
  });
  if (kind === 'f8f') return propGear({
    top: [1.82, -0.75, 0.621], axle: [1.85, -1.679, 0.671], rw: 0.42, tw: 0.2, dx: 0.1, door: { pts: [[1.171, -0.82], [0.371, -0.82], [0.421, -1.45], [1.121, -1.4]] }, stays: [{ k: 0.42, to: [1.3, -0.82, 0.471] }] 
  });
  if (kind === 'i16') return propGear({
    top: [1.25, -0.55, 0.943], axle: [1.35, -1.315, 1.043], rw: 0.33, tw: 0.15, dx: 0.1, door: { pts: [[1.363, -0.62], [0.743, -0.62], [0.763, -1.18], [1.343, -1.18]] }, stays: [{ k: 0.45, to: [0.8, -0.6, 0.943] }] 
  });
  if (kind === 'a6m') return propGear({
    top: [1.79, -0.58, 0.681], axle: [1.79, -1.482, 0.631], rw: 0.29, tw: 0.14, dx: 0.08, door: { pts: [[0.951, -0.65], [0.351, -0.65], [0.391, -1.3], [0.931, -1.3]] }, stays: [{ k: 0.45, to: [1.3, -0.65, 0.531] }] 
  });
  if (kind === 'seafury') return propGear({
    top: [2.5, -0.78, 0.68], axle: [2.46, -1.9, 0.6], rw: 0.36, tw: 0.18, dx: 0.1, door: { pts: [[1.05, -0.85], [0.2, -0.85], [0.22, -1.6], [1.0, -1.6]] }, stays: [{ k: 0.42, to: [1.9, -0.82, 0.45] }] 
  });
  if (kind === 'il2') return propGear({
    top: [1.75, -0.85, 0.341], axle: [1.75, -1.696, 0.441], rw: 0.39, tw: 0.19, dx: 0, back: true, door: { pts: [[0.761, -1.0], [0.141, -1.0], [0.161, -1.5], [0.741, -1.5]] }, stays: [{ k: 0.42, to: [1.75, -0.9, -0.259] }] 
  });
  if (kind === 'il2m3') return propGear({
    top: [1.75, -0.85, 0.341], axle: [1.75, -1.696, 0.441], rw: 0.39, tw: 0.19, dx: 0, back: true, door: { pts: [[0.761, -1.0], [0.141, -1.0], [0.161, -1.5], [0.741, -1.5]] }, stays: [{ k: 0.42, to: [1.75, -0.9, -0.259] }] 
  });
  if (kind === 'il10') return propGear({
    top: [1.85, -0.72, 0.5], axle: [1.85, -1.62, 0.4], rw: 0.38, tw: 0.18, dx: 0.02, back: true, door: { pts: [[0.88, -0.78], [0.0, -0.78], [0.02, -1.35], [0.85, -1.35]] }, stays: [{ k: 0.42, to: [1.85, -0.75, -0.2] }] 
  });
  if (kind === 'sbd') return propGear({
    top: [1.55, -0.8, 0.374], axle: [1.6, -1.538, 0.474], rw: 0.355, tw: 0.17, dx: 0.1, door: { pts: [[0.854, -0.85], [0.194, -0.85], [0.224, -1.3], [0.824, -1.3]] }, stays: [{ k: 0.42, to: [1.05, -0.85, 0.274] }] 
  });
  if (kind === 'sb2c') return propGear({
    top: [2.0, -0.85, -0.5], axle: [2.02, -1.786, -0.4], rw: 0.4, tw: 0.2, dx: 0.1, door: { pts: [[0.02, -0.9], [-0.72, -0.9], [-0.7, -1.5], [0, -1.5]] }, stays: [{ k: 0.42, to: [1.45, -0.9, -0.6] }] 
  });
  if (kind === 'ad4') return propGear({
    top: [1.95, -0.95, 0.75], axle: [1.97, -2.05, 0.85], rw: 0.42, tw: 0.2, dx: 0.02, back: true, door: { pts: [[1.3, -1.0], [0.4, -1.0], [0.42, -1.7], [1.28, -1.7]] }, stays: [{ k: 0.42, to: [1.95, -0.95, 0.1] }] 
  });
  if (kind === 'bf110') return propGear({
    top: [2.34, -0.9, 1.477], axle: [2.34, -2.114, 1.557], rw: 0.44, tw: 0.22, dx: 0, back: true, door: { pts: [[1.857, -1.0], [1.257, -1.0], [1.277, -1.5], [1.857, -1.5]] }, stays: [{ k: 0.42, to: [2.34, -0.95, 0.807] }] 
  });
  if (kind === 'mosquito') return propGear({
    top: [2.45, -0.75, 1.872], axle: [2.45, -1.766, 1.972], rw: 0.53, tw: 0.22, dx: 0, back: true, stays: [{ k: 0.42, to: [2.45, -0.85, 1.172] }] 
  });
  if (kind === 'p38') return propGear({
    top: [2.48, -0.7, 0.3], axle: [2.48, -1.44, 0.22], rw: 0.43, tw: 0.2, dx: 0, back: true, stays: [{ k: 0.42, to: [2.48, -0.72, -0.4] }] 
  });
  if (kind === 'pe2') return propGear({
    top: [2.33, -1.05, 1.217], axle: [2.33, -2.09, 1.297], rw: 0.45, tw: 0.2, dx: 0, back: true, stays: [{ k: 0.42, to: [2.33, -1.1, 0.597] }] 
  });
  if (kind === 'blenheim') return propGear({
    top: [2.3, -0.7, 0.95], axle: [2.3, -2.0, 1.0], rw: 0.45, tw: 0.22, dx: 0, back: true, stays: [{ k: 0.42, to: [2.3, -0.75, 0.2] }] 
  });
  if (kind === 'he111') return propGear({
    top: [2.58, -0.6, 4.754], axle: [2.58, -2.22, 4.854], rw: 0.55, tw: 0.24, dx: 0, back: true, stays: [{ k: 0.42, to: [2.58, -0.65, 3.854] }] 
  });
  if (kind === 'ju88') return propGear({
    top: [2.78, -0.95, 4.165], axle: [2.78, -2.536, 4.265], rw: 0.54, tw: 0.25, dx: 0, back: true, stays: [{ k: 0.42, to: [2.78, -1, 3.265] }] 
  });
  if (kind === 'b25') return propGear({
    top: [2.96, -0.8, 1.567], axle: [2.96, -1.698, 1.567], rw: 0.56, tw: 0.25, dx: 0, back: true, stays: [{ k: 0.42, to: [2.96, -0.85, 0.567] }] 
  });
  if (kind === 'b17') return propGear({
    top: [2.75, -1.1, 5.294], axle: [2.75, -1.89, 5.394], rw: 0.73, tw: 0.3, dx: 0, fore: true, stays: [{ k: 0.42, to: [2.75, -1.15, 4.194] }] 
  });
  if (kind === 'lancaster') return propGear({
    top: [3.7, -0.75, 3.292], axle: [3.7, -2.75, 3.392], rw: 0.75, tw: 0.32, dx: 0, back: true, stays: [{ k: 0.42, to: [3.7, -0.8, 1.992] }] 
  });
  if (kind === 'a26') return propGear({
    top: [2.97, -0.75, 2.374], axle: [2.97, -1.58, 2.274], rw: 0.57, tw: 0.25, dx: 0, back: true, stays: [{ k: 0.42, to: [2.97, -0.8, 1.374] }] 
  });
  if (kind === 'b29') return propGear({
    top: [4.38, -0.85, 3.52], axle: [4.38, -2.2, 3.62], rw: 0.7, tw: 0.3, dx: 0, twin: 0.34, fore: true, stays: [{ k: 0.42, to: [4.38, -0.9, 2.12] }] 
  });
  if (kind === 'hurricane') return hurricaneGear();
  if (kind === 'spitfire' || kind === 'spitfire5' || kind === 'spitfire9') return propGear({
    top: [0.62, -0.72, 0.8], axle: [0.87, -1.56, 1.05], rw: 0.33, tw: 0.16, dx: 0.1, out: true,
    door: { pts: [[1.0, -0.82], [0.62, -0.82], [0.72, -1.5], [1.28, -1.5]] },
    stays: [{ k: 0.5, to: [0.66, -0.75, 0.3] }],
  });
  if (kind === 'mig15') return migGear(gearHeight(spec));
  if (kind === 'sabre') return sabreGear(gearHeight(spec));
  if (kind === 'f84') return thunderjetGear(gearHeight(spec));
  if (kind === 'p80') return shootingStarGear(gearHeight(spec));
  if (kind === 'me262') return schwalbeGear(gearHeight(spec));
  if (kind === 'meteor') return meteorGear(gearHeight(spec));
  if (kind === 'vampire') return vampireGear(gearHeight(spec));
  if (kind === 'he162') return salamanderGear(gearHeight(spec));
  if (kind === 'ar234') return blitzGear(gearHeight(spec));
  if (kind === 'canberra') return canberraGear(gearHeight(spec));
  if (kind === 'il28') return beagleGear(gearHeight(spec));
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
function exhausts(probe: Probe, bb: THREE.Box3, spec: AircraftSpec | undefined, props: PropDef[], own?: [number, number, number, number][]): { geos: Geo[]; soot: THREE.Vector4[] } {
  const geos: Geo[] = [];
  const soot: THREE.Vector4[] = [];
  if (own) return { geos, soot: own.map(([x, y, z, l]) => new THREE.Vector4(x, y, z, l)) };
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
  if (c0 && single && spec.year < 1950 && !def.ownMast) {
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
      if (def.flushGuns) continue;
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
  const ex = exhausts(probe, bb, spec, def.props, def.soot);
  const extra = detail ? smallParts(probe, bb, spec, def, canopies, finRecs) : { dark: [], pilot: [], navRed: [], navGreen: [] };
  const info: SkinInfo = {
    livery: LIVERIES[kind] ?? FALLBACK_LIVERY, noseZ: bb.max.z, span: bb.max.x * 2, soot: ex.soot,
    marks: markSpots(probe, bb, finRecs, def.markZ, def.markY, def.markR), nation: nationOf(spec?.origin),
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
  s.lineTo(0.09, 0.35);
  s.lineTo(0.078, 0.82);
  s.lineTo(0.05, 0.95);
  s.lineTo(0, 1);
  s.lineTo(-0.05, 0.95);
  s.lineTo(-0.078, 0.82);
  s.lineTo(-0.09, 0.35);
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
