// Yapı yüzeyleri: tek gölgelendiricide gerçek malzeme görünümleri. Her parça (kutu, kemer, silindir, çatı) bir yüzey
// türü taşır; desen parçanın kendi ekseninde metre ölçeğinde hesaplanır (pencereler duvara ortalanır, köşelerden
// uzak durur). Uzakta pikselden ince desenler ortalama rengine söner (kıpırtı olmaz).
//
// Yüzeyler: tuğla, sıva ve beton duvar (pencereli ya da düz), oluklu sac, kiremit, katran keçe, testere dişi çatı
// (kuzey yüzü camlı), cam cephe, çim, kaldırım taşı, asfalt, pist betonu, kum torbası, boyalı metal, ahşap kaplama,
// su, toprak. Pencereler göğü yansıtır; gece bir kısmı sıcak ışıkla yanar. Hasar: kurum ve yanık lekeleri büyür,
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
`;

/** Yüzey rengi: diffuseColor.rgb (köşe rengi) üstüne malzeme; geceleyin yanan pencere ışığı aEmit'e. */
const COLOR = /* glsl */ `
  vec3 aEmit = vec3( 0.0 );
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
    float glassOk = 1.0 - smoothstep( 0.3, 0.7, archDamage );
    // Duvar kutusunun üst yüzü düz çatıdır: katran keçe (duvar dokusu almaz)
    bool wallSurf = s >= 1 && s <= 6 || s == 22;
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
      c = mix( base, mix( base * tone, vec3( 0.55, 0.52, 0.48 ), mortar * 0.75 ), f );
      c *= 0.94 + 0.08 * aNoise( vAP * 0.35 );
      if ( s == 2 && side ) win = aWindows( uv, faceW, faceH, 4.2, 2.6, min( 3.6, faceH * 0.35 ), min( 2.2, faceH * 0.22 ), max( 5.0, faceH * 0.45 ), 2.0 );
    } else if ( s == 3 || s == 4 || s == 22 ) {
      // Sıva: hafif leke ve dalga, dipte toprak sıçraması
      c = base * ( 0.93 + 0.1 * aNoise( vAP * 0.6 ) ) * ( 0.97 + 0.05 * aNoise( vAP * 3.1 ) );
      if ( side ) c *= 1.0 - 0.12 * ( 1.0 - smoothstep( 0.0, 0.7, vPL.y ) );
      if ( s == 4 && side ) win = aWindows( uv, faceW, faceH, 3.0, 1.2, 1.35, 0.95, 2.9, 1.0 );
      if ( s == 22 && side ) win = aWindows( uv, faceW, faceH, 2.7, 1.5, 1.45, 0.9, 3.1, 1.2 );
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
      c *= 1.0 + ( sh - 0.5 ) * 0.14 * fs + step( 0.94, sh ) * 0.12 * fs;
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
      c = base * mix( 1.0, ( 0.82 + 0.28 * row ) * ( 0.88 + 0.24 * aHash2( floor( tq ) ) ), f );
      c = mix( c, vec3( 0.25, 0.28, 0.16 ), smoothstep( 0.7, 0.92, aNoise( vAP * 0.45 ) ) * 0.3 );
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
    } else if ( s == 13 ) {
      // Kaldırım taşı: 0,6 m plakalar
      float f = aFade( vPL.xz, 0.6 );
      vec2 pq = floor( vPL.xz / 0.6 );
      c = base * mix( 1.0, 0.9 + 0.16 * aHash2( pq ), f );
      c *= 1.0 - 0.22 * max( aLine( vPL.x, 0.6, 0.012 ), aLine( vPL.z, 0.6, 0.012 ) );
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
        vec3 glass = mix( inner, sky * 0.85, fres * glassOk );
        c = mix( c, glass, win.x );
        // Gece ışığı: pencerelerin bir kısmı sıcak sarı (karartma: seyrek)
        float lit = step( 0.72, aHash( vec3( win.z, floor( vAP.x / 50.0 ), floor( vAP.z / 50.0 ) ) ) ) * glassOk;
        aEmit = vec3( 1.0, 0.72, 0.4 ) * 0.9 * lit * archNight * win.x;
      }
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
  const own = { archDamage: { value: 0 } };
  m.userData.arch = own;
  m.onBeforeCompile = (shader) => {
    linkAtmosphere(shader);
    linkCloudShadow(shader);
    Object.assign(shader.uniforms, archU, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float surf;\nattribute vec3 pl;\nattribute vec3 ps;\nattribute vec3 pn;\nvarying float vSurf;\nvarying vec3 vPL;\nvarying vec3 vPS;\nvarying vec3 vAN;\nvarying vec3 vAP;\nvarying vec3 vAPw;\nvarying vec3 vAWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSurf = surf; vPL = pl; vPS = ps; vAN = pn; vAP = position;
        vAPw = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
        vAWN = ( modelMatrix * vec4( objectNormal, 0.0 ) ).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}\n${WINDOWS}\nvarying vec3 vAPw;\nvarying vec3 vAWN;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += aEmit;');
  };
  m.customProgramCacheKey = () => 'arch';
  return m;
}

/** Hasar oranı (0 sağlam, 1 yıkık): yanık lekeleri ve kararmış camlar. */
export function setArchDamage(m: THREE.Material, d: number): void {
  (m.userData.arch as { archDamage: THREE.IUniform<number> }).archDamage.value = d;
}

/** Parçaları yüzey türü ve renkle birleştiren yığın: build() tek ağ ekler. */
export class ArchBatch {
  private readonly parts: THREE.BufferGeometry[] = [];

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
    if (!m) return null;
    m.computeBoundingSphere();
    const mesh = new THREE.Mesh(m, mat);
    into.add(mesh);
    return mesh;
  }
}
