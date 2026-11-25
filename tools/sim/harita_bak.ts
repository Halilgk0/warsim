// Çalıştırma: node tools/sim/calistir.mjs harita_bak [harita] [piksel] [çıktı.png]
// Haritanın doğal yüksekliğinden kuşbakışı gölgeli rölyef (yeni harita tasarlarken). Renk yükseklikten, gölge kuzeybatı
// ışığından. Kenar uzunluğu 300 km (taban).
import { mapById } from '../../src/sim/maps';
import { MAP_BASE } from '../../src/sim/mapData';
import { writeFileSync } from 'node:fs';

const def = mapById(process.argv[2] ?? 'kanyon');
const N = Number(process.argv[3] ?? 1024);
const OUT = process.argv[4] ?? 'harita.raw';
const half = MAP_BASE / 2;
const cell = MAP_BASE / N;
const H = new Float32Array(N * N);
let min = Infinity;
let max = -Infinity;
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const h = def.natural(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell, 1);
  H[j * N + i] = h;
  min = Math.min(min, h);
  max = Math.max(max, h);
}
const px = Buffer.alloc(N * N * 3);
const stops: [number, number[]][] = [[-40, [70, 120, 150]], [0, [96, 150, 170]], [30, [196, 170, 128]], [250, [184, 120, 84]], [500, [206, 140, 96]], [750, [222, 184, 140]], [950, [200, 176, 130]], [1200, [160, 150, 110]]];
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const h = H[j * N + i];
  const hx = H[j * N + Math.min(i + 1, N - 1)] - H[j * N + Math.max(i - 1, 0)];
  const hz = H[Math.min(j + 1, N - 1) * N + i] - H[Math.max(j - 1, 0) * N + i];
  const nx = -hx / (2 * cell);
  const nz = -hz / (2 * cell);
  const l = Math.hypot(nx, nz, 1);
  const shade = Math.max(0.25, (nx * -0.6 + nz * -0.6 + 0.55) / l + 0.35);
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let s = 0; s < stops.length - 1; s++) if (h >= stops[s][0] && h <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
  const t = b[0] > a[0] ? Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0]))) : 0;
  for (let c = 0; c < 3; c++) px[(j * N + i) * 3 + c] = Math.max(0, Math.min(255, Math.round((a[1][c] + (b[1][c] - a[1][c]) * t) * (h < 0 ? 1 : shade))));
}
writeFileSync(OUT, px);
console.log(`${def.id}: ${N}×${N}, yükseklik ${Math.round(min)}…${Math.round(max)} m → ${OUT}`);
process.exit(0);
