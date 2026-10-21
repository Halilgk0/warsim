// Yer yapılarının görünümleri: hava üssü, uçaksavar bataryası, radar istasyonu, uçak fabrikası.
// Ölçüler gerçek boyutlara yakındır. İnşaat, hasar, tesis eklemeleri, silah yönleri ve park uçakları dahil.

import * as THREE from 'three';
import type { Structure } from '../sim/structures/structure';
import { AASite, type AAWeaponId } from '../sim/structures/airDefense';
import { RUNWAY_HALF } from '../sim/structures/airbase';
import { SPECS } from '../sim/aircraft/specs';
import { gearHeight } from '../sim/aircraft/flightModel';
import { buildAircraftModel } from './models';
import { buildCityModel } from './cityModels';
import { PALETTE } from './palette';
import { mulberry32 } from '../core/math';

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const BOXC = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0);
const CYLZ = new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5);
/** Kemer çatılı hangar: yarım silindir, uzunluk Z ekseninde. */
const ARCH = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
/** Üçgen prizma (testere dişi çatı), uzunluk X ekseninde. */
const PRISM = new THREE.CylinderGeometry(1, 1, 1, 3).rotateZ(Math.PI / 2);
const RING = new THREE.RingGeometry(0.965, 1, 96).rotateX(-Math.PI / 2);
const CRATER = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
const SANDBAG = new THREE.TorusGeometry(1, 0.22, 4, 14).rotateX(Math.PI / 2);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

/** Namlu: Z boyunca ileri uzanan silindir. */
function barrel(mat: THREE.Material, len: number, r: number, x: number, y: number, z = 0): THREE.Mesh {
  return mesh(CYLZ, mat, r, r, len, x, y, z);
}

/**
 * Uçaksavar silahı. Grup içinde userData.yaw (dönen taban) ve userData.pitch (yükselen namlu) bulunur.
 * Ölçüler gerçek silahlara yakın (12,7 mm dörtlü makineli … 88 mm Flak 36).
 */
