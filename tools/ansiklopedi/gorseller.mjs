// Ansiklopedi görsellerini oyunun modellerinden üretir: public/ansiklopedi/gorsel/<uçak>-34.webp, -yan.webp, -og.jpg.
// Geçici tarayıcı profiliyle (kullanıcının Chrome profiline dokunmaz) vite geliştirme sunucusunda çizer.
//   node tools/ansiklopedi/gorseller.mjs            liste.ts'teki bütün uçaklar
//   node tools/ansiklopedi/gorseller.mjs spitfire1  yalnız bunlar
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(ROOT, 'tools/rec/package.json'));
const { chromium } = require('playwright-core');
const OUT = join(ROOT, 'public/ansiklopedi/gorsel');
const PORT = 5340;
mkdirSync(OUT, { recursive: true });

const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => vite.stdout.on('data', (d) => String(d).includes('Local') && r()));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('HATA', e.message));
  // Boş bir sayfa yeter (oyun yüklenmez): modül vite üzerinden gelir
  await p.goto(`http://localhost:${PORT}/ansiklopedi/`);
  const ids = process.argv.slice(2).length
    ? process.argv.slice(2)
    : await p.evaluate(async () => Object.keys((await import('/src/ansiklopedi/liste.ts')).ENCYCLOPEDIA));
  for (const id of ids) {
    for (const view of ['34', 'yan', 'og']) {
      const url = await p.evaluate(async ([i, v]) => (await import('/tools/ansiklopedi/cekim.ts')).shot(i, v), [id, view]);
      const ext = view === 'og' ? 'jpg' : 'webp';
      writeFileSync(join(OUT, `${id}-${view}.${ext}`), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`${id}-${view}.${ext}`);
    }
  }
} finally {
  await b.close();
  vite.kill();
}
