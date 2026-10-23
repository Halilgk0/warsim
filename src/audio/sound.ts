// Ses motoru: Web Audio bağlamı, kanallar (savaş, uyarı, arayüz), ses düzeyleri, açık hava yankısı ve kayıt bankası.
// Sesler gerçek kayıtlardan hazırlanmış kısa MP3'ler (public/sounds; künyesi credits.ts). Tarayıcı ilk dokunuştan önce
// ses çalmaz: bağlam ilk dokunuşta (ya da tuşta) kurulur, kayıtlar önem sırasıyla arka planda yüklenir (önce arayüz ve
// uyarılar). Sekme gizlenince durur.

import { reverbImpulse } from './reverb';
import { onSettingsChange, saveSettings, settings, type SoundLevel } from '../ui/settings';

export type Bus = 'world' | 'alerts' | 'ui';

/** Ses grupları: her grup bir ya da birkaç çeşit kayıttan rastgele çalar. */
const GROUPS = {
  click: ['ui_click'], tap: ['ui_tap'], place: ['ui_place'], error: ['ui_error'],
  siren: ['siren'], bell: ['bell'], typewriter: ['typewriter'], morse: ['morse'], bugle: ['bugle'], taps: ['taps'],
  eng_inline: ['eng_inline'], eng_radial: ['eng_radial'], eng_bomber: ['eng_bomber'], eng_jet: ['eng_jet'], stuka: ['stuka_siren'],
  gun_mg4: ['gun_mg4'], gun_mg1: ['gun_mg1'], gun_hmg4: ['gun_hmg4'], gun_hmg1: ['gun_hmg1'],
  gun_c20x1: ['gun_c20x1'], gun_c20x2: ['gun_c20x2'], gun_c20x4: ['gun_c20x4'], gun_c30x2: ['gun_c30x2'],
  tail_mg: ['gun_tail_mg'], tail_can: ['gun_tail_can'],
  aa_pom: ['aa_pom1', 'aa_pom2'], aa_heavy: ['aa_heavy1', 'aa_heavy2', 'aa_heavy3'],
  expl_bomb: ['expl_bomb1', 'expl_bomb2', 'expl_bomb3'], expl_far: ['expl_far1', 'expl_far2', 'expl_far3'],
  expl_air: ['expl_air1', 'expl_air2'], expl_huge: ['expl_huge'], flak: ['flak1', 'flak2', 'flak3'], hit: ['hit1', 'hit2'],
  rocket: ['rocket'],
  fly_inline: ['fly_inline1', 'fly_inline2', 'fly_inline3'], fly_radial: ['fly_radial1', 'fly_radial2'],
  fly_bomber: ['fly_bomber1', 'fly_bomber2'], fly_jet: ['fly_jet1', 'fly_jet2'],
} as const;
export type SoundId = keyof typeof GROUPS;

/** Yükleme sırası: önce az yer tutan ve hemen gereken sesler. */
const LOAD_ORDER: SoundId[] = [
  'click', 'tap', 'place', 'error', 'siren', 'bell', 'typewriter', 'morse', 'bugle', 'taps',
  'eng_inline', 'eng_radial', 'eng_bomber', 'eng_jet',
  'gun_mg4', 'gun_mg1', 'gun_hmg4', 'gun_hmg1', 'gun_c20x1', 'gun_c20x2', 'gun_c20x4', 'gun_c30x2', 'tail_mg', 'tail_can',
  'flak', 'aa_heavy', 'aa_pom', 'hit', 'expl_air', 'expl_bomb', 'expl_far', 'expl_huge', 'rocket', 'stuka',
  'fly_inline', 'fly_radial', 'fly_bomber', 'fly_jet',
];

