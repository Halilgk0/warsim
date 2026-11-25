// Çalıştırma: node tools/sim/calistir.mjs harita_kenari [uçak]
// Görünmez duvar (2026-11-25): haritanın kenarına doğru giden kol (rota noktası haritanın dışında) kenarı en çok ne kadar
// aşıyor, geri dönüyor mu. Dört yöne birer kol, 300 km haritada (senaryo haritası).
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { plan, theater } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';
import { MAP_HALF } from '../../src/sim/mapData';

const KIND = process.argv[2] ?? 'p51d';
const dirs: [number, number, string][] = [[1, 0, 'doğu'], [-1, 0, 'batı'], [0, 1, 'güney'], [0, -1, 'kuzey']];
for (const [dx, dz, name] of dirs) {
  const w = new World();
  const t = theater(w, { forward: false });
  const start = new Vector3(dx * (MAP_HALF - 15000), 0, dz * (MAP_HALF - 15000));
  const g = groundLevel(start.x, start.z);
  const target = new Vector3(dx * (MAP_HALF + 60000), 0, dz * (MAP_HALF + 60000));
  const hdg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const fl = w.spawnAirborneFlight(0, KIND, 2, start.setY(g + 3000), hdg, plan('sweep', KIND, { targetPos: target, altitude: g + 3000 }), t.blueMain);
  let over = 0;
  let back = -1;
  let crashed = 0;
  for (let i = 0; i < 60 * 60 * 8; i++) {
    w.step(1 / 60);
    w.events.length = 0;
    if (i % 30) continue;
    for (const m of fl.members) {
      if (m.status !== 'flying') continue;
      const out = Math.max(Math.abs(m.pos.x), Math.abs(m.pos.z)) - MAP_HALF;
      over = Math.max(over, out);
      if (over > 0 && out < -5000 && back < 0) back = w.time;
    }
  }
  crashed = fl.members.filter((m) => m.status !== 'flying' && m.status !== 'landed').length;
  console.log(`${name}: kenarı en çok ${(over / 1000).toFixed(1)} km aştı, içeri dönüş ${back < 0 ? 'yok' : Math.round(back) + ' sn'}, kayıp ${crashed}, evre ${fl.phase}`);
}
