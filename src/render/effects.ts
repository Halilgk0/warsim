// Görsel efektler: low-poly duman/ateş "ponponları" (tek InstancedMesh), kalın iz mermileri (InstancedMesh)
// ve roketler.

import * as THREE from 'three';
import type { Bullet, Parachute, Rocket } from '../sim/world';
import { PALETTE } from './palette';
import { groundLevel } from '../sim/terrain';
import { G, rand } from '../core/math';

interface Puff {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  grow: number;
  drag: number;
  rise: number;
  color: THREE.Color;
  rot: number;
}

export interface PuffOpts {
  vel?: THREE.Vector3;
  size: number;
  life: number;
  color: number;
  grow?: number;
  drag?: number;
  rise?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();

export class Effects {
  readonly mesh: THREE.InstancedMesh;
  private puffs: Puff[] = [];

  constructor(private readonly max = 5000) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ flatShading: true }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  clear(): void {
    this.puffs.length = 0;
    this.mesh.count = 0;
  }

  spawn(pos: THREE.Vector3, o: PuffOpts): void {
    if (this.puffs.length >= this.max) return;
    this.puffs.push({
      pos: pos.clone(),
      vel: o.vel ? o.vel.clone() : new THREE.Vector3(),
      age: 0,
      life: o.life,
      size: o.size,
      grow: o.grow ?? 1,
      drag: o.drag ?? 1.5,
      rise: o.rise ?? 0,
      color: new THREE.Color(o.color),
      rot: Math.random() * 10,
    });
  }

  update(dt: number): void {
    const list = this.puffs;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y += p.rise * dt;
      p.pos.addScaledVector(p.vel, dt);
      list[w++] = p;
    }
    list.length = w;
    for (let i = 0; i < w; i++) {
      const p = list[i];
      const t = p.age / p.life;
      // Hızlı şişer, yavaşça söner
      const env = t < 0.12 ? t / 0.12 : 1 - Math.pow((t - 0.12) / 0.88, 1.6);
      const sc = p.size * env * (1 + t * p.grow);
      _s.set(sc, sc, sc);
      _q.setFromEuler(_e.set(p.rot, p.rot * 1.3, 0));
      _m.compose(p.pos, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, p.color);
    }
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // --- Hazır efektler -------------------------------------------------------

  /** Havada infilak: boyuta göre ateş topu ve kara duman bulutu. */
  airExplosion(pos: THREE.Vector3, vis: number, size = 6): void {
    const k = Math.max(1, size / 6);
    const s = Math.max(vis, 1);
    for (let i = 0; i < 14; i++) {
      this.spawn(pos, {
        vel: randDir().multiplyScalar(rand(10, 26) * k + rand(2, 8) * s),
        size: (rand(2.5, 5) * k + rand(1, 3) * s), life: rand(0.5, 1.1),
        color: PALETTE.fire[i % 3], grow: 1.3, drag: 2.5,
      });
    }
    this.spawn(pos, { size: 8 * k + 3 * s, life: 0.3, color: 0xfff3c4, grow: 0.6 });
    for (let i = 0; i < 12; i++) {
      this.spawn(pos, {
        vel: randDir().multiplyScalar(rand(5, 14) * k + s),
        size: rand(2.5, 5.5) * k + rand(1, 2.5) * s, life: rand(3, 6),
        color: i % 3 ? PALETTE.smokeDark : PALETTE.smoke, grow: 1.4, rise: 1.5, drag: 1.2,
      });
    }
  }

  groundExplosion(pos: THREE.Vector3, size: number): void {
    for (let i = 0; i < 12; i++) {
      const v = randDir();
      v.y = Math.abs(v.y) * 1.5;
      this.spawn(pos, {
        vel: v.multiplyScalar(rand(0.6, 1.4) * size), size: size * rand(0.25, 0.45),
        life: rand(0.5, 1.0), color: PALETTE.fire[i % 3], grow: 1, drag: 3,
      });
    }
    for (let i = 0; i < 10; i++) {
      const v = randDir();
      v.y = Math.abs(v.y);
      this.spawn(pos, {
        vel: v.multiplyScalar(rand(0.2, 0.6) * size), size: size * rand(0.3, 0.55),
        life: rand(4, 7), color: i % 2 ? PALETTE.smoke : PALETTE.smokeDark, grow: 1.4, rise: 4, drag: 1.5,
      });
    }
  }

  crash(pos: THREE.Vector3, vis: number): void {
    this.groundExplosion(pos, 10 * Math.min(Math.max(vis, 2), 6));
  }

