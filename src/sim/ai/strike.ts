// Pike bombardımanı (kol içinde sırayla, arka arkaya dalış).
//
// sıra bekleme → intikal → dalış (hedef ~68° aşağıda; ters dönüp burnu sok, hava frenleri) → bırakma →
// yüksek G toparlanma → bomba kaldıysa açılıp yeniden → toplanma noktası.
// Dalışta bombanın düşeceği nokta sürekli hesaplanır; nişan noktası isabet noktası hedefe oturana kadar
// düzeltilir (bomba yerçekimiyle uçuş yolunun altına düştüğü için pilot hedefin biraz ötesine nişan alır).

import { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Brain } from './brain';
import type { FlyCommand } from '../aircraft/pilot';
import type { World } from '../world';
import type { Structure } from '../structures/structure';
import { DEG, G, angleBetween, gauss } from '../../core/math';
import { headingWithAlt, orbitDir } from './nav';
import { aaJink, avoidAA } from './aaEvade';
import { groundLevel } from '../terrain';
import { L } from '../../i18n';

const _err = new Vector3();
const _to = new Vector3();
const _p = new Vector3();

/** Bomba şu an bırakılsa yere nereye düşer (sürüklemesiz balistik). */
/**
 * Uçaksavar bastırma: hedefin çevresindeki (yarıçap içinde) en yakın, yıkılmamış düşman uçaksavar bataryası. Taarruz
 * ve pike kollarında bastırma görevli uçaklar önce bunlara saldırır.
 */
