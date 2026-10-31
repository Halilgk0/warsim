// Yapı ışıkları (hava üssü): pist kenarı, eşik ve pist sonu lambaları, yaklaşma ışıkları, taksi yolu, apron
// projektörleri, engel ışıkları, hangar içi. Her lamba kameraya dönük küçük parıltı: yakında gerçek boyunda, uzakta en
// az birkaç piksel (strateji görünümünde de seçilir). Projektörlerin altında yerde ışık havuzu. Akşam yanar, gündüz
// söner (sönükken üçgenler sıfıra çöker, çizim maliyeti yok); bazıları yanıp söner. Yapı başına iki çizim çağrısı.

import * as THREE from 'three';
import { archU } from './arch';

/** Kare başına: bir pikselin derinlik başına metre karşılığı ve zaman (yanıp sönme). */
export const lampU = {
  lampPx: { value: 0.002 },
  lampTime: { value: 0 },
};

/** Kameradan ve ekran yüksekliğinden (CSS piksel) piksel ölçeği; dünya zamanı. */
export function updateLamps(cam: THREE.PerspectiveCamera, viewH: number, time: number): void {
  lampU.lampPx.value = (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(viewH, 1);
  lampU.lampTime.value = time;
}

/** Lamba renkleri (gerçek havaalanı ışıklarına yakın). */
export const LAMP = {
  edge: 0xffdca0,
  green: 0x58ff8c,
  red: 0xff3a24,
  blue: 0x4f78ff,
  flood: 0xffd28a,
  warm: 0xffb366,
  white: 0xf4f6ff,
};

type Shader = { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string };

/** Sisin rengi yerine sönümü: eklemeli ışık sisin içinde kaybolur (sis rengini eklemez). */
const FOG_FADE = /* glsl */ `
  #ifdef USE_FOG
    float fogDist = length( vFogRel );
    vec3 fogDir = vFogRel / max( fogDist, 1e-3 );
    float fogFactor = max( atmoFogAmount( cameraPosition.y, fogDir, fogDist ), smoothstep( fogNear, fogFar, fogDist ) );
    gl_FragColor.rgb *= 1.0 - fogFactor;
  #endif
`;

/**
 * Lamba: örnek matrisinde yalnız yer; lampP = (çekirdek yarıçapı m, en az piksel yarıçapı, yanıp sönme süresi s,
 * evre). Dörtgen çekirdeğin 5 katı: dışı yumuşak hale. Akşamın başında yanar (archNight), sönükken çöker.
 */
function lampShader(shader: Shader): void {
  Object.assign(shader.uniforms, lampU, archU);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 lampP;\nuniform float lampPx;\nuniform float lampTime;\nuniform float archNight;\nvarying vec3 vLamp;')
    .replace(
      '#include <project_vertex>',
      /* glsl */ `
      float on = smoothstep( 0.05, 0.45, archNight );
      if ( lampP.z > 0.0 ) on *= step( 0.55, fract( lampTime / lampP.z + lampP.w ) );
      vec4 hv = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
      float depth = max( - hv.z, 1.0 );
      float px = lampPx * depth;
      float r = max( lampP.x, px * lampP.y );
      // Uzakta piksel sınırına dayanan lamba biraz söner (bir sürü lamba ekranı kaplamasın)
      // Dörtgen ±0,1: çekirdeğin 5 katına (r birimiyle ±5) büyür
      vLamp = vec3( position.xy * 50.0, on * clamp( lampP.x / max( r, 1e-4 ) * 3.0 + 0.45, 0.45, 1.0 ) );
      // Yere yakın lamba yüzeyin içinde kalmasın: kameraya doğru az çekilir
      hv.xyz *= max( depth - 1.5, 0.5 ) / depth;
      vec4 mvPosition = vec4( hv.xyz + vec3( position.xy * r * 50.0, 0.0 ) * on, 1.0 );
      gl_Position = projectionMatrix * mvPosition;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLamp;')
    .replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      float lu = length( vLamp.xy );
      float lCore = 1.0 - smoothstep( 0.55, 1.0, lu );
      float lHalo = exp( - lu * lu * 0.09 ) * ( 1.0 - smoothstep( 3.5, 5.0, lu ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), lCore * 0.55 ) * 2.4;
      diffuseColor.a = ( lCore + 0.5 * lHalo ) * vLamp.z;`,
    )
    .replace('#include <fog_fragment>', FOG_FADE);
}

/** Işık havuzu: yere yatık dörtgen, ortadan dışa sönen sıcak ışık (gece). */
function poolShader(shader: Shader): void {
  Object.assign(shader.uniforms, archU);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float archNight;\nvarying vec3 vPool;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float on = smoothstep( 0.05, 0.45, archNight );
      vPool = vec3( position.xz * 2.0, on );
      transformed *= on;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vPool;')
    .replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      float pu = length( vPool.xy );
      float pl = ( 1.0 - smoothstep( 0.0, 1.0, pu ) );
      diffuseColor.a = pl * pl * vPool.z;`,
    )
    .replace('#include <fog_fragment>', FOG_FADE);
}

let lampMat: THREE.MeshBasicMaterial | null = null;
let poolMat: THREE.MeshBasicMaterial | null = null;

function materials(): [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial] {
  if (!lampMat || !poolMat) {
    lampMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    lampMat.onBeforeCompile = lampShader;
    lampMat.customProgramCacheKey = () => 'lamp';
    poolMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    poolMat.onBeforeCompile = poolShader;
    poolMat.customProgramCacheKey = () => 'lampPool';
  }
  return [lampMat, poolMat];
}

const LAMP_GEO = new THREE.PlaneGeometry(0.2, 0.2);
const POOL_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

interface Lamp { x: number; y: number; z: number; color: number; r: number; px: number; blink: number; phase: number }
interface Pool { x: number; y: number; z: number; r: number; color: number; k: number }

/** Lambaları ve ışık havuzlarını toplar; build() iki InstancedMesh ekler (yapı ekseninde). */
export class LampSet {
  private readonly lamps: Lamp[] = [];
  private readonly pools: Pool[] = [];

  /** r: çekirdek yarıçapı (m); px: uzakta en az piksel yarıçapı; blink: yanıp sönme süresi (s, 0 sabit). */
  lamp(x: number, y: number, z: number, color: number, r = 0.25, px = 1.4, blink = 0, phase = 0): void {
    this.lamps.push({ x, y, z, color, r, px, blink, phase });
  }

  /** a'dan b'ye düz çizgide, en fazla step aralıkla lamba dizisi (iki uç dahil). */
  row(ax: number, az: number, bx: number, bz: number, step: number, y: number, color: number, r = 0.25, px = 1.4): void {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 0; i <= n; i++) this.lamp(ax + ((bx - ax) * i) / n, y, az + ((bz - az) * i) / n, color, r, px);
  }

  /** Yerde ışık havuzu (y: yüzeyin üst kotu), k: parlaklık. */
  pool(x: number, y: number, z: number, r: number, color = LAMP.flood, k = 0.32): void {
    this.pools.push({ x, y, z, r, color, k });
  }

  build(into: THREE.Object3D): void {
    const [lm, pm] = materials();
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    if (this.lamps.length) {
      const n = this.lamps.length;
      const geo = LAMP_GEO.clone();
      const p = new Float32Array(n * 4);
      const mesh = new THREE.InstancedMesh(geo, lm, n);
      this.lamps.forEach((l, i) => {
        mesh.setMatrixAt(i, m4.makeTranslation(l.x, l.y, l.z));
        mesh.setColorAt(i, c.setHex(l.color));
        p.set([l.r, l.px, l.blink, l.phase], i * 4);
      });
      geo.setAttribute('lampP', new THREE.InstancedBufferAttribute(p, 4));
      mesh.computeBoundingSphere();
      mesh.boundingSphere!.radius += 150;
      // Saydamlardan sonra (duman ve bulutun önünde kalmasın diye derinlikle sınanır)
      mesh.renderOrder = 4;
      into.add(mesh);
    }
    if (this.pools.length) {
      const mesh = new THREE.InstancedMesh(POOL_GEO, pm, this.pools.length);
      this.pools.forEach((q, i) => {
        mesh.setMatrixAt(i, m4.makeScale(q.r * 2, 1, q.r * 2).setPosition(q.x, q.y + 0.05, q.z));
        mesh.setColorAt(i, c.setHex(q.color).multiplyScalar(q.k));
      });
      mesh.computeBoundingSphere();
      mesh.renderOrder = 2;
      into.add(mesh);
    }
  }
}
