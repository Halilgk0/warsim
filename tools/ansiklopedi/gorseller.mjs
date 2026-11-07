// Ansiklopedi görsellerini oyunun modellerinden üretir: public/ansiklopedi/gorsel/<uçak>-34.webp, -yan.webp, -og.jpg.
// Geçici tarayıcı profiliyle (kullanıcının Chrome profiline dokunmaz) vite geliştirme sunucusunda çizer.
//   node tools/ansiklopedi/gorseller.mjs            liste.ts'teki bütün uçaklar
//   node tools/ansiklopedi/gorseller.mjs spitfire1  yalnız bunlar (hava savunması: gun-aa88)
//   node tools/ansiklopedi/gorseller.mjs --kart     yalnız bu görünüş (--34, --yan, --og, --kart; uçaklarla birlikte de olur)
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
  const args = process.argv.slice(2);
  const views = args.filter((a) => a.startsWith('--')).map((a) => a.slice(2));
  const named = args.filter((a) => !a.startsWith('--'));
  // Hava savunma silahları "gun-<kimlik>" adıyla (yalnız kart ve paylaşım görseli)
  const ids = named.length
    ? named
    : await p.evaluate(async () => {
      const m = await import('/src/ansiklopedi/liste.ts');
      return [...Object.keys(m.ENCYCLOPEDIA), ...Object.keys(m.AA_ENCYCLOPEDIA).map((k) => `gun-${k}`)];
    });
  for (const id of ids) {
    const gun = id.startsWith('gun-');
    const all = gun ? ['kart', 'og'] : ['34', 'yan', 'og', 'kart'];
    for (const view of all.filter((v) => !views.length || views.includes(v))) {
      const url = await p.evaluate(async ([i, v, isGun]) => {
        const m = await import('/tools/ansiklopedi/cekim.ts');
        return isGun ? m.shotGun(i.slice(4), v) : m.shot(i, v);
      }, [id, view, gun]);
      const ext = view === 'og' ? 'jpg' : 'webp';
      writeFileSync(join(OUT, `${id}-${view}.${ext}`), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`${id}-${view}.${ext}`);
    }
  }
} finally {
  await b.close();
  vite.kill();
}
