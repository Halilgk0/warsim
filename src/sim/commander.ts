// Stratejik yapay zekâ (rakip ülke) ve iki taraf için ortak alarm (otomatik önleme) mantığı.

import type { World } from './world';
import type { Airbase } from './structures/airbase';
import { STRUCTURE_DEFS, type Structure } from './structures/structure';
import { SPECS, SPEC_LIST, type AircraftSpec, type Role } from './aircraft/specs';
import { defaultPlan, type MissionPlan } from './ai/missions';
import type { LaunchGroup } from './world';
import { flakTarget } from './ai/strike';
import { TECH_BY_ID, type Research } from './tech';
import { AA_WEAPONS, AA_WEAPON_ORDER, type AAWeaponId } from './structures/airDefense';
import { rand } from '../core/math';
import { groundLevel } from './terrain';
import { BASE_UPGRADE_COST, aircraftPrice, researchCost } from './economy';
import { L } from '../i18n';

/** Botun bataryaları: hafif, orta ve ağır; sınıfta açık olan ilk top. */
const BOT_GUNS: AAWeaponId[][] = [
  ['aa20q', 'oerlikon', 'aa20', 'mg'],
  ['aa40', 'aa37', 'aa20', 'mg'],
  ['aa128', 'aa41', 'aa90', 'aa88', 'aa40', 'aa37', 'aa20', 'mg'],
];

/** Bataryanın istediği top: kimliğinden sınıf, sınıfta açık olan ilk top. */
const botGun = (id: number, r: Research): AAWeaponId => BOT_GUNS[id % BOT_GUNS.length].find((g) => r.has(AA_WEAPONS[g].requires ?? undefined)) ?? 'mg';

/**
 * Hava savunma hattının sırası. Radar toplardan önce: yoksa yüksek akın ancak 20 km kala görülür, avcılar 6,5 km'ye tırmanamaz (120. dakikada
 * çoğu botta radar yoktu). Botlar 150 dakikada ancak altı yedi iş bitiriyor.
 */
const DEFENSE_PRIORITY = [
  'hd_20', 'observer', 'hd_rangefinder', 'radar_ew1', 'radio', 'hd_37', 'hd_88', 'hd_fort1', 'gci', 'hd_20q', 'hd_fort2', 'hd_predictor', 'hd_40',
  'hd_oerlikon', 'hd_90', 'hd_crew', 'hd_ammo', 'radar_ew2', 'hd_camo', 'hd_gunradar', 'hd_vt', 'hd_flak41', 'hd_128', 'hd_fort3',
];

const TECH_PRIORITY = [
  'hd_20', 'observer', 'radio', 'self_sealing', 'm_vp_prop', 'n_reflector', 'hd_fort1', 'pilot_armor', 'w_mg8', 'm_v12',
  'a_metal', 'hd_rangefinder', 'radar_ew1', 'w_20mm', 'drop_tanks', 'm_100oct', 'hd_37', 'hd_20q', 'bombsight2', 'n_recon', 'm_radial1', 'gci',
  'w_turret', 'n_divesight', 'a_diveflap', 'hd_fort2', 'hd_40', 'a_tub', 'rockets', 'n_rocketsight', 'm_wep', 'm_2stage', 'hd_88', 'w_hispano',
  'hd_ammo', 'hd_crew', 'm_radial2', 'n_gyro', 'p_gsuit', 'radar_ew2', 'w_heavybomb', 'a_bubble', 'a_laminar', 'w_power_turret', 'hd_predictor',
  'hd_camo', 'f_bigtank', 'm_turbo', 'w_30mm', 'hd_gunradar', 'f_internal', 'hd_vt', 'hd_128', 'hd_fort3', 'j_centrifugal', 'j_axial', 'j_eject', 'j_swept', 'j_nene',
  'j_tiptank', 'j_37mm', 'j_radarsight', 'j_hydraulic',
];

// Me 262 A-1a/U4 (ac_me262u4) listede yok: tek 50 mm toplu bombardıman avcısı avcıya karşı zayıf, bot ise en yeni avcıyı
// her işe gönderir (bestUnlocked). Araştırmazsa hiç üretmez; eklemek bot dengesini değiştirir (240 dk'lık ölçüm ister).
const VEHICLE_PRIORITY = [
  'ac_spitfire1', 'ac_bf109f', 'ac_sbd3', 'ac_ju88a4', 'ac_bf110c', 'ac_p40e', 'ac_il2', 'ac_a6m2', 'ac_spitfire5', 'ac_bf109g',
  'ac_fw190a5', 'ac_pe2', 'ac_il2m3', 'ac_ju87d', 'ac_b25j', 'ac_yak3', 'ac_la7', 'ac_spitfire9', 'ac_p51d', 'ac_p47d', 'ac_p38j',
  'ac_f6f5', 'ac_typhoon', 'ac_mosquito', 'ac_b17g', 'ac_lancaster', 'ac_sb2c', 'ac_il10',
  'ac_me262', 'ac_meteor3', 'ac_he162', 'ac_ar234', 'ac_f8f', 'ac_f4u4', 'ac_seafury', 'ac_ad4', 'ac_a26b', 'ac_b29', 'ac_vampire',
  'ac_f80c', 'ac_mig15', 'ac_f86f', 'ac_f84g', 'ac_il28', 'ac_canberra',
];

export interface CommanderState {
  /** Eski kayıtlarda yok. */
  defenseFund?: number;
  timer: number;
  raidTimer: number;
  capCooldown: number;
  homeSeed: number;
  /** Yatırım fonu (eski kayıtlarda yalnız maden fonuydu). */
  mineFund?: number;
  investFund?: number;
  forceFund?: number;
  ferryTimer?: number;
  foe?: number | null;
  stage?: RaidStage;
  stageRaids?: number;
  stageStart?: number;
  focusId?: number | null;
}

/** Hedef ülkeye karşı baskın evresi: önce çevresi (savunma, radar, fabrika, madenler), sonra ana üssü. */
type RaidStage = 'outer' | 'base';
/** Çevre evresi en çok bu kadar baskın ya da süre sürer (botlar oyalanmasın). */
const OUTER_RAIDS = 2;
const OUTER_TIME = 1500;

/** Yatırım fonunun sıradaki hedefi. */
type Invest = { kind: 'mine' | 'airbase'; cost: number } | { kind: 'factory'; cost: number; base: Airbase };

/** Askeri fonun sıradaki alımı. */
type Need =
  | { kind: 'aircraft'; specId: string; price: number }
  | { kind: 'aa' | 'radar'; price: number };

/**
 * Gelir payları: yatırım fonu (maden, yeni hava üssü, fabrika) ve askeri ihtiyaç varken askeri fon; kalanı ve dolan
 * fonların taşanı araştırmaya, yükseltmelere ve fazla uçağa gider.
 */
const INVEST_SHARE = 0.2;
/** İkinci üs kurulana kadar: son üs yıkılınca kasada yenisinin parası yoksa taraf elenir. */
const INVEST_SHARE_ONE_BASE = 0.35;
const DEFENSE_SHARE_ONE_BASE = 0.05;
const FORCE_SHARE = 0.3;
/**
 * Gelirin topa ayrılan payı. Filo ve yatırım fonları parayı hep önce aldığı için botlar 90 dakikada 12,7 mm'de kalıyordu: 1,8 km'nin
 * üstünde uçan bombardıman uçağına hiçbir batarya ateş edemiyordu. Pay yatırımdan gelir (0,35 → 0,20 + 0,15): toplam ayrılan para aynı
 * kalsın, araştırmanın parası azalmasın (ayrı rezerv yapınca uçak araştırması geriledi). Tek üslü botta yatırım payına dokunulmaz: payı her
 * zaman kısınca ikinci üsler azaldı ve botlar 170–230. dakikalarda elenmeye başladı (0/16 → 7/16).
 */
