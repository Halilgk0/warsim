// Savunma taretleri: her nişancı kendi atış alanındaki (yatay/dikey açı sınırları) en tehlikeli avcıyı seçer,
// göreli hıza göre ön nişan alır ve kısa seriler atar. Mermiler uçağın hızını devralır.

import { Quaternion, Vector3 } from 'three';
import type { Aircraft, TurretState } from '../aircraft/aircraft';
import type { World } from '../world';
import { DEG, G, gauss } from '../../core/math';

const _pos = new Vector3();
const _rel = new Vector3();
const _vr = new Vector3();
const _va = new Vector3();
const _vt = new Vector3();
const _aim = new Vector3();
const _dir = new Vector3();
const _local = new Vector3();
const _inv = new Quaternion();
const _cr = new Vector3();

function wrapDeg(a: number): number {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

/** Dünya yönünün taret açı sınırları içinde olup olmadığı. */
function inArc(ac: Aircraft, t: TurretState, dirWorld: Vector3): boolean {
  _inv.copy(ac.quat).invert();
  _local.copy(dirWorld).applyQuaternion(_inv);
  // Model ekseninde sağ = -X
  const yaw = Math.atan2(-_local.x, _local.z) / DEG;
  const pitch = Math.asin(Math.max(-1, Math.min(1, _local.y))) / DEG;
  return Math.abs(wrapDeg(yaw - t.spec.yaw)) <= t.spec.yawHalf && pitch >= t.spec.pitchMin && pitch <= t.spec.pitchMax;
}

/**
 * Ateş hattında dost uçak: sıkı kutuda nişancı yandaki bombardıman uçağını vurmamak için tetiği bırakır (kutunun
 * içinden geçen avcıya her yönden ateş açılamıyordu; dost ateşi yine de sık oldu).
 */
function friendlyInLine(ac: Aircraft, world: World, from: Vector3, dir: Vector3, dist: number): boolean {
  for (const f of world.aircraft) {
    if (f === ac || f.team !== ac.team || !f.airborne) continue;
    _cr.subVectors(f.pos, from);
    const along = _cr.dot(dir);
    if (along < 0 || along > dist) continue;
    const miss2 = _cr.lengthSq() - along * along;
    const r = f.spec.span * 0.5 + 8;
    if (miss2 < r * r) return true;
  }
  return false;
}

export function turretWorldPos(ac: Aircraft, t: TurretState, out: Vector3): Vector3 {
  const [x, y, z] = t.spec.offset;
  return out.set(x, y, z).applyQuaternion(ac.quat).add(ac.pos);
}

export function updateTurrets(ac: Aircraft, world: World, dt: number): void {
  if (ac.turrets.length === 0 || ac.onGround) return;
  ac.velocity(_va);
  for (const t of ac.turrets) {
    t.firing = false;
    // Ateş edilmeyen sürede birikmesin (yoksa ilk tetikte seri halinde boşalır)
    t.cooldown = Math.max(t.cooldown - dt, -0.05);
    t.retarget -= dt;
    const gun = t.gun;
    if (t.ammo <= 0) continue;
    turretWorldPos(ac, t, _pos);
    if (t.retarget <= 0) {
      t.retarget = 0.4 + Math.random() * 0.3;
      let best: Aircraft | null = null;
      let bestScore = Infinity;
      for (const e of world.aircraft) {
        if (e.team === ac.team || !e.airborne || e.spec.role === 'bomber') continue;
        const d = e.pos.distanceTo(_pos);
        if (d > gun.range * 1.1) continue;
        _rel.subVectors(e.pos, _pos).divideScalar(d);
        if (!inArc(ac, t, _rel)) continue;
        // Bize yaklaşan ve burnu bize dönük olan önce
        let score = d;
        if (e.brain.target === ac) score *= 0.6;
        if (e.id === t.targetId) score *= 0.8;
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if ((best?.id ?? null) !== t.targetId) t.track = 0;
      t.targetId = best?.id ?? null;
    }
    const e = t.targetId !== null ? world.aircraftById(t.targetId) : undefined;
    if (!e || !e.airborne) {
      t.targetId = null;
      t.track = 0;
      continue;
    }
    t.track += dt;
    // Göreli hızla ön nişan (mermi uçağın hızını devralır)
    e.velocity(_vt);
    _vr.subVectors(_vt, _va);
    _rel.subVectors(e.pos, _pos);
    let tof = _rel.length() / gun.muzzleVel;
    _aim.copy(_rel).addScaledVector(_vr, tof);
    tof = _aim.length() / gun.muzzleVel;
    _aim.copy(_rel).addScaledVector(_vr, tof);
    _aim.y += 0.5 * G * tof * tof;
    const dist = _aim.length();
    _aim.divideScalar(dist);
    // Nişancının takip hatası + öndelik kestirme hatası. Saldıran avcı takip eğrisinde gelirken doğru öndelik
    // sezgiye ters düşer (avcının arkasına nişan gerekir); nişancıların çoğu yanıldı, gerçek isabet çok düşüktü.
    t.noiseTime -= dt;
    if (t.noiseTime <= 0) {
      t.noiseTime = 0.3 + Math.random() * 0.5;
      // Kendi uçağı manevradayken nişancı G altında ezilir, yuvarlanırken silahı tutamaz; avcı ve pike uçaklarındaki
      // elle tutulan tek makineli hava akımında savrulur (Bf 110'un MG 15'i ön silahlarının dört katı isabet
      // ettiriyordu). Motorlu taret (yansıtıcı nişangâh) en isabetlisi; bombardıman uçağının bel ve yanak
      // pencerelerindeki elle tutulan silahlar açık nişangâhlıydı, nişancı rüzgâr ve soğukla boğuşuyordu.
      const handHeld = t.spec.power ? 1 : ac.spec.role === 'bomber' ? 1.35 : 1.5;
      const shake = 1 + 0.6 * Math.max(0, Math.abs(ac.n) - 1.3) + 0.8 * Math.abs(ac.rollRate);
      // Yeni hedefe nişan ancak bir-iki saniyede oturur. Karşıdan hızla gelen (ya da geçip hızla uzaklaşan) avcıda
      // (~250 m/sn) mesafe her an değişir, düşüş ve öndelik kestirilemez; ateş penceresi iki-üç saniye: önden
      // saldırının asıl üstünlüğü buydu
      const r2 = Math.max(_rel.lengthSq(), 1);
      const closing = Math.abs(_rel.dot(_vr)) / Math.sqrt(r2);
      const settle = (1 + 1.2 * Math.exp(-t.track / 1.2)) * (1 + Math.max(0, closing - 80) / 100);
      // Takip gecikmesi: nişancı açısal hızla kayan hedefin hep biraz gerisinde kalır (motorlu taret ~0,08 sn, rüzgârda
      // savrulan elle tutulan silah ~0,12 sn); taretin dönüş hızını (~45°/sn, elle tutulan ~60°/sn) aşan hedefi hiç
      // izleyemez. Kutunun içinden hızla geçen avcıya yakından bile isabet zordu
      const omega = _cr.crossVectors(_rel, _vr).length() / r2;
      const wMax = (t.spec.power ? 45 : 60) * DEG;
      const lag = omega * (t.spec.power ? 0.08 : 0.12) + Math.max(0, omega - wMax) * 0.5;
      t.noiseGoal.set(gauss(), gauss(), gauss()).multiplyScalar((1.8 * DEG * handHeld * shake * settle + lag) * ac.mods.turretAimMul);
      _dir.copy(_rel).normalize();
      const lead = Math.acos(Math.max(-1, Math.min(1, _dir.dot(_aim))));
      if (lead > 1e-3) {
        _dir.subVectors(_aim, _dir).normalize().multiplyScalar(lead * (Math.random() - 0.5) * 0.8 * ac.mods.turretAimMul);
        t.noiseGoal.add(_dir);
      }
    }
    t.noise.lerp(t.noiseGoal, Math.min(1, dt * 4));
    _aim.add(t.noise).normalize();
    t.aim.copy(_aim);
    if (!inArc(ac, t, _aim) || dist > gun.range) continue;
    if (friendlyInLine(ac, world, _pos, _aim, dist)) continue;
    t.firing = true;
    while (t.cooldown <= 0 && t.ammo > 0) {
      t.cooldown += 1 / gun.rate;
      t.ammo--;
      world.spawnGunRound(ac, gun, _pos, _aim);
    }
  }
}
