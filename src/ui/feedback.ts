// Geri bildirim penceresi: görüş ve öneri (e-postalı hesap gerekir) ve "Ben bu oyuna Steam'de _ $ veririm" (misafire de açık;
// misafir komutan adı yazar, hesapta hesabın adı kullanılır). Gönderilen, sunucudan warsimbox@gmail.com kutusuna e-posta
// olarak gider. Bağlantı yoksa hata gösterilir; yazılanlar pencerede kalır.

import { currentAccount, NAME_MAX } from '../persist';
import { api, apiMessage } from '../net/api';
import { FEEDBACK_MAX, PRICE_MAX, nameProblem } from '../net/shared';
import { $, esc, focusField } from './dom';
import { L, LANG } from '../i18n';

/** Eski sürümde gönderilemeyen geri bildirimlerin deposu: artık kullanılmaz. */
const OLD_OUTBOX_KEY = 'warsim.feedback.v1';

export class FeedbackBox {
  isOpen = false;
  private el = $('feedback');
  private name = '';
  private message = '';
  private price = '';
  private error = '';
  private done = '';
  private sending = false;

  /** login: giriş penceresini aç; addEmail: e-posta ekleme penceresini aç. İkisi kapanınca oyun refresh çağırır. */
  constructor(private readonly actions: { login: () => void; addEmail: () => void }) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el) {
        this.close();
        return;
      }
      const act = t.closest<HTMLElement>('[data-fb]')?.dataset.fb;
      if (act === 'close') this.close();
      else if (act === 'send') void this.send();
      else if (act === 'login') this.actions.login();
      else if (act === 'email') this.actions.addEmail();
      else if (act === 'again') {
        this.done = '';
        this.message = '';
        this.price = '';
        this.render();
      }
    });
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (t.name === 'fbname') this.name = t.value;
      else if (t.name === 'fbmsg') this.message = t.value;
      else if (t.name === 'fbprice') this.price = t.value;
      if (this.error) {
        this.error = '';
        this.el.querySelector('.fb-err')?.remove();
      }
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      else if (e.key === 'Enter' && (e.target as HTMLElement).matches('input')) void this.send();
      e.stopPropagation();
    });
    try {
      localStorage.removeItem(OLD_OUTBOX_KEY);
    } catch {
      /* depolama kapalı */
    }
  }

  /** defaultName: komutan adı (misafirde boş alanı doldurmak için). */
  open(defaultName = ''): void {
    this.isOpen = true;
    if (!this.name) this.name = defaultName;
    this.error = '';
    // Gönderilmişse yeni geri bildirim için temiz form
    if (this.done) {
      this.done = '';
      this.message = '';
      this.price = '';
    }
    this.el.classList.remove('hidden');
    this.render();
    focusField(this.el.querySelector<HTMLElement>('textarea, input'));
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  /** Giriş ya da e-posta ekleme bitince: pencere yeni hesap durumuna göre çizilsin (yazılanlar kalır). */
  refresh(): void {
    this.error = '';
    this.render();
  }

  private async send(): Promise<void> {
    if (this.sending || this.done) return;
    const acc = currentAccount();
    const canWrite = acc?.hasEmail === true;
    const name = this.name.trim();
    const message = canWrite ? this.message.trim() : '';
    const p = this.price.trim().replace(',', '.');
    const price = p === '' ? null : Number(p);
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > PRICE_MAX)) this.error = apiMessage('bad_price');
    else if (!message && price === null) this.error = canWrite ? apiMessage('feedback_empty') : L('Oyuna vereceğin fiyatı gir.', 'Enter the price you would pay.');
    else if (!acc) {
      const problem = nameProblem(name);
      if (problem) this.error = L('Göndermek için komutan adını yaz (en az 2 karakter; harf, rakam, boşluk, - _ .).', 'Enter your commander name to send (at least 2 characters; letters, digits, spaces, - _ .).');
    }
    if (this.error) {
      this.render();
      focusField(this.el.querySelector<HTMLElement>(this.error.includes(L('komutan', 'commander')) ? 'input[name="fbname"]' : 'textarea, input[name="fbprice"]'));
      return;
    }
    this.sending = true;
    this.render();
    try {
      await api('POST', '/feedback', { message, price, name: acc ? undefined : name, lang: LANG });
      this.done = L('Teşekkürler! Geri bildirimin bize ulaştı.', 'Thank you! Your feedback has reached us.');
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.sending = false;
    this.render();
  }

  private render(): void {
    if (!this.isOpen) return;
    const acc = currentAccount();
    const canWrite = acc?.hasEmail === true;
    const write = canWrite
      ? `<label class="mm-label" for="fb-msg">${L('Görüşün ve önerin', 'Your thoughts and suggestions')}</label>
         <textarea id="fb-msg" name="fbmsg" maxlength="${FEEDBACK_MAX}" rows="5" placeholder="${L('Neyi beğendin, neyi değiştirelim, nerede hata gördün?', 'What did you like, what should we change, where did you spot a bug?')}">${esc(this.message)}</textarea>`
      : `<div class="fb-lock"><span>${acc
        ? L('Görüş ve öneri göndermek için hesabına e-posta ekle.', 'Add an email to your account to send feedback and suggestions.')
        : L('Görüş ve öneri göndermek için e-postalı bir hesapla giriş yap.', 'Log in with an account that has an email to send feedback and suggestions.')}</span>
         <button type="button" data-fb="${acc ? 'email' : 'login'}">${acc ? L('E-posta ekle', 'Add email') : L('Giriş yap', 'Log in')}</button></div>`;
    const who = acc
      ? `<p class="muted small">${L('Gönderen', 'From')}: <b>${esc(acc.name)}</b></p>`
      : `<label class="mm-label" for="fb-name">${L('Komutan adı', 'Commander name')} <span class="fb-req">${L('zorunlu', 'required')}</span></label>
         <input id="fb-name" name="fbname" maxlength="${NAME_MAX}" autocomplete="nickname" placeholder="${L('Komutan adın', 'Your commander name')}" value="${esc(this.name)}">`;
    const body = this.done
      ? `<div class="fb-done">${esc(this.done)}</div>
         <div class="fb-actions"><button data-fb="again">${L('Yeni geri bildirim', 'New feedback')}</button><button class="primary" data-fb="close">${L('Kapat', 'Close')}</button></div>`
      : `${write}
         <label class="fb-price" for="fb-price">${L('Ben bu oyuna Steam’de', 'I would pay')}
           <input id="fb-price" name="fbprice" type="number" inputmode="decimal" min="0" step="1" placeholder="…" value="${esc(this.price)}">
           ${L('$ veririm', '$ for this game on Steam')}</label>
         ${who}
         ${this.error ? `<div class="fb-err">${esc(this.error)}</div>` : ''}
         <div class="fb-actions"><button data-fb="close">${L('Vazgeç', 'Cancel')}</button><button class="primary" data-fb="send" ${this.sending ? 'disabled' : ''}>${this.sending ? L('Gönderiliyor…', 'Sending…') : L('Gönder', 'Send')}</button></div>`;
    this.el.innerHTML = `<div class="fb-card">
      <div class="news-head"><h2>${L('Geri bildirim', 'Feedback')}</h2><button class="icon" data-fb="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
      ${body}
    </div>`;
  }
}
