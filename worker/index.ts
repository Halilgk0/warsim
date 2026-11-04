// WarSimBox sunucusu (Cloudflare Worker): oyunun dosyalarını Cloudflare'in varlık sunucusu verir, bu kod yalnız
// /api/* isteklerine bakar. Veritabanı D1 (migrations/).
//
// - Hesap: ad + şifre. Şifre tarayıcıda PBKDF2 ile uzatılır (bedava planda istek başına ~10 ms işlemci süresi var;
//   ağır özetleme sunucuda yapılamaz). Sunucu gelen istemci özetini rastgele tuzla SHA-256'dan geçirip saklar.
// - Hesap açılırken e-posta adresi ve Gizlilik/KVKK onayı zorunlu; eski hesaplar isterse sonradan ekler. Adres, ona
//   gönderilen 6 haneli kodla doğrulanmadan kaydedilmez. Kod gönderimi sınırlı (başkasının kutusuna yağdırılmasın, Gmail
//   sınırı aşılmasın). Yenilik e-postası izni ayrı ve isteğe bağlı (news_opt); e-postalar hesabın dilinde gider. Bir adresle
//   tek hesap (email_key): kod doğrulanmadan söylenmez, adresin kayıtlı olup olmadığını yalnız kutunun sahibi öğrenir. Adres
//   yalnız sahibinin profilinde döner; publicAccount'a girmez (tarayıcıda saklanmaz, skor tablosuna gitmez).
// - Oturum: rastgele belirteç; veritabanında yalnız özeti. Art arda 8 yanlış şifrede hesap 15 dakika kilitlenir.
// - Kurtarma kodu: hesap açılınca bir kez gösterilir; şifre unutulunca bununla yenilenir (kod da yenilenir).
// - Kayıtlar: gzip'li veri + liste için özet; otomatik kayıtlardan en yeni 3'ü, elle kayıtlardan en çok 30'u kalır.
// - İstatistik: istemci harekâtın o anki toplamlarını yollar; sunucu harekâtın önceki en yüksek değerlerine göre artışı
//   hesaplar, akla yatkınlık sınırlarıyla kırpar ve tüm zamanlar + bu haftanın toplamlarına ekler.
// - Geri bildirim: warsimbox@gmail.com kutusuna e-posta olarak gelir, veritabanına yazılmaz. Görüş ve öneri için e-postalı
//   hesap gerekir (Yanıtla düğmesi oyuncuya yazar); "Steam'de _ $ veririm" misafire de açık, misafir komutan adı yazar.
// - Yönetici: ADMIN_KEY gizli değişkeniyle hesap bilgisi (kimlik doğrulama soruları için), kurtarma kodu sıfırlama ve
//   hesap silme.

import { FEEDBACK_MAX, LEGAL_VERSION, METRICS, PRICE_MAX, type LeaderRow, type Metric, type StatsReport, cleanEmail, cleanName, emailKey, nameKey, nameProblem, validEmail } from '../src/net/shared';
import { codeMail } from './codeMail';
import { feedbackMail } from './feedbackMail';
import { type MailEnv, mailReady, sendMail } from './mail';

interface Env extends MailEnv {
  DB: D1Database;
  ADMIN_KEY?: string;
  /** Oyunun dosyaları (dist/): olmayan adreste 404.html buradan. */
  ASSETS: Fetcher;
}

interface AccountRow {
  id: number;
  name: string;
  name_key: string;
  pass_salt: string;
  pass_hash: string;
  recovery_hash: string;
  created: number;
  last_login: number;
  no_tutorial: number;
  fails: number;
  locked_until: number;
  email: string | null;
  legal_version: string | null;
  news_opt: number;
  news_at: number | null;
  lang: string | null;
  /** Okunan haberlerin kimlikleri (JSON dizisi). */
  news_seen?: string;
}

const NEWS_SEEN_MAX = 200;
const SESSION_DAYS = 90;
const MAX_FAILS = 8;
const LOCK_MS = 15 * 60 * 1000;
const AUTO_KEEP = 3;
const MANUAL_MAX = 30;
const SAVE_MAX_BYTES = 1_500_000;
const CODE_MS = 10 * 60 * 1000;
const CODE_GAP_MS = 60 * 1000;
const CODE_TRIES = 5;
const DAY_MS = 86400000;
/** Gönderim sınırları: adres başına, IP başına (telefon operatörlerinde çok oyuncu aynı IP'de olabilir), toplam (Gmail ~500/gün). */
const LIMIT_ADDRESS = { max: 6, ms: DAY_MS };
const LIMIT_IP = { max: 20, ms: 60 * 60 * 1000 };
const LIMIT_ALL = { max: 400, ms: DAY_MS };
/** Geri bildirim sınırları: hesap ve misafir (IP) başına, toplam. Kodlarla birlikte Gmail'in günlük sınırının altında kalır. */
const LIMIT_FB_ACCOUNT = { max: 10, ms: DAY_MS };
const LIMIT_FB_GUEST = { max: 5, ms: 60 * 60 * 1000 };
const LIMIT_FB_ALL = { max: 50, ms: DAY_MS };

