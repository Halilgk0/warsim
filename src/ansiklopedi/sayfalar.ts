// Ansiklopedi sayfaları: düz HTML (arama motorları okusun diye), derlemede üretilir (tools/ansiklopedi/vite.ts) ve
// geliştirmede aynı işlevle anında sunulur. Liste uçakları eskiden yeniye (katalog yılı, eşitlikte katalog sırası)
// sıralar; her uçağın Türkçe (/ansiklopedi/…) ve İngilizce (/en/encyclopedia/…) sayfası birbirine bağlıdır.
// Görseller oyunun kendi modellerinden çekilir (tools/ansiklopedi/gorseller.mjs → public/ansiklopedi/gorsel).

import { SPEC_LIST, type AircraftSpec, type Role } from '../sim/aircraft/specs';
import { NAME_EN, ORIGIN_EN } from '../sim/aircraft/specsEn';
import { TECH, TECH_BY_ID, aircraftNode } from '../sim/tech';
import { TECH_EN } from '../sim/techEn';
import { SOCIAL } from '../ui/social';
import { ARTICLES, type Article, type Tx } from './makaleler';
import { ENC_EN, ENC_TR, ENCYCLOPEDIA } from './liste';
import { LEGAL_PATHS, type LegalKind } from '../yasal/liste';
import { LEGAL_TEXT } from '../yasal/metin';

type Lang = 'tr' | 'en';

const SITE = 'https://warsimbox.com';
/** Ansiklopedinin ilk yayın günü (yapılandırılmış veri); güncelleme günü derlemeden gelir. */
const PUBLISHED = '2026-10-30';
const IMG = '/ansiklopedi/gorsel';
const CSS = '/ansiklopedi/stil.css';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tx = (v: Tx, l: Lang) => v[l];
const T = (l: Lang, tr: string, en: string) => (l === 'en' ? en : tr);
const num = (l: Lang, n: number, d = 0) => new Intl.NumberFormat(l === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: d }).format(n);

const ROLE: Record<Role, Tx> = {
  fighter: { tr: 'Avcı', en: 'Fighter' },
  diveBomber: { tr: 'Pike bombardıman', en: 'Dive bomber' },
  bomber: { tr: 'Bombardıman', en: 'Bomber' },
  attacker: { tr: 'Taarruz', en: 'Ground attack' },
};

interface Entry {
  spec: AircraftSpec;
  art: Article;
  slug: string;
}

/** Araştırma ağacında olan, makalesi yazılmış uçaklar, eskiden yeniye. Oyunda uçurulamayan uçağın sayfası olmaz. */
function entries(): Entry[] {
  const order = new Map(SPEC_LIST.map((s, i) => [s.id, i]));
  const inTree = (id: string) => {
    const node = aircraftNode(id);
    return !!node && !node.future;
  };
  return ARTICLES
    .filter((a) => ENCYCLOPEDIA[a.id] && inTree(a.id) && SPEC_LIST.some((s) => s.id === a.id))
    .map((art) => ({ art, spec: SPEC_LIST.find((s) => s.id === art.id)!, slug: ENCYCLOPEDIA[art.id] }))
    .sort((a, b) => a.spec.year - b.spec.year || order.get(a.spec.id)! - order.get(b.spec.id)!);
}

const name = (s: AircraftSpec, l: Lang) => (l === 'en' ? NAME_EN[s.id] ?? s.name : s.name);
const origin = (s: AircraftSpec, l: Lang) => (l === 'en' ? ORIGIN_EN[s.origin] ?? s.origin : s.origin);
const listPath = (l: Lang) => (l === 'en' ? ENC_EN : ENC_TR);
const pagePath = (l: Lang, slug: string) => `${listPath(l)}${slug}/`;

/** Arama açıklaması: girişin ilk ~155 karakteri, kelime sınırında. */
function snippet(s: string, max = 155): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

// ---------------------------------------------------------------- ortak çerçeve

interface PageOpts {
  lang: Lang;
  path: string;
  /** Öbür dildeki karşılığı. */
  alt: string;
  title: string;
  desc: string;
  image: string;
  body: string;
  ld: object[];
  /** Alttaki not (yoksa kaynak notu). */
  foot?: string;
}

