// Savaş sesleri (gerçek kayıtlar): kamera yakınlaştıkça duyulan motor, silah, uçaksavar, isabet ve patlama sesleri.
// Dinleyici kameradır; uzaklık oyun için sıkıştırılır: yakın planda (takip) sesler gerçeğe yakın, taktik görünümde
// savaş uzaktan, boğuk ve yankılı duyulur, strateji görünümünde susar. Sağ-sol konum kameraya göre yön; uzaktaki
// patlamanın sesi ışığından biraz sonra gelir.
// - Motorlar: tipe göre döngü (sıra motor: Bf 109 DB 601; yıldız: Fw 190 BMW 801; çok motorlu: dört motorlu pervaneli;
//   jet: J79). Devir gaza göre, perde Doppler'le kayar. Ju 87 B dalışta siren öttürür.
// - Yakından geçen uçak: tipine göre gerçek geçiş kaydı en yakın ana denk getirilir (kayıt kendi Doppler'ini taşır);
//   o sırada uçağın motor döngüsü kısılır.
// - Silahlar: kalibre ve namlu sayısına göre seri döngüsü (gerçek atışlar gerçek ateş hızında), seri bitince yankı.
// - Uçaksavar: 12,7 / 20 mm seri, 37–40 mm tek tek, 88–128 mm ağır top; havada şarapnel patlaması.

import * as THREE from 'three';
import type { World, SimEvent } from '../sim/world';
import type { Aircraft } from '../sim/aircraft/aircraft';
import type { GunSpec } from '../sim/aircraft/specs';
import { AA_WEAPONS } from '../sim/structures/airDefense';
import { sound, type Sample, type SoundId } from './sound';

/** Ses hızı (m/s). */
const C_SOUND = 343;
/** Aynı anda duyulan en fazla motor, ateş eden silah ve yakın geçiş. */
const MAX_ENGINES = 6;
const MAX_GUNS = 6;
const MAX_FLYBYS = 2;
/** Bu uzaklığın (kamera–hedef) altında sesler tam düzeyde; MUTE_DIST'te susar. */
const FULL_DIST = 2500;
const MUTE_DIST = 70000;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();

interface Hearing {
  gain: number;
  lowpass: number;
  pan: number;
  reverb: number;
  /** Sesin gecikmesi (s). */
  delay: number;
}
const h0 = (): Hearing => ({ gain: 0, lowpass: 0, pan: 0, reverb: 0, delay: 0 });

const engineSound = (ac: Aircraft): SoundId =>
  ac.spec.engine.kind === 'jet' ? 'eng_jet' : ac.spec.engines > 1 ? 'eng_bomber' : ac.spec.engine.kind === 'radial' ? 'eng_radial' : 'eng_inline';
const flybySound = (ac: Aircraft): SoundId =>
  ac.spec.engine.kind === 'jet' ? 'fly_jet' : ac.spec.engines > 1 ? 'fly_bomber' : ac.spec.engine.kind === 'radial' ? 'fly_radial' : 'fly_inline';

type GunClass = 'small' | 'heavy' | 'c20' | 'c30';
const gunClass = (g: GunSpec): GunClass => (/3[07] mm/.test(g.name) ? 'c30' : g.caliber === 'cannon' ? 'c20' : g.caliber === 'heavy' ? 'heavy' : 'small');
/** Silah grubundaki namlu sayısı ("4 × 7,7 mm …"). */
const barrels = (g: GunSpec): number => Number(g.name.match(/^(\d+) ×/)?.[1] ?? 1);

