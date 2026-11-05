// Çalıştırma: npm run sim:flak -- [koşu] [durumlar] [top sayısı]   (ör. npm run sim:flak -- 8 agir88,pike40 8)
// Uçaksavar karnesi: avcısız hedefe karşı atılan mermi, düşürme ve düşürme başına mermi. Silah verisi değişince öncesini ve
// sonrasını karşılaştır. Oyunun gerçek görev yapay zekâsı uçar (rota kaçınma, flak altında zikzak, bombalama koşusu).
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { plan, theater } from '../../src/sim/scenarios';
import { groundLevel } from '../../src/sim/terrain';
import type { AASensorId, AAWeaponId } from '../../src/sim/structures/airDefense';
import type { MissionType } from '../../src/sim/ai/missions';

interface Case {
  id: string;
  guns: AAWeaponId;
  sensors: AASensorId[];
  spec: string;
  n: number;
  type: MissionType;
  /** Hedefin üstünde görev irtifası (m). */
  alt: number;
  secs: number;
  low?: boolean;
}

const COUNT = Number(process.argv[4] ?? 6);
const CASES: Case[] = [
  { id: 'agir88', guns: 'aa88', sensors: ['rangefinder', 'predictor'], spec: 'b17g', n: 12, type: 'levelBomb', alt: 6500, secs: 420 },
  { id: 'agir88r', guns: 'aa88', sensors: ['rangefinder', 'predictor', 'gunRadar', 'proximity'], spec: 'b17g', n: 12, type: 'levelBomb', alt: 6500, secs: 420 },
  { id: 'agir90', guns: 'aa90', sensors: ['rangefinder', 'predictor'], spec: 'b17g', n: 12, type: 'levelBomb', alt: 6500, secs: 420 },
  { id: 'agir41', guns: 'aa41', sensors: ['rangefinder', 'predictor'], spec: 'b17g', n: 12, type: 'levelBomb', alt: 6500, secs: 420 },
  { id: 'he90', guns: 'aa90', sensors: ['rangefinder'], spec: 'he111', n: 8, type: 'levelBomb', alt: 4000, secs: 420 },
  { id: 'he41', guns: 'aa41', sensors: ['rangefinder'], spec: 'he111', n: 8, type: 'levelBomb', alt: 4000, secs: 420 },
  { id: 'taarruzO', guns: 'oerlikon', sensors: [], spec: 'il2m3', n: 8, type: 'attack', alt: 110, secs: 300, low: true },
  { id: 'agir128', guns: 'aa128', sensors: ['rangefinder', 'predictor', 'gunRadar'], spec: 'b17g', n: 12, type: 'levelBomb', alt: 6500, secs: 420 },
  { id: 'he88', guns: 'aa88', sensors: ['rangefinder'], spec: 'he111', n: 8, type: 'levelBomb', alt: 4000, secs: 420 },
  { id: 'pike37', guns: 'aa37', sensors: ['rangefinder'], spec: 'ju87b', n: 8, type: 'diveBomb', alt: 3600, secs: 480 },
  { id: 'pike40', guns: 'aa40', sensors: ['rangefinder'], spec: 'ju87b', n: 8, type: 'diveBomb', alt: 3600, secs: 480 },
  { id: 'taarruz20', guns: 'aa20', sensors: [], spec: 'il2m3', n: 8, type: 'attack', alt: 110, secs: 300, low: true },
  { id: 'taarruz4x', guns: 'aa20q', sensors: [], spec: 'il2m3', n: 8, type: 'attack', alt: 110, secs: 300, low: true },
  { id: 'taarruz127', guns: 'mg', sensors: [], spec: 'il2m3', n: 8, type: 'attack', alt: 110, secs: 300, low: true },
];

const runs = Number(process.argv[2] ?? 6);
const only = process.argv[3]?.split(',');
const TECH = ['hd_oerlikon', 'hd_90', 'hd_flak41', 'hd_20', 'hd_20q', 'hd_37', 'hd_40', 'hd_88', 'hd_128', 'hd_rangefinder', 'hd_predictor', 'hd_gunradar', 'hd_vt', 'hd_fort1', 'hd_fort2', 'hd_fort3', 'radar_ew1'];

console.log(`durum        silah    hedef      koşu  mermi/koşu  isabet/koşu  hasarlı/koşu  düşen/koşu  mermi/düşürme  bomba bırakan`);
for (const c of CASES) {
  if (only && !only.includes(c.id)) continue;
  let rounds = 0;
  let lost = 0;
  let struck = 0;
  let hits = 0;
  let damaged = 0;
  for (let r = 0; r < runs; r++) {
    const w = new World();
    const t = theater(w, { forward: false, redTech: TECH, redFactoryAA: Array<AAWeaponId>(COUNT).fill(c.guns), redFactorySensors: c.sensors, redFactoryLevel: 3 });
    const f = t.redFactory.pos;
    const g = groundLevel(f.x, f.z);
    const start = f.clone().add(new Vector3(-24000, 0, -2000));
    start.y = c.low ? groundLevel(start.x, start.z) + 150 : g + c.alt;
    const edit = c.low
      ? { targetStructureId: t.redFactory.id, lowLevel: true, agl: c.alt, passes: 2, loadoutId: 'mix' }
      : { targetStructureId: t.redFactory.id, altitude: g + c.alt };
    const fl = w.spawnAirborneFlight(0, c.spec, c.n, start, 85, plan(c.type, c.spec, edit), t.blueMain);
    // Düşürme çok seyrek: isabet ve hasar gören uçak sayısı küçük değişikliği de gösterir
    const hurt = new Set<number>();
    const raw = w as unknown as { hitAircraft: (ac: { id: number }, ...rest: unknown[]) => unknown };
    const orig = raw.hitAircraft.bind(w);
    raw.hitAircraft = (ac, ...rest) => {
      hits++;
      hurt.add(ac.id);
      return orig(ac, ...rest);
    };
    for (let i = 0; i < c.secs * 60; i++) {
      w.step(1 / 60);
      w.events.length = 0;
    }
    for (const s of w.structures) if (s.team === 1 && s.aa) rounds += s.aa.shotsFired;
    lost += fl.stats.losses;
    damaged += hurt.size;
    if (fl.stats.struck) struck++;
  }
  const per = lost ? Math.round(rounds / lost) : Infinity;
  console.log(`${c.id.padEnd(12)} ${c.guns.padEnd(8)} ${`${c.n} ${c.spec}`.padEnd(10)} ${String(runs).padEnd(5)} ${(rounds / runs).toFixed(0).padStart(10)}  ${(hits / runs).toFixed(1).padStart(11)}  ${(damaged / runs).toFixed(1).padStart(12)}  ${(lost / runs).toFixed(2).padStart(10)}  ${String(per).padStart(13)}  ${struck}/${runs}`);
}
process.exit(0);
