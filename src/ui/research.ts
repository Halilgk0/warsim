// Araştırma ekranı — "tasarım bürosu": kart ızgarası yerine yıllara yayılmış bir program panosu.
//  - Uçak programları: yatay eksen hizmete giriş yılı, her şerit bir uçak ailesi; uçaklar üstten siluetle çizilir,
//    soy çizgileri önceki uçağa bağlanır. Seçilen programın dosyası sağda açılır (performans farkı, önkoşullar).
//  - Mühendislik: kategori × dönem tablosu; satır satır geliştirmeler.
//  - Hava savunma: sınıf şeritleri (hafif, orta, ağır, atış kontrol, tahkimat, ihbar). Sütun önkoşul derinliği, yıl kartta: oyunun açılış
//    sırası tarih sırası değil (8,8 cm 1936, Flak 38 1939), yıl ekseninde soy çizgileri geriye giderdi.
// Üç hat (mühendislik, uçak, hava savunma) aynı anda ilerler; savaş puanı araştırmayı en fazla iki kat hızlandırır.
// Para kuralları açıkken araştırma başlarken ödenir; para yetmezse iş sırada bekler.

import { SPECS, ROLE_NAMES, originName, type AircraftSpec } from '../sim/aircraft/specs';
import {
  AA_GROUP_NAMES, CAT_ICONS, CAT_NAMES, ERA_NAMES, LINE_NAMES, LINE_ORDER, TECH, TECH_BY_ID,
  type Era, type ModCategory, type Research, type Slot, type TechNode,
} from '../sim/tech';
import { modAppliesTo } from '../sim/mods';
import type { World } from '../sim/world';
import { shotUrl } from './production';
import { AA_WEAPONS, AA_WEAPON_ORDER, type AAClass, type AAWeaponDef, practicalPerMin } from '../sim/structures/airDefense';
import { aircraftPrice, fmtMoney, researchCost } from '../sim/economy';
import { bar, esc, fmtDur, nf, pct } from './dom';
import { L, LOCALE, count } from '../i18n';

export type ResearchTab = 'arac' | 'mod' | 'hd';
/** Araştırma aşaması: 1 pervaneliler, 2 ilk nesil jetler (sonraki nesiller eklenecek). */
export type ResearchStage = 1 | 2;

export const STAGES: { id: ResearchStage; name: string; years: string }[] = [
  { id: 1, name: L('Pervaneliler', 'Piston aircraft'), years: '1936–1945' },
  { id: 2, name: L('İlk nesil jetler', 'First-generation jets'), years: '1944–1955' },
];

/** Düğümün aşaması. */
export function stageOf(t: TechNode): ResearchStage {
  if (t.kind === 'aircraft') return (t.stage as ResearchStage | undefined) ?? (t.specId && SPECS[t.specId]?.generation.startsWith('J') ? 2 : 1);
  if (t.kind === 'mod') return t.era >= 3 ? 2 : 1;
  return 1;
}

export const RESEARCH_TABS: { id: ResearchTab; name: string; sub: string }[] = [
  { id: 'arac', name: L('Uçak programları', 'Aircraft programmes'), sub: L('tasarım panosu', 'design board') },
  { id: 'mod', name: L('Mühendislik', 'Engineering'), sub: L('motor, gövde, silah', 'engine, airframe, guns') },
  { id: 'hd', name: L('Hava savunma', 'Air defence'), sub: L('top, nişan, radar', 'guns, sights, radar') },
];

/** Düğümün görünen adı (uçaklarda gerçek ad). */
export function techName(t: TechNode): string {
  return t.specId ? SPECS[t.specId]?.name ?? t.name : t.name;
}

function shortName(t: TechNode): string {
  return t.specId ? SPECS[t.specId]?.abbr ?? t.name : t.name;
}

type NodeState = 'done' | 'active' | 'queued' | 'avail' | 'locked' | 'future';

/** Çelik zeminde siluet rengi durumu söyler: biten yeşil, başlatılabilir parlak, süren kehribar, taslak soluk. */
const INK: Record<NodeState, 'done' | 'active' | 'avail' | 'locked'> = { done: 'done', active: 'active', queued: 'active', avail: 'avail', locked: 'locked', future: 'locked' };

/**
 * Siluet hazır dosyadan (tools/uretim/gorseller.mjs): bu pencere için model kurulmaz, ilk açılış donmaz. Her renk ayrı dosya: pencere
 * yarım saniyede bir yeniden çizildiği için maskeyle boyamak telefonda pahalı olurdu.
 */
const planUrl = (kind: 'ac' | 'gun', id: string, st: NodeState): string => `${import.meta.env.BASE_URL}uretim/plan/${kind}-${id}-${INK[st]}.webp`;

/** Şerit dolgusu: üretim satırları gibi soldan sağa koyu yeşilden siyaha. */
const LANE_DEFS = '<defs><linearGradient id="rb-lane"><stop offset="0" stop-color="#2b4f3f"/><stop offset=".22" stop-color="#1a2e25"/><stop offset=".6" stop-color="#101a16"/><stop offset="1" stop-color="#090c0b"/></linearGradient></defs>';

