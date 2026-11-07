// Uçak kaplaması gölgelendiricide: gerçek boya ve kamuflaj deseni, yapı malzemesine göre doku, egzoz isi ve ulusal
// armalar. Hepsi modelin kendi ekseninde (metre) hesaplanır: UV gerekmez, desen ve armalar kavisli yüzeye oturur,
// model büyütülse de (uzak görünüm) doku ölçeği doğru kalır.
//
// Doku (yüksek ayrıntıda):
//   - metal: panel çizgileri (gövdede çerçeve ve dikiş, kanatta nervür hizası), yanlarında perçin sıraları, panelden
//     panele ton ve parlaklık farkı (alüminyum levhalar aynı tonda değildir);
//   - ahşap: kontrplak üstüne boya, pürüzsüz; yalnız büyük birleşim çizgileri, hafif dolgu dalgası;
//   - kumaş: nervür bantları, aralarında hafif sarkma gölgesi, kiriş çizgileri.
// Çizgiler pikselden ince kalınca söner (uzakta kıpırtı ve hare olmaz).

import * as THREE from 'three';
import { ATMO_PARS, linkAtmosphere } from './atmosphere';
import { NATION_ID, type Livery, type MarkSpot, type Nation } from './liveries';

export interface SkinInfo {
  livery: Livery;
  /** Burnun z'si (renkli burun ve parlama önleyici bant). */
  noseZ: number;
  /** Kanat açıklığı (m): kamuflaj lekelerinin ölçeği. */
  span: number;
  /** Egzoz çıkışları (x ≥ 0, karşı yan aynalı; w: is izinin boyu). */
  soot: THREE.Vector4[];
  /** Arma yerleri (en çok 6: iki kanat, iki gövde yanı, iki kuyruk yüzü). */
  marks: (MarkSpot & { fin?: boolean })[];
  nation: Nation | null;
}

const MAX_SOOT = 6;
const MAX_MARKS = 6;

