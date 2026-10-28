// Atmosfer: gök kubbesi (tepeden ufka renk geçişi, güneş diski ve halesi), güneş ve yarım küre ışığı, yüksekliğe bağlı
// üstel sis. Sis ile gök aynı işlevden boyanır: uzaktaki arazi ufukta göğe dikişsiz karışır.
//
// Sis three.js'in kendi sis parçalarının yerine geçer (ShaderChunk), yani sis kullanan her malzemede çalışır:
//   - yoğunluk deniz seviyesinde en yüksek, yükseldikçe üstel azalır (vadide pus, 7 km'de berrak hava);
//   - bakış ışını boyunca toplam yoğunluk analitik hesaplanır (yere bakan strateji kamerası az pus görür);
//   - güneşe doğru bakışta sis güneş rengine ısınır (gökteki haleyle aynı);
//   - THREE.Fog'un near/far değerleri güvenlik rampası: kameranın uzak düzleminden önce sis tamamen kapanır.
// Güneş yönü setSun ile değişir; gün döngüsü bu işlevin üstüne kurulabilir.

import * as THREE from 'three';

/** Gök ve sis renkleri (sRGB onaltılık; malzemelere doğrusal uzayda gider). */
export const SKY = {
  zenith: 0x7fb0e4,
  horizon: 0xd6e4ec,
  sunGlow: 0xfff0d6,
  sunDisc: 0xfffbf0,
  sunLight: 0xfff3e2,
  hemiSky: 0xcfe1f4,
  hemiGround: 0xa79a80,
};

/** Yer rüzgârı (m/s, yalnız görsel): duman sütunları ve bulutlar bu yöne sürüklenir. Batıdan hafif esinti. */
export const WIND = new THREE.Vector3(3.6, 0, -1.2);

/** Sis: deniz seviyesinde sönüm (1/m), yükseklikle azalma (1/m), güneş halesinin sise katkısı. */
const FOG_DENSITY = 4.2e-5;
const FOG_FALLOFF = 1 / 1700;
const FOG_SUN = 0.55;

/** Bütün sisli malzemelerin paylaştığı değerler (her karede bir kez güncellenir). */
const shared = {
  atmoSunDir: { value: new THREE.Vector3(0, 1, 0) },
  atmoSunColor: { value: new THREE.Color(SKY.sunGlow) },
  atmoZenith: { value: new THREE.Color(SKY.zenith) },
  atmoHorizon: { value: new THREE.Color(SKY.horizon) },
  /** x yoğunluk, y yükseklikle azalma, z (boş), w güneş halesi katkısı */
  atmoFog: { value: new THREE.Vector4(FOG_DENSITY, FOG_FALLOFF, 0, FOG_SUN) },
};

// --- three.js sis parçaları --------------------------------------------------------------------------------------

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogRel;
#endif
`;

// Kameradan noktaya dünya yönünde vektör (görünüş uzayındaki konum kameranın dönüşüyle dünyaya çevrilir)
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogRel = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif
`;

const FOG_FN = /* glsl */ `
  uniform vec3 atmoSunDir;
  uniform vec3 atmoSunColor;
  uniform vec3 atmoZenith;
  uniform vec3 atmoHorizon;
  uniform vec4 atmoFog;
  /** Bakış ışını boyunca yükseklik sisi: 0 (berrak) .. 1 (tam sis). */
  float atmoFogAmount( float camY, vec3 dir, float dist ) {
    float b = atmoFog.y;
    float dy = dir.y * dist * b;
    float k = abs( dy ) > 1e-4 ? ( 1.0 - exp( - dy ) ) / dy : 1.0 - 0.5 * dy;
    float tau = atmoFog.x * exp( - max( camY, - 200.0 ) * b ) * dist * k;
    return 1.0 - exp( - tau );
  }
  /** Sisin ve ufkun rengi: güneşe doğru ısınır. */
  vec3 atmoFogColor( vec3 base, vec3 dir ) {
    float s = pow( max( dot( dir, atmoSunDir ), 0.0 ), 8.0 );
    return mix( base, atmoSunColor, s * atmoFog.w );
  }
  /** Gökyüzünün dir yönündeki rengi (güneş diski hariç): kubbe ve yansımalar aynı işlevi kullanır. */
  vec3 atmoSky( vec3 dir ) {
    float h = max( dir.y, 0.0 );
    vec3 sky = mix( atmoHorizon, atmoZenith, pow( h, 0.5 ) );
    return mix( sky, atmoFogColor( atmoHorizon, dir ), 1.0 - smoothstep( 0.0, 0.12, dir.y ) );
  }
`;

