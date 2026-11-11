// Çalıştırma: npm run sim:hits -- [uçaklar] [deneme] [rear|side]   (ör. npm run sim:hits -- spitfire1,b17g 300 rear)
// Kalibre başına düşürmek için gereken isabet: hedefe gerçek saçılımla ışın, bölgeye göre hasar.
// Ölçüt: kırıp çekilmeye zorlama (isCrippled), düşürme (fatal) ve "düşürme ya da yangın".
import { Vector3 } from 'three';
import { Aircraft } from '../../src/sim/aircraft/aircraft';
import { SPECS } from '../../src/sim/aircraft/specs';
import { applyHit, isCrippled } from '../../src/sim/aircraft/damage';
import { hitBoxOf, hitBoxTest } from '../../src/sim/aircraft/hitbox';
import { gauss } from '../../src/core/math';

const CAL: [string, number, 'small' | 'heavy' | 'cannon'][] = [
  ['7,7 mm', 0.62, 'small'], ['12,7 mm', 1.4, 'heavy'], ['20 mm MG FF', 3.8, 'cannon'], ['20 mm Hispano', 5.5, 'cannon'],
  ['20 mm MG 151', 6, 'cannon'], ['30 mm MK 108', 22, 'cannon'], ['50 mm MK 214', 80, 'cannon'],
];
const targets = (process.argv[2] ?? 'spitfire1,bf109e,hurricane1,fw190a5,p47d,he111,b17g').split(',');
const N = Number(process.argv[3] ?? 300);
const aspect = process.argv[4] ?? 'rear';
const med = (a: number[]) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const p = new Vector3();
const d = new Vector3();
const dirW = new Vector3();
console.log(`hedef / kalibre — açı: ${aspect}  (kırıldı · düşürüldü · düşürüldü-ya-da-yandı; ortanca isabet)`);
for (const id of targets) {
  const sp = SPECS[id];
  const hb = hitBoxOf(sp);
  const row: string[] = [];
  for (const [name, dmg, cal] of CAL) {
    const cr: number[] = [], kill: number[] = [], kf: number[] = [];
    for (let n = 0; n < N; n++) {
      const ac = new Aircraft(sp, 1, 'T', {});
      let hits = 0, crip = 0, dead = 0, fire = 0;
      for (let guard = 0; guard < 20000 && !dead; guard++) {
        // Atış yönü: arkadan (±15°) ya da yandan/üstten sapmalı (30–70°)
        const off = aspect === 'rear' ? (gauss() * 15 * Math.PI) / 180 : ((30 + Math.random() * 40) * Math.PI) / 180;
        const az = Math.random() * Math.PI * 2;
        // Uçak ekseninde: burun +z; mermi kuyruktan buruna doğru gider
        d.set(Math.sin(off) * Math.cos(az), Math.sin(off) * Math.sin(az), Math.cos(off)).normalize();
        // Saçılım: hedef merkezine nişan, ~1,5 m standart sapma
        const sx = gauss() * 1.5, sy = gauss() * 1.5;
        const ux = new Vector3(1, 0, 0).addScaledVector(d, -d.x).normalize();
        const uy = new Vector3().crossVectors(d, ux);
        p.copy(d).multiplyScalar(-60).addScaledVector(ux, sx).addScaledVector(uy, sy);
        const hit = hitBoxTest(hb, p, d.clone().multiplyScalar(120));
        if (!hit) continue;
        hits++;
        dirW.set(d.x, d.y, d.z); // ac.fwd = +z, ac yönelimi başlangıçta kimlik
        const r = applyHit(ac, dmg, dirW, cal, null, hit.zone);
        if (!crip && isCrippled(ac)) crip = hits;
        if (!fire && ac.damage.fire > 0) fire = hits;
        if (r.fatal) dead = hits;
      }
      cr.push(crip || 9999); kill.push(dead || 9999); kf.push(Math.min(dead || 9999, fire || 9999));
    }
    row.push(`${name}: ${med(cr)}·${med(kill)}·${med(kf)}`);
  }
  console.log(`${sp.abbr.padEnd(12)} ${row.join(' | ')}`);
}
