// Haritanın çiftlikleri (2026-11-17): tarla bölgelerindeki çiftlikler (yerleri scenery.ts seçer) yakında ayrıntılı modelle
// çizilir: avlu, çiftlik evi (şehir evleri), büyük ahır, silo, kümes, inekli otlak, sebze bahçesi ve meyvelik, traktör ve
// saman arabası (cityModels.ts). Eskiden yalnız renkli kutulardı.
// - Yakın (NEAR): ayrıntılı model, kameraya yakın olan önce, kare başına küçük dilimlerle kurulur (telefonda takılmasın);
//   KEEP'ten uzaklaşınca bellekten atılır.
// - Uzak: ahır, ev ve silo için birkaç kutu (örneklenmiş, bütün harita tek çağrıda). Ayrıntılı model görünen çiftliğin
//   kutuları gizlenir: ikisi üst üste binmez, model henüz kurulmadıysa kutular yerinde kalır.
// - Yalnız görüntü. Üstüne yapı kurulan çiftlik scenery.ts'in listesinden düşer (yeni liste, farmVersion).

import * as THREE from 'three';
import { groundLevel } from '../sim/terrain';
import { mulberry32 } from '../core/math';
import { ArchBatch, archMaterial, setArchLit } from './arch';
import { buildCityModel, buildDecorModel, cityParts } from './cityModels';
import { groundStructure } from './ground';
import { BOX, CYL, GABLE } from './props';
import { shadedLambert } from './scenery';
import type { StructureKind } from '../sim/structures/structure';

export interface FarmSpot {
  x: number;
  z: number;
  /** Çiftliğin yönü (radyan; Y dönüşü). */
  yaw: number;
  seed: number;
}

/** Ayrıntılı modelin göründüğü uzaklık (m; kameradan). */
const NEAR = 3200;
/** Bu uzaklıktan sonra ayrıntılı model bellekten atılır. */
const KEEP = 9000;
/** Kare başına kurulum süresi (ms). */
const BUDGET = 4;

/** Çiftlik evi türleri ve arsa yarı genişlikleri (cityModels.ts garden P). */
const HOUSES: [StructureKind, number][] = [['midhouse', 13.5], ['house', 16], ['house', 16]];