interface GunSound {
  id: SoundId;
  gain: number;
  tail: SoundId;
}
/** Kalibre ve namlu sayısına göre seri döngüsü. */
function gunSound(cls: GunClass, n: number): GunSound {
  switch (cls) {
    case 'small': return n >= 3 ? { id: 'gun_mg4', gain: Math.sqrt(n / 4), tail: 'tail_mg' } : { id: 'gun_mg1', gain: Math.sqrt(n), tail: 'tail_mg' };
    case 'heavy': return n >= 2 ? { id: 'gun_hmg4', gain: Math.sqrt(n / 4), tail: 'tail_mg' } : { id: 'gun_hmg1', gain: 1, tail: 'tail_mg' };
    case 'c20': return n >= 3 ? { id: 'gun_c20x4', gain: Math.sqrt(n / 4), tail: 'tail_can' } : n === 2 ? { id: 'gun_c20x2', gain: 1, tail: 'tail_can' } : { id: 'gun_c20x1', gain: 1, tail: 'tail_can' };
    case 'c30': return { id: 'gun_c30x2', gain: Math.sqrt(n / 2), tail: 'tail_can' };
  }
}

/** Sürekli çalan döngü (motor ya da silah serisi): süzgeç, düzey, sağ-sol, yankı gönderimi. */
class LoopVoice {
  readonly src: AudioBufferSourceNode;
  readonly out: GainNode;
  readonly lp: BiquadFilterNode;
  private readonly pan: StereoPannerNode | null;
  alive = true;

  constructor(protected readonly ctx: BaseAudioContext, smp: Sample, dest: AudioNode, reverb: AudioNode | null, send: number, fadeIn = 0.15) {
    this.src = ctx.createBufferSource();
    this.src.buffer = smp.buffer;
    this.src.loop = true;
    this.src.loopStart = smp.loopStart;
    this.src.loopEnd = smp.loopEnd;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.4;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.src.connect(this.lp);
    this.lp.connect(this.out);
    if (this.pan) {
      this.out.connect(this.pan);
      this.pan.connect(dest);
    } else this.out.connect(dest);
    if (reverb) {
      const s = ctx.createGain();
      s.gain.value = send;
      this.out.connect(s);
      s.connect(reverb);
    }
    // Aynı kayıttan iki ses aynı evrede çalmasın: döngünün rastgele bir yerinden başla
    this.src.start(ctx.currentTime, smp.loopStart + Math.random() * (smp.loopEnd - smp.loopStart));
    this.fadeIn = fadeIn;
  }

  private fadeIn: number;

  set(h: Hearing, gain: number, rate: number): void {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(h.gain * gain, t, this.fadeIn);
    this.fadeIn = 0.08;
    this.lp.frequency.setTargetAtTime(h.lowpass, t, 0.1);
    this.src.playbackRate.setTargetAtTime(rate, t, 0.12);
    if (this.pan) this.pan.pan.setTargetAtTime(h.pan, t, 0.08);
  }

  stop(release = 0.12): void {
    if (!this.alive) return;
    this.alive = false;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, release);
    this.src.stop(t + release * 6);
    // Bağlam saatine göre (video kaydında ses gerçek zamandan yavaş üretilir)
    this.src.onended = () => {
      this.out.disconnect();
      this.pan?.disconnect();
    };
  }
}

/** Bir uçağın motor sesi (ve Ju 87 B'de dalış sireni). */
class EngineVoice {
  private readonly loop: LoopVoice;
  private siren: LoopVoice | null = null;
  private readonly level: number;
  private readonly baseRate: number;
  /** Yakın geçiş kaydı çalarken motor döngüsü kısılır. */
  duckUntil = 0;

  constructor(private readonly ctx: BaseAudioContext, readonly ac: Aircraft, smp: Sample, dest: AudioNode, reverb: AudioNode | null) {
    this.loop = new LoopVoice(ctx, smp, dest, reverb, 0.18);
    const s = ac.spec;
    const jet = s.engine.kind === 'jet';
    // Kayıtlar tek ya da dört motorlu: iki motorlu uçakta motorlar daha küçük ve devri biraz yüksek
    this.baseRate = jet ? 1 : s.engines === 2 ? 1.06 : 1;
    this.level = jet ? 0.9 * Math.sqrt(s.engines) : s.engines > 1 ? 0.75 * Math.pow(s.engines, 0.4) : 0.85;
    if (s.id === 'ju87b') {
      const sm = sound.sample('stuka');
      if (sm) this.siren = new LoopVoice(ctx, sm, dest, reverb, 0.2);
    }
  }

