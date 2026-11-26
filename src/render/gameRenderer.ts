import * as THREE from 'three';
import { BuildGrid, FootprintGhost, RangeRing, RoadGhost, RoadLayer, type GridFrame } from './roads';
import type { World } from '../sim/world';
import type { Aircraft } from '../sim/aircraft/aircraft';
import { STRUCTURE_DEFS, STRUCT_GLYPH, type Structure, type StructureKind } from '../sim/structures/structure';
import { FIRE_RADIUS } from '../sim/structures/fireStation';
import { fireVehicle } from './fireVehicles';
import { Traffic } from './traffic';
import { AA_WEAPONS, AASite } from '../sim/structures/airDefense';
import { detectProbabilityAt } from '../sim/structures/radar';
import { RUNWAY_HALF, corridorMargin } from '../sim/structures/airbase';
import { turretWorldPos } from '../sim/ai/gunner';
import { groundLevel, loadMap, terrainEdits, terrainMap } from '../sim/terrain';
import { gearHeight } from '../sim/aircraft/flightModel';
import { MAPS } from '../sim/maps';
import { CameraRig } from './camera';
import { TerrainView, waterU } from './terrain';
import { StructureView, placeKeyOf, structureRing, viewRadius } from './structures';
import { WRECK_PARTS, buildAircraftModel, buildStoreMeshes, fractureModel, propU, requestSkin, type AircraftModel, type WreckPart } from './models';
import { Wrecks } from './wreck';
import type { SimEvent } from '../sim/world';
import { Scenery } from './scenery';
import { DecorLayer } from './decor';
import { FarmLayer } from './farms';
import { bombGeometry } from './munitions';
import { computeLandcover, setClearings } from './landcover';
import { Debris, Effects, ParachuteViews, RocketViews, Tracers, type TrailKind } from './effects';
import { PALETTE } from './palette';
import { Atmosphere, FIXED_HOUR, WIND, dayHour } from './atmosphere';
import { ShadowRig } from './shadows';
import { Contrails, contrailAmount } from './contrails';
import { Clouds } from './clouds';
import { archU } from './arch';
import { updateLamps } from './lamps';
import { onSettingsChange, quality, settings } from '../ui/settings';
import { L } from '../i18n';
import { gpuInfo, type GpuInfo } from '../diag';

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
  lastMuzzle: number;
  trailColor: THREE.Color;
  label: HTMLDivElement;
  visible: boolean;
  /** Küçük ayrıntılar çiziliyor mu (ekrandaki boyuta göre, eşikte gidip gelmesin diye payla). */
  fine: boolean;
  /** Blender modelinde seyrek geometri çiziliyor mu (uzakta; payla). */
  lod: boolean;
  /** Türün Blender modeli yüklü mü (değilse yüklenince model yerinde yenilenir; düşük ayrıntıda hep evet). */
  skinReady: boolean;
  /** Hareketli parçaların o anki konumu (rad; takım 0 kalkık … 1 inik): kumandaya yumuşakça yaklaşır. */
  /**
   * Kumanda yüzeyleri ve hareketli parçaların anlık açıları. bay: bomba kapakları (0 kapalı, 1 açık); drop: son bombadan
   * bu yana süre; bombs: önceki karedeki bomba sayısı. rato: kalkış roketlerinin durumu (0 takılı, 1 yanıyor, 2 atıldı),
   * ratoT yanma süresi.
   */
  surf: { ail: number; ele: number; rud: number; flap: number; brake: number; gear: number; chk: number; bay: number; drop: number; bombs: number; rato: number; ratoT: number };
  /** Parçalanmış uçak (kanadı ya da kuyruğu koptu): ana ağlar parçalara bölündü, kopanlar gizli. */
  broken?: Set<WreckPart>;
  parts?: Partial<Record<WreckPart, THREE.Group>>;
}

const _jq = new THREE.Vector3(0, 1, 0);
/** Eklemi menteşe ekseninde döndür (eksen yoksa dikey). */
const _tAim = new THREE.Vector3();
const _tLoc = new THREE.Vector3();
const _tRest = new THREE.Vector3(0, 0, -1);
const _tInv = new THREE.Quaternion();
const _tGoal = new THREE.Quaternion();
const _rp = new THREE.Vector3();
/** Paraşütle sarkan kapsülün duruşu: dikey, paraşüt üstte (yerel y yukarı). */
const _ratoUp = new THREE.Quaternion();
/** Askıdayken kapsülün ekseni (yerel y) uçağın burnuna (yerel z) bakar. */
const _podFwd = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
/** Ar 234 C'nin kalkış roketi nozulları ve askıları (model ekseninde; models.ts ar234c ile aynı). */
const RATO_NOZZLE: [number, number, number][] = [[3.85, -0.12, -1.05], [-3.85, -0.12, -1.05]];
/** Walter HWK 109-500'ün yanma süresi (sn). */
const RATO_BURN = 30;

function hinge(j: THREE.Object3D | undefined, a: number): void {
  if (j) j.quaternion.setFromAxisAngle((j.userData.axis as THREE.Vector3 | undefined) ?? _jq, a);
}
const clampN = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Pist betonunun araziden yüksekliği (structures.ts: pist kutusu 1,2 m). */
const RUNWAY_TOP = 1.2;

/**
 * Küçük ayrıntıların (cam, koyu parçalar, pilot, lambalar, küçük eklemler) çizildiği en küçük ekran yarıçapı
 * (CSS piksel). Bu boyutta kanopi ve namlular 1–2 pikselin altında kalır; gizlenince fark görünmez, kalabalık kolda
 * çizim sayısı yarıya iner. Video kaydında yarısı.
 */
const FINE_PX = 10;
/**
 * Blender modelinde seyrek geometriye geçilen ekran yarıçapı (CSS piksel): aynı doku, üçgenin %20–40'ı. Bu boyutta (kanat
 * açıklığı ekranın yüksekliğinin ~beşte biri, telefonda) seyreltme görünmez; kalabalık gökte uçak başına üçgen üçte bire iner.
 */
const LOD_PX = 45;

/** Kurulacak yolun önizlemesi: b yoksa yalnız başlangıç işareti. */
export interface RoadPreview {
  ax: number;
  az: number;
  bx?: number;
  bz?: number;
  ok: boolean;
}

