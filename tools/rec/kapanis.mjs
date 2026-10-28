// Videonun kapanış kartı: logo ve ad, "Geri bildirim gönder" (yatay telefonda ana menü, düğmeye yakınlaşma ve
// dokunuş), altta "Takip et" ve sosyal medya hesapları. 5,5 sn, 1080×1920, 60 kare/sn, dokunuş sesli.
//   node kapanis.mjs   → ../../release/sosyal/06-gelistirici-gunlugu/yeni/5_kapanis_karti.mp4 (+ son kare .png)
//
// Ana menü ekranı geliştirme sunucusundan, geçici tarayıcı profiliyle telefon yatay boyutunda (844×390, DPR 3)
// alınır. Arka plan akşam B-17 çekiminin bulanık bir karesi (out/aksam/aksam_b17_iz.mp4). Sosyal medya simgeleri ve
// hesap adları oyundaki src/ui/social.ts'ten okunur.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'out');
const TMP = join(OUT, 'edit');
const DEST = join(ROOT, 'release', 'sosyal', '06-gelistirici-gunlugu', 'yeni');
const PORT = 5296;
const FPS = 60;
const W = 1080;
const H = 1920;
const DUR = 5.5;
/** Dokunuş anı (sn). */
const TAP = 1.6;
/** Telefon ekranı (ekran görüntüsü 844×390 × 3). */
const SHOT_W = 2532;
const SHOT_H = 1170;

const LOGO = readFileSync(join(ROOT, 'brand', 'logo-ikon.svg'), 'utf8');
// Hesaplar: oyundaki bağlantılarla aynı (ad, adres, simge yolu)
const SOCIAL = [...readFileSync(join(ROOT, 'src', 'ui', 'social.ts'), 'utf8')
  .matchAll(/name: '([^']+)',\s*url: '([^']+)',\s*path: '([^']+)'/g)]
  .map(([, name, url, path]) => ({ name, path, handle: `@${url.replace(/\/$/, '').split('/').pop().replace(/^@/, '')}` }));
if (SOCIAL.length !== 3) throw new Error(`social.ts okunamadı (${SOCIAL.length} hesap)`);

