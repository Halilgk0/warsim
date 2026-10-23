import { Vector3 } from 'three';
import type { World } from './world';
import type { Structure } from './structures/structure';
import type { AAWeaponId, AASensorId } from './structures/airDefense';
import { newAirframe, type Airbase } from './structures/airbase';
import { SPECS } from './aircraft/specs';
import { defaultPlan, type MissionPlan, type MissionType } from './ai/missions';
import type { FormationType } from './ai/formation';
import { Commander } from './commander';
import { setupCampaign } from './campaign';
import { BLUE_FACTORY, BLUE_FORWARD, BLUE_MAIN, RED_FACTORY, RED_FORWARD, RED_MAIN } from './mapData';
import { footprintStats, groundLevel, highestPointNear, isWater } from './terrain';

export type ScenarioGroup = 'harekat' | 'dogfight' | 'strike';

export interface Scenario {
  id: string;
  group: ScenarioGroup;
  name: string;
  description: string;
  build(w: World): void;
}

export const SCENARIO_GROUPS: Record<ScenarioGroup, string> = {
  harekat: 'Harekât',
  dogfight: 'İt dalaşı',
  strike: 'Saldırı ve savunma',
};

interface Theater {
  blueMain: Airbase;
  blueFwd: Airbase | null;
  redMain: Airbase;
  redFwd: Airbase | null;
  blueFactory: Structure;
  redFactory: Structure;
  redRadar: Structure | null;
  redAA: Structure[];
  blueAA: Structure[];
}

interface TheaterOptions {
  redTech?: string[];
  blueTech?: string[];
  redAI?: boolean;
  radar?: boolean;
  forward?: boolean;
  redFactoryAA?: AAWeaponId[];
  redFactorySensors?: AASensorId[];
  redFactoryLevel?: number;
}

export function stock(base: Airbase, specId: string, n: number): void {
  for (let i = 0; i < n; i++) base.addAirframe(newAirframe(specId, base.s.team));
}

function aaSite(w: World, team: number, x: number, z: number, weapons?: AAWeaponId[], sensors: AASensorId[] = [], level = 1): Structure {
  const s = w.addStructure(team, 'aa', w.structureName(team, 'aa'), x, z, 0);
  const aa = s.aa!;
  aa.level = level;
  if (weapons) {
    aa.mounts.length = 0;
    for (const id of weapons) aa.addMount(id);
  }
  for (const id of sensors) aa.sensors.add(id);
  return s;
}

export function theater(w: World, o: TheaterOptions = {}): Theater {
  w.addTeam('Mavi', '#5b7ec9', o.blueTech ?? []);
  w.addTeam('Kırmızı', '#d9725f', o.redTech ?? ['hd_20'], o.redAI ?? false);
  const fwd = o.forward !== false;
  const blueMain = w.addStructure(0, 'airbase', 'Mavi ana üs', BLUE_MAIN.x, BLUE_MAIN.z, BLUE_MAIN.heading).airbase!;
  const blueFwd = fwd ? w.addStructure(0, 'airbase', 'Mavi ileri üs', BLUE_FORWARD.x, BLUE_FORWARD.z, BLUE_FORWARD.heading).airbase! : null;
  const redMain = w.addStructure(1, 'airbase', 'Kırmızı ana üs', RED_MAIN.x, RED_MAIN.z, RED_MAIN.heading).airbase!;
  const redFwd = fwd ? w.addStructure(1, 'airbase', 'Kırmızı ileri üs', RED_FORWARD.x, RED_FORWARD.z, RED_FORWARD.heading).airbase! : null;
  const blueFactory = w.addStructure(0, 'factory', 'Mavi uçak fabrikası', BLUE_FACTORY.x, BLUE_FACTORY.z, 15);
  const redFactory = w.addStructure(1, 'factory', 'Kırmızı uçak fabrikası', RED_FACTORY.x, RED_FACTORY.z, 200);
  const blueAA = [
    aaSite(w, 0, BLUE_FACTORY.x - 750, BLUE_FACTORY.z + 600),
    aaSite(w, 0, BLUE_MAIN.x + 900, BLUE_MAIN.z + 1300),
  ];
  const redAA = [
    aaSite(w, 1, RED_FACTORY.x + 750, RED_FACTORY.z + 650, o.redFactoryAA ?? ['mg', 'aa20'], o.redFactorySensors, o.redFactoryLevel ?? 1),
    aaSite(w, 1, RED_FACTORY.x - 800, RED_FACTORY.z - 600, ['mg', 'mg']),
    aaSite(w, 1, RED_MAIN.x - 900, RED_MAIN.z - 1300, ['mg', 'aa20']),
  ];
  let redRadar: Structure | null = null;
  if (o.radar) {
    const hill = highestPointNear(30000, -4000, 10000);
    redRadar = w.addStructure(1, 'radar', 'Kırmızı radar istasyonu', hill.x, hill.z, 0);
  }
  return { blueMain, blueFwd, redMain, redFwd, blueFactory, redFactory, redRadar, redAA, blueAA };
}

