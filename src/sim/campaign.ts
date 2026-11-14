// Kampanya kurulumu: oyuncu ve 1–5 düşman ülke (herkes herkese karşı). Her taraf aynı şeylerle başlar:
// ana hava üssü, üssün yanında uçak fabrikası, 1 maden ocağı, belediye binası ve ana caddesinde 4 ev (16 kişi), birkaç
// uçak ve başlangıç parası.

import type { World } from './world';
import { Commander } from './commander';
import { MAINT_CREW, START_MONEY, fmtMoney, oreRichness } from './economy';
import { SPECS } from './aircraft/specs';
import { STRUCTURE_DEFS, type StructureKind } from './structures/structure';
import { MAP_ID, MAP_SIZE, TEAM_SITES, type SiteDef } from './mapData';
import { newAirframe, type Airbase } from './structures/airbase';
import { clamp } from '../core/math';
import { L, count } from '../i18n';

export const MAX_ENEMIES = 5;

/**
 * Kasabayı kur: belediye binası (önünden ana cadde çıkar) ve caddeye dizili evler; hepsi bedava ve bitmiş. Belediyeye
 * yer bulunamazsa evler eskisi gibi üssün çevresine konur. Eski kayıtlar da bununla belediyeye kavuşur (save.ts).
 */
export function foundTown(w: World, team: number, base: Airbase, houses: number): void {
  const c = base.s.pos;
  let hall = false;
  for (let k = 0; k < 8 && !hall; k++) {
    const deg = ((team * 3 + k) % 8) * 45;
    const p = w.findSpot(team, 'townhall', c.x, c.z, 2300, 5200, team * 7 + k, (deg * Math.PI) / 180, true);
    if (!p) continue;
    w.addStructure(team, 'townhall', w.structureName(team, 'townhall'), p.x, p.z, deg);
    hall = true;
  }
  for (let k = 0; k < houses; k++) {
    const lot = hall ? w.findLot(team, 'house', true) : null;
    if (lot) {
      w.addStructure(team, 'house', w.structureName(team, 'house'), lot.x, lot.z, (lot.heading * 180) / Math.PI);
      continue;
    }
    const p = w.findSpot(team, 'house', c.x, c.z, 2300, 5200, team * 7 + k, 0, true, true);
    if (p) w.addStructure(team, 'house', w.structureName(team, 'house'), p.x, p.z, 0);
  }
}

/** Bakım personeli kuralından önceki kayda verilen bedava konut (save.ts; oyuncuya bir kez söylenir). */
export interface MaintGift {
  /** Eksik kişi (konutla karşılanan + karşılanamayan). */
  short: number;
  /** Kurulan binalar ve toplam kişi. */
  buildings: number;
  people: number;
  /** Yer bulunamadığı için bakımcı istemeyen uçak sayısı (son çare). */
  exempt: number;
}

/**
 * Bakım personeli kuralından (2026-11-13) önceki kayıt: bu taraf eskiden kalkabildiği kadar uçağı yine kaldırabilsin diye
 * eksik konut bedava kurulur (evler kira da getirir). Eksik: bakımcılar, eskiden boşta kalan fazlayla (konut − itfaiye
 * kadrosu − bütün uçakların uçuş mürettebatı) karşılanamayan kısım. Binalar kasabanın yollarına dizilir, gerekirse sokak
 * bedava uzar; yolda yer yoksa üssün çevresine. Hiç yer bulunamazsa kalan kadar uçak bakımcısız kalır (noMaint).
 */
export function maintHousing(w: World, team: number): MaintGift {
  const out: MaintGift = { short: 0, buildings: 0, people: 0, exempt: 0 };
  const base = w.airbasesOf(team)[0];
  if (!base || w.teams[team]?.eliminated) return out;
  w.countStaff(team);
  let crew = 0;
  for (const b of w.airbasesOf(team)) for (const af of b.inventory) crew += SPECS[af.specId].crew;
  for (const s of w.structures) if (s.team === team && s.factory) for (const q of s.factory.queue) crew += SPECS[q.specId].crew;
  const maint = w.maintOf(team);
  const p = w.teams[team].personnel;
  const spare = Math.max(0, p.capacity - p.staff - crew);
  out.short = Math.max(0, maint - spare);
  let left = out.short;
  let seed = 0;
  const KINDS: StructureKind[] = ['apartment', 'house', 'midhouse', 'smallhouse'];
  const spot = (kind: StructureKind): { x: number; z: number; heading: number } | null => {
    let lot = w.findLot(team, kind, true);
    for (let k = 0; k < 3 && !lot && w.growRoads(team, true); k++) lot = w.findLot(team, kind, true);
    if (lot) return lot;
    const sp = w.findSpot(team, kind, base.s.pos.x, base.s.pos.z, 2300, 6500, team * 13 + seed++, 0, true, true);
    return sp ? { ...sp, heading: 0 } : null;
  };
  while (left > 0) {
    // Büyük açıkta apartman, sonra ev; sığmayan tür bir küçüğüne düşer
    const want = left >= 12 ? 0 : left >= 4 ? 1 : left === 3 ? 2 : 3;
    let kind: StructureKind | null = null;
    let at: { x: number; z: number; heading: number } | null = null;
    for (let i = want; i < KINDS.length && !at; i++) {
      at = spot(KINDS[i]);
      kind = KINDS[i];
    }
    if (!at || !kind) break;
    w.addStructure(team, kind, w.structureName(team, kind), at.x, at.z, (at.heading * 180) / Math.PI);
    const n = STRUCTURE_DEFS[kind].population ?? 0;
    out.buildings++;
    out.people += n;
    left -= n;
  }
  // Son çare: yer kalmadıysa eksik kadar uçak bakımcı istemez (kimse uçamaz hâle düşmesin)
  for (const b of w.airbasesOf(team)) {
    for (const af of b.inventory) {
      if (left <= 0) break;
      if (af.noMaint) continue;
      af.noMaint = true;
      left -= MAINT_CREW;
      out.exempt++;
    }
  }
  return out;
}

