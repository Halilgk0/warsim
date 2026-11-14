// İtfaiye merkezi (2026-11-12): kapsama alanındaki şehir binalarını onarır. Personeli evlerden gelir (uçak mürettebatı
// gibi boşta kişi ister: kuruluşta 4, her seviyede +2; world.crewFree bu kadrosu düşer). Hasar gören binaya ekip araçla
// gider: yollardan (roads.ts roadPath), 1–2 kişi küçük araç, 3 kişi büyük araç. Ekip büyüklüğü binaya göre (FIRE_CREW);
// yer çoksa büyük binalar önce. Merkez hasar alırsa 2 kişi (seviye başına +1) kendi binasını onarır. Onarım elle
// onarımın yarı fiyatına (FIRE_COST_RATE, 2026-11-13 kararı); para yetmezse ekip bekler, para gelince sürer.
// Radar, uçaksavar bataryası ve maden ocağına yalnız oyuncu onları yola bağladıysa (ve alandaysalar) gidilir; yoksa
// eskisi gibi elle (paralı) onarılır. Hava üssü ve fabrika hep elle.

import type { World } from '../world';
import type { Structure, StructureKind } from './structure';
import { LOT_LINE, ROAD_REACH, roadHitsRect, roadPath, type Road, type RoadPoint } from '../roads';
import { L } from '../../i18n';

/** Seviyeye göre kadro, kapsama yarıçapı (m) ve o seviyeye çıkmanın bedeli (kr). */
export const FIRE_STAFF = [0, 4, 6, 8];
export const FIRE_RADIUS = [0, 600, 850, 1100];
export const FIRE_UPGRADE_COST = [0, 0, 3000, 4500];
/** Seviye atlamanın süresi (sn) ve istediği boşta personel. */
export const FIRE_UPGRADE_TIME = 45;
export const FIRE_UPGRADE_STAFF = 2;
/** Binaya giden ekip (kişi). Listede olmayan yapılara itfaiye gitmez. */
export const FIRE_CREW: Partial<Record<StructureKind, number>> = { smallhouse: 1, midhouse: 1, house: 2, apartment: 3, townhall: 3, firestation: 2 };
/** Yapıya bağlı yollar: kendi tarafının, tabanının kenarına ya da köşesine arsa payı kadar (17,5 m) yaklaşan yolları. */
export function linkedRoads(world: World, s: Structure): Road[] {
  return world.roads.filter((r) => r.team === s.team && roadHitsRect(r, s.pos.x, s.pos.z, s.def.halfW, s.def.halfL, s.heading, LOT_LINE + ROAD_REACH));
}

/** Yapı yola bağlı mı. */
export function roadLinked(world: World, s: Structure): boolean {
  return linkedRoads(world, s).length > 0;
}

/**
 * Bu merkez bu yapıya gider mi: çalışıyor, aynı taraf, alanında ve ikisi aynı yol kümesinde (yoldan ulaşılır; ikinci bir
 * belediyenin bağlantısız sokaklarına ekip arazinin üstünden gitmesin, 2026-11-13 testi).
 */
export function stationReaches(world: World, st: Structure, s: Structure): boolean {
  if (!st.fire || !st.active || st.team !== s.team || st === s) return false;
  if (Math.hypot(st.pos.x - s.pos.x, st.pos.z - s.pos.z) > st.fire.radius) return false;
  const mine = linkedRoads(world, st).map((r) => world.roadComponent(r.id));
  if (!mine.length) return false;
  return linkedRoads(world, s).some((r) => mine.includes(world.roadComponent(r.id)));
}

/**
 * Bu yapıya gidecek ekip (kişi); 0: itfaiye gitmez. Şehir binaları FIRE_CREW'dan. Radar, uçaksavar bataryası ve maden
 * ocağı yalnız oyuncu yola bağladıysa: radar ve maden 2, batarya ilk seviyede 2, sonraki seviyelerde 3 kişi. (Bunların
 * ayrıca bir merkezin alanında olması gerekir; ikisinden biri yoksa elle onarılır.)
 */