/**
 * Gökyüzü ve sis işlevleri (atmoSky, atmoFogColor, atmoFogAmount) başka gölgelendiricilere: sisli sahnede sis
 * parçası zaten getirir; sissiz sahnede (hangar, küçük resimler) bu getirir. Değerler linkAtmosphere ile bağlanır.
 */
export const ATMO_PARS = /* glsl */ `
#ifndef USE_FOG
${FOG_FN}
#endif
`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vFogRel;
  ${FOG_FN}
#endif
`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogDist = length( vFogRel );
  vec3 fogDir = vFogRel / max( fogDist, 1e-3 );
  float fogFactor = max( atmoFogAmount( cameraPosition.y, fogDir, fogDist ), smoothstep( fogNear, fogFar, fogDist ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, atmoFogColor( fogColor, fogDir ), fogFactor );
#endif
`;

/**
 * Renk derecelendirmesi (ton eşlemesinden sonra, bütün sahnede): algısal uzayda hafif S eğrisi (kontrast) ve biraz
 * doygunluk. Pus ve yumuşak ışık görüntüyü soluklaştırıyordu; modeller ve arazi daha belirgin.
 */
THREE.ShaderChunk.tonemapping_pars_fragment += /* glsl */ `
  // Khronos PBR Neutral, karanlık ucu yarıya indirilmiş. Asıl eğri koyu tonlardan 0,04'e kadar çıkarıyordu (toe):
  // asfalt, koyu boyalar ve gölgedeki yüzler 3–8 kat koyulaşıp kömür karasına dönüyordu, üstüne sis mavisi binince
  // lacivert. Parlak uçtaki sıkıştırma aynı.
  vec3 softNeutral( vec3 color ) {
    const float startCompression = 0.8 - 0.04;
    const float desaturation = 0.15;
    color *= toneMappingExposure;
    float x = min( color.r, min( color.g, color.b ) );
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset * 0.5;
    float peak = max( color.r, max( color.g, color.b ) );
    if ( peak < startCompression ) return color;
    float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / ( peak + d - startCompression );
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / ( desaturation * ( peak - newPeak ) + 1.0 );
    return mix( color, vec3( newPeak ), g );
  }
  vec3 sceneGrade( vec3 c ) {
    vec3 p = pow( max( c, 0.0 ), vec3( 1.0 / 2.2 ) );
    p = clamp( ( p - 0.5 ) * 1.12 + 0.5, 0.0, 1.0 );
    float l = dot( p, vec3( 0.299, 0.587, 0.114 ) );
    p = clamp( mix( vec3( l ), p, 1.03 ), 0.0, 1.0 );
    return pow( p, vec3( 2.2 ) );
  }
`;
THREE.ShaderChunk.tonemapping_fragment = /* glsl */ `
#if defined( TONE_MAPPING )
  gl_FragColor.rgb = sceneGrade( softNeutral( gl_FragColor.rgb ) );
#endif
`;

type CompiledShader = { uniforms: Record<string, THREE.IUniform>; fragmentShader: string; vertexShader: string };

/**
 * Paylaşılan sis değerlerini gölgelendiriciye bağla (aynı nesne: tek güncelleme hepsine yeter). Bütün malzemelerde
 * varsayılan olarak çalışır; kendi onBeforeCompile'ı olan malzeme bunu ayrıca çağırmalı, yoksa sisi bozulur.
 */
export function linkAtmosphere(shader: CompiledShader): void {
  Object.assign(shader.uniforms, shared);
}

THREE.Material.prototype.onBeforeCompile = function onBeforeCompile(shader: CompiledShader): void {
  linkAtmosphere(shader);
};

// --- gök kubbesi -------------------------------------------------------------------------------------------------

const DOME_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = ( modelMatrix * vec4( position, 0.0 ) ).xyz;
    vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position = p;
  }
