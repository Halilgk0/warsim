// Çöl kayası ve toprağı, piksel başına (2026-11-25, Kanyonlar haritası; kullanıcı: "renkler çok basit, Roblox gibi").
// Köşe rengi 98–146 m'lik ızgarada düzenli şeker çubuğu şeritleri ve sert geçişler veriyordu. Burada renk dünya
// konumundan hesaplanır: bükülmüş, kalınlığı değişen jeolojik formasyonlar (soluk gerçekçi tonlar), yakında ince
// katmanlanma, dik duvarda yukarıdan akan koyu "çöl verniği" izleri, eğimde moloz, düzlükte benekli kum ve adaçayı
// çalısı. Arazi (terrain.ts LAND_FS) ve taş sütunlar (pillars.ts) aynı işlevleri kullanır. Gerektirdikleri: vCloudW (dünya
// konumu; clouds.ts linkCloudShadow) ve tNoise (terrain.ts LAND_PARS; sütun malzemesi kendi kopyasını ekler).

/** tNoise ve tHash (terrain.ts LAND_PARS ile aynı): sütun malzemesi için. */
export const NOISE_GLSL = /* glsl */ `
  float tHash( vec2 c ) { return fract( sin( dot( c, vec2( 41.13, 289.71 ) ) ) * 43758.5453 ); }
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

export const DESERT_GLSL = /* glsl */ `
  /** Formasyon rengi: katman sırasından sözde rastgele, yedi soluk ton (doğrusal uzayda). */
  vec3 dRockPal( float i ) {
    float h = fract( sin( i * 12.9898 + 4.1 ) * 43758.5453 );
    if ( h < 0.15 ) return vec3( 0.30, 0.095, 0.050 );
    if ( h < 0.31 ) return vec3( 0.40, 0.15, 0.075 );
    if ( h < 0.47 ) return vec3( 0.55, 0.34, 0.19 );
    if ( h < 0.59 ) return vec3( 0.56, 0.41, 0.26 );
    if ( h < 0.71 ) return vec3( 0.42, 0.25, 0.18 );
    if ( h < 0.85 ) return vec3( 0.24, 0.10, 0.055 );
    return vec3( 0.46, 0.35, 0.26 );
  }
  /**
   * Kaya: wp dünya konumu, lp 8.192 m'ye indirgenmiş xz, lfw pikselin yerdeki izi (m). Formasyon sınırları yatay değil,
   * büyük ve küçük ölçekte bükülür; kalınlık katmandan katmana değişir (65–150 m).
   */
  vec3 dRock( vec3 wp, vec2 lp, float lfw ) {
    float warp = ( tNoise( lp, 9.0 ) - 0.5 ) * 90.0 + ( tNoise( lp + 31.0, 47.0 ) - 0.5 ) * 26.0 + ( tNoise( lp + 77.0, 210.0 ) - 0.5 ) * 7.0;
    float y = wp.y + warp;
    float f = y / 96.0;
    float i = floor( f );
    float t = fract( f );
    // Katman içi kalınlık oynaması: sınır her katmanda başka yerde
    float edge = 0.55 + 0.4 * fract( sin( i * 7.31 ) * 9137.1 );
    vec3 a = dRockPal( i );
    vec3 b = dRockPal( i + 1.0 );
    vec3 c = mix( a, b, smoothstep( edge, min( edge + 0.18, 1.0 ), t ) );
    // İnce katmanlanma (yakında): 3–9 m'lik açık koyu çizgiler
    float near = 1.0 - smoothstep( 0.8, 6.0, lfw );
    float lam = sin( y * 0.9 + tNoise( lp, 520.0 ) * 5.0 ) * 0.5 + sin( y * 2.3 ) * 0.25;
    c *= 1.0 + 0.09 * lam * near;
    return c;
  }
  /** Çöl verniği: dik duvarda yukarıdan aşağı uzanan koyu izler (yatayda ~12 m, dikeyde ~200 m'lik hücreler). */
  float dVarnish( vec3 wp, vec2 lp, float lfw ) {
    float s = tNoise( vec2( lp.x + lp.y, wp.y * 0.06 ), 680.0 );
    float s2 = tNoise( vec2( lp.x - lp.y + 400.0, wp.y * 0.03 ), 260.0 );
    // Uzakta erken söner: ince izler piksel izine yaklaşınca duvarda tarak gibi titreşiyordu
    float fade = ( 1.0 - smoothstep( 1.5, 7.0, lfw ) ) * 0.7 + ( 1.0 - smoothstep( 7.0, 20.0, lfw ) ) * 0.3;
    return ( smoothstep( 0.55, 0.85, s ) * 0.32 + smoothstep( 0.6, 0.9, s2 ) * 0.2 ) * fade;
  }
  /** Zemin: köşe rengi (kum, yükseklik ve bitkiye göre) üstüne benekli toprak, adaçayı çalısı öbekleri, çakıl. */
  vec3 dGround( vec3 base, vec2 lp, float lfw ) {
    float near = 1.0 - smoothstep( 1.5, 20.0, lfw );
    float mid = 1.0 - smoothstep( 6.0, 60.0, lfw );
    // Büyük ölçek (1–4 km): pembemsi kum ile soluk toprak arası
    float tone = tNoise( lp, 3.0 ) * 0.55 + tNoise( lp + 17.0, 11.0 ) * 0.45;
    vec3 c = base * mix( vec3( 1.06, 0.9, 0.82 ), vec3( 1.02, 1.02, 0.96 ), tone );
    // Bükülmüş koordinat: eşiklenen değer gürültüsü eksene hizalı kare bloklar veriyordu
    vec2 wl = lp + ( vec2( tNoise( lp + 5.0, 150.0 ), tNoise( lp + 9.0, 150.0 ) ) - 0.5 ) * 90.0
                 + ( vec2( tNoise( lp + 2.0, 610.0 ), tNoise( lp + 6.0, 610.0 ) ) - 0.5 ) * 22.0;
    float patches = tNoise( wl, 95.0 ) * 0.6 + tNoise( wl + 5.0, 380.0 ) * 0.4;
    c *= 0.84 + 0.3 * patches;
    // Çıplak kaya yamaları (açık, pürüzsüz kumtaşı)
    float slick = smoothstep( 0.6, 0.85, tNoise( wl + 40.0, 44.0 ) * 0.5 + tNoise( wl, 170.0 ) * 0.3 + tNoise( wl + 11.0, 690.0 ) * 0.2 );
    c = mix( c, c * vec3( 1.12, 1.04, 0.98 ) + vec3( 0.02, 0.01, 0.0 ), slick * 0.6 );
    // Koyu kızıl lekeler (nemli kum, ince çakıl)
    c *= 1.0 - 0.16 * smoothstep( 0.5, 0.82, tNoise( wl + 21.0, 130.0 ) * 0.7 + tNoise( wl + 3.0, 520.0 ) * 0.3 );
    // Çalı öbekleri: uzaktan koyu lekeler, yakında benekler
    float scrubZone = smoothstep( 0.35, 0.65, tNoise( wl + 3.0, 30.0 ) );
    float scrub = smoothstep( 0.5, 0.72, tNoise( lp, 1400.0 ) * 0.7 + tNoise( lp + 9.0, 4100.0 ) * 0.3 );
    // Çalılar açık adaçayı yeşili (görsellerdeki sage): yakında benek, uzakta yeşilimsi ton
    c = mix( c, vec3( 0.22, 0.25, 0.12 ), scrub * 0.75 * near * scrubZone * ( 1.0 - slick ) );
    c = mix( c, c * vec3( 0.9, 0.98, 0.84 ), scrubZone * ( 1.0 - near ) * mid * smoothstep( 3.0, 8.0, lfw ) * 0.5 );
    // Orta mesafede seçilen çalı öbekleri (~25–40 m): adaçayı yeşili benekler
    float clump = smoothstep( 0.54, 0.7, tNoise( wl + 41.0, 260.0 ) * 0.55 + tNoise( wl + 2.0, 900.0 ) * 0.3 + tNoise( wl + 8.0, 2300.0 ) * 0.15 );
    float midOnly = ( 1.0 - smoothstep( 25.0, 80.0, lfw ) ) * smoothstep( 4.0, 10.0, lfw );
    c = mix( c, c * vec3( 0.6, 0.76, 0.56 ), clump * midOnly * 0.75 * ( 1.0 - slick ) );
    // Uzakta: çalılık bölgeler zeytinimsi, çıplak bölgeler açık (bitki örtüsü dokusu)
    float far = smoothstep( 20.0, 60.0, lfw );
    c = mix( c, c * vec3( 0.84, 0.92, 0.76 ), scrubZone * far * 0.55 );
    float grit = tNoise( lp, 7000.0 );
    c *= 1.0 + ( grit - 0.5 ) * 0.22 * near;
    return c;
  }
  /** Çöl arazisinin rengi: eğime göre zemin, moloz ve kaya. n: yüzey normali (dünya). */
  vec3 dDesert( vec3 base, vec3 wp, vec3 n, float lfw ) {
    vec2 lp = mod( wp.xz, 8192.0 );
    float slope = 1.0 - clamp( n.y, 0.0, 1.0 );
    float jitter = ( tNoise( lp, 160.0 ) - 0.5 ) * 0.14;
    float rockK = smoothstep( 0.16, 0.36, slope + jitter );
    float talusK = smoothstep( 0.06, 0.2, slope + jitter ) * ( 1.0 - rockK );
    vec3 rock = dRock( wp, lp, lfw );
    rock *= 1.0 - dVarnish( wp, lp, lfw ) * smoothstep( 0.35, 0.7, slope );
    vec3 g = dGround( base, lp, lfw );
    // Moloz: kayanın açık tonuyla toprak arası, çakıl benekli
    vec3 talus = mix( g, rock * 1.18, 0.55 ) * ( 0.9 + 0.2 * tNoise( lp, 2600.0 ) );
    vec3 c = mix( g, talus, talusK );
    return mix( c, rock, rockK );
  }
`;
