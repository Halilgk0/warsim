// Ana menü: arkada saydam harita (yapay zekâ ülkeleri kendi aralarında oynar), ortada komutan adı, başlat, harita ve
// düşman sayısı; sağ üstte giriş. Giriş yapanlar kayıtlarını buradan açar. Harita seçilince arka plan o haritaya geçer.

import type { Game } from '../game';
import { MAX_ENEMIES } from '../sim/campaign';
import { MAP_BASE, MAP_SIZES, MAP_SIZE_DEFAULT, TEAM_SITES, mapSizeName } from '../sim/mapData';
import { MAPS, mapById } from '../sim/maps';
import { terrainMap } from '../sim/terrain';
import { mapPreview } from './mapPreview';
import { NAME_MAX, cleanName, currentAccount, logout, nameError } from '../persist';
import { SavesPanel } from './savesList';
import { NEWS, newsCard } from './news';
import { enterFullscreen, fullscreenSupported, isFullscreen, toggleFullscreen } from './fullscreen';
import { $, esc } from './dom';
import { LANG, L, lower, saveLang } from '../i18n';
import { playLangSwap } from './langSwap';
import { socialLinks } from './social';

type Tab = 'new' | 'saves';

/** Dil değişirken (sayfa yeniden açılır) menüde yazılanlar kaybolmasın. */
const DRAFT = 'warsim.menuDraft';
interface Draft { name: string; enemies: number; mapId: string; size?: number }

/** Seçilen harita büyüklüğü bu tarayıcıda hatırlanır. */
const SIZE_KEY = 'warsim.mapSize';

function savedSize(): number {
  try {
    const v = Number(localStorage.getItem(SIZE_KEY));
    if ((MAP_SIZES as readonly number[]).includes(v)) return v;
  } catch {
    /* depolama kapalı */
  }
  return MAP_SIZE_DEFAULT;
}

/** Oyuncu üssünden en yakın düşman üssü (km), seçilen büyüklükte. */
function nearestEnemyKm(mapId: string, enemies: number, size: number): number {
  const s = mapById(mapId).sites;
  const k = size / MAP_BASE;
  const d = s.slice(1, enemies + 1).map((o) => Math.hypot(o.x - s[0].x, o.z - s[0].z) * k);
  return Math.round(Math.min(...d) / 5000) * 5;
}

