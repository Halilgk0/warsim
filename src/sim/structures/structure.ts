import { Vector3 } from 'three';
import { Airbase } from './airbase';
import { AASite } from './airDefense';
import { RadarSite } from './radar';
import { Factory } from './factory';
import { FireStation } from './fireStation';
import { L } from '../../i18n';
import { flattenFootprint } from '../terrain';

export type StructureKind =
  | 'airbase' | 'aa' | 'radar' | 'factory' | 'mine'
  | 'townhall' | 'firestation' | 'smallhouse' | 'midhouse' | 'house' | 'apartment' | 'shops' | 'office' | 'depot' | 'park';

/** Askerî tesis, şehir yapısı ya da ekonomi yapısı. */
export type StructureCategory = 'military' | 'city' | 'economy';

/** İnşa menüsündeki şehir yapıları. Çarşı, iş merkezi ve ambar 2026-11-11'de kalktı (eski kayıtlarda duranlar kalır). */
export const CITY_KINDS: StructureKind[] = ['townhall', 'firestation', 'smallhouse', 'midhouse', 'house', 'apartment', 'park'];
/** Yol bağlantısı isteyen yapılar (yol kuralı açıkken, world.roadRules): evler ancak bir yolun yanına kurulur. */
/**
 * Taşınabilen ve döndürülebilen yapılar (2026-11-20, oyuncu isteği): belediye dışındaki şehir binaları. Belediyenin caddesi,
 * madenin damarı, bataryanın yuvaları ve üssün pisti yerine bağlı olduğu için onlar taşınmaz.
 */
export const MOVABLE_KINDS: ReadonlySet<StructureKind> = new Set<StructureKind>(['firestation', 'smallhouse', 'midhouse', 'house', 'apartment', 'park']);
/** Oyuncunun yıkamayacağı yapılar (2026-11-23): hava üssü, fabrika ve kasabanın kökü belediye. Ötekiler yıkılıp kaldırılır. */
export const KEEP_KINDS: ReadonlySet<StructureKind> = new Set<StructureKind>(['airbase', 'factory', 'townhall']);
export const ROAD_KINDS: ReadonlySet<StructureKind> = new Set<StructureKind>(['smallhouse', 'midhouse', 'house', 'apartment', 'firestation']);
export const MILITARY_KINDS: StructureKind[] = ['airbase', 'aa', 'radar', 'factory'];
export const ECONOMY_KINDS: StructureKind[] = ['mine'];

export interface StructureDef {
  kind: StructureKind;
  category: StructureCategory;
  name: string;
  desc: string;
  /** Şehir: barınan nüfus. */
  population?: number;
  /** Şehir: iş yeri sayısı. */
  jobs?: number;
  buildTime: number;
  hp: number;
  /** Bomba hasarı için etki yarıçapı (pist hariç). */
  radius: number;
  /** Yerleşim tabanı (yarı genişlik / yarı uzunluk). */
  halfW: number;
  halfL: number;
  /** Tabandaki en yüksek-en alçak fark sınırı (m). */
  maxRelief: number;
  requires?: string;
}

