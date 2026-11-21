// Destekçi rozetleri (2026-11-21): hesabın toplam destekçi paketi ödemesinden (shared.ts supportTier). Profil'de ve skor
// tablosunda yalnız en yükseği görünür. Görünüm oyunun low-poly üslubunda: yüzeyler düz tonlu üçgen ve dörtgen yüzeylerden,
// her rozet kendi metalinde (ışık sol üstten).
//   1 (1 $+): el sıkışma, sözleşme gibi; bronz.
//   2 (5 $+): yan yana bir çift kanat; gri (gümüş).
//   3 (15 $+): önden modern jet pilotu kaskı; altın.
// Ödeme öncesi pencerede rozetler gösterilmez, yerinde "Özel rozet" ve kilitli bir işaret durur (support.ts lockedBadge).

import { L } from '../i18n';

type Tone = [light: string, mid: string, dark: string, deep: string];

const BRONZE: Tone = ['#eaa95e', '#c27a36', '#8f5323', '#5e3314'];
const SILVER: Tone = ['#f4f7f8', '#c4ccd0', '#8f999f', '#5c656b'];
const GOLD: Tone = ['#ffe9a6', '#e8bb48', '#b4831c', '#7a560c'];

/** Yüzey: çokgen noktaları ve dolgu. */
const poly = (pts: string, t: string) => `<polygon points="${pts}" fill="${t}"/>`;

/** Soldaki yarının yansıması (x → 64 − x); sağ yarı gölgede kaldığı için tonu bir koyulaştırılabilir. */
function mirror(parts: [string, number][], c: Tone, shift: number): string {
  return parts.map(([pts, t]) => {
    const m = pts.split(' ').map((p) => {
      const [x, y] = p.split(',').map(Number);
      return `${64 - x},${y}`;
    }).join(' ');
    return poly(m, c[Math.min(3, t + shift)]);
  }).join('');
}

function handshake(c: Tone): string {
  const [a, b, d, e] = c;
  return [
    // Manşetler: soldaki el aşağıdan, sağdaki el yukarıdan gelir
    poly('1,30 11,27 13,45 3,47', d),
    poly('11,27 14,26.5 16,44.5 13,45', a),
    poly('63,22 53,20 51,38 61,40', e),
    poly('53,20 50,20.5 48,38.5 51,38', b),
    // Soldaki elin sırtı (altta)
    poly('14,26.5 30,28 42,30 45,38 37,45 16,44.5', d),
    poly('14,26.5 30,28 22,36 15,37', b),
    // Sağdaki elin sırtı (üstte)
    poly('50,20.5 41,18.5 31,20.5 25,27 27,33 48,38.5', b),
    poly('50,20.5 41,18.5 37,26 48,30', a),
    // Sağdaki elin parmakları soldaki elin üstünden sarar
    poly('24,29 28.5,29.5 25,44 20.5,44', a),
    poly('20.5,44 25,44 24,46 21,46', b),
    poly('29,31 33.5,31.5 30.5,45 26,45', b),
    poly('26,45 30.5,45 29.5,47 26.5,47', d),
    poly('34,33 38.5,33.5 36,45 31.5,45', a),
    poly('31.5,45 36,45 35,46.5 32,46.5', b),
    poly('39,34.5 43,35.5 40.5,43.5 36.5,44', b),
    // Soldaki elin başparmağı sağdaki elin üstünden geçer
    poly('20,27 29,21.5 40,19.5 43,22 33,25 25,30', a),
    poly('40,19.5 43,22 41,24.5 37,24', b),
  ].join('');
}

function wings(c: Tone): string {
  const [a, b, d, e] = c;
  // Sol kanat (pilot brövesi gibi yatay, tüy sıraları kat kat); sağ kanat yansıması, bir ton koyu
  const left: [string, number][] = [
    ['28,22 20,19.5 12,17 5,16 1,17 4,19.5 12,21 20,23.5 28,26', 0],
    ['28,26 20,23.5 12,21 4,19.5 2,22.5 7,23.5 4,25.5 11,26.5 9,28.5 16,29 28,30.5', 1],
    ['28,30.5 16,29 9,28.5 8,31.5 14,32 12,34.5 19,34.5 17,36.5 28,36', 2],
    ['28,36 17,36.5 15,38 21,38.5 19,41 28,40.5', 3],
  ];
  return [
    ...left.map(([p, t]) => poly(p, c[t])),
    mirror(left, c, 1),
    // Ortadaki taş
    poly('27,20 37,20 40,28 32,37 24,28', b),
    poly('27,20 32,25 24,28', a),
    poly('37,20 40,28 32,25', d),
    poly('24,28 32,25 40,28 32,37', e),
    poly('29,22 35,22 32,25', a),
  ].join('');
}

function helmet(c: Tone): string {
  const [a, b, d, e] = c;
  // Kabuğun sol yarısı (yüz açıklığının çevresi); sağ yarı yansıması, bir ton koyu
  const shell: [string, number][] = [
    ['32,3 21,5 26,16 32,15', 0],
    ['21,5 12,11 18,19 26,16', 0],
    ['12,11 7,20 14,25 18,19', 1],
    ['7,20 5.5,32 14,34 14,25', 1],
    ['5.5,32 7.5,45 15,48 16,44 14,34', 2],
  ];
  return [
    ...shell.map(([p, t]) => poly(p, c[t])),
    mirror(shell, c, 1),
    // Vizör kızağı
    poly('18,19 26,16 32,15 38,16 46,19 45,24 32,22 19,24', d),
    poly('26,16 32,15 38,16 32,18', b),
    // Vizör camı: koyu, altın yansımalı
    poly('14,25 19,24 32,22 45,24 50,25 50,34 43,37.5 21,37.5 14,34', '#2b2720'),
    poly('17,26 27,24 20,36 16,33.5', '#7a6534'),
    poly('27,24 31,23.5 24,37 20,36', '#51462c'),
    poly('45,24 50,25 50,28', '#5a4d30'),
    // Maskenin kayışları
    poly('14.5,39 22,40 22,44 15.5,45', d),
    poly('49.5,39 42,40 42,44 48.5,45', e),
    // Oksijen maskesi
    poly('24,37.5 40,37.5 43.5,45 38,54 26,54 20.5,45', b),
    poly('24,37.5 32,37.5 32,54 26,54 20.5,45', a),
    poly('28.5,44 35.5,44 34.5,49.5 29.5,49.5', e),
    // Hortum
    poly('28.5,54 35.5,54 36,58 28,58', d),
    poly('28,58 36,58 35,62 29,62', e),
  ].join('');
}

const NAMES: Record<number, () => string> = {
  1: () => L('Anlaşma', 'Handshake'),
  2: () => L('Kanatlar', 'Wings'),
  3: () => L('Altın kask', 'Golden helmet'),
};

/** Rozetin adı (ipucu ve ekran okuyucu). */
export function badgeName(tier: number): string {
  return NAMES[tier]?.() ?? '';
}

/** Rozet SVG'si (tier 1–3; 0 ise boş). size: CSS boyu (ör. "1.2em"). */
export function badgeSvg(tier: number, size = '1.2em'): string {
  const art = tier === 1 ? handshake(BRONZE) : tier === 2 ? wings(SILVER) : tier === 3 ? helmet(GOLD) : '';
  if (!art) return '';
  const name = badgeName(tier);
  return `<svg class="sbadge b${tier}" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${name}"><title>${name}</title>${art}</svg>`;
}
