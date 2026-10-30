// Uçak katalogu: gerçek uçaklardan alınmış kütle, kanat, motor ve silah verileri (yaklaşık değerler).
// Sürükleme katsayısı (Cd0) her uçağın bilinen azami hızına göre kalibre edilir; tırmanış, tavan,
// seyir hızı, menzil ve dönüş performansı aynı fizik modelinden türetilir. Tüm sayılar SI birimindedir.

import { BASE_MODS } from '../mods';
import { RHO0, sigma, soundSpeed } from '../atmosphere';
import { dragAt, fuelFlowAt, inducedK, liftLimitG, stallSpeedAt, sustainableLoad, thrustAt, waveCd, type ThrustState } from './aero';
import { G, clamp } from '../../core/math';
import { BOMBS, ROCKETS, STORE_TABLE, buildLoadouts, familyOf, type Family, type Hardpoint } from './stores';
import { EN, L, terms } from '../../i18n';
import { DESC_EN, NAME_EN, ORIGIN_EN } from './specsEn';

export type GenerationId = 'P1' | 'P2' | 'J1' | 'J2' | 'J3' | 'J4' | 'J45' | 'J5';
export type Role = 'fighter' | 'diveBomber' | 'bomber' | 'attacker';
/** turn: dönüş savaşına girer. energy: dal-vur-tırman (boom & zoom). */
export type Tactic = 'turn' | 'energy';
export type Caliber = 'small' | 'heavy' | 'cannon';
export type EngineKind = 'inline' | 'radial' | 'jet';

export interface GenerationInfo {
  id: GenerationId;
  label: string;
  name: string;
  era: string;
  summary: string;
  tech: string[];
  /** Bu sürümde savaşabiliyor mu (füze/radar gerektirmeyen nesiller). */
  playable: boolean;
}

export const GENERATIONS: GenerationInfo[] = [
  {
    id: 'P1', label: 'P1', name: L('Erken pervaneli', 'Early piston'), era: '1936–1941', playable: true,
    summary: L('Makineli tüfekler, ilk toplar ve gözle tespit. Dönüş savaşı, pike ve yatay bombardıman dönemi.',
      'Machine guns, the first cannon and visual spotting. The era of turn fights, dive bombing and level bombing.'),
    tech: EN ? ['Inline engine (V12)', 'Machine-gun battery', 'Dive brakes', 'Defensive turrets'] : ['Sıra motor (V12)', 'Makineli bataryası', 'Pike freni', 'Savunma taretleri'],
  },
  {
    id: 'P2', label: 'P2', name: L('Gelişmiş pervaneli', 'Late piston'), era: '1941–1945', playable: true,
    summary: L('2000 bg motorlar, iki kademeli süperşarj, acil güç, zırhlı taarruz uçakları ve roketler. Enerji taktiği öne çıkar.',
      '2000 hp engines, two-stage superchargers, emergency power, armoured attack aircraft and rockets. Energy tactics come to the fore.'),
    tech: EN ? ['Two-stage supercharger', 'Water-methanol injection', 'Armour', 'Rockets', 'Gyro gunsight'] : ['İki kademeli süperşarj', 'Su-metanol enjeksiyonu', 'Zırh', 'Roket', 'Jiroskoplu nişangâh'],
  },
  {
    id: 'J1', label: 'J1', name: L('1. nesil jet', '1st-gen jet'), era: '1944–1955', playable: true,
    summary: L('Turbojet ve ok kanat. Silah hâlâ yalnızca top; hız her şeydir. Erken jetlerde gaz tepkisi yavaştır.',
      'Turbojets and swept wings. Guns are still the only weapon; speed is everything. Early jets respond slowly to the throttle.'),
    tech: EN ? ['Turbojet', 'Swept wing', 'Radar-ranging gunsight', 'Ejection seat'] : ['Turbojet', 'Ok kanat', 'Radar telemetreli nişangâh', 'Fırlatma koltuğu'],
  },
  {
    id: 'J2', label: 'J2', name: L('2. nesil jet', '2nd-gen jet'), era: '1955–1965', playable: false,
    summary: L('Süpersonik hız, ilk ısı güdümlü füzeler (yalnız arka sektör), basit menzil radarı.',
      'Supersonic speed, the first heat-seeking missiles (rear aspect only), a simple ranging radar.'),
    tech: EN ? ['Afterburner', 'IR missile (rear aspect)', 'Ranging radar'] : ['Art yakıcı', 'IR füze (arka sektör)', 'Menzil radarı'],
  },
  {
    id: 'J3', label: 'J3', name: L('3. nesil jet', '3rd-gen jet'), era: '1965–1975', playable: false,
    summary: L('Yarı aktif radar güdümlü füzelerle görüş ötesi çatışma. Füze vurana kadar radar kilidi korunmalı.',
      'Beyond-visual-range combat with semi-active radar missiles. The radar lock must be held until the missile hits.'),
    tech: EN ? ['SARH missile', 'Pulse radar', 'Radar warning receiver'] : ['SARH füze', 'Darbeli radar', 'Radar ikaz alıcısı'],
  },
  {
    id: 'J4', label: 'J4', name: L('4. nesil jet', '4th-gen jet'), era: '1975–1990', playable: false,
    summary: L('Yüksek manevra, aşağı bakabilen darbeli-doppler radar, her açıdan IR füze, chaff ve flare.',
      'High agility, look-down pulse-Doppler radar, all-aspect IR missiles, chaff and flares.'),
    tech: EN ? ['Pulse-Doppler radar', 'All-aspect IR', 'Fly-by-wire', 'Chaff / flare'] : ['Darbeli-doppler radar', 'Her açıdan IR', 'Fly-by-wire', 'Chaff / flare'],
  },
  {
    id: 'J45', label: 'J4.5', name: L('4.5 nesil jet', '4.5-gen jet'), era: '1990–2005', playable: false,
    summary: L('Aktif radar güdümlü ateşle-unut füzeler, AESA radar, veri bağı, kanard tasarımlar.',
      'Fire-and-forget active radar missiles, AESA radar, data links, canard designs.'),
    tech: EN ? ['ARH missile', 'AESA', 'Data link'] : ['ARH füze', 'AESA', 'Veri bağı'],
  },
  {
    id: 'J5', label: 'J5', name: L('5. nesil jet', '5th-gen jet'), era: '2005+', playable: false,
    summary: L('Düşük radar izi, süper seyir ve sensör füzyonu. Önce gören, önce vurur.',
      'Low observability, supercruise and sensor fusion. Whoever sees first, shoots first.'),
    tech: EN ? ['Low observability', 'Supercruise', 'Sensor fusion'] : ['Düşük radar izi', 'Süper seyir', 'Sensör füzyonu'],
  },
];

/**
 * Silah yerleşimi. Kanat silahları yakınsama mesafesinde kesişir (önünde ve ötesinde mermiler yana dağılır);
 * gövde/burun ve göbek silahları eksen boyunca paraleldir. Pervane içinden ateşleyen senkronize silahlar
 * (motor kaputu, kanat kökü) senkronizasyon yüzünden daha yavaş atar.
 */
export type GunMount = 'wing' | 'root' | 'cowl' | 'nose' | 'hub' | 'pod';

export const MOUNT_NAMES: Record<GunMount, string> = {
  wing: L('kanat', 'wing'), root: L('kanat kökü, senkronize', 'wing root, synchronised'), cowl: L('motor kaputu, senkronize', 'cowling, synchronised'),
  nose: L('burun', 'nose'), hub: L('pervane göbeği', 'propeller hub'), pod: L('gondol', 'pod'),
};

/** Senkronize silahın atış hızı çarpanı. */
export const SYNC_RATE = 0.85;
/** Kanat silahlarının yakınsama mesafesi (m): dönemin tipik ayarı ~230–275 m. */
export const CONVERGENCE = 250;

export interface GunSpec {
  name: string;
  caliber: Caliber;
  mount: GunMount;
  /** Gövde ekseninden yanal uzaklık (m). Çift taraflıda iki kanada dönüşümlü; tek silahta işaret tarafı (− sol). */
  x: number;
  /** Silahlar iki kanatta (ya da iki yanda) mı. */
  paired: boolean;
  /** Saniyede simüle edilen mermi (her mermi birkaç gerçek mermiyi temsil eder). */
  rate: number;
  damage: number;
  muzzleVel: number;
  /** Saçılma (radyan). */
  dispersion: number;
  range: number;
  ammo: number;
}

export interface BombDef {
  name: string;
  mass: number;
  blastRadius: number;
  damage: number;
}

export interface RocketDef {
  name: string;
  damage: number;
  blastRadius: number;
  speed: number;
  mass: number;
}

/** Bir askı noktasına takılan yük: askı başına n adet (çift askıda toplam 2n). */
export interface Placement {
  hp: string;
  store: string;
  n: number;
}

/** Dış yük düzeni (hazır ya da oyuncunun serbest seçtiği) ve özetleri. */
export interface Loadout {
  id: string;
  name: string;
  place: Placement[];
  /** Silah kiti: ana silahların yerine geçen silahlar (ör. burun topu değişimi). */
  replaceGuns?: GunSpec[];
  /** Gereken araştırmalar. */
  reqs: string[];
  bombCount: number;
  bombKg: number;
  /** En ağır tek bomba (kg). */
  maxBombKg: number;
  rocketCount: number;
  /** Atılabilir tanklardaki yakıt (kg). */
  tankFuel: number;
  /** Top gondollarının silahları. */
  extraGuns?: GunSpec[];
  /** Toplam yük kütlesi (kg). */
  mass: number;
  /** Dış yüklerin parazit sürüklemeye katkısı. */
  drag: number;
}

/** Katalog tanımındaki eski biçim (yalnız silah kitlerini okumak için). */
interface LegacyLoadout {
  id: string;
  name: string;
  bombs?: { def: BombDef; count: number };
  rockets?: { def: RocketDef; count: number };
  tankKg?: number;
  extraGuns?: GunSpec[];
  replaceGuns?: GunSpec[];
  drag: number;
  mass?: number;
  requires?: string;
}

/** Savunma tareti. yaw: buruna göre merkez açı (derece, sağa pozitif, 180 = arka). */
export interface TurretSpec {
  name: string;
  offset: [number, number, number];
  yaw: number;
  yawHalf: number;
  pitchMin: number;
  pitchMax: number;
  gun: GunSpec;
  /** Motorlu taret (yansıtıcı nişangâh, sabit platform); yoksa elle tutulan, açık nişangâhlı silah. */
  power: boolean;
}

export interface DiveProfile {
  /** Dalışa geçilen bakış açısı (derece). */
  diveAngle: number;
  /** Bırakma irtifası (hedefe göre, m). */
  releaseAlt: number;
}

export interface EngineSpec {
  name: string;
  kind: EngineKind;
  count: number;
  /** Pistonlu: motor başına askerî güç (kW), kritik irtifada. */
  kw?: number;
  /** Kritik (tam gaz) irtifa (m). */
  critAlt: number;
  /** İki kademeli / turbo süperşarj: kritik irtifa zaten yüksek. */
  twoStage?: boolean;
  /** Deniz seviyesindeki gücün kritik irtifadaki güce oranı (kalkış gücü yüksek motorlarda > 1). */
  sl?: number;
  /** Acil güç çarpanı (1 = yok). */
  wep: number;
  propEff: number;
  /** Jet: motor başına kuru itki (kN). */
  kn?: number;
  /** Art yakıcılı itki (kN). */
  abKn?: number;
  /** Rölantiden tam devire süre (s). */
  spool: number;
  /** Jet özgül yakıt tüketimi (kg / N·saat). */
  tsfc: number;
  /**
   * İrtifa düşüşü üssü: pistonluda kritik irtifanın üstünde güç (σ/σkrit)^lapse, jette itki σ^lapse. Elle yazılmaz:
   * uçağın CEILINGS'te tavanı varsa türetmede o tavana göre bulunur, yoksa varsayılan (aero.ts PISTON_LAPSE, JET_LAPSE).
   */
  lapse?: number;
  /**
   * Şamandıralı karbüratör: eksi G'de yakıt kesilir, motor bir an susar (erken Merlin, Sakae, M-63, VK-105).
   * 1 = tam etki, 0,5 = kısıtlayıcıyla hafifletilmiş (1941 "Miss Shilling" deliği). Püskürtmeli ve basınçlı
   * karbüratörlü motorlarda (DB 601/605, BMW 801, ASh-82FN, Allison, Packard Merlin) yok.
   */
  floatCarb?: number;
}

export interface PerfTable {
  alt: number[];
  vmax: number[];
  climb: number[];
}

export interface AircraftSpec {
  id: string;
  /** Gerçek adı. */
  name: string;
  /** Kısa etiket. */
  abbr: string;
  origin: string;
  year: number;
  generation: GenerationId;
  role: Role;
  /** Model anahtarı (render/models). */
  model: string;
  description: string;
  hp: number;
  /** Kaba boyut (m): nişan konisi ve dayanıklılık için. İsabet gerçek ölçülerle sınanır (hitbox.ts). */
  size: number;
  /** Gövde uzunluğu (m). */
  length: number;
  /** Hayati bölge zırhı: 0 yok … 0.8 ağır zırh. */
  armor: number;
  crew: number;
  engines: number;
  engine: EngineSpec;
  /** Yakıt ve dış yük hariç kütle (mürettebat, mühimmat, yağ dahil), kg. */
  massEmpty: number;
  /** İç tank yakıtı (kg). */
  fuelKg: number;
  wingArea: number;
  span: number;
  clMax: number;
  oswald: number;
  /** Parazit sürükleme katsayısı (azami hıza göre kalibre). */
  cd0: number;
  /** Dalga sürüklemesi tavanı (ΔCd). */
  cdWave: number;
  /** Kritik Mach sayısı. */
  mcrit: number;
  /** Sürükleme ıraksama Mach'ı: dalga sürüklemesi bunun ötesinde dik yükselir (aero.ts waveCd). */
  mdd: number;
  /** Yüksek Mach'ta burun düşmesi / kumanda kilitlenmesi (0..1). */
  machTuck: number;
  /** Aşılmaması gereken gösterge hızı (m/s). */
  vne: number;
  /** Yapısal / pilot G sınırı. */
  nMax: number;
  /** Azami yuvarlanma hızı (rad/s), rollIas gösterge hızında. */
  rollPeak: number;
  rollIas: number;
  /** rollIas üstünde yuvarlanmanın sıfıra indiği hız payı (m/s). */
  rollFade: number;
  /** G artış hızı (G/s). */
  gOnset: number;
  /** Arka görüş (0 kör … 1 tam). */
  rearView: number;
  diveBrakes: boolean;
  tactic: Tactic;
  visualRange: number;
  /** Kuyruk tekerlekli (yerde burnu havada durur). */
  tailDragger: boolean;
  guns: GunSpec[];
  turrets: TurretSpec[];
  loadouts: Loadout[];
  /** Dış yük askı noktaları ve azami yük. */
  hardpoints: Hardpoint[];
  maxLoad: number;
  /** Mühimmat ailesi (ülke). */
  family: Family;
  dive?: DiveProfile;
  /** Fabrikada üretim süresi (s). */
  buildTime: number;
  cruiseAlt: number;
  /** Bu sürümde uçurulabilir mi. */
  playable: boolean;
  /**
   * Tutunma kaybında vrilleye girme eğilimi (1 = ortalama). Uyarısız sert "snap" yapan uçak (MiG-15, Fw 190, I-16)
   * yüksek; tutunmadan önce sarsıntıyla uyaran, uysal uçak (Spitfire, Hurricane, Hellcat) düşük.
   */
  spinProne: number;

