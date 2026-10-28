// Bulutlar: üç tür, gerçek gökteki gibi karışık.
//   - kümülüs: taban 1,5–2,3 km (dağda tepenin en az 500 m üstünde), kubbeli, tabanı düz ve koyu;
//   - stratokümülüs: geniş, alçak ve ince tabaka parçaları, yer yer içi görünür;
//   - sirrüs: 8–9,5 km'de tül gibi uzun çizgiler (gün batımında en son onlar kızarır).
// Bulut, yüzlerce yumuşak parçacıktan oluşur; kenarları dünya ekseninde sabit 3B gürültüyle aşınır: üst üste binen
// parçacıklar aynı deseni paylaştığı için tek bir hacim gibi görünür, kenarlarda tüy tüy uzantılar ve içinde boşluklar
// kalır (yuvarlak, içi dolu toplar değil). Gürültü zamanla çok yavaş akar (bulut biçim değiştirir). Rüzgârla
// sürüklenir (WIND), araziye ve ağaçlara gölge düşürür (gölge haritası, güneş yönünde kaydırılmış). Gün batımında
// alt yüzleri güneşin son ışığıyla turuncu-pembe ışır.
//
// Parçacıkların kameraya dönmesi gölgelendiricide: kare başına işlemci işi yok. Kamera ~1 km kayınca yakındaki
// bulutlar seçilir ve parçacıklar uzaktan yakına sıralanır (saydamlar doğru sırayla karışsın).
// Oynanış: strateji uzaklığında bulut ve gölgesi söner (harita okunur kalsın); oyuncu kamerasında baktığı hedefle
// arasındaki bulut açılır; kamera bulutun içine girince yakın parçacıklar söner.
// Simülasyon bulutu bilmez (yalnız görsel); dağılım haritaya göre sabit (tohumlu), her açılışta aynı.

import * as THREE from 'three';
import { MAP_SIZE } from '../sim/mapData';
import { groundLevel, terrainMap } from '../sim/terrain';
import { smoothstep } from '../core/math';
import { WIND, linkAtmosphere } from './atmosphere';
import { puffQuad, puffTexture } from './effects';

/** Bulut alanının kenarı (m): harita ve çevresi; bulutlar bu karede sarar (rüzgârla çıkan öbür yandan girer). Harita büyüklüğüyle değişir (build). */
let SPAN = MAP_SIZE * 1.3;
/** Bulut gölgesinin hesaplandığı ortalama yükseklik (m). */
const SHADOW_H = 2300;
/** Kameradan bu uzaklığa kadar bulutlar çizilir (m; ötesi sisin içinde). */
const VIEW = 55000;
/** Aday ızgarası (m). */
const CELL = 3000;
/** Kamera bu kadar kayınca seçim ve sıralama yenilenir (m). */
const RESELECT = 900;
const SHADOW_RES = 1024;
/** Parçacık kaydı: dx, y, dz, boy, dönüş, ton, doku hücresi, taban, en-boy oranı, opaklık. */
const STRIDE = 10;

