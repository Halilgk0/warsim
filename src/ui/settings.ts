// Ayarlar: ses düzeyleri, haritada ne çizileceği, bilgi panelinde hangi değerlerin görüneceği, günlük filtreleri.
// Tarayıcıda saklanır (yalnız bu tarayıcıya özel tercih).

import type { LogCategory } from '../sim/world';
import { L } from '../i18n';

export type InfoField =
  | 'flight' | 'mission' | 'status' | 'speed' | 'alt' | 'agl' | 'g' | 'heading' | 'attitude'
  | 'throttle' | 'fuel' | 'mass' | 'ammo' | 'stores' | 'damage' | 'pilot' | 'kills';

export const INFO_FIELDS: { id: InfoField; name: string }[] = [
  { id: 'flight', name: L('Kol ve formasyon', 'Flight and formation') },
  { id: 'mission', name: L('Görev ve aşama', 'Mission and phase') },
  { id: 'status', name: L('Anlık davranış', 'Current behaviour') },
  { id: 'speed', name: L('Hız (gerçek, gösterge, Mach)', 'Speed (true, indicated, Mach)') },
  { id: 'alt', name: L('İrtifa (deniz)', 'Altitude (sea level)') },
  { id: 'agl', name: L('Yerden yükseklik', 'Height above ground') },
  { id: 'g', name: L('Yük (G)', 'Load (G)') },
  { id: 'heading', name: L('Yön', 'Heading') },
  { id: 'attitude', name: L('Yatış / yunuslama', 'Bank / pitch') },
  { id: 'throttle', name: L('Gaz, flap, fren', 'Throttle, flaps, brakes') },
  { id: 'fuel', name: L('Yakıt', 'Fuel') },
  { id: 'mass', name: L('Anlık kütle', 'Current mass') },
  { id: 'ammo', name: L('Mühimmat', 'Ammo') },
  { id: 'stores', name: L('Dış yük', 'Stores') },
  { id: 'damage', name: L('Hasar ayrıntısı', 'Damage details') },
  { id: 'pilot', name: L('Pilot', 'Pilot') },
  { id: 'kills', name: L('Düşürülen', 'Kills') },
];

export type MapLayer =
  | 'scenery' | 'labels' | 'icons' | 'trails' | 'dropLines' | 'shadows' | 'tracers' | 'effects' | 'routes'
  | 'aaRanges' | 'radarCoverage' | 'fogOfWar' | 'contacts';

export const MAP_LAYERS: { id: MapLayer; name: string; desc: string }[] = [
  { id: 'scenery', name: L('Ağaç, kaya ve yerleşimler', 'Trees, rocks and settlements'), desc: L('Orman, kaya, yol, köy ve dekor şehirleri (yavaş bilgisayarda kapat)', 'Forests, rocks, roads, villages and scenery towns (turn off on slow computers)') },
  { id: 'labels', name: L('Uçak etiketleri', 'Aircraft labels'), desc: L('Çağrı adı ve tip', 'Callsign and type') },
  { id: 'icons', name: L('Uzak görünüm simgeleri', 'Distant view icons'), desc: L('Uzaklaşınca uçaklar takım renginde okla gösterilir', 'When zoomed out, aircraft show as arrows in team colours') },
  { id: 'trails', name: L('Uçuş izleri', 'Flight trails'), desc: L('Son ~10 saniyelik yol', 'The last ~10 seconds of the path') },
  { id: 'dropLines', name: L('İrtifa çizgileri', 'Altitude lines'), desc: L('Uçaktan yere dikey çizgi', 'A vertical line from aircraft to ground') },
  { id: 'shadows', name: L('Gölgeler', 'Shadows'), desc: L('Uçağın yerdeki gölgesi', 'The aircraft\'s shadow on the ground') },
  { id: 'tracers', name: L('Mermi izleri', 'Tracers'), desc: L('Uçak ve uçaksavar mermileri', 'Aircraft and flak rounds') },
  { id: 'effects', name: L('Duman ve patlamalar', 'Smoke and explosions'), desc: '' },
  { id: 'routes', name: L('Görev rotaları', 'Mission routes'), desc: L('Seçili kolun rotası ve hedefi', 'Route and target of the selected flight') },
  { id: 'aaRanges', name: L('Uçaksavar menzilleri', 'Flak ranges'), desc: L('Kendi mevzilerinin etkili menzili', 'Effective range of your own batteries') },
  { id: 'radarCoverage', name: L('Radar kapsaması', 'Radar coverage'), desc: L('Seçilen irtifada radarın görebildiği alan', 'The area radar can see at the chosen height') },
  { id: 'contacts', name: L('Radar temas işaretleri', 'Radar contact markers'), desc: L('Radarın gördüğü düşmanlar', 'Enemies seen by radar') },
  { id: 'fogOfWar', name: L('Savaş sisi', 'Fog of war'), desc: L('Görülmeyen düşman uçaklarını gizle', 'Hide enemy aircraft that nobody has spotted') },
];

