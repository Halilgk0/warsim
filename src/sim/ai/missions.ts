import { Vector3 } from 'three';
import type { AircraftSpec, Loadout } from '../aircraft/specs';
import { loadoutAllowed } from '../aircraft/stores';
import type { BeltId } from '../aircraft/ammo';
import type { FormationType } from './formation';

export type MissionType = 'cap' | 'sweep' | 'intercept' | 'escort' | 'levelBomb' | 'diveBomb' | 'attack' | 'ferry';
export type Roe = 'free' | 'defensive' | 'avoid';
export type Doctrine = 'cover' | 'free';
export type SpeedSetting = 'eco' | 'cruise' | 'max';
/**
 * Kolun görevdeki işi (görev dağılımı). Bir tipin uçakları görev içinde ikiye bölünebilir: ör. önlemede 4 uçak eskort
 * avcılarıyla uğraşır, 2 uçak bombardıman uçaklarına gider; taarruzda 2 uçak önce uçaksavarı bastırır.
 *  auto: kendiliğinden (avcı kolunda bombardıman ve eskort birlikteyse ilk çift eskortları bağlar, kalanı bombardımana)
 *  fighters: düşman avcılarıyla uğraş, paketteki bombardıman avcılarını koru
 *  bombers: bombardıman ve taarruz uçaklarına git; avcıyla yalnız kendine saldırırsa çatış
 *  flak: hedefin yanındaki uçaksavar bataryalarına önce saldır
 *  close / free: yakın eskort (korunan koldan ayrılmaz) / serbest avcı (kola yaklaşan her avcıya saldırır)
 */
export type FlightTask = 'auto' | 'fighters' | 'bombers' | 'flak' | 'close' | 'free';

export const TASK_NAMES: Record<FlightTask, string> = {
  auto: 'otomatik', fighters: 'eskort avcılarına', bombers: 'bombardıman uçaklarına', flak: 'uçaksavar bastırma',
  close: 'yakın eskort', free: 'serbest avcı',
};

/** Görev türüne göre dağılım: "side" sayıdaki uçak ikincil işe, kalanı birincil işe. */
export interface TaskSplit {
  main: FlightTask;
  side: FlightTask;
  /** Planlayıcıdaki satır başlığı. */
  label: string;
  help: string;
}

export const TASK_SPLIT: Partial<Record<MissionType, TaskSplit>> = {
  cap: { main: 'fighters', side: 'bombers', label: 'Bombardımana', help: 'Seçilen sayıda uçak bombardıman ve taarruz uçaklarına gider (yalnız kendine saldıranla çatışır); kalanı eskort avcılarını bağlar ve onları korur.' },
  sweep: { main: 'fighters', side: 'bombers', label: 'Bombardımana', help: 'Seçilen sayıda uçak bombardıman ve taarruz uçaklarına gider (yalnız kendine saldıranla çatışır); kalanı eskort avcılarını bağlar ve onları korur.' },
  intercept: { main: 'fighters', side: 'bombers', label: 'Bombardımana', help: 'Seçilen sayıda uçak bombardıman ve taarruz uçaklarına gider (yalnız kendine saldıranla çatışır); kalanı eskort avcılarını bağlar ve onları korur.' },
  escort: { main: 'free', side: 'close', label: 'Yakın eskort', help: 'Yakın eskort korunan kolun yanından ayrılmaz, yalnız ona saldıranla çatışır; kalanı serbest avcı olarak kola yaklaşan her düşman avcıya saldırır.' },
  attack: { main: 'auto', side: 'flak', label: 'Uçaksavar bastırma', help: 'Seçilen sayıda uçak önce hedefin çevresindeki (3,5 km) uçaksavar bataryalarına saldırır; kalanı asıl hedefe.' },
  diveBomb: { main: 'auto', side: 'flak', label: 'Uçaksavar bastırma', help: 'Seçilen sayıda uçak önce hedefin çevresindeki (3,5 km) uçaksavar bataryalarına dalar; kalanı asıl hedefe.' },
};

export const MISSION_NAMES: Record<MissionType, string> = {
  cap: 'Hava devriyesi',
  sweep: 'Avcı taraması',
  intercept: 'Önleme',
  escort: 'Eskort',
  levelBomb: 'Yatay bombardıman',
  diveBomb: 'Pike bombardımanı',
  attack: 'Taarruz (alçak irtifa)',
  ferry: 'Üs transferi',
};

