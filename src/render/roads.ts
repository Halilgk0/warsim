// Şehir yollarının çizimi (sim/roads.ts) ve yerleşim ızgarası.
// Yol araziyi izleyen iki katlı şerittir: altta açık renk kaldırım, üstte asfalt; uçlarda yuvarlak kapak (kavşak ve
// köşeler boşluksuz birleşir, asfalt kaldırımın üstünde kaldığı için kavşakta kaldırım yolu kesmez). Arazi yapıların
// düzleştirmesiyle değişince şerit yeniden oturtulur. Yalnız yakından çizilir (uzak arazi düzeyi kaba, şerit gömülür).
// Izgara: inşa ederken yapının çevresinde araziye serilen çizgiler; yola dizilirken yolun doğrultusuna döner.

import * as THREE from 'three';
import type { World } from '../sim/world';
import { GRID, ROAD_HALF, ROAD_VERGE } from '../sim/roads';
import { groundLevel, terrainEdits } from '../sim/terrain';
import { linkAtmosphere } from './atmosphere';

const ASPHALT = new THREE.Color(0x7f7a72);
const VERGE = new THREE.Color(0xb9b0a0);
/** Şerit boyunca örnek aralığı (m): arazi yüzeyi düz parçalardan oluşur, kırıklarda şerit en çok bu kadar açılır. */
const STEP = 6;
/** Yol bu kamera uzaklığından sonra çizilmez (m). */
const FAR = 14000;

interface Buf {
  pos: number[];
  col: number[];
  idx: number[];
}

/** Bir parçanın şeridi ve uç kapakları: yarı genişlik half, yerden lift kadar yukarıda. */
function ribbon(o: Buf, ax: number, az: number, bx: number, bz: number, half: number, lift: number, c: THREE.Color | null): void {
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const dx = (bx - ax) / len;
  const dz = (bz - az) / len;
  const n = Math.max(1, Math.ceil(len / STEP));
  const v = (x: number, z: number): number => {
    o.pos.push(x, groundLevel(x, z) + lift, z);
    if (c) o.col.push(c.r, c.g, c.b);
    return o.pos.length / 3 - 1;
  };
  let pl = -1;
  let pr = -1;
  for (let i = 0; i <= n; i++) {
    const x = ax + (dx * len * i) / n;
    const z = az + (dz * len * i) / n;
    const l = v(x - dz * half, z + dx * half);
    const r = v(x + dz * half, z - dx * half);
    if (i > 0) o.idx.push(pl, l, pr, pr, l, r);
    pl = l;
    pr = r;
  }
  for (const [cx, cz] of [[ax, az], [bx, bz]]) {
    const m = v(cx, cz);
    const rim: number[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      rim.push(v(cx + Math.cos(a) * half, cz + Math.sin(a) * half));
    }
    for (let k = 0; k < 10; k++) o.idx.push(m, rim[(k + 1) % 10], rim[k]);
  }
}

