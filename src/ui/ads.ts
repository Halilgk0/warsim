// Tanıtım penceresi ("reklam", 2026-11-27 kullanıcı kararı): oyunun kendi tanıtımları, sırayla: destekçi paketi, geri bildirim
// (katkı puanı ve rütbe), Kanyonlar erken erişimi, ansiklopedi (görselde rastgele bir uçak, düğme ana sayfayı açar). Dışarıdan reklam ağı
// yok, veri toplanmaz. Ekranı kaplayan pencere, arka plan buğulu; en çok 10 sn açık kalır, sonra kendiliğinden
// kapanır. Ücretsiz oyuncu 5. saniyeden sonra kapatabilir, destekçi hemen.
// Ne zaman: maça girişte (harekât başlatılınca ya da kaydı açılınca), maçtan ana menüye çıkışta ve oyunda gerçek oynama süresiyle
// 30 dakikada bir (2. seviye destekçide 45). 3. seviye destekçide hiç yok. İlk 1 saatlik oyunda (yeni oyuncu) yok. Google Play
// uygulamasında yalnız satın almaya yönlendirmeyenler (geri bildirim, ansiklopedi; Play kuralı: uygulamada başka ödeme yoluna
// yönlendirilmez). Öğreticide, senaryolarda ve kayıt kipinde yok.
// Süre kalıcı (`warsim.reklam`): oyunu kapatıp açınca sayaç kaldığı yerden sürer. Sayaç yalnız oyun akarken (harekâtta, hız > 0)
// ilerler; duraklatma, pencere ve reklamın kendisi saymaz.
// Pencere açıkken simülasyon durur (game.ts tick), ama hiçbir şey kapanmaz ya da sıfırlanmaz: planlayıcı, açık pencereler, seçim
// ve seçilen oyun hızı olduğu gibi kalır; reklam yalnız üstte bir katmandır. Tuşlar, dokunuşlar ve geri tuşu reklamda kalır.

import { currentAccount } from '../persist';
import { supportTier } from '../net/shared';
import { IN_PLAY_APP } from '../platform';
import { badgeName, badgeSvg, rankSvg } from './badges';
import { ENCYCLOPEDIA, encUrl } from '../ansiklopedi/liste';
import { SPECS } from '../sim/aircraft/specs';
import { EN, L } from '../i18n';

/** Reklam türleri (sıra döngüsü). buy: satın almaya yönlendirir (Play uygulamasında gösterilmez). */
const KINDS = [
  { id: 'support', buy: true },
  { id: 'feedback', buy: false },
  { id: 'canyon', buy: true },
  { id: 'encyclopedia', buy: false },
] as const;
type Kind = (typeof KINDS)[number]['id'];

/** Oyunun reklama verdikleri. */
export interface AdHooks {
  support(): void;
  feedback(): void;
}

const KEY = 'warsim.reklam';
/** Yeni oyuncu: ilk bu kadar oynama süresinde (sn) reklam yok. */
const GRACE = 3600;
/** Pencerenin en uzun açık kalma süresi ve ücretsiz oyuncunun kapatabilmesi için beklemesi (sn). */
const SHOW = 10;
const MIN = 5;
/** Maça girişte bekleyen reklam bu kadar sn içinde gösterilemezse (öğretici, yükleme) bırakılır. */
const ENTER_WAIT = 30;

interface State {
  /** Toplam oynama (sn, bu cihazda). */
  total: number;
  /** Son reklamdan beri oynama (sn). */
  since: number;
  /** Sıradaki reklam (KINDS sırası). */
  next: number;
}

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<State>;
    return { total: Number(s.total) || 0, since: Number(s.since) || 0, next: Number(s.next) || 0 };
  } catch {
    return { total: 0, since: 0, next: 0 };
  }
}

/** Destekçi seviyesi (misafir 0). */
function tier(): number {
  return supportTier(currentAccount()?.support ?? 0);
}