export function fireCrewFor(world: World, s: Structure): number {
  const n = FIRE_CREW[s.kind] ?? (s.kind === 'radar' || s.kind === 'mine' ? 2 : s.kind === 'aa' ? ((s.aa?.level ?? 1) > 1 ? 3 : 2) : 0);
  // Hepsi yola bağlı olmalı (evler zaten yolun yanına kurulur; yolsuz eski kayıt evleri elle onarılır)
  return n > 0 && roadLinked(world, s) ? n : 0;
}

/** İtfaiye onarımının bedeli, elle onarımınkine göre. */
export const FIRE_COST_RATE = 0.5;

/** Son isabetten sonra ekip çıkmadan önce beklenen süre (sn) ve tam ekiple tam onarımın süresi (sn). */
export const FIRE_DELAY = 30;
export const FIRE_REPAIR_TIME = 240;
/** Araç hızı (m/sn). */
const SPEED = 13;

export interface FireCrew {
  id: number;
  targetId: number;
  people: number;
  /** Üç kişilik ekip büyük araçla gider. */
  big: boolean;
  /** Yolda, onarımda, dönüşte. */
  state: 'out' | 'work' | 'back';
  path: RoadPoint[];
  seg: number;
  /** Bulunduğu parçada kat ettiği yol (m). */
  t: number;
  x: number;
  z: number;
  heading: number;
  /** Çıkış sırası: aynı anda çıkan ekipler birkaç saniye arayla yola koyulur (araç bu sürede garajda). */
  wait: number;
}

let nextCrew = 1;

export class FireStation {
  level: 1 | 2 | 3 = 1;
  /** Süren seviye yükseltmesi. */
  job: { left: number; total: number } | null = null;
  readonly crews: FireCrew[] = [];
  /** Merkezin kendi onarımında çalışanlar. */
  selfCrew = 0;
  /** Toplam onarılan bina (istatistik). */
  repaired = 0;
  private timer = Math.random();

  get staff(): number {
    return FIRE_STAFF[this.level];
  }

  get radius(): number {
    return FIRE_RADIUS[this.level];
  }

  /** Dışarıdaki ekiplerde olan kişi. */
  get out(): number {
    let n = 0;
    for (const c of this.crews) n += c.people;
    return n;
  }

  /** Kadrodan ayrılan kişi: kadro ve süren yükseltmenin isteyeceği ek personel. */
  get reserved(): number {
    return this.staff + (this.job ? FIRE_UPGRADE_STAFF : 0);
  }