function page(o: PageOpts): string {
  const l = o.lang;
  const other: Lang = l === 'en' ? 'tr' : 'en';
  const tr = l === 'tr' ? o.path : o.alt;
  const en = l === 'en' ? o.path : o.alt;
  const langSwitch = `<span class="lang">${(['en', 'tr'] as Lang[]).map((x) => x === l
    ? `<b>${x.toUpperCase()}</b>`
    : `<a href="${x === other ? o.alt : o.path}" hreflang="${x}" data-lang="${x}">${x.toUpperCase()}</a>`).join('')}</span>`;
  const social = SOCIAL.map((s) => `<a class="soc" href="${s.url}" target="_blank" rel="noopener" title="${s.name}" aria-label="WarSimBox · ${s.name}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${s.path}"/></svg></a>`).join('');
  return `<!doctype html>
<html lang="${l}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#86b3a2">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${SITE}${o.path}">
<link rel="alternate" hreflang="tr" href="${SITE}${tr}">
<link rel="alternate" hreflang="en" href="${SITE}${en}">
<link rel="alternate" hreflang="x-default" href="${SITE}${tr}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="WarSimBox">
<meta property="og:url" content="${SITE}${o.path}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${SITE}${o.image}">
<meta property="og:locale" content="${l === 'en' ? 'en_GB' : 'tr_TR'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800&display=swap" rel="stylesheet"></noscript>
<link rel="stylesheet" href="${CSS}">
${o.ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
</head>
<body>
<header class="top">
  <a class="brand" href="/" data-play="${l}"><img src="/icon.svg" alt="" width="28" height="28">WarSimBox</a>
  <nav>
    <a class="nav-link" href="${listPath(l)}">${T(l, 'Ansiklopedi', 'Encyclopedia')}</a>
    ${langSwitch}
    <a class="play" href="/" data-play="${l}">${T(l, 'Oyna', 'Play')}</a>
  </nav>
</header>
<main>
${o.body}
</main>
<footer class="foot">
  <div class="foot-row"><a href="/" data-play="${l}">${T(l, 'WarSimBox’ı tarayıcıda ücretsiz oyna', 'Play WarSimBox free in your browser')}</a><span class="social">${social}</span></div>
  ${o.foot ?? `<p>${T(l, 'Tarih ve teknik veriler yaygın kaynaklardan derlenmiştir; sürüme ve kaynağa göre küçük farklar olabilir.', 'History and specifications are compiled from widely used sources; figures can vary slightly between versions and sources.')}</p>`}
</footer>
<script>
// Dil seçimi oyuna da geçsin; "Oyna" bu sayfanın diliyle açar
for (const a of document.querySelectorAll('[data-lang],[data-play]')) a.addEventListener('click', () => {
  try { localStorage.setItem('warsim.lang', a.dataset.lang || a.dataset.play); } catch (e) {}
});
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- liste

function card(e: Entry, l: Lang): string {
  const s = e.spec;
  return `<a class="card" href="${pagePath(l, e.slug)}">
  <span class="card-img"><img src="${IMG}/${s.id}-34.webp" alt="${esc(name(s, l))}" width="1200" height="750" loading="lazy"></span>
  <span class="card-text">
    <span class="meta">${s.year} · ${esc(origin(s, l))} · ${tx(ROLE[s.role], l)}</span>
    <h2>${esc(name(s, l))}</h2>
    <span class="sum">${esc(tx(e.art.summary, l))}</span>
  </span>
</a>`;
}

function listPage(l: Lang, list: Entry[]): { path: string; html: string } {
  const path = listPath(l);
  const title = T(l, 'Uçak ansiklopedisi: İkinci Dünya Savaşı uçakları | WarSimBox', 'Aircraft encyclopedia: Second World War aircraft | WarSimBox');
  const desc = T(l,
    'WarSimBox’taki uçakların tarihçesi ve gerçek teknik verileri, en eskiden en yeniye: Hurricane, Spitfire ve dahası.',
    'History and real specifications of the aircraft in WarSimBox, from oldest to newest: the Hurricane, the Spitfire and more.');
  const body = `<section class="intro">
  <h1>${T(l, 'Uçak ansiklopedisi', 'Aircraft encyclopedia')}</h1>
  <p>${T(l,
    'WarSimBox’taki uçakların tarihçesi ve gerçek verileri, en eskiden en yeniye. Oyunda her uçak bu verilerden kurulan uçuş modeliyle uçar. Yeni uçaklar sırayla ekleniyor.',
    'The history and real data of the aircraft in WarSimBox, from oldest to newest. In the game, every aircraft flies with a flight model built from these figures. More aircraft are being added in order.')}</p>
</section>
<section class="cards">
${list.map((e) => card(e, l)).join('\n')}
</section>`;
  const ld = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, inLanguage: l, url: `${SITE}${path}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: list.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: name(e.spec, l), url: `${SITE}${pagePath(l, e.slug)}` })),
    },
  }];
  return { path, html: page({ lang: l, path, alt: listPath(l === 'en' ? 'tr' : 'en'), title, desc, image: '/og.jpg', body, ld }) };
}

