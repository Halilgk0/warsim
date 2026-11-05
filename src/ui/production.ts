// Üretim menüsü ve yuva seçimi. Fabrika uzun satırlar hâlinde uçak ve topları listeler: model, ad, ikonlu bilgiler, serviste, bantta ve
// üretim çubuğu. Açılmamışlar gri ve kilitli. Yuva penceresi depodaki topları gösterir, seçilen yuvaya takar.
//
// Pencere açıkken yalnız değişen hücreler güncellenir (`data-cell`): bütün listeyi yeniden çizmek basılan düğmeyi kaçırıyordu.

import type { Game } from '../game';
import type { Structure } from '../sim/structures/structure';
import { SPEC_LIST, type AircraftSpec } from '../sim/aircraft/specs';
import { AA_WEAPONS, AA_WEAPON_ORDER, type AAWeaponDef, type AAWeaponId, gunBuildTime, practicalPerMin } from '../sim/structures/airDefense';
import { aircraftNode } from '../sim/tech';
import { aircraftPrice, fmtMoney } from '../sim/economy';
import { QUEUE_MAX } from '../sim/structures/factory';
import { settings } from './settings';
import { bar, esc, fmtDur, nf } from './dom';
import { L, LOCALE } from '../i18n';

const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

export type FactoryTab = 'ucak' | 'top';

