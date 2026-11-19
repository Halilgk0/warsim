// Skor bildirimlerinin giden kutusu (2026-11-19, internetsiz oyun): bağlantı yokken gönderilemeyen bildirim bu cihazda, hesaba bağlı
// saklanır; sayfa kapansa da kaybolmaz. Bağlantı gelince (oyun açılınca, "online" olayında, sonraki bildirimden önce) sırayla
// gönderilir. O zamana dek skor tabloya girmez, oyuncu kendi bekleyen skorunu Profil'de görür.
//
// Bildirim harekâtın toplamlarını taşır (sunucu artışı harekâtın önceki değerlerinden hesaplar); aynı harekâtın bekleyen
// bildirimleri birleşir (toplamların en büyüğü, oynama süreleri toplanır). "acked": son kabul edilen toplamlar, bekleyen artışı
// göstermek için (sunucu akla yatkınlık sınırıyla kırparsa gösterilen biraz fazla olabilir).

import type { StatsReport } from './shared';

const KEY = 'warsim.stats.outbox.v1';
/** Gösterim için hatırlanan son kabul edilen harekât sayısı (hesap başına). */
const ACKED_MAX = 30;

interface Entry {
  /** Harekâtın son bilinen toplamları (playSec kullanılmaz). */
  r: StatsReport;
  /** Gönderilmemiş oynama süresi (s). */
  play: number;
}

interface Acked {
  kills: number;
  earned: number;
  won: boolean;
}

interface AccountBox {
  pending: Record<string, Entry>;
  acked: Record<string, Acked>;
}

type Box = Record<string, AccountBox>;

function load(): Box {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Box) : {};
  } catch {
    return {};
  }
}

function save(b: Box): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* depolama kapalı: bekleyen bildirim yalnız bu oturumda kalır */
  }
}

function of(b: Box, account: string): AccountBox {
  return (b[account] ??= { pending: {}, acked: {} });
}

/** Gönderilemeyen bildirimi sakla (aynı harekâtın bekleyeniyle birleşir). */
export function queueReport(account: string, report: StatsReport, playSec: number): void {
  const b = load();
  const box = of(b, account);
  const prev = box.pending[report.campaign];
  const r = prev
    ? {
      ...report,
      kills: Math.max(prev.r.kills, report.kills),
      earned: Math.max(prev.r.earned, report.earned),
      peak: Math.max(prev.r.peak, report.peak),
      won: prev.r.won || report.won,
      gameTime: Math.max(prev.r.gameTime, report.gameTime),
    }
    : report;
  box.pending[report.campaign] = { r: { ...r, playSec: 0 }, play: (prev?.play ?? 0) + Math.max(0, playSec) };
  save(b);
}

/** Bekleyen bildirimler (gönderilecek biçimde: oynama süresi içinde). */
export function pendingReports(account: string): StatsReport[] {
  const box = load()[account];
  if (!box) return [];
  return Object.values(box.pending).map((e) => ({ ...e.r, playSec: Math.floor(e.play) }));
}

/** Sunucu kabul etti: bekleyenden çıkar, kabul edilen toplamları hatırla. */
export function ackReport(account: string, report: StatsReport): void {
  const b = load();
  const box = of(b, account);
  const p = box.pending[report.campaign];
  // Gönderilen bekleyenin tamamıysa silinir; arada yenisi biriktiyse yalnız gönderilen süre düşer
  if (p) {
    p.play = Math.max(0, p.play - report.playSec);
    if (p.play <= 0 && p.r.kills <= report.kills && p.r.earned <= report.earned && (!p.r.won || report.won)) delete box.pending[report.campaign];
  }
  const a = box.acked[report.campaign];
  box.acked[report.campaign] = {
    kills: Math.max(a?.kills ?? 0, report.kills), earned: Math.max(a?.earned ?? 0, report.earned), won: (a?.won ?? false) || report.won,
  };
  const keys = Object.keys(box.acked);
  if (keys.length > ACKED_MAX) for (const k of keys.slice(0, keys.length - ACKED_MAX)) delete box.acked[k];
  save(b);
}

export interface PendingSummary {
  kills: number;
  earned: number;
  wins: number;
  playSec: number;
  campaigns: number;
}

/** Henüz skor tablosuna gitmemiş artış (Profil'de gösterilir). */
export function pendingSummary(account: string): PendingSummary | null {
  const box = load()[account];
  if (!box) return null;
  const list = Object.values(box.pending);
  if (!list.length) return null;
  const s: PendingSummary = { kills: 0, earned: 0, wins: 0, playSec: 0, campaigns: list.length };
  for (const e of list) {
    const a = box.acked[e.r.campaign];
    s.kills += Math.max(0, e.r.kills - (a?.kills ?? 0));
    s.earned += Math.max(0, e.r.earned - (a?.earned ?? 0));
    if (e.r.won && !a?.won) s.wins++;
    s.playSec += e.play;
  }
  return s;
}

/** Hesap silindi: bu cihazdaki bekleyen skorları da silinir. */
export function dropAccountStats(account: string): void {
  const b = load();
  if (!b[account]) return;
  delete b[account];
  save(b);
}
