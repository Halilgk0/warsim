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
import { $, bar, esc, fmtDur, hpColor, nf } from './dom';

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
        ${d.population ? `<span>Nüfus</span><span>${nf.format(d.population)}</span>` : ''}
        ${d.jobs ? `<span>İş yeri</span><span>${nf.format(d.jobs)}</span>` : ''}
        <span>Taban</span><span>${Math.round(d.halfW * 2)} × ${Math.round(d.halfL * 2)} m</span>
        <span>Yakındaki bina</span><span>${near}</span>
      </div>
      <h3>Şehir geneli</h3>
      <div class="kv">
        <span>Toplam nüfus</span><span>${nf.format(pop)}</span>
        <span>Toplam iş yeri</span><span>${nf.format(jobs)}</span>
        <span>İşsiz / boş kadro</span><span>${pop > jobs ? `${nf.format(pop - jobs)} işsiz` : `${nf.format(jobs - pop)} boş kadro`}</span>
      </div>
      <p class="note">Şehir yapıları şimdilik personel barındırır (ev 4, apartman 16 kişi). Vergi ve iş gücü ilerideki bir aşamada ekonomiye bağlanacak.</p>`;
  }

  // ------------------------------------------------------------------ maden

  private mine(s: Structure): string {
    const w = this.game.world;
    const out = w.mineOutput(s) * 60;
    const rich = s.active
      ? `<span class="rich r${richnessTier(s.richness)}">${richnessName(s.richness)}</span>`
      : '<span class="muted-ink">ocak açılınca belli olur</span>';
    const dmg = s.hp < s.maxHp ? ` · hasar yüzünden %${Math.round((1 - (0.3 + 0.7 * (s.hp / s.maxHp))) * 100)} düşük` : '';
    return `
      ${this.head(s)}
      <p class="muted">${esc(s.def.desc)}</p>
      <div class="kv">
        <span>Damar</span><span>${rich}</span>
        <span>Üretim</span><span>${s.active ? `${fmtMoney(out)}/dk${dmg}` : `inşaat %${Math.round(s.build * 100)}`}</span>
        <span>Toplam kazanç</span><span>${fmtMoney(s.earned)}</span>
        <span>Geri ödeme</span><span>${s.active && out > 0 ? `≈ ${fmtDur((STRUCTURE_COST.mine / out) * 60)}` : '—'}</span>
      </div>
      <p class="note">Damarın verimi yerden yere çok değişir ve haritada görünmez; kurmadan bilinmez. Düşman madenleri de bombalanabilir: yıkılan ocak ganimet getirir.</p>
      <button class="wide" data-act="market">Hazine ve pazar ›</button>`;
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
    const st = s.destroyed ? '<span class="bad">yıkık</span>' : s.build < 1 ? `inşaat %${Math.round(s.build * 100)}` : `sağlam %${Math.round((s.hp / s.maxHp) * 100)}`;
    return `
      <div class="panel-head">
        <button class="icon" data-act="back" title="Geri (Esc)">‹</button>
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
      const st = wait > 0 ? `vurulduğu için ${fmtDur(wait)} bekliyor` : `kalan ${fmtDur(est.time)}${cost}`;
      return `<div class="frow repair"><span>🔧 Onarılıyor · ${st}</span><button class="link" data-act="repair-stop">Durdur</button></div>`;
    }
    return `<button class="wide" data-act="repair" title="Onarım yavaş ilerler, bedeli adım adım ödenir; yapı vurulursa 5 dk durur.">Onar · ${fmtDur(est.time)}${cost}</button>`;
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
      const txt = [...counts].map(([id, n]) => `${n} ${esc(SPECS[id].abbr)}`).join(', ') || 'hazır uçak yok';
      const st = s.destroyed ? '<b class="bad">yıkık</b>' : s.build < 1 ? `inşaat %${Math.round(s.build * 100)}` : !ab.usable ? '<b class="bad">pist kapalı</b>' : txt;
      return `<button class="row-btn" data-act="sel-struct" data-id="${s.id}"><span>✈ <b>${esc(s.name)}</b></span><small>${st}</small></button>`;
    }).join('');

    const others = w.structures.filter((s) => s.team === me && !s.airbase && s.def.category !== 'city');
    const city = w.structures.filter((s) => s.team === me && s.def.category === 'city');
    const cityPop = city.filter((s) => s.active).reduce((a, s) => a + (s.def.population ?? 0), 0);
    const cityJobs = city.filter((s) => s.active).reduce((a, s) => a + (s.def.jobs ?? 0), 0);
    const cityBuilding = city.filter((s) => s.build < 1 && !s.destroyed).length;
    const otherRows = others.map((s) => {
      let sub = s.destroyed ? 'yıkık' : s.build < 1 ? `inşaat %${Math.round(s.build * 100)}` : `%${Math.round((s.hp / s.maxHp) * 100)}`;
      if (s.aa && s.active) sub += ` · ${s.aa.mounts.map((m) => AA_WEAPONS[m.weapon].short).join(', ')}${s.aa.job ? ' · <i>yükseltiliyor</i>' : ''}`;
      if (s.factory && s.active) sub += s.factory.queue.length ? ` · üretimde ${esc(SPECS[s.factory.queue[0].specId].abbr)}` : ' · boşta';
      if (s.radar && s.active) sub += ` · ${s.radar.lastCount} temas`;
      if (s.kind === 'mine' && s.active) sub += ` · ${richnessName(s.richness).toLowerCase()} · ${fmtMoney(w.mineOutput(s) * 60)}/dk`;
      return `<button class="row-btn" data-act="sel-struct" data-id="${s.id}"><span>${KIND_ICON[s.kind]} ${esc(s.name)}</span><small>${sub}</small></button>`;
    }).join('');

    // Elenen tarafların yıkıntıları listelenmez
    const enemy = w.structures.filter((s) => s.team !== me && !w.teams[s.team]?.eliminated);
    const enemyRows = enemy.map((s) =>
      `<button class="row-btn enemy" data-act="sel-struct" data-id="${s.id}"><span>${KIND_ICON[s.kind]} ${esc(s.name)}</span><small>${s.destroyed ? 'yıkık' : `%${Math.round((s.hp / s.maxHp) * 100)}`}</small></button>`,
    ).join('');

    const tm = w.teams[me];
    const mines = w.structures.filter((s) => s.team === me && s.kind === 'mine' && !s.destroyed);
    const moneyHtml = w.economyEnabled ? `
      <h3>Hazine</h3>
      <div class="frow pers"><b>${fmtMoney(tm.money)}</b> · son 1 dk <span class="pos">+${fmtMoney(w.incomeRate(me))}</span>
        <small>${mines.length} maden ocağı · ${fmtMoney(w.mineRate(me))}/dk. Gelir: maden, düşürülen düşman uçağı, yıkılan düşman yapısı, pazarda satış.
        <button class="link" data-act="market">Hazine ve pazar ›</button> <button class="link" data-act="open-econ">İnşa › Ekonomi</button></small></div>` : '';
    const pers = w.teams[me].personnel;
    const persHtml = w.personnelEnabled ? `
      <h3>Personel</h3>
      <div class="frow pers"><b>${w.crewFree(me)} kişi boşta</b> · ${pers.reserved} uçuşta · konut ${pers.capacity} kişilik${pers.people < pers.capacity ? ` · ${pers.capacity - pers.people} eksik, yerine geliyor` : ''}
        <small>1 ev = 4 kişi, 1 apartman = 16 kişi. Uçaklar mürettebatı kadar kişiyle kalkar; eksikse hangarda bekler. <button class="link" data-act="open-build">İnşa › Şehir</button></small></div>` : '';
    return `${moneyHtml}${persHtml}
      <p class="muted small">Havadaki kollar sağ paneldeki <b>Aktif görevler</b> bölümünde.${flights.length ? ` Şu an ${flights.length} kol görevde.` : ''}</p>
      <h3>Hava üsleri</h3><div class="list">${baseRows || '<p class="muted">Hava üssü yok.</p>'}</div>
      ${others.length ? `<h3>Yapılar</h3><div class="list">${otherRows}</div>` : ''}
      ${city.length ? `<h3>Şehir</h3><div class="frow"><b>${city.length} bina</b> · nüfus ${nf.format(cityPop)} · iş ${nf.format(cityJobs)}${cityBuilding ? ` · ${cityBuilding} inşaat` : ''}</div>` : ''}
      ${enemy.length ? `<h3>Bilinen düşman hedefleri</h3><div class="list">${enemyRows}</div>` : ''}`;
  }

  // ------------------------------------------------------------------ hava üssü

  private airbase(s: Structure): string {
    const ab = s.airbase!;
    const w = this.game.world;
    const t = w.time;
    const runway = s.build < 1 ? 'İnşaat sürüyor' : ab.runwayDamage > 0
      ? `Pist hasarı %${Math.round(ab.runwayDamage * 100)}${ab.usable ? '' : ' — <b class="bad">kapalı</b>'} (onarılıyor)`
      : 'Pist kullanılabilir';
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
      const st = af.status === 'ready' ? (manned ? '<span class="st ok">hazır</span>' : '<span class="st warn">mürettebat yok</span>')
        : af.status === 'servicing' ? `<span class="st warn">bakımda · ${fmtDur(af.readyAt - t)}</span>`
        : `<span class="st air">havada${af.aircraftId !== null ? ` · ${esc(w.aircraftById(af.aircraftId)?.callsign ?? '')}` : ''}</span>`;
      return `<div class="afrow"><img src="${aircraftThumb(sp.id)}" alt=""><div><b>${esc(sp.abbr)}</b> ${st}
        <small>${skillName(af.skill)} pilot · ${sp.crew} kişilik · ${af.kills} düşürme · ${af.sorties} uçuş</small></div></div>`;
    }).join('');
    // Tesisler
    const upg = (Object.keys(BASE_UPGRADES) as BaseUpgrade[]).map((k) => {
      const d = BASE_UPGRADES[k];
      if (ab.upgrades.has(k)) return `<div class="frow done"><span><b>✓ ${d.name}</b><small>${esc(d.desc)}</small></span></div>`;
      if (ab.job?.key === k) return `<div class="frow"><span><b>${d.name}</b><small>inşaat · ${fmtDur(ab.job.left)}</small>${bar((1 - ab.job.left / ab.job.total) * 100, 'var(--warn)', true)}</span></div>`;
      const c = BASE_UPGRADE_COST[k];
      return `<button class="opt" data-act="base-up" data-key="${k}" ${ab.job || !s.active || !this.afford(c) ? 'disabled' : ''}><span><b>${d.name}</b><br><small>${esc(d.desc)}</small></span><small>${this.cost(c)} ${fmtDur(d.time)}</small></button>`;
    }).join('');
    const fac = w.structures.find((x) => x.attachedTo === s.id && !x.destroyed);
    const facChk = w.checkBaseFactory(ab);
    const facRow = fac
      ? `<button class="opt" data-act="sel-struct" data-id="${fac.id}"><span><b>▣ ${esc(fac.name)}</b><br><small>${fac.build < 1 ? `inşaat %${Math.round(fac.build * 100)}` : fac.factory!.queue.length ? `üretimde ${esc(SPECS[fac.factory!.queue[0].specId].abbr)}` : 'boşta'} — ürünler doğrudan bu hangara</small></span><small>git ›</small></button>`
      : `<button class="opt" data-act="base-fac" ${facChk.ok ? '' : 'disabled'}><span><b>▣ Uçak fabrikası (üssün yanına)</b><br><small>${facChk.ok ? 'Ürettiği uçaklar doğrudan bu üssün hangarına girer.' : esc(facChk.reason ?? '')}</small></span><small>${this.cost(STRUCTURE_COST.factory)} ${fmtDur(STRUCTURE_DEFS.factory.buildTime)}</small></button>`;
    return `
      ${this.head(s)}
      <div class="btn-row">
        <button class="primary" data-act="plan" ${canPlan ? '' : 'disabled'}>Görev planla<span class="kbd"> (P)</span></button>
        <button data-act="research" title="Araç ağacı ve modifikasyonlar (T)">Araştırma ağacı</button>
      </div>
      <div class="kv">
        <span>Pist</span><span>${runway}</span>
        <span>İniş yönü</span><span>${String(Math.round((ab.landingHeading() * 180) / Math.PI) % 360).padStart(3, '0')}° · süzülüş ${(Math.atan(apr.glideTan) * 180 / Math.PI).toFixed(1)}°</span>
        <span>Kalkış sırası</span><span>${ab.takeoffQueue.length}</span>
        <span>İniş</span><span>${ab.approaching.length} yaklaşmada · ${ab.landingQueue.length} beklemede</span>
        <span>Kayıp</span><span>${ab.lostCount}</span>
      </div>
      <h3>Hangar · ${ab.inventory.length} / ${ab.capacity} · ${ready} hazır</h3>
      ${rows ? `<div class="aflist">${rows}</div>` : '<p class="muted">Hangar boş. Fabrikada üret ya da başka üsten transfer et.</p>'}
      <h3>Tesisler</h3>
      <div class="opts">${facRow}${upg}</div>
      <h3>Alarm kolu</h3>
      <p class="muted">Radar ya da gözcüler yakına düşman bildirince bu üsten otomatik önleyici kalkar.</p>
      <label class="check"><input type="checkbox" data-act="alert-on" ${ab.alert.enabled ? 'checked' : ''}> Etkin</label>
      <div class="form-row">
        <select data-act="alert-spec">${fighters.map((id) => `<option value="${id}" ${id === ab.alert.specId ? 'selected' : ''}>${esc(SPECS[id].name)}</option>`).join('') || '<option>avcı yok</option>'}</select>
        <select data-act="alert-count">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === ab.alert.count ? 'selected' : ''}>${n} uçak</option>`).join('')}</select>
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
      const st = tgt ? (m.acquire > 0 ? `hedef alıyor: ${tgt.callsign}` : `<b>ateş: ${tgt.callsign}</b>`) : 'boşta';
      return `<div class="mount"><span class="slot">${i + 1}</span><span><b>${wd.short}</b> <span class="muted small">${wd.name}</span><br><small>${Math.round(wd.range / 100) / 10} km · tavan ${nf.format(wd.ceiling)} m · ${st}</small></span></div>`;
    }).join('');
    const empty = aa.maxMounts - aa.mounts.length;
    const job = aa.job ? `<div class="job"><b>${esc(aa.job.label)}</b> — ${fmtDur(aa.job.left)} kaldı ${bar((1 - aa.job.left / aa.job.total) * 100, 'var(--warn)')}</div>` : '';
    const opts = aa.options(research);
    const byKey = new Map(opts.map((o) => [o.key, o]));
    const resBtn = (id: string | null) => this.researchButton(research, id);
    const econ = w.economyEnabled;
    const act = (o: UpgradeOption | undefined, label: string) => {
      if (!o) return '';
      const ok = o.enabled && this.afford(o.cost);
      const why = !o.enabled ? o.reason ?? o.detail : ok ? o.detail : `Para yetmiyor (${fmtMoney(o.cost)})`;
      return `<button class="mini ${ok ? 'primary' : ''}" data-act="aa-up" data-key="${o.key}" ${ok ? '' : 'disabled'} title="${esc(why)}">${label} · ${econ && o.cost > 0 ? `${fmtMoney(o.cost)} · ` : ''}${fmtDur(o.time)}</button>`;
    };
    const weaponRows = AA_WEAPON_ORDER.map((id) => {
      const wd = AA_WEAPONS[id];
      const unlocked = research.has(wd.requires ?? undefined);
      const n = aa.mounts.filter((m) => m.weapon === id).length;
      const rep = opts.find((o) => o.key.startsWith('rep:') && o.key.endsWith(`:${id}`));
      return `<div class="aarow ${unlocked ? 'ok' : ''}"><span><b>${wd.short}</b> <small>${esc(wd.name)} · ${wd.range / 1000} km</small>${n ? `<small class="inst">bu bataryada ${n} adet</small>` : ''}</span>
        <span class="aact">${unlocked ? `${act(byKey.get(`add:${id}`), 'Ekle')}${act(rep, 'Yükselt')}` : resBtn(wd.requires)}</span></div>`;
    }).join('');
    const sensorRows = SENSOR_ORDER.map((id) => {
      const sd = AA_SENSORS[id];
      const unlocked = research.has(sd.requires);
      const has = aa.sensors.has(id);
      return `<div class="aarow ${unlocked ? 'ok' : ''}"><span><b>${has ? '✓ ' : ''}${esc(sd.name)}</b><small>${esc(sd.desc)}</small></span>
        <span class="aact">${has ? '<small class="inst">kurulu</small>' : unlocked ? act(byKey.get(`sen:${id}`), 'Kur') : resBtn(sd.requires)}</span></div>`;
    }).join('');
    const lvlRows = [2, 3, 4].map((lv) => {
      const req = lv === 2 ? 'hd_fort1' : lv === 3 ? 'hd_fort2' : 'hd_fort3';
      const unlocked = research.has(req);
      const done = aa.level >= lv;
      const what = lv === 2 ? 'beton çukurlar' : lv === 3 ? 'derin çukur ve cephane nişleri' : 'dış halkada iki ağır top kaidesi (toplam 8)';
      return `<div class="aarow ${unlocked ? 'ok' : ''}"><span><b>${done ? '✓ ' : ''}Seviye ${lv}</b><small>+2 silah yuvası, ${what}</small></span>
        <span class="aact">${done ? '<small class="inst">tamam</small>' : unlocked ? (aa.level === lv - 1 ? act(byKey.get('lvl'), 'Yükselt') : '<small>önce seviye ' + (lv - 1) + '</small>') : resBtn(req)}</span></div>`;
    }).join('');
    return `
      ${this.head(s)}
      <div class="kv">
        <span>Seviye</span><span>${aa.level} · yuva ${aa.mounts.length}/${aa.maxMounts}</span>
        <span>Mürettebat</span><span>${aa.crew > 1.1 ? 'deneyimli' : aa.crew > 0.95 ? 'eğitimli' : 'yeni'}</span>
        <span>Atılan</span><span>${nf.format(aa.shotsFired)}</span>
      </div>
      <h3>Silah çukurları</h3>${mounts}${empty > 0 ? `<p class="muted small">${empty} boş çukur</p>` : ''}
      ${job}
      <h3>Bataryanın ağacı</h3>
      <p class="muted small">Araştırma yeni silahı yalnız kullanılabilir yapar; bu bataryaya ayrıca kurulur. Aynı anda bir iş.
        <button class="link" data-act="research-hd">Tüm hava savunma ağacı ›</button></p>
      <div class="aatree"><div class="aagroup"><div class="mcat">Silahlar</div>${weaponRows}</div>
        <div class="aagroup"><div class="mcat">Nişan ve atış kontrolü</div>${sensorRows}</div>
        <div class="aagroup"><div class="mcat">Tahkimat</div>${lvlRows}</div></div>`;
  }

  /** Henüz araştırılmamış düğüm için: durum ya da "araştır" düğmesi. */
  private researchButton(r: Research, id: string | null): string {
    if (!id) return '';
    const t = TECH_BY_ID[id];
    if (!t) return '';
    if (r.isActive(id)) return `<small class="inst">araştırılıyor %${Math.round((r.slots.tech.current?.progress ?? 0) * 100)}</small>`;
    if (r.isQueued(id)) return '<small class="inst">sırada</small>';
    return `<button class="mini" data-act="enqueue" data-id="${id}" title="${esc(t.desc)}">Araştır · ${fmtDur(t.time)}</button>`;
  }

  // ------------------------------------------------------------------ radar

  private radar(s: Structure): string {
    const r = s.radar!;
    const lv = RADAR_LEVELS[r.level];
    const research = this.game.world.teams[s.team].research;
    const next = r.level === 1 ? `<div class="aarow"><span><b>Erken ihbar radarı II</b><small>${esc(TECH_BY_ID.radar_ew2.desc)}</small></span><span class="aact">${this.researchButton(research, 'radar_ew2')}</span></div>` : '';
    return `
      ${this.head(s)}
      <div class="kv">
        <span>Seviye</span><span>${lv.name}</span>
        <span>Menzil</span><span>${r.range / 1000} km (büyük uçakta daha uzak)</span>
        <span>Alçak kör bölge</span><span>≈ ${r.minAgl} m altı</span>
        <span>Anten</span><span>${nf.format(s.pos.y + r.antennaHeight)} m · ${r.scanPeriod} sn tarama</span>
        <span>Son tarama</span><span>${r.lastCount} temas</span>
      </div>
      ${next}
      <h3>Kapsama haritası</h3>
      <p class="muted small">Seçilen yükseklikte uçan bir avcıyı radarın görme ihtimali. Tepelerin arkası ve vadiler boş kalır; alçaldıkça kapsama dağılır (yer yansıması ve dünya eğriliği).</p>
      <label class="check"><input type="checkbox" data-act="cov" ${settings.map.radarCoverage ? 'checked' : ''}> Haritada göster</label>
      <div class="form-row"><span class="muted small">Yerden yükseklik</span>
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
        <button class="mini icon-x" data-act="fac-del" data-i="${i}" title="Siparişi iptal et${econ ? ' (ödenen paranın kalan kısmı iade edilir)' : ''}">✕</button>
        ${i === 0 ? bar(it.progress * 100, 'var(--accent)', true) : ''}</div>`,
    ).join('') || '<p class="muted">Kuyruk boş.</p>';
    const roles: Role[] = ['fighter', 'attacker', 'diveBomber', 'bomber'];
    const groups = roles.map((role) => {
      const open = SPEC_LIST.filter((sp) => sp.role === role && sp.playable && research.hasAircraft(sp.id));
      if (!open.length) return '';
      return `<div class="mcat">${ROLE_NAMES[role]}</div>${open.map((sp) => {
        const price = aircraftPrice(sp);
        const ok = f.queue.length < 8 && this.afford(price);
        return `<button class="prow" data-act="fac-add" data-spec="${sp.id}" ${ok ? '' : 'disabled'}>
        <img src="${aircraftThumb(sp.id)}" alt=""><span><b>${esc(sp.name)}</b><small>${nf.format(sp.vMax * 3.6)} km/sa · ${fmtDur(sp.buildTime)}${econ ? ` · ${this.cost(price)}` : ''}</small></span><b class="plus">+</b></button>`;
      }).join('')}`;
    }).join('');
    const locked = SPEC_LIST.filter((sp) => sp.playable && !research.hasAircraft(sp.id) && aircraftNode(sp.id));
    const own = s.attachedTo !== null ? w.airbaseById(s.attachedTo) : undefined;
    const target = own && own.s.active && own.freeSlots > 0 ? own : w.nearestAirbase(s.team, s.pos, (b) => b.s.active && b.freeSlots > 0);
    return `
      ${this.head(s)}
      <div class="kv">
        <span>Üretim hızı</span><span>%${Math.round((0.4 + 0.6 * (s.hp / s.maxHp)) * 100)}</span>
        <span>Teslim</span><span>${target ? esc(target.s.name) : '<b class="bad">boş hangar yok</b>'}</span>
      </div>
      <h3>Üretim sırası</h3>${q}
      <label class="check"><input type="checkbox" data-act="fac-repeat" ${f.repeat ? 'checked' : ''}> Bitince tekrarla${econ ? ' <span class="muted small">(her tekrar yeniden ödenir)</span>' : ''}</label>
      ${f.queue.length ? `<button class="wide" data-act="fac-clear">Kuyruğu temizle${econ ? ' (iade)' : ''}</button>` : ''}
      <h3>Üret</h3><div class="plist">${groups}</div>
      ${locked.length ? `<p class="muted small">Araç ağacında açılacak ${locked.length} uçak daha var. <button class="link" data-act="research">Araç ağacı ›</button></p>` : ''}`;
  }

  // ------------------------------------------------------------------ düşman yapısı

  private enemyStructure(s: Structure): string {
    const own = this.game.world.airbasesOf(this.game.playerTeam).some((b) => b.usable);
    return `
      ${this.head(s)}
      <p class="muted">${esc(STRUCTURE_DEFS[s.kind].desc)}</p>
      ${s.aa ? `<p class="muted small">Gözlenen silahlar: ${s.aa.mounts.length} çukur</p>` : ''}
      <button class="wide primary" data-act="attack" ${own && !s.destroyed ? '' : 'disabled'}>Bu hedefe saldırı planla</button>`;
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
