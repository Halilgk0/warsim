// Kol (uçuş grubu): lider + kanat adamları. Görev aşamalarını yönetir, temasları paylaşır,
// avcı kollarında hedef dağıtır. Uçakların kendisi (beyin) bu aşamaya göre davranır.

import { Vector3 } from 'three';
import { flightValue, newMissionStats, type MissionStats } from '../missionResult';
import { aircraftPrice } from '../economy';
import type { Aircraft } from '../aircraft/aircraft';
import type { World } from '../world';
import type { Airbase } from '../structures/airbase';
import { MISSION_NAMES, type FlightTask, type MissionPlan } from './missions';
import { formationSpacing, slotOffset, slotWorld } from './formation';
import { isCrippled } from '../aircraft/damage';
import { L, lower } from '../../i18n';

export type FlightPhase = 'ground' | 'formup' | 'enroute' | 'action' | 'egress' | 'rtb' | 'landing' | 'done';

export const PHASE_NAMES: Record<FlightPhase, string> = {
  ground: L('Kalkış sırasında', 'Taking off'),
  formup: L('Toplanıyor', 'Forming up'),
  enroute: L('İntikal', 'En route'),
  action: L('Görevde', 'On task'),
  egress: L('Hedeften çıkış', 'Egress'),
  rtb: L('Üsse dönüş', 'Returning'),
  landing: L('İniş', 'Landing'),
  done: L('Tamamlandı', 'Done'),
};

export interface FlightContact {
  id: number;
  lastSeen: number;
}

const _slot = new Vector3();
const _est = new Vector3();

let nextId = 1;

/** Video kaydı: aynı dünya yeniden kurulunca kimlikler de aynı olsun (yalnız dünya yokken çağrılır). */
export function resetFlightIds(): void {
  nextId = 1;
}

export class FlightGroup {
  readonly id = nextId++;
  readonly members: Aircraft[] = [];
  phase: FlightPhase = 'ground';
  phaseStart = 0;
  route: Vector3[] = [];
  routeIndex = 0;
  readonly contacts = new Map<number, FlightContact>();
  engaged = false;
  lastEngage = -1e9;
  stationStart = -1;
  actionStart = -1;
  readonly bomb = { started: false, released: false, releaseTime: -1, aimOffset: new Vector3() };
  readonly rendezvous = new Vector3();
  rendezvousAlt = 1000;
  /** Hedefe yaklaşma yönü (yatay birim vektör). */
  readonly approachDir = new Vector3(1, 0, 0);
  /** Görevden dönüp inen uçak sayısı. */
  landed = 0;
  rtbReason: string | null = null;
  /** Üye → atanan hedef. */
  readonly assigned = new Map<number, number>();
  private assignTimer = 0;
  /** Saldırı geçişlerine başlama sırası (dalış/taarruz). */
  nextAttacker = 0;
  nextAttackTime = 0;
  /** Aynı görev paketindeki kollar ortak kimliği paylaşır (0 = paket yok). */
  packageId = 0;
  /** Toplanma tamamlandı (paket kolları birbirini bekler). */
  formedUp = false;
  /** Önleme izi: hedefin bilinen son konumu ve hızı (radar, gözcü ya da kendi gözü). */
  readonly track = { pos: new Vector3(), vel: new Vector3(), time: -1e9, role: 'fighter' as string };
  /** İz eskiyip tahmini konuma varıldığında aramaya başlanan zaman (-1: aramıyor). */
  searchStart = -1;
  /** Önlenen düşman kolu (hedef düşerse kolun diğer uçaklarına geçilir). */
  interceptFlightId: number | null = null;
  /** Savunma (alarm) kalkışı: hedef kendi yapılarımızdan bu kadar uzaklaşınca bırakılır (m); null = sınırsız. */
  leash: number | null = null;
  /** Görev sonucu için toplanan sonuçlar. */
  readonly stats: MissionStats = newMissionStats();
  /** Eskortsa eşlik edilen kol (o önce bitse de sonucu okunur). */
  escortOf: FlightGroup | null = null;
  /** Eskort zikzakının yönü (+1 sağa, -1 sola). */
  weave = { sign: 1 };
  /** Kolun herhangi bir üyesine son yakın flak patlaması (kol birlikte zikzak çizer). */
  flakTime = -1e9;

  constructor(
    readonly team: number,
    readonly name: string,
    public plan: MissionPlan,
    readonly baseId: number,
    public returnBaseId: number,
    public expected: number,
  ) {}

