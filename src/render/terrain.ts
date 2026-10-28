// 3B low-poly pastel arazi. Simülasyonla aynı yükseklik ızgarası; yakında aynı üçgenleme (köşegen 00→11), uzakta daha seyrek.
// Harita değişince (terrainMap.version) parçalar baştan kurulur; arazi örtüsü de önce yeniden hesaplanmalı.
// Deniz: yüksekliği 0'ın altındaki köşeler deniz yüzeyine indirilir ve derinliğe göre maviye boyanır.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { smoothstep } from '../core/math';
import { MAP_HALF as HALF, MAP_SCALE, MAP_SIZE } from '../sim/mapData';
import { TERRAIN_CELL, TERRAIN_N, TERRAIN_W, heights, terrainEdits, terrainMap, groundLevel } from '../sim/terrain';
import { PALETTE } from './palette';
import { linkAtmosphere } from './atmosphere';
import { linkCloudShadow } from './clouds';
import { freeze } from './props';
import { FIELD_COLORS, clearFactor, fieldGrid, fieldKind, forestGrid, slopeGrid, urbanGrid } from './landcover';



/** Yüksekliğe göre renk duraklar (m). */
const STOPS: [number, [number, number, number]][] = [
  [-260, PALETTE.terrain.seaDeep],
  [-2, PALETTE.terrain.seaShallow],
  [0, PALETTE.terrain.sand],
  [18, PALETTE.terrain.sand],
  [40, PALETTE.terrain.grass1],
  [320, PALETTE.terrain.grass2],
  [650, PALETTE.terrain.grass3],
  [1000, PALETTE.terrain.hill],
  [1600, PALETTE.terrain.rock],
  [2300, PALETTE.terrain.peak],
];

/** Köşe renkleri doğrusal uzayda olmalı (palet sRGB). */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const FOREST: [number, number, number] = [72, 106, 56];
const FOREST_HIGH: [number, number, number] = [66, 98, 66];
const URBAN: [number, number, number] = [176, 168, 152];
const CLIFF: [number, number, number] = [132, 126, 118];

/**
 * Köşe rengi: yüksekliğe göre temel renk, üstüne dik yamaçta kaya, ormanda koyu yeşil, ovada tarla parselleri.
 * k: ızgara köşe indeksi (arazi örtüsü ızgaraları), x/z: dünya konumu (yapı tabanları temizlenir).
 */
function colorAt(h: number, out: number[], k = -1, x = 0, z = 0): void {
  let i = 0;
  while (i < STOPS.length - 1 && h > STOPS[i + 1][0]) i++;
  const [h0, c0] = STOPS[i];
  const [h1, c1] = STOPS[Math.min(i + 1, STOPS.length - 1)];
  const t = h1 > h0 ? smoothstep(h0, h1, h) : 0;
  let r = c0[0] + (c1[0] - c0[0]) * t;
  let g = c0[1] + (c1[1] - c0[1]) * t;
  let b = c0[2] + (c1[2] - c0[2]) * t;
  if (k >= 0 && h > 0) {
    const mix = (c: [number, number, number], a: number) => {
      r += (c[0] - r) * a;
      g += (c[1] - g) * a;
      b += (c[2] - b) * a;
    };
    const keep = clearFactor(x, z);
    const slope = slopeGrid[k];
    if (slope > 0.45 && h > 150) mix(CLIFF, smoothstep(0.45, 1.1, slope) * 0.5);
    const fl = (fieldGrid[k] / 255) * keep;
    if (fl > 0.02) mix(FIELD_COLORS[fieldKind[k]], fl * 0.72);
    const fo = (forestGrid[k] / 255) * keep;
    if (fo > 0.02) mix(h > 900 ? FOREST_HIGH : FOREST, Math.min(1, fo * 1.25) * 0.92);
    const ur = urbanGrid[k] / 255;
    if (ur > 0.02) mix(URBAN, ur * 0.8);
  }
  // Köşe başına parlaklık titreşimi yok: uzakta 146 m'lik ızgarada çapraz şerit (hare) deseni üretiyordu
  out[0] = toLinear(Math.min(1, r / 255));
  out[1] = toLinear(Math.min(1, g / 255));
  out[2] = toLinear(Math.min(1, b / 255));
}

/**
 * Parça (chunk) kenarı, ızgara hücresi cinsinden. Küçük haritada hücre sık: parça 128 hücre olur ki gerçek boyu
 * (≈9–12 km) ve çizim çağrısı sayısı 300 km'dekine yakın kalsın (rebuild günceller; diziler en çok parçaya göre).
 */
let CH = 64;
let NC = TERRAIN_N / CH;
/** Haritanın parça kenarı (hücre): 300 km'de 64, küçük ve orta haritada 128. */
export function chunkCells(): number {
  return MAP_SCALE <= 0.75 ? 128 : 64;
}

