// Yer yapılarının görünümleri: hava üssü, uçaksavar bataryası, radar istasyonu, uçak fabrikası ve şehir yapıları.
// Ölçüler gerçek boyutlara yakındır. İnşaat, hasar, tesis eklemeleri, silah yönleri ve park uçakları dahil.
// Her parça gerçek malzemesiyle (arch.ts): tuğla ve sıva duvarlar pencereli, oluklu sac hangarlar, plakalı pist
// betonu, kum torbaları, boyalı metal toplar. Sabit parçalar yapı başına tek ağda birleşir (az çizim çağrısı);
// dönen ve sonradan eklenen parçalar kendi küçük ağlarında.

import * as THREE from 'three';
import type { Structure } from '../sim/structures/structure';
import { AASite, type AAWeaponId } from '../sim/structures/airDefense';
import { RUNWAY_HALF } from '../sim/structures/airbase';
import { SPECS } from '../sim/aircraft/specs';
import { gearHeight } from '../sim/aircraft/flightModel';
import { buildAircraftModel } from './models';
import { quality } from '../ui/settings';
import { buildCityModel } from './cityModels';
import { PALETTE } from './palette';
import { mulberry32 } from '../core/math';
import { ArchBatch, SURF, archMaterial, setArchDamage, type Surf } from './arch';
import { GABLE } from './props';

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const BOXC = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0);
const CYLZ = new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5);
/** Kemer çatılı hangar: yarım silindir, uzunluk Z ekseninde. */
const ARCH = new THREE.CylinderGeometry(1, 1, 1, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
/**
 * Testere dişi çatının bir dişi: dik üçgen prizma, tabanı çatıya düz oturur (y = 0). Uzunluk X'te; dik camlı yüz
 * −Z'de, eğik keçe yüz +Z'ye iner. Birim: −0,5..0,5 (X, Z), 0..1 (Y).
 */
const TOOTH = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(1, 0);
  s.lineTo(0, 1);
  s.closePath();
  // Şekil (z, y) düzleminde, X boyunca çekilir
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.5, 0, -0.5);
})();
const RING = new THREE.RingGeometry(0.965, 1, 96).rotateX(-Math.PI / 2);
const CRATER = new THREE.CylinderGeometry(1, 0.7, 1, 12).translate(0, -0.5, 0);
const SANDBAG = new THREE.TorusGeometry(1, 0.22, 6, 20).rotateX(Math.PI / 2);
const CONE = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0);

/** Gerçekçi malzeme renkleri (sRGB). */
const COL = {
  concrete: 0xaaa69d,
  concreteDark: 0x8f8c85,
  runway: 0xb5b1a7,
  asphalt: 0x5b5d5f,
  brick: 0x9a5640,
  brickDark: 0x7b4433,
  plaster: 0xe4dfd2,
  plasterCream: 0xd8cbad,
  corrugated: 0x7a8272,
  galvanized: 0x9da2a3,
  felt: 0x4a4b50,
  tile: 0xa45838,
  sandbag: 0xb09c78,
  earth: 0x7c6b52,
  turf: 0x6a8246,
  wood: 0x8a7255,
  gun: 0x5a5e54,
  steel: 0x3c3e41,
  steelLight: 0x6c7074,
  white: 0xf0eee8,
  glass: 0x5d6b78,
};

type B = ArchBatch;
const A = (b: B, geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number, surf: Surf, ry = 0) =>
  b.add(geo, sx, sy, sz, x, y, z, ry, color, surf);
/** Namlu: Z boyunca ileri uzanan silindir. */
const barrel = (b: B, len: number, r: number, x: number, y: number, z = 0, color = COL.steel) => A(b, CYLZ, r, r, len, x, y, z, color, SURF.metal);

const _bq = new THREE.Quaternion();
const _bd = new THREE.Vector3();
const _bu = new THREE.Vector3(0, 1, 0);
/** a'dan b'ye kare kesitli kiriş (kafes kule ayağı, çapraz destek, anten çubuğu). */
function beam(b: B, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, color = COL.steelLight): void {
  _bd.set(bx - ax, by - ay, bz - az);
  const len = _bd.length();
  const g = BOXC.clone().scale(w, len, w).applyQuaternion(_bq.setFromUnitVectors(_bu, _bd.normalize()));
  b.push(g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), color, SURF.metal);
}

/** El çarkı (nişan ve yükseliş): x ekseninde ince disk. */
const handwheel = (b: B, x: number, y: number, z: number, r = 0.2) =>
  b.push(new THREE.CylinderGeometry(r, r, 0.05, 12).rotateZ(Math.PI / 2).translate(x, y, z), COL.steel, SURF.metal);

/** Kemer biçimli duvar (yarı eksenler a, h; kalınlık d), XY düzleminde, tabanı y = 0, Z'de d kalınlık (ortada). */
function archWall(a: number, h: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-a, 0);
  for (let i = 1; i <= 16; i++) {
    const t = Math.PI - (Math.PI * i) / 16;
    s.lineTo(Math.cos(t) * a, Math.sin(t) * h);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -d / 2);
}

/**
 * Uçaksavar silahı. Grup içinde userData.yaw (dönen taban), userData.pitch (yükselen beşik), userData.recoil
 * (beşik içinde geri tepen namlu kümesi: namlu, ağız freni, kama) ve userData.muzzle (namlu ucu: alev buradan çıkar)
 * bulunur; userData.recoilLen / recoilBack geri tepme boyu (m) ve yerine dönüş süresi (s), gerçek silahlara yakın.
 * Ölçüler gerçek silahlara yakın (12,7 mm dörtlü makineli … 128 mm Flak 40). Boya alaca gri, namlular çelik.
 */
