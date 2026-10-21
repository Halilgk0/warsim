// Görsel tespit ve tehdit algısı.
//
// Pilot düşmanı ancak görürse bilir: menzil (hedef boyutuna göre), bakış açısı (arka ve arka-alt kör nokta),
// arazi görüş hattı. Görülen temas kolla (telsiz araştırmasıyla tüm takımla) paylaşılır.
// Bu yüzden arkadan/yukarıdan gelen sürpriz dalış (bounce) ilk atışı alabilir.

import { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { World } from '../world';
import type { FlightContact } from './flightGroup';
import { lineOfSight } from '../terrain';
import { DEG, angleBetween, clamp, smoothstep } from '../../core/math';

const _to = new Vector3();

/**
 * Hedefin göze çarpması: sıkı düzende uçan kalabalık kol tek uçaktan çok daha uzaktan görülür; ~7 km üstünde
 * motorların bıraktığı yoğuşma izi (kontrail) kilometrelerce uzanır. Alman avcıları B-17 kutularını genelde bu izlerden
 * buldu (devriye, 12 km yakınından geçen dokuz B-17'yi 7,5 km'ye gelene kadar göremiyordu).
 */
export function visibility(e: Aircraft): number {
  let n = 1;
  if (e.flight) for (const m of e.flight.members) if (m !== e && m.status === 'flying' && m.pos.distanceToSquared(e.pos) < 1500 * 1500) n++;
  const formation = Math.min(2, 1 + 0.25 * Math.log2(n));
  const contrail = 1 + 0.8 * smoothstep(6800, 8200, e.pos.y);
  return formation * contrail;
}

export function perceive(ac: Aircraft, world: World, own: Map<number, FlightContact>): void {
  const t = world.time;
  const contacts = ac.flight ? ac.flight.contacts : own;
  const share = world.teams[ac.team].research.has('radio');
  const crewed = ac.spec.crew > 1;
  for (const e of world.aircraft) {
    if (e.team === ac.team || !e.airborne) continue;
    const d = ac.pos.distanceTo(e.pos);
    // Gözü üstünde olan hedef (takip edilen) daha uzaktan izlenebilir
    const tracked = ac.brain.target === e;
    const R = ac.spec.visualRange * Math.sqrt(e.spec.size / 6.5) * visibility(e) * (tracked ? 1.4 : 1);
    if (d > R) continue;
    const known = contacts.get(e.id);
    _to.subVectors(e.pos, ac.pos).divideScalar(Math.max(d, 1));
    const front = ac.fwd.dot(_to);
    const rear = Math.min(0.9, ac.spec.rearView + ac.mods.rearViewAdd);
    // Tek kişilik avcıda arka yarı küre zor gözlenir; arkadan-üstten (güneş, kör açı) gelen saldırgan daha da zor.
    // Savaşta düşürülen pilotların çoğu saldırganı hiç görmedi.
    let aspect = front > 0.3 ? 1 : front > -0.5 ? 0.75 : crewed ? 0.8 : rear * 0.6;
    if (!crewed && front < -0.3 && _to.y < -0.15) aspect *= 0.45;
    if (!crewed && front < -0.3 && _to.y > 0.1) aspect *= 0.7;
    const r = d / R;
    let p: number;
    if (known && t - known.lastSeen < (tracked ? 12 : 3)) {
      // Görülen düşmanı gözde tutmak: önde ve yanda kolay. Tek kişilik avcıda arkada kalan düşman ancak pilot arkasını
      // kolladığında görülür; uzaktaki (1,5 km ötesi küçük nokta), kanat altında kalan ya da güneşten (arka-üst) gelen
      // gözden kaçar. Enerji avcısının dalışı buradan işler: kurban saldırganı çoğu zaman son anda gördü.
      let keep = 1;
      if (!crewed && front < -0.3) {
        keep = clamp(1.4 - d / 1500, 0.05, 1) * (0.5 + rear);
        if (_to.y < -0.15) keep *= 0.5;
        else if (_to.y > 0.1) keep *= 0.7;
      }
      p = 0.93 * Math.min(1, keep);
    } else p = 0.5 * (1 - r * r) * aspect * Math.min(ac.skill, 1.2);
    if (Math.random() > p) continue;
    if (!lineOfSight(ac.pos.x, ac.pos.y, ac.pos.z, e.pos.x, e.pos.y, e.pos.z)) continue;
    if (known) known.lastSeen = t;
    else contacts.set(e.id, { id: e.id, lastSeen: t });
    if (share) world.teams[ac.team].intel.report(e, 'visual', t);
  }
}

/** Bilinen temaslar arasında, arkamda ve burnu bana dönük en yakın düşman. */
export function findThreat(ac: Aircraft, world: World, contacts: Map<number, FlightContact>): Aircraft | null {
  let best: Aircraft | null = null;
  let bestD = Infinity;
  // Ateş altındaysa saldırganı mutlaka fark eder. Önümüzdeki uçaktan gelen karşı ateş (saldırdığımız bombardıman
  // uçağının ya da Bf 110'un nişancısı) kaçış sebebi değildir: pilot saldırısını sürdürür (önden dalan avcı ilk
  // nişancı mermisinde saldırıyı bırakıp kaçıyor, B-17'ye hiç ateş edemiyordu). Bombardıman uçağı da kovalayamaz:
  // nişancısından kaçmak için kutunun yanında savunma manevrasına (kırılma, kaçamak) girmek uzaklaşmayı geciktirir
  if (world.time - ac.lastHitTime < 2.5 && ac.lastHitFrom !== null) {
    const a = world.aircraftById(ac.lastHitFrom);
    _to.subVectors(ac.pos, a?.pos ?? ac.pos).normalize();
    const inFront = !!a && ac.fwd.dot(_to) < -0.3;
    if (a && a.airborne && a.team !== ac.team && !inFront && a.spec.role !== 'bomber') {
      contacts.set(a.id, { id: a.id, lastSeen: world.time });
      best = a;
      bestD = a.pos.distanceTo(ac.pos) * 0.5;
    }
  }
  for (const c of contacts.values()) {
    // Son anlarda görülmeyen düşmana tepki verilemez (kör noktadan yaklaşan saldırgan ancak görülünce ya da ateş
    // açınca fark edilir)
    if (world.time - c.lastSeen > 2.5) continue;
    const e = world.aircraftById(c.id);
    if (!e || !e.airborne || !e.armed || e.spec.role === 'bomber') continue;
    const d = e.pos.distanceTo(ac.pos);
    if (d > 1600 || d >= bestD) continue;
    _to.subVectors(ac.pos, e.pos).divideScalar(Math.max(d, 1));
    const eAta = angleBetween(e.fwd, _to);
    const behindMe = ac.fwd.dot(_to) > 0.17;
    // Kırılma zamanlaması: saldırgan atış menziline (~450 m) girmesine 3 sn kalana kadar beklenir. Erken kırılan
    // pilot dalışla gelen saldırgana dönüşün içine kesme ve atış fırsatı verir (dal-vur hiç işlemiyordu: savunma 1,6 km'de
    // dönüp her geçişi boşa çıkarıyordu); uzaktan izleyip yaklaşamayan takipçi de tehdit değildir.
    if (d > 900) {
      const closing = e.speed * e.fwd.dot(_to) - ac.speed * ac.fwd.dot(_to);
      if (closing < 3) continue;
    }
    if (eAta < 30 * DEG && behindMe && (e.brain.target === ac || eAta < 12 * DEG)) {
      best = e;
      bestD = d;
    }
  }
  return best;
}