  update(h: Hearing, doppler: number): void {
    const ac = this.ac;
    const spool = Math.min(1, Math.max(0, ac.engine.spool));
    const dead = ac.damage.engines.every((x) => x >= 1) || ac.totalFuel <= 0 || ac.carbCut > 0;
    // Hasarlı motor tekler (ara ara düşer)
    const worst = Math.max(...ac.damage.engines);
    const sputter = worst > 0.4 && Math.random() < worst * 0.15 ? 0.35 : 1;
    const duck = this.ctx.currentTime < this.duckUntil ? 0.2 : 1;
    const boost = ac.engine.wep || ac.engine.afterburner ? 1.15 : 1;
    const lvl = dead ? 0 : this.level * (0.55 + 0.45 * spool) * boost * sputter * duck;
    const rpm = ac.spec.engine.kind === 'jet' ? 0.8 + 0.3 * spool : 0.9 + 0.16 * spool + (ac.engine.wep ? 0.03 : 0);
    this.loop.set(h, lvl, this.baseRate * rpm * doppler);
    if (this.siren) {
      // Dalışa geçince açılır, hızlandıkça yükselir ve tizleşir (pervane rüzgârıyla dönen siren)
      const diving = ac.fwd.y < -0.5 ? Math.min(1, Math.max(0, (ac.speed - 60) / 70)) : 0;
      this.siren.set(h, 0.8 * diving * duck, Math.min(1.3, Math.max(0.5, 0.45 + (ac.speed - 60) / 160)) * doppler);
    }
  }

  stop(): void {
    this.loop.stop();
    this.siren?.stop();
  }
}

interface GunVoice {
  voice: LoopVoice;
  tail: SoundId;
  seen: number;
  h: Hearing;
}

export class BattleSound {
  private engines = new Map<number, EngineVoice>();
  private guns = new Map<string, GunVoice>();
  /** Yavaş atan ağır topların (GunSpec.standoff) son görülen mermi sayısı: "uçak:silah" → mermi. */
  private slowAmmo = new Map<string, number>();
  /** Yakın geçişi çalınan uçaklar: tekrar çalınabileceği an (bağlam saati). */
  private flybys = new Map<number, number>();
  private flybyEnds: number[] = [];
  private readonly camPos = new THREE.Vector3();
  private readonly camVel = new THREE.Vector3();
  private camera: THREE.PerspectiveCamera | null = null;
  private dist = 30000;
  private zoom = 0;
  private lastWorldTime = -1;
  private lastHit = 0;
  private frameNo = 0;
  /** Motor ve silah seslerinin son güncellendiği an (bağlam saati): saniyede ~30 kez yeterli. */
  private lastTick = 0;
  private open = -1;

  /** Dünya değişti (yeni oyun, kayıt yükleme, ana menü): bütün sürekli sesler susar. */
  reset(): void {
    for (const v of this.engines.values()) v.stop();
    this.engines.clear();
    for (const g of this.guns.values()) g.voice.stop(0.03);
    this.guns.clear();
    this.slowAmmo.clear();
    this.flybys.clear();
    this.lastWorldTime = -1;
  }

