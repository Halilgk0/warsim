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
import type { Caliber } from '../aircraft/specs';
import type { Research } from '../tech';
import { lineOfSight } from '../terrain';
import { visibility } from '../ai/perception';
import { DEG, G, gauss, rand } from '../../core/math';
import { L, lower } from '../../i18n';

const NEED_RESEARCH = L('Araştırma gerekli', 'Research required');
const BUSY = L('Başka iş sürüyor', 'Another job is in progress');

export type AAWeaponId = 'mg' | 'aa20' | 'oerlikon' | 'aa20q' | 'aa37' | 'aa40' | 'aa88' | 'aa90' | 'aa41' | 'aa128';

/** Hangardaki sınıf. */
export type AAClass = 'hafif' | 'orta' | 'agir';

export const AA_CLASS_NAMES: Record<AAClass, { name: string; sub: string }> = {
  hafif: { name: L('Hafif', 'Light'), sub: L('makineli, 20 mm', 'machine gun, 20 mm') },
  orta: { name: L('Orta', 'Medium'), sub: '37–40 mm' },
  agir: { name: L('Ağır', 'Heavy'), sub: '88–128 mm' },
};

export const AA_CLASS_ORDER: AAClass[] = ['hafif', 'orta', 'agir'];

export interface AAWeaponDef {
  id: AAWeaponId;
  name: string;
  short: string;
  cls: AAClass;
  /** Hangardaki kısa tanıtım: kaynaklı bilgi ve oyundaki davranış. */
  desc: string;
  /** Şarjör yerine tarak. */
  clip?: boolean;
  /** Şarjör yerine tambur. */
  drum?: boolean;
  /** Namlu sayısı (birden çoksa). Şarjör toplamdır. */
  barrels?: number;
  /** Ülke (anahtar, ekranda originName ile çevrilir) ve hizmete giriş yılı. */
  origin: string;
  year: number;
  /** Kalibre (mm) ve mermi kütlesi (kg): sürüklenme bunlardan. */
  bore: number;
  shellKg: number;
  /** Merminin biçim katsayısı (yoksa SHELL_DRAG). */
  dragC?: number;
  /** Şarjör ya da tarak (0: kayış, durmaz) ve değiştirme süresi (sn, eğitimli mürettebat). */
  mag: number;
  reload: number;
  /** Zaman tapalı topta patlama hatası çarpanı: oyun dengesi (yoksa 1). */
  aim?: number;
  /** Top başına mürettebat (kaynağı doğrulanmadıysa yok). */
  crew?: number;
  requires: string | null;
  /** Eğik menzil (m). */
  range: number;
  /** Mevzinin üstünde etkili tavan (m). */
  ceiling: number;
  /** Saniyedeki atış: seri hızı. Ağır topta pratik hız. */
  rate: number;
  muzzleVel: number;
  damage: number;
  dispersion: number;
  kind: 'tracer' | 'flak';
  /** Kendini imha / zaman tapası parçacık yarıçapı. 0 = yalnız doğrudan isabet. */
  burstRadius: number;
  caliber: Caliber;
  installTime: number;
  rank: number;
  /** Orta/ağır top (hesaplayıcı ve yakınlık tapasından yararlanır). */
  medium: boolean;
  /** Kurulum maliyeti (kr). */
  cost: number;
  /** Namlu dönüş hızı (°/sn): elle çevrilen ağır top yavaş, hafif top ve makineli hızlı. */
  slew: number;
}

