// Yer yapılarının görünümleri: hava üssü, uçaksavar bataryası, radar istasyonu, uçak fabrikası ve şehir yapıları.
// Ölçüler gerçek boyutlara yakındır. İnşaat, hasar, tesis eklemeleri, silah yönleri ve park uçakları dahil.
// Her parça gerçek malzemesiyle (arch.ts): tuğla ve sıva duvarlar pencereli, oluklu sac hangarlar, plakalı pist
// betonu, kum torbaları, boyalı metal toplar. Sabit parçalar yapı başına tek ağda birleşir (az çizim çağrısı);
// dönen ve sonradan eklenen parçalar kendi küçük ağlarında.

import * as THREE from 'three';
import type { Structure } from '../sim/structures/structure';
import { AASite, AA_WEAPONS, type AAWeaponId } from '../sim/structures/airDefense';
import { RUNWAY_HALF } from '../sim/structures/airbase';
import { SPECS } from '../sim/aircraft/specs';
import { gearHeight, groundAngle } from '../sim/aircraft/flightModel';
import { quality } from '../ui/settings';
import { buildCityModel, cityParts as P } from './cityModels';
import { PALETTE } from './palette';
import { mulberry32 } from '../core/math';
import { ArchBatch, SURF, archMaterial, setArchDamage, type Surf } from './arch';
import { GABLE } from './props';
import { LAMP, LampSet } from './lamps';
import { groundStructure } from './ground';
import { bodyInfo, buildScaffold } from './construction';
import { parkedParts, requestSkin, skinStamp } from './models';
import { bakedGun, gunSkinStamp, requestGunSkin } from './gunSkins';
import { autoParts } from './vehicleParts';
import { aircraftTractor, ambulance, refueller, starterTrolley } from './airfieldVehicles';
import { fireVehicle } from './fireVehicles';
import type { AircraftSpec } from '../sim/aircraft/specs';

/** İçe bakan kopya (üçgen sırası ve normaller ters): kabuğun içi kapıdan bakınca görünsün. */
function inward(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const n = a.itemSize;
    const arr = a.array as Float32Array;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k];
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
        arr[(i + 2) * n + k] = t;
      }
    }
  }
  const nr = g.getAttribute('normal');
  if (nr) for (let i = 0; i < nr.array.length; i++) (nr.array as Float32Array)[i] *= -1;
  return g;
}

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const BOXC = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0);
const CYLZ = new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5);
/** Küçük yuvarlak parça: az üçgen. */
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
/** Kemer çatılı hangar: yarım silindir, uzunluk Z ekseninde. */
const ARCH = new THREE.CylinderGeometry(1, 1, 1, 28, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
/** Uçları açık kemer kabuğu ve içe bakan yüzü (kapısı açık hangar, iki ucu açık sığınak). */
const ARCH_OPEN = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
const ARCH_IN = inward(ARCH_OPEN);
/** Beşik çatının içi (tavan; çatının altı açık). */
const GABLE_IN = inward(GABLE);
/** Altıgen sığınak (Type 22 tipi beton mevzi), taban y = 0, yarıçap 1. */
const HEX = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
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
  for (let i = 1; i <= 28; i++) {
    const t = Math.PI - (Math.PI * i) / 28;
    s.lineTo(Math.cos(t) * a, Math.sin(t) * h);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -d / 2);
}

/** Kapı açıklığı oyulmuş kemer duvar: archWall, altta ±open genişlik ve doorH yükseklikte boşluk. */
function notchedWall(a: number, h: number, open: number, doorH: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-a, 0);
  for (let i = 1; i <= 28; i++) {
    const t = Math.PI - (Math.PI * i) / 28;
    s.lineTo(Math.cos(t) * a, Math.sin(t) * h);
  }
  s.lineTo(open, 0);
  s.lineTo(open, doorH);
  s.lineTo(-open, doorH);
  s.lineTo(-open, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -d / 2);
}

/**
 * Park yeri (hangar ağzı, sığınak, siper, apron): burun bu çizgiye gelir. yaw: modelin Y dönüşü (burun yönü),
 * width: yan yana uçakların sığdığı genişlik, depth: arkaya doğru boy, y: zeminin üst kotu, out: burnun çizgiden
 * taşması (m).
 */
interface Bay { x: number; z: number; yaw: number; width: number; depth: number; y: number; out: number }

/**
 * Yerel çerçeve (hangar, sığınak gibi döndürülmüş yapılar için): (lx, lz) → üs ekseni; parçalar da aynı açıyla
 * döner. Yerel +X yapının önü (kapı).
 */
class Frame {
  private readonly c: number;
  private readonly s: number;
  constructor(readonly b: B, readonly ox: number, readonly oz: number, readonly ry: number, readonly lamps: LampSet) {
    this.c = Math.cos(ry);
    this.s = Math.sin(ry);
  }
  x(lx: number, lz: number): number {
    return this.ox + lx * this.c + lz * this.s;
  }
  z(lx: number, lz: number): number {
    return this.oz - lx * this.s + lz * this.c;
  }
  A(geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, lx: number, y: number, lz: number, color: number, surf: Surf, lry = 0): void {
    A(this.b, geo, sx, sy, sz, this.x(lx, lz), y, this.z(lx, lz), color, surf, this.ry + lry);
  }
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, color: number): void {
    beam(this.b, this.x(ax, az), ay, this.z(ax, az), this.x(bx, bz), by, this.z(bx, bz), w, color);
  }
  lamp(lx: number, y: number, lz: number, color: number, r?: number, px?: number, blink?: number, phase?: number): void {
    this.lamps.lamp(this.x(lx, lz), y, this.z(lx, lz), color, r, px, blink, phase);
  }
  pool(lx: number, y: number, lz: number, r: number, color?: number, k?: number): void {
    this.lamps.pool(this.x(lx, lz), y, this.z(lx, lz), r, color, k);
  }
  /** Burnu yerel +X'e bakan park yeri. */
  bay(lx: number, lz: number, width: number, depth: number, y: number, out: number): Bay {
    return { x: this.x(lx, lz), z: this.z(lx, lz), yaw: this.ry + Math.PI / 2, width, depth, y, out };
  }
}

/** Daralan silindir: z'den başlar, len boyunca r0'dan r1'e (namlu, alev gizleyici). */
const taper = (b: B, r0: number, r1: number, len: number, x: number, y: number, z: number, color = COL.steel) =>
  b.push(new THREE.CylinderGeometry(r1, r0, len, 10).rotateX(Math.PI / 2).translate(x, y, z + len / 2), color, SURF.metal);
/** X ekseninde silindir (yan dişli kutusu, dişli yayı). */
const xDrum = (b: B, r: number, len: number, x: number, y: number, z: number, color = COL.steel) =>
  b.push(new THREE.CylinderGeometry(r, r, len, 14).rotateZ(Math.PI / 2).translate(x, y, z), color, SURF.metal);
/** Tesviye ayağı: yer tablası ve vida mili. */
function jack(b: B, x: number, z: number, r = 0.2, h = 0.3, color = COL.gun): void {
  A(b, CYL8, r, 0.06, r, x, 0, z, color, SURF.metal);
  A(b, BOX, r * 0.5, h, r * 0.5, x, 0.05, z, COL.steel, SURF.metal);
}
/** Üç kollu alçak platform ve kol uçlarında tesviye ayakları. */
function tripodBase(b: B, len: number, w: number, y: number, color = COL.gun): void {
  for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    A(b, BOXC, w, 0.12, len, Math.sin(a) * len * 0.5, y, Math.cos(a) * len * 0.5, color, SURF.metal, a);
    jack(b, Math.sin(a) * len, Math.cos(a) * len, 0.2, 0.3, color);
  }
}
/** Nişancı koltuğu: döner tablaya bağlayan kol, ayak ve oturak. */
function gunSeat(b: B, x: number, y: number, z: number, h: number, color = COL.gun): void {
  beam(b, x * 0.3, y + 0.03, z * 0.3, x, y + h * 0.45, z, 0.05, COL.steel);
  A(b, BOX, 0.05, h * 0.55, 0.05, x, y + h * 0.45, z, COL.steel, SURF.metal);
  A(b, CYL8, 0.17, 0.04, 0.17, x, y + h, z, color, SURF.metal);
}

/**
 * Topların boyası: ordusunun belgeli rengi (oyun ışığında okunsun diye gerçek tondan bir derece açık). Alman topları 1943'e dek
 * koyu gri (RAL 7021 Dunkelgrau), 1943'te çıkan Flak 41 kum sarısı (RAL 7028 Dunkelgelb); ABD topları zeytin yeşili (Olive Drab;
 * Bofors da ABD üretimi M1 gibi); Sovyet topları 4BO koruma yeşili; İngiliz 3,7 inç haki yeşil (Khaki Green No. 3); donanma topu
 * Oerlikon gemi grisi (Haze Gray). Namlular ve mekanizma koyu çelik.
 */
const GUN_PAINT: Record<AAWeaponId, number> = (() => {
  const ger = 0x4a4f51;
  const od = 0x5a5c38;
  const sov = 0x4e5b33;
  return {
    mg: od, mg4: od, aa90: od, aa40: od,
    aa20: ger, aa20q: ger, aa37: ger, aa88: ger, aa105: ger, aa128: ger,
    aa41: 0xa89668,
    oerlikon: 0x7c8487,
    aa61k: sov, aa85: sov,
    aa94: 0x5e5e3e,
  };
})();
/** Halka nişangâh (uçaksavar "araba tekerleği" nişangâhı): dikme üstünde ileriye bakan halka. */
function ringSight(b: B, x: number, y: number, z: number, r: number, post = 0.12): void {
  A(b, BOXC, 0.015, post, 0.015, x, y - post / 2, z, COL.steel, SURF.metal);
  b.push(new THREE.TorusGeometry(r, Math.max(0.006, r * 0.08), 4, 14).translate(x, y + r * 0.2, z), COL.steel, SURF.metal);
  A(b, BOXC, r * 0.25, 0.01, 0.01, x, y + r * 0.2, z, COL.steel, SURF.metal);
  A(b, BOXC, 0.01, r * 0.25, 0.01, x, y + r * 0.2, z, COL.steel, SURF.metal);
}
/** Mevzide hazır mermi: üst üste ahşap sandıklar (yer, yön). */
function ammoCrates(b: B, x: number, y: number, z: number, ry: number, n = 3, w = 0.6, h = 0.26, d = 0.38): void {
  for (let k = 0; k < n; k++) {
    const row = k % 2;
    const lev = Math.floor(k / 2);
    A(b, BOX, w, h, d, x + Math.cos(ry) * row * (w + 0.04), y + lev * h, z - Math.sin(ry) * row * (w + 0.04), 0x6b5a3c, SURF.wood, ry);
    A(b, BOX, w + 0.02, 0.03, 0.04, x + Math.cos(ry) * row * (w + 0.04), y + lev * h + h * 0.5, z - Math.sin(ry) * row * (w + 0.04), COL.steel, SURF.metal, ry);
  }
}
/** Ağır top mermi rafı: alçak çerçeve, dik duran fişekler (pirinç kovan, koyu çelik mermi). */
function shellRack(b: B, x: number, y: number, z: number, ry: number, n: number, r: number, len: number): void {
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const step = r * 2.4;
  A(b, BOX, n * step + 0.1, 0.06, r * 3, x, y, z, 0x6b5a3c, SURF.wood, ry);
  A(b, BOX, n * step + 0.1, 0.05, 0.05, x - sn * r * 1.3, y + len * 0.45, z - c * r * 1.3, 0x6b5a3c, SURF.wood, ry);
  for (const e of [-1, 1]) A(b, BOX, 0.05, len * 0.5, 0.05, x + c * e * (n * step) / 2 - sn * r * 1.3, y, z - sn * e * (n * step) / 2 - c * r * 1.3, 0x6b5a3c, SURF.wood, ry);
  for (let k = 0; k < n; k++) {
    const o = (k - (n - 1) / 2) * step;
    const px = x + c * o;
    const pz = z - sn * o;
    A(b, CYL8, r, len * 0.62, r, px, y + 0.06, pz, 0xb58a3c, SURF.metal);
    b.push(new THREE.CylinderGeometry(r * 0.25, r * 0.95, len * 0.38, 8).translate(px, y + 0.06 + len * 0.81, pz), 0x3a3d3f, SURF.metal);
  }
}
/** Veri alıcısı: çerçeveli kutu ve beyaz kadranlar (komuta aletinden gelen yön ve yükseliş). */
function dials(b: B, x: number, y: number, z: number, side: number, n = 2): void {
  A(b, BOX, 0.08, 0.34, 0.2 + 0.2 * n, x, y, z, 0x2e3133, SURF.metal);
  for (let k = 0; k < n; k++) {
    b.push(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 12).rotateZ(Math.PI / 2).translate(x + side * 0.05, y + 0.17, z + (k - (n - 1) / 2) * 0.2), 0xe8e4d8, SURF.plain);
  }
}

/**
 * Uçaksavar silahı. Grup içinde userData.yaw (dönen taban), userData.pitch (yükselen beşik), userData.recoil
 * (beşik içinde geri tepen namlu kümesi: namlu, ağız freni, kama) ve userData.muzzle (namlu ucu: alev buradan çıkar)
 * bulunur; userData.recoilLen / recoilBack geri tepme boyu (m) ve yerine dönüş süresi (s), gerçek silahlara yakın.
 * Ölçüler gerçek silahlara yakın (M2 Browning 12,7 mm … 128 mm Flak 40). Boya alaca gri, namlular çelik.
 * baked: Blender dokulu parçalar yüklüyse onlar (gunSkins.ts; userData.baked), yoksa kodla kurulan model.
 */
