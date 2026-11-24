// Geri bildirim penceresi (e-postalı hesap gerekir; ad hesaptan gelir, değiştirilemez): önce tür seçilir (hata raporu ya da
// öneri), "Gönder"e basınca "İncelensin mi?" sorulur. İncelenen mesaj doğrulanır ya da kabul edilirse katkı puanı kazandırır
// (2026-11-24; kurallar shared.ts feedbackStep, sonuç e-postayla ve Profil'de). Gönderilen, sunucudan warsimbox@gmail.com
// kutusuna e-posta olarak gider. Altta destekçi paketine kısa bir bağlantı (paket açıksa). Eski "Steam'de _ $ veririm" sorusu
// kaldırıldı. Bağlantı yoksa hata gösterilir; yazılanlar pencerede kalır.

import { currentAccount } from '../persist';
import { api, apiMessage } from '../net/api';
import { FEEDBACK_MAX, type FeedbackKind } from '../net/shared';
import { $, esc, focusField } from './dom';
import { L, LANG } from '../i18n';
import { SUPPORT_ON } from './support';

/** Eski sürümde gönderilemeyen geri bildirimlerin deposu: artık kullanılmaz. */
const OLD_OUTBOX_KEY = 'warsim.feedback.v1';

export class FeedbackBox {
  isOpen = false;
  private el = $('feedback');
  private message = '';
  private kind: FeedbackKind | null = null;
  /** "Gönder"e basıldı: inceleme sorusu gösteriliyor. */
  private asking = false;
  private error = '';
  private done = '';
  private sending = false;

