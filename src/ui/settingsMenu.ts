// Ayarlar penceresi (2026-11-20, çelik tema): başlık sacında sekmeler, altta koyu kuyuda gruplanmış satırlar. Her satırda
// solda simge plakası, ad, kısa açıklama ve sağda denetim (anahtar, bölümlü seçici ya da kaydırıcı). Açık satır yeşilden
// siyaha, kapalı satır soğuk gri. Kaliteye bağlı seçenekler (bulut, güneş gölgesi) o kalitede yoksa soluk ve kilitli.
// Takılma önerisiyle açılınca (perfWatch.ts) önerilen seçenek işaretli. Ayarların kendisi settings.ts.

import {
  INFO_FIELDS, LOG_CATEGORIES, MAP_LAYERS, QUALITY, RESOLUTIONS, SOUND_LEVELS, settings,
  type GraphicsQuality, type InfoField, type MapLayer, type Resolution, type SoundLevel,
} from './settings';
import type { LogCategory } from '../sim/world';
import type { PerfHint } from '../perfWatch';
import { L } from '../i18n';

export type SettingsTab = 'grafik' | 'ses' | 'harita' | 'panel' | 'oyun';

export const SETTINGS_TABS: { id: SettingsTab; name: string }[] = [
  { id: 'grafik', name: L('Grafik', 'Graphics') },
  { id: 'ses', name: L('Ses', 'Sound') },
  { id: 'harita', name: L('Harita', 'Map') },
  { id: 'panel', name: L('Bilgi paneli', 'Info panel') },
  { id: 'oyun', name: L('Oyun', 'Game') },
];

/** Kalite basamağının oyuncuya kısa anlatımı. */
const QUALITY_DESC: Record<GraphicsQuality, string> = {
  low: L('Sade uçak ve top modelleri; bulut, dalga ve güneş gölgesi yok. Telefonda önerilir.', 'Simple aircraft and gun models; no clouds, waves or sun shadows. Recommended on phones.'),
  medium: L('Dokulu uçak ve toplar, az bulut, dalgalı deniz.', 'Textured aircraft and guns, a few clouds, a moving sea.'),
  high: L('Ortadakilere ek olarak yakın arazi ayrıntısı, güneş gölgesi, tam bulut; ağaç ve köyler daha uzakta.', 'On top of Medium: close-up ground detail, sun shadows, full clouds; trees and villages farther out.'),
};
/** Seçici düğmelerinin alt yazısı. */
const QUALITY_SUB: Record<GraphicsQuality, string> = { low: L('akıcı', 'smooth'), medium: L('dengeli', 'balanced'), high: L('en ayrıntılı', 'most detail') };
const RES_SUB: Record<Resolution, string> = { auto: L('kareye göre', 'adapts'), '1': L('en keskin', 'sharpest'), '0.75': L('hızlı', 'faster'), '0.5': L('en hızlı', 'fastest') };

