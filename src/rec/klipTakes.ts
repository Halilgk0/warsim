// Geliştirici günlüğü 2 klipleri (MiG-15 videosundan sonraki yenilikler): ayrıntılı jetler ve pervaneliler (uçağın çevresinde
// dönen kamera, güneş kameranın arkasında), gümüş metal ve boyalar, yeni uçaksavar topları, hava üssü, iniş.
// Kayıt: node tools/rec/record.mjs --dir=klip k_<çekim>. Klipler release/sosyal/08-gelistirici-gunlugu-2/klipler/.

import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Airbase } from '../sim/structures/airbase';
import { newAirframe } from '../sim/structures/airbase';
import { AASite } from '../sim/structures/airDefense';
import type { AAWeaponId } from '../sim/structures/aaWeapons';
import { landCenter, plan, theater } from '../sim/scenarios';
import { groundLevel } from '../sim/terrain';
import { sunAt } from '../render/atmosphere';
import { ease, lerp, phase } from './director';
import type { Subject, Take, TakeCtx } from './takes';

const DEG = Math.PI / 180;
/** Çekimin kendi notları (kamera konumu gibi): her kayıtta ilk karede yazılır. */
const notes = new Map<string, THREE.Vector3>();
const note = (c: TakeCtx, key: string, make: () => THREE.Vector3): THREE.Vector3 => {
  if (c.t <= c.dt || !notes.has(key)) notes.set(key, make());
  return notes.get(key)!;
};

/** Yatay tuval (masaüstü, yatay telefon): çekimler dikey kadraja göre kurulu, yatayda bazı bakışlar değişir. */
const wide = (): boolean => innerWidth > innerHeight;

const baseOf = (w: World): Airbase => w.structures.find((s) => s.kind === 'airbase' && s.team === 0)!.airbase!;

// ------------------------------------------------------------------ uçak yörüngesi

interface OrbitOpts {
  alt: number;
  clock?: number;
  /** Kameranın burundan açısı (derece; 90 tam yan): başta ve sonda. Sağ yan güneşe dönük. */
  from?: number;
  to?: number;
  /** Uzaklık: kanat açıklığının katı. */
  r?: number;
  /** Kameranın uçağa göre yüksekliği: uzaklığın katı (artı: üstten, arazi arkada). */
  up?: number;
  fov?: number;
  dur?: number;
  clouds?: number;
  /** Koldaki uçak sayısı (kamera öndekinde). */
  n?: number;
  /** Bakış noktası uçağın ekseninde, kanat açıklığı biriminde (kolun arkadakileri kadraja girsin diye geriye kaydırılır). */
  look?: [number, number, number];
}

/**
 * Tek uçak düz uçar, kamera sağ yanında yavaşça önden arkaya döner (gövdeye bağlı, ufuk az yatar). Uçuş yönü, sağ kanat
 * güneşe bakacak biçimde seçilir: kamera güneşi arkasına alır, boya ve ayrıntı aydınlık görünür.
 */
function orbit(id: string, specId: string, o: OrbitOpts): Take {
  const clock = o.clock ?? 15.2;
  const dur = o.dur ?? 4.5;
  return {
    id,
    map: 'anakara',
    seed: 91,
    clock,
    clouds: o.clouds ?? 0.6,
    clearClouds: true,
    setup(w) {
      const ab = theater(w, { forward: false }).blueMain;
      const hdg = (sunAt(clock).azimuth - 90 + 360) % 360;
      const h = hdg * DEG;
      const p = ab.s.pos.clone().setY(groundLevel(ab.s.pos.x, ab.s.pos.z) + o.alt);
      const far = p.clone().add(new THREE.Vector3(Math.sin(h), 0, -Math.cos(h)).multiplyScalar(60000));
      w.spawnAirborneFlight(0, specId, o.n ?? 1, p, hdg, plan('cap', specId, { targetPos: far, altitude: p.y, patrolRadius: 4000, stationTime: 600 }), null);
    },
    trigger: (w) => {
      const a = w.aircraft.find((x) => x.spec.id === specId);
      return a ? { ids: [a.id] } : null;
    },
    offset: 2.5,
    maxWait: 20,
    duration: dur,
    shot(c) {
      const a = c.ac(c.s.ids[0])!;
      // Dikey kadrajda yatay görüş ~20°: uçağın tamamı sığsın diye uzaklık kanat açıklığının ~2,8 katı
      const R = (o.r ?? 2.8) * a.spec.span;
      const th = lerp(o.from ?? 50, o.to ?? 130, phase(c.t, 0, dur, ease.smooth)) * DEG;
      const up = (o.up ?? 0.16) * R;
      const s = a.spec.span;
      const look: [number, number, number] = o.look ? [o.look[0] * s, o.look[1] * s, o.look[2] * s] : [0, 0, 0];
      return { ...c.d.wing(a, { offset: [Math.sin(th) * R, up, Math.cos(th) * R], look, roll: 0.35, fov: o.fov ?? 34 }), handheld: 0.25 };
    },
  };
}

