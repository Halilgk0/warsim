// Çalıştırma: node tools/sim/calistir.mjs inis_pas <uçak> ...
// Pas geçme: uçak son yaklaşmada zorla pas geçirilir; tırmanış ve dönüşte yükseklik izlenir. node pas.mjs <uçak> <koşu>
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { theater, plan } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';
import { gearHeight, stallSpeed, approachSpeed } from '../../src/sim/aircraft/flightModel';

const id = process.argv[2] ?? 'a26b';
const runs = Number(process.argv[3] ?? 8);
const where = process.argv[4] ?? '700';
const rows: string[] = [];
for (let r = 0; r < runs; r++) {
  const w = new World();
  const t = theater(w, { forward: false });
  const base = t.blueMain;
  const hold = base.holdAltitude(0);
  const c = base.s.pos;
  // Uçak hangarda değil, havada: üsse 9 km uzakta, bekleme irtifasında
  const y0 = process.env.ALT ? groundLevel(c.x + 9000, c.z + 3000) + Number(process.env.ALT) : hold;
  const fl = w.spawnAirborneFlight(0, id, 1, new Vector3(c.x + 9000, y0, c.z + 3000), 270, plan('cap', id, { targetPos: c.clone(), altitude: hold }), base);
  const ac = fl.members[0];
  ac.brain.beginLanding(base);
  const ops = ac.brain.ops;
  const rwyY = () => base.touchdownPoint(new Vector3()).y + gearHeight(ac.spec);
  let forced = false;
  let t0 = -1;
  let peak = -1e9, peakT = 0, dropMax = 0, dropAt = '', minAglAfterPeak = 1e9;
  let stageAt = '';
  let natural = 0;
  const trace: string[] = [];
  for (let i = 0; i < 60 * 1500; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (ac.status !== 'flying') break;
    const st = ops.stage;
    if (process.env.NOFORCE && t0 < 0) t0 = w.time;
    if (!forced && !process.env.NOFORCE && st === 'final') {
      const td = base.touchdownPoint(new Vector3());
      const along = (ac.pos.x - td.x) * base.dirX * base.approach().sign + (ac.pos.z - td.z) * base.dirZ * base.approach().sign;
      if (along > -Number(where)) {
        forced = true;
        ops.stage = 'missed';
        ops.goArounds++;
        base.cancelLanding(ac.id);
        ops.queue = 99;
        t0 = w.time;
      }
    }
    if (st === 'missed' && !forced) natural++;
    if (t0 >= 0 && (st === 'missed' || (st === 'hold' && w.time - t0 < 200))) {
      const agl = ac.pos.y - rwyY();
      if (agl > peak) { peak = agl; peakT = w.time - t0; minAglAfterPeak = agl; }
      if (agl < minAglAfterPeak) {
        minAglAfterPeak = agl;
        if (peak - agl > dropMax) { dropMax = peak - agl; dropAt = `${(w.time - t0).toFixed(0)} s, ${st}, hız ${Math.round(ac.speed)} (tutunma flapsız ${Math.round(stallSpeed(ac))} / flaplı ${Math.round(stallSpeed(ac, true))}), yatış ${Math.round(ac.bankDeg)}°`; }
      }
      if (st !== stageAt) { stageAt = st; }
      if (i % 120 === 0) trace.push(`${(w.time - t0).toFixed(0)}:${st[0]}${Math.round(agl)}/${Math.round(ac.speed)}/${Math.round(ac.bankDeg)}`);
    }
    if (process.env.DIAG && t0 >= 0 && w.time - t0 > Number(process.env.D0 ?? 250) && w.time - t0 < Number(process.env.D1 ?? 420) && i % Number(process.env.DS ?? 300) === 0 && ops.style) {
      const p = base.approach();
      const stl = ops.style;
      const glide = p.glideTan * (p.margin < 40 ? Math.max(stl.glideK, 1) : stl.glideK);
      const iafAgl = p.finalDist * stl.finalK * glide;
      const vApp = approachSpeed(ac) * stl.speedK;
      console.log(`  r${r} ${Math.round(w.time - t0)} s ${st} agl ${Math.round(ac.pos.y - rwyY())} yer ${Math.round(ac.pos.y - groundLevel(ac.pos.x, ac.pos.z))} iaf ${Math.round(iafAgl)} hız ${ac.speed.toFixed(1)} hedef ${(vApp * 1.25).toFixed(1)} 1.3vs ${(1.3 * stallSpeed(ac)).toFixed(1)} gaz ${ac.controls.throttle.toFixed(2)} flap ${ac.controls.flaps} burun ${ac.fwd.y.toFixed(3)} yatış ${Math.round(ac.bankDeg)} | ${ac.brain.status}`);
    }
    if (t0 >= 0 && w.time - t0 > 200 && !process.env.SON) break;
  }
  const crash = w.logs.filter((l) => /çakıldı|iniş kazası|denize düştü/.test(l.text)).length;
  if (crash) console.log('KAZA:', w.logs.filter((l) => l.text.includes(ac.callsign)).slice(-4).map((l) => l.text).join(' / '));
  const fin = `${ac.status}${ac.onGround ? ' yerde' : ''} [${ops.stage} q${ops.queue} ${ac.brain.status} agl ${Math.round(ac.pos.y - rwyY())}] ${t0 >= 0 ? Math.round(w.time - t0) : -1} s, pas ${ops.goArounds}, kaza ${crash}`;
  rows.push(`#${r} ${fin} | tepe ${Math.round(peak)} m (${peakT.toFixed(0)} s) | tepeden en çok düşüş ${Math.round(dropMax)} m @ ${dropAt}`);
  if (r < 2 && !process.env.SON) rows.push('   ' + trace.join(' '));
}
console.log(id, 'bekleme irtifası', '\n' + rows.join('\n'));
process.exit(0);