  get alive(): Aircraft[] {
    return this.members.filter((m) => m.status === 'flying');
  }

  /** Formasyonda uçan (kopmamış, havadaki) üyeler. */
  get formed(): Aircraft[] {
    return this.members.filter((m) => m.status === 'flying' && m.airborne && !m.brain.detached);
  }

  leader(): Aircraft | null {
    for (const m of this.members) if (m.status === 'flying' && m.airborne && !m.brain.detached) return m;
    return null;
  }

  isFighterFlight(): boolean {
    const l = this.members[0];
    return !!l && l.spec.role === 'fighter';
  }

  /** Kol içindeki sırasına göre (liderler hariç), kanat adamının eleman lideri. */
  wingLeaderOf(ac: Aircraft): Aircraft | null {
    if (ac.slot % 2 === 0) return null;
    const lead = this.members.find((m) => m.slot === ac.slot - 1);
    return lead && lead.status === 'flying' && lead.airborne && !lead.brain.detached ? lead : null;
  }

  spacing(ac: Aircraft): number {
    return formationSpacing(ac, this.plan.lowLevel && (this.phase === 'enroute' || this.phase === 'action'));
  }

  slotDistance(ac: Aircraft, leader: Aircraft): number {
    const order = this.formed.indexOf(ac);
    slotWorld(leader, slotOffset(this.plan.formation, order, this.spacing(ac)), _slot);
    return _slot.distanceTo(ac.pos);
  }

  /** Formasyondaki sıra (ölen/kopan üyeler boşluk bırakmaz). */
  formationIndex(ac: Aircraft): number {
    return this.formed.indexOf(ac);
  }

  /** Önleme izini hedefin şu anki durumuyla başlat (emri veren onu görüyor). */
  initTrack(world: World): void {
    const tgt = this.plan.targetAircraftId !== null ? world.aircraftById(this.plan.targetAircraftId) : undefined;
    if (!tgt) return;
    const c = world.teams[this.team].intel.contacts.get(tgt.id);
    if (c) {
      this.track.pos.copy(c.pos);
      this.track.vel.copy(c.vel);
      this.track.time = c.lastSeen;
    } else {
      this.track.pos.copy(tgt.pos);
      tgt.velocity(this.track.vel);
      this.track.time = world.time;
    }
    this.track.role = tgt.spec.role;
    this.interceptFlightId = tgt.flight?.id ?? null;
    this.stats.targetFlightId = this.interceptFlightId;
    this.stats.targetFlightValue = tgt.flight ? flightValue(tgt.flight) : aircraftPrice(tgt.spec);
  }

  /** İzi tazele: kolun kendi gözü kesin konum verir, takım istihbaratı (radar/gözcü) gecikmeli konum. */
  private updateTrack(world: World): void {
    const id = this.plan.targetAircraftId;
    const tgt = id !== null ? world.aircraftById(id) : undefined;
    if (!tgt || !tgt.airborne) return;
    const own = this.contacts.get(tgt.id);
    if (own && world.time - own.lastSeen < 2) {
      this.track.pos.copy(tgt.pos);
      tgt.velocity(this.track.vel);
      this.track.time = world.time;
      return;
    }
    const c = world.teams[this.team].intel.contacts.get(tgt.id);
    if (c && c.lastSeen > this.track.time) {
      this.track.pos.copy(c.pos);
      this.track.vel.copy(c.vel);
      this.track.time = c.lastSeen;
    }
  }

  /**
   * İzden tahmini şimdiki konum. Düz uçan bombardıman/taarruz kolu 5 dk ileri kestirilebilir;
   * avcı manevra yaptığından en fazla 1 dk.
   */
  trackEstimate(time: number, out: Vector3): Vector3 {
    const cap = this.track.role === 'fighter' ? 60 : 300;
    return out.copy(this.track.pos).addScaledVector(this.track.vel, Math.min(time - this.track.time, cap));
  }