const DEFENSE_SHARE = 0.15;
const DEFENSE_MAX = 9000;
/** Fon dolmadan da yatırım yapılır: kasada maliyetinin üstünde bu kadar para varsa. */
const INVEST_SPARE = 6000;

interface Fleet {
  fighters: number;
  strikers: number;
  /** Hangarda ve fabrika kuyruğunda yer (uçak sayısı). */
  room: number;
}

export interface CommanderOptions {
  research: boolean;
  upgrades: boolean;
  production: boolean;
  cap: boolean;
  raids: boolean;
  /** İlk baskına kadar süre (s). */
  firstRaid: number;
}

/** Açılmış uçaklar arasından role göre en yenileri (yıl, sonra hız). */
export function bestUnlocked(research: Research, role: Role, n = 2): AircraftSpec[] {
  return SPEC_LIST.filter((s) => s.role === role && s.playable && research.hasAircraft(s.id))
    .sort((a, b) => b.year - a.year || b.vMax - a.vMax)
    .slice(0, n);
}

/** Bu üste hazır bekleyen avcı tipleri, en iyisi önce. */
/**
 * Önleyicinin kalkıp verilen irtifaya tırmanma süresi (sn): kalkış ~75 sn + tam güçle tırmanış (yükle biraz yavaş).
 * Fw 190 A-5 ~7 km'ye ~11 dk; 1943'te Alman kontrolü bu yüzden kolları radarla 150 km'den izleyip erken kaldırırdı.
 */
function timeToAltitude(spec: AircraftSpec, from: number, to: number): number {
  let t = 75;
  const { alt, climb } = spec.perf;
  for (let h = Math.max(0, from); h < to; h += 250) {
    const i = Math.min(Math.floor(h / 500), alt.length - 1);
    t += Math.min(250, to - h) / Math.max(climb[i] * 0.85, 2);
  }
  return t;
}

function readyFighters(b: Airbase): string[] {
  const ids = [...new Set(b.inventory.filter((a) => a.status === 'ready').map((a) => a.specId))];
  return ids.filter((id) => SPECS[id].role === 'fighter').sort((x, y) => SPECS[y].year - SPECS[x].year || SPECS[y].vMax - SPECS[x].vMax);
}

export class Commander {
  private timer = 2;
  private raidTimer: number;
  private capCooldown = 20;
  private homeSeed = 3;
  /** Sıradaki yatırım (maden, hava üssü, fabrika) için ayrılan para (gelirin INVEST_SHARE'i). */
  private investFund = 0;
  /** Bu turun yatırım hedefi. */
  private invest: Invest | null = null;
  /** Üsler arası uçak dengelemesine kalan süre (s). */
  private ferryTimer = 300;
  /** Askeri fon: asgari filonun sıradaki uçağı, uçaksavar ya da radar için ayrılan para (gelirin FORCE_SHARE'i). */
  private forceFund = 0;
  /** Topa ayrılmış para (kr). */
  private defenseFund = 0;
  private lastEarned = -1;
  /** Bu turun askeri ihtiyacı. */
  private need: Need | null = null;
  /** Hedef ülke ve baskın evresi; yarım kalan hedef (odak). */
  private foe: number | null = null;
  private stage: RaidStage = 'outer';
  private stageRaids = 0;
  private stageStart = 0;
  private focusId: number | null = null;

  constructor(
    readonly team: number,
    readonly opts: CommanderOptions,
  ) {
    this.raidTimer = opts.firstRaid;
  }

  /** Kayıt için zamanlayıcılar. */
  saveState(): CommanderState {
    return {
      defenseFund: this.defenseFund, timer: this.timer, raidTimer: this.raidTimer, capCooldown: this.capCooldown, homeSeed: this.homeSeed, investFund: this.investFund, ferryTimer: this.ferryTimer,
      forceFund: this.forceFund, foe: this.foe, stage: this.stage, stageRaids: this.stageRaids, stageStart: this.stageStart, focusId: this.focusId,
    };
  }

  loadState(st: CommanderState): void {
    this.defenseFund = st.defenseFund ?? 0;
    this.timer = st.timer;
    this.raidTimer = st.raidTimer;
    this.capCooldown = st.capCooldown;
    this.homeSeed = st.homeSeed;
    this.investFund = st.investFund ?? st.mineFund ?? 0;
    this.ferryTimer = st.ferryTimer ?? 300;
    this.forceFund = st.forceFund ?? 0;
    this.foe = st.foe ?? null;
    this.stage = st.stage ?? 'outer';
    this.stageRaids = st.stageRaids ?? 0;
    this.stageStart = st.stageStart ?? 0;
    this.focusId = st.focusId ?? null;
  }

  update(world: World, dt: number): void {
    if (world.teams[this.team]?.eliminated) return;
    this.timer -= dt;
    this.raidTimer -= dt;
    this.capCooldown -= dt;
    this.ferryTimer -= dt;
    if (this.timer > 0) return;
    this.timer = 3;
    const r = world.teams[this.team].research;
    if (this.opts.research) {
      // Uçak hattı para beklerken mühendislik hattına yeni iş verilmez: ucuz araştırmalar parayı hep önce kapıyor,
      // 6.200 kr'lik Spitfire'a hiç para birikmiyordu (90 dakikada hiçbir bot yeni uçağa geçemedi)
      if (!r.slots.tech.current && r.slots.tech.queue.length === 0 && !r.waiting.vehicle) {
        const next = TECH_PRIORITY.find((id) => TECH_BY_ID[id] && r.slotOf(TECH_BY_ID[id]) === 'tech' && r.available(TECH_BY_ID[id]));
        if (next) r.enqueue(next);
      }
      if (!r.slots.defense.current) {
        // Sıradaki iş ya da para bekleyen iş. Savunma fonu yetiyorsa filo ve uçak araştırması beklerken de başlar: bir bot 1.750 kr'lik
        // 37 mm'yi 100 dakikadan fazla bekliyordu. Fon rezervden düşer, araştırma adımı ödemeyi kendisi yapar.
        const queued = r.slots.defense.queue[0];
        const next = queued ?? this.nextDefense(r);
        if (next) {
          const tm = world.teams[this.team];
          const cost = researchCost(TECH_BY_ID[next]);
          // Açık topa çevrilecek batarya varken fon araştırmaya gitmez: ucuz işler 8,8 cm'in ~5.700 kr'sini hiç biriktirmiyordu
          if (world.economyEnabled && this.defenseFund >= cost && tm.money >= tm.reserve && !this.gunsPending(world, r)) {
            this.defenseFund -= cost;
            tm.reserve = Math.max(0, tm.reserve - cost);
            if (!queued) r.enqueue(next);
          } else if (!queued && !r.waiting.vehicle) r.enqueue(next);
        }
      }
      if (!r.slots.vehicle.current && r.slots.vehicle.queue.length === 0) {
        // Hedefe yönelik: sıradaki uçak önkoşullarıyla birlikte sıraya girer (mühendislik hattı önce onları araştırır).
        // Yalnız açık olanlar seçilince uçak hattı çoğu zaman boş kalıyordu
        const next = VEHICLE_PRIORITY.find((id) => TECH_BY_ID[id] && !TECH_BY_ID[id].future && !r.done.has(id));
        if (next) r.enqueue(next);
      }
    }
    // Bütçe: önce asgari filo, sonra araştırma ve geri kalanı; gelirin bir payı sıradaki madene ayrılır. Eskiden
    // madenin bütün parası yedekte tutuluyordu: botlar oyunun çoğunu maden parası biriktirerek geçiriyor, araştırma
    // ve üretim duruyordu (90 dakikada hâlâ ilk uçaklar, filo 9'dan 5–7'ye inmiş)
    const tm = world.teams[this.team];
    const income = this.lastEarned < 0 ? 0 : Math.max(0, tm.earned - this.lastEarned);
    this.lastEarned = tm.earned;
    const fleet = this.fleet(world);
    this.need = this.opts.production ? this.nextNeed(world, fleet) : null;
    this.invest = this.opts.production && world.economyEnabled ? this.nextInvest(world) : null;
    tm.reserve = this.opts.production ? this.budget(world, income, fleet) : 0;
    // Son hava üssü yıkıldı: bütün para yenisine (kurulamazsa taraf elenir)
    if (this.opts.production && this.rebuildBase(world)) return;
    if (this.opts.production) {
      this.ensureHousing(world);
      this.produce(world, fleet);
      this.ensureInvest(world);
      this.autoRepair(world);
    }
    if (this.opts.production && this.ferryTimer <= 0) {
      this.ferryTimer = 300;
      this.rebalance(world);
    }
    if (this.opts.upgrades) this.upgradeDefenses(world);
    if (this.opts.production) this.ensureDefenses(world);
    if (this.opts.cap && this.capCooldown <= 0) this.maintainCap(world);
    if (this.opts.raids && this.raidTimer <= 0) {
      // Hazır saldırı uçağı yoksa kısa süre sonra yeniden dene (eskiden 7–12 dk erteleniyordu)
      // Ana üsse yüklenirken hazır uçak birikmeden yeniden kalkılır
      this.raidTimer = this.launchRaid(world) ? (this.stage === 'base' ? 180 + rand(0, 120) : 420 + rand(0, 300)) : 60 + rand(0, 30);
    }
  }