/** Satır simgeleri (24 × 24, çizgi). */
const ICONS: Record<string, string> = {
  quality: '<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5l9 4.5 9-4.5"/>',
  resolution: '<path d="M4 4h16v16H4z"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  dayCycle: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  clouds: '<path d="M7 18h10.5a3.8 3.8 0 0 0 .4-7.6A6 6 0 0 0 6.4 11.6 3.2 3.2 0 0 0 7 18z"/>',
  shadows: '<path d="M7 4h5v14H7z"/><path d="M3 20h18"/><path d="M12 18l8 2"/><path d="M16 4l2-2"/>',
  scenery: '<path d="M12 3l6 8.5h-3.5l4.5 6H5l4.5-6H6z"/><path d="M12 17.5V21"/>',
  effects: '<path d="M12 3c1.5 3.5 6 5.5 6 11a6 6 0 0 1-12 0c0-2.8 1.6-4.6 3-6.5.8 1.6 1.6 2.6 3 2.8-.3-2.6-.8-4.6 0-7.3z"/>',
  muted: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  master: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  world: '<path d="M12 2.5l1.8 5.4 5.2-2.6-2.6 5.2 5.4 1.8-5.4 1.8 2.6 5.2-5.2-2.6L12 21.5l-1.8-5.4L5 18.7l2.6-5.2L2.2 11.7l5.4-1.8L5 4.7l5.2 2.6z"/>',
  alerts: '<path d="M6 17h12l-1.6-2.2V11a4.4 4.4 0 0 0-8.8 0v3.8z"/><path d="M10 20h4"/>',
  ui: '<path d="M9 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M12 11.5a1.5 1.5 0 0 1 3 0V13"/><path d="M15 12.5a1.5 1.5 0 0 1 3 0V16a5.5 5.5 0 0 1-5.5 5.5H12a5 5 0 0 1-4-2l-2.8-3.7a1.5 1.5 0 0 1 2.3-1.9L9 15.5"/>',
  labels: '<path d="M3.5 11.5V4h7.5l9.5 9.5-7.5 7.5z"/><circle cx="7.8" cy="8.3" r="1.2"/>',
  buildingLabels: '<path d="M4 20V9l8-5 8 5v11z"/><path d="M9 20v-6h6v6"/>',
  icons: '<path d="M12 3l7 18-7-4.2L5 21z"/>',
  trails: '<path d="M3 19c4.5 0 4.5-7 9-7s4.5-7 9-7" stroke-dasharray="2.5 2.5"/><path d="M19 3l2 2-2 2"/>',
  dropLines: '<path d="M7 4.5l5 3.5 5-3.5"/><path d="M12 8v11" stroke-dasharray="2 2"/><path d="M7 20h10"/>',
  shadows_ac: '<path d="M12 3.5l5 8H7z"/><ellipse cx="12" cy="18.5" rx="7" ry="2"/>',
  tracers: '<path d="M3.5 20.5L20.5 3.5" stroke-dasharray="4.5 3"/><circle cx="20" cy="4" r="1.3"/>',
  tracerScale: '<path d="M4 6h16" stroke-width="1"/><path d="M4 12h16" stroke-width="2.2"/><path d="M4 18h16" stroke-width="3.6"/>',
  routes: '<circle cx="5" cy="18.5" r="2"/><circle cx="19" cy="5.5" r="2"/><path d="M7 18.5h6a3.3 3.3 0 0 0 0-6.5h-2a3.3 3.3 0 0 1 0-6.5h6"/>',
  aaRanges: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="3 2.5"/>',
  radarCoverage: '<circle cx="12" cy="12" r="9"/><path d="M12 12l6.5-6.2"/><path d="M12 3a9 9 0 0 1 6.5 2.8"/><circle cx="12" cy="12" r="1.2"/>',
  radarAgl: '<path d="M12 4v13"/><path d="M8 8l4-4 4 4"/><path d="M4 20h16"/>',
  contacts: '<path d="M12 4l6 8-6 8-6-8z"/><path d="M12 9.5v5"/>',
  fogOfWar: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  autoFast: '<path d="M3 6.5l8 5.5-8 5.5z"/><path d="M13 6.5l8 5.5-8 5.5z"/>',
};

const icon = (id: string) => `<span class="st-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[id] ?? ''}</svg></span>`;
const text = (name: string, desc?: string) => `<span class="st-t"><b>${name}</b>${desc ? `<small>${desc}</small>` : ''}</span>`;
const head = (name: string) => `<h3 class="st-h">${name}</h3>`;

/** Takılma önerisi: işaretlenecek denetim. */
let hint: PerfHint | null = null;
const recSeg = (set: string, v: string) => !!hint && hint.set === set && hint.v === v;
const recRow = (set: string, k: string | null) => !!hint && hint.set === set && hint.k === k;
const recTag = () => `<em class="st-rec">${L('önerilen', 'suggested')}</em>`;

/** Anahtarlı satır: satırın her yerine dokunmak değiştirir. ic: simge (yoksa simgesiz sık satır). */
function sw(set: string, k: string | null, on: boolean, name: string, desc?: string, ic?: string, off = false): string {
  const rec = recRow(set, k);
  return `<label class="st-row${off ? ' dis' : ''}${rec ? ' rec' : ''}">${ic ? icon(ic) : ''}${text(name, desc)}${rec ? recTag() : ''}<input type="checkbox" class="sw" data-set="${set}"${k ? ` data-k="${k}"` : ''}${on && !off ? ' checked' : ''}${off ? ' disabled' : ''}></label>`;
}

/** Bölümlü seçici satırı; seçeneklerin alt yazısı olabilir. */
function seg(set: string, cur: string, opts: { v: string; name: string; sub?: string }[], name: string, desc: string, ic: string): string {
  return `<div class="st-row st-pick">${icon(ic)}${text(name, desc)}<div class="st-seg${opts.some((o) => o.sub) ? ' two' : ''}">${opts.map((o) =>
    `<button class="${o.v === cur ? 'active' : ''}${recSeg(set, o.v) ? ' rec' : ''}" data-act="sset" data-set="${set}" data-v="${o.v}"><b>${o.name}</b>${o.sub ? `<small>${o.sub}</small>` : ''}${recSeg(set, o.v) ? recTag() : ''}</button>`).join('')}</div></div>`;
}

