// Pilot alışkanlıkları (2026-11-18): kolun uçakları aynı işi biraz farklı yapar. Formasyonda istasyon tutarken yavaşça
// salınır, liderin dönüşüne kendi gecikmesiyle uyar, çatışmaya kendi tepki süresiyle girer; taarruzda elemanlar hedefe
// farklı yönlerden ve düzensiz aralıklarla girer. Eskiden kol liderin her hareketini aynı anda ve milimetrik kopyalıyor,
// taarruzda herkes aynı yönden, tam 3,5 saniye arayla dalıyordu ("robot gibi", "kuyruk gibi").
//
// Değerler uçak kimliğinden türer (inişteki LandingStyle gibi): kayıt kipinde tekrarlanabilir, ortak Math.random akışına
// dokunmaz.

import type { Aircraft } from '../aircraft/aircraft';
import { mulberry32 } from '../../core/math';

export interface Habit {
  /** İstasyon salınımı: yanal ve boyuna genlik (formasyon aralığının katı), dikey genlik (m). */
  sr: number;
  sb: number;
  su: number;
  /** Salınım periyotları (s) ve evreleri. */
  wr: number;
  wb: number;
  wu: number;
  pr: number;
  pb: number;
  pu: number;
  /** Liderin yön değişimine uyma süresi (s, üstel). */
  lag: number;
  /** Hedef atanınca formasyondan kopma gecikmesi (s). */
  react: number;
  /** Taarruz: yaklaşma yönü sapması (rad) ve kendisinden sonraki geçişe kadar aralık çarpanı. */
  attackYaw: number;
  attackGap: number;
}

const cache = new WeakMap<Aircraft, Habit>();

export function habitOf(ac: Aircraft): Habit {
  let h = cache.get(ac);
  if (h) return h;
  const r = mulberry32((ac.id * 2246822519 + 3266489917) >>> 0);
  const between = (a: number, b: number) => a + (b - a) * r();
  h = {
    sr: between(0.06, 0.16),
    sb: between(0.1, 0.26),
    su: between(3, 10),
    wr: between(22, 55),
    wb: between(30, 70),
    wu: between(18, 45),
    pr: between(0, 6.28),
    pb: between(0, 6.28),
    pu: between(0, 6.28),
    lag: between(0.5, 1.8),
    react: between(0.4, 2.2),
    attackYaw: between(-0.14, 0.14),
    attackGap: between(0.75, 1.35),
  };
  cache.set(ac, h);
  return h;
}

/**
 * Taarruzda elemanın yaklaşma yönü sapması (rad): 1. eleman kolun yönünden, 2. sağdan, 3. soldan, 4. daha geniş sağdan
 * girer (uçaksavar ateşi bölünür; Il-2 ve Typhoon birlikleri hedefe tek sıra hâlinde değil, kollara ayrılıp girerdi).
 * Kanat adamı eleman liderinin yönünü izler.
 */
export function attackYawOf(ac: Aircraft): number {
  const elem = Math.floor(Math.max(0, ac.slot) / 2);
  return [0, 0.6, -0.6, 1.05][elem % 4] + habitOf(ac).attackYaw;
}

const TAU = Math.PI * 2;

/** Formasyon istasyonuna eklenen salınım (m). tight: savaş kutusu gibi sıkı düzende genliği küçültür. */
export function stationDrift(ac: Aircraft, time: number, spacing: number, tight: number, out: { right: number; back: number; up: number }): void {
  const h = habitOf(ac);
  const s = (w: number, p: number) => Math.sin((time / w) * TAU + p) * 0.7 + Math.sin((time / (w * 0.37)) * TAU + p * 1.7) * 0.3;
  out.right += spacing * h.sr * tight * s(h.wr, h.pr);
  out.back += spacing * h.sb * tight * s(h.wb, h.pb);
  out.up += h.su * tight * s(h.wu, h.pu);
}
