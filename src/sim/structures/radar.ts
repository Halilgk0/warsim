// Erken ihbar radarı.
//
// Tespit üç şarta bağlı:
//  1. Menzil: R ∝ RCS^(1/4) ≈ boyut^(1/2). Büyük bombardıman uçağı daha uzaktan görülür.
//  2. Görüş hattı: arazi (tepeler) ve dünya eğriliği (radar ufku). Vadide uçan uçak görünmez.
//  3. Alçak irtifa: yer yansıması (multipath) ve yer kargaşası. Hedef yere yakın ve radara göre
//     çok sığ açıdaysa yansıyan dalga doğrudan dalgayı söndürür; tespit ihtimali sert düşer.
//     Bu kör bölge radar seviyesine göre ~350 m → ~120 m.

import type { Structure } from './structure';
import type { World } from '../world';
import type { Aircraft } from '../aircraft/aircraft';
import { groundLevel, lineOfSight } from '../terrain';
import { smoothstep } from '../../core/math';
import { L } from '../../i18n';

export const RADAR_LEVELS = {
  1: { range: 80000, minAgl: 350, name: L('Erken ihbar radarı I', 'Early-warning radar I') },
  2: { range: 120000, minAgl: 120, name: L('Erken ihbar radarı II', 'Early-warning radar II') },
} as const;

export class RadarSite {
  level: 1 | 2 = 1;
  readonly scanPeriod = 5;
  scanTimer = Math.random() * 5;
  /** Render için anten açısı. */
  angle = Math.random() * Math.PI * 2;
  readonly antennaHeight = 40;
  /** Son taramada görülen temas sayısı. */
  lastCount = 0;

  get range(): number {
    return RADAR_LEVELS[this.level].range;
  }

  get minAgl(): number {
    return RADAR_LEVELS[this.level].minAgl;
  }

  update(world: World, s: Structure, dt: number): void {
    if (!s.active) return;
    if (this.level === 1 && world.teams[s.team].research.has('radar_ew2')) {
      this.level = 2;
      world.log(L(`${s.name}: radar II seviyesine yükseltildi`, `${s.name}: upgraded to radar II`), s.team, 'defense');
    }
    this.angle += (dt * Math.PI * 2) / this.scanPeriod;
    this.scanTimer -= dt;
    if (this.scanTimer > 0) return;
    this.scanTimer += this.scanPeriod;
    let count = 0;
    for (const ac of world.aircraft) {
      if (ac.team === s.team || !ac.airborne) continue;
      if (Math.random() < this.detectProbability(s, ac)) {
        world.teams[s.team].intel.report(ac, 'radar', world.time);
        count++;
      }
    }
    this.lastCount = count;
  }

  /** Bu tarama turunda uçağın görülme ihtimali (0..1). */
  detectProbability(s: Structure, ac: Aircraft): number {
    return detectProbabilityAt(s, this, ac.pos.x, ac.pos.y, ac.pos.z, ac.spec.size);
  }
}

export function detectProbabilityAt(
  s: Structure, r: RadarSite, x: number, y: number, z: number, size: number,
): number {
  const ry = s.pos.y + r.antennaHeight;
  const dx = x - s.pos.x;
  const dz = z - s.pos.z;
  const horiz = Math.hypot(dx, dz);
  const d = Math.hypot(horiz, y - ry);
  const rDet = r.range * Math.sqrt(size / 7);
  if (d > rDet) return 0;
  if (!lineOfSight(s.pos.x, ry, s.pos.z, x, y, z)) return 0;
  const agl = y - groundLevel(x, z);
  const low = smoothstep(r.minAgl * 0.4, r.minAgl * 1.3, agl);
  // Çok sığ geliş açısında yansıma kaybı (yüksek hedefte etkisiz)
  const el = Math.atan2(y - ry, Math.max(horiz, 1));
  const grazing = 0.55 + 0.45 * smoothstep(0, 0.025, el);
  const rangeFade = 1 - 0.6 * smoothstep(rDet * 0.8, rDet, d);
  return 0.95 * low * grazing * rangeFade;
}
