// Destekçi rozetleri (2026-11-21): hesabın toplam destekçi paketi ödemesinden (shared.ts supportTier). Profil'de ve skor
// tablosunda yalnız en yükseği görünür. Görünüm oyunun low-poly üslubunda: yüzeyler düz tonlu üçgen ve dörtgen yüzeylerden,
// her rozet kendi metalinde (ışık sol üstten).
//   1 (1 $+): el sıkışma, sözleşme gibi; bronz.
//   2 (5 $+): yan yana bir çift kanat; gri (gümüş).
//   3 (15 $+): önden modern jet pilotu kaskı; altın.
// Ödeme öncesi pencerede rozetler gösterilmez, yerinde "Özel rozet" ve kilitli bir işaret durur (support.ts lockedBadge).

import { L } from '../i18n';
import { CONTRIB_RANK_NAMES } from '../net/shared';

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

// ---------------------------------------------------------------- katkı rütbeleri (2026-11-24)
// Geri bildirimin incelenmesiyle kazanılan katkı puanından (shared.ts CONTRIB_RANKS): 13 rütbe. Destekçi rozetlerinden
// ayrılsın diye kalkan biçiminde. Kalkanın metali rütbeyle ilerler (çelik, bronz, bakır, gümüş, altın, kızıl, lacivert),
// ortada amblem (anahtar, dişli, pervane, kanat, yıldız, kanatlı yıldız), alttaki şerit sayısı aynı amblemdeki sırayı söyler.
// Profil'de sıradaki rütbe gizlidir (lockedRankSvg).

const STEEL: Tone = ['#c9d3cf', '#94a39d', '#66756f', '#3f4a46'];
const COPPER: Tone = ['#f0a07a', '#c96b45', '#94462a', '#5e2a17'];
const CRIMSON: Tone = ['#f08a7a', '#c4473a', '#8c2a22', '#561510'];
const NAVY: Tone = ['#7fa3d6', '#3d63a3', '#26406f', '#152542'];

type Emblem = 'wrench' | 'wrench2' | 'gear' | 'gear3' | 'prop' | 'wings' | 'star' | 'starwings';
/** Rütbe başına: metal, amblem, şerit sayısı, amblem rengi. */
const RANKS: [Tone, Emblem, number, string][] = [
  [STEEL, 'wrench', 0, '#f4f7f5'],
  // 2026-11-25 kullanıcı kararı: Yer personeli çapraz iki anahtar, Kıdemli mekanisyen iç içe üç dişli (şeritsiz)
  [STEEL, 'wrench2', 0, '#f4f7f5'],
  [BRONZE, 'gear', 0, '#fff1dc'],
  [BRONZE, 'gear3', 0, '#fff1dc'],
  [COPPER, 'prop', 0, '#4a1e0c'],
  [COPPER, 'prop', 1, '#4a1e0c'],
  [SILVER, 'wings', 0, '#3f4a50'],
  [SILVER, 'wings', 1, '#3f4a50'],
  [SILVER, 'wings', 2, '#3f4a50'],
  [GOLD, 'star', 0, '#5e3f0a'],
  [GOLD, 'star', 1, '#5e3f0a'],
  [CRIMSON, 'starwings', 0, '#ffd66b'],
  [NAVY, 'starwings', 2, '#ffd66b'],
];

const pt = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
/** Merkez çevresinde düzgün çokgen ya da yıldız (r1, r2 sırayla). */
function ring(cx: number, cy: number, n: number, r1: number, r2: number, rot = -Math.PI / 2): string {
  const out: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    out.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return out.join(' ');
}

/** Kalkan: dış kenar koyu, yüz sol yarı açık, sağ yarı gölgede. */
function shield(c: Tone): string {
  const outer = '32,3 9,9 9,30 13,44 21,54 32,61 43,54 51,44 55,30 55,9';
  return [
    poly(outer, c[3]),
    poly('32,7 13,12 13,30 17,42 24,51 32,56.5', c[0]),
    poly('32,7 51,12 51,30 47,42 40,51 32,56.5', c[1]),
    poly('32,7 13,12 15,13 32,9', c[1]),
  ].join('');
}

