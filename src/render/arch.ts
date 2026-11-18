// Yapı yüzeyleri: tek gölgelendiricide gerçek malzeme görünümleri. Her parça (kutu, kemer, silindir, çatı) bir yüzey
// türü taşır; desen parçanın kendi ekseninde metre ölçeğinde hesaplanır (pencereler duvara ortalanır, köşelerden
// uzak durur). Uzakta pikselden ince desenler ortalama rengine söner (kıpırtı olmaz).
//
// Yüzeyler: tuğla, sıva ve beton duvar (pencereli ya da düz), oluklu sac, kiremit, katran keçe, testere dişi çatı
// (kuzey yüzü camlı), cam cephe, çim, kaldırım taşı, asfalt, pist betonu, kum torbası, boyalı metal, ahşap kaplama,
// su, toprak; şehir binaları için panjurlu ev duvarı, tuğla ev, Fachwerk, kesme taş ve silmeli kasaba evi cephesi.
// Pencereler göğü yansıtır; gece bir kısmı sıcak ışıkla yanar. Hasar: kurum ve yanık lekeleri büyür,
// camlar kararır. Bulut gölgesi alır.
//
// ArchBatch: parçaları yüzey türü ve renkle tek ağda birleştirir (yapı başına birkaç çizim çağrısı).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { linkAtmosphere } from './atmosphere';
import { linkCloudShadow } from './clouds';

/** Yüzey türleri (gölgelendiricideki kodlar). */
export const SURF = {
  plain: 0,
  brick: 1,
  brickWin: 2,
  plaster: 3,
  plasterWin: 4,
  concrete: 5,
  officeWin: 6,
  corrugated: 7,
  tile: 8,
  felt: 9,
  sawtooth: 10,
  curtain: 11,
  grass: 12,
  paving: 13,
  asphalt: 14,
  runway: 15,
  sandbag: 16,
  metal: 17,
  wood: 18,
  water: 19,
  earth: 20,
  hangarDoor: 21,
  aptWin: 22,
  canvas: 23,
  psp: 24,
  /** Ev duvarı: sıva, panjurlu pencereler, taş kaide. */
  house: 25,
  /** Tuğla ev: ev pencereleri (beyaz çerçeve), taş kaide. */
  brickHouse: 26,
  /** Fachwerk: krem sıva dolgu, koyu ahşap dikme, kuşak ve payanda. */
  timber: 27,
  /** Kesme taş cephe: blok derzleri, zeminde rustika, yüksek pencereler. */
  stone: 28,
  /** Kasaba evi cephesi: kat silmeleri, pencere söveleri; zemin katta pencere yok (vitrin ayrı parça). */
  town: 29,
  /** Ağaç: yeşil taçta yaprak öbekleri, kahverengi gövdede kabuk (köşe rengi kırmızıya yakınsa gövde). */
  leaf: 30,
  /** Çiçek öbeği: yeşil yaprak zemininde köşe rengindeki çiçek benekleri (düz renkli küp gibi durmaz). */
  flowers: 31,
} as const;
export type Surf = (typeof SURF)[keyof typeof SURF];

/** Gece pencere ışıkları (0 gündüz, 1 gece): her karede atmosferden. */
export const archU = { archNight: { value: 0 } };

const PARS = /* glsl */ `
  varying float vSurf;
  varying vec3 vPL;
  varying vec3 vPS;
  varying vec3 vAN;
  varying vec3 vAP;
  uniform float archNight;
  uniform float archDamage;
  uniform float archLit;

  float aHash( vec3 c ) { return fract( sin( dot( c, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
  float aHash2( vec2 c ) { return fract( sin( dot( c, vec2( 41.13, 289.71 ) ) ) * 43758.5453 ); }
  float aNoise( vec3 p ) {
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( mix( aHash( i ), aHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( aHash( i + vec3( 0, 1, 0 ) ), aHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
      mix( mix( aHash( i + vec3( 0, 0, 1 ) ), aHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( aHash( i + vec3( 0, 1, 1 ) ), aHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
  }
  /** Izgara derzi: c koordinatta sp aralıklı, w yarı kalınlıklı çizgi; piksel büyüyünce söner. */
  float aLine( float c, float sp, float w ) {
    float fw = fwidth( c );
    float d = abs( fract( c / sp + 0.5 ) - 0.5 ) * sp;
    return ( 1.0 - smoothstep( w, w + fw * 1.5, d ) ) * ( 1.0 - smoothstep( sp * 0.15, sp * 0.45, fw ) );
  }
  /** Desenin görünürlüğü (piksel izine göre): 1 yakın, 0 uzak. */
  float aFade( vec2 c, float sp ) {
    float fw = max( fwidth( c.x ), fwidth( c.y ) );
    return 1.0 - smoothstep( sp * 0.2, sp * 0.7, fw );
  }
`;

/**
 * Pencere ızgarası: yüzde (u yatay, v yükseklik) sütun aralığı sx, pencere eni ww ve boyu wh, ilk pencere altı y0,
 * kat yüksekliği fh. Dönüş: x pencere örtüsü, y çerçeve, z pencere kimliği (gece ışığı), w camın bulunduğu oran.
 */
const WINDOWS = /* glsl */ `
  vec4 aWindows( vec2 uv, float faceW, float faceH, float sx, float ww, float wh, float y0, float fh, float margin ) {
    float cols = floor( max( faceW - 2.0 * margin, 0.0 ) / sx );
    if ( cols < 1.0 ) return vec4( 0.0 );
    float start = ( faceW - cols * sx ) * 0.5;
    float cx = ( uv.x - start ) / sx;
    float ci = floor( cx );
    if ( ci < 0.0 || ci >= cols ) return vec4( 0.0 );
    float fy = uv.y - y0;
    if ( fy < 0.0 ) return vec4( 0.0 );
    float fi = floor( fy / fh );
    float top = y0 + fi * fh + wh;
    if ( top > faceH - 0.35 ) return vec4( 0.0 );
    vec2 d = vec2( abs( fract( cx ) - 0.5 ) * sx, fy - fi * fh - wh * 0.5 );
    vec2 hw = vec2( ww, wh ) * 0.5;
    float aa = max( fwidth( uv.x ), 0.01 );
    float glass = ( 1.0 - smoothstep( hw.x - aa, hw.x + aa, d.x ) ) * ( 1.0 - smoothstep( hw.y - aa, hw.y + aa, abs( d.y ) ) );
    float frame = ( 1.0 - smoothstep( hw.x + 0.09 - aa, hw.x + 0.09 + aa, d.x ) ) * ( 1.0 - smoothstep( hw.y + 0.09 - aa, hw.y + 0.09 + aa, abs( d.y ) ) );
    // Kayıt (ortadan dikey kayıt ve yatay orta kayıt)
    float bar = max( 1.0 - smoothstep( 0.03, 0.03 + aa, abs( d.x ) ), 1.0 - smoothstep( 0.03, 0.03 + aa, abs( d.y - hw.y * 0.35 ) ) );
    return vec4( glass * ( 1.0 - bar * 0.85 ), max( frame - glass, bar * glass ), ci + fi * 37.0, glass );
  }
  /** Panjur: aWindows ile aynı yerleşimde pencerenin iki yanında birer kanat (pencere eninin yarısı). Dönüş: örtü. */
  float aShutter( vec2 uv, float faceW, float faceH, float sx, float ww, float wh, float y0, float fh, float margin ) {
    float cols = floor( max( faceW - 2.0 * margin, 0.0 ) / sx );
    if ( cols < 1.0 ) return 0.0;
    float start = ( faceW - cols * sx ) * 0.5;
    float cx = ( uv.x - start ) / sx;
    float ci = floor( cx );
    if ( ci < 0.0 || ci >= cols ) return 0.0;
    float fy = uv.y - y0;
    if ( fy < 0.0 ) return 0.0;
    float fi = floor( fy / fh );
    if ( y0 + fi * fh + wh > faceH - 0.35 ) return 0.0;
    float dx = abs( fract( cx ) - 0.5 ) * sx;
    float dy = abs( fy - fi * fh - wh * 0.5 );
    float aa = max( fwidth( uv.x ), 0.01 );
    float x0 = ww * 0.5 + 0.1;
    float inX = smoothstep( x0 - aa, x0 + aa, dx ) * ( 1.0 - smoothstep( x0 + ww * 0.5 - aa, x0 + ww * 0.5 + aa, dx ) );
    return inX * ( 1.0 - smoothstep( wh * 0.5 + 0.05 - aa, wh * 0.5 + 0.05 + aa, dy ) );
  }
  /**
   * Pencereye göre konum (denizlik, perde, çiçeklik için): x yatay (pencere ortasından), y dikey (pencere ortasından),
   * z pencere kimliği (pencere yoksa −1). Hücre pencerenin 1 m altından başlar: denizlik altındaki iz aynı pencereye ait.
   */
  vec3 aWinAt( vec2 uv, float faceW, float faceH, float sx, float wh, float y0, float fh, float margin ) {
    float cols = floor( max( faceW - 2.0 * margin, 0.0 ) / sx );
    if ( cols < 1.0 ) return vec3( 0.0, 0.0, -1.0 );
    float start = ( faceW - cols * sx ) * 0.5;
    float cx = ( uv.x - start ) / sx;
    float ci = floor( cx );
    if ( ci < 0.0 || ci >= cols ) return vec3( 0.0, 0.0, -1.0 );
    float fy = uv.y - y0 + 1.0;
    if ( fy < 0.0 ) return vec3( 0.0, 0.0, -1.0 );
    float fi = floor( fy / fh );
    if ( y0 + fi * fh + wh > faceH - 0.35 ) return vec3( 0.0, 0.0, -1.0 );
    return vec3( ( fract( cx ) - 0.5 ) * sx, fy - fi * fh - 1.0 - wh * 0.5, ci + fi * 37.0 );
  }
  /**
   * Duvar yıpranması (orta mesafeden de görünür; yüzey düz boya gibi durmasın): büyük solma ve kir lekeleri, saçak
   * altı gölgesi, dipte nem ve toprak sıçraması, yukarıdan inen yağmur akıntıları, köşelerde kararma.
   */
  vec3 aWeather( vec3 c, vec2 uv, float faceW, float faceH ) {
    float big = aNoise( vAP * 0.22 + 3.0 );
    c *= 0.9 + 0.2 * big;
    c = mix( c, c * vec3( 0.84, 0.82, 0.76 ), smoothstep( 0.52, 0.8, 1.0 - big ) * 0.4 );
    c *= 1.0 - 0.24 * smoothstep( faceH - 0.9, faceH, uv.y );
    float sn = aNoise( vec3( uv.x * 2.6, 2.0, vAP.z * 0.07 + vAP.x * 0.07 ) );
    float damp = 1.0 - smoothstep( 0.0, 0.35 + 1.1 * sn, uv.y );
    c = mix( c, c * vec3( 0.6, 0.58, 0.5 ), damp * 0.6 );
    float streak = smoothstep( 0.58, 0.88, sn ) * smoothstep( faceH * 0.3, faceH, uv.y + sn * 2.5 );
    c *= 1.0 - 0.2 * streak;
    c *= 1.0 - 0.12 * ( 1.0 - smoothstep( 0.0, 0.45, min( uv.x, faceW - uv.x ) ) );
    return c;
  }
  /** Taş kaide (yapının dibinde, yapı ekseninde y < 0,55): yontma taş sıraları. */
  vec3 aPlinth( vec3 c, vec2 uv ) {
    if ( vAP.y > 0.55 ) return c;
    vec3 st = vec3( 0.52, 0.5, 0.46 ) * ( 0.88 + 0.18 * aNoise( vAP * 1.4 ) );
    st *= 1.0 - 0.25 * max( aLine( uv.x + 0.4 * floor( vAP.y / 0.28 ), 0.8, 0.02 ), aLine( vAP.y, 0.28, 0.02 ) );
    return st;
  }
`;