  update(world: World, s: Structure, dt: number): void {
    if (this.job && s.active) {
      this.job.left -= dt;
      if (this.job.left <= 0) {
        this.job = null;
        if (this.level < 3) this.level = (this.level + 1) as 2 | 3;
        world.log(L(`${s.name}: ${this.level}. seviyeye çıktı (${this.staff} personel)`, `${s.name}: now level ${this.level} (${this.staff} staff)`), s.team, 'build');
      }
    }
    if (!s.active) {
      this.crews.length = 0;
      this.selfCrew = 0;
      return;
    }
    // Kendi binası: 2 kişi (seviye başına +1) merkezde kalıp onarır. Evler yıkılıp nüfus kadroyu karşılamıyorsa kadro o
    // oranda küçülür (staffRatio): kimsesiz merkez çalışmaz
    const selfMax = 1 + this.level;
    const staff = Math.floor(this.staff * world.staffRatio(s.team) + 1e-6);
    this.selfCrew = s.hp < s.maxHp ? Math.max(0, Math.min(staff - this.out, selfMax)) : 0;
    if (this.selfCrew > 0 && world.time - s.lastHit >= FIRE_DELAY) {
      const dh = Math.min(s.maxHp - s.hp, (s.maxHp / FIRE_REPAIR_TIME) * (this.selfCrew / selfMax) * dt);
      if (world.chargeRepair(s, dh, FIRE_COST_RATE)) s.hp += dh;
    }
    for (let i = this.crews.length - 1; i >= 0; i--) {
      const c = this.crews[i];
      const target = world.structureById(c.targetId);
      if (c.state === 'work') {
        if (!target || target.destroyed || target.hp >= target.maxHp) {
          if (target && !target.destroyed) this.repaired++;
          this.turnBack(c);
        } else if (world.time - target.lastHit >= 8) {
          const dh = Math.min(target.maxHp - target.hp, (target.maxHp / FIRE_REPAIR_TIME) * dt);
          if (world.chargeRepair(target, dh, FIRE_COST_RATE)) target.hp += dh;
        }
        continue;
      }
      if (c.wait > 0) {
        c.wait -= dt;
        continue;
      }
      // Yoldayken hedef yıkıldıysa geri dön
      if (c.state === 'out' && (!target || target.destroyed)) this.turnBack(c);
      if (this.advance(c, SPEED * dt)) {
        if (c.state === 'out') c.state = 'work';
        else this.crews.splice(i, 1);
      }
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    this.dispatch(world, s);
  }

  /** Bekleyen hasarlı binalara ekip çıkar: büyük ekip isteyenler önce, eşitlerde en hasarlı olan. */
  private dispatch(world: World, s: Structure): void {
    let free = Math.floor(this.staff * world.staffRatio(s.team) + 1e-6) - this.out - this.selfCrew;
    if (free <= 0) return;
    const taken = new Set<number>();
    for (const o of world.structures) if (o.fire) for (const c of o.fire.crews) if (c.state !== 'back') taken.add(c.targetId);
    const need = new Map<Structure, number>();
    const list = world.structures.filter((o) => {
      if (o === s || o.team !== s.team || !o.active || o.hp >= o.maxHp - 0.5 || taken.has(o.id) || world.time - o.lastHit < FIRE_DELAY) return false;
      if (!stationReaches(world, s, o)) return false;
      const n = fireCrewFor(world, o);
      if (n > 0) need.set(o, n);
      return n > 0;
    });
    list.sort((a, b) => (need.get(b)! - need.get(a)!) || (a.hp / a.maxHp - b.hp / b.maxHp));
    let sent = 0;
    for (const o of list) {
      const n = need.get(o)!;
      if (n > free) continue;
      free -= n;
      // İtfaiye üstlenince elle (tam fiyatlı) onarım kapanır: ikisi birden ödenmesin
      o.repairing = false;
      const path = roadPath(world.roads, s.team, s.pos.x, s.pos.z, o.pos.x, o.pos.z);
      const c: FireCrew = { id: nextCrew++, targetId: o.id, people: n, big: n >= 3, state: 'out', path, seg: 0, t: 0, x: path[0].x, z: path[0].z, heading: 0, wait: sent++ * 4 };
      this.advance(c, 0);
      this.crews.push(c);
      if (free <= 0) break;
    }
  }

  private turnBack(c: FireCrew): void {
    // Bulunduğu yerden geri: kalan yol ters çevrilir
    const done = c.path.slice(0, Math.min(c.seg + 1, c.path.length));
    c.path = [{ x: c.x, z: c.z }, ...done.reverse()];
    c.seg = 0;
    c.t = 0;
    c.state = 'back';
  }

  /** Aracı yol boyunca ilerlet; yolun sonuna vardıysa true. */
  private advance(c: FireCrew, dist: number): boolean {
    while (c.seg < c.path.length - 1) {
      const a = c.path[c.seg];
      const b = c.path[c.seg + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.01) {
        c.seg++;
        c.t = 0;
        continue;
      }
      const step = Math.min(dist, len - c.t);
      c.t += step;
      dist -= step;
      c.x = a.x + ((b.x - a.x) * c.t) / len;
      c.z = a.z + ((b.z - a.z) * c.t) / len;
      c.heading = Math.atan2(b.x - a.x, b.z - a.z);
      if (c.t < len - 1e-6) return false;
      c.seg++;
      c.t = 0;
    }
    return true;
  }
}
