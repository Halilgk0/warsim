// Performans ölçümü: yayın derlemesi, geçici Chrome profili (kullanıcının profili kullanılmaz), ekranlı tarayıcı
// (başsız tarayıcı rAF'yi yavaşlatır). Telefon taklidinde işlemci CDP ile yavaşlatılır (Emulation.setCPUThrottlingRate).
//
//   node audit/perf.mjs <etiket> [tel|pc] [yavaşlatma]     ör. node audit/perf.mjs sonra tel 4
//
// Her sahnede 3 sn ısınma + 8 sn ölçüm. Satır başına:
//   render_ms  kare başına sahne güncellemesi + çizim komutları (işlemci, yavaşlatılmış); bütçe 16,7 ms
//   gpu_ms     ekran kartı süresi (EXT_disjoint_timer_query_webgl2). İşlemci yavaşlatılınca şişer: yavaşlatmasız
//              koşudan oku. Masaüstü kartı telefonunkinden çok güçlü; telefonda asıl gösterge üçgen sayısı.
//   sim_ms     kare başına simülasyon
//   cagri, ucgen ve katman kırılımı (arazi, süs, yapılar: kapatılınca düşen miktar)
// Ekranın yenileme hızı 60 Hz'den yüksekse fps de yüksek çıkar; karşılaştırmada ms kullan.
// Çıktı: out/audit/<etiket>/perf_<tel|pc>_x<yavaşlatma>.json ve sahne başına arayüzlü ekran görüntüsü.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const PORT = 5296;

const args = process.argv.slice(2);
const label = args[0] || 'once';
const prof = args[1] || 'tel';
const rate = Number(args[2] || (prof === 'tel' ? 4 : 1));
const OUT = join(HERE, '..', 'out', 'audit', label);
const DIST = join(HERE, '..', 'out', 'audit', 'dist');
mkdirSync(OUT, { recursive: true });

const PROFILES = {
  pc: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  tel: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true },
};

// Sahne kurulumları (sayfada çalışır; window.game)
const SCENES = [
  { id: 'menu', setup: '' },
  { id: 'harekat_anakara', setup: `game.newCampaign('Denetim', 3, 'anakara');` },
  { id: 'harekat_takimada', setup: `game.newCampaign('Denetim', 3, 'takimada');` },
  { id: 'stuka_taktik', setup: `game.loadScenario('raid_dive');` },
  { id: 'stuka_takip', setup: `game.loadScenario('raid_dive');`, after: `
      const a = game.world.aircraft.find((x) => x.spec.id === 'ju87b');
      game.follow(a.id); game.renderer.rig.distance = 90; game.renderer.rig.pitch = 0.2;` },
  { id: 'b17_takip', setup: `game.loadScenario('b17_raid');`, after: `
      const a = game.world.aircraft.find((x) => x.spec.id === 'b17g');
      game.follow(a.id); game.renderer.rig.distance = 160; game.renderer.rig.pitch = 0.15;` },
  { id: 'dalas_8v8', setup: `game.loadScenario('df_8v8');`, after: `game.renderer.rig.distance = 2500;` },
];

const INSTRUMENT = `
(() => {
  if (window.__perf) return;
  const st = { frames: [], gpu: [], render: 0, sim: 0, n: 0, on: false };
  window.__perf = st;
  const R = game.renderer;
  const of = R.frame.bind(R);
  R.frame = (...a) => { const t = performance.now(); of(...a); if (st.on) { st.render += performance.now() - t; st.n++; } };
  const WP = Object.getPrototypeOf(game.world);
  const os = WP.step;
  WP.step = function (dt) { const t = performance.now(); os.call(this, dt); if (st.on) st.sim += performance.now() - t; };
  const gl = R.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  st.gpuOk = !!ext;
  if (ext) {
    const pending = [];
    const WR = R.renderer;
    const orr = WR.render.bind(WR);
    WR.render = (sc, cam) => {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      orr(sc, cam);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(q);
      while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q0 = pending.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && st.on) st.gpu.push(gl.getQueryParameter(q0, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q0);
      }
    };
  }
  let last = 0;
  const loop = (now) => { if (st.on && last) st.frames.push(now - last); last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();`;

