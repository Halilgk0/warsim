// Sunucuyla konuşma (worker/index.ts): istek, oturum belirteci, şifrenin tarayıcıda özetlenmesi, hata iletileri.
// Sunucu aynı adreste /api altında (Cloudflare). Sunucu yoksa (itch.io paketi, bağlantı yok) hesap işlemleri anlaşılır
// bir iletiyle başarısız olur; misafir oyun etkilenmez.

import { L } from '../i18n';
import { CLIENT_HASH_ITER, clientSalt, nameKey } from './shared';

/** Eski adres (Vercel). Orada sunucu yok: hesaplar warsimbox.com'daki sunucuya gider, menü yeni adresi duyurur. */
export const OLD_SITE = typeof location !== 'undefined' && location.hostname === 'warsimbox.vercel.app';
export const NEW_SITE = 'https://warsimbox.com/';

const BASE = (import.meta.env.VITE_API as string | undefined) ?? (OLD_SITE ? `${NEW_SITE}api` : '/api');
const TIMEOUT_MS = 15000;

/** Sunucunun hata kodu ve kullanıcıya gösterilecek ileti. */
export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly extra: Record<string, unknown> = {}) {
    super(apiMessage(code, extra));
  }
}

export function apiMessage(code: string, extra: Record<string, unknown> = {}): string {
  switch (code) {
    case 'name_short': return L('Ad en az 2 karakter olmalı', 'The name must be at least 2 characters');
    case 'name_chars': return L('Adda yalnız harf, rakam, boşluk, - _ . olabilir', 'Only letters, digits, spaces, - _ . are allowed');
    case 'taken': return L('Bu ad alınmış; başka bir ad seç', 'This name is taken; choose another one');
    case 'email_bad': return L('E-posta adresini kontrol et (ör. ad@ornek.com)', 'Check your email address (e.g. name@example.com)');
    case 'email_taken': return L('Bu e-posta başka bir hesapta kayıtlı; o hesapla giriş yap ya da başka bir adres yaz', 'This email is already on another account; log in to it or enter another address');
    case 'code_wrong': {
      const left = Number(extra.left ?? 0);
      return L(`Kod yanlış (${left} deneme hakkın kaldı)`, `Wrong code (${left} ${left === 1 ? 'try' : 'tries'} left)`);
    }
    case 'code_expired': return L('Bu kodun süresi doldu; yeni kod iste', 'This code is no longer valid; request a new one');
    case 'mail_wait': {
      const s = Number(extra.wait ?? 60);
      return L(`Yeni kod için ${s} saniye bekle`, `Wait ${s} seconds for a new code`);
    }
    case 'mail_limit': return L('Çok fazla kod istendi; daha sonra tekrar dene', 'Too many codes requested; try again later');
    case 'mail_off':
    case 'mail_failed': return L('Kod şu an gönderilemedi; biraz sonra tekrar dene', 'Could not send the code right now; try again later');
    case 'not_accepted': return L('Devam etmek için Gizlilik Politikası’nı ve KVKK metnini kabul etmelisin', 'To continue, accept the Privacy Policy and the KVKK notice');
    case 'no_account': return L('Bu adla bir hesap yok', 'There is no account with this name');
    case 'wrong': {
      const left = Number(extra.left ?? 0);
      return L(`Şifre ya da kod yanlış (${left} deneme hakkın kaldı)`, `Wrong password or code (${left} ${left === 1 ? 'try' : 'tries'} left)`);
    }
    case 'locked': {
      const min = Math.max(1, Math.ceil((Number(extra.until ?? 0) - Date.now()) / 60000));
      return L(`Çok fazla yanlış deneme; ${min} dakika sonra tekrar dene`, `Too many wrong attempts; try again in ${min} min`);
    }
    case 'no_session': return L('Oturumun kapanmış; yeniden giriş yap', 'Your session has ended; please log in again');
    case 'too_big': return L('Kayıt çok büyük', 'The save is too large');
    case 'too_many': return L('Kayıt sınırı (30) doldu; eski bir kaydı sil', 'Save limit (30) reached; delete an old save');
    case 'no_save': return L('Kayıt bulunamadı', 'Save not found');
    case 'offline': return L('Sunucuya ulaşılamadı; bağlantını kontrol et', 'Could not reach the server; check your connection');
    default: return L('Sunucuda bir sorun oldu; biraz sonra tekrar dene', 'Something went wrong on the server; try again later');
  }
}

// ---------------------------------------------------------------- oturum

const AUTH_KEY = 'warsim.auth.v1';

let token: string | null = null;

export function authToken(): string | null {
  if (token) return token;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    token = raw ? (JSON.parse(raw) as { token?: string }).token ?? null : null;
  } catch {
    token = null;
  }
  return token;
}

/** Oturumu sakla (hesabın son bilinen hâliyle: sayfa açılır açılmaz ad görünsün). */
export function storeAuth(t: string | null, account: unknown = null): void {
  token = t;
  try {
    if (t) localStorage.setItem(AUTH_KEY, JSON.stringify({ token: t, account }));
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    /* depolama kapalı: yalnız bu oturum */
  }
}

export function storedAccount<T>(): T | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? ((JSON.parse(raw) as { account?: T }).account ?? null) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- istek

export async function api<T>(method: string, path: string, body?: unknown, opts: { keepalive?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const t = authToken();
  if (t) headers.authorization = `Bearer ${t}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal, keepalive: opts.keepalive,
    });
  } catch {
    throw new ApiError('offline', 0);
  } finally {
    clearTimeout(timer);
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Sunucu yok (ör. yalnız dosya sunan bir adres): yanıt JSON değil
    throw new ApiError(res.ok || res.status === 404 ? 'offline' : 'server', res.status);
  }
  if (!res.ok) throw new ApiError(String(data.error ?? 'server'), res.status, data);
  return data as T;
}

// ---------------------------------------------------------------- şifre

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Şifre tarayıcıda PBKDF2 ile uzatılır (~0,1–0,3 sn); sunucuya yalnız bu özet gider. */
export async function clientHash(name: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(clientSalt(nameKey(name))), iterations: CLIENT_HASH_ITER }, key, 256,
  );
  return hex(bits);
}

// ---------------------------------------------------------------- sıkıştırma (kayıt verisi)

export async function gzip(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return bytesToB64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function gunzip(b64: string): Promise<string> {
  const stream = new Blob([b64ToBytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