/** Kayıtların karışımdaki payı (kayıtlar ayrı ayrı düzeylenmiş; algılanan yüksekliği eşitler). */
const BASE_GAIN: Record<SoundId, number> = {
  click: 0.45, tap: 0.5, place: 0.6, error: 0.55,
  siren: 0.6, bell: 0.5, typewriter: 0.6, morse: 0.55, bugle: 0.6, taps: 0.6,
  eng_inline: 1, eng_radial: 1, eng_bomber: 1, eng_jet: 1, stuka: 0.8,
  gun_mg4: 0.85, gun_mg1: 0.85, gun_hmg4: 0.85, gun_hmg1: 0.85, gun_c20x1: 0.85, gun_c20x2: 0.85, gun_c20x4: 0.85, gun_c30x2: 0.85,
  tail_mg: 0.7, tail_can: 0.7, aa_pom: 0.7, aa_heavy: 0.85,
  expl_bomb: 1, expl_far: 0.9, expl_air: 0.9, expl_huge: 1, flak: 0.85, hit: 0.45, rocket: 0.6,
  fly_inline: 0.9, fly_radial: 0.9, fly_bomber: 0.9, fly_jet: 0.9,
};

/** Aynı anda çalan tek seferlik savaş sesi sınırı (hızlandırılmış zamanda bile karışım boğulmasın). */
const MAX_ONESHOTS = 28;

interface ManifestEntry {
  /** Kaydın süresi (s). */
  len: number;
  loop: boolean;
  /** Geçiş seslerinde uçağın en yakın olduğu an (s). */
  peak?: number;
}

export interface Sample {
  buffer: AudioBuffer;
  /** Döngüde çalınacak bölge (MP3 kodlayıcısının başa eklediği sessizlik atlanır). */
  loopStart: number;
  loopEnd: number;
  peak: number;
}

export interface PlayOpts {
  /** Düzey çarpanı. */
  gain?: number;
  /** Çalma hızı (perde; 1 = özgün). */
  rate?: number;
  /** Sağ-sol (−1..1). */
  pan?: number;
  /** Sağ-sol bu değere panAt anına kadar kayar (yanından geçen uçak). */
  panTo?: number;
  panAt?: number;
  /** Alçak geçiren kesim frekansı (uzaklık boğuklaştırır). */
  lowpass?: number;
  /** Bağlam saatine göre başlama zamanı (s). */
  when?: number;
  /** Kaydın içinden başlama noktası (s). */
  offset?: number;
  /** Yankı payı (savaş sesleri). */
  reverb?: number;
  /** Eşzamanlı ses sınırına takılmasın (patlamalar; silah seslerine yer kalmasa da duyulur). */
  important?: boolean;
}

type AudioCtor = typeof AudioContext;

class SoundEngine {
  ctx: BaseAudioContext | null = null;
  /** Video kaydı: ses gerçek zamanda değil, kare kare (OfflineAudioContext) üretiliyor. */
  private offline = false;
  private master: GainNode | null = null;
  private readonly buses = {} as Record<Bus, GainNode>;
  /** Savaş kanalını duraklatmada ve ana menüde kısan kapı. */
  private gate: GainNode | null = null;
  /** Yankı girişi: savaş sesleri buraya da gönderilir. */
  reverbIn: GainNode | null = null;
  private readonly samples = new Map<string, Sample>();
  private active = 0;
  private lastUi = 0;

  /** İlk dokunuşta bağlamı kur ve aç; sayfadaki düğmelere tıklama sesi bağla. */
  install(): void {
    const unlock = (): void => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('click', (e) => this.uiClick(e), { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (!(this.ctx instanceof AudioContext)) return;
      if (document.visibilityState === 'hidden') void this.ctx.suspend();
      else void this.ctx.resume();
    });
    onSettingsChange(() => this.applyLevels());
  }

  private unlock(): void {
    if (!this.ctx) this.init();
    const ctx = this.ctx;
    if (ctx instanceof AudioContext && ctx.state !== 'running' && document.visibilityState === 'visible') void ctx.resume();
  }

