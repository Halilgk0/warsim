// Yatay bombardıman. IP'den (başlangıç noktası) hedefe düz ve sabit koşu.
// Lider bombardımancı nişangâhla bombanın düşeceği noktayı hesaplar, yanal hatayı küçük yön
// düzeltmeleriyle sıfırlar; düşüş noktası hedefe ulaşınca bırakır. Kol, liderin bıraktığı anda
// seri halinde bırakır: formasyon genişliği kadar bir halı deseni oluşur.
// Nişangâh hatası irtifayla büyür; gelişmiş nişangâh araştırması yarıya indirir.

import { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Brain } from './brain';
import type { FlyCommand } from '../aircraft/pilot';
import type { World } from '../world';
import { clamp, gauss } from '../../core/math';
import { headingWithAlt } from './nav';
import { predictImpact } from './strike';
import { flakWeave } from './aaEvade';
import { L } from '../../i18n';

const _i = new Vector3();
const _aim = new Vector3();

/** Seri atışta bombalar arası süre (s). */
export const STICK_INTERVAL = 0.22;

export function bombRunLeader(ac: Aircraft, brain: Brain, world: World, cmd: FlyCommand): void {
  const fl = ac.flight!;
  const p = fl.plan;
  const gt = p.targetStructureId !== null ? world.structureById(p.targetStructureId) : undefined;
  const t = world.time;
  if (!gt) return;
  if (!fl.bomb.started) {
    fl.bomb.started = true;
    const agl = Math.max(ac.pos.y - gt.pos.y, 800);
    const sigma = 75 * (agl / 4000) * ac.mods.bombsightMul * ac.mods.strikeAimMul;
    fl.bomb.aimOffset.set(gauss() * sigma, 0, gauss() * sigma);
    world.log(L(`${fl.name} bombardıman koşusuna başladı: ${gt.name}`, `${fl.name} began its bomb run: ${gt.name}`), ac.team, 'strike');
  }
  const fhx = ac.fwd.x;
  const fhz = ac.fwd.z;
  const fl2 = Math.hypot(fhx, fhz) || 1;
  const fx = fhx / fl2;
  const fz = fhz / fl2;
  if (fl.bomb.released) {
    // Bırakış sonrası: 10 sn düz, sonra eve dön
    if (t - fl.bomb.releaseTime < 10) headingWithAlt(cmd.dir, ac, fx, fz, p.altitude);
    else {
      const home = world.airbaseById(fl.returnBaseId)?.s.pos ?? ac.pos;
      headingWithAlt(cmd.dir, ac, home.x - ac.pos.x, home.z - ac.pos.z, p.altitude);
      // Bombalar atıldı: hedef bölgesinin flakından zikzakla çık
      flakWeave(ac, world, cmd.dir);
    }
    cmd.maxG = 1.8;
    brain.status = L('Bombalar atıldı: hedeften çıkış', 'Bombs away: egressing');
    return;
  }
  _aim.copy(gt.pos).add(fl.bomb.aimOffset);
  predictImpact(ac, gt.pos.y, _i);
  const ex = _aim.x - _i.x;
  const ez = _aim.z - _i.z;
  const along = ex * fx + ez * fz;
  const cross = -ex * fz + ez * fx;
  const toAimX = _aim.x - ac.pos.x;
  const toAimZ = _aim.z - ac.pos.z;
  const distAim = Math.hypot(toAimX, toAimZ);
  // Bombanın ileri atımı: yüksek ve hızlı jet bombardıman uçağında 10 km'yi aşar (sabit 9 km sınırı geç bıraktırıyordu)
  const reach = Math.max(9000, Math.hypot(_i.x - ac.pos.x, _i.z - ac.pos.z) + 3000);
  if (distAim > reach || along < -2000) {
    // Koşu yönünü yakala
    headingWithAlt(cmd.dir, ac, toAimX, toAimZ, p.altitude);
  } else {
    // Sağ = (-fz, fx). Yanal hatayı küçük yön düzeltmeleriyle sıfırla
    const k = clamp(cross / 1500, -0.3, 0.3);
    headingWithAlt(cmd.dir, ac, fx - fz * k, fz + fx * k, p.altitude);
  }
  cmd.speed = ac.spec.cruiseSpeed;
  cmd.maxG = 1.5;
  cmd.turnGain = 1;
  const bombs = ac.bombCount;
  const stickHalf = (bombs * STICK_INTERVAL * ac.speed) / 2;
  brain.status = `${L('Bombardıman koşusu', 'Bomb run')}: ${Math.round(Math.max(along, 0))} m · ${L('yanal', 'cross')} ${Math.round(cross)} m`;
  if (along <= stickHalf && distAim < reach) {
    fl.bomb.released = true;
    fl.bomb.releaseTime = t;
    world.log(L(`${fl.name}: "Bombalar bırakılıyor!"`, `${fl.name}: "Bombs away!"`), ac.team, 'strike');
  }
}

/** Kol bırakınca her uçak serisini atar. */
export function stickDrop(ac: Aircraft, brain: Brain, t: number): void {
  const fl = ac.flight;
  if (!fl || !fl.bomb.released || ac.bombCount <= 0) return;
  if (t - brain.attack.lastBomb >= STICK_INTERVAL) {
    brain.releaseBomb = true;
    brain.attack.lastBomb = t;
  }
}