function aaGun(w: AAWeaponId, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const yawG = new THREE.Group();
  const pitchG = new THREE.Group();
  const recoilG = new THREE.Group();
  g.add(yawG);
  const base = new ArchBatch();
  const yb = new ArchBatch();
  const pb = new ArchBatch();
  const rb = new ArchBatch();
  /** Namlu ucu (beşik ekseninde) ve geri tepme. */
  const tip = new THREE.Vector3();
  let recoilLen = 0;
  let recoilBack = 0.1;
  const P = COL.gun;
  const D = COL.steel;
  const M = SURF.metal;
  switch (w) {
    case 'mg': {
      // Dörtlü makineli taret (römork üstünde)
      A(base, BOX, 1.7, 0.5, 2.2, 0, 0, 0, P, M);
      A(yb, CYL, 0.65, 0.55, 0.65, 0, 0.5, 0, D, M);
      A(yb, BOX, 1.5, 0.9, 0.08, 0, 0.9, 0.55, P, M);
      pitchG.position.y = 1.35;
      for (const [x, y] of [[-0.42, 0.12], [-0.42, -0.12], [0.42, 0.12], [0.42, -0.12]]) barrel(pb, 1.45, 0.05, x, y, 0.1);
      A(pb, BOXC, 0.22, 0.4, 0.5, -0.62, 0, -0.1, P, M);
      A(pb, BOXC, 0.22, 0.4, 0.5, 0.62, 0, -0.1, P, M);
      tip.set(0, 0, 1.55);
      break;
    }
    case 'aa20': {
      // Flak 38: haç biçimli platform, kalkan, şarjör
      A(base, BOXC, 3.6, 0.16, 0.4, 0, 0.1, 0, P, M);
      A(base, BOXC, 0.4, 0.16, 3.6, 0, 0.1, 0, P, M);
      A(yb, CYL, 0.38, 0.8, 0.38, 0, 0.18, 0, D, M);
      A(yb, BOX, 1.3, 0.95, 0.06, 0, 0.75, 0.55, P, M);
      A(yb, BOX, 0.35, 0.08, 0.35, -0.55, 0.65, -0.5, P, M);
      A(yb, BOX, 0.06, 0.6, 0.06, -0.55, 0.18, -0.5, D, M);
      handwheel(yb, 0.38, 1.0, -0.15, 0.13);
      pitchG.position.y = 1.15;
      A(pb, BOXC, 0.32, 0.32, 1.0, 0, 0, 0, D, M);
      barrel(pb, 2.2, 0.045, 0, 0.04, 0.4);
      A(pb, BOXC, 0.12, 0.35, 0.25, -0.24, 0.05, 0.1, P, M);
      tip.set(0, 0.04, 2.6);
      break;
    }
    case 'aa20q': {
      // Flakvierling 38: üç kollu platform, 2 × 2 namlu, geniş kalkan, nişancı koltuğu
      for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) A(base, BOXC, 0.4, 0.16, 2.2, Math.sin(a) * 1.1, 0.1, Math.cos(a) * 1.1, P, M, a);
      A(yb, CYL, 0.7, 0.6, 0.7, 0, 0.18, 0, D, M);
      A(yb, BOX, 2.1, 1.0, 0.06, 0, 0.75, 0.75, P, M);
      A(yb, BOX, 0.45, 0.5, 0.45, 0, 0.6, -0.8, P, M);
      A(yb, BOX, 0.5, 0.08, 0.5, 0, 1.1, -0.8, P, M);
      for (const s of [-1, 1]) handwheel(yb, s * 0.36, 1.25, -0.7, 0.15);
      pitchG.position.y = 1.25;
      A(pb, BOXC, 0.95, 0.85, 0.9, 0, 0, 0, D, M);
      for (const [x, y] of [[-0.32, 0.22], [0.32, 0.22], [-0.32, -0.22], [0.32, -0.22]]) {
        barrel(pb, 2.0, 0.045, x, y, 0.4);
        A(pb, BOXC, 0.1, 0.32, 0.22, x * 1.6, y, 0.05, P, M);
      }
      tip.set(0, 0, 2.4);
      break;
    }
    case 'aa40': {
      // Bofors L/60 sabit mevzide: yuvarlak kaide, kavisli kalkan, iki nişancı koltuğu ve el çarkları, öndeki
      // dengeleyici yaylar, doldurucu basamağı, üstten şarjör kılavuzu, konik alev gizleyici
      A(base, CYL, 1.5, 0.35, 1.5, 0, 0, 0, COL.concrete, SURF.concrete);
      A(yb, CYL, 0.75, 0.8, 0.75, 0, 0.35, 0, D, M);
      yb.push(new THREE.CylinderGeometry(1.5, 1.5, 1.3, 16, 1, true, -0.9, 1.8).translate(0, 1.25, 0), P, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.4, 0.12, 0.45, s * 1.0, 1.05, -0.45, P, M);
        A(yb, BOX, 0.4, 0.45, 0.08, s * 1.0, 1.05, -0.7, P, M);
        A(yb, BOX, 0.08, 0.9, 0.08, s * 1.0, 0.35, -0.45, D, M);
        handwheel(yb, s * 0.72, 1.45, -0.15, 0.17);
        A(yb, CYL, 0.09, 0.95, 0.09, s * 0.42, 0.55, 0.55, D, M);
      }
      A(yb, BOX, 1.1, 0.12, 0.6, 0, 0.75, -1.1, P, M);
      pitchG.position.y = 1.7;
      A(pb, BOXC, 0.55, 0.65, 1.6, 0, 0, -0.1, D, M);
      A(pb, BOXC, 0.3, 0.7, 0.45, 0, 0.6, -0.2, P, M);
      for (const s of [-1, 1]) A(pb, BOXC, 0.04, 0.5, 0.5, s * 0.17, 0.95, -0.2, D, M);
      barrel(rb, 3.2, 0.075, 0, 0.05, 0.6);
      barrel(rb, 0.9, 0.12, 0, 0.05, 0.6);
      rb.push(new THREE.CylinderGeometry(0.2, 0.09, 0.55, 10).rotateX(Math.PI / 2).translate(0, 0.05, 4.0), D, M);
      tip.set(0, 0.05, 4.28);
      recoilLen = 0.2;
      recoilBack = 0.15;
      break;
    }
    case 'aa128': {
      // Flak 40 sabit mevzide: beton kaide üstünde döner platform, ön ve yan kalkanlı açık arkalı top yeri,
      // 7,8 m namlu, üstte çift geri tepme silindiri, iki yanda dengeleyici, kama bloğu, cephane asansörü,
      // nişancı koltukları ve el çarkları
      A(base, CYL, 2.6, 0.6, 2.6, 0, 0, 0, COL.concrete, SURF.concrete);
      A(base, CYL, 2.0, 0.25, 2.0, 0, 0.6, 0, D, M);
      A(yb, CYL, 2.2, 0.22, 2.2, 0, 0.85, 0, P, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.25, 1.9, 2.6, s * 0.85, 1.05, 0.1, P, M);
        A(yb, BOX, 0.08, 2.3, 2.4, s * 1.75, 1.05, 0.2, P, M);
        A(yb, BOX, 0.5, 0.12, 0.5, s * 1.25, 1.7, -0.9, P, M);
        handwheel(yb, s * 1.08, 2.0, -0.5, 0.26);
      }
      A(yb, BOX, 3.6, 2.4, 0.09, 0, 1.05, 1.45, P, M);
      A(yb, BOX, 3.6, 0.09, 0.9, 0, 3.4, 1.05, P, M);
      A(yb, BOX, 1.0, 1.8, 1.1, 2.3, 0.85, -1.4, P, M);
      A(yb, BOX, 1.6, 0.12, 1.0, 0, 1.07, -1.7, D, M);
      pitchG.position.y = 2.4;
      pitchG.position.z = 0.9;
      A(pb, BOXC, 1.0, 1.0, 2.6, 0, 0, -0.4, D, M);
      A(rb, BOXC, 0.85, 0.85, 0.9, 0, -0.05, -2.0, D, M);
      barrel(rb, 7.8, 0.15, 0, 0, 0.5);
      barrel(rb, 1.6, 0.2, 0, 0, 0.5);
      barrel(rb, 0.6, 0.22, 0, 0, 7.8);
      for (const x of [-0.28, 0.28]) barrel(pb, 3.0, 0.13, x, 0.62, -0.4, D);
      for (const x of [-0.75, 0.75]) barrel(pb, 2.2, 0.16, x, 0.2, -0.6, P);
      tip.set(0, 0, 8.4);
      recoilLen = 1.1;
      recoilBack = 0.8;
      break;
    }
    case 'aa37': {
      // Dört tekerlekli lafet, ayaklar açık; otomatik top, şarjör tarakları, iki nişancı koltuğu
      A(base, BOX, 1.8, 0.45, 4.4, 0, 0.35, 0, P, M);
      for (const [x, z] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
        base.push(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 14).rotateZ(Math.PI / 2).translate(x, 0.42, z), 0x2a2b2c, M);
      }
      A(base, BOXC, 4.6, 0.12, 0.25, 0, 0.3, 0, P, M);
      A(yb, CYL, 0.6, 0.6, 0.6, 0, 0.8, 0, D, M);
      A(yb, BOX, 0.45, 0.5, 0.45, -0.9, 0.9, -0.3, P, M);
      A(yb, BOX, 0.45, 0.5, 0.45, 0.9, 0.9, -0.3, P, M);
      A(yb, BOX, 1.5, 0.9, 0.06, 0, 1.2, 0.6, P, M);
      for (const s of [-1, 1]) handwheel(yb, s * 0.62, 1.6, -0.1, 0.16);
      pitchG.position.y = 1.75;
      A(pb, BOXC, 0.5, 0.5, 1.4, 0, 0, 0, D, M);
      barrel(rb, 3.0, 0.07, 0, 0.05, 0.6);
      barrel(rb, 0.45, 0.13, 0, 0.05, 3.4);
      A(pb, BOXC, 0.22, 0.55, 0.4, 0, 0.5, -0.1, P, M);
      tip.set(0, 0.05, 3.85);
      recoilLen = 0.15;
      recoilBack = 0.12;
      break;
    }
    case 'aa88': {
      // Flak 36: dört kollu platform ve tesviye ayakları, üst lafet yan plakaları, yan kanatlı kalkan, uzun namlu,
      // üstte geri getirici, altta fren silindiri, iki yanda dengeleyici yaylar, kama, tapa ayar makinesi,
      // nişancı koltukları ve el çarkları; yerde mermi sandıkları
      for (const a of [0, Math.PI / 2]) A(base, BOXC, 5.8, 0.25, 0.5, 0, 0.15, 0, P, M, a);
      for (const [x, z] of [[2.8, 0], [-2.8, 0], [0, 2.8], [0, -2.8]]) {
        A(base, CYL, 0.4, 0.2, 0.4, x, 0, z, P, M);
        A(base, CYL, 0.07, 0.55, 0.07, x * 0.96, 0.15, z * 0.96, D, M);
      }
      for (const [x, z] of [[-1.6, -1.9], [-2.1, -1.5]]) A(base, BOX, 0.5, 0.35, 0.9, x, 0, z, 0x5a5440, SURF.wood, 0.6);
      A(yb, CYL, 0.65, 1.1, 0.65, 0, 0.25, 0, D, M);
      A(yb, CYL, 1.5, 0.08, 1.5, 0, 0.3, 0, P, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.12, 1.05, 1.5, s * 0.5, 1.0, -0.1, P, M);
        A(yb, BOX, 0.7, 1.4, 0.07, s * 1.55, 1.05, 0.82, P, M, s * 0.5);
        A(yb, BOX, 0.42, 0.1, 0.42, s * 0.95, 1.15, -0.75, P, M);
        handwheel(yb, s * 0.68, 1.55, -0.4);
      }
      A(yb, BOX, 2.6, 1.6, 0.07, 0, 1.0, 1.0, P, M);
      A(yb, BOX, 0.6, 0.7, 0.5, 0.9, 1.0, -0.5, P, M);
      pitchG.position.y = 1.9;
      A(pb, BOXC, 0.75, 0.8, 2.2, 0, 0, -0.2, D, M);
      A(rb, BOXC, 0.55, 0.55, 0.6, 0, 0, -1.5, D, M);
      barrel(rb, 5.2, 0.11, 0, 0.05, 0.6);
      barrel(rb, 0.4, 0.17, 0, 0.05, 5.7);
      A(pb, BOXC, 0.25, 0.25, 2.4, 0, 0.42, 0.9, P, M);
      barrel(pb, 2.2, 0.1, 0, -0.38, -0.2, D);
      for (const s of [-1, 1]) barrel(pb, 1.4, 0.1, s * 0.5, -0.2, -0.9, D);
      tip.set(0, 0.05, 6.1);
      recoilLen = 0.9;
      recoilBack = 0.6;
      break;
    }
  }
  base.build(g, mat);
  yb.build(yawG, mat);
  pb.build(pitchG, mat);
  rb.build(recoilG, mat);
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(tip);
  recoilG.add(muzzle);
  pitchG.add(recoilG);
  yawG.add(pitchG);
  Object.assign(g.userData, { yaw: yawG, pitch: pitchG, recoil: recoilG, muzzle, recoilLen, recoilBack, fired: -1, recoilT: 1e9 });
  return g;
}

