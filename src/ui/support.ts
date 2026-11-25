// Destekçi paketi penceresi (2026-11-21; çelik görünüm, ana menünün ve profilin üstünde açılır). 2026-11-25'ten beri üç sabit
// fiyatlı seviye (3, 7, 10 $; birikir, üste geçerken fark ödenir) yan yana karşılaştırılır; oyuncu seviyeyi seçer, tutarı sunucu
// hesaplar (shared.ts levelCost), sunucu Polar'da ödeme oturumu açar, ödeme Polar'ın gömülü sayfasında oyunun üstünde yapılır (embed): kart alanları Polar'ın
// çerçevesinde kalır, kart bilgisi oyuna ve sunucuya gelmez. Ödeme bitince Polar sunucuya bildirir (worker supportWebhook);
// pencere kapanır, hesap yenilenir, rozet gelince teşekkür penceresi açılır (yeni sekmede ödenirse sekmeye dönünce). Rozetler ödemeden önce gösterilmez: yerlerinde kilitli "Özel rozet" durur.
// Google Play uygulamasında (Play kuralı) ve eski adreste gösterilmez (SUPPORT_ON).

import type { Game } from '../game';
import { L, LANG } from '../i18n';
import { api, OLD_SITE } from '../net/api';
import { EARLY_ACCESS_TIER, LEVEL_PRICES, extraSlots, feedbackPerDay, levelCost, slotsFor, supportTier } from '../net/shared';
import { currentAccount, refreshSession } from '../persist';
import { IN_PLAY_APP } from '../platform';
import { legalUrl } from '../yasal/liste';
import { badgeName, badgeSvg } from './badges';
import { esc } from './dom';

/**
 * Polar hesabı ödeme almaya açık mı. 2026-11-24: Polar onayladı, canlıda 1 $ ödeme ve bildirim denendi; paket herkese açık.
 * Kayıt yeri kuralı (3 yer) paketten bağımsız olarak geçerli.
 */
const PAYMENTS_LIVE = true;

/**
 * Herkese açılmadan canlıda deneme (2026-11-24, Polar onaylandı): adrese `?destek=1` eklenen tarayıcıda paket görünür ve
 * bu tarayıcıda kalır (`warsim.destekTest`); `?destek=0` kapatır. Oyunculara bağlantı verilmez.
 */
function supportTest(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('destek');
    if (q === '1') localStorage.setItem('warsim.destekTest', '1');
    if (q === '0') localStorage.removeItem('warsim.destekTest');
    return localStorage.getItem('warsim.destekTest') === '1';
  } catch {
    return false;
  }
}

/** Destekçi paketi bu sürümde gösterilir mi. */
export const SUPPORT_ON = (PAYMENTS_LIVE || supportTest()) && !IN_PLAY_APP && !OLD_SITE;

/** Polar'ın ödeme sayfası adresleri (gömülü pencerenin mesajları yalnız buradan kabul edilir). */
const POLAR_ORIGINS = ['https://polar.sh', 'https://sandbox.polar.sh'];

/** Ödeme sayfası açıldıktan sonra sekmeye dönülünce bu süre içinde rozet beklenir. */
const WAIT_MS = 2 * 3600 * 1000;

const dollars = (cents: number) => `${(cents / 100).toLocaleString(LANG === 'en' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 2 })} $`;

/** Kilitli rozet: ödemeden önce rozetin yerinde durur. */
const LOCK = `<svg class="sbadge sp-lock" viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="#26302c" stroke="#56635d" stroke-width="2"/>
  <path d="M24 30v-5a8 8 0 0 1 16 0v5" fill="none" stroke="#8d9b94" stroke-width="4"/><rect x="20" y="29" width="24" height="17" rx="3" fill="#8d9b94"/><circle cx="32" cy="37" r="2.6" fill="#26302c"/></svg>`;

