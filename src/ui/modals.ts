// Pencereler: senaryolar, araştırma ağacı, hazine ve pazar, ayarlar (ses, görünüm).

import type { Game } from '../game';
import {
  INFO_FIELDS, LOG_CATEGORIES, MAP_LAYERS, QUALITY, RESOLUTIONS, SOUND_LEVELS, onSettingsChange, saveSettings, settings,
  type GraphicsQuality, type Resolution, type SoundLevel,
} from './settings';
import { sound } from '../audio/sound';
import { defaultSelection, researchBody, stageOf, type ResearchStage, type ResearchTab } from './research';
import { TECH_BY_ID } from '../sim/tech';
import type { AAWeaponId } from '../sim/structures/airDefense';
import { marketBody, sellCandidate } from './market';
import { type FactoryTab, changeQty, factoryBody, patchCells, pitBody, qtyOf } from './production';
import { $, esc } from './dom';
import { L } from '../i18n';
import { thanksBody, thanksTitle } from './thanks';

export type ModalKind = 'research' | 'settings' | 'market' | 'factory' | 'pit' | 'thanks';

export class Modals {
  isOpen = false;
  private kind: ModalKind | null = null;
  /** Açık pencerenin türü (öğretici bekler). */
  get openKind(): ModalKind | null {
    return this.isOpen ? this.kind : null;
  }
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
  /** Üretim menüsünün fabrikası ve sekmesi. */
  private factoryId: number | null = null;
  private factoryTab: FactoryTab = 'ucak';
  /** Yuva penceresi: batarya ve yuva. */
  private pit: { id: number; slot: number } | null = null;
  /** Teşekkür penceresi: ad ve toplam süre. */
  private thanks = { name: '', sec: 0 };

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

