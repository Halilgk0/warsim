// Hazine ve pazar penceresi: kasa özeti, madenler, uluslararası pazardan alım, hangardan satış, son hareketler.

import type { World } from '../sim/world';
import { SPECS, ROLE_NAMES } from '../sim/aircraft/specs';
import { SELL_RATE, aircraftPrice, fmtMoney, richnessName, richnessTier } from '../sim/economy';
import type { Airbase, Airframe } from '../sim/structures/airbase';
import { aircraftThumb } from '../render/thumbs';
import { bar, esc, fmtStamp, fmtTime, hpColor, nf, pct } from './dom';
import { L } from '../i18n';

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

export function marketBody(w: World, team: number, baseId: number | null): string {
  if (!w.economyEnabled) {
    return `<p class="muted">${L(
      'Bu senaryoda para kuralları kapalı: inşaat, araştırma ve üretim ücretsiz. Hazine ve pazar harekâtta açılır.',
      'Money rules are off in this scenario: construction, research and production are free. The treasury and market open in campaigns.',
    )}</p>`;
  }
  const t = w.teams[team];
  const bases = w.airbasesOf(team).filter((b) => b.s.active);
  const base = bases.find((b) => b.s.id === baseId) ?? bases[0] ?? null;
  const mines = w.structures.filter((s) => s.team === team && s.kind === 'mine' && !s.destroyed);

  // ---------------------------------------------------------------- özet
  const summary = `
    <div class="mk-sum">
      <div class="mk-card"><small>${L('Hazine', 'Treasury')}</small><b>${fmtMoney(t.money)}</b></div>
      <div class="mk-card"><small>${L('Son 1 dk gelir', 'Income, last min')}</small><b class="pos">+${fmtMoney(w.incomeRate(team))}</b></div>
      <div class="mk-card"><small>${L('Maden üretimi', 'Mine output')}</small><b>${fmtMoney(w.mineRate(team))}<i>/${L('dk', 'min')}</i></b></div>
      <div class="mk-card"><small>${L('Toplam kazanç · harcama', 'Total earned · spent')}</small><b>${nf.format(t.earned)} · ${nf.format(t.spent)}</b></div>
    </div>`;

  // ---------------------------------------------------------------- madenler
  const mineRows = mines.map((s) => {
    const hp = (s.hp / s.maxHp) * 100;
    const rich = s.active ? `<span class="rich r${richnessTier(s.richness)}">${richnessName(s.richness)}</span>` : `<span class="muted-ink">${L('inşaat bitince belli olur', 'known once built')}</span>`;
    return `<tr><td>${esc(s.name)}</td><td>${rich}</td><td>${s.active ? `${nf.format(w.mineOutput(s) * 60)} kr/${L('dk', 'min')}` : pct(s.build)}</td>
      <td>${nf.format(s.earned)} kr</td><td style="min-width:70px">${bar(hp, hpColor(hp), true)}</td></tr>`;
  }).join('');
  const minesHtml = `
    <h3>${L('Madenler', 'Mines')}</h3>
    ${mines.length ? `<table class="tbl"><tr><th>${L('Ocak', 'Mine')}</th><th>${L('Damar', 'Vein')}</th><th>${L('Üretim', 'Output')}</th><th>${L('Kazanç', 'Earned')}</th><th>${L('Sağlamlık', 'Condition')}</th></tr>${mineRows}</table>`
      : `<p class="muted">${L(
        'Henüz maden ocağı yok. İnşa<span class="kbd"> (B)</span> → Ekonomi → Maden ocağı. Damarın verimi kurmadan bilinmez: bazı yerler zengin, çoğu orta ya da zayıf.',
        'No mines yet. Build<span class="kbd"> (B)</span> → Economy → Mine. The yield is unknown until you build: a few spots are rich, most are average or poor.',
      )}</p>`}
    <p class="muted small">${L(
      `Sıradaki ocak: <b>${fmtMoney(w.structureCost(team, 'mine'))}</b> (her yeni ocak %30 daha pahalı). Hasarlı ocak daha az üretir; düşman ocakları da hedef olabilir.`,
      `Next mine: <b>${fmtMoney(w.structureCost(team, 'mine'))}</b> (each new mine costs 30% more). Damaged mines produce less; enemy mines are targets too.`,
    )}</p>`;

  // ---------------------------------------------------------------- pazar: al
  const baseSel = bases.length
    ? `<select data-mk="base">${bases.map((b) => `<option value="${b.s.id}" ${b === base ? 'selected' : ''}>${esc(b.s.name)} · ${L('boş', 'free')} ${b.freeSlots}</option>`).join('')}</select>`
    : `<span class="bad">${L('Hazır hava üssü yok', 'No airbase ready')}</span>`;
  const r = t.research;
  const offers = w.market.offers.filter((o) => o.count > 0 && o.expires > w.time);
  const offerRows = offers.map((o) => {
    const sp = SPECS[o.specId];
    const own = r.hasAircraft(sp.id);
    const can = t.money >= o.unitPrice && !!base && base.freeSlots > 0;
    return `<div class="mk-offer">
      <img src="${aircraftThumb(sp.id)}" alt="">
      <div class="mk-o-main"><b>${esc(sp.name)}</b>
        <small>${ROLE_NAMES[sp.role]} · ${sp.year} · ${esc(o.seller)} · ${o.count} ${L('adet', 'available')} · ${L(`${fmtTime(Math.max(0, o.expires - w.time))} kaldı`, `${fmtTime(Math.max(0, o.expires - w.time))} left`)}${own ? '' : ` · <b class="warn-ink">${L('araştırılmamış tip', 'not researched')}</b>`}</small></div>
      <div class="mk-price">${fmtMoney(o.unitPrice)}</div>
      <button class="primary" data-act="mbuy" data-id="${o.id}" ${can ? '' : 'disabled'} title="${can ? L('Seçili üssün hangarına teslim', 'Delivered to the selected base hangar') : t.money < o.unitPrice ? L('Para yetmiyor', 'Not enough money') : L('Hangarda yer yok', 'No room in the hangar')}">${L('Satın al', 'Buy')}</button>
    </div>`;
  }).join('');
  const buyHtml = `
    <h3>${L('Pazar · satın al', 'Market · buy')}</h3>
    <div class="form-row"><span>${L('Teslim üssü', 'Deliver to')}</span>${baseSel}</div>
    ${offerRows || `<p class="muted">${L('Şu an teklif yok.', 'No offers right now.')}</p>`}
    <p class="muted small">${L(
      `Tarafsız ülkeler birkaç dakikada bir yeni uçak teklif eder (sıradaki: ${fmtTime(Math.max(0, w.market.nextRefresh - w.time))}). Araştırmadığın tipler pahalıdır ama hemen kullanılabilir.`,
      `Neutral countries offer new aircraft every few minutes (next: ${fmtTime(Math.max(0, w.market.nextRefresh - w.time))}). Types you have not researched are expensive but ready to use at once.`,
    )}</p>`;

  // ---------------------------------------------------------------- pazar: sat
  let sellHtml = `<h3>${L('Pazar · sat', 'Market · sell')}</h3>`;
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
    sellHtml += rows || `<p class="muted">${L(`${esc(base.s.name)} hangarında satılabilecek hazır uçak yok.`, `No ready aircraft to sell in the ${esc(base.s.name)} hangar.`)}</p>`;
    sellHtml += `<p class="muted small">${L(
      `Satış fiyatı yeni uçak fiyatının %${Math.round(SELL_RATE * 100)}'i, yıpranma düşürür. Önce en yıpranmış olan satılır.`,
      `Aircraft sell for ${Math.round(SELL_RATE * 100)}% of the new price, less for wear. The most worn one is sold first.`,
    )}</p>`;
  }

  // ---------------------------------------------------------------- defter
  const ledger = t.ledger.slice(-18).reverse().map((e) =>
    `<tr><td>${fmtStamp(e)}</td><td style="text-align:left">${esc(e.reason)}</td><td class="${e.amount >= 0 ? 'pos' : 'neg'}">${e.amount >= 0 ? '+' : '−'}${nf.format(Math.abs(e.amount))}</td></tr>`).join('');
  const ledgerHtml = `<h3>${L('Son hareketler', 'Recent transactions')}</h3>${ledger ? `<table class="tbl mk-ledger">${ledger}</table>` : `<p class="muted">${L('Henüz hareket yok.', 'No transactions yet.')}</p>`}`;

  return `${summary}
    <div class="mk-grid">
      <div>${buyHtml}${sellHtml}</div>
      <div>${minesHtml}${ledgerHtml}</div>
    </div>`;
}