function toGeometry(o: Buf): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
  if (o.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
  g.setIndex(o.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Dünyadaki bütün yolların tek ağı. */
export class RoadLayer {
  readonly mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  private key = '';
  private world: World | null = null;

  constructor() {
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  update(w: World, camDist: number): void {
    const key = `${w.roadVersion}:${terrainEdits.version}:${w.roads.length}`;
    if (w !== this.world || key !== this.key) {
      this.world = w;
      this.key = key;
      const o: Buf = { pos: [], col: [], idx: [] };
      for (const r of w.roads) ribbon(o, r.ax, r.az, r.bx, r.bz, ROAD_VERGE, 0.28, VERGE);
      for (const r of w.roads) ribbon(o, r.ax, r.az, r.bx, r.bz, ROAD_HALF, 0.42, ASPHALT);
      this.mesh.geometry.dispose();
      this.mesh.geometry = toGeometry(o);
    }
    this.mesh.visible = w.roads.length > 0 && camDist < FAR;
  }
}

/** Kurulacak yolun önizlemesi (yarı saydam şerit) ya da başlangıç noktası işareti. */
export class RoadGhost {
  readonly mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xd8f6e4, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  private key = '';

  constructor() {
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.visible = false;
  }

  /** b yoksa yalnız a noktasında yuvarlak işaret. */
  set(g: { ax: number; az: number; bx?: number; bz?: number; ok: boolean } | null): void {
    if (!g) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    (this.mesh.material as THREE.MeshBasicMaterial).color.setHex(g.ok ? 0xd8f6e4 : 0xff7a66);
    const key = `${g.ax}:${g.az}:${g.bx}:${g.bz}:${terrainEdits.version}`;
    if (key === this.key) return;
    this.key = key;
    const o: Buf = { pos: [], col: [], idx: [] };
    if (g.bx === undefined || g.bz === undefined) ribbon(o, g.ax, g.az, g.ax, g.az + 0.01, ROAD_VERGE + 1.5, 0.7, null);
    else ribbon(o, g.ax, g.az, g.bx, g.bz, ROAD_VERGE, 0.7, null);
    this.mesh.geometry.dispose();
    this.mesh.geometry = toGeometry(o);
  }
}

export interface GridFrame {
  /** Izgaranın ortası (yapının durduğu yer). */
  x: number;
  z: number;
  /** Çizgilerin başlangıcı ve doğrultusu (u ekseninin birim yönü). */
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  /** Görünen yarıçap (m). */
  radius: number;
}

/** Yerleşim ızgarası: araziye serilen yama, çizgiler gölgelendiricide (dünya koordinatından), kenara doğru söner. */
export class BuildGrid {
  private static readonly N = 40;
  readonly mesh: THREE.Mesh;
  private readonly u = {
    gOrigin: { value: new THREE.Vector2() },
    gAxis: { value: new THREE.Vector2(1, 0) },
    gCenter: { value: new THREE.Vector2() },
    gRadius: { value: 150 },
    gCell: { value: GRID },
  };
  private key = '';

  constructor() {
    const n = BuildGrid.N;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * (n + 1) * 3), 3));
    const idx: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    }
    geo.setIndex(idx);
    // Standart malzeme üstüne: logaritmik derinlik ve renk düzeni three.js'ten gelir, yalnız saydamlık ızgaradan
    const mat = new THREE.MeshBasicMaterial({
      color: 0xeefaf2, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    mat.onBeforeCompile = (shader) => {
      linkAtmosphere(shader);
      Object.assign(shader.uniforms, this.u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGridXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGridXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec2 gOrigin;
          uniform vec2 gAxis;
          uniform vec2 gCenter;
          uniform float gRadius;
          uniform float gCell;
          varying vec2 vGridXZ;`)
        .replace('#include <opaque_fragment>', `
          vec2 gd = vGridXZ - gOrigin;
          vec2 gp = vec2(dot(gd, gAxis), dot(gd, vec2(-gAxis.y, gAxis.x))) / gCell;
          vec2 gw = fwidth(gp);
          vec2 gg = abs(fract(gp - 0.5) - 0.5) / max(gw, vec2(1e-4));
          float gLine = 1.0 - min(min(gg.x, gg.y) / 1.4, 1.0);
          // Çizgiler pikselden sıklaşınca (uzaktan) düz bir örtüye dönmesin
          gLine *= 1.0 - smoothstep(0.3, 0.6, max(gw.x, gw.y));
          float gFade = 1.0 - smoothstep(0.45, 1.0, distance(vGridXZ, gCenter) / gRadius);
          diffuseColor.a = gLine * gFade * 0.5;
          if (diffuseColor.a < 0.01) discard;
          #include <opaque_fragment>`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
  }

  set(f: GridFrame | null): void {
    if (!f) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.u.gOrigin.value.set(f.ox, f.oz);
    this.u.gAxis.value.set(f.ux, f.uz);
    this.u.gCenter.value.set(f.x, f.z);
    this.u.gRadius.value = f.radius;
    // Yama ızgara ortasıyla gezer; yükseklikler yalnız yer ya da arazi değişince yeniden okunur
    const key = `${Math.round(f.x)}:${Math.round(f.z)}:${f.radius}:${terrainEdits.version}`;
    if (key === this.key) return;
    this.key = key;
    const n = BuildGrid.N;
    const arr = (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const step = (f.radius * 2) / n;
    let k = 0;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = f.x - f.radius + i * step;
        const z = f.z - f.radius + j * step;
        arr[k++] = x;
        arr[k++] = groundLevel(x, z) + 0.55;
        arr[k++] = z;
      }
    }
    this.mesh.geometry.getAttribute('position').needsUpdate = true;
  }
}

export interface Footprint {
  x: number;
  z: number;
  heading: number;
  halfW: number;
  halfL: number;
  ok: boolean;
  /** Uzun eksen çizgisi (hava üssü: pist). */
  axis: boolean;
}

/**
 * Yerleşim işareti: kurulacak yapının tabanı araziye serilir (model ya da silüet yok). Çift çerçeve, kalın köşe
 * işaretleri, çapraz taralı dolgu, ortada baklava ve ön cepheyi gösteren yelpaze; uygun değilse kırmızı.
 */
export class FootprintGhost {
  private static readonly N = 14;
  readonly mesh: THREE.Mesh;
  private readonly u = {
    fHalf: { value: new THREE.Vector2(1, 1) },
    fColor: { value: new THREE.Color(0xdcf7e8) },
    fAxis: { value: 0 },
  };
  private key = '';

  constructor() {
    const n = FootprintGhost.N;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * (n + 1) * 3), 3));
    const fp = new Float32Array((n + 1) * (n + 1) * 2);
    const idx: number[] = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        fp[(j * (n + 1) + i) * 2] = (i / n) * 2 - 1;
        fp[(j * (n + 1) + i) * 2 + 1] = (j / n) * 2 - 1;
        if (i < n && j < n) {
          const a = j * (n + 1) + i;
          idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
        }
      }
    }
    geo.setAttribute('fp', new THREE.BufferAttribute(fp, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    mat.onBeforeCompile = (shader) => {
      linkAtmosphere(shader);
      Object.assign(shader.uniforms, this.u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 fp;\nvarying vec2 vFp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFp = fp;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec2 fHalf;
          uniform vec3 fColor;
          uniform float fAxis;
          varying vec2 vFp;`)
        .replace('#include <opaque_fragment>', `
          vec2 fpm = vFp * fHalf;
          vec2 fd = fHalf - abs( fpm );
          float fk = clamp( min( fHalf.x, fHalf.y ) / 12.0, 1.0, 30.0 );
          float fe = min( fd.x, fd.y );
          float fw = max( fwidth( fe ), 0.01 ) * 1.2;
          float fBorder = 1.0 - smoothstep( 0.45 * fk, 0.45 * fk + fw, fe );
          float fInner = smoothstep( 1.3 * fk - fw, 1.3 * fk, fe ) * ( 1.0 - smoothstep( 1.55 * fk, 1.55 * fk + fw, fe ) );
          float fcl = min( min( fHalf.x, fHalf.y ) * 0.45, 5.0 * fk );
          float fCorner = step( fd.x, fcl ) * step( fd.y, fcl ) * ( 1.0 - smoothstep( 1.0 * fk, 1.0 * fk + fw, fe ) );
          float fHatch = step( fract( ( fpm.x + fpm.y ) / ( 2.4 * fk ) ), 0.16 );
          float fa = min( fHalf.y * 0.5, 5.0 * fk );
          float fy = fpm.y - ( fHalf.y - fa );
          float fFront = step( 0.0, fy ) * ( 1.0 - smoothstep( fy * 0.75, fy * 0.75 + fw, abs( fpm.x ) ) );
          float fMid = 1.0 - smoothstep( 0.9 * fk, 0.9 * fk + fw, abs( fpm.x ) + abs( fpm.y ) );
          float fLine = fAxis * ( 1.0 - smoothstep( 6.0, 8.0, abs( fpm.x ) ) ) * step( fract( fpm.y / 80.0 ), 0.6 );
          float fAll = max( max( fBorder, fCorner ), max( fInner * 0.7, max( fFront * 0.75, max( fMid, fLine * 0.6 ) ) ) );
          outgoingLight = fColor;
          diffuseColor.a = max( fAll * 0.92, 0.1 + 0.16 * fHatch );
          #include <opaque_fragment>`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  set(f: Footprint | null): void {
    if (!f) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.u.fHalf.value.set(f.halfW, f.halfL);
    this.u.fColor.value.setHex(f.ok ? 0xdcf7e8 : 0xff8672);
    this.u.fAxis.value = f.axis ? 1 : 0;
    const key = `${f.x.toFixed(1)}:${f.z.toFixed(1)}:${f.heading.toFixed(3)}:${f.halfW}:${f.halfL}:${terrainEdits.version}`;
    if (key === this.key) return;
    this.key = key;
    // Sağ ve ileri eksen (ön cephe ileride): sim/roads.ts lotAt ile aynı
    const rx = Math.cos(f.heading);
    const rz = Math.sin(f.heading);
    const fx = Math.sin(f.heading);
    const fz = -Math.cos(f.heading);
    const n = FootprintGhost.N;
    const arr = (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    let k = 0;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const px = ((i / n) * 2 - 1) * f.halfW;
        const py = ((j / n) * 2 - 1) * f.halfL;
        const x = f.x + rx * px + fx * py;
        const z = f.z + rz * px + fz * py;
        arr[k++] = x;
        arr[k++] = groundLevel(x, z) + 0.7;
        arr[k++] = z;
      }
    }
    this.mesh.geometry.getAttribute('position').needsUpdate = true;
  }
}

/** Araziye oturan halka (itfaiye merkezinin kapsama alanı). */
export class RangeRing {
  readonly line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb0a0, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
  private key = '';

  constructor() {
    this.line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(121 * 3), 3));
    this.line.frustumCulled = false;
    this.line.renderOrder = 4;
    this.line.visible = false;
  }

  set(c: { x: number; z: number; r: number } | null): void {
    if (!c) {
      this.line.visible = false;
      return;
    }
    this.line.visible = true;
    const key = `${c.x.toFixed(1)}:${c.z.toFixed(1)}:${c.r}:${terrainEdits.version}`;
    if (key === this.key) return;
    this.key = key;
    const arr = (this.line.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const x = c.x + Math.cos(a) * c.r;
      const z = c.z + Math.sin(a) * c.r;
      arr.set([x, groundLevel(x, z) + 4, z], i * 3);
    }
    this.line.geometry.getAttribute('position').needsUpdate = true;
  }
}