function aaGun(w: AAWeaponId, mat: THREE.Material, dark: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const yawG = new THREE.Group();
  const pitchG = new THREE.Group();
  g.add(yawG);
  switch (w) {
    case 'mg': {
      // Dörtlü makineli taret (römork üstünde)
      g.add(mesh(BOX, mat, 1.7, 0.5, 2.2, 0, 0, 0));
      yawG.add(mesh(CYL, dark, 0.65, 0.55, 0.65, 0, 0.5, 0));
      yawG.add(mesh(BOX, mat, 1.5, 0.9, 0.08, 0, 0.9, 0.55));
      pitchG.position.y = 1.35;
      for (const [x, y] of [[-0.42, 0.12], [-0.42, -0.12], [0.42, 0.12], [0.42, -0.12]]) pitchG.add(barrel(dark, 1.45, 0.05, x, y, 0.1));
      pitchG.add(mesh(BOXC, mat, 0.22, 0.4, 0.5, -0.62, 0, -0.1));
      pitchG.add(mesh(BOXC, mat, 0.22, 0.4, 0.5, 0.62, 0, -0.1));
      break;
    }
    case 'aa20': {
      // Flak 38: haç biçimli platform, kalkan, şarjör
      g.add(mesh(BOXC, mat, 3.6, 0.16, 0.4, 0, 0.1, 0));
      g.add(mesh(BOXC, mat, 0.4, 0.16, 3.6, 0, 0.1, 0));
      yawG.add(mesh(CYL, dark, 0.38, 0.8, 0.38, 0, 0.18, 0));
      yawG.add(mesh(BOX, mat, 1.3, 0.95, 0.06, 0, 0.75, 0.55));
      yawG.add(mesh(BOX, mat, 0.35, 0.08, 0.35, -0.55, 0.65, -0.5));
      pitchG.position.y = 1.15;
      pitchG.add(mesh(BOXC, dark, 0.32, 0.32, 1.0, 0, 0, 0));
      pitchG.add(barrel(dark, 2.2, 0.045, 0, 0.04, 0.4));
      pitchG.add(mesh(BOXC, mat, 0.12, 0.35, 0.25, -0.24, 0.05, 0.1));
      break;
    }
    case 'aa20q': {
      // Flakvierling 38: üç kollu platform, 2 × 2 namlu, geniş kalkan, nişancı koltuğu
      for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
        const arm = mesh(BOXC, mat, 0.4, 0.16, 2.2, Math.sin(a) * 1.1, 0.1, Math.cos(a) * 1.1);
        arm.rotation.y = a;
        g.add(arm);
      }
      yawG.add(mesh(CYL, dark, 0.7, 0.6, 0.7, 0, 0.18, 0));
      yawG.add(mesh(BOX, mat, 2.1, 1.0, 0.06, 0, 0.75, 0.75));
      yawG.add(mesh(BOX, mat, 0.45, 0.5, 0.45, 0, 0.6, -0.8));
      pitchG.position.y = 1.25;
      pitchG.add(mesh(BOXC, dark, 0.95, 0.85, 0.9, 0, 0, 0));
      for (const [x, y] of [[-0.32, 0.22], [0.32, 0.22], [-0.32, -0.22], [0.32, -0.22]]) {
        pitchG.add(barrel(dark, 2.0, 0.045, x, y, 0.4));
        pitchG.add(mesh(BOXC, mat, 0.1, 0.32, 0.22, x * 1.6, y, 0.05));
      }
      break;
    }
    case 'aa40': {
      // Bofors L/60 sabit mevzide: yuvarlak kaide, kavisli kalkan, iki nişancı, üstten şarjör, konik alev gizleyici
      g.add(mesh(CYL, mat, 1.5, 0.35, 1.5, 0, 0, 0));
      yawG.add(mesh(CYL, dark, 0.75, 0.8, 0.75, 0, 0.35, 0));
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.3, 12, 1, true, -0.9, 1.8).translate(0, 0.65, 0), mat);
      shield.position.y = 0.6;
      yawG.add(shield);
      yawG.add(mesh(BOX, mat, 0.4, 0.55, 0.45, -1.0, 0.75, -0.4));
      yawG.add(mesh(BOX, mat, 0.4, 0.55, 0.45, 1.0, 0.75, -0.4));
      pitchG.position.y = 1.7;
      pitchG.add(mesh(BOXC, dark, 0.55, 0.65, 1.6, 0, 0, -0.1));
      pitchG.add(mesh(BOXC, mat, 0.3, 0.7, 0.45, 0, 0.6, -0.2));
      pitchG.add(barrel(dark, 3.2, 0.075, 0, 0.05, 0.6));
      pitchG.add(mesh(new THREE.CylinderGeometry(0.2, 0.09, 0.55, 8).rotateX(Math.PI / 2).translate(0, 0.05, 4.0), dark, 1, 1, 1));
      break;
    }
    case 'aa128': {
      // Flak 40: sabit beton kaide, kapalı top evi, 7,8 m namlu, çift dengeleyici
      g.add(mesh(CYL, mat, 2.6, 0.6, 2.6, 0, 0, 0));
      g.add(mesh(CYL, dark, 2.0, 0.25, 2.0, 0, 0.6, 0));
      yawG.add(mesh(BOX, mat, 3.2, 2.4, 3.4, 0, 0.85, -0.6));
      yawG.add(mesh(BOX, mat, 2.6, 0.5, 2.6, 0, 3.25, -0.9));
      yawG.add(mesh(BOX, mat, 1.0, 1.4, 1.2, 2.0, 0.85, -1.2));
      pitchG.position.y = 2.4;
      pitchG.position.z = 0.9;
      pitchG.add(mesh(BOXC, dark, 1.0, 1.0, 2.6, 0, 0, -0.4));
      pitchG.add(barrel(dark, 7.8, 0.15, 0, 0, 0.5));
      pitchG.add(barrel(dark, 0.6, 0.22, 0, 0, 7.8));
      for (const x of [-0.75, 0.75]) pitchG.add(barrel(mat, 2.2, 0.16, x, 0.2, -0.6));
      break;
    }
    case 'aa37': {
      // Dört tekerlekli lafet, ayaklar açık; otomatik top, şarjör tarakları, iki nişancı koltuğu
      g.add(mesh(BOX, mat, 1.8, 0.45, 4.4, 0, 0.35, 0));
      for (const [x, z] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
        const wh = mesh(CYL, dark, 0.42, 0.25, 0.42, x, 0.42, z);
        wh.rotation.z = Math.PI / 2;
        g.add(wh);
      }
      g.add(mesh(BOXC, mat, 4.6, 0.12, 0.25, 0, 0.3, 0));
      yawG.add(mesh(CYL, dark, 0.6, 0.6, 0.6, 0, 0.8, 0));
      yawG.add(mesh(BOX, mat, 0.45, 0.5, 0.45, -0.9, 0.9, -0.3));
      yawG.add(mesh(BOX, mat, 0.45, 0.5, 0.45, 0.9, 0.9, -0.3));
      pitchG.position.y = 1.75;
      pitchG.add(mesh(BOXC, dark, 0.5, 0.5, 1.4, 0, 0, 0));
      pitchG.add(barrel(dark, 3.0, 0.07, 0, 0.05, 0.6));
      pitchG.add(barrel(dark, 0.45, 0.13, 0, 0.05, 3.4));
      pitchG.add(mesh(BOXC, mat, 0.22, 0.55, 0.4, 0, 0.5, -0.1));
      break;
    }
    case 'aa88': {
      // Flak 36: dört kollu platform, uzun namlu, geri tepme silindiri, kalkan, tapa ayar kutusu
      for (const a of [0, Math.PI / 2]) {
        const arm = mesh(BOXC, mat, 5.8, 0.25, 0.5, 0, 0.15, 0);
        arm.rotation.y = a;
        g.add(arm);
      }
      for (const [x, z] of [[2.8, 0], [-2.8, 0], [0, 2.8], [0, -2.8]]) g.add(mesh(CYL, mat, 0.4, 0.2, 0.4, x, 0, z));
      yawG.add(mesh(CYL, dark, 0.65, 1.1, 0.65, 0, 0.25, 0));
      yawG.add(mesh(BOX, mat, 2.6, 1.6, 0.07, 0, 1.0, 1.0));
      yawG.add(mesh(BOX, mat, 0.6, 0.7, 0.5, 0.9, 1.0, -0.5));
      yawG.add(mesh(CYL, mat, 1.5, 0.08, 1.5, 0, 0.3, 0));
      pitchG.position.y = 1.9;
      pitchG.add(mesh(BOXC, dark, 0.75, 0.8, 2.2, 0, 0, -0.2));
      pitchG.add(barrel(dark, 5.2, 0.11, 0, 0.05, 0.6));
      pitchG.add(barrel(dark, 0.4, 0.17, 0, 0.05, 5.7));
      pitchG.add(mesh(BOXC, mat, 0.25, 0.25, 2.4, 0, 0.42, 0.9));
      break;
    }
  }
  yawG.add(pitchG);
  g.userData.yaw = yawG;
  g.userData.pitch = pitchG;
  return g;
}