export const MISSION_DESCS: Record<MissionType, string> = {
  cap: 'Bir bölgenin üzerinde daire çizer, bölgeye giren düşmanla çatışır, süre dolunca döner.',
  sweep: 'Hedef bölgeye gidip gördüğü her düşmanı avlar. Eskortsuz bombardıman uçaklarını avlamak için.',
  intercept: 'Seçilen düşman uçağına ve koluna en kısa yoldan, tam güçle yönelir. Radar ya da gözcüler izledikçe rota güncellenir; iz kaybolursa son görülen yerde arar.',
  escort: 'Dost bir kolu korur: ona yaklaşan avcılara saldırır ama uzağa kovalamaz. İrtifa ve rota korunan koldan alınır.',
  levelBomb: 'Başlangıç noktasından (IP) düz ve sabit bombardıman koşusu. Kol liderin bıraktığı anda bırakır.',
  diveBomb: 'Sırayla dik dalış: tek hedefe yüksek isabet. Uçaksavara karşı açıktır.',
  attack: 'Alçaktan sızma, yükselip sığ dalışla roket, top ve bombalarla birden çok geçiş.',
  ferry: 'Uçakları başka bir dost hava üssüne taşır.',
};

/** Görev simgeleri (arayüz). */
export const MISSION_ICONS: Record<MissionType, string> = {
  cap: '◌', sweep: '➶', intercept: '⇥', escort: '⛉', levelBomb: '▤', diveBomb: '⤓', attack: '≋', ferry: '⇄',
};

/** Görev türüne uygun roller. */
export const MISSION_ROLES: Record<MissionType, AircraftSpec['role'][]> = {
  cap: ['fighter'],
  sweep: ['fighter'],
  intercept: ['fighter'],
  escort: ['fighter'],
  levelBomb: ['bomber'],
  diveBomb: ['diveBomber', 'fighter'],
  attack: ['attacker', 'fighter', 'diveBomber'],
  ferry: ['fighter', 'diveBomber', 'bomber', 'attacker'],
};

/** Planlayıcıda hangi ayarların bu görev için anlamlı olduğu. */
export interface MissionFields {
  /** Seyir irtifası seçilebilir. */
  altitude: boolean;
  /** Ara nokta (rota) eklenebilir. */
  route: boolean;
  /** Alçak uçuş (arazi takibi) seçilebilir. */
  lowLevel: boolean;
  /** Seyir hızı seçilebilir. */
  speed: boolean;
  /** Angajman kuralı seçilebilir. */
  roe: boolean;
  /** Devriye yarıçapı ve süresi. */
  patrol: boolean;
  /** Taarruz geçiş sayısı. */
  passes: boolean;
  /** Eskort eklenebilir. */
  escort: boolean;
  /** Yük (bomba/roket) taşır. */
  ordnance: boolean;
}

const F = (o: Partial<MissionFields>): MissionFields => ({
  altitude: true, route: true, lowLevel: false, speed: true, roe: true, patrol: false, passes: false, escort: false,
  ordnance: false, ...o,
});

export const MISSION_FIELDS: Record<MissionType, MissionFields> = {
  cap: F({ patrol: true }),
  sweep: F({ patrol: true }),
  // Önleme: hedefe tam güçle, hedefin irtifasına tırmanır; rota ve irtifa anlamsız
  intercept: F({ altitude: false, route: false, speed: false, roe: false }),
  // Eskort: korunan kolun irtifasında ve rotasında uçar
  escort: F({ altitude: false, route: false, speed: false }),
  levelBomb: F({ escort: true, ordnance: true, roe: false }),
  diveBomb: F({ escort: true, ordnance: true, roe: false }),
  attack: F({ lowLevel: true, passes: true, escort: true, ordnance: true, roe: false }),
  ferry: F({ roe: false }),
};

export interface MissionPlan {
  type: MissionType;
  /** Nokta hedef (devriye merkezi, tarama bölgesi). */
  targetPos: Vector3 | null;
  targetStructureId: number | null;
  targetAircraftId: number | null;
  targetFlightId: number | null;
  targetBaseId: number | null;
  waypoints: Vector3[];
  /** Seyir irtifası (deniz seviyesinden, m). */
  altitude: number;
  /** Arazi takibi ile alçak uçuş (radar altı). */
  lowLevel: boolean;
  /** Alçak uçuşta araziden yükseklik (m). */
  agl: number;
  speed: SpeedSetting;
  formation: FormationType;
  roe: Roe;
  doctrine: Doctrine;
  loadoutId: string;
  /** Mermi kuşağı. */
  belt: BeltId;
  fuelFrac: number;
  patrolRadius: number;
  /** İstasyonda kalma süresi (s). */
  stationTime: number;
  /** Taarruz geçiş sayısı. */
  passes: number;
  /** Kolun görevdeki işi (görev dağılımı). */
  task: FlightTask;
}

