import { Vector3 } from 'three';
import type { AircraftSpec, Loadout } from '../aircraft/specs';
import { loadoutAllowed } from '../aircraft/stores';
import type { BeltId } from '../aircraft/ammo';
import type { FormationType } from './formation';
import { L } from '../../i18n';

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
  auto: L('otomatik', 'automatic'), fighters: L('eskort avcılarına', 'vs escort fighters'), bombers: L('bombardıman uçaklarına', 'vs bombers'),
  flak: L('uçaksavar bastırma', 'flak suppression'), close: L('yakın eskort', 'close escort'), free: L('serbest avcı', 'free hunt'),
};

/** Görev türüne göre dağılım: "side" sayıdaki uçak ikincil işe, kalanı birincil işe. */
export interface TaskSplit {
  main: FlightTask;
  side: FlightTask;
  /** Planlayıcıdaki satır başlığı. */
  label: string;
  help: string;
}

const TO_BOMBERS: TaskSplit = {
  main: 'fighters', side: 'bombers', label: L('Bombardımana', 'Vs bombers'),
  help: L(
    'Seçilen sayıda uçak bombardıman ve taarruz uçaklarına gider (yalnız kendine saldıranla çatışır); kalanı eskort avcılarını bağlar ve onları korur.',
    'The chosen number of aircraft go for bombers and attackers (fighting only those that attack them); the rest tie up the escort fighters and cover them.',
  ),
};

export const TASK_SPLIT: Partial<Record<MissionType, TaskSplit>> = {
  cap: TO_BOMBERS,
  sweep: TO_BOMBERS,
  intercept: TO_BOMBERS,
  escort: { main: 'free', side: 'close', label: L('Yakın eskort', 'Close escort'), help: L(
    'Yakın eskort korunan kolun yanından ayrılmaz, yalnız ona saldıranla çatışır; kalanı serbest avcı olarak kola yaklaşan her düşman avcıya saldırır.',
    'Close escorts never leave the escorted flight and fight only what attacks it; the rest hunt freely, attacking every enemy fighter that approaches.',
  ) },
  attack: { main: 'auto', side: 'flak', label: L('Uçaksavar bastırma', 'Flak suppression'), help: L(
    'Seçilen sayıda uçak önce hedefin çevresindeki (3,5 km) uçaksavar bataryalarına saldırır; kalanı asıl hedefe.',
    'The chosen number of aircraft first attack the flak batteries around the target (3.5 km); the rest go for the main target.',
  ) },
  diveBomb: { main: 'auto', side: 'flak', label: L('Uçaksavar bastırma', 'Flak suppression'), help: L(
    'Seçilen sayıda uçak önce hedefin çevresindeki (3,5 km) uçaksavar bataryalarına dalar; kalanı asıl hedefe.',
    'The chosen number of aircraft first dive on the flak batteries around the target (3.5 km); the rest go for the main target.',
  ) },
};

export const MISSION_NAMES: Record<MissionType, string> = {
  cap: L('Hava devriyesi', 'Combat air patrol'),
  sweep: L('Avcı taraması', 'Fighter sweep'),
  intercept: L('Önleme', 'Intercept'),
  escort: L('Eskort', 'Escort'),
  levelBomb: L('Yatay bombardıman', 'Level bombing'),
  diveBomb: L('Pike bombardımanı', 'Dive bombing'),
  attack: L('Taarruz (alçak irtifa)', 'Ground attack (low level)'),
  ferry: L('Üs transferi', 'Ferry'),
};

export const MISSION_DESCS: Record<MissionType, string> = {
  cap: L('Bir bölgenin üzerinde daire çizer, bölgeye giren düşmanla çatışır, süre dolunca döner.',
    'Circles over an area, engages any enemy that enters it and returns when time is up.'),
  sweep: L('Hedef bölgeye gidip gördüğü her düşmanı avlar. Eskortsuz bombardıman uçaklarını avlamak için.',
    'Flies to the target area and hunts every enemy it sees. Good for catching unescorted bombers.'),
  intercept: L('Seçilen düşman uçağına ve koluna en kısa yoldan, tam güçle yönelir. Radar ya da gözcüler izledikçe rota güncellenir; iz kaybolursa son görülen yerde arar.',
    'Heads for the chosen enemy aircraft and its flight by the shortest route at full power. The course updates while radar or observers track it; if the track is lost, it searches where the enemy was last seen.'),
  escort: L('Dost bir kolu korur: ona yaklaşan avcılara saldırır ama uzağa kovalamaz. İrtifa ve rota korunan koldan alınır.',
    'Protects a friendly flight: attacks fighters that approach it but does not chase far. Altitude and route follow the escorted flight.'),
  levelBomb: L('Başlangıç noktasından (IP) düz ve sabit bombardıman koşusu. Kol liderin bıraktığı anda bırakır.',
    'A straight, steady bomb run from the initial point (IP). The flight releases when the leader does.'),
  diveBomb: L('Sırayla dik dalış: tek hedefe yüksek isabet. Uçaksavara karşı açıktır.',
    'Steep dives one after another: high accuracy on a single target. Exposed to flak.'),
  attack: L('Alçaktan sızma, yükselip sığ dalışla roket, top ve bombalarla birden çok geçiş.',
    'Low-level ingress, then pop-up and shallow dives for several passes with rockets, cannon and bombs.'),
  ferry: L('Uçakları başka bir dost hava üssüne taşır.', 'Moves aircraft to another friendly airbase.'),
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