/** Silah çukuru: seviye 1 kum torbası, seviye 2+ beton duvar. */
function gunPit(level: number, r: number, mat: THREE.Material, sand: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  if (level <= 1) g.add(mesh(SANDBAG, sand, r, 2.6, r, 0, 0.5, 0));
  else {
    g.add(mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0), mat, r, level >= 3 ? 1.6 : 1.2, r, 0, 0, 0));
    g.add(mesh(SANDBAG, sand, r * 1.08, 1.6, r * 1.08, 0, 0.2, 0));
    if (level >= 3) for (const a of [0.4, 2.5, 4.6]) g.add(mesh(BOX, mat, 1.4, 1.1, 1.0, Math.cos(a) * (r - 0.6), 0, Math.sin(a) * (r - 0.6)));
  }
  return g;
}

export class StructureView {
  readonly group = new THREE.Group();
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly matB: THREE.MeshLambertMaterial;
  private readonly matD: THREE.MeshLambertMaterial;
  private readonly matS: THREE.MeshLambertMaterial;
  private readonly base: THREE.Color;
  private ratio = 1;
  nextSmoke = 0;
  private mountSig = '';
  private mountGroup = new THREE.Group();
  private sensorGroup = new THREE.Group();
  private radarDish: THREE.Object3D | null = null;
  private rangefinder: THREE.Object3D | null = null;
  private antenna: THREE.Object3D | null = null;
  private tower: THREE.Object3D | null = null;
  private towerLevel = 0;
  private craterGroup = new THREE.Group();
  private craterCount = -1;
  private parkedGroup = new THREE.Group();
  private parkedSig = '';
  private upgradeGroup = new THREE.Group();
  private upgradeSig = '';
  private scaffold: THREE.Mesh | null = null;
  readonly ring: THREE.Mesh;
  private built = false;

