// Hesaplar ve oyun kayıtları. Hesap sunucuda: ad + şifre (src/net/api.ts, worker/). Kayıtlar bulutta; her kayıt önce bu
// tarayıcıya (IndexedDB, önbellek ve yedek) yazılır, sonra buluta yüklenir. Bağlantı yoksa kayıt bu cihazda bekler ve
// bağlantı gelince yüklenir. Misafir oyun kaydedilmez.
//
// Eski sürümde hesap yalnız bir addı (şifresiz, yalnız bu tarayıcıda: warsim.accounts.v1 / warsim.session.v1). O
// hesabın sahibi şifre belirleyip giriş yapınca bu tarayıcıdaki kayıtları yeni hesaba geçer ve buluta yüklenir.

import type { SaveData } from './sim/save';
import { L, LANG } from './i18n';
import { ApiError, api, authToken, clientHash, gunzip, gzip, storeAuth, storedAccount } from './net/api';
import { NAME_MAX, cleanName, nameKey, nameProblem } from './net/shared';

export { NAME_MAX, cleanName, nameKey };

const LEGACY_ACC_KEY = 'warsim.accounts.v1';
const LEGACY_SESSION_KEY = 'warsim.session.v1';
const DB_NAME = 'warsim';
const DB_VERSION = 1;

export interface Account {
  /** Görünen ad (girildiği gibi). */
  name: string;
  /** Eşleştirme anahtarı (küçük harf, boşluklar sadeleşmiş). */
  key: string;
  created: number;
  lastLogin: number;
  /** Öğretici "Oyuna başla"da sorulmasın ("Bir daha sorma"). */
  noTutorial?: boolean;
  /** Hesapta e-posta var mı (false ise sorulur; sunucudan gelmemişse bilinmiyor, sorulmaz). */
  hasEmail?: boolean;
  /** Hesabın dili: e-postalar bu dilde gider. */
  lang?: 'tr' | 'en' | null;
}

export type SaveKind = 'manual' | 'auto';

export interface SaveMeta {
  id: string;
  account: string;
  title: string;
  kind: SaveKind;
  created: number;
  gameTime: number;
  playerName: string;
  enemies: number;
  money: number;
  structures: number;
  /** Harita (eski kayıtlarda yok). */
  mapId?: string;
  /** Harita büyüklüğü (m; önceki kayıtlarda yok: 300 km). */
  mapSize?: number;
  /** Kayıt biçimi sürümü. */
  v?: number;
  /** Bu tarayıcıdaki kopya buluta yüklendi mi (yalnız yerel önbellekte). */
  synced?: boolean;
  /** Listede: yalnız bu cihazda (buluta yüklenmeyi bekliyor). */
  pending?: boolean;
}

/** Ad geçerli mi: 2–20 karakter, harf/rakam/boşluk/-/_ . */
export function nameError(n: string): string | null {
  const p = nameProblem(n);
  if (p === 'short') return L('En az 2 karakter', 'At least 2 characters');
  if (p === 'chars') return L('Yalnız harf, rakam, boşluk, - _ .', 'Only letters, digits, spaces, - _ .');
  return null;
}

// ---------------------------------------------------------------- hesap

let session: Account | null = null;

/** Açık hesap (sayfa yenilenince hatırlanır; sunucuyla refreshSession doğrular). */
export function currentAccount(): Account | null {
  if (session) return session;
  if (!authToken()) return null;
  session = storedAccount<Account>();
  return session;
}

function setSession(token: string, acc: Account): void {
  session = acc;
  storeAuth(token, acc);
  syncLang(acc);
}

/** Hesaptaki dil oyuncunun seçtiği dille aynı olsun. Dil düğmesi sayfayı yeniden açar: yeni dil açılışta buradan gider. */
function syncLang(acc: Account): void {
  if (acc.lang === LANG) return;
  acc.lang = LANG;
  storeAuth(authToken(), acc);
  void api('PATCH', '/me', { lang: LANG }).catch(() => {});
}

/** Sayfa açılınca: oturum hâlâ geçerli mi (kapanmışsa çıkış). Bağlantı yoksa son bilinen hâl kalır. */
export async function refreshSession(): Promise<void> {
  if (!authToken()) return;
  try {
    const r = await api<{ account: Account }>('GET', '/me');
    session = r.account;
    storeAuth(authToken(), r.account);
    syncLang(r.account);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'no_session') {
      session = null;
      storeAuth(null);
    }
  }
}

interface AuthResult {
  token: string;
  account: Account;
  recoveryCode?: string;
}

/** Giriş. Başarısızsa ApiError (iletisi oyuncuya gösterilir). */
export async function login(name: string, password: string): Promise<Account> {
  const r = await api<AuthResult>('POST', '/login', { name: cleanName(name), pass: await clientHash(name, password) });
  setSession(r.token, r.account);
  adoptLegacy(r.account);
  return r.account;
}

