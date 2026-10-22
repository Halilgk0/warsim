// Oyun seslerini gerçek kayıtlardan üretir: public/sounds/<ad>.mp3 + manifest.json + CREDITS.txt ve src/audio/credits.ts.
// Önce: npm install && node fetch.mjs (ham kayıtlar raw/ altına; depoya girmez). Kaynaklar ve lisanslar: sources.json.
// Motor: en kararlı bölüm → dikişsiz döngü. Silah: gerçek tek atışlar gerçek ateş hızında üst üste → seri döngüsü.
// Diğerleri: kesim, yumuşatma, alçak frekans temizliği, düzey eşitleme.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decode, encode, rmsTrack, spectrum } from './audio.mjs';

const SR = 48000;
const OUT = '../../public/sounds';
mkdirSync(OUT, { recursive: true });
const meta = JSON.parse(readFileSync('sources.json', 'utf8'));
const cache = new Map();
const load = (id) => {
  if (!cache.has(id)) cache.set(id, decode(`raw/${id}.ogg`, SR));
  return cache.get(id);
};
const used = new Set();
const manifest = {};
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;

// ---------------------------------------------------------------- yardımcılar
const cut = (x, t0, t1) => x.slice(Math.max(0, Math.round(t0 * SR)), Math.min(x.length, Math.round(t1 * SR)));
function fade(x, inS = 0.005, outS = 0.05) {
  const y = x.slice();
  const a = Math.round(inS * SR), b = Math.round(outS * SR);
  for (let i = 0; i < a && i < y.length; i++) y[i] *= i / a;
  for (let i = 0; i < b && i < y.length; i++) y[y.length - 1 - i] *= Math.pow(i / b, 1.5);
  return y;
}
/** İkinci dereceden süzgeç (RBJ): 'hp' | 'lp'. */
function biquad(x, type, f, q = 0.707) {
  const w = (2 * Math.PI * f) / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w);
  let b0, b1, b2;
  if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const rmsDb = (x) => { let s = 0; for (const v of x) s += v * v; return 10 * Math.log10(s / x.length + 1e-12); };
const peakOf = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
/** Yumuşak sınırlayıcı (kırpılmış kaynaklarda sertliği alır). */
function soft(x, ceil = 0.95) {
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = ceil * Math.tanh(x[i] / ceil);
  return y;
}
function gain(x, g) { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * g; return y; }
/** Ortalama düzeyi hedefe getir, tepe -1 dBFS'i aşarsa yumuşak sınırla. */
function levelRms(x, target) { return soft(gain(x, Math.pow(10, (target - rmsDb(x)) / 20)), 0.89); }
function levelPeak(x, target = -1) { return gain(x, Math.pow(10, target / 20) / (peakOf(x) || 1)); }
/** Perde kaydırma (yeniden örnekleme; süre de değişir). */
function resample(x, rate) {
  const n = Math.floor(x.length / rate);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * rate, k = Math.floor(p), f = p - k;
    y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? 0) * f;
  }
  return y;
}
function mix(len, parts) {
  const y = new Float32Array(Math.round(len * SR));
  for (const [x, at, g = 1] of parts) {
    const o = Math.round(at * SR);
    for (let i = 0; i < x.length && o + i < y.length; i++) if (o + i >= 0) y[o + i] += x[i] * g;
  }
  return y;
}