function emblem(e: Emblem, ink: string): string {
  const f = (pts: string) => poly(pts, ink);
  const cy = 28;
  switch (e) {
    case 'wrench':
      // Çapraz sap ve açık ağızlı baş
      return f('23,37 27,41 39,27 35,23') + f('34,22 33,16 37,12 42,11 39,15 42,18 46,15 45,20 41,24 36,25');
    case 'wrench2': {
      // Çapraz iki anahtar: aynalanmış olan altta, öteki gölgesiyle üstte
      const W = ['23,37 27,41 39,27 35,23', '34,22 33,16 37,12 42,11 39,15 42,18 46,15 45,20 41,24 36,25'];
      const mirror = (pts: string, dx = 0, dy = 0) => pts.split(' ').map((q) => { const [x, y] = q.split(',').map(Number); return pt(64 - x + dx, y + dy); }).join(' ');
      const shift = (pts: string, dx: number, dy: number) => pts.split(' ').map((q) => { const [x, y] = q.split(',').map(Number); return pt(x + dx, y + dy); }).join(' ');
      return W.map((w) => f(mirror(w, 0, 4))).join('') + W.map((w) => poly(shift(w, 0.9, 4.9), '#00000055')).join('') + W.map((w) => f(shift(w, 0, 4))).join('');
    }
    case 'gear':
      return f(ring(32, cy, 8, 12, 9.5, -Math.PI / 2 + Math.PI / 16)) + poly(ring(32, cy, 6, 4.2, 4.2), '#00000033');
    case 'gear3':
      // Birbirine geçmiş üç dişli (dişler komşunun boşluğuna denk gelecek biçimde döndürülmüş)
      return [[24, 21, 0.1], [40, 21, 0.5], [32, 35, 0.3]].map(([x, y, rot]) => f(ring(x, y, 7, 8.2, 6.3, rot)) + poly(ring(x, y, 6, 2.6, 2.6), '#00000033')).join('');
    case 'prop':
      // Üç kürek: göbekte dar, ortada geniş, uçta sivri
      return [0, 1, 2].map((i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        const at = (r: number, d: number) => pt(32 + Math.cos(a + d) * r, cy + Math.sin(a + d) * r);
        return f(`${at(3, -0.6)} ${at(9, -0.34)} ${at(13, -0.12)} ${at(14.5, 0)} ${at(13, 0.16)} ${at(9, 0.3)} ${at(3, 0.6)}`);
      }).join('') + poly(ring(32, cy, 6, 3.6, 3.6), '#2f1206');
    case 'wings':
      return f('29,24 12,20 15,26 20,27 17,30 29,31') + f('35,24 52,20 49,26 44,27 47,30 35,31') + f(ring(32, 27.5, 6, 4.5, 4.5));
    case 'star':
      return f(ring(32, cy, 5, 12.5, 5.2));
    case 'starwings':
      return f('26,26 11,22 14,28 18,29 15,32 26,33') + f('38,26 53,22 50,28 46,29 49,32 38,33') + f(ring(32, 28.5, 5, 10, 4.2));
  }
}

/** Alttaki şeritler (0–2). */
function chevrons(n: number, ink: string): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const y = 42 + i * 6;
    s += poly(`22,${y} 32,${y + 5} 42,${y} 42,${y + 3} 32,${y + 8} 22,${y + 3}`, ink);
  }
  return s;
}

/** Rütbenin adı (1–13). */
export function rankName(rank: number): string {
  const n = CONTRIB_RANK_NAMES[rank - 1];
  return n ? L(n[0], n[1]) : '';
}

/** Katkı rütbesi rozeti (1–13; 0 ise boş). points: ipucunda puan. */
export function rankSvg(rank: number, size = '1.2em', points?: number): string {
  const r = RANKS[rank - 1];
  if (!r) return '';
  const [tone, em, chev, ink] = r;
  const name = rankName(rank);
  const tip = points === undefined ? name : `${name} · ${L(`${points} katkı puanı`, `${points} contribution points`)}`;
  return `<svg class="sbadge cbadge r${rank}" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${tip}"><title>${tip}</title>${shield(tone)}${emblem(em, ink)}${chevrons(chev, ink)}</svg>`;
}

/** Sıradaki (gizli) rütbe: soru işaretli boş kalkan. */
export function lockedRankSvg(size = '1.2em'): string {
  const name = L('Gizli rütbe', 'Hidden rank');
  return `<svg class="sbadge cbadge locked" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${name}"><title>${name}</title>${shield(['#4a524e', '#3a413d', '#2c322f', '#1e2320'])}<text x="32" y="40" text-anchor="middle" font-size="26" font-weight="800" fill="#9aa49f" font-family="Nunito, sans-serif">?</text></svg>`;
}