export const STRUCTURE_DEFS: Record<StructureKind, StructureDef> = {
  airbase: {
    kind: 'airbase', category: 'military', name: L('Hava üssü', 'Airbase'), buildTime: 240, hp: 1600, radius: 260, halfW: 380, halfL: 1300, maxRelief: 170,
    desc: L('Pist, taksi yolu, apron, hangarlar, kule ve yakıt. 24 uçak kapasitesi; tesislerle genişler. Kalkış ve iniş buradan yapılır.',
      'Runway, taxiway, apron, hangars, tower and fuel. Room for 24 aircraft, more with facilities. All takeoffs and landings happen here.'),
  },
  aa: {
    kind: 'aa', category: 'military', name: L('Uçaksavar bataryası', 'Flak battery'), buildTime: 60, hp: 320, radius: 70, halfW: 95, halfL: 95, maxRelief: 60,
    desc: L('Komuta mevzisi çevresinde silah çukurları. İki silahla başlar; araştırmayla yeni silahlar, nişan aletleri ve radar eklenir.',
      'Gun pits around a command post. Starts with two guns; research adds new guns, fire-control aids and radar.'),
  },
  radar: {
    kind: 'radar', category: 'military', name: L('Radar istasyonu', 'Radar station'), buildTime: 120, hp: 360, radius: 55, halfW: 80, halfL: 80, maxRelief: 80,
    desc: L('Erken ihbar. Tepeye kurulursa daha uzağı görür; tepelerin arkası ve alçak irtifa kör bölgedir.',
      'Early warning. It sees farther from a hilltop; behind hills and low altitude are blind spots.'),
    requires: 'radar_ew1',
  },
  factory: {
    kind: 'factory', category: 'military', name: L('Uçak fabrikası', 'Aircraft factory'), buildTime: 200, hp: 2400, radius: 200, halfW: 300, halfL: 260, maxRelief: 80,
    desc: L('Montaj holleri ve test pisti. Uçak üretir; bağlı olduğu ya da en yakın hava üssüne teslim eder. Bombalanırsa üretim yavaşlar.',
      'Assembly halls and a test strip. Builds aircraft and delivers them to its own or the nearest airbase. Bombing slows production.'),
  },
  // ---------------------------------------------------------------- ekonomi
  mine: {
    kind: 'mine', category: 'economy', name: L('Maden ocağı', 'Mine'), buildTime: 150, hp: 900, radius: 60, halfW: 70, halfL: 55, maxRelief: 140,
    desc: L('Pasif gelir. Damarın verimi yere göre çok değişir ve kurmadan bilinmez; bazı yerler zengin, çoğu orta ya da zayıf. Hasar görürse üretim düşer.',
      'Passive income. Ore yield varies a lot by place and is unknown until you build; a few spots are rich, most are average or poor. Damage cuts output.'),
  },
  // ---------------------------------------------------------------- şehir
  // Belediye binası: kasabanın merkezi. Önünden ana cadde çıkar (roads.ts TOWN_ROAD); evler yollara dizilir. Gelir
  // getirmez; ekranında şehir ekonomisi, araştırma ve üretim görünür (ui/town.ts)
  townhall: {
    kind: 'townhall', category: 'city', name: L('Belediye binası', 'Town hall'), buildTime: 60, hp: 700, radius: 36, halfW: 34, halfL: 28, maxRelief: 30,
    desc: L('Saat kuleli belediye binası ve meydanı. Önünden ana cadde çıkar; evler ancak yolların yanına kurulur. Gelir getirmez; ekranında şehrin gelir ve giderleri, süren araştırma ve üretim görünür.',
      'A town hall with a clock tower and a square. The main street starts at its door; houses can only be built beside roads. It earns nothing; its screen shows the town\'s income and spending, and research and production under way.'),
  },
  // İtfaiye merkezi: kapsama alanındaki şehir binalarını onarır (fireStation.ts). Yolun yanına kurulur, personel ister
  firestation: {
    kind: 'firestation', category: 'city', name: L('İtfaiye merkezi', 'Fire station'), buildTime: 45, hp: 520, radius: 22, halfW: 21, halfL: 17, maxRelief: 25,
    desc: L('Garajlı itfaiye binası ve hortum kulesi. Kapsama alanındaki hasarlı ev, apartman ve belediye binasına araçla ekip gönderir, elle onarımın yarı fiyatına onarır. 4 boşta personel ister; iki kez seviye atlar (+2 personel, daha geniş alan).',
      'A fire station with engine bays and a hose tower. It sends crews by vehicle to damaged houses, apartment blocks and the town hall in its area and repairs them for half the price of a manual repair. Needs 4 free personnel; it can be upgraded twice (+2 staff, wider area).'),
  },
  // Evler boyuna göre 2, 3 ve 4 kişi barındırır; fiyat da kişi sayısıyla artar. 'house' kimliği eski kayıtlardaki 4 kişilik ev
  smallhouse: {
    kind: 'smallhouse', category: 'city', name: L('Küçük ev', 'Small house'), buildTime: 12, hp: 110, radius: 10, halfW: 11, halfL: 11, maxRelief: 25,
    population: 2, desc: L('Tek katlı küçük kır evi ve bahçesi: 2 kişi barınır, kira getirir. Ucuz ve çabuk biter. Her kişi bir pilot, mürettebat ya da bakımcı demek.',
      'A small one-storey cottage with a garden: home to 2 people, brings in rent. Cheap and quick to build. Each person is a pilot, crew member or mechanic.'),
  },
  midhouse: {
    kind: 'midhouse', category: 'city', name: L('Orta ev', 'Medium house'), buildTime: 16, hp: 145, radius: 12, halfW: 13.5, halfL: 13.5, maxRelief: 25,
    population: 3, desc: L('Çatı katlı bahçeli ev: 3 kişi barınır, kira getirir. Her kişi bir pilot, mürettebat ya da bakımcı demek; uçaklar ancak yeterli personelle kalkar.',
      'A house with an attic floor and a garden: home to 3 people, brings in rent. Each person is a pilot, crew member or mechanic; aircraft take off only with enough personnel.'),
  },
  house: {
    kind: 'house', category: 'city', name: L('Büyük ev', 'Large house'), buildTime: 20, hp: 180, radius: 14, halfW: 16, halfL: 16, maxRelief: 25,
    population: 4, desc: L('İki katlı bahçeli müstakil ev: 4 kişi barınır, kira getirir. Her kişi bir pilot, mürettebat ya da bakımcı demek; uçaklar ancak yeterli personelle kalkar.',
      'A two-storey detached house with a garden: home to 4 people, brings in rent. Each person is a pilot, crew member or mechanic; aircraft take off only with enough personnel.'),
  },
  apartment: {
    kind: 'apartment', category: 'city', name: L('Apartman', 'Apartment block'), buildTime: 50, hp: 400, radius: 26, halfW: 30, halfL: 22, maxRelief: 20,
    population: 16, desc: L('Dört katlı apartman: 16 kişi barınır, en çok kirayı getirir. Az yerde çok personel; inşaatı daha uzun.',
      'A four-storey block: home to 16 people and the most rent. Lots of personnel in little space; takes longer to build.'),
  },
  shops: {
    kind: 'shops', category: 'city', name: L('Çarşı', 'Market street'), buildTime: 50, hp: 400, radius: 55, halfW: 66, halfL: 52, maxRelief: 35,
    jobs: 160, desc: L('Tenteli dükkân sırası ve pazar meydanı. İş yeri; ileride ticaret geliri getirecek.',
      'A row of awninged shops and a market square. Workplaces; will bring trade income later.'),
  },
  office: {
    kind: 'office', category: 'city', name: L('İş merkezi', 'Office block'), buildTime: 90, hp: 600, radius: 40, halfW: 46, halfL: 46, maxRelief: 30,
    jobs: 420, desc: L('Kesme taş cepheli, beş katlı büyük büro binası ve önünde meydan. Çok iş yeri; ileride vergi geliri.',
      'A large five-storey stone office building with a forecourt. Many workplaces; tax income later.'),
  },
  depot: {
    kind: 'depot', category: 'city', name: L('Ambar ve depo', 'Warehouses'), buildTime: 60, hp: 420, radius: 70, halfW: 82, halfL: 62, maxRelief: 40,
    jobs: 60, desc: L('Kemer çatılı ambarlar, yükleme sahası ve su deposu. İleride ikmal ve stok için.',
      'Arched-roof warehouses, a loading yard and a water tower. For supply and stock later.'),
  },
  park: {
    kind: 'park', category: 'city', name: L('Park', 'Park'), buildTime: 25, hp: 200, radius: 12, halfW: 13.5, halfL: 13.5, maxRelief: 25,
    desc: L('Ağaçlı mahalle parkı, banklar ve çakıl yollar. 300 m içindeki evlerin kirası %10 artar; iki park yakınsa %20.',
      'A small neighbourhood park with trees, benches and gravel paths. Houses within 300 m earn 10% more rent; 20% with two parks nearby.'),
  },
};