export interface CampaignOptions {
  enemies: number;
  playerName: string;
  /** Ana menü arka planı: oyuncu tarafını da yapay zekâ yönetir. */
  demo?: boolean;
  /**
   * Ana üs yerleri (oyuncu ilk; yüklü haritanın ölçeğinde, startSites.ts rollStartSites). Yoksa haritanın sabit yerleri
   * (ana menü arka planı, senaryolar ve ölçümler).
   */
  sites?: SiteDef[];
}

/** Başlangıç madeni: aday yerler arasından ortalama verime en yakın olanı (her taraf eşit şansla başlasın). */
function startingMine(w: World, base: Airbase): void {
  const team = base.s.team;
  const c = base.s.pos;
  let best: { x: number; z: number; d: number } | null = null;
  for (const r of [5000, 7500, 10000]) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + team;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (!w.checkPlacement(team, 'mine', x, z, 0, null, true).ok) continue;
      const d = Math.abs(oreRichness(x, z) - 0.75);
      if (!best || d < best.d) best = { x, z, d };
    }
  }
  const spot = best ?? w.findSpot(team, 'mine', c.x, c.z, 4000, 12000, team, 0, true);
  if (spot) w.addStructure(team, 'mine', w.structureName(team, 'mine'), spot.x, spot.z, 0);
}

/** Uçak fabrikası üssün yanına (ürünler doğrudan hangara); yer yoksa yakına. */
function startingFactory(w: World, base: Airbase): void {
  const team = base.s.team;
  // Başlangıç yapıları bedava: yerleşim kontrolü parayı sormaz (fabrika 37.800, başlangıç parası 25.000)
  const chk = w.checkBaseFactory(base, true);
  if (chk.ok) {
    const p = base.factoryPad();
    const f = w.addStructure(team, 'factory', L(`${base.s.name} fabrikası`, `${base.s.name} factory`), p.x, p.z, (base.s.heading * 180) / Math.PI);
    f.attachedTo = base.s.id;
    return;
  }
  const spot = w.findSpot(team, 'factory', base.s.pos.x, base.s.pos.z, 2500, 9000, team, 0, true);
  if (spot) w.addStructure(team, 'factory', w.structureName(team, 'factory'), spot.x, spot.z, 0);
}

export function setupCampaign(w: World, o: CampaignOptions): void {
  const n = clamp(Math.round(o.enemies), 1, MAX_ENEMIES);
  w.playerName = o.playerName;
  w.setup = { enemies: n };
  w.mapId = MAP_ID;
  w.mapSize = MAP_SIZE;
  w.personnelEnabled = true;
  w.economyEnabled = true;
  w.roadRules = true;
  for (let i = 0; i <= n; i++) {
    const ts = TEAM_SITES[i];
    const site = o.sites?.[i] ?? ts.site;
    const ai = i > 0 || !!o.demo;
    const t = w.addTeam(ts.name, ts.color, [], ai);
    t.money = START_MONEY;
    const base = w.addStructure(i, 'airbase', L(`${ts.name} ana üs`, `${ts.name} main base`), site.x, site.z, site.heading).airbase!;
    startingFactory(w, base);
    startingMine(w, base);
    // 4 ev (16 kişi): 6 uçağın bakımcısı (6) ve uçuş mürettebatı (4 avcı + 2 iki kişilik pike: 8), 2 kişi boşta
    foundTown(w, i, base, 4);
    const fighter = i === 0 ? 'hurricane1' : i % 2 ? 'bf109e' : 'hurricane1';
    for (let k = 0; k < 4; k++) base.addAirframe(newAirframe(fighter, i));
    for (let k = 0; k < 2; k++) base.addAirframe(newAirframe('ju87b', i));
    base.alert.specId = fighter;
    if (ai) {
      w.commanders.push(new Commander(i, { research: true, upgrades: true, production: true, cap: true, raids: true, firstRaid: 600 + i * 120 }));
    }
  }
  if (o.demo) return;
  const foes = w.teams.slice(1).map((t) => t.name).join(', ');
  w.log(L(`Harekât başladı: ${n} düşman ülke (${foes}) — herkes herkese karşı.`, `Campaign started: ${count(n, 'enemy nation')} (${foes}) — free for all.`), null, 'info');
  w.log(L(`Başlangıç: ana hava üssü, uçak fabrikası, 1 maden ocağı, belediye binası ve caddesinde 4 ev (16 kişi: 6'sı uçakların bakımcısı), 4 avcı ve 2 pike bombardıman. Hazine ${fmtMoney(START_MONEY)}.`,
    `Start: main airbase, aircraft factory, 1 mine, a town hall with 4 houses on its street (16 people, 6 of them the aircraft's ground crew), 4 fighters and 2 dive bombers. Treasury ${fmtMoney(START_MONEY)}.`), 0, 'info');
  w.log(L('Ana üssü seçip görev planla; İnşa, Araştırma ve Hazine üst çubukta (klavyede B, T, M). Duraklatma menüsü: ☰ Menü ya da Esc.',
    'Select the main base to plan a mission; Build, Research and Treasury are in the top bar (B, T, M on the keyboard). Pause menu: ☰ Menu or Esc.'), 0, 'info');
}
