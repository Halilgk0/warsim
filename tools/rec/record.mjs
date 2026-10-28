// Oyunun kayıt kipinden (?rec) çekimleri videoya alır: Vite geliştirme sunucusunu açar, Chrome'u ekran kartıyla
// başsız çalıştırır, sayfa kareleri JPEG olarak gönderir, ffmpeg H.264'e çevirir; ses ayrı WAV.
//
//   node record.mjs stuka_dive [başka_çekim …]   tam kalite (1080×1920)
//   node record.mjs --preview stuka_dive          hızlı deneme (540×960) ve kontrol için kare tablosu
//   node record.mjs --list                        çekimler
//
// Çıktı: out/<çekim>.mp4 (görüntü + ses), out/<çekim>.wav, denemede out/<çekim>.sheet.jpg

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PORT = 5293;

const args = process.argv.slice(2);
// --dir=once: çıktı out/once/ altına (aynı çekimin önce/sonra kayıtları birbirini ezmesin)
const dirArg = args.find((a) => a.startsWith('--dir='));
const OUT = dirArg ? join(HERE, 'out', dirArg.slice(6)) : join(HERE, 'out');
const preview = args.includes('--preview');
const list = args.includes('--list');
const scaleArg = args.find((a) => a.startsWith('--scale='));
const scale = preview ? 0.5 : Number(scaleArg?.slice(8) ?? 1);
const ids = args.filter((a) => !a.startsWith('--'));

function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'], ...opts });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${code}\n${err.slice(-2000)}`))));
  });
}

async function startVite() {
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Vite açılmadı')), 30000);
    const on = (d) => {
      if (String(d).includes('Local')) {
        clearTimeout(t);
        resolve();
      }
    };
    vite.stdout.on('data', on);
    vite.stderr.on('data', (d) => process.stderr.write(d));
    vite.on('close', (c) => reject(new Error(`Vite kapandı (${c})`)));
  });
  return vite;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const vite = await startVite();
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') console.log(`[sayfa ${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => console.log(`[sayfa hata] ${e.message}`));

    let enc = null;
    let frames = 0;
    let audio = [];
    await page.exposeFunction('__frame', async (b64) => {
      frames++;
      if (!enc.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => enc.stdin.once('drain', r));
    });
    await page.exposeFunction('__audio', (b64, last) => {
      audio.push(Buffer.from(b64, 'base64'));
      return last;
    });

    await page.goto(`http://localhost:${PORT}/?rec`);
    await page.waitForFunction(() => window.__rec, null, { timeout: 120000 });
    const info = await page.evaluate(() => ({ gpu: window.__rec.gpu, size: window.__rec.size, takes: window.__rec.takes() }));
    console.log(`ekran kartı: ${info.gpu} · tuval ${info.size.join('×')}`);
    if (list || !ids.length) {
      for (const t of info.takes) console.log(`  ${t.id} (${t.duration} sn)`);
      return;
    }

    for (const id of ids) {
      const base = join(OUT, id);
      const video = `${base}.video.mp4`;
      frames = 0;
      audio = [];
      enc = spawn(ffmpegPath, [
        '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '23' : '14', '-pix_fmt', 'yuv420p', video,
      ], { stdio: ['pipe', 'ignore', 'inherit'] });
      const encDone = new Promise((resolve, reject) => enc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))));
      const t0 = Date.now();
      const res = await page.evaluate(({ id, q }) => window.__rec.record(id, { quality: q }), { id, q: preview ? 0.85 : 0.94 });
      enc.stdin.end();
      await encDone;
      writeFileSync(`${base}.wav`, Buffer.concat(audio));
      await run(ffmpegPath, ['-y', '-i', video, '-i', `${base}.wav`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', `${base}.mp4`]);
      const sec = (Date.now() - t0) / 1000;
      console.log(`${id}: ${frames} kare, oyun anı ${res.t0.toFixed(1)} sn, özne ${JSON.stringify(res.subject.ids)} · ${sec.toFixed(0)} sn sürdü`);
      if (preview) {
        const n = 18;
        const fps = n / (frames / 60);
        await run(ffmpegPath, ['-y', '-i', video, '-vf', `fps=${fps.toFixed(4)},scale=240:-1,tile=6x3:padding=4`, '-frames:v', '1', `${base}.sheet.jpg`]);
        await run(ffmpegPath, ['-y', '-i', `${base}.wav`, '-filter_complex', 'showwavespic=s=1200x240:split_channels=0', '-frames:v', '1', `${base}.wave.png`]);
      }
    }
  } finally {
    await browser.close();
    vite.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
