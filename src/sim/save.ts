// Oyun kaydı: dünyanın stratejik durumunu düz JSON'a çevirir ve geri kurar.
//
// Saklananlar: zaman, taraflar (araştırma, kasa, defter, personel), tüm yapılar (inşaat, hasar, hangar, tesisler,
// uçaksavar silahları, fabrika sırası, maden verimi), yapay zekâ zamanlayıcıları, pazar, olay günlüğü.
// Havadaki uçaklar kayıtta üslerine dönmüş sayılır (hangarda bakımda); mermi, bomba ve paraşütler saklanmaz.
// Arazi düzleştirmeleri yapılardan yeniden üretilir.

import { Vector3 } from 'three';
import { World, type LogEntry } from './world';
import { Structure, STRUCTURE_DEFS, type StructureKind } from './structures/structure';
import { reserveAirframeIds, type Airframe, type BaseUpgrade } from './structures/airbase';
import { AA_WEAPONS, type AASensorId, type AAWeaponId } from './structures/airDefense';
import type { GunItem } from './structures/factory';
import { Commander, type CommanderOptions, type CommanderState } from './commander';
import type { LedgerEntry, MarketOffer } from './economy';
import type { MissionReport } from './missionResult';
import { SLOT_ORDER, type Slot } from './tech';
import { flattenFootprint, loadMap } from './terrain';
import { MAP_BASE } from './mapData';
import { L } from '../i18n';

/** 2: 300 km haritalar (eski 150 km kayıtları yüklenemez). */
export const SAVE_VERSION = 2;

/** 2026-10-21 öncesi kayıtlarda canı değişen yapıların eski azami canı. */
const LEGACY_MAX_HP: Partial<Record<StructureKind, number>> = { house: 60, park: 80, apartment: 240, radar: 240, shops: 300, airbase: 3000 };

interface SlotSave {
  current: { id: string; progress: number; paid: number } | null;
  queue: string[];
}

interface TeamSave {
  name: string;
  color: string;
  ai: boolean;
  flightCounter: number;
  /** Depodaki toplar (eski kayıtlarda yok). */
  gunStock?: Partial<Record<AAWeaponId, number>>;
  /** Eski kayıtlarda `defense` hattı yok. */
  research: { done: string[]; slots: Record<'tech' | 'vehicle', SlotSave> & Partial<Record<Slot, SlotSave>>; points: number; totalPoints: number };
  people: number;
  capacity: number;
  recruit: number;
  money: number;
  ledger: LedgerEntry[];
  earned: number;
  spent: number;
  kills?: number;
  peakFleet?: number;
  eliminated?: boolean;
  lastStand?: number | null;
}

interface StructureSave {
  id: number;
  team: number;
  kind: StructureKind;
  name: string;
  pos: [number, number, number];
  heading: number;
  build: number;
  hp: number;
  repairing?: boolean;
  lastHit?: number;
  /** Kayıt anındaki azami can (yoksa eski sürüm: LEGACY_MAX_HP). */
  maxHp?: number;
  attachedTo: number | null;
  richness: number;
  earned: number;
  airbase?: {
    inventory: Airframe[];
    upgrades: BaseUpgrade[];
    job: { key: BaseUpgrade; left: number; total: number } | null;
    runwayDamage: number;
    craters: { u: number; v: number }[];
    alert: { enabled: boolean; specId: string; count: number; radius: number };
    lostCount: number;
  };
  aa?: {
    level: number;
    weapons: AAWeaponId[];
    /** Takılmakta olan yuvalara kalan süre (eski kayıtlarda yok). */
    installs?: number[];
    sensors: AASensorId[];
    job: { key: string; label: string; left: number; total: number } | null;
    crew: number;
    shotsFired: number;
  };
  radar?: { level: 1 | 2 };
  factory?: { queue: { specId: string; progress: number; paid: number }[]; repeat: boolean; guns?: GunItem[] };
}