function aaGun(w: AAWeaponId, mat: THREE.Material, baked = false): THREE.Group {
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
  const P = GUN_PAINT[w];
  const D = COL.steel;
  const M = SURF.metal;
  switch (w) {
    case 'mg': {
      // M2 Browning: üç ayaklı sehpa ve kaide, su soğutma gömleği, gövde, kayış kutusu, arkada tutamak
      for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
        A(base, BOXC, 0.1, 0.08, 1.2, Math.sin(a) * 0.6, 0.06, Math.cos(a) * 0.6, D, M, a);
        beam(base, Math.sin(a) * 0.75, 0.06, Math.cos(a) * 0.75, 0, 0.55, 0, 0.05, D);
      }
      A(yb, CYL, 0.08, 0.95, 0.08, 0, 0.06, 0, D, M);
      A(yb, BOX, 0.3, 0.14, 0.16, 0, 0.95, 0, P, M);
      pitchG.position.y = 1.18;
      barrel(pb, 0.95, 0.075, 0, 0.02, 0.15);
      barrel(pb, 1.55, 0.024, 0, 0.02, 0.15);
      A(pb, BOXC, 0.16, 0.2, 0.62, 0, 0, -0.15, P, M);
      A(pb, BOXC, 0.2, 0.28, 0.32, -0.2, -0.04, -0.12, 0x4d5a3c, M);
      for (const s of [-1, 1]) A(pb, BOXC, 0.03, 0.14, 0.12, s * 0.07, 0, -0.5, D, M);
      ringSight(pb, 0, 0.17, 0.95, 0.09, 0.1);
      A(pb, BOXC, 0.02, 0.06, 0.02, 0, 0.16, -0.32, D, M);
      pb.push(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 10).rotateX(Math.PI / 2).translate(0, 0.02, 1.11), D, M);
      taper(pb, 0.026, 0.036, 0.08, 0, 0.02, 1.68);
      A(yb, CYL8, 0.14, 0.42, 0.14, 0.42, 0.06, 0.25, P, M);
      A(yb, CYL8, 0.04, 0.05, 0.04, 0.42, 0.48, 0.25, D, M);
      beam(yb, 0.42, 0.5, 0.25, 0.06, 1.05, 0.12, 0.025, 0x2a2b2c);
      tip.set(0, 0.02, 1.72);
      break;
    }
    case 'aa20': {
      // 2 cm Flak 38: üç kollu alçak platform, döner tabla, iki yan yanak, kalkansız açık top yeri, yükseliş yayı, koltuk,
      // el çarkları; gövde, yanda 20'lik şarjör, üstte nişangâh, daralan namlu ve alev gizleyici
      tripodBase(base, 1.35, 0.26, 0.14, P);
      A(base, CYL, 0.55, 0.1, 0.55, 0, 0.14, 0, P, M);
      A(yb, CYL, 0.46, 0.07, 0.46, 0, 0.24, 0, D, M);
      A(yb, CYL, 0.15, 0.5, 0.15, 0, 0.3, 0, D, M);
      for (const s of [-1, 1]) A(yb, BOX, 0.06, 0.68, 0.5, s * 0.19, 0.34, 0, P, M);
      yb.push(new THREE.TorusGeometry(0.36, 0.022, 6, 18).rotateY(Math.PI / 2).translate(0.3, 0.8, 0), D, M);
      gunSeat(yb, -0.45, 0.3, -0.55, 0.4, P);
      handwheel(yb, 0.28, 0.6, -0.22, 0.12);
      handwheel(yb, -0.28, 0.6, -0.22, 0.12);
      pitchG.position.y = 1.0;
      A(pb, BOXC, 0.16, 0.24, 1.05, 0, 0, -0.05, D, M);
      A(pb, BOXC, 0.1, 0.3, 0.2, -0.15, 0.03, 0.08, P, M);
      A(pb, BOXC, 0.03, 0.2, 0.03, 0, 0.22, 0.15, D, M);
      A(pb, BOXC, 0.2, 0.05, 0.05, 0, 0.33, 0.15, P, M);
      taper(pb, 0.055, 0.042, 0.5, 0, 0.02, 0.45);
      barrel(pb, 0.75, 0.03, 0, 0.02, 0.92);
      taper(pb, 0.032, 0.052, 0.16, 0, 0.02, 1.67);
      ringSight(pb, -0.06, 0.34, 0.38, 0.1, 0.22);
      A(pb, BOXC, 0.02, 0.1, 0.02, -0.06, 0.17, -0.3, D, M);
      for (const sx of [-1, 1]) A(yb, BOXC, 0.03, 0.03, 0.12, sx * 0.31, 0.72, -0.22, D, M);
      ammoCrates(base, 0.95, 0, -0.95, 0.5, 3, 0.42, 0.2, 0.3);
      tip.set(0, 0.02, 1.85);
      break;
    }
    case 'oerlikon': {
      // Oerlikon: flanşlı konik ayak ve yükseklik çarkı (sabit), üstte salınan beşik, delikli düz kalkan. Gövde, üstte 60'lık tambur, arkada nişancı
      // omuzlukları, halka nişangâh, ince uzun namlu
      base.push(new THREE.CylinderGeometry(0.2, 0.34, 0.85, 12).translate(0, 0.46, 0), P, M);
      A(base, CYL8, 0.48, 0.06, 0.48, 0, 0, 0, P, M);
      handwheel(base, 0.27, 0.72, 0, 0.2);
      A(yb, CYL8, 0.2, 0.1, 0.2, 0, 0.88, 0, D, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.05, 0.3, 0.18, s * 0.17, 0.96, 0, P, M);
        A(yb, BOX, 0.5, 0.62, 0.04, s * 0.32, 0.72, 0.42, P, M);
        A(pb, BOXC, 0.03, 0.22, 0.03, s * 0.14, -0.04, -0.62, D, M);
      }
      A(yb, BOX, 0.14, 0.22, 0.04, 0, 0.72, 0.42, P, M);
      pitchG.position.y = 1.16;
      A(pb, BOXC, 0.13, 0.17, 0.95, 0, 0, -0.12, D, M);
      pb.push(new THREE.CylinderGeometry(0.19, 0.19, 0.11, 14).translate(0, 0.16, -0.1), D, M);
      A(pb, BOXC, 0.3, 0.03, 0.03, 0, -0.04, -0.52, D, M);
      // Halka nişangâh: gövdeye dikme ile bağlı
      A(pb, BOXC, 0.02, 0.2, 0.02, 0, 0.17, 0.26, D, M);
      pb.push(new THREE.TorusGeometry(0.09, 0.012, 5, 12).translate(0, 0.33, 0.26), D, M);
      taper(pb, 0.045, 0.035, 0.42, 0, 0.01, 0.34);
      barrel(pb, 0.75, 0.024, 0, 0.01, 0.74);
      pb.push(new THREE.CylinderGeometry(0.11, 0.06, 0.32, 8).translate(0, -0.27, -0.2), 0x6f6a55, SURF.canvas);
      A(base, BOX, 0.55, 0.65, 0.4, 0.75, 0, -0.55, P, M);
      A(base, BOX, 0.5, 0.02, 0.04, 0.75, 0.45, -0.34, D, M);
      tip.set(0, 0.01, 1.5);
      break;
    }
    case 'aa90': {
      // 90 mm M1: dört uzun açılır kol ve yuvarlak platform, iki tekerlek; alçak gövde ve yan yanaklar, nişancı yerleri ve çarklar. Beşikte altta kalın
      // geri getirici; geri tepen namlu ve kama, ağız freni yok
      A(base, BOXC, 8.2, 0.16, 0.34, 0, 0.14, 0, P, M);
      A(base, BOXC, 0.34, 0.16, 7.0, 0, 0.14, 0, P, M);
      A(base, CYL, 1.55, 0.12, 1.55, 0, 0.12, 0, P, M);
      for (const [x, z] of [[4.05, 0], [-4.05, 0], [0, 3.45], [0, -3.45]]) jack(base, x, z, 0.2, 0.22, P);
      // Yana açılmış iki tekerlek ve dingil, arka kola bağlı
      A(base, BOXC, 3.5, 0.12, 0.14, 0, 0.46, -1.9, D, M);
      for (const s of [-1, 1]) xDrum(base, 0.46, 0.3, s * 1.75, 0.46, -1.9, 0x2a2b2c);
      A(yb, CYL, 1.0, 0.08, 1.0, 0, 0.24, 0, D, M);
      yb.push(new THREE.CylinderGeometry(0.4, 0.62, 0.55, 14).translate(0, 0.58, 0), P, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.1, 1.05, 1.35, s * 0.42, 0.75, -0.05, P, M);
        A(yb, BOX, 0.28, 0.38, 0.42, s * 0.66, 0.95, -0.25, D, M);
        handwheel(yb, s * 0.84, 1.15, -0.25, 0.17);
        gunSeat(yb, s * 1.05, 0.3, -0.5, 0.65, P);
      }
      pitchG.position.y = 1.72;
      A(pb, BOXC, 0.55, 0.52, 2.3, 0, 0, -0.2, D, M);
      taper(pb, 0.15, 0.13, 2.7, 0, -0.36, -0.4, P);
      A(pb, BOXC, 0.3, 0.1, 0.7, 0, -0.02, -1.75, P, M);
      A(rb, BOXC, 0.44, 0.44, 0.55, 0, 0.04, -1.45, D, M);
      taper(rb, 0.14, 0.12, 1.9, 0, 0.04, -1.15);
      taper(rb, 0.1, 0.08, 3.5, 0, 0.04, 0.75);
      barrel(rb, 0.12, 0.09, 0, 0.04, 4.2);
      A(pb, BOXC, 0.36, 0.42, 1.15, -0.5, 0.05, -1.5, D, M);
      A(pb, BOXC, 0.3, 0.06, 0.9, -0.5, 0.3, -1.45, P, M);
      xDrum(pb, 0.08, 0.1, -0.72, 0.05, -1.2);
      for (const sx of [-1, 1]) dials(yb, sx * 0.82, 1.04, -0.25, sx, 1);
      shellRack(base, 2.4, 0, 1.8, 0.7, 5, 0.06, 0.95);
      tip.set(0, 0.04, 4.35);
      recoilLen = 0.75;
      recoilBack = 0.5;
      break;
    }
    case 'aa41': {
      // 8,8 cm Flak 41: artı platform, iki uçta tekerlek ve çamurluk, alçak döner tabla; yüksek kutu kalkan (ön iki pano, namlu açıklığı, uzun yan panolar),
      // alçak muylu. Beşik ve üstte geri getirici; geri tepen kalın kılıf, uzun namlu, kama
      A(base, BOXC, 6.4, 0.2, 0.6, 0, 0.2, 0, P, M);
      A(base, BOXC, 0.6, 0.2, 6.4, 0, 0.2, 0, P, M);
      for (const [x, z] of [[3.1, 0], [-3.1, 0]]) jack(base, x, z, 0.3, 0.26, P);
      for (const z of [-2.95, 2.95]) {
        // İki uçta birer dingil: iki tekerlek, çamurluk ve dingil kolu
        for (const s of [-1, 1]) {
          xDrum(base, 0.5, 0.32, s * 0.95, 0.5, z, 0x2a2b2c);
          A(base, BOX, 0.5, 0.06, 1.05, s * 0.95, 1.04, z, P, M);
          A(base, BOX, 0.08, 0.62, 0.08, s * 0.72, 0.44, z, P, M);
        }
        A(base, BOXC, 1.9, 0.12, 0.14, 0, 0.5, z, D, M);
      }
      A(yb, CYL, 1.75, 0.14, 1.75, 0, 0.3, 0, P, M);
      A(yb, CYL, 0.9, 0.5, 0.9, 0, 0.44, 0, D, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.1, 0.85, 1.6, s * 0.42, 0.5, -0.05, P, M);
        A(yb, BOX, 0.06, 1.85, 2.7, s * 1.28, 0.44, -0.1, P, M);
        A(yb, BOX, 0.95, 1.85, 0.06, s * 0.8, 0.44, 1.22, P, M);
        handwheel(yb, s * 0.62, 1.0, -0.55, 0.18);
        gunSeat(yb, s * 0.85, 0.44, -0.75, 0.45, P);
      }
      A(yb, BOX, 0.66, 0.5, 0.06, 0, 0.44, 1.22, P, M);
      pitchG.position.y = 1.36;
      A(pb, BOXC, 0.58, 0.5, 2.3, 0, 0, -0.2, D, M);
      barrel(pb, 2.5, 0.09, 0, 0.36, -0.55, P);
      A(rb, BOXC, 0.5, 0.5, 0.6, 0, 0.02, -1.5, D, M);
      taper(rb, 0.18, 0.155, 2.8, 0, 0.02, -1.2, P);
      taper(rb, 0.115, 0.085, 3.8, 0, 0.02, 1.6);
      barrel(rb, 0.15, 0.1, 0, 0.02, 5.35);
      for (const sx of [-1, 1]) dials(yb, sx * 1.2, 1.55, 0.2, -sx);
      A(yb, BOX, 0.4, 0.5, 0.45, 0.85, 0.44, -0.9, D, M);
      A(pb, BOXC, 0.34, 0.1, 0.75, 0, -0.08, -1.95, P, M);
      shellRack(base, -2.2, 0, 1.5, 0.4, 5, 0.056, 1.0);
      tip.set(0, 0.02, 5.55);
      recoilLen = 0.9;
      recoilBack = 0.6;
      break;
    }
    case 'aa20q': {
      // Flakvierling 38: uzun platform ve dört tesviye ayağı, döner tabla, yan yanaklar ve dişli kutusu, arkada şarjör rafı ve
      // koltuk; beşikte dişli yayı, dört Flak 38 gövdesi, dış yanlarda şarjörler, üstte nişangâh kolu
      A(base, BOX, 1.25, 0.16, 2.8, 0, 0.1, 0, P, M);
      A(base, BOX, 2.5, 0.14, 0.34, 0, 0.1, 0.9, P, M);
      for (const [x, z] of [[-1.1, 0.9], [1.1, 0.9], [-0.55, -1.25], [0.55, -1.25]]) jack(base, x, z, 0.2, 0.2, P);
      A(yb, CYL, 0.72, 0.1, 0.72, 0, 0.26, 0, D, M);
      A(yb, BOX, 0.9, 0.45, 0.75, 0, 0.36, 0.05, P, M);
      for (const s of [-1, 1]) A(yb, BOX, 0.07, 0.72, 0.85, s * 0.56, 0.36, 0, P, M);
      xDrum(yb, 0.26, 0.2, 0.68, 0.72, -0.12);
      handwheel(yb, -0.68, 0.72, -0.2, 0.15);
      for (const k of [0, 1, 2, 3]) A(yb, BOXC, 0.05, 0.3, 0.42, -0.24 + k * 0.16, 0.56, -0.8, D, M);
      A(yb, BOX, 0.95, 0.06, 0.55, 0, 0.36, -0.8, P, M);
      gunSeat(yb, 0, 0.36, -1.2, 0.5, P);
      pitchG.position.y = 1.15;
      A(pb, BOXC, 0.5, 0.42, 0.75, 0, 0, -0.08, D, M);
      xDrum(pb, 0.42, 0.06, 0.34, 0, -0.1, P);
      beam(pb, 0, 0.2, -0.1, 0, 0.72, 0.25, 0.04, D);
      A(pb, BOXC, 0.12, 0.16, 0.4, 0, 0.78, 0.25, P, M);
      for (const [x, y] of [[-0.25, 0.2], [0.25, 0.2], [-0.25, -0.18], [0.25, -0.18]]) {
        A(pb, BOXC, 0.12, 0.15, 0.82, x, y, -0.12, D, M);
        A(pb, BOXC, 0.08, 0.22, 0.17, x * 1.62, y, -0.05, P, M);
        taper(pb, 0.05, 0.04, 0.48, x, y, 0.28);
        barrel(pb, 0.72, 0.028, x, y, 0.74);
        taper(pb, 0.03, 0.048, 0.15, x, y, 1.46);
      }
      for (const sx of [-1, 1]) {
        A(yb, BOX, 0.55, 0.85, 0.05, sx * 0.62, 0.45, 0.58, P, M);
        A(yb, BOX, 0.05, 0.85, 0.35, sx * 0.9, 0.45, 0.42, P, M, sx * -0.4);
      }
      A(yb, BOX, 0.7, 0.3, 0.05, 0, 0.45, 0.58, P, M);
      ammoCrates(base, -1.35, 0, -0.4, 0.3, 4, 0.45, 0.2, 0.32);
      tip.set(0, 0, 1.62);
      break;
    }
    case 'aa40': {
      // Bofors L/60 sabit mevzide: beton kaide, döner tabla, koni ayak, iki yan yanak; iki yanda nişancı koltuğu, nişangâh kutusu
      // ve el çarkları; doldurucu basamağı. Beşikte gövde, üstte 4'lük tarak kılavuzu; geri tepen namlu yay kılıfı ve huni alev gizleyici
      A(base, CYL, 1.45, 0.3, 1.45, 0, 0, 0, COL.concrete, SURF.concrete);
      A(yb, CYL, 1.05, 0.09, 1.05, 0, 0.3, 0, D, M);
      yb.push(new THREE.CylinderGeometry(0.34, 0.56, 0.6, 14).translate(0, 0.68, 0), P, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.09, 0.95, 0.85, s * 0.34, 0.45, 0, P, M);
        gunSeat(yb, s * 0.95, 0.39, -0.4, 0.55, P);
        A(yb, BOX, 0.2, 0.28, 0.32, s * 0.68, 1.02, 0.05, D, M);
        A(yb, BOX, 0.5, 0.05, 0.14, s * 0.62, 0.92, -0.12, P, M);
        handwheel(yb, s * 0.68, 0.85, -0.28, 0.16);
      }
      A(yb, BOX, 1.15, 0.07, 0.5, 0, 0.8, -1.05, P, M);
      A(yb, BOX, 0.06, 0.45, 0.06, 0, 0.39, -1.05, D, M);
      pitchG.position.y = 1.5;
      A(pb, BOXC, 0.4, 0.52, 1.35, 0, 0, -0.1, D, M);
      A(pb, BOXC, 0.25, 0.55, 0.42, 0, 0.5, -0.2, P, M);
      for (const s of [-1, 1]) A(pb, BOXC, 0.03, 0.42, 0.42, s * 0.14, 0.92, -0.2, D, M);
      for (const k of [-1.5, -0.5, 0.5, 1.5]) barrel(pb, 0.34, 0.034, k * 0.066, 0.95, -0.38, 0x8a7a44);
      barrel(rb, 0.95, 0.125, 0, 0.04, 0.5);
      taper(rb, 0.085, 0.06, 2.2, 0, 0.04, 1.42);
      taper(rb, 0.065, 0.16, 0.5, 0, 0.04, 3.6);
      for (const sx of [-1, 1]) ringSight(pb, sx * 0.24, 0.5, 0.4, 0.12, 0.24);
      ammoCrates(base, -1.75, 0, 0.6, 1.2, 4, 0.5, 0.22, 0.34);
      ammoCrates(base, 1.55, 0, -1.0, -0.4, 3, 0.5, 0.22, 0.34);
      tip.set(0, 0.04, 4.15);
      recoilLen = 0.2;
      recoilBack = 0.15;
      break;
    }
    case 'aa128': {
      // 12,8 cm Flak 40 sabit mevzide: artı biçimli çelik platform ve dört büyük tesviye ayağı, koni ayak, iki büyük yan yanak;
      // yanlarda dişli kutuları, el çarkları, koltuklar, gösterge kutuları. Beşikte üstte çift geri getirici, arkada doldurma
      // kızağı; geri tepen namlu: kalın kılıf, daralan namlu, kama
      A(base, BOX, 5.4, 0.42, 1.5, 0, 0.15, 0, P, M);
      A(base, BOX, 1.5, 0.42, 5.4, 0, 0.15, 0, P, M);
      A(base, BOX, 2.6, 0.45, 2.6, 0, 0.15, 0, P, M);
      for (const [x, z] of [[2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]]) jack(base, x, z, 0.5, 0.42, P);
      yb.push(new THREE.CylinderGeometry(0.85, 1.15, 0.85, 16).translate(0, 1.0, 0), P, M);
      A(yb, CYL, 1.3, 0.1, 1.3, 0, 0.58, 0, D, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.18, 1.7, 3.1, s * 0.72, 1.3, 0.05, P, M);
        A(yb, BOX, 0.42, 0.55, 0.9, s * 0.98, 1.6, 0.6, D, M);
        xDrum(yb, 0.34, 0.5, s * 1.08, 1.85, -0.6);
        handwheel(yb, s * 1.38, 1.85, -0.6, 0.28);
        handwheel(yb, s * 1.26, 1.45, 0.45, 0.26);
        gunSeat(yb, s * 1.5, 0.57, -0.1, 0.65, P);
        A(yb, BOX, 0.3, 0.3, 0.42, s * 1.0, 2.2, 0.55, 0x4a4d4f, M);
      }
      pitchG.position.set(0, 2.7, 0.2);
      A(pb, BOXC, 0.9, 0.82, 3.3, 0, 0, -0.1, D, M);
      A(pb, BOXC, 0.5, 0.2, 1.3, 0, -0.08, -2.3, P, M);
      for (const x of [-0.34, 0.34]) barrel(pb, 3.7, 0.2, x, 0.68, -0.9, P);
      A(pb, BOXC, 1.1, 0.42, 0.2, 0, 0.5, 2.55, P, M);
      A(rb, BOXC, 0.85, 0.85, 1.0, 0, 0, -1.85, D, M);
      taper(rb, 0.27, 0.23, 3.4, 0, 0, -1.3, P);
      taper(rb, 0.17, 0.135, 5.0, 0, 0, 2.05);
      barrel(rb, 0.22, 0.155, 0, 0, 7.0);
      for (const sx of [-1, 1]) dials(yb, sx * 1.22, 2.2, 0.55, sx);
      for (let k = 0; k < 3; k++) A(base, BOX, 0.7, 0.14, 0.32, 0, 0.0 + k * 0.14, -3.2 + k * 0.3, D, M);
      shellRack(base, 3.0, 0.0, 2.4, 0.6, 5, 0.075, 1.2);
      tip.set(0, 0, 7.3);
      recoilLen = 1.1;
      recoilBack = 0.8;
      break;
    }
    case 'mg4': {
      // M45 Quadmount, M55 römorkunda: dikdörtgen römork tabanı, iki tekerlek ve dört köşe ayağı. Dönen tarette alçak kaide,
      // nişancının önünde eğik zırh kalkanı ve koltuk, arkada iki akü kutusu. Beşikte iki yanda üst üste ikişer M2 Browning
      // (gövde, delikli namlu desteği, ağır namlu), dış yanlarda 200'lük mermi kutuları, ortada yansıtmalı nişangâh
      A(base, BOX, 1.7, 0.14, 2.6, 0, 0.42, 0, P, M);
      A(base, BOXC, 0.12, 0.12, 3.3, 0, 0.42, 0.2, D, M);
      A(base, BOXC, 0.4, 0.06, 0.06, 0, 0.5, 1.85, D, M);
      for (const s of [-1, 1]) {
        xDrum(base, 0.36, 0.22, s * 0.98, 0.36, -0.2, 0x2a2b2c);
        A(base, BOX, 0.32, 0.05, 0.85, s * 0.98, 0.76, -0.2, P, M);
      }
      for (const [x, z] of [[0.75, 1.15], [-0.75, 1.15], [0.75, -1.15], [-0.75, -1.15]]) {
        A(base, BOX, 0.08, 0.42, 0.08, x, 0.05, z, D, M);
        jack(base, x, z, 0.16, 0.1, P);
      }
      A(yb, CYL, 0.62, 0.1, 0.62, 0, 0.56, 0, D, M);
      A(yb, BOX, 0.9, 0.38, 0.9, 0, 0.66, -0.05, P, M);
      for (const s of [-1, 1]) A(yb, BOX, 0.22, 0.24, 0.3, s * 0.3, 1.04, -0.52, 0x3c3e36, M);
      gunSeat(yb, 0, 0.66, -0.2, 0.62, P);
      // Zırh kalkanı: ön pano geriye eğik, iki yanda kanat
      A(yb, BOX, 0.62, 0.62, 0.05, 0, 1.0, 0.36, P, M, 0);
      for (const s of [-1, 1]) A(yb, BOX, 0.05, 0.5, 0.4, s * 0.31, 1.0, 0.18, P, M);
      pitchG.position.set(0, 1.42, 0.05);
      A(pb, BOXC, 0.5, 0.12, 0.22, 0, 0, -0.05, D, M);
      for (const s of [-1, 1]) {
        A(pb, BOXC, 0.1, 0.5, 0.42, s * 0.36, 0, -0.08, P, M);
        for (const y of [0.13, -0.13]) {
          A(pb, BOXC, 0.13, 0.17, 0.66, s * 0.5, y, -0.12, D, M);
          barrel(pb, 0.2, 0.042, s * 0.5, y, 0.21, D);
          barrel(pb, 0.95, 0.024, s * 0.5, y, 0.41);
          barrel(pb, 0.05, 0.03, s * 0.5, y, 1.33, D);
        }
        A(pb, BOXC, 0.13, 0.44, 0.34, s * 0.68, 0, -0.18, 0x4d5a3c, M);
      }
      A(pb, BOXC, 0.06, 0.2, 0.06, 0, 0.16, 0.0, D, M);
      A(pb, BOXC, 0.16, 0.12, 0.04, 0, 0.3, 0.0, 0x8fa4a8, M);
      for (const sx of [-1, 1]) {
        A(yb, BOX, 0.03, 0.22, 0.03, sx * 0.12, 1.02, 0.12, D, M);
        A(yb, BOXC, 0.05, 0.05, 0.08, sx * 0.12, 1.26, 0.12, 0x2a2b2c, M);
        beam(pb, sx * 0.68, 0.18, -0.12, sx * 0.55, 0.22, -0.02, 0.06, 0x3c3e36);
        beam(pb, sx * 0.68, -0.18, -0.12, sx * 0.55, -0.05, -0.02, 0.06, 0x3c3e36);
        xDrum(base, 0.12, 0.25, sx * 1.1, 0.36, -0.2);
      }
      tip.set(0, 0, 1.38);
      break;
    }
    case 'aa61k': {
      // 37 mm 61-K, dört tekerlekli lafet açılmış: uzun gövde, iki yana açılan kollar ve dört tesviye ayağı, iki dingil ve tekerlekler.
      // Döner tabla, koni ayak, iki yan yanak; iki yanda koltuk, nişangâh kutusu, el çarkları; küçük düz kalkan. Beşikte gövde, üstte
      // 5'lik tarak kılavuzu; geri tepen namlu yay kılıfı, ince namlu, koni alev gizleyici
      A(base, BOXC, 0.5, 0.2, 4.2, 0, 0.28, 0, P, M);
      A(base, BOXC, 3.2, 0.16, 0.36, 0, 0.26, 0, P, M);
      for (const [x, z] of [[1.55, 0], [-1.55, 0], [0, 2.0], [0, -2.0]]) jack(base, x, z, 0.2, 0.18, P);
      for (const z of [-1.45, 1.45]) {
        A(base, BOXC, 1.35, 0.1, 0.12, 0, 0.42, z, D, M);
        for (const s of [-1, 1]) xDrum(base, 0.36, 0.2, s * 0.72, 0.42, z, 0x2a2b2c);
      }
      A(base, CYL, 0.62, 0.14, 0.62, 0, 0.36, 0, P, M);
      A(yb, CYL, 0.56, 0.08, 0.56, 0, 0.5, 0, D, M);
      yb.push(new THREE.CylinderGeometry(0.28, 0.42, 0.45, 12).translate(0, 0.78, 0), P, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.08, 0.85, 0.75, s * 0.3, 0.6, 0, P, M);
        gunSeat(yb, s * 0.82, 0.52, -0.38, 0.5, P);
        A(yb, BOX, 0.18, 0.24, 0.28, s * 0.6, 1.2, 0.05, D, M);
        handwheel(yb, s * 0.6, 0.98, -0.25, 0.15);
        A(yb, BOX, 0.4, 0.62, 0.04, s * 0.42, 1.05, 0.55, P, M);
      }
      A(yb, BOX, 0.44, 0.24, 0.04, 0, 1.05, 0.55, P, M);
      pitchG.position.y = 1.55;
      A(pb, BOXC, 0.3, 0.38, 1.3, 0, 0, -0.1, D, M);
      A(pb, BOXC, 0.2, 0.46, 0.4, 0, 0.4, -0.22, P, M);
      for (const k of [-2, -1, 0, 1, 2]) barrel(pb, 0.3, 0.024, k * 0.046, 0.72, -0.38, 0x8a7a44);
      barrel(rb, 0.8, 0.095, 0, 0.03, 0.5);
      taper(rb, 0.062, 0.046, 1.65, 0, 0.03, 1.3);
      taper(rb, 0.05, 0.11, 0.4, 0, 0.03, 2.95);
      for (const sx of [-1, 1]) ringSight(pb, sx * 0.17, 0.4, 0.4, 0.11, 0.22);
      ammoCrates(base, -1.5, 0, 1.2, 0.9, 4, 0.5, 0.2, 0.34);
      tip.set(0, 0.03, 3.4);
      recoilLen = 0.18;
      recoilBack = 0.14;
      break;
    }
    case 'aa85': {
      // 85 mm 52-K yere oturmuş: artı biçimli platform ve dört tesviye ayağı, ön ve arka dingil kalkık tekerleklerle. Koni ayak,
      // büyük yan yanaklar, koltuklar ve el çarkları, tapa ayar kutusu. Beşikte üstte geri getirici, altta fren silindiri; geri tepen
      // namlu: kılıf, uzun namlu, çok bölmeli ağız freni, kama
      for (const a of [0, Math.PI / 2]) A(base, BOXC, 5.6, 0.22, 0.48, 0, 0.18, 0, P, M, a);
      A(base, CYL, 1.05, 0.18, 1.05, 0, 0.1, 0, P, M);
      for (const [x, z] of [[2.7, 0], [-2.7, 0], [0, 2.7], [0, -2.7]]) jack(base, x, z, 0.34, 0.3, P);
      for (const z of [-2.2, 2.2]) {
        A(base, BOXC, 1.7, 0.12, 0.14, 0, 0.55, z, D, M);
        for (const s of [-1, 1]) xDrum(base, 0.45, 0.24, s * 0.85, 0.55, z, 0x2a2b2c);
      }
      yb.push(new THREE.CylinderGeometry(0.4, 0.66, 0.8, 16).translate(0, 0.7, 0), P, M);
      A(yb, CYL, 0.78, 0.08, 0.78, 0, 0.28, 0, D, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.1, 1.1, 1.6, s * 0.44, 0.9, -0.05, P, M);
        gunSeat(yb, s * 0.98, 0.28, -0.3, 0.7, P);
        handwheel(yb, s * 0.64, 1.4, -0.35, 0.18);
        handwheel(yb, s * 0.64, 1.08, 0.25, 0.16);
      }
      A(yb, BOX, 0.4, 0.46, 0.46, -0.78, 0.95, 0.42, D, M);
      pitchG.position.y = 1.82;
      A(pb, BOXC, 0.58, 0.52, 2.2, 0, 0, -0.2, D, M);
      barrel(pb, 2.4, 0.085, 0, 0.4, -0.5, P);
      barrel(pb, 2.1, 0.08, 0, -0.36, -0.3, D);
      A(pb, BOXC, 0.32, 0.1, 0.65, 0, -0.08, -1.75, P, M);
      A(rb, BOXC, 0.46, 0.46, 0.55, 0, 0.03, -1.45, D, M);
      taper(rb, 0.16, 0.14, 2.1, 0, 0.03, -1.15, P);
      taper(rb, 0.105, 0.08, 3.5, 0, 0.03, 0.95);
      // Ağız freni: kalın gövde ve yan delikler (koyu bantlar)
      barrel(rb, 0.42, 0.14, 0, 0.03, 4.45, D);
      for (const z of [4.55, 4.7]) A(rb, BOXC, 0.3, 0.06, 0.06, 0, 0.03, z, 0x1c1d1e, M);
      for (const sx of [-1, 1]) dials(yb, sx * 0.53, 1.55, 0.35, sx, 1);
      shellRack(base, -2.0, 0, -1.7, 0.7, 5, 0.055, 0.95);
      tip.set(0, 0.03, 4.9);
      recoilLen = 0.85;
      recoilBack = 0.6;
      break;
    }
    case 'aa94': {
      // QF 3,7 inç Mk I seyyar: dört tekerlekli platform yere indirilmiş, dört açılır kol ve tesviye ayakları; iki dingil. Alçak
      // döner tabla, büyük yan yanaklar; solda doldurucu basamağı ve büyük tapa ayar makinesi, sağda nişancı koltuğu ve çarklar.
      // Beşikte altta çift fren ve geri getirici; geri tepen namlu: kılıf, uzun ince namlu (ağız freni yok), kama
      A(base, BOXC, 1.6, 0.24, 5.4, 0, 0.3, 0, P, M);
      for (const s of [-1, 1]) A(base, BOXC, 2.6, 0.16, 0.36, s * 1.9, 0.24, 0.6, P, M);
      for (const [x, z] of [[3.1, 0.6], [-3.1, 0.6], [0, 2.75], [0, -2.75]]) jack(base, x, z, 0.3, 0.26, P);
      for (const z of [-2.0, 2.0]) {
        A(base, BOXC, 2.1, 0.12, 0.14, 0, 0.55, z, D, M);
        for (const s of [-1, 1]) xDrum(base, 0.46, 0.26, s * 1.05, 0.55, z, 0x2a2b2c);
      }
      A(yb, CYL, 0.95, 0.1, 0.95, 0, 0.42, 0, D, M);
      yb.push(new THREE.CylinderGeometry(0.45, 0.7, 0.55, 16).translate(0, 0.78, 0), P, M);
      for (const s of [-1, 1]) A(yb, BOX, 0.12, 1.15, 1.75, s * 0.48, 0.95, -0.1, P, M);
      A(yb, BOX, 0.62, 0.7, 0.8, -1.0, 0.95, -0.55, D, M);
      A(yb, BOX, 0.8, 0.06, 0.8, -1.0, 0.52, -0.55, P, M);
      xDrum(yb, 0.22, 0.12, -1.33, 1.3, -0.55);
      gunSeat(yb, 1.05, 0.42, -0.25, 0.7, P);
      handwheel(yb, 0.7, 1.45, -0.4, 0.2);
      handwheel(yb, 0.7, 1.1, 0.3, 0.17);
      pitchG.position.y = 2.0;
      A(pb, BOXC, 0.62, 0.58, 2.5, 0, 0, -0.25, D, M);
      for (const s of [-1, 1]) barrel(pb, 2.3, 0.09, s * 0.17, -0.4, -0.4, P);
      A(pb, BOXC, 0.36, 0.1, 0.8, 0, -0.08, -1.95, P, M);
      A(rb, BOXC, 0.5, 0.5, 0.62, 0, 0.03, -1.6, D, M);
      taper(rb, 0.17, 0.15, 2.3, 0, 0.03, -1.3, P);
      taper(rb, 0.11, 0.08, 3.9, 0, 0.03, 1.0);
      barrel(rb, 0.14, 0.095, 0, 0.03, 4.9);
      A(pb, BOXC, 0.3, 0.06, 0.9, -0.15, 0.3, -1.75, P, M);
      shellRack(base, 2.3, 0, -1.6, -0.5, 5, 0.06, 1.0);
      tip.set(0, 0.03, 5.1);
      recoilLen = 0.95;
      recoilBack = 0.6;
      break;
    }
    case 'aa105': {
      // 10,5 cm Flak 38 sabit mevzide: artı biçimli çelik platform ve dört büyük tesviye ayağı, koni ayak, iki büyük yan yanak; yanlarda
      // elektrikli nişan kutuları ve gösterge panoları, el çarkları, koltuklar; arkada doldurma kızağı. Beşikte üstte çift geri
      // getirici; geri tepen namlu: kalın kılıf, 6,6 m daralan namlu, kama
      A(base, BOX, 5.0, 0.38, 1.3, 0, 0.12, 0, P, M);
      A(base, BOX, 1.3, 0.38, 5.0, 0, 0.12, 0, P, M);
      A(base, BOX, 2.3, 0.4, 2.3, 0, 0.12, 0, P, M);
      for (const [x, z] of [[2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]]) jack(base, x, z, 0.44, 0.38, P);
      yb.push(new THREE.CylinderGeometry(0.72, 1.0, 0.8, 16).translate(0, 0.92, 0), P, M);
      A(yb, CYL, 1.15, 0.1, 1.15, 0, 0.52, 0, D, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.16, 1.55, 2.8, s * 0.64, 1.2, 0.05, P, M);
        A(yb, BOX, 0.4, 0.62, 0.7, s * 0.95, 1.35, 0.55, 0x4a4d4f, M);
        A(yb, BOX, 0.06, 0.32, 0.42, s * 1.16, 1.55, 0.55, 0xd8d4c4, SURF.plain);
        handwheel(yb, s * 1.2, 1.75, -0.5, 0.24);
        gunSeat(yb, s * 1.38, 0.52, -0.2, 0.62, P);
      }
      A(yb, BOX, 0.5, 0.12, 1.2, 0, 1.25, -1.65, P, M);
      pitchG.position.set(0, 2.45, 0.15);
      A(pb, BOXC, 0.8, 0.72, 3.0, 0, 0, -0.1, D, M);
      for (const x of [-0.3, 0.3]) barrel(pb, 3.3, 0.17, x, 0.6, -0.85, P);
      A(pb, BOXC, 0.95, 0.36, 0.18, 0, 0.45, 2.3, P, M);
      A(rb, BOXC, 0.74, 0.74, 0.9, 0, 0, -1.7, D, M);
      taper(rb, 0.23, 0.2, 3.0, 0, 0, -1.2, P);
      taper(rb, 0.14, 0.11, 4.6, 0, 0, 1.8);
      barrel(rb, 0.2, 0.125, 0, 0, 6.35);
      for (let k = 0; k < 3; k++) A(base, BOX, 0.6, 0.13, 0.3, 0, k * 0.13, -2.85 + k * 0.28, D, M);
      shellRack(base, 2.4, 0.0, 2.1, 0.6, 5, 0.07, 1.1);
      tip.set(0, 0, 6.6);
      recoilLen = 1.0;
      recoilBack = 0.7;
      break;
    }
    case 'aa37': {
      // 3,7 cm Flak 36: üç kollu platform, döner tabla, yan yanaklar, namluya açıklığı olan küçük kalkan, koltuklar ve el çarkları.
      // Beşikte gövde, üstte 6'lık tarak kılavuzu; geri tepen namlu yay kılıfı ve alev gizleyici
      tripodBase(base, 2.0, 0.34, 0.2, P);
      A(base, CYL, 0.8, 0.14, 0.8, 0, 0.18, 0, P, M);
      A(yb, CYL, 0.68, 0.08, 0.68, 0, 0.32, 0, D, M);
      A(yb, CYL, 0.24, 0.55, 0.24, 0, 0.38, 0, D, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.07, 0.85, 0.7, s * 0.26, 0.4, 0, P, M);
        A(yb, BOX, 0.46, 0.68, 0.05, s * 0.45, 0.92, 0.55, P, M);
        gunSeat(yb, s * 0.68, 0.38, -0.55, 0.42, P);
        handwheel(yb, s * 0.42, 0.78, -0.25, 0.15);
      }
      A(yb, BOX, 0.46, 0.22, 0.05, 0, 0.92, 0.55, P, M);
      pitchG.position.y = 1.3;
      A(pb, BOXC, 0.26, 0.34, 1.35, 0, 0, -0.1, D, M);
      A(pb, BOXC, 0.18, 0.42, 0.42, 0, 0.36, -0.25, P, M);
      for (const k of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) barrel(pb, 0.26, 0.022, k * 0.042, 0.62, -0.38, 0x8a7a44);
      barrel(rb, 0.72, 0.085, 0, 0.03, 0.5);
      taper(rb, 0.06, 0.045, 1.5, 0, 0.03, 1.2);
      taper(rb, 0.048, 0.08, 0.28, 0, 0.03, 2.68);
      beam(pb, 0, -0.2, -0.45, 0, -0.5, -0.85, 0.1, D);
      A(pb, BOXC, 0.12, 0.2, 0.26, -0.22, 0.24, 0.02, D, M);
      A(pb, BOXC, 0.05, 0.05, 0.1, -0.22, 0.28, -0.16, D, M);
      ammoCrates(base, 1.2, 0, 1.0, 0.8, 3, 0.5, 0.2, 0.34);
      tip.set(0, 0.03, 3.0);
      recoilLen = 0.15;
      recoilBack = 0.12;
      break;
    }
    case 'aa88': {
      // 8,8 cm Flak 36: artı platform ve tesviye ayakları, koni ayak, büyük yan yanaklar, tapa ayar makinesi, koltuklar ve el
      // çarkları; yerde mermi sandıkları. Beşikte üstte geri getirici, altta fren silindiri, iki yanda dengeleyici; geri tepen
      // namlu: kılıf, daralan namlu, ince ağız halkası, kama
      for (const a of [0, Math.PI / 2]) A(base, BOXC, 5.8, 0.22, 0.5, 0, 0.17, 0, P, M, a);
      A(base, CYL, 1.15, 0.18, 1.15, 0, 0.1, 0, P, M);
      for (const [x, z] of [[2.8, 0], [-2.8, 0], [0, 2.8], [0, -2.8]]) jack(base, x, z, 0.36, 0.3, P);
      for (const [x, z] of [[-1.6, -1.9], [-2.1, -1.5]]) A(base, BOX, 0.5, 0.35, 0.9, x, 0, z, 0x5a5440, SURF.wood, 0.6);
      yb.push(new THREE.CylinderGeometry(0.42, 0.72, 0.85, 16).translate(0, 0.72, 0), P, M);
      A(yb, CYL, 0.82, 0.08, 0.82, 0, 0.28, 0, D, M);
      for (const s of [-1, 1]) {
        A(yb, BOX, 0.11, 1.15, 1.7, s * 0.46, 0.95, -0.05, P, M);
        gunSeat(yb, s * 1.0, 0.28, -0.25, 0.75, P);
        handwheel(yb, s * 0.68, 1.45, -0.4);
        handwheel(yb, s * 0.68, 1.1, 0.25, 0.17);
      }
      A(yb, BOX, 0.42, 0.5, 0.5, 0.82, 1.0, 0.45, D, M);
      A(yb, BOX, 0.22, 0.16, 0.3, -0.72, 1.55, 0.25, 0x4a4d4f, M);
      pitchG.position.y = 1.9;
      A(pb, BOXC, 0.62, 0.55, 2.3, 0, 0, -0.2, D, M);
      barrel(pb, 2.5, 0.09, 0, 0.42, -0.5, P);
      barrel(pb, 2.2, 0.085, 0, -0.38, -0.3, D);
      for (const s of [-1, 1]) barrel(pb, 1.45, 0.13, s * 0.5, -0.12, 0.05, P);
      A(pb, BOXC, 0.34, 0.1, 0.7, 0, -0.08, -1.85, P, M);
      A(rb, BOXC, 0.5, 0.5, 0.6, 0, 0.03, -1.5, D, M);
      taper(rb, 0.17, 0.15, 2.3, 0, 0.03, -1.2, P);
      taper(rb, 0.115, 0.085, 3.7, 0, 0.03, 1.1);
      barrel(rb, 0.15, 0.1, 0, 0.03, 4.8);
      for (const sx of [-1, 1]) {
        A(yb, BOX, 0.95, 1.45, 0.06, sx * 0.72, 0.62, 1.05, P, M);
        A(yb, BOX, 0.06, 1.45, 0.6, sx * 1.18, 0.62, 0.78, P, M, sx * -0.35);
        dials(yb, sx * 0.53, 1.62, -0.2, sx);
      }
      A(yb, BOX, 0.5, 0.5, 0.06, 0, 0.62, 1.05, P, M);
      shellRack(base, 1.9, 0.0, -1.6, -0.8, 5, 0.055, 0.95);
      tip.set(0, 0.03, 5.0);
      recoilLen = 0.9;
      recoilBack = 0.6;
      break;
    }
  }
  // Blender dokulu parçalar (yüklüyse ve isteniyorsa) kodla kurulanların yerine: aynı geometri, aynı grup ekseni
  const sk = baked ? bakedGun(w, mat) : null;
  for (const [bt, grp, key] of [[base, g, 'base'], [yb, yawG, 'yaw'], [pb, pitchG, 'pitch'], [rb, recoilG, 'recoil']] as const) {
    const geo = sk?.geos.get(key);
    if (geo) grp.add(new THREE.Mesh(geo, sk!.mat));
    else bt.build(grp, mat);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(tip);
  recoilG.add(muzzle);
  pitchG.add(recoilG);
  yawG.add(pitchG);
  Object.assign(g.userData, { yaw: yawG, pitch: pitchG, recoil: recoilG, muzzle, recoilLen, recoilBack, fired: -1, recoilT: 1e9, baked: !!sk });
  return g;
}