/**
 * Geri tepme: atışta namlu kümesi beşik içinde hızla (0,05 sn) geri kayar, geri getirici yayla yavaşça (back sn)
 * yerine döner (son kısmı yumuşak). t: atıştan beri geçen süre.
 */
function recoilAt(t: number, len: number, back: number): number {
  if (len <= 0 || t >= back + 0.05) return 0;
  if (t < 0.05) return len * (t / 0.05);
  const u = (t - 0.05) / back;
  return len * (1 - u) * (1 - u);
}

/** Testere dişi çatı: w × len holün üstünde (y üst kot), ~12 m'lik dişler boyuna dizili, aralarında dere oluğu. */
function sawtoothRoof(b: B, w: number, len: number, x: number, y: number, z: number): void {
  const n = Math.max(3, Math.round(len / 12));
  const tw = len / n;
  for (let k = 0; k < n; k++) A(b, TOOTH, w, 4.2, tw, x, y, z - len / 2 + tw * (k + 0.5), 0x55565a, SURF.sawtooth);
  // Saçak: holün iki uzun kenarında ince keçe bant (dişlerin uçları duvarla birleşsin)
  for (const s of [-1, 1]) A(b, BOX, 0.5, 0.6, len, x + s * (w / 2 - 0.25), y, z, COL.felt, SURF.felt);
}

/**
 * Kemer çatılı hangar (oluklu sac): ekseni X'te, kapılı ucu +X'te (aprona bakar). Kemer yarım elips (52 m açıklık,
 * h yükseklik). Sürgülü kapı panoları 36 m'lik açıklıkta, boyları en dış panonun köşesi kemer çizgisinin altında
 * kalacak kadar (kapı kemerin dışına taşmaz); üstte kapı kirişi, yerde ray; arka uçta personel kapısı.
 */
function hangar(b: B, cx: number, cz: number, h: number, len = 60): void {
  const HW = 26;
  const OPEN = 18;
  A(b, ARCH, HW, h, len, cx, 0, cz, COL.corrugated, SURF.corrugated, Math.PI / 2);
  const doorH = 0.92 * h * Math.sqrt(1 - (OPEN / HW) ** 2);
  const ex = cx + len / 2;
  const n = 6;
  const pw = (OPEN * 2) / n;
  for (let i = 0; i < n; i++) A(b, BOX, 0.35, doorH, pw - 0.12, ex + 0.25, 0, cz - OPEN + pw * (i + 0.5), 0x6a7064, SURF.hangarDoor);
  A(b, BOX, 0.6, 0.7, OPEN * 2 + 1, ex + 0.35, doorH, cz, COL.steel, SURF.metal);
  A(b, BOX, 1.2, 0.15, OPEN * 2 + 4, ex + 0.6, 0, cz, COL.steel, SURF.metal);
  A(b, BOX, 0.3, 2.4, 1.4, cx - len / 2 - 0.15, 0, cz, 0x4e5248, SURF.metal);
}

/**
 * Düz tel çit (x0, z0 → x1, z1): 8 m'de bir direk, üç sıra tel; gaps: kapı açıklıkları (çizgi boyunca baştan
 * uzaklık aralıkları, m).
 */
function fenceLine(b: B, x0: number, z0: number, x1: number, z1: number, gaps: [number, number][] = []): void {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / L;
  const uz = (z1 - z0) / L;
  const ry = Math.atan2(ux, uz);
  const open = (d: number) => gaps.some(([a, c]) => d > a && d < c);
  for (let d = 0; d <= L; d += 8) if (!open(d)) A(b, BOX, 0.14, 2.2, 0.14, x0 + ux * d, 0, z0 + uz * d, COL.steelLight, SURF.metal);
  // Teller kapı açıklıklarında kesilir
  const cuts = [0, ...gaps.flat(), L];
  for (let k = 0; k < cuts.length; k += 2) {
    const a = cuts[k];
    const c = cuts[k + 1];
    if (c - a < 1) continue;
    const m = (a + c) / 2;
    for (const y of [0.6, 1.3, 2.0]) A(b, BOX, 0.03, 0.04, c - a, x0 + ux * m, y, z0 + uz * m, COL.steel, SURF.metal, ry);
  }
}

/**
 * Hava üssünün çevresi: pistin etrafını dolaşan çevre taksi yolu ve kenarındaki dağıtma platformları (uçakların
 * tek tek park edildiği beton yuvalar), binaları bağlayan yollar, nöbetçi kulübeli kapı ve tel çit, toprak örtülü
 * cephanelik, harekât binası, su kulesi, işaret alanı. Üs ekseninde: pist x = 0, z boyunca; teknik bölge −x'te.
 */
