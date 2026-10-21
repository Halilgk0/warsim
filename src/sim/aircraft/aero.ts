// Aerodinamik ve motor formülleri. Uçuş modeli, performans türetimi (azami hız, tırmanış, tavan)
// ve arayüz grafikleri aynı fonksiyonları kullanır; ekranda yazan hız uçağın gerçekten uçtuğu hızdır.
//
//  Kaldırma:  L = q·S·CL, q = ½ρV². Kullanılabilir G = q·S·CLmax / W  → yükseklerde ve ağır yükte azalır.
//  Sürükleme: D = q·S·(Cd0 + K·CL² + ΔCd_dalga),  K = 1/(π·e·AR)
//  Dalga sürüklemesi (Lock kuralı): kritik Mach üstünde ΔCd ≈ 20·(M − Mkr)⁴, kanat tipine göre tavanlı.
//  Pistonlu motor: kritik irtifaya kadar ~sabit güç, üstünde yoğunlukla düşer; pervane itkisi T = η·P / V.
//  Pervane verimi yüksek Mach'ta (kanat ucu sıkışması) düşer: pervaneli uçak dalışta ses hızına yaklaşamaz.
//  Jet: itki ≈ T0·σ^0.75·(1 − 0,3·M + 0,45·M²): hava girişi direnci net itkiyi orta hızlarda statik değerin altına
//  indirir, yüksek Mach'ta dinamik basınç toparlar. Motor devri gecikmeli (erken jetlerde gaz tepkisi yavaş).

import type { AircraftSpec } from './specs';
import type { ModEffects } from '../mods';
import { RHO0, sigma, soundSpeed } from '../atmosphere';
import { G, smoothstep } from '../../core/math';

/**
 * Pervanenin alçak hız itki sınırı (m/s): T = ηP / (v⁴ + v1⁴)^¼. Durağan itki ηP/v1; v1'in üstünde itki hızla ideal
 * ηP/v'ye yaklaşır (100 m/s'de %95). Eski √(v² + v1²) geçişi fazla yumuşaktı: tırmanış hızlarında (75–100 m/s)
 * itkiyi %15–25 eksik veriyor, verim tavanda olsa da ağır avcıların (P-47, P-51, Hellcat) ve Hurricane'in
 * tırmanışı gerçeğin çok altında kalıyordu.
 */
const PROP_V1 = 70;

export function aspectRatio(s: AircraftSpec): number {
  return (s.span * s.span) / s.wingArea;
}

export function inducedK(s: AircraftSpec): number {
  return 1 / (Math.PI * s.oswald * aspectRatio(s));
}

/** Kritik Mach üstü dalga sürüklemesi (ΔCd). */
export function waveCd(s: AircraftSpec, M: number): number {
  const mc = s.mcrit;
  if (M <= mc) return 0;
  const lock = (m: number) => Math.min(s.cdWave, 20 * Math.pow(m - mc, 4));
  if (M < 1.05) return lock(M);
  // Ses üstünde dalga sürüklemesi tepe yaptıktan sonra yavaşça azalır
  return lock(1.05) * (0.6 + 0.4 * Math.exp(-(M - 1.05) * 3));
}

/** Mach'a bağlı azami kaldırma katsayısı (buffet). */
export function clMaxAt(s: AircraftSpec, M: number, flaps: boolean): number {
  const buffet = 1 - 0.35 * smoothstep(s.mcrit - 0.12, s.mcrit + 0.15, M);
  return s.clMax * (flaps ? 1.42 : 1) * buffet;
}

/** Yüksek Mach'ta yunuslama kumandasının etkisi (Mach tuck): 1 = tam, 0 = kumanda kilitli. */
export function pitchAuthority(s: AircraftSpec, M: number): number {
  return 1 - s.machTuck * smoothstep(s.mcrit + 0.03, s.mcrit + 0.16, M);
}

/** Kritik irtifa (m): motor tipine ve araştırmaya göre. */
export function critAltitude(s: AircraftSpec, mods: ModEffects): number {
  const e = s.engine;
  if (e.kind === 'inline') return e.critAlt + (e.twoStage ? 0 : mods.inlineCritAdd);
  return e.critAlt;
}

/** Tek motorun bu irtifada vereceği azami güç (kW, askerî güç, acil güç hariç). */
export function enginePowerKW(s: AircraftSpec, h: number, mods: ModEffects): number {
  const e = s.engine;
  let p = (e.kw ?? 0) * mods.pistonPowerMul * (e.kind === 'inline' ? mods.inlinePowerMul : mods.radialPowerMul);
  const crit = critAltitude(s, mods);
  if (h <= crit) {
    const k = Math.max(0, h) / crit;
    // Alçaktaki güç motordan motora değişir (kalkış gücü); yüksek oktan yakıt alçakta fazladan basınç (boost) verir
    const sl = e.sl ?? (e.twoStage ? 1.08 : 0.92);
    p *= (sl + (1 - sl) * k) * (1 + mods.lowAltBoost * (1 - k));
  } else {
    p *= Math.pow(sigma(h) / sigma(crit), 1.15);
  }
  return p;
}

export interface ThrustState {
  /** Gaz kolu (0..1). */
  throttle: number;
  /** Jet motor devri (0..1). Pistonlu motorda gaz kolunu doğrudan izler. */
  spool: number;
  /** Acil güç (su-metanol / WEP). */
  wep: boolean;
  /** Art yakıcı. */
  afterburner: boolean;
}


