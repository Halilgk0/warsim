# WarSimBox — Tasarım ve Yol Haritası

## Vizyon

Yukarıdan bakılan, pastel ve sade bir fetih oyunu: üs kur, üret, araştır, savaş. Oyunun asıl derinliği
**hava gücünde**: herkes erken pervanelilerle başlar, teknoloji ve araç ağaçlarıyla 5. nesil jetlere kadar ilerler.
Önemli olan uçakların ve hava savunmasının **gerçekçi davranması**.

## Teknoloji

- **TypeScript + Three.js + Vite**, tarayıcıda çalışır. `npm run dev` → http://localhost:5173
- Simülasyon (`src/sim`) render'dan tamamen ayrıdır; Node'da başsız test edilebilir.
- Sabit adım: 60 Hz simülasyon, hız çarpanı (1×–32×).
- `tsc` sıkı ayarlarla temiz (kullanılmayan değişken/parametre de hata sayılır).

## Mimari

```
src/
  core/math.ts               ortak matematik
  sim/                       OYUN MANTIĞI (render bilmez)
    atmosphere.ts            standart atmosfer: yoğunluk, ses hızı, gösterge hızı, Mach
    terrain.ts               1024×1024 yükseklik ızgarası (≈146 m hücre), görüş hattı, düzleştirme
    mapData.ts               150 km harita: üsler, fabrikalar, şehirler
    tech.ts                  araştırma: modifikasyonlar, araç ağacı, hava savunma, radar; iki hat + savaş puanı
    mods.ts                  modifikasyon etkileri (güç, kritik irtifa, zırh, nişangâh, mühimmat …)
    intel.ts                 takım istihbaratı (radar + gözcü temasları)
    commander.ts             rakip yapay zekâ + alarm kolu
    world.ts                 mermi, roket, bomba, flak, hasar sonuçları, paraşüt, enkaz, inşaat, görevler
    scenarios.ts             harekât + 10 it dalaşı + 5 saldırı/savunma senaryosu
    aircraft/
      specs.ts               gerçek uçak katalogu (29 uçak + 5 sonraki nesil yer tutucu), performans türetimi
      aero.ts                kaldırma, sürükleme (dalga dahil), pervane/jet itkisi, yuvarlanma, yakıt akışı
      flightModel.ts         uçuş modeli, yerde koşu, motor devri, acil güç, vrille
      pilot.ts               otopilot: yer koruması, Mach ve yatış sınırları
      damage.ts              bileşen hasarı, yangın, radyatör/yağ, infilak
    ai/                      kol, beyin, dalaş (BFM), pike, taarruz, yatay bombardıman, taret, pist operasyonları
    structures/              hava üssü (+tesisler), uçaksavar bataryası, radar, fabrika, şehir yapıları
    aircraft/ammo.ts         mermi kuşakları (standart, yangın/infilaklı, zırh delici, iz mermisi)
    aircraft/stores.ts       dış yük: mühimmat katalogu, uçak başına askı noktaları, hazır yükler, doğrulama
  render/
    terrain.ts               parçalı arazi (16×16 parça, 3 ayrıntı düzeyi), orman/tarla/kaya/şehir zemini renkleri
    landcover.ts             arazi örtüsü ızgarası: orman yoğunluğu, tarla parselleri, eğim (yalnız görsel)
    scenery.ts               3B ağaçlar ve kayalar (parça parça, kameraya yakın), A* ile yollar, köyler, çiftlikler, dekor şehirleri
    props.ts cityModels.ts   ağaç/kaya/çatı geometrileri; konut, apartman, çarşı, iş merkezi, ambar, park modelleri
    models.ts                parametrik uçak modelleri: cam kanopi, koyu pervane/egzoz, karın boyası, armalar, iniş takımı
    structures.ts            hava üssü, ayrıntılı uçaksavar silahları, radar istasyonu, fabrika kompleksi
    effects.ts               duman, patlama, iz mermisi, roket, enkaz, paraşüt
    thumbs.ts                uçak küçük resimleri ve üstten siluetler (araştırma panosu, listeler)
    gameRenderer.ts camera.ts palette.ts
  ui/                        hud, panels, research, planner, build, modals, hangar, settings
```

## Uçuş fiziği (gerçek veriye dayalı)

- Her uçak gerçek kütle, kanat alanı/açıklığı, CLmax, motor (güç ve kritik irtifa ya da itki), silah ve yük verisiyle tanımlanır.
- **Cd0 kalibrasyonu:** bilinen azami hız ve irtifasında itki = sürükleme olacak şekilde parazit sürükleme çözülür.
  Tırmanış, tavan, sürekli dönüş süresi, seyir hızı ve menzil aynı modelden türetilir (hangar ekranında grafikle).
- **Atmosfer:** yoğunluk irtifayla düşer → yüksekte daha az G, daha geniş dönüş; ses hızı sıcaklıkla düşer.
- **Pistonlu motor:** kritik irtifaya kadar ~sabit güç (motor başına deniz seviyesi oranıyla), üstünde yoğunlukla düşer.
  Pervane verimi yüksek Mach'ta düşer. **Jet:** itki yoğunlukla azalır, motor devri gecikmeli oturur (Jumo 004 çok yavaş).
- **Mach:** kritik Mach üstünde dalga sürüklemesi (Lock kuralı), buffet (CLmax düşer), Mach tuck (yunuslama kumandası kaybı).
  Pilot kritik Mach'ı aşınca gazı keser ve dalışı yumuşatır.
- **Kütle:** yakıt yandıkça ve bomba atıldıkça uçak hafifler; kanat yükü ve kullanılabilir G değişir.
- **Yuvarlanma** gösterge hızına bağlı: yavaşta etkisiz, çok hızlıda kanatçık ağırlaşır (Bf 109 / Spitfire ağır, Fw 190 çevik).
- **Acil güç (WEP)** araştırmayla açılır, en fazla 5 dk. **Pilot yorgunluğu:** uzun süre 4,5 G üstü çekmek G sınırını düşürür.
- **Vrille:** tutunma eşiğinde uzun süre çeken pilot (acemide daha olası) vrilleye düşer; alçakta düşerse rakibine "manevra düşürmesi".

## Hasar ve sonuçlar

- İsabet yöne göre bileşene düşer: motor, kumanda, kanat, yakıt deposu, pilot, gövde.
- Sıra motorlarda radyatör isabeti → hararet → motor kilitlenir. Motor durursa: süzülme menzili üsse yetmiyorsa pilot atlar ya da zorunlu iner.
- **Sonuç dağılımı (başsız ölçüm, 10 dalaş senaryosu × 20 koşu):** düşürme ≈ %69, havada infilak ≈ %17, kaçış ≈ %13.
  - Düşüş biçimleri: sarmal, burun üstü dalış, pilot ölünce süzülme, kanat kopunca savrulma; mürettebat paraşütle atlayabilir.
  - İnfilak: top mermisi depoyu ya da bomba yükünü patlatır, ağır son isabet, depoya ulaşan yangın, dalışta yapısal aşım.

## Araştırma

- İki hat aynı anda: **teknoloji** (modifikasyon, hava savunma, radar) ve **araç** (uçak). Süre oyun zamanında akar.
- Süreler dönemle büyür: erken pervaneli geliştirmeler 3–5 dk, gelişmiş pervaneli 5–11 dk, jet teknolojileri 10–20 dk;
  uçaklar rütbeyle (Spitfire I ≈ 8 dk, Spitfire IX ≈ 15 dk, F-86 ≈ 30 dk).
- **Savaş puanı:** düşürme, yapı isabeti ve dönen görevlerden kazanılır; havuzdan harcanarak araştırmayı 2 kata kadar hızlandırır.
- **Modifikasyonlar** (3 dönem × 5 kategori: motor, gövde ve zırh, silah, nişan ve elektronik, yakıt ve menzil):
  ör. 1. dönem sabit devirli pervane → V12 → 100 oktan; kendini sızdırmaz depo; refleks nişangâh; 2. dönem iki kademeli
  süperşarj, su-metanol, kabarcık kokpit, laminer kanat, jiroskoplu nişangâh; 3. dönem turbojetler, ok kanat, fırlatma koltuğu.
- **Araç ağacı:** 6 hat (dönüş avcısı, enerji avcısı, ağır avcı, taarruz, pike, bombardıman), 6 rütbe + sonraki aşama.
  Başlangıç: Hurricane I, Bf 109 E, Ju 87 B, He 111. Bir uçağı açmak için yalnız **temel** şeyler gerekir: hattaki önceki
  uçak ve uçağı mümkün kılan motor/kanat teknolojisi (ör. F-86 için ok kanat, P-51D için laminer kanat + iki kademeli
  süperşarj, Me 262 için eksenel turbojet). Donanım (nişangâh, hidrolik kumanda, kabarcık kokpit, acil güç, G elbisesi,
  silah geliştirmeleri…) uçağı açmaz; araştırıldıkça **uygun olduğu** uçakların değerlerine eklenir (radar nişangâhı ve
  fırlatma koltuğu yalnız jetlere, G elbisesi avcı pilotlarına, taret geliştirmeleri taretli uçaklara). Hangarda ve araştırma
  dosyasında her uçağın "Geliştirmeler" listesi araştırılmış/araştırılmamış gösterilir. Her taraf kendi araştırmasını yapar:
  oyuncunun açtığı yalnız onun uçaklarına, botların ve diğer oyuncuların kendi açtığı kendilerine uygulanır.
