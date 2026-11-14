// Zemin ve yaprak dokusu: açılışta bir kez üretilen küçük (256 × 256), kenarları birbirine oturan görüntü. Arazi
// gölgelendiricisi iki ölçekte (16 m ve 128 m) okur, ağaç taçları bir kez: telefonda hesaplamalı gürültüden çok daha ucuz
// (2026-10-27 ölçümü: yordamsal arazi dokusu kare süresinin %30–60'ıydı, bu yüzden yalnız Yüksek kalitede açıktı).
// Renk çarpanıdır: ortalaması 0,5 (gölgelendiricide ×2 → 1), küçültülmüş düzeyleri nötre yaklaşır; uzakta hare olmaz.
// İçerik: birkaç ölçekte benek (çim öbekleri), kısa ot sapları (açık ve koyu çizgiler), hafif sarı-yeşil ton oynaması.

import * as THREE from 'three';
import { mulberry32 } from '../core/math';

const S = 256;
let texture: THREE.DataTexture | null = null;

function build(): THREE.DataTexture {
  const rng = mulberry32(90210);
  // Dönemli değer gürültüsü: k hücrelik kafes kenarda sarar
  const lattice = (k: number): Float32Array => Float32Array.from({ length: k * k }, () => rng());
  const sample = (l: Float32Array, k: number, x: number, y: number): number => {
    const fx = (x / S) * k;
    const fy = (y / S) * k;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    let tx = fx - ix;
    let ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const a = l[(iy % k) * k + (ix % k)];
    const b = l[(iy % k) * k + ((ix + 1) % k)];
    const c = l[((iy + 1) % k) * k + (ix % k)];
    const d = l[((iy + 1) % k) * k + ((ix + 1) % k)];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const l6 = lattice(6);
  const l19 = lattice(19);
  const l64 = lattice(64);
  const lt = lattice(9);
  const lum = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      lum[y * S + x] = 0.5 + 0.2 * (sample(l6, 6, x, y) - 0.5) + 0.22 * (sample(l19, 19, x, y) - 0.5) + 0.2 * (sample(l64, 64, x, y) - 0.5);
    }
  }
  // Ot sapları: çoğu dike yakın kısa çizgiler; açık olanlar ışık alan, koyular gölgede kalan saplar
  for (let i = 0; i < 11000; i++) {
    let x = rng() * S;
    let y = rng() * S;
    const a = -Math.PI / 2 + (rng() - 0.5) * 1.5;
    const len = 3 + rng() * 6;
    const d = (rng() < 0.6 ? 1 : -1) * (0.07 + rng() * 0.13);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let t = 0; t < len; t++) {
      const ix = ((Math.floor(x) % S) + S) % S;
      const iy = ((Math.floor(y) % S) + S) % S;
      lum[iy * S + ix] += d * (1 - t / len);
      x += dx;
      y += dy;
    }
  }
  let mean = 0;
  for (const v of lum) mean += v;
  mean /= lum.length;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = Math.min(1, Math.max(0, lum[y * S + x] - mean + 0.5));
      const tint = sample(lt, 9, x, y) - 0.5;
      const k = (y * S + x) * 4;
      data[k] = Math.round(255 * Math.min(1, Math.max(0, v * (1 + 0.1 * tint))));
      data[k + 1] = Math.round(255 * v);
      data[k + 2] = Math.round(255 * Math.min(1, Math.max(0, v * (1 - 0.16 * tint))));
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Ortak doku (ilk çağrıda üretilir). */
export function groundTexture(): THREE.DataTexture {
  texture ??= build();
  return texture;
}

/** Gölgelendiricilere bağlanan ortak değer. */
export const groundU = { terrGrass: { value: groundTexture() } };