  constructor(readonly s: Structure) {
    const rng = mulberry32(s.id * 977);
    // Şehir ve ekonomi yapıları köşe renkli tek ağdır
    const city = s.def.category !== 'military';
    const baseHex = city ? 0xffffff
      : s.kind === 'aa' ? PALETTE.aaSite : s.kind === 'airbase' ? PALETTE.hangar : s.kind === 'radar' ? PALETTE.radar : PALETTE.factory;
    this.base = new THREE.Color(baseHex);
    this.mat = new THREE.MeshLambertMaterial({ color: baseHex, flatShading: true, transparent: true, vertexColors: city });
    this.matB = new THREE.MeshLambertMaterial({ color: PALETTE.runway, flatShading: true, transparent: true });
    this.matD = new THREE.MeshLambertMaterial({ color: PALETTE.gunMetal, flatShading: true, transparent: true });
    this.matS = new THREE.MeshLambertMaterial({ color: PALETTE.sandbag, flatShading: true, transparent: true });
    this.group.position.copy(s.pos);
    // Uçaksavar yuva konumları dünya ekseninde tanımlı: döndürme
    this.group.rotation.y = s.kind === 'aa' ? 0 : Math.PI - s.heading;
    const g = this.group;
    const m = this.mat;

    switch (s.kind) {
      case 'airbase':
        this.buildAirbase(rng);
        break;
      case 'aa': {
        // Komuta mevzisi: sığınak, cephanelikler, çukurlara uzanan yollar
        g.add(mesh(BOX, m, 7, 2.2, 5, 0, 0, 0));
        g.add(mesh(SANDBAG, this.matS, 6.5, 3, 6.5, 0, 0.3, 0));
        for (let i = 0; i < 6; i++) {
          const [ox, oz] = AASite.mountOffset(i);
          const path = mesh(BOX, this.matB, 2.2, 0.25, 36, ox / 2, 0, oz / 2);
          path.rotation.y = Math.atan2(ox, oz);
          g.add(path);
        }
        for (const [x, z] of [[-18, 24], [20, -22]]) g.add(mesh(ARCH, m, 4, 3, 7, x, 0, z));
        // Mürettebat kulübesi: iki çukur arasındaki boşlukta
        g.add(mesh(BOX, m, 5, 3.2, 9, -31, 0, 1));
        g.add(this.mountGroup);
        g.add(this.sensorGroup);
        break;
      }
      case 'radar': {
        // Freya tipi dönen anten (dipol "yatak") ve döner kabin, jeneratör, telsiz kulübesi, çit
        const cab = new THREE.Group();
        cab.add(mesh(BOX, m, 5, 3.4, 4.5, 0, 0, 0));
        const ant = new THREE.Group();
        ant.position.y = 3.4;
        ant.add(mesh(BOX, this.matD, 0.25, 7, 0.25, 0, 0, 0));
        const frame = new THREE.Group();
        frame.position.set(0, 7, 0);
        for (let i = -3; i <= 3; i++) frame.add(mesh(BOXC, this.matD, 0.1, 5, 0.1, i * 1.1, 0, 0));
        for (let j = -2; j <= 2; j++) frame.add(mesh(BOXC, this.matD, 7, 0.1, 0.1, 0, j * 1.2, 0));
        for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) frame.add(mesh(BOXC, m, 0.7, 0.06, 0.06, i * 1.1, j * 1.2, 0.4));
        ant.add(frame);
        cab.add(ant);
        g.add(cab);
        this.antenna = cab;
        g.add(mesh(BOX, m, 8, 3, 5, 22, 0, -14));
        g.add(mesh(BOX, m, 6, 2.6, 4, -20, 0, 16));
        g.add(mesh(CYL, m, 1.6, 3, 1.6, -24, 0, -18));
        g.add(mesh(new THREE.TorusGeometry(1, 0.012, 3, 40).rotateX(Math.PI / 2), this.matD, 48, 60, 48, 0, 1, 0));
        break;
      }
      case 'factory':
        this.buildFactory(rng);
        break;
      default:
        if (city) buildCityModel(s.kind, rng, this.mat, g);
        break;
    }

