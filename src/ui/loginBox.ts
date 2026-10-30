// Hesap penceresi: giriş (ad + şifre), hesap açma, şifremi unuttum (kurtarma koduyla) ve hesap açılınca bir kez
// gösterilen kurtarma kodu. Tarayıcının şifre yöneticisi çalışsın diye gerçek bir form.

import { type Account, NAME_MAX, cleanName, currentAccount, login, nameError, recoverAccount, register } from '../persist';
import { PASS_MAX, PASS_MIN } from '../net/shared';
import { $, esc } from './dom';
import { L } from '../i18n';

type Mode = 'login' | 'register' | 'recover' | 'code';

export interface LoginOpts {
  mode?: Mode;
  name?: string;
  /** Pencerenin üstündeki not (ör. eski hesabın sahibine: şifre belirle). */
  note?: string;
}

export class LoginBox {
  isOpen = false;
  private el = $('loginbox');
  private mode: Mode = 'login';
  private error = '';
  private note = '';
  private busy = false;
  private code = '';
  private copied = false;
  private result: { acc: Account; created: boolean } | null = null;
  private onDone: ((acc: Account, created: boolean) => void) | null = null;

  constructor() {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el && this.mode !== 'code') {
        this.close();
        return;
      }
      const act = t.closest<HTMLElement>('[data-lg]')?.dataset.lg;
      if (act === 'close') this.close();
      else if (act === 'login' || act === 'register' || act === 'recover') this.switchMode(act);
      else if (act === 'copy') void this.copy();
      else if (act === 'saved') this.finish();
    });
    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    this.el.addEventListener('keydown', (e) => {
      // Kurtarma kodu ekranı yanlışlıkla kapanmasın: yalnız "Kaydettim"
      if (e.key === 'Escape' && this.mode !== 'code') this.close();
      e.stopPropagation();
    });
  }

  private field(name: string): HTMLInputElement | null {
    return this.el.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  }

  open(onDone?: (acc: Account, created: boolean) => void, opts: LoginOpts = {}): void {
    this.onDone = onDone ?? null;
    this.mode = opts.mode ?? 'login';
    this.note = opts.note ?? '';
    this.error = '';
    this.busy = false;
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render(opts.name ?? currentAccount()?.name ?? '');
    this.focusFirst();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  private focusFirst(): void {
    const name = this.field('acc');
    if (name && !name.value) name.focus();
    else (this.field('pass') ?? this.field('code') ?? name)?.focus();
  }

  private switchMode(m: Mode): void {
    const name = this.field('acc')?.value ?? '';
    this.mode = m;
    this.error = '';
    this.render(name);
    this.focusFirst();
  }

  /** Hata: yalnız hata satırı ve düğme güncellenir (yazılan ad ve şifreler silinmesin). */
  private fail(msg: string): void {
    this.error = msg;
    this.setBusy(false);
    let el = this.el.querySelector<HTMLElement>('.login-err');
    if (!el) {
      el = document.createElement('div');
      el.className = 'login-err';
      this.el.querySelector('button[type="submit"]')?.before(el);
    }
    el.textContent = msg;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    const btn = this.el.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!btn) return;
    btn.disabled = busy;
    if (busy) {
      btn.dataset.label = btn.textContent ?? '';
      btn.textContent = L('Bekle…', 'Please wait…');
    } else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  private async submit(): Promise<void> {
    if (this.busy || this.mode === 'code') return;
    const name = cleanName(this.field('acc')?.value ?? '');
    const pass = this.field('pass')?.value ?? '';
    const nameErr = nameError(name);
    if (nameErr) return this.fail(nameErr);
    if (pass.length < PASS_MIN) return this.fail(L(`Şifre en az ${PASS_MIN} karakter olmalı`, `The password must be at least ${PASS_MIN} characters`));
    if (this.mode !== 'login' && pass !== (this.field('pass2')?.value ?? '')) return this.fail(L('Şifreler aynı değil', 'The passwords do not match'));
    const code = this.field('code')?.value ?? '';
    if (this.mode === 'recover' && code.replace(/[^a-z0-9]/gi, '').length < 12) return this.fail(L('Kurtarma kodu 12 karakter', 'The recovery code has 12 characters'));
    this.setBusy(true);
    try {
      if (this.mode === 'login') {
        this.result = { acc: await login(name, pass), created: false };
        this.finish();
        return;
      }
      const r = this.mode === 'register' ? await register(name, pass) : await recoverAccount(name, code, pass);
      this.result = { acc: r.account, created: this.mode === 'register' };
      // Kurtarma kodu bir kez gösterilir
      this.code = r.recoveryCode;
      this.copied = false;
      this.mode = 'code';
      this.busy = false;
      this.render(name);
      this.el.querySelector<HTMLButtonElement>('[data-lg="copy"]')?.focus();
    } catch (e) {
      this.fail((e as Error).message);
    }
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code);
      this.copied = true;
    } catch {
      this.copied = false;
    }
    this.render('');
  }

  private finish(): void {
    const r = this.result;
    this.result = null;
    this.close();
    if (r) this.onDone?.(r.acc, r.created);
  }

  private render(name: string): void {
    const m = this.mode;
    if (m === 'code') {
      this.el.innerHTML = `
        <div class="login-card" role="dialog" aria-modal="true">
          <div class="login-head"><b>${L('Kurtarma kodun', 'Your recovery code')}</b></div>
          <p class="small">${L(
            'Bu kodu bir yere yaz ya da kopyala. Şifreni unutursan hesabına yalnız bu kodla girebilirsin. Kod bir daha gösterilmez.',
            'Write this code down or copy it. If you forget your password, this code is the only way back into your account. It will not be shown again.',
          )}</p>
          <div class="login-code">${esc(this.code)}</div>
          <button type="button" data-lg="copy">${this.copied ? L('Kopyalandı ✓', 'Copied ✓') : L('Kopyala', 'Copy')}</button>
          <button type="button" class="primary wide" data-lg="saved">${L('Kodu kaydettim', 'I saved the code')}</button>
        </div>`;
      return;
    }
    const title = m === 'login' ? L('Giriş yap', 'Log in') : m === 'register' ? L('Hesap aç', 'Create account') : L('Şifremi unuttum', 'Forgot password');
    const tabs = m === 'recover' ? '' : `<div class="seg login-tabs">
        <button type="button" class="${m === 'login' ? 'active' : ''}" data-lg="login">${L('Giriş yap', 'Log in')}</button>
        <button type="button" class="${m === 'register' ? 'active' : ''}" data-lg="register">${L('Hesap aç', 'Create account')}</button></div>`;
    const info = m === 'register'
      ? L('Kayıtların bulutta saklanır: başka telefondan ya da bilgisayardan da devam edersin ve skor tablosunda yer alırsın.',
        'Your saves are kept in the cloud: continue on another phone or computer, and appear on the leaderboard.')
      : m === 'recover'
        ? L('Hesap açarken verilen kurtarma koduyla yeni şifre belirle. Kodu da kaybettiysen Geri bildirim’den ya da sosyal medya hesaplarımızdan bize yaz.',
          'Set a new password with the recovery code you got when creating the account. If you lost the code too, write to us via Feedback or our social media.')
        : '';
    const newPass = m !== 'login';
    this.el.innerHTML = `
      <form class="login-card" role="dialog" aria-modal="true" novalidate>
        <div class="login-head"><b>${title}</b><button type="button" class="icon" data-lg="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
        ${tabs}
        ${this.note ? `<div class="mm-note">${esc(this.note)}</div>` : ''}
        ${info ? `<p class="muted small">${info}</p>` : ''}
        <input name="acc" maxlength="${NAME_MAX}" autocomplete="username" spellcheck="false" placeholder="${L('Kullanıcı adı', 'User name')}" value="${esc(name)}">
        ${m === 'recover' ? `<input name="code" maxlength="20" autocomplete="off" spellcheck="false" placeholder="${L('Kurtarma kodu (ABCD-EFGH-JKLM)', 'Recovery code (ABCD-EFGH-JKLM)')}">` : ''}
        <input name="pass" type="password" maxlength="${PASS_MAX}" autocomplete="${newPass ? 'new-password' : 'current-password'}" placeholder="${newPass ? L('Yeni şifre (en az 6 karakter)', 'New password (at least 6 characters)') : L('Şifre', 'Password')}">
        ${newPass ? `<input name="pass2" type="password" maxlength="${PASS_MAX}" autocomplete="new-password" placeholder="${L('Şifre (tekrar)', 'Password (again)')}">` : ''}
        ${this.error ? `<div class="login-err">${esc(this.error)}</div>` : ''}
        <button type="submit" class="primary wide" ${this.busy ? 'disabled' : ''}>${this.busy ? L('Bekle…', 'Please wait…') : m === 'login' ? L('Giriş', 'Log in') : m === 'register' ? L('Hesabı aç', 'Create account') : L('Şifreyi yenile', 'Reset password')}</button>
        ${m === 'login' ? `<button type="button" class="link" data-lg="recover">${L('Şifremi unuttum', 'Forgot password')}</button>` : ''}
        ${m === 'recover' ? `<button type="button" class="link" data-lg="login">‹ ${L('Girişe dön', 'Back to log in')}</button>` : ''}
      </form>`;
  }
}
