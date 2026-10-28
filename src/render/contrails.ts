// Yoğuşma izleri: yüksekte uçan motorların arkasında beyaz şeritler. Simülasyondaki algıyla aynı eşik (ai/perception:
// 6,8–8,2 km arasında artar, üstünde tam): yapay zekânın uzaktan gördüğü izi oyuncu da görür.
// Her motor için noktalar SAMPLE saniyede bir (oyun zamanı) alınır ve LIFE saniye yaşar; iz yaşlandıkça genişler,
// uçağın hemen arkasında saydam başlar (iz motorun biraz gerisinde oluşur), sonunda söner. Şeritler kameraya dönük
// (her karede yeniden kurulur), hepsi tek ağda, tek çizim çağrısı.

import * as THREE from 'three';
import { smoothstep } from '../core/math';

const SAMPLE = 0.25;
const LIFE = 32;
const MAX_PTS = Math.ceil(LIFE / SAMPLE) + 2;
/** Bütün şeritlerin toplam köşe sınırı. */
const CAP = 24000;

/** Yoğuşma izinin yoğunluğu: irtifaya göre 0..1 (algıdaki kontrail çarpanıyla aynı eşik). */
export function contrailAmount(alt: number): number {
  return smoothstep(6800, 8200, alt);
}

interface Ribbon {
  pos: Float32Array;
  t: Float32Array;
  k: Float32Array;
  head: number;
  n: number;
  last: number;
  /** Bu karede beslendi mi (uçak hâlâ var); canlı uç konumu ve yoğunluğu. */
  seen: boolean;
  live: THREE.Vector3;
  liveK: number;
}