// ---------------------------------------------------------------- yardımcılar

const enc = new TextEncoder();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Hata: istemci kodu kendi dilinde iletiye çevirir. */
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

function hex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** Sabit süreli karşılaştırma (yanıt süresinden özet sızmasın). */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Kurtarma kodu: 12 karakter, karışmayan harf ve rakamlar (0/O, 1/I yok), 4'lü gruplar. */
function newRecoveryCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(12));
  const s = [...r].map((x) => A[x % A.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

const normCode = (c: string): string => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** İstemci özeti: 64 haneli onaltılık (PBKDF2 çıktısı). */
const validClientHash = (h: unknown): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h);

async function passHash(salt: string, clientHash: string): Promise<string> {
  return sha256(`${salt}:${clientHash}`);
}

/** ISO hafta (UTC, pazartesi başlar): '2026-W44'. */
function isoWeek(t: number): string {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function newsSeenList(a: AccountRow): string[] {
  try {
    const v: unknown = JSON.parse(a.news_seen ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const publicAccount = (a: AccountRow) => ({ name: a.name, key: a.name_key, created: a.created, lastLogin: a.last_login, noTutorial: !!a.no_tutorial, hasEmail: !!a.email, lang: a.lang, newsSeen: newsSeenList(a) });

/** Geçerli dil kodu ya da yok. */
const langCode = (v: unknown): 'tr' | 'en' | null => (v === 'tr' || v === 'en' ? v : null);

async function openSession(env: Env, accountId: number): Promise<string> {
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, account_id, created, expires) VALUES (?, ?, ?, ?)')
      .bind(await sha256(token), accountId, now, now + SESSION_DAYS * 86400000),
    // Süresi dolan oturumlar burada temizlenir (zamanlanmış iş yok)
    env.DB.prepare('DELETE FROM sessions WHERE expires <= ?').bind(now),
  ]);
  return token;
}

async function authed(req: Request, env: Env): Promise<AccountRow | null> {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get('authorization') ?? '');
  if (!m) return null;
  const row = await env.DB.prepare(
    'SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires > ?',
  ).bind(await sha256(m[1]), Date.now()).first<AccountRow>();
  return row ?? null;
}

/** Kilit ve yanlış deneme sayacı. true: deneme yapılabilir. */
function unlocked(a: AccountRow): boolean {
  return a.locked_until <= Date.now();
}

async function noteFail(env: Env, a: AccountRow): Promise<Response> {
  const fails = a.fails + 1;
  const lock = fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0;
  await env.DB.prepare('UPDATE accounts SET fails = ?, locked_until = ? WHERE id = ?').bind(lock ? 0 : fails, lock, a.id).run();
  return lock ? fail(429, 'locked', { until: lock }) : fail(401, 'wrong', { left: MAX_FAILS - fails });
}

// ---------------------------------------------------------------- e-posta doğrulama

const codeHash = (email: string, code: string): Promise<string> => sha256(`${email}:${code}`);

/** Sınır sayaçlarını artırır; biri aşıldıysa true. Süresi dolan pencere baştan başlar. */
async function limited(env: Env, list: { key: string; max: number; ms: number }[], now: number): Promise<boolean> {
  const res = await env.DB.batch<{ count: number }>(list.map((l) => env.DB.prepare(
    `INSERT INTO mail_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT (key) DO UPDATE SET count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
     RETURNING count`,
  ).bind(l.key, now, now - l.ms)));
  return res.some((r, i) => r.results[0].count > list[i].max);
}

const clientIp = (req: Request): string => req.headers.get('cf-connecting-ip') ?? 'yerel';

/** Geri bildirim: görüş için e-postalı hesap, yalnız fiyat için misafire komutan adı yeter. warsimbox@gmail.com'a e-posta olur. */
async function sendFeedback(req: Request, env: Env): Promise<Response> {
  const a = await authed(req, env);
  const b = await body<{ message?: string; price?: number | null; name?: string; lang?: string }>(req);
  const message = String(b?.message ?? '').trim().slice(0, FEEDBACK_MAX);
  const price = b?.price === null || b?.price === undefined ? null : Number(b.price);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > PRICE_MAX)) return fail(400, 'bad_price');
  if (!message && price === null) return fail(400, 'feedback_empty');
  if (message && !a) return fail(401, 'need_account');
  if (message && !a!.email) return fail(403, 'need_email');
  const name = a?.name ?? cleanName(String(b?.name ?? ''));
  const problem = nameProblem(name);
  if (problem) return fail(400, `name_${problem}`);
  if (!mailReady(env)) return fail(503, 'mail_off');
  const now = Date.now();
  const who = a
    ? { key: `fb:hesap:${a.id}`, ...LIMIT_FB_ACCOUNT }
    : { key: `fb:ip:${await sha256(clientIp(req))}`, ...LIMIT_FB_GUEST };
  if (await limited(env, [who, { key: 'fb:all', ...LIMIT_FB_ALL }], now)) return fail(429, 'feedback_limit');
  try {
    const email = a?.email ?? null;
    await sendMail(env, env.MAIL_FROM!, feedbackMail({ name, email, lang: a?.lang ?? langCode(b?.lang), message, price }), email);
  } catch (e) {
    console.error(e);
    return fail(502, 'mail_failed');
  }
  return json({ ok: true });
}

