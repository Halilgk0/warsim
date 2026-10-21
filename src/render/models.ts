// Prosedürel low-poly uçak modelleri. Tek renk, düz gölgeleme; detay yerine tanınabilir siluet:
// kanat planformu (eliptik, ters martı, ok), burun (sıra motor, radyal kaporta, camlı burun, hava alığı),
// kanopi, motor naselleri, kuyruk düzeni, sabit iniş takımı ve taret kubbeleri.
// Eksenler: burun +Z, üst +Y, kanat açıklığı X. Ölçüler metre, gerçek boyutlara yakın.
// Dış yükler (bomba, roket, atılabilir tank) ayrı parçadır; harcanınca gizlenir.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPEC_LIST, type AircraftSpec } from '../sim/aircraft/specs';
import type { Hardpoint, StoreDef } from '../sim/aircraft/stores';

type V3 = [number, number, number];
type Geo = THREE.BufferGeometry;

/** Geometriyi cam ya da koyu parça olarak işaretle (ayrı malzemeyle çizilir). */
function tag(g: Geo, part: 'glass' | 'dark'): Geo {
  g.userData.part = part;
  return g;
}

/** 8 köşeli kutu benzeri gövde (0-3 alt halka, 4-7 üst halka, aynı sırada). */
function hexa(v: V3[]): Geo {
  const quads = [
    [0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],
  ];
  const pos: number[] = [];
  for (const [a, b, c, d] of quads) pos.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Kanat istasyonu: x yanal uzaklık, z hücum kenarı, c veter, y yükseklik, t kalınlık. */
interface Station { x: number; z: number; c: number; y: number; t: number }

/** İstasyonlar arası kanat dilimleri, iki yana simetrik. */
/** Aynalanan parçada üçgen sırasını çevir (yüzey normalleri dışa baksın: aydınlatma ve karın boyası doğru olsun). */
function flipWinding(g: Geo): Geo {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i + 1);
    const y = p.getY(i + 1);
    const z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, x, y, z);
  }
  return g;
}

function wingFrom(st: Station[]): Geo[] {
  const out: Geo[] = [];
  // Kök dilimi gövdenin içine uzat: gövde kuyruğa doğru daralınca kanat kökünde boşluk kalmasın
  if (st.length && st[0].x > 0.05) st = [{ ...st[0], x: st[0].x * 0.3 }, ...st];
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i];
    const b = st[i + 1];
    for (const s of [1, -1]) {
      const g = hexa([
        [s * a.x, a.y - a.t / 2, a.z], [s * a.x, a.y - a.t / 2, a.z - a.c], [s * b.x, b.y - b.t / 2, b.z - b.c], [s * b.x, b.y - b.t / 2, b.z],
        [s * a.x, a.y + a.t / 2, a.z], [s * a.x, a.y + a.t / 2, a.z - a.c], [s * b.x, b.y + b.t / 2, b.z - b.c], [s * b.x, b.y + b.t / 2, b.z],
      ]);
      out.push(s < 0 ? flipWinding(g) : g);
    }
  }
  return out;
}

interface WingOpts {
  /** Kök: gövde kenarı (x), hücum kenarı z, veter, y. */
  x0: number;
  z: number;
  root: number;
  y: number;
  /** Yarı açıklık ucu (x). */
  tipX: number;
  tip: number;
  /** Uçta hücum kenarının geri kayması (m). */
  sweep: number;
  dihedral: number;
  t: number;
  shape?: 'tapered' | 'elliptic' | 'rounded' | 'gull';
  /** Martı kanatta kırılma noktası (açıklık oranı) ve iç panel dihedrali (negatif: ters martı). */
  breakAt?: number;
  innerDihedral?: number;
}

const tanD = (deg: number) => Math.tan((deg * Math.PI) / 180);

function wing(o: WingOpts): Geo[] {
  const span = o.tipX - o.x0;
  const st: Station[] = [];
  const shape = o.shape ?? 'tapered';
  if (shape === 'elliptic') {
    // Hücum ve firar kenarı eğri, uçlar yuvarlak
    for (const f of [0, 0.35, 0.62, 0.82, 0.94, 1]) {
      const c = Math.max(o.root * Math.sqrt(1 - f * f * 0.97), o.root * 0.12);
      const zMid = o.z - o.root * 0.32 - o.sweep * f;
      st.push({ x: o.x0 + span * f, z: zMid + c * 0.32, c, y: o.y + span * f * tanD(o.dihedral), t: o.t * (1 - 0.65 * f) });
    }
  } else if (shape === 'gull') {
    const b = o.breakAt ?? 0.3;
    const yb = o.y + span * b * tanD(o.innerDihedral ?? 14);
    const cb = o.root + (o.tip - o.root) * b * 0.5;
    st.push({ x: o.x0, z: o.z, c: o.root, y: o.y, t: o.t });
    st.push({ x: o.x0 + span * b, z: o.z - o.sweep * b, c: cb, y: yb, t: o.t * 0.9 });
    st.push({ x: o.x0 + span * 0.93, z: o.z - o.sweep * 0.93, c: cb + (o.tip - cb) * 0.9, y: yb + span * (0.93 - b) * tanD(o.dihedral), t: o.t * 0.45 });
    st.push({ x: o.tipX, z: o.z - o.sweep - o.tip * 0.12, c: o.tip * 0.6, y: yb + span * (1 - b) * tanD(o.dihedral), t: o.t * 0.3 });
  } else {
    st.push({ x: o.x0, z: o.z, c: o.root, y: o.y, t: o.t });
    if (shape === 'rounded') {
      const f = 0.92;
      st.push({ x: o.x0 + span * f, z: o.z - o.sweep * f, c: o.root + (o.tip - o.root) * f, y: o.y + span * f * tanD(o.dihedral), t: o.t * 0.5 });
      st.push({ x: o.tipX, z: o.z - o.sweep - o.tip * 0.15, c: o.tip * 0.55, y: o.y + span * tanD(o.dihedral), t: o.t * 0.3 });
    } else {
      st.push({ x: o.tipX, z: o.z - o.sweep, c: o.tip, y: o.y + span * tanD(o.dihedral), t: o.t * 0.45 });
    }
  }
  return wingFrom(st);
}

interface Fin {
  x?: number; y0: number; z0: number; h: number; root: number; tip: number; sweep: number; t: number;
  /** Dışa yatma açısı (derece). x verilirse çift kuyruk üretilir. */
  cant?: number;
}

function fins(f: Fin): Geo[] {
  const sides = f.x ? [1, -1] : [1];
  return sides.map((s) => {
    const c = (((f.cant ?? 0) * Math.PI) / 180) * s;
    const x0 = (f.x ?? 0) * s;
    const x1 = x0 + Math.sin(c) * f.h;
    const y1 = f.y0 + Math.cos(c) * f.h;
    const nx = Math.cos(c);
    const ny = -Math.sin(c);
    const rt = f.t / 2;
    const tt = f.t / 4;
    const zl0 = f.z0;
    const zt0 = f.z0 - f.root;
    const zl1 = f.z0 - f.sweep;
    const zt1 = f.z0 - f.sweep - f.tip;
    // Dikey kuyruk gövdeye hafif gömülür (arada ışık sızmasın)
    const g = hexa([
      [x0 - nx * rt, f.y0 - 0.25 - ny * rt, zl0], [x0 - nx * rt, f.y0 - 0.25 - ny * rt, zt0],
      [x1 - nx * tt, y1 - ny * tt, zt1], [x1 - nx * tt, y1 - ny * tt, zl1],
      [x0 + nx * rt, f.y0 - 0.25 + ny * rt, zl0], [x0 + nx * rt, f.y0 - 0.25 + ny * rt, zt0],
      [x1 + nx * tt, y1 + ny * tt, zt1], [x1 + nx * tt, y1 + ny * tt, zl1],
    ]);
    return s < 0 ? flipWinding(g) : g;
  });
}

interface BodyOpts { x?: number; y?: number; z?: number; sx?: number; sy?: number; rot?: number }

/** Dönel gövde. profile: [z, yarıçap] çiftleri (burundan kuyruğa). */
function body(profile: [number, number][], seg = 8, o: BodyOpts = {}): Geo {
  const pts = profile.map(([z, r]) => new THREE.Vector2(Math.max(r, 0.001), z));
  const g = new THREE.LatheGeometry(pts, seg, o.rot ?? 0);
  g.rotateX(Math.PI / 2);
  g.scale(o.sx ?? 1, o.sy ?? 1, 1);
  g.translate(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  return g;
}

function box(w: number, h: number, l: number, x: number, y: number, z: number): Geo {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, z);
  return g;
}

const mirror = (x: number, make: (x: number) => Geo) => [make(x), make(-x)];

/** Kanopi: gövde üstünde yarı gömülü damla. */
function canopy(z: number, len: number, h: number, y: number, w = 0.42, bubble = false): Geo {
  const prof: [number, number][] = bubble
    ? [[z + len * 0.5, 0], [z + len * 0.35, h * 0.75], [z, h], [z - len * 0.25, h * 0.95], [z - len * 0.5, 0]]
    : [[z + len * 0.5, 0], [z + len * 0.3, h * 0.7], [z, h], [z - len * 0.35, h * 0.7], [z - len * 0.5, 0]];
  return tag(body(prof, 7, { y, sx: w / h }), 'glass');
}

/** Radyal motor kaportası (önü kesik, geniş halka) + pervane göbeği. */
function radialCowl(z: number, r: number, len: number, y = 0, x = 0): Geo[] {
  return [
    body([[z, r * 0.55], [z - 0.05, r * 0.92], [z - len * 0.25, r], [z - len, r * 0.9]], 10, { x, y }),
    tag(body([[z + 0.5, 0], [z + 0.32, r * 0.25], [z, r * 0.3]], 8, { x, y }), 'dark'),
  ];
}

/** Motor naseli: sıra motorlu (sivri) ya da radyal/halka radyatörlü (küt). */
function nacelle(x: number, y: number, zFront: number, len: number, r: number, blunt = false): Geo {
  const prof: [number, number][] = blunt
    ? [[zFront + 0.45, 0], [zFront + 0.3, r * 0.3], [zFront, r * 0.6], [zFront - 0.1, r * 0.95], [zFront - len * 0.3, r], [zFront - len, r * 0.25]]
    : [[zFront + 0.45, 0], [zFront + 0.28, r * 0.42], [zFront, r * 0.78], [zFront - len * 0.3, r], [zFront - len, r * 0.25]];
  return body(prof, 8, { x, y });
}

function jetPod(x: number, y: number, zFront: number, len: number, r: number): Geo {
  return body([[zFront, r * 0.75], [zFront - 0.3, r], [zFront - len * 0.6, r * 0.95], [zFront - len, r * 0.6]], 9, { x, y });
}

/** Sabit tekerlek kaportası (spat) + bacak. */
function spats(x: number, y: number, z: number, len = 1.3, r = 0.28, leg = 1.0): Geo[] {
  return [
    ...mirror(x, (xx) => body([[z + len * 0.55, 0], [z + len * 0.3, r * 0.85], [z - len * 0.2, r], [z - len * 0.45, 0.04]], 7, { x: xx, y })),
    ...mirror(x, (xx) => box(0.2, leg, 0.45, xx * 0.95, y + leg / 2, z)),
  ];
}