/**
 * Geri tepme: atışta namlu kümesi beşik içinde hızla (0,05 sn) geri kayar, geri getirici yayla yavaşça (back sn)
 * yerine döner (son kısmı yumuşak). t: atıştan beri geçen süre.
 */
export function recoilAt(t: number, len: number, back: number): number {
  if (len <= 0 || t >= back + 0.05) return 0;
  if (t < 0.05) return len * (t / 0.05);
  const u = (t - 0.05) / back;
  return len * (1 - u) * (1 - u);
}

let showcaseMat: THREE.Material | null = null;

/** Hangar ve görseller için tek top (oyundaki modelin aynısı; Blender dokusu yüklüyse o, code: hep kodla kurulan). */
export function buildAAGun(w: AAWeaponId, code = false): THREE.Group {
  showcaseMat ??= archMaterial();
  return aaGun(w, showcaseMat, !code);
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
 * h yükseklik). Ön duvarda 36 m'lik kapı açıklığı; sürgülü kapı panoları iki yana toplanmış (ortada 24 m açık), üstte
 * kapı kirişi, yerde ray. İçi görünür: koyu iç sac, kemer kirişleri, beton döşeme; gece tavan lambaları ve kapı
 * projektörü yanar. Arka uçta personel kapısı. Dönüş: kapı ağzındaki park yeri.
 */
function hangar(b: B, cx: number, cz: number, h: number, lamps: LampSet, len = 60): Bay {
  const HW = 26;
  const OPEN = 18;
  const doorH = 0.92 * h * Math.sqrt(1 - (OPEN / HW) ** 2);
  const ex = cx + len / 2;
  const R = Math.PI / 2;
  A(b, ARCH_OPEN, HW, h, len, cx, 0, cz, COL.corrugated, SURF.corrugated, R);
  A(b, ARCH_IN, HW - 0.3, h - 0.3, len - 0.4, cx, 0, cz, 0x50544c, SURF.corrugated, R);
  b.push(archWall(HW, h, 0.3).rotateY(R).translate(cx - len / 2 + 0.15, 0, cz), COL.corrugated, SURF.corrugated);
  b.push(notchedWall(HW, h, OPEN, doorH, 0.3).rotateY(R).translate(ex - 0.15, 0, cz), COL.corrugated, SURF.corrugated);
  // Kemer kirişleri (içeriden görünen çelik bantlar) ve döşeme
  for (let x = cx - len / 2 + 6; x < ex - 3; x += 8) A(b, ARCH_IN, HW - 0.7, h - 0.7, 0.4, x, 0, cz, COL.steel, SURF.metal, R);
  A(b, BOX, len - 0.4, 0.9, HW * 2 - 1, cx, 0, cz, COL.concrete, SURF.concrete);
  // Kapı panoları iki yanda üçer üçer toplanmış (teleskop kapı)
  const pw = 6;
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) A(b, BOX, 0.3, doorH, pw - 0.1, ex + 0.25 + k * 0.4, 0, cz + s * (OPEN - pw / 2), 0x6a7064, SURF.hangarDoor);
  A(b, BOX, 0.6, 0.7, OPEN * 2 + 1, ex + 0.35, doorH, cz, COL.steel, SURF.metal);
  A(b, BOX, 1.8, 0.12, OPEN * 2 + 4, ex + 0.7, 0.9, cz, COL.steel, SURF.metal);
  A(b, BOX, 0.3, 2.4, 1.4, cx - len / 2 - 0.15, 0, cz, 0x4e5248, SURF.metal);
  // Işıklar: tavanda üç lamba ve döşemede ışık, kapının üstünde projektör ve önünde ışık havuzu, tepede engel ışığı
  for (const o of [-9, 0, 9]) lamps.lamp(ex - 8, h * 0.72, cz + o, LAMP.warm, 0.35, 1.0);
  lamps.pool(ex - 12, 0.9, cz, 17, LAMP.warm, 0.3);
  lamps.lamp(ex + 0.9, doorH + 1.1, cz, LAMP.flood, 0.4, 1.3);
  lamps.pool(ex + 16, 0.9, cz, 20, LAMP.flood, 0.2);
  lamps.lamp(cx, h + 0.4, cz, LAMP.red, 0.3, 1.1, 2.4, (cx * 7 + cz) % 1);
  return { x: ex, z: cz, yaw: R, width: (OPEN - pw) * 2 - 1.5, depth: len - 4, y: 0.9, out: 1.2 };
}

/**
 * T2 tipi çelik hangar (yerel çerçevede, kapısı +X): 46 × 34 m, oluklu sac kaplama, dışta çelik dikmeler, alçak
 * beşik çatı (mahya boyuna), alnında kapı kirişi; sürgülü kapı kanatları iki yana toplanmış (ortada 22 m açık), yan
 * duvarda tuğla atölye eklentisi. İçi görünür (tavan, döşeme), gece ışıklı.
 */
function t2Hangar(f: Frame): Bay {
  const D = 46;
  const W = 34;
  const H = 8.6;
  const clad = 0x5b6257;
  f.A(BOX, D, 0.9, W, 0, 0, 0, COL.concrete, SURF.concrete);
  for (const s of [-1, 1]) {
    f.A(BOX, D, H, 0.3, 0, 0, s * (W / 2 - 0.15), clad, SURF.corrugated);
    for (let x = -D / 2 + 0.2; x <= D / 2; x += D / 10) f.A(BOX, 0.35, H + 0.2, 0.45, x, 0, s * (W / 2 + 0.2), COL.steel, SURF.metal);
  }
  f.A(BOX, 0.3, H, W, -D / 2 + 0.15, 0, 0, clad, SURF.corrugated);
  f.A(GABLE, W + 0.9, 3.6, D + 0.8, 0, H, 0, 0x4d524c, SURF.corrugated, Math.PI / 2);
  f.A(GABLE_IN, W - 0.4, 3.3, D - 0.4, 0, H, 0, 0x3f433f, SURF.corrugated, Math.PI / 2);
  // Kapı alnı: kapı kirişi ve üstü kaplama; kanatlar iki yanda ikişer (ray dışta)
  f.A(BOX, 0.5, 1.0, W, D / 2 - 0.25, H - 1.0, 0, COL.steel, SURF.metal);
  const lw = 3.3;
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) f.A(BOX, 0.3, H - 1.0, lw, D / 2 + 0.3 + k * 0.4, 0, s * (W / 2 - 0.4 - lw / 2 - k * 2.4), 0x5a6158, SURF.hangarDoor);
  f.A(BOX, 1.4, 0.12, W + 8, D / 2 + 0.6, 0.9, 0, COL.steel, SURF.metal);
  // Atölye eklentisi (tuğla, düz çatı) ve personel kapısı
  f.A(BOX, D * 0.55, 4.2, 6.5, -4, 0, W / 2 + 3.5, COL.brick, SURF.brickWin);
  f.A(BOX, 0.2, 2.3, 1.3, -D / 2 - 0.1, 0, 4, 0x3e4240, SURF.metal);
  for (const o of [-10, 0, 10]) f.lamp(D / 2 - 7, H + 1.4, o, LAMP.warm, 0.35, 1.0);
  f.pool(D / 2 - 11, 0.9, 0, 16, LAMP.warm, 0.3);
  f.lamp(D / 2 + 0.8, H + 0.3, 0, LAMP.flood, 0.4, 1.3);
  f.pool(D / 2 + 15, 0.9, 0, 19, LAMP.flood, 0.2);
  f.lamp(D / 2, H + 3.8, 0, LAMP.red, 0.3, 1.1, 2.4, 0.3);
  f.lamp(-D / 2, H + 3.8, 0, LAMP.red, 0.3, 1.1, 2.4, 0.8);
  return f.bay(D / 2, 0, W - 2 * (0.4 + lw + 2.4) - 1, D - 4, 0.9, 1.2);
}

