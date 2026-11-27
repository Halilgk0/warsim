// Taş sütunların görünüşü (2026-11-27, Kanyonlar haritası; sim/pillars.ts). Blender'da oyulmuş 9 çeşit (tools/blender/kaya.py):
// anıt vadisi kayaları gibi eklem çatlaklarıyla bölünmüş bloklar, kopmuş kenar blokları, katman sekileri, dikey oluklar,
// kapak kayası, dipte basamaklı moloz eteği; boya, normal haritası ve ortam gölgesi heykelden pişirilir.
// Kaliteye göre:
//   Düşük: her yerde uzak görünüş ağı (~220–300 üçgen, pillarShapes.ts içinde: indirme yok), 512 boya atlası.
//   Orta:  kameraya 6 km'ye dek ayrıntılı model (~1.500–2.800 üçgen, public/kaya/kaya.glb), 1024 boya ve normal.
//   Yüksek: 9 km'ye dek ayrıntılı model, 2048 boya ve normal, yakında ince katman ve taş deseni.
// Ayrıntılı model ve dokular yalnız Kanyonlar açılınca iner; o zamana dek uzak görünüş ağı. Çeşit başına örneklenmiş ağ
// (InstancedMesh): sütun başına dönüş, elips ölçeği (x: r·axd/ax, z: r·ax/axd) ve boy; çizim çağrısı çeşit sayısı kadar.

import * as THREE from 'three';
import type { Pillar } from '../sim/pillars';
import { PILLAR_SHAPES } from '../sim/pillarShapes';
import { NOISE_GLSL } from './desertRock';
import { linkAtmosphere } from './atmosphere';
import { linkCloudShadow } from './clouds';
import { bakedTexture, gltf } from './models';
import { rockGeos } from './props';
import { groundLevel } from '../sim/terrain';

/** Kaya dibi molozu (2026-11-27): kaidenin üstünde ve eteğinde iri kumtaşı blokları; Orta ve Yüksek'te, kameraya bu kadar yakın kayalarda. */
const DEBRIS_NEAR = 5000;

