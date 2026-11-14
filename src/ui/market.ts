// Hazine penceresi: kasa özeti, madenler, evlerin geliri, son hareketler. İki görünüm: genel hazine (üst çubuk, para çipi,
// belediye) ve tek bir madenin hazinesi (maden paneli ya da listedeki madene dokununca; üstte o madenin kartı).
// Maden listesi kısa tutulur: en çok getiren üç ocak ve en son kurulan. Görünüm belediye ekranıyla aynı aileden
// (style.css ".modal-card.civic"), yeşil başlıklı. Pazar açıksa (MARKET_ON) uluslararası pazardan alım ve hangardan satış da.

import type { World } from '../sim/world';
import { SPECS, ROLE_NAMES } from '../sim/aircraft/specs';
import { HOUSE_INCOME, MAINT_CREW, MARKET_ON, SELL_RATE, STRUCTURE_COST, aircraftPrice, fmtMoney, richnessName, richnessTier } from '../sim/economy';
import { STRUCTURE_DEFS, type Structure, type StructureKind } from '../sim/structures/structure';
import type { Airbase, Airframe } from '../sim/structures/airbase';
import { aircraftThumb, mineThumb } from '../render/thumbs';
import { bar, esc, fmtDur, fmtStamp, fmtTime, hpColor, nf, pct } from './dom';
import { L, count } from '../i18n';

/** Bir uçağın pazardaki satış fiyatı (yıpranma düşürür). */
export function sellPrice(af: Airframe): number {
  return Math.round(aircraftPrice(SPECS[af.specId]) * SELL_RATE * (1 - af.wear * 0.3));
}

/** Satılacak uçak: aynı tipte en yıpranmış hazır olan. */
export function sellCandidate(base: Airbase, specId: string): Airframe | null {
  let best: Airframe | null = null;
  for (const af of base.inventory) if (af.specId === specId && af.status === 'ready' && (!best || af.wear > best.wear)) best = af;
  return best;
}

/** Arma: defne dalları arasında para yığını. */
const CREST = `<svg class="tw-crest" viewBox="0 0 64 56" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="32" cy="38" rx="12" ry="4.2"/><path d="M20 38v-6M44 38v-6"/>
    <ellipse cx="32" cy="32" rx="12" ry="4.2"/><path d="M20 32v-6M44 32v-6"/>
    <ellipse cx="32" cy="26" rx="12" ry="4.2"/><path d="M20 26v-6M44 26v-6"/>
    <ellipse cx="32" cy="20" rx="12" ry="4.2"/>
    <path d="M32 9v4M27 10.5l1.2 3M37 10.5l-1.2 3"/>
    <path d="M11 46C5 40 3 31 5 22M53 46c6-6 8-15 6-24"/>
    <path d="M5 22l4 3M4 29l5 1M6 36l5-1M9 42l4-3M59 22l-4 3M60 29l-5 1M58 36l-5-1M55 42l-4-3"/>
  </g>
</svg>`;

const ownMines = (w: World, team: number): Structure[] => w.structures.filter((s) => s.team === team && s.kind === 'mine' && !s.destroyed);

/** Pencere başlığı (arma, ad, alt satır). mineId: tek madenin hazinesi. */
export function marketTitle(w: World, team: number, mineId: number | null): string {
  const mine = mineId !== null ? ownMines(w, team).find((s) => s.id === mineId) : undefined;
  const name = MARKET_ON ? L('Hazine ve pazar', 'Treasury and market') : L('Hazine', 'Treasury');
  const sub = mine ? esc(mine.name) : `${esc(w.teams[team]?.name ?? '')} · ${L('madenler, kira ve hesap defteri', 'mines, rent and the ledger')}`;
  return `${CREST}<span class="tw-title">${name}<small>${sub}</small></span>`;
}

function head(title: string, note = '', link = ''): string {
  return `<h3><span class="tw-orn">❖</span><span>${title}</span>${note ? `<small>${note}</small>` : ''}<i></i>${link}</h3>`;
}

const perMin = (): string => `kr/${L('dk', 'min')}`;

/** Maden damarı rozeti (inşaat bitmeden bilinmez). */
function vein(s: Structure): string {
  return s.active ? `<span class="rich r${richnessTier(s.richness)}">${richnessName(s.richness)}</span>` : `<span class="tw-soft">${L('inşaat bitince belli olur', 'known once built')}</span>`;
}

