// Kampanya kurulumu: oyuncu ve 1–5 düşman ülke (herkes herkese karşı). Her taraf aynı şeylerle başlar:
// ana hava üssü, üssün yanında uçak fabrikası, 1 maden ocağı, 2 ev (8 kişi), birkaç uçak ve başlangıç parası.

import type { World } from './world';
import { Commander } from './commander';
import { START_MONEY, fmtMoney, oreRichness } from './economy';
import { MAP_ID, MAP_SIZE, TEAM_SITES, type SiteDef } from './mapData';
import { newAirframe, type Airbase } from './structures/airbase';
import { clamp } from '../core/math';
import { L, count } from '../i18n';

export const MAX_ENEMIES = 5;

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
      if (!w.checkPlacement(team, 'mine', x, z, 0).ok) continue;
      const d = Math.abs(oreRichness(x, z) - 0.75);
      if (!best || d < best.d) best = { x, z, d };
    }
  }
  const spot = best ?? w.findSpot(team, 'mine', c.x, c.z, 4000, 12000, team);
  if (spot) w.addStructure(team, 'mine', w.structureName(team, 'mine'), spot.x, spot.z, 0);
}

/** Uçak fabrikası üssün yanına (ürünler doğrudan hangara); yer yoksa yakına. */
function startingFactory(w: World, base: Airbase): void {
  const team = base.s.team;
  const chk = w.checkBaseFactory(base);
  if (chk.ok) {
    const p = base.factoryPad();
    const f = w.addStructure(team, 'factory', L(`${base.s.name} fabrikası`, `${base.s.name} factory`), p.x, p.z, (base.s.heading * 180) / Math.PI);
    f.attachedTo = base.s.id;
    return;
  }
  const spot = w.findSpot(team, 'factory', base.s.pos.x, base.s.pos.z, 2500, 9000, team);
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
  for (let i = 0; i <= n; i++) {
    const ts = TEAM_SITES[i];
    const site = o.sites?.[i] ?? ts.site;
    const ai = i > 0 || !!o.demo;
    const t = w.addTeam(ts.name, ts.color, [], ai);
    t.money = START_MONEY;
    const base = w.addStructure(i, 'airbase', L(`${ts.name} ana üs`, `${ts.name} main base`), site.x, site.z, site.heading).airbase!;
    startingFactory(w, base);
    startingMine(w, base);
    for (let k = 0; k < 2; k++) {
      const p = w.findSpot(i, 'house', base.s.pos.x, base.s.pos.z, 2300, 5200, i * 7 + k);
      if (p) w.addStructure(i, 'house', w.structureName(i, 'house'), p.x, p.z, 0);
    }
    // 8 kişiye yetecek uçaklar: 4 avcı + 2 pike bombardıman (2'şer kişilik)
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
  w.log(L(`Başlangıç: ana hava üssü, uçak fabrikası, 1 maden ocağı, 2 ev (8 kişi), 4 avcı ve 2 pike bombardıman. Hazine ${fmtMoney(START_MONEY)}.`,
    `Start: main airbase, aircraft factory, 1 mine, 2 houses (8 people), 4 fighters and 2 dive bombers. Treasury ${fmtMoney(START_MONEY)}.`), 0, 'info');
  w.log(L('Ana üssü seçip görev planla; İnşa, Araştırma ve Pazar üst çubukta (klavyede B, T, M). Duraklatma menüsü: ☰ Menü ya da Esc.',
    'Select the main base to plan a mission; Build, Research and Market are in the top bar (B, T, M on the keyboard). Pause menu: ☰ Menu or Esc.'), 0, 'info');
}