export const AA_WEAPONS: Record<AAWeaponId, AAWeaponDef> = {
  // M2 Browning, su soğutmalı uçaksavar: dakikada 450–600 atış, 1.800 m etkili; sivri mermi az yavaşlar
  mg: {
    id: 'mg', name: L('M2 Browning 12,7 mm', 'M2 Browning 12.7 mm'), short: L('12,7 mm', '12.7 mm'), requires: null, range: 1800, ceiling: 1800, cls: 'hafif',
    desc: L('Amerikan ağır makinelisinin su soğutmalı uçaksavar biçimi. Kayışla beslenir, durmadan atar; ama küçük mermisi zırhlı taarruz uçağına az işler.',
      'The water-cooled anti-aircraft form of the American heavy machine gun. Belt-fed, it fires without pause, but its small bullet does little to an armoured attacker.'),
    origin: 'ABD', year: 1933, bore: 12.7, shellKg: 0.046, dragC: 0.17, mag: 0, reload: 0,
    rate: 8.75, muzzleVel: 890, damage: 1.4, dispersion: 0.012, kind: 'tracer', burstRadius: 0, caliber: 'heavy',
    installTime: 20, rank: 1, medium: false, cost: 300, slew: 60,
  },
  // 2 cm Flak 38: dakikada 450 seri, ~200 pratik; 20'lik şarjör; izli mermi 6 sn'de (~2.200 m) kendini imha eder
  aa20: {
    id: 'aa20', name: L('2 cm Flak 38', '2 cm Flak 38'), short: '20 mm', requires: 'hd_20', range: 2200, ceiling: 2200, cls: 'hafif',
    desc: L('Almanların en çok kullandığı hafif uçaksavar topu. 20’lik şarjörü üç saniyede boşaltır, sonra mürettebat şarjör değiştirir. İzli mermisi 6 saniyede kendini imha eder.',
      'The most widely used German light flak gun. It empties its 20-round magazine in under three seconds, then the crew changes it. Its tracer self-destructs after 6 seconds.'),
    origin: 'Almanya', year: 1939, bore: 20, shellKg: 0.12, mag: 20, reload: 3.3, crew: 5,
    rate: 7.5, muzzleVel: 900, damage: 6, dispersion: 0.01, kind: 'tracer', burstRadius: 0, caliber: 'cannon',
    installTime: 30, rank: 2, medium: false, cost: 850, slew: 45,
  },
  // Oerlikon 20 mm: dakikada 450 seri, 250–320 pratik; 60'lık tambur. Kaynaklarda etkili menzil ~900 m (Flak 38 için ~1.070 m): oyundaki menzil
  // Flak 38'in izli mermi menziliyle aynı oranda (~1.900 m). Nişancı omuz desteğiyle elle çevirir: dönüş hızı tahmin
  oerlikon: {
    id: 'oerlikon', name: L('Oerlikon 20 mm', 'Oerlikon 20 mm'), short: '20 mm', requires: 'hd_oerlikon', range: 1900, ceiling: 1900, cls: 'hafif',
    desc: L('İsviçre tasarımı; Müttefik donanmalarının yakın savunma topu oldu. Nişancı omuz desteklerine yaslanıp topu elle çevirir, bu yüzden çabuk döner. 60’lık tamburu Flak 38’in şarjöründen uzun seri attırır, ama izli mermisi daha yakında işe yarar.',
      'A Swiss design that became the close-in gun of the Allied navies. The gunner leans into shoulder rests and swings it by hand, so it turns quickly. Its 60-round drum gives longer bursts than the Flak 38 magazine, but its tracer is useful at shorter range.'),
    origin: 'İsviçre', year: 1939, bore: 20, shellKg: 0.123, mag: 60, reload: 4.6, drum: true,
    rate: 7.5, muzzleVel: 820, damage: 6, dispersion: 0.011, kind: 'tracer', burstRadius: 0, caliber: 'cannon',
    installTime: 30, rank: 2.5, medium: false, cost: 1000, slew: 60,
  },
  // 2 cm Flakvierling 38: dört namlu, dakikada 1.800 seri, 800 pratik; 4 × 20'lik şarjör
  aa20q: {
    id: 'aa20q', name: L('2 cm Flakvierling 38', '2 cm Flakvierling 38'), short: '4×20 mm', requires: 'hd_20q', range: 2200, ceiling: 2200, cls: 'hafif', barrels: 4,
    desc: L('Tek lafet üstünde dört Flak 38. Birkaç saniyelik seride tek topun dört katını atar: alçaktan gelen taarruz uçağına en tehlikeli hafif silah.',
      'Four Flak 38s on one mount. In a burst of a few seconds it fires four times as much as a single gun: the most dangerous light weapon against low attackers.'),
    origin: 'Almanya', year: 1940, bore: 20, shellKg: 0.12, mag: 80, reload: 3.3, crew: 8,
    rate: 30, muzzleVel: 900, damage: 6, dispersion: 0.012, kind: 'tracer', burstRadius: 0, caliber: 'cannon',
    installTime: 40, rank: 3, medium: false, cost: 1600, slew: 40,
  },
  // 3,7 cm Flak 36: dakikada 150–160 seri; kaynaklar pratikte 60–120 diyor (burada ~90); 6'lık tarak; 14 sn'lik izli 4.200 m'de imha
  aa37: {
    id: 'aa37', name: L('3,7 cm Flak 36', '3.7 cm Flak 36'), short: '37 mm', requires: 'hd_37', range: 4200, ceiling: 4200, cls: 'orta', clip: true,
    desc: L('20 mm’nin yetişemediği yüksekliği kapatan orta top. Mermiler 6’lık taraklarla elle doldurulur; izli mermi 4,2 km’de kendini imha eder. Tek isabeti küçük bir uçağı ağır yaralar.',
      'A medium gun covering the heights the 20 mm cannot reach. Shells are hand-fed in 6-round clips and the tracer self-destructs at 4.2 km. One hit badly damages a small aircraft.'),
    origin: 'Almanya', year: 1936, bore: 37, shellKg: 0.64, mag: 6, reload: 1.6, crew: 7,
    rate: 2.6, muzzleVel: 820, damage: 24, dispersion: 0.008, kind: 'tracer', burstRadius: 9, caliber: 'cannon',
    installTime: 45, rank: 4, medium: true, cost: 1600, slew: 30,
  },
  // Bofors 40 mm L/60: yüksek açıda dakikada 120 seri, pratik 80–100; 4'lük tarak; pratik tavan ~3.800 m; dönüş 50°/sn
  aa40: {
    id: 'aa40', name: L('Bofors 40 mm L/60', 'Bofors 40 mm L/60'), short: '40 mm', requires: 'hd_40', range: 3800, ceiling: 3800, cls: 'orta', clip: true,
    desc: L('İsveç tasarımı; savaşın iki tarafı da kullandı. 4’lük taraklarla sürekli beslenir, namlusu hızlı döner ve 0,9 kg’lık mermisiyle alçak uçağı izleyebilir.',
      'A Swedish design used by both sides in the war. Fed continuously with 4-round clips, its barrel swings fast and its 0.9 kg shell can follow a low aircraft.'),
    origin: 'İsveç', year: 1934, bore: 40, shellKg: 0.9, mag: 4, reload: 0.67, crew: 4,
    rate: 2, muzzleVel: 880, damage: 30, dispersion: 0.007, kind: 'tracer', burstRadius: 11, caliber: 'cannon',
    installTime: 50, rank: 5, medium: true, cost: 2500, slew: 50,
  },
  // 8,8 cm Flak 36: dakikada 15–20; en büyük tapa ayarı (30 sn) 9.900 m, etkili tavan 8.000 m
  aa88: {
    id: 'aa88', name: L('8,8 cm Flak 36', '8.8 cm Flak 36'), short: '88 mm', requires: 'hd_88', range: 9900, ceiling: 8000, cls: 'agir',
    desc: L('Alman ağır flakının temeli. Zaman tapalı mermi 8 km’ye yaklaşık 20 saniyede çıkar, bu yüzden rota değiştiren uçağı kaçırır. Tek topla isabet nadirdir; etkisi bataryaların çokluğundan gelir.',
      'The backbone of German heavy flak. Its time-fuzed shell takes about 20 seconds to reach 8 km, so it misses an aircraft that changes course. Hits from one gun are rare; its effect comes from massed batteries.'),
    origin: 'Almanya', year: 1936, bore: 88, shellKg: 9.2, mag: 0, reload: 0, crew: 10, aim: 0.87,
    rate: 0.29, muzzleVel: 820, damage: 55, dispersion: 0, kind: 'flak', burstRadius: 22, caliber: 'cannon',
    installTime: 60, rank: 6, medium: true, cost: 3350, slew: 12,
  },
  // 90 mm M1: 21 Mart 1940'ta kabul edildi. M1A1 dakikada 20 atış, 10,56 kg mermi, en yüksek tavan 13.300 m (etkili aynı kuralla ~11.500 m)
  aa90: {
    id: 'aa90', name: L('90 mm M1', '90 mm M1'), short: '90 mm', requires: 'hd_90', range: 13300, ceiling: 11500, cls: 'agir',
    desc: L('ABD’nin ağır uçaksavar topu. Dört uzun açılır kolu ve yuvarlak platformuyla kurulur, dakikada 20 atış yapar. 1944’te radar ve yakınlık tapasıyla birlikte kullanıldı; oyunda da bu aletlerle en çok verim alan ağır toplardandır.',
      'The US heavy anti-aircraft gun. It sets up on four long folding arms and a round platform and fires 20 rounds a minute. In 1944 it was used with radar and proximity fuzes; in the game too it gains a lot from those devices.'),
    origin: 'ABD', year: 1940, bore: 90, shellKg: 10.56, mag: 0, reload: 0, crew: 8, aim: 0.87,
    rate: 0.33, muzzleVel: 820, damage: 59, dispersion: 0, kind: 'flak', burstRadius: 23, caliber: 'cannon',
    installTime: 65, rank: 6.3, medium: true, cost: 3900, slew: 14,
  },
  // 8,8 cm Flak 41: ilk teslimat 1943, 1.000 m/sn, dakikada 20–25, etkili tavan 11.300 m, en yüksek 14.700 m, 556 adet üretildi
  aa41: {
    id: 'aa41', name: L('8,8 cm Flak 41', '8.8 cm Flak 41'), short: L('88 mm (41)', '88 mm (41)'), requires: 'hd_flak41', range: 14700, ceiling: 11300, cls: 'agir',
    desc: L('8,8 cm’in yeni nesli: namlu hızı 1.000 m/sn, etkili tavan 11,3 km. Alçak döner tablası ve yüksek kalkanıyla Flak 36’dan kolay ayırt edilir. Gerçekte karmaşık ve pahalıydı, ancak 556 adet üretildi.',
      'The new generation of the 8.8 cm: 1,000 m/s muzzle velocity and an 11.3 km effective ceiling. Its low turntable and tall shield set it apart from the Flak 36. In reality it was complex and expensive, and only 556 were built.'),
    origin: 'Almanya', year: 1943, bore: 88, shellKg: 9.4, mag: 0, reload: 0, aim: 0.87,
    rate: 0.375, muzzleVel: 1000, damage: 56, dispersion: 0, kind: 'flak', burstRadius: 22, caliber: 'cannon',
    installTime: 75, rank: 6.6, medium: true, cost: 4800, slew: 14,
  },
  // 12,8 cm Flak 40: dakikada 10–12; en yüksek tavan 14.800 m, etkili tavan aynı kuralla ~13.000 m
  aa128: {
    id: 'aa128', name: L('12,8 cm Flak 40', '12.8 cm Flak 40'), short: '128 mm', requires: 'hd_128', range: 14800, ceiling: 13000, cls: 'agir',
    desc: L('Sabit mevzilerde ve flak kulelerinde kullanılan çok ağır top. 26 kg’lık mermisi çok yükseğe çıkar, parça yarıçapı geniştir; ama dakikada ancak 10–12 atış yapar.',
      'A very heavy gun used in fixed positions and on flak towers. Its 26 kg shell climbs very high with a wide splinter radius, but it fires only 10–12 rounds a minute.'),
    origin: 'Almanya', year: 1942, bore: 128, shellKg: 26, mag: 0, reload: 0,
    rate: 0.18, muzzleVel: 880, damage: 95, dispersion: 0, kind: 'flak', burstRadius: 32, caliber: 'cannon',
    installTime: 90, rank: 7, medium: true, cost: 6300, slew: 8,
  },
};

