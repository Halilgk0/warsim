// Ayarlar: ses düzeyleri, haritada ne çizileceği, bilgi panelinde hangi değerlerin görüneceği, günlük filtreleri.
// Tarayıcıda saklanır (yalnız bu tarayıcıya özel tercih).

import type { LogCategory } from '../sim/world';

export type InfoField =
  | 'flight' | 'mission' | 'status' | 'speed' | 'alt' | 'agl' | 'g' | 'heading' | 'attitude'
  | 'throttle' | 'fuel' | 'mass' | 'ammo' | 'stores' | 'damage' | 'pilot' | 'kills';

export const INFO_FIELDS: { id: InfoField; name: string }[] = [
  { id: 'flight', name: 'Kol ve formasyon' },
  { id: 'mission', name: 'Görev ve aşama' },
  { id: 'status', name: 'Anlık davranış' },
  { id: 'speed', name: 'Hız (gerçek, gösterge, Mach)' },
  { id: 'alt', name: 'İrtifa (deniz)' },
  { id: 'agl', name: 'Yerden yükseklik' },
  { id: 'g', name: 'Yük (G)' },
  { id: 'heading', name: 'Yön' },
  { id: 'attitude', name: 'Yatış / yunuslama' },
  { id: 'throttle', name: 'Gaz, flap, fren' },
  { id: 'fuel', name: 'Yakıt' },
  { id: 'mass', name: 'Anlık kütle' },
  { id: 'ammo', name: 'Mühimmat' },
  { id: 'stores', name: 'Dış yük' },
  { id: 'damage', name: 'Hasar ayrıntısı' },
  { id: 'pilot', name: 'Pilot' },
  { id: 'kills', name: 'Düşürülen' },
];

export type MapLayer =
  | 'scenery' | 'labels' | 'icons' | 'trails' | 'dropLines' | 'shadows' | 'tracers' | 'effects' | 'routes'
  | 'aaRanges' | 'radarCoverage' | 'fogOfWar' | 'contacts';

export const MAP_LAYERS: { id: MapLayer; name: string; desc: string }[] = [
  { id: 'scenery', name: 'Ağaç, kaya ve yerleşimler', desc: 'Orman, kaya, yol, köy ve dekor şehirleri (yavaş bilgisayarda kapat)' },
  { id: 'labels', name: 'Uçak etiketleri', desc: 'Çağrı adı ve tip' },
  { id: 'icons', name: 'Uzak görünüm simgeleri', desc: 'Uzaklaşınca uçaklar takım renginde okla gösterilir' },
  { id: 'trails', name: 'Uçuş izleri', desc: 'Son ~10 saniyelik yol' },
  { id: 'dropLines', name: 'İrtifa çizgileri', desc: 'Uçaktan yere dikey çizgi' },
  { id: 'shadows', name: 'Gölgeler', desc: 'Uçağın yerdeki gölgesi' },
  { id: 'tracers', name: 'Mermi izleri', desc: 'Uçak ve uçaksavar mermileri' },
  { id: 'effects', name: 'Duman ve patlamalar', desc: '' },
  { id: 'routes', name: 'Görev rotaları', desc: 'Seçili kolun rotası ve hedefi' },
  { id: 'aaRanges', name: 'Uçaksavar menzilleri', desc: 'Kendi mevzilerinin etkili menzili' },
  { id: 'radarCoverage', name: 'Radar kapsaması', desc: 'Seçilen irtifada radarın görebildiği alan' },
  { id: 'contacts', name: 'Radar temas işaretleri', desc: 'Radarın gördüğü düşmanlar' },
  { id: 'fogOfWar', name: 'Savaş sisi', desc: 'Görülmeyen düşman uçaklarını gizle' },
];

export const LOG_CATEGORIES: { id: LogCategory; name: string }[] = [
  { id: 'kill', name: 'Düşürmeler' },
  { id: 'combat', name: 'Çatışma ve hasar' },
  { id: 'strike', name: 'Bombalama ve isabetler' },
  { id: 'ops', name: 'Kalkış, iniş, kollar' },
  { id: 'defense', name: 'Hava savunma' },
  { id: 'build', name: 'İnşaat ve üretim' },
  { id: 'research', name: 'Araştırma' },
  { id: 'info', name: 'Genel' },
];

export type SoundLevel = 'master' | 'world' | 'alerts' | 'ui';

export const SOUND_LEVELS: { id: SoundLevel; name: string; desc: string }[] = [
  { id: 'master', name: 'Genel ses', desc: '' },
  { id: 'world', name: 'Savaş sesleri', desc: 'Motor, silah, uçaksavar, patlama (yakınlaştıkça duyulur)' },
  { id: 'alerts', name: 'Uyarılar', desc: 'Hava saldırısı sireni, üs alarmı, araştırma ve görev sonuçları' },
  { id: 'ui', name: 'Arayüz', desc: 'Düğme tıklamaları' },
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
    };
  } catch {
    return d;
  }
}

export const settings: Settings = load();

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
