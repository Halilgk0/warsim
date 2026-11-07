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
import { AA_ENCYCLOPEDIA, ENC_AA_EN, ENC_AA_TR, ENC_EN, ENC_TR, ENCYCLOPEDIA } from './liste';
import { GUN_ARTICLES, type GunArticle } from './makale/hava-savunmasi';
// Silah tablosu saf veri dosyasından: airDefense.ts araziyi de yükler (Node'da harita üretilir), ansiklopediye gerekmez
import { AA_CLASS_ORDER, AA_WEAPONS, flightTime, practicalPerMin, type AAClass, type AAWeaponDef } from '../sim/structures/aaWeapons';
import { LEGAL_PATHS, type LegalKind } from '../yasal/liste';
import { LEGAL_TEXT } from '../yasal/metin';

type Lang = 'tr' | 'en';

const SITE = 'https://warsimbox.com';
/** Ansiklopedinin ilk yayın günü (yapılandırılmış veri); güncelleme günü derlemeden gelir. */
const PUBLISHED = '2026-10-30';
/** Hava savunması bölümünün ilk yayın günü. */
const AA_PUBLISHED = '2026-11-06';
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
<meta name="theme-color" content="#171e1b">
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
<div class="rail" aria-hidden="true"><b class="up"></b><span class="track"><i></i></span><b class="dn"></b></div>
<script>
// Dil seçimi oyuna da geçsin; "Oyna" bu sayfanın diliyle açar
for (const a of document.querySelectorAll('[data-lang],[data-play]')) a.addEventListener('click', () => {
  try { localStorage.setItem('warsim.lang', a.dataset.lang || a.dataset.play); } catch (e) {}
});
// Kaydırma rayı: sayfanın kendi kaydırmasını gösterir, içerik sütununun hemen sağında durur (ekran kenarında değil).
// Sarı oval tutamak sürüklenir, raya dokununca o noktaya gidilir; uçtaki oklar adım adım kaydırır, basılı tutunca sürer.
// Betik çalışmazsa tarayıcının kendi çubuğu kalır.
(() => {
  const root = document.documentElement, rail = document.querySelector('.rail'), track = rail.querySelector('.track'), thumb = track.firstElementChild, top = document.querySelector('.top');
  root.classList.add('rail-on');
  let queued = false, drag = null, hold = 0;
  const span = () => root.scrollHeight - innerHeight;
  const draw = () => {
    queued = false;
    const max = span();
    rail.hidden = max < 4;
    if (rail.hidden) return;
    rail.style.top = Math.max(12, top.getBoundingClientRect().bottom + 12) + 'px';
    thumb.style.transform = 'translateY(' + ((track.clientHeight - thumb.offsetHeight) * Math.min(1, scrollY / max)) + 'px)';
  };
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  const scrollFor = (clientY, grab) => {
    const r = track.getBoundingClientRect(), th = thumb.offsetHeight;
    scrollTo(0, Math.max(0, Math.min(1, (clientY - r.top - grab) / Math.max(1, r.height - th))) * span());
  };
  track.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const t = thumb.getBoundingClientRect();
    const grab = e.target === thumb ? e.clientY - t.top : thumb.offsetHeight / 2;
    drag = { grab, id: e.pointerId };
    track.setPointerCapture(e.pointerId);
    rail.classList.add('drag');
    if (e.target !== thumb) scrollFor(e.clientY, grab);
  });
  track.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) scrollFor(e.clientY, drag.grab); });
  const end = () => { drag = null; rail.classList.remove('drag'); };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  // Oklar: bir dokunuş bir adım; basılı tutunca kısa bir beklemeden sonra sürekli
  const stop = () => { clearTimeout(hold); clearInterval(hold); hold = 0; };
  for (const [sel, dir] of [['.up', -1], ['.dn', 1]]) {
    const b = rail.querySelector(sel);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stop();
      const step = () => scrollBy(0, dir * Math.max(80, innerHeight * 0.25));
      step();
      hold = setTimeout(() => { hold = setInterval(step, 90); }, 350);
      b.setPointerCapture(e.pointerId);
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('lostpointercapture', stop);
  }
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  if (window.ResizeObserver) new ResizeObserver(ask).observe(document.body);
  draw();
})();
// Liste sayfası: arama (yazdıkça süzer; Türkçe harf ve boşluk farkı gözetmez) ve sıralama (her kart kümesinin içinde)
(() => {
  const bar = document.querySelector('.tools');
  if (!bar) return;
  const input = bar.querySelector('input');
  const none = document.querySelector('.none');
  const fold = { 'ı': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c', 'â': 'a', 'î': 'i', 'û': 'u' };
  const norm = (s) => s.toLocaleLowerCase('tr').replace(/[ışğüöçâîû]/g, (c) => fold[c]).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // Önce başlıkta (ad, kısaltma, yıl, ülke, rol) aranır; orada hiç sonuç yoksa kısa açıklamada da
  const text = (el, sel) => [...el.querySelectorAll(sel)].map((n) => n.textContent).join(' ');
  const cards = [...document.querySelectorAll('.cards .card')].map((el, i) => {
    const head = ' ' + norm(text(el, 'h2, h3, .meta') + ' ' + (el.dataset.k || ''));
    const all = head + ' ' + norm(text(el, '.sum'));
    return { el, i, head, all, headFlat: head.replace(/ /g, ''), allFlat: all.replace(/ /g, '') };
  });
  // Her kelime bir kelimenin başında ("il 2" → Il-2; "Birleşik"teki "il" sayılmaz) ya da bütün sorgu bitişik yazılmış ("bf109", "p51")
  const filter = () => {
    const q = norm(input.value);
    const words = q.split(' ').filter(Boolean);
    const flat = q.replace(/ /g, '');
    const hit = (hay, hayFlat) => !flat || hayFlat.includes(flat) || words.every((w) => hay.includes(' ' + w));
    const inHead = cards.some((c) => hit(c.head, c.headFlat));
    let shown = 0;
    for (const c of cards) {
      const ok = inHead ? hit(c.head, c.headFlat) : hit(c.all, c.allFlat);
      c.el.hidden = !ok;
      if (ok) shown++;
    }
    for (const g of document.querySelectorAll('.aa-group')) g.hidden = !g.querySelector('.card:not([hidden])');
    none.hidden = shown > 0;
  };
  const by = {
    year: (a, b) => a.el.dataset.year - b.el.dataset.year || a.i - b.i,
    name: (a, b) => a.el.dataset.name.localeCompare(b.el.dataset.name, document.documentElement.lang),
    speed: (a, b) => b.el.dataset.speed - a.el.dataset.speed || a.i - b.i,
    bore: (a, b) => a.el.dataset.bore - b.el.dataset.bore || a.el.dataset.year - b.el.dataset.year,
  };
  const sort = (key) => {
    for (const box of document.querySelectorAll('.cards')) {
      const own = cards.filter((c) => c.el.parentElement === box).sort(by[key]);
      for (const c of own) box.appendChild(c.el);
    }
    for (const b of bar.querySelectorAll('[data-sort]')) {
      const on = b.dataset.sort === key;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-sort]'); if (b) sort(b.dataset.sort); });
  none.querySelector('[data-clear]').addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  // Geri dönünce tarayıcı kutuyu doldurmuş olabilir
  if (input.value) filter();
})();
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- liste

/**
 * Liste sayfasının arama ve sıralama çubuğu (betik sayfanın sonunda). Kartlar düz HTML kalır; arama ve sıralama yalnız
 * tarayıcıda, kartların data-* değerleriyle. sorts: [anahtar, etiket]; ilki varsayılan (sayfanın kendi sırası).
 */
function tools(l: Lang, what: string, sorts: [string, string][]): string {
  return `<div class="tools">
  <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg><span class="vh">${T(l, `${what} ara`, `Search ${what}`)}</span><input type="search" placeholder="${T(l, 'Ara: ad, ülke, yıl', 'Search: name, country, year')}" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
  <div class="sort" role="group" aria-label="${T(l, 'Sırala', 'Sort')}"><span>${T(l, 'Sırala', 'Sort')}</span>${sorts.map(([k, label], i) => `<button type="button" data-sort="${k}" aria-pressed="${i === 0}"${i === 0 ? ' class="on"' : ''}>${label}</button>`).join('')}</div>
</div>
<p class="none" hidden>${T(l, 'Aramanla eşleşen kayıt yok.', 'Nothing matches your search.')} <button type="button" data-clear>${T(l, 'Aramayı temizle', 'Clear search')}</button></p>`;
}

function card(e: Entry, l: Lang): string {
  const s = e.spec;
  return `<a class="card" href="${pagePath(l, e.slug)}" data-year="${s.year}" data-name="${esc(name(s, l))}" data-speed="${Math.round(s.vMax * 3.6)}" data-k="${esc(s.abbr)}">
  <span class="card-img"><img src="${IMG}/${s.id}-kart.webp" alt="${esc(name(s, l))}" width="1200" height="750" loading="lazy"></span>
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
  ${sectNav(l, 'ac')}
  <h1>${T(l, 'Uçak ansiklopedisi', 'Aircraft encyclopedia')}</h1>
  <p>${T(l,
    'WarSimBox’taki uçakların tarihçesi ve gerçek verileri, en eskiden en yeniye. Oyunda her uçak bu verilerden kurulan uçuş modeliyle uçar. Yeni uçaklar sırayla ekleniyor.',
    'The history and real data of the aircraft in WarSimBox, from oldest to newest. In the game, every aircraft flies with a flight model built from these figures. More aircraft are being added in order.')}</p>
  <p>${T(l,
    `Bu uçaklara karşı kullanılan uçaksavar toplarını da <a href="${ENC_AA_TR}">hava savunması</a> bölümünde bulabilirsin: Flak 88, Bofors 40 mm, Oerlikon 20 mm ve dahası.`,
    `You can also find the anti-aircraft guns used against them in the <a href="${ENC_AA_EN}">air defence</a> section: the Flak 88, the Bofors 40 mm, the Oerlikon 20 mm and more.`)}</p>
</section>
${tools(l, T(l, 'Uçak', 'aircraft'), [['year', T(l, 'Yıl', 'Year')], ['name', T(l, 'Ad', 'Name')], ['speed', T(l, 'Hız', 'Speed')]])}
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
    // Sayı ile birimi ayrılmaz boşluk bağlar: dar ekranda yalnız " · " yerinde kırılır.
    [T(l, 'Azami hız', 'Top speed'), T(l, `${num(l, s.vMax * 3.6)}&nbsp;km/sa · ${num(l, s.vMaxAlt)}&nbsp;m`, `${num(l, s.vMax * 3.6)}&nbsp;km/h · ${num(l, s.vMaxAlt)}&nbsp;m`)],
    [T(l, 'Tırmanma', 'Climb'), `${num(l, s.climbRate, 1)}&nbsp;m/${T(l, 'sn', 's')}`],
    [T(l, 'Sürekli dönüş', 'Sustained turn'), `${num(l, s.turnTime, 1)}&nbsp;${T(l, 'sn', 's')}`],
    [T(l, 'Tutunma hızı', 'Stall speed'), T(l, `${num(l, s.vStall * 3.6)}&nbsp;km/sa`, `${num(l, s.vStall * 3.6)}&nbsp;km/h`)],
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

// ---------------------------------------------------------------- hava savunması

/** Liste sayfalarının başındaki bölüm seçimi: seçili olan açık zeminde. */
function sectNav(l: Lang, on: 'ac' | 'aa'): string {
  const item = (k: 'ac' | 'aa', href: string, label: string) => k === on
    ? `<a href="${href}" class="on" aria-current="page">${label}</a>`
    : `<a href="${href}">${label}</a>`;
  return `<nav class="sect" aria-label="${T(l, 'Ansiklopedi bölümleri', 'Encyclopedia sections')}">${item('ac', listPath(l), T(l, 'Uçaklar', 'Aircraft'))}${item('aa', aaListPath(l), T(l, 'Hava savunması', 'Air defence'))}</nav>`;
}

interface GunEntry {
  w: AAWeaponDef;
  art: GunArticle;
  slug: string;
}

const aaListPath = (l: Lang) => (l === 'en' ? ENC_AA_EN : ENC_AA_TR);
const gunPath = (l: Lang, slug: string) => `${aaListPath(l)}${slug}/`;
const gunName = (g: GunEntry, l: Lang) => tx(g.art.name, l);

/** Makalesi ve adresi olan silahlar, oyundaki sırayla (hafiften ağıra). */
function gunEntries(): GunEntry[] {
  return GUN_ARTICLES.filter((a) => AA_ENCYCLOPEDIA[a.id] && AA_WEAPONS[a.id]).map((art) => ({ art, w: AA_WEAPONS[art.id], slug: AA_ENCYCLOPEDIA[art.id] }));
}

const AA_CLASS: Record<AAClass, { name: Tx; about: Tx }> = {
  hafif: {
    name: { tr: 'Hafif uçaksavar', en: 'Light anti-aircraft' },
    about: {
      tr: 'Makineliler ve 20 mm’lik toplar dakikada yüzlerce mermi atar; alçaktan gelen avcı ve taarruz uçaklarına karşı ilk savunma hattıdır. Menzilleri 2 km dolayında kalır.',
      en: 'Machine guns and 20 mm cannon fire hundreds of rounds a minute and are the first line of defence against low-flying fighters and attack aircraft. Their reach is around 2 km.',
    },
  },
  orta: {
    name: { tr: 'Orta uçaksavar', en: 'Medium anti-aircraft' },
    about: {
      tr: '37 ve 40 mm’lik otomatik toplar, daha ağır mermileriyle 4 km dolayına kadar yükseklikte dalış bombardıman ve taarruz uçaklarını vurur; hafif topların yetişemediği yüksekliği kapatır.',
      en: '37 and 40 mm automatic guns hit dive bombers and attack aircraft up to about 4 km with their heavier shells, covering heights the light guns cannot reach.',
    },
  },
  agir: {
    name: { tr: 'Ağır uçaksavar', en: 'Heavy anti-aircraft' },
    about: {
      tr: '88 mm ve daha büyük toplar zaman tapalı mermilerini 8–13 km yüksekliğe gönderir. Bataryalar hâlinde, atış kontrol cihazları ve sonra radarla yönetilerek yüksekten gelen bombardıman uçaklarına ateş ederler.',
      en: 'Guns of 88 mm and larger send their time-fuzed shells to 8–13 km. They fire in batteries at high-flying bombers, directed by fire-control predictors and later by radar.',
    },
  },
};

/** Silahın türü (başlıkta): makineli ya da top. */
const gunNoun = (g: GunEntry, l: Lang) => (g.w.bore < 20 ? T(l, 'uçaksavar makinelisi', 'anti-aircraft machine gun') : T(l, 'uçaksavar topu', 'anti-aircraft gun'));
const km1 = (l: Lang, m: number) => `${num(l, m / 1000, 1)}&nbsp;km`;

function gunCard(g: GunEntry, l: Lang): string {
  const n = gunName(g, l);
  return `<a class="card" href="${gunPath(l, g.slug)}" data-year="${g.w.year}" data-name="${esc(n)}" data-bore="${g.w.bore}" data-k="${esc(`${g.w.short} ${g.w.bore} mm`)}">
  <span class="card-img"><img src="${IMG}/gun-${g.w.id}-kart.webp" alt="${esc(n)}" width="1200" height="750" loading="lazy"></span>
  <span class="card-text">
    <span class="meta">${g.w.year} · ${esc(gunOrigin(g.w, l))} · ${num(l, g.w.bore, 1)} mm</span>
    <h3>${esc(n)}</h3>
    <span class="sum">${esc(tx(g.art.summary, l))}</span>
  </span>
</a>`;
}

const gunOrigin = (w: AAWeaponDef, l: Lang) => (l === 'en' ? ORIGIN_EN[w.origin] ?? w.origin : w.origin);

function gunListPage(l: Lang, list: GunEntry[]): { path: string; html: string } {
  const path = aaListPath(l);
  const title = T(l, 'Uçaksavar topları: İkinci Dünya Savaşı hava savunması | WarSimBox', 'Anti-aircraft guns: Second World War air defence | WarSimBox');
  const desc = T(l,
    'Flak 88, Bofors 40 mm, Oerlikon 20 mm, Flakvierling ve dahası: İkinci Dünya Savaşı uçaksavar toplarının tarihçesi ve gerçek teknik verileri.',
    'The Flak 88, Bofors 40 mm, Oerlikon 20 mm, Flakvierling and more: the history and real specifications of Second World War anti-aircraft guns.');
  const groups = AA_CLASS_ORDER.map((c) => {
    // Grubun içinde yıla göre (sıralama çubuğunun varsayılanı da bu)
    const items = list.filter((g) => g.w.cls === c).sort((a, b) => a.w.year - b.w.year || a.w.rank - b.w.rank);
    if (!items.length) return '';
    return `<section class="aa-group">
  <h2>${tx(AA_CLASS[c].name, l)}</h2>
  <p>${tx(AA_CLASS[c].about, l)}</p>
  <div class="cards">
${items.map((g) => gunCard(g, l)).join('\n')}
  </div>
</section>`;
  }).join('\n');
  const body = `<section class="intro">
  ${sectNav(l, 'aa')}
  <h1>${T(l, 'Hava savunması: uçaksavar topları', 'Air defence: anti-aircraft guns')}</h1>
  <p>${T(l,
    'WarSimBox’taki uçaksavar silahlarının tarihçesi ve gerçek verileri: Amerikan .50 kalibre makineliden Alman 88’liğine ve flak kulelerinin 12,8 cm’lik toplarına kadar. Oyunda her silah bu verilerden kurulan atış modeliyle ateş eder: mermi havada yavaşlar, izli mermi kendini imha eder, ağır topun zaman tapalı mermisi hedefe saniyeler sonra varır.',
    'The history and real data of the anti-aircraft weapons in WarSimBox, from the American .50 calibre machine gun to the German 88 and the 12.8 cm guns of the flak towers. In the game every weapon fires with a ballistic model built from these figures: shells slow down in the air, tracers self-destruct, and a heavy gun’s time-fuzed shell reaches its target seconds later.')}</p>
</section>
${tools(l, T(l, 'Top', 'guns'), [['year', T(l, 'Yıl', 'Year')], ['name', T(l, 'Ad', 'Name')], ['bore', T(l, 'Kalibre', 'Calibre')]])}
${groups}`;
  const ld = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, inLanguage: l, url: `${SITE}${path}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: list.map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: gunName(g, l), url: `${SITE}${gunPath(l, g.slug)}` })),
    },
  }];
  return { path, html: page({ lang: l, path, alt: aaListPath(l === 'en' ? 'tr' : 'en'), title, desc, image: `${IMG}/gun-aa88-og.jpg`, body, ld }) };
}