  /**
   * Her karede (render olayları tüketmeden önce). active: oyun akıyor ve oyun kipinde.
   * listener: takip edilen uçak (kamera onunla birlikte gider: Doppler ve yakın geçiş buna göre).
   * listenerVel: kendi başına hareket eden kameranın hızı (sinematik kayıt); verilirse listener'ınkinin yerine geçer.
   */
  frame(w: World, camera: THREE.PerspectiveCamera, camDist: number, active: boolean, timeScale: number,
    listener: Aircraft | null, visible: (ac: Aircraft) => boolean, listenerVel?: THREE.Vector3): void {
    const ctx = sound.ctx;
    // Hızlandırılmış zamanda savaş sesleri biraz kısılır (karışım kalabalıklaşır)
    const open = active ? (timeScale > 4 ? 0.7 : 1) : 0;
    if (open !== this.open && ctx) {
      this.open = open;
      sound.setWorldOpen(open);
    }
    if (!ctx || !active || !sound.audible('world')) {
      if (this.engines.size || this.guns.size) this.reset();
      this.lastWorldTime = w.time;
      this.zoom = 0;
      return;
    }
    this.camera = camera;
    this.camPos.copy(camera.position);
    if (listenerVel) this.camVel.copy(listenerVel);
    else if (listener) listener.velocity(this.camVel);
    else this.camVel.set(0, 0, 0);
    this.dist = camDist;
    this.zoom = camDist <= FULL_DIST ? 1 : Math.max(0, 1 - Math.log(camDist / FULL_DIST) / Math.log(MUTE_DIST / FULL_DIST));
    if (this.zoom <= 0) {
      if (this.engines.size || this.guns.size) this.reset();
      this.lastWorldTime = w.time;
      return;
    }
    // Olaylar her karede (render sonra siler); motor ve silahlar saniyede ~30 kez
    this.consume(w.events, w);
    if (ctx.currentTime - this.lastTick < 0.03) return;
    this.lastTick = ctx.currentTime;
    const since = this.lastWorldTime < 0 || this.lastWorldTime > w.time ? w.time : this.lastWorldTime;
    this.lastWorldTime = w.time;
    this.frameNo++;
    this.updateEngines(w, visible);
    this.updateGuns(w, visible, since);
    if (timeScale <= 2) this.updateFlybys(w, visible, listener, timeScale);
  }

  /** Bu noktadaki bir sesin savaş kanalında ne kadar duyulacağı (0 = duyulmaz: uyarılar uzak patlamayı kendisi çalar). */
  loudness(p: THREE.Vector3): number {
    if (!this.camera || this.zoom <= 0 || !sound.audible('world')) return 0;
    return this.hear(p, h0())?.gain ?? 0;
  }

  /** Sıkıştırılmış uzaklık: kameranın bakış uzaklığı ~150 m sayılır. */
  private compressed(p: THREE.Vector3): number {
    return (p.distanceTo(this.camPos) * 150) / Math.max(this.dist, 150);
  }

  /** Kaynağın duyulma düzeyi, boğukluğu, yönü; duyulmuyorsa null. */
  private hear(p: THREE.Vector3, out: Hearing): Hearing | null {
    const re = this.compressed(p);
    const g = (this.zoom * 150) / (150 + re);
    if (g < 0.004) return null;
    out.gain = g;
    out.lowpass = Math.max(450, 18000 * Math.exp(-re / 900)) * (0.4 + 0.6 * this.zoom);
    _v.copy(p).applyMatrix4(this.camera!.matrixWorldInverse);
    out.pan = (_v.x / (Math.hypot(_v.x, _v.z) + 30)) * 0.8;
    out.reverb = 0.12 + 0.45 * Math.min(1, re / 1500) + 0.25 * (1 - this.zoom);
    out.delay = Math.min(0.6, re / C_SOUND);
    return out;
  }

  /**
   * Doppler: kaynak ve dinleyicinin aradaki doğrultudaki hızları. Motor döngüsü durağan bir kayıt: tam kayma onu
   * hızlandırılmış bant gibi inceltir (dalan uçakta vızıltı). Kaymanın yarısı uygulanır, yakın geçişte gerçek geçiş
   * kaydı kendi Doppler'iyle çalar.
   */
  private doppler(ac: Aircraft): number {
    _v.subVectors(ac.pos, this.camPos);
    const d = _v.length();
    if (d < 1) return 1;
    _v.multiplyScalar(1 / d);
    ac.velocity(_w);
    const vs = _w.dot(_v);
    const vl = this.camVel.dot(_v);
    const full = (C_SOUND + vl) / (C_SOUND + vs);
    return Math.min(1.16, Math.max(0.87, 1 + (full - 1) * 0.5));
  }

