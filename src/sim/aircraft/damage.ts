// Bileşen hasar modeli. Mermi isabeti, uçağın vurulan bölgesine göre bir bileşene düşer (hitbox.ts):
// burun motoru, kokpit pilotu ve depoyu, arka gövde ve kuyruk kumandayı, kanat ucu kanadı vurur.
// Bölgesi bilinmeyen isabette (flak patlaması) atışın geldiği yön kullanılır.
// Zırh hayati bölgeleri (motor, pilot, yakıt) küçük kalibreye karşı korur.
//
// Sonuçlar üç türlüdür:
//  - Düşürülme: pilot ölür, kumanda kopar, kanat kırılır, yangın ya da gövde parçalanır → uçak düşer
//    (sarmal, burun üstü dalış, süzülerek ya da kanadı kopmuş halde savrularak). Mürettebat paraşütle atlayabilir.
//  - Havada infilak: top mermisi yakıt deposunu ya da bomba yükünü patlatır, büyük isabet gövdeyi parçalar
//    ya da söndürülemeyen yangın depoya ulaşır.
//  - Kaçış: ağır hasarlı uçak koldan kopup üsse döner (yakalanmazsa).

import type { Vector3 } from 'three';
import type { Aircraft } from './aircraft';
import type { Caliber } from './specs';
import type { BeltDef } from './ammo';
import type { HitZone } from './hitbox';
import { clamp } from '../../core/math';
import { L } from '../../i18n';

export type DamagePart = 'structure' | 'engine' | 'controls' | 'wings' | 'fuel' | 'pilot';

export interface DamageState {
  /** Motor başına hasar: 0 sağlam … 1 durdu. */
  engines: number[];
  controls: number;
  wings: number;
  /** Yakıt sızıntısı (seyir yakıt akışının katı). */
  fuelLeak: number;
  /** > 0 ise yanıyor (saniye). */
  fire: number;
  /** Yangının kaynağı: depo yangını patlamaya daha yatkın. */
  fireSource: 'engine' | 'fuel' | null;
  /** Soğutma sıvısı / yağ kaybı hızı (radyatör isabeti). */
  coolant: number;
  /** Motor harareti 0..1; 1'de motor kilitlenir. */
  heat: number;
  /** 0 sağlam, 1 yaralı, 2 öldü. */
  pilot: 0 | 1 | 2;
}

export function newDamage(engines: number): DamageState {
  return {
    engines: Array.from({ length: engines }, () => 0), controls: 0, wings: 0, fuelLeak: 0, fire: 0, fireSource: null,
    coolant: 0, heat: 0, pilot: 0,
  };
}

export interface HitResult {
  part: DamagePart;
  /** Günlüğe yazılacak önemli olay (yangın, motor durdu …). */
  event: string | null;
  /** Kontrol kaybı nedeni; null ise uçak uçmaya devam eder. */
  fatal: string | null;
  /** Uçak havada infilak etti. */
  explode: boolean;
}

type Weights = Record<DamagePart, number>;

const W_REAR: Weights = { structure: 30, controls: 26, fuel: 14, pilot: 7, engine: 7, wings: 16 };
const W_FRONT: Weights = { structure: 22, engine: 32, pilot: 8, fuel: 11, wings: 19, controls: 8 };
const W_SIDE: Weights = { structure: 24, wings: 32, fuel: 17, engine: 14, pilot: 5, controls: 8 };

const W0: Weights = { structure: 0, engine: 0, controls: 0, wings: 0, fuel: 0, pilot: 0 };
const z = (w: Partial<Weights>): Weights => ({ ...W0, ...w });

