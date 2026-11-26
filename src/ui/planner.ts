// Görev planlayıcı: hava üssünden kalkmadan önce görev, kuvvet (birden çok tip), mühimmat, hedef, rota, kurallar,
// eskort ve yakıt seçimi. Yalnız seçilen göreve anlamlı gelen ayarlar gösterilir. Yük ve mermi kuşağı göreve göre
// önerilir; oyuncu değiştirebilir. Harita tıklamasıyla hedef ve ara nokta seçilir.
// Görünüm (2026-11-25): sade ana sayfa (görev, uçaklar, hedef, uçuş; altta başarı ve kalkış), ayrıntılar açılır pencerede:
// uçak tipinin yükü, başarı ayrıntısı, uyarılı kalkışta onay, devriye bölgesi. Koyu, yarı saydam (`.slate`, çelik temanın sadesi).
// Hava devriyesi (2026-11-25, kullanıcı tasarımı): bölge haritadan merkez ve çapla seçilir; tur sayısı ve irtifa girilir (süre
// turdan, hız hep seyir); yakıt görevi yapmaya yetecek en aza kendiliğinden ayarlanır, oyuncu artırabilir; en az yakıt depoyu
// aşarsa görev yapılamaz. Eskort görevi ve üs transferi kartlarda yok (transfer üs panelinden açılır).

import { Vector3 } from 'three';
import { missionOdds } from '../sim/missionResult';
import type { Game } from '../game';
import type { Airbase } from '../sim/structures/airbase';
import { STRUCTURE_DEFS, type Structure, type StructureKind } from '../sim/structures/structure';
import { ROLE_NAMES, SPECS, loadoutMass, type AircraftSpec, type Loadout, type Placement } from '../sim/aircraft/specs';
import { STORES, capOf, checkPlacement as checkStores, fits, loadoutAllowed, loadoutSummary, makeLoadout, pylonsOf, type Hardpoint, type StoreDef } from '../sim/aircraft/stores';
import {
  MISSION_DESCS, MISSION_FIELDS, MISSION_ICONS, MISSION_NAMES, MISSION_ROLES, TASK_SPLIT, defaultFormation, defaultLoadout, defaultPlan, filletPath,
  speedFor, targetKind, type FlightTask, type MissionPlan, type MissionType,
} from '../sim/ai/missions';
import { BELTS, BELT_LIST, type BeltId } from '../sim/aircraft/ammo';
import type { FormationType } from '../sim/ai/formation';
import { fuelFlowAt } from '../sim/aircraft/aero';
import { TECH_BY_ID } from '../sim/tech';
import { groundLevel, terrainMap } from '../sim/terrain';
import type { LaunchGroup } from '../sim/world';
import { aircraftThumb } from '../render/thumbs';
import { mapById } from '../sim/maps';
import { MAP_SIZE } from '../sim/mapData';
import { mapPreview, terrainImage, terrainImageCached } from './mapPreview';
import { REPEATABLE, addHistory, addStanding, type HistoryEntry } from '../sim/standing';
import { $, bar, esc, fmtDur, fmtStamp, nf } from './dom';
import { L } from '../i18n';

/** Yüzde metni (Türkçede "%40", İngilizcede "40%"). */
const P = (n: number): string => L(`%${n}`, `${n}%`);
const KMH = L('km/sa', 'km/h');

// Eskort (tek başına) ve üs transferi kartlarda yok: eskort bombardıman ve taarruzun içinde, transfer üs panelinden
/** Hedef haritasında adıyla gösterilen yapılar (evler ve park yalnız nokta). */
const MAJOR_KINDS: ReadonlySet<StructureKind> = new Set<StructureKind>(['airbase', 'factory', 'aa', 'radar', 'mine', 'townhall', 'firestation']);
/** Hedef haritasındaki kısa adlar. */
const KIND_SHORT: Partial<Record<StructureKind, string>> = {
  airbase: L('Üs', 'Base'), factory: L('Fabrika', 'Factory'), aa: L('Uçaksavar', 'Flak'), radar: L('Radar', 'Radar'),
  mine: L('Maden', 'Mine'), townhall: L('Belediye', 'Town hall'), firestation: L('İtfaiye', 'Fire station'),
};

// Avcı taraması planlayıcıdan kalktı (2026-11-26, kullanıcı: devriye ve önlemeyle aynı işi görüyor); sim türü eski kayıtlar ve senaryolar için kalır
const TYPES: MissionType[] = ['cap', 'intercept', 'levelBomb', 'diveBomb', 'attack'];
/** Devriye çapı (km) ve tur sınırları. */
const CAP_DIA: [number, number] = [2, 24];
const CAP_LAPS: [number, number] = [1, 12];

/** Kuvvetteki bir tip. */
interface Pick {
  specId: string;
  count: number;
  loadoutId: string;
  belt: BeltId;
  formation: FormationType;
  /** Oyuncu yükü elle değiştirdi (hedef değişince öneri yenilenmez). */
  manual: boolean;
  /** Serbest yükleme: askı başına mühimmat (null = hazır yük). */
  custom: Placement[] | null;
  /** Serbest yüklemede silah kiti (hazır yük kimliği). */
  kit: string | null;
  /**
   * Görev dağılımı: görevin ikincil işine ayrılan uçak sayısı (önlemede bombardımana, eskortta yakın eskort,
   * taarruzda uçaksavar bastırma). null = kol duruma göre kendisi böler.
   */
  split: number | null;
  /** Kalkış yakıtı (iç deponun payı); kendiliğindeyse görevi yapmaya yetecek en az (tip başına, `syncFuel`). */
  fuel: number;
  fuelAuto: boolean;
}

/** Yakıtı tip başına en aza ayarlanan görevler (2026-11-26; önce yalnız devriye). */
const FUEL_TYPES: ReadonlySet<MissionType> = new Set<MissionType>(['cap', 'intercept', 'levelBomb', 'diveBomb', 'attack']);

interface State {
  base: Airbase;
  type: MissionType;
  plan: MissionPlan;
  force: Pick[];
  escort: Pick[];
  /** Açık pencere (yoksa null). */
  pop: Pop | null;
  /** Devriyede tur sayısı. */
  laps: number;
  /** Devriyede yakıt kendiliğinden en aza ayarlanır (oyuncu artırınca false). */
  /** Görev bitince aynı planla yeniden kalksın (sim/standing.ts). */
  repeat: boolean;
  /** Hedef haritasında yaklaşma çizgisi düzenleniyor (tutamak görünür). */
  bendEdit?: boolean;
  /** Devriye haritasının görünümü (yakınlık, merkez; yoksa üssün çevresi). */
  view: View | null;
}

/** Devriye haritasının görünümü: yakınlık (1 = bütün harita) ve görünümün ortası (dünya, m). */
interface View {
  z: number;
  cx: number;
  cz: number;
}
const ZOOM: [number, number] = [1, 10];

/** Planlayıcının açılır pencereleri. */
type Pop =
  | { kind: 'load'; spec: string; escort: boolean; belts?: boolean; hp?: string }
  | { kind: 'area' }
  | { kind: 'pick'; sel: Record<string, number>; escort?: boolean }
  | { kind: 'odds' }
  | { kind: 'hist' }
  | { kind: 'confirm'; warns: string[]; fuelShort: boolean };

/** Dağılım seçeneklerindeki kısa iş adları. */
const TASK_SHORT: Record<FlightTask, string> = {
  auto: L('asıl hedefe', 'main target'), fighters: L('eskort avcılarına', 'escort fighters'), bombers: L('bombardımana', 'bombers'),
  flak: L('uçaksavara', 'flak'), close: L('yakın eskort', 'close escort'), free: L('serbest avcı', 'free hunt'),
};

/** İki yanı ayrı doldurulabilen çift askı (kanat, ray, uç, çift gövde askısı). */
function paired(h: Hardpoint): boolean {
  return h.kind !== 'bay' && h.pylons === 2;
}

/** Serbest yükleme: çift askıya iki yana birden takılmış yük, iki ayrı yana bölünür. */
function splitSides(spec: AircraftSpec, place: Placement[]): Placement[] {
  if (!place.some((p) => !p.side && spec.hardpoints.some((h) => h.id === p.hp && paired(h)))) return place;
  const out: Placement[] = [];
  for (const p of place) {
    const h = spec.hardpoints.find((x) => x.id === p.hp);
    if (h && paired(h) && !p.side) out.push({ ...p, side: -1 }, { ...p, side: 1 });
    else out.push({ ...p });
  }
  return out;
}

/** Askı kutusunun anahtarı ("askı:yan") → askı ve yan. */
function slotKey(key?: string): [string, 1 | -1 | undefined] {
  const [id, s] = (key ?? '').split(':');
  return [id, s === '1' ? 1 : s === '-1' ? -1 : undefined];
}

/**
 * Uçağın planlayıcı resmi: ansiklopedi kart görselinin küçüğü (bütün uçak, burun sağda, alçak açı; `tools/uretim/kartlar.mjs` →
 * public/uretim/kart-<uçak>.webp). Dosyası yoksa (araştırma ağacı dışı) kodla çizilen küçük resim.
 */
function kartImg(specId: string): string {
  return `<img class="kart" src="${import.meta.env.BASE_URL}uretim/kart-${specId}.webp" alt="" decoding="async" data-spec="${specId}">`;
}

/** Küçük çizgi simgeleri. */
const ICO = {
  bomb: '<svg viewBox="0 0 16 16"><path d="M3 8c0-2 2-3 5-3h3l2-2v10l-2-2H8C5 11 3 10 3 8z" fill="currentColor"/></svg>',
  rocket: '<svg viewBox="0 0 16 16"><path d="M2 7h9l3 1-3 1H2z M2 6l2 1v2l-2 1z" fill="currentColor"/></svg>',
  tank: '<svg viewBox="0 0 16 16"><rect x="2" y="6" width="12" height="4.5" rx="2.2" fill="currentColor"/></svg>',
  gun: '<svg viewBox="0 0 16 16"><path d="M2 7h10v1.6H2z M12 6.4h2v2.8h-2z" fill="currentColor"/></svg>',
  clean: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
};

export class Planner {
  isOpen = false;
  private el = $('planner');
  private st: State | null = null;
  private summaryEl: HTMLElement | null = null;
  private nextSummary = 0;

