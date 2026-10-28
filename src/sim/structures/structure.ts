import { Vector3 } from 'three';
import { Airbase } from './airbase';
import { AASite } from './airDefense';
import { RadarSite } from './radar';
import { Factory } from './factory';
import { L } from '../../i18n';

export type StructureKind =
  | 'airbase' | 'aa' | 'radar' | 'factory' | 'mine'
  | 'house' | 'apartment' | 'shops' | 'office' | 'depot' | 'park';

/** Askerî tesis, şehir yapısı ya da ekonomi yapısı. */
export type StructureCategory = 'military' | 'city' | 'economy';

export const CITY_KINDS: StructureKind[] = ['house', 'apartment', 'shops', 'office', 'depot', 'park'];
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
  house: {
    kind: 'house', category: 'city', name: L('Ev', 'House'), buildTime: 20, hp: 180, radius: 14, halfW: 16, halfL: 16, maxRelief: 25,
    population: 4, desc: L('Bahçeli müstakil ev: 4 kişi barınır. Her kişi bir pilot ya da mürettebat demek; uçaklar ancak yeterli personelle kalkar.',
      'A detached house with a garden: home to 4 people. Each person is a pilot or crew member; aircraft take off only with enough personnel.'),
  },
  apartment: {
    kind: 'apartment', category: 'city', name: L('Apartman', 'Apartment block'), buildTime: 50, hp: 400, radius: 26, halfW: 30, halfL: 22, maxRelief: 20,
    population: 16, desc: L('Dört katlı apartman: 16 kişi barınır. Az yerde çok personel; inşaatı daha uzun.',
      'A four-storey block: home to 16 people. Lots of personnel in little space; takes longer to build.'),
  },
  shops: {
    kind: 'shops', category: 'city', name: L('Çarşı', 'Market street'), buildTime: 50, hp: 400, radius: 55, halfW: 66, halfL: 52, maxRelief: 35,
    jobs: 160, desc: L('Tenteli dükkân sırası ve pazar meydanı. İş yeri; ileride ticaret geliri getirecek.',
      'A row of awninged shops and a market square. Workplaces; will bring trade income later.'),
  },
  office: {
    kind: 'office', category: 'city', name: L('İş merkezi', 'Office block'), buildTime: 90, hp: 600, radius: 40, halfW: 46, halfL: 46, maxRelief: 30,
    jobs: 420, desc: L('Camlı yüksek ofis binası ve meydan. Çok iş yeri; ileride vergi geliri.',
      'A tall glass office building and plaza. Many workplaces; tax income later.'),
  },
  depot: {
    kind: 'depot', category: 'city', name: L('Ambar ve depo', 'Warehouses'), buildTime: 60, hp: 420, radius: 70, halfW: 82, halfL: 62, maxRelief: 40,
    jobs: 60, desc: L('Kemer çatılı ambarlar, yükleme sahası ve su deposu. İleride ikmal ve stok için.',
      'Arched-roof warehouses, a loading yard and a water tower. For supply and stock later.'),
  },
  park: {
    kind: 'park', category: 'city', name: L('Park', 'Park'), buildTime: 25, hp: 200, radius: 45, halfW: 52, halfL: 52, maxRelief: 50,
    desc: L('Ağaçlı park, gölet ve yürüyüş yolları. İleride halkın moralini yükseltecek.', 'A tree-lined park with a pond and footpaths. Will lift morale later.'),
  },
};

let nextId = 1;

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
    /** Yön (radyan, pusula). Pist ve bina dizilimi için. */
    readonly heading: number,
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
  airbase: '✈', aa: '◎', radar: '◉', factory: '▣', mine: '⛏', house: '⌂', apartment: '▥', shops: '◫', office: '▮', depot: '▭', park: '♣',
};