  private init(): void {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    this.connect(ctx);
    void this.loadAll();
  }

  /**
   * Video kaydı: sesler verilen çevrimdışı bağlama çizilir (savaş kanalı açık). Kayıtlar ilk seferde yüklenir;
   * sonraki çekimlerde aynı kayıtlar kullanılır.
   */
  async startOffline(ctx: BaseAudioContext): Promise<void> {
    this.offline = true;
    this.active = 0;
    this.connect(ctx);
    this.gate!.gain.value = 1;
    if (!this.samples.size) await this.loadAll();
  }

  /** Kanallar, sıkıştırıcı ve yankı. */
  private connect(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    // Ana çıkış: sıkıştırıcı aynı anda çok patlamada bozulmayı önler, ardından düzey biraz yükseltilir
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const makeup = ctx.createGain();
    makeup.gain.value = 1.4;
    comp.connect(makeup);
    makeup.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    for (const b of ['world', 'alerts', 'ui'] as Bus[]) this.buses[b] = ctx.createGain();
    this.gate = ctx.createGain();
    this.gate.gain.value = 0;
    this.buses.world.connect(this.gate);
    this.gate.connect(this.master);
    this.buses.alerts.connect(this.master);
    this.buses.ui.connect(this.master);
    // Açık hava yankısı (savaş sesleri uzaktan yankılanır)
    const conv = ctx.createConvolver();
    const [l, r] = reverbImpulse(ctx.sampleRate);
    const ir = ctx.createBuffer(2, l.length, ctx.sampleRate);
    ir.getChannelData(0).set(l);
    ir.getChannelData(1).set(r);
    conv.buffer = ir;
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(conv);
    conv.connect(this.buses.world);
    this.applyLevels();
  }