  private updateEngines(w: World, visible: (ac: Aircraft) => boolean): void {
    const ctx = sound.ctx!;
    const cand: { ac: Aircraft; h: Hearing; score: number }[] = [];
    for (const ac of w.aircraft) {
      if (ac.status !== 'flying' || !visible(ac)) continue;
      const h = this.hear(ac.pos, h0());
      if (!h) continue;
      cand.push({ ac, h, score: h.gain * (ac.spec.engines > 1 ? 1.4 : 1) * (ac.onGround ? 0.6 : 1) });
    }
    cand.sort((a, b) => b.score - a.score);
    const keep = new Set<number>();
    for (let i = 0; i < cand.length && keep.size < MAX_ENGINES; i++) {
      const { ac, h } = cand[i];
      let v = this.engines.get(ac.id);
      if (!v) {
        const smp = sound.sample(engineSound(ac));
        if (!smp) continue;
        v = new EngineVoice(ctx, ac, smp, sound.bus('world')!, sound.reverbIn);
        this.engines.set(ac.id, v);
      }
      keep.add(ac.id);
      v.update(h, this.doppler(ac));
    }
    // Sıralama değişince ses sık sık kopup başlamasın: çalan sesler biraz daha geniş listede tutulur
    for (let i = MAX_ENGINES; i < Math.min(cand.length, MAX_ENGINES + 2); i++) {
      const v = this.engines.get(cand[i].ac.id);
      if (v) {
        keep.add(cand[i].ac.id);
        v.update(cand[i].h, this.doppler(cand[i].ac));
      }
    }
    for (const [id, v] of this.engines) {
      if (!keep.has(id)) {
        v.stop();
        this.engines.delete(id);
      }
    }
  }

