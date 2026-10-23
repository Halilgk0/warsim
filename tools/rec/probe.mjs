// Çekim hazırlığı: kayıt kipindeki dünyada bir betik çalıştırır (simülasyonu ileri alıp uçakları, olayları izlemek).
//   node probe.mjs betik.js     betik: async (rec) => { … return sonuç } gövdesi; rec = window.__rec
// Sonuç JSON olarak yazdırılır.

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PORT = 5294;

const body = readFileSync(process.argv[2], 'utf8');
const vite = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => vite.stdout.on('data', (d) => String(d).includes('Local') && r()));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.on('pageerror', (e) => console.log(`[sayfa hata] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/?rec`);
  await page.waitForFunction(() => window.__rec, null, { timeout: 120000 });
  const out = await page.evaluate(async (src) => {
    const fn = new Function('rec', `return (async () => { ${src} })();`);
    return fn(window.__rec);
  }, body);
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
} finally {
  await browser.close();
  vite.kill();
}
