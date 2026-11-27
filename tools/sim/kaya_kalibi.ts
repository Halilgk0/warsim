// Çalıştırma: node tools/sim/calistir.mjs kaya_kalibi
// Kanyon kaya sütunlarının sim biçimi (2026-11-27, Blender çeşitleri): sütun başına merkezdeki ve elips içindeki en yüksek
// yüzey, kayanın kapladığı pay, elipsin dışında kaya olmaması; çeşitlerin dağılımı.
import { loadMap } from '../../src/sim/terrain';
import { pillarList, pillarTop } from '../../src/sim/pillars';
import { PILLAR_SHAPES } from '../../src/sim/pillarShapes';

loadMap('kanyon', 200000);
const list = pillarList();
const byShape = new Map<string, number>();
let outside = 0;
let worst = 0;
for (const p of list) {
  byShape.set(PILLAR_SHAPES[p.shape].name, (byShape.get(PILLAR_SHAPES[p.shape].name) ?? 0) + 1);
  let hi = -Infinity;
  let hits = 0;
  let n = 0;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  for (let j = -30; j <= 30; j++) {
    for (let i = -30; i <= 30; i++) {
      const a = i / 30;
      const b = j / 30;
      const d = Math.hypot(a, b);
      // Daire uzayından dünyaya (pillarLocal'in tersi)
      const u = (a * p.r) / p.ax;
      const v = b * p.r * p.ax;
      const x = p.x + c * u - s * v;
      const z = p.z + s * u + c * v;
      const t = pillarTop(x, z);
      if (d > 1.02 && t > -Infinity) outside++;
      if (d <= 1) {
        n++;
        if (t > p.base + 1) hits++;
        hi = Math.max(hi, t);
      }
    }
  }
  worst = Math.max(worst, (hi - p.base) / p.tall);
}
console.log('sütun', list.length, 'çeşitler', Object.fromEntries(byShape));
console.log('elipsin dışında kaya', outside, 'en yüksek tepe / boy', worst.toFixed(3));
const p = list[0];
const cov: number[] = [];
for (const q of list.slice(0, 8)) {
  let hits = 0;
  let n = 0;
  for (let j = -20; j <= 20; j++) for (let i = -20; i <= 20; i++) {
    if (Math.hypot(i, j) > 20) continue;
    n++;
    const u = ((i / 20) * q.r) / q.ax;
    const v = (j / 20) * q.r * q.ax;
    const x = q.x + Math.cos(q.rot) * u - Math.sin(q.rot) * v;
    const z = q.z + Math.sin(q.rot) * u + Math.cos(q.rot) * v;
    if (pillarTop(x, z) > q.base + 1) hits++;
  }
  cov.push(Math.round((hits / n) * 100));
}
console.log('ilk 8 sütunda kayanın elipsi kaplama payı (%)', cov.join(' '), 'örnek', PILLAR_SHAPES[p.shape].name, 'merkez', (pillarTop(p.x, p.z) - p.base).toFixed(0), '/', p.tall.toFixed(0));