const lin = (hex: number) => {
  const c = new THREE.Color(hex);
  return `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;
};

// Arma renkleri (doğrusal)
const MK = {
  RAF_BLUE: lin(0x2b3a64),
  RAF_RED: lin(0xa8302c),
  WHITE: lin(0xeeeee8),
  YELLOW: lin(0xd8b63c),
  BLACK: lin(0x1c1c1e),
  US_BLUE: lin(0x223a6a),
  SOV_RED: lin(0xb02a26),
  HINO_RED: lin(0xb4262a),
  FR_BLUE: lin(0x24408c),
};

const PARS = /* glsl */ `
  varying vec3 vSkP;
  varying vec3 vSkN;
  uniform vec3 skTop0;
  uniform vec3 skTop1;
  uniform vec3 skTop2;
  uniform vec3 skUnder;
  uniform vec3 skSides;
  uniform vec3 skNose;
  /** x desen (0 tek renk, 1 dalgalı, 2 kıymık, 3 yumuşak), y ton sayısı, z yüksek yanlar, w üç tonlu donanma */
  uniform vec4 skA;
  /** x burun z, y burun boyu (0 yok), z yalnız üstte, w desen ölçeği */
  uniform vec4 skB;
  /** x malzeme (0 metal, 1 ahşap), y arka kaplama z, z arka kaplama (0 yok, 1 kumaş, 2 ahşap), w is izi sayısı */
  uniform vec4 skC;
  uniform vec4 skSoot[ ${MAX_SOOT} ];
  uniform vec4 skMarkP[ ${MAX_MARKS} ];
  uniform vec4 skMarkN[ ${MAX_MARKS} ];
  uniform vec4 skMarkT[ ${MAX_MARKS} ];
  /** x ulus (0 yok), y arma sayısı */
  uniform vec2 skNat;

  float skHash3( vec3 c ) { return fract( sin( dot( c, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
  float skNoise( vec3 p ) {
    vec3 i = floor( p );
    vec3 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = skHash3( i );
    float b = skHash3( i + vec3( 1.0, 0.0, 0.0 ) );
    float c = skHash3( i + vec3( 0.0, 1.0, 0.0 ) );
    float d = skHash3( i + vec3( 1.0, 1.0, 0.0 ) );
    float e = skHash3( i + vec3( 0.0, 0.0, 1.0 ) );
    float g = skHash3( i + vec3( 1.0, 0.0, 1.0 ) );
    float h = skHash3( i + vec3( 0.0, 1.0, 1.0 ) );
    float k = skHash3( i + vec3( 1.0, 1.0, 1.0 ) );
    return mix( mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y ), mix( mix( e, g, f.x ), mix( h, k, f.x ), f.y ), f.z );
  }
  /** sp aralıklı, w yarı kalınlıklı çizgi (kenar yumuşatmalı); piksel çizgiden çok büyüyünce söner. */
  float skLine( float c, float sp, float w ) {
    float fw = fwidth( c );
    float d = abs( fract( c / sp + 0.5 ) - 0.5 ) * sp;
    return ( 1.0 - smoothstep( w, w + fw * 1.5, d ) ) * ( 1.0 - smoothstep( 0.02, 0.06, fw ) );
  }
  /** Beş köşeli yıldızın işaretli uzaklığı (iç negatif), r dış yarıçap, rf iç oran. */
  float skStar( vec2 p, float r, float rf ) {
    const vec2 k1 = vec2( 0.809016994375, -0.587785252292 );
    const vec2 k2 = vec2( -0.809016994375, -0.587785252292 );
    p.x = abs( p.x );
    p -= 2.0 * max( dot( k1, p ), 0.0 ) * k1;
    p -= 2.0 * max( dot( k2, p ), 0.0 ) * k2;
    p.x = abs( p.x );
    p.y -= r;
    vec2 ba = rf * vec2( -k1.y, k1.x ) - vec2( 0.0, 1.0 );
    float h = clamp( dot( p, ba ) / dot( ba, ba ), 0.0, r );
    return length( p - ba * h ) * sign( p.y * ba.x - p.x * ba.y );
  }
  /** Arma rengi ve örtüsü (a): q arma düzleminde yarıçap birimi, kind 0 kanat, 1 gövde, 2 kuyruk; aa kenar genişliği. */
  vec4 skInsignia( vec2 q, float kind, float aa ) {
    float d = length( q );
    vec4 c = vec4( 0.0 );
    int nat = int( skNat.x + 0.5 );
    #define SK_FILL( sd, col ) c = mix( c, vec4( col, 1.0 ), 1.0 - smoothstep( -aa, aa, sd ) );
    if ( nat == 1 ) {
      if ( kind > 1.5 ) {
        // Kuyruk bayrağı: önden kırmızı, beyaz, mavi dikey şeritler
        float box = max( abs( q.x ) - 0.75, abs( q.y ) - 1.0 );
        SK_FILL( box, ${MK.RAF_BLUE} )
        SK_FILL( max( box, -q.x - 0.25 ), ${MK.WHITE} )
        SK_FILL( max( box, -q.x + 0.25 ), ${MK.RAF_RED} )
      } else if ( kind > 0.5 ) {
        SK_FILL( d - 1.0, ${MK.YELLOW} ) SK_FILL( d - 0.84, ${MK.RAF_BLUE} ) SK_FILL( d - 0.56, ${MK.WHITE} ) SK_FILL( d - 0.3, ${MK.RAF_RED} )
      } else {
        SK_FILL( d - 1.0, ${MK.RAF_BLUE} ) SK_FILL( d - 0.45, ${MK.RAF_RED} )
      }
    } else if ( nat == 2 && kind < 1.5 ) {
      // Balkenkreuz: beyaz kenarlı siyah haç
      vec2 a = abs( q );
      float o = min( max( a.x - 1.0, a.y - 0.31 ), max( a.x - 0.31, a.y - 1.0 ) );
      float i = min( max( a.x - 0.86, a.y - 0.16 ), max( a.x - 0.16, a.y - 0.86 ) );
      SK_FILL( o, ${MK.WHITE} ) SK_FILL( i, ${MK.BLACK} )
    } else if ( nat == 3 && kind < 1.5 ) {
      // Mavi disk ve iki yanında çubuk, beyaz yıldız ve beyaz çubuk içleri
      float bar = max( abs( q.x ) - 1.75, abs( q.y ) - 0.33 );
      SK_FILL( min( bar, d - 1.0 ), ${MK.US_BLUE} )
      SK_FILL( max( abs( abs( q.x ) - 1.28 ) - 0.42, abs( q.y ) - 0.2 ), ${MK.WHITE} )
      SK_FILL( skStar( q, 0.96, 0.46 ), ${MK.WHITE} )
    } else if ( nat == 4 ) {
      // Beyaz kenarlı kırmızı yıldız (kuyrukta da)
      SK_FILL( skStar( q, 1.0, 0.46 ), ${MK.WHITE} )
      SK_FILL( skStar( q, 0.8, 0.46 ) , ${MK.SOV_RED} )
    } else if ( nat == 5 && kind < 1.5 ) {
      if ( kind > 0.5 ) { SK_FILL( d - 1.0, ${MK.WHITE} ) SK_FILL( d - 0.8, ${MK.HINO_RED} ) }
      else { SK_FILL( d - 0.85, ${MK.HINO_RED} ) }
    } else if ( nat == 6 ) {
      if ( kind > 1.5 ) {
        float box = max( abs( q.x ) - 0.75, abs( q.y ) - 1.0 );
        SK_FILL( box, ${MK.RAF_RED} )
        SK_FILL( max( box, -q.x - 0.25 ), ${MK.WHITE} )
        SK_FILL( max( box, -q.x + 0.25 ), ${MK.FR_BLUE} )
      } else {
        SK_FILL( d - 1.0, ${MK.RAF_RED} ) SK_FILL( d - 0.66, ${MK.WHITE} ) SK_FILL( d - 0.33, ${MK.FR_BLUE} )
      }
    }
    return c;
  }
`;

/** Renk ve doku: diffuseColor yerine geçer (color_fragment'tan sonra). skPanel: panel başına 0..1 (metal yansıması). */
const COLOR = /* glsl */ `
  vec3 skP = vSkP;
  // Dönel gövdelerde köşe sarımı ve normali içe dönük (çift yüzlü çizimde ışık yine doğru): görünen yüze göre düzelt
  vec3 skN = normalize( vSkN ) * ( gl_FrontFacing ? 1.0 : -1.0 );
  float skPanel = 0.5;
  {
    // Kamuflaj: üstten yanlara sarılan desen (gövde yanında y de katılır), ölçek açıklığa göre
    vec2 q = vec2( skP.x + skP.y * 0.9, skP.z ) * 1.45 / skB.w;
    float v = 0.0;
    float camo = 0.0;
    float camo2 = 0.0;
    if ( skA.x > 0.5 && skA.x < 1.5 ) {
      v = sin( q.x * 0.85 + q.y * 0.45 + 0.7 ) + 0.8 * sin( q.y * 0.6 - q.x * 0.5 + 2.1 ) + 0.5 * sin( ( q.x + q.y ) * 1.3 );
      float w = fwidth( v ) * 0.8;
      camo = smoothstep( -w, w, v );
      camo2 = smoothstep( 0.9 - w, 0.9 + w, v );
    } else if ( skA.x > 1.5 && skA.x < 2.5 ) {
      // Kıymık: iki eğik ızgaranın hücreleri, keskin düz kenarlar
      vec2 a = vec2( dot( q, vec2( 0.83, 0.55 ) ), dot( q, vec2( -0.42, 0.91 ) ) );
      vec2 cell = floor( a / vec2( 1.7, 1.3 ) );
      camo = step( 0.5, skHash3( vec3( cell, 3.0 ) ) );
    } else if ( skA.x > 2.5 ) {
      v = skNoise( vec3( q * 0.85, 1.7 ) ) + 0.5 * skNoise( vec3( q * 2.2, 5.3 ) );
      camo = smoothstep( 0.66, 0.84, v );
    }
    vec3 c = mix( skTop0, skTop1, camo );
    if ( skA.y > 2.5 ) c = mix( c, skTop2, camo2 );
    if ( skA.w > 0.5 ) c = mix( skSides, skTop0, smoothstep( 0.35, 0.55, skN.y ) );
    if ( skA.z > 0.5 ) {
      // Yüksek yanlar: alt renk üstünde seyrek püskürtme benekler
      float side = 1.0 - smoothstep( 0.2, 0.42, skN.y );
      float mot = smoothstep( 0.58, 0.78, skNoise( skP * 1.7 ) ) * 0.85;
      c = mix( c, mix( skUnder, skTop1, mot ), side );
    }
    c = mix( c, skUnder, smoothstep( -0.16, -0.36, skN.y ) );
    if ( skB.y > 0.0 && skP.z > skB.x - skB.y && ( skB.z < 0.5 || ( skN.y > 0.35 && abs( skP.x ) < 0.5 ) ) ) c = skNose;

    // Malzeme: arka gövde ayrı kaplama olabilir (Hurricane kumaş, Il-2 ahşap)
    float mat = skC.x;
    if ( skC.z > 0.5 && skP.z < skC.y && ( abs( skP.x ) < 1.0 || skP.z < skC.y - 1.8 ) ) mat = skC.z > 1.5 ? 1.0 : 2.0;
    #ifdef SKIN_DETAIL
      if ( mat < 0.5 ) {
        // Metal: panel çizgileri ve perçin sıraları; çizgi yüzeyin içinde kalan eksenlerde görünür
        float lz = skLine( skP.z, 0.74, 0.006 ) * ( 1.0 - abs( skN.z ) );
        float lx = skLine( skP.x, 0.58, 0.006 ) * ( 1.0 - abs( skN.x ) ) * step( 0.95, abs( skP.x ) );
        float ly = skLine( skP.y + 0.27 * floor( skP.z / 0.74 ), 0.52, 0.005 ) * abs( skN.x ) * ( 1.0 - abs( skN.z ) );
        float rv = ( skLine( skP.z - 0.05, 0.74, 0.0025 ) + skLine( skP.z + 0.05, 0.74, 0.0025 ) ) * ( 1.0 - abs( skN.z ) ) * 0.25;
        float line = clamp( max( max( lz, lx ), ly ) + rv, 0.0, 1.0 );
        vec3 cell = floor( vec3( skP.x / 0.58, ( skP.y + 0.27 * floor( skP.z / 0.74 ) ) / 0.52, skP.z / 0.74 ) );
        skPanel = skHash3( cell );
        #ifdef SKIN_METAL
          // Çıplak alüminyum: levhalar farklı ton ve hafif renk sapmasında
          c *= ( 1.0 + ( skPanel - 0.5 ) * 0.12 ) * vec3( 1.0 + ( skHash3( cell + 9.1 ) - 0.5 ) * 0.02, 1.0, 1.0 - ( skHash3( cell + 9.1 ) - 0.5 ) * 0.02 );
        #else
          // Boya: levhalar farklı solmuş ve rötuşlanmış; tek tonlu yüzey plastik gibi duruyordu
          c *= 1.0 + ( skPanel - 0.5 ) * 0.1;
          // Kir ve yağ izi: hava akışı yönünde (z) uzayan silik koyu çizgiler; alt yüzde ve arka gövdede daha çok
          // Uzakta (desen pikselden küçülünce) söner: kıpırdamasın
          float grime = smoothstep( 0.45, 0.85, skNoise( vec3( skP.x * 3.4, skP.y * 3.4, skP.z * 0.32 ) ) )
            * ( 1.0 - smoothstep( 0.3, 0.8, length( fwidth( skP ) ) * 3.4 ) );
          c *= 1.0 - grime * ( 0.08 + 0.08 * smoothstep( 0.2, -0.5, skN.y ) + 0.04 * smoothstep( 0.0, -4.0, skP.z ) );
        #endif
        // Panel çizgisi gerçekte ince bir gölge: birkaç metreden belli belirsiz (boyada biraz daha koyu: dolgu ve kir)
        #ifdef SKIN_METAL
          c *= 1.0 - line * 0.16;
        #else
          c *= 1.0 - line * 0.22;
        #endif
      } else if ( mat < 1.5 ) {
        // Ahşap: pürüzsüz, yalnız büyük birleşim çizgileri ve dolgu dalgası
        c *= 0.985 + 0.03 * skNoise( skP * 0.7 );
        c *= 1.0 - skLine( skP.z, 2.3, 0.006 ) * ( 1.0 - abs( skN.z ) ) * 0.25;
      } else {
        // Kumaş: nervür bantları, aralarında sarkma gölgesi, kiriş çizgileri
        float rib = skLine( skP.z, 0.32, 0.012 ) * ( 1.0 - abs( skN.z ) );
        float sag = 0.5 + 0.5 * cos( 6.2832 * skP.z / 0.32 );
        c *= ( 0.955 + 0.045 * sag ) * ( 1.0 + 0.05 * rib );
        c *= 1.0 - skLine( skP.y, 0.16, 0.005 ) * abs( skN.x ) * 0.15;
      }
      // Boyada püskürtme dalgası (boyada daha belirgin: el ile püskürtülmüş, yer yer kalın yer yer ince)
      #ifdef SKIN_METAL
        c *= 0.975 + 0.05 * skNoise( skP * 1.3 + 7.0 );
      #else
        c *= 0.95 + 0.1 * skNoise( skP * 1.3 + 7.0 );
      #endif
    #endif
    #ifndef SKIN_METAL
      // Servis boyası: güneşte solmuş, tozlu (fabrika rengi kadar doygun değil); üst yüzler biraz daha soluk
      float skL = dot( c, vec3( 0.299, 0.587, 0.114 ) );
      float fade = 0.2 + 0.08 * smoothstep( 0.2, 0.8, skN.y );
      c = mix( c, vec3( skL ) * vec3( 1.0, 1.0, 0.98 ) + 0.012, fade );
    #endif

    // Egzoz isi: çıkışın gerisinde, gövde ya da nasel yanında koyulaşan iz
    float soot = 0.0;
    vec3 ap = vec3( abs( skP.x ), skP.yz );
    for ( int i = 0; i < ${MAX_SOOT}; i++ ) {
      if ( float( i ) >= skC.w ) break;
      vec4 s = skSoot[ i ];
      vec3 dd = ap - s.xyz;
      float along = -dd.z;
      float perp = length( dd.xy );
      soot = max( soot, smoothstep( -0.05, 0.3, along ) * ( 1.0 - smoothstep( 0.3, s.w, along ) ) * ( 1.0 - smoothstep( 0.06, 0.28 + along * 0.06, perp ) ) );
    }
    c = mix( c, vec3( 0.035, 0.032, 0.03 ), soot * 0.6 );

    // Ulusal armalar: arma düzlemine izdüşüm; kanat armaları alt yüzde de
    for ( int i = 0; i < ${MAX_MARKS}; i++ ) {
      if ( float( i ) >= skNat.y ) break;
      vec4 mp = skMarkP[ i ];
      vec4 mn = skMarkN[ i ];
      vec3 dd = skP - mp.xyz;
      float h = dot( dd, mn.xyz );
      float facing = dot( skN, mn.xyz );
      bool wingMark = mn.w < 0.5;
      if ( abs( h ) > mp.w * ( wingMark ? 0.9 : 0.5 ) || ( wingMark ? abs( facing ) : facing ) < 0.35 ) continue;
      vec3 t = skMarkT[ i ].xyz;
      vec3 b = cross( mn.xyz, t );
      // Armanın "yukarısı" hep yukarı baksın (kuyruğun iki yüzünde de yıldız dik)
      if ( b.y < -0.3 ) b = -b;
      vec2 mq = vec2( dot( dd, t ), dot( dd, b ) ) / mp.w;
      float aa = max( fwidth( mq.x ), 0.002 ) * 1.2;
      vec4 ins = skInsignia( mq, mn.w, aa );
      c = mix( c, ins.rgb, ins.a );
    }
    diffuseColor.rgb = c;
  }
`;

/** Gökyüzü yansıması (metal ve parlak boya): panel başına yansıma farkı. */
const ENV = (env: number, base: number) => /* glsl */ `
  vec3 mN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  vec3 mV = normalize( ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz );
  vec3 mR = reflect( mV, mN );
  vec3 menv = mix( atmoSky( mR ), vec3( 0.08, 0.1, 0.07 ), smoothstep( 0.0, -0.3, mR.y ) ) * ( 0.55 + 0.6 * diffuseColor.rgb );
  float mf = ${base.toFixed(2)} + ${(1 - base).toFixed(2)} * pow( 1.0 - clamp( dot( - mV, mN ), 0.0, 1.0 ), 4.0 );
  outgoingLight = mix( outgoingLight, menv, mf * ${env.toFixed(2)} * ( 0.75 + 0.5 * skPanel ) );
`;

const CAMO_ID = { wavy: 1, splinter: 2, soft: 3 } as const;

/** Modelin kaplama malzemesi (model başına bir tane; gölgelendirici programı boya türü ve ayrıntıya göre paylaşılır). */
export function skinMaterial(info: SkinInfo, detail: number): THREE.MeshPhongMaterial {
  const lv = info.livery;
  const f = lv.finish;
  // Mat boya da tam mat değil (saten): geniş, yumuşak parlama ve sıyırarak bakınca gök yansıması
  // Çıplak metal: keskin parlama ve güçlü yansıma (gümüş, beyaz boya gibi değil)
  const o = f === 'metal' ? { specular: 0xb4b4b4, shininess: 90, env: 0.5, base: 0.26 }
    // Parlak boya (donanma laciverti): daha küçük ve keskin parlama. Mat boya: geniş yumuşak parlama plastik gibi
    // duruyordu, kısıldı; sıyırarak bakınca gök yansıması kalır.
    : f === 'gloss' ? { specular: 0x7a7a7a, shininess: 110, env: 0.28, base: 0.07 }
      : { specular: 0x1e1e1e, shininess: 10, env: 0.15, base: 0.03 };
  const m = new THREE.MeshPhongMaterial({
    color: 0xffffff, flatShading: !detail, side: THREE.DoubleSide, specular: o.specular, shininess: o.shininess,
  });
  const top = lv.top.map((h) => new THREE.Color(h));
  const camo = lv.top.length > 1 ? CAMO_ID[lv.camo ?? 'wavy'] : 0;
  const vec4s = (list: THREE.Vector4[], n: number) => Array.from({ length: n }, (_, i) => list[i] ?? new THREE.Vector4());
  const marks = info.nation ? info.marks.slice(0, MAX_MARKS) : [];
  const u = {
    skTop0: { value: top[0] },
    skTop1: { value: top[1] ?? top[0] },
    skTop2: { value: top[2] ?? top[1] ?? top[0] },
    skUnder: { value: new THREE.Color(lv.under) },
    skSides: { value: new THREE.Color(lv.sides ?? lv.under) },
    skNose: { value: new THREE.Color(lv.nose?.color ?? 0) },
    skA: { value: new THREE.Vector4(camo, lv.top.length, lv.highSides ? 1 : 0, lv.sides !== undefined ? 1 : 0) },
    skB: { value: new THREE.Vector4(info.noseZ, lv.nose?.len ?? 0, lv.nose?.top ? 1 : 0, Math.min(3, Math.max(1, info.span / 11))) },
    skC: {
      value: new THREE.Vector4(lv.skin === 'wood' ? 1 : 0, lv.aft?.z ?? -1e4, lv.aft ? (lv.aft.skin === 'fabric' ? 1 : 2) : 0, Math.min(MAX_SOOT, info.soot.length)),
    },
    skSoot: { value: vec4s(info.soot, MAX_SOOT) },
    skMarkP: { value: vec4s(marks.map((s) => new THREE.Vector4(s.p.x, s.p.y, s.p.z, s.r)), MAX_MARKS) },
    skMarkN: { value: vec4s(marks.map((s) => new THREE.Vector4(s.n.x, s.n.y, s.n.z, s.fin ? 2 : s.fuselage ? 1 : 0)), MAX_MARKS) },
    skMarkT: { value: vec4s(marks.map((s) => new THREE.Vector4(s.t.x, s.t.y, s.t.z, 0)), MAX_MARKS) },
    skNat: { value: new THREE.Vector2(info.nation ? NATION_ID[info.nation] : 0, marks.length) },
  };
  m.userData.skin = u;
  m.onBeforeCompile = (shader) => {
    linkAtmosphere(shader);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkP;\nvarying vec3 vSkN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkP = position;\nvSkN = objectNormal;');
    let fs = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ATMO_PARS}\n${PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR}`)
      // Havadaki uçağı gök her yandan aydınlatır: gölgedeki yüz kömür gibi kararmasın
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= 1.3;\n#include <aomap_fragment>');
    if (o.env > 0) fs = fs.replace('#include <opaque_fragment>', `${ENV(o.env, o.base)}\n#include <opaque_fragment>`);
    shader.fragmentShader = fs;
  };
  m.defines = {};
  if (detail) m.defines.SKIN_DETAIL = '';
  if (f === 'metal') m.defines.SKIN_METAL = '';
  m.customProgramCacheKey = () => `skin-${f}-${detail}`;
  return m;
}
