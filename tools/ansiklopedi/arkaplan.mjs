// Ansiklopedi sayfalarının arka planı: ana menüdeki harita görüntüsü (arayüzsüz). Örtüsü stil.css'te, bulanıklığı burada
// görselin içine işlenir. Geçici tarayıcı profiliyle (kullanıcının Chrome profiline dokunmaz) vite sunucusunda çeker.
//   node tools/ansiklopedi/arkaplan.mjs   → public/ansiklopedi/arka.webp
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(ROOT, 'tools/rec/package.json'));
const { chromium } = require('playwright-core');
const PORT = 5341;

const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => vite.stdout.on('data', (d) => String(d).includes('Local') && r()));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('HATA', e.message));
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForSelector('.mm', { timeout: 120000 });
  await p.waitForTimeout(6000);
  await p.addStyleTag({ content: '.mm { display: none !important; }' });
  await p.waitForTimeout(800);
  const png = (await p.screenshot({ type: 'png' })).toString('base64');
  const url = await p.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 900;
    const g = c.getContext('2d');
    // Kenarlar bulanıklıkta soluklaşmasın diye biraz taşır
    g.filter = 'blur(2px)';
    g.drawImage(img, -8, -5, 1616, 910);
    return c.toDataURL('image/webp', 0.72);
  }, png);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(join(ROOT, 'public/ansiklopedi/arka.webp'), buf);
  console.log(`arka.webp ${Math.round(buf.length / 1024)} KB`);
} finally {
  await b.close();
  vite.kill();
}