  /** Hava üssü kalmadıysa yenisini kur; üs yoksa true (o tur başka harcama yapılmaz). */
  private rebuildBase(world: World): boolean {
    if (world.structures.some((s) => s.team === this.team && s.kind === 'airbase' && !s.destroyed)) return false;
    const tm = world.teams[this.team];
    const cost = world.structureCost(this.team, 'airbase');
    tm.reserve = cost;
    if (!world.canAfford(this.team, cost)) return true;
    const anchors = world.structures.filter((s) => s.team === this.team && !s.destroyed);
    tm.reserve = 0;
    if (!this.placeAirbase(world, anchors, null, 2500, 14500)) tm.reserve = cost;
    return true;
  }

  /**
   * Hava üssü kur: pist uzun ve düz yer ister, her tur verilen yapıların çevresinde rastgele yer ve yön denenir.
   * dir verilirse o yönün ±60°'si.
   */
  private placeAirbase(world: World, anchors: Structure[], dir: number | null, rMin: number, rMax: number): boolean {
    for (let k = 0; k < 40 && anchors.length; k++) {
      const a = anchors[Math.floor(Math.random() * anchors.length)];
      const ang = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 2 * (Math.PI / 3);
      const r = rMin + Math.random() * (rMax - rMin);
      const x = a.pos.x + Math.cos(ang) * r;
      const z = a.pos.z + Math.sin(ang) * r;
      const h = Math.floor(Math.random() * 12) * (Math.PI / 12);
      if (!world.checkPlacement(this.team, 'airbase', x, z, h).ok) continue;
      if (world.placeStructure(this.team, 'airbase', x, z, h)) {
        world.log(L(`${world.teams[this.team].name} komuta: yeni hava üssü kuruluyor`, `${world.teams[this.team].name} command: building a new airbase`), this.team, 'build');
        return true;
      }
    }
    return false;
  }

  /** İstenen hava üssü sayısı: 45. dakikadan ikinci, 150. dakikadan üçüncü üs. */
  private basesWanted(world: World): number {
    return world.time >= 9000 ? 3 : world.time >= 2700 ? 2 : 1;
  }

  /**
   * Yatırım fonunun sıradaki hedefi: 2 maden, yeni hava üssü, kalan madenler, 90. dakikadan sonra fabrikası olmayan
   * üsse bağlı fabrika. Genişleme: botlar tek üsle kalıyor, üssü yıkılınca parası yoksa hemen eleniyor, baskın
   * yolları uzun kalıyordu.
   */
  private nextInvest(world: World): Invest | null {
    const own = world.structures.filter((s) => s.team === this.team && !s.destroyed);
    const mines = own.filter((s) => s.kind === 'mine');
    const bases = own.filter((s) => s.kind === 'airbase');
    const mineOk = mines.length < this.minesWanted(world, bases.length) && !mines.some((m) => m.build < 1);
    const mine: Invest = { kind: 'mine', cost: world.structureCost(this.team, 'mine') };
    if (mineOk && mines.length < 2) return mine;
    if (bases.length < this.basesWanted(world) && !bases.some((b) => b.build < 1)) {
      return { kind: 'airbase', cost: world.structureCost(this.team, 'airbase') };
    }
    if (mineOk) return mine;
    if (world.time >= 5400 && !own.some((s) => s.kind === 'factory' && s.build < 1)) {
      const bare = world.airbasesOf(this.team).find((b) => b.s.active && !own.some((s) => s.kind === 'factory' && s.attachedTo === b.s.id));
      if (bare) return { kind: 'factory', cost: world.structureCost(this.team, 'factory'), base: bare };
    }
    return null;
  }

  /** Hasarı %10'u geçen yapıları onar (onarım yavaş ve vurulunca bekler; bedeli adım adım ödenir). */
  private autoRepair(world: World): void {
    for (const s of world.structures) {
      if (s.team === this.team && !s.repairing && s.active && s.hp < s.maxHp * 0.9) world.setRepair(s, true);
    }
  }

  /** Asgari filo (zamanla büyür): avcı ve saldırı uçağı. */
  private minFleet(world: World): { fighters: number; strikers: number } {
    const t = world.time;
    return { fighters: Math.min(12, 6 + Math.floor(t / 1200)), strikers: Math.min(10, 2 + Math.floor(t / 720)) };
  }

  /** Hangarlardaki ve fabrika kuyruklarındaki uçaklar. */
  private fleet(world: World): Fleet {
    let fighters = 0;
    let strikers = 0;
    let room = 0;
    const count = (specId: string) => {
      if (SPECS[specId].role === 'fighter') fighters++;
      else strikers++;
    };
    for (const b of world.airbasesOf(this.team)) {
      if (b.s.active) room += b.freeSlots;
      for (const af of b.inventory) count(af.specId);
    }
    for (const s of world.structures) {
      if (s.team !== this.team || !s.factory || s.destroyed) continue;
      for (const q of s.factory.queue) count(q.specId);
      room -= s.factory.queue.length;
    }
    return { fighters, strikers, room };
  }

  /** İstenen ve var olan (inşaattakiler dahil) uçaksavar bataryası ve radar sayısı (zamanla artar). */
  private defenses(world: World): { aa: number; aaWant: number; radar: number; radarWant: number } {
    const t = world.time;
    let aa = 0;
    let radar = 0;
    for (const s of world.structures) {
      if (s.team !== this.team || s.destroyed) continue;
      if (s.kind === 'aa') aa++;
      else if (s.kind === 'radar') radar++;
    }
    // Radar ancak araştırılmışsa istenir (yoksa askeri fon onun parasını tutup her şeyi bekletiyordu); her yeni üsse iki
    // batarya daha
    const radarOk = world.teams[this.team].research.has(STRUCTURE_DEFS.radar.requires);
    const extra = 2 * Math.max(0, world.airbasesOf(this.team).filter((b) => b.s.active).length - 1);
    return { aa, aaWant: (t < 360 ? 0 : t < 1200 ? 1 : t < 2400 ? 2 : t < 4800 ? 3 : 4) + extra, radar, radarWant: t > 1500 && radarOk ? 1 : 0 };
  }