  constructor(private readonly game: Game) {
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => this.onInput(e));
    this.el.addEventListener('change', (e) => this.onInput(e));
    // Devriye haritası: sürükle (kaydır), iki parmak ya da tekerlek (yakınlaştır), dokun (merkez)
    this.el.addEventListener('pointerdown', (e) => this.mapDown(e));
    this.el.addEventListener('pointermove', (e) => this.mapMove(e));
    this.el.addEventListener('pointerup', (e) => this.mapUp(e, true));
    this.el.addEventListener('pointercancel', (e) => this.mapUp(e, false));
    this.el.addEventListener('wheel', (e) => this.mapWheel(e), { passive: false });
    // Kart resmi yoksa kodla çizilen küçük resim (bir kez)
    this.el.addEventListener('error', (e) => {
      const t = e.target;
      if (t instanceof HTMLImageElement && t.classList.contains('kart') && t.dataset.spec && !t.dataset.miss) {
        t.dataset.miss = '1';
        t.src = aircraftThumb(t.dataset.spec, 0x9fb4d8);
      }
    }, true);
    this.el.classList.add('slate');
  }

  /** Uçak ekleme penceresi açık mı (öğretici). */
  pickerOpen(): boolean {
    return this.st?.pop?.kind === 'pick';
  }

  /** Planlanan uçak sayısı (öğretici). */
  forceCount(): number {
    return this.st ? this.st.force.reduce((a, x) => a + x.count, 0) : 0;
  }

  /** Esc ve geri tuşu: önce açık pencere kapanır, sonra planlayıcı. */
  escape(): void {
    if (this.st?.pop) {
      this.st.pop = null;
      this.renderKeepScroll();
    } else this.close();
  }

  /** Devriye bölgesi penceresi açık mı (öğretici). */
  areaOpen(): boolean {
    return this.st?.pop?.kind === 'area';
  }

  /** Planlayıcıyı aç; `kind` verilirse o görevle (üs paneli: üs transferi). */
  open(base: Airbase, target?: Structure, kind?: MissionType): void {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.game.build.close();
    let type: MissionType = kind ?? 'cap';
    if (target) {
      const has = (role: AircraftSpec['role']) => base.inventory.some((a) => a.status === 'ready' && SPECS[a.specId].role === role);
      type = has('bomber') ? 'levelBomb' : has('diveBomber') ? 'diveBomb' : 'attack';
    }
    this.st = {
      base, type, plan: defaultPlan(type, SPECS.hurricane1), force: [], escort: [], pop: null, laps: 3, repeat: false, view: null,
    };
    if (target) this.st.plan.targetStructureId = target.id;
    this.setType(type);
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
    this.st = null;
    this.gest = null;
    this.game.renderer.plannerRoute = null;
    this.game.renderer.plannerArea = null;
    if (this.game.interaction.mode === 'pickTarget' || this.game.interaction.mode === 'pickWaypoint') {
      this.game.interaction = { mode: 'none' };
    }
  }

  // ------------------------------------------------------------------ kuvvet

  private get research() {
    return this.game.world.teams[this.game.playerTeam].research;
  }

  /** Görev türüne uygun ve üste hazır bekleyen tipler. */
  private eligible(type: MissionType): { spec: AircraftSpec; ready: number }[] {
    const st = this.st!;
    const roles = MISSION_ROLES[type];
    const out = new Map<string, number>();
    for (const af of st.base.inventory) {
      if (af.status !== 'ready') continue;
      const sp = SPECS[af.specId];
      if (!roles.includes(sp.role) || !sp.playable) continue;
      if (type === 'diveBomb' && !sp.dive && !sp.loadouts.some((l) => l.bombCount)) continue;
      if ((type === 'attack' || type === 'diveBomb') && sp.role === 'fighter' && !sp.loadouts.some((l) => (l.bombCount || l.rocketCount) && loadoutAllowed(l, this.has))) continue;
      out.set(sp.id, (out.get(sp.id) ?? 0) + 1);
    }
    // Görevin asıl rolü önce (pikede pike bombardıman uçağı, taarruzda taarruz uçağı), sonra yeni tipler
    return [...out].map(([id, ready]) => ({ spec: SPECS[id], ready }))
      .sort((a, b) => roles.indexOf(a.spec.role) - roles.indexOf(b.spec.role) || b.spec.year - a.spec.year);
  }

  private readyOf(specId: string): number {
    return this.st!.base.readyOf(specId).length;
  }

  /** Eskort için kalan hazır avcı (kuvvette kullanılanlar düşülür). */
  private escortAvail(specId: string): number {
    const used = this.st!.force.find((p) => p.specId === specId)?.count ?? 0;
    return Math.max(0, this.readyOf(specId) - used);
  }

  private defaultCount(spec: AircraftSpec, ready: number): number {
    return Math.max(1, Math.min(ready, spec.role === 'bomber' ? 6 : spec.role === 'fighter' ? 4 : 3));
  }

  private newPick(spec: AircraftSpec, count: number, type = this.st!.type): Pick {
    return {
      specId: spec.id, count, loadoutId: this.suggestLoadout(spec, type), belt: defaultPlan(type, spec).belt,
      formation: defaultFormation(spec, type), manual: false, custom: null, kit: null, fuel: 1, fuelAuto: true,
      // Avcı görevlerinde kol varsayılan olarak kendisi böler; eskortta hepsi serbest, taarruzda hepsi asıl hedefe
      split: type === 'cap' || type === 'sweep' || type === 'intercept' ? null : 0,
    };
  }

  /** Bu seçim görev dağılımına girer mi (önleme ve devriyede yalnız avcılar ikiye bölünür). */
  private splittable(pk: Pick, type: MissionType): boolean {
    if (!TASK_SPLIT[type] || pk.count < 1) return false;
    if (type === 'cap' || type === 'sweep' || type === 'intercept') return SPECS[pk.specId].role === 'fighter';
    return true;
  }

  private splitLabel(type: MissionType, n: number, k: number | null): string {
    const sp = TASK_SPLIT[type]!;
    if (k === null) return L('Otomatik: kol duruma göre böler', 'Automatic: the flight splits as needed');
    if (k <= 0) return `${L('Tümü', 'All on')} ${TASK_SHORT[sp.main]}`;
    if (k >= n) return `${L('Tümü', 'All on')} ${TASK_SHORT[sp.side]}`;
    return `${n - k} ${TASK_SHORT[sp.main]} · ${k} ${TASK_SHORT[sp.side]}`;
  }


  private has = (id?: string) => this.research.has(id);

  /** Seçimin geçerli yükü (hazır ya da serbest). */
  private pickLoadout(pk: Pick): Loadout {
    const spec = SPECS[pk.specId];
    if (pk.custom) {
      const kit = pk.kit ? spec.loadouts.find((l) => l.id === pk.kit) : undefined;
      return makeLoadout(spec, `custom:${pk.specId}`, L('Serbest yük', 'Custom load'), pk.custom, kit?.replaceGuns, kit?.reqs[0]);
    }
    return spec.loadouts.find((l) => l.id === pk.loadoutId) ?? spec.loadouts[0];
  }

  /** Personel: boşta kişi ve bu plandaki diğer seçimlerin kullandığı. */
  private crewLeft(except: Pick | null): number {
    const st = this.st!;
    let free = this.game.world.crewFree(st.base.s.team);
    if (!Number.isFinite(free)) return Infinity;
    for (const x of [...st.force, ...st.escort]) if (x !== except) free -= x.count * SPECS[x.specId].crew;
    return free;
  }

  /** Uçak ekleme penceresinde bu tipten en fazla: hazır uçak ve öteki seçimlerden kalan personel (eskort da sayılır). */
  private pickerMax(specId: string, sel: Record<string, number>, escort = false): number {
    const st = this.st!;
    const spec = SPECS[specId];
    const other = escort ? st.force : st.escort;
    const ready = this.readyOf(specId) - (other.find((x) => x.specId === specId)?.count ?? 0);
    let free = this.game.world.crewFree(st.base.s.team);
    if (!Number.isFinite(free)) return Math.max(0, ready);
    for (const x of other) free -= x.count * SPECS[x.specId].crew;
    for (const [id, n] of Object.entries(sel)) if (id !== specId) free -= n * SPECS[id].crew;
    return Math.max(0, Math.min(ready, Math.floor(free / spec.crew)));
  }

  /** Personel sınırıyla bu tipten en fazla kaç uçak. */
  private maxCount(pk: Pick, ready: number): number {
    const left = this.crewLeft(pk);
    return Math.max(0, Math.min(ready, Number.isFinite(left) ? Math.floor(left / SPECS[pk.specId].crew) : ready));
  }

  private suggestLoadout(spec: AircraftSpec, type: MissionType): string {
    const st = this.st!;
    const tp = this.targetPos();
    const dist = tp ? Math.hypot(tp.x - st.base.s.pos.x, tp.z - st.base.s.pos.z) : 0;
    const aa = st.plan.targetStructureId !== null && this.game.world.structureById(st.plan.targetStructureId)?.kind === 'aa';
    return defaultLoadout(spec, type, (id) => this.research.has(id), dist, aa);
  }

  /** Hedef değişince elle değiştirilmemiş yükleri yeniden öner. */
  private refreshSuggestions(): void {
    const st = this.st!;
    for (const p of st.force) if (!p.manual) p.loadoutId = this.suggestLoadout(SPECS[p.specId], st.type);
    for (const p of st.escort) if (!p.manual) p.loadoutId = this.suggestLoadout(SPECS[p.specId], 'escort');
  }

  private setType(type: MissionType): void {
    const st = this.st!;
    const prevType = st.type;
    st.type = type;
    const el = this.eligible(type);
    const keep = st.plan;
    const lead = el[0]?.spec ?? SPECS.hurricane1;
    st.plan = defaultPlan(type, lead);
    // Hedef türü aynıysa seçimi koru
    if (targetKind(type) === 'structure') st.plan.targetStructureId = keep.targetStructureId;
    if (targetKind(type) === 'point') st.plan.targetPos = keep.targetPos;
    if (targetKind(type) === targetKind(prevType)) {
      st.plan.targetAircraftId = keep.targetAircraftId;
      st.plan.targetFlightId = keep.targetFlightId;
      st.plan.targetBaseId = keep.targetBaseId;
    }
    st.plan.waypoints = MISSION_FIELDS[type].route ? keep.waypoints : [];
    // Kuvvet: uygun kalanları koru, yük önerisini yeni göreve göre yenile
    // Görevin asıl rolündeki tip yoksa (ör. devriyeden pikeye geçince avcılar kalmış) varsayılan kuvvete dön
    const primary = MISSION_ROLES[type][0];
    let kept = st.force.filter((p) => el.some((e) => e.spec.id === p.specId)).map((p) => this.newPick(SPECS[p.specId], Math.min(p.count, this.readyOf(p.specId)), type));
    if (!kept.some((p) => SPECS[p.specId].role === primary) && el.some((e) => e.spec.role === primary)) kept = [];
    // Uçaklar "Uçak ekle" penceresinden gelir (2026-11-25): görev değişince uygun olanlar kalır, yenisi kendiliğinden eklenmez
    st.force = kept;
    st.escort = [];
    st.pop = null;
    this.autoAltitude();
  }

  /** Seyir irtifası: kuvvetteki en düşük seyir irtifalı tipe göre. */
  private autoAltitude(): void {
    const st = this.st!;
    const specs = st.force.map((p) => SPECS[p.specId]);
    const cruise = specs.length ? Math.min(...specs.map((s) => s.cruiseAlt)) : 3000;
    const tgt = this.targetPos();
    const ground = Math.max(st.base.s.pos.y, tgt ? groundLevel(tgt.x, tgt.z) : 0);
    st.plan.altitude = Math.round((ground + (st.type === 'attack' ? 900 : cruise)) / 100) * 100;
  }

  /** Hedef seçildi mi (öğretici). */
  hasTarget(): boolean {
    return !!this.st && this.targetPos() !== null;
  }

  pickHint(): string {
    if (!this.st) return '';
    switch (targetKind(this.st.type)) {
      case 'point': return L('Görev bölgesinin merkezine tıkla', 'Click the centre of the mission area');
      case 'structure': return L('Düşman yapısına tıkla (fabrika, üs, uçaksavar, radar)', 'Click an enemy structure (factory, base, flak, radar)');
      case 'aircraft': return L('Önlenecek düşman uçağına tıkla', 'Click the enemy aircraft to intercept');
      default: return L('Hedef seç', 'Choose a target');
    }
  }

  handleMapClick(x: number, y: number, mode: 'pickTarget' | 'pickWaypoint'): void {
    const st = this.st;
    if (!st) return;
    const g = this.game;
    if (mode === 'pickWaypoint') {
      const p = g.renderer.groundPoint(x, y);
      if (p && st.plan.waypoints.length < 6) st.plan.waypoints.push(new Vector3(p.x, 0, p.z));
      this.render();
      return;
    }
    const kind = targetKind(st.type);
    if (kind === 'point') {
      const p = g.renderer.groundPoint(x, y);
      if (p) st.plan.targetPos = new Vector3(p.x, 0, p.z);
    } else if (kind === 'structure') {
      const s = g.renderer.pickStructure(x, y, (s) => s.team !== g.playerTeam && !s.destroyed);
      if (!s) return;
      st.plan.targetStructureId = s.id;
    } else if (kind === 'aircraft') {
      const a = g.renderer.pickAircraft(x, y, 40, (a) => a.team !== g.playerTeam);
      if (!a) return;
      st.plan.targetAircraftId = a.id;
    }
    g.interaction = { mode: 'none' };
    this.refreshSuggestions();
    this.autoAltitude();
    this.render();
  }

  // ------------------------------------------------------------------ hedef

  private targetPos(): Vector3 | null {
    const st = this.st!;
    const p = st.plan;
    const w = this.game.world;
    switch (targetKind(st.type)) {
      case 'point': return p.targetPos;
      case 'structure': return p.targetStructureId !== null ? w.structureById(p.targetStructureId)?.pos ?? null : null;
      case 'aircraft': return p.targetAircraftId !== null ? w.aircraftById(p.targetAircraftId)?.pos ?? null : null;
      case 'flight': return p.targetFlightId !== null ? w.flightById(p.targetFlightId)?.leader()?.pos ?? null : null;
      case 'base': return p.targetBaseId !== null ? w.structureById(p.targetBaseId)?.pos ?? null : null;
    }
  }

  private targetLabel(): string {
    const st = this.st!;
    const p = st.plan;
    const w = this.game.world;
    switch (targetKind(st.type)) {
      case 'point': return p.targetPos ? `${L('Bölge', 'Area')} (${(p.targetPos.x / 1000).toFixed(1)}, ${(p.targetPos.z / 1000).toFixed(1)} km)` : '';
      case 'structure': return p.targetStructureId !== null ? w.structureById(p.targetStructureId)?.name ?? '' : '';
      case 'aircraft': {
        const a = p.targetAircraftId !== null ? w.aircraftById(p.targetAircraftId) : undefined;
        return a ? `${a.flight ? L(`${a.flight.name} kolu · `, `${a.flight.name} flight · `) : ''}${a.callsign} (${a.spec.abbr})` : '';
      }
      case 'flight': {
        const f = p.targetFlightId !== null ? w.flightById(p.targetFlightId) : undefined;
        return f ? L(`${f.name} kolu`, `${f.name} flight`) : '';
      }
      case 'base': return p.targetBaseId !== null ? w.structureById(p.targetBaseId)?.name ?? '' : '';
    }
  }

  /** Önleme hedefinin izlenme durumu. */
  private trackInfo(): string {
    const st = this.st!;
    const w = this.game.world;
    const id = st.plan.targetAircraftId;
    if (id === null) return '';
    const c = w.teams[this.game.playerTeam].intel.contacts.get(id);
    if (c && w.time - c.lastRadar < 10) return `<span class="tag ok">${L('Radar izinde', 'Radar track')}</span> ${L('Rota sürekli güncellenir.', 'The course updates continuously.')}`;
    if (c) return `<span class="tag ok">${L('Gözcü izinde', 'Observer track')}</span> ${L('Görüldükçe rota güncellenir.', 'The course updates whenever it is seen.')}`;
    const seen = w.flights.some((f) => f.team === this.game.playerTeam && f.contacts.has(id));
    if (seen) return `<span class="tag ok">${L('Kollarımız görüyor', 'Our flights can see it')}</span>`;
    return `<span class="tag warn">${L('İz yok', 'No track')}</span> ${L(
      'Kol hedefin görüldüğü rotayı kestirip gider; bulamazsa son görülen yerde 3 dk arar.',
      'The flight heads for where the target\'s last course leads; if it finds nothing, it searches the last known position for 3 min.',
    )}`;
  }

  /**
   * Önlemede seçilebilecek düşman temasları (2026-11-26; önce avcı taraması içindi): takımın radar ve gözcülerinin ya da kollarımızın gördüğü havadaki düşman,
   * kol başına bir kayıt. Konum oyuncunun bildiği yer (radar izinde isabet hatasıyla), gerçek yer değil.
   */
  private enemyContacts(): { id: number; x: number; z: number; n: number; abbr: string; name: string; src: string; alt: number | null; d: number }[] {
    const g = this.game;
    const w = g.world;
    const st = this.st!;
    const intel = w.teams[g.playerTeam].intel;
    const out: ReturnType<Planner['enemyContacts']> = [];
    const seen = new Set<number>();
    for (const ac of w.aircraft) {
      if (ac.team === g.playerTeam || !ac.airborne || ac.status !== 'flying') continue;
      const key = ac.flight?.id ?? -ac.id;
      if (seen.has(key)) continue;
      // Görünürlük oyun haritasıyla aynı (savaş sisi kapalıysa bütün düşmanlar)
      if (!g.renderer.isVisible(ac)) continue;
      const own = w.flights.some((f) => f.team === g.playerTeam && f.contacts.has(ac.id));
      const c = intel.contacts.get(ac.id);
      seen.add(key);
      const lead = ac.flight?.leader() ?? ac;
      const lc = intel.contacts.get(lead.id) ?? c;
      const pos = own || !lc ? lead.pos : lc.pos;
      // Radar izinin tazeliği ve yükseklik bilgisi (radar sistemleri varsa onların kuralı, yoksa son radar görüşü 10 sn içinde)
      const rf = (intel as unknown as { radarFresh?: (c: typeof lc, t: number) => boolean }).radarFresh;
      const radar = !own && !!lc && (rf ? rf.call(intel, lc, w.time) : w.time - lc.lastRadar < 10);
      const hKnown = !!lc && (lc as unknown as { hKnown?: boolean }).hKnown !== false;
      const d = Math.hypot(pos.x - st.base.s.pos.x, pos.z - st.base.s.pos.z);
      out.push({
        id: lead.id, x: pos.x, z: pos.z, n: ac.flight ? ac.flight.alive.length : 1, abbr: lead.spec.abbr, name: ac.flight?.name ?? lead.callsign,
        src: own ? L('kolumuz görüyor', 'seen by our flight') : radar ? L('radar', 'radar') : lc ? L('gözcü', 'observers') : L('görünüyor', 'in sight'),
        alt: own || hKnown ? Math.round(pos.y / 100) * 100 : null, d,
      });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, 20);
  }

  /**
   * Haritayı üs ve verilen noktaların hepsi görünecek biçimde ortala (kenarlarda pay: sağ alttaki yakınlaştırma düğmeleri
   * üçgeni örtmesin).
   */
  private frameAll(pts: { x: number; z: number }[]): void {
    const b = this.st!.base.s.pos;
    const xs = [b.x, ...pts.map((p) => p.x)];
    const zs = [b.z, ...pts.map((p) => p.z)];
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const span = Math.max(x1 - x0, z1 - z0);
    this.st!.view = this.clampView({ z: MAP_SIZE / Math.max(40000, span * 1.5), cx: (x0 + x1) / 2 + span * 0.06, cz: (z0 + z1) / 2 + span * 0.04 });
  }

  /** Nokta görünümün iç kısmında mı (kenardan %12 içeride). */
  private inView(x: number, z: number): boolean {
    const v = this.viewOf();
    const u = ((x - v.cx) * v.z) / MAP_SIZE + 0.5;
    const t = ((z - v.cz) * v.z) / MAP_SIZE + 0.5;
    return u > 0.12 && u < 0.8 && t > 0.12 && t < 0.8;
  }

  /** Önlemede bir temas seçildi (kolun lideri hedef olur). */
  private pickContact(id: number): void {
    const c = this.enemyContacts().find((x) => x.id === id);
    if (!c) return;
    this.st!.plan.targetAircraftId = c.id;
    // Görünüm yerinde kalır; seçilen temas görünmüyorsa hepsi görünecek biçimde ortalanır
    if (!this.inView(c.x, c.z)) this.frameAll(this.enemyContacts());
    this.refreshSuggestions();
  }

  /** Seçili önleme hedefinin temas kaydı (hedef kolun herhangi bir uçağı olabilir). */
  private selContact(list = this.enemyContacts()): ReturnType<Planner['enemyContacts']>[number] | undefined {
    const id = this.st!.plan.targetAircraftId;
    if (id === null) return undefined;
    const a = this.game.world.aircraftById(id);
    const key = a?.flight?.leader()?.id ?? id;
    return list.find((c) => c.id === key);
  }

  /**
   * Bombalanabilir düşman yapıları (2026-11-26; bombardıman ve taarruz hedefi): yer, tür, üsten uzaklık, 5 km içindeki düşman
   * uçaksavarı. `major`: askerî ve ekonomik yapılar ile belediye ve itfaiye (haritada adlı, listede); evler yalnız haritada nokta.
   */
  private structTargets(): { id: number; x: number; z: number; kind: StructureKind; name: string; d: number; major: boolean; aa: number }[] {
    const g = this.game;
    const w = g.world;
    const b = this.st!.base.s.pos;
    const foes = w.structures.filter((s) => s.team !== g.playerTeam && !s.destroyed && s.build >= 1 && !w.teams[s.team]?.eliminated);
    const aas = foes.filter((s) => s.kind === 'aa');
    return foes.map((s) => ({
      id: s.id, x: s.pos.x, z: s.pos.z, kind: s.kind, name: s.name, d: Math.hypot(s.pos.x - b.x, s.pos.z - b.z), major: MAJOR_KINDS.has(s.kind),
      aa: aas.filter((a) => a !== s && Math.hypot(a.pos.x - s.pos.x, a.pos.z - s.pos.z) < 5000).length,
    })).sort((a, c) => a.d - c.d);
  }

  /**
   * Haritayı noktanın çevresine yaklaştır: hedefin yanındaki yapılar ve uçaksavar halkaları ayrılsın. Genişlik en az 30 km; bombardımanda
   * yaklaşma tutamağının en yakın yeri de görünsün (yatayda ~62 km).
   */
  private focusOn(x: number, z: number): void {
    const span = targetKind(this.st!.type) === 'structure' ? Math.max(30000, this.bendMin() * 2.6) : 30000;
    this.st!.view = this.clampView({ z: MAP_SIZE / span, cx: x, cz: z });
  }

  /** Yapı hedefi seçildi: harita hedefin çevresine yaklaşır, yük ve irtifa önerisi yenilenir. */
  private pickStruct(id: number): void {
    const t = this.structTargets().find((x) => x.id === id);
    if (!t) return;
    if (this.st!.plan.targetStructureId !== id) {
      this.st!.plan.waypoints = [];
      this.st!.bendEdit = false;
    }
    this.st!.plan.targetStructureId = id;
    this.focusOn(t.x, t.z);
    this.refreshSuggestions();
    this.autoAltitude();
  }

  // ------------------------------------------------------------------ özet

  private routePoints(): Vector3[] {
    const st = this.st!;
    const b = st.base.s.pos;
    const pts = [new Vector3(b.x, b.y + 60, b.z)];
    const f = MISSION_FIELDS[st.type];
    const low = f.lowLevel && st.plan.lowLevel;
    const alt = (x: number, z: number) => (low ? groundLevel(x, z) + st.plan.agl : f.altitude ? st.plan.altitude : groundLevel(x, z) + 1500);
    for (const wp of st.plan.waypoints) pts.push(new Vector3(wp.x, alt(wp.x, wp.z), wp.z));
    const tp = this.targetPos();
    if (tp) pts.push(new Vector3(tp.x, f.altitude || low ? Math.max(alt(tp.x, tp.z), groundLevel(tp.x, tp.z) + 40) : tp.y, tp.z));
    return pts;
  }

  /** Paketin seyir hızı (en yavaş tip). */
  private packageSpeed(): number {
    const st = this.st!;
    let v = Infinity;
    for (const p of st.force) v = Math.min(v, speedFor(SPECS[p.specId], MISSION_FIELDS[st.type].speed ? st.plan.speed : 'max'));
    return Number.isFinite(v) ? v : 100;
  }

  /** Devriyede bir tur (sn): çemberin çevresi, en yavaş tipin devriye hızında (sim: `speedFor(spec, 'eco')`). */
  private lapTime(): number {
    const st = this.st!;
    let v = Infinity;
    for (const p of st.force) if (p.count > 0) v = Math.min(v, speedFor(SPECS[p.specId], 'eco'));
    if (!Number.isFinite(v)) v = 100;
    return (2 * Math.PI * st.plan.patrolRadius) / v;
  }

  /** Görevin kendisinin süresi (sn): devriyede tur × tur süresi. */
  private actionTime(): number {
    const st = this.st!;
    const p = st.plan;
    // Yatay bombardımanda giriş noktasından (20 km) koşu ve dönüş ~5 dk; pikede kol sırayla dalar ~3 dk
    return st.type === 'cap' ? st.laps * this.lapTime() : st.type === 'sweep' ? p.stationTime : st.type === 'attack' ? 120 * p.passes + 60
      : st.type === 'intercept' ? 240 : st.type === 'ferry' ? 0 : st.type === 'levelBomb' ? 300 : 180;
  }

  /** Rota uzunluğu, hedefe varış süresi ve dönüş mesafesi. */
  private trip(): { dist: number; back: number; outT: number; v: number } {
    const st = this.st!;
    const pts = this.routePoints();
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const tp = this.targetPos();
    const back = tp ? Math.hypot(tp.x - st.base.s.pos.x, tp.z - st.base.s.pos.z) : 0;
    const v = this.packageSpeed();
    return { dist, back, outT: dist / v, v };
  }

  /**
   * Paketin hedefe varış süresi (sn): kalkış ve toplanma (kol büyüdükçe uzar) + tırmanış; tırmanırken yatayda seyir hızının ~%70'iyle
   * ilerlenir (ölçüm 2026-11-26: 8 × SC 250 yüklü He 111 5,5 km'ye ~25 dk, 60 m/sn). En yavaş tırmanan tip belirler.
   */
  private pkgTime(): { t: number; form: number } {
    const st = this.st!;
    const { dist, v } = this.trip();
    const to = this.climbTo();
    let t = dist / v;
    let maxN = 1;
    for (const pk of st.force) {
      if (pk.count <= 0) continue;
      maxN = Math.max(maxN, pk.count);
      const climbT = this.climbTime(SPECS[pk.specId], st.base.s.pos.y, to);
      const cd = climbT * v * 0.7;
      t = Math.max(t, cd >= dist ? dist / (v * 0.7) : climbT + (dist - cd) / v);
    }
    const form = 120 + 25 * maxN;
    return { t: form + t, form };
  }

  /** Seyir (önlemede hedefin) irtifası. */
  private climbTo(): number {
    const st = this.st!;
    const p = st.plan;
    if (st.type === 'intercept') return Math.max(1500, this.targetPos()?.y ?? 4500);
    return MISSION_FIELDS[st.type].lowLevel && p.lowLevel ? 300 : p.altitude;
  }

  /** Bir tipin görev için gereken yakıtı (kg), iç deposu ve atılabilir tankı. */
  private fuelOf(pk: Pick, outT: number, back: number, actionT: number, escort = false): { need: number; internal: number; tank: number } {
    const st = this.st!;
    const p = st.plan;
    const spec = SPECS[pk.specId];
    const mods = this.research.mods;
    const backT = st.type === 'ferry' ? 0 : back / spec.cruiseSpeed;
    const eco = Math.max(0.4, spec.cruiseThrottle - 0.15);
    const thr = p.speed === 'max' || st.type === 'intercept' ? 1 : p.speed === 'eco' ? eco : spec.cruiseThrottle;
    const altF = MISSION_FIELDS[st.type].lowLevel && p.lowLevel ? 300 : p.altitude;
    const flow = (t: number) => fuelFlowAt(spec, altF, { throttle: t, spool: t, wep: false, afterburner: false }, mods);
    // Devriye: sim istasyonun sonunda üsse dönüşü `isBingo` kuralıyla ister (dönüş ×1,25 + 4 dk yedek); kalkış ve tırmanış 2 dk tam
    // gaz, çatışma payı 90 sn; yol ve ekonomik gazdaki tur %20 paylı (kanat adamları formasyonu tutarken, dönüşlerde fazla yakar).
    // Payın ölçümü (2026-11-25, Hurricane, üç uzaklık): paysız hesapla kol %3–4 yakıtla iniyor, 6 turlu devriye turlarını bitirmeden
    // "yakıt azaldı" diye dönüyordu.
    // Bombardıman, taarruz ve önleme (2026-11-26; simle ölçülerek): paket süresi tırmanış ve toplanmayla (`pkgTime`); asıl uçaklar
    // toplanma ve tırmanışta tam gaz, kalanında seyir; eskort bütün yol boyunca bombardıman uçaklarının çevresinde ~%90 gazla döner
    // (ölçüm: Hurricane 0,075, P-51D 0,11 kg/sn). Yol ve görev %20 paylı; çatışma payı eskortta 3 dk, önlemede 2,5 dk, ötekilerde 1,5 dk;
    // dönüş simin `fuelToReturn`'ü (yakıt eşiği kuralı). Eski hesap süreyi yarı tahmin ediyordu: eskort Hurricane'ler yolda dönüyordu.
    if (FUEL_TYPES.has(st.type) && st.type !== 'cap') {
      const to = this.climbTo();
      const flowAt = (t: number) => fuelFlowAt(spec, to, { throttle: t, spool: t, wep: false, afterburner: false }, mods);
      const pt = this.pkgTime();
      const internal = spec.fuelKg * mods.fuelMul;
      const tank = this.pickLoadout(pk).tankFuel * mods.dropTankMul;
      const ret = this.game.world.fuelToReturn(spec, back);
      if (escort) {
        const need = 1.2 * (pt.t * flowAt(0.9) + actionT * flowAt(0.95)) + 180 * flowAt(1) + ret;
        return { need, internal, tank };
      }
      const climbT = Math.min(this.climbTime(spec, st.base.s.pos.y, to), pt.t - pt.form);
      const cruiseT = Math.max(0, pt.t - pt.form - climbT);
      const combat = st.type === 'intercept' ? 150 : 90;
      const need = 1.2 * (pt.form * flowAt(thr) + climbT * flowAt(1) + cruiseT * flowAt(thr) + actionT * flowAt(0.95)) + combat * flowAt(1) + ret;
      return { need, internal, tank };
    }
    // Devriye: görevin kendisi ekonomik gazla, çatışma payı 1,5 dk
    if (FUEL_TYPES.has(st.type)) {
      // Tırmanış tam gazla (uçağın tırmanma verisinden, yükle %85): 4.700 m'ye Hurricane ~8 dk; 2 dk sayınca uzak devriye
      // bölgeye varmadan yakıt eşiğine düşüyordu
      const icpt = st.type === 'intercept';
      const climbTo = icpt ? Math.max(1500, this.targetPos()?.y ?? 4500) : altF;
      const climbT = this.climbTime(spec, st.base.s.pos.y, climbTo);
      const fl = (t: number) => (icpt ? fuelFlowAt(spec, climbTo, { throttle: t, spool: t, wep: false, afterburner: false }, mods) : flow(t));
      const combat = escort ? 180 : icpt ? 150 : 90;
      const need = 1.2 * (outT * fl(thr) + actionT * fl(st.type === 'cap' ? eco : 0.95)) + climbT * Math.max(0, fl(1) - fl(thr)) + 60 * fl(1) + combat * fl(1)
        + this.game.world.fuelToReturn(spec, back);
      return { need, internal: spec.fuelKg * mods.fuelMul, tank: this.pickLoadout(pk).tankFuel * mods.dropTankMul };
    }
    const act = actionT * flow(0.95);
    const need = outT * flow(thr) + act + backT * spec.cruiseFlow + 240 * spec.cruiseFlow;
    return { need, internal: spec.fuelKg * mods.fuelMul, tank: this.pickLoadout(pk).tankFuel * mods.dropTankMul };
  }

  /** Kalkıştan irtifaya tam gazla tırmanış süresi (sn; tırmanma verisi 500 m dilimlerle, yükle %85). */
  private climbTime(spec: AircraftSpec, from: number, to: number): number {
    const { alt, climb } = spec.perf;
    let t = 0;
    for (let h = Math.max(0, from); h < to; h += 250) {
      const i = Math.min(Math.floor(h / 500), alt.length - 1);
      t += Math.min(250, to - h) / Math.max(climb[i] * 0.85, 2);
    }
    return t;
  }

  /** Bir tipin görevi yapmaya yetecek en az yakıtı (iç deponun payı; tank düşülür; 1'i aşarsa depo yetmiyor). */
  private fuelMin(pk: Pick, escort = false): number {
    const { outT, back } = this.trip();
    const f = this.fuelOf(pk, outT, back, this.actionTime(), escort);
    return (f.need - f.tank) / Math.max(f.internal, 1);
  }

  /** En az yakıt, kaydırıcı adımına (%5) yukarı yuvarlı; depoyu aşarsa 1. */
  private fuelFloor(pk: Pick, escort = false): number {
    return Math.min(1, Math.max(0.2, Math.ceil(this.fuelMin(pk, escort) * 20 - 1e-6) / 20));
  }

  /** Her tipin yakıtı en azın altına inmez; kendiliğindeyse tam en az. Yakıt ayarı olmayan görevde dolu depo. */
  private syncFuel(): void {
    const st = this.st!;
    const on = FUEL_TYPES.has(st.type);
    for (const [list, esc] of [[st.force, false], [st.escort, true]] as const) {
      for (const pk of list) {
        if (!on) { pk.fuel = 1; continue; }
        if (pk.count <= 0) continue;
        const m = this.fuelFloor(pk, esc);
        if (pk.fuelAuto || pk.fuel < m) pk.fuel = m;
      }
    }
  }

  /** Kuvvetin en az yakıtı (tiplerin en büyüğü) ve deposu yetmeyen tipler (devriye penceresi, yük etkisi). */
  private capFuel(): { min: number; over: { abbr: string; pct: number }[] } {
    const st = this.st!;
    let min = 0;
    const over: { abbr: string; pct: number }[] = [];
    for (const pk of st.force) {
      if (pk.count <= 0) continue;
      const frac = this.fuelMin(pk);
      min = Math.max(min, frac);
      if (frac > 1) over.push({ abbr: SPECS[pk.specId].abbr, pct: Math.round(frac * 100) });
    }
    return { min, over };
  }

  /** Devriye: süre turdan, hız hep seyir; yakıt en az payın altına inmez (kendiliğindeyse tam en az, %5'e yuvarlı). */
  private syncCap(): void {
    const st = this.st!;
    if (st.type !== 'cap') return;
    const p = st.plan;
    p.speed = 'cruise';
    p.stationTime = Math.round(st.laps * this.lapTime());
    p.laps = st.laps;
  }

  /** Planın denetimi: hatalar (kalkış kapalı), uyarılar, notlar, yakıt satırları ve zaman çizelgesi. */
  private analyze(): { errs: string[]; warns: string[]; fuelShort: boolean; notes: string[]; rows: string[]; line: string; dist: number; outT: number; total: number; v: number } {
    let fuelShort = false;
    const st = this.st!;
    this.syncCap();
    this.syncFuel();
    const warns: string[] = [];
    const errs: string[] = [];
    if (st.force.length === 0 || st.force.every((p) => p.count === 0)) errs.push(L('Kuvvete en az bir uçak ekle', 'Add at least one aircraft to the force'));
    const tp = this.targetPos();
    const kind = targetKind(st.type);
    if (!tp) errs.push(st.type === 'cap' ? L('Devriye bölgesi seçilmedi', 'No patrol area chosen') : kind === 'flight' ? L('Eskort edilecek kol seçilmedi', 'No flight chosen to escort') : kind === 'base' ? L('Hedef üs seçilmedi', 'No destination base chosen') : L('Hedef seçilmedi', 'No target chosen'));
    const { dist, back, outT, v } = this.trip();
    const p = st.plan;
    const actionT = this.actionTime();
    const rows: string[] = [];
    for (const [pk, isEsc] of [...st.force.map((x) => [x, false] as const), ...st.escort.map((x) => [x, true] as const)]) {
      if (pk.count <= 0) continue;
      const spec = SPECS[pk.specId];
      const f = this.fuelOf(pk, outT, back, actionT, isEsc);
      const needKg = f.need;
      const haveKg = f.internal * (FUEL_TYPES.has(st.type) ? pk.fuel : p.fuelFrac) + f.tank;
      if (pk.custom) {
        const chk = checkStores(spec, pk.custom, this.has);
        for (const e of chk.errors) errs.push(`${spec.abbr}: ${e}`);
        if (chk.missing.length) errs.push(`${spec.abbr}: ${L('araştırma gerekli', 'research required')} — ${chk.missing.map((r) => TECH_BY_ID[r]?.name ?? r).join(', ')}`);
      }
      const pct = Math.round((needKg / Math.max(haveKg, 1)) * 100);
      // Yakıt kendiliğinden yetecek kadar: yetmiyorsa depo da yetmiyordur, görev yapılamaz
      const fuelSet = FUEL_TYPES.has(st.type);
      if (fuelSet && needKg > f.internal + f.tank) {
        const need = Math.round(((needKg - f.tank) / f.internal) * 100);
        const fix = st.type === 'cap'
          ? L('Çapı ya da tur sayısını azalt, ya da üsse daha yakın bir bölge seç.', 'Reduce the diameter or the laps, or pick an area closer to the base.')
          : st.type === 'intercept' ? L('Hedef çok uzak; daha yakın bir kol seç.', 'The target is too far; pick a closer flight.')
          : L('Daha yakın bir hedef seç, yaklaşma yolunu kısalt ya da atılabilir tank tak.', 'Pick a closer target, shorten the approach or fit drop tanks.');
        errs.push(L(`${isEsc ? 'Eskort ' : ''}${spec.abbr}: yakıt yetmiyor (gereken: deponun %${need} kadarı). ${fix}`,
          `${isEsc ? 'Escort ' : ''}${spec.abbr}: not enough fuel (${need}% of the tanks needed). ${fix}`));
      }
      if (needKg > haveKg && !fuelSet) fuelShort = true;
      if (needKg > haveKg && !fuelSet) warns.push(L(`${spec.abbr}: yakıt yetmeyebilir (gereken ≈${nf.format(needKg)} kg, mevcut ${nf.format(haveKg)} kg)`, `${spec.abbr}: fuel may run short (needs ≈${nf.format(needKg)} kg, has ${nf.format(haveKg)} kg)`));
      rows.push(`<div class="srow"><span>${pk.count} × ${esc(spec.abbr)}</span><div class="fuelbar"><i style="width:${Math.min(100, pct)}%" class="${pct > 100 ? 'over' : pct > 85 ? 'tight' : ''}"></i></div><b>${P(pct)}</b></div>`);
    }
    // Personel
    const crewNeed = [...st.force, ...st.escort].reduce((a, x) => a + x.count * SPECS[x.specId].crew, 0);
    const crewFree = this.game.world.crewFree(st.base.s.team);
    if (Number.isFinite(crewFree) && crewNeed > crewFree) {
      errs.push(L(`Personel yetmiyor: ${crewNeed} kişi gerekli, ${crewFree} kişi boşta. İnşa › Şehir'den ev kur ya da uçak sayısını azalt.`,
        `Not enough personnel: ${crewNeed} needed, ${crewFree} free. Build houses from Build › City or send fewer aircraft.`));
    }
    const tg = tp ? groundLevel(tp.x, tp.z) : 0;
    if (MISSION_FIELDS[st.type].altitude && !(MISSION_FIELDS[st.type].lowLevel && p.lowLevel) && tp && p.altitude < tg + 300) {
      warns.push(L(`İrtifa hedef bölgedeki araziye çok yakın (arazi ${nf.format(tg)} m)`, `Altitude is too close to the terrain at the target (ground ${nf.format(tg)} m)`));
    }
    const notes: string[] = [];
    const kinds = new Set(st.force.filter((x) => x.count > 0).map((x) => x.specId));
    if (kinds.size > 1) {
      const slow = st.force.reduce((a, b) => (speedFor(SPECS[a.specId], p.speed) < speedFor(SPECS[b.specId], p.speed) ? a : b));
      notes.push(L(`Görev paketi: ${kinds.size} tip birlikte toplanır, ${SPECS[slow.specId].abbr} hızında (${Math.round(v * 3.6)} km/sa) uçar; her tip kendi kolunda saldırır.`,
        `Strike package: ${kinds.size} types form up together and fly at the ${SPECS[slow.specId].abbr}'s speed (${Math.round(v * 3.6)} km/h); each type attacks in its own flight.`));
    }
    if (st.escort.some((x) => x.count > 0)) notes.push(L('Eskort kolları saldırı kollarına sırayla dağıtılır.', 'Escort flights are shared out among the strike flights in turn.'));
    const splitNote = (list: Pick[], type: MissionType) => list.filter((x) => this.splittable(x, type) && x.split !== null && x.split > 0 && x.split < x.count)
      .map((x) => `${SPECS[x.specId].abbr}: ${this.splitLabel(type, x.count, x.split)}`);
    const sn = [...splitNote(st.force, st.type), ...splitNote(st.escort, 'escort')];
    if (sn.length) notes.push(`${L('Görev dağılımı (ayrı kollar)', 'Task split (separate flights)')}: ${sn.join('; ')}.`);
    // Zaman çizelgesi
    const backT = st.type === 'ferry' ? 0 : back / v;
    // Bombardıman, taarruz, önleme: varış tırmanış ve toplanmayla (yakıt hesabıyla aynı)
    const pt = FUEL_TYPES.has(st.type) && st.type !== 'cap' ? this.pkgTime() : null;
    const segs: [string, number, string][] = [
      [L('Kalkış', 'Takeoff'), pt ? pt.form : 150, 'k'], [L('İntikal', 'Transit'), pt ? pt.t - pt.form : outT, 'i'], [st.type === 'ferry' ? L('İniş', 'Landing') : L('Görev', 'Mission'), Math.max(actionT, 60), 'g'], [L('Dönüş', 'Return'), backT, 'd'],
    ];
    const total = segs.reduce((a, s) => a + s[1], 0);
    const line = segs.filter((s) => s[1] > 0).map(([n, t, c]) =>
      `<i class="${c}" style="flex:${Math.max(t, total * 0.06).toFixed(0)}" title="${n}: ${fmtDur(t)}"><span>${n}</span></i>`).join('');
    return { errs, warns, fuelShort, notes, rows, line, dist, outT: pt ? pt.t : outT, total, v };
  }

  /** Alttaki kısa özet: başarı, mesafe ve süre, hatalar; uyarılar tek satır (ayrıntı pencerede). */
  private footHtml(): { html: string; msgs: string; ok: boolean } {
    const a = this.analyze();
    const { o } = this.oddsData();
    const col = o.pct >= 65 ? 'var(--accent)' : o.pct >= 40 ? 'var(--warn)' : 'var(--red)';
    const tgt = this.targetPos() !== null;
    const html = `
      <button class="pl-odds" data-act="podds" title="${L('Başarı ayrıntısı', 'Success details')}">
        <span class="pl-ol">${L('Başarı', 'Success')} <b style="color:${col}">${P(o.pct)}</b><span class="pl-more">${L('ayrıntı', 'details')} ›</span></span>
        <span class="pl-meter"><i style="width:${o.pct}%;background:${col}"></i></span>
        ${tgt ? `<span class="pl-facts">${(a.dist / 1000).toFixed(0)} km · ${L('hedefe', 'to target')} ~${fmtDur(a.outT + 150)}</span>` : ''}
      </button>`;
    // Mesajlar tek satır (en çok iki); dokununca ayrıntı penceresinde tamamı
    const msgs = [...a.errs.map((w) => `<button class="pl-msg bad" data-act="podds">${esc(w)}</button>`),
      ...a.warns.map((w) => `<button class="pl-msg warn" data-act="podds">${esc(w)}</button>`)].slice(0, 2).join('');
    return { html, msgs, ok: a.errs.length === 0 };
  }

  /** Başarı ayrıntısı penceresi: ihtimal ve etkenleri, zaman çizelgesi, yakıt, uyarılar ve notlar. */
  private detailHtml(): string {
    const a = this.analyze();
    return `${this.oddsHtml()}
      <div class="timeline">${a.line}</div>
      <div class="kv">
        <span>${L('Rota', 'Route')}</span><span>${(a.dist / 1000).toFixed(1)} km</span>
        <span>${L('Hedefe varış', 'Time to target')}</span><span>~${fmtDur(a.outT + 150)}</span>
        <span>${L('Toplam süre', 'Total time')}</span><span>~${fmtDur(a.total)}</span>
        <span>${L('Seyir hızı', 'Cruise speed')}</span><span>${Math.round(a.v * 3.6)} ${KMH}</span>
      </div>
      ${a.rows.length ? `<div class="srows"><div class="srow head"><span>${L('Yakıt kullanımı', 'Fuel use')}</span></div>${a.rows.join('')}</div>` : ''}
      ${a.errs.map((w) => `<p class="warnbox bad">${esc(w)}</p>`).join('')}
      ${a.warns.map((w) => `<p class="warnbox">${esc(w)}</p>`).join('')}
      ${a.notes.map((w) => `<p class="infobox">${esc(w)}</p>`).join('')}`;
  }

  private oddsData() {
    const st = this.st!;
    const w = this.game.world;
    const team = st.base.s.team;
    const plan: MissionPlan = { ...st.plan, type: st.type };
    const force = st.force.map((x) => ({
      specId: x.specId, count: x.count, loadout: this.pickLoadout(x), split: this.splittable(x, st.type) ? x.split : null,
    }));
    return { o: missionOdds(w, team, plan, force, st.escort, st.base.s.pos), tally: w.missionTally.get(`${team}:${st.type}`) };
  }

  /** Tahmini başarı ihtimali, etkenler, ihtimali artıracak araştırmalar ve bu türdeki geçmiş sonuçlar. */
  private oddsHtml(): string {
    const { o, tally } = this.oddsData();
    const hist = tally && tally.success + tally.fail > 0
      ? `<div class="odds-hist">${L('Bu tür görevlerin', 'Missions of this type')}: <b class="pos">${tally.success} ${L('başarılı', 'won')}</b> · <b class="neg">${tally.fail} ${L('başarısız', 'lost')}</b>${tally.none ? ` · ${tally.none} ${L('sonuçsuz', 'inconclusive')}` : ''}</div>`
      : '';
    const col = o.pct >= 65 ? 'var(--accent)' : o.pct >= 40 ? 'var(--warn)' : 'var(--red)';
    const f = o.factors.map((x) => `<li class="${x.delta >= 0 ? 'up' : 'dn'}"><span>${esc(x.label)}</span><b>${x.delta >= 0 ? '+' : '−'}${Math.abs(x.delta)}</b></li>`).join('');
    const miss = o.missing.slice(0, 4).map((x) => `${esc(x.label)} <b>+${x.delta}</b>`).join(' · ');
    return `<div class="odds">
      <div class="odds-top"><span>${L('Tahmini başarı', 'Estimated success')}</span><b style="color:${col}">${P(o.pct)}</b></div>
      ${bar(o.pct, col, true)}
      <div class="odds-crit"><b>${L('Başarı ölçütü', 'Success criterion')}:</b> ${esc(o.criterion)}. <b>${L('Ödül', 'Reward')}:</b> ${esc(o.rewardText)} — ${L('yalnız başarıda', 'only on success')}.</div>
      ${f ? `<ul class="odds-f">${f}</ul>` : ''}
      ${miss ? `<div class="odds-miss"><b>${L('Araştırılırsa artar', 'Research would raise it')}:</b> ${miss}</div>` : ''}
      ${hist}
    </div>`;
  }

  update(): void {
    if (!this.isOpen || !this.st) return;
    this.game.renderer.plannerRoute = this.routePoints();
    const tp = this.st.plan.targetPos;
    this.game.renderer.plannerArea = this.st.type === 'cap' && tp ? { x: tp.x, z: tp.z, r: this.st.plan.patrolRadius } : null;
    const now = performance.now();
    if (now < this.nextSummary || !this.summaryEl) return;
    this.nextSummary = now + 400;
    const { html, msgs, ok } = this.footHtml();
    this.summaryEl.innerHTML = html;
    const m = this.el.querySelector('#plan-msgs');
    if (m) m.innerHTML = msgs;
    const btn = this.el.querySelector<HTMLButtonElement>('[data-act="launch"]');
    if (btn) btn.disabled = !ok;
  }

  // ------------------------------------------------------------------ çizim

  private loadoutText(spec: AircraftSpec, l: Loadout): { icons: string; text: string } {
    let icons = '';
    if (l.bombCount) icons += ICO.bomb;
    if (l.rocketCount) icons += ICO.rocket;
    if (l.tankFuel) icons += ICO.tank;
    if (l.extraGuns || l.replaceGuns) icons += ICO.gun;
    const text = loadoutSummary(spec, l);
    if (!icons) return { icons: ICO.clean, text: spec.guns.map((g) => g.name).join(', ') || L('yalnız savunma silahları', 'defensive guns only') };
    return { icons, text };
  }

  /** Yükün performansa yaklaşık etkisi. */
  private loadoutEffect(spec: AircraftSpec, l: Loadout): string {
    const m = loadoutMass(l);
    const dv = spec.vMax * (1 - Math.pow(1 + l.drag / Math.max(spec.cd0 * 40, 0.4), -1 / 3)) + spec.vMax * (m / (spec.massEmpty + spec.fuelKg)) * 0.04;
    const out: string[] = [];
    if (m > 0) out.push(`+${nf.format(m)} kg`);
    if (dv > 0.5) out.push(`${L('azami hız', 'top speed')} ≈ −${Math.round(dv * 3.6)} ${KMH}`);
    if (l.tankFuel) out.push(`${L('menzil', 'range')} ≈ +${P(Math.round((l.tankFuel / spec.fuelKg) * 85))}`);
    return out.join(' · ') || L('temiz uçak: tam performans', 'clean aircraft: full performance');
  }

  /** Serbest yükleme: askı başına mühimmat ve adet, toplam yük çubuğu. */
  /**
   * Serbest yükleme (2026-11-25, kullanıcı çizimi): uçağın önden görünüşü (kanat, gövde, motorlar), altında soldan sağa askı kutuları,
   * her kutudan kanattaki yerine çizgi. Kanat çifti iki kutu (aynı seçim), bomba bölmesi ortada tek kutu. Kutuya dokununca altında o
   * askıya uyan yükler (ağırlık, adet; araştırma isteyen kilitli). Sınırlar uçağın tanımından (`Hardpoint`: pylons, maxN, cap, accepts).
   * Çift askının iki yanı ayrı kutu ve ayrı yük (`Placement.side`; 2026-11-26 kullanıcı isteği). Üstte hız kaybı, menzil ve görevdeki etkisi.
   */
  private customEditor(pk: Pick, k: string, ordOk: boolean, selHp?: string): string {
    const spec = SPECS[pk.specId];
    if (pk.custom) pk.custom = splitSides(spec, pk.custom);
    const place = pk.custom ?? [];
    const chk = checkStores(spec, place, this.has);
    if (!spec.hardpoints.length) return `<p class="muted small">${L('Bu uçakta dış yük askısı yok.', 'This aircraft has no hardpoints.')}</p>`;
    // Askı yerleri (önden bakış: ekranın sağı uçağın sol kanadı, modelde +x; yan = x'in işareti)
    const slots: { h: Hardpoint; x: number; side?: 1 | -1 }[] = [];
    for (const h of spec.hardpoints) {
      if (!paired(h)) slots.push({ h, x: 0 });
      else if (h.kind === 'center') for (const s of [-1, 1] as const) slots.push({ h, x: s * 0.07, side: s });
      else {
        const at = h.at ?? (h.kind === 'tip' ? 1 : h.kind === 'rail' ? 0.6 : 0.35);
        for (const s of [-1, 1] as const) slots.push({ h, x: s * Math.min(1, at), side: s });
      }
    }
    const keyOf = (h: Hardpoint, side?: number) => `${h.id}:${side ?? 0}`;
    const curOf = (h: Hardpoint, side?: number) => place.find((x) => x.hp === h.id && (x.side ?? 0) === (side ?? 0) && x.n > 0);
    slots.sort((a, b) => a.x - b.x);
    const n = slots.length;
    // Önden görünüş (viewBox 1000 × 170): kanat hafif dihedralli, gövde ortada, motor sayısına göre motorlar
    const big = spec.role === 'bomber';
    const wy = (x: number) => 92 - Math.abs(x) * 16;
    const engines: number[] = spec.engine.count >= 4 ? [-0.42, -0.22, 0.22, 0.42] : spec.engine.count >= 2 ? [-0.3, 0.3] : [];
    const svg = `<svg viewBox="0 0 1000 170" class="hp-view" preserveAspectRatio="none">
      <path class="wing" d="M 40 ${wy(-1) - 3} L 500 ${wy(0) - 5} L 960 ${wy(1) - 3} L 960 ${wy(1) + 3} L 500 ${wy(0) + 8} L 40 ${wy(-1) + 3} Z"/>
      ${engines.map((e) => `<ellipse class="eng" cx="${500 + e * 460}" cy="${wy(e) + 8}" rx="${big ? 20 : 16}" ry="${big ? 22 : 18}"/>`).join('')}
      <rect class="fin" x="494" y="${big ? 26 : 36}" width="12" height="40" rx="5"/>
      <ellipse class="fus" cx="500" cy="${wy(0) + 2}" rx="${big ? 42 : 32}" ry="${big ? 44 : 36}"/>
      ${slots.map((s, i) => {
        const px = 500 + s.x * 460;
        const sx = ((i + 0.5) / n) * 1000;
        const on = keyOf(s.h, s.side) === selHp;
        return `<path class="lead ${on ? 'on' : ''}" d="M ${px.toFixed(0)} ${(wy(s.x) + (s.x === 0 ? 40 : 6)).toFixed(0)} C ${px.toFixed(0)} 140, ${sx.toFixed(0)} 130, ${sx.toFixed(0)} 170"/>`;
      }).join('')}
    </svg>`;
    const icon = (s: StoreDef) => (s.kind === 'bomb' ? ICO.bomb : s.kind === 'rocket' ? ICO.rocket : s.kind === 'tank' ? ICO.tank : ICO.gun);
    const sideName = (side?: number) => (side === 1 ? L('sol', 'left') : side === -1 ? L('sağ', 'right') : '');
    const boxes = slots.map((s) => {
      const cur = curOf(s.h, s.side);
      const store = cur ? STORES[cur.store] : undefined;
      const tot = cur ? cur.n * pylonsOf(s.h, cur) : 0;
      return `<button class="hp-slot ${store ? 'full' : ''} ${keyOf(s.h, s.side) === selHp ? 'sel' : ''}" data-act="${k}hpsel" data-spec="${spec.id}" data-hp="${keyOf(s.h, s.side)}" title="${esc(s.h.name)}${s.side ? ` (${sideName(s.side)})` : ''}">
        ${store ? `<span class="licons">${icon(store)}</span><b>${esc(store.short)}</b><small>${tot > 1 ? `×${tot}` : ''}</small>` : `<span class="hp-plus">+</span>`}
      </button>`;
    }).join('');
    // Seçili askının yükleri
    let pickList = `<p class="muted small hp-hint">${L('Bir askıya dokun: oraya takılabilecek yükler açılır.', 'Tap a hardpoint to see what it can carry.')}</p>`;
    const [selId, selSide0] = (selHp ?? '').split(':');
    const selSide = Number(selSide0) === 1 ? 1 : Number(selSide0) === -1 ? -1 : undefined;
    const h = spec.hardpoints.find((x) => x.id === selId);
    if (h) {
      const cur = curOf(h, selSide);
      const cap = capOf(h, this.has);
      const opts = Object.values(STORES).filter((st) => fits(spec, h, st) && (ordOk || st.kind === 'tank' || st.kind === 'gunpod'));
      const store = cur ? STORES[cur.store] : undefined;
      const maxN = store ? Math.max(1, Math.min(h.maxN, Math.floor(cap / store.mass))) : 0;
      const pyl = pylonsOf(h, { hp: h.id, store: '', n: 1, side: selSide });
      const other = selSide ? curOf(h, -selSide) : undefined;
      const data = `data-spec="${spec.id}" data-hp="${keyOf(h, selSide)}"`;
      const mirror = selSide && (cur?.store !== other?.store || cur?.n !== other?.n)
        ? `<button class="mini hp-mir" data-act="${k}hpmir" ${data}>${L(`${selSide === 1 ? 'Sağ' : 'Sol'} yana da aynısı`, `Same on the ${selSide === 1 ? 'right' : 'left'}`)}</button>` : '';
      pickList = `<div class="hp-pick">
        <div class="hp-h"><div class="hp-ht"><b>${esc(h.name)}${selSide ? ` · ${sideName(selSide)}` : h.pylons > 1 ? ` ×${h.pylons}` : ''}</b>${mirror}</div><small>${L('askı başına', 'per pylon')} ≤ ${nf.format(cap)} kg${h.heavyCap && cap < h.heavyCap ? L(` (ağır askıyla ${nf.format(h.heavyCap)})`, ` (${nf.format(h.heavyCap)} with heavy racks)`) : ''}${h.maxN > 1 ? L(` · en çok ${h.maxN} adet`, ` · up to ${h.maxN}`) : ''}${h.kind === 'bay' ? L(' · iç bölme', ' · internal bay') : ''}</small></div>
        <div class="hp-opts">
          <button class="hp-opt ${store ? '' : 'active'}" data-act="${k}hpset" ${data} data-v=""><b>${L('Boş', 'Empty')}</b><small>${L('askı boş', 'nothing fitted')}</small></button>
          ${opts.map((st) => {
            const locked = (st.requires ?? []).filter((r) => !this.has(r));
            const fitN = Math.max(1, Math.min(h.maxN, Math.floor(cap / st.mass)));
            return `<button class="hp-opt ${cur?.store === st.id ? 'active' : ''}" data-act="${k}hpset" ${data} data-v="${st.id}" ${locked.length || st.mass > cap ? 'disabled' : ''}>
              <span class="licons">${icon(st)}</span><b>${esc(st.name)}</b>
              <small>${nf.format(st.mass)} kg${fitN > 1 ? L(` · askıya ${fitN}`, ` · ${fitN} per pylon`) : ''}${locked.length ? ` · 🔒 ${esc(locked.map((r) => TECH_BY_ID[r]?.name ?? r).join(', '))}` : st.mass > cap ? L(' · ağır askı gerekli', ' · needs heavy racks') : ''}</small></button>`;
          }).join('')}
        </div>
        ${store && maxN > 1 ? `<div class="form-row"><span>${L('Askı başına', 'Per pylon')}</span><div class="stepper"><button data-act="${k}hpn" ${data} data-v="-1" ${cur!.n <= 1 ? 'disabled' : ''}>−</button><b>${cur!.n}</b><button data-act="${k}hpn" ${data} data-v="1" ${cur!.n >= maxN ? 'disabled' : ''}>+</button></div>
          <small class="muted">= ${cur!.n * pyl} × ${esc(store.short)} · ${nf.format(cur!.n * pyl * store.mass)} kg</small></div>` : ''}
      </div>`;
    }
    const kits = spec.loadouts.filter((l) => l.replaceGuns);
    const kitRow = kits.length ? `<div class="form-row"><span>${L('Silah kiti', 'Gun kit')}</span><select data-act="${k}kit" data-spec="${spec.id}">
      <option value="">${L('Standart silahlar', 'Standard guns')}</option>${kits.map((l) => `<option value="${l.id}" ${pk.kit === l.id ? 'selected' : ''} ${loadoutAllowed(l, this.has) ? '' : 'disabled'}>${esc(l.name)}</option>`).join('')}</select></div>` : '';
    const pct = Math.min(100, (chk.kg / Math.max(spec.maxLoad, 1)) * 100);
    const lo = this.pickLoadout(pk);
    // Yükün etkisi: başarı (devriyede en az yakıt) ve boş yüke göre farkı, bomba/roket, hız kaybı, menzil
    const loss = this.speedLoss(spec, lo);
    const range = lo.tankFuel ? Math.round((lo.tankFuel / spec.fuelKg) * 85) : 0;
    const strike = lo.bombKg + lo.rocketCount * 30;
    const capMission = this.st!.type === 'cap' && k === 'f';
    const now = capMission ? Math.round(this.capFuel().min * 100) : this.oddsData().o.pct;
    const d = now - this.loadImpact(pk, 'std');
    const delta = d ? ` <em class="${(capMission ? -d : d) > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</em>` : '';
    const bar = (label: string, frac: number, text: string, cls: string) =>
      `<div class="lbar ${cls}"><span>${label}</span><i><u style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></u></i><b>${text}</b></div>`;
    const stats = `<div class="hp-stats">
      <div class="hp-odds"><span>${capMission ? L('En az yakıt', 'Minimum fuel') : L('Başarı', 'Success')}</span><b>${P(now)}</b>${delta}<small>${d ? L('boş yüke göre', 'vs. no load') : ''}</small></div>
      <div class="lbars">
        ${bar(L('Bomba/roket', 'Bombs/rockets'), strike / Math.max(spec.maxLoad, 1), strike ? `${nf.format(lo.bombKg)} kg${lo.rocketCount ? ` · ${lo.rocketCount} ${L('roket', 'rockets')}` : ''}` : '—', 'hit')}
        ${bar(L('Hız kaybı', 'Speed loss'), loss / 80, loss ? `−${loss} ${KMH}` : '—', 'slow')}
        ${bar(L('Menzil', 'Range'), range / 100, range ? `+${P(range)}` : '—', 'far')}
      </div></div>`;
    return `<div class="hp-board"><div class="hp-plane">${svg}<div class="hp-slots" style="grid-template-columns:repeat(${n}, minmax(0, 1fr))">${boxes}</div></div>
      ${stats}${pickList}${kitRow}
      <div class="loadbar"><span>${L('Toplam yük', 'Total load')}</span><div class="fuelbar"><i style="width:${pct.toFixed(0)}%" class="${chk.kg > spec.maxLoad ? 'over' : pct > 85 ? 'tight' : ''}"></i></div><b>${nf.format(chk.kg)} / ${nf.format(spec.maxLoad)} kg</b></div>
      <p class="muted small">${esc(this.loadoutEffect(spec, lo))}</p>
      ${chk.errors.map((e) => `<p class="warnbox bad">${esc(e)}</p>`).join('')}
      ${chk.missing.length ? `<p class="warnbox">${L('Araştırma gerekli', 'Research required')}: ${esc(chk.missing.map((r) => TECH_BY_ID[r]?.name ?? r).join(', '))}</p>` : ''}
    </div>`;
  }

  /** Kuvvet ya da eskortta bir tip: resim, ad, sayı; seçiliyse yükü tek satırda (dokununca yük penceresi). */
  private acRow(pk: Pick, ready: number, escort: boolean): string {
    const st = this.st!;
    const spec = SPECS[pk.specId];
    const k = escort ? 'e' : 'f';
    const maxN = this.maxCount(pk, ready);
    const crewTxt = Number.isFinite(this.crewLeft(pk)) ? ` · ${L(`${spec.crew} kişilik`, `crew ${spec.crew}`)}` : '';
    let load = '';
    if (pk.count > 0) {
      const lo = this.pickLoadout(pk);
      const lt = this.loadoutText(spec, lo);
      const sugg = !pk.custom && lo.id === this.suggestLoadout(spec, escort ? 'escort' : st.type);
      load = `<button class="pl-load" data-act="${k}open" data-spec="${spec.id}"><span class="licons">${lt.icons}</span>
        <span class="ln">${esc(pk.custom ? L('Serbest yük', 'Custom load') : lo.name)}${sugg ? ` <em>${L('önerilen', 'suggested')}</em>` : ''}</span><span class="chev">›</span></button>`;
      // Yakıt bu tipin satırında (2026-11-26, kullanıcı: altta tip adıyla ayrı liste karışıyordu): kendi deposu ve tüketimiyle en az
      if (FUEL_TYPES.has(st.type)) {
        const min = this.fuelMin(pk, escort);
        const floor = this.fuelFloor(pk, escort);
        const over = min > 1;
        load += `<div class="pl-acfuel ${over ? 'bad' : ''}" title="${L('Görevi yapmaya yetecek en az yakıtla kalkar; fazlası uçağı ağırlaştırır.', 'Takes off with just enough fuel for the mission; more fuel makes the aircraft heavier.')}">
          <span>${L('Yakıt', 'Fuel')}<small>${over ? L(`deponun %${Math.round(min * 100)} kadarı gerekli`, `needs ${Math.round(min * 100)}% of the tanks`) : pk.fuelAuto ? L(`en az · ${P(Math.round(floor * 100))}`, `minimum · ${P(Math.round(floor * 100))}`) : L(`en az ${P(Math.round(floor * 100))}`, `at least ${P(Math.round(floor * 100))}`)}</small></span>
          <input type="range" min="${Math.round(floor * 100)}" max="100" step="5" value="${Math.round(pk.fuel * 100)}" data-act="pfuel" data-spec="${pk.specId}" ${escort ? 'data-esc="1"' : ''} ${over || floor >= 1 ? 'disabled' : ''}><b>${P(Math.round(pk.fuel * 100))}</b></div>`;
      }
    }
    return `<div class="pl-ac ${pk.count ? '' : 'off'}">
      ${kartImg(spec.id)}
      <div class="pl-ac-n"><b>${esc(spec.abbr)}</b><small>${ROLE_NAMES[spec.role]} · ${ready} ${L('hazır', 'ready')}${crewTxt}${maxN < ready ? ` · <span class="bad">${L(`personelle ${maxN}`, `${maxN} with crews`)}</span>` : ''}</small></div>
      <div class="stepper"><button data-act="${k}cnt" data-spec="${spec.id}" data-v="-1" ${pk.count <= 0 ? 'disabled' : ''}>−</button><b>${pk.count}</b><button data-act="${k}cnt" data-spec="${spec.id}" data-v="1" ${pk.count >= maxN ? 'disabled' : ''}>+</button></div>
      ${load}
    </div>`;
  }

  /** Yükün hız kaybı (km/sa, yaklaşık: sürükleme ve kütle). */
  private speedLoss(spec: AircraftSpec, l: Loadout): number {
    const dv = spec.vMax * (1 - Math.pow(1 + l.drag / Math.max(spec.cd0 * 40, 0.4), -1 / 3)) + spec.vMax * (loadoutMass(l) / (spec.massEmpty + spec.fuelKg)) * 0.04;
    return Math.max(0, Math.round(dv * 3.6));
  }

  /** Bu yükle görevin bir sayısı: devriyede en az yakıt (%), öteki görevlerde tahmini başarı (%). Seçim geçici değişir, geri alınır. */
  private loadImpact(pk: Pick, loadoutId: string): number {
    const keep = { id: pk.loadoutId, custom: pk.custom };
    pk.loadoutId = loadoutId;
    pk.custom = null;
    const v = this.st!.type === 'cap' ? Math.round(this.capFuel().min * 100) : this.oddsData().o.pct;
    pk.loadoutId = keep.id;
    pk.custom = keep.custom;
    return v;
  }

  /**
   * Yük ve silah penceresi (2026-11-25): üstte uçağın resmi ve seçili yük; hazır yükler karşılaştırma çubuklarıyla (bomba/roket, hız
   * kaybı, menzil) ve bu görevdeki etkisiyle (devriyede en az yakıt, öteki görevlerde başarı tahmini). Göreve uymayan yük listede yok,
   * araştırma isteyen kilitli ve araştırmaya bağlantılı. Mermi kuşağı göreve göre, "değiştir" ile açılır. Formasyon göreve göre kendiliğinden.
   */
  private loadPop(pk: Pick, escort: boolean, beltsOpen: boolean, selHp?: string): string {
    const st = this.st!;
    const spec = SPECS[pk.specId];
    const lo = this.pickLoadout(pk);
    const mission = escort ? 'escort' : st.type;
    const suggested = this.suggestLoadout(spec, mission);
    const k = escort ? 'e' : 'f';
    const ordAllowed = MISSION_FIELDS[mission].ordnance;
    const usable = spec.loadouts.filter((l) => ordAllowed || (!l.bombCount && !l.rocketCount));
    const strikeOf = (l: Loadout) => l.bombKg + l.rocketCount * 30;
    const maxStrike = Math.max(1, ...usable.map(strikeOf));
    const cap = st.type === 'cap' && !escort;
    const baseImpact = pk.custom ? null : this.loadImpact(pk, pk.loadoutId);
    const bar = (label: string, frac: number, text: string, cls = '') =>
      `<div class="lbar ${cls}"><span>${label}</span><i><u style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></u></i><b>${text}</b></div>`;
    const list = pk.custom ? this.customEditor(pk, k, ordAllowed, selHp) : usable.map((l) => {
      const ok = loadoutAllowed(l, this.has);
      const t = this.loadoutText(spec, l);
      const loss = this.speedLoss(spec, l);
      const range = l.tankFuel ? Math.round((l.tankFuel / spec.fuelKg) * 85) : 0;
      const strike = strikeOf(l);
      let impact = '';
      if (ok) {
        const v = this.loadImpact(pk, l.id);
        if (cap) impact = L(`en az yakıt ${P(v)}`, `minimum fuel ${P(v)}`);
        else {
          const d = baseImpact === null ? 0 : v - baseImpact;
          impact = `${L('başarı', 'success')} ${P(v)}${d ? ` <em class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</em>` : ''}`;
        }
      }
      const reqs = l.reqs.filter((r) => !this.has(r)).map((r) => TECH_BY_ID[r]?.name ?? r).join(', ');
      return `<button class="lcard2 ${l.id === pk.loadoutId ? 'active' : ''} ${ok ? '' : 'locked'}" data-act="${ok ? `${k}load` : 'openres'}" data-spec="${spec.id}" data-v="${l.id}">
        <div class="lc-h"><span class="licons">${t.icons}</span><b>${esc(l.name)}</b>${l.id === suggested ? `<em>${L('önerilen', 'suggested')}</em>` : ''}${ok ? `<span class="lc-i">${impact}</span>` : ''}</div>
        ${t.text && t.text.replace(/\s·\s/g, ' + ') !== l.name ? `<small class="lc-t">${esc(t.text)}</small>` : ''}
        ${ok ? `<div class="lbars">
          ${bar(L('Bomba/roket', 'Bombs/rockets'), strike / maxStrike, strike ? `${nf.format(l.bombKg)} kg${l.rocketCount ? ` · ${l.rocketCount} ${L('roket', 'rockets')}` : ''}` : '—', 'hit')}
          ${bar(L('Hız kaybı', 'Speed loss'), loss / 80, loss ? `−${loss} ${KMH}` : '—', 'slow')}
          ${bar(L('Menzil', 'Range'), range / 100, range ? `+${P(range)}` : '—', 'far')}
        </div>` : `<small class="lc-lock">🔒 ${L('araştırma', 'research')}: ${esc(reqs)} · <u>${L('Araştırma ağacında aç ›', 'Open in research ›')}</u></small>`}
      </button>`;
    }).join('');
    const modeTabs = spec.hardpoints.length ? `<div class="seg ltabs">
      <button class="${pk.custom ? '' : 'active'}" data-act="${k}mode" data-spec="${spec.id}" data-v="preset">${L('Hazır yükler', 'Presets')}</button>
      <button class="${pk.custom ? 'active' : ''}" data-act="${k}mode" data-spec="${spec.id}" data-v="custom">${L('Serbest yükleme', 'Custom loading')}</button></div>` : '';
    const guns = spec.guns.length || lo.extraGuns || lo.replaceGuns;
    const auto = pk.belt === defaultPlan(mission, spec).belt;
    const belts = guns ? `<div class="lbelt">
        <span>${L('Mermi', 'Ammo')}: <b>${esc(BELTS[pk.belt].name)}</b>${auto ? ` <small>(${L('göreve göre', 'for the mission')})</small>` : ''}</span>
        <button class="mini" data-act="beltx">${beltsOpen ? L('Kapat', 'Close') : L('Değiştir', 'Change')}</button></div>
      ${beltsOpen ? `<div class="belts">${BELT_LIST.map((b) => `<button class="${b.id === pk.belt ? 'active' : ''}" data-act="${k}belt" data-spec="${spec.id}" data-v="${b.id}" title="${esc(b.desc)}">${esc(b.name)}</button>`).join('')}</div>
      <p class="muted small">${esc(BELTS[pk.belt].desc)}</p>` : ''}` : '';
    const hero = `<div class="lhero"><div class="lhero-img">${kartImg(spec.id)}</div><div class="lhero-t"><b>${pk.count} × ${esc(spec.abbr)}</b>
      <small>${ROLE_NAMES[spec.role]} · ${esc(spec.name)}</small><span>${esc(pk.custom ? L('Serbest yük', 'Custom load') : lo.name)}</span></div></div>`;
    return `${hero}${modeTabs}<div class="lcards">${list}</div>${belts}`;
  }

  // ------------------------------------------------------------------ devriye haritası

  /** Haritanın görünümü: seçilmişse o, yoksa bölgenin (ya da üssün) çevresinde ~60 km. */
  private viewOf(): View {
    const st = this.st!;
    if (!st.view) {
      const c = st.plan.targetPos ?? st.base.s.pos;
      st.view = this.clampView({ z: MAP_SIZE / 60000, cx: c.x, cz: c.z });
    }
    return st.view;
  }

  /** Yakınlık sınırda, görünüm harita içinde kalır. */
  private clampView(v: View): View {
    const z = Math.max(ZOOM[0], Math.min(ZOOM[1], v.z));
    const ext = MAP_SIZE / 2 - MAP_SIZE / (2 * z);
    return { z, cx: Math.max(-ext, Math.min(ext, v.cx)), cz: Math.max(-ext, Math.min(ext, v.cz)) };
  }

  /** Resmin dönüşümü: dünya noktası (cx, cz) ortada, yakınlık z (köşe 0,0; ötelemeler kutunun yüzdesi). */
  private mapTransform(v: View): string {
    const l = 0.5 - v.z * (v.cx / MAP_SIZE + 0.5);
    const t = 0.5 - v.z * (v.cz / MAP_SIZE + 0.5);
    return `translate(${(l * 100).toFixed(3)}%, ${(t * 100).toFixed(3)}%) scale(${v.z.toFixed(4)})`;
  }

  /**
   * Haritanın üstündeki işaretler (görünüme göre; yakınlaşınca büyümez): kendi üsler (seçili üs halkalı), bilinen düşman yapıları,
   * üsten bölgeye kesik çizgi, devriye çemberi ve merkezi. `big`: pencerede, küçük yapılar da.
   */
  private mapMarks(v: View, big: boolean): string {
    const st = this.st!;
    const g = this.game;
    const w = g.world;
    const S = 1000;
    const sx = (x: number) => (((x - v.cx) * v.z) / MAP_SIZE + 0.5) * S;
    const sz = (z: number) => (((z - v.cz) * v.z) / MAP_SIZE + 0.5) * S;
    const f = (n: number) => n.toFixed(1);
    const marks: string[] = [];
    const structMode = targetKind(st.type) === 'structure';
    for (const s of w.structures) {
      if (s.destroyed || s.build < 1) continue;
      const own = s.team === g.playerTeam;
      if (!own && (structMode || w.teams[s.team]?.eliminated)) continue;
      const x = sx(s.pos.x);
      const y = sz(s.pos.z);
      if (x < -40 || y < -40 || x > S + 40 || y > S + 40) continue;
      if (s.kind === 'airbase') {
        marks.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${big ? 11 : 26}" class="${own ? 'own' : 'foe'}"/>`);
        if (s === st.base.s) marks.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${big ? 22 : 48}" class="home"/>`);
      } else if (big) marks.push(`<circle cx="${f(x)}" cy="${f(y)}" r="5" class="${own ? 'own' : 'foe'} dim"/>`);
    }
    const tp = st.plan.targetPos;
    if (tp) {
      const b = st.base.s.pos;
      const r = Math.max(6, ((st.plan.patrolRadius * v.z) / MAP_SIZE) * S);
      marks.push(`<line x1="${f(sx(b.x))}" y1="${f(sz(b.z))}" x2="${f(sx(tp.x))}" y2="${f(sz(tp.z))}" class="leg"/>
        <circle cx="${f(sx(tp.x))}" cy="${f(sz(tp.z))}" r="${f(r)}" class="area"/><circle cx="${f(sx(tp.x))}" cy="${f(sz(tp.z))}" r="${big ? 5 : 12}" class="ctr"/>`);
    }
    // Bombardıman ve taarruzda düşman yapıları: önemli yapılar adlı kırmızı kare (uçaksavar baklava ve soluk menzil halkası), evler nokta;
    // seçili yapı halkalı, üsten ona kesik çizgi
    if (structMode) {
      const list = this.structTargets();
      const selId = st.plan.targetStructureId;
      const sel = list.find((t) => t.id === selId);
      const k = big ? 1.7 : 2.4;
      if (sel) {
        // Yaklaşma: üs → (kırılma noktası) → hedef; son parçada hedefe yakın ok. Düzenlerken çizgi kalın, kırılmada tutamak.
        // Simin rotasıyla aynı kavis (filletPath); koyu çizgi açık kenarlıkla: kanyonun kızıl zemininde de seçilsin
        const wp = st.plan.waypoints[0];
        const pts = filletPath([st.base.s.pos, ...(wp ? [wp] : []), sel]).map((q) => `${f(sx(q.x))},${f(sz(q.z))}`).join(' ');
        marks.push(`<polyline points="${pts}" class="appr-halo ${st.bendEdit ? 'edit' : ''}"/><polyline points="${pts}" class="appr-line ${st.bendEdit ? 'edit' : ''}"/>`);
        const from = wp ?? st.base.s.pos;
        const ax = sx(sel.x), ay = sz(sel.z), fx = sx(from.x), fy = sz(from.z);
        const len = Math.hypot(ax - fx, ay - fy);
        if (big && len > 60) {
          const ux = (ax - fx) / len, uy = (ay - fy) / len;
          const tx = ax - ux * 34 * k / 1.7, ty = ay - uy * 34 * k / 1.7;
          marks.push(`<path d="M ${f(tx)} ${f(ty)} L ${f(tx - ux * 22 - uy * 11)} ${f(ty - uy * 22 + ux * 11)} L ${f(tx - ux * 22 + uy * 11)} ${f(ty - uy * 22 - ux * 11)} Z" class="appr"/>`);
        }
        if (big && st.bendEdit) {
          const h = wp ?? this.bendDefault(sel);
          marks.push(`<circle cx="${f(sx(h.x))}" cy="${f(sz(h.z))}" r="22" class="bend"/><circle cx="${f(sx(h.x))}" cy="${f(sz(h.z))}" r="7" class="bend-c"/>`);
        }
      }
      if (big) for (const t of list) if (t.kind === 'aa') marks.push(`<circle cx="${f(sx(t.x))}" cy="${f(sz(t.z))}" r="${f(((4000 * v.z) / MAP_SIZE) * S)}" class="aa-rng"/>`);
      for (const t of [...list].reverse()) {
        const x = sx(t.x);
        const y = sz(t.z);
        if (x < -20 || y < -20 || x > S + 20 || y > S + 20) continue;
        const on = t === sel;
        if (!t.major) {
          marks.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f((on ? 7 : 4) * k)}" class="tgt minor ${on ? 'on' : ''}"/>`);
        } else if (t.kind === 'aa') {
          const r = 11 * k;
          marks.push(`<path d="M ${f(x)} ${f(y - r)} L ${f(x + r)} ${f(y)} L ${f(x)} ${f(y + r)} L ${f(x - r)} ${f(y)} Z" class="tgt aa ${on ? 'on' : ''}"/>`);
        } else {
          const r = (t.kind === 'airbase' || t.kind === 'factory' ? 10 : 8) * k;
          marks.push(`<rect x="${f(x - r)}" y="${f(y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" rx="${f(r * 0.3)}" class="tgt ${on ? 'on' : ''}"/>`);
        }
        if (on) marks.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(22 * k)}" class="ctc-sel"/>`);
      }
      // Adlar: seçili önce, sonra önemli yapılar türe göre; başka bir adın üstüne binen ad yazılmaz (üs çevresinde yapılar sık)
      if (big) {
        const PRI: Partial<Record<StructureKind, number>> = { airbase: 0, factory: 1, aa: 2, radar: 3, mine: 4, townhall: 5, firestation: 6 };
        const cand = list.filter((t) => t.major || t === sel).map((t) => ({ t, x: sx(t.x), y: sz(t.z) }))
          .filter((c) => c.x > -20 && c.y > -20 && c.x < S + 20 && c.y < S + 20)
          .sort((a, b) => (a.t === sel ? -1 : b.t === sel ? 1 : (PRI[a.t.kind] ?? 9) - (PRI[b.t.kind] ?? 9) || a.t.d - b.t.d));
        const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
        for (const { t, x, y } of cand) {
          const on = t === sel;
          const txt = on ? t.name : KIND_SHORT[t.kind] ?? t.name;
          const w = txt.length * 19;
          const right = x <= 650;
          const bx = { x0: right ? x + 20 : x - 22 - w, x1: right ? x + 22 + w : x - 20, y0: y - 18, y1: y + 18 };
          if (boxes.some((o) => bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0)) continue;
          boxes.push(bx);
          marks.push(`<text x="${f(right ? x + 22 : x - 22)}" y="${f(y + 10)}" text-anchor="${right ? 'start' : 'end'}" class="ctc-t ${on ? 'on' : ''}">${esc(txt)}</text>`);
        }
      }
    }
    // Önlemede bilinen düşman temasları: kırmızı üçgen ve uçak sayısı; seçili temas halkalı, üsten ona kesik çizgi
    if (st.type === 'intercept') {
      const list = this.enemyContacts();
      const sel = this.selContact(list);
      if (sel) marks.push(`<line x1="${f(sx(st.base.s.pos.x))}" y1="${f(sz(st.base.s.pos.z))}" x2="${f(sx(sel.x))}" y2="${f(sz(sel.z))}" class="leg"/>`);
      for (const c of list) {
        const x = sx(c.x);
        const y = sz(c.z);
        if (x < -20 || y < -20 || x > S + 20 || y > S + 20) continue;
        const k = big ? 1.7 : 2.4;
        const on = c === sel;
        marks.push(`<path d="M ${f(x)} ${f(y - 13 * k)} L ${f(x + 11 * k)} ${f(y + 8 * k)} L ${f(x - 11 * k)} ${f(y + 8 * k)} Z" class="ctc ${on ? 'on' : ''}"/>`);
        if (on) marks.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(24 * k)}" class="ctc-sel"/>`);
        if (big) marks.push(`<text x="${f(x > 650 ? x - 24 : x + 24)}" y="${f(y + 10)}" text-anchor="${x > 650 ? 'end' : 'start'}" class="ctc-t ${on ? 'on' : ''}">${c.n > 1 ? `${c.n}×` : ''}${esc(c.abbr)}</text>`);
      }
    }
    return marks.join('');
  }

  /**
   * Devriye bölgesinin haritası (`big`: pencerede `.pl-map`, kaydırılır ve yakınlaşır, dokununca merkez). Resim oyunun arazi
   * ızgarasından gölgeli (`terrainImage`); küçük düğmede o daha üretilmediyse ana menünün önizlemesi.
   */
  private areaMap(big: boolean): string {
    const v = this.viewOf();
    const desert = mapById(terrainMap.id).biome === 'desert';
    const img = big ? terrainImage(desert) : terrainImageCached() ?? mapPreview(mapById(terrainMap.id), 160);
    const zoom = big ? `<div class="pl-zoom">
        <button data-act="zin" title="${L('Yakınlaştır', 'Zoom in')}">+</button>
        <button data-act="zout" title="${L('Uzaklaştır', 'Zoom out')}">−</button>
        <button data-act="zhome" title="${L('Üsse dön', 'Back to base')}">⌂</button></div>` : '';
    return `<div class="${big ? 'pl-map' : 'pl-thumb'}"><div class="pl-mapin" style="transform:${this.mapTransform(v)}"><img src="${img}" alt="" draggable="false"></div>
      <svg viewBox="0 0 1000 1000">${this.mapMarks(v, big)}</svg>${zoom}</div>`;
  }

  /** Görünümü yeniden çizmeden uygula (kaydırırken her harekette). */
  private applyView(): void {
    const m = this.el.querySelector<HTMLElement>('.pl-map');
    if (!m || !this.st) return;
    const v = this.viewOf();
    const inner = m.querySelector<HTMLElement>('.pl-mapin');
    if (inner) inner.style.transform = this.mapTransform(v);
    const svg = m.querySelector('svg');
    if (svg) svg.innerHTML = this.mapMarks(v, true);
  }

  /** Ekran noktasının dünya konumu (haritanın kutusuna göre). */
  private mapWorld(m: HTMLElement, px: number, py: number): { x: number; z: number } {
    const r = m.getBoundingClientRect();
    const v = this.viewOf();
    return { x: v.cx + ((px - r.left) / r.width - 0.5) * (MAP_SIZE / v.z), z: v.cz + ((py - r.top) / r.height - 0.5) * (MAP_SIZE / v.z) };
  }

  /** Yakınlığı değiştir; (px, py) ekran noktasının altındaki yer sabit kalır (yoksa orta). */
  private zoomAt(m: HTMLElement, z: number, px?: number, py?: number): void {
    const st = this.st!;
    const v = this.viewOf();
    const r = m.getBoundingClientRect();
    const u = px === undefined ? 0 : (px - r.left) / r.width - 0.5;
    const t = py === undefined ? 0 : (py - r.top) / r.height - 0.5;
    const wx = v.cx + (u * MAP_SIZE) / v.z;
    const wz = v.cz + (t * MAP_SIZE) / v.z;
    const nz = Math.max(ZOOM[0], Math.min(ZOOM[1], z));
    st.view = this.clampView({ z: nz, cx: wx - (u * MAP_SIZE) / nz, cz: wz - (t * MAP_SIZE) / nz });
    this.applyView();
  }

  /** Haritadaki parmaklar: tek parmak kaydırır, iki parmak yakınlaştırır; kımıldamadan bırakılan dokunuş merkezi seçer. */
  private gest: {
    pts: Map<number, { x: number; y: number }>;
    sx: number; sy: number; t0: number; moved: boolean; v0: View;
    pinch: { d: number; z: number } | null;
  } | null = null;

  /** Yaklaşma tutamağını sürükleyen parmak. */
  private bendDrag: number | null = null;

  /** Ekran noktası (px) ile dünya noktası arası uzaklık (harita kutusunda). */
  private pxDist(m: HTMLElement, x: number, z: number, px: number, py: number): number {
    const r = m.getBoundingClientRect();
    const v = this.viewOf();
    return Math.hypot(r.left + (((x - v.cx) * v.z) / MAP_SIZE + 0.5) * r.width - px, r.top + (((z - v.cz) * v.z) / MAP_SIZE + 0.5) * r.height - py);
  }

  /**
   * Yaklaşma (2026-11-26, kullanıcı tasarımı): bombardıman ve taarruzda üsten hedefe çizgiye dokununca ortasında tutamak çıkar, sürüklenince
   * yol kırılır; kırılma noktası planın tek ara noktası (sim kolun yaklaşma yönünü son ara noktadan hedefe alır). Hedefe en az giriş
   * noktası (IP) uzaklığı + 4 km: daha yakındaki kırılma kolu geri döndürürdü.
   */
  private bendMin(): number {
    const t = this.st!.type;
    return (t === 'levelBomb' ? 20000 : t === 'attack' ? 12000 : 9000) + 4000;
  }

  private bendDefault(sel: { x: number; z: number }): Vector3 {
    const b = this.st!.base.s.pos;
    return this.bendClamp(new Vector3((b.x + sel.x) / 2, 0, (b.z + sel.z) / 2), sel);
  }

  private bendClamp(p: Vector3, sel: { x: number; z: number }): Vector3 {
    const lim = MAP_SIZE * 0.47;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));
    const dx = p.x - sel.x, dz = p.z - sel.z;
    const d = Math.hypot(dx, dz);
    const min = this.bendMin();
    if (d < min) {
      const ux = d > 1 ? dx / d : 1, uz = d > 1 ? dz / d : 0;
      p.x = sel.x + ux * min;
      p.z = sel.z + uz * min;
    }
    return p;
  }

  /** Yaklaşmanın geldiği yön (hedeften kırılma noktasına ya da üsse bakış; pusula). */
  private apprDir(): string {
    const st = this.st!;
    const sel = st.plan.targetStructureId !== null ? this.game.world.structureById(st.plan.targetStructureId) : undefined;
    if (!sel) return '';
    const from = st.plan.waypoints[0] ?? st.base.s.pos;
    const deg = ((Math.atan2(from.x - sel.pos.x, -(from.z - sel.pos.z)) * 180) / Math.PI + 360) % 360;
    const TR = ['kuzeyden', 'kuzeydoğudan', 'doğudan', 'güneydoğudan', 'güneyden', 'güneybatıdan', 'batıdan', 'kuzeybatıdan'];
    const EN = ['the north', 'the north-east', 'the east', 'the south-east', 'the south', 'the south-west', 'the west', 'the north-west'];
    const i = Math.round(deg / 45) % 8;
    return L(TR[i], `from ${EN[i]}`);
  }

  private mapDown(e: PointerEvent): void {
    const m = (e.target as HTMLElement).closest<HTMLElement>('.pl-map');
    if (!m || !this.st || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    m.setPointerCapture?.(e.pointerId);
    // Düzenlemede tutamağa basılırsa onu sürükle (harita kaymaz)
    const st = this.st;
    if (st.bendEdit && !this.gest && targetKind(st.type) === 'structure') {
      const sel = st.plan.targetStructureId !== null ? this.game.world.structureById(st.plan.targetStructureId) : undefined;
      if (sel) {
        const h = st.plan.waypoints[0] ?? this.bendDefault(sel.pos);
        if (this.pxDist(m, h.x, h.z, e.clientX, e.clientY) < 30) {
          this.bendDrag = e.pointerId;
          return;
        }
      }
    }
    if (!this.gest) this.gest = { pts: new Map(), sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false, v0: { ...this.viewOf() }, pinch: null };
    const g = this.gest;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pts.size === 2) {
      const [a, b] = [...g.pts.values()];
      g.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: this.viewOf().z };
      g.moved = true;
    }
  }

  private mapMove(e: PointerEvent): void {
    if (this.bendDrag === e.pointerId && this.st) {
      const m = this.el.querySelector<HTMLElement>('.pl-map');
      const sel = this.st.plan.targetStructureId !== null ? this.game.world.structureById(this.st.plan.targetStructureId) : undefined;
      if (!m || !sel) return;
      const p = this.mapWorld(m, e.clientX, e.clientY);
      this.st.plan.waypoints = [this.bendClamp(new Vector3(p.x, 0, p.z), sel.pos)];
      this.applyView();
      return;
    }
    const g = this.gest;
    if (!g || !g.pts.has(e.pointerId) || !this.st) return;
    const m = this.el.querySelector<HTMLElement>('.pl-map');
    if (!m) return;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pinch && g.pts.size >= 2) {
      const [a, b] = [...g.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoomAt(m, g.pinch.z * (d / g.pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < 7) return;
    g.moved = true;
    const r = m.getBoundingClientRect();
    const v = this.viewOf();
    this.st.view = this.clampView({ z: v.z, cx: g.v0.cx - (dx / r.width) * (MAP_SIZE / v.z), cz: g.v0.cz - (dy / r.height) * (MAP_SIZE / v.z) });
    this.applyView();
  }

  private mapUp(e: PointerEvent, ok: boolean): void {
    if (this.bendDrag === e.pointerId) {
      this.bendDrag = null;
      this.refreshSuggestions();
      this.renderKeepScroll();
      return;
    }
    const g = this.gest;
    if (!g || !g.pts.has(e.pointerId)) return;
    g.pts.delete(e.pointerId);
    if (g.pts.size > 0) {
      // Bir parmak kalktı: kalan parmakla kaydırma yeniden başlar
      const [p] = [...g.pts.values()];
      g.sx = p.x;
      g.sy = p.y;
      g.v0 = { ...this.viewOf() };
      g.pinch = null;
      return;
    }
    this.gest = null;
    const m = this.el.querySelector<HTMLElement>('.pl-map');
    if (!ok || g.moved || !m || !this.st || performance.now() - g.t0 > 700) return;
    // Bombardıman ve taarruzda yapıya dokunuş (32 px içinde; önemli yapılar öncelikli) onu seçer
    if (targetKind(this.st.type) === 'structure') {
      const r = m.getBoundingClientRect();
      const v = this.viewOf();
      const hit = this.structTargets()
        .map((t) => ({ t, d: Math.hypot(r.left + (((t.x - v.cx) * v.z) / MAP_SIZE + 0.5) * r.width - e.clientX, r.top + (((t.z - v.cz) * v.z) / MAP_SIZE + 0.5) * r.height - e.clientY) - (t.major ? 10 : 0) }))
        .sort((a, b) => a.d - b.d)[0];
      const st = this.st;
      const sel = st.plan.targetStructureId !== null ? this.game.world.structureById(st.plan.targetStructureId) : undefined;
      // Çizgiye dokunuş (seçili hedefin kendisi değilse): düzenleme açılır, kırılma yoksa ortaya konur
      if (sel && !(hit && hit.d < 32 && hit.t.id !== sel.id)) {
        const pts = [st.base.s.pos, ...st.plan.waypoints, sel.pos];
        const r = m.getBoundingClientRect();
        const v = this.viewOf();
        const P = (q: { x: number; z: number }) => ({ x: r.left + (((q.x - v.cx) * v.z) / MAP_SIZE + 0.5) * r.width, y: r.top + (((q.z - v.cz) * v.z) / MAP_SIZE + 0.5) * r.height });
        let best = Infinity;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = P(pts[i]), b = P(pts[i + 1]);
          const lx = b.x - a.x, ly = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((e.clientX - a.x) * lx + (e.clientY - a.y) * ly) / (lx * lx + ly * ly || 1)));
          best = Math.min(best, Math.hypot(a.x + lx * t - e.clientX, a.y + ly * t - e.clientY));
        }
        if (best < 22 && this.pxDist(m, sel.pos.x, sel.pos.z, e.clientX, e.clientY) > 26) {
          st.bendEdit = true;
          // Tutamak dokunulan yerde (hedefe en az giriş noktası payı kadar uzak)
          if (!st.plan.waypoints.length) {
            const q = this.mapWorld(m, e.clientX, e.clientY);
            st.plan.waypoints = [this.bendClamp(new Vector3(q.x, 0, q.z), sel.pos)];
          }
          this.renderKeepScroll();
          return;
        }
      }
      if (hit && hit.d < 32) {
        this.pickStruct(hit.t.id);
        this.renderKeepScroll();
      } else if (st.bendEdit) {
        st.bendEdit = false;
        this.renderKeepScroll();
      }
      return;
    }
    // Önlemede temasa dokunuş (32 px içinde) onu seçer; boş yere dokunuş bir şey yapmaz
    if (this.st.type === 'intercept') {
      const r = m.getBoundingClientRect();
      const v = this.viewOf();
      const hit = this.enemyContacts()
        .map((c) => ({ c, d: Math.hypot(r.left + (((c.x - v.cx) * v.z) / MAP_SIZE + 0.5) * r.width - e.clientX, r.top + (((c.z - v.cz) * v.z) / MAP_SIZE + 0.5) * r.height - e.clientY) }))
        .sort((a, b) => a.d - b.d)[0];
      if (hit && hit.d < 32) {
        this.pickContact(hit.c.id);
        this.renderKeepScroll();
      }
      return;
    }
    // Dokunuş: devriyenin merkezi (haritanın kenarından biraz içeride)
    const p = this.mapWorld(m, e.clientX, e.clientY);
    const lim = MAP_SIZE * 0.47;
    const first = !this.st.plan.targetPos;
    this.st.plan.targetPos = new Vector3(Math.max(-lim, Math.min(lim, p.x)), 0, Math.max(-lim, Math.min(lim, p.z)));
    this.refreshSuggestions();
    if (first) this.autoAltitude();
    this.renderKeepScroll();
  }

  private mapWheel(e: WheelEvent): void {
    const m = (e.target as HTMLElement).closest<HTMLElement>('.pl-map');
    if (!m || !this.st) return;
    e.preventDefault();
    this.zoomAt(m, this.viewOf().z * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }

  /** Devriye bölgesi penceresi: harita (dokununca merkez) ve çap; altta tur süresi ve gereken yakıt. */
  private areaPop(): string {
    const st = this.st!;
    const p = st.plan;
    const dia = Math.round((p.patrolRadius * 2) / 1000);
    const tp = p.targetPos;
    if (targetKind(st.type) === 'structure') {
      // Bombardıman ve taarruz: haritada ya da listede düşman yapısı; yakınındaki uçaksavar sayısı
      const list = this.structTargets();
      const tgt = list.find((t) => t.id === p.targetStructureId);
      const aaTxt = (n: number) => (n ? L(`${n} uçaksavar`, `${n} flak`) : L('uçaksavar yok', 'no flak'));
      const majors = list.filter((t) => t.major).slice(0, 24);
      const rows = majors.length
        ? `<div class="sw-list">${majors.map((t) => `<button class="sw-row ${t === tgt ? 'active' : ''}" data-act="tgs" data-v="${t.id}">
            <span class="tg-ico ${t.kind === 'aa' ? 'aa' : ''}"></span><span class="sw-t"><b>${esc(t.name)}</b>
            <small>${esc(STRUCTURE_DEFS[t.kind].name)} · ${(t.d / 1000).toFixed(0)} km · <span class="${t.aa ? 'bad' : ''}">${aaTxt(t.aa)}</span></small></span></button>`).join('')}</div>`
        : `<p class="muted small">${L('Bilinen düşman yapısı yok.', 'No known enemy structures.')}</p>`;
      return `<div class="pl-areapop">${this.areaMap(true)}<div class="pl-areactl">
        <p class="muted small">${L('Haritada kırmızı kareye (düşman yapısı) ya da listeden bir yapıya dokun. Baklavalar uçaksavar, soluk halkaları menzili.', 'Tap a red square on the map (an enemy structure) or one in the list. Diamonds are flak, the faint rings their reach.')}</p>
        ${tgt ? `<div class="kv"><span>${L('Hedef', 'Target')}</span><span>${esc(tgt.name)}</span>
          <span>${L('Üsten uzaklık', 'From base')}</span><span>${(tgt.d / 1000).toFixed(0)} km</span>
          <span>${L('5 km içinde', 'Within 5 km')}</span><span class="${tgt.aa ? 'bad' : ''}">${aaTxt(tgt.aa)}</span>
          <span>${L('Yaklaşma', 'Approach')}</span><span>${esc(this.apprDir())}</span></div>
          <p class="muted small">${st.bendEdit
            ? L('Yuvarlak tutamağı sürükle: kol hedefe o yönden girer. Uçaksavar halkalarının dışından dolaştırabilirsin.', 'Drag the round handle: the flight runs in from that side. You can take it around the flak rings.')
            : L('Yaklaşma yönünü değiştirmek için üsten hedefe giden çizgiye dokun.', 'To change the approach, tap the line from the base to the target.')}
          ${p.waypoints.length ? ` <button class="mini" data-act="bendreset">${L('Düz yola dön', 'Straight route')}</button>` : ''}</p>` : ''}
        <div class="sub">${L('Düşman yapıları', 'Enemy structures')}</div>${rows}
        <button class="mini sw-game" data-act="swgame">${L('Oyun haritasından seç', 'Pick on the game map')}</button>
      </div></div>`;
    }
    if (st.type === 'intercept') {
      // Önleme: radarın gördüğü düşmana (kırmızı üçgen) dokun; liste de aynı temaslar (telefonda dokunması kolay)
      const list = this.enemyContacts();
      const tgt = this.selContact(list);
      const rows = list.length
        ? `<div class="sw-list">${list.map((c) => `<button class="sw-row ${c === tgt ? 'active' : ''}" data-act="swc" data-v="${c.id}">
            <span class="sw-tri"></span><span class="sw-t"><b>${esc(c.name)} · ${c.n} × ${esc(c.abbr)}</b>
            <small>${(c.d / 1000).toFixed(0)} km · ${c.alt !== null ? `${nf.format(c.alt)} m` : L('irtifa bilinmiyor', 'altitude unknown')} · ${esc(c.src)}</small></span></button>`).join('')}</div>`
        : `<p class="muted small">${L('Radar ve gözcüler şu an düşman uçağı görmüyor.', 'Radar and observers see no enemy aircraft right now.')}</p>`;
      return `<div class="pl-areapop">${this.areaMap(true)}<div class="pl-areactl">
        <p class="muted small">${L('Haritada kırmızı üçgene (radarın gördüğü düşman) ya da listeden bir kola dokun.', 'Tap a red triangle on the map (an enemy seen by radar) or a flight in the list.')}</p>
        ${tgt ? `<div class="kv"><span>${L('Hedef', 'Target')}</span><span>${esc(`${tgt.name} · ${tgt.n} × ${tgt.abbr}`)}</span>
          <span>${L('Üsten uzaklık', 'From base')}</span><span>${(tgt.d / 1000).toFixed(0)} km</span></div>
          <p class="muted small">${this.trackInfo()}</p>` : ''}
        <div class="sub">${L('Radarın gördüğü düşmanlar', 'Enemies seen by radar')}</div>${rows}
        <button class="mini sw-game" data-act="swgame">${L('Oyun haritasından seç', 'Pick on the game map')}</button>
      </div></div>`;
    }
    const fuel = this.capFuel();
    const info = tp
      ? `<div class="kv">
          <span>${L('Üsten uzaklık', 'From base')}</span><span>${(Math.hypot(tp.x - st.base.s.pos.x, tp.z - st.base.s.pos.z) / 1000).toFixed(0)} km</span>
          <span>${L('Bir tur', 'One lap')}</span><span>~${fmtDur(this.lapTime())}</span>
          <span>${L('Gereken yakıt', 'Fuel needed')}</span><span class="${fuel.over.length ? 'bad' : ''}">${P(Math.round(fuel.min * 100))}</span>
        </div>${fuel.over.length ? `<p class="warnbox bad">${L('Depo yetmiyor: çapı ya da tur sayısını azalt, ya da üsse daha yakın bir yer seç.', 'The tanks are not enough: reduce the diameter or the laps, or pick a spot closer to the base.')}</p>` : ''}`
      : `<p class="muted small">${L('Haritada devriye bölgesinin merkezine dokun.', 'Tap the map at the centre of the patrol area.')}</p>`;
    return `<div class="pl-areapop">${this.areaMap(true)}<div class="pl-areactl">
      <div class="form-row"><span>${L('Çap', 'Diameter')}</span><input type="range" min="${CAP_DIA[0]}" max="${CAP_DIA[1]}" step="1" value="${dia}" data-act="capdia"><b>${dia} km</b></div>
      ${info}
    </div></div>`;
  }

  /**
   * Uçak ekleme penceresi: üsteki kalkmaya hazır bütün tipler; bu göreve uygun olanlar önce ve sayısı seçilir, uygun olmayanlar
   * soluk ve nedeniyle. Sayı hazır uçak ve boştaki personelle sınırlı.
   */
  private pickPop(sel: Record<string, number>, escort = false): string {
    const st = this.st!;
    // Eskortta yalnız avcılar (kuvvette kullanılanlar düşülür); uygun olmayanlar listelenmez
    const ok = escort
      ? this.eligible('escort').map((e) => ({ spec: e.spec, ready: this.escortAvail(e.spec.id) })).filter((e) => e.ready > 0)
      : this.eligible(st.type);
    const okIds = new Set(ok.map((e) => e.spec.id));
    const others = escort ? [] : [...new Set(st.base.inventory.filter((a) => a.status === 'ready' && SPECS[a.specId].playable).map((a) => a.specId))]
      .filter((id) => !okIds.has(id)).map((id) => SPECS[id]);
    // Kart: büyük resim (ansiklopedinin kart görseli, `kartImg`), ad, rol, hazır sayısı, + / −; seçilen vurgulu
    const card = (spec: AircraftSpec, ready: number, usable: boolean) => {
      const n = sel[spec.id] ?? 0;
      const max = usable ? this.pickerMax(spec.id, sel, escort) : 0;
      return `<div class="pk-card ${usable ? (n ? 'on' : '') : 'na'}">
        <div class="pk-img">${kartImg(spec.id)}${n ? `<span class="pk-n">×${n}</span>` : ''}</div>
        <div class="pk-t"><b>${esc(spec.abbr)}</b><small>${ROLE_NAMES[spec.role]} · ${ready} ${L('hazır', 'ready')}</small>
          ${usable ? (max < ready ? `<small class="bad">${L(`personelle en çok ${max}`, `${max} at most with crews`)}</small>` : '') : `<small>${L('bu görevde kullanılmaz', 'not used on this mission')}</small>`}</div>
        ${usable ? `<div class="stepper"><button data-act="pkcnt" data-spec="${spec.id}" data-v="-1" ${n <= 0 ? 'disabled' : ''}>−</button><b>${n}</b><button data-act="pkcnt" data-spec="${spec.id}" data-v="1" ${n >= max ? 'disabled' : ''}>+</button></div>` : ''}
      </div>`;
    };
    if (escort && !ok.length) return `<p class="muted">${L('Üste eskorta ayrılabilecek hazır avcı yok.', 'No fighters at this base are free for escort.')}</p>`;
    if (!ok.length && !others.length) return `<p class="muted">${L('Üste kalkmaya hazır uçak yok.', 'No aircraft at this base are ready to take off.')}</p>`;
    return `${ok.length ? `<div class="pl-pklist">${ok.map((e) => card(e.spec, e.ready, true)).join('')}</div>` : `<p class="muted small">${L('Bu görev için hazır uçak yok.', 'No aircraft ready for this mission.')}</p>`}
      ${others.length ? `<div class="sub">${L('Bu görevde kullanılmayanlar', 'Not used on this mission')}</div><div class="pl-pklist na">${others.map((s) => card(s, this.readyOf(s.id), false)).join('')}</div>` : ''}`;
  }

  /**
   * Görev geçmişi (2026-11-26, oyuncu isteği): bu takımın önceki görevleri, yeniden yapılabiliyor mu (bu üste yeterli hazır uçak ve
   * personel var mı) ve hedef hâlâ duruyor mu. Eksik uçaklı görev seçilemez; hedefi kalmamış görev seçilir ama hedef boş gelir.
   */
  private histCheck(e: HistoryEntry): { ok: boolean; why: string; gone: boolean } {
    const st = this.st!;
    const w = this.game.world;
    const need = new Map<string, number>();
    for (const p of [...e.force, ...e.escort]) need.set(p.specId, (need.get(p.specId) ?? 0) + p.count);
    const miss: string[] = [];
    for (const [id, n] of need) {
      const r = this.readyOf(id);
      if (r < n) miss.push(`${n - r} × ${SPECS[id]?.abbr ?? id}`);
    }
    let why = miss.length ? L(`Eksik uçak: ${miss.join(', ')}`, `Missing aircraft: ${miss.join(', ')}`) : '';
    const crewNeed = [...e.force, ...e.escort].reduce((a, p) => a + p.count * (SPECS[p.specId]?.crew ?? 1), 0);
    const free = w.crewFree(st.base.s.team);
    if (!why && Number.isFinite(free) && crewNeed > free) why = L(`Personel yetmiyor: ${crewNeed} kişi gerekli, ${free} boşta`, `Not enough crew: ${crewNeed} needed, ${free} free`);
    const p = e.plan;
    const gone = p.targetStructureId !== null ? !w.structureById(p.targetStructureId) || !!w.structureById(p.targetStructureId)?.destroyed
      : p.targetAircraftId !== null ? !w.aircraftById(p.targetAircraftId)?.airborne
      : p.targetBaseId !== null ? !w.structureById(p.targetBaseId)?.airbase?.s.active
      : p.targetFlightId !== null ? !w.flightById(p.targetFlightId) : false;
    return { ok: !why, why, gone };
  }

  private histPop(): string {
    const st = this.st!;
    const w = this.game.world;
    const list = w.missionHistory.filter((e) => e.team === st.base.s.team).slice().reverse();
    if (!list.length) return `<p class="muted">${L('Henüz görev geçmişi yok. Planladığın görevler burada listelenir; birine dokununca ayarları plana uygulanır.', 'No mission history yet. Missions you plan are listed here; tap one to apply its settings to the plan.')}</p>`;
    const rows = list.map((e) => {
      const c = this.histCheck(e);
      const reps = w.missionReports.filter((r) => r.team === e.team && e.flights.includes(r.flight));
      const res = reps.length ? reps.map((r) => (r.outcome === 'success' ? '<b class="pos">✓</b>' : r.outcome === 'fail' ? '<b class="bad">✗</b>' : '–')).join(' ') : `<span class="muted">${L('sürüyor', 'in progress')}</span>`;
      const acs = [...e.force.map((p) => `${p.count} × ${SPECS[p.specId]?.abbr ?? p.specId}`), ...e.escort.map((p) => `${p.count} × ${SPECS[p.specId]?.abbr ?? p.specId} ${L('eskort', 'escort')}`)].join(', ');
      const base = e.baseId !== st.base.s.id ? ` · ${esc(w.structureById(e.baseId)?.name ?? '')}` : '';
      return `<button class="hs-row" data-act="histgo" data-v="${e.id}" ${c.ok ? '' : 'disabled'}>
        <span class="mi">${MISSION_ICONS[e.plan.type]}</span>
        <span class="hs-t"><b>${MISSION_NAMES[e.plan.type]}${e.targetName ? ` → ${esc(e.targetName)}` : ''}${e.repeat ? ' ↻' : ''}</b>
          <small>${esc(acs)}${base} · ${fmtStamp(e)} · ${res}</small>
          ${!c.ok ? `<small class="bad">${esc(c.why)}</small>` : c.gone ? `<small class="warn">${L('Hedef artık yok: ayarlar uygulanır, hedefi yeniden seç.', 'The target is gone: the settings are applied, choose a new target.')}</small>` : ''}</span>
      </button>`;
    }).join('');
    return `<p class="muted small">${L('Bir göreve dokun: uçakları, yükleri, yakıtı, hedefi ve yaklaşma yolu plana aynen uygulanır.', 'Tap a mission: its aircraft, loads, fuel, target and approach are applied to the plan as they were.')}</p><div class="hs-list">${rows}</div>`;
  }

  /** Geçmişteki görevi plana uygula (yeterli uçak yoksa uygulanmaz; hedef kalmadıysa hedef boş). */
  private applyHist(id: number): void {
    const st = this.st!;
    const e = this.game.world.missionHistory.find((x) => x.id === id);
    if (!e) return;
    const c = this.histCheck(e);
    if (!c.ok) return;
    this.setType(e.plan.type);
    st.plan = { ...e.plan, targetPos: e.plan.targetPos?.clone() ?? null, waypoints: e.plan.waypoints.map((v) => v.clone()) };
    if (c.gone) {
      st.plan.targetStructureId = null;
      st.plan.targetAircraftId = null;
      st.plan.targetFlightId = null;
      st.plan.targetBaseId = null;
      st.plan.waypoints = [];
    }
    const copy = (p: HistoryEntry['force'][number]): Pick => ({ ...p, custom: p.custom ? p.custom.map((x) => ({ ...x })) : null }) as Pick;
    st.force = e.force.map(copy);
    st.escort = e.escort.map(copy);
    st.laps = e.laps;
    st.repeat = e.repeat;
    st.view = null;
    st.bendEdit = false;
    st.pop = null;
  }

  /** Açık pencere. Haritadan seçerken gizlenir. */
  private popHtml(): string {
    const st = this.st!;
    const pop = st.pop;
    if (!pop || this.game.interaction.mode !== 'none') return '';
    let title = '';
    let body = '';
    let foot = '';
    if (pop.kind === 'load') {
      const pk = (pop.escort ? st.escort : st.force).find((x) => x.specId === pop.spec);
      if (!pk || pk.count <= 0) return '';
      title = `${pk.count} × ${esc(SPECS[pk.specId].abbr)} · ${pop.escort ? L('eskort yükü', 'escort load') : L('yük ve silah', 'load and guns')}`;
      body = this.loadPop(pk, pop.escort, !!pop.belts, pop.hp);
      foot = `<button class="primary" data-act="popclose">${L('Tamam', 'Done')}</button>`;
    } else if (pop.kind === 'area') {
      title = st.type === 'intercept' ? L('Önleme hedefi', 'Intercept target') : targetKind(st.type) === 'structure' ? `${L('Hedef', 'Target')} · ${MISSION_NAMES[st.type]}` : L('Devriye bölgesi', 'Patrol area');
      body = this.areaPop();
      foot = `<button class="primary" data-act="popclose">${L('Tamam', 'Done')}</button>`;
    } else if (pop.kind === 'pick') {
      const n = Object.values(pop.sel).reduce((a, x) => a + x, 0);
      title = pop.escort ? `${L('Eskort ekle', 'Add escort')} · ${MISSION_NAMES[st.type]}` : `${L('Uçak ekle', 'Add aircraft')} · ${MISSION_NAMES[st.type]}`;
      body = this.pickPop(pop.sel, pop.escort);
      foot = `<button data-act="popclose">${L('Vazgeç', 'Cancel')}</button><button class="primary" data-act="pkok">${n ? L(`Ekle · ${n} uçak`, `Add · ${n} aircraft`) : L('Tamam', 'Done')}</button>`;
    } else if (pop.kind === 'hist') {
      title = L('Görev geçmişi', 'Mission history');
      body = this.histPop();
      foot = `<button data-act="popclose">${L('Kapat', 'Close')}</button>`;
    } else if (pop.kind === 'odds') {
      title = `${L('Başarı ayrıntısı', 'Success details')} · ${MISSION_NAMES[st.type]}`;
      body = this.detailHtml();
      foot = `<button data-act="popclose">${L('Kapat', 'Close')}</button>`;
    } else {
      title = L('Uyarılarla kalkılsın mı?', 'Take off despite warnings?');
      body = `${pop.warns.map((w) => `<p class="warnbox">${esc(w)}</p>`).join('')}<p class="muted small">${pop.fuelShort
        ? L('Kol yine de kalkar; yakıtı azalan uçak görevi bırakıp tek başına döner.', 'The flight still takes off; an aircraft running low on fuel leaves the mission and heads home alone.')
        : L('Kol yine de kalkar. Planı düzeltmek için geri dönebilirsin.', 'The flight still takes off. You can go back and fix the plan.')}</p>`;
      foot = `<button data-act="popclose">${L('Planı düzelt', 'Fix the plan')}</button><button class="primary" data-act="launchgo">${L('Yine de kalk', 'Take off anyway')}</button>`;
    }
    return `<div class="pl-pop" data-act="popbg"><div class="pl-card" role="dialog">
      <div class="pl-card-h"><b>${title}</b><button class="icon" data-act="popclose" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
      <div class="pl-card-b">${body}</div>
      <div class="pl-card-f">${foot}</div>
    </div></div>`;
  }

  private render(): void {
    const st = this.st;
    if (!st) return;
    const g = this.game;
    const w = g.world;
    const p = st.plan;
    const f = MISSION_FIELDS[st.type];
    const el = this.eligible(st.type);
    const kind = targetKind(st.type);

    const typeBtns = TYPES.map((t) => {
      const n = this.eligible(t).reduce((a, e) => a + e.ready, 0);
      return `<button class="mcard ${t === st.type ? 'active' : ''}" data-act="type" data-v="${t}" ${n ? '' : 'disabled'}>
        <span class="mi">${MISSION_ICONS[t]}</span><span>${MISSION_NAMES[t]}</span></button>`;
    }).join('');

    // Uçaklar: "Uçak ekle" penceresinden eklenenler (sayısı burada da değişir; sıfıra inen satırdan çıkar)
    // Yakıt uçak satırlarında: önce en azlar ve devriye süresi güncellenir
    if (st.type === 'cap') this.syncCap();
    this.syncFuel();
    const forceRows = st.force.filter((x) => x.count > 0).map((pk) => this.acRow(pk, this.readyOf(pk.specId), false)).join('');
    const addBtn = el.length
      ? `<button class="pl-add" data-act="addac">＋ ${L('Uçak ekle', 'Add aircraft')}</button>`
      : `<p class="muted small">${L('Bu görev için üste hazır uçak yok.', 'No aircraft at this base are ready for this mission.')}</p>`;
    const totalAc = st.force.reduce((a, x) => a + x.count, 0);
    const escAc = st.escort.reduce((a, x) => a + x.count, 0);

    // Hedef
    let targetCtl = '';
    if (kind === 'flight') {
      const opts = w.flights.filter((x) => x.team === g.playerTeam && x.phase !== 'done' && x.phase !== 'landing' && x.plan.type !== 'escort');
      targetCtl = `<select data-act="tflight" class="wide"><option value="">— ${L('korunacak kol', 'flight to escort')} —</option>${opts.map((x) =>
        `<option value="${x.id}" ${x.id === p.targetFlightId ? 'selected' : ''}>${x.name} · ${x.alive.length || x.expected} × ${x.members[0]?.spec.abbr ?? ''} · ${MISSION_NAMES[x.plan.type]}</option>`).join('')}</select>`;
    } else if (kind === 'base') {
      const opts = w.airbasesOf(g.playerTeam).filter((b) => b !== st.base && b.s.active);
      targetCtl = `<select data-act="tbase" class="wide"><option value="">— ${L('hedef üs', 'destination base')} —</option>${opts.map((b) =>
        `<option value="${b.s.id}" ${b.s.id === p.targetBaseId ? 'selected' : ''}>${esc(b.s.name)} (${L(`${b.freeSlots} boş yer`, `${b.freeSlots} free`)})</option>`).join('')}</select>`;
    }
    const tlabel = this.targetLabel();
    // Ara nokta kaldırıldı (2026-11-25, kullanıcı: gereksiz); kol doğrudan hedefe gider
    const route = '';

    // Uçuş: irtifa (alçak uçuşta yerden yükseklik); devriyede tur ve yakıt. Hız, kurallar, dağılım göreve göre kendiliğinden.
    const cap = st.type === 'cap';
    const flight: string[] = [];
    const maxCeil = Math.min(...st.force.map((x) => SPECS[x.specId].ceiling), 13000);
    if (f.lowLevel) flight.push(`<label class="check"><input type="checkbox" data-act="low" ${p.lowLevel ? 'checked' : ''}> ${L('Alçak uçuş: arazi takibi (radar altı)', 'Low level: terrain following (under the radar)')}</label>`);
    if (f.lowLevel && p.lowLevel) {
      flight.push(`<div class="form-row"><span>${L('Yerden', 'Above ground')}</span><input type="range" min="60" max="400" step="10" value="${p.agl}" data-act="agl"><b>${p.agl} m</b></div>`);
    } else if (f.altitude) {
      flight.push(`<div class="form-row"><span>${L('İrtifa', 'Altitude')}</span><input type="range" min="500" max="${Math.max(3000, Math.round((Number.isFinite(maxCeil) ? maxCeil : 9000) - 300))}" step="100" value="${p.altitude}" data-act="alt"><b>${nf.format(p.altitude)} m</b></div>`);
    }
    if (cap) {
      flight.push(`<div class="form-row pl-laps"><span>${L('Tur', 'Laps')}</span>
        <div class="stepper"><button data-act="laps" data-v="-1" ${st.laps <= CAP_LAPS[0] ? 'disabled' : ''}>−</button><b>${st.laps}</b><button data-act="laps" data-v="1" ${st.laps >= CAP_LAPS[1] ? 'disabled' : ''}>+</button></div>
        <small class="muted">${L('bir tur', 'one lap')} ~${fmtDur(this.lapTime())} · ${L('devriye', 'patrol')} ~${fmtDur(this.actionTime())}</small></div>`);
    }
    const autoNote = st.type === 'intercept'
      ? L('İrtifa, hız ve rota otomatik: kol tam güçle hedefin irtifasına tırmanır.', 'Altitude, speed and route are automatic: the flight climbs at full power to the target\'s altitude.')
      : st.type === 'escort' ? L('İrtifa, hız ve rota korunan koldan alınır.', 'Altitude, speed and route follow the escorted flight.') : '';
    if (autoNote) flight.push(`<p class="muted small">${esc(autoNote)}</p>`);
    if (REPEATABLE.has(st.type)) {
      flight.push(`<label class="check"><input type="checkbox" data-act="repeat" ${st.repeat ? 'checked' : ''}> ${L('Görev bitince tekrarla', 'Repeat when the mission ends')}</label>
        ${st.repeat ? `<p class="muted small">${L('Kol inince uçaklar bakımdan çıkar çıkmaz aynı planla yeniden kalkar; kayıplar üsteki hazır uçaklardan tamamlanır. Hedef yıkılınca ya da Aktif görevler\'den durdurunca biter.', 'Once the flight lands and the aircraft are serviced, it takes off again with the same plan; losses are made up from ready aircraft at the base. Stops when the target is destroyed or when you stop it under Active missions.')}</p>` : ''}`);
    }

    // Devriye bölgesi: hedef yerine harita penceresi (merkez ve çap). Tarama da harita penceresinden: bölge ya da radar teması.
    const tpos = p.targetPos;
    const icpt = st.type === 'intercept';
    const swTgt = icpt ? this.selContact() : undefined;
    const fromBase = tpos ? (Math.hypot(tpos.x - st.base.s.pos.x, tpos.z - st.base.s.pos.z) / 1000).toFixed(0) : '';
    const areaTitle = icpt
      ? (swTgt ? `${swTgt.name} · ${swTgt.n} × ${swTgt.abbr}` : tlabel || L('Radar temasını seç', 'Choose a radar contact'))
      : tpos ? L(`Çap ${Math.round((p.patrolRadius * 2) / 1000)} km`, `${Math.round((p.patrolRadius * 2) / 1000)} km across`) : L('Devriye bölgesini seç', 'Choose the patrol area');
    const nEnemy = icpt ? this.enemyContacts().length : 0;
    const strk = kind === 'structure';
    const stTgt = strk ? this.structTargets().find((t) => t.id === p.targetStructureId) : undefined;
    const areaSub = icpt
      ? (swTgt ? L(`üsten ${(swTgt.d / 1000).toFixed(0)} km · ${swTgt.src} · değiştirmek için dokun`, `${(swTgt.d / 1000).toFixed(0)} km from base · ${swTgt.src} · tap to change`)
        : L(`haritada radarın gördüğü ${nEnemy} düşman kolu`, `${nEnemy} enemy flights seen by radar on the map`))
      : tpos ? L(`üsten ${fromBase} km · değiştirmek için dokun`, `${fromBase} km from base · tap to change`) : L('haritada merkezi ve çapı seç', 'pick the centre and diameter on the map');
    const areaBtn = cap || icpt || strk ? `<button class="pl-area" data-act="pick">${this.areaMap(false)}
      <span class="pl-area-t"><b>${esc(strk ? stTgt?.name ?? L('Hedef yapıyı seç', 'Choose the target') : areaTitle)}</b><small>${strk
        ? (stTgt ? `${esc(STRUCTURE_DEFS[stTgt.kind].name)} · ${L(`üsten ${(stTgt.d / 1000).toFixed(0)} km`, `${(stTgt.d / 1000).toFixed(0)} km from base`)}${stTgt.aa ? ` · <span class="bad">${L(`${stTgt.aa} uçaksavar`, `${stTgt.aa} flak`)}</span>` : ''}${p.waypoints.length ? ` · ${L(`yaklaşma ${this.apprDir()}`, `approach ${this.apprDir()}`)}` : ''}`
          : L('haritada düşman yapıları', 'enemy structures on the map'))
        : areaSub}</small></span><span class="chev">›</span></button>` : '';

    // Eskort
    let escortHtml = '';
    if (f.escort) {
      // Uçaklar gibi: eklenen eskort satırları (sayısı burada da değişir) ve "Eskort ekle" penceresi
      const rows = st.escort.filter((x) => x.count > 0).map((pk) => this.acRow(pk, this.escortAvail(pk.specId), true)).join('');
      const free = this.eligible('escort').some((e) => this.escortAvail(e.spec.id) > (st.escort.find((x) => x.specId === e.spec.id)?.count ?? 0));
      escortHtml = `${rows ? `<div class="pl-force">${rows}</div>` : ''}${free || rows
        ? `<button class="pl-add" data-act="addesc">＋ ${L('Eskort ekle', 'Add escort')}</button>`
        : `<p class="muted small">${L('Üste eskorta ayrılabilecek hazır avcı yok.', 'No fighters at this base are free for escort.')}</p>`}`;
    }

    let n = 0;
    const sec = (title: string, body: string, extra = '') => body ? `<section class="psec"><h3><i>${++n}</i>${title}${extra}</h3>${body}</section>` : '';
    const ready = st.base.inventory.filter((a) => a.status === 'ready').length;
    const crew = this.game.world.crewFree(st.base.s.team);
    this.el.innerHTML = `
      <div class="panel-head pl-head">
        <div><div class="info-title">${L('Görev planı', 'Mission plan')}</div><div class="muted small">${esc(st.base.s.name)} · ${L(`${ready} hazır uçak`, `${ready} aircraft ready`)}${Number.isFinite(crew) ? L(` · ${crew} kişi boşta`, ` · ${crew} crew free`) : ''}</div></div>
        <div class="pl-head-b"><button class="pl-histb" data-act="hist" title="${L('Önceki görevlerden birini yeniden planla', 'Plan one of your earlier missions again')}">⟲ ${L('Geçmiş', 'History')}</button>
        <button class="icon" data-act="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
      </div>
      ${sec(L('Görev', 'Mission'), st.type === 'ferry'
        ? `<div class="tbox">${MISSION_ICONS.ferry} ${MISSION_NAMES.ferry}</div><p class="muted small mdesc2">${esc(MISSION_DESCS.ferry)}</p>`
        : `<div class="mgrid4">${typeBtns}</div><p class="muted small mdesc2">${esc(MISSION_DESCS[st.type])}</p>`)}
      ${sec(L('Uçaklar', 'Aircraft'), `${forceRows ? `<div class="pl-force">${forceRows}</div>` : ''}${addBtn}`, totalAc ? `<span class="hcount">${totalAc} ${L('uçak', 'aircraft')}</span>` : '')}
      ${cap || icpt || strk ? sec(cap ? L('Devriye bölgesi', 'Patrol area') : L('Hedef', 'Target'), areaBtn + (icpt && tlabel ? `<p class="muted small">${this.trackInfo()}</p>` : '') + route) : sec(L('Hedef', 'Target'), `<div class="tbox ${tlabel ? '' : 'empty'}">${tlabel ? esc(tlabel) : L('seçilmedi', 'not chosen')}</div>
        ${st.type === 'intercept' && tlabel ? `<p class="muted small">${this.trackInfo()}</p>` : ''}
        <div class="form-row tctl">${targetCtl}</div>${route}`)}
      ${f.escort ? sec(L('Eskort', 'Escort'), escortHtml, escAc ? `<span class="hcount">${escAc} ${L('avcı', 'fighters')}</span>` : '') : ''}
      ${sec(L('Uçuş', 'Flight'), flight.join(''))}
      <div class="pl-foot">
        <div id="plan-summary"></div>
        <button class="primary pl-go" data-act="launch">${L('Kalkış', 'Take off')}${totalAc + escAc ? `<small>${totalAc + escAc} ${L('uçak', 'aircraft')}</small>` : ''}</button>
        <div id="plan-msgs"></div>
      </div>
      ${this.popHtml()}`;
    this.summaryEl = this.el.querySelector('#plan-summary');
    this.nextSummary = 0;
    this.update();
  }

  // ------------------------------------------------------------------ olaylar

  private pickOf(list: Pick[], specId: string, type: MissionType): Pick {
    let pk = list.find((x) => x.specId === specId);
    if (!pk) {
      pk = this.newPick(SPECS[specId], 0, type);
      list.push(pk);
    }
    return pk;
  }

  private onClick(e: Event): void {
    // Pencerenin dışına dokununca pencere kapanır
    if ((e.target as HTMLElement).dataset?.act === 'popbg' && this.st) {
      this.st.pop = null;
      this.renderKeepScroll();
      return;
    }
    // Devriye haritasına dokunuş pointer olaylarında (mapUp): sürüklemenin sonundaki tıklama merkezi taşımasın
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-act]');
    if (!b || !this.st) return;
    const st = this.st;
    const g = this.game;
    const v = b.dataset.v;
    const sid = b.dataset.spec ?? '';
    switch (b.dataset.act) {
      case 'close':
        this.close();
        return;
      case 'type':
        this.setType(v as MissionType);
        break;
      case 'fmode':
      case 'emode': {
        const pk = (b.dataset.act === 'fmode' ? st.force : st.escort).find((x) => x.specId === sid);
        if (!pk) break;
        if (v === 'custom') {
          // Seçili hazır yükten başla (çift askı iki yana bölünür)
          pk.custom = splitSides(SPECS[sid], SPECS[sid].loadouts.find((l) => l.id === pk.loadoutId)?.place ?? []);
        } else pk.custom = null;
        pk.manual = true;
        break;
      }
      case 'fhpn':
      case 'ehpn': {
        const pk = (b.dataset.act === 'fhpn' ? st.force : st.escort).find((x) => x.specId === sid);
        const [hpId, side] = slotKey(b.dataset.hp);
        const cur = pk?.custom?.find((x) => x.hp === hpId && (x.side ?? 0) === (side ?? 0));
        if (cur) cur.n = Math.max(1, cur.n + Number(v));
        break;
      }
      case 'fhpsel':
      case 'ehpsel':
        // Askı kutusu: altında o askının yükleri (aynı kutuya yeniden dokununca kapanır)
        if (st.pop?.kind === 'load') st.pop.hp = st.pop.hp === b.dataset.hp ? undefined : b.dataset.hp;
        break;
      case 'fhpset':
      case 'ehpset':
      case 'fhpmir':
      case 'ehpmir': {
        // Bir yanın yükü; "öbür yana da": seçili yanın yükünü karşı yana kopyala
        const pk = (b.dataset.act![0] === 'f' ? st.force : st.escort).find((x) => x.specId === sid);
        if (!pk?.custom) break;
        const [hpId, side] = slotKey(b.dataset.hp);
        const same = (x: Placement, s?: number) => x.hp === hpId && (x.side ?? 0) === (s ?? 0);
        if (b.dataset.act!.endsWith('mir')) {
          if (!side) break;
          const src = pk.custom.find((x) => same(x, side));
          pk.custom = pk.custom.filter((x) => !same(x, -side));
          if (src) pk.custom.push({ ...src, side: side === 1 ? -1 : 1 });
          pk.manual = true;
          break;
        }
        const prevN = pk.custom.find((x) => same(x, side))?.n ?? 1;
        pk.custom = pk.custom.filter((x) => !same(x, side));
        const h = SPECS[sid].hardpoints.find((x) => x.id === hpId);
        if (v && h) {
          const maxN = Math.max(1, Math.min(h.maxN, Math.floor(capOf(h, this.has) / STORES[v].mass)));
          pk.custom.push(side ? { hp: hpId, store: v, n: Math.min(prevN, maxN), side } : { hp: hpId, store: v, n: Math.min(prevN, maxN) });
        }
        pk.manual = true;
        break;
      }
      case 'fcnt': {
        const pk = this.pickOf(st.force, sid, st.type);
        pk.count = Math.max(0, Math.min(this.maxCount(pk, this.readyOf(sid)), pk.count + Number(v)));
        if (pk.split !== null) pk.split = Math.min(pk.split, pk.count);
        st.force = st.force.filter((x) => x.count > 0);
        // Eskortta aynı tip fazla kaldıysa kırp
        for (const x of st.escort) {
          x.count = Math.min(x.count, this.escortAvail(x.specId));
          if (x.split !== null) x.split = Math.min(x.split, x.count);
        }
        st.escort = st.escort.filter((x) => x.count > 0);
        this.autoAltitude();
        break;
      }
      case 'ecnt': {
        const pk = this.pickOf(st.escort, sid, 'escort');
        const avail = this.maxCount(pk, this.escortAvail(sid));
        pk.count = Math.max(0, Math.min(avail, pk.count + Number(v)));
        if (pk.split !== null) pk.split = Math.min(pk.split, pk.count);
        st.escort = st.escort.filter((x) => x.count > 0);
        break;
      }
      case 'fopen':
      case 'eopen':
        st.pop = { kind: 'load', spec: sid, escort: b.dataset.act === 'eopen' };
        break;
      case 'laps':
        st.laps = Math.max(CAP_LAPS[0], Math.min(CAP_LAPS[1], st.laps + Number(v)));
        break;
      case 'beltx':
        if (st.pop?.kind === 'load') st.pop.belts = !st.pop.belts;
        break;
      case 'openres':
        // Kilitli yük: araştırma ağacı (plan açık kalır)
        g.modals.open('research');
        return;
      case 'zin':
      case 'zout': {
        const m = this.el.querySelector<HTMLElement>('.pl-map');
        if (m) this.zoomAt(m, this.viewOf().z * (b.dataset.act === 'zin' ? 1.6 : 1 / 1.6));
        return;
      }
      case 'zhome': {
        const c = st.base.s.pos;
        st.view = this.clampView({ z: Math.max(this.viewOf().z, MAP_SIZE / 60000), cx: c.x, cz: c.z });
        this.applyView();
        return;
      }
      case 'addac': {
        // Uçak ekleme penceresi: seçim plandaki sayılardan başlar; plan boşsa görevin ilk uygun tipi önerilir
        const sel: Record<string, number> = {};
        for (const x of st.force) sel[x.specId] = x.count;
        if (!st.force.length) {
          const e0 = this.eligible(st.type)[0];
          if (e0) sel[e0.spec.id] = Math.min(this.defaultCount(e0.spec, e0.ready), this.pickerMax(e0.spec.id, sel));
        }
        st.pop = { kind: 'pick', sel };
        break;
      }
      case 'addesc': {
        // Eskort ekleme penceresi: seçim plandaki eskort sayılarından başlar
        const sel: Record<string, number> = {};
        for (const x of st.escort) sel[x.specId] = x.count;
        st.pop = { kind: 'pick', sel, escort: true };
        break;
      }
      case 'pkcnt': {
        if (st.pop?.kind !== 'pick') break;
        const sel = st.pop.sel;
        sel[sid] = Math.max(0, Math.min(this.pickerMax(sid, sel, st.pop.escort), (sel[sid] ?? 0) + Number(v)));
        break;
      }
      case 'pkok': {
        if (st.pop?.kind !== 'pick') break;
        const sel = st.pop.sel;
        if (st.pop.escort) {
          for (const [id, n] of Object.entries(sel)) {
            if (n <= 0) continue;
            const pk = this.pickOf(st.escort, id, 'escort');
            pk.count = n;
            if (pk.split !== null) pk.split = Math.min(pk.split, n);
          }
          st.escort = st.escort.filter((x) => (sel[x.specId] ?? x.count) > 0);
          st.pop = null;
          break;
        }
        for (const [id, n] of Object.entries(sel)) {
          if (n <= 0) continue;
          const pk = this.pickOf(st.force, id, st.type);
          pk.count = n;
        }
        st.force = st.force.filter((x) => (sel[x.specId] ?? x.count) > 0);
        st.pop = null;
        this.autoAltitude();
        break;
      }
      case 'podds':
        st.pop = { kind: 'odds' };
        break;
      case 'popclose':
        st.pop = null;
        break;
      case 'launchgo':
        st.pop = null;
        this.launch(true);
        return;
      case 'fload':
      case 'eload': {
        const pk = (b.dataset.act === 'fload' ? st.force : st.escort).find((x) => x.specId === sid);
        if (pk) {
          pk.loadoutId = v!;
          pk.manual = true;
        }
        break;
      }
      case 'fbelt':
      case 'ebelt': {
        const pk = (b.dataset.act === 'fbelt' ? st.force : st.escort).find((x) => x.specId === sid);
        if (pk) pk.belt = v as BeltId;
        break;
      }
      case 'speed':
        st.plan.speed = v as MissionPlan['speed'];
        break;
      case 'pick':
        // Devriye: harita penceresi (merkez ve çap); öteki görevler oyun haritasında hedef seçer
        if (st.type === 'cap' || st.type === 'intercept' || targetKind(st.type) === 'structure') {
          // Önlemede harita üssü ve bütün temaslarla açılır (çok uzaktakiler değil: en yakın 8 kol); bombardımanda seçili yapı ya da en yakın önemli yapılarla
          const sel = this.structTargets().find((t) => t.id === st.plan.targetStructureId);
          const list = st.type === 'intercept' ? this.enemyContacts().slice(0, 8)
            : targetKind(st.type) === 'structure' && !sel ? this.structTargets().filter((t) => t.major).slice(0, 8) : [];
          if (sel) this.focusOn(sel.x, sel.z);
          else if (list.length) this.frameAll(list);
          st.pop = { kind: 'area' };
        }
        else g.interaction = g.interaction.mode === 'pickTarget' ? { mode: 'none' } : { mode: 'pickTarget' };
        break;
      case 'swc':
        // Önleme penceresinde listeden temas
        this.pickContact(Number(v));
        break;
      case 'hist':
        st.pop = { kind: 'hist' };
        break;
      case 'histgo':
        this.applyHist(Number(v));
        break;
      case 'bendreset':
        st.plan.waypoints = [];
        st.bendEdit = false;
        break;
      case 'tgs':
        // Hedef penceresinde listeden yapı
        this.pickStruct(Number(v));
        break;
      case 'swgame':
        // Oyun haritasından: pencere kapanır, dokunulan yer ya da düşman uçağı
        st.pop = null;
        g.interaction = { mode: 'pickTarget' };
        break;
      case 'wp':
        g.interaction = g.interaction.mode === 'pickWaypoint' ? { mode: 'none' } : { mode: 'pickWaypoint' };
        break;
      case 'wpclear':
        st.plan.waypoints = [];
        break;
      case 'launch':
        this.launch();
        return;
      default:
        return;
    }
    this.renderKeepScroll();
  }

  /** Dışarıdan (ör. haritadan seçim Esc ile bitince) yeniden çiz. */
  refresh(): void {
    if (this.st) this.renderKeepScroll();
  }

  private renderKeepScroll(): void {
    const top = this.el.scrollTop;
    const popTop = this.el.querySelector('.pl-card-b')?.scrollTop ?? 0;
    this.render();
    this.el.scrollTop = top;
    const body = this.el.querySelector('.pl-card-b');
    if (body) body.scrollTop = popTop;
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const st = this.st;
    if (!st) return;
    const p = st.plan;
    const val = el.value;
    const live = e.type === 'input';
    const sid = el.dataset.spec ?? '';
    switch (el.dataset.act) {
      case 'alt': p.altitude = Number(val); break;
      case 'agl': p.agl = Number(val); break;
      case 'pfuel': {
        // Tip başına yakıt: en azın altına inmez; oyuncu değiştirince kendiliğinden ayar kalkar
        const esc0 = el.dataset.esc === '1';
        const pk = (esc0 ? st.escort : st.force).find((x) => x.specId === sid);
        if (!pk) break;
        pk.fuelAuto = false;
        pk.fuel = Math.max(Number(val) / 100, this.fuelFloor(pk, esc0));
        break;
      }
      case 'capdia': {
        p.patrolRadius = (Number(val) * 1000) / 2;
        if (live) {
          // Sürüklerken yalnız harita işaretleri ve değer; bırakınca baştan çizilir
          this.applyView();
          const out = el.nextElementSibling as HTMLElement | null;
          if (out) out.textContent = `${val} km`;
          return;
        }
        break;
      }
      case 'rad': p.patrolRadius = Number(val); break;
      case 'time': p.stationTime = Number(val); break;
      case 'passes': p.passes = Number(val); break;
      case 'low': if (!live) p.lowLevel = (el as HTMLInputElement).checked; break;
      case 'repeat': if (!live) st.repeat = (el as HTMLInputElement).checked; break;
      case 'roe': p.roe = val as MissionPlan['roe']; break;
      case 'doc': p.doctrine = val as MissionPlan['doctrine']; break;
      case 'fhp':
      case 'ehp': {
        const pk = (el.dataset.act === 'fhp' ? st.force : st.escort).find((x) => x.specId === sid);
        if (!pk || !pk.custom) break;
        const hpId = el.dataset.hp!;
        pk.custom = pk.custom.filter((x) => x.hp !== hpId);
        if (val) pk.custom.push({ hp: hpId, store: val, n: 1 });
        break;
      }
      case 'fkit':
      case 'ekit': {
        const pk = (el.dataset.act === 'fkit' ? st.force : st.escort).find((x) => x.specId === sid);
        if (pk) pk.kit = val || null;
        break;
      }
      case 'fsplit':
      case 'esplit': {
        const pk = (el.dataset.act === 'fsplit' ? st.force : st.escort).find((x) => x.specId === sid);
        if (pk) pk.split = val === '' ? null : Number(val);
        break;
      }
      case 'fform':
      case 'eform': {
        const pk = (el.dataset.act === 'fform' ? st.force : st.escort).find((x) => x.specId === sid);
        if (pk) pk.formation = val as FormationType;
        break;
      }
      case 'tflight': p.targetFlightId = val ? Number(val) : null; break;
      case 'tbase': p.targetBaseId = val ? Number(val) : null; break;
      default: return;
    }
    if (live && el instanceof HTMLInputElement && el.type === 'range') {
      // Sürüklerken yalnız yanındaki değeri güncelle
      const out = el.nextElementSibling as HTMLElement | null;
      if (out) {
        const a = el.dataset.act;
        out.textContent =
          a === 'alt' ? `${nf.format(p.altitude)} m` : a === 'agl' ? `${p.agl} m` : a === 'pfuel' ? P(Math.round(((el.dataset.esc === '1' ? st.escort : st.force).find((x) => x.specId === sid)?.fuel ?? 1) * 100))
          : a === 'rad' ? `${(p.patrolRadius / 1000).toFixed(1)} km` : a === 'time' ? fmtDur(p.stationTime) : `${p.passes}`;
      }
      this.nextSummary = 0;
      return;
    }
    if (!live) this.renderKeepScroll();
  }

  /** Kalkış. Uyarı varsa önce onay penceresi (öğreticide sormaz). */
  private launch(confirmed = false): void {
    const st = this.st;
    if (!st) return;
    const g = this.game;
    if (!confirmed && !g.tutorial.busy) {
      const { warns, fuelShort } = this.analyze();
      if (warns.length) {
        st.pop = { kind: 'confirm', warns, fuelShort };
        this.renderKeepScroll();
        return;
      }
    }
    this.syncCap();
    this.syncFuel();
    const plan: MissionPlan = { ...st.plan, waypoints: st.plan.waypoints.map((w) => w.clone()), targetPos: st.plan.targetPos?.clone() ?? null };
    plan.fuelFrac = Math.max(0.2, ...st.force.filter((x) => x.count > 0).map((x) => x.fuel));
    const f = MISSION_FIELDS[st.type];
    if (!f.lowLevel) plan.lowLevel = false;
    if (st.type === 'escort') plan.roe = 'free';
    const groups: LaunchGroup[] = st.force.filter((x) => x.count > 0).map((x) => ({
      specId: x.specId, count: x.count, loadoutId: x.loadoutId, belt: x.belt, formation: x.formation,
      roe: f.roe || st.type === 'escort' ? undefined : defaultPlan(st.type, SPECS[x.specId]).roe,
      custom: x.custom ? this.pickLoadout(x) : undefined,
      split: this.splittable(x, st.type) ? x.split : null,
      fuelFrac: x.fuel,
    }));
    const escorts: LaunchGroup[] = st.escort.filter((x) => x.count > 0).map((x) => ({
      specId: x.specId, count: x.count, loadoutId: x.loadoutId, belt: x.belt, formation: x.formation,
      custom: x.custom ? this.pickLoadout(x) : undefined,
      split: this.splittable(x, 'escort') ? x.split : null,
      fuelFrac: x.fuel,
    }));
    const flights = g.world.launchPackage(st.base, plan, groups, escorts);
    if (flights.length && st.type !== 'ferry') {
      const cp = (p: Pick) => ({ ...p, custom: p.custom ? p.custom.map((x) => ({ ...x })) : null });
      addHistory(g.world, {
        team: st.base.s.team, baseId: st.base.s.id, time: g.world.time, played: g.world.playTime,
        plan: { ...plan, targetPos: plan.targetPos?.clone() ?? null, waypoints: plan.waypoints.map((x) => x.clone()) },
        force: st.force.filter((x) => x.count > 0).map(cp), escort: st.escort.filter((x) => x.count > 0).map(cp),
        laps: st.laps, repeat: st.repeat && REPEATABLE.has(st.type), flights: flights.map((x) => x.name), targetName: this.targetLabel(),
      });
    }
    if (flights.length && st.repeat && REPEATABLE.has(st.type)) addStanding(g.world, st.base.s.id, plan, groups, escorts, flights.map((x) => x.id), st.base.s.team);
    if (flights.length) {
      g.renderer.routeFlightId = flights[0].id;
      this.close();
    }
  }
}

