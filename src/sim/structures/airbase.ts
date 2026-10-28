// Hava üssü: hangar envanteri, kalkış sırası, iniş sırası (bekleme paterni), bakım ve pist hasarı.

import { Vector3 } from 'three';
import type { Structure } from './structure';
import type { World } from '../world';
import type { FlightGroup } from '../ai/flightGroup';
import { SPECS, type Loadout } from '../aircraft/specs';
import type { BeltId } from '../aircraft/ammo';
import { footprintStats, groundLevel, terrainEdits } from '../terrain';
import { L } from '../../i18n';

export type AirframeStatus = 'ready' | 'servicing' | 'airborne';

/** Üs tesisleri (inşa edilen geliştirmeler). */
export type BaseUpgrade = 'workshop' | 'hangars' | 'revetments';

export const BASE_UPGRADES: Record<BaseUpgrade, { name: string; desc: string; time: number }> = {
  workshop: { name: L('Bakım atölyesi', 'Maintenance workshop'), desc: L('Onarım ve bakım süresi %40 kısalır.', 'Repair and servicing take 40% less time.'), time: 90 },
  hangars: { name: L('Ek hangarlar', 'Extra hangars'), desc: L('Hangar kapasitesi +12 uçak.', 'Hangar capacity +12 aircraft.'), time: 120 },
  revetments: { name: L('Toprak siperler', 'Earth revetments'), desc: L('Apronda bekleyen uçaklar bombardımanda çok daha az zarar görür.', 'Aircraft parked on the apron take far less damage from bombing.'), time: 80 },
};

/** Hangardaki tek bir uçak gövdesi ve pilotu. Görevden göreve tecrübe ve aşınma taşır. */
export interface Airframe {
  id: number;
  specId: string;
  team: number;
  status: AirframeStatus;
  readyAt: number;
  /** Son görevden kalan hasar (onarım süresini uzatır). */
  wear: number;
  skill: number;
  kills: number;
  sorties: number;
  aircraftId: number | null;
}

export interface TakeoffRequest {
  airframe: Airframe;
  flight: FlightGroup;
  slot: number;
  loadoutId: string;
  /** Serbest yük düzeni. */
  loadout?: Loadout;
  fuelFrac: number;
  belt?: BeltId;
  /** Personel havuzundan ayrılan mürettebat. */
  crew?: number;
}

/** Arazi taramasıyla seçilmiş iniş yaklaşması. */
export interface ApproachPlan {
  /** +1: pist yönünde in, -1: ters yönde in. */
  sign: 1 | -1;
  finalDist: number;
  glideTan: number;
  /** Seçilen koridorda araziye en kötü pay (m, negatif = çarpışma riski). */
  margin: number;
}

let nextAirframeId = 1;

/** Video kaydı: aynı dünya yeniden kurulunca kimlikler de aynı olsun (yalnız dünya yokken çağrılır). */
export function resetAirframeIds(): void {
  nextAirframeId = 1;
}

/** Kayıttan yüklenen uçak gövdelerinin kimlikleriyle çakışmasın. */
export function reserveAirframeIds(maxId: number): void {
  nextAirframeId = Math.max(nextAirframeId, maxId + 1);
}

export function newAirframe(specId: string, team: number, skill?: number): Airframe {
  return {
    id: nextAirframeId++, specId, team, status: 'ready', readyAt: 0, wear: 0,
    skill: skill ?? 0.6 + Math.random() * 0.5, kills: 0, sorties: 0, aircraftId: null,
  };
}

/** Pist yarı uzunluğu ve yarı genişliği (m). */
export const RUNWAY_HALF = 1100;
export const RUNWAY_HALF_W = 30;
/** Teker koyma noktası pist başından bu kadar içeride (m). */
export const TOUCHDOWN_IN = 250;
/** Aynı anda yaklaşmada olabilecek uçak sayısı. */
const MAX_APPROACHING = 2;

