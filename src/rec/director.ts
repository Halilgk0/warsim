// Sinematik kamera (video kaydı): çekim türleri, yumuşatma, odak uzaklığı geçişleri, el kamerası titremesi ve
// patlama sarsıntısı. Çekim işlevleri her karede istenen kamerayı (Shot) verir; Director onu yumuşatıp uygular.
// - chase: uçağın arkasından takip (yön yumuşatılır, konum gecikmez)
// - wing: uçağın gövdesine bağlı açı (kanat yanı, burun altı); yatışın bir kısmı kameraya geçer
// - tripod: sabit noktadan izleyen operatör (hedefi az gecikmeyle çevirir)
// - blend: iki çekim arasında yumuşak geçiş (kamera hareketi)

import * as THREE from 'three';
import type { Aircraft } from '../sim/aircraft/aircraft';
import { groundLevel } from '../sim/terrain';

export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  /** Kameranın yukarısı (verilmezse dünya yukarısı). */
  up?: THREE.Vector3;
  /** Dikey görüş açısı (derece). */
  fov: number;
  /** El kamerası titremesi (0 = sabit). */
  handheld?: number;
}

const UP = new THREE.Vector3(0, 1, 0);

export const ease = {
  linear: (t: number): number => t,
  smooth: (t: number): number => t * t * (3 - 2 * t),
  inOut: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number): number => 1 - Math.pow(1 - t, 3),
  in: (t: number): number => t * t * t,
};

