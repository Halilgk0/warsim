// Görev planlayıcı: hava üssünden kalkmadan önce görev, kuvvet (birden çok tip), mühimmat, hedef, rota, kurallar,
// eskort ve yakıt seçimi. Yalnız seçilen göreve anlamlı gelen ayarlar gösterilir. Yük ve mermi kuşağı göreve göre
// önerilir; oyuncu değiştirebilir. Harita tıklamasıyla hedef ve ara nokta seçilir.

import { Vector3 } from 'three';
import { missionOdds } from '../sim/missionResult';
import type { Game } from '../game';
import type { Airbase } from '../sim/structures/airbase';
import type { Structure } from '../sim/structures/structure';
import { ROLE_NAMES, SPECS, loadoutMass, type AircraftSpec, type Loadout, type Placement } from '../sim/aircraft/specs';
import { STORES, capOf, checkPlacement as checkStores, fits, loadoutAllowed, loadoutSummary, makeLoadout } from '../sim/aircraft/stores';
import {
  MISSION_DESCS, MISSION_FIELDS, MISSION_ICONS, MISSION_NAMES, MISSION_ROLES, TASK_SPLIT, defaultFormation, defaultLoadout, defaultPlan,
  speedFor, targetKind, type FlightTask, type MissionPlan, type MissionType,
} from '../sim/ai/missions';
import { BELTS, BELT_LIST, type BeltId } from '../sim/aircraft/ammo';
import { FORMATION_NAMES, type FormationType } from '../sim/ai/formation';
import { fuelFlowAt } from '../sim/aircraft/aero';
import { TECH_BY_ID } from '../sim/tech';
import { groundLevel } from '../sim/terrain';
import type { LaunchGroup } from '../sim/world';
import { aircraftThumb } from '../render/thumbs';
import { $, bar, esc, fmtDur, nf } from './dom';
import { L, count } from '../i18n';

/** Yüzde metni (Türkçede "%40", İngilizcede "40%"). */
const P = (n: number): string => L(`%${n}`, `${n}%`);
const KMH = L('km/sa', 'km/h');

const TYPES: MissionType[] = ['cap', 'sweep', 'intercept', 'escort', 'levelBomb', 'diveBomb', 'attack', 'ferry'];

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
}

interface State {
  base: Airbase;
  type: MissionType;
  plan: MissionPlan;
  force: Pick[];
  escort: Pick[];
  /** Ayrıntısı açık tip (yük kartları). */
  open: string | null;
}