  /** size: 1 ağır flak, 0.5 orta kalibre kendini imha. */
  flak(pos: THREE.Vector3, vis: number, size = 1): void {
    const s = Math.min(Math.max(vis, 1), 4) * size;
    this.spawn(pos, { size: 3 * s, life: 0.15, color: PALETTE.fire[0] });
    const n = size >= 1 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      this.spawn(pos.clone().add(randDir().multiplyScalar(2.5 * s)), {
        size: rand(3, 5) * s, life: rand(2.2, 3.2) * (size >= 1 ? 1 : 0.6), color: PALETTE.flak, grow: 0.6, drag: 1,
      });
    }
  }

  hit(pos: THREE.Vector3, vis: number): void {
    this.spawn(pos, { size: 1.6 * Math.min(vis, 8), life: 0.18, color: 0xfff0b0 });
  }

  /** Yere düşen mermi: toz ya da su sıçraması. */
  groundHit(pos: THREE.Vector3, vis: number, water: boolean): void {
    const s = Math.min(Math.max(vis, 1), 5);
    this.spawn(pos, {
      vel: new THREE.Vector3(0, rand(2, 5) * s, 0), size: rand(1.2, 2.2) * s, life: rand(0.5, 0.9),
      color: water ? PALETTE.splash : PALETTE.dust, grow: 0.8, drag: 3,
    });
  }

  muzzle(pos: THREE.Vector3, vis: number): void {
    this.spawn(pos, { size: 0.9 * Math.min(vis, 6), life: 0.06, color: 0xfff3c4 });
  }

  rocketTrail(pos: THREE.Vector3, vis: number): void {
    this.spawn(pos, { size: 1.2 * Math.min(vis, 5), life: 1.2, color: 0xe9e6ea, grow: 1.5, drag: 2 });
  }

  smokeTrail(pos: THREE.Vector3, vis: number, kind: 'burning' | 'damaged' | 'leak'): void {
    if (kind === 'burning') this.spawn(pos, { size: 2.2 * vis, life: 0.3, color: PALETTE.fire[1] });
    const leak = kind === 'leak';
    this.spawn(pos, {
      size: (kind === 'burning' ? 2.4 : leak ? 0.9 : 1.8) * vis, life: kind === 'burning' ? 2.4 : leak ? 1.1 : 1.6,
      color: kind === 'burning' ? PALETTE.smokeDark : leak ? 0xeef1f2 : PALETTE.smoke,
      grow: leak ? 2 : 1.4, rise: 0.5 * vis,
    });
  }

  buildingSmoke(pos: THREE.Vector3, heavy: boolean): void {
    this.spawn(pos, {
      vel: new THREE.Vector3(rand(-3, 3), rand(6, 10), rand(-3, 3)),
      size: rand(18, heavy ? 38 : 26), life: rand(6, 9),
      color: heavy ? PALETTE.smokeDark : PALETTE.smoke, grow: 1.6, rise: 2, drag: 0.4,
    });
  }
}

function randDir(): THREE.Vector3 {
  const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
  if (v.lengthSq() < 1e-4) v.set(0, 1, 0);
  return v.normalize();
}

/**
 * İz mermileri: her mermi, hız yönünde uzatılmış ince kutu (InstancedMesh). Kalınlık ve uzunluk
 * yakınlaştırmaya göre ölçeklenir; uzaktan da görülür. Takım renginde hafif ton farkı.
 */
export class Tracers {
  readonly mesh: THREE.InstancedMesh;
  private readonly colors = PALETTE.tracer.map((c) => new THREE.Color(c));
  private readonly aaColor = new THREE.Color(0xffe3a0);