  /** Hedef düştü/indi: aynı kolun diğer uçaklarına ya da iz bölgesindeki bilinen düşmana geç. */
  private retarget(world: World): Aircraft | null {
    const est = this.trackEstimate(world.time, _est);
    const intel = world.teams[this.team].intel;
    let best: Aircraft | null = null;
    let bestD = Infinity;
    const consider = (e: Aircraft | undefined, maxD: number) => {
      if (!e || !e.airborne || e.team === this.team) return;
      const d = Math.hypot(e.pos.x - est.x, e.pos.z - est.z);
      if (d < maxD && d < bestD) {
        bestD = d;
        best = e;
      }
    };
    // Kolun diğer uçakları hedefin yanında uçuyordu: görülmüş sayılır
    const ef = this.interceptFlightId !== null ? world.flightById(this.interceptFlightId) : undefined;
    for (const m of ef?.members ?? []) consider(m, 6000);
    for (const c of this.contacts.values()) consider(world.aircraftById(c.id), 15000);
    for (const c of intel.contacts.values()) if (world.time - c.lastSeen < 14) consider(world.aircraftById(c.id), 15000);
    const found = best as Aircraft | null;
    if (!found) return null;
    this.plan.targetAircraftId = found.id;
    this.track.pos.copy(found.pos);
    found.velocity(this.track.vel);
    this.track.time = world.time;
    this.track.role = found.spec.role;
    this.searchStart = -1;
    this.interceptFlightId = found.flight?.id ?? this.interceptFlightId;
    return found;
  }

  /** Paketin öndeki kolu (aynı görev türündeki ilk canlı kol). */
  packageLead(world: World): FlightGroup | null {
    if (!this.packageId) return null;
    for (const f of world.flights) {
      if (f.packageId !== this.packageId || f.plan.type !== this.plan.type) continue;
      if (f.phase === 'done' || f.alive.length === 0) continue;
      return f;
    }
    return null;
  }

  /** Paketteki aynı görev türündeki kollar. */
  packageFlights(world: World): FlightGroup[] {
    if (!this.packageId) return [this];
    return world.flights.filter((f) => f.packageId === this.packageId && f.plan.type === this.plan.type && f.phase !== 'done');
  }

  setPhase(p: FlightPhase, world: World, note?: string): void {
    if (this.phase === p) return;
    this.phase = p;
    this.phaseStart = world.time;
    if (p === 'action') {
      this.actionStart = world.time;
      this.stats.reachedAction = true;
    }
    const msg: Partial<Record<FlightPhase, string>> = {
      enroute: L(`${this.name} kolu toplandı, ${lower(MISSION_NAMES[this.plan.type])} görevine intikal ediyor`, `${this.name} flight formed up, heading out on ${lower(MISSION_NAMES[this.plan.type])}`),
      action: L(`${this.name} kolu görev bölgesinde`, `${this.name} flight is on station`),
      egress: L(`${this.name} kolu hedeften ayrılıyor`, `${this.name} flight is leaving the target`) + (note ? ` (${note})` : ''),
      landing: L(`${this.name} kolu iniş için üs üzerinde`, `${this.name} flight is over base to land`),
    };
    if (msg[p]) world.log(msg[p]!, this.team, 'ops');
  }