export interface SaveData {
  v: number;
  scenarioId: string;
  mapId: string;
  /** Harita büyüklüğü (m); önceki kayıtlarda yok (300 km). */
  mapSize?: number;
  time: number;
  /** Gerçek oynanma süresi (sn). Eski kayıtlarda yok: orada sayaç oyun zamanından sürer. */
  playTime?: number;
  playerTeam: number;
  playerName: string;
  setup: { enemies: number } | null;
  /** Harekâtın kazananı (yoksa sürüyor). */
  winner?: number | null;
  /** Harekâtın kimliği (skor tablosu; eski kayıtlarda yok). */
  campaign?: string;
  personnelEnabled: boolean;
  economyEnabled: boolean;
  teams: TeamSave[];
  structures: StructureSave[];
  commanders: { team: number; opts: CommanderOptions; state: CommanderState }[];
  market: { offers: MarketOffer[]; nextRefresh: number; nextId: number };
  nameCounters: [string, number][];
  logs: LogEntry[];
  /** Görev sonuçları (yoksa boş: eski kayıt). */
  missionReports?: MissionReport[];
  missionTally?: [string, { success: number; fail: number; none: number }][];
  camera?: { x: number; z: number; distance: number; yaw: number; pitch: number };
}

/** Dünyayı kayda çevir. */
export function serializeWorld(w: World, scenarioId: string): SaveData {
  // Havadaki uçakların mürettebatı eve dönmüş sayılır
  const teams: TeamSave[] = w.teams.map((t) => ({
    name: t.name, color: t.color, ai: t.ai, flightCounter: t.flightCounter, gunStock: { ...t.gunStock },
    research: {
      done: [...t.research.done],
      slots: {
        tech: { current: t.research.slots.tech.current ? { ...t.research.slots.tech.current } : null, queue: [...t.research.slots.tech.queue] },
        vehicle: { current: t.research.slots.vehicle.current ? { ...t.research.slots.vehicle.current } : null, queue: [...t.research.slots.vehicle.queue] },
        defense: { current: t.research.slots.defense.current ? { ...t.research.slots.defense.current } : null, queue: [...t.research.slots.defense.queue] },
      },
      points: t.research.points, totalPoints: t.research.totalPoints,
    },
    people: t.personnel.people, capacity: t.personnel.capacity, recruit: t.personnel.recruit,
    money: t.money, ledger: t.ledger.map((e) => ({ ...e })), earned: t.earned, spent: t.spent, kills: t.kills, peakFleet: t.peakFleet,
    eliminated: t.eliminated, lastStand: t.lastStand,
  }));
  const structures: StructureSave[] = w.structures.map((s) => {
    const o: StructureSave = {
      id: s.id, team: s.team, kind: s.kind, name: s.name, pos: [s.pos.x, s.pos.y, s.pos.z], heading: s.heading,
      build: s.build, hp: s.hp, maxHp: s.maxHp, attachedTo: s.attachedTo, richness: s.richness, earned: s.earned,
      repairing: s.repairing, lastHit: Number.isFinite(s.lastHit) ? s.lastHit : undefined,
    };
    const ab = s.airbase;
    if (ab) {
      o.airbase = {
        inventory: ab.inventory.map((af) => {
          const c = { ...af };
          // Havadaki ya da kalkış sırasındaki uçak üssüne dönmüş, bakımda sayılır
          if (c.status === 'airborne') {
            c.status = 'servicing';
            c.readyAt = w.time + 120;
          }
          c.aircraftId = null;
          return c;
        }),
        upgrades: [...ab.upgrades], job: ab.job ? { ...ab.job } : null, runwayDamage: ab.runwayDamage,
        craters: ab.craters.map((c) => ({ ...c })),
        alert: { enabled: ab.alert.enabled, specId: ab.alert.specId, count: ab.alert.count, radius: ab.alert.radius },
        lostCount: ab.lostCount,
      };
    }
    if (s.aa) {
      o.aa = {
        level: s.aa.level, weapons: s.aa.mounts.map((m) => m.weapon), installs: s.aa.mounts.map((m) => m.install), sensors: [...s.aa.sensors],
        job: s.aa.job ? { ...s.aa.job } : null, crew: s.aa.crew, shotsFired: s.aa.shotsFired,
      };
    }
    if (s.radar) o.radar = { level: s.radar.level };
    if (s.factory) o.factory = { queue: s.factory.queue.map((q) => ({ ...q })), repeat: s.factory.repeat, guns: s.factory.gunQueue.map((q) => ({ ...q })) };
    return o;
  });
  return {
    v: SAVE_VERSION,
    scenarioId,
    mapId: w.mapId,
    mapSize: w.mapSize,
    time: w.time,
    playTime: w.playTime,
    playerTeam: w.playerTeam,
    playerName: w.playerName,
    setup: w.setup ? { ...w.setup } : null,
    winner: w.winner,
    campaign: w.campaignId || undefined,
    personnelEnabled: w.personnelEnabled,
    economyEnabled: w.economyEnabled,
    teams,
    structures,
    commanders: w.commanders.map((c) => ({ team: c.team, opts: { ...c.opts }, state: c.saveState() })),
    market: { offers: w.market.offers.map((o) => ({ ...o })), nextRefresh: w.market.nextRefresh, nextId: w.market.nextId },
    nameCounters: [...w.nameCounters],
    logs: w.logs.map((l) => ({ ...l })),
    missionReports: w.missionReports.map((r) => ({ ...r })),
    missionTally: [...w.missionTally].map(([k, v]) => [k, { ...v }]),
  };
}

