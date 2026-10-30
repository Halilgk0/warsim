// Skor tablosu (ana menüde "Skorlar" sekmesi): ölçüt (düşürme, zafer, kazanç, en büyük hava kuvveti, oynama süresi) ve
// dönem (tüm zamanlar, bu hafta). İlk 50 ve oyuncunun kendi sırası; sonuçlar bir dakika önbellekte.

import { api } from '../net/api';
import type { LeaderRow, Metric } from '../net/shared';
import { currentAccount } from '../persist';
import { fmtMoney } from '../sim/economy';
import { esc, nf } from './dom';
import { L } from '../i18n';

type Period = 'all' | 'week';

interface Board {
  rows: LeaderRow[];
  me: LeaderRow | null;
  at: number;
}

const CACHE_MS = 60000;

export const LABEL: Record<Metric, () => string> = {
  kills: () => L('Düşürme', 'Kills'),
  wins: () => L('Zafer', 'Wins'),
  earned: () => L('Kazanç', 'Earned'),
  peak: () => L('Hava kuvveti', 'Air force'),
  play_sec: () => L('Süre', 'Time'),
};

export const HINT: Record<Metric, () => string> = {
  kills: () => L('Bütün harekâtlarda düşürülen düşman uçağı', 'Enemy aircraft shot down across all campaigns'),
  wins: () => L('Haritada son kalarak kazanılan harekât', 'Campaigns won by being the last one standing'),
  earned: () => L('Harekâtlarda kazanılan toplam para', 'Total money earned in campaigns'),
  peak: () => L('Bir harekâtta aynı anda sahip olunan en çok uçak', 'Most aircraft owned at once in a campaign'),
  play_sec: () => L('Harekâtta gerçek zamanda geçen süre', 'Real time spent playing campaigns'),
};

export function fmtValue(m: Metric, v: number): string {
  switch (m) {
    case 'earned': return fmtMoney(v);
    case 'peak': return `${nf.format(v)} ${L('uçak', 'aircraft')}`;
    case 'play_sec': {
      const h = Math.floor(v / 3600);
      const min = Math.floor((v % 3600) / 60);
      return h ? L(`${h} sa ${min} dk`, `${h} h ${min} min`) : L(`${min} dk`, `${min} min`);
    }
    default: return nf.format(v);
  }
}

export class LeaderboardPanel {
  private metric: Metric = 'kills';
  private period: Period = 'all';
  private boards = new Map<string, Board>();
  private loading = false;
  private error = '';

  constructor(private readonly rerender: () => void) {}

  private get key(): string {
    return `${this.metric}:${this.period}:${currentAccount()?.key ?? ''}`;
  }

  async refresh(force = false): Promise<void> {
    const key = this.key;
    const b = this.boards.get(key);
    if (!force && b && Date.now() - b.at < CACHE_MS) return;
    this.loading = !b;
    this.error = '';
    this.rerender();
    try {
      const r = await api<{ rows: LeaderRow[]; me: LeaderRow | null }>('GET', `/leaderboard?metric=${this.metric}&period=${this.period}`);
      this.boards.set(key, { rows: r.rows, me: r.me, at: Date.now() });
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.loading = false;
    this.rerender();
  }

  html(): string {
    const m = this.metric;
    const metrics = (Object.keys(LABEL) as Metric[])
      .map((k) => `<button class="${k === m ? 'active' : ''}" data-lb="metric" data-v="${k}" title="${esc(HINT[k]())}">${LABEL[k]()}</button>`).join('');
    const periods = `<button class="${this.period === 'all' ? 'active' : ''}" data-lb="period" data-v="all">${L('Tüm zamanlar', 'All time')}</button>`
      + `<button class="${this.period === 'week' ? 'active' : ''}" data-lb="period" data-v="week">${L('Bu hafta', 'This week')}</button>`;
    const acc = currentAccount();
    const board = this.boards.get(this.key);
    let list: string;
    if (this.loading) list = `<p class="muted">${L('Skorlar yükleniyor…', 'Loading scores…')}</p>`;
    else if (this.error && !board) list = `<p class="login-err">${esc(this.error)}</p>`;
    else if (!board || !board.rows.length) {
      list = `<p class="muted">${this.period === 'week'
        ? L('Bu hafta henüz kimse yok. İlk sen ol!', 'Nobody yet this week. Be the first!')
        : L('Henüz kimse yok. İlk sen ol!', 'Nobody yet. Be the first!')}</p>`;
    } else {
      const row = (r: LeaderRow, me: boolean) => `<div class="lb-row ${me ? 'me' : ''} ${r.rank <= 3 ? `top top${r.rank}` : ''}">
        <span class="lb-rank">${r.rank}</span><span class="lb-name">${esc(r.name)}</span><span class="lb-val">${fmtValue(m, r.value)}</span></div>`;
      const mine = board.me;
      const inTop = !!mine && board.rows.some((r) => r.rank === mine.rank && r.name === mine.name);
      list = `<div class="lb-list">${board.rows.map((r) => row(r, !!acc && r.name === acc.name)).join('')}
        ${mine && !inTop ? `<div class="lb-gap">…</div>${row(mine, true)}` : ''}</div>`;
    }
    const foot = acc
      ? ''
      : `<p class="muted small">${L('Skor tablosuna girmek için <b>giriş yap</b> ya da hesap aç; misafir oyunlar sayılmaz.', 'To appear on the leaderboard, <b>log in</b> or create an account; guest games do not count.')}</p>`;
    return `<div class="lb">
      <div class="seg lb-metrics">${metrics}</div>
      <div class="lb-head"><div class="seg lb-period">${periods}</div><span class="muted small">${esc(HINT[m]())}</span></div>
      ${list}${foot}
    </div>`;
  }

  /** Tıklamayı işler; panelle ilgiliyse true. */
  handle(t: HTMLElement): boolean {
    const b = t.closest<HTMLElement>('[data-lb]');
    if (!b) return false;
    if (b.dataset.lb === 'metric') this.metric = b.dataset.v as Metric;
    else if (b.dataset.lb === 'period') this.period = b.dataset.v as Period;
    void this.refresh();
    this.rerender();
    return true;
  }
}
