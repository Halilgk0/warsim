import { Euler, Quaternion, Vector3 } from 'three';
import type { AircraftSpec, BombDef, GunSpec, Loadout, RocketDef, TurretSpec } from './specs';
import type { ThrustState } from './aero';
import { Brain } from '../ai/brain';
import type { FlightGroup } from '../ai/flightGroup';
import type { Airframe } from '../structures/airbase';
import { BASE_MODS, type ModEffects } from '../mods';
import { newDamage, type DamageState } from './damage';
import { BELTS, type BeltDef, type BeltId } from './ammo';
import { STORES, type StoreDef } from './stores';
import { DEG, clamp } from '../../core/math';

export type AircraftStatus = 'flying' | 'falling' | 'dead' | 'recovered';

/** Düşüş biçimi: vurulan uçak nasıl yere iner. */
export type FallMode = 'spin' | 'dive' | 'glide' | 'roll';

/** Pilotun (veya otopilotun) uçuş modeline verdiği komutlar. */
export interface Controls {
  /** İleri eksen etrafında istenen yuvarlanma hızı (rad/s). */
  rollRate: number;
  /** İstenen yük faktörü (G). Negatif = itme. */
  nCmd: number;
  throttle: number;
  diveBrake: boolean;
  /** Yan kayış: inişte fazla hızı atmak için (sürüklemeyi artırır). */
  sideslip: boolean;
  /** Yerde tekerlek freni. */
  brake: boolean;
  /** İniş konfigürasyonu: flap + iniş takımı (sürükleme artar, tutunma hızı düşer). */
  flaps: boolean;
  /** Acil güç isteği (araştırılmışsa ve süre kaldıysa devreye girer). */
  wep: boolean;
  afterburner: boolean;
}

export interface TurretState {
  spec: TurretSpec;
  gun: GunSpec;
  ammo: number;
  cooldown: number;
  targetId: number | null;
  retarget: number;
  /** Nişancının takip hatası. */
  noise: Vector3;
  noiseGoal: Vector3;
  noiseTime: number;
  /** Şimdiki hedefi kesintisiz izleme süresi (sn): yeni hedefe nişan oturana kadar atışlar dağınık. */
  track: number;
  /** Render için namlu yönü (dünya). */
  aim: Vector3;
  firing: boolean;
}

/** Bir askıdaki kalan yük (çift askıda iki tarafın toplamı). */
export interface StoreSlot {
  hp: string;
  store: StoreDef;
  /** Kalan adet. */
  n: number;
  /** Kalkıştaki adet. */
  n0: number;
  /** Bomba bölmesinde (sürükleme yok). */
  internal: boolean;
}

export interface Stores {
  loadout: Loadout;
  slots: StoreSlot[];
}

export interface AircraftOptions {
  loadoutId?: string;
  /** Serbest yük düzeni (hazır yük yerine). */
  loadout?: Loadout;
  fuelFrac?: number;
  skill?: number;
  mods?: ModEffects;
  belt?: BeltId;
}

let nextId = 1;

/** Video kaydı: aynı dünya yeniden kurulunca kimlikler de aynı olsun (yalnız dünya yokken çağrılır). */
export function resetAircraftIds(): void {
  nextId = 1;
}

/** Yük seçeneğine ve araştırmaya göre uçağın gerçek silah grupları. */
function effectiveGuns(spec: AircraftSpec, lo: Loadout, mods: ModEffects): GunSpec[] {
  const base = lo.replaceGuns ?? spec.guns;
  return [...base, ...(lo.extraGuns ?? [])].map((g) => ({
    ...g,
    damage: g.damage * (g.caliber === 'cannon' ? mods.cannonMul : 1),
    range: g.range * mods.fireRangeMul,
    ammo: Math.round(g.ammo * (g.caliber === 'cannon' ? mods.cannonAmmoMul : mods.mgAmmoMul)),
  }));
}