/** Aralıktaki en kararlı len saniyelik pencere (düzey ve parlaklık değişimi en az, başı ve sonu benzer). */
function stableStart(x, t0, t1, len) {
  const hop = 0.05, n = Math.round(hop * SR);
  const feats = [];
  for (let t = t0; t + hop <= t1; t += hop) {
    const s = cut(x, t, t + hop);
    const sp = spectrum(s, 0, 2048);
    let num = 0, den = 0;
    for (let k = 2; k < sp.length; k++) { const e = Math.pow(10, sp[k] / 10); num += e * k; den += e; }
    feats.push({ t, db: rmsDb(s), c: num / den });
  }
  const w = Math.round(len / hop);
  let best = null;
  for (let i = 0; i + w < feats.length; i += 2) {
    const f = feats.slice(i, i + w);
    const mdb = f.reduce((a, b) => a + b.db, 0) / w, mc = f.reduce((a, b) => a + b.c, 0) / w;
    const sdb = Math.sqrt(f.reduce((a, b) => a + (b.db - mdb) ** 2, 0) / w);
    const sc = Math.sqrt(f.reduce((a, b) => a + ((b.c - mc) / mc) ** 2, 0) / w);
    const ends = Math.abs(f[0].db - f[w - 1].db) + Math.abs(f[1].db - f[w - 2].db);
    const score = sdb + 20 * sc + 0.5 * ends - 0.05 * mdb;
    if (!best || score < best.score) best = { t: f[0].t, score, sdb, sc };
  }
  void n;
  return best;
}
/** Dikişsiz döngü: sonun devamı başla eşit güçte karışır. */
function makeLoop(x, t, len, xf = 0.35) {
  const s = cut(x, t, t + len + xf);
  const L = Math.round(len * SR), X = Math.round(xf * SR);
  const y = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    if (i < X) {
      const a = (i / X) * (Math.PI / 2);
      y[i] = s[i] * Math.sin(a) + s[i + L] * Math.cos(a);
    } else y[i] = s[i];
  }
  return y;
}
/** Ani yükselişler (atış başları), saniye. */
function onsets(x, t0, t1, thr = 12, minGap = 0.05) {
  const seg = cut(x, t0, t1);
  const r = rmsTrack(seg, SR, 0.002);
  const out = [];
  let last = -1e9;
  for (let i = 8; i < r.length; i++) {
    const prev = r.slice(i - 8, i - 2).reduce((a, b) => a + b, 0) / 6;
    if (r[i] - prev > thr && r[i] > -40 && (i - last) * 0.002 > minGap) { out.push(t0 + i * 0.002); last = i; }
  }
  return out;
}
/** Tek atış: başlangıçtan len saniye, sonu yumuşak. */
function shot(x, t, len) { return fade(cut(x, t - 0.003, t + len), 0.002, len * 0.45); }
/**
 * Seri döngüsü: guns silahın her biri rpm hızında, kendi evresiyle; döngü sonunda sarar (dikişsiz).
 * Atışlar örnek bankasından rastgele, hafif düzey ve perde farkıyla.
 */
function burstLoop(bank, guns, rpm, len, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const L = Math.round(len * SR);
  const y = new Float32Array(L);
  const iv = 60 / rpm;
  for (let g = 0; g < guns; g++) {
    // Her silahın aralığı döngüye tam sığsın (ritim dikişte bozulmasın)
    const n = Math.max(1, Math.round(len / iv));
    const step = len / n;
    const phase = rnd() * step;
    for (let k = 0; k < n; k++) {
      const t = phase + k * step + (rnd() - 0.5) * step * 0.12;
      const b = resample(bank[Math.floor(rnd() * bank.length)], 0.97 + rnd() * 0.06);
      const gg = 0.8 + rnd() * 0.4;
      const o = Math.round(t * SR);
      for (let i = 0; i < b.length; i++) y[(o + i) % L] += b[i] * gg;
    }
  }
  return y;
}
/** En yüksek düzeyin zamanı (geçiş sesinde uçağın en yakın anı). */
function peakTime(x) {
  const r = rmsTrack(x, SR, 0.1);
  let k = 0;
  for (let i = 1; i < r.length; i++) if (r[i] > r[k]) k = i;
  return (k + 0.5) * 0.1;
}

function save(name, x, o = {}) {
  if (only && !only.has(name)) return;
  const kbps = o.kbps ?? 96;
  encode(`${OUT}/${name}.mp3`, x, SR, ['-codec:a', 'libmp3lame', '-b:a', `${kbps}k`]);
  manifest[name] = { len: +(x.length / SR).toFixed(4), loop: !!o.loop, ...(o.peak !== undefined ? { peak: +o.peak.toFixed(3) } : {}), src: o.src };
  for (const id of o.src) used.add(id);
  console.log(`${name.padEnd(14)} ${(x.length / SR).toFixed(2)}s rms ${rmsDb(x).toFixed(1)} peak ${(20 * Math.log10(peakOf(x))).toFixed(1)}${o.peak !== undefined ? ` tepe@${o.peak.toFixed(2)}` : ''} ${o.note ?? ''}`);
}