// ------------------------------------------------------------------ uçaksavar

/** Alçak taarruza karşı hafif ve orta toplar: Il-2'ler doğrudan bataryaya dalar; kamera seçili topun arkasında, yerde. */
function lightAA(id: string, mounts: AAWeaponId[], camGun: AAWeaponId): Take {
  return {
    id,
    map: 'anakara',
    seed: 61,
    // Il-2'ler batıdan gelir, kamera topun doğusunda batıya bakar: sabah güneşi arkada, top aydınlık
    clock: 9.3,
    clouds: 0.5,
    setup(w) {
      const t = theater(w, {
        forward: false, redTech: ['hd_20', 'hd_oerlikon', 'hd_20q', 'hd_37', 'hd_40', 'hd_rangefinder'],
        redFactoryAA: mounts, redFactorySensors: ['rangefinder'], redFactoryLevel: 4,
      });
      const site = t.redAA[0];
      const ia = site.pos.clone().add(new THREE.Vector3(-9000, 0, 800));
      w.spawnAirborneFlight(0, 'il2m3', 4, ia.setY(groundLevel(ia.x, ia.z) + 150), 85,
        plan('attack', 'il2m3', { targetStructureId: site.id, lowLevel: true, agl: 110, passes: 2, loadoutId: 'mix' }), t.blueMain);
    },
    trigger: (w) => {
      const site = w.structures.find((s) => s.aa && s.team === 1 && s.aa.mounts.some((m) => m.weapon === camGun));
      if (!site || !site.aa!.mounts.some((m) => m.weapon === camGun && w.time - m.lastFire < 0.02)) return null;
      const il2 = w.aircraft.filter((a) => a.spec.id === 'il2m3' && a.status === 'flying' && a.pos.distanceTo(site.pos) < 1500)
        .sort((x, y) => x.pos.distanceTo(site.pos) - y.pos.distanceTo(site.pos))[0];
      return il2 ? { ids: [il2.id], at: site.pos.clone() } : null;
    },
    offset: -0.3,
    maxWait: 600,
    duration: 4.5,
    fxDist: 140,
    shot(c) {
      const site = c.s.at!;
      const a = c.ac(c.s.ids[0]);
      if (a) notes.set('ac', a.pos.clone());
      const p = notes.get('ac') ?? site.clone().add(new THREE.Vector3(0, 300, 0));
      const st = c.w.structures.find((s) => s.aa && s.pos.distanceTo(site) < 1)!;
      const gun = note(c, 'gun', () => {
        const [ox, oz] = AASite.mountOffset(Math.max(0, st.aa!.mounts.findIndex((m) => m.weapon === camGun)));
        const g = new THREE.Vector3(site.x + ox, 0, site.z + oz);
        g.y = groundLevel(g.x, g.z) + 2;
        return g;
      });
      const cam = note(c, 'cam', () => {
        const away = gun.clone().sub(p).setY(0).normalize();
        const side = new THREE.Vector3(-away.z, 0, away.x);
        const v = gun.clone().addScaledVector(away, 8).addScaledVector(side, 2.5);
        v.y = groundLevel(v.x, v.z) + 2.4;
        return v;
      });
      // Bakış topa ağır: top kadrajın ortasında, dalan uçak üstte
      const toGun = gun.clone().sub(cam).normalize();
      const toAc = p.clone().sub(cam).normalize();
      // Yatay kadrajda dikey açı dar: bakış topun kendisine, namlunun gösterdiği yöne birkaç metre kayık (top ortada)
      const look = wide()
        ? gun.clone().addScaledVector(p.clone().sub(gun).setY(0).normalize(), 2).add(new THREE.Vector3(0, 0.4, 0))
        : cam.clone().add(toGun.multiplyScalar(1.4).add(toAc).normalize().multiplyScalar(100));
      return c.d.tripod(cam, look, c.dt, 54, 0.14);
    },
  };
}