  /**
   * Askeri fonun sıradaki alımı, önem sırasıyla: dört avcı, ilk uçaksavar bataryası, iki saldırı uçağı, radar, kalan
   * bataryalar, kalan saldırı uçakları ve avcılar. Avcı eksiği hep önce gelince bazı botlar hiç pike uçağı üretmiyordu;
   * bataryalar ve radar araştırmanın arkasında kalınca 2 saatte tek batarya kuruluyor, radar hiç kurulmuyordu.
   */
  private nextNeed(world: World, fleet: Fleet): Need | null {
    const min = this.minFleet(world);
    const d = this.defenses(world);
    const plane = (role: Role): Need | null => {
      if (fleet.room <= 0) return null;
      const id = this.pickProduct(world, role);
      return id ? { kind: 'aircraft', specId: id, price: aircraftPrice(SPECS[id]) } : null;
    };
    const site = (kind: 'aa' | 'radar'): Need => ({ kind, price: world.structureCost(this.team, kind) });
    // Yakın zamanda bombardıman akını yedi: bombardıman uçağından önce avcı (filo büyümez, bileşim değişir)
    const raided = world.time - memoryOf(world, this.team).lastBomberRaid < RAID_ALERT_TIME;
    return (
      (fleet.fighters < Math.min(4, min.fighters) ? plane('fighter') : null) ??
      (raided && fleet.fighters < min.fighters ? plane('fighter') : null) ??
      (d.aa < Math.min(1, d.aaWant) ? site('aa') : null) ??
      (fleet.strikers < Math.min(2, min.strikers) ? plane('bomber') : null) ??
      (d.radar < d.radarWant ? site('radar') : null) ??
      (d.aa < d.aaWant ? site('aa') : null) ??
      (fleet.strikers < min.strikers ? plane('bomber') : null) ??
      (fleet.fighters < min.fighters ? plane('fighter') : null)
    );
  }

  /** Açık olan en iyi topa çevrilmeyi bekleyen batarya var mı. */
  private gunsPending(world: World, r: Research): boolean {
    return world.structures.some((s) => s.team === this.team && s.active && !!s.aa && s.aa.uniformGun !== botGun(s.id, r));
  }

  private nextDefense(r: Research): string | undefined {
    return DEFENSE_PRIORITY.find((id) => TECH_BY_ID[id] && r.available(TECH_BY_ID[id]));
  }

  /** Yedek (araştırma ve yükseltmelerin dokunmadığı para): maden fonu + filo fonu. */
  private budget(world: World, income: number, fleet: Fleet): number {
    if (!world.economyEnabled) return 0;
    const tm = world.teams[this.team];
    const inv = this.invest;
    const oneBase = world.airbasesOf(this.team).length < 2;
    this.investFund = inv ? Math.min(this.investFund + income * (oneBase ? INVEST_SHARE_ONE_BASE : INVEST_SHARE), inv.cost) : 0;
    const need = this.need;
    // Filo yarının altına indiyse acil: sıradaki uçağın bütün parası hemen ayrılır (10 uçak kaybeden bot filo fonuyla
    // saatlerce 2 uçakla kalıyordu)
    const critical = need?.kind === 'aircraft' && fleet.fighters + fleet.strikers < (this.minFleet(world).fighters + this.minFleet(world).strikers) / 2;
    this.forceFund = !need ? 0 : critical ? need.price : Math.min(this.forceFund + income * FORCE_SHARE, need.price);
    // Kasada olmayan para ayrılamaz (önce filo)
    this.forceFund = Math.min(this.forceFund, tm.money);
    // Savunma fonu filodan sonra, yatırımdan önce
    this.defenseFund = Math.max(0, Math.min(this.defenseFund + income * (oneBase ? DEFENSE_SHARE_ONE_BASE : DEFENSE_SHARE), DEFENSE_MAX, tm.money - this.forceFund));
    this.investFund = Math.max(0, Math.min(this.investFund, tm.money - this.forceFund - this.defenseFund));
    return this.investFund + this.forceFund + this.defenseFund;
  }

  /** Araştırma para bekliyor mu (yükseltmeler, ek bataryalar ve fazla uçak önce onu bekler). */
  private researchWaiting(world: World): boolean {
    const r = world.teams[this.team].research;
    return world.economyEnabled && (!!r.waiting.tech || !!r.waiting.vehicle);
  }

  private upgradeDefenses(world: World): void {
    // Araştırma önce: boştaki para bataryalara ve üs tesislerine gidiyor, uçak araştırmasına hiç birikmiyordu. Savunma fonu ayrıdır,
    // araştırma beklerken de yalnız kendi parasıyla top alabilir
    const waiting = this.researchWaiting(world);
    const research = world.teams[this.team].research;
    const nextDef = this.nextDefense(research);
    // Açık bir topa çevrilmeyi bekleyen batarya ya da sıradaki top araştırması varsa fon ona birikir: 8,8 cm araştırıldıktan sonra para seviye
    // ve aletlere gidiyor, iki topun ~5.700 kr'si hiç birikmiyordu
    const saveForGun = (!!nextDef && AA_WEAPON_ORDER.some((id) => AA_WEAPONS[id].requires === nextDef)) || this.gunsPending(world, research);
    for (const s of world.structures) {
      if (s.team !== this.team || !s.active) continue;
      if (!waiting && s.airbase && !s.airbase.job) {
        for (const k of ['revetments', 'workshop', 'hangars'] as const) {
          if (!s.airbase.upgrades.has(k) && this.spare(world) >= BASE_UPGRADE_COST[k] && world.startBaseUpgrade(s.airbase, k)) break;
        }
      }
      if (!s.aa || s.aa.job) continue;
      const free = waiting ? 0 : Math.max(0, this.spare(world));
      // Sıradaki araştırma yeni bir topsa fon ona birikir: açık topa çevirmek dışında harcanmaz
      const saving = saveForGun;
      const opts = s.aa.options(research).filter((o) => o.enabled && o.cost <= free + (saving && !o.key.startsWith('all:') ? 0 : this.defenseFund));
      // Tek tip batarya: her batarya kimliğine göre bir sınıfa bakar, açık olan en iyi topa çevrilir; parası yoksa bekler, karıştırmaz
      const want = botGun(s.id, research);
      // Önce top: 12,7 mm'lik bataryanın seviyesi ya da telemetresi yüksek uçağa bir şey yapmaz
      const pick =
        opts.find((o) => o.key === `all:${want}`) ??
        opts.find((o) => o.key === 'lvl') ??
        opts.find((o) => o.key.startsWith('sen:')) ??
        (s.aa.uniformGun === want ? opts.find((o) => o.key === `add:${want}`) : undefined);
      if (pick && world.startAAJob(s, pick.key)) this.defenseFund = Math.max(0, this.defenseFund - Math.max(0, pick.cost - free));
    }
  }

  /** İstenen maden sayısı (zamanla artar; her yeni üs bölgeyi genişletir, iki maden daha). */
  private minesWanted(world: World, bases: number): number {
    return Math.min(6 + 2 * Math.max(0, bases - 1), 2 + Math.floor(world.time / 1200));
  }

  /** Yedeğin üstündeki harcanabilir para (para kuralları kapalıysa sınırsız). */
  private spare(world: World): number {
    if (!world.economyEnabled) return Infinity;
    const t = world.teams[this.team];
    return t.money - t.reserve;
  }

