// Çalıştırma: node tools/sim/calistir.mjs onleme_donus [koşu]
// Önlemeden sonra kolun ne yaptığı (2026-11-21, oyuncu bildirimi: "kolum önlemeden sonra nedensiz üsse dönüyor"):
// - Senaryo "intercept_bombers": Mavi'nin alarm kolu (2 Spitfire I) ve devriyesi He 111 akınına karşı.
// - Jet: 4 Me 262 kendi üssünden 60 km uzakta önleme yapar (tam gaz, yakıt hızla azalır).
// Kolların evre değişimleri, dönüş nedenleri ve koldan tek başına ayrılan uçaklar (günlükten) yazılır.
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { SCENARIOS, plan, theater } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';
import type { FlightGroup } from '../../src/sim/ai/flightGroup';

const RUNS = Number(process.argv[2] ?? 2);
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function watch(w: World, team: number, secs: number, only?: (f: FlightGroup) => boolean): void {
  const phase = new Map<number, string>();
  let logAt = w.logs.length;
  for (let i = 0; i < secs * 60; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (i % 30) continue;
    for (const f of w.flights) {
      if (f.team !== team || (only && !only(f))) continue;
      const p = `${f.phase}/${f.plan.type}`;
      if (phase.get(f.id) !== p) {
        console.log(`  ${mmss(w.time)} ${f.name} (${f.members[0]?.spec.abbr}) → ${p}${f.phase === 'egress' && f.rtbReason ? ` [${f.rtbReason}]` : ''} uçan ${f.formed.length}/${f.alive.length}`);
        phase.set(f.id, p);
      }
    }
    for (; logAt < w.logs.length; logAt++) {
      const l = w.logs[logAt];
      if (l.team === team && /koldan ayrıl|devriye geziyor|başka düşman yok/.test(l.text)) console.log(`  ${mmss(l.time)} günlük: ${l.text}`);
    }
    if (w.logs.length > 280) logAt = Math.min(logAt, w.logs.length);
  }
}

for (let r = 0; r < RUNS; r++) {
  console.log(`\n== intercept_bombers koşu ${r + 1}`);
  const w = new World();
  SCENARIOS.find((s) => s.id === 'intercept_bombers')!.build(w);
  watch(w, 0, 1500);
}

// Tek bombardıman uçağı kendi üssümüzün yakınında: 2 Spitfire düşürür, sonra bölgede devriye beklenir
for (let r = 0; r < RUNS; r++) {
  console.log(`\n== tek hedef koşu ${r + 1}`);
  const w = new World();
  const t = theater(w, { forward: false });
  const f = t.blueFactory.pos;
  const g = groundLevel(f.x, f.z);
  const lone = w.spawnAirborneFlight(1, 'ju88a4', 1, f.clone().add(new Vector3(15000, 0, 3000)).setY(g + 4000), 270,
    plan('levelBomb', 'ju88a4', { targetStructureId: t.blueFactory.id, altitude: g + 4000 }), t.redMain);
  const sp = w.spawnAirborneFlight(0, 'spitfire1', 2, f.clone().add(new Vector3(3000, 0, -3000)).setY(g + 4200), 90,
    plan('intercept', 'spitfire1', { targetAircraftId: lone.members[0].id, altitude: g + 4200 }), t.blueMain);
  sp.initTrack(w);
  watch(w, 0, 900, (x) => x === sp);
}

for (let r = 0; r < RUNS; r++) {
  console.log(`\n== jet önleme koşu ${r + 1}`);
  const w = new World();
  const t = theater(w, { forward: false });
  const home = t.redMain.s.pos;
  const g = groundLevel(home.x, home.z);
  const far = home.clone().add(new Vector3(-60000, 0, 0));
  // Az yakıtla (yakıtı farklı azalan üyeler) arka taretsiz Mosquito'lara karşı: yakıtı biten tek başına dönmeli, kalanlar sürmeli
  const bombers = w.spawnAirborneFlight(0, 'mosquito', 6, far.clone().add(new Vector3(-20000, 0, 0)).setY(g + 5000), 90,
    plan('levelBomb', 'mosquito', { targetStructureId: t.redFactory.id, altitude: g + 5000 }), t.blueMain);
  const jets = w.spawnAirborneFlight(1, 'me262', 4, far.clone().setY(g + 5000), 270,
    plan('intercept', 'me262', { targetAircraftId: bombers.members[0].id, altitude: g + 5000 }), t.redMain);
  jets.members.forEach((m, i) => { m.fuel = m.fuelCap * (0.22 + i * 0.1); });
  jets.initTrack(w);
  watch(w, 1, 1500, (f) => f === jets);
}