/** Bir yaklaşma koridorunda süzülüş yolunun araziyi aşma payı (m). Negatif: tepeye çarpar. */
export function corridorMargin(
  cx: number, cz: number, elev: number, heading: number, sign: 1 | -1, glideTan: number, dist: number,
): number {
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const dx = fx * sign;
  const dz = fz * sign;
  const tdU = -sign * (RUNWAY_HALF - TOUCHDOWN_IN);
  const tx = cx + fx * tdU;
  const tz = cz + fz * tdU;
  let margin = Infinity;
  for (let x = 400; x <= dist + 2500; x += 150) {
    const g = groundLevel(tx - dx * x, tz - dz * x);
    margin = Math.min(margin, elev + Math.min(x, dist) * glideTan - g - 70);
  }
  return margin;
}

/** Kalkış koridorunda %6 tırmanışın araziyi aşma payı. */
export function departureMargin(cx: number, cz: number, elev: number, heading: number, sign: 1 | -1): number {
  const dx = Math.sin(heading) * sign;
  const dz = -Math.cos(heading) * sign;
  const ex = cx + dx * RUNWAY_HALF;
  const ez = cz + dz * RUNWAY_HALF;
  let margin = Infinity;
  for (let x = 0; x <= 7000; x += 150) margin = Math.min(margin, elev + 30 + x * 0.06 - groundLevel(ex + dx * x, ez + dz * x));
  return margin;
}

/** Pist yönünün uygunluğu: en iyi iniş koridoru ile en iyi kalkış koridorunun zayıf olanı. */
export function runwayScore(cx: number, cz: number, elev: number, heading: number): number {
  let land = -Infinity;
  for (const sign of [1, -1] as const) {
    for (const deg of [4, 5.5, 7]) {
      land = Math.max(land, corridorMargin(cx, cz, elev, heading, sign, Math.tan((deg * Math.PI) / 180), 4200) - (deg - 4) * 15);
    }
  }
  const dep = Math.max(departureMargin(cx, cz, elev, heading, 1), departureMargin(cx, cz, elev, heading, -1));
  return Math.min(land, dep + 100);
}

/** Tercih edilen yön uygunsa onu, değilse koridorları en iyi açan yönü seçer. */
export function bestRunwayHeading(cx: number, cz: number, elev: number, preferred: number): number {
  if (runwayScore(cx, cz, elev, preferred) >= 0) return preferred;
  let best = preferred;
  let bestScore = -Infinity;
  for (let d = 0; d < 180; d += 10) {
    const h = (d * Math.PI) / 180;
    const sc = runwayScore(cx, cz, elev, h);
    if (sc > bestScore) {
      bestScore = sc;
      best = h;
    }
  }
  return best;
}

export class Airbase {
  readonly inventory: Airframe[] = [];
  readonly upgrades = new Set<BaseUpgrade>();
  /** Süren tesis inşaatı. */
  job: { key: BaseUpgrade; left: number; total: number } | null = null;
  readonly takeoffQueue: TakeoffRequest[] = [];
  /** İniş izni bekleyenler (sıra). */
  readonly landingQueue: number[] = [];
  /** İniş izni almış, yaklaşmadaki uçaklar. */
  readonly approaching: number[] = [];
  runwayDamage = 0;
  /** Pistteki krater konumları (u: pist boyunca, v: enine). */
  readonly craters: { u: number; v: number }[] = [];
  /** Otomatik önleme (alarm) kolu. */
  readonly alert = { enabled: false, specId: 'hurricane1', count: 2, radius: 40000, cooldown: 0 };
  lostCount = 0;
  private nextTakeoff = 0;
  private side = 1;
  private clearedAt = new Map<number, number>();
  private lastTakeoffAt = -1e9;
  private approachCache: { version: number; plan: ApproachPlan } | null = null;
  private holdCache: { version: number; floor: number } | null = null;
  private departureCache: { version: number; sign: 1 | -1 } | null = null;
  private rendezvousCache: { version: number; pos: Vector3; floor: number } | null = null;

  constructor(readonly s: Structure) {}

  get dirX(): number {
    return Math.sin(this.s.heading);
  }

  get dirZ(): number {
    return -Math.cos(this.s.heading);
  }

