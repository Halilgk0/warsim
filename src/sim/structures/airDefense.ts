// Uçaksavar mevzisi. Oyuncu topu fabrikada üretir (takım deposu), bataryanın yuvasına takar; çıkan top depoya döner.
// Yapay zekâ depo kullanmaz: `options` işleriyle (ekle, çevir) aynı parayı ve süreyi harcar. Araştırmayla yeni silahlar ve nişan aletleri açılır.
// Hafif/orta toplar gerçek izli mermi atar (havada görülür); ağır top zaman tapalı flak atar.
// Nişan hatası: mürettebat, telemetre, hesaplayıcı ve radar ile azalır. Arazi görüşü engellerse ateş edilemez.
//
// Silahlar gerçek sistemlerdir. Kaynaklar: Tactical and Technical Trends "Employment of German AAA" (savaş dönemi ABD
// istihbaratı: kendini imha süreleri, tapa sınırı, pratik atış hızı) ve Wikipedia'daki silah sayfaları.
//  - Menzil: izli merminin kendini imha ettiği yer. Ağır topta en büyük tapa ayarı.
//  - Tavan: ağır topta sürekli nişanlı atışın etkili tavanı = tapa tavanının ~1.800 m altı (88 mm: 9.900 → 8.000 m).
//  - Pratik atış hızı şarjörden çıkar: seri hızıyla boşalır, sonra değiştirilir.
//  - Hasar, parçacık yarıçapı ve 8,8 cm'in `aim`i: oyunun dengesine ayarlı, gerçek değerler değil. Hata kübüyle isabet: %13 az hata ~1,5 kat
//    düşürme. Hedef: düşürme başına mermi tarihî büyüklükte kalsın (npm run sim:flak).

import { Vector3 } from 'three';
import type { Structure } from './structure';
import type { World } from '../world';
import type { Aircraft } from '../aircraft/aircraft';
import type { Research } from '../tech';
import { lineOfSight } from '../terrain';
import { visibility } from '../ai/perception';
import { DEG, G, gauss, rand } from '../../core/math';
import { L, lower } from '../../i18n';

const NEED_RESEARCH = L('Araştırma gerekli', 'Research required');
const BUSY = L('Başka iş sürüyor', 'Another job is in progress');

// Silah tablosu ve mermi hesapları saf veri dosyasında (ansiklopedi de okur); burada aynen dışa aktarılır.
export * from './aaWeapons';
import { AA_WEAPONS, AA_WEAPON_ORDER, flightTime, shellDrag, type AAWeaponDef, type AAWeaponId } from './aaWeapons';

/** Yavaşlayan merminin t saniyede düşüşü (m): boş uzaydaki ½gt²'den az. */
function shellDrop(w: AAWeaponDef, t: number): number {
  const T = 1 / (shellDrag(w) * w.muzzleVel);
  const u = t + T;
  return G * ((u * u - T * T) / 4 - ((T * T) / 2) * Math.log(u / T));
}

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
    id: 'rangefinder', name: L('Optik telemetre', 'Optical rangefinder'), requires: 'hd_rangefinder', installTime: 30, cost: 950,
    desc: L('Nişan hatası %15–25 azalır, hedef 1 sn daha çabuk alınır.', 'Aiming error drops by 15–25%, targets are acquired 1 s sooner.'),
  },
  predictor: {
    id: 'predictor', name: L('Mekanik atış hesaplayıcı', 'Mechanical predictor'), requires: 'hd_predictor', installTime: 40, cost: 1900,
    desc: L('Orta ve ağır toplarda ön nişan otomatik: hata %30–40 azalır.', 'Automatic lead for medium and heavy guns: error drops by 30–40%.'),
  },
  gunRadar: {
    id: 'gunRadar', name: L('Atış kontrol radarı', 'Gun-laying radar'), requires: 'hd_gunradar', installTime: 60, cost: 3700,
    desc: L('Hedefi gözle görmeden tam menzilde izler; ağır topların hatası yarıya iner.', 'Tracks targets at full range without seeing them; heavy gun error is halved.'),
  },
  proximity: {
    id: 'proximity', name: L('Yakınlık tapası', 'Proximity fuze'), requires: 'hd_vt', installTime: 30, cost: 2650,
    desc: L('Orta ve ağır mermiler hedefin yanında patlar: öldürücü yarıçap %50 büyür.', 'Medium and heavy shells burst next to the target: lethal radius grows by 50%.'),
  },
};