  // --- Türetilmiş performans
  /** Azami hız (gerçek, m/s) ve irtifası. */
  vMax: number;
  vMaxAlt: number;
  vMaxSL: number;
  /** Deniz seviyesinde 1G tutunma hızı (tipik ağırlık). */
  vStall: number;
  vDive: number;
  /** Köşe hızında sürdürülebilir G (deniz seviyesi). */
  nSustain: number;
  /** Statik itki ivmesi (m/s²). */
  thrust: number;
  /** Deniz seviyesinde tırmanma hızı (m/s). */
  climbRate: number;
  ceiling: number;
  cruiseSpeed: number;
  cruiseThrottle: number;
  /** Seyirde yakıt akışı (kg/s). */
  cruiseFlow: number;
  fuelMinutes: number;
  /** Deniz seviyesinde en iyi sürdürülebilir 360° dönüş süresi (s) ve hızı. */
  turnTime: number;
  turnSpeed: number;
  perf: PerfTable;
}

const d = (deg: number) => (deg * Math.PI) / 180;
const kmh = (v: number) => v / 3.6;

// ---------------------------------------------------------------- mühimmat

export { BOMBS, ROCKETS };

interface GunType {
  name: string;
  caliber: Caliber;
  rpm: number;
  /** Gerçek mermi başına hasar. */
  dmg: number;
  mv: number;
  disp: number;
  range: number;
}

const GT: Record<string, GunType> = {
  mg77: { name: '7,7 mm Browning', caliber: 'small', rpm: 1150, dmg: 0.62, mv: 745, disp: 0.019, range: 600 },
  mg792: { name: '7,92 mm MG 17', caliber: 'small', rpm: 1100, dmg: 0.62, mv: 755, disp: 0.019, range: 600 },
  mg15: { name: '7,92 mm MG 15', caliber: 'small', rpm: 1000, dmg: 0.62, mv: 755, disp: 0.02, range: 550 },
  mg81: { name: '7,92 mm MG 81', caliber: 'small', rpm: 1500, dmg: 0.62, mv: 755, disp: 0.02, range: 550 },
  mg762: { name: '7,62 mm ShKAS', caliber: 'small', rpm: 1800, dmg: 0.55, mv: 825, disp: 0.02, range: 600 },
  m1919: { name: '7,62 mm M1919', caliber: 'small', rpm: 1200, dmg: 0.6, mv: 850, disp: 0.02, range: 600 },
  mg127: { name: '12,7 mm M2', caliber: 'heavy', rpm: 800, dmg: 1.4, mv: 870, disp: 0.016, range: 750 },
  ubt: { name: '12,7 mm UB', caliber: 'heavy', rpm: 1000, dmg: 1.4, mv: 860, disp: 0.017, range: 700 },
  mg131: { name: '13 mm MG 131', caliber: 'heavy', rpm: 900, dmg: 1.3, mv: 750, disp: 0.017, range: 700 },
  ff: { name: '20 mm MG FF', caliber: 'cannon', rpm: 520, dmg: 3.8, mv: 600, disp: 0.02, range: 550 },
  // MG FF/M (1940'tan): ince cidarlı yüksek patlayıcılı "Minengeschoss" (MG 151/20'ninkiyle aynı mermi), daha hızlı
  ffm: { name: '20 mm MG FF/M', caliber: 'cannon', rpm: 540, dmg: 5.5, mv: 700, disp: 0.02, range: 600 },
  mg151: { name: '20 mm MG 151/20', caliber: 'cannon', rpm: 700, dmg: 6, mv: 790, disp: 0.016, range: 700 },
  hisp: { name: '20 mm Hispano', caliber: 'cannon', rpm: 600, dmg: 5.5, mv: 880, disp: 0.015, range: 750 },
  shvak: { name: '20 mm ShVAK', caliber: 'cannon', rpm: 750, dmg: 4.5, mv: 790, disp: 0.017, range: 700 },
  vya: { name: '23 mm VYa', caliber: 'cannon', rpm: 600, dmg: 7.5, mv: 905, disp: 0.016, range: 750 },
  ns23: { name: '23 mm NS-23', caliber: 'cannon', rpm: 550, dmg: 7, mv: 690, disp: 0.017, range: 700 },
  nr23: { name: '23 mm NR-23', caliber: 'cannon', rpm: 850, dmg: 6, mv: 680, disp: 0.016, range: 750 },
  mk108: { name: '30 mm MK 108', caliber: 'cannon', rpm: 650, dmg: 22, mv: 540, disp: 0.02, range: 450 },
  n37: { name: '37 mm N-37', caliber: 'cannon', rpm: 400, dmg: 18, mv: 690, disp: 0.018, range: 800 },
};

/**
 * Silah grubu: count adet, namlu başına rpg mermi, yerleşim ve (kanatta) gövde ekseninden yanal uzaklık.
 * Simüle mermi başına birkaç gerçek mermi düşer.
 */
function gun(type: keyof typeof GT, count: number, rpg: number, mount: GunMount = 'nose', x = 0): GunSpec {
  const t = GT[type];
  const sync = mount === 'cowl' || mount === 'root';
  const rps = (count * t.rpm * (sync ? SYNC_RATE : 1)) / 60;
  const k = Math.max(1, Math.ceil(rps / (t.caliber === 'cannon' ? 12 : 16)));
  return {
    // İngilizcede ondalık nokta: "7,7 mm" → "7.7 mm" (baştaki "N × " sesler için okunuyor, değişmez)
    name: `${count > 1 ? `${count} × ` : ''}${EN ? t.name.replace(/(\d),(\d)/g, '$1.$2') : t.name} (${MOUNT_NAMES[mount]})`,
    caliber: t.caliber,
    mount,
    x,
    paired: count >= 2 && (mount === 'wing' || mount === 'root'),
    rate: rps / k,
    damage: t.dmg * k,
    muzzleVel: t.mv,
    dispersion: t.disp,
    range: t.range,
    ammo: Math.max(1, Math.round((count * rpg) / k)),
  };
}

function turret(name: string, offset: [number, number, number], yaw: number, yawHalf: number, pitch: [number, number], g: GunSpec, power = false): TurretSpec {
  return { name: turretName(name), offset, yaw, yawHalf, pitchMin: pitch[0], pitchMax: pitch[1], gun: g, power };
}

/** Taret adları İngilizcede (uzun ifadeler önce). */
const turretName = terms([
  ['Burun altı', 'Under-nose'],
  ['Arka karın', 'Rear ventral'],
  ['Arka nişancı', 'Rear gunner'],
  ['Arka sırt', 'Rear dorsal'],
  ['Karın gondolu', 'Ventral gondola'],
  ['Kokpit arkası', 'Behind cockpit'],
  ['Küre taret', 'Ball turret'],
  ['Sırt taret', 'Top turret'],
  ['Ön karın', 'Front ventral'],
  ['Ön sırt', 'Front dorsal'],
  ['Sağ yanak', 'Right cheek'],
  ['Sol yanak', 'Left cheek'],
  ['Sağ bel', 'Right waist'],
  ['Sol bel', 'Left waist'],
  ['Sağ yan', 'Right side'],
  ['Sol yan', 'Left side'],
  ['Telsizci', 'Radio operator'],
  ['Burun', 'Nose'],
  ['Karın', 'Ventral'],
  ['Kuyruk', 'Tail'],
  ['Sırt', 'Dorsal'],
  ['Çene', 'Chin'],
  ['geriye', 'rearward'],
  ['uzaktan', 'remote'],
  ['dörtlü', 'quad'],
  ['çift', 'twin'],
]);

/** Ülke adı (ekranda). Veride Türkçe ad anahtar olarak kalır (mühimmat ailesi, işaretler). */
export const originName = (o: string): string => (EN ? ORIGIN_EN[o] ?? o : o);

const STD: LegacyLoadout = { id: 'std', name: 'Standart', drag: 0 };
const tank = (kg: number, req = 'drop_tanks', name = 'Atılabilir yakıt tankı', id = 'tank'): LegacyLoadout => ({
  id, name: `${name} (+${Math.round(kg)} kg yakıt)`, tankKg: kg, drag: 0.07, mass: kg * 0.12, requires: req,
});
const bombs = (id: string, name: string, def: BombDef, count: number, drag: number, requires?: string): LegacyLoadout => ({
  id, name, bombs: { def, count }, drag, requires,
});

// ---------------------------------------------------------------- uçaklar

interface AircraftDef {
  id: string;
  name: string;
  abbr: string;
  origin: string;
  year: number;
  generation: GenerationId;
  role: Role;
  model: string;
  description: string;
  hp: number;
  armor: number;
  crew: number;
  engine: EngineSpec;
  massEmpty: number;
  fuelKg: number;
  wingArea: number;
  span: number;
  clMax: number;
  oswald?: number;
  mcrit: number;
  /** Sürükleme ıraksama Mach'ı (yoksa mcrit + 0,1, Lock kuralının ΔCd ≈ 0,002 noktası). */
  mdd?: number;
  cdWave?: number;
  machTuck?: number;
  vneKmh: number;
  nMax: number;
  /** [tepe °/sn, tepe hızı km/sa (gösterge), sönme payı km/sa]. */
  roll: [number, number, number];
  gOnset?: number;
  rearView?: number;
  diveBrakes?: boolean;
  tactic: Tactic;
  visualRange?: number;
  tailDragger: boolean;
  guns: GunSpec[];
  turrets?: TurretSpec[];
  loadouts: LegacyLoadout[];
  dive?: DiveProfile;
  buildTime: number;
  cruiseAlt: number;
  /** Kalibrasyon: bilinen azami hız ve irtifası. */
  vmaxKmh: number;
  vmaxAlt: number;
  playable?: boolean;
}

const inline = (name: string, kw: number, critAlt: number, o: Partial<EngineSpec> = {}): EngineSpec => ({
  name, kind: 'inline', count: 1, kw, critAlt, wep: 1, propEff: 0.81, spool: 0.6, tsfc: 0, ...o,
});
const radial = (name: string, kw: number, critAlt: number, o: Partial<EngineSpec> = {}): EngineSpec => ({
  name, kind: 'radial', count: 1, kw, critAlt, wep: 1, propEff: 0.8, spool: 0.6, tsfc: 0, ...o,
});
const jet = (name: string, kn: number, o: Partial<EngineSpec> = {}): EngineSpec => ({
  name, kind: 'jet', count: 1, kn, critAlt: 11000, wep: 1, propEff: 0, spool: 6, tsfc: 0.12, ...o,
});

