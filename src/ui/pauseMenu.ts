// Duraklatma menüsü (Esc ya da ☰ Menü): devam, elle kayıt, kayıtlar, ayarlar (ses, görünüm), ana menüye dönüş.
// Açıkken oyun durur; kapanınca önceki hıza döner.

import type { Game } from '../game';
import { NAME_MAX, currentAccount } from '../persist';
import { SavesPanel } from './savesList';
import { mapById } from '../sim/maps';
import { SCENARIOS } from '../sim/scenarios';
import { $, esc, fmtTime } from './dom';
import { L } from '../i18n';

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
    this.msg = ok ? L('Kaydedildi.', 'Saved.') : L('Kaydedilemedi.', 'Could not save.');
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
          this.msg = created
            ? L(`Hesap oluşturuldu (${a.name}). Artık kaydedebilirsin.`, `Account created (${a.name}). You can save now.`)
            : L(`Giriş yapıldı: ${a.name}.`, `Logged in: ${a.name}.`);
          this.render();
        });
        return;
      case 'profile':
        void g.profile.open();
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
      case 'tutorial':
        this.close(false);
        g.tutorial.begin(false);
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
            this.msg = L('Kaydedilemedi.', 'Could not save.');
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
    // Öğretici harekât içindir (it dalaşı ve saldırı senaryolarında hangar boş, kurulacak görev yok)
    const tutorial = (SCENARIOS.find((s) => s.id === g.scenarioId)?.group ?? 'harekat') === 'harekat';
    let body = '';
    if (this.view === 'saves') {
      body = `<div class="pm-head"><button class="icon" data-pm="back" title="${L('Geri', 'Back')}">‹</button><h2>${L('Kayıtlar', 'Saves')}</h2></div>
        <p class="muted small">${L('Yüklenen kayıt şu anki oyunun yerini alır.', 'Loading a save replaces the current game.')}</p>
        ${this.saves.html()}`;
    } else if (this.view === 'exit') {
      body = `<h2>${L('Ana menüye dön', 'Back to main menu')}</h2>
        <p class="muted">${acc
          ? L('Son kayıttan sonraki ilerleme kaydedilmedi.', 'Progress since the last save has not been saved.')
          : L('Misafir oyun kaydedilmez: çıkınca bu harekât silinir.', 'Guest games are not saved: this campaign is lost when you leave.')}</p>
        <div class="pm-col">
          ${acc ? `<button class="primary" data-pm="exit-save">${L('Kaydet ve çık', 'Save and quit')}</button>` : ''}
          <button class="${acc ? '' : 'danger'}" data-pm="exit-now">${acc ? L('Kaydetmeden çık', 'Quit without saving') : L('Yine de çık', 'Quit anyway')}</button>
          <button data-pm="back">${L('Vazgeç', 'Cancel')}</button>
        </div>`;
    } else {
      const who = w.playerName ? `${L('Komutan', 'Commander')} ${esc(w.playerName)}` : L('Senaryo', 'Scenario');
      const foes = w.teams.length - 1;
      const last = g.lastSave
        ? L(`Son kayıt ${g.ago(g.lastSave.real)}`, `Last saved ${g.ago(g.lastSave.real)}`) + ` (${g.lastSave.kind === 'auto' ? L('otomatik', 'auto') : L('elle', 'manual')})`
        : L('Bu oyun henüz kaydedilmedi', 'This game has not been saved yet');
      const auto = acc ? L(` · sıradaki otomatik kayıt ≈ ${Math.max(0, Math.ceil(g.autosaveLeft() / 60))} dk`, ` · next autosave ≈ ${Math.max(0, Math.ceil(g.autosaveLeft() / 60))} min`) : '';
      const saveBlock = acc
        ? `<div class="pm-save">
            <input name="stitle" maxlength="${NAME_MAX * 2}" value="${esc(this.title)}" placeholder="${L('Kayıt adı', 'Save name')}" ${this.busy ? 'disabled' : ''}>
            <button class="primary" data-pm="save" ${this.busy ? 'disabled' : ''}>${this.busy ? L('Kaydediliyor…', 'Saving…') : L('Kaydet', 'Save')}</button>
          </div>`
        : `<div class="pm-guest"><span>${L('Misafir oyun kaydedilmez.', 'Guest games are not saved.')}</span><button data-pm="login">${L('Giriş yap ve kaydet', 'Log in and save')}</button></div>`;
      body = `<h2>${L('Duraklatıldı', 'Paused')}</h2>
        <p class="muted small">${who} · ${esc(mapById(w.mapId).name)} ${w.mapSize / 1000} km · ${L('oyun süresi', 'game time')} ${fmtTime(w.time)}${foes > 0 ? ` · ${foes} ${L('düşman', foes === 1 ? 'enemy' : 'enemies')}` : ''}${acc ? ` · ${L('hesap', 'account')} ${esc(acc.name)}` : ''}</p>
        ${this.msg ? `<div class="mm-note">${esc(this.msg)}</div>` : ''}
        <div class="pm-col">
          <button class="primary big" data-pm="resume">${L('Devam et', 'Resume')} <small class="kbd">Esc</small></button>
        </div>
        ${saveBlock}
        <p class="muted small pm-last">${last}${auto}</p>
        <div class="pm-col">
          ${acc ? `<button data-pm="saves">${L('Kayıtlar', 'Saves')}</button><button data-pm="profile">${L('Profil ve skorlar', 'Profile and scores')}</button>` : ''}
          <button data-pm="settings">${L('Ayarlar (ses, görünüm)', 'Settings (sound, display)')}</button>
          ${tutorial ? `<button data-pm="tutorial">${L('Öğretici', 'Tutorial')}</button>` : ''}
          <button data-pm="feedback">${L('Geri bildirim gönder', 'Send feedback')}</button>
          <button data-pm="exit">${L('Ana menüye dön', 'Back to main menu')}</button>
        </div>`;
    }
    this.el.innerHTML = `<div class="pm-card">${body}</div>`;
  }
}
