// Uçak beyni: kol görevi (strateji) → davranış (taktik) → otopilot (pilotaj).
// Öncelik sırası: yer operasyonu > ilk tırmanış > acil durum > iniş > tehditten kaçış > avcı çatışması > kol görevi.

import { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { World } from '../world';
import type { Airbase } from '../structures/airbase';
import { fly, newCommand, resetCommand, type FlyCommand } from '../aircraft/pilot';
import { engineRunning, glideRatio, stallSpeed } from '../aircraft/flightModel';
import { groundLevel } from '../terrain';
import { enginesDead, isCrippled } from '../aircraft/damage';
import { combatCommand, coverCommand } from './combat';
import { diveBombCommand } from './strike';
import { attackCommand } from './attack';
import { bombRunLeader, stickDrop } from './levelBomb';
import { perceive, findThreat } from './perception';
import { climbout, groundUpdate, landing, newOps, type OpsState } from './ops';
import { FORMATION_NAMES, escortWeave, holdFormation, slotOffset } from './formation';
import { headingWithAlt, orbitDir, terrainFollow } from './nav';
import { avoidAA, flakWeave } from './aaEvade';
import { speedFor } from './missions';
import type { FlightContact, FlightGroup } from './flightGroup';
import { clamp } from '../../core/math';

export type AttackPhase =
  | 'wait' | 'ingress' | 'dive' | 'pullout' | 'reposition' | 'approach' | 'popup' | 'extend' | 'turn' | 'rally';

export interface CombatState {
  /** attack: saldırı · extend: uzaklaş · climb: avantaj için tırman (enerji avcısı). */
  phase: 'attack' | 'extend' | 'climb';
  phaseTime: number;
  jinkTime: number;
  jinkDir: Vector3;
  /** Pilotun takip hatası: nişan yönüne eklenen, yavaşça değişen sapma. */
  aimNoise: Vector3;
  aimNoiseGoal: Vector3;
  aimNoiseTime: number;
  /** Kafa kafaya geçişte ateş kararı (geçiş başına bir kez verilir). null = karar yok. */
  headOnShoot: boolean | null;
  /** Öne dönüş (lead turn) için seçilen yan (+1 sağ, -1 sol). */
  leadSide: number;
  /** Uzaklaşırken hızı irtifaya çeviriyor (dikine kopuş; başlayınca hız düşene kadar sürer). */
  zoom: boolean;
  /** Bombardıman kutusuna önden saldırı: 0 öne geçiyor, 1 karşıdan saldırıyor, 2 geçişten sonra aşağı kopuyor. */
  boxRun: 0 | 1 | 2;
  boxTime: number;
  /** Geçiş sonrası kopuş yönü (kutudaki uçaklardan en uzak boşluk). */
  boxDir: Vector3;
  /** Kanat adamı: liderin son görülen önden saldırı adımı (lider yeni geçişe başlayınca o da katılır) */
  boxLead: number;
}

export interface AttackState {
  phase: AttackPhase;
  started: boolean;
  done: boolean;
  passes: number;
  aimOffset: Vector3;
  impact: Vector3;
  aimPoint: Vector3;
  phaseTime: number;
  rocketsPass: number;
  bombsPass: number;
  lastShot: number;
  lastBomb: number;
  targetId: number | null;
}

const _p = new Vector3();

export class Brain {
  /** Arayüzde gösterilen anlık davranış. */
  status = 'Hazır';
  target: Aircraft | null = null;
  threat: Aircraft | null = null;
  fireGuns = false;
  /** Hava hedefine ateşte hedef uzaklığı (m; 0 = hava hedefi yok): kısa cephaneli top yakına saklanır. */
  aimRange = 0;
  releaseBomb = false;
  /** Pike bombardımanında tüm bombaları tek seferde bırak. */
  releaseAll = false;
  fireRocket = false;
  /** Koldan koptu (hasar, yakıt): tek başına üsse dönüyor. */
  detached = false;
  /** Vurulduysa mürettebatın paraşütle atlayacağı zaman. */
  bailAt = Infinity;
  detachReason = '';
  readonly combat: CombatState = {
    phase: 'attack', phaseTime: 0, jinkTime: 0, jinkDir: new Vector3(),
    aimNoise: new Vector3(), aimNoiseGoal: new Vector3(), aimNoiseTime: 0, headOnShoot: null, leadSide: 1, zoom: false, boxRun: 0, boxTime: 0, boxLead: 0, boxDir: new Vector3(),
  };
  readonly attack: AttackState = {
    phase: 'wait', started: false, done: false, passes: 0, aimOffset: new Vector3(), impact: new Vector3(),
    aimPoint: new Vector3(), phaseTime: 0, rocketsPass: 0, bombsPass: 0, lastShot: -1e9, lastBomb: -1e9, targetId: null,
  };
  readonly ops: OpsState = newOps();
  readonly cmd = newCommand();
  /** Kolu olmayan uçağın kendi temasları. */
  readonly contacts = new Map<number, FlightContact>();
  private perceiveTimer = Math.random() * 0.5;
  private emergencyTimer = Math.random();
  private lastTarget: Aircraft | null = null;

  beginTakeoff(base: Airbase): void {
    this.ops.mode = 'takeoff';
    this.ops.baseId = base.s.id;
  }

  beginLanding(base: Airbase): void {
    const ops = this.ops;
    if (ops.mode === 'landing' && ops.baseId === base.s.id) return;
    ops.mode = 'landing';
    ops.baseId = base.s.id;
    ops.stage = 'hold';
    ops.queue = 99;
    ops.requestTimer = 0;
    ops.goArounds = 0;
  }

  detach(ac: Aircraft, world: World, reason: string): void {
    if (this.detached) return;
    this.detached = true;
    this.detachReason = reason;
    world.log(`${ac.callsign}: ${reason}, koldan ayrılıp üsse dönüyor`, ac.team, 'combat');
  }

  groundUpdate(ac: Aircraft, world: World, dt: number): void {
    this.fireGuns = this.releaseBomb = this.releaseAll = this.fireRocket = false;
    this.aimRange = 0;
    groundUpdate(ac, this, world, dt);
  }

  update(ac: Aircraft, world: World, dt: number): void {
    this.fireGuns = this.releaseBomb = this.releaseAll = this.fireRocket = false;
    this.aimRange = 0;
    const fl = ac.flight;
    const contacts = fl ? fl.contacts : this.contacts;

    this.perceiveTimer -= dt;
    if (this.perceiveTimer <= 0) {
      this.perceiveTimer = 0.45 + Math.random() * 0.15;
      perceive(ac, world, this.contacts);
      this.threat = findThreat(ac, world, contacts);
    }
    if (this.threat && !this.threat.airborne) this.threat = null;

    this.emergencyTimer -= dt;
    if (this.emergencyTimer <= 0) {
      this.emergencyTimer = 1;
      this.checkEmergency(ac, world);
    }

    const cmd = this.cmd;
    resetCommand(cmd, ac);
    const s = ac.spec;
    const isFighter = s.role === 'fighter';
    const armed = ac.armed;

    // Kolun atadığı hedef
    if (fl && isFighter && !this.detached && fl.engaged) {
      const tid = fl.assigned.get(ac.id);
      if (tid !== undefined) this.target = world.aircraftById(tid) ?? null;
      else if (!fl.wingLeaderOf(ac) || fl.plan.doctrine !== 'cover') this.target = null;
    } else this.target = null;
    if (this.target && !this.target.airborne) this.target = null;
    if (this.target !== this.lastTarget) {
      this.combat.phase = 'attack';
      this.combat.phaseTime = 0;
      if (this.target && !this.lastTarget) world.logEngagement(ac, this.target);
      this.lastTarget = this.target;
    }

    if (ac.hasTank && (this.threat || (fl?.engaged && isFighter))) {
      ac.jettisonTanks();
      world.log(`${ac.callsign} dış yakıt tanklarını attı`, ac.team, 'combat');
    }

    if (this.ops.mode === 'climbout') {
      climbout(ac, this, cmd);
      fly(ac, cmd, dt);
      return;
    }

    const committedAttack = this.attack.phase === 'dive' || this.attack.phase === 'pullout';
    const canEvade = s.role !== 'bomber' && !committedAttack;
    const threatened = !!this.threat && canEvade && (isFighter || this.threat.pos.distanceTo(ac.pos) < 1000);

    if (this.ops.mode === 'landing') {
      const committed = this.ops.stage === 'final' || this.ops.stage === 'flare';
      if (!(threatened && armed && isFighter && !committed)) {
        landing(ac, this, world, dt, cmd);
        fly(ac, cmd, dt);
        return;
      }
    }

    if (threatened) {
      combatCommand(ac, this, world, dt, cmd);
    } else if (isFighter && armed && fl && fl.engaged && !this.detached && fl.plan.doctrine === 'cover' && fl.wingLeaderOf(ac)) {
      coverCommand(ac, this, fl.wingLeaderOf(ac)!, world, dt, cmd);
    } else if (isFighter && armed && this.target && !this.detached) {
      combatCommand(ac, this, world, dt, cmd);
    } else if (this.detached || !fl) {
      this.soloRtb(ac, world, cmd);
    } else {
      this.flightBehavior(ac, fl, world, dt, cmd);
    }
    fly(ac, cmd, dt);
  }

  private checkEmergency(ac: Aircraft, world: World): void {
    if (enginesDead(ac.damage) || ac.totalFuel <= 0) this.engineOut(ac, world);
    // Hasarlı, irtifa tutamayan uçak (güç kaybı, delik kanat): alçakta tutunma hızına yaklaşınca pilot uygun araziye
    // gövde üstü iner (üsse sürünürken yere değip "çakılıyordu")
    else if (ac.status === 'flying' && this.detached && isCrippled(ac) && this.ops.mode !== 'landing') {
      const agl = ac.pos.y - groundLevel(ac.pos.x, ac.pos.z);
      if (agl < 120 && ac.speed < stallSpeed(ac) * 1.35 && ac.fwd.y < 0.03) world.abandon(ac, 'forced');
    }
    if (ac.status !== 'flying' || this.detached || this.ops.mode === 'landing') return;
    if (enginesDead(ac.damage)) this.detach(ac, world, 'motor durdu');
    else if (ac.totalFuel <= 0) this.detach(ac, world, 'yakıt bitti');
    else if (isCrippled(ac)) this.detach(ac, world, 'ağır hasarlı');
    else if (!ac.flight && world.isBingo(ac)) this.detach(ac, world, 'yakıt azaldı');
  }

  /**
   * Motor durdu: süzülme menzili üsse yetmiyorsa pilot atlar (yeterince yüksekse) ya da uygun araziye zorunlu
   * iniş yapar. Üsse yetişirse motorsuz iner.
   */
  private engineOut(ac: Aircraft, world: World): void {
    const base = world.nearestAirbase(ac.team, ac.pos, (b) => b.usable);
    const agl = ac.pos.y - groundLevel(ac.pos.x, ac.pos.z);
    const reach = agl * glideRatio(ac.spec) * 0.75;
    const d = base ? Math.hypot(base.s.pos.x - ac.pos.x, base.s.pos.z - ac.pos.z) : Infinity;
    if (base && d < 3500 && agl < 350) {
      world.deadStickLanding(ac, base);
      return;
    }
    if (d > reach + 2000) world.abandon(ac, agl > 450 ? 'bail' : 'forced');
  }

  /** Tek başına en yakın kullanılabilir üsse dönüş. */
  private soloRtb(ac: Aircraft, world: World, cmd: FlyCommand): void {
    const home = world.airbaseById(ac.flight?.returnBaseId ?? ac.homeBaseId);
    const base = home && home.usable ? home : world.nearestAirbase(ac.team, ac.pos, (b) => b.usable);
    if (!base) {
      orbitDir(cmd.dir, ac, ac.pos, 2000, ac.pos.y);
      this.status = 'İnecek üs yok!';
      return;
    }
    const dx = base.s.pos.x - ac.pos.x;
    const dz = base.s.pos.z - ac.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 6500) {
      this.beginLanding(base);
      return;
    }
    if (!engineRunning(ac) || enginesDead(ac.damage)) {
      // Süzülüş: hız kaybetmemek için hafif burun aşağı
      const l = d || 1;
      cmd.dir.set(dx / l, -0.09, dz / l);
      cmd.maxG = 2;
      this.status = `Motor durdu: üsse süzülüyor (${(d / 1000).toFixed(1)} km)`;
      return;
    }
    // Önce düşman bombardıman kutusunun nişancı menzilinden yana ve aşağı çık: üs çoğu zaman bombardıman rotasının
    // ilerisinde, kutunun önünde aynı yöne sürünen hasarlı avcı dakikalarca dövülüyordu
    let gun: Aircraft | null = null;
    let gd = 1400;
    for (const e of world.aircraft) {
      if (e.team === ac.team || !e.airborne || e.spec.role !== 'bomber' || !e.turrets.length) continue;
      const de = e.pos.distanceTo(ac.pos);
      if (de < gd) {
        gd = de;
        gun = e;
      }
    }
    if (gun) {
      let px = -gun.fwd.z;
      let pz = gun.fwd.x;
      const pl = Math.hypot(px, pz) || 1;
      const side = (ac.pos.x - gun.pos.x) * px + (ac.pos.z - gun.pos.z) * pz >= 0 ? 1 : -1;
      px = (px / pl) * side;
      pz = (pz / pl) * side;
      cmd.dir.set(px, ac.pos.y - groundLevel(ac.pos.x, ac.pos.z) > 600 ? -0.35 : 0, pz);
      cmd.maxG = 3;
      this.status = `${this.detachReason ? this.detachReason[0].toUpperCase() + this.detachReason.slice(1) : 'Dönüş'}: nişancı menzilinden çıkıyor`;
      return;
    }
    headingWithAlt(cmd.dir, ac, dx, dz, Math.max(base.s.pos.y + 900, Math.min(ac.pos.y, 2500)));
    avoidAA(ac, world, cmd.dir, null);
    flakWeave(ac, world, cmd.dir);
    cmd.speed = ac.spec.cruiseSpeed;
    cmd.maxG = 2.5;
    this.status = `${this.detachReason ? this.detachReason[0].toUpperCase() + this.detachReason.slice(1) : 'Dönüş'}: ${base.s.name} (${(d / 1000).toFixed(1)} km)`;
  }

  private follow(ac: Aircraft, fl: FlightGroup, leader: Aircraft | null, cmd: FlyCommand): boolean {
    if (!leader || leader === ac) return false;
    const idx = Math.max(fl.formationIndex(ac), 1);
    holdFormation(ac, leader, slotOffset(fl.plan.formation, idx, fl.spacing(ac)), cmd);
    if (fl.plan.lowLevel && (fl.phase === 'enroute' || fl.phase === 'action')) cmd.minAlt = fl.plan.agl * 0.6;
    this.status = `Formasyonda: ${FORMATION_NAMES[fl.plan.formation]} (${leader.callsign})`;
    return true;
  }

  private flightBehavior(ac: Aircraft, fl: FlightGroup, world: World, dt: number, cmd: FlyCommand): void {
    const leader = fl.leader();
    const isLeader = leader === ac;
    const s = ac.spec;
    switch (fl.phase) {
      case 'ground':
      case 'formup':
        if (isLeader || !leader) {
          orbitDir(cmd.dir, ac, fl.rendezvous, 1800, fl.rendezvousAlt);
          cmd.speed = s.cruiseSpeed * 0.85;
          cmd.maxG = 2.2;
          this.status = 'Toplanma noktasında kolu bekliyor';
        } else {
          this.follow(ac, fl, leader, cmd);
          this.status = `Kola katılıyor (${leader.callsign})`;
        }
        break;
      case 'enroute':
        if (isLeader) this.navRoute(ac, fl, cmd, world);
        else this.follow(ac, fl, leader, cmd);
        break;
      case 'action':
        this.missionAction(ac, fl, leader, isLeader, world, dt, cmd);
        break;
      case 'egress':
      case 'rtb':
        if (isLeader) this.navHome(ac, fl, world, cmd);
        else this.follow(ac, fl, leader, cmd);
        break;
      case 'landing':
      case 'done': {
        const base = world.airbaseById(fl.returnBaseId);
        if (base) this.beginLanding(base);
        else this.soloRtb(ac, world, cmd);
        break;
      }
    }
  }

  private navRoute(ac: Aircraft, fl: FlightGroup, cmd: FlyCommand, world: World): void {
    const p = fl.plan;
    // Paketteki izleyen kol: öndeki kolun arkasında kademeli uçar
    const lead = fl.packageLead(world);
    const ll = lead && lead !== fl ? lead.leader() : null;
    if (ll) {
      const k = Math.max(1, lead!.packageFlights(world).indexOf(fl));
      const row = Math.ceil(k / 2);
      const side = k % 2 === 1 ? 1 : -1;
      holdFormation(ac, ll, { right: side * 700 * row, back: 650 * row, up: p.lowLevel ? 0 : 60 * row }, cmd, p.lowLevel ? p.agl * 0.6 : undefined);
      this.status = `Paket: ${lead!.name} kolunu izliyor`;
      return;
    }
    const wp = fl.route[fl.routeIndex];
    if (!wp) return;
    const dx = wp.x - ac.pos.x;
    const dz = wp.z - ac.pos.z;
    if (p.lowLevel) {
      terrainFollow(cmd.dir, ac, dx, dz, p.agl);
      cmd.minAlt = p.agl * 0.6;
    } else headingWithAlt(cmd.dir, ac, dx, dz, p.altitude);
    avoidAA(ac, world, cmd.dir, world.planTargetPos(p));
    flakWeave(ac, world, cmd.dir);
    cmd.speed = this.flightSpeed(ac, fl, world);
    cmd.maxG = 2.5;
    const km = (Math.hypot(dx, dz) / 1000).toFixed(1);
    this.status = `İntikal: nokta ${fl.routeIndex + 1}/${fl.route.length} — ${km} km${p.lowLevel ? ' (alçak uçuş)' : ''}`;
  }

  /** Kol hızı: en yavaş üyenin (pakette en yavaş tipin) yetişebileceği hız. */
  private flightSpeed(ac: Aircraft, fl: FlightGroup, world?: World): number {
    let v = speedFor(ac.spec, fl.plan.speed);
    const flights = world && fl.phase === 'enroute' ? fl.packageFlights(world) : [fl];
    for (const f of flights) {
      for (const m of f.formed) v = Math.min(v, m.spec.vMax * 0.88, f === fl ? Infinity : speedFor(m.spec, fl.plan.speed));
    }
    return v;
  }

  private navHome(ac: Aircraft, fl: FlightGroup, world: World, cmd: FlyCommand): void {
    const base = world.airbaseById(fl.returnBaseId) ?? world.nearestAirbase(ac.team, ac.pos, (b) => b.usable);
    if (!base) return;
    const dx = base.s.pos.x - ac.pos.x;
    const dz = base.s.pos.z - ac.pos.z;
    const p = fl.plan;
    if (p.lowLevel && fl.phase === 'egress') {
      terrainFollow(cmd.dir, ac, dx, dz, p.agl);
      cmd.minAlt = p.agl * 0.6;
    } else headingWithAlt(cmd.dir, ac, dx, dz, Math.max(base.s.pos.y + 1200, Math.min(p.altitude, 3500)));
    avoidAA(ac, world, cmd.dir, null);
    flakWeave(ac, world, cmd.dir);
    cmd.speed = this.flightSpeed(ac, fl);
    cmd.maxG = 2.5;
    const reason = fl.rtbReason ? ` (${fl.rtbReason})` : '';
    this.status = `${fl.phase === 'egress' ? 'Hedeften çıkış' : 'Üsse dönüş'}${reason}: ${(Math.hypot(dx, dz) / 1000).toFixed(1)} km`;
  }

  private missionAction(
    ac: Aircraft, fl: FlightGroup, leader: Aircraft | null, isLeader: boolean, world: World, dt: number, cmd: FlyCommand,
  ): void {
    const p = fl.plan;
    const s = ac.spec;
    switch (p.type) {
      case 'cap':
      case 'sweep': {
        if (!isLeader) {
          this.follow(ac, fl, leader, cmd);
          break;
        }
        const center = p.targetPos ?? ac.pos;
        const gci = this.gciVector(ac, fl, world, center, p.patrolRadius * 2.5);
        if (gci) {
          headingWithAlt(cmd.dir, ac, gci.x - ac.pos.x, gci.z - ac.pos.z, Math.max(gci.y + 300, ac.pos.y - 300));
          cmd.speed = s.vMax * 0.9;
          this.status = 'Yer kontrolü radar temasına yönlendiriyor';
        } else {
          orbitDir(cmd.dir, ac, center, p.patrolRadius, p.altitude);
          cmd.speed = speedFor(s, 'eco');
          const left = Math.max(0, p.stationTime - (world.time - fl.stationStart));
          this.status = `${p.type === 'cap' ? 'Devriye' : 'Tarama'}: ${Math.ceil(left / 60)} dk kaldı`;
        }
        break;
      }
      case 'intercept': {
        if (!isLeader) {
          this.follow(ac, fl, leader, cmd);
          break;
        }
        const tgt = p.targetAircraftId !== null ? world.aircraftById(p.targetAircraftId) : undefined;
        const age = world.time - fl.track.time;
        fl.trackEstimate(world.time, _p);
        const R = ac.pos.distanceTo(_p);
        const horiz = Math.hypot(_p.x - ac.pos.x, _p.z - ac.pos.z);
        const name = tgt ? tgt.callsign : 'hedef';
        if (age > 8 && (horiz < 3500 || fl.searchStart >= 0)) {
          // İz eskidi ve tahmini konuma varıldı: çevrede ara
          orbitDir(cmd.dir, ac, _p, 4500, clamp(Math.max(_p.y, ac.pos.y - 300), groundLevel(ac.pos.x, ac.pos.z) + 600, 9000));
          cmd.speed = speedFor(s, 'cruise');
          cmd.maxG = 2.5;
          this.status = `Arama: ${name} ${Math.round(age)} sn'dir görülmedi`;
          break;
        }
        // Kesişme: hedefin ileride olacağı yere (iz tazeyse)
        const tgo = Math.min(R / Math.max(ac.speed + 40, 60), age < 8 ? 60 : 20);
        _p.addScaledVector(fl.track.vel, tgo);
        headingWithAlt(cmd.dir, ac, _p.x - ac.pos.x, _p.z - ac.pos.z, _p.y + 300);
        cmd.throttle = 1;
        cmd.speed = null;
        cmd.maxG = 3;
        const src = age < 3 ? '' : age < 20 ? ' · radar/gözcü izi' : ` · son iz ${Math.round(age)} sn önce`;
        this.status = `Önleme: ${name} (${(R / 1000).toFixed(1)} km)${src}`;
        break;
      }
      case 'escort': {
        const esc = p.targetFlightId !== null ? world.flightById(p.targetFlightId) : undefined;
        const el = esc?.leader();
        if (!el) {
          if (isLeader) orbitDir(cmd.dir, ac, ac.pos, 2000, ac.pos.y);
          else this.follow(ac, fl, leader, cmd);
          break;
        }
        // Her üye kendi formasyon yerini korunan kola göre tutar ve kolla birlikte zikzak çizer
        const idx = fl.formationIndex(ac);
        const so = idx > 0 ? slotOffset(fl.plan.formation, idx, fl.spacing(ac)) : { right: 0, back: 0, up: 0 };
        escortWeave(ac, el, { right: 650 + so.right, back: 250 + so.back, up: 450 + so.up }, fl.weave, isLeader, cmd);
        this.status = `Eskort: ${esc!.name} kolu`;
        break;
      }
      case 'levelBomb':
        if (isLeader) bombRunLeader(ac, this, world, cmd);
        else this.follow(ac, fl, leader, cmd);
        stickDrop(ac, this, world.time);
        break;
      case 'diveBomb':
        diveBombCommand(ac, this, world, dt, cmd);
        break;
      case 'attack':
        attackCommand(ac, this, world, dt, cmd);
        break;
      case 'ferry':
        if (isLeader) this.navRoute(ac, fl, cmd, world);
        else this.follow(ac, fl, leader, cmd);
        break;
    }
  }

  /** Yer kontrollü önleme: radar temasını devriye bölgesinde bulursa yön verir. */
  private gciVector(ac: Aircraft, fl: FlightGroup, world: World, center: Vector3, radius: number): Vector3 | null {
    const team = world.teams[ac.team];
    if (!team.research.has('gci') || fl.engaged) return null;
    let best: Vector3 | null = null;
    let bestD = Infinity;
    for (const c of team.intel.contacts.values()) {
      if (world.time - c.lastRadar > 12) continue;
      team.intel.estimate(c, world.time, _p);
      const dc = Math.hypot(_p.x - center.x, _p.z - center.z);
      if (dc > radius) continue;
      const d = _p.distanceTo(ac.pos);
      if (d < bestD) {
        bestD = d;
        best = _p.clone();
      }
    }
    if (best) best.y = clamp(best.y, 300, 9000);
    return best;
  }
}