  /** Uçak silahları, taretler ve uçaksavar mevzileri. */
  private updateGuns(w: World, visible: (ac: Aircraft) => boolean, since: number): void {
    const ctx = sound.ctx!;
    const now = ctx.currentTime;
    const firing: { key: string; snd: GunSound; h: Hearing }[] = [];
    for (const ac of w.aircraft) {
      if (ac.status !== 'flying' || !visible(ac)) continue;
      const turret = ac.turrets.some((t) => t.firing);
      if (!ac.firing && !turret) continue;
      const h = this.hear(ac.pos, h0());
      if (!h) continue;
      if (ac.firing) {
        const n: Partial<Record<GunClass, number>> = {};
        ac.guns.forEach((g, i) => {
          if (g.standoff) {
            // Yavaş atan ağır top (50 mm, saniyede 2,5 mermi): seri döngüsü yerine mermi başına tek vuruş (orta uçaksavar kaydı,
            // biraz pes). Mermi sayısı azaldıysa atmıştır; ilk görüldüğünde ateş ediyorsa ilk mermisi az önce çıkmıştır
            const key = `${ac.id}:${i}`;
            const was = this.slowAmmo.get(key) ?? ac.gunAmmo[i] + 1;
            if (ac.gunAmmo[i] < was) sound.play('aa_pom', 'world', { gain: h.gain * 1.1, rate: 0.84 + Math.random() * 0.05, lowpass: h.lowpass, pan: h.pan, reverb: h.reverb, when: now + h.delay * 0.5 });
            this.slowAmmo.set(key, ac.gunAmmo[i]);
            return;
          }
          if (ac.gunAmmo[i] > 0) n[gunClass(g)] = (n[gunClass(g)] ?? 0) + barrels(g);
        });
        for (const [cls, cnt] of Object.entries(n) as [GunClass, number][]) firing.push({ key: `${ac.id}:${cls}`, snd: gunSound(cls, cnt), h });
      }
      ac.turrets.forEach((t, i) => {
        if (!t.firing) return;
        const s = gunSound(gunClass(t.gun) === 'heavy' ? 'heavy' : 'small', 1);
        firing.push({ key: `${ac.id}:t${i}`, snd: { ...s, gain: 0.8 * Math.sqrt(barrels(t.gun)) }, h });
      });
    }
    // Uçaksavar: son ateşten beri geçen süre kısaysa seri sürüyor sayılır
    for (const s of w.structures) {
      if (!s.aa || s.destroyed) continue;
      const h = this.hear(s.pos, h0());
      if (!h) continue;
      s.aa.mounts.forEach((m, i) => {
        const wd = AA_WEAPONS[m.weapon];
        const fresh = m.lastFire > since && m.lastFire <= w.time;
        if (wd.kind === 'flak') {
          if (fresh) sound.play('aa_heavy', 'world', { gain: h.gain * (m.weapon === 'aa128' ? 1 : 0.85), rate: m.weapon === 'aa128' ? 0.85 : 0.95 + Math.random() * 0.1, lowpass: h.lowpass, pan: h.pan, reverb: h.reverb, when: now + h.delay * 0.5, important: true });
        } else if (wd.medium) {
          if (fresh) sound.play('aa_pom', 'world', { gain: h.gain, rate: m.weapon === 'aa40' ? 1 : 1.06, lowpass: h.lowpass, pan: h.pan, reverb: h.reverb });
        } else if (w.time - m.lastFire < 0.35) {
          const snd: GunSound = m.weapon === 'mg' ? { id: 'gun_hmg1', gain: 1, tail: 'tail_mg' }
            : m.weapon === 'aa20q' ? { id: 'gun_c20x4', gain: 1, tail: 'tail_can' } : { id: 'gun_c20x1', gain: 1, tail: 'tail_can' };
          firing.push({ key: `aa:${s.id}:${i}`, snd, h });
        }
      });
    }
    firing.sort((a, b) => b.h.gain * b.snd.gain - a.h.gain * a.snd.gain);
    for (let i = 0; i < firing.length && i < MAX_GUNS; i++) {
      const f = firing[i];
      let g = this.guns.get(f.key);
      if (!g) {
        const smp = sound.sample(f.snd.id);
        if (!smp) continue;
        g = { voice: new LoopVoice(ctx, smp, sound.bus('world')!, sound.reverbIn, f.h.reverb * 0.7, 0.005), tail: f.snd.tail, seen: 0, h: f.h };
        this.guns.set(f.key, g);
      }
      g.seen = this.frameNo;
      g.h = f.h;
      g.voice.set(f.h, f.snd.gain * (0.92 + Math.random() * 0.16), 1);
    }
    // Seri bitti: döngü hızla kısılır, yankı kuyruğu çalar
    for (const [k, g] of this.guns) {
      if (g.seen === this.frameNo) continue;
      g.voice.stop(0.025);
      sound.play(g.tail, 'world', { gain: g.h.gain, lowpass: g.h.lowpass, pan: g.h.pan, reverb: g.h.reverb });
      this.guns.delete(k);
    }
  }

