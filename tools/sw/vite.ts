// Service worker (2026-11-19, internetsiz oyun): derlemede dist/sw.js üretilir. Oyunun çalışması için gereken dosyalar
// (sayfa, kod, sesler, üretim/öğretici/açılış görselleri, simgeler) ilk açılışta önbelleğe girer; sonra oyun internetsiz açılır.
// Ansiklopedi, haber görselleri ve yasal sayfalar önbelleğe alınmaz (bağlantı ister). /api hiç önbelleğe girmez.
//
// - Oyunun sayfası (index.html): önce ağ (yeni sürüm hemen gelsin; 4 sn'de yanıt yoksa önbellek), bağlantı yoksa önbellek.
// - Öbür dosyalar: önce önbellek, yoksa ağ (adı içeriğe göre değişen dosyalar).
// - Google yazı tipleri: önbellekten, arkada tazelenir.
// - Önbellek adı dosyaların içerik özeti: değişmeyen derleme telefona yeniden inmez. Yeni sürüm gelince en son kurulan iki önbellek
//   kalır (caches.keys() kuruluş sırasıyla döner; açık oyun eski parçalarını bulabilsin).

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Önbelleğe girecek klasörler ve kökteki dosyalar. */
const DIRS = ['assets', 'sounds', 'uretim', 'ogretici', 'acilis'];
const ROOT_FILES = ['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.ico', 'yukleme.jpg'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function worker(version: string, files: string[]): string {
  return `// Derlemede üretildi (tools/sw/vite.ts); elle düzenleme.
const VERSION = ${JSON.stringify(version)};
const CACHE = 'warsimbox-' + VERSION;
const FONTS = 'warsimbox-fonts';
const CORE = ${JSON.stringify(files)};
const NAV_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Biri inemezse öbürleri yine girsin; sayfanın kendisi şart
    await c.add(new Request('./', { cache: 'reload' }));
    await Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // En son kurulan iki sürümün önbelleği kalır (caches.keys() kuruluş sırasıyla)
    const ours = (await caches.keys()).filter((k) => k.startsWith('warsimbox-') && k !== FONTS);
    await Promise.all(ours.slice(0, Math.max(0, ours.length - 2)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const scope = () => self.registration.scope;
const isGamePage = (url) => {
  const u = url.origin + url.pathname;
  return u === scope() || u === scope() + 'index.html';
};

async function fromCache(req) {
  const keys = (await caches.keys()).filter((k) => k.startsWith('warsimbox-') && k !== FONTS).reverse();
  for (const k of keys) {
    const r = await (await caches.open(k)).match(req);
    if (r) return r;
  }
  return undefined;
}

async function gamePage(req) {
  const c = await caches.open(CACHE);
  try {
    const net = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NAV_TIMEOUT)),
    ]);
    if (net && net.ok) {
      void c.put('./', net.clone());
      return net;
    }
    throw new Error('bad');
  } catch {
    return (await c.match('./')) || (await fromCache('./')) || (await fromCache(new Request(scope() + 'index.html'))) || Response.error();
  }
}

async function asset(req) {
  const hit = await fromCache(req);
  if (hit) return hit;
  const net = await fetch(req);
  if (net.ok && net.type === 'basic') {
    const p = new URL(req.url).pathname;
    if (${JSON.stringify(DIRS)}.some((d) => p.includes('/' + d + '/'))) void (await caches.open(CACHE)).put(req, net.clone());
  }
  return net;
}

async function font(req) {
  const c = await caches.open(FONTS);
  const hit = await c.match(req);
  const net = fetch(req).then((r) => {
    if (r.ok || r.type === 'opaque') void c.put(req, r.clone());
    return r;
  }).catch(() => undefined);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(font(req));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') {
    if (isGamePage(url)) e.respondWith(gamePage(req));
    return;
  }
  e.respondWith(asset(req));
});
`;
}

/** Derlemede dist/sw.js yazar (geliştirme sunucusunda yok). */
export function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'warsim-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split(sep).join('/'))
        .filter((f) => ROOT_FILES.includes(f) || DIRS.some((d) => f.startsWith(d + '/')))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 16);
      writeFileSync(join(outDir, 'sw.js'), worker(version, files.map((f) => './' + f)));
      const kb = files.reduce((s, f) => s + statSync(join(outDir, f)).size, 0) / 1024;
      console.log(`service worker: ${files.length} dosya, ${(kb / 1024).toFixed(1)} MB önbelleğe (${version})`);
    },
  };
}