/** Adrese doğrulama kodu gönder. Hesap açarken ad da verilir: alınmışsa kod gönderilmeden hata döner. */
export async function requestEmailCode(email: string, name?: string): Promise<void> {
  await api('POST', '/email/code', { email, name: name === undefined ? undefined : cleanName(name), lang: LANG });
}

/** Yeni hesap (adres koduyla doğrulanır); kurtarma kodu bir kez döner (oyuncuya gösterilmeli). */
export async function register(name: string, password: string, email: string, news: boolean, code: string): Promise<{ account: Account; recoveryCode: string }> {
  const r = await api<AuthResult>('POST', '/register', { name: cleanName(name), pass: await clientHash(name, password), email, code, accepted: true, news, lang: LANG });
  setSession(r.token, r.account);
  adoptLegacy(r.account);
  return { account: r.account, recoveryCode: r.recoveryCode ?? '' };
}

/** Şifremi unuttum: kurtarma koduyla yeni şifre; yeni kurtarma kodu döner. */
export async function recoverAccount(name: string, code: string, password: string): Promise<{ account: Account; recoveryCode: string }> {
  const r = await api<AuthResult>('POST', '/recover', { name: cleanName(name), code, pass: await clientHash(name, password) });
  setSession(r.token, r.account);
  adoptLegacy(r.account);
  return { account: r.account, recoveryCode: r.recoveryCode ?? '' };
}

export type StatsRow = Record<'kills' | 'wins' | 'earned' | 'peak' | 'play_sec', number>;

export interface Profile {
  account: Account;
  all: StatsRow | null;
  week: StatsRow | null;
  /** Tüm zamanlar sırası (ölçüt başına). */
  ranks: StatsRow | null;
  saves: number;
  email: string | null;
  /** Yenilik e-postası izni. */
  news: boolean;
  /** Gizlilik ve KVKK metinleri kabul edildi mi. */
  accepted: boolean;
}

export async function fetchProfile(): Promise<Profile> {
  const p = await api<Profile>('GET', '/profile');
  session = p.account;
  storeAuth(authToken(), p.account);
  return p;
}

/** E-posta ekle ya da değiştir (yeni adres için kod gerekir), yenilik iznini ayarla (metin onayı arayüzde alınır). */
export async function saveEmail(email: string, news: boolean, code?: string): Promise<{ email: string; news: boolean }> {
  const r = await api<{ account: Account; email: string; news: boolean }>('POST', '/email', { email, code, accepted: true, news });
  session = r.account;
  storeAuth(authToken(), r.account);
  return r;
}

/** Hesabı kalıcı olarak sil (şifreyle); bu cihazdaki kopyalar da silinir, oturum kapanır. */
export async function deleteAccount(password: string): Promise<void> {
  const acc = currentAccount();
  if (!acc) throw new ApiError('no_session', 401);
  await api('DELETE', '/me', { pass: await clientHash(acc.name, password) });
  for (const m of await localList(acc.key).catch(() => [] as SaveMeta[])) await localDelete(m.id).catch(() => {});
  try {
    localStorage.removeItem(EMAIL_LATER_KEY + acc.key);
  } catch {
    /* depolama kapalı */
  }
  session = null;
  storeAuth(null);
}

/** Şifre değiştir (mevcut şifreyle); öbür cihazlardaki oturumlar kapanır. */
export async function changePassword(oldPass: string, newPass: string): Promise<void> {
  const acc = currentAccount();
  if (!acc) throw new ApiError('no_session', 401);
  await api('POST', '/password', { old: await clientHash(acc.name, oldPass), pass: await clientHash(acc.name, newPass) });
}

export function logout(): void {
  if (authToken()) void api('POST', '/logout', undefined, { keepalive: true }).catch(() => {});
  session = null;
  storeAuth(null);
}

/** Eski (şifresiz) sürümden kalan, bu tarayıcıdaki hesap adı: sahibi şifre belirlesin diye ana menü sorar. */
export function legacyAccountName(): string | null {
  if (currentAccount()) return null;
  try {
    const key = localStorage.getItem(LEGACY_SESSION_KEY);
    if (!key) return null;
    const list = JSON.parse(localStorage.getItem(LEGACY_ACC_KEY) ?? '[]') as { name: string; key: string }[];
    return list.find((a) => a.key === key)?.name ?? null;
  } catch {
    return null;
  }
}