/** Taret kubbesi (y < 0: alt kubbe). */
function dome(x: number, y: number, z: number, r: number): Geo {
  const g = new THREE.SphereGeometry(r, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  if (y < 0) g.rotateX(Math.PI);
  g.translate(x, y, z);
  return tag(g, 'glass');
}

/** Küçük bomba (kanat altı / gövde altı). */
const bombAt = (x: number, y: number, z: number, scale = 1) =>
  body([[0.9 * scale, 0], [0.65 * scale, 0.18 * scale], [-0.5 * scale, 0.18 * scale], [-0.85 * scale, 0.05]], 6, { x, y, z });
/** Roket rayı + roket. */
const rocketAt = (x: number, y: number, z: number) => body([[1.0, 0], [0.8, 0.09], [-0.9, 0.09], [-1.0, 0.05]], 5, { x, y, z });
const rocketRow = (xs: number[], y: number, z: number) => xs.flatMap((x) => mirror(x, (xx) => rocketAt(xx, y, z)));
/** Atılabilir yakıt tankı. */
const tankAt = (y: number, z: number, x = 0, s = 1) => body([[1.5 * s, 0], [1.1 * s, 0.3 * s], [-1.0 * s, 0.3 * s], [-1.7 * s, 0]], 6, { x, y, z });

interface PropDef { z: number; r: number; blades: number; x?: number; y?: number }

interface ModelDef {
  solids: Geo[];
  props: PropDef[];
  bombs?: Geo[];
  rockets?: Geo[];
  tank?: Geo[];
}

interface FuseOpts {
  noseZ: number;
  tailZ: number;
  r: number;
  sy?: number;
  sx?: number;
  /** Burun yarıçap oranı: 0.35 sivri sıra motor, 0.9 küt. */
  noseR?: number;
  /** En kalın noktanın burundan oranı. */
  peak?: number;
}

/** Gövde: burundan kuyruğa incelen dönel gövde. */
function fuselage(o: FuseOpts): Geo {
  const { noseZ: n, tailZ: t, r } = o;
  const L = n - t;
  const pk = o.peak ?? 0.35;
  return body(
    [[n, r * (o.noseR ?? 0.35)], [n - L * 0.05, r * 0.75], [n - L * pk * 0.6, r * 0.95], [n - L * pk, r], [n - L * 0.68, r * 0.62], [t + L * 0.04, r * 0.22], [t, r * 0.1]],
    8, { sy: o.sy ?? 1.18, sx: o.sx ?? 1 },
  );
}

const spinner = (z: number, r: number, len = 0.55, y = 0, x = 0) => tag(body([[z + len, 0], [z + len * 0.45, r * 0.8], [z, r]], 8, { x, y }), 'dark');

/** Camlı (sera) burun. */
const glassNose = (z: number, r: number, len: number, sy = 1.1) =>
  tag(body([[z + len, 0], [z + len * 0.8, r * 0.55], [z + len * 0.45, r * 0.88], [z, r]], 9, { sy }), 'glass');

/** Jet burun hava alığı (halka). */
const intake = (z: number, r: number) => tag(body([[z, r * 0.62], [z - 0.15, r * 0.82], [z - 0.8, r]], 10), 'dark');

function defineModel(key: string): ModelDef {
  switch (key) {
    // ================================================================ İngiliz avcıları
    case 'hurricane':
      return {
        solids: [
          fuselage({ noseZ: 4.3, tailZ: -5.5, r: 0.78, sy: 1.25, noseR: 0.4, peak: 0.42 }),
          spinner(4.3, 0.3),
          canopy(0.5, 1.8, 0.45, 0.82, 0.4),
          box(0.7, 0.5, 1.6, 0, -0.95, -0.4),
          ...wing({ x0: 0.6, z: 1.7, root: 2.6, y: -0.55, tipX: 6.1, tip: 1.3, sweep: 0.6, dihedral: 6, t: 0.42, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -4.2, root: 1.2, y: 0.25, tipX: 1.9, tip: 0.7, sweep: 0.4, dihedral: 0, t: 0.14, shape: 'rounded' }),
          ...fins({ y0: 0.5, z0: -3.9, h: 1.7, root: 1.6, tip: 0.8, sweep: 0.9, t: 0.14 }),
        ],
        props: [{ z: 4.75, r: 1.6, blades: 3 }],
        tank: mirror(2.2, (x) => tankAt(-0.85, 0.9, x, 0.7)),
      };
    case 'spitfire':
    case 'spitfire9': {
      const n9 = key === 'spitfire9';
      const nose = n9 ? 4.55 : 4.2;
      return {
        solids: [
          fuselage({ noseZ: nose, tailZ: -5.0, r: 0.62, sy: 1.28, noseR: 0.42 }),
          spinner(nose, 0.27, 0.6),
          canopy(0.35, 1.5, 0.42, 0.66, 0.38),
          ...wing({ x0: 0.45, z: 1.6, root: 2.5, y: -0.45, tipX: 5.6, tip: 0.4, sweep: 0.3, dihedral: 6, t: 0.34, shape: 'elliptic' }),
          ...(n9 ? mirror(1.6, (x) => box(0.45, 0.3, 1.1, x, -0.72, 0.3)) : [box(0.45, 0.3, 1.1, 1.6, -0.72, 0.3), box(0.4, 0.25, 0.8, -1.6, -0.7, 0.4)]),
          ...wing({ x0: 0.1, z: -3.9, root: 1.05, y: 0.15, tipX: 1.6, tip: 0.35, sweep: 0.35, dihedral: 0, t: 0.12, shape: 'elliptic' }),
          ...fins({ y0: 0.35, z0: -3.7, h: 1.5, root: 1.3, tip: 0.6, sweep: 0.75, t: 0.12 }),
        ],
        props: [{ z: nose + 0.45, r: 1.65, blades: n9 ? 4 : 3 }],
        tank: [tankAt(-0.85, 0.6, 0, 0.8)],
        bombs: n9 ? [bombAt(0, -0.95, 0.5, 1.2)] : undefined,
      };
    }
    case 'typhoon':
      return {
        solids: [
          fuselage({ noseZ: 4.4, tailZ: -5.3, r: 0.82, sy: 1.18, noseR: 0.45, peak: 0.4 }),
          spinner(4.4, 0.34, 0.6),
          // Büyük çene radyatörü
          box(0.95, 0.75, 1.7, 0, -0.95, 3.0),
          canopy(0.6, 1.6, 0.44, 0.86, 0.42, true),
          ...wing({ x0: 0.7, z: 1.9, root: 2.9, y: -0.55, tipX: 6.3, tip: 1.4, sweep: 0.5, dihedral: 6, t: 0.5, shape: 'gull', breakAt: 0.25, innerDihedral: 0 }),
          ...wing({ x0: 0.1, z: -4.1, root: 1.3, y: 0.25, tipX: 2.2, tip: 0.7, sweep: 0.4, dihedral: 0, t: 0.14, shape: 'rounded' }),
          ...fins({ y0: 0.5, z0: -3.8, h: 1.8, root: 1.6, tip: 0.8, sweep: 0.8, t: 0.14 }),
        ],
        props: [{ z: 4.9, r: 2.0, blades: 4 }],
        rockets: rocketRow([3.0, 3.5, 4.0, 4.5], -0.85, 1.4),
        bombs: mirror(2.4, (x) => bombAt(x, -0.9, 1.0, 1.3)),
      };
    case 'meteor':
      return {
        solids: [
          fuselage({ noseZ: 6.0, tailZ: -6.5, r: 0.78, sy: 1.1, noseR: 0.3, peak: 0.4 }),
          canopy(2.6, 2.0, 0.48, 0.78, 0.45, true),
          ...wing({ x0: 0.7, z: 1.6, root: 3.6, y: -0.15, tipX: 6.55, tip: 1.3, sweep: 0.7, dihedral: 4, t: 0.42, shape: 'rounded' }),
          ...mirror(2.3, (x) => jetPod(x, -0.15, 2.2, 4.4, 0.62)),
          ...fins({ y0: 0.5, z0: -4.4, h: 2.2, root: 2.0, tip: 1.0, sweep: 0.9, t: 0.14 }),
          ...wing({ x0: 0.05, z: -5.0, root: 1.3, y: 1.7, tipX: 2.5, tip: 0.7, sweep: 0.4, dihedral: 0, t: 0.12 }),
        ],
        props: [],
        tank: [tankAt(-0.95, 0.4, 0, 1.0)],
      };
    case 'sabre':
      return {
        solids: [
          intake(5.6, 0.62),
          fuselage({ noseZ: 4.9, tailZ: -5.8, r: 0.8, sy: 1.08, noseR: 0.85, peak: 0.25 }),
          canopy(2.8, 1.8, 0.5, 0.78, 0.45, true),
          ...wing({ x0: 0.7, z: 1.5, root: 3.6, y: -0.35, tipX: 5.65, tip: 1.5, sweep: 3.2, dihedral: 3, t: 0.3 }),
          ...wing({ x0: 0.2, z: -3.9, root: 1.6, y: 0.2, tipX: 1.9, tip: 0.7, sweep: 1.3, dihedral: 8, t: 0.1 }),
          ...fins({ y0: 0.55, z0: -2.7, h: 2.3, root: 2.6, tip: 1.0, sweep: 2.2, t: 0.14 }),
        ],
        props: [],
        tank: mirror(2.4, (x) => tankAt(-0.6, 1.0, x, 0.85)),
        bombs: mirror(2.4, (x) => bombAt(x, -0.7, 1.0, 1.4)),
      };
    // ================================================================ Alman ve Amerikan avcıları
    case 'bf109e':
    case 'bf109f':
    case 'bf109g': {
      const late = key !== 'bf109e';
      const shape: WingOpts['shape'] = late ? 'rounded' : 'tapered';
      const solids: Geo[] = [
        fuselage({ noseZ: 4.0, tailZ: -4.6, r: 0.6, sy: 1.32, noseR: 0.45, peak: 0.36 }),
        spinner(4.0, late ? 0.36 : 0.3, late ? 0.7 : 0.55),
        canopy(0.5, 1.5, 0.38, 0.7, 0.36),
        ...mirror(1.5, (x) => box(0.4, 0.22, 1.0, x, -0.62, 0.0)),
        ...wing({ x0: 0.42, z: 1.4, root: 2.1, y: -0.5, tipX: 4.93, tip: 1.0, sweep: 0.25, dihedral: 6.5, t: 0.3, shape }),
        ...wing({ x0: 0.08, z: -3.75, root: 1.0, y: 0.45, tipX: 1.5, tip: 0.55, sweep: 0.3, dihedral: 0, t: 0.11, shape }),
        ...fins({ y0: 0.4, z0: -3.4, h: 1.45, root: 1.25, tip: 0.6, sweep: 0.7, t: 0.12 }),
      ];
      if (!late) solids.push(...mirror(0.45, (x) => box(0.05, 0.6, 0.06, x, 0.1, -3.95)));
      if (key === 'bf109g') solids.push(...mirror(0.42, (x) => box(0.2, 0.18, 0.6, x, 0.42, 2.8)));
      return {
        solids,
        props: [{ z: 4.45, r: 1.5, blades: 3 }],
        tank: late ? [tankAt(-0.82, 0.3, 0, 0.75)] : undefined,
        bombs: [bombAt(0, -0.85, 0.4, 1.3)],
        rockets: key === 'bf109g' ? mirror(2.3, (x) => body([[1.0, 0], [0.7, 0.13], [-0.7, 0.13], [-0.9, 0]], 6, { x, y: -0.72, z: 0.8 })) : undefined,
      };
    }
    case 'fw190':
      return {
        solids: [
          ...radialCowl(4.1, 0.66, 1.3),
          fuselage({ noseZ: 2.9, tailZ: -4.85, r: 0.64, sy: 1.15, noseR: 0.98, peak: 0.08 }),
          canopy(0.1, 1.7, 0.42, 0.72, 0.4, true),
          ...wing({ x0: 0.5, z: 1.25, root: 2.3, y: -0.45, tipX: 5.25, tip: 1.15, sweep: 0.15, dihedral: 5, t: 0.3, shape: 'rounded' }),
          ...wing({ x0: 0.08, z: -3.9, root: 1.15, y: 0.25, tipX: 1.8, tip: 0.6, sweep: 0.4, dihedral: 0, t: 0.12 }),
          ...fins({ y0: 0.35, z0: -3.55, h: 1.55, root: 1.3, tip: 0.7, sweep: 0.6, t: 0.13 }),
        ],
        props: [{ z: 4.45, r: 1.65, blades: 3 }],
        bombs: [bombAt(0, -0.9, 0.4, 1.5)],
        tank: [tankAt(-0.85, 0.3, 0, 0.75)],
      };
    case 'p51d':
      return {
        solids: [
          fuselage({ noseZ: 4.5, tailZ: -5.3, r: 0.62, sy: 1.3, noseR: 0.42 }),
          spinner(4.5, 0.32, 0.6),
          canopy(0.15, 1.8, 0.48, 0.7, 0.42, true),
          // Karın soğutucu kanalı
          box(0.72, 0.5, 2.3, 0, -0.95, -1.0),
          ...wing({ x0: 0.5, z: 1.6, root: 2.6, y: -0.48, tipX: 5.64, tip: 1.1, sweep: 0.05, dihedral: 5, t: 0.32 }),
          ...wing({ x0: 0.08, z: -4.05, root: 1.2, y: 0.25, tipX: 2.05, tip: 0.6, sweep: 0.4, dihedral: 0, t: 0.12 }),
          ...fins({ y0: 0.35, z0: -3.4, h: 1.75, root: 1.9, tip: 0.7, sweep: 1.1, t: 0.13 }),
        ],
        props: [{ z: 5.0, r: 1.7, blades: 4 }],
        tank: mirror(2.1, (x) => tankAt(-0.8, 0.9, x, 0.75)),
        bombs: mirror(2.1, (x) => bombAt(x, -0.85, 0.9, 1.2)),
        rockets: rocketRow([2.8, 3.3, 3.8], -0.75, 1.2),
      };
    case 'p47':
      return {
        solids: [
          ...radialCowl(4.6, 0.84, 1.5),
          fuselage({ noseZ: 3.2, tailZ: -6.4, r: 0.85, sy: 1.2, noseR: 0.96, peak: 0.1 }),
          canopy(0.55, 1.9, 0.5, 0.95, 0.44, true),
          ...wing({ x0: 0.7, z: 1.8, root: 2.9, y: -0.6, tipX: 6.2, tip: 0.8, sweep: 0.45, dihedral: 5, t: 0.4, shape: 'elliptic' }),
          ...wing({ x0: 0.1, z: -4.8, root: 1.4, y: 0.3, tipX: 2.25, tip: 0.6, sweep: 0.45, dihedral: 0, t: 0.13, shape: 'elliptic' }),
          ...fins({ y0: 0.5, z0: -4.2, h: 2.0, root: 2.0, tip: 0.8, sweep: 1.1, t: 0.15 }),
        ],
        props: [{ z: 5.0, r: 1.85, blades: 4 }],
        bombs: mirror(2.5, (x) => bombAt(x, -1.0, 1.1, 1.3)),
        rockets: rocketRow([3.1, 3.5, 3.9, 4.3, 4.7], -0.9, 1.4),
        tank: [tankAt(-1.05, 0.6, 0, 0.9)],
      };
    case 'bf110':
      return {
        solids: [
          fuselage({ noseZ: 6.2, tailZ: -6.1, r: 0.62, sy: 1.25, noseR: 0.55, peak: 0.3 }),
          canopy(1.2, 4.4, 0.5, 0.72, 0.42),
          ...wing({ x0: 0.5, z: 1.7, root: 3.2, y: -0.4, tipX: 8.1, tip: 1.3, sweep: 0.8, dihedral: 6, t: 0.42, shape: 'rounded' }),
          ...mirror(2.6, (x) => nacelle(x, -0.2, 3.0, 4.6, 0.55)),
          ...wing({ x0: 0.1, z: -4.8, root: 1.5, y: 0.2, tipX: 3.0, tip: 1.1, sweep: 0.2, dihedral: 0, t: 0.13 }),
          ...fins({ x: 3.0, y0: -0.55, z0: -4.6, h: 1.9, root: 1.4, tip: 1.0, sweep: 0.3, t: 0.13 }),
        ],
        props: [
          { x: 2.6, y: -0.2, z: 3.45, r: 1.5, blades: 3 },
          { x: -2.6, y: -0.2, z: 3.45, r: 1.5, blades: 3 },
        ],
        bombs: mirror(0.35, (x) => bombAt(x, -0.85, 0.9, 1.3)),
        tank: mirror(4.0, (x) => tankAt(-0.75, 1.0, x, 0.8)),
      };
    case 'me262':
      return {
        solids: [
          fuselage({ noseZ: 5.3, tailZ: -5.3, r: 0.78, sy: 1.12, sx: 0.92, noseR: 0.25, peak: 0.42 }),
          canopy(0.6, 2.2, 0.46, 0.8, 0.42),
          ...wing({ x0: 0.6, z: 1.4, root: 3.3, y: -0.45, tipX: 6.3, tip: 1.3, sweep: 1.9, dihedral: 6, t: 0.3 }),
          ...mirror(2.15, (x) => jetPod(x, -0.95, 2.2, 3.9, 0.5)),
          ...wing({ x0: 0.1, z: -3.9, root: 1.3, y: 0.65, tipX: 2.5, tip: 0.7, sweep: 0.7, dihedral: 0, t: 0.12 }),
          ...fins({ y0: 0.5, z0: -3.4, h: 2.0, root: 1.7, tip: 0.9, sweep: 1.0, t: 0.13 }),
        ],
        props: [],
        bombs: mirror(0.3, (x) => bombAt(x, -0.95, 1.0, 1.3)),
      };
    case 'mig15':
      return {
        solids: [
          intake(5.0, 0.55),
          fuselage({ noseZ: 4.3, tailZ: -5.1, r: 0.74, sy: 1.08, noseR: 0.88, peak: 0.28 }),
          canopy(2.2, 1.6, 0.46, 0.72, 0.42, true),
          ...wing({ x0: 0.65, z: 1.4, root: 3.3, y: -0.1, tipX: 5.04, tip: 1.6, sweep: 3.0, dihedral: -2, t: 0.3 }),
          ...fins({ y0: 0.5, z0: -2.4, h: 2.4, root: 2.8, tip: 1.2, sweep: 2.4, t: 0.15 }),
          ...wing({ x0: 0.05, z: -4.35, root: 1.2, y: 2.3, tipX: 1.7, tip: 0.6, sweep: 1.0, dihedral: 0, t: 0.1 }),
        ],
        props: [],
        tank: mirror(2.6, (x) => tankAt(-0.4, 0.6, x, 0.85)),
      };
    case 'f84':
      return {
        solids: [
          intake(5.6, 0.6),
          fuselage({ noseZ: 4.9, tailZ: -6.0, r: 0.82, sy: 1.05, noseR: 0.85, peak: 0.3 }),
          canopy(2.8, 1.9, 0.5, 0.8, 0.46, true),
          ...wing({ x0: 0.7, z: 1.5, root: 3.0, y: -0.3, tipX: 5.55, tip: 1.6, sweep: 0.5, dihedral: 4, t: 0.32 }),
          ...wing({ x0: 0.1, z: -4.4, root: 1.4, y: 0.3, tipX: 2.3, tip: 0.8, sweep: 0.5, dihedral: 0, t: 0.11 }),
          ...fins({ y0: 0.5, z0: -3.7, h: 2.0, root: 2.0, tip: 0.9, sweep: 1.0, t: 0.13 }),
        ],
        props: [],
        tank: mirror(5.7, (x) => tankAt(-0.25, 0.6, x, 1.05)),
        bombs: mirror(2.4, (x) => bombAt(x, -0.75, 1.0, 1.4)),
        rockets: rocketRow([3.0, 3.5, 4.0, 4.5], -0.6, 1.0),
      };
    // ================================================================ Taarruz
    case 'il2':
    case 'il2m3':
    case 'il10': {
      const il10 = key === 'il10';
      return {
        solids: [
          fuselage({ noseZ: il10 ? 5.3 : 5.6, tailZ: il10 ? -5.8 : -6.0, r: 0.78, sy: 1.2, noseR: 0.5, peak: 0.3 }),
          spinner(il10 ? 5.3 : 5.6, 0.34, 0.6),
          // Zırhlı motor ve kokpit küveti
          box(1.45, 1.25, il10 ? 2.6 : 3.4, 0, -0.05, il10 ? 3.3 : 3.6),
          canopy(0.9, key === 'il2' ? 2.0 : 2.8, 0.5, 0.9, 0.44),
          ...wing({ x0: 0.75, z: 1.9, root: il10 ? 2.9 : 3.2, y: -0.5, tipX: il10 ? 6.7 : 7.3, tip: 1.3, sweep: key === 'il2m3' ? 1.9 : il10 ? 0.8 : 1.4, dihedral: 6, t: 0.45, shape: 'rounded' }),
          ...(il10 ? [] : mirror(2.4, (x) => body([[1.8, 0.1], [1.2, 0.36], [-0.8, 0.3], [-1.4, 0.05]], 6, { x, y: -0.75, z: 1.2 }))),
          ...wing({ x0: 0.1, z: -4.4, root: 1.4, y: 0.2, tipX: 2.6, tip: 0.8, sweep: 0.4, dihedral: 0, t: 0.15, shape: 'rounded' }),
          ...fins({ y0: 0.4, z0: -4.1, h: 1.8, root: 1.6, tip: 0.8, sweep: 0.8, t: 0.14 }),
        ],
        props: [{ z: (il10 ? 5.3 : 5.6) + 0.5, r: 1.8, blades: 3 }],
        rockets: rocketRow([3.4, 3.9, 4.4, 4.9], -0.85, 1.2),
        bombs: mirror(1.5, (x) => bombAt(x, -0.95, 0.4)),
      };
    }
    // ================================================================ Pike bombardıman
    case 'ju87b':
    case 'ju87d': {
      const d = key === 'ju87d';
      return {
        solids: [
          fuselage({ noseZ: 5.4, tailZ: -5.7, r: 0.75, sy: 1.22, noseR: 0.55, peak: 0.32 }),
          spinner(5.4, 0.32, 0.5),
          box(0.85, 0.55, 1.2, 0, -0.85, 4.2),
          canopy(0.6, 3.0, 0.5, 0.86, 0.44),
          ...wing({ x0: 0.45, z: 1.6, root: 2.6, y: -0.55, tipX: d ? 7.5 : 6.9, tip: 1.3, sweep: 0.15, dihedral: 9, t: 0.42, shape: 'gull', breakAt: 0.3, innerDihedral: -14 }),
          ...spats(2.25, -2.2, 1.0, d ? 1.1 : 1.35, d ? 0.24 : 0.3, 0.95),
          ...wing({ x0: 0.1, z: -4.2, root: 1.3, y: 0.2, tipX: 2.5, tip: 0.85, sweep: 0.25, dihedral: 0, t: 0.15 }),
          ...mirror(1.3, (x) => box(0.06, 0.9, 0.08, x, -0.25, -4.6)),
          ...fins({ y0: 0.4, z0: -3.95, h: 1.9, root: 1.7, tip: 1.0, sweep: 0.6, t: 0.14 }),
        ],
        props: [{ z: 5.8, r: 1.7, blades: 3 }],
        bombs: [
          body([[1.4, 0], [1.05, 0.26], [0.2, 0.32], [-0.9, 0.26], [-1.3, 0.08]], 6, { y: -1.2, z: 0.6 }),
          ...mirror(3.6, (x) => bombAt(x, -1.15, 1.0, 0.8)),
        ],
      };
    }
    case 'sbd':
    case 'sb2c': {
      const big = key === 'sb2c';
      const n = big ? 5.0 : 4.6;
      return {
        solids: [
          ...radialCowl(n, big ? 0.76 : 0.68, 1.2),
          fuselage({ noseZ: n - 1.1, tailZ: big ? -6.1 : -5.4, r: big ? 0.8 : 0.72, sy: 1.2, noseR: 0.95, peak: 0.12 }),
          canopy(0.4, big ? 3.4 : 3.2, 0.5, big ? 0.92 : 0.84, 0.44),
          ...wing({ x0: 0.65, z: 1.6, root: big ? 3.3 : 3.1, y: -0.55, tipX: big ? 7.6 : 6.33, tip: big ? 1.6 : 1.3, sweep: big ? 0.6 : 1.0, dihedral: 7, t: 0.42, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: big ? -4.7 : -4.1, root: 1.5, y: 0.2, tipX: big ? 2.9 : 2.3, tip: 0.8, sweep: 0.5, dihedral: 0, t: 0.14, shape: 'rounded' }),
          ...fins({ y0: 0.45, z0: big ? -4.2 : -3.8, h: big ? 2.4 : 2.0, root: big ? 2.4 : 1.8, tip: 1.0, sweep: 0.8, t: 0.15 }),
        ],
        props: [{ z: n + 0.35, r: big ? 1.85 : 1.65, blades: 3 }],
        bombs: [body([[1.3, 0], [1.0, 0.25], [0.2, 0.3], [-0.8, 0.25], [-1.2, 0.08]], 6, { y: -1.05, z: 0.6 }), ...(big ? mirror(3.2, (x) => bombAt(x, -1.0, 1.2, 1.1)) : [])],
      };
    }
    // ================================================================ Bombardıman
    case 'he111':
      return {
        solids: [
          glassNose(6.4, 0.98, 1.7),
          fuselage({ noseZ: 6.4, tailZ: -8.4, r: 1.0, sy: 1.2, noseR: 0.98, peak: 0.08 }),
          box(0.8, 0.6, 3.2, 0, -1.25, 0.6),
          dome(0, 1.15, -2.0, 0.42),
          ...wing({ x0: 1.0, z: 2.8, root: 4.9, y: -0.35, tipX: 11.3, tip: 1.4, sweep: 1.6, dihedral: 4.5, t: 0.7, shape: 'elliptic' }),
          ...mirror(4.0, (x) => nacelle(x, -0.3, 3.9, 5.0, 0.78, true)),
          ...wing({ x0: 0.2, z: -6.3, root: 2.4, y: 0.35, tipX: 4.1, tip: 0.9, sweep: 0.8, dihedral: 0, t: 0.2, shape: 'elliptic' }),
          ...fins({ y0: 0.7, z0: -6.0, h: 3.0, root: 2.3, tip: 1.1, sweep: 1.2, t: 0.2 }),
        ],
        props: [{ x: 4.0, y: -0.3, z: 4.4, r: 1.75, blades: 3 }, { x: -4.0, y: -0.3, z: 4.4, r: 1.75, blades: 3 }],
      };
    case 'ju88':
      return {
        solids: [
          fuselage({ noseZ: 7.0, tailZ: -7.4, r: 0.85, sy: 1.15, noseR: 0.55, peak: 0.25 }),
          canopy(4.8, 2.7, 0.7, 0.85, 0.72, true),
          box(0.75, 0.55, 2.4, 0.15, -1.0, 3.1),
          ...wing({ x0: 0.8, z: 2.0, root: 4.2, y: -0.35, tipX: 10.0, tip: 1.6, sweep: 1.6, dihedral: 5, t: 0.6, shape: 'rounded' }),
          ...mirror(2.95, (x) => nacelle(x, -0.3, 3.6, 5.0, 0.78, true)),
          ...wing({ x0: 0.2, z: -5.6, root: 2.1, y: 0.3, tipX: 3.6, tip: 0.9, sweep: 0.6, dihedral: 0, t: 0.18, shape: 'rounded' }),
          ...fins({ y0: 0.6, z0: -5.2, h: 2.8, root: 2.0, tip: 1.2, sweep: 0.8, t: 0.18 }),
        ],
        props: [{ x: 2.95, y: -0.3, z: 4.1, r: 1.7, blades: 3 }, { x: -2.95, y: -0.3, z: 4.1, r: 1.7, blades: 3 }],
        bombs: mirror(1.7, (x) => bombAt(x, -0.85, 2.4, 1.4)),
      };
    case 'b25':
      return {
        solids: [
          glassNose(6.4, 0.85, 1.5),
          fuselage({ noseZ: 6.4, tailZ: -7.9, r: 0.88, sy: 1.2, noseR: 0.95, peak: 0.1 }),
          canopy(4.6, 2.3, 0.55, 0.95, 0.6),
          dome(0, 1.0, 3.0, 0.48),
          ...wing({ x0: 0.9, z: 2.1, root: 4.2, y: 0.0, tipX: 10.3, tip: 1.8, sweep: 1.4, dihedral: -1, t: 0.6, shape: 'gull', breakAt: 0.32, innerDihedral: 5 }),
          ...mirror(3.0, (x) => nacelle(x, 0.1, 3.9, 5.5, 0.78, true)),
          ...wing({ x0: 0.2, z: -6.6, root: 2.1, y: 0.4, tipX: 3.35, tip: 1.7, sweep: 0.3, dihedral: 0, t: 0.18 }),
          ...fins({ x: 3.35, y0: -0.8, z0: -6.4, h: 2.6, root: 1.6, tip: 1.2, sweep: 0.3, t: 0.16 }),
        ],
        props: [{ x: 3.0, y: 0.1, z: 4.4, r: 1.9, blades: 3 }, { x: -3.0, y: 0.1, z: 4.4, r: 1.9, blades: 3 }],
      };
    case 'b17':
      return {
        solids: [
          glassNose(9.0, 1.05, 1.6),
          fuselage({ noseZ: 9.0, tailZ: -11.6, r: 1.15, sy: 1.18, noseR: 0.95, peak: 0.25 }),
          canopy(6.6, 2.4, 0.6, 1.2, 0.85),
          dome(0, -1.15, 9.3, 0.5),
          dome(0, 1.3, 4.5, 0.6),
          dome(0, -1.3, -1.0, 0.65),
          ...wing({ x0: 1.2, z: 3.6, root: 6.0, y: -0.5, tipX: 15.8, tip: 2.2, sweep: 3.5, dihedral: 4.5, t: 0.85, shape: 'rounded' }),
          ...mirror(3.7, (x) => nacelle(x, -0.3, 5.5, 4.2, 0.78, true)),
          ...mirror(7.7, (x) => nacelle(x, -0.1, 4.6, 3.8, 0.74, true)),
          ...wing({ x0: 0.3, z: -8.7, root: 3.1, y: 0.4, tipX: 6.6, tip: 1.3, sweep: 1.4, dihedral: 0, t: 0.25, shape: 'rounded' }),
          ...fins({ y0: 0.7, z0: -5.4, h: 4.6, root: 5.8, tip: 1.8, sweep: 3.9, t: 0.24 }),
        ],
        props: [
          { x: 3.7, y: -0.3, z: 6.0, r: 1.75, blades: 3 }, { x: -3.7, y: -0.3, z: 6.0, r: 1.75, blades: 3 },
          { x: 7.7, y: -0.1, z: 5.1, r: 1.75, blades: 3 }, { x: -7.7, y: -0.1, z: 5.1, r: 1.75, blades: 3 },
        ],
      };
    // ================================================================ Son pervaneliler
    case 'seafury':
      return {
        solids: [
          ...radialCowl(4.9, 0.74, 1.55),
          spinner(4.9, 0.42, 0.75),
          fuselage({ noseZ: 3.45, tailZ: -5.7, r: 0.72, sy: 1.2, noseR: 0.97, peak: 0.1 }),
          canopy(0.3, 1.6, 0.46, 0.82, 0.42, true),
          // Kanat kökünde yağ soğutucu ağızları
          ...mirror(1.15, (x) => tag(box(0.75, 0.16, 0.3, x, -0.5, 2.0), 'dark')),
          ...wing({ x0: 0.65, z: 2.0, root: 2.8, y: -0.55, tipX: 5.85, tip: 0.6, sweep: 0.5, dihedral: 6, t: 0.4, shape: 'elliptic' }),
          ...wing({ x0: 0.1, z: -4.3, root: 1.3, y: 0.25, tipX: 2.3, tip: 0.5, sweep: 0.4, dihedral: 0, t: 0.13, shape: 'elliptic' }),
          ...fins({ y0: 0.45, z0: -3.9, h: 1.85, root: 1.8, tip: 0.7, sweep: 1.0, t: 0.14 }),
        ],
        props: [{ z: 5.4, r: 1.95, blades: 5 }],
      };
    case 'f8f':
      return {
        solids: [
          ...radialCowl(4.0, 0.76, 1.4),
          fuselage({ noseZ: 2.7, tailZ: -4.6, r: 0.74, sy: 1.18, noseR: 0.97, peak: 0.08 }),
          canopy(0.6, 1.5, 0.5, 0.86, 0.44, true),
          ...wing({ x0: 0.7, z: 1.5, root: 2.6, y: -0.5, tipX: 5.46, tip: 1.2, sweep: 0.25, dihedral: 6, t: 0.36, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -3.7, root: 1.3, y: 0.3, tipX: 2.1, tip: 0.6, sweep: 0.4, dihedral: 0, t: 0.12 }),
          // Küçük gövdeye uzun dikey kuyruk
          ...fins({ y0: 0.45, z0: -3.15, h: 2.05, root: 1.95, tip: 0.8, sweep: 1.15, t: 0.14 }),
        ],
        props: [{ z: 4.45, r: 1.9, blades: 4 }],
      };
    case 'f4u':
      return {
        solids: [
          ...radialCowl(4.7, 0.72, 1.3),
          fuselage({ noseZ: 3.5, tailZ: -5.6, r: 0.72, sy: 1.22, noseR: 0.97, peak: 0.1 }),
          // Uzun burun: kokpit geride
          canopy(-0.6, 1.7, 0.46, 0.82, 0.4),
          ...mirror(1.3, (x) => tag(box(1.0, 0.16, 0.25, x, -0.62, 2.3), 'dark')),
          // Ters martı kanat
          ...wing({ x0: 0.6, z: 2.3, root: 2.9, y: -0.4, tipX: 6.25, tip: 1.3, sweep: 0.3, dihedral: 9, t: 0.42, shape: 'gull', breakAt: 0.3, innerDihedral: -16 }),
          ...wing({ x0: 0.1, z: -4.3, root: 1.4, y: 0.3, tipX: 2.6, tip: 0.6, sweep: 0.45, dihedral: 0, t: 0.13, shape: 'rounded' }),
          ...fins({ y0: 0.45, z0: -3.8, h: 1.9, root: 1.8, tip: 0.8, sweep: 1.0, t: 0.14 }),
        ],
        props: [{ z: 5.15, r: 2.0, blades: 4 }],
      };
    case 'ad4':
      return {
        solids: [
          ...radialCowl(5.4, 0.84, 1.5),
          fuselage({ noseZ: 4.0, tailZ: -6.4, r: 0.86, sy: 1.25, noseR: 0.96, peak: 0.1 }),
          canopy(1.6, 2.1, 0.5, 1.02, 0.46, true),
          // Gövde yanı hava frenleri
          ...mirror(0.66, (x) => tag(box(0.06, 0.8, 1.0, x, -0.1, -1.5), 'dark')),
          // Düz, kalın kanat (çok askılı)
          ...wing({ x0: 0.8, z: 2.4, root: 3.4, y: -0.6, tipX: 7.6, tip: 1.6, sweep: 0.5, dihedral: 6, t: 0.5, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -4.9, root: 1.7, y: 0.3, tipX: 3.0, tip: 0.8, sweep: 0.4, dihedral: 0, t: 0.15 }),
          ...fins({ y0: 0.5, z0: -4.1, h: 2.7, root: 2.5, tip: 1.0, sweep: 1.25, t: 0.16 }),
        ],
        props: [{ z: 5.85, r: 2.05, blades: 4 }],
      };
    case 'a26':
      return {
        solids: [
          fuselage({ noseZ: 7.3, tailZ: -7.9, r: 0.8, sy: 1.3, noseR: 0.5, peak: 0.28 }),
          // Burunda sekiz makineli
          ...[0.13, 0.3].flatMap((x) => mirror(x, (xx) => tag(box(0.07, 0.07, 0.55, xx, x > 0.2 ? -0.05 : 0.15, 7.35), 'dark'))),
          canopy(3.6, 2.4, 0.55, 0.98, 0.55, true),
          dome(0, 1.15, -1.0, 0.42),
          dome(0, -1.1, -3.0, 0.4),
          ...wing({ x0: 0.8, z: 2.3, root: 4.0, y: 0.1, tipX: 10.67, tip: 1.5, sweep: 1.4, dihedral: 4, t: 0.6, shape: 'rounded' }),
          ...mirror(3.1, (x) => nacelle(x, -0.1, 3.7, 5.3, 0.8, true)),
          ...wing({ x0: 0.15, z: -6.3, root: 2.2, y: 0.5, tipX: 4.0, tip: 1.0, sweep: 0.6, dihedral: 7, t: 0.17 }),
          ...fins({ y0: 0.7, z0: -5.6, h: 2.8, root: 2.6, tip: 1.1, sweep: 1.2, t: 0.18 }),
        ],
        props: [{ x: 3.1, y: -0.1, z: 4.2, r: 1.9, blades: 3 }, { x: -3.1, y: -0.1, z: 4.2, r: 1.9, blades: 3 }],
      };
    case 'b29': {
      const inner = 5.0;
      const outer = 10.5;
      return {
        solids: [
          // Basınçlı, silindir gövde ve basamaksız camlı burun
          glassNose(13.0, 1.45, 2.0, 1.0),
          body([[13.0, 1.45], [9.0, 1.45], [-6.0, 1.45], [-10.5, 1.15], [-14.2, 0.55], [-14.9, 0.4]], 10),
          tag(body([[-14.6, 0.48], [-15.2, 0.32], [-15.5, 0]], 7), 'glass'),
          dome(0, 1.42, 9.0, 0.5),
          dome(0, 1.42, -6.0, 0.5),
          dome(0, -1.42, 7.0, 0.5),
          dome(0, -1.42, -5.0, 0.5),
          // Yüksek açıklık oranlı uzun kanat
          ...wing({ x0: 1.3, z: 4.2, root: 5.8, y: -0.3, tipX: 21.5, tip: 1.9, sweep: 2.6, dihedral: 4.5, t: 0.9 }),
          ...mirror(inner, (x) => nacelle(x, -0.2, 6.4, 6.6, 0.82, true)),
          ...mirror(outer, (x) => nacelle(x, 0.25, 5.7, 5.6, 0.8, true)),
          ...wing({ x0: 0.4, z: -10.6, root: 3.6, y: 0.5, tipX: 6.6, tip: 1.6, sweep: 1.5, dihedral: 0, t: 0.28 }),
          // Dev dikey kuyruk (sırt yüzgeciyle)
          ...fins({ y0: 1.0, z0: -7.4, h: 5.7, root: 7.0, tip: 2.0, sweep: 4.8, t: 0.28 }),
        ],
        props: [
          { x: inner, y: -0.2, z: 6.9, r: 2.5, blades: 4 }, { x: -inner, y: -0.2, z: 6.9, r: 2.5, blades: 4 },
          { x: outer, y: 0.25, z: 6.2, r: 2.5, blades: 4 }, { x: -outer, y: 0.25, z: 6.2, r: 2.5, blades: 4 },
        ],
      };
    }
    case 'canberra':
      return {
        solids: [
          fuselage({ noseZ: 9.8, tailZ: -10.0, r: 0.98, sy: 1.05, noseR: 0.3, peak: 0.35 }),
          canopy(6.6, 2.0, 0.55, 0.92, 0.5, true),
          ...wing({ x0: 1.0, z: 3.5, root: 6.5, y: 0, tipX: 9.75, tip: 2.6, sweep: 3.0, dihedral: 2, t: 0.6, shape: 'rounded' }),
          ...mirror(3.4, (x) => jetPod(x, 0, 2.7, 6.0, 0.82)),
          ...fins({ y0: 0.6, z0: -6.4, h: 3.0, root: 3.0, tip: 1.3, sweep: 2.0, t: 0.18 }),
          ...wing({ x0: 0.1, z: -7.6, root: 2.4, y: 1.1, tipX: 4.25, tip: 1.0, sweep: 1.0, dihedral: 10, t: 0.16 }),
        ],
        props: [],
      };
    // ================================================================ Çeşitlilik: pervaneliler
    case 'i16':
      return {
        solids: [
          ...radialCowl(2.75, 0.68, 1.1),
          // Kısa, fıçı gövde
          fuselage({ noseZ: 1.75, tailZ: -3.6, r: 0.7, sy: 1.12, noseR: 0.98, peak: 0.1 }),
          canopy(-0.25, 1.0, 0.34, 0.74, 0.36),
          ...wing({ x0: 0.6, z: 1.3, root: 2.3, y: -0.4, tipX: 4.5, tip: 1.2, sweep: 0.4, dihedral: 3, t: 0.34, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -2.55, root: 1.1, y: 0.15, tipX: 1.6, tip: 0.6, sweep: 0.35, dihedral: 0, t: 0.11, shape: 'rounded' }),
          ...fins({ y0: 0.4, z0: -2.35, h: 1.3, root: 1.2, tip: 0.6, sweep: 0.6, t: 0.12 }),
        ],
        props: [{ z: 3.1, r: 1.4, blades: 2 }],
      };
    case 'a6m':
      return {
        solids: [
          ...radialCowl(3.7, 0.64, 1.2),
          fuselage({ noseZ: 2.6, tailZ: -5.4, r: 0.62, sy: 1.18, noseR: 0.97, peak: 0.12 }),
          // Uzun, çerçeveli kanopi
          canopy(0.1, 2.6, 0.42, 0.68, 0.4),
          ...wing({ x0: 0.6, z: 1.6, root: 2.6, y: -0.45, tipX: 6.0, tip: 1.1, sweep: 0.5, dihedral: 6, t: 0.34, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -4.1, root: 1.2, y: 0.2, tipX: 2.4, tip: 0.6, sweep: 0.45, dihedral: 0, t: 0.11, shape: 'rounded' }),
          ...fins({ y0: 0.4, z0: -3.7, h: 1.6, root: 1.6, tip: 0.7, sweep: 0.9, t: 0.12 }),
        ],
        props: [{ z: 4.05, r: 1.45, blades: 3 }],
      };
    case 'blenheim':
      return {
        solids: [
          // Kısa camlı burun ve hemen arkasında kokpit
          glassNose(4.6, 0.78, 0.8),
          fuselage({ noseZ: 4.6, tailZ: -7.9, r: 0.82, sy: 1.15, noseR: 0.95, peak: 0.12 }),
          canopy(3.9, 1.5, 0.4, 0.78, 0.6),
          dome(0, 0.92, -1.8, 0.45),
          ...wing({ x0: 0.9, z: 2.3, root: 3.6, y: -0.4, tipX: 8.58, tip: 1.3, sweep: 1.2, dihedral: 6, t: 0.55, shape: 'rounded' }),
          ...mirror(2.65, (x) => nacelle(x, -0.2, 3.7, 4.2, 0.72, true)),
          ...wing({ x0: 0.15, z: -5.9, root: 1.8, y: 0.3, tipX: 3.4, tip: 1.0, sweep: 0.4, dihedral: 0, t: 0.16, shape: 'rounded' }),
          ...fins({ y0: 0.6, z0: -5.5, h: 2.2, root: 2.0, tip: 1.0, sweep: 0.9, t: 0.16 }),
        ],
        props: [{ x: 2.65, y: -0.2, z: 4.2, r: 1.6, blades: 3 }, { x: -2.65, y: -0.2, z: 4.2, r: 1.6, blades: 3 }],
      };
    case 'p40':
      return {
        solids: [
          fuselage({ noseZ: 4.6, tailZ: -5.1, r: 0.64, sy: 1.3, noseR: 0.45, peak: 0.38 }),
          spinner(4.6, 0.3, 0.6),
          // Derin çene radyatörü ("köpekbalığı ağzı")
          box(0.9, 0.7, 1.6, 0, -0.85, 3.3),
          tag(box(0.7, 0.4, 0.1, 0, -0.85, 4.1), 'dark'),
          canopy(0.2, 1.7, 0.42, 0.72, 0.4),
          ...wing({ x0: 0.55, z: 1.7, root: 2.6, y: -0.5, tipX: 5.69, tip: 1.2, sweep: 0.5, dihedral: 6, t: 0.36, shape: 'rounded' }),
          ...wing({ x0: 0.08, z: -4.0, root: 1.2, y: 0.25, tipX: 2.05, tip: 0.6, sweep: 0.4, dihedral: 0, t: 0.12, shape: 'rounded' }),
          ...fins({ y0: 0.4, z0: -3.5, h: 1.75, root: 1.7, tip: 0.8, sweep: 0.9, t: 0.13 }),
        ],
        props: [{ z: 5.05, r: 1.7, blades: 3 }],
      };
    case 'pe2':
      return {
        solids: [
          glassNose(5.9, 0.62, 0.7),
          fuselage({ noseZ: 5.9, tailZ: -6.5, r: 0.7, sy: 1.2, noseR: 0.85, peak: 0.25 }),
          // Pilot ve nişancının uzun ortak kanopisi
          canopy(3.4, 2.8, 0.5, 0.78, 0.5),
          ...wing({ x0: 0.7, z: 2.0, root: 3.1, y: -0.3, tipX: 8.58, tip: 1.2, sweep: 1.0, dihedral: 6, t: 0.45 }),
          ...mirror(2.6, (x) => nacelle(x, -0.15, 3.4, 5.0, 0.62)),
          // Dihedralli yatay kuyruk, uçlarında ikiz dikey kuyruk
          ...wing({ x0: 0.1, z: -5.2, root: 1.5, y: 0.45, tipX: 2.9, tip: 1.1, sweep: 0.3, dihedral: 8, t: 0.14 }),
          ...fins({ x: 2.9, y0: 0.25, z0: -5.1, h: 1.6, root: 1.3, tip: 0.9, sweep: 0.2, t: 0.12 }),
        ],
        props: [{ x: 2.6, y: -0.15, z: 3.85, r: 1.55, blades: 3 }, { x: -2.6, y: -0.15, z: 3.85, r: 1.55, blades: 3 }],
      };
    case 'yak3':
      return {
        solids: [
          fuselage({ noseZ: 4.1, tailZ: -4.4, r: 0.58, sy: 1.3, noseR: 0.42, peak: 0.36 }),
          spinner(4.1, 0.28, 0.6),
          canopy(0.1, 1.5, 0.42, 0.68, 0.38, true),
          // Kanat altı karın radyatörü
          box(0.7, 0.42, 1.8, 0, -0.85, 0.2),
          ...wing({ x0: 0.45, z: 1.5, root: 2.2, y: -0.45, tipX: 4.6, tip: 1.0, sweep: 0.4, dihedral: 6, t: 0.3, shape: 'rounded' }),
          ...wing({ x0: 0.08, z: -3.5, root: 1.0, y: 0.25, tipX: 1.6, tip: 0.55, sweep: 0.35, dihedral: 0, t: 0.11, shape: 'rounded' }),
          ...fins({ y0: 0.35, z0: -3.15, h: 1.45, root: 1.3, tip: 0.65, sweep: 0.7, t: 0.12 }),
        ],
        props: [{ z: 4.55, r: 1.5, blades: 3 }],
      };
    case 'la7':
      return {
        solids: [
          ...radialCowl(4.0, 0.66, 1.3),
          fuselage({ noseZ: 2.8, tailZ: -4.6, r: 0.64, sy: 1.18, noseR: 0.97, peak: 0.1 }),
          canopy(0.1, 1.6, 0.42, 0.74, 0.4, true),
          box(0.5, 0.35, 1.0, 0, -0.8, -0.6),
          ...wing({ x0: 0.5, z: 1.4, root: 2.3, y: -0.45, tipX: 4.9, tip: 1.0, sweep: 0.4, dihedral: 6, t: 0.32, shape: 'rounded' }),
          ...wing({ x0: 0.08, z: -3.7, root: 1.1, y: 0.25, tipX: 1.75, tip: 0.55, sweep: 0.35, dihedral: 0, t: 0.11, shape: 'rounded' }),
          ...fins({ y0: 0.35, z0: -3.35, h: 1.5, root: 1.3, tip: 0.65, sweep: 0.7, t: 0.12 }),
        ],
        props: [{ z: 4.35, r: 1.55, blades: 3 }],
      };
    case 'p38': {
      const bx = 2.95;
      return {
        solids: [
          // Orta gondol: kokpit ve burunda toplanmış silahlar
          body([[4.2, 0.12], [3.8, 0.45], [2.8, 0.7], [0.5, 0.75], [-1.2, 0.62], [-2.2, 0.25]], 9, { sy: 1.1 }),
          canopy(1.2, 1.9, 0.48, 0.72, 0.44, true),
          // Motor naselleriyle bütün kuyruk kirişleri
          ...mirror(bx, (x) => body([[4.0, 0.25], [3.6, 0.6], [2.5, 0.68], [0.5, 0.62], [-2.0, 0.45], [-5.5, 0.32], [-7.2, 0.28], [-7.6, 0.1]], 8, { x, sy: 1.15 })),
          ...mirror(bx, (x) => spinner(4.0, 0.3, 0.55, 0, x)),
          // Turbo süperşarjlar
          ...mirror(bx, (x) => box(0.4, 0.22, 0.9, x, 0.68, -0.6)),
          ...wing({ x0: 0.5, z: 1.6, root: 3.1, y: -0.25, tipX: 7.92, tip: 1.0, sweep: 0.9, dihedral: 4, t: 0.42 }),
          // Kirişler arasında yatay kuyruk
          ...wing({ x0: 0.05, z: -6.0, root: 1.4, y: 0.25, tipX: bx + 0.3, tip: 1.3, sweep: 0, dihedral: 0, t: 0.14 }),
          ...fins({ x: bx, y0: -0.3, z0: -5.8, h: 2.0, root: 1.7, tip: 1.0, sweep: 0.3, t: 0.13 }),
        ],
        props: [{ x: bx, y: 0, z: 4.6, r: 1.75, blades: 3 }, { x: -bx, y: 0, z: 4.6, r: 1.75, blades: 3 }],
      };
    }
    case 'f6f':
      return {
        solids: [
          ...radialCowl(4.5, 0.84, 1.45),
          // Kaporta altı hava alıkları
          tag(box(0.9, 0.28, 0.35, 0, -0.72, 4.25), 'dark'),
          fuselage({ noseZ: 3.15, tailZ: -5.6, r: 0.84, sy: 1.25, noseR: 0.96, peak: 0.12 }),
          canopy(0.5, 1.9, 0.48, 1.0, 0.42),
          ...wing({ x0: 0.75, z: 1.9, root: 3.0, y: -0.75, tipX: 6.53, tip: 1.5, sweep: 0.45, dihedral: 7, t: 0.44, shape: 'rounded' }),
          ...wing({ x0: 0.1, z: -4.3, root: 1.5, y: 0.25, tipX: 2.6, tip: 0.7, sweep: 0.45, dihedral: 0, t: 0.13, shape: 'rounded' }),
          ...fins({ y0: 0.55, z0: -3.8, h: 2.0, root: 2.0, tip: 0.8, sweep: 1.0, t: 0.15 }),
        ],
        props: [{ z: 4.9, r: 2.0, blades: 3 }],
      };
    case 'lancaster': {
      const inner = 4.0;
      const outer = 8.4;
      return {
        solids: [
          glassNose(9.0, 0.6, 0.9, 1.35),
          fuselage({ noseZ: 9.0, tailZ: -11.4, r: 1.0, sy: 1.35, noseR: 0.6, peak: 0.15 }),
          canopy(6.2, 2.6, 0.6, 1.25, 0.7),
          dome(0, 1.3, 0.5, 0.5),
          // Kuyruk tareti
          tag(body([[-11.2, 0.5], [-11.8, 0.42], [-12.2, 0]], 7, { y: 0.35 }), 'glass'),
          // Uzun bomba bölmesi
          box(1.2, 0.35, 10.0, 0, -1.25, 2.0),
          ...wing({ x0: 1.1, z: 3.6, root: 5.3, y: -0.2, tipX: 15.55, tip: 1.8, sweep: 2.5, dihedral: 4, t: 0.85, shape: 'rounded' }),
          ...mirror(inner, (x) => nacelle(x, -0.3, 5.4, 5.2, 0.72)),
          ...mirror(outer, (x) => nacelle(x, -0.15, 4.9, 4.6, 0.7)),
          ...wing({ x0: 0.3, z: -8.8, root: 2.6, y: 0.4, tipX: 5.0, tip: 2.2, sweep: 0.3, dihedral: 0, t: 0.24 }),
          // Oval ikiz dikey kuyruklar
          ...fins({ x: 5.0, y0: -0.5, z0: -8.5, h: 3.0, root: 2.3, tip: 1.8, sweep: 0.2, t: 0.18 }),
        ],
        props: [
          { x: inner, y: -0.3, z: 5.85, r: 1.6, blades: 3 }, { x: -inner, y: -0.3, z: 5.85, r: 1.6, blades: 3 },
          { x: outer, y: -0.15, z: 5.35, r: 1.6, blades: 3 }, { x: -outer, y: -0.15, z: 5.35, r: 1.6, blades: 3 },
        ],
      };
    }
    case 'mosquito':
      return {
        solids: [
          fuselage({ noseZ: 6.0, tailZ: -6.4, r: 0.72, sy: 1.25, noseR: 0.5, peak: 0.3 }),
          // Burunda dört makineli
          ...mirror(0.12, (x) => tag(box(0.06, 0.06, 0.5, x, 0.2, 6.0), 'dark')),
          canopy(3.4, 1.9, 0.5, 0.78, 0.55),
          ...wing({ x0: 0.7, z: 2.1, root: 3.6, y: -0.15, tipX: 8.26, tip: 1.3, sweep: 1.3, dihedral: 2, t: 0.5, shape: 'rounded' }),
          ...mirror(2.45, (x) => nacelle(x, -0.15, 3.9, 4.8, 0.62)),
          ...wing({ x0: 0.1, z: -4.9, root: 1.8, y: 0.3, tipX: 3.0, tip: 0.9, sweep: 0.5, dihedral: 0, t: 0.15, shape: 'rounded' }),
          ...fins({ y0: 0.5, z0: -4.6, h: 2.3, root: 2.2, tip: 0.9, sweep: 1.1, t: 0.15 }),
        ],
        props: [{ x: 2.45, y: -0.15, z: 4.35, r: 1.65, blades: 3 }, { x: -2.45, y: -0.15, z: 4.35, r: 1.65, blades: 3 }],
      };
    // ================================================================ Çeşitlilik: ilk nesil jetler
    case 'he162':
      return {
        solids: [
          fuselage({ noseZ: 4.3, tailZ: -4.6, r: 0.6, sy: 1.15, noseR: 0.35, peak: 0.4 }),
          canopy(2.0, 1.6, 0.42, 0.62, 0.4, true),
          // Sırtta tek motor
          jetPod(0, 1.05, 1.0, 3.9, 0.45),
          tag(body([[1.02, 0.3], [0.9, 0.4], [0.5, 0.44]], 9, { y: 1.05 }), 'dark'),
          ...wing({ x0: 0.5, z: 1.4, root: 2.3, y: 0.2, tipX: 3.6, tip: 1.2, sweep: 0.4, dihedral: 3, t: 0.28 }),
          // Ters dihedralli yatay kuyruk, uçlarında ikiz dikey kuyruk
          ...wing({ x0: 0.1, z: -3.6, root: 1.2, y: 0.55, tipX: 1.6, tip: 0.85, sweep: 0.3, dihedral: -14, t: 0.11 }),
          ...fins({ x: 1.6, y0: 0.15, z0: -3.55, h: 1.15, root: 1.0, tip: 0.7, sweep: 0.3, t: 0.1 }),
        ],
        props: [],
      };
    case 'p80':
      return {
        solids: [
          fuselage({ noseZ: 5.3, tailZ: -5.3, r: 0.75, sy: 1.12, noseR: 0.3, peak: 0.42 }),
          tag(body([[-5.0, 0.4], [-5.4, 0.36]], 8), 'dark'),
          canopy(2.6, 1.9, 0.48, 0.76, 0.44, true),
          // Gövde yanı hava alıkları
          ...mirror(0.72, (x) => body([[2.2, 0.32], [1.7, 0.4], [-0.5, 0.3], [-1.2, 0.05]], 7, { x, y: -0.05 })),
          ...mirror(0.72, (x) => tag(body([[2.25, 0.2], [2.15, 0.27], [1.9, 0.3]], 7, { x, y: -0.05 }), 'dark')),
          ...wing({ x0: 0.7, z: 1.3, root: 3.1, y: -0.45, tipX: 5.9, tip: 1.3, sweep: 0.5, dihedral: 4, t: 0.36 }),
          ...wing({ x0: 0.1, z: -3.9, root: 1.5, y: 0.25, tipX: 2.4, tip: 0.8, sweep: 0.5, dihedral: 0, t: 0.11 }),
          ...fins({ y0: 0.5, z0: -3.2, h: 2.0, root: 2.0, tip: 0.8, sweep: 1.1, t: 0.13 }),
        ],
        props: [],
      };
    case 'vampire': {
      const bx = 1.75;
      return {
        solids: [
          // Kısa gövde kapsülü: kokpit önde, motor arkada
          body([[3.6, 0], [3.3, 0.38], [2.4, 0.7], [0.5, 0.82], [-1.6, 0.78], [-2.6, 0.55], [-2.9, 0.48]], 9, { sy: 1.1 }),
          tag(body([[-2.85, 0.45], [-3.05, 0.4]], 8), 'dark'),
          canopy(1.9, 1.5, 0.45, 0.8, 0.42, true),
          // Kanat kökü hava alıkları
          ...mirror(0.95, (x) => tag(box(0.5, 0.2, 0.3, x, -0.05, 1.55), 'dark')),
          ...wing({ x0: 0.7, z: 1.6, root: 3.3, y: -0.05, tipX: 5.79, tip: 1.3, sweep: 0.9, dihedral: 2, t: 0.36 }),
          // İnce kuyruk kirişleri
          ...mirror(bx, (x) => body([[0.5, 0.25], [-1.0, 0.22], [-5.0, 0.16], [-5.6, 0.1]], 6, { x, y: 0.05 })),
          ...fins({ x: bx, y0: 0.0, z0: -4.4, h: 1.6, root: 1.4, tip: 0.8, sweep: 0.4, t: 0.1 }),
          ...wing({ x0: 0.05, z: -4.8, root: 1.1, y: 0.75, tipX: bx + 0.1, tip: 1.1, sweep: 0, dihedral: 0, t: 0.1 }),
        ],
        props: [],
      };
    }
    case 'ar234':
      return {
        solids: [
          fuselage({ noseZ: 5.8, tailZ: -6.6, r: 0.72, sy: 1.25, noseR: 0.7, peak: 0.12 }),
          // Tamamen camlı burun kokpiti
          tag(body([[6.6, 0], [6.35, 0.35], [5.7, 0.55]], 9, { sy: 1.25 }), 'glass'),
          // Yüksek kanat, altında iki motor
          ...wing({ x0: 0.6, z: 1.5, root: 3.0, y: 0.45, tipX: 7.2, tip: 1.3, sweep: 0.5, dihedral: 2, t: 0.38 }),
          ...mirror(2.9, (x) => jetPod(x, -0.2, 2.6, 4.2, 0.48)),
          ...mirror(2.9, (x) => tag(body([[2.65, 0.32], [2.5, 0.38], [2.2, 0.4]], 9, { x, y: -0.2 }), 'dark')),
          ...wing({ x0: 0.1, z: -4.9, root: 1.6, y: 0.4, tipX: 2.6, tip: 0.8, sweep: 0.5, dihedral: 0, t: 0.12 }),
          ...fins({ y0: 0.5, z0: -4.4, h: 2.0, root: 2.0, tip: 0.9, sweep: 1.0, t: 0.14 }),
        ],
        props: [],
      };
    case 'il28':
      return {
        solids: [
          glassNose(7.9, 0.85, 1.2, 1.15),
          fuselage({ noseZ: 7.9, tailZ: -7.8, r: 0.95, sy: 1.15, noseR: 0.9, peak: 0.2 }),
          canopy(5.6, 2.0, 0.55, 1.0, 0.55, true),
          // Kuyruk taret kabini
          tag(body([[-7.6, 0.42], [-8.2, 0.38], [-8.6, 0]], 7, { y: 0.1 }), 'glass'),
          ...wing({ x0: 1.0, z: 2.2, root: 4.0, y: 0.2, tipX: 10.72, tip: 1.6, sweep: 0.8, dihedral: 2, t: 0.5 }),
          // Kanat altında, hücum kenarının önüne uzanan motor naselleri
          ...mirror(3.25, (x) => jetPod(x, -0.35, 4.6, 6.6, 0.7)),
          ...mirror(3.25, (x) => tag(body([[4.65, 0.48], [4.5, 0.58], [4.1, 0.62]], 9, { x, y: -0.35 }), 'dark')),
          // Ok açılı kuyruk
          ...fins({ y0: 0.7, z0: -5.0, h: 3.0, root: 3.0, tip: 1.3, sweep: 2.2, t: 0.18 }),
          ...wing({ x0: 0.1, z: -6.0, root: 2.2, y: 0.8, tipX: 3.6, tip: 1.0, sweep: 1.5, dihedral: 7, t: 0.15 }),
        ],
        props: [],
      };
    // ================================================================ Sonraki nesil jetler (yer tutucu)
    case 'jetDelta':
      return {
        solids: [
          body([[7.3, 0], [6.7, 0.22], [6.5, 0.5], [5.8, 0.62], [2.0, 0.68], [-4.0, 0.65], [-6.0, 0.56], [-6.6, 0.52]]),
          body([[4.6, 0], [4.2, 0.25], [3.4, 0.32], [0, 0.26], [-3.0, 0]], 6, { y: 0.52, sx: 0.8 }),
          ...wing({ x0: 0.5, z: 1.8, root: 5.4, y: -0.1, tipX: 3.6, tip: 0.35, sweep: 4.9, dihedral: -2, t: 0.18 }),
          ...wing({ x0: 0.3, z: -4.6, root: 1.6, y: -0.05, tipX: 1.8, tip: 0.5, sweep: 1.4, dihedral: 0, t: 0.1 }),
          ...fins({ y0: 0.5, z0: -2.4, h: 2.0, root: 3.2, tip: 0.9, sweep: 2.9, t: 0.12 }),
        ],
        props: [],
      };
    case 'jetHeavy':
      return {
        solids: [
          body([[8.8, 0], [8.0, 0.45], [6.5, 0.75], [3.0, 0.92], [-2.0, 0.92], [-6.0, 0.8], [-8.6, 0.7], [-9.0, 0.66]]),
          body([[5.6, 0], [5.0, 0.3], [3.5, 0.42], [1.8, 0.36], [1.0, 0]], 6, { y: 0.78, sx: 0.85 }),
          ...mirror(1.15, (x) => box(0.7, 1.3, 4.6, x, -0.05, 2.6)),
          ...wing({ x0: 1.0, z: 2.4, root: 5.8, y: -0.35, tipX: 4.6, tip: 3.4, sweep: 3.2, dihedral: 0, t: 0.36 }),
          ...wing({ x0: 4.6, z: -0.8, root: 3.4, y: -0.35, tipX: 6.3, tip: 1.6, sweep: 1.6, dihedral: 12, t: 0.25 }),
          ...wing({ x0: 0.6, z: -6.4, root: 2.2, y: 0.3, tipX: 3.2, tip: 1.0, sweep: 1.5, dihedral: -23, t: 0.12 }),
          ...fins({ y0: 0.7, z0: -4.4, h: 2.7, root: 3.6, tip: 1.2, sweep: 3.0, t: 0.16 }),
        ],
        props: [],
      };
    case 'jetTwinTail':
      return {
        solids: [
          body([[9.6, 0], [8.6, 0.4], [6.5, 0.72], [3.5, 0.85], [0, 0.8], [-3.0, 0.6]]),
          box(3.6, 0.7, 10.5, 0, -0.05, -2.8),
          ...mirror(0.9, (x) => body([[0, 0.62], [-8.6, 0.62], [-9.6, 0.55]], 8, { x, y: -0.1 })),
          ...mirror(1.55, (x) => box(1.1, 1.15, 4.2, x, -0.3, 1.9)),
          body([[6.6, 0], [5.9, 0.33], [4.6, 0.45], [3.3, 0.38], [2.6, 0]], 6, { y: 0.7, sx: 0.85 }),
          ...wing({ x0: 1.8, z: 1.8, root: 6.0, y: 0.05, tipX: 6.5, tip: 1.5, sweep: 4.8, dihedral: -1, t: 0.3 }),
          ...wing({ x0: 1.5, z: -6.6, root: 2.8, y: -0.05, tipX: 4.1, tip: 1.1, sweep: 1.8, dihedral: 0, t: 0.12 }),
          ...fins({ x: 1.35, y0: 0.3, z0: -4.5, h: 3.0, root: 3.4, tip: 1.3, sweep: 2.6, t: 0.14, cant: 8 }),
        ],
        props: [],
      };
    case 'jetCanard':
      return {
        solids: [
          body([[7.8, 0], [7.0, 0.34], [5.5, 0.6], [2.0, 0.8], [-3.0, 0.78], [-6.5, 0.62], [-7.4, 0.58]]),
          body([[5.0, 0], [4.4, 0.3], [3.3, 0.4], [2.2, 0.3], [1.6, 0]], 6, { y: 0.68, sx: 0.85 }),
          box(1.4, 0.75, 3.4, 0, -0.85, 1.4),
          ...wing({ x0: 0.7, z: 0.9, root: 6.8, y: -0.25, tipX: 5.4, tip: 0.9, sweep: 5.4, dihedral: -1, t: 0.22 }),
          ...wing({ x0: 0.6, z: 4.4, root: 1.5, y: 0.2, tipX: 2.3, tip: 0.6, sweep: 1.1, dihedral: 4, t: 0.1 }),
          ...fins({ y0: 0.65, z0: -2.6, h: 2.6, root: 3.6, tip: 1.1, sweep: 2.9, t: 0.13 }),
        ],
        props: [],
      };
    case 'jetStealth':
      return {
        solids: [
          // 4 dilimli torna = elmas kesit (yanlarda keskin kenar)
          body([[9.5, 0], [7.5, 0.7], [4.0, 1.1], [0, 1.2], [-5.0, 1.1], [-8.8, 0.8], [-9.4, 0.72]], 4, { sx: 1.55, sy: 0.6 }),
          body([[6.2, 0], [5.5, 0.3], [4.3, 0.4], [3.0, 0.3], [2.4, 0]], 6, { y: 0.6, sx: 0.85 }),
          ...mirror(1.7, (x) => box(1.0, 1.0, 4.2, x, -0.25, 2.6)),
          ...wing({ x0: 1.5, z: 2.6, root: 7.4, y: 0, tipX: 6.8, tip: 1.3, sweep: 5.0, dihedral: -3, t: 0.24 }),
          ...wing({ x0: 1.3, z: -5.6, root: 3.1, y: 0, tipX: 3.8, tip: 1.2, sweep: 2.0, dihedral: 0, t: 0.12 }),
          ...fins({ x: 1.5, y0: 0.3, z0: -3.8, h: 2.6, root: 3.4, tip: 1.4, sweep: 2.2, t: 0.12, cant: 27 }),
        ],
        props: [],
      };
    default:
      return defineModel('spitfire');
  }
}

type Part = 'body' | 'glass' | 'dark';

/** Parça türüne göre ayrı malzemeyle çizilir (cam kanopi, koyu pervane göbeği/hava alığı/egzoz). */
function partOf(g: Geo): Part {
  return (g.userData.part as Part | undefined) ?? 'body';
}

function cleanGeo(g: Geo): Geo {
  const n = g.index ? g.toNonIndexed() : g;
  const c = new THREE.BufferGeometry();
  c.setAttribute('position', n.getAttribute('position'));
  return c;
}

function merge(list: Geo[]): Geo {
  const m = mergeGeometries(list.map(cleanGeo), false);
  if (!m) throw new Error('model birleştirilemedi');
  m.computeVertexNormals();
  m.computeBoundingSphere();
  return m;
}

/**
 * Gövde rengi köşe çarpanı: alt yüzeyler açık (karın boyası), üst yüzeyler biraz koyu.
 * Malzeme rengi takım rengidir; köşe rengi onu çarpar.
 */
function counterShade(g: Geo): void {
  const n = g.getAttribute('normal');
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const ny = n.getY(i);
    const k = ny < -0.2 ? 1 + 0.32 * Math.min(1, (-ny - 0.2) / 0.6) : ny > 0.4 ? 0.94 : 1;
    col[i * 3] = k;
    col[i * 3 + 1] = k;
    col[i * 3 + 2] = k * (ny < -0.2 ? 1.04 : 1);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

interface CachedModel {
  solid: Geo;
  glass: Geo | null;
  dark: Geo | null;
  /** Arma: dış beyaz halka ve iç takım rengi disk. */
  insigniaOuter: Geo | null;
  insigniaInner: Geo | null;
  gear: Geo | null;
  props: PropDef[];
  length: number;
  radius: number;
  probe: Probe;
  bb: THREE.Box3;
}

const geoCache = new Map<string, CachedModel>();
const _ray = new THREE.Raycaster();
const _o = new THREE.Vector3();
const _dn = new THREE.Vector3();

/** Model geometrisi üzerinde ışın yoklaması (arma, iniş takımı, egzoz yerleşimi için). */
class Probe {
  private readonly mesh: THREE.Mesh;
  constructor(g: Geo) {
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  }
  /** (x, z) noktasında yukarıdan / aşağıdan ilk yüzey. */
  vertical(x: number, z: number, fromTop: boolean): THREE.Intersection | null {
    _o.set(x, fromTop ? 40 : -40, z);
    _dn.set(0, fromTop ? -1 : 1, 0);
    _ray.set(_o, _dn);
    return _ray.intersectObject(this.mesh, false)[0] ?? null;
  }
  /** (y, z) noktasında sağ yandan ilk yüzey. */
  side(y: number, z: number): THREE.Intersection | null {
    _o.set(40, y, z);
    _dn.set(-1, 0, 0);
    _ray.set(_o, _dn);
    return _ray.intersectObject(this.mesh, false)[0] ?? null;
  }
  /** x açıklığında kanadın veteri: [ön kenar z, arka kenar z] (en uzun kesintisiz parça). */
  chord(x: number, zMax: number, zMin: number): [number, number] | null {
    let best: [number, number] | null = null;
    let cur: [number, number] | null = null;
    for (let z = zMax; z >= zMin; z -= 0.08) {
      const hit = this.vertical(x, z, true);
      if (hit) {
        if (!cur) cur = [z, z];
        else cur[1] = z;
      } else if (cur) {
        if (!best || cur[0] - cur[1] > best[0] - best[1]) best = cur;
        cur = null;
      }
    }
    if (cur && (!best || cur[0] - cur[1] > best[0] - best[1])) best = cur;
    return best && best[0] - best[1] > 0.4 ? best : null;
  }
}

function specOfModel(kind: string): AircraftSpec | undefined {
  return SPEC_LIST.find((s) => s.model === kind);
}

/** Yüzeye oturan disk (normal yönünde hafif yukarıda). */
function discOn(point: THREE.Vector3, normal: THREE.Vector3, r: number, lift: number): Geo {
  const g = new THREE.CircleGeometry(r, 18);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  g.applyQuaternion(q);
  g.translate(point.x + normal.x * lift, point.y + normal.y * lift, point.z + normal.z * lift);
  return g;
}

/** Kanat üstü ve gövde yanı armaları. */
function insignia(probe: Probe, bb: THREE.Box3): { outer: Geo[]; inner: Geo[] } {
  const outer: Geo[] = [];
  const inner: Geo[] = [];
  const half = bb.max.x;
  const x = half * 0.68;
  const ch = probe.chord(x, bb.max.z, bb.min.z);
  if (ch) {
    const z = (ch[0] + ch[1]) / 2;
    const hit = probe.vertical(x, z, true);
    if (hit && hit.face) {
      const r = Math.min((ch[0] - ch[1]) * 0.36, half * 0.11);
      // Kanat yüzeyine (dihedral eğimine) oturt
      const fn = hit.face.normal.clone();
      if (fn.y < 0) fn.negate();
      for (const s of [1, -1]) {
        const p = new THREE.Vector3(hit.point.x * s, hit.point.y, hit.point.z);
        const n = new THREE.Vector3(fn.x * s, fn.y, fn.z);
        outer.push(discOn(p, n, r, 0.025));
        inner.push(discOn(p, n, r * 0.55, 0.035));
      }
    }
  }
  // Gövde yanı: arka gövdede
  const zf = bb.min.z * 0.42;
  const sh = probe.side(0.05, zf);
  if (sh && sh.face && sh.point.x > 0.2) {
    const top = probe.vertical(0, zf, true);
    const bot = probe.vertical(0, zf, false);
    const hgt = top && bot ? top.point.y - bot.point.y : 1;
    const r = Math.min(hgt * 0.3, 0.75);
    const yc = top && bot ? (top.point.y + bot.point.y) / 2 : 0;
    const hit = probe.side(yc, zf);
    if (hit && hit.face) {
      for (const s of [1, -1]) {
        const p = new THREE.Vector3(hit.point.x * s, hit.point.y, hit.point.z);
        const n = new THREE.Vector3(s, 0, 0);
        outer.push(discOn(p, n, r, 0.025));
        inner.push(discOn(p, n, r * 0.55, 0.035));
      }
    }
  }
  return { outer, inner };
}

/** Katlanır iniş takımı: ana bacaklar kanat altında, kuyruk ya da burun tekerleği. */
function landingGear(probe: Probe, bb: THREE.Box3, spec: AircraftSpec | undefined, kind: string): Geo[] {
  if (!spec || kind === 'ju87b' || kind === 'ju87d') return [];
  const gh = spec.span > 25 ? 3.4 : spec.engines > 1 ? 2.6 : 1.9;
  const half = bb.max.x;
  const tricycle = !spec.tailDragger;
  const x = half * (spec.engines > 1 ? (spec.engines > 2 ? 0.24 : 0.3) : 0.2);
  const ch = probe.chord(x, bb.max.z, bb.min.z);
  if (!ch) return [];
  const z = ch[0] - (ch[0] - ch[1]) * (tricycle ? 0.55 : 0.3);
  const bot = probe.vertical(x, z, false);
  const yb = bot ? bot.point.y : -0.4;
  const wr = gh * 0.2;
  const out: Geo[] = [];
  const strut = (sx: number, top: number, zz: number, w: number) => {
    const len = top - (-gh + wr);
    const g = new THREE.BoxGeometry(w, len, w);
    g.translate(sx, top - len / 2, zz);
    out.push(g);
  };
  const wheel = (sx: number, zz: number, r: number, tw: number) => {
    const g = new THREE.CylinderGeometry(r, r, tw, 12).rotateZ(Math.PI / 2);
    g.translate(sx, -gh + r, zz);
    out.push(g);
  };
  for (const s of [1, -1]) {
    strut(x * s, yb, z, wr * 0.35);
    wheel(x * s, z, wr, wr * 0.55);
    // Kapak
    const door = new THREE.BoxGeometry(0.05, (yb + gh) * 0.6, wr * 1.6);
    door.translate(x * s + s * wr * 0.6, yb - (yb + gh) * 0.3, z);
    out.push(door);
  }
  if (tricycle) {
    const zn = bb.max.z * 0.62;
    const nb = probe.vertical(0, zn, false);
    const yn = nb ? nb.point.y : -0.3;
    strut(0, yn, zn, wr * 0.3);
    wheel(0, zn, wr * 0.75, wr * 0.45);
  } else {
    const zt = bb.min.z * 0.86;
    const tb = probe.vertical(0, zt, false);
    const yt = tb ? tb.point.y : 0;
    strut(0, yt, zt, wr * 0.22);
    wheel(0, zt, wr * 0.45, wr * 0.35);
  }
  return out;
}

/** Sıra motorlu tek motorlu avcıda burun yanlarında egzoz çıkıntıları. */
function exhausts(probe: Probe, bb: THREE.Box3, spec: AircraftSpec | undefined): Geo[] {
  if (!spec || spec.engine.kind !== 'inline' || spec.engines !== 1) return [];
  const out: Geo[] = [];
  const nose = bb.max.z;
  for (let i = 0; i < 6; i++) {
    const z = nose - 0.95 - i * 0.24;
    const hit = probe.side(0.12, z);
    if (!hit) continue;
    for (const s of [1, -1]) {
      const g = new THREE.BoxGeometry(0.14, 0.09, 0.16);
      g.translate((hit.point.x + 0.04) * s, 0.12, z);
      out.push(g);
    }
  }
  return out;
}

function cached(kind: string): CachedModel {
  let c = geoCache.get(kind);
  if (c) return c;
  const def = defineModel(kind);
  const byPart: Record<Part, Geo[]> = { body: [], glass: [], dark: [] };
  for (const g of def.solids) byPart[partOf(g)].push(g);
  const solid = merge(byPart.body);
  counterShade(solid);
  solid.computeBoundingBox();
  const bb = solid.boundingBox!;
  const all = merge(def.solids);
  const probe = new Probe(all);
  const spec = specOfModel(kind);
  const ins = insignia(probe, bb);
  const darkParts = [...byPart.dark, ...exhausts(probe, bb, spec)];
  const gear = landingGear(probe, bb, spec, kind);
  const opt = (g?: Geo[]) => (g && g.length ? merge(g) : null);
  all.computeBoundingSphere();
  c = {
    solid,
    glass: opt(byPart.glass),
    dark: opt(darkParts),
    insigniaOuter: opt(ins.outer),
    insigniaInner: opt(ins.inner),
    gear: opt(gear),
    props: def.props,
    length: bb.max.z - bb.min.z,
    radius: all.boundingSphere!.radius,
    probe,
    bb,
  };
  geoCache.set(kind, c);
  return c;
}

interface Mats {
  solid: THREE.Material;
  plain: THREE.Material;
  glass: THREE.Material;
  dark: THREE.Material;
  white: THREE.Material;
  teamDark: THREE.Material;
  disc: THREE.Material;
}

const matCache = new Map<number, Mats>();
const GLASS = new THREE.MeshLambertMaterial({ color: 0x9fb6cc, emissive: 0x1c2a3a, flatShading: true, side: THREE.DoubleSide });
const DARK = new THREE.MeshLambertMaterial({ color: 0x5e5a68, flatShading: true, side: THREE.DoubleSide });
const WHITE = new THREE.MeshLambertMaterial({ color: 0xf7f3ec, side: THREE.DoubleSide });

function materials(color: number): Mats {
  let m = matCache.get(color);
  if (!m) {
    const dark = new THREE.Color(color).multiplyScalar(0.55);
    m = {
      solid: new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide, vertexColors: true }),
      plain: new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide }),
      glass: GLASS,
      dark: DARK,
      white: WHITE,
      teamDark: new THREE.MeshLambertMaterial({ color: dark, side: THREE.DoubleSide }),
      disc: new THREE.MeshBasicMaterial({ color: 0x5e5a68, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    };
    matCache.set(color, m);
  }
  return m;
}