export class AdBox {
  private el: HTMLDivElement | null = null;
  private readonly state = load();
  private open = 0;
  private dirty = 0;
  private enterLeft = 0;
  private closeBtn: HTMLButtonElement | null = null;
  private bar: HTMLElement | null = null;
  private readonly hooks: AdHooks;
  private action: (() => void) | null = null;
  private readonly keyGuard = (e: KeyboardEvent) => {
    if (!this.el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') this.tryClose();
  };

  constructor(hooks: AdHooks) {
    this.hooks = hooks;
  }

  get isOpen(): boolean {
    return !!this.el;
  }

  /** Bu oyuncuya reklam gösterilir mi (seviye, yeni oyuncu, Play uygulaması). */
  private allowed(): boolean {
    return tier() < 3 && this.state.total >= GRACE;
  }

  private interval(): number {
    return tier() >= 2 ? 45 * 60 : 30 * 60;
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* gizli pencere: yalnız bu oturumda */
    }
    this.dirty = 0;
  }

  /** Maça girildi (harekât): yükleme bitince ve öğretici yoksa giriş reklamı. */
  enteredMatch(): void {
    this.enterLeft = this.allowed() ? ENTER_WAIT : 0;
  }

  /** Maçtan ana menüye çıkıldı (harekât): çıkış reklamı hemen. */
  leftMatch(): void {
    this.enterLeft = 0;
    if (this.allowed() && !this.el) this.show();
  }

  /**
   * Her karede. playing: harekâtta oyun akıyor (hız > 0, pencere değil oyun); canShow: şimdi gösterilebilir (yükleme ekranı yok,
   * öğretici ve oyun sonu ekranı kapalı). real: gerçek kare süresi.
   */
  update(real: number, playing: boolean, canShow: boolean): void {
    if (this.el) {
      this.open += real;
      const left = SHOW - this.open;
      if (this.bar) this.bar.style.transform = `scaleX(${Math.max(0, left / SHOW)})`;
      if (this.closeBtn && this.closeBtn.disabled) {
        const wait = Math.ceil(MIN - this.open);
        if (wait <= 0) {
          this.closeBtn.disabled = false;
          this.closeBtn.textContent = L('Kapat', 'Close');
        } else this.closeBtn.textContent = L(`Kapat (${wait})`, `Close (${wait})`);
      }
      if (left <= 0) this.close();
      return;
    }
    if (playing) {
      this.state.total += real;
      this.state.since += real;
      this.dirty += real;
      if (this.dirty > 15) this.persist();
    }
    if (this.enterLeft > 0) {
      this.enterLeft -= real;
      if (canShow) {
        this.enterLeft = 0;
        this.show();
      }
      return;
    }
    if (canShow && playing && this.allowed() && this.state.since >= this.interval()) this.show();
  }

  /** Kapat düğmesi, Esc ve geri tuşu: ücretsiz oyuncuda ilk 5 sn kapanmaz. */
  tryClose(): void {
    if (this.el && (tier() >= 1 || this.open >= MIN)) this.close();
  }