/** Şerit kesiti: ortada beyaz, kenarlarda saydam (yumuşak çan eğrisi). */
function softEdge(): THREE.Texture {
  const W = 64;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = 1;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(W, 1);
  for (let i = 0; i < W; i++) {
    const x = (i + 0.5) / W - 0.5;
    const a = Math.exp(-(x * x) / (2 * 0.17 * 0.17));
    img.data.set([255, 255, 255, Math.round(255 * a)], i * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Contrails {
  readonly mesh: THREE.Mesh;
  private readonly ribbons = new Map<string, Ribbon>();
  private readonly posA: Float32Array;
  private readonly colA: Float32Array;
  private readonly idxA: Uint32Array;
  private readonly geo = new THREE.BufferGeometry();

  constructor() {
    this.posA = new Float32Array(CAP * 3);
    this.colA = new Float32Array(CAP * 4);
    this.idxA = new Uint32Array(CAP * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colA, 4).setUsage(THREE.DynamicDrawUsage));
    // Şeridin iki kenarı u = 0 / 1: doku ortada dolu, kenarlara doğru söner (keskin kenarlı tahta gibi durmasın)
    const uv = new Float32Array(CAP * 2);
    for (let i = 0; i < CAP; i++) uv[i * 2] = i & 1;
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(new THREE.BufferAttribute(this.idxA, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      color: 0xfbfbf8, map: softEdge(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  clear(): void {
    this.ribbons.clear();
    this.geo.setDrawRange(0, 0);
  }

  /** Kare başı: hangi şeritlerin uçağı hâlâ var, yeniden işaretlenir. */
  begin(): void {
    for (const r of this.ribbons.values()) r.seen = false;
  }

  /** Bir motorun bu karedeki konumu ve iz yoğunluğu (0: iz yok). */
  feed(key: string, p: THREE.Vector3, k: number, time: number): void {
    let r = this.ribbons.get(key);
    if (!r) {
      if (k <= 0.01) return;
      r = {
        pos: new Float32Array(MAX_PTS * 3), t: new Float32Array(MAX_PTS), k: new Float32Array(MAX_PTS),
        head: 0, n: 0, last: -1e9, seen: true, live: new THREE.Vector3(), liveK: 0,
      };
      this.ribbons.set(key, r);
    }
    r.seen = true;
    r.live.copy(p);
    r.liveK = k;
    if (k > 0.01 && time - r.last >= SAMPLE) {
      const i = r.head;
      r.pos[i * 3] = p.x;
      r.pos[i * 3 + 1] = p.y;
      r.pos[i * 3 + 2] = p.z;
      r.t[i] = time;
      r.k[i] = k;
      r.head = (r.head + 1) % MAX_PTS;
      r.n = Math.min(r.n + 1, MAX_PTS);
      r.last = time;
    } else if (k <= 0.01) r.last = -1e9;
  }

  /** Kare sonu: süresi dolan noktaları at, şeritleri kameraya dönük kur. */
  end(camera: THREE.Camera, time: number): void {
    let v = 0;
    let q = 0;
    const cam = camera.position;
    for (const [key, r] of this.ribbons) {
      // En eskiden başlayarak süresi dolanları at
      while (r.n > 0 && time - r.t[(r.head - r.n + MAX_PTS) % MAX_PTS] > LIFE) r.n--;
      if (r.n === 0 && !(r.seen && r.liveK > 0.01)) {
        if (!r.seen) this.ribbons.delete(key);
        continue;
      }
      const count = r.n + (r.seen && r.liveK > 0.01 ? 1 : 0);
      if (count < 2 || v + count * 2 > CAP) continue;
      const at = (j: number, out: THREE.Vector3): number => {
        if (j >= r.n) {
          out.copy(r.live);
          return 0;
        }
        const i = (r.head - r.n + j + MAX_PTS) % MAX_PTS;
        out.set(r.pos[i * 3], r.pos[i * 3 + 1], r.pos[i * 3 + 2]);
        return time - r.t[i];
      };
      const kAt = (j: number): number => (j >= r.n ? r.liveK : r.k[(r.head - r.n + j + MAX_PTS) % MAX_PTS]);
      const base = v;
      for (let j = 0; j < count; j++) {
        const age = at(j, _c);
        at(Math.max(0, j - 1), _a);
        at(Math.min(count - 1, j + 1), _b);
        _d.subVectors(_b, _a);
        if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1);
        _s.subVectors(cam, _c).cross(_d).normalize();
        const w = (2.5 + age * 0.85) * 0.5;
        const alpha = kAt(j) * 0.72 * smoothstep(0, 1.4, age) * (1 - smoothstep(LIFE * 0.45, LIFE, age));
        for (const side of [1, -1]) {
          this.posA[v * 3] = _c.x + _s.x * w * side;
          this.posA[v * 3 + 1] = _c.y + _s.y * w * side;
          this.posA[v * 3 + 2] = _c.z + _s.z * w * side;
          this.colA[v * 4] = 1;
          this.colA[v * 4 + 1] = 1;
          this.colA[v * 4 + 2] = 1;
          this.colA[v * 4 + 3] = alpha;
          v++;
        }
      }
      for (let j = 0; j < count - 1; j++) {
        const a = base + j * 2;
        this.idxA[q++] = a;
        this.idxA[q++] = a + 1;
        this.idxA[q++] = a + 2;
        this.idxA[q++] = a + 1;
        this.idxA[q++] = a + 3;
        this.idxA[q++] = a + 2;
      }
    }
    this.geo.setDrawRange(0, q);
    // Yalnız dolu kısım yüklenir. İz yokken hiç yükleme yok: WebGL 2'de boş aralık "dizinin sonuna kadar" demek
    // (iz yokken her karede ~1 MB yükleniyordu)
    if (v === 0) return;
    const pa = this.geo.attributes.position as THREE.BufferAttribute;
    const ca = this.geo.attributes.color as THREE.BufferAttribute;
    pa.clearUpdateRanges();
    pa.addUpdateRange(0, v * 3);
    pa.needsUpdate = true;
    ca.clearUpdateRanges();
    ca.addUpdateRange(0, v * 4);
    ca.needsUpdate = true;
    const ia = this.geo.index!;
    ia.clearUpdateRanges();
    ia.addUpdateRange(0, q);
    ia.needsUpdate = true;
  }
}