/** Yüzey rengi: diffuseColor.rgb (köşe rengi) üstüne malzeme; geceleyin yanan pencere ışığı aEmit'e. */
const COLOR = /* glsl */ `
  vec3 aEmit = vec3( 0.0 );
  // Yüzey pürüzü: normale eklenen sapma (dünya ekseninde; ışık kiremit sırasına, sıva pürüzüne tepki verir)
  vec3 aBump = vec3( 0.0 );
  {
    int s = int( vSurf + 0.5 );
    vec3 n = normalize( vAN ) * ( gl_FrontFacing ? 1.0 : -1.0 );
    vec3 base = diffuseColor.rgb;
    vec3 c = base;
    bool side = abs( n.y ) < 0.6;
    bool xFace = abs( n.x ) > abs( n.z );
    vec2 uv = side ? vec2( xFace ? vPL.z : vPL.x, vPL.y ) : vPL.xz;
    float faceW = xFace ? vPS.z : vPS.x;
    float faceH = vPS.y;
    vec4 win = vec4( 0.0 );
    // Ev pencerelerinin ölçüleri (aralık, en, boy, ilk alt kenar; kat yüksekliği, kenar payı): denizlik ve perde için
    vec4 wq = vec4( 0.0 );
    vec2 wr = vec2( 0.0 );
    float glassOk = 1.0 - smoothstep( 0.3, 0.7, archDamage );
    // Duvar kutusunun üst yüzü düz çatıdır: katran keçe (duvar dokusu almaz)
    bool wallSurf = s >= 1 && s <= 6 || s == 22 || s >= 25 && s <= 29;
    if ( wallSurf && n.y > 0.6 ) {
      base = vec3( 0.07, 0.07, 0.075 );
      s = 9;
    }

    if ( s == 1 || s == 2 ) {
      // Tuğla: kaydırmalı sıralar, harç derzi, tuğla başına ton
      vec2 bq = vec2( uv.x / 0.23 + 0.5 * floor( uv.y / 0.077 ), uv.y / 0.077 );
      float f = aFade( bq * vec2( 0.23, 0.077 ), 0.077 );
      vec2 bf = fract( bq );
      float mortar = max( 1.0 - smoothstep( 0.0, 0.08, bf.y ), 1.0 - smoothstep( 0.0, 0.04, min( bf.x, 1.0 - bf.x ) ) );
      float tone = 0.86 + 0.26 * aHash2( floor( bq ) );
      // Uzakta tuğlalar piksel altı: düz taban rengi yerine harçla karışık, biraz soluk ortalama ton (gerçek tuğla duvar
      // uzaktan böyle görünür; 2026-11-17, doygun turuncu "oyuncak" görünümüydü). Orta mesafede sıra kuşakları
      vec3 far = mix( base * 0.93, vec3( 0.55, 0.52, 0.48 ), 0.2 );
      far *= 1.0 - 0.05 * aLine( uv.y, 0.077 * 4.0, 0.03 ) * aFade( vec2( uv.y ), 0.3 );
      c = mix( far, mix( base * tone, vec3( 0.55, 0.52, 0.48 ), mortar * 0.75 ), f );
      c *= 0.94 + 0.08 * aNoise( vAP * 0.35 ) + 0.05 * ( aNoise( vAP * 1.7 ) - 0.5 );
      if ( s == 2 && side ) win = aWindows( uv, faceW, faceH, 4.2, 2.6, min( 3.6, faceH * 0.35 ), min( 2.2, faceH * 0.22 ), max( 5.0, faceH * 0.45 ), 2.0 );
    } else if ( s == 3 || s == 4 || s == 22 ) {
      // Sıva: hafif leke ve dalga, dipte toprak sıçraması
      c = base * ( 0.93 + 0.1 * aNoise( vAP * 0.6 ) ) * ( 0.97 + 0.05 * aNoise( vAP * 3.1 ) );
      if ( side ) c *= 1.0 - 0.12 * ( 1.0 - smoothstep( 0.0, 0.7, vPL.y ) );
      if ( s == 4 && side ) { win = aWindows( uv, faceW, faceH, 3.0, 1.2, 1.35, 0.95, 2.9, 1.0 ); wq = vec4( 3.0, 1.2, 1.35, 0.95 ); wr = vec2( 2.9, 1.0 ); }
      if ( s == 22 && side ) { win = aWindows( uv, faceW, faceH, 2.7, 1.5, 1.45, 0.9, 3.1, 1.2 ); wq = vec4( 2.7, 1.5, 1.45, 0.9 ); wr = vec2( 3.1, 1.2 ); }
    } else if ( s == 5 || s == 6 ) {
      // Beton: kalıp tahtası izleri, yakında benekli yüzey, yukarıdan inen yağmur lekeleri
      float f = aFade( uv, 0.6 );
      c = base * ( 0.92 + 0.1 * aNoise( vAP * 0.5 ) );
      c *= 1.0 - 0.06 * aLine( uv.y, 0.6, 0.012 ) * f;
      float fm = aFade( uv, 0.25 );
      if ( fm > 0.01 ) c *= 1.0 + ( aNoise( vAP * 4.0 ) - 0.5 ) * 0.12 * fm;
      float streak = aNoise( vec3( uv.x * 2.2, vAP.y * 0.08, 3.0 ) );
      if ( side ) c *= 1.0 - 0.12 * smoothstep( 0.55, 0.9, streak ) * smoothstep( faceH - 3.0, faceH, vPL.y + streak * 2.0 );
      if ( s == 6 && side ) win = aWindows( uv, faceW, faceH, 1.6, 1.42, 1.9, 1.0, 3.4, 0.8 );
    } else if ( s == 7 || s == 21 ) {
      // Oluklu sac: oluklar (gölge dalgası), yatay levha birleşimleri, levha başına ton (sonradan değişen levhalar
      // daha parlak), vida sıraları ve altlarından inen pas akıntıları, dipte toprak sıçraması
      float cc = abs( n.z ) > 0.7 ? vPL.x : vPL.z;
      float f = aFade( vec2( cc ), 0.15 );
      c = base * ( 1.0 + 0.09 * cos( 6.2832 * cc / 0.15 ) * f );
      c *= 1.0 - 0.1 * aLine( vPL.y, 2.4, 0.015 ) * f;
      float fs = aFade( vec2( cc, vPL.y ), 0.9 );
      vec2 sheet = floor( vec2( cc / 0.9, vPL.y / 2.4 ) );
      float sh = aHash2( sheet + 3.0 );
      // Levha tonu hafif (2026-11-17: %14'lük fark kemerlerde iri, bloklu şeritler gibi duruyordu)
      c *= 1.0 + ( sh - 0.5 ) * 0.06 * fs + step( 0.94, sh ) * 0.05 * fs;
      float rust = smoothstep( 0.62, 0.85, aNoise( vec3( cc * 1.3, vAP.y * 0.12, 7.0 ) ) );
      // Akıntı: levha üst kenarındaki vida sırasından aşağı incelen pas izi
      float drip = smoothstep( 0.55, 0.85, aNoise( vec3( cc * 2.2, floor( vPL.y / 2.4 ), 11.0 ) ) ) * ( 1.0 - fract( vPL.y / 2.4 ) );
      rust = max( rust, drip * 0.8 * fs );
      c = mix( c, vec3( 0.36, 0.2, 0.11 ), rust * 0.35 );
      if ( side ) c *= 1.0 - 0.14 * ( 1.0 - smoothstep( 0.0, 1.2, vPL.y ) );
      if ( s == 21 && side ) {
        // Kapı panoları: dikey birleşim, yatay kuşaklar, ray altında kir
        c *= 0.82 + 0.18 * aLine( uv.x, 3.0, 0.04 );
        c *= 1.0 - 0.12 * aLine( vPL.y, 1.6, 0.05 ) * aFade( vec2( vPL.y ), 1.6 );
      }
    } else if ( s == 8 ) {
      // Kiremit: eğim boyunca sıralar, sıra altında gölge, kiremit başına ton, yer yer yosun
      vec2 tq = vec2( ( xFace ? vPL.z : vPL.x ) / 0.24 + 0.5 * floor( vPL.y / 0.3 ), vPL.y / 0.3 );
      float f = aFade( tq * vec2( 0.24, 0.3 ), 0.24 );
      float row = fract( tq.y );
      c = base * mix( 1.0, ( 0.82 + 0.28 * row ) * ( 0.9 + 0.2 * aHash2( floor( tq ) ) ), f );
      // Orta mesafe: hafif ton dalgası, seyrek açık kiremit yamaları, mahyaya doğru az koyulaşma (2026-11-13: lekeler
      // fazla bulundu, çatı bozuk renkli görünüyordu; yosun ve liken çok azaltıldı)
      float rb = aNoise( vAP * 0.3 + 5.0 );
      c *= 0.94 + 0.1 * rb;
      vec2 pc = floor( vec2( ( xFace ? vPL.z : vPL.x ) / 1.9, vPL.y / 1.3 ) );
      c *= 1.0 + 0.06 * step( 0.93, aHash2( pc + 7.0 ) );
      c *= 1.0 - 0.07 * smoothstep( vPS.y * 0.55, vPS.y, vPL.y ) + 0.04 * ( 1.0 - smoothstep( 0.0, 0.35, vPL.y ) );
      // Yosun (gölge yanlarda yeşil), liken benekleri (yakında)
      c = mix( c, c * vec3( 0.86, 0.92, 0.8 ), smoothstep( 0.72, 0.95, aNoise( vAP * 0.45 ) ) * 0.5 );
      float fl = aFade( vAP.xz, 0.3 );
      if ( fl > 0.01 ) c = mix( c, c * 1.12, step( 0.985, aHash( floor( vAP * 4.0 ) ) ) * 0.5 * fl );
      // Sıra kabartması: her kiremit sırasının üstü ışığa döner, altı gölgede kalır
      aBump.y += ( row - 0.5 ) * 0.7 * f;
    } else if ( s == 9 ) {
      // Katran keçe: koyu, şerit birleşimleri, hafif dalga
      c = base * ( 0.92 + 0.12 * aNoise( vAP * 0.4 ) );
      c *= 1.0 - 0.15 * aLine( xFace ? vPL.z : vPL.x, 0.95, 0.02 );
    } else if ( s == 10 ) {
      // Testere dişi çatı: dik yüz (kuzey) camlı, demir kayıtlı; yatık yüz ve dişin üçgen uçları keçe
      if ( abs( n.y ) < 0.7 && abs( n.x ) < 0.5 ) {
        float gq = aLine( vPL.x, 1.2, 0.04 ) + aLine( vPL.y, 1.4, 0.04 );
        win = vec4( 1.0 - clamp( gq, 0.0, 1.0 ), clamp( gq, 0.0, 1.0 ), floor( vPL.x / 6.0 ), 1.0 );
      } else {
        c = base * ( 0.92 + 0.12 * aNoise( vAP * 0.4 ) );
      }
    } else if ( s == 11 ) {
      // Cam cephe: kayıt ızgarası, cam
      float gq = max( aLine( uv.x, 1.5, 0.05 ), aLine( uv.y, 3.4, 0.12 ) );
      win = vec4( 1.0 - gq, gq, floor( uv.x / 1.5 ) + floor( uv.y / 3.4 ) * 31.0, 1.0 );
    } else if ( s == 12 ) {
      // Çim: alacalı, yer yer kuru lekeler
      c = base * ( 0.86 + 0.24 * aNoise( vAP * 0.25 ) ) * ( 0.95 + 0.08 * aNoise( vAP * 1.7 ) );
      c = mix( c, vec3( 0.42, 0.38, 0.2 ), smoothstep( 0.68, 0.9, aNoise( vAP * 0.11 + 5.0 ) ) * 0.25 );
      // Yakında: ot öbekleri ve seyrek kır çiçekleri
      float fgr = aFade( vAP.xz, 0.18 );
      if ( fgr > 0.01 ) {
        float gh = aHash( floor( vAP * vec3( 7.0, 1.0, 7.0 ) ) );
        c *= 1.0 + ( gh - 0.5 ) * 0.22 * fgr;
        c = mix( c, gh > 0.994 ? vec3( 0.85, 0.8, 0.35 ) : vec3( 0.86, 0.86, 0.8 ), step( 0.988, gh ) * 0.8 * fgr );
      }
    } else if ( s == 13 ) {
      // Kaldırım taşı: 0,6 m plakalar. Derzler ince ve uzakta söner (2026-11-17: koyu ve her mesafede keskin derzler
      // çizim programı ızgarası gibi duruyordu); plaka tonu, geniş aşınma ve kir lekeleri, kenarlara doğru koyulaşma
      float f = aFade( vPL.xz, 0.6 );
      vec2 pq = floor( vPL.xz / 0.6 );
      c = base * mix( 1.0, 0.9 + 0.16 * aHash2( pq ), f );
      c *= 1.0 - 0.14 * max( aLine( vPL.x, 0.6, 0.012 ), aLine( vPL.z, 0.6, 0.012 ) ) * aFade( vPL.xz, 0.25 );
      c *= 0.9 + 0.14 * aNoise( vAP * 0.12 + 4.0 );
      c = mix( c, c * vec3( 0.82, 0.8, 0.74 ), smoothstep( 0.6, 0.85, aNoise( vAP * 0.3 + 11.0 ) ) * 0.4 );
      c *= 1.0 - 0.1 * ( 1.0 - smoothstep( 0.0, 2.5, min( min( vPL.x, vPS.x - vPL.x ), min( vPL.z, vPS.z - vPL.z ) ) ) );
    } else if ( s == 14 ) {
      // Asfalt: koyu, büyük açık-koyu alanlar, dikdörtgen onarım yamaları (taze katran koyu, eski yama soluk), katranla
      // doldurulmuş çatlaklar, yakında agrega taneleri
      c = base * ( 0.88 + 0.2 * aNoise( vAP * 0.3 ) ) * ( 0.95 + 0.1 * aNoise( vAP * 2.5 ) );
      c *= 1.0 - 0.15 * smoothstep( 0.72, 0.8, aNoise( vAP * 0.07 + 2.0 ) );
      c *= 0.94 + 0.12 * aNoise( vAP * 0.015 + 9.0 );
      if ( !side ) {
        vec2 rc = vAP.xz / vec2( 7.0, 11.0 );
        vec2 rq = floor( rc );
        float rh = aHash2( rq + 41.0 );
        vec2 rf = abs( fract( rc ) - 0.5 );
        float repair = step( 0.86, rh ) * ( 1.0 - smoothstep( 0.3, 0.32, max( rf.x, rf.y ) ) );
        c *= 1.0 - repair * ( rh > 0.93 ? 0.22 : -0.08 );
        float fc = aFade( vAP.xz, 0.6 );
        if ( fc > 0.01 ) {
          float cr = abs( aNoise( vec3( vAP.xz * 0.45, 4.0 ) ) - 0.5 );
          c *= 1.0 - 0.28 * ( 1.0 - smoothstep( 0.0, 0.01 + fwidth( cr ), cr ) ) * smoothstep( 0.62, 0.78, aNoise( vAP * 0.05 + 6.0 ) ) * fc;
          float fg = aFade( vAP.xz, 0.12 );
          if ( fg > 0.01 ) c *= 1.0 + ( aHash( floor( vAP * 14.0 ) ) - 0.5 ) * 0.16 * fg;
        }
      }
    } else if ( s == 15 ) {
      // Pist betonu: 7,5 × 5 m plakalar, koyu derz dolgusu ve iki yanına taşan katran, plaka tonu, sonradan dökülmüş
      // açık ve katranla yamanmış koyu plakalar, köşeden kırık ve çatlak plakalar, yağ lekeleri, yakında benekli
      // yüzey; iniş bölgesinde lastik izleri, orta çizgi boyunca motor yağı, kenarlarda toprak
      float f = aFade( vPL.xz, 5.0 );
      vec2 pq = floor( vPL.xz / vec2( 7.5, 5.0 ) );
      float h1 = aHash2( pq );
      float h2 = aHash2( pq + 17.0 );
      c = base * ( 0.93 + 0.12 * h1 * f ) * ( 0.95 + 0.08 * aNoise( vAP * 0.2 ) );
      c *= 0.95 + 0.1 * aNoise( vAP * 0.012 + 3.0 );
      c *= mix( 1.0, h2 > 0.94 ? 1.06 : ( h2 < 0.04 ? 0.84 : 1.0 ), f );
      float joint = max( aLine( vPL.x, 7.5, 0.06 ), aLine( vPL.z, 5.0, 0.06 ) );
      float bleed = max( aLine( vPL.x, 7.5, 0.25 ), aLine( vPL.z, 5.0, 0.25 ) ) * smoothstep( 0.35, 0.75, aNoise( vAP * 1.1 ) );
      c *= 1.0 - 0.3 * joint - 0.12 * bleed * f;
      float fn = aFade( vPL.xz, 0.5 );
      if ( fn > 0.01 && !side ) {
        vec2 pf = fract( vPL.xz / vec2( 7.5, 5.0 ) ) * vec2( 7.5, 5.0 );
        // Kırık köşe: plakanın bir köşesinde üçgen koyu yama
        vec2 cq = vec2( h1 > 0.5 ? pf.x : 7.5 - pf.x, h2 > 0.5 ? pf.y : 5.0 - pf.y );
        float corner = step( 0.82, aHash2( pq + 5.0 ) ) * ( 1.0 - smoothstep( 1.1, 1.2, cq.x + cq.y ) );
        c *= 1.0 - 0.18 * corner * fn;
        // Çatlak: plaka içinde hafif kıvrımlı ince çizgi (az sayıda plakada)
        float cr = abs( aNoise( vec3( vPL.xz * 0.28, h1 * 13.0 ) ) - 0.5 );
        c *= 1.0 - 0.2 * ( 1.0 - smoothstep( 0.0, 0.006 + fwidth( cr ), cr ) ) * step( 0.9, h2 ) * fn;
        // Yağ lekesi
        float oil = smoothstep( 0.74, 0.92, aNoise( vec3( vPL.xz * vec2( 0.35, 0.6 ), 21.0 ) ) ) * step( 0.86, aHash2( pq + 9.0 ) );
        c = mix( c, c * vec3( 0.66, 0.66, 0.7 ), oil * 0.45 * fn );
        float fm = aFade( vPL.xz, 0.2 );
        if ( fm > 0.01 ) c *= 1.0 + ( aNoise( vAP * 5.0 ) - 0.5 ) * 0.1 * fm + ( aHash( floor( vAP * 16.0 ) ) - 0.5 ) * 0.08 * fm;
      }
      float mid = abs( vPL.x - vPS.x * 0.5 );
      float end = min( vPL.z, vPS.z - vPL.z );
      float tire = ( 1.0 - smoothstep( 6.0, 11.0, mid ) ) * smoothstep( 150.0, 300.0, end ) * ( 1.0 - smoothstep( 600.0, 1000.0, end ) );
      tire *= 0.5 + 0.5 * aNoise( vec3( vPL.x * 1.5, vPL.z * 0.02, 1.0 ) );
      c *= 1.0 - 0.45 * tire;
      // Uzun pistte (yalnız pistin kendisi): orta çizgi boyunca yağ izi, kenarlarda toprak ve çim lekesi
      if ( vPS.z > 500.0 ) {
        c *= 1.0 - 0.1 * ( 1.0 - smoothstep( 1.5, 5.0, mid ) ) * aNoise( vec3( vPL.x * 0.8, vPL.z * 0.05, 2.0 ) );
        float edge = 1.0 - smoothstep( 0.0, 4.0, min( vPL.x, vPS.x - vPL.x ) );
        c = mix( c, c * vec3( 0.84, 0.86, 0.74 ), edge * ( 0.4 + 0.4 * aNoise( vAP * 0.3 ) ) );
      }
    } else if ( s == 16 ) {
      // Kum torbası: kaydırmalı sıralar, şişkin torba gölgesi, çuval tonu
      vec2 sq = vec2( ( xFace ? vPL.z : vPL.x ) / 0.62 + 0.5 * floor( vPL.y / 0.17 ), vPL.y / 0.17 );
      if ( !side ) sq = vec2( vPL.x / 0.62 + 0.5 * floor( vPL.z / 0.34 ), vPL.z / 0.34 );
      float f = aFade( sq * vec2( 0.62, 0.17 ), 0.17 );
      vec2 sf = fract( sq ) - 0.5;
      float bulge = 1.0 - dot( sf * vec2( 1.2, 2.0 ), sf * vec2( 1.2, 2.0 ) );
      c = base * mix( 1.0, ( 0.7 + 0.35 * bulge ) * ( 0.9 + 0.2 * aHash2( floor( sq ) ) ), f );
    } else if ( s == 17 ) {
      // Boyalı metal: hafif dalga, kenar ve köşelerde aşınma, perçin sırası
      c = base * ( 0.93 + 0.1 * aNoise( vAP * 1.2 ) );
      float edge = 1.0 - smoothstep( 0.0, 0.08, min( min( vPL.x, vPS.x - vPL.x ), min( vPL.y, vPS.y - vPL.y ) ) );
      c = mix( c, c * 1.35 + 0.03, edge * smoothstep( 0.55, 0.8, aNoise( vAP * 6.0 ) ) * 0.5 );
    } else if ( s == 18 ) {
      // Ahşap kaplama: 0,2 m tahtalar, aralık gölgesi, damar, yıpranma
      float f = aFade( vec2( vPL.y ), 0.2 );
      float plank = floor( vPL.y / 0.2 );
      c = base * mix( 1.0, ( 0.85 + 0.25 * aHash2( vec2( plank, 3.0 ) ) ) * ( 0.94 + 0.1 * aNoise( vec3( uv.x * 4.0, plank, 1.0 ) ) ), f );
      c *= 1.0 - 0.35 * aLine( vPL.y, 0.2, 0.008 );
      // Hava almış tahta: grileşen lekeler; tahta aralarında kabartma
      c = mix( c, vec3( dot( c, vec3( 0.33 ) ) ) * 1.15, smoothstep( 0.45, 0.8, aNoise( vAP * 0.7 + 2.0 ) ) * 0.4 );
      aBump.y += ( fract( vPL.y / 0.2 ) - 0.5 ) * 0.35 * f;
    } else if ( s == 19 ) {
      // Su (çeşme, havuz): koyu, gök yansıması aşağıda
      c = base * 0.55;
      win = vec4( 0.6, 0.0, 0.0, 0.0 );
    } else if ( s == 20 ) {
      // Toprak ve pasa: taşlı, alacalı
      c = base * ( 0.8 + 0.3 * aNoise( vAP * 0.4 ) ) * ( 0.92 + 0.14 * aNoise( vAP * 3.0 ) );
    } else if ( s == 23 ) {
      // Kanvas (çadır hangar): 1,2 m'lik dikişli enler, 4 m'de bir çerçeve kemeri arasında sarkma gölgesi, yağmur
      // akıntısı, dipte çamur
      float cc = abs( n.z ) > abs( n.x ) ? vPL.x : vPL.z;
      c = base * ( 0.92 + 0.1 * aNoise( vAP * 0.5 ) ) * ( 0.96 + 0.06 * aNoise( vAP * 2.7 ) );
      float fs = aFade( vec2( cc ), 1.2 );
      c *= 1.0 - 0.05 * aLine( cc, 1.2, 0.015 ) * fs;
      c *= 0.92 + 0.08 * ( 0.5 - 0.5 * cos( 6.2832 * cc / 4.0 ) );
      float st = smoothstep( 0.6, 0.85, aNoise( vec3( cc * 1.7, vAP.y * 0.15, 5.0 ) ) );
      c *= 1.0 - 0.12 * st;
      if ( side ) c = mix( c, c * vec3( 0.7, 0.66, 0.58 ), 1.0 - smoothstep( 0.0, 1.0, vPL.y ) );
    } else if ( s == 24 ) {
      // Delikli çelik plaka (Marston): 0,38 m enli, 3 m boylu kaydırmalı planklar, plankta iki sıra delik (altından
      // toprak ve çim görünür), plank kenarı çizgisi, yer yer pas; uzakta delikler ortalama renge karışır
      float px = vPL.x / 0.38;
      vec2 q = vec2( floor( px ), floor( vPL.z / 3.05 + 0.5 * floor( px ) ) );
      c = base * ( 0.9 + 0.16 * aHash2( q ) ) * ( 0.94 + 0.1 * aNoise( vAP * 0.3 ) );
      c = mix( c, vec3( 0.34, 0.22, 0.13 ), smoothstep( 0.6, 0.85, aNoise( vAP * 0.9 + 4.0 ) ) * 0.4 );
      c *= 1.0 - 0.25 * aLine( vPL.x, 0.38, 0.012 ) * aFade( vec2( vPL.x ), 0.38 );
      vec3 soil = vec3( 0.25, 0.27, 0.15 ) * ( 0.8 + 0.4 * aNoise( vAP * 1.5 ) );
      float fh = aFade( vPL.xz, 0.15 );
      float hx = abs( fract( fract( px ) * 2.0 ) - 0.5 ) * 0.19;
      float hz = abs( fract( vPL.z / 0.15 ) - 0.5 ) * 0.15;
      float hole = 1.0 - smoothstep( 0.04, 0.05, length( vec2( hx, hz ) ) );
      c = mix( c, soil, mix( 0.22, hole * 0.9, fh ) );
    } else if ( s == 25 ) {
      // Ev: sıva, panjurlu pencereler (panjur rengi eve göre: yeşil, kahve, gri mavi ya da yok), taş kaide
      c = base * ( 0.93 + 0.1 * aNoise( vAP * 0.6 ) ) * ( 0.97 + 0.05 * aNoise( vAP * 3.1 ) );
      if ( side ) {
        c = aPlinth( c, uv );
        win = aWindows( uv, faceW, faceH, 2.6, 1.05, 1.35, 1.0, 2.9, 0.9 );
        wq = vec4( 2.6, 1.05, 1.35, 1.0 );
        wr = vec2( 2.9, 0.9 );
        float sh = aShutter( uv, faceW, faceH, 2.6, 1.05, 1.35, 1.0, 2.9, 0.9 );
        float hs = aHash( vec3( floor( vAPw.xz / 24.0 ), 3.0 ) );
        vec3 sc = hs < 0.4 ? vec3( 0.2, 0.3, 0.2 ) : hs < 0.7 ? vec3( 0.33, 0.22, 0.14 ) : vec3( 0.3, 0.36, 0.42 );
        sc *= 1.0 - 0.3 * aLine( uv.y, 0.11, 0.018 ) * aFade( vec2( uv.y ), 0.11 );
        c = mix( c, sc, sh * step( hs, 0.86 ) );
      }
    } else if ( s == 26 ) {
      // Tuğla ev: kaydırmalı sıralar, harç derzi; beyaz çerçeveli ev pencereleri, taş kaide
      vec2 bq = vec2( uv.x / 0.23 + 0.5 * floor( uv.y / 0.077 ), uv.y / 0.077 );
      float f = aFade( bq * vec2( 0.23, 0.077 ), 0.077 );
      vec2 bf = fract( bq );
      float mortar = max( 1.0 - smoothstep( 0.0, 0.08, bf.y ), 1.0 - smoothstep( 0.0, 0.04, min( bf.x, 1.0 - bf.x ) ) );
      c = mix( base, mix( base * ( 0.86 + 0.26 * aHash2( floor( bq ) ) ), vec3( 0.6, 0.57, 0.52 ), mortar * 0.7 ), f );
      c *= 0.94 + 0.08 * aNoise( vAP * 0.35 );
      if ( side ) {
        c = aPlinth( c, uv );
        win = aWindows( uv, faceW, faceH, 2.6, 1.05, 1.4, 1.0, 2.9, 0.9 );
        wq = vec4( 2.6, 1.05, 1.4, 1.0 );
        wr = vec2( 2.9, 0.9 );
      }
    } else if ( s == 27 ) {
      // Fachwerk: krem sıva dolgu; pencere kenarlarında ve aralarda koyu meşe dikmeler, kat ve denizlik kuşakları,
      // denizlik altında çapraz payandalar; uzakta ortalama renge söner
      c = base * ( 0.94 + 0.08 * aNoise( vAP * 0.7 ) );
      if ( side ) {
        vec3 wood = vec3( 0.21, 0.14, 0.09 ) * ( 0.85 + 0.25 * aNoise( vAP * 2.0 ) );
        float sx = 2.2;
        float cols = floor( max( faceW - 1.4, 0.0 ) / sx );
        float px = uv.x - ( faceW - cols * sx ) * 0.5;
        float f = aFade( uv, 0.5 );
        float awx = max( fwidth( uv.x ), 0.004 ) * 1.5;
        float awy = max( fwidth( uv.y ), 0.004 ) * 1.5;
        float post = 1.0 - smoothstep( 0.1, 0.1 + awx, abs( fract( px / 1.1 + 0.5 ) - 0.5 ) * 1.1 );
        post = max( post, 1.0 - smoothstep( 0.16, 0.16 + awx, min( uv.x, faceW - uv.x ) ) );
        float fy = mod( uv.y, 2.8 );
        float rail = max( 1.0 - smoothstep( 0.11, 0.11 + awy, min( fy, 2.8 - fy ) ), 1.0 - smoothstep( 0.06, 0.06 + awy, abs( fy - 1.0 ) ) );
        float lx = fract( px / 1.1 );
        float ly = fy / 1.0;
        float dir = mod( floor( px / 1.1 ), 2.0 ) < 1.0 ? lx : 1.0 - lx;
        float brace = ( 1.0 - smoothstep( 0.07, 0.07 + awx * 2.0, abs( ly - dir ) ) ) * step( fy, 1.0 );
        float t = clamp( max( max( post, rail ), brace ), 0.0, 1.0 );
        c = mix( mix( c, wood, 0.24 ), mix( c, wood, t ), f );
        win = aWindows( uv, faceW, faceH, sx, 0.9, 1.2, 1.2, 2.8, 0.7 );
        wq = vec4( sx, 0.9, 1.2, 1.2 );
        wr = vec2( 2.8, 0.7 );
      }
    } else if ( s == 28 ) {
      // Kesme taş: 1,2 × 0,45 m bloklar, ince derz, blok tonu, yağmur izi; zemin katta derin yatay derzler (rustika);
      // yüksek pencereler
      vec2 bq = vec2( uv.x / 1.2 + 0.5 * floor( uv.y / 0.45 ), uv.y / 0.45 );
      float f = aFade( uv, 0.45 );
      vec2 bf = fract( bq );
      float joint = max( 1.0 - smoothstep( 0.0, 0.05, min( bf.y, 1.0 - bf.y ) ), 1.0 - smoothstep( 0.0, 0.02, min( bf.x, 1.0 - bf.x ) ) );
      c = base * mix( 1.0, ( 0.93 + 0.1 * aHash2( floor( bq ) ) ) * ( 1.0 - 0.18 * joint ), f );
      c *= 0.94 + 0.09 * aNoise( vAP * 0.3 );
      if ( side ) {
        if ( vPL.y < 4.4 ) c *= 1.0 - 0.3 * aLine( vPL.y, 0.55, 0.05 ) * aFade( vec2( vPL.y ), 0.55 );
        float streak = aNoise( vec3( uv.x * 1.6, vAP.y * 0.06, 9.0 ) );
        c *= 1.0 - 0.1 * smoothstep( 0.55, 0.9, streak ) * smoothstep( faceH - 6.0, faceH, vPL.y + streak * 3.0 );
        win = aWindows( uv, faceW, faceH, 3.0, 1.4, 2.2, 1.4, 3.6, 1.5 );
        wq = vec4( 3.0, 1.4, 2.2, 1.4 );
        wr = vec2( 3.6, 1.5 );
      }
    } else if ( s == 30 ) {
      if ( base.r > base.g ) {
        // Gövde: dikey kabuk çatlakları
        c = base * ( 0.8 + 0.3 * aNoise( vec3( vAP.x * 6.0, vAP.y * 0.8, vAP.z * 6.0 ) ) );
      } else {
        // Taç: iri yaprak öbekleri (ışık ve gölge benekleri), ince yaprak dokusu, içe doğru koyulaşma; öbek kabartması
        // ışığı kırar (düz boyalı top gibi durmaz)
        float lb = aNoise( vAP * 0.9 );
        float lf = aNoise( vAP * 3.3 + 2.0 );
        c = base * ( 0.72 + 0.42 * lb ) * ( 0.88 + 0.22 * lf );
        c = mix( c, c * vec3( 0.92, 0.98, 0.78 ), smoothstep( 0.55, 0.85, aNoise( vAP * 0.35 + 9.0 ) ) * 0.5 );
        float fl = aFade( vAP.xz, 0.4 );
        vec3 q = vAP * 1.6;
        aBump += ( vec3( aNoise( q ), aNoise( q + 5.1 ), aNoise( q + 9.7 ) ) - 0.5 ) * ( 0.5 + 0.4 * fl );
        float lum = dot( c, vec3( 0.299, 0.587, 0.114 ) );
        c = mix( vec3( lum ), c, 0.85 );
      }
    } else if ( s == 31 ) {
      // Çiçek öbeği: koyu yeşil yaprak zemini, üstünde ve yanların üst yarısında köşe rengindeki çiçek benekleri
      // (8 cm'lik hücreler, renk tonu hücre başına); uzakta yaprak ve çiçeğin karışık tonu. Kabartma ışığı kırar
      vec3 green = vec3( 0.2, 0.31, 0.14 ) * ( 0.7 + 0.5 * aNoise( vAP * 4.0 ) );
      vec3 cell = floor( vAP * 12.0 );
      float hb = aHash( cell );
      float fl = aFade( vAP.xz, 0.08 );
      float bloom = step( 0.55, hb ) * ( side ? smoothstep( 0.25, 0.85, vPL.y / max( vPS.y, 0.01 ) ) : 1.0 );
      vec3 petal = base * ( 0.8 + 0.35 * aHash( cell + 3.0 ) );
      c = mix( mix( green, base, side ? 0.2 : 0.4 ), mix( green, petal, bloom ), fl );
      vec3 q = vAP * 9.0;
      aBump += ( vec3( aNoise( q ), aNoise( q + 3.3 ), aNoise( q + 7.1 ) ) - 0.5 ) * 0.6 * fl;
    } else if ( s == 29 ) {
      // Kasaba evi: sıva, her katta silme, pencerelerin çevresinde açık söve; zemin kat (vitrin katı) biraz koyu
      c = base * ( 0.93 + 0.1 * aNoise( vAP * 0.6 ) ) * ( 0.97 + 0.05 * aNoise( vAP * 3.1 ) );
      if ( side ) {
        vec3 light = base * 1.12 + 0.04;
        float fy = vPL.y - 4.2;
        if ( fy > -0.4 ) c = mix( c, light, aLine( fy + 0.1, 3.2, 0.1 ) );
        else c *= 0.9;
        win = aWindows( uv, faceW, faceH, 2.3, 1.15, 1.7, 4.9, 3.2, 0.8 );
        wq = vec4( 2.3, 1.15, 1.7, 4.9 );
        wr = vec2( 3.2, 0.8 );
        vec4 sv = aWindows( uv, faceW, faceH, 2.3, 1.5, 2.05, 4.725, 3.2, 0.8 );
        c = mix( c, light, sv.w * ( 1.0 - win.w ) );
      }
    }

    vec3 wl = vec3( 0.0, 0.0, -1.0 );
    if ( wallSurf && side && s != 5 && s != 6 ) {
      c = aWeather( c, uv, faceW, faceH );
      // Yakında: sıva ve tuğla pürüzü (ışıkla oynar), ince çatlaklar
      float fr = aFade( uv, 0.22 );
      if ( fr > 0.01 ) {
        vec3 q = vAP * 6.0;
        aBump += ( vec3( aNoise( q ), aNoise( q + 7.3 ), aNoise( q + 13.7 ) ) - 0.5 ) * 0.28 * fr;
        float cr = abs( aNoise( vec3( uv * 0.55, vAP.z * 0.3 ) ) - 0.5 );
        c *= 1.0 - 0.22 * ( 1.0 - smoothstep( 0.0, 0.006 + fwidth( cr ), cr ) ) * smoothstep( 0.6, 0.8, aNoise( vAP * 0.17 + 8.0 ) ) * fr;
      }
      if ( wq.x > 0.0 ) {
        wl = aWinAt( uv, faceW, faceH, wq.x, wq.z, wq.w, wr.x, wr.y );
        float fw2 = aFade( uv, 0.5 );
        if ( wl.z >= 0.0 && fw2 > 0.01 ) {
          float ax = abs( wl.x );
          float hx = wq.y * 0.5;
          float hy = wq.z * 0.5;
          float aa = max( fwidth( uv.x ), 0.01 );
          float inX = 1.0 - smoothstep( hx + 0.16 - aa, hx + 0.16 + aa, ax );
          // Denizlik altında yağmur izi, denizlik (açık taş), bazı ev pencerelerinde çiçeklik
          float below = inX * ( 1.0 - smoothstep( -hy - 0.22, -hy - 0.2, wl.y ) ) * smoothstep( -hy - 1.0, -hy - 0.2, wl.y );
          c *= 1.0 - 0.3 * below * below * fw2;
          float sill = inX * smoothstep( -hy - 0.2 - aa, -hy - 0.2 + aa, wl.y ) * ( 1.0 - smoothstep( -hy - 0.07 - aa, -hy - 0.07 + aa, wl.y ) );
          c = mix( c, vec3( 0.76, 0.74, 0.68 ) * ( 0.9 + 0.1 * aNoise( vAP * 2.0 ) ), sill * fw2 );
          if ( s == 25 || s == 27 || s == 26 ) {
            float hb = aHash( vec3( wl.z, 9.0, floor( vAPw.x / 20.0 ) + floor( vAPw.z / 20.0 ) ) );
            float box = ( 1.0 - smoothstep( hx - aa, hx + aa, ax ) ) * smoothstep( -hy - 0.36, -hy - 0.34, wl.y ) * ( 1.0 - smoothstep( -hy - 0.04, -hy - 0.02, wl.y ) ) * step( 0.62, hb );
            vec3 fc = hb > 0.86 ? vec3( 0.8, 0.22, 0.2 ) : hb > 0.74 ? vec3( 0.86, 0.7, 0.24 ) : vec3( 0.82, 0.42, 0.56 );
            vec3 fl = mix( vec3( 0.2, 0.34, 0.15 ), fc, step( 0.5, aHash2( floor( uv * 11.0 ) ) ) * step( -hy - 0.22, wl.y ) );
            c = mix( c, fl, box * fw2 );
          }
          // Lento: pencerenin üstünde ince gölge
          float lin = inX * smoothstep( hy + 0.08, hy + 0.1, wl.y ) * ( 1.0 - smoothstep( hy + 0.16, hy + 0.3, wl.y ) );
          c *= 1.0 - 0.14 * lin * fw2;
        }
      }
    }

    // Pencereler: çerçeve beyaz-gri, cam göğü yansıtır; gece bir kısmı yanar
    if ( win.x > 0.0 || win.y > 0.0 ) {
      // Çerçeve: sanayi pencerelerinde, testere dişi çatıda ve cam cephede koyu çelik; evde beyaz boyalı ahşap
      vec3 frameCol = s == 2 || s == 10 || s == 11 || s == 6 ? vec3( 0.06, 0.065, 0.07 ) : vec3( 0.72, 0.7, 0.66 );
      c = mix( c, frameCol, win.y );
      if ( win.x > 0.0 ) {
        vec3 vdir = normalize( vAPw - cameraPosition );
        vec3 wn = normalize( vAWN ) * ( gl_FrontFacing ? 1.0 : -1.0 );
        vec3 r = reflect( vdir, wn );
        float fres = 0.25 + 0.75 * pow( 1.0 - abs( dot( vdir, wn ) ), 3.0 );
        vec3 sky = atmoSky( normalize( vec3( r.x, abs( r.y ), r.z ) ) );
        vec3 inner = vec3( 0.05, 0.06, 0.07 ) + 0.04 * aHash( vec3( win.z, 1.0, 2.0 ) );
        if ( wl.z >= 0.0 ) {
          // Perde: pencerelerin çoğunda iki yanda toplanmış kumaş (krem ya da kiremit rengi), bir kısmında tül; üstte
          // pervaz gölgesi (cam içeride kalır)
          float hc = aHash( vec3( wl.z, 5.0, floor( vAPw.x / 30.0 ) + floor( vAPw.z / 30.0 ) ) );
          float cur = smoothstep( wq.y * 0.2, wq.y * 0.3, abs( wl.x ) ) * step( 0.3, hc );
          vec3 cc = hc > 0.8 ? vec3( 0.5, 0.36, 0.3 ) : vec3( 0.7, 0.68, 0.62 );
          inner = mix( inner, cc * ( 0.78 + 0.22 * cos( wl.x * 42.0 ) ), cur * 0.85 );
          inner = mix( inner, vec3( 0.5, 0.5, 0.48 ), step( hc, 0.3 ) * step( 0.12, hc ) * 0.45 );
          inner *= 1.0 - 0.55 * smoothstep( wq.z * 0.5 - 0.3, wq.z * 0.5, wl.y );
        }
        vec3 glass = mix( inner, sky * 0.85, fres * glassOk );
        c = mix( c, glass, win.x );
        // Gece ışığı: pencerelerin bir kısmı sıcak sarı (karartma: seyrek)
        float lit = step( 0.72, aHash( vec3( win.z, floor( vAP.x / 50.0 ), floor( vAP.z / 50.0 ) ) ) ) * glassOk;
        aEmit = vec3( 1.0, 0.72, 0.4 ) * 0.9 * lit * archNight * archLit * win.x;
      }
    }
    // Yıpranma (2026-11-17; üçgen maliyeti yok): yere değen duvarın dibinde nem ve sıçrama kiri (1,4 m'ye doğru söner),
    // duvarın üst kenarından (saçak, pencere denizliği gibi) aşağı inen düzensiz yağmur izleri, dikey köşelerde hafif
    // gölgelenme. Geniş çatılarda büyük ölçekli ton ve leke oynaması (yosun, solma): düz renkli büyük çatılar canlanır
    if ( side && ( wallSurf || s == 7 || s == 18 || s == 21 ) ) {
      float baseY = vAP.y - vPL.y;
      if ( baseY < 0.8 ) {
        float g = 1.0 - smoothstep( 0.0, 1.4, vPL.y + 0.25 * aNoise( vec3( uv.x * 1.3, 0.0, baseY ) ) );
        c *= 1.0 - 0.38 * g;
        c = mix( c, vec3( 0.32, 0.29, 0.24 ) * dot( c, vec3( 0.33 ) ) * 2.2, 0.18 * g );
      }
      float streak = pow( aNoise( vec3( uv.x * 2.1, 3.0, floor( vAP.x * 0.05 ) + floor( vAP.z * 0.05 ) ) ), 3.0 );
      float fromTop = 1.0 - smoothstep( 0.0, 3.5 + 2.0 * streak, faceH - vPL.y );
      c *= 1.0 - 0.32 * streak * fromTop;
      float edge = min( uv.x, faceW - uv.x );
      c *= mix( 0.85, 1.0, smoothstep( 0.0, 0.9, edge ) );
    } else if ( !side && ( s == 7 || s == 8 || s == 9 || s == 10 || s == 18 ) ) {
      float blot = aNoise( vAP * 0.07 ) * 0.65 + aNoise( vAP * 0.23 ) * 0.35;
      c *= 0.84 + 0.3 * blot;
      if ( s == 8 ) c = mix( c, vec3( 0.28, 0.33, 0.2 ), 0.22 * smoothstep( 0.62, 0.85, aNoise( vAP * 0.15 + 7.0 ) ) );
    }
    // Kenarlar (2026-11-17): kutu kenarı ışığı yakalar ve boyası aşınır (ince açık şerit), köşenin dibi koyulaşır; yalnız
    // yakında (piksel ölçüsüne göre söner). Kesin çizgili "oyuncak" kutu görünümünü kırar. Çim, su, ağaç ve camda yok
    bool solid = s >= 1 && s != 12 && s != 19 && s != 30 && s != 31 && win.x < 0.5;
    if ( solid ) {
      vec3 ed = min( vPL, vPS - vPL );
      float eh = side ? min( ed.y, xFace ? ed.z : ed.x ) : min( ed.x, ed.z );
      float fe = aFade( side ? uv : vPL.xz, 0.12 );
      float lip = 1.0 - smoothstep( 0.0, 0.05, eh );
      c *= 1.0 + 0.12 * lip * fe * ( 0.6 + 0.4 * aNoise( vAP * 5.0 ) );
      // Renk: doygunluk biraz düşük (parlak, oyuncak renkler yerine yaşlanmış malzeme)
      float lum = dot( c, vec3( 0.299, 0.587, 0.114 ) );
      c = mix( vec3( lum ), c, 0.86 );
    }
    // Hasar: kurum ve yanık lekeleri, hasar arttıkça yayılır
    if ( archDamage > 0.01 ) {
      float ch = aNoise( vAP * 0.18 ) * 0.7 + aNoise( vAP * 0.9 ) * 0.3;
      float burn = smoothstep( 1.0 - archDamage * 0.85, 1.08 - archDamage * 0.85, ch );
      c = mix( c, vec3( 0.06, 0.055, 0.05 ), burn * 0.88 );
    }
    diffuseColor.rgb = c;
  }
`;