// Başarım ayarı: azami hız (vmaxKmh) Cd0 ile birebir tutturulur. massEmpty pilot, cephane ve yağ dahildir (normal kalkış
// ağırlığı − iç yakıt; belgelerdeki "boş ağırlık" değil). Avcılarda pervane verimi (propEff) deniz seviyesi
// tırmanışına, clMax sürekli dönüş süresine göre ayarlandı (savaş dönemi değerleri; clMax 1,2–1,6, verim 0,7–0,9
// aralığında tutuldu). Alçak hızda itki sınırı aero.ts PROP_V1.
const DEFS: AircraftDef[] = [
  // ============================================================ Avcı — dönüş (hafif)
  {
    id: 'hurricane1', name: 'Hawker Hurricane Mk I', abbr: 'Hurricane I', origin: 'Birleşik Krallık', year: 1937,
    generation: 'P1', role: 'fighter', model: 'hurricane',
    description: 'Kalın kanatlı, sağlam ve dönüşte iyi ilk modern İngiliz avcısı. Sekiz makineli tüfekle uzun seriler atar; hızı Bf 109’un gerisinde kalır.',
    hp: 125, armor: 0.1, crew: 1, engine: inline('Rolls-Royce Merlin III', 768, 4950, { propEff: 0.92, sl: 0.86, floatCarb: 1 }),
    massEmpty: 2670, fuelKg: 320, wingArea: 23.9, span: 12.19, clMax: 1.5, oswald: 0.82, mcrit: 0.68, vneKmh: 630, nMax: 7,
    roll: [80, 320, 420], tactic: 'turn', tailDragger: true,
    guns: [gun('mg77', 8, 334, 'wing', 2.7)], loadouts: [STD, tank(160)],
    buildTime: 90, cruiseAlt: 4500, vmaxKmh: 520, vmaxAlt: 5300,
  },
  {
    id: 'spitfire1', name: 'Supermarine Spitfire Mk I', abbr: 'Spitfire I', origin: 'Birleşik Krallık', year: 1938,
    generation: 'P1', role: 'fighter', model: 'spitfire',
    description: 'Eliptik kanadıyla çok iyi dönen, hafif ve zarif avcı. Alçak hızda kanatçıkları hafif, yüksek hızda ağırlaşır. Sekiz makineli tüfek.',
    hp: 115, armor: 0.05, crew: 1, engine: inline('Rolls-Royce Merlin III', 768, 4950, { propEff: 0.87, sl: 0.86, floatCarb: 1 }),
    massEmpty: 2410, fuelKg: 278, wingArea: 22.48, span: 11.23, clMax: 1.48, oswald: 0.7, mcrit: 0.8, vneKmh: 760, nMax: 7,
    roll: [95, 320, 330], tactic: 'turn', tailDragger: true,
    guns: [gun('mg77', 8, 300, 'wing', 2.8)], loadouts: [STD, tank(100, 'drop_tanks', 'Gövde altı tank')],
    buildTime: 110, cruiseAlt: 5000, vmaxKmh: 582, vmaxAlt: 5600,
  },
  {
    id: 'spitfire5', name: 'Supermarine Spitfire Mk Vb', abbr: 'Spitfire Vb', origin: 'Birleşik Krallık', year: 1941,
    generation: 'P2', role: 'fighter', model: 'spitfire',
    description: 'Daha güçlü Merlin 45 ve iki 20 mm Hispano topu. Alçak ve orta irtifada çok iyi; tek kademeli süperşarj yüksekte nefessiz kalır.',
    hp: 125, armor: 0.1, crew: 1, engine: inline('Rolls-Royce Merlin 45', 900, 5800, { propEff: 0.835, sl: 0.98, floatCarb: 0.5 }),
    massEmpty: 2800, fuelKg: 278, wingArea: 22.48, span: 11.23, clMax: 1.46, oswald: 0.74, mcrit: 0.8, vneKmh: 760, nMax: 7,
    roll: [100, 320, 340], tactic: 'turn', tailDragger: true,
    guns: [gun('hisp', 2, 120, 'wing', 1.9), gun('mg77', 4, 350, 'wing', 3.0)], loadouts: [STD, tank(240)],
    buildTime: 120, cruiseAlt: 5000, vmaxKmh: 595, vmaxAlt: 5900,
  },
  {
    id: 'spitfire9', name: 'Supermarine Spitfire Mk IX', abbr: 'Spitfire IX', origin: 'Birleşik Krallık', year: 1942,
    generation: 'P2', role: 'fighter', model: 'spitfire9',
    description: 'İki kademeli süperşarjlı Merlin 66 ve dört palli pervane: her irtifada Fw 190 ile boy ölçüşür. Dönüşte hâlâ çok iyi.',
    hp: 135, armor: 0.12, crew: 1, engine: inline('Rolls-Royce Merlin 66', 1180, 6400, { twoStage: true, wep: 1.1, propEff: 0.774, sl: 1.08 }),
    massEmpty: 3150, fuelKg: 278, wingArea: 22.48, span: 11.23, clMax: 1.47, oswald: 0.71, mcrit: 0.82, vneKmh: 760, nMax: 7,
    roll: [100, 340, 350], tactic: 'turn', tailDragger: true,
    guns: [gun('hisp', 2, 120, 'wing', 1.9), gun('mg127', 2, 250, 'wing', 2.3)],
    loadouts: [STD, tank(240), bombs('fb', 'Avcı-bombardıman: 1 × 500 lb', BOMBS.lb500, 1, 0.05)],
    dive: { diveAngle: 50, releaseAlt: 800 },
    buildTime: 140, cruiseAlt: 6000, vmaxKmh: 650, vmaxAlt: 6400,
  },
  {
    id: 'meteor3', name: 'Gloster Meteor F.3', abbr: 'Meteor F.3', origin: 'Birleşik Krallık', year: 1945,
    generation: 'J1', role: 'fighter', model: 'meteor',
    description: 'İlk İngiliz jet avcısı. Düz kanat, iki santrifüj turbojet. Pervanelilerden çok hızlı ama yavaşta hantal; gazı yavaş açılır.',
    hp: 160, armor: 0.1, crew: 1, engine: jet('2 × Rolls-Royce Derwent I', 8.9, { count: 2, spool: 7, tsfc: 0.12 }),
    massEmpty: 4950, fuelKg: 1180, wingArea: 34.7, span: 13.11, clMax: 1.35, mcrit: 0.72, cdWave: 0.1, machTuck: 0.5, vneKmh: 830, nMax: 7,
    roll: [80, 400, 450], tactic: 'energy', tailDragger: false, rearView: 0.45,
    guns: [gun('hisp', 4, 195, 'nose')], loadouts: [STD, tank(360)],
    buildTime: 200, cruiseAlt: 8000, vmaxKmh: 793, vmaxAlt: 9100,
  },
  {
    id: 'f86f', name: 'North American F-86F Sabre', abbr: 'F-86F', origin: 'ABD', year: 1952,
    generation: 'J1', role: 'fighter', model: 'sabre',
    description: '35° ok kanatlı transonik avcı. Hidrolik kumandalar yüksek hızda bile çevik yuvarlanma verir; radar telemetreli nişangâh uzaktan isabet sağlar.',
    hp: 175, armor: 0.1, crew: 1, engine: jet('General Electric J47-GE-27', 26.3, { spool: 5, tsfc: 0.1 }),
    massEmpty: 5350, fuelKg: 1310, wingArea: 28.1, span: 11.31, clMax: 1.45, oswald: 0.75, mcrit: 0.9, mdd: 0.9, cdWave: 0.06, machTuck: 0.15, vneKmh: 1150, nMax: 8,
    roll: [180, 480, 900], tactic: 'energy', tailDragger: false, rearView: 0.65, gOnset: 8,
    guns: [gun('mg127', 6, 267, 'nose')], loadouts: [STD, tank(720), bombs('fb', '2 × 1000 lb', BOMBS.lb1000, 2, 0.08)],
    dive: { diveAngle: 45, releaseAlt: 900 },
    buildTime: 260, cruiseAlt: 10000, vmaxKmh: 1107, vmaxAlt: 0,
  },
  // ============================================================ Avcı — enerji
  {
    id: 'bf109e', name: 'Messerschmitt Bf 109 E-4', abbr: 'Bf 109 E', origin: 'Almanya', year: 1939,
    generation: 'P1', role: 'fighter', model: 'bf109e',
    description: 'Küçük, hafif kanat uçlu yarıklı (slat) avcı. Tırmanış ve dalışta Hurricane’dan üstün; yüksek hızda kumandası taş gibi ağırlaşır. İki 20 mm MG FF.',
    hp: 110, armor: 0.1, crew: 1, engine: inline('Daimler-Benz DB 601Aa', 750, 4500, { propEff: 0.735, sl: 1.12 }),
    massEmpty: 2330, fuelKg: 290, wingArea: 16.17, span: 9.87, clMax: 1.56, oswald: 0.7, mcrit: 0.75, vneKmh: 750, nMax: 7,
    roll: [100, 300, 280], tactic: 'energy', tailDragger: true,
    guns: [gun('ffm', 2, 60, 'wing', 2.1), gun('mg792', 2, 1000, 'cowl')],
    loadouts: [STD, bombs('fb', 'Jabo: 1 × 250 kg', BOMBS.b250, 1, 0.06)],
    dive: { diveAngle: 50, releaseAlt: 800 },
    buildTime: 95, cruiseAlt: 5000, vmaxKmh: 565, vmaxAlt: 4500,
  },
  {
    id: 'bf109f', name: 'Messerschmitt Bf 109 F-4', abbr: 'Bf 109 F', origin: 'Almanya', year: 1941,
    generation: 'P2', role: 'fighter', model: 'bf109f',
    description: 'Yuvarlak kanat uçları, temiz gövde, burun topu: 109 ailesinin en dengelisi. Enerji savaşında çok güçlü.',
    hp: 120, armor: 0.12, crew: 1, engine: inline('Daimler-Benz DB 601E', 920, 5200, { propEff: 0.789, sl: 1.08 }),
    massEmpty: 2600, fuelKg: 290, wingArea: 16.05, span: 9.92, clMax: 1.62, oswald: 0.7, mcrit: 0.77, vneKmh: 750, nMax: 7,
    roll: [110, 310, 300], tactic: 'energy', tailDragger: true,
    guns: [gun('mg151', 1, 200, 'hub'), gun('mg792', 2, 500, 'cowl')],
    loadouts: [STD, tank(220), bombs('fb', 'Jabo: 1 × 250 kg', BOMBS.b250, 1, 0.06)],
    dive: { diveAngle: 50, releaseAlt: 800 },
    buildTime: 115, cruiseAlt: 5500, vmaxKmh: 635, vmaxAlt: 6200,
  },
  {
    id: 'bf109g', name: 'Messerschmitt Bf 109 G-6', abbr: 'Bf 109 G', origin: 'Almanya', year: 1943,
    generation: 'P2', role: 'fighter', model: 'bf109g',
    description: 'Daha ağır, daha güçlü DB 605. MW 50 enjeksiyonuyla kısa süreli acil güç. Top gondolları veya 30 mm burun topu takılabilir.',
    hp: 125, armor: 0.15, crew: 1, engine: inline('Daimler-Benz DB 605A', 1000, 5700, { wep: 1.22, propEff: 0.759, sl: 1.08 }),
    massEmpty: 2860, fuelKg: 290, wingArea: 16.05, span: 9.92, clMax: 1.55, oswald: 0.84, mcrit: 0.77, vneKmh: 750, nMax: 7,
    roll: [105, 320, 300], tactic: 'energy', tailDragger: true,
    guns: [gun('mg151', 1, 200, 'hub'), gun('mg131', 2, 300, 'cowl')],
    loadouts: [
      STD, tank(220),
      { id: 'r6', name: 'Kanat altı top gondolları (2 × 20 mm)', extraGuns: [gun('mg151', 2, 135)], drag: 0.06, mass: 215 },
      { id: 'u4', name: '30 mm MK 108 burun topu', replaceGuns: [gun('mk108', 1, 65, 'hub'), gun('mg131', 2, 300, 'cowl')], drag: 0, requires: 'w_30mm' },
      bombs('fb', 'Jabo: 1 × 250 kg', BOMBS.b250, 1, 0.06),
    ],
    dive: { diveAngle: 50, releaseAlt: 800 },
    buildTime: 130, cruiseAlt: 6000, vmaxKmh: 630, vmaxAlt: 6600,
  },
  {
    id: 'p51d', name: 'North American P-51D Mustang', abbr: 'P-51D', origin: 'ABD', year: 1944,
    generation: 'P2', role: 'fighter', model: 'p51d',
    description: 'Laminer akış kanadı, iki kademeli Merlin ve büyük iç yakıt: bombardıman uçaklarını hedefe kadar korur. Kabarcık kokpit arka görüşü açar. Yüksekte çok hızlı.',
    hp: 135, armor: 0.12, crew: 1, engine: inline('Packard V-1650-7', 1000, 7600, { twoStage: true, wep: 1.15, propEff: 0.92, sl: 1.11 }),
    massEmpty: 3850, fuelKg: 730, wingArea: 21.83, span: 11.28, clMax: 1.57, oswald: 0.86, mcrit: 0.77, vneKmh: 810, nMax: 7.5,
    roll: [100, 400, 420], tactic: 'energy', tailDragger: true, rearView: 0.6,
    guns: [gun('mg127', 6, 313, 'wing', 2.6)],
    loadouts: [
      STD, tank(430), tank(590, 'f_bigtank', 'Büyük atılabilir tanklar', 'bigtank'),
      bombs('fb', '2 × 500 lb', BOMBS.lb500, 2, 0.08),
      { id: 'rk', name: '6 × HVAR roket', rockets: { def: ROCKETS.hvar, count: 6 }, drag: 0.07, requires: 'rockets' },
    ],
    dive: { diveAngle: 50, releaseAlt: 800 },
    buildTime: 160, cruiseAlt: 7000, vmaxKmh: 703, vmaxAlt: 7600,
  },
  {
    id: 'me262', name: 'Messerschmitt Me 262 A-1a', abbr: 'Me 262', origin: 'Almanya', year: 1944,
    generation: 'J1', role: 'fighter', model: 'me262',
    description: 'İlk muharip jet avcısı. Dört 30 mm MK 108 ile bombardıman uçaklarını tek geçişte parçalar. Jumo 004 motorlar çok yavaş açılır; yavaşken savunmasızdır.',
    hp: 165, armor: 0.12, crew: 1, engine: jet('2 × Junkers Jumo 004B', 8.8, { count: 2, spool: 10, tsfc: 0.14 }),
    massEmpty: 4500, fuelKg: 1950, wingArea: 21.7, span: 12.65, clMax: 1.3, mcrit: 0.8, cdWave: 0.08, machTuck: 0.45, vneKmh: 950, nMax: 7,
    roll: [80, 450, 420], tactic: 'energy', tailDragger: false, rearView: 0.45,
    guns: [gun('mk108', 4, 90, 'nose')], loadouts: [STD, bombs('fb', 'Sturmvogel: 2 × 250 kg', BOMBS.b250, 2, 0.08)],
    dive: { diveAngle: 35, releaseAlt: 900 },
    buildTime: 220, cruiseAlt: 7000, vmaxKmh: 870, vmaxAlt: 7000,
  },
  {
    id: 'mig15', name: 'Mikoyan-Gurevich MiG-15bis', abbr: 'MiG-15bis', origin: 'Sovyetler Birliği', year: 1950,
    generation: 'J1', role: 'fighter', model: 'mig15',
    description: 'Ok kanatlı, hafif ve tırmanışı çok güçlü önleyici. 37 mm ve iki 23 mm top bombardıman uçaklarına karşı tasarlandı; transonikte kumandası zorlaşır.',
    hp: 170, armor: 0.12, crew: 1, engine: jet('Klimov VK-1', 26.5, { spool: 5, tsfc: 0.11 }),
    massEmpty: 3900, fuelKg: 1170, wingArea: 20.6, span: 10.08, clMax: 1.15, oswald: 0.75, mcrit: 0.86, mdd: 0.87, cdWave: 0.06, machTuck: 0.4, vneKmh: 1050, nMax: 8,
    roll: [140, 450, 420], tactic: 'energy', tailDragger: false, rearView: 0.5, gOnset: 8,
    guns: [gun('n37', 1, 40, 'nose'), gun('nr23', 2, 80, 'nose')], loadouts: [STD, tank(480)],
    buildTime: 250, cruiseAlt: 10000, vmaxKmh: 1060, vmaxAlt: 1000,
  },
  // ============================================================ Ağır avcı / avcı-bombardıman
  {
    id: 'bf110c', name: 'Messerschmitt Bf 110 C-4', abbr: 'Bf 110 C', origin: 'Almanya', year: 1939,
    generation: 'P1', role: 'fighter', model: 'bf110',
    description: 'Çift motorlu “Zerstörer”. Burnunda güçlü topçu, arkada nişancı. Tek motorlu avcılarla dönüşe girerse kaybeder; dal-vur ve bombardıman avında etkili.',
    hp: 240, armor: 0.15, crew: 2, engine: inline('2 × Daimler-Benz DB 601A', 750, 4500, { count: 2, propEff: 0.7, sl: 1.12 }),
    massEmpty: 5830, fuelKg: 920, wingArea: 38.4, span: 16.27, clMax: 1.32, oswald: 0.7, mcrit: 0.63, vneKmh: 700, nMax: 6,
    roll: [55, 320, 350], tactic: 'energy', tailDragger: true, gOnset: 4,
    guns: [gun('ffm', 2, 180, 'nose'), gun('mg792', 4, 1000, 'nose')],
    turrets: [turret('Arka nişancı', [0, 0.9, -1.6], 180, 55, [-10, 55], gun('mg15', 1, 750))],
    loadouts: [STD, bombs('fb', 'Jabo: 2 × 250 kg', BOMBS.b250, 2, 0.07), tank(430)],
    dive: { diveAngle: 45, releaseAlt: 900 },
    buildTime: 170, cruiseAlt: 5000, vmaxKmh: 545, vmaxAlt: 6000,
  },
  {
    id: 'fw190a5', name: 'Focke-Wulf Fw 190 A-5', abbr: 'Fw 190 A', origin: 'Almanya', year: 1943,
    generation: 'P2', role: 'fighter', model: 'fw190',
    description: 'Radyal motorlu, geniş iniş takımlı, sağlam avcı. Dönemin en iyi yuvarlanma hızı ve dört 20 mm top; yüksek irtifada gücü düşer.',
    hp: 150, armor: 0.2, crew: 1, engine: radial('BMW 801D-2', 1060, 5700, { propEff: 0.722, wep: 1.12, sl: 1.15 }),
    massEmpty: 3720, fuelKg: 380, wingArea: 18.3, span: 10.51, clMax: 1.68, oswald: 0.95, mcrit: 0.75, vneKmh: 850, nMax: 7,
    roll: [160, 400, 480], tactic: 'energy', tailDragger: true, rearView: 0.5,
    guns: [gun('mg151', 2, 250, 'root', 1.1), gun('ffm', 2, 90, 'wing', 2.6), gun('mg792', 2, 900, 'cowl')],
    loadouts: [
      STD, bombs('fb', 'Jabo: 1 × 500 kg', BOMBS.b500, 1, 0.06),
      bombs('fb2', '1 × 250 kg', BOMBS.b250, 1, 0.05), tank(220),
    ],
    dive: { diveAngle: 45, releaseAlt: 800 },
    buildTime: 140, cruiseAlt: 5500, vmaxKmh: 656, vmaxAlt: 6300,
  },
  {
    id: 'p47d', name: 'Republic P-47D Thunderbolt', abbr: 'P-47D', origin: 'ABD', year: 1944,
    generation: 'P2', role: 'fighter', model: 'p47',
    description: 'Dev turbo süperşarjlı radyal motor, sekiz 12,7 mm makineli. Yüksekte çok hızlı, dalışta yakalanamaz, çok dayanıklı; alçakta ağır. Bomba ve roket taşır.',
    hp: 210, armor: 0.25, crew: 1, engine: radial('Pratt & Whitney R-2800-59', 1490, 8500, { twoStage: true, wep: 1.15, propEff: 0.858, sl: 1.0 }),
    massEmpty: 5100, fuelKg: 1010, wingArea: 27.87, span: 12.42, clMax: 1.51, oswald: 0.92, mcrit: 0.7, vneKmh: 800, nMax: 7.5,
    roll: [110, 450, 500], tactic: 'energy', tailDragger: true, rearView: 0.6,
    guns: [gun('mg127', 8, 425, 'wing', 3.0)],
    loadouts: [
      STD, bombs('fb', '2 × 500 lb', BOMBS.lb500, 2, 0.07),
      bombs('heavy', '2 × 1000 lb', BOMBS.lb1000, 2, 0.09, 'w_heavybomb'),
      { id: 'rk', name: '10 × HVAR roket + 2 × 500 lb', rockets: { def: ROCKETS.hvar, count: 10 }, bombs: { def: BOMBS.lb500, count: 2 }, drag: 0.12, requires: 'rockets' },
      tank(420),
    ],
    dive: { diveAngle: 50, releaseAlt: 800 },
    buildTime: 170, cruiseAlt: 7500, vmaxKmh: 697, vmaxAlt: 9100,
  },
  {
    id: 'f84g', name: 'Republic F-84G Thunderjet', abbr: 'F-84G', origin: 'ABD', year: 1951,
    generation: 'J1', role: 'fighter', model: 'f84',
    description: 'Düz kanatlı jet avcı-bombardıman. Kanat ucu tanklarıyla uzun menzil; bomba ve roketle yer hedeflerine dalar.',
    hp: 185, armor: 0.15, crew: 1, engine: jet('Allison J35-A-29', 25, { spool: 6, tsfc: 0.11 }),
    massEmpty: 6000, fuelKg: 1350, wingArea: 24.2, span: 11.1, clMax: 1.25, mcrit: 0.72, mdd: 0.84, cdWave: 0.09, machTuck: 0.45, vneKmh: 1000, nMax: 7.3,
    roll: [110, 450, 600], tactic: 'energy', tailDragger: false, rearView: 0.6,
    guns: [gun('mg127', 6, 300, 'nose')],
    loadouts: [
      STD, tank(1100, 'j_tiptank', 'Kanat ucu tankları'),
      bombs('fb', '2 × 1000 lb', BOMBS.lb1000, 2, 0.08),
      { id: 'rk', name: '8 × HVAR roket', rockets: { def: ROCKETS.hvar, count: 8 }, drag: 0.08, requires: 'rockets' },
    ],
    dive: { diveAngle: 45, releaseAlt: 900 },
    buildTime: 240, cruiseAlt: 9000, vmaxKmh: 1000, vmaxAlt: 1200,
  },
  // ============================================================ Taarruz
  {
    id: 'il2', name: 'Ilyushin Il-2 (tek kişilik)', abbr: 'Il-2', origin: 'Sovyetler Birliği', year: 1941,
    generation: 'P2', role: 'attacker', model: 'il2',
    description: '“Uçan tank”: motor ve kokpit tek parça zırhlı küvet içinde. Alçaktan roket, top ve bombayla saldırır; arkası korumasızdır.',
    hp: 250, armor: 0.8, crew: 1, engine: inline('Mikulin AM-38', 1160, 1650, { propEff: 0.813, sl: 1.0 }),
    massEmpty: 4840, fuelKg: 470, wingArea: 38.5, span: 14.6, clMax: 1.4, oswald: 0.8, mcrit: 0.6, vneKmh: 600, nMax: 5.5,
    roll: [50, 300, 330], tactic: 'turn', tailDragger: true, gOnset: 4,
    guns: [gun('shvak', 2, 210, 'wing', 2.4), gun('mg762', 2, 750, 'wing', 2.6)],
    loadouts: [
      { id: 'mix', name: '8 × RS-82 + 4 × 100 kg', rockets: { def: ROCKETS.r82, count: 8 }, bombs: { def: BOMBS.b100, count: 4 }, drag: 0.08, requires: 'rockets' },
      bombs('bombs', '6 × 100 kg', BOMBS.b100, 6, 0.06),
      bombs('heavy', '2 × 250 kg', BOMBS.b250, 2, 0.07),
    ],
    buildTime: 140, cruiseAlt: 1200, vmaxKmh: 426, vmaxAlt: 2500,
  },
  {
    id: 'il2m3', name: 'Ilyushin Il-2M3 (iki kişilik)', abbr: 'Il-2M3', origin: 'Sovyetler Birliği', year: 1943,
    generation: 'P2', role: 'attacker', model: 'il2m3',
    description: 'Arka nişancılı ve ok açılı kanatlı geliştirilmiş Il-2. 23 mm VYa topları, 12,7 mm arka savunma.',
    hp: 270, armor: 0.8, crew: 2, engine: inline('Mikulin AM-38F', 1120, 800, { propEff: 0.807, sl: 1.05 }),
    massEmpty: 5500, fuelKg: 535, wingArea: 38.5, span: 14.6, clMax: 1.4, oswald: 0.8, mcrit: 0.6, vneKmh: 600, nMax: 5.5,
    roll: [48, 300, 330], tactic: 'turn', tailDragger: true, gOnset: 4,
    guns: [gun('vya', 2, 150, 'wing', 2.4), gun('mg762', 2, 750, 'wing', 2.6)],
    turrets: [turret('Arka nişancı', [0, 0.85, -1.3], 180, 60, [-10, 50], gun('ubt', 1, 150))],
    loadouts: [
      { id: 'mix', name: '8 × RS-82 + 4 × 100 kg', rockets: { def: ROCKETS.r82, count: 8 }, bombs: { def: BOMBS.b100, count: 4 }, drag: 0.08, requires: 'rockets' },
      bombs('bombs', '6 × 100 kg', BOMBS.b100, 6, 0.06),
      bombs('heavy', '2 × 250 kg', BOMBS.b250, 2, 0.07),
    ],
    buildTime: 150, cruiseAlt: 1200, vmaxKmh: 410, vmaxAlt: 1500,
  },
  {
    id: 'typhoon', name: 'Hawker Typhoon Mk Ib', abbr: 'Typhoon', origin: 'Birleşik Krallık', year: 1943,
    generation: 'P2', role: 'attacker', model: 'typhoon',
    description: 'Napier Sabre motorlu hızlı taarruz uçağı. Sekiz RP-3 roketi ve dört 20 mm topla alçakta çok öldürücü; kalın kanadı yüksek hızda sıkışır.',
    hp: 175, armor: 0.25, crew: 1, engine: inline('Napier Sabre IIA', 1500, 3500, { propEff: 0.7, sl: 1.05 }),
    massEmpty: 4660, fuelKg: 510, wingArea: 25.9, span: 12.67, clMax: 1.48, oswald: 0.79, mcrit: 0.7, vneKmh: 830, nMax: 7,
    roll: [80, 400, 380], tactic: 'energy', tailDragger: true, rearView: 0.5,
    guns: [gun('hisp', 4, 140, 'wing', 2.5)],
    loadouts: [
      { id: 'rp3', name: '8 × RP-3 roket', rockets: { def: ROCKETS.rp3, count: 8 }, drag: 0.08, requires: 'rockets' },
      bombs('bombs', '2 × 500 lb', BOMBS.lb500, 2, 0.06),
      bombs('heavy', '2 × 1000 lb', BOMBS.lb1000, 2, 0.08, 'w_heavybomb'),
    ],
    dive: { diveAngle: 40, releaseAlt: 700 },
    buildTime: 160, cruiseAlt: 1500, vmaxKmh: 660, vmaxAlt: 5500,
  },
  {
    id: 'il10', name: 'Ilyushin Il-10', abbr: 'Il-10', origin: 'Sovyetler Birliği', year: 1944,
    generation: 'P2', role: 'attacker', model: 'il10',
    description: 'Il-2’nin daha temiz, daha hızlı halefi. Zırhlı küvet, katlanır iniş takımı ve güçlü AM-42 motor.',
    hp: 260, armor: 0.75, crew: 2, engine: inline('Mikulin AM-42', 1300, 1600, { propEff: 0.846, sl: 1.02 }),
    massEmpty: 5800, fuelKg: 560, wingArea: 30, span: 13.4, clMax: 1.38, oswald: 0.8, mcrit: 0.64, vneKmh: 700, nMax: 6,
    roll: [70, 350, 350], tactic: 'turn', tailDragger: true, gOnset: 4.5,
    guns: [gun('ns23', 2, 150, 'wing', 2.3), gun('mg762', 2, 750, 'wing', 2.5)],
    turrets: [turret('Arka nişancı', [0, 0.85, -1.2], 180, 60, [-10, 50], gun('ubt', 1, 190))],
    loadouts: [
      { id: 'mix', name: '8 × RS-82 + 4 × 100 kg', rockets: { def: ROCKETS.r82, count: 8 }, bombs: { def: BOMBS.b100, count: 4 }, drag: 0.07, requires: 'rockets' },
      bombs('heavy', '2 × 250 kg', BOMBS.b250, 2, 0.06),
    ],
    buildTime: 160, cruiseAlt: 1200, vmaxKmh: 551, vmaxAlt: 2300,
  },
  // ============================================================ Pike bombardıman
  {
    id: 'ju87b', name: 'Junkers Ju 87 B-2 Stuka', abbr: 'Ju 87 B', origin: 'Almanya', year: 1938,
    generation: 'P1', role: 'diveBomber', model: 'ju87b',
    description: 'Ters martı kanat, sabit tekerlek kaportaları ve hava frenleri. Neredeyse dik dalar, isabeti çok yüksektir; yavaş ve avcılara karşı savunmasızdır.',
    hp: 185, armor: 0.15, crew: 2, engine: inline('Junkers Jumo 211Da', 810, 1500, { propEff: 0.706, sl: 1.05 }),
    massEmpty: 3400, fuelKg: 345, wingArea: 31.9, span: 13.8, clMax: 1.45, oswald: 0.8, mcrit: 0.56, vneKmh: 600, nMax: 7,
    roll: [45, 280, 300], tactic: 'turn', tailDragger: true, diveBrakes: true, gOnset: 4,
    guns: [gun('mg792', 2, 500, 'wing', 2.4)],
    turrets: [turret('Arka nişancı', [0, 0.75, -1.8], 180, 60, [-15, 55], gun('mg15', 1, 900))],
    loadouts: [bombs('b500', '1 × 500 kg', BOMBS.b500, 1, 0.05), bombs('b250', '2 × 250 kg', BOMBS.b250, 2, 0.07)],
    dive: { diveAngle: 75, releaseAlt: 650 },
    buildTime: 120, cruiseAlt: 4000, vmaxKmh: 390, vmaxAlt: 4000,
  },
  {
    id: 'sbd3', name: 'Douglas SBD-3 Dauntless', abbr: 'SBD-3', origin: 'ABD', year: 1941,
    generation: 'P2', role: 'diveBomber', model: 'sbd',
    description: 'Delikli pike flaplarıyla kararlı, isabetli dalış. Katlanır iniş takımı Stuka’dan temiz; iki 12,7 mm ve arka çift makineli.',
    hp: 200, armor: 0.15, crew: 2, engine: radial('Wright R-1820-52 Cyclone', 640, 4300, { propEff: 0.82, sl: 1.18 }),
    massEmpty: 3550, fuelKg: 710, wingArea: 30.19, span: 12.66, clMax: 1.45, oswald: 0.8, mcrit: 0.58, vneKmh: 560, nMax: 7.5,
    roll: [60, 320, 330], tactic: 'turn', tailDragger: true, diveBrakes: true, gOnset: 4.5,
    guns: [gun('mg127', 2, 360, 'cowl')],
    turrets: [turret('Arka nişancı (çift)', [0, 0.8, -1.6], 180, 65, [-15, 55], gun('m1919', 2, 1000))],
    loadouts: [bombs('lb1000', '1 × 1000 lb', BOMBS.lb1000, 1, 0.05), bombs('lb500', '2 × 500 lb', BOMBS.lb500, 2, 0.06)],
    dive: { diveAngle: 70, releaseAlt: 700 },
    buildTime: 130, cruiseAlt: 4000, vmaxKmh: 410, vmaxAlt: 4250,
  },
  {
    id: 'ju87d', name: 'Junkers Ju 87 D-5 Stuka', abbr: 'Ju 87 D', origin: 'Almanya', year: 1943,
    generation: 'P2', role: 'diveBomber', model: 'ju87d',
    description: 'Güçlendirilmiş Stuka: 1000 kg bomba, kanatlarda 20 mm top, arkada çift MG 81Z. Daha ağır ama daha zırhlı.',
    hp: 215, armor: 0.25, crew: 2, engine: inline('Junkers Jumo 211J', 880, 4000, { propEff: 0.774, sl: 1.15 }),
    massEmpty: 4400, fuelKg: 520, wingArea: 33.7, span: 15, clMax: 1.45, oswald: 0.8, mcrit: 0.57, vneKmh: 600, nMax: 7,
    roll: [45, 300, 300], tactic: 'turn', tailDragger: true, diveBrakes: true, gOnset: 4,
    guns: [gun('mg151', 2, 180, 'wing', 2.4)],
    turrets: [turret('Arka nişancı (MG 81Z)', [0, 0.8, -1.8], 180, 60, [-15, 55], gun('mg81', 2, 1000))],
    loadouts: [
      bombs('b1000', '1 × 1000 kg', BOMBS.b1000, 1, 0.07, 'w_heavybomb'),
      bombs('b500', '1 × 500 kg', BOMBS.b500, 1, 0.06),
      bombs('b250', '3 × 250 kg', BOMBS.b250, 3, 0.07),
    ],
    dive: { diveAngle: 75, releaseAlt: 650 },
    buildTime: 140, cruiseAlt: 4000, vmaxKmh: 410, vmaxAlt: 4100,
  },
  {
    id: 'sb2c', name: 'Curtiss SB2C-4 Helldiver', abbr: 'SB2C-4', origin: 'ABD', year: 1944,
    generation: 'P2', role: 'diveBomber', model: 'sb2c',
    description: 'Büyük, güçlü ve ağır pike bombardıman uçağı. İç bomba bölmesinde 1000 lb, kanat altında ek bombalar; iki 20 mm top.',
    hp: 240, armor: 0.2, crew: 2, engine: radial('Wright R-2600-20', 1150, 3800, { propEff: 0.788, sl: 1.15 }),
    massEmpty: 5500, fuelKg: 870, wingArea: 39.2, span: 15.17, clMax: 1.5, oswald: 0.8, mcrit: 0.58, vneKmh: 560, nMax: 7,
    roll: [55, 340, 330], tactic: 'turn', tailDragger: true, diveBrakes: true, gOnset: 4,
    guns: [gun('hisp', 2, 400, 'wing', 2.6)],
    turrets: [turret('Arka nişancı (çift)', [0, 0.85, -1.9], 180, 65, [-15, 55], gun('m1919', 2, 1000))],
    loadouts: [
      bombs('mix', '1 × 1000 lb', BOMBS.lb1000, 1, 0.04),
      bombs('heavy', '2 × 1000 lb', BOMBS.lb1000, 2, 0.08, 'w_heavybomb'),
    ],
    dive: { diveAngle: 70, releaseAlt: 700 },
    buildTime: 160, cruiseAlt: 4500, vmaxKmh: 475, vmaxAlt: 5000,
  },
  // ============================================================ Bombardıman
  {
    id: 'he111', name: 'Heinkel He 111 H-3', abbr: 'He 111 H', origin: 'Almanya', year: 1939,
    generation: 'P1', role: 'bomber', model: 'he111',
    description: 'Camlı “sera” burunlu orta bombardıman uçağı. 2 ton bomba; burun, sırt, karın ve yan pencerelerde tek makineliler. Yavaş ve hafif savunmalı.',
    hp: 460, armor: 0.12, crew: 5, engine: inline('2 × Junkers Jumo 211D', 780, 4500, { count: 2, propEff: 0.712, sl: 1.1 }),
    massEmpty: 7900, fuelKg: 2200, wingArea: 87.6, span: 22.6, clMax: 1.4, oswald: 0.8, mcrit: 0.56, vneKmh: 520, nMax: 4,
    roll: [25, 280, 280], tactic: 'turn', tailDragger: true, gOnset: 2.5, visualRange: 5500,
    guns: [],
    turrets: [
      turret('Burun', [0, 0, 7.6], 0, 45, [-40, 30], gun('mg15', 1, 750)),
      turret('Sırt', [0, 1.4, -2.0], 180, 140, [5, 75], gun('mg15', 1, 900)),
      turret('Karın gondolu', [0, -1.6, -1.2], 180, 50, [-70, -3], gun('mg15', 1, 900)),
      turret('Sol yan', [0.9, 0.4, -3.6], -90, 50, [-30, 30], gun('mg15', 1, 600)),
      turret('Sağ yan', [-0.9, 0.4, -3.6], 90, 50, [-30, 30], gun('mg15', 1, 600)),
    ],
    loadouts: [
      bombs('b250x8', '8 × 250 kg', BOMBS.b250, 8, 0),
      bombs('b50x32', '32 × 50 kg (alan)', BOMBS.b50, 32, 0),
      bombs('b500x4', '4 × 500 kg (dış askı)', BOMBS.b500, 4, 0.08),
    ],
    buildTime: 260, cruiseAlt: 5000, vmaxKmh: 415, vmaxAlt: 5000,
  },
  {
    id: 'ju88a4', name: 'Junkers Ju 88 A-4', abbr: 'Ju 88 A', origin: 'Almanya', year: 1940,
    generation: 'P2', role: 'bomber', model: 'ju88',
    description: 'Hızlı “Schnellbomber”: hava frenleriyle 60° dalış yapabilen çok yönlü orta bombardıman. Pike bombardımanına da gönderilebilir.',
    hp: 420, armor: 0.15, crew: 4, engine: inline('2 × Junkers Jumo 211J', 880, 4000, { count: 2, propEff: 0.772, sl: 1.15 }),
    massEmpty: 9300, fuelKg: 1700, wingArea: 54.7, span: 20.08, clMax: 1.4, oswald: 0.8, mcrit: 0.6, vneKmh: 650, nMax: 5,
    roll: [40, 320, 320], tactic: 'turn', tailDragger: true, diveBrakes: true, gOnset: 3, visualRange: 5500,
    guns: [],
    turrets: [
      turret('Burun', [0, 0.2, 6.3], 0, 40, [-35, 25], gun('mg81', 1, 750)),
      turret('Kokpit arkası (çift)', [0, 1.3, 2.0], 180, 50, [5, 60], gun('mg81', 2, 1000)),
      turret('Karın (Bola, çift)', [0, -1.3, 2.4], 180, 40, [-60, -5], gun('mg81', 2, 1000)),
    ],
    loadouts: [
      bombs('b250x4', '4 × 250 kg', BOMBS.b250, 4, 0.05),
      bombs('b500x2', '2 × 500 kg', BOMBS.b500, 2, 0.06),
      bombs('b500x4', '4 × 500 kg', BOMBS.b500, 4, 0.08, 'w_heavybomb'),
    ],
    dive: { diveAngle: 60, releaseAlt: 1000 },
    buildTime: 280, cruiseAlt: 5000, vmaxKmh: 470, vmaxAlt: 5300,
  },
  {
    id: 'b25j', name: 'North American B-25J Mitchell', abbr: 'B-25J', origin: 'ABD', year: 1943,
    generation: 'P2', role: 'bomber', model: 'b25',
    description: 'Çift dikey kuyruklu orta bombardıman. Hidrolik sırt ve kuyruk taretleri, yan makineliler; tamamı 12,7 mm.',
    hp: 520, armor: 0.15, crew: 6, engine: radial('2 × Wright R-2600-92', 1080, 3700, { count: 2, propEff: 0.777, sl: 1.17 }),
    massEmpty: 12600, fuelKg: 1830, wingArea: 56.7, span: 20.6, clMax: 1.5, oswald: 0.8, mcrit: 0.58, vneKmh: 560, nMax: 4.5,
    roll: [30, 300, 300], tactic: 'turn', tailDragger: false, gOnset: 2.5, visualRange: 5500,
    guns: [],
    turrets: [
      turret('Burun', [0, 0, 7.6], 0, 35, [-35, 25], gun('mg127', 1, 300)),
      turret('Sırt (çift)', [0, 1.5, 3.0], 0, 180, [3, 85], gun('mg127', 2, 400), true),
      turret('Sol yan', [0.9, 0.5, -3.5], -90, 55, [-35, 35], gun('mg127', 1, 200)),
      turret('Sağ yan', [-0.9, 0.5, -3.5], 90, 55, [-35, 35], gun('mg127', 1, 200)),
      turret('Kuyruk (çift)', [0, 0.4, -8.0], 180, 40, [-35, 35], gun('mg127', 2, 400)),
    ],
    loadouts: [bombs('lb500x6', '6 × 500 lb', BOMBS.lb500, 6, 0), bombs('lb1000x3', '3 × 1000 lb', BOMBS.lb1000, 3, 0, 'w_heavybomb')],
    buildTime: 300, cruiseAlt: 4500, vmaxKmh: 438, vmaxAlt: 3900,
  },
  {
    id: 'b17g', name: 'Boeing B-17G Flying Fortress', abbr: 'B-17G', origin: 'ABD', year: 1943,
    generation: 'P2', role: 'bomber', model: 'b17',
    description: 'Dört motorlu ağır bombardıman: “uçan kale”. On üç 12,7 mm makineli ve turbo süperşarjlı motorlarla yüksekten, kutu formasyonunda gelir. Çok dayanıklı.',
    hp: 900, armor: 0.2, crew: 10, engine: radial('4 × Wright R-1820-97', 895, 7600, { count: 4, twoStage: true, propEff: 0.795, sl: 1.0 }),
    massEmpty: 18500, fuelKg: 4600, wingArea: 131.9, span: 31.62, clMax: 1.5, oswald: 0.8, mcrit: 0.58, vneKmh: 480, nMax: 3.5,
    roll: [20, 280, 280], tactic: 'turn', tailDragger: true, gOnset: 2, visualRange: 6000,
    guns: [],
    turrets: [
      turret('Çene (çift)', [0, -1.0, 9.5], 0, 60, [-60, 20], gun('mg127', 2, 365), true),
      turret('Sol yanak', [1.0, 0, 8.0], -45, 45, [-35, 30], gun('mg127', 1, 400)),
      turret('Sağ yanak', [-1.0, 0, 8.0], 45, 45, [-35, 30], gun('mg127', 1, 400)),
      turret('Sırt (çift)', [0, 1.9, 4.5], 0, 180, [3, 85], gun('mg127', 2, 375), true),
      turret('Telsizci', [0, 1.2, -1.5], 180, 40, [15, 70], gun('mg127', 1, 500)),
      turret('Küre taret (çift)', [0, -1.7, -1.0], 0, 180, [-88, -5], gun('mg127', 2, 500), true),
      turret('Sol bel', [1.1, 0.5, -4.5], -90, 60, [-35, 35], gun('mg127', 1, 600)),
      turret('Sağ bel', [-1.1, 0.5, -4.5], 90, 60, [-35, 35], gun('mg127', 1, 600)),
      turret('Kuyruk (çift)', [0, 0.5, -11.0], 180, 40, [-35, 35], gun('mg127', 2, 500)),
    ],
    loadouts: [
      bombs('lb500x12', '12 × 500 lb', BOMBS.lb500, 12, 0),
      bombs('lb1000x6', '6 × 1000 lb', BOMBS.lb1000, 6, 0, 'w_heavybomb'),
      bombs('lb100x24', '24 × 100 lb (alan)', BOMBS.lb100, 24, 0),
    ],
    buildTime: 400, cruiseAlt: 7000, vmaxKmh: 462, vmaxAlt: 7600,
  },
  {
    id: 'canberra', name: 'English Electric Canberra B.2', abbr: 'Canberra', origin: 'Birleşik Krallık', year: 1951,
    generation: 'J1', role: 'bomber', model: 'canberra',
    description: 'İlk jet bombardıman uçaklarından. Savunma silahı yok: 12 km’nin üstünde, pervanelilerin ve uçaksavarın ulaşamayacağı yükseklikte ve hızda uçar.',
    hp: 420, armor: 0.1, crew: 3, engine: jet('2 × Rolls-Royce Avon RA.3', 28.9, { count: 2, spool: 6, tsfc: 0.1 }),
    massEmpty: 10700, fuelKg: 5500, wingArea: 89.2, span: 19.51, clMax: 1.25, mcrit: 0.73, mdd: 0.88, cdWave: 0.09, machTuck: 0.4, vneKmh: 830, nMax: 3.5,
    roll: [60, 450, 500], tactic: 'energy', tailDragger: false, gOnset: 3, visualRange: 5500,
    guns: [],
    loadouts: [bombs('lb1000x6', '6 × 1000 lb', BOMBS.lb1000, 6, 0), bombs('lb500x8', '8 × 500 lb', BOMBS.lb500, 8, 0)],
    buildTime: 360, cruiseAlt: 11000, vmaxKmh: 917, vmaxAlt: 12000,
  },
  // ============================================================ Çeşitlilik: diğer pervaneliler
  {
    id: 'i16', name: 'Polikarpov I-16 Tip 24', abbr: 'I-16', origin: 'Sovyetler Birliği', year: 1939,
    generation: 'P1', role: 'fighter', model: 'i16',
    description: 'Fıçı gövdeli, kısa kanatlı ilk modern tek kanatlı avcılardan. Çok çabuk yuvarlanır ve döner ama dengesizdir; hızı yeni avcıların gerisinde. Dört ShKAS çok hızlı ateş eder.',
    hp: 110, armor: 0.12, crew: 1, engine: radial('Shvetsov M-63', 600, 4200, { propEff: 0.61, sl: 1.24, floatCarb: 1 }),
    massEmpty: 1750, fuelKg: 190, wingArea: 14.54, span: 9.0, clMax: 1.48, oswald: 0.95, mcrit: 0.65, vneKmh: 620, nMax: 8,
    roll: [150, 300, 300], tactic: 'turn', tailDragger: true,
    guns: [gun('mg762', 2, 650, 'cowl'), gun('mg762', 2, 650, 'wing', 1.9)],
    loadouts: [STD],
    buildTime: 100, cruiseAlt: 3500, vmaxKmh: 489, vmaxAlt: 4800,
  },
  {
    id: 'a6m2', name: 'Mitsubishi A6M2 Sıfır (Model 21)', abbr: 'A6M2', origin: 'Japonya', year: 1940,
    generation: 'P1', role: 'fighter', model: 'a6m',
    description: 'Son derece hafif, çok uzun menzilli ve yavaş hızda inanılmaz çevik deniz avcısı. Zırhı ve sızdırmaz deposu yok: birkaç isabet yeter. Yüksek hızda kanatçıkları ağırlaşır.',
    hp: 95, armor: 0.03, crew: 1, engine: radial('Nakajima Sakae 12', 700, 4200, { propEff: 0.805, sl: 1.0, floatCarb: 1 }),
    massEmpty: 2020, fuelKg: 390, wingArea: 22.44, span: 12.0, clMax: 1.46, oswald: 0.7, mcrit: 0.66, vneKmh: 630, nMax: 7,
    roll: [90, 280, 220], tactic: 'turn', tailDragger: true, rearView: 0.6,
    guns: [gun('ff', 2, 60, 'wing', 2.3), gun('mg77', 2, 500, 'cowl')],
    loadouts: [STD],
    buildTime: 120, cruiseAlt: 4500, vmaxKmh: 533, vmaxAlt: 4550,
  },
  {
    id: 'blenheim', name: 'Bristol Blenheim Mk IV', abbr: 'Blenheim IV', origin: 'Birleşik Krallık', year: 1939,
    generation: 'P1', role: 'bomber', model: 'blenheim',
    description: 'Savaşın başında hızlı sayılan hafif bombardıman: yalnızca 450 kg bomba, zayıf savunma. Ucuz ve çabuk üretilir; avcılara karşı çok kırılgan.',
    hp: 330, armor: 0.1, crew: 3, engine: radial('2 × Bristol Mercury XV', 690, 2800, { count: 2, propEff: 0.7, sl: 1.0 }),
    massEmpty: 4450, fuelKg: 1300, wingArea: 43.6, span: 17.17, clMax: 1.35, oswald: 0.8, mcrit: 0.56, vneKmh: 520, nMax: 4.5,
    roll: [45, 300, 300], tactic: 'turn', tailDragger: true, gOnset: 3, visualRange: 5500,
    guns: [gun('mg77', 1, 500, 'wing', -2.0)],
    turrets: [
      turret('Sırt taret (çift)', [0, 1.3, -1.2], 180, 150, [3, 75], gun('mg77', 2, 600), true),
      turret('Burun altı (geriye, çift)', [0, -1.0, 3.2], 180, 30, [-60, -5], gun('mg77', 2, 600)),
    ],
    loadouts: [bombs('lb250x4', '4 × 250 lb', BOMBS.lb250, 4, 0)],
    buildTime: 200, cruiseAlt: 4000, vmaxKmh: 428, vmaxAlt: 3600,
  },
  {
    id: 'p40e', name: 'Curtiss P-40E Warhawk', abbr: 'P-40E', origin: 'ABD', year: 1941,
    generation: 'P2', role: 'fighter', model: 'p40',
    description: 'Sağlam, dalışta hızlı ve iyi silahlı ama yüksekte güçsüz Allison motorlu avcı. Altı 12,7 mm makineli; Kuzey Afrika’dan Pasifik’e avcı-bombardıman olarak her yerde.',
    hp: 165, armor: 0.2, crew: 1, engine: inline('Allison V-1710-39', 860, 3600, { propEff: 0.715, sl: 1.05 }),
    massEmpty: 3355, fuelKg: 400, wingArea: 21.92, span: 11.38, clMax: 1.69, oswald: 0.95, mcrit: 0.72, vneKmh: 780, nMax: 7.5,
    roll: [110, 380, 400], tactic: 'energy', tailDragger: true, rearView: 0.5,
    guns: [gun('mg127', 6, 281, 'wing', 2.3)],
    loadouts: [STD],
    dive: { diveAngle: 45, releaseAlt: 800 },
    buildTime: 150, cruiseAlt: 4000, vmaxKmh: 580, vmaxAlt: 4600,
  },
  {
    id: 'pe2', name: 'Petlyakov Pe-2', abbr: 'Pe-2', origin: 'Sovyetler Birliği', year: 1941,
    generation: 'P2', role: 'diveBomber', model: 'pe2',
    description: 'İki motorlu, hızlı pike bombardıman uçağı: hava frenleriyle 70° dalar, avcı kadar hızlıdır. Kızıl Ordu’nun en çok üretilen bombardıman uçağı; savunması zayıf.',
    hp: 380, armor: 0.18, crew: 3, engine: inline('2 × Klimov M-105R', 820, 4000, { count: 2, propEff: 0.7, sl: 1.08 }),
    massEmpty: 5870, fuelKg: 1100, wingArea: 40.5, span: 17.16, clMax: 1.35, oswald: 0.8, mcrit: 0.62, vneKmh: 720, nMax: 5,
    roll: [50, 320, 330], tactic: 'turn', tailDragger: true, diveBrakes: true, gOnset: 3.5, visualRange: 5500,
    guns: [gun('ubt', 1, 150, 'nose'), gun('mg762', 1, 450, 'nose')],
    turrets: [
      turret('Sırt', [0, 1.2, -0.5], 180, 120, [3, 70], gun('ubt', 1, 250)),
      turret('Karın', [0, -1.0, -2.6], 180, 40, [-60, -5], gun('mg762', 1, 750)),
    ],
    loadouts: [bombs('b100x6', '6 × FAB-100', BOMBS.b100, 6, 0.02)],
    dive: { diveAngle: 70, releaseAlt: 800 },
    buildTime: 240, cruiseAlt: 4000, vmaxKmh: 540, vmaxAlt: 5000,
  },
  {
    id: 'yak3', name: 'Yakovlev Yak-3', abbr: 'Yak-3', origin: 'Sovyetler Birliği', year: 1944,
    generation: 'P2', role: 'fighter', model: 'yak3',
    description: 'Savaşın en hafif ve en çevik avcılarından: alçak ve orta irtifada Bf 109 G ile Fw 190’ı geride bırakır. Tek 20 mm top ve iki 12,7 mm; menzili kısa.',
    hp: 125, armor: 0.15, crew: 1, engine: inline('Klimov VK-105PF2', 900, 2200, { propEff: 0.766, sl: 1.07, floatCarb: 1 }),
    massEmpty: 2400, fuelKg: 290, wingArea: 14.85, span: 9.2, clMax: 1.55, oswald: 0.95, mcrit: 0.74, vneKmh: 750, nMax: 8,
    roll: [130, 380, 400], tactic: 'turn', tailDragger: true, rearView: 0.6,
    guns: [gun('shvak', 1, 120, 'hub'), gun('ubt', 2, 150, 'cowl')],
    loadouts: [STD],
    buildTime: 140, cruiseAlt: 3500, vmaxKmh: 646, vmaxAlt: 4100,
  },
  {
    id: 'la7', name: 'Lavochkin La-7', abbr: 'La-7', origin: 'Sovyetler Birliği', year: 1944,
    generation: 'P2', role: 'fighter', model: 'la7',
    description: 'Güçlü radyal motorlu, alçakta çok hızlı ve çabuk tırmanan Sovyet avcısı. İki 20 mm top; en başarılı Sovyet asları bu uçakla uçtu.',
    hp: 150, armor: 0.15, crew: 1, engine: radial('Shvetsov ASh-82FN', 1150, 4600, { propEff: 0.7, sl: 1.2, wep: 1.06 }),
    massEmpty: 2925, fuelKg: 340, wingArea: 17.59, span: 9.8, clMax: 1.33, oswald: 0.95, mcrit: 0.73, vneKmh: 760, nMax: 8,
    roll: [120, 380, 420], tactic: 'energy', tailDragger: true, rearView: 0.55,
    guns: [gun('shvak', 2, 200, 'cowl')],
    loadouts: [STD],
    buildTime: 150, cruiseAlt: 4000, vmaxKmh: 661, vmaxAlt: 6000,
  },
  {
    id: 'p38j', name: 'Lockheed P-38J Lightning', abbr: 'P-38J', origin: 'ABD', year: 1943,
    generation: 'P2', role: 'fighter', model: 'p38',
    description: 'Çift kuyruk kirişli, turbo süperşarjlı iki motorlu avcı: burunda toplanmış ateş, çok uzun menzil, yüksekte hızlı. Ağır yuvarlanır; hızlı dalışta sıkıştırılabilirlik kumandayı kilitler.',
    hp: 230, armor: 0.2, crew: 1, engine: inline('2 × Allison V-1710-89/91', 1060, 8000, { count: 2, twoStage: true, wep: 1.1, propEff: 0.92, sl: 1.0 }),
    massEmpty: 6820, fuelKg: 1120, wingArea: 30.4, span: 15.85, clMax: 1.75, oswald: 0.95, mcrit: 0.65, machTuck: 0.6, vneKmh: 760, nMax: 6.5,
    roll: [70, 360, 380], tactic: 'energy', tailDragger: false, rearView: 0.5, gOnset: 5,
    guns: [gun('hisp', 1, 150, 'nose'), gun('mg127', 4, 500, 'nose')],
    loadouts: [STD],
    dive: { diveAngle: 45, releaseAlt: 900 },
    buildTime: 230, cruiseAlt: 7000, vmaxKmh: 667, vmaxAlt: 7600,
  },
  {
    id: 'f6f5', name: 'Grumman F6F-5 Hellcat', abbr: 'F6F-5', origin: 'ABD', year: 1944,
    generation: 'P2', role: 'fighter', model: 'f6f',
    description: 'Büyük kanatlı, çok sağlam deniz avcısı: Pasifik’te en çok düşürme yapan Amerikan uçağı. İyi döner, pilotunu korur; altı 12,7 mm, bomba ve roket taşır.',
    hp: 220, armor: 0.28, crew: 1, engine: radial('Pratt & Whitney R-2800-10W', 1490, 6000, { twoStage: true, wep: 1.12, propEff: 0.856, sl: 1.0 }),
    massEmpty: 5030, fuelKg: 680, wingArea: 31.0, span: 13.06, clMax: 1.7, oswald: 0.91, mcrit: 0.7, vneKmh: 760, nMax: 7.5,
    roll: [90, 380, 400], tactic: 'turn', tailDragger: true, rearView: 0.55,
    guns: [gun('mg127', 6, 400, 'wing', 2.7)],
    loadouts: [STD],
    dive: { diveAngle: 50, releaseAlt: 800 },
    buildTime: 180, cruiseAlt: 6000, vmaxKmh: 629, vmaxAlt: 7100,
  },
  {
    id: 'lancaster', name: 'Avro Lancaster B.I', abbr: 'Lancaster', origin: 'Birleşik Krallık', year: 1942,
    generation: 'P2', role: 'bomber', model: 'lancaster',
    description: 'Dört Merlin motorlu ağır gece bombardıman uçağı: 6 tonu aşan bomba bölmesiyle çağının en büyük yükü. Savunması yalnız 7,7 mm makinelilerden; altı korumasız.',
    hp: 900, armor: 0.15, crew: 7, engine: inline('4 × Rolls-Royce Merlin XX', 900, 3800, { count: 4, propEff: 0.7, sl: 1.05 }),
    massEmpty: 16900, fuelKg: 7000, wingArea: 120.5, span: 31.09, clMax: 1.45, oswald: 0.8, mcrit: 0.58, vneKmh: 580, nMax: 3,
    roll: [18, 280, 280], tactic: 'turn', tailDragger: true, gOnset: 2, visualRange: 6000,
    guns: [],
    turrets: [
      turret('Burun (FN5, çift)', [0, 0.2, 9.2], 0, 60, [-40, 40], gun('mg77', 2, 1000), true),
      turret('Sırt (FN50, çift)', [0, 1.6, -1.0], 180, 175, [3, 80], gun('mg77', 2, 1000), true),
      turret('Kuyruk (FN20, dörtlü)', [0, 0.9, -10.6], 180, 45, [-45, 45], gun('mg77', 4, 2500), true),
    ],
    loadouts: [bombs('lb1000x14', '14 × 1000 lb', BOMBS.lb1000, 14, 0)],
    buildTime: 420, cruiseAlt: 6000, vmaxKmh: 454, vmaxAlt: 5600,
  },
  {
    id: 'mosquito', name: 'de Havilland Mosquito FB Mk VI', abbr: 'Mosquito', origin: 'Birleşik Krallık', year: 1943,
    generation: 'P2', role: 'attacker', model: 'mosquito',
    description: '“Ahşap mucize”: iki Merlinli, çok hızlı avcı-bombardıman. Burnunda dört 20 mm top ve dört makineli; bomba bölmesi ve kanat altında bomba ya da roket. Savunma silahı yok, hızına güvenir.',
    hp: 320, armor: 0.1, crew: 2, engine: inline('2 × Rolls-Royce Merlin 25', 1100, 2800, { count: 2, propEff: 0.7, sl: 1.1 }),
    massEmpty: 6490, fuelKg: 1500, wingArea: 42.18, span: 16.52, clMax: 1.4, oswald: 0.8, mcrit: 0.65, vneKmh: 680, nMax: 6,
    roll: [70, 360, 380], tactic: 'energy', tailDragger: true, gOnset: 4.5,
    guns: [gun('hisp', 4, 150, 'nose'), gun('mg77', 4, 750, 'nose')],
    loadouts: [STD],
    buildTime: 250, cruiseAlt: 4500, vmaxKmh: 608, vmaxAlt: 4300,
  },
  // ============================================================ Son pervaneliler (jet dönemiyle aynı yıllar)
  {
    id: 'seafury', name: 'Hawker Sea Fury FB.11', abbr: 'Sea Fury', origin: 'Birleşik Krallık', year: 1947,
    generation: 'P2', role: 'fighter', model: 'seafury',
    description: 'Pervaneli avcıların son ve en hızlılarından: 2480 bg Centaurus radyal motor, dört 20 mm top. Kore’de bir MiG-15 bile düşürdü. Bomba ve 12 roketle avcı-bombardıman.',
    hp: 190, armor: 0.2, crew: 1, engine: radial('Bristol Centaurus XVIII', 1850, 5500, { twoStage: true, wep: 1.08, propEff: 0.841, sl: 1.0 }),
    massEmpty: 5000, fuelKg: 520, wingArea: 26.0, span: 11.7, clMax: 1.67, oswald: 0.95, mcrit: 0.76, vneKmh: 850, nMax: 8,
    roll: [120, 420, 470], tactic: 'turn', tailDragger: true, rearView: 0.65,
    guns: [gun('hisp', 4, 145, 'wing', 2.3)],
    loadouts: [STD],
    dive: { diveAngle: 50, releaseAlt: 800 },
    buildTime: 190, cruiseAlt: 6000, vmaxKmh: 740, vmaxAlt: 5500,
  },
  {
    id: 'f8f', name: 'Grumman F8F-1 Bearcat', abbr: 'F8F-1', origin: 'ABD', year: 1945,
    generation: 'P2', role: 'fighter', model: 'f8f',
    description: 'Mümkün olan en küçük gövdeye en büyük motor: tırmanışı ilk jetlerle yarışır. Çok çevik ama menzili kısa; dört 12,7 mm makineli.',
    hp: 150, armor: 0.15, crew: 1, engine: radial('Pratt & Whitney R-2800-34W', 1566, 5300, { twoStage: true, wep: 1.2, propEff: 0.825, sl: 1.05 }),
    massEmpty: 3700, fuelKg: 505, wingArea: 22.67, span: 10.92, clMax: 1.41, oswald: 0.95, mcrit: 0.74, vneKmh: 800, nMax: 7.5,
    roll: [130, 420, 450], tactic: 'energy', tailDragger: true, rearView: 0.7,
    guns: [gun('mg127', 4, 300, 'wing', 2.4)],
    loadouts: [STD],
    buildTime: 160, cruiseAlt: 6000, vmaxKmh: 678, vmaxAlt: 6000,
  },
  {
    id: 'f4u4', name: 'Vought F4U-4 Corsair', abbr: 'F4U-4', origin: 'ABD', year: 1945,
    generation: 'P2', role: 'fighter', model: 'f4u',
    description: 'Ters martı kanatlı, uzun burunlu avcı-bombardıman. Hızlı, dayanıklı, çok yük taşır: Kore’de yakın hava desteğinin bel kemiği. Altı 12,7 mm makineli.',
    hp: 210, armor: 0.25, crew: 1, engine: radial('Pratt & Whitney R-2800-18W', 1566, 7000, { twoStage: true, wep: 1.17, propEff: 0.92, sl: 1.0 }),
    massEmpty: 4900, fuelKg: 640, wingArea: 29.17, span: 12.5, clMax: 1.48, oswald: 0.8, mcrit: 0.73, vneKmh: 830, nMax: 7.5,
    roll: [100, 420, 470], tactic: 'energy', tailDragger: true, rearView: 0.6,
    guns: [gun('mg127', 6, 400, 'wing', 2.9)],
    loadouts: [STD],
    dive: { diveAngle: 55, releaseAlt: 800 },
    buildTime: 190, cruiseAlt: 6500, vmaxKmh: 718, vmaxAlt: 7900,
  },
  {
    id: 'ad4', name: 'Douglas AD-4 Skyraider', abbr: 'AD-4', origin: 'ABD', year: 1949,
    generation: 'P2', role: 'diveBomber', model: 'ad4',
    description: 'Jet çağında yapılmış pervaneli pike ve taarruz uçağı: 15 askıda 3600 kg yük, dört 20 mm top, saatlerce hedef üstünde kalır. Yavaş ama çok dayanıklı.',
    hp: 320, armor: 0.35, crew: 1, engine: radial('Wright R-3350-26WA', 2013, 2500, { propEff: 0.7, sl: 1.05 }),
    massEmpty: 5430, fuelKg: 1035, wingArea: 37.2, span: 15.25, clMax: 1.55, oswald: 0.8, mcrit: 0.6, vneKmh: 650, nMax: 7,
    roll: [70, 350, 350], tactic: 'turn', tailDragger: true, diveBrakes: true, gOnset: 4.5,
    guns: [gun('hisp', 4, 200, 'wing', 2.9)],
    loadouts: [STD],
    dive: { diveAngle: 65, releaseAlt: 700 },
    buildTime: 210, cruiseAlt: 3500, vmaxKmh: 518, vmaxAlt: 5500,
  },
  {
    id: 'a26b', name: 'Douglas A-26B Invader', abbr: 'A-26B', origin: 'ABD', year: 1944,
    generation: 'P2', role: 'attacker', model: 'a26',
    description: 'Hızlı iki motorlu taarruz bombardıman uçağı: burnunda sekiz 12,7 mm makineli, iç bölmede 1800 kg bomba, kanat altında roket; uzaktan kumandalı sırt ve karın taretleri.',
    hp: 520, armor: 0.25, crew: 3, engine: radial('2 × Pratt & Whitney R-2800-79', 1491, 3500, { count: 2, wep: 1.1, propEff: 0.7, sl: 1.0 }),
    massEmpty: 10365, fuelKg: 2100, wingArea: 50.17, span: 21.34, clMax: 1.45, oswald: 0.8, mcrit: 0.62, vneKmh: 680, nMax: 4.5,
    roll: [45, 320, 330], tactic: 'turn', tailDragger: false, gOnset: 3,
    guns: [gun('mg127', 8, 350, 'nose')],
    turrets: [
      turret('Sırt (uzaktan, çift)', [0, 1.3, -1.0], 0, 180, [3, 85], gun('mg127', 2, 500), true),
      turret('Karın (uzaktan, çift)', [0, -1.2, -3.0], 180, 70, [-80, -3], gun('mg127', 2, 500), true),
    ],
    loadouts: [STD],
    buildTime: 280, cruiseAlt: 3000, vmaxKmh: 571, vmaxAlt: 4600,
  },
  {
    id: 'b29', name: 'Boeing B-29A Superfortress', abbr: 'B-29', origin: 'ABD', year: 1945,
    generation: 'P2', role: 'bomber', model: 'b29',
    description: 'Basınçlı kabinli dev stratejik bombardıman uçağı: 9 km’nin üstünden 9 tona kadar bomba, merkezi atış kontrollü uzaktan kumandalı taretler. Pervaneli dönemin zirvesi.',
    hp: 1300, armor: 0.2, crew: 11, engine: radial('4 × Wright R-3350-23', 1640, 9000, { count: 4, twoStage: true, propEff: 0.7, sl: 1.0 }),
    massEmpty: 33800, fuelKg: 9000, wingArea: 161.3, span: 43.05, clMax: 1.6, oswald: 0.8, mcrit: 0.6, vneKmh: 520, nMax: 3,
    roll: [15, 280, 280], tactic: 'turn', tailDragger: false, gOnset: 1.8, visualRange: 6500,
    guns: [],
    turrets: [
      turret('Ön sırt (çift)', [0, 2.0, 9.0], 0, 180, [3, 85], gun('mg127', 2, 500), true),
      turret('Arka sırt (çift)', [0, 2.0, -6.0], 180, 180, [3, 85], gun('mg127', 2, 500), true),
      turret('Ön karın (çift)', [0, -2.0, 7.0], 0, 180, [-85, -3], gun('mg127', 2, 500), true),
      turret('Arka karın (çift)', [0, -2.0, -5.0], 180, 180, [-85, -3], gun('mg127', 2, 500), true),
      turret('Kuyruk (çift)', [0, 1.0, -14.5], 180, 40, [-35, 35], gun('mg127', 2, 500), true),
    ],
    loadouts: [STD],
    buildTime: 600, cruiseAlt: 8500, vmaxKmh: 574, vmaxAlt: 7600,
  },
  // ============================================================ Çeşitlilik: diğer ilk nesil jetler
  {
    id: 'he162', name: 'Heinkel He 162 A-2 Salamander', abbr: 'He 162', origin: 'Almanya', year: 1945,
    generation: 'J1', role: 'fighter', model: 'he162',
    description: '“Halk avcısı”: 90 günde tasarlanıp üretilen, sırtında tek motorlu, küçük ahşap kanatlı jet. Hızlı ve çevik ama yakıtı yarım saat yeter; motoru hassas, uçuşu affetmez.',
    hp: 110, armor: 0.08, crew: 1, engine: jet('BMW 003E-1', 7.8, { spool: 9, tsfc: 0.14 }),
    massEmpty: 2245, fuelKg: 555, wingArea: 14.5, span: 7.2, clMax: 1.2, mcrit: 0.76, cdWave: 0.08, machTuck: 0.4, vneKmh: 900, nMax: 6.5,
    roll: [110, 450, 450], tactic: 'energy', tailDragger: false, rearView: 0.4,
    guns: [gun('mg151', 2, 120, 'nose')],
    loadouts: [STD],
    buildTime: 150, cruiseAlt: 6000, vmaxKmh: 790, vmaxAlt: 6000,
  },
  {
    id: 'f80c', name: 'Lockheed F-80C Shooting Star', abbr: 'F-80C', origin: 'ABD', year: 1948,
    generation: 'J1', role: 'fighter', model: 'p80',
    description: 'Amerika’nın ilk hizmete giren jet avcısı. Kore’de MiG-15’le karşılaşınca yerini F-86’ya bırakıp avcı-bombardıman oldu: uç tankları, bomba ve roketle yakın hava desteği.',
    hp: 175, armor: 0.15, crew: 1, engine: jet('Allison J33-A-35', 20.5, { spool: 6, tsfc: 0.12 }),
    massEmpty: 4200, fuelKg: 1300, wingArea: 22.07, span: 11.81, clMax: 1.2, mcrit: 0.78, cdWave: 0.07, machTuck: 0.35, vneKmh: 980, nMax: 7.33,
    roll: [120, 450, 450], tactic: 'energy', tailDragger: false, rearView: 0.6,
    guns: [gun('mg127', 6, 300, 'nose')],
    loadouts: [STD],
    buildTime: 230, cruiseAlt: 8000, vmaxKmh: 965, vmaxAlt: 600,
  },
  {
    id: 'vampire', name: 'de Havilland Vampire FB.5', abbr: 'Vampire', origin: 'Birleşik Krallık', year: 1949,
    generation: 'J1', role: 'fighter', model: 'vampire',
    description: 'Çift kuyruk kirişli, tek motorlu küçük jet: kısa egzoz borusu motorun gücünü az kayıpla kullanır. Çok çevik, dört 20 mm top; yüksek hızda Mach sınırına erken varır.',
    hp: 150, armor: 0.1, crew: 1, engine: jet('de Havilland Goblin 2', 13.8, { spool: 6, tsfc: 0.12 }),
    massEmpty: 3600, fuelKg: 740, wingArea: 24.3, span: 11.58, clMax: 1.3, mcrit: 0.76, cdWave: 0.08, machTuck: 0.45, vneKmh: 880, nMax: 7,
    roll: [110, 420, 420], tactic: 'turn', tailDragger: false, rearView: 0.5,
    guns: [gun('hisp', 4, 150, 'nose')],
    loadouts: [STD],
    buildTime: 190, cruiseAlt: 8000, vmaxKmh: 861, vmaxAlt: 5000,
  },
  {
    id: 'ar234', name: 'Arado Ar 234 B-2 Blitz', abbr: 'Ar 234', origin: 'Almanya', year: 1944,
    generation: 'J1', role: 'bomber', model: 'ar234',
    description: 'İlk jet bombardıman ve keşif uçağı: tek pilotlu, savunma silahsız; hızıyla pervanelilerin yetişemeyeceği yükseklikte ve süratte kaçar. 1500 kg’a kadar bomba.',
    hp: 260, armor: 0.1, crew: 1, engine: jet('2 × Junkers Jumo 004B', 8.8, { count: 2, spool: 10, tsfc: 0.14 }),
    massEmpty: 5200, fuelKg: 3000, wingArea: 26.4, span: 14.41, clMax: 1.3, mcrit: 0.7, cdWave: 0.08, machTuck: 0.4, vneKmh: 850, nMax: 4,
    roll: [55, 400, 420], tactic: 'energy', tailDragger: false, gOnset: 3, visualRange: 5500,
    guns: [],
    loadouts: [bombs('b500x3', '3 × SC 500', BOMBS.b500, 3, 0.06)],
    buildTime: 320, cruiseAlt: 8000, vmaxKmh: 742, vmaxAlt: 6000,
  },
  {
    id: 'il28', name: 'Ilyushin Il-28', abbr: 'Il-28', origin: 'Sovyetler Birliği', year: 1950,
    generation: 'J1', role: 'bomber', model: 'il28',
    description: 'Düz kanatlı, ok kuyruklu üç kişilik jet bombardıman: sağlam, basit ve hızlı. Kuyruk taretinde iki 23 mm top, burunda iki sabit 23 mm. 3 tona kadar bomba.',
    hp: 520, armor: 0.12, crew: 3, engine: jet('2 × Klimov VK-1A', 26.5, { count: 2, spool: 5, tsfc: 0.11 }),
    massEmpty: 12890, fuelKg: 6300, wingArea: 60.8, span: 21.45, clMax: 1.3, mcrit: 0.76, cdWave: 0.08, machTuck: 0.35, vneKmh: 950, nMax: 4,
    roll: [55, 450, 480], tactic: 'energy', tailDragger: false, gOnset: 3, visualRange: 5500,
    guns: [gun('nr23', 2, 100, 'nose')],
    turrets: [turret('Kuyruk (Il-K6, çift)', [0, 0.6, -9.5], 180, 70, [-40, 40], gun('nr23', 2, 225), true)],
    loadouts: [bombs('fab250x12', '12 × FAB-250', BOMBS.b250, 12, 0)],
    buildTime: 380, cruiseAlt: 10000, vmaxKmh: 902, vmaxAlt: 4500,
  },
  // ============================================================ Sonraki aşama (radar ve füze)
  {
    id: 'mig21', name: 'Mikoyan-Gurevich MiG-21F-13', abbr: 'MiG-21F', origin: 'Sovyetler Birliği', year: 1960,
    generation: 'J2', role: 'fighter', model: 'jetDelta', playable: false,
    description: 'Delta kanatlı, iki Mach yapabilen hafif önleyici. Art yakıcı ve ilk ısı güdümlü füzeler.',
    hp: 160, armor: 0.1, crew: 1, engine: jet('Tumansky R-11F-300', 38.7, { abKn: 56.4, spool: 4, tsfc: 0.095 }),
    massEmpty: 5600, fuelKg: 2000, wingArea: 23, span: 7.15, clMax: 1.0, oswald: 0.6, mcrit: 0.92, cdWave: 0.045, machTuck: 0.1, vneKmh: 1300, nMax: 7,
    roll: [200, 550, 900], tactic: 'energy', tailDragger: false, rearView: 0.4, gOnset: 9,
    guns: [gun('n37', 1, 30)], loadouts: [STD],
    buildTime: 300, cruiseAlt: 10000, vmaxKmh: 2125, vmaxAlt: 12500,
  },
  {
    id: 'f4e', name: 'McDonnell Douglas F-4E Phantom II', abbr: 'F-4E', origin: 'ABD', year: 1967,
    generation: 'J3', role: 'fighter', model: 'jetHeavy', playable: false,
    description: 'Ağır, çift motorlu çok amaçlı uçak. Güçlü radar ve yarı aktif radar güdümlü füzeler.',
    hp: 200, armor: 0.1, crew: 2, engine: jet('2 × General Electric J79', 52.8, { count: 2, abKn: 79.6, spool: 4, tsfc: 0.085 }),
    massEmpty: 14500, fuelKg: 6000, wingArea: 49.2, span: 11.7, clMax: 1.1, oswald: 0.65, mcrit: 0.92, cdWave: 0.05, machTuck: 0.1, vneKmh: 1400, nMax: 7.3,
    roll: [150, 600, 900], tactic: 'energy', tailDragger: false, rearView: 0.5, gOnset: 9,
    guns: [gun('mg127', 1, 1)], loadouts: [STD],
    buildTime: 320, cruiseAlt: 10000, vmaxKmh: 2370, vmaxAlt: 12000,
  },
  {
    id: 'f15a', name: 'McDonnell Douglas F-15A Eagle', abbr: 'F-15A', origin: 'ABD', year: 1976,
    generation: 'J4', role: 'fighter', model: 'jetTwinTail', playable: false,
    description: 'Çift dikey kuyruklu hava üstünlük avcısı. İtki/ağırlık 1’in üzerinde; darbeli-doppler radar ve her açıdan IR füze.',
    hp: 210, armor: 0.1, crew: 1, engine: jet('2 × Pratt & Whitney F100', 65, { count: 2, abKn: 106, spool: 3, tsfc: 0.07 }),
    massEmpty: 13000, fuelKg: 6100, wingArea: 56.5, span: 13.05, clMax: 1.3, oswald: 0.7, mcrit: 0.92, cdWave: 0.045, machTuck: 0.05, vneKmh: 1500, nMax: 9,
    roll: [240, 600, 1200], tactic: 'energy', tailDragger: false, rearView: 0.85, gOnset: 12,
    guns: [gun('hisp', 1, 1)], loadouts: [STD],
    buildTime: 340, cruiseAlt: 10000, vmaxKmh: 2650, vmaxAlt: 12000,
  },
  {
    id: 'rafale', name: 'Dassault Rafale C', abbr: 'Rafale', origin: 'Fransa', year: 2001,
    generation: 'J45', role: 'fighter', model: 'jetCanard', playable: false,
    description: 'Kanard-delta çok rollü avcı. AESA radar, aktif radar güdümlü füzeler, gelişmiş karşı tedbirler.',
    hp: 190, armor: 0.1, crew: 1, engine: jet('2 × Snecma M88', 50, { count: 2, abKn: 75, spool: 3, tsfc: 0.07 }),
    massEmpty: 10000, fuelKg: 4700, wingArea: 45.7, span: 10.9, clMax: 1.4, oswald: 0.65, mcrit: 0.92, cdWave: 0.04, machTuck: 0.05, vneKmh: 1450, nMax: 9,
    roll: [260, 600, 1200], tactic: 'energy', tailDragger: false, rearView: 0.85, gOnset: 13,
    guns: [gun('mk108', 1, 1)], loadouts: [STD],
    buildTime: 340, cruiseAlt: 10000, vmaxKmh: 1900, vmaxAlt: 11000,
  },
  {
    id: 'f22a', name: 'Lockheed Martin F-22A Raptor', abbr: 'F-22A', origin: 'ABD', year: 2005,
    generation: 'J5', role: 'fighter', model: 'jetStealth', playable: false,
    description: 'Düşük radar izli hava üstünlük avcısı. Düşmanı o fark etmeden görür; art yakıcısız süper seyir yapabilir.',
    hp: 200, armor: 0.1, crew: 1, engine: jet('2 × Pratt & Whitney F119', 116, { count: 2, abKn: 156, spool: 3, tsfc: 0.065 }),
    massEmpty: 20000, fuelKg: 8200, wingArea: 78, span: 13.56, clMax: 1.4, oswald: 0.65, mcrit: 0.95, cdWave: 0.035, machTuck: 0.05, vneKmh: 1500, nMax: 9,
    roll: [240, 600, 1200], tactic: 'energy', tailDragger: false, rearView: 0.85, gOnset: 13,
    guns: [gun('hisp', 1, 1)], loadouts: [STD],
    buildTime: 360, cruiseAlt: 12000, vmaxKmh: 2410, vmaxAlt: 12000,
  },
];

