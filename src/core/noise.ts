// Tohumlu gürültü (arazi, arazi örtüsü, maden verimi).

import { mulberry32 } from './math';

/** Tohumlu değer gürültüsü (fBm), [-1, 1] civarı. */
export function makeFbm(seed: number, octaves = 5) {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256).map(() => rng() * 2 - 1);
  const lat = (ix: number, iz: number) => vals[perm[(perm[ix & 255] + iz) & 255]];
  const noise = (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = lat(ix, iz);
    const b = lat(ix + 1, iz);
    const c = lat(ix, iz + 1);
    const d = lat(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  };
  return (x: number, z: number) => {
    let amp = 0.5;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * f + o * 17.3, z * f - o * 9.1);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
}