/** Listedeki maden kartı: küçük görsel, ad, damar, üretim, kazanç, sağlamlık; dokununca o madene gidilir. */
function mineCard(w: World, s: Structure, tag: string, sel: boolean): string {
  const hp = (s.hp / s.maxHp) * 100;
  return `<button class="tr-mine${sel ? ' sel' : ''}" data-act="mk-mine" data-id="${s.id}" title="${L('Madene git ve hazinesini aç', 'Go to the mine and open its treasury')}">
    <img src="${mineThumb(s.id)}" alt="">
    <span class="tr-m-main">
      <b>${esc(s.name)}</b>
      <span class="tr-m-row">${vein(s)}${tag ? `<em>${tag}</em>` : ''}</span>
      <span class="tr-m-row"><strong>${s.active ? `${nf.format(w.mineOutput(s) * 60)} ${perMin()}` : `${L('inşaat', 'building')} ${pct(s.build)}`}</strong><span class="tw-soft">${L('kazanç', 'earned')} ${nf.format(s.earned)} kr</span></span>
      ${bar(hp, hpColor(hp), true)}
    </span>
  </button>`;
}

/** Tek madenin kartı (o madenin hazinesi): büyük görsel ve ayrıntılar. */
function mineHero(w: World, team: number, s: Structure): string {
  const all = ownMines(w, team);
  const out = w.mineOutput(s) * 60;
  const total = w.mineRate(team);
  const rank = [...all].sort((a, b) => w.mineOutput(b) - w.mineOutput(a)).indexOf(s) + 1;
  const hp = (s.hp / s.maxHp) * 100;
  const loss = Math.round((1 - (0.3 + 0.7 * (s.hp / s.maxHp))) * 100);
  const cost = STRUCTURE_COST.mine;
  const kv = (k: string, v: string): string => `<span>${k}</span><b>${v}</b>`;
  return `<div class="tr-hero">
    <img src="${mineThumb(s.id)}" alt="">
    <div class="tr-h-main">
      <div class="tr-h-top"><b>${esc(s.name)}</b>${vein(s)}</div>
      <div class="tr-kv">
        ${kv(L('Üretim', 'Output'), s.active ? `${nf.format(out)} ${perMin()}${loss > 0 ? ` <i>(${L(`hasardan %${loss} düşük`, `${loss}% lower from damage`)})</i>` : ''}` : `${L('inşaat', 'building')} ${pct(s.build)}`)}
        ${kv(L('Maden gelirindeki payı', 'Share of mine income'), s.active && total > 0 ? L(`%${Math.round((out / total) * 100)}`, `${Math.round((out / total) * 100)}%`) : '—')}
        ${kv(L('Sırası', 'Rank'), s.active ? L(`${all.length} ocak içinde ${rank}.`, `${rank} of ${all.length}`) : '—')}
        ${kv(L('Toplam kazanç', 'Total earned'), `${nf.format(s.earned)} kr`)}
        ${kv(L('Yatırımın dönen kısmı', 'Investment recovered'), L(`%${Math.min(999, Math.round((s.earned / cost) * 100))}`, `${Math.min(999, Math.round((s.earned / cost) * 100))}%`))}
        ${kv(L('Geri ödeme süresi', 'Payback time'), s.active && out > 0 ? `≈ ${fmtDur((cost / out) * 60)}` : '—')}
      </div>
      <div class="tr-h-hp"><span>${L('Sağlamlık', 'Condition')} ${Math.round(hp)}%</span>${bar(hp, hpColor(hp), true)}</div>
    </div>
    <button class="tr-all" data-act="mk-all">${L('‹ Bütün madenler', '‹ All mines')}</button>
  </div>`;
}