  /** login: giriş penceresini aç; addEmail: e-posta ekleme penceresini aç (ikisi kapanınca oyun refresh çağırır); support: destekçi paketi. */
  constructor(private readonly actions: { login: () => void; addEmail: () => void; support: () => void }) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el) {
        this.close();
        return;
      }
      const b = t.closest<HTMLElement>('[data-fb]');
      const act = b?.dataset.fb;
      if (act === 'close') this.close();
      else if (act === 'send') this.ask();
      else if (act === 'review') void this.send(true);
      else if (act === 'plain') void this.send(false);
      else if (act === 'back') {
        this.asking = false;
        this.render();
      } else if (act === 'kind') {
        this.kind = b!.dataset.k === 'bug' ? 'bug' : 'idea';
        if (this.error) this.error = '';
        this.render();
      } else if (act === 'login') this.actions.login();
      else if (act === 'email') this.actions.addEmail();
      else if (act === 'support') {
        this.close();
        this.actions.support();
      } else if (act === 'again') {
        this.done = '';
        this.message = '';
        this.kind = null;
        this.render();
      }
    });
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLTextAreaElement;
      if (t.name === 'fbmsg') this.message = t.value;
      if (this.error) {
        this.error = '';
        this.el.querySelector('.fb-err')?.remove();
      }
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
    try {
      localStorage.removeItem(OLD_OUTBOX_KEY);
    } catch {
      /* depolama kapalı */
    }
  }

  open(): void {
    this.isOpen = true;
    this.error = '';
    this.asking = false;
    // Gönderilmişse yeni geri bildirim için temiz form
    if (this.done) {
      this.done = '';
      this.message = '';
      this.kind = null;
    }
    this.el.classList.remove('hidden');
    this.render();
    focusField(this.el.querySelector<HTMLElement>('textarea'));
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

  /** "Gönder": tür ve metin varsa inceleme sorulur. */
  private ask(): void {
    if (this.sending || this.done) return;
    if (!this.kind) this.error = L('Önce mesajın türünü seç: hata raporu mu, öneri mi?', 'First choose the type: a bug report or a suggestion?');
    else if (!this.message.trim()) this.error = apiMessage('feedback_empty');
    if (this.error) {
      this.render();
      if (this.kind) focusField(this.el.querySelector<HTMLElement>('textarea'));
      return;
    }
    this.asking = true;
    this.render();
  }

  private async send(review: boolean): Promise<void> {
    if (this.sending || this.done || !this.kind) return;
    this.sending = true;
    this.render();
    try {
      const r = await api<{ ok: boolean; review?: boolean }>('POST', '/feedback', { message: this.message.trim(), kind: this.kind, review, lang: LANG });
      this.done = r.review
        ? L('Teşekkürler! Mesajın incelemede. Sonucu e-postayla ve Profil’inde görürsün.', 'Thank you! Your message is under review. You will see the result by email and in your Profile.')
        : L('Teşekkürler! Geri bildirimin bize ulaştı.', 'Thank you! Your feedback has reached us.');
      this.asking = false;
    } catch (e) {
      this.error = (e as Error).message;
      this.asking = false;
    }
    this.sending = false;
    this.render();
  }

  private render(): void {
    if (!this.isOpen) return;
    const acc = currentAccount();
    const canWrite = acc?.hasEmail === true;
    const sup = SUPPORT_ON
      ? `<p class="fb-sup">${L('Oyunu sevdiysen destekçi paketiyle gelişmesine katkı verebilirsin.', 'If you enjoy the game, you can help it grow with the supporter pack.')} <button type="button" class="link" data-fb="support">${L('Destekçi paketi ›', 'Supporter pack ›')}</button></p>`
      : '';
    const kindBtn = (k: FeedbackKind, label: string, hint: string) =>
      `<button type="button" class="fb-kind ${this.kind === k ? 'active' : ''}" data-fb="kind" data-k="${k}" aria-pressed="${this.kind === k}"><b>${label}</b><span>${hint}</span></button>`;
    let body: string;
    if (this.done) {
      body = `<div class="fb-done">${esc(this.done)}</div>
         <div class="fb-actions"><button data-fb="again">${L('Yeni geri bildirim', 'New feedback')}</button><button class="primary" data-fb="close">${L('Kapat', 'Close')}</button></div>`;
    } else if (!canWrite) {
      body = `<div class="fb-lock"><span>${acc
        ? L('Hata raporu ve öneri göndermek için hesabına e-posta ekle.', 'Add an email to your account to send bug reports and suggestions.')
        : L('Hata raporu ve öneri göndermek için e-postalı bir hesapla giriş yap.', 'Log in with an account that has an email to send bug reports and suggestions.')}</span>
         <button type="button" data-fb="${acc ? 'email' : 'login'}">${acc ? L('E-posta ekle', 'Add email') : L('Giriş yap', 'Log in')}</button></div>
         <div class="fb-actions"><button data-fb="close">${L('Kapat', 'Close')}</button></div>`;
    } else if (this.asking) {
      // Puan miktarları burada söylenmez (2026-11-24 kullanıcı kararı): yalnız ödül olduğu
      const what = this.kind === 'bug'
        ? L('Hata doğrulanırsa', 'If the bug is verified')
        : L('Önerin kabul edilirse', 'If your suggestion is accepted');
      body = `<div class="fb-ask"><h3>${L('İncelensin mi?', 'Should we review it?')}</h3>
         <p>${what}${L(' katkı puanı ve rütbe rozeti kazanırsın. Sonucu e-postayla ve Profil’inde görürsün.', ', you earn contribution points and a rank badge. You will see the result by email and in your Profile.')}</p></div>
         ${this.error ? `<div class="fb-err">${esc(this.error)}</div>` : ''}
         <div class="fb-actions"><button data-fb="back">‹ ${L('Geri', 'Back')}</button><button data-fb="plain" ${this.sending ? 'disabled' : ''}>${L('Hayır, yalnız gönder', 'No, just send')}</button><button class="primary" data-fb="review" ${this.sending ? 'disabled' : ''}>${this.sending ? L('Gönderiliyor…', 'Sending…') : L('Evet, incelensin', 'Yes, review it')}</button></div>`;
    } else {
      body = `<div class="fb-kinds" role="group" aria-label="${L('Mesajın türü', 'Message type')}">
           ${kindBtn('bug', L('Hata raporu', 'Bug report'), L('Bir şey bozuk ya da yanlış çalışıyor', 'Something is broken or works wrong'))}
           ${kindBtn('idea', L('Öneri', 'Suggestion'), L('Bir fikrin ya da isteğin var', 'You have an idea or a wish'))}
         </div>
         <label class="mm-label" for="fb-msg">${this.kind === 'bug' ? L('Ne oldu, nerede gördün?', 'What happened, and where?') : this.kind === 'idea' ? L('Önerin', 'Your suggestion') : L('Mesajın', 'Your message')}</label>
         <textarea id="fb-msg" name="fbmsg" maxlength="${FEEDBACK_MAX}" rows="5" placeholder="${this.kind === 'bug'
           ? L('Ne yaparken oldu, ne bekliyordun, ne oldu? Telefon mu bilgisayar mı?', 'What were you doing, what did you expect, what happened? Phone or computer?')
           : L('Neyi beğendin, neyi değiştirelim, ne eklenmeli?', 'What did you like, what should we change, what should we add?')}">${esc(this.message)}</textarea>
         <p class="muted small">${L('Gönderen', 'From')}: <b>${esc(acc!.name)}</b></p>
         ${this.error ? `<div class="fb-err">${esc(this.error)}</div>` : ''}
         <div class="fb-actions"><button data-fb="close">${L('Vazgeç', 'Cancel')}</button><button class="primary" data-fb="send">${L('Gönder', 'Send')}</button></div>`;
    }
    this.el.innerHTML = `<div class="fb-card">
      <div class="news-head"><h2>${L('Geri bildirim', 'Feedback')}</h2><button class="icon" data-fb="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
      ${body}
      ${sup}
    </div>`;
  }
}