/** Kayıttan dünyayı kur (arazi temiz başlar, yapıların düzleştirmeleri yeniden uygulanır). */
export function deserializeWorld(d: SaveData): World {
  if (!d || d.v !== SAVE_VERSION) throw new Error(L('bu kayıt eski bir harita sürümüne ait; yeni haritalarda açılamaz', 'this save belongs to an old map version and cannot be opened on the new maps'));
  // Önce kaydın haritası (arazi üretimi; büyüklüğü olmayan önceki kayıtlar 300 km), sonra dünya
  loadMap(d.mapId, d.mapSize ?? MAP_BASE);
  const w = new World();
  w.mapId = d.mapId;
  w.mapSize = d.mapSize ?? MAP_BASE;
  w.time = d.time;
  w.playTime = d.playTime ?? d.time;
  w.playerTeam = d.playerTeam;
  w.playerName = d.playerName;
  w.setup = d.setup ? { ...d.setup } : null;
  w.winner = d.winner ?? null;
  w.campaignId = d.campaign ?? '';
  w.personnelEnabled = d.personnelEnabled;
  w.economyEnabled = d.economyEnabled;
  for (const ts of d.teams) {
    const t = w.addTeam(ts.name, ts.color, [], ts.ai);
    t.flightCounter = ts.flightCounter;
    const r = t.research;
    r.done.clear();
    for (const id of ts.research.done) r.done.add(id);
    for (const k of SLOT_ORDER) {
      const sl = ts.research.slots[k];
      if (!sl) continue;
      r.slots[k].current = sl.current ? { ...sl.current } : null;
      r.slots[k].queue.length = 0;
      r.slots[k].queue.push(...sl.queue);
    }
    r.moveOldDefenseJobs();
    r.points = ts.research.points;
    r.totalPoints = ts.research.totalPoints;
    r.version++;
    t.personnel.people = ts.people;
    t.personnel.capacity = ts.capacity;
    t.personnel.recruit = ts.recruit;
    t.personnel.reserved = 0;
    t.money = ts.money;
    t.gunStock = ts.gunStock ? { ...ts.gunStock } : {};
    t.ledger.push(...ts.ledger);
    t.earned = ts.earned;
    t.spent = ts.spent;
    t.kills = ts.kills ?? 0;
    t.peakFleet = ts.peakFleet ?? 0;
    t.eliminated = ts.eliminated ?? false;
    t.lastStand = ts.lastStand ?? null;
  }
  let maxAirframe = 0;
  for (const o of d.structures) {
    const def = STRUCTURE_DEFS[o.kind];
    const pos = new Vector3(o.pos[0], o.pos[1], o.pos[2]);
    // Taban düzleştirmesi (inşaattakiler dahil: inşaat başlarken düzleştirilmişti)
    flattenFootprint(pos.x, pos.z, def.halfW + 20, def.halfL + 40, o.heading, pos.y, o.kind === 'airbase' ? 260 : def.category === 'city' ? 50 : 90);
    const s = new Structure(o.team, o.kind, o.name, pos, o.heading, o.build >= 1, o.id);
    s.build = o.build;
    // Bina canları değişince eski kayıttaki can orana göre taşınır (sağlam ev %33 hasarlı görünmesin)
    const savedMax = o.maxHp ?? LEGACY_MAX_HP[o.kind] ?? def.hp;
    s.hp = Math.min(s.maxHp, (o.hp * s.maxHp) / savedMax);
    s.attachedTo = o.attachedTo;
    s.richness = o.richness;
    s.earned = o.earned;
    s.repairing = o.repairing ?? false;
    s.lastHit = o.lastHit ?? -Infinity;
    if (s.airbase && o.airbase) {
      const ab = s.airbase;
      for (const af of o.airbase.inventory) {
        ab.inventory.push({ ...af });
        maxAirframe = Math.max(maxAirframe, af.id);
      }
      for (const u of o.airbase.upgrades) ab.upgrades.add(u);
      ab.job = o.airbase.job ? { ...o.airbase.job } : null;
      ab.runwayDamage = o.airbase.runwayDamage;
      ab.craters.push(...o.airbase.craters);
      Object.assign(ab.alert, o.airbase.alert, { cooldown: 0 });
      ab.lostCount = o.airbase.lostCount;
    }
    if (s.aa && o.aa) {
      const aa = s.aa;
      aa.level = o.aa.level;
      aa.mounts.length = 0;
      o.aa.weapons.forEach((wpn, i) => {
        aa.addMount(wpn);
        const left = o.aa?.installs?.[i] ?? 0;
        aa.mounts[i].install = left;
        aa.mounts[i].installTotal = left > 0 ? AA_WEAPONS[wpn].installTime : 0;
      });
      aa.sensors.clear();
      for (const sn of o.aa.sensors) aa.sensors.add(sn);
      aa.job = o.aa.job ? { ...o.aa.job } : null;
      aa.crew = o.aa.crew;
      aa.shotsFired = o.aa.shotsFired;
    }
    if (s.radar && o.radar) s.radar.level = o.radar.level;
    if (s.factory && o.factory) {
      s.factory.queue.push(...o.factory.queue.map((q) => ({ ...q })));
      s.factory.repeat = o.factory.repeat;
      s.factory.gunQueue.push(...(o.factory.guns ?? []).map((q) => ({ ...q })));
    }
    w.structures.push(s);
  }
  reserveAirframeIds(maxAirframe);
  for (const c of d.commanders) {
    const cm = new Commander(c.team, { ...c.opts });
    cm.loadState(c.state);
    w.commanders.push(cm);
  }
  w.market.offers.push(...d.market.offers.map((o) => ({ ...o })));
  w.market.nextRefresh = d.market.nextRefresh;
  w.market.nextId = d.market.nextId;
  for (const [k, v] of d.nameCounters) w.nameCounters.set(k, v);
  w.logs.push(...d.logs);
  if (d.missionReports) w.missionReports.push(...d.missionReports);
  for (const [k, v] of d.missionTally ?? []) w.missionTally.set(k, { ...v });
  return w;
}
