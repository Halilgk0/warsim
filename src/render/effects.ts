// Görsel efektler: duman, toz ve ateş parçacıkları (kameraya dönük yumuşak dokulu kareler, iki InstancedMesh), kalın
// iz mermileri (InstancedMesh) ve roketler.
//
// Parçacıklar iki katmanda:
//   - duman, toz, flak: ışıkla gölgelenir (güneşe bakan yanı aydınlık, gece kararır), içinden ışık geçer;
//   - ateş ve parlama: ışıktan etkilenmez; renk ömür boyunca sıcak çekirdekten kora geçer. Karışım parçacık başına:
//     alev normal karışır, parlama ışık gibi eklenir (aynı çizim çağrısında).
// Kare dokunun köşe normalleri küre gibi dışa açılır: duman topu düz bir kart gibi değil, güneşe bakan yanı aydınlık
// görünür. Yere yakın kareler zemine gömülüp düz kesik vermesin diye biraz kameraya doğru çekilir; kamera dumanın
// içine girince parçacık söner (ekranı kaplayan saydam kareler telefonda pahalı). Duman rüzgârla sürüklenir.

import * as THREE from 'three';
import type { Bullet, Parachute, Rocket } from '../sim/world';
import { PALETTE } from './palette';
import { groundLevel } from '../sim/terrain';
import { G, rand, smoothstep } from '../core/math';
import { WIND, linkAtmosphere } from './atmosphere';

interface Puff {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  grow: number;
  drag: number;
  rise: number;
  color: THREE.Color;
  /** Ömür sonundaki renk (ateş soğur); yoksa renk sabit. */
  end: THREE.Color | null;
  alpha: number;
  opaque: number;
  fadeIn: number;
  fadeOut: number;
  /** Doku hücresi: 0–2 topak duman, 3 yumuşak yuvarlak. */
  shape: number;
  rot: number;
  spin: number;
  /** Doğduğu yerdeki zemin yüksekliği: kare zemine yaklaştıkça saydamlaşır. */
  ground: number;
}

export interface PuffOpts {
  vel?: THREE.Vector3;
  size: number;
  life: number;
  color: number;
  /** Ömür sonundaki renk (alev → kor). */
  end?: number;
  /** Başlangıç renginin parlaklık çarpanı (ateş 1'in üstünde: ton eşlemesi sıcak, beyaza yakın çekirdek verir). */
  bright?: number;
  /** Rastgele parlaklık oynaması (±): duman bulutu tek düze gri olmasın. */
  tint?: number;
  grow?: number;
  drag?: number;
  rise?: number;
  /** En yüksek opaklık (duman 0,85, ateş 1). */
  alpha?: number;
  /** Ateş, namlu alevi, kıvılcım: ışıktan etkilenmez. */
  glow?: boolean;
  /** Yalnız ateşte: 1 normal karışım (alev), 0 ışık gibi eklenir (patlama parlaması). */
  opaque?: number;
  /** Ömrün hangi oranında belirir / sönmeye başlar. */
  fadeIn?: number;
  fadeOut?: number;
  /** Yumuşak yuvarlak doku (parlama); yoksa topak topak duman. */
  soft?: boolean;
}

/** Kare kenarı (birim boy başına): yumuşak doku karenin ~%75'ini kaplar, eski ponponla aynı görünen boy. */
const QUAD = 2.6;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Color();
const _z = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _v = new THREE.Vector3();

/**
 * Örnekli ağın yalnız kullanılan kısmını yükle (kare başına). Eskiden her karede bütün kapasite yükleniyordu
 * (ponpon ve iz mermisi 5.000 örnek × 16 sayı); boşken hiç yükleme yok (WebGL 2'de boş aralık dizinin sonuna kadar
 * demek).
 */
function markUsed(m: THREE.InstancedMesh, n: number): void {
  if (n === 0) return;
  const im = m.instanceMatrix;
  im.clearUpdateRanges();
  im.addUpdateRange(0, n * 16);
  im.needsUpdate = true;
  const ic = m.instanceColor;
  if (ic) {
    ic.clearUpdateRanges();
    ic.addUpdateRange(0, n * 3);
    ic.needsUpdate = true;
  }
}

