// Oyunun bir uçak modelinin boyalı geometrisini (gövde ve eklem gövdeleri; model ekseninde) JSON'a döker: Blender'da UV
// açılıp doku pişirilsin (tools/blender/doku.py). Geçici tarayıcı profili, vite geliştirme sunucusu.
//   node tools/blender/geo_al.mjs hurricane <çıktı.json>
// Çıktı { parts, meta }: meta, modelin models.ts'teki çizim satırları (doku.py'nin genel yolu bölgeleri bunlardan kurar):
// WR kanat, TR yatay kuyruk, NR motor nacellesi ve nacX (pods: bütün nacelleler), hull gövde kesitleri, fins dikey kuyruklar, screenZ ön cam,
// propZ pervane. Satırı olmayan model (WingOpts ile kurulanlar) için meta eksik kalır; o uçak doku.py'de elle tanımlanır.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(ROOT, 'tools/rec/package.json'));
const { chromium } = require('playwright-core');
const [kind, out] = process.argv.slice(2);

/** models.ts'te modelin case bloğundaki çizim satırları. */
function modelMeta(k) {
  const src = readFileSync(join(ROOT, 'src/render/models.ts'), 'utf8').replace(/\r\n/g, '\n');
  const at = src.indexOf(`case '${k}':`);
  if (at < 0) return {};
  const open = src.indexOf('{', at);
  const end = src.indexOf("\n    case '", open);
  const block = src.slice(open, end < 0 ? undefined : end);
  const arr = (re) => {
    const m = block.match(re);
    return m ? JSON.parse(m[1].replace(/,\s*\]/g, ']')) : undefined;
  };
  const num = (re) => {
    const m = block.match(re);
    return m ? Number(m[1]) : undefined;
  };
  const fins = [...block.matchAll(/hingedFin\(H, (\[\[.*?\]\]), (\[\[.*?\]\]), ([-\d.]+), ([-\d.]+), ([-\d.]+)(?:, ([-\d.]+))?/g)].map((m) => {
    const fin = JSON.parse(m[1]);
    const rud = JSON.parse(m[2]);
    const ys = [...fin, ...rud].map((q) => q[0]);
    const zs = [...fin, ...rud].map((q) => q[1]);
    return { x: m[6] ? Number(m[6]) : 0, ymin: Math.min(...ys), ymax: Math.max(...ys), zmax: Math.max(...zs), zmin: Math.min(...zs), hz: Number(m[3]), t: Math.max(Number(m[4]), Number(m[5])) };
  });
  // Jetler: kanat ve yatay kuyruk WingOpts nesnesi (kök ve uç satırına çevrilir; Meteor ve Canberra'da iç kanat Wi ayrı)
  const wopts = (name) => {
    const m = block.match(new RegExp(`const ${name}: WingOpts = (\\{[^}]*\\})`));
    if (!m) return undefined;
    try {
      return JSON.parse(m[1].replace(/(\w+):/g, '"$1":'));
    } catch {
      return undefined;
    }
  };
  const rowsOf = (o) => [[o.x0, o.y, o.z, o.root, o.t], [o.tipX, o.y + (o.tipX - o.x0) * Math.tan((o.dihedral * Math.PI) / 180), o.z - o.sweep, o.tip, o.t * (1 - (o.tTaper ?? 0.55))]];
  const W = wopts('W');
  const Wi = wopts('Wi');
  const T = wopts('T');
  // Jet dikey kuyrukları: jetFin satırları [y, hücum kenarı z, veter] (ya da FIN sabiti), kalınlık, x
  const FIN = arr(/const FIN(?:: \[number, number, number\]\[\])? = (\[\[[\s\S]*?\],?\s*\])/);
  for (const m of block.matchAll(/jetFin\((\[\[[\s\S]*?\]\]|FIN), ([-\d.]+), ([-\d.]+), (\d+), (\d+)(?:, ([-\d.]+))?/g)) {
    const rows = m[1] === 'FIN' ? FIN : JSON.parse(m[1]);
    if (!rows) continue;
    const les = rows.map((q) => q[1]);
    fins.push({ x: m[6] ? Number(m[6]) : 0, ymin: rows[0][0], ymax: rows[rows.length - 1][0], zmax: Math.max(...les), zmin: Math.min(...rows.map((q) => q[1] - q[2])), hz: 0, t: Number(m[2]) });
  }
  // Jet nacelleleri: NX, NY ve nacelle işlevindeki ilk body profili [z, r] (Il-28'de pod, Vampire'da kuyruk kirişi boom: JetHull)
  let NR = arr(/const NR = (\[\[[\s\S]*?\],?\s*\]) as JetSec/);
  let pods = [...block.matchAll(/\.\.\.podAt\(([-\d.]+)(?:, ([-\d.]+), ([-\d.]+))?\)/g)].map((m) => ({ x: Number(m[1]), dy: Number(m[2] ?? 0), dz: Number(m[3] ?? 0) }));
  const NX = num(/const NX = ([-\d.]+)/);
  if (!NR && NX !== undefined) {
    const NY = num(/const NY = ([-\d.]+)/) ?? 0;
    const prof = block.slice(block.indexOf('const nacelle')).match(/body\((\[\[[\s\S]*?\]\])/);
    const podHull = arr(/const pod = new JetHull\((\[\[[\s\S]*?\],?\s*\])/);
    if (prof) {
      // Profil hava girişinin dudağını sarar (z önce ileri, sonra geri gider): yalnız en öndeki noktadan sonrası dış kabuktur
      const rows = JSON.parse(prof[1]);
      const front = rows.reduce((b, q, i) => (q[0] > rows[b][0] ? i : b), 0);
      NR = rows.slice(front).map(([z, r]) => [z, r, r, -r, 0]);
    }
    else if (podHull) NR = podHull;
    if (NR) pods = [{ x: NX, dy: prof ? NY : 0, dz: 0 }];
  }
  const boom = arr(/const boom = new JetHull\((\[\[[\s\S]*?\],?\s*\])/);
  const boomX = num(/boom\.geo\(\d+\)\.translate\(sd \* ([-\d.]+)/);
  if (!NR && boom && boomX !== undefined) {
    NR = boom;
    pods = [{ x: boomX, dy: 0, dz: 0 }];
  }
  return {
    WR: arr(/const WR = (\[\[[\s\S]*?\],?\s*\]) as WingRow/) ?? (W ? [...(Wi ? rowsOf(Wi) : []), ...rowsOf(W)].sort((a, b) => a[0] - b[0]) : undefined),
    TR: arr(/const TR = (\[\[[\s\S]*?\],?\s*\]) as WingRow/) ?? (T ? rowsOf(T) : undefined),
    NR,
    nacX: pods[0]?.x,
    // Bütün nacelleler (dört motorluda iç ve dış; dış nacelle dy, dz ile kayar)
    pods,
    hull: arr(/const H = new JetHull\((\[[\s\S]*?\],?\s*\])/),
    fins,
    screenZ: num(/screen: \[\[([-\d.]+)/),
    propZ: num(/props: \[\{ z: ([-\d.]+)/),
  };
}

const meta = modelMeta(kind);
const PORT = 5341;
const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => vite.stdout.on('data', (d) => String(d).includes('Local') && r()));
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('HATA', e.message));
  await p.goto(`http://localhost:${PORT}/ansiklopedi/`);
  const parts = await p.evaluate(async (k) => {
    const models = await import('/src/render/models.ts');
    const m = models.buildAircraftModel(k, { gear: true, detail: 1 });
    const skin = m.root.children[0].material;
    const arr = (g, a) => Array.from(g.getAttribute(a).array, (v) => Math.round(v * 1e5) / 1e5);
    const parts = [{ name: 'solid', pos: arr(m.root.children[0].geometry, 'position'), nrm: arr(m.root.children[0].geometry, 'normal') }];
    for (const [name, outer] of Object.entries(m.joints)) {
      outer.traverse((o) => {
        if (o.isMesh && o.material === skin) parts.push({ name: `j:${name}`, pos: arr(o.geometry, 'position'), nrm: arr(o.geometry, 'normal') });
      });
    }
    return parts;
  }, kind);
  writeFileSync(out, JSON.stringify({ parts, meta }));
  console.log(parts.map((d) => `${d.name} ${d.pos.length / 9} üçgen`).join('\n'));
  console.log('meta', Object.entries(meta).map(([key, v]) => `${key}:${v === undefined ? '-' : Array.isArray(v) ? v.length : v}`).join(' '));
} finally {
  await b.close();
  vite.kill();
}
