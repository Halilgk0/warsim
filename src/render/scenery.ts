// Harita süsü (yalnız görsel): ormanlarda 3B ağaçlar, dağlarda kayalar, şehirleri ve üsleri bağlayan yollar,
// yol boyunca köyler, tarlalarda çiftlikler ve dekor şehirleri (sokak ızgarası, evler, apartmanlar, parklar).
// Ağaç ve kayalar arazi parçası başına, kameraya yakınken üretilir; yollar ve yerleşimler açılışta bir kez.

import * as THREE from 'three';
import { MAP_HALF as HALF, MAP_SCALE, MAP_SIZE } from '../sim/mapData';
import { TERRAIN_CELL, TERRAIN_N, groundLevel, terrainHeight, terrainMap } from '../sim/terrain';
import { mapById } from '../sim/maps';
import { monumentShare } from '../sim/mapKanyon';
import { pillarList } from '../sim/pillars';
import { buildPillarGroup, pillarMaterial } from './pillars';
import { chunkCells } from './terrain';
import { clamp, mulberry32, smoothstep } from '../core/math';
import { cleared, clearingsVersion, fieldGrid, forestGrid, sampleGrid, sampleSmooth, slopeGrid, urbanGrid } from './landcover';
import { makeFbm } from '../core/noise';

/** Açık arazideki ağaç kümeleri (koru, ağaç öbeği): eşit serpiştirme yerine öbek öbek. */
const fbmGrove = makeFbm(6151, 3);

/** Ağaç konmayacak yerler ızgarası: yollar, köyler, çiftlikler, şehirler (KEEP_CELL m'lik hücreler). */
const KEEP_CELL = 40;
import { broadleafFarGeo, broadleafGeo, coniferFarGeo, coniferGeo, freeze, rockGeos } from './props';
import { linkAtmosphere } from './atmosphere';
import type { FarmSpot } from './farms';
import { linkCloudShadow } from './clouds';
import { groundU } from './groundTex';

type TreeShader = { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string };

/**
 * Yaprak dokusu: taç rengi ortak zemin dokusuyla beneklenir (tek doku okuması; dünya konumundan, ağaçtan ağaca farklı
 * düşer). Köşe konumu project_vertex'ten önce okunur: çağıranın begin_vertex değişikliği (küçültme) hesaba girer.
 */
function leafy(shader: TreeShader): void {
  Object.assign(shader.uniforms, groundU);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vLeafUv;')
    .replace('#include <project_vertex>', [
      '#ifdef USE_INSTANCING',
      '  vec3 leafW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;',
      '#else',
      '  vec3 leafW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      '#endif',
      'vLeafUv = ( mod( leafW.xz, 4096.0 ) + leafW.y * vec2( 1.1, 0.8 ) ) / 4.0;',
      '#include <project_vertex>',
    ].join('\n'));
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D terrGrass;\nvarying vec2 vLeafUv;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix( vec3( 1.0 ), texture2D( terrGrass, vLeafUv ).rgb * 2.0, 0.65 );');
}

/**
 * Taş dokusu (kayalar, 2026-11-17): zemin dokusunun parlaklığı dünya konumundan okunur; yüz yukarı bakıyorsa üstten, yana
 * bakıyorsa yandan izdüşürülür (dikey yüzde çizgi çizgi uzamaz). İki ölçek: tane ve leke. Renk değil, yalnız parlaklık.
 */
function stony(shader: TreeShader): void {
  Object.assign(shader.uniforms, groundU);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vRockW;')
    .replace('#include <project_vertex>', [
      '#ifdef USE_INSTANCING',
      '  vRockW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;',
      '#else',
      '  vRockW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      '#endif',
      '#include <project_vertex>',
    ].join('\n'));
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D terrGrass;\nvarying vec3 vRockW;')
    .replace('#include <color_fragment>', [
      '#include <color_fragment>',
      '{',
      '  vec3 wn = normalize( cross( dFdx( vRockW ), dFdy( vRockW ) ) );',
      '  vec2 uv = abs( wn.y ) > 0.6 ? vRockW.xz : vec2( vRockW.x + vRockW.z, vRockW.y * 1.6 );',
      '  float fine = dot( texture2D( terrGrass, uv / 2.5 ).rgb, vec3( 0.3, 0.59, 0.11 ) ) * 2.0;',
      '  float blot = dot( texture2D( terrGrass, uv / 19.0 + 0.37 ).rgb, vec3( 0.3, 0.59, 0.11 ) ) * 2.0;',
      '  diffuseColor.rgb *= mix( 1.0, fine, 0.7 ) * mix( 1.0, blot, 0.55 );',
      '}',
    ].join('\n'));
}