  /**
   * Yakından geçen uçak: kameraya en yakın geleceği an ve uzaklık hesaplanır; yakın geçecekse tipine göre gerçek
   * geçiş kaydı, kaydın en gürültülü anı o ana denk gelecek şekilde çalar.
   */
  private updateFlybys(w: World, visible: (ac: Aircraft) => boolean, listener: Aircraft | null, timeScale: number): void {
    if (this.dist > 3500) return;
    const ctx = sound.ctx!;
    const now = ctx.currentTime;
    this.flybyEnds = this.flybyEnds.filter((t) => t > now);
    if (this.flybyEnds.length >= MAX_FLYBYS) return;
    const near = Math.max(220, this.dist * 0.3);
    for (const ac of w.aircraft) {
      if (ac === listener || ac.status !== 'flying' || ac.onGround || !visible(ac)) continue;
      if ((this.flybys.get(ac.id) ?? 0) > now) continue;
      _p.subVectors(ac.pos, this.camPos);
      ac.velocity(_v).sub(this.camVel);
      const vv = _v.lengthSq();
      if (vv < 40 * 40) continue;
      const tc = -_p.dot(_v) / vv;
      if (tc <= 0 || tc > 6) continue;
      _w.copy(_p).addScaledVector(_v, tc);
      if (_w.length() > near) continue;
      const smp = sound.sample(flybySound(ac));
      if (!smp) continue;
      const real = tc / timeScale;
      const lead = smp.peak - smp.loopStart;
      const offset = Math.max(0, lead - real);
      const when = now + Math.max(0, real - lead);
      _w.add(this.camPos);
      const h = this.hear(_w, h0());
      if (!h) continue;
      // Sağ-sol: şimdiki yönden en yakın andan 2 sn sonraki yöne kayar
      const pan0 = h.pan;
      _w.copy(_p).addScaledVector(_v, tc + 2).add(this.camPos);
      const pan1 = this.hear(_w, h0())?.pan ?? pan0;
      const src = sound.play(flybySound(ac), 'world', {
        gain: Math.min(1, h.gain * 1.3), offset, when, pan: pan0, panTo: pan1, panAt: now + real + 2, reverb: 0.15, important: true,
      });
      if (!src) continue;
      const end = when + (smp.loopEnd - smp.loopStart - offset);
      this.flybyEnds.push(end);
      this.flybys.set(ac.id, end + 4);
      const ev = this.engines.get(ac.id);
      if (ev) ev.duckUntil = end - 0.5;
      if (this.flybyEnds.length >= MAX_FLYBYS) return;
    }
  }

  /** Dünya olayları (patlama, flak, isabet, roket, yıkılan yapı). */
  private consume(events: SimEvent[], w: World): void {
    const now = sound.ctx!.currentTime;
    const h = h0();
    let flak = 0;
    for (const e of events) {
      const pos = e.kind === 'structureDestroyed' ? w.structureById(e.id)?.pos : e.kind === 'debris' || e.kind === 'groundHit' ? null : e.pos;
      if (!pos || !this.hear(pos, h)) continue;
      const far = this.compressed(pos) > 700;
      const base = { lowpass: h.lowpass, pan: h.pan, reverb: h.reverb, when: now + h.delay, important: true };
      switch (e.kind) {
        case 'airExplosion':
          sound.play('expl_air', 'world', { ...base, gain: h.gain * Math.min(1, 0.55 + e.size / 14), rate: (e.size > 12 ? 0.82 : 1) * (0.94 + Math.random() * 0.12) });
          break;
        case 'groundExplosion':
          sound.play(far ? 'expl_far' : 'expl_bomb', 'world', { ...base, gain: h.gain * Math.min(1, 0.4 + e.size / 70), rate: Math.min(1.2, Math.max(0.8, 1.25 - e.size / 120)) });
          break;
        case 'crash':
          sound.play(far ? 'expl_far' : 'expl_bomb', 'world', { ...base, gain: h.gain * 0.7, rate: 1.1 });
          break;
        case 'flak':
          // Aynı karede çok patlama: ilk birkaçı duyulsun
          if (flak++ > 3) break;
          sound.play('flak', 'world', { ...base, gain: h.gain * (e.size >= 1 ? 1 : 0.5), rate: (e.size >= 1 ? 1 : 1.3) * (0.92 + Math.random() * 0.16) });
          break;
        case 'hit': {
          // Yalnız yakında ve seyrek (çok isabette tıkırtı yağmuru olmasın)
          if (h.gain < 0.08 || now - this.lastHit < 0.035) break;
          this.lastHit = now;
          sound.play('hit', 'world', { ...base, gain: h.gain * 0.8, rate: 0.85 + Math.random() * 0.3, when: now });
          break;
        }
        case 'rocket':
          sound.play('rocket', 'world', { ...base, gain: h.gain, when: now });
          break;
        case 'structureDestroyed':
          sound.play('expl_huge', 'world', { ...base, gain: h.gain });
          break;
      }
    }
  }
}