/**
 * Yapı malzemesi (yapı başına bir tane: hasar ve inşaat saydamlığı yapıya özgü). Köşe rengi temel ton; yüzey türü,
 * parça içi konum ve parça boyu köşe özniteliklerinde (ArchBatch).
 */
export function archMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: false });
  const own = { archDamage: { value: 0 }, archLit: { value: 1 } };
  m.userData.arch = own;
  m.onBeforeCompile = (shader) => {
    linkAtmosphere(shader);
    linkCloudShadow(shader);
    Object.assign(shader.uniforms, archU, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float surf;\nattribute vec3 pl;\nattribute vec3 ps;\nattribute vec3 pn;\nvarying float vSurf;\nvarying vec3 vPL;\nvarying vec3 vPS;\nvarying vec3 vAN;\nvarying vec3 vAP;\nvarying vec3 vAPw;\nvarying vec3 vAWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSurf = surf; vPL = pl; vPS = ps; vAN = pn; vAP = position;
        #ifdef USE_INSTANCING
          vAPw = ( modelMatrix * instanceMatrix * vec4( position, 1.0 ) ).xyz;
          vAWN = ( modelMatrix * instanceMatrix * vec4( objectNormal, 0.0 ) ).xyz;
        #else
          vAPw = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
          vAWN = ( modelMatrix * vec4( objectNormal, 0.0 ) ).xyz;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}\n${WINDOWS}\nvarying vec3 vAPw;\nvarying vec3 vAWN;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += aEmit;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( normal + ( viewMatrix * vec4( aBump, 0.0 ) ).xyz );');
  };
  m.customProgramCacheKey = () => 'arch';
  return m;
}