/** Eski hesabın (bu tarayıcıda açık olanın) kayıtları yeni hesaba geçer (ad değişmiş olabilir); eski oturum kapanır. */
function adoptLegacy(acc: Account): void {
  let oldKey: string | null = null;
  try {
    oldKey = localStorage.getItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    return;
  }
  const keys = new Set([acc.key]);
  if (oldKey) keys.add(oldKey);
  void rekeyLocal(keys, acc.key).catch(() => {});
}

/** E-posta sorusunu erteleme zamanı: hesap başına, bu tarayıcıda. */
const EMAIL_LATER_KEY = 'warsim.emailLater.';
const EMAIL_LATER_MS = 7 * 86400000;

/** Eski hesaba e-posta sorulacak mı: hesapta adres yoksa ve son 7 günde ertelenmediyse. */
export function shouldAskEmail(): boolean {
  const acc = currentAccount();
  if (acc?.hasEmail !== false) return false;
  try {
    return Date.now() - Number(localStorage.getItem(EMAIL_LATER_KEY + acc.key)) >= EMAIL_LATER_MS;
  } catch {
    return true;
  }
}

export function postponeEmailAsk(): void {
  const acc = currentAccount();
  if (acc?.hasEmail !== false) return;
  try {
    localStorage.setItem(EMAIL_LATER_KEY + acc.key, String(Date.now()));
  } catch {
    /* depolama kapalı: bir sonraki açılışta yine sorulur */
  }
}

/** Misafirin "Bir daha sorma" tercihi (bu tarayıcıda). */
const TUTORIAL_OFF_KEY = 'warsim.tutorial.off';

/** Öğretici sorulmayacak mı: hesap açıksa hesabın tercihi, değilse bu tarayıcınınki. */
export function tutorialPromptOff(): boolean {
  const acc = currentAccount();
  if (acc) return !!acc.noTutorial;
  try {
    return localStorage.getItem(TUTORIAL_OFF_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTutorialPromptOff(off: boolean): void {
  const acc = currentAccount();
  if (acc) {
    if (off) acc.noTutorial = true;
    else delete acc.noTutorial;
    storeAuth(authToken(), acc);
    void api('PATCH', '/me', { noTutorial: off }).catch(() => {});
    return;
  }
  try {
    if (off) localStorage.setItem(TUTORIAL_OFF_KEY, '1');
    else localStorage.removeItem(TUTORIAL_OFF_KEY);
  } catch {
    /* depolama kapalı: yalnız bu oturum */
  }
}

// ---------------------------------------------------------------- yerel önbellek (IndexedDB)

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('saves')) d.createObjectStore('saves', { keyPath: 'id' }).createIndex('account', 'account');
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbp = null;
        reject(req.error ?? new Error(L('Kayıt deposu açılamadı', 'Could not open save storage')));
      };
    });
  }
  return dbp;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(L('Kayıt işlemi başarısız', 'Save operation failed')));
    tx.onabort = () => reject(tx.error ?? new Error(L('Kayıt işlemi iptal edildi', 'Save operation was aborted')));
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error(L('Kayıt okunamadı', 'Could not read the save')));
  });
}

async function localList(account: string): Promise<SaveMeta[]> {
  const d = await db();
  const tx = d.transaction('saves', 'readonly');
  return request(tx.objectStore('saves').index('account').getAll(account) as IDBRequest<SaveMeta[]>);
}

async function localPut(meta: SaveMeta, json: string | null): Promise<void> {
  const d = await db();
  const tx = d.transaction(['saves', 'blobs'], 'readwrite');
  tx.objectStore('saves').put(meta);
  if (json !== null) tx.objectStore('blobs').put(json, meta.id);
  await done(tx);
}

async function localBlob(id: string): Promise<string | undefined> {
  const d = await db();
  const tx = d.transaction('blobs', 'readonly');
  return request(tx.objectStore('blobs').get(id) as IDBRequest<string | undefined>);
}

async function localDelete(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['saves', 'blobs'], 'readwrite');
  tx.objectStore('saves').delete(id);
  tx.objectStore('blobs').delete(id);
  await done(tx);
}

/** Eski hesap anahtarlarının yerel kayıtları yeni hesaba geçer (buluta yüklenmeyi bekler). */
async function rekeyLocal(keys: Set<string>, to: string): Promise<void> {
  for (const k of keys) {
    if (k === to) continue;
    for (const m of await localList(k)) await localPut({ ...m, account: to, synced: false }, null);
  }
}

/** Sunucuya uygun kimlik (eski kayıtların kimliğinde hesap adı vardı: Türkçe harf, boşluk). */
const newSaveId = (): string => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const cloudId = (id: string): boolean => /^[\w:.-]{1,120}$/.test(id);

// ---------------------------------------------------------------- kayıtlar

