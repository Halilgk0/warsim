// Küçük arayüz yardımcıları.

import { L, LOCALE } from '../i18n';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Yazı alanına kendiliğinden odaklan; dokunmatik ekranda değil: klavye oyuncu alana dokununca açılsın. */
export function focusField(el: HTMLElement | null | undefined): void {
  if (!matchMedia('(pointer: coarse)').matches) el?.focus();
}

/** HTML içine güvenle metin koymak için. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function fmtTime(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const nf = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Oran → yüzde: Türkçede "%40", İngilizcede "40%". */
export function pct(f: number): string {
  const n = Math.round(f * 100);
  return L(`%${n}`, `${n}%`);
}

export function bar(pct: number, color = 'var(--accent)', thin = false): string {
  const p = Math.max(0, Math.min(100, pct));
  return `<div class="bar${thin ? ' thin' : ''}"><i style="width:${p.toFixed(1)}%;background:${color}"></i></div>`;
}

export function hpColor(pct: number): string {
  return pct > 50 ? 'var(--accent)' : pct > 25 ? 'var(--warn)' : 'var(--red)';
}

/** Saniyeyi "1 dk 20 sn" ("1 min 20 s") biçiminde yazar. */
export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const SN = L('sn', 's');
  const DK = L('dk', 'min');
  const SA = L('sa', 'h');
  if (s < 60) return `${s} ${SN}`;
  // Saatten uzun süreler (onarım) saniyesiz
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    return mm ? `${h} ${SA} ${mm} ${DK}` : `${h} ${SA}`;
  }
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} ${DK} ${r} ${SN}` : `${m} ${DK}`;
}
