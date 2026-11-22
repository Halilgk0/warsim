// Çalıştırma: node tools/sim/calistir.mjs jet_dalas [koşu] [A] [B]
// Jet dalaşı neden az düşürüyor (2026-11-21, oyuncu bildirimi: "jet avcı düşman jetini nadiren düşürüyor"). 4'e 4 dalaşta
// her uçağın çatışma evresinde (saldırı, uzaklaşma, tırmanış) geçirdiği süre, durum satırlarının payı, en yakın düşmana
// uzaklık dağılımı ve ateş açabileceği konumda (düşmanın arkasında, 600 m içinde) geçen süre. Pervaneli eşleşmeyle karşılaştır.
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { dogfight } from '../../src/sim/scenarios';

const RUNS = Number(process.argv[2] ?? 6);
const A = process.argv[3] ?? 'f86f';
const B = process.argv[4] ?? 'mig15';
const SECS = 600;
const phase = new Map<string, number>();
const status = new Map<string, number>();
const band = [0, 0, 0, 0, 0];
let behind = 0;
let fire = 0;
let samples = 0;
let kills = 0;
for (let r = 0; r < RUNS; r++) {
  const w = new World();
  dogfight(w, [A, 4], [B, 4], { sep: 4000, blueAlt: 4000, redAlt: 4000 });
  for (let i = 0; i < SECS * 60; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (i % 30) continue;
    for (const ac of w.aircraft) {
      if (ac.status !== 'flying' || !ac.airborne) continue;
      samples++;
      const cs = ac.brain.combat;
      phase.set(cs.phase, (phase.get(cs.phase) ?? 0) + 1);
      const st = (ac.brain.status || '-').split(':')[0];
      status.set(st, (status.get(st) ?? 0) + 1);
      let best = Infinity;
      let bestE = null as typeof ac | null;
      for (const e of w.aircraft) {
        if (e.team === ac.team || e.status !== 'flying') continue;
        const d = e.pos.distanceTo(ac.pos);
        if (d < best) {
          best = d;
          bestE = e;
        }
      }
      band[best < 600 ? 0 : best < 1500 ? 1 : best < 3000 ? 2 : best < 6000 ? 3 : 4]++;
      if (bestE && best < 600) {
        const to = new Vector3().subVectors(bestE.pos, ac.pos).normalize();
        if (ac.fwd.dot(to) > 0.94 && bestE.fwd.dot(to) > 0.5) behind++;
      }
      if (ac.brain.fireGuns) fire++;
    }
    if (w.aircraft.every((x) => x.status !== 'flying' || x.team === 0) || w.aircraft.every((x) => x.status !== 'flying' || x.team === 1)) break;
  }
  kills += w.logs.filter((l) => l.cat === 'kill').length;
}
const pct = (n: number) => `${((100 * n) / samples).toFixed(1)}%`;
console.log(`${A} – ${B}, ${RUNS} koşu, düşürme ${kills} (koşu başına ${(kills / RUNS).toFixed(1)})`);
console.log('evre:', [...phase].map(([k, v]) => `${k} ${pct(v)}`).join(', '));
console.log('en yakın düşman: <600 m', pct(band[0]), '| 600–1500', pct(band[1]), '| 1,5–3 km', pct(band[2]), '| 3–6 km', pct(band[3]), '| >6 km', pct(band[4]));
console.log('arkasında 600 m içinde ve burnu ona dönük:', pct(behind), '| ateş ederken:', pct(fire));
console.log('durum:', [...status].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${pct(v)}`).join(' | '));
