// Profil penceresi (ana menüde ad etiketine ya da oyunda Menü → Profil'e dokununca): hesap bilgisi, skorlar (tüm
// zamanlar, sıra, bu hafta), buluttaki kayıt sayısı ve şifre değiştirme.

import { type Profile, changePassword, fetchProfile } from '../persist';
import { METRICS, PASS_MAX, PASS_MIN } from '../net/shared';
import { $, esc } from './dom';
import { HINT, LABEL, fmtValue } from './leaderboard';
import { L, LOCALE } from '../i18n';

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

export class ProfileBox {
  isOpen = false;
  private readonly el: HTMLElement;
  private profile: Profile | null = null;
  private error = '';
  private pwOpen = false;
  private pwMsg = '';
  private pwErr = '';
  private busy = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'login profile hidden';
    $('app').append(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el) return this.close();
      const act = t.closest<HTMLElement>('[data-pf]')?.dataset.pf;
      if (act === 'close') this.close();
      else if (act === 'pw') {
        this.pwOpen = !this.pwOpen;
        this.pwErr = '';
        this.pwMsg = '';
        this.render();
        this.el.querySelector<HTMLInputElement>('input[name="old"]')?.focus();
      }
    });
    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
  }

  async open(): Promise<void> {
    this.isOpen = true;
    this.pwOpen = false;
    this.pwMsg = '';
    this.pwErr = '';
    this.error = '';
    this.el.classList.remove('hidden');
    this.render();
    try {
      this.profile = await fetchProfile();
    } catch (e) {
      this.error = (e as Error).message;
    }
    if (this.isOpen) this.render();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    const v = (n: string) => this.el.querySelector<HTMLInputElement>(`input[name="${n}"]`)?.value ?? '';
    const oldPass = v('old');
    const pass = v('pass');
    this.pwMsg = '';
    if (pass.length < PASS_MIN) this.pwErr = L(`Yeni şifre en az ${PASS_MIN} karakter olmalı`, `The new password must be at least ${PASS_MIN} characters`);
    else if (pass !== v('pass2')) this.pwErr = L('Yeni şifreler aynı değil', 'The new passwords do not match');
    else if (pass === oldPass) this.pwErr = L('Yeni şifre eskisiyle aynı', 'The new password is the same as the old one');
    else this.pwErr = '';
    if (this.pwErr) return this.showPwState();
    this.busy = true;
    this.showPwState();
    try {
      await changePassword(oldPass, pass);
      this.pwOpen = false;
      this.pwMsg = L('Şifren değişti. Öbür cihazlarda yeniden giriş yapman gerekecek.', 'Your password has changed. You will need to log in again on your other devices.');
      this.busy = false;
      this.render();
    } catch (e) {
      this.busy = false;
      this.pwErr = (e as Error).message;
      this.showPwState();
    }
  }

  /** Şifre formunda yalnız ileti ve düğme güncellenir (yazılanlar silinmesin). */
  private showPwState(): void {
    const err = this.el.querySelector<HTMLElement>('.pf-pw .login-err');
    if (err) {
      err.textContent = this.pwErr;
      err.classList.toggle('hidden', !this.pwErr);
    }
    const btn = this.el.querySelector<HTMLButtonElement>('.pf-pw button[type="submit"]');
    if (btn) {
      btn.disabled = this.busy;
      btn.textContent = this.busy ? L('Bekle…', 'Please wait…') : L('Şifreyi değiştir', 'Change password');
    }
  }

  private render(): void {
    const p = this.profile;
    const head = `<div class="login-head"><b>${L('Profil', 'Profile')}</b><button type="button" class="icon" data-pf="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>`;
    if (!p) {
      this.el.innerHTML = `<div class="login-card pf-card" role="dialog" aria-modal="true">${head}
        ${this.error ? `<p class="login-err">${esc(this.error)}</p>` : `<p class="muted">${L('Yükleniyor…', 'Loading…')}</p>`}</div>`;
      return;
    }
    const a = p.account;
    const rows = METRICS.map((m) => {
      const all = p.all?.[m] ?? 0;
      const week = p.week?.[m] ?? 0;
      const rank = all > 0 && p.ranks ? `#${p.ranks[m]}` : '–';
      return `<tr title="${esc(HINT[m]())}"><th>${LABEL[m]()}</th><td>${fmtValue(m, all)}</td><td class="pf-rank">${rank}</td><td>${fmtValue(m, week)}</td></tr>`;
    }).join('');
    const pw = this.pwOpen
      ? `<form class="pf-pw" novalidate>
          <input type="text" name="user" autocomplete="username" value="${esc(a.name)}" hidden>
          <input type="password" name="old" maxlength="${PASS_MAX}" autocomplete="current-password" placeholder="${L('Mevcut şifre', 'Current password')}">
          <input type="password" name="pass" maxlength="${PASS_MAX}" autocomplete="new-password" placeholder="${L('Yeni şifre (en az 6 karakter)', 'New password (at least 6 characters)')}">
          <input type="password" name="pass2" maxlength="${PASS_MAX}" autocomplete="new-password" placeholder="${L('Yeni şifre (tekrar)', 'New password (again)')}">
          <div class="login-err hidden"></div>
          <button type="submit" class="primary wide">${L('Şifreyi değiştir', 'Change password')}</button>
        </form>`
      : '';
    this.el.innerHTML = `<div class="login-card pf-card" role="dialog" aria-modal="true">${head}
      <div class="pf-who"><b>${esc(a.name)}</b><span class="muted small">${L('Hesap açılışı', 'Joined')} ${dateFmt.format(a.created)} · ${L('bulutta', 'in the cloud')} ${p.saves} ${L('kayıt', p.saves === 1 ? 'save' : 'saves')}</span></div>
      <table class="pf-stats">
        <thead><tr><th></th><th>${L('Tüm zamanlar', 'All time')}</th><th>${L('Sıra', 'Rank')}</th><th>${L('Bu hafta', 'This week')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${p.all ? '' : `<p class="muted small">${L('Henüz skorun yok: hesabınla bir harekât oyna, skorların burada ve Skorlar tablosunda görünür.', 'No scores yet: play a campaign with your account and your scores appear here and in the Scores table.')}</p>`}
      ${this.pwMsg ? `<div class="mm-note">${esc(this.pwMsg)}</div>` : ''}
      <button type="button" class="${this.pwOpen ? '' : 'link'} pf-pw-toggle" data-pf="pw">${this.pwOpen ? L('Vazgeç', 'Cancel') : L('Şifre değiştir', 'Change password')}</button>
      ${pw}
    </div>`;
    // Yeniden çizilince odak pencerede kalsın (klavye, ekran okuyucu)
    if (!this.pwOpen) this.el.querySelector<HTMLButtonElement>('[data-pf="close"]')?.focus();
  }
}
