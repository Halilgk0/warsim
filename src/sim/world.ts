import { Vector3 } from 'three';
import { Aircraft, type AircraftOptions } from './aircraft/aircraft';
import { CONVERGENCE, SPECS, SPEC_LIST, type AircraftSpec, type Caliber, type GunSpec, type Loadout } from './aircraft/specs';
import { hitBoxOf, segmentHitsAircraft, type HitZone } from './aircraft/hitbox';
import { loadoutAllowed } from './aircraft/stores';
import { burnFuel, gearHeight, iasOf, stallSpeed, stepFlight } from './aircraft/flightModel';
import { applyHit, hasSealedTanks, isCrippled } from './aircraft/damage';
import type { BeltDef } from './aircraft/ammo';
import { updateTurrets } from './ai/gunner';
import { canTouchDown, touchDown } from './ai/ops';
import { FlightGroup } from './ai/flightGroup';
import { MISSION_NAMES, TASK_NAMES, TASK_SPLIT, defaultLoadout, type FlightTask, type MissionPlan, type MissionType, type Roe } from './ai/missions';
import type { FormationType } from './ai/formation';
import type { BeltId } from './aircraft/ammo';
import { Structure, STRUCTURE_DEFS, type StructureKind } from './structures/structure';
import { BASE_UPGRADES, bestRunwayHeading, newAirframe, runwayScore, type Airbase, type Airframe, type BaseUpgrade, type TakeoffRequest } from './structures/airbase';
import { Research, TECH_BY_ID } from './tech';
import { TeamIntel } from './intel';
import { Commander, alertScramble } from './commander';
import {
  BASE_UPGRADE_COST, KILL_REWARD, MINE_RATE, SELLERS, SELL_RATE, STRUCTURE_COST, STRUCTURE_REWARD, aircraftPrice, fmtMoney,
  oreRichness, researchCost, type LedgerEntry, type MarketOffer,
} from './economy';
import { flattenFootprint, footprintStats, groundLevel, lineOfSight, resetTerrainEdits, terrainHeight } from './terrain';
import { MAP_ID } from './mapData';
import { evaluateMission, type MissionReport } from './missionResult';
import { G, clamp, gauss, rand } from '../core/math';

/** Kendi yapılarından en fazla bu uzaklıkta inşa edilebilir (m). */
export const TERRITORY = 30000;
/** Son hava üssünü kaybeden tarafın yenisini kurmaya başlaması için süre (s); kuramazsa elenir. */
export const LAST_STAND = 300;
/**
 * Onarım: tam onarım inşaat bedelinin REPAIR_COST katı, REPAIR_TIME saniye sürer (hasarla orantılı); vurulan yapının
 * onarımı REPAIR_DELAY bekler. Baskınlar arasındaki hasarı geri getirir ama süren bir kuşatmayı silmez.
 */
export const REPAIR_COST = 0.8;
export const REPAIR_TIME = 21600;
export const REPAIR_DELAY = 600;

export type LogCategory = 'combat' | 'kill' | 'strike' | 'ops' | 'defense' | 'build' | 'research' | 'info';

export interface Team {
  id: number;
  name: string;
  color: string;
  research: Research;
  intel: TeamIntel;
  flightCounter: number;
  /** Bu taraf yapay zekâ ile mi yönetiliyor. */
  ai: boolean;
  personnel: Personnel;
  /** Kasa (kr) ve son hareketler. */
  money: number;
  ledger: LedgerEntry[];
  /** Toplam kazanç / harcama (istatistik). */
  earned: number;
  spent: number;
  /** Araştırmanın dokunmayacağı birikim (yapay zekâ maden ve asgari filo için para ayırırken). */
  reserve: number;
  /** Harekâttan elendi (hava üssü kalmadı). */
  eliminated: boolean;
  /** Deftere yazılmamış onarım gideri. */
  repairAcc: number;
  /** Hava üssü kalmadıysa elenmeye kadar kalan süre (s); null = üssü var. */
  lastStand: number | null;
  /** Gelir ölçümü: bu saniyenin geliri, son 60 saniyelik kovalar ve deftere yazılmamış maden geliri. */
  incomeAcc: number;
  incomeHist: number[];
  mineAcc: number;
}

/**
 * Personel (pilot ve mürettebat): evler barındırır (1 ev = 4 kişi). Her uçak mürettebatı kadar kişiyle kalkar;
 * yeterli kişi yoksa uçak hangarda kalır. Düşen uçağın mürettebatı kaybedilir, paraşütle kendi bölgesine inen
 * ya da kendi bölgesine zorunlu inen geri döner. Kayıplar konut kapasitesine kadar yavaşça yerine konur.
 */
export interface Personnel {
  /** Yaşayan personel (uçanlar dahil). */
  people: number;
  /** Uçuşta ya da kalkış sırasındaki mürettebat. */
  reserved: number;
  /** Konut kapasitesi. */
  capacity: number;
  /** Kayıpların yerine gelen personel birikimi. */
  recruit: number;
}

/** Kayıplar konut kapasitesine kadar bu hızla yerine konur (kişi/sn). */
const RECRUIT_RATE = 1 / 30;

export interface Bullet {
  pos: Vector3;
  prev: Vector3;
  vel: Vector3;
  life: number;
  team: number;
  /** Uçak kimliği; yapıdan atıldıysa -yapı kimliği. */
  ownerId: number;
  damage: number;
  caliber: Caliber;
  /** > 0: ömrü bitince patlar (kendini imha) — parçacık yarıçapı. */
  burstRadius: number;
  /** Yakınlık tapası: hedefin yanından geçerken patlar. */
  proximity: boolean;
  tracer: boolean;
  sourceName: string;
  /** Uçak sabit silahlarının mermi kuşağı (taret ve yer silahlarında yok). */
  belt?: BeltDef;
}

export interface Rocket {
  pos: Vector3;
  vel: Vector3;
  burn: number;
  life: number;
  team: number;
  damage: number;
  blastRadius: number;
  sourceName: string;
  /** Atan kol (görev sonucu için; 0 = yok). */
  flightId: number;
}

export interface Bomb {
  id: number;
  pos: Vector3;
  vel: Vector3;
  team: number;
  ownerName: string;
  /** Atan kol (görev sonucu için; 0 = yok). */
  flightId: number;
  blastRadius: number;
  damage: number;
  mass: number;
}

interface FlakShell {
  pos: Vector3;
  t: number;
  team: number;
  damage: number;
  radius: number;
  sourceName: string;
}

/** Paraşütle atlayan mürettebat. */
export interface Parachute {
  id: number;
  pos: Vector3;
  vel: Vector3;
  team: number;
  name: string;
  /** Atladıktan sonra geçen süre (önce serbest düşüş, sonra paraşüt açılır). */
  t: number;
  /** Bu paraşütün temsil ettiği kişi sayısı (personel hesabı). */
  people: number;
}

export type SimEvent =
  | { kind: 'airExplosion'; pos: Vector3; size: number }
  | { kind: 'debris'; pos: Vector3; vel: Vector3; count: number; size: number; burning: boolean }
  | { kind: 'groundExplosion'; pos: Vector3; size: number }
  | { kind: 'crash'; pos: Vector3 }
  | { kind: 'flak'; pos: Vector3; size: number }
  | { kind: 'hit'; pos: Vector3 }
  | { kind: 'groundHit'; pos: Vector3; water: boolean }
  | { kind: 'rocket'; pos: Vector3 }
  | { kind: 'structureDestroyed'; id: number };

export interface LogEntry {
  time: number;
  text: string;
  team: number | null;
  cat: LogCategory;
}

/** Görev paketindeki bir tip: kaç uçak, hangi yük ve mermi kuşağı. */
export interface LaunchGroup {
  specId: string;
  count: number;
  loadoutId?: string;
  belt?: BeltId;
  formation?: FormationType;
  roe?: Roe;
  /** Serbest yük düzeni (verilirse hazır yük yerine). */
  custom?: Loadout;
  /**
   * Görev dağılımı: bu sayıda uçak görevin ikincil işine (önlemede bombardıman uçaklarına, eskortta yakın eskort,
   * taarruzda uçaksavar bastırma), kalanı birincil işine ayrı kollar olarak kalkar. Yoksa kol kendiliğinden dağıtır.
   */
  split?: number | null;
}

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
  elevation: number;
}

const _d = new Vector3();
const _f = new Vector3();
const _v = new Vector3();
const _dir = new Vector3();
const _rt = new Vector3();
const _rs = new Vector3();
const _re = new Vector3();
const _gd = new Vector3();