/** Doğrulama kodu gönder. Hesap açarken ad da gelir: alınmışsa kod gönderilmeden söylenir. */
async function emailCode(req: Request, env: Env): Promise<Response> {
  const b = await body<{ email?: string; name?: string; lang?: string }>(req);
  const email = cleanEmail(String(b?.email ?? ''));
  if (!validEmail(email)) return fail(400, 'email_bad');
  if (typeof b?.name === 'string') {
    const problem = nameProblem(b.name);
    if (problem) return fail(400, `name_${problem}`);
    if (await env.DB.prepare('SELECT 1 FROM accounts WHERE name_key = ?').bind(nameKey(b.name)).first()) return fail(409, 'taken');
  }
  if (!mailReady(env)) return fail(503, 'mail_off');
  const now = Date.now();
  const prev = await env.DB.prepare('SELECT sent_at FROM email_codes WHERE email = ?').bind(email).first<{ sent_at: number }>();
  const wait = prev ? Math.ceil((prev.sent_at + CODE_GAP_MS - now) / 1000) : 0;
  if (wait > 0) return fail(429, 'mail_wait', { wait });
  if (await limited(env, [
    // Aynı kutuya giden yazımlar sınırı aşamasın
    { key: `to:${await sha256(emailKey(email))}`, ...LIMIT_ADDRESS },
    { key: `ip:${await sha256(clientIp(req))}`, ...LIMIT_IP },
    { key: 'all', ...LIMIT_ALL },
  ], now)) return fail(429, 'mail_limit');
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(n).padStart(6, '0');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM email_codes WHERE expires <= ?').bind(now),
    env.DB.prepare('DELETE FROM mail_limits WHERE window_start <= ?').bind(now - 2 * DAY_MS),
    env.DB.prepare('INSERT OR REPLACE INTO email_codes (email, code_hash, expires, tries, sent_at) VALUES (?, ?, ?, 0, ?)')
      .bind(email, await codeHash(email, code), now + CODE_MS, now),
  ]);
  try {
    await sendMail(env, email, codeMail(code, b?.lang === 'en'));
  } catch (e) {
    console.error(e);
    await env.DB.prepare('DELETE FROM email_codes WHERE email = ?').bind(email).run();
    return fail(502, 'mail_failed');
  }
  return json({ ok: true });
}

/** Kodu denetler: doğruysa kod silinir ve null döner, değilse hata yanıtı (art arda yanlışta kod geçersiz olur). */
async function wrongCode(env: Env, email: string, code: unknown): Promise<Response | null> {
  const row = await env.DB.prepare('SELECT code_hash, expires, tries FROM email_codes WHERE email = ?').bind(email)
    .first<{ code_hash: string; expires: number; tries: number }>();
  if (!row || row.expires <= Date.now()) return fail(400, 'code_expired');
  if (same(await codeHash(email, String(code ?? '').replace(/\D/g, '')), row.code_hash)) {
    await env.DB.prepare('DELETE FROM email_codes WHERE email = ?').bind(email).run();
    return null;
  }
  const left = CODE_TRIES - row.tries - 1;
  if (left > 0) await env.DB.prepare('UPDATE email_codes SET tries = tries + 1 WHERE email = ?').bind(email).run();
  else await env.DB.prepare('DELETE FROM email_codes WHERE email = ?').bind(email).run();
  return left > 0 ? fail(400, 'code_wrong', { left }) : fail(400, 'code_expired');
}

/** Adres başka bir hesapta mı (accountId: bu hesabın kendisi sayılmaz). Kod doğrulandıktan sonra sorulur. */
async function emailTaken(env: Env, email: string, accountId = 0): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 FROM accounts WHERE email_key = ? AND id != ?').bind(emailKey(email), accountId).first());
}

