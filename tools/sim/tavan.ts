// Çalıştırma: npm run sim:ceiling
// Servis tavanı ayarı: specs.ts CEILINGS'teki her uçak için, türetilmiş tavanı (en iyi tırmanışın 0,5 m/s'ye düştüğü
// irtifa) bilinen tavana eşitleyen irtifa düşüşü üssünü (lapse) bulur, tablodakiyle karşılaştırır ve değişen satırları
// yapıştırılacak biçimde yazar. Motor, ağırlık, sürükleme ya da azami hız değişince çalıştır.
import { AIRCRAFT_DEFS, CEILINGS, climbRateAt, deriveSpec, type AircraftSpec } from '../../src/sim/aircraft/specs';

/** Sürekli tavan (m): türetmedeki tablo 500 m adımlı, ayar için ince arama. */
function ceilingOf(s: AircraftSpec): number {
  const m = s.massEmpty + s.fuelKg * 0.75;
  let lo = 0;
  let hi = 20000;
  if (climbRateAt(s, hi, m) >= 0.5) return hi;
  for (let i = 0; i < 15; i++) {
    const mid = (lo + hi) / 2;
    if (climbRateAt(s, mid, m) >= 0.5) lo = mid;
    else hi = mid;
  }
  return lo;
}

const rows: Record<string, string | number>[] = [];
const changed: string[] = [];
for (const [id, [target, lapse]] of Object.entries(CEILINGS)) {
  const def = AIRCRAFT_DEFS.find((d) => d.id === id);
  if (!def) {
    rows.push({ id, durum: 'katalogda yok' });
    continue;
  }
  const now = ceilingOf(deriveSpec(def));
  // Büyük üs = daha alçak tavan
  let lo = 0.4;
  let hi = 3.5;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    CEILINGS[id][1] = mid;
    if (ceilingOf(deriveSpec(def)) > target) lo = mid;
    else hi = mid;
  }
  const fit = Math.round(((lo + hi) / 2) * 100) / 100;
  CEILINGS[id][1] = fit;
  const after = ceilingOf(deriveSpec(def));
  CEILINGS[id][1] = lapse;
  rows.push({ id, hedef: target, tablodaki: lapse, tavan: Math.round(now), bulunan: fit, sonra: Math.round(after), sinir: fit <= 0.41 || fit >= 3.49 ? 'SINIRDA' : '' });
  if (Math.abs(fit - lapse) > 0.005) changed.push(`${id}: [${target}, ${fit}]`);
}
console.table(rows);
console.log(changed.length ? `Değişen satırlar (CEILINGS'e yaz):\n  ${changed.join(', ')}` : 'Tablo güncel.');
