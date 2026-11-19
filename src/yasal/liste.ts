// Gizlilik Politikası ve KVKK Aydınlatma Metni adresleri. Oyun da okur (hesap penceresi, ana menü); metinler oyun paketine
// girmez (metin.ts yalnız derlemede ve geliştirme sunucusunda kullanılır).

export type LegalKind = 'privacy' | 'kvkk' | 'deletion';

export const LEGAL_PATHS: Record<LegalKind, { tr: string; en: string }> = {
  privacy: { tr: '/gizlilik/', en: '/en/privacy/' },
  kvkk: { tr: '/kvkk/', en: '/en/kvkk/' },
  /** Hesap silme (Google Play'in istediği herkese açık adres). */
  deletion: { tr: '/hesap-silme/', en: '/en/account-deletion/' },
};

export const legalUrl = (kind: LegalKind, en: boolean): string => LEGAL_PATHS[kind][en ? 'en' : 'tr'];
