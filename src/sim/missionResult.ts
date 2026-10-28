// Görev sonucu ve tahmini başarı ihtimali.
//
// Sonuç simülasyondan gelir (zar atılmaz): her kol görev boyunca kendi sonuçlarını toplar (düşürme, kayıp, hedefe
// verdiği hasar, devriye bölgesine gelen hasar…); kol dönünce ya da yok olunca görev türüne göre başarılı, başarısız
// ya da sonuçsuz (temas yok, geri çağrıldı) sayılır. Ödül yalnız başarıda. Araştırma isabeti ve hayatta kalmayı
// gerçekten artırdığı için başarı oranı yükselir; savaşın belirsizliği yüzünden hiçbir zaman kesin olmaz.
// Planlayıcıdaki ihtimal ise bilinen etkenlerden bir tahmindir (en fazla %92).

import type { World } from './world';
import type { FlightGroup } from './ai/flightGroup';
import type { MissionPlan, MissionType } from './ai/missions';
import { SPECS, type Loadout, type Role } from './aircraft/specs';
import { STORES } from './aircraft/stores';
import { defaultLoadout } from './ai/missions';
import type { Structure } from './structures/structure';
import { STRUCTURE_COST, aircraftPrice, fmtMoney } from './economy';
import { TECH_BY_ID } from './tech';
import { L, count } from '../i18n';

export type MissionOutcome = 'success' | 'fail' | 'none';

export interface MissionStats {
  /** Bu kolun düşürdüğü düşman uçağı ve onların toplam değeri. */
  kills: number;
  killValue: number;
  /** Kaybedilen uçak. */
  losses: number;
  /** Önlemede: hedef koldan düşürülen. */
  targetKills: number;
  /** Planın hedef yapısına / tüm düşman yapılarına verilen hasar. */
  targetDamage: number;
  anyDamage: number;
  /** Devriyede: korunan bölgedeki kendi yapılarımıza gelen düşman hasarı. */
  areaDamage: number;
  /** Saldırı yapıldı (bomba bırakıldı, roket atıldı). */
  struck: boolean;
  reachedAction: boolean;
  /** Önlenen düşman kolu ve değeri. */
  targetFlightId: number | null;
  targetFlightValue: number;
  /** Komuta emriyle geri çağrıldı. */
  recalled: boolean;
  /** Değerlendirildiyse sonuç. */
  result: MissionOutcome | null;
}

export function newMissionStats(): MissionStats {
  return {
    kills: 0, killValue: 0, losses: 0, targetKills: 0, targetDamage: 0, anyDamage: 0, areaDamage: 0,
    struck: false, reachedAction: false, targetFlightId: null, targetFlightValue: 0, recalled: false, result: null,
  };
}

export interface MissionReport {
  id: number;
  team: number;
  flight: string;
  type: MissionType;
  outcome: MissionOutcome;
  reason: string;
  reward: number;
  time: number;
  aircraft: string;
}

/** Saldırıda başarı için hedefin dayanıklılığından sökülmesi gereken pay. */
export const STRIKE_NEED: Partial<Record<MissionType, number>> = { levelBomb: 0.15, diveBomb: 0.12, attack: 0.1 };

const r50 = (v: number) => Math.round(v / 50) * 50;

/** Bir kolun değeri (uçaklarının fiyatı toplamı). */
export function flightValue(fl: FlightGroup): number {
  let v = 0;
  for (const m of fl.members) v += aircraftPrice(m.spec);
  return v;
}

/** Görev ödülü (başarıda), hedefe göre. */
export function missionReward(world: World, plan: MissionPlan, stats: Pick<MissionStats, 'killValue' | 'targetFlightValue'>, escortedValue = 0, destroyed = false): number {
  switch (plan.type) {
    case 'levelBomb':
    case 'diveBomb':
    case 'attack': {
      const s = plan.targetStructureId !== null ? world.structureById(plan.targetStructureId) : undefined;
      const base = 600 + 0.15 * (s ? STRUCTURE_COST[s.kind] : 3000);
      return r50(base * (destroyed ? 1.5 : 1));
    }
    case 'intercept':
      return r50(400 + 0.05 * stats.targetFlightValue);
    case 'escort':
      return r50(500 + 0.03 * escortedValue);
    case 'cap':
      return r50(400 + 0.08 * stats.killValue);
    case 'sweep':
      return r50(300 + 0.1 * stats.killValue);
    default:
      return 0;
  }
}