// ---------------------------------------------------------------- motorlar (döngü)
function engineLoop(name, id, t0, t1, len, o = {}) {
  let x = load(id);
  x = biquad(cut(x, t0 - 1, t1 + 1), 'hp', o.hp ?? 35);
  const b = stableStart(x, 1, t1 - t0 + 1, len + 0.35);
  let y = makeLoop(x, b.t, len);
  if (o.lp) y = biquad(y, 'lp', o.lp);
  y = levelRms(y, o.rms ?? -16);
  save(name, y, { loop: true, src: [id], note: `başlangıç ${(t0 - 1 + b.t).toFixed(2)} sn, düzey sapması ${b.sdb.toFixed(2)} dB` });
}
engineLoop('eng_inline', 142898, 36, 70, 4.0);
engineLoop('eng_radial', 143556, 1.5, 16.5, 4.0);
engineLoop('eng_bomber', 437863, 4, 31, 5.0, { lp: 7000 });
engineLoop('eng_jet', 704945, 28, 100, 4.0);

// ---------------------------------------------------------------- geçişler (yakından geçen uçak)
function flyby(name, id, t0, t1, o = {}) {
  // Uzun kayıtlar en yakın anın çevresinde kısaltılır (en çok ±span/2)
  const span = o.span ?? 10;
  if (t1 - t0 > span) {
    const p = t0 + peakTime(cut(load(id), t0, t1));
    t0 = Math.max(t0, p - span * 0.45);
    t1 = Math.min(t1, t0 + span);
  }
  let x = biquad(cut(load(id), t0, t1), 'hp', o.hp ?? 40);
  x = fade(x, 0.4, 1.2);
  x = levelPeak(soft(gain(x, 1 / (peakOf(x) || 1)), 0.95), -1.5);
  save(name, x, { peak: peakTime(x), src: [id], kbps: 80 });
}
flyby('fly_inline1', 142901, 13, 28);
flyby('fly_inline2', 143558, 0, 11.6);
flyby('fly_radial1', 143560, 0, 11.6);
flyby('fly_radial2', 143562, 0, 8.3);
flyby('fly_bomber1', 325563, 10, 45);
flyby('fly_bomber2', 162240, 0, 22.7);
flyby('fly_jet1', 536809, 0, 7.2);
flyby('fly_jet2', 40625, 0, 30.8);
flyby('fly_inline3', 170477, 1, 16);
// Roket ateşlemesi: jet geçişinin başındaki hışırtı
save('rocket', levelPeak(fade(biquad(cut(load(536809), 0.0, 1.3), 'hp', 300), 0.01, 0.6), -2), { src: [536809], kbps: 80 });

