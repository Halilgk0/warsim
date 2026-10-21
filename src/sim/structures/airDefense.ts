// Uçaksavar mevzisi. Yuvalara silah takılır; araştırmayla yeni silahlar ve nişan aletleri açılır.
// Hafif/orta toplar gerçek izli mermi atar (havada görülür); ağır top zaman tapalı flak atar.
// Nişan hatası: mürettebat, telemetre, hesaplayıcı ve radar ile azalır. Arazi görüşü engellerse ateş edilemez.

import { Vector3 } from 'three';
import type { Structure } from './structure';
import type { World } from '../world';
import type { Aircraft } from '../aircraft/aircraft';
import type { Caliber } from '../aircraft/specs';
import type { Research } from '../tech';
import { lineOfSight } from '../terrain';
import { visibility } from '../ai/perception';
import { DEG, G, gauss, rand } from '../../core/math';

export type AAWeaponId = 'mg' | 'aa20' | 'aa20q' | 'aa37' | 'aa40' | 'aa88' | 'aa128';

export interface AAWeaponDef {
  id: AAWeaponId;
  name: string;
  short: string;
  requires: string | null;
  /** Eğik menzil (m). */
  range: number;
  /** Mevzinin üstünde etkili tavan (m). */
  ceiling: number;
  /** Saniyedeki atış. */
  rate: number;
  muzzleVel: number;
  damage: number;
  dispersion: number;
  kind: 'tracer' | 'flak';
  /** Kendini imha / zaman tapası parçacık yarıçapı. 0 = yalnız doğrudan isabet. */
  burstRadius: number;
  caliber: Caliber;
  installTime: number;
  rank: number;
  /** Orta/ağır top (hesaplayıcı ve yakınlık tapasından yararlanır). */
  medium: boolean;
  /** Kurulum maliyeti (kr). */
  cost: number;
  /** Namlu dönüş hızı (°/sn): elle çevrilen ağır top yavaş, hafif top ve makineli hızlı. */
  slew: number;
}

export const AA_WEAPONS: Record<AAWeaponId, AAWeaponDef> = {
  mg: {
    id: 'mg', name: '12,7 mm uçaksavar makineli', short: '12,7 mm', requires: null, range: 1300, ceiling: 1200,
    rate: 9, muzzleVel: 860, damage: 1.4, dispersion: 0.012, kind: 'tracer', burstRadius: 0, caliber: 'heavy',
    installTime: 20, rank: 1, medium: false, cost: 300, slew: 60,
  },
  aa20: {
    id: 'aa20', name: '20 mm hafif uçaksavar topu', short: '20 mm', requires: 'hd_20', range: 2000, ceiling: 2000,
    rate: 5, muzzleVel: 900, damage: 6, dispersion: 0.01, kind: 'tracer', burstRadius: 0, caliber: 'cannon',
    installTime: 30, rank: 2, medium: false, cost: 850, slew: 45,
  },
  aa20q: {
    id: 'aa20q', name: 'Dörtlü 20 mm uçaksavar (Flakvierling)', short: '4×20 mm', requires: 'hd_20q', range: 2000, ceiling: 2000,
    rate: 15, muzzleVel: 900, damage: 6, dispersion: 0.012, kind: 'tracer', burstRadius: 0, caliber: 'cannon',
    installTime: 40, rank: 3, medium: false, cost: 1600, slew: 40,
  },
  aa37: {
    id: 'aa37', name: '37 mm orta uçaksavar topu', short: '37 mm', requires: 'hd_37', range: 3500, ceiling: 3500,
    rate: 2, muzzleVel: 880, damage: 24, dispersion: 0.008, kind: 'tracer', burstRadius: 9, caliber: 'cannon',
    installTime: 45, rank: 4, medium: true, cost: 1600, slew: 30,
  },
  aa40: {
    id: 'aa40', name: '40 mm Bofors uçaksavar topu', short: '40 mm', requires: 'hd_40', range: 4000, ceiling: 4200,
    rate: 2.2, muzzleVel: 880, damage: 30, dispersion: 0.007, kind: 'tracer', burstRadius: 11, caliber: 'cannon',
    installTime: 50, rank: 5, medium: true, cost: 2500, slew: 30,
  },
  aa88: {
    id: 'aa88', name: '88 mm ağır uçaksavar topu', short: '88 mm', requires: 'hd_88', range: 9000, ceiling: 9000,
    rate: 0.35, muzzleVel: 820, damage: 55, dispersion: 0, kind: 'flak', burstRadius: 22, caliber: 'cannon',
    installTime: 60, rank: 6, medium: true, cost: 3350, slew: 12,
  },
  aa128: {
    id: 'aa128', name: '128 mm çok ağır flak', short: '128 mm', requires: 'hd_128', range: 13000, ceiling: 13000,
    rate: 0.2, muzzleVel: 880, damage: 95, dispersion: 0, kind: 'flak', burstRadius: 32, caliber: 'cannon',
    installTime: 90, rank: 7, medium: true, cost: 6300, slew: 8,
  },
};