/** Dağılım seçeneklerindeki kısa iş adları. */
const TASK_SHORT: Record<FlightTask, string> = {
  auto: L('asıl hedefe', 'main target'), fighters: L('eskort avcılarına', 'escort fighters'), bombers: L('bombardımana', 'bombers'),
  flak: L('uçaksavara', 'flak'), close: L('yakın eskort', 'close escort'), free: L('serbest avcı', 'free hunt'),
};

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
  }

  open(base: Airbase, target?: Structure): void {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.game.build.close();
    let type: MissionType = 'cap';
    if (target) {
      const has = (role: AircraftSpec['role']) => base.inventory.some((a) => a.status === 'ready' && SPECS[a.specId].role === role);
      type = has('bomber') ? 'levelBomb' : has('diveBomber') ? 'diveBomb' : 'attack';
    }
    this.st = {
      base, type, plan: defaultPlan(type, SPECS.hurricane1), force: [], escort: [], open: null,
    };
    if (target) this.st.plan.targetStructureId = target.id;
    this.setType(type);
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
    this.st = null;
    this.game.renderer.plannerRoute = null;
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
      formation: defaultFormation(spec, type), manual: false, custom: null, kit: null,
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

  /** Görev dağılımı satırı: tip başına bir seçim kutusu. */
  private splitRow(pk: Pick, type: MissionType, act: string): string {
    const spec = SPECS[pk.specId];
    const opts: (number | null)[] = type === 'cap' || type === 'sweep' || type === 'intercept' ? [null] : [];
    for (let k = 0; k <= pk.count; k++) opts.push(k);
    return `<div class="form-row"><span>${pk.count} × ${esc(spec.abbr)}</span><select data-act="${act}" data-spec="${spec.id}">${opts.map((k) =>
      `<option value="${k ?? ''}" ${k === pk.split ? 'selected' : ''}>${esc(this.splitLabel(type, pk.count, k))}</option>`).join('')}</select></div>`;
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
    st.force = kept.length ? kept : el.length ? [this.newPick(el[0].spec, this.defaultCount(el[0].spec, el[0].ready), type)] : [];
    st.escort = [];
    st.open = st.force.length === 1 ? st.force[0].specId : null;
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

  /** Önlemeye uygun düşman kolları (bilinen ya da görünen). */
  private interceptOptions(): { id: number; text: string }[] {
    const g = this.game;
    const w = g.world;
    const st = this.st!;
    const out: { id: number; text: string; d: number }[] = [];
    const seen = new Set<number>();
    for (const ac of w.aircraft) {
      if (ac.team === g.playerTeam || !ac.airborne || ac.status !== 'flying') continue;
      if (!g.renderer.isVisible(ac)) continue;
      const key = ac.flight?.id ?? -ac.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const lead = ac.flight?.leader() ?? ac;
      const n = ac.flight ? ac.flight.alive.length : 1;
      const d = Math.hypot(lead.pos.x - st.base.s.pos.x, lead.pos.z - st.base.s.pos.z);
      out.push({ id: lead.id, d, text: `${ac.flight?.name ?? lead.callsign} · ${n} × ${lead.spec.abbr} · ${(d / 1000).toFixed(0)} km · ${nf.format(Math.round(lead.pos.y / 100) * 100)} m` });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, 14);
  }

  private structureOptions(): { id: number; text: string }[] {
    const g = this.game;
    const st = this.st!;
    return g.world.structures
      .filter((s) => s.team !== g.playerTeam && !s.destroyed && s.build >= 1)
      .map((s) => ({ s, d: Math.hypot(s.pos.x - st.base.s.pos.x, s.pos.z - st.base.s.pos.z) }))
      .sort((a, b) => a.d - b.d)
      .map(({ s, d }) => ({ id: s.id, text: `${s.name} · ${(d / 1000).toFixed(0)} km` }));
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

  private summary(): { html: string; ok: boolean } {
    const st = this.st!;
    const warns: string[] = [];
    const errs: string[] = [];
    if (st.force.length === 0 || st.force.every((p) => p.count === 0)) errs.push(L('Kuvvete en az bir uçak ekle', 'Add at least one aircraft to the force'));
    const tp = this.targetPos();
    const kind = targetKind(st.type);
    if (!tp) errs.push(kind === 'flight' ? L('Eskort edilecek kol seçilmedi', 'No flight chosen to escort') : kind === 'base' ? L('Hedef üs seçilmedi', 'No destination base chosen') : L('Hedef seçilmedi', 'No target chosen'));
    const pts = this.routePoints();
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const back = tp ? Math.hypot(tp.x - st.base.s.pos.x, tp.z - st.base.s.pos.z) : 0;
    const v = this.packageSpeed();
    const outT = dist / v;
    const p = st.plan;
    const actionT = st.type === 'cap' || st.type === 'sweep' ? p.stationTime : st.type === 'attack' ? 120 * p.passes : st.type === 'intercept' ? 240 : st.type === 'ferry' ? 0 : 120;
    const mods = this.research.mods;
    const rows: string[] = [];
    for (const pk of [...st.force, ...st.escort]) {
      if (pk.count <= 0) continue;
      const spec = SPECS[pk.specId];
      const backT = st.type === 'ferry' ? 0 : back / spec.cruiseSpeed;
      const thr = p.speed === 'max' || st.type === 'intercept' ? 1 : p.speed === 'eco' ? Math.max(0.4, spec.cruiseThrottle - 0.15) : spec.cruiseThrottle;
      const altF = MISSION_FIELDS[st.type].lowLevel && p.lowLevel ? 300 : p.altitude;
      const flow = (t: number) => fuelFlowAt(spec, altF, { throttle: t, spool: t, wep: false, afterburner: false }, mods);
      const needKg = outT * flow(thr) + actionT * flow(0.95) + backT * spec.cruiseFlow + 240 * spec.cruiseFlow;
      const lo = this.pickLoadout(pk);
      const haveKg = spec.fuelKg * mods.fuelMul * p.fuelFrac + lo.tankFuel * mods.dropTankMul;
      if (pk.custom) {
        const chk = checkStores(spec, pk.custom, this.has);
        for (const e of chk.errors) errs.push(`${spec.abbr}: ${e}`);
        if (chk.missing.length) errs.push(`${spec.abbr}: ${L('araştırma gerekli', 'research required')} — ${chk.missing.map((r) => TECH_BY_ID[r]?.name ?? r).join(', ')}`);
      }
      const pct = Math.round((needKg / Math.max(haveKg, 1)) * 100);
      if (needKg > haveKg) warns.push(L(`${spec.abbr}: yakıt yetmeyebilir (gereken ≈${nf.format(needKg)} kg, mevcut ${nf.format(haveKg)} kg)`, `${spec.abbr}: fuel may run short (needs ≈${nf.format(needKg)} kg, has ${nf.format(haveKg)} kg)`));
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
    const segs: [string, number, string][] = [
      [L('Kalkış', 'Takeoff'), 150, 'k'], [L('İntikal', 'Transit'), outT, 'i'], [st.type === 'ferry' ? L('İniş', 'Landing') : L('Görev', 'Mission'), Math.max(actionT, 60), 'g'], [L('Dönüş', 'Return'), backT, 'd'],
    ];
    const total = segs.reduce((a, s) => a + s[1], 0);
    const line = segs.filter((s) => s[1] > 0).map(([n, t, c]) =>
      `<i class="${c}" style="flex:${Math.max(t, total * 0.06).toFixed(0)}" title="${n}: ${fmtDur(t)}"><span>${n}</span></i>`).join('');
    const html = `
      ${this.oddsHtml()}
      <div class="timeline">${line}</div>
      <div class="kv">
        <span>${L('Rota', 'Route')}</span><span>${(dist / 1000).toFixed(1)} km</span>
        <span>${L('Hedefe varış', 'Time to target')}</span><span>~${fmtDur(outT + 150)}</span>
        <span>${L('Toplam süre', 'Total time')}</span><span>~${fmtDur(total)}</span>
        <span>${L('Seyir hızı', 'Cruise speed')}</span><span>${Math.round(v * 3.6)} ${KMH}</span>
      </div>
      <div class="srows"><div class="srow head"><span>${L('Yakıt kullanımı', 'Fuel use')}</span></div>${rows.join('')}</div>
      ${errs.map((w) => `<p class="warnbox bad">${esc(w)}</p>`).join('')}
      ${warns.map((w) => `<p class="warnbox">${esc(w)}</p>`).join('')}
      ${notes.map((w) => `<p class="infobox">${esc(w)}</p>`).join('')}`;
    return { html, ok: errs.length === 0 };
  }

  /** Tahmini başarı ihtimali, etkenler, ihtimali artıracak araştırmalar ve bu türdeki geçmiş sonuçlar. */
  private oddsHtml(): string {
    const st = this.st!;
    const w = this.game.world;
    const team = st.base.s.team;
    const plan: MissionPlan = { ...st.plan, type: st.type };
    const force = st.force.map((x) => ({
      specId: x.specId, count: x.count, loadout: this.pickLoadout(x), split: this.splittable(x, st.type) ? x.split : null,
    }));
    const o = missionOdds(w, team, plan, force, st.escort, st.base.s.pos);
    const tally = w.missionTally.get(`${team}:${st.type}`);
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
    const now = performance.now();
    if (now < this.nextSummary || !this.summaryEl) return;
    this.nextSummary = now + 400;
    const { html, ok } = this.summary();
    this.summaryEl.innerHTML = html;
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
  private customEditor(pk: Pick, k: string, ordOk: boolean): string {
    const spec = SPECS[pk.specId];
    const place = pk.custom ?? [];
    const chk = checkStores(spec, place, this.has);
    const rows = spec.hardpoints.map((h) => {
      const cur = place.find((x) => x.hp === h.id);
      const opts = Object.values(STORES).filter((st) => fits(spec, h, st) && (ordOk || st.kind === 'tank' || st.kind === 'gunpod'));
      const sel = `<select data-act="${k}hp" data-spec="${spec.id}" data-hp="${h.id}"><option value="">— ${L('boş', 'empty')} —</option>${opts.map((st) => {
        const locked = (st.requires ?? []).some((r) => !this.has(r));
        return `<option value="${st.id}" ${cur?.store === st.id ? 'selected' : ''} ${locked ? 'disabled' : ''}>${esc(st.name)}${locked ? L(' (araştırma)', ' (research)') : ''}</option>`;
      }).join('')}</select>`;
      const store = cur ? STORES[cur.store] : undefined;
      const cap = capOf(h, this.has);
      const maxN = store ? Math.max(1, Math.min(h.maxN, Math.floor(cap / store.mass))) : 0;
      const step = store && maxN > 1
        ? `<div class="stepper mini"><button data-act="${k}hpn" data-spec="${spec.id}" data-hp="${h.id}" data-v="-1">−</button><b>${cur!.n}</b><button data-act="${k}hpn" data-spec="${spec.id}" data-hp="${h.id}" data-v="1" ${cur!.n >= maxN ? 'disabled' : ''}>+</button></div>` : '';
      const total = store && cur ? `= ${cur.n * h.pylons} × ${esc(store.short)} · ${nf.format(cur.n * h.pylons * store.mass)} kg` : '';
      return `<div class="hprow">
        <div class="hp-h"><b>${esc(h.name)}${h.pylons > 1 ? ` ×${h.pylons}` : ''}</b><small>${L('askı başına', 'per pylon')} ≤ ${nf.format(cap)} kg${h.heavyCap && cap < h.heavyCap ? L(` (ağır askıyla ${nf.format(h.heavyCap)})`, ` (${nf.format(h.heavyCap)} with heavy racks)`) : ''}${h.maxN > 1 ? L(` · en çok ${h.maxN} adet`, ` · up to ${h.maxN}`) : ''}${h.kind === 'bay' ? L(' · iç bölme', ' · internal bay') : ''}</small></div>
        <div class="hp-c">${sel}${step}</div>
        ${total ? `<small class="hp-t">${total}</small>` : ''}
      </div>`;
    }).join('');
    const kits = spec.loadouts.filter((l) => l.replaceGuns);
    const kitRow = kits.length ? `<div class="form-row"><span>${L('Silah kiti', 'Gun kit')}</span><select data-act="${k}kit" data-spec="${spec.id}">
      <option value="">${L('Standart silahlar', 'Standard guns')}</option>${kits.map((l) => `<option value="${l.id}" ${pk.kit === l.id ? 'selected' : ''} ${loadoutAllowed(l, this.has) ? '' : 'disabled'}>${esc(l.name)}</option>`).join('')}</select></div>` : '';
    const pct = Math.min(100, (chk.kg / Math.max(spec.maxLoad, 1)) * 100);
    const lo = this.pickLoadout(pk);
    return `<div class="hpedit">${rows || `<p class="muted small">${L('Bu uçakta dış yük askısı yok.', 'This aircraft has no hardpoints.')}</p>`}${kitRow}
      <div class="loadbar"><span>${L('Toplam yük', 'Total load')}</span><div class="fuelbar"><i style="width:${pct.toFixed(0)}%" class="${chk.kg > spec.maxLoad ? 'over' : pct > 85 ? 'tight' : ''}"></i></div><b>${nf.format(chk.kg)} / ${nf.format(spec.maxLoad)} kg</b></div>
      <p class="muted small">${esc(this.loadoutEffect(spec, lo))}</p>
      ${chk.errors.map((e) => `<p class="warnbox bad">${esc(e)}</p>`).join('')}
      ${chk.missing.length ? `<p class="warnbox">${L('Araştırma gerekli', 'Research required')}: ${esc(chk.missing.map((r) => TECH_BY_ID[r]?.name ?? r).join(', '))}</p>` : ''}
    </div>`;
  }

  private pickRow(pk: Pick, ready: number, escort: boolean): string {
    const st = this.st!;
    const spec = SPECS[pk.specId];
    const open = st.open === (escort ? `e:${pk.specId}` : pk.specId);
    const lo = this.pickLoadout(pk);
    const suggested = this.suggestLoadout(spec, escort ? 'escort' : st.type);
    const lt = this.loadoutText(spec, lo);
    const k = escort ? 'e' : 'f';
    const maxN = this.maxCount(pk, ready);
    const crewTxt = Number.isFinite(this.crewLeft(pk)) ? ` · ${L(`${spec.crew} kişilik`, `crew ${spec.crew}`)}` : '';
    const head = `
      <div class="frc-head">
        <img src="${aircraftThumb(spec.id, 0x6f86b8)}" alt="">
        <div class="frc-name"><b>${esc(spec.abbr)}</b><small>${ROLE_NAMES[spec.role]} · ${ready} ${L('hazır', 'ready')}${crewTxt}${maxN < ready ? ` · <span class="bad">${L(`personelle ${maxN}`, `${maxN} with crews`)}</span>` : ''}</small></div>
        <div class="stepper"><button data-act="${k}cnt" data-spec="${spec.id}" data-v="-1">−</button><b>${pk.count}</b><button data-act="${k}cnt" data-spec="${spec.id}" data-v="1" ${pk.count >= maxN ? 'disabled' : ''}>+</button></div>
      </div>`;
    if (pk.count === 0) return `<div class="frc off">${head}</div>`;
    const loName = pk.custom ? `${L('Serbest', 'Custom')}: ${lt.text || L('boş', 'empty')}` : lo.name;
    const summaryLine = `<button class="frc-load" data-act="${k}open" data-spec="${spec.id}"><span class="licons">${lt.icons}</span><span><span class="ln">${esc(loName)}${!pk.custom && lo.id === suggested ? ` <em>${L('önerilen', 'suggested')}</em>` : ''}</span><small>${esc(BELTS[pk.belt].name)} · ${esc(FORMATION_NAMES[pk.formation])}</small></span><span class="chev">${open ? '▴' : '▾'}</span></button>`;
    if (!open) return `<div class="frc">${head}${summaryLine}</div>`;
    const ordAllowed = MISSION_FIELDS[escort ? 'escort' : st.type].ordnance;
    const cards = pk.custom ? this.customEditor(pk, k, ordAllowed) : spec.loadouts.map((l) => {
      const ok = loadoutAllowed(l, this.has);
      const t = this.loadoutText(spec, l);
      const ordOk = ordAllowed || (!l.bombCount && !l.rocketCount);
      return `<button class="lcard ${l.id === pk.loadoutId ? 'active' : ''}" data-act="${k}load" data-spec="${spec.id}" data-v="${l.id}" ${ok && ordOk ? '' : 'disabled'}>
        <span class="licons">${t.icons}</span>
        <span class="lbody"><b>${esc(l.name)}${l.id === suggested ? ` <em>${L('önerilen', 'suggested')}</em>` : ''}</b>
        <small>${esc(t.text)}</small>
        <small class="leff">${ok ? (ordOk ? esc(this.loadoutEffect(spec, l)) : L('bu görevde dış yük atılamaz', 'stores cannot be dropped on this mission')) : `${L('araştırma', 'research')}: ${esc(l.reqs.filter((r) => !this.has(r)).map((r) => TECH_BY_ID[r]?.name ?? r).join(', '))}`}</small></span>
      </button>`;
    }).join('');
    const modeTabs = spec.hardpoints.length ? `<div class="seg ltabs">
      <button class="${pk.custom ? '' : 'active'}" data-act="${k}mode" data-spec="${spec.id}" data-v="preset">${L('Hazır yükler', 'Presets')}</button>
      <button class="${pk.custom ? 'active' : ''}" data-act="${k}mode" data-spec="${spec.id}" data-v="custom">${L('Serbest yükleme', 'Custom loading')}</button></div>` : '';
    const belts = spec.guns.length || lo.extraGuns || lo.replaceGuns ? `
      <div class="sub">${L('Mermi kuşağı', 'Ammo belt')}</div>
      <div class="belts">${BELT_LIST.map((b) => `<button class="${b.id === pk.belt ? 'active' : ''}" data-act="${k}belt" data-spec="${spec.id}" data-v="${b.id}" title="${esc(b.desc)}">${esc(b.name)}</button>`).join('')}</div>
      <p class="muted small">${esc(BELTS[pk.belt].desc)}</p>` : '';
    const forms = (Object.keys(FORMATION_NAMES) as FormationType[]).map((f) =>
      `<option value="${f}" ${f === pk.formation ? 'selected' : ''}>${FORMATION_NAMES[f]}</option>`).join('');
    return `<div class="frc open">${head}${summaryLine}
      <div class="frc-body">
        <div class="sub">${L('Yük', 'Load')}</div>
        ${modeTabs}
        <div class="lcards">${cards}</div>
        ${belts}
        <div class="form-row"><span>${L('Formasyon', 'Formation')}</span><select data-act="${k}form" data-spec="${spec.id}">${forms}</select></div>
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
    const picking = g.interaction.mode;

    const typeBtns = TYPES.map((t) => {
      const n = this.eligible(t).reduce((a, e) => a + e.ready, 0);
      return `<button class="mcard ${t === st.type ? 'active' : ''}" data-act="type" data-v="${t}" ${n ? '' : 'disabled'}>
        <span class="mi">${MISSION_ICONS[t]}</span><span>${MISSION_NAMES[t]}</span></button>`;
    }).join('');

    // Kuvvet: uygun her tip bir satır (0 = katılmıyor)
    const forceRows = el.map((e) => {
      const pk = st.force.find((x) => x.specId === e.spec.id) ?? { ...this.newPick(e.spec, 0), count: 0 };
      return this.pickRow(pk, e.ready, false);
    }).join('') || `<p class="muted">${L('Bu görev için üste hazır uçak yok.', 'No aircraft at this base are ready for this mission.')}</p>`;
    const totalAc = st.force.reduce((a, x) => a + x.count, 0);

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
    } else {
      const list = kind === 'aircraft' ? this.interceptOptions() : kind === 'structure' ? this.structureOptions() : [];
      const cur = kind === 'aircraft' ? p.targetAircraftId : p.targetStructureId;
      const sel = list.length ? `<select data-act="${kind === 'aircraft' ? 'tair' : 'tstruct'}" class="wide"><option value="">— ${L('listeden seç', 'pick from the list')} —</option>${list.map((o) =>
        `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${esc(o.text)}</option>`).join('')}</select>` : '';
      targetCtl = `<button class="${picking === 'pickTarget' ? 'active' : ''}" data-act="pick">${picking === 'pickTarget' ? L('Haritada tıkla…', 'Click on the map…') : L('Haritadan seç', 'Pick on map')}</button>${sel}`;
    }
    const tlabel = this.targetLabel();

    // Uçuş
    const flightCtl: string[] = [];
    if (f.route) {
      flightCtl.push(`<div class="form-row">
        <button class="${picking === 'pickWaypoint' ? 'active' : ''}" data-act="wp">${picking === 'pickWaypoint' ? L('Ekleniyor…<span class="kbd"> (Esc bitir)</span>', 'Adding…<span class="kbd"> (Esc to finish)</span>') : L('Ara nokta ekle', 'Add waypoint')}</button>
        <span class="muted small">${p.waypoints.length ? L(`${p.waypoints.length} nokta`, count(p.waypoints.length, 'waypoint')) : L('doğrudan hedefe', 'straight to target')}</span>
        ${p.waypoints.length ? `<button data-act="wpclear">${L('Temizle', 'Clear')}</button>` : ''}</div>`);
    }
    if (f.lowLevel) flightCtl.push(`<label class="check"><input type="checkbox" data-act="low" ${p.lowLevel ? 'checked' : ''}> ${L('Alçak uçuş: arazi takibi (radar altı)', 'Low level: terrain following (under the radar)')}</label>`);
    const maxCeil = Math.min(...st.force.map((x) => SPECS[x.specId].ceiling), 13000);
    if (f.lowLevel && p.lowLevel) {
      flightCtl.push(`<div class="form-row"><span>${L('Yerden', 'Above ground')}</span><input type="range" min="60" max="400" step="10" value="${p.agl}" data-act="agl"><b>${p.agl} m</b></div>`);
    } else if (f.altitude) {
      flightCtl.push(`<div class="form-row"><span>${L('İrtifa', 'Altitude')}</span><input type="range" min="500" max="${Math.max(3000, Math.round((Number.isFinite(maxCeil) ? maxCeil : 9000) - 300))}" step="100" value="${p.altitude}" data-act="alt"><b>${nf.format(p.altitude)} m</b></div>`);
    }
    if (f.speed) {
      flightCtl.push(`<div class="form-row"><span>${L('Hız', 'Speed')}</span><div class="seg">${(['eco', 'cruise', 'max'] as const).map((s) =>
        `<button class="${p.speed === s ? 'active' : ''}" data-act="speed" data-v="${s}">${s === 'eco' ? L('Ekonomik', 'Economy') : s === 'cruise' ? L('Seyir', 'Cruise') : L('Azami', 'Max')}</button>`).join('')}</div></div>`);
    }
    const autoNote = st.type === 'intercept'
      ? L('İrtifa, hız ve rota otomatik: kol tam güçle hedefin irtifasına tırmanarak kesişme noktasına gider.', 'Altitude, speed and route are automatic: the flight climbs at full power to the target\'s altitude and heads for the intercept point.')
      : st.type === 'escort' ? L('İrtifa, hız ve rota korunan koldan alınır; eskort onun üstünde ve yanında uçar.', 'Altitude, speed and route follow the escorted flight; the escort flies above and beside it.') : '';

    // Kurallar
    const anyFighter = st.force.some((x) => x.count > 0 && SPECS[x.specId].role === 'fighter');
    const rules: string[] = [];
    if (f.roe) {
      rules.push(`<div class="form-row"><span>${L('Angajman', 'Engagement')}</span><select data-act="roe">
        <option value="free" ${p.roe === 'free' ? 'selected' : ''}>${L('Serbest: görev bölgesinde saldır', 'Free: attack in the mission area')}</option>
        <option value="defensive" ${p.roe === 'defensive' ? 'selected' : ''}>${L('Yalnız savunma', 'Defensive only')}</option>
        <option value="avoid" ${p.roe === 'avoid' ? 'selected' : ''}>${L('Çatışmadan kaçın', 'Avoid combat')}</option></select></div>`);
    }
    if (anyFighter && st.type !== 'ferry') {
      rules.push(`<div class="form-row"><span>${L('Kanat adamı', 'Wingman')}</span><select data-act="doc">
        <option value="cover" ${p.doctrine === 'cover' ? 'selected' : ''}>${L('Lideri korur', 'Covers the leader')}</option>
        <option value="free" ${p.doctrine === 'free' ? 'selected' : ''}>${L('Serbest avlanır', 'Hunts freely')}</option></select></div>`);
    }

    // Görev dağılımı: aynı tipin uçakları iki işe ayrı kollar olarak bölünür
    const split: string[] = [];
    const mainSplit = st.force.filter((x) => this.splittable(x, st.type));
    if (mainSplit.length) {
      split.push(...mainSplit.map((x) => this.splitRow(x, st.type, 'fsplit')));
      split.push(`<p class="muted small">${esc(TASK_SPLIT[st.type]!.help)}</p>`);
    }
    const escSplit = f.escort ? st.escort.filter((x) => this.splittable(x, 'escort')) : [];
    if (escSplit.length) {
      if (mainSplit.length) split.push(`<div class="sub">${L('Eskort', 'Escort')}</div>`);
      split.push(...escSplit.map((x) => this.splitRow(x, 'escort', 'esplit')));
      split.push(`<p class="muted small">${esc(TASK_SPLIT.escort!.help)}</p>`);
    }

    // Görev ayrıntısı
    const detail: string[] = [];
    if (f.patrol) {
      detail.push(`<div class="form-row"><span>${L('Yarıçap', 'Radius')}</span><input type="range" min="1000" max="8000" step="500" value="${p.patrolRadius}" data-act="rad"><b>${(p.patrolRadius / 1000).toFixed(1)} km</b></div>
        <div class="form-row"><span>${L('Süre', 'Duration')}</span><input type="range" min="120" max="1500" step="60" value="${p.stationTime}" data-act="time"><b>${fmtDur(p.stationTime)}</b></div>`);
    }
    if (f.passes) detail.push(`<div class="form-row"><span>${L('Geçiş', 'Passes')}</span><input type="range" min="1" max="4" step="1" value="${p.passes}" data-act="passes"><b>${p.passes}</b></div>`);

    // Eskort
    let escortHtml = '';
    if (f.escort) {
      const fighters = this.eligible('escort');
      escortHtml = fighters.length ? fighters.map((e) => {
        const pk = st.escort.find((x) => x.specId === e.spec.id) ?? { ...this.newPick(e.spec, 0, 'escort'), count: 0 };
        return this.pickRow(pk, this.escortAvail(e.spec.id), true);
      }).join('') : `<p class="muted small">${L('Üste hazır avcı yok.', 'No fighters ready at this base.')}</p>`;
    }

    let n = 0;
    const sec = (title: string, body: string, extra = '') => body ? `<section class="psec"><h3><i>${++n}</i>${title}${extra}</h3>${body}</section>` : '';
    this.el.innerHTML = `
      <div class="panel-head">
        <button class="icon" data-act="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button>
        <div><div class="info-title">${L('Görev planı', 'Mission plan')}</div><div class="muted small">${esc(st.base.s.name)} · ${L(`${st.base.inventory.filter((a) => a.status === 'ready').length} hazır uçak`, `${st.base.inventory.filter((a) => a.status === 'ready').length} aircraft ready`)}${Number.isFinite(this.game.world.crewFree(st.base.s.team)) ? L(` · personel ${this.game.world.crewFree(st.base.s.team)} kişi boşta`, ` · ${this.game.world.crewFree(st.base.s.team)} personnel free`) : ''}</div></div>
      </div>
      ${sec(L('Görev', 'Mission'), `<div class="mgrid4">${typeBtns}</div><p class="muted small mdesc2">${esc(MISSION_DESCS[st.type])}</p>`)}
      ${sec(L('Kuvvet', 'Force'), `<div class="force">${forceRows}</div>`, totalAc ? `<span class="hcount">${totalAc} ${L('uçak', 'aircraft')}</span>` : '')}
      ${sec(L('Hedef', 'Target'), `<div class="tbox ${tlabel ? '' : 'empty'}">${tlabel ? esc(tlabel) : L('seçilmedi', 'not chosen')}</div>
        ${st.type === 'intercept' && tlabel ? `<p class="muted small">${this.trackInfo()}</p>` : ''}
        <div class="form-row tctl">${targetCtl}</div>`)}
      ${sec(L('Uçuş', 'Flight'), flightCtl.join('') + (autoNote ? `<p class="muted small">${esc(autoNote)}</p>` : ''))}
      ${sec(L('Kurallar', 'Rules'), rules.join(''))}
      ${sec(f.patrol ? L('Devriye', 'Patrol') : L('Taarruz', 'Attack'), detail.join(''))}
      ${f.escort ? sec(L('Eskort', 'Escort'), `<div class="force">${escortHtml}</div>`) : ''}
      ${sec(L('Görev dağılımı', 'Task split'), split.join(''))}
      ${sec(L('Yakıt', 'Fuel'), `<div class="form-row"><span>${L('İç depo', 'Internal tank')}</span><input type="range" min="40" max="100" step="5" value="${Math.round(p.fuelFrac * 100)}" data-act="fuel"><b>${P(Math.round(p.fuelFrac * 100))}</b></div>`)}
      <section class="psec"><h3>${L('Özet', 'Summary')}</h3><div id="plan-summary"></div></section>
      <div class="btn-row sticky">
        <button class="primary wide" data-act="launch">${L('Kalkış', 'Take off')}${totalAc + st.escort.reduce((a, x) => a + x.count, 0) ? ` · ${totalAc + st.escort.reduce((a, x) => a + x.count, 0)} ${L('uçak', 'aircraft')}` : ''}</button>
      </div>`;
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
          // Seçili hazır yükten başla
          pk.custom = SPECS[sid].loadouts.find((l) => l.id === pk.loadoutId)?.place.map((x) => ({ ...x })) ?? [];
        } else pk.custom = null;
        pk.manual = true;
        break;
      }
      case 'fhpn':
      case 'ehpn': {
        const pk = (b.dataset.act === 'fhpn' ? st.force : st.escort).find((x) => x.specId === sid);
        const cur = pk?.custom?.find((x) => x.hp === b.dataset.hp);
        if (cur) cur.n = Math.max(1, cur.n + Number(v));
        break;
      }
      case 'fcnt': {
        const pk = this.pickOf(st.force, sid, st.type);
        const before = pk.count;
        pk.count = Math.max(0, Math.min(this.maxCount(pk, this.readyOf(sid)), pk.count + Number(v)));
        if (pk.split !== null) pk.split = Math.min(pk.split, pk.count);
        if (before === 0 && pk.count > 0) st.open = sid;
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
        if (pk.count > 0 && Number(v) > 0 && pk.count === 1) st.open = `e:${sid}`;
        break;
      }
      case 'fopen':
        st.open = st.open === sid ? null : sid;
        break;
      case 'eopen':
        st.open = st.open === `e:${sid}` ? null : `e:${sid}`;
        break;
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
        g.interaction = g.interaction.mode === 'pickTarget' ? { mode: 'none' } : { mode: 'pickTarget' };
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
    this.render();
    this.el.scrollTop = top;
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
      case 'fuel': p.fuelFrac = Number(val) / 100; break;
      case 'rad': p.patrolRadius = Number(val); break;
      case 'time': p.stationTime = Number(val); break;
      case 'passes': p.passes = Number(val); break;
      case 'low': if (!live) p.lowLevel = (el as HTMLInputElement).checked; break;
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
      case 'tair':
        p.targetAircraftId = val ? Number(val) : null;
        this.refreshSuggestions();
        break;
      case 'tstruct':
        p.targetStructureId = val ? Number(val) : null;
        this.refreshSuggestions();
        this.autoAltitude();
        break;
      default: return;
    }
    if (live && el instanceof HTMLInputElement && el.type === 'range') {
      // Sürüklerken yalnız yanındaki değeri güncelle
      const out = el.nextElementSibling as HTMLElement | null;
      if (out) {
        const a = el.dataset.act;
        out.textContent =
          a === 'alt' ? `${nf.format(p.altitude)} m` : a === 'agl' ? `${p.agl} m` : a === 'fuel' ? P(Math.round(p.fuelFrac * 100))
          : a === 'rad' ? `${(p.patrolRadius / 1000).toFixed(1)} km` : a === 'time' ? fmtDur(p.stationTime) : `${p.passes}`;
      }
      this.nextSummary = 0;
      return;
    }
    if (!live) this.renderKeepScroll();
  }

  private launch(): void {
    const st = this.st;
    if (!st) return;
    const g = this.game;
    const plan: MissionPlan = { ...st.plan, waypoints: st.plan.waypoints.map((w) => w.clone()), targetPos: st.plan.targetPos?.clone() ?? null };
    const f = MISSION_FIELDS[st.type];
    if (!f.lowLevel) plan.lowLevel = false;
    if (st.type === 'escort') plan.roe = 'free';
    const groups: LaunchGroup[] = st.force.filter((x) => x.count > 0).map((x) => ({
      specId: x.specId, count: x.count, loadoutId: x.loadoutId, belt: x.belt, formation: x.formation,
      roe: f.roe || st.type === 'escort' ? undefined : defaultPlan(st.type, SPECS[x.specId]).roe,
      custom: x.custom ? this.pickLoadout(x) : undefined,
      split: this.splittable(x, st.type) ? x.split : null,
    }));
    const escorts: LaunchGroup[] = st.escort.filter((x) => x.count > 0).map((x) => ({
      specId: x.specId, count: x.count, loadoutId: x.loadoutId, belt: x.belt, formation: x.formation,
      custom: x.custom ? this.pickLoadout(x) : undefined,
      split: this.splittable(x, 'escort') ? x.split : null,
    }));
    const flights = g.world.launchPackage(st.base, plan, groups, escorts);
    if (flights.length) {
      g.renderer.routeFlightId = flights[0].id;
      this.close();
    }
  }
}

