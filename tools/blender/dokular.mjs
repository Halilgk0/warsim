// Blender'da pişirilmiş uçak ve top dokularını yayına hazırlar (sharp, renk yönetimi yok: kanal değerleri aynen kalır):
//   <tür>_albedo.jpg|png → _albedo.webp, _normal.png → _normal.webp (yakın kayıpsız 60: en çok 1,8° sapma, kayıpsızdan
//   %31 küçük; kayıplıda renk alt örneklemesi panel dikişlerini ve perçinleri bozuyordu), _aos.png → _aos.webp (yarı boyda;
//   ortam gölgesi ve parlaklık yumuşak değişir). Boy kaynağınki (en çok 2048; uçaklar 2048, küçük toplar 1024). Kaynak
//   klasördeki dosyalardan hedef klasöre yazar.
//   node tools/blender/dokular.mjs <kaynak klasör> <hedef klasör> tür tür ...
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const [src, dst, ...kinds] = process.argv.slice(2);
let total = 0;
for (const k of kinds) {
  const albedo = existsSync(join(src, `${k}_albedo.jpg`)) ? `${k}_albedo.jpg` : `${k}_albedo.png`;
  const size = Math.min(2048, (await sharp(join(src, albedo)).metadata()).width);
  const jobs = [
    [albedo, `${k}_albedo.webp`, size, { quality: 82 }],
    [`${k}_normal.png`, `${k}_normal.webp`, size, { nearLossless: true, quality: 60 }],
    [`${k}_aos.png`, `${k}_aos.webp`, size / 2, { quality: 85 }],
  ];
  for (const [a, b, sz, opt] of jobs) {
    await sharp(join(src, a)).removeAlpha().resize(sz, sz, { kernel: 'lanczos3' }).webp({ ...opt, effort: 5 }).toFile(join(dst, b));
    total += statSync(join(dst, b)).size;
  }
  console.log(k, 'tamam');
}
console.log('toplam', (total / 1048576).toFixed(1), 'MB');
