# WarSimBox — Claude için çalışma notları

Yukarıdan bakılan, pastel, low-poly bir hava savaşı strateji oyunu. Canlı sürüm: https://warsimbox.com (Cloudflare).
Oyuncuların çoğu **yatay telefonda** oynuyor. Arayüz **Türkçe ve İngilizce**. En öncelikli konu uçakların ve hava
savunmasının **gerçekçi davranması**: gerçek uçaklar, gerçek veriler. Şehir ve ekonomi katmanı ikinci planda.

## Kurallar

- Kullanıcıya Türkçe yaz.
- **Oyun iki dilli** (`src/i18n.ts`; ana menüdeki EN/TR düğmesi, `warsim.lang`):
  - Türkçe asıl. Her yeni metin İngilizcesiyle birlikte `L('Türkçe', 'English')` olarak yazılır.
  - `L()` iki dilin metnini de hesaplar. İçine yan etkili çağrı koyma (ör. `finishJob()` iki kez çalışıp oyunu
    düşürmüştü): önce değişkene al.
  - Büyük kataloglarda İngilizce, kimliğe göre yan dosyadadır: `specsEn.ts`, `techEn.ts`, `newsEn.ts`. Yeni uçak,
    araştırma ya da haber eklenince oraya da yazılır.
  - Sim mantığında anahtar olan Türkçe metinler değişmez, yalnız ekranda çevrilir: ülke adı (`originName`), düşürme
    nedeni (`world.ts` `CAUSE_EN`).
  - `index.html`'deki sabit metinler `data-en` / `data-en-title` taşır. İlk yükleme ekranını paket inmeden satır içi
    betik çevirir; kuralı `i18n.ts` `initial()` ile aynıdır.
  - Başsız simülasyon (Node) ve video kayıt kipi hep Türkçedir.
