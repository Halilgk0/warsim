// Pencereler: senaryolar, araştırma ağacı, hazine ve pazar, ayarlar (ses, görünüm).

import type { Game } from '../game';
import { SCENARIOS, SCENARIO_GROUPS, type ScenarioGroup } from '../sim/scenarios';
import { INFO_FIELDS, LOG_CATEGORIES, MAP_LAYERS, SOUND_LEVELS, onSettingsChange, saveSettings, settings, type SoundLevel } from './settings';
import { sound } from '../audio/sound';
import { defaultSelection, researchBody, stageOf, type ResearchStage, type ResearchTab } from './research';
import { TECH_BY_ID } from '../sim/tech';
import { marketBody, sellCandidate } from './market';
import { $, esc } from './dom';

export type ModalKind = 'scenarios' | 'research' | 'settings' | 'market';

export class Modals {
  isOpen = false;
  private kind: ModalKind | null = null;
  private el = $('modal');
  private next = 0;
  private tab: ResearchTab = 'arac';
  /** Araştırma panosunda seçili düğüm (dosyası sağda açılır). */
  private sel: string | null = null;
  /** Uçak programları ve mühendislikte gösterilen aşama. */
  private stage: ResearchStage = 1;
  /** Son kaydırma zamanı (kaydırırken yeniden çizilmez). */
  private lastScroll = 0;
  /** Pazarda teslim / satış üssü. */
  private marketBase: number | null = null;
  /** Pazarda son işlem uyarısı. */
  private marketMsg = '';

