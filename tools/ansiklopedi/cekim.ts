// Ansiklopedi görselleri: oyunun kendi uçak modelleri, tarayıcıda (vite geliştirme sunucusu) çizilir. gorseller.mjs
// bu modülü sayfaya yükleyip her uçak için üç görsel alır:
//   34   3/4 önden, şeffaf zemin (kart ve sayfa başı), 1200×750 webp
//   yan  yandan profil, şeffaf zemin, 1600×600 webp
//   og   3/4 önden, gök renginde zemin (paylaşım kartı), 1200×630 jpg
//   kart liste kartı: burun sağda, 3/4 önden, alçak açı; kadraj dolu piksellere göre (uçak ortada, alanı doldurur), 1200×750 webp

//   gun-<silah>-kart / -og  hava savunması: üretim listesindeki açıyla (namlu kalkık), kart 1200×750 webp, paylaşım 1200×630 jpg

import * as THREE from 'three';
import { buildAircraftModel } from '../../src/render/models';
import { buildAAGun } from '../../src/render/structures';
import { SPECS } from '../../src/sim/aircraft/specs';
import type { AAWeaponId } from '../../src/sim/structures/aaWeapons';

export type View = '34' | 'yan' | 'og' | 'kart';

const SIZE: Record<View, [number, number]> = { '34': [1200, 750], yan: [1600, 600], og: [1200, 630], kart: [1200, 750] };

/** Dolu piksellere göre kadraj: önce geniş çizer, saydam olmayan alanı ölçer, kamerayı ona göre daraltıp yeniden çizer. */
function pixelFrame(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, margin: number): void {
  r.render(scene, cam);
  const gl = r.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= 16) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) return;
  const vh = Math.max(y1 - y0 + 1, (x1 - x0 + 1) * (h / w)) * margin;
  const vw = vh * (w / h);
  // readPixels satırları alttan sayar, setViewOffset üstten.
  const cx = (x0 + x1 + 1) / 2;
  const cy = h - (y0 + y1 + 1) / 2;
  cam.setViewOffset(w, h, cx - vw / 2, cy - vh / 2, vw, vh);
}

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

/** Uçaksavar silahı: üretim listesi resmiyle aynı duruş; kadraj dolu piksellere göre, paylaşım görselinde arkada gök. */
export function shotGun(id: AAWeaponId, view: 'kart' | 'og'): string {
  const [w, h] = SIZE[view];
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  // Yapı malzemesi sis tanımı ister; bu yakınlıkta görünmez
  scene.fog = new THREE.Fog(0xffffff, 1e6, 2e6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc4b4, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const g = buildAAGun(id);
  (g.userData.pitch as THREE.Object3D).rotation.x = -0.6;
  g.rotation.y = 1.0;
  scene.add(g);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  const rad = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 1);
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.5, 2000);
  cam.position.set(c.x, c.y + rad * 0.6, c.z + rad * 3);
  cam.lookAt(c);
  // Saydam zeminde ölç; paylaşım görselinde gök sonra eklenir ve top biraz daha küçük durur
  pixelFrame(r, scene, cam, view === 'og' ? 1.3 : 1.08);
  if (view === 'og') scene.background = sky(w, h);
  r.render(scene, cam);
  const url = r.domElement.toDataURL(view === 'og' ? 'image/jpeg' : 'image/webp', view === 'og' ? 0.88 : 0.9);
  r.dispose();
  return url;
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

  if (view === 'kart') {
    // Burun sağa ve biraz bize dönük, uçak düz; kamera neredeyse göz hizasında (yalnız kanadın biçimi seçilecek kadar üstte).
    // Önce uzaktan geniş çizilir, kadraj dolu piksellere göre daraltılır.
    root.rotation.set(0, Math.PI / 2 - 0.62, 0);
    root.updateMatrixWorld(true);
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.5, 4000);
    cam.position.set(0, m.radius * 0.5, m.radius * 4.2);
    cam.lookAt(0, 0, 0);
    pixelFrame(r, scene, cam, 1.07);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/webp', 0.9);
    r.dispose();
    return url;
  }
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
