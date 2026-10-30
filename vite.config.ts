import { defineConfig } from 'vite';
import { encyclopedia } from './tools/ansiklopedi/vite';

// Göreli adresler: oyun bir alt klasörde de açılabilsin (itch.io).
// Geliştirmede /api istekleri yerel sunucuya (npm run serve, wrangler dev: 8787) gider.
// Ansiklopedi sayfaları (düz HTML) ve site haritası derlemede üretilir (tools/ansiklopedi/vite.ts).
export default defineConfig({
  base: './',
  server: { proxy: { '/api': 'http://localhost:8787' } },
  plugins: [encyclopedia()],
});