export interface Ghost {
  kind: StructureKind;
  x: number;
  z: number;
  heading: number;
  ok: boolean;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _acVel = new THREE.Vector3();
const _aaDir = new THREE.Vector3();
const _aaGround = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _white = new THREE.Color(0xffffff);
const _glow = new THREE.Color();

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  /** Ekran kartının adı ve yazılımla çizilip çizilmediği (diag.ts). */
  readonly gpu: GpuInfo;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 10, 200000);
  readonly rig: CameraRig;
  selectedAircraftId: number | null = null;
  selectedStructureId: number | null = null;
  /** Rotası gösterilecek kol. */
  routeFlightId: number | null = null;
  /** Görev planlayıcı önizlemesi. */
  plannerRoute: THREE.Vector3[] | null = null;
  /** Planlayıcının devriye bölgesi (yoksa null). */
  plannerArea: { x: number; z: number; r: number } | null = null;
  ghost: Ghost | null = null;
  /** Yol önizlemesi ve yerleşim ızgarası (inşa kipinde Game doldurur). */
  roadGhost: RoadPreview | null = null;
  gridFrame: GridFrame | null = null;
  playerTeam = 0;
  /** Yapıların takım halkaları (sinematik kayıtta kapalı). */
  rings = true;

  private world: World | null = null;
  private lastTime = 0;
  /** Son simülasyon adımından bu yana geçen oran (0..1). */
  private alpha = 1;
  private terrain: TerrainView;
  readonly atmosphere: Atmosphere;
  /** Güneş gölgesi (yalnız Yüksek kalite). */
  readonly shadows: ShadowRig;
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
  /** Harekâtın süsleri: köyler, tek evler, yıkıklar, terk edilmiş madenler (decor.ts). */
  private decor: DecorLayer;
  /** Haritanın çiftlikleri: yakında ayrıntılı model, uzakta kutular (yerleri scenery.ts seçer). */
  private farms: FarmLayer;
  private clearKey = '';
  private views = new Map<number, AircraftView>();
  /** Uçak modeli ayrıntısı (kalite ayarı: 0 low-poly, 1 yüksek çözünürlük). */
  private modelDetail = 1;
  /** Sinematik çekimde de kamera ile baktığı nokta arasındaki bulut açılsın (kayıt kipi, çekim seçeneği). */
  cinemaClearClouds = false;
  /** Yapı duman sütunlarının ömür çarpanı (kayıt kipi, çekim seçeneği; oyunda 1). */
  cinemaSmoke = 1;
  private structViews = new Map<number, StructureView>();
  /** Takım halkaları: her yapıda, görünüm ertelense de. */
  private structRings = new Map<number, THREE.Mesh>();
  /** Görülmüş yapılar: yeni kurulan yapı komşularının arazisini değiştirmiş olabilir (yalnız onlarda yeniden oturtma). */
  private knownStructs = new Set<number>();
  /** Dünya bağlandıktan sonraki ilk eşleme: görüşteki yapıların hepsi bütçesiz kurulur (yükleme ekranı açık). */
  private bulkViews = true;
  /**
   * Yapının ağır görünümü ekranda bu yarıçaptan (CSS px) büyük ve görüşteyse kurulur; küçüğün yalnız halkası ve etiketi
   * çizilir. Ana menünün arka planında (haritanın tamamı) 8, oyunda 3 (game.ts).
   */
  viewMinPx = 3;
  private structLabels = new Map<number, HTMLDivElement>();
  private structGroup = new THREE.Group();
  private bombViews = new Map<number, THREE.Mesh>();
  private effects = new Effects();
  private tracers = new Tracers();
  private rockets = new RocketViews();
  private debris = new Debris();
  /** Atılmış kalkış roketleri: paraşütle süzülerek düşer (yalnız görüntü). */
  private ratoDrops: { g: THREE.Group; vel: THREE.Vector3; t: number }[] = [];
  private ratoGeo: { pod: THREE.BufferGeometry; chute: THREE.BufferGeometry; podMat: THREE.Material; chuteMat: THREE.Material } | null = null;
  /** Parçalanan uçakların düşen parçaları (uçağın kendi modelinden). */
  private wrecks = new Wrecks();
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
  /** Planlayıcıdaki devriye bölgesi (merkez ve yarıçap). */
  private plannerCircle: THREE.LineLoop;
  private ghostGroup = new THREE.Group();
  private roadLayer = new RoadLayer();
  private roadGhostView = new RoadGhost();
  private buildGrid = new BuildGrid();
  /** Yerleşim işareti (yapının tabanı; silüet yok), itfaiye kapsama halkası ve yoldaki itfaiye araçları. */
  private footprint = new FootprintGhost();
  private fireRing = new RangeRing();
  private fireViews = new Map<string, THREE.Mesh>();
  /** Yollardaki sivil araçlar (yalnız görüntü). */
  private traffic = new Traffic();
  private corridorMat = new THREE.LineBasicMaterial({ color: 0x4a4857, transparent: true, opacity: 0.6 });
  private coverage: THREE.InstancedMesh | null = null;
  private coverageKey = '';
  private aaRings = new THREE.Group();
  private aaKey = '';
  private shadowGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  private shadowMat = new THREE.MeshBasicMaterial({ color: 0x3a3542, transparent: true, opacity: 0.13, depthWrite: false });
  private bombGeo: THREE.BufferGeometry;
  private bombMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.6 });
  private trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  private teamColors = PALETTE.teamTrail.map((c) => new THREE.Color(c));
  private iconColors = PALETTE.team.map((c) => new THREE.Color(c));

  /** preserveBuffer: çizilen kare sonradan okunabilsin (video kaydı). */
  constructor(container: HTMLElement, private readonly labelLayer: HTMLElement, opts: { preserveBuffer?: boolean } = {}) {
    // Oyun haritayı önceden yükler (main.ts); kayıt kipi ve görsel denetim yüklemez: eskisi gibi ilk harita, 300 km
    if (!terrainMap.key) loadMap(MAPS[0].id);
    // Ölçek 40 m'den 90 km'ye kadar değiştiği için logaritmik derinlik (uzakta z-fighting olmasın)
    // İki ekran kartlı bilgisayarda güçlü kart istenir (yoksa tarayıcı çoğu zaman dahili kartı seçer; 2026-11-25)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: !!opts.preserveBuffer, powerPreference: 'high-performance' });
    this.gpu = gpuInfo(this.renderer.getContext());
    // İnşaattaki yapı yerden yükselir: malzemenin kendi kırpma düzlemi (structures.ts)
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(this.baseRatio);
    container.appendChild(this.renderer.domElement);

    // Ton eşleme: renkler pastel kalır (Neutral orta tonlara dokunmaz), yalnız parlaklar yumuşakça sıkışır
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.atmosphere = new Atmosphere(this.scene);
    this.shadows = new ShadowRig(this.renderer, this.atmosphere.sun, this.scene);
    this.clouds = new Clouds(this.scene);

    computeLandcover();
    this.terrain = new TerrainView(this.scene);
    this.scenery = new Scenery(this.scene);
    this.decor = new DecorLayer(this.scene, this.labelLayer);
    this.farms = new FarmLayer(this.scene);
    this.scene.add(this.structGroup, this.effects.mesh, this.tracers.mesh, this.rockets.mesh, this.ghostGroup, this.aaRings);
    this.scene.add(this.roadLayer.mesh, this.roadGhostView.mesh, this.buildGrid.mesh, this.footprint.mesh, this.fireRing.line, this.traffic.group);
    this.scene.add(this.debris.mesh, this.wrecks.group, this.chutes.group, this.contrails.mesh);
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
    // Seçili kolun rotası planlayıcının önizlemesiyle aynı renkte (2026-11-25: soluk gri rota fark edilmiyordu)
    this.routeLine = mkLine(0x2f5d4f, 0.85);
    this.plannerLine = mkLine(0x2f5d4f, 0.9);
    const circ: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      circ.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const mkCircle = () => {
      const c = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(circ),
        new THREE.LineBasicMaterial({ color: 0x2f5d4f, transparent: true, opacity: 0.85, depthTest: false }),
      );
      c.visible = false;
      c.renderOrder = 5;
      this.scene.add(c);
      return c;
    };
    this.missionCircle = mkCircle();
    this.plannerCircle = mkCircle();

    // Genel amaçlı bomba: bantlar, tapa, kanatçık kutusu (munitions.ts)
    this.bombGeo = bombGeometry();

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
    this.shadows.setEnabled(settings.graphics.shadows && q.shadows);
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
    this.structViews.clear();
    for (const r of this.structRings.values()) this.scene.remove(r);
    this.structRings.clear();
    this.knownStructs = new Set(world.structures.map((s) => s.id));
    this.bulkViews = true;
    for (const m of this.fireViews.values()) this.scene.remove(m);
    this.fireViews.clear();
    for (const l of this.structLabels.values()) l.remove();
    this.structLabels.clear();
    this.structGroup.clear();
    this.effects.clear();
    this.contrails.clear();
    this.debris.clear();
    for (const d of this.ratoDrops) this.scene.remove(d.g);
    this.ratoDrops.length = 0;
    this.wrecks.clear();
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

  /**
   * thinned: pencere açıkken kareler seyrek çizilir; otomatik çözünürlük bunu yavaşlama sanmasın. draw false: sahne eşlenir,
   * çizilmez (warm).
   */
  frame(realDt: number, alpha = 1, thinned = false, draw = true): void {
    const w = this.world;
    if (!w) return;
    this.alpha = alpha;
    const simDt = Math.max(0, w.time - this.lastTime);
    this.lastTime = w.time;
    if (!thinned) this.autoResolution(realDt);
    this.rig.update(realDt);
    this.updateClearings(w);
    // Harita değiştiyse önce arazi örtüsü, sonra arazi ve süs yeniden kurulur
    computeLandcover();
    this.terrain.update(this.camera);
    this.scenery.rebuild();
    this.scenery.update(this.rig.distance, settings.map.scenery, this.camera.position);
    this.decor.sync(w, this.camera.position, this.rig.distance, settings.map.scenery);
    this.farms.sync(this.scenery.farmSpots, this.scenery.farmVersion, this.camera.position, this.rig.distance, settings.map.scenery);
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
    updateLamps(this.camera, this.renderer.domElement.clientHeight, w.time);
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
    this.roadLayer.update(w, this.rig.distance);
    this.syncFire(w);
    this.traffic.update(w, simDt, this.rig.distance);
    this.syncAircraft(w, simDt, vis, ms);
    this.syncIcons(w);
    this.syncBombs(w, ms);
    this.consumeEvents(w, vis);
    this.debris.update(simDt, this.effects, simDt > 0 && settings.map.effects, ms);
    this.updateRatoDrops(simDt);
    this.wrecks.group.visible = settings.map.effects;
    this.wrecks.update(simDt, this.effects, settings.map.effects, ms, vis);
    this.chutes.update(w.parachutes, ms);
    this.tracers.mesh.visible = settings.map.tracers;
    if (settings.map.tracers) this.tracers.update(w.bullets, settings.tracerScale, this.camera, this.renderer.domElement.clientHeight);
    this.rockets.update(w.rockets, vis, this.effects, simDt > 0 && settings.map.effects);
    this.effects.mesh.visible = settings.map.effects;
    this.effects.update(simDt, this.camera, simDt > 0 && settings.map.effects, vis);
    this.syncOverlays(w);
    this.updateLabels(ms);
    if (!draw) return;
    this.shadows.update(this.rig.target, this.camera, this.rig.distance, this.atmosphere.lightDir, realDt, [this.structGroup, this.farms.group, this.decor.group]);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Yükleme ekranı açıkken: sahne bir kez çizilmeden eşlenir (arazi, görüşteki yapılar, uçaklar), sonra gölgelendiriciler
   * arka planda derlenir (KHR_parallel_shader_compile; yoksa ilk kullanımda eskisi gibi). İlk çizim derlemeyi beklemez:
   * telefonda açılışın ilk karesi gölgelendiricileri bekleyerek saniyelerce donuyordu (2026-11-21).
   */
  async warm(): Promise<void> {
    this.frame(0, 1, false, false);
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  /** Yapı tabanlarını süs katmanına bildir (ağaç, ev, tarla temizlenir). */
  private updateClearings(w: World): void {
    let key = `${w.roadVersion}:`;
    for (const s of w.structures) if (!s.destroyed) key += `${s.id}:${Math.round(s.pos.x)}:${Math.round(s.pos.z)},`;
    if (key === this.clearKey) return;
    this.clearKey = key;
    const list = w.structures.filter((s) => !s.destroyed).map((s) => ({
      x: s.pos.x, z: s.pos.z, r: s.kind === 'airbase' ? 1500 : Math.hypot(s.def.halfW, s.def.halfL) + 25,
    }));
    // Yollar: şerit boyunca küçük daireler (yolda ağaç kalmasın)
    for (const r of w.roads) {
      const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
      const n = Math.max(1, Math.ceil(len / 20));
      for (let i = 0; i <= n; i++) list.push({ x: r.ax + ((r.bx - r.ax) * i) / n, z: r.az + ((r.bz - r.az) * i) / n, r: 12 });
    }
    setClearings(list);
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
        // Pistin alanındaki yapı öne geçer: skor eşitken listede önce gelen üs kazanıyor, bitişikteki fabrika hiç seçilemiyordu
        if (gd < reach) d = Math.min(d, s.kind === 'airbase' ? 10 : 9 * (gd / reach));
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

  /** Yeni kurulan ya da taşınan yapının düzleştirmesi yakındaki yapıların arazisini değiştirmiş olabilir: onları yeniden oturt. */
  private regroundNear(s: Structure): void {
    const reach = Math.hypot(s.def.halfW, s.def.halfL) + 600;
    for (const o of this.structViews.values()) {
      if (o.s !== s && Math.hypot(o.s.pos.x - s.pos.x, o.s.pos.z - s.pos.z) < reach + Math.hypot(o.s.def.halfW, o.s.def.halfL)) o.reground();
    }
  }

  /** Yapının ağır görünümü şimdi gerekli mi: görüş alanında ve ekranda viewMinPx'ten büyük. */
  private wantsView(s: Structure, pxPerM: number): boolean {
    // Video kaydı (sabit tampon): kamera uçarken yapılar kareye sonradan girmesin, hepsi baştan kurulur
    if (this.fixedBuffer) return true;
    const r = viewRadius(s);
    _sphere.center.copy(s.pos);
    _sphere.radius = r;
    if (!_frustum.intersectsSphere(_sphere)) return false;
    return (r / Math.max(1, this.camera.position.distanceTo(s.pos))) * pxPerM >= this.viewMinPx;
  }

  private syncStructures(w: World, simDt: number): void {
    // Ağır görünüm (on binlerce üçgenlik üs, fabrika, ev) yalnız görüşte ve ekranda birkaç pikselden büyük yapıya kurulur,
    // yakından uzağa ve kare başına ~6 ms bütçeyle (en az bir); halka ve etiket her yapıda. Eskiden bütün yapılar ilk karede
    // kuruluyordu: ana menü ve harekât başı telefonda saniyelerce donuyordu, ekranda 1–2 piksellik yapılar için (2026-11-21).
    const cam = this.camera;
    cam.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const pxPerM = this.renderer.domElement.clientHeight / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const bulk = this.bulkViews;
    this.bulkViews = false;
    const missing: Structure[] = [];
    for (const s of w.structures) {
      if (!this.knownStructs.has(s.id)) {
        this.knownStructs.add(s.id);
        this.regroundNear(s);
      }
      let ring = this.structRings.get(s.id);
      let v = this.structViews.get(s.id);
      if (v && v.placeKey !== placeKeyOf(s)) {
        // Taşındı ya da döndürüldü: görünüm yeni yerinde yeniden kurulur, yeni yerin komşuları oturtulur
        this.structGroup.remove(v.group);
        this.structViews.delete(s.id);
        v = undefined;
        this.regroundNear(s);
      }
      if (ring && ring.userData.place !== placeKeyOf(s)) {
        this.scene.remove(ring);
        ring = undefined;
      }
      if (!ring) {
        ring = structureRing(s);
        ring.userData.place = placeKeyOf(s);
        this.structRings.set(s.id, ring);
        this.scene.add(ring);
      }
      ring.visible = this.rings;
      if (v && s.fire && v.fireLevel !== s.fire.level) {
        // İtfaiye merkezi seviye atladı: yeni seviyenin modeli
        this.structGroup.remove(v.group);
        this.structViews.delete(s.id);
        v = undefined;
      }
      if (!this.structLabels.has(s.id)) {
        const lbl = document.createElement('div');
        lbl.className = `slabel t${s.team}`;
        lbl.textContent = s.name;
        this.labelLayer.appendChild(lbl);
        this.structLabels.set(s.id, lbl);
      }
      if (!v && this.wantsView(s, pxPerM)) missing.push(s);
    }
    // Yıkılıp kaldırılan yapı (oyuncunun yıkımı, world.demolishStructure): görünümü, halkası ve etiketi gider
    if (this.knownStructs.size > w.structures.length) {
      const alive = new Set(w.structures.map((s) => s.id));
      for (const id of this.knownStructs) {
        if (alive.has(id)) continue;
        this.knownStructs.delete(id);
        const v = this.structViews.get(id);
        if (v) this.structGroup.remove(v.group);
        this.structViews.delete(id);
        const r = this.structRings.get(id);
        if (r) this.scene.remove(r);
        this.structRings.delete(id);
        this.structLabels.get(id)?.remove();
        this.structLabels.delete(id);
      }
    }
    if (missing.length) {
      const t0 = performance.now();
      missing.sort((a, b) => cam.position.distanceToSquared(a.pos) - cam.position.distanceToSquared(b.pos));
      let made = 0;
      for (const s of missing) {
        if (!bulk && !this.fixedBuffer && made > 0 && performance.now() - t0 > 6) break;
        const v = new StructureView(s);
        this.structViews.set(s.id, v);
        this.structGroup.add(v.group);
        made++;
      }
    }
    for (const s of w.structures) {
      const v = this.structViews.get(s.id);
      if (!v) continue;
      v.sync(simDt);
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
            const [ox, oz] = AASite.mountOffset(i);
            if (!v.muzzleWorld(i, _v)) {
              const reach = m.weapon === 'aa128' ? 8 : wd.medium ? 5 : 3;
              _v.set(s.pos.x + ox + Math.sin(m.yaw) * reach, s.pos.y + 3, s.pos.z + oz - Math.cos(m.yaw) * reach);
            }
            // Namlu doğrultusu (pusula açısı ve yükseliş) ve yuvanın zemini (ağır topta kalkan toz)
            const cp = Math.cos(m.pitch);
            _aaDir.set(Math.sin(m.yaw) * cp, Math.sin(m.pitch), -Math.cos(m.yaw) * cp);
            _aaGround.set(s.pos.x + ox, s.pos.y, s.pos.z + oz);
            this.effects.gunFire(_v, _aaDir, this.rig.fxScale, wd.bore, _aaGround);
          }
        });
      }
    }
  }

  // --- Uçaklar ---------------------------------------------------------------

  /**
   * Hareketli parçalar (eklemi olan modellerde): kanatçık yuvarlanma hızına, irtifa dümeni istenen yüke, istikamet
   * dümeni dönüşe uyum için yuvarlanmaya göre; flap kalkışta 20°, inişte 55°; hava freni 55°. Takım ~4 sn'de katlanır
   * (ana bacaklar içe, burun bacağı öne), kalkıkken gizlenir; iniş farı takım inikken açık. Hepsi yumuşak geçişle.
   */
  private animateParts(v: AircraftView, dt: number, gearDown: boolean): void {
    const j = v.model.joints;
    if (!j.aileronL && !j.takimL) return;
    const ac = v.ac;
    const c = ac.controls;
    const s = v.surf;
    const fly = ac.status === 'flying' && !ac.onGround;
    const k = 1 - Math.exp(-dt * 10);
    const slow = 1 - Math.exp(-dt * 1.6);
    const roll = fly ? clampN(ac.rollRate / 2.5, -1, 1) : 0;
    // Pist başında dururken kumanda denetimi: kanatçıklar, irtifa ve istikamet dümeni sırayla bir yana bir yana
    const check = ac.onGround && ac.status === 'flying' && ac.speed < 4;
    s.chk = check ? s.chk + dt : 0;
    const w = s.chk * 2.4;
    s.ail += ((check ? Math.sin(w) * 0.3 : roll * 0.3) - s.ail) * k;
    s.ele += ((check ? Math.sin(w - 1.6) * 0.3 : fly ? clampN((c.nCmd - 1) / 6, -0.5, 1) * 0.35 : 0) - s.ele) * k;
    s.rud += ((check ? Math.sin(w * 0.7 - 3) * 0.35 : roll * 0.07) - s.rud) * k;
    // Flap: kalkış koşusunda 20° (havalanınca kalkar), inişte 55°
    const takeoffFlap = ac.onGround && c.throttle > 0.6 ? 0.35 : 0;
    s.flap += ((c.flaps ? takeoffFlap || 0.96 : takeoffFlap) - s.flap) * slow;
    s.brake += ((c.diveBrake ? 0.96 : 0) - s.brake) * slow;
    s.gear = gearDown ? Math.min(1, s.gear + dt / 4) : Math.max(0, s.gear - dt / 4);
    hinge(j.aileronL, -s.ail);
    hinge(j.aileronR, s.ail);
    hinge(j.elevatorL, s.ele);
    hinge(j.elevatorR, s.ele);
    hinge(j.flapL, -s.flap);
    hinge(j.flapR, -s.flap);
    hinge(j.flapDL, -s.flap);
    hinge(j.flapDR, -s.flap);
    hinge(j.rudder, s.rud);
    hinge(j.rudderR, s.rud);
    hinge(j.airbrakeL, -s.brake);
    hinge(j.airbrakeR, s.brake);
    // Parmak frenleri (B-57B iç kanadı) hava frenleriyle birlikte dikilir
    hinge(j.fingerL, -s.brake * 1.5);
    hinge(j.fingerR, s.brake * 1.5);
    // Bomba kapakları: kol bomba koşusuna başlayınca açılır (1,5 sn), son bombadan 5 sn sonra kapanır. Tu-14'te iki
    // kapak yanlara açılır; B-57B'nin dönen kapağı 180° döner, iç yüzündeki bombalar gövdenin altına çıkar (kapakta
    // bomba kalmayınca gizlenir)
    if (j.bayL || j.bayRot) {
      if (ac.bombCount < s.bombs) s.drop = 0;
      else s.drop += dt;
      s.bombs = ac.bombCount;
      const run = ac.flight?.bomb;
      const open = (!!run?.started && !run.released && ac.bombCount > 0) || s.drop < 5;
      s.bay = clampN(s.bay + ((open ? 1 : -1) * dt) / 1.5, 0, 1);
      const e = s.bay * s.bay * (3 - 2 * s.bay);
      hinge(j.bayL, e * 1.5);
      hinge(j.bayR, e * 1.5);
      hinge(j.bayRot, e * Math.PI);
      hinge(j.bayBombs, e * Math.PI);
      if (j.bayBombs) j.bayBombs.visible = ac.bombCount > 0 && v.fine;
    }
    // Kuyruk tareti (Tu-14 KDU-81): nişancının hedefine döner, hedef yokken yavaşça geriye bakar
    const tj = j.taret0;
    if (tj) {
      const t = ac.turrets[0];
      _tAim.set(0, 0, -1);
      if (t && t.targetId !== null && fly) {
        _tLoc.copy(t.aim).applyQuaternion(_tInv.copy(v.iq).invert()).normalize();
        if (_tLoc.z < 0.1) _tAim.copy(_tLoc);
      }
      _tGoal.setFromUnitVectors(_tRest, _tAim);
      tj.quaternion.slerp(_tGoal, 1 - Math.exp(-dt * 5));
    }
    if (j.rato) this.rato(v, dt);
    const up = (1 - s.gear) * (Math.PI / 2);
    hinge(j.takimL, -up);
    hinge(j.takimR, up);
    hinge(j.takimN, -up);
    hinge(j.kapakL, -up);
    hinge(j.kapakR, up);
    const show = s.gear > 0.01 && v.fine;
    for (const n of ['takimL', 'takimR', 'takimN', 'kapakL', 'kapakR']) if (j[n]) j[n].visible = show;
    if (v.model.landing) v.model.landing.visible = s.gear > 0.95 && (fly || ac.controls.throttle > 0.3);
    if (v.model.landingPool) v.model.landingPool.visible = !!v.model.landing?.visible && ac.onGround;
  }

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
      lastSample: -1, lastMuzzle: -1,
      trailColor: this.teamColors[ac.team] ?? this.teamColors[0],
      label, visible: true, fine: true, lod: false,
      skinReady: this.modelDetail ? requestSkin(ac.spec.model) : true,
      surf: { ail: 0, ele: 0, rud: 0, flap: 0, brake: 0, gear: ac.onGround ? 1 : 0, chk: 0, bay: 0, drop: 99, bombs: ac.bombCount, rato: ac.onGround ? 0 : 2, ratoT: 0 },
    };
  }

  /** Blender modeli yüklenince uçağın modelini yerinde yenile (iz, etiket ve gölge kalır). */
  private remodel(v: AircraftView): void {
    // Parçalanmış uçak yeni modelle bütünlenmesin
    if (v.broken) {
      v.skinReady = true;
      return;
    }
    v.root.remove(v.model.root);
    const model = buildAircraftModel(v.ac.spec.model, { detail: this.modelDetail });
    const stores = buildStoreMeshes(v.ac.spec.model, v.ac.spec, v.ac.stores.slots, this.modelDetail);
    for (const sm of stores) if (sm) model.root.add(sm);
    v.root.add(model.root);
    v.model = model;
    v.stores = stores;
    v.fine = true;
    v.lod = false;
    v.skinReady = true;
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
      if (!v.skinReady && requestSkin(ac.spec.model)) this.remodel(v);
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
      // Yere yakın uçak: tekerlekler pist betonunun üstünde (pist araziden 1,2 m yüksek çizilir) ve büyütülmüş model
      // de tekerleği üstünde kalsın (büyütme gövde ekseninden); 25 m'nin üstünde etkisi söner
      if (ac.status === 'flying') {
        const gh = gearHeight(ac.spec);
        const agl = v.ip.y - groundLevel(v.ip.x, v.ip.z) - gh;
        const near = 1 - Math.min(1, Math.max(0, (agl - 4) / 21));
        v.root.position.y += (RUNWAY_TOP + (scale - 1) * gh) * near;
      }
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
      const lod = v.lod ? px < LOD_PX * 1.15 : px < LOD_PX;
      if (lod !== v.lod) {
        v.lod = lod;
        for (const l of v.model.lods) l.mesh.geometry = lod ? l.lod : l.full;
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
      const gearDown = ac.onGround || (ac.status === 'flying' && ac.controls.flaps && ac.pos.y - g < 350);
      if (v.model.gear) v.model.gear.visible = gearDown;
      this.animateParts(v, simDt, gearDown);
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
        // Her karede: iz mesafeyle atılır (effects.ts trail), alev titrer
        if (burning || damaged || leak) this.damageSmoke(v, scale, Math.max(ms, Math.min(vis, 8) * 0.6), burning, leak);
        if (w.time - v.lastMuzzle > 0.07) {
          if (ac.firing) {
            // Çizilen uçağın (ara konum ve yön) burnunda: simülasyon konumu bir adım önde olabilir, alev burnun önünde kalıyordu
            _v.set(0, 0, 1).applyQuaternion(v.iq).multiplyScalar((ac.guns[0]?.muzzle ?? 5) * scale).add(v.ip);
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
    // Süslerin sönük işaretleri (decor.ts)
    this.decor.updateLabels(this.camera, r, settings.map.labels, this.rig.distance);
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
      // Görevin bütün güzergâhı: kalkış üssü → rota → hedef → dönüş üssü (2026-11-25: eskiden yalnız uçaktan hedefe; gidip gelirken
      // ve devriyedeyken yolun tamamı görünsün)
      const pts: THREE.Vector3[] = [];
      const alt = (x: number, z: number) => (fl.plan.lowLevel ? groundLevel(x, z) + fl.plan.agl : Math.max(fl.plan.altitude, groundLevel(x, z) + 50));
      const home = w.airbaseById(fl.baseId);
      if (home) pts.push(home.s.pos.clone().setY(home.s.pos.y + 50));
      for (const p of fl.route) pts.push(new THREE.Vector3(p.x, alt(p.x, p.z), p.z));
      const tp = w.missionTargetPos(fl);
      if (tp) pts.push(new THREE.Vector3(tp.x, fl.plan.type === 'cap' || fl.plan.type === 'sweep' ? alt(tp.x, tp.z) : Math.max(tp.y, groundLevel(tp.x, tp.z)) + 20, tp.z));
      const back = w.airbaseById(fl.returnBaseId);
      if (back && fl.plan.type !== 'ferry') pts.push(back.s.pos.clone().setY(back.s.pos.y + 50));
      if (pts.length < 2) {
        const lead = fl.leader();
        if (lead) pts.unshift(lead.pos.clone());
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
    const pa = this.plannerArea;
    this.plannerCircle.visible = !!pa;
    if (pa) {
      this.plannerCircle.position.set(pa.x, groundLevel(pa.x, pa.z) + 30, pa.z);
      this.plannerCircle.scale.setScalar(pa.r);
    }

    this.syncGhost();
    this.syncCoverage(w);
    this.syncAARings(w);
  }

  /** Yoldaki itfaiye araçları: her ekibin aracı yol üstünde, gidiş yönüne dönük. */
  private syncFire(w: World): void {
    const seen = new Set<string>();
    for (const s of w.structures) {
      if (!s.fire) continue;
      for (const c of s.fire.crews) {
        if (c.wait > 0) continue;
        const key = `${s.id}:${c.id}`;
        seen.add(key);
        let m = this.fireViews.get(key);
        if (!m) {
          m = fireVehicle(c.big);
          this.fireViews.set(key, m);
          this.scene.add(m);
        }
        // Yolun sağından gider (karşıdan gelenle üst üste binmez)
        const ox = c.x - Math.cos(c.heading) * 1.75;
        const oz = c.z + Math.sin(c.heading) * 1.75;
        m.position.set(ox, groundLevel(ox, oz) + 0.45, oz);
        m.rotation.y = c.heading;
      }
    }
    for (const [k, m] of this.fireViews) {
      if (seen.has(k)) continue;
      this.scene.remove(m);
      this.fireViews.delete(k);
    }
  }

  private syncGhost(): void {
    this.roadGhostView.set(this.roadGhost);
    this.buildGrid.set(this.gridFrame);
    const g = this.ghost;
    // Yerleşim işareti: yalnız taban (hangi tasarımın geleceği görünmez; kurulunca belli olur)
    const def = g ? STRUCTURE_DEFS[g.kind] : null;
    this.footprint.set(g && def ? { x: g.x, z: g.z, heading: g.kind === 'aa' ? 0 : g.heading, halfW: def.halfW, halfL: def.halfL, ok: g.ok, axis: g.kind === 'airbase' } : null);
    // İtfaiye kapsama alanı: merkezi yerleştirirken ve kendi merkezin seçiliyken
    const sel = this.world?.structures.find((x) => x.id === this.selectedStructureId && x.fire && x.team === this.playerTeam && !x.destroyed);
    this.fireRing.set(g?.kind === 'firestation' ? { x: g.x, z: g.z, r: FIRE_RADIUS[1] } : sel?.fire ? { x: sel.pos.x, z: sel.pos.z, r: sel.fire.radius } : null);
    if (!g) {
      this.ghostGroup.visible = false;
      return;
    }
    // Hava üssü: yaklaşma koridoru çizgileri
    this.ghostGroup.visible = g.kind === 'airbase';
    if (g.kind === 'airbase' && !this.ghostGroup.getObjectByName('corridor')) {
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
      const corridor = new THREE.LineSegments(lineGeo, this.corridorMat);
      corridor.name = 'corridor';
      corridor.frustumCulled = false;
      this.ghostGroup.add(corridor);
    }
    const y = groundLevel(g.x, g.z);
    this.ghostGroup.position.set(g.x, y, g.z);
    // Uçaksavar yuvaları dünya ekseninde (StructureView gibi döndürülmez)
    this.ghostGroup.rotation.y = g.kind === 'aa' ? 0 : Math.PI - g.heading;
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

  /**
   * Hasarlı uçağın dumanı ve alevi gerçek yerinden (2026-11-21; eskiden hep gövdenin ortasından): yanan ya da hasarlı
   * motor kendi egzozundan (çok motorluda o motordan), depo yangını ve yakıt sızıntısı kanat kökünden, gövde hasarı
   * ortadan. Düşen uçak gövdesiyle birlikte yanar. Her kaynak kendi izi (yuva: 0 yangın, 1 düşen gövde, 2+ motorlar,
   * 10 gövde hasarı, 11 sızıntı); alev uçağın hızından geriye uzanır.
   */
  /**
   * Ar 234 C'nin Walter 109-500 kalkış roketleri: kalkış koşusunda tam gazla ateşlenir, 30 sn yanar (beyaz duman ve
   * alev), uçak havadayken atılır ve paraşütle düşer; uçak yere inip durunca yenisi takılır. Yalnız görüntü:
   * simülasyonda ek itki yok.
   */
  private rato(v: AircraftView, dt: number): void {
    const s = v.surf;
    const ac = v.ac;
    const j = v.model.joints.rato;
    if (s.rato === 0 && ac.onGround && ac.status === 'flying' && ac.controls.throttle > 0.6 && ac.speed > 3) {
      s.rato = 1;
      s.ratoT = 0;
    }
    if (s.rato === 2 && ac.onGround && ac.speed < 2) s.rato = 0;
    j.visible = s.rato !== 2;
    if (s.rato !== 1 || dt <= 0) return;
    s.ratoT += dt;
    const m = v.root.matrixWorld;
    const vel = ac.velocity(_acVel);
    if (s.ratoT < RATO_BURN && settings.map.effects) {
      const size = Math.max(v.root.scale.x, Math.min(this.rig.fxScale, 6) * 0.6);
      RATO_NOZZLE.forEach((n, i) => {
        _rp.set(n[0], n[1], n[2]).applyMatrix4(m);
        this.effects.trail(v, 20 + i, _rp, size * 1.4, 'rocket', vel);
        this.effects.muzzle(_rp, size * 0.55);
      });
    }
    // Yanma bitti, uçak havada: askıdan atılır
    if (s.ratoT >= RATO_BURN + 2 && !ac.onGround) {
      s.rato = 2;
      if (!settings.map.effects) return;
      this.ratoGeo ??= {
        pod: new THREE.CylinderGeometry(0.24, 0.24, 2.0, 10),
        chute: new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        podMat: new THREE.MeshLambertMaterial({ color: 0x7d8178 }),
        chuteMat: new THREE.MeshLambertMaterial({ color: 0xe8e4d8, side: THREE.DoubleSide }),
      };
      for (const n of RATO_NOZZLE) {
        const g = new THREE.Group();
        const pod = new THREE.Mesh(this.ratoGeo.pod, this.ratoGeo.podMat);
        const chute = new THREE.Mesh(this.ratoGeo.chute, this.ratoGeo.chuteMat);
        chute.position.y = 5;
        chute.scale.setScalar(0.01);
        g.add(pod, chute);
        g.position.set(n[0], n[1], n[2] + 1).applyMatrix4(m);
        // Kapsül ekseni (yerel y) uçuş yönünde; paraşüt açılınca dikey sarkar
        g.quaternion.copy(v.iq).multiply(_podFwd);
        g.scale.setScalar(v.root.scale.x);
        this.scene.add(g);
        this.ratoDrops.push({ g, vel: vel.clone().multiplyScalar(0.92).add(new THREE.Vector3(Math.sign(n[0]) * 3, -1, 0).applyQuaternion(v.iq)), t: 0 });
      }
    }
  }

  /** Atılan kalkış roketleri: 1,5 sn serbest düşer, paraşüt açılır, ~7 m/s ile rüzgârla süzülür; yere değince kalkar. */
  private updateRatoDrops(dt: number): void {
    if (dt <= 0) return;
    for (let i = this.ratoDrops.length - 1; i >= 0; i--) {
      const d = this.ratoDrops[i];
      d.t += dt;
      const chute = d.g.children[1];
      if (d.t < 1.5) {
        d.vel.multiplyScalar(Math.exp(-0.25 * dt));
        d.vel.y -= 9.81 * dt;
      } else {
        const k = 1 - Math.exp(-dt * 1.6);
        d.vel.x += (WIND.x - d.vel.x) * k;
        d.vel.z += (WIND.z - d.vel.z) * k;
        d.vel.y += (-7 - d.vel.y) * k;
        chute.scale.setScalar(Math.min(1, (d.t - 1.5) / 1.2));
        // Kapsül paraşütün altında sarkar: dikleşir
        d.g.quaternion.slerp(_ratoUp, 1 - Math.exp(-dt * 1.2));
      }
      d.g.position.addScaledVector(d.vel, dt);
      if (d.g.position.y < groundLevel(d.g.position.x, d.g.position.z) || d.t > 300) {
        this.scene.remove(d.g);
        this.ratoDrops.splice(i, 1);
      }
    }
  }

  private damageSmoke(v: AircraftView, scale: number, size: number, burning: boolean, leak: boolean): void {
    const ac = v.ac;
    const d = ac.damage;
    const vel = ac.velocity(_acVel);
    const trail = (slot: number, p: THREE.Vector3, s: number, kind: TrailKind) => this.effects.trail(v, slot, p, s, kind, vel);
    const em = v.model.emitters;
    const half = ac.spec.span / 2;
    // Model ekseninde nokta → dünya (model büyütmesiyle)
    const at = (x: number, y: number, z: number) => _w.set(x, y, z).multiplyScalar(scale).applyQuaternion(v.iq).add(v.ip);
    const engineAt = (i: number) => {
      const e = em.length === d.engines.length ? em[i] : em[0];
      return e ? at(e.x, e.y, e.z + (em.length > 1 ? 1.5 : 0)) : at(0, 0, 0);
    };
    // Yanan parçanın yanı (sol +x): uçak kimliğinden, hep aynı kanat
    const wingSide = ac.id % 2 ? 1 : -1;
    let worst = 0;
    d.engines.forEach((e, i) => {
      if (e > d.engines[worst]) worst = i;
    });
    if (d.fire > 0) trail(0, d.fireSource === 'engine' ? engineAt(worst) : at(wingSide * half * 0.22, 0, 0), size, 'burning');
    else if (burning) trail(1, at(0, 0, 0), size, 'burning');
    let engineSmoke = false;
    d.engines.forEach((e, i) => {
      if (e <= 0.3) return;
      engineSmoke = true;
      trail(2 + i, engineAt(i), size * (0.7 + 0.3 * e), 'damaged');
    });
    if (!engineSmoke && !burning && (ac.hp < ac.hpMax * 0.5 || d.heat > 0.6)) trail(10, at(0, 0, 0), size, 'damaged');
    if (leak) trail(11, at(-wingSide * half * 0.3, 0, -0.5), size, 'leak');
  }

  /**
   * Uçak parçalanması (world.ts breakup): kanat ya da kuyruk kopunca uçağın görüntüsü parçalara bölünür ve kopan parça
   * ayrı düşer; havada infilakta bütün parçalar dağılır. Parçalar uçağın kendi modelinden (models.ts fractureModel).
   */
  private breakup(e: Extract<SimEvent, { kind: 'breakup' }>): void {
    const v = this.views.get(e.id);
    const pos = v ? v.ip : e.pos;
    const quat = v ? v.iq : e.quat;
    const scale = this.rig.modelScale;
    const detail = this.modelDetail;
    const fr = fractureModel(e.model, detail);
    const r = () => Math.random() * 2 - 1;
    const kick = (part: WreckPart, out: number) => {
      const pc = fr.parts[part];
      const dir = pc && pc.center.lengthSq() > 0.25 ? _w.copy(pc.center).normalize().applyQuaternion(quat) : _w.set(r(), r(), r()).normalize();
      return e.vel.clone().multiplyScalar(0.85).addScaledVector(dir, out).add(new THREE.Vector3(r(), r(), r()).multiplyScalar(4));
    };
    const spinOf = (part: WreckPart, k: number) => new THREE.Vector3(r(), r(), r()).normalize().multiplyScalar((part === 'body' ? 0.5 + Math.random() : 1.5 + 2.5 * Math.random()) * k);
    if (e.mode === 'explode') {
      for (const part of WRECK_PARTS) {
        this.wrecks.spawn(e.model, detail, part, pos, quat, scale, kick(part, 6 + Math.random() * 12), spinOf(part, 1), part === 'body' ? 6 + Math.random() * 6 : 2 + Math.random() * 5);
      }
      return;
    }
    const part: WreckPart = e.mode === 'tail' ? 'tail' : e.side > 0 ? 'wingL' : 'wingR';
    if (v) this.breakView(v, part);
    this.wrecks.spawn(e.model, detail, part, pos, quat, scale, kick(part, 3 + Math.random() * 4), spinOf(part, 1.3), e.fire ? 4 + Math.random() * 4 : 0);
  }

  /** Uçağın görüntüsünden bir parçayı çıkar: ana ağlar parçalara bölünür (ilk kırılmada), kopan parça ve eklemleri gizlenir. */
  private breakView(v: AircraftView, lost: WreckPart): void {
    if (v.broken?.has(lost)) return;
    const m = v.model;
    const fr = fractureModel(v.ac.spec.model, this.modelDetail);
    if (!v.broken) {
      const base = new Set<THREE.Object3D>(m.base);
      for (const b of m.base) m.root.remove(b);
      m.fine = m.fine.filter((o) => !base.has(o));
      m.lods = m.lods.filter((l) => !base.has(l.mesh));
      v.parts = {};
      for (const part of WRECK_PARTS) {
        const pc = fr.parts[part];
        if (!pc) continue;
        const g = new THREE.Group();
        for (const mm of pc.meshes) {
          if (mm.joint) continue;
          const mesh = new THREE.Mesh(mm.geo, mm.mat);
          if (mm.fine) {
            mesh.visible = v.fine;
            m.fine.push(mesh);
          }
          g.add(mesh);
        }
        m.root.add(g);
        v.parts[part] = g;
      }
      // Pervane diski bütün motorları tek ağda taşır: kırık uçakta palalar görünür (motorlar zaten yavaşladı)
      if (m.disc) {
        m.root.remove(m.disc);
        m.disc = null;
      }
      v.broken = new Set();
    }
    v.broken.add(lost);
    const g = v.parts?.[lost];
    if (g) g.visible = false;
    const gone = new Set<THREE.Object3D>();
    for (const [name, part] of Object.entries(fr.jointPart)) {
      const j = m.joints[name];
      if (part === lost && j) {
        j.visible = false;
        gone.add(j);
      }
    }
    m.props = m.props.filter((p) => !gone.has(p));
    m.fine = m.fine.filter((o) => !gone.has(o));
  }

  private consumeEvents(w: World, vis: number): void {
    const fx = settings.map.effects;
    for (const e of w.events) {
      if (!fx) continue;
      switch (e.kind) {
        case 'breakup':
          this.breakup(e);
          break;
        case 'airExplosion':
          this.effects.airExplosion(e.pos, Math.min(vis, 12), e.size, e.vel);
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