export const LOG_CATEGORIES: { id: LogCategory; name: string }[] = [
  { id: 'kill', name: L('Düşürmeler', 'Kills') },
  { id: 'combat', name: L('Çatışma ve hasar', 'Combat and damage') },
  { id: 'strike', name: L('Bombalama ve isabetler', 'Bombing and hits') },
  { id: 'ops', name: L('Kalkış, iniş, kollar', 'Takeoffs, landings, flights') },
  { id: 'defense', name: L('Hava savunma', 'Air defence') },
  { id: 'build', name: L('İnşaat ve üretim', 'Construction and production') },
  { id: 'research', name: L('Araştırma', 'Research') },
  { id: 'info', name: L('Genel', 'General') },
];

export type GraphicsQuality = 'low' | 'medium' | 'high';
/** Çözünürlük: otomatik ya da cihaz piksel oranının katı. */
export type Resolution = 'auto' | '1' | '0.75' | '0.5';

/** Kalite basamakları: telefon kare hızına göre ağır görsellerin uzaklığı ve yoğunluğu. */
export interface QualityPreset {
  name: string;
  /** Ağaçlar: tam model yarıçapı, sık taç yarıçapı, sönme aralığı (m, kameraya). */
  treeNear: number;
  treeThin: number;
  treeFade: [number, number];
  /** Köy ve dekor şehirleri görünme yarıçapı (m). */
  settle: number;
  /** Duman/ateş parçacığı üst sınırı. */
  puffs: number;
  /** Bulut sayısı çarpanı (0: bulut yok). */
  clouds: number;
  /** Deniz: dalga ve yansıma. */
  water: boolean;
  /** Uçak ve yapı modelleri: 0 low-poly, 1 yüksek çözünürlük ve ayrıntılı doku. */
  models: number;
  /**
   * Arazinin yakın ayrıntısı (tarla izleri, orman benekleri, kaya katmanları): 0 kapalı, 1 açık. Ekran kartı
   * süresinin %30–60'ı (2026-10-27 ölçümü); Orta bu yüzden kapalı.
   */
  ground: number;
}

export const QUALITY: Record<GraphicsQuality, QualityPreset> = {
  low: { name: L('Düşük', 'Low'), treeNear: 500, treeThin: 1200, treeFade: [2500, 4500], settle: 6000, puffs: 1500, clouds: 0, water: false, models: 0, ground: 0 },
  medium: { name: L('Orta', 'Medium'), treeNear: 800, treeThin: 1600, treeFade: [3500, 5500], settle: 7000, puffs: 2500, clouds: 0.5, water: true, models: 1, ground: 0 },
  high: { name: L('Yüksek', 'High'), treeNear: 1300, treeThin: 2500, treeFade: [5500, 8500], settle: 10000, puffs: 5000, clouds: 1, water: true, models: 1, ground: 1 },
};

export const RESOLUTIONS: { id: Resolution; name: string }[] = [
  { id: 'auto', name: L('Otomatik', 'Auto') },
  { id: '1', name: L('Tam', 'Full') },
  { id: '0.75', name: '%75' },
  { id: '0.5', name: '%50' },
];

export type SoundLevel = 'master' | 'world' | 'alerts' | 'ui';

export const SOUND_LEVELS: { id: SoundLevel; name: string; desc: string }[] = [
  { id: 'master', name: L('Genel ses', 'Master volume'), desc: '' },
  { id: 'world', name: L('Savaş sesleri', 'Battle sounds'), desc: L('Motor, silah, uçaksavar, patlama (yakınlaştıkça duyulur)', 'Engines, guns, flak, explosions (heard as you zoom in)') },
  { id: 'alerts', name: L('Uyarılar', 'Alerts'), desc: L('Hava saldırısı sireni, üs alarmı, araştırma ve görev sonuçları', 'Air raid siren, base alarm, research and mission results') },
  { id: 'ui', name: L('Arayüz', 'Interface'), desc: L('Düğme tıklamaları', 'Button clicks') },
];