- **Hava savunma:** araştırma yalnız kullanılabilir yapar; her bataryaya ayrıca kurulur (batarya panelinde kendi ağacı).
  Silahlar: 12,7 mm → 20 mm → dörtlü 20 mm → 37 mm → 40 mm Bofors → 88 mm → 128 mm (13 km). Taraf geneli: gelişmiş
  mühimmat (+%15 hasar), topçu okulu (+%22 mürettebat), kamuflaj (bataryaya bomba hasarı −%25). Tahkimat 4 seviye
  (seviye 4: dış halkada iki ek yuva, toplam 8). Ağır silahlar birden çok önkoşul ister.
- **Son pervaneliler (2. aşamada):** jet yıllarında yapılmış güçlü pervaneliler — Sea Fury, F8F Bearcat, F4U-4 Corsair,
  AD-4 Skyraider, A-26 Invader, B-29 Superfortress. Jet şeridinin yanında, aynı aşamada araştırılır.

## Görev planlama

- Planlayıcı yalnız göreve anlamlı ayarları gösterir (`MISSION_FIELDS`): önlemede irtifa/rota/hız yok (tam güç, hedefin
  irtifası), eskortta irtifa ve rota korunan koldan alınır, pikede alçak uçuş yok.
- **Görev paketi:** aynı göreve birden çok tip. Her tip kendi kolunu kurar; kollar toplanmayı birbirine bekler, intikalde
  öndeki kolu kademeli izler ve en yavaş tipin hızında uçar. Eskortlar saldırı kollarına sırayla dağıtılır.
- **Mühimmat:** her uçağın askı noktaları var (gövde altı, kanat altı çiftleri, roket rayları, iç bomba bölmesi, kanat
  ucu); askı başına kg/adet sınırı (ağır bomba askısı araştırması sınırı yükseltir) ve uçağın azami yükü. Katalog: Alman
  SC, Sovyet FAB, İngiliz/Amerikan libre bombaları, RS-82/RP-3/HVAR roketleri, 200–870 L tanklar, top gondolu.
  Planlayıcıda hazır yükler ya da **serbest yükleme** (askı başına mühimmat + adet, toplam yük çubuğu); göreve ve hedefe
  göre önerilen yük hazır gelir. Modelde mühimmat askısında görünür ve bırakıldıkça eksilir. Jetlerin füze/pod yükleri
  aynı düzene eklenecek.
- **Önleme izi:** emir verilirken hedefin konumu ve hızı alınır; radar/gözcü/kendi gözü gördükçe tazelenir, görülmezse
  rotası kestirilir (bombardıman 5 dk, avcı 1 dk). Tahmini konuma varınca 3 dk arar; hedef düşerse kolunun diğer
  uçaklarına ya da bölgedeki düşmana geçer.
- **Görev dağılımı** (`TASK_SPLIT`, planlayıcıda "Görev dağılımı" bölümü): bir tipin uçakları iki işe ayrı kollar olarak
  kalkar. Devriye/tarama/önlemede "4 eskort avcılarına · 2 bombardımana" (bombardımana ayrılan kol yalnız kendine
  saldıranla çatışır; diğeri eskortları bağlar ve onu korur); "Otomatik"te kol kendisi böler (bombardıman + eskort
  görünce ilk çift eskortlara, kalanı bombardımana). Eskortta "serbest avcı · yakın eskort" (eski Yakın/Serbest düğmesinin
  yerine, tip başına); bombardıman paketindeki eskort tipleri için de aynı. Taarruz ve pikede "asıl hedefe · uçaksavara":
  bastırma kolu önce hedefin 3,5 km çevresindeki bataryalara saldırır, kalmayınca asıl hedefe geçer. Botlar da kullanır:
  dörtlü eskortun bir çifti yakın eskort; uçaksavarla korunan hedefe taarruz/pikede uçakların üçte biri bastırmaya.
- **Başarı tahmininde yük ↔ hedef** (`expectedStrikeDamage`): kuvvetin her bombası/roketi için beklenen hasar, düşüş
  noktası Rayleigh(σ) dağılımıyla (pike σ ≈ 20 m + 0,15·R, taarruz 35 m + 0,15·R, yatay ~32 m/km irtifa) ve
  explodeGround'un sönümüyle hesaplanır; gereken hasarla (%10–15) karşılaştırılır (yetmezse −30…−6, iki katıysa +6).
  Savunmasız hedefe ölçülen verimle ±%30 uyuşur (Ju 87 tam yüküyle fabrikaya ~%12, madene ~%23; He 111 ×3 fabrikaya
  ~%29). Planlayıcıda "Beklenen hasar ≈%21 (gereken %12)" / "Yük hedefi yıkmaya yeter" satırı.
- **Tarayıcı denemesinden düzeltmeler**: formasyona katılan uçağın tırmanış açısı hızına göre sınırlı (bombalı Ju 87
  paket liderinin 5 km gerisinde tutunma hızının üstünde asılı kalıyordu; sıkı formasyonda yalnız avcı dışındaki
  uçaklara — avcı kol düzenine uygulanınca Hurricane–Bf 110 karnesi %47'den %38'e düşüyordu); Esc ile haritadan
  seçim bitince planlayıcı yeniden çizilir; yakın eskort koruduğu kol düşerse paketteki
  diğer saldırı kolunu korumaya geçer (eve dönüyordu); aktif görevler panelinde ve seçim panelinde kolun görevi
  ("Eskort (yakın eskort)", "Pike bombardımanı (uçaksavar bastırma)") yazar; kol adları takımın ayırt edici baş harfleriyle
  (Mavi ve Mor ikisi de "M1" oluyordu → "Ma1", "Mo1"); hangar/araştırma "Geliştirmeler" listesi motor tipi ve görevle
  süzülür (sıra motorlu avcıya radyal motor, avcıya bomba nişangâhı önerilmez; motorlu taret yalnız bombardıman uçağına).
- **Eskort zikzakı** (`escortWeave`): eskort korunan kolun hızında asılı durmaz; kendi seyir hızında istasyonun iki
  yanına S dönüşleriyle uçar (Stuka eskortu 285 → ~440 km/sa). Bombardıman hızında baskın yiyen 109 E'ler yavaş dönüş
  savaşına düşüp RAF avcılarına ~2'ye 1 kaybediyordu; şimdi ~1'e 1.