function stateOf(r: Research, t: TechNode): NodeState {
  if (t.future) return 'future';
  if (r.done.has(t.id)) return 'done';
  if (r.isActive(t.id)) return 'active';
  if (r.isQueued(t.id)) return 'queued';
  return r.available(t) ? 'avail' : 'locked';
}

function progressOf(r: Research, t: TechNode): number {
  const sl = r.slots[r.slotOf(t)].current;
  return sl?.id === t.id ? sl.progress : 0;
}

/** Durum damgası (kısa). */
function stamp(r: Research, t: TechNode, st: NodeState): string {
  const aircraft = t.kind === 'aircraft';
  switch (st) {
    case 'done': return t.starting ? (aircraft ? L('Hizmette', 'In service') : L('Mevcut', 'Available')) : aircraft ? L('Hizmette', 'In service') : L('Tamam', 'Done');
    case 'active': return `${aircraft ? L('Prototip', 'Prototype') : L('Geliştiriliyor', 'In development')} ${pct(progressOf(r, t))}`;
    case 'queued': return L('Sırada', 'Queued');
    case 'avail': return aircraft ? L('Proje hazır', 'Ready to start') : L('Başlatılabilir', 'Can start');
    case 'future': return L('Sonraki aşama', 'Later stage');
    default: return L('Taslak', 'Draft');
  }
}

/** Araştırmanın para maliyeti (uçakta uçağın fiyatıyla orantılı). */
export function costOf(t: TechNode): number {
  const sp = t.specId ? SPECS[t.specId] : undefined;
  return researchCost(t, sp ? aircraftPrice(sp) : undefined);
}

function unlocks(id: string): TechNode[] {
  return TECH.filter((t) => t.kind === 'aircraft' && !t.future && t.requires.includes(id));
}

// ------------------------------------------------------------------ başlık

export function researchHeader(r: Research, w?: World, team = 0): string {
  const econ = !!w?.economyEnabled;
  const slot = (k: Slot, label: string, icon: string) => {
    const c = r.slots[k].current;
    const q = r.slots[k].queue;
    const wt = r.waiting[k];
    if (!c && wt && econ) {
      const t = TECH_BY_ID[wt];
      const cost = costOf(t);
      const have = w!.teams[team].money;
      return `<div class="pboard idle wait" data-act="rsel" data-id="${t.id}"><span class="pb-ic">${icon}</span><div><b>${label} · ${L('para bekleniyor', 'awaiting funds')}</b><span>${esc(techName(t))}</span>
        ${bar((have / cost) * 100, 'var(--warn)', true)}<span class="muted small">${fmtMoney(have)} / ${fmtMoney(cost)} — ${L('para birikince kendiliğinden başlar', 'starts by itself once the money is there')}</span></div></div>`;
    }
    if (!c) {
      return `<div class="pboard idle"><span class="pb-ic">${icon}</span><div><b>${label}</b><span class="muted small">${L('Boş — panodan bir program seç', 'Idle — pick a programme from the board')}</span></div></div>`;
    }
    const t = TECH_BY_ID[c.id];
    const img = t.specId ? `<img class="pb-plan" src="${planUrl('ac', t.specId, 'active')}" alt="">` : `<span class="pb-ic">${icon}</span>`;
    return `<div class="pboard" data-act="rsel" data-id="${t.id}">${img}<div><b>${label}</b><span>${esc(techName(t))}</span>
      ${bar(c.progress * 100, 'var(--warn)', true)}<span class="muted small">${L(`${fmtDur(r.remaining(t.id))} kaldı`, `${fmtDur(r.remaining(t.id))} left`)}${q.length ? ` · ${L('sırada', 'queued')} ${q.length}` : ''}</span></div></div>`;
  };
  return `<div class="rhead2">
    ${slot('vehicle', L('Uçak programı', 'Aircraft programme'), '✈')}
    ${slot('tech', L('Mühendislik hattı', 'Engineering line'), '⚙')}
    ${slot('defense', L('Hava savunma hattı', 'Air defence line'), '◎')}
    <div class="pboard rp ${r.boosting ? 'boost' : ''}"><span class="pb-ic">★</span><div><b>${L('Savaş puanı', 'War points')} · ${nf.format(r.points)}</b>
      <span class="muted small">${r.boosting
        ? L('Cepheden gelen raporlar araştırmayı ×2 hızlandırıyor', 'Reports from the front are speeding research up ×2')
        : L('Düşürme, isabet ve görevlerden birikir; araştırmayı 2 kata kadar hızlandırır', 'Earned from kills, hits and missions; speeds research up to 2×')}</span></div></div>
  </div>`;
}

// ------------------------------------------------------------------ uçak programları (zaman çizelgesi)

let Y0 = 1936;
let Y1 = 1953;
const PX = 72;
const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const CW = 128;
const CH = 70;
const LANE_HEAD = 132;

interface Placed { t: TechNode; sp: AircraftSpec; x: number; y: number }