export const AA_WEAPON_ORDER: AAWeaponId[] = ['mg', 'aa20', 'aa20q', 'aa37', 'aa40', 'aa88', 'aa128'];

/** Batarya seviyesi yükseltme: gereken araştırma, süre ve maliyet (seviye 2, 3, 4). */
const LEVELS: { req: string; time: number; cost: number }[] = [
  { req: 'hd_fort1', time: 60, cost: 1600 },
  { req: 'hd_fort2', time: 90, cost: 3150 },
  { req: 'hd_fort3', time: 140, cost: 5800 },
];

export type AASensorId = 'rangefinder' | 'predictor' | 'gunRadar' | 'proximity';

export interface AASensorDef {
  id: AASensorId;
  name: string;
  desc: string;
  requires: string;
  installTime: number;
  cost: number;
}

export const AA_SENSORS: Record<AASensorId, AASensorDef> = {
  rangefinder: {
    id: 'rangefinder', name: 'Optik telemetre', requires: 'hd_rangefinder', installTime: 30, cost: 950,
    desc: 'Nişan hatası %15–25 azalır, hedef 1 sn daha çabuk alınır.',
  },
  predictor: {
    id: 'predictor', name: 'Mekanik atış hesaplayıcı', requires: 'hd_predictor', installTime: 40, cost: 1900,
    desc: 'Orta ve ağır toplarda ön nişan otomatik: hata %30–40 azalır.',
  },
  gunRadar: {
    id: 'gunRadar', name: 'Atış kontrol radarı', requires: 'hd_gunradar', installTime: 60, cost: 3700,
    desc: 'Hedefi gözle görmeden tam menzilde izler; ağır topların hatası yarıya iner.',
  },
  proximity: {
    id: 'proximity', name: 'Yakınlık tapası', requires: 'hd_vt', installTime: 30, cost: 2650,
    desc: 'Orta ve ağır mermiler hedefin yanında patlar: öldürücü yarıçap %50 büyür.',
  },
};

export interface AAMount {
  weapon: AAWeaponId;
  cooldown: number;
  targetId: number | null;
  /** Hedef alma süresi (s). */
  acquire: number;
  retarget: number;
  /** Render için namlu yönü (radyan). */
  yaw: number;
  pitch: number;
  lastFire: number;
}

export interface UpgradeOption {
  key: string;
  label: string;
  detail: string;
  time: number;
  /** Maliyet (kr). */
  cost: number;
  enabled: boolean;
  reason?: string;
}

interface UpgradeJob {
  key: string;
  label: string;
  left: number;
  total: number;
}

/** Görsel tespit menzili (m): tek avcı boyutunda hedef. Büyük uçak, sıkı kol ve yoğuşma izi çok daha uzaktan görülür. */
const VISUAL_RANGE = 5500;

const _aim = new Vector3();
const _v = new Vector3();
const _gun = new Vector3();
const _dir = new Vector3();
const _perp1 = new Vector3();
const _perp2 = new Vector3();
const _rel = new Vector3();

function wrapPi(a: number): number {
  return a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
}

export class AASite {
  level = 1;
  readonly mounts: AAMount[] = [];
  readonly sensors = new Set<AASensorId>();
  job: UpgradeJob | null = null;
  /** Mürettebat eğitimi (0.8 … 1.2). */
  crew = 0.8 + Math.random() * 0.4;
  /** Takım geneli araştırmaların çarpanları (topçu okulu, gelişmiş mühimmat). */
  private crewMul = 1;
  private ammoMul = 1;
  shotsFired = 0;
  /** Ateş anında hedefin bataryaya göre açısal hızı (rad/sn): takip gecikmesi. */
  private omega = 0;

  constructor(initial: AAWeaponId[] = ['mg', 'mg']) {
    for (const w of initial) this.addMount(w);
  }

  get maxMounts(): number {
    return 2 + (this.level - 1) * 2;
  }

