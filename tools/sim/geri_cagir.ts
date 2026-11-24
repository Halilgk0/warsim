// Çalıştırma: node tools/sim/calistir.mjs geri_cagir [koşu] [bizim] [düşman] [çağırma sn]
// Dövüşteki avcıyı geri çağırma (2026-11-24, oyuncu bildirimi: "geri çağırdığım Spitfire'lar Mustang'leri kovalamaya devam
// ediyor, haritanın dışına kadar gidiyorlar"). Mavi 4 avcı ile Kırmızı 4 avcı karşılaşır; dövüş başladıktan [çağırma sn]
// sonra Mavi kol oyuncunun "Üsse dön" emriyle geri çağrılır (game.recallFlight ile aynı). Ölçülen: emirden sonra kaç uçağın
// hâlâ hedefi var, ne zamana kadar; emirden sonra üsse uzaklığın en çok ne kadar arttığı; üsse yönelme süresi.
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { plan, theater } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';

const RUNS = Number(process.argv[2] ?? 6);
const OURS = process.argv[3] ?? 'spitfire9';
const THEIRS = process.argv[4] ?? 'p51d';
const RECALL = Number(process.argv[5] ?? 45);
let sumChase = 0;
let sumGrow = 0;
let stuck = 0;
let sumLost = 0;
for (let r = 0; r < RUNS; r++) {
  const w = new World();
  const t = theater(w, { forward: false });
  const base = t.blueMain.s.pos;
  const red = t.redMain.s.pos;
  const dir = new Vector3(red.x - base.x, 0, red.z - base.z).normalize();
  const mid = base.clone().addScaledVector(dir, 30000);
  const g = groundLevel(mid.x, mid.z);
  const hdg = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
  const blue = w.spawnAirborneFlight(0, OURS, 4, mid.clone().addScaledVector(dir, -6000).setY(g + 4000), hdg, plan('sweep', OURS, { targetPos: mid.clone().setY(0), altitude: g + 4000 }), t.blueMain);
  w.spawnAirborneFlight(1, THEIRS, 4, mid.clone().addScaledVector(dir, 6000).setY(g + 4300), hdg + 180, plan('sweep', THEIRS, { targetPos: mid.clone().setY(0), altitude: g + 4300 }), t.redMain);
  let fightAt = -1;
  let recallAt = -1;
  let lastTarget = -1;
  let d0 = 0;
  let n0 = 0;
  let dEnd = 0;
  let dMax = 0;
  for (let i = 0; i < 60 * 60 * 12; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (i % 30) continue;
    const alive = blue.members.filter((m) => m.status === 'flying' && m.airborne);
    if (!alive.length) break;
    const anyTarget = alive.some((m) => m.brain.target);
    if (fightAt < 0 && anyTarget) fightAt = w.time;
    if (fightAt > 0 && recallAt < 0 && w.time - fightAt > RECALL) {
      // game.recallFlight
      blue.rtbReason = 'komuta emri';
      blue.stats.recalled = true;
      blue.setPhase('egress', w, 'komuta emri');
      recallAt = w.time;
      n0 = alive.length;
      d0 = Math.max(...alive.map((m) => Math.hypot(m.pos.x - base.x, m.pos.z - base.z)));
    }
    if (recallAt > 0) {
      if (anyTarget) lastTarget = w.time;
      if (process.env.IZ && Math.round(w.time - recallAt) % 30 === 0) console.log(`  +${Math.round(w.time - recallAt)} sn: evre ${blue.phase}, engaged ${blue.engaged}, ` + alive.map((m) => { const e = m.brain.target; return e ? `${m.callsign}→${e.callsign}(${(m.pos.distanceTo(e.pos) / 1000).toFixed(1)} km${e.brain.target && blue.members.includes(e.brain.target) ? ', bize saldırıyor' : ''}${blue.assigned.has(m.id) ? '' : ', atanmamış'})` : `${m.callsign}: -`; }).join(' '));
      const d = Math.max(...alive.map((m) => Math.hypot(m.pos.x - base.x, m.pos.z - base.z)));
      dMax = Math.max(dMax, d);
      dEnd = Math.min(...alive.map((m) => Math.hypot(m.pos.x - base.x, m.pos.z - base.z)));
      if (w.time - recallAt > 300) break;
    }
  }
  if (recallAt < 0) {
    console.log(`koşu ${r + 1}: dövüş olmadı`);
    continue;
  }
  const chase = lastTarget > 0 ? lastTarget - recallAt : 0;
  const nEnd = blue.members.filter((m) => m.status !== 'destroyed' && m.status !== 'crashed').length;
  sumLost += n0 - nEnd;
  const grow = (dMax - d0) / 1000;
  sumChase += chase;
  sumGrow += grow;
  if (chase > 60) stuck++;
  console.log(`koşu ${r + 1}: emirden sonra hedefle dövüş ${chase.toFixed(0)} sn, üsten uzaklaşma en çok +${grow.toFixed(1)} km (emirde ${(d0 / 1000).toFixed(1)} km), emirden sonra kayıp ${n0 - nEnd}/${n0}, 5 dk sonra üsse ${(dEnd / 1000).toFixed(1)} km`);
}
console.log(`\nortalama: emirden sonra dövüş ${(sumChase / RUNS).toFixed(0)} sn, uzaklaşma +${(sumGrow / RUNS).toFixed(1)} km; 60 sn'den uzun süren ${stuck}/${RUNS}; emirden sonra ortalama kayıp ${(sumLost / RUNS).toFixed(2)}`);