`;

const DOME_FS = /* glsl */ `
  uniform vec3 sunDisc;
  uniform vec3 moonDir;
  uniform float night;
  ${FOG_FN}
  varying vec3 vDir;
  void main() {
    vec3 d = normalize( vDir );
    // Tepeden ufka renk geçişi; ufukta ve altında sis rengi (arazinin uzak sisiyle aynı)
    vec3 sky = atmoSky( d );
    float c = dot( d, atmoSunDir );
    // Güneşin çevresindeki parlaklık ve disk (güneş ufkun altına inince söner)
    float up = smoothstep( -0.04, 0.03, atmoSunDir.y );
    sky += atmoSunColor * ( pow( max( c, 0.0 ), 64.0 ) * 0.35 + pow( max( c, 0.0 ), 600.0 ) * 0.8 ) * up;
    // Gün batımı ve alacakaranlık: güneşin olduğu yanda geniş sıcak ışıma (ufka yakın), karşı ufukta pembe Venüs
    // kuşağı ve altında yerin koyu mavi gölgesi
    float dusk = smoothstep( -0.16, -0.01, atmoSunDir.y ) * ( 1.0 - smoothstep( 0.04, 0.3, atmoSunDir.y ) );
    float low = 1.0 - smoothstep( 0.0, 0.45, d.y );
    sky += atmoSunColor * pow( max( c, 0.0 ), 3.0 ) * low * dusk * 0.55;
    float anti = pow( max( -c, 0.0 ), 1.5 );
    float twi = smoothstep( -0.12, -0.02, atmoSunDir.y ) * ( 1.0 - smoothstep( 0.02, 0.12, atmoSunDir.y ) );
    float belt = smoothstep( 0.02, 0.09, d.y ) * ( 1.0 - smoothstep( 0.12, 0.32, d.y ) );
    sky = mix( sky, vec3( 0.62, 0.36, 0.44 ), belt * anti * twi * 0.55 );
    sky = mix( sky, vec3( 0.1, 0.13, 0.26 ), ( 1.0 - smoothstep( 0.0, 0.05, d.y ) ) * anti * twi * 0.45 );
    // Alçalan güneşin diski turuncuya döner
    vec3 disc = mix( sunDisc * 1.6, atmoSunColor * 2.2, dusk );
    sky = mix( sky, disc, smoothstep( 0.99955, 0.99975, c ) * up );
    // Gece: yıldızlar (yön ızgarasında rastgele hücreler) ve ay
    if ( night > 0.0 && d.y > 0.0 ) {
      vec3 q = d * 320.0;
      vec3 cell = floor( q );
      float h = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
      float s = step( 0.992, h ) * smoothstep( 0.32, 0.0, length( fract( q ) - 0.5 ) );
      sky += vec3( 0.85, 0.88, 1.0 ) * s * night * smoothstep( 0.0, 0.25, d.y ) * ( 0.4 + 0.6 * fract( h * 91.7 ) );
      float m = dot( d, moonDir );
      sky += vec3( 0.20, 0.24, 0.34 ) * pow( max( m, 0.0 ), 180.0 ) * night;
      sky = mix( sky, vec3( 0.86, 0.88, 0.94 ), smoothstep( 0.99968, 0.99982, m ) * night );
    }
    gl_FragColor = vec4( sky, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// --- gün döngüsü -------------------------------------------------------------------------------------------------

/** Oyun zamanında bir gün (s): 48 dakika. Hız çarpanı ve duraklatma güneşi de etkiler. */
export const DAY_LENGTH = 48 * 60;
/** Yeni oyun (dünya zamanı 0) bu saatte başlar. */
export const DAY_START = 8;
/** "Hep gündüz" ayarında saat. */
export const FIXED_HOUR = 11;
const DEG = Math.PI / 180;
/**
 * Haritaların enlemi ve mevsimi: güney yarımkürede yaz ortası. Öğle güneşi kuzeyde, yani strateji görünümünde ışık
 * ekranın üstünden gelir (kuzey yarımkürede alttan gelirdi: kabartma ters okunur, tepeler çukur gibi görünür).
 * Gün doğumu ~05:00, batımı ~19:00; öğle yüksekliği 68°.
 */
const LAT = -40 * DEG;
const DECL = -18 * DEG;

/** Dünya zamanından günün saati (0–24). shift: saat kaydırma (kayıt kipi). */
export function dayHour(time: number, shift = 0): number {
  const h = (DAY_START + shift + (time / DAY_LENGTH) * 24) % 24;
  return h < 0 ? h + 24 : h;
}

/** Güneşin yüksekliği ve pusulası (derece; pusula kuzeyden saat yönünde) günün saatine göre. */
export function sunAt(hour: number): { elevation: number; azimuth: number } {
  const H = (hour - 12) * 15 * DEG;
  const e = Math.asin(Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H) * Math.cos(DECL), Math.sin(DECL) * Math.cos(LAT) - Math.cos(DECL) * Math.sin(LAT) * Math.cos(H));
  return { elevation: e / DEG, azimuth: (az / DEG + 360) % 360 };
}

/**
 * Güneş yüksekliğine göre renk durakları (derece): gece, alacakaranlık, gün batımı, altın saat, öğle.
 * zen/hor gök, glow güneş halesi ve ufuktaki sıcak sis, light/li güneş ışığı, hs/hg/hi yarım küre ışığı.
 */
const KEYS = [
  { e: -14, zen: 0x15244c, hor: 0x2c3c5e, glow: 0x2c3c60, light: 0xffa070, li: 0, hs: 0x6276a6, hg: 0x2a3446, hi: 0.85 },
  // Mavi saat: tepe lacivert, ufuk mor-pembe
  { e: -7, zen: 0x1f2f5c, hor: 0x7a5682, glow: 0xb0607a, light: 0xffa070, li: 0, hs: 0x6f74a2, hg: 0x34323e, hi: 0.8 },
  // Güneş ufkun hemen altında: ufuk kızıl, ışıma pembe-turuncu
  { e: -2.5, zen: 0x304d8a, hor: 0xd8705a, glow: 0xff6a44, light: 0xff7a48, li: 0, hs: 0x9a86aa, hg: 0x4a3a40, hi: 0.72 },
  // Gün batımı: koyu turuncu ufuk, derin mavi tepe
  { e: 0.5, zen: 0x3f62a2, hor: 0xff9a5e, glow: 0xff7a36, light: 0xff8a48, li: 1.0, hs: 0xb49ab0, hg: 0x5e4840, hi: 0.7 },
  { e: 6, zen: 0x5c8ac6, hor: 0xf8c592, glow: 0xffb468, light: 0xffc07e, li: 1.9, hs: 0xc8c4d6, hg: 0x8a7860, hi: 0.88 },
  { e: 15, zen: 0x77a7de, hor: 0xe0dcd6, glow: 0xffe2b8, light: 0xffe6c8, li: 2.6, hs: 0xcbd9ef, hg: 0x9e9078, hi: 1.0 },
  { e: 25, zen: SKY.zenith, hor: SKY.horizon, glow: SKY.sunGlow, light: SKY.sunLight, li: 2.9, hs: SKY.hemiSky, hg: SKY.hemiGround, hi: 1.05 },
];
const _ca = new THREE.Color();
const _cb = new THREE.Color();
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Atmosphere {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.Fog;
  private readonly dome: THREE.Mesh;
  private readonly domeMat: THREE.ShaderMaterial;
  /** Güneşe doğru birim vektör. */
  readonly sunDir = new THREE.Vector3();
  /** Ayın yönü (gece ışığı buradan). */
  readonly moonDir = new THREE.Vector3();
  /** Gece oranı (0 gündüz, 1 tam gece). */
  night = 0;
  /** Gökyüzü aydınlığı 0..1 (ışıktan etkilenmeyen beyaz şeyler, ör. yoğuşma izi, buna göre kararır). */
  skyLight = 1;
  /** Gün batımı ışıması (bulutların alt yüzü güneşin son ışığıyla); gündüz ve gece siyah. */
  readonly cloudGlow = new THREE.Color(0, 0, 0);
  /** Işımanın gücü 0..1 (cloudGlow = güneş rengi × glow). */
  glow = 0;
  /** Günün saati (son setTime). */
  hour = DAY_START;

  constructor(scene: THREE.Scene) {
    this.fog = new THREE.Fog(SKY.horizon, 1e9, 2e9);
    scene.fog = this.fog;
    scene.background = new THREE.Color(SKY.horizon);
    this.hemi = new THREE.HemisphereLight(SKY.hemiSky, SKY.hemiGround, 1.05);
    this.sun = new THREE.DirectionalLight(SKY.sunLight, 2.9);
    scene.add(this.hemi, this.sun);

    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        sunDisc: { value: new THREE.Color(SKY.sunDisc) },
        moonDir: { value: this.moonDir },
        night: { value: 0 },
        ...shared,
      },
      vertexShader: DOME_VS,
      fragmentShader: DOME_FS,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    scene.add(this.dome);
    this.scene = scene;
    this.setTime(DAY_START);
  }

  private readonly scene: THREE.Scene;

  /**
   * Günün saati: güneşin yeri, gök ve sis renkleri, güneş ve yarım küre ışığı. Güneş ufkun 3° altına inince ışık ayın
   * yönüne geçer (soluk mavi; gece oynanabilir kalsın diye yarım küre ışığı da tamamen sönmez).
   */
  setTime(hour: number): void {
    this.hour = hour;
    const { elevation: e, azimuth } = sunAt(hour);
    this.setSun(e, azimuth);
    let i = 0;
    while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = smooth(a.e, b.e, e);
    const mix = (out: THREE.Color, x: number, y: number) => out.copy(_ca.setHex(x)).lerp(_cb.setHex(y), t);
    mix(shared.atmoZenith.value, a.zen, b.zen);
    mix(shared.atmoHorizon.value, a.hor, b.hor);
    mix(shared.atmoSunColor.value, a.glow, b.glow);
    this.fog.color.copy(shared.atmoHorizon.value);
    (this.scene.background as THREE.Color).copy(shared.atmoHorizon.value);
    mix(this.hemi.color, a.hs, b.hs);
    mix(this.hemi.groundColor, a.hg, b.hg);
    this.hemi.intensity = a.hi + (b.hi - a.hi) * t;
    // Ay: güneşin karşısında, ufkun en az 25° üstünde
    this.moonDir.set(-this.sunDir.x, 0, -this.sunDir.z);
    if (this.moonDir.lengthSq() < 1e-6) this.moonDir.set(0, 0, 1);
    this.moonDir.normalize().multiplyScalar(Math.cos(Math.max(25, -e) * DEG)).setY(Math.sin(Math.max(25, -e) * DEG));
    const sunI = (a.li + (b.li - a.li) * t) * smooth(-3, 1, e);
    const moonI = 0.65 * smooth(-3, -10, e);
    if (sunI >= moonI) {
      mix(this.sun.color, a.light, b.light);
      this.sun.intensity = sunI;
      this.sun.position.copy(this.sunDir);
    } else {
      this.sun.color.setHex(0xa8bbea);
      this.sun.intensity = moonI;
      this.sun.position.copy(this.moonDir);
    }
    this.night = smooth(-4, -12, e);
    (this.domeMat.uniforms.night as THREE.IUniform<number>).value = this.night;
    this.skyLight = 0.4 + 0.6 * smooth(-10, 4, e);
    // Bulut ışıması: güneş ufka yaklaşırken başlar, battıktan sonra (yüksek bulutta) bir süre daha sürer
    const gk = smooth(-9, -1.5, e) * (1 - smooth(3, 12, e));
    this.glow = gk;
    this.cloudGlow.copy(shared.atmoSunColor.value).multiplyScalar(gk * 1.0);
  }

  /** Güneşin yüksekliği ve pusulası (derece; 0 kuzey, 90 doğu). Harita kuzeyi -Z. */
  setSun(elevation: number, azimuth: number): void {
    const e = (elevation * Math.PI) / 180;
    const a = (azimuth * Math.PI) / 180;
    this.sunDir.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
    shared.atmoSunDir.value.copy(this.sunDir);
    this.sun.position.copy(this.sunDir);
  }

  /** Her kare: kubbe kameranın merkezinde; sis güvenlik rampası kameranın uzak düzleminden önce kapanır. */
  update(camera: THREE.PerspectiveCamera): void {
    this.dome.position.copy(camera.position);
    this.dome.scale.setScalar(camera.far * 0.9);
    this.fog.near = camera.far * 0.55;
    this.fog.far = camera.far * 0.85;
  }
}
