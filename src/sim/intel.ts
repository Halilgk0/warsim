// Takım istihbaratı: radar ve gözcülerden gelen düşman temasları.

import { Vector3 } from 'three';
import type { Aircraft } from './aircraft/aircraft';

export type ContactSource = 'radar' | 'visual';

export interface Contact {
  id: number;
  pos: Vector3;
  vel: Vector3;
  firstSeen: number;
  lastSeen: number;
  lastRadar: number;
  lastVisual: number;
  specId: string;
}

/** Bu süreden eski temas düşer (s). */
export const CONTACT_TTL = 14;

export class TeamIntel {
  readonly contacts = new Map<number, Contact>();

  report(ac: Aircraft, source: ContactSource, time: number): void {
    let c = this.contacts.get(ac.id);
    if (!c) {
      c = {
        id: ac.id, pos: new Vector3(), vel: new Vector3(), firstSeen: time, lastSeen: time,
        lastRadar: -1e9, lastVisual: -1e9, specId: ac.spec.id,
      };
      this.contacts.set(ac.id, c);
    }
    c.pos.copy(ac.pos);
    ac.velocity(c.vel);
    c.lastSeen = time;
    if (source === 'radar') c.lastRadar = time;
    else c.lastVisual = time;
  }

  /** Son bilinen konumdan tahmini şimdiki konum. */
  estimate(c: Contact, time: number, out: Vector3): Vector3 {
    return out.copy(c.pos).addScaledVector(c.vel, Math.min(time - c.lastSeen, 30));
  }

  prune(time: number, alive: (id: number) => boolean): void {
    for (const [id, c] of this.contacts) {
      if (time - c.lastSeen > CONTACT_TTL || !alive(id)) this.contacts.delete(id);
    }
  }
}
