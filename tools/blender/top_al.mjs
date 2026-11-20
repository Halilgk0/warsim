// Uçaksavar toplarının oyundaki geometrisini Blender'a aktarır (top.py okur). Oyunun kendi kodu çalışır (structures.ts
// buildAAGun): geçici tarayıcı profiliyle vite geliştirme sunucusunda kurulur, dört hareketli parça ayrı yazılır:
//   base (sabit taban), yaw (dönen kısım), pitch (yükselen beşik), recoil (beşikte geri tepen namlu kümesi).
// Her parça kendi grubunun ekseninde (oyun bu gruplara takar); offset grubun dinlenme konumundaki yeri (top ekseninde).
// Köşe başına: konum, normal, renk (sRGB onaltılık), yüzey türü (arch.ts SURF).
//   node tools/blender/top_al.mjs [top ...]     (varsayılan bütün toplar) → tools/blender/cikti/top/<top>.json
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(ROOT, 'tools/rec/package.json'));
const { chromium } = require('playwright-core');
const OUT = join(ROOT, 'tools/blender/cikti/top');
const PORT = 5343;
mkdirSync(OUT, { recursive: true });

const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => vite.stdout.on('data', (d) => String(d).includes('Local') && r()));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('HATA', e.message));
  await p.goto(`http://localhost:${PORT}/ansiklopedi/`);
  const all = await p.evaluate(async () => Object.keys((await import('/src/sim/structures/aaWeapons.ts')).AA_WEAPONS));
  const wanted = process.argv.slice(2);
  for (const id of wanted.length ? wanted : all) {
    const data = await p.evaluate(async (gid) => {
      const S = await import('/src/render/structures.ts');
      // Yalnız oyunun kodla kurulan modeli (Blender dokusu yüklüyse bile)
      const g = S.buildAAGun(gid, true);
      g.updateMatrixWorld(true);
      const ud = g.userData;
      const toS = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
      const hex = (r, gg, bb) => (Math.round(toS(r) * 255) << 16) | (Math.round(toS(gg) * 255) << 8) | Math.round(toS(bb) * 255);
      const r5 = (v) => Math.round(v * 1e5) / 1e5;
      const parts = [];
      for (const [name, grp] of [['base', g], ['yaw', ud.yaw], ['pitch', ud.pitch], ['recoil', ud.recoil]]) {
        const mesh = grp.children.find((o) => o.isMesh);
        if (!mesh) continue;
        const geo = mesh.geometry;
        const pos = geo.getAttribute('position');
        const nrm = geo.getAttribute('normal');
        const col = geo.getAttribute('color');
        const surf = geo.getAttribute('surf');
        const n = pos.count;
        const o = { name, offset: [], pos: [], nrm: [], col: [], surf: [] };
        const wp = mesh.getWorldPosition(mesh.position.clone());
        o.offset = [r5(wp.x), r5(wp.y), r5(wp.z)];
        for (let i = 0; i < n; i++) {
          o.pos.push(r5(pos.getX(i)), r5(pos.getY(i)), r5(pos.getZ(i)));
          o.nrm.push(r5(nrm.getX(i)), r5(nrm.getY(i)), r5(nrm.getZ(i)));
          o.col.push(hex(col.getX(i), col.getY(i), col.getZ(i)));
          o.surf.push(Math.round(surf.getX(i)));
        }
        parts.push(o);
      }
      const tip = ud.muzzle.position;
      return { gun: gid, tip: [tip.x, tip.y, tip.z], parts };
    }, id);
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify(data));
    console.log(id, data.parts.map((q) => `${q.name} ${q.pos.length / 9}`).join(', '));
  }
} finally {
  await b.close();
  vite.kill();
}
process.exit(0);