/**
 * Uçak durumu. Model ekseni: burun +Z, üst +Y.
 * Hız vektörü her zaman burun yönündedir (hücum açısı/kayma modellenmez). Hız gerçek hava hızıdır (m/s).
 */
export class Aircraft {
  readonly id = nextId++;
  readonly pos = new Vector3();
  readonly quat = new Quaternion();
  readonly fwd = new Vector3(0, 0, 1);
  readonly upv = new Vector3(0, 1, 0);
  /** Önceki simülasyon adımındaki konum/yönelim (render ara değerlemesi için). */
  readonly prevPos = new Vector3();
  readonly prevQuat = new Quaternion();
  prevValid = false;
  speed: number;
  /** Anlık yük faktörü (G). */
  n = 1;
  rollRate = 0;
  readonly controls: Controls = {
    rollRate: 0, nCmd: 1, throttle: 0.8, diveBrake: false, sideslip: false, brake: false, flaps: false, wep: false, afterburner: false,
  };
  readonly engine: ThrustState = { throttle: 0.8, spool: 0.8, wep: false, afterburner: false };
  /** Şamandıralı karbüratörde eksi G sonrası motorun sustuğu kalan süre (s). */
  carbCut = 0;
  /** Pilotun önceki adımdaki yön hatası (rad; −1 = yok): nişan takibinde sönümleme için. */
  pilotTheta = -1;
  /** Kullanılan acil güç süresi (s). */
  wepTime = 0;
  readonly mods: ModEffects;
  hp: number;
  readonly hpMax: number;
  readonly armor: number;
  status: AircraftStatus = 'flying';
  fallMode: FallMode = 'spin';
  /** Mürettebat paraşütle atladı mı. */
  bailed = false;
  onGround = false;
  /** Yerdeyken pist yönü (radyan, pusula). */
  groundHeading = 0;
  /** İç tank yakıtı (kg). */
  fuel: number;
  readonly fuelCap: number;
  /** Atılabilir tanktaki yakıt (kg, önce bu harcanır). */
  tankFuel = 0;
  readonly guns: GunSpec[];
  readonly gunAmmo: number[];
  readonly gunCooldown: number[];
  readonly stores: Stores;
  /** Sabit silahların mermi kuşağı. */
  readonly belt: BeltDef;
  readonly turrets: TurretState[];
  readonly damage: DamageState;
  firing = false;
  kills = 0;
  /** Pilot becerisi (0.6 acemi … 1.5 as). */
  skill: number;
  /** Pilot yorgunluğu (uzun süre yüksek G): 0 dinç … 1 bitkin. Çekebileceği G'yi düşürür. */
  fatigue = 0;
  /** Çekilen G'nin tutunma sınırına oranı (1 = tutunma eşiği). */
  stallRatio = 0;
  /** > 0: tutunma kaybı / vrille, kalan süre (s). */
  departure = 0;
  departSpin = 0;
  /** Son vrilleye giriş zamanı. */
  lastDepart = -1e9;
  /** Düşerken dönme hızı. */
  spin = 1;
  /** Bu adımda yer çarpışmasından kaçınma devrede mi. */
  groundAvoid = false;
  /** Son isabet alınan zaman (savunma tepkisi için). */
  lastHitTime = -1e9;
  lastHitFrom: number | null = null;
  /** Son vuran taraf (uçaksavar dahil; çok taraflı oyunda düşürmeyi kime yazacağımız). */
  lastHitTeam = -1;
  /** Yakına son flak patlaması (zikzak için). */
  flakTime = -1e9;
  /** Hafif uçaksavarın izli mermileriyle son ateş altında kalma (kaçamak için). */
  aaFireTime = -1e9;
  airframe: Airframe | null = null;
  flight: FlightGroup | null = null;
  /** Kol içindeki sıra (0 = lider). */
  slot = 0;
  homeBaseId = -1;
  /** Personel havuzundan uçan kişi sayısı (personel kuralları açıksa). */
  crew = 0;
  crewReleased = false;
  /** Uçak kaybedildiğinde düşülen kişi sayısı (kurtulanlar geri eklenir). */
  crewLost = 0;
  readonly brain = new Brain();