export function marketBody(w: World, team: number, baseId: number | null, mineId: number | null = null): string {
  if (!w.economyEnabled) {
    return `<p class="tw-none">${L(
      'Bu senaryoda para kuralları kapalı: inşaat, araştırma ve üretim ücretsiz. Hazine harekâtta açılır.',
      'Money rules are off in this scenario: construction, research and production are free. The treasury opens in campaigns.',
    )}</p>`;
  }
  const t = w.teams[team];
  const bases = w.airbasesOf(team).filter((b) => b.s.active);
  const base = bases.find((b) => b.s.id === baseId) ?? bases[0] ?? null;
  const mines = ownMines(w, team);
  const focus = mineId !== null ? mines.find((s) => s.id === mineId) : undefined;

  // ---------------------------------------------------------------- özet
  const plaque = (label: string, value: string): string => `<div class="tw-plaque"><small>${label}</small><b>${value}</b></div>`;
  const summary = `
    <div class="tw-sum">
      ${plaque(L('Hazine', 'Treasury'), fmtMoney(t.money))}
      ${plaque(L('Son 1 dk gelir', 'Income, last min'), `<span class="up">+${fmtMoney(w.incomeRate(team))}</span>`)}
      ${plaque(L('Maden · ev geliri', 'Mines · housing'), `${nf.format(w.mineRate(team))} · ${nf.format(w.houseRate(team))}<i>/${L('dk', 'min')}</i>`)}
      ${plaque(L('Toplam kazanç · harcama', 'Total earned · spent'), `${nf.format(t.earned)} · ${nf.format(t.spent)}`)}
    </div>`;

  // ---------------------------------------------------------------- madenler: en çok getiren üç ocak ve en son kurulan
  const byOut = [...mines].sort((a, b) => w.mineOutput(b) * (b.active ? 1 : 0) - w.mineOutput(a) * (a.active ? 1 : 0));
  const newest = mines.reduce<Structure | null>((n, s) => (!n || s.id > n.id ? s : n), null);
  const shown = byOut.slice(0, 3);
  if (newest && !shown.includes(newest)) shown.push(newest);
  // Açık olan maden listede yoksa o da görünsün
  if (focus && !shown.includes(focus)) shown.push(focus);
  const cards = shown.map((s) => {
    const tags = [byOut[0] === s && s.active && mines.length > 1 ? L('en çok getiren', 'top earner') : '', newest === s && mines.length > 1 ? L('en yeni', 'newest') : ''].filter(Boolean).join(' · ');
    return mineCard(w, s, tags, s === focus);
  }).join('');
  const active = mines.filter((s) => s.active);
  const best = active.reduce<Structure | null>((n, s) => (!n || s.richness > n.richness ? s : n), null);
  const hurt = mines.filter((s) => s.active && s.hp < s.maxHp).length;
  const avgPay = active.length ? (STRUCTURE_COST.mine / Math.max(1, w.mineRate(team) / active.length)) * 60 : 0;
  const fact = (k: string, v: string): string => `<span>${k}</span><b>${v}</b>`;
  const facts = mines.length ? `<div class="tr-facts">
      ${fact(L('Ocak sayısı', 'Mines'), `${mines.length}${mines.length > active.length ? ` <i>(${L(`${mines.length - active.length} inşaatta`, `${mines.length - active.length} building`)})</i>` : ''}`)}
      ${fact(L('Toplam üretim', 'Total output'), `${nf.format(w.mineRate(team))} ${perMin()}`)}
      ${fact(L('Madenlerden kazanç', 'Earned from mines'), `${nf.format(t.flow.mine ?? mines.reduce((a, s) => a + s.earned, 0))} kr`)}
      ${fact(L('En zengin damar', 'Richest vein'), best ? `${richnessName(best.richness)} <i>(${esc(best.name)})</i>` : '—')}
      ${fact(L('Ortalama geri ödeme', 'Average payback'), avgPay > 0 ? `≈ ${fmtDur(avgPay)}` : '—')}
      ${fact(L('Hasarlı ocak', 'Damaged mines'), hurt ? `${hurt}` : L('yok', 'none'))}
      ${fact(L('Sıradaki ocağın fiyatı', 'Next mine costs'), fmtMoney(w.structureCost(team, 'mine')))}
    </div>` : '';
  const more = mines.length - shown.length;
  const minesHtml = `
    ${head(L('Madenler', 'Mines'), mines.length ? `${nf.format(w.mineRate(team))} ${perMin()}` : '', `<button class="link" data-act="mk-build">${L('Maden kur ›', 'Build a mine ›')}</button>`)}
    ${mines.length ? `<div class="tr-mines">${cards}</div>${more > 0 ? `<p class="tw-none">${L(`ve ${more} ocak daha (burada en çok getiren üç ocak ve en son kurulan görünür)`, `and ${count(more, 'more mine')} (the three top earners and the newest are shown here)`)}</p>` : ''}${facts}`
      : `<p class="tw-none">${L(
        'Henüz maden ocağı yok. İnşa<span class="kbd"> (B)</span> → Ekonomi → Maden ocağı. Damarın verimi kurmadan bilinmez: bazı yerler zengin, çoğu orta ya da zayıf.',
        'No mines yet. Build<span class="kbd"> (B)</span> → Economy → Mine. The yield is unknown until you build: a few spots are rich, most are average or poor.',
      )}</p>`}
    <p class="tw-note">${L(
      'Her yeni ocak %30 daha pahalı. Hasarlı ocak daha az üretir; düşman ocakları da hedef olabilir. Karta dokununca o madene gidilir.',
      'Each new mine costs 30% more. Damaged mines produce less; enemy mines are targets too. Tap a card to go to that mine.',
    )}</p>`;

  // ---------------------------------------------------------------- evler
  const houseKinds = (Object.keys(HOUSE_INCOME) as StructureKind[]);
  const houseRows = houseKinds.map((k) => {
    const list = w.structures.filter((s) => s.team === team && s.kind === k && s.active);
    if (!list.length) return '';
    const rate = list.reduce((a, s) => a + w.houseOutput(s), 0) * 60;
    const parks = list.reduce((a, s) => a + w.parksNear(s), 0);
    const bonus = Math.round((parks * 10) / list.length);
    return `<tr><td>${STRUCTURE_DEFS[k].name}</td><td>${list.length}</td><td>${HOUSE_INCOME[k]} ${perMin()}</td><td>${parks ? L(`+%${bonus}`, `+${bonus}%`) : '—'}</td><td>${nf.format(rate)} ${perMin()}</td></tr>`;
  }).join('');
  const housesHtml = `
    ${head(L('Evler', 'Housing'), houseRows ? `${nf.format(w.houseRate(team))} ${perMin()}` : '')}
    ${houseRows ? `<table class="tw-flow tr-houses"><tr><th>${L('Tür', 'Type')}</th><th>${L('Adet', 'Count')}</th><th>${L('Tanesi', 'Each')}</th><th>${L('Park', 'Parks')}</th><th>${L('Toplam', 'Total')}</th></tr>${houseRows}</table>` : `<p class="tw-none">${L('Henüz ev yok.', 'No houses yet.')}</p>`}
    <p class="tw-note">${L(
      'Evler kira getirir; büyük ev daha çok getirir. 300 m içindeki her park kirayı %10 artırır (Park sütunu evlerin ortalama artışı). Hasarlı ev daha az getirir.',
      'Houses bring in rent; bigger houses bring more. Each park within 300 m adds 10% (the Parks column shows the average bonus). Damaged houses bring less.',
    )}</p>`;

  const ledger = t.ledger.slice(-18).reverse().map((e) =>
    `<tr><td>${fmtStamp(e)}</td><td>${esc(e.reason)}</td><td class="${e.amount >= 0 ? 'up' : 'down'}">${e.amount >= 0 ? '+' : '−'}${nf.format(Math.abs(e.amount))}</td></tr>`).join('');
  const ledgerHtml = `${head(L('Son hareketler', 'Recent transactions'))}${ledger ? `<table class="tw-flow tr-ledger">${ledger}</table>` : `<p class="tw-none">${L('Henüz hareket yok.', 'No transactions yet.')}</p>`}`;

  const hero = focus ? mineHero(w, team, focus) : '';

  if (!MARKET_ON) {
    return `${summary}${hero}
    <div class="tw-grid">
      <section>${minesHtml}${housesHtml}</section>
      <section>${ledgerHtml}</section>
    </div>`;
  }

  // ---------------------------------------------------------------- pazar: al
  const baseSel = bases.length
    ? `<select data-mk="base">${bases.map((b) => `<option value="${b.s.id}" ${b === base ? 'selected' : ''}>${esc(b.s.name)} · ${L('boş', 'free')} ${b.freeSlots}</option>`).join('')}</select>`
    : `<span class="bad">${L('Hazır hava üssü yok', 'No airbase ready')}</span>`;
  const r = t.research;
  const offers = w.market.offers.filter((o) => o.count > 0 && o.expires > w.time);
  const offerRows = offers.map((o) => {
    const sp = SPECS[o.specId];
    const own = r.hasAircraft(sp.id);
    // Her uçak bir bakım personeli ister (MAINT_CREW)
    const crewOk = w.crewFree(team) >= MAINT_CREW;
    const can = t.money >= o.unitPrice && !!base && base.freeSlots > 0 && crewOk;
    return `<div class="mk-offer">
      <img src="${aircraftThumb(sp.id)}" alt="">
      <div class="mk-o-main"><b>${esc(sp.name)}</b>
        <small>${ROLE_NAMES[sp.role]} · ${sp.year} · ${esc(o.seller)} · ${o.count} ${L('adet', 'available')} · ${L(`${fmtTime(Math.max(0, o.expires - w.time))} kaldı`, `${fmtTime(Math.max(0, o.expires - w.time))} left`)}${own ? '' : ` · <b class="warn-ink">${L('araştırılmamış tip', 'not researched')}</b>`}</small></div>
      <div class="mk-price">${fmtMoney(o.unitPrice)}</div>
      <button class="${can ? 'primary' : 'off'}" data-act="mbuy" data-id="${o.id}" ${can ? '' : 'aria-disabled="true"'} title="${can ? L('Seçili üssün hangarına teslim', 'Delivered to the selected base hangar') : t.money < o.unitPrice ? L('Para yetmiyor', 'Not enough money') : !crewOk ? L('Bakım personeli yetmiyor: her uçak 1 kişi ister (ev kur)', 'Not enough ground crew: each aircraft needs 1 person (build houses)') : L('Hangarda yer yok', 'No room in the hangar')}">${L('Satın al', 'Buy')}</button>
    </div>`;
  }).join('');
  const buyHtml = `
    ${head(L('Pazar · satın al', 'Market · buy'))}
    <div class="form-row"><span>${L('Teslim üssü', 'Deliver to')}</span>${baseSel}</div>
    ${offerRows || `<p class="tw-none">${L('Şu an teklif yok.', 'No offers right now.')}</p>`}
    <p class="tw-note">${L(
      `Tarafsız ülkeler birkaç dakikada bir yeni uçak teklif eder (sıradaki: ${fmtTime(Math.max(0, w.market.nextRefresh - w.time))}). Araştırmadığın tipler pahalıdır ama hemen kullanılabilir.`,
      `Neutral countries offer new aircraft every few minutes (next: ${fmtTime(Math.max(0, w.market.nextRefresh - w.time))}). Types you have not researched are expensive but ready to use at once.`,
    )}</p>`;

  // ---------------------------------------------------------------- pazar: sat
  let sellHtml = head(L('Pazar · sat', 'Market · sell'));
  if (base) {
    const bySpec = new Map<string, number>();
    for (const af of base.inventory) if (af.status === 'ready') bySpec.set(af.specId, (bySpec.get(af.specId) ?? 0) + 1);
    const rows = [...bySpec].map(([id, n]) => {
      const af = sellCandidate(base, id)!;
      return `<div class="mk-offer sell">
        <img src="${aircraftThumb(id)}" alt="">
        <div class="mk-o-main"><b>${esc(SPECS[id].name)}</b><small>${n} ${L('hazır', 'ready')} · ${L('yıpranma', 'wear')} ${pct(af.wear)}</small></div>
        <div class="mk-price">${fmtMoney(sellPrice(af))}</div>
        <button data-act="msell" data-spec="${id}">${L('Sat', 'Sell')}</button>
      </div>`;
    }).join('');
    sellHtml += rows || `<p class="tw-none">${L(`${esc(base.s.name)} hangarında satılabilecek hazır uçak yok.`, `No ready aircraft to sell in the ${esc(base.s.name)} hangar.`)}</p>`;
    sellHtml += `<p class="tw-note">${L(
      `Satış fiyatı yeni uçak fiyatının %${Math.round(SELL_RATE * 100)}'i, yıpranma düşürür. Önce en yıpranmış olan satılır.`,
      `Aircraft sell for ${Math.round(SELL_RATE * 100)}% of the new price, less for wear. The most worn one is sold first.`,
    )}</p>`;
  }

  return `${summary}${hero}
    <div class="tw-grid">
      <section>${buyHtml}${sellHtml}</section>
      <section>${minesHtml}${housesHtml}${ledgerHtml}</section>
    </div>`;
}