/** Tek motorlu pervaneli: motor burunda, depo kokpitin önünde/altında. */
const Z_PROP: Record<HitZone, Weights> = {
  nose: z({ engine: 50, fuel: 12, structure: 22, pilot: 4, controls: 4 }),
  cockpit: z({ pilot: 26, fuel: 26, structure: 26, controls: 12, engine: 8 }),
  rear: z({ structure: 44, controls: 24, fuel: 18, pilot: 8 }),
  wingIn: z({ wings: 38, fuel: 28, structure: 26, controls: 6, engine: 2 }),
  wingOut: z({ wings: 70, controls: 18, structure: 10, fuel: 2 }),
  nacelle: z({ engine: 62, fuel: 14, wings: 14, structure: 10 }),
  tail: z({ controls: 58, structure: 42 }),
};
/** Tek motorlu jet: kokpit önde, motor gövdenin arka yarısında, depolar ortada. */
const Z_JET: Record<HitZone, Weights> = {
  ...Z_PROP,
  nose: z({ pilot: 22, structure: 38, engine: 12, fuel: 12, controls: 16 }),
  cockpit: z({ fuel: 34, engine: 22, structure: 22, pilot: 10, controls: 12 }),
  rear: z({ engine: 40, structure: 28, controls: 24, fuel: 8 }),
};
/** Çok motorlu: mürettebat burunda, motorlar naselde, depolar kanat kökünde. */
const Z_MULTI: Record<HitZone, Weights> = {
  ...Z_PROP,
  nose: z({ pilot: 30, structure: 50, controls: 12, fuel: 8 }),
  cockpit: z({ structure: 46, fuel: 22, pilot: 14, controls: 18 }),
  rear: z({ structure: 52, controls: 36, pilot: 8, fuel: 4 }),
  wingIn: z({ wings: 36, fuel: 30, structure: 20, engine: 8, controls: 6 }),
};

function zoneWeights(ac: Aircraft, zone: HitZone, along: number): Weights {
  const s = ac.spec;
  const table = s.engines > 1 ? Z_MULTI : s.engine.kind === 'jet' ? Z_JET : Z_PROP;
  const w = { ...table[zone] };
  // Arkadan arka gövdeye giren mermi kokpite doğru ilerler
  if (zone === 'rear' && along > 0.5) w.pilot *= 2;
  return w;
}

function pick(w: Weights): DamagePart {
  let total = 0;
  for (const k in w) total += w[k as DamagePart];
  let r = Math.random() * total;
  for (const k in w) {
    r -= w[k as DamagePart];
    if (r <= 0) return k as DamagePart;
  }
  return 'structure';
}

/**
 * Hasar ayarı (isabet başına). Motor, depo ve pilot her uçakta aynı ölçüde zarar görür — büyük uçak daha çok
 * motoru ve mürettebatı olduğu için dayanır. Kanat, kuyruk ve gövde yapısının dayanımı uçağın büyüklüğüyle artar.
 * Hedef (savaş dönemi değerlendirmeleri, tek motorlu avcıda ortanca isabet): 7,7 mm ~25, 12,7 mm ~9,
 * 20 mm ~3, 30 mm MK 108 ~1–2; B-17'de 20 mm ~20, 30 mm ~3–4.
 */
const K = {
  structure: 4.5,
  engine: 0.16,
  engineFire: 0.12,
  coolant: 0.05,
  controls: 0.06,
  // Arka yarım küreden isabetler ağırlıktayken (gerçek dalaşta olduğu gibi) kanat kopmaları düşürmelerin yarısını
  // buluyordu; savaş kayıtlarında avcıların çoğu yangın, depo ve gövde hasarıyla düştü
  wings: 0.042,
  fuelFire: 0.2,
  pilot: 0.35,
};

/** Bölgesiz isabet (flak ve yakınlık tapalı patlama parçacıkları): ölçek, uçaksavar ayarını korur. */
const SPLASH = 0.22;

/** Yapı ölçeği: avcıda ~1–1,3, Bf 110'da ~2, orta bombardımanda ~4, ağır bombardımanda ~8. */
function structScale(span: number): number {
  return Math.max(1, span / 11) ** 2;
}

/**
 * Erken savaştan fabrikadan kendini kapatan depoyla gelenler: Luftwaffe'nin He 111 H ve Ju 88 A bombardıman
 * uçakları (Britanya Muharebesi'nde .303 isabetlerine dayanıklılıkları raporlarda geçer).
 */
const EARLY_SEALED = new Set(['he111', 'ju88a4']);

/**
 * Kendini kapatan yakıt deposu: 1941 ve sonrası tasarımlarda fabrikadan vardı (Japon uçakları hariç — Sıfır'ın
 * korumasız depoları birkaç isabetle tutuşurdu). Erken savaş uçaklarına araştırmayla gelir.
 */
export function hasSealedTanks(ac: Aircraft): boolean {
  return ac.mods.selfSealing || EARLY_SEALED.has(ac.spec.id) || (ac.spec.year >= 1941 && ac.spec.origin !== 'Japonya');
}