/**
 * Yapının zeminini düzleştir (yerleşim, inşaat başlangıcı ve kayıt yükleme aynı işlevi kullanır). Düzleşen alan yapının
 * çizilen bütün parçalarını kapsar. Hava üssü pistin iki yanına eşit yayılmaz: yerel modelde tel örgü x −720…+232 m,
 * pist uçlarıyla boyu ±1360 m. Düzleştirmenin v ekseni (cos h, sin h) yerel x'in tersi, bu yüzden v −232…+720.
 */
export function flattenStructure(kind: StructureKind, x: number, z: number, headingRad: number, elevation: number): void {
  const def = STRUCTURE_DEFS[kind];
  if (kind === 'airbase') {
    const off = 244;
    flattenFootprint(x + Math.cos(headingRad) * off, z + Math.sin(headingRad) * off, 500, 1400, headingRad, elevation, 260);
  } else {
    flattenFootprint(x, z, def.halfW + 20, def.halfL + 40, headingRad, elevation, def.category === 'city' ? 50 : 90);
  }
}

let nextId = 1;

/** Sıradaki yapının alacağı kimlik (yerleştirme önizlemesi kurulacak binanın aynı tipini gösterir: model tohumu kimlikten). */
export function peekStructureId(): number {
  return nextId;
}