/** Kol görevini bitirdi: sonucu değerlendir. */
export function evaluateMission(world: World, fl: FlightGroup): { outcome: MissionOutcome; reason: string; reward: number } {
  const st = fl.stats;
  const p = fl.plan;
  const wiped = fl.expected > 0 && st.losses >= fl.expected;
  const res = (outcome: MissionOutcome, reason: string, reward = 0) => ({ outcome, reason, reward: outcome === 'success' ? reward : 0 });
  if (st.recalled && !st.struck && st.kills === 0) return res('none', L('komuta emriyle geri çağrıldı', 'recalled by command'));
  switch (p.type) {
    case 'levelBomb':
    case 'diveBomb':
    case 'attack': {
      const s = p.targetStructureId !== null ? world.structureById(p.targetStructureId) : undefined;
      if (!s) {
        return st.anyDamage >= 200 ? res('success', L('bölgedeki hedeflere hasar verildi', 'targets in the area were damaged'), missionReward(world, p, st)) : res('fail', L('bölgede hedef vurulamadı', 'no targets hit in the area'));
      }
      const need = STRIKE_NEED[p.type] ?? 0.12;
      const frac = st.targetDamage / s.maxHp;
      const destroyed = s.destroyed && st.targetDamage > 0;
      if (destroyed || frac >= need) {
        return res('success', destroyed ? `${s.name} imha edildi` : `${s.name}: %${Math.round(frac * 100)} hasar verildi`, missionReward(world, p, st, 0, destroyed));
      }
      if (!st.reachedAction) return res('fail', wiped ? L('kol hedefe varmadan imha edildi', 'the flight was wiped out before reaching the target') : L('hedefe ulaşılamadı', 'could not reach the target'));
      return res('fail', `hedefe yeterli hasar verilemedi (%${Math.round(frac * 100)}, gereken %${Math.round(need * 100)})`);
    }
    case 'intercept': {
      const tf = st.targetFlightId !== null ? world.flightById(st.targetFlightId) : undefined;
      if (st.targetKills > 0) return res('success', L(`hedef koldan ${st.targetKills} uçak düşürüldü`, `${st.targetKills} aircraft shot down from the target flight`), missionReward(world, p, st));
      // Hedef kol saldırısını yapamadan döndüyse de önleme amacına ulaşmıştır
      if (st.kills > 0 && tf && !tf.stats.struck && tf.phase !== 'action') return res('success', L('hedef kol saldırısını yapamadan döndü', 'the target flight turned back before attacking'), missionReward(world, p, st));
      if (st.kills === 0 && st.losses === 0) return res('fail', L('hedef önlenemedi (temas kurulamadı)', 'target not intercepted (no contact)'));
      return res('fail', 'hedef kola zarar verilemedi');
    }
    case 'escort': {
      const ef = fl.escortOf;
      if (!ef) return res('none', L('eşlik edilecek kol yok', 'no flight to escort'));
      const es = ef.stats;
      if (es.recalled && !es.struck) return res('none', L('eşlik edilen kol geri çağrıldı', 'the escorted flight was recalled'));
      const maxLoss = Math.floor(ef.expected / 2);
      if ((es.struck || es.reachedAction) && es.losses <= maxLoss) {
        return res('success', L(`${ef.name} kolu hedefe ulaştı, kaybı ${es.losses}/${ef.expected}`, `${ef.name} flight reached the target, losses ${es.losses}/${ef.expected}`), missionReward(world, p, st, flightValue(ef)));
      }
      if (es.losses > maxLoss) return res('fail', L(`${ef.name} kolu ağır kayıp verdi (${es.losses}/${ef.expected})`, `${ef.name} flight took heavy losses (${es.losses}/${ef.expected})`));
      return res('fail', L(`${ef.name} kolu hedefe ulaşamadı`, `${ef.name} flight did not reach the target`));
    }
    case 'cap': {
      if (st.areaDamage > 0 && st.kills === 0) return res('fail', L('devriye bölgesi vuruldu, düşman düşürülemedi', 'the patrol area was hit and no enemy was shot down'));
      if (st.kills > 0 && st.kills >= st.losses) return res('success', L(`bölge korundu, ${st.kills} düşman düşürüldü`, `area defended, ${count(st.kills, 'enemy', 'enemies')} shot down`), missionReward(world, p, st));
      if (st.kills === 0 && st.losses === 0) return res('none', L('devriyede temas olmadı', 'no contact on patrol'));
      return res('fail', L(`kayıp (${st.losses}) düşürülenden (${st.kills}) fazla`, `losses (${st.losses}) exceeded kills (${st.kills})`));
    }
    case 'sweep': {
      if (st.kills === 0 && st.losses === 0) return res('none', L('taramada temas olmadı', 'no contact on the sweep'));
      if (st.kills > st.losses) return res('success', L(`${st.kills} düşman düşürüldü, kayıp ${st.losses}`, `${count(st.kills, 'enemy', 'enemies')} shot down, ${st.losses} lost`), missionReward(world, p, st));
      return res('fail', L(`kayıp (${st.losses}) düşürülenden (${st.kills}) fazla ya da eşit`, `losses (${st.losses}) equal to or above kills (${st.kills})`));
    }
    case 'ferry':
      return fl.landed > 0 ? res('success', L(`${fl.landed} uçak teslim edildi`, `${fl.landed} aircraft delivered`)) : res('fail', L('uçaklar teslim edilemedi', 'aircraft could not be delivered'));
  }
}

