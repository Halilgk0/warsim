// Haberler (güncelleme notları): ana menünün sol üstünde en son haberin kutusu; tıklayınca bütün haberlerin listesi,
// bir habere tıklayınca ayrıntı sayfası (metin ve diğer görseller). Görseller public/news altında.

import { $, esc } from './dom';
import { EN, L } from '../i18n';
import { markNewsSeen, newsSeenByAccount } from '../persist';
import { NEWS_EN } from './newsEn';
import { type NewsItem, NEWS_TR, img } from './newsData';
import { socialLinks } from './social';

export type { NewsItem, NewsSection } from './newsData';

/** Geçerli dildeki haberler (İngilizcesi newsEn.ts'te; görsel ve tarih ortak). */
export const NEWS: NewsItem[] = EN
  ? NEWS_TR.map((n) => {
    const t = NEWS_EN[n.id];
    if (!t) return n;
    return {
      ...n,
      title: t.title,
      summary: t.summary,
      sections: t.sections,
      cover: t.cover ? img(t.cover) : n.cover,
      images: n.images.map((g, i) => ({ src: t.files?.[i] ? img(t.files[i]) : g.src, caption: t.captions?.[i] ?? g.caption })),
    };
  })
  : NEWS_TR;

const MONTHS = EN
  ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  : ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

// Okunmamış işareti yalnız hesapta: okunanlar hesaba yazılır (persist.ts), misafirde işaret yok.
/** İşaret bu günden önceki haberlere konmaz: eski oyuncu bütün arşivi okunmamış görmesin. */
const MARK_FROM = '2026-11-04';
/** Bu kadar günden eski haber işaretlenmez: yeni açılan ya da uzun süre sonra dönen hesapta sayı birikmesin. */
const MARK_DAYS = 30;

function isUnread(n: NewsItem): boolean {
  if (n.date < MARK_FROM || newsSeenByAccount(n.id) !== false) return false;
  return Date.now() - Date.parse(n.date) <= MARK_DAYS * 86400000;
}

/** Haberler'i açan düğmelerdeki sayıyı günceller (ana menü her çizildiğinde ve haber okununca). */
export function syncNewsMarks(): void {
  const count = NEWS.filter(isUnread).length;
  document.querySelectorAll<HTMLElement>('[data-mm="news"]').forEach((b) => {
    b.querySelector('.news-count')?.remove();
    if (!count) return;
    const mark = document.createElement('span');
    mark.className = 'news-count';
    mark.textContent = b.classList.contains('news-card') ? L(`${count} yeni`, `${count} new`) : String(count);
    b.append(mark);
  });
}

/** Görsel ve üstünde tabana ortalanmış başlık (kutu, listede de aynı). Listede okunmamış haberde "Yeni" yazar. */
export function newsCard(n: NewsItem, attrs: string, small = false): string {
  return `<button class="news-card${small ? ' small' : ''}" ${attrs}>
    <img src="${n.cover}" alt="" width="1280" height="720" loading="lazy">
    ${!small && isUnread(n) ? `<span class="news-count">${L('Yeni', 'New')}</span>` : ''}
    <span class="news-cap"><b>${esc(n.title)}</b><small>${fmtDate(n.date)}</small></span>
  </button>`;
}

/** Haberler penceresi: liste ya da tek haber. */
export class NewsView {
  isOpen = false;
  private el = $('news');
  private current: string | null = null;

  constructor() {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el) {
        this.close();
        return;
      }
      const b = t.closest<HTMLElement>('[data-nw]');
      if (!b) return;
      if (b.dataset.nw === 'close') this.close();
      else if (b.dataset.nw === 'back') this.show(null);
      else if (b.dataset.nw === 'open') this.show(b.dataset.id ?? null);
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.current) this.show(null);
        else this.close();
      }
      e.stopPropagation();
    });
  }

  /** Listeyi (id yoksa) ya da bir haberi aç. */
  open(id: string | null = null): void {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.show(id);
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  private show(id: string | null): void {
    this.current = id;
    const n = id ? NEWS.find((x) => x.id === id) : undefined;
    if (n) {
      markNewsSeen(n.id);
      syncNewsMarks();
    }
    this.el.innerHTML = `<div class="news-sheet steel" tabindex="-1">${n ? this.article(n) : this.list()}</div>`;
    const sheet = this.el.querySelector<HTMLElement>('.news-sheet');
    sheet?.focus();
    if (sheet) sheet.scrollTop = 0;
  }

  private list(): string {
    return `<div class="news-head"><h2>${L('Haberler', 'News')}</h2>${socialLinks(true)}<button class="icon" data-nw="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
      <div class="news-list">${NEWS.map((n) => newsCard(n, `data-nw="open" data-id="${n.id}"`)).join('')}</div>`;
  }

  private article(n: NewsItem): string {
    const sec = n.sections.map((s) => `
      ${s.heading ? `<h3>${esc(s.heading)}</h3>` : ''}
      ${(s.text ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}
      ${s.bullets ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      ${s.links ? `<ul class="news-links">${s.links.map((l) => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.text)}</a></li>`).join('')}</ul>` : ''}
      ${s.video ? `<figure class="news-video"><video src="${s.video.src}" poster="${s.video.poster}" autoplay muted loop playsinline controls preload="metadata"></video><figcaption>${esc(s.video.caption)}</figcaption></figure>` : ''}`).join('');
    const gallery = n.images.map((g) => `<figure><img src="${g.src}" alt="" loading="lazy"><figcaption>${esc(g.caption)}</figcaption></figure>`).join('');
    return `<div class="news-head"><button class="news-back" data-nw="back">‹ ${L('Haberler', 'News')}</button><button class="icon" data-nw="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
      <article class="news-article">
        <img class="news-hero" src="${n.cover}" alt="">
        <div class="news-date">${fmtDate(n.date)}</div>
        <h2>${esc(n.title)}</h2>
        <p class="news-lead">${esc(n.summary)}</p>
        ${sec}
        ${gallery ? `<div class="news-gallery">${gallery}</div>` : ''}
      </article>`;
  }
}
