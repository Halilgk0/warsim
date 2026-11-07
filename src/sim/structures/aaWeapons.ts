// Uçaksavar silahlarının tanımları ve mermi hesapları: saf veri, simülasyon ve arazi bilmez. airDefense.ts hepsini aynen dışa
// aktarır; ansiklopedi (src/ansiklopedi) doğrudan bunu okur, böylece derlemede harita üretilmez. Kaynaklar ve kurallar airDefense.ts başında.
// Silah kimlikleri kayıtlara yazılır, değişmez.

import type { Caliber } from '../aircraft/specs';
import { L } from '../../i18n';

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

export const AA_WEAPON_ORDER: AAWeaponId[] = ['mg', 'aa20', 'oerlikon', 'aa20q', 'aa37', 'aa40', 'aa88', 'aa90', 'aa41', 'aa128'];
