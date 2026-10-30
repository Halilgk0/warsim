// Skor tablosu istatistikleri: hesap açıkken harekâtın toplamlarını (düşürme, kazanç, en büyük filo, zafer, oyun süresi)
// ve gerçek oynama süresini dakikada bir sunucuya bildirir. Oynama süresi yalnız harekât ekranı görünürken ve oyuncu
// son 3 dakikada dokunmuş ya da tuşa basmışsa sayılır (açık bırakılan sekme süre biriktirmesin). Zaferde ve sekme
// arka plana geçerken hemen bildirilir. Senaryolar (harekât kimliği boş) sayılmaz.

import type { World } from '../sim/world';
import { api } from './api';
import type { StatsReport } from './shared';

const REPORT_SEC = 60;
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
      await api('POST', '/stats', report, { keepalive });
      this.pending -= playSec;
      if (report.won) this.wonSent = w.campaignId;
    } catch {
      /* bağlantı yok: süre birikir, sonra bildirilir */
    } finally {
      this.sending = false;
    }
  }
}
