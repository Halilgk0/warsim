// Harita süsleri (2026-11-13): haritanın sabit dekor şehirleri ve yolları kaldırıldı; yerine her harekâtta rastgele yerlere
// serpilen birkaç küçük köy, boş arazide tek tük sağlam ya da yıkık ev ve terk edilmiş maden ocağı. Az ve dağınık:
// harita dolsun ama kalabalık olmasın.
// - Yalnız görüntü: simülasyon bilmez. Oyuncu ya da bot üstüne yapı kurarsa o süs gizlenir (landcover.ts builtNear).
// - Yerler harekâtın ana üslerinden tohumlanır (üsler her harekâtta rastgele, kayıtta aynı): aynı kayıt aynı süsleri görür.
// - Ana üslerden (başlangıç yapıları da üssün birkaç km yakınında) uzak, birbirinden ayrı, kuru, düz ve sık ormanda
//   olmayan yerlerde. İç içe girmezler; kapladıkları yere ağaç ve çiftlik konmaz (landcover.ts setDecorClearings). Seçim
//   yalnız harita ve ana üslere bağlı: sonradan kurulan yapılar yerleri kaydırmaz, altında kalan süsü gizler.
// - Modeller oyunun yapı modelleri (cityModels.ts): köy evleri buildCityModel, yıkık ev, ahır, kuyu ve terk edilmiş maden
//   buildDecorModel. Bir süsün bütün parçaları tek ağda (ArchBatch.setOrigin), yıkıklar hasar gölgelendiricili ikinci
//   malzemede. Kurulum kare başına küçük dilimlerle (telefonda takılmasın), kameraya yakın olan önce.

import * as THREE from 'three';
import type { World } from '../sim/world';
import { MAP_HALF, MAP_SIZE } from '../sim/mapData';
import { groundLevel, terrainHeight } from '../sim/terrain';
import { mulberry32 } from '../core/math';
import { ArchBatch, archMaterial, setArchDamage, setArchLit, SURF } from './arch';
import { LAMP, LampSet } from './lamps';
import { buildCityModel, buildDecorModel, cityParts } from './cityModels';
import { groundStructure } from './ground';
import { builtNear, clearingsVersion, forestGrid, sampleGrid, setDecorClearings, slopeGrid } from './landcover';
import type { StructureKind } from '../sim/structures/structure';
import { L } from '../i18n';

/** Haritadaki küçük işaret (yapı etiketlerinden sönük): simge ve ad. */
const MARK: Record<'village' | 'house' | 'ruin' | 'mine', [string, () => string]> = {
  village: ['⌂', () => L('Köy', 'Village')],
  house: ['⌂', () => L('Çiftlik evi', 'Farmhouse')],
  ruin: ['⌂', () => L('Yıkık ev', 'Ruined house')],
  mine: ['⛏', () => L('Terk edilmiş maden', 'Abandoned mine')],
};
const _p = new THREE.Vector3();

type DecorKind = 'village' | 'house' | 'ruin' | 'mine';

interface Item {
  kind: DecorKind;
  x: number;
  z: number;
  /** Kapladığı daire (m). */
  r: number;
  yaw: number;
  seed: number;
  /** Köyde ev sayısı. */
  n: number;
  group: THREE.Group | null;
  /** Üstüne yapı kuruldu. */
  covered: boolean;
  /** Haritadaki işaret (etiket katmanında). */
  label: HTMLDivElement | null;
}

/** Ana üslerden en az bu kadar uzak (m): kasaba, fabrika ve ilk maden de üssün birkaç km yakınında. */
const BASE_CLEAR = 14000;
/** Süsler arası boşluk (yarıçaplara ek). */
const GAP = 2500;
/** Kameradan bu kadar uzaktaki süs çizilmez (m; harita görünümünde piksel altı). */
const SHOW = 16000;
/** Kare başına kurulum süresi (ms). */
const BUDGET = 5;

/** 200 km haritada adet; alanla ölçeklenir. */
const COUNT = { mine: 3, village: 5, house: 9 };

