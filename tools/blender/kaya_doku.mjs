// Kaya atlaslarını yayına hazırlar (2026-11-27): kaya_albedo.png → kaya_albedo.webp (2048), _1k (1024), _512 (Düşük);
// kaya_normal.png → kaya_normal.webp (2048) ve _1k, kayıplı 90 (kaya pürüzlü: alt örnekleme seçilmiyor; yakın kayıpsız 3 MB).
//   node tools/blender/kaya_doku.mjs [kaynak klasör] [hedef klasör]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const src = process.argv[2] ?? 'tools/blender/cikti/kaya';
const dst = process.argv[3] ?? 'public/kaya';
const jobs = [
  ['kaya_albedo.png', 'kaya_albedo.webp', 2048, { quality: 84 }],
  ['kaya_albedo.png', 'kaya_albedo_1k.webp', 1024, { quality: 84 }],
  ['kaya_albedo.png', 'kaya_albedo_512.webp', 512, { quality: 84 }],
  ['kaya_normal.png', 'kaya_normal.webp', 2048, { quality: 90, smartSubsample: true }],
  ['kaya_normal.png', 'kaya_normal_1k.webp', 1024, { quality: 90, smartSubsample: true }],
];
let total = 0;
for (const [a, b, sz, opt] of jobs) {
  await sharp(join(src, a)).removeAlpha().resize(sz, sz, { kernel: 'lanczos3' }).webp({ ...opt, effort: 5 }).toFile(join(dst, b));
  const n = statSync(join(dst, b)).size;
  total += n;
  console.log(b, (n / 1024).toFixed(0), 'KB');
}
console.log('toplam', (total / 1048576).toFixed(2), 'MB');
