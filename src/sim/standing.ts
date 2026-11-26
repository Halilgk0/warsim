// Tekrarlanan görevler (2026-11-26, oyuncu isteği): planlayıcıda "Görev bitince tekrarla" işaretli görev, kolları inip uçaklar
// bakımdan çıkınca aynı planla yeniden kalkar. Kayıplar üsteki hazır uçaklardan tamamlanır, yetmezse eksik kalkar. Hedef yıkılınca,
// üs düşünce ya da oyuncu durdurunca biter. Yalnız oyuncunun görevleri (botlar kendi planlar). Kayda yazılır.

import { Vector3 } from 'three';
import type { World, LaunchGroup } from './world';
import type { MissionPlan, MissionType } from './ai/missions';
import { L } from '../i18n';

/** Tekrarlanabilen görevler: hedefi sabit kalanlar (önleme hedefi kaybolur, transfer bir kez yapılır). */
export const REPEATABLE: ReadonlySet<MissionType> = new Set<MissionType>(['cap', 'levelBomb', 'diveBomb', 'attack']);

/** Uçaklar hazır olmasa da bu kadar beklendikten sonra hazır olanlarla kalkılır (sn). */
const MAX_WAIT = 900;

export interface StandingOrder {
  id: number;
  team: number;
  baseId: number;
  plan: MissionPlan;
  groups: LaunchGroup[];
  escorts: LaunchGroup[];
  /** Son kalkışın kolları (hepsi bitince yeniden kalkılır). */
  flightIds: number[];
  /** Kaç kez kalktı (ilki dahil). */
  runs: number;
  /** Kolların bittiği an (beklemeye başladı); yoksa havada. */
  waitSince: number | null;
}

/** Bekleyen ya da havadaki tekrarın durumu (panel). */
export function standingStatus(o: StandingOrder): string {
  if (o.waitSince === null) return L(`${o.runs}. tur havada`, `run ${o.runs} in the air`);
  return L('uçaklar bakımda, hazır olunca kalkacak', 'aircraft in maintenance, takes off when ready');
}

/** Planlayıcıdan: kalkan paketi tekrarlanan görev yap. */
export function addStanding(w: World, baseId: number, plan: MissionPlan, groups: LaunchGroup[], escorts: LaunchGroup[], flightIds: number[], team: number): StandingOrder {
  const o: StandingOrder = { id: w.nextStandingId++, team, baseId, plan: clonePlanData(plan), groups: groups.map((g) => ({ ...g })), escorts: escorts.map((g) => ({ ...g })), flightIds, runs: 1, waitSince: null };
  w.standing.push(o);
  return o;
}

export function stopStanding(w: World, id: number, why?: string): void {
  const i = w.standing.findIndex((o) => o.id === id);
  if (i < 0) return;
  const o = w.standing[i];
  w.standing.splice(i, 1);
  if (why) w.log(L(`Tekrarlanan görev durdu: ${why}`, `Repeating mission stopped: ${why}`), o.team, 'ops');
}

/** Kolun bağlı olduğu tekrar (yoksa undefined). */
export function standingOfFlight(w: World, flightId: number): StandingOrder | undefined {
  return w.standing.find((o) => o.flightIds.includes(flightId));
}

/** Birkaç saniyede bir: biten tekrarları yeniden kaldırır. */
export function updateStanding(w: World): void {
  for (const o of [...w.standing]) {
    const base = w.structureById(o.baseId)?.airbase;
    if (!base || base.s.destroyed || base.s.team !== o.team || w.teams[o.team]?.eliminated) {
      stopStanding(w, o.id, L('kalkış üssü kaybedildi', 'the home base was lost'));
      continue;
    }
    if (o.plan.targetStructureId !== null) {
      const t = w.structureById(o.plan.targetStructureId);
      if (!t || t.destroyed) {
        stopStanding(w, o.id, L(`${t?.name ?? 'hedef'} yıkıldı`, `${t?.name ?? 'the target'} was destroyed`));
        continue;
      }
    }
    // Kollardan biri hâlâ görevde ya da iniyorsa bekle
    if (o.flightIds.some((id) => { const f = w.flightById(id); return f && f.phase !== 'done'; })) continue;
    if (o.waitSince === null) o.waitSince = w.time;
    if (!base.usable) continue;
    // Her tipten istenen sayı: üste kalan (havada olmayan) kadarı hazır olunca kalkılır; uzun beklemede hazır olanlarla
    const want = new Map<string, number>();
    for (const g of [...o.groups, ...o.escorts]) want.set(g.specId, (want.get(g.specId) ?? 0) + g.count);
    let ready = true;
    let any = false;
    for (const [id, n] of want) {
      const onBase = base.inventory.filter((a) => a.specId === id && a.status !== 'airborne').length;
      const r = base.readyOf(id).length;
      if (r > 0) any = true;
      if (r < Math.min(n, onBase)) ready = false;
    }
    const mainLeft = o.groups.some((g) => base.readyOf(g.specId).length > 0);
    if (!mainLeft) {
      if (!o.groups.some((g) => base.inventory.some((a) => a.specId === g.specId))) stopStanding(w, o.id, L('üste bu görevin uçağı kalmadı', 'no aircraft for this mission are left at the base'));
      continue;
    }
    if (!ready && !(any && w.time - o.waitSince > MAX_WAIT)) continue;
    const flights = w.launchPackage(base, clonePlanData(o.plan), o.groups, o.escorts);
    if (!flights.length) continue;
    o.flightIds = flights.map((f) => f.id);
    o.runs++;
    o.waitSince = null;
    w.log(L(`${flights[0].name}: tekrarlanan görev yeniden kalkıyor (${o.runs}. tur)`, `${flights[0].name}: repeating mission taking off again (run ${o.runs})`), o.team, 'ops');
  }
}