/** Gece pencere ışığı (1 yanar, 0 karartma: süs köylerinin bir kısmı, decor.ts). */
export function setArchLit(m: THREE.Material, v: number): void {
  (m.userData.arch as { archLit: THREE.IUniform<number> }).archLit.value = v;
}

/** Hasar oranı (0 sağlam, 1 yıkık): yanık lekeleri ve kararmış camlar. */
export function setArchDamage(m: THREE.Material, d: number): void {
  (m.userData.arch as { archDamage: THREE.IUniform<number> }).archDamage.value = d;
}

/** ground.ts ile aynı eşikler: yere değen (alt yüzü bu kadar alçak) ve ince (bu kadar yüksek) parça. */
const GROUND_TOUCH = 0.6;
const GROUND_THIN_H = 1.6;
/**
 * Bundan geniş ince parçalar bölünür; bölünen üçgenin yatay kenarı en çok bu kadar (m). Arazinin kendi ızgarası 70–150 m
 * aralıklı (aralarında düz): 35 m yeter. Ölçüm (2026-11-13): 12 m'de yapıların üçgeni 308 → 808 bin, 28 m'de 435 bin (ekranda
 * +%22), 35 m'de 378 bin (ekranda +%9); gömülme önce en çok 8,4 m, 35 m'de birkaç noktada 1 m'nin altında.
 */
