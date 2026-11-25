// Çalıştırma: node tools/sim/calistir.mjs jet_pervane [koşu] [jet] [pervaneli,...]
// Jet ile başlangıç pervanelisi 4'e 4 (2026-11-25, oyuncu bildirimi: "geç oyunda jetler başlangıç bot uçaklarına karşı bile çok
// zayıf"). bench.ts duel ile: düşürme payı, mermi ve isabet.
import { duel } from './bench';

const RUNS = Number(process.argv[2] ?? 12);
const JET = process.argv[3] ?? 'me262';
const PROPS = (process.argv[4] ?? 'bf109e,spitfire1,hurricane1,i16').split(',');
for (const p of PROPS) {
  const r = duel(JET, p, RUNS, 600, 3000, 5000, 4);
  const share = r.a + r.b ? Math.round((100 * r.a) / (r.a + r.b)) : 0;
  console.log(`${JET.padEnd(8)} – ${p.padEnd(10)} 4'e 4 ×${RUNS}: düşürme ${r.a}:${r.b} (jet payı %${share}) | mermi ${r.firedA}/${r.firedB} isabet ${r.hitsA}/${r.hitsB} | sonuçsuz ${r.none}`);
}
process.exit(0);