/** 1 − e^(−x): küçük isabette küçük, büyük isabette 1'e yaklaşan ihtimal. */
const chance = (x: number) => 1 - Math.exp(-x);

function armorFactor(armor: number, caliber: Caliber): number {
  if (caliber === 'small') return 1 - armor;
  if (caliber === 'heavy') return 1 - armor * 0.6;
  return 1 - armor * 0.3;
}

/** Patlayıcı mermi (top) depoyu ya da bombayı tutuşturma eğilimi. */
function blastFactor(caliber: Caliber): number {
  return caliber === 'cannon' ? 1 : caliber === 'heavy' ? 0.2 : 0.06;
}

export function applyHit(
  ac: Aircraft, amount: number, bulletDir: Vector3, caliber: Caliber, belt: BeltDef | null = null, zone: HitZone | null = null,
): HitResult {
  const s = ac.spec;
  const dmg = ac.damage;
  const mods = ac.mods;
  const along = bulletDir.dot(ac.fwd) / Math.max(bulletDir.length(), 1e-6);
  if (!zone) amount *= SPLASH;
  let w: Weights;
  if (zone) w = zoneWeights(ac, zone, along);
  else {
    w = { ...(along > 0.5 ? W_REAR : along < -0.5 ? W_FRONT : W_SIDE) };
    if (s.engines > 1) {
      w.engine *= 1.3;
      w.pilot *= 0.4;
    }
  }
  if (mods.pilotArmor && along > 0.5) w.pilot *= 0.4;
  else if (mods.pilotArmor) w.pilot *= 0.75;
  const part = pick(w);
  // Büyük uçağın kanadı, kuyruğu ve gövde yapısı aynı isabetten daha az etkilenir
  const sz = structScale(s.span);
  const vital = part === 'engine' || part === 'pilot' || part === 'fuel';
  const a = vital ? amount * armorFactor(ac.armor * (belt?.armor ?? 1), caliber) : amount;
  const seal = hasSealedTanks(ac) ? 0.4 : 1;
  const fireMul = belt?.fire ?? 1;
  const blast = blastFactor(caliber) * (a / 10) * fireMul;
  const hpBefore = ac.hp;
  let event: string | null = null;
  let explode = false;

  switch (part) {
    case 'structure':
      ac.hp -= a * K.structure;
      // Bomba yükü dolu uçağa top isabeti
      if (ac.bombCount > 0 && Math.random() < 0.06 * blast) explode = true;
      break;
    case 'engine': {
      const i = Math.floor(Math.random() * dmg.engines.length);
      const before = dmg.engines[i];
      dmg.engines[i] = clamp(before + a * K.engine, 0, 1);
      ac.hp -= a * 0.45 * K.structure;
      if (before < 1 && dmg.engines[i] >= 1) event = s.engines > 1 ? L(`${i + 1}. motor durdu`, `engine ${i + 1} out`) : L('motor durdu', 'engine out');
      // Çok motorlu uçağın motor yangın söndürücüsü vardır
      if (dmg.fire <= 0 && Math.random() < chance(a * K.engineFire * fireMul) * (s.engines > 1 ? 0.6 : 1)) {
        dmg.fire = 0.01;
        dmg.fireSource = 'engine';
        event = L('motor yanıyor!', 'engine on fire!');
      } else if (s.engine.kind !== 'jet' && Math.random() < (s.engine.kind === 'inline' ? 0.45 : 0.15)) {
        // Sıvı soğutmalı motorun radyatörü tek mermiyle delinebilir; radyal motorda yağ hattı daha korunaklı
        if (dmg.coolant <= 0) event = s.engine.kind === 'inline' ? L('radyatör delindi, soğutma sıvısı kaçırıyor', 'radiator holed, losing coolant') : L('yağ kaçırıyor', 'losing oil');
        dmg.coolant += a * K.coolant;
      }
      break;
    }
    case 'controls':
      dmg.controls = clamp(dmg.controls + (a * K.controls) / sz, 0, 1);
      ac.hp -= a * 0.45 * K.structure;
      break;
    case 'wings':
      dmg.wings = clamp(dmg.wings + (a * K.wings) / sz, 0, 1);
      ac.hp -= a * 0.65 * K.structure;
      break;
    case 'fuel': {
      dmg.fuelLeak += a * 0.15 * seal;
      ac.hp -= a * 0.35 * K.structure;
      // Top mermisi depoda: anında infilak ihtimali (boşalan depodaki buhar daha tehlikeli)
      const vapor = 1 + 0.6 * (1 - ac.fuel / Math.max(ac.fuelCap, 1));
      // Büyük uçağın deposu (geniş kanat) tek mermiyle uçağı parçalamaz: yangın çıkar, anında infilak daha seyrek
      if (Math.random() < (0.65 * blast * seal * vapor) / Math.sqrt(sz)) explode = true;
      else if (dmg.fire <= 0 && Math.random() < chance(a * K.fuelFire * seal * fireMul)) {
        dmg.fire = 0.01;
        dmg.fireSource = 'fuel';
        event = L('yakıt deposu yanıyor!', 'fuel tank on fire!');
      } else if (dmg.fuelLeak > 1.5 && dmg.fuelLeak - a * 0.15 * seal <= 1.5) {
        event = L('yakıt sızdırıyor', 'leaking fuel');
      }
      break;
    }
    case 'pilot': {
      ac.hp -= a * 0.3 * K.structure;
      // Kokpite isabet her zaman pilotu vurmaz. Top mermisi çoğunlukla öldürür ya da ağır yaralar; yaralı pilot
      // ikinci isabette ölebilir. Kalabalık mürettebatlı uçakta ikinci pilot devralır: ölüm uçağı düşürmez sayılır.
      if (Math.random() < chance(a * K.pilot)) {
        const crewed = s.crew >= 3 ? 0.3 : 1;
        const lethal = (caliber === 'cannon' ? 0.5 : 0.3) * crewed;
        if (dmg.pilot === 0 && Math.random() >= lethal) {
          dmg.pilot = 1;
          event = s.crew >= 3 ? L('mürettebat yaralandı', 'crew wounded') : L('pilot yaralandı', 'pilot wounded');
        } else if (dmg.pilot === 0 || Math.random() < 0.6 * crewed) {
          dmg.pilot = 2;
        }
      }
      break;
    }
  }

  let fatal: string | null = null;
  if (explode) fatal = 'havada infilak etti';
  else if (dmg.pilot === 2) fatal = 'pilot öldü';
  else if (dmg.controls >= 1) fatal = 'kumanda kaybı';
  else if (dmg.wings >= 1) fatal = 'kanat koptu';
  else if (ac.hp <= 0) {
    // Ağır son isabet (ör. 30 mm, flak) gövdeyi tek seferde dağıtır
    const overkill = hpBefore - ac.hp > ac.hpMax * 0.18 || ac.hp < -ac.hpMax * 0.15;
    if (overkill || Math.random() < 0.7) {
      explode = true;
      fatal = 'havada parçalandı';
    } else fatal = 'parçalandı';
  }
  return { part, event, fatal, explode };
}