/** Sivrilen pervane palası (kökte dar, ortada geniş). */
const BLADE_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.05, 0);
  s.lineTo(0.05, 0);
  s.lineTo(0.1, 0.35);
  s.lineTo(0.07, 0.95);
  s.lineTo(0, 1);
  s.lineTo(-0.07, 0.95);
  s.lineTo(-0.1, 0.35);
  s.lineTo(-0.05, 0);
  return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }).translate(0, 0, -0.02);
})();
const DISC_GEO = new THREE.CircleGeometry(1, 24);

export interface AircraftModel {
  root: THREE.Group;
  /** Dönen pervane pal grupları (Z ekseninde döndürülür). */
  props: THREE.Object3D[];
  /** Katlanır iniş takımı (yerde ve son yaklaşmada görünür). */
  gear: THREE.Object3D | null;
  length: number;
  /** Sınır küresi yarıçapı (kanat açıklığı dahil). */
  radius: number;
}

export function buildAircraftModel(kind: string, color: number, opts: { gear?: boolean } = {}): AircraftModel {
  const c = cached(kind);
  const mats = materials(color);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(c.solid, mats.solid));
  const add = (g: Geo | null, m: THREE.Material) => {
    if (!g) return null;
    const mesh = new THREE.Mesh(g, m);
    root.add(mesh);
    return mesh;
  };
  add(c.glass, mats.glass);
  add(c.dark, mats.dark);
  add(c.insigniaOuter, mats.white);
  add(c.insigniaInner, mats.teamDark);
  const gear = add(c.gear, mats.dark);
  if (gear) gear.visible = !!opts.gear;
  const props: THREE.Object3D[] = [];
  for (const p of c.props) {
    const g = new THREE.Group();
    g.position.set(p.x ?? 0, p.y ?? 0, p.z);
    const blades = new THREE.Group();
    for (let i = 0; i < p.blades; i++) {
      const b = new THREE.Mesh(BLADE_GEO, mats.dark);
      b.scale.set(p.r * 0.9, p.r, 1);
      b.rotation.z = (i / p.blades) * Math.PI * 2;
      blades.add(b);
    }
    g.add(blades);
    const disc = new THREE.Mesh(DISC_GEO, mats.disc);
    disc.scale.setScalar(p.r);
    g.add(disc);
    root.add(g);
    props.push(blades);
  }
  return { root, props, gear, length: c.length, radius: c.radius };
}