/** Video kaydı: aynı dünya yeniden kurulunca kimlikler de aynı olsun (yalnız dünya yokken çağrılır). */
export function resetStructureIds(): void {
  nextId = 1;
}

export class Structure {
  readonly id: number;
  hp: number;
  readonly maxHp: number;
  /** İnşaat ilerlemesi 0..1. */
  build: number;
  airbase: Airbase | null = null;
  aa: AASite | null = null;
  radar: RadarSite | null = null;
  factory: Factory | null = null;
  fire: FireStation | null = null;
  /** Bir hava üssünün tesisi ise o üssün kimliği (ürünler doğrudan oraya gider). */
  attachedTo: number | null = null;
  /** Gözcülerin son tarama zamanı. */
  observeTimer = Math.random() * 2;
  /** Maden: damar verimi (kurulunca belirlenir) ve toplam kazanç. */
  richness = 0;
  earned = 0;
  /** Onarım açık mı (tam onarılınca kapanır) ve son isabet zamanı (onarım ondan sonra bir süre bekler). */
  repairing = false;
  lastHit = -Infinity;

  constructor(
    readonly team: number,
    readonly kind: StructureKind,
    public name: string,
    readonly pos: Vector3,
    /** Yön (radyan, pusula). Pist ve bina dizilimi için. Şehir binası taşınınca değişir (world.moveStructure). */
    public heading: number,
    built = true,
    /** Kayıttan yüklerken eski kimlik korunur. */
    id?: number,
  ) {
    if (id !== undefined) {
      this.id = id;
      nextId = Math.max(nextId, id + 1);
    } else this.id = nextId++;
    const def = STRUCTURE_DEFS[kind];
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.build = built ? 1 : 0;
    if (kind === 'airbase') this.airbase = new Airbase(this);
    if (kind === 'aa') this.aa = new AASite();
    if (kind === 'radar') this.radar = new RadarSite();
    if (kind === 'factory') this.factory = new Factory();
    if (kind === 'firestation') this.fire = new FireStation();
  }

  get def(): StructureDef {
    return STRUCTURE_DEFS[this.kind];
  }

  get active(): boolean {
    return this.build >= 1 && this.hp > 0;
  }

  get destroyed(): boolean {
    return this.hp <= 0;
  }
}

/** Harita etiketi ve listelerde kullanılan simge. */
export const STRUCT_GLYPH: Record<StructureKind, string> = {
  airbase: '✈', aa: '◎', radar: '◉', factory: '▣', mine: '⛏', townhall: '♜', firestation: '♨', smallhouse: '⌂', midhouse: '⌂', house: '⌂', apartment: '▥', shops: '◫', office: '▮', depot: '▭', park: '♣',
};
