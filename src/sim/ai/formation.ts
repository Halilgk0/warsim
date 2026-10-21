// Formasyon geometrisi ve formasyon tutma.

import { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { FlyCommand } from '../aircraft/pilot';
import { stallSpeed } from '../aircraft/flightModel';
import { clamp } from '../../core/math';

export type FormationType = 'vic' | 'echelonR' | 'echelonL' | 'finger4' | 'lineAbreast' | 'trail' | 'box';

export const FORMATION_NAMES: Record<FormationType, string> = {
  vic: 'Kama (V)',
  echelonR: 'Sağ kademe',
  echelonL: 'Sol kademe',
  finger4: 'Dörtlü parmak',
  lineAbreast: 'Yan yana',
  trail: 'Kol (arka arkaya)',
  box: 'Savaş kutusu',
};

export interface SlotOffset {
  right: number;
  back: number;
  up: number;
}

/** Liderin yatay eksenine göre i. sıranın yeri (m). spacing: komşu uçak aralığı. */
export function slotOffset(type: FormationType, i: number, spacing: number): SlotOffset {
  if (i <= 0) return { right: 0, back: 0, up: 0 };
  const S = spacing;
  const row = Math.ceil(i / 2);
  const side = i % 2 === 1 ? 1 : -1;
  switch (type) {
    case 'vic':
      return { right: side * S * row, back: S * row * 0.9, up: -8 * i };
    case 'echelonR':
      return { right: S * i, back: S * 0.8 * i, up: -6 * i };
    case 'echelonL':
      return { right: -S * i, back: S * 0.8 * i, up: -6 * i };
    case 'lineAbreast':
      return { right: side * S * 1.2 * row, back: 0, up: 0 };
    case 'trail':
      return { right: 0, back: S * 1.4 * i, up: -10 * i };
    case 'finger4': {
      // Lider, solda kanat adamı; sağda eleman lideri ve onun kanat adamı. 4'ten fazlası tekrarlanır.
      const grp = Math.floor(i / 4);
      const k = i % 4;
      const gx = grp * S * 4;
      const gb = grp * S * 1.5;
      if (k === 1) return { right: gx - S, back: gb + S * 0.7, up: -10 };
      if (k === 2) return { right: gx + S * 1.6, back: gb + S * 0.5, up: 15 };
      if (k === 3) return { right: gx + S * 2.6, back: gb + S * 1.2, up: 5 };
      return { right: gx, back: gb, up: 0 };
    }
    case 'box': {
      // 3'lü V'ler: önde lider grubu, sağ-yukarıda yüksek grup, sol-aşağıda alçak grup
      const g = Math.floor(i / 3);
      const k = i % 3;
      const base = [
        { right: 0, back: 0, up: 0 },
        { right: S * 1.3, back: S * 1.1, up: 90 },
        { right: -S * 1.3, back: S * 1.1, up: -90 },
        { right: 0, back: S * 2.2, up: 30 },
      ][g % 4];
      const v = k === 0 ? { r: 0, b: 0 } : { r: (k === 1 ? 1 : -1) * S * 0.75, b: S * 0.6 };
      return { right: base.right + v.r, back: base.back + v.b, up: base.up - 10 * k };
    }
  }
}

export function formationSpacing(ac: Aircraft, lowLevel: boolean): number {
  const big = ac.spec.engines > 1;
  return (big ? 130 : 110) * (lowLevel ? 1.6 : 1);
}

const _fh = new Vector3();
const _rh = new Vector3();
const _slot = new Vector3();
const _aim = new Vector3();
const _tmp = new Vector3();

/** Formasyon noktasının dünya konumu. */
export function slotWorld(leader: Aircraft, off: SlotOffset, out: Vector3): Vector3 {
  _fh.set(leader.fwd.x, 0, leader.fwd.z);
  if (_fh.lengthSq() < 1e-4) _fh.set(0, 0, -1);
  _fh.normalize();
  _rh.set(-_fh.z, 0, _fh.x);
  return out.copy(leader.pos).addScaledVector(_rh, off.right).addScaledVector(_fh, -off.back).setY(leader.pos.y + off.up);
}

/**
 * Eskort zikzakı: korunan kol yavaşsa (Stuka ~290 km/sa, He 111 ~330 km/sa) eskort onun hızında uçmaz; kendi seyir
 * hızında istasyon noktasının iki yanına S dönüşleriyle uçar, ortalama ilerleme hızı kolunkine eşit olur. Bombardıman
 * hızında asılı duran eskort baskın yediğinde enerjisi yoktu ve yavaş dönüş savaşına düşüyordu (Bf 109'un yakın eskort
 * emriyle 1940 yazındaki kayıpları). Kolun tüm üyeleri ortak yönle (`sign`) ve kendi istasyonlarına göre döner.
 */
export function escortWeave(ac: Aircraft, escortee: Aircraft, off: SlotOffset, st: { sign: number }, lead: boolean, cmd: FlyCommand): number {
  slotWorld(escortee, off, _slot);
  const dist = _slot.distanceTo(ac.pos);
  const vB = escortee.speed;
  const vE = Math.min(Math.max(ac.spec.cruiseSpeed, vB * 1.25), ac.spec.vMax * 0.88);
  if (dist > 2200 || vE < vB * 1.1) return holdFormation(ac, escortee, off, cmd);
  _tmp.subVectors(ac.pos, _slot);
  const lat = _tmp.dot(_rh);
  const along = -_tmp.dot(_fh);
  // Yön değişimi liderden: istasyonun ~700 m ötesine geçince öbür yana
  if (lead) {
    if (lat > 700) st.sign = -1;
    else if (lat < -700) st.sign = 1;
  }
  // İleri hız ihtiyacı: istasyon öndeyse açı daralır (daha hızlı ilerle), gerideyse açılır
  const need = clamp(vB + along * 0.04, vB * 0.5, vE * 0.97);
  const theta = Math.acos(clamp(need / vE, -1, 1));
  const c = Math.cos(theta);
  const sn = Math.sin(theta) * st.sign;
  cmd.dir.set(_fh.x * c + _rh.x * sn, clamp((_slot.y - ac.pos.y) * 0.004, -0.2, 0.2), _fh.z * c + _rh.z * sn);
  cmd.speed = vE;
  cmd.maxG = 2.5;
  return dist;
}

/** Lidere göre formasyon yerini tutan uçuş komutu. Uzaksa kestirmeden katılır. */
/**
 * Katılırken tırmanış açısını hız payıyla sınırla (nav.headingWithAlt ile aynı kural): formasyon yeri çok yukarıdaysa
 * bombalı Ju 87 doğrudan oraya yönelip tutunma hızının hemen üstünde asılı kalıyor, liderin kilometrelerce gerisine
 * düşüyordu. Sıkı formasyon tutuşunda (2,5 km içi) yalnız avcı dışındaki ağır uçaklara uygulanır: bol güçlü avcıda
 * dalaş başındaki kol düzenini bozuyordu.
 */
function limitClimb(ac: Aircraft, dir: Vector3): void {
  const h = Math.hypot(dir.x, dir.z);
  if (h < 1e-3) return;
  const vs = stallSpeed(ac);
  const energy = clamp((ac.speed - vs * 1.3) / (vs * 0.9), 0, 1);
  const max = 0.36 * energy * h;
  if (dir.y > max) dir.y = max;
}

export function holdFormation(ac: Aircraft, leader: Aircraft, off: SlotOffset, cmd: FlyCommand, minAgl?: number): number {
  slotWorld(leader, off, _slot);
  const dist = _slot.distanceTo(ac.pos);
  const s = ac.spec;
  if (dist > 2500) {
    // Katılma: liderin ileride olacağı yere kes
    const lead = Math.min(dist / Math.max(ac.speed, 50), 40);
    leader.velocity(_tmp);
    _aim.copy(_slot).addScaledVector(_tmp, lead * 0.7);
    cmd.dir.subVectors(_aim, ac.pos);
    limitClimb(ac, cmd.dir);
    cmd.speed = Math.min(s.vMax * 0.95, leader.speed + 40);
    cmd.maxG = 3;
    return dist;
  }
  _aim.copy(_slot).addScaledVector(_fh, Math.max(250, leader.speed * 2.5));
  cmd.dir.subVectors(_aim, ac.pos);
  if (s.role !== 'fighter') limitClimb(ac, cmd.dir);
  const along = _tmp.subVectors(_slot, ac.pos).dot(_fh);
  cmd.speed = clamp(leader.speed + along * 0.07, stallSpeed(ac) * 1.35, s.vMax);
  cmd.maxG = 3;
  if (minAgl !== undefined) cmd.minAlt = minAgl;
  return dist;
}
