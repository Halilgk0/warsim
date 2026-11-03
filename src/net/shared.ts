// Tarayıcı ve sunucu (worker/) ortak kuralları: hesap adı, şifre ve skor ölçütleri. DOM ve i18n kullanmaz.

export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const PASS_MIN = 6;
export const PASS_MAX = 100;

export function cleanName(n: string): string {
  return n.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/**
 * Eşleştirme anahtarı: küçük harf; I, İ, ı ve i aynı sayılır (Türkçe "Işık" ile İngilizce "ivan" yazımı iki dilde de
 * tutsun, birbirine benzeyen adlarla başkasının kılığına girilmesin). Sunucuda yerel ayara güvenmeden aynı sonuç.
 */
export function nameKey(n: string): string {
  return cleanName(n).replace(/[Iİı]/g, 'i').toLowerCase();
}

/** Ad kuralı: 2–20 karakter; harf, rakam, boşluk, - _ . (null: geçerli; değilse hata kodu). */
export function nameProblem(n: string): 'short' | 'chars' | null {
  const c = cleanName(n);
  if (c.length < NAME_MIN) return 'short';
  if (!/^[\p{L}\p{N} _.-]+$/u.test(c)) return 'chars';
  return null;
}

export const EMAIL_MAX = 254;

export const cleanEmail = (e: string): string => e.trim().toLowerCase();

/** Yazım denetimi: bütün e-posta sağlayıcıları geçerli. Adresin gerçekten var olduğunu göstermez. */
export function validEmail(e: string): boolean {
  const c = cleanEmail(e);
  return c.length <= EMAIL_MAX && /^[a-z0-9][a-z0-9._%+-]*@([a-z0-9-]+\.)+[a-z][a-z0-9-]+$/.test(c);
}

/**
 * Tek hesap kuralının eşleştirme anahtarı: aynı kutuya giden yazımlar aynı sayılır. "+etiket" atılır; Gmail noktaları da
 * yok sayar. E-posta yine yazıldığı adrese gider.
 */
export function emailKey(e: string): string {
  const c = cleanEmail(e);
  const at = c.indexOf('@');
  const local = c.slice(0, at).split('+')[0];
  const domain = c.slice(at + 1);
  return domain === 'gmail.com' || domain === 'googlemail.com' ? `${local.replace(/\./g, '')}@gmail.com` : `${local}@${domain}`;
}

/** Gizlilik Politikası ve KVKK metninin sürümü (yürürlük günü): metin değişince bu da değişir, hesapta saklanır. */
export const LEGAL_VERSION = '2026-11-03';

/** Skor tablosu ölçütleri (veritabanı sütunu). */
export const METRICS = ['kills', 'wins', 'earned', 'peak', 'play_sec'] as const;
export type Metric = (typeof METRICS)[number];

/** İstemci şifre özeti: PBKDF2-SHA256 (tur sayısı; değişirse eski şifreler tutmaz). */
export const CLIENT_HASH_ITER = 150000;
export const clientSalt = (key: string): string => `warsimbox:v1:${key}`;

/** Sunucuya gönderilen harekât istatistiği (o harekâtın o anki toplamları). */
export interface StatsReport {
  campaign: string;
  kills: number;
  earned: number;
  peak: number;
  won: boolean;
  gameTime: number;
  /** Son bildirimden bu yana gerçek zamanda oynanan süre (s; artış). */
  playSec: number;
}

export interface LeaderRow {
  rank: number;
  name: string;
  value: number;
}