/** Ayrıntı düzeylerinin adımı (hücre). 0: tam, 1: yarım, 2: çeyrek çözünürlük. */
const STEPS = [1, 2, 4];
/** Düzeye geçilen kamera uzaklığı (m): tam çözünürlük uzağa kadar, geçişler sisli ufukta. */
const LOD_DIST = [0, 65000, 120000];
/** Düzey geçişinde gidip gelmeyi önleyen pay (oran). */
const LOD_HYSTERESIS = 0.12;
/** Bu uzaklığın ötesinde ince düzeyler bellekten atılır. */
const DROP_DIST = [150000, 240000];
/** Kare başına üretilecek en çok ağ (kaydırırken takılma olmasın). */
const BUILD_BUDGET = 6;
/** Üst parça: kaba düzeyde (yarım, çeyrek) 4×4 parça tek ağda çizilir (uzak arazide çizim çağrısı 16'da bire). */
const SUPER = 4;
let NS = NC / SUPER;
/** Farklı ayrıntı düzeyindeki komşu parçalar arasındaki çatlakları örten etek derinliği (m). */
const SKIRT = 90;

/** İnce ızgaranın köşe renkleri (doğrusal uzay, 8 bit). Parça parça, gerektiğinde doldurulur. */
const fineCol = new Uint8Array(TERRAIN_W * TERRAIN_W * 3);
/** Parçanın ince renkleri hazır mı (komşu payıyla). */
const fineReady = new Uint8Array(NC * NC);

function fillFine(i0: number, i1: number, j0: number, j1: number): void {
  const c = [0, 0, 0];
  for (let j = Math.max(0, j0); j <= Math.min(TERRAIN_N, j1); j++) {
    for (let i = Math.max(0, i0); i <= Math.min(TERRAIN_N, i1); i++) {
      const k = j * TERRAIN_W + i;
      colorAt(heights[k], c, k, -HALF + i * TERRAIN_CELL, -HALF + j * TERRAIN_CELL);
      fineCol[k * 3] = Math.round(c[0] * 255);
      fineCol[k * 3 + 1] = Math.round(c[1] * 255);
      fineCol[k * 3 + 2] = Math.round(c[2] * 255);
    }
  }
}

/** Parçanın (ve süzgeç payının) ince renklerini hazırla. */
function ensureFine(ci: number, cj: number): void {
  const n = cj * NC + ci;
  if (fineReady[n]) return;
  fineReady[n] = 1;
  fillFine(ci * CH - 4, (ci + 1) * CH + 4, cj * CH - 4, (cj + 1) * CH + 4);
}

const clampN = (v: number) => (v < 0 ? 0 : v > TERRAIN_N ? TERRAIN_N : v);

/**
 * Yarım düzey köşe rengi: kapsadığı ince köşelerin üçgen (çadır) ağırlıklı ortalaması.
 * Tek noktadan örneklemek tarla/orman lekelerini düzey değişiminde zıplatıyordu (kaydırırken titreme).
 */
function coarseColor(i: number, j: number, s: number, out: number[]): void {
  let r = 0;
  let g = 0;
  let b = 0;
  let ws = 0;
  for (let dj = 1 - s; dj < s; dj++) {
    const jj = clampN(j + dj);
    const wj = s - Math.abs(dj);
    for (let di = 1 - s; di < s; di++) {
      const k = (jj * TERRAIN_W + clampN(i + di)) * 3;
      const w = wj * (s - Math.abs(di));
      r += fineCol[k] * w;
      g += fineCol[k + 1] * w;
      b += fineCol[k + 2] * w;
      ws += w;
    }
  }
  out[0] = r / ws / 255;
  out[1] = g / ws / 255;
  out[2] = b / ws / 255;
}

const hAt = (i: number, j: number) => Math.max(heights[clampN(j) * TERRAIN_W + clampN(i)], 0);

/**
 * Arazi malzemesi. Normal parça parçalarının (three normal_fragment_begin) yerine:
 * - yakın düzeyde (flat) köşeli yüz normali kameraya yakın, 2,5–12 km arasında köşe normaline geçer: low-poly yakında
 *   kalır, uzakta ızgara köşegeninin testere dişi basamakları ve çapraz şeritler söner;
 * - etekler her zaman kendi köşe normalini kullanır ve çift yüzlü çizimde normal ters çevrilmez. Uzakta derinlik
 *   hassasiyeti yetmeyince eteğin üst kenarı yüzeyden bir piksel sızar; normali ve rengi yüzeyle aynı olduğu için
 *   görünmez (eskiden arkadan görülen eteğin normali ters dönüyor, parça sınırlarında koyu çizgi çıkıyordu).
 */