const ORIGIN_SHORT: Record<string, string> = {
  'Birleşik Krallık': L('İngiltere', 'UK'), Almanya: L('Alm.', 'Ger.'), ABD: L('ABD', 'USA'), 'Sovyetler Birliği': L('SSCB', 'USSR'),
  Fransa: L('Fransa', 'France'), Japonya: L('Japonya', 'Japan'), İsveç: L('İsveç', 'Sweden'), İsviçre: L('İsviçre', 'Switz.'),
};

function layoutTimeline(stage: ResearchStage): { placed: Placed[]; lanes: { line: string; y: number; h: number }[]; width: number; height: number } {
  Y0 = stage === 1 ? 1936 : 1942;
  Y1 = stage === 1 ? 1945 : 1953;
  const inStage = TECH.filter((t) => t.kind === 'aircraft' && !t.future && stageOf(t) === stage);
  // 2. aşamada önceki aşamadan gelen öncüller şeridin başında soluk gösterilir (soy devamlılığı)
  const prev = stage === 2
    ? TECH.filter((t) => t.kind === 'aircraft' && stageOf(t) === 1 && inStage.some((j) => j.requires.includes(t.id)))
    : [];
  const nodes = [...prev, ...inStage];
  const placed: Placed[] = [];
  const lanes: { line: string; y: number; h: number }[] = [];
  let y = 34;
  for (const line of LINE_ORDER) {
    const list = nodes.filter((n) => n.line === line).map((t) => ({ t, sp: SPECS[t.specId!] })).filter((e) => e.sp)
      .sort((a, b) => a.sp.year - b.sp.year || (a.t.rank ?? 0) - (b.t.rank ?? 0));
    const rowsEnd: number[] = [];
    for (const e of list) {
      const yr = stageOf(e.t) < stage ? Y0 : e.sp.year;
      const x = LANE_HEAD + (yr - Y0) * PX + 6;
      let row = rowsEnd.findIndex((end) => end <= x);
      if (row < 0) {
        row = rowsEnd.length;
        rowsEnd.push(0);
      }
      rowsEnd[row] = x + CW + 8;
      placed.push({ t: e.t, sp: e.sp, x, y: y + 8 + row * (CH + 8) });
    }
    if (!list.length && stage === 2) continue;
    const h = Math.max(1, rowsEnd.length) * (CH + 8) + 12;
    lanes.push({ line, y, h });
    y += h;
  }
  return { placed, lanes, width: LANE_HEAD + (Y1 - Y0 + 1) * PX + CW, height: y + 6 };
}

function timeline(r: Research, sel: string | null, stage: ResearchStage): string {
  const { placed, lanes, width, height } = layoutTimeline(stage);
  const byId = new Map(placed.map((p) => [p.t.id, p]));
  const yx = (yr: number) => LANE_HEAD + (yr - Y0) * PX;
  // Dönem şeritleri ve yıl ekseni
  const eras: [number, number, string][] = stage === 1
    ? [[Y0, 1941.5, L('Erken pervaneli', 'Early piston')], [1941.5, Y1 + 1, L('Gelişmiş pervaneli', 'Late piston')]]
    : [[Y0, 1944, L('Önceki aşamadan', 'From the previous stage')], [1944, Y1 + 1, L('İlk jetler', 'First jets')]];
  const bands = eras.map(([a, b, n], i) =>
    `<rect x="${yx(a)}" y="0" width="${yx(b) - yx(a)}" height="${height}" class="era e${i}"/><text x="${yx(a) + 8}" y="14" class="era-t">${n}</text>`).join('');
  let ticks = '';
  for (let yr = Y0; yr <= Y1; yr++) {
    ticks += `<line x1="${yx(yr)}" y1="20" x2="${yx(yr)}" y2="${height}" class="${yr % 5 === 0 ? 'tk5' : 'tk'}"/>`;
    if (yr % 2 === 0) ticks += `<text x="${yx(yr) + 3}" y="30" class="yr">${yr}</text>`;
  }
  const laneSvg = lanes.map((l, i) =>
    `<rect x="0" y="${l.y}" width="${width}" height="${l.h}" class="lane ${i % 2 ? 'odd' : ''}" fill="url(#rb-lane)"/>`).join('');
  // Soy çizgileri: önceki uçak → bu uçak
  let links = '';
  for (const p of placed) {
    for (const req of p.t.requires) {
      const q = byId.get(req);
      if (!q) continue;
      const done = r.done.has(req);
      const cls = `lk ${done ? 'ok' : ''} ${p.t.id === sel || req === sel ? 'hl' : ''}`;
      const x2 = p.x;
      const y2 = p.y + CH / 2;
      if (p.x - (q.x + CW) < 24) {
        // Alt satırdaki halef: öncülün altından in, soldan gir
        const x1 = q.x + 18;
        const y1 = q.y + CH;
        links += `<path d="M${x1},${y1} C${x1},${y2} ${x1},${y2} ${x2},${y2}" class="${cls}"/>`;
      } else {
        const x1 = q.x + CW;
        const y1 = q.y + CH / 2;
        const mx = (x1 + x2) / 2;
        links += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" class="${cls}"/>`;
      }
    }
  }
  const chips = placed.map((p) => {
    const st = stateOf(r, p.t);
    const prog = st === 'active' ? `<i class="cp-bar" style="width:${(progressOf(r, p.t) * 100).toFixed(0)}%"></i>` : '';
    const old = stageOf(p.t) < stage;
    return `<div class="cp ${st} ${p.t.id === sel ? 'sel' : ''} ${old ? 'prevstage' : ''}" style="left:${p.x}px;top:${p.y}px" data-act="rsel" data-id="${p.t.id}" title="${esc(p.sp.name)}">
      <img src="${planUrl('ac', p.sp.id, st)}" alt="">
      <div class="cp-t"><b>${esc(p.sp.abbr)}</b><small>${p.sp.year} · ${esc(ORIGIN_SHORT[p.sp.origin] ?? p.sp.origin)}</small></div>
      <span class="cp-st">${esc(stamp(r, p.t, st))}</span>${prog}
    </div>`;
  }).join('');
  const laneLabels = lanes.map((l) => `<div class="ln-h" style="top:${l.y}px;height:${l.h}px"><span>${esc(LINE_NAMES[l.line as keyof typeof LINE_NAMES])}</span></div>`).join('');
  const future = TECH.filter((t) => t.kind === 'aircraft' && t.future).map((t) => {
    const sp = SPECS[t.specId!];
    return sp ? `<div class="fut" title="${esc(sp.name)}"><img src="${planUrl('ac', sp.id, 'future')}" alt=""><small>${esc(sp.abbr)} · ${sp.year}</small></div>` : '';
  }).join('');
  return `<div class="tl-scroll"><div class="tl" style="width:${width}px;height:${height}px">
      <svg width="${width}" height="${height}">${LANE_DEFS}${laneSvg}${bands}${ticks}${links}</svg>
      ${laneLabels}${chips}
    </div></div>
    ${stage === 2 ? `<div class="fut-row"><span class="muted small">${L('Sonraki nesiller — radar ve füzeler:', 'Later generations — radar and missiles:')}</span>${future}</div>` : ''}`;
}