/** Küçük harita: seçili haritanın önizlemesi üstünde tarafların ana üs yerleri (seçilen düşman sayısına göre). */
function siteMap(mapId: string, enemies: number): string {
  const S = 150;
  // Yerler her büyüklükte aynı oranda: taban ölçekte çizilir
  const k = S / MAP_BASE;
  const def = mapById(mapId);
  const dots = def.sites.slice(0, enemies + 1).map((site, i) => {
    const t = TEAM_SITES[i];
    const x = S / 2 + site.x * k;
    const y = S / 2 + site.z * k;
    // Yalnız oyuncu yazılır (düşmanların adları renkli çiplerde)
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 0 ? 7 : 5.5}" fill="${t.color}" stroke="#fff" stroke-width="2"/>
      ${i === 0 ? `<text x="${x.toFixed(1)}" y="${(y + (y > S / 2 ? -11 : 18)).toFixed(1)}" text-anchor="middle">${L('Sen', 'You')}</text>` : ''}</g>`;
  }).join('');
  return `<div class="mm-map"><img src="${mapPreview(def, 150)}" alt=""><svg viewBox="0 0 ${S} ${S}" aria-hidden="true">${dots}</svg></div>`;
}

export class MainMenu {
  isOpen = false;
  private el = $('mainmenu');
  private enemies = 2;
  private mapId = terrainMap.id;
  private size = savedSize();
  private name = '';
  private tab: Tab = 'new';
  private error = '';
  private notice = '';
  readonly saves: SavesPanel;

  constructor(private readonly game: Game) {
    // Oyuna girerken tam ekran (tıklama anında istenmeli)
    this.saves = new SavesPanel((id) => {
      enterFullscreen();
      void this.game.loadSave(id);
    }, () => this.render());
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'cmd') {
        this.name = t.value;
        if (this.error) {
          this.error = '';
          this.el.querySelector('.mm-err')?.remove();
        }
      }
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).matches('input[name="cmd"]')) this.start();
    });
  }

  open(notice = ''): void {
    this.isOpen = true;
    // Arka plandaki harita (son oynanan) seçili gelsin
    this.mapId = terrainMap.id;
    this.notice = notice;
    this.restoreDraft();
    this.el.classList.remove('hidden');
    const acc = currentAccount();
    if (!this.name && acc) this.name = acc.name;
    if (!acc) this.tab = 'new';
    this.render();
    void this.saves.refresh(acc?.key ?? null);
    this.el.querySelector<HTMLInputElement>('input[name="cmd"]')?.focus();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  /** Dil değişiminden önce yazılan ad, düşman sayısı ve harita (bir kez okunur). */
  private restoreDraft(): void {
    try {
      const raw = sessionStorage.getItem(DRAFT);
      if (!raw) return;
      sessionStorage.removeItem(DRAFT);
      const d = JSON.parse(raw) as Draft;
      this.name = d.name || this.name;
      if (d.enemies >= 1 && d.enemies <= MAX_ENEMIES) this.enemies = d.enemies;
      if (d.size && (MAP_SIZES as readonly number[]).includes(d.size)) this.size = d.size;
      if (MAPS.some((m) => m.id === d.mapId) && d.mapId !== this.mapId) {
        this.mapId = d.mapId;
        this.game.previewMap(this.mapId, this.size);
      }
    } catch {
      /* bozuk taslak: yok say */
    }
  }

  /** Dil düğmesi: koyu yarı öbür yana kayar, eğlenceli geçiş ekranı, sonra sayfa yeni dille açılır. */
  private switchLang(btn: HTMLElement): void {
    const next = LANG === 'tr' ? 'en' : 'tr';
    btn.classList.remove('tr', 'en');
    btn.classList.add(next);
    btn.setAttribute('disabled', '');
    saveLang(next);
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify({ name: this.name, enemies: this.enemies, mapId: this.mapId, size: this.size } satisfies Draft));
    } catch {
      /* taslak kaydedilemezse yalnız dil değişir */
    }
    playLangSwap(next, () => location.reload());
  }

  /** "Oyuna başla": ad geçerliyse öğretici sorulur (sorulmayacaksa oyun hemen başlar). */
  private start(): void {
    if (this.game.tutorial.busy || !this.validName()) return;
    if (!this.game.tutorial.ask()) this.launch();
  }

  private validName(): boolean {
    const err = nameError(this.name);
    if (!err) return true;
    this.error = `${L('Komutan adı', 'Commander name')}: ${lower(err)}`;
    this.render();
    this.el.querySelector<HTMLInputElement>('input[name="cmd"]')?.focus();
    return false;
  }

  /** Harekâtı başlat (öğretici penceresi ya da ana menü bölümü bitince). Ad geçersizse false. */
  launch(): boolean {
    if (!this.validName()) return false;
    enterFullscreen();
    this.game.newCampaign(cleanName(this.name), this.enemies, this.mapId, this.size);
    return true;
  }

  private onClick(e: Event): void {
    const t = e.target as HTMLElement;
    const acc = currentAccount();
    if (this.saves.handle(t, acc?.key ?? null)) return;
    const b = t.closest<HTMLElement>('[data-mm]');
    if (!b) return;
    switch (b.dataset.mm) {
      case 'start':
        this.start();
        return;
      case 'enemies':
        this.enemies = Number(b.dataset.v);
        this.render();
        return;
      case 'map':
        if (b.dataset.v === this.mapId) return;
        this.mapId = b.dataset.v!;
        this.render();
        // Arka plan da seçilen haritaya geçer
        this.game.previewMap(this.mapId, this.size);
        return;
      case 'size':
        // Arka plan yeniden üretilmez (birkaç saniye sürer); harita oyun başlarken bu büyüklükte kurulur
        this.size = Number(b.dataset.v);
        try {
          localStorage.setItem(SIZE_KEY, String(this.size));
        } catch {
          /* yalnız bu oturum */
        }
        this.render();
        return;
      case 'tab':
        this.tab = b.dataset.v as Tab;
        this.render();
        if (this.tab === 'saves') void this.saves.refresh(acc?.key ?? null);
        return;
      case 'login':
        this.game.login.open((a, created) => {
          if (!cleanName(this.name)) this.name = a.name;
          this.notice = created
            ? L(`Hesap oluşturuldu: ${a.name}. Kayıtların bu adla saklanır.`, `Account created: ${a.name}. Your saves are kept under this name.`)
            : L(`Tekrar hoş geldin, ${a.name}.`, `Welcome back, ${a.name}.`);
          this.render();
          void this.saves.refresh(a.key);
        });
        return;
      case 'news':
        this.game.news.open();
        return;
      case 'feedback':
        this.game.feedback.open(cleanName(this.name) || currentAccount()?.name || '');
        return;
      case 'fullscreen':
        toggleFullscreen();
        return;
      case 'lang':
        this.switchLang(b);
        return;
      case 'logout':
        logout();
        this.tab = 'new';
        this.notice = L('Çıkış yapıldı. Misafir oyunlar kaydedilmez.', 'Logged out. Guest games are not saved.');
        this.saves.list = [];
        this.render();
        return;
    }
  }

  render(): void {
    if (!this.isOpen) return;
    const acc = currentAccount();
    const fs = fullscreenSupported()
      ? `<button class="mm-login" data-mm="fullscreen" title="${L('Tam ekran', 'Fullscreen')}">${isFullscreen() ? L('Tam ekrandan çık', 'Exit fullscreen') : `⛶ ${L('Tam ekran', 'Fullscreen')}`}</button>`
      : '';
    // Dil: iki yarım (EN | TR), seçili dilin yarısı koyu; üst çubuktaki düğmelerin en solunda
    const lang = `<button class="mm-login mm-lang ${LANG}" data-mm="lang" title="${L('Dil: Türkçe (İngilizceye geç)', 'Language: English (switch to Turkish)')}"
      aria-label="${L('Dili değiştir', 'Change language')}"><span class="en">EN</span><span class="tr">TR</span></button>`;
    // Dar ekranda haber kutusu ve sağdaki geri bildirim düğmesi yerine üst çubukta düğme
    const newsBtn = `${lang}<button class="mm-login mm-news-btn" data-mm="news">${L('Haberler', 'News')}</button><button class="mm-login mm-fb-btn" data-mm="feedback">${L('Geri bildirim', 'Feedback')}</button>`;
    const top = acc
      ? `<div class="mm-acc">${newsBtn}${fs}<span class="mm-user" title="${esc(acc.name)}"><i></i><b>${esc(acc.name)}</b></span><button class="mini" data-mm="logout">${L('Çıkış yap', 'Log out')}</button></div>`
      : `<div class="mm-acc">${newsBtn}${fs}<button class="mm-login" data-mm="login">${L('Giriş yap', 'Log in')}</button></div>`;
    const foes = TEAM_SITES.slice(1, this.enemies + 1)
      .map((t) => `<span class="mm-foe"><i style="background:${t.color}"></i>${t.name}</span>`).join('');
    const maps = MAPS.map((m) => `<button class="mm-mapcard ${m.id === this.mapId ? 'active' : ''}" data-mm="map" data-v="${m.id}" title="${esc(m.desc)}">
        <img src="${mapPreview(m, 96)}" alt=""><span><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></span></button>`).join('');
    const enemyBtns = Array.from({ length: MAX_ENEMIES }, (_, i) => i + 1)
      .map((n) => `<button class="${n === this.enemies ? 'active' : ''}" data-mm="enemies" data-v="${n}">${n}</button>`).join('');
    const tabs = acc
      ? `<div class="mm-tabs"><button class="${this.tab === 'new' ? 'active' : ''}" data-mm="tab" data-v="new">${L('Yeni harekât', 'New campaign')}</button>
          <button class="${this.tab === 'saves' ? 'active' : ''}" data-mm="tab" data-v="saves">${L('Kayıtlar', 'Saves')}${this.saves.list.length ? ` <span class="cnt">${this.saves.list.length}</span>` : ''}</button></div>`
      : '';
    const body = this.tab === 'saves' && acc
      ? `<div class="mm-saves">${this.saves.html()}</div>`
      : `<div class="mm-body">
        <div class="mm-s-name">
        <label class="mm-label" for="mm-cmd">${L('Komutan adı', 'Commander name')}</label>
        <div class="mm-row">
          <input id="mm-cmd" name="cmd" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="${L('Adını yaz', 'Enter your name')}" value="${esc(this.name)}">
          <button class="primary mm-start" data-mm="start">${L('Oyuna başla', 'Start game')}</button>
        </div>
        ${this.error ? `<div class="mm-err">${esc(this.error)}</div>` : ''}
        </div>
        <div class="mm-sep"></div>
        <div class="mm-s-map">
        <div class="mm-label">${L('Harita', 'Map')}</div>
        <div class="mm-maps">${maps}</div>
        <div class="mm-size">
          <div class="seg">${MAP_SIZES.map((s) => `<button class="${s === this.size ? 'active' : ''}" data-mm="size" data-v="${s}">${mapSizeName(s)}<small>${s / 1000} km</small></button>`).join('')}</div>
          <span class="muted small">${L('En yakın düşman üssü', 'Nearest enemy base')} ≈ ${nearestEnemyKm(this.mapId, this.enemies, this.size)} km</span>
        </div>
        </div>
        <div class="mm-enemy">
          <div>
            <div class="mm-label">${L('Düşman sayısı', 'Enemies')}</div>
            <div class="seg">${enemyBtns}</div>
            <div class="mm-foes">${foes}</div>
            <p class="muted small">${L('Herkes herkese karşı. Her ülke ana hava üssü, uçak fabrikası, 1 maden ocağı ve 2 evle başlar.', 'Free for all. Every country starts with a main airbase, an aircraft factory, 1 mine and 2 houses.')}</p>
          </div>
          ${siteMap(this.mapId, this.enemies)}
        </div>
        <div class="mm-foot"><p>${acc
          ? L(`Oyun <b>${esc(acc.name)}</b> hesabına kaydedilir; her 5 dakikada otomatik kayıt alınır.`, `The game is saved to the <b>${esc(acc.name)}</b> account and autosaved every 5 minutes.`)
          : L('Misafir olarak oynuyorsun: oyun kapanınca ilerleme silinir. Kaydetmek için sağ üstten <b>giriş yap</b>.', 'You are playing as a guest: progress is lost when the game closes. To save, <b>log in</b> at the top right.')}</p>${socialLinks()}</div>
        </div>`;
    this.el.innerHTML = `
      <div class="mm-veil"></div>
      <div class="mm-top"><div class="mm-brand">WarSimBox</div>${top}</div>
      <div class="mm-news">
        <div class="mm-label">${L('Haberler', 'News')}</div>
        ${newsCard(NEWS[0], `data-mm="news" title="${L('Bütün haberler', 'All news')}"`, true)}
      </div>
      <button class="mm-fb" data-mm="feedback">${L('Geri bildirim', 'Feedback')}</button>
      <div class="mm-card">
        ${this.notice ? `<div class="mm-note">${esc(this.notice)}</div>` : ''}
        ${tabs}
        ${body}
      </div>`;
  }
}
