# WarSimBox — Claude için çalışma notları

Yukarıdan bakılan, pastel, low-poly bir hava savaşı strateji oyunu. Canlı sürüm: https://warsimbox.vercel.app.
Oyuncuların çoğu **yatay telefonda** oynuyor. Arayüz ve metinler **Türkçe**. En öncelikli konu uçakların ve hava
savunmasının **gerçekçi davranması**: gerçek uçaklar, gerçek veriler. Şehir ve ekonomi katmanı ikinci planda.

## Kurallar

- Kullanıcıya Türkçe yaz. Oyun içi metinler Türkçe kalsın.
- **Commit ve push yalnız kullanıcı söyleyince.** `main`'e push, Vercel'de doğrudan canlıya çıkar. Push'tan önce
  `npm run build` (tsc dahil) ve kısa bir oyun denemesi yap.
- Kayıt anahtarları (`warsim.*`) ve IndexedDB adı (`warsim`) değişmez. Değişirse oyuncuların kayıtları silinir.
- **Telefon önce gelir:**
  - Arayüz ölçülerini `calc(Npx * var(--ui))` ile yaz.
  - Bitti demeden 800×360 ve 844×390'da bak.
  - Görsel bir yenilik telefonun kare hızından ödün vermesin; ağır efektler ayarlardan kapatılabilsin.
- **Üslup:**
  - Pastel ve low-poly kalsın; arayüz War Thunder'a benzemesin.
  - Grafik yönü (2026-10-23 kararı): low-poly modeller kalır ama görünüm daha gerçekçi ve ayrıntılı olur. Önce gerçekçi
    ışık ve gölge, gökyüzü ve bulutlar, atmosfer, su ve arazi ayrıntısı gelir; uçaklar kodla zenginleşir. Blender ya da
    hazır model yok. Her adımda telefon kare hızı ölçülür.
  - Planlayıcı yalnız göreve ilişkin alanları gösterir.
- **Sesler:**
  - Yalnız gerçek kayıt, sentez yok.
  - Lisans yalnız CC0 ya da CC BY (Steam planı var). Lisansı kaydın kendi Freesound sayfasından doğrula; "Attribution"
    filtresi NC kayıtları da getiriyor. Atış alanı kayıtlarında arka planda konuşma olabilir.
  - Üretim `tools/sfx` ile yapılır.
- **Testte kullanıcının kendi Chrome profiline dokunma.** O profilde gerçek hesabı açık; orada oyun başlatma, çıkış
  yapma. Her zaman ayrı ve geçici profil kullan: Playwright betiği ya da `chrome-devtools` MCP (`--isolated`).
- Kullanıcı bir sesin ya da görüntünün "garip" olduğunu söylerse haklı varsay. Mevcut hâli savunma; katmanları
  ayırıp sebebi bul.

## Komutlar

```
npm run dev          # http://localhost:5173  (?rec ile video kayıt kipi, yalnız geliştirmede)
npm run build        # tsc --noEmit (sıkı: kullanılmayan değişken de hata) + vite build → dist/
npm run typecheck
npm run sim:bench    # başsız simülasyon ölçümü (tools/sim)
npm run sim:hits     # isabet/düşürme istatistikleri
```

## Mimari (kısa)

- **`src/sim/`: oyun mantığı, render bilmez.** 60 Hz sabit adım (`world.step`), Node'da başsız çalışır.
  - `aircraft/`: gerçek uçak katalogu (`specs.ts`), uçuş modeli, hasar.
  - `ai/`: kol, dalaş, pike, taarruz, bombardıman, taret, pist operasyonları.
  - `structures/`: üs, uçaksavar, radar, fabrika, şehir yapıları.
  - Diğerleri: `world.ts` (mermi, bomba, flak, olaylar), `terrain.ts` + `maps.ts` (iki harita, 300 × 300 km: Anakara,
    Takımadalar), `scenarios.ts`, `campaign.ts`, `commander.ts` (rakip yapay zekâ).
  - **Olaylar:** `w.events` her kare önce ses (`audio/battle.ts`), sonra render tarafından tüketilir; render listeyi
    siler.
  - **Kimlikler:** Kimlik sayaçları modül düzeyinde. Kayıt kipi için sıfırlama işlevleri var.
