// Çalıştırma: node tools/sim/calistir.mjs ucaksavar_daire [koşu]
// Uçaksavardan kaçınırken daire (2026-11-21, oyuncu bildirimi: "düşman uçakları uçaksavardan kaçmaya çalışırken daire
// çiziyor"). Kırmızı'nın 6 He 111'i Mavi fabrikayı bombalamaya gider; fabrikayı 5–7 km öteden ağır toplar (8,8 cm)
// korur: hedef bataryaların menzili içinde kalır. Ölçülen: hedefe en yakın geçiş, bomba bırakıldı mı ve ne zaman,
// liderin toplam dönüşü (derece; dosdoğru gidip dönen kol ~400°, daire çizen binlerce).
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { plan, theater } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';
import type { AAWeaponId } from '../../src/sim/structures/airDefense';

const RUNS = Number(process.argv[2] ?? 4);
const SPEC = process.argv[3] ?? 'he111';
const TYPE = (process.argv[4] ?? 'levelBomb') as 'levelBomb' | 'diveBomb' | 'attack';
let reached = 0;
let released = 0;
let turnSum = 0;
let relSum = 0;
for (let r = 0; r < RUNS; r++) {
  const w = new World();
  const t = theater(w, { forward: false });
  const f = t.blueFactory.pos;
  const red = t.redMain.s.pos;
  const toRed = new Vector3(red.x - f.x, 0, red.z - f.z).normalize();
  const side = new Vector3(-toRed.z, 0, toRed.x);
  const gun = (x: number, z: number, weapons: AAWeaponId[]) => {
    const s = w.addStructure(0, 'aa', w.structureName(0, 'aa'), x, z, 0);
    s.aa!.mounts.length = 0;
    for (const id of weapons) s.aa!.addMount(id);
    s.aa!.sensors.add('rangefinder');
  };
  // Akının geleceği yönde ve iki yanda ağır toplar (hedefin 5–7 km ötesinde: eski kuralda "hedefin dibinde" sayılmıyordu)
  gun(f.x + toRed.x * 6000, f.z + toRed.z * 6000, ['aa88', 'aa88']);
  gun(f.x + side.x * 5500 + toRed.x * 2000, f.z + side.z * 5500 + toRed.z * 2000, ['aa88', 'aa88']);
  gun(f.x - side.x * 6500 + toRed.x * 1500, f.z - side.z * 6500 + toRed.z * 1500, ['aa88', 'aa88']);
  const g = groundLevel(f.x, f.z);
  const start = f.clone().addScaledVector(toRed, 45000).setY(g + 4500);
  const fl = w.spawnAirborneFlight(1, SPEC, 6, start, 0, plan(TYPE, SPEC, { targetStructureId: t.blueFactory.id, altitude: g + (TYPE === 'levelBomb' ? 4500 : 3000) }), t.redMain);
  let closest = Infinity;
  let relAt = -1;
  let turn = 0;
  let lastHead: number | null = null;
  let outAt = -1;
  let turnAfter = 0;
  const bombs0 = fl.members.reduce((s, m) => s + m.bombCount, 0);
  for (let i = 0; i < 60 * 60 * 25; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (i % 30) continue;
    const lead = fl.leader();
    if (!lead) break;
    closest = Math.min(closest, Math.hypot(lead.pos.x - f.x, lead.pos.z - f.z));
    const head = Math.atan2(lead.fwd.x, lead.fwd.z);
    if (lastHead !== null) {
      let d = head - lastHead;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      turn += Math.abs(d);
      if (relAt > 0 && outAt < 0) turnAfter += Math.abs(d);
    }
    lastHead = head;
    const bombs = fl.members.reduce((s, m) => s + m.bombCount, 0);
    if (relAt < 0 && bombs < bombs0) relAt = w.time;
    // Çıkış: bombadan sonra hedeften 15 km uzaklaşma süresi (takılırsa en çok 12 dk)
    if (relAt > 0 && outAt < 0 && Math.hypot(lead.pos.x - f.x, lead.pos.z - f.z) > 15000) outAt = w.time;
    if (relAt > 0 && (outAt > 0 || w.time > relAt + 720)) break;
  }
  const deg = Math.round((turn * 180) / Math.PI);
  const out = relAt > 0 ? (outAt > 0 ? `${((outAt - relAt) / 60).toFixed(1)} dk'da 15 km dışında` : '12 dk sonra hâlâ hedefin yakınında') : '';
  console.log(`koşu ${r + 1}: en yakın ${(closest / 1000).toFixed(1)} km, bomba ${relAt > 0 ? `${(relAt / 60).toFixed(1)}. dk` : 'YOK'}, dönüş ${deg}° (bombadan sonra ${Math.round((turnAfter * 180) / Math.PI)}°), ${out}`);
  if (closest < 3000) reached++;
  if (relAt > 0) {
    released++;
    relSum += relAt;
  }
  turnSum += deg;
}
console.log(`\nhedefe vardı ${reached}/${RUNS}, bombaladı ${released}/${RUNS}${released ? ` (ortalama ${(relSum / released / 60).toFixed(1)}. dk)` : ''}, ortalama dönüş ${Math.round(turnSum / RUNS)}°`);