  update(world: World, dt: number): void {
    const t = world.time;
    // Hedef alınmış temas daha uzun hatırlanır (pilot gözünü ayırmaz)
    const targeted = new Set(this.assigned.values());
    for (const [id, c] of this.contacts) {
      const e = world.aircraftById(id);
      if (t - c.lastSeen > (targeted.has(id) ? 25 : 7) || !e || !e.airborne) this.contacts.delete(id);
    }
    const alive = this.alive;
    const pending = world.pendingTakeoffs(this);
    if (pending === 0 && alive.length === 0) {
      this.setPhase('done', world);
      return;
    }
    const leader = this.leader();
    const p = this.plan;

    if (this.phase === 'enroute' || this.phase === 'action') {
      if (alive.some((m) => !m.brain.detached && world.isBingo(m))) {
        this.rtbReason = L('yakıt azaldı', 'low on fuel');
        this.setPhase('egress', world, this.rtbReason);
      } else if (this.isFighterFlight() && p.type !== 'ferry') {
        const inFormation = alive.filter((m) => !m.brain.detached);
        const armed = inFormation.filter((m) => m.ammoFrac > 0.15);
        if (armed.length === 0 && inFormation.length > 0) {
          this.rtbReason = L('mühimmat bitti', 'out of ammo');
          this.setPhase('egress', world, this.rtbReason);
        }
      }
    }

    switch (this.phase) {
      case 'ground':
        if (alive.some((m) => m.airborne)) this.setPhase('formup', world);
        break;
      case 'formup': {
        const inFormation = alive.filter((m) => !m.brain.detached);
        const allUp = pending === 0 && inFormation.every((m) => m.airborne);
        const formed = allUp && !!leader && inFormation.every((m) => m === leader || this.slotDistance(m, leader) < 900);
        const waited = t - this.phaseStart;
        if (p.type === 'intercept') {
          // Alarm kalkışı: toplanma beklenmez, kanat adamları yolda yetişir
          if (leader && ((allUp && waited > 4) || waited > 30)) {
            this.setPhase('action', world);
            world.log(L(`${this.name} kolu havada, hedefe yöneliyor`, `${this.name} flight is airborne, heading for the target`), this.team, 'ops');
          }
          break;
        }
        if ((formed && waited > 8) || (allUp && waited > 120)) this.formedUp = true;
        // Paket kolları birbirini bekler (en fazla 2,5 dk)
        const pkgReady = this.packageFlights(world).every((f) => f.formedUp || f.alive.length === 0);
        if (this.formedUp && (pkgReady || waited > 150)) {
          this.setPhase(p.type === 'escort' ? 'action' : 'enroute', world);
          if (p.type === 'escort') {
            world.log(L(`${this.name} kolu toplandı, ${lower(MISSION_NAMES[p.type])} görevine başlıyor`, `${this.name} flight formed up, starting ${lower(MISSION_NAMES[p.type])}`), this.team, 'ops');
          }
        }
        break;
      }
      case 'enroute': {
        if (!leader) break;
        const lead = this.packageLead(world);
        if (lead && lead !== this) {
          this.routeIndex = Math.max(this.routeIndex, lead.routeIndex);
          if (lead.phase !== 'enroute' && lead.phase !== 'formup' && lead.phase !== 'ground') this.endRoute(world);
          break;
        }
        const wp = this.route[this.routeIndex];
        if (!wp) {
          this.endRoute(world);
          break;
        }
        const d = Math.hypot(wp.x - leader.pos.x, wp.z - leader.pos.z);
        if (d < (p.lowLevel ? 900 : 1500)) {
          this.routeIndex++;
          if (this.routeIndex >= this.route.length) this.endRoute(world);
        }
        break;
      }
      case 'action':
        this.updateAction(world, alive);
        break;
      case 'egress': {
        const tp = world.missionTargetPos(this);
        const far = !leader || !tp || Math.hypot(tp.x - leader.pos.x, tp.z - leader.pos.z) > 7000;
        if (far || t - this.phaseStart > 60) this.setPhase('rtb', world);
        break;
      }
      case 'rtb': {
        let base = world.airbaseById(this.returnBaseId);
        if (!base || !base.usable) {
          const alt = leader ? world.nearestAirbase(this.team, leader.pos, (b) => b.usable) : null;
          if (alt && alt !== base) {
            world.log(L(`${this.name}: ${base?.s.name ?? 'üs'} kullanılamıyor, ${alt.s.name} üssüne yöneliyor`, `${this.name}: ${base?.s.name ?? 'base'} unusable, diverting to ${alt.s.name}`), this.team, 'ops');
            this.returnBaseId = alt.s.id;
            base = alt;
          }
        }
        if (base && leader && Math.hypot(base.s.pos.x - leader.pos.x, base.s.pos.z - leader.pos.z) < 7000) {
          this.beginLanding(world, base);
        }
        break;
      }
      case 'landing':
      case 'done':
        break;
    }

    this.assignTimer -= dt;
    if (this.assignTimer <= 0) {
      this.assignTimer = 0.8 + Math.random() * 0.3;
      this.assignTargets(world);
    }
  }

  beginLanding(world: World, base: Airbase): void {
    this.setPhase('landing', world);
    for (const m of this.alive) if (m.airborne) m.brain.beginLanding(base);
  }

  private endRoute(world: World): void {
    if (this.plan.type === 'ferry') {
      const base = world.airbaseById(this.plan.targetBaseId ?? -1);
      if (base) {
        this.returnBaseId = base.s.id;
        this.beginLanding(world, base);
        return;
      }
    }
    this.setPhase('action', world);
  }

