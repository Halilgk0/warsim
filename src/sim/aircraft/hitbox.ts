// İsabet gövdesi: uçak gerçek ölçülerinden basit parçalarla kurulur — gövde (kapsül), kanat (gerçek açıklık ve
// ortalama veterde levha), yatay ve dikey kuyruk, çok motorluda motor naselleri. Mermi yolu uçağın kendi
// eksenlerinde bu parçalara karşı sınanır; isabetin düştüğü bölge hasarın hangi bileşene gideceğini belirler.
// Eskiden uçak 4–5 m yarıçaplı bir küreydi: arkadan bakınca gerçek hedef ~5 m² iken küre ~66 m² idi.
// Eksenler: x yan (kanat), y üst, z burun.

import { Vector3 } from 'three';
import type { AircraftSpec } from './specs';

export type HitZone = 'nose' | 'cockpit' | 'rear' | 'wingIn' | 'wingOut' | 'nacelle' | 'tail';

interface Nacelle { x: number; zF: number; zB: number; r: number }

export interface HitBox {
  noseZ: number;
  tailZ: number;
  /** Gövde yarıçapı. */
  rf: number;
  halfSpan: number;
  wingZ: number;
  halfChord: number;
  halfT: number;
  stabZ: number;
  stabHalf: number;
  stabHalfChord: number;
  finH: number;
  nacelles: Nacelle[];
  /** Kaba eleme yarıçapı. */
  bound: number;
}

const cache = new WeakMap<AircraftSpec, HitBox>();

export function hitBoxOf(s: AircraftSpec): HitBox {
  let hb = cache.get(s);
  if (hb) return hb;
  const L = s.length;
  const b = s.span;
  const chord = s.wingArea / b;
  const rf = Math.min(1.5, Math.max(0.5, 0.3 + 0.028 * b));
  const noseZ = L * 0.45;
  const tailZ = -L * 0.55;
  const nacelles: Nacelle[] = [];
  if (s.engines > 1) {
    const xs = s.engines >= 4 ? [0.12, 0.245] : [0.16];
    const r = 0.42 + 0.008 * b;
    for (const f of xs) for (const sg of [1, -1]) nacelles.push({ x: sg * f * b, zF: chord * 0.5 + L * 0.12, zB: -chord * 0.6, r });
  }
  hb = {
    noseZ, tailZ, rf,
    halfSpan: b / 2,
    wingZ: L * 0.05,
    halfChord: chord / 2,
    halfT: Math.max(0.12, chord * 0.065) + 0.03,
    stabZ: tailZ + chord * 0.32,
    stabHalf: b * 0.18,
    stabHalfChord: chord * 0.22,
    finH: rf + b * 0.1,
    nacelles,
    bound: Math.hypot(b / 2, L / 2) + 1,
  };
  cache.set(s, hb);
  return hb;
}

export interface BoxHit {
  zone: HitZone;
  /** Mermi yolu üzerindeki ilk temas oranı (0 başlangıç, 1 son). */
  t: number;
}

// --------------------------------------------------------------------- geometri

