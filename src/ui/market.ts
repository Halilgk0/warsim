// Hazine ve pazar penceresi: kasa özeti, madenler, uluslararası pazardan alım, hangardan satış, son hareketler.

import type { World } from '../sim/world';
import { SPECS, ROLE_NAMES } from '../sim/aircraft/specs';
import { SELL_RATE, aircraftPrice, fmtMoney, richnessName, richnessTier } from '../sim/economy';
import type { Airbase, Airframe } from '../sim/structures/airbase';
import { aircraftThumb } from '../render/thumbs';
import { bar, esc, fmtTime, hpColor, nf } from './dom';

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
    return '<p class="muted">Bu senaryoda para kuralları kapalı: inşaat, araştırma ve üretim ücretsiz. Hazine ve pazar harekâtta açılır.</p>';
  }
  const t = w.teams[team];
  const bases = w.airbasesOf(team).filter((b) => b.s.active);
  const base = bases.find((b) => b.s.id === baseId) ?? bases[0] ?? null;
  const mines = w.structures.filter((s) => s.team === team && s.kind === 'mine' && !s.destroyed);

  // ---------------------------------------------------------------- özet
  const summary = `
    <div class="mk-sum">
      <div class="mk-card"><small>Hazine</small><b>${fmtMoney(t.money)}</b></div>
      <div class="mk-card"><small>Son 1 dk gelir</small><b class="pos">+${fmtMoney(w.incomeRate(team))}</b></div>
      <div class="mk-card"><small>Maden üretimi</small><b>${fmtMoney(w.mineRate(team))}<i>/dk</i></b></div>
      <div class="mk-card"><small>Toplam kazanç · harcama</small><b>${nf.format(t.earned)} · ${nf.format(t.spent)}</b></div>
    </div>`;

  // ---------------------------------------------------------------- madenler
  const mineRows = mines.map((s) => {
    const hp = (s.hp / s.maxHp) * 100;
    const rich = s.active ? `<span class="rich r${richnessTier(s.richness)}">${richnessName(s.richness)}</span>` : '<span class="muted-ink">inşaat bitince belli olur</span>';
    return `<tr><td>${esc(s.name)}</td><td>${rich}</td><td>${s.active ? `${nf.format(w.mineOutput(s) * 60)} kr/dk` : `%${Math.round(s.build * 100)}`}</td>
      <td>${nf.format(s.earned)} kr</td><td style="min-width:70px">${bar(hp, hpColor(hp), true)}</td></tr>`;
  }).join('');
  const minesHtml = `
    <h3>Madenler</h3>
    ${mines.length ? `<table class="tbl"><tr><th>Ocak</th><th>Damar</th><th>Üretim</th><th>Kazanç</th><th>Sağlamlık</th></tr>${mineRows}</table>`
      : '<p class="muted">Henüz maden ocağı yok. İnşa<span class="kbd"> (B)</span> → Ekonomi → Maden ocağı. Damarın verimi kurmadan bilinmez: bazı yerler zengin, çoğu orta ya da zayıf.</p>'}
    <p class="muted small">Sıradaki ocak: <b>${fmtMoney(w.structureCost(team, 'mine'))}</b> (her yeni ocak %30 daha pahalı). Hasarlı ocak daha az üretir; düşman ocakları da hedef olabilir.</p>`;

  // ---------------------------------------------------------------- pazar: al
  const baseSel = bases.length
    ? `<select data-mk="base">${bases.map((b) => `<option value="${b.s.id}" ${b === base ? 'selected' : ''}>${esc(b.s.name)} · boş ${b.freeSlots}</option>`).join('')}</select>`
    : '<span class="bad">Hazır hava üssü yok</span>';
  const r = t.research;
  const offers = w.market.offers.filter((o) => o.count > 0 && o.expires > w.time);
  const offerRows = offers.map((o) => {
    const sp = SPECS[o.specId];
    const own = r.hasAircraft(sp.id);
    const can = t.money >= o.unitPrice && !!base && base.freeSlots > 0;
    return `<div class="mk-offer">
      <img src="${aircraftThumb(sp.id)}" alt="">
      <div class="mk-o-main"><b>${esc(sp.name)}</b>
        <small>${ROLE_NAMES[sp.role]} · ${sp.year} · ${esc(o.seller)} · ${o.count} adet · ${fmtTime(Math.max(0, o.expires - w.time))} kaldı${own ? '' : ' · <b class="warn-ink">araştırılmamış tip</b>'}</small></div>
      <div class="mk-price">${fmtMoney(o.unitPrice)}</div>
      <button class="primary" data-act="mbuy" data-id="${o.id}" ${can ? '' : 'disabled'} title="${can ? 'Seçili üssün hangarına teslim' : t.money < o.unitPrice ? 'Para yetmiyor' : 'Hangarda yer yok'}">Satın al</button>
    </div>`;
  }).join('');
  const buyHtml = `
    <h3>Pazar · satın al</h3>
    <div class="form-row"><span>Teslim üssü</span>${baseSel}</div>
    ${offerRows || '<p class="muted">Şu an teklif yok.</p>'}
    <p class="muted small">Tarafsız ülkeler birkaç dakikada bir yeni uçak teklif eder (sıradaki: ${fmtTime(Math.max(0, w.market.nextRefresh - w.time))}). Araştırmadığın tipler pahalıdır ama hemen kullanılabilir.</p>`;

  // ---------------------------------------------------------------- pazar: sat
  let sellHtml = '<h3>Pazar · sat</h3>';
  if (base) {
    const bySpec = new Map<string, number>();
    for (const af of base.inventory) if (af.status === 'ready') bySpec.set(af.specId, (bySpec.get(af.specId) ?? 0) + 1);
    const rows = [...bySpec].map(([id, n]) => {
      const af = sellCandidate(base, id)!;
      return `<div class="mk-offer sell">
        <img src="${aircraftThumb(id)}" alt="">
        <div class="mk-o-main"><b>${esc(SPECS[id].name)}</b><small>${n} hazır · yıpranma %${Math.round(af.wear * 100)}</small></div>
        <div class="mk-price">${fmtMoney(sellPrice(af))}</div>
        <button data-act="msell" data-spec="${id}">Sat</button>
      </div>`;
    }).join('');
    sellHtml += rows || `<p class="muted">${esc(base.s.name)} hangarında satılabilecek hazır uçak yok.</p>`;
    sellHtml += `<p class="muted small">Satış fiyatı yeni uçak fiyatının %${Math.round(SELL_RATE * 100)}'i, yıpranma düşürür. Önce en yıpranmış olan satılır.</p>`;
  }

  // ---------------------------------------------------------------- defter
  const ledger = t.ledger.slice(-18).reverse().map((e) =>
    `<tr><td>${fmtTime(e.time)}</td><td style="text-align:left">${esc(e.reason)}</td><td class="${e.amount >= 0 ? 'pos' : 'neg'}">${e.amount >= 0 ? '+' : '−'}${nf.format(Math.abs(e.amount))}</td></tr>`).join('');
  const ledgerHtml = `<h3>Son hareketler</h3>${ledger ? `<table class="tbl mk-ledger">${ledger}</table>` : '<p class="muted">Henüz hareket yok.</p>'}`;

  return `${summary}
    <div class="mk-grid">
      <div>${buyHtml}${sellHtml}</div>
      <div>${minesHtml}${ledgerHtml}</div>
    </div>`;
}
