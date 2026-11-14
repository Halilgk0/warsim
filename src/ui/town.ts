// Belediye ekranı (belediye binasının penceresi): şehrin özeti, kalem kalem gelir ve gider, süren araştırma, üretim ve
// inşaatlar. Sayılar Team.flow'dan (world.pay / earn kalemleri); eski kayıtlarda kalemsiz geçmiş "Önceki dönem" satırında.
// Görünüm: resmî belge (style.css ".modal-card.town"): bordo başlık ve arma, fildişi kâğıt, altın çift çerçeve, serif
// başlıklar, defter çizgili tablolar. Çelik temadan ayrı; yalnız bu pencerede.

import type { World } from '../sim/world';
import { SPECS } from '../sim/aircraft/specs';
import { EXPENSE_CATS, INCOME_CATS, fmtMoney, moneyCatName, type MoneyCat } from '../sim/economy';
import { AA_WEAPONS, gunBuildTime } from '../sim/structures/airDefense';
import { BASE_UPGRADES } from '../sim/structures/airbase';
import { SLOT_ORDER, TECH_BY_ID, type Slot } from '../sim/tech';
import { techName } from './research';
import { bar, esc, fmtDur, nf, pct } from './dom';
import { L, count } from '../i18n';

const GREEN = 'var(--tw-green)';
const WINE = 'var(--tw-wine)';
const GOLD = 'var(--tw-gold)';

/** Arma: kalkan içinde saat kulesi, iki yanında defne dalı. */
const CREST = `<svg class="tw-crest" viewBox="0 0 64 56" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 6c6 3 12 4 17 4v17c0 11-7 18-17 23C22 45 15 38 15 27V10c5 0 11-1 17-4z"/>
    <path d="M28 40V24h8v16M26 24h12M29 24l3-7 3 7M25 40h14"/>
    <circle cx="32" cy="29" r="1.6"/>
    <path d="M11 46C5 40 3 31 5 22M53 46c6-6 8-15 6-24"/>
    <path d="M5 22l4 3M4 29l5 1M6 36l5-1M9 42l4-3M59 22l-4 3M60 29l-5 1M58 36l-5-1M55 42l-4-3"/>
  </g>
</svg>`;

/** Pencere başlığı (arma, ad, alt satır): modals.ts başlığa olduğu gibi koyar. */
export function townTitle(w: World, team: number): string {
  const t = w.teams[team];
  return `${CREST}<span class="tw-title">${L('Belediye', 'Town hall')}<small>${esc(t?.name ?? '')} · ${L('şehir yönetimi', 'town administration')}</small></span>`;
}

/** Bölüm başlığı: süs, ad, yanında küçük not, ince altın çizgi ve (varsa) bağlantı. */
function head(title: string, note = '', link = ''): string {
  return `<h3><span class="tw-orn">❖</span><span>${title}</span>${note ? `<small>${note}</small>` : ''}<i></i>${link}</h3>`;
}

/** Kalem tablosu: ad, toplam, pay çubuğu. Kalemlere dağılmamış eski tutar "Önceki dönem" satırında. */
function flowTable(flow: Partial<Record<MoneyCat, number>>, cats: readonly MoneyCat[], total: number, color: string, live: Partial<Record<MoneyCat, string>> = {}): string {
  const sum = cats.reduce((a, c) => a + (flow[c] ?? 0), 0);
  const rest = Math.max(0, total - sum);
  const all = Math.max(1, sum + rest);
  const row = (name: string, v: number, extra = ''): string => {
    const p = Math.round((v / all) * 100);
    return `<tr><td>${name}${extra ? ` <small>${extra}</small>` : ''}</td><td>${nf.format(v)} kr</td><td class="tw-share">${bar((v / all) * 100, color, true)}</td><td>${L(`%${p}`, `${p}%`)}</td></tr>`;
  };
  const rows = cats.filter((c) => (flow[c] ?? 0) >= 1 || live[c]).sort((a, b) => (flow[b] ?? 0) - (flow[a] ?? 0)).map((c) => row(moneyCatName(c), flow[c] ?? 0, live[c])).join('');
  const old = rest >= 1 ? row(L('Önceki dönem (ayrıntısız)', 'Earlier (no breakdown)'), rest) : '';
  if (!rows && !old) return `<p class="tw-none">${L('Henüz hareket yok.', 'Nothing yet.')}</p>`;
  return `<table class="tw-flow"><tr><th>${L('Kalem', 'Item')}</th><th>${L('Toplam', 'Total')}</th><th></th><th>${L('Pay', 'Share')}</th></tr>${rows}${old}</table>`;
}

