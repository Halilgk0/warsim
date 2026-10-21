// Araştırma ekranı — "tasarım bürosu": kart ızgarası yerine yıllara yayılmış bir program panosu.
//  - Uçak programları: yatay eksen hizmete giriş yılı, her şerit bir uçak ailesi; uçaklar üstten siluetle çizilir,
//    soy çizgileri önceki uçağa bağlanır. Seçilen programın dosyası sağda açılır (performans farkı, önkoşullar).
//  - Mühendislik: kategori × dönem tablosu; satır satır geliştirmeler.
//  - Hava savunma ve ihbar/komuta: aynı liste + dosya düzeni.
// İki hat (teknoloji + araç) aynı anda ilerler; savaş puanı araştırmayı en fazla iki kat hızlandırır.
// Para kuralları açıkken araştırma başlarken ödenir; para yetmezse iş sırada bekler.

import { SPECS, ROLE_NAMES, type AircraftSpec } from '../sim/aircraft/specs';
import {
  AA_GROUP_NAMES, CAT_ICONS, CAT_NAMES, ERA_NAMES, LINE_NAMES, LINE_ORDER, TECH, TECH_BY_ID,
  type AAGroup, type Era, type ModCategory, type Research, type Slot, type TechNode,
} from '../sim/tech';
import { modAppliesTo } from '../sim/mods';
import type { World } from '../sim/world';
import { aircraftPlan, aircraftThumb } from '../render/thumbs';
import { aircraftPrice, fmtMoney, researchCost } from '../sim/economy';
import { bar, esc, fmtDur, nf } from './dom';

export type ResearchTab = 'arac' | 'mod' | 'hd' | 'radar';
/** Araştırma aşaması: 1 pervaneliler, 2 ilk nesil jetler (sonraki nesiller eklenecek). */
export type ResearchStage = 1 | 2;

export const STAGES: { id: ResearchStage; name: string; years: string }[] = [
  { id: 1, name: 'Pervaneliler', years: '1936–1945' },
  { id: 2, name: 'İlk nesil jetler', years: '1944–1955' },
];

/** Düğümün aşaması. */
export function stageOf(t: TechNode): ResearchStage {
  if (t.kind === 'aircraft') return (t.stage as ResearchStage | undefined) ?? (t.specId && SPECS[t.specId]?.generation.startsWith('J') ? 2 : 1);
  if (t.kind === 'mod') return t.era >= 3 ? 2 : 1;
  return 1;
}

export const RESEARCH_TABS: { id: ResearchTab; name: string; sub: string }[] = [
  { id: 'arac', name: 'Uçak programları', sub: 'tasarım panosu' },
  { id: 'mod', name: 'Mühendislik', sub: 'motor, gövde, silah' },
  { id: 'hd', name: 'Hava savunma', sub: 'silah ve nişan' },
  { id: 'radar', name: 'İhbar ve komuta', sub: 'gözcü, radar' },
];

/** Düğümün görünen adı (uçaklarda gerçek ad). */
export function techName(t: TechNode): string {
  return t.specId ? SPECS[t.specId]?.name ?? t.name : t.name;
}

function shortName(t: TechNode): string {
  return t.specId ? SPECS[t.specId]?.abbr ?? t.name : t.name;
}

type NodeState = 'done' | 'active' | 'queued' | 'avail' | 'locked' | 'future';

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
    case 'done': return t.starting ? (aircraft ? 'Hizmette' : 'Mevcut') : aircraft ? 'Hizmette' : 'Tamam';
    case 'active': return `${aircraft ? 'Prototip' : 'Geliştiriliyor'} %${Math.round(progressOf(r, t) * 100)}`;
    case 'queued': return 'Sırada';
    case 'avail': return aircraft ? 'Proje hazır' : 'Başlatılabilir';
    case 'future': return 'Sonraki aşama';
    default: return 'Taslak';
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
      return `<div class="pboard idle wait" data-act="rsel" data-id="${t.id}"><span class="pb-ic">${icon}</span><div><b>${label} · para bekleniyor</b><span>${esc(techName(t))}</span>
        ${bar((have / cost) * 100, 'var(--warn)', true)}<span class="muted small">${fmtMoney(have)} / ${fmtMoney(cost)} — para birikince kendiliğinden başlar</span></div></div>`;
    }
    if (!c) {
      return `<div class="pboard idle"><span class="pb-ic">${icon}</span><div><b>${label}</b><span class="muted small">Boş — panodan bir program seç</span></div></div>`;
    }
    const t = TECH_BY_ID[c.id];
    const img = t.specId ? `<img class="pb-plan" src="${aircraftPlan(t.specId)}" alt="">` : `<span class="pb-ic">${icon}</span>`;
    return `<div class="pboard" data-act="rsel" data-id="${t.id}">${img}<div><b>${label}</b><span>${esc(techName(t))}</span>
      ${bar(c.progress * 100, 'var(--warn)', true)}<span class="muted small">${fmtDur(r.remaining(t.id))} kaldı${q.length ? ` · sırada ${q.length}` : ''}</span></div></div>`;
  };
  return `<div class="rhead2">
    ${slot('vehicle', 'Uçak programı', '✈')}
    ${slot('tech', 'Mühendislik hattı', '⚙')}
    <div class="pboard rp ${r.boosting ? 'boost' : ''}"><span class="pb-ic">★</span><div><b>Savaş puanı · ${nf.format(r.points)}</b>
      <span class="muted small">${r.boosting ? 'Cepheden gelen raporlar araştırmayı ×2 hızlandırıyor' : 'Düşürme, isabet ve görevlerden birikir; araştırmayı 2 kata kadar hızlandırır'}</span></div></div>
  </div>`;
}