export interface DamageEffects {
  thrustMul: number;
  rollMul: number;
  gOnsetMul: number;
  nMaxMul: number;
  dragMul: number;
}

export function damageEffects(d: DamageState): DamageEffects {
  let thrust = 0;
  for (const e of d.engines) thrust += e >= 1 ? 0 : 1 - 0.75 * e;
  // Hararet yapan motor gücünü kaybeder
  const hot = d.heat > 0.7 ? 1 - (d.heat - 0.7) * 1.6 : 1;
  return {
    thrustMul: (thrust / d.engines.length) * hot,
    rollMul: 1 - 0.6 * d.controls,
    gOnsetMul: (1 - 0.5 * d.controls) * (d.pilot === 1 ? 0.8 : 1),
    nMaxMul: 1 - 0.5 * d.wings,
    dragMul: 1 + 0.4 * d.wings + 0.1 * d.controls,
  };
}

/** Uçak ciddi hasarlı mı (savaştan çekilmeli). */
export function isCrippled(ac: Aircraft): boolean {
  const d = ac.damage;
  const engineBad = d.engines.reduce((m, e) => Math.max(m, e), 0) > 0.55;
  // Yaralı pilot savaşmaya devam eder (nişanı bozulur); başka ağır hasar varsa kopar
  const hpLimit = d.pilot > 0 ? 0.5 : 0.35;
  return d.fire > 0 || engineBad || d.coolant > 0.25 || d.wings > 0.5 || d.controls > 0.5 || d.fuelLeak > 2 || ac.hp < ac.hpMax * hpLimit;
}

export function enginesDead(d: DamageState): boolean {
  return d.engines.every((e) => e >= 1);
}