export function townBody(w: World, team: number): string {
  const t = w.teams[team];
  const own = w.structures.filter((s) => s.team === team && !s.destroyed);
  const homes = own.filter((s) => s.active && (s.def.population ?? 0) > 0);
  const parks = own.filter((s) => s.active && s.kind === 'park').length;
  const pers = t.personnel;
  const roadLen = w.roads.filter((r) => r.team === team).reduce((a, r) => a + Math.hypot(r.bx - r.ax, r.bz - r.az), 0);
  const perMin = `<i>/${L('dk', 'min')}</i>`;
  const plaque = (label: string, value: string): string => `<div class="tw-plaque"><small>${label}</small><b>${value}</b></div>`;

  const summary = `
    <div class="tw-sum">
      ${plaque(L('Nüfus', 'Population'), `${nf.format(pers.capacity)}${w.personnelEnabled ? `<i> · ${L(`${w.crewFree(team)} boşta`, `${w.crewFree(team)} free`)}</i>` : ''}`)}
      ${plaque(L('Konut · park · yol', 'Homes · parks · roads'), `${homes.length} · ${parks} · ${nf.format(roadLen)}<i> m</i>`)}
      ${plaque(L('Kira · maden', 'Rent · mines'), `${nf.format(w.houseRate(team))} · ${nf.format(w.mineRate(team))}${perMin}`)}
      ${plaque(L('Hazine', 'Treasury'), w.economyEnabled ? fmtMoney(t.money) : '—')}
    </div>`;

  // ---------------------------------------------------------------- gelir ve gider
  let money = '';
  if (w.economyEnabled) {
    const net = t.earned - t.spent;
    money = `
      ${head(L('Gelirler', 'Income'), fmtMoney(t.earned), `<button class="link" data-act="town-treasury">${L('Hazine ve madenler ›', 'Treasury and mines ›')}</button>`)}
      ${flowTable(t.flow, INCOME_CATS, t.earned, GREEN, {
        mine: w.mineRate(team) >= 1 ? `${nf.format(w.mineRate(team))} kr/${L('dk', 'min')}` : undefined,
        rent: w.houseRate(team) >= 1 ? `${nf.format(w.houseRate(team))} kr/${L('dk', 'min')}` : undefined,
      })}
      ${head(L('Giderler', 'Spending'), fmtMoney(t.spent))}
      ${flowTable(t.flow, EXPENSE_CATS, t.spent, WINE)}
      <div class="tw-net"><span>${L('Fark', 'Balance')}</span><b class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}${nf.format(Math.abs(net))} kr</b>
        <small>${L(`son 1 dk gelir +${fmtMoney(w.incomeRate(team))}`, `income, last min +${fmtMoney(w.incomeRate(team))}`)}</small></div>`;
  } else {
    money = `<p class="tw-none">${L('Bu senaryoda para kuralları kapalı.', 'Money rules are off in this scenario.')}</p>`;
  }

  // ---------------------------------------------------------------- personel dökümü (2026-11-13)
  // Konuttaki kişiler nerede: uçuşta (kalkan uçakların mürettebatı), bakımda (her uçağın bakımcısı), itfaiyede, boşta;
  // kayıpların yerine gelmekte olanlar ayrı satır. Oyuncu "neden boşta kimse yok" sorusunun cevabını burada görür
  let crew = '';
  if (w.personnelEnabled) {
    const flying = Math.min(pers.reserved, pers.people);
    const maint = w.maintOf(team);
    const staff = pers.staff;
    const free = w.crewFree(team);
    const short = Math.max(0, pers.capacity - pers.people);
    const all = Math.max(1, pers.capacity);
    const row = (name: string, n: number, color: string, note = ''): string =>
      `<tr><td>${name}${note ? ` <small>${note}</small>` : ''}</td><td>${nf.format(n)}</td><td class="tw-share">${bar((n / all) * 100, color, true)}</td><td>${L(`%${Math.round((n / all) * 100)}`, `${Math.round((n / all) * 100)}%`)}</td></tr>`;
    crew = `
      ${head(L('Personel', 'Personnel'), L(`${nf.format(pers.capacity)} kişilik konut`, `housing for ${nf.format(pers.capacity)}`), `<button class="link" data-act="town-build">${L('Ev kur ›', 'Build homes ›')}</button>`)}
      <table class="tw-flow"><tr><th>${L('Görev', 'Duty')}</th><th>${L('Kişi', 'People')}</th><th></th><th>${L('Pay', 'Share')}</th></tr>
        ${row(L('Uçuşta', 'Flying'), flying, GOLD, L('kalkan uçakların mürettebatı', 'crews of aircraft in the air'))}
        ${row(L('Bakımda', 'Ground crew'), maint, WINE, L('her uçak 1 kişi', '1 per aircraft'))}
        ${staff > 0 ? row(L('İtfaiyede', 'Fire brigade'), staff, WINE) : ''}
        ${row(L('Boşta', 'Free'), free, GREEN, free <= 0 ? L('uçak üretmek ve kaldırmak için ev kur', 'build homes to make and fly aircraft') : L('kalkış ve üretim için', 'for take-offs and production'))}
        ${short > 0 ? row(L('Yerine geliyor', 'Arriving'), short, 'var(--tw-soft)', L('kayıpların yerine', 'replacing losses')) : ''}
      </table>`;
  }

  // ---------------------------------------------------------------- süren işler
  const job = (name: string, sub: string, p: number, left: number): string =>
    `<div class="tw-job"><div class="tw-j-top"><b>${name}</b><span>${sub}</span></div>${bar(p * 100, GOLD, true)}<small>${pct(p)} · ${L(`${fmtDur(left)} kaldı`, `${fmtDur(left)} left`)}</small></div>`;
  const r = t.research;
  const lineName: Record<Slot, string> = {
    vehicle: L('Uçak programı', 'Aircraft programme'), tech: L('Mühendislik hattı', 'Engineering line'), defense: L('Hava savunma hattı', 'Air defence line'),
  };
  const research = SLOT_ORDER.map((k) => {
    const c = r.slots[k].current;
    const q = r.slots[k].queue.length;
    if (!c) {
      const wt = r.waiting[k];
      return `<div class="tw-job idle"><div class="tw-j-top"><b>${lineName[k]}</b><span>${wt ? `${esc(techName(TECH_BY_ID[wt]))} · ${L('para bekleniyor', 'awaiting funds')}` : L('boş', 'idle')}</span></div></div>`;
    }
    return job(esc(techName(TECH_BY_ID[c.id])), `${lineName[k]}${q ? ` · ${L('sırada', 'queued')} ${q}` : ''}`, c.progress, r.remaining(c.id));
  }).join('');

  const prod: string[] = [];
  for (const s of own) {
    const f = s.factory;
    if (!f || !s.active) continue;
    const speed = 0.4 + 0.6 * (s.hp / s.maxHp);
    const it = f.queue[0];
    if (it) {
      const sp = SPECS[it.specId];
      prod.push(job(esc(sp.name), `${esc(s.name)}${f.queue.length > 1 ? ` · ${L('sırada', 'queued')} ${f.queue.length - 1}` : ''}`, it.progress, ((1 - it.progress) * sp.buildTime) / speed));
    }
    const g = f.gunQueue[0];
    if (g) {
      const wd = AA_WEAPONS[g.gun];
      prod.push(job(esc(wd.name), `${esc(s.name)}${f.gunQueue.length > 1 ? ` · ${L('sırada', 'queued')} ${f.gunQueue.length - 1}` : ''}`, g.progress, ((1 - g.progress) * gunBuildTime(wd)) / speed));
    }
  }

  const works: string[] = [];
  for (const s of own) {
    if (s.build < 1) works.push(job(esc(s.name), L('inşaat', 'construction'), s.build, (1 - s.build) * s.def.buildTime));
    const bj = s.airbase?.job;
    if (bj) works.push(job(esc(BASE_UPGRADES[bj.key].name), esc(s.name), 1 - bj.left / bj.total, bj.left));
    const aj = s.aa?.job;
    if (aj) works.push(job(esc(aj.label), esc(s.name), 1 - aj.left / aj.total, aj.left));
  }
  const none = (text: string): string => `<p class="tw-none">${text}</p>`;
  const jobs = `
    ${head(L('Araştırma', 'Research'), '', `<button class="link" data-act="town-research">${L('Araştırma ›', 'Research ›')}</button>`)}
    ${research}
    ${head(L('Üretim', 'Production'), '', `<button class="link" data-act="town-factory">${L('Üretim ›', 'Production ›')}</button>`)}
    ${prod.join('') || none(L('Fabrikalarda üretim yok.', 'Nothing in production.'))}
    ${head(L('İnşaat ve tesisler', 'Construction and facilities'))}
    ${works.join('') || none(L('Süren inşaat yok.', 'Nothing under construction.'))}`;

  const note = `<p class="tw-foot">${L(
    `Belediye binası gelir getirmez. Evler ancak yolların yanına kurulur; yol belediyenin caddesinden başlar (İnşa → Şehir → Yol). ${homes.length} konut ${nf.format(pers.capacity)} kişi barındırıyor.`,
    `The town hall earns nothing. Houses can only be built beside roads; roads start from the town hall's street (Build → City → Road). ${count(homes.length, 'home')} house ${nf.format(pers.capacity)} people.`,
  )}</p>`;

  return `${summary}
    <div class="tw-grid">
      <section>${crew}${money}</section>
      <section>${jobs}</section>
    </div>${note}`;
}