// ---------------------------------------------------------------- hesap

/** Hesabı ve ona bağlı bütün verileri siler. Hesaba bağlı yeni tablo eklenirse buraya da eklenmeli. */
async function eraseAccount(env: Env, a: AccountRow): Promise<{ sessions: number; saves: number; campaigns: number; stats: number }> {
  const done = await env.DB.batch([
    ...['sessions', 'saves', 'campaigns', 'stats'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE account_id = ?`).bind(a.id)),
    env.DB.prepare('DELETE FROM email_codes WHERE email = ?').bind(a.email ?? ''),
    env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(a.id),
  ]);
  const [sessions, saves, campaigns, stats] = done.map((r) => r.meta.changes);
  return { sessions, saves, campaigns, stats };
}

/** Oyuncu kendi hesabını siler: şifre gerekir. */
async function deleteMe(req: Request, env: Env, a: AccountRow): Promise<Response> {
  const b = await body<{ pass?: string }>(req);
  if (!validClientHash(b?.pass)) return fail(400, 'bad_pass');
  if (!unlocked(a)) return fail(429, 'locked', { until: a.locked_until });
  if (!same(await passHash(a.pass_salt, b!.pass!), a.pass_hash)) return noteFail(env, a);
  await eraseAccount(env, a);
  return json({ ok: true });
}

async function register(req: Request, env: Env): Promise<Response> {
  const b = await body<{ name?: string; pass?: string; email?: string; code?: string; accepted?: boolean; news?: boolean; lang?: string }>(req);
  const name = cleanName(b?.name ?? '');
  const problem = nameProblem(name);
  if (problem) return fail(400, `name_${problem}`);
  if (!validClientHash(b?.pass)) return fail(400, 'bad_pass');
  // Eski adresteki paket e-posta sormaz: oradaki eski oyuncular kayıtlarını taşımak için hesap açabilsin
  const email = req.headers.get('origin') === OLD_ORIGIN ? null : cleanEmail(String(b?.email ?? ''));
  if (email !== null) {
    if (!validEmail(email)) return fail(400, 'email_bad');
    if (b?.accepted !== true) return fail(400, 'not_accepted');
  }
  const key = nameKey(name);
  if (await env.DB.prepare('SELECT 1 FROM accounts WHERE name_key = ?').bind(key).first()) return fail(409, 'taken');
  // Kod en sonda: yanlış ad ya da şifre yüzünden harcanmasın
  if (email !== null) {
    const bad = await wrongCode(env, email, b?.code);
    if (bad) return bad;
    if (await emailTaken(env, email)) return fail(409, 'email_taken');
  }
  const salt = randomHex(16);
  const code = newRecoveryCode();
  const now = Date.now();
  const news = !!email && b?.news === true;
  const res = await env.DB.prepare(
    `INSERT INTO accounts (name, name_key, pass_salt, pass_hash, recovery_hash, created, last_login, email, email_key, legal_version, legal_at, news_opt, news_at, lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(name, key, salt, await passHash(salt, b!.pass!), await sha256(normCode(code)), now, now, email, email && emailKey(email), email && LEGAL_VERSION, email && now, news ? 1 : 0, news ? now : null, langCode(b?.lang)).run();
  const id = res.meta.last_row_id;
  const acc = await env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first<AccountRow>();
  return json({ token: await openSession(env, id), account: publicAccount(acc!), recoveryCode: code });
}

async function login(req: Request, env: Env): Promise<Response> {
  const b = await body<{ name?: string; pass?: string }>(req);
  if (!validClientHash(b?.pass)) return fail(400, 'bad_pass');
  const a = await env.DB.prepare('SELECT * FROM accounts WHERE name_key = ?').bind(nameKey(b?.name ?? '')).first<AccountRow>();
  if (!a) return fail(404, 'no_account');
  if (!unlocked(a)) return fail(429, 'locked', { until: a.locked_until });
  if (!same(await passHash(a.pass_salt, b!.pass!), a.pass_hash)) return noteFail(env, a);
  const now = Date.now();
  await env.DB.prepare('UPDATE accounts SET fails = 0, locked_until = 0, last_login = ? WHERE id = ?').bind(now, a.id).run();
  a.last_login = now;
  return json({ token: await openSession(env, a.id), account: publicAccount(a) });
}

/** Şifre unutuldu: kurtarma koduyla yeni şifre; kod yenilenir, öbür oturumlar kapanır. */
async function recover(req: Request, env: Env): Promise<Response> {
  const b = await body<{ name?: string; code?: string; pass?: string }>(req);
  if (!validClientHash(b?.pass)) return fail(400, 'bad_pass');
  const a = await env.DB.prepare('SELECT * FROM accounts WHERE name_key = ?').bind(nameKey(b?.name ?? '')).first<AccountRow>();
  if (!a) return fail(404, 'no_account');
  if (!unlocked(a)) return fail(429, 'locked', { until: a.locked_until });
  if (!same(await sha256(normCode(b?.code ?? '')), a.recovery_hash)) return noteFail(env, a);
  const salt = randomHex(16);
  const code = newRecoveryCode();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE accounts SET pass_salt = ?, pass_hash = ?, recovery_hash = ?, fails = 0, locked_until = 0, last_login = ? WHERE id = ?')
      .bind(salt, await passHash(salt, b!.pass!), await sha256(normCode(code)), now, a.id),
    env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(a.id),
  ]);
  a.last_login = now;
  return json({ token: await openSession(env, a.id), account: publicAccount(a), recoveryCode: code });
}

async function logout(req: Request, env: Env): Promise<Response> {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get('authorization') ?? '');
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
  return json({ ok: true });
}

async function updateMe(req: Request, env: Env, a: AccountRow): Promise<Response> {
  const b = await body<{ noTutorial?: boolean; lang?: string; newsSeen?: string }>(req);
  const seen = b?.newsSeen;
  if (typeof seen === 'string' && /^[a-z0-9-]{1,40}$/.test(seen)) {
    // Tek komutta: art arda açılan iki haberden biri kaybolmaz
    await env.DB.prepare(
      `UPDATE accounts SET news_seen = json_insert(news_seen, '$[#]', ?) WHERE id = ? AND json_array_length(news_seen) < ${NEWS_SEEN_MAX} AND NOT EXISTS (SELECT 1 FROM json_each(accounts.news_seen) WHERE value = ?)`,
    ).bind(seen, a.id, seen).run();
    const list = newsSeenList(a);
    if (!list.includes(seen) && list.length < NEWS_SEEN_MAX) a.news_seen = JSON.stringify([...list, seen]);
  }
  if (typeof b?.noTutorial === 'boolean') {
    await env.DB.prepare('UPDATE accounts SET no_tutorial = ? WHERE id = ?').bind(b.noTutorial ? 1 : 0, a.id).run();
    a.no_tutorial = b.noTutorial ? 1 : 0;
  }
  const lang = langCode(b?.lang);
  if (lang && lang !== a.lang) {
    await env.DB.prepare('UPDATE accounts SET lang = ? WHERE id = ?').bind(lang, a.id).run();
    a.lang = lang;
  }
  return json({ account: publicAccount(a) });
}

/** E-posta ekle ya da değiştir (yeni adres kodla doğrulanır), yenilik iznini aç ya da kapat. Metin onayı yoksa bu sırada alınır. */
async function setEmail(req: Request, env: Env, a: AccountRow): Promise<Response> {
  const b = await body<{ email?: string; code?: string; accepted?: boolean; news?: boolean }>(req);
  const email = cleanEmail(String(b?.email ?? ''));
  if (!validEmail(email)) return fail(400, 'email_bad');
  if (!a.legal_version && b?.accepted !== true) return fail(400, 'not_accepted');
  if (email !== a.email) {
    const bad = await wrongCode(env, email, b?.code);
    if (bad) return bad;
    if (await emailTaken(env, email, a.id)) return fail(409, 'email_taken');
  }
  const news = b?.news === true;
  const now = Date.now();
  await env.DB.prepare(
    'UPDATE accounts SET email = ?, email_key = ?, legal_version = COALESCE(legal_version, ?), legal_at = COALESCE(legal_at, ?), news_opt = ?, news_at = ? WHERE id = ?',
  ).bind(email, emailKey(email), LEGAL_VERSION, now, news ? 1 : 0, news ? a.news_at ?? now : null, a.id).run();
  a.email = email;
  return json({ account: publicAccount(a), email, news });
}

/** Profil: hesap bilgisi, skorlar (tüm zamanlar + bu hafta), her ölçütte tüm zamanlar sırası, kayıt sayısı. */
async function profile(env: Env, a: AccountRow): Promise<Response> {
  const week = isoWeek(Date.now());
  const ranks = METRICS.map((m) => `(SELECT COUNT(*) FROM stats WHERE period = 'all' AND ${m} > s.${m}) + 1 AS ${m}`).join(', ');
  const [all, wk, rank, saves] = await env.DB.batch([
    env.DB.prepare("SELECT kills, wins, earned, peak, play_sec FROM stats WHERE account_id = ? AND period = 'all'").bind(a.id),
    env.DB.prepare('SELECT kills, wins, earned, peak, play_sec FROM stats WHERE account_id = ? AND period = ?').bind(a.id, week),
    env.DB.prepare(`SELECT ${ranks} FROM stats s WHERE s.account_id = ? AND s.period = 'all'`).bind(a.id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM saves WHERE account_id = ?').bind(a.id),
  ]);
  return json({
    account: publicAccount(a), all: all.results[0] ?? null, week: wk.results[0] ?? null, ranks: rank.results[0] ?? null,
    saves: (saves.results[0] as { n: number } | undefined)?.n ?? 0,
    email: a.email, news: !!a.news_opt, accepted: !!a.legal_version,
  });
}

/** Şifre değiştir: mevcut şifre gerekir; bu oturum açık kalır, öbür cihazlardaki oturumlar kapanır. */
async function changePassword(req: Request, env: Env, a: AccountRow): Promise<Response> {
  const b = await body<{ old?: string; pass?: string }>(req);
  if (!validClientHash(b?.old) || !validClientHash(b?.pass)) return fail(400, 'bad_pass');
  if (!unlocked(a)) return fail(429, 'locked', { until: a.locked_until });
  if (!same(await passHash(a.pass_salt, b!.old!), a.pass_hash)) return noteFail(env, a);
  const salt = randomHex(16);
  const token = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get('authorization') ?? '')![1];
  await env.DB.batch([
    env.DB.prepare('UPDATE accounts SET pass_salt = ?, pass_hash = ?, fails = 0 WHERE id = ?').bind(salt, await passHash(salt, b!.pass!), a.id),
    env.DB.prepare('DELETE FROM sessions WHERE account_id = ? AND token_hash != ?').bind(a.id, await sha256(token)),
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- kayıtlar

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function listSaves(env: Env, a: AccountRow): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT meta FROM saves WHERE account_id = ? ORDER BY created DESC').bind(a.id).all<{ meta: string }>();
  return json({ saves: results.map((r) => JSON.parse(r.meta)) });
}

async function putSave(req: Request, env: Env, a: AccountRow, id: string): Promise<Response> {
  const b = await body<{ meta?: Record<string, unknown>; data?: string }>(req);
  if (!b?.meta || typeof b.data !== 'string') return fail(400, 'bad_save');
  let data: Uint8Array;
  try {
    data = b64ToBytes(b.data);
  } catch {
    return fail(400, 'bad_save');
  }
  if (data.length > SAVE_MAX_BYTES) return fail(413, 'too_big');
  const owner = await env.DB.prepare('SELECT account_id FROM saves WHERE id = ?').bind(id).first<{ account_id: number }>();
  if (owner && owner.account_id !== a.id) return fail(403, 'forbidden');
  const kind = b.meta.kind === 'auto' ? 'auto' : 'manual';
  const created = typeof b.meta.created === 'number' ? b.meta.created : Date.now();
  if (!owner && kind === 'manual') {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM saves WHERE account_id = ? AND kind = 'manual'").bind(a.id).first<{ n: number }>();
    if ((n?.n ?? 0) >= MANUAL_MAX) return fail(409, 'too_many');
  }
  const meta = JSON.stringify({ ...b.meta, id, account: a.name_key, kind });
  await env.DB.prepare('INSERT OR REPLACE INTO saves (id, account_id, kind, created, meta, data) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, a.id, kind, created, meta, data).run();
  if (kind === 'auto') {
    // Otomatik kayıtlardan en yeni AUTO_KEEP tanesi kalır
    await env.DB.prepare(
      "DELETE FROM saves WHERE account_id = ? AND kind = 'auto' AND id NOT IN (SELECT id FROM saves WHERE account_id = ? AND kind = 'auto' ORDER BY created DESC LIMIT ?)",
    ).bind(a.id, a.id, AUTO_KEEP).run();
  }
  return json({ ok: true, meta: JSON.parse(meta) });
}

async function getSave(env: Env, a: AccountRow, id: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT meta, data FROM saves WHERE id = ? AND account_id = ?').bind(id, a.id).first<{ meta: string; data: ArrayBuffer }>();
  if (!row) return fail(404, 'no_save');
  return json({ meta: JSON.parse(row.meta), data: bytesToB64(new Uint8Array(row.data)) });
}

async function deleteSave(env: Env, a: AccountRow, id: string): Promise<Response> {
  await env.DB.prepare('DELETE FROM saves WHERE id = ? AND account_id = ?').bind(id, a.id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- istatistik

const num = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);

/**
 * Harekâtın o anki toplamları gelir. Önceki en yüksek değerlere göre artış hesaplanır ve akla yatkınlıkla kırpılır:
 * oyun süresi gerçek zamandaki en yüksek hızı (32×) aşamaz, oynama süresi (artış) son bildirimden bu yana geçeni aşamaz,
 * düşürme ve kazanç oyun süresine oranlı sınırlı. Aynı harekât yeniden yüklenince önceki en yükseğe kadar sayılmaz.
 */
async function reportStats(req: Request, env: Env, a: AccountRow): Promise<Response> {
  const r = await body<StatsReport>(req);
  if (!r || typeof r.campaign !== 'string' || !/^[\w:.-]{6,80}$/.test(r.campaign)) return fail(400, 'bad_stats');
  const now = Date.now();
  const prev = await env.DB.prepare('SELECT * FROM campaigns WHERE account_id = ? AND campaign = ?').bind(a.id, r.campaign)
    .first<{ kills: number; earned: number; peak: number; won: number; game_time: number; play_sec: number; updated: number }>();
  const p = prev ?? { kills: 0, earned: 0, peak: 0, won: 0, game_time: 0, play_sec: 0, updated: 0 };
  const since = prev ? Math.max(0, (now - p.updated) / 1000) : Infinity;
  const gameTime = num(r.gameTime, 1e8);
  const dGame = Math.min(Math.max(0, gameTime - p.game_time), prev ? since * 32 + 120 : gameTime);
  const dKills = Math.min(Math.max(0, Math.round(num(r.kills, 1e6)) - p.kills), Math.ceil(5 + dGame / 10));
  const dEarned = Math.min(Math.max(0, Math.round(num(r.earned, 1e12)) - p.earned), Math.ceil(20000 + dGame * 400));
  // Oynama süresi artış olarak gelir (eski kayıt yüklenince sayaç geri gitmesin); son bildirimden bu yana geçen süreyi aşamaz
  const dPlay = Math.min(Math.round(num(r.playSec, 3600)), prev ? Math.ceil(since + 60) : 900);
  const peak = Math.min(Math.round(num(r.peak, 400)), p.peak + Math.ceil(20 + dGame / 5));
  const won = r.won === true && gameTime >= 300 && !p.won ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO campaigns (account_id, campaign, kills, earned, peak, won, game_time, play_sec, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (account_id, campaign) DO UPDATE SET kills = kills + ?, earned = earned + ?, peak = MAX(peak, ?), won = MAX(won, ?),
       game_time = game_time + ?, play_sec = play_sec + ?, updated = ?`,
  ).bind(a.id, r.campaign, dKills, dEarned, peak, won, dGame, dPlay, now, dKills, dEarned, peak, won, dGame, dPlay, now).run();
  const add = env.DB.prepare(
    `INSERT INTO stats (account_id, period, kills, wins, earned, peak, play_sec) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (account_id, period) DO UPDATE SET kills = kills + ?, wins = wins + ?, earned = earned + ?, peak = MAX(peak, ?), play_sec = play_sec + ?`,
  );
  await env.DB.batch(['all', isoWeek(now)].map((period) => add.bind(a.id, period, dKills, won, dEarned, peak, dPlay, dKills, won, dEarned, peak, dPlay)));
  return json({ ok: true, counted: { kills: dKills, earned: dEarned, peak, won: !!won, playSec: dPlay } });
}

async function leaderboard(url: URL, env: Env, a: AccountRow | null): Promise<Response> {
  const metric = url.searchParams.get('metric') as Metric;
  if (!METRICS.includes(metric)) return fail(400, 'bad_metric');
  const period = url.searchParams.get('period') === 'week' ? isoWeek(Date.now()) : 'all';
  // Sütun adı yalnız beyaz listeden (METRICS): sorguya kullanıcı girdisi girmez
  const { results } = await env.DB.prepare(
    `SELECT a.name AS name, s.${metric} AS value FROM stats s JOIN accounts a ON a.id = s.account_id
     WHERE s.period = ? AND s.${metric} > 0 ORDER BY s.${metric} DESC, a.name_key ASC LIMIT 50`,
  ).bind(period).all<{ name: string; value: number }>();
  const rows: LeaderRow[] = results.map((r, i) => ({ rank: i + 1, name: r.name, value: r.value }));
  let me: LeaderRow | null = null;
  if (a) {
    const mine = await env.DB.prepare(`SELECT ${metric} AS value FROM stats WHERE account_id = ? AND period = ?`).bind(a.id, period).first<{ value: number }>();
    if (mine && mine.value > 0) {
      const above = await env.DB.prepare(`SELECT COUNT(*) AS n FROM stats WHERE period = ? AND ${metric} > ?`).bind(period, mine.value).first<{ n: number }>();
      me = { rank: (above?.n ?? 0) + 1, name: a.name, value: mine.value };
    }
  }
  return json({ metric, period, rows, me });
}

// ---------------------------------------------------------------- yönetici

async function admin(req: Request, env: Env, url: URL): Promise<Response> {
  if (!env.ADMIN_KEY || !same(req.headers.get('x-admin-key') ?? '', env.ADMIN_KEY)) return fail(403, 'forbidden');
  const name = url.searchParams.get('name') ?? '';
  const a = await env.DB.prepare('SELECT * FROM accounts WHERE name_key = ?').bind(nameKey(name)).first<AccountRow>();
  if (!a) return fail(404, 'no_account');
  if (req.method === 'DELETE') {
    // KVKK silme başvurusu (oyuncu Profil'den kendi de silebilir)
    return json({ name: a.name, deleted: await eraseAccount(env, a) });
  }
  if (req.method === 'GET') {
    // Kimlik doğrulama soruları için: açılış tarihi, son giriş, son harekâtlar ve kayıtlar
    const saves = await env.DB.prepare('SELECT meta FROM saves WHERE account_id = ? ORDER BY created DESC LIMIT 5').bind(a.id).all<{ meta: string }>();
    const stats = await env.DB.prepare("SELECT * FROM stats WHERE account_id = ? AND period = 'all'").bind(a.id).first();
    return json({
      name: a.name, email: a.email, lang: a.lang, legalVersion: a.legal_version, newsOpt: !!a.news_opt,
      created: new Date(a.created).toISOString(), lastLogin: new Date(a.last_login).toISOString(), stats,
      saves: saves.results.map((r) => {
        const m = JSON.parse(r.meta);
        return { title: m.title, created: new Date(m.created).toISOString(), mapId: m.mapId, mapSize: m.mapSize, enemies: m.enemies, gameTime: m.gameTime };
      }),
    });
  }
  // POST: yeni kurtarma kodu (şifre değişmez; oyuncu bu kodla "Şifremi unuttum"dan yeni şifre belirler)
  const code = newRecoveryCode();
  await env.DB.prepare('UPDATE accounts SET recovery_hash = ?, fails = 0, locked_until = 0 WHERE id = ?').bind(await sha256(normCode(code)), a.id).run();
  return json({ name: a.name, recoveryCode: code });
}

// ---------------------------------------------------------------- yönlendirme

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, '');
  const m = req.method;
  if (m === 'POST' && path === '/email/code') return emailCode(req, env);
  if (m === 'POST' && path === '/feedback') return sendFeedback(req, env);
  if (m === 'POST' && path === '/register') return register(req, env);
  if (m === 'POST' && path === '/login') return login(req, env);
  if (m === 'POST' && path === '/recover') return recover(req, env);
  if (m === 'POST' && path === '/logout') return logout(req, env);
  if (path === '/admin') return admin(req, env, url);
  if (m === 'GET' && path === '/leaderboard') return leaderboard(url, env, await authed(req, env));
  const a = await authed(req, env);
  if (!a) return fail(401, 'no_session');
  if (path === '/me') return m === 'PATCH' ? updateMe(req, env, a) : m === 'DELETE' ? deleteMe(req, env, a) : json({ account: publicAccount(a) });
  if (m === 'GET' && path === '/profile') return profile(env, a);
  if (m === 'POST' && path === '/password') return changePassword(req, env, a);
  if (m === 'POST' && path === '/email') return setEmail(req, env, a);
  if (m === 'GET' && path === '/saves') return listSaves(env, a);
  const save = /^\/saves\/([\w:.-]{1,120})$/.exec(path);
  if (save) {
    const id = decodeURIComponent(save[1]);
    if (m === 'PUT') return putSave(req, env, a, id);
    if (m === 'GET') return getSave(env, a, id);
    if (m === 'DELETE') return deleteSave(env, a, id);
  }
  if (m === 'POST' && path === '/stats') return reportStats(req, env, a);
  return fail(404, 'not_found');
}

/** Eski adres (Vercel) kayıtlarını buraya taşıyabilsin diye başka kaynaktan yalnız ona izin verilir. */
const OLD_ORIGIN = 'https://warsimbox.vercel.app';
const CORS = {
  'access-control-allow-origin': OLD_ORIGIN,
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
  vary: 'origin',
};

/** Olmayan adres: oyunun 404 sayfası (404 durum koduyla; arama motoru sayfa yok saysın). */
async function notFound(url: URL, env: Env): Promise<Response> {
  const page = env.ASSETS ? await env.ASSETS.fetch(new URL('/404.html', url)).catch(() => null) : null;
  if (!page?.ok) return fail(404, 'not_found');
  return new Response(page.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/')) return notFound(url, env);
  try {
    return await api(req, env, url);
  } catch (e) {
    console.error(e);
    return fail(500, 'server');
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.headers.get('origin') !== OLD_ORIGIN) return route(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const res = await route(req, env);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  },
} satisfies ExportedHandler<Env>;