  addMount(w: AAWeaponId): void {
    if (this.mounts.length >= 8) return;
    this.mounts.push({ weapon: w, cooldown: Math.random(), targetId: null, acquire: 0, retarget: 0, yaw: 0, pitch: 0.3, lastFire: -1e9 });
  }

  /** Silah çukurunun batarya merkezine göre yeri (m): komuta mevzisi çevresinde altıgen düzen. */
  static mountOffset(i: number): [number, number] {
    if (i >= 6) {
      // 4. seviyenin iki ek yuvası dış halkada
      const a = (i === 6 ? 0.5 : 3.64) + Math.PI / 6;
      return [Math.cos(a) * 66, Math.sin(a) * 66];
    }
    const a = (i / 6) * Math.PI * 2 + 0.5;
    return [Math.cos(a) * 42, Math.sin(a) * 42];
  }

  options(research: Research): UpgradeOption[] {
    const out: UpgradeOption[] = [];
    const busy = this.job !== null;
    const free = this.mounts.length < this.maxMounts;
    for (const id of AA_WEAPON_ORDER) {
      const w = AA_WEAPONS[id];
      const unlocked = research.has(w.requires ?? undefined);
      out.push({
        key: `add:${id}`, label: `${w.short} ekle`, detail: w.name, time: w.installTime, cost: w.cost,
        enabled: !busy && free && unlocked,
        reason: !unlocked ? 'Araştırma gerekli' : !free ? 'Boş yuva yok' : busy ? 'Başka iş sürüyor' : undefined,
      });
    }
    // En zayıf yuvayı yükselt
    let weakest = -1;
    for (let i = 0; i < this.mounts.length; i++) {
      if (weakest < 0 || AA_WEAPONS[this.mounts[i].weapon].rank < AA_WEAPONS[this.mounts[weakest].weapon].rank) weakest = i;
    }
    if (weakest >= 0) {
      const cur = AA_WEAPONS[this.mounts[weakest].weapon];
      for (const id of AA_WEAPON_ORDER) {
        const w = AA_WEAPONS[id];
        if (w.rank <= cur.rank || !research.has(w.requires ?? undefined)) continue;
        out.push({
          key: `rep:${weakest}:${id}`, label: `${cur.short} → ${w.short}`, detail: `${weakest + 1}. yuvayı yenile`,
          time: Math.round(w.installTime * 0.8), cost: Math.round((w.cost * 0.85) / 50) * 50, enabled: !busy, reason: busy ? 'Başka iş sürüyor' : undefined,
        });
      }
    }
    for (const sid of Object.keys(AA_SENSORS) as AASensorId[]) {
      const sd = AA_SENSORS[sid];
      if (this.sensors.has(sid)) continue;
      const unlocked = research.has(sd.requires);
      out.push({
        key: `sen:${sid}`, label: `${sd.name} kur`, detail: sd.desc, time: sd.installTime, cost: sd.cost,
        enabled: !busy && unlocked, reason: !unlocked ? 'Araştırma gerekli' : busy ? 'Başka iş sürüyor' : undefined,
      });
    }
    if (this.level < 4) {
      const lv = LEVELS[this.level - 1];
      const unlocked = research.has(lv.req);
      out.push({
        key: 'lvl', label: `Seviye ${this.level + 1}: +2 yuva`, detail: this.level === 3 ? 'Dış halkaya iki ağır top yuvası, beton sığınaklar' : 'Mevziyi genişlet ve tahkim et',
        time: lv.time, cost: lv.cost, enabled: !busy && unlocked,
        reason: !unlocked ? 'Araştırma gerekli' : busy ? 'Başka iş sürüyor' : undefined,
      });
    }
    return out;
  }

  start(key: string, research: Research): boolean {
    const opt = this.options(research).find((o) => o.key === key);
    if (!opt || !opt.enabled) return false;
    this.job = { key, label: opt.label, left: opt.time, total: opt.time };
    return true;
  }

  private finishJob(): string {
    const job = this.job!;
    this.job = null;
    const [kind, a, b] = job.key.split(':');
    if (kind === 'add') this.addMount(a as AAWeaponId);
    else if (kind === 'rep') this.mounts[Number(a)].weapon = b as AAWeaponId;
    else if (kind === 'sen') this.sensors.add(a as AASensorId);
    else if (kind === 'lvl') this.level++;
    return job.label;
  }

