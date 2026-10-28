// Taarruz (yakın hava desteği): alçaktan, araziyi kullanarak sızma → hedefe yakın "pop-up" tırmanışı →
// sığ dalışta roket salvosu, top atışı ve küçük bombalar → alçaktan kaçış → geri dönüp yeni geçiş.
// Hedef yıkılırsa yakındaki başka düşman yapısına (ör. uçaksavar) geçer.

import { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Brain } from './brain';
import type { FlyCommand } from '../aircraft/pilot';
import type { World } from '../world';
import type { Structure } from '../structures/structure';
import { DEG, angleBetween, clamp } from '../../core/math';
import { headingWithAlt, orbitDir, terrainFollow } from './nav';
import { flakTarget, holdPoint, mayStartAttack, predictImpact, rally } from './strike';
import { aaJink, avoidAA } from './aaEvade';
import { L } from '../../i18n';

const _to = new Vector3();
const _err = new Vector3();
const _aim = new Vector3();
const _p = new Vector3();

const POPUP_DIST = 4500;
const POPUP_AGL = 850;

function startPass(ac: Aircraft, brain: Brain): void {
  const st = brain.attack;
  const left = Math.max(st.passes, 1);
  st.rocketsPass = Math.ceil(ac.rocketCount / left);
  st.bombsPass = Math.ceil(ac.bombCount / left);
  st.aimOffset.set(0, 0, 0);
}