// ------------------------------------------------------------------ uçak programları (zaman çizelgesi)

let Y0 = 1936;
let Y1 = 1953;
const PX = 72;
const CW = 128;
const CH = 70;
const LANE_HEAD = 132;

interface Placed { t: TechNode; sp: AircraftSpec; x: number; y: number }

const ORIGIN_SHORT: Record<string, string> = {
  'Birleşik Krallık': 'İngiltere', Almanya: 'Alm.', ABD: 'ABD', 'Sovyetler Birliği': 'SSCB', Fransa: 'Fransa',
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
    ? [[Y0, 1941.5, 'Erken pervaneli'], [1941.5, Y1 + 1, 'Gelişmiş pervaneli']]
    : [[Y0, 1944, 'Önceki aşamadan'], [1944, Y1 + 1, 'İlk jetler']];
  const bands = eras.map(([a, b, n], i) =>
    `<rect x="${yx(a)}" y="0" width="${yx(b) - yx(a)}" height="${height}" class="era e${i}"/><text x="${yx(a) + 8}" y="14" class="era-t">${n}</text>`).join('');
  let ticks = '';
  for (let yr = Y0; yr <= Y1; yr++) {
    ticks += `<line x1="${yx(yr)}" y1="20" x2="${yx(yr)}" y2="${height}" class="${yr % 5 === 0 ? 'tk5' : 'tk'}"/>`;
    if (yr % 2 === 0) ticks += `<text x="${yx(yr) + 3}" y="30" class="yr">${yr}</text>`;
  }
  const laneSvg = lanes.map((l, i) =>
    `<rect x="0" y="${l.y}" width="${width}" height="${l.h}" class="lane ${i % 2 ? 'odd' : ''}"/>`).join('');
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
      <img src="${aircraftPlan(p.sp.id)}" alt="">
      <div class="cp-t"><b>${esc(p.sp.abbr)}</b><small>${p.sp.year} · ${esc(ORIGIN_SHORT[p.sp.origin] ?? p.sp.origin)}</small></div>
      <span class="cp-st">${esc(stamp(r, p.t, st))}</span>${prog}
    </div>`;
  }).join('');
  const laneLabels = lanes.map((l) => `<div class="ln-h" style="top:${l.y}px;height:${l.h}px"><span>${esc(LINE_NAMES[l.line as keyof typeof LINE_NAMES])}</span></div>`).join('');
  const future = TECH.filter((t) => t.kind === 'aircraft' && t.future).map((t) => {
    const sp = SPECS[t.specId!];
    return sp ? `<div class="fut" title="${esc(sp.name)}"><img src="${aircraftPlan(sp.id, 0xb7b2c2)}" alt=""><small>${esc(sp.abbr)} · ${sp.year}</small></div>` : '';
  }).join('');
  return `<div class="tl-scroll"><div class="tl" style="width:${width}px;height:${height}px">
      <svg width="${width}" height="${height}">${laneSvg}${bands}${ticks}${links}</svg>
      ${laneLabels}${chips}
    </div></div>
    ${stage === 2 ? `<div class="fut-row"><span class="muted small">Sonraki nesiller — radar ve füzeler:</span>${future}</div>` : ''}`;
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
    <div class="ds-head"><img src="${aircraftThumb(sp.id)}" alt=""><div><h3>${esc(sp.name)}</h3>
      <div class="muted small">${esc(sp.origin)} · ${sp.year} · ${ROLE_NAMES[sp.role]} · ${esc(LINE_NAMES[t.line!])}</div></div></div>
    <div class="ds-stamp ${st}">${esc(stamp(r, t, st))}</div>
    ${st === 'active' ? bar(progressOf(r, t) * 100, 'var(--warn)') : ''}
    <p class="ds-desc">${esc(sp.description)}</p>
    <div class="kv ds-kv">
      ${statLine('Azami hız', `${nf.format(sp.vMax * 3.6)} km/sa`, dv, '', 'up')}
      ${statLine('Tırmanış', `${sp.climbRate.toFixed(1)} m/sn`, dc, '', 'up')}
      ${statLine('Sürekli dönüş', `${sp.turnTime.toFixed(1)} sn`, dt, ' sn', 'down')}
      <span>Tavan</span><span>${nf.format(sp.ceiling)} m</span>
      <span>Silahlar</span><span class="wrap">${esc(guns)}</span>
      ${w.economyEnabled ? `<span>Birim fiyat</span><span>${fmtMoney(aircraftPrice(sp))}</span>` : ''}
    </div>
    ${prev ? `<p class="muted small">Farklar ${esc(prev.abbr)} ile karşılaştırılıyor.</p>` : ''}
    ${reqBlock(r, t)}
    ${upgradeBlock(r, sp)}
    ${actionRow(r, t, st, w, sp.id)}`;
}

