// Harita önizlemesi: haritanın doğal yükseklik fonksiyonundan küçük bir resim (arazi üretmeden, birkaç ms).

import { MAP_BASE } from '../sim/mapData';
import type { MapDef } from '../sim/maps';

const cache = new Map<string, string>();

/** Pastel harita renkleri (deniz, kumsal, ova, tepe, dağ, zirve). */
function color(h: number): [number, number, number] {
  if (h < 0) {
    const k = Math.min(1, -h / 250);
    return [186 - 40 * k, 221 - 29 * k, 229 - 18 * k];
  }
  if (h < 25) return [238, 229, 203];
  if (h < 350) return [214 - (h / 350) * 18, 231 - (h / 350) * 11, 186 - (h / 350) * 20];
  if (h < 1100) {
    const k = (h - 350) / 750;
    return [196 + 4 * k, 220 - 24 * k, 166 + 2 * k];
  }
  const k = Math.min(1, (h - 1100) / 1500);
  return [200 + 41 * k, 196 + 43 * k, 168 + 66 * k];
}

/** Haritanın küçük resmi (data URL, önbellekli). */
export function mapPreview(def: MapDef, px = 120): string {
  const key = `${def.id}:${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(px, px);
  // Biçim her büyüklükte aynı: taban ölçekte çizilir
  const half = MAP_BASE / 2;
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const x = -half + ((i + 0.5) / px) * MAP_BASE;
      const z = -half + ((j + 0.5) / px) * MAP_BASE;
      const [r, g, b] = color(def.natural(x, z));
      const o = (j * px + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
