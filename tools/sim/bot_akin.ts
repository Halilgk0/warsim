// Çalıştırma: node tools/sim/calistir.mjs bot_akin [dakika] [bot] [tohum]
// Botların akınları (2026-11-25, oyuncu bildirimi: "botlar yoğun ve kalabalık akın pek yapmıyor, ağır bombardıman uçaklarını
// neredeyse hiç kullanmıyor"). Oyuncu tarafı da bot oynar (demo). Sayılan: her baskın paketinin saldırı uçağı sayısı ve içindeki
// bombardıman uçağı, akın büyüklüğü dağılımı, rol başına üretim siparişi, sonunda filo bileşimi, yıkılan yapı ve elenen taraf.
import { World } from '../../src/sim/world';
import { setupCampaign } from '../../src/sim/campaign';
import { SPECS } from '../../src/sim/aircraft/specs';

const MINS = Number(process.argv[2] ?? 240);
const BOTS = Number(process.argv[3] ?? 3);
const SEED = Number(process.argv[4] ?? 0);
if (SEED) {
  // Tohumlu rastgele (mulberry32): eski ve yeni kod aynı oyunu oynasın
  let a = SEED >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const w = new World();
setupCampaign(w, { enemies: BOTS, playerName: 'Deneme', demo: true });

interface Raid { t: number; team: number; strike: number; bombers: number; escort: number }
const raids: Raid[] = [];
const orders = new Map<string, number>();
const proto = Object.getPrototypeOf(w) as World;
const launch = proto.launchPackage;
proto.launchPackage = function (this: World, base, plan, groups, escorts) {
  const strike = groups.reduce((a, g) => a + g.count, 0);
  const bombers = groups.filter((g) => SPECS[g.specId].role === 'bomber').reduce((a, g) => a + g.count, 0);
  if (['levelBomb', 'diveBomb', 'attack'].includes(plan.type)) {
    raids.push({ t: this.time, team: base.s.team, strike, bombers, escort: escorts.reduce((a, g) => a + g.count, 0) });
  }
  return launch.call(this, base, plan, groups, escorts);
};
const order = proto.orderAircraft;
proto.orderAircraft = function (this: World, s, id) {
  const ok = order.call(this, s, id);
  if (ok) orders.set(SPECS[id].role, (orders.get(SPECS[id].role) ?? 0) + 1);
  return ok;
};
let mass = 0;
const log = proto.log;
proto.log = function (this: World, ...a: Parameters<World['log']>) {
  if (String(a[0]).includes('büyük akın')) mass++;
  return log.apply(this, a);
};
const destroyedAt0 = 0;
let destroyed = destroyedAt0;
const seen = new Set<number>();
for (let m = 1; m <= MINS; m++) {
  for (let i = 0; i < 3600; i++) {
    w.step(1 / 60);
    w.events.length = 0;
  }
  for (const s of w.structures) if (s.destroyed && !seen.has(s.id)) { seen.add(s.id); destroyed++; }
}
// Akın: aynı takımın 30 sn içinde kalkan paketleri (büyük akında bombardıman, pike ve taarruz ayrı paketlerdir)
const waves: { strike: number; all: number }[] = [];
let last: Raid | null = null;
for (const r of raids) {
  const w0 = waves[waves.length - 1];
  if (last && w0 && r.team === last.team && r.t - last.t < 30) {
    w0.strike += r.strike;
    w0.all += r.strike + r.escort;
  } else waves.push({ strike: r.strike, all: r.strike + r.escort });
  last = r;
}
const wBig = waves.filter((x) => x.strike >= 8).length;
const wMax = Math.max(0, ...waves.map((x) => x.strike));
const wAllMax = Math.max(0, ...waves.map((x) => x.all));
console.log(`AKIN tohum ${SEED}: akın ${waves.length} | en büyük ${wMax} saldırı uçağı (eskortla ${wAllMax}) | ≥8 saldırı uçaklı ${wBig} | ≥6: ${waves.filter((x) => x.strike >= 6).length} | büyük akın emri ${mass}`);
const n = raids.length;
const avg = n ? raids.reduce((a, r) => a + r.strike, 0) / n : 0;
const big = raids.filter((r) => r.strike >= 8).length;
const huge = raids.filter((r) => r.strike >= 12).length;
const withB = raids.filter((r) => r.bombers > 0).length;
const bSorties = raids.reduce((a, r) => a + r.bombers, 0);
const maxS = Math.max(0, ...raids.map((r) => r.strike));
const fleet = new Map<string, number>();
for (const b of w.structures) if (b.airbase) for (const af of b.airbase.inventory) fleet.set(SPECS[af.specId].role, (fleet.get(SPECS[af.specId].role) ?? 0) + 1);
const elim = w.teams.filter((t) => t.eliminated).length;
console.log(`SONUÇ tohum ${SEED}: baskın ${n} | ort. ${avg.toFixed(1)} uçak | en büyük ${maxS} | ≥8: ${big} | ≥12: ${huge} | bombardımanlı ${withB} (${bSorties} sorti) | eskort ort. ${(n ? raids.reduce((a, r) => a + r.escort, 0) / n : 0).toFixed(1)}`);
console.log(`  sipariş: ${[...orders].map(([r, c]) => `${r} ${c}`).join(', ')} | filo: ${[...fleet].map(([r, c]) => `${r} ${c}`).join(', ')} | yıkılan yapı ${destroyed} | elenen ${elim}`);
process.exit(0);
