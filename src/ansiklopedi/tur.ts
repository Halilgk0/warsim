// Ansiklopedi makalelerinin biçimi (makale/*.ts). Tarih ve sayılar yaygın kaynaklarla uyuşmalı; emin olunmayan bilgi
// yazılmaz, aralıkla ya da "yaklaşık" ile verilir. "Oyunda" bölümü yalnız oyunda gerçekten modellenmiş davranışı anlatır.

export interface Tx {
  tr: string;
  en: string;
}

export interface Article {
  /** Uçak kimliği (specs.ts). */
  id: string;
  /** Kartta görünen tek cümle. */
  summary: Tx;
  /** Sayfanın başındaki giriş paragrafı (arama açıklaması da buradan kısaltılır). */
  lead: Tx;
  /** Künye tablosu. */
  facts: { k: Tx; v: Tx }[];
  sections: { h: Tx; p: Tx[] }[];
  /** "Oyunda" bölümünün elle yazılan paragrafları (araştırma yolu ve sayılar kendiliğinden eklenir). */
  inGame: Tx[];
}

export const t = (tr: string, en: string): Tx => ({ tr, en });

/** Künyenin sık kullanılan satır adları. */
export const K = {
  first: t('İlk uçuş', 'First flight'),
  service: t('Hizmete giriş', 'Entered service'),
  designer: t('Tasarımcı', 'Designer'),
  maker: t('Üretici', 'Manufacturer'),
  built: t('Üretim', 'Number built'),
  engine: t('Motor', 'Engine'),
  speed: t('Azami hız', 'Top speed'),
  guns: t('Silahlar', 'Armament'),
  crew: t('Mürettebat', 'Crew'),
  size: t('Kanat açıklığı / uzunluk', 'Span / length'),
};
