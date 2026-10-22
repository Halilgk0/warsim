// Uyarı sesleri (gerçek kayıtlar): kamera nerede olursa olsun duyulan, oyuncuyu ilgilendiren olaylar.
// - Hava saldırısı sireni: düşman uçakları yapılarımıza yaklaşınca (radar ya da gözcü teması) ve son üs gidince.
// - Üs alarmı (elle çevrilen yangın zili): yapımız vurulunca. Yapı yıkılınca uzaktan gelen patlama.
// - Araştırma raporu: daktilo zili; uçak teslimi ve inşaat bitince daha pes zil.
// - Görev raporu telsizden Mors; zaferde süvari hücumu borazanı, yenilgide "Taps".
// Aynı uyarı art arda çalıp bıktırmasın diye bekleme süreleri gerçek zamanla.

import type { Vector3 } from 'three';
import type { World } from '../sim/world';
import { sound, type PlayOpts, type SoundId } from './sound';

/** Düşman yapılarımıza bu uzaklıkta görülünce siren (m). */
const RAID_RANGE = 35000;
/** Durum bu aralıkla yoklanır (ms). */
const POLL_MS = 250;

export class AlertSound {
  private world: World | null = null;
  private team = 0;
  private research = 0;
  private airframes = new Set<number>();
  private building = new Set<number>();
  private hp = new Map<number, number>();
  private destroyed = new Set<number>();
  private contacts = new Set<number>();
  private reportId = 0;
  private ended = false;
  private lastStand = false;
  private nextPoll = 0;
  private readonly until = new Map<string, number>();

  /** heard: bu noktadaki patlama savaş seslerinde ne kadar duyuluyor (yakındaysa uyarı ayrıca çalmaz). */
  private heard: (p: Vector3) => number = () => 0;

  update(w: World, team: number, heard: (p: Vector3) => number): void {
    this.heard = heard;
    const now = performance.now();
    if (w !== this.world || team !== this.team) {
      // Yeni oyun ya da kayıt: o anki durum sessizce kaydedilir (yüklenen oyunun eski olayları çalmasın)
      this.world = w;
      this.team = team;
      this.poll(w, true);
      this.nextPoll = now + POLL_MS;
      return;
    }
    if (now < this.nextPoll) return;
    this.nextPoll = now + POLL_MS;
    this.poll(w, false);
  }

  private fire(silent: boolean, id: SoundId, key: string, coolMs: number, o: PlayOpts = {}): void {
    if (silent) return;
    const now = performance.now();
    if ((this.until.get(key) ?? 0) > now) return;
    this.until.set(key, now + coolMs);
    sound.play(id, 'alerts', o);
  }

  private poll(w: World, silent: boolean): void {
    const t = w.teams[this.team];
    if (!t) return;

    const done = t.research.done.size;
    if (done > this.research) this.fire(silent, 'typewriter', 'research', 1500);
    this.research = done;

    // Yapılar: inşaat bitti, vuruldu, yıkıldı; hangarlara yeni uçak geldi
    const own = w.structures.filter((s) => s.team === this.team);
    const frames = new Set<number>();
    let delivered = false;
    let built = false;
    let hit = false;
    let lost = false;
    let lostFar = false;
    for (const s of own) {
      if (s.destroyed) {
        if (!this.destroyed.has(s.id) && this.hp.has(s.id)) {
          lost = true;
          if (this.heard(s.pos) < 0.12) lostFar = true;
        }
        this.destroyed.add(s.id);
        this.hp.delete(s.id);
        this.building.delete(s.id);
        continue;
      }
      if (s.build < 1) this.building.add(s.id);
      else if (this.building.delete(s.id)) built = true;
      const prev = this.hp.get(s.id);
      if (prev !== undefined && s.hp < prev - 0.5) hit = true;
      this.hp.set(s.id, s.hp);
      if (s.airbase) {
        for (const af of s.airbase.inventory) {
          frames.add(af.id);
          if (!this.airframes.has(af.id)) delivered = true;
        }
      }
    }
    this.airframes = frames;
    if (lost) {
      // Uzaktaysa yıkılışın sesi uyarı olarak gelir (yakındaysa savaş seslerinde zaten duyuluyor)
      if (lostFar) this.fire(silent, 'expl_far', 'lost', 3000, { gain: 0.7, lowpass: 1400 });
      this.fire(silent, 'bell', 'hit', 25000);
    } else if (hit) this.fire(silent, 'bell', 'hit', 25000);
    if (built) this.fire(silent, 'typewriter', 'built', 2500, { rate: 0.8, gain: 0.6 });
    if (delivered) this.fire(silent, 'typewriter', 'deliver', 2500, { rate: 0.9, gain: 0.6 });

    // Düşman yapılarımıza yaklaşıyor: yeni temaslardan biri bölgemizdeyse siren
    const seen = new Set<number>();
    let raid = false;
    for (const [id, c] of t.intel.contacts) {
      seen.add(id);
      if (this.contacts.has(id) || raid) continue;
      for (const s of own) {
        if (!s.destroyed && Math.hypot(c.pos.x - s.pos.x, c.pos.z - s.pos.z) < RAID_RANGE) {
          raid = true;
          break;
        }
      }
    }
    this.contacts = seen;
    if (raid) this.fire(silent, 'siren', 'raid', 120000);

    // Görev sonuçları
    for (const r of w.missionReports) {
      if (r.id <= this.reportId) continue;
      this.reportId = r.id;
      if (r.team !== this.team) continue;
      // Görev raporu telsizle gelir: başarısızlıkta daha pes, sonuçsuzda kısık
      if (r.outcome === 'success') this.fire(silent, 'morse', 'mission', 900);
      else if (r.outcome === 'fail') this.fire(silent, 'morse', 'mission', 900, { rate: 0.84 });
      else this.fire(silent, 'morse', 'mission', 900, { rate: 0.92, gain: 0.6 });
    }

    // Son üs gitti: siren; harekât sonu: zafer ya da yenilgi borazanı
    const stand = t.lastStand !== null && !t.eliminated;
    if (stand && !this.lastStand) this.fire(silent, 'siren', 'raid', 0);
    this.lastStand = stand;
    const ended = w.winner !== null || t.eliminated;
    if (ended && !this.ended) this.fire(silent, w.winner === this.team ? 'bugle' : 'taps', 'end', 5000);
    this.ended = ended;
  }
}