/** Yerel (x, z) → yaw kadar dönmüş (three.js rotateY ile aynı). */
function rot(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

interface Farm {
  spot: FarmSpot;
  group: THREE.Group | null;
  /** Ayrıntılı model görünüyor (uzak kutular gizli). */
  near: boolean;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class FarmLayer {
  readonly group = new THREE.Group();
  private readonly mat = archMaterial();
  /** Gece penceresi yanmayan çiftlikler. */
  private readonly darkMat = archMaterial();
  private readonly farMat = shadedLambert({ flatShading: true }, 'farmFarCloud');
  private farms: Farm[] = [];
  private version = -1;
  /** Uzak kutular: duvarlar (ahır, ev), çatılar (ahır, ev), silolar; çiftlik başına sabit sırada. */
  private far: { mesh: THREE.InstancedMesh; per: number; mats: THREE.Matrix4[] }[] = [];

  constructor(scene: THREE.Scene) {
    setArchLit(this.darkMat, 0);
    scene.add(this.group);
  }

  /** Her kare: liste değiştiyse uzak kutuları yeniden kur; yakın modelleri dilimle kur, göster, gizle, at. */
  sync(spots: readonly FarmSpot[], version: number, cam: THREE.Vector3, camDist: number, enabled: boolean): void {
    if (version !== this.version) {
      this.version = version;
      this.reset(spots);
    }
    this.group.visible = enabled && camDist < 20000;
    if (!this.group.visible || !this.farms.length) return;
    const t0 = performance.now();
    while (performance.now() - t0 < BUDGET) {
      let best: Farm | null = null;
      let bd = Infinity;
      for (const f of this.farms) {
        if (f.group) continue;
        const d = this.dist(f, cam);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (!best || bd > NEAR * 1.25) break;
      this.build(best);
    }
    let dirty = false;
    this.farms.forEach((f, i) => {
      const d = this.dist(f, cam);
      if (f.group && d > KEEP) {
        this.dispose(f);
      }
      const near = !!f.group && d < NEAR;
      if (f.group) f.group.visible = near;
      if (near !== f.near) {
        f.near = near;
        for (const l of this.far) {
          for (let k = 0; k < l.per; k++) l.mesh.setMatrixAt(i * l.per + k, near ? ZERO : l.mats[i * l.per + k]);
        }
        dirty = true;
      }
    });
    if (dirty) for (const l of this.far) l.mesh.instanceMatrix.needsUpdate = true;
  }

  private dist(f: Farm, cam: THREE.Vector3): number {
    const s = f.spot;
    return Math.hypot(s.x - cam.x, groundLevel(s.x, s.z) - cam.y, s.z - cam.z);
  }

  /** Yeni liste: aynı tohumlu çiftliğin modeli korunur, ötekiler atılır; uzak kutular baştan. */
  private reset(spots: readonly FarmSpot[]): void {
    const old = new Map(this.farms.map((f) => [f.spot.seed, f]));
    this.farms = spots.map((s) => {
      const o = old.get(s.seed);
      if (o && o.spot.x === s.x && o.spot.z === s.z) {
        old.delete(s.seed);
        o.near = false;
        return o;
      }
      return { spot: s, group: null, near: false };
    });
    for (const f of old.values()) this.dispose(f);
    for (const l of this.far) {
      this.group.remove(l.mesh);
      l.mesh.dispose();
    }
    this.far = [];
    if (!spots.length) return;
    // Uzak kutular: ahır (13×22, 6,3 m ve beşik çatı), ev (10×9, 6 m), silo (r 2,8, 15 m); renkler ayrıntılı modele yakın
    const walls: THREE.Matrix4[] = [];
    const wallC: number[] = [];
    const roofs: THREE.Matrix4[] = [];
    const roofC: number[] = [];
    const silos: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const m = (x: number, z: number, yaw: number, lx: number, lz: number, y: number, ry: number, sx: number, sy: number, sz: number) => {
      const [ox, oz] = rot(lx, lz, yaw);
      const px = x + ox;
      const pz = z + oz;
      q.setFromAxisAngle(up, yaw + ry);
      return new THREE.Matrix4().compose(new THREE.Vector3(px, groundLevel(px, pz) - 0.4 + y, pz), q, new THREE.Vector3(sx, sy, sz));
    };
    for (const s of spots) {
      const r = mulberry32(s.seed);
      walls.push(m(s.x, s.z, s.yaw, 32, -4, 0, -Math.PI / 2, 13, 6.3, 22), m(s.x, s.z, s.yaw, -40, 2, 0, Math.PI / 2, 10, 6, 9));
      wallC.push([0x6e3a2c, 0x5e4a36, 0x6a5038][Math.floor(r() * 3)], [0xc8b68c, 0xb9b4a8, 0xc0ac96][Math.floor(r() * 3)]);
      roofs.push(m(s.x, s.z, s.yaw, 32, -4, 6.3, -Math.PI / 2, 14.6, 5, 23.6), m(s.x, s.z, s.yaw, -40, 2, 6, Math.PI / 2, 11, 3.6, 10));
      roofC.push([0x5a5e66, 0x7c422c, 0x4a4b50][Math.floor(r() * 3)], [0x8e4a30, 0x7c422c, 0x55595f][Math.floor(r() * 3)]);
      silos.push(m(s.x, s.z, s.yaw, 29, -24, 0, 0, 2.8, 15.5, 2.8));
    }
    const inst = (geo: THREE.BufferGeometry, mats: THREE.Matrix4[], cols: number[] | null, color: number, per: number) => {
      const mesh = new THREE.InstancedMesh(geo, this.farMat, mats.length);
      const c = new THREE.Color();
      mats.forEach((mm, i) => {
        mesh.setMatrixAt(i, mm);
        mesh.setColorAt(i, c.setHex(cols ? cols[i] : color));
      });
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      this.group.add(mesh);
      this.far.push({ mesh, per, mats });
    };
    inst(BOX, walls, wallC, 0, 2);
    inst(GABLE, roofs, roofC, 0, 2);
    inst(CYL, silos, null, 0xa8a294, 1);
  }

  private dispose(f: Farm): void {
    if (!f.group) return;
    this.group.remove(f.group);
    f.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    f.group = null;
  }

  /**
   * Ayrıntılı çiftlik (yerel eksenler, yaw kadar döner): ortada avlu, batısında çiftlik evi (avluya bakar), doğusunda büyük
   * ahır (kapısı avluya), ahırın arkasında silo, güneyde kümes, avluda kuyu; önde (+z) inekli otlak ve sebze bahçesiyle
   * meyvelik; çevrede birkaç büyük ağaç. Kaplanan alan ~110 × 80 m.
   */
  private build(f: Farm): void {
    const s = f.spot;
    const rng = mulberry32(s.seed);
    const g = new THREE.Group();
    const y0 = groundLevel(s.x, s.z);
    g.position.set(s.x, y0, s.z);
    const b = new ArchBatch();
    const yaw = s.yaw;
    const put = (lx: number, lz: number, ry: number): void => {
      const [ox, oz] = rot(lx, lz, yaw);
      b.setOrigin(ox, oz, yaw + ry);
    };
    put(0, 0, 0);
    buildDecorModel('farmyard', rng, b);
    const [kind, P] = HOUSES[Math.floor(rng() * HOUSES.length)];
    put(-(23 + P + 1), 2, Math.PI / 2);
    buildCityModel(kind, rng, b);
    put(32, -4, -Math.PI / 2);
    buildDecorModel('farmbarn', rng, b);
    put(29, -24, 0);
    buildDecorModel('silo', rng, b);
    put(-6, -27, 0);
    buildDecorModel('coop', rng, b);
    put(-12, -10, 0);
    buildDecorModel('well', rng, b);
    put(16, 38, 0);
    buildDecorModel('paddock', rng, b);
    put(-36, 36, 0);
    buildDecorModel('orchard', rng, b);
    // Çevrede büyük ağaçlar (rüzgâr kıranı)
    put(0, 0, 0);
    for (const [tx, tz] of [[-30, -30], [44, 16], [-58, 8], [46, -26], [-20, 56]] as const) {
      if (rng() < 0.75) cityParts.tree(b, rng, tx + (rng() - 0.5) * 6, tz + (rng() - 0.5) * 6, 10 + rng() * 6);
    }
    // Çiftliklerin yarısında gece pencereler yanar (modelin rastgele akışından ayrı)
    const lit = mulberry32(s.seed ^ 0x51ed27)() < 0.5;
    b.build(g, lit ? this.mat : this.darkMat);
    groundStructure(g, y0);
    g.updateMatrixWorld(true);
    f.group = g;
    this.group.add(g);
  }
}