function airfieldGrounds(b: B): void {
  const T = COL.asphalt;
  // Çevre taksi yolu: batıdaki paralel yol iki uçta uzar, pist başlarının ötesinden doğuya döner
  for (const s of [-1, 1]) {
    A(b, BOX, 22, 1, 290, -150, 0, s * 1025, T, SURF.asphalt);
    A(b, BOX, 262, 0.95, 18, -30, 0, s * 1170, T, SURF.asphalt);
  }
  A(b, BOX, 16, 0.95, 2340, 92, 0, 0, T, SURF.asphalt);
  // Dağıtma platformları: yuvarlak beton yuva ve taksi yoluna kısa bağlantı
  const pan = (x: number, z: number, dir: number) => {
    b.push(new THREE.CylinderGeometry(13, 13, 0.8, 24).translate(x, 0.4, z), COL.concreteDark, SURF.runway);
    A(b, BOX, 30, 0.75, 11, x - dir * 26, 0, z, COL.concreteDark, SURF.runway);
  };
  for (const z of [-900, -600, -300, 300, 600, 900]) pan(142, z, 1);
  for (const z of [-560, -700, 980, 1110]) pan(-202, z, -1);
  // Yollar: ana giriş (batıdaki kapıdan kuleye), hangar arkalarından geçen omurga, hangarlara, yakıt tanklarına,
  // aprona ve cephaneliğe kollar
  const road = (w: number, l: number, x: number, z: number) => A(b, BOX, w, 0.3, l, x, 0, z, T, SURF.asphalt);
  road(380, 7, -530, 650);
  road(7, 1800, -520, -250);
  for (const z of [-300, 0, 300]) road(80, 6, -480, z);
  road(44, 6, -498, -700);
  road(7, 330, -360, 485);
  road(110, 6, -575, -1150);
  // Kule ve itfaiye önünde kaldırım
  A(b, BOX, 62, 0.28, 34, -315, 0, 728, COL.concrete, SURF.paving);
  // Çit: üssü çevreler (batıda giriş kapısı), kapıda nöbetçi kulübesi ve bariyer
  const X0 = -680;
  const X1 = 232;
  const Z = 1360;
  fenceLine(b, X0, -Z, X0, Z, [[Z + 650 - 7, Z + 650 + 7]]);
  fenceLine(b, X1, -Z, X1, Z);
  fenceLine(b, X0, Z, X1, Z);
  fenceLine(b, X0, -Z, X1, -Z);
  A(b, BOX, 3.2, 2.6, 3.2, X0 + 9, 0, 662, COL.wood, SURF.wood);
  A(b, GABLE, 3.8, 1.1, 3.8, X0 + 9, 2.6, 662, COL.felt, SURF.felt);
  A(b, BOX, 0.3, 1.1, 0.3, X0 + 2, 0, 643, COL.white, SURF.plain);
  A(b, BOX, 0.16, 0.16, 13, X0 + 2, 1.0, 650, 0xd23a2e, SURF.plain);
  // Cephanelik: toprak örtülü kemer sığınaklar, beton ön duvarlar
  for (const [x, z] of [[-600, -1110], [-640, -1110], [-600, -1200], [-640, -1200]]) {
    A(b, ARCH, 6, 4, 14, x, 0, z, COL.turf, SURF.grass);
    A(b, BOX, 12.4, 4.1, 0.5, x, 0, z + 7.2, COL.concrete, SURF.concrete);
  }
  // Harekât binası (tuğla, düz keçe çatı) ve su kulesi
  A(b, BOX, 26, 4.5, 12, -405, 0, 728, COL.brick, SURF.brickWin);
  for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) A(b, BOX, 0.4, 16, 0.4, -580 + dx, 0, 520 + dz, COL.steelLight, SURF.metal);
  A(b, CYL, 4.2, 5, 4.2, -580, 16, 520, 0x7d8279, SURF.metal);
  // İşaret alanı: siyah kare üstünde beyaz çarpı (iniş yönü işareti)
  A(b, BOX, 12, 0.25, 12, -250, 0, 690, 0x2a2b2d, SURF.plain);
  A(b, BOX, 9, 0.3, 1.2, -250, 0, 690, COL.white, SURF.plain);
  A(b, BOX, 1.2, 0.3, 9, -250, 0, 690, COL.white, SURF.plain);
}

/**
 * Freya erken uyarı radarı (dönen kısım, kabin tabanı y = 0): döner tabla, çelik kabin (kapı, pencereler, çatı
 * saçağı), kabinin üstünde 7 m genişlikte anten çerçevesi (iki direk, yatay kirişler, çapraz destekler), arkada tel
 * örgü yansıtıcı, önde iki dipol dizisi (altta alıcı, üstte verici) ve dipolleri besleyen dikey hatlar.
 */
function freya(cb: B): void {
  const S = COL.steelLight;
  A(cb, CYL, 3.3, 0.35, 3.3, 0, 0, 0, COL.steel, SURF.metal);
  A(cb, BOX, 5.2, 2.7, 3.8, 0, 0.35, 0, 0x5f665c, SURF.metal);
  A(cb, BOX, 5.5, 0.15, 4.1, 0, 3.05, 0, COL.steel, SURF.metal);
  A(cb, BOX, 0.9, 1.9, 0.08, 1.5, 0.35, 1.92, 0x3a3d38, SURF.metal);
  for (const x of [-1.7, -0.5]) A(cb, BOX, 0.8, 0.5, 0.08, x, 1.9, 1.92, 0x262c32, SURF.metal);
  A(cb, BOX, 0.5, 0.35, 0.5, -1.8, 3.2, -1.2, 0x4a4e46, SURF.metal);
  const W = 3.5;
  const Y0 = 3.2;
  const YM = 6.9;
  const Y1 = 10.6;
  for (const s of [-1, 1]) A(cb, BOX, 0.2, Y1 - Y0, 0.2, s * W, Y0, 0, S, SURF.metal);
  for (const y of [Y0 + 0.08, YM, Y1 - 0.08]) A(cb, BOXC, 2 * W + 0.2, 0.16, 0.16, 0, y, 0, S, SURF.metal);
  for (const [y0, y1] of [[Y0, YM], [YM, Y1]]) {
    beam(cb, -W, y0, -0.2, W, y1, -0.2, 0.08, S);
    beam(cb, W, y0, -0.2, -W, y1, -0.2, 0.08, S);
  }
  for (let x = -W + 0.45; x < W; x += 0.55) A(cb, BOXC, 0.035, Y1 - Y0 - 0.3, 0.035, x, (Y0 + Y1) / 2, -0.3, COL.steel, SURF.metal);
  for (let y = Y0 + 0.4; y < Y1; y += 0.6) A(cb, BOXC, 2 * W, 0.03, 0.03, 0, y, -0.3, COL.steel, SURF.metal);
  for (const [ya, yb] of [[Y0 + 0.4, YM - 0.3], [YM + 0.3, Y1 - 0.4]]) {
    for (let c = 0; c < 6; c++) {
      const x = -W + 0.6 + c * ((2 * W - 1.2) / 5);
      A(cb, BOXC, 0.05, yb - ya, 0.05, x, (ya + yb) / 2, 0.3, S, SURF.metal);
      for (let r = 0; r < 3; r++) A(cb, BOXC, 0.95, 0.06, 0.06, x, ya + 0.3 + (r * (yb - ya - 0.6)) / 2, 0.42, 0xc4c8c6, SURF.metal);
    }
  }
}

/** Elips çevre çiti: 2 m'lik direkler ve aralarında ince tel bant (rx, rz yarı eksenler). */
function fenceRing(b: B, rx: number, rz: number): void {
  const n = Math.max(24, Math.round((Math.PI * (rx + rz)) / 12));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const x0 = Math.cos(a0) * rx;
    const z0 = Math.sin(a0) * rz;
    const x1 = Math.cos(a1) * rx;
    const z1 = Math.sin(a1) * rz;
    A(b, BOX, 0.14, 2.2, 0.14, x0, 0, z0, COL.steelLight, SURF.metal);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    for (const y of [0.5, 1.2, 1.9]) A(b, BOX, 0.03, 0.04, len, (x0 + x1) / 2, y, (z0 + z1) / 2, COL.steel, SURF.metal, ry);
  }
}

