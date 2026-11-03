// Hesap penceresi: giriş (ad + şifre), hesap açma (e-posta, Gizlilik ve KVKK onayı), e-postaya gelen kodla doğrulama,
// şifremi unuttum (kurtarma koduyla), hesap açılınca bir kez gösterilen kurtarma kodu ve e-postası olmayan eski hesaba
// zorunlu olmayan e-posta sorusu. Tarayıcının şifre yöneticisi çalışsın diye gerçek bir form.

import { type Account, NAME_MAX, cleanName, currentAccount, login, nameError, postponeEmailAsk, recoverAccount, register, requestEmailCode, saveEmail, shouldAskEmail } from '../persist';
import { apiMessage } from '../net/api';
import { EMAIL_MAX, PASS_MAX, PASS_MIN, validEmail } from '../net/shared';
import { legalUrl } from '../yasal/liste';
import { $, esc } from './dom';
import { L, LANG } from '../i18n';

type Mode = 'login' | 'register' | 'recover' | 'code' | 'email' | 'verify';

/** Doğrulama kodu alanı (hesap penceresi ve profil). */
export function codeInput(): string {
  return `<input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" spellcheck="false" placeholder="${L('6 haneli kod', '6-digit code')}">`;
}

/** Kod ekranının açıklaması. */
export function codeSentText(email: string): string {
  return L(`<b>${esc(email)}</b> adresine 6 haneli bir kod gönderdik. Gelen kutunu ve spam klasörünü kontrol et. Kod 10 dakika geçerli.`,
    `We sent a 6-digit code to <b>${esc(email)}</b>. Check your inbox and spam folder. The code is valid for 10 minutes.`);
}

/** E-posta alanı (hesap açma, eski hesap sorusu, profil). */
export function emailInput(value = ''): string {
  return `<input name="email" type="email" inputmode="email" maxlength="${EMAIL_MAX}" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="${L('E-posta adresi', 'Email address')}" value="${esc(value)}">`;
}

