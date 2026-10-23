// Tanıtım videosunun kurgusu: kayıt kipindeki çekimler (out/<çekim>.mp4 + .wav), arayüz ekranları (out/ui), yazı
// kartları ve bitiş kartı tek videoda birleşir.
//   node edit.mjs     → ../../release/sosyal/01-tanitim/tanitim.mp4 (1080×1920, 60 kare/sn, −14 LUFS) ve kapak.jpg
//
// Yazı kartları ve telefon çerçeveli arayüz bölümü tarayıcıda (HTML/CSS, oyunun yazı tipi Nunito) çizilir: kartlar
// şeffaf PNG, arayüz bölümü kare kare görüntü. Sonra ffmpeg kurgu listesine göre keser, ekler, kartları kaydırarak
// bindirir, sesi −14 LUFS'e getirir.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'out');
const TMP = join(OUT, 'edit');
const DEST = join(ROOT, 'release', 'sosyal', '01-tanitim');
const SOUNDS = join(ROOT, 'public', 'sounds');
const FPS = 60;
const W = 1080;
const H = 1920;

// Kurgu listesi: [çekim, kaynakta başlangıç (sn), süre (sn)]. '@ui' arayüz bölümü, '@end' bitiş kartı.
const CUTS = [
  ['stuka_dive', 1.2, 2.4],
  ['stuka_impact', 0.8, 0.6],
  ['title_b17', 0.5, 2.5],
  ['pass_spitfire', 1.05, 0.75],
  ['pass_bf109', 1.05, 0.75],
  ['pass_p51', 1.05, 0.75],
  ['pass_me262', 1.05, 0.75],
  ['dogfight', 0.3, 3.5],
  ['b17_turrets', 2.0, 1.5],
  ['b17_bombs', 2.4, 1.5],
  ['aa_ground', 1.8, 2.0],
  ['@ui', 0, 4.5],
  ['b17_kill', 1.0, 1.5],
  ['factory_boom', 1.6, 4.0],
  ['@end', 0, 3.0],
];

// Yazı kartları: [başlangıç, bitiş, tür, metin, alt satır]
const CAPTIONS = [
  [0.15, 2.4, 'hook', 'Bu sesi tanıdın mı?', 'Sesi aç'],
  [3.25, 5.5, 'logo', 'WarSimBox', 'Tarayıcıda hava savaşı stratejisi'],
  [5.55, 8.5, 'card', '51 gerçek uçak', '1937–1952'],
  [5.5, 6.25, 'tag', 'Spitfire Mk IX'],
  [6.25, 7.0, 'tag', 'Bf 109 G-6'],
  [7.0, 7.75, 'tag', 'P-51D Mustang'],
  [7.75, 8.5, 'tag', 'Me 262'],
  [8.65, 12.0, 'card', 'Gerçek uçuş fiziği', 'Her uçak gerçek verileriyle uçar'],
  [12.1, 15.0, 'card', 'Bombardıman akınları', 'Savunma taretleri ve halı bombardımanı'],
  [15.1, 17.0, 'card', 'Uçaksavar', '12,7 mm’den 128 mm flak’a'],
  [21.6, 24.0, 'card', 'Rakiplerini yen', '1–5 rakip ülke, herkes herkese'],
  [24.6, 27.0, 'card', 'Haritada son kalan kazanır', '300 × 300 km harita'],
  [27.0, 30.0, 'end'],
];

// Arayüz bölümü: üç ekran, her biri 1,5 sn; dokunuş noktası ekran görüntüsünün pikselinde (2532×1170)
const UI = [
  { img: '1-planlayici.png', caption: 'Görevi planla', tap: [521, 1077], tapAt: 0.95, sound: 'ui_tap' },
  { img: '2-arastirma.png', caption: 'Yeni uçak araştır', tap: [994, 842], tapAt: 2.4, sound: 'ui_click', after: ['typewriter', 2.55] },
  { img: '3-insa.png', caption: 'Üssünü kur', tap: [1366, 1099], tapAt: 3.9, sound: 'ui_place' },
];

const LOGO = readFileSync(join(ROOT, 'brand', 'logo-ikon.svg'), 'utf8');
const SPEAKER = '<svg viewBox="0 0 24 24" width="44" height="44"><path d="M3 9v6h4l5 4V5L7 9z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