/** Ağır top yaklaşan B-17 koluna ateş eder: kamera topun yanında, duvarın üstünden alçak yay çizer. */
function heavyAA(id: string, gunId: AAWeaponId): Take {
  const NAME = 'Klip ağır bataryası';
  return {
    id,
    map: 'anakara',
    seed: 7,
    clock: 16.8,
    clouds: 0.5,
    setup(w) {
      theater(w, { forward: false });
      const c = landCenter();
      const site = w.addStructure(0, 'aa', NAME, c.x, c.z, 0);
      const aa = site.aa!;
      aa.level = 4;
      aa.mounts.length = 0;
      for (const m of [gunId, 'aa88', 'aa40', 'aa20q'] as AAWeaponId[]) aa.addMount(m);
      for (const s of ['gunRadar', 'rangefinder', 'predictor'] as const) aa.sensors.add(s);
      // Kol yakında başlar: namlu yükselmiş, B-17'ler gökte görünür
      const y = groundLevel(c.x, c.z) + 3200;
      w.spawnAirborneFlight(1, 'b17g', 6, new THREE.Vector3(c.x + 6500, y, c.z + 300), 270,
        plan('levelBomb', 'b17g', { targetStructureId: site.id, altitude: y }), null);
    },
    trigger: (w) => {
      const site = w.structures.find((s) => s.name === NAME);
      if (!site || !site.aa!.mounts.some((m) => m.weapon === gunId && w.time - m.lastFire < 0.02)) return null;
      return { ids: w.aircraft.map((x) => x.id), at: site.pos.clone() };
    },
    offset: -0.6,
    maxWait: 800,
    duration: 7,
    shake: 0.6,
    fxDist: 120,
    shot(c) {
      const site = c.s.at!;
      const st = c.w.structures.find((s) => s.aa && s.pos.distanceTo(site) < 1)!;
      const gun = note(c, 'hgun', () => {
        const [ox, oz] = AASite.mountOffset(Math.max(0, st.aa!.mounts.findIndex((m) => m.weapon === gunId)));
        const g = new THREE.Vector3(site.x + ox, 0, site.z + oz);
        g.y = groundLevel(g.x, g.z) + 1.8;
        return g;
      });
      // Kamera topun arkasında (kolun karşı yanı), biraz yanda, alçakta; yavaşça yana kayar. Bakış topa ağır: top altta
      // önde, namlunun gösterdiği gökte B-17'ler
      const sky = new THREE.Vector3();
      let n = 0;
      for (const id of c.s.ids) {
        const b = c.ac(id);
        if (b && b.status === 'flying') { sky.add(b.pos); n++; }
      }
      if (n) notes.set('ctr', sky.divideScalar(n));
      const ctr = notes.get('ctr') ?? gun.clone().add(new THREE.Vector3(3000, 3000, 0));
      const away = note(c, 'haway', () => gun.clone().sub(ctr).setY(0).normalize());
      const side = new THREE.Vector3(-away.z, 0, away.x);
      const pos = gun.clone().addScaledVector(away, 10).addScaledVector(side, lerp(5, 1.5, phase(c.t, 0, 5, ease.smooth)));
      pos.y = groundLevel(pos.x, pos.z) + 2.4;
      const toGun = gun.clone().add(new THREE.Vector3(0, 1.5, 0)).sub(pos).normalize();
      const toSky = ctr.clone().sub(pos).normalize();
      const look = wide()
        ? gun.clone().addScaledVector(ctr.clone().sub(gun).setY(0).normalize(), 2).add(new THREE.Vector3(0, 1.2, 0))
        : pos.clone().add(toGun.multiplyScalar(1.3).add(toSky).normalize().multiplyScalar(100));
      return c.d.tripod(pos, look, c.dt, 58, 0.25);
    },
  };
}

// ------------------------------------------------------------------ hava üssü ve iniş

const PARK = ['spitfire9', 'p51d', 'typhoon', 'p47d', 'mosquito', 'spitfire9', 'p51d', 'b17g', 'fw190a5', 'lancaster', 'hurricane1', 'yak3'];

function parked(launchSpec?: string, count = 2) {
  return (w: World): void => {
    const ab = theater(w, { forward: false }).blueMain;
    for (const id of PARK) ab.addAirframe(newAirframe(id, 0, 0.8));
    if (launchSpec) {
      for (let i = 0; i < count; i++) ab.addAirframe(newAirframe(launchSpec, 0, 0.8));
      // Kısa devriye: görev bitince üsse döner ve iner
      const far = ab.s.pos.clone();
      far.z -= 6000;
      far.y = 0;
      w.teams[0].personnel.people += 200;
      w.launchPackage(ab, plan('cap', launchSpec, { targetPos: far, altitude: 1200, patrolRadius: 1500, stationTime: 15 }), [{ specId: launchSpec, count }]);
    }
  };
}

