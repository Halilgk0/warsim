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
    - Bot ekonomisi (2026-11-13): ilk 3 maden ikinci üsten önce (4 fazla güçlendirdi); üs yeri 3 denemede bulunamazsa 30 dk üs aranmaz;
      savunma ve yatırım payı tehdide göre (`threat`: son 30 dk vurulduysa savunma ×1,6, 60 dk sakinse savunma ×0,6 ve
      yatırım ×1,3); ağır hasarlı maden varken yeni maden yok; itfaiyenin alanındaki maden, batarya ve radar yola bağlanır
      (`linkToRoads`). 240 dk ölçümünde maden 2 → 4, kazanç +%46, filo 15 → 18.
    - Bot dengesi (`commander.ts`) en az 240 dakikalık harekâtla denenir; görev kayıpları dönüş dahil ve kaynağına göre ölçülür. Kısa ölçüm iki kez yanılttı.
    - İniş `ops.ts`: her denemenin tarzı `LandingStyle` (yaklaşma uzunluğu, hız, teker koyma, fren), uçak kimliği ve deneme
      sayısından türer; ortak `Math.random` akışına dokunmaz. Pas geçen uçak (`missed`) sırasını bırakır, pistin yanından döner.
      Pas geçme ve iniş tuzakları (2026-11-18; deneme scratchpad `kontrol/pas.ts`, `kontrol/inis.ts`, eski kodla yan yana):
      - Pas geçme dönüşü 30° yatış ve 1,15 g ile; dönüş başlayınca düz tırmanışa dönülmez (A-26 S çizip 100+ m alçalıyordu). Flaplar
        bir kez kalkınca açılmaz (`missFlapsUp`; Lancaster ve He 111 tam gazda hız kaybedip düşüyordu).
      - İniş izni çıksa da uçak ilk yaklaşma noktasının altındaysa önce bekleme paterninde (temiz) tırmanır, yaklaşmada 200 m altında
        kalırsa paterne döner; flap ve takımla ağır uçak tırmanamıyordu. Tutunma hızına yakın uçak paternde burnunu hafif indirir.
      - İniş izni 300 sn'de düşer ama son yaklaşmada ve yerde düşmez (`airbase.ts`); sırasını yaklaşmada kaybeden pas geçer.
      - Motoru duran uçak (`weak`) paternde tırmanmaz, yaklaşma noktası kendi irtifasına göre yakına alınır, flap son yaklaşmada açılır.
      Sonuç: zorla pas geçirilen 14 türün neredeyse hepsi iniyor (Lancaster 0/6 → 6/6); tek motorlu He 111 ve B-25, hasarlı Ju 88 0/6 → 6/6.
    - Avcı hedef dağıtımı (2026-11-18, `flightGroup.ts` `assignTargets`), sırayla:
      1. Oyuncunun emri (`brain.order`).
      2. Bağlılık: saldırı evresindeki avcı 2,5 km'den (`COMMIT_RANGE`) yakın hedefini tutar; atış mesafesindeki (700 m içi)
         hedef hiç bırakılmaz. Eskiden her saniye baştan seçiliyor, 225–600 m'de bile bırakılıyordu. Geçişten sonra
         uzaklaşan ya da tırmanan dal-vur avcısı bağlı değildir (sıradaki dalışı için serbestçe seçer).
      3. Puan: uzaklık önceliklerle orantılı kısalır (bombardıman, görev hedefi, dosta saldıran); sabit metre indirimi
         uzaktakini yanı başındakinin önüne geçiriyordu.

      Kovalanan düşman devriye ya da eskort bölgesinden çıksa da aday kalır. Ölçüm: scratchpad `gorev/hedef.ts` (eski kod
      worktree'si `taban_gorev`); kanat adamının lidere saldıranı kovalaması (kapak doktrini) hedef değişiminin çoğudur,
      hata değildir.
    - Oyuncu emri: seçili avcının panelinde "Hedef ver" (`game.beginAirOrder`, etkileşim `pickAir`, sonra düşmana dokunuş
      `orderTarget`); "Emri kaldır". Hedef düşünce, kol dönüşe geçince, uçak kopunca ya da mühimmat bitince kalkar. Kayda
      yazılmaz. İşlem düğmeleri bilgi panelinde durum satırının hemen altında (telefonda kaydırmadan erişilir).
    - Pilot alışkanlıkları (`habit.ts`, uçak kimliğinden; ortak `Math.random`'a dokunmaz): formasyon istasyonu yavaşça
      salınır (savaş kutusunda az), kanat adamı liderin dönüşüne kendi gecikmesiyle uyar (`brain.follow`, `holdFormation`
      `fwd`), çatışmanın başında kendi tepki süresiyle formasyondan kopar (`engageAt`; dövüşün içindeki hedef
      değişiminde beklemez). Taarruzda elemanlar farklı yönlerden girer
      (`attackYawOf`, `holdPoint` `yaw`), çift hâlinde ve düzensiz aralıkla (`mayStartAttack`). Il-2 taarruzunda uçaksavar
      kaybı 1,9 → 1,2, verilen hasar aynı; 240 dk bot ölçümünde denge değişmedi.
    - Avcı karnesi (`sim:bench`, 4'e 4) çok gürültülü: aynı kodda 24 koşuluk parçalar ±10 puan oynar. Değişiklik
      kararı için en az ~200 koşu (ör. 8 süreç × 24) ve eski kodla aynı anda; 16–96 koşu iki kez yanılttı (2026-11-18).
    - Jet ve ağır savunmalı bombardıman kutusu (`combat.ts` `slashTarget`): taretleri ateş eden B-17 jet için "savunmasız"
      sayılmaz, jet dalıp geçme saldırısını kutunun 3,2 km arkasından başlatır. Eskiden 1,5 km'de, arka uçakların
      nişancı menzilinde dönüp ateş edemeden ağır hasar alıyordu: 4 Me 262 / 9 B-17'de düşen B-17 0,83 → 3,2, mermi
      19 → 46 (jet kaybı ~2,5 aynı). Ölçüm scratchpad `gorev/jet.ts`.
  - `structures/`: üs, uçaksavar, radar, fabrika, şehir yapıları.
    - Zemin: yerleşim, inşaat ve kayıt yükleme aynı işlevle düzleştirir (`structure.ts` `flattenStructure`). Düzleşen
      alan yapının çizilen bütün parçalarını kapsar; hava üssünde yerel x −720…+232, z ±1360 (tel örgü dahil). Tabana
      değen her ızgara hücresi tam düzdür (`terrain.ts` `flattenFootprint`, bir hücre köşegeni taşar), yoksa yapı havada
      kalır. Kalan farkı çizimde `render/ground.ts` kapatır.
    - Kasaba (2026-11-12): harekâtta her taraf bir belediye binasıyla (`townhall`, 5.500 kr, gelirsiz) başlar; önünden ana
      cadde çıkar. Evler ancak kendi yolunun yanına kurulur (`world.roadRules`, yalnız harekâtta; `structure.ts`
      `ROAD_KINDS`). Yollar `sim/roads.ts` (düz parçalar, `world.roads`; `checkRoad` / `placeRoad`, metre başına
      `ROAD_COST`): her parça mevcut bir yoldan başlar, araziyi düzleştirmez, yıkılmaz. Botlar evleri `findLot` ile
      yola dizer, arsa bitince `growRoads` ile sokak açar (yol boyunca her 100 m'de bir kavşak yeri boş kalır). Yolsuz
      eski kayıt yüklenince her tarafa bedava belediye verilir (`save.ts`, `campaign.ts` `foundTown`).
    - Bakım personeli (2026-11-13): her uçak 1 kişi (`economy.ts` `MAINT_CREW`). Hangarda, havada ve fabrika bandındaki
      uçaklar `world.maintOf` ile her seferinde sayılır, `crewFree`'den düşer; sipariş (`orderAircraft`, nedeni `orderBlock`)
      ve pazar alımı boşta kişi ister. Harekât her tarafa 4 evle başlar (16 kişi: 6 bakımcı + 8 uçuş + 2 boş). Bütün
      kalkışlar `launchPackage`'dan geçer, mürettebat orada ayrılır.
      - Kuraldan önceki kayıt (`maintRule` yok) açılınca her tarafa eksik konut bedava kurulur (`campaign.ts`
        `maintHousing`; sokak da bedava uzar): eksik, bakımcılardan eski fazlayla (konut − itfaiye − bütün uçuş
        mürettebatı) karşılanamayan kısım; böylece eskiden kalkan her uçak yine kalkar. Ad sayaçları yüklendikten sonra
        kurulur. Yer bulunamazsa son çare o kadar uçak `noMaint`. Oyuncuya bir kez bildirim (`game.ts` `showMaintGift`).
      - Testler: scratchpad `sehir/test/bakim_test.ts` (59 deneme), tarayıcı `eski_kayit_tel.mjs`, `uretim_tel.mjs`.
    - İtfaiye merkezi (2026-11-12, `structures/fireStation.ts`): yolun yanına kurulur, kadrosu evlerden gelir
      (`personnel.staff`, `crewFree` düşer: kuruluşta 4, seviye başına +2; üç seviye). Alanındaki hasarlı ev, apartman ve
      belediyeye ekip yollardan araçla gider (`roads.ts` `roadPath`; ekip büyüklüğü `FIRE_CREW`, büyük binalar önce),
      elle onarımın yarı fiyatına onarır (`FIRE_COST_RATE`, `world.chargeRepair`; para yetmezse ekip bekler). İtfaiyenin baktığı binada elle onarım açılmaz (`world.fireCovers`); maden, üs, fabrika, radar ve
      batarya yalnız oyuncu onları yola bağladıysa (`roadLinked`: kendi yolu tabanına 17,5 m yaklaşıyor) ve alandaysa itfaiyece onarılır (`fireCrewFor`), yoksa eskisi gibi elle. Ekip yalnız merkezle aynı yol kümesindeki yapılara gider (`stationReaches`, `world.roadComponent`; ikinci belediyenin bağlantısız sokaklarına gitmez). Evler yıkılıp nüfus kadroyu karşılamazsa ekip o oranda küçülür (`world.staffRatio`). İtfaiye üstlenince elle onarım kapanır. Uç durum testleri: scratchpad `sehir/test/itfaiye_test.ts` (38 deneme). Botlar kasaba 6 eve ulaşınca bir merkez kurar, 12 ve 20 evde yükseltir (`commander.ts` `FIRE_HOMES`, `upgradeFire`; araştırma para beklerken yükseltmez). Seviye atlayınca model değişir (`cityModels.ts`
      `firestation`, görünüm yeniden kurulur); araçlar `render/fireVehicles.ts`.
    - Para kalemleri: `world.pay` / `earn` kalem alır (`economy.ts` `MoneyCat`), toplamlar `Team.flow`'da; belediye
      ekranı (`ui/town.ts`) bunları gösterir. Belediye ekranında personel dökümü de var (uçuşta, bakımda, itfaiyede, boşta, yerine gelen). Yeni ödeme ya da gelir eklerken kalemini ver.
    - `airDefense.ts`: silahlar gerçek sistemlerdir (kaynaklar dosyanın başında). Silah kimlikleri (`mg`, `aa88`…) kayıtlara yazılır, değişmez.
      15 top (2026-11-18'de M45 `mg4`, 61-K `aa61k`, 52-K `aa85`, QF 3,7 inç `aa94`, 10,5 cm Flak 38 `aa105` eklendi; kaynaklar ve
      tahmin edilen değerler tanımlarının üstünde). Kaynakların ayrıştığı değer (52-K atış hızı) pratik hızdan seçildi.
      Botların bataryaları iki grupta (`commander.ts` `BOT_GUNS`; sınıf bataryanın takımdaki sırasından, her üçünden biri ağır; üçlüler A ve B arasında değişir, bot hangisiyle başlar rastgele; eskiden genel kimlikten seçiliyordu, kimi botta ağır batarya hiç olmuyordu): A eski toplar, B yeni beşi; B kendi topu
      açılana dek aradaki topu atlar (botlar benzer güçteki topa çevirmekle para harcamasın). 52-K 8,8 cm ile aynı önkoşulda, bot
      onu önce araştırır. 240 dk ölçümünde denge değişmedi; 4 saatte botlar 52-K, M45 ve 3,7 inçi takıyor, gerisi daha uzun oyunda.
      Savunma araştırma sırası bot başına (2026-11-18, `defenseOrder`): ağır top (52-K ya da 8,8 cm) sırada 4.–7. (eskiden hep 7.), yarısında
      radardan önce; öteki işler ±1 sıra kayar. Ana üssün yerinden tohumlanır (her harekâtta farklı, kayıtta aynı). 18 botluk ölçümde ağır top
      14 botta takılı (eskiden 12'de 8), ilk takılış 152–239. dk; kazanç ve filo aynı.
      - Boya (`structures.ts` `GUN_PAINT`): ordusunun belgeli rengi: Alman koyu gri (RAL 7021), Flak 41 kum sarısı (RAL 7028), ABD
        ve Bofors zeytin yeşili, Sovyet 4BO yeşil, 3,7 inç Khaki Green No. 3, Oerlikon gemi grisi. Ayrıntılar yalnız gerçekte
        olanlar: halka nişangâhlar, kalkanlar, veri alıcı kadranları, M2'nin su kabı, mevzide hazır mermi (pirinç kovan; mermi
        boyası belirsiz olduğu için koyu çelik). Top başına 600–1.750 üçgen.
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
    - Yeni üs yapıları `|x| ≤ 400` içinde kalsın: simülasyonun üs alanı bu (dışına başka yapı kurulabiliyor). Üssün
      çizimi düzleşen alanın dışına taşarsa `flattenStructure`'ı da güncelle.
  - `roads.ts`: şehir yollarının şeridi (araziyi izler, arazi değişince yeniden oturur; yol boyunca ağaç temizlenir),
    yol önizlemesi ve yerleşim ızgarası (`BuildGrid`: 5 m, `sim/roads.ts` `GRID`). İnşa ederken ızgara açıkken yapı
    ızgarada gezer, şehir yapıları yola dizilip ön cephesiyle yola döner (`game.ts` `refreshBuild`); alt çubuktaki
    Izgara düğmesi (X) serbest yerleşime geçirir (`warsim.grid`). Yerleştirirken model
    ya da silüet gösterilmez, yalnız süslü taban işareti (`FootprintGhost`; 2026-11-12 kararı: hangi tasarımın geleceği
    kurulunca belli olur). Çizici logaritmik derinlik kullanır: kendi
    gölgelendiricisi olan ağ derinlikte kaybolur, standart malzemeyi `onBeforeCompile` ile genişlet.
  - `ground.ts`: yapıyı araziye oturtur (eğime göre). Düz alanın dışında kalan ya da yanına kurulan yapının
    düzleştirmesiyle arazisi değişen parçalar inilir: ince parçalar (arsa, yol, çit) eğimi izler, gövdeler bütün olarak
    kayar ve alt köşeleri toprağa uzar, çatılar altlarındaki gövdeyle gider. ArchBatch parça bilgisini (`userData.parts`)
    kullanır. Yeni yapı kurulunca yakındakiler yeniden oturtulur (`gameRenderer.ts` `syncStructures`).
    Yere yatan geniş ince parçalar (asfalt, beton, arsa, toprak saha, pist; 40 m'den geniş) `arch.ts` `drape` ile üst yüzü
    35 m'lik üçgenlere bölünür: eğimde ve tümsekte ortası toprağa gömülmez (2026-11-13; üssün düzleşen alanının kenarında 8 m'ye
    kadar gömülüyordu). Gövdeler (bina, hangar, fabrika) bölünmez. Daha sık bölme telefonda üçgeni çok artırıyor.
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
  - Diğerleri: `terrain.ts`, `scenery.ts` (yakın ağaç, kaya, çiftlik), `palette.ts`.
  - **Harita süsleri** (2026-11-13, `decor.ts`): haritanın dekor şehirleri, sokakları, şehirleri bağlayan yollar ve yol boyu
    köyler kaldırıldı (yalnız çizimden: `CITIES` arazinin düzlüklerini ve başlangıç yeri kuralını biçimlendirmeye devam
    eder, eski kayıtlar bozulmasın; arazi örtüsü `cities: []`). Yerine her harekâtta az sayıda süs: küçük köyler (toprak
    yol, yola bakan evler, kuyu, ahır; bazen bir ev yıkık), tek çiftlik evleri, yıkık evler, terk edilmiş maden ocakları
    (200 km'de ~5 köy, ~9 ev, ~3 maden; alanla ölçeklenir). Yerler ana üslerden tohumlanır (aynı kayıt aynı süsler), ana
    üslerden ≥14 km, birbirinden ayrı, düz ve kuru yerde. Yalnız görüntü: üstüne yapı kurulan süs gizlenir
    (`landcover.ts` `builtNear`), kapladığı yere ağaç konmaz (`setDecorClearings`). Modeller `cityModels.ts`
    (`buildDecorModel`: `ruin`, `oldmine`, `barn`, `well`; köy evleri `buildCityModel`); bir süs tek ağ (`ArchBatch.setOrigin`),
    yıkık parçalar hasar gölgelendiricili ikinci malzemede, zemin ve bitki sağlam malzemede. Köylerin ~%65'i ve tek evlerin yarısı gece ışık yakar (sokak lambası, kuyu feneri, pencere); ötekiler karartmada (`setArchLit` 0). Haritada sönük işaret (`.dlabel`, `updateLabels`): 9 km'den yakında simge ve ad (Köy, Çiftlik evi, Yıkık ev, Terk edilmiş maden), uzakta yalnız simge; etiketler kapalıysa ya da üstüne yapı kurulduysa yok. Kurulum kare başına ~5 ms
    dilimle, kameraya yakın olan önce; kameradan 16 km ötesi ve harita görünümü çizilmez.
  - `groundTex.ts` (2026-11-13): açılışta üretilen 256 px'lik karo doku. Arazi iki ölçekte okur (her kalitede: ucuz;
    yordamsal arazi dokusu yalnız Yüksek'te kalır), ağaç taçları bir kez (`scenery.ts` `leafy`). Ağaç geometrileri
    `props.ts`: taç köşeleri ton taşır (alt koyu, üst açık); yakın yapraklı ağaç 68, iğne yapraklı 32 üçgen.
    - Taç normalleri öbek merkezinden dışa (`roundNormals`; ağaç malzemelerinde `flatShading` yok): köşeli taç "oyuncak"
      gibi duruyordu (2026-11-17). Yapıların ağaçları (şehir, çiftlik, üs; az sayıda) `broadleafGeo(renk, true)`: ince
      bölünmüş, gürültüyle bozulmuş öbekler ve dallar; arch yüzeyi `SURF.leaf` (gövde köşe rengi kırmızıya yakın olduğu
      için ayrılır). Çiçek tarhları `SURF.flowers` (yaprak zemininde çiçek benekleri; düz renkli küp değil).
  - **Boş arazi ağaçlı** (2026-11-10): `landcoverGen.ts` ormanın dışındaki açık araziye de seyrek ağaç ve koru yazar
    (`open`, tarla, şehir, üs yeri, ağaç sınırı ve uçurum hariç). Yakın ağaçlar `scenery.ts`'te çiftlik ve süs (`decor.ts`)
    çevresine dikilmez (`keepOut`, 40 m hücre; `buildSettlements` doldurur). Yalnız görüntü: sim arazisi değişmez.
  - **Çiftlikler** (2026-11-17, `farms.ts`): yerleri `scenery.ts` seçer (`farmSpots`, `farmVersion`; üstüne yapı kurulunca
    liste yenilenir). Kameradan 3,2 km'ye kadar ayrıntılı model (`cityModels.ts` `farmyard`, `farmBarn`, `silo`, `coop`,
    `paddock`, `orchard`; çiftlik evi şehir evi), ötesinde örneklenmiş kutular. Model görününce o çiftliğin kutuları
    gizlenir. Kurulum kare başına dilimle, ~8.500 üçgen, tek kurulum ~15 ms.
  - Kayalar `props.ts` `rockGeos`: üç biçim (yuvarlak, yassı, sivri), 36 üçgen (on iki yüzlü). Binlerce kaya var: 80 üçgen
    ekranı ~130 bin üçgen ağırlaştırıyordu. Taş dokusu `scenery.ts` `stony`.
  - Bomba, roket, paraşüt `munitions.ts` (köşe renkli tek geometri).
  - **İnşaat görünümü** (`construction.ts`, `structures.ts` `sync`): bina yerel kırpma düzlemiyle yerden yükselir
    (`renderer.localClippingEnabled`). Ana gövde inşaatın %90'ında tamamlanır, baca ve kuleler son %10'da. Her binanın
    çevresinde ahşap iskele, büyük yapıda vinç ve malzeme yığını; hava üssünde iskele yok.
    - Bina gövdesi `ArchBatch`'in parça başına yüzey türünden bulunur (`userData.surfs`).
  - Hava üssü ve fabrika ayrıntıları (`structures.ts`): `watchOffice`, `airfieldFire`, `fuelFarm`, `fuelBowser`,
    `aircraftTractor`, `starterTrolley`, `windsock`, `latticeMast`, `waterTower`, `bombTrolley`.
    - Üs ~89 bin (araçlarla), fabrika ~36 bin üçgen (öncesi 50 ve 23 bin).
    - Üs araçları `airfieldVehicles.ts`: tanker, çekici, ambulans, akü arabası. `y` zeminin kotudur: apron betonu
      0,9 m, araç hangarı 0,3 m; eskiden y=0'dı, araçlar betona gömülüyordu.
  - Yıpranma `arch.ts` (`COLOR`, hasarın önünde; üçgen maliyeti yok): duvar dibinde kir, üst kenardan yağmur izleri,
    köşe gölgesi, geniş çatılarda leke. Bütün yapılara uygulanır.
  - Kemer çatılı yapıların (ambar, Nissen, cephanelik) alın duvarı `archWall` ile kemer biçiminde, kapı duvar yüzünde:
    kutu duvar kemerin dışına taşıyordu (2026-11-17). Fabrikanın üç ambarı ayrı (30 m, 40 m arayla; eskiden iç içeydi).
  - **Güneş gölgesi** (2026-11-17, `shadows.ts`): yalnız Yüksek kalitede, Ayarlar → Grafik → Güneş gölgesi
    (`graphics.shadows`). Gölge düşüren ve alan bayrakları yeniden çizimde konur (`mark`: yapılar, çiftlikler, süsler;
    opak Lambert/Standard düşürür, arch malzemesi alır); arazi parçaları ve yollar hep alır. Gölge haritası her karede
    çizilmez: kamera kayınca, yakınlaşınca, ışık dönünce, en geç saniyede bir. Işık her kare gölge alanının ortasına
    taşınır, yön `atmosphere.lightDir`'dedir (`sun.position` artık yön değil). İnşaat kırpması gölgede de geçerli
    (`clipShadows`). Yalnız yakınlaşınca açık (kamera 2,2 km'den yakın, 2,6 km'de kapanır; `NEAR_ON`/`NEAR_OFF`): asıl
    maliyet gölge alan her pikselin 16 örneği. Telefon çözünürlüğünde (2532×1170, masaüstü ekran kartı) 1,5 km'de +1,5 ms,
    700 m'de ~+0,7 ms; strateji görünümünde (her yere gölge alırken) 4,6 → 8,6 ms idi.
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
    Oyunun içinden konu listesi (2026-11-13, `openTopics`): üst çubuktaki düğmelerin en solundaki Öğretici (telefonda yalnız
    simge) ve duraklatma menüsü. `TOPICS` adımları konulara böler; ana maddeye basınca yalnız o konunun adımları bu harekâtın
    içinde çalışır, bitince liste "izlendi" işaretiyle yeniden açılır; alt maddeler yalnız göstermek ve aramak için. Yeni
    adım eklenince `TOPICS`'e de yaz. Ana menünün üst çubuğunda da aynı düğme (2026-11-18, telefonda yalnız simge): orada
    listede ana menü konusu (menüde yürür, dil değişip sayfa yenilense de sürer) ve baştan sona tur da var; oyun konusu
    seçili ayarlarla harekâtı başlatır, konu oyun yüklenince başlar (`mainMenu.ts` `launch` `started`). Denemesi: scratchpad
    `menu_ogr.cjs`. `deep` adımlar (etkileşimli: kamera oyuncunun yapısına uçar `flyToOwn`, oyuncu dokunup seçer, sol panelden ilgili pencereye girer) hem baştan sona turda hem konularda; tur 65 adım (~10 dk). Konu turu denemesi: scratchpad `sehir/decor/konu_tur.cjs`. Liste çelik temanın koyu renklerinde; her konu kartının arkasında oyunun kendi sahnesi (`public/ogretici/<konu>.webp`, 900×300; üretimi scratchpad `sehir/decor/kart_gorsel.cjs`: harita, maden, kasaba, itfaiye ve fabrika oyundan çekilir, görev, araştırma ve savaş açılış görsellerinden kırpılır). Admin paneli gibi açık ve düz görünüm reddedildi (2026-11-13).
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
  - Android geri tuşu (2026-11-19, Play'deki TWA ve telefon tarayıcısı; `bindBackButton`): geçmişe nöbetçi kayıt (`history.state.wsb`)
    konur, geri tuşu popstate verir: Esc gibi en üstteki pencere kapanır (`onBack`, oyunda `escapeInPlay`), oyunda boştaysa
    duraklatma açılır; geri tuşu oyundan çıkmaz. Ana menüde boşta ilk basış uyarır, ikinci basış çıkar. Chrome dokunuşsuz eklenen
    geçmiş kaydını geri tuşunda atlar: nöbetçi ilk dokunuşta ya da tuşta konur. Sayfadan ayrılan her şey (yeniden yükleme, aynı
    sekmede bağlantı) `game.leavePage` ile gider: önce nöbetçi geri alınır, yoksa dönüşte geri tuşu oyunu yeniden yükler. Yeni
    açılır pencere eklenince `onBack`'e de ekle. Deneme: scratchpad `geri.cjs`.
- **İnternetsiz oyun** (2026-11-19):
  - Service worker derlemede üretilir (`tools/sw/vite.ts` → `dist/sw.js`; `main.ts` yalnız derlenmiş sürümde, açılıştan 4 sn
    sonra kaydeder; `public/_headers` `no-cache`). Önbelleğe oyunun sayfası, `assets`, `sounds`, `uretim`, `ogretici`, `acilis` ve
    kökteki simgeler girer (~6 MB); ansiklopedi, haber görselleri, yasal sayfalar ve `/api` girmez. Oyunun sayfası önce ağdan
    (4 sn), öbürleri önce önbellekten. Önbellek adı dosyaların özeti; en son iki sürüm kalır. Oyunun çalışması için yeni bir
    klasör gerekirse `DIRS`'e ekle.
  - Skor bildirimi gönderilemezse cihazda, hesaba bağlı bekler (`net/statsOutbox.ts`, `warsim.stats.outbox.v1`): aynı harekâtın
    bildirimleri birleşir, oyun açılınca, `online` olayında ve sonraki bildirimden önce sırayla gider. O zamana dek tabloya
    girmez; Profil "henüz gönderilmedi" satırıyla gösterir. Sunucu (`reportStats`) oynama süresini son bildirimden bu yana geçen
    süreyle kırpar: birikmiş süre kırpılabilir.
  - Profilin son hâli cihazda saklanır (`persist.ts` `PROFILE_KEY`, e-postasız); internetsizken o gösterilir. Skorlar sekmesi
    internetsizken tablo yerine bilgi yazısı gösterir. Kayıtlar zaten önce IndexedDB'ye yazılır, bağlantı gelince yüklenir.
  - Deneme: scratchpad `internetsiz.cjs` (sunucu kapatılarak; `W`/`H` ile ekran boyu).
- **Android (Google Play, TWA)** (2026-11-19): paket `com.warsimbox.app`, siteyi tam ekran açan kabuk; oyunun kendisi sitedir,
  site güncellenince uygulama da güncellenir. Paket repoda değil: `C:\Users\Helss_0\warsimbox-android` (Bubblewrap core,
  JDK 17, Android SDK; üretim `tools/uret.cjs <versionCode> <versionName>`, çıktı `cikti/`). Yükleme anahtarı `anahtar/`
  (şifresi `sifre.txt`; ekrana, repoya ve günlüğe yazma). Site, `public/.well-known/assetlinks.json` ile uygulamayı tanır:
  yükleme anahtarının ve Play'in uygulama imzalama anahtarının SHA-256'sı orada olmalı, yoksa uygulama adres çubuğuyla açılır.
  Yeni paket yalnız kabuk ayarı (ad, simge, renk, yön) değişince gerekir; `versionCode` her yüklemede artar.
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
  - Hesap silme sayfası (`/hesap-silme/`, `/en/account-deletion/`; Google Play'in istediği herkese açık adres): adımlar, silinen
    ve kalan veriler. Kabul edilen metin değildir (`LEGAL_VERSION` değişmez); silme akışı ya da `eraseAccount` değişirse güncelle.
    Profil'deki silme formu bağlanır.
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