/** Kaydırıcı satırı; değer yanında. */
function range(set: string, k: string | null, v: number, min: number, max: number, step: number, shown: string, name: string, desc: string | undefined, ic: string): string {
  return `<div class="st-row">${icon(ic)}${text(name, desc)}<span class="st-rng"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-set="${set}"${k ? ` data-k="${k}"` : ''}><b>${shown}</b></span></div>`;
}

const layer = (id: MapLayer) => MAP_LAYERS.find((l) => l.id === id)!;
const mapRow = (id: MapLayer, ic: string = id) => sw('map', id, settings.map[id], layer(id).name, layer(id).desc || undefined, ic);

function graphics(): string {
  const g = settings.graphics;
  const q = QUALITY[g.quality];
  return [
    head(L('Görüntü', 'Image')),
    seg('quality', g.quality, (Object.keys(QUALITY) as GraphicsQuality[]).map((v) => ({ v, name: QUALITY[v].name, sub: QUALITY_SUB[v] })), L('Kalite', 'Quality'), QUALITY_DESC[g.quality], 'quality'),
    seg('resolution', g.resolution, RESOLUTIONS.map((r) => ({ v: r.id, name: r.name, sub: RES_SUB[r.id] })), L('Çözünürlük', 'Resolution'),
      L('Ekranın kaç pikselinin çizileceği. Otomatik: kare hızı düşünce görüntü biraz yumuşar.', 'How many of the screen’s pixels are drawn. Auto: the image softens slightly when the frame rate drops.'), 'resolution'),
    head(L('Gökyüzü ve ışık', 'Sky and light')),
    sw('dayCycle', null, g.dayCycle, L('Gün döngüsü', 'Day cycle'), L('Oyunda 48 dakikada bir gün; kapalıyken hep gündüz', 'One day every 48 minutes in game; always daytime when off'), 'dayCycle'),
    sw('clouds', null, g.clouds, L('Bulutlar', 'Clouds'),
      q.clouds ? L('Uzaktan bakınca söner', 'They fade when zoomed out') : L('Düşük kalitede yok', 'Not on Low quality'), 'clouds', !q.clouds),
    sw('shadows', null, g.shadows, L('Güneş gölgesi', 'Sun shadows'),
      q.shadows ? L('Yakından bakınca binalar ve park eden uçaklar gölge düşürür', 'Up close, buildings and parked aircraft cast shadows') : L('Yalnız Yüksek kalitede', 'High quality only'), 'shadows', !q.shadows),
    head(L('Sahne', 'Scene')),
    mapRow('scenery'),
    mapRow('effects'),
    `<p class="st-note">${L('Telefon ısınır ya da takılırsa önce kaliteyi, sonra çözünürlüğü düşür. Oyun takıldığını fark ederse kendisi de önerir.', 'If your phone gets hot or stutters, lower the quality first, then the resolution. The game also suggests it when it notices stutter.')}</p>`,
  ].join('');
}

function soundTab(): string {
  const lv = (id: SoundLevel) => settings.sound[id];
  return [
    sw('muted', null, settings.sound.muted, L('Sessiz', 'Mute'), L('N tuşu ya da üst çubuktaki hoparlör', 'N key or the speaker in the top bar'), 'muted'),
    head(L('Düzeyler', 'Levels')),
    ...SOUND_LEVELS.map((l) => range('sound', l.id, lv(l.id), 0, 1, 0.05, String(Math.round(lv(l.id) * 100)), l.name, l.desc || undefined, l.id)),
    `<p class="st-note">${L(
      'Seslerin hepsi gerçek kayıt; künyesi Haberler → “Sesler geldi”de. Telefonun sessiz düğmesi açıksa ses gelmeyebilir.',
      'Every sound is a real recording; credits are in News → “Sounds are here”. With the phone’s silent switch on, you may hear nothing.',
    )}</p>`,
  ].join('');
}

function mapTab(): string {
  return [
    head(L('Uçaklar', 'Aircraft')),
    mapRow('labels'), mapRow('buildingLabels'), mapRow('icons'), mapRow('trails'), mapRow('dropLines'), mapRow('shadows', 'shadows_ac'),
    head(L('Mermiler', 'Rounds')),
    mapRow('tracers'),
    range('tracerScale', null, settings.tracerScale, 0.4, 2.5, 0.1, `${settings.tracerScale.toFixed(1)}×`, L('Mermi izi kalınlığı', 'Tracer thickness'),
      L('Uzaktan görmek için kalınlaştır', 'Thicken to see them from afar'), 'tracerScale'),
    head(L('Görev ve savunma', 'Missions and defence')),
    mapRow('routes'), mapRow('aaRanges'), mapRow('radarCoverage'),
    seg('radarAgl', String(settings.radarAgl), [100, 200, 300, 600, 1500, 3000].map((v) => ({ v: String(v), name: `${v}` })),
      L('Radar kapsama yüksekliği (m)', 'Radar coverage height (m)'), L('Kapsama bu yükseklikte uçan uçağa göre çizilir; alçakta radar az görür', 'Coverage is drawn for an aircraft at this height; radar sees little down low'), 'radarAgl'),
    mapRow('contacts'), mapRow('fogOfWar'),
  ].join('');
}