export interface Settings {
  /** Ses düzeyleri (0..1) ve sessiz kip. */
  sound: Record<SoundLevel, number> & { muted: boolean };
  map: Record<MapLayer, boolean>;
  info: Record<InfoField, boolean>;
  log: Record<LogCategory, boolean>;
  /** Radar kapsama katmanının hesaplandığı yerden yükseklik (m). */
  radarAgl: number;
  /** İz mermisi kalınlık çarpanı. */
  tracerScale: number;
  /** Grafik kalitesi ve çözünürlük. */
  graphics: { quality: GraphicsQuality; resolution: Resolution; dayCycle: boolean; clouds: boolean };
  /** Oyun: boş yolda otomatik 2× (autoFast.ts). */
  game: { autoFast: boolean };
}

const KEY = 'warsim.settings.v2';

function defaults(): Settings {
  const map = Object.fromEntries(MAP_LAYERS.map((l) => [l.id, true])) as Record<MapLayer, boolean>;
  map.radarCoverage = false;
  map.fogOfWar = false;
  map.aaRanges = false;
  return {
    sound: { master: 0.9, world: 0.9, alerts: 0.85, ui: 0.6, muted: false },
    map,
    info: Object.fromEntries(INFO_FIELDS.map((f) => [f.id, true])) as Record<InfoField, boolean>,
    log: Object.fromEntries(LOG_CATEGORIES.map((c) => [c.id, true])) as Record<LogCategory, boolean>,
    radarAgl: 300,
    tracerScale: 1,
    // Varsayılan düşük kalite: zayıf telefonda da akıcı açılır; güçlü cihazda oyuncu Yüksek'e alır
    graphics: { quality: 'low', resolution: 'auto', dayCycle: true, clouds: true },
    game: { autoFast: true },
  };
}

function load(): Settings {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: { ...d.sound, ...(s.sound ?? {}) },
      map: { ...d.map, ...(s.map ?? {}) },
      info: { ...d.info, ...(s.info ?? {}) },
      log: { ...d.log, ...(s.log ?? {}) },
      radarAgl: s.radarAgl ?? d.radarAgl,
      tracerScale: s.tracerScale ?? d.tracerScale,
      graphics: {
        quality: s.graphics?.quality && s.graphics.quality in QUALITY ? s.graphics.quality : d.graphics.quality,
        resolution: RESOLUTIONS.some((r) => r.id === s.graphics?.resolution) ? s.graphics!.resolution : d.graphics.resolution,
        dayCycle: typeof s.graphics?.dayCycle === 'boolean' ? s.graphics.dayCycle : d.graphics.dayCycle,
        clouds: typeof s.graphics?.clouds === 'boolean' ? s.graphics.clouds : d.graphics.clouds,
      },
      game: { autoFast: typeof s.game?.autoFast === 'boolean' ? s.game.autoFast : d.game.autoFast },
    };
  } catch {
    return d;
  }
}

/** Telefonda bir kerelik grafik sıfırlaması yapıldı mı (yeni anahtar; ayarların kendisi KEY'de). */
const PHONE_KEY = 'warsim.phoneLow';

/**
 * Telefonda (dokunmatik, kısa kenarı 600 px'ten küçük) bir kez: grafik Düşük, çözünürlük otomatik. Varsayılan Düşük
 * yalnız yeni oyunculara geçiyordu; eski kayıtlı Yüksek ayarla telefonda kasanlar için. Sonra oyuncu istediğini seçer.
 */
function phoneOnce(s: Settings): Settings {
  try {
    const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
    if (!phone || localStorage.getItem(PHONE_KEY)) return s;
    localStorage.setItem(PHONE_KEY, '1');
    s.graphics.quality = 'low';
    s.graphics.resolution = 'auto';
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* başsız simülasyon ya da depolama kapalı */
  }
  return s;
}

export const settings: Settings = phoneOnce(load());

/** Geçerli kalite basamağı. */
export function quality(): QualityPreset {
  return QUALITY[settings.graphics.quality];
}

const listeners: (() => void)[] = [];

export function onSettingsChange(fn: () => void): void {
  listeners.push(fn);
}

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* gizli pencere vb.: yalnız bu oturumda geçerli */
  }
  for (const fn of listeners) fn();
}