/** Basit değer gürültüsü (doku üretimi için, tohumlu). */
function valueNoise(seed: number, cells: number): (u: number, v: number) => number {
  const g: number[] = [];
  let s = seed;
  for (let i = 0; i < (cells + 1) * (cells + 1); i++) {
    s = (s * 16807) % 2147483647;
    g.push(s / 2147483647);
  }
  const at = (x: number, y: number) => g[y * (cells + 1) + x];
  return (u, v) => {
    const x = Math.min(Math.max(u, 0), 0.9999) * cells;
    const y = Math.min(Math.max(v, 0), 0.9999) * cells;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
}

let atlas: THREE.Texture | null = null;

/**
 * Parçacık dokusu: 2×2 hücre. Üçü topak topak duman (iç içe yumuşak lekeler, ince gürültü), dördüncüsü yumuşak
 * yuvarlak (parlama). Renk beyaz (ton örnek renginden gelir), saydamlık hücre kenarında sıfır. Bulutlar da kullanır.
 */
export function puffTexture(): THREE.Texture {
  atlas ??= puffAtlas();
  return atlas;
}

function puffAtlas(): THREE.Texture {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N * 2;
  cv.height = N * 2;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(N * 2, N * 2);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let cell = 0; cell < 4; cell++) {
    // Doku dikey çevrilir: uv'de (c % 2, ⌊c / 2⌋) hücresi tuvalde alttan yukarı
    const ox = (cell % 2) * N;
    const oy = (1 - Math.floor(cell / 2)) * N;
    const blobs: { x: number; y: number; r: number }[] = [];
    if (cell < 3) {
      blobs.push({ x: (rnd() - 0.5) * 0.1, y: (rnd() - 0.5) * 0.1, r: 0.42 });
      for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 0.18 + rnd() * 0.24;
        blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.16 + rnd() * 0.14 });
      }
    }
    const n1 = valueNoise(37 + cell * 101, 6);
    const n2 = valueNoise(91 + cell * 57, 14);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = ((x + 0.5) / N) * 2 - 1;
        const v = ((y + 0.5) / N) * 2 - 1;
        const r = Math.hypot(u, v);
        let a: number;
        let shade = 1;
        if (cell === 3) a = Math.exp(-r * r * 4.5);
        else {
          let sum = 0;
          for (const b of blobs) sum += Math.exp(-(((u - b.x) ** 2 + (v - b.y) ** 2) / (b.r * b.r)) * 2.2);
          const n = 0.6 * n1((u + 1) / 2, (v + 1) / 2) + 0.4 * n2((u + 1) / 2, (v + 1) / 2);
          a = (1 - Math.exp(-sum * 2.6)) * (0.7 + 0.3 * n);
          // Lekelerin iç kısımları biraz koyu: topak topak hacim
          shade = 0.78 + 0.22 * n;
        }
        a *= 1 - smoothstep(0.8, 1, r);
        const i = ((oy + y) * N * 2 + ox + x) * 4;
        const c = Math.round(255 * shade);
        img.data[i] = c;
        img.data[i + 1] = c;
        img.data[i + 2] = c;
        img.data[i + 3] = Math.round(255 * Math.min(1, a));
      }
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Kameraya dönük kare; köşe normalleri dışa açık (küre gibi gölgelensin). */
export function puffQuad(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(QUAD, QUAD);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i) / (QUAD / 2), p.getY(i) / (QUAD / 2), 0.6).normalize();
    n.setXYZ(i, _v.x, _v.y, _v.z);
  }
  return g;
}

/**
 * Parçacık malzemesinin gölgelendirici eki: örnek başına opaklık (fx.x), karışım (fx.y), doku hücresi (fx.z) ve
 * zemin yüksekliği (fx.w). Karenin zemine yakın kısmı saydamlaşır: yere değen duman düz bir çizgiyle kesilmez
 * (derinlik dokusu gerektiren yumuşak parçacığın ucuz karşılığı; arazi parçacık boyunda düz sayılır).
 * Işıklı katmanda gölgede kalan yüz de rengini kısmen gösterir (ışık dumanın içinden geçer). Işıksız katmanda renk
 * önceden çarpılmış saydamlıkla karışır: fx.y = 1 normal, 0 eklemeli (eklemeli kısım sisle söner, sis rengine dönmez).
 */
