// Dil: Türkçe (asıl) ve İngilizce. Metinler kodda iki dilde yan yana: L('Türkçe', 'English'); çeviri unutulmaz,
// şablonlu cümle iki dilde de doğal kurulur. Dil açılışta bir kez okunur (warsim.lang; yoksa tarayıcının dili) ve
// değişince sayfa yeniden açılır: bütün metinler (modül düzeyindeki listeler dahil) yeni dille kurulur. Başsız
// simülasyonda (Node, tools/sim) hep Türkçe. Büyük kataloglarda (uçak açıklamaları, araştırmalar) İngilizce metin
// kimliğe göre yan dosyada durur; kalıplı adlar (askı, taret, yük) terms() sözlüğüyle çevrilir.

export type Lang = 'tr' | 'en';

const KEY = 'warsim.lang';

// index.html'deki küçük betik de bu kuralla ilk yükleme ekranını çevirir: kural değişirse orası da değişmeli.
function initial(): Lang {
  if (typeof window === 'undefined') return 'tr';
  // ?lang=en|tr (deneme) ; video kayıt kipi ayrıca istenmedikçe Türkçe
  const q = new URLSearchParams(location.search);
  const ql = q.get('lang');
  if (ql === 'tr' || ql === 'en') return ql;
  if (q.has('rec')) return 'tr';
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'tr' || s === 'en') return s;
  } catch {
    /* gizli pencere: tarayıcı diline bak */
  }
  const nav = (navigator.language || 'tr').toLowerCase();
  return nav.startsWith('tr') ? 'tr' : 'en';
}

export const LANG: Lang = initial();
export const EN = LANG === 'en';

/** Geçerli dildeki metin. */
export const L = (tr: string, en: string): string => (EN ? en : tr);

/** Sayı, saat ve tarih biçimi için yerel ayar. */
export const LOCALE = EN ? 'en-GB' : 'tr-TR';

/** Küçük harf (Türkçede I → ı). */
export const lower = (s: string): string => s.toLocaleLowerCase(LOCALE);

/** İngilizce sayılı ifade: "1 mine", "2 mines" (Türkçede sayıdan sonra ad tekil kalır, orada gerekmez). */
export const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/**
 * Kalıplı adlar için ifade sözlüğü: İngilizcede her Türkçe parça sırayla karşılığıyla değişir (uzun ifadeler önce
 * gelmeli), Türkçede ad olduğu gibi kalır. Ör. "Gövde altı tank (330 L)" → "Belly tank (330 L)".
 */
export function terms(list: [string, string][]): (s: string) => string {
  return EN ? (s) => list.reduce((t, [a, b]) => (t.includes(a) ? t.split(a).join(b) : t), s) : (s) => s;
}

export function saveLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* kaydedilemezse yalnız bu oturum */
  }
}