/** Role ve göreve göre olağan formasyon. */
export function defaultFormation(spec: AircraftSpec, type: MissionType): FormationType {
  return spec.role === 'bomber' ? 'box' : spec.role === 'fighter' && type !== 'attack' && type !== 'diveBomb' ? 'finger4' : type === 'attack' ? 'echelonR' : 'vic';
}

export function defaultPlan(type: MissionType, spec: AircraftSpec): MissionPlan {
  const formation = defaultFormation(spec, type);
  return {
    type,
    targetPos: null,
    targetStructureId: null,
    targetAircraftId: null,
    targetFlightId: null,
    targetBaseId: null,
    waypoints: [],
    altitude: type === 'attack' ? 1200 : spec.cruiseAlt,
    lowLevel: type === 'attack',
    agl: 120,
    speed: type === 'intercept' ? 'max' : 'cruise',
    formation,
    roe: type === 'ferry' ? 'defensive' : spec.role === 'fighter' ? 'free' : 'avoid',
    doctrine: 'cover',
    loadoutId: spec.loadouts[0].id,
    belt: defaultBelt(type),
    fuelFrac: 1,
    patrolRadius: 3000,
    stationTime: 300,
    passes: 2,
    task: 'auto',
  };
}

/** Göreve göre önerilen mermi kuşağı. */
export function defaultBelt(type: MissionType): BeltId {
  if (type === 'attack' || type === 'diveBomb') return 'ap';
  if (type === 'intercept') return 'he';
  return 'std';
}

export function ordnanceMass(l: Loadout): number {
  return l.mass - l.tankFuel * 1.1;
}

/**
 * Göreve göre önerilen yük: bombardımanda en çok bomba (uçaksavara karşı çok sayıda küçük bomba),
 * pikede en ağır tek bomba, taarruzda roket, uzak avcı görevlerinde atılabilir tank.
 * has: araştırma kontrolü (açılmamış yükler seçilmez). dist: hedefe uzaklık (m).
 */
export function defaultLoadout(
  spec: AircraftSpec, type: MissionType, has: (id?: string) => boolean, dist = 0, targetIsAA = false,
): string {
  const avail = spec.loadouts.filter((l) => loadoutAllowed(l, has));
  const ord = avail.filter((l) => l.bombCount || l.rocketCount);
  const clean = avail.filter((l) => !l.bombCount && !l.rocketCount && !l.extraGuns && !l.replaceGuns);
  const tanks = clean.filter((l) => l.tankFuel).sort((a, b) => b.tankFuel - a.tankFuel);
  const std = clean.find((l) => !l.tankFuel) ?? avail[0] ?? spec.loadouts[0];
  // Menzilin yaklaşık yarısından uzak hedefe tankla git
  const far = dist > spec.cruiseSpeed * spec.fuelMinutes * 60 * 0.28;
  const best = (list: Loadout[], score: (l: Loadout) => number) =>
    list.reduce<Loadout | null>((b, l) => (!b || score(l) > score(b) ? l : b), null);
  switch (type) {
    case 'levelBomb': {
      const l = targetIsAA ? best(ord, (x) => x.bombCount * 10 + x.bombKg / 1000) : best(ord, (x) => x.bombKg);
      return (l ?? std).id;
    }
    case 'diveBomb': {
      const l = best(ord.filter((x) => x.bombCount), (x) => x.maxBombKg * 2 + x.bombKg / 10);
      return (l ?? std).id;
    }
    case 'attack': {
      const l = best(ord, (x) => (x.rocketCount ? 2000 : 0) + x.bombCount * 40 + ordnanceMass(x) / 10);
      return (l ?? std).id;
    }
    case 'sweep':
    case 'escort':
    case 'ferry':
      return (tanks[0] && (far || type !== 'sweep') ? tanks[0] : std).id;
    case 'cap':
      return (far && tanks[0] ? tanks[0] : std).id;
    case 'intercept':
    default:
      return std.id;
  }
}

export function speedFor(spec: AircraftSpec, s: SpeedSetting): number {
  if (s === 'eco') return spec.cruiseSpeed * 0.85;
  if (s === 'max') return spec.vMax * 0.95;
  return spec.cruiseSpeed;
}

/** Hedef türü gereksinimi (planlayıcı için). */
export function targetKind(type: MissionType): 'point' | 'structure' | 'aircraft' | 'flight' | 'base' {
  switch (type) {
    case 'cap':
    case 'sweep':
      return 'point';
    case 'intercept':
      return 'aircraft';
    case 'escort':
      return 'flight';
    case 'ferry':
      return 'base';
    default:
      return 'structure';
  }
}