  private updateAction(world: World, alive: Aircraft[]): void {
    const t = world.time;
    const p = this.plan;
    switch (p.type) {
      case 'cap':
      case 'sweep':
        if (this.stationStart < 0) this.stationStart = t;
        if (t - this.stationStart > p.stationTime && !this.engaged) this.setPhase('egress', world, L('devriye süresi doldu', 'patrol time is up'));
        break;
      case 'intercept': {
        const id = p.targetAircraftId;
        const tgt = id !== null ? world.aircraftById(id) : undefined;
        if (!tgt || !tgt.airborne) {
          const prev = tgt ? `${tgt.callsign} ${tgt.status === 'flying' ? L('indi', 'landed') : L('düştü', 'went down')}` : L('hedef kayboldu', 'target lost');
          const next = this.retarget(world);
          if (next) world.log(L(`${this.name}: ${prev}, ${next.callsign} (${next.spec.abbr}) uçağına yöneliyor`, `${this.name}: ${prev}, turning onto ${next.callsign} (${next.spec.abbr})`), this.team, 'ops');
          else this.setPhase('egress', world, L(`${prev}, bölgede başka düşman yok`, `${prev}, no other enemies in the area`));
          break;
        }
        this.updateTrack(world);
        const age = t - this.track.time;
        const leader = this.leader();
        if (this.leash !== null && leader) {
          // Kaçan hedefi düşman bölgesine kadar kovalama (alarm çifti eskortu 74 km öteye kadar izliyordu); dalaştaysa
          // bir süre daha
          const est = this.trackEstimate(t, _est);
          const d = Math.min(world.distToTeam(this.team, est), world.distToTeam(this.team, leader.pos));
          if (d > this.leash + (this.engaged ? 20000 : 0)) {
            this.setPhase('egress', world, L('hedef savunma bölgesinden çıktı', 'target left the defended zone'));
            break;
          }
        }
        // Arama: iz eskidi ve kol tahmini konuma vardı
        if (age > 8 && leader) {
          const est = this.trackEstimate(t, _est);
          if (this.searchStart < 0 && Math.hypot(est.x - leader.pos.x, est.z - leader.pos.z) < 3500) this.searchStart = t;
        } else this.searchStart = -1;
        if (!this.engaged && ((this.searchStart >= 0 && t - this.searchStart > 180) || age > 900)) {
          this.setPhase('egress', world, L('hedef bulunamadı', 'target not found'));
        }
        break;
      }
      case 'escort': {
        const esc = p.targetFlightId !== null ? world.flightById(p.targetFlightId) : undefined;
        const gone = (f: FlightGroup | undefined) => !f || f.phase === 'done' || f.phase === 'landing' || f.alive.length === 0;
        if (gone(esc) && this.packageId) {
          // Korunan kol düştü ya da döndü: paketteki başka bir saldırı kolunu korumaya geç (eve dönüp onu yalnız bırakıyordu)
          const next = world.flights.find((f) => f !== this && f.packageId === this.packageId && f.plan.type !== 'escort' &&
            !gone(f) && f.phase !== 'rtb');
          if (next) {
            p.targetFlightId = next.id;
            this.escortOf = next;
            world.log(L(`${this.name}: korunan kol kayıp, ${next.name} kolunu korumaya geçiyor`, `${this.name}: escorted flight lost, now covering ${next.name} flight`), this.team, 'ops');
            break;
          }
        }
        if (gone(esc)) {
          this.setPhase('rtb', world);
          world.log(L(`${this.name}: eskort görevi bitti, üsse dönüyor`, `${this.name}: escort complete, returning to base`), this.team, 'ops');
        }
        break;
      }
      case 'levelBomb': {
        const loaded = alive.some((m) => m.bombCount > 0);
        if (this.bomb.released && (!loaded || t - this.bomb.releaseTime > 14)) this.setPhase('egress', world, L('bombalar atıldı', 'bombs away'));
        if (t - this.actionStart > 360) this.setPhase('egress', world, L('süre aşıldı', 'time limit reached'));
        break;
      }
      case 'diveBomb':
      case 'attack': {
        const busy = alive.some((m) => !m.brain.detached && !m.brain.attack.done);
        if (!busy || t - this.actionStart > 320) this.setPhase('egress', world, L('saldırı tamamlandı', 'attack complete'));
        break;
      }
      case 'ferry':
        break;
    }
  }