function fxShader(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }, lit: boolean): void {
  linkAtmosphere(shader);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 fx;\nvarying vec3 vFx;')
    .replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\nvMapUv = vMapUv * 0.5 + vec2( mod( fx.z, 2.0 ), floor( fx.z * 0.5 ) ) * 0.5;',
    )
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      float fxY = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).y;
      vFx = vec3( fx.xy, ( fxY - fx.w ) / max( 0.6 * length( instanceMatrix[ 0 ].xyz ), 0.01 ) );`,
    );
  let fs = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFx;')
    .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFx.x * smoothstep( 0.0, 1.0, vFx.z );');
  if (lit) {
    // Gök ışığının katı (gece kararır; sabit eklenince karanlıkta parlıyordu)
    fs = fs.replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= 2.4;\n#include <aomap_fragment>');
  } else {
    fs = fs.replace(
      '#include <premultiplied_alpha_fragment>',
      `#include <premultiplied_alpha_fragment>
      #ifdef USE_FOG
        gl_FragColor.rgb *= 1.0 - fogFactor * ( 1.0 - vFx.y );
      #endif
      gl_FragColor.a *= vFx.y;`,
    );
  }
  shader.fragmentShader = fs;
}

/** Parçacık katmanı: tek InstancedMesh; ömrü dolan parçacık düşer. */
class PuffLayer {
  readonly mesh: THREE.InstancedMesh;
  readonly puffs: Puff[] = [];
  /** Kalite ayarının üst sınırı (kapasiteden küçük olabilir). */
  limit: number;
  private readonly fx: THREE.InstancedBufferAttribute;

  constructor(material: THREE.Material, readonly max: number) {
    this.limit = max;
    const geo = puffQuad();
    this.fx = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('fx', this.fx);
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }

  clear(): void {
    this.puffs.length = 0;
    this.mesh.count = 0;
  }

  update(dt: number, cam: THREE.Camera): void {
    const list = this.puffs;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      // Hava sürtünmesi durgun havaya değil rüzgâra göre: parçacık yavaşlarken rüzgârla sürüklenir. Rüzgâr yerden
      // yükseldikçe güçlenir (dipte zayıf, ~300 m'de üç katı): duman sütunu tepede bükülür
      const k = Math.exp(-p.drag * dt);
      const shear = Math.min(3, 0.6 + (p.pos.y - p.ground) / 120);
      p.vel.x = WIND.x * shear + (p.vel.x - WIND.x * shear) * k;
      p.vel.y = p.vel.y * k + p.rise * dt;
      p.vel.z = WIND.z * shear + (p.vel.z - WIND.z * shear) * k;
      p.pos.addScaledVector(p.vel, dt);
      list[w++] = p;
    }
    list.length = w;
    const cp = cam.position;
    const fx = this.fx.array as Float32Array;
    for (let i = 0; i < w; i++) {
      const p = list[i];
      const t = p.age / p.life;
      const fi = p.fadeIn > 0 ? smoothstep(0, p.fadeIn, t) : 1;
      // Hızla şişer, sonra genişleyerek söner (eski ponpon küçülerek kayboluyordu)
      const sc = p.size * (0.45 + 0.55 * fi) * (1 + t * p.grow);
      _d.subVectors(cp, p.pos);
      const dist = _d.length();
      _p.copy(p.pos).addScaledVector(_d, Math.min(sc * 0.9, dist * 0.5) / Math.max(dist, 1e-3));
      _qz.setFromAxisAngle(_z, p.rot + p.spin * p.age);
      _q.copy(cam.quaternion).multiply(_qz);
      _s.setScalar(sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, p.end ? _c.copy(p.color).lerp(p.end, Math.pow(t, 0.6)) : p.color);
      fx[i * 4] = p.alpha * fi * (1 - smoothstep(p.fadeOut, 1, t)) * smoothstep(sc * 0.4, sc * 1.6, dist);
      fx[i * 4 + 1] = p.opaque;
      fx[i * 4 + 2] = p.shape;
      fx[i * 4 + 3] = p.ground;
    }
    this.mesh.count = w;
    markUsed(this.mesh, w);
    if (w > 0) {
      this.fx.clearUpdateRanges();
      this.fx.addUpdateRange(0, w * 4);
      this.fx.needsUpdate = true;
    }
  }
}

export class Effects {
  /** Duman ve toz (ışıkla gölgelenir) ile ateş ve parlamalar (ışıktan etkilenmez) birlikte. */
  readonly mesh = new THREE.Group();
  private readonly lit: PuffLayer;
  private readonly glow: PuffLayer;

  constructor(max = 5000) {
    const atlas = puffTexture();
    const litMat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, depthWrite: false });
    litMat.onBeforeCompile = (s) => fxShader(s, true);
    litMat.customProgramCacheKey = () => 'fx-lit';
    const glowMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, premultipliedAlpha: true });
    glowMat.onBeforeCompile = (s) => fxShader(s, false);
    glowMat.customProgramCacheKey = () => 'fx-glow';
    this.lit = new PuffLayer(litMat, max);
    this.glow = new PuffLayer(glowMat, 1600);
    // Saydamlar arasında: yoğuşma izinden sonra duman, en son ateş (dumanın içinden parlar)
    this.lit.mesh.renderOrder = 3;
    this.glow.mesh.renderOrder = 4;
    this.mesh.add(this.lit.mesh, this.glow.mesh);
  }

  /** Grafik kalitesi: aynı anda en çok kaç duman parçacığı (ateş ve parlamalar orantılı). */
  setLimit(n: number): void {
    this.lit.limit = Math.min(this.lit.max, n);
    this.glow.limit = Math.min(this.glow.max, Math.round(n * 0.32));
  }

  clear(): void {
    this.lit.clear();
    this.glow.clear();
  }

  spawn(pos: THREE.Vector3, o: PuffOpts): void {
    const layer = o.glow ? this.glow : this.lit;
    if (layer.puffs.length >= layer.limit) return;
    layer.puffs.push({
      pos: pos.clone(),
      vel: o.vel ? o.vel.clone() : new THREE.Vector3(),
      age: 0,
      life: o.life,
      size: o.size,
      grow: o.grow ?? 1,
      drag: o.drag ?? 1.5,
      rise: o.rise ?? 0,
      color: new THREE.Color(o.color).multiplyScalar((o.bright ?? 1) * (1 + rand(-1, 1) * (o.tint ?? 0))),
      end: o.end !== undefined ? new THREE.Color(o.end) : null,
      alpha: o.alpha ?? (o.glow ? 1 : 0.85),
      opaque: o.opaque ?? 0.8,
      fadeIn: o.fadeIn ?? 0.08,
      fadeOut: o.fadeOut ?? (o.glow ? 0.25 : 0.4),
      shape: o.soft ? 3 : Math.floor(Math.random() * 3),
      rot: Math.random() * Math.PI * 2,
      spin: rand(-0.4, 0.4),
      ground: groundLevel(pos.x, pos.z),
    });
  }

  update(dt: number, cam: THREE.Camera): void {
    this.lit.update(dt, cam);
    this.glow.update(dt, cam);
  }

  // --- Hazır efektler -------------------------------------------------------

  /** Havada infilak: parlama, sıcaktan kora dönen ateş topu ve arkasından kara duman bulutu. */
  airExplosion(pos: THREE.Vector3, vis: number, size = 6): void {
    const k = Math.max(1, size / 6);
    const s = Math.max(vis, 1);
    this.spawn(pos, {
      size: 8 * k + 3 * s, life: 0.28, color: PALETTE.fire[0], bright: 1.6, glow: true, opaque: 0, soft: true, grow: 0.6,
      fadeIn: 0, fadeOut: 0.1,
    });
    for (let i = 0; i < 12; i++) {
      this.spawn(pos, {
        vel: randDir().multiplyScalar(rand(8, 22) * k + rand(2, 6) * s),
        size: rand(2.5, 4.5) * k + rand(1, 2.5) * s, life: rand(0.5, 1.0),
        color: PALETTE.fire[i % 2], end: PALETTE.fire[2], bright: 1.5, glow: true, grow: 1.2, drag: 2.5, fadeIn: 0.04, fadeOut: 0.3,
      });
    }
    for (let i = 0; i < 12; i++) {
      this.spawn(pos, {
        vel: randDir().multiplyScalar(rand(5, 14) * k + s),
        size: rand(2.5, 5) * k + rand(1, 2.5) * s, life: rand(3, 6),
        color: i % 3 ? PALETTE.smokeDark : PALETTE.smoke, grow: 1.5, rise: 1.2, drag: 1.2, alpha: 0.8, fadeIn: 0.12,
      });
    }
  }

  /** Yerde patlama: parlama, ateş topu, yere yayılan toz halkası, fışkırıp geri düşen toprak, yükselen duman. */
  groundExplosion(pos: THREE.Vector3, size: number): void {
    this.spawn(_p.copy(pos).setY(pos.y + size * 0.25), {
      size: size * 0.5, life: 0.12, color: PALETTE.fire[0], bright: 1.6, glow: true, opaque: 0, soft: true, fadeIn: 0, fadeOut: 0.1,
    });
    for (let i = 0; i < 16; i++) {
      const v = randDir();
      v.y = Math.abs(v.y) * 1.6 + 0.15;
      this.spawn(pos, {
        vel: v.multiplyScalar(rand(0.5, 1.5) * size), size: size * rand(0.14, 0.36),
        life: rand(0.4, 0.9), color: PALETTE.fire[i % 3 ? 1 : 0], end: PALETTE.fire[2], bright: 1.5, tint: 0.25, glow: true,
        grow: 1, drag: 3, fadeIn: 0.04, fadeOut: 0.25,
      });
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
      this.spawn(_p.copy(pos).setY(pos.y + size * 0.08), {
        vel: _v.set(Math.cos(a), 0.06, Math.sin(a)).multiplyScalar(rand(1.6, 2.5) * size), size: size * rand(0.16, 0.28),
        life: rand(1.2, 2.4), color: PALETTE.dust, grow: 1.8, drag: 2.2, alpha: 0.75, fadeIn: 0.05,
      });
    }
    for (let i = 0; i < 9; i++) {
      const v = _v.set(rand(-0.3, 0.3), 1, rand(-0.3, 0.3)).normalize();
      this.spawn(pos, {
        vel: v.multiplyScalar(rand(1.4, 2.8) * size), size: size * rand(0.08, 0.16),
        life: rand(0.9, 1.5), color: i % 2 ? PALETTE.smokeDark : PALETTE.dust, grow: 1.1, drag: 1.4, rise: -size * 0.9,
        alpha: 0.9, fadeIn: 0.02,
      });
    }
    // Toz ve duman mantarı: geniş başlık hızla yükselir, arkasında ince gövde kalır; toprak rengiyle gri karışık
    for (let i = 0; i < 7; i++) {
      const v = randDir().multiplyScalar(0.3);
      v.y = rand(0.75, 1.15);
      this.spawn(pos, {
        vel: v.multiplyScalar(size), size: size * rand(0.2, 0.32),
        life: rand(5, 8), color: i % 3 ? PALETTE.dustSmoke : PALETTE.smoke, tint: 0.15, grow: 2, rise: 4,
        drag: 1.1, alpha: 0.6, fadeIn: 0.06,
      });
    }
    for (let i = 0; i < 8; i++) {
      const v = randDir().multiplyScalar(0.12);
      v.y = rand(0.12, 0.6);
      this.spawn(pos, {
        vel: v.multiplyScalar(size), size: size * rand(0.1, 0.18),
        life: rand(4, 6), color: i % 2 ? PALETTE.dust : PALETTE.dustSmoke, tint: 0.15, grow: 2.2, rise: 2,
        drag: 1.3, alpha: 0.55, fadeIn: 0.05,
      });
    }
  }

  crash(pos: THREE.Vector3, vis: number): void {
    this.groundExplosion(pos, 10 * Math.min(Math.max(vis, 2), 6));
  }

  /** size: 1 ağır flak, 0.5 orta kalibre kendini imha. Patlayan mermi bir anda kara bir duman topu bırakır. */
  flak(pos: THREE.Vector3, vis: number, size = 1): void {
    const s = Math.min(Math.max(vis, 1), 4) * size;
    this.spawn(pos, { size: 3 * s, life: 0.15, color: PALETTE.fire[0], bright: 1.5, glow: true, opaque: 0.2, soft: true, fadeIn: 0 });
    const n = size >= 1 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      this.spawn(pos.clone().add(randDir().multiplyScalar(2.5 * s)), {
        size: rand(3, 5) * s, life: rand(2.2, 3.2) * (size >= 1 ? 1 : 0.6), color: PALETTE.flak, grow: 0.7, drag: 1,
        alpha: 0.9, fadeIn: 0.02,
      });
    }
  }

  hit(pos: THREE.Vector3, vis: number): void {
    this.spawn(pos, { size: 1.6 * Math.min(vis, 8), life: 0.18, color: 0xfff0b0, bright: 1.4, glow: true, opaque: 0, soft: true, fadeIn: 0 });
  }

  /** Yere düşen mermi: toz ya da su sıçraması. */
  groundHit(pos: THREE.Vector3, vis: number, water: boolean): void {
    const s = Math.min(Math.max(vis, 1), 5);
    this.spawn(pos, {
      vel: new THREE.Vector3(0, rand(2, 5) * s, 0), size: rand(1.2, 2.2) * s, life: rand(0.5, 0.9),
      color: water ? PALETTE.splash : PALETTE.dust, grow: 0.8, drag: 3, alpha: 0.8, fadeIn: 0.05,
    });
  }

  muzzle(pos: THREE.Vector3, vis: number): void {
    this.spawn(pos, { size: 0.9 * Math.min(vis, 6), life: 0.06, color: PALETTE.fire[0], bright: 1.5, glow: true, opaque: 0.3, soft: true, fadeIn: 0 });
  }

  rocketTrail(pos: THREE.Vector3, vis: number): void {
    this.spawn(pos, { size: 1.2 * Math.min(vis, 5), life: 1.2, color: 0xe9e6ea, grow: 1.5, drag: 2, alpha: 0.7 });
  }

  smokeTrail(pos: THREE.Vector3, vis: number, kind: 'burning' | 'damaged' | 'leak'): void {
    if (kind === 'burning') {
      this.spawn(pos, { size: 2.2 * vis, life: 0.35, color: PALETTE.fire[1], end: PALETTE.fire[2], bright: 1.4, glow: true, fadeIn: 0 });
    }
    const leak = kind === 'leak';
    this.spawn(pos, {
      size: (kind === 'burning' ? 2.4 : leak ? 0.9 : 1.8) * vis, life: kind === 'burning' ? 2.6 : leak ? 1.1 : 1.6,
      color: kind === 'burning' ? PALETTE.smokeDark : leak ? 0xeef1f2 : PALETTE.smoke,
      grow: leak ? 2 : 1.4, rise: 0.5 * vis, alpha: kind === 'burning' ? 0.85 : leak ? 0.45 : 0.6, fadeIn: 0.05,
    });
  }

  /**
   * Hasarlı yapının duman sütunu: sıcak duman ~10 m/s yükselir (yüz metreleri bulur), dipte dar, yükseldikçe
   * genişler, rüzgârla yatar; ağır hasarda koyu ve dibinde alev.
   */
  buildingSmoke(pos: THREE.Vector3, heavy: boolean, scale = 1): void {
    // scale (kayıt kipi): ömür ve büyüme çarpanı; sütun yüzlerce metre daha yükselir, tepede rüzgârla yayılır
    this.spawn(pos, {
      vel: new THREE.Vector3(rand(-2, 2), rand(10, 14), rand(-2, 2)),
      // (uzun sütunda ömürler geniş dağılır: tepe düz bir uçla değil, düzensiz ve dağınık biter)
      size: rand(6, heavy ? 10 : 8) * (1 + (scale - 1) * 0.3), life: rand(18, 24) * scale * (scale > 1 ? rand(0.55, 1.35) : 1),
      color: heavy ? PALETTE.smokeDark : PALETTE.smoke, tint: 0.1, grow: (heavy ? 3.2 : 2.6) * scale ** 1.3, rise: 2.5, drag: 0.25,
      alpha: heavy ? 0.85 : 0.65, fadeIn: 0.02, fadeOut: scale > 1 ? 0.15 : undefined,
    });
    if (heavy) {
      this.spawn(_p.copy(pos).setY(pos.y - 9), {
        vel: _v.set(rand(-1, 1), rand(3, 6), rand(-1, 1)), size: rand(6, 11), life: rand(0.8, 1.4),
        color: PALETTE.fire[1], end: PALETTE.fire[2], bright: 1.3, glow: true, grow: 0.5, rise: 2, fadeIn: 0.1, fadeOut: 0.35,
      });
    }
  }
}

function randDir(): THREE.Vector3 {
  const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
  if (v.lengthSq() < 1e-4) v.set(0, 1, 0);
  return v.normalize();
}

/**
 * İz mermisi çizgisi: gölgelendiricide kameraya dönük şerit. Örnek matrisinde yalnız merminin yeri (öteleme) ve
 * uçuş yönü (z sütunu) var; şeridin eni ve boyu derinlikten hesaplanır: yakında gerçek ölçüde ince (~10 cm parıltı,
 * bir karede aldığı yol kadar uzun), uzakta en az ~2 piksel en ve ~12 piksel boy (strateji görünümünde de seçilir).
 * Kesit yumuşak: ortası beyaza yakın sıcak çekirdek, kenarı renkli hale; baş yuvarlak, kuyruk söner. Karışım yarı
 * eklemeli: parlak gökte de görünür, sisle eklemeli kısım söner.
 */
function tracerShader(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }, u: Record<string, THREE.IUniform>): void {
  linkAtmosphere(shader);
  Object.assign(shader.uniforms, u);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec2 trPx;\nvarying vec4 vTr;')
    .replace(
      '#include <project_vertex>',
      /* glsl */ `
      vec4 hv = viewMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 );
      vec3 dv = normalize( mat3( viewMatrix ) * instanceMatrix[ 2 ].xyz );
      float depth = max( - hv.z, 0.5 );
      // Bu derinlikte bir pikselin metre karşılığı
      float pxm = trPx.x * depth;
      float w = max( 0.1, pxm * 2.2 ) * trPx.y;
      float len = max( 14.0, pxm * 12.0 ) * ( 0.5 + 0.5 * trPx.y );
      vec3 side = cross( dv, normalize( hv.xyz ) );
      float sl = length( side );
      side = sl > 1e-3 ? side / sl : vec3( 1.0, 0.0, 0.0 );
      // Kameraya çok yakın geçen mermi ekranı kaplamasın; çok uzaktaki soluklaşır. w: gerçek en / çizilen en (en
      // piksel sınırına dayanınca kesit dolu çizilir, yoksa 2 piksellik çizgide yumuşak kenar ortayı söndürür)
      vTr = vec4( position.x * 2.0, position.y, smoothstep( 2.0, 8.0, depth ) * ( 1.0 - 0.6 * smoothstep( 6000.0, 14000.0, depth ) ),
        clamp( 0.1 * trPx.y / w, 0.0, 1.0 ) );
      vec4 mvPosition = vec4( hv.xyz - dv * len * position.y + side * w * position.x, 1.0 );
      gl_Position = projectionMatrix * mvPosition;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec4 vTr;')
    .replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      float trX = abs( vTr.x );
      float trEdge = 1.0 - smoothstep( 0.6, 1.0, trX );
      float trCore = mix( trEdge * 0.4, exp( - trX * trX * 14.0 ), vTr.w );
      float trHalo = mix( trEdge, exp( - trX * trX * 3.5 ) * trEdge, vTr.w );
      float trHead = smoothstep( 0.0, 0.03, vTr.y );
      float trTail = pow( 1.0 - vTr.y, 1.4 );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.96, 0.86 ), trCore * 0.75 ) * 2.2;
      diffuseColor.a = ( 0.45 * trHalo + 0.55 * trCore ) * trHead * trTail * vTr.z;`,
    )
    .replace(
      '#include <premultiplied_alpha_fragment>',
      `#include <premultiplied_alpha_fragment>
      #ifdef USE_FOG
        gl_FragColor.rgb *= 1.0 - fogFactor * 0.5;
      #endif
      gl_FragColor.a *= 0.5;`,
    );
}

/**
 * İz mermileri: her mermi kameraya dönük parlak bir çizgi (tek InstancedMesh, şerit gölgelendiricide kurulur).
 * Takım renginde hafif ton farkı.
 */
export class Tracers {
  readonly mesh: THREE.InstancedMesh;
  private readonly colors = PALETTE.tracer.map((c) => new THREE.Color(c));
  private readonly aaColor = new THREE.Color(0xffc27a);
  private readonly u = { trPx: { value: new THREE.Vector2(0.002, 1) } };

  constructor(private readonly max = 5000) {
    // x: −0,5..0,5 en, y: 0 (baş, merminin yeri) .. 1 (kuyruk)
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => tracerShader(s, this.u);
    mat.customProgramCacheKey = () => 'tracer';
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    // Dumandan sonra: duman derinlik yazmaz, önce çizilen iz mermisinin üstünü örterdi
    this.mesh.renderOrder = 5;
  }

  /** scale: ayarlardaki iz kalınlığı; viewH: ekran yüksekliği (CSS piksel). */
  update(bullets: Bullet[], scale: number, cam: THREE.PerspectiveCamera, viewH: number): void {
    const n = Math.min(bullets.length, this.max);
    this.u.trPx.value.set((2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(viewH, 1), scale);
    const a = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const b = bullets[i];
      _dir.copy(b.vel).normalize();
      const o = i * 16;
      a.fill(0, o, o + 16);
      a[o + 8] = _dir.x;
      a[o + 9] = _dir.y;
      a[o + 10] = _dir.z;
      a[o + 12] = b.pos.x;
      a[o + 13] = b.pos.y;
      a[o + 14] = b.pos.z;
      a[o + 15] = 1;
      this.mesh.setColorAt(i, b.ownerId < 0 ? this.aaColor : this.colors[b.team] ?? this.colors[0]);
    }
    this.mesh.count = n;
    markUsed(this.mesh, n);
  }
}

/** Roketler: küçük gövde + duman izi. */
export class RocketViews {
  readonly mesh: THREE.InstancedMesh;

  constructor(private readonly max = 400) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.8, 6).rotateX(Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: PALETTE.bomb, flatShading: true }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  update(rockets: Rocket[], vis: number, effects: Effects, emit: boolean): void {
    const n = Math.min(rockets.length, this.max);
    for (let i = 0; i < n; i++) {
      const r = rockets[i];
      _dir.copy(r.vel).normalize();
      _q.setFromUnitVectors(_z, _dir);
      const sc = Math.min(Math.max(vis, 1), 12);
      _s.set(sc, sc, sc);
      _m.compose(r.pos, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      if (emit) effects.rocketTrail(r.pos, vis);
    }
    this.mesh.count = n;
    markUsed(this.mesh, n);
  }
}

interface DebrisPiece {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: THREE.Vector3;
  burning: boolean;
  smoke: number;
  age: number;
}

/** Enkaz: infilak eden ya da parçalanan uçaktan kopan, dönerek düşen parçalar (görsel). */
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private pieces: DebrisPiece[] = [];

  constructor(private readonly max = 600) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x77727c, flatShading: true }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  clear(): void {
    this.pieces.length = 0;
    this.mesh.count = 0;
  }

  /** count parça; size ≈ parça boyu (m). count = 1 ise kanat gibi uzun yassı parça. */
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, count: number, size: number, burning: boolean): void {
    for (let i = 0; i < count && this.pieces.length < this.max; i++) {
      const wingPiece = count === 1;
      const v = vel.clone().add(randDir().multiplyScalar(rand(5, 22)));
      const s = wingPiece ? new THREE.Vector3(size, 0.25, size * 0.35) : new THREE.Vector3(rand(0.5, 1.3), rand(0.2, 0.6), rand(0.5, 1.5)).multiplyScalar(size);
      this.pieces.push({
        pos: pos.clone().add(randDir().multiplyScalar(size * 0.3)), vel: v, rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
        spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), size: s, burning: burning && (wingPiece || Math.random() < 0.6),
        smoke: Math.random() * 0.1, age: 0,
      });
    }
  }

  update(dt: number, effects: Effects, emit: boolean, scale: number): void {
    let w = 0;
    for (const p of this.pieces) {
      p.age += dt;
      // Parçalar hızla yavaşlar (yüksek sürükleme), sonra düşer
      p.vel.multiplyScalar(Math.exp(-0.5 * dt));
      p.vel.y -= G * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      if (emit && p.burning) {
        p.smoke -= dt;
        if (p.smoke <= 0) {
          p.smoke = 0.12;
          effects.smokeTrail(p.pos, Math.min(scale, 6) * 0.7, p.age < 6 ? 'burning' : 'damaged');
        }
      }
      if (p.pos.y <= groundLevel(p.pos.x, p.pos.z) || p.age > 90) {
        if (emit) effects.groundHit(p.pos, Math.min(scale, 4), false);
        continue;
      }
      this.pieces[w++] = p;
    }
    this.pieces.length = w;
    const k = Math.min(Math.max(scale, 1), 6);
    for (let i = 0; i < w; i++) {
      const p = this.pieces[i];
      _q.setFromEuler(p.rot);
      _s.copy(p.size).multiplyScalar(k);
      _m.compose(p.pos, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = w;
    markUsed(this.mesh, w);
  }
}

/** Paraşütler: beyaz kubbe ve altında küçük asılı pilot. */
export class ParachuteViews {
  readonly group = new THREE.Group();
  private readonly canopy: THREE.InstancedMesh;
  private readonly pilot: THREE.InstancedMesh;

  constructor(private readonly max = 120) {
    this.canopy = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1),
      new THREE.MeshLambertMaterial({ color: 0xf6f3ec, flatShading: true, side: THREE.DoubleSide }),
      max,
    );
    this.pilot = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.6, 0.4), new THREE.MeshLambertMaterial({ color: 0x6b6570 }), max);
    for (const m of [this.canopy, this.pilot]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
  }

  update(list: Parachute[], scale: number): void {
    const k = Math.min(Math.max(scale, 1), 10);
    let n = 0;
    for (const p of list) {
      if (n >= this.max || p.t < 0) continue;
      const open = Math.min(1, Math.max(0, (p.t - 2) / 1.2));
      _q.identity();
      _s.setScalar(4.2 * k * Math.max(open, 0.05));
      _p.copy(p.pos).setY(p.pos.y + 5.5 * k);
      _m.compose(_p, _q, _s);
      this.canopy.setMatrixAt(n, _m);
      _s.setScalar(k);
      _m.compose(p.pos, _q, _s);
      this.pilot.setMatrixAt(n, _m);
      n++;
    }
    this.canopy.count = n;
    this.pilot.count = n;
    markUsed(this.canopy, n);
    markUsed(this.pilot, n);
  }
}
