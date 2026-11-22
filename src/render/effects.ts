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
//
// Gerçekçilik (2026-11-21):
// - Duman izi mesafeyle atılır (`trail`): kaynağın son bıraktığı yerden bu yere eşit aralıkla, topaklar üst üste biner,
//   kesintisiz şerit olur. Eskiden saniyede 10 topak atılıyordu: 100 m/sn'de 10 m arayla boncuk dizisi gibiydi. Aralık
//   topak boyuyla orantılı: uzaktan bakışta (büyük topak) seyrek, toplam sayı aynı sınırda.
// - Parçacık hız ya da verilen yön doğrultusunda uzayabilir (`stretch`): alev dili rüzgârla geriye uzanır, kıvılcım çizgi.
// - Renk saniyeyle soğuyabilir (`cool`): ateşin aydınlattığı kahverengi duman bir saniyede griye döner.
// - Yanan alev beyaz çekirdekten turuncuya, kora; arkasındaki dumanın içinde soluk turuncu parıltı.
// - Havada infilak evreli: flaş, ateş topu, kıvılcım çizgileri, ateşin aydınlattığı ve yarım dakika asılı kalan bulut.
// - Flak bulutu 20 sn'ye kadar asılı kalır, yavaş genişler, rüzgârla kayar ("flak dolu gök").
// - Düşen uçak yerde 30–60 sn yanar: dipte alev, rüzgârla yatan duman sütunu (`burns`).
// - Kalıcılık kaliteye bağlı (`persist`): Düşükte bulutlar ve yangınlar kısa sürer, parçacık sınırı yeni efekte yer bıraksın.

import * as THREE from 'three';
import type { Bullet, Parachute, Rocket } from '../sim/world';
import { PALETTE } from './palette';
import { groundLevel, terrainHeight } from '../sim/terrain';
import { G, rand, smoothstep } from '../core/math';
import { WIND, linkAtmosphere } from './atmosphere';
import { canopyGeometry, jumperGeometry, rocketGeometry } from './munitions';

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
  /** Uzama (1 yuvarlak): kare `dir` (yoksa hız) doğrultusunda bu kat uzun çizilir. */
  stretch: number;
  dir: THREE.Vector3 | null;
  /** Renk ömür yerine bu kadar saniyede sona döner (0: ömür boyunca). */
  cool: number;
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
  /** Uzama katı: alev dili ve kıvılcım çizgisi. Yön `dir`, yoksa parçacığın o anki hızı (yerçekimiyle eğilen çizgi). */
  stretch?: number;
  dir?: THREE.Vector3;
  /** Renk sona kaç saniyede döner (ateşin aydınlattığı dumanın griye dönmesi); yoksa ömür boyunca. */
  cool?: number;
}

/**
 * Kesintisiz iz türleri: topak boyu (efekt büyütmesi başına) ve topaklar arası aralık (boyun katı). Topak doğduktan
 * ~0,1 sn sonra boyunun iki katı çapında, sonra büyür: boy kadar aralık şeridi kesintisiz tutar. (Yarım boy aralık
 * yoğun savaşta parçacığı yedi katına çıkarıyordu: telefon benzetiminde Ortada kare başına +6 ms.)
 */
export type TrailKind = 'burning' | 'damaged' | 'leak' | 'rocket';
const TRAIL: Record<TrailKind, { size: number; gap: number }> = {
  burning: { size: 2.4, gap: 1.1 },
  damaged: { size: 1.8, gap: 1.2 },
  leak: { size: 0.9, gap: 1.0 },
  rocket: { size: 1.2, gap: 1.2 },
};
/** Bir çağrıda en çok kaç iz topağı (düşük kare hızında aralık açılır, sayı patlamaz). */
const TRAIL_MAX = 6;

interface TrailSlot {
  p: THREE.Vector3;
  t: number;
}