// ---------------------------------------------------------------- uçak sayfası

/** Oyunda nasıl açılır: başlangıçta ya da araştırma şartları; ardından gelen uçak. */
function unlock(s: AircraftSpec, l: Lang): string {
  const node = aircraftNode(s.id);
  const techName = (id: string) => {
    const t = TECH_BY_ID[id];
    if (!t) return id;
    if (t.specId) {
      const sp = SPEC_LIST.find((x) => x.id === t.specId);
      return sp ? name(sp, l) : t.specId;
    }
    return l === 'en' ? TECH_EN[id]?.[0] ?? t.name : t.name;
  };
  const list = (ids: string[]) => {
    const n = ids.map((id) => `<b>${esc(techName(id))}</b>`);
    return n.length > 1 ? `${n.slice(0, -1).join(', ')} ${T(l, 've', 'and')} ${n.at(-1)}` : n[0];
  };
  if (!node) return '';
  const how = node.starting
    ? T(l, 'Başlangıçta açık; araştırma gerekmez.', 'Available from the start; no research needed.')
    : T(l, `Araç ağacında açılır: önce ${list(node.requires)} araştırılmalı.`, `Unlocked in the aircraft tree after researching ${list(node.requires)}.`);
  const next = TECH.filter((t) => t.kind === 'aircraft' && t.requires.includes(`ac_${s.id}`) && t.specId)
    .map((t) => {
      const sp = SPEC_LIST.find((x) => x.id === t.specId)!;
      const slug = ENCYCLOPEDIA[sp.id];
      return slug ? `<a href="${pagePath(l, slug)}">${esc(name(sp, l))}</a>` : `<b>${esc(name(sp, l))}</b>`;
    });
  return `${how}${next.length ? ` ${T(l, 'Ardından gelen', 'Leads on to')}: ${next.join(', ')}.` : ''}`;
}

function aircraftPage(l: Lang, e: Entry, prev: Entry | undefined, next: Entry | undefined, today: string): { path: string; html: string } {
  const s = e.spec;
  const a = e.art;
  const n = name(s, l);
  const path = pagePath(l, e.slug);
  const title = T(l, `${n}: tarihçe ve teknik veriler | WarSimBox`, `${n}: history and specifications | WarSimBox`);
  const desc = snippet(tx(a.lead, l));
  const stats: [string, string][] = [
    [T(l, 'Azami hız', 'Top speed'), T(l, `${num(l, s.vMax * 3.6)} km/sa · ${num(l, s.vMaxAlt)} m`, `${num(l, s.vMax * 3.6)} km/h · ${num(l, s.vMaxAlt)} m`)],
    [T(l, 'Tırmanma', 'Climb'), `${num(l, s.climbRate, 1)} m/${T(l, 'sn', 's')}`],
    [T(l, 'Sürekli dönüş', 'Sustained turn'), `${num(l, s.turnTime, 1)} ${T(l, 'sn', 's')}`],
    [T(l, 'Tutunma hızı', 'Stall speed'), T(l, `${num(l, s.vStall * 3.6)} km/sa`, `${num(l, s.vStall * 3.6)} km/h`)],
  ];
  const nav = (x: Entry | undefined, cls: string, label: string) => x
    ? `<a class="${cls}" href="${pagePath(l, x.slug)}"><small>${label}</small><b>${esc(name(x.spec, l))}</b><span>${x.spec.year}</span></a>`
    : '<span></span>';
  const body = `<nav class="crumb"><a href="${listPath(l)}">${T(l, 'Ansiklopedi', 'Encyclopedia')}</a> › <span>${esc(n)}</span></nav>
<header class="hero">
  <div class="hero-img"><img src="${IMG}/${s.id}-34.webp" alt="${esc(T(l, `${n}, oyundaki modeli`, `${n}, the in-game model`))}" width="1200" height="750"></div>
  <div class="hero-text">
    <div class="chips"><span>${s.year}</span><span>${esc(origin(s, l))}</span><span>${tx(ROLE[s.role], l)}</span></div>
    <h1>${esc(n)}</h1>
    <p class="lead">${esc(tx(a.lead, l))}</p>
  </div>
</header>
<div class="layout">
  <aside class="facts">
    <h2>${T(l, 'Künye', 'At a glance')}</h2>
    <dl>${a.facts.map((f) => `<div><dt>${esc(tx(f.k, l))}</dt><dd>${esc(tx(f.v, l))}</dd></div>`).join('')}</dl>
  </aside>
  <article class="text">
    ${a.sections.map((sec, i) => `<section>
      <h2>${esc(tx(sec.h, l))}</h2>
      ${sec.p.map((p) => `<p>${esc(tx(p, l))}</p>`).join('\n      ')}
    </section>${i === 0 ? `
    <figure class="side"><img src="${IMG}/${s.id}-yan.webp" alt="${esc(T(l, `${n}, yandan`, `${n}, side view`))}" width="1600" height="600" loading="lazy">
      <figcaption>${esc(T(l, `${n}: oyundaki modeli yandan.`, `${n}: the in-game model from the side.`))}</figcaption></figure>` : ''}`).join('\n    ')}
    <section class="ingame">
      <h2>${T(l, 'WarSimBox’ta', 'In WarSimBox')}</h2>
      ${a.inGame.map((p) => `<p>${esc(tx(p, l))}</p>`).join('\n      ')}
      <p>${unlock(s, l)}</p>
      <dl class="stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <p class="small">${T(l, 'Bu değerler oyunun uçuş modelinden hesaplanır (tırmanma, dönüş ve tutunma deniz seviyesinde).', 'These figures come from the game’s flight model (climb, turn and stall at sea level).')}</p>
      <a class="play big" href="/" data-play="${l}">${T(l, 'Bu uçakla oyna', 'Fly it in WarSimBox')}</a>
    </section>
  </article>
</div>
<nav class="pager">${nav(prev, 'prev', T(l, '‹ Önceki', '‹ Previous'))}${nav(next, 'next', T(l, 'Sonraki ›', 'Next ›'))}</nav>`;
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: T(l, 'Ansiklopedi', 'Encyclopedia'), item: `${SITE}${listPath(l)}` },
      { '@type': 'ListItem', position: 2, name: n, item: `${SITE}${path}` },
    ],
  };
  const article = {
    '@context': 'https://schema.org', '@type': 'Article', headline: T(l, `${n}: tarihçe ve teknik veriler`, `${n}: history and specifications`),
    description: desc, inLanguage: l, url: `${SITE}${path}`, image: [`${SITE}${IMG}/${s.id}-og.jpg`, `${SITE}${IMG}/${s.id}-34.webp`],
    about: { '@type': 'Thing', name: n },
    datePublished: PUBLISHED,
    dateModified: today,
    author: { '@type': 'Organization', name: 'WarSimBox', url: SITE },
    publisher: { '@type': 'Organization', name: 'WarSimBox', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } },
  };
  return {
    path,
    html: page({ lang: l, path, alt: pagePath(l === 'en' ? 'tr' : 'en', e.slug), title, desc, image: `${IMG}/${s.id}-og.jpg`, body, ld: [article, crumbs] }),
  };
}