const DRAPE_MIN = 40;
const DRAPE_EDGE = 35;

/**
 * Üçgenleri (yalnız üst yüzü) en uzun yatay kenarından ikiye bölerek kenarları maxLen'in altına indir.
 * Bütün öznitelikler ara değerlenir. Yan yüzler (ince kenar) olduğu gibi kalır.
 */
function drape(g: THREE.BufferGeometry, maxLen: number): THREE.BufferGeometry {
  const names = Object.keys(g.attributes);
  const src = names.map((nm) => g.getAttribute(nm) as THREE.BufferAttribute);
  const pi = names.indexOf('position');
  const ni = names.indexOf('normal');
  const out: number[][] = names.map(() => []);
  type V = number[][];
  const vert = (i: number): V => src.map((a) => {
    const r: number[] = [];
    for (let k = 0; k < a.itemSize; k++) r.push((a.array as ArrayLike<number>)[i * a.itemSize + k]);
    return r;
  });
  const mid = (a: V, b: V): V => a.map((arr, j) => arr.map((v, k) => (v + b[j][k]) / 2));
  const emit = (v: V): void => v.forEach((arr, j) => out[j].push(...arr));
  const hl = (a: V, b: V): number => Math.hypot(a[pi][0] - b[pi][0], a[pi][2] - b[pi][2]);
  const split = (a: V, b: V, c: V, d: number): void => {
    const ab = hl(a, b);
    const bc = hl(b, c);
    const ca = hl(c, a);
    const m = Math.max(ab, bc, ca);
    if (m <= maxLen || d > 14) {
      emit(a);
      emit(b);
      emit(c);
      return;
    }
    if (m === ab) {
      const p = mid(a, b);
      split(a, p, c, d + 1);
      split(p, b, c, d + 1);
    } else if (m === bc) {
      const p = mid(b, c);
      split(a, b, p, d + 1);
      split(a, p, c, d + 1);
    } else {
      const p = mid(c, a);
      split(a, b, p, d + 1);
      split(p, b, c, d + 1);
    }
  };
  const n = g.getAttribute('position').count;
  for (let i = 0; i + 2 < n; i += 3) {
    const a = vert(i);
    const b = vert(i + 1);
    const c = vert(i + 2);
    // Yalnız üst yüz (normali yukarı): yan yüzler ince, alt yüz yukarıdan görünmez
    if (ni >= 0 && a[ni][1] < 0.5) {
      emit(a);
      emit(b);
      emit(c);
    } else split(a, b, c, 0);
  }
  const res = new THREE.BufferGeometry();
  names.forEach((nm, j) => res.setAttribute(nm, new THREE.Float32BufferAttribute(out[j], src[j].itemSize)));
  return res;
}

