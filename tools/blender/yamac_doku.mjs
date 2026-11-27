// Yamaç dokularını yayına hazırlar (2026-11-27): yamac.py'nin RGBA'sı (RG normal, B ton/2, A ortam gölgesi) → RGB webp (RG normal,
// B = ton × (0,45 + 0,55 × AO) / 2). Saydamlık kanalı yok: tarayıcı görseli çözerken saydamlıkla çarpıp normali bozabiliyordu.
//   node tools/blender/yamac_doku.mjs [kaynak] [hedef]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const src = process.argv[2] ?? 'tools/blender/cikti/yamac';
const dst = process.argv[3] ?? 'public/kaya';
for (const name of ['yamac_duvar', 'yamac_moloz']) {
  const { data, info } = await sharp(join(src, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const tone = (data[i + 2] / 255) * 2;
    const ao = data[i + 3] / 255;
    out[j] = data[i];
    out[j + 1] = data[i + 1];
    out[j + 2] = Math.round(Math.min(1, (tone * (0.45 + 0.55 * ao)) / 2) * 255);
  }
  const file = join(dst, `${name}.webp`);
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 92, smartSubsample: true, effort: 5 }).toFile(file);
  console.log(name, (statSync(file).size / 1024).toFixed(0), 'KB');
}