/** Teker koyma anı: inen uçak yere değdi; olay noktası ve uçuş yönü (pusula, radyan) kaydedilir. */
function touchdown(specId: string) {
  return (w: World): Subject | null => {
    const a = w.aircraft.find((x) => x.spec.id === specId && x.team === 0 && x.brain.ops.mode === 'landing' && x.onGround);
    if (!a) return null;
    const v = new THREE.Vector3();
    a.velocity(v);
    return { ids: [a.id], at: a.pos.clone(), ang: Math.atan2(v.x, -v.z) };
  };
}

/** İniş kamerasının yeri teker koyma noktasına göre: yanda (m), uçuş yönünde ileride (+) ya da geride (−), yerden yükseklik. */
interface LandCam {
  side: number;
  along: number;
  h: number;
  fov: number;
  /** Kayıt teker koymadan kaç sn önce (−) başlasın; süre. */
  offset: number;
  dur: number;
  /** Uzaklaşan uçağa yakınlaşma: bu andan (teker koymaya göre sn) sonuna kadar görüş açısı fov2'ye daralır. */
  zoomFrom?: number;
  fov2?: number;
}
const LAND_SIDE: LandCam = { side: 40, along: -30, h: 1.7, fov: 34, offset: -3.5, dur: 7 };

/**
 * Pist kenarından iniş: kamera yerde, teker koyma noktasına göre cam kadar ötede; operatör gibi uçağı izler.
 * Varsayılan: noktanın 40 m yanında ve biraz gerisinde; uçak önden alçalıp kameranın önünde yere basar, yanından geçer.
 */
function landTake(id: string, specId: string, clock: number, cam: Partial<LandCam> = {}): Take {
  const o = { ...LAND_SIDE, ...cam };
  return {
    id,
    map: 'anakara',
    seed: 33,
    clock,
    clouds: 0.5,
    setup: parked(specId, 2),
    trigger: touchdown(specId),
    offset: o.offset,
    maxWait: 900,
    duration: o.dur,
    shot(c) {
      const a = c.ac(c.s.ids[0]);
      if (a) notes.set('land', a.pos.clone());
      const last = notes.get('land') ?? c.s.at!.clone();
      const f = new THREE.Vector3(Math.sin(c.s.ang!), 0, -Math.cos(c.s.ang!));
      const side = new THREE.Vector3(-f.z, 0, f.x);
      const p = c.s.at!.clone().addScaledVector(side, o.side).addScaledVector(f, o.along);
      p.y = Math.max(groundLevel(p.x, p.z), baseOf(c.w).s.pos.y) + o.h;
      // c.t kaydın başından; teker koyma anı t = −offset
      const fov = o.fov2 !== undefined ? lerp(o.fov, o.fov2, phase(c.t, (o.zoomFrom ?? 0) - o.offset, o.dur, ease.smooth)) : o.fov;
      return c.d.tripod(p, last.clone().add(new THREE.Vector3(0, 1.5, 0)), c.dt, fov, 0.12);
    },
  };
}

/**
 * Açılış ekranı görseli (yatay kadraj): kol düz uçar, kamera öndeki uçağın yanında sabit açıda; güneş arkada, sabah ya da
 * akşam ışığı. Kayıtla değil açılış görseli betiğiyle (yatay tuval) çekilir.
 */
const still = (id: string, specId: string, o: OrbitOpts & { at: number }): Take =>
  // Yükleme ekranında ortada kart durur: bakış kuyruğa ve aşağıya kayık, uçak kadrajın üst-sağında kalır
  // (yatay telefonda görselin üstünden ~%11, altından ~%7 kırpılır)
  orbit(id, specId, { r: 2.5, up: 0.1, fov: 30, dur: 3, from: o.at, to: o.at + 4, look: [0, -0.36, -0.38], ...o });