/**
 * Mermi yavaşlaması: v' = -k·v², k = C·A/m. C'nin tek değeri kaynaktaki üç silahı tutar: 20 mm 6 sn'de 2.200 m, 37 mm 14 sn'de
 * 4.200 m, 88 mm 30 sn'de 9.900 m (savaş dönemi tablolarından).
 */
const SHELL_DRAG = 0.26;

/** Silahın sürüklenme sabiti k (1/m). */
export function shellDrag(w: AAWeaponDef): number {
  const r = w.bore / 2000;
  return ((w.dragC ?? SHELL_DRAG) * Math.PI * r * r) / w.shellKg;
}

/** Fabrikada bir topun üretim süresi (sn): fiyatıyla orantılı, uçak süreleriyle aynı düzeyde. */
export function gunBuildTime(w: AAWeaponDef): number {
  return Math.round(Math.max(20, w.cost / 25));
}

/** Şarjör değiştirme dahil saniyedeki pratik atış (eğitimli mürettebat). */
export function practicalRate(w: AAWeaponDef): number {
  return w.mag > 0 ? w.mag / (w.mag / w.rate + w.reload) : w.rate;
}

/** Ekranda gösterilen dakikadaki pratik atış: şarjörlü topta yaklaşıktır, yüzün üstünde onluğa, altında beşliğe yuvarlanır. */
export function practicalPerMin(w: AAWeaponDef): number {
  const v = practicalRate(w) * 60;
  if (w.mag <= 0) return Math.round(v);
  const step = v >= 100 ? 10 : 5;
  return Math.round(v / step) * step;
}

/** s metre gitmek için uçuş süresi (sn). */
export function flightTime(w: AAWeaponDef, s: number): number {
  const k = shellDrag(w);
  return (Math.exp(k * s) - 1) / (k * w.muzzleVel);
}

/** Yavaşlayan merminin t saniyede düşüşü (m): boş uzaydaki ½gt²'den az. */
function shellDrop(w: AAWeaponDef, t: number): number {
  const T = 1 / (shellDrag(w) * w.muzzleVel);
  const u = t + T;
  return G * ((u * u - T * T) / 4 - ((T * T) / 2) * Math.log(u / T));
}

export const AA_WEAPON_ORDER: AAWeaponId[] = ['mg', 'aa20', 'oerlikon', 'aa20q', 'aa37', 'aa40', 'aa88', 'aa90', 'aa41', 'aa128'];

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