// ---------------------------------------------------------------- dışa

/** Bütün ansiklopedi sayfaları: adres (/ile biten) ve HTML. today: derleme günü (YYYY-AA-GG). */
export function encyclopediaPages(today: string): { path: string; html: string }[] {
  const list = entries();
  const out: { path: string; html: string }[] = [];
  for (const l of ['tr', 'en'] as Lang[]) {
    out.push(listPage(l, list));
    list.forEach((e, i) => out.push(aircraftPage(l, e, list[i - 1], list[i + 1], today)));
  }
  return out;
}

/** Site haritası: ana sayfa ve ansiklopedi (iki dil birbirinin karşılığı olarak). */
/** Gizlilik Politikası ve KVKK Aydınlatma Metni: ansiklopediyle aynı çerçeve. */
export function legalPages(): { path: string; html: string }[] {
  const kinds = Object.keys(LEGAL_PATHS) as LegalKind[];
  return kinds.flatMap((k) => (['tr', 'en'] as Lang[]).map((lang) => {
    const t = LEGAL_TEXT[k][lang];
    const path = LEGAL_PATHS[k][lang];
    return {
      path,
      html: page({
        lang, path, alt: LEGAL_PATHS[k][lang === 'en' ? 'tr' : 'en'], title: `${t.title} | WarSimBox`, desc: t.desc, image: '/og.jpg', ld: [], foot: '',
        body: `<article class="text legal"><h1>${esc(t.title)}</h1>${t.html}</article>`,
      }),
    };
  }));
}

export function sitemap(today: string): string {
  const pairs: [string, string][] = [[ENC_TR, ENC_EN], ...entries().map((e): [string, string] => [pagePath('tr', e.slug), pagePath('en', e.slug)])];
  const url = (loc: string, tr: string, en: string) => `  <url>
    <loc>${SITE}${loc}</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="tr" href="${SITE}${tr}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${en}"/>
  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
  </url>
${pairs.flatMap(([tr, en]) => [url(tr, tr, en), url(en, tr, en)]).join('\n')}
</urlset>
`;
}
