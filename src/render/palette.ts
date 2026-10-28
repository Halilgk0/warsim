// Sade pastel palet. Tüm görsel renkler buradan gelir.

export const PALETTE = {
  sky: 0xdde9ec,
  seaOuter: 0x97c4d4,
  terrain: {
    seaDeep: [104, 160, 190],
    seaShallow: [150, 206, 212],
    sand: [220, 206, 166],
    grass1: [136, 154, 102],
    grass2: [120, 142, 90],
    grass3: [106, 128, 84],
    hill: [146, 142, 106],
    rock: [138, 132, 124],
    peak: [240, 240, 236],
  } as Record<string, [number, number, number]>,
  /** Taraf renkleri: Mavi, Kırmızı, Mor, Sarı, Turkuaz, Pembe (mapData.TEAM_SITES ile aynı sıra). */
  team: [0x5b7ec9, 0xd9725f, 0x9a72c6, 0xc99a2e, 0x3b9fa3, 0xcf6a9d],
  teamTrail: [0x8fa9e2, 0xeca596, 0xc2a6e0, 0xe3c574, 0x82c8ca, 0xe6a3c4],
  teamCss: ['#5b7ec9', '#d9725f', '#9a72c6', '#c99a2e', '#3b9fa3', '#cf6a9d'],
  buildings: [0xf3e9d9, 0xebdcc7, 0xe8d5cb, 0xdfe3d1, 0xf1e0cf, 0xe4dde8],
  factory: 0xe9dcc8,
  aaSite: 0xcfc6b2,
  gunMetal: 0x8e8c94,
  sandbag: 0xd8cba8,
  radar: 0xd6d2c4,
  runway: 0xe6e1d8,
  hangar: 0xdcd3c5,
  damaged: 0x8f8890,
  /** İz mermisi halesi (çekirdek gölgelendiricide beyaza yakın): sarı-turuncu ve kırmızı-turuncu. */
  tracer: [0xffb45c, 0xff8c54],
  /** Ateş: sıcak çekirdek, alev, soğuyan kor (renk ömür boyunca bu sırayla geçer). */
  fire: [0xfff1c8, 0xffa04a, 0x8a3418],
  smoke: 0xaeaaa8,
  smokeDark: 0x6a6567,
  dust: 0xcdb994,
  /** Patlama dumanı: toprakla karışık. */
  dustSmoke: 0xa19682,
  splash: 0xf4f8f8,
  flak: 0x4b484e,
  bomb: 0x6e6a72,
  neutralModel: 0x7f93bd,
  good: 0x7fbf8f,
  bad: 0xe07a6e,
};