  constructor(
    readonly spec: AircraftSpec,
    readonly team: number,
    public callsign: string,
    opts: AircraftOptions = {},
  ) {
    const mods = opts.mods ?? BASE_MODS;
    this.mods = mods;
    this.hpMax = spec.hp * mods.hpMul;
    this.hp = this.hpMax;
    this.armor = clamp(spec.armor + (spec.role === 'attacker' ? mods.attackerArmorAdd : 0), 0, 0.9);
    this.speed = spec.cruiseSpeed;
    this.fuelCap = spec.fuelKg * mods.fuelMul;
    this.fuel = this.fuelCap * clamp(opts.fuelFrac ?? 1, 0.2, 1);
    const loadout = opts.loadout ?? spec.loadouts.find((l) => l.id === opts.loadoutId) ?? spec.loadouts[0];
    const slots: StoreSlot[] = [];
    for (const p of loadout.place) {
      const h = spec.hardpoints.find((x) => x.id === p.hp);
      const st = STORES[p.store];
      if (!h || !st || p.n <= 0) continue;
      const n = p.n * h.pylons;
      slots.push({ hp: p.hp, store: st, n, n0: n, internal: h.kind === 'bay' });
    }
    // Ağır bombalar önce bırakılır (pike ve taarruzda asıl yük)
    slots.sort((a, b) => b.store.mass - a.store.mass);
    this.stores = { loadout, slots };
    if (loadout.tankFuel) this.tankFuel = loadout.tankFuel * mods.dropTankMul;
    this.belt = BELTS[opts.belt ?? 'std'];
    this.guns = effectiveGuns(spec, loadout, mods);
    this.gunAmmo = this.guns.map((g) => g.ammo);
    this.gunCooldown = this.guns.map(() => 0);
    this.turrets = spec.turrets.map((t) => ({
      spec: t, gun: { ...t.gun, rate: t.gun.rate * mods.turretRateMul, ammo: Math.round(t.gun.ammo * mods.turretRateMul) },
      ammo: Math.round(t.gun.ammo * mods.turretRateMul), cooldown: 0, targetId: null, retarget: Math.random(),
      noise: new Vector3(), noiseGoal: new Vector3(), noiseTime: 0, track: 0, aim: new Vector3(), firing: false,
    }));
    this.damage = newDamage(spec.engines);
    this.skill = opts.skill ?? 0.6 + Math.random() * 0.8;
  }

  syncAxes(): void {
    this.fwd.set(0, 0, 1).applyQuaternion(this.quat);
    this.upv.set(0, 1, 0).applyQuaternion(this.quat);
  }

  /** Pusula yönü (0 = kuzey/-Z, 90 = doğu/+X) ve yunuslama açısı ile yönelim ayarlar. */
  setAttitude(headingDeg: number, pitchDeg = 0): void {
    this.quat.setFromEuler(new Euler(-pitchDeg * DEG, Math.PI - headingDeg * DEG, 0, 'YXZ'));
    this.syncAxes();
  }

  velocity(out: Vector3): Vector3 {
    return out.copy(this.fwd).multiplyScalar(this.speed);
  }

  get headingDeg(): number {
    return (Math.atan2(this.fwd.x, -this.fwd.z) / DEG + 360) % 360;
  }

  get pitchDeg(): number {
    return Math.asin(clamp(this.fwd.y, -1, 1)) / DEG;
  }

