// Düşen uçak parçaları (2026-11-21): uçak havada infilak edince, kanadı ya da kuyruğu kopunca uçağın kendi modelinin
// parçaları (models.ts fractureModel: gövde, kuyruk, sol ve sağ kanat; Blender dokulu modelde kendi boyasıyla) ayrı ayrı
// düşer. Yalnız çizim: simülasyonda uçak tek parça düşer, parçalar oyunu etkilemez.
//
// - Parça kendi ağırlık merkezi çevresinde döner (dış grup merkezde, iç grup −merkezde).
// - Hava direnci parçaya göre: gövde ağır ve kompakt (son hızı ~100 m/s), kanat yaprak gibi yavaş ve takla atarak düşer.
// - Yanan parça alev ve kara duman bırakır, sonra yalnız duman; yere çarpınca gövde ve kuyruk patlar ve yanmayı sürdürür
//   (effects.ts burn), kanat toz kaldırır.
// - En çok MAX parça; eskisi önce gider.

import * as THREE from 'three';
import { fractureModel, type WreckPart } from './models';
import type { Effects } from './effects';
import { groundLevel, terrainHeight } from '../sim/terrain';
import { G } from '../core/math';

interface Wreck {
  outer: THREE.Group;
  part: WreckPart;
  vel: THREE.Vector3;
  /** Açısal hız (rad/sn, dünya ekseninde). */
  spin: THREE.Vector3;
  /** Hız sönümü (1/sn): son hız ≈ g / drag. */
  drag: number;
  age: number;
  /** Kalan yanma süresi (sn). */
  burn: number;
  /** Parçanın yarıçapı (m, gerçek ölçek). */
  radius: number;
}

const MAX = 48;
const LIFE = 120;
const DRAG: Record<WreckPart, number> = { body: 0.1, tail: 0.2, wingL: 0.34, wingR: 0.34 };

const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _c = new THREE.Vector3();

export class Wrecks {
  readonly group = new THREE.Group();
  private list: Wreck[] = [];

  clear(): void {
    for (const w of this.list) this.group.remove(w.outer);
    this.list.length = 0;
  }

  /**
   * Parçayı uçağın o anki yerinde ve yönünde çıkar. pos/quat: uçağın çizilen konumu ve yönü; scale: modelin o anki
   * büyütmesi (uzaktan bakışta modeller büyütülür); vel ve spin dünya ekseninde.
   */
  spawn(kind: string, detail: number, part: WreckPart, pos: THREE.Vector3, quat: THREE.Quaternion, scale: number, vel: THREE.Vector3, spin: THREE.Vector3, burn: number): void {
    const piece = fractureModel(kind, detail).parts[part];
    if (!piece) return;
    if (this.list.length >= MAX) this.drop(0);
    const outer = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.copy(piece.center).negate();
    for (const m of piece.meshes) inner.add(new THREE.Mesh(m.geo, m.mat));
    outer.add(inner);
    outer.position.copy(piece.center).multiplyScalar(scale).applyQuaternion(quat).add(pos);
    outer.quaternion.copy(quat);
    outer.scale.setScalar(scale);
    this.group.add(outer);
    this.list.push({ outer, part, vel: vel.clone(), spin: spin.clone(), drag: DRAG[part], age: 0, burn, radius: piece.radius });
  }

  private drop(i: number): void {
    this.group.remove(this.list[i].outer);
    this.list.splice(i, 1);
  }

  /** emit: efektler açık ve oyun akıyor; scale: modellerin o anki büyütmesi; vis: efekt büyütmesi. */
  update(dt: number, effects: Effects, emit: boolean, scale: number, vis: number): void {
    if (dt <= 0) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      w.age += dt;
      w.vel.multiplyScalar(Math.exp(-w.drag * dt));
      w.vel.y -= G * dt;
      const o = w.outer;
      o.position.addScaledVector(w.vel, dt);
      const ang = w.spin.length();
      if (ang > 1e-4) {
        _q.setFromAxisAngle(_ax.copy(w.spin).divideScalar(ang), ang * dt);
        o.quaternion.premultiply(_q);
      }
      // Dönüş hava direnciyle biraz söner, kanat düşerken takla atmayı sürdürür
      w.spin.multiplyScalar(Math.exp(-(w.part === 'body' ? 0.15 : 0.05) * dt));
      o.scale.setScalar(scale);
      if (emit) {
        if (w.burn > 0) w.burn -= dt;
        // Yanan parça alev ve kesintisiz kara duman, yanması bitmiş gövde gri duman bırakır; kanat yanmıyorsa iz bırakmaz
        const kind = w.burn > 0 ? 'burning' : w.part === 'body' ? 'damaged' : null;
        if (kind) effects.trail(w, 0, o.position, Math.min(vis, 8) * (w.part === 'body' ? 0.6 : 0.4), kind, w.vel);
      }
      const g = groundLevel(o.position.x, o.position.z);
      if (o.position.y - g < Math.max(1, w.radius * scale * 0.15)) {
        _c.copy(o.position).setY(g);
        if (emit) {
          if (w.part === 'body' || w.part === 'tail') effects.crash(_c, vis);
          else effects.groundHit(_c, vis, terrainHeight(_c.x, _c.z) < 0);
        }
        this.drop(i);
        continue;
      }
      if (w.age > LIFE) this.drop(i);
    }
  }
}