  /** Yatırım: maden ocağı, yeni hava üssü ya da üsse bağlı fabrika (fon dolunca ya da kasa bolsa). */
  private ensureInvest(world: World): void {
    const inv = this.invest;
    if (!inv) return;
    // Üs fon dolar dolmaz kurulur (27.000 kr'nin üstüne 6.000 kr daha beklenince ikinci üs 3 saati buluyordu)
    const money = world.teams[this.team].money - this.forceFund;
    if (money < inv.cost || (this.investFund < inv.cost && money - inv.cost < (inv.kind === 'airbase' ? 0 : INVEST_SPARE))) return;
    const bases = world.airbasesOf(this.team).filter((b) => b.s.active);
    const main = bases[0];
    if (!main) return;
    let placed = false;
    if (inv.kind === 'mine') {
      // Damar verimi görünmez: yapay zekâ da rastgele yer dener, ama düşmana bakan yöne değil (madenler arkada kalsın)
      const base = bases[Math.floor(Math.random() * bases.length)];
      const a = this.awayAngle(world, base) + (Math.random() - 0.5) * 2 * 1.9;
      const r = 4000 + Math.random() * 14000;
      const spot = world.findSpot(this.team, 'mine', base.s.pos.x + Math.cos(a) * r, base.s.pos.z + Math.sin(a) * r, 0, 2400, this.homeSeed++);
      placed = !!spot && !!world.placeStructure(this.team, 'mine', spot.x, spot.z, 0);
    } else if (inv.kind === 'factory') placed = !!world.placeBaseFactory(inv.base);
    else {
      // Yeni üs hedef ülkeye doğru, ana üssün 20–35 km ötesine: baskın yolu kısalır, tek üse bağlı kalınmaz
      const foe = this.pickFoe(world);
      const fs = foe !== null ? world.structures.find((s) => s.team === foe && s.kind === 'airbase' && !s.destroyed) : undefined;
      const dir = fs ? Math.atan2(fs.pos.z - main.s.pos.z, fs.pos.x - main.s.pos.x) : null;
      placed = this.placeAirbase(world, [main.s], dir, 20000, 35000);
    }
    if (placed) this.investFund = Math.max(0, this.investFund - inv.cost);
  }

  /**
   * Uçakları üsler arasında dengele: en kalabalık üsten en boşuna, en çok hazır bekleyen tipten intikal kolu (yeni üs
   * boş kalmasın; ön üsten kalkan baskınların yolu kısa).
   */
  private rebalance(world: World): void {
    const bases = world.airbasesOf(this.team).filter((b) => b.usable);
    if (bases.length < 2) return;
    bases.sort((a, b) => b.inventory.length - a.inventory.length);
    const src = bases[0];
    const dst = bases[bases.length - 1];
    const gap = src.inventory.length - dst.inventory.length;
    if (gap < 4 || dst.freeSlots < 2) return;
    const ready = new Map<string, number>();
    for (const af of src.inventory) if (af.status === 'ready') ready.set(af.specId, (ready.get(af.specId) ?? 0) + 1);
    const pick = [...ready].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
    if (!pick) return;
    const spec = SPECS[pick[0]];
    const plan = defaultPlan('ferry', spec);
    plan.targetBaseId = dst.s.id;
    plan.altitude = dst.s.pos.y + Math.min(spec.cruiseAlt, 4000);
    const n = Math.min(pick[1], Math.floor(gap / 2), dst.freeSlots, 4);
    if (n >= 2 && world.launch(src, pick[0], n, plan).length) {
      world.log(L(`${world.teams[this.team].name} komuta: ${n} × ${spec.abbr} ${dst.s.name} üssüne intikal ediyor`, `${world.teams[this.team].name} command: ${n} × ${spec.abbr} transferring to ${dst.s.name}`), this.team, 'ops');
    }
  }