// ---------------------------------------------------------------- silahlar
{
  // Tüfek çaplı makineli (Maxim, İkinci Dünya Savaşı): yakın kayıttan tek atışlar
  const mx = biquad(load(160773), 'hp', 60);
  const mgBank = onsets(mx, 0.6, 5.0, 14, 0.09).map((t) => shot(mx, t, 0.16));
  // 12,7 mm (.50 BMG tek atışlar)
  const b1 = biquad(load(668071), 'hp', 45), b2 = biquad(load(169170), 'hp', 45);
  const hmgBank = [shot(b1, 0.03, 0.22), shot(b2, 14.21, 0.22), shot(b2, 25.265, 0.22), shot(b2, 14.445, 0.22)];
  // 20 mm (Lahti L-39 tek atışlar)
  const lx = biquad(load(843412), 'hp', 40);
  const c20Bank = onsets(lx, 0.6, 7.2, 12, 0.15).slice(0, 8).map((t) => shot(lx, t, 0.3));
  // 25 mm otomatik top → 30 mm ve 37–40 mm için pes
  const ax = biquad(load(854186), 'hp', 35);
  const acBank = [0.0, 0.28, 0.555].map((t) => shot(ax, t + 0.005, 0.26));
  console.log(`atış bankaları: mg ${mgBank.length}, hmg ${hmgBank.length}, 20mm ${c20Bank.length}, 25mm ${acBank.length}`);

  const loop = (name, bank, guns, rpm, len, rms, src) => save(name, levelRms(burstLoop(bank, guns, rpm, len, guns * 7 + rpm), rms), { loop: true, src });
  loop('gun_mg4', mgBank, 4, 1150, 1.6, -13, [160773]);
  loop('gun_mg1', mgBank, 1, 1000, 1.2, -15, [160773]);
  loop('gun_hmg4', hmgBank, 4, 800, 1.6, -12, [668071, 169170]);
  loop('gun_hmg1', hmgBank, 1, 550, 1.2, -14, [668071, 169170]);
  loop('gun_c20x2', c20Bank, 2, 650, 1.6, -12, [843412]);
  loop('gun_c20x1', c20Bank, 1, 450, 1.6, -13, [843412]);
  loop('gun_c20x4', c20Bank, 4, 450, 1.6, -11, [843412]);
  loop('gun_c30x2', acBank.map((b) => resample(b, 0.82)), 2, 620, 1.6, -11, [854186]);
  // Seri sonu yankısı: tek atışın uzun kuyruğu
  save('gun_tail_mg', levelPeak(fade(cut(mx, 1.85 + 0.02, 3.2), 0.02, 0.8), -6), { src: [160773] });
  save('gun_tail_can', levelPeak(fade(cut(lx, 3.725 + 0.02, 5.2), 0.02, 0.9), -6), { src: [843412] });
  // 37–40 mm "pom": tek atış
  save('aa_pom1', levelPeak(fade(resample(cut(ax, 0.0, 0.27), 0.74), 0.002, 0.15), -1), { src: [854186] });
  save('aa_pom2', levelPeak(fade(resample(cut(ax, 0.28, 0.55), 0.7), 0.002, 0.15), -1), { src: [854186] });
  // 88 / 128 mm ağır top
  const cs = biquad(load(187767), 'hp', 30);
  save('aa_heavy1', levelPeak(soft(fade(cut(cs, 0.1, 3.6), 0.002, 1.2)), -1), { src: [187767] });
  save('aa_heavy2', levelPeak(soft(fade(cut(cs, 6.36, 9.6), 0.002, 1.2)), -1), { src: [187767] });
  const ar = biquad(load(182822), 'hp', 30);
  save('aa_heavy3', levelPeak(soft(fade(cut(ar, 7.39, 9.2), 0.002, 0.8)), -1), { src: [182822] });
}

// ---------------------------------------------------------------- patlamalar
{
  const ex = (name, id, t0, t1, o = {}) => {
    let x = biquad(cut(load(id), t0, t1), 'hp', o.hp ?? 30);
    if (o.rate) x = resample(x, o.rate);
    x = fade(x, 0.003, o.out ?? 1.0);
    save(name, levelPeak(soft(gain(x, 1.3 / (peakOf(x) || 1)), 0.95), -1), { src: [id] });
  };
  // Bomba (yakın): gerçek patlayıcı kayıtları
  ex('expl_bomb1', 182432, 1.05, 4.0);
  ex('expl_bomb2', 108641, 0.07, 4.0);
  ex('expl_bomb3', 486018, 0.4, 3.6);
  // Uzak patlamalar (yankılı gürleme)
  ex('expl_far1', 438693, 19.05, 22.5);
  ex('expl_far2', 438693, 28.8, 32.5);
  ex('expl_far3', 438693, 48.15, 50.6);
  // Havada infilak eden uçak
  ex('expl_air1', 189778, 0.03, 1.95, { out: 0.8 });
  ex('expl_air2', 189778, 1.98, 4.0, { out: 0.8 });
  // Yapı yıkılması: uzun gürleme
  ex('expl_huge', 182797, 0.45, 9.0, { out: 3.0 });
  // Havada flak mermisi (havai fişek kabuğu: sert çatlama ve yankı)
  ex('flak1', 736643, 2.75, 4.5, { hp: 50, out: 0.9 });
  ex('flak2', 718960, 0.17, 1.6, { hp: 50, out: 0.7 });
  ex('flak3', 616286, 0.05, 1.45, { hp: 50, out: 0.7 });
  // Gövdeye isabet (metal)
  ex('hit1', 410364, 0.025, 0.3, { hp: 200, out: 0.15 });
  ex('hit2', 406562, 0.0, 0.4, { hp: 200, out: 0.2 });
}

