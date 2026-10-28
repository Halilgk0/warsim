// Sol bağlam paneli: seçime göre genel bakış, hava üssü, uçaksavar bataryası, radar, fabrika, maden ya da düşman yapısı.
// Para kuralları açıkken her iş ücretli: düğmelerde maliyet görünür, parası yetmeyen iş başlatılamaz.

import type { Game } from '../game';
import type { Structure } from '../sim/structures/structure';
import { STRUCTURE_DEFS, STRUCT_GLYPH } from '../sim/structures/structure';
import { AA_WEAPONS, AA_WEAPON_ORDER, AA_SENSORS, type AASensorId, type UpgradeOption } from '../sim/structures/airDefense';
import { BASE_UPGRADES, type BaseUpgrade } from '../sim/structures/airbase';
import { RADAR_LEVELS } from '../sim/structures/radar';
import { ROLE_NAMES, SPECS, SPEC_LIST, type Role } from '../sim/aircraft/specs';
import { TECH_BY_ID, aircraftNode, type Research } from '../sim/tech';
import { PALETTE } from '../render/palette';
import { aircraftThumb } from '../render/thumbs';
import { BASE_UPGRADE_COST, STRUCTURE_COST, aircraftPrice, fmtMoney, richnessName, richnessTier } from '../sim/economy';
import { skillName } from './hud';
import { settings, saveSettings } from './settings';
import { $, bar, esc, fmtDur, hpColor, nf, pct } from './dom';
import { L, count, lower } from '../i18n';

const KIND_ICON: Record<string, string> = STRUCT_GLYPH;
const SENSOR_ORDER: AASensorId[] = ['rangefinder', 'predictor', 'gunRadar', 'proximity'];

export class LeftPanel {
  private el = $('left');
  private next = 0;
  private lastKey = '';