/** Katman kırılımı: her katman tek başına gizlenince düşen çağrı ve üçgen. */
const BREAKDOWN = `
(() => {
  const r = game.renderer;
  const info = () => { r.renderer.render(r.scene, r.camera); const i = r.renderer.info.render; return { calls: i.calls, tris: i.triangles }; };
  const all = info();
  const out = {};
  for (const [k, g] of Object.entries({ arazi: r.terrain.group, sus: r.scenery.group, yapilar: r.structGroup })) {
    const v = g.visible; g.visible = false; const x = info(); g.visible = v;
    out[k] = { cagri: all.calls - x.calls, ucgen: all.tris - x.tris };
  }
  return out;
})()`;

function pct(a, p) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
}

function run(argv, ready) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), ...argv], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    if (ready) {
      p.stdout.on('data', (d) => String(d).includes(ready) && resolve(p));
      p.on('close', (c) => reject(new Error(`vite ${argv[0]} kapandı (${c})`)));
    } else {
      p.on('close', (c) => (c === 0 ? resolve(p) : reject(new Error(`vite ${argv[0]} ${c}`))));
    }
  });
}

async function main() {
  // Yayın derlemesi git dışındaki klasöre (projenin dist/ klasörü değişmez)
  await run(['build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'error']);
  const srv = await run(['preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], 'Local');
  const browser = await chromium.launch({
    channel: 'chrome', headless: false,
    args: ['--ignore-gpu-blocklist', '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  const results = [];
  try {
    const ctx = await browser.newContext(PROFILES[prof]);
    for (const sc of SCENES) {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`[sayfa hata] ${e.message}`));
      await page.goto(`http://localhost:${PORT}/`);
      await page.waitForFunction(() => window.game && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 120000 });
      const cdp = await ctx.newCDPSession(page);
      if (sc.setup) {
        await page.evaluate(sc.setup);
        await page.waitForFunction(() => game.mode === 'play' && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 120000 });
      }
      await page.waitForTimeout(1500);
      if (sc.after) await page.evaluate(sc.after);
      await page.evaluate(INSTRUMENT);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.waitForTimeout(3000);
      await page.evaluate(() => Object.assign(window.__perf, { frames: [], gpu: [], render: 0, sim: 0, n: 0, on: true }));
      await page.waitForTimeout(8000);
      const r = await page.evaluate(() => {
        const s = window.__perf;
        s.on = false;
        const inf = game.renderer.renderer.info.render;
        return { gpuOk: s.gpuOk, gpu: s.gpu, frames: s.frames, render: s.render / Math.max(1, s.n), sim: s.sim / Math.max(1, s.n),
          calls: inf.calls, tris: inf.triangles, px: [game.renderer.dom.width, game.renderer.dom.height] };
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const parca = await page.evaluate(BREAKDOWN);
      const f = r.frames;
      const mean = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
      const row = {
        sahne: sc.id, fps: +(1000 / mean).toFixed(1), p50: +pct(f, 0.5).toFixed(1), p95: +pct(f, 0.95).toFixed(1),
        render_ms: +r.render.toFixed(1), gpu_ms: r.gpuOk ? +pct(r.gpu, 0.5).toFixed(1) : null, gpu95_ms: r.gpuOk ? +pct(r.gpu, 0.95).toFixed(1) : null,
        sim_ms: +r.sim.toFixed(1), cagri: r.calls, ucgen: r.tris, tuval: r.px.join('×'), parca,
      };
      results.push(row);
      console.log(JSON.stringify(row));
      await page.screenshot({ path: join(OUT, `${sc.id}_${prof}.jpg`), type: 'jpeg', quality: 85 });
      await page.close();
    }
  } finally {
    writeFileSync(join(OUT, `perf_${prof}_x${rate}.json`), JSON.stringify(results, null, 1));
    await browser.close();
    srv.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