/** Oyunda nasıl açılır: başlangıçta ya da hava savunması ağacındaki araştırma ve onun önkoşulları. */
function gunUnlock(w: AAWeaponDef, l: Lang): string {
  const techName = (id: string) => (l === 'en' ? TECH_EN[id]?.[0] ?? TECH_BY_ID[id]?.name ?? id : TECH_BY_ID[id]?.name ?? id);
  const list = (ids: string[]) => {
    const n = ids.map((id) => `<b>${esc(techName(id))}</b>`);
    return n.length > 1 ? `${n.slice(0, -1).join(', ')} ${T(l, 've', 'and')} ${n.at(-1)}` : n[0];
  };
  const made = T(l, 'Fabrikada üretilir ve bataryanın yuvasına takılır.', 'It is built at the factory and fitted to a battery’s gun pit.');
  if (!w.requires) return `${T(l, 'Başlangıçta açık; araştırma gerekmez.', 'Available from the start; no research needed.')} ${made}`;
  const pre = TECH_BY_ID[w.requires]?.requires ?? [];
  return `${T(l,
    `Hava savunması ağacında ${list([w.requires])} araştırılınca açılır${pre.length ? `; bunun için önce ${list(pre)} gerekir` : ''}.`,
    `Unlocked in the air defence tree by researching ${list([w.requires])}${pre.length ? `, which first needs ${list(pre)}` : ''}.`)} ${made}`;
}

