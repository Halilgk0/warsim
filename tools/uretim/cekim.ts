// Üretim listesi resimleri ve araştırma siluetleri: oyunun kendi modelleri, tarayıcıda (vite geliştirme sunucusu) çizilir. gorseller.mjs
// bu modülü sayfaya yükleyip her uçak ve top için webp alır. Oyun bu dosyaları kullanır: telefon bu pencereler için model kurmaz.

import * as THREE from 'three';
import { buildAircraftModel } from '../../src/render/models';
import { buildAAGun } from '../../src/render/structures';
import { SPECS } from '../../src/sim/aircraft/specs';
import { TECH } from '../../src/sim/tech';
import { AA_WEAPON_ORDER, type AAWeaponId } from '../../src/sim/structures/airDefense';

const W = 480;
const H = 256;
let renderer: THREE.WebGLRenderer | null = null;

function canvas(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

function lit(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc4b4, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  return scene;
}

/**
 * Modeli çerçeveye oturtur. Modellerin merkezi ve kapladığı alan farklı olduğu için önce geniş çizer, dolu pikselleri ölçer,
 * kadrajı onlara göre daraltıp yeniden çizer: hiçbir model kesilmez, hepsi çerçeveyi doldurur.
 */
function framedShot(sc: THREE.Scene, cam: THREE.PerspectiveCamera): string {
  const r = canvas();
  r.render(sc, cam);
  const gl = r.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= 16) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 >= x0) {
    const vh = Math.max(y1 - y0 + 1, (x1 - x0 + 1) * (H / W)) * 1.05;
    const vw = vh * (W / H);
    // readPixels satırları alttan sayar, setViewOffset üstten.
    const cx = (x0 + x1 + 1) / 2;
    const cy = h - (y0 + y1 + 1) / 2;
    cam.setViewOffset(w, h, cx - vw / 2, cy - vh / 2, vw, vh);
    r.render(sc, cam);
    cam.clearViewOffset();
  }
  return r.domElement.toDataURL('image/webp', 0.86);
}

/** Uçak: burnu sağa bakar. */
function aircraft(id: string): string {
  const scene = lit();
  const model = buildAircraftModel(SPECS[id].model);
  model.root.rotation.set(0.24, 1.12, 0.05);
  for (const p of model.props) p.rotation.z = 0.4;
  scene.add(model.root);
  const rad = model.radius;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.5, 2000);
  cam.position.set(0, rad * 0.42, rad * 3);
  cam.lookAt(0, 0, 0);
  return framedShot(scene, cam);
}

/** Top: 3/4 açıdan, namlu kalkık. Yapı malzemesi sis tanımı ister; bu kadar yakında sis görünmez. */
function gun(id: AAWeaponId): string {
  const scene = lit();
  scene.fog = new THREE.Fog(0xffffff, 1e6, 2e6);
  const g = buildAAGun(id);
  (g.userData.pitch as THREE.Object3D).rotation.x = -0.6;
  g.rotation.y = 1.0;
  scene.add(g);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 1);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.5, 2000);
  cam.position.set(c.x, c.y + r * 0.6, c.z + r * 3);
  cam.lookAt(c);
  return framedShot(scene, cam);
}

// ------------------------------------------------------------------ araştırma siluetleri

/** Çelik zeminde durum renkleri (research.ts INK aynı adları kullanır). */
const INKS: Record<string, number> = { done: 0xa6dcc0, active: 0xeccb8a, avail: 0xf0f4f1, locked: 0xaab4ae };
const PLAN = 192;
let planRenderer: THREE.WebGLRenderer | null = null;

function planCanvas(): THREE.WebGLRenderer {
  if (!planRenderer) {
    planRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    planRenderer.setPixelRatio(1);
    planRenderer.setSize(PLAN, PLAN, false);
    planRenderer.setClearColor(0x000000, 0);
  }
  return planRenderer;
}

const flat = (ink: number): THREE.Scene => {
  const sc = new THREE.Scene();
  sc.overrideMaterial = new THREE.MeshBasicMaterial({ color: ink, side: THREE.DoubleSide });
  return sc;
};

/** Uçağın üstten siluet çizimi, tek renk. */
function aircraftPlan(id: string, ink: number): string {
  const sc = flat(ink);
  const model = buildAircraftModel(SPECS[id].model, { detail: 0 });
  for (const p of model.props) p.visible = false;
  sc.add(model.root);
  const r = model.radius * 1.02;
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, 200);
  cam.position.set(0, 80, 0);
  cam.up.set(0, 0, 1);
  cam.lookAt(0, 0, 0);
  const pr = planCanvas();
  pr.render(sc, cam);
  return pr.domElement.toDataURL('image/webp', 0.9);
}

/** Topun yandan siluet çizimi, tek renk. Namlu kalkık, en tanınır duruş. */
function gunPlan(id: AAWeaponId, ink: number): string {
  const sc = flat(ink);
  const gun = buildAAGun(id);
  (gun.userData.pitch as THREE.Object3D).rotation.x = -0.75;
  sc.add(gun);
  gun.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gun);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.y, size.z) * 0.53;
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, 200);
  cam.position.set(60, c.y, c.z);
  cam.lookAt(0, c.y, c.z);
  const pr = planCanvas();
  pr.render(sc, cam);
  return pr.domElement.toDataURL('image/webp', 0.9);
}

/** Üretilecek dosya adları: ağaçtaki uçurulabilir uçaklar ve bütün toplar; siluetler her durum renginde. Sonraki aşama uçakları yalnız soluk. */
export function names(): string[] {
  const planes = TECH.filter((t) => t.kind === 'aircraft' && !t.future && t.specId && SPECS[t.specId]).map((t) => t.specId!);
  const later = TECH.filter((t) => t.kind === 'aircraft' && t.future && t.specId && SPECS[t.specId]).map((t) => t.specId!);
  const inks = Object.keys(INKS);
  return [
    ...planes.map((id) => `ac-${id}`),
    ...AA_WEAPON_ORDER.map((id) => `gun-${id}`),
    ...planes.flatMap((id) => inks.map((k) => `plan/ac-${id}-${k}`)),
    ...AA_WEAPON_ORDER.flatMap((id) => inks.map((k) => `plan/gun-${id}-${k}`)),
    ...later.map((id) => `plan/ac-${id}-locked`),
  ];
}

export function shot(name: string): string {
  if (name.startsWith('plan/')) {
    const rest = name.slice(5);
    const dash = rest.lastIndexOf('-');
    const ink = INKS[rest.slice(dash + 1)];
    const gunName = rest.startsWith('gun-');
    const planId = rest.slice(rest.indexOf('-') + 1, dash);
    return gunName ? gunPlan(planId as AAWeaponId, ink) : aircraftPlan(planId, ink);
  }
  const id = name.slice(name.indexOf('-') + 1);
  return name.startsWith('gun-') ? gun(id as AAWeaponId) : aircraft(id);
}