/**
 * Kanvas çadır hangar (Bessonneau tipi; yerel çerçevede, ağzı +X): 30 × 24 m, ahşap dikmeler, kanvas yan duvarlar
 * ve beşik çatı, ön perde yukarı sarılmış, yanlarda bağlı kanatlar, gergi halatları. Tabanı delikli çelik plaka.
 */
function tentHangar(f: Frame): Bay {
  const D = 30;
  const W = 24;
  const E = 4.2;
  const canvas = 0xa29d7c;
  for (const s of [-1, 1]) {
    f.A(BOX, D, E, 0.12, 0, 0, s * W / 2, canvas, SURF.canvas);
    for (let x = -D / 2; x <= D / 2 + 0.01; x += D / 8) {
      f.A(BOX, 0.22, E + 0.1, 0.22, x, 0, s * (W / 2 + 0.12), COL.wood, SURF.wood);
      // Gergi halatı ve kazık
      if (Math.round((x + D / 2) / (D / 8)) % 2 === 0) f.beam(x, E, s * (W / 2 + 0.2), x, 0.15, s * (W / 2 + 3.6), 0.04, 0xc8bd9a);
    }
    // Yanlara bağlanmış ön kanatlar
    f.A(BOX, 2.4, E, 0.1, D / 2 + 1.0, 0, s * (W / 2 - 0.6), canvas, SURF.canvas, s * 0.55);
  }
  f.A(BOX, 0.12, E, W, -D / 2, 0, 0, canvas, SURF.canvas);
  f.A(GABLE, W + 0.7, 4.6, D + 0.5, 0, E, 0, canvas, SURF.canvas, Math.PI / 2);
  f.A(GABLE_IN, W - 0.2, 4.4, D, 0, E, 0, 0x6c6550, SURF.canvas, Math.PI / 2);
  // Ön perde: ağzın üstünde sarılı
  f.A(CYLZ, 0.32, 0.32, W, D / 2 + 0.1, E - 0.25, -W / 2, 0x7d7456, SURF.canvas);
  f.lamp(D / 2 - 8, E + 2.6, 0, LAMP.warm, 0.35, 1.0);
  f.pool(D / 2 - 10, 0.3, 0, 13, LAMP.warm, 0.28);
  return f.bay(D / 2, 0, W - 3, D - 2, 0.25, 1.5);
}

/** Kemer sığınak ("blister" hangar; yerel çerçevede, iki ucu açık, ekseni X): 21 m açıklık, 14 m boy. */
function blister(f: Frame, y: number): Bay {
  const L = 14;
  const R = Math.PI / 2;
  f.A(ARCH_OPEN, 10.5, 6.4, L, 0, 0, 0, 0x767b70, SURF.corrugated, R);
  f.A(ARCH_IN, 10.2, 6.1, L - 0.1, 0, 0, 0, 0x4e524a, SURF.corrugated, R);
  for (const x of [-L / 2 + 0.3, 0, L / 2 - 0.3]) f.A(ARCH_IN, 9.9, 5.8, 0.3, x, 0, 0, COL.steel, SURF.metal, R);
  for (const s of [-1, 1]) f.A(BOX, L + 0.6, 0.5, 0.6, 0, 0, s * 10.4, COL.wood, SURF.wood);
  f.lamp(0, 5.4, 0, LAMP.warm, 0.3, 1.0);
  return f.bay(L / 2, 0, 18.5, L + 8, y, 2.5);
}

/**
 * Dağıtma siperi (yerel çerçevede, ağzı +X): uçağı üç yandan saran çim örtülü toprak setler, iç yüzlerinde beton
 * istinat duvarı, arka köşede küçük sığınak.
 */
function pen(f: Frame, y: number): Bay {
  const W = 27;
  const D = 26;
  f.A(GABLE, 8, 3.6, W + 16, -D / 2 - 4, 0, 0, COL.turf, SURF.grass);
  for (const s of [-1, 1]) {
    f.A(GABLE, 8, 3.6, D + 4, -2, 0, s * (W / 2 + 4), COL.turf, SURF.grass, Math.PI / 2);
    f.A(BOX, D, 2.8, 0.5, -0.5, 0, s * (W / 2 + 0.25), COL.concrete, SURF.concrete);
  }
  f.A(BOX, 0.5, 2.8, W, -D / 2 - 0.25, 0, 0, COL.concrete, SURF.concrete);
  f.A(ARCH, 2.4, 2.2, 6, -D / 2 - 5, 0, W / 2 + 9, COL.turf, SURF.grass, Math.PI / 2);
  return f.bay(D / 2 - 1, 0, 24, D, y, 0);
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
    // Kemer biçimli beton ön duvar (kutu duvarın köşeleri toprak örtünün dışında havada kalıyordu), çelik kapı
    b.push(archWall(6.3, 4.25, 0.5), COL.concrete, SURF.concrete, 0, x, 0, z + 7.05);
    A(b, BOX, 3.2, 2.7, 0.1, x, 0, z + 7.33, 0x4a4e44, SURF.metal);
    // Önünde römorklarda bombalar
    bombTrolley(b, x + 2.5, z + 12, 0.15, x % 80 === 0 ? 3 : 2);
  }
  // Harekât binası (tuğla, düz keçe çatı) ve su kulesi
  A(b, BOX, 26, 4.5, 12, -405, 0, 728, COL.brick, SURF.brickWin);
  A(b, BOX, 26.6, 0.7, 12.6, -405, 4.5, 728, COL.concrete, SURF.concrete);
  A(b, BOX, 4, 3, 2.2, -405, 0, 735, COL.concrete, SURF.concrete);
  sandWall(b, 9, 1.4, -413, 735.5, 0);
  sandWall(b, 9, 1.4, -397, 735.5, 0);
  for (const dx of [-8, 8]) A(b, CYL, 0.05, 6, 0.05, -405 + dx, 5.2, 724, COL.steel, SURF.metal);
  waterTower(b, -580, 520, 16, 4.2);
  // İşaret alanı: siyah kare üstünde beyaz çarpı (iniş yönü işareti)
  A(b, BOX, 12, 0.25, 12, -250, 0, 690, 0x2a2b2d, SURF.plain);
  A(b, BOX, 9, 0.3, 1.2, -250, 0, 690, COL.white, SURF.plain);
  A(b, BOX, 1.2, 0.3, 9, -250, 0, 690, COL.white, SURF.plain);
}

/**
 * Üssün yaşam ve teknik bölgesi: hangar sırasının arkasındaki yol (x = −520) ile batı çiti (x = −680) arasındaki şerit.
 * Fabrika eskiden buraya taşıyordu (factoryPad pistten 700 m); 1.080 m'ye alınınca boş kaldı (2026-11-11). Kuzeyden güneye:
 * tuğla koğuşlar, yemekhane ve bayrak direkli içtima alanı; testere dişi çatılı tamir atölyesi ve araç sahası (kamyonlar,
 * tankerler); oluklu sac ambarlar ve spor sahası; bacalı kazan dairesi ve bahçeli subay evleri. Baştan sona iç yol, ana
 * yola bağlantılar, yol boyunca ağaçlar ve lambalar.
 */
function airfieldCamp(b: B, rng: () => number): void {
  const T = COL.asphalt;
  const X = -605;
  // İç yol ve bağlantıları
  A(b, BOX, 7, 0.3, 1700, X, 0, -205, T, SURF.asphalt);
  for (const z of [220, -330, -700]) A(b, BOX, 85, 0.3, 6, (X - 520) / 2, 0, z, T, SURF.asphalt);
  // Koğuşlar: iki katlı tuğla, kırma kiremit çatı, bacalar
  for (const z of [330, 405, 480]) {
    A(b, BOX, 13, 7, 46, -648, 0, z, COL.brick, SURF.brickHouse);
    P.hipRoof(b, 13, 46, 3.6, -648, 7, z, COL.tile);
    for (const dz of [-14, 0, 14]) P.chimney(b, -648, 7, z + dz, 4.4, COL.brickDark);
  }
  // Yemekhane ve içtima alanı (bayrak direği)
  A(b, BOX, 16, 6, 38, -565, 0, 430, COL.plasterCream, SURF.house);
  P.gableRoof(b, 16, 38, 5, -565, 6, 430, 0, COL.plasterCream, SURF.plaster, COL.tile);
  A(b, BOX, 46, 0.25, 56, -565, 0, 330, 0x6b6c6a, SURF.asphalt);
  A(b, CYL, 0.12, 14, 0.12, -565, 0, 300, COL.white, SURF.metal);
  // Tamir atölyesi ve araç sahası
  A(b, BOX, 34, 9, 64, -645, 0, 110, COL.brickDark, SURF.brickWin);
  sawtoothRoof(b, 34, 64, -645, 9, 110);
  for (const dz of [-16, 16]) A(b, BOX, 0.4, 6, 12, -627.6, 0, 110 + dz, 0x5e6058, SURF.hangarDoor);
  A(b, BOX, 50, 0.3, 120, -566, 0, 100, COL.concrete, SURF.concrete);
  for (let i = 0; i < 6; i++) P.truck(b, rng, -580 + (i % 2) * 22, 60 + Math.floor(i / 2) * 32, Math.PI / 2);
  for (let i = 0; i < 2; i++) {
    A(b, BOX, 2.4, 1.2, 7, -548, 0.4, 150 + i * 14, 0x4f5638, SURF.metal);
    A(b, CYLZ, 1.15, 1.15, 5.2, -548, 1.9, 148.5 + i * 14, 0x5a6140, SURF.metal);
  }
  // Ambarlar ve spor sahası
  for (const z of [-140, -215, -290]) {
    A(b, BOX, 22, 2, 46, -646, 0, z, COL.brick, SURF.brick);
    A(b, ARCH, 11, 6, 46, -646, 2, z, COL.galvanized, SURF.corrugated);
    // Kemerin uçları kemer biçimli tuğla duvar (kutu duvar kemerin dışına taşıyordu); kapı duvar yüzünde
    for (const e of [-1, 1]) b.push(archWall(10.95, 5.95, 0.3), COL.brick, SURF.brick, 0, -646, 2, z + e * 22.95);
    A(b, BOX, 7, 4, 0.14, -646, 0, z + 23.11, 0x5e6058, SURF.hangarDoor);
    A(b, BOX, 7.8, 0.35, 0.2, -646, 4.0, z + 23.12, COL.concrete, SURF.concrete);
  }
  A(b, BOX, 56, 0.2, 96, -566, 0, -215, COL.turf, SURF.grass);
  for (const z of [-262, -168]) A(b, BOX, 56, 0.25, 0.5, -566, 0, z, COL.white, SURF.plain);
  for (const x of [-593.5, -538.5]) A(b, BOX, 0.5, 0.25, 94, x, 0, -215, COL.white, SURF.plain);
  A(b, BOX, 56, 0.25, 0.5, -566, 0, -215, COL.white, SURF.plain);
  for (const z of [-263, -167]) A(b, BOX, 7.3, 2.4, 0.15, -566, 0, z, COL.white, SURF.metal);
  // Kazan dairesi ve bacası
  A(b, BOX, 22, 8, 16, -645, 0, -430, COL.brick, SURF.brickWin);
  P.gableRoof(b, 16, 22, 4, -645, 8, -430, Math.PI / 2, COL.brick, SURF.brick, COL.felt, SURF.tile, 0.4);
  A(b, CYL, 1.6, 28, 1.6, -630, 0, -440, COL.brickDark, SURF.brick);
  A(b, CYL, 1.8, 1.2, 1.8, -630, 28, -440, 0x2c2826, SURF.metal);
  // Subay evleri: sıvalı, beşik çatılı, çalı çitli bahçe
  for (let i = 0; i < 4; i++) {
    const z = -500 - i * 42;
    for (const x of [-648, -568]) {
      A(b, BOX, 28, 0.2, 34, x, 0, z, 0x6e8a48, SURF.grass);
      A(b, BOX, 10, 5.6, 9, x, 0, z, [0xe8e2d4, 0xdccfb2, 0xd6c3b0][(i + (x > -600 ? 1 : 0)) % 3], SURF.house);
      P.gableRoof(b, 9, 10, 4.2, x, 5.6, z, Math.PI / 2, 0xe8e2d4, SURF.plaster, COL.tile);
      P.chimney(b, x + 2.5, 5.6, z - 1.5, 4.8, COL.brickDark);
      A(b, BOX, 28, 0.8, 0.5, x, 0, z + 16.8, 0x58773d, SURF.grass);
      P.tree(b, rng, x + 9, z - 10, 6 + rng() * 3, false);
    }
  }
  // Yol boyunca ağaçlar ve lambalar
  for (let z = -1020; z <= 620; z += 46) {
    if (Math.abs(z - 220) < 20 || Math.abs(z + 330) < 20 || Math.abs(z + 700) < 20) continue;
    P.tree(b, rng, X - 9, z, 8 + rng() * 4, false);
  }
  for (let z = -1000; z <= 600; z += 160) P.lamp(b, X + 5, z);
}

/** Apron park sıraları: iki sıra × 8, burun taksi yoluna (+X); x burun çizgisi. */
const APRON_BAYS: Bay[] = [0, 1].flatMap((r) => Array.from({ length: 8 }, (_, i) => (
  { x: -204 - r * 62, z: -280 + i * 80, yaw: Math.PI / 2, width: 60, depth: 48, y: 0.9, out: 0 })));

/** Projektör direği (x, z) ve ışığının yerde düştüğü yer (px, pz, yarıçap r, zemin kotu y). */
function floodPole(b: B, l: LampSet, x: number, z: number, px: number, pz: number, r: number, y: number): void {
  A(b, CYL, 0.18, 15, 0.18, x, 0, z, COL.steelLight, SURF.metal);
  A(b, BOX, 1.4, 0.7, 0.9, x, 15, z, 0x3a3d3a, SURF.metal);
  A(b, BOX, 0.8, 0.12, 0.8, x, 7.5, z, COL.steel, SURF.metal);
  l.lamp(x, 15.1, z, LAMP.flood, 0.55, 1.7);
  l.pool(px, y, pz, r, LAMP.flood, 0.2);
}

/**
 * Hava üssünün ek yapıları ve park yerleri: kuzey ucunda iki T2 hangar ve önlerinde apron; doğuda delikli çelik plaka
 * üstünde üç kanvas çadır hangar; doğu dağıtma platformlarında kemer sığınaklar ve toprak siperler, batıdakilerde
 * siperler; teknik bölgede karargâh (H planlı), Nissen yatakhaneleri, kantin, paraşüt deposu, araç hangarı ve
 * kamyonlar, pusula ayar pisti, çevrede altıgen beton mevziler, apron projektörleri. Dönüş: park yerleri (öncelik
 * sırasıyla).
 */