/** Sık ızgara: simgesiz, açıklamalı anahtarlar. */
const grid = (rows: string[]) => `<div class="st-grid">${rows.join('')}</div>`;
const field = (id: InfoField) => {
  const f = INFO_FIELDS.find((x) => x.id === id)!;
  return sw('info', id, settings.info[id], f.name, f.desc);
};

function panelTab(): string {
  return `<p class="st-note top">${L('Seçili uçağın bilgi panelinde görünecek satırlar. Kapattığın satır panelde yer kaplamaz.', 'The lines shown in the selected aircraft’s info panel. Lines you turn off take no space.')}</p>
    ${head(L('Kimlik ve görev', 'Identity and mission'))}${grid((['flight', 'mission', 'status', 'pilot', 'kills'] as InfoField[]).map(field))}
    ${head(L('Uçuş', 'Flight'))}${grid((['speed', 'alt', 'agl', 'g', 'heading', 'attitude', 'throttle'] as InfoField[]).map(field))}
    ${head(L('Yük ve hasar', 'Load and damage'))}${grid((['fuel', 'mass', 'ammo', 'stores', 'damage'] as InfoField[]).map(field))}`;
}

function gameTab(): string {
  return sw('autoFast', null, settings.game.autoFast, L('Boş yolda otomatik 2×', 'Automatic 2× on the open road'), L(
    '1× seçiliyken kolların yalnız yoldaysa oyun 2× akar; çatışma, görev, kalkış ve inişte 1×',
    'While 1× is selected and your flights are only travelling, the game runs at 2×; 1× in combat, missions, takeoff and landing',
  ), 'autoFast') + head(L('Olay günlüğü', 'Event log'))
    + `<p class="st-note top">${L('Sol paneldeki günlükte görünecek olaylar.', 'The events shown in the log on the left panel.')}</p>`
    + grid(LOG_CATEGORIES.map((c) => sw('log', c.id as LogCategory, settings.log[c.id], c.name, c.desc)));
}

/** Pencerenin gövdesi: sekmeler (başlık sacında) ve seçili sekmenin satırları. rec: takılma önerisi (işaretlenir). */
export function settingsBody(tab: SettingsTab, rec: PerfHint | null = null): string {
  hint = rec;
  const tabs = `<div class="rtabs st-tabs">${SETTINGS_TABS.map((t) =>
    `<button class="${t.id === tab ? 'active' : ''}" data-act="stab" data-tab="${t.id}"><b>${t.name}</b></button>`).join('')}</div>`;
  const body = tab === 'grafik' ? graphics() : tab === 'ses' ? soundTab() : tab === 'harita' ? mapTab() : tab === 'panel' ? panelTab() : gameTab();
  hint = null;
  return `${tabs}<div class="st-list">${body}</div>`;
}

/**
 * Ayarı uygula (kaydetmez). set: data-set, k: data-k, v: kutuda işaret, kaydırıcı ve seçicide değer. Dönüş: pencere
 * yeniden çizilmeli mi (bağımlı satırlar değişir).
 */
export function applySetting(set: string, k: string | undefined, v: string | boolean): boolean {
  const on = v === true;
  if (set === 'map') settings.map[k as MapLayer] = on;
  else if (set === 'info') settings.info[k as InfoField] = on;
  else if (set === 'log') settings.log[k as LogCategory] = on;
  else if (set === 'radarAgl') settings.radarAgl = Number(v);
  else if (set === 'tracerScale') settings.tracerScale = Number(v);
  else if (set === 'quality') {
    settings.graphics.quality = v as GraphicsQuality;
    return true;
  } else if (set === 'resolution') settings.graphics.resolution = v as Resolution;
  else if (set === 'dayCycle') settings.graphics.dayCycle = on;
  else if (set === 'clouds') settings.graphics.clouds = on;
  else if (set === 'shadows') settings.graphics.shadows = on;
  else if (set === 'autoFast') settings.game.autoFast = on;
  else if (set === 'muted') settings.sound.muted = on;
  else if (set === 'sound') settings.sound[k as SoundLevel] = Number(v);
  return set === 'radarAgl' || set === 'resolution';
}
