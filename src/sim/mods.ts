// Modifikasyonların etkileri. Araştırılan modifikasyon yalnız o tarafın ve uygun olduğu uçaklara uygulanır (radar
// nişangâhı ve fırlatma koltuğu jetlere, G elbisesi avcı pilotlarına…). Uçak açmak için yalnız temel teknoloji gerekir
// (motor, kanat); donanım geliştirmeleri araştırıldıkça uçağın değerlerine eklenir. Uçak kalkarken o anki etkileri alır.

import type { AircraftSpec } from './aircraft/specs';

export interface ModEffects {
  /** Tüm pistonlu motorlar. */
  pistonPowerMul: number;
  inlinePowerMul: number;
  radialPowerMul: number;
  /** Kritik irtifanın altında fazladan güç (yüksek oktan yakıt). */
  lowAltBoost: number;
  /** Sıra motorlarda kritik irtifa artışı (iki kademeli süperşarj). */
  inlineCritAdd: number;
  /** Acil güç (su-metanol / WEP) kullanılabilir. */
  wep: boolean;
  /** Pervane statik itki çarpanı (sabit devirli pervane). */
  staticThrustMul: number;
  jetThrustMul: number;
  /** Gövde dayanımı. */
  hpMul: number;
  selfSealing: boolean;
  pilotArmor: boolean;
  /** Taarruz uçaklarına ek zırh. */
  attackerArmorAdd: number;
  /** Arka görüş (kör nokta azalır). */
  rearViewAdd: number;
  /** Avcı nişan hatası çarpanı. */
  aimMul: number;
  /** Etkili atış menzili çarpanı. */
  fireRangeMul: number;
  /** Top mermisi hasar çarpanı. */
  cannonMul: number;
  /** Makineli mühimmatı çarpanı. */
  mgAmmoMul: number;
  cannonAmmoMul: number;
  turretRateMul: number;
  turretAimMul: number;
  /** Yatay bombardıman nişan hatası çarpanı. */
  bombsightMul: number;
  /** Pike bombardımanı nişan hatası çarpanı. */
  diveAimMul: number;
  /** Tüm saldırı türlerinde hedef nişan hatası (hedef keşif fotoğrafları). */
  strikeAimMul: number;
  /** Roket dağılması çarpanı. */
  rocketSpreadMul: number;
  dropTanks: boolean;
  dropTankMul: number;
  fuelMul: number;
  /** Jetlerde yüksek hızda yuvarlanma (hidrolik kumanda). */
  jetRollMul: number;
  ejectSeat: boolean;
  /** G elbisesi: pilot yüksek G'ye daha uzun dayanır (yorgunluk eşiği yüksek, birikim yavaş). */
  gSuit: boolean;
}

export const BASE_MODS: ModEffects = {
  pistonPowerMul: 1,
  inlinePowerMul: 1,
  radialPowerMul: 1,
  lowAltBoost: 0,
  inlineCritAdd: 0,
  wep: false,
  staticThrustMul: 1,
  jetThrustMul: 1,
  hpMul: 1,
  selfSealing: false,
  pilotArmor: false,
  attackerArmorAdd: 0,
  rearViewAdd: 0,
  aimMul: 1,
  fireRangeMul: 1,
  cannonMul: 1,
  mgAmmoMul: 1,
  cannonAmmoMul: 1,
  turretRateMul: 1,
  turretAimMul: 1,
  bombsightMul: 1,
  diveAimMul: 1,
  strikeAimMul: 1,
  rocketSpreadMul: 1,
  dropTanks: false,
  dropTankMul: 1,
  fuelMul: 1,
  jetRollMul: 1,
  ejectSeat: false,
  gSuit: false,
};

type Apply = (m: ModEffects) => void;
type Applies = (s: AircraftSpec) => boolean;

const jet: Applies = (s) => s.engine.kind === 'jet';
const piston: Applies = (s) => s.engine.kind !== 'jet';
const fighter: Applies = (s) => s.role === 'fighter';
const turreted: Applies = (s) => s.turrets.length > 0;
const inline: Applies = (s) => s.engine.kind === 'inline';
const radial: Applies = (s) => s.engine.kind === 'radial';
const fixedGuns: Applies = (s) => s.guns.length > 0;
/** Yatay bombardıman ya da pike yapabilen (nişangâh ve keşif fotoğrafı bunlara yarar). */
const bombing: Applies = (s) => s.role === 'bomber' || s.role === 'diveBomber' || !!s.dive;