  /** Pist koordinatından dünya noktası. u: merkezden pist boyunca, v: sağa. */
  runwayPoint(u: number, v = 0, out = new Vector3()): Vector3 {
    const dx = this.dirX;
    const dz = this.dirZ;
    return out.set(this.s.pos.x + dx * u - dz * v, this.s.pos.y, this.s.pos.z + dz * u + dx * v);
  }

  /** Dünya noktasının pist koordinatları. */
  toRunway(x: number, z: number): { u: number; v: number } {
    const rx = x - this.s.pos.x;
    const rz = z - this.s.pos.z;
    return { u: rx * this.dirX + rz * this.dirZ, v: -rx * this.dirZ + rz * this.dirX };
  }

  onRunway(x: number, z: number, margin = 0): boolean {
    const { u, v } = this.toRunway(x, z);
    return Math.abs(u) <= RUNWAY_HALF + margin && Math.abs(v) <= RUNWAY_HALF_W + 25 + margin;
  }

  /**
   * İniş koridoru: iki pist yönü × farklı son yaklaşma uzunlukları × süzülüş açıları denenir;
   * süzülüş yolunun araziyi en iyi aştığı seçilir (önce sığ açı ve uzun yaklaşma tercih edilir).
   */
  approach(): ApproachPlan {
    if (this.approachCache && this.approachCache.version === terrainEdits.version) return this.approachCache.plan;
    let best: ApproachPlan | null = null;
    const { x: cx, y: elev, z: cz } = this.s.pos;
    outer: for (const deg of [4, 5.5, 7]) {
      for (const dist of [5500, 4200, 3200]) {
        for (const sign of [1, -1] as const) {
          const glideTan = Math.tan((deg * Math.PI) / 180);
          const margin = corridorMargin(cx, cz, elev, this.s.heading, sign, glideTan, dist);
          const plan: ApproachPlan = { sign, finalDist: dist, glideTan, margin };
          if (!best || (best.margin < 0 && margin > best.margin)) best = plan;
          if (best.margin >= 0) break outer;
        }
      }
    }
    this.approachCache = { version: terrainEdits.version, plan: best! };
    return best!;
  }

  /** Kalkış yönü: pist sonundaki tırmanış koridoru araziyi en iyi aşan yön (+1 pist yönü, -1 ters). */
  departureSign(): 1 | -1 {
    if (this.departureCache && this.departureCache.version === terrainEdits.version) return this.departureCache.sign;
    let best: 1 | -1 = 1;
    let bestMargin = -Infinity;
    for (const sign of [1, -1] as const) {
      const margin = departureMargin(this.s.pos.x, this.s.pos.z, this.s.pos.y, this.s.heading, sign);
      if (margin > bestMargin) {
        bestMargin = margin;
        best = sign;
      }
    }
    this.departureCache = { version: terrainEdits.version, sign: best };
    return best;
  }

  takeoffHeading(): number {
    return this.departureSign() === 1 ? this.s.heading : this.s.heading + Math.PI;
  }

  /** Kalkış koşusunun başladığı nokta. */
  takeoffStart(lateral: number, out = new Vector3()): Vector3 {
    const sign = this.departureSign();
    return this.runwayPoint(-sign * (RUNWAY_HALF - 70), lateral * sign, out);
  }

