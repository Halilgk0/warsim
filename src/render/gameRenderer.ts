import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Aircraft } from '../sim/aircraft/aircraft';
import { STRUCTURE_DEFS, STRUCT_GLYPH, type Structure, type StructureKind } from '../sim/structures/structure';
import { AA_WEAPONS, AASite } from '../sim/structures/airDefense';
import { detectProbabilityAt } from '../sim/structures/radar';
import { RUNWAY_HALF, corridorMargin } from '../sim/structures/airbase';
import { turretWorldPos } from '../sim/ai/gunner';
import { groundLevel, loadMap, terrainEdits, terrainMap } from '../sim/terrain';
import { MAPS } from '../sim/maps';
import { CameraRig } from './camera';
import { TerrainView, waterU } from './terrain';
import { StructureView } from './structures';
import { buildAircraftModel, buildStoreMeshes, propU, type AircraftModel } from './models';
import { Scenery } from './scenery';
import { computeLandcover, setClearings } from './landcover';
import { Debris, Effects, ParachuteViews, RocketViews, Tracers } from './effects';
import { PALETTE } from './palette';
import { Atmosphere, FIXED_HOUR, dayHour } from './atmosphere';
import { Contrails, contrailAmount } from './contrails';
import { Clouds } from './clouds';
import { archU } from './arch';
import { onSettingsChange, quality, settings } from '../ui/settings';
import { L } from '../i18n';

const TRAIL_N = 90;
const TRAIL_DT = 0.12;
const MAX_AC = 256;

export type Pick = { kind: 'aircraft'; ac: Aircraft } | { kind: 'structure'; s: Structure } | null;

interface AircraftView {
  ac: Aircraft;
  root: THREE.Group;
  model: AircraftModel;
  /** Askılardaki mühimmat ağları (ac.stores.slots sırasıyla). */
  stores: (THREE.InstancedMesh | null)[];
  /** Simülasyon adımları arasında ara değerlenmiş konum ve yönelim (titremesiz hareket). */
  ip: THREE.Vector3;
  iq: THREE.Quaternion;
  shadow: THREE.Mesh;
  trail: THREE.Line;
  trailBuf: Float32Array;
  trailHead: number;
  trailCount: number;
  lastSample: number;
  lastSmoke: number;
  lastMuzzle: number;
  trailColor: THREE.Color;
  label: HTMLDivElement;
  visible: boolean;
  /** Küçük ayrıntılar çiziliyor mu (ekrandaki boyuta göre, eşikte gidip gelmesin diye payla). */
  fine: boolean;
}

/**
 * Küçük ayrıntıların (cam, koyu parçalar, pilot, lambalar, küçük eklemler) çizildiği en küçük ekran yarıçapı
 * (CSS piksel). Bu boyutta kanopi ve namlular 1–2 pikselin altında kalır; gizlenince fark görünmez, kalabalık kolda
 * çizim sayısı yarıya iner. Video kaydında yarısı.
 */
const FINE_PX = 10;