  /** Bakım/yükseltme altındaki yuva ateş edemez. */
  private offlineMount(): number {
    if (!this.job) return -1;
    const [kind, a] = this.job.key.split(':');
    return kind === 'rep' ? Number(a) : -1;
  }

  update(world: World, s: Structure, dt: number): void {
    if (this.job && s.active) {
      this.job.left -= dt;
      if (this.job.left <= 0) world.log(`${s.name}: ${this.finishJob()} tamamlandı`, s.team, 'defense');
    }
    if (!s.active) return;
    const research = world.teams[s.team].research;
    this.crewMul = research.has('hd_crew') ? 1.22 : 1;
    this.ammoMul = research.has('hd_ammo') ? 1.15 : 1;
    const effective = Math.ceil(this.mounts.length * (s.hp / s.maxHp));
    const offline = this.offlineMount();
    const intel = world.teams[s.team].intel;
    for (let i = 0; i < this.mounts.length; i++) {
      if (i >= effective || i === offline) continue;
      const m = this.mounts[i];
      const w = AA_WEAPONS[m.weapon];
      const [ox, oz] = AASite.mountOffset(i);
      _gun.set(s.pos.x + ox, s.pos.y + 2.5, s.pos.z + oz);
      m.cooldown = Math.max(m.cooldown - dt, -0.05);
      m.retarget -= dt;
      if (m.retarget <= 0) {
        m.retarget = 0.5 + Math.random() * 0.3;
        const t = this.pickTarget(world, s, w, m.targetId);
        if (t?.id !== m.targetId) {
          m.targetId = t?.id ?? null;
          let acq = 4 / (this.crew * this.crewMul);
          if (this.sensors.has('rangefinder')) acq -= 1;
          if (this.sensors.has('predictor') && w.medium) acq -= 0.5;
          if (this.sensors.has('gunRadar')) acq -= 1.5;
          if (t && intel.contacts.has(t.id)) acq -= 1;
          m.acquire = Math.max(0.8, acq);
        }
      }
      const tgt = m.targetId !== null ? world.aircraftById(m.targetId) : undefined;
      if (!tgt || tgt.status !== 'flying') {
        m.targetId = null;
        continue;
      }
      this.leadPoint(_gun, tgt, w, _aim);
      _dir.subVectors(_aim, _gun);
      // Namlu dönüş hızıyla sınırlı: hızla yakından geçen uçağa yetişemez (alçak taarruzun uçaksavara karşı üstünlüğü)
      const wantYaw = Math.atan2(_dir.x, -_dir.z);
      const wantPitch = Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z));
      const step = w.slew * DEG * dt;
      const dy = wrapPi(wantYaw - m.yaw);
      const dp = wantPitch - m.pitch;
      m.yaw = wrapPi(m.yaw + Math.max(-step, Math.min(step, dy)));
      m.pitch += Math.max(-step, Math.min(step, dp));
      const off = Math.hypot(wrapPi(wantYaw - m.yaw) * Math.cos(wantPitch), wantPitch - m.pitch);
      if (m.acquire > 0) {
        m.acquire -= dt;
        continue;
      }
      if (off > (w.kind === 'flak' ? 3 : 1.5) * DEG) continue;
      tgt.velocity(_v);
      _rel.subVectors(tgt.pos, _gun);
      this.omega = _perp1.crossVectors(_rel, _v).length() / Math.max(_rel.lengthSq(), 1);
      while (m.cooldown <= 0) {
        m.cooldown += (1 / w.rate) * rand(0.85, 1.15);
        this.fire(world, s, m, w);
        if (w.kind === 'tracer') tgt.aaFireTime = world.time;
      }
    }
  }

  /** Bataryanın etkili menzili ve tavanı (en uzun menzilli yuvaya göre): uçakların rota planı için. */
  envelope(): { range: number; ceiling: number } {
    let range = 0;
    let ceiling = 0;
    for (const m of this.mounts) {
      const w = AA_WEAPONS[m.weapon];
      if (w.range > range) {
        range = w.range;
        ceiling = w.ceiling;
      }
    }
    return { range, ceiling };
  }

  private pickTarget(world: World, s: Structure, w: AAWeaponDef, current: number | null): Aircraft | null {
    const radar = this.sensors.has('gunRadar');
    let best: Aircraft | null = null;
    let bestScore = Infinity;
    for (const ac of world.aircraft) {
      if (ac.team === s.team || !ac.airborne) continue;
      const above = ac.pos.y - s.pos.y;
      if (above < 25 || above > w.ceiling) continue;
      const d = ac.pos.distanceTo(s.pos);
      if (d > w.range) continue;
      // Optik nişan: yüksekteki bombardıman kutusu (büyük, kalabalık, yoğuşma izli) 15 km'den görülür; ağır flak ancak
      // böyle iş görürdü (eski sabit 5,5–7,4 km'lik menzilde 7 km'deki B-17'yi neredeyse tepeden geçerken görüyordu)
      const seeRange = radar ? w.range : VISUAL_RANGE * Math.sqrt(ac.spec.size / 6.5) * visibility(ac);
      if (d > seeRange) continue;
      if (!lineOfSight(s.pos.x, s.pos.y + 3, s.pos.z, ac.pos.x, ac.pos.y, ac.pos.z)) continue;
      let score = d;
      // Namlunun izleyemeyeceği kadar hızlı kayan hedef (yakından geçen alçak uçak) seçilmez
      ac.velocity(_v);
      _rel.subVectors(ac.pos, s.pos);
      const om = _perp1.crossVectors(_rel, _v).length() / Math.max(_rel.lengthSq(), 1);
      if (om > w.slew * DEG * 1.2) score *= 3;
      if (ac.spec.role !== 'fighter') score *= 0.7;
      if (ac.id === current) score *= 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = ac;
      }
    }
    return best;
  }

  /** Merminin uçuş süresine göre ön nişan noktası (yerçekimi düşüşü dahil). */
  private leadPoint(gun: Vector3, tgt: Aircraft, w: AAWeaponDef, out: Vector3): Vector3 {
    tgt.velocity(_v);
    let tof = tgt.pos.distanceTo(gun) / w.muzzleVel;
    for (let k = 0; k < 2; k++) {
      out.copy(tgt.pos).addScaledVector(_v, tof);
      tof = out.distanceTo(gun) / w.muzzleVel;
    }
    if (w.kind === 'tracer') out.y += 0.5 * G * tof * tof;
    return out;
  }

  private errorMul(w: AAWeaponDef): number {
    let m = 1 / (this.crew * this.crewMul);
    if (this.sensors.has('rangefinder')) m *= w.kind === 'flak' ? 0.75 : 0.85;
    if (this.sensors.has('predictor') && w.medium) m *= 0.62;
    if (this.sensors.has('gunRadar')) m *= w.kind === 'flak' ? 0.45 : 0.7;
    return m;
  }

  private fire(world: World, s: Structure, m: AAMount, w: AAWeaponDef): void {
    m.lastFire = world.time;
    this.shotsFired++;
    const prox = this.sensors.has('proximity') && w.medium;
    if (w.kind === 'flak') {
      const d = _aim.distanceTo(_gun);
      const err = (20 + d * 0.02) * this.errorMul(w);
      const burst = _aim.clone();
      burst.x += gauss() * err;
      burst.y += gauss() * err * 0.7;
      burst.z += gauss() * err;
      world.scheduleFlak(burst, (d / w.muzzleVel) * 1.15, s.team, w.damage * this.ammoMul, w.burstRadius * (prox ? 1.5 : 1), s.name);
      return;
    }
    // İzli mermi: nişan yönüne açısal hata ekle
    _dir.subVectors(_aim, _gun).normalize();
    // Takip gecikmesi: açısal hızla kayan hedefte nişancı hep biraz geride (~0,1 sn)
    const sigma = (w.dispersion + 0.014) * this.errorMul(w) + this.omega * 0.1;
    _perp1.set(-_dir.z, 0, _dir.x);
    if (_perp1.lengthSq() < 1e-6) _perp1.set(1, 0, 0);
    _perp1.normalize();
    _perp2.crossVectors(_dir, _perp1);
    _dir.addScaledVector(_perp1, gauss() * sigma).addScaledVector(_perp2, gauss() * sigma).normalize();
    const flight = Math.min(_aim.distanceTo(_gun) * 1.25, w.range * 1.1) / w.muzzleVel;
    world.spawnShot({
      pos: _gun.clone(),
      vel: _dir.clone().multiplyScalar(w.muzzleVel),
      life: w.burstRadius > 0 ? flight : (w.range * 1.2) / w.muzzleVel,
      team: s.team,
      ownerId: -s.id,
      damage: w.damage * this.ammoMul,
      caliber: w.caliber,
      burstRadius: w.burstRadius * (prox ? 1.5 : 1),
      proximity: prox,
      tracer: true,
      sourceName: s.name,
    });
  }
}
