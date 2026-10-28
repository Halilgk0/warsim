// Boş yolda otomatik 2×: oyuncu 1× seçmişken kollarından biri yalnız yoldaysa (toplanma, hedefe gidiş, dönüş) ve
// başka bir şey olmuyorsa oyun 2× akar. Görevde kol (devriye, bombardıman koşusu, taarruz, önleme), çatışan uçak,
// kalkış, iniş ya da kollarının ya da yapılarının yakınında bilinen düşman varsa 1× (hemen düşer; yeniden 2× için
// birkaç saniye sakinlik bekler). Yalnız oyuncunun bildiği düşmanlar sayılır: yavaşlamadan görünmeyen düşman sezilmesin.
// Oyuncu başka hız seçtiyse ona dokunulmaz.

import type { World } from './sim/world';

/** Boş yolda hız. */
export const AUTO_FAST = 2;
/** Kolun bu yakınında bilinen düşman: 1× (m). */
const NEAR_FLIGHT = 25000;
/** Yapının bu yakınında bilinen düşman (hava saldırısı sireniyle aynı): 1× (m). */
const NEAR_BASE = 35000;
/** 2×'e geçmeden önce sakinlik (gerçek s). */
const QUIET_SEC = 2;
/** Durum en çok bu aralıkla yeniden değerlendirilir (gerçek s). */
const CHECK_SEC = 0.25;

export class AutoFast {
  /** Şu an boş yol hızında. */
  active = false;
  /** Geçerli çarpan (yumuşak geçiş). */
  private scale = 1;
  private quiet = 0;
  private checkIn = 0;
  private cruising = false;

  /** Bu karenin oyun hızı. chosen: oyuncunun seçtiği hız. */
  update(w: World, team: number, chosen: number, real: number, enabled: boolean): number {
    if (!enabled || chosen !== 1) {
      this.active = false;
      this.quiet = 0;
      this.scale = chosen;
      return chosen;
    }
    this.checkIn -= real;
    if (this.checkIn <= 0) {
      this.checkIn = CHECK_SEC;
      this.cruising = cruising(w, team);
    }
    if (this.cruising) this.quiet += real;
    else this.quiet = 0;
    this.active = this.quiet >= QUIET_SEC;
    // Yükselirken yarım saniyede, düşerken hemen (çatışma gerçek hızda başlasın)
    const target = this.active ? AUTO_FAST : 1;
    this.scale = target > this.scale ? Math.min(target, this.scale + real * 2) : target;
    return this.scale;
  }
}

/** Oyuncunun kolları yalnız yolda mı (ve yakında bilinen düşman yok mu). */
function cruising(w: World, team: number): boolean {
  let onRoad = false;
  for (const f of w.flights) {
    if (f.team !== team || f.phase === 'done') continue;
    if (f.engaged) return false;
    switch (f.phase) {
      case 'formup':
      case 'enroute':
      case 'egress':
      case 'rtb':
        onRoad = true;
        break;
      case 'action':
        // Eskort: eşlik ettiği kol görevdeyse görevde, yoldaysa yolda
        if (f.plan.type === 'escort' && f.escortOf && f.escortOf.phase !== 'action' && !f.escortOf.engaged) onRoad = true;
        else return false;
        break;
      default:
        // Kalkış ve iniş gerçek hızda
        return false;
    }
  }
  if (!onRoad) return false;
  // Çatışan uçak ve oyuncunun kolları
  const mine = [];
  for (const a of w.aircraft) {
    if (a.team !== team || a.status !== 'flying') continue;
    if (a.brain.target || a.brain.threat) return false;
    if (a.flight && !a.onGround) mine.push(a.pos);
  }
  // Bilinen düşmanlar: radar ve gözcü temasları, kolların gördükleri
  const known = new Map<number, { x: number; z: number }>();
  for (const [id, c] of w.teams[team].intel.contacts) known.set(id, c.pos);
  for (const f of w.flights) {
    if (f.team !== team) continue;
    for (const id of f.contacts.keys()) {
      if (known.has(id)) continue;
      const e = w.aircraftById(id);
      if (e && e.status === 'flying') known.set(id, e.pos);
    }
  }
  if (!known.size) return true;
  const own = w.structures.filter((s) => s.team === team && !s.destroyed);
  for (const p of known.values()) {
    for (const q of mine) if (Math.hypot(p.x - q.x, p.z - q.z) < NEAR_FLIGHT) return false;
    for (const s of own) if (Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < NEAR_BASE) return false;
  }
  return true;
}
