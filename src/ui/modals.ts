// Pencereler: senaryolar, araştırma ağacı, hazine (pazar kapalı; MARKET_ON), ayarlar (ses, görünüm).

import type { Game } from '../game';
import { onSettingsChange, saveSettings, settings, type SoundLevel } from './settings';
import { applySetting, settingsBody, type SettingsTab } from './settingsMenu';
import type { PerfHint } from '../perfWatch';
import { sound } from '../audio/sound';
import { defaultSelection, researchBody, stageOf, type ResearchStage, type ResearchTab } from './research';
import { TECH_BY_ID } from '../sim/tech';
import type { AAWeaponId } from '../sim/structures/airDefense';
import { townBody, townTitle } from './town';
import { marketBody, marketTitle, sellCandidate } from './market';
import { type FactoryTab, changeQty, factoryBody, patchCells, pitBody, qtyOf } from './production';
import { $, esc } from './dom';
import { L } from '../i18n';
import { thanksBody, thanksTitle } from './thanks';

export type ModalKind = 'research' | 'settings' | 'market' | 'town' | 'factory' | 'pit' | 'thanks' | 'notice';

/** Bildirim penceresinin düğmesi: tıklanınca pencere kapanır, sonra run çalışır. */
export interface NoticeButton {
  label: string;
  primary?: boolean;
  run: () => void;
}

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
  /** Hazine penceresinde açık olan maden (yoksa genel hazine). */
  private treasuryMine: number | null = null;
  /** Üretim menüsünün fabrikası ve sekmesi. */
  private factoryId: number | null = null;
  private factoryTab: FactoryTab = 'ucak';
  /** Yuva penceresi: batarya ve yuva. */
  private pit: { id: number; slot: number } | null = null;
  /** Teşekkür penceresi: ad ve toplam süre. */
  private thanks = { name: '', sec: 0 };
  /** Bildirim penceresi (kayıt yeri uyarıları gibi): başlık, gövde (HTML), düğmeler. */
  private notice: { title: string; body: string; buttons: NoticeButton[] } = { title: '', body: '', buttons: [] };
  /** Ayarlarda açık sekme (oturum boyunca kalır). */
  private settingsTab: SettingsTab = 'grafik';
  /** Takılma önerisiyle açıldıysa işaretlenecek seçenek (pencere kapanınca kalkar). */
  private settingsHint: PerfHint | null = null;

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
      const out = el.nextElementSibling;
      if (el.dataset.set === 'tracerScale' && out) out.textContent = `${Number(el.value).toFixed(1)}×`;
      if (el.dataset.set !== 'sound') return;
      sound.setLevel(el.dataset.k as SoundLevel, Number(el.value));
      if (out) out.textContent = String(Math.round(Number(el.value) * 100));
    });
    this.el.addEventListener('scroll', () => (this.lastScroll = performance.now()), true);
  }

  open(kind: ModalKind, tab?: ResearchTab): void {
    if (this.isOpen && this.kind === kind && !tab) {
      this.close();
      return;
    }
    if (kind === 'market') this.treasuryMine = null;
    if (kind === 'settings') this.settingsHint = null;
    if (tab && tab !== this.tab) {
      this.tab = tab;
      this.sel = null;
    }
    this.kind = kind;
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  /** Hazine: genel (mineId null) ya da tek bir madenin hazinesi. Açıksa kapatmaz, görünümü değiştirir. */
  openTreasury(mineId: number | null): void {
    this.treasuryMine = mineId;
    this.kind = 'market';
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
    if (this.isOpen && this.kind === 'factory') {
      this.close();
      return;
    }
    // Seçili fabrika ya da seçili üssün fabrikası önce (eskiden hep son açılan, ilk açılışta ana üssünkü)
    const w = this.game.world;
    const sel = this.game.selectedStructure;
    let id = this.factoryId;
    if (sel?.factory) id = sel.id;
    else if (sel?.airbase) id = w.structures.find((x) => x.attachedTo === sel.id && x.factory && !x.destroyed)?.id ?? id;
    this.openFactory(id);
  }

  /** Ayarlar belirli sekmede; hint: takılma önerisinde işaretlenecek seçenek. Açıksa kapatmaz. */
  openSettings(tab: SettingsTab, hint: PerfHint | null = null): void {
    this.settingsTab = tab;
    this.settingsHint = hint;
    this.kind = 'settings';
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  /** Teşekkür penceresi (6 saat). */
  openThanks(name: string, sec: number): void {
    this.thanks = { name, sec };
    this.kind = 'thanks';
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render();
  }

  /** Bildirim penceresi: çelik görünüm, düğmeler altta (ilki asıl eylem). Dışarı dokunmak ya da ✕ yalnız kapatır. */
  openNotice(title: string, body: string, buttons: NoticeButton[]): void {
    this.notice = { title, body, buttons };
    this.kind = 'notice';
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
    this.settingsHint = null;
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
    if (this.kind !== 'research' && this.kind !== 'market' && this.kind !== 'town') return;
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
    const stTop = this.el.querySelector('.st-list')?.scrollTop ?? 0;
    let body = '';
    let title = '';
    if (this.kind === 'thanks') {
      title = thanksTitle(this.thanks.name);
      body = thanksBody(this.thanks.sec);
    } else if (this.kind === 'notice') {
      title = this.notice.title;
      body = `<div class="notice-body">${this.notice.body}</div><div class="btn-row">${this.notice.buttons.map((b, i) =>
        `<button class="${b.primary ? 'primary' : ''}" data-act="nb" data-i="${i}">${b.label}</button>`).join('')}</div>`;
    } else if (this.kind === 'research') {
      title = L('Araştırma', 'Research');
      body = this.research();
    } else if (this.kind === 'settings') {
      title = L('Ayarlar', 'Settings');
      body = settingsBody(this.settingsTab, this.settingsHint);
    } else if (this.kind === 'factory') {
      title = L('Üretim', 'Production');
      body = this.factoryHtml();
    } else if (this.kind === 'pit') {
      const s = this.game.world.structures.find((x) => x.id === this.pit?.id);
      title = L(`Silah yuvası ${(this.pit?.slot ?? 0) + 1}`, `Gun pit ${(this.pit?.slot ?? 0) + 1}`) + (s ? ` · ${s.name}` : '');
      body = this.pitHtml();
    } else if (this.kind === 'town') {
      title = townTitle(this.game.world, this.game.playerTeam);
      body = townBody(this.game.world, this.game.playerTeam);
    } else if (this.kind === 'market') {
      title = marketTitle(this.game.world, this.game.playerTeam, this.treasuryMine);
      body = (this.marketMsg ? `<div class="mk-msg">${esc(this.marketMsg)}</div>` : '') + marketBody(this.game.world, this.game.playerTeam, this.marketBase, this.treasuryMine);
    }
    // Bildirim ana menünün ve hesap penceresinin de üstünde açılır
    this.el.classList.toggle('over', this.kind === 'notice');
    this.el.innerHTML = `
      <div class="modal-card ${this.kind}${this.kind === 'factory' || this.kind === 'pit' || this.kind === 'research' || this.kind === 'thanks' || this.kind === 'notice' || this.kind === 'settings' ? ' steel' : ''}${this.kind === 'town' || this.kind === 'market' ? ' civic' : ''}">
        <div class="modal-head"><h2>${title}</h2><button class="close" data-act="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
        <div class="modal-body">${body}</div>
      </div>`;
    const mb = this.el.querySelector('.modal-body');
    if (mb) mb.scrollTop = scroll;
    const st = this.el.querySelector('.st-list');
    if (st) st.scrollTop = stTop;
    const tl = this.el.querySelector('.tl-scroll');
    if (tl && tlLeft !== null) tl.scrollLeft = tlLeft;
    const dos = this.el.querySelector('.rb-dos');
    if (dos) dos.scrollTop = dosTop;
    const mainEl = this.el.querySelector('.rb-main');
    if (mainEl) {
      mainEl.scrollTop = mainTop;
      mainEl.scrollLeft = mainLeft;
    }
    // Üretim: fabrika ve teslim üssü sekmeleri yana kayar; seçili olan görünür kalsın
    for (const row of this.el.querySelectorAll<HTMLElement>('.prd-pick')) {
      const a = row.querySelector<HTMLElement>('button.active');
      if (!a) continue;
      const r = row.getBoundingClientRect();
      const b = a.getBoundingClientRect();
      if (b.right > r.right) row.scrollLeft += b.right - r.right;
      else if (b.left < r.left) row.scrollLeft -= r.left - b.left;
    }
  }

  private research(): string {
    const g = this.game;
    const r = g.world.teams[g.playerTeam].research;
    if (!this.sel || !TECH_BY_ID[this.sel]) this.sel = defaultSelection(r, this.tab, this.stage);
    return researchBody(r, this.tab, g.world, g.playerTeam, this.sel, this.stage);
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
      case 'stab':
        this.settingsTab = b.dataset.tab as SettingsTab;
        this.el.querySelector('.st-list')?.scrollTo(0, 0);
        this.render();
        return;
      case 'sset':
        applySetting(b.dataset.set!, b.dataset.k, b.dataset.v!);
        saveSettings();
        this.render();
        return;
      case 'nb': {
        const btn = this.notice.buttons[Number(b.dataset.i)];
        this.close();
        btn?.run();
        return;
      }
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
      case 'fab-dest': {
        const fac = g.world.structures.find((x) => x.id === this.factoryId);
        const base = g.world.airbaseById(Number(b.dataset.id));
        if (fac?.factory && base) {
          fac.factory.deliverTo = base.s.id;
          g.toast(L(`${fac.name}: uçaklar ${base.s.name} hangarına gidecek`, `${fac.name}: aircraft will go to the ${base.s.name} hangar`));
        }
        this.render();
        return;
      }
      case 'fab-add':
      case 'fab-del':
      case 'fab-add-gun':
      case 'fab-del-gun': {
        const s = g.world.structures.find((x) => x.id === this.factoryId);
        if (!s?.factory) return;
        // Kapalı görünen üret düğmesi: nedeni söyle (para, bant yeri ya da bakım personeli)
        if (b.dataset.why) {
          g.toast(b.dataset.why, true);
          return;
        }
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
      case 'town-treasury':
        this.openTreasury(null);
        break;
      case 'mk-all':
        this.openTreasury(null);
        break;
      case 'mk-mine': {
        // Listedeki madene dokunuş: kamera o madene gider, pencere o madenin hazinesine döner
        const st = this.game.world.structureById(Number(b.dataset.id));
        if (st) {
          this.game.focusStructure(st);
          this.openTreasury(st.id);
        }
        break;
      }
      case 'mk-build':
        this.close();
        this.game.build.open('economy');
        break;
      case 'town-build':
        this.close();
        this.game.build.open('city');
        break;
      case 'town-research':
        this.open('research', 'arac');
        break;
      case 'town-factory':
        this.openFactory(this.factoryId);
        break;
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
    const k = el.dataset.k;
    const box = el instanceof HTMLInputElement && el.type === 'checkbox';
    applySetting(set, k, box ? el.checked : el.value);
    if (set === 'sound') {
      const id = k as SoundLevel;
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