// ---------------------------------------------------------------- tahmini başarı ihtimali

/**
 * Tek bombanın hedefe beklenen hasar payı (0..1): düşüş noktası hedef merkezinden Rayleigh(σ) dağılır; yapı içinde
 * merkeze yakın isabet tam hasar, kenarda %55, dışında patlama yarıçapı boyunca sönümlenir (world.explodeGround).
 */
function hitYield(sigma: number, R: number, blast: number): number {
  let sum = 0;
  const steps = 60;
  const dMax = sigma * 4.5;
  for (let i = 0; i < steps; i++) {
    const d = ((i + 0.5) / steps) * dMax;
    const pdf = (d / (sigma * sigma)) * Math.exp(-(d * d) / (2 * sigma * sigma));
    const f = d < R ? 0.55 + 0.45 * (1 - d / R) : d < R + blast ? 0.55 * (1 - (d - R) / blast) : 0;
    sum += pdf * f * (dMax / steps);
  }
  return sum;
}

/**
 * Kuvvetin hedefe beklenen hasarı (can puanı). İsabet dağılımı saldırı biçimine ve hedefin büyüklüğüne göre, savunmasız
 * hedefe yapılan deneylerle ayarlandı: pike σ ≈ 20 m + 0,15·R (Ju 87 tam yüküyle fabrikaya ~%96 verim), taarruz
 * 35 m + 0,15·R, yatay bombalama ~32 m/km irtifa (He 111 5,5 km'den fabrikaya ~%30, madene ~%8). Topla taciz ve uçaksavar
 * bastırma kolunun önce bataryalara giden yükü hesaba katılmaz (tahmin temkinli kalır).
 */