  /** Yatış açısı (derece, sağa pozitif). */
  get bankDeg(): number {
    const f = this.fwd;
    const u = this.upv;
    const rx = -f.x * f.y;
    const ry = 1 - f.y * f.y;
    const rz = -f.z * f.y;
    const rl = Math.hypot(rx, ry, rz);
    if (rl < 1e-4) return 0;
    const cos = (u.x * rx + u.y * ry + u.z * rz) / rl;
    const cx = ry * u.z - rz * u.y;
    const cy = rz * u.x - rx * u.z;
    const cz = rx * u.y - ry * u.x;
    const sin = (f.x * cx + f.y * cy + f.z * cz) / rl;
    return Math.atan2(sin, cos) / DEG;
  }

  get alive(): boolean {
    return this.status === 'flying';
  }

  /** Havada ve kontrol altında. */
  get airborne(): boolean {
    return this.status === 'flying' && !this.onGround;
  }

  get totalFuel(): number {
    return this.fuel + this.tankFuel;
  }

  get fuelFrac(): number {
    return this.fuel / this.fuelCap;
  }

  /** Anlık kütle (kg): boş + yakıt + kalan yük (tank yakıtı ayrı sayılır). */
  get mass(): number {
    let m = this.spec.massEmpty + this.fuel + this.tankFuel;
    for (const s of this.stores.slots) m += s.n * (s.store.kind === 'tank' ? s.store.mass - (s.store.fuelKg ?? 0) : s.store.mass);
    return m;
  }

  /** Dış yüklerin parazit sürükleme katkısı (bölmedekiler hariç). */
  get storesDrag(): number {
    let d = 0;
    for (const s of this.stores.slots) if (!s.internal) d += s.store.drag * s.n;
    return d;
  }

  get bombCount(): number {
    let n = 0;
    for (const s of this.stores.slots) if (s.store.kind === 'bomb') n += s.n;
    return n;
  }

  get rocketCount(): number {
    let n = 0;
    for (const s of this.stores.slots) if (s.store.kind === 'rocket') n += s.n;
    return n;
  }

  /** Dış tank takılı mı. */
  get hasTank(): boolean {
    return this.stores.slots.some((s) => s.store.kind === 'tank' && s.n > 0);
  }

  /** Bir sonraki bombayı askıdan al (ağırdan hafife). */
  takeBomb(): BombDef | null {
    for (const s of this.stores.slots) {
      if (s.store.kind === 'bomb' && s.n > 0 && s.store.bomb) {
        s.n--;
        return s.store.bomb;
      }
    }
    return null;
  }

  takeRocket(): RocketDef | null {
    for (const s of this.stores.slots) {
      if (s.store.kind === 'rocket' && s.n > 0 && s.store.rocket) {
        s.n--;
        return s.store.rocket;
      }
    }
    return null;
  }

  /** Dış tankları at (çatışmaya girerken). */
  jettisonTanks(): boolean {
    let any = false;
    for (const s of this.stores.slots) {
      if (s.store.kind === 'tank' && s.n > 0) {
        s.n = 0;
        any = true;
      }
    }
    this.tankFuel = 0;
    return any;
  }

  /** Taşınan bomba/roket kaldı mı. */
  get hasOrdnance(): boolean {
    return this.bombCount > 0 || this.rocketCount > 0;
  }

  /** Mermisi kalan silah var mı. */
  get armed(): boolean {
    return this.gunAmmo.some((a) => a > 0);
  }

  /** Kalan ateş gücü oranı (hasar × mermi ağırlıklı). */
  get ammoFrac(): number {
    let have = 0;
    let max = 0;
    this.guns.forEach((g, i) => {
      have += this.gunAmmo[i] * g.damage;
      max += g.ammo * g.damage;
    });
    return max > 0 ? have / max : 0;
  }

  /** Nişan balistiği için mermisi kalan ilk silah grubu. */
  get aimGun(): GunSpec | null {
    for (let i = 0; i < this.guns.length; i++) if (this.gunAmmo[i] > 0) return this.guns[i];
    return this.guns[0] ?? null;
  }

  get label(): string {
    return `${this.callsign} · ${this.spec.abbr}`;
  }
}