/** Modifikasyon kimliği → etkisi ve (varsa) uygulandığı uçaklar. */
const EFFECTS: Record<string, { apply: Apply; applies?: Applies }> = {
  m_vp_prop: { apply: (m) => { m.staticThrustMul *= 1.18; }, applies: piston },
  m_v12: { apply: (m) => { m.inlinePowerMul *= 1.06; }, applies: inline },
  m_100oct: { apply: (m) => { m.lowAltBoost += 0.14; }, applies: piston },
  m_radial1: { apply: (m) => { m.radialPowerMul *= 1.06; }, applies: radial },
  // İki kademeli süperşarj zaten iki kademeli motoru olan (Merlin 66, V-1650-7) uçağa bir şey katmaz
  m_2stage: { apply: (m) => { m.inlineCritAdd += 600; }, applies: (s) => inline(s) && !s.engine.twoStage },
  m_wep: { apply: (m) => { m.wep = true; }, applies: piston },
  m_radial2: { apply: (m) => { m.radialPowerMul *= 1.06; }, applies: radial },
  self_sealing: { apply: (m) => { m.selfSealing = true; } },
  pilot_armor: { apply: (m) => { m.pilotArmor = true; } },
  a_metal: { apply: (m) => { m.hpMul *= 1.12; } },
  a_bubble: { apply: (m) => { m.rearViewAdd += 0.15; }, applies: (s) => s.crew === 1 },
  a_tub: { apply: (m) => { m.attackerArmorAdd += 0.1; }, applies: (s) => s.role === 'attacker' },
  p_gsuit: { apply: (m) => { m.gSuit = true; }, applies: fighter },
  w_mg8: { apply: (m) => { m.mgAmmoMul *= 1.25; }, applies: (s) => s.guns.some((g) => g.caliber !== 'cannon') },
  w_20mm: { apply: (m) => { m.cannonAmmoMul *= 1.3; }, applies: (s) => s.guns.some((g) => g.caliber === 'cannon') },
  w_turret: { apply: (m) => { m.turretRateMul *= 1.4; }, applies: turreted },
  w_hispano: { apply: (m) => { m.cannonMul *= 1.12; }, applies: (s) => s.guns.some((g) => g.caliber === 'cannon') },
  // Motorlu taret ağır bombardıman uçağına göre; pike ve avcı uçağının arka nişancısı elle tutulan tek makinelidir
  w_power_turret: { apply: (m) => { m.turretAimMul *= 0.72; }, applies: (s) => turreted(s) && s.role === 'bomber' },
  n_reflector: { apply: (m) => { m.aimMul *= 0.85; }, applies: fixedGuns },
  n_gyro: { apply: (m) => { m.aimMul *= 0.78; m.fireRangeMul *= 1.2; }, applies: fixedGuns },
  bombsight2: { apply: (m) => { m.bombsightMul *= 0.5; }, applies: (s) => s.role === 'bomber' },
  n_divesight: { apply: (m) => { m.diveAimMul *= 0.6; }, applies: (s) => s.role === 'diveBomber' || !!s.dive },
  n_recon: { apply: (m) => { m.strikeAimMul *= 0.75; }, applies: bombing },
  n_rocketsight: { apply: (m) => { m.rocketSpreadMul *= 0.6; }, applies: (s) => s.loadouts.some((l) => (l.rocketCount ?? 0) > 0) },
  drop_tanks: { apply: (m) => { m.dropTanks = true; }, applies: (s) => s.loadouts.some((l) => (l.tankFuel ?? 0) > 0) },
  f_bigtank: { apply: (m) => { m.dropTankMul *= 1.6; }, applies: (s) => s.loadouts.some((l) => (l.tankFuel ?? 0) > 0) },
  f_internal: { apply: (m) => { m.fuelMul *= 1.15; } },
  j_nene: { apply: (m) => { m.jetThrustMul *= 1.05; }, applies: jet },
  j_eject: { apply: (m) => { m.ejectSeat = true; }, applies: jet },
  j_hydraulic: { apply: (m) => { m.jetRollMul *= 1.7; }, applies: jet },
  // Burun radarı ve hesaplayıcı yalnız jet avcılarına sığar (A-1CM / APG-30)
  j_radarsight: { apply: (m) => { m.aimMul *= 0.72; m.fireRangeMul *= 1.15; }, applies: (s) => jet(s) && fighter(s) },
};

/** Araştırılmış modifikasyonların etkisi; uçak verilirse yalnız ona uygun olanlar. */
export function computeMods(done: Iterable<string>, spec?: AircraftSpec): ModEffects {
  const m: ModEffects = { ...BASE_MODS };
  for (const id of done) {
    const e = EFFECTS[id];
    if (e && (!spec || !e.applies || e.applies(spec))) e.apply(m);
  }
  return m;
}

/** Bu modifikasyonun bir etkisi var mı ve bu uçağa uygulanır mı (hangar listesi için). */
export function modAppliesTo(id: string, spec: AircraftSpec): boolean {
  const e = EFFECTS[id];
  return !!e && (!e.applies || e.applies(spec));
}