  /** Kayıtları önem sırasıyla yükle (aynı anda birkaç tane). */
  private async loadAll(): Promise<void> {
    const base = `${import.meta.env.BASE_URL}sounds/`;
    let manifest: Record<string, ManifestEntry>;
    try {
      manifest = (await (await fetch(`${base}manifest.json`)).json()) as Record<string, ManifestEntry>;
    } catch {
      return;
    }
    const files = LOAD_ORDER.flatMap((g) => GROUPS[g] as readonly string[]).filter((f) => manifest[f]);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < files.length) {
        const name = files[next++];
        try {
          const data = await (await fetch(`${base}${name}.mp3`)).arrayBuffer();
          const buffer = await this.ctx!.decodeAudioData(data);
          this.samples.set(name, this.prepare(buffer, manifest[name]));
        } catch {
          // Bu ses yüklenemedi: çalınmaz
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  /**
   * MP3 çözücüsü kaydın başına kısa bir sessizlik ekleyebilir (tarayıcıya göre değişir): döngüler dikişsiz olsun diye
   * sesin başladığı yer bulunur, döngü bölgesi kaydın gerçek uzunluğu kadar alınır.
   */
  private prepare(buffer: AudioBuffer, m: ManifestEntry): Sample {
    const d = buffer.getChannelData(0);
    let lead = 0;
    const win = 32;
    const limit = Math.min(d.length - win, Math.round(buffer.sampleRate * 0.1));
    for (let i = 0; i < limit; i += win) {
      let s = 0;
      for (let j = i; j < i + win; j++) s += d[j] * d[j];
      if (s / win > 1e-7) break;
      lead = i + win;
    }
    const start = lead / buffer.sampleRate;
    const end = Math.min(buffer.duration, start + m.len);
    return { buffer, loopStart: start, loopEnd: end, peak: start + (m.peak ?? 0) };
  }

  /** Gruptan rastgele bir çeşit (yüklenmediyse null). */
  sample(id: SoundId): Sample | null {
    const names = GROUPS[id] as readonly string[];
    const ready = names.filter((n) => this.samples.has(n));
    if (!ready.length) return null;
    return this.samples.get(ready[Math.floor(Math.random() * ready.length)])!;
  }

  baseGain(id: SoundId): number {
    return BASE_GAIN[id];
  }

  private applyLevels(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const s = settings.sound;
    // Kaydırıcı algıya göre: düzeyin karesi
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master * s.master, now, 0.03);
    for (const b of ['world', 'alerts', 'ui'] as Bus[]) this.buses[b].gain.setTargetAtTime(s[b] * s[b], now, 0.03);
  }

  /** Sessize al / aç (üst çubuktaki düğme ve N tuşu). */
  toggleMute(): void {
    settings.sound.muted = !settings.sound.muted;
    saveSettings();
  }

  get muted(): boolean {
    return settings.sound.muted;
  }

  setLevel(id: SoundLevel, v: number): void {
    settings.sound[id] = Math.min(1, Math.max(0, v));
    this.applyLevels();
  }

  /** Savaş kanalı ne kadar açık (0 = duraklatıldı ya da ana menü). */
  setWorldOpen(open: number): void {
    if (!this.ctx || !this.gate) return;
    this.gate.gain.setTargetAtTime(open, this.ctx.currentTime, 0.12);
  }

  /** Bu kanal duyuluyor mu (kapalıysa ses hiç kurulmaz). */
  audible(bus: Bus): boolean {
    const s = settings.sound;
    return !!this.ctx && (this.offline || this.ctx.state === 'running') && !s.muted && s.master > 0 && s[bus] > 0;
  }

  bus(b: Bus): GainNode | null {
    return this.ctx ? this.buses[b] : null;
  }

  /** Tek seferlik ses çal; çalan kaynağı döndürür (geçiş seslerinde sonradan kısmak için). */
  play(id: SoundId, bus: Bus, o: PlayOpts = {}): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.audible(bus)) return null;
    if (bus === 'world' && !o.important && this.active >= MAX_ONESHOTS) return null;
    const smp = this.sample(id);
    if (!smp) return null;
    const src = ctx.createBufferSource();
    src.buffer = smp.buffer;
    if (o.rate) src.playbackRate.value = o.rate;
    let node: AudioNode = src;
    if (o.lowpass !== undefined && o.lowpass < 16000) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(80, o.lowpass);
      f.Q.value = 0.5;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.value = (o.gain ?? 1) * BASE_GAIN[id];
    node.connect(g);
    node = g;
    if ((o.pan || o.panTo !== undefined) && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      const clamp = (v: number): number => Math.min(1, Math.max(-1, v));
      p.pan.value = clamp(o.pan ?? 0);
      if (o.panTo !== undefined && o.panAt !== undefined) {
        p.pan.setValueAtTime(clamp(o.pan ?? 0), Math.max(o.when ?? 0, ctx.currentTime));
        p.pan.linearRampToValueAtTime(clamp(o.panTo), o.panAt);
      }
      node.connect(p);
      node = p;
    }
    node.connect(this.buses[bus]);
    if (o.reverb && this.reverbIn) {
      const send = ctx.createGain();
      send.gain.value = o.reverb;
      node.connect(send);
      send.connect(this.reverbIn);
    }
    if (bus === 'world') this.active++;
    const end = node;
    src.onended = () => {
      if (bus === 'world') this.active--;
      end.disconnect();
    };
    src.start(Math.max(o.when ?? 0, ctx.currentTime), smp.loopStart + Math.max(0, o.offset ?? 0));
    return src;
  }

  /** Düğme tıklaması: birincil düğmede daha tok bir şalter. Etiketli onay kutusu iki tıklama üretir: tekine ses. */
  private uiClick(e: Event): void {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('button, .mm-mapcard, .news-card, label.check, [data-sv]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const now = performance.now();
    if (now - this.lastUi < 60) return;
    this.lastUi = now;
    this.play(el.classList.contains('primary') ? 'tap' : 'click', 'ui');
  }
}

export const sound = new SoundEngine();