export function flakTarget(world: World, team: number, center: Vector3, radius = 3500): Structure | null {
  let best: Structure | null = null;
  let bestD = radius;
  for (const s of world.structures) {
    if (s.team === team || s.destroyed || s.kind !== 'aa') continue;
    const d = Math.hypot(s.pos.x - center.x, s.pos.z - center.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function predictImpact(ac: Aircraft, groundY: number, out: Vector3): Vector3 {
  const vx = ac.fwd.x * ac.speed;
  const vy = ac.fwd.y * ac.speed;
  const vz = ac.fwd.z * ac.speed;
  const h = Math.max(ac.pos.y - groundY, 0);
  const t = (vy + Math.sqrt(vy * vy + 2 * G * h)) / G;
  return out.set(ac.pos.x + vx * t, groundY, ac.pos.z + vz * t);
}

/** Toplanma noktası: hedefin yaklaşma yönüne göre ötesi. */
export function rallyPoint(ac: Aircraft, target: Vector3, out: Vector3): Vector3 {
  const a = ac.flight?.approachDir;
  const ax = a ? a.x : 1;
  const az = a ? a.z : 0;
  return out.set(target.x + ax * 5000, 0, target.z + az * 5000);
}

/** Saldırı öncesi bekleme noktası: hedefin bu tarafında. */
export function holdPoint(ac: Aircraft, target: Vector3, dist: number, out: Vector3): Vector3 {
  const a = ac.flight?.approachDir;
  const ax = a ? a.x : 1;
  const az = a ? a.z : 0;
  return out.set(target.x - ax * dist, 0, target.z - az * dist);
}

/** Kol sırasıyla saldırı başlatma: sıradaki benim ve aralık doldu mu. */
export function mayStartAttack(ac: Aircraft, world: World, interval: number): boolean {
  const fl = ac.flight;
  if (!fl) return true;
  const order = fl.alive.filter((m) => !m.brain.detached);
  const myIndex = order.indexOf(ac);
  if (myIndex < 0) return true;
  const startedCount = order.filter((m) => m.brain.attack.started).length;
  if (myIndex !== startedCount && myIndex > startedCount) return false;
  if (world.time < fl.nextAttackTime) return false;
  fl.nextAttackTime = world.time + interval;
  return true;
}

export function diveBombCommand(ac: Aircraft, brain: Brain, world: World, _dt: number, cmd: FlyCommand): void {
  const fl = ac.flight;
  const st = brain.attack;
  const p = fl?.plan;
  let gt = p && p.targetStructureId !== null ? world.structureById(p.targetStructureId) : undefined;
  // Uçaksavar bastırma görevlisi önce hedefin çevresindeki bataryaya dalar (kalmayınca asıl hedefe)
  if (gt && p?.task === 'flak') {
    const cur = st.targetId !== null ? world.structureById(st.targetId) : undefined;
    const aa = cur && !cur.destroyed && cur.kind === 'aa' ? cur : flakTarget(world, ac.team, gt.pos);
    if (aa) {
      st.targetId = aa.id;
      gt = aa;
    }
  }
  const bombs = ac.bombCount;
  const dive = ac.spec.dive ?? { diveAngle: 55, releaseAlt: 800 };
  const cruiseAlt = p?.altitude ?? ac.spec.cruiseAlt;
  if (!gt || bombs <= 0) {
    if (st.phase !== 'rally') st.phase = 'rally';
  }
  if (gt && !st.started && st.phase !== 'rally') {
    if (mayStartAttack(ac, world, 7)) {
      st.started = true;
      st.phase = 'ingress';
      st.aimOffset.set(0, 0, 0);
      const r = gt.def.radius * 0.35;
      // Pilotun nişan hatası (pike nişangâhı araştırması azaltır)
      const err = (28 / ac.skill) * ac.mods.diveAimMul * ac.mods.strikeAimMul;
      st.aimPoint.set(gt.pos.x + (Math.random() - 0.5) * r + gauss() * err, gt.pos.y, gt.pos.z + (Math.random() - 0.5) * r + gauss() * err);
    } else {
      holdPoint(ac, gt.pos, 6000, _p);
      orbitDir(cmd.dir, ac, _p, 1600, cruiseAlt);
      cmd.speed = ac.spec.cruiseSpeed * 0.9;
      brain.status = L('Dalış sırasını bekliyor', 'Waiting for dive turn');
      return;
    }
  }
  const tp = st.aimPoint;
  const dx = tp.x - ac.pos.x;
  const dz = tp.z - ac.pos.z;
  const dh = Math.hypot(dx, dz);
  const h = ac.pos.y - tp.y;

  switch (st.phase) {
    case 'ingress': {
      headingWithAlt(cmd.dir, ac, dx, dz, cruiseAlt);
      avoidAA(ac, world, cmd.dir, tp);
      cmd.speed = ac.spec.cruiseSpeed;
      cmd.maxG = 2.5;
      cmd.turnGain = 1.2;
      brain.status = `${L('Hedefe intikal', 'Heading to target')}: ${gt!.name} (${(dh / 1000).toFixed(1)} km)`;
      const depression = Math.atan2(h, dh);
      // Burnu basmak birkaç saniye sürer: dalışa hedef dalış açısının biraz önünde başlanır
      if (depression > (dive.diveAngle - 8) * DEG) {
        const ahead = (dx * ac.fwd.x + dz * ac.fwd.z) / Math.max(dh, 1) > 0.3;
        if (ahead && h > dive.releaseAlt + 600) {
          st.phase = 'dive';
          st.aimOffset.set(0, 0, 0);
          world.log(L(`${ac.callsign} pike dalışına geçti`, `${ac.callsign} rolled into its dive`), ac.team, 'strike');
        } else st.phase = 'reposition';
      }
      break;
    }
    case 'dive': {
      predictImpact(ac, tp.y, st.impact);
      _err.set(tp.x - st.impact.x, 0, tp.z - st.impact.z);
      const miss = _err.length();
      // Gerekli dalış açısı: şu anki hız ve irtifada bomba (sürüklemesiz balistik) tam hedefe düşsün.
      // Her karede yeniden çözülür; uçak bu uçuş yoluna yönlenir. (Önceki integral düzeltme uçağın
      // tepki gecikmesiyle salınıyor ve yanlış düşüş süresiyle bombaları ~400 m kısa düşürüyordu.)
      const ax = dx;
      const az = dz;
      const ah = dh;
      const V = Math.max(ac.speed, 30);
      const hh = Math.max(h, 1);
      const reach = (gm: number) => {
        // vs: aşağı doğru hız; düşüş süresi t = (−vs + √(vs² + 2gh)) / g
        const vs = V * Math.sin(gm);
        return (V * Math.cos(gm) * (Math.sqrt(vs * vs + 2 * G * hh) - vs)) / G;
      };
      let lo = 0;
      let hi = 88 * DEG;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (reach(mid) > ah) lo = mid;
        else hi = mid;
      }
      const gam = (lo + hi) / 2;
      const ux = ax / Math.max(ah, 1);
      const uz = az / Math.max(ah, 1);
      cmd.dir.set(ux * Math.cos(gam), -Math.sin(gam), uz * Math.cos(gam));
      cmd.maxG = 4.5;
      cmd.turnGain = 2.2;
      cmd.throttle = 0.2;
      cmd.speed = null;
      cmd.diveBrake = true;
      cmd.minAlt = 60;
      // Dalış bilerek yapılır: ağır uçak (Ju 88) da burnu sokabilir
      cmd.maxBank = Math.PI;
      cmd.pushTheta = 1.0;
      brain.status = `${L('Pike dalışı', 'Dive')}: ${Math.round(h)} m · ${L('sapma', 'miss')} ${Math.round(miss)} m`;
      _to.set(dx, -h, dz).normalize();
      if (angleBetween(ac.fwd, _to) > 75 * DEG && h < dive.releaseAlt * 2) {
        st.phase = 'pullout';
        world.log(L(`${ac.callsign} dalışı iptal etti, yeniden deneyecek`, `${ac.callsign} aborted the dive, will try again`), ac.team, 'strike');
        break;
      }
      const steep = ac.fwd.y < -0.6 || dive.diveAngle < 60;
      // Bırakma toleransı hedefin büyüklüğüne göre (fabrika ~60 m, batarya 25 m)
      const tol = Math.max(25, (gt?.def.radius ?? 0) * 0.3);
      if (h <= dive.releaseAlt && ((miss < tol && steep) || h <= dive.releaseAlt * 0.7)) {
        brain.releaseBomb = true;
        brain.releaseAll = true;
        st.phase = 'pullout';
      }
      break;
    }
    case 'pullout': {
      let hx = ac.fwd.x;
      let hz = ac.fwd.z;
      if (hx * hx + hz * hz < 1e-4) {
        hx = ac.upv.x;
        hz = ac.upv.z;
      }
      const l = Math.hypot(hx, hz) || 1;
      cmd.dir.set(hx / l, 0.45, hz / l);
      cmd.maxG = ac.spec.nMax * 0.9;
      cmd.turnGain = 5;
      cmd.throttle = 1;
      cmd.speed = null;
      cmd.minAlt = 60;
      brain.status = L('Toparlanma: yüksek G çekiş', 'Pull-out: high-G recovery');
      if (ac.fwd.y > 0.12) st.phase = ac.bombCount > 0 ? 'reposition' : 'rally';
      break;
    }
    case 'reposition': {
      headingWithAlt(cmd.dir, ac, -dx, -dz, cruiseAlt);
      const jink = aaJink(ac, world, cmd.dir);
      cmd.speed = ac.spec.cruiseSpeed;
      cmd.maxG = 2.5;
      brain.status = jink ? L('Yeniden dalış için açılıyor: uçaksavara karşı kaçamak', 'Opening out for another dive: jinking against flak') : L('Yeniden dalış için açılıyor', 'Opening out for another dive');
      if (dh > 4500 && h > cruiseAlt * 0.6 - tp.y) st.phase = 'ingress';
      break;
    }
    default:
      rally(ac, brain, gt?.pos ?? ac.pos, cmd);
  }
}

export function rally(ac: Aircraft, brain: Brain, target: Vector3, cmd: FlyCommand): void {
  const st = brain.attack;
  st.phase = 'rally';
  st.done = true;
  rallyPoint(ac, target, _p);
  orbitDir(cmd.dir, ac, _p, 1500, groundLevel(_p.x, _p.z) + 1200);
  cmd.speed = ac.spec.cruiseSpeed;
  cmd.maxG = 2.5;
  brain.status = L('Toplanma noktasında, kolu bekliyor', 'At the rally point, waiting for the flight');
}