function pickTarget(ac: Aircraft, brain: Brain, world: World): Structure | null {
  const p = ac.flight?.plan;
  let gt = brain.attack.targetId !== null ? world.structureById(brain.attack.targetId) : undefined;
  const main = p && p.targetStructureId !== null ? world.structureById(p.targetStructureId) : undefined;
  // Uçaksavar bastırma görevlisi önce hedefin çevresindeki bataryalara saldırır, kalmayınca asıl hedefe geçer
  if (p?.task === 'flak' && main && (!gt || gt.destroyed || gt.kind !== 'aa')) {
    const aa = flakTarget(world, ac.team, main.pos);
    if (aa) {
      brain.attack.targetId = aa.id;
      return aa;
    }
    // Bastırılacak batarya kalmadı: asıl hedefe
    brain.attack.targetId = main.id;
    gt = main;
  }
  if (!gt) gt = main;
  if (gt && !gt.destroyed) return gt;
  // Yakındaki başka düşman yapısı
  const ref = gt?.pos ?? ac.pos;
  let best: Structure | null = null;
  let bestD = 4000;
  for (const s of world.structures) {
    if (s.team === ac.team || s.destroyed) continue;
    const d = Math.hypot(s.pos.x - ref.x, s.pos.z - ref.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (best) brain.attack.targetId = best.id;
  return best;
}

export function attackCommand(ac: Aircraft, brain: Brain, world: World, dt: number, cmd: FlyCommand): void {
  const st = brain.attack;
  const p = ac.flight?.plan;
  const gt = pickTarget(ac, brain, world);
  const gunsLeft = ac.guns.length > 0 && ac.ammoFrac > 0.15;
  if (!gt || (!ac.hasOrdnance && !gunsLeft)) {
    rally(ac, brain, gt?.pos ?? ac.pos, cmd);
    return;
  }
  const agl = p?.agl ?? 120;
  const low = p?.lowLevel ?? true;
  if (!st.started && st.phase !== 'rally') {
    if (mayStartAttack(ac, world, 3.5)) {
      st.started = true;
      st.passes = p?.passes ?? 2;
      st.phase = 'approach';
      startPass(ac, brain);
    } else {
      holdPoint(ac, gt.pos, 7000, _p);
      if (low) {
        const dx = _p.x - ac.pos.x;
        const dz = _p.z - ac.pos.z;
        if (Math.hypot(dx, dz) > 1500) terrainFollow(cmd.dir, ac, dx, dz, agl * 1.5);
        else orbitDir(cmd.dir, ac, _p, 1300, ac.pos.y);
      } else orbitDir(cmd.dir, ac, _p, 1300, p?.altitude ?? 1200);
      cmd.speed = ac.spec.cruiseSpeed;
      brain.status = L('Taarruz sırasını bekliyor', 'Waiting for attack turn');
      return;
    }
  }
  const tp = gt.pos;
  const dx = tp.x - ac.pos.x;
  const dz = tp.z - ac.pos.z;
  const dh = Math.hypot(dx, dz);
  const h = ac.pos.y - tp.y;
  const t = world.time;

  switch (st.phase) {
    case 'approach': {
      if (low) terrainFollow(cmd.dir, ac, dx, dz, agl);
      else headingWithAlt(cmd.dir, ac, dx, dz, p?.altitude ?? 1200);
      // Hedefe giderken yoldaki (hedefin dibinde olmayan) bataryaları dolan
      avoidAA(ac, world, cmd.dir, tp);
      cmd.speed = ac.spec.vMax * 0.92;
      cmd.minAlt = Math.min(agl * 0.7, 120);
      brain.status = `${L('Alçaktan sızma', 'Low-level ingress')}: ${(dh / 1000).toFixed(1)} km`;
      if (dh < POPUP_DIST) st.phase = 'popup';
      break;
    }
    case 'popup': {
      headingWithAlt(cmd.dir, ac, dx, dz, tp.y + POPUP_AGL, 0.004);
      cmd.throttle = 1;
      cmd.speed = null;
      cmd.maxG = 3.5;
      brain.status = L('Pop-up: hedef için tırmanış', 'Pop-up: climbing for the target');
      const depression = Math.atan2(h, dh);
      if (depression > 20 * DEG || dh < 1800) {
        st.phase = 'dive';
        world.log(L(`${ac.callsign} ${gt.name} hedefine dalışa geçti`, `${ac.callsign} dives on ${gt.name}`), ac.team, 'strike');
      }
      break;
    }
    case 'dive': {
      _aim.copy(tp);
      if (st.bombsPass > 0 && st.rocketsPass <= 0) {
        predictImpact(ac, tp.y, _p);
        _err.set(tp.x - _p.x, 0, tp.z - _p.z);
        st.aimOffset.addScaledVector(_err, 1.4 * dt);
        if (st.aimOffset.length() > 300) st.aimOffset.setLength(300);
        _aim.add(st.aimOffset);
      }
      cmd.dir.subVectors(_aim, ac.pos);
      cmd.maxG = 4;
      cmd.turnGain = 2.4;
      cmd.throttle = 0.6;
      cmd.speed = null;
      cmd.minAlt = 50;
      _to.subVectors(tp, ac.pos);
      const slant = _to.length();
      const err = angleBetween(ac.fwd, _to.normalize());
      brain.status = `${L('Taarruz dalışı', 'Attack dive')}: ${Math.round(slant)} m`;
      if (st.rocketsPass > 0 && slant < 1500 && slant > 550 && err < 3 * DEG && t - st.lastShot > 0.3) {
        brain.fireRocket = true;
        st.rocketsPass -= 2;
        st.lastShot = t;
      }
      if (gunsLeft && slant < 900 && slant > 220 && err < 2.2 * DEG) brain.fireGuns = true;
      if (st.bombsPass > 0 && h < 420) {
        predictImpact(ac, tp.y, _p);
        const miss = Math.hypot(_p.x - tp.x, _p.z - tp.z);
        if ((miss < gt.def.radius + 20 || h < 260) && t - st.lastBomb > 0.18) {
          brain.releaseBomb = true;
          st.bombsPass--;
          st.lastBomb = t;
        }
      }
      if (h < 170 || slant < 260) st.phase = 'pullout';
      break;
    }
    case 'pullout': {
      let hx = ac.fwd.x;
      let hz = ac.fwd.z;
      const l = Math.hypot(hx, hz) || 1;
      hx /= l;
      hz /= l;
      cmd.dir.set(hx, 0.3, hz);
      cmd.maxG = ac.spec.nMax * 0.85;
      cmd.turnGain = 4;
      cmd.throttle = 1;
      cmd.speed = null;
      cmd.minAlt = 50;
      brain.status = L('Toparlanma ve alçaktan kaçış', 'Pulling out, escaping low');
      if (ac.fwd.y > 0.03) {
        st.phase = 'extend';
        st.phaseTime = t;
      }
      break;
    }
    case 'extend': {
      // Hedeften uzaklaş, alçakta kal (uçaksavardan arazi arkasına saklan)
      terrainFollow(cmd.dir, ac, -dx, -dz, agl, true);
      const jink = aaJink(ac, world, cmd.dir);
      cmd.speed = ac.spec.vMax;
      cmd.minAlt = Math.min(agl * 0.7, 120);
      brain.status = jink ? L('Hedeften açılıyor: uçaksavara karşı kaçamak', 'Breaking off: jinking against flak') : L('Hedeften açılıyor', 'Breaking off the target');
      if (dh > 3600 || t - st.phaseTime > 40) {
        st.passes--;
        if (st.passes <= 0 || (!ac.hasOrdnance && !gunsLeft)) st.phase = 'rally';
        else {
          st.phase = 'turn';
          startPass(ac, brain);
        }
      }
      break;
    }
    case 'turn': {
      if (low) terrainFollow(cmd.dir, ac, dx, dz, agl, false);
      else headingWithAlt(cmd.dir, ac, dx, dz, p?.altitude ?? 1200);
      cmd.speed = ac.spec.vMax * 0.9;
      cmd.maxG = 3.5;
      cmd.turnGain = 2;
      cmd.minAlt = Math.min(agl * 0.7, 120);
      brain.status = L('Yeni geçiş için dönüyor', 'Turning for another pass');
      const fh = Math.hypot(ac.fwd.x, ac.fwd.z) || 1;
      const cos = (ac.fwd.x * dx + ac.fwd.z * dz) / (fh * Math.max(dh, 1));
      if (cos > 0.85) st.phase = dh < POPUP_DIST ? 'popup' : 'approach';
      break;
    }
    default:
      rally(ac, brain, tp, cmd);
  }
  cmd.minAlt = clamp(cmd.minAlt, 40, 400);
}
