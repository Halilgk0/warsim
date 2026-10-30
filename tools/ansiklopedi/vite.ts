// Vite eklentisi: ansiklopedi sayfalarını (src/ansiklopedi/sayfalar.ts) derlemede dist/'e yazar, geliştirmede
// (npm run dev) her istekte yeniden üretip sunar; metin ya da veri değişince sayfayı yenilemek yeter. Site haritası
// (sitemap.xml) da buradan üretilir: ana sayfa ve bütün ansiklopedi sayfaları.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

type Pages = typeof import('../../src/ansiklopedi/sayfalar');

const MODULE = '/src/ansiklopedi/sayfalar.ts';
const CSS = 'src/ansiklopedi/stil.css';

export function encyclopedia(): Plugin {
  let root = process.cwd();
  let server: ViteDevServer | undefined;
  // Geliştirmede her seferinde taze modül (değişiklik hemen görünsün); derlemede doğrudan
  const load = async (): Promise<Pages> =>
    server ? ((await server.ssrLoadModule(MODULE)) as Pages) : await import('../../src/ansiklopedi/sayfalar');
  const today = () => new Date().toISOString().slice(0, 10);

  return {
    name: 'warsim-ansiklopedi',
    configResolved(c) {
      root = c.root;
    },
    configureServer(s) {
      server = s;
      s.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        try {
          if (url === '/ansiklopedi/stil.css') {
            res.setHeader('content-type', 'text/css; charset=utf-8');
            res.end(readFileSync(join(root, CSS)));
            return;
          }
          if (url === '/sitemap.xml') {
            res.setHeader('content-type', 'application/xml; charset=utf-8');
            res.end((await load()).sitemap(today()));
            return;
          }
          if (!url.startsWith('/ansiklopedi') && !url.startsWith('/en/encyclopedia')) return next();
          const path = url.endsWith('/') ? url : `${url}/`;
          const page = (await load()).encyclopediaPages(today()).find((p) => p.path === path);
          if (!page) return next();
          if (path !== url) {
            res.statusCode = 301;
            res.setHeader('location', path);
            res.end();
            return;
          }
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(page.html);
        } catch (e) {
          next(e);
        }
      });
    },
    async generateBundle() {
      const m = await load();
      for (const p of m.encyclopediaPages(today())) this.emitFile({ type: 'asset', fileName: `${p.path.slice(1)}index.html`, source: p.html });
      this.emitFile({ type: 'asset', fileName: 'ansiklopedi/stil.css', source: readFileSync(join(root, CSS), 'utf8') });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: m.sitemap(today()) });
    },
  };
}