function statLine(label: string, v: string, delta: number | null, unit: string, better: 'up' | 'down' = 'up'): string {
  let d = '';
  if (delta !== null && Math.abs(delta) > 0.05) {
    const good = better === 'up' ? delta > 0 : delta < 0;
    d = `<em class="${good ? 'up' : 'dn'}">${delta > 0 ? '+' : ''}${delta.toFixed(Math.abs(delta) < 10 ? 1 : 0)}${unit}</em>`;
  }
  return `<span>${label}</span><span>${v} ${d}</span>`;
}

function aircraftDossier(r: Research, t: TechNode, w: World): string {
  const sp = SPECS[t.specId!];
  if (!sp) return '';
  const st = stateOf(r, t);
  const prevId = t.requires.find((id) => TECH_BY_ID[id]?.kind === 'aircraft');
  const prev = prevId ? SPECS[TECH_BY_ID[prevId].specId!] : undefined;
  const dv = prev ? (sp.vMax - prev.vMax) * 3.6 : null;
  const dc = prev ? sp.climbRate - prev.climbRate : null;
  const dt = prev ? sp.turnTime - prev.turnTime : null;
  const guns = sp.guns.map((g) => g.name).join(', ') || '—';
  return `
    <div class="ds-head"><img src="${shotUrl('ac', sp.id)}" alt=""><div><h3>${esc(sp.name)}</h3>
      <div class="muted small">${esc(originName(sp.origin))} · ${sp.year} · ${ROLE_NAMES[sp.role]} · ${esc(LINE_NAMES[t.line!])}</div></div></div>
    <div class="ds-stamp ${st}">${esc(stamp(r, t, st))}</div>
    ${st === 'active' ? bar(progressOf(r, t) * 100, 'var(--warn)') : ''}
    <p class="ds-desc">${esc(sp.description)}</p>
    <div class="kv ds-kv">
      ${statLine(L('Azami hız', 'Top speed'), `${nf.format(sp.vMax * 3.6)} km/${L('sa', 'h')}`, dv, '', 'up')}
      ${statLine(L('Tırmanış', 'Climb'), `${sp.climbRate.toFixed(1)} m/${L('sn', 's')}`, dc, '', 'up')}
      ${statLine(L('Sürekli dönüş', 'Sustained turn'), `${sp.turnTime.toFixed(1)} ${L('sn', 's')}`, dt, L(' sn', ' s'), 'down')}
      <span>${L('Tavan', 'Ceiling')}</span><span>${nf.format(sp.ceiling)} m</span>
      <span>${L('Silahlar', 'Guns')}</span><span class="wrap">${esc(guns)}</span>
      ${w.economyEnabled ? `<span>${L('Birim fiyat', 'Unit price')}</span><span>${fmtMoney(aircraftPrice(sp))}</span>` : ''}
    </div>
    ${prev ? `<p class="muted small">${L(`Farklar ${esc(prev.abbr)} ile karşılaştırılıyor.`, `Differences compared with the ${esc(prev.abbr)}.`)}</p>` : ''}
    ${reqBlock(r, t)}
    ${upgradeBlock(r, sp)}
    ${actionRow(r, t, st, w, sp.id)}`;
}

