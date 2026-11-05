import type { Structure } from './structure';
import type { World } from '../world';
import { SPECS } from '../aircraft/specs';
import { AA_WEAPONS, gunBuildTime, type AAWeaponId } from './airDefense';
import { newAirframe } from './airbase';
import { L } from '../../i18n';

export interface ProductionItem {
  specId: string;
  progress: number;
  /** Siparişte ödenen tutar (iptalde iade için). */
  paid: number;
}

/** Bantta en çok bu kadar sipariş (uçak ve top ayrı ayrı). */
export const QUEUE_MAX = 30;

export interface GunItem {
  gun: AAWeaponId;
  progress: number;
  paid: number;
}

/**
 * Fabrika: uçakları sırayla üretir, bitince en yakın uygun hava üssüne teslim eder. Uçaksavar topları ayrı bantta, aynı anda üretilir
 * ve takım deposuna girer.
 */
export class Factory {
  readonly queue: ProductionItem[] = [];
  readonly gunQueue: GunItem[] = [];
  /** Kuyruk boşalınca kendiliğinden tekrar et. */
  repeat = false;

  private updateGuns(world: World, s: Structure, dt: number): void {
    const item = this.gunQueue[0];
    if (!item) return;
    const w = AA_WEAPONS[item.gun];
    item.progress += (dt / gunBuildTime(w)) * (0.4 + 0.6 * (s.hp / s.maxHp));
    if (item.progress < 1) return;
    this.gunQueue.shift();
    const stock = world.teams[s.team].gunStock;
    stock[item.gun] = (stock[item.gun] ?? 0) + 1;
    world.log(L(`${s.name}: ${w.name} üretildi, depoya girdi`, `${s.name}: ${w.name} built, added to stock`), s.team, 'build');
  }

  enqueue(specId: string, paid = 0): boolean {
    if (this.queue.length >= QUEUE_MAX) return false;
    this.queue.push({ specId, progress: 0, paid });
    return true;
  }

  update(world: World, s: Structure, dt: number): void {
    if (!s.active) return;
    this.updateGuns(world, s, dt);
    if (this.queue.length === 0) return;
    const item = this.queue[0];
    const spec = SPECS[item.specId];
    // Hasarlı fabrika yavaş üretir
    item.progress += (dt / spec.buildTime) * (0.4 + 0.6 * (s.hp / s.maxHp));
    if (item.progress < 1) return;
    const own = s.attachedTo !== null ? world.airbaseById(s.attachedTo) : undefined;
    const base = own && own.s.active && own.freeSlots > 0 ? own : world.nearestAirbase(s.team, s.pos, (b) => b.s.active && b.freeSlots > 0);
    if (!base) {
      item.progress = 1;
      return;
    }
    this.queue.shift();
    const af = newAirframe(item.specId, s.team);
    base.addAirframe(af);
    world.log(L(`${s.name}: ${spec.name} üretildi, ${base.s.name} hangarına teslim edildi`, `${s.name}: ${spec.name} built, delivered to the ${base.s.name} hangar`), s.team, 'build');
    // Tekrar: yeni sipariş yeniden ödenir; para yetmezse tekrar durur
    if (this.repeat && !world.orderAircraft(s, item.specId)) {
      this.repeat = false;
      world.log(L(`${s.name}: para yetmediği için tekrarlı üretim durdu`, `${s.name}: repeat production stopped, not enough money`), s.team, 'build');
    }
  }
}