// ---------------------------------------------------------------- uyarılar
{
  const one = (name, id, t0, t1, o = {}) => {
    let x = biquad(cut(load(id), t0, t1), 'hp', o.hp ?? 60);
    if (o.rate) x = resample(x, o.rate);
    x = fade(x, o.in ?? 0.01, o.out ?? 0.4);
    save(name, o.rms !== undefined ? levelRms(x, o.rms) : levelPeak(x, -1), { src: [id], kbps: o.kbps ?? 96 });
  };
  one('siren', 382611, 0.5, 11.5, { in: 0.3, out: 2.5, rms: -16 });
  one('bell', 675682, 2.1, 5.2, { out: 0.8 });
  one('typewriter', 444813, 0.03, 1.7, { out: 0.6 });
  one('taps', 651204, 6.6, 13.6, { in: 0.05, out: 1.2 });
  one('bugle', 438633, 3.3, 8.2, { in: 0.05, out: 0.8 });
  one('morse', 343740, 13.5, 15.4, { in: 0.05, out: 0.3, hp: 150 });
  // Ju 87 B sireni: siren sesinin dalgalı bölümünden kısa döngü (perdesi hıza göre değişecek)
  const sx = biquad(cut(load(382611), 3, 11), 'hp', 120);
  const b = stableStart(sx, 0, 8, 1.6);
  save('stuka_siren', levelRms(makeLoop(sx, b.t, 1.6, 0.3), -16), { loop: true, src: [382611] });
}

// ---------------------------------------------------------------- arayüz
{
  const sw = biquad(load(423512), 'hp', 150);
  save('ui_click', levelPeak(fade(cut(sw, 3.19, 3.27), 0.001, 0.03), -6), { src: [423512] });
  save('ui_tap', levelPeak(fade(cut(sw, 1.96, 2.07), 0.001, 0.04), -4), { src: [423512] });
  const th = biquad(load(342535), 'hp', 40);
  save('ui_place', levelPeak(fade(cut(th, 0.2, 0.62), 0.002, 0.2), -3), { src: [342535] });
  save('ui_error', levelPeak(fade(mix(0.4, [[cut(sw, 2.59, 2.67), 0], [cut(sw, 2.59, 2.67), 0.12, 0.8]]), 0.001, 0.05), -6), { src: [423512] });
}

// ---------------------------------------------------------------- kaynak listesi
// Lisanslar sources.json'da (verify.mjs sayfalarından doğrular). Yalnız CC0 ve CC BY: ticari kullanıma açık.
const credits = [...used].sort((a, b) => a - b).map((id) => meta[id]);
for (const c of credits) if (!/^(CC0 1\.0|CC BY [\d.]+)$/.test(c.license)) throw new Error(`uygun olmayan lisans: ${c.title} ${c.license}`);
if (!only) {
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
  const lines = credits.map((c) => `"${c.title}" — ${c.user} — ${c.license} — ${c.url}`);
  writeFileSync(`${OUT}/CREDITS.txt`, `WarSimBox ses kayıtları (Freesound.org)\n\n${lines.join('\n')}\n`);
  const ts = credits.map((c) => `  { title: ${JSON.stringify(c.title)}, user: ${JSON.stringify(c.user)}, license: ${JSON.stringify(c.license)}, url: ${JSON.stringify(c.url)} },`).join('\n');
  writeFileSync('../../src/audio/credits.ts', `// Ses kayıtlarının künyesi (Freesound.org; lisanslar sayfalarından doğrulandı). tools/sfx/build.mjs üretir.

export interface SoundCredit {
  title: string;
  user: string;
  license: string;
  url: string;
}

export const SOUND_CREDITS: SoundCredit[] = [
${ts}
];
`);
}
console.log(`\n${Object.keys(manifest).length} ses, ${used.size} kaynak kayıt`);
