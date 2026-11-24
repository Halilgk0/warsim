// Çalıştırma: node tools/sim/calistir.mjs bombaci_donus [uçak] [adet] [irtifa m] [uzaklık km] [koşu]
// Görevden dönen bombardıman kolunun inişi (2026-11-24, oyuncu bildirimi: "bombardıman uçakları inmek için çok uğraşıyor;
// pistin arkasında daire çiziyor, alçalıyor sonra yeniden tırmanıyor"). Kol görev irtifasında, üsten [uzaklık] km ötede
// üsse dönüşe geçer. Ölçülen: inene dek süre, alçaldıktan sonra yeniden 250 m'den fazla tırmanma sayısı, inemeyen.
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { plan, theater } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';

const id = process.argv[2] ?? 'b17g';
const count = Number(process.argv[3] ?? 4);
const alt = Number(process.argv[4] ?? 6000);
const km = Number(process.argv[5] ?? 40);
const runs = Number(process.argv[6] ?? 4);
let landed = 0, stuck = 0, crash = 0, climbs = 0, total = 0, around = 0;
const times: number[] = [];
for (let r = 0; r < runs; r++) {
  const w = new World();
  const t = theater(w, { forward: false });
  const base = t.blueMain;
  const c = base.s.pos;
  const ang = (r / runs) * Math.PI * 2;
  const p = new Vector3(c.x + Math.cos(ang) * km * 1000, 0, c.z + Math.sin(ang) * km * 1000);
  p.y = groundLevel(p.x, p.z) + alt;
  const hdg = (Math.atan2(c.x - p.x, -(c.z - p.z)) * 180) / Math.PI;
  const fl = w.spawnAirborneFlight(0, id, count, p, hdg, plan('levelBomb', id, { targetPos: c.clone().setY(0), altitude: alt }), base);
  fl.setPhase('rtb', w, 'deneme');
  const low = new Map<number, number>();
  const lastUp = new Map<number, number>();
  const done = new Map<number, number>();
  for (let i = 0; i < 60 * 3600; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (i % 60) continue;
    for (const m of fl.members) {
      if (m.status !== 'flying') { if (!done.has(m.id)) done.set(m.id, w.time); continue; }
      const y = m.pos.y;
      const lo = Math.min(low.get(m.id) ?? y, y);
      low.set(m.id, lo);
      if (y - lo > 250) { climbs++; low.set(m.id, y); lastUp.set(m.id, w.time); if (process.env.IZ) console.log(`  ${Math.round(w.time)} sn ${m.callsign} yeniden tırmandı ${Math.round(lo)} → ${Math.round(y)} m, evre ${m.brain.ops.stage} sıra ${m.brain.ops.queue}, ${(Math.hypot(m.pos.x - c.x, m.pos.z - c.z) / 1000).toFixed(1)} km`); }
    }
    if (fl.members.every((m) => m.status !== 'flying')) break;
  }
  around += w.logs.filter((l) => l.text.includes('pas geçti')).length;
  for (const m of fl.members) {
    total++;
    if (m.status === 'recovered') landed++;
    else if (m.status === 'flying') stuck++;
    else crash++;
  }
  times.push(Math.round(Math.max(...fl.members.map((m) => done.get(m.id) ?? w.time)) / 60));
}
console.log(`${id} ×${count}, ${alt} m, ${km} km: ${total} uçak, indi ${landed}, kaza ${crash}, inemedi ${stuck}, yeniden tırmanma ${climbs} (pas geçme ${around}) | son iniş (dk) ${times.join(' ')}`);
process.exit(0);