/** Planın derin kopyası (konumlar ayrı nesne). */
export function clonePlanData(p: MissionPlan): MissionPlan {
  return { ...p, targetPos: p.targetPos ? p.targetPos.clone() : null, waypoints: p.waypoints.map((v) => v.clone()) };
}

/** Kayıt için düz nesne. */
export interface StandingSave {
  id: number; team: number; baseId: number; runs: number; waitSince: number | null; flightIds: number[];
  plan: Omit<MissionPlan, 'targetPos' | 'waypoints'> & { targetPos: [number, number, number] | null; waypoints: [number, number, number][] };
  groups: LaunchGroup[]; escorts: LaunchGroup[];
}

export function saveStanding(o: StandingOrder): StandingSave {
  const { targetPos, waypoints, ...rest } = o.plan;
  return {
    id: o.id, team: o.team, baseId: o.baseId, runs: o.runs, waitSince: o.waitSince, flightIds: [...o.flightIds],
    plan: { ...rest, targetPos: targetPos ? [targetPos.x, targetPos.y, targetPos.z] : null, waypoints: waypoints.map((v) => [v.x, v.y, v.z]) },
    groups: o.groups.map((g) => ({ ...g })), escorts: o.escorts.map((g) => ({ ...g })),
  };
}

/** Kayıttan: havadaki kollar kayıtta üsse dönmüş sayıldığı için tekrar beklemeye başlar. */
export function loadStanding(d: StandingSave, time: number): StandingOrder {
  const { targetPos, waypoints, ...rest } = d.plan;
  return {
    id: d.id, team: d.team, baseId: d.baseId, runs: d.runs, waitSince: d.waitSince ?? time, flightIds: [],
    plan: { ...rest, targetPos: targetPos ? new Vector3(...targetPos) : null, waypoints: waypoints.map((v) => new Vector3(...v)) } as MissionPlan,
    groups: d.groups, escorts: d.escorts,
  };
}

// ---------------------------------------------------------------- görev geçmişi

/** Planlayıcıdaki bir tip seçimi (geçmişten aynen geri yüklenir). */
export interface HistPick {
  specId: string;
  count: number;
  loadoutId: string;
  belt: string;
  formation: string;
  manual: boolean;
  custom: { hp: string; store: string; n: number; side?: 1 | -1 }[] | null;
  kit: string | null;
  split: number | null;
  fuel: number;
  fuelAuto: boolean;
}

/**
 * Görev geçmişi (2026-11-26, oyuncu isteği): oyuncunun planlayıcıdan kaldırdığı görevler; planlayıcının "Geçmiş" penceresi bunları
 * listeler, seçilen görevin ayarlarını yeniden uygular. Takım başına son 30 görev, kayda yazılır.
 */
export interface HistoryEntry {
  id: number;
  team: number;
  baseId: number;
  /** Oyun saati ve oynama süresi (kalkış). */
  time: number;
  played: number;
  plan: MissionPlan;
  force: HistPick[];
  escort: HistPick[];
  laps: number;
  repeat: boolean;
  /** Kalkan kolların adları (görev sonucunu bulmak için). */
  flights: string[];
  /** Hedefin kalkıştaki adı (yapı yıkılıp kalksa da listede görünsün). */
  targetName: string;
}

export const HISTORY_MAX = 30;

export function addHistory(w: World, e: Omit<HistoryEntry, 'id'>): void {
  w.missionHistory.push({ ...e, id: (w.missionHistory[w.missionHistory.length - 1]?.id ?? 0) + 1 });
  const mine = w.missionHistory.filter((x) => x.team === e.team);
  if (mine.length > HISTORY_MAX) w.missionHistory.splice(w.missionHistory.indexOf(mine[0]), 1);
}

export type HistorySave = Omit<HistoryEntry, 'plan'> & { plan: StandingSave['plan'] };

export function saveHistory(e: HistoryEntry): HistorySave {
  const { targetPos, waypoints, ...rest } = e.plan;
  return {
    ...e, force: e.force.map((p) => ({ ...p, custom: p.custom ? p.custom.map((c) => ({ ...c })) : null })), escort: e.escort.map((p) => ({ ...p })),
    plan: { ...rest, targetPos: targetPos ? [targetPos.x, targetPos.y, targetPos.z] : null, waypoints: waypoints.map((v) => [v.x, v.y, v.z]) },
  };
}

export function loadHistory(d: HistorySave): HistoryEntry {
  const { targetPos, waypoints, ...rest } = d.plan;
  return { ...d, plan: { ...rest, targetPos: targetPos ? new Vector3(...targetPos) : null, waypoints: waypoints.map((v) => new Vector3(...v)) } as MissionPlan };
}