  /** Düşmandan uzağa bakan yön (en yakın düşman üssünün tersi; düşman yoksa rastgele). */
  private awayAngle(world: World, base: Airbase): number {
    let best: Structure | null = null;
    let bestD = Infinity;
    for (const s of world.structures) {
      if (s.team === this.team || s.kind !== 'airbase' || s.destroyed || world.teams[s.team]?.eliminated) continue;
      const d = Math.hypot(s.pos.x - base.s.pos.x, s.pos.z - base.s.pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best ? Math.atan2(base.s.pos.z - best.pos.z, base.s.pos.x - best.pos.x) : Math.random() * Math.PI * 2;
  }

  /** Uçaksavar ve radar askeri fondan (araştırma beklemiyorsa boştaki paradan da) kurulur. */
  private ensureDefenses(world: World): void {
    const need = this.need;
    if (!need || need.kind === 'aircraft') return;
    const tm = world.teams[this.team];
    const budget = !world.economyEnabled ? Infinity : this.researchWaiting(world) ? this.forceFund : tm.money - this.investFund;
    if (need.price > budget) return;
    const base = world.airbasesOf(this.team)[0];
    if (!base) return;
    let spot: { x: number; z: number } | null;
    if (need.kind === 'aa') spot = this.aaSpot(world, world.airbasesOf(this.team).filter((b) => b.s.active));
    else {
      // Radar üssün arkasına, 3–7 km
      const a = this.awayAngle(world, base);
      spot = world.findSpot(this.team, 'radar', base.s.pos.x + Math.cos(a) * 4500, base.s.pos.z + Math.sin(a) * 4500, 0, 3000, this.homeSeed++);
    }
    if (spot && world.placeStructure(this.team, need.kind, spot.x, spot.z, 0)) {
      this.forceFund = Math.max(0, this.forceFund - need.price);
      this.need = null;
    }
  }

  /**
   * Batarya yeri: korunacak noktalar önem sırasıyla her üssün pistinin açık yanı (tel örgünün dışı; 20 mm buradan bütün
   * pisti kapsar) ve hangar/fabrika yanı, en verimli madenler, radar ve pistlerin uçları; henüz bir bataryanın 1,5 km
   * yakınında olmayan ilk noktanın dibi. Eskiden ilk batarya üssün merkezinden 2,1 km uzağa (evlerin yanına)
   * kuruluyor, pisti korumuyordu.
   */
  private aaSpot(world: World, bases: Airbase[]): { x: number; z: number } | null {
    const own = world.structures.filter((s) => s.team === this.team && !s.destroyed);
    const aa = own.filter((s) => s.kind === 'aa');
    const mines = own.filter((s) => s.kind === 'mine' && s.build >= 1).sort((a, b) => world.mineOutput(b) - world.mineOutput(a));
    const want = [
      ...bases.flatMap((b) => [b.runwayPoint(500, -450), b.runwayPoint(-900, 850)]),
      ...mines.slice(0, 2).map((s) => s.pos),
      ...own.filter((s) => s.kind === 'radar').map((s) => s.pos),
      ...bases.flatMap((b) => [b.runwayPoint(-1300, -450), b.runwayPoint(1300, 850)]),
      ...mines.slice(2).map((s) => s.pos),
    ];
    for (const p of want) {
      if (aa.some((a) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < 1500)) continue;
      const spot = world.findSpot(this.team, 'aa', p.x, p.z, 0, 700, this.homeSeed++);
      if (spot) return spot;
    }
    return null;
  }

  /** Personel kuralları açıkken uçakların mürettebatına yetecek kadar konut kur. */
  private ensureHousing(world: World): void {
    if (!world.personnelEnabled) return;
    const p = world.teams[this.team].personnel;
    let need = 0;
    for (const b of world.airbasesOf(this.team)) for (const af of b.inventory) need += SPECS[af.specId].crew;
    const pending = world.structures
      .filter((s) => s.team === this.team && s.build < 1 && !s.destroyed && s.def.category === 'city')
      .reduce((a, s) => a + (s.def.population ?? 0), 0);
    const target = Math.min(need + 4, 140);
    if (p.capacity + pending >= target) return;
    const base = world.airbasesOf(this.team)[0];
    if (!base) return;
    const kind = target - p.capacity - pending >= 16 ? 'apartment' : 'house';
    const spot = world.findSpot(this.team, kind, base.s.pos.x, base.s.pos.z, 2300, 6500, this.homeSeed++);
    if (spot) world.placeStructure(this.team, kind, spot.x, spot.z, 0);
  }

  /** Bu rolde üretilecek tip (avcı dışında pike, taarruz ya da bombardıman uçağı). */
  private pickProduct(world: World, role: Role): string | null {
    const tm = world.teams[this.team];
    const seed = Math.floor(world.time / 600) * 7 + this.team;
    if (role === 'fighter') {
      const l = bestUnlocked(tm.research, 'fighter');
      return l.length ? l[seed % 3 === 2 ? l.length - 1 : 0].id : null;
    }
    // Ağır bombardıman ancak kasa bolsa: He 111 bir Ju 87'nin 2,5 katı, asgari filo onu beklerken araştırma duruyordu
    const rich = !world.economyEnabled || tm.money > 30000;
    const l = [...bestUnlocked(tm.research, 'diveBomber', 1), ...bestUnlocked(tm.research, 'attacker', 1), ...(rich ? bestUnlocked(tm.research, 'bomber', 1) : [])];
    if (!l.length) l.push(...bestUnlocked(tm.research, 'bomber', 1));
    return l.length ? l[seed % l.length].id : null;
  }

  private produce(world: World, fleet: Fleet): void {
    const tm = world.teams[this.team];
    let { fighters, strikers, room } = fleet;
    for (const s of world.structures) {
      if (room <= 0) break;
      if (s.team !== this.team || !s.factory || !s.active || s.factory.queue.length >= 2) continue;
      const need = this.need?.kind === 'aircraft' ? this.need : null;
      const id = need ? need.specId : this.pickProduct(world, fighters < strikers * 1.5 + 4 ? 'fighter' : 'bomber');
      if (!id) continue;
      // Araştırma para bekliyorsa asgari filo yalnız askeri fondan alır; fazla uçak ancak askeri ihtiyaç yoksa ve araştırma
      // beklemiyorsa (kayıplar yüzünden filo hep eksik kalıyor, üretim boştaki bütün parayı yiyip araştırmayı durduruyordu)
      const waiting = this.researchWaiting(world);
      const budget = !world.economyEnabled ? Infinity : need ? (waiting ? this.forceFund : tm.money - this.investFund) : waiting || this.need ? -1 : this.spare(world);
      const price = aircraftPrice(SPECS[id]);
      if (price > budget || !world.orderAircraft(s, id)) continue;
      if (need) {
        this.forceFund = Math.max(0, this.forceFund - price);
        this.need = null;
      }
      if (SPECS[id].role === 'fighter') fighters++;
      else strikers++;
      room--;
    }
  }

  private maintainCap(world: World): void {
    const hasCap = world.flights.some(
      (f) => f.team === this.team && f.plan.type === 'cap' && f.phase !== 'done' && f.phase !== 'landing' && f.phase !== 'rtb',
    );
    if (hasCap) return;
    const factory = world.structures.find((s) => s.team === this.team && s.kind === 'factory' && !s.destroyed);
    if (!factory) return;
    const pick = this.pickFighters(world, 4);
    if (!pick || pick.count < 2) return;
    const spec = SPECS[pick.specId];
    const plan = defaultPlan('cap', spec);
    plan.targetPos = factory.pos.clone();
    plan.patrolRadius = 5000;
    plan.stationTime = 600;
    plan.altitude = factory.pos.y + Math.min(spec.cruiseAlt, 5000);
    world.launch(pick.base, pick.specId, 2, plan);
    this.capCooldown = 90;
  }

  private pickFighters(world: World, want: number): { base: Airbase; specId: string; count: number } | null {
    let best: { base: Airbase; specId: string; count: number } | null = null;
    for (const b of world.airbasesOf(this.team)) {
      if (!b.usable) continue;
      for (const id of readyFighters(b)) {
        const n = b.readyOf(id).length;
        if (n >= 2 && (!best || n > best.count)) best = { base: b, specId: id, count: Math.min(n, want) };
      }
    }
    return best;
  }

  /** Ağırlıklı rastgele seçim. */
  private static pick<T>(items: T[], weights: number[]): T | null {
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1] ?? null;
  }

  /** Hedef alınan ülke (yoksa null). */
  get target(): number | null {
    return this.foe;
  }

  /** Hedef ülke: yakın ve az savunmalı düşman; elenene kadar değişmez. */
  private pickFoe(world: World): number | null {
    const live = (t: number) => !world.teams[t]?.eliminated && world.structures.some((s) => s.team === t && !s.destroyed);
    if (this.foe !== null && live(this.foe)) return this.foe;
    const home = world.airbasesOf(this.team)[0]?.s.pos;
    if (!home) return null;
    let best: number | null = null;
    let bestScore = Infinity;
    for (const t of world.teams) {
      if (t.id === this.team || !live(t.id)) continue;
      const own = world.structures.filter((s) => s.team === t.id && !s.destroyed);
      const anchor = own.find((s) => s.kind === 'airbase') ?? own[0];
      const aa = own.filter((s) => s.kind === 'aa').length;
      // Başka botların hedefindeki taraf daha az seçilir (herkes oyuncuya ya da aynı ülkeye yüklenmesin)
      const hunted = world.commanders.filter((c) => c !== this && c.target === t.id).length;
      const score = Math.hypot(anchor.pos.x - home.x, anchor.pos.z - home.z) * (1 + 0.15 * aa) * (1 + 0.6 * hunted) * (0.8 + 0.4 * Math.random());
      if (score < bestScore) {
        bestScore = score;
        best = t.id;
      }
    }
    this.foe = best;
    this.stage = 'outer';
    this.stageRaids = 0;
    this.stageStart = world.time;
    this.focusId = null;
    return best;
  }

  /**
   * Baskın hedefi: hedef ülkenin önce çevresi (üssü koruyan bataryalar, radar, fabrika, madenler; yıpranmış olan önce),
   * en çok OUTER_RAIDS baskın ya da OUTER_TIME sonra ana üssü, yıkılana kadar. Yarım kalan hedefe dönülür. Eskiden her
   * baskın rastgele başka bir yapıya gidiyordu: 3 saatte tek yapı yıkılmıyor, kimse elenmiyordu.
   */
  private raidTarget(world: World): Structure | null {
    const foe = this.pickFoe(world);
    if (foe === null) return null;
    const own = world.structures.filter((s) => s.team === foe && !s.destroyed);
    const bases = own.filter((s) => s.kind === 'airbase');
    if (this.stage === 'outer' && bases.length && (this.stageRaids >= OUTER_RAIDS || world.time - this.stageStart > OUTER_TIME)) {
      this.stage = 'base';
      this.stageRaids = 0;
      this.stageStart = world.time;
      world.log(L(`${world.teams[this.team].name} komuta: ${world.teams[foe].name} ana üssüne yükleniyor`, `${world.teams[this.team].name} command: pressing the ${world.teams[foe].name} main base`), this.team, 'info');
    }
    const focus = this.focusId !== null ? world.structureById(this.focusId) : undefined;
    const home = world.airbasesOf(this.team)[0]?.s.pos;
    if (this.stage === 'base' && bases.length) {
      if (focus && !focus.destroyed && focus.kind === 'airbase' && focus.team === foe) return focus;
      if (!home) return bases[0];
      return bases.reduce((a, b) => (Math.hypot(a.pos.x - home.x, a.pos.z - home.z) <= Math.hypot(b.pos.x - home.x, b.pos.z - home.z) ? a : b));
    }
    const outer = own.filter((s) => s.kind !== 'airbase' && s.build >= 1);
    if (!outer.length) return bases[0] ?? null;
    // Yarım kalan çevre hedefi çoğu zaman bitirilir
    if (focus && !focus.destroyed && focus.team === foe && focus.kind !== 'airbase' && focus.hp < focus.maxHp * 0.85 && Math.random() < 0.6) return focus;
    const anchor = bases[0];
    const weights = outer.map((s) => {
      const guard = s.kind === 'aa' && !!anchor && Math.hypot(s.pos.x - anchor.pos.x, s.pos.z - anchor.pos.z) < 4000;
      const w = guard ? 4 : s.kind === 'radar' || s.kind === 'factory' ? 3 : s.kind === 'mine' ? 2 : s.def.category === 'city' ? 0.3 : 1.5;
      return w * (1 + 2 * (1 - s.hp / s.maxHp));
    });
    return Commander.pick(outer, weights);
  }

  /** Baskın emri ver; hazır saldırı uçağı yoksa false. */
  private launchRaid(world: World): boolean {
    let target = this.raidTarget(world);
    if (!target) {
      const targets = world.structures.filter((s) => s.team !== this.team && !s.destroyed && s.build >= 1 && !world.teams[s.team]?.eliminated);
      // Yakındaki düşmanlar öncelikli (çok taraflı oyunda haritanın öbür ucuna gidilmesin: 190 km ötedeki fabrikaya giden
      // Ju 87 kolu tek yönde 50 dk uçuyor, eskortun yakıtı dönüşe zor yetiyordu)
      const home = world.airbasesOf(this.team)[0]?.s.pos;
      const near = (s: Structure) => (home ? 1 / (1 + (Math.hypot(s.pos.x - home.x, s.pos.z - home.z) / 45000) ** 4) : 1);
      target = Commander.pick(targets, targets.map((s) => near(s) * (s.kind === 'factory' ? 4 : s.kind === 'airbase' ? 3 : s.kind === 'radar' ? 2.5 : s.kind === 'mine' ? 2 : s.def.category === 'city' ? 0.3 : 1.5)));
    }
    if (!target) return false;
    const tgt = target;
    const big = this.stage === 'base' && tgt.kind === 'airbase';
    // Hedefe en yakın kullanılabilir üs
    const bases = world.airbasesOf(this.team).filter((b) => b.usable)
      .sort((a, b) => Math.hypot(a.s.pos.x - tgt.pos.x, a.s.pos.z - tgt.pos.z) - Math.hypot(b.s.pos.x - tgt.pos.x, b.s.pos.z - tgt.pos.z));
    for (const b of bases) {
      const ready = [...new Set(b.inventory.filter((a) => a.status === 'ready').map((a) => a.specId))];
      const options: [string, MissionPlan['type'], number][] = [];
      for (const id of ready) {
        const sp = SPECS[id];
        if (sp.role === 'bomber') options.push([id, 'levelBomb', 6]);
        else if (sp.role === 'diveBomber') options.push([id, 'diveBomb', 4]);
        else if (sp.role === 'attacker') options.push([id, 'attack', 4]);
      }
      options.sort((x, y) => SPECS[y[0]].year - SPECS[x[0]].year);
      for (const [id, type, max] of options) {
        const n = b.readyOf(id).length;
        if (n < 2) continue;
        const spec: AircraftSpec = SPECS[id];
        const plan = defaultPlan(type, spec);
        plan.targetStructureId = tgt.id;
        plan.altitude = type === 'attack' ? 1200 : Math.min(spec.cruiseAlt, 6000) + tgt.pos.y;
        const escortId = readyFighters(b).find((f) => b.readyOf(f).length >= 2);
        // Görev dağılımı: dörtlü eskortun bir çifti yakın eskort, öbürü serbest avcı; korunan hedefe taarruz ve pikede
        // uçakların üçte biri önce hedefin çevresindeki uçaksavarı bastırır
        const ec = escortId ? Math.min(b.readyOf(escortId).length, 4) : 0;
        const escort = escortId ? { specId: escortId, count: ec, split: ec >= 4 ? 2 : 0 } : undefined;
        // Ana üsse yüklenirken kol büyür ve aynı görevi yapabilen bütün hazır tipler tek pakette kalkar (3.000 canlı üs
        // 2–4 Ju 87'yle saatlerce dayanıyordu)
        const count = Math.min(n, big ? Math.round(max * 1.5) : max);
        const flak = (type === 'attack' || type === 'diveBomb') && count >= 3 && tgt.kind !== 'aa' && flakTarget(world, this.team, tgt.pos);
        const groups: LaunchGroup[] = [{ specId: id, count, loadoutId: plan.loadoutId, belt: plan.belt, split: flak ? Math.round(count / 3) : 0 }];
        if (big) {
          for (const [oid, otype, omax] of options) {
            const on = b.readyOf(oid).length;
            if (oid === id || otype !== type || on < 1) continue;
            const op = defaultPlan(otype, SPECS[oid]);
            groups.push({ specId: oid, count: Math.min(on, omax), loadoutId: op.loadoutId, belt: op.belt, split: 0 });
          }
        }
        world.launchPackage(b, plan, groups, escort ? [{ specId: escort.specId, count: escort.count, split: escort.split }] : []);
        world.log(L(`${world.teams[this.team].name} komuta: ${tgt.name} hedefine baskın emri`, `${world.teams[this.team].name} command: raid ordered on ${tgt.name}`), this.team, 'info');
        if (tgt.team === this.foe) {
          this.focusId = tgt.id;
          this.stageRaids++;
        }
        return true;
      }
    }
    return false;
  }
}

/** Botun bir akına verdiği tepki: bir kez karar verilir, akın bitene kadar geçerli. */
interface RaidResponse {
  /** Havaya kaldırılmak istenen avcı. */
  want: number;
  /** Bundan önce kalkış yok: hazırlık süresi. */
  readyAt: number;
  seen: number;
}

/** Takım başına: akınlara tepkiler ve son büyük bombardıman akınının zamanı. Kayda girmez: yüklemede yeniden karar verilir. */
const raidMemory = new WeakMap<object, { responses: Map<number, RaidResponse>; lastBomberRaid: number }>();

function memoryOf(world: World, team: number): { responses: Map<number, RaidResponse>; lastBomberRaid: number } {
  const key = world.teams[team];
  let m = raidMemory.get(key);
  if (!m) {
    m = { responses: new Map(), lastBomberRaid: -1e9 };
    raidMemory.set(key, m);
  }
  return m;
}

/** Yeni büyük akından sonra bu süre botun avcı üretimi öne geçer ve hazırlığı yüksektir (sn). */
const RAID_ALERT_TIME = 900;

/**
 * Tepki kararı. Bombardıman akınına akının büyüklüğünün rastgele bir oranı, avcı süpürmesine daha azı. Hep aynı sayı kalkmasın diye her akında
 * yeniden çekilir. Hazırlıksız yakalanma: radarı yoksa daha sık, yer kontrolü varsa ya da yakın zamanda baskın yediyse daha seyrek; o zaman
 * geç ve az kalkar. Alçak akın geç görülür ve avcılar yüksekte düzenlenir: daha sık hazırlıksız yakalar, ona daha az avcı ayrılır. Hile yok: yalnız
 * hangardaki hazır avcılar, sınırı RESERVE_SHARE.
 */
function raidResponse(world: World, team: number, key: number, size: number, bomberRaid: boolean, low: boolean): RaidResponse {
  const mem = memoryOf(world, team);
  const known = mem.responses.get(key);
  if (known) {
    known.seen = world.time;
    return known;
  }
  const research = world.teams[team].research;
  const radar = world.structures.some((s) => s.team === team && s.active && !!s.radar);
  const alerted = world.time - mem.lastBomberRaid < RAID_ALERT_TIME;
  let surprise = 0.25;
  if (!radar) surprise += 0.1;
  if (research.has('gci')) surprise -= 0.1;
  if (alerted) surprise -= 0.15;
  if (low) surprise += 0.2;
  const caught = Math.random() < surprise;
  const ratio = (bomberRaid ? rand(0.35, 0.8) : rand(0.25, 0.6)) * (low ? 0.6 : 1);
  let want = Math.round(size * ratio);
  if (caught) want = Math.ceil(want * 0.5);
  const r: RaidResponse = {
    want: Math.max(2, Math.min(want, bomberRaid ? 8 : 4)),
    readyAt: world.time + (caught ? rand(120, 300) : rand(0, 45)),
    seen: world.time,
  };
  mem.responses.set(key, r);
  if (bomberRaid && size >= 3) mem.lastBomberRaid = world.time;
  // Bitmiş akınların kaydı birikmesin
  for (const [k, v] of mem.responses) if (world.time - v.seen > 1800) mem.responses.delete(k);
  return r;
}

const BOT_LEASH = 25000;

/** Hazır avcıların en çok bu kadarı kalkar; kalanı üsse yeni gelecek akın için. Tehdit üssün dibindeyse sınır yok. */
const RESERVE_SHARE = 0.6;

/** Önleme tipi: o irtifaya çıkabilenler arasından, çabuk tırmananı öne alan rastgele seçim (hep en yeni uçak kalkmasın). */
function pickInterceptor(b: Airbase, ids: string[], alt: number, needPair: boolean): string | null {
  const paired = needPair ? ids.filter((id) => b.readyOf(id).length >= 2) : ids;
  if (!paired.length) return null;
  const able = paired.filter((id) => SPECS[id].ceiling > alt + 200);
  const pool = able.length ? able : paired;
  if (!pool.length) return null;
  const weight = (id: string) => 1 / Math.max(timeToAltitude(SPECS[id], b.s.pos.y, alt), 60);
  let sum = 0;
  for (const id of pool) sum += weight(id);
  let roll = Math.random() * sum;
  for (const id of pool) {
    roll -= weight(id);
    if (roll <= 0) return id;
  }
  return pool[0];
}

/** Alarm kolu: radar ya da gözcüler düşman uçağı bildirince en yakın üsten önleyici kaldırır. */
export function alertScramble(world: World, team: number, alwaysOn: boolean, dt: number): void {
  const intel = world.teams[team].intel;
  for (const b of world.airbasesOf(team)) {
    if (!b.usable || (!alwaysOn && !b.alert.enabled)) continue;
    b.alert.cooldown -= dt;
    if (b.alert.cooldown > 0) continue;
    const fighters = readyFighters(b);
    const prefer = alwaysOn ? fighters : [b.alert.specId, ...fighters];
    const specId = prefer.find((id) => b.readyOf(id).length > 0);
    if (!specId) continue;
    const spec = SPECS[specId];
    let threat: number | null = null;
    let threatNear = Infinity;
    let threatWant = 0;
    let wantLeft = 0;
    let bestD = b.alert.radius;
    for (const c of intel.contacts.values()) {
      if (world.time - c.lastSeen > 8) continue;
      const enemy = world.aircraftById(c.id);
      if (!enemy || !enemy.airborne) continue;
      // Bu temasın paketine (yoksa koluna) yetecek kadar önleyici kalktı mı? Paketin eskortları ayrı ayrı önlenmez:
      // tek tek kalkan çiftler eskort avcılarını üslerine kadar kovalıyordu
      const group = enemy.flight ? world.flights.filter((f) => f === enemy.flight || (!!enemy.flight!.packageId && f.packageId === enemy.flight!.packageId)) : [];
      const size = Math.max(1, group.reduce((a, f) => a + f.alive.length, 0));
      let committed = 0;
      for (const f of world.flights) {
        if (f.team !== team || f.plan.type !== 'intercept' || f.phase === 'done' || f.phase === 'landing' || f.phase === 'rtb' || f.plan.targetAircraftId === null) continue;
        const tf = f.plan.targetAircraftId === c.id ? enemy.flight : world.aircraftById(f.plan.targetAircraftId)?.flight;
        if (f.plan.targetAircraftId === c.id || (tf && group.includes(tf))) committed += f.alive.length + world.pendingTakeoffs(f);
      }
      const isBomber = group.length ? group.some((f) => f.alive.some((m) => m.spec.role !== 'fighter')) : enemy.spec.role !== 'fighter';
      const response = alwaysOn ? raidResponse(world, team, enemy.flight?.packageId ? -enemy.flight.packageId : enemy.flight?.id ?? c.id, size, isBomber, enemy.pos.y - groundLevel(enemy.pos.x, enemy.pos.z) < 800) : null;
      if (response && world.time < response.readyAt) continue;
      if (committed >= (response ? response.want : Math.min(size, 6))) continue;
      threatWant = response ? response.want - committed : 0;
      let near = Infinity;
      let nx = 0;
      let nz = 0;
      for (const s of world.structures) {
        if (s.team !== team) continue;
        const dd = Math.hypot(s.pos.x - c.pos.x, s.pos.z - c.pos.z);
        if (dd < near) {
          near = dd;
          nx = s.pos.x;
          nz = s.pos.z;
        }
      }
      let d = near;
      if (enemy.spec.role === 'fighter') d += 6000;
      else {
        // Bombardıman kolu: önleyici onun irtifasına çıkana kadar kolun yaklaşacağı mesafe kadar erken kalk (yüksekten
        // gelen kolu yakından fark eden savunma ancak bombalamadan sonra yetişiyordu)
        const close = Math.max(0, (c.vel.x * (nx - c.pos.x) + c.vel.z * (nz - c.pos.z)) / Math.max(near, 1));
        d -= 8000 + close * Math.min(timeToAltitude(spec, b.s.pos.y, c.pos.y), 600);
      }
      if (d < bestD) {
        bestD = d;
        threat = c.id;
        threatNear = near;
        wantLeft = threatWant;
      }
    }
    if (threat === null) continue;
    const target = world.aircraftById(threat)!;
    let launchId = specId;
    let count = Math.min(b.readyOf(specId).length, b.alert.count);
    if (alwaysOn) {
      // Avcı çift uçar: tek uçak ancak tehdit yapılarımızın dibindeyken kalkar
      const picked = pickInterceptor(b, fighters.filter((id) => b.readyOf(id).length > 0), target.pos.y, threatNear > 15000);
      if (!picked) continue;
      launchId = picked;
      const inAir = world.flights.reduce((a, f) => (f.team === team && f.plan.type === 'intercept' && f.phase !== 'done' && f.phase !== 'landing' && f.phase !== 'rtb' ? a + f.alive.length + world.pendingTakeoffs(f) : a), 0);
      const hangar = world.airbasesOf(team).reduce((a, x) => a + (x.usable ? readyFighters(x).reduce((n, id) => n + x.readyOf(id).length, 0) : 0), 0);
      // Tehdit yapıların dibindeyse yedek de kalkar
      const limit = threatNear < 15000 ? hangar : Math.ceil((hangar + inAir) * RESERVE_SHARE) - inAir;
      // Bir kerede en çok dörtlü: büyük tepki birkaç dalgaya ve tipe bölünür
      count = Math.min(b.readyOf(launchId).length, Math.max(wantLeft, 2), limit, 4);
      if (count < 1 || (count < 2 && threatNear > 15000)) continue;
    }
    const launchSpec = SPECS[launchId];
    const plan = defaultPlan('intercept', launchSpec);
    plan.targetAircraftId = threat;
    plan.formation = 'finger4';
    plan.fuelFrac = 0.8;
    plan.speed = 'max';
    plan.altitude = Math.min(launchSpec.cruiseAlt, 6000);
    const fl = world.launch(b, launchId, count, plan);
    // Savunma kalkışı: hedef savunma bölgesinden çıkınca bırakılır
    // Bot kolu kendi yapılarından BOT_LEASH'ten uzağa kovalamaz: dönen taarruz uçaklarının kaybının çoğu 10 km'den uzakta, avcıdandı
    for (const f of fl) f.leash = alwaysOn ? BOT_LEASH : b.alert.radius + 15000;
    if (fl.length) world.log(L(`${b.s.name}: alarm! ${count} × ${launchSpec.abbr} önlemeye kalkıyor (${target.callsign})`, `${b.s.name}: scramble! ${count} × ${launchSpec.abbr} taking off to intercept (${target.callsign})`), team, 'defense');
    b.alert.cooldown = alwaysOn ? rand(20, 60) : 40;
  }
}