// ---------------------------------------------------------------- dış yükler

const STORE_MAT = {
  bomb: new THREE.MeshLambertMaterial({ color: 0x6d705f, flatShading: true }),
  tank: new THREE.MeshLambertMaterial({ color: 0xcfcdd4, flatShading: true }),
  rocket: new THREE.MeshLambertMaterial({ color: 0x7b7786, flatShading: true }),
  gunpod: new THREE.MeshLambertMaterial({ color: 0x5e5a68, flatShading: true }),
};

const unitBomb = body([[0.5, 0], [0.4, 0.11], [0.05, 0.12], [-0.32, 0.09], [-0.5, 0.03]], 7).rotateX(0);
const finBomb = mergeGeometries([
  unitBomb.toNonIndexed(),
  new THREE.BoxGeometry(0.26, 0.012, 0.12).translate(0, 0, -0.44).toNonIndexed(),
  new THREE.BoxGeometry(0.012, 0.26, 0.12).translate(0, 0, -0.44).toNonIndexed(),
].map(cleanGeo))!;
finBomb.computeVertexNormals();
const unitTank = body([[0.5, 0], [0.32, 0.12], [-0.2, 0.13], [-0.5, 0.01]], 8);
unitTank.computeVertexNormals();
const unitRocket = body([[0.5, 0], [0.38, 0.05], [-0.5, 0.05]], 6);
unitRocket.computeVertexNormals();
const unitPod = mergeGeometries([
  cleanGeo(body([[0.45, 0.05], [0.3, 0.13], [-0.4, 0.13], [-0.5, 0.06]], 8).toNonIndexed()),
  cleanGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 5).rotateX(Math.PI / 2).translate(0, 0, 0.7).toNonIndexed()),
])!;
unitPod.computeVertexNormals();

