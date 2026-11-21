// Gizlilik Politikası, KVKK Aydınlatma Metni, hesap silme ve destekçi paketi koşulları adresleri. Oyun da okur (hesap penceresi, ana menü); metinler oyun paketine
// girmez (metin.ts yalnız derlemede ve geliştirme sunucusunda kullanılır).

export type LegalKind = 'privacy' | 'kvkk' | 'deletion' | 'support';

export const LEGAL_PATHS: Record<LegalKind, { tr: string; en: string }> = {
  privacy: { tr: '/gizlilik/', en: '/en/privacy/' },
  kvkk: { tr: '/kvkk/', en: '/en/kvkk/' },
  /** Hesap silme (Google Play'in istediği herkese açık adres). */
  deletion: { tr: '/hesap-silme/', en: '/en/account-deletion/' },
  /** Destekçi paketi koşulları (2026-11-21; satıcı Polar, teslim, iade). */
  support: { tr: '/destekci-paketi-kosullari/', en: '/en/supporter-pack-terms/' },
};

export const legalUrl = (kind: LegalKind, en: boolean): string => LEGAL_PATHS[kind][en ? 'en' : 'tr'];
