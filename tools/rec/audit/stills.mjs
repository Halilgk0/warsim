// Görsel denetim kareleri (önce/sonra karşılaştırması). Kayıt kipinde (?rec) tohumlu sahneleri oyunun kamera
// düzeneğiyle sabit açılardan çizer; aynı kare her seferinde aynı çıkar. Oyunun koduna dokunmaz.
//
//   node audit/stills.mjs <etiket> [sahne]      ör. node audit/stills.mjs sonra   ya da   ... sonra anakara
//   PARCA=1 node audit/stills.mjs <etiket>      her karede katman katman üçgen/çağrı kırılımı da yazılır
//
// Sahneler: anakara (Stuka baskını, fabrika isabetinden 7 sn sonra), takimada (B-17 kolu, iç deniz),
// yuksek (B-17 baskını, 7 km). Boyutlar: bilgisayar 1280×720 ve telefon yatay 844×390 (DPR 2).
// Çıktı: out/audit/<etiket>/<sahne>_<açı>_<pc|tel>.jpg ve meta.json (çağrı, üçgen).

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const PORT = 5295;

const args = process.argv.slice(2);
const label = args[0] || 'once';
const only = args[1] || '';
const OUT = join(HERE, '..', 'out', 'audit', label);
mkdirSync(OUT, { recursive: true });

const PROFILES = [
  { id: 'pc', viewport: { width: 1280, height: 720 }, dpr: 1 },
  { id: 'tel', viewport: { width: 844, height: 390 }, dpr: 2 },
];
const SCENES = ['anakara', 'takimada', 'yuksek'];

async function startVite() {
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Vite açılmadı')), 30000);
    vite.stdout.on('data', (d) => {
      if (String(d).includes('Local')) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  return vite;
}

async function main() {
  const vite = await startVite();
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const meta = {};
  const src = readFileSync(join(HERE, 'stills.page.js'), 'utf8');
  try {
    for (const p of PROFILES) {
      const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.dpr });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`[sayfa hata] ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && console.log(`[konsol] ${m.text()}`));
      await page.goto(`http://localhost:${PORT}/?rec`);
      await page.waitForFunction(() => window.__rec, null, { timeout: 120000 });
      await page.evaluate((s) => new Function(`return (async () => { ${s} })();`)(), src);
      console.log(p.id, await page.evaluate(() => window.__st.info()));
      for (const sc of SCENES) {
        if (only && sc !== only) continue;
        console.log(' ', sc, await page.evaluate((n) => window.__st.setup(n), sc));
        const views = await page.evaluate(() => window.__st.views());
        for (const [name, v] of Object.entries(views)) {
          const stats = await page.evaluate((v) => window.__st.shoot(v, 60), v);
          const file = `${sc}_${name}_${p.id}.jpg`;
          await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 88 });
          if (process.env.PARCA) stats.parca = await page.evaluate(() => window.__st.breakdown());
          meta[file] = stats;
          console.log('   ', file, JSON.stringify(stats));
        }
      }
      await ctx.close();
    }
  } finally {
    writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
    await browser.close();
    vite.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
