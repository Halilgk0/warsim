import { Quaternion, Vector3 } from 'three';

export const G = 9.81;
export const DEG = Math.PI / 180;
/** Dünya yukarı ekseni. Değiştirme! */
export const UP = new Vector3(0, 1, 0);

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function moveToward(cur: number, target: number, maxDelta: number): number {
  if (Math.abs(target - cur) <= maxDelta) return target;
  return cur + Math.sign(target - cur) * maxDelta;
}

/** İki birim vektör arasındaki açı (radyan). */
export function angleBetween(a: Vector3, b: Vector3): number {
  return Math.acos(clamp(a.dot(b), -1, 1));
}

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Yaklaşık normal dağılımlı rastgele sayı (ortalama 0, sapma ~1). */
export function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 2;
}

const _axis = new Vector3();
const _dq = new Quaternion();

/** Yönelimi dünya eksenlerinde verilen açısal hızla (rad/s) döndürür. */
export function rotateByAngularVelocity(q: Quaternion, w: Vector3, dt: number): void {
  const rate = w.length();
  if (rate < 1e-9) return;
  _axis.copy(w).divideScalar(rate);
  _dq.setFromAxisAngle(_axis, rate * dt);
  q.premultiply(_dq).normalize();
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
