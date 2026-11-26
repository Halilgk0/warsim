// Görev planlayıcının uçak resimleri (2026-11-25): ansiklopedinin kart görsellerinden (public/ansiklopedi/gorsel/<uçak>-kart.webp:
// bütün uçak, burun sağda, alçak açı, Blender dokulu, saydam zemin) saydam kenarları kırpılmış küçük kopya:
// public/uretim/kart-<uçak>.webp (en çok 320×140). uretim/ klasörü internetsiz oyunun önbelleğine girer.
// Ansiklopedi görselleri yeniden üretilince bunu da çalıştır:  node tools/uretim/kartlar.mjs [uçak ...]
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'public/ansiklopedi/gorsel');
const OUT = join(ROOT, 'public/uretim');
const only = new Set(process.argv.slice(2));
let n = 0;
let bytes = 0;
for (const f of readdirSync(SRC)) {
  const m = f.match(/^(.+)-kart\.webp$/);
  if (!m || (only.size && !only.has(m[1]))) continue;
  const out = join(OUT, `kart-${m[1]}.webp`);
  await sharp(join(SRC, f))
    .trim({ threshold: 1 })
    .resize(320, 140, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 76, alphaQuality: 85 })
    .toFile(out);
  bytes += statSync(out).size;
  n++;
}
console.log(`${n} resim, toplam ${Math.round(bytes / 1024)} KB`);