/** Bir askıdaki her mühimmatın konumu (çift askıda sıra sol-sağ dönüşümlü: bırakılınca dengeli eksilir). */
function hardpointSlots(c: CachedModel, h: Hardpoint, n: number, len: number, rad: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const half = c.bb.max.x;
  if (h.kind === 'bay') return out;
  const wingAt = (x: number) => {
    const ch = c.probe.chord(Math.abs(x), c.bb.max.z, c.bb.min.z);
    const z = ch ? ch[0] - (ch[0] - ch[1]) * 0.42 : 0;
    const bot = c.probe.vertical(Math.abs(x), z, false);
    return { z, y: bot ? bot.point.y : -0.4 };
  };
  if (h.kind === 'center') {
    const root = c.probe.chord(Math.min(1.0, half * 0.12), c.bb.max.z, c.bb.min.z);
    const z0 = root ? root[0] - (root[0] - root[1]) * 0.4 : 0;
    const bot = c.probe.vertical(0, z0, false);
    const y0 = (bot ? bot.point.y : -0.6) - rad - 0.12;
    const sideX = h.pylons > 1 ? Math.max(0.35, rad * 1.5) : 0;
    for (let k = 0; k < n; k++) {
      // Çoklu raf: 2'li yan yana, sonra arka arkaya
      const col = n > 1 ? (k % 2 === 0 ? -1 : 1) * rad * 1.25 : 0;
      const row = Math.floor(k / 2) - (Math.ceil(n / 2) - 1) / 2;
      for (let p = 0; p < h.pylons; p++) {
        const sx = h.pylons > 1 ? (p === 0 ? -sideX : sideX) : 0;
        out.push(new THREE.Vector3(sx + col, y0, z0 - row * len * 1.05));
      }
    }
    return out;
  }
  if (h.kind === 'tip') {
    const w = wingAt(half * 0.96);
    for (const sgn of [-1, 1]) out.push(new THREE.Vector3(sgn * (half + rad * 0.6), w.y + rad * 0.9, w.z + len * 0.15));
    return out;
  }
  const at = h.at ?? 0.36;
  for (let k = 0; k < n; k++) {
    // Ray: roketler kanat boyunca yan yana; kanat altı: aynı askıda arka arkaya / yan yana
    const dx = h.kind === 'rail' ? (k - (n - 1) / 2) * Math.max(0.42, half * 0.06) : n > 1 ? (k % 2 === 0 ? -1 : 1) * rad * 1.2 : 0;
    const dz = h.kind === 'rail' ? 0 : n > 1 ? -Math.floor(k / 2) * len * 0.6 : 0;
    for (const sgn of [-1, 1]) {
      const x = sgn * (half * at + dx);
      const w = wingAt(x);
      out.push(new THREE.Vector3(x, w.y - rad - 0.1, w.z + len * 0.12 + dz));
    }
  }
  return out;
}