export interface AAMount {
  weapon: AAWeaponId;
  cooldown: number;
  /** Şarjörde kalan. */
  rounds: number;
  /** Takılmasına kalan süre (sn): bitene kadar ateş edemez. */
  install: number;
  installTotal: number;
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

  /** Yuva sayısı: başta 2, tahkimatla 4. Seviye 3 ve 4 dayanıklılık verir; eski kayıtlarda fazla yuvası olan batarya onları korur. */
  get maxMounts(): number {
    return Math.max(this.mounts.length, this.level >= 2 ? 4 : 2);
  }

  /** Yuvaya depodaki topu tak: eski top varsa geri verilir, yenisi takma süresi boyunca ateş edemez. */
  placeGun(slot: number, w: AAWeaponId): AAWeaponId | null {
    const time = AA_WEAPONS[w].installTime;
    const m = this.mounts[slot];
    if (!m) {
      this.addMount(w);
      const n = this.mounts[this.mounts.length - 1];
      n.install = time;
      n.installTotal = time;
      return null;
    }
    const old = m.weapon;
    m.weapon = w;
    m.rounds = AA_WEAPONS[w].mag;
    m.install = time;
    m.installTotal = time;
    m.targetId = null;
    return old;
  }

  addMount(w: AAWeaponId): void {
    if (this.mounts.length >= 8) return;
    this.mounts.push({ weapon: w, cooldown: Math.random(), rounds: AA_WEAPONS[w].mag, install: 0, installTotal: 0, targetId: null, acquire: 0, retarget: 0, yaw: 0, pitch: 0.3, lastFire: -1e9 });
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
        key: `add:${id}`, label: L(`${w.short} ekle`, `Add ${w.short}`), detail: w.name, time: w.installTime, cost: w.cost,
        enabled: !busy && free && unlocked,
        reason: !unlocked ? NEED_RESEARCH : !free ? L('Boş yuva yok', 'No free slot') : busy ? BUSY : undefined,
      });
    }
    // En zayıf yuvayı yükselt
    let weakest = -1;
    for (let i = 0; i < this.mounts.length; i++) {
      if (weakest < 0 || AA_WEAPONS[this.mounts[i].weapon].rank < AA_WEAPONS[this.mounts[weakest].weapon].rank) weakest = i;
    }
    // Tek tip batarya: bütün yuvaları aynı topa çevir (değişen toplar iş bitene kadar ateş edemez)
    for (const id of AA_WEAPON_ORDER) {
      const w = AA_WEAPONS[id];
      const change = this.mounts.filter((m) => m.weapon !== id).length;
      if (!change || !research.has(w.requires ?? undefined)) continue;
      out.push({
        key: `all:${id}`, label: L(`Hepsi ${w.short}`, `All ${w.short}`),
        detail: L(`Bütün yuvalar ${w.name} olur. İş bitene kadar değişen toplar ateş edemez.`, `All slots become ${w.name}. The guns being changed cannot fire until the job is done.`),
        time: Math.round(w.installTime * 0.8 * (1 + (change - 1) * 0.5)), cost: Math.round((w.cost * 0.85 * change) / 50) * 50, enabled: !busy, reason: busy ? BUSY : undefined,
      });
    }
    if (weakest >= 0) {
      const cur = AA_WEAPONS[this.mounts[weakest].weapon];
      for (const id of AA_WEAPON_ORDER) {
        const w = AA_WEAPONS[id];
        if (w.rank <= cur.rank || !research.has(w.requires ?? undefined)) continue;
        out.push({
          key: `rep:${weakest}:${id}`, label: `${cur.short} → ${w.short}`, detail: L(`${weakest + 1}. yuvayı yenile`, `Replace slot ${weakest + 1}`),
          time: Math.round(w.installTime * 0.8), cost: Math.round((w.cost * 0.85) / 50) * 50, enabled: !busy, reason: busy ? BUSY : undefined,
        });
      }
    }
    for (const sid of Object.keys(AA_SENSORS) as AASensorId[]) {
      const sd = AA_SENSORS[sid];
      if (this.sensors.has(sid)) continue;
      const unlocked = research.has(sd.requires);
      out.push({
        key: `sen:${sid}`, label: L(`${sd.name} kur`, `Install ${lower(sd.name)}`), detail: sd.desc, time: sd.installTime, cost: sd.cost,
        enabled: !busy && unlocked, reason: !unlocked ? NEED_RESEARCH : busy ? BUSY : undefined,
      });
    }
    if (this.level < 4) {
      const lv = LEVELS[this.level - 1];
      const unlocked = research.has(lv.req);
      out.push({
        key: 'lvl', label: this.level === 1 ? L('Yuva sayısını 4 yap', 'Raise to 4 gun pits') : L(`Mevzi tahkimatı ${this.level}`, `Fortification ${this.level}`),
        detail: this.level === 1 ? L('İki yeni silah çukuru ve beton siper', 'Two new gun pits and concrete cover') : L('Batarya bomba ve rokete karşı dayanıklı olur: hasar −%15', 'The battery resists bombs and rockets better: damage −15%'),
        time: lv.time, cost: lv.cost, enabled: !busy && unlocked,
        reason: !unlocked ? NEED_RESEARCH : busy ? BUSY : undefined,
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
    else if (kind === 'rep') {
      const m = this.mounts[Number(a)];
      m.weapon = b as AAWeaponId;
      m.rounds = AA_WEAPONS[m.weapon].mag;
    }
    else if (kind === 'all') {
      for (const m of this.mounts) {
        if (m.weapon === a) continue;
        m.weapon = a as AAWeaponId;
        m.rounds = AA_WEAPONS[m.weapon].mag;
      }
    } else if (kind === 'sen') this.sensors.add(a as AASensorId);
    else if (kind === 'lvl') this.level++;
    return job.label;
  }

  /** Bakım/yükseltme altındaki yuva ateş edemez. */
  private isOffline(i: number): boolean {
    if (!this.job) return false;
    const [kind, a] = this.job.key.split(':');
    if (kind === 'rep') return i === Number(a);
    return kind === 'all' && this.mounts[i].weapon !== a;
  }

  /** Takılmakta olan yuva. */
  private installing(i: number): boolean {
    return this.mounts[i].install > 0;
  }

  /** Bütün yuvalarda aynı top varsa o; karışık ya da boş bataryada yok. */
  get uniformGun(): AAWeaponId | null {
    const first = this.mounts[0]?.weapon ?? null;
    return first && this.mounts.every((m) => m.weapon === first) ? first : null;
  }

  update(world: World, s: Structure, dt: number): void {
    if (this.job && s.active) {
      this.job.left -= dt;
      if (this.job.left <= 0) {
        // İş bir kez bitirilir (L iki dilin metnini de kurar)
        const done = this.finishJob();
        world.log(L(`${s.name}: ${done} tamamlandı`, `${s.name}: ${done} complete`), s.team, 'defense');
      }
    }
    if (!s.active) return;
    const research = world.teams[s.team].research;
    this.crewMul = research.has('hd_crew') ? 1.22 : 1;
    this.ammoMul = research.has('hd_ammo') ? 1.15 : 1;
    const effective = Math.ceil(this.mounts.length * (s.hp / s.maxHp));
    const intel = world.teams[s.team].intel;
    for (let i = 0; i < this.mounts.length; i++) {
      if (this.mounts[i].install > 0) this.mounts[i].install = Math.max(0, this.mounts[i].install - dt);
      if (i >= effective || this.isOffline(i) || this.installing(i)) continue;
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
        if (w.mag > 0 && --m.rounds <= 0) {
          // Şarjör bitti: eğitimli mürettebat daha çabuk değiştirir
          m.rounds = w.mag;
          m.cooldown += w.reload / (this.crew * this.crewMul);
        }
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
    let tof = flightTime(w, tgt.pos.distanceTo(gun));
    for (let k = 0; k < 2; k++) {
      out.copy(tgt.pos).addScaledVector(_v, tof);
      tof = flightTime(w, out.distanceTo(gun));
    }
    if (w.kind === 'tracer') out.y += shellDrop(w, tof);
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
      const err = (20 + d * 0.02) * this.errorMul(w) * (w.aim ?? 1);
      const burst = _aim.clone();
      burst.x += gauss() * err;
      burst.y += gauss() * err * 0.7;
      burst.z += gauss() * err;
      world.scheduleFlak(burst, flightTime(w, d), s.team, w.damage * this.ammoMul, w.burstRadius * (prox ? 1.5 : 1), s.name);
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
    const flight = flightTime(w, Math.min(_aim.distanceTo(_gun) * 1.25, w.range * 1.1));
    world.spawnShot({
      pos: _gun.clone(),
      vel: _dir.clone().multiplyScalar(w.muzzleVel),
      life: w.burstRadius > 0 ? flight : flightTime(w, w.range),
      drag: shellDrag(w),
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