function hash1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Ayrıntılı modele geçiş uzaklığı (m; kalite başına). */
const NEAR = [0, 6000, 9000];
/** Örnek listeleri kamera bu kadar kayınca yenilenir (m). */
const REFRESH = 400;

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Uzak görünüş ağı (yüzler ayrık; konum birimli, UV atlasta, glTF gibi ters v). */
function lodGeometry(i: number): THREE.BufferGeometry {
  const s = PILLAR_SHAPES[i];
  const p = new Int16Array(b64(s.lp).buffer);
  const u = new Uint16Array(b64(s.lu).buffer);
  const pos = new Float32Array(p.length);
  for (let k = 0; k < p.length; k++) pos[k] = p[k] / 10000;
  const uv = new Float32Array(u.length);
  for (let k = 0; k < u.length; k += 2) {
    uv[k] = u[k] / 65535;
    uv[k + 1] = 1 - u[k + 1] / 65535;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Yakında ince katman çizgileri ve taş benekleri (yalnız Yüksek): uzakta söner, kıpırdamaz. */
const DETAIL_FS = /* glsl */ `
  float pillarDetail( vec3 wp, float lfw ) {
    float near = 1.0 - smoothstep( 0.6, 8.0, lfw );
    if ( near <= 0.0 ) return 1.0;
    vec2 lp = mod( wp.xz, 8192.0 );
    // İnce katmanlar (yatay, hafif dalgalı), dikey akıntı izleri (yatayda dar), taş benekleri (iki ölçek)
    float bed = sin( wp.y * 2.3 + tNoise( lp + wp.y * 0.05, 3000.0 ) * 5.0 ) * 0.5 + sin( wp.y * 5.1 ) * 0.25;
    float drip = tNoise( vec2( wp.x + wp.z, wp.y * 0.06 ) * 1.0, 9000.0 ) - 0.5;
    float grit = tNoise( lp * 1.7 + wp.y * 0.9, 16000.0 ) - 0.5;
    float blot = tNoise( lp * 0.6 - wp.y * 0.4, 5000.0 ) - 0.5;
    return 1.0 + near * ( 0.08 * bed + 0.16 * drip + 0.2 * grit + 0.14 * blot );
  }
`;

function rockMaterial(detail: boolean): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xb0603c });
  m.onBeforeCompile = (shader) => {
    linkAtmosphere(shader);
    linkCloudShadow(shader);
    if (!detail) return;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\n${DETAIL_FS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= pillarDetail( vCloudW, length( fwidth( vCloudW ) ) );`);
  };
  m.customProgramCacheKey = () => `pillarBaked${detail ? 1 : 0}`;
  return m;
}

interface Tex {
  albedo: THREE.Texture;
  normal: THREE.Texture | null;
}

export class PillarView {
  readonly group = new THREE.Group();
  private readonly list: readonly Pillar[];
  /** Sütunların örnek dönüşümü (sırası listeyle aynı). */
  private readonly mats: THREE.Matrix4[];
  private readonly far: THREE.InstancedMesh[] = [];
  private near: THREE.InstancedMesh[] = [];
  private readonly farMat = rockMaterial(false);
  private nearMat = rockMaterial(false);
  private level = -1;
  private nearGeos: THREE.BufferGeometry[] | null = null;
  private loading: Promise<void> | null = null;
  private readonly at = new THREE.Vector3(Infinity, 0, 0);
  private disposed = false;
  /** Moloz: sütun başına blokların dönüşümleri ve biçimleri; çizim biçim başına örneklenmiş. */
  private readonly debris: { mats: THREE.Matrix4[]; geo: number[] }[];
  private readonly debrisMesh: THREE.InstancedMesh[] = [];
  private readonly debrisMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  constructor(list: readonly Pillar[]) {
    this.list = list;
    this.group.name = 'pillars';
    this.mats = list.map((p) => {
      const s = PILLAR_SHAPES[p.shape];
      const c = Math.cos(p.rot);
      const n = Math.sin(p.rot);
      const sx = (p.r * s.axd) / p.ax;
      const sz = (p.r * p.ax) / s.axd;
      return new THREE.Matrix4().set(c * sx, 0, -n * sz, p.x, 0, p.tall, 0, p.base, n * sx, 0, c * sz, p.z, 0, 0, 0, 1);
    });
    // Moloz blokları: elipsin hemen dışından kaidenin eteğine (kayaya gömülmesin), dibe yakın olan iri
    const geos = rockGeos();
    this.debris = list.map((p, k) => {
      const n = Math.min(22, Math.round(8 + p.r / 35));
      const c = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const mats: THREE.Matrix4[] = [];
      const geo: number[] = [];
      for (let i = 0; i < n; i++) {
        const h = (j: number) => hash1(k * 97 + i * 13 + j);
        const t = h(1) * Math.PI * 2;
        const d = 1.04 + Math.pow(h(2), 1.6) * 0.7;
        const u = (Math.cos(t) * d * p.r) / p.ax;
        const v = Math.sin(t) * d * p.r * p.ax;
        const x = p.x + c * u - sn * v;
        const z = p.z + sn * u + c * v;
        const size = Math.max(3, Math.min(24, p.r * (0.025 + 0.05 * h(3)) * (1.5 - (d - 1.04))));
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((h(4) - 0.5) * 0.6, h(5) * Math.PI * 2, (h(6) - 0.5) * 0.6));
        const s = new THREE.Vector3(size * (0.8 + 0.5 * h(7)), size * (0.5 + 0.4 * h(8)), size * (0.8 + 0.5 * h(9)));
        mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, groundLevel(x, z) - s.y * 0.25, z), q, s));
        geo.push(Math.floor(h(10) * geos.length) % geos.length);
      }
      return { mats, geo };
    });
    this.debrisMat.onBeforeCompile = (shader) => {
      linkAtmosphere(shader);
      linkCloudShadow(shader);
    };
    this.debrisMat.customProgramCacheKey = () => 'pillarDebris';
    const tint = [0x9c5434, 0x8a4a2e, 0xa8683f].map((h) => new THREE.Color(h));
    geos.forEach((g, gi) => {
      const cap = this.debris.reduce((a, d) => a + d.geo.filter((x) => x === gi).length, 0);
      const m = new THREE.InstancedMesh(g, this.debrisMat, Math.max(1, cap));
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3), 3);
      for (let i = 0; i < Math.max(1, cap); i++) m.setColorAt(i, tint[i % tint.length]);
      this.debrisMesh.push(m);
      this.group.add(m);
    });
    for (let i = 0; i < PILLAR_SHAPES.length; i++) {
      const count = list.filter((p) => p.shape === i).length;
      const m = new THREE.InstancedMesh(lodGeometry(i), this.farMat, Math.max(1, count));
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      this.far.push(m);
      this.group.add(m);
    }
  }

  /** Kalite: 0 Düşük, 1 Orta, 2 Yüksek. Dokular ve ayrıntılı model gerekince bir kez iner. */
  setQuality(level: number): void {
    if (level === this.level) return;
    this.level = level;
    const size = level === 2 ? '' : level === 1 ? '_1k' : '_512';
    void this.loadTextures(size, level > 0).then((t) => {
      if (this.disposed || this.level !== level || !t) return;
      this.farMat.map = t.albedo;
      this.farMat.color.set(0xffffff);
      this.farMat.needsUpdate = true;
      const nm = rockMaterial(level === 2);
      nm.map = t.albedo;
      nm.normalMap = t.normal;
      nm.color.set(0xffffff);
      this.nearMat.dispose();
      this.nearMat = nm;
      for (const m of this.near) m.material = nm;
    });
    if (level > 0) void this.loadModels();
    this.at.set(Infinity, 0, 0);
  }

  private async loadTextures(size: string, normal: boolean): Promise<Tex | null> {
    try {
      const [albedo, nrm] = await Promise.all([
        bakedTexture(`kaya/kaya_albedo${size}.webp`, true),
        normal ? bakedTexture(`kaya/kaya_normal${size}.webp`, false) : Promise.resolve(null),
      ]);
      return { albedo, normal: nrm };
    } catch {
      return null;
    }
  }

  private loadModels(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const g = await (await gltf()).loadAsync(`${import.meta.env.BASE_URL}kaya/kaya.glb`);
        if (this.disposed) return;
        const geos: THREE.BufferGeometry[] = [];
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          const id = /^k(\d+)$/.exec(m.name);
          if (m.isMesh && id) geos[Number(id[1])] = (m.geometry as THREE.BufferGeometry).clone().applyMatrix4(m.matrixWorld);
        });
        this.nearGeos = geos;
        for (let i = 0; i < PILLAR_SHAPES.length; i++) {
          const geo = geos[i] ?? this.far[i].geometry;
          const count = this.list.filter((p) => p.shape === i).length;
          const m = new THREE.InstancedMesh(geo, this.nearMat, Math.max(1, count));
          m.count = 0;
          m.frustumCulled = false;
          m.castShadow = true;
          this.near.push(m);
          this.group.add(m);
        }
        this.at.set(Infinity, 0, 0);
      } catch {
        /* internetsiz: uzak görünüş ağı kalır */
      }
    })();
    return this.loading;
  }

  /** Örnek listeleri: kameraya yakın sütunlar ayrıntılı modelle (yüklendiyse ve kalite izin veriyorsa). */
  update(cam: THREE.Vector3): void {
    if (Math.hypot(cam.x - this.at.x, cam.z - this.at.z) < REFRESH && Math.abs(cam.y - this.at.y) < REFRESH) return;
    this.at.copy(cam);
    const nearR = this.nearGeos && this.level > 0 ? NEAR[this.level] : 0;
    const nf = new Array(PILLAR_SHAPES.length).fill(0);
    const nn = new Array(PILLAR_SHAPES.length).fill(0);
    this.list.forEach((p, k) => {
      const d = Math.hypot(p.x - cam.x, p.z - cam.z, (p.base + p.tall * 0.5 - cam.y) * 0.5) - p.r;
      const s = p.shape;
      if (d < nearR) this.near[s].setMatrixAt(nn[s]++, this.mats[k]);
      else this.far[s].setMatrixAt(nf[s]++, this.mats[k]);
    });
    this.far.forEach((m, s) => {
      m.count = nf[s];
      m.instanceMatrix.needsUpdate = true;
    });
    this.near.forEach((m, s) => {
      m.count = nn[s];
      m.instanceMatrix.needsUpdate = true;
    });
    // Moloz: yalnız Orta ve Yüksek'te, yakın kayalarda
    const nd = this.debrisMesh.map(() => 0);
    if (this.level > 0) {
      this.list.forEach((p, k) => {
        if (Math.hypot(p.x - cam.x, p.z - cam.z) - p.r * 1.8 > DEBRIS_NEAR) return;
        const d = this.debris[k];
        d.mats.forEach((mt, i) => this.debrisMesh[d.geo[i]].setMatrixAt(nd[d.geo[i]]++, mt));
      });
    }
    this.debrisMesh.forEach((m, i) => {
      m.count = nd[i];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const m of [...this.far, ...this.near]) {
      m.geometry.dispose();
      m.dispose();
    }
    this.farMat.dispose();
    this.nearMat.dispose();
    for (const m of this.debrisMesh) m.dispose();
    this.debrisMat.dispose();
  }
}
