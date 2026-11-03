// Fiziğe dayalı uçuş modeli (nokta kütle + yönelim), standart atmosferde.
//
// - Kaldırma gövde üst ekseni boyunca n·g ivme üretir; yerçekimi uçuş yolunu ayrıca büker.
// - Kullanılabilir G = q·S·CLmax / W: hız, irtifa (yoğunluk) ve ağırlıkla değişir. Yüksekte uçak daha geniş döner,
//   bombasını atan uçak hafifler ve çevikleşir.
// - Sürükleme = parazit + indüklenmiş + dalga (Mach). Sert dönüş enerji yakar, ses hızına yaklaşmak duvara çarpmaktır.
// - İtki: pistonlu motorda güç / hız (pervane), irtifayla kritik irtifanın üstünde düşer; jette yoğunlukla azalır
//   ve motor devri gecikmeyle oturur. Acil güç (WEP) kısa süre fazladan güç verir.
// - Hız değişimi = (itki − sürükleme) / kütle − g·sin(γ): tırmanış hız yer, dalış hız kazandırır.
// - Hasar: motor hasarı itkiyi, kumanda hasarı yuvarlanmayı, kanat hasarı G sınırını düşürür.

import { Vector3 } from 'three';
import type { Aircraft } from './aircraft';
import type { AircraftSpec } from './specs';
import { damageEffects } from './damage';
import { groundLevel } from '../terrain';
import { sigma, soundSpeed } from '../atmosphere';
import { dragAt, fuelFlowAt, liftLimitG, pitchAuthority, rollRateAt, stallSpeedAt, sustainableLoad, thrustAt } from './aero';
import { DEG, G, clamp, moveToward, rotateByAngularVelocity } from '../../core/math';

/** Flap + iniş takımı açıkken parazit sürükleme çarpanı (takım ≈ +0,02, tam flap ≈ +0,03 Cd0). */
export const FLAP_DRAG = 3.2;
/** Pike freni sürükleme çarpanı. */
export const DIVE_BRAKE_DRAG = 4;
/** Acil güç azami süresi (s). */
export const WEP_LIMIT = 300;

/** Şu anki ağırlık ve irtifada tutunma kaybı olmadan (ve yapısal sınır içinde) çekilebilecek G. */
export function availableG(ac: Aircraft, v = ac.speed, nMaxMul = 1, flaps = false): number {
  const s = ac.spec;
  const h = ac.pos.y;
  const M = v / soundSpeed(h);
  return Math.min(s.nMax * nMaxMul * pitchAuthority(s, M), liftLimitG(s, v, h, ac.mass, flaps));
}

/** 1G tutunma hızı (gerçek hız) — şu anki irtifa ve ağırlıkta. */
export function stallSpeed(ac: Aircraft, flaps = false): number {
  return stallSpeedAt(ac.spec, Math.max(ac.pos.y, 0), ac.mass, flaps);
}

/** Köşe hızı: tutunma sınırının yapısal sınıra eşit olduğu hız (en hızlı anlık dönüş). */
export function cornerSpeed(ac: Aircraft): number {
  return stallSpeed(ac) * Math.sqrt(ac.spec.nMax);
}

const FULL_POWER = { throttle: 1, spool: 1, wep: true, afterburner: false };

/**
 * Şu anki hız ve irtifada tam güçle hız kaybetmeden sürdürülebilen G (itki = parazit + indüklenmiş sürükleme).
 * Azami hızın üstünde (dalış sonrası) 1'in altına düşer: her dönüş hız yakar.
 */
export function sustainedG(ac: Aircraft): number {
  const s = ac.spec;
  const v = Math.max(ac.speed, 20);
  const h = Math.max(ac.pos.y, 0);
  const fx = damageEffects(ac.damage);
  const T = thrustAt(s, v, h, FULL_POWER, ac.mods, fx.thrustMul);
  const cd0Mul = (1 + storesDrag(ac)) * fx.dragMul;
  return sustainableLoad(s, v, h, ac.mass, T, cd0Mul, s.nMax);
}

/** Kalkışta tekerleklerin yerden kesildiği hız. */
export function rotateSpeed(ac: Aircraft): number {
  return stallSpeed(ac) * 1.15;
}

/** Yaklaşma (iniş) hızı: flaplı tutunma hızının 1,3 katı. */
export function approachSpeed(ac: Aircraft): number {
  return stallSpeed(ac, true) * 1.3;
}