/** Doğru parçası (p0 + t·d, t∈[0,1]) ile eksene hizalı kutu: giriş oranı ya da -1. */
function segBox(p: Vector3, d: Vector3, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): number {
  let t0 = 0;
  let t1 = 1;
  const lo = [minX, minY, minZ];
  const hi = [maxX, maxY, maxZ];
  const o = [p.x, p.y, p.z];
  const v = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(v[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return -1;
      continue;
    }
    let a = (lo[i] - o[i]) / v[i];
    let c = (hi[i] - o[i]) / v[i];
    if (a > c) [a, c] = [c, a];
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  return t0;
}

const _c = { s: 0, u: 0, d2: 0 };

/** İki doğru parçası arası en yakın noktalar (Ericson). p+s·d1 ile q+u·d2; s,u ∈ [0,1]. */
function closest(p: Vector3, d1: Vector3, qx: number, qy: number, qz: number, d2x: number, d2y: number, d2z: number): typeof _c {
  const rx = p.x - qx;
  const ry = p.y - qy;
  const rz = p.z - qz;
  const a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s: number;
  let u: number;
  const c = d1.x * rx + d1.y * ry + d1.z * rz;
  const bb = d1.x * d2x + d1.y * d2y + d1.z * d2z;
  const den = a * e - bb * bb;
  s = den > 1e-9 ? Math.min(1, Math.max(0, (bb * f - c * e) / den)) : 0;
  u = (bb * s + f) / e;
  if (u < 0) {
    u = 0;
    s = Math.min(1, Math.max(0, -c / a));
  } else if (u > 1) {
    u = 1;
    s = Math.min(1, Math.max(0, (bb - c) / a));
  }
  const dx = p.x + d1.x * s - (qx + d2x * u);
  const dy = p.y + d1.y * s - (qy + d2y * u);
  const dz = p.z + d1.z * s - (qz + d2z * u);
  _c.s = s;
  _c.u = u;
  _c.d2 = dx * dx + dy * dy + dz * dz;
  return _c;
}

/**
 * Uçak ekseninde mermi yolu (p'den p+d'ye) isabet gövdesine çarpıyor mu? İlk temas bölgesi ve oranı.
 */
export function hitBoxTest(hb: HitBox, p: Vector3, d: Vector3): BoxHit | null {
  let best: BoxHit | null = null;
  const take = (zone: HitZone, t: number) => {
    if (t >= 0 && (!best || t < best.t)) best = { zone, t };
  };
  // Gövde
  const L = hb.noseZ - hb.tailZ;
  const cf = closest(p, d, 0, 0, hb.noseZ, 0, 0, -L);
  if (cf.d2 <= hb.rf * hb.rf) {
    const f = cf.u;
    take(f < 0.28 ? 'nose' : f < 0.5 ? 'cockpit' : 'rear', cf.s);
  }
  // Kanat (gövdenin iki yanı)
  const tw = segBox(p, d, -hb.halfSpan, hb.halfSpan, -hb.halfT, hb.halfT, hb.wingZ - hb.halfChord, hb.wingZ + hb.halfChord);
  if (tw >= 0) {
    const x = Math.abs(p.x + d.x * tw);
    take(x < hb.halfSpan * 0.4 ? 'wingIn' : 'wingOut', tw);
  }
  // Yatay ve dikey kuyruk
  const ts = segBox(p, d, -hb.stabHalf, hb.stabHalf, -0.1, 0.1, hb.stabZ - hb.stabHalfChord, hb.stabZ + hb.stabHalfChord);
  if (ts >= 0) take('tail', ts);
  const tf = segBox(p, d, -0.09, 0.09, 0, hb.finH, hb.stabZ - hb.stabHalfChord * 1.2, hb.stabZ + hb.stabHalfChord * 1.2);
  if (tf >= 0) take('tail', tf);
  for (const n of hb.nacelles) {
    const cn = closest(p, d, n.x, 0, n.zF, 0, 0, n.zB - n.zF);
    if (cn.d2 <= n.r * n.r) take('nacelle', cn.s);
  }
  return best;
}

const _p = new Vector3();
const _d = new Vector3();

/**
 * Dünya koordinatında mermi yolu → uçak ekseni ve isabet sınaması. Hedef de aynı adımda hareket ettiği için
 * yol, hedefe göre bağıl alınır: başlangıç (önceki mermi − önceki uçak), bitiş (mermi − uçak).
 */
export function segmentHitsAircraft(
  hb: HitBox, fwd: Vector3, up: Vector3, right: Vector3,
  relStart: Vector3, relEnd: Vector3,
): BoxHit | null {
  _p.set(relStart.dot(right), relStart.dot(up), relStart.dot(fwd));
  _d.set(relEnd.dot(right), relEnd.dot(up), relEnd.dot(fwd)).sub(_p);
  return hitBoxTest(hb, _p, _d);
}
