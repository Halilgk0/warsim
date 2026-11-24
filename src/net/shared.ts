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
export const LEGAL_VERSION = '2026-11-24';

/**
 * Kayıt yerleri (2026-11-10; 2026-11-21'de 4 → 3, 2026-11-25'te 3 → 2): hesap başına SAVE_SLOTS_BASE yer, destekçi paketiyle bir ya da iki fazla
 * (slotsFor). Her yerde bir kayıt. Otomatik kayıt aynı adlı oyunun önceki otomatik kaydının yerine, yoksa son yere, o doluysa
 * boş bir yere yazılır. Kayıt sayısı hesabın yer sayısını aşarsa (yer azalınca: 4 kaydı olan eski hesap, iade) uyarı
 * gösterilir; SAVE_CLEANUP_DAYS içinde inmezse sunucu en eski kayıtları siler.
 */
export const SAVE_SLOTS_BASE = 2;
export const SAVE_SLOTS_MAX = 5;
export const SAVE_CLEANUP_DAYS = 7;
/**
 * 2026-11-25'te yer 3 → 2 (kullanıcı kararı): o günden önce açılmış hesabın üçüncü kaydı silinmez, yüklenir ama üstüne
 * yazılamaz (yer sayısının dışında). Yalnız bu kadarı tutulur; fazlası eskisi gibi temizlenir.
 */
export const SAVE_SLOTS_OLD = 3;
export const SAVE_SLOTS2_AT = Date.UTC(2026, 10, 25);

/** Hesabın tutabileceği kayıt sayısı (fazlası temizlenir): yer sayısı, eski hesapta en az SAVE_SLOTS_OLD. */
export function keepFor(created: number, cents: number): number {
  const n = slotsFor(cents);
  return created < SAVE_SLOTS2_AT ? Math.max(n, SAVE_SLOTS_OLD) : n;
}
/** Yer numarası geçerli mi (1..n; n verilmezse en büyük yer sayısı). */
export const validSlot = (s: unknown, n = SAVE_SLOTS_MAX): s is number => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= n;

/**
 * Destekçi paketi (2026-11-21): ödeme Polar'ın sayfasında (satıcı Polar); kart bilgisi oyuna ve sunucuya gelmez. Basamak
 * hesabın toplam ödemesinden (iade düşülür): 1 $ el sıkışma rozeti, 5 $ kanatlar ve 1 fazla kayıt yeri, 15 $ altın kask ve 2
 * fazla kayıt yeri. Tek ödeme 1–50 $. Tutarlar sent.
 */
export const SUPPORT_MIN = 100;
export const SUPPORT_MAX = 5000;
export const SUPPORT_TIERS = [100, 500, 1500] as const;
/** Fazla kayıt yeri: basamak 2'de 1, 3'te 2. */
const EXTRA_SLOTS = [0, 0, 1, 2] as const;

/** Toplam ödemenin basamağı: 0 (yok), 1, 2, 3. */
export function supportTier(cents: number): 0 | 1 | 2 | 3 {
  return cents >= SUPPORT_TIERS[2] ? 3 : cents >= SUPPORT_TIERS[1] ? 2 : cents >= SUPPORT_TIERS[0] ? 1 : 0;
}

/** Hesabın günlük geri bildirim hakkı: 3, destekçi basamağı başına +1 (1 $: 4, 5 $: 5, 15 $: 6). */
export const feedbackPerDay = (cents: number): number => 3 + supportTier(cents);

/** Hesabın kayıt yeri sayısı. */
export function slotsFor(cents: number): number {
  return SAVE_SLOTS_BASE + EXTRA_SLOTS[supportTier(cents)];
}

/** Basamağın kazandırdığı fazla kayıt yeri. */
export const extraSlots = (tier: number): number => EXTRA_SLOTS[tier as 0 | 1 | 2 | 3] ?? 0;

/** Geri bildirim: görüş metninin en büyük uzunluğu ve "Steam'de _ $ veririm" üst sınırı. */
export const FEEDBACK_MAX = 2000;
export const PRICE_MAX = 1000000;