/** Üst çubuktaki düğmenin simgesi: madalya (rozeti yoksa). */
export const SUPPORT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2.5l4 6 4-6"/><circle cx="12" cy="14.5" r="6"/><path d="M12 11.6l.9 1.9 2 .2-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.2z"/></svg>';

export class SupportBox {
  /** Seçili seviye (1–3). */
  private level = 3;
  private busy = false;
  private error = '';
  /** Ödeme sayfası açılamadı (açılır pencere engeli): bağlantı gösterilir. */
  private link = '';
  /** Ödeme sayfasının açıldığı an ve o andaki toplam: sekmeye dönünce rozet beklenir. */
  private pendingAt = 0;
  private before = 0;
  private polling = false;

  constructor(private readonly game: Game) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.checkReturn();
    });
    window.addEventListener('focus', () => void this.checkReturn());
  }

  /** level: önceden seçili seviye (erken erişim penceresinden 3). */
  open(level?: number): void {
    if (!SUPPORT_ON) return;
    const tier = supportTier(currentAccount()?.support ?? 0);
    this.level = level && level > tier ? level : Math.min(3, Math.max(tier + 1, this.level));
    this.error = '';
    this.link = '';
    // Arkadaki yazı alanı (komutan adı) odakta kalırsa Esc oraya gider, pencere kapanmaz
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.game.modals.openSupport();
  }

  title(): string {
    return L('Destekçi paketi', 'Supporter pack');
  }

  body(): string {
    const acc = currentAccount();
    const cents = acc?.support ?? 0;
    const tier = supportTier(cents);
    const yes = '<span class="sp-yes" aria-label="✓">✓</span>';
    const no = '<span class="sp-no" aria-label="–">–</span>';
    // Seviyeleri karşılaştıran tablo: sütun başına seviye, satır başına ne kazandırdığı
    const cols = [1, 2, 3];
    const head = cols.map((t) => {
      const have = tier >= t;
      const sel = !have && this.level === t;
      return `<th class="${have ? 'have' : ''}${sel ? ' sel' : ''}${t === EARLY_ACCESS_TIER ? ' top' : ''}"><button type="button" data-act="sp" data-v="lvl" data-l="${t}" ${have ? 'disabled' : ''}>
        ${have ? badgeSvg(t, '2.2em') : LOCK}<span class="sp-lv">${L(`${t}. seviye`, `Level ${t}`)}</span>
        <span class="sp-price">${dollars(LEVEL_PRICES[t - 1])}</span>${have ? `<span class="sp-tag">${L('Sende', 'Yours')}</span>` : ''}</button></th>`;
    }).join('');
    const row = (label: string, cell: (t: number) => string) =>
      `<tr><td class="sp-what">${label}</td>${cols.map((t) => `<td class="${tier >= t ? 'have' : ''}${tier < t && this.level === t ? ' sel' : ''}">${cell(t)}</td>`).join('')}</tr>`;
    const table = `<table class="sp-cmp"><thead><tr><th class="sp-what"></th>${head}</tr></thead><tbody>
      ${row(L('Özel rozet', 'Special badge'), (t) => (tier >= t ? `<b>${badgeName(t)}</b>` : yes))}
      ${row(L('Kayıt yeri', 'Save slots'), (t) => `<b>${slotsFor(LEVEL_PRICES[t - 1])}</b>${extraSlots(t) ? ` <small>(+${extraSlots(t)})</small>` : ''}`)}
      ${row(L('Günlük geri bildirim', 'Feedback per day'), (t) => `<b>${feedbackPerDay(LEVEL_PRICES[t - 1])}</b>`)}
      ${row(L('Erken erişim: yapım aşamasındaki harita ve özellikler', 'Early access: maps and features in development'), (t) => (t >= EARLY_ACCESS_TIER ? yes : no))}
    </tbody></table>`;
    const now = tier
      ? `<p class="sp-total">${L(`Şu an <b>${tier}. seviye</b> sendesin (toplam ${dollars(cents)}). Üst seviyeye geçerken yalnız fark ödenir.`, `You are at <b>level ${tier}</b> (total ${dollars(cents)}). Moving up, you pay only the difference.`)}</p>`
      : `<p class="sp-total muted">${L('Tek seferlik ödeme, abonelik değil. Seviyeler birikir: sonra üst seviyeye geçerken yalnız fark ödenir.', 'A one-time payment, not a subscription. Levels add up: moving up later, you pay only the difference.')}</p>`;
    let action: string;
    if (!acc) {
      action = `<p>${L('Seviye hesabına eklenir: önce giriş yap ya da hesap aç.', 'The level goes to your account: log in or create an account first.')}</p>
        <div class="btn-row"><button class="primary" data-act="sp" data-v="login">${L('Giriş yap', 'Log in')}</button></div>`;
    } else if (tier >= 3) {
      action = `<p class="sp-next">${L('En yüksek seviye sende. Katkın için teşekkür ederiz!', 'You have the top level. Thank you for your support!')}</p>`;
    } else if (!navigator.onLine) {
      action = `<p class="muted">${L('Ödeme için internet gerekiyor.', 'Paying needs an internet connection.')}</p>`;
    } else {
      const lv = Math.max(this.level, tier + 1);
      const cost = levelCost(cents, lv);
      action = `${this.error ? `<p class="login-err">${esc(this.error)}</p>` : ''}
        ${this.link ? `<p><a class="sp-open" href="${esc(this.link)}" target="_blank" rel="noopener">${L('Ödeme sayfasını aç', 'Open the payment page')}</a></p>` : ''}
        ${this.waiting() ? `<p class="sp-wait">${L('Ödemeyi bitirdiysen seviyen birkaç saniye içinde gelir.', 'If you have finished paying, your level arrives in a few seconds.')}
          <button class="link" data-act="sp" data-v="check">${L('Şimdi bak', 'Check now')}</button></p>` : ''}
        <div class="btn-row"><button class="primary" data-act="sp" data-v="buy" ${this.busy ? 'disabled' : ''}>${this.busy
          ? L('Ödeme sayfası açılıyor…', 'Opening the payment page…')
          : tier
            ? L(`${lv}. seviyeye yükselt · ${dollars(cost)}`, `Upgrade to level ${lv} · ${dollars(cost)}`)
            : L(`${lv}. seviyeyi al · ${dollars(cost)}`, `Get level ${lv} · ${dollars(cost)}`)}</button></div>`;
    }
    return `<div class="sp">
      <p class="sp-lead">${L(
        'Destekçi paketi WarSimBox’ın gelişmesine katkı olur; katkın için şimdiden teşekkür ederiz! Hesabına sana özel bir rozet ve seviyesine göre ayrıcalıklar eklenir; rozetin profilinde ve skor tablosunda görünür.',
        'The supporter pack helps WarSimBox grow, and we thank you for it! Your account gets a special badge and perks by level; your badge shows in your profile and on the leaderboard.',
      )}</p>
      ${table}
      ${now}
      ${action}
      <p class="sp-fine">${L(
        `Ödeme Polar’ın güvenli ödeme penceresinde yapılır; kart bilgilerin oyuna ve sunucumuza hiç gelmez. Satıcı Polar’dır; ülkene göre vergi ekleyebilir, son tutar ödeme sayfasında görünür. İade ödemeden sonraki 7 gün içinde, o zamana kadar toplam 2,5 saatten az oynadıysan istenebilir; iade edilen ödemenin seviyesi geri alınır. <a href="${legalUrl('support', false)}" target="_blank" rel="noopener">Destekçi paketi koşulları</a> · <a href="${legalUrl('privacy', false)}" target="_blank" rel="noopener">Gizlilik</a>`,
        `You pay in Polar’s secure payment window; your card details never reach the game or our server. Polar is the seller and may add tax depending on your country; the final amount is shown on the payment page. Refunds can be requested within 7 days of payment if you have played less than 2.5 hours in total since then; a refunded payment’s level is removed. <a href="${legalUrl('support', true)}" target="_blank" rel="noopener">Supporter pack terms</a> · <a href="${legalUrl('privacy', true)}" target="_blank" rel="noopener">Privacy</a>`,
      )}</p>
    </div>`;
  }

  private waiting(): boolean {
    return !!this.pendingAt && Date.now() - this.pendingAt < WAIT_MS;
  }

  /** Pencerenin düğmesi (data-act="sp"). */
  act(b: HTMLElement): void {
    switch (b.dataset.v) {
      case 'lvl':
        this.level = Number(b.dataset.l) || 3;
        this.link = '';
        this.error = '';
        this.game.modals.rerender('support');
        return;
      case 'login':
        this.game.modals.close();
        this.game.login.open((a, created) => {
          if (this.game.mode === 'menu') this.game.menu.loggedIn(a, created);
          this.open();
        });
        return;
      case 'buy':
        void this.buy();
        return;
      case 'check':
        void this.checkReturn(true);
        return;
    }
  }

  private async buy(): Promise<void> {
    if (this.busy || !currentAccount()) return;
    this.busy = true;
    this.error = '';
    this.link = '';
    this.game.modals.rerender('support');
    try {
      const r = await api<{ url: string }>('POST', '/support/checkout', { level: this.level, lang: LANG });
      if (!/^https:\/\//.test(r.url)) throw new Error(L('Ödeme sayfası açılamadı', 'Could not open the payment page'));
      this.pendingAt = Date.now();
      this.before = currentAccount()?.support ?? 0;
      this.embed(r.url);
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.busy = false;
    this.game.modals.rerender('support');
  }

  /** Oyunun üstündeki ödeme penceresi açık mı (geri tuşu ve Esc önce onu kapatır). */
  private embedClose: (() => boolean) | null = null;

  /** Ödeme penceresi açık (kısayollar çalışmaz). */
  get paying(): boolean {
    return !!this.embedClose;
  }

  /** Geri tuşu / Esc: ödeme penceresi açıksa kapatır (ödeme işlenirken kapanmaz); bir şey yaptıysa true. */
  closeEmbed(): boolean {
    if (!this.embedClose) return false;
    this.embedClose();
    return true;
  }

  /**
   * Polar'ın gömülü ödeme sayfası (2026-11-21): oyunun üstünde tam ekran çerçeve. Kart alanları Polar'ın çerçevesinde kalır,
   * oyun yalnız Polar'ın mesajlarını dinler (yüklendi, onaylandı: ödeme işlenirken kapanmaz, kapat, başarılı). Polar'ın
   * @polar-sh/checkout/embed paketiyle aynı düzen. Çerçeve yüklenmezse sayfa yeni sekmede açılabilir.
   */
  private embed(url: string): void {
    const u = new URL(url);
    u.searchParams.set('embed', 'true');
    u.searchParams.set('embed_origin', location.origin);
    u.searchParams.set('theme', 'dark');
    const wrap = document.createElement('div');
    wrap.className = 'sp-embed';
    wrap.innerHTML = `<div class="sp-embed-wait">${L('Ödeme sayfası açılıyor…', 'Opening the payment page…')}</div>`;
    const frame = document.createElement('iframe');
    frame.src = u.toString();
    frame.title = L('Ödeme', 'Payment');
    frame.allow = `payment 'self' ${POLAR_ORIGINS.join(' ')}; publickey-credentials-get 'self' ${POLAR_ORIGINS.join(' ')};`;
    wrap.append(frame);
    document.body.append(wrap);
    let closable = true;
    let loaded = false;
    const close = () => {
      if (!closable) return false;
      window.removeEventListener('message', onMsg);
      clearTimeout(slow);
      wrap.remove();
      this.embedClose = null;
      // Ödeyip pencereyi kendisi kapatan oyuncu için de rozet beklenir (ödemediyse birkaç sorgudan sonra durur)
      void this.checkReturn();
      return true;
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; event?: string } | null;
      if (!POLAR_ORIGINS.includes(e.origin) || d?.type !== 'POLAR_CHECKOUT') return;
      if (d.event === 'loaded') {
        loaded = true;
        wrap.classList.add('ready');
      } else if (d.event === 'confirmed') closable = false;
      else if (d.event === 'close') close();
      else if (d.event === 'success') {
        // Polar'ın teşekkür sayfasına gidilmez: pencere kapanır, rozet gelene kadar hesap yenilenir
        closable = true;
        close();
      }
    };
    window.addEventListener('message', onMsg);
    // Çerçeve açılmazsa (ağ, tarayıcı engeli): yeni sekmede açma bağlantısı
    const slow = setTimeout(() => {
      if (loaded) return;
      const w = wrap.querySelector('.sp-embed-wait');
      if (w) w.innerHTML = `${L('Ödeme sayfası yüklenemedi.', 'The payment page did not load.')}
        <a href="${esc(url)}" target="_blank" rel="noopener">${L('Yeni sekmede aç', 'Open in a new tab')}</a>
        <button type="button" class="link">${L('Kapat', 'Close')}</button>`;
      w?.querySelector('button')?.addEventListener('click', () => close());
    }, 15000);
    this.embedClose = close;
  }

  /** Ödeme sayfasından dönülünce: hesap yenilenir, toplam artınca teşekkür (birkaç kez, bildirim gecikebilir). */
  private async checkReturn(force = false): Promise<void> {
    if (this.polling || (!force && !this.waiting())) return;
    this.polling = true;
    for (let i = 0; i < 8; i++) {
      await refreshSession();
      const acc = currentAccount();
      if (acc && (acc.support ?? 0) > this.before) {
        this.pendingAt = 0;
        this.thank(this.before, acc.support ?? 0);
        break;
      }
      if (force && i >= 1) break;
      await new Promise((r) => setTimeout(r, 4000));
    }
    this.polling = false;
    this.game.modals.rerender('support');
  }

  private thank(before: number, after: number): void {
    const g = this.game;
    const t0 = supportTier(before);
    const t = supportTier(after);
    const s0 = slotsFor(before);
    const s = slotsFor(after);
    const acc = currentAccount();
    g.modals.openNotice(
      L('Teşekkürler!', 'Thank you!'),
      `${t > t0 ? `<div class="sp-got">${badgeSvg(t, '4.5em')}<p>${L(`<b>${badgeName(t)}</b> rozetin hesabına eklendi. Profilinde ve skor tablosunda görünür.`, `Your <b>${badgeName(t)}</b> badge has been added to your account. It shows in your profile and on the leaderboard.`)}</p></div>` : ''}
      ${s > s0 ? `<p>${L(`Kayıt yerin artık <b>${s}</b>.`, `You now have <b>${s}</b> save slots.`)}</p>` : ''}
      ${t >= EARLY_ACCESS_TIER && t0 < EARLY_ACCESS_TIER ? `<p>${L('<b>Erken erişim</b> açıldı: yapım aşamasındaki haritalar ve özellikler artık sende (ana menüde Kanyonlar haritası).', '<b>Early access</b> is unlocked: maps and features in development are now yours (the Canyonlands map in the main menu).')}</p>` : ''}
      <p>${L(`Ödemen alındı, toplamın <b>${dollars(after)}</b>. Oyunun gelişmesine katkın için teşekkür ederiz.`, `Your payment has arrived; your total is <b>${dollars(after)}</b>. Thank you for helping the game grow.`)}</p>`,
      [{ label: L('Devam et', 'Continue'), primary: true, run: () => {} }],
    );
    // Açık menüler yeni rozet ve yer sayısıyla
    g.menu.scoresChanged();
    if (g.mode === 'menu') {
      g.menu.render();
      if (acc) void g.menu.saves.refresh(acc.key);
    }
    if (g.profile.isOpen) void g.profile.open();
  }
}