// ---------------------------------------------------------------- performans türetimi

const FULL: ThrustState = { throttle: 1, spool: 1, wep: false, afterburner: false };

function state(throttle: number, ab: boolean): ThrustState {
  return { throttle, spool: throttle, wep: false, afterburner: ab };
}

/** Bu irtifa, ağırlık ve gazda düz uçuşta ulaşılabilecek en yüksek hız (m/s). Yoksa 0. */
export function levelSpeed(s: AircraftSpec, h: number, mass: number, st: ThrustState = FULL): number {
  const vs = stallSpeedAt(s, h, mass, false);
  const f = (v: number) => thrustAt(s, v, h, st, BASE_MODS) - dragAt(s, v, h, 1, mass, 1);
  let hi = 900;
  let v = hi;
  while (v > vs * 1.05 && f(v) < 0) v -= 4;
  if (v <= vs * 1.05) return 0;
  let lo = v;
  hi = v + 4;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * levelSpeed'in hızlısı, yaklaşık değer bilinirken (türetmedeki tepe hız denetimi): kökü beklenenin çevresinde ikiye
 * bölerek arar; aralıkta kök yoksa tam aramaya döner.
 */
function levelSpeedNear(s: AircraftSpec, h: number, mass: number, st: ThrustState, guess: number): number {
  const f = (v: number) => thrustAt(s, v, h, st, BASE_MODS) - dragAt(s, v, h, 1, mass, 1);
  let lo = guess * 0.75;
  let hi = guess * 1.25;
  if (lo < stallSpeedAt(s, h, mass, false) * 1.05 || f(lo) <= 0 || f(hi) >= 0) return levelSpeed(s, h, mass, st);
  for (let k = 0; k < 22; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** En iyi tırmanma hızı (m/s) bu irtifada. */
export function climbRateAt(s: AircraftSpec, h: number, mass: number, st: ThrustState = FULL): number {
  const vs = stallSpeedAt(s, h, mass, false);
  let best = -Infinity;
  for (let v = vs * 1.15; v < vs * 6; v += 3) {
    const rc = ((thrustAt(s, v, h, st, BASE_MODS) - dragAt(s, v, h, 1, mass, 1)) * v) / (mass * G);
    if (rc > best) best = rc;
  }
  return best;
}

/**
 * Tutunma/vrille karakteri (pilot el kitapları ve test raporları): MiG-15 uyarısız vrilleye girer ve zor çıkar (çok
 * sayıda kayıp), Fw 190 sert dönüşte uyarısız yuvarlanır, I-16 affetmezdi; Spitfire ve Hurricane tutunmadan önce
 * belirgin sarsıntıyla uyarır, Hellcat ve Sıfır uysaldı. Bf 109'un kanat ucu çıtaları tutunmayı yumuşatır.
 */
const SPIN_PRONE: Record<string, number> = {
  mig15: 2.4, i16: 1.8, fw190a5: 1.6, p51d: 1.2, p38j: 0.8, yak3: 1.1, la7: 1.1, me262: 1.2, he162: 1.6,
  spitfire1: 0.6, spitfire5: 0.6, spitfire9: 0.6, hurricane1: 0.6, f6f5: 0.6, a6m2: 0.7, bf109e: 0.8, bf109f: 0.8,
  bf109g: 0.9, p47d: 0.8, f86f: 0.8, meteor3: 0.8, vampire: 0.8, f80c: 0.9,
};

/** Gerçek gövde uzunlukları (m). */
const LENGTHS: Record<string, number> = {
  hurricane1: 9.84, spitfire1: 9.12, spitfire5: 9.12, spitfire9: 9.47, meteor3: 12.57, f86f: 11.4, bf109e: 8.64, bf109f: 8.94,
  bf109g: 9.02, p51d: 9.83, me262: 10.6, mig15: 10.1, bf110c: 12.1, fw190a5: 8.95, p47d: 11.0, f84g: 11.6, il2: 11.6, il2m3: 11.6,
  typhoon: 9.73, il10: 11.12, ju87b: 11.0, sbd3: 10.09, ju87d: 11.5, sb2c: 11.18, he111: 16.4, ju88a4: 14.36, b25j: 16.13,
  b17g: 22.66, canberra: 19.96, i16: 6.13, a6m2: 9.06, blenheim: 12.98, p40e: 9.66, pe2: 12.66, yak3: 8.5, la7: 8.6, p38j: 11.53,
  f6f5: 10.24, lancaster: 21.11, mosquito: 12.47, seafury: 10.57, f8f: 8.61, f4u4: 10.27, ad4: 11.84, a26b: 15.24, b29: 30.18,
  he162: 9.05, f80c: 10.49, vampire: 9.37, ar234: 12.64, il28: 17.65, mig21: 14.5, f4e: 19.2, f15a: 19.43, rafale: 15.27, f22a: 18.92,
};

/**
 * Bilinen servis tavanları (m; tırmanışın 0,5 m/s'ye, 100 ft/dk'ya düştüğü irtifa, normal ağırlıkta), yaygın
 * kaynaklardan, ve bu tavanı veren irtifa düşüşü üssü (EngineSpec.lapse). Genel formül tek kademeli kompresörlü
 * avcıları ve erken jetleri 1–3 km fazla yükseltiyordu. Üsler `npm run sim:ceiling` ile bulunur (açılışta her seferinde
 * aramak telefonda yavaş); motor, ağırlık, sürükleme ya da azami hız değişirse yeniden çalıştırıp tabloyu güncelle.
 * Yalnız avcılar: bombardıman ve taarruz uçaklarının tavanı kaynaklarda yüklü ağırlıkta verilir, türetme ise yüksüz
 * ağırlıkla yapılır (karşılaştırılamaz).
 */
export const CEILINGS: Record<string, [ceiling: number, lapse: number]> = {
  hurricane1: [10400, 1.74], spitfire1: [10000, 1.92], spitfire5: [11100, 1.58], spitfire9: [12800, 1.09],
  bf109e: [10500, 1.2], bf109f: [11600, 1.17], bf109g: [11600, 1.26], p51d: [12770, 1.03], bf110c: [10000, 1.04],
  fw190a5: [10600, 1.41], p47d: [12800, 1.16], i16: [9700, 1.48], a6m2: [10000, 1.79], p40e: [8840, 1.57],
  yak3: [10700, 1.27], la7: [10450, 1.63], p38j: [13400, 1.13], f6f5: [11370, 1.38], seafury: [10900, 1.8],
  f8f: [11800, 1.46], f4u4: [12650, 1.19],
  meteor3: [13400, 0.83], me262: [11450, 1.08], he162: [12000, 0.81], f80c: [14200, 0.96], vampire: [13000, 1],
  mig15: [15500, 0.93], f84g: [12350, 1.03], f86f: [15100, 0.91],
};

function derive(dd: AircraftDef): AircraftSpec {
  const ab = !!dd.engine.abKn;
  const s: AircraftSpec = {
    id: dd.id, name: EN ? NAME_EN[dd.id] ?? dd.name : dd.name, abbr: dd.abbr, origin: dd.origin, year: dd.year, generation: dd.generation, role: dd.role,
    model: dd.model, description: EN ? DESC_EN[dd.id] ?? dd.description : dd.description, hp: dd.hp, size: Math.max(4.5, dd.span * 0.48), length: LENGTHS[dd.id] ?? dd.span * 0.85, armor: dd.armor,
    crew: dd.crew, engines: dd.engine.count, engine: dd.engine, massEmpty: dd.massEmpty, fuelKg: dd.fuelKg,
    wingArea: dd.wingArea, span: dd.span, clMax: dd.clMax, oswald: dd.oswald ?? 0.8, cd0: 0.02,
    cdWave: dd.cdWave ?? 0.12, mcrit: dd.mcrit, mdd: dd.mdd ?? dd.mcrit + 0.1, machTuck: dd.machTuck ?? 0.6, vne: kmh(dd.vneKmh), nMax: dd.nMax,
    rollPeak: d(dd.roll[0]), rollIas: kmh(dd.roll[1]), rollFade: kmh(dd.roll[2]),
    gOnset: dd.gOnset ?? (dd.role === 'bomber' ? 2.5 : 6),
    rearView: dd.rearView ?? 0.35, diveBrakes: !!dd.diveBrakes, tactic: dd.tactic,
    visualRange: dd.visualRange ?? 5000, tailDragger: dd.tailDragger, guns: dd.guns, turrets: dd.turrets ?? [],
    loadouts: [], hardpoints: STORE_TABLE[dd.id]?.hardpoints ?? [], maxLoad: STORE_TABLE[dd.id]?.maxLoad ?? 0,
    family: familyOf(dd.origin), dive: dd.dive, buildTime: dd.buildTime, cruiseAlt: dd.cruiseAlt, playable: dd.playable ?? true, spinProne: SPIN_PRONE[dd.id] ?? 1,
    vMax: 0, vMaxAlt: dd.vmaxAlt, vMaxSL: 0, vStall: 0, vDive: 0, nSustain: 0, thrust: 0, climbRate: 0, ceiling: 0,
    cruiseSpeed: 0, cruiseThrottle: 0, cruiseFlow: 0, fuelMinutes: 0, turnTime: 0, turnSpeed: 0,
    perf: { alt: [], vmax: [], climb: [] },
  };
  // Dış yükler: askı tablosundaki hazır yükler + katalogdaki silah kitleri
  const kits = dd.loadouts.filter((l) => l.replaceGuns).map((l) => ({ id: l.id, name: l.name, replaceGuns: l.replaceGuns!, requires: l.requires }));
  s.loadouts = buildLoadouts(s, kits);
  // Saldırı rolündeki uçaklarda varsayılan (ilk) yük boş değil, ilk hazır yük olsun
  if (s.role !== 'fighter' && s.loadouts.length > 1) s.loadouts.push(s.loadouts.shift()!);
  const m = s.massEmpty + s.fuelKg * 0.75;
  const st = state(1, ab);
  // İrtifa düşüşü: bilinen servis tavanına göre bulunmuş üs (Cd0'dan önce: azami hız düşüş bölgesinde olabilir)
  const ceil = CEILINGS[dd.id];
  s.engine.lapse = ceil ? ceil[1] : undefined;
  // Cd0: bilinen azami hızda itki = sürükleme
  {
    const h = dd.vmaxAlt;
    const v = kmh(dd.vmaxKmh);
    const T = thrustAt(s, v, h, st, BASE_MODS);
    const q = 0.5 * RHO0 * sigma(h) * v * v;
    const CL = (m * G) / (q * s.wingArea);
    const cd0 = T / (q * s.wingArea) - inducedK(s) * CL * CL - waveCd(s, v / soundSpeed(h));
    s.cd0 = clamp(cd0, 0.007, 0.09);
    // Belgelenen azami hız, uçağın en hızlı olduğu irtifadaki hızdır. Belgelenen irtifa kritik irtifanın biraz
    // üstündeyse (hücum havası etkisi) ya da jet itkisi irtifayla dik düşüyorsa tepe başka irtifaya kayıp belgeleneni
    // aşabilir: çevredeki irtifalarda tepe hız belgelenene eşitlenene dek Cd0 düzeltilir (pervanelide güç sınırlı,
    // v ∝ Cd0^−1/3; jette itki sınırlı, v ∝ Cd0^−1/2).
    const crit = s.engine.kind === 'jet' ? 0 : Math.min(s.engine.critAlt, h);
    const top = Math.max(s.engine.kind === 'jet' ? 10000 : s.engine.critAlt, h) + 500;
    const alts = [0];
    for (let a = Math.max(500, crit - 1000); a <= top; a += 500) alts.push(a);
    const k = s.engine.kind === 'jet' ? 2 : 3;
    for (let i = 0; i < 6; i++) {
      let peak = 0;
      for (const a of alts) peak = Math.max(peak, levelSpeedNear(s, a, m, st, v));
      if (Math.abs(peak / v - 1) < 0.002) break;
      s.cd0 = clamp(s.cd0 * Math.pow(peak / v, k), 0.007, 0.09);
    }
  }
  for (let h = 0; h <= 16000; h += 500) {
    s.perf.alt.push(h);
    s.perf.vmax.push(levelSpeed(s, h, m, st));
    s.perf.climb.push(Math.max(0, climbRateAt(s, h, m, st)));
  }
  let best = 0;
  for (let i = 0; i < s.perf.alt.length; i++) {
    if (s.perf.vmax[i] > best) {
      best = s.perf.vmax[i];
      s.vMaxAlt = s.perf.alt[i];
    }
  }
  s.vMax = best;
  s.vMaxSL = s.perf.vmax[0];
  s.vStall = stallSpeedAt(s, 0, m, false);
  s.climbRate = s.perf.climb[0];
  s.ceiling = 0;
  for (let i = 0; i < s.perf.alt.length; i++) if (s.perf.climb[i] >= 0.5) s.ceiling = s.perf.alt[i];
  s.thrust = thrustAt(s, 0, 0, st, BASE_MODS) / m;
  // Köşe hızında sürdürülebilir G
  {
    const vc = s.vStall * Math.sqrt(s.nMax);
    const T = thrustAt(s, vc, 0, st, BASE_MODS);
    s.nSustain = clamp(sustainableLoad(s, vc, 0, m, T, 1, s.nMax), 1, s.nMax);
  }
  // Sürdürülebilir dönüş: tutunma ve itki sınırının küçüğü
  {
    let bestW = 0;
    for (let v = s.vStall * 1.05; v < s.vMaxSL; v += 2) {
      const T = thrustAt(s, v, 0, st, BASE_MODS);
      const n = Math.min(s.nMax, liftLimitG(s, v, 0, m, false), sustainableLoad(s, v, 0, m, T, 1, s.nMax));
      if (n <= 1) continue;
      const w = (G * Math.sqrt(n * n - 1)) / v;
      if (w > bestW) {
        bestW = w;
        s.turnSpeed = v;
      }
    }
    s.turnTime = bestW > 0 ? (2 * Math.PI) / bestW : 99;
  }
  // Seyir: pervanelide ~%60 güç, jette ~%85 devir
  const cruiseAlt = Math.min(s.cruiseAlt, Math.max(s.ceiling - 500, 1000));
  s.cruiseAlt = cruiseAlt;
  let thr = s.engine.kind === 'jet' ? 0.85 : 0.6;
  let vc = 0;
  for (; thr <= 1.0001; thr += 0.05) {
    vc = levelSpeed(s, cruiseAlt, m, state(thr, false));
    if (vc > stallSpeedAt(s, cruiseAlt, m, false) * 1.45) break;
  }
  s.cruiseThrottle = Math.min(thr, 1);
  s.cruiseSpeed = vc > 0 ? vc : s.vMax * 0.75;
  s.cruiseFlow = fuelFlowAt(s, cruiseAlt, state(s.cruiseThrottle, false), BASE_MODS);
  s.fuelMinutes = s.fuelKg / Math.max(s.cruiseFlow, 1e-4) / 60;
  // Dalış sınırı: Vne (3000 m'de gerçek hız) ya da sıkışma
  s.vDive = Math.min(s.vne / Math.sqrt(sigma(3000)), (s.mcrit + 0.12) * soundSpeed(3000));
  return s;
}

const LIST: AircraftSpec[] = DEFS.map(derive);

/** Ayar araçları için (başarım kalibrasyonu): ham tanımlar ve türetme. */
export const AIRCRAFT_DEFS: readonly AircraftDef[] = DEFS;
export { derive as deriveSpec };
export type { AircraftDef };

export const SPEC_LIST: readonly AircraftSpec[] = LIST;
export const SPECS: Record<string, AircraftSpec> = Object.fromEntries(LIST.map((s) => [s.id, s]));

export const ROLE_NAMES: Record<Role, string> = {
  fighter: L('Avcı', 'Fighter'),
  diveBomber: L('Pike bombardıman', 'Dive bomber'),
  bomber: L('Bombardıman', 'Bomber'),
  attacker: L('Taarruz', 'Attacker'),
};

export const ENGINE_NAMES: Record<EngineKind, string> = {
  inline: L('Sıra motor (sıvı soğutmalı)', 'Inline engine (liquid-cooled)'),
  radial: L('Radyal motor (hava soğutmalı)', 'Radial engine (air-cooled)'),
  jet: L('Turbojet', 'Turbojet'),
};

export function generationInfo(id: GenerationId): GenerationInfo {
  return GENERATIONS.find((g) => g.id === id)!;
}

/** Bu irtifada düz uçuş azami hızı (performans tablosundan). */
export function vMaxAt(s: AircraftSpec, h: number): number {
  const p = s.perf;
  const x = clamp(h / 500, 0, p.alt.length - 1.001);
  const i = Math.floor(x);
  const f = x - i;
  return p.vmax[i] + (p.vmax[i + 1] - p.vmax[i]) * f;
}

/** Ana silah grubu (nişan balistiği için). */
export function primaryGun(s: AircraftSpec): GunSpec | null {
  return s.guns[0] ?? null;
}

/** Bombanın kütlesi dahil yük kütlesi (kg). */
export function loadoutMass(l: Loadout): number {
  return l.mass;
}