/** Uçağı açmak için gerekmeyen, araştırıldıkça değerlerine eklenen geliştirmeler. */
function upgradeBlock(r: Research, sp: AircraftSpec): string {
  const list = TECH.filter((q) => q.kind === 'mod' && !q.future && modAppliesTo(q.id, sp));
  if (!list.length) return '';
  return `<div class="sub">${L('Geliştirmeler · açmak için gerekmez, araştırdıkça eklenir', 'Upgrades · not needed to unlock, added once researched')}</div><div class="ds-reqs">${list.map((q) => {
    const ok = r.done.has(q.id);
    const busy = r.isActive(q.id) || r.isQueued(q.id);
    return `<button class="ds-req ${ok ? 'ok' : busy ? 'busy' : ''}" data-act="rsel" data-id="${q.id}" title="${esc(q.effect ?? '')}">
      <span class="ri">${q.cat ? CAT_ICONS[q.cat] : '•'}</span>
      <span>${esc(techName(q))}</span><small class="${ok || busy ? '' : 'ds-soft'}">${ok ? '✓' : busy ? L('sırada', 'queued') : '○'}</small></button>`;
  }).join('')}</div>`;
}

function reqBlock(r: Research, t: TechNode): string {
  if (!t.requires.length || t.future) return '';
  return `<div class="sub">${L('Önkoşullar', 'Prerequisites')}</div><div class="ds-reqs">${t.requires.map((id) => {
    const q = TECH_BY_ID[id];
    if (!q) return '';
    const ok = r.done.has(id);
    const busy = r.isActive(id) || r.isQueued(id);
    return `<button class="ds-req ${ok ? 'ok' : busy ? 'busy' : ''}" data-act="rsel" data-id="${id}">
      ${q.specId ? `<img src="${planUrl('ac', q.specId, stateOf(r, q))}" alt="">` : gunOf(q) ? `<img src="${planUrl('gun', gunOf(q)!.id, stateOf(r, q))}" alt="">` : `<span class="ri">${q.cat ? CAT_ICONS[q.cat] : q.kind === 'radar' ? '◉' : '◎'}</span>`}
      <span>${esc(techName(q))}</span><small>${ok ? '✓' : busy ? L('sırada', 'queued') : '✗'}</small></button>`;
  }).join('')}</div>`;
}

function actionRow(r: Research, t: TechNode, st: NodeState, w: World, specId?: string): string {
  const econ = w.economyEnabled;
  const cost = costOf(t);
  const price = econ && cost > 0 ? ` · ${fmtMoney(cost)}` : '';
  let main = '';
  let note = '';
  if (st === 'avail' || st === 'locked') {
    const missing = t.requires.filter((id) => !r.done.has(id)).length;
    main = `<button class="primary" data-act="tech" data-id="${t.id}">${st === 'avail' ? `${L('Araştır', 'Research')} · ${fmtDur(t.time)}${price}` : L(`Önkoşullarla sıraya al (${missing + 1} iş)`, `Queue with prerequisites (${count(missing + 1, 'job')})`)}</button>`;
    if (econ && cost > 0) {
      note = `<p class="muted small">${L('Maliyet başlarken ödenir', 'The cost is paid at the start')}${st === 'locked' ? L(' (önkoşullar da ayrıca ödenir)', ' (prerequisites are paid separately)') : ''}${L("; durdurursan kalan kısmın %80'i geri döner.", '; if you stop, 80% of the remaining part is refunded.')}</p>`;
    }
  } else if (st === 'active' || st === 'queued') {
    main = `<button data-act="tech" data-id="${t.id}">${st === 'active' ? L(`Durdur · ${fmtDur(r.remaining(t.id))} kaldı`, `Stop · ${fmtDur(r.remaining(t.id))} left`) : L('Sıradan çıkar', 'Remove from queue')}</button>`;
    const waiting = r.waiting[r.slotOf(t)] === t.id;
    if (econ && waiting) note = `<p class="note warn">${L(`Para bekleniyor: ${fmtMoney(cost)} gerekli. Para birikince kendiliğinden başlar.`, `Awaiting funds: ${fmtMoney(cost)} needed. It starts by itself once the money is there.`)}</p>`;
  }
  const info = specId ? `<button data-act="spec-info" data-spec="${specId}">${L('Hangarda incele', 'View in hangar')}</button>` : '';
  return main || info ? `<div class="btn-row">${main}${info}</div>${note}` : '';
}

// ------------------------------------------------------------------ mühendislik

function modTable(r: Research, sel: string | null, stage: ResearchStage): string {
  const cats: ModCategory[] = ['motor', 'govde', 'silah', 'nisan', 'menzil'];
  const eras: Era[] = stage === 1 ? [1, 2] : [3];
  const head = `<div class="mt-h"></div>${eras.map((e) => `<div class="mt-h">${esc(ERA_NAMES[e])}</div>`).join('')}`;
  const rows = cats.map((c) => {
    const cells = eras.map((e) => TECH.filter((t) => t.kind === 'mod' && t.era === e && t.cat === c));
    if (cells.every((x) => !x.length)) return '';
    return `<div class="mt-cat"><span>${CAT_ICONS[c]}</span>${esc(CAT_NAMES[c])}</div>${cells.map((nodes) =>
      `<div class="mt-cell">${nodes.map((t) => itemRow(r, t, sel)).join('')}</div>`).join('')}`;
  }).join('');
  return `<div class="mtable cols${eras.length}">${head}${rows}</div>`;
}