export const KLIP_TAKES: Take[] = [
  // Açılış ekranı görselleri
  still('a_spitfire', 'spitfire1', { n: 2, alt: 1200, clock: 17.4, at: 62 }),
  still('a_b17', 'b17g', { n: 3, alt: 4200, clock: 16.9, clouds: 1, at: 72 }),
  still('a_p51', 'p51d', { n: 2, alt: 3200, clock: 17.0, at: 118 }),
  still('a_bf109', 'bf109e', { n: 2, alt: 1500, clock: 9.2, at: 52 }),
  still('a_fw190', 'fw190a5', { n: 2, alt: 1800, clock: 16.8, at: 70 }),
  still('a_lancaster', 'lancaster', { n: 2, alt: 2500, clock: 18.2, at: 78, r: 1.5 }),
  still('a_sabre', 'f86f', { n: 2, alt: 6000, clock: 16.2, clouds: 1, at: 58 }),
  still('a_stuka', 'ju87b', { n: 2, alt: 2600, clock: 9.8, at: 45 }),
  // Jetler: ayrıntılı modeller (üç görünüş çiziminden), çıplak metal gümüş
  orbit('k_jet_sabre', 'f86f', { alt: 3500 }),
  orbit('k_jet_mig', 'mig15', { alt: 3500, from: 130, to: 55 }),
  orbit('k_jet_me262', 'me262', { alt: 3000 }),
  orbit('k_jet_ar234', 'ar234', { alt: 3000, from: 35, to: 100 }),
  orbit('k_jet_vampire', 'vampire', { alt: 2500 }),
  orbit('k_jet_f84', 'f84g', { alt: 3000, from: 120, to: 50 }),
  orbit('k_jet_meteor', 'meteor3', { alt: 3000 }),
  orbit('k_jet_he162', 'he162', { alt: 2500, from: 60, to: 140 }),
  orbit('k_jet_canberra', 'canberra', { alt: 4000, r: 2.5 }),
  // Pervaneliler: çizimden yeniden kurulan modeller, solmuş boya ve kir izleri
  orbit('k_pv_spitfire', 'spitfire1', { alt: 1800 }),
  orbit('k_pv_bf109e', 'bf109e', { alt: 1800, from: 125, to: 45 }),
  orbit('k_pv_fw190', 'fw190a5', { alt: 2000 }),
  orbit('k_pv_corsair', 'f4u4', { alt: 2000, from: 40, to: 115 }),
  orbit('k_pv_p51', 'p51d', { alt: 2500 }),
  orbit('k_pv_lancaster', 'lancaster', { alt: 2500, r: 2.5 }),
  orbit('k_pv_he111', 'he111', { alt: 2500, r: 2.5, from: 120, to: 50 }),
  orbit('k_pv_b17', 'b17g', { alt: 3000, r: 2.5 }),
  orbit('k_pv_stuka', 'ju87b', { alt: 2000 }),
  // Uçaksavar: yeni toplar
  lightAA('k_aa_bofors', ['aa40', 'aa20q', 'oerlikon', 'aa40'], 'aa40'),
  lightAA('k_aa_vierling', ['aa20q', 'aa40', 'oerlikon', 'aa20q'], 'aa20q'),
  lightAA('k_aa_oerlikon', ['oerlikon', 'aa20q', 'aa40', 'oerlikon'], 'oerlikon'),
  heavyAA('k_aa_90', 'aa90'),
  heavyAA('k_aa_flak41', 'aa41'),
  heavyAA('k_aa_128', 'aa128'),
  // İniş: devriyeden dönen uçak kendi yaklaşmasıyla iner
  landTake('k_inis_spitfire', 'spitfire9', 16.2),
  landTake('k_inis_p47', 'p47d', 17.0),
  // Büyük uçak: pistin kenarından, biraz uzaktan
  landTake('k_inis_b17', 'b17g', 16.6, { side: 70, along: -60, h: 2.2, fov: 38, offset: -5, dur: 9 }),
  // Çok alçak, teker koyma noktasının ilerisinde: uçak kameraya doğru gelir, kuyruk tekerine oturur, yanından geçer
  landTake('k_inis_bf109', 'bf109g', 16.9, { side: 26, along: 70, h: 0.9, fov: 36, offset: -4, dur: 7.5 }),
  // Eşikten: uçak kameranın yanından alçalarak geçer, pistin ilerisine teker koyar (arkadan)
  landTake('k_inis_p51', 'p51d', 17.2, { side: 22, along: -330, h: 1.4, fov: 40, offset: -8, dur: 10, zoomFrom: -5, fov2: 9 }),
  // Koşu: uzakta teker koyar, pistte kameraya doğru yavaşlayarak gelir
  landTake('k_inis_fw190', 'fw190a5', 16.4, { side: 24, along: 260, h: 1.2, fov: 30, offset: -1.5, dur: 8.5 }),
];
