// Hesaplar ve oyun kayıtları (tarayıcıda). Hesap yalnızca bir addır: aynı adla tekrar girilir, şifre yok.
// Hesaplar localStorage'da, kayıtlar IndexedDB'de (özet ve veri ayrı depolarda: liste hızlı açılsın).
// Misafir oyun kaydedilmez; sekme kapanınca ilerleme kaybolur.

import type { SaveData } from './sim/save';

const ACC_KEY = 'warsim.accounts.v1';
const SESSION_KEY = 'warsim.session.v1';
const DB_NAME = 'warsim';
const DB_VERSION = 1;

export interface Account {
  /** Görünen ad (girildiği gibi). */
  name: string;
  /** Eşleştirme anahtarı (küçük harf, boşluklar sadeleşmiş). */
  key: string;
  created: number;
  lastLogin: number;
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
  /** Kayıt biçimi sürümü. */
  v?: number;
}

export const NAME_MIN = 2;
export const NAME_MAX = 20;

export function cleanName(n: string): string {
  return n.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function nameKey(n: string): string {
  return cleanName(n).toLocaleLowerCase('tr-TR');
}

/** Ad geçerli mi: 2–20 karakter, harf/rakam/boşluk/-/_ . */
export function nameError(n: string): string | null {
  const c = cleanName(n);
  if (c.length < NAME_MIN) return `En az ${NAME_MIN} karakter`;
  if (!/^[\p{L}\p{N} _.-]+$/u.test(c)) return 'Yalnız harf, rakam, boşluk, - _ .';
  return null;
}

function readAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACC_KEY);
    const list = raw ? (JSON.parse(raw) as Account[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAccounts(list: Account[]): void {
  try {
    localStorage.setItem(ACC_KEY, JSON.stringify(list));
  } catch {
    /* depolama kapalı: hesap yalnız bu oturumda geçerli */
  }
}

let session: Account | null = null;

/** Açık hesap (sayfa yenilenince hatırlanır). */
export function currentAccount(): Account | null {
  if (session) return session;
  try {
    const key = localStorage.getItem(SESSION_KEY);
    if (key) session = readAccounts().find((a) => a.key === key) ?? null;
  } catch {
    session = null;
  }
  return session;
}

/** Aynı adla giriş; yoksa hesap oluşturulur. */
export function login(name: string): { account: Account; created: boolean } {
  const key = nameKey(name);
  const list = readAccounts();
  let acc = list.find((a) => a.key === key);
  const created = !acc;
  if (!acc) {
    acc = { name: cleanName(name), key, created: Date.now(), lastLogin: Date.now() };
    list.push(acc);
  } else acc.lastLogin = Date.now();
  writeAccounts(list);
  session = acc;
  try {
    localStorage.setItem(SESSION_KEY, key);
  } catch {
    /* yok say */
  }
  return { account: acc, created };
}

export function logout(): void {
  session = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* yok say */
  }
}

// ---------------------------------------------------------------- IndexedDB

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
        reject(req.error ?? new Error('Kayıt deposu açılamadı'));
      };
    });
  }
  return dbp;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Kayıt işlemi başarısız'));
    tx.onabort = () => reject(tx.error ?? new Error('Kayıt işlemi iptal edildi'));
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('Kayıt okunamadı'));
  });
}

/** Hesabın kayıtları, en yenisi önce. */
export async function listSaves(account: string): Promise<SaveMeta[]> {
  const d = await db();
  const tx = d.transaction('saves', 'readonly');
  const list = await request(tx.objectStore('saves').index('account').getAll(account) as IDBRequest<SaveMeta[]>);
  return list.sort((a, b) => b.created - a.created);
}

export async function writeSave(account: string, title: string, kind: SaveKind, data: SaveData): Promise<SaveMeta> {
  const d = await db();
  const me = data.teams[data.playerTeam];
  const meta: SaveMeta = {
    id: `${account}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    account, title, kind, created: Date.now(), gameTime: data.time, playerName: data.playerName,
    enemies: data.setup?.enemies ?? Math.max(0, data.teams.length - 1), money: Math.round(me?.money ?? 0),
    structures: data.structures.filter((s) => s.team === data.playerTeam && s.hp > 0).length,
    mapId: data.mapId, v: data.v,
  };
  const tx = d.transaction(['saves', 'blobs'], 'readwrite');
  tx.objectStore('saves').put(meta);
  tx.objectStore('blobs').put(JSON.stringify(data), meta.id);
  await done(tx);
  return meta;
}

export async function readSave(id: string): Promise<SaveData> {
  const d = await db();
  const tx = d.transaction('blobs', 'readonly');
  const raw = await request(tx.objectStore('blobs').get(id) as IDBRequest<string | undefined>);
  if (!raw) throw new Error('Kayıt bulunamadı');
  return JSON.parse(raw) as SaveData;
}

export async function deleteSave(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['saves', 'blobs'], 'readwrite');
  tx.objectStore('saves').delete(id);
  tx.objectStore('blobs').delete(id);
  await done(tx);
}

/** Otomatik kayıtlardan en yeni `keep` tanesi kalır. */
export async function pruneAutosaves(account: string, keep = 3): Promise<void> {
  const autos = (await listSaves(account)).filter((m) => m.kind === 'auto');
  for (const m of autos.slice(keep)) await deleteSave(m.id);
}