function segmentHitsSphere(a: Vector3, b: Vector3, c: Vector3, r: number): boolean {
  _d.subVectors(b, a);
  _f.subVectors(a, c);
  const A = _d.lengthSq();
  const B = 2 * _f.dot(_d);
  const C = _f.lengthSq() - r * r;
  if (C <= 0) return true;
  if (A < 1e-9) return false;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  const t1 = (-B - sq) / (2 * A);
  const t2 = (-B + sq) / (2 * A);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

export class World {
  constructor() {
    // Her yeni dünya (yeni oyun, kayıt yükleme, senaryo) temiz araziyle başlar
    resetTerrainEdits();
  }

  time = 0;
  readonly teams: Team[] = [];
  readonly aircraft: Aircraft[] = [];
  readonly flights: FlightGroup[] = [];
  readonly structures: Structure[] = [];
  bullets: Bullet[] = [];
  rockets: Rocket[] = [];
  bombs: Bomb[] = [];
  parachutes: Parachute[] = [];
  /** Render katmanının tükettiği görsel olaylar. */
  events: SimEvent[] = [];
  readonly logs: LogEntry[] = [];
  readonly commanders: Commander[] = [];
  /** Oyuncunun tarafı. */
  playerTeam = 0;
  /** Personel kuralları (harekâtta açık; it dalaşı senaryolarında kapalı). */
  personnelEnabled = false;
  /** Para kuralları (harekâtta açık). */
  economyEnabled = false;
  /** Oyuncunun adı (komutan) ve kampanya kurulumu (kayıt ve arayüz için). */
  playerName = '';
  /** Dünyanın kurulduğu harita (kurulmadan önce terrain.loadMap ile yüklenmiş olmalı). */
  mapId = MAP_ID;
  setup: { enemies: number } | null = null;
  /** Harekâtın kazananı (haritada son kalan taraf); sürüyorsa null. */
  winner: number | null = null;
  private personnelTimer = 0;
  private flak: FlakShell[] = [];
  private acById = new Map<number, Aircraft>();
  private nextBombId = 1;
  private nextPackageId = 1;
  private nextChuteId = 1;
  private engageLogTimes = new Map<string, number>();
  private hitLogTimes = new Map<number, number>();
  private observeTimer = 0;
  private slowTimer = 0;
  /** Yapı adı sayaçları (kayıtla birlikte saklanır). */
  readonly nameCounters = new Map<string, number>();

  addTeam(name: string, color: string, initialTech: string[] = [], ai = false): Team {
    const t: Team = {
      id: this.teams.length, name, color, research: new Research(initialTech), intel: new TeamIntel(), flightCounter: 0, ai,
      personnel: { people: 0, reserved: 0, capacity: 0, recruit: 0 },
      money: 0, ledger: [], earned: 0, spent: 0, reserve: 0, eliminated: false, repairAcc: 0, lastStand: null, incomeAcc: 0, incomeHist: [], mineAcc: 0,
    };
    this.teams.push(t);
    // Araştırma başlarken ödenir; iptalde kısmi iade
    t.research.payer = (node) => {
      const price = node.specId && SPECS[node.specId] ? aircraftPrice(SPECS[node.specId]) : undefined;
      const cost = researchCost(node, price);
      if (this.economyEnabled && cost > 0 && t.money - cost < t.reserve) return null;
      return this.pay(t.id, cost, `Araştırma: ${node.specId ? SPECS[node.specId]?.abbr ?? node.name : node.name}`) ? (this.economyEnabled ? cost : 0) : null;
    };
    t.research.refunder = (amount) => this.earn(t.id, amount, 'Araştırma iptali (iade)');
    return t;
  }

  // ------------------------------------------------------------------ ekonomi

  /** Para kuralları açık mı (harekât). Kapalıyken her şey ücretsizdir. */
  canAfford(team: number, cost: number): boolean {
    return !this.economyEnabled || (this.teams[team]?.money ?? 0) >= cost;
  }

  /** Öde: yetmezse false (hiçbir şey düşülmez). */
  pay(team: number, cost: number, reason: string): boolean {
    if (!this.economyEnabled || cost <= 0) return true;
    const t = this.teams[team];
    if (!t || t.money < cost) return false;
    t.money -= cost;
    t.spent += cost;
    this.record(t, -cost, reason);
    return true;
  }

  earn(team: number, amount: number, reason: string): void {
    if (!this.economyEnabled || amount <= 0) return;
    const t = this.teams[team];
    if (!t) return;
    this.credit(t, amount);
    this.record(t, amount, reason);
  }

  /** Deftere yazmadan kasaya ekle (maden geliri her adımda akar; deftere toplu yazılır). */
  private credit(t: Team, amount: number): void {
    t.money += amount;
    t.earned += amount;
    t.incomeAcc += amount;
  }

  private record(t: Team, amount: number, reason: string): void {
    t.ledger.push({ time: this.time, amount, reason });
    if (t.ledger.length > 60) t.ledger.shift();
  }

  /** Saniyede bir: gelir kovası; maden geliri 30 sn'de bir tek satır olarak deftere. */
  private tickIncome(): void {
    for (const t of this.teams) {
      t.incomeHist.push(t.incomeAcc);
      if (t.incomeHist.length > 60) t.incomeHist.shift();
      t.incomeAcc = 0;
      if (t.mineAcc >= 1 && Math.floor(this.time) % 30 === 0) {
        this.record(t, t.mineAcc, 'Maden geliri');
        t.mineAcc = 0;
      }
      if (t.repairAcc >= 1 && Math.floor(this.time) % 30 === 0) {
        this.record(t, -Math.round(t.repairAcc), 'Onarım');
        t.repairAcc = 0;
      }
    }
  }

  /**
   * Harekât sonu: hava üssü kalmayan taraf LAST_STAND içinde yenisinin inşaatına başlamazsa (ya da hiç yapısı
   * kalmadıysa) elenir; haritada son kalan taraf kazanır.
   */
  private updateCampaign(): void {
    if (this.winner !== null) return;
    for (const t of this.teams) {
      if (t.eliminated) continue;
      let base = false;
      let any = false;
      for (const s of this.structures) {
        if (s.team !== t.id || s.destroyed) continue;
        any = true;
        if (s.kind === 'airbase') {
          base = true;
          break;
        }
      }
      if (base) {
        if (t.lastStand !== null) {
          t.lastStand = null;
          this.log(`${t.name}: yeni hava üssü kuruluyor, harekâtta kalıyor`, null, 'info');
        }
        continue;
      }
      if (!any) {
        this.eliminate(t);
        continue;
      }
      if (t.lastStand === null) {
        t.lastStand = LAST_STAND;
        this.log(`${t.name}: son hava üssü yıkıldı! ${LAST_STAND / 60} dk içinde yeni üs kurulmazsa elenecek`, null, 'defense');
      }
      t.lastStand -= 1;
      if (t.lastStand <= 0) this.eliminate(t);
    }
    const left = this.teams.filter((t) => !t.eliminated);
    if (left.length === 1 && this.teams.length > 1) {
      this.winner = left[0].id;
      this.log(`Harekât bitti: haritada son kalan ${left[0].name} kazandı!`, null, 'info');
    }
  }

  /** Taraf elenir: kalan yapıları terk edilir, havadaki uçakları tarafsız ülkelere iner (gözaltı). */
  private eliminate(t: Team): void {
    t.eliminated = true;
    t.lastStand = null;
    t.reserve = 0;
    for (const s of this.structures) {
      if (s.team !== t.id || s.destroyed) continue;
      s.hp = 0;
      if (s.factory) s.factory.queue.length = 0;
    }
    let interned = 0;
    for (const ac of this.aircraft) {
      if (ac.team !== t.id || ac.status === 'dead' || ac.status === 'recovered') continue;
      this.destroyQuietly(ac);
      interned++;
    }
    this.log(`${t.name} harekâttan elendi${interned ? ` (havadaki ${interned} uçağı tarafsız ülkelere indi)` : ''}`, null, 'info');
  }

  /** Son bir dakikadaki toplam gelir (kr/dk). */
  incomeRate(team: number): number {
    const t = this.teams[team];
    if (!t) return 0;
    let sum = 0;
    for (const v of t.incomeHist) sum += v;
    return sum;
  }

  /** Madenlerin şu anki toplam üretimi (kr/dk). */
  mineRate(team: number): number {
    let sum = 0;
    for (const s of this.structures) if (s.team === team && s.kind === 'mine' && s.active) sum += this.mineOutput(s);
    return sum * 60;
  }

  /** Bir madenin saniyelik geliri (hasar üretimi düşürür). */
  mineOutput(s: Structure): number {
    return MINE_RATE * s.richness * (0.3 + 0.7 * (s.hp / s.maxHp));
  }

  /** İnşaat maliyeti: her yeni maden öncekilerden %30 pahalı (sınırsız kartopu olmasın). */
  structureCost(team: number, kind: StructureKind): number {
    const base = STRUCTURE_COST[kind];
    if (kind !== 'mine') return base;
    const n = this.structures.filter((s) => s.team === team && s.kind === 'mine' && !s.destroyed).length;
    return Math.round((base * (1 + 0.3 * n)) / 50) * 50;
  }

  /** Fabrikaya uçak siparişi: fiyatı peşin ödenir. */
  orderAircraft(s: Structure, specId: string): boolean {
    const f = s.factory;
    const spec = SPECS[specId];
    if (!f || !spec || f.queue.length >= 8) return false;
    const price = aircraftPrice(spec);
    if (!this.pay(s.team, price, `Üretim: ${spec.abbr}`)) return false;
    f.enqueue(specId, this.economyEnabled ? price : 0);
    return true;
  }

  /** Fabrika kuyruğundan çıkar: başlamamış sipariş tam, başlamış olan kalan kısmı kadar iade edilir. */
  cancelOrder(s: Structure, index: number): void {
    const f = s.factory;
    const item = f?.queue[index];
    if (!f || !item) return;
    f.queue.splice(index, 1);
    if (item.paid > 0) this.earn(s.team, Math.round(item.paid * (1 - item.progress)), `Sipariş iptali: ${SPECS[item.specId]?.abbr ?? ''}`);
  }

  /** Üs tesisi inşaatı (ücretli). */
  startBaseUpgrade(base: Airbase, key: BaseUpgrade): boolean {
    if (base.job || base.upgrades.has(key) || !base.s.active) return false;
    if (!this.pay(base.s.team, BASE_UPGRADE_COST[key], `Üs tesisi: ${BASE_UPGRADES[key].name}`)) return false;
    return base.startUpgrade(key);
  }

  /** Uçaksavar bataryasında kurulum/yükseltme (ücretli). */
  startAAJob(s: Structure, key: string): boolean {
    const aa = s.aa;
    if (!aa) return false;
    const research = this.teams[s.team].research;
    const opt = aa.options(research).find((o) => o.key === key);
    if (!opt || !opt.enabled) return false;
    if (!this.pay(s.team, opt.cost, `${s.name}: ${opt.label}`)) return false;
    return aa.start(key, research);
  }

  // ------------------------------------------------------------------ pazar

  /** Uluslararası pazar: tarafsız ülkelerin uçak teklifleri (oyuncu alır ve satar). */
  readonly market = { offers: [] as MarketOffer[], nextRefresh: 0, nextId: 1 };

  private updateMarket(): void {
    const m = this.market;
    if (!this.economyEnabled || this.time < m.nextRefresh) return;
    m.nextRefresh = this.time + 240;
    m.offers = m.offers.filter((o) => o.count > 0 && o.expires > this.time);
    const me = this.teams[this.playerTeam];
    if (!me) return;
    // Oyuncunun dönemine yakın uçaklar: açtığı en yeni uçağın yılı + 2'ye kadar
    let era = 1938;
    for (const s of SPEC_LIST) if (me.research.hasAircraft(s.id)) era = Math.max(era, s.year);
    const pool = SPEC_LIST.filter((s) => s.playable && s.year <= era + 2);
    while (m.offers.length < 5 && pool.length) {
      const spec = pool[Math.floor(Math.random() * pool.length)];
      if (m.offers.some((o) => o.specId === spec.id)) {
        if (pool.length <= m.offers.length) break;
        continue;
      }
      const own = me.research.hasAircraft(spec.id);
      const price = aircraftPrice(spec) * (own ? 1.15 : 1.55) * rand(0.9, 1.12);
      m.offers.push({
        id: m.nextId++, specId: spec.id, count: spec.role === 'bomber' ? 1 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 4),
        unitPrice: Math.round(price / 50) * 50, seller: SELLERS[Math.floor(Math.random() * SELLERS.length)],
        expires: this.time + 480 + Math.random() * 480,
      });
    }
  }

  /** Pazardan satın al: uçak seçilen üssün hangarına teslim edilir. */
  buyOffer(team: number, offerId: number, base: Airbase, n = 1): string | null {
    const o = this.market.offers.find((x) => x.id === offerId);
    if (!o || o.count <= 0) return 'Teklif kalmadı';
    n = Math.min(n, o.count, base.freeSlots);
    if (n <= 0) return 'Üssün hangarında yer yok';
    const spec = SPECS[o.specId];
    if (!this.pay(team, o.unitPrice * n, `Pazardan alım: ${n} × ${spec.abbr} (${o.seller})`)) return 'Para yetmiyor';
    o.count -= n;
    for (let i = 0; i < n; i++) base.addAirframe(newAirframe(o.specId, team));
    this.log(`${o.seller}: ${n} × ${spec.name} satın alındı, ${base.s.name} hangarına teslim edildi`, team, 'build');
    return null;
  }

  /** Hangardaki hazır bir uçağı pazara sat. */
  sellAirframe(base: Airbase, af: Airframe): boolean {
    if (af.status !== 'ready' || !base.inventory.includes(af)) return false;
    const spec = SPECS[af.specId];
    base.removeAirframe(af);
    this.earn(base.s.team, Math.round(aircraftPrice(spec) * SELL_RATE * (1 - af.wear * 0.3)), `Satış: ${spec.abbr}`);
    this.log(`${base.s.name}: ${spec.name} pazarda satıldı`, base.s.team, 'build');
    return true;
  }

  // ------------------------------------------------------------------ personel

  /** Kalkabilecek boş mürettebat (personel kuralları kapalıysa sınırsız). */
  crewFree(team: number): number {
    if (!this.personnelEnabled) return Infinity;
    const p = this.teams[team].personnel;
    return Math.max(0, Math.floor(p.people - p.reserved));
  }

  /** Konut kapasitesi ve kayıp yerine gelenler (saniyede bir). */
  private updatePersonnel(dt: number): void {
    for (const t of this.teams) {
      const p = t.personnel;
      let cap = 0;
      for (const s of this.structures) if (s.team === t.id && s.active) cap += s.def.population ?? 0;
      // Yeni konut tamamlanınca sakinleri hemen gelir; yıkılınca uçmayanlar ayrılır
      if (cap > p.capacity) p.people += cap - p.capacity;
      p.capacity = cap;
      if (p.people < cap) {
        p.recruit += dt * RECRUIT_RATE;
        while (p.recruit >= 1 && p.people < cap) {
          p.people++;
          p.recruit--;
        }
      } else p.recruit = 0;
      if (p.people > Math.max(cap, p.reserved)) p.people = Math.max(cap, p.reserved);
    }
  }

  /** Uçağın mürettebatını havuza bırak; kaybedildiyse kişiler düşer (kurtulanlar sonra geri eklenir). */
  private releaseCrew(ac: Aircraft, lost: boolean): void {
    if (ac.crew <= 0 || ac.crewReleased) return;
    ac.crewReleased = true;
    const p = this.teams[ac.team]?.personnel;
    if (!p) return;
    p.reserved = Math.max(0, p.reserved - ac.crew);
    if (lost) {
      p.people = Math.max(0, p.people - ac.crew);
      ac.crewLost = ac.crew;
    }
  }

  /** Kurtulan mürettebat kendi bölgesindeyse personele döner. */
  private crewSurvives(team: number, x: number, z: number, n: number): boolean {
    const home = this.structures.some((s) => s.team === team && !s.destroyed && Math.hypot(s.pos.x - x, s.pos.z - z) < TERRITORY);
    if (home && n > 0 && this.personnelEnabled) this.teams[team].personnel.people += n;
    return home;
  }

  // ------------------------------------------------------------------ görev sonuçları

  /** Biten görevlerin raporları (en yeni sonda). */
  readonly missionReports: MissionReport[] = [];
  /** Taraf ve görev türüne göre sonuç sayıları. */
  readonly missionTally = new Map<string, { success: number; fail: number; none: number }>();

  /** Kol görevini bitirdi: sonucu değerlendir, başarıdaysa ödülü öde, raporla. */
  finishMission(fl: FlightGroup): void {
    if (fl.stats.result) return;
    const r = evaluateMission(this, fl);
    fl.stats.result = r.outcome;
    const key = `${fl.team}:${fl.plan.type}`;
    const tally = this.missionTally.get(key) ?? { success: 0, fail: 0, none: 0 };
    tally[r.outcome]++;
    this.missionTally.set(key, tally);
    if (r.outcome === 'success' && r.reward > 0) this.earn(fl.team, r.reward, `Görev başarılı: ${MISSION_NAMES[fl.plan.type]} (${fl.name})`);
    const icon = r.outcome === 'success' ? '✓' : r.outcome === 'fail' ? '✗' : '–';
    const word = r.outcome === 'success' ? 'başarılı' : r.outcome === 'fail' ? 'başarısız' : 'sonuçsuz';
    const money = r.outcome === 'success' && r.reward > 0 && this.economyEnabled ? ` (+${fmtMoney(r.reward)})` : '';
    this.log(`${icon} ${fl.name} · ${MISSION_NAMES[fl.plan.type]} ${word}: ${r.reason}${money}`, fl.team, 'ops');
    const types = [...new Set(fl.members.map((m) => m.spec.abbr))].join(', ');
    this.missionReports.push({
      id: (this.missionReports[this.missionReports.length - 1]?.id ?? 0) + 1, team: fl.team, flight: fl.name, type: fl.plan.type, outcome: r.outcome, reason: r.reason,
      reward: this.economyEnabled ? r.reward : 0, time: this.time, aircraft: `${fl.expected} × ${types}`,
    });
    if (this.missionReports.length > 60) this.missionReports.shift();
  }

  /** Bir yapı için verilen halkada uygun yer (senaryo kurulumu ve yapay zekâ inşaatı). */
  findSpot(team: number, kind: StructureKind, cx: number, cz: number, rMin: number, rMax: number, seed = 0, heading = 0): { x: number; z: number } | null {
    for (let r = rMin; r <= rMax; r += 120) {
      const n = r < 1 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 90));
      for (let i = 0; i < n; i++) {
        const a = ((i + seed * 0.37) / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (this.checkPlacement(team, kind, x, z, heading).ok) return { x, z };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ sorgular

  aircraftById(id: number): Aircraft | undefined {
    return this.acById.get(id);
  }

  structureById(id: number): Structure | undefined {
    return this.structures.find((s) => s.id === id);
  }

  flightById(id: number): FlightGroup | undefined {
    return this.flights.find((f) => f.id === id);
  }

  airbaseById(id: number): Airbase | undefined {
    return this.structureById(id)?.airbase ?? undefined;
  }

  airbasesOf(team: number): Airbase[] {
    const out: Airbase[] = [];
    for (const s of this.structures) if (s.team === team && s.airbase && !s.destroyed) out.push(s.airbase);
    return out;
  }

  /** Takımın en yakın yapısına yatay uzaklık (m). */
  distToTeam(team: number, pos: Vector3): number {
    let d = Infinity;
    for (const s of this.structures) {
      if (s.team !== team || s.destroyed) continue;
      const dd = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      if (dd < d) d = dd;
    }
    return d;
  }

  nearestAirbase(team: number, pos: Vector3, filter: (b: Airbase) => boolean = () => true): Airbase | null {
    let best: Airbase | null = null;
    let bestD = Infinity;
    for (const b of this.airbasesOf(team)) {
      if (!filter(b)) continue;
      const d = Math.hypot(b.s.pos.x - pos.x, b.s.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Kalkış sırasında bekleyen üye sayısı. */
  pendingTakeoffs(fl: FlightGroup): number {
    let n = 0;
    for (const s of this.structures) if (s.airbase) for (const r of s.airbase.takeoffQueue) if (r.flight === fl) n++;
    return n;
  }

  /** Eve dönüş yakıtı + yedek. */
  isBingo(ac: Aircraft): boolean {
    const home = this.airbaseById(ac.flight?.returnBaseId ?? ac.homeBaseId) ?? this.nearestAirbase(ac.team, ac.pos);
    if (!home) return false;
    const dist = Math.hypot(home.s.pos.x - ac.pos.x, home.s.pos.z - ac.pos.z);
    return ac.totalFuel < this.fuelToReturn(ac.spec, dist);
  }

  /** Bu mesafeden üsse dönmek için gereken yakıt (kg): seyir + %25 pay + 4 dk yedek. */
  fuelToReturn(spec: AircraftSpec, dist: number): number {
    return (dist / spec.cruiseSpeed) * spec.cruiseFlow * 1.25 + spec.cruiseFlow * 240;
  }

  missionTargetPos(fl: FlightGroup): Vector3 | null {
    return this.planTargetPos(fl.plan);
  }

  // ------------------------------------------------------------------ günlük

  log(text: string, team: number | null = null, cat: LogCategory = 'info'): void {
    this.logs.push({ time: this.time, text, team, cat });
    if (this.logs.length > 300) this.logs.shift();
  }

  logEngagement(attacker: Aircraft, target: Aircraft): void {
    const key = `${attacker.team}:${target.flight?.id ?? target.id}`;
    const last = this.engageLogTimes.get(key);
    if (last !== undefined && this.time - last < 30) return;
    this.engageLogTimes.set(key, this.time);
    const who = attacker.flight ? `${attacker.flight.name} kolu` : attacker.callsign;
    const whom = target.flight ? `${target.flight.name} (${target.spec.abbr})` : target.callsign;
    this.log(`${who}, ${whom} ile çatışmaya giriyor`, attacker.team, 'combat');
  }

  // ------------------------------------------------------------------ yapılar

  addStructure(team: number, kind: StructureKind, name: string, x: number, z: number, headingDeg = 0, built = true): Structure {
    const def = STRUCTURE_DEFS[kind];
    let h = (headingDeg * Math.PI) / 180;
    let stats = footprintStats(x, z, def.halfW, def.halfL, h);
    const elev = Math.max(stats.mean, 6);
    if (kind === 'airbase') {
      // Pist yönü: iniş ve kalkış koridorlarını en iyi açan yön
      h = bestRunwayHeading(x, z, elev, h);
      stats = footprintStats(x, z, def.halfW, def.halfL, h);
    }
    // Damar verimi doğal araziye göre (düzleştirmeden önce)
    const rich = kind === 'mine' ? oreRichness(x, z) : 0;
    flattenFootprint(x, z, def.halfW + 20, def.halfL + 40, h, elev, kind === 'airbase' ? 260 : 90);
    const s = new Structure(team, kind, name, new Vector3(x, elev, z), h, built);
    s.richness = rich;
    this.structures.push(s);
    return s;
  }

  structureName(team: number, kind: StructureKind): string {
    const key = `${team}:${kind}`;
    const n = (this.nameCounters.get(key) ?? 0) + 1;
    this.nameCounters.set(key, n);
    return `${this.teams[team].name} ${STRUCTURE_DEFS[kind].name.toLowerCase()} ${n}`;
  }

  checkPlacement(team: number, kind: StructureKind, x: number, z: number, headingRad: number, attachTo: number | null = null): PlacementCheck {
    const def = STRUCTURE_DEFS[kind];
    const research = this.teams[team].research;
    const stats = footprintStats(x, z, def.halfW, def.halfL, headingRad);
    const elevation = Math.max(stats.mean, 6);
    const fail = (reason: string) => ({ ok: false, reason, elevation });
    if (def.requires && !research.has(def.requires)) return fail(`Araştırma gerekli: ${TECH_BY_ID[def.requires].name}`);
    if (stats.outside) return fail('Harita dışında');
    if (stats.water > 0.02) return fail('Su üzerine inşa edilemez');
    if (stats.max - stats.min > def.maxRelief) return fail(`Arazi çok engebeli (${Math.round(stats.max - stats.min)} m fark)`);
    if (kind === 'airbase' && runwayScore(x, z, elevation, headingRad) < -40) {
      return fail('Bu pist yönünde iniş/kalkış koridoru dağlarla kapalı (R ile döndür)');
    }
    const city = def.category === 'city';
    const myR = kind === 'airbase' ? 1400 : def.radius * 1.6 + 60;
    let nearOwn = Infinity;
    for (const s of this.structures) {
      if (s.destroyed) continue;
      const d = Math.hypot(s.pos.x - x, s.pos.z - z);
      if (s.id === attachTo) {
        nearOwn = Math.min(nearOwn, d);
        continue;
      }
      if (city && s.def.category === 'city') {
        // Şehir yapıları yan yana dizilebilir: yalnız tabanlar çakışmasın
        if (d < (Math.max(def.halfW, def.halfL) + Math.max(s.def.halfW, s.def.halfL)) * 0.92) return fail('Başka bir binaya çok yakın');
      } else if (kind === 'aa' && s.airbase) {
        // Uçaksavar tel örgünün hemen dışına kurulabilir: üssün 1,4 km'lik dairesi pistin yanını da kapatıyordu, 2 km
        // menzilli 20 mm pisti koruyamıyordu. Tel örgü pistin 120 m bir yanından 560 m öbür yanına; pist uzantısındaki
        // yaklaşma koridoru boş kalır
        const { u, v } = s.airbase.toRunway(x, z);
        if ((Math.abs(u) < 1430 && v > -270 && v < 710) || (Math.abs(u) < 3800 && Math.abs(v) < 300)) {
          return fail('Hava üssüne ya da yaklaşma koridoruna çok yakın');
        }
      } else {
        const otherR = s.kind === 'airbase' ? 1400 : s.def.radius * 1.6 + 60;
        if (d < myR + otherR - 200) return fail('Başka bir yapıya çok yakın');
      }
      if (s.team !== team && d < 12000) return fail('Düşman yapısına çok yakın');
      if (s.team === team) nearOwn = Math.min(nearOwn, d);
    }
    if (nearOwn > TERRITORY) return fail(`Kendi bölgenizden çok uzak (en fazla ${TERRITORY / 1000} km)`);
    if (kind === 'mine' && this.structures.some((s) => s.kind === 'mine' && !s.destroyed && Math.hypot(s.pos.x - x, s.pos.z - z) < 2500)) {
      return fail('Başka bir madene çok yakın (en az 2,5 km)');
    }
    const cost = this.structureCost(team, kind);
    if (!this.canAfford(team, cost)) return fail(`Para yetmiyor (${fmtMoney(cost)})`);
    // Askerî: aynı anda 3 inşaat. Şehir: 12'ye kadar sıraya alınır, 4'ü aynı anda ilerler
    const limit = city ? 12 : def.category === 'economy' ? 2 : 3;
    const building = this.structures.filter((s) => s.team === team && s.build < 1 && !s.destroyed && s.def.category === def.category).length;
    if (building >= limit) return fail(city ? 'Şehir inşaat sırası dolu (12)' : `Aynı anda en fazla ${limit} inşaat (bu tür)`);
    return { ok: true, elevation };
  }

  /** Hava üssünün yanına bağlı uçak fabrikası. */
  placeBaseFactory(base: Airbase): Structure | null {
    const chk = this.checkBaseFactory(base);
    if (!chk.ok) return null;
    const p = base.factoryPad();
    const s = this.placeStructure(base.s.team, 'factory', p.x, p.z, base.s.heading, base.s.id);
    if (s) s.name = `${base.s.name} fabrikası`;
    return s;
  }

  checkBaseFactory(base: Airbase): PlacementCheck {
    const p = base.factoryPad();
    if (this.structures.some((s) => s.attachedTo === base.s.id && !s.destroyed)) return { ok: false, reason: 'Bu üssün fabrikası zaten var', elevation: 0 };
    if (!base.s.active) return { ok: false, reason: 'Üs inşaatı bitmeli', elevation: 0 };
    return this.checkPlacement(base.s.team, 'factory', p.x, p.z, base.s.heading, base.s.id);
  }

  placeStructure(team: number, kind: StructureKind, x: number, z: number, headingRad: number, attachTo: number | null = null): Structure | null {
    const chk = this.checkPlacement(team, kind, x, z, headingRad, attachTo);
    if (!chk.ok) return null;
    const def = STRUCTURE_DEFS[kind];
    if (!this.pay(team, this.structureCost(team, kind), `İnşaat: ${def.name}`)) return null;
    const rich = kind === 'mine' ? oreRichness(x, z) : 0;
    flattenFootprint(x, z, def.halfW + 20, def.halfL + 40, headingRad, chk.elevation, kind === 'airbase' ? 260 : def.category === 'city' ? 50 : 90);
    const s = new Structure(team, kind, this.structureName(team, kind), new Vector3(x, chk.elevation, z), headingRad, false);
    s.richness = rich;
    s.attachedTo = attachTo;
    this.structures.push(s);
    this.log(`${s.name}: inşaat başladı (${def.buildTime} sn)`, team, 'build');
    return s;
  }

  // ------------------------------------------------------------------ uçaklar

  private register(ac: Aircraft): void {
    this.aircraft.push(ac);
    this.acById.set(ac.id, ac);
  }

  nextFlightName(team: number): string {
    const t = this.teams[team];
    t.flightCounter++;
    // Takım adının öbür takımlardan ayrılan en kısa başı (Mavi ve Mor ikisi de "M1" oluyordu: günlükte kimin
    // uçağı düştü ayırt edilemiyordu → "Ma1", "Mo1")
    const low = (s: string, k: number) => s.slice(0, k).toLocaleLowerCase('tr');
    let k = 1;
    while (k < t.name.length && this.teams.some((o) => o !== t && low(o.name, k) === low(t.name, k))) k++;
    return `${t.name.slice(0, k)}${t.flightCounter}`;
  }

  /** Senaryolar için havada başlayan kol. */
  spawnAirborneFlight(
    team: number, specId: string, count: number, origin: Vector3, headingDeg: number, plan: MissionPlan,
    homeBase: Airbase | null, opts: AircraftOptions = {},
  ): FlightGroup {
    const spec = SPECS[specId];
    const name = this.nextFlightName(team);
    const fl = new FlightGroup(team, name, plan, homeBase?.s.id ?? -1, homeBase?.s.id ?? -1, count);
    this.prepareFlight(fl, origin);
    const hr = (headingDeg * Math.PI) / 180;
    const fx = Math.sin(hr);
    const fz = -Math.cos(hr);
    for (let i = 0; i < count; i++) {
      const row = Math.ceil(i / 2);
      const side = i === 0 ? 0 : i % 2 === 1 ? 1 : -1;
      const sp = spec.engines > 1 ? 150 : 120;
      const ac = new Aircraft(spec, team, `${name}-${i + 1}`, {
        loadoutId: plan.loadoutId, fuelFrac: plan.fuelFrac, mods: this.teams[team].research.modsFor(spec), belt: plan.belt, ...opts,
      });
      ac.pos.set(origin.x - fx * row * sp - fz * side * row * sp, origin.y + i * 10, origin.z - fz * row * sp + fx * side * row * sp);
      ac.setAttitude(headingDeg);
      ac.flight = fl;
      ac.slot = i;
      ac.homeBaseId = homeBase?.s.id ?? -1;
      fl.members.push(ac);
      this.register(ac);
    }
    fl.phase = plan.type === 'escort' || plan.type === 'intercept' ? 'action' : 'enroute';
    fl.phaseStart = this.time;
    fl.actionStart = this.time;
    this.flights.push(fl);
    return fl;
  }

  /** Hangardan görev (tek tip): hazır uçakları kollara böler, kalkış sırasına koyar. */
  launch(
    base: Airbase, specId: string, count: number, plan: MissionPlan,
    escort?: { specId: string; count: number; plan?: MissionPlan; split?: number | null }, split?: number | null,
  ): FlightGroup[] {
    const escorts = escort ? [{ specId: escort.specId, count: escort.count, split: escort.split }] : [];
    return this.launchPackage(base, plan, [{ specId, count, loadoutId: plan.loadoutId, belt: plan.belt, split }], escorts, escort?.plan);
  }

  /**
   * Görev paketi: farklı tiplerden kollar aynı görevle kalkar. Her tip kendi kolunu (en fazla 4, bombardıman 6) kurar;
   * paket kolları toplanmayı birbirine bekler, intikalde öndeki kolu izler ve en yavaş tipin hızında uçar.
   * Eskort kolları saldırı kollarına sırayla dağıtılır.
   */
  launchPackage(base: Airbase, plan: MissionPlan, groups: LaunchGroup[], escorts: LaunchGroup[] = [], escortPlan?: MissionPlan): FlightGroup[] {
    if (!base.usable) return [];
    const research = this.teams[base.s.team].research;
    const tp = this.planTargetPos(plan);
    const dist = tp ? Math.hypot(tp.x - base.s.pos.x, tp.z - base.s.pos.z) : 0;
    const targetIsAA = plan.targetStructureId !== null && this.structureById(plan.targetStructureId)?.kind === 'aa';
    // Görev dağılımı: bir tipin uçakları iki işe bölünür (her parça ayrı kol, aynı pakette)
    const splitGroups = (list: LaunchGroup[], type: MissionType): { g: LaunchGroup; task: FlightTask }[] => {
      const out: { g: LaunchGroup; task: FlightTask }[] = [];
      for (const g of list) {
        if (g.count <= 0) continue;
        const sp = TASK_SPLIT[type];
        if (!sp || g.split === null || g.split === undefined) {
          out.push({ g, task: 'auto' });
          continue;
        }
        const side = Math.max(0, Math.min(g.count, Math.round(g.split)));
        if (g.count - side > 0) out.push({ g: { ...g, count: g.count - side }, task: sp.main });
        if (side > 0) out.push({ g: { ...g, count: side }, task: sp.side });
      }
      return out;
    };
    const mainParts = splitGroups(groups, plan.type);
    const escortParts = splitGroups(escorts, 'escort');
    const multi = mainParts.length + escortParts.length > 1;
    const packageId = multi ? this.nextPackageId++ : 0;
    const shortages: string[] = [];
    const make = (g: LaunchGroup, p0: MissionPlan, task: FlightTask = 'auto'): FlightGroup[] => {
      const spec = SPECS[g.specId];
      let ready = base.readyOf(g.specId).slice(0, g.count);
      if (!spec || ready.length === 0) return [];
      // Mürettebat: yetecek kadar uçak kalkar, kalanı hangarda bekler
      const free = this.crewFree(base.s.team);
      const can = Math.min(ready.length, Math.floor(free / spec.crew));
      if (can < ready.length) {
        shortages.push(`${ready.length - can} × ${spec.abbr}`);
        ready = ready.slice(0, can);
      }
      if (ready.length === 0) return [];
      const crew = this.personnelEnabled ? spec.crew : 0;
      this.teams[base.s.team].personnel.reserved += crew * ready.length;
      const p = clonePlan(p0);
      const has = (id?: string) => research.has(id);
      const custom = g.custom && loadoutAllowed(g.custom, has) ? g.custom : undefined;
      const lo = g.loadoutId && spec.loadouts.some((l) => l.id === g.loadoutId && loadoutAllowed(l, has)) ? g.loadoutId : null;
      p.loadoutId = custom ? custom.id : lo ?? defaultLoadout(spec, p.type, has, dist, targetIsAA);
      p.belt = g.belt ?? p.belt;
      if (g.formation) p.formation = g.formation;
      if (g.roe) p.roe = g.roe;
      if (p.type === 'intercept') p.roe = 'free';
      p.task = task;
      if (task === 'close') p.roe = 'defensive';
      else if (task === 'free') p.roe = 'free';
      const groupSize = spec.role === 'bomber' ? 6 : 4;
      const out: FlightGroup[] = [];
      for (let i = 0; i < ready.length; i += groupSize) {
        const chunk = ready.slice(i, i + groupSize);
        const fl = new FlightGroup(base.s.team, this.nextFlightName(base.s.team), clonePlan(p), base.s.id, base.s.id, chunk.length);
        fl.packageId = packageId;
        this.prepareFlight(fl, base.s.pos, base);
        if (p.type === 'intercept') fl.initTrack(this);
        chunk.forEach((af, slot) =>
          base.requestTakeoff({ airframe: af, flight: fl, slot, loadoutId: p.loadoutId, loadout: custom, fuelFrac: p.fuelFrac, belt: p.belt, crew }),
        );
        this.flights.push(fl);
        out.push(fl);
      }
      return out;
    };
    const flights: FlightGroup[] = [];
    const parts: string[] = [];
    const logShortage = () => {
      if (shortages.length) {
        this.log(`${base.s.name}: mürettebat yok — ${shortages.join(', ')} hangarda kaldı (personel için ev kur)`, base.s.team, 'ops');
        shortages.length = 0;
      }
    };
    const taskNote = (task: FlightTask) => (task === 'auto' ? '' : ` (${TASK_NAMES[task]})`);
    for (const { g, task } of mainParts) {
      const f = make(g, plan, task);
      if (f.length) parts.push(`${f.reduce((a, x) => a + x.expected, 0)} × ${SPECS[g.specId].abbr}${taskNote(task)}`);
      flights.push(...f);
    }
    if (flights.length === 0) {
      logShortage();
      return [];
    }
    const escortFlights: FlightGroup[] = [];
    for (const { g, task } of escortParts) {
      const ep = escortPlan ? clonePlan(escortPlan) : clonePlan(plan);
      ep.type = 'escort';
      ep.targetStructureId = null;
      ep.targetAircraftId = null;
      ep.targetFlightId = flights[0].id;
      ep.roe = escortPlan?.roe ?? 'free';
      ep.formation = 'finger4';
      ep.lowLevel = plan.lowLevel;
      ep.loadoutId = '';
      ep.belt = escortPlan?.belt ?? 'std';
      const f = make(g, ep, task);
      if (f.length) parts.push(`eskort ${f.reduce((a, x) => a + x.expected, 0)} × ${SPECS[g.specId].abbr}${taskNote(task)}`);
      escortFlights.push(...f);
    }
    // Eskortlar saldırı kollarına sırayla
    escortFlights.forEach((ef, i) => {
      ef.plan.targetFlightId = flights[i % flights.length].id;
      ef.escortOf = flights[i % flights.length];
      ef.packageId = packageId;
    });
    // Planlayıcıdan doğrudan eskort görevi: eşlik edilen kola bağla
    for (const f of flights) if (f.plan.type === 'escort' && !f.escortOf) f.escortOf = this.flightById(f.plan.targetFlightId ?? -1) ?? null;
    logShortage();
    const all = [...flights, ...escortFlights];
    this.log(
      `${base.s.name}: ${parts.join(', ')} — ${MISSION_NAMES[plan.type].toLowerCase()} görevine kalkıyor (${all.map((f) => f.name).join(', ')})`,
      base.s.team, 'ops',
    );
    return all;
  }

  /** Planın hedef konumu (kol kurulmadan önce). */
  planTargetPos(p: MissionPlan): Vector3 | null {
    if (p.targetStructureId !== null) return this.structureById(p.targetStructureId)?.pos ?? null;
    if (p.targetAircraftId !== null) return this.aircraftById(p.targetAircraftId)?.pos ?? null;
    if (p.targetBaseId !== null) return this.structureById(p.targetBaseId)?.pos ?? null;
    if (p.targetFlightId !== null) return this.flightById(p.targetFlightId)?.leader()?.pos ?? null;
    return p.targetPos;
  }

  /** Rota, toplanma noktası ve yaklaşma yönü. */
  prepareFlight(fl: FlightGroup, origin: Vector3, base?: Airbase): void {
    const p = fl.plan;
    if (base) {
      const rv = base.rendezvousPoint(fl.rendezvous);
      fl.rendezvousAlt = Math.max(rv.floor, base.s.pos.y + (p.lowLevel ? 450 : clamp(p.altitude * 0.6, 700, 2500)));
    } else {
      fl.rendezvous.copy(origin);
      fl.rendezvousAlt = origin.y;
    }
    const tp = this.missionTargetPos(fl) ?? origin;
    const from = p.waypoints.length ? p.waypoints[p.waypoints.length - 1] : origin;
    fl.approachDir.set(tp.x - from.x, 0, tp.z - from.z);
    if (fl.approachDir.lengthSq() < 1) fl.approachDir.set(1, 0, 0);
    fl.approachDir.normalize();
    const back = (d: number) => new Vector3(tp.x - fl.approachDir.x * d, 0, tp.z - fl.approachDir.z * d);
    const wps = p.waypoints.map((w) => w.clone());
    switch (p.type) {
      case 'cap':
      case 'sweep':
      case 'ferry':
        fl.route = [...wps, tp.clone()];
        break;
      case 'levelBomb':
        fl.route = [...wps, back(20000)];
        break;
      case 'diveBomb':
        fl.route = [...wps, back(9000)];
        break;
      case 'attack':
        fl.route = [...wps, back(12000)];
        break;
      default:
        fl.route = [];
    }
    fl.routeIndex = 0;
  }

  spawnFromAirframe(req: TakeoffRequest, base: Airbase, lateral: number): Aircraft {
    const af = req.airframe;
    const spec = SPECS[af.specId];
    const fl = req.flight;
    const ac = new Aircraft(spec, base.s.team, `${fl.name}-${req.slot + 1}`, {
      loadoutId: req.loadoutId, loadout: req.loadout, fuelFrac: req.fuelFrac, skill: af.skill, mods: this.teams[base.s.team].research.modsFor(spec), belt: req.belt,
    });
    ac.airframe = af;
    ac.crew = req.crew ?? 0;
    af.aircraftId = ac.id;
    af.sorties++;
    ac.onGround = true;
    ac.groundHeading = base.takeoffHeading();
    ac.speed = 0;
    base.takeoffStart(lateral, ac.pos);
    ac.pos.y = groundLevel(ac.pos.x, ac.pos.z) + gearHeight(spec);
    ac.setAttitude((ac.groundHeading * 180) / Math.PI, spec.tailDragger ? 11 : 0);
    ac.flight = fl;
    ac.slot = req.slot;
    ac.homeBaseId = base.s.id;
    ac.brain.beginTakeoff(base);
    fl.members.push(ac);
    fl.members.sort((a, b) => a.slot - b.slot);
    this.register(ac);
    return ac;
  }

  /** İnen uçak hangara alınır: bakım süresi hasara ve harcanan mühimmata bağlı. */
  recover(ac: Aircraft, base: Airbase): void {
    const af = ac.airframe;
    if (af) {
      const origin = this.airbaseById(ac.homeBaseId);
      if (origin && origin !== base) origin.removeAirframe(af);
      if (!base.inventory.includes(af)) base.inventory.push(af);
      const d = ac.damage;
      af.wear = clamp(1 - ac.hp / ac.hpMax + Math.max(...d.engines) * 0.5 + d.wings * 0.5 + d.controls * 0.3, 0, 1.5);
      const rearm = ac.stores.loadout.bombCount || ac.stores.loadout.rocketCount ? 30 + ac.stores.loadout.mass * 0.02 : 0;
      af.status = 'servicing';
      af.readyAt = this.time + (50 + af.wear * 220 + rearm) * base.serviceMul;
      af.kills += ac.kills;
      af.skill = Math.min(1.5, af.skill + 0.015 + ac.kills * 0.03);
      af.aircraftId = null;
    }
    base.cancelLanding(ac.id);
    this.releaseCrew(ac, false);
    ac.status = 'recovered';
    if (ac.flight) ac.flight.landed++;
    // Görevden sağ dönen uçak küçük bir savaş puanı getirir
    if (ac.flight && ac.flight.plan.type !== 'ferry') this.teams[ac.team].research.award(8);
  }

  destroyQuietly(ac: Aircraft): void {
    this.loseAirframe(ac);
    ac.status = 'dead';
  }

  private loseAirframe(ac: Aircraft): void {
    this.releaseCrew(ac, true);
    if (ac.flight) ac.flight.stats.losses++;
    const af = ac.airframe;
    if (!af) return;
    const origin = this.airbaseById(ac.homeBaseId);
    if (origin) {
      origin.removeAirframe(af);
      origin.lostCount++;
    }
    ac.airframe = null;
  }

  // ------------------------------------------------------------------ silahlar

  /** Uçak silahı veya taret mermisi. */
  spawnGunRound(ac: Aircraft, gun: GunSpec, pos: Vector3, dir: Vector3, belt?: BeltDef): void {
    // Saçılma: sabit uçak silahında ~3–5 mil (gerçek desen); esnek taret silahı daha geniş saçar
    const flex = ac.turrets.some((t) => t.gun === gun || t.spec.gun === gun);
    const vel = new Vector3(gauss(), gauss(), gauss()).multiplyScalar(gun.dispersion * gun.muzzleVel * (flex ? 0.6 : 0.25));
    vel.addScaledVector(dir, gun.muzzleVel).addScaledVector(ac.fwd, ac.speed);
    this.bullets.push({
      pos: pos.clone(), prev: pos.clone(), vel,
      life: (gun.range * 1.4) / (gun.muzzleVel + ac.speed),
      team: ac.team, ownerId: ac.id, damage: gun.damage, caliber: gun.caliber,
      burstRadius: 0, proximity: false, tracer: true, sourceName: ac.callsign, belt,
    });
  }

  spawnShot(b: Omit<Bullet, 'prev'>): void {
    this.bullets.push({ ...b, prev: b.pos.clone() });
  }

  scheduleFlak(pos: Vector3, t: number, team: number, damage: number, radius: number, sourceName: string): void {
    this.flak.push({ pos, t, team, damage, radius, sourceName });
  }

  /**
   * Silahın namlu konumu ve atış yönü. Kanat ve gondol silahları gövde ekseninden yanda durur ve
   * yakınsama mesafesinde eksenle kesişecek biçimde içe ayarlıdır; çiftse mermiler iki yana dönüşümlü çıkar.
   * Burun, kaput ve göbek silahları eksene paraleldir.
   */
  private gunMuzzle(ac: Aircraft, gun: GunSpec, round: number, pos: Vector3, dir: Vector3): void {
    const L = ac.spec.length;
    _rt.crossVectors(ac.fwd, ac.upv);
    switch (gun.mount) {
      case 'wing':
      case 'root':
      case 'pod': {
        const x = gun.paired ? (round % 2 ? gun.x : -gun.x) : gun.x;
        const y = gun.mount === 'pod' ? -0.7 : -0.3;
        pos.copy(ac.pos).addScaledVector(_rt, x).addScaledVector(ac.upv, y).addScaledVector(ac.fwd, L * 0.12);
        // Yakınsama noktası: burun ekseninde CONVERGENCE metre ileride
        dir.copy(ac.pos).addScaledVector(ac.fwd, CONVERGENCE).sub(pos).normalize();
        return;
      }
      case 'hub':
        pos.copy(ac.pos).addScaledVector(ac.fwd, L * 0.5);
        break;
      case 'cowl':
        pos.copy(ac.pos).addScaledVector(ac.fwd, L * 0.36).addScaledVector(ac.upv, 0.35);
        break;
      default:
        pos.copy(ac.pos).addScaledVector(ac.fwd, L * 0.42);
    }
    dir.copy(ac.fwd);
  }

  private fireWeapons(ac: Aircraft, dt: number): void {
    const b = ac.brain;
    ac.firing = false;
    for (let i = 0; i < ac.guns.length; i++) {
      const gun = ac.guns[i];
      // Atış disiplini: cephanesi kısa top (~10 sn'den az ateş: MG FF, N-37, MK 108) uzaktan makinelilerle
      // açılan ateşte boşa harcanmaz, ~300 m içine saklanır (kafa kafaya geçişte ve yer hedefinde serbest)
      const reserved = gun.caliber === 'cannon' && gun.ammo / gun.rate < 10 && b.aimRange > 300;
      if (b.fireGuns && ac.gunAmmo[i] > 0 && !reserved) {
        ac.firing = true;
        ac.gunCooldown[i] -= dt;
        while (ac.gunCooldown[i] <= 0 && ac.gunAmmo[i] > 0) {
          ac.gunCooldown[i] += 1 / gun.rate;
          ac.gunAmmo[i]--;
          this.gunMuzzle(ac, gun, ac.gunAmmo[i], _v, _gd);
          this.spawnGunRound(ac, gun, _v, _gd, ac.belt);
        }
      } else ac.gunCooldown[i] = Math.max(0, ac.gunCooldown[i] - dt);
    }

    if (b.releaseBomb && ac.bombCount > 0) {
      const n = b.releaseAll ? ac.bombCount : 1;
      for (let i = 0; i < n; i++) {
        const def = ac.takeBomb();
        if (!def) break;
        const vel = ac.velocity(new Vector3());
        vel.x += rand(-1.2, 1.2);
        vel.y += rand(-0.8, 0.8);
        vel.z += rand(-1.2, 1.2);
        const pos = ac.pos.clone().addScaledVector(ac.upv, -1.5);
        this.bombs.push({
          id: this.nextBombId++, pos, vel, team: ac.team, ownerName: ac.callsign, flightId: ac.flight?.id ?? 0,
          blastRadius: def.blastRadius, damage: def.damage, mass: def.mass,
        });
      }
      if (ac.flight) ac.flight.stats.struck = true;
      if (b.releaseAll) this.log(`${ac.callsign} bombasını bıraktı (${Math.round(ac.pos.y - groundLevel(ac.pos.x, ac.pos.z))} m)`, ac.team, 'strike');
    }
    if (b.fireRocket && ac.rocketCount > 0) {
      for (const side of [-1, 1]) {
        const rdef = ac.takeRocket();
        if (!rdef) break;
        _dir.crossVectors(ac.fwd, ac.upv);
        const pos = ac.pos.clone().addScaledVector(_dir, side * 3).addScaledVector(ac.upv, -0.8);
        const vel = ac.velocity(new Vector3()).addScaledVector(ac.fwd, 40);
        const spread = 4 * ac.mods.rocketSpreadMul;
        vel.x += gauss() * spread;
        vel.y += gauss() * spread;
        vel.z += gauss() * spread;
        this.rockets.push({
          pos, vel, burn: 0.7, life: 10, team: ac.team, damage: rdef.damage,
          blastRadius: rdef.blastRadius, sourceName: ac.callsign, flightId: ac.flight?.id ?? 0,
        });
        if (ac.flight) ac.flight.stats.struck = true;
        this.events.push({ kind: 'rocket', pos: pos.clone() });
      }
    }
  }

  /** İsabet: bileşen hasarı, yangın, düşürme kaydı. */
  hitAircraft(
    target: Aircraft, amount: number, caliber: Caliber, dir: Vector3, attacker: Aircraft | null, sourceName: string, sourceTeam: number,
    belt: BeltDef | null = null, zone: HitZone | null = null,
  ): void {
    if (target.status !== 'flying') return;
    const res = applyHit(target, amount * (belt?.air ?? 1), dir, caliber, belt, zone);
    target.lastHitTime = this.time;
    target.lastHitFrom = attacker?.id ?? null;
    target.lastHitTeam = sourceTeam;
    if (res.event) this.log(`${target.callsign}: ${res.event}`, target.team, 'combat');
    if (res.fatal) this.kill(target, res.fatal, attacker, sourceName, sourceTeam, res.explode);
  }

  /**
   * Düşürme. explode: uçak havada infilak eder (gövde kalmaz, enkaz yağar).
   * Diğer durumlarda uçak nedenine göre farklı biçimde düşer; mürettebat paraşütle atlayabilir.
   */
  private kill(target: Aircraft, cause: string, attacker: Aircraft | null, sourceName: string, sourceTeam: number, explode = false): void {
    if (target.status !== 'flying') return;
    this.creditKill(target, attacker, sourceTeam);
    this.loseAirframe(target);
    for (const s of this.structures) s.airbase?.cancelLanding(target.id);
    this.log(`${sourceName}, ${target.callsign} (${target.spec.abbr}) uçağını düşürdü — ${cause}`, sourceTeam, 'kill');
    if (explode) {
      this.disintegrate(target);
      return;
    }
    target.status = 'falling';
    target.onGround = false;
    const side = Math.random() < 0.5 ? -1 : 1;
    let bail = 0;
    switch (cause) {
      case 'pilot öldü':
        target.fallMode = Math.random() < 0.7 ? 'glide' : 'dive';
        target.spin = side * rand(0.05, 0.25);
        break;
      case 'kanat koptu':
        target.fallMode = 'roll';
        target.spin = side * rand(4, 6.5);
        bail = 0.45;
        target.velocity(_v);
        this.events.push({ kind: 'debris', pos: target.pos.clone(), vel: _v.clone().multiplyScalar(0.7), count: 1, size: target.spec.span * 0.45, burning: false });
        break;
      case 'kumanda kaybı':
        target.fallMode = 'spin';
        target.spin = side * rand(1.6, 3.2);
        bail = 0.6;
        break;
      case 'motoru durdu, pilot uçağı terk etti':
        target.fallMode = 'glide';
        target.spin = side * rand(0.05, 0.2);
        bail = 1;
        break;
      case 'yangın':
        target.fallMode = 'dive';
        target.spin = side * rand(0.1, 0.6);
        bail = 0.8;
        break;
      default:
        target.fallMode = Math.random() < 0.5 ? 'spin' : 'dive';
        target.spin = side * (target.fallMode === 'spin' ? rand(1.4, 3) : rand(0.1, 0.5));
        bail = 0.6;
        target.velocity(_v);
        this.events.push({ kind: 'debris', pos: target.pos.clone(), vel: _v.clone().multiplyScalar(0.8), count: 2, size: target.spec.size * 0.25, burning: true });
    }
    if (target.damage.pilot === 2) bail = 0;
    if (target.mods.ejectSeat) bail = Math.min(0.95, bail * 1.4 + 0.2);
    // Atlama birkaç saniye sonra — o arada yere çakılırsa atlayamaz
    target.bailed = false;
    target.brain.bailAt = Math.random() < bail
      ? this.time + rand(1.5, 4.5) + (target.fallMode === 'spin' || target.fallMode === 'roll' ? 2 : 0)
      : Infinity;
  }

  /** Düşürmenin hanesi: saldırganın sayısı, kolunun görev istatistiği, savaş puanı ve ganimet. */
  private creditKill(target: Aircraft, attacker: Aircraft | null, team: number): void {
    if (attacker) attacker.kills++;
    const af = attacker?.flight;
    if (af && attacker!.team !== target.team) {
      af.stats.kills++;
      af.stats.killValue += aircraftPrice(target.spec);
      const tfid = target.flight?.id ?? -1;
      if (af.plan.type === 'intercept' && (target.id === af.plan.targetAircraftId || tfid === af.stats.targetFlightId || tfid === af.interceptFlightId)) af.stats.targetKills++;
    }
    this.teams[team]?.research.award(50 + target.hpMax * 0.3);
    if (team !== target.team) this.earn(team, Math.round(aircraftPrice(target.spec) * KILL_REWARD), `Düşürülen ${target.spec.abbr}`);
  }

  /**
   * Son 3 dakikada vuran düşman (kayıp onun hanesine yazılır). Ağır hasarlı uçak o hasarla düşerse (üsse
   * sürünürken zorunlu iniş, irtifa tutamayıp yere değme) süre sınırı yok: kayıp hasarı verenindir.
   */
  private lastAttacker(ac: Aircraft): Aircraft | null {
    if (ac.lastHitFrom === null || (this.time - ac.lastHitTime > 180 && !isCrippled(ac))) return null;
    return this.aircraftById(ac.lastHitFrom) ?? null;
  }

  /** Motoru duran ve üsse yetişemeyen uçak: pilot atlar ya da araziye zorunlu iniş yapar. */
  abandon(ac: Aircraft, mode: 'bail' | 'forced'): void {
    if (ac.status !== 'flying') return;
    const att = this.lastAttacker(ac);
    const src = att?.callsign ?? null;
    if (mode === 'bail' && ac.damage.pilot < 2) {
      if (att) this.kill(ac, 'motoru durdu, pilot uçağı terk etti', att, att.callsign, att.team);
      else {
        this.loseAirframe(ac);
        for (const s of this.structures) s.airbase?.cancelLanding(ac.id);
        ac.status = 'falling';
        ac.fallMode = 'glide';
        ac.spin = rand(-0.2, 0.2);
        this.log(`${ac.callsign}: üsse ulaşamıyor, pilot uçağı terk etti`, ac.team, 'combat');
      }
      ac.brain.bailAt = this.time + rand(0.5, 2);
      ac.bailed = false;
      return;
    }
    this.loseAirframe(ac);
    for (const s of this.structures) s.airbase?.cancelLanding(ac.id);
    ac.status = 'dead';
    ac.pos.y = groundLevel(ac.pos.x, ac.pos.z);
    this.events.push({ kind: 'groundHit', pos: ac.pos.clone(), water: terrainHeight(ac.pos.x, ac.pos.z) < 0 });
    const water = terrainHeight(ac.pos.x, ac.pos.z) < 0;
    if (!water && ac.crewLost > 0) {
      const home = this.crewSurvives(ac.team, ac.pos.x, ac.pos.z, ac.crewLost);
      this.log(`${ac.callsign} mürettebatı ${home ? 'kurtuldu' : 'esir düştü'}`, ac.team, 'combat');
    }
    const what = water ? 'denize zorunlu iniş yaptı' : 'araziye zorunlu iniş yaptı';
    if (att) {
      this.creditKill(ac, att, att.team);
      this.log(`${src}, ${ac.callsign} (${ac.spec.abbr}) uçağını düşürdü — ${what}`, att.team, 'kill');
    } else this.log(`${ac.callsign} ${what}`, ac.team, 'combat');
  }

  /** Motorsuz uçak üssün yanına zorunlu iniş yapar: gövde kurtulur ama uzun onarım gerekir. */
  deadStickLanding(ac: Aircraft, base: Airbase): void {
    if (ac.status !== 'flying') return;
    this.log(`${ac.callsign}: ${base.s.name} üssüne motorsuz zorunlu iniş yaptı`, ac.team, 'ops');
    ac.hp = Math.min(ac.hp, ac.hpMax * 0.3);
    this.recover(ac, base);
  }

  /** Havada infilak: büyük ateş topu ve yağan enkaz. */
  private disintegrate(ac: Aircraft): void {
    ac.status = 'dead';
    ac.velocity(_v);
    this.events.push({ kind: 'airExplosion', pos: ac.pos.clone(), size: ac.spec.size });
    this.events.push({
      kind: 'debris', pos: ac.pos.clone(), vel: _v.clone().multiplyScalar(0.75), count: 4 + Math.round(ac.spec.size * 0.6),
      size: ac.spec.size * 0.22, burning: true,
    });
  }

  private bailOut(ac: Aircraft): void {
    ac.bailed = true;
    const n = Math.min(ac.spec.crew, 3);
    // Atlayan kişi sayısı (ölen pilot atlayamaz); görünür paraşütlere paylaştırılır
    const survivors = Math.max(0, ac.crewLost - (ac.damage.pilot === 2 ? 1 : 0));
    ac.velocity(_v);
    for (let i = 0; i < n; i++) {
      const vel = _v.clone().multiplyScalar(0.25).add(new Vector3(rand(-6, 6), rand(-2, 4), rand(-6, 6)));
      const people = Math.floor(survivors / n) + (i < survivors % n ? 1 : 0);
      this.parachutes.push({
        id: this.nextChuteId++, pos: ac.pos.clone().add(new Vector3(rand(-3, 3), -2, rand(-3, 3))), vel, team: ac.team,
        name: ac.callsign, t: -i * 0.8, people,
      });
    }
    this.log(`${ac.callsign}: ${n > 1 ? 'mürettebat' : 'pilot'} paraşütle atladı`, ac.team, 'combat');
  }

  private updateParachutes(dt: number): void {
    let w = 0;
    for (const p of this.parachutes) {
      p.t += dt;
      if (p.t < 0) {
        this.parachutes[w++] = p;
        continue;
      }
      if (p.t < 2) {
        // Serbest düşüş
        p.vel.y -= G * dt;
        p.vel.multiplyScalar(Math.exp(-0.25 * dt));
      } else {
        // Paraşüt açık: 5,5 m/s iniş, yatay hız sönümlenir, hafif rüzgâr
        p.vel.x += (2.5 - p.vel.x) * Math.min(1, dt * 1.2);
        p.vel.z += (1 - p.vel.z) * Math.min(1, dt * 1.2);
        p.vel.y += (-5.5 - p.vel.y) * Math.min(1, dt * 2);
      }
      p.pos.addScaledVector(p.vel, dt);
      const g = groundLevel(p.pos.x, p.pos.z);
      if (p.pos.y <= g + 1) {
        const water = terrainHeight(p.pos.x, p.pos.z) < 0;
        const home = !water && this.crewSurvives(p.team, p.pos.x, p.pos.z, p.people);
        const where = water ? 'denize indi' : home ? 'kendi bölgesine indi, kurtarıldı' : 'düşman bölgesine indi, esir düştü';
        this.log(`${p.name} mürettebatı ${where}`, p.team, 'combat');
        continue;
      }
      this.parachutes[w++] = p;
    }
    this.parachutes.length = w;
  }

  private crash(ac: Aircraft, reason: string | null): void {
    if (ac.status === 'flying') {
      this.loseAirframe(ac);
      for (const s of this.structures) s.airbase?.cancelLanding(ac.id);
      if (reason) this.log(`${ac.callsign} ${reason}`, ac.team, 'combat');
    }
    ac.status = 'dead';
    ac.pos.y = groundLevel(ac.pos.x, ac.pos.z);
    this.events.push({ kind: 'crash', pos: ac.pos.clone() });
  }

  // ------------------------------------------------------------------ adım

  step(dt: number): void {
    for (const a of this.aircraft) {
      a.prevPos.copy(a.pos);
      a.prevQuat.copy(a.quat);
      a.prevValid = true;
    }
    this.time += dt;

    for (const t of this.teams) {
      for (const id of t.research.update(dt)) {
        const node = TECH_BY_ID[id];
        const name = node.specId ? SPECS[node.specId]?.name ?? node.name : node.name;
        this.log(`Araştırma tamamlandı: ${name}${node.kind === 'aircraft' ? ' (üretime hazır)' : ''}`, t.id, 'research');
      }
    }
    for (const s of this.structures) this.updateStructure(s, dt);
    this.personnelTimer -= dt;
    if (this.personnelTimer <= 0) {
      this.personnelTimer = 1;
      this.updatePersonnel(1);
      this.updateMarket();
      if (this.economyEnabled) this.tickIncome();
      if (this.setup) this.updateCampaign();
    }
    for (const c of this.commanders) c.update(this, dt);
    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 3;
      for (const t of this.teams) alertScramble(this, t.id, t.ai, 3);
      for (const t of this.teams) t.intel.prune(this.time, (id) => !!this.aircraftById(id)?.airborne);
    }
    this.observeTimer -= dt;
    if (this.observeTimer <= 0) {
      this.observeTimer = 2;
      this.groundObservers();
    }

    for (const fl of this.flights) fl.update(this, dt);
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const fl = this.flights[i];
      if (fl.phase === 'done') {
        if (fl.landed > 0 || fl.members.length > 0) {
          this.log(`${fl.name} kolu görevi bitirdi: ${fl.landed}/${fl.expected} uçak döndü`, fl.team, 'ops');
        }
        this.finishMission(fl);
        this.flights.splice(i, 1);
      }
    }

    for (const ac of this.aircraft) {
      if (ac.status === 'flying') {
        if (ac.onGround) {
          ac.brain.groundUpdate(ac, this, dt);
        } else {
          ac.brain.update(ac, this, dt);
          stepFlight(ac, dt);
          this.fireWeapons(ac, dt);
          updateTurrets(ac, this, dt);
          this.updateFire(ac, dt);
          this.updateHeat(ac, dt);
          // G yorgunluğu: 4,5 G üstü birikir, düşük G'de toparlanır; tecrübeli pilot daha dayanıklı. G elbisesi eşiği
          // ~1 G yükseltir ve birikimi yarıya indirir (Kore'de F-86 pilotlarının MiG pilotlarına karşı üstünlüklerinden biri)
          const gLim = ac.mods.gSuit ? 5.5 : 4.5;
          const gRate = ac.mods.gSuit ? 0.006 : 0.012;
          ac.fatigue = clamp(ac.n > gLim ? ac.fatigue + ((ac.n - gLim) * dt * gRate) / ac.skill : ac.fatigue - dt * 0.02, 0, 1);
          this.checkDeparture(ac, dt);
          this.checkGround(ac);
        }
        burnFuel(ac, dt);
      } else if (ac.status === 'falling') {
        this.stepFalling(ac, dt);
      }
    }
    for (let i = this.aircraft.length - 1; i >= 0; i--) {
      const ac = this.aircraft[i];
      if (ac.status === 'dead' || ac.status === 'recovered') {
        this.aircraft.splice(i, 1);
        this.acById.delete(ac.id);
      }
    }
    this.updateBullets(dt);
    this.updateRockets(dt);
    this.updateBombs(dt);
    this.updateFlak(dt);
    this.updateParachutes(dt);
  }

  /** Vurulan uçağın düşüşü: biçimine göre kumanda, atlama ve dalışta parçalanma. */
  private stepFalling(ac: Aircraft, dt: number): void {
    const c = ac.controls;
    c.diveBrake = false;
    c.flaps = false;
    c.wep = false;
    c.rollRate = ac.spin;
    switch (ac.fallMode) {
      case 'glide':
        // Pilot öldü: uçak hafif yatışla süzülür, yavaş yavaş burun düşer
        c.nCmd = 0.9;
        c.throttle = 0.3;
        break;
      case 'dive':
        c.nCmd = 0.15;
        c.throttle = 0.5;
        break;
      case 'roll':
        c.nCmd = 0.1;
        c.throttle = 0;
        break;
      default:
        c.nCmd = 0.4;
        c.throttle = 0;
    }
    stepFlight(ac, dt);
    if (!ac.bailed && this.time >= ac.brain.bailAt) this.bailOut(ac);
    // Kontrolsüz dalış yapısal sınırı aşınca uçak havada dağılır
    if (iasOf(ac) > ac.spec.vne * 1.3 && Math.random() < dt * 2) {
      this.log(`${ac.callsign} dalışta parçalandı`, ac.team, 'combat');
      this.disintegrate(ac);
      return;
    }
    if (ac.pos.y <= groundLevel(ac.pos.x, ac.pos.z)) this.crash(ac, null);
  }

  private updateStructure(s: Structure, dt: number): void {
    if (s.build < 1 && !s.destroyed) {
      const busy = this.structures.filter((o) => o.team === s.team && o.build < 1 && !o.destroyed && o.def.category === s.def.category);
      if (busy.indexOf(s) < (s.def.category === 'city' ? 4 : s.def.category === 'economy' ? 2 : 3)) {
        s.build = Math.min(1, s.build + dt / s.def.buildTime);
        if (s.build >= 1) this.log(`${s.name} tamamlandı`, s.team, 'build');
      }
      return;
    }
    if (s.kind === 'mine' && s.active && this.economyEnabled) {
      const inc = this.mineOutput(s) * dt;
      const t = this.teams[s.team];
      s.earned += inc;
      this.credit(t, inc);
      t.mineAcc += inc;
    }
    if (s.repairing) this.updateRepair(s, dt);
    s.airbase?.update(this, dt);
    s.aa?.update(this, s, dt);
    s.radar?.update(this, s, dt);
    s.factory?.update(this, s, dt);
  }

  /** Onarımı başlat ya da durdur (bitmiş, ayakta ve hasarlı yapı). */
  setRepair(s: Structure, on: boolean): boolean {
    if (on && (!s.active || s.hp >= s.maxHp || s.repairing)) return false;
    s.repairing = on;
    // Botların onarımları günlüğü doldurmasın
    if (on && !this.teams[s.team]?.ai) this.log(`${s.name}: onarım başladı`, s.team, 'build');
    return true;
  }

  /** Tam onarıma kalan bedel (kr) ve süre (s). */
  repairEstimate(s: Structure): { cost: number; time: number } {
    const f = Math.max(0, 1 - s.hp / s.maxHp);
    return { cost: this.economyEnabled ? Math.round((STRUCTURE_COST[s.kind] * REPAIR_COST * f) / 50) * 50 : 0, time: f * REPAIR_TIME };
  }

  /** Onarım bekliyor mu (son isabetten sonra REPAIR_DELAY); bekliyorsa kalan süre. */
  repairWait(s: Structure): number {
    return Math.max(0, REPAIR_DELAY - (this.time - s.lastHit));
  }

  /** Onarım ilerler, bedeli adım adım ödenir (para yetmezse bekler). */
  private updateRepair(s: Structure, dt: number): void {
    if (!s.active || this.repairWait(s) > 0) return;
    const dh = Math.min(s.maxHp - s.hp, (s.maxHp / REPAIR_TIME) * dt);
    if (this.economyEnabled) {
      const cost = (dh / s.maxHp) * STRUCTURE_COST[s.kind] * REPAIR_COST;
      const t = this.teams[s.team];
      if (t.money < cost) return;
      t.money -= cost;
      t.spent += cost;
      t.repairAcc += cost;
    }
    s.hp += dh;
    if (s.hp >= s.maxHp - 1e-6) {
      s.hp = s.maxHp;
      s.repairing = false;
      if (!this.teams[s.team]?.ai) this.log(`${s.name} onarıldı`, s.team, 'build');
    }
  }

  /** Yer gözcüleri: her yapı çevresini gözle tarar (6 km, arazi görüşü). */
  private groundObservers(): void {
    for (const s of this.structures) {
      if (!s.active) continue;
      const intel = this.teams[s.team].intel;
      const range = 6000 * (this.teams[s.team].research.has('observer') ? 1.5 : 1);
      for (const ac of this.aircraft) {
        if (ac.team === s.team || !ac.airborne) continue;
        const d = ac.pos.distanceTo(s.pos);
        if (d > range * Math.sqrt(ac.spec.size / 6.5)) continue;
        if (Math.random() > 0.65) continue;
        if (!lineOfSight(s.pos.x, s.pos.y + 15, s.pos.z, ac.pos.x, ac.pos.y, ac.pos.z)) continue;
        intel.report(ac, 'visual', this.time);
      }
    }
  }

  private updateFire(ac: Aircraft, dt: number): void {
    const d = ac.damage;
    if (d.fire <= 0) return;
    d.fire += dt;
    ac.hp -= (d.fireSource === 'fuel' ? 3 : 2.2) * dt;
    // Dalışla hız kazanmak alevi söndürebilir
    const diving = ac.speed > ac.spec.cruiseSpeed * 1.2 && ac.fwd.y < -0.3;
    if (Math.random() < (diving ? 0.16 : 0.02) * dt) {
      d.fire = 0;
      d.fireSource = null;
      this.log(`${ac.callsign}: yangın söndü`, ac.team, 'combat');
      return;
    }
    const attacker = ac.lastHitFrom !== null ? this.aircraftById(ac.lastHitFrom) ?? null : null;
    const src = attacker?.callsign ?? 'Yangın';
    const team = attacker?.team ?? (ac.lastHitTeam >= 0 ? ac.lastHitTeam : ac.team);
    // Yangın depoya ulaşırsa infilak
    const reach = (d.fireSource === 'fuel' ? 0.16 : 0.08) * (hasSealedTanks(ac) ? 0.5 : 1);
    if (d.fire > 2 && Math.random() < reach * dt) {
      this.kill(ac, 'yangın depoya ulaştı, infilak etti', attacker, src, team, true);
      return;
    }
    if (d.fire > 28 || ac.hp <= 0) this.kill(ac, 'yangın', attacker, src, team);
  }

  /** Radyatör / yağ kaybı: motor ısınır, sonunda kilitlenir. */
  private updateHeat(ac: Aircraft, dt: number): void {
    const d = ac.damage;
    if (d.coolant <= 0 || ac.totalFuel <= 0) return;
    d.heat = Math.min(1, d.heat + d.coolant * dt * 0.02 * (0.5 + ac.controls.throttle));
    if (d.heat < 1) return;
    // En hasarlı çalışan motor kilitlenir
    let worst = -1;
    for (let i = 0; i < d.engines.length; i++) if (d.engines[i] < 1 && (worst < 0 || d.engines[i] > d.engines[worst])) worst = i;
    if (worst < 0) return;
    d.engines[worst] = 1;
    this.log(`${ac.callsign}: motor hararet yaptı ve kilitlendi`, ac.team, 'combat');
    if (d.engines.some((e) => e < 1)) {
      d.heat = 0.4;
      d.coolant *= 0.5;
    } else d.coolant = 0;
  }

  /**
   * Dalaşta tutunma eşiğinde uzun süre çeken pilot vrilleye düşebilir (acemide daha olası).
   * Vrilleden çıkmak birkaç saniye ve irtifa ister; yere yakınsa uçak kaybedilir.
   */
  private checkDeparture(ac: Aircraft, dt: number): void {
    if (ac.departure > 0 || ac.brain.ops.mode !== 'none') return;
    if (!ac.brain.target && !ac.brain.threat) return;
    // Vrilleye yatkın uçak tutunmanın biraz altında da (uyarısız) kaçar
    const prone = ac.spec.spinProne;
    if (ac.stallRatio < clamp(0.97 - 0.05 * (prone - 1), 0.88, 0.99) || ac.speed > stallSpeed(ac) * 1.7) return;
    const p = 0.04 * prone * Math.max(0.25, 1.25 - 0.55 * ac.skill) * (ac.damage.pilot === 1 ? 1.5 : 1);
    if (Math.random() >= p * dt) return;
    ac.departure = rand(2.5, 5);
    ac.lastDepart = this.time;
    ac.departSpin = (Math.random() < 0.5 ? -1 : 1) * rand(2, 3.5);
    this.log(`${ac.callsign}: tutunma kaybı, vrilleye girdi`, ac.team, 'combat');
  }

  private checkGround(ac: Aircraft): void {
    const g = groundLevel(ac.pos.x, ac.pos.z);
    if (ac.pos.y - gearHeight(ac.spec) > g) return;
    if (canTouchDown(ac, ac.brain, this)) {
      touchDown(ac, ac.brain, this);
      return;
    }
    if (ac.pos.y > g) return;
    // Dalaşta vrilleden çıkamayan uçak: kovalayana "manevra düşürmesi" yazılır
    if (ac.departure > 0 || this.time - ac.lastDepart < 10) {
      const chaser = ac.brain.threat ?? ac.brain.target ?? this.lastAttacker(ac);
      if (chaser && chaser.team !== ac.team) {
        this.creditKill(ac, chaser, chaser.team);
        this.log(`${chaser.callsign}, ${ac.callsign} (${ac.spec.abbr}) uçağını düşürdü — vrilleden çıkamadı (manevra düşürmesi)`, chaser.team, 'kill');
        this.crash(ac, null);
        return;
      }
    }
    // Düşman ateşiyle ağır hasar almış (irtifa tutamayan, kumandası/kanadı/motoru bozuk) uçağın yere düşmesi savaşın
    // sonucudur: düşürme, hasarı veren uçağa ya da uçaksavara yazılır. "Yere çakıldı" yalnız gerçek kendi kazası içindir.
    // Ağır hasarlıysa süre sınırı yok (o hasarla üsse sürünürken düştü)
    const hitRecently = this.time - ac.lastHitTime < 300 && ac.hp < ac.hpMax * 0.75;
    if (ac.lastHitTeam >= 0 && ac.lastHitTeam !== ac.team && (isCrippled(ac) || hitRecently)) {
      const att = this.lastAttacker(ac);
      const team = att?.team ?? ac.lastHitTeam;
      this.creditKill(ac, att, team);
      const water = terrainHeight(ac.pos.x, ac.pos.z) < 0;
      this.log(`${att?.callsign ?? 'Uçaksavar'}, ${ac.callsign} (${ac.spec.abbr}) uçağını düşürdü — hasarlı uçak ${water ? 'denize' : 'yere'} düştü`, team, 'kill');
      this.crash(ac, null);
      return;
    }
    const water = terrainHeight(ac.pos.x, ac.pos.z) < 0;
    // Dalaştaki sağlam uçağın yere çarpması pilot hatasıdır (dalıştan geç çıkma, alçakta yanlış kestirme): seyrek ve
    // acemide daha olası; günlükte ayrı yazılır
    const fighting = !!(ac.brain.target || ac.brain.threat);
    const spun = ac.departure > 0 || this.time - ac.lastDepart < 10;
    const reason = ac.brain.ops.mode === 'landing' ? 'iniş kazası yaptı'
      : spun ? `alçakta vrilleden çıkamayıp ${water ? 'denize' : 'yere'} çakıldı (pilot hatası)`
      : fighting ? `dalaşta ${water ? 'denize' : 'yere'} çakıldı (pilot hatası)` : water ? 'denize düştü' : 'yere çakıldı';
    this.crash(ac, reason);
  }

  // ------------------------------------------------------------------ mermiler

  private updateBullets(dt: number): void {
    const list = this.bullets;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      b.prev.copy(b.pos);
      b.vel.y -= G * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      let alive = true;
      for (const ac of this.aircraft) {
        if (ac.team === b.team || ac.status !== 'flying' || ac.onGround) continue;
        const dx = ac.pos.x - b.pos.x;
        const dz = ac.pos.z - b.pos.z;
        if (dx * dx + dz * dz > 90000) continue;
        if (b.proximity && b.burstRadius > 0 && ac.pos.distanceTo(b.pos) < b.burstRadius * 0.8) {
          this.burst(b);
          alive = false;
          break;
        }
        const hb = hitBoxOf(ac.spec);
        if (!segmentHitsSphere(b.prev, b.pos, ac.pos, hb.bound + 20)) continue;
        // Hedefe göre bağıl mermi yolu (hedef de bu adımda ilerledi)
        _rs.subVectors(b.prev, ac.prevValid ? ac.prevPos : ac.pos);
        _re.subVectors(b.pos, ac.pos);
        _rt.crossVectors(ac.fwd, ac.upv);
        const hit = segmentHitsAircraft(hb, ac.fwd, ac.upv, _rt, _rs, _re);
        if (hit) {
          const owner = b.ownerId > 0 ? this.aircraftById(b.ownerId) ?? null : null;
          _v.copy(ac.pos).add(_re.lerp(_rs, 1 - hit.t));
          this.events.push({ kind: 'hit', pos: _v.clone() });
          this.hitAircraft(ac, b.damage, b.caliber, b.vel, owner, owner?.callsign ?? b.sourceName, b.team, b.belt ?? null, hit.zone);
          alive = false;
          break;
        }
      }
      if (!alive) continue;
      const g = groundLevel(b.pos.x, b.pos.z);
      if (b.pos.y <= g) {
        b.pos.y = g;
        this.events.push({ kind: 'groundHit', pos: b.pos.clone(), water: terrainHeight(b.pos.x, b.pos.z) < 0 });
        this.bulletHitsGround(b);
        continue;
      }
      if (b.life <= 0) {
        if (b.burstRadius > 0) this.burst(b);
        continue;
      }
      list[w++] = b;
    }
    list.length = w;
  }

  /** Kendini imha eden / yakınlık tapalı orta kalibre mermi patlaması. */
  private burst(b: Bullet): void {
    this.events.push({ kind: 'flak', pos: b.pos.clone(), size: 0.5 });
    for (const ac of this.aircraft) {
      if (ac.team === b.team || ac.status !== 'flying' || ac.onGround) continue;
      const d = ac.pos.distanceTo(b.pos);
      if (d < b.burstRadius) {
        _dir.subVectors(ac.pos, b.pos);
        this.hitAircraft(ac, b.damage * (1 - d / b.burstRadius) * 0.8, 'cannon', _dir, null, b.sourceName, b.team);
      }
    }
  }

  /** Taciz ateşi: yer hedefinin yakınına düşen mermi hasar verir. */
  private bulletHitsGround(b: Bullet): void {
    if (b.ownerId <= 0) return;
    for (const s of this.structures) {
      if (s.team === b.team || s.destroyed) continue;
      const d = Math.hypot(s.pos.x - b.pos.x, s.pos.z - b.pos.z);
      if (d < s.def.radius + 15) {
        const fl = this.aircraftById(b.ownerId)?.flight;
        this.damageStructure(s, b.damage * 0.35 * (b.belt?.ground ?? 1), b.sourceName, b.team, fl?.id ?? 0);
      }
    }
  }

  private updateRockets(dt: number): void {
    const list = this.rockets;
    let w = 0;
    for (const r of list) {
      if (r.burn > 0) {
        _dir.copy(r.vel).normalize();
        r.vel.addScaledVector(_dir, 300 * dt);
        r.burn -= dt;
      }
      r.vel.y -= G * dt;
      r.pos.addScaledVector(r.vel, dt);
      r.life -= dt;
      const g = groundLevel(r.pos.x, r.pos.z);
      if (r.pos.y <= g) {
        r.pos.y = g;
        this.explodeGround(r.pos, r.blastRadius, r.damage, r.team, r.sourceName, r.flightId);
        continue;
      }
      if (r.life > 0) list[w++] = r;
    }
    list.length = w;
  }

  private updateBombs(dt: number): void {
    const list = this.bombs;
    let w = 0;
    for (const b of list) {
      b.vel.y -= G * dt;
      b.pos.addScaledVector(b.vel, dt);
      const g = groundLevel(b.pos.x, b.pos.z);
      if (b.pos.y <= g) {
        b.pos.y = g;
        this.explodeGround(b.pos, b.blastRadius, b.damage, b.team, b.ownerName, b.flightId);
      } else list[w++] = b;
    }
    list.length = w;
  }

  private explodeGround(pos: Vector3, blast: number, damage: number, team: number, source: string, flightId = 0): void {
    this.events.push({ kind: 'groundExplosion', pos: pos.clone(), size: blast });
    for (const s of this.structures) {
      if (s.team === team || s.destroyed) continue;
      const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
      let dmg = 0;
      if (s.airbase && s.airbase.bombHit(pos.x, pos.z, blast, damage)) dmg = damage * 0.4;
      // Büyük yapıda bomba ancak çevresindeki binaları yıkar: merkeze yakın isabet daha etkili
      const edge = d - s.def.radius;
      if (edge < blast) dmg = Math.max(dmg, damage * (edge <= 0 ? 0.55 + 0.45 * (1 - d / s.def.radius) : 0.55 * (1 - edge / blast)));
      if (dmg <= 0) continue;
      // Hangardaki uçaklar
      const shelter = s.airbase?.upgrades.has('revetments') ? 0.3 : 1;
      if (s.airbase && d < 700 && s.airbase.inventory.length > 0 && Math.random() < 0.08 * (damage / 95) * shelter) {
        const idle = s.airbase.inventory.filter((a) => a.status !== 'airborne');
        if (idle.length) {
          const af = idle[Math.floor(Math.random() * idle.length)];
          s.airbase.removeAirframe(af);
          s.airbase.lostCount++;
          this.log(`${s.name}: hangarda bir ${SPECS[af.specId].abbr} yok edildi`, team, 'strike');
        }
      }
      this.damageStructure(s, dmg, source, team, flightId);
    }
  }

  damageStructure(s: Structure, dmg: number, source: string, team: number, flightId = 0): void {
    if (s.destroyed) return;
    s.lastHit = this.time;
    // Kamuflaj ve sahte mevziler: uçaksavar bataryaları daha az isabet alır
    if (s.aa && this.teams[s.team]?.research.has('hd_camo')) dmg *= 0.75;
    const before = s.hp;
    s.hp = Math.max(0, s.hp - dmg);
    // Görev sonucu: saldıran kolun hanesine; savunan tarafın bu bölgedeki devriyesinin hanesine
    const done = before - s.hp;
    const fl = flightId ? this.flightById(flightId) : undefined;
    if (fl) {
      fl.stats.anyDamage += done;
      if (fl.plan.targetStructureId === s.id) fl.stats.targetDamage += done;
    }
    for (const f of this.flights) {
      if (f.team !== s.team || f.plan.type !== 'cap' || f.phase !== 'action' || !f.plan.targetPos) continue;
      if (Math.hypot(f.plan.targetPos.x - s.pos.x, f.plan.targetPos.z - s.pos.z) < f.plan.patrolRadius + 3000) f.stats.areaDamage += done;
    }
    this.teams[team]?.research.award((before - s.hp) * 0.5);
    if (s.hp <= 0) {
      this.teams[team]?.research.award(250);
      this.earn(team, Math.round(STRUCTURE_COST[s.kind] * STRUCTURE_REWARD), `Yıkılan düşman yapısı: ${s.def.name}`);
      this.events.push({ kind: 'structureDestroyed', id: s.id });
      s.repairing = false;
      this.log(`${source}: ${s.name} imha edildi!`, team, 'strike');
      if (s.factory) s.factory.queue.length = 0;
      return;
    }
    const last = this.hitLogTimes.get(s.id) ?? -1e9;
    if (this.time - last > 6) {
      this.hitLogTimes.set(s.id, this.time);
      this.log(`${s.name} vuruldu (%${Math.round((s.hp / s.maxHp) * 100)} sağlam)`, team, 'strike');
    }
  }

  private updateFlak(dt: number): void {
    let w = 0;
    for (const sh of this.flak) {
      sh.t -= dt;
      if (sh.t > 0) {
        this.flak[w++] = sh;
        continue;
      }
      this.events.push({ kind: 'flak', pos: sh.pos, size: 1 });
      for (const ac of this.aircraft) {
        if (ac.team === sh.team || ac.status !== 'flying' || ac.onGround) continue;
        const d = ac.pos.distanceTo(sh.pos);
        // Yakına düşen patlamayı mürettebat görür: kol zikzağa başlar
        if (d < 400) {
          ac.flakTime = this.time;
          if (ac.flight) ac.flight.flakTime = this.time;
        }
        if (d < sh.radius) {
          _dir.subVectors(ac.pos, sh.pos);
          // Parçacıklar: birkaç ayrı isabet
          const hits = d < sh.radius * 0.4 ? 3 : 1;
          for (let k = 0; k < hits; k++) {
            this.hitAircraft(ac, (sh.damage * (1 - d / sh.radius)) / hits, 'cannon', _dir, null, sh.sourceName, sh.team);
          }
        }
      }
    }
    this.flak.length = w;
  }
}

export function clonePlan(p: MissionPlan): MissionPlan {
  return {
    ...p,
    targetPos: p.targetPos?.clone() ?? null,
    waypoints: p.waypoints.map((w) => w.clone()),
  };
}

export type { AircraftSpec };
