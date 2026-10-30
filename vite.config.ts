import { defineConfig } from 'vite';

// Göreli adresler: oyun bir alt klasörde de açılabilsin (itch.io).
// Geliştirmede /api istekleri yerel sunucuya (npm run serve, wrangler dev: 8787) gider.
export default defineConfig({
  base: './',
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