/** Su: dalga zamanı (dünya zamanı, s) ve kalite (0: düz su, yalnız gök yansıması). Her karede güncellenir. */
export const waterU = {
  waterTime: { value: 0 },
  waterQ: { value: 1 },
  /** Arazi dokusu (0 kapalı: düşük kalite). */
  terrDetail: { value: 1 },
};

/**
 * Arazi dokusu (renk köşelerde; doku gölgelendiricide, dünya ekseninde): büyük ölçekli renk dalgası; yakında çim ve
 * toprak dokusu; tarlada parsel başına yönlenen saban izleri; orman tabanında tepe gölgesi beneği; dik yamaçta kaya
 * katmanları. Desenler piksel izine göre söner (uzakta hare yok).
 */
const LAND_PARS = /* glsl */ `
  varying vec2 vLand;
  varying vec3 vTN;
  uniform float terrDetail;
  float tHash( vec2 c ) { return fract( sin( dot( c, vec2( 41.13, 289.71 ) ) ) * 43758.5453 ); }
  /**
   * Dönemli değer gürültüsü: konum 8.192 m'lik kareye indirgenir (hassasiyet), k: bu karede kaç hücre (tam sayı);
   * kafes de k'da sarar: kare sınırında dikiş olmaz.
   */
  float tNoise( vec2 lp, float k ) {
    vec2 p = lp * ( k / 8192.0 );
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    vec2 i1 = mod( i + 1.0, k );
    i = mod( i, k );
    return mix( mix( tHash( i ), tHash( vec2( i1.x, i.y ) ), f.x ), mix( tHash( vec2( i.x, i1.y ) ), tHash( i1 ), f.x ), f.y );
  }
`;

const LAND_FS = /* glsl */ `
  if ( vWater < 0.5 ) {
    vec2 lp = mod( vCloudW.xz, 8192.0 );
    float lfw = length( fwidth( vCloudW.xz ) );
    float macro = tNoise( lp, 9.0 ) * 0.6 + tNoise( lp + 113.0, 38.0 ) * 0.4;
    diffuseColor.rgb *= 0.9 + 0.2 * macro;
    if ( terrDetail > 0.5 ) {
      float near = 1.0 - smoothstep( 0.4, 3.0, lfw );
      float micro = tNoise( lp, 2540.0 ) * 0.55 + tNoise( lp + 7.0, 10404.0 ) * 0.45;
      diffuseColor.rgb *= mix( 1.0, 0.86 + 0.28 * micro, near * ( 1.0 - vLand.y ) );
      if ( vLand.x > 0.05 ) {
        // Saban izleri: parsel hücresine göre doğu-batı ya da kuzey-güney (2,56 m aralık: 8.192 m'de tam devir)
        float dir = step( 0.5, tHash( floor( lp / 256.0 ) ) );
        float c = mix( lp.x, lp.y, dir );
        float fade = 1.0 - smoothstep( 0.3, 1.3, fwidth( c ) );
        diffuseColor.rgb *= 1.0 - 0.14 * ( 0.5 + 0.5 * cos( 6.2832 * c / 2.56 ) ) * vLand.x * fade;
      }
      if ( vLand.y > 0.05 ) {
        float fm = tNoise( lp, 492.0 ) * 0.6 + tNoise( lp, 1720.0 ) * 0.4;
        diffuseColor.rgb *= mix( 1.0, 0.76 + 0.36 * fm, vLand.y * ( 1.0 - smoothstep( 3.0, 16.0, lfw ) ) );
      }
      float slope = 1.0 - normalize( vTN ).y;
      if ( slope > 0.22 ) {
        float band = tNoise( vec2( vCloudW.y * 37.0, lp.x + lp.y ), 66.0 ) * 0.7 + tNoise( lp, 410.0 ) * 0.3;
        diffuseColor.rgb *= mix( 1.0, 0.8 + 0.32 * band, smoothstep( 0.22, 0.5, slope ) * ( 1.0 - smoothstep( 6.0, 30.0, lfw ) ) );
      }
    }
  }
`;

/**
 * Su yüzeyi (derinliği 0'dan büyük köşeler): altı dalganın eğimi, gökyüzünü yansıtan Fresnel, güneş (gece ay)
 * parıltısı, kıyıda dalgayla gelip giden köpük. Dalga sayıları 2.048 m'lik karenin tam katı: konum bu kareye
 * indirgenir, 150 km'lik koordinatta da gölgelendiricide hassasiyet kaybı olmaz. Hız derin su dağılımından
 * (ω = √(g·k)). Kısa dalgalar uzakta söner (strateji haritasında hare olmasın); uzakta parıltı genişler.
 */
