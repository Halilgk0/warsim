// Takılma algılama (2026-11-20): harekât akarken gerçek kare aralıkları izlenir. 20 saniyelik dilimde saniyede ortalama 24
// karenin altına düşülür ya da karelerin dörtte birinden fazlası 70 ms'yi aşarsa (otomatik çözünürlük de yetmemiş demek)
// oyuncuya grafik ayarlarını düşürmesi önerilir; kabul ederse ayarlar Grafik sekmesinde, önerilen seçenek işaretli açılır
// (game.ts offerPerfHint). Sayılmaz: harekâtın ilk 30 sn'si (gölgelendirici derlemesi, dokular yükleniyor), pencere açıkken
// (arkadaki oyun iki karede bir çizilir), sekme gizliyken, öğretici adım gösterirken. Önerildikten sonra 10 dk susar;
// "Bir daha sorma" bu tarayıcıda kalır (warsim.perfHint). Önerecek bir şey kalmadıysa (her şey en düşükte) sormaz.

import { settings, type GraphicsQuality, type Resolution } from './ui/settings';

/**
 * Önerilen ayar: kalite ya da çözünürlük basamağı, ya da kapatılacak katman (k). fps: ölçülen ortalama; stutter: ortalama
 * yeterli ama kareler sık sık takılıyor.
 */
export interface PerfHint {
  set: 'quality' | 'resolution' | 'map';
  v?: string;
  k?: 'scenery' | 'effects';
  fps: number;
  stutter: boolean;
}

const KEY = 'warsim.perfHint';
/** Isınma (sn): harekât açılınca ilk kareler yavaş, sayılmaz. */
const WARM = 30;
/** Ölçüm dilimi (sn). */
const SPAN = 20;
/** Bu kare hızının altı takılma (saniyede kare). */
const MIN_FPS = 24;
/** Uzun kare (sn) ve dilimdeki en çok payı. */
const LONG = 0.07;
const LONG_SHARE = 0.25;
/** Öneriden sonra susma süresi (sn, gerçek zaman). */
const QUIET = 600;

export class PerfWatch {
  private warm = 0;
  private t = 0;
  private n = 0;
  private long = 0;
  private quiet = 0;

  /** Yeni harekât ya da kayıt: ısınma baştan. */
  reset(): void {
    this.warm = 0;
    this.t = 0;
    this.n = 0;
    this.long = 0;
  }

  /** Bir süre sorma (öneri gösterilince). */
  snooze(sec = QUIET): void {
    this.quiet = sec;
    this.t = 0;
    this.n = 0;
    this.long = 0;
  }

  /**
   * Her kare: raw gerçek kare aralığı (sn, kırpılmamış), counting: bu kare sayılır mı. Öneri zamanıysa öneriyi döndürür.
   */
  update(raw: number, counting: boolean): PerfHint | null {
    if (this.quiet > 0) this.quiet -= Math.min(raw, 1);
    // Sekmeye dönüş ya da donma (yarım saniyeden uzun kare) dilimi bozmasın
    if (!counting || raw <= 0 || raw > 0.5) return null;
    if (this.warm < WARM) {
      this.warm += raw;
      return null;
    }
    this.t += raw;
    this.n++;
    if (raw > LONG) this.long++;
    if (this.t < SPAN) return null;
    const fps = this.n / this.t;
    const share = this.long / this.n;
    this.t = 0;
    this.n = 0;
    this.long = 0;
    if (this.quiet > 0 || silenced() || (fps >= MIN_FPS && share <= LONG_SHARE)) return null;
    return suggest(fps, fps >= MIN_FPS);
  }
}

/** Bir daha sorma (bu tarayıcıda). */
export function silencePerfHint(): void {
  try {
    localStorage.setItem(KEY, '0');
  } catch {
    /* depolama kapalı: yalnız bu oturumda 10 dk susar */
  }
}

function silenced(): boolean {
  try {
    return localStorage.getItem(KEY) === '0';
  } catch {
    return false;
  }
}

/**
 * Bir basamak aşağısı: Yüksek → Orta (çok yavaşsa Düşük), Orta → Düşük; Düşükte çözünürlük %50, sonra ağaç ve yerleşimler,
 * sonra duman ve patlamalar kapalı. Hepsi en düşükteyse öneri yok.
 */
function suggest(fps: number, stutter: boolean): PerfHint | null {
  const g = settings.graphics;
  const q: GraphicsQuality = g.quality;
  if (q === 'high') return { set: 'quality', v: fps < 15 ? 'low' : 'medium', fps, stutter };
  if (q === 'medium') return { set: 'quality', v: 'low', fps, stutter };
  const res: Resolution = g.resolution;
  if (res !== '0.5') return { set: 'resolution', v: '0.5', fps, stutter };
  if (settings.map.scenery) return { set: 'map', k: 'scenery', fps, stutter };
  if (settings.map.effects) return { set: 'map', k: 'effects', fps, stutter };
  return null;
}