/**
 * Katkı puanı (2026-11-24): oyuncu geri bildirimini "incelensin" diye gönderirse yönetici e-postadaki düğmelerle karar verir.
 * Hata raporu doğrulanırsa 50, öneri kabul edilirse 30, sonra yapılınca 20 daha (toplam 70 / 50). Uygun değil ve tekrar
 * (aynısını başkası önce bildirdi) 0. Puan savaş skorlarından ayrı; rütbe rozeti profilde ve skor tablolarında görünür.
 */
export type FeedbackKind = 'bug' | 'idea';
export type FeedbackStatus = 'review' | 'verified' | 'accepted' | 'done' | 'rejected' | 'duplicate';
export type FeedbackAct = 'verify' | 'accept' | 'done' | 'reject' | 'dup';
export const FEEDBACK_ACTS: readonly FeedbackAct[] = ['verify', 'accept', 'done', 'reject', 'dup'];
export const CONTRIB_VERIFIED = 50;
export const CONTRIB_ACCEPTED = 30;
export const CONTRIB_DONE = 20;

/** Yönetici işlemi bu durumda geçerli mi; geçerliyse yeni durum ve eklenecek puan. "Yapıldı" incelemedeki mesaja onayı da verir. */
export function feedbackStep(kind: FeedbackKind, status: FeedbackStatus, act: FeedbackAct): { status: FeedbackStatus; add: number } | null {
  const base = kind === 'bug' ? CONTRIB_VERIFIED : CONTRIB_ACCEPTED;
  const open = status === 'review' || status === 'rejected' || status === 'duplicate';
  if (act === 'verify' && kind === 'bug' && open) return { status: 'verified', add: base };
  if (act === 'accept' && kind === 'idea' && open) return { status: 'accepted', add: base };
  if (act === 'done' && (status === 'verified' || status === 'accepted')) return { status: 'done', add: CONTRIB_DONE };
  if (act === 'done' && open) return { status: 'done', add: base + CONTRIB_DONE };
  if (act === 'reject' && status === 'review') return { status: 'rejected', add: 0 };
  if (act === 'dup' && status === 'review') return { status: 'duplicate', add: 0 };
  return null;
}

/** Rütbe eşikleri (puan): sıra rozetin numarasıdır (1 Hangar çırağı … 13 Efsane test pilotu). İlk puan 1. rütbeyi verir. */
export const CONTRIB_RANKS = [1, 300, 400, 500, 600, 700, 800, 900, 1000, 1150, 1300, 1500, 1750] as const;

/** Rütbe adları (Türkçe, İngilizce); sunucu da okur (durum e-postası), bu yüzden L() değil. */
export const CONTRIB_RANK_NAMES: readonly (readonly [string, string])[] = [
  ['Hangar çırağı', 'Hangar apprentice'],
  ['Yer personeli', 'Ground crew'],
  ['Mekanisyen', 'Mechanic'],
  ['Kıdemli mekanisyen', 'Senior mechanic'],
  ['Test teknisyeni', 'Test technician'],
  ['Uçuş mühendisi', 'Flight engineer'],
  ['Test pilotu', 'Test pilot'],
  ['Kıdemli test pilotu', 'Senior test pilot'],
  ['Baş test pilotu', 'Chief test pilot'],
  ['Tasarım mühendisi', 'Design engineer'],
  ['Baş mühendis', 'Chief engineer'],
  ['Uçuş müfettişi', 'Flight inspector'],
  ['Efsane test pilotu', 'Legendary test pilot'],
];

/** Puandan rütbe (0: henüz puan yok). */
export function contribRank(points: number): number {
  let r = 0;
  for (let i = 0; i < CONTRIB_RANKS.length; i++) if (points >= CONTRIB_RANKS[i]) r = i + 1;
  return r;
}

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
  /** Yalnız oyuncunun kendi satırında: skoru gizli, tabloda sırası yok (rank 0). */
  hidden?: boolean;
  /** Destekçi rozeti (1–3; yoksa yok). */
  badge?: number;
  /** Katkı puanı (yoksa yok): rütbe rozeti bundan. */
  contrib?: number;
}