/** Tohumlu sayı üreteci. */
function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Kafes gürültüsü (0..1), ölçek m. */
function lattice(seed: number, scale: number): (x: number, z: number) => number {
  const at = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, z) => {
    const u = x / scale;
    const v = z / scale;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fx = u - i;
    const fy = v - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

const wrap = (v: number) => v - SPAN * Math.floor(v / SPAN + 0.5);

/** Bulut türü: 0 kümülüs, 1 stratokümülüs, 2 sirrüs. */
interface Cloud {
  x: number;
  z: number;
  r: number;
  kind: number;
  /** Parçacık dizisindeki ilk parçacık ve sayısı. */
  first: number;
  n: number;
}

/**
 * Döşenebilir 3B değer gürültüsü (32³, iki oktav): bulut kenarlarını aşındırır. Dönemli kafes: doku tekrar ederken
 * dikiş vermez.
 */
function noiseVolume(): THREE.Data3DTexture {
  const N = 32;
  const data = new Uint8Array(N * N * N);
  const rnd = prng(977);
  const octave = (period: number) => {
    const g = new Float32Array(period * period * period).map(() => rnd());
    const at = (i: number, j: number, k: number) => g[((k % period) * period + (j % period)) * period + (i % period)];
    const cell = N / period;
    return (x: number, y: number, z: number) => {
      const u = x / cell;
      const v = y / cell;
      const w = z / cell;
      const i = Math.floor(u);
      const j = Math.floor(v);
      const k = Math.floor(w);
      const s = (t: number) => t * t * (3 - 2 * t);
      const fx = s(u - i);
      const fy = s(v - j);
      const fz = s(w - k);
      const l = (a: number, b: number, t: number) => a + (b - a) * t;
      return l(
        l(l(at(i, j, k), at(i + 1, j, k), fx), l(at(i, j + 1, k), at(i + 1, j + 1, k), fx), fy),
        l(l(at(i, j, k + 1), at(i + 1, j, k + 1), fx), l(at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1), fx), fy),
        fz,
      );
    };
  };
  const o1 = octave(8);
  const o2 = octave(16);
  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) data[(z * N + y) * N + x] = Math.round(255 * (0.65 * o1(x, y, z) + 0.35 * o2(x, y, z)));
    }
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** Bulut gölgesi değerleri: arazi ve ağaç malzemeleri paylaşır (linkCloudShadow). */
const shadowU = {
  cloudMap: { value: null as THREE.Texture | null },
  /** x, z: rüzgâr kayması (m), z: 1 / alan, w: gölge gücü (0 kapalı) */
  cloudShadow: { value: new THREE.Vector4(0, 0, 1 / SPAN, 0) },
  cloudSun: { value: new THREE.Vector3(0, 1, 0) },
};

/**
 * Bulut gölgesini bir Lambert gölgelendiricisine ekle: yalnız doğrudan güneş ışığı azalır (gökten gelen ışık kalır).
 * Örnekli ve örneksiz ağlarda çalışır. Kendi onBeforeCompile'ı içinde, linkAtmosphere ile birlikte çağrılır.
 */