const WATER_PARS = /* glsl */ `
  varying float vWater;
  uniform float waterTime;
  uniform float waterQ;
  /**
   * Bir dalganın yüzey eğimi: mn dalga sayısı (2.048 m'de devir), s en büyük eğim, fp pikselin sudaki izi (m).
   * Dalga boyu birkaç pikselin altına inince söner (uzakta ve yatık bakışta hare yerine düz yansıma).
   */
  vec2 waveSlope( vec2 mn, float s, vec2 wp, float fp ) {
    vec2 k = mn * 0.00306796;
    float kl = length( k );
    float lam = 6.2832 / kl;
    float ph = dot( k, wp ) - sqrt( 9.81 * kl ) * waterTime;
    return k / kl * ( s * ( 1.0 - smoothstep( 0.12, 0.35, fp / lam ) ) * cos( ph ) );
  }
`;

const WATER_FS = /* glsl */ `
  if ( vWater > 0.0 ) {
    float wm = smoothstep( 0.0, 1.5, vWater );
    vec3 toP = vCloudW - cameraPosition;
    float wd = length( toP );
    vec3 V = toP / max( wd, 1e-3 );
    vec2 wp = mod( vCloudW.xz, 2048.0 );
    vec2 wg = vec2( 0.0 );
    float fp = length( fwidth( vCloudW.xz ) );
    if ( waterQ > 0.0 && wd < 20000.0 ) {
      // Rüzgâr esintisi lekeleri: kısa dalgalar yer yer güçlü, yer yer sakin (düzenli kafes görünmesin)
      float gust = 0.55 + 0.45 * sin( dot( wp, vec2( 3.0, 2.0 ) ) * 0.00306796 + sin( dot( wp, vec2( -2.0, 5.0 ) ) * 0.00306796 ) * 2.0 - waterTime * 0.05 );
      // Uzay bükmesi: dalga tepeleri düz sıralar yerine kıvrılır (bükme de 2.048 m'de devirli)
      vec2 ww = wp + 28.0 * vec2( sin( dot( wp, vec2( 7.0, -4.0 ) ) * 0.00306796 ), sin( dot( wp, vec2( 5.0, 9.0 ) ) * 0.00306796 ) );
      wg += waveSlope( vec2( 13.0, 6.0 ), 0.045, wp, fp );
      wg += waveSlope( vec2( -9.0, 17.0 ), 0.04, ww, fp );
      wg += waveSlope( vec2( 23.0, -11.0 ), 0.035, wp, fp );
      wg += gust * waveSlope( vec2( 8.0, 37.0 ), 0.035, ww, fp );
      wg += gust * waveSlope( vec2( -47.0, -19.0 ), 0.03, ww, fp );
      wg += gust * waveSlope( vec2( 61.0, 29.0 ), 0.028, wp, fp );
      wg += gust * waveSlope( vec2( -29.0, 71.0 ), 0.025, ww, fp );
      wg += gust * waveSlope( vec2( 97.0, -43.0 ), 0.022, ww, fp );
      // Kısa dalgacıklar (≈12 ve 9 m): yalnız yakında; güneş parıltısını küçük pırıltılara böler
      wg += gust * waveSlope( vec2( 151.0, 72.0 ), 0.022, ww, fp );
      wg += gust * waveSlope( vec2( -113.0, 187.0 ), 0.02, wp, fp );
      wg *= waterQ;
    }
    vec3 wn = normalize( vec3( -wg.x, 1.0, -wg.y ) );
    vec3 R = reflect( V, wn );
    R.y = abs( R.y );
    float cosT = clamp( dot( -V, wn ), 0.0, 1.0 );
    float fres = 0.02 + 0.98 * pow( 1.0 - cosT, 5.0 );
    // Işık katsayısı (güneş + gök, bulut gölgesi dahil): köpük ve su gövdesi aynı ışıkta
    vec3 lightK = ( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse ) / max( diffuseColor.rgb, vec3( 0.02 ) );
    vec3 wcol = mix( outgoingLight * 0.82, atmoSky( normalize( R ) ), fres );
    #if NUM_DIR_LIGHTS > 0
      vec3 Lw = normalize( ( vec4( directionalLights[ 0 ].direction, 0.0 ) * viewMatrix ).xyz );
      // Uzakta pürüzlü (geniş, soluk parıltı), yakında dalga eğimleriyle keskin pırıltı
      float far = smoothstep( 800.0, 25000.0, wd );
      float sh = mix( 700.0, 60.0, far );
      float spec = pow( max( dot( R, Lw ), 0.0 ), sh ) * sqrt( sh ) * mix( 0.06, 0.015, far );
      wcol += directionalLights[ 0 ].color * spec * smoothstep( -0.02, 0.06, Lw.y );
    #endif
    // Kıyı köpüğü: sığlıkta, kıyıya doğru yürüyen dalga bantlarıyla
    float foam = smoothstep( 0.1, 0.5, vWater ) * ( 1.0 - smoothstep( 1.0, 3.2, vWater ) );
    foam *= 0.5 + 0.5 * sin( dot( wp, vec2( 17.0, 29.0 ) ) * 0.00306796 - waterTime * 1.1 );
    wcol = mix( wcol, lightK * 0.85, foam * 0.75 * waterQ );
    outgoingLight = mix( outgoingLight, wcol, wm );
  }
`;

