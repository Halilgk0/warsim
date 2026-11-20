// Blender'da pişirilmiş uçak dokularını yayına hazırlar (sharp, renk yönetimi yok: kanal değerleri aynen kalır):
//   <tür>_albedo.jpg → _albedo.webp (2048), _normal.png → _normal.webp (2048, kayıpsız: kayıplıda panel dikişleri ve
//   perçinler bozuluyordu), _aos.png → _aos.webp (1024; ortam gölgesi ve parlaklık yumuşak değişir). Kaynak klasördeki
//   dosyalardan hedef klasöre yazar.
//   node tools/blender/dokular.mjs <kaynak klasör> <hedef klasör> tür tür ...
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const [src, dst, ...kinds] = process.argv.slice(2);
let total = 0;
for (const k of kinds) {
  const jobs = [
    [`${k}_albedo.jpg`, `${k}_albedo.webp`, 2048, { quality: 82 }],
    [`${k}_normal.png`, `${k}_normal.webp`, 2048, { lossless: true }],
    [`${k}_aos.png`, `${k}_aos.webp`, 1024, { quality: 85 }],
  ];
  for (const [a, b, size, opt] of jobs) {
    await sharp(join(src, a)).removeAlpha().resize(size, size, { kernel: 'lanczos3' }).webp({ ...opt, effort: 5 }).toFile(join(dst, b));
    total += statSync(join(dst, b)).size;
  }
  console.log(k, 'tamam');
}
console.log('toplam', (total / 1048576).toFixed(1), 'MB');
