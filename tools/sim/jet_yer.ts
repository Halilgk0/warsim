// Çalıştırma: node tools/sim/calistir.mjs jet_yer [koşu] [uçak] [görev: attack|diveBomb] [yük: bomba|roket|yok] [hedef: mine|aa|radar]
// Jetin yer hedefine isabeti (2026-11-25, oyuncu bildirimi: "geç oyunda jetler bot yapılarına karşı çok isabetsiz"). Kırmızı'nın
// 4 uçağı, savunmasız bir Mavi yapıya (uçaksavarsız) saldırır. Ölçülen: yapının aldığı hasar (azami canın %'si), atılan bomba,
// roket, mermi; isabet (yapıya değen mermi), bombanın hedefe en yakın düştüğü uzaklık. Pervaneliyle karşılaştır.
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { plan, theater } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';
import { SPECS } from '../../src/sim/aircraft/specs';

const RUNS = Number(process.argv[2] ?? 4);
const SPEC = process.argv[3] ?? 'f84g';
const TYPE = (process.argv[4] ?? 'attack') as 'attack' | 'diveBomb';
const LOAD = process.argv[5] ?? 'bomba';
const KIND = (process.argv[6] ?? 'mine') as 'mine' | 'aa' | 'radar';
const lo = SPECS[SPEC].loadouts.find((l) => (LOAD === 'bomba' ? l.bombCount > 0 && !l.rocketCount : LOAD === 'roket' ? l.rocketCount > 0 : !l.bombCount && !l.rocketCount && !l.tankFuel)) ?? SPECS[SPEC].loadouts[0];
let dmgSum = 0;
let killed = 0;
let lost = 0;
const tot = { bomba: 0, roket: 0, mermi: 0, isabet: 0, yakin: 0, yakinN: 0 };
for (let r = 0; r < RUNS; r++) {
  const w = new World();
  const t = theater(w, { forward: false });
  const base = t.blueMain.s.pos;
  const red = t.redMain.s.pos;
  const dir = new Vector3(red.x - base.x, 0, red.z - base.z).normalize();
  const spot = w.findSpot(0, KIND, base.x + dir.x * 9000, base.z + dir.z * 9000, 0, 6000, 3, 0, true);
  const s = w.addStructure(0, KIND, w.structureName(0, KIND), spot!.x, spot!.z, 0, true);
  if (s.aa) s.aa.mounts.length = 0;
  const g = groundLevel(s.pos.x, s.pos.z);
  const start = s.pos.clone().addScaledVector(dir, 30000).setY(g + 3000);
  const fl = w.spawnAirborneFlight(1, SPEC, 4, start, 0, plan(TYPE, SPEC, { targetStructureId: s.id, altitude: g + 3000, loadoutId: lo.id }), t.redMain);
  const ids = new Set(fl.members.map((m) => m.id));
  const spawnRound = w.spawnGunRound.bind(w);
  w.spawnGunRound = (...a: Parameters<typeof w.spawnGunRound>) => { if (ids.has(a[0].id)) tot.mermi++; spawnRound(...a); };
  const hp0 = s.hp;
  let lastHp = s.hp;
  const bombs0 = fl.members.reduce((n, m) => n + m.bombCount, 0);
  const rk0 = fl.members.reduce((n, m) => n + m.rocketCount, 0);
  const seen = new Set<unknown>();
  for (let i = 0; i < 60 * 60 * 20; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    for (const b of w.bombs) {
      if (seen.has(b)) continue;
      // Bomba yere yaklaşınca hedefe uzaklık
      if (b.pos.y - groundLevel(b.pos.x, b.pos.z) < 15) {
        seen.add(b);
        tot.yakin += Math.hypot(b.pos.x - s.pos.x, b.pos.z - s.pos.z);
        tot.yakinN++;
      }
    }
    if (s.hp < lastHp) lastHp = s.hp;
    if (process.env.IZ && r === 0 && i % 30 === 0) {
      const m = fl.members[0];
      if (m && m.status === 'flying' && ['popup', 'dive', 'pullout'].includes(m.brain.attack.phase)) {
        const to = s.pos.clone().sub(m.pos);
        const slant = to.length();
        const err = Math.acos(Math.max(-1, Math.min(1, m.fwd.dot(to.normalize())))) * 57.3;
        console.log(`  ${w.time.toFixed(1)} sn ${m.brain.attack.phase} hız ${Math.round(m.speed)} h ${Math.round(m.pos.y - s.pos.y)} yatay ${Math.round(Math.hypot(m.pos.x - s.pos.x, m.pos.z - s.pos.z))} eğik ${Math.round(slant)} hata ${err.toFixed(1)}° bomba ${m.bombCount} roket ${m.rocketCount} | n ${m.controls.nCmd.toFixed(2)} yatış ${Math.round(Math.atan2(m.upv.x * m.fwd.z - m.upv.z * m.fwd.x, m.upv.y) * 57.3)} yerKaçış ${m.groundAvoid}`);
      }
    }
    if (i % 600 === 0 && (fl.phase === 'rtb' || fl.phase === 'landing' || fl.phase === 'done' || !fl.leader())) break;
  }
  tot.bomba += bombs0 - fl.members.reduce((n, m) => n + m.bombCount, 0);
  tot.roket += rk0 - fl.members.reduce((n, m) => n + m.rocketCount, 0);
  const dmg = (hp0 - Math.max(0, s.hp)) / s.maxHp;
  dmgSum += dmg;
  if (s.destroyed || s.hp <= 0) killed++;
  lost += fl.members.filter((m) => m.status !== 'flying' && m.status !== 'recovered').length;
}
console.log(`${SPEC.padEnd(9)} ${TYPE.padEnd(8)} ${lo.name.padEnd(22)} → ${KIND}: hasar %${Math.round((100 * dmgSum) / RUNS)} (yıkıldı ${killed}/${RUNS}, kayıp ${lost}) | bomba ${tot.bomba} (hedefe ort. ${tot.yakinN ? Math.round(tot.yakin / tot.yakinN) : '-'} m) roket ${tot.roket} mermi ${tot.mermi}`);
process.exit(0);