/** Toplam itki (N). engineMul: hasarlı motorların payı (0..1). */
export function thrustAt(s: AircraftSpec, v: number, h: number, st: ThrustState, mods: ModEffects, engineMul = 1): number {
  const e = s.engine;
  const M = v / soundSpeed(h);
  if (e.kind === 'jet') {
    const sg = Math.pow(sigma(h), 0.75);
    let T = (e.kn ?? 0) * 1000 * e.count * sg * (1 - 0.3 * M + 0.45 * M * M) * st.spool * mods.jetThrustMul;
    if (st.afterburner && e.abKn) T += (e.abKn - (e.kn ?? 0)) * 1000 * e.count * sg * (1 + 0.3 * M);
    return T * engineMul;
  }
  const wep = st.wep && mods.wep && e.wep > 1 ? e.wep : 1;
  const P = enginePowerKW(s, h, mods) * 1000 * e.count * st.throttle * wep;
  const eta = e.propEff * (1 - 0.6 * smoothstep(0.6, 0.92, M));
  const v1 = PROP_V1 / mods.staticThrustMul;
  const v2 = v * v;
  const w2 = v1 * v1;
  return ((eta * P) / Math.sqrt(Math.sqrt(v2 * v2 + w2 * w2))) * engineMul;
}

/**
 * Yüksek kaldırmada profil sürüklemesi artışı: kanat tutunmaya yaklaşırken akım ayrılmaya başlar, sürükleme
 * parabolden sapar (CL/CLmax ≈ 0,55'ten sonra; tutunmada ≈ +0,05). Sürekli dönüşü sınırlayan asıl etkenlerden biri:
 * eksikken hafif avcılar gerçekçi tutunma hızıyla (clMax) gerçeğinden dar dönüyordu.
 */
const STALL_DRAG = 0.25;

/** Sürükleme kuvveti (N). cd0Mul: dış yük, pike freni, flap, hasar. */
export function dragAt(s: AircraftSpec, v: number, h: number, n: number, mass: number, cd0Mul: number, flaps = false): number {
  const q = 0.5 * RHO0 * sigma(h) * Math.max(v * v, 4);
  const S = s.wingArea;
  const CL = (n * mass * G) / (q * S);
  const M = v / soundSpeed(h);
  const x = Math.max(0, Math.min(Math.abs(CL) / clMaxAt(s, M, flaps), 1.2) - 0.55);
  return q * S * (s.cd0 * cd0Mul + inducedK(s) * CL * CL + STALL_DRAG * x * x + waveCd(s, M));
}

/** Verilen itkiyle hız kaybetmeden çekilebilecek en büyük yük (G); itki 1 G'ye bile yetmiyorsa 0. */
export function sustainableLoad(s: AircraftSpec, v: number, h: number, mass: number, thrust: number, cd0Mul: number, nMax: number): number {
  if (dragAt(s, v, h, 1, mass, cd0Mul) > thrust) {
    // 1 G altı: kabaca parabolik
    const d0 = dragAt(s, v, h, 0, mass, cd0Mul);
    const d1 = dragAt(s, v, h, 1, mass, cd0Mul) - d0;
    return Math.sqrt(Math.max(0, (thrust - d0) / Math.max(d1, 1)));
  }
  let lo = 1;
  let hi = nMax;
  if (dragAt(s, v, h, hi, mass, cd0Mul) <= thrust) return hi;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (dragAt(s, v, h, m, mass, cd0Mul) <= thrust) lo = m;
    else hi = m;
  }
  return lo;
}

/** Bu hız, irtifa ve ağırlıkta tutunma kaybı olmadan çekilebilecek G. */
export function liftLimitG(s: AircraftSpec, v: number, h: number, mass: number, flaps: boolean): number {
  const q = 0.5 * RHO0 * sigma(h) * v * v;
  return (q * s.wingArea * clMaxAt(s, v / soundSpeed(h), flaps)) / (mass * G);
}

/** 1G tutunma hızı (gerçek hız, m/s). */
export function stallSpeedAt(s: AircraftSpec, h: number, mass: number, flaps: boolean): number {
  return Math.sqrt((2 * mass * G) / (RHO0 * sigma(h) * s.wingArea * s.clMax * (flaps ? 1.42 : 1)));
}

/** Gösterge hızına göre yuvarlanma hızı (rad/s): yavaşta kumanda etkisiz, çok hızlıda kanatçıklar ağırlaşır. */
export function rollRateAt(s: AircraftSpec, iasV: number, mods: ModEffects): number {
  const fade = s.rollFade * (s.engine.kind === 'jet' ? mods.jetRollMul : 1);
  const f = iasV < s.rollIas ? 0.3 + (0.7 * iasV) / s.rollIas : Math.max(0.2, 1 - (iasV - s.rollIas) / fade);
  return s.rollPeak * f;
}

/** Yakıt akışı (kg/s). */
export function fuelFlowAt(s: AircraftSpec, h: number, st: ThrustState, mods: ModEffects): number {
  const e = s.engine;
  if (e.kind === 'jet') {
    const sg = Math.pow(sigma(h), 0.75);
    let f = (e.kn ?? 0) * 1000 * e.count * sg * Math.max(st.spool, 0.08) * e.tsfc;
    if (st.afterburner && e.abKn) f += (e.abKn - (e.kn ?? 0)) * 1000 * e.count * sg * e.tsfc * 2.6;
    return f / 3600;
  }
  const wep = st.wep && mods.wep && e.wep > 1 ? e.wep : 1;
  const P = enginePowerKW(s, h, mods) * e.count * Math.max(st.throttle, 0.06) * wep;
  // Zengin karışım yüksek güçte daha çok yakar (kg/kWh)
  const sfc = 0.28 + 0.12 * st.throttle * st.throttle + (wep > 1 ? 0.06 : 0);
  return (P * sfc) / 3600;
}