function gunPage(l: Lang, g: GunEntry, prev: GunEntry | undefined, next: GunEntry | undefined, today: string): { path: string; html: string } {
  const w = g.w;
  const a = g.art;
  const n = gunName(g, l);
  const path = gunPath(l, g.slug);
  const title = T(l, `${n} ${gunNoun(g, l)}: tarihçe ve teknik veriler | WarSimBox`, `${n} ${gunNoun(g, l)}: history and specifications | WarSimBox`);
  const desc = snippet(tx(a.lead, l));
  const sec = T(l, 'sn', 's');
  const stats: [string, string][] = [
    [T(l, 'Menzil', 'Range'), km1(l, w.range)],
    [T(l, 'Etkili tavan', 'Effective ceiling'), km1(l, w.ceiling)],
    [T(l, 'Pratik atış', 'Practical rate'), `~${num(l, practicalPerMin(w))}&nbsp;${T(l, 'atış/dk', 'rds/min')}`],
    [T(l, 'Tavana varış', 'Time to ceiling'), `${num(l, Math.round(flightTime(w, w.ceiling)))}&nbsp;${sec}`],
  ];
  const kind = w.kind === 'flak' ? T(l, 'Zaman tapalı mermi', 'Time-fuzed shell') : w.burstRadius > 0 ? T(l, 'Kendini imha eden izli mermi', 'Self-destructing tracer') : T(l, 'İzli mermi', 'Tracer');
  const nav = (x: GunEntry | undefined, cls: string, label: string) => x
    ? `<a class="${cls}" href="${gunPath(l, x.slug)}"><small>${label}</small><b>${esc(gunName(x, l))}</b><span>${x.w.year}</span></a>`
    : '<span></span>';
  const body = `<nav class="crumb"><a href="${listPath(l)}">${T(l, 'Ansiklopedi', 'Encyclopedia')}</a> › <a href="${aaListPath(l)}">${T(l, 'Hava savunması', 'Air defence')}</a> › <span>${esc(n)}</span></nav>
<header class="hero">
  <div class="hero-img"><img src="${IMG}/gun-${w.id}-kart.webp" alt="${esc(T(l, `${n}, oyundaki modeli`, `${n}, the in-game model`))}" width="1200" height="750"></div>
  <div class="hero-text">
    <div class="chips"><span>${w.year}</span><span>${esc(gunOrigin(w, l))}</span><span>${tx(AA_CLASS[w.cls].name, l)}</span><span>${num(l, w.bore, 1)} mm</span></div>
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
    ${a.sections.map((s) => `<section>
      <h2>${esc(tx(s.h, l))}</h2>
      ${s.p.map((p) => `<p>${esc(tx(p, l))}</p>`).join('\n      ')}
    </section>`).join('\n    ')}
    <section class="ingame">
      <h2>${T(l, 'WarSimBox’ta', 'In WarSimBox')}</h2>
      ${a.inGame.map((p) => `<p>${esc(tx(p, l))}</p>`).join('\n      ')}
      <p>${gunUnlock(w, l)}</p>
      <dl class="stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <p class="small">${T(l,
        `${kind}. Bu değerler oyunun atış modelinden hesaplanır: mermi havada yavaşlar; pratik atış hızı şarjör ya da tarak değiştirme dahil, eğitimli mürettebatla.`,
        `${kind}. These figures come from the game’s ballistic model: shells slow down in the air, and the practical rate includes magazine or clip changes with a trained crew.`)}</p>
      <a class="play big" href="/" data-play="${l}">${T(l, 'Oyunda kur', 'Deploy it in WarSimBox')}</a>
    </section>
  </article>
</div>
<nav class="pager">${nav(prev, 'prev', T(l, '‹ Önceki', '‹ Previous'))}${nav(next, 'next', T(l, 'Sonraki ›', 'Next ›'))}</nav>`;
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: T(l, 'Ansiklopedi', 'Encyclopedia'), item: `${SITE}${listPath(l)}` },
      { '@type': 'ListItem', position: 2, name: T(l, 'Hava savunması', 'Air defence'), item: `${SITE}${aaListPath(l)}` },
      { '@type': 'ListItem', position: 3, name: n, item: `${SITE}${path}` },
    ],
  };
  const article = {
    '@context': 'https://schema.org', '@type': 'Article', headline: T(l, `${n} ${gunNoun(g, l)}: tarihçe ve teknik veriler`, `${n} ${gunNoun(g, l)}: history and specifications`),
    description: desc, inLanguage: l, url: `${SITE}${path}`, image: [`${SITE}${IMG}/gun-${w.id}-og.jpg`, `${SITE}${IMG}/gun-${w.id}-kart.webp`],
    about: { '@type': 'Thing', name: n },
    datePublished: AA_PUBLISHED,
    dateModified: today,
    author: { '@type': 'Organization', name: 'WarSimBox', url: SITE },
    publisher: { '@type': 'Organization', name: 'WarSimBox', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } },
  };
  return {
    path,
    html: page({ lang: l, path, alt: gunPath(l === 'en' ? 'tr' : 'en', g.slug), title, desc, image: `${IMG}/gun-${w.id}-og.jpg`, body, ld: [article, crumbs] }),
  };
}

