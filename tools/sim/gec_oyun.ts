// Çalıştırma: node tools/sim/calistir.mjs gec_oyun [dakika] [bot]
// Geç oyunda simülasyon maliyeti (2026-11-25, oyuncu bildirimi: "büyük haritada 2 botla ~4 saat sonra 5 kare/sn"). Oyuncu tarafı
// da bot oynar (demo). Her 10 dakikada: son dakikanın ortalama adım süresi (ms; 60 adım = 1 sn oyun) ve dünyanın kalabalığı.
import { World } from '../../src/sim/world';
import { setupCampaign } from '../../src/sim/campaign';

const MINS = Number(process.argv[2] ?? 240);
const BOTS = Number(process.argv[3] ?? 2);
const w = new World();
setupCampaign(w, { enemies: BOTS, playerName: 'Deneme', demo: true });
const t0 = Date.now();
for (let m = 1; m <= MINS; m++) {
  const a = performance.now();
  let worst = 0;
  for (let i = 0; i < 3600; i++) {
    const s = performance.now();
    w.step(1 / 60);
    w.events.length = 0;
    worst = Math.max(worst, performance.now() - s);
  }
  const per = (performance.now() - a) / 3600;
  if (m % 10 === 0 || m === 1) {
    const flying = w.aircraft.filter((x) => x.status === 'flying').length;
    const contacts = w.teams.reduce((n, t) => n + t.intel.contacts.size, 0);
    console.log(`${String(m).padStart(3)} dk: adım ${per.toFixed(3)} ms (en kötü ${worst.toFixed(1)}) | uçak ${w.aircraft.length} (havada ${flying}) kol ${w.flights.length} yapı ${w.structures.length} yol ${w.roads.length} mermi ${w.bullets.length} bomba ${w.bombs.length} günlük ${w.logs.length} rapor ${w.missionReports.length} temas ${contacts}`);
  }
}
console.log(`toplam ${Math.round((Date.now() - t0) / 1000)} sn`);
process.exit(0);