export interface Ghost {
  kind: StructureKind;
  x: number;
  z: number;
  heading: number;
  ok: boolean;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _white = new THREE.Color(0xffffff);
const _glow = new THREE.Color();

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 10, 200000);
  readonly rig: CameraRig;
  selectedAircraftId: number | null = null;
  selectedStructureId: number | null = null;
  /** Rotası gösterilecek kol. */
  routeFlightId: number | null = null;
  /** Görev planlayıcı önizlemesi. */
  plannerRoute: THREE.Vector3[] | null = null;
  ghost: Ghost | null = null;
  playerTeam = 0;
  /** Yapıların takım halkaları (sinematik kayıtta kapalı). */
  rings = true;

  private world: World | null = null;
  private lastTime = 0;
  /** Son simülasyon adımından bu yana geçen oran (0..1). */
  private alpha = 1;
  private terrain: TerrainView;
  readonly atmosphere: Atmosphere;
  readonly clouds: Clouds;
  /** Cihazın piksel oranı (en çok 2); çözünürlük ayarı bunun katı. */
  /**
   * Taban piksel oranı: en çok 2; Düşük kalitede 1,5 (telefonda sahne piksel sayısı ~%44 azalır, keskinlik çok az
   * düşer; arayüz yazıları DOM'da, etkilenmez).
   */
  private get baseRatio(): number {
    return Math.min(window.devicePixelRatio, settings.graphics.quality === 'low' ? 1.5 : 2);
  }
  /** Otomatik çözünürlük: geçerli çarpan, kare süresi ortalaması (ms), son değişimden beri süre (s). */
  private readonly resAuto = { scale: 1, ema: 16.7, t: 0 };
  /** Video kaydı: çözünürlük sabit. */
  private fixedBuffer = false;
  /** Günün saatine eklenen kaydırma (saat; kayıt kipi çekimin saatini ayarlar). */
  clockShift = 0;
  private scenery: Scenery;
  private clearKey = '';
  private views = new Map<number, AircraftView>();
  /** Uçak modeli ayrıntısı (kalite ayarı: 0 low-poly, 1 yüksek çözünürlük). */
  private modelDetail = 1;
  /** Sinematik çekimde de kamera ile baktığı nokta arasındaki bulut açılsın (kayıt kipi, çekim seçeneği). */
  cinemaClearClouds = false;
  /** Yapı duman sütunlarının ömür çarpanı (kayıt kipi, çekim seçeneği; oyunda 1). */
  cinemaSmoke = 1;
  private structViews = new Map<number, StructureView>();
  private structLabels = new Map<number, HTMLDivElement>();
  private structGroup = new THREE.Group();
  private bombViews = new Map<number, THREE.Mesh>();
  private effects = new Effects();
  private tracers = new Tracers();
  private rockets = new RocketViews();
  private debris = new Debris();
  private contrails = new Contrails();
  private chutes = new ParachuteViews();
  /** Uzak görünümde uçak simgeleri (takım renginde yön okları). */
  private icons: THREE.InstancedMesh;
  private dropLines: THREE.LineSegments;
  private selRing: THREE.Mesh;
  private structRing: THREE.Mesh;
  private routeLine: THREE.Line;
  private plannerLine: THREE.Line;
  private missionCircle: THREE.LineLoop;
  private ghostGroup = new THREE.Group();
  private ghostKey = '';
  private ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE.good, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false });
  private corridorMat = new THREE.LineBasicMaterial({ color: 0x4a4857, transparent: true, opacity: 0.6 });
  private coverage: THREE.InstancedMesh | null = null;
  private coverageKey = '';
  private aaRings = new THREE.Group();
  private aaKey = '';
  private shadowGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  private shadowMat = new THREE.MeshBasicMaterial({ color: 0x3a3542, transparent: true, opacity: 0.13, depthWrite: false });
  private bombGeo: THREE.BufferGeometry;
  private bombMat = new THREE.MeshLambertMaterial({ color: PALETTE.bomb, flatShading: true });
  private trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  private teamColors = PALETTE.teamTrail.map((c) => new THREE.Color(c));
  private iconColors = PALETTE.team.map((c) => new THREE.Color(c));

  /** preserveBuffer: çizilen kare sonradan okunabilsin (video kaydı). */
  constructor(container: HTMLElement, private readonly labelLayer: HTMLElement, opts: { preserveBuffer?: boolean } = {}) {
    // Oyun haritayı önceden yükler (main.ts); kayıt kipi ve görsel denetim yüklemez: eskisi gibi ilk harita, 300 km
    if (!terrainMap.key) loadMap(MAPS[0].id);
    // Ölçek 40 m'den 90 km'ye kadar değiştiği için logaritmik derinlik (uzakta z-fighting olmasın)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: !!opts.preserveBuffer });
    this.renderer.setPixelRatio(this.baseRatio);
    container.appendChild(this.renderer.domElement);

    // Ton eşleme: renkler pastel kalır (Neutral orta tonlara dokunmaz), yalnız parlaklar yumuşakça sıkışır
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.atmosphere = new Atmosphere(this.scene);
    this.clouds = new Clouds(this.scene);

    computeLandcover();
    this.terrain = new TerrainView(this.scene);
    this.scenery = new Scenery(this.scene);
    this.scene.add(this.structGroup, this.effects.mesh, this.tracers.mesh, this.rockets.mesh, this.ghostGroup, this.aaRings);
    this.scene.add(this.debris.mesh, this.chutes.group, this.contrails.mesh);
    // Ok biçimli simge: burun +Z, XZ düzleminde
    const arrow = new THREE.Shape();
    arrow.moveTo(0, 1);
    arrow.lineTo(0.62, -0.75);
    arrow.lineTo(0, -0.35);
    arrow.lineTo(-0.62, -0.75);
    arrow.lineTo(0, 1);
    this.icons = new THREE.InstancedMesh(
      new THREE.ShapeGeometry(arrow).rotateX(Math.PI / 2).rotateY(Math.PI),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      MAX_AC,
    );
    this.icons.count = 0;
    this.icons.frustumCulled = false;
    this.icons.renderOrder = 8;
    this.icons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.icons.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.icons);

    const dl = new THREE.BufferGeometry();
    dl.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_AC * 6), 3).setUsage(THREE.DynamicDrawUsage));
    dl.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_AC * 8), 4).setUsage(THREE.DynamicDrawUsage));
    this.dropLines = new THREE.LineSegments(dl, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.dropLines.frustumCulled = false;
    this.scene.add(this.dropLines);

    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.structRing = new THREE.Mesh(
      new THREE.RingGeometry(0.975, 1, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }),
    );
    this.structRing.visible = false;
    this.structRing.renderOrder = 6;
    this.scene.add(this.structRing);

    const mkLine = (color: number, opacity: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 100, gapSize: 70, transparent: true, opacity, depthTest: false }));
      l.frustumCulled = false;
      l.visible = false;
      l.renderOrder = 5;
      this.scene.add(l);
      return l;
    };
    this.routeLine = mkLine(0x4a4857, 0.6);
    this.plannerLine = mkLine(0x2f5d4f, 0.9);
    const circ: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      circ.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    this.missionCircle = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(circ),
      new THREE.LineBasicMaterial({ color: 0x4a4857, transparent: true, opacity: 0.45, depthTest: false }),
    );
    this.missionCircle.visible = false;
    this.scene.add(this.missionCircle);

    const bombPts = [[1.2, 0], [0.9, 0.22], [0.1, 0.28], [-0.8, 0.22], [-1.1, 0.06]].map(
      ([z, r]) => new THREE.Vector2(Math.max(r, 0.001), z),
    );
    this.bombGeo = new THREE.LatheGeometry(bombPts, 6).rotateX(Math.PI / 2);

    this.rig = new CameraRig(this.camera, this.renderer.domElement);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.fixedBuffer = !!opts.preserveBuffer;
    this.applyGraphics();
    onSettingsChange(() => this.applyGraphics());
  }

  /** Grafik kalitesi ve çözünürlük ayarını uygula (ayar değişince de çağrılır). */
  applyGraphics(): void {
    const q = quality();
    this.scenery.setQuality(q.treeNear, q.treeThin, q.treeFade, q.settle);
    this.effects.setLimit(q.puffs);
    this.clouds.setDensity(settings.graphics.clouds ? q.clouds : 0);
    waterU.waterQ.value = q.water ? 1 : 0;
    waterU.terrDetail.value = q.ground;
    // Model ayrıntısı değişince uçaklar yeniden kurulur (sonraki karede yeni ayrıntıyla)
    if (q.models !== this.modelDetail) {
      this.modelDetail = q.models;
      for (const v of this.views.values()) this.removeView(v);
      this.views.clear();
    }
    this.applyResolution();
  }

  private applyResolution(): void {
    const r = settings.graphics.resolution;
    const k = r === 'auto' ? this.resAuto.scale : Number(r);
    const ratio = this.baseRatio * k;
    if (Math.abs(this.renderer.getPixelRatio() - ratio) < 1e-3) return;
    this.renderer.setPixelRatio(ratio);
    this.resize();
  }

  /**
   * Otomatik çözünürlük: kare süresinin ortalaması 2 sn boyunca 21 ms'yi aşarsa çözünürlük kademeli düşer, 6 sn boyunca
   * 13 ms altında kalırsa geri çıkar. Video kaydında kapalı (kareler zaten zamandan bağımsız).
   */
  private autoResolution(realDt: number): void {
    if (this.fixedBuffer || settings.graphics.resolution !== 'auto' || realDt <= 0 || realDt > 0.1) return;
    const a = this.resAuto;
    a.ema += (realDt * 1000 - a.ema) * 0.05;
    a.t += realDt;
    // Yüksek piksel oranlı telefonda %45'e kadar, masaüstünde %75'e kadar
    const min = this.baseRatio >= 1.5 ? 0.45 : 0.75;
    let next = a.scale;
    if (a.t > 1.5 && a.ema > 20 && a.scale > min) next = Math.max(min, a.scale - 0.15);
    else if (a.t > 6 && a.ema < 13 && a.scale < 1) next = Math.min(1, a.scale + 0.1);
    if (next === a.scale) return;
    a.scale = next;
    a.t = 0;
    this.applyResolution();
  }

  get dom(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setWorld(world: World): void {
    for (const v of this.views.values()) this.removeView(v);
    this.views.clear();
    for (const m of this.bombViews.values()) this.scene.remove(m);
    this.bombViews.clear();
    for (const sv of this.structViews.values()) this.scene.remove(sv.ring);
    this.structViews.clear();
    for (const l of this.structLabels.values()) l.remove();
    this.structLabels.clear();
    this.structGroup.clear();
    this.effects.clear();
    this.contrails.clear();
    this.debris.clear();
    this.coverageKey = '';
    this.aaKey = '';
    this.world = world;
    this.playerTeam = world.playerTeam;
    this.lastTime = world.time;
  }

  /** Uçağın ekranda çizildiği (ara değerlenmiş) konum. */
  viewPos(ac: Aircraft): THREE.Vector3 {
    return this.views.get(ac.id)?.ip ?? ac.pos;
  }

  /** Yeni yüklenen harita için arazi örtüsü, arazi ve süsleri hemen kur (yükleme ekranı açıkken). */
  prepareMap(): void {
    computeLandcover();
    this.terrain.update(this.camera);
    this.scenery.rebuild();
  }

  frame(realDt: number, alpha = 1): void {
    const w = this.world;
    if (!w) return;
    this.alpha = alpha;
    const simDt = Math.max(0, w.time - this.lastTime);
    this.lastTime = w.time;
    this.autoResolution(realDt);
    this.rig.update(realDt);
    this.updateClearings(w);
    // Harita değiştiyse önce arazi örtüsü, sonra arazi ve süs yeniden kurulur
    computeLandcover();
    this.terrain.update(this.camera);
    this.scenery.rebuild();
    this.scenery.update(this.rig.distance, settings.map.scenery, this.camera.position);
    const vis = this.rig.fxScale;
    const ms = this.rig.modelScale;
    // Gün döngüsü: dünya zamanından saat (ayar kapalıysa hep gündüz)
    const hour = settings.graphics.dayCycle ? dayHour(w.time, this.clockShift) : FIXED_HOUR;
    if (hour !== this.atmosphere.hour) {
      this.atmosphere.setTime(hour);
      this.scenery.setLight(this.atmosphere.skyLight);
    }
    this.atmosphere.update(this.camera);
    waterU.waterTime.value = w.time;
    archU.archNight.value = this.atmosphere.night;
    this.clouds.update(
      this.camera, w.time, this.rig.distance, this.rig.target, this.atmosphere.sunDir, this.atmosphere.skyLight,
      this.atmosphere.cloudGlow, !this.rig.director || this.cinemaClearClouds,
    );
    // Yoğuşma izi ışıksız: gök kararınca o da kararır (gece yalnız ay ışığında soluk görünür). Gün batımında yüksek
    // bulutlar gibi güneşin son ışığını alır: beyazdan turuncu-pembeye döner
    const glow = this.atmosphere.glow;
    (this.contrails.mesh.material as THREE.MeshBasicMaterial).color.setScalar(0.98 * this.atmosphere.skyLight ** 2 * (1 - 0.55 * glow))
      .add(_glow.copy(this.atmosphere.cloudGlow).multiplyScalar(1.3));

    this.syncStructures(w, simDt);
    this.syncAircraft(w, simDt, vis, ms);
    this.syncIcons(w);
    this.syncBombs(w, ms);
    this.consumeEvents(w, vis);
    this.debris.update(simDt, this.effects, simDt > 0 && settings.map.effects, ms);
    this.chutes.update(w.parachutes, ms);
    this.tracers.mesh.visible = settings.map.tracers;
    if (settings.map.tracers) this.tracers.update(w.bullets, settings.tracerScale, this.camera, this.renderer.domElement.clientHeight);
    this.rockets.update(w.rockets, vis, this.effects, simDt > 0 && settings.map.effects);
    this.effects.mesh.visible = settings.map.effects;
    this.effects.update(simDt, this.camera);
    this.syncOverlays(w);
    this.updateLabels(ms);
    this.renderer.render(this.scene, this.camera);
  }

  /** Yapı tabanlarını süs katmanına bildir (ağaç, ev, tarla temizlenir). */
  private updateClearings(w: World): void {
    let key = '';
    for (const s of w.structures) if (!s.destroyed) key += `${s.id},`;
    if (key === this.clearKey) return;
    this.clearKey = key;
    setClearings(w.structures.filter((s) => !s.destroyed).map((s) => ({
      x: s.pos.x, z: s.pos.z, r: s.kind === 'airbase' ? 1500 : Math.hypot(s.def.halfW, s.def.halfL) + 25,
    })));
  }

  /** Savaş sisi: oyuncu bu düşmanı biliyor mu. */
  isVisible(ac: Aircraft): boolean {
    const w = this.world;
    if (!w || !settings.map.fogOfWar || ac.team === this.playerTeam) return true;
    if (w.teams[this.playerTeam].intel.contacts.has(ac.id)) return true;
    for (const f of w.flights) if (f.team === this.playerTeam && f.contacts.has(ac.id)) return true;
    return false;
  }

  /** Ekran noktasına en yakın uçak ya da yapı. */
  pick(x: number, y: number, filter?: (a: Aircraft) => boolean): Pick {
    const ac = this.pickAircraft(x, y, 26, filter);
    if (ac) return { kind: 'aircraft', ac };
    const s = this.pickStructure(x, y);
    return s ? { kind: 'structure', s } : null;
  }

  pickAircraft(x: number, y: number, maxPx = 26, filter?: (a: Aircraft) => boolean): Aircraft | null {
    const w = this.world;
    if (!w) return null;
    const r = this.dom.getBoundingClientRect();
    let best: Aircraft | null = null;
    let bestD = maxPx;
    for (const ac of w.aircraft) {
      if (ac.status !== 'flying' || !this.isVisible(ac)) continue;
      if (filter && !filter(ac)) continue;
      _v.copy(ac.pos).project(this.camera);
      if (_v.z > 1) continue;
      const d = Math.hypot(((_v.x + 1) / 2) * r.width - x, ((1 - _v.y) / 2) * r.height - y);
      if (d < bestD) {
        bestD = d;
        best = ac;
      }
    }
    return best;
  }

  pickStructure(x: number, y: number, filter?: (s: Structure) => boolean): Structure | null {
    const w = this.world;
    if (!w) return null;
    const g = this.groundPoint(x, y);
    const r = this.dom.getBoundingClientRect();
    let best: Structure | null = null;
    let bestD = Infinity;
    for (const s of w.structures) {
      if (filter && !filter(s)) continue;
      _v.copy(s.pos).project(this.camera);
      if (_v.z > 1) continue;
      let d = Math.hypot(((_v.x + 1) / 2) * r.width - x, ((1 - _v.y) / 2) * r.height - y);
      if (g) {
        const reach = s.kind === 'airbase' ? RUNWAY_HALF : s.def.radius * 2.2;
        const gd = Math.hypot(g.x - s.pos.x, g.z - s.pos.z);
        if (gd < reach) d = Math.min(d, 10);
      }
      if (d < 30 && d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  groundPoint(x: number, y: number): THREE.Vector3 | null {
    const out = new THREE.Vector3();
    return this.rig.groundAt(x, y, out) ? out : null;
  }

  /** Radar kapsama katmanını yeniden hesaplanmaya zorla. */
  invalidateCoverage(): void {
    this.coverageKey = '';
  }

  // --- Yapılar -----------------------------------------------------------------

  private syncStructures(w: World, simDt: number): void {
    for (const s of w.structures) {
      let v = this.structViews.get(s.id);
      if (!v) {
        v = new StructureView(s);
        this.structViews.set(s.id, v);
        this.structGroup.add(v.group);
        this.scene.add(v.ring);
        const lbl = document.createElement('div');
        lbl.className = `slabel t${s.team}`;
        lbl.textContent = s.name;
        this.labelLayer.appendChild(lbl);
        this.structLabels.set(s.id, lbl);
      }
      v.sync(simDt);
      v.ring.visible = this.rings;
      // Hasarlı yapı tüter
      const ratio = s.hp / s.maxHp;
      if (ratio < 0.7 && w.time >= v.nextSmoke && settings.map.effects) {
        // Yangın noktaları ilk dumanda seçilir (büyük yapıda üç, küçükte bir); her sütun kendi noktasından
        if (!v.firePts) {
          v.firePts = Array.from({ length: s.def.radius > 60 ? 3 : 1 }, () => {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * s.def.radius * 0.55;
            return [Math.cos(a) * r, Math.sin(a) * r];
          });
        }
        v.nextSmoke = w.time + (0.25 + ratio * 0.6) / v.firePts.length;
        const [fx, fz] = v.firePts[Math.floor(Math.random() * v.firePts.length)];
        _v.set(s.pos.x + fx + (Math.random() - 0.5) * 8, s.pos.y + 15, s.pos.z + fz + (Math.random() - 0.5) * 8);
        this.effects.buildingSmoke(_v, ratio < 0.3, this.cinemaSmoke);
      }
      // Uçaksavar namlu alevleri
      if (s.aa && settings.map.effects) {
        s.aa.mounts.forEach((m, i) => {
          if (w.time - m.lastFire < simDt + 1e-4 && simDt > 0) {
            // Alev modeldeki namlu ucundan (yükseliş açısı dahil); model yoksa yuvanın önünden
            const wd = AA_WEAPONS[m.weapon];
            if (!v.muzzleWorld(i, _v)) {
              const [ox, oz] = AASite.mountOffset(i);
              const reach = m.weapon === 'aa128' ? 8 : wd.medium ? 5 : 3;
              _v.set(s.pos.x + ox + Math.sin(m.yaw) * reach, s.pos.y + 3, s.pos.z + oz - Math.cos(m.yaw) * reach);
            }
            this.effects.muzzle(_v, Math.min(this.rig.fxScale, 4) * (m.weapon === 'aa128' ? 4 : wd.medium ? 3 : 1.5));
          }
        });
      }
    }
  }

  // --- Uçaklar ---------------------------------------------------------------

  private createView(ac: Aircraft): AircraftView {
    // Gerçek boya (takım rengi yok: dost ve düşman etiket renginden); ayrıntı kaliteye göre
    const model = buildAircraftModel(ac.spec.model, { detail: this.modelDetail });
    const root = new THREE.Group();
    root.add(model.root);
    const stores = buildStoreMeshes(ac.spec.model, ac.spec, ac.stores.slots, this.modelDetail);
    for (const sm of stores) if (sm) model.root.add(sm);
    this.scene.add(root);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    this.scene.add(shadow);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((TRAIL_N + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((TRAIL_N + 1) * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const trail = new THREE.Line(g, this.trailMat);
    trail.frustumCulled = false;
    this.scene.add(trail);
    const label = document.createElement('div');
    label.className = `label t${ac.team}`;
    label.textContent = ac.label;
    this.labelLayer.appendChild(label);
    return {
      ac, root, model, stores, shadow, trail, ip: ac.pos.clone(), iq: ac.quat.clone(),
      trailBuf: new Float32Array(TRAIL_N * 3), trailHead: 0, trailCount: 0,
      lastSample: -1, lastSmoke: -1, lastMuzzle: -1,
      trailColor: this.teamColors[ac.team] ?? this.teamColors[0],
      label, visible: true, fine: true,
    };
  }

  private removeView(v: AircraftView): void {
    this.scene.remove(v.root, v.shadow, v.trail);
    v.trail.geometry.dispose();
    v.label.remove();
  }

  private syncAircraft(w: World, simDt: number, vis: number, ms: number): void {
    const alive = new Set<number>();
    const dlPos = this.dropLines.geometry.attributes.position.array as Float32Array;
    const dlCol = this.dropLines.geometry.attributes.color.array as Float32Array;
    let dl = 0;
    const m = settings.map;
    // Ekran yarıçapı (CSS piksel) = metre × pxPerM / uzaklık
    const pxPerM = this.renderer.domElement.clientHeight / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const finePx = this.rig.director ? FINE_PX / 2 : FINE_PX;
    propU.discSpin.value += simDt * 1.7;

    this.contrails.begin();
    for (const ac of w.aircraft) {
      let v = this.views.get(ac.id);
      if (!v) {
        v = this.createView(ac);
        this.views.set(ac.id, v);
      }
      alive.add(ac.id);
      v.visible = this.isVisible(ac);
      // Uzak görünümde simge modelin yerini alır (üst üste binmesin)
      const iconified = this.rig.iconMode && settings.map.icons && ac.status === 'flying' && !ac.onGround;
      v.root.visible = v.visible && !iconified;
      // Yerdeyken gerçek ölçek (pistte devasa görünmesin)
      const scale = ac.onGround ? Math.min(ms, 2) : ms;
      if (ac.prevValid && ac.status === 'flying') {
        v.ip.lerpVectors(ac.prevPos, ac.pos, this.alpha);
        v.iq.slerpQuaternions(ac.prevQuat, ac.quat, this.alpha);
      } else {
        v.ip.copy(ac.pos);
        v.iq.copy(ac.quat);
      }
      v.root.position.copy(v.ip);
      v.root.quaternion.copy(v.iq);
      v.root.scale.setScalar(scale);
      const running = ac.status === 'flying' && ac.totalFuel > 0;
      const spin = running ? 45 + ac.controls.throttle * 30 : 6;
      for (const p of v.model.props) p.rotation.z += simDt * spin;
      // Hızlı dönen pervane: palalar yerine bulanık disk (60 kare/sn'de palalar zaten kareden kareye atlar)
      const blur = spin > 20;
      for (const p of v.model.props) p.visible = !blur;
      if (v.model.disc) v.model.disc.visible = blur;
      // Ekranda küçük kalan uçakta küçük ayrıntılar çizilmez (gövde, pervane diski ve askılar kalır)
      const px = (v.model.radius * scale * pxPerM) / Math.max(1, this.camera.position.distanceTo(v.ip));
      const fine = v.fine ? px > finePx : px > finePx * 1.25;
      if (fine !== v.fine) {
        v.fine = fine;
        for (const o of v.model.fine) o.visible = fine;
      }
      // Yoğuşma izi: her motorun arkasından (irtifaya göre; motor çalışmıyorsa yok)
      if (m.effects && v.visible) {
        const k = running ? contrailAmount(ac.pos.y) : 0;
        v.model.emitters.forEach((e, i) => {
          _w.copy(e).applyQuaternion(v.iq).add(v.ip);
          this.contrails.feed(`${ac.id}:${i}`, _w, k, w.time);
        });
      }
      // Askılardaki mühimmat: kalan adet kadar
      ac.stores.slots.forEach((sl, i) => {
        const sm = v.stores[i];
        if (sm) sm.count = sl.n;
      });

      const g = groundLevel(ac.pos.x, ac.pos.z);
      if (v.model.gear) v.model.gear.visible = ac.onGround || (ac.status === 'flying' && ac.controls.flaps && ac.pos.y - g < 350);
      v.shadow.visible = m.shadows && v.visible && !ac.onGround;
      v.shadow.position.set(v.ip.x, g + 1, v.ip.z);
      v.shadow.scale.setScalar(scale * ac.spec.span * 0.4);

      v.trail.visible = m.trails && v.visible && !ac.onGround;
      if (v.trail.visible) this.updateTrail(v, w.time);

      if (m.effects && v.visible && simDt > 0) {
        const d = ac.damage;
        const burning = ac.status === 'falling' || d.fire > 0;
        const damaged = Math.max(...d.engines) > 0.3 || ac.hp < ac.hpMax * 0.5 || d.heat > 0.6;
        const leak = d.fuelLeak > 0.4;
        if (burning || damaged || leak) {
          const interval = burning ? 0.1 : 0.16;
          if (w.time - v.lastSmoke > interval) {
            v.lastSmoke = w.time;
            this.effects.smokeTrail(ac.pos, Math.max(ms, Math.min(vis, 8) * 0.6), burning ? 'burning' : damaged ? 'damaged' : 'leak');
          }
        }
        if (w.time - v.lastMuzzle > 0.07) {
          if (ac.firing) {
            _v.copy(ac.pos).addScaledVector(ac.fwd, 5 * scale);
            this.effects.muzzle(_v, vis);
            v.lastMuzzle = w.time;
          }
          for (const t of ac.turrets) {
            if (!t.firing) continue;
            turretWorldPos(ac, t, _v);
            _v.addScaledVector(t.aim, 2 * scale);
            this.effects.muzzle(_v, vis * 0.7);
            v.lastMuzzle = w.time;
          }
        }
      }

      if (m.dropLines && dl < MAX_AC && ac.status === 'flying' && !ac.onGround && v.visible) {
        const o = dl * 6;
        dlPos[o] = dlPos[o + 3] = v.ip.x;
        dlPos[o + 1] = v.ip.y;
        dlPos[o + 4] = g + 1;
        dlPos[o + 2] = dlPos[o + 5] = v.ip.z;
        const c = v.trailColor;
        const sel = ac.id === this.selectedAircraftId;
        const oc = dl * 8;
        dlCol[oc] = dlCol[oc + 4] = c.r;
        dlCol[oc + 1] = dlCol[oc + 5] = c.g;
        dlCol[oc + 2] = dlCol[oc + 6] = c.b;
        dlCol[oc + 3] = sel ? 0.9 : 0.4;
        dlCol[oc + 7] = sel ? 0.5 : 0.1;
        dl++;
      }
    }
    for (const [id, v] of this.views) {
      if (!alive.has(id)) {
        this.removeView(v);
        this.views.delete(id);
      }
    }
    this.contrails.mesh.visible = m.effects;
    if (m.effects) this.contrails.end(this.camera, w.time);
    const dg = this.dropLines.geometry;
    dg.setDrawRange(0, dl * 2);
    dg.attributes.position.needsUpdate = true;
    dg.attributes.color.needsUpdate = true;

    // Seçim halkası
    const sel = this.selectedAircraftId !== null ? w.aircraftById(this.selectedAircraftId) : undefined;
    const ss = this.selectedStructureId !== null ? w.structureById(this.selectedStructureId) : undefined;
    this.selRing.visible = !!sel;
    if (sel) {
      const sp = this.viewPos(sel);
      this.selRing.position.set(sp.x, groundLevel(sp.x, sp.z) + 2, sp.z);
      this.selRing.scale.setScalar(Math.max(ms * sel.spec.span * 0.9, 26 / this.rig.pixelsPerMeter));
    }
    this.structRing.visible = !!ss && !sel;
    if (ss) {
      this.structRing.position.set(ss.pos.x, ss.pos.y + 3, ss.pos.z);
      const pulse = 1 + Math.sin(performance.now() / 300) * 0.03;
      this.structRing.scale.setScalar(Math.max(ss.kind === 'airbase' ? 1500 : ss.def.radius * 1.6 + 40, 22 / this.rig.pixelsPerMeter) * pulse);
    }
  }

  /** Uzak görünüm: her uçak için ekran boyutu sabit, takım renginde yön oku. */
  private syncIcons(w: World): void {
    const on = this.rig.iconMode && settings.map.icons;
    this.icons.visible = on;
    if (!on) return;
    const ppm = this.rig.pixelsPerMeter;
    const size = 9 / ppm;
    let n = 0;
    for (const ac of w.aircraft) {
      if (ac.status !== 'flying' || ac.onGround || n >= MAX_AC) continue;
      if (!this.isVisible(ac)) continue;
      const h = Math.atan2(ac.fwd.x, ac.fwd.z);
      _q.setFromAxisAngle(_up, h);
      const sel = ac.id === this.selectedAircraftId;
      _s.setScalar(size * (sel ? 1.35 : 1) * (ac.spec.span > 20 ? 1.25 : 1));
      _m.compose(this.viewPos(ac), _q, _s);
      this.icons.setMatrixAt(n, _m);
      this.icons.setColorAt(n, sel ? _white : this.iconColors[ac.team] ?? _white);
      n++;
    }
    this.icons.count = n;
    this.icons.instanceMatrix.needsUpdate = true;
    if (this.icons.instanceColor) this.icons.instanceColor.needsUpdate = true;
  }

  private updateTrail(v: AircraftView, time: number): void {
    const ac = v.ac;
    if (time - v.lastSample >= TRAIL_DT || time < v.lastSample) {
      v.lastSample = time;
      const i = v.trailHead * 3;
      v.trailBuf[i] = ac.pos.x;
      v.trailBuf[i + 1] = ac.pos.y;
      v.trailBuf[i + 2] = ac.pos.z;
      v.trailHead = (v.trailHead + 1) % TRAIL_N;
      v.trailCount = Math.min(v.trailCount + 1, TRAIL_N);
    }
    const geo = v.trail.geometry;
    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.color.array as Float32Array;
    const n = v.trailCount;
    const start = (v.trailHead - n + TRAIL_N) % TRAIL_N;
    const c = v.trailColor;
    const maxA = ac.id === this.selectedAircraftId ? 0.95 : 0.7;
    for (let k = 0; k <= n; k++) {
      if (k < n) {
        const src = ((start + k) % TRAIL_N) * 3;
        pos[k * 3] = v.trailBuf[src];
        pos[k * 3 + 1] = v.trailBuf[src + 1];
        pos[k * 3 + 2] = v.trailBuf[src + 2];
      } else {
        pos[k * 3] = v.ip.x;
        pos[k * 3 + 1] = v.ip.y;
        pos[k * 3 + 2] = v.ip.z;
      }
      const a = Math.pow(k / Math.max(n, 1), 1.4) * maxA;
      col[k * 4] = c.r;
      col[k * 4 + 1] = c.g;
      col[k * 4 + 2] = c.b;
      col[k * 4 + 3] = a;
    }
    geo.setDrawRange(0, n + 1);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  private updateLabels(ms: number): void {
    const w = this.world!;
    const show = settings.map.labels && this.rig.distance < 90000;
    const iconLift = this.rig.iconMode ? 12 / this.rig.pixelsPerMeter : 0;
    const r = this.dom.getBoundingClientRect();
    const intel = w.teams[this.playerTeam].intel;
    for (const v of this.views.values()) {
      const ac = v.ac;
      // Uzak görünümde kol başına tek etiket (lider), yakında her uçak
      const fl = ac.flight;
      const grouped = this.rig.groupLabels && !!fl && ac.status === 'flying' && ac.id !== this.selectedAircraftId;
      const leader = grouped ? fl!.leader() : null;
      if (!show || !v.visible || ac.status === 'dead' || (grouped && leader !== ac)) {
        v.label.style.display = 'none';
        continue;
      }
      _v.copy(v.ip);
      _v.y += Math.max(ac.spec.span * 0.45 * (ac.onGround ? Math.min(ms, 2) : ms), iconLift);
      _v.project(this.camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) {
        v.label.style.display = 'none';
        continue;
      }
      v.label.style.display = '';
      const txt = grouped ? `${fl!.name} · ${fl!.formed.length}× ${ac.spec.abbr}` : ac.label;
      if (v.label.textContent !== txt) v.label.textContent = txt;
      v.label.style.transform = `translate(${(((_v.x + 1) / 2) * r.width).toFixed(1)}px, ${(((1 - _v.y) / 2) * r.height).toFixed(1)}px) translate(-50%, -100%)`;
      v.label.classList.toggle('sel', ac.id === this.selectedAircraftId);
      v.label.classList.toggle('down', ac.status === 'falling');
      const c = ac.team !== this.playerTeam ? intel.contacts.get(ac.id) : undefined;
      v.label.classList.toggle('radar', !!c && settings.map.contacts && w.time - c.lastRadar < 8);
    }
    // Yakında ad, uzakta yalnız yapı simgesi
    const named = this.rig.distance < 45000;
    for (const [id, lbl] of this.structLabels) {
      const s = w.structureById(id);
      // Şehir binaları kalabalık: yalnız yakında ya da seçiliyken etiketli
      if (!s || (s.def.category === 'city' && this.rig.distance > 7000 && id !== this.selectedStructureId)) {
        lbl.style.display = 'none';
        continue;
      }
      lbl.classList.toggle('icon', !named);
      _v.copy(s.pos);
      _v.y += 40;
      _v.project(this.camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) {
        lbl.style.display = 'none';
        continue;
      }
      lbl.style.display = '';
      lbl.style.transform = `translate(${(((_v.x + 1) / 2) * r.width).toFixed(1)}px, ${(((1 - _v.y) / 2) * r.height).toFixed(1)}px) translate(-50%, -50%)`;
      const pct = s.build < 1 ? L(` · inşaat %${Math.round(s.build * 100)}`, ` · building ${Math.round(s.build * 100)}%`) : s.destroyed ? L(' · yıkık', ' · destroyed') : '';
      const txt = named ? `${STRUCT_GLYPH[s.kind]} ${s.name}${pct}` : STRUCT_GLYPH[s.kind];
      if (lbl.textContent !== txt) lbl.textContent = txt;
      lbl.classList.toggle('sel', id === this.selectedStructureId);
    }
  }

  // --- Katmanlar -----------------------------------------------------------------

  private setLine(line: THREE.Line, pts: THREE.Vector3[]): void {
    const g = line.geometry;
    const arr = g.attributes.position.array as Float32Array;
    const n = Math.min(pts.length, 64);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = pts[i].x;
      arr[i * 3 + 1] = pts[i].y;
      arr[i * 3 + 2] = pts[i].z;
    }
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.computeBoundingSphere();
    line.computeLineDistances();
    const mat = line.material as THREE.LineDashedMaterial;
    const px = 1 / this.rig.pixelsPerMeter;
    mat.dashSize = 9 * px;
    mat.gapSize = 7 * px;
    line.visible = n >= 2;
  }

  private syncOverlays(w: World): void {
    // Seçili kolun rotası
    this.routeLine.visible = false;
    this.missionCircle.visible = false;
    const fl = this.routeFlightId !== null ? w.flightById(this.routeFlightId) : undefined;
    if (fl && settings.map.routes) {
      const pts: THREE.Vector3[] = [];
      const lead = fl.leader();
      if (lead) pts.push(lead.pos.clone());
      for (let i = fl.phase === 'enroute' ? fl.routeIndex : fl.route.length; i < fl.route.length; i++) {
        const p = fl.route[i];
        pts.push(new THREE.Vector3(p.x, fl.plan.lowLevel ? groundLevel(p.x, p.z) + fl.plan.agl : fl.plan.altitude, p.z));
      }
      const tp = w.missionTargetPos(fl);
      if (tp) pts.push(new THREE.Vector3(tp.x, Math.max(tp.y, groundLevel(tp.x, tp.z)) + 20, tp.z));
      if (fl.phase === 'rtb' || fl.phase === 'egress' || fl.phase === 'landing') {
        const b = w.airbaseById(fl.returnBaseId);
        if (b) pts.splice(1, pts.length - 1, b.s.pos.clone().setY(b.s.pos.y + 50));
      }
      this.setLine(this.routeLine, pts);
      if ((fl.plan.type === 'cap' || fl.plan.type === 'sweep') && fl.plan.targetPos) {
        this.missionCircle.visible = true;
        this.missionCircle.position.set(fl.plan.targetPos.x, groundLevel(fl.plan.targetPos.x, fl.plan.targetPos.z) + 30, fl.plan.targetPos.z);
        this.missionCircle.scale.setScalar(fl.plan.patrolRadius);
      }
    }
    // Planlayıcı önizlemesi
    if (this.plannerRoute && this.plannerRoute.length >= 2) this.setLine(this.plannerLine, this.plannerRoute);
    else this.plannerLine.visible = false;

    this.syncGhost();
    this.syncCoverage(w);
    this.syncAARings(w);
  }

  private syncGhost(): void {
    const g = this.ghost;
    if (!g) {
      this.ghostGroup.visible = false;
      return;
    }
    this.ghostGroup.visible = true;
    const def = STRUCTURE_DEFS[g.kind];
    const key = `${g.kind}`;
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      this.ghostGroup.clear();
      const foot = new THREE.Mesh(new THREE.BoxGeometry(def.halfW * 2, 14, def.halfL * 2).translate(0, 7, 0), this.ghostMat);
      this.ghostGroup.add(foot);
      if (g.kind === 'airbase') {
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
        const corridor = new THREE.LineSegments(lineGeo, this.corridorMat);
        corridor.name = 'corridor';
        corridor.frustumCulled = false;
        this.ghostGroup.add(corridor);
      }
    }
    this.ghostMat.color.setHex(g.ok ? PALETTE.good : PALETTE.bad);
    const y = groundLevel(g.x, g.z);
    this.ghostGroup.position.set(g.x, y, g.z);
    this.ghostGroup.rotation.y = Math.PI - g.heading;
    const corridor = this.ghostGroup.getObjectByName('corridor') as THREE.LineSegments | undefined;
    if (corridor) {
      // Her iki yöndeki yaklaşma koridoru (yerel koordinatta, pist ekseni +Z). Tepeye çarpan koridor kırmızı.
      const arr = corridor.geometry.attributes.position.array as Float32Array;
      let i = 0;
      let clear = 0;
      for (const sign of [1, -1] as const) {
        if (corridorMargin(g.x, g.z, y, g.heading, sign, Math.tan((5.5 * Math.PI) / 180), 4200) >= 0) clear++;
        const zEnd = -sign * (RUNWAY_HALF + 5500);
        const zStart = -sign * RUNWAY_HALF;
        const h = 5500 * Math.tan((4 * Math.PI) / 180);
        arr.set([0, 10, zStart, 0, 10 + h, zEnd], i);
        i += 6;
      }
      arr.set([0, 0, 0, 0, 0, 0], i);
      corridor.geometry.attributes.position.needsUpdate = true;
      this.corridorMat.color.setHex(clear > 0 ? 0x4a4857 : PALETTE.bad);
    }
  }

  private syncCoverage(w: World): void {
    if (!settings.map.radarCoverage) {
      if (this.coverage) this.coverage.visible = false;
      return;
    }
    // Tüm bilinen radarlar (düşmanınki de): alçak uçuş rotasını planlamak için kör bölgeler görülsün
    const radars = w.structures.filter((s) => s.radar && s.active);
    const key = radars.map((s) => `${s.id}:${s.radar!.level}`).join(',') + `|${settings.radarAgl}|${terrainEdits.version}`;
    if (key !== this.coverageKey) {
      this.coverageKey = key;
      if (this.coverage) {
        this.scene.remove(this.coverage);
        this.coverage.geometry.dispose();
      }
      const N = 96;
      const cells: { x: number; z: number; y: number; p: number; size: number; team: number }[] = [];
      for (const s of radars) {
        const r = s.radar!;
        const R = r.range * 1.1;
        const size = (2 * R) / N;
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const x = s.pos.x - R + (i + 0.5) * size;
            const z = s.pos.z - R + (j + 0.5) * size;
            if ((x - s.pos.x) ** 2 + (z - s.pos.z) ** 2 > R * R) continue;
            const gy = groundLevel(x, z);
            const p = detectProbabilityAt(s, r, x, gy + settings.radarAgl, z, 7);
            if (p > 0.05) cells.push({ x, z, y: gy, p, size, team: s.team });
          }
        }
      }
      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false, depthTest: false }),
        Math.max(cells.length, 1),
      );
      const lo = new THREE.Color(0xffffff);
      const hi = PALETTE.team.map((t) => new THREE.Color(t));
      const c = new THREE.Color();
      cells.forEach((cell, k) => {
        _s.set(cell.size, 1, cell.size);
        _w.set(cell.x, cell.y + 25, cell.z);
        _m.compose(_w, _q.identity(), _s);
        mesh.setMatrixAt(k, _m);
        // Düşük ihtimal soluk, yüksek ihtimal koyu takım rengi
        mesh.setColorAt(k, c.copy(lo).lerp(hi[cell.team] ?? hi[0], 0.3 + 0.7 * cell.p));
      });
      mesh.count = cells.length;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.coverage = mesh;
      this.scene.add(mesh);
    }
    if (this.coverage) this.coverage.visible = true;
  }

  private syncAARings(w: World): void {
    this.aaRings.visible = settings.map.aaRanges;
    if (!settings.map.aaRanges) return;
    const sites = w.structures.filter((s) => s.team === this.playerTeam && s.aa && !s.destroyed);
    const key = sites.map((s) => `${s.id}:${s.aa!.mounts.map((m) => m.weapon).join('')}`).join(',');
    if (key === this.aaKey) return;
    this.aaKey = key;
    this.aaRings.clear();
    for (const s of sites) {
      const ranges = [...new Set(s.aa!.mounts.map((m) => AA_WEAPONS[m.weapon].range))];
      for (const R of ranges) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2;
          const x = s.pos.x + Math.cos(a) * R;
          const z = s.pos.z + Math.sin(a) * R;
          pts.push(new THREE.Vector3(x, groundLevel(x, z) + 30, z));
        }
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: PALETTE.team[s.team], transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }),
        );
        line.renderOrder = 3;
        this.aaRings.add(line);
      }
    }
  }

  // --- Bombalar ve olaylar -----------------------------------------------------

  private syncBombs(w: World, ms: number): void {
    const alive = new Set<number>();
    for (const b of w.bombs) {
      alive.add(b.id);
      let m = this.bombViews.get(b.id);
      if (!m) {
        m = new THREE.Mesh(this.bombGeo, this.bombMat);
        this.scene.add(m);
        this.bombViews.set(b.id, m);
      }
      m.position.copy(b.pos);
      _v.copy(b.pos).add(b.vel);
      m.lookAt(_v);
      m.scale.setScalar(Math.max(ms, 1) * (b.mass >= 450 ? 1.8 : b.mass >= 200 ? 1.4 : 1));
    }
    for (const [id, m] of this.bombViews) {
      if (!alive.has(id)) {
        this.scene.remove(m);
        this.bombViews.delete(id);
      }
    }
  }

  private consumeEvents(w: World, vis: number): void {
    const fx = settings.map.effects;
    for (const e of w.events) {
      if (!fx) continue;
      switch (e.kind) {
        case 'airExplosion':
          this.effects.airExplosion(e.pos, Math.min(vis, 12), e.size);
          break;
        case 'debris':
          this.debris.spawn(e.pos, e.vel, e.count, e.size, e.burning);
          break;
        case 'groundExplosion':
          this.effects.groundExplosion(e.pos, e.size);
          break;
        case 'crash':
          this.effects.crash(e.pos, vis);
          break;
        case 'flak':
          this.effects.flak(e.pos, vis, e.size);
          break;
        case 'hit':
          this.effects.hit(e.pos, vis);
          break;
        case 'groundHit':
          if (Math.random() < 0.6) this.effects.groundHit(e.pos, vis, e.water);
          break;
        case 'rocket':
          this.effects.muzzle(e.pos, vis * 1.5);
          break;
        case 'structureDestroyed': {
          const s = w.structureById(e.id);
          if (s) this.effects.groundExplosion(s.pos, s.kind === 'airbase' ? 120 : 70);
          break;
        }
      }
    }
    w.events.length = 0;
  }
}