  constructor(private readonly game: Game) {
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => this.onChange(e));
    // N tuşu ya da üst çubuktaki hoparlör: açık penceredeki "Sessiz" kutusu da değişsin
    onSettingsChange(() => {
      const cb = this.el.querySelector<HTMLInputElement>('input[data-set="muted"]');
      if (cb) cb.checked = settings.sound.muted;
    });
    // Ses düzeyi sürüklerken hemen duyulur (kayıt bırakınca)
    this.el.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.set !== 'sound') return;
      sound.setLevel(el.dataset.k as SoundLevel, Number(el.value));
      const out = el.nextElementSibling;
      if (out) out.textContent = String(Math.round(Number(el.value) * 100));
    });
    this.el.addEventListener('scroll', () => (this.lastScroll = performance.now()), true);
  }

  open(kind: ModalKind, tab?: ResearchTab): void {
    if (this.isOpen && this.kind === kind && !tab) {
      this.close();
      return;
    }
    if (tab && tab !== this.tab) {
      this.tab = tab;
      this.sel = null;
    }
    this.kind = kind;
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.kind = null;
    this.el.classList.add('hidden');
  }

  update(): void {
    if (!this.isOpen || (this.kind !== 'research' && this.kind !== 'market')) return;
    const now = performance.now();
    if (now < this.next || now - this.lastScroll < 900) return;
    this.next = now + 500;
    this.render();
  }

  private render(): void {
    // Yeniden çizimde kaydırma konumları korunur (gövde, zaman çizelgesi, dosya)
    const scroll = this.el.querySelector('.modal-body')?.scrollTop ?? 0;
    const tlLeft = this.el.querySelector('.tl-scroll')?.scrollLeft ?? null;
    const dosTop = this.el.querySelector('.rb-dos')?.scrollTop ?? 0;
    const main = this.el.querySelector('.rb-main');
    const mainTop = main?.scrollTop ?? 0;
    const mainLeft = main?.scrollLeft ?? 0;
    let body = '';
    let title = '';
    if (this.kind === 'scenarios') {
      title = 'Senaryolar';
      body = this.scenarios();
    } else if (this.kind === 'research') {
      title = 'Araştırma';
      body = this.research();
    } else if (this.kind === 'settings') {
      title = 'Ayarlar';
      body = this.settingsBody();
    } else if (this.kind === 'market') {
      title = 'Hazine ve pazar';
      body = (this.marketMsg ? `<div class="mk-msg">${esc(this.marketMsg)}</div>` : '') + marketBody(this.game.world, this.game.playerTeam, this.marketBase);
    }
    this.el.innerHTML = `
      <div class="modal-card ${this.kind}">
        <div class="modal-head"><h2>${title}</h2><button class="close" data-act="close" title="Kapat (Esc)">✕</button></div>
        <div class="modal-body">${body}</div>
      </div>`;
    const mb = this.el.querySelector('.modal-body');
    if (mb) mb.scrollTop = scroll;
    const tl = this.el.querySelector('.tl-scroll');
    if (tl && tlLeft !== null) tl.scrollLeft = tlLeft;
    const dos = this.el.querySelector('.rb-dos');
    if (dos) dos.scrollTop = dosTop;
    const mainEl = this.el.querySelector('.rb-main');
    if (mainEl) {
      mainEl.scrollTop = mainTop;
      mainEl.scrollLeft = mainLeft;
    }
  }

  private scenarios(): string {
    const groups = Object.keys(SCENARIO_GROUPS) as ScenarioGroup[];
    return groups.map((gk) => `
      <h3>${SCENARIO_GROUPS[gk]}</h3>
      <div class="scen-grid">${SCENARIOS.filter((s) => s.group === gk).map((s) =>
        `<button class="scen ${s.id === this.game.scenarioId ? 'active' : ''}" data-act="scenario" data-id="${s.id}">
          <b>${esc(s.name)}</b><small>${esc(s.description)}</small></button>`).join('')}</div>`).join('');
  }

  private research(): string {
    const g = this.game;
    const r = g.world.teams[g.playerTeam].research;
    if (!this.sel || !TECH_BY_ID[this.sel]) this.sel = defaultSelection(r, this.tab, this.stage);
    return researchBody(r, this.tab, g.world, g.playerTeam, this.sel, this.stage);
  }

  private settingsBody(): string {
    const map = MAP_LAYERS.map((l) =>
      `<label class="check"><input type="checkbox" data-set="map" data-k="${l.id}" ${settings.map[l.id] ? 'checked' : ''}> ${l.name}${l.desc ? ` <span class="muted small">— ${l.desc}</span>` : ''}</label>`).join('');
    const info = INFO_FIELDS.map((f) =>
      `<label class="check"><input type="checkbox" data-set="info" data-k="${f.id}" ${settings.info[f.id] ? 'checked' : ''}> ${f.name}</label>`).join('');
    const log = LOG_CATEGORIES.map((c) =>
      `<label class="check"><input type="checkbox" data-set="log" data-k="${c.id}" ${settings.log[c.id] ? 'checked' : ''}> ${c.name}</label>`).join('');
    const snd = SOUND_LEVELS.map((l) => `<div class="snd-row" ${l.desc ? `title="${l.desc}"` : ''}>
        <span>${l.name}</span>
        <input type="range" min="0" max="1" step="0.05" value="${settings.sound[l.id]}" data-set="sound" data-k="${l.id}">
        <b>${Math.round(settings.sound[l.id] * 100)}</b>
      </div>`).join('');
    return `
      <div class="set-grid">
        <div><h3>Ses</h3>
          <label class="check"><input type="checkbox" data-set="muted" ${settings.sound.muted ? 'checked' : ''}> Sessiz <span class="muted small">— N tuşu ya da üst çubuktaki hoparlör</span></label>
          ${snd}
          <p class="muted small">Savaş sesleri kamera yaklaştıkça duyulur; uyarılar her zaman. Telefonda sessiz düğmesi açıksa ses gelmeyebilir. Seslerin hepsi gerçek kayıt; künyesi Haberler → “Sesler geldi”de.</p>
        </div>
        <div><h3>Harita</h3>${map}
          <div class="form-row"><span>Radar kapsama yüksekliği</span><select data-set="radarAgl">${[100, 200, 300, 600, 1500, 3000].map((v) =>
            `<option value="${v}" ${v === settings.radarAgl ? 'selected' : ''}>${v} m</option>`).join('')}</select></div>
          <div class="form-row"><span>Mermi izi kalınlığı</span><input type="range" min="0.4" max="2.5" step="0.1" value="${settings.tracerScale}" data-set="tracerScale"></div>
        </div>
        <div><h3>Bilgi paneli</h3>${info}</div>
        <div><h3>Olay günlüğü</h3>${log}</div>
      </div>`;
  }

  private onClick(e: Event): void {
    if (e.target === this.el) {
      this.close();
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    const g = this.game;
    switch (b.dataset.act) {
      case 'rtab':
        this.tab = b.dataset.tab as ResearchTab;
        this.sel = null;
        this.render();
        return;
      case 'rstage': {
        this.stage = Number(b.dataset.v) as ResearchStage;
        this.sel = null;
        const mb = this.el.querySelector('.rb-main');
        if (mb) mb.scrollTop = 0;
        this.render();
        const mb2 = this.el.querySelector('.rb-main');
        if (mb2) mb2.scrollTop = 0;
        const tl = this.el.querySelector('.tl-scroll');
        if (tl) tl.scrollLeft = 0;
        return;
      }
      case 'rsel': {
        const t = TECH_BY_ID[b.dataset.id!];
        if (!t) return;
        this.sel = t.id;
        // Başka aşamadaki düğüm seçildiyse o aşamaya geç (önceki aşamadan gösterilen öncüller hariç)
        if ((t.kind === 'aircraft' || t.kind === 'mod') && !b.closest('.prevstage')) this.stage = stageOf(t);
        // Önkoşul başka sekmedeyse oraya geç
        const tab: ResearchTab = t.kind === 'aircraft' ? 'arac' : t.kind === 'mod' ? 'mod' : t.kind === 'aa' ? 'hd' : 'radar';
        if (tab !== this.tab) this.tab = tab;
        this.render();
        return;
      }
      case 'spec-info':
        g.hangar.open(b.dataset.spec);
        return;
      case 'close':
        this.close();
        return;
      case 'scenario':
        g.loadScenario(b.dataset.id!);
        this.close();
        return;
      case 'mbuy': {
        const w = g.world;
        const base = w.airbaseById(this.marketBase ?? -1) ?? w.airbasesOf(g.playerTeam).find((x) => x.s.active);
        if (!base) return;
        this.marketBase = base.s.id;
        const err = w.buyOffer(g.playerTeam, Number(b.dataset.id), base, 1);
        this.marketMsg = err ?? '';
        this.render();
        return;
      }
      case 'msell': {
        const w = g.world;
        const base = w.airbaseById(this.marketBase ?? -1) ?? w.airbasesOf(g.playerTeam).find((x) => x.s.active);
        const af = base ? sellCandidate(base, b.dataset.spec!) : null;
        if (base && af) w.sellAirframe(base, af);
        this.marketMsg = '';
        this.render();
        return;
      }
      case 'tech': {
        const r = g.world.teams[g.playerTeam].research;
        const id = b.dataset.id!;
        if (r.isQueued(id) || r.isActive(id)) r.cancel(id);
        else r.enqueue(id);
        this.render();
        return;
      }
    }
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (el.dataset.mk === 'base') {
      this.marketBase = Number(el.value);
      this.render();
      return;
    }
    const set = el.dataset.set;
    if (!set) return;
    const k = el.dataset.k as string;
    if (set === 'map') settings.map[k as keyof typeof settings.map] = (el as HTMLInputElement).checked;
    else if (set === 'info') settings.info[k as keyof typeof settings.info] = (el as HTMLInputElement).checked;
    else if (set === 'log') settings.log[k as keyof typeof settings.log] = (el as HTMLInputElement).checked;
    else if (set === 'radarAgl') settings.radarAgl = Number(el.value);
    else if (set === 'tracerScale') settings.tracerScale = Number(el.value);
    else if (set === 'muted') settings.sound.muted = (el as HTMLInputElement).checked;
    else if (set === 'sound') {
      const id = k as SoundLevel;
      settings.sound[id] = Number(el.value);
      saveSettings();
      // Örnek: arayüzde tıklama, savaşta uzak flak patlaması (oyun duraklatılmışsa duyulmaz), diğerlerinde daktilo zili
      if (id === 'ui') sound.play('tap', 'ui');
      else if (id === 'world') sound.play('flak', 'world', { gain: 0.5, lowpass: 3000 });
      else sound.play('typewriter', 'alerts');
      return;
    }
    saveSettings();
  }
}