function airfieldExtras(b: B, l: LampSet): Bay[] {
  const bays: Bay[] = [];
  // T2 hangarlar (kapıları güneye, apron ve taksi yoluna bağlantı)
  A(b, BOX, 233, 0.9, 69, -255.5, 0, 1210.5, COL.concreteDark, SURF.runway);
  for (const x of [-345, -280]) bays.push(t2Hangar(new Frame(b, x, 1268, Math.PI / 2, l)));
  floodPole(b, l, -150, 1240, -200, 1205, 40, 0.9);
  floodPole(b, l, -372, 1185, -312, 1208, 40, 0.9);
  // Çadır hangarlar: ağızları batıya (taksi yoluna), önleri ve tabanları delikli çelik plaka
  A(b, BOX, 112, 0.25, 116, 156, 0, 0, 0x6d7169, SURF.psp);
  for (const z of [-40, 0, 40]) bays.push(tentHangar(new Frame(b, 195, z, Math.PI, l)));
  floodPole(b, l, 112, 62, 140, 0, 46, 0.25);
  // Doğu platformlarında kemer sığınaklar ve siperler, batıdakilerde siperler (ağızları taksi yoluna)
  for (const z of [-900, -600, 600, 900]) bays.push(blister(new Frame(b, 142, z, Math.PI, l), 0.8));
  for (const z of [-300, 300]) bays.push(pen(new Frame(b, 142, z, Math.PI, l), 0.8));
  for (const z of [-560, -700, 980, 1110]) bays.push(pen(new Frame(b, -202, z, 0, l), 0.8));
  // Apron projektörleri
  for (const z of [-300, -150, 0, 150, 300]) floodPole(b, l, -180, z, -240, z, 44, 0.9);
  // Yeni binalar üssün kendi alanında (|x| ≤ 400; ötesine başka yapılar kurulabilir): karargâh (H planlı tuğla),
  // Nissen yatakhaneleri (tuğla bacalı), kantin, paraşüt deposu
  for (const z of [452, 488]) A(b, BOX, 36, 6.5, 10, -275, 0, z, COL.brick, SURF.brickWin);
  A(b, BOX, 10, 6.5, 26, -275, 0, 470, COL.brickDark, SURF.brickWin);
  l.lamp(-256.8, 3.2, 470, LAMP.warm, 0.25, 1.0);
  for (const z of [-400, -430, -460, -490]) {
    A(b, ARCH, 5, 3.4, 16, -330, 0, z, 0x6f746a, SURF.corrugated, Math.PI / 2);
    // Tuğla alın duvarları (bacalı uçta baca duvara gömülü), doğu ucunda kapı
    for (const e of [-1, 1]) b.push(archWall(4.95, 3.35, 0.3), COL.brick, SURF.brick, Math.PI / 2, -330 + e * 7.95, 0, z);
    A(b, BOX, 1.1, 2.0, 0.1, -321.85, 0, z, 0x3a3428, SURF.wood, Math.PI / 2);
    A(b, BOX, 0.7, 4.6, 0.7, -337.5, 0, z, COL.brickDark, SURF.brick);
  }
  A(b, BOX, 30, 4, 10, -265, 0, -420, COL.wood, SURF.wood);
  A(b, GABLE, 10.8, 2.4, 30.8, -265, 4, -420, COL.felt, SURF.felt, Math.PI / 2);
  A(b, BOX, 14, 5, 12, -290, 0, -560, COL.brick, SURF.brickWin);
  A(b, BOX, 6, 10.5, 6, -290, 0, -560, COL.brickDark, SURF.brick);
  // Araç hangarı: önü açık uzun sundurma, içinde kamyonlar, önünde beton saha
  A(b, BOX, 124, 0.3, 40, -330, 0, -1246, COL.concrete, SURF.concrete);
  A(b, BOX, 120, 5.2, 0.3, -330, 0, -1265, COL.wood, SURF.wood);
  for (const x of [-390, -270]) A(b, BOX, 0.3, 5.2, 20, x, 0, -1255, COL.wood, SURF.wood);
  for (let x = -390; x <= -270; x += 12) A(b, BOX, 0.3, 5.2, 0.3, x, 0, -1245.2, COL.wood, SURF.wood);
  A(b, GABLE, 21, 1.6, 121, -330, 5.2, -1255, COL.felt, SURF.felt, Math.PI / 2);
  let vs = 7;
  const vr = (): number => ((vs = (vs * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 8; i++) {
    // Araç hangarının betonu 0,3 m: araçlar onun üstünde
    if (i % 4 === 3) refueller(b, -382 + i * 15, -1254, 0, 0.3);
    else P.truck(b, vr, -382 + i * 15, -1254, 0, 0.3);
  }
  // Pusula ayar pisti: beton daire, beyaz derece çemberi ve yön çizgileri
  b.push(new THREE.CylinderGeometry(18, 18, 0.5, 40).translate(-265, 0.25, -1000), COL.concrete, SURF.concrete);
  A(b, RING, 15, 1, 15, -265, 0.53, -1000, COL.white, SURF.plain);
  for (let k = 0; k < 4; k++) A(b, BOX, 0.45, 0.05, 30, -265, 0.5, -1000, COL.white, SURF.plain, (k * Math.PI) / 4);
  // Altıgen beton mevziler (mazgallı)
  for (const [x, z] of [[-385, 1330], [120, 1330], [-385, -1330], [120, -1330], [205, 760], [205, -760]]) {
    A(b, HEX, 2.4, 2.1, 2.4, x, 0, z, COL.concrete, SURF.concrete);
    A(b, HEX, 2.65, 0.32, 2.65, x, 2.1, z, COL.concreteDark, SURF.concrete);
    for (let k = 0; k < 6; k++) {
      const a = ((k + 0.5) * Math.PI) / 3;
      A(b, BOX, 0.6, 0.22, 0.08, x + Math.sin(a) * 2.1, 1.25, z + Math.cos(a) * 2.1, 0x1c1d1f, SURF.plain, a);
    }
  }
  // Apron sıralarının yanında çalıştırma arabaları
  for (const p of APRON_BAYS) starterTrolley(b, p.x - 6, p.z + 9, 0.3, p.y);
  return bays;
}

/**
 * Hava üssünün ışıkları: pist kenarı (60 m'de bir), eşikte yeşil ve pist sonunda kırmızı sıra, yaklaşma orta hattı ve
 * çapraz barı, taksi yollarında mavi kenar lambaları, kule tepesinde yanıp sönen yeşil işaret, telsiz direği ve su
 * kulesinde kırmızı engel ışıkları, kapılarda ve rüzgâr tulumlarında küçük lambalar.
 */
function airfieldLights(l: LampSet): void {
  const Y = 1.5;
  for (const s of [-1, 1]) l.row(s * 33.5, -RUNWAY_HALF + 5, s * 33.5, RUNWAY_HALF - 5, 60, Y, LAMP.edge, 0.22, 1.3);
  for (const e of [-1, 1]) {
    l.row(-31, e * (RUNWAY_HALF + 1), 31, e * (RUNWAY_HALF + 1), 8, Y, LAMP.green, 0.24, 1.3);
    l.row(-27, e * (RUNWAY_HALF + 9), 27, e * (RUNWAY_HALF + 9), 9, Y, LAMP.red, 0.24, 1.3);
    l.row(0, e * 1195, 0, e * 1340, 48, 1.4, LAMP.edge, 0.3, 1.4);
    l.row(-21, e * 1290, 21, e * 1290, 10.5, 1.4, LAMP.edge, 0.3, 1.4);
  }
  for (const s of [-1, 1]) {
    l.row(-150 + s * 12, -1165, -150 + s * 12, 1165, 80, 1.2, LAMP.blue, 0.16, 1.1);
    l.row(92 + s * 9, -1165, 92 + s * 9, 1165, 90, 1.2, LAMP.blue, 0.16, 1.1);
    for (const z of [-800, 0, 800]) l.row(-136, z + s * 12, -38, z + s * 12, 33, 1.2, LAMP.blue, 0.16, 1.1);
    for (const e of [-1, 1]) l.row(-136, e * 1170 + s * 10, 80, e * 1170 + s * 10, 54, 1.2, LAMP.blue, 0.16, 1.1);
  }
  l.lamp(-330, 11.7, 699.5, LAMP.green, 0.45, 1.7, 1.6, 0);
  l.lamp(-360, 32.4, 720, LAMP.red, 0.35, 1.4, 2.0, 0.1);
  l.lamp(-580, 21.6, 520, LAMP.red, 0.35, 1.3, 2.6, 0.5);
  for (const z of [900, -900]) l.lamp(70, 7.7, z, LAMP.warm, 0.25, 1.0);
  for (const [x, y, z] of [[-330, 3.2, 706.5], [-405, 3.4, 734.4], [-300, 5.2, 752.6], [-671, 3.4, 662]]) l.lamp(x, y, z, LAMP.warm, 0.25, 1.0);
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

// ------------------------------------------------------------------ uçaksavar bataryası ve radar mevzisi (2026-11-13)
// Gerçekçi renkler (pastel değil): feldgrau ve zeytin boyalı çelik, ham beton, eskimiş ahşap, kum torbası, ezilmiş çim ve
// toprak. Yalnız bu iki yapının parçaları; hava üssü ve fabrika COL'u kullanmaya devam eder.
// ------------------------------------------------------------------ üs ve fabrika ayrıntıları (2026-11-17)
// Eskiden kutu olan araçlar, kule, itfaiye, yakıt tankları, rüzgâr tulumları ve telsiz direği gerçek örneklerine
// yakın biçimlerde: 1940'lar yakıt tankeri (Bedford/Albion), uçak çekicisi (David Brown), çalıştırma arabası, RAF tipi
// harekât kulesi (watch office), kafes telsiz direği, bantlı rüzgâr tulumu.

/** Yerel (lx, lz) → ry dönmüş, (x, z)'ye kaymış (three.js rotateY ile aynı). */
function loc(x: number, z: number, ry: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

/** Teker: ekseni x boyunca (ölçek: genişlik, yarıçap, yarıçap), merkezde. */
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2);

/** Araç tekerleri: (lx, lz) yerel noktalarında, yarıçap r. */
function wheels(b: B, x: number, z: number, ry: number, pts: [number, number][], r: number, w = 0.3): void {
  for (const [lx, lz] of pts) {
    const [px, pz] = loc(x, z, ry, lx, lz);
    A(b, WHEEL, w, r, r, px, r, pz, 0x1b1c1e, SURF.plain, ry);
    // Göbek yalnız büyük tekerde (küçük tekerde görünmez, üçgen boşa gider)
    if (r >= 0.3) A(b, WHEEL, w + 0.02, r * 0.5, r * 0.5, px, r, pz, 0x4a4e44, SURF.metal, ry);
  }
}

/** Rüzgâr tulumu: direk, döner çember, rüzgâra doğru hafif sarkan, beş bantlı (turuncu ve beyaz) daralan kumaş. */
function windsock(b: B, x: number, z: number, aim: number): void {
  A(b, CYL, 0.12, 7.2, 0.12, x, 0, z, COL.steelLight, SURF.metal);
  A(b, CYL, 0.5, 0.3, 0.5, x, 0, z, COL.concrete, SURF.concrete);
  const c = Math.sin(aim);
  const s = Math.cos(aim);
  // Kumaş: rüzgâr yönüne (aim) uzanır, uca doğru daralır ve biraz sarkar; dilimler kendi ekseninde döndürülür
  let r = 0.45;
  for (let k = 0; k < 5; k++) {
    const r2 = r * 0.88;
    const g = new THREE.CylinderGeometry(r, r2, 0.74, 12, 1, true).rotateX(Math.PI / 2 + 0.06 + k * 0.03);
    b.push(g, k % 2 ? COL.white : 0xe2702c, SURF.canvas, aim, x + c * (0.42 + k * 0.72), 6.95 - k * 0.07, z + s * (0.42 + k * 0.72));
    r = r2;
  }
  A(b, CYL, 0.47, 0.06, 0.47, x, 6.95, z, COL.steel, SURF.metal);
  A(b, BOX, 0.05, 0.05, 0.9, x + c * 0.3, 6.95, z + s * 0.3, COL.steel, SURF.metal, aim);
}

/** Kafes telsiz direği: üçgen kesitli, kat kirişleri ve çaprazlar, gergi telleri ve beton kazıklar, tepede anten çubuğu. */
function latticeMast(b: B, x: number, z: number, h: number): void {
  const r = 0.9;
  const legs = [0, 1, 2].map((k) => [x + Math.cos((k * 2 * Math.PI) / 3) * r, z + Math.sin((k * 2 * Math.PI) / 3) * r]);
  for (const [lx, lz] of legs) A(b, BOX, 0.14, h, 0.14, lx, 0, lz, COL.steelLight, SURF.metal);
  for (let y = 0; y < h; y += 3) {
    for (let k = 0; k < 3; k++) {
      const [ax, az] = legs[k];
      const [bx, bz] = legs[(k + 1) % 3];
      beam(b, ax, y, az, bx, y, bz, 0.06);
      beam(b, ax, y, az, bx, Math.min(h, y + 3), bz, 0.05);
    }
  }
  A(b, CYL, 0.05, 4, 0.05, x, h, z, COL.steelLight, SURF.metal);
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3 + 0.5;
    const gx = x + Math.cos(a) * h * 0.55;
    const gz = z + Math.sin(a) * h * 0.55;
    A(b, BOX, 1.0, 0.4, 1.0, gx, 0, gz, COL.concrete, SURF.concrete);
    for (const f of [0.55, 0.95]) beam(b, x, h * f, z, gx, 0.4, gz, 0.025, 0x3a3a3a);
  }
}

/**
 * Harekât kulesi (RAF watch office benzeri): iki katlı sıvalı bina, ön cephede geniş pencereler, birinci kat çatısında
 * korkuluklu çevre balkonu, üstte köşe dikmeli cam kontrol odası ve saçaklı çatı, yanda dış merdiven ve sahanlık,
 * tepede anemometre ve sinyal direği (seren ve işaret topları), önde meteoroloji kafesi.
 */
function watchOffice(b: B, x: number, z: number): void {
  const W = 16;
  const D = 11;
  A(b, BOX, W + 0.6, 0.5, D + 0.6, x, 0, z, COL.concrete, SURF.concrete);
  A(b, BOX, W, 7.0, D, x, 0.5, z, COL.plaster, SURF.plasterWin);
  A(b, BOX, W + 0.2, 0.35, D + 0.2, x, 3.8, z, 0xd2ccbe, SURF.concrete);
  A(b, BOX, W + 1.6, 0.3, D + 1.6, x, 7.5, z, COL.concrete, SURF.concrete);
  // Balkon korkuluğu: dikmeler ve iki kuşak
  for (const [dx, dz, lx, lz] of [[0, D / 2 + 0.75, W + 1.6, 0.06], [0, -D / 2 - 0.75, W + 1.6, 0.06], [W / 2 + 0.75, 0, 0.06, D + 1.6], [-W / 2 - 0.75, 0, 0.06, D + 1.6]]) {
    for (const y of [8.25, 8.75]) A(b, BOX, lx, 0.06, lz, x + dx, y, z + dz, COL.white, SURF.metal);
    const n = Math.round(Math.max(lx, lz) / 1.6);
    for (let i = 0; i <= n; i++) {
      const t = -0.5 + i / n;
      A(b, BOX, 0.06, 1.0, 0.06, x + dx + (lx > 1 ? t * lx : 0), 7.8, z + dz + (lz > 1 ? t * lz : 0), COL.white, SURF.metal);
    }
  }
  // Kontrol odası: cam, köşe dikmeleri, saçaklı düz çatı
  A(b, BOX, 9, 3.2, 7, x, 7.8, z - 0.5, COL.glass, SURF.curtain);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) A(b, BOX, 0.25, 3.2, 0.25, x + sx * 4.5, 7.8, z - 0.5 + sz * 3.5, COL.white, SURF.metal);
  A(b, BOX, 9.2, 0.6, 7.2, x, 7.8, z - 0.5, COL.plaster, SURF.plaster);
  A(b, BOX, 10.4, 0.35, 8.4, x, 11.0, z - 0.5, COL.felt, SURF.felt);
  // Dış merdiven (doğu yanında, sahanlıkla balkona)
  for (let i = 0; i < 14; i++) A(b, BOX, 1.2, 0.18, 0.3, x + W / 2 + 1.4, 0.5 + i * 0.52, z + D / 2 - 0.6 - i * 0.55, COL.concrete, SURF.concrete);
  beam(b, x + W / 2 + 2.0, 1.0, z + D / 2 - 0.4, x + W / 2 + 2.0, 8.6, z + D / 2 - 8.0, 0.06, COL.white);
  // Anemometre ve sinyal direği (seren, işaret topları)
  A(b, CYL, 0.05, 2.4, 0.05, x - 3.5, 11.35, z - 2.5, COL.steel, SURF.metal);
  for (let k = 0; k < 3; k++) A(b, BOX, 0.5, 0.04, 0.04, x - 3.5, 13.7, z - 2.5, COL.steel, SURF.metal, (k * Math.PI) / 3);
  const mx = x + W / 2 + 7;
  const mz = z - D / 2 - 3;
  A(b, CYL, 0.14, 15, 0.14, mx, 0, mz, COL.white, SURF.metal);
  A(b, BOX, 6.0, 0.14, 0.14, mx, 11.5, mz, COL.white, SURF.metal);
  for (const s of [-1, 1]) {
    beam(b, mx, 15, mz, mx + s * 3, 11.5, mz, 0.02, 0x3a3a3a);
    b.push(new THREE.SphereGeometry(0.4, 8, 6), 0x1c1d1f, SURF.plain, 0, mx + s * 2.5, 10.6, mz);
  }
  // Meteoroloji kafesi (Stevenson): ayaklar üstünde panjurlu beyaz kutu, yanında yağmur ölçer
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) A(b, BOX, 0.08, 1.1, 0.08, x - W / 2 - 4 + sx * 0.4, 0, z + D / 2 + 4 + sz * 0.3, COL.white, SURF.wood);
  A(b, BOX, 1.0, 0.7, 0.8, x - W / 2 - 4, 1.1, z + D / 2 + 4, COL.white, SURF.wood);
  A(b, CYL, 0.15, 0.4, 0.15, x - W / 2 - 2.5, 0, z + D / 2 + 4, 0x7a7e82, SURF.metal);
}

/**
 * Üssün itfaiyesi: tuğla bina, üç sürgülü kapı (önde rampa), kapıların üstünde saçak, yanda hortum kurutma kulesi;
 * önünde araçlar (fireVehicle ile ayrı eklenir).
 */
function airfieldFire(b: B, x: number, z: number): void {
  A(b, BOX, 26, 0.4, 16, x, 0, z, COL.concrete, SURF.concrete);
  A(b, BOX, 24, 6.5, 14, x, 0.4, z, COL.brick, SURF.brickWin);
  P.gableRoof(b, 14, 24, 3.2, x, 6.9, z, Math.PI / 2, COL.brick, SURF.brick, COL.tile, SURF.tile, 0.5);
  for (let i = -1; i <= 1; i++) {
    A(b, BOX, 6, 4.6, 0.3, x + i * 7.6, 0.4, z - 7.05, 0x8e2a22, SURF.hangarDoor);
    A(b, BOX, 7, 0.4, 0.4, x + i * 7.6, 5.0, z - 7.2, COL.concrete, SURF.concrete);
  }
  A(b, BOX, 26, 0.3, 10, x, 0, z - 12, COL.concrete, SURF.concrete);
  A(b, BOX, 4, 15, 4, x + 14, 0, z + 3, COL.brickDark, SURF.brickWin);
  A(b, BOX, 4.6, 0.4, 4.6, x + 14, 15, z + 3, COL.felt, SURF.felt);
  b.push(CONE.clone().scale(3.4, 1.8, 3.4), COL.tile, SURF.tile, Math.PI / 4, x + 14, 15.4, z + 3);
  A(b, CYL, 0.6, 2.2, 0.6, x - 12.5, 0, z - 10, 0x8e2a22, SURF.metal);
}

/**
 * Yakıt deposu: beton set içinde dikey tanklar (merdiven, tepede korkuluk, alt boru bağlantıları), toplama borusu ve
 * dolum kulübesi (pompa); setin önünde yakıt tankeri dolum yeri.
 */
function fuelFarm(b: B, x: number, z: number, n: number): void {
  const len = n * 16 + 6;
  for (const s of [-1, 1]) A(b, BOX, 0.5, 1.4, len, x + s * 9, 0, z + (n - 1) * 8, COL.concrete, SURF.concrete);
  for (const e of [-1, 1]) A(b, BOX, 18.5, 1.4, 0.5, x, 0, z + (n - 1) * 8 + e * (len / 2), COL.concrete, SURF.concrete);
  A(b, BOX, 18, 0.15, len, x, 0, z + (n - 1) * 8, 0x7a7466, SURF.earth);
  for (let i = 0; i < n; i++) {
    const tz = z + i * 16;
    A(b, CYL, 6.2, 0.4, 6.2, x, 0, tz, COL.concreteDark, SURF.concrete);
    A(b, CYL, 6, 7, 6, x, 0.4, tz, 0x7e8476, SURF.metal);
    b.push(CONE.clone().scale(6.2, 1.2, 6.2).translate(x, 7.4, tz), 0x737a6c, SURF.metal);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      A(b, BOX, 0.05, 0.9, 0.05, x + Math.cos(a) * 5.8, 7.6, tz + Math.sin(a) * 5.8, COL.white, SURF.metal);
    }
    for (let k = 0; k < 14; k++) A(b, BOX, 0.5, 0.05, 0.05, x - 6.25, 0.8 + k * 0.5, tz, COL.steel, SURF.metal, Math.PI / 2);
    for (const s of [-1, 1]) A(b, BOX, 0.05, 7.2, 0.05, x - 6.25, 0.4, tz + s * 0.25, COL.steel, SURF.metal);
    A(b, BOX, 3, 0.3, 0.3, x + 7, 0.8, tz, COL.steel, SURF.metal);
  }
  A(b, BOX, 0.35, 0.35, len, x + 8.5, 0.8, z + (n - 1) * 8, COL.steel, SURF.metal);
  A(b, BOX, 5, 3, 4, x + 13, 0, z + (n - 1) * 8, COL.brick, SURF.brickWin);
  A(b, BOX, 5.6, 0.3, 4.6, x + 13, 3, z + (n - 1) * 8, COL.felt, SURF.felt);
  A(b, BOX, 10, 0.25, 6, x + 21, 0, z + (n - 1) * 8, COL.concrete, SURF.concrete);
}

/** Bomba (yerde ya da römorkta): zeytin yeşili gövde, sarı bant, kanatçık kutusu; ekseni x boyunca. */
function groundBomb(b: B, x: number, y: number, z: number, ry: number, len: number): void {
  const r = len * 0.13;
  b.push(new THREE.CylinderGeometry(r, r, len * 0.62, 10).rotateZ(Math.PI / 2), 0x5e6448, SURF.metal, ry, x, y + r, z);
  const [nx, nz] = loc(x, z, ry, len * 0.38, 0);
  b.push(new THREE.ConeGeometry(r, len * 0.16, 10).rotateZ(-Math.PI / 2), 0x5e6448, SURF.metal, ry, nx, y + r, nz);
  const [tx, tz] = loc(x, z, ry, -len * 0.42, 0);
  b.push(new THREE.ConeGeometry(r, len * 0.2, 10).rotateZ(Math.PI / 2), 0x4a503a, SURF.metal, ry, tx, y + r, tz);
  const [fx, fz] = loc(x, z, ry, -len * 0.5, 0);
  A(b, BOX, len * 0.12, r * 2.4, r * 2.4, fx, y + r - r * 1.2, fz, 0x3e4232, SURF.metal, ry);
  const [bx, bz] = loc(x, z, ry, len * 0.12, 0);
  b.push(new THREE.CylinderGeometry(r * 1.02, r * 1.02, len * 0.04, 10).rotateZ(Math.PI / 2), 0xc9a43a, SURF.plain, ry, bx, y + r, bz);
}

/** Bomba römorku: alçak çelik şasi, dört teker, çeki demiri; üstünde iki-üç bomba. */
function bombTrolley(b: B, x: number, z: number, ry: number, n: number): void {
  let [px, pz] = loc(x, z, ry, 0, 0);
  A(b, BOX, 3.4, 0.12, 1.3, px, 0.45, pz, 0x3c4436, SURF.metal, ry);
  wheels(b, x, z, ry, [[-1.2, 0.6], [1.2, 0.6], [-1.2, -0.6], [1.2, -0.6]].map(([a, c]) => [c, a]) as [number, number][], 0.25, 0.15);
  [px, pz] = loc(x, z, ry, 2.2, 0);
  A(b, BOX, 1.4, 0.08, 0.08, px, 0.5, pz, 0x2a2a2a, SURF.metal, ry);
  for (let i = 0; i < n; i++) {
    const [qx, qz] = loc(x, z, ry, 0, (i - (n - 1) / 2) * 0.45);
    groundBomb(b, qx, 0.57, qz, ry, 2.2);
  }
}

/** Su kulesi: dört ayak, kat kirişleri ve çaprazlar, merdiven, depo ve konik çatı, tepede çevre iskelesi. */
function waterTower(b: B, x: number, z: number, h: number, r: number): void {
  const d = r * 0.7;
  const legs = [[-d, -d], [d, -d], [d, d], [-d, d]];
  for (const [dx, dz] of legs) A(b, BOX, 0.5, h, 0.5, x + dx, 0, z + dz, COL.steelLight, SURF.metal);
  for (let y = 0; y < h - 1; y += h / 4) {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = legs[k];
      const [bx, bz] = legs[(k + 1) % 4];
      beam(b, x + ax, y + h / 4, z + az, x + bx, y + h / 4, z + bz, 0.12);
      beam(b, x + ax, y, z + az, x + bx, y + h / 4, z + bz, 0.08);
    }
  }
  for (let k = 0; k < Math.floor(h / 0.5); k++) A(b, BOX, 0.5, 0.05, 0.05, x - d - 0.6, k * 0.5, z, COL.steel, SURF.metal, Math.PI / 2);
  A(b, CYL, r, r * 1.3, r, x, h, z, 0x7d8279, SURF.metal);
  A(b, CYL, r + 0.6, 0.12, r + 0.6, x, h, z, COL.steel, SURF.metal);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    A(b, BOX, 0.05, 1.0, 0.05, x + Math.cos(a) * (r + 0.55), h, z + Math.sin(a) * (r + 0.55), COL.steel, SURF.metal);
  }
  b.push(CONE.clone().scale(r * 1.05, r * 0.4, r * 1.05).translate(x, h + r * 1.3, z), 0x6d7268, SURF.metal);
}

const MIL = {
  earth: 0x4f4232,
  trodden: 0x5a4c3a,
  spoil: 0x6a5844,
  gravel: 0x8a8070,
  turf: 0x415428,
  sand: 0x6a5c44,
  sand2: 0x73644a,
  concrete: 0x928d84,
  concreteOld: 0x7f7a72,
  timber: 0x6a5440,
  timberDark: 0x4e3e30,
  plank: 0x7c6650,
  felt: 0x3e3f42,
  feldgrau: 0x5a5f55,
  olive: 0x4f5638,
  steel: 0x34373a,
  rust: 0x5c4434,
  net: 0x55593c,
  wire: 0x2e2e2c,
};

/** Ezilmiş toprak ya da çamur yaması: düzensiz kenarlı, yere serili (r ortalama yarıçap). */
function worn(b: B, x: number, z: number, r: number, seed: number, col: number = MIL.trodden): void {
  const n = 14;
  const pos: number[] = [];
  const rad = (i: number): number => r * (0.72 + 0.28 * Math.abs(Math.sin((i + seed) * 2.17) + Math.sin((i + seed) * 0.83)) * 0.6);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a1) * rad(i + 1), 0, Math.sin(a1) * rad(i + 1), Math.cos(a0) * rad(i), 0, Math.sin(a0) * rad(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Dış kenar: çimle toprak arası (sert kenar olmasın), içte asıl renk
  b.push(g.clone().scale(1.3, 1, 1.3), 0x5e5a38, SURF.earth, 0, x, 0.03, z);
  b.push(g, col, SURF.earth, 0, x, 0.04, z);
}

/** Siper: koyu kazı izi, kütük kenar ve yanında kazı toprağı seti (len boyunca, ry yönünde). */
function trench(b: B, len: number, x: number, z: number, ry: number): void {
  A(b, BOX, 1.4, 0.06, len, x, 0, z, 0x2c241c, SURF.earth, ry);
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  A(b, BOX, 0.1, 0.3, len, x + cs * 0.75, 0, z - sn * 0.75, MIL.timberDark, SURF.wood, ry);
  A(b, GABLE, 2.0, 0.75, len + 0.6, x - cs * 1.8, 0, z + sn * 1.8, MIL.spoil, SURF.earth, ry);
}

/** Kum torbası duvar parçası: len boyunca, h yüksekliğinde (torba sıraları yüzey dokusundan). */
function sandWall(b: B, len: number, h: number, x: number, z: number, ry: number): void {
  A(b, BOX, 1.1, h, len, x, 0, z, MIL.sand, SURF.sandbag, ry);
  A(b, BOX, 0.8, 0.22, len - 0.2, x, h, z, MIL.sand2, SURF.sandbag, ry);
}