export function expectedStrikeDamage(
  world: World, team: number, plan: MissionPlan, target: Structure,
  groups: { specId: string; count: number; loadout?: Loadout; split?: number | null }[],
): number {
  const R = target.def.radius;
  const agl = Math.max(800, plan.altitude - target.pos.y);
  const research = world.teams[team].research;
  let total = 0;
  for (const g of groups) {
    if (g.count <= 0) continue;
    const spec = SPECS[g.specId];
    const lo = g.loadout ?? spec.loadouts.find((l) => l.id === defaultLoadout(spec, plan.type, (id) => research.has(id), 0, false)) ?? spec.loadouts[0];
    const mods = research.modsFor(spec);
    let sigBomb: number;
    if (plan.type === 'levelBomb') sigBomb = 32 * (agl / 1000) * (0.5 + 0.5 * mods.bombsightMul * mods.strikeAimMul) + 0.1 * R;
    else if (plan.type === 'diveBomb') sigBomb = (20 + 0.15 * R) * (0.5 + 0.5 * mods.diveAimMul * mods.strikeAimMul);
    else sigBomb = 35 + 0.15 * R;
    const sigRocket = (30 + 0.15 * R) * (0.5 + 0.5 * mods.rocketSpreadMul);
    let per = 0;
    for (const p of lo.place) {
      const h = spec.hardpoints.find((x) => x.id === p.hp);
      const st = STORES[p.store];
      if (!h || !st || p.n <= 0) continue;
      const n = p.n * h.pylons;
      if (st.bomb) per += n * st.bomb.damage * hitYield(sigBomb, R, st.bomb.blastRadius);
      if (st.rocket) per += n * st.rocket.damage * hitYield(sigRocket, R, st.rocket.blastRadius);
    }
    const flak = g.split && g.split > 0 ? Math.min(g.split, g.count) : 0;
    total += per * (g.count - flak * 0.6);
  }
  return total;
}

export interface OddsFactor {
  label: string;
  delta: number;
}

export interface MissionOdds {
  pct: number;
  factors: OddsFactor[];
  /** Henüz araştırılmamış, ihtimali artıracak araştırmalar. */
  missing: OddsFactor[];
  /** Başarı ölçütü (oyuncuya). */
  criterion: string;
  /** Başarıda ödül (açıklamalı). */
  rewardText: string;
}

/** Görev türüne göre ihtimali artıran araştırmalar (simülasyonda gerçekten etkili olanlar). */
const RESEARCH: Record<MissionType, [string, number][]> = {
  levelBomb: [['bombsight2', 15], ['n_recon', 8], ['w_turret', 5], ['w_power_turret', 6], ['self_sealing', 4], ['radio', 3]],
  diveBomb: [['n_divesight', 14], ['n_recon', 8], ['a_diveflap', 5], ['self_sealing', 4], ['pilot_armor', 4], ['radio', 3]],
  attack: [['n_rocketsight', 10], ['rockets', 8], ['n_recon', 8], ['a_tub', 7], ['pilot_armor', 4]],
  intercept: [['radio', 8], ['radar_ew1', 8], ['gci', 10], ['n_reflector', 6], ['n_gyro', 6], ['w_20mm', 4]],
  escort: [['radio', 8], ['n_reflector', 6], ['n_gyro', 6], ['a_bubble', 4], ['w_20mm', 3], ['f_bigtank', 3]],
  cap: [['radio', 6], ['radar_ew1', 6], ['gci', 6], ['n_reflector', 6], ['n_gyro', 6]],
  sweep: [['n_reflector', 7], ['n_gyro', 7], ['a_bubble', 5], ['radio', 5], ['w_20mm', 4]],
  ferry: [],
};

const BASE: Record<MissionType, number> = { levelBomb: 40, diveBomb: 40, attack: 42, intercept: 40, escort: 50, cap: 45, sweep: 40, ferry: 95 };

const IDEAL: Record<MissionType, Role[]> = {
  levelBomb: ['bomber'], diveBomb: ['diveBomber'], attack: ['attacker', 'fighter', 'diveBomber'],
  intercept: ['fighter'], escort: ['fighter'], cap: ['fighter'], sweep: ['fighter'], ferry: ['fighter', 'attacker', 'diveBomber', 'bomber'],
};

/**
 * Planlanan görev için tahmini başarı ihtimali (%5 … %92): görev türü, ilgili araştırmalar, uçak türünün göreve
 * uygunluğu, sayı, eskort, hedefteki bilinen uçaksavar ve yakındaki düşman üsleri, uzaklık.
 */
