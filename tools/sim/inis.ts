// Çalıştırma: node tools/sim/calistir.mjs inis <uçak> <adet> <yok|motor|kanat|kumanda|hepsi|yara> <koşu> [düşman]
// Hasarlı ve kalabalık iniş: node inis.mjs <uçak> <adet> <hasar: yok|motor|kanat|kumanda|hepsi|yara> <koşu> [düşman]
// Uçaklar üsse 9 km'de, bekleme irtifasında, aynı anda inişe başlar. "düşman": üssün üstünde 4 Bf 109 devriyede.
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { theater, plan, sweep } from '../../src/sim/scenarios';

const id = process.argv[2] ?? 'b17g';
const count = Number(process.argv[3] ?? 1);
const dmg = process.argv[4] ?? 'yok';
const runs = Number(process.argv[5] ?? 6);
const enemy = process.argv[6] === 'düşman';
let landed = 0, crash = 0, shot = 0, stuck = 0, total = 0;
const times: number[] = [];
const notes: string[] = [];
for (let r = 0; r < runs; r++) {
  const w = new World();
  const t = theater(w, { forward: false });
  const base = t.blueMain;
  const c = base.s.pos;
  const hold = base.holdAltitude(0);
  const fl = w.spawnAirborneFlight(0, id, count, new Vector3(c.x + 9000, hold, c.z + 3000 + r * 300), 270, plan('cap', id, { targetPos: c.clone(), altitude: hold }), base);
  if (enemy) w.spawnAirborneFlight(1, 'bf109e', 4, new Vector3(c.x - 6000, hold + 1500, c.z), 90, plan('sweep', 'bf109e', sweep(c.clone(), hold + 1500, 6000)), t.redMain);
  for (const ac of fl.members) {
    const d = ac.damage;
    if (dmg === 'motor' || dmg === 'hepsi') d.engines[0] = 1;
    if (dmg === 'kanat' || dmg === 'hepsi') d.wings = 0.55;
    if (dmg === 'kumanda' || dmg === 'hepsi') d.controls = 0.55;
    if (dmg === 'yara') d.pilot = 1;
    ac.brain.beginLanding(base);
  }
  for (let i = 0; i < 60 * 1500; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (fl.members.every((m) => m.status !== 'flying')) break;
  }
  for (const m of fl.members) {
    total++;
    const logs = w.logs.filter((l) => l.text.includes(m.callsign));
    if (m.status === 'recovered') { landed++; continue; }
    if (logs.some((l) => l.cat === 'kill')) { shot++; continue; }
    if (m.status === 'flying') { stuck++; notes.push(`${m.callsign} inemedi: ${m.brain.ops.stage} ${m.brain.status}`); continue; }
    crash++;
    notes.push(`${m.callsign}: ${logs.slice(-2).map((l) => l.text).join(' / ')} [${m.brain.ops.stage}]`);
  }
  times.push(Math.round(w.time));
}
console.log(`${id} ×${count} hasar ${dmg}${enemy ? ' düşmanlı' : ''}: ${total} uçak, indi ${landed}, kaza ${crash}, düşürüldü ${shot}, inemedi ${stuck} | süre ${times.join(' ')}`);
for (const n of notes.slice(0, 8)) console.log('  ' + n);
process.exit(0);