export function linkCloudShadow(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }): void {
  Object.assign(shader.uniforms, shadowU);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCloudW;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vCloudW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
      #else
        vCloudW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
      #endif`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCloudW;\nuniform sampler2D cloudMap;\nuniform vec4 cloudShadow;\nuniform vec3 cloudSun;')
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      if ( cloudShadow.w > 0.0 ) {
        // Güneşe doğru bulut yüksekliğine çıkılan noktanın bulut örtüsü
        vec2 cp = vCloudW.xz + cloudSun.xz * ( ( ${SHADOW_H.toFixed(1)} - vCloudW.y ) / max( cloudSun.y, 0.12 ) ) - cloudShadow.xy;
        float cs = texture2D( cloudMap, cp * cloudShadow.z + 0.5 ).r;
        reflectedLight.directDiffuse *= 1.0 - cs * cloudShadow.w;
      }`);
}

const VS_PARS = /* glsl */ `
  attribute vec4 cCenter;
  attribute vec4 cData;
  attribute vec2 cExt;
  uniform vec2 cloudDrift;
  uniform float cloudFade;
  uniform vec3 cloudFocus;
  uniform float cloudClear;
  varying float vCloudA;
  varying float vCloudShade;
  varying float vCloudBase;
  varying vec3 vCW;
`;

const FS_PARS = /* glsl */ `
  varying float vCloudA;
  varying float vCloudShade;
  varying float vCloudBase;
  varying vec3 vCW;
  uniform float cloudAmb;
  uniform float cloudTime;
  uniform vec2 cloudDrift;
  uniform vec3 cloudGlow;
  uniform highp sampler3D cloudNoise;
`;

export class Clouds {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly center: THREE.InstancedBufferAttribute;
  private readonly data: THREE.InstancedBufferAttribute;
  private readonly ext: THREE.InstancedBufferAttribute;
  private readonly u = {
    cloudDrift: { value: new THREE.Vector2() },
    cloudFade: { value: 1 },
    cloudFocus: { value: new THREE.Vector3() },
    cloudClear: { value: 0 },
    cloudAmb: { value: 4 },
    cloudTime: { value: 0 },
    cloudGlow: { value: new THREE.Color(0, 0, 0) },
    cloudNoise: { value: noiseVolume() },
  };
  private clouds: Cloud[] = [];
  /** Bütün parçacıklar (bulut merkezine göre), STRIDE sayı. */
  private puffs = new Float32Array(0);
  private density = -1;
  private mapId = '';
  private readonly selCam = new THREE.Vector3(0, -1e9, 0);
  private selTime = -1e9;
  private readonly capacity = 24000;
  private shadowTex: THREE.DataTexture | null = null;

  constructor(scene: THREE.Scene) {
    const quad = puffQuad();
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    for (const k of ['position', 'normal', 'uv']) this.geo.setAttribute(k, quad.getAttribute(k));
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.ext = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('cCenter', this.center);
    this.geo.setAttribute('cData', this.data);
    this.geo.setAttribute('cExt', this.ext);
    this.geo.instanceCount = 0;
    const mat = new THREE.MeshLambertMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      linkAtmosphere(shader);
      Object.assign(shader.uniforms, this.u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VS_PARS}`)
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * 0.5 + vec2( mod( cData.w, 2.0 ), floor( cData.w * 0.5 ) ) * 0.5;')
        .replace('#include <defaultnormal_vertex>', /* glsl */ `
          // Dönüş: yuvarlak kümülüs parçası rastgele; yassı stratokümülüs ekranda yatay; sirrüs çizgileri yüksek irtifa
          // rüzgârı yönünde (ekrana izdüşümü), rüzgâr boyunca bakınca kısalır. Rastgele açılı uzun kareler birbirini
          // kesip yıldız/çarpı biçimi veriyordu.
          float cAng = cData.y;
          float cAsp = cExt.x;
          if ( cExt.x > 2.5 ) {
            vec2 cd = ( mat3( viewMatrix ) * vec3( 0.95, 0.0, -0.32 ) ).xy;
            float cl = length( cd );
            cAng = atan( cd.y, cd.x ) + 0.12 * sin( cData.y * 7.0 );
            cAsp = mix( 1.3, cExt.x, smoothstep( 0.15, 0.8, cl ) );
          } else if ( cExt.x > 1.05 ) {
            cAng = 0.1 * sin( cData.y * 5.0 );
          }
          float cS = sin( cAng );
          float cC = cos( cAng );
          mat2 cR = mat2( cC, cS, -cS, cC );
          vec3 transformedNormal = vec3( cR * objectNormal.xy, objectNormal.z );`)
        .replace('#include <project_vertex>', /* glsl */ `
          vec3 cW = cCenter.xyz + vec3( cloudDrift.x, 0.0, cloudDrift.y );
          vec4 mvPosition = viewMatrix * vec4( cW, 1.0 );
          // Sirrüs çizgileri yatayda uzun (en-boy oranı)
          vec2 cOff = cR * ( position.xy * vec2( cAsp, 1.0 ) ) * cData.x;
          mvPosition.xy += cOff;
          gl_Position = projectionMatrix * mvPosition;
          // İçinden geçerken yakın parçacık söner; kamera ile hedef arasındaki bulut açılır
          float cDist = distance( cW, cameraPosition );
          float cA = cloudFade * cExt.y * smoothstep( cData.x * 0.5, cData.x * 1.8, cDist );
          vec3 seg = cloudFocus - cameraPosition;
          float st = clamp( dot( cW - cameraPosition, seg ) / max( dot( seg, seg ), 1.0 ), 0.0, 1.0 );
          float sd = distance( cW, cameraPosition + seg * st );
          if ( cloudClear > 0.0 ) cA *= smoothstep( cloudClear * 0.6, cloudClear + cData.x, sd );
          vCloudA = cA;
          vCloudShade = cData.z;
          // Köşenin dünya konumu: taban düz ve yumuşak kesilir; aşındırma gürültüsü dünya ekseninde
          vec3 wOff = ( vec4( cOff, 0.0, 0.0 ) * viewMatrix ).xyz;
          vCW = cW + wOff;
          vCloudBase = ( vCW.y - cCenter.w ) / ( 0.3 * cData.x );`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FS_PARS}`)
        // Yoğunluk: parçacık dokusu × dünya ekseninde iki ölçekli gürültü; eşik kenarları aşındırır (tüy, delik)
        .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
          diffuseColor.rgb = mix( vec3( 1.0 ), diffuseColor.rgb, 0.55 ) * vCloudShade;
          vec3 nw = vCW - vec3( cloudDrift.x, 0.0, cloudDrift.y );
          float n1 = texture( cloudNoise, nw * 0.0009 + vec3( 0.0, cloudTime * 0.0012, 0.0 ) ).r;
          float n2 = texture( cloudNoise, nw * 0.0041 + vec3( cloudTime * 0.002, 0.0, 0.0 ) ).r;
          float dens = diffuseColor.a * ( 0.55 + 0.9 * ( n1 - 0.5 ) ) + ( n2 - 0.5 ) * 0.32;
          diffuseColor.a = smoothstep( 0.1, 0.62, dens ) * vCloudA * smoothstep( 0.0, 1.0, vCloudBase );
          // Yoğun çekirdek biraz daha gölgede (içinden ışık az geçer)
          diffuseColor.rgb *= 0.9 + 0.1 * ( 1.0 - smoothstep( 0.35, 0.9, dens ) );`)
        // Çoklu saçılma: bulutun gölgede kalan yanı da aydınlık (katı bir yüzey gibi kararmaz). Gök ışığının katı:
        // gün batımında gökle birlikte renklenir, gece kararır
        // Ortam ışığı gökten (tepe ve ufuk rengi): yarım küre ışığının toprak rengi bulut altını kahverengiye boyuyordu
        .replace('#include <aomap_fragment>', /* glsl */ `reflectedLight.indirectDiffuse = diffuseColor.rgb * mix( atmoHorizon, atmoZenith, 0.45 ) * cloudAmb * 0.33;
          // İleri saçılma: güneşe karşı bakınca bulutun ince kenarları güneş renginde parlar (gümüş astar)
          #if NUM_DIR_LIGHTS > 0
            float cFwd = pow( max( dot( - normalize( vViewPosition ), directionalLights[ 0 ].direction ), 0.0 ), 14.0 );
            reflectedLight.directDiffuse += directionalLights[ 0 ].color * diffuseColor.rgb * cFwd * ( 1.1 - diffuseColor.a ) * 0.35;
          #endif
          // Gün batımı ışıması: alçalan güneşin son ışığı; yüksek bulut (sirrüs) daha uzun süre ve daha güçlü
          reflectedLight.directDiffuse += cloudGlow * diffuseColor.rgb * ( 0.55 + 0.9 * smoothstep( 1500.0, 9000.0, vCW.y ) );
          #include <aomap_fragment>`);
    };
    mat.customProgramCacheKey = () => 'clouds2';
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** Bulut çarpanı (kalite × ayar; 0 bulut yok). Değişince alan yeniden kurulur. */
  setDensity(d: number): void {
    if (d === this.density) return;
    this.density = d;
    this.mapId = '';
  }

  /** Haritanın bulut alanı: büyük ölçekli örtü gürültüsüne göre kümeler, açık alanlar; üstte seyrek sirrüs. */
  private build(): void {
    this.mapId = terrainMap.key;
    SPAN = MAP_SIZE * 1.3;
    this.selTime = -1e9;
    const rnd = prng(hashStr(`bulut:${terrainMap.id}`));
    const cover = lattice(hashStr(`örtü:${terrainMap.id}`), 42000);
    const fine = lattice(hashStr(`küme:${terrainMap.id}`), 11000);
    const high = lattice(hashStr(`sirrüs:${terrainMap.id}`), 60000);
    const clouds: Cloud[] = [];
    const puffs: number[] = [];
    const half = MAP_SIZE / 2;
    const push = (dx: number, y: number, dz: number, size: number, shade: number, base: number, asp: number, alpha: number) =>
      puffs.push(dx, y, dz, size, rnd() * Math.PI * 2, shade, Math.floor(rnd() * 3), base, asp, alpha);
    for (let gx = -SPAN / 2; gx < SPAN / 2; gx += CELL) {
      for (let gz = -SPAN / 2; gz < SPAN / 2; gz += CELL) {
        const x = gx + rnd() * CELL;
        const z = gz + rnd() * CELL;
        const c = 0.6 * cover(x, z) + 0.4 * fine(x, z);
        const keep = rnd();
        if (this.density <= 0 || keep > smoothstep(0.42, 0.75, c) * 0.85 * this.density) continue;
        const g = groundLevel(Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, z)));
        if (rnd() < 0.22) {
          // Stratokümülüs: geniş, alçak, ince; parçacıklar yassı bir elips içinde, opaklık düşük
          const r = 1300 + rnd() * 2200;
          const base = Math.max(1300 + rnd() * 600, g + 450);
          const n = Math.round(10 + r / 170);
          const stretch = 0.5 + rnd() * 0.4;
          const ang = rnd() * Math.PI;
          clouds.push({ x, z, r, kind: 1, first: puffs.length / STRIDE, n });
          for (let k = 0; k < n; k++) {
            const a = rnd() * Math.PI * 2;
            const q = Math.sqrt(rnd());
            const ex = Math.cos(a) * q * r;
            const ez = Math.sin(a) * q * r * stretch;
            const size = r * (0.16 + rnd() * 0.14);
            push(ex * Math.cos(ang) - ez * Math.sin(ang), base + size * 0.3 + rnd() * 120, ex * Math.sin(ang) + ez * Math.cos(ang),
              size, 0.86 + rnd() * 0.08, base, 1.3 + rnd() * 0.6, 0.55 + rnd() * 0.25);
          }
          continue;
        }
        // Kümülüs: çekirdekte büyük yoğun parçacıklar, kenarda ve tepede küçük tüy parçacıklar
        const r = 450 + Math.pow(rnd(), 2) * 1150;
        const base = Math.max(1500 + rnd() * 500 + c * 300, g + 500);
        const h = r * (0.6 + rnd() * 0.6);
        const n = Math.round(Math.min(30, Math.max(12, 10 + r / 60)));
        clouds.push({ x, z, r, kind: 0, first: puffs.length / STRIDE, n });
        for (let k = 0; k < n; k++) {
          const a = rnd() * Math.PI * 2;
          const edge = k > n * 0.6;
          const q = edge ? 0.55 + rnd() * 0.45 : Math.sqrt(rnd()) * 0.75;
          const rr = q * r * 0.9;
          // Kubbe: ortada yüksek, kenarda alçak; taban düz
          const dy = (1 - q * q) * h * (0.2 + 0.8 * rnd());
          const size = r * (edge ? 0.18 + rnd() * 0.16 : 0.3 + rnd() * 0.22) * (1 - 0.25 * q);
          const shade = 0.82 + 0.18 * Math.min(1, dy / h) + (rnd() - 0.5) * 0.05;
          push(Math.cos(a) * rr, base + size * 0.35 + dy, Math.sin(a) * rr, size, shade, base, 1, edge ? 0.6 + rnd() * 0.3 : 0.85 + rnd() * 0.15);
        }
      }
    }
    // Sirrüs: 8–9,5 km'de seyrek, rüzgâr yönünde uzun tül çizgiler (gölge düşürmez)
    const CC = CELL * 4;
    for (let gx = -SPAN / 2; gx < SPAN / 2; gx += CC) {
      for (let gz = -SPAN / 2; gz < SPAN / 2; gz += CC) {
        const x = gx + rnd() * CC;
        const z = gz + rnd() * CC;
        if (this.density <= 0 || rnd() > smoothstep(0.45, 0.8, high(x, z)) * 0.7 * this.density) continue;
        const y = 8000 + rnd() * 1500;
        const len = 3000 + rnd() * 5000;
        const dir = Math.atan2(WIND.z, WIND.x) + (rnd() - 0.5) * 0.5;
        const n = Math.round(6 + len / 700);
        clouds.push({ x, z, r: len / 2, kind: 2, first: puffs.length / STRIDE, n });
        for (let k = 0; k < n; k++) {
          const t = (k / (n - 1) - 0.5) * len;
          const off = (rnd() - 0.5) * 500;
          push(Math.cos(dir) * t - Math.sin(dir) * off, y + (rnd() - 0.5) * 200, Math.sin(dir) * t + Math.cos(dir) * off,
            500 + rnd() * 600, 1.0, y - 1e4, 3 + rnd() * 3, 0.22 + rnd() * 0.16);
        }
      }
    }
    this.clouds = clouds;
    this.puffs = Float32Array.from(puffs);
    this.buildShadow();
  }

  /** Bulut örtüsü haritası (gölge için): kümülüs koyu, stratokümülüs daha soluk leke; sirrüs gölge düşürmez. */
  private buildShadow(): void {
    const N = SHADOW_RES;
    const img = new Uint8Array(N * N);
    const px = SPAN / N;
    for (const c of this.clouds) {
      if (c.kind === 2) continue;
      const R = (c.r * 0.9) / px;
      const k0 = c.kind === 1 ? 0.55 : 1;
      const cx = (c.x / SPAN + 0.5) * N;
      const cz = (c.z / SPAN + 0.5) * N;
      for (let j = Math.floor(cz - R - 1); j <= Math.ceil(cz + R + 1); j++) {
        for (let i = Math.floor(cx - R - 1); i <= Math.ceil(cx + R + 1); i++) {
          const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz) / R;
          if (d >= 1) continue;
          const v = Math.round(255 * k0 * (1 - smoothstep(0.45, 1, d)));
          const k = (((j % N) + N) % N) * N + (((i % N) + N) % N);
          if (v > img[k]) img[k] = v;
        }
      }
    }
    this.shadowTex?.dispose();
    const t = new THREE.DataTexture(img, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    this.shadowTex = t;
    shadowU.cloudMap.value = t;
  }

  /** Seçim için önceden ayrılmış diziler (her seçimde yeni dizi kurulmasın). */
  private selBuf = new Float32Array(0);
  private orderBuf = new Float64Array(0);

  /** Yakındaki bulutları seç, parçacıkları uzaktan yakına sırala ve yükle. */
  private select(cam: THREE.Vector3, ox: number, oz: number): void {
    const total = this.puffs.length / STRIDE;
    if (this.selBuf.length < total * 4) {
      this.selBuf = new Float32Array(total * 4);
      this.orderBuf = new Float64Array(Math.min(total, 32768));
    }
    const sel = this.selBuf;
    const order = this.orderBuf;
    const P = this.puffs;
    let m = 0;
    for (const c of this.clouds) {
      const x = wrap(c.x + ox);
      const z = wrap(c.z + oz);
      const dx = x - cam.x;
      const dz = z - cam.z;
      const view = VIEW + c.r;
      if (dx * dx + dz * dz > view * view) continue;
      for (let k = 0; k < c.n && m < 32768; k++) {
        const i = (c.first + k) * STRIDE;
        const px = x + P[i];
        const py = P[i + 1];
        const pz = z + P[i + 2];
        sel[m * 4] = i;
        sel[m * 4 + 1] = px;
        sel[m * 4 + 2] = py;
        sel[m * 4 + 3] = pz;
        // Anahtar = uzaklık (dm) × 2^15 + sıra: yerel sayısal sıralama yeter
        const d = Math.sqrt((px - cam.x) ** 2 + (py - cam.y) ** 2 + (pz - cam.z) ** 2);
        order[m] = Math.floor(d * 10) * 32768 + m;
        m++;
      }
    }
    const sorted = order.subarray(0, m).sort();
    // Sığmazsa en yakınlar alınır; uzaktan yakına yüklenir
    const n = Math.min(m, this.capacity);
    const ca = this.center.array as Float32Array;
    const da = this.data.array as Float32Array;
    const ea = this.ext.array as Float32Array;
    for (let j = 0; j < n; j++) {
      const s = (sorted[n - 1 - j] % 32768) * 4;
      const i = sel[s];
      ca[j * 4] = sel[s + 1];
      ca[j * 4 + 1] = sel[s + 2];
      ca[j * 4 + 2] = sel[s + 3];
      ca[j * 4 + 3] = P[i + 7];
      da[j * 4] = P[i + 3];
      da[j * 4 + 1] = P[i + 4];
      da[j * 4 + 2] = P[i + 5];
      da[j * 4 + 3] = P[i + 6];
      ea[j * 2] = P[i + 8];
      ea[j * 2 + 1] = P[i + 9];
    }
    this.geo.instanceCount = n;
    if (n > 0) {
      for (const a of [this.center, this.data]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * 4);
        a.needsUpdate = true;
      }
      this.ext.clearUpdateRanges();
      this.ext.addUpdateRange(0, n * 2);
      this.ext.needsUpdate = true;
    }
  }

  /**
   * Her kare: rüzgâr kayması, sönme ve açılma değerleri; kamera kaydıysa yeniden seçim. camDist: strateji
   * kamerasının uzaklığı; target: kameranın baktığı nokta; glow: gün batımı ışıması rengi (siyah: yok); clear: arada
   * kalan bulut açılsın mı (oyuncu kamerası evet, sinematik çekim hayır).
   */
  update(
    camera: THREE.Camera, time: number, camDist: number, target: THREE.Vector3, sunDir: THREE.Vector3, skyLight: number,
    glow: THREE.Color, clear: boolean,
  ): void {
    if (this.density > 0 && this.mapId !== terrainMap.key) this.build();
    const on = this.density > 0 && this.clouds.length > 0;
    const ox = WIND.x * time;
    const oz = WIND.z * time;
    // Strateji uzaklığında bulut ve gölgesi birlikte söner (harita ölçeğinde gölge tek başına leke gibi duruyor);
    // gölge güneş alçaldıkça da (uzun, dağınık gölge) söner
    const fade = 1 - smoothstep(18000, 40000, camDist);
    shadowU.cloudShadow.value.set(wrap(ox), wrap(oz), 1 / SPAN, on ? 0.6 * fade * smoothstep(0.08, 0.35, sunDir.y) : 0);
    shadowU.cloudSun.value.copy(sunDir);
    this.mesh.visible = on && fade > 0.01;
    if (!this.mesh.visible) return;
    const cam = camera.position;
    if (cam.distanceToSquared(this.selCam) > RESELECT * RESELECT || Math.abs(time - this.selTime) > 30) {
      this.select(cam, ox, oz);
      this.selCam.copy(cam);
      this.selTime = time;
    }
    // Seçimden bu yana rüzgâr kayması (seçimde konumlar sarılmış olarak yüklendi)
    this.u.cloudDrift.value.set(WIND.x * (time - this.selTime), WIND.z * (time - this.selTime));
    this.u.cloudFade.value = fade;
    this.u.cloudFocus.value.copy(target);
    this.u.cloudTime.value = time;
    this.u.cloudGlow.value.copy(glow);
    // Hedefin çevresi açık: bulutlar ekranın kenarında kalır, savaş alanı görünür
    this.u.cloudClear.value = clear ? 250 + camDist * 0.3 : 0;
    // Gece saçılma azalır (ay ışığındaki bulut gri bir gölge gibi görünür)
    this.u.cloudAmb.value = 2.2 + 1.8 * smoothstep(0.4, 1, skyLight);
    // Bulut altındayken yoğuşma izinden sonra çizilir (izin üstünü örtsün), üstündeyken önce
    this.mesh.renderOrder = cam.y < 2600 ? 2.5 : 1;
  }
}