/** Bulut gölgesi alan düz Lambert malzemesi (ağaç, kaya, köy evleri). */
export function shadedLambert(o: THREE.MeshLambertMaterialParameters, key: string): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial(o);
  m.onBeforeCompile = (shader) => {
    linkAtmosphere(shader);
    linkCloudShadow(shader);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** Parça kenarı (m) — arazi parçalarıyla aynı; harita büyüklüğüyle değişir (rebuild günceller; dizi en çok parçaya göre). */
let CHUNK = 64 * TERRAIN_CELL;
let NC = TERRAIN_N / 64;

// Gerçekçi tonlar: koyu yaz yeşili ağaçlar, gri kaya
const TREES_B = [0x5e8c44, 0x54803e, 0x69964c, 0x4c7a3a, 0x709c50];
const TREES_C = [0x3f6a46, 0x38623f, 0x4a7650];
/** Çöl ardıcı ve pinyon çamı: tozlu zeytin yeşili (Kanyonlar). */
const TREES_D = [0x66704a, 0x5c6844, 0x737a52];
/** Adaçayı ve tavşan çalısı: açık gri yeşil (anıt vadisi havzası). */
const TREES_SAGE = [0x9aa477, 0x8c9868, 0xa6ad84, 0x7f8c5e, 0x6f7a4c, 0x7d8550, 0xb0a970];
const ROCKS = [0x8f8a84, 0x847f7a, 0x9a948c, 0x7a7672, 0x86837c, 0x7e8082, 0x8e8a82];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

/** Büyüyebilen örnek listesi → InstancedMesh. */
class InstList {
  readonly mats: number[] = [];
  readonly cols: number[] = [];
  push(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, color: number): void {
    _p.set(x, y, z);
    _q.setFromAxisAngle(_up, yaw);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    this.mats.push(..._m.elements);
    _c.setHex(color);
    this.cols.push(_c.r, _c.g, _c.b);
  }
  get count(): number {
    return this.cols.length / 3;
  }
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh | null {
    const n = this.count;
    if (!n) return null;
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.array.set(this.mats);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cols), 3);
    m.computeBoundingSphere();
    return m;
  }
}

// Ağaç ayrıntı düzeyleri: kameraya yakın halkadaki ağaçlar tam modelle (gövde + taç), ötesi basit taçla çizilir.
// Basit taçlar sık taç yarıçapı ötesinde dörtte bire seyrelir ve sönme aralığında küçülerek söner (uzakta piksel altı ağaçlar
// ormanı siyah noktalı gösteriyordu). Eskiden kameraya yakın parçaların (9 km) bütün ağaçları tam modeldi: yakın
// görünümde 2,5–3,7 milyon üçgen.
// Uzaklıklar grafik kalitesinden gelir (ui/settings QUALITY); aşağıdakiler Yüksek basamağın değerleri.
/** Kamera bu kadar kayınca yakın ağaçlar yeniden toplanır. */
const NEAR_MOVE = 120;
/** Yakın ağaç katmanının kapasitesi (tür başına). */
const NEAR_CAP = 16384;
/** Sık taç blokları (parça kenarı başına) ve seyrek taç blokları: yalnız kameraya yeterince yakın bloklar çizilir. */
const DENSE_BLOCKS = 4;
const SPARSE_BLOCKS = 2;

/** Bir blok basit taç: tür, kare alan, sık mı seyrek mi. */
interface TreeBlock {
  mesh: THREE.InstancedMesh;
  species: number;
  dense: boolean;
  x0: number;
  z0: number;
  size: number;
}

/** Yerleşim blokları (m): yalnız kameranın yakınındaki bloklar çizilir (Yüksek kalitede 10 km) (eskiden bütün haritanın köy ve
 * şehirleri birlikte çiziliyordu: kamera 20 km'den yakınken 1,4–1,7 milyon üçgen). */
let SETTLE_BLOCK = CHUNK;