// ---------------------------------------------------------------- dışa

/** Bütün ansiklopedi sayfaları: adres (/ile biten) ve HTML. today: derleme günü (YYYY-AA-GG). */
export function encyclopediaPages(today: string): { path: string; html: string }[] {
  const list = entries();
  const guns = gunEntries();
  const out: { path: string; html: string }[] = [];
  for (const l of ['tr', 'en'] as Lang[]) {
    out.push(listPage(l, list));
    list.forEach((e, i) => out.push(aircraftPage(l, e, list[i - 1], list[i + 1], today)));
    out.push(gunListPage(l, guns));
    guns.forEach((g, i) => out.push(gunPage(l, g, guns[i - 1], guns[i + 1], today)));
  }
  return out;
}

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

/** Site haritası: ana sayfa ve ansiklopedi, uçaklar ve hava savunması (iki dil birbirinin karşılığı olarak). */
export function sitemap(today: string): string {
  const pairs: [string, string][] = [
    [ENC_TR, ENC_EN], ...entries().map((e): [string, string] => [pagePath('tr', e.slug), pagePath('en', e.slug)]),
    [ENC_AA_TR, ENC_AA_EN], ...gunEntries().map((g): [string, string] => [gunPath('tr', g.slug), gunPath('en', g.slug)]),
  ];
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
