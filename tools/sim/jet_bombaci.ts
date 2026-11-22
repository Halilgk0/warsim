// Çalıştırma: node tools/sim/calistir.mjs jet_bombaci [koşu] [jet] [bombardıman] [adet]
// Jet savunmalı bombardıman uçağına (2026-11-21): 4 jet eskortsuz bombardıman koluna saldırır (8 dk). Ölçülen: düşen ve
// ağır hasarlı bombardıman, ağır hasar alan ve düşen jet, jetin attığı mermi. Eski kural (dalıp geçme yalnız saniyede ≥60
// mermi atan kutuya) için `combat.ts` `jetSlashes`'ı eski koddan al (worktree).
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { plan, theater } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';
import { isCrippled } from '../../src/sim/aircraft/damage';

const RUNS = Number(process.argv[2] ?? 8);
const JET = process.argv[3] ?? 'me262';
const BOMB = process.argv[4] ?? 'he111';
const N = Number(process.argv[5] ?? 6);
let bDown = 0;
let bHurt = 0;
let jHurt = 0;
let jDown = 0;
let shots = 0;
for (let r = 0; r < RUNS; r++) {
  const w = new World();
  const t = theater(w, { forward: false });
  const f = t.redFactory.pos;
  const g = groundLevel(f.x, f.z);
  const start = f.clone().add(new Vector3(-50000, 0, 0)).setY(g + 5000);
  const bombers = w.spawnAirborneFlight(0, BOMB, N, start, 90, plan('levelBomb', BOMB, { targetStructureId: t.redFactory.id, altitude: g + 5000 }), t.blueMain);
  const jets = w.spawnAirborneFlight(1, JET, 4, start.clone().add(new Vector3(9000, 600, 2500)), 270,
    plan('intercept', JET, { targetAircraftId: bombers.members[0].id, altitude: g + 5500 }), t.redMain);
  jets.initTrack(w);
  const fire = w.spawnGunRound.bind(w);
  w.spawnGunRound = (...a: Parameters<typeof w.spawnGunRound>) => {
    if (a[0].team === 1) shots++;
    fire(...a);
  };
  const hurt = new Set<number>();
  for (let i = 0; i < 60 * 60 * 8; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (i % 60) continue;
    for (const j of jets.members) if (j.status === 'flying' && isCrippled(j)) hurt.add(j.id);
  }
  const bd = bombers.members.filter((m) => m.status !== 'flying' && m.status !== 'recovered').length;
  bDown += bd;
  bHurt += bombers.members.filter((m) => m.status === 'flying' && isCrippled(m)).length;
  jDown += jets.members.filter((m) => m.status !== 'flying' && m.status !== 'recovered').length;
  jHurt += hurt.size;
}
const k = (x: number) => (x / RUNS).toFixed(2);
console.log(`${JET} ×4 → ${BOMB} ×${N}: düşen bombardıman ${k(bDown)}, ağır hasarlı ${k(bHurt)} | ağır hasar alan jet ${k(jHurt)}, düşen jet ${k(jDown)} | jet mermisi ${k(shots)} (koşu başına, ${RUNS} koşu)`);