function run(argv, label) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${label}: ffmpeg ${c}\n${err.slice(-2000)}`))));
  });
}

async function startVite() {
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => vite.stdout.on('data', (d) => String(d).includes('Local') && resolve()));
  return vite;
}

/** Ana menünün telefon ekranı ve "Geri bildirim" düğmesinin yeri (ekran görüntüsü pikselinde). */
async function menuShot(browser) {
  const vite = await startVite();
  try {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('__set')) return;
      localStorage.setItem('warsim.lang', 'tr');
      sessionStorage.setItem('__set', '1');
    });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => window.game && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const b = document.querySelector('#mainmenu .mm-fb-btn').getBoundingClientRect();
      return [b.left, b.top, b.width, b.height];
    });
    await page.screenshot({ path: join(TMP, 'kapanis_menu.png') });
    await ctx.close();
    return r.map((v) => v * 3);
  } finally {
    vite.kill();
  }
}

function pageHtml(bg, menu, btn) {
  const SW = 900;
  const SH = Math.round((SW * SHOT_H) / SHOT_W);
  const k = SW / SHOT_W;
  const [bx, by, bw, bh] = btn.map((v) => v * k);
  const chips = SOCIAL.map((s) => `<div class="chip"><span class="ic"><svg viewBox="0 0 24 24"><path d="${s.path}"/></svg></span><span>${s.handle}</span></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:${W}px;height:${H}px;overflow:hidden;font-family:Nunito,sans-serif;background:#2a2c38}
    .bg{position:absolute;inset:-90px;background:url(${bg}) center/cover;filter:blur(24px) brightness(.82) saturate(1.05)}
    .scrim{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%,rgba(25,28,40,.30),rgba(25,28,40,.55))}
    .mark{position:absolute;left:0;right:0;top:170px;display:flex;align-items:center;justify-content:center;gap:24px;color:#fff;
      text-shadow:0 6px 30px rgba(20,30,40,.45)}
    .mark svg{width:118px;height:118px;filter:drop-shadow(0 6px 18px rgba(20,30,40,.35))}
    .mark b{font-weight:900;font-size:122px;letter-spacing:-2px}
    .card{position:absolute;left:50%;top:380px;transform:translateX(-50%);text-align:center;background:rgba(255,252,246,.95);
      color:#3b3947;border-radius:34px;padding:24px 48px 26px;box-shadow:0 14px 40px rgba(20,20,30,.28);white-space:nowrap}
    .card h1{font-weight:900;font-size:76px;line-height:1.02;letter-spacing:-1px}
    .card p{font-weight:800;font-size:40px;color:#5e9483;margin-top:10px}
    .phone{position:absolute;left:50%;top:${640}px;width:${SW + 40}px;height:${SH + 40}px;margin-left:-${(SW + 40) / 2}px;
      background:#16191c;border-radius:60px;padding:20px;box-shadow:0 30px 70px rgba(10,15,25,.5),inset 0 0 0 3px #2a2f34}
    .screen{position:relative;width:${SW}px;height:${SH}px;border-radius:42px;overflow:hidden;background:#000}
    .zoom{position:absolute;inset:0;transform-origin:${bx + bw / 2}px 0}
    .zoom img{position:absolute;inset:0;width:${SW}px;height:${SH}px}
    .hl{position:absolute;left:${bx - 4}px;top:${by - 4}px;width:${bw + 8}px;height:${bh + 8}px;border-radius:${bh}px;
      border:3px solid #ffd27a}
    .tap{position:absolute;left:${bx + bw / 2}px;top:${by + bh / 2}px;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
      border:3px solid #fff;background:rgba(255,255,255,.35)}
    .cam{position:absolute;left:7px;top:50%;width:10px;height:10px;margin-top:-5px;border-radius:50%;background:#0b0d0f}
    .follow{position:absolute;left:0;right:0;top:1150px;text-align:center;color:#fff}
    .follow h2{font-weight:900;font-size:64px;text-shadow:0 4px 20px rgba(20,30,40,.5)}
    .chips{display:flex;justify-content:center;gap:22px;margin-top:22px}
    .chip{display:flex;flex-direction:column;align-items:center;gap:10px;width:290px;font-weight:900;font-size:38px;
      text-shadow:0 3px 14px rgba(20,30,40,.55)}
    .ic{display:flex;align-items:center;justify-content:center;width:118px;height:118px;border-radius:50%;background:#fffcf6;
      box-shadow:0 12px 30px rgba(20,20,30,.3)}
    .ic svg{width:58px;height:58px;fill:#3b3947}
  </style></head><body>
    <div class="bg" id="bg"></div><div class="scrim"></div>
    <div class="mark" id="mark">${LOGO}<b>WarSimBox</b></div>
    <div class="card" id="card"><h1>Geri bildirim gönder</h1><p>Her mesajı okuyoruz · Ana menüde</p></div>
    <div class="phone" id="phone"><div class="screen"><div class="zoom" id="zoom"><img src="${menu}">
      <div class="hl" id="hl"></div><div class="tap" id="tap"></div></div></div><div class="cam"></div></div>
    <div class="follow" id="follow"><h2>Bizi takip et</h2><div class="chips">${chips}</div></div>
    <script>
      const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      const clamp = (x) => Math.max(0, Math.min(1, x));
      const inn = (t, a, d) => ease(clamp((t - a) / d));
      const show = (id, k, dy) => {
        const e = document.getElementById(id);
        e.style.opacity = k;
        e.style.translate = '0 ' + ((1 - k) * dy) + 'px';
      };
      window.render = (t) => {
        show('mark', inn(t, 0, 0.45), 30);
        show('card', inn(t, 0.25, 0.4), 30);
        show('phone', inn(t, 0.35, 0.5), 60);
        show('follow', inn(t, 2.5, 0.45), 40);
        // Ekranın içinde "Geri bildirim" düğmesine yakınlaşma (çerçeve yerinde). Düğme üst çubukta: yakınlaşmanın
        // dikey merkezi ekranın üst kenarı, düğme kesilmesin
        document.getElementById('zoom').style.transform = 'scale(' + (1 + 1.2 * inn(t, 0.95, 0.6)) + ')';
        // Dokunuş halkası büyüyüp söner; düğmenin çevresinde sarı çerçeve yanıp söner
        const k = (t - ${TAP}) / 0.55;
        const tap = document.getElementById('tap');
        tap.style.display = k >= 0 && k <= 1 ? 'block' : 'none';
        tap.style.transform = 'scale(' + (0.6 + 0.9 * clamp(k)) + ')';
        tap.style.opacity = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        const hl = document.getElementById('hl');
        hl.style.opacity = t < ${TAP} ? 0 : 0.55 + 0.45 * Math.cos((t - ${TAP}) * 5.2);
        document.getElementById('bg').style.transform = 'scale(1.1) translateY(' + (-10 * t) + 'px)';
      };
    </script></body></html>`;
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(DEST, { recursive: true });
  await run(['-y', '-loglevel', 'error', '-ss', '6', '-i', join(OUT, 'aksam', 'aksam_b17_iz.mp4'), '-frames:v', '1', join(TMP, 'kapanis_bg.png')], 'arka plan');
  const video = join(TMP, 'kapanis.video.mp4');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const btn = await menuShot(browser);
    console.log('geri bildirim düğmesi (px):', btn.map(Math.round).join(', '));
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const url = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    await page.setContent(pageHtml(url(join(TMP, 'kapanis_bg.png')), url(join(TMP, 'kapanis_menu.png')), btn), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const enc = spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', video], { stdio: ['pipe', 'ignore', 'inherit'] });
    const done = new Promise((r, j) => enc.on('close', (c) => (c === 0 ? r() : j(new Error('kapanış ffmpeg')))));
    const n = Math.round(DUR * FPS);
    for (let f = 0; f < n; f++) {
      await page.evaluate((t) => window.render(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
      if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    }
    enc.stdin.end();
    await done;
    await page.evaluate((t) => window.render(t), DUR);
    await page.screenshot({ path: join(DEST, '5_kapanis_karti.png') });
    console.log(`${n} kare`);
  } finally {
    await browser.close();
  }
  // Ses: dokunuş anında arayüz sesi, gerisi sessiz (kurguda müzik altına girer)
  const out = join(DEST, '5_kapanis_karti.mp4');
  await run(['-y', '-loglevel', 'error', '-i', video, '-f', 'lavfi', '-t', String(DUR), '-i', 'anullsrc=r=48000:cl=stereo',
    '-i', join(ROOT, 'public', 'sounds', 'ui_tap.mp3'),
    '-filter_complex', `[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.9,adelay=${Math.round(TAP * 1000)}:all=1[s];[1:a][s]amix=inputs=2:normalize=0:duration=first[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(DUR), out], 'ses');
  console.log(`video: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