/** Aşamalar arası geçiş (sayfa altı). */
function stageNav(r: Research, stage: ResearchStage, kind: 'aircraft' | 'mod'): string {
  return `<div class="stage-nav">${STAGES.map((s) => {
    const nodes = TECH.filter((t) => t.kind === kind && !t.future && stageOf(t) === s.id);
    const done = nodes.filter((t) => r.done.has(t.id)).length;
    return `<button class="${s.id === stage ? 'active' : ''}" data-act="rstage" data-v="${s.id}">
      <span class="sn">${s.id}</span><span><b>${s.name}</b><small>${s.years} · ${done}/${nodes.length} ${L('tamam', 'done')}</small></span></button>`;
  }).join('<span class="stage-arrow">›</span>')}</div>`;
}

function itemRow(r: Research, t: TechNode, sel: string | null, extra = ''): string {
  const st = stateOf(r, t);
  return `<div class="it ${st} ${t.id === sel ? 'sel' : ''}" data-act="rsel" data-id="${t.id}">
    <i class="dot-st"></i><span class="it-n">${esc(t.name)}${extra}</span>${t.effect ? `<small>${esc(t.effect)}</small>` : ''}
    ${st === 'active' ? `<i class="cp-bar" style="width:${(progressOf(r, t) * 100).toFixed(0)}%"></i>` : ''}
  </div>`;
}

function techDossier(r: Research, t: TechNode, w: World, team: number): string {
  const st = stateOf(r, t);
  const un = unlocks(t.id);
  const sites = t.kind === 'aa' ? w.structures.filter((s) => s.team === team && s.aa && !s.destroyed).length : 0;
  const where = t.kind === 'mod' ? `${esc(CAT_NAMES[t.cat!])} · ${esc(ERA_NAMES[t.era])}` : t.kind === 'aa' ? esc(AA_GROUP_NAMES[t.group!]) : L('İhbar ve komuta', 'Warning and control');
  const gun = gunOf(t);
  return `
    <div class="ds-head">${gun ? `<img class="ds-gun" src="${planUrl('gun', gun.id, st)}" alt="">` : `<span class="ds-ic">${t.cat ? CAT_ICONS[t.cat] : t.kind === 'aa' ? '◎' : '◉'}</span>`}<div><h3>${esc(t.name)}</h3><div class="muted small">${gun ? `${esc(originName(gun.origin))} · ${gun.year} · ${esc(AA_CLASS_LABEL[gun.cls])}` : where}</div></div></div>
    <div class="ds-stamp ${st}">${esc(stamp(r, t, st))}</div>
    ${st === 'active' ? bar(progressOf(r, t) * 100, 'var(--warn)') : ''}
    ${t.effect ? `<div class="ds-eff">${esc(t.effect)}</div>` : ''}
    <p class="ds-desc">${esc(gun?.desc ?? t.desc)}</p>
    ${gun ? `<div class="kv ds-kv">
      <span>${L('Menzil', 'Range')}</span><span>${nf1.format(gun.range / 1000)} km</span>
      <span>${L('Etkili tavan', 'Effective ceiling')}</span><span>${nf1.format(gun.ceiling / 1000)} km</span>
      <span>${L('Pratik atış', 'Practical rate')}</span><span>~${nf.format(practicalPerMin(gun))} ${L('atış/dk', 'rounds/min')}</span>
      ${w.economyEnabled ? `<span>${L('Üretim', 'Production')}</span><span>${fmtMoney(gun.cost)}</span>` : ''}
    </div>` : ''}
    ${t.kind === 'aa' && st === 'done' ? `<p class="note">${(gun ? L(`Artık fabrikada üretilebilir. Üretilen topu bataryanın yuvasına takarsın (${sites} batarya).`, `It can now be built at a factory. You then fit it into a battery's gun pit (${count(sites, 'battery', 'batteries')}).`) : L(`Araştırma yalnız kullanılabilir yapar: haritada bir bataryaya tıkla ve panelinden kur (${sites} batarya).`, `Research only makes it available: click a battery on the map and install it from its panel (${count(sites, 'battery', 'batteries')}).`))}</p>` : ''}
    ${un.length ? `<div class="sub">${L('Açtığı uçaklar', 'Unlocks aircraft')}</div><div class="ds-reqs">${un.map((u) =>
      `<button class="ds-req ${r.done.has(u.id) ? 'ok' : ''}" data-act="rsel" data-id="${u.id}"><img src="${planUrl('ac', u.specId!, stateOf(r, u))}" alt=""><span>${esc(shortName(u))}</span><small class="ds-soft">${SPECS[u.specId!]?.year ?? ''}</small></button>`).join('')}</div>` : ''}
    ${reqBlock(r, t)}
    ${actionRow(r, t, st, w)}
    ${gun ? `<div class="btn-row"><button data-act="aa-info" data-w="${gun.id}">${L('Hangarda incele', 'View in hangar')}</button></div>` : ''}`;
}

