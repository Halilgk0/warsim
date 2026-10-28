// Önce/sonra geçiş klipleri (geliştirici günlüğü): aynı çekimin eski ve yeni kodla alınmış iki kaydı
// (out/once/<çekim>.mp4, out/sonra/<çekim>.mp4) kare kare örtüşür (simülasyon tohumlu). Geçiş anında eski kayıttan
// yenisine süpürme ya da daire açılımıyla geçilir; süpürmenin önünde ince parlak bir çizgi gider. Üstte "Eski görünüm"
// / "Yeni görünüm" etiketi (oyunun yazı tipi Nunito, tanıtımdaki kartlarla aynı üslup).
//
//   node gecis.mjs gfx_valley gfx_rise [--tur=daire] [--once=once --sonra=sonra] [--ad=gokyuzu]
//
// Çıktı: ../../release/sosyal/02-devblog/klipler/<çekim>[_<ad>]_gecis.mp4 (etiketli), _gecis_temiz.mp4 (etiketsiz)
// ve kontrol için _gecis.sheet.jpg. Ses yeni kayıttan, −14 LUFS.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'out');
const DEST = join(ROOT, 'release', 'sosyal', '02-devblog', 'klipler');
const W = 1080;
const H = 1920;

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const kind = opt('tur', 'tarama');
const beforeDir = opt('once', 'once');
const afterDir = opt('sonra', 'sonra');
const suffix = opt('ad', '');
const labels = [opt('eski', 'Eski görünüm'), opt('yeni', 'Yeni görünüm')];
const ids = args.filter((a) => !a.startsWith('--'));

function run(argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? resolve(err) : reject(new Error(`ffmpeg ${c}\n${err.slice(-2500)}`))));
  });
}

async function duration(file) {
  const err = await run(['-hide_banner', '-i', file, '-f', 'null', '-']).catch((e) => String(e));
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(err);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

/** Etiket görselleri (şeffaf PNG, tam kare): üstte ortalanmış hap. */
async function chips() {
  mkdirSync(join(OUT, 'gecis'), { recursive: true });
  const files = labels.map((_, i) => join(OUT, 'gecis', `etiket_${i}.png`));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    for (let i = 0; i < labels.length; i++) {
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap" rel="stylesheet">
        <style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;font-family:Nunito,sans-serif}
        .chip{position:absolute;left:50%;top:300px;transform:translateX(-50%);white-space:nowrap;font-weight:900;font-size:54px;
          padding:16px 40px 18px;border-radius:999px;box-shadow:0 12px 34px rgba(20,30,40,.25);
          ${i ? 'background:rgba(255,252,246,.95);color:#2f5d4f' : 'background:rgba(43,46,58,.82);color:#f4f1ec'}}
        .chip i{display:inline-block;width:20px;height:20px;border-radius:50%;margin-right:16px;vertical-align:4px;
          background:${i ? '#7fbf8f' : '#9a96a3'}}</style></head>
        <body><div class="chip"><i></i>${labels[i]}</div></body></html>`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: files[i], omitBackground: true });
    }
  } finally {
    await browser.close();
  }
  return files;
}

async function main() {
  mkdirSync(DEST, { recursive: true });
  const [chipOld, chipNew] = await chips();
  for (const id of ids) {
    const a = join(OUT, beforeDir, `${id}.mp4`);
    const b = join(OUT, afterDir, `${id}.mp4`);
    if (!existsSync(a) || !existsSync(b)) throw new Error(`${id}: kayıt yok (${a} / ${b})`);
    const D = Math.min(await duration(a), await duration(b));
    // Geçiş: ilk üçte birde eski görünüm, sonra 1,2–1,5 sn süren geçiş
    const off = +(D * 0.34).toFixed(3);
    const dur = +Math.min(1.5, D * 0.28).toFixed(3);
    const xf = kind === 'daire' ? 'circleopen' : 'wiperight';
    const base = join(DEST, `${id}${suffix ? `_${suffix}` : ''}_gecis`);
    // İkinci kayıt geçiş anından başlar (xfade ikinci girişi baştan alır: hareket örtüşsün)
    const vid = `[0:v]trim=0:${D},setpts=PTS-STARTPTS,format=yuv420p[a];` +
      `[1:v]trim=start=${off}:end=${D},setpts=PTS-STARTPTS,format=yuv420p[b];` +
      `[a][b]xfade=transition=${xf}:duration=${dur}:offset=${off}[m]`;
    const line = kind === 'daire' ? '[m]null[l]' :
      // Süpürme çizgisi: geniş yumuşak parıltı + ince çizgi, geçişle aynı hızda
      `color=c=white@0.22:s=34x${H}:r=60,format=rgba[g];color=c=white@0.95:s=6x${H}:r=60,format=rgba[c];` +
      `[m][g]overlay=x='W*clip((t-${off})/${dur},0,1)-17':y=0:eval=frame:enable='between(t,${off},${off + dur})':shortest=1[m1];` +
      `[m1][c]overlay=x='W*clip((t-${off})/${dur},0,1)-3':y=0:eval=frame:enable='between(t,${off},${off + dur})':shortest=1[l]`;
    const fadeOut = (off + dur * 0.35).toFixed(3);
    const fadeIn = (off + dur * 0.6).toFixed(3);
    const tagged = `${line.replace('[l]', '[l0]')};` +
      `[2:v]format=rgba,fade=t=out:st=${fadeOut}:d=0.25:alpha=1[e];` +
      `[3:v]format=rgba,fade=t=in:st=${fadeIn}:d=0.3:alpha=1[y];` +
      `[l0][e]overlay=0:0:shortest=1[l1];[l1][y]overlay=0:0:shortest=1[l]`;
    const audio = `[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[au]`;
    const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '60', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', String(D)];
    await run(['-y', '-i', a, '-i', b, '-filter_complex', `${vid};${line};${audio}`, '-map', '[l]', '-map', '[au]', ...enc, `${base}_temiz.mp4`]);
    await run(['-y', '-i', a, '-i', b, '-loop', '1', '-t', String(D), '-i', chipOld, '-loop', '1', '-t', String(D), '-i', chipNew,
      '-filter_complex', `${vid};${tagged};${audio}`, '-map', '[l]', '-map', '[au]', ...enc, `${base}.mp4`]);
    await run(['-y', '-i', `${base}.mp4`, '-vf', `fps=${(12 / D).toFixed(4)},scale=270:-1,tile=6x2:padding=4`, '-frames:v', '1', `${base}.sheet.jpg`]);
    console.log(`${id}: ${D.toFixed(2)} sn, geçiş ${off}–${(off + dur).toFixed(2)} sn (${xf}) → ${base}.mp4`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