  /** Üretim menüsü: bu fabrikanın (yoksa takımın ilk fabrikasının) listesi. */
  openFactory(id: number | null, tab: FactoryTab = this.factoryTab): void {
    const g = this.game;
    const own = g.world.structures.filter((x) => x.team === g.playerTeam && x.factory && !x.destroyed);
    this.factoryId = own.find((x) => x.id === id)?.id ?? own[0]?.id ?? null;
    this.factoryTab = tab;
    if (this.factoryId === null) {
      g.toast(L('Önce bir fabrika kur: İnşa menüsünden ya da hava üssünün panelinden.', 'Build a factory first: from the Build menu or the airbase panel.'), true);
      return;
    }
    this.kind = 'factory';
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  /** Üst çubuk ve U tuşu: açıksa kapat, yoksa takımın fabrikası. */
  toggleFactory(): void {
    if (this.isOpen && this.kind === 'factory') this.close();
    else this.openFactory(this.factoryId);
  }

  /** Teşekkür penceresi (6 saat). */
  openThanks(name: string, sec: number): void {
    this.thanks = { name, sec };
    this.kind = 'thanks';
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  /** Bataryanın yuvası için top seçimi. */
  openPit(id: number, slot: number): void {
    this.pit = { id, slot };
    this.kind = 'pit';
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  private factoryHtml(): string {
    const s = this.game.world.structures.find((x) => x.id === this.factoryId);
    return s?.factory ? factoryBody(this.game, s, this.factoryTab) : `<p class="muted">${L('Fabrika kalmadı.', 'No factory left.')}</p>`;
  }

  private pitHtml(): string {
    const s = this.pit ? this.game.world.structures.find((x) => x.id === this.pit!.id) : undefined;
    return s?.aa && !s.destroyed ? pitBody(this.game, s, this.pit!.slot) : `<p class="muted">${L('Batarya kalmadı.', 'The battery is gone.')}</p>`;
  }

  close(): void {
    this.isOpen = false;
    this.kind = null;
    this.el.classList.add('hidden');
  }

  update(): void {
    if (!this.isOpen) return;
    if (this.kind === 'factory' || this.kind === 'pit') {
      // Yalnız değişen hücreler: düğme basılırken yenilenmesin
      const t = performance.now();
      if (t < this.next) return;
      this.next = t + 400;
      const body = this.el.querySelector<HTMLElement>('.modal-body');
      if (!body || !patchCells(body, this.kind === 'factory' ? this.factoryHtml() : this.pitHtml())) this.render();
      return;
    }
    if (this.kind !== 'research' && this.kind !== 'market') return;
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
    if (this.kind === 'thanks') {
      title = thanksTitle(this.thanks.name);
      body = thanksBody(this.thanks.sec);
    } else if (this.kind === 'research') {
      title = L('Araştırma', 'Research');
      body = this.research();
    } else if (this.kind === 'settings') {
      title = L('Ayarlar', 'Settings');
      body = this.settingsBody();
    } else if (this.kind === 'factory') {
      title = L('Üretim', 'Production');
      body = this.factoryHtml();
    } else if (this.kind === 'pit') {
      const s = this.game.world.structures.find((x) => x.id === this.pit?.id);
      title = L(`Silah yuvası ${(this.pit?.slot ?? 0) + 1}`, `Gun pit ${(this.pit?.slot ?? 0) + 1}`) + (s ? ` · ${s.name}` : '');
      body = this.pitHtml();
    } else if (this.kind === 'market') {
      title = L('Hazine ve pazar', 'Treasury and market');
      body = (this.marketMsg ? `<div class="mk-msg">${esc(this.marketMsg)}</div>` : '') + marketBody(this.game.world, this.game.playerTeam, this.marketBase);
    }
    this.el.innerHTML = `
      <div class="modal-card ${this.kind}${this.kind === 'factory' || this.kind === 'pit' || this.kind === 'research' || this.kind === 'thanks' ? ' steel' : ''}">
        <div class="modal-head"><h2>${title}</h2><button class="close" data-act="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
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
        <div><h3>${L('Ses', 'Sound')}</h3>
          <label class="check"><input type="checkbox" data-set="muted" ${settings.sound.muted ? 'checked' : ''}> ${L('Sessiz', 'Mute')} <span class="muted small">— ${L('N tuşu ya da üst çubuktaki hoparlör', 'N key or the speaker in the top bar')}</span></label>
          ${snd}
          <p class="muted small">${L(
            'Savaş sesleri kamera yaklaştıkça duyulur; uyarılar her zaman. Telefonda sessiz düğmesi açıksa ses gelmeyebilir. Seslerin hepsi gerçek kayıt; künyesi Haberler → “Sesler geldi”de.',
            'Battle sounds are heard as the camera gets closer; alerts always. On a phone with the silent switch on, you may hear nothing. Every sound is a real recording; credits are in News → “Sounds are here”.',
          )}</p>
          <h3>${L('Grafik', 'Graphics')}</h3>
          <div class="form-row"><span>${L('Kalite', 'Quality')}</span><select data-set="quality">${(Object.keys(QUALITY) as GraphicsQuality[]).map((q) =>
            `<option value="${q}" ${q === settings.graphics.quality ? 'selected' : ''}>${QUALITY[q].name}</option>`).join('')}</select></div>
          <div class="form-row"><span>${L('Çözünürlük', 'Resolution')}</span><select data-set="resolution">${RESOLUTIONS.map((r) =>
            `<option value="${r.id}" ${r.id === settings.graphics.resolution ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div>
          <label class="check"><input type="checkbox" data-set="dayCycle" ${settings.graphics.dayCycle ? 'checked' : ''}> ${L('Gün döngüsü', 'Day cycle')} <span class="muted small">— ${L('oyunda 48 dakikada bir gün; kapalıyken hep gündüz', 'one day every 48 minutes in game; always daytime when off')}</span></label>
          <label class="check"><input type="checkbox" data-set="clouds" ${settings.graphics.clouds ? 'checked' : ''}> ${L('Bulutlar', 'Clouds')} <span class="muted small">— ${L('düşük kalitede yok; uzaktan bakınca söner', 'none on low quality; they fade when zoomed out')}</span></label>
          <p class="muted small">${L(
            'Telefon ısınır ya da takılırsa kaliteyi düşür. Düşük: sade uçaklar, bulut yok. Orta: ayrıntılı uçaklar, az bulut. Yüksek: ayrıca yakın arazi ayrıntısı, tam bulut, daha uzaktaki ağaç ve köyler. Otomatik çözünürlük kare hızı düşünce görüntüyü biraz yumuşatır.',
            'If your phone gets hot or stutters, lower the quality. Low: simple aircraft, no clouds. Medium: detailed aircraft, a few clouds. High: also close-up ground detail, full clouds, trees and villages farther out. Auto resolution softens the image slightly when the frame rate drops.',
          )}</p>
        </div>
        <div><h3>${L('Oyun', 'Game')}</h3>
          <label class="check"><input type="checkbox" data-set="autoFast" ${settings.game.autoFast ? 'checked' : ''}> ${L('Boş yolda otomatik 2×', 'Automatic 2× on the open road')} <span class="muted small">— ${L(
            '1× seçiliyken kolların yalnız yoldaysa; çatışma, görev, kalkış ve inişte 1×',
            'while 1× is selected and your flights are only travelling; 1× in combat, missions, takeoff and landing',
          )}</span></label>
          <h3>${L('Harita', 'Map')}</h3>${map}
          <div class="form-row"><span>${L('Radar kapsama yüksekliği', 'Radar coverage height')}</span><select data-set="radarAgl">${[100, 200, 300, 600, 1500, 3000].map((v) =>
            `<option value="${v}" ${v === settings.radarAgl ? 'selected' : ''}>${v} m</option>`).join('')}</select></div>
          <div class="form-row"><span>${L('Mermi izi kalınlığı', 'Tracer thickness')}</span><input type="range" min="0.4" max="2.5" step="0.1" value="${settings.tracerScale}" data-set="tracerScale"></div>
        </div>
        <div><h3>${L('Bilgi paneli', 'Info panel')}</h3>${info}</div>
        <div><h3>${L('Olay günlüğü', 'Event log')}</h3>${log}</div>
      </div>`;
  }

  private onClick(e: Event): void {
    if (e.target === this.el) {
      // Teşekkür penceresi bir kez gösterilir: oyuncunun haritaya devam eden dokunuşu okumadan kapatmasın, yalnız düğmeyle kapanır
      if (this.kind !== 'thanks') this.close();
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
        const tab: ResearchTab = t.kind === 'aircraft' ? 'arac' : t.kind === 'mod' ? 'mod' : 'hd';
        if (tab !== this.tab) this.tab = tab;
        this.render();
        return;
      }
      case 'spec-info':
        g.hangar.open(b.dataset.spec);
        return;
      case 'aa-info':
        g.hangar.openGun(b.dataset.w as AAWeaponId);
        return;
      case 'fab-qty':
        changeQty(b.dataset.id!, Number(b.dataset.d));
        this.next = 0;
        this.update();
        return;
      case 'fab-tab':
        this.factoryTab = b.dataset.v as FactoryTab;
        this.render();
        return;
      case 'fab-pick':
        this.factoryId = Number(b.dataset.id);
        this.render();
        return;
      case 'fab-add':
      case 'fab-del':
      case 'fab-add-gun':
      case 'fab-del-gun': {
        const s = g.world.structures.find((x) => x.id === this.factoryId);
        if (!s?.factory) return;
        const act = b.dataset.act;
        // Toplu üretim: seçili adet kadar sipariş; düğme yetmediğinde zaten kapalı
        if (act === 'fab-add') for (let i = qtyOf(b.dataset.id!); i > 0 && g.world.orderAircraft(s, b.dataset.id!); i--);
        else if (act === 'fab-add-gun') for (let i = qtyOf(b.dataset.id!); i > 0 && g.world.orderGun(s, b.dataset.id as AAWeaponId); i--);
        else if (act === 'fab-del-gun') g.world.cancelGun(s, b.dataset.id as AAWeaponId);
        else {
          for (let i = s.factory.queue.length - 1; i >= 0; i--) {
            if (s.factory.queue[i].specId !== b.dataset.id) continue;
            g.world.cancelOrder(s, i);
            break;
          }
        }
        this.next = 0;
        this.update();
        return;
      }
      case 'fab-res': {
        // Kilitli satır: araştırma panosunda o düğüm
        const t = TECH_BY_ID[b.dataset.id ?? ''];
        this.kind = 'research';
        this.tab = t?.kind === 'aircraft' ? 'arac' : 'hd';
        this.sel = t?.id ?? null;
        if (t?.kind === 'aircraft') this.stage = stageOf(t);
        this.render();
        return;
      }
      case 'fab-open-hd':
        this.kind = 'research';
        this.tab = 'hd';
        this.sel = null;
        this.render();
        return;
      case 'pit-fab':
        this.openFactory(null, 'top');
        return;
      case 'pit-put': {
        const s = g.world.structures.find((x) => x.id === this.pit?.id);
        if (s && this.pit && g.world.installGun(s, this.pit.slot, b.dataset.id as AAWeaponId)) this.close();
        return;
      }
      case 'close':
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
    const rep = e.target as HTMLInputElement;
    if (rep.dataset.act === 'fab-repeat') {
      const fac = this.game.world.structures.find((x) => x.id === this.factoryId);
      if (fac?.factory) fac.factory.repeat = rep.checked;
      return;
    }
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
    else if (set === 'quality') settings.graphics.quality = el.value as GraphicsQuality;
    else if (set === 'resolution') settings.graphics.resolution = el.value as Resolution;
    else if (set === 'dayCycle') settings.graphics.dayCycle = (el as HTMLInputElement).checked;
    else if (set === 'clouds') settings.graphics.clouds = (el as HTMLInputElement).checked;
    else if (set === 'autoFast') settings.game.autoFast = (el as HTMLInputElement).checked;
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
