// Geri bildirim penceresi: görüş ve öneri, "Ben bu oyuna Steam'de _ $ veririm" ve gönderen adı (zorunlu; hesap gerekmez).
// Gönderilen geri bildirim geliştiricinin Google Formu'na gider (oyuncu formu görmez; yanıtlar formun "Yanıtlar"
// sekmesinde). Gönderilemezse bu cihazda saklanır (warsim.feedback.v1) ve oyun bir sonraki açılışta yeniden dener.

import { NAME_MAX } from '../persist';
import { $, esc } from './dom';
import { L } from '../i18n';

/** Google Formu: yanıt adresi ve soruların alan kimlikleri (formun sayfasından). */
const FORM = {
  action: 'https://docs.google.com/forms/d/e/1FAIpQLSd0aiDv4VFn00-Qzycad3bG4pObjaSC1gV0Cyt0Cu2rW-IiBQ/formResponse',
  name: 'entry.1906610939',
  message: 'entry.1709181954',
  price: 'entry.625710882',
};
const OUTBOX_KEY = 'warsim.feedback.v1';
const MESSAGE_MAX = 2000;

interface FeedbackEntry {
  name: string;
  message: string;
  /** "Ben bu oyuna Steam'de _ $ veririm" (boş bırakılabilir). */
  price: number | null;
  sentAt: string;
}

/**
 * Forma gönder. Google başka siteden gelen isteğin cevabını göstermez (no-cors): ağ hatası olmadıysa ulaştı sayılır.
 */
async function post(e: FeedbackEntry): Promise<void> {
  const body = new URLSearchParams({
    [FORM.name]: e.name,
    [FORM.message]: e.message,
    [FORM.price]: e.price === null ? '' : String(e.price),
  });
  await fetch(FORM.action, { method: 'POST', mode: 'no-cors', body });
}

function readOutbox(): FeedbackEntry[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as FeedbackEntry[];
  } catch {
    return [];
  }
}

function writeOutbox(list: FeedbackEntry[]): void {
  try {
    if (list.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-50)));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    // Depolama kapalıysa yapacak bir şey yok
  }
}

function keepLocally(e: FeedbackEntry): void {
  writeOutbox([...readOutbox(), e]);
}

/** Önceden gönderilemeyip saklananları sessizce yeniden gönder (gidemeyen kalır). */
async function flushOutbox(): Promise<void> {
  const left: FeedbackEntry[] = [];
  for (const e of readOutbox()) {
    try {
      await post(e);
    } catch {
      left.push(e);
    }
  }
  writeOutbox(left);
}

export class FeedbackBox {
  isOpen = false;
  private el = $('feedback');
  private name = '';
  private message = '';
  private price = '';
  private error = '';
  private done = '';
  private sending = false;

  constructor() {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el) {
        this.close();
        return;
      }
      const act = t.closest<HTMLElement>('[data-fb]')?.dataset.fb;
      if (act === 'close') this.close();
      else if (act === 'send') void this.send();
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
    // Önceki oturumda gönderilemeyenler
    if (navigator.onLine !== false) void flushOutbox();
  }

  /** defaultName: hesap ya da komutan adı (boş alanı doldurmak için). */
  open(defaultName = ''): void {
    this.isOpen = true;
    if (!this.name) this.name = defaultName;
    this.error = '';
    this.el.classList.remove('hidden');
    this.render();
    this.el.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  private async send(): Promise<void> {
    if (this.sending || this.done) return;
    const name = this.name.trim();
    const message = this.message.trim();
    const p = this.price.trim().replace(',', '.');
    const price = p === '' ? null : Number(p);
    if (!name) this.error = L('Göndermeden önce gönderen adını yaz.', 'Enter your name before sending.');
    else if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1e6)) this.error = L('Fiyat 0 ile 1.000.000 arasında bir sayı olmalı.', 'The price must be a number between 0 and 1,000,000.');
    else if (!message && price === null) this.error = L('Bir görüş yaz ya da oyuna vereceğin fiyatı gir.', 'Write some feedback or enter the price you would pay.');
    if (this.error) {
      this.render();
      this.el.querySelector<HTMLInputElement>(name ? 'textarea' : 'input[name="fbname"]')?.focus();
      return;
    }
    const entry: FeedbackEntry = { name: name.slice(0, NAME_MAX * 2), message: message.slice(0, MESSAGE_MAX), price, sentAt: new Date().toISOString() };
    this.sending = true;
    this.render();
    try {
      await post(entry);
      this.done = L('Teşekkürler! Geri bildirimin bize ulaştı.', 'Thank you! Your feedback has reached us.');
      void flushOutbox();
    } catch {
      keepLocally(entry);
      this.error = L('Şu an gönderilemedi; bu cihazda saklandı. Biraz sonra yeniden dene.', 'Could not send right now; it is kept on this device. Try again a little later.');
    }
    this.sending = false;
    this.render();
  }

  private render(): void {
    if (!this.isOpen) return;
    const body = this.done
      ? `<div class="fb-done">${esc(this.done)}</div>
         <div class="fb-actions"><button data-fb="again">${L('Yeni geri bildirim', 'New feedback')}</button><button class="primary" data-fb="close">${L('Kapat', 'Close')}</button></div>`
      : `<label class="mm-label" for="fb-msg">${L('Görüşün ve önerin', 'Your thoughts and suggestions')}</label>
         <textarea id="fb-msg" name="fbmsg" maxlength="${MESSAGE_MAX}" rows="5" placeholder="${L('Neyi beğendin, neyi değiştirelim, nerede hata gördün?', 'What did you like, what should we change, where did you spot a bug?')}">${esc(this.message)}</textarea>
         <label class="fb-price" for="fb-price">${L('Ben bu oyuna Steam’de', 'I would pay')}
           <input id="fb-price" name="fbprice" type="number" inputmode="decimal" min="0" step="1" placeholder="…" value="${esc(this.price)}">
           ${L('$ veririm', '$ for this game on Steam')}</label>
         <label class="mm-label" for="fb-name">${L('Gönderen adı', 'Your name')} <span class="fb-req">${L('zorunlu', 'required')}</span></label>
         <input id="fb-name" name="fbname" maxlength="${NAME_MAX * 2}" autocomplete="nickname" placeholder="${L('Adın ya da takma adın', 'Your name or nickname')}" value="${esc(this.name)}">
         ${this.error ? `<div class="fb-err">${esc(this.error)}</div>` : ''}
         <div class="fb-actions"><button data-fb="close">${L('Vazgeç', 'Cancel')}</button><button class="primary" data-fb="send" ${this.sending ? 'disabled' : ''}>${this.sending ? L('Gönderiliyor…', 'Sending…') : L('Gönder', 'Send')}</button></div>`;
    this.el.innerHTML = `<div class="fb-card">
      <div class="news-head"><h2>${L('Geri bildirim', 'Feedback')}</h2><button class="icon" data-fb="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
      <p class="muted small">${L('Hesap açman gerekmez; yalnız gönderen adını yazman yeter.', 'No account needed; just enter your name.')}</p>
      ${body}
    </div>`;
  }
}
