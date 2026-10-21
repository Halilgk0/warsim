// Uçaksavardan kaçınma.
//
// - Rota: intikal ve dönüşte bilinen düşman bataryalarının menzili dolanılır. Bataryanın tavanının üstünden geçen ya da
//   görev hedefinin dibindeki (kaçınılamaz; bastırma kolunun işi) bataryalar hesaba katılmaz.
// - Flak altında zikzak: ağır flak mermisi ~10 sn uçar ve atış o anki rotaya göre kestirilir; kol 8 sn'de bir 14°
//   yön ve biraz irtifa değiştirirse patlama yüzlerce metre öteye düşer. Bombalama koşusunda yapılmaz (nişan bozulur).
// - Kaçamak: hafif uçaksavarın izli mermileri gelirken taarruz uçağı hedeften çıkarken yön değiştirir.

import type { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { World } from '../world';
import { DEG, clamp } from '../../core/math';

function rotateH(dir: Vector3, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = dir.x * c - dir.z * s;
  dir.z = dir.x * s + dir.z * c;
  dir.x = x;
}

/** Rota üstündeki düşman bataryalarının menzilinden yana sap. `keep`: görev hedefi (yakınındaki bataryalar dolanılmaz). */
export function avoidAA(ac: Aircraft, world: World, dir: Vector3, keep: Vector3 | null): boolean {
  const hl = Math.hypot(dir.x, dir.z);
  if (hl < 1e-3) return false;
  const hx = dir.x / hl;
  const hz = dir.z / hl;
  let px = 0;
  let pz = 0;
  for (const s of world.structures) {
    if (s.kind !== 'aa' || s.team === ac.team || s.destroyed || !s.active || !s.aa) continue;
    const env = s.aa.envelope();
    if (env.range <= 0 || ac.pos.y - s.pos.y > env.ceiling + 300) continue;
    if (keep && Math.hypot(s.pos.x - keep.x, s.pos.z - keep.z) < 4000) continue;
    const rx = s.pos.x - ac.pos.x;
    const rz = s.pos.z - ac.pos.z;
    const R = env.range + 800;
    const along = rx * hx + rz * hz;
    if (along < -R) continue;
    // Önümüzdeki 9 km'lik yolun bataryaya en yakın noktası
    const t = clamp(along, 0, 9000);
    const close = Math.hypot(rx - hx * t, rz - hz * t);
    if (close > R) continue;
    // Bataryanın rota çizgisine göre bulunduğu yanın tersine
    let lx = rx - hx * along;
    let lz = rz - hz * along;
    let ll = Math.hypot(lx, lz);
    if (ll < 1) {
      lx = -hz;
      lz = hx;
      ll = 1;
    }
    const w = (R - close) / R;
    px -= (lx / ll) * w;
    pz -= (lz / ll) * w;
    // Zaten menzilin içindeyse doğrudan dışarı
    const d = Math.hypot(rx, rz);
    if (d < R && d > 1) {
      px -= (rx / d) * ((R - d) / R);
      pz -= (rz / d) * ((R - d) / R);
    }
  }
  if (px === 0 && pz === 0) return false;
  const nx = hx + px * 1.6;
  const nz = hz + pz * 1.6;
  const nl = Math.hypot(nx, nz) || 1;
  dir.x = (nx / nl) * hl;
  dir.z = (nz / nl) * hl;
  return true;
}

/** Flak yakına patladıysa (son 25 sn) zikzak: yön ve irtifa düzenli aralıkla değişir. */
export function flakWeave(ac: Aircraft, world: World, dir: Vector3): boolean {
  const last = Math.max(ac.flakTime, ac.flight?.flakTime ?? -1e9);
  if (world.time - last > 25) return false;
  const bomber = ac.spec.role === 'bomber';
  const half = bomber ? 8 : 5;
  const sign = Math.floor((world.time + (ac.flight?.id ?? ac.id) * 1.3) / half) % 2 === 0 ? 1 : -1;
  rotateH(dir, (bomber ? 14 : 22) * DEG * sign);
  dir.y += 0.05 * sign;
  return true;
}

/** Hafif uçaksavar ateşi altında (son 3 sn) kaçamak: 1,6 sn'de bir 25° yana. */
export function aaJink(ac: Aircraft, world: World, dir: Vector3): boolean {
  if (world.time - ac.aaFireTime > 3) return false;
  const sign = Math.floor(world.time / 1.6 + ac.id * 0.37) % 2 === 0 ? 1 : -1;
  rotateH(dir, 25 * DEG * sign);
  return true;
}