/** Silah çukuru: seviye 1 kum torbası, seviye 2+ beton duvar ve kum torbası, seviye 3 cephane nişleri. */
function gunPit(b: B, level: number, r: number, x: number, z: number): void {
  if (level <= 1) A(b, SANDBAG, r, 2.6, r, x, 0.5, z, COL.sandbag, SURF.sandbag);
  else {
    b.push(new THREE.CylinderGeometry(r, r, level >= 3 ? 1.6 : 1.2, 24, 1, true).translate(x, (level >= 3 ? 1.6 : 1.2) / 2, z), COL.concrete, SURF.concrete);
    A(b, SANDBAG, r * 1.08, 1.6, r * 1.08, x, 0.2, z, COL.sandbag, SURF.sandbag);
    if (level >= 3) for (const a of [0.4, 2.5, 4.6]) A(b, BOX, 1.4, 1.1, 1.0, x + Math.cos(a) * (r - 0.6), 0, z + Math.sin(a) * (r - 0.6), COL.concreteDark, SURF.concrete, -a);
  }
}

export class StructureView {
  readonly group = new THREE.Group();
  /** Yapının tek malzemesi: hasar ve inşaat saydamlığı yapıya özgü. */
  private readonly mat = archMaterial();
  private ratio = 1;
  nextSmoke = 0;
  /** Yangın noktaları (yapı merkezine göre x, z): duman ayrı sütunlar hâlinde buralardan yükselir. */
  firePts: [number, number][] | null = null;
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
    const city = s.def.category !== 'military';
    this.group.position.copy(s.pos);
    // Uçaksavar yuva konumları dünya ekseninde tanımlı: döndürme
    this.group.rotation.y = s.kind === 'aa' ? 0 : Math.PI - s.heading;
    const g = this.group;
    const b = new ArchBatch();

    switch (s.kind) {
      case 'airbase':
        this.buildAirbase(b, rng);
        break;
      case 'aa': {
        // Komuta mevzisi: beton sığınak, kum torbası halkası, çukurlara uzanan toprak yollar
        A(b, BOX, 7, 2.2, 5, 0, 0, 0, COL.concrete, SURF.concrete);
        A(b, BOX, 7.4, 0.3, 5.4, 0, 2.2, 0, COL.turf, SURF.grass);
        A(b, SANDBAG, 6.5, 3, 6.5, 0, 0.3, 0, COL.sandbag, SURF.sandbag);
        for (let i = 0; i < 6; i++) {
          const [ox, oz] = AASite.mountOffset(i);
          A(b, BOX, 2.4, 0.06, 36, ox / 2, 0, oz / 2, COL.earth, SURF.earth, Math.atan2(ox, oz));
        }
        // Cephanelikler: üstü toprak ve çim örtülü kemer sığınaklar, kemer biçimli beton ön duvar ve çelik kapı
        for (const [x, z] of [[-18, 24], [20, -22]]) {
          A(b, ARCH, 4, 3, 7, x, 0, z, COL.turf, SURF.grass);
          b.push(archWall(4.15, 3.1, 0.5).translate(x, 0, z + 3.6), COL.concrete, SURF.concrete);
          A(b, BOX, 1.5, 2.0, 0.12, x, 0, z + 3.9, 0x4a4e46, SURF.metal);
        }
        // Mürettebat kulübesi: ahşap, keçe çatılı
        A(b, BOX, 5, 3.2, 9, -31, 0, 1, COL.wood, SURF.wood);
        A(b, GABLE, 5.6, 1.4, 9.6, -31, 3.2, 1, COL.felt, SURF.felt);
        g.add(this.mountGroup);
        g.add(this.sensorGroup);
        break;
      }
      case 'radar': {
        // Freya tipi radar: beton döner taban üstünde dönen kabin ve kabinin taşıdığı anten çerçevesi; jeneratör,
        // telsiz kulübesi, yakıt tankı, çit
        A(b, CYL, 4.6, 0.5, 4.6, 0, 0, 0, COL.concrete, SURF.concrete);
        A(b, CYL, 3.6, 0.12, 3.6, 0, 0.5, 0, COL.steel, SURF.metal);
        const cab = new THREE.Group();
        cab.position.y = 0.6;
        const cb = new ArchBatch();
        freya(cb);
        cb.build(cab, this.mat);
        g.add(cab);
        this.antenna = cab;
        // Jeneratör: tuğla; telsiz kulübesi: ahşap; yakıt tankı
        A(b, BOX, 8, 3, 5, 22, 0, -14, COL.brick, SURF.brickWin);
        A(b, GABLE, 5.6, 1.6, 8.6, 22, 3, -14, COL.tile, SURF.tile, Math.PI / 2);
        A(b, BOX, 6, 2.6, 4, -20, 0, 16, COL.wood, SURF.wood);
        A(b, GABLE, 4.5, 1.2, 6.5, -20, 2.6, 16, COL.felt, SURF.felt, Math.PI / 2);
        A(b, CYL, 1.6, 3, 1.6, -24, 0, -18, COL.galvanized, SURF.metal);
        fenceRing(b, 48, 48);
        break;
      }
      case 'factory':
        this.buildFactory(b, rng);
        break;
      default:
        if (city) buildCityModel(s.kind, rng, b);
        break;
    }
    b.build(g, this.mat);

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

  private buildAirbase(b: B, rng: () => number): void {
    const g = this.group;
    const L = RUNWAY_HALF * 2;
    // Pist: plakalı beton, pist başı çizgileri, orta çizgi, iniş bölgesi işaretleri
    A(b, BOX, 64, 1.2, L, 0, 0, 0, COL.runway, SURF.runway);
    const W = COL.white;
    for (const end of [-1, 1]) {
      for (let k = -3; k <= 3; k++) A(b, BOX, 3.5, 1.3, 30, k * 7.5, 0, end * (RUNWAY_HALF - 40), W, SURF.plain);
      for (const x of [-12, 12]) A(b, BOX, 4, 1.28, 45, x, 0, end * (RUNWAY_HALF - 330), W, SURF.plain);
    }
    for (let z = -RUNWAY_HALF + 120; z < RUNWAY_HALF - 120; z += 90) A(b, BOX, 1.2, 1.25, 36, 0, 0, z, W, SURF.plain);
    // Taksi yolu ve bağlantılar asfalt, apron beton (hangar kapılarına kadar)
    A(b, BOX, 22, 1, L * 0.8, -150, 0, 0, COL.asphalt, SURF.asphalt);
    for (const z of [-800, 0, 800]) A(b, BOX, 150, 0.95, 22, -75, 0, z, COL.asphalt, SURF.asphalt);
    A(b, BOX, 205, 0.9, 640, -277.5, 0, 0, COL.concreteDark, SURF.runway);
    // Kemer çatılı hangarlar: kapılı uçları aprona bakar
    for (let i = 0; i < 3; i++) hangar(b, -410, -300 + i * 300, 18 + rng() * 3);
    airfieldGrounds(b);
    // Kule: iki katlı sıvalı bina, cam kabin, keçe çatı
    A(b, BOX, 12, 9, 12, -330, 0, 700, COL.plaster, SURF.plasterWin);
    A(b, BOX, 9, 4, 9, -330, 9, 700, COL.plaster, SURF.plasterWin);
    A(b, BOX, 10, 2.6, 10, -330, 13, 700, COL.glass, SURF.curtain);
    A(b, BOX, 11, 0.4, 11, -330, 15.6, 700, COL.felt, SURF.felt);
    A(b, BOX, 12.4, 0.3, 12.4, -330, 9, 700, COL.concrete, SURF.concrete);
    // İtfaiye (tuğla, kapılar), barakalar (ahşap, keçe beşik çatı), yakıt tankları, rüzgâr tulumu
    A(b, BOX, 20, 6, 14, -300, 0, 760, COL.brick, SURF.brickWin);
    A(b, BOX, 20.6, 0.5, 14.6, -300, 6, 760, COL.felt, SURF.felt);
    for (let i = 0; i < 4; i++) {
      A(b, BOX, 9, 4, 42, -500, 0, 180 + i * 90, COL.wood, SURF.wood);
      A(b, GABLE, 9.8, 2.2, 42.8, -500, 4, 180 + i * 90, COL.felt, SURF.felt);
    }
    for (let i = 0; i < 3; i++) {
      A(b, CYL, 6, 7, 6, -470, 0, -720 + i * 16, 0x7e8476, SURF.metal);
      b.push(CONE.clone().scale(6.2, 1.2, 6.2).translate(-470, 7, -720 + i * 16), 0x737a6c, SURF.metal);
    }
    A(b, CYL, 0.25, 7, 0.25, 70, 0, 900, COL.steelLight, SURF.metal);
    A(b, CYLZ, 0.6, 0.6, 3, 70, 6.6, 900, 0xe2702c, SURF.plain);
    // Telsiz direği, takım bayrağı
    A(b, CYL, 0.35, 32, 0.35, -360, 0, 720, COL.steelLight, SURF.metal);
    for (const y of [10, 20, 30]) A(b, BOX, 4, 0.2, 0.2, -360, y, 720, COL.steelLight, SURF.metal);
    A(b, CYL, 0.12, 12, 0.12, -310, 0, 690, COL.white, SURF.metal);
    A(b, BOX, 0.1, 1.6, 2.6, -310, 10.2, 691.4, PALETTE.team[this.s.team], SURF.plain);
    // Apron araçları: yakıt tankerleri (zeytin yeşili), çekiciler, personel arabaları
    const veh = [0x4f5638, 0x5c6142, 0x2d2e30, 0x6b6f63];
    for (let i = 0; i < 9; i++) {
      const z = -300 + i * 72 + rng() * 10;
      const big = i % 3 === 0;
      const x = -360 + rng() * 20;
      A(b, BOX, big ? 2.6 : 1.9, big ? 2.8 : 1.6, big ? 8 : 4, x, 0.4, z, veh[i % veh.length], SURF.metal);
      if (big) A(b, CYLZ, 1.1, 1.1, 5, x, 2.1, z - 3, 0x5a6140, SURF.metal);
    }
    // Nissen kulübeleri (oluklu sac) ve dağıtım kulübeleri (ahşap)
    for (let i = 0; i < 6; i++) A(b, ARCH, 5, 3.4, 14, -540, 0, -900 + i * 40, 0x6f746a, SURF.corrugated);
    for (let i = 0; i < 4; i++) {
      A(b, BOX, 7, 3.6, 7, -100, 0, -1100 + i * 30, COL.wood, SURF.wood);
      A(b, GABLE, 7.6, 1.6, 7.6, -100, 3.6, -1100 + i * 30, COL.felt, SURF.felt);
    }
    g.add(this.craterGroup);
    g.add(this.parkedGroup);
    g.add(this.upgradeGroup);
  }

