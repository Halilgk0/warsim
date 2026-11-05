// Uçak küçük resimleri: araştırma ağacı ve listeler için modelin 3/4 üstten görüntüsü, bir kez çizilip önbelleğe alınır.

import * as THREE from 'three';
import { SPECS } from '../sim/aircraft/specs';
import { buildAircraftModel } from './models';

const W = 240;
const H = 128;
const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

function init(): void {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc4b4, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, W / H, 0.5, 2000);
}

/** Uçağın küçük resmi (data URL). */
export function aircraftThumb(specId: string, color = 0x6f86b8): string {
  const key = `${specId}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = SPECS[specId];
  if (!spec) return '';
  if (!renderer) init();
  const r = renderer!;
  const sc = scene!;
  const cam = camera!;
  const model = buildAircraftModel(spec.model);
  const root = model.root;
  root.rotation.set(0.32, -0.75, 0.08);
  for (const p of model.props) p.rotation.z = 0.4;
  sc.add(root);
  const rad = model.radius;
  cam.position.set(0, rad * 0.9, rad * 3.1);
  cam.lookAt(0, 0, 0);
  r.render(sc, cam);
  const url = r.domElement.toDataURL('image/png');
  sc.remove(root);
  cache.set(key, url);
  return url;
}
