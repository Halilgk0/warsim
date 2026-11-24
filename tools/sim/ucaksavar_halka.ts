// Çalıştırma: node tools/sim/calistir.mjs ucaksavar_halka [koşu] [uçak] [görev] [halka yarıçapı m] [batarya sayısı]
// Üssü saran ağır uçaksavar halkası (2026-11-24, oyuncu bildirimi: "bir üssü çok ağır uçaksavar sarınca uçaklar düşene ya da
// geri dönene dek sarmal çiziyor"). Kırmızı'nın 6 uçağı Mavi ana üssü vurmaya gider; üssü halka hâlinde 8 batarya (her biri
// iki 8,8 cm) sarar. Halka hedefin menzili dışında (hedefi menziline almayan batarya dolanılır), akın halkayı geçmek zorunda.
// Ölçülen: hedefe en yakın geçiş, bomba bırakıldı mı ve ne zaman, liderin toplam dönüşü, kayıp.
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { plan, theater } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';

const RUNS = Number(process.argv[2] ?? 3);
const SPEC = process.argv[3] ?? 'he111';
const TYPE = (process.argv[4] ?? 'levelBomb') as 'levelBomb' | 'diveBomb' | 'attack';
const RING = Number(process.argv[5] ?? 13000);
const COUNT = Number(process.argv[6] ?? 8);
let reached = 0;
let released = 0;
let turnSum = 0;
let lostSum = 0;
for (let r = 0; r < RUNS; r++) {
  const w = new World();
  const t = theater(w, { forward: false });
  const base = t.blueMain.s;
  const f = base.pos;
  const red = t.redMain.s.pos;
  const toRed = new Vector3(red.x - f.x, 0, red.z - f.z).normalize();
  const a0 = Math.atan2(toRed.z, toRed.x) + Math.PI / COUNT;
  for (let k = 0; k < COUNT; k++) {
    const a = a0 + (k * 2 * Math.PI) / COUNT;
    const s = w.addStructure(0, 'aa', w.structureName(0, 'aa'), f.x + Math.cos(a) * RING, f.z + Math.sin(a) * RING, 0);
    s.aa!.mounts.length = 0;
    s.aa!.addMount('aa88');
    s.aa!.addMount('aa88');
    s.aa!.sensors.add('rangefinder');
  }
  const g = groundLevel(f.x, f.z);
  const start = f.clone().addScaledVector(toRed, 45000).setY(g + 4500);
  const fl = w.spawnAirborneFlight(1, SPEC, 6, start, 0, plan(TYPE, SPEC, { targetStructureId: base.id, altitude: g + (TYPE === 'levelBomb' ? 4500 : 3000) }), t.redMain);
  const ids = fl.members.map((m) => m.id);
  let closest = Infinity;
  let relAt = -1;
  let turn = 0;
  let lastHead: number | null = null;
  const bombs0 = fl.members.reduce((s, m) => s + m.bombCount, 0);
  let end = 'süre doldu';
  for (let i = 0; i < 60 * 60 * 25; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (i % 30) continue;
    const lead = fl.leader();
    if (!lead) {
      end = 'kol yok oldu';
      break;
    }
    closest = Math.min(closest, Math.hypot(lead.pos.x - f.x, lead.pos.z - f.z));
    if (process.env.IZ && i % 3600 === 0) console.log(`  ${(w.time / 60).toFixed(0)} dk: ${(Math.hypot(lead.pos.x - f.x, lead.pos.z - f.z) / 1000).toFixed(1)} km, evre ${fl.phase}, ${lead.brain.status}, dolanma ${lead.aaAvoidSince >= 0 ? Math.round(w.time - lead.aaAvoidSince) + ' sn' : '-'}, baskı ${w.time < lead.aaPressUntil ? 'evet' : 'hayır'}`);
    const head = Math.atan2(lead.fwd.x, lead.fwd.z);
    if (lastHead !== null) {
      let d = head - lastHead;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      turn += Math.abs(d);
    }
    lastHead = head;
    const bombs = fl.members.reduce((s, m) => s + m.bombCount, 0);
    if (relAt < 0 && bombs < bombs0) relAt = w.time;
    if (relAt > 0 && w.time > relAt + 120) {
      end = 'bombaladı';
      break;
    }
    if (fl.phase === 'egress' && relAt < 0) {
      end = `bombalamadan dönüşte (${fl.rtbReason ?? '?'})`;
      break;
    }
  }
  const alive = ids.filter((id) => {
    const a = w.aircraftById(id);
    return a && a.status !== 'destroyed' && a.status !== 'crashed';
  }).length;
  const lost = ids.length - alive;
  const deg = Math.round((turn * 180) / Math.PI);
  console.log(`koşu ${r + 1}: en yakın ${(closest / 1000).toFixed(1)} km, bomba ${relAt > 0 ? `${(relAt / 60).toFixed(1)}. dk` : 'YOK'}, dönüş ${deg}°, kayıp ${lost}/6, ${end} (${(w.time / 60).toFixed(1)} dk)`);
  if (closest < 3000) reached++;
  if (relAt > 0) released++;
  turnSum += deg;
  lostSum += lost;
}
console.log(`\nhedefe vardı ${reached}/${RUNS}, bombaladı ${released}/${RUNS}, ortalama dönüş ${Math.round(turnSum / RUNS)}°, ortalama kayıp ${(lostSum / RUNS).toFixed(1)}/6`);