/** Parçaları yüzey türü ve renkle birleştiren yığın: build() tek ağ ekler. */
export class ArchBatch {
  private readonly parts: THREE.BufferGeometry[] = [];
  /** Parça başına köşe sayısı ve son konumdaki sınır kutusu (n, x0, y0, z0, x1, y1, z1): araziye oturtma için (ground.ts). */
  private readonly meta: number[] = [];
  /** Parça başına yüzey türü (inşaat iskelesi bina gövdesini bundan bulur: construction.ts). */
  private readonly surfs: number[] = [];
  /** Sonraki parçaların yerleşimi (setOrigin): Y dönüşü ve yatay kayma. Birkaç yapı tek ağa toplanır (süs köyleri). */
  private oyaw = 0;
  private ox = 0;
  private oz = 0;

  /**
   * Sonra eklenen parçalar önce kendi yerine konur, sonra bu kadar döndürülüp (Y, radyan) (x, z)'ye kaydırılır: tek tek
   * yapı modelleri (buildCityModel) bir köyün içinde yerine oturur. Desen parçanın kendi ekseninde kalır.
   */
  setOrigin(x: number, z: number, yaw: number): void {
    this.ox = x;
    this.oz = z;
    this.oyaw = yaw;
  }

  /**
   * Birim geometriyi ölçekle, Y etrafında döndür, konumla. surf: yüzey türü, color: temel renk (sRGB onaltılık).
   * Parça içi konum (pl) ve boy (ps) ölçekli, dönmemiş geometriden: desen parçaya oturur.
   */
  add(geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry: number, color: number, surf: Surf): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    g.scale(sx, sy, sz);
    this.finish(g, color, surf, ry, x, y, z);
  }

  /** Hazır (ölçülü) geometri: kendi sınır kutusuyla parça içi konum. color null: geometrinin köşe renkleri kalır. */
  push(geo: THREE.BufferGeometry, color: number | null, surf: Surf, ry = 0, x = 0, y = 0, z = 0): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    this.finish(g, color, surf, ry, x, y, z);
  }

  private finish(g: THREE.BufferGeometry, color: number | null, surf: Surf, ry: number, x: number, y: number, z: number): void {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.computeBoundingBox();
    // Yere yatan geniş ince parça (asfalt, beton, arsa, toprak saha, pist): üst ve alt yüzü sık üçgenlere bölünür, araziye
    // oturtulurken (ground.ts) her köşe araziyi izler; eğimde ya da tümsekte ortası toprağa gömülmez (2026-11-13, üssün
    // eğimli kenarındaki park alanı). Gövdeler (bina, hangar) bölünmez, bütün olarak kayar.
    {
      const b0 = g.boundingBox!;
      const h = b0.max.y - b0.min.y;
      const wide = Math.max(b0.max.x - b0.min.x, b0.max.z - b0.min.z);
      if (h < GROUND_THIN_H && wide > DRAPE_MIN && y + b0.min.y < GROUND_TOUCH) {
        g = drape(g, DRAPE_EDGE);
        g.computeBoundingBox();
      }
    }
    const bb = g.boundingBox!;
    const p = g.getAttribute('position');
    const n = p.count;
    const pl = new Float32Array(n * 3);
    const ps = new Float32Array(n * 3);
    const sx = bb.max.x - bb.min.x;
    const sy = bb.max.y - bb.min.y;
    const sz = bb.max.z - bb.min.z;
    for (let i = 0; i < n; i++) {
      pl[i * 3] = p.getX(i) - bb.min.x;
      pl[i * 3 + 1] = p.getY(i) - bb.min.y;
      pl[i * 3 + 2] = p.getZ(i) - bb.min.z;
      ps[i * 3] = sx;
      ps[i * 3 + 1] = sy;
      ps[i * 3 + 2] = sz;
    }
    // Desen ekseni döndürme öncesi normalden (parça kendi ekseninde)
    const pn = new Float32Array((g.getAttribute('normal').array as Float32Array));
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    if (this.oyaw) g.rotateY(this.oyaw);
    if (this.ox || this.oz) g.translate(this.ox, 0, this.oz);
    g.computeBoundingBox();
    const fb = g.boundingBox!;
    this.meta.push(n, fb.min.x, fb.min.y, fb.min.z, fb.max.x, fb.max.y, fb.max.z);
    this.surfs.push(surf);
    const own = g.getAttribute('color');
    let col: Float32Array;
    if (color === null && own) col = Float32Array.from(own.array as Float32Array);
    else {
      const c = new THREE.Color(color ?? 0xffffff);
      col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    out.setAttribute('normal', g.getAttribute('normal'));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('surf', new THREE.BufferAttribute(new Float32Array(n).fill(surf), 1));
    out.setAttribute('pl', new THREE.BufferAttribute(pl, 3));
    out.setAttribute('ps', new THREE.BufferAttribute(ps, 3));
    out.setAttribute('pn', new THREE.BufferAttribute(pn, 3));
    this.parts.push(out);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  /** Birleştirilmiş ağı gruba ekler (boşsa bir şey eklemez); ağı döndürür. */
  build(into: THREE.Object3D, mat: THREE.Material): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const m = mergeGeometries(this.parts);
    this.parts.length = 0;
    const meta = Float32Array.from(this.meta);
    this.meta.length = 0;
    const surfs = Uint8Array.from(this.surfs);
    this.surfs.length = 0;
    if (!m) return null;
    m.computeBoundingSphere();
    const mesh = new THREE.Mesh(m, mat);
    mesh.userData.parts = meta;
    mesh.userData.surfs = surfs;
    into.add(mesh);
    return mesh;
  }
}
