# WarSimBox

Yukarıdan bakılan, pastel ve sade bir hava harbi strateji oyunu: üs kur, üret, araştır, savaş. Gerçek uçak verileriyle
uçan uçaklar, gerçekçi it dalaşı, uçaksavar, görev planlama ve rakip ülkelerle herkes-herkese harekât. Tarayıcıda
(masaüstü ve yatay telefon) oynanır.

Oyna: https://warsimbox.vercel.app · Takip et: [Instagram](https://www.instagram.com/warsimbox/) ·
[YouTube](https://www.youtube.com/@Warsimbox) · [TikTok](https://www.tiktok.com/@warsimbox0)

## Çalıştırma

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ (tsc + vite build)
```

TypeScript + Three.js + Vite. Simülasyon (`src/sim`) render'dan ayrıdır, Node'da başsız test edilebilir
(`npm run sim:bench`).

Tasarım notları ve yol haritası: [docs/PLAN.md](docs/PLAN.md).
