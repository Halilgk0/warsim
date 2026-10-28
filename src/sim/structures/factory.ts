import type { Structure } from './structure';
import type { World } from '../world';
import { SPECS } from '../aircraft/specs';
import { newAirframe } from './airbase';
import { L } from '../../i18n';

export interface ProductionItem {
  specId: string;
  progress: number;
  /** Siparişte ödenen tutar (iptalde iade için). */
  paid: number;
}

/** Uçak fabrikası: sırayla üretir, bitince en yakın uygun hava üssüne teslim eder. */
export class Factory {
  readonly queue: ProductionItem[] = [];
  /** Kuyruk boşalınca kendiliğinden tekrar et. */
  repeat = false;

  enqueue(specId: string, paid = 0): boolean {
    if (this.queue.length >= 8) return false;
    this.queue.push({ specId, progress: 0, paid });
    return true;
  }

  update(world: World, s: Structure, dt: number): void {
    if (!s.active || this.queue.length === 0) return;
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