/** Model merkezinin tekerleklere yüksekliği. */
export function gearHeight(spec: AircraftSpec): number {
  // MiG-15 alçak durur (kısa takım; gövde ekseni yerden ~1,55 m)
  if (spec.id === 'mig15') return 1.55;
  // Çizimden: F-86 ve F-84 de kısa takımlı (karın yerden ~0,85 m)
  if (spec.id === 'f86f') return 1.72;
  if (spec.id === 'f84g') return 1.62;
  if (spec.id === 'f80c') return 1.45;
  if (spec.id === 'me262') return 1.88;
  if (spec.id === 'meteor3') return 1.62;
  if (spec.id === 'vampire') return 1.2;
  return spec.span > 25 ? 3.4 : spec.engines > 1 ? 2.6 : 1.9;
}

/** En iyi süzülme oranı (motor durmuş, pervane yel değirmeni). */
export function glideRatio(spec: AircraftSpec): number {
  const AR = (spec.span * spec.span) / spec.wingArea;
  return 0.5 * Math.sqrt((Math.PI * spec.oswald * AR) / (spec.cd0 * 1.35));
}

/** Gösterge hızı (m/s). */
export function iasOf(ac: Aircraft): number {
  return ac.speed * Math.sqrt(sigma(Math.max(ac.pos.y, 0)));
}

export function machOf(ac: Aircraft): number {
  return ac.speed / soundSpeed(Math.max(ac.pos.y, 0));
}

/** Dış yüklerin parazit sürüklemeye etkisi. */
function storesDrag(ac: Aircraft): number {
  return ac.storesDrag;
}

const _gPerp = new Vector3();
const _aPerp = new Vector3();
const _w = new Vector3();

export function engineRunning(ac: Aircraft): boolean {
  return ac.totalFuel > 0;
}

/** Gaz kolu → motor devri; acil güç süresi. */
function updateEngine(ac: Aircraft, dt: number): void {
  const e = ac.spec.engine;
  const st = ac.engine;
  const ctl = ac.controls;
  st.throttle = ctl.throttle;
  if (e.kind === 'jet') {
    // Erken turbojet: düşük devirde çok yavaş hızlanır
    const rate = (dt / Math.max(e.spool, 0.5)) * (0.35 + st.spool * 1.3);
    st.spool = moveToward(st.spool, ctl.throttle, ctl.throttle > st.spool ? rate : rate * 1.6);
    st.afterburner = ctl.afterburner && !!e.abKn && st.spool > 0.95;
  } else {
    st.spool = moveToward(st.spool, ctl.throttle, dt / Math.max(e.spool, 0.2));
  }
  const canWep = ac.mods.wep && e.wep > 1 && e.kind !== 'jet' && ac.wepTime < WEP_LIMIT;
  st.wep = ctl.wep && canWep && ctl.throttle > 0.95;
  if (st.wep) ac.wepTime += dt;
  else ac.wepTime = Math.max(0, ac.wepTime - dt * 0.25);
}

