// Oyunun arayüz ekranları (tanıtım videosunun "komutan sensin" bölümü için): telefon yatay ekranında yeni bir
// harekât açılır; görev planlayıcı, araştırma ve inşa ekranları sırayla açılıp yakalanır.
//   node ui.mjs        → out/ui/1-planlayici.png, 2-arastirma.png, 3-insa.png (2532×1170)
// Temiz, kalıcı olmayan bir tarayıcı profili kullanılır (hesap, kayıt yok).

import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'out', 'ui');
const PORT = 5295;

mkdirSync(OUT, { recursive: true });
const vite = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => vite.stdout.on('data', (d) => String(d).includes('Local') && r()));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log(`[sayfa hata] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.game && document.querySelector('#mm-cmd'), null, { timeout: 120000 });
  await page.fill('#mm-cmd', 'Ege');
  await page.tap('[data-mm="start"]');
  await page.waitForFunction(() => window.game.mode === 'play', null, { timeout: 120000 });
  // Oyun biraz aksın (üs hareketlensin), sonra duraklat
  await page.waitForTimeout(4000);
  const shot = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, name) });
    console.log(`yakalandı: ${name}`);
  };
  const step = process.argv[2] ?? 'all';

  if (step === 'all' || step === 'plan') {
    await page.evaluate(() => {
      const g = window.game;
      const base = g.world.airbasesOf(g.playerTeam)[0];
      const foe = g.world.structures.find((s) => s.team !== g.playerTeam && s.kind === 'factory');
      g.planner.open(base, foe);
    });
    await shot('1-planlayici.png');
    await page.evaluate(() => window.game.planner.close());
  }
  if (step === 'all' || step === 'research') {
    await page.evaluate(() => window.game.modals.open('research'));
    await shot('2-arastirma.png');
    await page.evaluate(() => window.game.modals.close());
  }
  if (step === 'all' || step === 'build') {
    // Üsse yaklaş, uçaksavar bataryasını yerleştirme anı (yeşil hayalet)
    await page.evaluate(() => {
      const g = window.game;
      const base = g.world.airbasesOf(g.playerTeam)[0];
      const rig = g.renderer.rig;
      rig.target.set(base.s.pos.x + 1050, base.s.pos.y, base.s.pos.z + 650);
      rig.distance = 3000;
      rig.pitch = 0.95;
      g.build.open();
      g.beginBuild('aa');
      g.interaction.x = base.s.pos.x + 1300;
      g.interaction.z = base.s.pos.z + 700;
      g.refreshBuild();
    });
    await shot('3-insa.png');
  }
} finally {
  await browser.close();
  vite.kill();
}
