// Duraklatma menüsü (Esc ya da ☰ Menü): devam, elle kayıt, kayıtlar, ayarlar (ses, görünüm), ana menüye dönüş.
// Açıkken oyun durur; kapanınca önceki hıza döner.

import type { Game } from '../game';
import { NAME_MAX, currentAccount } from '../persist';
import { SavesPanel } from './savesList';
import { mapById } from '../sim/maps';
import { $, esc, fmtTime } from './dom';

type View = 'main' | 'saves' | 'exit';

export class PauseMenu {
  isOpen = false;
  private el = $('pausemenu');
  private view: View = 'main';
  private resumeScale = 1;
  private busy = false;
  private msg = '';
  private title = '';
  readonly saves: SavesPanel;

  constructor(private readonly game: Game) {
    this.saves = new SavesPanel((id) => void this.game.loadSave(id), () => this.render());
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'stitle') this.title = t.value;
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).matches('input[name="stitle"]')) void this.save();
      else if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
  }

  open(): void {
    if (this.game.mode !== 'play' || this.isOpen) return;
    this.isOpen = true;
    this.resumeScale = this.game.timeScale;
    this.game.setTimeScale(0);
    this.view = 'main';
    this.msg = '';
    this.title = this.game.defaultSaveTitle();
    this.el.classList.remove('hidden');
    this.render();
  }

  /** resume: önceki hıza dön (ana menüye çıkarken ya da kayıt yüklenirken false). */
  close(resume = true): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.add('hidden');
    if (resume) this.game.setTimeScale(this.resumeScale);
  }

  private async save(): Promise<void> {
    if (this.busy || !currentAccount()) return;
    this.busy = true;
    this.render();
    const ok = await this.game.saveNow('manual', this.title.trim() || this.game.defaultSaveTitle());
    this.busy = false;
    this.msg = ok ? 'Kaydedildi.' : 'Kaydedilemedi.';
    if (ok) this.title = this.game.defaultSaveTitle();
    this.render();
  }

  private onClick(e: Event): void {
    const t = e.target as HTMLElement;
    if (t === this.el) {
      this.close();
      return;
    }
    const acc = currentAccount();
    if (this.view === 'saves' && this.saves.handle(t, acc?.key ?? null)) return;
    const b = t.closest<HTMLElement>('[data-pm]');
    if (!b) return;
    const g = this.game;
    switch (b.dataset.pm) {
      case 'resume':
        this.close();
        return;
      case 'save':
        void this.save();
        return;
      case 'login':
        g.login.open((a, created) => {
          this.msg = created ? `Hesap oluşturuldu (${a.name}). Artık kaydedebilirsin.` : `Giriş yapıldı: ${a.name}.`;
          this.render();
        });
        return;
      case 'saves':
        this.view = 'saves';
        this.render();
        void this.saves.refresh(acc?.key ?? null);
        return;
      case 'settings':
        g.modals.open('settings');
        return;
      case 'feedback':
        g.feedback.open(g.world.playerName || acc?.name || '');
        return;
      case 'back':
        this.view = 'main';
        this.render();
        return;
      case 'exit':
        // Kaydedilmiş ve sonradan ilerlemedi ise doğrudan çık
        if (!g.unsavedProgress()) g.exitToMenu();
        else {
          this.view = 'exit';
          this.render();
        }
        return;
      case 'exit-save':
        void g.saveNow('manual', this.game.defaultSaveTitle()).then((ok) => {
          if (ok) g.exitToMenu();
          else {
            this.msg = 'Kaydedilemedi.';
            this.view = 'main';
            this.render();
          }
        });
        return;
      case 'exit-now':
        g.exitToMenu();
        return;
    }
  }

  render(): void {
    if (!this.isOpen) return;
    const g = this.game;
    const w = g.world;
    const acc = currentAccount();
    let body = '';
    if (this.view === 'saves') {
      body = `<div class="pm-head"><button class="icon" data-pm="back" title="Geri">‹</button><h2>Kayıtlar</h2></div>
        <p class="muted small">Yüklenen kayıt şu anki oyunun yerini alır.</p>
        ${this.saves.html()}`;
    } else if (this.view === 'exit') {
      body = `<h2>Ana menüye dön</h2>
        <p class="muted">${acc ? 'Son kayıttan sonraki ilerleme kaydedilmedi.' : 'Misafir oyun kaydedilmez: çıkınca bu harekât silinir.'}</p>
        <div class="pm-col">
          ${acc ? '<button class="primary" data-pm="exit-save">Kaydet ve çık</button>' : ''}
          <button class="${acc ? '' : 'danger'}" data-pm="exit-now">${acc ? 'Kaydetmeden çık' : 'Yine de çık'}</button>
          <button data-pm="back">Vazgeç</button>
        </div>`;
    } else {
      const who = w.playerName ? `Komutan ${esc(w.playerName)}` : 'Senaryo';
      const foes = w.teams.length - 1;
      const last = g.lastSave
        ? `Son kayıt ${g.ago(g.lastSave.real)} (${g.lastSave.kind === 'auto' ? 'otomatik' : 'elle'})`
        : 'Bu oyun henüz kaydedilmedi';
      const auto = acc ? ` · sıradaki otomatik kayıt ≈ ${Math.max(0, Math.ceil(g.autosaveLeft() / 60))} dk` : '';
      const saveBlock = acc
        ? `<div class="pm-save">
            <input name="stitle" maxlength="${NAME_MAX * 2}" value="${esc(this.title)}" placeholder="Kayıt adı" ${this.busy ? 'disabled' : ''}>
            <button class="primary" data-pm="save" ${this.busy ? 'disabled' : ''}>${this.busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>`
        : `<div class="pm-guest"><span>Misafir oyun kaydedilmez.</span><button data-pm="login">Giriş yap ve kaydet</button></div>`;
      body = `<h2>Duraklatıldı</h2>
        <p class="muted small">${who} · ${esc(mapById(w.mapId).name)} · oyun süresi ${fmtTime(w.time)}${foes > 0 ? ` · ${foes} düşman` : ''}${acc ? ` · hesap ${esc(acc.name)}` : ''}</p>
        ${this.msg ? `<div class="mm-note">${esc(this.msg)}</div>` : ''}
        <div class="pm-col">
          <button class="primary big" data-pm="resume">Devam et <small class="kbd">Esc</small></button>
        </div>
        ${saveBlock}
        <p class="muted small pm-last">${last}${auto}</p>
        <div class="pm-col">
          ${acc ? '<button data-pm="saves">Kayıtlar</button>' : ''}
          <button data-pm="settings">Ayarlar (ses, görünüm)</button>
          <button data-pm="feedback">Geri bildirim gönder</button>
          <button data-pm="exit">Ana menüye dön</button>
        </div>`;
    }
    this.el.innerHTML = `<div class="pm-card">${body}</div>`;
  }
}