const HOUSES: StructureKind[] = ['smallhouse', 'smallhouse', 'midhouse', 'midhouse', 'house'];
/** Ev türünün arsa yarı genişliği (cityModels.ts garden P). */
const PLOT: Partial<Record<StructureKind, number>> = { smallhouse: 11, midhouse: 13.5, house: 16 };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Y dönüşü (three.js rotateY ile aynı): yerel (x, z) → döndürülmüş. */
function rot(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

export class DecorLayer {
  readonly group = new THREE.Group();
  private readonly mat = archMaterial();
  private readonly ruinMat = archMaterial();
  /** Karartmadaki köyler ve ıssız tek evler: gece pencereleri yanmaz. */
  private readonly darkMat = archMaterial();
  private items: Item[] = [];
  private key = '';
  private clearVer = -1;

  constructor(scene: THREE.Scene, private readonly labelLayer?: HTMLElement) {
    setArchDamage(this.ruinMat, 0.5);
    setArchLit(this.darkMat, 0);
    scene.add(this.group);
  }

  /** Her kare: harekât değiştiyse yerleri yeniden seç; kurulmamışları dilimle kur; görünürlük. */
  sync(w: World, cam: THREE.Vector3, camDist: number, enabled: boolean): void {
    const bases = this.mainBases(w);
    const key = w.setup && bases.length ? `${w.mapId}:${w.mapSize}:${bases.map((b) => `${Math.round(b.x)},${Math.round(b.z)}`).join(';')}` : '';
    if (key !== this.key) {
      this.key = key;
      this.clear();
      if (key) this.items = this.plan(bases, hash(key));
      setDecorClearings(this.items.map((i) => ({ x: i.x, z: i.z, r: i.r })));
      this.clearVer = -1;
    }
    if (!this.items.length) return;
    // Üstüne yapı ya da yol kurulan süs gizlenir (açıklık listesi değişince bak)
    const cv = clearingsVersion();
    if (cv !== this.clearVer) {
      this.clearVer = cv;
      for (const it of this.items) it.covered = builtNear(it.x, it.z, it.r * 0.8);
    }
    this.group.visible = enabled && camDist < 22000;
    if (!this.group.visible) return;
    // Kurulum: kameraya en yakın kurulmamış süsler, kare başına BUDGET ms
    const t0 = performance.now();
    while (performance.now() - t0 < BUDGET) {
      let best: Item | null = null;
      let bd = Infinity;
      for (const it of this.items) {
        if (it.group || it.covered) continue;
        const d = Math.hypot(it.x - cam.x, it.z - cam.z);
        if (d < bd) {
          bd = d;
          best = it;
        }
      }
      if (!best || bd > SHOW * 1.5) break;
      this.build(best);
    }
    for (const it of this.items) {
      if (it.group) it.group.visible = !it.covered && Math.hypot(it.x - cam.x, it.z - cam.z) < SHOW + it.r;
    }
  }

  /** Her tarafın ana üssü (harekâtta ilk kurulan hava üssü; yıkılsa da listede kalır). */
  private mainBases(w: World): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    const seen = new Set<number>();
    for (const s of w.structures) {
      if (s.kind !== 'airbase' || seen.has(s.team)) continue;
      seen.add(s.team);
      out.push({ x: s.pos.x, z: s.pos.z });
    }
    return out;
  }

  /**
   * Haritadaki işaretler: yakında simge ve ad, uzakta yalnız simge; yapı etiketlerinden küçük ve sönük (süs olduğu, bir
   * hedef olmadığı belli olsun). Etiketler kapalıysa ya da üstüne yapı kurulduysa yok.
   */
  updateLabels(camera: THREE.Camera, rect: DOMRect, show: boolean, camDist: number): void {
    if (!this.labelLayer) return;
    const named = camDist < 9000;
    for (const it of this.items) {
      if (!show || it.covered || camDist > 70000) {
        if (it.label) it.label.style.display = 'none';
        continue;
      }
      if (!it.label) {
        it.label = document.createElement('div');
        it.label.className = 'dlabel';
        this.labelLayer.appendChild(it.label);
      }
      _p.set(it.x, groundLevel(it.x, it.z) + 30, it.z).project(camera);
      if (_p.z > 1 || Math.abs(_p.x) > 1.1 || Math.abs(_p.y) > 1.1) {
        it.label.style.display = 'none';
        continue;
      }
      const [glyph, name] = MARK[it.kind];
      const txt = named ? `${glyph} ${name()}` : glyph;
      if (it.label.textContent !== txt) it.label.textContent = txt;
      it.label.classList.toggle('icon', !named);
      it.label.style.display = '';
      it.label.style.transform = `translate(${(((_p.x + 1) / 2) * rect.width).toFixed(1)}px, ${(((1 - _p.y) / 2) * rect.height).toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  private clear(): void {
    for (const it of this.items) {
      it.label?.remove();
      if (!it.group) continue;
      this.group.remove(it.group);
      it.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      });
    }
    this.items = [];
  }

  /** Yerleri seç: önce büyükler (maden, köy), sonra tek evler. */
  private plan(bases: { x: number; z: number }[], seed: number): Item[] {
    const rng = mulberry32(seed);
    const k = (MAP_SIZE / 200000) ** 2;
    const items: Item[] = [];
    const free = (x: number, z: number, r: number, slope: number, relief: number): boolean => {
      if (Math.abs(x) > MAP_HALF - 6000 || Math.abs(z) > MAP_HALF - 6000) return false;
      for (const b of bases) if (Math.hypot(b.x - x, b.z - z) < BASE_CLEAR + r) return false;
      for (const o of items) if (Math.hypot(o.x - x, o.z - z) < o.r + r + GAP) return false;
      const h0 = terrainHeight(x, z);
      if (h0 < 14 || h0 > 1100) return false;
      if (sampleGrid(forestGrid, x, z) > 0.55) return false;
      // Düz ve kuru: merkez ve çevresindeki sekiz nokta
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const d = i === 8 ? 0 : r * 0.85;
        const px = x + Math.cos(a) * d;
        const pz = z + Math.sin(a) * d;
        const h = terrainHeight(px, pz);
        if (h < 6 || Math.abs(h - h0) > relief || sampleGrid(slopeGrid, px, pz) > slope) return false;
      }
      return true;
    };
    const place = (kind: DecorKind, r: number, slope: number, relief: number, n = 0): void => {
      for (let t = 0; t < 500; t++) {
        const x = (rng() - 0.5) * MAP_SIZE * 0.92;
        const z = (rng() - 0.5) * MAP_SIZE * 0.92;
        if (!free(x, z, r, slope, relief)) continue;
        items.push({ kind, x, z, r, yaw: rng() * Math.PI * 2, seed: Math.floor(rng() * 2 ** 31), n, group: null, covered: false, label: null });
        return;
      }
    };
    for (let i = 0; i < Math.max(1, Math.round(COUNT.mine * k)); i++) place('mine', 60, 0.09, 9);
    for (let i = 0; i < Math.max(1, Math.round(COUNT.village * k)); i++) {
      const n = 4 + Math.floor(rng() * 4);
      place('village', 40 + Math.ceil(n / 2) * 15, 0.08, 10, n);
    }
    for (let i = 0; i < Math.max(2, Math.round(COUNT.house * k)); i++) {
      if (rng() < 0.45) place('ruin', 22, 0.11, 4);
      else place('house', 42, 0.1, 6);
    }
    return items;
  }

  private build(it: Item): void {
    const rng = mulberry32(it.seed);
    const g = new THREE.Group();
    const y0 = groundLevel(it.x, it.z);
    g.position.set(it.x, y0, it.z);
    const b = new ArchBatch();
    const ruin = new ArchBatch();
    const lamps = new LampSet();
    const yaw = it.yaw;
    // Köylerin çoğu ve tek evlerin yarısı gece ışık yakar (modelin rastgele akışından ayrı)
    const lit = mulberry32(it.seed ^ 0x2f6b4d)() < (it.kind === 'village' ? 0.65 : it.kind === 'house' ? 0.5 : 0);
    switch (it.kind) {
      case 'mine':
      case 'ruin':
        // Zemin ve bitki sağlam malzemede, yapılar yıpranmış (hasar) malzemede
        b.setOrigin(0, 0, yaw);
        ruin.setOrigin(0, 0, yaw);
        buildDecorModel(it.kind === 'mine' ? 'oldmine' : 'ruin', rng, b, ruin);
        break;
      case 'house': {
        // Tek çiftlik evi: ev ve yanında çoğunlukla ahır
        const kind = HOUSES[Math.floor(rng() * HOUSES.length)];
        b.setOrigin(0, 0, yaw);
        buildCityModel(kind, rng, b);
        if (rng() < 0.7) {
          const [ox, oz] = rot((PLOT[kind] ?? 12) + 12, -3, yaw);
          b.setOrigin(ox, oz, yaw + Math.PI / 2);
          buildDecorModel('barn', rng, b);
        }
        break;
      }
      case 'village':
        this.village(it, rng, b, ruin, lit ? lamps : null, y0);
        break;
    }
    // Aydınlık köy ve evde gece pencereler yanar, köyde sokak lambaları; ötekiler karartmada
    b.build(g, lit ? this.mat : this.darkMat);
    if (lit) lamps.build(g);
    ruin.build(g, this.ruinMat);
    groundStructure(g, y0);
    g.updateMatrixWorld(true);
    it.group = g;
    this.group.add(g);
  }

  /**
   * Köy: ortadan geçen toprak yol (yerel z boyunca), iki yanında yola bakan evler, ortada kuyu, bazen bir ahır; evlerden
   * biri bazen yıkık. Yol boyu = ev sırası.
   */
  private village(it: Item, rng: () => number, b: ArchBatch, ruin: ArchBatch, lamps: LampSet | null, y0: number): void {
    const yaw = it.yaw;
    const rows = Math.ceil(it.n / 2);
    const L = rows * 30 + 30;
    // Toprak yol: 20 m'lik parçalar (araziyi izlesin), yanlarında çimen şerit
    b.setOrigin(0, 0, yaw);
    for (let z = -L / 2; z < L / 2; z += 20) {
      cityParts.flat(b, 4.2, 20.2, 0, z + 10, 0x6e604c, SURF.earth, 0, 0.1);
    }
    let ruined = rng() < 0.4 ? Math.floor(rng() * it.n) : -1;
    for (let i = 0; i < it.n; i++) {
      const side = i % 2 ? 1 : -1;
      const kind = HOUSES[Math.floor(rng() * HOUSES.length)];
      const P = PLOT[kind] ?? 12;
      const along = -L / 2 + 22 + Math.floor(i / 2) * 30 + (rng() - 0.5) * 4;
      const [ox, oz] = rot(side * (2.6 + P + rng() * 2), along, yaw);
      // Ön cephe (+z) yola bakar
      const hy = yaw - side * (Math.PI / 2);
      if (i === ruined) {
        b.setOrigin(ox, oz, hy);
        ruin.setOrigin(ox, oz, hy);
        buildDecorModel('ruin', rng, b, ruin);
        ruined = -1;
      } else {
        b.setOrigin(ox, oz, hy);
        buildCityModel(kind, rng, b);
      }
    }
    // Kuyu yolun başında (evlerin önünde), bazen köyün öbür ucunda ahır
    const [wx, wz] = rot(0, -L / 2 - 5, yaw);
    b.setOrigin(wx, wz, yaw);
    buildDecorModel('well', rng, b);
    if (rng() < 0.6) {
      const [ax, az] = rot((rng() < 0.5 ? -1 : 1) * 16, L / 2 + 6, yaw);
      b.setOrigin(ax, az, yaw + Math.PI);
      buildDecorModel('barn', rng, b);
    }
    if (!lamps) return;
    // Sokak lambaları: yol boyunca iki yana sırayla 2–3 direk, tepede sıcak ışık ve yerde ışık havuzu; kuyuda fener
    const n = rows > 2 ? 3 : 2;
    const at = (x: number, z: number, h: number): [number, number, number] => {
      const [lx, lz] = rot(x, z, yaw);
      return [lx, groundLevel(it.x + lx, it.z + lz) - y0 + h, lz];
    };
    b.setOrigin(0, 0, yaw);
    for (let k = 0; k < n; k++) {
      const z = -L / 2 + 10 + (k * (L - 20)) / (n - 1);
      const x = k % 2 ? 2.5 : -2.5;
      cityParts.lamp(b, x, z);
      const [lx, ly, lz] = at(x, z, 4.55);
      lamps.lamp(lx, ly, lz, LAMP.warm, 0.3, 1.6);
      const [px, py, pz] = at(x * 0.6, z, 0.12);
      lamps.pool(px, py, pz, 9, LAMP.warm, 0.4);
    }
    const [fx, fy, fz] = at(0, -L / 2 - 5, 2.2);
    lamps.lamp(fx, fy, fz, LAMP.warm, 0.24, 1.3);
  }
}