export function missionOdds(
  world: World, team: number, plan: MissionPlan,
  groups: { specId: string; count: number; loadout?: Loadout; split?: number | null }[], escorts: { specId: string; count: number }[],
  from: { x: number; z: number } | null,
): MissionOdds {
  const factors: OddsFactor[] = [];
  const missing: OddsFactor[] = [];
  const r = world.teams[team].research;
  let pct = BASE[plan.type];
  for (const [id, d] of RESEARCH[plan.type]) {
    const t = TECH_BY_ID[id];
    if (!t) continue;
    if (r.has(id)) {
      pct += d;
      factors.push({ label: t.name, delta: d });
    } else missing.push({ label: t.name, delta: d });
  }
  const main = groups.filter((g) => g.count > 0);
  const total = main.reduce((a, g) => a + g.count, 0);
  if (main.length) {
    const fit = main.every((g) => IDEAL[plan.type].includes(SPECS[g.specId].role));
    if (!fit) {
      pct -= 10;
      factors.push({ label: L('Uçak türü bu göreve uygun değil', 'Aircraft type not suited to this mission'), delta: -10 });
    }
    const n = Math.min(12, Math.round(5 * Math.log2(Math.max(total, 1))));
    if (n > 0) {
      pct += n;
      factors.push({ label: L(`${total} uçak`, `${total} aircraft`), delta: n });
    }
  }
  const strike = plan.type === 'levelBomb' || plan.type === 'diveBomb' || plan.type === 'attack';
  // Yük hedefe yeter mi: beklenen hasar gereken hasarla karşılaştırılır (iki Ju 87 fabrikaya da, bir He 111 madene de
  // aynı tahmini alıyordu)
  const tgtS = strike && plan.targetStructureId !== null ? world.structureById(plan.targetStructureId) : undefined;
  if (tgtS && !tgtS.destroyed && main.length) {
    const need = (STRIKE_NEED[plan.type] ?? 0.12) * tgtS.maxHp;
    const dmg = expectedStrikeDamage(world, team, plan, tgtS, main);
    const ratio = dmg >= tgtS.hp ? 3 : dmg / Math.max(need, 1);
    const d = ratio < 0.5 ? -30 : ratio < 0.85 ? -18 : ratio < 1.15 ? -6 : ratio < 2 ? 0 : 6;
    const label = dmg >= tgtS.hp
      ? L('Yük hedefi yıkmaya yeter', 'The load is enough to destroy the target')
      : L(`Beklenen hasar ≈%${Math.round((100 * dmg) / tgtS.maxHp)} (gereken %${Math.round((100 * need) / tgtS.maxHp)})`,
        `Expected damage ≈${Math.round((100 * dmg) / tgtS.maxHp)}% (needed ${Math.round((100 * need) / tgtS.maxHp)}%)`)
        + (ratio < 0.85 ? L(': yük hedefe yetmeyebilir', ': the load may not be enough') : '');
    pct += d;
    factors.push({ label, delta: d });
  }
  const esc = escorts.reduce((a, g) => a + g.count, 0);
  if (strike && esc >= 2) {
    pct += 10;
    factors.push({ label: L(`${esc} eskort avcısı`, count(esc, 'escort fighter')), delta: 10 });
  }
  const tp = world.planTargetPos(plan);
  if (tp) {
    let aa = 0;
    let heavy = false;
    let bases = 0;
    let radar = false;
    for (const s of world.structures) {
      if (s.team === team || s.destroyed || !s.active) continue;
      const d = Math.hypot(s.pos.x - tp.x, s.pos.z - tp.z);
      if (s.aa && d < 4500) {
        aa++;
        if (s.aa.mounts.some((m) => m.weapon === 'aa88' || m.weapon === 'aa128' || m.weapon === 'aa40')) heavy = true;
      }
      if (s.airbase && d < 40000) bases++;
      if (s.radar && d < 60000) radar = true;
    }
    if (aa && strike) {
      const d = -Math.min(18, aa * 5 + (heavy ? 4 : 0));
      pct += d;
      factors.push({ label: L(`Hedefte ${aa} uçaksavar bataryası`, `${count(aa, 'flak battery', 'flak batteries')} at the target`) + (heavy ? L(' (ağır top)', ' (heavy guns)') : ''), delta: d });
    }
    if (bases && (strike || plan.type === 'escort' || plan.type === 'sweep')) {
      const d = -Math.min(12, bases * 6);
      pct += d;
      factors.push({ label: L(`Yakında ${bases} düşman hava üssü`, `${count(bases, 'enemy airbase')} nearby`), delta: d });
    }
    if (radar && strike) {
      pct -= 4;
      factors.push({ label: L('Düşman radarı bölgeyi görüyor', 'Enemy radar covers the area'), delta: -4 });
    }
    if (from) {
      const km = Math.hypot(tp.x - from.x, tp.z - from.z) / 1000;
      if (km > 60) {
        const d = -Math.min(15, Math.round((km - 60) / 8));
        if (d < 0) {
          pct += d;
          factors.push({ label: `Uzak hedef (${Math.round(km)} km)`, delta: d });
        }
      }
    }
  }
  pct = Math.max(5, Math.min(92, Math.round(pct)));
  const need = STRIKE_NEED[plan.type];
  const criterion = strike
    ? L(`Hedefe en az %${Math.round((need ?? 0.12) * 100)} hasar ver ya da hedefi yık`, `Deal at least ${Math.round((need ?? 0.12) * 100)}% damage to the target or destroy it`)
    : plan.type === 'intercept' ? L('Hedef koldan en az bir uçak düşür ya da saldırısını engelle', 'Shoot down at least one aircraft of the target flight or stop its attack')
      : plan.type === 'escort' ? L('Eşlik edilen kol hedefe ulaşsın ve yarısından fazlasını kaybetmesin', 'The escorted flight must reach the target without losing more than half')
        : plan.type === 'cap' ? L('Bölgeyi koru ve en az bir düşman düşür (kayıp, düşürülenden az)', 'Defend the area and shoot down at least one enemy (fewer losses than kills)')
          : plan.type === 'sweep' ? L('Düşürülen düşman kayıptan fazla olsun', 'Shoot down more enemies than you lose') : L('Uçakları teslim et (ödül yok)', 'Deliver the aircraft (no reward)');
  // Ödül: hedef biliniyorsa ona göre
  let rewardText = '';
  if (strike) {
    const s = plan.targetStructureId !== null ? world.structureById(plan.targetStructureId) : undefined;
    const r0 = missionReward(world, plan, { killValue: 0, targetFlightValue: 0 });
    rewardText = `${fmtMoney(r0)}${s ? `${L(', yıkılırsa', ', if destroyed')} ${fmtMoney(missionReward(world, plan, { killValue: 0, targetFlightValue: 0 }, 0, true))}` : ''}`;
  } else if (plan.type === 'intercept') {
    const t = plan.targetAircraftId !== null ? world.aircraftById(plan.targetAircraftId) : undefined;
    const v = t?.flight ? flightValue(t.flight) : t ? aircraftPrice(t.spec) : 0;
    rewardText = fmtMoney(missionReward(world, plan, { killValue: 0, targetFlightValue: v }));
  } else if (plan.type === 'escort') {
    const f = plan.targetFlightId !== null ? world.flightById(plan.targetFlightId) : undefined;
    rewardText = fmtMoney(missionReward(world, plan, { killValue: 0, targetFlightValue: 0 }, f ? flightValue(f) : 0));
  } else if (plan.type === 'cap') rewardText = L(`${fmtMoney(400)} + düşürülenlerin değerinin %8'i`, `${fmtMoney(400)} + 8% of the value of kills`);
  else if (plan.type === 'sweep') rewardText = L(`${fmtMoney(300)} + düşürülenlerin değerinin %10'u`, `${fmtMoney(300)} + 10% of the value of kills`);
  else rewardText = 'yok (intikal)';
  return { pct, factors, missing: missing.sort((a, b) => b.delta - a.delta), criterion, rewardText };
}