async function upload(meta: SaveMeta, json: string): Promise<void> {
  const { synced: _s, pending: _p, ...clean } = meta;
  await api('PUT', `/saves/${encodeURIComponent(meta.id)}`, { meta: clean, data: await gzip(json) });
}

/** Bu cihazda bekleyen (buluta yüklenmemiş) kayıtları yükle. Bağlantı yoksa sessizce bekler. */
export async function syncPending(account: string): Promise<void> {
  for (const m of await localList(account)) {
    if (m.synced) continue;
    const json = await localBlob(m.id);
    if (!json) continue;
    let meta = m;
    if (!cloudId(m.id)) {
      meta = { ...m, id: newSaveId() };
      await localPut({ ...meta, synced: false }, json);
      await localDelete(m.id);
    }
    try {
      await upload(meta, json);
    } catch (e) {
      // Sınıra takılan (çok büyük, çok fazla) kayıt bu cihazda kalır; bağlantı yoksa sonra yeniden denenir
      if (e instanceof ApiError && (e.code === 'offline' || e.code === 'no_session' || e.code === 'server')) return;
      continue;
    }
    await localPut({ ...meta, synced: true }, null);
  }
}

/** Hesabın kayıtları, en yenisi önce: bulut + bu cihazda bekleyenler. Bağlantı yoksa yalnız bu cihazdakiler. */
export async function listSaves(account: string): Promise<SaveMeta[]> {
  let local = await localList(account).catch(() => [] as SaveMeta[]);
  let cloud: SaveMeta[] | null = null;
  try {
    await syncPending(account);
    local = await localList(account);
    cloud = (await api<{ saves: SaveMeta[] }>('GET', '/saves')).saves;
  } catch {
    cloud = null;
  }
  if (!cloud) return local.map((m) => ({ ...m, pending: !m.synced })).sort((a, b) => b.created - a.created);
  const ids = new Set(cloud.map((m) => m.id));
  // Bulutta olmayan ama yüklenmiş görünen yerel kopya başka cihazda silinmiş ya da elenmiş (eski otomatik): önbellekten çıkar
  for (const m of local) if (m.synced && !ids.has(m.id)) void localDelete(m.id).catch(() => {});
  const pending = local.filter((m) => !m.synced && !ids.has(m.id)).map((m) => ({ ...m, pending: true }));
  return [...cloud, ...pending].sort((a, b) => b.created - a.created);
}

/** Kaydet: önce bu cihaza, sonra buluta. cloud: buluta yüklendi mi (yoksa bağlanınca yüklenir). */
export async function writeSave(account: string, title: string, kind: SaveKind, data: SaveData): Promise<{ meta: SaveMeta; cloud: boolean }> {
  const me = data.teams[data.playerTeam];
  const meta: SaveMeta = {
    id: newSaveId(),
    account, title, kind, created: Date.now(), gameTime: data.time, playerName: data.playerName,
    enemies: data.setup?.enemies ?? Math.max(0, data.teams.length - 1), money: Math.round(me?.money ?? 0),
    structures: data.structures.filter((s) => s.team === data.playerTeam && s.hp > 0).length,
    mapId: data.mapId, mapSize: data.mapSize, v: data.v,
  };
  const json = JSON.stringify(data);
  await localPut({ ...meta, synced: false }, json);
  if (kind === 'auto') await pruneLocalAutos(account, 3);
  try {
    await upload(meta, json);
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'too_big' || e.code === 'too_many')) throw e;
    return { meta, cloud: false };
  }
  await localPut({ ...meta, synced: true }, null);
  return { meta, cloud: true };
}

export async function readSave(id: string): Promise<SaveData> {
  const cached = await localBlob(id).catch(() => undefined);
  if (cached) return JSON.parse(cached) as SaveData;
  const r = await api<{ meta: SaveMeta; data: string }>('GET', `/saves/${encodeURIComponent(id)}`);
  const json = await gunzip(r.data);
  await localPut({ ...r.meta, synced: true }, json).catch(() => {});
  return JSON.parse(json) as SaveData;
}

export async function deleteSave(id: string): Promise<void> {
  if (cloudId(id)) {
    try {
      await api('DELETE', `/saves/${encodeURIComponent(id)}`);
    } catch (e) {
      // Bulutta hiç olmayan (bekleyen) kayıt yalnız bu cihazdan silinir
      if (!(e instanceof ApiError && e.code === 'no_save')) throw e;
    }
  }
  await localDelete(id);
}

/** Bu cihazdaki otomatik kayıtlardan en yeni `keep` tanesi kalır (bulutta sunucu eler). */
async function pruneLocalAutos(account: string, keep: number): Promise<void> {
  const autos = (await localList(account)).filter((m) => m.kind === 'auto').sort((a, b) => b.created - a.created);
  for (const m of autos.slice(keep)) await localDelete(m.id);
}
