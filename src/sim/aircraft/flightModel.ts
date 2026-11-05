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
/** Yan kayışın sürükleme çarpanı: gövde yana dönük uçar, temiz uçak fazla hızını böyle atar. */
export const SIDESLIP_DRAG = 1.6;
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
/** Kuyruk üstü yer açısı (derece): çizimde ana teker ile kuyruk tekerinin altından geçen doğru. Yoksa 11. */
const TAIL_ANGLE: Record<string, number> = { lancaster: 9.7, b17g: 5.3, ju88a4: 12, he111: 9.4, blenheim: 13.4, pe2: 11.4, mosquito: 12.9, bf110c: 11.7, ad4: 13.8, sb2c: 13.3, sbd3: 11.4, ju87d: 12.6, ju87b: 12.6, il10: 9.8, il2m3: 10.6, il2: 10.6, seafury: 14.6, a6m2: 11.5, i16: 17.3, f8f: 13.3, f4u4: 12.7, f6f5: 11.6, p40e: 12.5, la7: 13.8, yak3: 10, p47d: 12.5, typhoon: 12.8, fw190a5: 14.5, p51d: 12, bf109g: 14.5, bf109f: 14.5, bf109e: 14.5, };

/** Kuyruk tekerlekli uçağın yerde durduğu burun açısı (derece). */
export function groundAngle(spec: AircraftSpec): number {
  return TAIL_ANGLE[spec.id] ?? 11;
}

export function gearHeight(spec: AircraftSpec): number {
  // MiG-15 alçak durur (kısa takım; gövde ekseni yerden ~1,55 m)
  if (spec.id === 'mig15') return 1.55;
  // Hurricane çizimden: ana teker pervane ekseninin 2,15 m altında; 11° kuyruk üstü duruşta 1,97 (ikisinin ortası)
  if (spec.id === 'bf109e') return 1.61;
  if (spec.id === 'bf109f') return 1.61;
  if (spec.id === 'bf109g') return 1.61;
  if (spec.id === 'p51d') return 1.95;
  if (spec.id === 'fw190a5') return 2;
  if (spec.id === 'typhoon') return 2.31;
  if (spec.id === 'p47d') return 2.17;
  if (spec.id === 'yak3') return 1.68;
  if (spec.id === 'la7') return 1.75;
  if (spec.id === 'p40e') return 2.11;
  if (spec.id === 'f6f5') return 2.29;
  if (spec.id === 'f4u4') return 2.28;
  if (spec.id === 'f8f') return 1.99;
  if (spec.id === 'i16') return 1.46;
  if (spec.id === 'a6m2') return 1.69;
  if (spec.id === 'seafury') return 2.15;
  if (spec.id === 'il2') return 2.03;
  if (spec.id === 'il2m3') return 2.03;
  if (spec.id === 'il10') return 1.95;
  if (spec.id === 'ju87b') return 2.27;
  if (spec.id === 'ju87d') return 2.27;
  if (spec.id === 'sbd3') return 1.83;
  if (spec.id === 'sb2c') return 2.2;
  if (spec.id === 'ad4') return 2.33;
  if (spec.id === 'bf110c') return 2.37;
  if (spec.id === 'mosquito') return 2.05;
  if (spec.id === 'p38j') return 1.87;
  if (spec.id === 'pe2') return 2.38;
  if (spec.id === 'blenheim') return 2.3;
  if (spec.id === 'he111') return 2.37;
  if (spec.id === 'ju88a4') return 2.6;
  if (spec.id === 'b25j') return 2.26;
  if (spec.id === 'b17g') return 2.37;
  if (spec.id === 'lancaster') return 3.19;
  if (spec.id === 'a26b') return 2.16;
  if (spec.id === 'b29') return 2.95;
  if (spec.id === 'hurricane1') return 2.06;
  // Spitfire: ana teker pervane ekseninin 1,89 m altında, 11° duruşta 1,65
  if (spec.id === 'spitfire1' || spec.id === 'spitfire5' || spec.id === 'spitfire9') return 1.77;
  // Çizimden: F-86 ve F-84 de kısa takımlı (karın yerden ~0,85 m)
  if (spec.id === 'f86f') return 1.72;
  if (spec.id === 'f84g') return 1.62;
  if (spec.id === 'f80c') return 1.45;
  if (spec.id === 'me262') return 1.88;
  if (spec.id === 'meteor3') return 1.62;
  if (spec.id === 'vampire') return 1.2;
  if (spec.id === 'he162') return 1.13;
  if (spec.id === 'ar234') return 1.45;
  if (spec.id === 'canberra') return 1.6;
  if (spec.id === 'il28') return 2.48;
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
  if (ctl.sideslip) cd0Mul *= SIDESLIP_DRAG;
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
  if (s.tailDragger) pitch = groundAngle(s) * (1 - clamp(ac.speed / (stallSpeed(ac) * 0.75), 0, 1));
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