/** Uçağı açmak için gerekmeyen, araştırıldıkça değerlerine eklenen geliştirmeler. */
function upgradeBlock(r: Research, sp: AircraftSpec): string {
  const list = TECH.filter((q) => q.kind === 'mod' && !q.future && modAppliesTo(q.id, sp));
  if (!list.length) return '';
  return `<div class="sub">Geliştirmeler · açmak için gerekmez, araştırdıkça eklenir</div><div class="ds-reqs">${list.map((q) => {
    const ok = r.done.has(q.id);
    const busy = r.isActive(q.id) || r.isQueued(q.id);
    return `<button class="ds-req ${ok ? 'ok' : busy ? 'busy' : ''}" data-act="rsel" data-id="${q.id}" title="${esc(q.effect ?? '')}">
      <span class="ri">${q.cat ? CAT_ICONS[q.cat] : '•'}</span>
      <span>${esc(techName(q))}</span><small>${ok ? '✓' : busy ? 'sırada' : '○'}</small></button>`;
  }).join('')}</div>`;
}

function reqBlock(r: Research, t: TechNode): string {
  if (!t.requires.length || t.future) return '';
  return `<div class="sub">Önkoşullar</div><div class="ds-reqs">${t.requires.map((id) => {
    const q = TECH_BY_ID[id];
    if (!q) return '';
    const ok = r.done.has(id);
    const busy = r.isActive(id) || r.isQueued(id);
    return `<button class="ds-req ${ok ? 'ok' : busy ? 'busy' : ''}" data-act="rsel" data-id="${id}">
      ${q.specId ? `<img src="${aircraftPlan(q.specId)}" alt="">` : `<span class="ri">${q.cat ? CAT_ICONS[q.cat] : '•'}</span>`}
      <span>${esc(techName(q))}</span><small>${ok ? '✓' : busy ? 'sırada' : '✗'}</small></button>`;
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
    main = `<button class="primary" data-act="tech" data-id="${t.id}">${st === 'avail' ? `Araştır · ${fmtDur(t.time)}${price}` : `Önkoşullarla sıraya al (${missing + 1} iş)`}</button>`;
    if (econ && cost > 0) note = `<p class="muted small">Maliyet başlarken ödenir${st === 'locked' ? ' (önkoşullar da ayrıca ödenir)' : ''}; durdurursan kalan kısmın %80'i geri döner.</p>`;
  } else if (st === 'active' || st === 'queued') {
    main = `<button data-act="tech" data-id="${t.id}">${st === 'active' ? `Durdur · ${fmtDur(r.remaining(t.id))} kaldı` : 'Sıradan çıkar'}</button>`;
    const waiting = r.waiting[r.slotOf(t)] === t.id;
    if (econ && waiting) note = `<p class="note warn">Para bekleniyor: ${fmtMoney(cost)} gerekli. Para birikince kendiliğinden başlar.</p>`;
  }
  const info = specId ? `<button data-act="spec-info" data-spec="${specId}">Hangarda incele</button>` : '';
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
      <span class="sn">${s.id}</span><span><b>${s.name}</b><small>${s.years} · ${done}/${nodes.length} tamam</small></span></button>`;
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
  const where = t.kind === 'mod' ? `${esc(CAT_NAMES[t.cat!])} · ${esc(ERA_NAMES[t.era])}` : t.kind === 'aa' ? esc(AA_GROUP_NAMES[t.group!]) : 'İhbar ve komuta';
  return `
    <div class="ds-head"><span class="ds-ic">${t.cat ? CAT_ICONS[t.cat] : t.kind === 'aa' ? '◎' : '◉'}</span><div><h3>${esc(t.name)}</h3><div class="muted small">${where}</div></div></div>
    <div class="ds-stamp ${st}">${esc(stamp(r, t, st))}</div>
    ${st === 'active' ? bar(progressOf(r, t) * 100, 'var(--warn)') : ''}
    ${t.effect ? `<div class="ds-eff">${esc(t.effect)}</div>` : ''}
    <p class="ds-desc">${esc(t.desc)}</p>
    ${t.kind === 'aa' && st === 'done' ? `<p class="note">Araştırma yalnız kullanılabilir yapar: haritada bir bataryaya tıkla ve panelinden kur (${sites} batarya).</p>` : ''}
    ${un.length ? `<div class="sub">Açtığı uçaklar</div><div class="ds-reqs">${un.map((u) =>
      `<button class="ds-req ${r.done.has(u.id) ? 'ok' : ''}" data-act="rsel" data-id="${u.id}"><img src="${aircraftPlan(u.specId!)}" alt=""><span>${esc(shortName(u))}</span><small>${SPECS[u.specId!]?.year ?? ''}</small></button>`).join('')}</div>` : ''}
    ${reqBlock(r, t)}
    ${actionRow(r, t, st, w)}`;
}

function aaList(r: Research, sel: string | null): string {
  const groups: AAGroup[] = ['silah', 'nisan', 'tahkimat'];
  return `<p class="muted">Araştırma yalnız yeni silahı ya da aleti <b>kullanılabilir</b> yapar; hangi bataryaya kurulacağını batarya panelinden seçersin.</p>
    <div class="cols3">${groups.map((g) => {
      const nodes = TECH.filter((t) => t.kind === 'aa' && t.group === g).sort((a, b) => a.tier - b.tier);
      const base = g === 'silah' ? '<div class="it done static"><i class="dot-st"></i><span class="it-n">12,7 mm uçaksavar makineli</span><small>başlangıçta</small></div>' : '';
      return `<div><div class="mt-h">${esc(AA_GROUP_NAMES[g])}</div>${base}${nodes.map((t) => itemRow(r, t, sel)).join('')}</div>`;
    }).join('')}</div>`;
}

function radarList(r: Research, sel: string | null): string {
  const nodes = TECH.filter((t) => t.kind === 'radar').sort((a, b) => a.tier - b.tier);
  const names = ['Gözetleme', 'Erken ihbar', 'Yer kontrollü önleme'];
  return `<p class="muted">Düşmanı görmeden önce bilmek: gözcüler, telsiz, erken ihbar radarı ve yer kontrolü.</p>
    <div class="cols3">${[1, 2, 3].map((tier, i) => `<div><div class="mt-h">${names[i]}</div>${nodes.filter((n) => n.tier === tier).map((t) => itemRow(r, t, sel)).join('')}</div>`).join('')}</div>`;
}

/** Sekme için varsayılan seçim: sürmekte olan iş, yoksa ilk başlatılabilir düğüm. */
export function defaultSelection(r: Research, tab: ResearchTab, stage: ResearchStage = 1): string | null {
  const kind = tab === 'arac' ? 'aircraft' : tab === 'mod' ? 'mod' : tab === 'hd' ? 'aa' : 'radar';
  const inStage = (t: TechNode) => t.kind !== 'aircraft' && t.kind !== 'mod' ? true : stageOf(t) === stage;
  const cur = r.slots[kind === 'aircraft' ? 'vehicle' : 'tech'].current;
  if (cur && TECH_BY_ID[cur.id]?.kind === kind && inStage(TECH_BY_ID[cur.id])) return cur.id;
  return TECH.find((t) => t.kind === kind && !t.future && inStage(t) && r.available(t))?.id
    ?? TECH.find((t) => t.kind === kind && !t.future && inStage(t))?.id ?? null;
}

export function researchBody(r: Research, tab: ResearchTab, w: World, team: number, sel: string | null, stage: ResearchStage = 1): string {
  const tabs = `<div class="rtabs">${RESEARCH_TABS.map((t) =>
    `<button class="${t.id === tab ? 'active' : ''}" data-act="rtab" data-tab="${t.id}"><b>${t.name}</b><small>${t.sub}</small></button>`).join('')}</div>`;
  let main = '';
  if (tab === 'arac') main = timeline(r, sel, stage) + stageNav(r, stage, 'aircraft');
  else if (tab === 'mod') main = modTable(r, sel, stage) + stageNav(r, stage, 'mod');
  else if (tab === 'hd') main = aaList(r, sel);
  else main = radarList(r, sel);
  const t = sel ? TECH_BY_ID[sel] : undefined;
  const dossier = !t ? '<p class="muted">Bir program seç.</p>' : t.kind === 'aircraft' ? aircraftDossier(r, t, w) : techDossier(r, t, w, team);
  return `${researchHeader(r, w, team)}${tabs}<div class="rb"><div class="rb-main">${main}</div><aside class="rb-dos">${dossier}</aside></div>`;
}
