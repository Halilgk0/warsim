import type { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import { ridgeAlong } from '../aircraft/pilot';
import { stallSpeed } from '../aircraft/flightModel';
import { clamp } from '../../core/math';

/**
 * Yatay yön + hedef irtifadan (deniz seviyesi) uçuş yönü üretir.
 * Tırmanış açısı hıza göre sınırlanır; yavaş uçak tırmanmaya zorlanıp tutunma kaybına girmez.
 * terrainMargin > 0 ise hedef irtifa, önümüzdeki sırtın en az bu kadar üstüne çekilir.
 */
export function headingWithAlt(
  out: Vector3, ac: Aircraft, hx: number, hz: number, alt: number, gain = 0.0012, terrainMargin = 250,
): Vector3 {
  if (Math.hypot(hx, hz) < 1e-3) {
    hx = ac.fwd.x;
    hz = ac.fwd.z;
  }
  const l = Math.hypot(hx, hz) || 1;
  hx /= l;
  hz /= l;
  if (terrainMargin > 0) {
    const look = clamp(ac.speed * 25, 1500, 4000);
    alt = Math.max(alt, ridgeAlong(ac.pos.x, ac.pos.z, hx, hz, look, 250) + terrainMargin);
  }
  const vs = stallSpeed(ac);
  const energy = clamp((ac.speed - vs * 1.3) / (vs * 0.9), 0, 1);
  const slope = clamp((alt - ac.pos.y) * gain, -0.32, 0.36 * energy);
  return out.set(hx, slope, hz).normalize();
}

/**
 * Arazi takibi: önümüzdeki sırtların üzerinden agl kadar yüksekte uç.
 * Kontur uçuşu: doğrudan rota yüksek bir sırta çıkıyorsa, rotadan fazla sapmadan daha alçak vadiye kay.
 */
export function terrainFollow(out: Vector3, ac: Aircraft, hx: number, hz: number, agl: number, contour = true): Vector3 {
  let l = Math.hypot(hx, hz) || 1;
  hx /= l;
  hz /= l;
  const look = clamp(ac.speed * 14, 1200, 2600);
  let ridge = ridgeAlong(ac.pos.x, ac.pos.z, hx, hz, look, 200);
  if (contour) {
    for (const ang of [-0.45, 0.45, -0.25, 0.25]) {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const ax = hx * c - hz * s;
      const az = hx * s + hz * c;
      const r = ridgeAlong(ac.pos.x, ac.pos.z, ax, az, look, 200);
      // Daha alçak bir koridor anlamlı fark yaratıyorsa ona yönel
      if (r < ridge - 90 - Math.abs(ang) * 200) {
        ridge = r;
        hx = hx * 0.35 + ax * 0.65;
        hz = hz * 0.35 + az * 0.65;
        l = Math.hypot(hx, hz) || 1;
        hx /= l;
        hz /= l;
      }
    }
  }
  const near = ridgeAlong(ac.pos.x, ac.pos.z, hx, hz, Math.min(look, ac.speed * 6), 200);
  const target = Math.max(ridge + agl * 0.9, near + agl);
  return headingWithAlt(out, ac, hx, hz, target, 0.004, 0);
}

/** Bir merkez etrafında saat yönünde daire çizme yönü. */
export function orbitDir(out: Vector3, ac: Aircraft, center: Vector3, radius: number, alt: number): Vector3 {
  const rx = ac.pos.x - center.x;
  const rz = ac.pos.z - center.z;
  const d = Math.hypot(rx, rz) || 1;
  const nx = rx / d;
  const nz = rz / d;
  const k = clamp((radius - d) / radius, -1, 1) * 1.5;
  return headingWithAlt(out, ac, -nz + nx * k, nx + nz * k, alt);
}

/** Yatay mesafe. */
export function dist2(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
