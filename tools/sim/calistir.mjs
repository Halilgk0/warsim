// Başsız simülasyon betiğini derleyip çalıştırır: node tools/sim/calistir.mjs <betik adı> [betiğin argümanları]
//   node tools/sim/calistir.mjs radar_menzil geo
//   node tools/sim/calistir.mjs inis canberra 4 yok 4
// Betikler tools/sim/<ad>.ts (uzantı yazılmaz). esbuild paketi tools/sim/.out'a (git dışı) yazılır.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const [name, ...rest] = process.argv.slice(2);
if (!name) {
  console.error('kullanım: node tools/sim/calistir.mjs <betik> [argümanlar]   (tools/sim/*.ts)');
  process.exit(2);
}
const src = join(ROOT, 'tools/sim', `${name}.ts`);
if (!existsSync(src)) {
  console.error(`yok: ${src}`);
  process.exit(2);
}
mkdirSync(join(ROOT, 'tools/sim/.out'), { recursive: true });
const out = join(ROOT, 'tools/sim/.out', `${name}.mjs`);
const b = spawnSync(process.execPath, [join(ROOT, 'node_modules/esbuild/bin/esbuild'), src, '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`, '--log-level=error'], { stdio: 'inherit', cwd: ROOT });
if (b.status !== 0) process.exit(b.status ?? 1);
const r = spawnSync(process.execPath, [out, ...rest], { stdio: 'inherit', cwd: ROOT });
process.exit(r.status ?? 0);
