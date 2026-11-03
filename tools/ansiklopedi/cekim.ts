// Ansiklopedi görselleri: oyunun kendi uçak modelleri, tarayıcıda (vite geliştirme sunucusu) çizilir. gorseller.mjs
// bu modülü sayfaya yükleyip her uçak için üç görsel alır:
//   34   3/4 önden, şeffaf zemin (kart ve sayfa başı), 1200×750 webp
//   yan  yandan profil, şeffaf zemin, 1600×600 webp
//   og   3/4 önden, gök renginde zemin (paylaşım kartı), 1200×630 jpg

import * as THREE from 'three';
import { buildAircraftModel } from '../../src/render/models';
import { SPECS } from '../../src/sim/aircraft/specs';

export type View = '34' | 'yan' | 'og';

const SIZE: Record<View, [number, number]> = { '34': [1200, 750], yan: [1600, 600], og: [1200, 630] };

/** Sayfalardaki --sky geçişiyle aynı zemin. */
function sky(w: number, h: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, w * 0.45, h);
  grad.addColorStop(0, '#dbe8ee');
  grad.addColorStop(0.55, '#eef0ea');
  grad.addColorStop(1, '#f4ebdf');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Modeli kadraja sığdır: köşelerin ekrandaki yayılımına göre yakınlaştır, kutunun ortasına bak. */
function frame(cam: THREE.Camera & { zoom: number; updateProjectionMatrix(): void }, box: THREE.Box3, fill: number): void {
  const pts: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
  cam.zoom = 1;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  let ext = 0;
  for (const p of pts) {
    const v = p.clone().project(cam);
    ext = Math.max(ext, Math.abs(v.x), Math.abs(v.y));
  }
  cam.zoom = fill / ext;
  cam.updateProjectionMatrix();
}

export function shot(id: string, view: View): string {
  const spec = SPECS[id];
  if (!spec) throw new Error(`uçak yok: ${id}`);
  const [w, h] = SIZE[view];
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: view !== 'og', preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  if (view === 'og') scene.background = sky(w, h);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc4b4, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 6, 4);
  scene.add(sun);

  const m = buildAircraftModel(spec.model, { gear: false, detail: 1 });
  if (m.disc) m.disc.visible = false;
  for (const p of m.props) p.rotation.z = 0.4;
  const root = m.root;
  scene.add(root);

  let cam: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  if (view === 'yan') {
    // Düz profil: dik kamera tam yandan (burun solda)
    const R = m.radius * 2;
    cam = new THREE.OrthographicCamera(-R * (w / h), R * (w / h), R, -R, 0.1, R * 10);
    cam.position.set(R * 4, 0, 0);
    cam.lookAt(0, 0, 0);
  } else {
    // 3/4 önden, hafif üstten; uçak hafif yatışta (uçarken)
    root.rotation.set(0.12, -0.72, -0.1);
    cam = new THREE.PerspectiveCamera(24, w / h, 0.5, 4000);
    cam.position.set(0, m.radius * 0.75, m.radius * 4.2);
    cam.lookAt(0, 0, 0);
  }
  root.updateMatrixWorld(true);
  // Yalnız görünen parçalar: gizli takım ve iniş farının yerdeki ışığı kadrajı büyütmesin
  const box = new THREE.Box3();
  root.traverseVisible((o) => {
    if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true);
  });
  const c = box.getCenter(new THREE.Vector3());
  // Kutunun ortasına bak (yalnız kamera kayar, yön aynı kalır)
  cam.position.add(c);
  cam.lookAt(c);
  frame(cam, box, view === 'og' ? 0.8 : view === 'yan' ? 0.84 : 0.96);
  r.render(scene, cam);
  const url = r.domElement.toDataURL(view === 'og' ? 'image/jpeg' : 'image/webp', view === 'og' ? 0.88 : 0.9);
  r.dispose();
  return url;
}
