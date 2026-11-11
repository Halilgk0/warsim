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
  - Arayüz ölçülerini `calc(Npx * var(--ui))` ile yaz. Çelik pencerelerde dokunma hedefi en az 32 px: `max(32px, calc(Npx * var(--ui)))`.
  - Bitti demeden 800×360 ve 844×390'da bak. Tarayıcıda adres çubuğu yüksekliği düşürür: menü ve pencereleri 780×300'de de
    dene. Yükseklikte `100vh` yerine `var(--vh100)` kullan.
  - Klavye yatay telefonda ekranın çoğunu kaplar, üstte ~100 px kalır: yazı alanı olan pencereler `ui/keyboard.ts` `.kb`
    ile üste dayanır. Yeni açılır pencereyi `style.css`'te `.kb` kuralına ekle. Başsız tarayıcıda klavye açılmaz; gerçek
    davranışı telefonda dene. Yazı alanına kodla odaklanırken `dom.ts` `focusField` kullan: telefonda klavye oyuncu alana
    dokununca açılır.
  - Görsel bir yenilik telefonun kare hızından ödün vermesin; ağır efektler ayarlardan kapatılabilsin.
- **Üslup:**
  - Pastel ve low-poly kalsın; arayüz War Thunder'a benzemesin.
  - Grafik yönü (2026-10-23 kararı): low-poly modeller kalır ama görünüm daha gerçekçi ve ayrıntılı olur. Önce gerçekçi
    ışık ve gölge, gökyüzü ve bulutlar, atmosfer, su ve arazi ayrıntısı gelir; uçaklar kodla zenginleşir. Blender ya da
    hazır model yok. Her adımda telefon kare hızı ölçülür.
  - Planlayıcı yalnız göreve ilişkin alanları gösterir.
  - Arayüz dili (`style.css` sonundaki "Görünüm" bölümü): seçili öğede açık zemin ve altta sönen uçak izi (`--trail`); yeşil
    dolgu yalnız o ekranın asıl eyleminde; oyun içi üst çubuklar tepeden sarkar (ana menünün üst düğmeleri ayrı ayrı kalır,
    tek çubuğu kullanıcı beğenmedi); pencere köşeleri çapraz kanat (`--wing`); kutu içinde
    kutu yerine düz satırlar; büyük harfli başlık yok. Yenilik mevcut görünümden küçük adımlarla gelir: 2026-11-04'te retro
    temalar (harekât odası, afiş, seyir haritası) "çok eski ve kötü" diye reddedildi.
  - Çelik tema (2026-11-05, kullanıcı beğendi; `style.css` `.modal-card.steel`): ağır metal fabrikası. Satırlar soldan sağa
    koyu yeşilden siyaha, baklavalı sac başlık, ince ikaz şeridi. Üretim, Silah yuvası, Araştırma, Hangar ve Haberler'de (haber e-postası da aynı renklerde; ansiklopedi ve yasal
    sayfalar `ansiklopedi/stil.css`'te aynı renk ve desenlerin kopyasıyla); kartta
    `steel` sınıfı ve değişkenler (`--ink`, `--chip`, `--trail`…) başka menüye de taşır. Yayılması kullanıcının kararıyla.
    Araştırmada siluet rengi durumu söyler (`research.ts` `INK`, renk başına hazır dosya); hangar sahnesi saydam, arka planı `.steel .preview`.
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
npm run sim:flak     # uçaksavar karnesi: mermi ve düşürme; silah verisi değişince öncesini ve sonrasını karşılaştır
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
    - Türev sürüm (Me 262 A-1a/U4, `me262u4`): kendi belgelenmiş tavanı yoksa tanımda `lapseOf` ile temel sürümün irtifa
      düşüşünü alır. Modeli temel sürümün `case`'ini paylaşır (`models.ts` `me262`), farkı bir bayrakla kurulur.
  - `ai/`: kol, dalaş, pike, taarruz, bombardıman, taret, pist operasyonları.
    - Uzaktan ateş topu (`GunSpec.standoff`; 50 mm MK 214 A): bombardıman kutusunun en yakın uçağına arkadan, nişancı
      menzili dışından ateş eder, menzile girmeden yana kırıp yeniden arkaya geçer (`combat.ts` `standoffAttack`). Sesi
      seri döngüsü değil, mermi başına tek vuruş (`audio/battle.ts`). Bot bu uçağı araştırmaz (`commander.ts`
      `VEHICLE_PRIORITY`'de yok): eklemek bot dengesini değiştirir.
    - Bot dengesi (`commander.ts`) en az 240 dakikalık harekâtla denenir; görev kayıpları dönüş dahil ve kaynağına göre ölçülür. Kısa ölçüm iki kez yanılttı.
    - İniş `ops.ts`: her denemenin tarzı `LandingStyle` (yaklaşma uzunluğu, hız, teker koyma, fren), uçak kimliği ve deneme
      sayısından türer; ortak `Math.random` akışına dokunmaz. Pas geçen uçak (`missed`) sırasını bırakır, pistin yanından döner.
  - `structures/`: üs, uçaksavar, radar, fabrika, şehir yapıları.
    - `airDefense.ts`: silahlar gerçek sistemlerdir (kaynaklar dosyanın başında). Silah kimlikleri (`mg`, `aa88`…) kayıtlara yazılır, değişmez.
      Yenileme planı `docs/PLAN.md` "Hava savunması yenileniyor".
  - Diğerleri: `world.ts` (mermi, bomba, flak, olaylar), `terrain.ts` + `maps.ts` (iki harita: Anakara, Takımadalar),
    `scenarios.ts` (oyuncuya görünmez; test, video kayıt ve ölçüm için koddan `game.loadScenario`), `campaign.ts`, `commander.ts` (rakip yapay zekâ).
  - **Rastgele başlangıç yerleri** (2026-11-10, `startSites.ts`): harekâtta ana üsler haritanın sabit yerlerinde değil,
    yüklü haritada uygun rastgele noktalarda (karada, pist sığar, koridor açık, şehir ve kenardan uzak; arazi değişmez).
    Her tarafın en yakın rakibi sabit yerlerdeki ortalamanın 0,6–1,5 katı, ortalama ±%15. Harita `startZones` verirse
    (Takımadalar: altı büyük ada) her taraf ayrı bölgede. Ana menü dizilişi önizlemede gösterir ("Yeni yerler"), oyun
    aynısıyla başlar (`game.newCampaign` `layout`). Uygun nokta havuzu harita başına bir kez, menüde dilimlerle kurulur.
    Ana menü arka planı, senaryolar ve ölçümler sabit yerlerde kalır. Haritanın sabit yerleri (`sites`) araziyi de
    biçimlendirir (ova, yol); değiştirmek eski kayıtları bozar.
  - **Harita büyüklüğü:**
    - Seçenekler: Küçük 150, Orta 200 (varsayılan), Büyük 300 km.
    - Haritalar 300 km için çizildi (`MAP_BASE`). Küçükte büyük şekiller ve yerler ölçeklenir; yerel ayrıntı, pist ve
      şehir gerçek boyda kalır. 300 km arazisi birebir korunur (eski kayıtlar).
    - `MAP_SIZE`, `MAP_HALF`, `TERRAIN_CELL` canlı bağlardır: modül düzeyinde sabite kopyalama, kullanırken oku.
    - Izgara her büyüklükte 2048 hücre. Ayrıntı düzeyi mesafeleri ve parça boyu ölçeğe göre ayarlanır; çizim yükü
      büyüklükten bağımsız kalsın.
    - Senaryolar ve video kayıt kipi 300 km'dir.
  - **Olaylar:** `w.events` her kare önce ses (`audio/battle.ts`), sonra render tarafından tüketilir; render listeyi
    siler. Pencere açıkken (`game.ts` `windowOpen`) ikisi de iki karede bir çalışır, olaylar sonraki kareye kalır: birini
    tek başına atlama, olay ya iki kez işlenir ya kaybolur. Bu karelerde otomatik çözünürlük durur.
  - **Zaman:** `world.time` simülasyon saati: hızlanır; günün saati, üretim süreleri, skor ona bağlı. `world.playTime` gerçek oynanma süresi: ekrandaki sayaç, kayıt başlığı, günlük satırları (`fmtStamp`). Hızlandırma etkilemez, duraklatınca durur; `Game.tick` sayar, simülasyon adımı dokunmaz. Eski kayıtta `time`'dan sürer.
  - **Kimlikler:** Kimlik sayaçları modül düzeyinde. Kayıt kipi için sıfırlama işlevleri var.
- **`src/render/`: Three.js.**
  - `gameRenderer.ts`: sahne ve senkron.
  - `camera.ts`: strateji kamerası; `director` kancası sinematik kayıt içindir.
  - `effects.ts`: iki ponpon katmanı var: ışıkla gölgelenen duman/ateş ve ışıktan etkilenmeyen parlama.
  - `atmosphere.ts`: gök kubbesi, güneş, yükseklik sisi (three.js sis parçalarının yerine). Kendi `onBeforeCompile`'ı
    olan malzeme `linkAtmosphere` çağırmalı, yoksa sisi bozulur.
  - `arch.ts`: yapı yüzeyleri tek gölgelendiricide yordamsal (doku dosyası yok). İnce ayrıntı `aFade` ile yalnız
    yakında hesaplanır; yeni desen de böyle sönmeli (uzakta hem kıpırtı hem maliyet olmasın).
  - `lamps.ts`: yapı ışıkları (kameraya dönük lambalar, yerde ışık havuzları). Akşam `archNight` ile yanar; gündüz
    üçgenleri çöker, maliyeti yok.
  - `structures.ts`: hava üssü, uçaksavar, radar, fabrika.
    - Yeni üs yapıları `|x| ≤ 400` içinde kalsın: simülasyonun üs alanı bu (dışına başka yapı kurulabiliyor).
    - Park eden uçaklar `placeParked`: en yeni yarısı hangar ağzı, T2, çadır hangar, sığınak ve siperlere, kalanı
      aprona. Tür başına InstancedMesh (`models.ts` `parkedParts`).
  - `models.ts`: kodla üretilen parametrik uçaklar. Modelde `+x` sol kanat (burun `+z`, üst `+y`).
    - Araştırma ağacındaki bütün jetler üç görünüş çiziminden kurulur (ölçüler px/m ile çizimden okunur, fotoğrafla
      karşılaştırılır): `JetHull` kesit listesinden gövde, kanopi ve kanal yapar; `jetCanopy`, `jetFin`, `jetGear`,
      `sideIntake`, `glassFrames`. Yeni uçak için önce Wikimedia Commons'ta "<uçak> 3-view" ara. Sim'deki `gearHeight`
      takımla uyuşmalı.
    - Pervaneliler de çizimden kurulur: gövde `JetHull`, kanat ve yatay kuyruk çizim satırlarından `planWing` (`WingRow`),
      düz menteşeli kuyruk `hingedFin`, ayrık flap `splitFlap` / `rowFlap`, pike freni `rowBrake`, kafesli kapak `jetCanopy`
      `rails`, camlı burun `noseGlass`, taret `turretDome`, alt renkli parça `underPaint`, takım `propGear`, `noseWheel`,
      `retractTailWheel`, `fixedTailWheel`. Sim'deki `turret` konumları modeldeki yerle uyuşmalı.
    - Ana takım `propGear`: bacak kapağının yalnız çokgeni verilir, yeri ve eğimi bacaktan hesaplanır (`gearDoorOn`, tekerin
      karşı yüzünde). Teker bacağın tam altındaysa (`dx: 0`, tek teker) bacak çatal olur (`forkOf`), lastiğin içinden geçmez.
    - Kuyruk tekerlekli uçağın yer açısı `flightModel.ts` `TAIL_ANGLE` (yoksa 11°), yüksekliği `gearHeight`: ana tekerin düz ve
      kuyruk üstü duruştaki yüksekliklerinin ortası.
    - Hareketli parçalar eklemdir. Modeli değiştirince ansiklopedi görsellerini ve üretim listesi resimlerini de yeniden üret.
      - Kanat ve kuyruk `controlWing` / `controlFin` ile kurulur: ana yüzey ve kumanda yüzeyi aynı profilden kesilir
        (`airfoilPart`), aralarında yalnız menteşe çizgisi kalır.
      - Gövde (kapalı hava girişi ve egzoz) `migFuselage`, takım (içe ve öne katlanır, gövdeye girer) `migGear`.
      - Hava freni `airbrakes`.
    - Yerdeki uçak pist betonunun üstünde çizilir: `gameRenderer.ts` `RUNWAY_TOP`, büyütmede takım payı.
    - Eklem menteşe ekseniyle döner. `gameRenderer.ts` `animateParts` kumandalara bağlar.
    - Işıklar model tanımında (`lights`): seyir lambaları ve iniş farı. Ek çözünürlük `HIRES`.
    - Yeni uçağa eklerken bu dört parçayı ve ışıkları tanıma ekle.
  - Uçaksavar topları `structures.ts` `aaGun`; hangar vitrini aynı modeli `buildAAGun` ile alır (`ui/hangar.ts`, bilgiler `ui/hangarAA.ts`). Yapı
    malzemesi sis tanımı ister: başka sahnede kullanırken sahneye `fog` ver.
  - Diğerleri: `terrain.ts`, `scenery.ts` (yakın ağaç, köy, yol), `palette.ts`.
  - **Boş arazi ağaçlı** (2026-11-10): `landcoverGen.ts` ormanın dışındaki açık araziye de seyrek ağaç ve koru yazar
    (`open`, tarla, şehir, üs yeri, ağaç sınırı ve uçurum hariç). Yakın ağaçlar `scenery.ts`'te yol, köy, çiftlik ve şehir
    çevresine dikilmez (`keepOut`, 40 m hücre; `buildSettlements` doldurur). Yalnız görüntü: sim arazisi değişmez.
  - Efekt ve model büyütmesi kamera uzaklığına bağlı (`rig.fxScale`, `rig.modelScale`).
- **`src/audio/`:**
  - `sound.ts`: Web Audio, kanallar, örnek bankası.
  - `battle.ts`: kameraya göre duyulma, Doppler, geçiş sesleri.
  - `alerts.ts`: oyuncuya uyarılar.
  - Ses dosyaları `public/sounds`; künye `credits.ts`.
- **`src/ui/`:** DOM arayüzü: HUD, paneller, planlayıcı, araştırma, pazar, inşa, ana menü, haberler, geri bildirim
  (`feedback.ts`; sunucudan warsimbox@gmail.com'a e-posta: görüş için e-postalı hesap, yalnız fiyat için misafire komutan
  adı yeter; `worker/index.ts` `sendFeedback`), hesap penceresi (`loginBox.ts`), skor tablosu (`leaderboard.ts`, ana menüde Skorlar sekmesi), profil
  (`profile.ts`: ad etiketi ya da Menü → Profil; skorlar, sıra, şifre değiştirme).
  - `news.ts`: haberler (görünüm; verisi `newsData.ts`). Yeni haber `newsData.ts`'te listenin en üstüne yazılır ve izin
    verenlere e-postayla da gider (İngilizcesi `newsEn.ts`; ekran görüntüsünde yazı varsa
    İngilizce görseli `cover` ve `files` ile verilir). Okunmamış işareti kendiliğinden çıkar: açılan haberin kimliği hesaba
    yazılır (`accounts.news_seen`), misafirde işaret yok. `MARK_DAYS`'ten eski haber işaretlenmez.
  - `production.ts`: üretim menüsü (fabrika; uçak ve top satırları) ve yuva penceresi (bataryada top takma). Pencere açıkken yalnız `data-cell` hücreleri güncellenir; tam çizim düğmeyi kaçırıyordu. Resimler hazır dosya (`public/uretim`; araştırma dosyası ve `plan/` altındaki siluetler de): telefon bu pencereler için model kurmaz, liste metni kısa kalır. Yeni uçak ya da top eklenince, model değişince `npm run uretim:gorsel [ac-<uçak> gun-<top>]`.
  - `tutorial.ts`: öğretici. "Oyuna başla"da sorar; "Bir daha sorma" hesapta ya da misafirde tarayıcıda saklanır.
    Adımlar arayüzdeki seçicilere bağlı (`data-act`, `data-mm`, `.psec`…). Bu seçiciler değişirse öğretici de
    güncellenmeli. Tam tur denemesi: scratchpad'deki gibi bir Playwright betiğiyle her adıma tıklanır.
- **`src/persist.ts`:** Hesap sunucuda: ad + şifre. Kayıtlar bulutta; her kayıt önce IndexedDB'ye (önbellek ve yedek)
  yazılır, bağlantı yoksa orada bekler ve sonra yüklenir. Eski şifresiz hesabın (`warsim.accounts.v1`) sahibi şifre
  belirleyince bu tarayıcıdaki kayıtları yeni hesaba geçer.
  - **Kayıt yerleri** (2026-11-10, `src/saveSlots.ts`, sabitler `shared.ts` `SAVE_SLOTS`): hesap başına 4 yer, yerde bir
    kayıt (`SaveMeta.slot`); yazınca o yerdeki eski kayıt silinir (istemci ve sunucu). Otomatik kayıt `autoSlotFor`: aynı
    adlı (komutan adı, `nameKey`) oyunun otomatik kaydının yeri, yoksa 4, 3, 2, 1'den ilk boş; yer yoksa alınmaz, ana menü
    başlamadan ve yüklemeden önce söyler (`mainMenu.ts` `warnNoAutoSlot`). Elle kayıtta oyuncu yeri seçer (duraklatma →
    Kaydet), dolu yere onayla.
  - Yersiz (önceki) kayıtlar: sunucu `listSaves` toplam 4'ü aşınca `accounts.saves_warned`'a (migration 0008) ilk uyarı
    anını yazar, `cleanupBy` döner; oyun her girişte uyarır (`game.ts` `checkSaveCleanup`, bildirim penceresi
    `modals.openNotice`). 7 gün sonra yerdekiler ve en yeni yersizler kalır, gerisi silinir; sığınca yersizler boş yerlere
    yerleşir (otomatikler 4'ten, elle olanlar 1'den). Yasal metinler bunu anlatır.
- **`src/net/`:** sunucuyla konuşma (`api.ts`), istemci ve sunucu ortak kuralları (`shared.ts`: ad anahtarı, ölçütler),
  skor istatistiği (`stats.ts`).
- **`worker/` + `migrations/`: sunucu (Cloudflare Worker + D1).** Oyunun dosyalarını Cloudflare sunar, worker yalnız
  `/api/*`'ye ve olmayan adreslere bakar (404 durum koduyla `public/404.html`). Yapılandırma `wrangler.jsonc`.
  - Bedava planda istek başına ~10 ms işlemci süresi var. Bu yüzden şifre tarayıcıda PBKDF2 ile uzatılır, sunucu
    yalnız tuzlu SHA-256 yapar.
  - Ad anahtarında I, İ, ı ve i aynı sayılır (`nameKey`); istemci ve sunucu aynı işlevi kullanır.
  - Hesap açmak için e-posta (her sağlayıcı; `shared.ts` `validEmail`) ve Gizlilik/KVKK onayı zorunlu. Yenilik e-postası
    izni ayrı ve isteğe bağlı: yalnız `news_opt = 1` olanlara, hesabın dilinde (`accounts.lang`) gider. Toplu gönderimde her
    e-postada çıkma bağlantısı olmalı. Dil oyun açılınca eşitlenir (`persist.ts` `syncLang`). Adres yalnız sahibinin
    profilinde döner. Bir adresle tek hesap (`emailKey`: Gmail noktaları
    ve "+etiket" yok sayılır); çakışma kod doğrulanınca söylenir, kayıtlı adresler sızmasın. Eski adresin (vercel.app)
    paketi e-posta sormadığı için o kaynak muaftır.
  - Adres 6 haneli kodla doğrulanmadan kaydedilmez. Kod warsimbox@gmail.com'dan Gmail SMTP ile gider (`worker/mail.ts`,
    içerik `worker/codeMail.ts`; Google uygulama şifresi yalnız Cloudflare sırrı `MAIL_PASSWORD`, repoya girmez). Sınırlar `worker/index.ts`
    `LIMIT_*`: başkasının kutusuna yağdırılmasın, Gmail'in günlük sınırı (~500) aşılmasın.
  - Haber e-postası: her yeni haber kendiliğinden e-postayla gider (2026-11-10 kararı). `worker/newsMail.ts`
    `latestNewsMail` haberlerin en üstündekinden (`src/ui/newsData.ts` `NEWS_TR[0]`, İngilizcesi `newsEn.ts`) e-postayı
    kurar: başlık, özet, bölümlerin ilk maddeleri, kapak (İngilizcesi varsa İngilizce hesaplara). Push edilince zamanlı görev
    dakikada bir, izin vermiş tek hesaba gönderir; haberin günü sonuna kadar izin verenler alır, bir hafta sürer. Kime
    gittiği `news_seen`'de `mail:<haber>`. Çıkma `/api/news/unsubscribe`. Gitmemesi gereken haberde `noMail: true`.
    `newsData.ts` ve `newsEn.ts` sunucu da okuduğu için DOM'a, Vite'e ya da oyun koduna bağlanmamalı.
  - Teşekkür (6 saat): toplam oynama 6 saati geçen hesaba aynı zamanlı görev bir kez teşekkür e-postası atar
    (`worker/thanksMail.ts`, işaret `mail:tesekkur-6s`). Yalnız `news_opt = 1` olanlara: izinsiz ticari ileti yasal risk,
    kullanıcıyla böyle kararlaştırıldı. Oyunun içinde ise herkese (misafir dahil) bir kez teşekkür penceresi açılır
    (`ui/thanks.ts`; hesapta `news_seen` `tesekkur-6s`, misafirde `warsim.tesekkur`; misafir süresi `warsim.oynama`).
  - Yerel deneme: `node tools/mail-dev.mjs` (sahte SMTP; kodlar http://localhost:2526), `.dev.vars` ayarları dosyasında.
  - E-postası olmayan eski hesaba oyun her açılışta ve her girişte sorulur (`loginBox.ts` `askEmail`, `persist.ts`
    `shouldAskEmail`), adres bağlanana kadar; ertelenmez (2026-11-10 kararı). Pencere "Şimdi değil" ile kapatılabilir,
    sonraki girişte yine açılır. Adres Profil'den de eklenir; yenilik izni de oradan açılıp kapanır.
  - Yeni migration canlı veritabanına push'tan önce uygulanır (`wrangler d1 migrations apply warsimbox --remote`);
    Workers Builds'in bunu yaptığını varsayma. Yalnız eklemeli değişiklik: eski worker yeni tabloyla çalışabilsin.
  - Skorlar: harekâtın en yüksek değerlerine göre artış, akla yatkınlık sınırlarıyla kırpılır. Tüm zamanlar ve ISO hafta.
    Oyuncu Profil'den tabloda görünmemeyi seçebilir (`accounts.score_public`, varsayılan açık): gizli hesap tabloya ve sıra
    sayımına girmez, skoru yine işlenir.
  - Şifresini ve kurtarma kodunu unutan oyuncu ve yazılı silme başvurusu: `tools/admin.mjs` (önce kimlik sorusu sor; bkz.
    dosyanın başı). Oyuncu hesabını Profil'den şifresiyle kendi siler. Hesaba bağlı yeni tablo eklenirse
    `worker/index.ts` `eraseAccount`'a da ekle; yasal metinler hesabın bütün verisinin silindiğini söylüyor.
- **`src/game.ts`:** Denetleyici (kipler, seçim, kayıt, kare döngüsü). Giriş noktası `src/main.ts`.
- **Açılış ve harita yükleme:**
  - `main.ts` önce yükleme ekranını çizdirir. Arka görsel her açılışta değişir (`public/acilis/1-7.webp`, 2400×1350,
    art arda aynısı gelmez, `warsim.acilis`); seçimi `index.html` başındaki betik yapar, `404.html` de aynı listeden seçer.
    Yeni görsel eklenince iki listeye de yaz. Görseller kayıt kipinin `a_*` sahnelerinden (`src/rec/klipTakes.ts`), yatay
    3200×1800 çizilip küçültülür; uçak kartın üstünde, kadrajın üst yarısında kalmalı (ortada yükleme kartı durur).
    `yukleme.jpg` yedek ve teşekkür e-postasının görseli, sıraya girmez.
  - Sonra haritayı oyuncunun seçtiği büyüklükte yükler, böylece ilk harekât yeniden üretimsiz başlar. En son oyunu
    kurar.
  - Arazi ve arazi örtüsü işçilerde paralel üretilir (`render/mapLoad.ts`, `render/mapWorker.ts`). Saf hesaplar
    `sim/terrainGen.ts` ve `render/landcoverGen.ts`'tedir; tek seferlik yol da aynı işlevleri kullanır, sonuç bit bit
    aynıdır (eski kayıtlar).
  - Oyun içinde harita değişimi (`withMap`) de işçilerle yapılır; bu sırada kare döngüsü bekler.
  - Başsız simülasyonda (Node) ilk harita `terrain.ts` yüklenirken eski yolla üretilir.
  - Kayıt kipi ve görsel denetim haritayı önceden yüklemez: `GameRenderer` kurulurken yüklü harita yoksa ilk haritayı
    300 km'de yükler (eski çekimler aynı kalır).
- **`src/yasal/`:** Gizlilik Politikası (`/gizlilik/`, `/en/privacy/`) ve KVKK Aydınlatma Metni (`/kvkk/`, `/en/kvkk/`).
  Metin `metin.ts`'te; sayfaları ansiklopedinin çerçevesiyle `ansiklopedi/sayfalar.ts` üretir, oyun paketine girmez.
  Metinler oyunun gerçekten yaptığını anlatır: toplanan veri ya da hizmet sağlayıcı (analitik, e-posta servisi…) değişirse
  metni ve `shared.ts` `LEGAL_VERSION`'ı güncelle.
- **`src/autoFast.ts`:** Boş yolda otomatik 2×. 1× seçiliyken kollar yalnız yoldaysa oyun 2× akar. Görev, çatışma,
  kalkış, iniş ya da bilinen düşman yakındaysa 1× olur. Ayarlar → Oyun.
- **`src/rec/`:** Video kayıt kipi. Tohumlu ve tekrarlanabilir sinematik çekimler, kare kare görüntü ve onunla senkron
  ses. Yayın derlemesine girmez.
- **`src/ansiklopedi/`:** Uçak ve hava savunması ansiklopedisi. Arama motorları için düz HTML: `/ansiklopedi/…` ve `/en/encyclopedia/…`.
  - Metin döneme göre `makale/*.ts`'te (TR/EN; biçim `tur.ts`, toplayan `makaleler.ts`). Sıra, ad, yıl ve "Oyunda"
    sayıları katalogdan (`specs.ts`) gelir. "Oyunda" metni yalnız oyunda gerçekten modellenmiş davranışı anlatır;
    araştırma yolunu sayfa kendisi ekler, metinde tekrarlama. Yalnız araştırma ağacındaki uçakların sayfası olur;
    uçurulamayanlar (`future`) girmez.
  - `liste.ts` adresleri tutar; oyun da okur (menüde Ansiklopedi düğmesi, hangarda bağlantı). Makale metni oyun
    paketine girmez.
  - Sayfaları `sayfalar.ts` üretir. Vite eklentisi `tools/ansiklopedi/vite.ts` derlemede dist/'e yazar, geliştirmede
    anında sunar. Site haritası da oradan üretilir.
  - Liste sayfalarında arama ve sıralama (`tools()` ve sayfa sonundaki betik): kartlar düz HTML kalır, betik `data-*`
    değerleriyle süzer ve sıralar. Arama önce başlıkta (ad, kısaltma, yıl, ülke, rol), sonuç yoksa kısa açıklamada.
  - Görseller oyunun modellerinden: `node tools/ansiklopedi/gorseller.mjs [uçak] [--34 --yan --og --kart]` → `public/ansiklopedi/gorsel`.
    Liste kartı `-kart` (burun sağda, alçak açı, kadraj dolu piksellere göre), sayfa başı `-34`.
    Uçağın modeli değişince görselleri de yeniden üret; kendiliğinden güncellenmez.
  - Arka plan ana menünün haritası: `node tools/ansiklopedi/arkaplan.mjs` → `public/ansiklopedi/arka.webp`.
  - Yeni uçak: makale + `liste.ts` + görseller. Tarih ve sayılar yaygın kaynaklarla uyuşmalı; emin olunmayan bilgi
    yazılmaz.
  - Hava savunması bölümü (`/ansiklopedi/hava-savunmasi/…`, `/en/encyclopedia/air-defence/…`): makaleler
    `makale/hava-savunmasi.ts`, adresler `liste.ts` `AA_ENCYCLOPEDIA` (hangarın top bilgisi de bağlanır), görseller
    `gorseller.mjs gun-<silah>`. Sayılar silah tablosundan: `sim/structures/aaWeapons.ts` (saf veri; `airDefense.ts` onu aynen
    dışa aktarır). Ansiklopedi `airDefense.ts`'i içe aktarmasın: arazi modülü Node'da yüklenirken harita üretilir.
    Yeni top eklenince makalesi, adresi ve görseli de eklenir.

## Araçlar ve klasörler

- `tools/sfx/`: sesleri gerçek kayıtlardan üretir (`fetch → build → verify`). Bkz. README.
- `tools/rec/`: tanıtım videoları (`record.mjs`, `probe.mjs`, `ui.mjs`, `edit.mjs`) ve grafik önce/sonra denetimi
  (`audit/stills.mjs`, `audit/perf.mjs`; taban `audit/taban-2026-10-23.json`). Bkz. README.
- `tools/sim/`: başsız simülasyon betikleri.
- `tools/uretim/`: üretim listesi resimleri (`public/uretim/ac-*.webp`, `gun-*.webp`) ve araştırma siluetleri (`plan/`), oyunun modellerinden.
- `release/` (git dışı):
  - itch.io paketi;
  - `sosyal/` videolar ve gönderi metinleri;
  - `sosyal/biriktirilen.md`: sonraki video için biriken yenilikler. Görünür bir yenilik gelince buraya ekle.
- `brand/`: logo dosyaları.
- `docs/PLAN.md`: tasarım kararları ve yol haritası. Mimari bölümü kısmen eski; kod esas alınır.
- `docs/YAPILACAKLAR.md`: sıradaki işler. Kullanıcı "sonra yapalım" dediği işi buraya yaz, biteni sil.

## Test yolları

- **Simülasyon:** esbuild ile paketlenmiş küçük bir sürücü betiği. Betik scratchpad'de durur; `NODE_PATH` gerekir.
- **Tarayıcı:** Kendi Playwright betiğin, ayrı port (5291 ve üstü) ve temiz profille. `window.game` konsoldan
  erişilebilir. Başsız tarayıcı rAF'yi yavaşlatır; dünyayı `evaluate` içinde elle adımla.
- **Performans:** `chrome-devtools` MCP ile işlemciyi 4 kat yavaşlatarak telefonu taklit et.
  - Telefon benzetimi derlenmiş sürümde (`dist`), 3× piksel yoğunluğu ve gerçek dokunuş dizisiyle (`Input.dispatchTouchEvent`) yapılır; canlı sürümle aynı koşuda karşılaştır.
  - Model önbelleği (`models.ts` `geoCache`) pencereler arasında ortak: ilk açılış süresini temiz sayfada ölç, yoksa önce açılan pencere maliyeti gizler.
- **Görsel önce/sonra:** Kayıt kipi aynı sahneyi her seferinde aynı oynatır.

## Windows ortam tuzakları

- PowerShell (cp1254) Türkçe UTF-8 dosyaları bozar. Dosya düzenlemeyi Edit/Write ile yap.
- Git Bash, `/c` gibi argümanları `C:/`'ye çevirir. Bu tür komutları PowerShell'den çalıştır.
- Bazı kaynak dosyalar CRLF satır sonlu. Betikle metin değiştirirken buna dikkat et.
- Ters tırnak içeren heredoc'lar Bash aracında bozulur. Betiği önce Write ile dosyaya yaz.