function terrainMaterial(flat: boolean): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  if (flat) m.defines = { TERRAIN_FLAT: '' };
  m.onBeforeCompile = (shader) => {
    linkAtmosphere(shader);
    linkCloudShadow(shader);
    Object.assign(shader.uniforms, waterU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float skirt;\nvarying float vSkirt;\nattribute float water;\nvarying float vWater;\nattribute vec2 land;\nvarying vec2 vLand;\nvarying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkirt = skirt;\nvWater = water;\nvLand = land;\nvTN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vSkirt;\n${WATER_PARS}\n${LAND_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${LAND_FS}`)
      .replace('#include <opaque_fragment>', `${WATER_FS}\n#include <opaque_fragment>`)
      .replace('#include <normal_fragment_begin>', /* glsl */ `
        float faceDirection = 1.0;
        vec3 normal = normalize( vNormal );
        #ifdef TERRAIN_FLAT
          vec3 flatN = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
          float smoothK = max( smoothstep( 2500.0, 12000.0, length( vViewPosition ) ), step( 0.5, vSkirt ) );
          normal = normalize( mix( flatN, normal, smoothK ) );
        #endif
        vec3 nonPerturbedNormal = normal;
      `);
  };
  m.customProgramCacheKey = () => (flat ? 'terrainFlat' : 'terrain');
  return m;
}

interface Chunk {
  ci: number;
  cj: number;
  cx: number;
  cz: number;
  /** Düzey başına ağ (çeyrek düzey hep var; ince düzeyler gerektikçe). */
  meshes: (THREE.Mesh | null)[];
  /** Çizilen düzey. */
  level: number;
}

/**
 * Parçalı arazi: 32×32 parça. Çeyrek çözünürlük her parçada hep var; tam ve yarım çözünürlük kameraya yakın
 * parçalar için kare başına birkaç tane üretilir, uzaklaşınca bırakılır (300 km haritada bellek sınırlı kalsın).
 * Yakında simülasyonla aynı üçgenleme. Görüş dışındaki parçalar çizilmez.
 */
export class TerrainView {
  readonly group = new THREE.Group();
  /** Yakın düzey köşeli (low-poly); uzak düzeyler yumuşak gölgeli (düzey değişiminde yüzey parlaklığı zıplamasın). */
  private readonly material = terrainMaterial(true);
  private readonly materialFar = terrainMaterial(false);
  private chunks: Chunk[] = [];
  /** Üst parçaların yarım (1) ve çeyrek (2) düzey ağları; [üst parça][düzey] (0 kullanılmaz). */
  private supers: (THREE.Mesh | null)[][] = [];
  private readonly dist = new Float64Array(NC * NC);
  private readonly want = new Uint8Array(NC * NC);
  private mapVersion = -1;
  private editVersion = -1;
  private readonly scene: THREE.Scene;
  private outer: THREE.Mesh | null = null;
  private outerSize = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.group);
    this.rebuild();
  }

  /** Harita dışı açık deniz: harita kadar delikli büyük düzlem (harita büyüklüğü değişince yeniden kurulur). */
  private buildOuter(): void {
    if (this.outerSize === MAP_SIZE) return;
    this.outerSize = MAP_SIZE;
    if (this.outer) {
      this.scene.remove(this.outer);
      this.outer.geometry.dispose();
    }
    const big = MAP_SIZE * 8;
    const shape = new THREE.Shape();
    shape.moveTo(-big, -big);
    shape.lineTo(big, -big);
    shape.lineTo(big, big);
    shape.lineTo(-big, big);
    shape.lineTo(-big, -big);
    const hole = new THREE.Path();
    hole.moveTo(-HALF, -HALF);
    hole.lineTo(-HALF, HALF);
    hole.lineTo(HALF, HALF);
    hole.lineTo(HALF, -HALF);
    hole.lineTo(-HALF, -HALF);
    shape.holes.push(hole);
    // Haritanın sudan farksız açık denizi: arazinin su gölgelendiricisiyle (derin su rengi, dalga, yansıma)
    const og = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
    const on = og.getAttribute('position').count;
    const deep = PALETTE.terrain.seaDeep.map((v) => toLinear(v / 255));
    og.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: on * 3 }, (_, i) => deep[i % 3]), 3));
    og.setAttribute('skirt', new THREE.BufferAttribute(new Float32Array(on), 1));
    og.setAttribute('water', new THREE.BufferAttribute(new Float32Array(on).fill(300), 1));
    og.setAttribute('land', new THREE.BufferAttribute(new Float32Array(on * 2), 2));
    const nrm = og.getAttribute('normal');
    for (let i = 0; i < on; i++) nrm.setXYZ(i, 0, 1, 0);
    this.outer = new THREE.Mesh(og, this.materialFar);
    this.scene.add(this.outer);
  }

  /** Yüklü harita değiştiyse bütün parçaları baştan kur (çeyrek düzey hemen, ince düzeyler gerektikçe). */
  private rebuild(): void {
    if (this.mapVersion === terrainMap.version) return;
    this.mapVersion = terrainMap.version;
    this.editVersion = terrainEdits.version;
    terrainEdits.dirty.length = 0;
    this.buildOuter();
    for (const c of this.chunks) for (const m of c.meshes) if (m) this.disposeMesh(m);
    for (const sp of this.supers) for (const m of sp) if (m) this.disposeMesh(m);
    CH = chunkCells();
    NC = TERRAIN_N / CH;
    NS = NC / SUPER;
    this.supers = Array.from({ length: NS * NS }, () => [null, null, null]);
    this.chunks = [];
    fineReady.fill(0);
    for (let cj = 0; cj < NC; cj++) {
      for (let ci = 0; ci < NC; ci++) {
        const c: Chunk = {
          ci, cj, cx: -HALF + (ci + 0.5) * CH * TERRAIN_CELL, cz: -HALF + (cj + 0.5) * CH * TERRAIN_CELL, meshes: [null, null, null], level: 2,
        };
        c.meshes[2] = this.makeMesh(c, 2);
        this.chunks.push(c);
      }
    }
  }

  private makeMesh(c: Chunk, level: number): THREE.Mesh {
    if (level < 2) ensureFine(c.ci, c.cj);
    const m = new THREE.Mesh(this.chunkGeometry(c.ci, c.cj, level), level === 0 ? this.material : this.materialFar);
    m.position.set(c.cx, 0, c.cz);
    m.visible = false;
    this.group.add(m);
    freeze(m);
    return m;
  }

  private disposeMesh(m: THREE.Mesh): void {
    this.group.remove(m);
    m.geometry.dispose();
  }

  /**
   * Her kare: harita/inşaat değişiklikleri, kameraya göre düzey seçimi ve ince düzeylerin üretimi. Üretilecek ağlar
   * yakından uzağa sıralanır (sıralama yalnız eksik ağ varken; eskiden her karede 1.024 parça sıralanıyordu).
   */
  update(camera: THREE.Camera): void {
    this.rebuild();
    this.sync();
    const p = camera.position;
    const n = this.chunks.length;
    const need: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = this.chunks[i];
      const d = Math.hypot(c.cx - p.x, p.y, c.cz - p.z);
      this.dist[i] = d;
      // İstenen düzey (geçişte pay: mevcut düzeyde kalmaya eğilimli)
      let want = 0;
      for (let l = 1; l < 3; l++) {
        // Küçük haritada hücre sık: mesafe ölçekle küçülür (çizilen üçgen sayısı 300 km'dekiyle aynı kalır)
        const th = LOD_DIST[l] * MAP_SCALE * (c.level >= l ? 1 - LOD_HYSTERESIS : 1 + LOD_HYSTERESIS);
        if (d >= th) want = l;
      }
      this.want[i] = want;
      if (!c.meshes[want]) need.push(i);
    }
    // İnce düzey yoksa bütçe elverdikçe (yakındakiler önce) üret; yetmezse eldeki en iyi düzeyde kal
    if (need.length) {
      need.sort((a, b) => this.dist[a] - this.dist[b]);
      for (let k = 0; k < Math.min(BUILD_BUDGET, need.length); k++) {
        const c = this.chunks[need[k]];
        c.meshes[this.want[need[k]]] = this.makeMesh(c, this.want[need[k]]);
      }
    }
    for (let i = 0; i < n; i++) {
      const c = this.chunks[i];
      let show = this.want[i];
      while (!c.meshes[show]) show++;
      if (show !== c.level || !c.meshes[c.level]?.visible) {
        for (let l = 0; l < 3; l++) if (c.meshes[l]) c.meshes[l]!.visible = l === show;
        c.level = show;
      }
      // Uzaktaki ince düzeyleri bırak
      for (let l = 0; l < 2; l++) {
        const m = c.meshes[l];
        if (m && l !== c.level && this.dist[i] > DROP_DIST[l] * MAP_SCALE) {
          this.disposeMesh(m);
          c.meshes[l] = null;
          if (l === 1) this.dropSuper(c, 1);
        }
      }
    }
    this.updateSupers();
  }

  /** Üst parçalar: 16 parçanın hepsi aynı kaba düzeydeyse onların yerine birleşik ağ çizilir (kare başına bir üretim). */
  private updateSupers(): void {
    let budget = 1;
    for (let sj = 0; sj < NS; sj++) {
      for (let si = 0; si < NS; si++) {
        const sp = this.supers[sj * NS + si];
        const first = this.chunks[sj * SUPER * NC + si * SUPER];
        let level = first.level;
        for (let j = 0; j < SUPER && level > 0; j++) {
          for (let i = 0; i < SUPER; i++) {
            if (this.chunks[(sj * SUPER + j) * NC + si * SUPER + i].level !== level) {
              level = 0;
              break;
            }
          }
        }
        if (level > 0 && !sp[level] && budget > 0) {
          budget--;
          sp[level] = this.makeSuper(si, sj, level);
        }
        const use = level > 0 && !!sp[level];
        for (let l = 1; l < 3; l++) if (sp[l]) sp[l]!.visible = use && l === level;
        if (!use) continue;
        for (let j = 0; j < SUPER; j++) {
          for (let i = 0; i < SUPER; i++) this.chunks[(sj * SUPER + j) * NC + si * SUPER + i].meshes[level]!.visible = false;
        }
      }
    }
  }

  /** 16 parçanın aynı düzeydeki geometrilerini üst parça merkezine göre birleştir. */
  private makeSuper(si: number, sj: number, level: number): THREE.Mesh {
    const size = CH * TERRAIN_CELL;
    const sx = -HALF + (si + 0.5) * SUPER * size;
    const sz = -HALF + (sj + 0.5) * SUPER * size;
    const parts: THREE.BufferGeometry[] = [];
    for (let j = 0; j < SUPER; j++) {
      for (let i = 0; i < SUPER; i++) {
        const c = this.chunks[(sj * SUPER + j) * NC + si * SUPER + i];
        parts.push(c.meshes[level]!.geometry.clone().translate(c.cx - sx, 0, c.cz - sz));
      }
    }
    const g = mergeGeometries(parts)!;
    for (const q of parts) q.dispose();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.materialFar);
    m.position.set(sx, 0, sz);
    m.visible = false;
    this.group.add(m);
    freeze(m);
    return m;
  }

  /** Parçanın düzey ağı değişti ya da atıldı: üst parçasının o düzeydeki birleşik ağı da gider. */
  private dropSuper(c: Chunk, level: number): void {
    const sp = this.supers[Math.floor(c.cj / SUPER) * NS + Math.floor(c.ci / SUPER)];
    const m = sp[level];
    if (!m) return;
    this.disposeMesh(m);
    sp[level] = null;
  }

  /** Bir parçanın verilen düzeydeki ağı (parça merkezine göre yerel), kenar etekleriyle. */
  private chunkGeometry(ci: number, cj: number, level: number): THREE.BufferGeometry {
    const step = STEPS[level];
    const n = CH / step;
    const w = n + 1;
    const cx = -HALF + (ci + 0.5) * CH * TERRAIN_CELL;
    const cz = -HALF + (cj + 0.5) * CH * TERRAIN_CELL;
    const ring = 4 * n;
    // Yüzey köşeleri + etek: her kenar parçasının kendi dört köşesi (üstteki ikisi yüzeyle aynı, alttaki ikisi aşağıda)
    const nv = w * w + ring * 4;
    const pos = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const nrm = new Float32Array(nv * 3);
    const skirt = new Float32Array(nv);
    /** Su derinliği (m; karada 0): gölgelendiricide su yüzeyi ve kıyı köpüğü. */
    const water = new Float32Array(nv);
    /** Arazi örtüsü (tarla, orman 0..1): gölgelendiricide saban izi ve orman tabanı. */
    const land = new Float32Array(nv * 2);
    const c = [0, 0, 0];
    const vert = (a: number, b: number, o: number, drop: number) => {
      const i = ci * CH + a * step;
      const j = cj * CH + b * step;
      const k = j * TERRAIN_W + i;
      const h = heights[k];
      pos[o * 3] = -HALF + i * TERRAIN_CELL - cx;
      pos[o * 3 + 1] = Math.max(h, 0) - drop;
      pos[o * 3 + 2] = -HALF + j * TERRAIN_CELL - cz;
      water[o] = Math.max(0, -h);
      land[o * 2] = fieldGrid[k] / 255;
      land[o * 2 + 1] = forestGrid[k] / 255;
      if (step === 1) {
        c[0] = fineCol[k * 3] / 255;
        c[1] = fineCol[k * 3 + 1] / 255;
        c[2] = fineCol[k * 3 + 2] / 255;
      } else if (step === 2) coarseColor(i, j, step, c);
      // Çeyrek düzey yalnız ufukta (sisin içinde): doğrudan örnek yeter
      else colorAt(h, c, k, -HALF + i * TERRAIN_CELL, -HALF + j * TERRAIN_CELL);
      col[o * 3] = c[0];
      col[o * 3 + 1] = c[1];
      col[o * 3 + 2] = c[2];
      if (nrm) {
        // Düzgün normal: yükseklik ızgarasından merkezi fark (etek köşeleri üstteki köşeyle aynı)
        const nx = hAt(i - step, j) - hAt(i + step, j);
        const nz = hAt(i, j - step) - hAt(i, j + step);
        const ny = 2 * step * TERRAIN_CELL;
        const l = Math.hypot(nx, ny, nz);
        nrm[o * 3] = nx / l;
        nrm[o * 3 + 1] = ny / l;
        nrm[o * 3 + 2] = nz / l;
      }
    };
    for (let b = 0; b < w; b++) for (let a = 0; a < w; a++) vert(a, b, b * w + a, 0);
    const idx = new Uint16Array(n * n * 6 + ring * 6);
    let q = 0;
    for (let b = 0; b < n; b++) {
      for (let a = 0; a < n; a++) {
        const v00 = b * w + a;
        const v10 = v00 + 1;
        const v01 = v00 + w;
        const v11 = v01 + 1;
        idx[q++] = v00; idx[q++] = v11; idx[q++] = v10;
        idx[q++] = v00; idx[q++] = v01; idx[q++] = v11;
      }
    }
    // Etek: kenar halkası boyunca aşağı sarkan şerit (ayrıntı düzeyi farkından doğan yarıkları kapatır)
    const edge: number[] = [];
    for (let a = 0; a < n; a++) edge.push(a);
    for (let b = 0; b < n; b++) edge.push(b * w + n);
    for (let a = n; a > 0; a--) edge.push(n * w + a);
    for (let b = n; b > 0; b--) edge.push(b * w);
    const base = w * w;
    for (let e = 0; e < ring; e++) {
      const v0 = edge[e];
      const v1 = edge[(e + 1) % ring];
      const o = base + e * 4;
      vert(v0 % w, Math.floor(v0 / w), o, 0);
      vert(v1 % w, Math.floor(v1 / w), o + 1, 0);
      vert(v0 % w, Math.floor(v0 / w), o + 2, SKIRT);
      vert(v1 % w, Math.floor(v1 / w), o + 3, SKIRT);
      skirt.fill(1, o, o + 4);
      idx[q++] = o; idx[q++] = o + 2; idx[q++] = o + 1;
      idx[q++] = o + 1; idx[q++] = o + 2; idx[q++] = o + 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('skirt', new THREE.BufferAttribute(skirt, 1));
    g.setAttribute('water', new THREE.BufferAttribute(water, 1));
    g.setAttribute('land', new THREE.BufferAttribute(land, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  /** İnşaat düzleştirmelerini yansıt: etkilenen parçaların renkleri ve ağları yenilenir. */
  private sync(): void {
    if (this.editVersion === terrainEdits.version) return;
    this.editVersion = terrainEdits.version;
    for (const d of terrainEdits.dirty) {
      for (const c of this.chunks) {
        if (c.ci * CH > d.i1 + 4 || (c.ci + 1) * CH < d.i0 - 4 || c.cj * CH > d.j1 + 4 || (c.cj + 1) * CH < d.j0 - 4) continue;
        fineReady[c.cj * NC + c.ci] = 0;
        for (let l = 0; l < 3; l++) {
          const m = c.meshes[l];
          if (!m) continue;
          // Çizilen düzey ve çeyrek düzey hemen yenilenir; diğer ince düzey gerektiğinde yeniden üretilir
          if (l === c.level || l === 2) {
            if (l < 2) ensureFine(c.ci, c.cj);
            m.geometry.dispose();
            m.geometry = this.chunkGeometry(c.ci, c.cj, l);
          } else {
            this.disposeMesh(m);
            c.meshes[l] = null;
          }
          if (l > 0) this.dropSuper(c, l);
        }
      }
    }
    terrainEdits.dirty.length = 0;
  }
}

/** Ekran ışınının araziyle kesişimi (kaba adım + ikiye bölme). */
export function rayTerrain(ray: THREE.Ray, out: THREE.Vector3, maxDist = 900000): boolean {
  const o = ray.origin;
  const d = ray.direction;
  let t = 0;
  let step = Math.max(20, Math.abs(o.y) * 0.01);
  let prevT = 0;
  let above = o.y - groundLevel(o.x, o.z) > 0;
  if (!above) return false;
  while (t < maxDist) {
    t += step;
    const x = o.x + d.x * t;
    const y = o.y + d.y * t;
    const z = o.z + d.z * t;
    if (y - groundLevel(x, z) <= 0) {
      let lo = prevT;
      let hi = t;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        const my = o.y + d.y * mid;
        if (my - groundLevel(o.x + d.x * mid, o.z + d.z * mid) > 0) lo = mid;
        else hi = mid;
      }
      out.set(o.x + d.x * hi, 0, o.z + d.z * hi);
      out.y = groundLevel(out.x, out.z);
      return true;
    }
    if (d.y > 0 && y > 20000) return false;
    prevT = t;
    step = Math.min(step * 1.08, 400);
    above = true;
  }
  return false;
}