interface SettleBlock {
  group: THREE.Group;
  x0: number;
  z0: number;
}

interface Chunk {
  group: THREE.Group | null;
  version: number;
  trees: TreeBlock[];
}

/** Noktanın kare alana (x0, z0 köşesi, kenarı s) yatay uzaklığı. */
function rectDist(x: number, z: number, x0: number, z0: number, s: number): number {
  const dx = Math.max(x0 - x, 0, x - (x0 + s));
  const dz = Math.max(z0 - z, 0, z - (z0 + s));
  return Math.hypot(dx, dz);
}

/**
 * Örnek aralığını [a, b) kare bloklara böl, her dolu blok için basit taç ağı. Yaklaşık sıralama korunur.
 */
function farBlocks(
  geo: THREE.BufferGeometry, mat: THREE.Material, species: number, dense: boolean, list: { mats: number[]; cols: number[] },
  a: number, b: number, x0: number, z0: number, nb: number,
): TreeBlock[] {
  const size = CHUNK / nb;
  const buckets: number[][] = Array.from({ length: nb * nb }, () => []);
  for (let i = a; i < b; i++) {
    const bx = clamp(Math.floor((list.mats[i * 16 + 12] - x0) / size), 0, nb - 1);
    const bz = clamp(Math.floor((list.mats[i * 16 + 14] - z0) / size), 0, nb - 1);
    buckets[bz * nb + bx].push(i);
  }
  const out: TreeBlock[] = [];
  buckets.forEach((idx, k) => {
    if (!idx.length) return;
    const m = new THREE.InstancedMesh(geo, mat, idx.length);
    const ma = m.instanceMatrix.array as Float32Array;
    const ca = new Float32Array(idx.length * 3);
    idx.forEach((i, o) => {
      for (let e = 0; e < 16; e++) ma[o * 16 + e] = list.mats[i * 16 + e];
      ca[o * 3] = list.cols[i * 3];
      ca[o * 3 + 1] = list.cols[i * 3 + 1];
      ca[o * 3 + 2] = list.cols[i * 3 + 2];
    });
    m.instanceColor = new THREE.InstancedBufferAttribute(ca, 3);
    m.computeBoundingSphere();
    out.push({ mesh: m, species, dense, x0: x0 + (k % nb) * size, z0: z0 + Math.floor(k / nb) * size, size });
  });
  return out;
}