export function plan(type: MissionType, specId: string, edit: Partial<MissionPlan> = {}): MissionPlan {
  return { ...defaultPlan(type, SPECS[specId]), ...edit };
}

export function sweep(center: Vector3, alt: number, radius = 6000, formation: FormationType = 'finger4'): Partial<MissionPlan> {
  return { targetPos: center.clone().setY(0), altitude: alt, patrolRadius: radius, stationTime: 1800, formation, roe: 'free' };
}

/** Dalaş için kara üstünde bir merkez (batı ovası). */
export function landCenter(): Vector3 {
  for (const [x, z] of [[-60000, 24000], [-24000, -20000], [-68000, -40000], [60000, -32000]]) {
    if (!isWater(x, z) && footprintStats(x, z, 4000, 4000, 0).max < 900) return new Vector3(x, 0, z);
  }
  return new Vector3(-60000, 0, 24000);
}

/** Orta silsilede engebeli bir bölge (alçak irtifa dalaşı için). */
function ruggedCenter(): Vector3 {
  let best = new Vector3(0, 0, 0);
  let bestScore = -1;
  for (let x = -40000; x <= 40000; x += 5000) {
    for (let z = -40000; z <= 40000; z += 5000) {
      const st = footprintStats(x, z, 2500, 2500, 0);
      if (st.water > 0.05 || st.outside || st.max > 1700) continue;
      const relief = st.max - st.min;
      if (relief > bestScore) {
        bestScore = relief;
        best = new Vector3(x, 0, z);
      }
    }
  }
  return best;
}

