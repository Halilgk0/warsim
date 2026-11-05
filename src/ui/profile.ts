// Profil penceresi (ana menüde ad etiketine ya da oyunda Menü → Profil'e dokununca): hesap bilgisi, hesabın dili, e-posta
// (yeni adres kodla doğrulanır) ve yenilik izni, skorlar (tüm zamanlar, sıra, bu hafta), buluttaki kayıt sayısı, şifre
// değiştirme, hesabı silme ve skorların herkese açık tabloda görünüp görünmeyeceği.

import { type Profile, changePassword, deleteAccount, fetchProfile, requestEmailCode, saveEmail, saveScorePublic } from '../persist';
import { apiMessage } from '../net/api';
import { METRICS, PASS_MAX, PASS_MIN, type Metric, cleanEmail, validEmail } from '../net/shared';
import { $, esc, focusField } from './dom';
import { HINT, LABEL, fmtValue } from './leaderboard';
import { codeInput, codeSentText, consentBoxes, emailInput } from './loginBox';
import { L, LANG, LOCALE } from '../i18n';

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

export class ProfileBox {
  isOpen = false;
  private readonly el: HTMLElement;
  private profile: Profile | null = null;
  private error = '';
  private pwOpen = false;
  private pwMsg = '';
  private pwErr = '';
  private mailOpen = false;
  private mailErr = '';
  /** Kod beklenirken doğrulanacak adres ve yenilik izni. */
  private mailCode: { email: string; news: boolean } | null = null;
  private delOpen = false;
  private busy = false;