// ------------------------------------------------------------------ hava savunma panosu

type DefLane = AAClass | 'nisan' | 'tahkimat' | 'ihbar';

const DEF_LANES: { id: DefLane; name: string }[] = [
  { id: 'hafif', name: L('Hafif toplar', 'Light guns') },
  { id: 'orta', name: L('Orta toplar', 'Medium guns') },
  { id: 'agir', name: L('Ağır toplar', 'Heavy guns') },
  { id: 'nisan', name: L('Atış kontrol', 'Fire control') },
  { id: 'tahkimat', name: L('Tahkimat', 'Fortification') },
  { id: 'ihbar', name: L('İhbar ve komuta', 'Warning and control') },
];

const AA_CLASS_LABEL: Record<AAClass, string> = { hafif: L('Hafif top', 'Light gun'), orta: L('Orta top', 'Medium gun'), agir: L('Ağır top', 'Heavy gun') };

/** Bu araştırmanın açtığı top. */
function gunOf(t: TechNode): AAWeaponDef | undefined {
  return AA_WEAPON_ORDER.map((id) => AA_WEAPONS[id]).find((w) => w.requires === t.id);
}

function defLane(t: TechNode): DefLane {
  if (t.kind === 'radar') return 'ihbar';
  const g = gunOf(t);
  if (g) return g.cls;
  return t.group === 'tahkimat' ? 'tahkimat' : 'nisan';
}

const DEF_CW = 150;
const DEF_COL = 178;

/** Düğümün sütunu: hava savunma önkoşullarının en uzun zinciri. */
function defDepth(t: TechNode, memo = new Map<string, number>()): number {
  const known = memo.get(t.id);
  if (known !== undefined) return known;
  const reqs = t.requires.map((id) => TECH_BY_ID[id]).filter((q) => q && (q.kind === 'aa' || q.kind === 'radar'));
  const d = reqs.length ? 1 + Math.max(...reqs.map((q) => defDepth(q, memo))) : 0;
  memo.set(t.id, d);
  return d;
}

function defenseBoard(r: Research, sel: string | null): string {
  const nodes = TECH.filter((t) => (t.kind === 'aa' || t.kind === 'radar') && !t.future);
  const memo = new Map<string, number>();
  const pos = new Map<string, { x: number; y: number; lane: DefLane }>();
  const lanes: { id: DefLane; name: string; y: number; h: number }[] = [];
  const starter = AA_WEAPON_ORDER.map((id) => AA_WEAPONS[id]).find((w) => !w.requires)!;
  let y = 6;
  let width = 0;
  for (const lane of DEF_LANES) {
    const list = nodes.filter((t) => defLane(t) === lane.id).sort((a, b) => defDepth(a, memo) - defDepth(b, memo) || (gunOf(a)?.rank ?? 0) - (gunOf(b)?.rank ?? 0));
    // Başlangıç topu sütun başında; aynı sütundaki düğümler alt alta
    const inCol = new Map<number, number>();
    if (lane.id === starter.cls) inCol.set(0, 1);
    let rows = lane.id === starter.cls ? 1 : 0;
    for (const t of list) {
      const col = defDepth(t, memo);
      const row = inCol.get(col) ?? 0;
      inCol.set(col, row + 1);
      rows = Math.max(rows, row + 1);
      const x = LANE_HEAD + 6 + col * DEF_COL;
      pos.set(t.id, { x, y: y + 8 + row * (CH + 8), lane: lane.id });
      width = Math.max(width, x + DEF_CW + 12);
    }
    const h = Math.max(1, rows) * (CH + 8) + 12;
    lanes.push({ ...lane, y, h });
    y += h;
  }
  const height = y + 4;
  const starterLane = lanes.find((l) => l.id === starter.cls)!;
  const sx = LANE_HEAD + 6;
  const sy = starterLane.y + 8;
  // Soy çizgileri: şerit içi hep, şeritler arası yalnız seçili düğümün çizgileri (hepsi birden okunmaz)
  let links = '';
  const link = (x1: number, y1: number, x2: number, y2: number, cls: string, vertical: boolean) => {
    const mx = (x1 + x2) / 2;
    links += vertical
      ? `<path d="M${x1 + 18},${y1 + CH} C${x1 + 18},${y2 + CH / 2} ${x1 + 18},${y2 + CH / 2} ${x2},${y2 + CH / 2}" class="${cls}"/>`
      : `<path d="M${x1 + DEF_CW},${y1 + CH / 2} C${mx + DEF_CW / 2},${y1 + CH / 2} ${mx + DEF_CW / 2},${y2 + CH / 2} ${x2},${y2 + CH / 2}" class="${cls}"/>`;
  };
  for (const t of nodes) {
    const p = pos.get(t.id)!;
    for (const req of t.requires) {
      const q = pos.get(req);
      if (!q) continue;
      const hl = t.id === sel || req === sel;
      if (q.lane !== p.lane && !hl) continue;
      link(q.x, q.y, p.x, p.y, `lk ${r.done.has(req) ? 'ok' : ''} ${hl ? 'hl' : ''}`, q.x === p.x);
    }
  }
  const first = AA_WEAPONS[starter.id];
  const firstNode = nodes.find((t) => t.id === first.requires) ?? nodes.find((t) => defLane(t) === starter.cls && defDepth(t, memo) === 0);
  if (firstNode) {
    const p = pos.get(firstNode.id)!;
    link(sx, sy, p.x, p.y, 'lk ok', p.x === sx);
  }
  const lanesSvg = lanes.map((l, i) => `<rect x="0" y="${l.y}" width="${width}" height="${l.h}" class="lane ${i % 2 ? 'odd' : ''}" fill="url(#rb-lane)"/>`).join('');
  const labels = lanes.map((l) => `<div class="ln-h" style="top:${l.y}px;height:${l.h}px"><span>${esc(l.name)}</span></div>`).join('');
  const startChip = `<div class="cp done def static" style="left:${sx}px;top:${sy}px" title="${esc(starter.name)}">
    <img src="${planUrl('gun', starter.id, 'done')}" alt="">
    <div class="cp-t"><b>${esc(starter.name)}</b><small>${starter.year} · ${esc(ORIGIN_SHORT[starter.origin] ?? starter.origin)}</small></div>
    <span class="cp-st">${L('Mevcut', 'Available')}</span></div>`;
  const chips = nodes.map((t) => {
    const p = pos.get(t.id)!;
    const st = stateOf(r, t);
    const g = gunOf(t);
    const prog = st === 'active' ? `<i class="cp-bar" style="width:${(progressOf(r, t) * 100).toFixed(0)}%"></i>` : '';
    const img = g ? `<img src="${planUrl('gun', g.id, st)}" alt="">` : `<span class="cp-ic">${t.kind === 'radar' ? '◉' : t.group === 'tahkimat' ? '⛨' : '◎'}</span>`;
    const sub = g ? `${g.year} · ${esc(ORIGIN_SHORT[g.origin] ?? originName(g.origin))}` : esc(t.effect ?? '');
    return `<div class="cp def ${st} ${t.id === sel ? 'sel' : ''}" style="left:${p.x}px;top:${p.y}px" data-act="rsel" data-id="${t.id}" title="${esc(t.name)}">
      ${img}<div class="cp-t"><b>${esc(t.name)}</b><small>${sub}</small></div>
      <span class="cp-st">${st === 'active' ? pct(progressOf(r, t)) : esc(stamp(r, t, st))}</span>${prog}</div>`;
  }).join('');
  return `<p class="muted small rb-note">${L(
    'Araştırılan top fabrikada üretilir, sonra bataryanın yuvasına takılır. Yıl, sistemin gerçek hizmete giriş yılıdır; sıra oyunun açılış sırasıdır.',
    'A researched gun is built at a factory, then fitted into a battery gun pit. The year is when the real system entered service; the order is the game\'s unlock order.',
  )}</p>
    <div class="tl-scroll"><div class="tl" style="width:${width}px;height:${height}px">
      <svg width="${width}" height="${height}">${LANE_DEFS}${lanesSvg}${links}</svg>
      ${labels}${startChip}${chips}
    </div></div>`;
}

