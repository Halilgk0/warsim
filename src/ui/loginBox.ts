// Giriş penceresi: yalnız bir ad. Aynı adla tekrar girilir; yeni adla girilirse hesap oluşturulur.

import { type Account, NAME_MAX, cleanName, currentAccount, login, nameError } from '../persist';
import { $, esc } from './dom';

export class LoginBox {
  isOpen = false;
  private el = $('loginbox');
  private error = '';
  private onDone: ((acc: Account, created: boolean) => void) | null = null;

  constructor() {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const act = t.closest<HTMLElement>('[data-lg]')?.dataset.lg;
      if (act === 'close') this.close();
      else if (act === 'submit') this.submit();
      else if (act === 'pick') {
        const input = this.input();
        if (input) input.value = t.closest<HTMLElement>('[data-lg]')!.dataset.name ?? '';
        this.submit();
      }
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
      else if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
  }

  private input(): HTMLInputElement | null {
    return this.el.querySelector<HTMLInputElement>('input[name="acc"]');
  }

  open(onDone?: (acc: Account, created: boolean) => void): void {
    this.onDone = onDone ?? null;
    this.error = '';
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.render('');
    this.input()?.focus();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  private submit(): void {
    const v = this.input()?.value ?? '';
    const err = nameError(v);
    if (err) {
      this.error = err;
      this.render(v);
      this.input()?.focus();
      return;
    }
    const { account, created } = login(cleanName(v));
    this.close();
    this.onDone?.(account, created);
  }

  private render(value: string): void {
    const cur = currentAccount();
    this.el.innerHTML = `
      <div class="login-card">
        <div class="login-head"><b>Giriş yap</b><button class="icon" data-lg="close" title="Kapat (Esc)">✕</button></div>
        <p class="muted small">Bir ad yaz; şifre yok. Daha sonra aynı adla girip kayıtlarına ulaşırsın. Yeni bir adla girersen hesap oluşturulur.</p>
        <input name="acc" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="Kullanıcı adı" value="${esc(value || cur?.name || '')}">
        ${this.error ? `<div class="login-err">${esc(this.error)}</div>` : ''}
        <button class="primary wide" data-lg="submit">Giriş</button>
      </div>`;
  }
}