export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** t0..t1 aralığında 0→1 (kolaylaştırılmış). */
export function phase(t: number, t0: number, t1: number, fn: (x: number) => number = ease.inOut): number {
  return fn(clamp01((t - t0) / (t1 - t0)));
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Kritik sönümlü yay: hedefe sıçramadan, aşmadan yetişir (smoothTime ≈ gecikme). */
export class Damp3 {
  readonly value = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private ready = false;

  constructor(public time: number) {}

  update(target: THREE.Vector3, dt: number): THREE.Vector3 {
    if (!this.ready || this.time <= 0) {
      this.ready = true;
      this.value.copy(target);
      this.vel.set(0, 0, 0);
      return this.value;
    }
    const w = 2 / this.time;
    const x = w * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const cx = this.value.x - target.x;
    const cy = this.value.y - target.y;
    const cz = this.value.z - target.z;
    const tx = (this.vel.x + w * cx) * dt;
    const ty = (this.vel.y + w * cy) * dt;
    const tz = (this.vel.z + w * cz) * dt;
    this.vel.set((this.vel.x - w * tx) * exp, (this.vel.y - w * ty) * exp, (this.vel.z - w * tz) * exp);
    this.value.set(target.x + (cx + tx) * exp, target.y + (cy + ty) * exp, target.z + (cz + tz) * exp);
    return this.value;
  }

  reset(): void {
    this.ready = false;
  }
}

/** Uçağın uçuş yönü (hız vektörü; yerde ya da çok yavaşken burun). */
export function flightDir(ac: Aircraft, out: THREE.Vector3): THREE.Vector3 {
  ac.velocity(out);
  if (out.lengthSq() < 25) out.copy(ac.fwd);
  return out.normalize();
}

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class Director {
  readonly camera: THREE.PerspectiveCamera;
  /** Takip çekimlerinin yumuşatılmış yönü (uçağın ani yön değişimleri kameraya yumuşak geçer). */
  readonly heading = new Damp3(0.35);
  /** Sehpa operatörünün bakış noktası. */
  readonly aim = new Damp3(0.08);
  /** Kameranın hızı (Doppler). */
  readonly vel = new THREE.Vector3();
  /** Son karede kameranın baktığı nokta ve uzaklığı. */
  readonly look = new THREE.Vector3();
  lookDist = 100;
  private readonly last = new THREE.Vector3();
  private hasLast = false;
  private shakeAmp = 0;
  private time = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /** Arkadan takip: yön yumuşatılır; back/up/side metre, ahead bakışın uçağın ne kadar önüne düştüğü. */
  chase(ac: Aircraft, dt: number, o: { back: number; up: number; side?: number; ahead?: number; lookUp?: number; fov: number }): Shot {
    const f = this.heading.update(flightDir(ac, _f), dt).clone().normalize();
    const r = new THREE.Vector3().crossVectors(f, UP);
    if (r.lengthSq() < 1e-4) r.set(1, 0, 0);
    r.normalize();
    const u = new THREE.Vector3().crossVectors(r, f).normalize();
    const pos = ac.pos.clone().addScaledVector(f, -o.back).addScaledVector(u, o.up).addScaledVector(r, o.side ?? 0);
    const look = ac.pos.clone().addScaledVector(f, o.ahead ?? 0).addScaledVector(u, o.lookUp ?? 0);
    return { pos, look, fov: o.fov, handheld: 0.6 };
  }

  /**
   * Gövdeye bağlı açı: offset uçağın kendi ekseninde (x sağ kanat, y üst, z burun), bakış da öyle.
   * roll: uçağın yatışının ne kadarının kameraya geçeceği (0 = ufuk düz, 1 = uçakla birlikte döner).
   */
  wing(ac: Aircraft, o: { offset: [number, number, number]; look: [number, number, number]; roll?: number; fov: number }): Shot {
    // Uçağın ekseni: burun fwd, üst upv; sağ = fwd × upv
    _f.copy(ac.fwd);
    _u.copy(ac.upv);
    _r.crossVectors(_f, _u).normalize();
    const at = (v: [number, number, number]): THREE.Vector3 =>
      ac.pos.clone().addScaledVector(_r, v[0]).addScaledVector(_u, v[1]).addScaledVector(_f, v[2]);
    const up = UP.clone().lerp(_u, o.roll ?? 0.3).normalize();
    return { pos: at(o.offset), look: at(o.look), up, fov: o.fov, handheld: 0.4 };
  }

  /** Sabit noktadan izleyen operatör. */
  tripod(pos: THREE.Vector3, target: THREE.Vector3, dt: number, fov: number, lag = 0.08): Shot {
    this.aim.time = lag;
    return { pos: pos.clone(), look: this.aim.update(target, dt).clone(), fov, handheld: 1 };
  }

  /** İki çekim arası geçiş (k: 0 = a, 1 = b). */
  static blend(a: Shot, b: Shot, k: number): Shot {
    if (k <= 0) return a;
    if (k >= 1) return b;
    const up = (a.up ?? UP).clone().lerp(b.up ?? UP, k).normalize();
    return {
      pos: a.pos.clone().lerp(b.pos, k),
      look: a.look.clone().lerp(b.look, k),
      up,
      fov: lerp(a.fov, b.fov, k),
      handheld: lerp(a.handheld ?? 0, b.handheld ?? 0, k),
    };
  }

  /** Patlama sarsıntısı (0..1 arası katkı; üst üste binebilir). */
  shake(amount: number): void {
    this.shakeAmp = Math.min(1.5, this.shakeAmp + amount);
  }

  /** Çekimi kameraya uygula: arazinin altına girmez, titreme ve sarsıntı eklenir. */
  apply(shot: Shot, dt: number): void {
    this.time += dt;
    const cam = this.camera;
    const pos = shot.pos;
    const floor = groundLevel(pos.x, pos.z) + 3;
    if (pos.y < floor) pos.y = floor;
    cam.position.copy(pos);
    cam.up.copy(shot.up ?? UP);
    cam.lookAt(shot.look);
    // El kamerası: yavaş, küçük açısal salınım; sarsıntı: hızlı, sönümlenen
    const t = this.time;
    const hh = (shot.handheld ?? 0) * 0.0018;
    const sk = this.shakeAmp * 0.022;
    const yaw = hh * (Math.sin(t * 0.9) + 0.6 * Math.sin(t * 2.3 + 1.7)) + sk * (Math.sin(t * 61) + 0.7 * Math.sin(t * 37 + 0.4));
    const pitch = hh * (Math.sin(t * 1.3 + 0.5) + 0.5 * Math.sin(t * 3.1 + 2.1)) + sk * (Math.sin(t * 53 + 1.1) + 0.6 * Math.sin(t * 29 + 2.6));
    if (yaw || pitch) {
      _e.set(pitch, yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      cam.quaternion.multiply(_q);
    }
    this.shakeAmp *= Math.exp(-dt * 4.5);
    if (Math.abs(cam.fov - shot.fov) > 1e-3) cam.fov = shot.fov;
    cam.near = 0.5;
    cam.far = 260000;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    if (this.hasLast && dt > 0) this.vel.subVectors(pos, this.last).divideScalar(dt);
    else this.vel.set(0, 0, 0);
    this.last.copy(pos);
    this.hasLast = true;
    this.look.copy(shot.look);
    this.lookDist = Math.max(1, pos.distanceTo(shot.look));
  }

  /** Kesme: yeni çekimde hız ve yumuşatmalar sıfırdan başlar. */
  cut(): void {
    this.hasLast = false;
    this.heading.reset();
    this.aim.reset();
  }
}
