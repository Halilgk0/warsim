// Hangarın hava savunma bölümü: silahın bilgileri ve menzil-tavan grafiği. Sayılar simülasyonun kullandığı tanımlardan ve hesaptan
// gelir (airDefense.ts); oyunda top tam burada yazdığı gibi davranır. Hasar ve parçacık yarıçapı gösterilmez: oyun dengesidir,
// gerçek değer değil.

import { SPECS, originName } from '../sim/aircraft/specs';
import { fmtMoney } from '../sim/economy';
import { AA_CLASS_NAMES, AA_SENSORS, type AAClass, type AASensorId, type AAWeaponDef, flightTime, gunBuildTime, practicalPerMin, shellDrag } from '../sim/structures/airDefense';
import { TECH_BY_ID, type Research } from '../sim/tech';
import { esc, nf } from './dom';
import { L, LOCALE } from '../i18n';

const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

const SEC = L('sn', 's');
const km = (m: number): string => `${nf1.format(m / 1000)} km`;

/** Sınıf başına eksen: aynı sınıftaki silahlar karşılaştırılabilsin. */
const AXIS: Record<AAClass, { top: number; step: number }> = {
  hafif: { top: 3000, step: 1000 },
  orta: { top: 6000, step: 2000 },
  agir: { top: 16000, step: 4000 },
};

/** Grafikte seyir irtifası işaretlenen uçaklar: sınıfın karşılaştığı tipik hedefler. */
const REF_PLANES: Record<AAClass, string[]> = {
  hafif: ['il2m3'],
  orta: ['il2m3', 'ju87b', 'he111'],
  agir: ['he111', 'b17g', 'b29'],
};

const LABEL_ANGLE = (25 * Math.PI) / 180;

/** s metreye varış süresinin tersi: t saniyede gidilen yol. */
function reach(w: AAWeaponDef, t: number): number {
  const k = shellDrag(w);
  return Math.log(1 + k * w.muzzleVel * t) / k;
}

/** Menzil-tavan zarfı: dolu alan topun ateş edebildiği bölge, içindeki yaylar mermi uçuş süresi. Yatay ve dikey ölçek aynı. */
export function aaChart(w: AAWeaponDef): string {
  const W = 320;
  const H = 170;
  const pad = { l: 34, r: 10, t: 18, b: 22 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const { top, step } = AXIS[w.cls];
  const xMax = (top * pw) / ph;
  const x = (d: number) => pad.l + (d / xMax) * pw;
  const y = (h: number) => pad.t + (1 - h / top) * ph;
  const px = (d: number) => (d / xMax) * pw;
  const c = Math.min(w.ceiling, w.range);
  const area = `M${x(0)} ${y(0)} L${x(w.range).toFixed(1)} ${y(0)} A${px(w.range).toFixed(1)} ${px(w.range).toFixed(1)} 0 0 0 ${x(Math.sqrt(w.range * w.range - c * c)).toFixed(1)} ${y(c).toFixed(1)} L${x(0)} ${y(c).toFixed(1)} Z`;
  const tMax = flightTime(w, w.range);
  const marks = tMax >= 25 ? [5, 10, 20] : tMax >= 10 ? [2, 5, 10] : [1, 2, 4];
  const arcs = marks.filter((t) => reach(w, t) < w.range * 0.97).map((t) => {
    const s = reach(w, t);
    const hTop = Math.min(s, c);
    const r = px(s).toFixed(1);
    // Etiket yayın üstünde, yerden 25° yukarıda: yan yana yaylarda üst üste binmesin
    const lx = x(s * Math.cos(LABEL_ANGLE));
    const ly = y(Math.min(s * Math.sin(LABEL_ANGLE), c));
    return `<path class="t" d="M${x(s).toFixed(1)} ${y(0)} A${r} ${r} 0 0 0 ${x(Math.sqrt(s * s - hTop * hTop)).toFixed(1)} ${y(hTop).toFixed(1)}"/>
      <text class="tl" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle">${t} ${SEC}</text>`;
  }).join('');
  let grid = '';
  for (let h = step; h <= top; h += step) {
    grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(h)}" y2="${y(h)}" class="g"/><text x="${pad.l - 4}" y="${y(h) + 3}" text-anchor="end">${nf.format(h / 1000)} km</text>`;
  }
  for (let d = step; d < xMax; d += step) {
    grid += `<text x="${x(d)}" y="${H - pad.b + 11}" text-anchor="middle">${nf.format(d / 1000)}</text>`;
  }
  const lines = REF_PLANES[w.cls].map((id) => SPECS[id]).map((s) => `<line class="r" x1="${pad.l}" x2="${W - pad.r}" y1="${y(s.cruiseAlt).toFixed(1)}" y2="${y(s.cruiseAlt).toFixed(1)}"/>
    <text class="rl" x="${W - pad.r}" y="${(y(s.cruiseAlt) - 2).toFixed(1)}" text-anchor="end">${esc(s.abbr)}</text>`).join('');
  return `<svg class="pchart aachart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L(`Menzil ${km(w.range)}, etkili tavan ${km(w.ceiling)}`, `Range ${km(w.range)}, effective ceiling ${km(w.ceiling)}`))}">
    ${grid}
    <path class="e" d="${area}"/>
    ${arcs}
    <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${H - pad.b}" class="a"/>
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" class="a"/>
    ${lines}
    <text x="${pad.l}" y="11">${L('yükseklik', 'height')}</text>
    <text x="${W - pad.r}" y="${H - 1}" text-anchor="end">${L('yatay mesafe, km', 'horizontal distance, km')}</text>
  </svg>`;
}