- **`src/render/`: Three.js.**
  - `gameRenderer.ts`: sahne ve senkron.
  - `camera.ts`: strateji kamerası; `director` kancası sinematik kayıt içindir.
  - `effects.ts`: iki ponpon katmanı var: ışıkla gölgelenen duman/ateş ve ışıktan etkilenmeyen parlama.
  - Diğerleri: `terrain.ts`, `scenery.ts` (yakın ağaç, köy, yol), `models.ts` (kodla üretilen parametrik uçaklar),
    `structures.ts`, `palette.ts`.
  - Efekt ve model büyütmesi kamera uzaklığına bağlı (`rig.fxScale`, `rig.modelScale`).
- **`src/audio/`:**
  - `sound.ts`: Web Audio, kanallar, örnek bankası.
  - `battle.ts`: kameraya göre duyulma, Doppler, geçiş sesleri.
  - `alerts.ts`: oyuncuya uyarılar.
  - Ses dosyaları `public/sounds`; künye `credits.ts`.
- **`src/ui/`:** DOM arayüzü: HUD, paneller, planlayıcı, araştırma, pazar, inşa, ana menü, haberler, geri bildirim
  (Google Form).
- **`src/persist.ts`:** Hesaplar localStorage'da, kayıtlar IndexedDB'de; şifre yok.
- **`src/game.ts`:** Denetleyici (kipler, seçim, kayıt, kare döngüsü). Giriş noktası `src/main.ts`.
- **`src/rec/`:** Video kayıt kipi. Tohumlu ve tekrarlanabilir sinematik çekimler, kare kare görüntü ve onunla senkron
  ses. Yayın derlemesine girmez.

## Araçlar ve klasörler

- `tools/sfx/`: sesleri gerçek kayıtlardan üretir (`fetch → build → verify`). Bkz. README.
- `tools/rec/`: tanıtım videoları (`record.mjs`, `probe.mjs`, `ui.mjs`, `edit.mjs`) ve grafik önce/sonra denetimi
  (`audit/stills.mjs`, `audit/perf.mjs`; taban `audit/taban-2026-10-23.json`). Bkz. README.
- `tools/sim/`: başsız simülasyon betikleri.
- `release/` (git dışı):
  - itch.io paketi;
  - `sosyal/` videolar ve gönderi metinleri;
  - `sosyal/biriktirilen.md`: sonraki video için biriken yenilikler. Görünür bir yenilik gelince buraya ekle.
- `brand/`: logo dosyaları.
- `docs/PLAN.md`: tasarım kararları ve yol haritası. Mimari bölümü kısmen eski; kod esas alınır.

## Test yolları

- **Simülasyon:** esbuild ile paketlenmiş küçük bir sürücü betiği. Betik scratchpad'de durur; `NODE_PATH` gerekir.
- **Tarayıcı:** Kendi Playwright betiğin, ayrı port (5291 ve üstü) ve temiz profille. `window.game` konsoldan
  erişilebilir. Başsız tarayıcı rAF'yi yavaşlatır; dünyayı `evaluate` içinde elle adımla.
- **Performans:** `chrome-devtools` MCP ile işlemciyi 4 kat yavaşlatarak telefonu taklit et.
- **Görsel önce/sonra:** Kayıt kipi aynı sahneyi her seferinde aynı oynatır.

## Windows ortam tuzakları

- PowerShell (cp1254) Türkçe UTF-8 dosyaları bozar. Dosya düzenlemeyi Edit/Write ile yap.
- Git Bash, `/c` gibi argümanları `C:/`'ye çevirir. Bu tür komutları PowerShell'den çalıştır.
- Bazı kaynak dosyalar CRLF satır sonlu. Betikle metin değiştirirken buna dikkat et.
- Ters tırnak içeren heredoc'lar Bash aracında bozulur. Betiği önce Write ile dosyaya yaz.