  constructor(private readonly game: Game) {
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => this.onChange(e));
  }

  update(): void {
    const hidden = this.game.planner.isOpen;
    this.el.classList.toggle('hidden', hidden);
    if (hidden) return;
    const now = performance.now();
    if (now < this.next) return;
    this.next = now + 300;
    // Açık bir seçim kutusunu bozmamak için odak paneldeyse yeniden çizme
    const a = document.activeElement;
    if (a && this.el.contains(a) && (a instanceof HTMLSelectElement || a instanceof HTMLInputElement)) return;
    this.render(false);
  }

  render(force: boolean): void {
    const html = this.build();
    if (!force && html === this.lastKey) return;
    this.lastKey = html;
    const scroll = this.el.scrollTop;
    this.el.innerHTML = html;
    this.el.scrollTop = scroll;
  }

  private build(): string {
    const s = this.game.selectedStructure;
    if (s) {
      if (s.team !== this.game.playerTeam) return this.enemyStructure(s);
      if (s.airbase) return this.airbase(s);
      if (s.aa) return this.aa(s);
      if (s.radar) return this.radar(s);
      if (s.factory) return this.factory(s);
      if (s.kind === 'mine') return this.mine(s);
      if (s.def.category === 'city') return this.cityBuilding(s);
    }
    return this.overview();
  }

  // ------------------------------------------------------------------ şehir

  private cityBuilding(s: Structure): string {
    const d = s.def;
    const w = this.game.world;
    const city = w.structures.filter((x) => x.team === s.team && x.def.category === 'city' && x.active);
    const pop = city.reduce((a, x) => a + (x.def.population ?? 0), 0);
    const jobs = city.reduce((a, x) => a + (x.def.jobs ?? 0), 0);
    const near = w.structures.filter((x) => x !== s && x.team === s.team && x.def.category === 'city' && Math.hypot(x.pos.x - s.pos.x, x.pos.z - s.pos.z) < 800).length;
    return `
      ${this.head(s)}
      <p class="muted">${esc(d.desc)}</p>
      <div class="kv">
        ${d.population ? `<span>${L('Nüfus', 'Population')}</span><span>${nf.format(d.population)}</span>` : ''}
        ${d.jobs ? `<span>${L('İş yeri', 'Jobs')}</span><span>${nf.format(d.jobs)}</span>` : ''}
        <span>${L('Taban', 'Footprint')}</span><span>${Math.round(d.halfW * 2)} × ${Math.round(d.halfL * 2)} m</span>
        <span>${L('Yakındaki bina', 'Buildings nearby')}</span><span>${near}</span>
      </div>
      <h3>${L('Şehir geneli', 'Whole city')}</h3>
      <div class="kv">
        <span>${L('Toplam nüfus', 'Total population')}</span><span>${nf.format(pop)}</span>
        <span>${L('Toplam iş yeri', 'Total jobs')}</span><span>${nf.format(jobs)}</span>
        <span>${L('İşsiz / boş kadro', 'Unemployed / vacancies')}</span><span>${pop > jobs ? L(`${nf.format(pop - jobs)} işsiz`, `${nf.format(pop - jobs)} unemployed`) : L(`${nf.format(jobs - pop)} boş kadro`, `${nf.format(jobs - pop)} vacancies`)}</span>
      </div>
      <p class="note">${L(
        'Şehir yapıları şimdilik personel barındırır (ev 4, apartman 16 kişi). Vergi ve iş gücü ilerideki bir aşamada ekonomiye bağlanacak.',
        'For now, city buildings house personnel (a house 4 people, an apartment block 16). Taxes and workforce join the economy in a later stage.',
      )}</p>`;
  }

  // ------------------------------------------------------------------ maden

  private mine(s: Structure): string {
    const w = this.game.world;
    const out = w.mineOutput(s) * 60;
    const rich = s.active
      ? `<span class="rich r${richnessTier(s.richness)}">${richnessName(s.richness)}</span>`
      : `<span class="muted-ink">${L('ocak açılınca belli olur', 'known once the mine opens')}</span>`;
    const dmg = s.hp < s.maxHp ? L(` · hasar yüzünden %${Math.round((1 - (0.3 + 0.7 * (s.hp / s.maxHp))) * 100)} düşük`, ` · ${Math.round((1 - (0.3 + 0.7 * (s.hp / s.maxHp))) * 100)}% lower from damage`) : '';
    return `
      ${this.head(s)}
      <p class="muted">${esc(s.def.desc)}</p>
      <div class="kv">
        <span>${L('Damar', 'Vein')}</span><span>${rich}</span>
        <span>${L('Üretim', 'Output')}</span><span>${s.active ? `${fmtMoney(out)}/${L('dk', 'min')}${dmg}` : `${L('inşaat', 'building')} ${pct(s.build)}`}</span>
        <span>${L('Toplam kazanç', 'Total earned')}</span><span>${fmtMoney(s.earned)}</span>
        <span>${L('Geri ödeme', 'Payback')}</span><span>${s.active && out > 0 ? `≈ ${fmtDur((STRUCTURE_COST.mine / out) * 60)}` : '—'}</span>
      </div>
      <p class="note">${L(
        'Damarın verimi yerden yere çok değişir ve haritada görünmez; kurmadan bilinmez. Düşman madenleri de bombalanabilir: yıkılan ocak ganimet getirir.',
        'Yield varies a lot from place to place and is not shown on the map; you only find out by building. Enemy mines can be bombed too: a destroyed mine brings loot.',
      )}</p>
      <button class="wide" data-act="market">${L('Hazine ve pazar ›', 'Treasury and market ›')}</button>`;
  }

  /** Maliyet etiketi (para kuralları kapalıysa boş). */
  private cost(v: number): string {
    const w = this.game.world;
    if (!w.economyEnabled || v <= 0) return '';
    return `<span class="cost ${w.teams[this.game.playerTeam].money < v ? 'no' : ''}">${fmtMoney(v)}</span>`;
  }

  private afford(v: number): boolean {
    return this.game.world.canAfford(this.game.playerTeam, v);
  }

  private head(s: Structure): string {
    const st = s.destroyed ? `<span class="bad">${L('yıkık', 'destroyed')}</span>` : s.build < 1 ? `${L('inşaat', 'building')} ${pct(s.build)}` : L(`sağlam ${pct(s.hp / s.maxHp)}`, `${pct(s.hp / s.maxHp)} intact`);
    return `
      <div class="panel-head">
        <button class="icon" data-act="back" title="${L('Geri (Esc)', 'Back (Esc)')}">‹</button>
        <div>
          <div class="info-title nowrap"><span class="dot" style="background:${PALETTE.teamCss[s.team]}"></span><span>${esc(s.name)}</span></div>
          <div class="muted small">${STRUCTURE_DEFS[s.kind].name} · ${st}</div>
        </div>
      </div>
      ${s.build < 1 ? bar(s.build * 100, 'var(--warn)') : bar((s.hp / s.maxHp) * 100, hpColor((s.hp / s.maxHp) * 100))}
      ${this.repairRow(s)}`;
  }

  /** Kendi hasarlı yapımız: onarım düğmesi ya da sürüp giden onarımın durumu. */
  private repairRow(s: Structure): string {
    const w = this.game.world;
    if (s.team !== this.game.playerTeam || !s.active || s.hp >= s.maxHp) return '';
    const est = w.repairEstimate(s);
    const cost = est.cost ? ` · ≈ ${fmtMoney(est.cost)}` : '';
    if (s.repairing) {
      const wait = w.repairWait(s);
      const st = wait > 0 ? L(`vurulduğu için ${fmtDur(wait)} bekliyor`, `paused ${fmtDur(wait)} after being hit`) : `${L('kalan', 'left')} ${fmtDur(est.time)}${cost}`;
      return `<div class="frow repair"><span>🔧 ${L('Onarılıyor', 'Repairing')} · ${st}</span><button class="link" data-act="repair-stop">${L('Durdur', 'Stop')}</button></div>`;
    }
    return `<button class="wide" data-act="repair" title="${L('Onarım yavaş ilerler, bedeli adım adım ödenir; yapı vurulursa 5 dk durur.', 'Repairs are slow and paid step by step; they pause for 5 min if the structure is hit.')}">${L('Onar', 'Repair')} · ${fmtDur(est.time)}${cost}</button>`;
  }

  // ------------------------------------------------------------------ genel bakış

  private overview(): string {
    const g = this.game;
    const w = g.world;
    const me = g.playerTeam;
    const flights = w.flights.filter((f) => f.team === me && f.phase !== 'done');
    const bases = w.structures.filter((s) => s.team === me && s.airbase);
    const baseRows = bases.map((s) => {
      const ab = s.airbase!;
      const counts = new Map<string, number>();
      for (const af of ab.inventory) if (af.status === 'ready') counts.set(af.specId, (counts.get(af.specId) ?? 0) + 1);
      const txt = [...counts].map(([id, n]) => `${n} ${esc(SPECS[id].abbr)}`).join(', ') || L('hazır uçak yok', 'no aircraft ready');
      const st = s.destroyed ? `<b class="bad">${L('yıkık', 'destroyed')}</b>` : s.build < 1 ? `${L('inşaat', 'building')} ${pct(s.build)}` : !ab.usable ? `<b class="bad">${L('pist kapalı', 'runway closed')}</b>` : txt;
      return `<button class="row-btn" data-act="sel-struct" data-id="${s.id}"><span>✈ <b>${esc(s.name)}</b></span><small>${st}</small></button>`;
    }).join('');

    const others = w.structures.filter((s) => s.team === me && !s.airbase && s.def.category !== 'city');
    const city = w.structures.filter((s) => s.team === me && s.def.category === 'city');
    const cityPop = city.filter((s) => s.active).reduce((a, s) => a + (s.def.population ?? 0), 0);
    const cityJobs = city.filter((s) => s.active).reduce((a, s) => a + (s.def.jobs ?? 0), 0);
    const cityBuilding = city.filter((s) => s.build < 1 && !s.destroyed).length;
    const otherRows = others.map((s) => {
      let sub = s.destroyed ? L('yıkık', 'destroyed') : s.build < 1 ? `${L('inşaat', 'building')} ${pct(s.build)}` : pct(s.hp / s.maxHp);
      if (s.aa && s.active) sub += ` · ${s.aa.mounts.map((m) => AA_WEAPONS[m.weapon].short).join(', ')}${s.aa.job ? ` · <i>${L('yükseltiliyor', 'upgrading')}</i>` : ''}`;
      if (s.factory && s.active) sub += s.factory.queue.length ? ` · ${L('üretimde', 'building')} ${esc(SPECS[s.factory.queue[0].specId].abbr)}` : ` · ${L('boşta', 'idle')}`;
      if (s.radar && s.active) sub += ` · ${L(`${s.radar.lastCount} temas`, count(s.radar.lastCount, 'contact'))}`;
      if (s.kind === 'mine' && s.active) sub += ` · ${lower(richnessName(s.richness))} · ${fmtMoney(w.mineOutput(s) * 60)}/${L('dk', 'min')}`;
      return `<button class="row-btn" data-act="sel-struct" data-id="${s.id}"><span>${KIND_ICON[s.kind]} ${esc(s.name)}</span><small>${sub}</small></button>`;
    }).join('');

    // Elenen tarafların yıkıntıları listelenmez
    const enemy = w.structures.filter((s) => s.team !== me && !w.teams[s.team]?.eliminated);
    const enemyRows = enemy.map((s) =>
      `<button class="row-btn enemy" data-act="sel-struct" data-id="${s.id}"><span>${KIND_ICON[s.kind]} ${esc(s.name)}</span><small>${s.destroyed ? L('yıkık', 'destroyed') : pct(s.hp / s.maxHp)}</small></button>`,
    ).join('');

    const tm = w.teams[me];
    const mines = w.structures.filter((s) => s.team === me && s.kind === 'mine' && !s.destroyed);
    const moneyHtml = w.economyEnabled ? `
      <h3>${L('Hazine', 'Treasury')}</h3>
      <div class="frow pers"><b>${fmtMoney(tm.money)}</b> · ${L('son 1 dk', 'last min')} <span class="pos">+${fmtMoney(w.incomeRate(me))}</span>
        <small>${L(
          `${mines.length} maden ocağı · ${fmtMoney(w.mineRate(me))}/dk. Gelir: maden, düşürülen düşman uçağı, yıkılan düşman yapısı, pazarda satış.`,
          `${count(mines.length, 'mine')} · ${fmtMoney(w.mineRate(me))}/min. Income: mines, enemy aircraft shot down, enemy structures destroyed, market sales.`,
        )}
        <button class="link" data-act="market">${L('Hazine ve pazar ›', 'Treasury and market ›')}</button> <button class="link" data-act="open-econ">${L('İnşa › Ekonomi', 'Build › Economy')}</button></small></div>` : '';
    const pers = w.teams[me].personnel;
    const persHtml = w.personnelEnabled ? `
      <h3>${L('Personel', 'Personnel')}</h3>
      <div class="frow pers"><b>${L(`${w.crewFree(me)} kişi boşta`, `${w.crewFree(me)} free`)}</b> · ${L(`${pers.reserved} uçuşta`, `${pers.reserved} flying`)} · ${L(`konut ${pers.capacity} kişilik`, `housing for ${pers.capacity}`)}${pers.people < pers.capacity ? L(` · ${pers.capacity - pers.people} eksik, yerine geliyor`, ` · ${pers.capacity - pers.people} short, replacements on the way`) : ''}
        <small>${L(
          '1 ev = 4 kişi, 1 apartman = 16 kişi. Uçaklar mürettebatı kadar kişiyle kalkar; eksikse hangarda bekler.',
          '1 house = 4 people, 1 apartment block = 16. An aircraft takes off only with its full crew; otherwise it waits in the hangar.',
        )} <button class="link" data-act="open-build">${L('İnşa › Şehir', 'Build › City')}</button></small></div>` : '';
    return `${moneyHtml}${persHtml}
      <p class="muted small">${L('Havadaki kollar sağ paneldeki <b>Aktif görevler</b> bölümünde.', 'Airborne flights are listed under <b>Active missions</b> in the right panel.')}${flights.length ? L(` Şu an ${flights.length} kol görevde.`, ` ${count(flights.length, 'flight')} out now.`) : ''}</p>
      <h3>${L('Hava üsleri', 'Airbases')}</h3><div class="list">${baseRows || `<p class="muted">${L('Hava üssü yok.', 'No airbases.')}</p>`}</div>
      ${others.length ? `<h3>${L('Yapılar', 'Structures')}</h3><div class="list">${otherRows}</div>` : ''}
      ${city.length ? `<h3>${L('Şehir', 'City')}</h3><div class="frow"><b>${L(`${city.length} bina`, count(city.length, 'building'))}</b> · ${L('nüfus', 'population')} ${nf.format(cityPop)} · ${L('iş', 'jobs')} ${nf.format(cityJobs)}${cityBuilding ? ` · ${cityBuilding} ${L('inşaat', 'under construction')}` : ''}</div>` : ''}
      ${enemy.length ? `<h3>${L('Bilinen düşman hedefleri', 'Known enemy targets')}</h3><div class="list enemy-list">${enemyRows}</div>` : ''}`;
  }

  // ------------------------------------------------------------------ hava üssü

  private airbase(s: Structure): string {
    const ab = s.airbase!;
    const w = this.game.world;
    const t = w.time;
    const runway = s.build < 1 ? L('İnşaat sürüyor', 'Under construction') : ab.runwayDamage > 0
      ? `${L('Pist hasarı', 'Runway damage')} ${pct(ab.runwayDamage)}${ab.usable ? '' : ` — <b class="bad">${L('kapalı', 'closed')}</b>`} (${L('onarılıyor', 'under repair')})`
      : L('Pist kullanılabilir', 'Runway usable');
    const fighters = [...new Set(ab.inventory.map((a) => a.specId))].filter((id) => SPECS[id].role === 'fighter');
    const canPlan = ab.usable && ab.inventory.some((a) => a.status === 'ready');
    const apr = ab.approach();
    // Hangar: her uçak tek tek
    const order = { ready: 0, servicing: 1, airborne: 2 } as const;
    const list = [...ab.inventory].sort((a, b) => order[a.status] - order[b.status] || a.specId.localeCompare(b.specId));
    const ready = list.filter((a) => a.status === 'ready').length;
    // Personel: hazır uçaklardan hangileri boştaki kişiyle kalkabilir
    let crewLeft = w.crewFree(s.team);
    const rows = list.map((af) => {
      const sp = SPECS[af.specId];
      let manned = true;
      if (af.status === 'ready') {
        manned = crewLeft >= sp.crew;
        if (manned) crewLeft -= sp.crew;
      }
      const st = af.status === 'ready' ? (manned ? `<span class="st ok">${L('hazır', 'ready')}</span>` : `<span class="st warn">${L('mürettebat yok', 'no crew')}</span>`)
        : af.status === 'servicing' ? `<span class="st warn">${L('bakımda', 'servicing')} · ${fmtDur(af.readyAt - t)}</span>`
        : `<span class="st air">${L('havada', 'airborne')}${af.aircraftId !== null ? ` · ${esc(w.aircraftById(af.aircraftId)?.callsign ?? '')}` : ''}</span>`;
      return `<div class="afrow"><img src="${aircraftThumb(sp.id)}" alt=""><div><b>${esc(sp.abbr)}</b> ${st}
        <small>${L(`${skillName(af.skill)} pilot · ${sp.crew} kişilik · ${af.kills} düşürme · ${af.sorties} uçuş`, `${skillName(af.skill)} pilot · crew ${sp.crew} · ${af.kills} kills · ${af.sorties} sorties`)}</small></div></div>`;
    }).join('');
    // Tesisler
    const upg = (Object.keys(BASE_UPGRADES) as BaseUpgrade[]).map((k) => {
      const d = BASE_UPGRADES[k];
      if (ab.upgrades.has(k)) return `<div class="frow done"><span><b>✓ ${d.name}</b><small>${esc(d.desc)}</small></span></div>`;
      if (ab.job?.key === k) return `<div class="frow"><span><b>${d.name}</b><small>${L('inşaat', 'building')} · ${fmtDur(ab.job.left)}</small>${bar((1 - ab.job.left / ab.job.total) * 100, 'var(--warn)', true)}</span></div>`;
      const c = BASE_UPGRADE_COST[k];
      return `<button class="opt" data-act="base-up" data-key="${k}" ${ab.job || !s.active || !this.afford(c) ? 'disabled' : ''}><span><b>${d.name}</b><br><small>${esc(d.desc)}</small></span><small>${this.cost(c)} ${fmtDur(d.time)}</small></button>`;
    }).join('');
    const fac = w.structures.find((x) => x.attachedTo === s.id && !x.destroyed);
    const facChk = w.checkBaseFactory(ab);
    const facRow = fac
      ? `<button class="opt" data-act="sel-struct" data-id="${fac.id}"><span><b>▣ ${esc(fac.name)}</b><br><small>${fac.build < 1 ? `${L('inşaat', 'building')} ${pct(fac.build)}` : fac.factory!.queue.length ? `${L('üretimde', 'building')} ${esc(SPECS[fac.factory!.queue[0].specId].abbr)}` : L('boşta', 'idle')} — ${L('ürünler doğrudan bu hangara', 'output goes straight to this hangar')}</small></span><small>${L('git ›', 'go ›')}</small></button>`
      : `<button class="opt" data-act="base-fac" ${facChk.ok ? '' : 'disabled'}><span><b>▣ ${L('Uçak fabrikası (üssün yanına)', 'Aircraft factory (next to the base)')}</b><br><small>${facChk.ok ? L('Ürettiği uçaklar doğrudan bu üssün hangarına girer.', 'The aircraft it builds go straight into this base\'s hangar.') : esc(facChk.reason ?? '')}</small></span><small>${this.cost(STRUCTURE_COST.factory)} ${fmtDur(STRUCTURE_DEFS.factory.buildTime)}</small></button>`;
    return `
      ${this.head(s)}
      <div class="btn-row">
        <button class="primary" data-act="plan" ${canPlan ? '' : 'disabled'}>${L('Görev planla', 'Plan mission')}<span class="kbd"> (P)</span></button>
        <button data-act="research" title="${L('Araç ağacı ve modifikasyonlar (T)', 'Aircraft tree and upgrades (T)')}">${L('Araştırma ağacı', 'Research tree')}</button>
      </div>
      <div class="kv">
        <span>${L('Pist', 'Runway')}</span><span>${runway}</span>
        <span>${L('İniş yönü', 'Landing heading')}</span><span>${String(Math.round((ab.landingHeading() * 180) / Math.PI) % 360).padStart(3, '0')}° · ${L('süzülüş', 'glide slope')} ${(Math.atan(apr.glideTan) * 180 / Math.PI).toFixed(1)}°</span>
        <span>${L('Kalkış sırası', 'Takeoff queue')}</span><span>${ab.takeoffQueue.length}</span>
        <span>${L('İniş', 'Landing')}</span><span>${L(`${ab.approaching.length} yaklaşmada · ${ab.landingQueue.length} beklemede`, `${ab.approaching.length} on approach · ${ab.landingQueue.length} holding`)}</span>
        <span>${L('Kayıp', 'Lost')}</span><span>${ab.lostCount}</span>
      </div>
      <h3>Hangar · ${ab.inventory.length} / ${ab.capacity} · ${ready} ${L('hazır', 'ready')}</h3>
      ${rows ? `<div class="aflist">${rows}</div>` : `<p class="muted">${L('Hangar boş. Fabrikada üret ya da başka üsten transfer et.', 'The hangar is empty. Build aircraft at a factory or transfer them from another base.')}</p>`}
      <h3>${L('Tesisler', 'Facilities')}</h3>
      <div class="opts">${facRow}${upg}</div>
      <h3>${L('Alarm kolu', 'Alert flight')}</h3>
      <p class="muted">${L('Radar ya da gözcüler yakına düşman bildirince bu üsten otomatik önleyici kalkar.', 'When radar or observers report enemies nearby, interceptors scramble from this base automatically.')}</p>
      <label class="check"><input type="checkbox" data-act="alert-on" ${ab.alert.enabled ? 'checked' : ''}> ${L('Etkin', 'Enabled')}</label>
      <div class="form-row">
        <select data-act="alert-spec">${fighters.map((id) => `<option value="${id}" ${id === ab.alert.specId ? 'selected' : ''}>${esc(SPECS[id].name)}</option>`).join('') || `<option>${L('avcı yok', 'no fighters')}</option>`}</select>
        <select data-act="alert-count">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === ab.alert.count ? 'selected' : ''}>${n} ${L('uçak', 'aircraft')}</option>`).join('')}</select>
      </div>`;
  }

  // ------------------------------------------------------------------ uçaksavar

  private aa(s: Structure): string {
    const aa = s.aa!;
    const w = this.game.world;
    const research = w.teams[s.team].research;
    const mounts = aa.mounts.map((m, i) => {
      const wd = AA_WEAPONS[m.weapon];
      const tgt = m.targetId !== null ? w.aircraftById(m.targetId) : undefined;
      const st = tgt ? (m.acquire > 0 ? `${L('hedef alıyor', 'acquiring')}: ${tgt.callsign}` : `<b>${L('ateş', 'firing')}: ${tgt.callsign}</b>`) : L('boşta', 'idle');
      return `<div class="mount"><span class="slot">${i + 1}</span><span><b>${wd.short}</b> <span class="muted small">${wd.name}</span><br><small>${Math.round(wd.range / 100) / 10} km · ${L('tavan', 'ceiling')} ${nf.format(wd.ceiling)} m · ${st}</small></span></div>`;
    }).join('');
    const empty = aa.maxMounts - aa.mounts.length;
    const job = aa.job ? `<div class="job"><b>${esc(aa.job.label)}</b> — ${L(`${fmtDur(aa.job.left)} kaldı`, `${fmtDur(aa.job.left)} left`)} ${bar((1 - aa.job.left / aa.job.total) * 100, 'var(--warn)')}</div>` : '';
    const opts = aa.options(research);
    const byKey = new Map(opts.map((o) => [o.key, o]));
    const resBtn = (id: string | null) => this.researchButton(research, id);
    const econ = w.economyEnabled;
    const act = (o: UpgradeOption | undefined, label: string) => {
      if (!o) return '';
      const ok = o.enabled && this.afford(o.cost);
      const why = !o.enabled ? o.reason ?? o.detail : ok ? o.detail : `${L('Para yetmiyor', 'Not enough money')} (${fmtMoney(o.cost)})`;
      return `<button class="mini ${ok ? 'primary' : ''}" data-act="aa-up" data-key="${o.key}" ${ok ? '' : 'disabled'} title="${esc(why)}">${label} · ${econ && o.cost > 0 ? `${fmtMoney(o.cost)} · ` : ''}${fmtDur(o.time)}</button>`;
    };
    const weaponRows = AA_WEAPON_ORDER.map((id) => {
      const wd = AA_WEAPONS[id];
      const unlocked = research.has(wd.requires ?? undefined);
      const n = aa.mounts.filter((m) => m.weapon === id).length;
      const rep = opts.find((o) => o.key.startsWith('rep:') && o.key.endsWith(`:${id}`));
      return `<div class="aarow ${unlocked ? 'ok' : ''}"><span><b>${wd.short}</b> <small>${esc(wd.name)} · ${wd.range / 1000} km</small>${n ? `<small class="inst">${L(`bu bataryada ${n} adet`, `${n} at this battery`)}</small>` : ''}</span>
        <span class="aact">${unlocked ? `${act(byKey.get(`add:${id}`), L('Ekle', 'Add'))}${act(rep, L('Yükselt', 'Upgrade'))}` : resBtn(wd.requires)}</span></div>`;
    }).join('');
    const sensorRows = SENSOR_ORDER.map((id) => {
      const sd = AA_SENSORS[id];
      const unlocked = research.has(sd.requires);
      const has = aa.sensors.has(id);
      return `<div class="aarow ${unlocked ? 'ok' : ''}"><span><b>${has ? '✓ ' : ''}${esc(sd.name)}</b><small>${esc(sd.desc)}</small></span>
        <span class="aact">${has ? `<small class="inst">${L('kurulu', 'installed')}</small>` : unlocked ? act(byKey.get(`sen:${id}`), L('Kur', 'Install')) : resBtn(sd.requires)}</span></div>`;
    }).join('');
    const lvlRows = [2, 3, 4].map((lv) => {
      const req = lv === 2 ? 'hd_fort1' : lv === 3 ? 'hd_fort2' : 'hd_fort3';
      const unlocked = research.has(req);
      const done = aa.level >= lv;
      const what = lv === 2 ? L('beton çukurlar', 'concrete pits') : lv === 3 ? L('derin çukur ve cephane nişleri', 'deep pits and ammunition niches') : L('dış halkada iki ağır top kaidesi (toplam 8)', 'two heavy gun mounts on the outer ring (8 in all)');
      return `<div class="aarow ${unlocked ? 'ok' : ''}"><span><b>${done ? '✓ ' : ''}${L('Seviye', 'Level')} ${lv}</b><small>${L('+2 silah yuvası', '+2 gun slots')}, ${what}</small></span>
        <span class="aact">${done ? `<small class="inst">${L('tamam', 'done')}</small>` : unlocked ? (aa.level === lv - 1 ? act(byKey.get('lvl'), L('Yükselt', 'Upgrade')) : `<small>${L(`önce seviye ${lv - 1}`, `level ${lv - 1} first`)}</small>`) : resBtn(req)}</span></div>`;
    }).join('');
    return `
      ${this.head(s)}
      <div class="kv">
        <span>${L('Seviye', 'Level')}</span><span>${aa.level} · ${L('yuva', 'slots')} ${aa.mounts.length}/${aa.maxMounts}</span>
        <span>${L('Mürettebat', 'Crew')}</span><span>${aa.crew > 1.1 ? L('deneyimli', 'veteran') : aa.crew > 0.95 ? L('eğitimli', 'trained') : L('yeni', 'green')}</span>
        <span>${L('Atılan', 'Rounds fired')}</span><span>${nf.format(aa.shotsFired)}</span>
      </div>
      <h3>${L('Silah çukurları', 'Gun pits')}</h3>${mounts}${empty > 0 ? `<p class="muted small">${L(`${empty} boş çukur`, `${count(empty, 'empty pit')}`)}</p>` : ''}
      ${job}
      <h3>${L('Bataryanın ağacı', 'Battery tree')}</h3>
      <p class="muted small">${L('Araştırma yeni silahı yalnız kullanılabilir yapar; bu bataryaya ayrıca kurulur. Aynı anda bir iş.', 'Research only makes a new gun available; it is then installed at this battery. One job at a time.')}
        <button class="link" data-act="research-hd">${L('Tüm hava savunma ağacı ›', 'Full air defence tree ›')}</button></p>
      <div class="aatree"><div class="aagroup"><div class="mcat">${L('Silahlar', 'Guns')}</div>${weaponRows}</div>
        <div class="aagroup"><div class="mcat">${L('Nişan ve atış kontrolü', 'Sighting and fire control')}</div>${sensorRows}</div>
        <div class="aagroup"><div class="mcat">${L('Tahkimat', 'Fortification')}</div>${lvlRows}</div></div>`;
  }

  /** Henüz araştırılmamış düğüm için: durum ya da "araştır" düğmesi. */
  private researchButton(r: Research, id: string | null): string {
    if (!id) return '';
    const t = TECH_BY_ID[id];
    if (!t) return '';
    if (r.isActive(id)) return `<small class="inst">${L('araştırılıyor', 'researching')} ${pct(r.slots.tech.current?.progress ?? 0)}</small>`;
    if (r.isQueued(id)) return `<small class="inst">${L('sırada', 'queued')}</small>`;
    return `<button class="mini" data-act="enqueue" data-id="${id}" title="${esc(t.desc)}">${L('Araştır', 'Research')} · ${fmtDur(t.time)}</button>`;
  }

  // ------------------------------------------------------------------ radar

  private radar(s: Structure): string {
    const r = s.radar!;
    const lv = RADAR_LEVELS[r.level];
    const research = this.game.world.teams[s.team].research;
    const next = r.level === 1 ? `<div class="aarow"><span><b>${esc(TECH_BY_ID.radar_ew2.name)}</b><small>${esc(TECH_BY_ID.radar_ew2.desc)}</small></span><span class="aact">${this.researchButton(research, 'radar_ew2')}</span></div>` : '';
    return `
      ${this.head(s)}
      <div class="kv">
        <span>${L('Seviye', 'Level')}</span><span>${lv.name}</span>
        <span>${L('Menzil', 'Range')}</span><span>${r.range / 1000} km ${L('(büyük uçakta daha uzak)', '(farther for large aircraft)')}</span>
        <span>${L('Alçak kör bölge', 'Low blind zone')}</span><span>${L(`≈ ${r.minAgl} m altı`, `below ≈ ${r.minAgl} m`)}</span>
        <span>${L('Anten', 'Antenna')}</span><span>${nf.format(s.pos.y + r.antennaHeight)} m · ${L(`${r.scanPeriod} sn tarama`, `${r.scanPeriod} s sweep`)}</span>
        <span>${L('Son tarama', 'Last sweep')}</span><span>${L(`${r.lastCount} temas`, count(r.lastCount, 'contact'))}</span>
      </div>
      ${next}
      <h3>${L('Kapsama haritası', 'Coverage map')}</h3>
      <p class="muted small">${L(
        'Seçilen yükseklikte uçan bir avcıyı radarın görme ihtimali. Tepelerin arkası ve vadiler boş kalır; alçaldıkça kapsama dağılır (yer yansıması ve dünya eğriliği).',
        'The chance that the radar sees a fighter flying at the chosen height. Areas behind hills and valleys stay empty; lower down, coverage breaks up (ground clutter and the curvature of the earth).',
      )}</p>
      <label class="check"><input type="checkbox" data-act="cov" ${settings.map.radarCoverage ? 'checked' : ''}> ${L('Haritada göster', 'Show on map')}</label>
      <div class="form-row"><span class="muted small">${L('Yerden yükseklik', 'Height above ground')}</span>
        <select data-act="cov-agl">${[100, 200, 300, 600, 1500, 3000, 6000].map((v) => `<option value="${v}" ${v === settings.radarAgl ? 'selected' : ''}>${v} m</option>`).join('')}</select>
      </div>`;
  }

  // ------------------------------------------------------------------ fabrika

  private factory(s: Structure): string {
    const f = s.factory!;
    const w = this.game.world;
    const research = w.teams[s.team].research;
    const econ = w.economyEnabled;
    const q = f.queue.map((it, i) =>
      `<div class="qrow"><span>${i + 1}. <b>${esc(SPECS[it.specId].name)}</b>${econ && it.paid > 0 ? ` <small class="muted-ink">${fmtMoney(it.paid)}</small>` : ''}</span>
        <button class="mini icon-x" data-act="fac-del" data-i="${i}" title="${L('Siparişi iptal et', 'Cancel order')}${econ ? L(' (ödenen paranın kalan kısmı iade edilir)', ' (the unspent part is refunded)') : ''}">✕</button>
        ${i === 0 ? bar(it.progress * 100, 'var(--accent)', true) : ''}</div>`,
    ).join('') || `<p class="muted">${L('Kuyruk boş.', 'The queue is empty.')}</p>`;
    const roles: Role[] = ['fighter', 'attacker', 'diveBomber', 'bomber'];
    const groups = roles.map((role) => {
      const open = SPEC_LIST.filter((sp) => sp.role === role && sp.playable && research.hasAircraft(sp.id));
      if (!open.length) return '';
      return `<div class="mcat">${ROLE_NAMES[role]}</div>${open.map((sp) => {
        const price = aircraftPrice(sp);
        const ok = f.queue.length < 8 && this.afford(price);
        return `<button class="prow" data-act="fac-add" data-spec="${sp.id}" ${ok ? '' : 'disabled'}>
        <img src="${aircraftThumb(sp.id)}" alt=""><span><b>${esc(sp.name)}</b><small>${nf.format(sp.vMax * 3.6)} km/${L('sa', 'h')} · ${fmtDur(sp.buildTime)}${econ ? ` · ${this.cost(price)}` : ''}</small></span><b class="plus">+</b></button>`;
      }).join('')}`;
    }).join('');
    const locked = SPEC_LIST.filter((sp) => sp.playable && !research.hasAircraft(sp.id) && aircraftNode(sp.id));
    const own = s.attachedTo !== null ? w.airbaseById(s.attachedTo) : undefined;
    const target = own && own.s.active && own.freeSlots > 0 ? own : w.nearestAirbase(s.team, s.pos, (b) => b.s.active && b.freeSlots > 0);
    return `
      ${this.head(s)}
      <div class="kv">
        <span>${L('Üretim hızı', 'Production rate')}</span><span>${pct(0.4 + 0.6 * (s.hp / s.maxHp))}</span>
        <span>${L('Teslim', 'Delivers to')}</span><span>${target ? esc(target.s.name) : `<b class="bad">${L('boş hangar yok', 'no free hangar')}</b>`}</span>
      </div>
      <h3>${L('Üretim sırası', 'Production queue')}</h3>${q}
      <label class="check"><input type="checkbox" data-act="fac-repeat" ${f.repeat ? 'checked' : ''}> ${L('Bitince tekrarla', 'Repeat when done')}${econ ? ` <span class="muted small">${L('(her tekrar yeniden ödenir)', '(each repeat is paid again)')}</span>` : ''}</label>
      ${f.queue.length ? `<button class="wide" data-act="fac-clear">${L('Kuyruğu temizle', 'Clear queue')}${econ ? L(' (iade)', ' (refund)') : ''}</button>` : ''}
      <h3>${L('Üret', 'Build')}</h3><div class="plist">${groups}</div>
      ${locked.length ? `<p class="muted small">${L(`Araç ağacında açılacak ${locked.length} uçak daha var.`, `${locked.length} more aircraft to unlock in the aircraft tree.`)} <button class="link" data-act="research">${L('Araç ağacı ›', 'Aircraft tree ›')}</button></p>` : ''}`;
  }

  // ------------------------------------------------------------------ düşman yapısı

  private enemyStructure(s: Structure): string {
    const own = this.game.world.airbasesOf(this.game.playerTeam).some((b) => b.usable);
    return `
      ${this.head(s)}
      <p class="muted">${esc(STRUCTURE_DEFS[s.kind].desc)}</p>
      ${s.aa ? `<p class="muted small">${L(`Gözlenen silahlar: ${s.aa.mounts.length} çukur`, `Observed guns: ${count(s.aa.mounts.length, 'pit')}`)}</p>` : ''}
      <button class="wide primary" data-act="attack" ${own && !s.destroyed ? '' : 'disabled'}>${L('Bu hedefe saldırı planla', 'Plan a strike on this target')}</button>`;
  }

  // ------------------------------------------------------------------ olaylar

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b || b instanceof HTMLSelectElement || (b instanceof HTMLInputElement && b.type !== 'button')) return;
    const g = this.game;
    const s = g.selectedStructure;
    switch (b.dataset.act) {
      case 'back':
        g.selectStructure(null);
        break;
      case 'sel-flight': {
        const fl = g.world.flightById(Number(b.dataset.id));
        if (fl) g.selectFlight(fl);
        break;
      }
      case 'sel-struct': {
        const st = g.world.structureById(Number(b.dataset.id));
        if (st) g.focusStructure(st);
        break;
      }
      case 'plan':
        if (s?.airbase) g.planner.open(s.airbase);
        break;
      case 'research':
        g.modals.open('research', 'arac');
        return;
      case 'open-build':
        g.build.open('city');
        return;
      case 'open-econ':
        g.build.open('economy');
        return;
      case 'market':
        g.modals.open('market');
        return;
      case 'research-hd':
        g.modals.open('research', 'hd');
        return;
      case 'enqueue':
        g.world.teams[g.playerTeam].research.enqueue(b.dataset.id!);
        break;
      case 'attack': {
        if (!s) break;
        const base = g.world.nearestAirbase(g.playerTeam, s.pos, (x) => x.usable && x.inventory.some((a) => a.status === 'ready'));
        if (base) g.planner.open(base, s);
        break;
      }
      case 'aa-up':
        if (s?.aa) g.world.startAAJob(s, b.dataset.key!);
        break;
      case 'repair':
        if (s) g.world.setRepair(s, true);
        break;
      case 'repair-stop':
        if (s) g.world.setRepair(s, false);
        break;
      case 'base-up':
        if (s?.airbase) g.world.startBaseUpgrade(s.airbase, b.dataset.key as BaseUpgrade);
        break;
      case 'base-fac':
        if (s?.airbase) {
          const f = g.world.placeBaseFactory(s.airbase);
          if (f) g.renderer.invalidateCoverage();
        }
        break;
      case 'fac-add':
        if (s?.factory) g.world.orderAircraft(s, b.dataset.spec!);
        break;
      case 'fac-del':
        if (s?.factory) g.world.cancelOrder(s, Number(b.dataset.i));
        break;
      case 'fac-clear':
        if (s?.factory) for (let i = s.factory.queue.length - 1; i >= 0; i--) g.world.cancelOrder(s, i);
        break;
    }
    this.render(true);
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const s = this.game.selectedStructure;
    switch (el.dataset.act) {
      case 'alert-on':
        if (s?.airbase) s.airbase.alert.enabled = (el as HTMLInputElement).checked;
        break;
      case 'alert-spec':
        if (s?.airbase) s.airbase.alert.specId = el.value;
        break;
      case 'alert-count':
        if (s?.airbase) s.airbase.alert.count = Number(el.value);
        break;
      case 'fac-repeat':
        if (s?.factory) s.factory.repeat = (el as HTMLInputElement).checked;
        break;
      case 'cov':
        settings.map.radarCoverage = (el as HTMLInputElement).checked;
        saveSettings();
        break;
      case 'cov-agl':
        settings.radarAgl = Number(el.value);
        saveSettings();
        break;
    }
    (el as HTMLElement).blur();
    this.render(true);
  }
}