- **Alarm** (`alertScramble`): bombardıman kolu için önleyicinin kalkıp kolun irtifasına tırmanma süresi (`timeToAltitude`,
  Fw 190 A-5 7 km'ye ~11 dk) boyunca kolun yaklaşacağı mesafe kadar erken kalkılır. Erken ihbar ancak radarla mümkün;
  radarsız savunma kolu gözle görünce kalkar ve geç kalır. B-17 baskını senaryosuna Kırmızı radarı eklendi.

## Şehir ve personel

- İnşa menüsünde ayrı sekme: ev, apartman, çarşı, iş merkezi, ambar ve depo, park. Binalar yan yana ve art arda
  yerleştirilir (12'ye kadar sıra, 4'ü aynı anda ilerler).
- **Personel:** 1 ev = 4 kişi, 1 apartman = 16 kişi. Her kişi bir pilot/mürettebattır; uçak mürettebatı kadar kişiyle kalkar
  (Spitfire 1, Ju 87 2, He 111 5, B-17 10). Uçaklar personelsiz üretilir ama eksikse hangarda bekler. Düşen uçağın
  mürettebatı kaybedilir; paraşütle ya da zorunlu inişle kendi bölgesine inen geri döner, esir düşen kaybolur. Kayıplar
  konut kapasitesine kadar 30 sn'de bir kişi gelerek yerine konur. Harekâtta iki taraf 40 kişiyle başlar; rakip
  yapay zekâ ihtiyaç duydukça ev kurar. Çarşı, iş merkezi ve depo ekonomi aşamasında gelir getirecek.

## Ekonomi

- Para birimi **kr**. Harekâtta her taraf 25.000 kr ile başlar; diğer senaryolarda para kuralları kapalı (her şey ücretsiz).
- Gelişme zorlaştırıldı (2026-10-19): yapı, üs tesisi ve uçaksavar fiyatları ×1,5, uçak fiyatı ×1,3, araştırma ×1,4;
  gelirler kısıldı (aşağıdaki oranlar güncel). **2026-10-21:** üs yıkma (oyunun ilerleyişi) yarı sürede olsun diye uçak,
  yapı, üs tesisi, uçaksavar işleri ve araştırma %30 ucuzladı; gelir oranları değişmedi.
- **Giderler** (hepsi peşin): inşaat (ev 550 … maden 6.300 … hava üssü 18.900), üs tesisleri, uçaksavar kurulumu ve yükseltmeleri,
  araştırma (süreyle; uçakta uçağın fiyatı + süre), uçak üretimi (fiyat boş kütle, motor gücü, mürettebat, taret ve
  nesilden). Para yetmezse iş başlamaz; araştırma sırada "para bekleniyor" durumunda kalır, para birikince başlar.
  İptallerde iade: fabrika siparişi kalan kısım kadar, araştırma kalanın %80'i.
- **Gelirler:** düşürülen düşman uçağı (fiyatının %20'si), yıkılan düşman yapısı (maliyetinin %25'i), maden 6 kr/sn × verim, pazarda uçak satışı
  (fiyatın %45'i, yıpranma düşürür), **maden ocağı** (pasif).
- **Maden ocağı:** verim yerden yere çok değişir (çok zayıf … zengin damar, 0,1–2,2 kat) ve haritada görünmez; kurulana
  dek bilinmez. Damar kuşakları birkaç km boyunda, iki tarafın bölgesinde benzer dağılım. Ocaklar arası ≥ 2,5 km, her
  yeni ocak %30 pahalı; hasarlı ocak az üretir. (İleride verimi önceden gösteren bir araştırma/özellik gelecek.)
- **Onarım** (2026-10-21): hasarlı yapı panelinde "Onar" (bot kendiliğinden, hasar %10'u geçince). Tam onarım inşaat
  bedelinin %80'i ve 6 saat (`REPAIR_TIME`, hasarla orantılı; hava üssü saatte ~%17), bedel adım adım ödenir (para
  yetmezse bekler, defterde 30 sn'de bir "Onarım"); yapı vurulursa onarım 10 dk bekler (`REPAIR_DELAY`): baskınlar
  arasındaki hasarı geri getirir ama süren bir kuşatmayı silmez. 3 saatlik tam onarımda (5 dk bekleme) hiçbir üs
  yıkılamıyordu. Hava üssünün canı 3.000 → 1.600 (tek bombayla yine düşmez; 2 Ju 87'lik kol ~%10 götürür).
- **Pazar:** tarafsız ülkeler (İsveç, İsviçre, İspanya, Portekiz, Arjantin, Türkiye) birkaç dakikada bir oyuncunun
  dönemine yakın uçaklar teklif eder; araştırılmamış tipler daha pahalıdır ama hemen kullanılabilir. Hangardaki hazır
  uçaklar satılabilir. Üst çubukta hazine çipi (M): kasa, son 1 dk gelir, madenler, defter.
- Rakip yapay zekâ da öder (`commander.ts`). **Bütçe payları** (2026-10-21): gelirin %35'i yatırım fonuna (maden, yeni
  hava üssü, fabrika), askeri ihtiyaç varken %30'u askeri fona; kalanı ve dolan fonların taşanı araştırmaya,
  yükseltmelere ve fazla uçağa. Eskiden madenin bütün parası yedekte tutuluyordu: botlar oyunun çoğunu
  maden parası biriktirerek geçiriyor, 90 dakikada hâlâ ilk uçakları uçuruyor, filoları 9'dan 5–7'ye iniyordu.
  - **Askeri ihtiyaç** sırası (`nextNeed`): 4 avcı, ilk uçaksavar bataryası, 2 saldırı uçağı, radar (araştırılmışsa),
    kalan bataryalar (zamanla 1 → 4), kalan saldırı uçakları (12 dakikada bir, 2 → 10) ve avcılar (6 → 12). Filo yarının altına inerse
    acil: sıradaki uçağın parası hemen ayrılır. Saldırı uçağı olarak pike/taarruz uçağı; ağır bombardıman ancak kasa
    bolsa (He 111 bir Ju 87'nin 2,5 katı). Radar araştırılmadan istenince askeri fon onun parasını tutup her şeyi
    bekletiyordu.
  - **Yerleşim:** bataryalar korudukları yerin dibine: pistin açık yanı (tel örgünün dışı; 20 mm buradan bütün pisti
    kapsar), hangar ve fabrika yanı, en verimli madenler, radar, pistin uçları (eskiden ilk batarya üssün merkezinden
    2,1 km uzağa, evlerin yanına kuruluyordu). Madenler ve radar düşmana bakmayan yöne; evler üssün 2,3 km yakınında
    küme.
  - **Genişleme** (`nextInvest`): yatırım sırası 2 maden, yeni hava üssü (45. dakikadan ikinci, 150. dakikadan üçüncü;
    yıkılan üs de bu sayıya göre yeniden kurulur), kalan madenler (20 dakikada bir, en çok 6 + yeni üs başına 2),
    90. dakikadan sonra fabrikası olmayan üsse bağlı fabrika. Yeni üs hedef ülkeye doğru, ana üssün 20–35 km ötesine
    (±60°; düşman yapılarına 12 km'den yakın olamaz): baskın yolu kısalır, tek üse bağlı kalınmaz. Üs fon dolar dolmaz
    kurulur. Her yeni üsse iki batarya daha (pistin iki yanı). Uçaklar 5 dakikada bir dengelenir: en kalabalık üsten
    en boşuna (fark ≥ 4) en çok hazır bekleyen tipten 2–4 uçaklık intikal kolu. Ölçüm (4 saat): ikinci üsler çoğunlukla
    117–135. dakikada (ekonomi daha erkene izin vermiyor: 45. dakikada kasa ~10 bin kr), bazı botlar 3 saatte 3 üslü;
    yeni üsler düşmana 11–19 km daha yakın. Üssü yıkılan bot ikinci üssüyle harekâtta kalıyor.
  - **Araştırma önce:** uçak hattı hedefe yöneliktir (sıradaki uçak önkoşullarıyla birlikte sıraya girer); uçak hattı
    para beklerken mühendislik hattına yeni iş verilmez (ucuz araştırmalar parayı hep önce kapıyordu); araştırma para
    beklerken üs tesisi, batarya yükseltmesi, ilk bataryadan sonraki bataryalar ve fazla uçak alınmaz.
  - **Baskın harekâtı:** bot bir hedef ülke seçer (yakın, az bataryalı; başka botların hedefindeki ülke daha az seçilir,
    herkes oyuncuya yüklenmesin) ve elenene kadar onunla uğraşır. Önce çevresi: üssü koruyan bataryalar, radar,
    fabrika, madenler (yıpranmış olan önce, yarım kalan hedefe çoğu zaman dönülür); en çok 2 baskın ya da 25 dk sonra
    ana üssü, yıkılana kadar: kol 1,5 kat büyür, aynı görevi yapabilen bütün hazır tipler tek pakette kalkar, baskınlar
    3–5 dk arayla. Eskiden her baskın rastgele başka bir yapıya gidiyordu: 3 saatte tek yapı yıkılmıyordu. Hazır saldırı
    uçağı yoksa 1–1,5 dk sonra yeniden denenir; hedef ülke yoksa yakın hedefler ağırlığı (d/45 km)⁴ ile düşer.
    Ölçüm (4 saat, fiyat indirimi + onarım + 1.600 canlı üs + daha çok saldırı uçağı ve daha yakın ön üs; önce → şimdi):
    ilk ana üs yıkımı 6 tarafta 184 → 128. dk (ilk elenme 134. dk), 4 tarafta ~4,9 sa (tahmin) → 159–170. dk (bir
    koşuda dört ana üs de 190. dk'ya kadar), 1'e 1'de ~9 sa (tahmin; 4 saatte %61–70) → 227–237. dk.
  - **Alarm:** yapay zekâ en az çift kaldırır (tek uçak ancak tehdit yapılarımızın 15 km yakınındaysa), 3+ uçaklı kola
    dörtlü; paket büyüklüğüne kadar önleyici ayrılır (eskortlar tek tek önlenmez), avcı temasları bombardımandan 6 km
    geride sayılır. Alarm kolu hedef kendi yapılarımızdan alarm yarıçapı + 15 km'den (dalaştaysa +35 km) uzaklaşınca
    bırakır (çift, eskortu 74 km öteye kadar kovalıyordu).
  - Ölçüm (4 ve 6 taraf, 105 dk): taraf başına 2–4 baskın (önce 1–2), araştırmaya 15–45 bin kr (önce yalnız ucuz
    modifikasyonlar; Spitfire I ve Bf 109 F'e geçiliyor), filo 8–11 uçak.

## Harekât sonu

- **Elenme:** hava üssü kalmayan taraf 5 dakika içinde (`LAST_STAND`) yenisinin inşaatına başlamazsa elenir; hiç yapısı
  kalmadıysa hemen. Elenen tarafın kalan yapıları terk edilir (yıkıntı), havadaki uçakları tarafsız ülkelere iner.
  Bot son üssü yıkılınca bütün parasını yenisine ayırır ve kalan yapılarının çevresinde yer arar.
- **Zafer:** haritada son kalan taraf kazanır (`world.winner`, kayıtta saklanır).
- Arayüz: oyuncunun son üssü yıkılınca üstte geri sayım ("Yeni üs kur (İnşa · B, 27.000 kr): elenmeye 04:50");
  elenince "Harekât kaybedildi", son kalınca "Zafer!" penceresi (oyun süresi, elenen düşman, görevler, araştırma;
  "Haritada kal / İzlemeye devam et" ya da "Ana menüye dön"). Elenen tarafların yıkıntıları "Bilinen düşman
  hedefleri" listesinden çıkar.

## Silahlar, isabet ve hasar (gerçekçilik)

- **Silah yerleşimi** (`GunSpec.mount`): kanat, kanat kökü (senkronize), motor kaputu (senkronize), burun, pervane göbeği,
  gondol. Kanat silahları gövde ekseninin yanından atar ve 250 m'de eksenle kesişir (yakınsama); önünde ve ötesinde
  mermiler yana dağılır. Senkronize silah pervane yüzünden ~%15 yavaş atar. Silah adında yerleşim yazar.
- **İsabet gövdesi** (`hitbox.ts`): uçak gerçek boy, açıklık ve ortalama veterden gövde (kapsül), kanat, yatay/dikey
  kuyruk ve naseller olarak kurulur. Eskiden 4–5 m yarıçaplı küreydi (arkadan ~66 m²; gerçek ~5 m²).
- **Bölgeye göre hasar**: burun → motor, kokpit → pilot ve depo, arka gövde/kuyruk → kumanda, kanat kökü → depo,
  kanat ucu → kanat. Flak patlaması (bölgesiz) atış yönüne göre.
- **Ayar** (ortanca isabet, arkadan): tek motorlu avcıda 7,7 mm ~30, 12,7 mm ~13, 20 mm 4–5, 30 mm 1;
  B-17'de 20 mm ~15–20, 30 mm ~5. Motor/depo/pilot her uçakta aynı; kanat, kuyruk ve gövde dayanımı büyüklükle artar.
- **Saçılma** ~3–5 mil (sabit silah); taret daha geniş. Pilot ateşe ~450 m'de açar (acemi uzaktan, usta yakından).
  Nişan hatası: küçük takip titremesi + öndelik kestirme hatası (sapmalı atışta büyür; nişancıda daha da büyük).
- **Şamandıralı karbüratör** (erken Merlin, Sakae, M-63, VK-105): eksi G'de motor bir an susar. Püskürtmeli motorlu
  avcı (Bf 109, Fw 190) takipten eksi G dalışıyla kurtulabilir.
- **Başarım** (3. tur): azami hız Cd0 ile, temiz tutunma hızı clMax ile, deniz seviyesi tırmanışı pervane verimiyle,
  sürekli dönüş Oswald verimiyle (0,70–0,95; clMax tutunma verisinin ±%8 payında) tarihî değerlere ayarlandı. Pervane
  itkisi T = ηP/(v⁴+v1⁴)^¼ (eski √(v²+v1²) tırmanış hızlarında itkiyi %15–25 eksik veriyordu: P-47, P-51, Hellcat ve
  Hurricane'in tırmanışı çok düşüktü). Tutunmaya yaklaşırken profil sürüklemesi artar (CL/CLmax > 0,55): sürekli dönüşü
  sınırlar. Bombardıman tırmanışları bombasız ağırlığa göre. Kritik Mach gerçek sıkışma değerlerinde.
- **Pilotaj** (3. tur): bilerek sınırlanan G'de seviyeli dönüş (eskiden fazla yatıp alçalan sarmala giriyordu); arkadaki
  hedefe dönüşte burun da iner (tırmanışı koruyarak dönüp tutunma hızına düşüyordu); Vne'ye uyar (Sıfır dalışta Hellcat'i
  ve P-40'ı izleyemez); acele olmayan dönüşte tutunma payı bırakır (yükseklerdeki vrillelerin çoğu bitti); saldırıda
  kaldırmanın ~%95'i, sınıra yalnız kırılma dönüşünde. Yan yatmış/sırtüstü dik dalıştan çıkışta pilot düzelip çekmek ile
  yarım döngüyü tamamlamayı karşılaştırır (ağır kanatçıklı Bf 110 düzelmeye çalışırken yere çakılıyordu); split-S payını
  dalışta artacak hıza ve pilot becerisine göre kestirir. Hasarlı, irtifa tutamayan uçak araziye gövde üstü iner.
- **Pilot hatası**: dalaşta sağlam uçağın yere çarpması "dalaşta yere çakıldı (pilot hatası)" diye yazılır; seyrek ve
  acemide daha olası olabilir (gerçekçilik), sistematik olursa hatadır.
- **Görüş**: tek kişilik avcıda arkada (özellikle 1,5 km ötesi, kanat altı, güneş yönü) kalan düşman gözden kaçabilir;
  2,5 sn görülmeyen düşmana savunma tepkisi verilmez (ateş açınca ya da görülünce fark edilir).
- **Kafa kafaya**: ateş kararı iki uçağın birbirini düşürme hızına (ateş gücü / dayanıklılık) bağlı; yaklaşma hızı ve
  çarpışma korkusu nişanı bozar. Düşürmelerin çoğu artık arka yarım küreden (eskiden 1'e 1'de %50–90 kafa kafaya).
- **Enerji (dal-vur) taktiği**: geçişte dikine çekip irtifaya çevirme, irtifa üstünlüğüyle hedefin arkasına dönme,
  arkadan saldırıda yaklaşma hızını sınırlama, geçince uzaklaşma; savunmada hız/dalış/tırmanış/eksi G ile kopma.
  Saldırı süre sınırı arkadan yaklaşırken artık kesmiyor (enerji avcıları hiç ateş edemiyordu).
- **Sonuç sırası**: düşürme ~%55–62 > infilak ~%22–24 > kaçış ~%16–21 (arka yarım küre isabetleri artınca kanat
  kopması azaltıldı, depo yangını artırıldı). Düşman ateşiyle ağır hasar alıp yere düşen ya da zorunlu inen uçak
  düşürme sayılır (ağır hasarlıysa süre sınırı yok); "yere çakıldı" yalnız kendi kazası.
- **Veri düzeltmeleri (2. tur)**: birçok avcıda "boş ağırlık" belgelerdeki değerdi (pilot, cephane, yağ hariç) → normal
  kalkış ağırlığına çekildi (Sıfır, I-16, P-40, Yak-3, La-7, F6F, F4U, Sea Fury, He 162, Vampire…). Spitfire V'in Merlin 45
  gücü 5,8 km'ye kadar (azami hız 6,1 km'de). Bf 109 E-4, Fw 190 A ve Bf 110'da MG FF/M (Minengeschoss). 1941 sonrası
  tasarımlarda kendini kapatan depo fabrikadan (Japon uçakları hariç).
- **Atış disiplini**: kısa cephaneli top (MG FF, N-37, MK 108) uzaktan açılan ateşte susar, ~300 m içinde açar; nişan o an
  ateş eden silaha göre. Arkasına yerleşen avcı atış mesafesini korur (kanat silahı ~200 m, burun ~150 m).
- **Rakibe göre taktik** (`tacticVs`): rakip belirgin daha iyi dönüyorsa dal-vur-tırman, biz daha iyi dönüyorsak dönüş
  savaşı (Hellcat/P-40 Sıfır'a karşı, La-7 Fw 190'a karşı).
- **Enerji avcısı**: hızını koruyarak tırmanır (en iyi tırmanma hızına inmez), uzaklaşırken G bırakır; takipçi arkada ve
  burnu dönükken geri dönmez, hız üstünlüğüyle arayı açar ya da hızını irtifaya çevirir. Saldırı süresi yaklaşırken işlemez;
  hedefin arkasında yakın durmak "geçiş" sayılmaz. 900 m ötesinde yaklaşamayan takipçi tehdit sayılmaz.
- **Enerji avcısı (3. tur)**: uzaktaki hedefe ~3 G ile döner (azami G'li 180° ~700 m enerji yakıyordu), hızlıysa
  tırmanarak; kafa kafaya geçişte yana açılmaz, üstten geçer; uzaklaşırken irtifayı korur (savaşı alçağa, rakibin güçlü
  olduğu irtifaya taşımaz), tırmanış üstünlüğünü bulunulan irtifaya göre tartar; dikine kopuşu azami hızın %70'inde bitirir,
  tepede burnu ufkun altına düşürerek döner. Savunmadaki hız kaçışı taarruzdaki uzaklaşmayla aynı mantık.
- **Taktik seçimi (4. tur)**: rakip %12'den fazla iyi dönüyorsa dal-vur; biz %8'den fazla iyi dönüyorsak dönüş savaşı;
  dönüşler yakınsa alçak/orta irtifada pervaneli döner, jette ve 5,5 km üstünde uçağın doktrini (deneyde Bf 109'lar
  dönüş farkı küçük rakiple dönerek daha iyi sonuç aldı; P-51, MiG-15, F-86 ise enerji taktiğiyle).
- **Savunma (4. tur)**: takipçi atış menzilindeyken (≈600 m) düz kaçılmaz (ara açılamaz); yakın takipçiden ilk kaçış eksi G
  dalışı (Bf 109'un karbüratörlü Spitfire I, Hurricane ve I-16'ya karşı klasik kaçışı).
- **Arka nişancı (4. tur)**: kendi uçağı G çekerken ve yuvarlanırken nişan bozulur; avcı ve pike uçaklarındaki elle tutulan
  makineli bombardıman taretinden ~1,5 kat isabetsiz (Bf 110'un MG 15'i ön silahlarının dört katı isabet ettiriyordu).
- **Nişancı (5. tur)**: taretler motorlu (`power`: B-17 çene/sırt/küre, B-25 sırt, B-29 ve A-26 uzaktan kumandalı,
  Lancaster FN, Il-28 kuyruk) ya da elle tutulan (bombardımanda ×1,35, avcı/pikede ×1,5 dağınık). Yeni hedefe nişan
  ~1–2 sn'de oturur; mesafesi hızla değişen (önden gelen ya da geçip uzaklaşan) hedefte düşüş/öndelik kestirilemez;
  açısal hızla takip gecikmesi (motorlu 0,08 sn, elle 0,12 sn) ve taret dönüş sınırı (45°/sn, elle 60°/sn). Ateş hattında
  dost uçak varken tetik bırakılır. B-17 nişancılarının isabet oranı %0,9 → %0,3 (tarihî tahmin ~%0,2–0,3).
- **Kale kutusuna önden saldırı (5. tur)**: ağır savunmalı (≥60 mermi/sn) bombardıman kutusuna pervaneli avcı arkadan
  girmez: kutunun kenarından bir dönüş çapı yanda, nişancı menzili dışında 6 km öne geçer, dönüp karşıdan gelir,
  ~700 m'de ateş açar (B-17 gibi büyük hedefe), ~380 m'de kopar. Kopuş yönü gerçek dönüş hızıyla (≈18°/sn) önümüzdeki
  4 sn'de kutudaki uçaklara en uzak kalan aday (aşağı/yukarı/yana 35–60°). Kanat adamı liderle aynı anda kendi geçişini
  yapar. Kutunun önünden gelen avcı doğrudan saldırır. Jet önden dolanmaz, hızını kesmeden arkadan dalıp ~220 m'de geçer.
  Bombardıman uçağı tehdit sayılmaz (kovalayamaz; nişancısından kaçmak için savunma manevrası uzaklaşmayı geciktiriyordu);
  ağır hasarlı avcı üsse dönmeden önce bombardıman kutusunun nişancı menzilinden yana ve aşağı çıkar.
- **Kutuya önden saldırı düzeltmeleri (6. tur)**: önden geçişte liderin yanından ~50° açıyla gelen kanat adamı da erken
  ateş açar; kanat adamı ancak kendisi kutunun önündeyse lidere katılır; "öne geçemeyen olduğu yerden saldırır" yedeği yalnız
  avcı öndeyse (arkadaki avcı için geçiş anında bitip döngüye giriyordu). B-17 baskını 12 koşu: ~8 B-17 (%7) ve ~10 Alman
  avcısı (sorti başına %8); 1943–44 baskınlarına yakın.
- **Vrille eğilimi** (`spinProne`): MiG-15 2,4, I-16 1,8, Fw 190 1,6 … Spitfire, Hurricane, Hellcat 0,6. Eğilimli uçak
  tutunmanın biraz altında da uyarısız vrilleye girer. Kritik Mach üstünde gövde yalpalar, nişan bozulur (MiG-15 Mach 0,86).
- **Kore (4. tur)**: jet itkisinde hava girişi direnci (net itki orta hızda statik değerin altına iner) → jet tırmanışları
  tarihî değerlere yaklaştı (MiG-15bis 64 → 55 m/s, gerçeği ~51; Meteor, Vampire, F-84G tutuyor). F-86F çıtalı kanat
  (clMax 1,45; Sovyet testi: alçakta yatay manevrada Sabre üstün), deniz seviyesi 1.107 km/sa. N-37 ve NR-23 hasarı patlayıcı
  içeriğe göre (N-37 18, NR-23 6). G elbisesi araştırması eklendi. Karnede her tip tarihî donanımıyla uçar (`HIST_KIT`:
  F-86F radar nişangâhı + hidrolik + G elbisesi; MiG-15bis jiroskoplu nişangâh + kanatçık güçlendiricisi).
- **Tarihî karne** (`npm run sim:bench -- all 64 900 4`, 4'e 4 asıl ölçü; P-51/P-47/Spitfire IX/Me 262 eşleşmeleri gerçek
  irtifa bandında): 20 eşleşmenin 11'i aralıkta (Spitfire I – 109 E, Sıfır – Hurricane, Sıfır – P-40, 109 F – Spitfire V,
  Fw 190 – Spitfire V, P-51 – 109 G, Hellcat – Sıfır, Fw 190 – P-38, Me 262 – P-51, MiG-15 – F-80, Me 262 – Meteor); sınırda
  109 F – P-40 %54, Yak-3 – 109 G %49, F-86 – MiG-15 %43. Açık iş: 109 E – I-16 (%20) ve 109 E – Hurricane (%44),
  Hurricane – Bf 110 (%34), P-47 – Fw 190 (%39), Fw 190 – Spitfire IX (%28), La-7 – Fw 190 (%81, fazla güçlü). 1'e 1'de
  dönüş avcıları ağır basıyor (yalnız 5/20). 32 dalaşlık 4'e 4'te gürültü ±5–10 puan: karar için 64 dalaş.
  7. tur (2026-10-21, dalaş dengesi): **zikzakla kaçış** (`runWeave`): dalacak irtifası kalmamış, bu irtifada belirgin
  hızlı (azami hız ≥ ×1,06) tek motorlu avcı, çok daha iyi dönen takipçiden (dönüş süresi oranı < 0,9) kırılma ve sert
  kaçamakla değil tam güç, düşük G ve ±15°'lik zikzakla kaçar (kırılma ve kaçamak hızı eritiyor, takipçi eşit hızda
  arkasına yerleşiyordu: enerji avcılarına gelen isabetlerin çoğu "savunma, arkadan, alçakta, eşit hız"). 1'e 1'de
  109 E – Hurricane 8:24'ten 18:12'ye. Daha geniş tutulunca Fw 190 – P-38 (P-38'in burundaki toplu silahları önünde
  kaçanı vurur) ve Bf 110 (ağır, Hurricane'den kaçamaz, savunma çemberine girerdi) bozuluyordu.
  Karne (eşleşme başına 128 dalaş): 13/20 aralıkta — 109 E – Hurricane %57, F-86 – MiG-15 %50, 109 E – I-16 %27 (önce
  %10–16). Açık: Hurricane – Bf 110 %51, Sıfır – Hurricane %80, Sıfır – P-40 %44, La-7 – Fw 190 %87, P-51 – 109 G %48,
  P-47 – Fw 190 %38. Bulgular: isabetlerin %65–93'ü 15°'den küçük açı farkıyla (kuyruk takibi; sapmalı atış sorunu
  değil); P-47 ve P-51 kendi 7 km bandında başlayan dalaşta isabetlerin çoğunu 0–2 km'de alıyor (dalaş her dalışta
  alçalıyor; kollar 7 km'de azami hızlarının çok altında, 300–550 km/sa dolaşıyor). Denenip geri alınanlar: hızı ~%88'de
  tutan tırmanış eşikleri, üstün olunan irtifaya dönüş (`advantageAlt`), yaklaşılamayan kaçak hasarlı hedefi bırakma
  (dengeyi değiştirmedi, kaçışları %26 artırdı). Sıradaki: yüksek irtifa enerji avcısının hız ve irtifa yönetimi
  (saldırı sonrası kendi bandına dönüş, dalışta hedefi yere kadar izlememe) ve dönüş avcılarının (Sıfır, La-7) fazla
  üstünlüğü.
  6. tur (2026-10-21) denemeleri: 109 E – I-16 incelendi. 109'lar alçağa itilip yavaşlıyor, I-16 250 m'den arkadan
  vuruyor (isabetlerin ~%70'i "Savunma", yere <1300 m, R<250); 1'e 1'de 109 "arkasına dönmeye" çalışırken burnu hep ona
  dönük I-16'yla kafa kafaya geçişe giriyor. Denenip geri alınanlar (diğer eşleşmeleri bozdu ya da etkisizdi): kaçamak
  manevrayı kaldırmak (109 E–I-16 %4), alçakta tırmanma ve alçakta saldırıya dönmeme, burnu dönük rakiple karşılaşmayı
  reddetmek (F-86 düzeldi, P-47 ve Fw 190–Spitfire IX bozuldu), dikine kopuşu sıkılaştırmak, I-16 için nişan platformu
  çarpanı (isabetler yakından geldiği için etkisiz). Gerekli: taktik durumları (yukarıdan dalış, kafa kafaya karşılaşma,
  alçakta savunma) ayrı senaryolarla tek tek ayarlamak.
  5. tur sonrası (görev dağılımı, algı, nişancı): 14/20 aralıkta; Hurricane – Bf 110 %34 → %47. Açık: 109 E – I-16 (%10),
  109 E – Hurricane (%42), P-51 – 109 G (%43), P-47 – Fw 190 (%38), F-86 – MiG-15 (%33–43, eşleşme başına ~80 düşürme:
  gürültü büyük).
  Görevler (6–12 koşu): B-17 baskını 12 koşuda ~5 B-17'ye ~13 Bf 109 G (önceden 0'a 17; B-17'ye avcı ateşi neredeyse
  yoktu); önlemede avcılar bombardıman uçaklarına ulaşıyor (6 koşuda 14–25 He 111); refakatsiz He 111 baskınında 109 E
  kaybı He 111'i geçmiyor (eski nişancı modelinde 8'e 6). Önceki açıklar (önlemede eskorta takılma, B-17 baskınında geç
  kalan devriye) kapandı.

## Uçaksavar ve uçaksavardan kaçınma

- **Yerleşim:** batarya hava üssünün tel örgüsünün hemen dışına kurulabilir (pistin 120 m bir yanından 560 m öbür yanına
  uzanan alan + 150 m ve pist uzantısındaki yaklaşma koridoru yasak). Eskiden üssün 1,4 km'lik dairesi her yapı gibi
  bataryayı da uzak tutuyordu; 2 km menzilli 20 mm pisti koruyamıyordu.

- **Görüş**: optik nişan menzili hedefin boyutu, kol hâlinde uçuşu ve yoğuşma izine göre (`visibility`, avcı algısıyla
  aynı): tek avcı 5,5 km, 7 km'deki B-17 kutusu ~15 km. Eski sabit 5,5–7,4 km'de 88 mm yüksekteki B-17'yi ancak tepeden
  geçerken görüyordu. Atış kontrol radarı tam menzilde izler.
- **Namlu dönüş hızı** (`slew`): 12,7 mm 60°/sn, 20 mm 45, dörtlü 20 mm 40, 37/40 mm 30, 88 mm 12, 128 mm 8. Namlu hedefe
  yetişmeden ateş edilmez; izleyemeyeceği kadar hızlı kayan hedef seçilmez. Takip gecikmesi ~0,1 sn × açısal hız. Hızla
  yakından geçen alçak uçak hafif topu da atlatır; topun üstüne dalan Stuka/Il-2 ise kolay hedef (açısal hızı sıfır).
- **Ağır flak isabeti**: patlama noktası atış anındaki rotaya göre kestirilir (8 km'de ~120–180 m hata, 22 m öldürücü
  yarıçap): iki 88 mm ile isabet çok nadir; 1943'te 88 mm başına binlerce mermide bir bombardıman uçağı düşüyordu, etki
  bataryaların yığınla kurulmasından gelir.
- **Rota kaçınma** (`avoidAA`): intikal, dönüş, hasarlı dönüş ve taarruz/pike yaklaşmasında rota üstündeki düşman
  bataryasının menzilinden (+800 m) yana sapılır. Bataryanın tavanının üstünden geçiliyorsa ya da batarya görev hedefinin
  4 km yakınındaysa (kaçınılamaz; bastırma kolunun işi) dolanılmaz.
- **Flak altında zikzak** (`flakWeave`): kolun bir üyesinin 400 m yakınına flak patlarsa kol 25 sn boyunca 8 sn'de bir 14°
  (avcı 5 sn'de 22°) yön ve biraz irtifa değiştirir. Bombalama koşusunda yapılmaz; bombalar atıldıktan sonra yapılır.
- **Kaçamak** (`aaJink`): hafif uçaksavarın izli mermileri altında taarruz uçağı hedeften açılırken, pike uçağı yeniden
  dalışa açılırken 1,6 sn'de bir 25° yana kırar.
- Ölçüm (4 koşu): Il-2'lere uçaksavar düşürmesi 8 → 3–5, alçaktan hızla geçen Typhoon'a isabet 45 → 17; yolun üstündeki
  37 mm bataryası 4,2 km'den dolanıldı, hiç ateş edemedi.
- Not: refakatsiz He 111 radarla erken önlenince ağır kaybediyor (6 koşuda 24'te ~16–22; tek 7,92 mm MG 15'ler avcıyı
  zor düşürür; He 111 başına ~53 isabet). Tarihe uygun: refakatsiz gündüz bombardımanı avcıya karşı çaresizdi. He 111 H
  ve Ju 88 A fabrikadan kendini kapatan depolu (`EARLY_SEALED`; Luftwaffe bombardıman uçaklarında 1939–40'tan vardı).
- **Bina canları (2026-10-21, oyuncunun isteği: tek bombayla hemen yıkılmasın)**: ev 60 → 180, park 80 → 200, radar
  240 → 360, apartman 240 → 400, çarşı 300 → 400 (kendi boyutundaki bombanın bir isabetine dayanır; 500 kg merkeze ≤160,
  1000 kg ≤290). Uçaksavar 320'de kaldı (karşılık verdiği için yine zor). Kayıtta azami can da saklanır; eski kayıtlar
  orana göre taşınır.

## Görev sonucu

- Sonuç zarla değil, görevde olanlardan çıkar (`missionResult.ts`). Her kol (`FlightGroup.stats`) isabet, hasar, düşürme,
  kayıp ve hedefe varışı toplar; kol üsse döndüğünde değerlendirilir:
  - bombardıman / pike / taarruz: hedef yıkıldı ya da yeterli hasar (yapının %15 / %12 / %10'u) → başarılı;
  - önleme: hedef koldan düşürme var ya da kol hiç saldıramadan püskürtüldü → başarılı;
  - refakat: korunan kol hedefe ulaştı ve refakatin yarısından azı kayıp → başarılı;
  - CAP: düşürme ≥ kayıp ve bölgedeki yapılar korunmuş; temas yoksa sonuçsuz;
  - tarama: düşürme > kayıp; temas yoksa sonuçsuz; geri çağrılan kol (hiçbir şey yapmadıysa) sonuçsuz.
- Görev ödülü **yalnız başarıda**: saldırıda 600 + yapı değerinin %15'i (yıkıldıysa ×1,5); önlemede 400 + hedef kolun
  değerinin %5'i; refakatte 500 + korunan kolun %3'ü; CAP/taramada sabit + düşürülen değerin bir payı. Başarısız ve
  sonuçsuz görev para getirmez (düşürme ve yapı ganimeti ayrıca ve her durumda geçerli).
- Planlayıcıdaki **tahmini başarı** (`missionOdds`): görev türünün temel oranı + araştırmalar (nişangâh, keşif fotoğrafı,
  taret, sızdırmaz depo, telsiz, erken ihbar radarı, GCI…) + kol büyüklüğü ve refakat − hedefteki uçaksavar, yakın düşman
  üsleri, radar, mesafe, uçağın göreve uygunluğu. %5–%92 arasında kalır: hiçbir görev kesin değildir. Eksik araştırmalar
  "Araştırılırsa artar" satırında gösterilir. Bu bir tahmindir; gerçek sonucu uçuş belirler.
- Yeni araştırmalar: *Hedef keşif fotoğrafları* (bomba dağılımı −%25), *Roket nişangâhı ve taarruz eğitimi* (roket
  dağılımı −%40).

## Ana menü, hesap ve kayıt

- Oyun ana menüyle açılır: arkada saydam harita (yapay zekâ ülkeleri kendi aralarında oynar, kamera yavaşça döner),
  ortada komutan adı + **Oyuna başla** ve **düşman sayısı (1–5)** ile tarafların yerini gösteren küçük harita.
- **Haberler** (`src/ui/news.ts`, görseller `public/news/`): sol üstte en son güncelleme notunun kutusu (görsel ve
  üstünde tabana ortalanmış başlık); tıklanınca bütün haberlerin listesi (aynı kartlar alt alta, ortalanmış), bir habere
  tıklanınca haber sayfası (metin ve diğer görseller). Yeni not `NEWS` dizisinin başına eklenir. Görseller oyundan
  1280×720 ekran görüntüsü. Dar ekranda (≤1060 px) kutu yerine üst çubukta "Haberler" düğmesi.
- **Geri bildirim** (`src/ui/feedback.ts`): sağda düğme (ve duraklatma menüsünde): görüş ve öneri, "Ben bu oyuna _ $
  veririm" (Steam'de) ve zorunlu gönderen adı (hesap gerekmez); görüş ya da fiyattan biri dolu olmalı. Gönderilen
  geri bildirim geliştiricinin **Google Formu**'na gider ("WarSimBox geri bildirim"; oyuncu formu görmez, yanıtlar
  formun "Yanıtlar" sekmesinde). Alan kimlikleri `feedback.ts` `FORM`'da (form değişirse sayfasındaki
  `FB_PUBLIC_LOAD_DATA_`'dan yeniden alınır). Gönderilemezse cihazda `warsim.feedback.v1` altında saklanır, oyun
  sonraki açılışta yeniden gönderir.
- **Tam ekran:** oyuna başlarken ya da kayıt yüklerken tarayıcının tam ekranına geçilir; ana menüde "Tam ekran" ve oyun
  içinde ⛶ düğmesi aç/kapar. Dizüstü genişliklerinde üst çubuk sıkışır (1440 px altında 2× ve 8× gizli, 1260 px
  altında Senaryo, 1100 px altında marka ve araştırma çipi): 1280 px'de Araştırma, Hangar ve Görünüm ekran dışında kalıyordu.
- **Arayüz ölçeği `--ui`:** style.css'teki bütün yazı, boşluk, kutu ve konum ölçüleri `calc(Npx * var(--ui))` (1–0 px
  çizgiler, gölgeler ve `@media` eşikleri hariç; dönüşüm betikle yapıldı, yeni kural yazarken de bu biçim kullanılmalı).
  Masaüstünde 1, dar düzende 0,84: telefonda yazılar, düğmeler ve paneller orantılı küçülür. Araştırma zaman çizelgesi
  (kart yerleri koddan piksel) `zoom` ile bütün olarak küçülür. Gövde yazısı da ölçekli (boyutu yazılmamış öğeler için).
  Telefonda ana menü iki sütun (solda ad ve düşman sayısı, sağda harita; kaydırma yok), haber kartları dar, duraklatma
  menüsü ve oyun sonu düğmeleri iki sütun, ayarlar iki sütun, araştırma durum kartları tek satır. Klavye kısayolu
  etiketleri (`.kbd`: "(P)", "(F)", "Esc") dokunmatikte gizli; iOS'ta yazı kutuları 16 px (`.ios`, sayfa büyümesin).
- **Telefon (yatay):** sıkışık düzen `(max-height: 520px), (max-width: 900px)` (`layout.ts` `isCompact` ile aynı eşik):
  üst çubuk kısalır (marka, araştırma çipi, Senaryo, Görünüm, 2×/8× gizli), paneller daralır ve kapalı başlar, aynı anda
  biri açık kalır; seçim yapınca ilgili panel açılır (yapı solda, uçak sağda). Dar düzene geçince paneller kapanır,
  genişleyince masaüstü tercihi geri gelir (telefondaki kapalı başlangıç kaydedilmez). Pencereler (araştırma, hangar,
  pazar, planlayıcı, menüler) ekrana sığar. Dikey tutulunca "Telefonu yan çevir" uyarısı; tam ekranda Android'de ekran
  yataya kilitlenir; `manifest.webmanifest` (fullscreen, landscape) ile ana ekrana eklenebilir. iOS yazı kutusunda
  sayfayı büyütmesin diye dokunmatikte yazı 16 px.
- **Dokunmatik kamera** (`camera.ts`): tek parmak kaydırır; iki parmak yakınlaştırır (parmakların ortasına doğru; ölçümde
  parmak altındaki nokta 23 km'lik görüşte 60 m içinde kalıyor), çevirince döndürür (harita parmaklarla aynı yönde),
  birlikte yukarı/aşağı kaydırınca eğer; dokunuş seçer, çift dokunuş (350 ms, 30 px) takip eder, uzun basış (650 ms)
  sağ tık sayılır. Haritada tarayıcının kendi hareketleri kapalı (`touch-action: none`).
- **Klavyesiz kontroller:** alt çubukta inşa ederken "↻ Döndür / ✓ Yerleştir / ✕ İptal", haritadan hedef seçerken
  "✕ İptal", ara nokta eklerken "✓ Bitir" (masaüstünde de). Dokunmatikte inşada dokunuş yapıyı hemen kurmaz, yalnız
  gölgesini taşır; "Yerleştir" kurar. Telefonda boştaki ipucu çubuğu gizli, yer seçerken inşa kartları gizlenir.
- **Harekât:** herkes herkese karşı. Her taraf aynı şeyle başlar: ana hava üssü, üssün yanında uçak fabrikası, 1 maden
  ocağı (başlangıç ocağı her tarafta "orta" verimde), 2 ev (8 kişi), 4 avcı + 2 Ju 87, 25.000 kr. Taraflar: Mavi (oyuncu,
  batı), Kırmızı (doğu), Mor (güneydoğu), Sarı (kuzeybatı), Turkuaz (kuzeydoğu), Pembe (güneybatı). Yapay zekâ maden,
  ev, zamanla uçaksavar ve radar kurar; baskın hedefini yakınlığa göre seçer.
- **Hesap:** sağ üstte giriş; yalnız bir ad (şifre yok), aynı adla tekrar girilir (büyük/küçük harf fark etmez). Hesaplar
  tarayıcıda (localStorage), kayıtlar IndexedDB'de. Misafir oyun kaydedilmez, kapanınca silinir; oyun ortasında
  duraklatma menüsünden giriş yapılıp kaydedilebilir.
- **Duraklatma menüsü** (Esc / ☰ Menü): devam, adlandırılmış elle kayıt, kayıtlar (yükle/sil), ayarlar (ses, görünüm), ana
  menüye dön (kaydedilmemiş ilerleme varsa sorar). **Otomatik kayıt** oyun akarken her 5 dakikada (gerçek zaman),
  en yeni 3 otomatik kayıt tutulur. Sekme arka plana geçince de (telefonda uygulama değiştirme, ekran kilidi) son
  kayıttan 30 oyun saniyesi geçmişse otomatik kayıt alınır; kaydedilmemiş ilerlemeyle sayfa kapatılırken tarayıcı sorar.
- **Kaydedilenler:** zaman, taraflar (araştırma, kasa, defter, personel), tüm yapılar (inşaat, hasar, hangar, tesisler,
  batarya silahları, fabrika sırası, maden verimi), yapay zekâ zamanlayıcıları, pazar, olay günlüğü, kamera. Havadaki
  uçaklar kayıtta üslerine dönmüş sayılır (hangarda bakımda); mermi, bomba, paraşüt saklanmaz. Arazi düzleştirmeleri
  yapılardan yeniden üretilir (her yeni dünya temiz araziyle başlar). Kayıt ≈ 50 KB.

## Harita, ölçek ve görünüm

- **İki harita, ikisi de 300 × 300 km** (sonraki nesil jetlerin menzilleri için; ana menüden seçilir, kayıt haritasını saklar):
  - **Anakara:** eski haritanın büyük şekilleri 2 kat ölçekte — ortada iki geçitli dağ silsilesi (≈3 km), kuzeyde yaylalar,
    güneyde körfez, körfeze akan iki nehir, iki yanda geniş ovalar; yerel tepe ayrıntısı eski ölçekte, 16 şehir.
  - **Takımadalar:** iç denizin çevresinde altı büyük ada (her ülke kendi adasında, dağlar adanın dış yüzünde, ovası iç
    denize bakar), ortada volkanlı tarafsız ada, aralarda adacıklar; her baskın deniz aşar.
  - Harita `src/sim/maps.ts`'te tanımlı (doğal yükseklik fonksiyonu, 6 üs yeri, şehirler); arazi seçilince üretilir
    (≈2,5 sn, yükleme ekranı). Hazır test senaryoları Anakara'da.
- Her şey gerçek ölçekte; uzaklaştıkça uçaklar en fazla 6 kat büyür, daha uzakta takım renginde yön okları ve kol başına tek etiket.
- Yapılar gerçek boyutlara yakın: batarya ≈150 m, fabrika ≈500 m, üs 2,2 km pist + apron, hangarlar, kule, yakıt, tesisler.
- Arazi 2048 × 2048 ızgara (≈146 m), 32×32 parça, 3 ayrıntı düzeyi (yakında simülasyonla aynı üçgenleme). Çeyrek düzey hep
  hazır; tam ve yarım düzey kameraya yakın parçalar için kare başına birkaç tane üretilir, uzaklaşınca bırakılır (bellek
  sınırlı: arazi verisi ≈80 MB, orman/tarla/şehir ızgaraları 8 bit). Tam çözünürlük 65 km'ye kadar (düzey
  geçişleri sisli ufukta); kaba düzeyler süzülmüş renk ve yumuşak normalle çizilir, geçişte histerezis var. Uzakta
  piksel altına düşen ağaç (9 km), yol şeridi (11 km) ve köyler (20 km) gizlenir; harita çizgileri arazinin altında kalmaz.
- Arazi örtüsü: ormanlar (uzakta koyu yeşil leke, yakında 3B ağaç; yükseldikçe iğne yapraklı), ovalarda tarla parselleri,
  dik yamaçta kaya rengi ve kaya kümeleri, şehir zemini. Yollar geçitlerden kıvrılarak şehirleri ve üsleri bağlar; yol
  boyunca köyler, tarlalarda çiftlikler. Kurulan yapıların tabanı ağaç ve evlerden temizlenir. Görünüm ayarlarından kapatılabilir.
- **Grafik güncellemesi 1 (2026-10-23)**, ölçüm `tools/rec/audit` (taban `taban-2026-10-23.json`):
  - Atmosfer (`render/atmosphere.ts`): gök kubbesi (tepeden ufka renk geçişi, güneş diski ve halesi), yükseklikle
    üstel azalan sis (vadide pus, 7 km'de berrak; three.js sis parçalarının yerine), sis ve gök aynı işlevle boyanır.
    Güneş kuzeybatıdan 44° (`setSun`; gün döngüsü buna bağlanabilir), Neutral ton eşleme, ortam ışığı kısık. Uzak
    düzlem kameranın yüksekliğiyle büyür (7 km'den ufka kadar arazi). Kendi `onBeforeCompile`'ı olan malzeme
    `linkAtmosphere` çağırmalı.
  - Arazi: parça sınırlarındaki koyu çizgiler eteklerden geliyordu (uzakta derinlik hassasiyeti yetmeyince eteğin
    üst kenarı sızıyor, çift yüzlü çizimde arkadan görülen eteğin normali ters dönüyordu). Etekler artık yüzeyin
    normali ve rengiyle; yakın düzeyin köşeli gölgesi 2,5–12 km'de yumuşak gölgeye geçer (testere dişi sırtlar ve
    çapraz şeritler söner).
  - Ağaçlar: kameranın 1,3 km yakınındakiler tam model, ötesi gövdesiz taç (2,5 km ötesinde dörtte biri, 5,5–8,5 km'de
    söner); bloklar kameraya uzaklığa göre çizilir. Köy ve dekor şehirleri 9,35 km'lik bloklarda, kameranın 12 km
    yakınında (eskiden bütün haritanınki birlikte). Yakın ve taktik görünümde üçgen 2,6–3,7 milyondan 0,3–0,8 milyona.

## Ses

- **Bütün sesler gerçek kayıt** (Freesound.org; yalnız CC0 ve CC BY, ticari kullanıma açık; künye oyunda Haberler →
  "Sesler geldi"). `tools/sfx` ham kayıtları indirir ve oyun seslerini üretir (54 kısa MP3, ≈2,3 MB, `public/sounds`).
  İlk sentezlenmiş sesler yapay bulundu ("eski 2D oyun gibi"), kayıtlarla değiştirildi. NC lisanslı kayıtlar elendi.
- Tarayıcı ilk dokunuştan önce ses çalmaz: bağlam ilk dokunuş ya da tuşta kurulur, kayıtlar önem sırasıyla arka planda
  yüklenir (arayüz ve uyarılar önce). MP3 çözücüsünün başa eklediği sessizlik döngülerde atlanır. Sekme gizlenince durur.
- Üç kanal ve düzeyleri Ayarlar → Ses'te (genel, savaş, uyarılar, arayüz), sessiz: üst çubuktaki hoparlör ya da N.
  Çıkışta sıkıştırıcı (aynı anda çok patlamada bozulma olmaz).
- **Savaş sesleri** (`battle.ts`): dinleyici kamera; uzaklık oyun için sıkıştırılır (bakış uzaklığı ≈150 m sayılır):
  takipte gerçeğe yakın, taktik görünümde uzaktan, boğuk ve yankılı, 70 km'den uzakta susar. Sağ-sol yön kameraya göre,
  uzak patlamanın sesi ışığından biraz sonra gelir (en çok 0,6 sn), açık hava yankısı.
  - Motorlar (en yakın 6, tipe göre döngü): sıra motor Bf 109E DB 601 yer çalıştırması, yıldız Fw 190A BMW 801,
    çok motorlu dört motorlu pervaneli, jet J79. Devir gaza göre, perde Doppler'le kayar (takip edilen uçak dinleyiciyle
    birlikte gider). Hasarlı motor tekler, duran motor susar. Ju 87 B dalışta siren (gerçek siren kaydı, hızla tizleşir).
  - Yakın geçiş: kameraya en yakın geleceği an ve uzaklık hesaplanır; yakından geçecekse tipine göre gerçek geçiş kaydı
    (Spitfire, Bf 109, P-47, Fw 190, Lancaster, jet), kaydın en gürültülü anı o ana denk gelecek şekilde, sağ-sol kayarak
    çalar; o sırada motor döngüsü kısılır. Yalnız yakın planda ve en çok 2× zamanda.
  - Silahlar: kalibre ve namlu sayısına göre seri döngüsü (tüfek çapı Maxim, 12,7 mm .50 BMG, 20 mm Lahti L-39, 30 mm
    25 mm otomatik toptan pes; gerçek atışlar gerçek ateş hızında üst üste), seri bitince yankı; taretler; uçaksavarda
    12,7 / 20 mm seri, dörtlü 20 mm, 37–40 mm tek tek, 88–128 mm gerçek top atışı.
  - Olaylar: havada şarapnel (havai fişek kabuğu), infilak, yakın ve uzak bomba / çakılma, yakında metal isabet, roket,
    yapı yıkılması. Duraklatınca ve ana menüde savaş kanalı kapanır; 8× ve üstünde biraz kısılır.
- **Uyarılar** (`alerts.ts`, kamera nerede olursa olsun): düşman yapılarımıza 35 km'den yakın görülünce gerçek hava
  saldırısı sireni (Prag; en çok 2 dakikada bir) ve son üs gidince; yapı vurulunca elle çevrilen yangın zili (25 sn'de
  bir); yapı yıkılınca uzaktan patlama (kamera yakındaysa savaş sesi zaten çalar); araştırma raporu daktilo zili, uçak
  teslimi ve inşaat bitince daha pes zil; görev raporu telsizden Mors; zaferde süvari hücumu borazanı, yenilgide trompetle
  "Taps". Yüklenen oyunun eski olayları çalmaz.
- Arayüz: şalter tıklaması (birincil düğmede tok), yerleştirme "güm"ü, yerleştirilemeyen yerde çift tık.

## Araştırma ekranı

- "Tasarım bürosu" panosu: uçaklar hizmete giriş yılına göre zaman çizelgesinde, her hat bir şerit; üstten siluet,
  soy çizgileri ve durum damgası (taslak / proje hazır / prototip / hizmette). Seçilen programın dosyası sağda:
  önceki uçağa göre hız/tırmanış/dönüş farkı, önkoşullar (tıklanınca o düğüme gider), araştır düğmesi.
- Mühendislik: kategori × dönem tablosu; hava savunma ve ihbar/komuta aynı liste + dosya düzeninde.
- Aşamalar: uçak programları ve mühendislik sayfa altındaki düğmelerle aşama aşama gezilir (1 pervaneliler,
  2 ilk nesil jetler; jet aşamasında önceki aşamadan gelen öncüller soluk gösterilir). Sonraki nesiller yeni aşama olarak eklenecek.

## Yol haritası

- [x] **Faz 0 — Hava harbi çekirdeği**
- [x] **Faz 1 — Pervaneli dönem**
- [x] **Faz 1.5 — Gerçek uçaklar ve fizik** : atmosfer/Mach/güç modeli, 29 gerçek uçak, modifikasyon + araç ağacı,
      savaş puanı, düşürme/infilak/kaçış çeşitliliği, paraşüt ve enkaz, 150 km harita, ayrıntılı uçaksavar ve yapı modelleri,
      üs tesisleri ve üsse bağlı fabrika, hangar listesi.
- [x] **Faz 1.6 — Pervaneli dönemi olgunlaştırma**: görev planlayıcı (paket, mühimmat, mermi kuşağı), önleme izi,
      şehir yapıları, arazi örtüsü ve süs (ağaç, kaya, yol, köy), ayrıntılı uçak modelleri, araştırma panosu.
- [x] **Faz 1.8** — model boşlukları ve aynalı kanat gölgelemesi, takipte kameranın uçağın altına inmesi, sağ panelde
      aktif görevler (paketler gruplu), açılır/kapanır paneller ve bölümler, uzak görünüm okları modelin yerine, araştırma aşamaları.
- [x] **Faz 1.7** — serbest mühimmat (askı noktaları), personel (ev = 4 kişi), daha yavaş araştırma, akıcı hareket
      (adım arası ara değerleme), kamera iyileştirmeleri (takipten çıkınca yerinde kalır, çift tıkla yapıya uçar).
- [x] **Faz 1.9** — son pervaneliler (2. aşama), daha ayrıntılı ve zor hava savunma ağacı, harita titremesi giderildi.
- [~] **Faz 2 — Ekonomi**: para, maliyetler (üretim, inşaat, araştırma, üs ve batarya işleri), maden ocakları (gizli verim),
      ganimet ödülleri, uluslararası uçak pazarı ✓ — sırada: şehir gelirleri (vergi, iş gücü), ikmal, maden verimini
      gösteren keşif özelliği, oyuncular arası ticaret.
- [ ] **Faz 3 — J2/J3: uçak radarı ve ilk füzeler**, RWR, BVR karar ağacı, füzeden kaçış
- [ ] **Faz 4 — J4/J4.5/J5**: darbeli-doppler ve notch, chaff/flare, ARH, veri bağı, stealth
- [x] **Faz 2.1** — ana menü, hesap (ad ile giriş), kayıtlar, duraklatma menüsü, 5 dk otomatik kayıt, 1–5 düşmanlı
      herkes-herkese harekât, eşit başlangıç (üs, fabrika, maden, 2 ev).
- [x] **Faz 2.2** — 300 km haritalar (Anakara, Takımadalar) ve harita seçimi, daha zor ekonomi, pike bombardımanı nişan
      düzeltmesi (bombalar ~400 m ıskalıyordu; şimdi çoğu 60 m içinde).
- [x] **Faz 2.3** — görev sonucu (başarılı / başarısız / sonuçsuz) ve ödülün yalnız başarıda verilmesi, planlayıcıda
      tahmini başarı (araştırmayla artar, en çok %92), 16 yeni uçak (I-16, A6M2, Blenheim, P-40E, Pe-2, Yak-3, La-7,
      P-38J, F6F-5, Lancaster, Mosquito, He 162, F-80C, Vampire, Ar 234, Il-28). Yüksek ve hızlı jet bombardıman
      uçakları bombayı geç bırakıyordu (sabit 9 km bırakış sınırı; 10 km'den atılan bomba ~10 km ileri gider): sınır artık
      tahmini atım mesafesine göre büyüyor.
- [x] **Faz 2.4** — sesler (gerçek kayıtlar): motor (tipe göre, Doppler), yakın geçiş, kalibreye göre silahlar, uçaksavar, patlamalar, Ju 87 B
      sireni; hava saldırısı sireni, üs alarmı, çanlar, görev sonucu, zafer/yenilgi borazanı; ses ayarları ve sessiz düğmesi.
- [ ] **Faz 5 — Kampanya**: havadaki görevlerin de kaydı, ülke yapay zekâsı (ittifaklar), ülkeye özel ağaçlar

## Ayar notları

- Uçak verisi: `specs.ts` (`DEFS`); performans türetimi aynı dosyanın sonunda. Silah dengesi: `GT` tablosu (gerçek mermi başına hasar).
- Hasar ve sonuç oranları: `damage.ts` (infilak ihtimalleri), `world.ts` (`kill`, `updateFire`, `checkDeparture`).
- Modifikasyon etkileri: `mods.ts`. Araştırma süreleri ve önkoşullar: `tech.ts`.
- Başsız test: senaryoyu esbuild ile paketleyip Node'da N saniye koşturmak yeterli (sonuç dağılımı için toplu koşu).