/** Yerde yanan enkaz. */
interface Burn {
  pos: THREE.Vector3;
  age: number;
  life: number;
  /** Sonraki alev ve duman topağına kalan süre. */
  fire: number;
  smoke: number;
}
/** Aynı anda en çok kaç enkaz yangını (eskisi söner). */
const BURN_MAX = 14;

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
const _qi = new THREE.Quaternion();
const _tv = new THREE.Vector3();
const _tp = new THREE.Vector3();
const _fb = new THREE.Vector3();
const _fp = new THREE.Vector3();
const _bp = new THREE.Vector3();
const _bv = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

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
    _qi.copy(cam.quaternion).invert();
    for (let i = 0; i < w; i++) {
      const p = list[i];
      const t = p.age / p.life;
      const fi = p.fadeIn > 0 ? smoothstep(0, p.fadeIn, t) : 1;
      // Hızla şişer, sonra genişleyerek söner (eski ponpon küçülerek kayboluyordu)
      const sc = p.size * (0.45 + 0.55 * fi) * (1 + t * p.grow);
      _d.subVectors(cp, p.pos);
      const dist = _d.length();
      _p.copy(p.pos).addScaledVector(_d, Math.min(sc * 0.9, dist * 0.5) / Math.max(dist, 1e-3));
      let ang = p.rot + p.spin * p.age;
      let sx = sc;
      if (p.stretch > 1) {
        // Uzayan parçacık: kare, doğrultunun ekrandaki izdüşümüne döner; doğrultu bakış eksenine yaklaştıkça kısalır
        const dv = p.dir ?? p.vel;
        const n = dv.length();
        if (n > 1e-4) {
          _dir.copy(dv).applyQuaternion(_qi);
          const l = Math.hypot(_dir.x, _dir.y) / n;
          if (l > 1e-3) {
            ang = Math.atan2(_dir.y, _dir.x);
            sx = sc * (1 + (p.stretch - 1) * l);
          }
        }
      }
      _qz.setFromAxisAngle(_z, ang);
      _q.copy(cam.quaternion).multiply(_qz);
      _s.set(sx, sc, sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      const tc = p.cool > 0 ? Math.min(1, p.age / p.cool) : t;
      this.mesh.setColorAt(i, p.end ? _c.copy(p.color).lerp(p.end, Math.pow(tc, 0.6)) : p.color);
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
  /** İz kaynaklarının son topak yeri (kaynak silinince kendiliğinden düşer). */
  private readonly trails = new WeakMap<object, (TrailSlot | undefined)[]>();
  /** Efekt saati (oyun saatiyle akar; duraklatınca durur). */
  private clock = 0;
  private burns: Burn[] = [];
  /** Uzun süren bulut ve yangınların süre katı (kaliteye bağlı: Yüksek 1, Orta 0,7, Düşük 0,4). */
  private persist = 1;

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
    this.persist = n >= 4000 ? 1 : n >= 2000 ? 0.7 : 0.4;
  }

  clear(): void {
    this.lit.clear();
    this.glow.clear();
    this.burns.length = 0;
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
      stretch: o.stretch ?? 1,
      dir: o.dir ? o.dir.clone() : null,
      cool: o.cool ?? 0,
    });
  }

  /**
   * emit: efektler açık ve oyun akıyor (yerdeki yangınlar yeni topak atar). vis: efekt büyütmesi (kamera uzaklığı;
   * yangının alevi ve sütunu uzaktan da seçilsin).
   */
  update(dt: number, cam: THREE.Camera, emit = true, vis = 1): void {
    this.clock += dt;
    if (emit) this.updateBurns(dt, vis);
    this.lit.update(dt, cam);
    this.glow.update(dt, cam);
  }

  // --- Kesintisiz iz ----------------------------------------------------------

  /**
   * Kaynağın (nesne + yuva: uçağın motoru, düşen parça, roket) izi: son bıraktığı yerden bu yere eşit aralıkla topak.
   * Her karede çağrılır. vel: kaynağın hızı (alev dili ondan geriye uzanır, duman biraz sürüklenir).
   */
  trail(src: object, slot: number, pos: THREE.Vector3, vis: number, kind: TrailKind, vel?: THREE.Vector3): void {
    if (kind === 'burning') this.flame(pos, vis, vel);
    let slots = this.trails.get(src);
    if (!slots) this.trails.set(src, (slots = []));
    const st = slots[slot];
    // Düşük ve Orta kalitede aralık biraz açılır (topak daha az, şerit yine kesintisiz)
    const gap = Math.max(0.3, TRAIL[kind].size * vis * TRAIL[kind].gap * (this.persist >= 1 ? 1 : this.persist >= 0.7 ? 1.2 : 1.4));
    // İlk topak, uzun aradan (duraklatma değil: oyun durunca saat de durur) ya da sıçramadan sonra baştan başla
    if (!st || this.clock - st.t > 0.5 || st.p.distanceToSquared(pos) > (gap * 40) ** 2) {
      slots[slot] = { p: pos.clone(), t: this.clock };
      this.smokePuff(pos, vis, kind, vel);
      return;
    }
    const d = st.p.distanceTo(pos);
    let n = Math.floor(d / gap);
    if (n < 1) {
      // Yavaş kaynak (yaprak gibi süzülen parça) yine de ara sıra topak bırakır
      if (this.clock - st.t > 0.25) {
        st.p.copy(pos);
        st.t = this.clock;
        this.smokePuff(pos, vis, kind, vel);
      }
      return;
    }
    const capped = n > TRAIL_MAX;
    if (capped) n = TRAIL_MAX;
    const step = capped ? d / n : gap;
    _tv.subVectors(pos, st.p).divideScalar(d);
    for (let i = 1; i <= n; i++) this.smokePuff(_tp.copy(st.p).addScaledVector(_tv, step * i), vis, kind, vel);
    if (capped) st.p.copy(pos);
    else st.p.addScaledVector(_tv, step * n);
    st.t = this.clock;
  }

  /** İzin tek topağı. Yanan izin dumanı ateşin aydınlattığı kahverengiden bir saniyede koyu griye döner. */
  private smokePuff(pos: THREE.Vector3, vis: number, kind: TrailKind, vel?: THREE.Vector3): void {
    const burn = kind === 'burning';
    const leak = kind === 'leak';
    const rocket = kind === 'rocket';
    const size = TRAIL[kind].size * vis;
    // Yer ve boy oynar: şerit düz bir boru değil, kenarları kabaran duman
    _bp.copy(pos).addScaledVector(randDir(), size * rand(0, 0.3));
    this.spawn(_bp, {
      // Uçağın arkasındaki hava akımı dumanı bir an sürükler, sonra durgun havada kalır
      vel: vel ? _v.copy(vel).multiplyScalar(0.2) : undefined,
      size: size * rand(0.7, 1.3),
      life: burn ? rand(2.8, 3.6) : leak ? 1.2 : rocket ? 1.6 : rand(1.8, 2.2),
      color: burn ? 0x735442 : leak ? 0xeef1f2 : rocket ? 0xe9e6ea : PALETTE.smoke,
      end: burn ? PALETTE.smokeDark : undefined,
      cool: burn ? 0.9 : 0,
      tint: 0.08,
      grow: burn ? 1.9 : leak ? 2.2 : rocket ? 1.8 : 1.6,
      drag: vel ? 2.5 : 1.5,
      rise: 0.5 * vis,
      // Topaklar üst üste bindiği için tek tek biraz daha saydam (eskiden 0,85 / 0,6 / 0,45; aralıklıydı)
      alpha: burn ? 0.65 : leak ? 0.35 : rocket ? 0.6 : 0.5,
      fadeIn: 0.04,
    });
  }

  /**
   * Yanan kaynağın alevi (her karede): dipte küçük, beyaza yakın çekirdek; hava akımıyla geriye uzanan, yana savrulan
   * iki dil (biri sarı, biri turuncu; boyları ve saydamlıkları her karede oynar: düzgün bir egzoz alevi değil, yırtık
   * ve titreyen yangın); ucunda dumanın içini aydınlatan soluk parıltı. Hızı olmayan kaynakta alev yukarı uzanır.
   */
  private flame(pos: THREE.Vector3, vis: number, vel?: THREE.Vector3): void {
    const speed = vel ? vel.length() : 0;
    const back = speed > 1 ? _fb.copy(vel!).divideScalar(-speed) : _fb.copy(_up);
    const s = vis;
    const L = Math.min(2 + speed * 0.05, 7) * vis;
    this.spawn(_fp.copy(pos).addScaledVector(back, L * 0.08), {
      vel, size: 0.35 * s * rand(0.8, 1.2), life: 0.06, color: PALETTE.fire[0], bright: 1.6, glow: true, opaque: 0.3, soft: true,
      stretch: 1.5, dir: back, drag: 4, fadeIn: 0,
    });
    for (let j = 0; j < 2; j++) {
      _fp.copy(pos).addScaledVector(back, L * rand(0.2, 0.7)).addScaledVector(randDir(), 0.3 * s);
      this.spawn(_fp, {
        vel, size: rand(0.45, 0.8) * s, life: rand(0.12, 0.22), color: j ? PALETTE.fire[1] : 0xffc46b, end: PALETTE.fire[2],
        bright: 1.35, tint: 0.15, glow: true, opaque: 0.7, alpha: rand(0.6, 0.9), stretch: rand(1.8, 3), dir: back, drag: 4,
        fadeIn: 0, fadeOut: 0.4,
      });
    }
    if (Math.random() < 0.5) {
      this.spawn(_fp.copy(pos).addScaledVector(back, L * 0.8), {
        vel, size: 1.4 * s, life: 0.5, color: PALETTE.fire[1], end: PALETTE.fire[2], bright: 1.1, glow: true, opaque: 0,
        soft: true, alpha: 0.3, drag: 3, fadeIn: 0.1, fadeOut: 0.3,
      });
    }
  }

  // --- Yerde yanan enkaz -----------------------------------------------------

  /** Enkaz yangını başlat (düşen uçağın ya da gövde parçasının yere çarptığı yer; suda yanmaz). */
  burn(pos: THREE.Vector3): void {
    if (terrainHeight(pos.x, pos.z) < 0) return;
    if (this.burns.length >= BURN_MAX) this.burns.shift();
    this.burns.push({ pos: pos.clone(), age: 0, life: rand(30, 60) * Math.max(0.5, this.persist), fire: 0, smoke: 0 });
  }

  /**
   * Yangınlar: dipte yükselip kora dönen alev dilleri, üstünde rüzgârla yatan duman sütunu (sıcak duman ~10 m/sn
   * yükselir, yapı dumanı gibi 200 m'yi bulur). Son %45'inde söner: alevler küçülür, duman açılıp incelir.
   */
  private updateBurns(dt: number, vis: number): void {
    if (dt <= 0) return;
    const rate = Math.max(0.5, this.persist);
    // Uzaktan bakışta büyür (yakında gerçek boy; 2,5 km'de ~2,3 kat, en çok 4 kat)
    const g = Math.min(Math.max(Math.sqrt(vis), 1), 4);
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.age += dt;
      if (b.age >= b.life) {
        this.burns.splice(i, 1);
        continue;
      }
      const k = 1 - smoothstep(0.55, 1, b.age / b.life);
      b.fire -= dt;
      b.smoke -= dt;
      if (b.fire <= 0) {
        b.fire = rand(0.06, 0.12) / rate;
        // Başta 5–10 m'lik alevler (yakıt), sönerken küçülür
        _bp.set(b.pos.x + rand(-4, 4), b.pos.y + rand(0.3, 1.5), b.pos.z + rand(-4, 4));
        this.spawn(_bp, {
          vel: _bv.set(rand(-0.5, 0.5), rand(3, 6), rand(-0.5, 0.5)), size: rand(2.5, 4.5) * (0.35 + 0.65 * k) * g, life: rand(0.5, 0.9),
          color: PALETTE.fire[Math.random() < 0.3 ? 0 : 1], end: PALETTE.fire[2], bright: 1.4, tint: 0.1, glow: true, opaque: 0.85,
          stretch: 1.7, dir: _up, rise: 2, drag: 1.5, grow: 0.3, fadeIn: 0.08, fadeOut: 0.4,
        });
      }
      if (b.smoke <= 0) {
        b.smoke = rand(0.22, 0.32) / rate;
        _bp.set(b.pos.x + rand(-2, 2), b.pos.y + 2.5, b.pos.z + rand(-2, 2));
        this.spawn(_bp, {
          vel: _bv.set(rand(-1, 1), rand(7, 10) * (0.5 + 0.5 * k), rand(-1, 1)), size: rand(3, 4.5) * (0.6 + 0.4 * k) * g,
          life: rand(14, 20) * rate, color: k > 0.5 ? PALETTE.smokeDark : PALETTE.smoke, tint: 0.1, grow: 3, rise: 2.5, drag: 0.25,
          alpha: 0.5 + 0.35 * k, fadeIn: 0.03,
        });
      }
    }
  }

  // --- Hazır efektler -------------------------------------------------------

  /**
   * Havada infilak, evreleriyle (vel: uçağın hızı; ateş topu ve bulut bir an onunla sürüklenir):
   * 1. Flaş: göz kamaştıran kısa beyaz parlama (0,12 sn), ardından turuncu parıltı.
   * 2. Ateş topu: yakıt ve cephane; beyaz-sarı çekirdekten turuncuya, kora döner; çabuk genişler, yavaşlayıp yükselir.
   * 3. Kıvılcım ve yanan küçük parçalar: hız yönünde uzayan çizgiler, yerçekimiyle eğilir.
   * 4. Bulut: ateşin aydınlattığı kahverengiden iki saniyede koyu griye; yavaş genişler, rüzgârla kayar, yarım dakika
   *    kadar asılı kalır (eskiden tek düze koyu yığın 3–6 sn'de kayboluyordu). İçinde bir süre soluk turuncu parıltı.
   * Yanan büyük parçaların duman izleri (`Debris`, `Wrecks`) bulutun dışına kollar gibi uzanır.
   */
  airExplosion(pos: THREE.Vector3, vis: number, size = 6, vel?: THREE.Vector3): void {
    const k = Math.max(1, size / 6);
    const s = Math.max(vis, 1);
    const carry = (f: number) => (vel ? _bv.copy(vel).multiplyScalar(f) : _bv.set(0, 0, 0));
    this.spawn(pos, {
      size: 11 * k + 4 * s, life: 0.12, color: PALETTE.fire[0], bright: 2, glow: true, opaque: 0, soft: true, grow: 0.8,
      fadeIn: 0, fadeOut: 0.05,
    });
    this.spawn(pos, {
      vel: carry(0.5), size: 6 * k + 2 * s, life: 0.3, color: 0xffb35a, end: PALETTE.fire[2], bright: 1.4, glow: true, opaque: 0,
      alpha: 0.7, soft: true, grow: 1, drag: 3, fadeIn: 0, fadeOut: 0.2,
    });
    // Ateş topu çok sayıda küçük, renkleri karışık dilden: tek düze turuncu top değil, sarı çekirdekler ve kızıl kenarlar
    const balls = [PALETTE.fire[0], PALETTE.fire[1], PALETTE.fire[1], 0xe0642a];
    for (let i = 0; i < 18; i++) {
      const d = randDir();
      this.spawn(_bp.copy(pos).addScaledVector(d, rand(0, 2.5) * k), {
        vel: d.multiplyScalar(rand(6, 18) * k + rand(1, 4) * s).add(carry(0.5)),
        size: rand(1.8, 3.2) * k + rand(0.6, 1.4) * s, life: rand(0.6, 1.3),
        color: balls[i % 4], end: PALETTE.fire[2], bright: 1.5, tint: 0.2, glow: true, opaque: rand(0.6, 1), grow: 1.6, drag: 3,
        rise: 3, fadeIn: 0.03, fadeOut: 0.35,
      });
    }
    for (let i = 0; i < 12; i++) {
      this.spawn(pos, {
        vel: randDir().multiplyScalar(rand(25, 60) * Math.sqrt(k)).add(carry(0.6)),
        size: rand(0.25, 0.45) * Math.sqrt(k) * Math.min(s, 4), life: rand(0.5, 1.2), color: 0xffc070, end: PALETTE.fire[2], bright: 1.6,
        glow: true, opaque: 0, soft: true, stretch: 6, drag: 1.2, rise: -G * 0.8, grow: 0, fadeIn: 0, fadeOut: 0.5,
      });
    }
    // Bulut: çok sayıda küçük topak; her biri uçağın hızından farklı pay alır, bulut uçuş yönünde uzar (havada infilak
    // eden uçak yolunda uzun bir is lekesi bırakır). Kimi topak hemen belirir: kara duman ateş topunun içinden çıkar.
    const life = 20 * this.persist;
    for (let i = 0, n = this.persist >= 1 ? 22 : 16; i < n; i++) {
      const d = randDir();
      this.spawn(_bp.copy(pos).addScaledVector(d, rand(0, 3) * k), {
        vel: d.multiplyScalar(rand(3, 10) * k + s).add(carry(rand(0.05, 0.7))),
        size: rand(2.2, 4) * k + rand(0.8, 1.6) * s, life: life * rand(0.8, 1.4),
        color: 0x6e4a36, end: i % 3 ? PALETTE.smokeDark : PALETTE.smoke, cool: rand(1.5, 2.5), tint: 0.12, grow: 2.6, rise: 0.8,
        drag: 1.4, alpha: 0.8, fadeIn: (i % 4 ? 0.03 : 0.005) / Math.max(this.persist, 0.4), fadeOut: 0.45,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.spawn(_bp.copy(pos).addScaledVector(randDir(), rand(0, 3) * k), {
        vel: carry(0.35), size: (6 + i * 2) * k + 2 * s, life: rand(1.2, 1.8), color: PALETTE.fire[1], end: PALETTE.fire[2],
        bright: 1.1, glow: true, opaque: 0, soft: true, alpha: 0.4, drag: 1.4, grow: 0.8, fadeIn: 0.1, fadeOut: 0.3,
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

  /** Uçak yere çakıldı: patlama, sonra enkaz yarım dakika ile bir dakika yanar. */
  crash(pos: THREE.Vector3, vis: number): void {
    this.groundExplosion(pos, 10 * Math.min(Math.max(vis, 2), 6));
    this.burn(pos);
  }

  /**
   * size: 1 ağır flak, 0.5 orta kalibre kendini imha. Patlayan mermi: bir an kırmızı-turuncu flaş, sıcak parça
   * çizgileri ve keskin kenarlı kara bulut. Bulut ağır topta 20 sn'ye kadar asılı kalır, yavaşça genişleyip incelir ve
   * rüzgârla kayar (eskiden 2–3 sn'de sönüyordu; bombardıman kolunun geçtiği gök hiç dolmuyordu). Orta kalibrenin
   * bulutu küçük ve açık gri, 6–9 sn.
   */
  flak(pos: THREE.Vector3, vis: number, size = 1): void {
    const heavy = size >= 1;
    const s = Math.min(Math.max(vis, 1), 4) * size;
    this.spawn(pos, { size: 3 * s, life: 0.08, color: PALETTE.fire[0], bright: 1.8, glow: true, opaque: 0, soft: true, fadeIn: 0 });
    // Kırmızı-turuncu parıltı eklemeli: sönerken kahverengi bir leke bırakmasın
    this.spawn(pos, {
      size: 3.6 * s, life: 0.2, color: 0xff7a3a, end: PALETTE.fire[2], bright: 1.4, glow: true, opaque: 0, alpha: 0.8, soft: true, fadeIn: 0,
    });
    for (let i = 0; i < (heavy ? 5 : 2); i++) {
      this.spawn(pos, {
        vel: randDir().multiplyScalar(rand(120, 180)), size: 0.22 * s, life: rand(0.08, 0.14), color: 0xffb060, bright: 1.5,
        glow: true, opaque: 0, soft: true, stretch: 8, drag: 0.5, grow: 0, fadeIn: 0, fadeOut: 0.3,
      });
    }
    const life = (heavy ? rand(16, 24) : rand(6, 9)) * this.persist;
    // Ağır topun bulutu bir bombardıman uçağı boyunda (çapı ~8 m, ömür sonunda ~25 m)
    for (let i = 0, n = heavy ? (this.persist >= 1 ? 4 : 3) : 2; i < n; i++) {
      this.spawn(_bp.copy(pos).addScaledVector(randDir(), 1.8 * s), {
        vel: randDir().multiplyScalar(rand(4, 9) * s), drag: 2.5, size: (heavy ? rand(3.6, 5) : rand(2.4, 3.4)) * s, life: life * rand(0.85, 1.15),
        color: heavy ? PALETTE.flak : 0x8d8a8e, tint: 0.08, grow: heavy ? 2.2 : 1.6, alpha: 0.9, fadeIn: 0.004, fadeOut: 0.35,
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

  /**
   * Uçaksavar topunun atışı (namlu ucunda, namlu doğrultusunda; bore mm). Orta ve ağır topta namlu boyunca uzanan,
   * çekirdeği beyaza yakın turuncu alev ve ileri savrulup yavaşlayarak genişleyen barut dumanı; ağır topta (75 mm ve üstü)
   * namlunun altında yerden kalkan toz. Hafif silahta (20 mm ve makineli) yalnız küçük parlama. Eskiden her topta tek
   * yuvarlak parlama vardı: 88'de namlunun önünde güneş gibi duruyordu. vis: uzaklıkla büyütme (fxScale).
   */
  gunFire(pos: THREE.Vector3, dir: THREE.Vector3, vis: number, bore: number, ground: THREE.Vector3 | null): void {
    if (bore < 30) {
      this.muzzle(pos, Math.min(vis, 4) * 1.5);
      return;
    }
    const heavy = bore >= 75;
    const s = Math.min(Math.max(vis, 1), 4) * (heavy ? 1 : 0.55);
    // Alev: namlu ucundan ileri daralan üç parlama
    const flames: [number, number, number][] = [[0.3, 1.1, PALETTE.fire[0]], [1.1, 0.85, PALETTE.fire[1]], [2.0, 0.55, PALETTE.fire[1]]];
    for (const [k, sz, col] of flames) {
      _p.copy(pos).addScaledVector(dir, k * s);
      this.spawn(_p, { size: sz * s, life: 0.07, color: col, end: PALETTE.fire[2], bright: 1.6, glow: true, opaque: 0.6, soft: true, fadeIn: 0 });
    }
    // Barut dumanı: namlu doğrultusunda savrulur, havada yavaşlar ve genişler
    const n = heavy ? 4 : 2;
    for (let i = 0; i < n; i++) {
      _p.copy(pos).addScaledVector(dir, (0.5 + i * 0.6) * s);
      _v.copy(dir).multiplyScalar((heavy ? 13 : 8) * (1 - i * 0.2) * s);
      _v.x += rand(-1, 1) * s;
      _v.y += rand(0, 1) * s;
      _v.z += rand(-1, 1) * s;
      // Açık gri ve dağınık (koyu topak uçaksavar patlamasıyla karışıyordu)
      this.spawn(_p, {
        vel: _v, size: (heavy ? 1.2 : 0.7) * s, life: heavy ? 2.4 : 1.4, color: 0xd2cfca, grow: 3.4, drag: 2.6,
        rise: 0.5 * s, alpha: heavy ? 0.4 : 0.3, tint: 0.06, fadeIn: 0.03, soft: true,
      });
    }
    if (!heavy || !ground) return;
    // Ağır top: ağız basıncı namlunun altındaki toprağı kaldırır (topun çevresinde, namlunun baktığı yana ağır)
    for (let i = 0; i < 5; i++) {
      const a = Math.atan2(dir.x, dir.z) + rand(-1.3, 1.3);
      _p.set(ground.x + Math.sin(a) * 2.2 * s, ground.y + 0.4, ground.z + Math.cos(a) * 2.2 * s);
      _v.set(Math.sin(a), 0.25, Math.cos(a)).multiplyScalar(rand(2, 4) * s);
      this.spawn(_p, { vel: _v, size: 1.4 * s, life: 1.8, color: PALETTE.dust, grow: 2.2, drag: 1.6, rise: 0.2, alpha: 0.4, tint: 0.1, fadeIn: 0.05 });
    }
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

/** Roketler: RP-3 gövdesi (munitions.ts) + duman izi. */
export class RocketViews {
  readonly mesh: THREE.InstancedMesh;

  constructor(private readonly max = 400) {
    this.mesh = new THREE.InstancedMesh(
      rocketGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.6 }),
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
      if (emit) effects.trail(r, 0, r.pos, Math.min(vis, 5), 'rocket', r.vel);
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
  /** Kalan yanma süresi (sn): yanarken alev ve kara duman izi, sonra bir süre yalnız duman. */
  burn: number;
  /** Yanması bittikten sonra duman bırakacağı süre. */
  smolder: number;
  age: number;
  /** Kopan kanat parçası (ayrı biçim ve renk). */
  wing: boolean;
  /** Hava direnci (1/sn): ince sac yaprak gibi yavaş düşer. */
  drag: number;
  /** Renk (SHARD_COLORS sırası; yanan parça kararmış). */
  tint: number;
}

/**
 * Sac parçası: düzensiz altıgen levha, ortasından bükük (kopmuş kaplama). İki yüzlü, düz gölgeli; boy birim, ölçek örnekte.
 * Eskiden birim kutuydu: yakından karton kutu gibi duruyordu.
 */
function shardGeometry(): THREE.BufferGeometry {
  const rim: [number, number][] = [[0.5, 0.05], [0.28, 0.42], [-0.12, 0.5], [-0.5, 0.18], [-0.38, -0.36], [0.1, -0.5], [0.42, -0.3]];
  const pos: number[] = [];
  // Bükülme: x > 0 yarısı yukarı kalkar
  const y = (x: number, z: number) => (x > 0 ? x * 0.45 : 0) + z * z * 0.12;
  for (let i = 0; i < rim.length; i++) {
    const [ax, az] = rim[i];
    const [bx, bz] = rim[(i + 1) % rim.length];
    pos.push(0, 0, 0, ax, y(ax, az), az, bx, y(bx, bz), bz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Parça renkleri: çıplak alüminyum, boyalı (koyu yeşil, mavi-gri), yanmış koyu. */
const SHARD_COLORS = [0xb8bcc0, 0x9a9ea3, 0x5f6a48, 0x7d8a96, 0x3d3836].map((c) => new THREE.Color(c));

/**
 * Kopan kanat: uca doğru daralan, incelen ve geriye açılı yassı parça (x açıklık, z veter, y kalınlık; kök x = −0,5).
 * Eskiden düz kutuydu: koyu, keskin köşeli bir levha gibi duruyordu.
 */
function wingPieceGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getX(i) + 0.5;
    const chord = 1 - 0.55 * k;
    pos.setZ(i, pos.getZ(i) * chord - 0.18 * k);
    // Profil: hücum kenarı (z > 0) kalın ve yuvarlak, firar kenarı ince
    const front = pos.getZ(i) > -0.18 * k;
    pos.setY(i, pos.getY(i) * (1 - 0.5 * k) * (front ? 1 : 0.35));
  }
  g.computeVertexNormals();
  return g;
}

/** Aynı anda çizilen en çok kanat paneli. */
const WING_MAX = 160;

/** Enkaz: infilak eden ya da parçalanan uçaktan kopan, dönerek düşen parçalar (görsel). */
const _e = new THREE.Euler();

export class Debris {
  /** Küçük parçalar ve kopan kanatlar (iki çizim). */
  readonly mesh = new THREE.Group();
  private readonly bits: THREE.InstancedMesh;
  private readonly wings: THREE.InstancedMesh;
  private pieces: DebrisPiece[] = [];

  constructor(private readonly max = 600) {
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    };
    this.bits = make(shardGeometry(), new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide }), max);
    this.bits.setColorAt(0, SHARD_COLORS[0]);
    this.bits.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    // Kanat: boyalı ya da çıplak metal ortalaması, açık gri; iki yüz de görünsün (ince parça döner)
    this.wings = make(wingPieceGeometry(), new THREE.MeshLambertMaterial({ color: 0xb4b7ba, side: THREE.DoubleSide }), WING_MAX);
    this.mesh.add(this.bits, this.wings);
  }

  clear(): void {
    this.pieces.length = 0;
    this.bits.count = 0;
    this.wings.count = 0;
  }

  /**
   * count parça; size ≈ parça boyu (m). count = 1 ise kopan kanat: tek büyük levha yerine birkaç ince kanat paneli. Uçağın
   * modeli kanadını yitirmediği için kanat boyunda tek levha (B-17'de 14 × 5 m) gökte koyu bir dikdörtgen gibi duruyordu.
   */
  /**
   * Sac parçaları: verilen sayının üç katı, boyun yarısı (çok sayıda küçük parça büyük kutulardan gerçekçi). Yanan
   * patlamada en çok üç parça yanar ve kollar gibi uzanan duman izi bırakır (hepsi yansa gök dumanla dolardı).
   */
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, count: number, size: number, burning: boolean): void {
    const wingPiece = count === 1;
    const n = wingPiece ? 3 + Math.floor(Math.random() * 2) : count * 3;
    let fires = burning ? (wingPiece ? n : Math.min(3, Math.ceil(n * 0.3))) : 0;
    for (let i = 0; i < n && this.pieces.length < this.max; i++) {
      const lit = fires-- > 0;
      // Yanan parça ağır ve hızlı (yakıtlı gövde parçası), sac hafif
      const v = vel.clone().add(randDir().multiplyScalar(lit ? rand(18, 35) : rand(5, 22)));
      const s = wingPiece
        ? new THREE.Vector3(size * rand(0.16, 0.28), Math.max(0.06, size * 0.008), size * rand(0.09, 0.15))
        : new THREE.Vector3(rand(0.6, 1.4), rand(0.6, 1.2), rand(0.5, 1.1)).multiplyScalar(size * (lit ? 0.7 : 0.5));
      this.pieces.push({
        pos: pos.clone().add(randDir().multiplyScalar(size * 0.3)), vel: v, rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
        spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), size: s,
        burn: lit ? rand(3, 8) : 0, smolder: lit ? rand(2, 5) : 0, age: 0, wing: wingPiece,
        drag: wingPiece ? 0.5 : lit ? 0.3 : 0.9, tint: lit ? 4 : Math.floor(Math.random() * 4),
      });
    }
  }

  update(dt: number, effects: Effects, emit: boolean, scale: number): void {
    let w = 0;
    for (const p of this.pieces) {
      p.age += dt;
      // Parçalar hızla yavaşlar (yüksek sürükleme), sonra düşer
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= G * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      if (emit && (p.burn > 0 || p.smolder > 0)) {
        if (p.burn > 0) p.burn -= dt;
        else p.smolder -= dt;
        // İnce kol: ana bulutun yanında yanan parçanın izi ince kalır
        effects.trail(p, 0, p.pos, Math.min(scale, 6) * 0.4, p.burn > 0 ? 'burning' : 'damaged', p.vel);
      }
      if (p.pos.y <= groundLevel(p.pos.x, p.pos.z) || p.age > 90) {
        // Küçük sac sessizce düşer; büyük ve yanan parça toz kaldırır
        if (emit && (p.wing || p.tint === 4 || Math.random() < 0.3)) effects.groundHit(p.pos, Math.min(scale, 4), false);
        continue;
      }
      this.pieces[w++] = p;
    }
    this.pieces.length = w;
    const k = Math.min(Math.max(scale, 1), 6);
    let nb = 0;
    let nw = 0;
    for (let i = 0; i < w; i++) {
      const p = this.pieces[i];
      // Kanat yavaş döner (yassı parça havada süzülerek yuvarlanır)
      _q.setFromEuler(p.wing ? _e.set(p.rot.x * 0.35, p.rot.y * 0.2, p.rot.z * 0.35) : p.rot);
      _s.copy(p.size).multiplyScalar(k);
      _m.compose(p.pos, _q, _s);
      if (p.wing) {
        if (nw < WING_MAX) this.wings.setMatrixAt(nw++, _m);
      } else {
        this.bits.setColorAt(nb, SHARD_COLORS[p.tint]);
        this.bits.setMatrixAt(nb++, _m);
      }
    }
    this.bits.count = nb;
    this.wings.count = nw;
    markUsed(this.bits, nb);
    markUsed(this.wings, nw);
  }
}

/** Paraşütler: beyaz kubbe ve altında küçük asılı pilot. */
export class ParachuteViews {
  readonly group = new THREE.Group();
  private readonly canopy: THREE.InstancedMesh;
  private readonly pilot: THREE.InstancedMesh;

  constructor(private readonly max = 120) {
    this.canopy = new THREE.InstancedMesh(
      // Askı ipleri kubbe biriminde: etekten pilotun omuzlarına (kubbe pilotun 5,5 m üstünde, yarıçapı 4,2 m)
      canopyGeometry(0.8),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      max,
    );
    this.pilot = new THREE.InstancedMesh(jumperGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), max);
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