export function stepFlight(ac: Aircraft, dt: number): void {
  const s = ac.spec;
  const ctl = ac.controls;
  const fx = damageEffects(ac.damage);
  const v = Math.max(ac.speed, 3);
  const h = Math.max(ac.pos.y, 0);
  const mass = ac.mass;
  const M = v / soundSpeed(h);

  // G: tutunma sınırı, yapısal sınır, yüksek Mach'ta kumanda kaybı + G artış hızı
  const nLift = liftLimitG(s, v, h, mass, ctl.flaps);
  const nAvail = Math.min(nLift, s.nMax * fx.nMaxMul * pitchAuthority(s, M));
  const nMin = -Math.min(nLift, s.nMax * 0.4);
  // Vrille: kumandalar etkisiz, uçak dönerek burnunu düşürür
  if (ac.departure > 0) {
    ac.departure -= dt;
    ctl.rollRate = ac.departSpin;
    ctl.nCmd = 0.3;
    ctl.throttle = 0;
  }
  ac.n = clamp(moveToward(ac.n, clamp(ctl.nCmd, nMin, nAvail), s.gOnset * fx.gOnsetMul * dt), nMin, nAvail);
  ac.stallRatio = Math.abs(ac.n) / Math.max(nLift, 0.01);
  // Şamandıralı karbüratör: eksi G'de yakıt kesilir; motor bir an susar, sonra toparlanır
  const fc = s.engine.floatCarb ?? 0;
  if (fc > 0 && ac.n < (fc >= 1 ? -0.1 : -0.6)) ac.carbCut = Math.max(ac.carbCut, 0.5 + 0.7 * fc);
  else if (ac.carbCut > 0) ac.carbCut = Math.max(0, ac.carbCut - dt);
  const rollMax = rollRateAt(s, v * Math.sqrt(sigma(h)), ac.mods) * fx.rollMul;
  ac.rollRate = moveToward(ac.rollRate, clamp(ctl.rollRate, -rollMax, rollMax), rollMax * 8 * dt);

  // Uçuş yolunu büken ivme: kaldırma + yerçekiminin yola dik bileşeni
  const f = ac.fwd;
  _gPerp.set(0, -G, 0).addScaledVector(f, G * f.y);
  _aPerp.copy(ac.upv).multiplyScalar(ac.n * G).add(_gPerp);
  _w.crossVectors(f, _aPerp).divideScalar(v).addScaledVector(f, ac.rollRate);
  rotateByAngularVelocity(ac.quat, _w, dt);
  ac.syncAxes();

  // Hız
  updateEngine(ac, dt);
  const thrust = engineRunning(ac) ? thrustAt(s, v, h, ac.engine, ac.mods, fx.thrustMul) * (ac.carbCut > 0 ? 0.05 : 1) : 0;
  let cd0Mul = (1 + storesDrag(ac)) * fx.dragMul;
  if (ctl.diveBrake && s.diveBrakes) cd0Mul *= DIVE_BRAKE_DRAG;
  if (ctl.flaps) cd0Mul *= FLAP_DRAG;
  // Motoru duran ya da rölantideki pervane yel değirmeni gibi frenler
  if (s.engine.kind !== 'jet') {
    if (fx.thrustMul < 0.05 || !engineRunning(ac)) cd0Mul *= 1.35;
    else if (ac.engine.spool < 0.25) cd0Mul += (0.012 / s.cd0) * (1 - ac.engine.spool / 0.25);
  }
  const drag = dragAt(s, v, h, ac.n, mass, cd0Mul, ctl.flaps);
  ac.speed = Math.max(3, ac.speed + ((thrust - drag) / mass - G * f.y) * dt);
  ac.pos.addScaledVector(ac.fwd, ac.speed * dt);
}

/** Pistte koşu: itki, yuvarlanma sürtünmesi ve fren. Yön pist yönüne kilitli. */
export function stepGround(ac: Aircraft, dt: number, rotating: boolean): void {
  const s = ac.spec;
  const ctl = ac.controls;
  const fx = damageEffects(ac.damage);
  updateEngine(ac, dt);
  const h = Math.max(ac.pos.y, 0);
  const mass = ac.mass;
  const thrust = engineRunning(ac) ? thrustAt(s, ac.speed, h, ac.engine, ac.mods, fx.thrustMul) : 0;
  const friction = (ctl.brake ? 0.42 : 0.03) * G * mass;
  // Ağırlığı tekerlekler taşır: indüklenmiş sürükleme yok
  const drag = dragAt(s, Math.max(ac.speed, 0.1), h, 0, mass, ctl.flaps ? FLAP_DRAG : 1);
  ac.speed = Math.max(0, ac.speed + ((thrust - friction - drag) / mass) * dt);
  const hd = ac.groundHeading;
  ac.pos.x += Math.sin(hd) * ac.speed * dt;
  ac.pos.z -= Math.cos(hd) * ac.speed * dt;
  ac.pos.y = groundLevel(ac.pos.x, ac.pos.z) + gearHeight(s);
  let pitch = 0;
  if (s.tailDragger) pitch = 11 * (1 - clamp(ac.speed / (stallSpeed(ac) * 0.75), 0, 1));
  if (rotating) pitch = 7;
  ac.setAttitude(hd / DEG, pitch);
  ac.n = 1;
  ac.rollRate = 0;
}

/** Şu anki yakıt akışı (kg/s), sızıntı hariç. */
export function currentFuelFlow(ac: Aircraft): number {
  const fx = damageEffects(ac.damage);
  const alive = ac.damage.engines.filter((e) => e < 1).length / ac.damage.engines.length;
  return fuelFlowAt(ac.spec, Math.max(ac.pos.y, 0), ac.engine, ac.mods) * Math.max(alive, fx.thrustMul > 0 ? 0.2 : 0);
}

/** Yakıt tüketimi; önce atılabilir tank. */
export function burnFuel(ac: Aircraft, dt: number): void {
  if (ac.totalFuel <= 0) return;
  let burn = currentFuelFlow(ac) * dt * (ac.onGround ? 0.5 : 1);
  if (ac.tankFuel > 0) {
    const t = Math.min(ac.tankFuel, burn);
    ac.tankFuel -= t;
    burn -= t;
  }
  ac.fuel = Math.max(0, ac.fuel - burn - ac.damage.fuelLeak * ac.spec.cruiseFlow * dt);
}
