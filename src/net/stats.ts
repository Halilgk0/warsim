// Skor tablosu istatistikleri: hesap açıkken harekâtın toplamlarını (düşürme, kazanç, en büyük filo, zafer, oyun süresi)
// ve gerçek oynama süresini dakikada bir sunucuya bildirir. Oynama süresi yalnız harekât ekranı görünürken ve oyuncu
// son 3 dakikada dokunmuş ya da tuşa basmışsa sayılır (açık bırakılan sekme süre biriktirmesin). Zaferde ve sekme
// arka plana geçerken hemen bildirilir. Senaryolar (harekât kimliği boş) sayılmaz.

import type { World } from '../sim/world';
import { api } from './api';
import type { StatsReport } from './shared';

const REPORT_SEC = 60;
/** Misafirin toplam oynama süresi (sn), bu tarayıcıda: teşekkür penceresi için. */
const GUEST_KEY = 'warsim.oynama';
const AFK_SEC = 180;
/** Bildirilemeyen süre bu kadar birikir (bağlantı uzun süre yoksa). */
const PENDING_MAX = 3600;

export class StatsTracker {
  /** Bildirilmemiş oynama süresi (s). */
  private pending = 0;
  private clock = 0;
  private lastInput = performance.now();
  private sending = false;
  private wonSent = '';
  private guestSec = -1;
  private guestClock = 0;
  /** Toplam oynama süresi öğrenilince (hesapta sunucudan, misafirde tarayıcıdan). */
  onTotal: ((sec: number) => void) | null = null;

  constructor() {
    const touch = () => {
      this.lastInput = performance.now();
    };
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { capture: true, passive: true });
  }

  /** Her kare (gerçek saniye). active: harekâtta, hesap açık, sekme görünür. */
  update(real: number, w: World, team: number, active: boolean): void {
    if (!active || !w.campaignId) return;
    if ((performance.now() - this.lastInput) / 1000 < AFK_SEC) this.pending = Math.min(PENDING_MAX, this.pending + real);
    this.clock += real;
    const won = w.winner === team && this.wonSent !== w.campaignId;
    if (this.clock >= REPORT_SEC || won) {
      this.clock = 0;
      void this.send(w, team);
    }
  }

  /** Misafir: harekâtta, sekme görünürken ve oyuncu son 3 dakikada dokunmuşsa süre bu tarayıcıda birikir. */
  guest(real: number, w: World, visible: boolean): void {
    if (!visible || !w.campaignId || (performance.now() - this.lastInput) / 1000 >= AFK_SEC) return;
    if (this.guestSec < 0) {
      try {
        this.guestSec = Number(localStorage.getItem(GUEST_KEY)) || 0;
      } catch {
        this.guestSec = 0;
      }
    }
    this.guestSec += real;
    this.guestClock += real;
    if (this.guestClock < REPORT_SEC) return;
    this.guestClock = 0;
    try {
      localStorage.setItem(GUEST_KEY, String(Math.floor(this.guestSec)));
    } catch {
      /* yazılamıyor: bu oturumda sayılır */
    }
    this.onTotal?.(this.guestSec);
  }

  /** Hemen bildir (sekme arka plana geçerken; keepalive: sayfa kapanırken de gider). */
  flush(w: World, team: number): void {
    if (w.campaignId) void this.send(w, team, true);
  }

  private async send(w: World, team: number, keepalive = false): Promise<void> {
    const t = w.teams[team];
    if (!t || this.sending) return;
    const playSec = Math.floor(this.pending);
    const report: StatsReport = {
      campaign: w.campaignId, kills: t.kills, earned: Math.round(t.earned), peak: t.peakFleet,
      won: w.winner === team, gameTime: w.time, playSec,
    };
    this.sending = true;
    try {
      const res = await api<{ totalPlaySec?: number }>('POST', '/stats', report, { keepalive });
      this.pending -= playSec;
      if (typeof res?.totalPlaySec === 'number') this.onTotal?.(res.totalPlaySec);
      if (report.won) this.wonSent = w.campaignId;
    } catch {
      /* bağlantı yok: süre birikir, sonra bildirilir */
    } finally {
      this.sending = false;
    }
  }
}