  private show(): void {
    // Sıradaki tür (Play uygulamasında satın almaya yönlendirenler atlanır)
    let i = this.state.next % KINDS.length;
    for (let n = 0; n < KINDS.length && IN_PLAY_APP && KINDS[i].buy; n++) i = (i + 1) % KINDS.length;
    this.state.next = i + 1;
    const kind: Kind = KINDS[i].id;
    const ad = this.content(kind);
    this.action = ad.run;
    this.state.since = 0;
    this.persist();
    this.open = 0;
    const instant = tier() >= 1;
    const el = document.createElement('div');
    el.className = 'ad-wrap';
    el.innerHTML = `<div class="ad-card" role="dialog" aria-modal="true">
      ${ad.html}
      <div class="ad-foot">
        <button class="ad-close" data-act="close" ${instant ? '' : 'disabled'}>${instant ? L('Kapat', 'Close') : L(`Kapat (${MIN})`, `Close (${MIN})`)}</button>
        <button class="primary" data-act="go">${ad.label}</button>
      </div>
      <div class="ad-bar"><i></i></div>
    </div>`;
    // Dokunuş ve tekerlek oyuna geçmesin (kamera kaymasın, arkadaki pencereye tıklanmasın)
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel', 'contextmenu']) {
      el.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== 'contextmenu' });
    }
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') this.tryClose();
      else if (act === 'go') {
        const run = this.action;
        this.close();
        run?.();
      }
    });
    document.body.appendChild(el);
    window.addEventListener('keydown', this.keyGuard, true);
    this.el = el;
    this.closeBtn = el.querySelector<HTMLButtonElement>('.ad-close');
    if (instant) this.closeBtn = null;
    this.bar = el.querySelector<HTMLElement>('.ad-bar i');
  }

  private close(): void {
    window.removeEventListener('keydown', this.keyGuard, true);
    this.el?.remove();
    this.el = null;
    this.closeBtn = null;
    this.bar = null;
  }

  private content(kind: Kind): { html: string; label: string; run: () => void } {
    const buy = L('Destekçi ol', 'Become a supporter');
    if (kind === 'support') return { html: this.support(), label: buy, run: () => this.hooks.support() };
    if (kind === 'canyon') return { html: this.canyon(), label: buy, run: () => this.hooks.support() };
    if (kind === 'feedback') return { html: this.feedback(), label: L('Geri bildirim yaz', 'Send feedback'), run: () => this.hooks.feedback() };
    // Ansiklopedi: görselde rastgele bir uçak, düğme ansiklopedinin ana sayfası
    const ids = Object.keys(ENCYCLOPEDIA).filter((k) => SPECS[k]);
    const id = ids[Math.floor(Math.random() * ids.length)];
    const url = encUrl(EN);
    return {
      html: this.encyclopedia(id),
      label: L('Ansiklopediyi aç', 'Open the encyclopedia'),
      run: () => window.open(url, '_blank', 'noopener'),
    };
  }

  /** Geri bildirim: katkı puanı ve rütbe rozetleri. */
  private feedback(): string {
    const img = `${import.meta.env.BASE_URL}acilis/${1 + Math.floor(Math.random() * 7)}.webp`;
    const ranks = [1, 4, 8, 13].map((r) => rankSvg(r, '2.4em')).join('');
    return `<div class="ad-art" style="background-image:url('${img}')"><span class="ad-badges">${ranks}</span></div>
      <div class="ad-text">
        <h2>${L('Hata bul, rütbe kazan', 'Find bugs, earn ranks')}</h2>
        <p class="ad-lead">${L(
          'Oyunda bir hata mı gördün ya da aklına bir fikir mi geldi? Menüdeki Geri bildirim’den bize yaz; her mesajı okuyoruz.',
          'Spotted a bug or have an idea? Write to us from Feedback in the menu; we read every message.',
        )}</p>
        <ul class="ad-list">
          <li>${L('Doğrulanan hata 50, kabul edilen öneri 30 puan; yapılınca +20', 'Confirmed bug 50 points, accepted idea 30; +20 when it ships')}</li>
          <li>${L('Puanla 13 rütbe boyunca yükselirsin', 'Climb through 13 ranks with your points')}</li>
          <li>${L('Rozetin skor tablosunda adının yanında görünür', 'Your badge shows next to your name on the leaderboard')}</li>
        </ul>
      </div>`;
  }

  /** Ansiklopedi: oyundaki uçakların gerçek tarihçesi (görselde rastgele bir uçak, kendi sayfa görseli). */
  private encyclopedia(id: string): string {
    const img = `${import.meta.env.BASE_URL}ansiklopedi/gorsel/${id}-og.jpg`;
    const n = Object.keys(ENCYCLOPEDIA).length;
    return `<div class="ad-art" style="background-image:url('${img}')"><span class="ad-tag">${L('Ansiklopedi', 'Encyclopedia')}</span></div>
      <div class="ad-text">
        <h2>${L('Uçakların gerçek hikâyesi', 'The real story of the aircraft')}</h2>
        <p class="ad-lead">${L(
          `Oyundaki ${n} uçağın her biri gerçekte nasıl doğdu, hangi savaşlarda uçtu, pilotları ne derdi? Hepsi WarSimBox ansiklopedisinde.`,
          `How was each of the game’s ${n} aircraft born, where did it fight, what did its pilots say? It is all in the WarSimBox encyclopedia.`,
        )}</p>
        <ul class="ad-list">
          <li>${L('Tarihçe, teknik bilgiler ve oyunda nasıl uçtuğu', 'History, specifications and how it flies in the game')}</li>
          <li>${L('Uçaksavar topları ve radarlar da var', 'Anti-aircraft guns and radars too')}</li>
        </ul>
      </div>`;
  }

  /** Kanyonlar haritasının tanıtımı (erken erişim: 3. seviye). */
  private canyon(): string {
    const img = `${import.meta.env.BASE_URL}news/kanyon-kapak-p51.webp`;
    return `<div class="ad-art" style="background-image:url('${img}')"><span class="ad-tag">${L('Erken erişim', 'Early access')}</span></div>
      <div class="ad-text">
        <h2>${L('Yeni harita: Kanyonlar', 'New map: Canyons')}</h2>
        <p class="ad-lead">${L(
          'Anıt vadisi kayaları, kıvrılan derin kanyonlar, nehir ve göl. Kanyonun dibinde alçaktan uçup radarın altından girin.',
          'Monument valley buttes, winding deep canyons, a river and a lake. Fly low along the canyon floor and slip under the radar.',
        )}</p>
        <p>${L(
          `${badgeSvg(3)} <b>${badgeName(3)}</b> destekçiler bu haritada şimdiden oynuyor; herkese açılmadan önce ilk onlar uçuyor.`,
          `${badgeSvg(3)} <b>${badgeName(3)}</b> supporters are already playing it; they fly it first, before everyone else.`,
        )}</p>
      </div>`;
  }

  /** Destekçi paketi: samimi, kısa. */
  private support(): string {
    // Açılış görsellerinden biri (yükleme ekranındakiler: uçaklar görselin üst yarısında)
    const img = `${import.meta.env.BASE_URL}acilis/${1 + Math.floor(Math.random() * 7)}.webp`;
    return `<div class="ad-art" style="background-image:url('${img}')"><span class="ad-badges">${badgeSvg(1, '2.2em')}${badgeSvg(2, '2.2em')}${badgeSvg(3, '2.2em')}</span></div>
      <div class="ad-text">
        <h2>${L('Kusura bakma, araya girdik', 'Sorry for the interruption')}</h2>
        <p class="ad-lead">${L(
          'WarSimBox’ı tek kişi geliştiriyor. Bu pencereyi görmeni biz de istemezdik, ama oyunun büyümesi için desteğe ihtiyacımız var.',
          'WarSimBox is made by one person. We would rather not show you this, but the game needs support to keep growing.',
        )}</p>
        <ul class="ad-list">
          <li>${L('Reklamlar azalır ya da tamamen kalkar', 'Fewer ads, or none at all')}</li>
          <li>${L('Kanyonlar haritası ve yeni haritalar seni önce bekler', 'The Canyons map and new maps open to you first')}</li>
          <li>${L('Yeni uçaklar ve özellikler daha hızlı gelir', 'New aircraft and features arrive faster')}</li>
        </ul>
        <p class="ad-thanks">${L('Oynadığın için teşekkürler.', 'Thank you for playing.')}</p>
      </div>`;
  }
}
