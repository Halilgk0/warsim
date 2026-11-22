// Çalıştırma: node tools/sim/calistir.mjs jet_donus [koşu] [irtifa m] [uçak sayısı] [dakika]
// Canberra yatay bombardıman: hedefe gidiş, bombalama, dönüş ve iniş. Her 30 sn'de durum; iniş ya da düşüş olunca biter.
//   node canberra.mjs [koşu] [irtifa m] [uçak sayısı]
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { theater, plan } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';

const RUNS = Number(process.argv[2] ?? 1);
const ALT = Number(process.argv[3] ?? 11000);
const N = Number(process.argv[4] ?? 2);
for (let r = 0; r < RUNS; r++) {
  const w = new World();
  const t = theater(w, { forward: false, redTech: ['hd_20'] });
  const f = t.redFactory.pos;
  const g = groundLevel(f.x, f.z);
  // Kendi ana üsten kalkış yerine havada başlat: hedefe 60 km
  const start = f.clone().add(new Vector3(-60000, 0, -3000)).setY(g + ALT);
  const fl = w.spawnAirborneFlight(0, 'canberra', N, start, 85, plan('levelBomb', 'canberra', { targetStructureId: t.redFactory.id, altitude: g + ALT }), t.blueMain);
  const base = t.blueMain.s;
  let lastLog = -999;
  let landed = 0;
  console.log(`== koşu ${r + 1}, irtifa ${ALT}, üs ${base.name} (${Math.round(base.pos.x)}, ${Math.round(base.pos.z)})`);
  for (let i = 0; i < 60 * 60 * (Number(process.argv[5] ?? 120)); i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (w.time - lastLog >= 60) {
      lastLog = w.time;
      for (const m of fl.members) {
        const d = Math.hypot(m.pos.x - base.pos.x, m.pos.z - base.pos.z);
        const ops = m.brain.ops;
        const c = m.brain.cmd;
        if (fl.phase === 'landing') console.log(`   cmd.dir(${c.dir.x.toFixed(2)},${c.dir.y.toFixed(2)},${c.dir.z.toFixed(2)}) hız ${c.speed?.toFixed(0)} gaz ${c.throttle?.toFixed?.(2)} maxG ${c.maxG} | n ${m.n.toFixed(2)} yatış ${m.roll?.toFixed?.(0) ?? ''} stall ${m.vStall?.toFixed?.(0) ?? ''} holdR ${m.brain.ops.style?.holdR.toFixed(0)} holdSpeedK ${m.brain.ops.style?.holdSpeedK.toFixed(2)} cruiseSpeed ${m.spec.cruiseSpeed.toFixed(0)}`);
        console.log(`${(w.time / 60).toFixed(0).padStart(3)} dk ${m.callsign} ${m.status.padEnd(9)} faz ${fl.phase.padEnd(7)} y ${Math.round(m.pos.y).toString().padStart(6)} m  üsse ${(d / 1000).toFixed(1).padStart(5)} km  ${Math.round(m.speed * 3.6)} km/sa  yakıt ${Math.round(m.fuel)}  ops ${ops.mode}/${ops.stage} sıra ${ops.queue} | ${m.brain.status}`);
      }
    }
    landed = fl.members.filter((m) => m.status === 'landed' || m.status === 'hangar' || !m.alive).length;
    if (fl.members.every((m) => !m.airborne)) break;
  }
  console.log('son durum:', fl.members.map((m) => `${m.callsign}:${m.status}`).join(' '), 'faz', fl.phase);
}