// Küçük çizgi ikonlar: dil bağımsız, her tarayıcıda aynı görünür
const svg = (d: string) => `<svg class="prd-i" viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  speed: svg('M2 12a6 6 0 1 1 12 0M8 12l3.5-5'),
  climb: svg('M8 14V3M4 7l4-4 4 4'),
  ceiling: svg('M2 3h12M8 14V6M5 9l3-3 3 3'),
  gun: svg('M2 8h9M11 5v6l3-1.5v-3zM5 8v4'),
  range: svg('M2 8h12M2 5v6M14 5v6'),
  rate: svg('M3 4v8M7 4v8M11 4v8M14 6v4'),
  shell: svg('M5 14V7l3-5 3 5v7z'),
  time: svg('M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M8 5v3l2 2'),
  lock: svg('M4 7h8v7H4zM5.5 7V5a2.5 2.5 0 0 1 5 0v2'),
};
const info = (icon: string, text: string, title: string) => `<span class="prd-ic" title="${esc(title)}">${icon}${esc(text)}</span>`;

/** Toplu üretim: satır başına seçili adet (pencere kapanınca da kalır). */
const qty = new Map<string, number>();

export function changeQty(id: string, delta: number): void {
  qty.set(id, Math.max(1, Math.min(QUEUE_MAX, (qty.get(id) ?? 1) + delta)));
}

export const qtyOf = (id: string): number => qty.get(id) ?? 1;

/** Adet seçici ve üret düğmesi: düğmede toplam fiyat. Parası ya da bant yeri yetmiyorsa kapalı. */
function buildControls(id: string, act: string, price: number, money: number, econ: boolean, room: number): string {
  const n = qtyOf(id);
  const total = price * n;
  const can = room >= n && (!econ || money >= total);
  const why = room < n ? L('Bantta yer yok', 'The line is full') : L('Para yetmiyor', 'Not enough money');
  return `<div class="prd-qty"><button class="mini" data-act="fab-qty" data-id="${id}" data-d="-1" title="${L('Azalt', 'Fewer')}">−</button><b>${n}</b><button class="mini" data-act="fab-qty" data-id="${id}" data-d="1" title="${L('Artır', 'More')}">+</button></div>
    <button class="mini ${can ? 'primary' : ''}" data-act="${act}" data-id="${id}" ${can ? '' : `disabled title="${why}"`}>${L('Üret', 'Build')}${econ ? ` · ${fmtMoney(total)}` : ''}</button>`;
}

/** Bant sayısı ve son siparişi iptal. */
function lineCell(queued: number, act: string, id: string): string {
  return `<small>${L('Bantta', 'On line')}</small><b>${nf.format(queued)}${queued ? `<button class="prd-x" data-act="${act}" data-id="${id}" title="${L('Son siparişi iptal et', 'Cancel the last order')}">✕</button>` : ''}</b>`;
}

/** Üretim akışı: yalnız üretimi süren satırda, görsel efektler açıksa. */
const rowClass = (running: boolean) => `prd-row${running && settings.map.effects ? ' on' : ''}`;

/** Bir hücre: id'si sabit, içeriği değişince yalnız o yenilenir. */
const cell = (id: string, cls: string, html: string) => `<div class="${cls}" data-cell="${id}">${html}</div>`;

const counter = (label: string, n: number, extra = '') => `<small>${label}</small><b>${nf.format(n)}</b>${extra ? `<small>${extra}</small>` : ''}`;

/** Önceden üretilmiş resim (tools/uretim/gorseller.mjs): telefon model kurmaz, liste metni kısa kalır. */
export const shotUrl = (kind: 'ac' | 'gun', id: string): string => `${import.meta.env.BASE_URL}uretim/${kind}-${id}.webp`;

const thumbImg = (kind: 'ac' | 'gun', id: string): string => `<img src="${shotUrl(kind, id)}" alt="" loading="lazy" decoding="async">`;

function progressCell(progress: number, left: number, waiting: boolean): string {
  if (progress <= 0 && !waiting) return `<span class="prd-idle">—</span>`;
  if (waiting) return `<span class="prd-idle">${L('sırada', 'queued')}</span>`;
  return `${bar(progress * 100, 'var(--accent)', true)}<small>${L(`${fmtDur(left)} kaldı`, `${fmtDur(left)} left`)}</small>`;
}

function aircraftRow(game: Game, s: Structure, sp: AircraftSpec): string {
  const w = game.world;
  const team = w.teams[s.team];
  const f = s.factory!;
  const open = team.research.hasAircraft(sp.id);
  const key = `ac-${sp.id}`;
  const icons = [
    info(ICON.speed, `${nf.format(sp.vMax * 3.6)} km/${L('sa', 'h')}`, L('Azami hız', 'Top speed')),
    info(ICON.climb, `${nf1.format(sp.climbRate)} m/${L('sn', 's')}`, L('Tırmanma', 'Climb')),
    info(ICON.ceiling, `${nf1.format(sp.ceiling / 1000)} km`, L('Servis tavanı', 'Service ceiling')),
    info(ICON.time, fmtDur(sp.buildTime), L('Üretim süresi', 'Build time')),
    open ? `<button class="link prd-more" data-act="spec-info" data-spec="${sp.id}">${L('İncele', 'Inspect')}</button>` : '',
  ].join('');
  const head = `${cell(`${key}-img`, 'prd-thumb', thumbImg('ac', sp.id))}
    <div class="prd-info"><b>${esc(sp.name)}</b><div class="prd-ics">${icons}</div></div>`;
  const node = aircraftNode(sp.id);
  if (!open) {
    return `<button class="prd-row locked" data-act="fab-res" data-id="${node?.id ?? ''}">${head}
      <span class="prd-lock">${ICON.lock}${L('Araştırılmalı', 'Needs research')}</span></button>`;
  }
  const service = w.airbasesOf(s.team).reduce((a, b) => a + b.inventory.filter((x) => x.specId === sp.id).length, 0);
  const queued = f.queue.filter((q) => q.specId === sp.id).length;
  const first = f.queue[0]?.specId === sp.id ? f.queue[0] : null;
  const factor = 0.4 + 0.6 * (s.hp / s.maxHp);
  const price = aircraftPrice(sp);
  return `<div class="${rowClass(!!first && s.active)}" data-rowkey="${key}">${head}
    ${cell(`${key}-svc`, 'prd-n', counter(L('Serviste', 'In service'), service))}
    ${cell(`${key}-q`, 'prd-n', lineCell(queued, 'fab-del', sp.id))}
    ${cell(`${key}-bar`, 'prd-prog', progressCell(first?.progress ?? 0, first ? ((1 - first.progress) * sp.buildTime) / factor : 0, !first && queued > 0))}
    ${cell(`${key}-act`, 'prd-act', buildControls(sp.id, 'fab-add', price, team.money, w.economyEnabled, QUEUE_MAX - f.queue.length))}
  </div>`;
}

function gunRow(game: Game, s: Structure, g: AAWeaponDef): string {
  const w = game.world;
  const team = w.teams[s.team];
  const f = s.factory!;
  const open = team.research.has(g.requires ?? undefined);
  const key = `gun-${g.id}`;
  const icons = [
    info(ICON.range, `${nf1.format(g.range / 1000)} km`, L('Menzil', 'Range')),
    info(ICON.ceiling, `${nf1.format(g.ceiling / 1000)} km`, L('Etkili tavan', 'Effective ceiling')),
    info(ICON.rate, `~${nf.format(practicalPerMin(g))}/${L('dk', 'min')}`, L('Pratik atış', 'Practical rate of fire')),
    info(ICON.time, fmtDur(gunBuildTime(g)), L('Üretim süresi', 'Build time')),
    open ? `<button class="link prd-more" data-act="aa-info" data-w="${g.id}">${L('İncele', 'Inspect')}</button>` : '',
  ].join('');
  const head = `${cell(`${key}-img`, 'prd-thumb', thumbImg('gun', g.id))}
    <div class="prd-info"><b>${esc(g.name)}</b><div class="prd-ics">${icons}</div></div>`;
  if (!open) {
    return `<button class="prd-row locked" data-act="fab-res" data-id="${g.requires ?? ''}">${head}
      <span class="prd-lock">${ICON.lock}${L('Araştırılmalı', 'Needs research')}</span></button>`;
  }
  let inPits = 0;
  for (const x of w.structures) if (x.team === s.team && x.aa && !x.destroyed) inPits += x.aa.mounts.filter((m) => m.weapon === g.id).length;
  const stock = team.gunStock[g.id] ?? 0;
  const queued = f.gunQueue.filter((q) => q.gun === g.id).length;
  const first = f.gunQueue[0]?.gun === g.id ? f.gunQueue[0] : null;
  const factor = 0.4 + 0.6 * (s.hp / s.maxHp);
  return `<div class="${rowClass(!!first && s.active)}" data-rowkey="${key}">${head}
    ${cell(`${key}-svc`, 'prd-n', counter(L('Serviste', 'In service'), inPits, L(`depoda ${stock}`, `${stock} in stock`)))}
    ${cell(`${key}-q`, 'prd-n', lineCell(queued, 'fab-del-gun', g.id))}
    ${cell(`${key}-bar`, 'prd-prog', progressCell(first?.progress ?? 0, first ? ((1 - first.progress) * gunBuildTime(g)) / factor : 0, !first && queued > 0))}
    ${cell(`${key}-act`, 'prd-act', buildControls(g.id, 'fab-add-gun', g.cost, team.money, w.economyEnabled, QUEUE_MAX - f.gunQueue.length))}
  </div>`;
}

export function factoryBody(game: Game, s: Structure, tab: FactoryTab): string {
  const w = game.world;
  const team = w.teams[s.team];
  const factories = w.structures.filter((x) => x.team === s.team && x.factory && !x.destroyed);
  const pick = factories.length > 1
    ? `<div class="seg prd-pick">${factories.map((x) => `<button class="${x.id === s.id ? 'active' : ''}" data-act="fab-pick" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>`
    : '';
  const planes = SPEC_LIST.filter((sp) => {
    const n = aircraftNode(sp.id);
    return sp.playable && !!n && !n.future;
  });
  const openFirst = <T,>(list: T[], open: (x: T) => boolean) => [...list.filter(open), ...list.filter((x) => !open(x))];
  const rows = tab === 'ucak'
    ? openFirst(planes, (sp) => team.research.hasAircraft(sp.id)).map((sp) => aircraftRow(game, s, sp)).join('')
    : openFirst(AA_WEAPON_ORDER.map((id) => AA_WEAPONS[id]), (g) => team.research.has(g.requires ?? undefined)).map((g) => gunRow(game, s, g)).join('');
  const f = s.factory!;
  const note = tab === 'top'
    ? L('Biten top depoya girer. Takmak için haritada bataryaya dokun, yuvasını seç.', 'A finished gun goes into stock. To fit it, tap a battery on the map and pick a gun pit.')
    : L('Biten uçak üssün hangarına teslim edilir.', 'A finished aircraft is delivered to the base hangar.');
  return `<div class="prd-head">
      <div class="seg prd-tabs"><button class="${tab === 'ucak' ? 'active' : ''}" data-act="fab-tab" data-v="ucak">${L('Uçaklar', 'Aircraft')}</button><button class="${tab === 'top' ? 'active' : ''}" data-act="fab-tab" data-v="top">${L('Hava savunma', 'Air defence')}</button></div>
      ${pick}
      ${cell('prd-money', 'prd-money', w.economyEnabled ? `${L('Hazine', 'Treasury')} <b>${fmtMoney(team.money)}</b>` : '')}
    </div>
    ${s.active ? '' : `<p class="note warn">${L('Fabrika çalışmıyor: inşaat ya da onarım sürüyor.', 'The factory is not running: under construction or repair.')}</p>`}
    <div class="prd-list">${rows}</div>
    <div class="prd-foot"><span class="muted small">${note}</span>
      ${tab === 'ucak' ? `<label class="check"><input type="checkbox" data-act="fab-repeat" ${f.repeat ? 'checked' : ''}> ${L('Bitince tekrarla', 'Repeat when done')}</label>` : ''}</div>`;
}

/** Yuva penceresi: o an takılı top ve depodaki toplar. */
export function pitBody(game: Game, s: Structure, slot: number): string {
  const w = game.world;
  const aa = s.aa!;
  const stock = w.teams[s.team].gunStock;
  const m = aa.mounts[slot];
  const stats = (g: AAWeaponDef) => `<div class="prd-ics">${info(ICON.range, `${nf1.format(g.range / 1000)} km`, L('Menzil', 'Range'))}${info(ICON.ceiling, `${nf1.format(g.ceiling / 1000)} km`, L('Etkili tavan', 'Effective ceiling'))}${info(ICON.rate, `~${nf.format(practicalPerMin(g))}/${L('dk', 'min')}`, L('Pratik atış', 'Practical rate of fire'))}<button class="link prd-more" data-act="aa-info" data-w="${g.id}">${L('İncele', 'Inspect')}</button></div>`;
  const current = m
    ? `<div class="prd-row pit-now">${cell('pit-img', 'prd-thumb', thumbImg('gun', m.weapon))}
        <div class="prd-info"><small class="muted">${L('Bu yuvada', 'In this pit')}</small><b>${esc(AA_WEAPONS[m.weapon].name)}</b>${stats(AA_WEAPONS[m.weapon])}</div>
        ${cell('pit-state', 'prd-prog', m.install > 0 ? `${bar((1 - m.install / Math.max(m.installTotal, 1)) * 100, 'var(--warn)', true)}<small>${L(`takılıyor, ${fmtDur(m.install)}`, `fitting, ${fmtDur(m.install)}`)}</small>` : `<small>${L('hazır', 'ready')}</small>`)}
      </div>`
    : `<p class="muted">${L('Bu yuva boş.', 'This pit is empty.')}</p>`;
  const owned = AA_WEAPON_ORDER.filter((id) => (stock[id] ?? 0) > 0 && id !== m?.weapon);
  const rows = owned.map((id: AAWeaponId) => {
    const g = AA_WEAPONS[id];
    return `<div class="prd-row">${cell(`pit-${id}-img`, 'prd-thumb', thumbImg('gun', id))}
      <div class="prd-info"><b>${esc(g.name)}</b>${stats(g)}</div>
      ${cell(`pit-${id}-n`, 'prd-n', counter(L('Depoda', 'In stock'), stock[id] ?? 0))}
      <div class="prd-act"><button class="mini primary" data-act="pit-put" data-id="${id}">${L('Tak', 'Fit')} · ${fmtDur(g.installTime)}</button></div>
    </div>`;
  }).join('');
  const hasFactory = w.structures.some((x) => x.team === s.team && x.factory && !x.destroyed);
  return `${current}
    <h3>${L('Depodaki toplar', 'Guns in stock')}</h3>
    ${rows ? `<div class="prd-list">${rows}</div>` : `<p class="muted">${L('Depoda takılacak top yok. Fabrikada üret; açılmamış toplar için önce araştırma gerekir.', 'No guns in stock to fit. Build some at a factory; guns not yet unlocked need research first.')}</p>`}
    ${m ? `<p class="muted small">${L('Çıkan top depoya döner. Takılırken yuva ateş edemez.', 'The removed gun returns to stock. The pit cannot fire while fitting.')}</p>` : ''}
    <div class="btn-row">${hasFactory ? `<button data-act="pit-fab">${L('Üretim menüsü', 'Production menu')}</button>` : `<span class="muted small">${L('Top üretmek için fabrika gerekir.', 'A factory is needed to build guns.')}</span>`}
      <button data-act="fab-open-hd">${L('Hava savunma araştırması', 'Air defence research')}</button></div>`;
}

/** Yalnız değişen hücreleri yenile. Yeni hücre çıktıysa false: tam çizim gerekir. */
export function patchCells(root: HTMLElement, html: string): boolean {
  const t = document.createElement('template');
  t.innerHTML = html;
  const fresh = t.content.querySelectorAll<HTMLElement>('[data-cell]');
  if (fresh.length !== root.querySelectorAll('[data-cell]').length) return false;
  for (const n of fresh) {
    const old = root.querySelector<HTMLElement>(`[data-cell="${n.dataset.cell}"]`);
    if (!old) return false;
    if (old.innerHTML !== n.innerHTML) old.innerHTML = n.innerHTML;
  }
  // Üretim akışı satırın sınıfında: hücre dışında kalıyor
  for (const n of t.content.querySelectorAll<HTMLElement>('[data-rowkey]')) {
    const old = root.querySelector<HTMLElement>(`[data-rowkey="${n.dataset.rowkey}"]`);
    if (old && old.className !== n.className) old.className = n.className;
  }
  return true;
}