/** Dikenli tel çit (çember, yarıçap r): ahşap kazıklar, dört sıra tel; gap: açık bırakılan açı aralığı (radyan). */
function wireRing(b: B, r: number, gap: [number, number] | null): void {
  const n = Math.max(24, Math.round((Math.PI * 2 * r) / 9));
  const inGap = (a: number): boolean => {
    if (!gap) return false;
    const d = Math.atan2(Math.sin(a - gap[0]), Math.cos(a - gap[0]));
    return Math.abs(d) < gap[1];
  };
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    if (inGap(a0) || inGap(a1)) continue;
    const x0 = Math.cos(a0) * r;
    const z0 = Math.sin(a0) * r;
    const x1 = Math.cos(a1) * r;
    const z1 = Math.sin(a1) * r;
    A(b, BOX, 0.16, 1.7, 0.16, x0, 0, z0, MIL.timberDark, SURF.wood);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    for (const y of [0.35, 0.75, 1.15, 1.55]) A(b, BOX, 0.025, 0.025, len, (x0 + x1) / 2, y, (z0 + z1) / 2, MIL.wire, SURF.metal, ry);
    // Çapraz tel (her ikinci aralıkta)
    if (i % 2 === 0) beam(b, x0, 0.3, z0, x1, 1.55, z1, 0.02, MIL.wire);
  }
}

/** Kamuflaj ağı: direkler üstünde sarkan, kenarları yere bağlı düzensiz ağ (w × d, tepesi h). */
function camoNet(b: B, w: number, d: number, h: number, x: number, z: number, ry: number, seed: number): void {
  const g = new THREE.PlaneGeometry(w, d, 6, 5).rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const pz = p.getZ(i);
    const ex = Math.abs(px) / (w / 2);
    const ez = Math.abs(pz) / (d / 2);
    const edge = Math.max(ex, ez);
    const sag = Math.sin((i + seed) * 2.3) * 0.25;
    p.setY(i, h * (1 - Math.pow(edge, 3)) * 0.92 + sag + 0.15);
  }
  g.computeVertexNormals();
  b.push(g, MIL.net, SURF.canvas, ry, x, 0, z);
  for (const [dx, dz] of [[-w * 0.2, 0], [w * 0.22, d * 0.1]]) {
    const cs = Math.cos(ry);
    const sn = Math.sin(ry);
    A(b, BOX, 0.12, h, 0.12, x + dx * cs + dz * sn, 0, z - dx * sn + dz * cs, MIL.timber, SURF.wood);
  }
}

/** Telefon direği: direk, travers, iki izolatör. */
function phonePole(b: B, x: number, z: number, h = 6.5): void {
  A(b, CYL, 0.11, h, 0.11, x, 0, z, MIL.timberDark, SURF.wood);
  A(b, BOX, 1.3, 0.1, 0.1, x, h - 0.5, z, MIL.timberDark, SURF.wood);
  for (const s of [-1, 1]) A(b, CYL, 0.05, 0.14, 0.05, x + s * 0.5, h - 0.4, z, 0xd8d0c0, SURF.plain);
}

/** Direkler arası hat (iki tel). */
function phoneLine(b: B, pts: [number, number][], h = 6.5): void {
  for (const [x, z] of pts) phonePole(b, x, z, h);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    for (const s of [-0.5, 0.5]) beam(b, ax + s, h - 0.3, az, bx + s, h - 0.45, bz, 0.025, MIL.wire);
  }
}

/** Baraka: ahşap kaplama, beton kaide, keçe beşik çatı, pencereler, kapı ve basamak, soba borusu. Uzun kenar yerel x. */
function barrack(b: B, x: number, z: number, len: number, wid: number, ry: number): void {
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  const box = (sx: number, sy: number, sz: number, lx: number, ly: number, lz: number, col: number, surf: Surf): void => {
    const [px, pz] = at(lx, lz);
    A(b, BOX, sx, sy, sz, px, ly, pz, col, surf, ry);
  };
  box(len + 0.4, 0.45, wid + 0.4, 0, 0, 0, MIL.concreteOld, SURF.concrete);
  box(len, 2.8, wid, 0, 0.45, 0, MIL.plank, SURF.wood);
  P.gableRoof(b, wid, len, 1.6, x, 3.25, z, ry + Math.PI / 2, MIL.plank, SURF.wood, MIL.felt, SURF.felt, 0.45);
  for (let i = 0; i < Math.floor(len / 3.2); i++) {
    const px = -len / 2 + 1.8 + i * 3.2;
    if (Math.abs(px) < 1.2) continue;
    for (const s of [-1, 1]) {
      box(1.0, 1.0, 0.08, px, 1.55, s * (wid / 2 + 0.02), 0x2f3a40, SURF.curtain);
      box(1.2, 0.1, 0.16, px, 1.48, s * (wid / 2 + 0.06), MIL.timberDark, SURF.wood);
    }
  }
  box(1.1, 2.1, 0.1, 0, 0.45, wid / 2 + 0.03, MIL.timberDark, SURF.wood);
  box(1.6, 0.25, 0.9, 0, 0, wid / 2 + 0.5, MIL.concreteOld, SURF.concrete);
  const [cx, cz] = at(len * 0.3, -wid * 0.15);
  A(b, CYL, 0.12, 2.2, 0.12, cx, 3.4, cz, MIL.steel, SURF.metal);
  A(b, CYL, 0.2, 0.2, 0.2, cx, 5.6, cz, MIL.steel, SURF.metal);
}

/** Varil: yatık ya da dik petrol varili. */
function drum(b: B, x: number, z: number, col: number, lying = false, ry = 0): void {
  if (lying) b.push(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 10).rotateZ(Math.PI / 2).translate(0, 0.3, 0), col, SURF.metal, ry, x, 0, z);
  else {
    A(b, CYL, 0.3, 0.88, 0.3, x, 0, z, col, SURF.metal);
    A(b, CYL, 0.31, 0.03, 0.31, x, 0.3, z, MIL.steel, SURF.metal);
  }
}

/** Mermi sandığı yığını: n sandık, iki sıra. */
function crates(b: B, x: number, z: number, n: number, ry: number): void {
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  for (let i = 0; i < n; i++) {
    const lx = (i % 3) * 1.0 - 1.0;
    const ly = Math.floor(i / 3) * 0.42;
    A(b, BOX, 0.9, 0.4, 0.55, x + lx * cs, ly, z - lx * sn, i % 2 ? 0x5c5034 : 0x665a3c, SURF.wood, ry);
  }
}

/** Projektör mevzisi: kum torbası halka, döner ayak üstünde 150 cm'lik ışıldak, yanında jeneratör ve kablo makarası. */
function searchlight(b: B, x: number, z: number, aim: number): void {
  A(b, SANDBAG, 4.2, 2.4, 4.2, x, 0.4, z, MIL.sand, SURF.sandbag);
  A(b, CYL, 4.0, 0.08, 4.0, x, 0, z, MIL.trodden, SURF.earth);
  A(b, CYL, 0.9, 0.6, 0.9, x, 0, z, MIL.feldgrau, SURF.metal);
  for (const s of [-1, 1]) A(b, BOX, 0.14, 1.6, 0.4, x + s * 1.0, 0.6, z, MIL.feldgrau, SURF.metal);
  const cs = Math.cos(aim);
  const sn = Math.sin(aim);
  // Tambur: biraz yukarı bakar
  const drumG = new THREE.CylinderGeometry(0.85, 0.85, 1.3, 16).rotateX(Math.PI / 2 - 0.5);
  b.push(drumG, MIL.feldgrau, SURF.metal, aim, x, 2.0, z);
  b.push(new THREE.CylinderGeometry(0.78, 0.78, 0.05, 16).rotateX(Math.PI / 2 - 0.5).translate(0, 0.32, 0.56), 0xc8cdd0, SURF.metal, aim, x, 2.0, z);
  A(b, BOX, 1.6, 1.1, 0.9, x + 2.6 * cs, 0, z - 2.6 * sn, MIL.olive, SURF.metal, aim);
  b.push(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10).rotateZ(Math.PI / 2), MIL.timberDark, SURF.wood, aim, x - 2.4 * cs, 0.35, z + 2.4 * sn);
}

/** Silah çukuru: seviye 1 kum torbası, seviye 2+ beton duvar ve kum torbası, seviye 3 cephane nişleri. Hepsinde ezilmiş
 * toprak taban, kütük kaplama dikmeleri, hazır cephane dolabı ve sandıklar, giriş basamağı. */
function gunPit(b: B, level: number, r: number, x: number, z: number): void {
  A(b, CYL, r * 1.25, 0.05, r * 1.25, x, 0, z, MIL.spoil, SURF.earth);
  A(b, CYL, r - 0.3, 0.07, r - 0.3, x, 0, z, MIL.trodden, SURF.earth);
  if (level <= 1) {
    A(b, SANDBAG, r, 2.6, r, x, 0.5, z, MIL.sand, SURF.sandbag);
    A(b, SANDBAG, r * 0.98, 2.2, r * 0.98, x, 0.95, z, MIL.sand2, SURF.sandbag);
    // Kütük kaplama dikmeleri (iç yüzde)
    const n = Math.round(r * 2.2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      A(b, CYL, 0.09, 1.1, 0.09, x + Math.cos(a) * (r - 0.35), 0, z + Math.sin(a) * (r - 0.35), MIL.timberDark, SURF.wood);
    }
  } else {
    const h = level >= 3 ? 1.6 : 1.2;
    b.push(new THREE.CylinderGeometry(r, r, h, 24, 1, true).translate(x, h / 2, z), MIL.concrete, SURF.concrete);
    b.push(new THREE.CylinderGeometry(r + 0.35, r + 0.35, 0.25, 24, 1, true).translate(x, h - 0.12, z), MIL.concreteOld, SURF.concrete);
    A(b, SANDBAG, r * 1.08, 1.6, r * 1.08, x, 0.2, z, MIL.sand, SURF.sandbag);
    if (level >= 3) for (const a of [0.4, 2.5, 4.6]) A(b, BOX, 1.4, 1.1, 1.0, x + Math.cos(a) * (r - 0.6), 0, z + Math.sin(a) * (r - 0.6), MIL.concreteOld, SURF.concrete, -a);
  }
  // Hazır cephane dolabı ve sandıklar (merkeze bakan yanda), boş kovan yığını
  const toC = Math.atan2(-z, -x);
  const ax = x + Math.cos(toC + 0.6) * (r - 1.1);
  const az = z + Math.sin(toC + 0.6) * (r - 1.1);
  A(b, BOX, 1.4, 1.0, 0.7, ax, 0, az, MIL.olive, SURF.metal, -toC);
  crates(b, x + Math.cos(toC - 0.7) * (r - 1.3), z + Math.sin(toC - 0.7) * (r - 1.3), 4, -toC);
  A(b, CYL, 0.6, 0.18, 0.6, x + Math.cos(toC + 2.2) * (r - 1.2), 0, z + Math.sin(toC + 2.2) * (r - 1.2), 0x8a7440, SURF.metal);
}