  /** onDeleted: hesap silinince (ana menüye dönülür, ileti gösterilir). onScoresChanged: skor görünürlüğü değişince. */
  constructor(private readonly onDeleted: (notice: string) => void, private readonly onScoresChanged: () => void) {
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
        this.mailOpen = false;
        this.delOpen = false;
        this.pwErr = '';
        this.pwMsg = '';
        this.render();
        focusField(this.el.querySelector<HTMLInputElement>('input[name="old"]'));
      } else if (act === 'mail') {
        this.mailOpen = !this.mailOpen;
        this.mailCode = null;
        this.pwOpen = false;
        this.delOpen = false;
        this.mailErr = '';
        this.pwMsg = '';
        this.render();
        focusField(this.el.querySelector<HTMLInputElement>('input[name="email"]'));
      } else if (act === 'resend') void this.resendMail();
      else if (act === 'del') {
        this.delOpen = !this.delOpen;
        this.pwOpen = false;
        this.mailOpen = false;
        this.mailCode = null;
        this.pwMsg = '';
        this.render();
        focusField(this.el.querySelector<HTMLInputElement>('input[name="delpass"]'));
      }
    });
    this.el.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'public') void this.savePublic(t);
    });
    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLElement;
      void (form.closest('.pf-mail') ? this.submitMail() : form.closest('.pf-del') ? this.submitDelete() : this.submit());
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
  }

  async open(): Promise<void> {
    this.isOpen = true;
    // Önceki hesabın bilgileri, yenisi gelene kadar bile görünmesin
    this.profile = null;
    this.pwOpen = false;
    this.mailOpen = false;
    this.mailCode = null;
    this.delOpen = false;
    this.pwMsg = '';
    this.pwErr = '';
    this.mailErr = '';
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

  /** Yerinde güncellenir: açık formlarda yazılanlar silinmesin. */
  private async savePublic(box: HTMLInputElement): Promise<void> {
    const p = this.profile;
    if (!p) return;
    const err = this.el.querySelector<HTMLElement>('.pf-public-err');
    const on = box.checked;
    box.disabled = true;
    err?.classList.add('hidden');
    try {
      await saveScorePublic(on);
      p.scorePublic = on;
      this.el.querySelectorAll<HTMLElement>('.pf-rank[data-m]').forEach((c) => { c.textContent = this.rankText(p, c.dataset.m as Metric); });
      this.onScoresChanged();
    } catch (e) {
      box.checked = !on;
      if (err) {
        err.textContent = (e as Error).message;
        err.classList.remove('hidden');
      }
    }
    box.disabled = false;
  }

  private rankText(p: Profile, m: Metric): string {
    return p.scorePublic && (p.all?.[m] ?? 0) > 0 && p.ranks ? `#${p.ranks[m]}` : '–';
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

  private async submitMail(): Promise<void> {
    const p = this.profile;
    if (this.busy || !p) return;
    const box = (n: string) => this.el.querySelector<HTMLInputElement>(`input[name="${n}"]`);
    const pending = this.mailCode;
    const email = pending?.email ?? box('email')?.value ?? '';
    const news = pending?.news ?? !!box('news')?.checked;
    const code = pending ? (box('code')?.value ?? '').replace(/\D/g, '') : undefined;
    const accept = box('accept');
    this.pwMsg = '';
    this.mailErr = pending
      ? code!.length === 6 ? '' : L('Kod 6 haneli', 'The code has 6 digits')
      : !validEmail(email) ? apiMessage('email_bad') : accept && !accept.checked ? apiMessage('not_accepted') : '';
    if (this.mailErr) return this.showMailState();
    this.busy = true;
    this.showMailState();
    try {
      // Yeni adres önce kodla doğrulanır; adres aynıysa yalnız yenilik izni değişir
      if (!pending && cleanEmail(email) !== p.email) {
        await requestEmailCode(email);
        this.mailCode = { email, news };
        this.busy = false;
        this.render();
        focusField(box('code'));
        return;
      }
      const r = await saveEmail(email, news, code);
      p.email = r.email;
      p.news = r.news;
      p.accepted = true;
      this.mailOpen = false;
      this.mailCode = null;
      this.pwMsg = L('E-posta bilgilerin kaydedildi.', 'Your email settings have been saved.');
      this.busy = false;
      this.render();
    } catch (e) {
      this.busy = false;
      this.mailErr = (e as Error).message;
      this.showMailState();
    }
  }

  private async resendMail(): Promise<void> {
    const pending = this.mailCode;
    if (this.busy || !pending) return;
    this.busy = true;
    this.mailErr = '';
    this.showMailState();
    const note = this.el.querySelector<HTMLElement>('.pf-mail .mm-note');
    note?.classList.add('hidden');
    try {
      await requestEmailCode(pending.email);
      if (note) {
        note.textContent = L('Yeni kod gönderildi. Eski kod artık geçmez.', 'A new code has been sent. The old code no longer works.');
        note.classList.remove('hidden');
      }
    } catch (e) {
      this.mailErr = (e as Error).message;
    }
    this.busy = false;
    this.showMailState();
  }

  /** E-posta formunda yalnız ileti ve düğme güncellenir (yazılanlar silinmesin). */
  private showMailState(): void {
    const err = this.el.querySelector<HTMLElement>('.pf-mail .login-err');
    if (err) {
      err.textContent = this.mailErr;
      err.classList.toggle('hidden', !this.mailErr);
    }
    const btn = this.el.querySelector<HTMLButtonElement>('.pf-mail button[type="submit"]');
    if (btn) {
      btn.disabled = this.busy;
      btn.textContent = this.busy ? L('Bekle…', 'Please wait…') : this.mailButton();
    }
  }

  private mailButton(): string {
    return this.mailCode ? L('Doğrula', 'Verify') : L('Kaydet', 'Save');
  }

  private async submitDelete(): Promise<void> {
    if (this.busy) return;
    const pass = this.el.querySelector<HTMLInputElement>('input[name="delpass"]')?.value ?? '';
    const err = this.el.querySelector<HTMLElement>('.pf-del .login-err');
    const btn = this.el.querySelector<HTMLButtonElement>('.pf-del button[type="submit"]');
    const show = (msg: string) => {
      if (err) {
        err.textContent = msg;
        err.classList.toggle('hidden', !msg);
      }
    };
    if (!pass) return show(L('Şifreni yaz', 'Enter your password'));
    this.busy = true;
    show('');
    const label = btn?.textContent ?? '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = L('Bekle…', 'Please wait…');
    }
    try {
      await deleteAccount(pass);
      this.busy = false;
      this.profile = null;
      this.close();
      this.onDeleted(L('Hesabın ve verilerin silindi.', 'Your account and data have been deleted.'));
    } catch (e) {
      this.busy = false;
      show((e as Error).message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
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
      return `<tr title="${esc(HINT[m]())}"><th>${LABEL[m]()}</th><td>${fmtValue(m, all)}</td><td class="pf-rank" data-m="${m}">${this.rankText(p, m)}</td><td>${fmtValue(m, week)}</td></tr>`;
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
    const mail = !this.mailOpen
      ? ''
      : this.mailCode
        ? `<form class="pf-pw pf-mail" novalidate>
            <p class="small">${codeSentText(this.mailCode.email)}</p>
            <div class="mm-note hidden"></div>
            ${codeInput()}
            <div class="login-err hidden"></div>
            <button type="submit" class="primary wide">${this.mailButton()}</button>
            <button type="button" class="link" data-pf="resend">${L('Yeni kod gönder', 'Send a new code')}</button>
          </form>`
        : `<form class="pf-pw pf-mail" novalidate>
            ${emailInput(p.email ?? '')}
            ${consentBoxes(!p.accepted, p.news)}
            <div class="login-err hidden"></div>
            <button type="submit" class="primary wide">${this.mailButton()}</button>
          </form>`;
    const del = this.delOpen
      ? `<form class="pf-pw pf-del" novalidate>
          <p class="small">${L(
            'Hesabın, buluttaki kayıtların ve skorların <b>kalıcı olarak</b> silinir; bu geri alınamaz. Açık oyunun kaydedilmez ve ana menüye dönersin.',
            'Your account, cloud saves and scores are deleted <b>permanently</b>; this cannot be undone. Any open game is not saved and you return to the main menu.',
          )}</p>
          <input type="text" name="user" autocomplete="username" value="${esc(a.name)}" hidden>
          <input type="password" name="delpass" maxlength="${PASS_MAX}" autocomplete="current-password" placeholder="${L('Şifren', 'Your password')}">
          <div class="login-err hidden"></div>
          <button type="submit" class="danger wide">${L('Hesabımı kalıcı olarak sil', 'Delete my account permanently')}</button>
        </form>`
      : '';
    this.el.innerHTML = `<div class="login-card pf-card" role="dialog" aria-modal="true">${head}
      <div class="pf-who"><b>${esc(a.name)}</b><span class="muted small">${L('Hesap açılışı', 'Joined')} ${dateFmt.format(a.created)} · ${L('bulutta', 'in the cloud')} ${p.saves} ${L('kayıt', p.saves === 1 ? 'save' : 'saves')} · ${L('Dil', 'Language')}: ${LANG === 'en' ? 'English' : 'Türkçe'}</span></div>
      <div class="pf-email"><span class="small ${p.email ? '' : 'muted'}">${p.email ? esc(p.email) : L('E-posta eklenmemiş', 'No email added')}</span>
        <button type="button" class="link" data-pf="mail">${this.mailOpen ? L('Vazgeç', 'Cancel') : p.email ? L('Düzenle', 'Edit') : L('Ekle', 'Add')}</button></div>
      ${mail}
      <table class="pf-stats">
        <thead><tr><th></th><th>${L('Tüm zamanlar', 'All time')}</th><th>${L('Sıra', 'Rank')}</th><th>${L('Bu hafta', 'This week')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${p.all ? '' : `<p class="muted small">${L('Henüz skorun yok: hesabınla bir harekât oyna, skorların burada görünür.', 'No scores yet: play a campaign with your account and your scores appear here.')}</p>`}
      <label class="login-check"><input type="checkbox" name="public" ${p.scorePublic ? 'checked' : ''}><span>${L('Skorlarım skor tablosunda herkese açık olsun', 'Show my scores on the public leaderboard')}</span></label>
      <p class="muted small pf-public-hint">${L('Kapalıyken adın ve skorların tabloda görünmez; skorların kaydedilmeye devam eder.', 'When off, your name and scores stay off the leaderboard; your scores keep counting.')}</p>
      <div class="login-err hidden pf-public-err"></div>
      ${this.pwMsg ? `<div class="mm-note">${esc(this.pwMsg)}</div>` : ''}
      <button type="button" class="${this.pwOpen ? '' : 'link'} pf-pw-toggle" data-pf="pw">${this.pwOpen ? L('Vazgeç', 'Cancel') : L('Şifre değiştir', 'Change password')}</button>
      ${pw}
      <button type="button" class="${this.delOpen ? '' : 'link'} pf-pw-toggle" data-pf="del">${this.delOpen ? L('Vazgeç', 'Cancel') : L('Hesabımı sil', 'Delete my account')}</button>
      ${del}
    </div>`;
    // Yeniden çizilince odak pencerede kalsın (klavye, ekran okuyucu)
    if (!this.pwOpen && !this.mailOpen && !this.delOpen) this.el.querySelector<HTMLButtonElement>('[data-pf="close"]')?.focus();
  }
}