function magazineText(w: AAWeaponDef): string {
  const n = w.barrels ? `${w.barrels} × ${w.mag / w.barrels}` : `${w.mag}`;
  if (w.drum) return L(`${n} mermilik tambur · ~${nf1.format(w.reload)} ${SEC} değiştirme`, `${n}-round drum · ~${nf1.format(w.reload)} ${SEC} to change`);
  return w.clip
    ? L(`${n} mermilik tarak · ~${nf1.format(w.reload)} ${SEC} değiştirme`, `${n}-round clip · ~${nf1.format(w.reload)} ${SEC} to change`)
    : L(`${n} mermilik şarjör · ~${nf1.format(w.reload)} ${SEC} değiştirme`, `${n}-round magazine · ~${nf1.format(w.reload)} ${SEC} to change`);
}

/** Bu silaha etki eden nişan aletleri ve bataryalar için araştırmalar (✓ araştırıldı). */
function upgrades(w: AAWeaponDef, research: Research | null): string {
  const ids: AASensorId[] = w.medium ? ['rangefinder', 'predictor', 'gunRadar', 'proximity'] : ['rangefinder', 'gunRadar'];
  const chip = (req: string, name: string, title: string) => {
    const done = research?.has(req) ?? false;
    return `<span class="chip ${done ? '' : 'chip-off'}" title="${esc(title)}">${done ? '✓' : '○'} ${esc(name)}</span>`;
  };
  const sensors = ids.map((id) => chip(AA_SENSORS[id].requires, AA_SENSORS[id].name, AA_SENSORS[id].desc));
  const team = ['hd_crew', 'hd_ammo'].map((id) => chip(id, TECH_BY_ID[id].name, TECH_BY_ID[id].desc));
  return `<h3>${L('Geliştirmeler', 'Upgrades')}</h3>
    <p class="muted small">${L('Nişan aletleri her bataryaya ayrıca kurulur; okul ve mühimmat bütün bataryalarda geçerlidir (✓ araştırıldı).', 'Sights are installed at each battery; the school and ammunition apply to all batteries (✓ researched).')}</p>
    <div class="chips">${[...sensors, ...team].join('')}</div>`;
}

export function aaDetails(w: AAWeaponDef, research: Research | null): string {
  const unlocked = research ? research.has(w.requires ?? undefined) : true;
  const status = !w.requires
    ? L('başlangıçta açık', 'available from the start')
    : unlocked ? L('araştırıldı', 'researched')
    : `${L('hava savunma ağacında', 'in the air defence tree')}: ${TECH_BY_ID[w.requires].name}`;
  const practical = practicalPerMin(w);
  const rows: [string, string][] = [
    [L('Kalibre / mermi', 'Calibre / shell'), `${nf1.format(w.bore)} mm · ${w.shellKg < 1 ? `${nf.format(w.shellKg * 1000)} g` : `${nf1.format(w.shellKg)} kg`}`],
    [L('Namlu hızı', 'Muzzle velocity'), `${nf.format(w.muzzleVel)} m/${SEC}`],
    ...(w.mag > 0
      ? [[L('Seri hız / pratik', 'Cyclic / practical'), `${nf.format(Math.round(w.rate * 60))} / ~${nf.format(practical)} ${L('atış/dk', 'rounds/min')}`] as [string, string], [L('Besleme', 'Feed'), magazineText(w)] as [string, string]]
      : [[L('Atış hızı', 'Rate of fire'), `~${nf.format(practical)} ${L('atış/dk', 'rounds/min')}`] as [string, string]]),
    [L('Menzil', 'Range'), km(w.range)],
    [L('Etkili tavan', 'Effective ceiling'), km(w.ceiling)],
    [L('Tavana uçuş süresi', 'Flight time to ceiling'), `${nf.format(Math.round(flightTime(w, w.ceiling)))} ${SEC}`],
    [L('Namlu dönüşü', 'Traverse'), `${nf.format(w.slew)}°/${SEC}`],
    ...(w.crew ? [[L('Mürettebat', 'Crew'), `${w.crew}`] as [string, string]] : []),
    [L('Üretim', 'Production'), `${fmtMoney(w.cost)} · ${gunBuildTime(w)} ${SEC}`],
    [L('Yuvaya takma', 'Fitting time'), `${w.installTime} ${SEC}`],
    [L('Araştırma', 'Research'), status],
  ];
  return `
    <div class="info-title">${esc(w.name)}${w.name.includes(w.short) ? '' : ` <span class="abbr">${esc(w.short)}</span>`}</div>
    <div class="badges"><span class="badge">${esc(originName(w.origin))} · ${w.year}</span><span class="badge">${esc(AA_CLASS_NAMES[w.cls].name)}</span><span class="badge">${w.kind === 'flak' ? L('Zaman tapalı mermi', 'Time-fuzed shell') : w.burstRadius > 0 ? L('Kendini imha eden izli mermi', 'Self-destructing tracer') : L('İzli mermi', 'Tracer')}</span></div>
    <p>${esc(w.desc)}</p>
    ${aaChart(w)}
    <p class="muted small">${L('Dolu alan: topun ateş edebildiği bölge. Yaylar: merminin oraya varma süresi. Yatay çizgiler: uçakların seyir irtifası.', 'Filled area: where the gun can fire. Arcs: shell flight time. Horizontal lines: aircraft cruising altitudes.')}</p>
    <div class="kv">${rows.map(([k, v]) => `<span>${k}</span><span>${esc(v)}</span>`).join('')}</div>
    ${upgrades(w, research)}
    <p class="muted small">${L('Namlu dönüşü Bofors dışında oyun için tahmindir. Pratik atış hızı eğitimli mürettebatla; deneyim şarjör değiştirmeyi hızlandırır.', 'Traverse is a game estimate except for the Bofors. Practical rate is for a trained crew; experience speeds up reloading.')}</p>`;
}