  constructor(private readonly max = 5000) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  update(bullets: Bullet[], vis: number, scale: number): void {
    const n = Math.min(bullets.length, this.max);
    const width = (0.45 + 0.22 * Math.min(vis, 40)) * scale;
    const len = (14 + 2.2 * Math.min(vis, 30)) * scale;
    for (let i = 0; i < n; i++) {
      const b = bullets[i];
      _dir.copy(b.vel).normalize();
      _q.setFromUnitVectors(_z, _dir);
      _p.copy(b.pos).addScaledVector(_dir, -len / 2);
      _s.set(width, width, len);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, b.ownerId < 0 ? this.aaColor : this.colors[b.team] ?? this.colors[0]);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Roketler: küçük gövde + duman izi. */
export class RocketViews {
  readonly mesh: THREE.InstancedMesh;

  constructor(private readonly max = 400) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.8, 6).rotateX(Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: PALETTE.bomb, flatShading: true }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  update(rockets: Rocket[], vis: number, effects: Effects, emit: boolean): void {
    const n = Math.min(rockets.length, this.max);
    for (let i = 0; i < n; i++) {
      const r = rockets[i];
      _dir.copy(r.vel).normalize();
      _q.setFromUnitVectors(_z, _dir);
      const sc = Math.min(Math.max(vis, 1), 12);
      _s.set(sc, sc, sc);
      _m.compose(r.pos, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      if (emit) effects.rocketTrail(r.pos, vis);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface DebrisPiece {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: THREE.Vector3;
  burning: boolean;
  smoke: number;
  age: number;
}

/** Enkaz: infilak eden ya da parçalanan uçaktan kopan, dönerek düşen parçalar (görsel). */
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private pieces: DebrisPiece[] = [];

  constructor(private readonly max = 600) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x77727c, flatShading: true }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  clear(): void {
    this.pieces.length = 0;
    this.mesh.count = 0;
  }

  /** count parça; size ≈ parça boyu (m). count = 1 ise kanat gibi uzun yassı parça. */
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, count: number, size: number, burning: boolean): void {
    for (let i = 0; i < count && this.pieces.length < this.max; i++) {
      const wingPiece = count === 1;
      const v = vel.clone().add(randDir().multiplyScalar(rand(5, 22)));
      const s = wingPiece ? new THREE.Vector3(size, 0.25, size * 0.35) : new THREE.Vector3(rand(0.5, 1.3), rand(0.2, 0.6), rand(0.5, 1.5)).multiplyScalar(size);
      this.pieces.push({
        pos: pos.clone().add(randDir().multiplyScalar(size * 0.3)), vel: v, rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
        spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), size: s, burning: burning && (wingPiece || Math.random() < 0.6),
        smoke: Math.random() * 0.1, age: 0,
      });
    }
  }

  update(dt: number, effects: Effects, emit: boolean, scale: number): void {
    let w = 0;
    for (const p of this.pieces) {
      p.age += dt;
      // Parçalar hızla yavaşlar (yüksek sürükleme), sonra düşer
      p.vel.multiplyScalar(Math.exp(-0.5 * dt));
      p.vel.y -= G * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      if (emit && p.burning) {
        p.smoke -= dt;
        if (p.smoke <= 0) {
          p.smoke = 0.12;
          effects.smokeTrail(p.pos, Math.min(scale, 6) * 0.7, p.age < 6 ? 'burning' : 'damaged');
        }
      }
      if (p.pos.y <= groundLevel(p.pos.x, p.pos.z) || p.age > 90) {
        if (emit) effects.groundHit(p.pos, Math.min(scale, 4), false);
        continue;
      }
      this.pieces[w++] = p;
    }
    this.pieces.length = w;
    const k = Math.min(Math.max(scale, 1), 6);
    for (let i = 0; i < w; i++) {
      const p = this.pieces[i];
      _q.setFromEuler(p.rot);
      _s.copy(p.size).multiplyScalar(k);
      _m.compose(p.pos, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Paraşütler: beyaz kubbe ve altında küçük asılı pilot. */
export class ParachuteViews {
  readonly group = new THREE.Group();
  private readonly canopy: THREE.InstancedMesh;
  private readonly pilot: THREE.InstancedMesh;

  constructor(private readonly max = 120) {
    this.canopy = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1),
      new THREE.MeshLambertMaterial({ color: 0xf6f3ec, flatShading: true, side: THREE.DoubleSide }),
      max,
    );
    this.pilot = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.6, 0.4), new THREE.MeshLambertMaterial({ color: 0x6b6570 }), max);
    for (const m of [this.canopy, this.pilot]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
  }

  update(list: Parachute[], scale: number): void {
    const k = Math.min(Math.max(scale, 1), 10);
    let n = 0;
    for (const p of list) {
      if (n >= this.max || p.t < 0) continue;
      const open = Math.min(1, Math.max(0, (p.t - 2) / 1.2));
      _q.identity();
      _s.setScalar(4.2 * k * Math.max(open, 0.05));
      _p.copy(p.pos).setY(p.pos.y + 5.5 * k);
      _m.compose(_p, _q, _s);
      this.canopy.setMatrixAt(n, _m);
      _s.setScalar(k);
      _m.compose(p.pos, _q, _s);
      this.pilot.setMatrixAt(n, _m);
      n++;
    }
    this.canopy.count = n;
    this.pilot.count = n;
    this.canopy.instanceMatrix.needsUpdate = true;
    this.pilot.instanceMatrix.needsUpdate = true;
  }
}
