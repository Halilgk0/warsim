// Standart atmosfer (ISA). Yoğunluk irtifayla düşer: kaldırma, sürükleme, motor gücü ve jet itkisi buna bağlıdır.
// Ses hızı sıcaklıkla düşer: aynı gerçek hız yüksekte daha büyük Mach sayısı demektir.

export const RHO0 = 1.225;
const T0 = 288.15;
const LAPSE = 0.0065;
const TROPO = 11000;
const T_TROPO = T0 - LAPSE * TROPO;
const SIGMA_TROPO = Math.pow(T_TROPO / T0, 4.2559);

/** Sıcaklık (K). */
export function temperature(h: number): number {
  return h < TROPO ? T0 - LAPSE * Math.max(h, -500) : T_TROPO;
}

/** Yoğunluk oranı ρ/ρ0. */
export function sigma(h: number): number {
  if (h < TROPO) return Math.pow(1 - (LAPSE * Math.max(h, -500)) / T0, 4.2559);
  return SIGMA_TROPO * Math.exp(-(h - TROPO) / 6341.6);
}

/** Ses hızı (m/s). */
export function soundSpeed(h: number): number {
  return 20.05 * Math.sqrt(temperature(h));
}

/** Gösterge (eşdeğer) hava hızı: aerodinamik kuvvetler bununla ölçeklenir. */
export function ias(tas: number, h: number): number {
  return tas * Math.sqrt(sigma(h));
}

export function mach(tas: number, h: number): number {
  return tas / soundSpeed(h);
}
