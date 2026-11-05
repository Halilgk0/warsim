// Üretim listesi resimlerini ve araştırma siluetlerini oyunun modellerinden üretir: public/uretim/ac-<uçak>.webp, gun-<top>.webp,
// public/uretim/plan/<ac|gun>-<kimlik>-<durum>.webp.
// Geçici tarayıcı profiliyle (kullanıcının Chrome profiline dokunmaz) vite geliştirme sunucusunda çizer.
//   node tools/uretim/gorseller.mjs                 bütün uçaklar ve toplar
//   node tools/uretim/gorseller.mjs ac-spitfire1    yalnız bunlar (siluetleriyle birlikte)
//   node tools/uretim/gorseller.mjs "ac-*"          bütün uçakların ana resimleri (siluetler hariç)
// Model değişince ya da yeni uçak ve top eklenince yeniden çalıştır; kendiliğinden güncellenmez.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(ROOT, 'tools/rec/package.json'));
const { chromium } = require('playwright-core');
const OUT = join(ROOT, 'public/uretim');
const PORT = 5341;
mkdirSync(join(OUT, 'plan'), { recursive: true });

const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => vite.stdout.on('data', (d) => String(d).includes('Local') && r()));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let total = 0;
try {
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('HATA', e.message));
  // Boş bir sayfa yeter (oyun yüklenmez): modül vite üzerinden gelir
  await p.goto(`http://localhost:${PORT}/ansiklopedi/`);
  const all = await p.evaluate(async () => (await import('/tools/uretim/cekim.ts')).names());
  const wanted = process.argv.slice(2);
  // "ac-*" gibi yıldızlı ad: yalnız o önekli ana resimler (siluetler hariç)
  const names = wanted.length ? all.filter((n) => wanted.some((w) => (w.endsWith('*') ? n.startsWith(w.slice(0, -1)) : n === w || n.startsWith(`plan/${w}-`)))) : all;
  for (const name of names) {
    const url = await p.evaluate(async (n) => (await import('/tools/uretim/cekim.ts')).shot(n), name);
    if (!url.startsWith('data:image/webp')) throw new Error(`webp üretilemedi: ${name}`);
    const data = Buffer.from(url.split(',')[1], 'base64');
    writeFileSync(join(OUT, `${name}.webp`), data);
    total += data.length;
  }
  console.log(`${names.length} dosya, toplam ${(total / 1048576).toFixed(2)} MB`);
} finally {
  await b.close();
  vite.kill();
}
process.exit(0);