export class Scenery {
  /** Çöl haritası (Kanyonlar): ardıç ve kavak (harita değişince güncellenir). */
  private desert = false;
  /** Taş sütunların ağları (yalnız sütunlu haritada). */
  private pillars: THREE.Group | null = null;
  private readonly pillarMat = pillarMaterial();
  readonly group = new THREE.Group();
  /** Kayalar: yüz yüz ton (köşe rengi) ve taş dokusu. */
  private readonly vegMat = ((): THREE.MeshLambertMaterial => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    m.onBeforeCompile = (shader) => {
      linkAtmosphere(shader);
      linkCloudShadow(shader);
      stony(shader);
    };
    m.customProgramCacheKey = () => 'rockStone';
    return m;
  })();
  /** Yakın ağaçlar: yaprak dokulu (kayalar vegMat'te kalır). */
  private readonly treeNearMat = ((): THREE.MeshLambertMaterial => {
    // Yumuşak gölgelenme: taç normalleri öbek merkezinden (props.ts roundNormals); köşeli yüz görünmesin
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (shader) => {
      linkAtmosphere(shader);
      linkCloudShadow(shader);
      leafy(shader);
    };
    m.customProgramCacheKey = () => 'treeNearLeaf';
    return m;
  })();
  private readonly treeB = broadleafGeo(0xffffff);
  private readonly treeC = coniferGeo(0xffffff);
  private readonly treeFar = [broadleafFarGeo(0xffffff), coniferFarGeo(0xffffff)];
  /** Kaya biçimleri: yuvarlak, yassı, sivri (props.ts rockGeos). */
  private readonly rocks = rockGeos();
  /** Basit taç malzemeleri: seyrek ve sık (sık olan sık taç yarıçapı ötesinde atılır). Paylaşılan değerler. */
  private readonly treeU = {
    treeNear: { value: new THREE.Vector3(0, -1e9, 0) },
    treeParams: { value: new THREE.Vector2(1300, 2500) },
    treeFade: { value: new THREE.Vector2(5500, 8500) },
  };
  private readonly farMat = this.treeMaterial(false);
  private readonly denseMat = this.treeMaterial(true);
  /** Kameranın yakınındaki ağaçlar (tam model), tür başına. */
  private readonly near: THREE.InstancedMesh[];
  private readonly nearCenter = new THREE.Vector3(0, -1e9, 0);
  private nearDirty = true;
  /** Kalite basamağının uzaklıkları (m). */
  private q = { near: 1300, thin: 2500, fade: [5500, 8500] as [number, number], settle: 10000 };
  private readonly chunks: Chunk[] = [];
  private readonly chunkGroup = new THREE.Group();
  private settle: THREE.Group = new THREE.Group();
  private settleBlocks: SettleBlock[] = [];
  private settleVersion = 0;
  /** Çiftliklerin yerleri (farms.ts çizer) ve listenin sürümü. */
  farmSpots: FarmSpot[] = [];
  farmVersion = 0;
  /** Ağaç konmayacak hücreler (çiftlikler); yerleşimlerle birlikte kurulur. Süs köyleri ve yapılar açıklık listesinde (cleared). */
  private keepOut = new Set<number>();

  private keepKey(x: number, z: number): number {
    const n = Math.ceil(MAP_SIZE / KEEP_CELL) + 1;
    return Math.floor((z + HALF) / KEEP_CELL) * n + Math.floor((x + HALF) / KEEP_CELL);
  }

  private keepCircle(x: number, z: number, r: number): void {
    for (let dz = -r; dz <= r; dz += KEEP_CELL) {
      for (let dx = -r; dx <= r; dx += KEEP_CELL) if (dx * dx + dz * dz <= r * r) this.keepOut.add(this.keepKey(x + dx, z + dz));
    }
  }

  /** Bu noktaya ağaç konmaz mı (çiftlik). */
  private keptOut(x: number, z: number): boolean {
    return this.keepOut.has(this.keepKey(x, z));
  }
  private settleDirtyAt = -1;
  /** Hangi harita için kuruldu. */
  private mapVersion = -1;
  /** Gök ışığı (0..1): ışıksız harita çizgisinin rengi buna göre (gece karanlıkta parlamasın). */
  private light = 1;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < NC * NC; i++) this.chunks.push({ group: null, version: -1, trees: [] });
    this.group.add(this.chunkGroup, this.settle);
    this.near = [this.treeB, this.treeC].map((geo) => {
      const m = new THREE.InstancedMesh(geo, this.treeNearMat, NEAR_CAP);
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_CAP * 3), 3).setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
      freeze(m);
      return m;
    });
    scene.add(this.group);
    this.rebuild();
  }

  /** Gün döngüsü: gök ışığı (şimdilik yalnız saklanır; ışıksız harita çizgisi kalmadı). */
  setLight(k: number): void {
    this.light = k;
  }

  /**
   * Basit taç malzemesi. Gölgelendiricide: yakın ağaç halkasındakiler (tam modelle çizilenler) atılır; sık katman
   * sık taç yarıçapı ötesinde atılır; hepsi sönme aralığında küçülerek söner. Atılan örnek sıfır boyuta iner (üçgeni çizilmez).
   */
  private treeMaterial(dense: boolean): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (shader) => {
      linkAtmosphere(shader);
      linkCloudShadow(shader);
      Object.assign(shader.uniforms, this.treeU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 treeNear;\nuniform vec2 treeParams;\nuniform vec2 treeFade;')
        .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
          vec3 iPos = instanceMatrix[3].xyz;
          float tDist = distance( iPos, cameraPosition );
          float keep = step( treeParams.x, distance( iPos, treeNear ) );
          ${dense ? 'keep *= step( tDist, treeParams.y );' : ''}
          keep *= 1.0 - smoothstep( treeFade.x, treeFade.y, tDist );
          transformed *= keep;`);
      leafy(shader);
    };
    m.customProgramCacheKey = () => (dense ? 'treeDenseLeaf' : 'treeFarLeaf');
    return m;
  }

  /**
   * Yakın ağaç halkası: kameranın yakın halkasındaki ağaçlar tam model katmanına kopyalanır (kamera NEAR_MOVE
   * kayınca ya da parçalar değişince). Basit taç gölgelendiricisi aynı merkez ve yarıçapla bunları atar: her ağaç
   * bir kez çizilir.
   */
  private gatherNear(cam: THREE.Vector3, show: boolean): void {
    if (!show) {
      for (const m of this.near) m.count = 0;
      this.nearCenter.set(0, -1e9, 0);
      this.treeU.treeNear.value.copy(this.nearCenter);
      this.nearDirty = true;
      return;
    }
    if (!this.nearDirty && this.nearCenter.distanceToSquared(cam) < NEAR_MOVE * NEAR_MOVE) return;
    this.nearDirty = false;
    this.nearCenter.copy(cam);
    this.treeU.treeNear.value.copy(cam);
    const R2 = this.q.near * this.q.near;
    const counts = [0, 0];
    for (let cj = 0; cj < NC; cj++) {
      for (let ci = 0; ci < NC; ci++) {
        const ch = this.chunks[cj * NC + ci];
        if (!ch.group || !ch.group.visible) continue;
        const x0 = -HALF + ci * CHUNK;
        const z0 = -HALF + cj * CHUNK;
        if (rectDist(cam.x, cam.z, x0, z0, CHUNK) > this.q.near) continue;
        for (const t of ch.trees) {
          if (rectDist(cam.x, cam.z, t.x0, t.z0, t.size) > this.q.near) continue;
          const s = t.species;
          const dst = this.near[s];
          const md = dst.instanceMatrix.array as Float32Array;
          const cd = dst.instanceColor!.array as Float32Array;
          const m = t.mesh.instanceMatrix.array;
          const c = t.mesh.instanceColor!.array;
          for (let k = 0; k < t.mesh.count; k++) {
            const dx = m[k * 16 + 12] - cam.x;
            const dy = m[k * 16 + 13] - cam.y;
            const dz = m[k * 16 + 14] - cam.z;
            if (dx * dx + dy * dy + dz * dz >= R2 || counts[s] >= NEAR_CAP) continue;
            const o = counts[s]++;
            for (let e = 0; e < 16; e++) md[o * 16 + e] = m[k * 16 + e];
            cd[o * 3] = c[k * 3];
            cd[o * 3 + 1] = c[k * 3 + 1];
            cd[o * 3 + 2] = c[k * 3 + 2];
          }
        }
      }
    }
    this.near.forEach((m, s) => {
      m.count = counts[s];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    });
  }

  /** Grafik kalitesi: ağaç ve yerleşim uzaklıkları (yakın ağaç halkası yeniden toplanır). */
  setQuality(near: number, thin: number, fade: [number, number], settle: number): void {
    this.q = { near, thin, fade, settle };
    this.treeU.treeParams.value.set(near, thin);
    this.treeU.treeFade.value.set(fade[0], fade[1]);
    this.nearDirty = true;
  }

  /** Yollar, yerleşimler ve ağaç parçaları yüklü haritaya göre (harita değişince) yeniden kurulur. */
  rebuild(): void {
    if (this.mapVersion === terrainMap.version) return;
    this.mapVersion = terrainMap.version;
    this.desert = mapById(terrainMap.id).biome === 'desert';
    // Taş sütunlar (Kanyonlar): harita başına bir kez, kaya malzemesiyle
    if (this.pillars) {
      this.group.remove(this.pillars);
      this.pillars.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      this.pillars = null;
    }
    if (pillarList().length) this.group.add((this.pillars = buildPillarGroup(pillarList(), this.pillarMat)));
    // Harita büyüklüğü değişmiş olabilir: parça boyu ve sayısı yeniden (arazi parçalarıyla aynı)
    const cells = chunkCells();
    CHUNK = SETTLE_BLOCK = cells * TERRAIN_CELL;
    NC = TERRAIN_N / cells;
    for (const ch of this.chunks) {
      if (ch.group) {
        this.chunkGroup.remove(ch.group);
        disposeGroup(ch.group);
      }
      ch.group = null;
      ch.trees = [];
      ch.version = -1;
    }
    // Haritanın yolları ve dekor şehirleri 2026-11-13'te kaldırıldı (yerine harekâta özgü süs köyleri: decor.ts)
    this.clearSettlements();
    this.setLight(this.light);
    this.buildSettlements();
    this.settleVersion = clearingsVersion();
  }

  private clearSettlements(): void {
    for (const c of [...this.settle.children]) {
      this.settle.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        else if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.settleBlocks = [];
  }

  /** Yeni yapı tabanları: üstünde kalan dekor evleri ve ağaçları kaldırmak için yerleşimleri yeniden kur. */
  private refreshSettlements(): void {
    const ver = clearingsVersion();
    if (ver === this.settleVersion) return;
    const now = performance.now();
    if (this.settleDirtyAt < 0) this.settleDirtyAt = now;
    if (now - this.settleDirtyAt < 600) return;
    this.settleDirtyAt = -1;
    this.settleVersion = ver;
    this.clearSettlements();
    this.buildSettlements();
  }

  /** Kameraya göre ağaç/kaya parçalarını üret, göster, gizle; yakın ağaç halkasını kameranın konumuna göre topla. */
  update(camDist: number, enabled: boolean, cam: THREE.Vector3): void {
    this.group.visible = enabled;
    if (!enabled) return;
    this.refreshSettlements();
    // Uzakta ağaçlar piksel altına düşer ve kaydırırken kıvılcım gibi titrer: yalnız yakın/orta görünümde
    const show = camDist < 9000;
    // Basit taçlar kameradan sönme uzaklığında söner: yalnız o kadar yakındaki parçalar ve bloklar çizilir. Uzaklık
    // kameranın yerden yüksekliğini de sayar (7 km'deki uçağın altındaki ağaçlar zaten sönmüş olur)
    const agl = Math.max(0, cam.y - groundLevel(cam.x, cam.z));
    const far3 = (x0: number, z0: number, size: number) => Math.hypot(rectDist(cam.x, cam.z, x0, z0, size), agl);
    let budget = 1;
    const ver = clearingsVersion();
    for (let cj = 0; cj < NC; cj++) {
      for (let ci = 0; ci < NC; ci++) {
        const ch = this.chunks[cj * NC + ci];
        const d = far3(-HALF + ci * CHUNK, -HALF + cj * CHUNK, CHUNK);
        const want = show && d < this.q.fade[1];
        if (want && (!ch.group || ch.version !== ver) && budget > 0) {
          budget--;
          if (ch.group) {
            this.chunkGroup.remove(ch.group);
            disposeGroup(ch.group);
          }
          ch.group = this.buildChunk(ci, cj, ch);
          ch.version = ver;
          this.chunkGroup.add(ch.group);
          freeze(ch.group);
          this.nearDirty = true;
        }
        if (ch.group) {
          if (ch.group.visible !== want) this.nearDirty = true;
          ch.group.visible = want;
          // Bloklar: sık taç sık taç yarıçapı, seyrek taç sönme uzaklığı içindeyse (ötesinde gölgelendirici zaten atar)
          for (const t of ch.trees) t.mesh.visible = far3(t.x0, t.z0, t.size) < (t.dense ? this.q.thin : this.q.fade[1]);
          // Çok uzaktaki parçaları bellekten at
          if (!want && d > this.q.fade[1] + CHUNK * 3) {
            this.chunkGroup.remove(ch.group);
            disposeGroup(ch.group);
            ch.group = null;
            ch.trees = [];
          }
        }
      }
    }
    this.gatherNear(cam, show);
    // Yerleşimler (çiftlikler): uzakta piksel altı; ayrıntılar yalnız yakında
    this.settle.visible = camDist < 20000;
    const detail = camDist < 9000;
    for (const b of this.settleBlocks) {
      b.group.visible = far3(b.x0, b.z0, SETTLE_BLOCK) < this.q.settle;
      for (const c of b.group.children) if (c.userData.near) c.visible = detail;
    }
    this.settle.children.forEach((c) => {
      if (c.userData.near) c.visible = detail;
    });
  }

  private buildChunk(ci: number, cj: number, ch: Chunk): THREE.Group {
    const rng = mulberry32(ci * 7919 + cj * 104729 + 17);
    const g = new THREE.Group();
    const tb = new InstList();
    const tc = new InstList();
    const rk = [new InstList(), new InstList(), new InstList()];
    const x0 = -HALF + ci * CHUNK;
    const z0 = -HALF + cj * CHUNK;
    // 4 geçiş: her geçiş 84 m ızgara, kaydırmalı → ilk geçiş tek başına düzgün seyrek bir orman
    const step = 84;
    const far = { b: 0, c: 0 };
    for (let pass = 0; pass < 4; pass++) {
      const ox = (pass & 1) * step * 0.5;
      const oz = (pass >> 1) * step * 0.5;
      for (let z = z0 + oz; z < z0 + CHUNK; z += step) {
        for (let x = x0 + ox; x < x0 + CHUNK; x += step) {
          const px = x + (rng() - 0.5) * step * 0.5;
          const pz = z + (rng() - 0.5) * step * 0.5;
          const r = rng();
          const forest = sampleSmooth(forestGrid, px, pz);
          // Ormanda sık. Açık arazi boş kalmasın (2026-11-10): öbek öbek ağaçlık ve koru; tarlada seyrek ağaç öbekleri
          // (parsel deseni görünür kalır). Yol, köy, çiftlik ve şehirde ağaç yok.
          // Açık arazinin ağaçlığı arazi örtüsünde (landcoverGen open); burada tarlalara seyrek ağaç öbekleri eklenir
          let p: number;
          if (forest > 0.06) p = Math.min(1, forest * 1.15);
          else if (sampleGrid(fieldGrid, px, pz) > 0.3) p = 0.005 + smoothstep(-0.35, 0.45, fbmGrove(px / 900, pz / 900)) * 0.04;
          else p = this.desert ? 0.004 : 0.012;
          // Çöl: havzada sık, platoda öbek öbek çalılar (ardıçların arasında da)
          let sage = false;
          if (this.desert) {
            const basin = monumentShare(px, pz, MAP_SCALE) > 0.5;
            const bush = basin ? 0.16 : 0.025 + 0.07 * smoothstep(-0.2, 0.45, fbmGrove(px / 700, pz / 700));
            if (forest <= 0.06 || basin) {
              if (r < bush) sage = true;
              else if (basin || r > bush + p) continue;
            } else if (r > p && r < p + bush * 0.5) sage = true;
            else if (r > p) continue;
          } else if (r > p) continue;
          const h = terrainHeight(px, pz);
          if (h < 6 || cleared(px, pz, 60) || this.keptOut(px, pz) || sampleGrid(urbanGrid, px, pz) > 0.05) continue;
          // Açık arazinin ağaçları ağaç sınırının (≈1,7 km) üstüne ve uçurumlara çıkmaz
          if (forest <= 0.06 && (h > 1700 || sampleGrid(slopeGrid, px, pz) > 0.7)) continue;
          // Çölde platoda yalnız ardıç; yapraklı (kavak) yalnız kanyon dibinde, nehir boyunda
          if (sage) {
            if (sampleGrid(slopeGrid, px, pz) > 0.25) continue;
            // Taç yere otursun: gövde (ağaç modelinin alt %40'ı) toprağa gömülür
            const sz = 2.5 + rng() * 3;
            tb.push(px, groundLevel(px, pz) - sz * 0.45, pz, sz * 1.3, sz * 0.75, sz * 1.3, rng() * 6.28, TREES_SAGE[Math.floor(rng() * TREES_SAGE.length)]);
            // Öbek: yanına bir iki küçük çalı
            for (let q = Math.floor(rng() * 3); q > 0; q--) {
              const qx = px + (rng() - 0.5) * 14;
              const qz = pz + (rng() - 0.5) * 14;
              const qs = 1.8 + rng() * 2.2;
              tb.push(qx, groundLevel(qx, qz) - qs * 0.45, qz, qs * 1.3, qs * 0.75, qs * 1.3, rng() * 6.28, TREES_SAGE[Math.floor(rng() * TREES_SAGE.length)]);
            }
            continue;
          }
          const conifer = this.desert ? h > 110 : rng() < 0.1 + 0.8 * smoothstep(500, 1250, h);
          const size = ((conifer ? 17 : 15) + rng() * 10) * (this.desert && conifer ? 0.6 : 1);
          const y = groundLevel(px, pz) - 0.8;
          if (conifer) tc.push(px, y, pz, size * (this.desert ? 1.05 : 0.75), size, size * (this.desert ? 1.05 : 0.75), rng() * 6.28, (this.desert ? TREES_D : TREES_C)[Math.floor(rng() * 3)]);
          else tb.push(px, y, pz, size * 1.1, size * (0.85 + rng() * 0.3), size * 1.1, rng() * 6.28, TREES_B[Math.floor(rng() * TREES_B.length)]);
        }
      }
      if (pass === 0) {
        far.b = tb.count;
        far.c = tc.count;
      }
    }
    // Kayalar: dik yamaç ve yüksek dağ
    const rstep = 150;
    for (let z = z0; z < z0 + CHUNK; z += rstep) {
      for (let x = x0; x < x0 + CHUNK; x += rstep) {
        const px = x + rng() * rstep;
        const pz = z + rng() * rstep;
        const slope = sampleGrid(slopeGrid, px, pz);
        const h = terrainHeight(px, pz);
        if (h < 30) continue;
        const p = smoothstep(0.32, 0.9, slope) * 0.55 + (h > 1500 ? 0.12 : 0) + (h > 250 ? 0.012 : 0);
        if (rng() > p || cleared(px, pz, 40)) continue;
        // Küme: 1-4 kaya
        const n = 1 + Math.floor(rng() * 3.5);
        for (let i = 0; i < n; i++) {
          const qx = px + (rng() - 0.5) * 50;
          const qz = pz + (rng() - 0.5) * 50;
          const sc = (h > 1400 ? 10 : 5) + rng() * (h > 1400 ? 22 : 12);
          // Biçim konumdan (rastgele akışı değiştirmez): dağda sivri kaya daha sık
          const form = Math.floor(Math.abs(Math.sin(qx * 0.013 + qz * 0.029) * 1000)) % (h > 1400 ? 4 : 3);
          rk[Math.min(2, form)].push(qx, groundLevel(qx, qz) - sc * 0.22, qz, sc * (0.8 + rng() * 0.5), sc * (0.6 + rng() * 0.5), sc, rng() * 6.28, ROCKS[Math.floor(rng() * ROCKS.length)]);
        }
      }
    }
    // Tür başına: ilk geçiş seyrek bloklar, kalan geçişler sık bloklar (basit taç)
    ch.trees = [];
    [tb, tc].forEach((list, s) => {
      const n0 = s === 0 ? far.b : far.c;
      for (const t of [
        ...farBlocks(this.treeFar[s], this.farMat, s, false, list, 0, n0, x0, z0, SPARSE_BLOCKS),
        ...farBlocks(this.treeFar[s], this.denseMat, s, true, list, n0, list.count, x0, z0, DENSE_BLOCKS),
      ]) {
        ch.trees.push(t);
        g.add(t.mesh);
      }
    });
    rk.forEach((l, i) => {
      const rocks = l.mesh(this.rocks[i], this.vegMat);
      if (rocks) g.add(rocks);
    });
    return g;
  }

  // ------------------------------------------------------------------ yerleşimler

  /**
   * Çiftliklerin yerleri: tarla bölgelerinde, açıklıklardan (süs, yapı) uzak; ağaç konmaz. Modelleri farms.ts çizer
   * (2026-11-17; eskiden burada renkli kutular). Haritanın şehirleri ve yol boyu köyleri 2026-11-13'te kaldırıldı.
   */
  private buildSettlements(): void {
    const rng = mulberry32(4242);
    this.keepOut.clear();
    const spots: FarmSpot[] = [];
    // Çiftlik denemeleri harita alanıyla orantılı
    const farmTries = Math.round(1800 * (MAP_SIZE / 150000) ** 2);
    for (let i = 0; i < farmTries; i++) {
      const x = (rng() - 0.5) * MAP_SIZE * 0.9;
      const z = (rng() - 0.5) * MAP_SIZE * 0.9;
      if (sampleGrid(fieldGrid, x, z) < 0.45 || rng() > 0.18) continue;
      if (cleared(x, z, 300)) continue;
      const yaw = rng() * Math.PI * 2;
      this.keepCircle(x, z, 75);
      spots.push({ x, z, yaw, seed: Math.imul(i + 1, 2654435761) >>> 0 });
    }
    this.farmSpots = spots;
    this.farmVersion++;
  }
}

function disposeGroup(g: THREE.Group): void {
  for (const c of g.children) if (c instanceof THREE.InstancedMesh) c.dispose();
}