    // Şehir binaları yan yana dizildiği için halkaları tabana sığar ve soluktur
    const rr = s.kind === 'airbase' ? 1400 : city ? Math.max(s.def.halfW, s.def.halfL) * (s.kind === 'mine' ? 1.25 : 1.05) : s.def.radius * 1.6 + 20;
    this.ring = new THREE.Mesh(
      RING,
      new THREE.MeshBasicMaterial({ color: PALETTE.team[s.team], transparent: true, opacity: s.def.category === 'city' ? 0.16 : 0.4, depthWrite: false, depthTest: false }),
    );
    this.ring.renderOrder = 1;
    this.ring.scale.setScalar(rr);
    this.ring.position.set(s.pos.x, s.pos.y + 2, s.pos.z);
  }

  private buildAirbase(rng: () => number): void {
    const g = this.group;
    const m = this.mat;
    const L = RUNWAY_HALF * 2;
    g.add(mesh(BOX, this.matB, 64, 1.2, L));
    // Pist başı çizgileri ve orta çizgi
    const white = new THREE.MeshBasicMaterial({ color: 0xfbf9f4 });
    for (const end of [-1, 1]) {
      for (let k = -3; k <= 3; k++) g.add(mesh(BOX, white, 3.5, 1.3, 30, k * 7.5, 0, end * (RUNWAY_HALF - 40)));
    }
    for (let z = -RUNWAY_HALF + 120; z < RUNWAY_HALF - 120; z += 90) g.add(mesh(BOX, white, 1.2, 1.25, 36, 0, 0, z));
    // Taksi yolu, bağlantılar, apron
    g.add(mesh(BOX, this.matB, 22, 1, L * 0.8, -150, 0, 0));
    for (const z of [-800, 0, 800]) g.add(mesh(BOX, this.matB, 150, 0.95, 22, -75, 0, z));
    g.add(mesh(BOX, this.matB, 200, 0.9, 640, -275, 0, 0));
    // Kemer çatılı hangarlar
    for (let i = 0; i < 3; i++) g.add(mesh(ARCH, m, 26, 18 + rng() * 3, 60, -410, 0, -300 + i * 300));
    // Kule (cam kabinli), itfaiye, kışlalar, yakıt tankları, rüzgâr tulumu
    g.add(mesh(BOX, m, 12, 9, 12, -330, 0, 700));
    g.add(mesh(BOX, m, 9, 4, 9, -330, 9, 700));
    g.add(mesh(BOX, this.matD, 10, 2.6, 10, -330, 13, 700));
    g.add(mesh(BOX, m, 20, 6, 14, -300, 0, 760));
    for (let i = 0; i < 4; i++) g.add(mesh(BOX, m, 9, 6, 42, -500, 0, 180 + i * 90));
    for (let i = 0; i < 3; i++) g.add(mesh(CYL, m, 6, 7, 6, -470, 0, -720 + i * 16));
    g.add(mesh(CYL, this.matD, 0.25, 7, 0.25, 70, 0, 900));
    g.add(mesh(CYLZ, white, 0.6, 0.6, 3, 70, 6.6, 900));
    // Çevre çiti, telsiz direği, takım bayrağı
    const fenceMat = this.matD;
    g.add(mesh(BOX, fenceMat, 0.4, 2.2, 2560, 120, 0, 0));
    g.add(mesh(BOX, fenceMat, 0.4, 2.2, 2560, -560, 0, 0));
    g.add(mesh(BOX, fenceMat, 680, 2.2, 0.4, -220, 0, 1280));
    g.add(mesh(BOX, fenceMat, 680, 2.2, 0.4, -220, 0, -1280));
    g.add(mesh(CYL, this.matD, 0.35, 32, 0.35, -360, 0, 720));
    for (const y of [10, 20, 30]) g.add(mesh(BOX, this.matD, 4, 0.2, 0.2, -360, y, 720));
    g.add(mesh(CYL, this.matD, 0.12, 12, 0.12, -310, 0, 690));
    g.add(mesh(BOX, new THREE.MeshLambertMaterial({ color: PALETTE.team[this.s.team] }), 0.1, 1.6, 2.6, -310, 10.2, 691.4));
    // Apron araçları: yakıt tankerleri, çekiciler, personel arabaları
    const veh = [0xd9c27a, 0x9aa38a, 0xb8b2a6, 0xd98c7a];
    for (let i = 0; i < 9; i++) {
      const z = -300 + i * 72 + rng() * 10;
      const big = i % 3 === 0;
      g.add(mesh(BOX, new THREE.MeshLambertMaterial({ color: veh[i % veh.length], flatShading: true }), big ? 2.6 : 1.9, big ? 2.8 : 1.6, big ? 8 : 4, -360 + rng() * 20, 0.4, z));
    }
    // Barakalar ve dağıtım kulübeleri
    for (let i = 0; i < 6; i++) g.add(mesh(ARCH, m, 5, 3.4, 14, -540, 0, -900 + i * 40));
    for (let i = 0; i < 4; i++) g.add(mesh(BOX, m, 7, 3.6, 7, -100, 0, -1100 + i * 30));
    g.add(this.craterGroup);
    g.add(this.parkedGroup);
    g.add(this.upgradeGroup);
  }

  private buildFactory(rng: () => number): void {
    const g = this.group;
    const m = this.mat;
    // Testere dişi çatılı montaj holleri
    for (let h = 0; h < 3; h++) {
      const x = -150 + h * 150;
      const z = -40 + (rng() - 0.5) * 30;
      const len = 120 + rng() * 40;
      g.add(mesh(BOX, m, 70, 14, len, x, 0, z));
      for (let k = 0; k < 7; k++) {
        const roof = mesh(PRISM, this.matB, 70, 5, 6, x, 16, z - len / 2 + 8 + (k * (len - 16)) / 6);
        roof.rotation.x = 0.35;
        g.add(roof);
      }
    }
    // Yönetim binası, ambarlar, bacalar, su kulesi, test apronu, çit
    g.add(mesh(BOX, m, 60, 16, 22, -40, 0, 140));
    for (let i = 0; i < 3; i++) g.add(mesh(ARCH, m, 14, 10, 40, 170, 0, 90 + i * 34));
    for (let i = 0; i < 3; i++) g.add(mesh(CYL, m, 3.5 - i * 0.4, 45 + i * 8, 3.5 - i * 0.4, 60 + i * 22, 0, -150));
    g.add(mesh(CYL, this.matD, 0.8, 22, 0.8, -230, 0, 110));
    g.add(mesh(CYL, m, 6, 8, 6, -230, 22, 110));
    g.add(mesh(BOX, this.matB, 180, 0.8, 70, 30, 0, 215));
    g.add(mesh(new THREE.TorusGeometry(1, 0.008, 3, 48).rotateX(Math.PI / 2), this.matD, 300, 200, 270, 0, 1, 0));
    // Demiryolu bağlantısı ve vagonlar, işçi otoparkı
    g.add(mesh(BOX, this.matD, 4, 0.6, 520, 240, 0, -10));
    for (let i = 0; i < 7; i++) {
      const col = [0xa9806b, 0x8f9a86, 0xb4a48e][i % 3];
      g.add(mesh(BOX, new THREE.MeshLambertMaterial({ color: col, flatShading: true }), 3, 3.6, 13, 240, 0.6, -180 + i * 15));
    }
    g.add(mesh(BOX, this.matB, 60, 0.7, 40, -200, 0, 190));
    for (let i = 0; i < 12; i++) {
      const col = [0xd98c7a, 0x8aa6d6, 0xe8d38a, 0xf2f2ee, 0x9a9aa6][i % 5];
      g.add(mesh(BOX, new THREE.MeshLambertMaterial({ color: col, flatShading: true }), 2, 1.4, 4.4, -224 + (i % 6) * 9, 0.4, 180 + Math.floor(i / 6) * 16));
    }
  }

  /** Her kare: inşaat, hasar, silah yönleri, radar dönüşü, krater ve park uçakları. */
  sync(simDt: number): void {
    const s = this.s;
    // İnşaat
    if (s.build < 1) {
      const op = 0.25 + s.build * 0.5;
      for (const mt of [this.mat, this.matB, this.matD, this.matS]) mt.opacity = op;
      if (!this.scaffold) {
        const r = s.kind === 'airbase' ? 300 : s.def.radius * 1.2;
        this.scaffold = new THREE.Mesh(
          new THREE.BoxGeometry(r * 2, Math.max(20, r * 0.3), r * 2),
          new THREE.MeshBasicMaterial({ color: 0xc9b68f, wireframe: true, transparent: true, opacity: 0.5 }),
        );
        this.scaffold.position.y = Math.max(10, r * 0.15);
        this.group.add(this.scaffold);
      }
    } else if (!this.built) {
      this.built = true;
      for (const mt of [this.mat, this.matB, this.matD, this.matS]) {
        mt.opacity = 1;
        mt.transparent = false;
        mt.needsUpdate = true;
      }
      if (this.scaffold) {
        this.group.remove(this.scaffold);
        this.scaffold = null;
      }
    }
    // Hasar rengi
    const ratio = s.hp / s.maxHp;
    if (Math.abs(ratio - this.ratio) > 1e-3) {
      this.ratio = ratio;
      this.mat.color.copy(this.base).lerp(new THREE.Color(PALETTE.damaged), (1 - ratio) * 0.85);
      if (ratio <= 0) {
        for (const ch of this.group.children) if (ch instanceof THREE.Mesh) ch.scale.y *= 0.3;
      }
    }
    if (s.aa) this.syncAA(s.aa);
    if (s.radar && this.antenna) {
      this.antenna.rotation.y = s.active ? s.radar.angle : this.antenna.rotation.y;
      if (s.radar.level !== this.towerLevel) this.syncRadarTower(s.radar.level);
      if (this.tower && s.active) this.tower.rotation.y = s.radar.angle * 0.7 + 1;
    }
    if (s.airbase) this.syncAirbase();
    if (this.radarDish && s.active) this.radarDish.rotation.y += simDt * 2;
  }

  /** Radar II: yüksek kafes kule ve dönen uzun menzil anteni. */
  private syncRadarTower(level: number): void {
    this.towerLevel = level;
    if (level < 2 || this.tower) return;
    const t = new THREE.Group();
    t.position.set(-26, 0, -4);
    const H = 48;
    for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) this.group.add(mesh(BOX, this.matD, 0.5, H, 0.5, -26 + x, 0, -4 + z));
    for (let y = 6; y < H; y += 8) this.group.add(mesh(BOX, this.matD, 5.5, 0.3, 5.5, -26, y, -4));
    const ant = mesh(BOX, this.mat, 2.4, 14, 1.2, 0, H, 0);
    t.add(ant);
    this.group.add(t);
    this.tower = t;
  }

  private syncAA(aa: AASite): void {
    const sig = aa.mounts.map((m) => m.weapon).join(',') + '|' + [...aa.sensors].join(',') + '|' + aa.level;
    if (sig !== this.mountSig) {
      this.mountSig = sig;
      this.mountGroup.clear();
      this.sensorGroup.clear();
      this.radarDish = null;
      this.rangefinder = null;
      // Boş çukurlar dahil seviyenin tüm yuvaları
      for (let i = 0; i < aa.maxMounts; i++) {
        const [ox, oz] = AASite.mountOffset(i);
        const weapon = aa.mounts[i]?.weapon;
        const pitR = weapon === 'aa128' ? 7.5 : weapon === 'aa88' ? 6.5 : weapon === 'aa37' || weapon === 'aa40' ? 5.2 : 4.2;
        const pit = gunPit(aa.level, pitR, this.mat, this.matS);
        pit.position.set(ox, 0, oz);
        this.mountGroup.add(pit);
        if (i >= 6) {
          // Dış halka yuvalarına uzanan yol
          const len = Math.hypot(ox, oz) - 8;
          const path = mesh(BOX, this.matB, 2.2, 0.25, len, ox / 2, 0, oz / 2);
          path.rotation.y = Math.atan2(ox, oz);
          this.mountGroup.add(path);
        }
      }
      aa.mounts.forEach((m, i) => {
        const gun = aaGun(m.weapon, this.mat, this.matD);
        const [ox, oz] = AASite.mountOffset(i);
        gun.position.set(ox, 0, oz);
        gun.name = `gun${i}`;
        this.mountGroup.add(gun);
      });
      if (aa.sensors.has('rangefinder')) {
        // 4 m'lik optik telemetre, sehpa üstünde (komuta mevzisinin yanında)
        const rf = new THREE.Group();
        rf.position.set(-7, 0, -5);
        rf.add(mesh(CYL, this.matD, 0.25, 1.6, 0.25));
        const tube = new THREE.Group();
        tube.position.y = 1.7;
        tube.add(mesh(BOXC, this.matD, 4, 0.3, 0.3));
        tube.add(mesh(BOXC, this.mat, 0.6, 0.5, 0.6));
        rf.add(tube);
        this.sensorGroup.add(rf);
        this.rangefinder = tube;
      }
      if (aa.sensors.has('predictor')) this.sensorGroup.add(mesh(BOX, this.matD, 2, 1.5, 1.4, 7, 0, -6));
      if (aa.sensors.has('gunRadar')) {
        // Atış kontrol radarı: kabin üstünde parabolik çanak
        const mast = new THREE.Group();
        mast.position.set(9, 0, 8);
        mast.add(mesh(BOX, this.mat, 3.5, 2.6, 2.5));
        const dish = new THREE.Group();
        dish.position.y = 4.2;
        const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.32).rotateX(Math.PI / 2), this.matD);
        bowl.rotation.x = -0.35;
        dish.add(bowl);
        dish.add(mesh(CYL, this.matD, 0.12, 1.6, 0.12, 0, -1.6, 0));
        mast.add(dish);
        this.sensorGroup.add(mast);
        this.radarDish = dish;
      }
    }
    // Namlu yönleri: pusula açısı → dünya yönü (sin, 0, -cos)
    aa.mounts.forEach((m, i) => {
      const gun = this.mountGroup.getObjectByName(`gun${i}`);
      if (!gun) return;
      (gun.userData.yaw as THREE.Object3D).rotation.y = Math.PI - m.yaw;
      (gun.userData.pitch as THREE.Object3D).rotation.x = -m.pitch;
    });
    if (this.rangefinder && aa.mounts[0]) this.rangefinder.rotation.y = Math.PI / 2 - aa.mounts[0].yaw;
  }

  private syncAirbase(): void {
    const ab = this.s.airbase!;
    if (ab.craters.length !== this.craterCount) {
      this.craterCount = ab.craters.length;
      this.craterGroup.clear();
      const cm = new THREE.MeshBasicMaterial({ color: 0x8b8078, transparent: true, opacity: 0.8, depthWrite: false });
      for (const c of ab.craters) this.craterGroup.add(mesh(CRATER, cm, 9, 1, 9, -c.v, 1.4, c.u));
    }
    // Tesisler: bakım atölyesi, ek hangarlar, toprak siperler
    const usig = [...ab.upgrades].sort().join(',');
    if (usig !== this.upgradeSig) {
      this.upgradeSig = usig;
      this.upgradeGroup.clear();
      if (ab.upgrades.has('workshop')) {
        this.upgradeGroup.add(mesh(BOX, this.mat, 40, 13, 60, -470, 0, -470));
        this.upgradeGroup.add(mesh(PRISM, this.matB, 40, 4, 6, -470, 14, -470));
      }
      if (ab.upgrades.has('hangars')) for (const z of [-620, 330 + 300]) this.upgradeGroup.add(mesh(ARCH, this.mat, 26, 19, 60, -410, 0, z));
      if (ab.upgrades.has('revetments')) {
        for (let i = 0; i < 8; i++) {
          const z = -280 + i * 80;
          this.upgradeGroup.add(mesh(BOX, this.matS, 30, 3.5, 3, -340, 0, z - 14));
          this.upgradeGroup.add(mesh(BOX, this.matS, 30, 3.5, 3, -340, 0, z + 14));
          this.upgradeGroup.add(mesh(BOX, this.matS, 3, 3.5, 31, -356, 0, z));
        }
      }
    }
    // Apronda bekleyen uçaklar (gerçek ölçekte)
    const parked = ab.inventory.filter((a) => a.status !== 'airborne').slice(0, 16);
    const sig = parked.map((a) => a.specId + a.status[0]).join(',');
    if (sig !== this.parkedSig) {
      this.parkedSig = sig;
      this.parkedGroup.clear();
      parked.forEach((af, i) => {
        const sp = SPECS[af.specId];
        const mdl = buildAircraftModel(sp.model, PALETTE.team[this.s.team], { gear: true });
        const row = Math.floor(i / 8);
        mdl.root.position.set(-220 - row * 55, gearHeight(sp), -280 + (i % 8) * 80);
        mdl.root.rotation.y = -Math.PI / 2;
        if (af.status === 'servicing') mdl.root.rotation.z = 0.04;
        this.parkedGroup.add(mdl.root);
      });
    }
  }
}