const FONT = '<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap" rel="stylesheet">';
const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden;font-family:Nunito,sans-serif}
  .card{position:absolute;left:50%;transform:translateX(-50%);top:330px;text-align:center;background:rgba(255,252,246,.94);
    color:#3b3947;border-radius:34px;padding:26px 48px 28px;box-shadow:0 14px 40px rgba(30,30,40,.22);white-space:nowrap}
  .card h1{font-weight:900;font-size:80px;line-height:1.02;letter-spacing:-1px}
  .card p{font-weight:700;font-size:40px;color:#6b6878;margin-top:10px}
  .tag{position:absolute;left:50%;transform:translateX(-50%);top:1230px;background:rgba(43,46,58,.86);color:#fff;
    font-weight:800;font-size:50px;padding:14px 34px;border-radius:999px;white-space:nowrap}
  .hook .row{display:flex;align-items:center;justify-content:center;gap:14px;color:#5e9483}
  .hook .row span{font-weight:800;font-size:38px}
  .scrim-top{position:absolute;left:0;right:0;top:0;height:760px;background:linear-gradient(rgba(25,32,42,.42),rgba(25,32,42,0))}
  .scrim{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,rgba(25,32,42,.5),rgba(25,32,42,.28))}
  .logo{position:absolute;left:0;right:0;top:300px;text-align:center;color:#fff;text-shadow:0 6px 30px rgba(20,30,40,.35)}
  .logo .mark{display:inline-flex;align-items:center;gap:24px}
  .logo svg{width:120px;height:120px;filter:drop-shadow(0 6px 18px rgba(20,30,40,.3))}
  .logo b{font-weight:900;font-size:128px;letter-spacing:-2px}
  .logo p{font-weight:800;font-size:44px;margin-top:6px}
  .end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;color:#fff;
    padding-bottom:260px}
  .end .mark{display:inline-flex;align-items:center;gap:26px;text-shadow:0 6px 30px rgba(20,30,40,.45)}
  .end svg{width:150px;height:150px;filter:drop-shadow(0 6px 18px rgba(20,30,40,.35))}
  .end b{font-weight:900;font-size:140px;letter-spacing:-2px}
  .end .line{font-weight:800;font-size:46px;text-shadow:0 4px 18px rgba(20,30,40,.5)}
  .end .url{background:#fffcf6;color:#3b3947;font-weight:900;font-size:62px;padding:20px 46px;border-radius:999px;
    box-shadow:0 14px 40px rgba(20,30,40,.3)}
  .end small{font-weight:800;font-size:38px;opacity:.95;text-shadow:0 4px 18px rgba(20,30,40,.5)}
`;

function captionHtml([, , kind, text, sub]) {
  let body = '';
  if (kind === 'card') body = `<div class="card"><h1>${text}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;
  else if (kind === 'hook') body = `<div class="card hook"><h1>${text}</h1><div class="row" style="margin-top:12px">${SPEAKER}<span>${sub}</span></div></div>`;
  else if (kind === 'tag') body = `<div class="tag">${text}</div>`;
  else if (kind === 'logo') body = `<div class="scrim-top"></div><div class="logo"><div class="mark">${LOGO}<b>${text}</b></div><p>${sub}</p></div>`;
  else if (kind === 'end') {
    body = `<div class="scrim"></div><div class="end"><div class="mark">${LOGO}<b>WarSimBox</b></div>
      <div class="line">Ücretsiz · İndirme yok · Telefonda oyna</div>
      <div class="url">warsimbox.vercel.app</div><small>Bağlantı profilde</small></div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE_CSS}</style></head><body>${body}</body></html>`;
}

/** Arayüz bölümünün sayfası: bulanık oyun arka planı, yatay telefon, kayan ekranlar, dokunuş halkası, başlık. */
function uiHtml(bg, shots) {
  const SW = 960;
  const SH = Math.round((SW * 1170) / 2532);
  const imgs = shots.map((s, i) => `<img class="scr" id="s${i}" src="${s}">`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE_CSS}
    html,body{background:#cfe0d6}
    .bg{position:absolute;inset:-80px;background:url(${bg}) center/cover;filter:blur(26px) brightness(.9) saturate(.9)}
    .veil{position:absolute;inset:0;background:linear-gradient(rgba(255,255,255,.10),rgba(40,50,60,.18))}
    .phone{position:absolute;left:50%;top:960px;width:${SW + 40}px;height:${SH + 40}px;margin-left:-${(SW + 40) / 2}px;margin-top:-${(SH + 40) / 2}px;
      background:#16191c;border-radius:62px;padding:20px;box-shadow:0 30px 70px rgba(20,30,40,.45),inset 0 0 0 3px #2a2f34}
    .screen{position:relative;width:${SW}px;height:${SH}px;border-radius:44px;overflow:hidden;background:#000}
    .scr{position:absolute;top:0;left:0;width:${SW}px;height:${SH}px}
    .cam{position:absolute;left:7px;top:50%;width:10px;height:10px;margin-top:-5px;border-radius:50%;background:#0b0d0f}
    .tap{position:absolute;width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:50%;border:5px solid #fff;
      background:rgba(255,255,255,.35);box-shadow:0 0 0 3px rgba(40,50,60,.25)}
    .card{transition:none}
  </style></head><body>
    <div class="bg" id="bg"></div><div class="veil"></div>
    <div class="card" id="cap"><h1 id="capt"></h1></div>
    <div class="phone" id="phone"><div class="screen">${imgs}<div class="tap" id="tap"></div></div><div class="cam"></div></div>
    <script>
      const UI = ${JSON.stringify(UI.map((u) => ({ caption: u.caption, tap: u.tap, tapAt: u.tapAt })))};
      const SW = ${SW}, SH = ${SH};
      const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      const clamp = (x) => Math.max(0, Math.min(1, x));
      window.render = (t) => {
        // Ekranlar 1,5 sn'de bir sola kayar (0,25 sn)
        const pos = UI.reduce((p, _, i) => i === 0 ? 0 : p + ease(clamp((t - (1.5 * i - 0.12)) / 0.25)), 0);
        UI.forEach((_, i) => { document.getElementById('s' + i).style.transform = 'translateX(' + ((i - pos) * SW) + 'px)'; });
        const cur = Math.min(UI.length - 1, Math.round(pos));
        document.getElementById('capt').textContent = UI[cur].caption;
        const fade = Math.min(1, Math.abs(pos - Math.round(pos)) * 4);
        document.getElementById('cap').style.opacity = 1 - fade;
        // Dokunuş: halka büyüyüp söner
        const u = UI[cur];
        const k = (t - u.tapAt) / 0.5;
        const tap = document.getElementById('tap');
        if (k >= 0 && k <= 1 && Math.abs(pos - cur) < 0.01) {
          tap.style.display = 'block';
          tap.style.left = (u.tap[0] * SW / 2532) + 'px';
          tap.style.top = (u.tap[1] * SH / 1170) + 'px';
          tap.style.transform = 'scale(' + (0.6 + 0.8 * k) + ')';
          tap.style.opacity = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        } else tap.style.display = 'none';
        // Her ekranda dokunulacak noktaya yakınlaşma (yazılar okunsun), kaymadan önce geri açılır
        const start = 1.5 * cur;
        const zin = ease(clamp((t - start - 0.12) / 0.55));
        const zout = cur < UI.length - 1 ? ease(clamp((t - (start + 1.5 - 0.42)) / 0.3)) : 0;
        const z = 1 + 0.42 * zin * (1 - zout);
        const phone = document.getElementById('phone');
        phone.style.transformOrigin = (20 + u.tap[0] * SW / 2532) + 'px ' + (20 + u.tap[1] * SH / 1170) + 'px';
        phone.style.transform = 'scale(' + z + ')';
        document.getElementById('bg').style.transform = 'scale(1.12) translateY(' + (-14 * t) + 'px)';
      };
    </script></body></html>`;
}

function run(argv, label) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? resolve(err) : reject(new Error(`${label}: ffmpeg ${c}\n${err.slice(-3000)}`))));
  });
}

const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

async function renderGraphics() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    // Yazı kartları (şeffaf)
    for (let i = 0; i < CAPTIONS.length; i++) {
      await page.setContent(captionHtml(CAPTIONS[i]), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(TMP, `cap${i}.png`), omitBackground: true });
    }
    console.log(`${CAPTIONS.length} yazı kartı`);
    // Arayüz bölümü: kare kare
    await run(['-y', '-loglevel', 'error', '-ss', '2.0', '-i', join(OUT, 'title_b17.mp4'), '-frames:v', '1', join(TMP, 'ui_bg.png')], 'arka plan');
    await page.setContent(uiHtml(dataUrl(join(TMP, 'ui_bg.png')), UI.map((u) => dataUrl(join(OUT, 'ui', u.img)))), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const dur = CUTS.find((c) => c[0] === '@ui')[2];
    const n = Math.round(dur * FPS);
    const enc = spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', join(TMP, 'ui.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] });
    const done = new Promise((r, j) => enc.on('close', (c) => (c === 0 ? r() : j(new Error('ui ffmpeg')))));
    for (let f = 0; f < n; f++) {
      await page.evaluate((t) => window.render(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    }
    enc.stdin.end();
    await done;
    console.log(`arayüz bölümü: ${n} kare`);
  } finally {
    await browser.close();
  }
}

/** Arayüz bölümünün sesi: başlık çekiminin uzak motor uğultusu kısık, üstünde dokunuş sesleri. */
async function uiAudio() {
  const dur = CUTS.find((c) => c[0] === '@ui')[2];
  const ins = ['-i', join(OUT, 'title_b17.wav')];
  const parts = ['[0:a]atrim=0:' + dur + ',asetpts=PTS-STARTPTS,volume=0.28[amb]'];
  const mix = ['[amb]'];
  let k = 1;
  for (const u of UI) {
    const events = [[u.sound, u.tapAt], ...(u.after ? [u.after] : [])];
    for (const [snd, at] of events) {
      ins.push('-i', join(SOUNDS, `${snd}.mp3`));
      parts.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${snd === 'typewriter' ? 0.55 : 0.9},adelay=${Math.round(at * 1000)}:all=1[s${k}]`);
      mix.push(`[s${k}]`);
      k++;
    }
  }
  parts.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first[out]`);
  await run(['-y', '-loglevel', 'error', ...ins, '-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_f32le', join(TMP, 'ui.wav')], 'arayüz sesi');
}

async function assemble() {
  const ins = [];
  const f = [];
  const seg = [];
  let input = 0;
  let t = 0;
  for (const [id, from, dur] of CUTS) {
    let v;
    let a;
    if (id === '@ui') {
      ins.push('-i', join(TMP, 'ui.mp4'), '-i', join(TMP, 'ui.wav'));
      v = `${input}:v`;
      a = `${input + 1}:a`;
    } else if (id === '@end') {
      // Bitiş kartının altında Spitfire geçişi: hafif bulanık; son kare tutulur, ses söner
      const src = 'pass_spitfire';
      ins.push('-ss', '0.25', '-t', String(dur - 0.25), '-i', join(OUT, `${src}.mp4`), '-ss', '0.25', '-t', String(dur - 0.25), '-i', join(OUT, `${src}.wav`));
      f.push(`[${input}:v]setpts=PTS-STARTPTS,gblur=sigma=9,eq=brightness=-0.04:saturation=0.92,tpad=stop_mode=clone:stop_duration=0.25[ev]`);
      f.push(`[${input + 1}:a]asetpts=PTS-STARTPTS,apad=pad_dur=0.25,afade=t=out:st=${dur - 0.9}:d=0.9[ea]`);
      v = 'ev';
      a = 'ea';
    } else {
      ins.push('-ss', String(from), '-t', String(dur), '-i', join(OUT, `${id}.mp4`), '-ss', String(from), '-t', String(dur), '-i', join(OUT, `${id}.wav`));
      v = `${input}:v`;
      a = `${input + 1}:a`;
    }
    const i = seg.length;
    f.push(`[${v}]setpts=PTS-STARTPTS,fps=${FPS},scale=${W}:${H},setsar=1,format=yuv420p,trim=duration=${dur}[v${i}]`);
    f.push(`[${a}]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=${dur},apad=whole_dur=${dur},afade=t=in:d=0.012,afade=t=out:st=${(dur - 0.015).toFixed(3)}:d=0.015[a${i}]`);
    seg.push(i);
    input += 2;
    t += dur;
  }
  f.push(`${seg.map((i) => `[v${i}][a${i}]`).join('')}concat=n=${seg.length}:v=1:a=1[vc][ac]`);
  // Yazı kartları: kayarak belirir, söner
  let base = 'vc';
  CAPTIONS.forEach(([start, end], i) => {
    const d = end - start;
    ins.push('-loop', '1', '-framerate', String(FPS), '-t', String(d), '-i', join(TMP, `cap${i}.png`));
    const fin = 0.2;
    const fout = i === CAPTIONS.length - 1 ? 0 : 0.18;
    f.push(`[${input}:v]format=rgba,fade=t=in:st=0:d=${fin}:alpha=1${fout ? `,fade=t=out:st=${(d - fout).toFixed(3)}:d=${fout}:alpha=1` : ''},setpts=PTS-STARTPTS+${start}/TB[c${i}]`);
    f.push(`[${base}][c${i}]overlay=x=0:y='26*max(0,1-(t-${start})/0.28)':eof_action=pass[o${i}]`);
    base = `o${i}`;
    input++;
  });
  f.push(`[${base}]format=yuv420p[vout]`);
  f.push('[ac]loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]');
  mkdirSync(DEST, { recursive: true });
  const out = join(DEST, 'tanitim.mp4');
  await run(['-y', '-loglevel', 'error', ...ins, '-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', String(t), out], 'kurgu');
  // Kapak: başlık anı (logo görünürken)
  await run(['-y', '-loglevel', 'error', '-ss', '4.7', '-i', out, '-frames:v', '1', '-q:v', '2', join(DEST, 'kapak.jpg')], 'kapak');
  console.log(`video: ${out} (${t.toFixed(2)} sn)`);
}

mkdirSync(TMP, { recursive: true });
const only = process.argv[2];
if (!only || only === 'graphics') {
  await renderGraphics();
  await uiAudio();
}
if (!only || only === 'assemble') await assemble();
writeFileSync(join(TMP, 'cuts.json'), JSON.stringify({ CUTS, CAPTIONS }, null, 1));