/** Yapının yeri ve yönü (taşınınca görünüm yeniden kurulur: gameRenderer syncStructures). */
export const placeKeyOf = (s: Structure): string => `${s.pos.x.toFixed(2)},${s.pos.z.toFixed(2)},${s.heading.toFixed(4)}`;

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
  /** Hava üssünün park yerleri (öncelik sırasıyla) ve tesis hangarlarınınkiler. */
  private bays: Bay[] = [];
  private upgradeBays: Bay[] = [];
  private upgradeGroup = new THREE.Group();
  private upgradeSig = '';
  private scaffold: THREE.Mesh | null = null;
  /** İnşaatta yükselme: kırpma düzlemi ve yapının yerden yüksekliği (m). */
  private clip: THREE.Plane | null = null;
  private clipTop = 0;
  private clipMain = 0;
  readonly ring: THREE.Mesh;
  private built = false;
  /** İtfaiye merkezinin çizildiği seviye (seviye atlayınca görünüm yeniden kurulur: gameRenderer syncStructures). */
  readonly fireLevel: number;

  /** Kurulduğu yer ve yön (placeKeyOf). */
  readonly placeKey: string;

  constructor(readonly s: Structure) {
    this.placeKey = placeKeyOf(s);
    this.fireLevel = s.fire?.level ?? 0;
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
        // Komuta mevzisi: yarı gömülü beton sığınak, üstü çimli toprak, kum torbası halka, inen basamaklar ve çelik kapı,
        // periskop, telsiz direği ve gergi telleri. Sensörler (telemetre, hesap makinesi, radar) çevresinde ayrı çizilir
        worn(b, 0, 0, 15, 1);
        worn(b, 4, -3, 9, 5, MIL.earth);
        A(b, BOX, 7, 1.6, 5, 0, 0, 0, MIL.concrete, SURF.concrete);
        A(b, BOX, 7.6, 0.5, 5.6, 0, 1.6, 0, MIL.turf, SURF.grass);
        A(b, SANDBAG, 6.3, 2.8, 6.3, 0, 0.35, 0, MIL.sand, SURF.sandbag);
        A(b, SANDBAG, 6.1, 2.4, 6.1, 0, 0.75, 0, MIL.sand2, SURF.sandbag);
        A(b, BOX, 1.3, 1.5, 0.12, 0, 0, 2.53, MIL.feldgrau, SURF.metal);
        for (let i = 0; i < 3; i++) A(b, BOX, 1.5, 0.2, 0.5, 0, 0.5 - i * 0.2, 3.0 + i * 0.5, MIL.concreteOld, SURF.concrete);
        A(b, CYL, 0.08, 1.1, 0.08, 1.8, 2.1, -1.0, MIL.steel, SURF.metal);
        A(b, BOX, 0.3, 0.18, 0.3, 1.8, 3.2, -1.0, MIL.steel, SURF.metal);
        A(b, CYL, 0.06, 8.5, 0.06, -2.4, 2.1, 1.2, MIL.steel, SURF.metal);
        for (const [dx, dz] of [[-3, 0], [2, 3], [1.5, -3]]) beam(b, -2.4, 9.8, 1.2, -2.4 + dx * 1.2, 0, 1.2 + dz * 1.2, 0.02, MIL.wire);
        // Çukurlara uzanan ezilmiş toprak yollar ve kenarlarında tahta döşeme
        for (let i = 0; i < 6; i++) {
          const [ox, oz] = AASite.mountOffset(i);
          A(b, BOX, 2.2, 0.06, 32, ox * 0.46, 0, oz * 0.46, MIL.trodden, SURF.earth, Math.atan2(ox, oz));
          worn(b, ox, oz, 9, i * 3);
        }
        this.aaGrounds(b, rng);
        g.add(this.mountGroup);
        g.add(this.sensorGroup);
        break;
      }
      case 'radar': {
        // Freya tipi radar: beton döner taban üstünde dönen kabin ve kabinin taşıdığı anten çerçevesi; jeneratör,
        // telsiz kulübesi, yakıt tankı, çit
        A(b, CYL, 4.6, 0.5, 4.6, 0, 0, 0, MIL.concrete, SURF.concrete);
        A(b, CYL, 3.6, 0.12, 3.6, 0, 0.5, 0, MIL.steel, SURF.metal);
        const cab = new THREE.Group();
        cab.position.y = 0.6;
        const cb = new ArchBatch();
        freya(cb);
        cb.build(cab, this.mat);
        g.add(cab);
        this.antenna = cab;
        this.radarGrounds(b, rng);
        break;
      }
      case 'factory':
        this.buildFactory(b, rng);
        break;
      default:
        if (city) buildCityModel(s.kind, rng, b, this.fireLevel || 1);
        break;
    }
    b.build(g, this.mat);
    this.reground();

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
    const lamps = new LampSet();
    // Pist: plakalı beton, iki yanda asfalt omuz ve kenar lambası yuvaları, pist başı çizgileri, orta çizgi, iniş
    // bölgesi işaretleri
    A(b, BOX, 64, 1.2, L, 0, 0, 0, COL.runway, SURF.runway);
    for (const s of [-1, 1]) {
      A(b, BOX, 6, 1.05, L + 24, s * 35, 0, 0, 0x676864, SURF.asphalt);
      for (let z = -RUNWAY_HALF + 5; z <= RUNWAY_HALF - 5; z += (L - 10) / Math.round((L - 10) / 60)) A(b, BOX, 0.3, 0.35, 0.3, s * 33.5, 1.05, z, 0x8f9085, SURF.metal);
    }
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
    // Kemer çatılı hangarlar: kapılı uçları aprona bakar (kapı ağızları en önde gelen park yerleri)
    const bays: Bay[] = [];
    for (let i = 0; i < 3; i++) bays.push(hangar(b, -410, -300 + i * 300, 18 + rng() * 3, lamps));
    airfieldGrounds(b);
    airfieldCamp(b, rng);
    bays.push(...airfieldExtras(b, lamps));
    this.bays = bays;
    // Harekât kulesi (watch office): balkon, cam kontrol odası, dış merdiven, sinyal direği, meteoroloji kafesi
    watchOffice(b, -330, 700);
    // İtfaiye (tuğla, kapılar) ve önünde iki itfaiye aracı, barakalar (ahşap, keçe beşik çatı), yakıt tankları,
    // rüzgâr tulumları
    airfieldFire(b, -300, 760);
    for (const dx of [-7.6, 7.6]) {
      const v = fireVehicle(dx > 0);
      v.position.set(-300 + dx, 0.35, 744);
      v.rotation.y = Math.PI;
      g.add(v);
    }
    for (let i = 0; i < 4; i++) barrack(b, -500, 180 + i * 90, 42, 9, Math.PI / 2);
    fuelFarm(b, -470, -720, 3);
    for (const z of [900, -900]) windsock(b, 70, z, 0.7);
    // Telsiz direği (kafes, gergili), takım bayrağı
    latticeMast(b, -360, 720, 32);
    A(b, CYL, 0.12, 12, 0.12, -310, 0, 690, COL.white, SURF.metal);
    A(b, BOX, 0.1, 1.6, 2.6, -310, 10.2, 691.4, PALETTE.team[this.s.team], SURF.plain);
    // Apron araçları (airfieldVehicles.ts): yakıt tankerleri, uçak çekicileri, bir binek araç ve ambulans; apron
    // betonunun üstünde (0,9 m; eskiden içine gömülüydü). Hangar ağızlarının önü boş
    const AY = 0.9;
    const vz = [-245, -190, -130, -70, 60, 120, 180, 240];
    for (let i = 0; i < vz.length; i++) {
      const z = vz[i] + rng() * 8;
      const x = -350 + rng() * 14;
      const ry = (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.3;
      if (i % 3 === 0) refueller(b, x, z, ry, AY);
      else if (i === 4) autoParts(b, 'sedan', 0x4a4e3a, x, z, ry, AY);
      else if (i === 7) ambulance(b, x, z, ry, AY);
      else aircraftTractor(b, x, z, ry, AY);
    }
    // Nissen kulübeleri (oluklu sac) ve dağıtım kulübeleri (ahşap)
    for (let i = 0; i < 6; i++) {
      const z = -900 + i * 40;
      A(b, ARCH, 5, 3.4, 14, -540, 0, z, 0x6f746a, SURF.corrugated);
      // Kemer biçimli tuğla alın duvarları (kutu duvar kemerin dışına taşıyordu), duvar yüzünde kapı ve iki pencere
      for (const e of [-1, 1]) b.push(archWall(4.95, 3.35, 0.3), COL.brick, SURF.brick, 0, -540, 0, z + e * 7.05);
      A(b, BOX, 1.1, 2.0, 0.1, -540, 0, z + 7.25, 0x3a3428, SURF.wood);
      for (const dx of [-2.5, 2.5]) {
        A(b, BOX, 1.0, 0.85, 0.06, -540 + dx, 1.0, z + 7.22, 0x2f3a40, SURF.curtain);
        A(b, BOX, 1.15, 0.08, 0.14, -540 + dx, 0.94, z + 7.24, COL.concrete, SURF.concrete);
      }
      // Soba borusu çatıdan çıkar (eskiden çatının 1 m üstünde havada duruyordu)
      A(b, CYL, 0.12, 1.4, 0.12, -538, 2.95, z - 4, COL.steel, SURF.metal);
    }
    for (let i = 0; i < 4; i++) {
      const z = -1100 + i * 30;
      A(b, BOX, 7, 3.6, 7, -100, 0, z, COL.wood, SURF.wood);
      A(b, GABLE, 7.6, 1.6, 7.6, -100, 3.6, z, COL.felt, SURF.felt);
      A(b, BOX, 1.0, 2.0, 0.1, -101.5, 0, z + 3.55, 0x3a3428, SURF.wood);
      A(b, BOX, 1.2, 0.9, 0.08, -98.6, 1.4, z + 3.55, 0x2f3a40, SURF.curtain);
    }
    airfieldLights(lamps);
    lamps.build(g);
    g.add(this.craterGroup);
    g.add(this.parkedGroup);
    g.add(this.upgradeGroup);
  }

  /**
   * Uçaksavar bataryasının çevresi: komuta mevzisi çevresinde çiğnenmiş toprak, yuvalar arasında zikzak siperler ve toprak
   * setleri, yuva yollarının yanında mermi sandıkları, mürettebat çadırları ve sahra mutfağı, ahşap gözetleme kulesi, cephane
   * kamyonu ve jeneratör römorku. Yuvalar 42 m'de 60°'de bir (dış ikisi 66 m): parçalar aradaki açılarda.
   */
  /**
   * Bataryanın çevresi (yuvalar arasındaki açılar 1,02 2,07 3,12 4,16 5,21 6,25 rad; 1,02 ve 4,16'da dış yuvalar):
   * yuvalar arasında siperler ve kazı toprağı, iki toprak örtülü cephanelik, gözetleme kulesi, batıda iki baraka, mutfak
   * ve çadırlar, doğuda projektör mevzisi, güneydoğudan gelen çakıl yol ve kamuflaj ağı altında araç parkı, telefon
   * hatları, 88 m'de dikenli tel çit (yolda kapı).
   */
  private aaGrounds(b: B, rng: () => number): void {
    const polar = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
    // Siperler: yuvaların arasında, merkezden 17 m, teğet; zikzak iki parça, kütük kenar, kazı toprağı seti
    for (let k = 0; k < 6; k++) {
      if (k === 4) continue; // yol buradan geçer (5,21 rad)
      const a = 0.5 + Math.PI / 6 + (k * Math.PI) / 3;
      const [x, z] = polar(a, 17);
      trench(b, 9, x, z, -a);
    }
    // Yol: güneydoğudan (5,21 rad), çakıl, kenarlarda tekerlek izi
    const ra = 5.21;
    const [rx, rz] = polar(ra, 52);
    const rry = Math.atan2(Math.cos(ra), Math.sin(ra));
    A(b, BOX, 4.2, 0.1, 84, rx, 0, rz, MIL.gravel, SURF.earth, rry);
    for (const s of [-1, 1]) A(b, BOX, 0.5, 0.12, 84, rx - Math.sin(ra) * s * 1.1, 0, rz + Math.cos(ra) * s * 1.1, 0x5a4c3a, SURF.earth, rry);
    // Cephanelikler: toprak örtülü kemer, beton ön duvar, çelik kapı, önünde kum torbası perde duvarı ve sandıklar
    for (const a of [2.07, 6.25]) {
      const [x, z] = polar(a, 27);
      const ry = Math.atan2(-x, -z) + Math.PI;
      const fx = Math.sin(ry);
      const fz = Math.cos(ry);
      A(b, ARCH, 4.3, 3.2, 8, x, 0, z, MIL.turf, SURF.grass, ry);
      b.push(archWall(4.45, 3.3, 0.6).rotateY(ry).translate(x + fx * 4.1, 0, z + fz * 4.1), MIL.concrete, SURF.concrete);
      A(b, BOX, 1.6, 2.1, 0.12, x + fx * 4.45, 0, z + fz * 4.45, MIL.feldgrau, SURF.metal, ry);
      sandWall(b, 6, 1.6, x + fx * 7.2, z + fz * 7.2, ry + Math.PI / 2);
      crates(b, x + fx * 5.8 + fz * 2.5, z + fz * 5.8 - fx * 2.5, 6, ry);
    }
    // Gözetleme kulesi (batı, 3,12 rad): dört ayak, çapraz bağlar, platform, korkuluk, çatı, merdiven
    const [tx, tz] = polar(3.12, 27);
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) A(b, BOX, 0.25, 8, 0.25, tx + dx, 0, tz + dz, MIL.timber, SURF.wood);
    for (const [y0, y1] of [[0.3, 4], [4, 7.6]]) {
      beam(b, tx - 1.3, y0, tz - 1.3, tx + 1.3, y1, tz - 1.3, 0.1, MIL.timber);
      beam(b, tx - 1.3, y0, tz + 1.3, tx + 1.3, y1, tz + 1.3, 0.1, MIL.timber);
    }
    A(b, BOX, 3.6, 0.2, 3.6, tx, 8, tz, MIL.plank, SURF.wood);
    for (const [dx, dz, w, d] of [[0, -1.7, 3.6, 0.08], [0, 1.7, 3.6, 0.08], [-1.7, 0, 0.08, 3.6], [1.7, 0, 0.08, 3.6]]) A(b, BOX, w, 1.0, d, tx + dx, 8.2, tz + dz, MIL.plank, SURF.wood);
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) A(b, BOX, 0.12, 1.8, 0.12, tx + dx, 8.2, tz + dz, MIL.timber, SURF.wood);
    A(b, GABLE, 4.2, 1.0, 4.2, tx, 10, tz, MIL.felt, SURF.felt);
    beam(b, tx + 1.4, 0, tz + 2.4, tx + 1.4, 8, tz + 1.3, 0.08, MIL.timber);
    for (const [x, z, r, sd] of [[-67, 2, 15, 2], [-38, 62, 13, 4], [-12, 23, 7, 6], [26, 3, 7, 8]] as const) worn(b, x, z, r, sd);
    // Batı: iki baraka, helâ, su tankeri römorku
    barrack(b, -62, 2, 14, 6, Math.PI / 2);
    barrack(b, -73, 2, 14, 6, Math.PI / 2);
    A(b, BOX, 1.4, 2.2, 1.4, -67, 0, 15, MIL.plank, SURF.wood);
    A(b, BOX, 1.6, 0.1, 1.6, -67, 2.2, 15, MIL.felt, SURF.felt);
    b.push(new THREE.CylinderGeometry(0.9, 0.9, 3, 12).rotateZ(Math.PI / 2), MIL.olive, SURF.metal, 0, -56, 1.3, -12);
    A(b, BOX, 3.2, 0.3, 1.6, -56, 0.35, -12, MIL.steel, SURF.metal);
    // Kuzeybatı: sahra mutfağı ve çadırlar
    for (const [x, z] of [[-40, 60], [-31, 66], [-48, 52]]) {
      A(b, GABLE, 4.2, 2.6, 6.5, x, 0, z, 0x6e6a4c, SURF.canvas, 0.6);
      for (const s of [-1, 1]) beam(b, x + Math.cos(0.6) * s * 2.1, 1.2, z - Math.sin(0.6) * s * 2.1, x + Math.cos(0.6) * s * 3.6, 0, z - Math.sin(0.6) * s * 3.6, 0.03, MIL.wire);
    }
    A(b, BOX, 2.4, 1.1, 1.6, -24, 0, 70, MIL.olive, SURF.metal);
    A(b, CYL, 0.22, 2.4, 0.22, -23.4, 1.1, 70.4, 0x2c2826, SURF.metal);
    camoNet(b, 8, 6, 2.6, -24, 70, 0.4, 3);
    // Doğu: projektör mevzisi ve jeneratörü
    const [lx, lz] = polar(6.25, 66);
    worn(b, lx, lz, 7, 12);
    searchlight(b, lx, lz, -0.3);
    // Güneydoğu: kamuflaj ağı altında araç parkı (cephane kamyonları, jeneratör römorku), varil yığını
    const [px, pz] = polar(5.21, 72);
    const side = (d: number): [number, number] => [px + Math.cos(ra + Math.PI / 2) * d, pz + Math.sin(ra + Math.PI / 2) * d];
    const [vx, vz] = side(9);
    P.truck(b, rng, vx - 2, vz, rry);
    P.truck(b, rng, vx + 2.5, vz + 1.5, rry);
    camoNet(b, 12, 10, 3.4, vx, vz, rry, 7);
    worn(b, vx, vz, 10, 9, MIL.earth);
    const [gx, gz] = side(-8);
    A(b, BOX, 2, 1.4, 3, gx, 0.4, gz, MIL.olive, SURF.metal, rry);
    for (let i = 0; i < 6; i++) drum(b, gx + 3 + (i % 3) * 0.7, gz + Math.floor(i / 3) * 0.7, i % 2 ? 0x4f5638 : 0x6a2a22);
    drum(b, gx + 3.3, gz + 2.0, 0x4f5638, true, 0.4);
    // Telefon hatları: komuta mevzisinden projektöre ve barakalara
    phoneLine(b, [polar(6.25, 24), polar(6.25, 47), [lx - 4, lz + 3]]);
    phoneLine(b, [polar(3.0, 33), polar(3.05, 50), [-62, -6]]);
    // Dikenli tel çit, yolda kapı: iki kazık, bariyer, tabela
    wireRing(b, 88, [ra, 0.035]);
    const [kx, kz] = polar(ra, 88);
    for (const s of [-1, 1]) A(b, BOX, 0.3, 2.2, 0.3, kx - Math.sin(ra) * s * 3, 0, kz + Math.cos(ra) * s * 3, MIL.timberDark, SURF.wood);
    A(b, BOX, 0.12, 0.12, 6, kx, 1.1, kz, 0xd8d0c0, SURF.metal, rry + Math.PI / 2);
    A(b, BOX, 1.2, 0.8, 0.06, kx - Math.sin(ra) * 4.2, 1.4, kz + Math.cos(ra) * 4.2, 0xd8d0c0, SURF.plain, rry);
    A(b, BOX, 0.1, 1.4, 0.1, kx - Math.sin(ra) * 4.2, 0, kz + Math.cos(ra) * 4.2, MIL.timberDark, SURF.wood);
  }

  /**
   * Radarın çevresi: anten çevresinde kum torbası set ve kütük kaplama, yarı gömülü harekât sığınağı (havalandırma
   * boruları, telsiz anteni) ve antene giden kablo hendeği, beton jeneratör binası (egzoz, panjurlu kapı) ve beşikte yakıt
   * tankı, telsiz kulübesi ve gergili anten direği, baraka, helâ, kapı ve bekçi kulübesi, çakıl yol, kamuflaj ağı altında
   * telsiz kamyonu, varil yığını, makineli tüfek mevzisi, elektrik hattı, iki sıra dikenli tel (güneyde kapı).
   */
  private radarGrounds(b: B, rng: () => number): void {
    worn(b, 0, 0, 13, 3);
    for (const [x, z, r, sd] of [[-6, -27, 10, 5], [22, -14, 8, 7], [-22, -19, 7, 9], [22, 26, 11, 11], [-18, 22, 9, 13], [0, 44, 7, 15]] as const) worn(b, x, z, r, sd);
    A(b, SANDBAG, 8.5, 2.6, 8.5, 0, 0.3, 0, MIL.sand, SURF.sandbag);
    A(b, SANDBAG, 8.3, 2.2, 8.3, 0, 0.72, 0, MIL.sand2, SURF.sandbag);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.25) continue;
      A(b, CYL, 0.1, 1.2, 0.1, Math.cos(a) * 7.6, 0, Math.sin(a) * 7.6, MIL.timberDark, SURF.wood);
    }
    // Harekât sığınağı: yarı gömülü beton, çimli toprak örtü, merdivenli giriş, havalandırma boruları, telsiz anteni
    A(b, BOX, 12, 0.08, 9, -6, 0, -27, MIL.spoil, SURF.earth);
    A(b, BOX, 11, 2.2, 7, -6, 0, -27, MIL.concrete, SURF.concrete);
    A(b, BOX, 12, 0.7, 8, -6, 2.2, -27, MIL.turf, SURF.grass);
    A(b, BOX, 1.4, 1.9, 0.12, -6, 0, -23.45, MIL.feldgrau, SURF.metal);
    for (let i = 0; i < 3; i++) A(b, BOX, 1.6, 0.2, 0.5, -6, 0.45 - i * 0.18, -22.9 + i * 0.5, MIL.concreteOld, SURF.concrete);
    for (const x of [-9, -3]) {
      A(b, CYL, 0.18, 1.3, 0.18, x, 2.9, -28, MIL.steel, SURF.metal);
      b.push(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10), MIL.steel, SURF.metal, 0, x, 4.25, -28);
    }
    A(b, CYL, 0.05, 7, 0.05, -10.5, 2.9, -29.5, MIL.steel, SURF.metal);
    // Kablo hendeği: sığınaktan antene, üstü tahta kapaklı
    A(b, BOX, 1.0, 0.1, 15, -3.2, 0, -15.5, 0x3e3226, SURF.earth, 0.25);
    for (let i = 0; i < 6; i++) A(b, BOX, 1.2, 0.08, 1.6, -3.2 + Math.sin(0.25) * (i * 2.4 - 6), 0.08, -15.5 + Math.cos(0.25) * (i * 2.4 - 6), MIL.plank, SURF.wood, 0.25);
    // Jeneratör binası: beton blok, düz çatı, panjurlu çelik kapı, egzoz borusu, kablo çıkışı
    A(b, BOX, 8.4, 0.4, 5.4, 22, 0, -14, MIL.concreteOld, SURF.concrete);
    A(b, BOX, 8, 3.2, 5, 22, 0.4, -14, MIL.concrete, SURF.concrete);
    A(b, BOX, 8.6, 0.3, 5.6, 22, 3.6, -14, MIL.felt, SURF.felt);
    A(b, BOX, 2, 2.2, 0.12, 20, 0.4, -11.45, MIL.feldgrau, SURF.hangarDoor);
    for (let i = 0; i < 3; i++) A(b, BOX, 1.2, 0.12, 0.1, 24.5, 1.4 + i * 0.45, -11.44, MIL.steel, SURF.metal);
    A(b, CYL, 0.16, 3.4, 0.16, 25.4, 3.6, -15.5, MIL.rust, SURF.metal);
    A(b, CYL, 0.24, 0.3, 0.24, 25.4, 7.0, -15.5, MIL.steel, SURF.metal);
    // Yakıt tankı beşikte, yanında varil yığını
    for (const dz of [-1.2, 1.2]) A(b, BOX, 3.8, 0.6, 0.4, -24, 0, -18 + dz, MIL.concreteOld, SURF.concrete);
    b.push(new THREE.CylinderGeometry(1.5, 1.5, 4.6, 14).rotateX(Math.PI / 2), 0x6f746c, SURF.metal, Math.PI / 2, -24, 2.0, -18);
    for (let i = 0; i < 6; i++) drum(b, -19.5 + (i % 3) * 0.75, -22.5 + Math.floor(i / 3) * 0.75, i % 2 ? 0x4f5638 : 0x6a2a22);
    drum(b, -17.5, -21.5, 0x4f5638, true, 0.3);
    // Telsiz kulübesi ve gergili anten direği
    A(b, BOX, 6, 2.6, 4, -20, 0, 16, MIL.plank, SURF.wood);
    P.gableRoof(b, 4, 6, 1.1, -20, 2.6, 16, Math.PI / 2, MIL.plank, SURF.wood, MIL.felt, SURF.felt, 0.35);
    A(b, BOX, 0.9, 1.9, 0.1, -18.6, 0, 18.03, MIL.timberDark, SURF.wood);
    A(b, BOX, 0.9, 0.7, 0.08, -21.4, 1.3, 18.03, 0x2f3a40, SURF.curtain);
    A(b, CYL, 0.07, 14, 0.07, -26, 0, 20, MIL.steel, SURF.metal);
    for (const [dx, dz] of [[-6, 0], [3, 5], [3, -5]]) beam(b, -26, 13.5, 20, -26 + dx, 0, 20 + dz, 0.02, MIL.wire);
    A(b, BOX, 3, 0.05, 0.05, -26, 13, 20, MIL.steel, SURF.metal);
    // Baraka ve helâ
    barrack(b, 22, 26, 14, 6, 0);
    A(b, BOX, 1.4, 2.2, 1.4, 33, 0, 32, MIL.plank, SURF.wood);
    A(b, BOX, 1.6, 0.1, 1.6, 33, 2.2, 32, MIL.felt, SURF.felt);
    // Kapı, bekçi kulübesi, bariyer, çakıl yol
    A(b, BOX, 4, 0.08, 42, 0, 0, 29, MIL.gravel, SURF.earth);
    for (const s of [-1, 1]) A(b, BOX, 0.45, 0.1, 42, s * 1.1, 0, 29, 0x5a4c3a, SURF.earth);
    A(b, BOX, 2.4, 2.5, 2.4, 5, 0, 45, MIL.plank, SURF.wood);
    A(b, BOX, 2.8, 0.12, 2.8, 5, 2.5, 45, MIL.felt, SURF.felt);
    A(b, BOX, 0.08, 0.6, 1.0, 3.78, 1.2, 45, 0x2f3a40, SURF.curtain);
    A(b, BOX, 6, 0.14, 0.14, 0.5, 1.1, 49, 0xd8d0c0, SURF.metal);
    A(b, BOX, 0.3, 1.2, 0.3, 3.6, 0, 49, MIL.timberDark, SURF.wood);
    // Kamuflaj ağı altında telsiz kamyonu
    P.truck(b, rng, -12, 31, 0.3);
    camoNet(b, 9, 7, 3.2, -12, 31, 0.3, 11);
    // Makineli tüfek mevzisi
    A(b, SANDBAG, 2.2, 2.2, 2.2, 34, 0.3, -32, MIL.sand, SURF.sandbag);
    A(b, BOX, 0.08, 0.08, 1.2, 34, 0.9, -31.6, MIL.steel, SURF.metal, 0.4);
    // Elektrik hattı: jeneratörden antene
    phoneLine(b, [[24, -9], [14, -6], [6, -3]], 5.5);
    // İki sıra dikenli tel, güneyde (yol) kapı
    wireRing(b, 48, [Math.PI / 2, 0.06]);
    wireRing(b, 51.5, [Math.PI / 2, 0.06]);
  }

  private buildFactory(b: B, rng: () => number): void {
    // Avlu: hollerin altında beton döşeme (kenarı toprağa iner), kapıdan avluya ve test apronuna yollar
    P.pad(b, 430, 240, 0x9c978c, SURF.paving, [COL.turf, SURF.grass], 0, -40);
    P.flat(b, 12, 190, -100, 175, COL.asphalt, SURF.asphalt);
    P.flat(b, 270, 10, 30, 100, COL.asphalt, SURF.asphalt);
    P.flat(b, 12, 100, 30, 135, COL.asphalt, SURF.asphalt);
    // Kapı ve bekçi kulübesi (güneyde, çitin önünde)
    A(b, BOX, 4, 3, 4, -88, 0, 255, COL.plaster, SURF.plaster);
    A(b, GABLE, 4.6, 1.2, 4.6, -88, 3, 255, COL.tile, SURF.tile);
    A(b, BOX, 11, 0.2, 0.2, -100, 1.1, 262, 0xd8d6d0, SURF.metal);
    // Testere dişi çatılı montaj holleri: kızıl tuğla, büyük çelik pencereler, kuzey yüzü camlı çatı dişleri; ön uçta
    // büyük sürgülü kapılar ve yükleme rampası, yanda tek katlı atölye eklentisi
    for (let h = 0; h < 3; h++) {
      const x = -150 + h * 150;
      const z = -40 + (rng() - 0.5) * 30;
      const len = 120 + rng() * 40;
      const brick = h === 1 ? COL.brickDark : COL.brick;
      A(b, BOX, 70, 14, len, x, 0, z, brick, SURF.brickWin);
      sawtoothRoof(b, 70, len, x, 14, z);
      // Beton kaide, saçak kuşağı, uzun duvarlarda tuğla payandalar, köşelerde yağmur boruları
      A(b, BOX, 70.6, 1.0, len + 0.6, x, 0, z, COL.concreteDark, SURF.concrete);
      A(b, BOX, 70.8, 0.6, len + 0.8, x, 13.4, z, COL.concrete, SURF.concrete);
      for (const sx of [-1, 1]) {
        for (let pz = z - len / 2 + 6; pz < z + len / 2 - 3; pz += 9) A(b, BOX, 0.9, 13.4, 1.2, x + sx * 35.3, 0, pz, COL.brickDark, SURF.brick);
        for (const sz of [-1, 1]) A(b, CYL, 0.14, 13.6, 0.14, x + sx * 35.5, 0, z + sz * (len / 2 + 0.2), COL.steel, SURF.metal);
      }
      const fz = z + len / 2;
      // Ön cephe: iki büyük kapı (ortadaki holde biri yarı açık: içeride montaj tezgâhında gövde), beton lento, iki
      // personel kapısı ve üstte firma levhası
      for (const dx of [-17, 17]) {
        const open = h === 1 && dx < 0;
        if (open) {
          // Açıklık duvarın önünde (aynı düzlemde kıpırdardı); gövde montaj tezgâhında kapıdan çıkarılıyor
          A(b, BOX, 21.6, 10.8, 0.2, x + dx, 0, fz + 0.12, 0x16181a, SURF.plain);
          A(b, BOX, 11, 11, 0.4, x + dx + 11.5, 0, fz + 0.6, 0x5e6058, SURF.hangarDoor);
          A(b, CYLZ, 1.2, 1.4, 9, x + dx, 2.4, fz + 0.4, 0xb4b8bb, SURF.metal);
          for (const jz of [2.5, 6.5]) {
            A(b, BOX, 0.25, 3.6, 0.25, x + dx - 1.6, 0, fz + jz, 0x8a6a2e, SURF.metal);
            A(b, BOX, 0.25, 3.6, 0.25, x + dx + 1.6, 0, fz + jz, 0x8a6a2e, SURF.metal);
            A(b, BOX, 3.6, 0.25, 0.25, x + dx, 3.6, fz + jz, 0x8a6a2e, SURF.metal);
          }
        } else A(b, BOX, 22, 11, 0.4, x + dx, 0, fz + 0.1, 0x5e6058, SURF.hangarDoor);
        A(b, BOX, 23.5, 1.2, 0.8, x + dx, 11, fz + 0.2, COL.concrete, SURF.concrete);
      }
      for (const dx of [-31, 31]) A(b, BOX, 1.4, 2.4, 0.3, x + dx, 0, fz + 0.15, 0x3a3428, SURF.wood);
      A(b, BOX, 30, 2.2, 0.3, x, 11.6, fz + 0.45, 0x2e3a2e, SURF.plain);
      A(b, BOX, 30.6, 0.2, 0.4, x, 11.5, fz + 0.45, COL.white, SURF.metal);
      // Çatıda havalandırma bacaları
      for (let k = 0; k < 4; k++) A(b, CYL, 0.6, 2.2, 0.6, x - 24 + k * 16, 14, z - len * 0.2 + (k % 2) * 20, COL.galvanized, SURF.metal);
      A(b, BOX, 70, 1.2, 5, x, 0, fz + 2.6, COL.concrete, SURF.concrete);
      A(b, BOX, 12, 5, len * 0.5, x + 41, 0, z - len * 0.15, COL.brickDark, SURF.brickWin);
      A(b, BOX, 12.4, 0.4, len * 0.5 + 0.4, x + 41, 5, z - len * 0.15, COL.felt, SURF.felt);
      P.truck(b, rng, x + (rng() - 0.5) * 30, fz + 12, Math.PI + (rng() - 0.5) * 0.4);
      // Hol önünde: arabada çıplak alüminyum gövde ve sehpalarda kanat
      const ax = x + 22;
      A(b, BOX, 2.4, 0.5, 8, ax, 0.4, fz + 14, 0x3c4436, SURF.metal);
      A(b, CYLZ, 0.85, 1.0, 9.5, ax, 1.9, fz + 9.5, 0xb9bdc0, SURF.metal);
      for (const sz of [-1, 1]) A(b, BOX, 1.6, 1.3, 0.3, ax - 7, 0, fz + 14 + sz * 2.4, 0x6e5238, SURF.wood);
      A(b, BOX, 9, 0.25, 2.2, ax - 7, 1.3, fz + 14, 0xaab0b3, SURF.metal);
    }
    // Kazan dairesi bacaların dibinde, yanında kömür yığını
    A(b, BOX, 64, 15, 22, 82, 0, -126, COL.brick, SURF.brickWin);
    P.gableRoof(b, 22, 64, 6, 82, 15, -126, Math.PI / 2, COL.brick, SURF.brick, COL.felt, SURF.tile, 0.5);
    b.push(CONE.clone().scale(16, 9, 12).translate(140, 0, -150), 0x2c2a28, SURF.earth);
    beam(b, 132, 1.5, -147, 104, 15.5, -131, 1.4, 0x5c5850);
    for (const t of [0.3, 0.65]) A(b, BOX, 0.4, 1.5 + 14 * t, 0.4, 132 - 28 * t, 0, -147 + 16 * t, COL.steelLight, SURF.metal);
    // Boru köprüsü: kazan dairesinden hollere buhar boruları (dikmeler ve iki boru)
    for (let px = 50; px >= -150; px -= 20) {
      A(b, BOX, 0.5, 6, 0.5, px, 0, -112, COL.steelLight, SURF.metal);
      A(b, BOX, 0.4, 0.4, 3, px, 6, -112, COL.steelLight, SURF.metal);
    }
    for (const dz of [-0.7, 0.7]) b.push(new THREE.CylinderGeometry(0.35, 0.35, 200, 8).rotateZ(Math.PI / 2), 0x9a958a, SURF.metal, 0, -50, 6.75, -112 + dz);
    // Yönetim binası: sıvalı üç kat, pencereli; kiremit çatı
    A(b, BOX, 60, 12, 22, -40, 0, 140, COL.plasterCream, SURF.plasterWin);
    A(b, GABLE, 23, 5, 61, -40, 12, 140, COL.tile, SURF.tile, Math.PI / 2);
    // Kat silmesi, sütunlu giriş (basamaklar, alınlık), cephede saat, bacalar, bayrak direği
    A(b, BOX, 60.6, 0.5, 22.6, -40, 4.1, 140, 0xcfc6ae, SURF.concrete);
    A(b, BOX, 14, 0.6, 5, -40, 0, 153.5, COL.concrete, SURF.concrete);
    for (let k = 0; k < 3; k++) A(b, BOX, 14, 0.2, 5 - k * 1.1, -40, 0.6 + k * 0.2, 152.9 - k * 0.55, COL.concrete, SURF.concrete);
    for (let k = 0; k < 4; k++) A(b, CYL, 0.45, 7.5, 0.45, -45.4 + k * 3.6, 0.6, 155, 0xe6e0d0, SURF.concrete);
    A(b, BOX, 13, 1.2, 4, -40, 8.1, 154, 0xe6e0d0, SURF.concrete);
    A(b, GABLE, 13.4, 1.8, 4.4, -40, 9.3, 154, COL.tile, SURF.tile, Math.PI / 2);
    b.push(new THREE.CylinderGeometry(1.1, 1.1, 0.15, 20).rotateX(Math.PI / 2), 0xe8e4d8, SURF.plain, 0, -40, 14.6, 151.4);
    for (const dx of [-24, -8, 8, 24]) P.chimney(b, -40 + dx, 12, 136, 5.5, COL.brickDark);
    A(b, CYL, 0.12, 13, 0.12, -40, 0, 163, COL.white, SURF.metal);
    A(b, BOX, 0.08, 1.6, 2.6, -40, 11.2, 164.4, 0x8e2a22, SURF.plain);
    // Ambarlar (oluklu sac kemer), bacalar (tuğla, kurum karası ağız), su kulesi, test apronu, çit
    // Üç ayrı ambar, aralarında 10 m geçit (eskiden 40 m'lik kemerler 34 m arayla iç içe geçip tek uzun tünel gibi
    // duruyordu, aradaki alın duvarları komşu kemerin içinden çıkıyordu)
    for (let i = 0; i < 3; i++) {
      const az = 88 + i * 40;
      A(b, ARCH, 14, 10, 30, 170, 0, az, COL.galvanized, SURF.corrugated);
      // Kemer biçimli tuğla alın duvarları (24×7 m kutu duvar kemerin dışına taşıyordu); kapı ve lento duvar yüzünde
      for (const e of [-1, 1]) b.push(archWall(13.95, 9.95, 0.4), COL.brick, SURF.brick, 0, 170, 0, az + e * 14.9);
      A(b, BOX, 6, 5, 0.12, 170, 0, az + 15.16, 0x5e6058, SURF.hangarDoor);
      A(b, BOX, 6.8, 0.4, 0.22, 170, 5.0, az + 15.2, COL.concrete, SURF.concrete);
      for (const dx of [-7.5, 7.5]) {
        A(b, BOX, 1.8, 1.4, 0.06, 170 + dx, 3.0, az + 15.13, 0x2f3a40, SURF.curtain);
        A(b, BOX, 2.0, 0.1, 0.18, 170 + dx, 2.92, az + 15.18, COL.concrete, SURF.concrete);
      }
      // Kapı önünde beton rampa, kemer dibinde beton kaide şeridi
      A(b, BOX, 10, 0.18, 4, 170, 0, az + 17.1, COL.concrete, SURF.concrete);
      for (const sx of [-1, 1]) A(b, BOX, 0.5, 0.35, 30, 170 + sx * 13.9, 0, az, COL.concrete, SURF.concrete);
      for (let k = 0; k < 3; k++) drum(b, 160 + k * 0.7, az + 18.5, [0x5a4a38, 0x4a5a4e, 0x8e2a22][(i + k) % 3]);
      crates(b, 181, az + 18.5, 6, 0);
    }
    for (let i = 0; i < 3; i++) {
      const r = 3.5 - i * 0.4;
      const hh = 45 + i * 8;
      A(b, CYL, r, hh, r, 60 + i * 22, 0, -150, COL.brickDark, SURF.brick);
      A(b, CYL, r * 1.12, 1.6, r * 1.12, 60 + i * 22, hh - 1.6, -150, 0x2c2826, SURF.metal);
      for (const f of [0.35, 0.7]) A(b, CYL, r * 1.04, 1.2, r * 1.04, 60 + i * 22, hh * f, -150, 0xb0a490, SURF.brick);
      A(b, CYL, 0.05, 3, 0.05, 60 + i * 22 + r * 0.8, hh, -150, COL.steel, SURF.metal);
    }
    waterTower(b, -230, 110, 22, 6);
    A(b, BOX, 180, 0.8, 70, 30, 0, 215, COL.concrete, SURF.runway);
    fenceRing(b, 300, 270);
    // Demiryolu bağlantısı (balast, raylar) ve vagonlar, işçi otoparkı ve arabalar
    A(b, BOX, 4, 0.5, 520, 240, 0, -10, 0x6f665a, SURF.earth);
    for (let tz = -268; tz < 250; tz += 2.4) A(b, BOX, 2.5, 0.55, 0.26, 240, 0, tz, 0x4a3a2c, SURF.wood);
    for (const dx of [-0.72, 0.72]) A(b, BOX, 0.12, 0.65, 520, 240 + dx, 0, -10, COL.steel, SURF.metal);
    // Manevra lokomotifi: şasi, kazan, duman bacası, kubbe, kabin, tekerler
    A(b, BOX, 2.8, 1.0, 9, 240, 0.65, -205, 0x1c1d1e, SURF.metal);
    A(b, CYLZ, 1.1, 1.1, 5.5, 240, 2.75, -205.5, 0x2a3a2c, SURF.metal);
    A(b, CYL, 0.35, 1.3, 0.35, 240, 3.8, -201.2, 0x1c1d1e, SURF.metal);
    A(b, CYL, 0.5, 0.6, 0.5, 240, 3.8, -203.3, 0x2a3a2c, SURF.metal);
    A(b, BOX, 2.9, 2.6, 2.6, 240, 1.65, -208.4, 0x2a3a2c, SURF.metal);
    A(b, BOX, 3.1, 0.2, 3.0, 240, 4.25, -208.4, 0x1c1d1e, SURF.metal);
    for (let k = 0; k < 3; k++) for (const s2 of [-1, 1]) A(b, WHEEL, 0.15, 0.6, 0.6, 240 + s2 * 0.75, 0.6, -202.5 - k * 1.6, 0x26282a, SURF.metal);
    for (let i = 0; i < 7; i++) {
      const col = [0x6e4a35, 0x5c5f56, 0x7a5a42][i % 3];
      A(b, BOX, 3, 3.6, 13, 240, 0.6, -180 + i * 15, col, SURF.wood);
      A(b, ARCH, 1.5, 0.5, 13, 240, 4.2, -180 + i * 15, 0x3e3c3a, SURF.metal);
    }
    A(b, BOX, 60, 0.7, 40, -200, 0, 190, COL.asphalt, SURF.asphalt);
    for (let i = 0; i < 12; i++) P.car(b, rng, -224 + (i % 6) * 9, 180 + Math.floor(i / 6) * 16, 0);
    // Malzeme sahası demiryolunun yanında: alüminyum levha ve sandık yığınları, rayın üstünde portal vinç
    for (let i = 0; i < 10; i++) {
      const x = 212 + (i % 2) * 9;
      const z = -110 + Math.floor(i / 2) * 18;
      A(b, BOX, 6, 1 + (i % 3) * 0.8, 10, x, 0, z, i % 2 ? 0xa9adae : 0x8a7458, i % 2 ? SURF.metal : SURF.wood);
    }
    for (const z of [-75, -45]) {
      for (const x of [205, 252]) A(b, BOX, 0.9, 12, 0.9, x, 0, z, COL.steelLight, SURF.metal);
      A(b, BOX, 48, 1.2, 1, 228.5, 12, z, 0xb08a2e, SURF.metal);
    }
    A(b, BOX, 3, 1.8, 32, 228.5, 10.2, -60, 0xb08a2e, SURF.metal);
    // Motor deneme standı: beton U patlama duvarları ve kontrol kulübesi
    for (const s of [-1, 1]) A(b, BOX, 1.2, 6, 18, -250 + s * 8, 0, -150, COL.concrete, SURF.concrete);
    A(b, BOX, 17, 6, 1.2, -250, 0, -159, COL.concrete, SURF.concrete);
    A(b, BOX, 6, 3, 5, -270, 0, -140, COL.concreteDark, SURF.concrete);
    for (const dx of [-0.8, 0.8]) A(b, BOX, 0.3, 2.4, 0.3, -250 + dx, 0, -150, COL.steelLight, SURF.metal);
    A(b, CYLZ, 0.7, 0.7, 2.2, -250, 2.6, -150.5, 0x3c3e41, SURF.metal);
    b.push(new THREE.CylinderGeometry(1.7, 1.7, 0.05, 24).rotateX(Math.PI / 2), 0x9a9688, SURF.metal, 0, -250, 2.6, -148.1);
    b.push(new THREE.BoxGeometry(0.08, 3.4, 0.25).rotateZ(0.6), 0x2a2a2a, SURF.metal, 0, -250, 2.6, -148.0);
    // Kapıda bariyer kolu (kırmızı-beyaz), trafo istasyonu ve dışarı giden elektrik hattı, yönetim binası yanında sığınak
    for (let k = 0; k < 6; k++) A(b, BOX, 1.4, 0.16, 0.16, -101 - k * 1.4, 1.15, 270, k % 2 ? COL.white : 0xb02a24, SURF.plain);
    A(b, BOX, 22, 0.3, 16, -150, 0, -190, COL.concrete, SURF.concrete);
    for (let k = 0; k < 3; k++) {
      A(b, BOX, 2.6, 2.8, 1.8, -158 + k * 8, 0.3, -190, 0x5a5e58, SURF.metal);
      for (const dx of [-0.8, 0, 0.8]) A(b, CYL, 0.12, 1.1, 0.12, -158 + k * 8 + dx, 3.1, -190, 0x8a6a4a, SURF.concrete);
    }
    fenceLine(b, -162, -199, -138, -199);
    phoneLine(b, [[-150, -200], [-150, -240], [-150, -300], [-180, -330]], 8);
    b.push(CONE.clone().scale(9, 3, 6), COL.turf, SURF.grass, 0, -110, 0, 120);
    A(b, BOX, 3, 2.4, 2.2, -102, 0, 120, COL.concrete, SURF.concrete);
    // Yönetim binası ve otopark çevresinde ağaçlar, yol boyunca lambalar
    for (let i = 0; i < 8; i++) P.tree(b, rng, -82 + i * 12, 158 + (rng() - 0.5) * 3, 8 + rng() * 3, false);
    for (let i = 0; i < 5; i++) P.tree(b, rng, -236 + i * 18, 218, 7 + rng() * 3, false);
    for (let i = 0; i < 6; i++) P.lamp(b, -92, 95 + i * 32);
  }

  /** Yapının kendi ağları (yüzey malzemeli; lamba, uçak ve top gibi ayrı malzemeli parçalar hariç): yerleştirme önizlemesi. */
  ownMeshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && m.material === this.mat) out.push(m);
    });
    return out;
  }

  /** Parçaları araziye oturt (düz alanın dışında kalanlar; yanına yapı kurulup arazi değişince yeniden). */
  reground(): void {
    groundStructure(this.group, this.s.pos.y);
  }

  /** Her kare: inşaat, hasar, silah yönleri, radar dönüşü, krater ve park uçakları. */
  sync(simDt: number): void {
    const s = this.s;
    const mt = this.mat;
    // İnşaat (2026-11-17): bina yerden yukarı yükselir (kırpma düzlemi; temel ve zemin baştan görünür), çevresinde
    // ahşap iskele, büyük yapıda vinç ve malzeme yığınları (construction.ts). Eskiden yarı saydam bina ve tel kafes kutu.
    if (s.build < 1) {
      if (!this.clip) {
        this.group.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(this.group);
        this.clipTop = Math.max(1, bb.max.y - this.group.matrixWorld.elements[13]);
        const info = bodyInfo(this.group);
        this.clipMain = Math.min(this.clipTop, info?.mainTop ?? this.clipTop);
        this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
        mt.clippingPlanes = [this.clip];
        mt.clipShadows = true;
        mt.needsUpdate = true;
        this.scaffold = buildScaffold(s.kind, s.id * 7919 + 17, info);
        if (this.scaffold) this.group.add(this.scaffold);
      }
      // Ana gövde inşaatın %90'ında tamamlanır, baca ve kuleler son %10'da; alt 0,5 m (temel) baştan görünür
      const k = s.build;
      const h = k < 0.9 ? this.clipMain * (k / 0.9) : this.clipMain + (this.clipTop - this.clipMain) * ((k - 0.9) / 0.1);
      this.clip.constant = this.group.matrixWorld.elements[13] + 0.5 + h;
    } else if (!this.built) {
      this.built = true;
      if (this.clip) {
        mt.clippingPlanes = null;
        mt.needsUpdate = true;
        this.clip = null;
      }
      if (this.scaffold) {
        this.group.remove(this.scaffold);
        this.scaffold.geometry.dispose();
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
    // Blender dokulu toplar ayrıntılı modelde ve inşaat bitince (inşaat kırpması yapı malzemesinde); yüklenince yeniden kurulur
    const baked = quality().models > 0 && this.s.build >= 1;
    if (baked) for (const m of aa.mounts) requestGunSkin(m.weapon);
    const sig = aa.mounts.map((m) => m.weapon).join(',') + '|' + [...aa.sensors].join(',') + '|' + aa.level + '|' + (baked ? gunSkinStamp() : -1);
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
        const bore = weapon ? AA_WEAPONS[weapon].bore : 0;
        const pitR = bore >= 100 ? 7.5 : bore >= 75 ? 6.5 : bore >= 30 ? 5.2 : 4.2;
        gunPit(pits, aa.level, pitR, ox, oz);
        if (i >= 6) {
          // Dış halka yuvalarına uzanan yol
          const len = Math.hypot(ox, oz) - 8;
          A(pits, BOX, 2.4, 0.06, len, ox / 2, 0, oz / 2, COL.earth, SURF.earth, Math.atan2(ox, oz));
        }
      }
      pits.build(this.mountGroup, this.mat);
      aa.mounts.forEach((m, i) => {
        const gun = aaGun(m.weapon, this.mat, baked);
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
      const ul = new LampSet();
      this.upgradeBays = [];
      if (ab.upgrades.has('workshop')) {
        A(ub, BOX, 40, 13, 60, -470, 0, -470, COL.brick, SURF.brickWin);
        sawtoothRoof(ub, 40, 60, -470, 13, -470);
      }
      if (ab.upgrades.has('hangars')) {
        for (const z of [-620, 630]) {
          this.upgradeBays.push(hangar(ub, -410, z, 19, ul));
          // Kapı önünde beton ve taksi yoluna bağlantı
          A(ub, BOX, 40, 0.8, 52, -360, 0, z, COL.concreteDark, SURF.runway);
          A(ub, BOX, 190, 0.75, 18, -245, 0, z, COL.asphalt, SURF.asphalt);
        }
      }
      if (ab.upgrades.has('revetments')) {
        // Toprak siperler: apron park yerlerini üç yandan saran kum torbası duvarlar, arkada çim örtülü set
        for (const p of APRON_BAYS) {
          for (const s of [-1, 1]) A(ub, BOX, 28, 3.2, 2.6, p.x - 12, 0, p.z + s * 16, COL.sandbag, SURF.sandbag);
          A(ub, BOX, 3, 3.2, 34.6, p.x - 27.5, 0, p.z, COL.turf, SURF.grass);
        }
      }
      ub.build(this.upgradeGroup, this.mat);
      ul.build(this.upgradeGroup);
    }
    // Yerde bekleyen uçaklar (gerçek ölçekte): en yenisi önce, sığdığı ilk park yerine (hangar ağızları, T2 hangarlar,
    // çadır hangarlar, sığınaklar, siperler), kalanlar aprona
    const parked = ab.inventory.filter((a) => a.status !== 'airborne');
    const detail = quality().models;
    // Blender modeli istenir; yüklenince (skinStamp) uçaklar yeniden yerleşir
    if (detail) for (const a of parked) requestSkin(SPECS[a.specId].model);
    const sig = `${detail}|${skinStamp()}|${usig}|${parked.map((a) => a.specId).sort().join(',')}`;
    if (sig !== this.parkedSig) {
      this.parkedSig = sig;
      this.placeParked(parked.map((a) => SPECS[a.specId]), detail);
    }
  }

  /**
   * Park eden uçakları yerleştir ve çiz. Sıra: yapım yılı (yeniden eskiye), sonra küçükten büyüğe. En yeni yarısı
   * (yukarı yuvarlanmış) kanat açıklığı ve boyu sığan ilk park yerine (hangar ağızları, T2 ve çadır hangarlar,
   * sığınaklar, siperler; aynı yerde yan yana, 3 m arayla); geri kalanlar ve sığmayanlar apron sıralarına, apron
   * dolarsa yine boş park yerlerine. Aynı türden uçaklar tek InstancedMesh (malzeme başına): çizim çağrısı uçak
   * sayısından bağımsız.
   */
  private placeParked(specs: AircraftSpec[], detail: number): void {
    for (const ch of this.parkedGroup.children) if (ch instanceof THREE.InstancedMesh) ch.dispose();
    this.parkedGroup.clear();
    const bays = [...this.bays.slice(0, 3), ...this.upgradeBays, ...this.bays.slice(3)];
    const fill: AircraftSpec[][] = bays.map(() => []);
    const used = bays.map(() => 0);
    const apron: AircraftSpec[] = [];
    const shelter = (sp: AircraftSpec): boolean => {
      const k = bays.findIndex((bay, i) => used[i] + sp.span + (fill[i].length ? 3 : 0) <= bay.width && sp.length <= bay.depth);
      if (k < 0) return false;
      used[k] += sp.span + (fill[k].length ? 3 : 0);
      fill[k].push(sp);
      return true;
    };
    const order = [...specs].sort((a, b) => b.year - a.year || a.span - b.span);
    const inside = Math.ceil(order.length / 2);
    order.forEach((sp, i) => {
      if (i < inside && shelter(sp)) return;
      if (apron.length < APRON_BAYS.length) apron.push(sp);
      else shelter(sp);
    });
    const byKind = new Map<string, THREE.Matrix4[]>();
    const put = (sp: AircraftSpec, bay: Bay, lat: number) => {
      const parts = parkedParts(sp.model, detail);
      const geo = parts[0].geo;
      if (!geo.boundingBox) geo.computeBoundingBox();
      // Burun modelde +Z: burun ucu park çizgisinden out kadar öne taşar
      const back = geo.boundingBox!.max.z - bay.out;
      const dx = Math.sin(bay.yaw);
      const dz = Math.cos(bay.yaw);
      // Kuyruk tekerlekli uçak kuyruğu üstünde durur (flightModel.ts stepGround ile aynı açı)
      const m = new THREE.Matrix4().makeRotationY(bay.yaw);
      if (sp.tailDragger) m.multiply(new THREE.Matrix4().makeRotationX(-groundAngle(sp) * Math.PI / 180));
      m.setPosition(bay.x - dx * back + dz * lat, bay.y + gearHeight(sp), bay.z - dz * back - dx * lat);
      let list = byKind.get(sp.model);
      if (!list) byKind.set(sp.model, (list = []));
      list.push(m);
    };
    fill.forEach((list, i) => {
      const total = list.reduce((s, sp) => s + sp.span, 0) + 3 * Math.max(0, list.length - 1);
      let at = -total / 2;
      for (const sp of list) {
        put(sp, bays[i], at + sp.span / 2);
        at += sp.span + 3;
      }
    });
    apron.forEach((sp, i) => put(sp, APRON_BAYS[i], 0));
    for (const [kind, ms] of byKind) {
      for (const p of parkedParts(kind, detail)) {
        const im = new THREE.InstancedMesh(p.geo, p.mat, ms.length);
        ms.forEach((m, i) => im.setMatrixAt(i, m));
        im.computeBoundingSphere();
        this.parkedGroup.add(im);
      }
    }
  }
}