- **Commit ve push yalnız kullanıcı söyleyince.** `main`'e push, Cloudflare'de (Workers Builds) doğrudan canlıya çıkar.
  Push'tan önce `npm run build` (tsc dahil) ve kısa bir oyun denemesi yap.
  - Eski adres warsimbox.vercel.app: otomatik kurulumu kapalı (`vercel.json` ve proje ayarı). Eski oyuncuların
    kayıtları taşınana kadar açık kalır, sonra silinir.
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
npm run sim:ceiling  # servis tavanı ayarı: specs.ts CEILINGS üslerini bulur ve denetler
npm run db:local     # yerel D1 veritabanı (tablolar)
npm run serve        # yerel Cloudflare sunucusu: dist/ + /api (http://localhost:8787; önce npm run build)
npm run deploy       # Cloudflare'e elle yayın (normalde GitHub bağlantısıyla kendiliğinden)
```

`npm run dev` sırasında `/api` istekleri `npm run serve`'e (8787) gider; hesap denemesi için ikisi birlikte açık olmalı.
Yerel yönetici anahtarı `.dev.vars` (git dışı).

## Mimari (kısa)

- **`src/sim/`: oyun mantığı, render bilmez.** 60 Hz sabit adım (`world.step`), Node'da başsız çalışır.
  - `aircraft/`: gerçek uçak katalogu (`specs.ts`), uçuş modeli, hasar.
    - Belgelenen azami hız türetmede tutturulur: Cd0, uçağın en hızlı olduğu irtifadaki hız belgelenene eşit olacak
      biçimde ayarlanır.
    - Avcıların servis tavanı `CEILINGS`'teki irtifa düşüşü üssüyle tutturulur. Üsleri `npm run sim:ceiling` bulur;
      açılışta aramak telefonda yavaş olduğu için tabloya yazılır. Motor, ağırlık, sürükleme ya da azami hız
      değişince aracı yeniden çalıştır.
    - Dalga sürüklemesi (`aero.ts` `waveCd`) Lock kuralıyla ıraksama Mach'ına (`mdd`, yoksa mcrit + 0,1) kadar artar,
      ötesinde dik yükselir. Belgelenen hızı Mdd'nin üstünde olan jetin `mdd`'si tanımda verilir; F-86 ve MiG-15'inki,
      gerçekteki gibi deniz seviyesinde en hızlı olacakları biçimde seçildi.
  - `ai/`: kol, dalaş, pike, taarruz, bombardıman, taret, pist operasyonları.
  - `structures/`: üs, uçaksavar, radar, fabrika, şehir yapıları.
  - Diğerleri: `world.ts` (mermi, bomba, flak, olaylar), `terrain.ts` + `maps.ts` (iki harita: Anakara, Takımadalar),
    `scenarios.ts`, `campaign.ts`, `commander.ts` (rakip yapay zekâ).
  - **Harita büyüklüğü:**
    - Seçenekler: Küçük 150, Orta 200 (varsayılan), Büyük 300 km.
    - Haritalar 300 km için çizildi (`MAP_BASE`). Küçükte büyük şekiller ve yerler ölçeklenir; yerel ayrıntı, pist ve
      şehir gerçek boyda kalır. 300 km arazisi birebir korunur (eski kayıtlar).
    - `MAP_SIZE`, `MAP_HALF`, `TERRAIN_CELL` canlı bağlardır: modül düzeyinde sabite kopyalama, kullanırken oku.
    - Izgara her büyüklükte 2048 hücre. Ayrıntı düzeyi mesafeleri ve parça boyu ölçeğe göre ayarlanır; çizim yükü
      büyüklükten bağımsız kalsın.
    - Senaryolar ve video kayıt kipi 300 km'dir.
  - **Olaylar:** `w.events` her kare önce ses (`audio/battle.ts`), sonra render tarafından tüketilir; render listeyi
    siler.
  - **Kimlikler:** Kimlik sayaçları modül düzeyinde. Kayıt kipi için sıfırlama işlevleri var.
- **`src/render/`: Three.js.**
  - `gameRenderer.ts`: sahne ve senkron.
  - `camera.ts`: strateji kamerası; `director` kancası sinematik kayıt içindir.
  - `effects.ts`: iki ponpon katmanı var: ışıkla gölgelenen duman/ateş ve ışıktan etkilenmeyen parlama.
  - `atmosphere.ts`: gök kubbesi, güneş, yükseklik sisi (three.js sis parçalarının yerine). Kendi `onBeforeCompile`'ı
    olan malzeme `linkAtmosphere` çağırmalı, yoksa sisi bozulur.
  - Diğerleri: `terrain.ts`, `scenery.ts` (yakın ağaç, köy, yol), `models.ts` (kodla üretilen parametrik uçaklar),
    `structures.ts`, `palette.ts`.
  - Efekt ve model büyütmesi kamera uzaklığına bağlı (`rig.fxScale`, `rig.modelScale`).
- **`src/audio/`:**
  - `sound.ts`: Web Audio, kanallar, örnek bankası.
  - `battle.ts`: kameraya göre duyulma, Doppler, geçiş sesleri.
  - `alerts.ts`: oyuncuya uyarılar.
  - Ses dosyaları `public/sounds`; künye `credits.ts`.
- **`src/ui/`:** DOM arayüzü: HUD, paneller, planlayıcı, araştırma, pazar, inşa, ana menü, haberler, geri bildirim
  (Google Form), hesap penceresi (`loginBox.ts`), skor tablosu (`leaderboard.ts`, ana menüde Skorlar sekmesi), profil
  (`profile.ts`: ad etiketi ya da Menü → Profil; skorlar, sıra, şifre değiştirme).
  - `tutorial.ts`: öğretici. "Oyuna başla"da sorar; "Bir daha sorma" hesapta ya da misafirde tarayıcıda saklanır.
    Adımlar arayüzdeki seçicilere bağlı (`data-act`, `data-mm`, `.psec`…). Bu seçiciler değişirse öğretici de
    güncellenmeli. Tam tur denemesi: scratchpad'deki gibi bir Playwright betiğiyle her adıma tıklanır.
- **`src/persist.ts`:** Hesap sunucuda: ad + şifre. Kayıtlar bulutta; her kayıt önce IndexedDB'ye (önbellek ve yedek)
  yazılır, bağlantı yoksa orada bekler ve sonra yüklenir. Eski şifresiz hesabın (`warsim.accounts.v1`) sahibi şifre
  belirleyince bu tarayıcıdaki kayıtları yeni hesaba geçer.
- **`src/net/`:** sunucuyla konuşma (`api.ts`), istemci ve sunucu ortak kuralları (`shared.ts`: ad anahtarı, ölçütler),
  skor istatistiği (`stats.ts`).
- **`worker/` + `migrations/`: sunucu (Cloudflare Worker + D1).** Oyunun dosyalarını Cloudflare sunar, worker yalnız
  `/api/*`'ye ve olmayan adreslere bakar (404 durum koduyla `public/404.html`). Yapılandırma `wrangler.jsonc`.
  - Bedava planda istek başına ~10 ms işlemci süresi var. Bu yüzden şifre tarayıcıda PBKDF2 ile uzatılır, sunucu
    yalnız tuzlu SHA-256 yapar.
  - Ad anahtarında I, İ, ı ve i aynı sayılır (`nameKey`); istemci ve sunucu aynı işlevi kullanır.
  - Skorlar: harekâtın en yüksek değerlerine göre artış, akla yatkınlık sınırlarıyla kırpılır. Tüm zamanlar ve ISO hafta.
  - Şifresini ve kurtarma kodunu unutan oyuncu: `tools/admin.mjs` (önce kimlik sorusu sor; bkz. dosyanın başı).
- **`src/game.ts`:** Denetleyici (kipler, seçim, kayıt, kare döngüsü). Giriş noktası `src/main.ts`.
- **Açılış ve harita yükleme:**
  - `main.ts` önce yükleme ekranını (arka görsel `public/yukleme.jpg`) çizdirir.
  - Sonra haritayı oyuncunun seçtiği büyüklükte yükler, böylece ilk harekât yeniden üretimsiz başlar. En son oyunu
    kurar.
  - Arazi ve arazi örtüsü işçilerde paralel üretilir (`render/mapLoad.ts`, `render/mapWorker.ts`). Saf hesaplar
    `sim/terrainGen.ts` ve `render/landcoverGen.ts`'tedir; tek seferlik yol da aynı işlevleri kullanır, sonuç bit bit
    aynıdır (eski kayıtlar).
  - Oyun içinde harita değişimi (`withMap`) de işçilerle yapılır; bu sırada kare döngüsü bekler.
  - Başsız simülasyonda (Node) ilk harita `terrain.ts` yüklenirken eski yolla üretilir.
  - Kayıt kipi ve görsel denetim haritayı önceden yüklemez: `GameRenderer` kurulurken yüklü harita yoksa ilk haritayı
    300 km'de yükler (eski çekimler aynı kalır).
- **`src/autoFast.ts`:** Boş yolda otomatik 2×. 1× seçiliyken kollar yalnız yoldaysa oyun 2× akar. Görev, çatışma,
  kalkış, iniş ya da bilinen düşman yakındaysa 1× olur. Ayarlar → Oyun.
- **`src/rec/`:** Video kayıt kipi. Tohumlu ve tekrarlanabilir sinematik çekimler, kare kare görüntü ve onunla senkron
  ses. Yayın derlemesine girmez.
- **`src/ansiklopedi/`:** Uçak ansiklopedisi. Arama motorları için düz HTML: `/ansiklopedi/…` ve `/en/encyclopedia/…`.
  - Metin döneme göre `makale/*.ts`'te (TR/EN; biçim `tur.ts`, toplayan `makaleler.ts`). Sıra, ad, yıl ve "Oyunda"
    sayıları katalogdan (`specs.ts`) gelir. "Oyunda" metni yalnız oyunda gerçekten modellenmiş davranışı anlatır;
    araştırma yolunu sayfa kendisi ekler, metinde tekrarlama. Uçurulamayan (`future`) uçaklarda oyun değerleri ve
    "Bu uçakla oyna" gösterilmez.
  - `liste.ts` adresleri tutar; oyun da okur (menüde Ansiklopedi düğmesi, hangarda bağlantı). Makale metni oyun
    paketine girmez.
  - Sayfaları `sayfalar.ts` üretir. Vite eklentisi `tools/ansiklopedi/vite.ts` derlemede dist/'e yazar, geliştirmede
    anında sunar. Site haritası da oradan üretilir.
  - Görseller oyunun modellerinden: `node tools/ansiklopedi/gorseller.mjs [uçak]` → `public/ansiklopedi/gorsel`.
  - Yeni uçak: makale + `liste.ts` + görseller. Tarih ve sayılar yaygın kaynaklarla uyuşmalı; emin olunmayan bilgi
    yazılmaz.

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
