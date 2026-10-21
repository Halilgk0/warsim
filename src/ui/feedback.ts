// Geri bildirim penceresi: görüş ve öneri, "Ben bu oyuna Steam'de _ $ veririm" ve gönderen adı (zorunlu; hesap gerekmez).
// Alıcı adres derlemede VITE_FEEDBACK_URL ile verilir (JSON POST). Verilmemişse ya da gönderim başarısızsa
// geri bildirim bu cihazda saklanır (warsim.feedback.v1).

import { NAME_MAX } from '../persist';
import { $, esc } from './dom';

const ENDPOINT = (import.meta.env.VITE_FEEDBACK_URL as string | undefined) ?? '';
const OUTBOX_KEY = 'warsim.feedback.v1';
const MESSAGE_MAX = 2000;

interface FeedbackEntry {
  name: string;
  message: string;
  /** "Ben bu oyuna Steam'de _ $ veririm" (boş bırakılabilir). */
  price: number | null;
  sentAt: string;
}

function keepLocally(e: FeedbackEntry): void {
  try {
    const list = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as FeedbackEntry[];
    list.push(e);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // Depolama kapalıysa yapacak bir şey yok
  }
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
    if (!name) this.error = 'Göndermeden önce gönderen adını yaz.';
    else if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1e6)) this.error = 'Fiyat 0 ile 1.000.000 arasında bir sayı olmalı.';
    else if (!message && price === null) this.error = 'Bir görüş yaz ya da oyuna vereceğin fiyatı gir.';
    if (this.error) {
      this.render();
      this.el.querySelector<HTMLInputElement>(name ? 'textarea' : 'input[name="fbname"]')?.focus();
      return;
    }
    const entry: FeedbackEntry = { name: name.slice(0, NAME_MAX * 2), message: message.slice(0, MESSAGE_MAX), price, sentAt: new Date().toISOString() };
    if (!ENDPOINT) {
      keepLocally(entry);
      this.done = 'Teşekkürler! Geri bildirimin kaydedildi.';
      this.render();
      return;
    }
    this.sending = true;
    this.render();
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ game: 'WarSim', ...entry }),
      });
      if (!res.ok) throw new Error(String(res.status));
      this.done = 'Teşekkürler! Geri bildirimin bize ulaştı.';
    } catch {
      keepLocally(entry);
      this.error = 'Şu an gönderilemedi; bu cihazda saklandı. Biraz sonra yeniden dene.';
    }
    this.sending = false;
    this.render();
  }

  private render(): void {
    if (!this.isOpen) return;
    const body = this.done
      ? `<div class="fb-done">${esc(this.done)}</div>
         <div class="fb-actions"><button data-fb="again">Yeni geri bildirim</button><button class="primary" data-fb="close">Kapat</button></div>`
      : `<label class="mm-label" for="fb-msg">Görüşün ve önerin</label>
         <textarea id="fb-msg" name="fbmsg" maxlength="${MESSAGE_MAX}" rows="5" placeholder="Neyi beğendin, neyi değiştirelim, nerede hata gördün?">${esc(this.message)}</textarea>
         <label class="fb-price" for="fb-price">Ben bu oyuna Steam’de
           <input id="fb-price" name="fbprice" type="number" inputmode="decimal" min="0" step="1" placeholder="…" value="${esc(this.price)}">
           $ veririm</label>
         <label class="mm-label" for="fb-name">Gönderen adı <span class="fb-req">zorunlu</span></label>
         <input id="fb-name" name="fbname" maxlength="${NAME_MAX * 2}" autocomplete="nickname" placeholder="Adın ya da takma adın" value="${esc(this.name)}">
         ${this.error ? `<div class="fb-err">${esc(this.error)}</div>` : ''}
         <div class="fb-actions"><button data-fb="close">Vazgeç</button><button class="primary" data-fb="send" ${this.sending ? 'disabled' : ''}>${this.sending ? 'Gönderiliyor…' : 'Gönder'}</button></div>`;
    this.el.innerHTML = `<div class="fb-card">
      <div class="news-head"><h2>Geri bildirim</h2><button class="icon" data-fb="close" title="Kapat (Esc)">✕</button></div>
      <p class="muted small">Hesap açman gerekmez; yalnız gönderen adını yazman yeter.</p>
      ${body}
    </div>`;
  }
}