  /** Toplanma noktası: üssün çevresinde arazisi en alçak bölge. */
  rendezvousPoint(out = new Vector3()): { pos: Vector3; floor: number } {
    if (!this.rendezvousCache || this.rendezvousCache.version !== terrainEdits.version) {
      let bestP = this.runwayPoint(RUNWAY_HALF + 3200);
      let bestMax = Infinity;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = this.s.pos.x + Math.cos(a) * 3800;
        const z = this.s.pos.z + Math.sin(a) * 3800;
        const st = footprintStats(x, z, 2200, 2200, 0);
        if (st.outside) continue;
        if (st.max < bestMax) {
          bestMax = st.max;
          bestP = new Vector3(x, 0, z);
        }
      }
      this.rendezvousCache = { version: terrainEdits.version, pos: bestP, floor: bestMax + 400 };
    }
    out.copy(this.rendezvousCache.pos);
    return { pos: out, floor: this.rendezvousCache.floor };
  }

  /** İniş yönündeki teker koyma noktası. */
  touchdownPoint(out = new Vector3()): Vector3 {
    const sign = this.approach().sign;
    return this.runwayPoint(-sign * (RUNWAY_HALF - TOUCHDOWN_IN), 0, out);
  }

  /** İniş yönü (pusula, radyan). */
  landingHeading(): number {
    return this.approach().sign === 1 ? this.s.heading : this.s.heading + Math.PI;
  }

  /** Uçağın iniş eksenine göre konumu (teker koyma noktasından, yaklaşmada negatif). */
  alongApproach(x: number, z: number): number {
    const p = this.approach();
    return (this.toRunway(x, z).u + p.sign * (RUNWAY_HALF - TOUCHDOWN_IN)) * p.sign;
  }

  get usable(): boolean {
    return this.s.active && this.runwayDamage < 0.4;
  }

  get capacity(): number {
    return 24 + (this.upgrades.has('hangars') ? 12 : 0);
  }

  /** Bakım süresi çarpanı. */
  get serviceMul(): number {
    return this.upgrades.has('workshop') ? 0.6 : 1;
  }

  startUpgrade(key: BaseUpgrade): boolean {
    if (this.job || this.upgrades.has(key) || !this.s.active) return false;
    const t = BASE_UPGRADES[key].time;
    this.job = { key, left: t, total: t };
    return true;
  }

  /** Üsse bağlı fabrikanın yeri: hangar sırasının arkası. */
  factoryPad(out = new Vector3()): Vector3 {
    return this.runwayPoint(0, 700, out);
  }

  readyOf(specId: string): Airframe[] {
    return this.inventory.filter((a) => a.specId === specId && a.status === 'ready');
  }

  get freeSlots(): number {
    return this.capacity - this.inventory.length;
  }

  addAirframe(af: Airframe): boolean {
    if (this.inventory.length >= this.capacity) return false;
    this.inventory.push(af);
    return true;
  }

  removeAirframe(af: Airframe): void {
    const i = this.inventory.indexOf(af);
    if (i >= 0) this.inventory.splice(i, 1);
  }

  requestTakeoff(req: TakeoffRequest): void {
    req.airframe.status = 'airborne';
    this.takeoffQueue.push(req);
  }

  /** İniş talebi. 0 = iniş izni var, >0 = beklemede (sıra). */
  requestLanding(acId: number): number {
    if (this.approaching.includes(acId)) return 0;
    let i = this.landingQueue.indexOf(acId);
    if (i < 0) {
      this.landingQueue.push(acId);
      i = this.landingQueue.length - 1;
    }
    return i + 1;
  }

  cancelLanding(acId: number): void {
    const i = this.landingQueue.indexOf(acId);
    if (i >= 0) this.landingQueue.splice(i, 1);
    const j = this.approaching.indexOf(acId);
    if (j >= 0) this.approaching.splice(j, 1);
  }

  /** Bekleme paterni: ilk yaklaşma noktasının ötesinde, iniş ekseninin yanında. */
  holdCenter(out = new Vector3()): Vector3 {
    const p = this.approach();
    const td = this.touchdownPoint(out);
    const dx = this.dirX * p.sign;
    const dz = this.dirZ * p.sign;
    const back = p.finalDist + 1200;
    return out.set(td.x - dx * back - dz * 1400, td.y, td.z - dz * back + dx * 1400);
  }

  holdAltitude(index: number): number {
    if (!this.holdCache || this.holdCache.version !== terrainEdits.version) {
      const c = this.holdCenter();
      const st = footprintStats(c.x, c.z, 2400, 2400, 0);
      const p = this.approach();
      const iafAlt = this.s.pos.y + p.finalDist * p.glideTan;
      this.holdCache = { version: terrainEdits.version, floor: Math.max(st.max + 300, iafAlt + 150) };
    }
    return this.holdCache.floor + Math.min(index, 8) * 160;
  }

  update(world: World, dt: number): void {
    const t = world.time;
    if (this.job && this.s.active) {
      this.job.left -= dt;
      if (this.job.left <= 0) {
        this.upgrades.add(this.job.key);
        world.log(L(`${this.s.name}: ${BASE_UPGRADES[this.job.key].name} tamamlandı`, `${this.s.name}: ${BASE_UPGRADES[this.job.key].name} complete`), this.s.team, 'build');
        this.job = null;
      }
    }
    for (const af of this.inventory) {
      if (af.status === 'servicing' && t >= af.readyAt) af.status = 'ready';
    }
    if (this.runwayDamage > 0) {
      this.runwayDamage = Math.max(0, this.runwayDamage - dt * 0.0035);
      const keep = Math.ceil(this.runwayDamage * 30);
      if (this.craters.length > keep) this.craters.splice(0, this.craters.length - keep);
    }
    if (!this.s.active) return;

    // İniş sırası: yaklaşmadakiler temizlenir, önceki son yaklaşmanın yarısını geçince sıradaki izin alır
    for (let i = this.approaching.length - 1; i >= 0; i--) {
      const id = this.approaching[i];
      const a = world.aircraftById(id);
      if (!a || a.status !== 'flying' || a.brain.ops.mode !== 'landing' || t - (this.clearedAt.get(id) ?? t) > 300) {
        this.approaching.splice(i, 1);
        this.clearedAt.delete(id);
      }
    }
    for (let i = this.landingQueue.length - 1; i >= 0; i--) {
      const a = world.aircraftById(this.landingQueue[i]);
      if (!a || a.status !== 'flying') this.landingQueue.splice(i, 1);
    }
    if (this.landingQueue.length > 0 && this.usable && t - this.lastTakeoffAt > 6 && this.canClearNext(world)) {
      const id = this.landingQueue.shift()!;
      this.approaching.push(id);
      this.clearedAt.set(id, t);
    }

    // Kalkış sırası
    if (this.takeoffQueue.length > 0 && t >= this.nextTakeoff && this.usable && !this.runwayBusyForTakeoff(world)) {
      const req = this.takeoffQueue.shift()!;
      const spec = SPECS[req.airframe.specId];
      const big = spec.engines > 1;
      const lateral = big ? 0 : this.side * 11;
      this.side = -this.side;
      world.spawnFromAirframe(req, this, lateral);
      this.lastTakeoffAt = t;
      this.nextTakeoff = t + (big ? 9 : 4.5);
    }
  }

  private canClearNext(world: World): boolean {
    if (this.approaching.length === 0) return true;
    if (this.approaching.length >= MAX_APPROACHING) return false;
    const last = world.aircraftById(this.approaching[this.approaching.length - 1]);
    if (!last) return true;
    if (last.onGround) return true;
    const st = last.brain.ops.stage;
    return (st === 'final' || st === 'flare') && this.alongApproach(last.pos.x, last.pos.z) > -this.approach().finalDist * 0.75;
  }

  private runwayBusyForTakeoff(world: World): boolean {
    for (const id of this.approaching) {
      const c = world.aircraftById(id);
      if (!c) continue;
      if (c.onGround) return true;
      if (c.brain.ops.stage === 'final' || c.brain.ops.stage === 'flare') {
        if (this.alongApproach(c.pos.x, c.pos.z) > -2500) return true;
      }
    }
    return false;
  }

  /** Bomba isabeti: pist hasarı ve krater. */
  bombHit(x: number, z: number, blast: number, damage: number): boolean {
    const { u, v } = this.toRunway(x, z);
    if (Math.abs(u) > RUNWAY_HALF + blast || Math.abs(v) > RUNWAY_HALF_W + blast) return false;
    this.runwayDamage = Math.min(1, this.runwayDamage + damage / 900);
    if (Math.abs(v) < RUNWAY_HALF_W + 10) this.craters.push({ u, v });
    if (this.craters.length > 40) this.craters.shift();
    return true;
  }
}