/** Sekme için varsayılan seçim: sürmekte olan iş, yoksa ilk başlatılabilir düğüm. */
export function defaultSelection(r: Research, tab: ResearchTab, stage: ResearchStage = 1): string | null {
  const kind = tab === 'arac' ? 'aircraft' : tab === 'mod' ? 'mod' : 'aa';
  const inStage = (t: TechNode) => t.kind !== 'aircraft' && t.kind !== 'mod' ? true : stageOf(t) === stage;
  const cur = r.slots[tab === 'arac' ? 'vehicle' : tab === 'mod' ? 'tech' : 'defense'].current;
  if (cur && inStage(TECH_BY_ID[cur.id])) return cur.id;
  return TECH.find((t) => t.kind === kind && !t.future && inStage(t) && r.available(t))?.id
    ?? TECH.find((t) => t.kind === kind && !t.future && inStage(t))?.id ?? null;
}

export function researchBody(r: Research, tab: ResearchTab, w: World, team: number, sel: string | null, stage: ResearchStage = 1): string {
  const tabs = `<div class="rtabs">${RESEARCH_TABS.map((t) =>
    `<button class="${t.id === tab ? 'active' : ''}" data-act="rtab" data-tab="${t.id}"><b>${t.name}</b><small>${t.sub}</small></button>`).join('')}</div>`;
  let main = '';
  if (tab === 'arac') main = timeline(r, sel, stage) + stageNav(r, stage, 'aircraft');
  else if (tab === 'mod') main = modTable(r, sel, stage) + stageNav(r, stage, 'mod');
  else main = defenseBoard(r, sel);
  const t = sel ? TECH_BY_ID[sel] : undefined;
  const dossier = !t ? `<p class="muted">${L('Bir program seç.', 'Pick a programme.')}</p>` : t.kind === 'aircraft' ? aircraftDossier(r, t, w) : techDossier(r, t, w, team);
  return `${researchHeader(r, w, team)}${tabs}<div class="rb"><div class="rb-main">${main}</div><aside class="rb-dos">${dossier}</aside></div>`;
}
