// Ansiklopedide sayfası olan uçaklar (uçak kimliği → adres parçası) ve adresler. Oyun da bunu okur (ana menü ve
// hangardan bağlantı); makalelerin metni makaleler.ts'te, oyun paketine girmez. Yeni makale yazılınca buraya da ekle.

export const ENCYCLOPEDIA: Record<string, string> = {
  hurricane1: 'hawker-hurricane-mk-i',
  spitfire1: 'supermarine-spitfire-mk-i',
  ju87b: 'junkers-ju-87-b-2-stuka',
  bf109e: 'messerschmitt-bf-109-e-4',
  bf110c: 'messerschmitt-bf-110-c-4',
  he111: 'heinkel-he-111-h-3',
  i16: 'polikarpov-i-16-tip-24',
  blenheim: 'bristol-blenheim-mk-iv',
  ju88a4: 'junkers-ju-88-a-4',
  a6m2: 'mitsubishi-a6m2-zero',
  spitfire5: 'supermarine-spitfire-mk-vb',
  bf109f: 'messerschmitt-bf-109-f-4',
  il2: 'ilyushin-il-2',
  sbd3: 'douglas-sbd-3-dauntless',
  p40e: 'curtiss-p-40e-warhawk',
  pe2: 'petlyakov-pe-2',
  spitfire9: 'supermarine-spitfire-mk-ix',
  lancaster: 'avro-lancaster',
  bf109g: 'messerschmitt-bf-109-g-6',
  fw190a5: 'focke-wulf-fw-190-a-5',
  il2m3: 'ilyushin-il-2m3',
  typhoon: 'hawker-typhoon',
  ju87d: 'junkers-ju-87-d-5-stuka',
  b25j: 'north-american-b-25j-mitchell',
  b17g: 'boeing-b-17g-flying-fortress',
  p38j: 'lockheed-p-38j-lightning',
  mosquito: 'de-havilland-mosquito-fb-vi',
  p51d: 'north-american-p-51d-mustang',
  me262: 'messerschmitt-me-262',
  p47d: 'republic-p-47d-thunderbolt',
  il10: 'ilyushin-il-10',
  sb2c: 'curtiss-sb2c-4-helldiver',
  yak3: 'yakovlev-yak-3',
  la7: 'lavochkin-la-7',
  f6f5: 'grumman-f6f-5-hellcat',
  a26b: 'douglas-a-26b-invader',
  ar234: 'arado-ar-234-blitz',
  meteor3: 'gloster-meteor-f3',
  f8f: 'grumman-f8f-1-bearcat',
  f4u4: 'vought-f4u-4-corsair',
  b29: 'boeing-b-29-superfortress',
  he162: 'heinkel-he-162-salamander',
  seafury: 'hawker-sea-fury',
  f80c: 'lockheed-f-80c-shooting-star',
  ad4: 'douglas-ad-4-skyraider',
  vampire: 'de-havilland-vampire',
  mig15: 'mikoyan-gurevich-mig-15',
  il28: 'ilyushin-il-28',
  f84g: 'republic-f-84g-thunderjet',
  canberra: 'english-electric-canberra',
  f86f: 'north-american-f-86f-sabre',
  mig21: 'mikoyan-gurevich-mig-21',
  f4e: 'mcdonnell-douglas-f-4e-phantom-ii',
  f15a: 'mcdonnell-douglas-f-15a-eagle',
  rafale: 'dassault-rafale',
  f22a: 'lockheed-martin-f-22a-raptor',
};

export const ENC_TR = '/ansiklopedi/';
export const ENC_EN = '/en/encyclopedia/';

/** Oyun warsimbox.com dışında (eski adres, itch.io) açıldıysa sayfalar ana adreste. */
const ORIGIN = typeof location !== 'undefined' && !/(^|\.)warsimbox\.com$|^localhost$|^127\./.test(location.hostname)
  ? 'https://warsimbox.com' : '';

/** Ansiklopedi ana sayfası ya da bir uçağın sayfası. */
export function encUrl(en: boolean, id?: string): string {
  const slug = id ? ENCYCLOPEDIA[id] : undefined;
  return `${ORIGIN}${en ? ENC_EN : ENC_TR}${slug ? `${slug}/` : ''}`;
}