/** Onay kutuları. Metinler yeni sekmede açılır: yazılanlar silinmesin. Yenilik izni ayrı ve isteğe bağlı. */
export function consentBoxes(askAccept: boolean, news = false): string {
  const doc = (kind: 'privacy' | 'kvkk', text: string) => `<a href="${legalUrl(kind, LANG === 'en')}" target="_blank" rel="noopener">${text}</a>`;
  const privacy = doc('privacy', L('Gizlilik Politikası', 'Privacy Policy'));
  const kvkk = doc('kvkk', L('KVKK Aydınlatma Metni', 'KVKK Privacy Notice'));
  return `${askAccept ? `<label class="login-check"><input type="checkbox" name="accept"><span>${L(`${privacy}’nı ve ${kvkk}’ni okudum, kabul ediyorum.`, `I have read and accept the ${privacy} and the ${kvkk}.`)}</span></label>` : ''}
    <label class="login-check"><input type="checkbox" name="news" ${news ? 'checked' : ''}><span>${L('Yenilik ve duyuruları e-postayla almak istiyorum (isteğe bağlı).', 'Email me news and announcements (optional).')}</span></label>`;
}

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
  /** Kod beklenirken: doğrulanacak adres; hesap açılıyorsa ad ve şifre de (ekran değişince silinmesin). */
  private pending: { email: string; news: boolean; name?: string; pass?: string } | null = null;
  /** Kod ekranından geri dönünce formda duracak adres. */
  private emailValue = '';

  constructor() {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      // Kod ekranları yanlışlıkla kapanmasın
      if (t === this.el && this.mode !== 'code' && this.mode !== 'verify') {
        this.close();
        return;
      }
      const act = t.closest<HTMLElement>('[data-lg]')?.dataset.lg;
      if (act === 'close' || act === 'later') this.close();
      else if (act === 'login' || act === 'register' || act === 'recover') this.switchMode(act);
      else if (act === 'copy') void this.copy();
      else if (act === 'saved') this.finish();
      else if (act === 'resend') void this.resend();
      else if (act === 'back') this.back();
    });
    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    this.el.addEventListener('keydown', (e) => {
      // Kurtarma kodu ekranı yanlışlıkla kapanmasın: yalnız "Kaydettim"; doğrulama ekranı: yalnız "Geri"
      if (e.key === 'Escape' && this.mode !== 'code' && this.mode !== 'verify') this.close();
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
    this.emailValue = '';
    this.busy = false;
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render(opts.name ?? currentAccount()?.name ?? '');
    this.focusFirst();
  }

  close(): void {
    // E-posta sorusu nasıl kapanırsa kapansın (Şimdi değil, Esc, dışarı dokunma) 7 gün sorulmaz; adres eklendiyse etkisi yok
    if (this.isOpen && this.mode === 'email') postponeEmailAsk();
    this.pending = null;
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  /** Eski hesaba e-posta sorusu: zorunlu değil. Telefonda klavye kendiliğinden açılmasın diye alana odaklanmaz. */
  askEmail(): void {
    this.onDone = null;
    this.mode = 'email';
    this.note = '';
    this.error = '';
    this.emailValue = '';
    this.busy = false;
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render('');
    this.el.querySelector<HTMLButtonElement>('[data-lg="later"]')?.focus();
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
    if (this.mode === 'email') return this.submitEmail();
    if (this.mode === 'verify') return this.submitCode();
    const name = cleanName(this.field('acc')?.value ?? '');
    const pass = this.field('pass')?.value ?? '';
    const nameErr = nameError(name);
    if (nameErr) return this.fail(nameErr);
    const email = this.field('email')?.value ?? '';
    if (this.mode === 'register' && !validEmail(email)) return this.fail(apiMessage('email_bad'));
    if (pass.length < PASS_MIN) return this.fail(L(`Şifre en az ${PASS_MIN} karakter olmalı`, `The password must be at least ${PASS_MIN} characters`));
    if (this.mode !== 'login' && pass !== (this.field('pass2')?.value ?? '')) return this.fail(L('Şifreler aynı değil', 'The passwords do not match'));
    const code = this.field('code')?.value ?? '';
    if (this.mode === 'recover' && code.replace(/[^a-z0-9]/gi, '').length < 12) return this.fail(L('Kurtarma kodu 12 karakter', 'The recovery code has 12 characters'));
    if (this.mode === 'register' && !this.field('accept')?.checked) return this.fail(apiMessage('not_accepted'));
    this.setBusy(true);
    try {
      if (this.mode === 'login') {
        this.result = { acc: await login(name, pass), created: false };
        this.finish();
        return;
      }
      if (this.mode === 'register') {
        await requestEmailCode(email, name);
        this.showVerify({ email, news: !!this.field('news')?.checked, name, pass });
        return;
      }
      this.showRecovery(await recoverAccount(name, code, pass), false, name);
    } catch (e) {
      this.fail((e as Error).message);
    }
  }

  /** Kurtarma kodu bir kez gösterilir. */
  private showRecovery(r: { account: Account; recoveryCode: string }, created: boolean, name: string): void {
    this.result = { acc: r.account, created };
    this.code = r.recoveryCode;
    this.copied = false;
    this.mode = 'code';
    this.busy = false;
    this.render(name);
    this.el.querySelector<HTMLButtonElement>('[data-lg="copy"]')?.focus();
  }

  private async submitEmail(): Promise<void> {
    const email = this.field('email')?.value ?? '';
    if (!validEmail(email)) return this.fail(apiMessage('email_bad'));
    if (!this.field('accept')?.checked) return this.fail(apiMessage('not_accepted'));
    this.setBusy(true);
    try {
      await requestEmailCode(email);
      this.showVerify({ email, news: !!this.field('news')?.checked });
    } catch (e) {
      this.fail((e as Error).message);
    }
  }

  private showVerify(p: NonNullable<LoginBox['pending']>): void {
    this.pending = p;
    this.mode = 'verify';
    this.note = '';
    this.error = '';
    this.busy = false;
    this.render('');
    this.field('code')?.focus();
  }

  private async submitCode(): Promise<void> {
    const p = this.pending;
    if (!p) return;
    const code = (this.field('code')?.value ?? '').replace(/\D/g, '');
    if (code.length !== 6) return this.fail(L('Kod 6 haneli', 'The code has 6 digits'));
    this.setBusy(true);
    try {
      if (p.pass === undefined) {
        await saveEmail(p.email, p.news, code);
        this.close();
        return;
      }
      const r = await register(p.name!, p.pass, p.email, p.news, code);
      this.pending = null;
      this.showRecovery(r, true, p.name!);
    } catch (e) {
      this.fail((e as Error).message);
    }
  }

  private async resend(): Promise<void> {
    const p = this.pending;
    if (!p || this.busy) return;
    this.setBusy(true);
    try {
      await requestEmailCode(p.email, p.name);
      this.setBusy(false);
      this.el.querySelector('.login-err')?.remove();
      const note = this.el.querySelector<HTMLElement>('.mm-note');
      if (note) {
        note.textContent = L('Yeni kod gönderildi. Eski kod artık geçmez.', 'A new code has been sent. The old code no longer works.');
        note.classList.remove('hidden');
      }
    } catch (e) {
      this.fail((e as Error).message);
    }
  }

  /** Kod ekranından forma dön: adres ve ad kalır, şifre ve onay yeniden istenir. */
  private back(): void {
    const p = this.pending;
    if (!p || this.busy) return;
    this.pending = null;
    this.emailValue = p.email;
    this.mode = p.pass === undefined ? 'email' : 'register';
    this.error = '';
    this.render(p.name ?? '');
    this.focusFirst();
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
    if (!r) return;
    this.onDone?.(r.acc, r.created);
    if (shouldAskEmail()) this.askEmail();
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
    if (m === 'verify') {
      this.el.innerHTML = `
        <form class="login-card" role="dialog" aria-modal="true" novalidate>
          <div class="login-head"><b>${L('E-postanı doğrula', 'Verify your email')}</b></div>
          <p class="small">${codeSentText(this.pending?.email ?? '')}</p>
          <div class="mm-note hidden"></div>
          ${codeInput()}
          <button type="submit" class="primary wide">${this.pending?.pass === undefined ? L('Doğrula', 'Verify') : L('Doğrula ve hesabı aç', 'Verify and create account')}</button>
          <div class="login-links">
            <button type="button" class="link" data-lg="back">‹ ${L('Geri', 'Back')}</button>
            <button type="button" class="link" data-lg="resend">${L('Yeni kod gönder', 'Send a new code')}</button>
          </div>
        </form>`;
      return;
    }
    if (m === 'email') {
      this.el.innerHTML = `
        <form class="login-card" role="dialog" aria-modal="true" novalidate>
          <div class="login-head"><b>${L('E-posta adresini ekle', 'Add your email address')}</b></div>
          <p class="muted small">${L(
            'Şifreni ve kurtarma kodunu kaybedersen hesabının sana ait olduğunu doğrulamamıza yardımcı olur; önemli konularda da sana ulaşabiliriz. Zorunlu değil, istersen sonra Profil’den ekleyebilirsin.',
            'If you lose your password and recovery code, it helps us confirm the account is yours, and we can reach you about important matters. It is optional, and you can add it later in your Profile.',
          )}</p>
          ${emailInput(this.emailValue)}
          ${consentBoxes(true)}
          <button type="submit" class="primary wide">${L('Kod gönder', 'Send code')}</button>
          <button type="button" data-lg="later">${L('Şimdi değil', 'Not now')}</button>
        </form>`;
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
        ${m === 'register' ? emailInput(this.emailValue) : ''}
        ${m === 'recover' ? `<input name="code" maxlength="20" autocomplete="off" spellcheck="false" placeholder="${L('Kurtarma kodu (ABCD-EFGH-JKLM)', 'Recovery code (ABCD-EFGH-JKLM)')}">` : ''}
        <input name="pass" type="password" maxlength="${PASS_MAX}" autocomplete="${newPass ? 'new-password' : 'current-password'}" placeholder="${newPass ? L('Yeni şifre (en az 6 karakter)', 'New password (at least 6 characters)') : L('Şifre', 'Password')}">
        ${newPass ? `<input name="pass2" type="password" maxlength="${PASS_MAX}" autocomplete="new-password" placeholder="${L('Şifre (tekrar)', 'Password (again)')}">` : ''}
        ${m === 'register' ? consentBoxes(true) : ''}
        ${this.error ? `<div class="login-err">${esc(this.error)}</div>` : ''}
        <button type="submit" class="primary wide" ${this.busy ? 'disabled' : ''}>${this.busy ? L('Bekle…', 'Please wait…') : m === 'login' ? L('Giriş', 'Log in') : m === 'register' ? L('Kod gönder', 'Send code') : L('Şifreyi yenile', 'Reset password')}</button>
        ${m === 'login' ? `<button type="button" class="link" data-lg="recover">${L('Şifremi unuttum', 'Forgot password')}</button>` : ''}
        ${m === 'recover' ? `<button type="button" class="link" data-lg="login">‹ ${L('Girişe dön', 'Back to log in')}</button>` : ''}
      </form>`;
  }
}