/** Uçağın askılarındaki mühimmat: askı (yuva) başına örnekli ağ; count kalan adede eşitlenir. */
export function buildStoreMeshes(kind: string, spec: AircraftSpec, slots: { hp: string; store: StoreDef; n0: number }[]): (THREE.InstancedMesh | null)[] {
  const c = cached(kind);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  return slots.map((slot) => {
    const h = spec.hardpoints.find((x) => x.id === slot.hp);
    if (!h || h.kind === 'bay') return null;
    const st = slot.store;
    const perPylon = Math.max(1, Math.round(slot.n0 / h.pylons));
    let geo: Geo;
    let len: number;
    let rad: number;
    if (st.kind === 'bomb') {
      const k = Math.cbrt(st.mass / 250);
      len = 1.65 * k;
      rad = 0.2 * k;
      geo = finBomb;
    } else if (st.kind === 'tank') {
      const k = Math.cbrt((st.fuelKg ?? 200) / 220);
      len = (h.kind === 'tip' ? 4.6 : 2.4) * k;
      rad = (h.kind === 'tip' ? 0.42 : 0.3) * k;
      geo = unitTank;
    } else if (st.kind === 'rocket') {
      len = 0.85 + st.mass / 70;
      rad = 0.07 + st.mass / 900;
      geo = unitRocket;
    } else {
      len = 1.7;
      rad = 0.16;
      geo = unitPod;
    }
    const pos = hardpointSlots(c, h, perPylon, len, rad);
    if (!pos.length) return null;
    const mesh = new THREE.InstancedMesh(geo, STORE_MAT[st.kind], pos.length);
    // Ünite geometrisi: uzunluk 1, yarıçap ~0.12 → gerçek boyuta ölçek
    pos.forEach((p, i) => {
      sc.set(rad / 0.12, rad / 0.12, len);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    return mesh;
  });
}