export function dogfight(
  w: World, blue: [string, number], red: [string, number],
  opts: { sep?: number; alt?: number; blueAlt?: number; redAlt?: number; formation?: FormationType; blueTech?: string[]; redTech?: string[] } = {},
): void {
  const t = theater(w, { forward: false, blueTech: opts.blueTech, redTech: opts.redTech });
  const c = landCenter();
  const sep = opts.sep ?? 3500;
  const gl = groundLevel(c.x, c.z);
  const ba = gl + (opts.blueAlt ?? opts.alt ?? 3000);
  const ra = gl + (opts.redAlt ?? opts.alt ?? 3000);
  const f = opts.formation ?? (blue[1] >= 4 ? 'finger4' : 'lineAbreast');
  w.spawnAirborneFlight(0, blue[0], blue[1], new Vector3(c.x - sep, ba, c.z), 90, plan('sweep', blue[0], sweep(c, ba, 7000, f)), t.blueMain);
  w.spawnAirborneFlight(1, red[0], red[1], new Vector3(c.x + sep, ra, c.z + 300), 270, plan('sweep', red[0], sweep(c, ra, 7000, f)), t.redMain);
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'harekat',
    group: 'harekat',
    name: 'Harekât (1 düşman)',
    description: 'Mavi batıda, Kırmızı doğuda; arada dağlar ve körfez. İki taraf da ana üs, fabrika, 1 maden ve 2 evle başlar. Ana menüden 5 düşmana kadar harekât açılabilir.',
    build(w) {
      setupCampaign(w, { enemies: 1, playerName: '' });
    },
  },
  {
    id: 'df_1v1',
    group: 'dogfight',
    name: '1’e 1: Spitfire I – Bf 109 E',
    description: 'Britanya Muharebesi. Spitfire daha iyi döner; 109 daha iyi tırmanır ve dalar, iki 20 mm topu var.',
    build(w) {
      dogfight(w, ['spitfire1', 1], ['bf109e', 1], { sep: 3000 });
      w.log('İt dalaşı: Spitfire Mk I ile Bf 109 E-4.', null, 'info');
    },
  },
  {
    id: 'df_1v1_eq',
    group: 'dogfight',
    name: '1’e 1: eşit (Bf 109 F)',
    description: 'Aynı uçak: pilot becerisi, konum ve şans kazanır.',
    build(w) {
      dogfight(w, ['bf109f', 1], ['bf109f', 1], { sep: 3000 });
      w.log('İt dalaşı: 1’e 1, eşit uçaklar.', null, 'info');
    },
  },
  {
    id: 'df_turn_energy',
    group: 'dogfight',
    name: '1’e 1: Spitfire Vb – Fw 190 A',
    description: 'Fw 190 daha hızlı ve çok iyi yuvarlanır; dönüşe girerse Spitfire’a kaybeder. Dal-vur-tırman yapmalı.',
    build(w) {
      dogfight(w, ['spitfire5', 1], ['fw190a5', 1], { blueAlt: 3000, redAlt: 3600 });
      w.log('İt dalaşı: dönüş avcısı ile enerji avcısı.', null, 'info');
    },
  },
  {
    id: 'df_2v2',
    group: 'dogfight',
    name: '2’ye 2: Hurricane – Bf 109 E',
    description: 'İki kol. Kanat adamları liderlerini korur, lidere saldırana saldırır.',
    build(w) {
      dogfight(w, ['hurricane1', 2], ['bf109e', 2], { formation: 'lineAbreast' });
      w.log('İt dalaşı: 2’ye 2, koruma doktrini.', null, 'info');
    },
  },
  {
    id: 'df_4v4',
    group: 'dogfight',
    name: '4’e 4: Spitfire IX – Fw 190 A',
    description: 'İki dörtlü parmak formasyonu. Elemanlar ayrı hedef seçer.',
    build(w) {
      dogfight(w, ['spitfire9', 4], ['fw190a5', 4]);
      w.log('İt dalaşı: 4’e 4.', null, 'info');
    },
  },
  {
    id: 'df_bounce',
    group: 'dogfight',
    name: 'Sürpriz dalış: P-51D – Bf 109 G',
    description: '2 P-51D güneşten, 2 km yukarıdan dalıyor. 4 Bf 109 G henüz farkında değil: arka-alt kör noktayı izle.',
    build(w) {
      const t = theater(w, { forward: false });
      const c = landCenter();
      const g = groundLevel(c.x, c.z);
      w.spawnAirborneFlight(1, 'bf109g', 4, new Vector3(c.x + 1500, g + 3500, c.z), 270, plan('sweep', 'bf109g', sweep(c, g + 3500, 9000)), t.redMain);
      w.spawnAirborneFlight(0, 'p51d', 2, new Vector3(c.x + 5500, g + 5600, c.z + 600), 270, plan('sweep', 'p51d', sweep(c, g + 5600, 9000, 'lineAbreast')), t.blueMain);
      w.log('Sürpriz dalış: Mavi Mustanglar kırmızı kolun arkasında ve yukarısında.', null, 'info');
    },
  },
  {
    id: 'df_8v8',
    group: 'dogfight',
    name: 'Büyük it dalaşı 8’e 8',
    description: '4 Spitfire IX + 4 P-51D – 4 Bf 109 G + 4 Fw 190 A. Kalabalık dalaşta hedef dağılımı ve karışıklık.',
    build(w) {
      const t = theater(w, { forward: false });
      const c = landCenter();
      const g = groundLevel(c.x, c.z);
      w.spawnAirborneFlight(0, 'spitfire9', 4, new Vector3(c.x - 4000, g + 3200, c.z - 400), 90, plan('sweep', 'spitfire9', sweep(c, g + 3200, 8000)), t.blueMain);
      w.spawnAirborneFlight(0, 'p51d', 4, new Vector3(c.x - 4500, g + 4500, c.z + 700), 90, plan('sweep', 'p51d', sweep(c, g + 4500, 8000)), t.blueMain);
      w.spawnAirborneFlight(1, 'bf109g', 4, new Vector3(c.x + 4000, g + 3800, c.z + 400), 270, plan('sweep', 'bf109g', sweep(c, g + 3800, 8000)), t.redMain);
      w.spawnAirborneFlight(1, 'fw190a5', 4, new Vector3(c.x + 4500, g + 3000, c.z - 700), 270, plan('sweep', 'fw190a5', sweep(c, g + 3000, 8000)), t.redMain);
      w.log('Büyük it dalaşı başladı.', null, 'info');
    },
  },
  {
    id: 'df_low',
    group: 'dogfight',
    name: 'Alçak irtifa: dağlar arasında',
    description: '2 Spitfire Vb – 2 Bf 109 F, sırtların hemen üstünde. Arazi görüşü keser, yere çakılmamak için toparlanma payı gerekir.',
    build(w) {
      const t = theater(w, { forward: false });
      const c = ruggedCenter();
      const top = footprintStats(c.x, c.z, 3000, 3000, 0).max;
      const alt = top + 350;
      w.spawnAirborneFlight(0, 'spitfire5', 2, new Vector3(c.x - 3000, alt, c.z), 90, plan('sweep', 'spitfire5', sweep(c, alt, 5000, 'lineAbreast')), t.blueMain);
      w.spawnAirborneFlight(1, 'bf109f', 2, new Vector3(c.x + 3000, alt, c.z), 270, plan('sweep', 'bf109f', sweep(c, alt, 5000, 'lineAbreast')), t.redMain);
      w.log(`Alçak irtifa dalaşı: en yüksek sırt ${Math.round(top)} m.`, null, 'info');
    },
  },
  {
    id: 'df_jets',
    group: 'dogfight',
    name: 'Jet ve pervaneli: Me 262 – P-51D',
    description: '2 Me 262 – 4 P-51D. Jetler hızla vurup kaçar; Mustanglar onları yavaşken (kalkışta, dönüşte) yakalamaya çalışır.',
    build(w) {
      dogfight(w, ['p51d', 4], ['me262', 2], { blueAlt: 5000, redAlt: 6000, sep: 6000 });
      w.log('Jet çağı: hız farkı.', null, 'info');
    },
  },
  {
    id: 'df_korea',
    group: 'dogfight',
    name: 'Ok kanatlılar: F-86F – MiG-15bis',
    description: '4’e 4 transonik dalaş. MiG daha iyi tırmanır ve yükseklerde güçlü; Sabre yüksek hızda çok daha çevik ve nişangâhı daha iyi.',
    build(w) {
      dogfight(w, ['f86f', 4], ['mig15', 4], { blueAlt: 8000, redAlt: 9000, sep: 8000 });
      w.log('Kore: MiG koridorunda karşılaşma.', null, 'info');
    },
  },
  {
    id: 'intercept_bombers',
    group: 'strike',
    name: 'Bombardıman önleme',
    description: '6 He 111 (savaş kutusu) + 4 Bf 109 E eskort Mavi fabrikaya geliyor. Mavi: 6 Hurricane devriyede, 2 Spitfire I alarmda.',
    build(w) {
      const t = theater(w, { forward: false, blueTech: ['radio'] });
      stock(t.blueMain, 'spitfire1', 2);
      t.blueMain.alert.enabled = true;
      t.blueMain.alert.specId = 'spitfire1';
      const f = t.blueFactory.pos;
      // Fabrikadan 36 km doğuda (önceki haritayla aynı uzaklık)
      const start = f.clone().add(new Vector3(36000, 0, 6000));
      const bp = plan('levelBomb', 'he111', { targetStructureId: t.blueFactory.id, altitude: groundLevel(f.x, f.z) + 4500 });
      const bombers = w.spawnAirborneFlight(1, 'he111', 6, start.clone().setY(4700), 260, bp, t.redMain);
      w.spawnAirborneFlight(1, 'bf109e', 4, start.clone().add(new Vector3(500, 5300, 600)), 260,
        plan('escort', 'bf109e', { targetFlightId: bombers.id }), t.redMain);
      const cap = f.clone().add(new Vector3(5000, 0, -2000));
      w.spawnAirborneFlight(0, 'hurricane1', 6, cap.clone().setY(groundLevel(cap.x, cap.z) + 4000), 90,
        plan('cap', 'hurricane1', { targetPos: cap, altitude: groundLevel(cap.x, cap.z) + 4000, patrolRadius: 7000, stationTime: 1500 }), t.blueMain);
      w.log('Bombardıman akını yaklaşıyor! Eskortları bağla, bombardıman uçaklarını düşür.', null, 'info');
    },
  },
  {
    id: 'b17_raid',
    group: 'strike',
    name: 'Kale baskını: B-17G',
    description: '9 B-17G + 4 P-51D eskort Kırmızı fabrikaya. Kırmızı: 4 Bf 109 G devriyede, Fw 190 ve Me 262 alarmda (radar kolu erken görür); fabrikada 88 mm flak.',
    build(w) {
      const t = theater(w, {
        redTech: ['hd_20', 'hd_37', 'hd_88', 'hd_rangefinder', 'radio', 'radar_ew1'], radar: true,
        redFactoryAA: ['aa88', 'aa88', 'aa37', 'aa20'], redFactorySensors: ['rangefinder'], redFactoryLevel: 2,
      });
      stock(t.redMain, 'fw190a5', 4);
      t.redMain.alert.enabled = true;
      t.redMain.alert.specId = 'fw190a5';
      t.redMain.alert.count = 4;
      if (t.redFwd) {
        stock(t.redFwd, 'me262', 2);
        t.redFwd.alert.enabled = true;
        t.redFwd.alert.specId = 'me262';
      }
      const f = t.redFactory.pos;
      const alt = groundLevel(f.x, f.z) + 7000;
      const start = f.clone().add(new Vector3(-59000, 0, -4000)).setY(alt);
      const bombers = w.spawnAirborneFlight(0, 'b17g', 9, start, 85, plan('levelBomb', 'b17g', { targetStructureId: t.redFactory.id, altitude: alt }), t.blueMain);
      w.spawnAirborneFlight(0, 'p51d', 4, start.clone().add(new Vector3(-600, 800, 700)), 85,
        plan('escort', 'p51d', { targetFlightId: bombers.id }), t.blueMain);
      const cap = f.clone().add(new Vector3(-9000, 0, 0));
      w.spawnAirborneFlight(1, 'bf109g', 4, cap.clone().setY(alt + 300), 270,
        plan('cap', 'bf109g', { targetPos: cap, altitude: alt + 300, patrolRadius: 8000, stationTime: 1500 }), t.redMain);
      w.log('Uçan kaleler yolda: savaş kutusunun ateş duvarını izle.', null, 'info');
    },
  },
  {
    id: 'raid_dive',
    group: 'strike',
    name: 'Pike baskını: Stuka',
    description: '4 Ju 87 B + 4 Bf 109 E eskort Kırmızı fabrikaya. Fabrikada 12,7 mm, 20 mm ve 37 mm; Kırmızı devriyede Hurricane ve Spitfire.',
    build(w) {
      const t = theater(w, { redTech: ['hd_20', 'hd_37'], redFactoryAA: ['mg', 'aa20', 'aa37', 'aa20'], redFactoryLevel: 2 });
      const f = t.redFactory.pos;
      const start = f.clone().add(new Vector3(-22000, 0, -4000)).setY(0);
      const dp = plan('diveBomb', 'ju87b', { targetStructureId: t.redFactory.id, altitude: groundLevel(f.x, f.z) + 3600 });
      const divers = w.spawnAirborneFlight(0, 'ju87b', 4, start.clone().setY(groundLevel(f.x, f.z) + 3700), 80, dp, t.blueMain);
      w.spawnAirborneFlight(0, 'bf109e', 4, start.clone().add(new Vector3(-500, groundLevel(f.x, f.z) + 4300, 300)), 80,
        plan('escort', 'bf109e', { targetFlightId: divers.id }), t.blueMain);
      w.spawnAirborneFlight(1, 'hurricane1', 2, f.clone().add(new Vector3(2500, groundLevel(f.x, f.z) + 3000, -2500)), 250,
        plan('cap', 'hurricane1', { targetPos: f.clone(), altitude: groundLevel(f.x, f.z) + 3000, patrolRadius: 4000, stationTime: 1500 }), t.redMain);
      w.spawnAirborneFlight(1, 'spitfire1', 2, f.clone().add(new Vector3(3500, groundLevel(f.x, f.z) + 4000, 2500)), 290,
        plan('cap', 'spitfire1', { targetPos: f.clone(), altitude: groundLevel(f.x, f.z) + 4000, patrolRadius: 4500, stationTime: 1500 }), t.redMain);
      w.log('Pike baskını: hedef Kırmızı fabrika.', null, 'info');
    },
  },
  {
    id: 'attack_aa',
    group: 'strike',
    name: 'Taarruz ve uçaksavar: Il-2',
    description: '4 Il-2M3 alçaktan Kırmızı fabrikaya taarruz ediyor. Bataryada 88 mm, 37 mm, 20 mm ve telemetre var.',
    build(w) {
      const t = theater(w, {
        forward: false, redTech: ['hd_20', 'hd_37', 'hd_88', 'hd_rangefinder'],
        redFactoryAA: ['aa20', 'aa37', 'aa88', 'aa20'], redFactorySensors: ['rangefinder'], redFactoryLevel: 2,
      });
      const ap = plan('attack', 'il2m3', { targetStructureId: t.redFactory.id, lowLevel: true, agl: 110, passes: 2, loadoutId: 'mix' });
      const ia = t.redFactory.pos.clone().add(new Vector3(-18000, 0, 1000));
      w.spawnAirborneFlight(0, 'il2m3', 4, ia.setY(groundLevel(ia.x, ia.z) + 150), 85, ap, t.blueMain);
      w.log('Taarruz: Il-2’ler alçaktan sızıyor. Uçaksavarın arazi arkasını göremediğine dikkat.', null, 'info');
    },
  },
  {
    id: 'radar_lowlevel',
    group: 'strike',
    name: 'Radar altı sızma',
    description: 'Kırmızı radar dağda, ileri üs alarmda. 4 He 111 yüksekten, 4 Typhoon alçaktan gidiyor: hangisi fark edilecek?',
    build(w) {
      const t = theater(w, { redTech: ['hd_20', 'hd_rangefinder', 'radar_ew1', 'radio'], radar: true, redAI: true });
      stock(t.redMain, 'bf109e', 4);
      if (t.redFwd) stock(t.redFwd, 'bf109e', 4);
      w.commanders.push(new Commander(1, { research: false, upgrades: false, production: false, cap: false, raids: false, firstRaid: 1e9 }));
      const f = t.redFactory.pos;
      const hb = f.clone().add(new Vector3(-57000, 0, -19000));
      const ty = f.clone().add(new Vector3(-57000, 0, -1000));
      w.spawnAirborneFlight(0, 'he111', 4, hb.clone().setY(groundLevel(hb.x, hb.z) + 5000), 80,
        plan('levelBomb', 'he111', { targetStructureId: t.redFactory.id, altitude: groundLevel(f.x, f.z) + 5000 }), t.blueMain);
      w.spawnAirborneFlight(0, 'typhoon', 4, ty.clone().setY(groundLevel(ty.x, ty.z) + 120), 95,
        plan('attack', 'typhoon', { targetStructureId: t.redFactory.id, lowLevel: true, agl: 100, loadoutId: 'bombs' }), t.blueMain);
      w.log('Radar altı sızma: Görünüm menüsünden radar kapsamasını aç.', null, 'info');
    },
  },
];
