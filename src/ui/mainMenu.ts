// Ana menü: arkada saydam harita (yapay zekâ ülkeleri kendi aralarında oynar), ortada komutan adı, başlat, harita ve
// düşman sayısı; sağ üstte giriş. Giriş yapanlar kayıtlarını buradan açar. Harita seçilince arka plan o haritaya geçer.

import type { Game } from '../game';
import { MAX_ENEMIES } from '../sim/campaign';
import { MAP_SIZE, TEAM_SITES } from '../sim/mapData';
import { MAPS, mapById } from '../sim/maps';
import { terrainMap } from '../sim/terrain';
import { mapPreview } from './mapPreview';
import { NAME_MAX, cleanName, currentAccount, logout, nameError } from '../persist';
import { SavesPanel } from './savesList';
import { NEWS, newsCard } from './news';
import { enterFullscreen, isFullscreen, toggleFullscreen } from './fullscreen';
import { $, esc } from './dom';

type Tab = 'new' | 'saves';

/** Küçük harita: seçili haritanın önizlemesi üstünde tarafların ana üs yerleri (seçilen düşman sayısına göre). */
function siteMap(mapId: string, enemies: number): string {
  const S = 150;
  const k = S / MAP_SIZE;
  const def = mapById(mapId);
  const dots = def.sites.slice(0, enemies + 1).map((site, i) => {
    const t = TEAM_SITES[i];
    const x = S / 2 + site.x * k;
    const y = S / 2 + site.z * k;
    // Yalnız oyuncu yazılır (düşmanların adları renkli çiplerde)
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 0 ? 7 : 5.5}" fill="${t.color}" stroke="#fff" stroke-width="2"/>
      ${i === 0 ? `<text x="${x.toFixed(1)}" y="${(y + (y > S / 2 ? -11 : 18)).toFixed(1)}" text-anchor="middle">Sen</text>` : ''}</g>`;
  }).join('');
  return `<div class="mm-map"><img src="${mapPreview(def, 150)}" alt=""><svg viewBox="0 0 ${S} ${S}" aria-hidden="true">${dots}</svg></div>`;
}

export class MainMenu {
  isOpen = false;
  private el = $('mainmenu');
  private enemies = 2;
  private mapId = terrainMap.id;
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

  private start(): void {
    const err = nameError(this.name);
    if (err) {
      this.error = `Komutan adı: ${err.toLocaleLowerCase('tr-TR')}`;
      this.render();
      this.el.querySelector<HTMLInputElement>('input[name="cmd"]')?.focus();
      return;
    }
    enterFullscreen();
    this.game.newCampaign(cleanName(this.name), this.enemies, this.mapId);
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
        this.game.previewMap(this.mapId);
        return;
      case 'tab':
        this.tab = b.dataset.v as Tab;
        this.render();
        if (this.tab === 'saves') void this.saves.refresh(acc?.key ?? null);
        return;
      case 'login':
        this.game.login.open((a, created) => {
          if (!cleanName(this.name)) this.name = a.name;
          this.notice = created ? `Hesap oluşturuldu: ${a.name}. Kayıtların bu adla saklanır.` : `Tekrar hoş geldin, ${a.name}.`;
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
      case 'logout':
        logout();
        this.tab = 'new';
        this.notice = 'Çıkış yapıldı. Misafir oyunlar kaydedilmez.';
        this.saves.list = [];
        this.render();
        return;
    }
  }

  render(): void {
    if (!this.isOpen) return;
    const acc = currentAccount();
    const fs = `<button class="mm-login" data-mm="fullscreen" title="Tam ekran">${isFullscreen() ? 'Tam ekrandan çık' : '⛶ Tam ekran'}</button>`;
    // Dar ekranda haber kutusu ve sağdaki geri bildirim düğmesi yerine üst çubukta düğme
    const newsBtn = '<button class="mm-login mm-news-btn" data-mm="news">Haberler</button><button class="mm-login mm-fb-btn" data-mm="feedback">Geri bildirim</button>';
    const top = acc
      ? `<div class="mm-acc">${newsBtn}${fs}<span class="mm-user" title="${esc(acc.name)}"><i></i><b>${esc(acc.name)}</b></span><button class="mini" data-mm="logout">Çıkış yap</button></div>`
      : `<div class="mm-acc">${newsBtn}${fs}<button class="mm-login" data-mm="login">Giriş yap</button></div>`;
    const foes = TEAM_SITES.slice(1, this.enemies + 1)
      .map((t) => `<span class="mm-foe"><i style="background:${t.color}"></i>${t.name}</span>`).join('');
    const maps = MAPS.map((m) => `<button class="mm-mapcard ${m.id === this.mapId ? 'active' : ''}" data-mm="map" data-v="${m.id}" title="${esc(m.desc)}">
        <img src="${mapPreview(m, 96)}" alt=""><span><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></span></button>`).join('');
    const enemyBtns = Array.from({ length: MAX_ENEMIES }, (_, i) => i + 1)
      .map((n) => `<button class="${n === this.enemies ? 'active' : ''}" data-mm="enemies" data-v="${n}">${n}</button>`).join('');
    const tabs = acc
      ? `<div class="mm-tabs"><button class="${this.tab === 'new' ? 'active' : ''}" data-mm="tab" data-v="new">Yeni harekât</button>
          <button class="${this.tab === 'saves' ? 'active' : ''}" data-mm="tab" data-v="saves">Kayıtlar${this.saves.list.length ? ` <span class="cnt">${this.saves.list.length}</span>` : ''}</button></div>`
      : '';
    const body = this.tab === 'saves' && acc
      ? `<div class="mm-saves">${this.saves.html()}</div>`
      : `<div class="mm-body">
        <div class="mm-s-name">
        <label class="mm-label" for="mm-cmd">Komutan adı</label>
        <div class="mm-row">
          <input id="mm-cmd" name="cmd" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="Adını yaz" value="${esc(this.name)}">
          <button class="primary mm-start" data-mm="start">Oyuna başla</button>
        </div>
        ${this.error ? `<div class="mm-err">${esc(this.error)}</div>` : ''}
        </div>
        <div class="mm-sep"></div>
        <div class="mm-s-map">
        <div class="mm-label">Harita · 300 × 300 km</div>
        <div class="mm-maps">${maps}</div>
        </div>
        <div class="mm-enemy">
          <div>
            <div class="mm-label">Düşman sayısı</div>
            <div class="seg">${enemyBtns}</div>
            <div class="mm-foes">${foes}</div>
            <p class="muted small">Herkes herkese karşı. Her ülke ana hava üssü, uçak fabrikası, 1 maden ocağı ve 2 evle başlar.</p>
          </div>
          ${siteMap(this.mapId, this.enemies)}
        </div>
        <p class="mm-foot">${acc
          ? `Oyun <b>${esc(acc.name)}</b> hesabına kaydedilir; her 5 dakikada otomatik kayıt alınır.`
          : 'Misafir olarak oynuyorsun: oyun kapanınca ilerleme silinir. Kaydetmek için sağ üstten <b>giriş yap</b>.'}</p>
        </div>`;
    this.el.innerHTML = `
      <div class="mm-veil"></div>
      <div class="mm-top"><div class="mm-brand">WarSim<span>hava harbi</span></div>${top}</div>
      <div class="mm-news">
        <div class="mm-label">Haberler</div>
        ${newsCard(NEWS[0], 'data-mm="news" title="Bütün haberler"', true)}
      </div>
      <button class="mm-fb" data-mm="feedback">Geri bildirim</button>
      <div class="mm-card">
        ${this.notice ? `<div class="mm-note">${esc(this.notice)}</div>` : ''}
        ${tabs}
        ${body}
      </div>`;
  }
}
