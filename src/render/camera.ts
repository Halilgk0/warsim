// Strateji kamerası: yere bakan, eğimli, yörünge tipi. Sürükle = kaydır, sağ sürükle = döndür,
// tekerlek = imlece doğru yakınlaş, WASD/oklar = kaydır, Q/E = döndür.
// Dokunmatik: tek parmak kaydırır; iki parmak yakınlaştırır (parmakların ortasına doğru), çevirince döndürür,
// birlikte yukarı/aşağı kaydırınca eğer; dokunuş seçer, çift dokunuş çift tık, uzun basış sağ tık sayılır.

import * as THREE from 'three';
import { DEG, clamp } from '../core/math';
import { rayTerrain } from './terrain';
import { groundLevel } from '../sim/terrain';

export class CameraRig {
  readonly target = new THREE.Vector3();
  distance = 30000;
  yaw = 0;
  pitch = 58 * DEG;
  followFn: (() => THREE.Vector3 | null) | null = null;
  onClick: ((x: number, y: number) => void) | null = null;
  /** Çift tık (sürüklemeden). */
  onDoubleClick: ((x: number, y: number) => void) | null = null;
  /** Son tıklama dokunmatik miydi (inşada dokunuş önce hayaleti taşır). */
  lastTouch = false;
  /** Yumuşak kamera uçuşu: hedefe ve uzaklığa geçiş. */
  private fly: { from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; t: number; dur: number } | null = null;
  /** Sağ tık (sürüklemeden). */
  onRightClick: ((x: number, y: number) => void) | null = null;
  /** Fare hareketi (sürüklemiyorken). */
  onHover: ((x: number, y: number) => void) | null = null;
  private keys = new Set<string>();
  private drag: { button: number; x: number; y: number; moved: boolean; touch: boolean } | null = null;
  /** Ekrandaki parmaklar ve iki parmak hareketinin son durumu. */
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; a: number; mx: number; my: number } | null = null;
  private lastTap = { t: -1e9, x: 0, y: 0 };
  private pressTimer = 0;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ndc = new THREE.Vector2();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    readonly dom: HTMLElement,
  ) {
    // Dokunmatik mi: sayfadaki her basışta (düğmeler dahil) güncellenir; ipuçları ve inşa buna göre davranır
    window.addEventListener('pointerdown', (e) => {
      this.lastTouch = e.pointerType === 'touch';
    }, { capture: true });
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('dblclick', (e) => {
      // Dokunmatikte çift dokunuş kendi sayılır
      if (this.lastTouch) return;
      const r = this.dom.getBoundingClientRect();
      this.onDoubleClick?.(e.clientX - r.left, e.clientY - r.top);
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Hedef noktasında 1 metrenin ekrandaki piksel karşılığı. */
  get pixelsPerMeter(): number {
    return this.dom.clientHeight / (2 * this.distance * Math.tan((this.camera.fov * DEG) / 2));
  }

  /**
   * Uçak modeli büyütmesi: yakında gerçek boyut, uzaklaştıkça en fazla 6 kat (orantı bozulmasın).
   * Daha uzakta uçaklar simgeyle gösterilir.
   */
  get modelScale(): number {
    return clamp(16 / (11 * this.pixelsPerMeter), 1, 6);
  }

  /** Kol başına tek etiket (orta ve uzak görünümde kalabalık olmasın). */
  get groupLabels(): boolean {
    return 16 / (11 * this.pixelsPerMeter) > 4;
  }

  /** Uçak simgeleri gösterilsin mi: yalnız çok uzakta, 6 kat büyütülmüş model bile birkaç piksele indiğinde. */
  get iconMode(): boolean {
    return 16 / (11 * this.pixelsPerMeter) > 14;
  }

  /** Efekt (duman, patlama, iz mermisi) büyütmesi: geçici oldukları için daha serbest. */
  get fxScale(): number {
    return clamp(this.distance / 450, 1, 40);
  }

  get following(): boolean {
    return this.followFn !== null;
  }

  /**
   * Takibi bırak: hedef noktası bakış doğrultusunda zemine kaydırılır ve uzaklık aynı oranda artar.
   * Kamera yerinden oynamaz; sonra kaydırma ve yakınlaştırma zemine göre çalışır.
   */
  release(): void {
    if (!this.followFn) return;
    this.followFn = null;
    if (this.pitch < 15 * DEG) {
      // Uçağın altından bakarken bırakıldı: kamerayı yukarı al
      this.pitch = 25 * DEG;
      this.apply();
    }
    this.anchorToGround();
  }

  /** Hedef yerdeyse dokunmaz; havadaysa kamerayı oynatmadan zemine taşır. */
  private anchorToGround(): void {
    const sp = Math.max(Math.sin(this.pitch), 0.2);
    const cp = Math.cos(this.pitch);
    const ux = Math.sin(this.yaw) * cp;
    const uz = Math.cos(this.yaw) * cp;
    for (let i = 0; i < 3; i++) {
      const g = groundLevel(this.target.x, this.target.z);
      const dy = this.target.y - g;
      if (Math.abs(dy) < 1) break;
      const s = dy / sp;
      this.target.x -= ux * s;
      this.target.y -= sp * s;
      this.target.z -= uz * s;
      this.distance = clamp(this.distance + s, 30, 480000);
    }
  }

  /** Süren yumuşak uçuşu kes (ana menü ve kayıt yüklemede kamera doğrudan konumlanır). */
  stopFly(): void {
    this.fly = null;
  }

  /** Bir noktaya yumuşak uçuş (çift tık, listeden seçim). */
  flyTo(p: THREE.Vector3, distance: number, dur = 0.7): void {
    this.followFn = null;
    this.fly = { from: this.target.clone(), to: p.clone(), d0: this.distance, d1: distance, t: 0, dur };
  }

  update(dt: number): void {
    const k = this.keys;
    let right = 0;
    let up = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) up += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) up -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) right += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) right -= 1;
    if (right || up) {
      this.release();
      this.fly = null;
      const sp = this.distance * 0.8 * dt;
      this.pan(right * sp, up * sp);
    }
    if (k.has('KeyQ')) this.yaw += 1.2 * dt;
    if (k.has('KeyE')) this.yaw -= 1.2 * dt;

    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = f.t * f.t * (3 - 2 * f.t);
      this.target.lerpVectors(f.from, f.to, k);
      // Uzaklık logaritmik geçer (büyük farklarda doğal görünür)
      this.distance = Math.exp(Math.log(f.d0) + (Math.log(f.d1) - Math.log(f.d0)) * k);
      if (f.t >= 1) this.fly = null;
    } else if (this.followFn) {
      const p = this.followFn();
      if (p) {
        // Yakınsa doğrudan kilitlen (titreme olmasın), uzaksa hızla yetiş
        if (this.target.distanceToSquared(p) < 4) this.target.copy(p);
        else this.target.lerp(p, 1 - Math.exp(-dt * 10));
      } else this.release();
    } else {
      const g = groundLevel(this.target.x, this.target.z);
      this.target.y += (g - this.target.y) * (1 - Math.exp(-dt * 2));
    }
    this.apply();
  }

  apply(): void {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const d = this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * d,
      this.target.y + sp * d,
      this.target.z + Math.cos(this.yaw) * cp * d,
    );
    // Alttan bakışta kamera araziye girmesin
    const gy = groundLevel(this.camera.position.x, this.camera.position.z) + 4;
    if (this.camera.position.y < gy) this.camera.position.y = gy;
    this.camera.lookAt(this.target);
    const near = Math.max(0.5, d * 0.004);
    const far = d * 6 + 80000;
    if (Math.abs(near - this.camera.near) > 1e-3 || Math.abs(far - this.camera.far) > 1) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Ekran sağı / ekran yukarısı yönünde zemin üzerinde kaydırır. */
  pan(right: number, up: number): void {
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    this.target.x += cy * right - sy * up;
    this.target.z += -sy * right - cy * up;
  }

  /** Ekran noktasının arazi üzerindeki karşılığı (arazi yoksa deniz seviyesi düzlemi). */
  groundAt(x: number, y: number, out: THREE.Vector3): boolean {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (rayTerrain(this.raycaster.ray, out)) return true;
    return this.raycaster.ray.intersectPlane(this.plane, out) !== null;
  }

  private onDown = (e: PointerEvent): void => {
    const touch = e.pointerType === 'touch';
    this.lastTouch = touch;
    if (touch) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) {
        // İkinci parmak: kaydırma ve dokunuş biter, iki parmak hareketi başlar
        this.drag = null;
        window.clearTimeout(this.pressTimer);
        this.pinch = this.pinchState();
        return;
      }
    }
    this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: false, touch };
    if (touch) {
      const x = e.clientX;
      const y = e.clientY;
      window.clearTimeout(this.pressTimer);
      this.pressTimer = window.setTimeout(() => {
        // Uzun basış: sağ tık (inşa ve haritadan seçim iptali)
        if (this.drag && !this.drag.moved && this.touches.size === 1) {
          this.drag = null;
          const r = this.dom.getBoundingClientRect();
          this.onRightClick?.(x - r.left, y - r.top);
        }
      }, 650);
    }
  };

  /** İki parmağın uzaklığı, açısı ve ortası. */
  private pinchState(): { d: number; a: number; mx: number; my: number } | null {
    const [p, q] = [...this.touches.values()];
    if (!p || !q) return null;
    return { d: Math.max(Math.hypot(q.x - p.x, q.y - p.y), 1), a: Math.atan2(q.y - p.y, q.x - p.x), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
  }

  /** İki parmak: yakınlaş (ortaya doğru), döndür, eğ. */
  private onPinch(): void {
    const prev = this.pinch;
    const now = this.pinchState();
    if (!prev || !now) return;
    this.pinch = now;
    this.fly = null;
    const r = this.dom.getBoundingClientRect();
    const x = now.mx - r.left;
    const y = now.my - r.top;
    const before = new THREE.Vector3();
    const anchor = !this.followFn && this.groundAt(x, y, before);
    this.distance = clamp(this.distance * (prev.d / now.d), 30, 480000);
    let da = now.a - prev.a;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    // Harita parmaklarla aynı yönde döner (yaw artınca harita ekranda saat yönünde döner)
    this.yaw += da;
    this.pitch = clamp(this.pitch + (now.my - prev.my) * 0.004, (this.followFn ? -75 : 15) * DEG, 89 * DEG);
    this.apply();
    if (anchor) {
      const after = new THREE.Vector3();
      if (this.groundAt(x, y, after)) {
        this.target.x += before.x - after.x;
        this.target.z += before.z - after.z;
        this.apply();
      }
    }
  }

  private onCancel = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    this.drag = null;
    window.clearTimeout(this.pressTimer);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch) {
        this.onPinch();
        return;
      }
    }
    const d = this.drag;
    if (!d) {
      if (this.onHover && e.target === this.dom) {
        const r = this.dom.getBoundingClientRect();
        this.onHover(e.clientX - r.left, e.clientY - r.top);
      }
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // Parmak titrer: dokunuşta eşik daha geniş
    if (!d.moved && Math.hypot(dx, dy) < (d.touch ? 10 : 4)) return;
    d.moved = true;
    window.clearTimeout(this.pressTimer);
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.button === 0) {
      const wpp = (2 * this.distance * Math.tan((this.camera.fov * DEG) / 2)) / this.dom.clientHeight;
      this.release();
      this.fly = null;
      this.pan(-dx * wpp, (dy * wpp) / Math.max(Math.sin(this.pitch), 0.3));
    } else {
      this.yaw -= dx * 0.005;
      // Uçak takip edilirken kamera uçağın altına da inebilir; serbest kamerada zemine bakar
      this.pitch = clamp(this.pitch + dy * 0.004, (this.followFn ? -75 : 15) * DEG, 89 * DEG);
    }
  };

  private onUp = (e: PointerEvent): void => {
    window.clearTimeout(this.pressTimer);
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.pinch) {
        // İki parmak hareketinden sonra kalan parmak dokunuş ya da kaydırma sayılmaz
        if (this.touches.size < 2) this.pinch = null;
        this.drag = null;
        return;
      }
    }
    const d = this.drag;
    this.drag = null;
    if (d && !d.moved) {
      const r = this.dom.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (d.button === 0) this.onClick?.(x, y);
      else if (d.button === 2) this.onRightClick?.(x, y);
      if (d.touch && d.button === 0) {
        // Çift dokunuş: 350 ms ve 30 px içinde ikinci dokunuş
        const now = performance.now();
        if (now - this.lastTap.t < 350 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 30) {
          this.lastTap.t = -1e9;
          this.onDoubleClick?.(x, y);
        } else this.lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.0012);
    const r = this.dom.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const before = new THREE.Vector3();
    this.fly = null;
    const anchor = !this.followFn && this.groundAt(x, y, before);
    this.distance = clamp(this.distance * factor, 30, 480000);
    this.apply();
    if (anchor) {
      const after = new THREE.Vector3();
      if (this.groundAt(x, y, after)) {
        this.target.x += before.x - after.x;
        this.target.z += before.z - after.z;
        this.apply();
      }
    }
  };
}