  /** Avcı kolları için angajman kararı ve hedef dağıtımı. */
  private assignTargets(world: World): void {
    this.assigned.clear();
    if (!this.isFighterFlight()) {
      this.engaged = false;
      return;
    }
    const p = this.plan;
    const t = world.time;
    const alive = this.alive.filter((m) => m.airborne && !m.brain.detached);
    const offensivePhase = this.phase === 'action' || this.phase === 'enroute' || this.phase === 'formup';
    const escortees = p.type === 'escort' && p.targetFlightId !== null ? world.flightById(p.targetFlightId)?.alive ?? [] : [];
    // Paketteki dost kollar da korunur (eskort avcılarıyla uğraşan kol, bombardımana giden kolu kollar)
    const pkg = this.packageId ? world.flights.filter((f) => f !== this && f.packageId === this.packageId && f.phase !== 'done') : [];
    const protect = [...alive, ...escortees, ...pkg.flatMap((f) => f.alive)];

    const candidates: Aircraft[] = [];
    for (const c of this.contacts.values()) {
      const e = world.aircraftById(c.id);
      if (!e || !e.airborne) continue;
      const threatening = !!e.brain.target && protect.includes(e.brain.target) && distToAny(e, protect) < 2500;
      let ok = false;
      if (p.roe === 'avoid') ok = false;
      else if (p.roe === 'defensive' || !offensivePhase) ok = threatening;
      else {
        switch (p.type) {
          case 'cap': {
            const c0 = p.targetPos;
            ok = threatening || (!!c0 && Math.hypot(e.pos.x - c0.x, e.pos.z - c0.z) < p.patrolRadius * 1.8);
            break;
          }
          case 'sweep':
            ok = true;
            break;
          case 'intercept': {
            const est = this.trackEstimate(t, _est);
            ok = e.id === p.targetAircraftId || threatening || (e.flight !== null && e.flight.id === this.interceptFlightId) ||
              Math.hypot(e.pos.x - est.x, e.pos.z - est.z) < 8000;
            break;
          }
          case 'escort':
            ok = threatening || (escortees.length > 0 && distToAny(e, escortees) < 4500);
            break;
          default:
            ok = threatening;
        }
      }
      if (ok) candidates.push(e);
    }
    this.engaged = candidates.length > 0;
    if (this.engaged) this.lastEngage = t;
    if (!this.engaged) return;

    // Görev dağılımı. Otomatikte bombardıman ve eskort birlikte görülürse ilk çift (lider ve kanat adamı) eskort
    // avcılarını bağlar, diğerleri bombardımana gider: hepsi eskortlarla uğraşınca bombardıman uçaklarına kimse
    // kalmıyordu (Britanya Muharebesi'nde RAF da böyle bölünürdü).
    const hasBombers = candidates.some((e) => e.spec.role !== 'fighter');
    const hasFighters = candidates.some((e) => e.spec.role === 'fighter');
    const autoSplit = hasBombers && hasFighters && alive.length >= 3 && (p.type === 'cap' || p.type === 'sweep' || p.type === 'intercept');
    const taskOf = (m: Aircraft): FlightTask => {
      const t = p.task ?? 'auto';
      if (t !== 'auto') return t;
      return autoSplit ? (Math.floor(m.slot / 2) === 0 ? 'fighters' : 'bombers') : 'auto';
    };
    const counts = new Map<number, number>();
    for (const m of alive) {
      if (m.spec.role !== 'fighter' || !m.armed) continue;
      if (p.doctrine === 'cover' && this.wingLeaderOf(m)) continue;
      const task = taskOf(m);
      let best: Aircraft | null = null;
      let bestScore = Infinity;
      for (const e of candidates) {
        let score = m.pos.distanceTo(e.pos);
        // Hasarlı düşmanı bitir
        if (isCrippled(e)) score -= 900;
        const bomber = e.spec.role !== 'fighter';
        if (task === 'bombers') {
          // Bombardımana giden: avcıyla yalnız kendisine saldıranla çatışır
          if (bomber) score -= 4000;
          else if (!(e.brain.target === m && m.pos.distanceTo(e.pos) < 1500)) score += 4000;
        } else if (task === 'fighters') {
          // Eskortlarla uğraşan: önce avcılar; bombardımana ancak avcı kalmayınca
          score += bomber ? 3000 : -1500;
        } else if (bomber) score -= p.type === 'escort' ? 300 : 1500;
        if (e.brain.target && protect.includes(e.brain.target)) score -= 1200;
        if (e.id === p.targetAircraftId) score -= 2500;
        if (m.brain.target === e) score -= 900;
        score += (counts.get(e.id) ?? 0) * 1300;
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (best) {
        this.assigned.set(m.id, best.id);
        counts.set(best.id, (counts.get(best.id) ?? 0) + 1);
      }
    }
  }
}

function distToAny(e: Aircraft, list: Aircraft[]): number {
  let d = Infinity;
  for (const a of list) d = Math.min(d, a.pos.distanceTo(e.pos));
  return d;
}
