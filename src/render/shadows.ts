import * as THREE from 'three';

/**
 * Güneş gölgesi (2026-11-17; yalnız Yüksek kalitede, Ayarlar → Grafik → Güneş gölgesi): yapılar, çiftlikler, harita süsleri
 * ve park eden uçaklar araziye ve birbirine gölge düşürür. Gölgesiz yapı yerde havada duruyor gibi görünüyordu.
 *
 * Gölge haritası her karede çizilmez (telefon kare hızı): kamera hedefi gölge alanının %4'ünden fazla kayınca,
 * yakınlaşma %6 değişince, ışık 0,25° dönünce ve en geç saniyede bir (yeni yapı, inşaat, park eden uçak) yeniden çizilir.
 *
 * Gölge alanı kameranın baktığı yerin çevresinde bir kare; yarı genişliği kamera uzaklığıyla büyür, biraz ileri (görünen
 * tarafa) kaydırılır. Gölge yalnız yakınlaşınca açıktır (kamera 2,2 km'den yakın; 2,6 km'de kapanır): asıl maliyet gölge
 * alan her pikselin 16 örneği. Telefon çözünürlüğünde (2532×1170) ölçüm (2026-11-18, masaüstü ekran kartı): strateji
 * görünümünde (2,6 km) kare 4,6 → 8,6 ms, 700 m'den 3,8 → 6,3 ms idi; uzakta bina gölgesi zaten birkaç piksel.
 * Işığın gölge durumu değişince malzemeler yeniden seçilir (ilk geçişte bir kez derlenir, sonra önbellekte).
 */
export class ShadowRig {
  private on = false;
  /** Gölge şu an çiziliyor (açık ve kamera yeterince yakın). */
  private active = false;
  private readonly center = new THREE.Vector3();
  private readonly drawnAt = new THREE.Vector3(1e9, 0, 0);
  private readonly drawnDir = new THREE.Vector3();
  private drawnHalf = 0;
  private age = 0;
  private readonly fwd = new THREE.Vector3();
  private readonly rot = new THREE.Matrix4();
  private readonly inv = new THREE.Matrix4();
  private readonly ls = new THREE.Vector3();
  private readonly UP = new THREE.Vector3(0, 1, 0);
  private readonly ORIGIN = new THREE.Vector3();
  static readonly MAP = 2048;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly sun: THREE.DirectionalLight,
    scene: THREE.Scene,
  ) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    const s = sun.shadow;
    s.mapSize.set(ShadowRig.MAP, ShadowRig.MAP);
    s.camera.near = 10;
    s.camera.far = 7000;
    sun.castShadow = false;
    scene.add(sun.target);
  }

  /** Ayar: aç/kapat (kamera uzaklığı ayrıca belirler; update). */
  setEnabled(on: boolean): void {
    this.on = on;
  }

  get enabled(): boolean {
    return this.on;
  }

  /**
   * Her kare (atmosfer güncellendikten sonra): ışığı gölge alanının ortasına taşır (yön aynı kalır), gerekirse gölge
   * haritasını yeniden çizdirir. roots: gölge düşüren ve alan nesnelerin kökleri (bayrakları yeniden çizimde konur).
   */
  update(target: THREE.Vector3, camera: THREE.Camera, distance: number, lightDir: THREE.Vector3, dt: number, roots: THREE.Object3D[]): void {
    const s = this.sun.shadow;
    // Görünür taraf: hedeften kameranın bakış yönünde biraz ileri
    this.fwd.subVectors(target, camera.position).setY(0);
    if (this.fwd.lengthSq() > 1e-6) this.fwd.normalize();
    const half = Math.min(1700, Math.max(110, distance * 1.0));
    this.center.copy(target).addScaledVector(this.fwd, half * 0.35);
    // Işık uzayında kaydırmayı doku hücresine oturt: yeniden çizimde gölge kenarları kıpırdamasın
    const texel = (2 * half) / ShadowRig.MAP;
    this.rot.lookAt(lightDir, this.ORIGIN, this.UP);
    this.inv.copy(this.rot).invert();
    this.ls.copy(this.center).applyMatrix4(this.inv);
    this.ls.x = Math.round(this.ls.x / texel) * texel;
    this.ls.y = Math.round(this.ls.y / texel) * texel;
    this.center.copy(this.ls).applyMatrix4(this.rot);
    this.sun.position.copy(this.center).addScaledVector(lightDir, 3500);
    this.sun.target.position.copy(this.center);
    this.sun.target.updateMatrixWorld();
    // Uzakta kapalı (eşikte titremesin diye açılış ve kapanış uzaklığı ayrı); kapanmadan önce söner
    const want = this.on && distance < (this.active ? NEAR_OFF : NEAR_ON);
    if (want !== this.active) {
      this.active = want;
      this.sun.castShadow = want;
      this.drawnHalf = 0;
    }
    if (!want) return;
    s.intensity = 0.82 * (1 - smooth(1700, NEAR_OFF, distance));
    this.age += dt;
    const moved = Math.hypot(this.center.x - this.drawnAt.x, this.center.z - this.drawnAt.z) > half * 0.04;
    const zoomed = Math.abs(half - this.drawnHalf) > this.drawnHalf * 0.06;
    const turned = lightDir.dot(this.drawnDir) < 0.99999;
    if (!moved && !zoomed && !turned && this.age < 1) return;
    if (moved || zoomed) {
      const cam = s.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.updateProjectionMatrix();
      this.drawnHalf = half;
    }
    s.normalBias = texel * 1.1;
    s.bias = -0.00002;
    this.drawnAt.copy(this.center);
    this.drawnDir.copy(lightDir);
    this.age = 0;
    for (const r of roots) mark(r);
    this.renderer.shadowMap.needsUpdate = true;
  }
}

/** Gölgenin açıldığı ve kapandığı kamera uzaklığı (m). */
const NEAR_ON = 2200;
const NEAR_OFF = 2600;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Gölge bayrakları: opak ışıklı malzemeli ağlar gölge düşürür; yapı malzemesi (arch) ve Lambert gölge alır. Saydam,
 * ışıksız (lamba, halka, parlama) ve çizgi nesneleri katılmaz.
 */
function mark(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    const lit = !!mat && !mat.transparent && ((mat as THREE.MeshLambertMaterial).isMeshLambertMaterial || (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial);
    m.castShadow = lit;
    m.receiveShadow = lit && !!mat.userData.arch;
  });
}