  private buildFactory(b: B, rng: () => number): void {
    // Testere dişi çatılı montaj holleri: kızıl tuğla, büyük çelik pencereler, kuzey yüzü camlı çatı dişleri
    for (let h = 0; h < 3; h++) {
      const x = -150 + h * 150;
      const z = -40 + (rng() - 0.5) * 30;
      const len = 120 + rng() * 40;
      A(b, BOX, 70, 14, len, x, 0, z, h === 1 ? COL.brickDark : COL.brick, SURF.brickWin);
      sawtoothRoof(b, 70, len, x, 14, z);
    }
    // Yönetim binası: sıvalı üç kat, pencereli; kiremit çatı
    A(b, BOX, 60, 12, 22, -40, 0, 140, COL.plasterCream, SURF.plasterWin);
    A(b, GABLE, 23, 5, 61, -40, 12, 140, COL.tile, SURF.tile, Math.PI / 2);
    // Ambarlar (oluklu sac kemer), bacalar (tuğla, kurum karası ağız), su kulesi, test apronu, çit
    for (let i = 0; i < 3; i++) A(b, ARCH, 14, 10, 40, 170, 0, 90 + i * 34, COL.galvanized, SURF.corrugated);
    for (let i = 0; i < 3; i++) {
      const r = 3.5 - i * 0.4;
      const hh = 45 + i * 8;
      A(b, CYL, r, hh, r, 60 + i * 22, 0, -150, COL.brickDark, SURF.brick);
      A(b, CYL, r * 1.12, 1.6, r * 1.12, 60 + i * 22, hh - 1.6, -150, 0x2c2826, SURF.metal);
    }
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) A(b, BOX, 0.6, 22, 0.6, -230 + dx, 0, 110 + dz, COL.steelLight, SURF.metal);
    A(b, CYL, 6, 8, 6, -230, 22, 110, 0x7d8279, SURF.metal);
    b.push(CONE.clone().scale(6.3, 1.6, 6.3).translate(-230, 30, 110), 0x6d7268, SURF.metal);
    A(b, BOX, 180, 0.8, 70, 30, 0, 215, COL.concrete, SURF.runway);
    fenceRing(b, 300, 270);
    // Demiryolu bağlantısı (balast, raylar) ve vagonlar, işçi otoparkı ve arabalar
    A(b, BOX, 4, 0.5, 520, 240, 0, -10, 0x6f665a, SURF.earth);
    for (const dx of [-0.72, 0.72]) A(b, BOX, 0.12, 0.65, 520, 240 + dx, 0, -10, COL.steel, SURF.metal);
    for (let i = 0; i < 7; i++) {
      const col = [0x6e4a35, 0x5c5f56, 0x7a5a42][i % 3];
      A(b, BOX, 3, 3.6, 13, 240, 0.6, -180 + i * 15, col, SURF.wood);
      A(b, ARCH, 1.5, 0.5, 13, 240, 4.2, -180 + i * 15, 0x3e3c3a, SURF.metal);
    }
    A(b, BOX, 60, 0.7, 40, -200, 0, 190, COL.asphalt, SURF.asphalt);
    for (let i = 0; i < 12; i++) {
      const col = [0x2d2e30, 0x5a5f4a, 0x6e2e28, 0x3a4a5e, 0x8a8478][i % 5];
      A(b, BOX, 2, 1.4, 4.4, -224 + (i % 6) * 9, 0.4, 180 + Math.floor(i / 6) * 16, col, SURF.metal);
    }
  }

  /** Her kare: inşaat, hasar, silah yönleri, radar dönüşü, krater ve park uçakları. */
  sync(simDt: number): void {
    const s = this.s;
    const mt = this.mat;
    // İnşaat
    if (s.build < 1) {
      if (!mt.transparent) {
        mt.transparent = true;
        mt.needsUpdate = true;
      }
      mt.opacity = 0.25 + s.build * 0.5;
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
      mt.opacity = 1;
      mt.transparent = false;
      mt.needsUpdate = true;
      if (this.scaffold) {
        this.group.remove(this.scaffold);
        this.scaffold = null;
      }
    }
    // Hasar: yanık ve kurum lekeleri; yıkılınca çöker
    const ratio = s.hp / s.maxHp;
    if (Math.abs(ratio - this.ratio) > 1e-3) {
      this.ratio = ratio;
      setArchDamage(mt, 1 - ratio);
      if (ratio <= 0) {
        for (const ch of this.group.children) if (ch instanceof THREE.Mesh) ch.scale.y *= 0.3;
      }
    }
    if (s.aa) this.syncAA(s.aa, simDt);
    if (s.radar && this.antenna) {
      // Görüntüdeki dönüş simülasyonun 5 sn'lik taramasından ayrı: büyük antenler yavaş döner (Freya ~28 sn'de,
      // kuledeki anten ~18 sn'de bir tur); 5 sn'de dönen kabin göze garip geliyordu
      if (s.active) this.antenna.rotation.y += (simDt * Math.PI * 2) / 28;
      if (s.radar.level !== this.towerLevel) this.syncRadarTower(s.radar.level);
      if (this.tower && s.active) this.tower.rotation.y += (simDt * Math.PI * 2) / 18;
    }
    if (s.airbase) this.syncAirbase();
    if (this.radarDish && s.active) this.radarDish.rotation.y += simDt * 2;
  }

  /**
   * Radar II: yukarı daralan kafes kule (dört ayak, her yüzde X çaprazlar, kat kirişleri, merdiven, tepede
   * korkuluklu platform, beton ayak temelleri) ve tepede dönen uzun menzil anteni (dipol dizileri, arkada yansıtıcı).
   */
  private syncRadarTower(level: number): void {
    this.towerLevel = level;
    if (level < 2 || this.tower) return;
    const H = 46;
    const B0 = 4.2;
    const B1 = 1.7;
    const N = 6;
    const cx = -26;
    const cz = -4;
    const S = COL.steelLight;
    const b = new ArchBatch();
    const hw = (y: number) => B0 + ((B1 - B0) * y) / H;
    const corner = (k: number, y: number): [number, number, number] => {
      const [sx, sz] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][k % 4];
      return [cx + sx * hw(y), y, cz + sz * hw(y)];
    };
    for (let k = 0; k < 4; k++) {
      beam(b, ...corner(k, 0), ...corner(k, H), 0.45, S);
      const [x, , z] = corner(k, 0);
      A(b, BOX, 1.6, 0.8, 1.6, x, 0, z, COL.concrete, SURF.concrete);
    }
    for (let i = 0; i < N; i++) {
      const y0 = (i * H) / N;
      const y1 = ((i + 1) * H) / N;
      for (let k = 0; k < 4; k++) {
        beam(b, ...corner(k, y1), ...corner(k + 1, y1), 0.22, S);
        beam(b, ...corner(k, y0), ...corner(k + 1, y1), 0.16, S);
        beam(b, ...corner(k + 1, y0), ...corner(k, y1), 0.16, S);
      }
    }
    // Merdiven (bir yüzün ortasında) ve tepe platformu, korkuluk
    beam(b, cx - 0.3, 0, cz - B0, cx - 0.3, H, cz - B1, 0.06, S);
    beam(b, cx + 0.3, 0, cz - B0, cx + 0.3, H, cz - B1, 0.06, S);
    A(b, BOX, 2 * B1 + 1.6, 0.3, 2 * B1 + 1.6, cx, H, cz, COL.steel, SURF.metal);
    for (const s of [-1, 1]) {
      A(b, BOX, 2 * B1 + 1.6, 0.06, 0.06, cx, H + 1.1, cz + s * (B1 + 0.8), S, SURF.metal);
      A(b, BOX, 0.06, 0.06, 2 * B1 + 1.6, cx + s * (B1 + 0.8), H + 1.1, cz, S, SURF.metal);
    }
    b.build(this.group, this.mat);
    // Dönen anten: mil, 6,4 m × 16 m çerçeve, arkada yansıtıcı ızgara, önde 6 sıra × 4 sütun dipol
    const t = new THREE.Group();
    t.position.set(cx, 0, cz);
    const tb = new ArchBatch();
    const A0 = H + 0.3;
    A(tb, CYL, 0.45, 1.6, 0.45, 0, A0, 0, COL.steel, SURF.metal);
    const AW = 3.2;
    const AY0 = A0 + 1.6;
    const AY1 = AY0 + 16;
    for (const s of [-1, 1]) A(tb, BOX, 0.22, AY1 - AY0, 0.22, s * AW, AY0, 0, S, SURF.metal);
    for (let y = AY0; y <= AY1 + 0.01; y += 4) A(tb, BOXC, 2 * AW + 0.2, 0.16, 0.16, 0, y, 0, S, SURF.metal);
    for (let y = AY0; y < AY1 - 0.01; y += 4) {
      beam(tb, -AW, y, -0.2, AW, y + 4, -0.2, 0.08, S);
      beam(tb, AW, y, -0.2, -AW, y + 4, -0.2, 0.08, S);
    }
    for (let x = -AW + 0.4; x < AW; x += 0.5) A(tb, BOXC, 0.035, AY1 - AY0, 0.035, x, (AY0 + AY1) / 2, -0.3, COL.steel, SURF.metal);
    for (let r = 0; r < 6; r++) {
      const y = AY0 + 1.3 + (r * (AY1 - AY0 - 2.6)) / 5;
      for (let c = 0; c < 4; c++) A(tb, BOXC, 1.2, 0.07, 0.07, -AW + 0.9 + (c * (2 * AW - 1.8)) / 3, y, 0.45, 0xc4c8c6, SURF.metal);
      A(tb, BOXC, 2 * AW - 1.0, 0.05, 0.05, 0, y, 0.3, S, SURF.metal);
    }
    tb.build(t, this.mat);
    this.group.add(t);
    this.tower = t;
  }

  /** i. topun namlu ucu dünyada (dönüş, yükseliş ve geri tepme dahil; namlu alevi buradan). Top yoksa null. */
  muzzleWorld(i: number, out: THREE.Vector3): THREE.Vector3 | null {
    const gun = this.mountGroup.getObjectByName(`gun${i}`);
    const mz = gun?.userData.muzzle as THREE.Object3D | undefined;
    if (!mz) return null;
    mz.updateWorldMatrix(true, false);
    return mz.getWorldPosition(out);
  }

  private syncAA(aa: AASite, simDt: number): void {
    const sig = aa.mounts.map((m) => m.weapon).join(',') + '|' + [...aa.sensors].join(',') + '|' + aa.level;
    if (sig !== this.mountSig) {
      this.mountSig = sig;
      this.mountGroup.clear();
      this.sensorGroup.clear();
      this.radarDish = null;
      this.rangefinder = null;
      // Boş çukurlar dahil seviyenin tüm yuvaları
      const pits = new ArchBatch();
      for (let i = 0; i < aa.maxMounts; i++) {
        const [ox, oz] = AASite.mountOffset(i);
        const weapon = aa.mounts[i]?.weapon;
        const pitR = weapon === 'aa128' ? 7.5 : weapon === 'aa88' ? 6.5 : weapon === 'aa37' || weapon === 'aa40' ? 5.2 : 4.2;
        gunPit(pits, aa.level, pitR, ox, oz);
        if (i >= 6) {
          // Dış halka yuvalarına uzanan yol
          const len = Math.hypot(ox, oz) - 8;
          A(pits, BOX, 2.4, 0.06, len, ox / 2, 0, oz / 2, COL.earth, SURF.earth, Math.atan2(ox, oz));
        }
      }
      pits.build(this.mountGroup, this.mat);
      aa.mounts.forEach((m, i) => {
        const gun = aaGun(m.weapon, this.mat);
        const [ox, oz] = AASite.mountOffset(i);
        gun.position.set(ox, 0, oz);
        gun.name = `gun${i}`;
        this.mountGroup.add(gun);
      });
      const sb = new ArchBatch();
      if (aa.sensors.has('rangefinder')) {
        // 4 m'lik optik telemetre, sehpa üstünde (komuta mevzisinin yanında)
        const rf = new THREE.Group();
        rf.position.set(-7, 0, -5);
        const rb = new ArchBatch();
        A(rb, CYL, 0.2, 1.5, 0.2, 0, 0.2, 0, COL.steel, SURF.metal);
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          beam(rb, Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9, 0, 0.6, 0, 0.07, COL.steel);
        }
        rb.build(rf, this.mat);
        const tube = new THREE.Group();
        tube.position.y = 1.7;
        const tb = new ArchBatch();
        tb.push(new THREE.CylinderGeometry(0.15, 0.15, 4, 12).rotateZ(Math.PI / 2), COL.gun, SURF.metal);
        for (const s of [-1, 1]) A(tb, BOXC, 0.35, 0.4, 0.36, s * 2.0, 0, 0, COL.gun, SURF.metal);
        A(tb, BOXC, 0.6, 0.5, 0.6, 0, 0, 0, COL.steel, SURF.metal);
        A(tb, BOXC, 0.12, 0.12, 0.25, -0.2, 0.05, -0.4, COL.steel, SURF.metal);
        tb.build(tube, this.mat);
        rf.add(tube);
        this.sensorGroup.add(rf);
        this.rangefinder = tube;
      }
      if (aa.sensors.has('predictor')) {
        // Atış hesap makinesi (Kommandogerät): ayaklı gövde, üstte nişan dürbünü, yanlarda el çarkları
        A(sb, BOX, 2, 1.3, 1.4, 7, 0.25, -6, COL.gun, SURF.metal);
        for (const [dx, dz] of [[-0.8, -0.55], [0.8, -0.55], [-0.8, 0.55], [0.8, 0.55]]) A(sb, BOX, 0.12, 0.25, 0.12, 7 + dx, 0, -6 + dz, COL.steel, SURF.metal);
        A(sb, BOX, 0.9, 0.35, 0.5, 7, 1.55, -6, COL.steel, SURF.metal);
        for (const s of [-1, 1]) handwheel(sb, 7 + s * 1.05, 0.9, -6, 0.22);
      }
      if (aa.sensors.has('gunRadar')) {
        // Würzburg tipi atış kontrol radarı: kabin, döner ayak; çatal üstünde 3 m'lik parabolik çanak (iki yüzlü),
        // kenarından odağa dört destek çubuğu ve besleyici
        const mast = new THREE.Group();
        mast.position.set(9, 0, 8);
        const mb = new ArchBatch();
        A(mb, BOX, 3.2, 2.2, 2.4, 0, 0, 0, 0x6d7168, SURF.metal);
        A(mb, BOX, 0.8, 1.7, 0.08, 0.8, 0, 1.22, 0x3a3d38, SURF.metal);
        A(mb, CYL, 0.55, 0.5, 0.55, 0, 2.2, 0, COL.steel, SURF.metal);
        mb.build(mast, this.mat);
        const dish = new THREE.Group();
        dish.position.y = 3.4;
        const db = new ArchBatch();
        A(db, CYL, 0.3, 1.0, 0.3, 0, -0.7, 0, COL.steel, SURF.metal);
        for (const s of [-1, 1]) A(db, BOX, 0.14, 1.3, 0.3, s * 0.85, -0.3, 0, COL.steel, SURF.metal);
        A(db, BOX, 1.84, 0.14, 0.3, 0, -0.35, 0, COL.steel, SURF.metal);
        // Çanak: paraboloit (derinlik 0,5 m, odak 1,1 m), +Z'ye bakar, 20° yukarı
        const R = 1.5;
        const DEPTH = 0.5;
        const prof = Array.from({ length: 9 }, (_, i) => new THREE.Vector2(Math.max(0.001, (R * i) / 8), DEPTH * (i / 8) ** 2));
        const tilt = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2 - 0.35).translate(0, 0.9, 0.1);
        db.push(tilt(new THREE.LatheGeometry(prof, 20)), 0xa8acaa, SURF.metal);
        db.push(tilt(new THREE.LatheGeometry([...prof].reverse(), 20)), 0x8e9290, SURF.metal);
        const f = (R * R) / (4 * DEPTH);
        const focus = new THREE.Vector3(0, f, 0);
        const rimPt = (a: number) => new THREE.Vector3(Math.cos(a) * R, DEPTH, Math.sin(a) * R);
        const tq = new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.35).setPosition(0, 0.9, 0.1);
        const fw = focus.clone().applyMatrix4(tq);
        for (let k = 0; k < 4; k++) {
          const p = rimPt((k / 4) * Math.PI * 2 + Math.PI / 4).applyMatrix4(tq);
          beam(db, p.x, p.y, p.z, fw.x, fw.y, fw.z, 0.04, COL.steel);
        }
        db.push(new THREE.CylinderGeometry(0.12, 0.08, 0.3, 8).applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.35)).translate(fw.x, fw.y, fw.z), COL.steel, SURF.metal);
        db.build(dish, this.mat);
        mast.add(dish);
        this.sensorGroup.add(mast);
        this.radarDish = dish;
      }
      sb.build(this.sensorGroup, this.mat);
    }
    // Namlu yönleri: pusula açısı → dünya yönü (sin, 0, -cos); her atışta geri tepme
    aa.mounts.forEach((m, i) => {
      const gun = this.mountGroup.getObjectByName(`gun${i}`);
      if (!gun) return;
      const u = gun.userData;
      (u.yaw as THREE.Object3D).rotation.y = Math.PI - m.yaw;
      (u.pitch as THREE.Object3D).rotation.x = -m.pitch;
      if (m.lastFire !== u.fired) {
        // İlk karede eski atış sayılmaz (kurulurken namlu geride durmasın)
        u.recoilT = u.fired === -1 ? 1e9 : 0;
        u.fired = m.lastFire;
      } else {
        u.recoilT += simDt;
      }
      (u.recoil as THREE.Object3D).position.z = -recoilAt(u.recoilT, u.recoilLen, u.recoilBack);
    });
    if (this.rangefinder && aa.mounts[0]) this.rangefinder.rotation.y = Math.PI / 2 - aa.mounts[0].yaw;
  }

  private syncAirbase(): void {
    const ab = this.s.airbase!;
    if (ab.craters.length !== this.craterCount) {
      this.craterCount = ab.craters.length;
      this.craterGroup.clear();
      // Bomba çukurları: içi koyu toprak, çevresinde fışkırmış toprak halkası
      const cb = new ArchBatch();
      for (const c of ab.craters) {
        A(cb, CRATER, 9, 1.6, 9, -c.v, 1.45, c.u, 0x4a3f33, SURF.earth);
        A(cb, SANDBAG, 10, 1.2, 10, -c.v, 1.2, c.u, 0x7a6a52, SURF.earth);
      }
      cb.build(this.craterGroup, this.mat);
    }
    // Tesisler: bakım atölyesi, ek hangarlar, toprak siperler
    const usig = [...ab.upgrades].sort().join(',');
    if (usig !== this.upgradeSig) {
      this.upgradeSig = usig;
      this.upgradeGroup.clear();
      const ub = new ArchBatch();
      if (ab.upgrades.has('workshop')) {
        A(ub, BOX, 40, 13, 60, -470, 0, -470, COL.brick, SURF.brickWin);
        sawtoothRoof(ub, 40, 60, -470, 13, -470);
      }
      if (ab.upgrades.has('hangars')) {
        for (const z of [-620, 630]) {
          hangar(ub, -410, z, 19);
          // Kapı önünde beton ve taksi yoluna bağlantı
          A(ub, BOX, 40, 0.8, 52, -360, 0, z, COL.concreteDark, SURF.runway);
          A(ub, BOX, 190, 0.75, 18, -245, 0, z, COL.asphalt, SURF.asphalt);
        }
      }
      if (ab.upgrades.has('revetments')) {
        // Toprak siperler: çim örtülü set, iç yüzü kum torbası
        for (let i = 0; i < 8; i++) {
          const z = -280 + i * 80;
          A(ub, BOX, 30, 3.5, 3, -340, 0, z - 14, COL.sandbag, SURF.sandbag);
          A(ub, BOX, 30, 3.5, 3, -340, 0, z + 14, COL.sandbag, SURF.sandbag);
          A(ub, BOX, 3, 3.5, 31, -356, 0, z, COL.turf, SURF.grass);
        }
      }
      ub.build(this.upgradeGroup, this.mat);
    }
    // Apronda bekleyen uçaklar (gerçek ölçekte)
    const parked = ab.inventory.filter((a) => a.status !== 'airborne').slice(0, 16);
    const sig = parked.map((a) => a.specId + a.status[0]).join(',');
    if (sig !== this.parkedSig) {
      this.parkedSig = sig;
      this.parkedGroup.clear();
      parked.forEach((af, i) => {
        const sp = SPECS[af.specId];
        const mdl = buildAircraftModel(sp.model, { gear: true, detail: quality().models });
        const row = Math.floor(i / 8);
        mdl.root.position.set(-220 - row * 55, gearHeight(sp), -280 + (i % 8) * 80);
        mdl.root.rotation.y = -Math.PI / 2;
        if (af.status === 'servicing') mdl.root.rotation.z = 0.04;
        this.parkedGroup.add(mdl.root);
      });
    }
  }
}
