// Haberlerin verisi (Türkçe; İngilizcesi newsEn.ts'te, kimliğe göre). Oyun (news.ts) ve sunucu (haber e-postası,
// worker/newsMail.ts) birlikte okur: bu dosya ve newsEn.ts DOM'a, Vite'e ya da oyun koduna bağlı olmamalı.
// Yeni haber listenin en üstüne yazılır; en üstteki haber izin veren hesaplara e-postayla da gider (noMail değilse).

import { SOUND_CREDITS } from '../audio/credits';

export interface NewsSection {
  heading?: string;
  text?: string[];
  bullets?: string[];
  /** Bağlantılı liste (yeni sekmede açılır): kaynak künyeleri. */
  links?: { text: string; href: string }[];
  /** Haber videosu: oyunda oynatılır; e-postada kapak görseli videoya bağlantı olur. */
  video?: { src: string; poster: string; caption: string };
}

export interface NewsItem {
  id: string;
  /** Yayın günü (YYYY-AA-GG). */
  date: string;
  title: string;
  summary: string;
  cover: string;
  images: { src: string; caption: string }[];
  sections: NewsSection[];
  /** true: e-postayla duyurulmaz (yalnız oyunda). Yoksa en üstteki haber izin verenlere kendiliğinden gider. */
  noMail?: boolean;
}

/** Görsel yolu. Oyunda Vite'in taban adresi; sunucuda (worker, haber e-postası) kök. */
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export const img = (file: string): string => `${BASE}news/${file}`;

/** En yeni en üstte. */
export const NEWS_TR: NewsItem[] = [
  {
    id: 'kanyonlar',
    date: '2026-11-25',
    title: 'Yeni harita: Kanyonlar (erken erişim)',
    summary: 'Üçüncü harita geliyor: basamaklı platolar, derin bir nehir kanyonu, yan kanyon labirenti ve kızıl kaya sütunlarıyla dolu vadiler. Kanyonlar yapım aşamasında; ana menüde herkes inceleyebilir, harekât şimdilik 3. seviye destekçilere açık.',
    cover: img('kanyon-kapak.webp'),
    images: [
      { src: img('kanyon-plato.webp'), caption: 'Plato kenarı: katman katman inen yamaçlar ve ötede ana kanyon.' },
      { src: img('kanyon-nehir.webp'), caption: 'Ana kanyonun dibinde kıvrılan nehir, doğuda gölde biter.' },
      { src: img('kanyon-vadi.webp'), caption: 'Anıt vadisi: kızıl kumlu havzada tek başına yükselen kaya sütunları.' },
    ],
    sections: [
      {
        heading: 'Kanyonlar',
        text: [
          'Anakara ve Takımadalar’dan sonra üçüncü harita: kurak, yüksek ve kayalık bir çöl ülkesi.',
        ],
        bullets: [
          'Basamaklı platolar: 820 ile 1.300 m arasında, kenarları katman katman inen yamaçlar.',
          'Ortadan kıvrılarak geçen derin bir ana kanyon; dibinde nehir, doğuda göl.',
          'Ana kanyona açılan yan kanyonlardan bir labirent.',
          'Anıt vadileri: alçak, kızıl kumlu havzalar ve içlerinde yükselen kaya sütunları, mesalar, kule öbekleri.',
          'Platolarda ardıç, havzalarda adaçayı çalıları.',
        ],
      },
      {
        heading: 'Arazi savaşı değiştiriyor',
        bullets: [
          'Kanyon duvarları alçak uçan uçağı radardan saklayabilir: radar ufkunun altında kalan kol ancak yakına gelince görünür.',
          'Üs kuracak düz yer sınırlı: platolar ve havzalar arasında seçim yapmak gerekiyor.',
          'Uçaksavarı tepeye ya da plato kenarına kurmak görüşü ve menzili değiştirir.',
        ],
      },
      {
        heading: 'Erken erişim',
        text: [
          'Kanyonlar henüz yapım aşamasında. Harita ana menüde herkese açık: seçip arka planda inceleyebilirsin. Harekât başlatmak şimdilik 3. seviye destekçilere açık; tamamlanınca herkese açılacak.',
          'Yapım aşamasında olduğu için harita değişebilir; bu haritadaki kayıtlar sonraki sürümlerde açılmayabilir.',
        ],
      },
      {
        heading: 'Destekçi seviyeleri',
        bullets: [
          'Seviyeler artık sabit fiyatlı ve tek seferlik: 1. seviye 3 $, 2. seviye 7 $, 3. seviye 10 $. Üst seviyeye geçerken yalnız aradaki fark ödenir.',
          'Destekçi penceresi seviyeleri yan yana karşılaştırıyor: rozet, kayıt yeri, günlük geri bildirim hakkı ve erken erişim.',
          '3. seviyenin yeni ayrıcalığı erken erişim: yapım aşamasındaki harita ve özellikleri herkesten önce oynarsın.',
        ],
      },
      {
        heading: 'Düzeltmeler',
        bullets: [
          'Ana menüde harita büyüklüğü değişince başlangıç yerleri ve "Yeni yerler" düğmesi artık her büyüklükte görünüyor.',
          'Kamera ve uçaklar haritanın dışına çıkmıyor.',
        ],
      },
    ],
  },
  {
    id: 'katki-puani',
    date: '2026-11-24',
    title: 'Hata bildir, öneri gönder: katkı puanı ve rütbe kazan',
    summary: 'Geri bildirim penceresi yenilendi. Mesajının hata raporu mu öneri mi olduğunu seç ve incelenmesini iste. Doğrulanan hata raporları ve kabul edilen öneriler sana katkı puanı kazandırır; puanların seni rütbe rütbe yükseltir.',
    cover: img('katki-kapak.webp'),
    images: [
      { src: img('katki-tur.webp'), caption: 'Önce mesajının türünü seç: hata raporu ya da öneri.' },
      { src: img('katki-soru.webp'), caption: 'Gönder’e basınca incelenmesini isteyip istemediğin sorulur.' },
    ],
    sections: [
      {
        heading: 'Nasıl çalışır',
        bullets: [
          'Ana menüden ya da oyundaki menüden Geri bildirim’i aç ve mesajının türünü seç: Hata raporu ya da Öneri.',
          'Gönder’e basınca "İncelensin mi?" diye sorulur. Evet dersen mesajını okuyup karar veririz.',
          'Hata doğrulanır ya da önerin kabul edilirse katkı puanı kazanırsın. Hata düzeltilince ya da öneri oyuna eklenince puan kazanmaya devam edersin.',
          'Sonuç sana e-postayla gelir; mesajlarının durumunu Profil’inde de görürsün.',
          'Geri bildirim için e-postalı bir hesapla giriş yapman gerekir.',
        ],
      },
      {
        heading: 'Rütbeler',
        bullets: [
          'İlk onaylanan mesajınla ilk rütbe rozetini alırsın: Hangar çırağı.',
          'Toplam 13 rütbe var ve her birinin kendi rozeti. Sıradaki rütbe sürpriz: adı ve rozeti ancak ona ulaşınca açılır.',
          'Rozetin Profil’inde ve skor tablolarında adının yanında görünür. Profil’deki çubuk sıradaki rütbeye ne kadar kaldığını gösterir.',
          'Aynı hatayı ya da öneriyi önce kim bildirdiyse puan onundur.',
        ],
      },
    ],
  },
  {
    id: 'uc-bombardiman',
    date: '2026-11-22',
    title: 'Üç yeni jet bombardıman uçağı: Tu-14, B-57B ve Ar 234 C-3',
    summary: 'Araştırma ağacına üç jet bombardıman uçağı geldi. Üçü de gerçek çizim ve fotoğraflardan kuruldu; bomba kapakları, frenleri ve taretleri oyunda çalışıyor.',
    cover: img('3ucak-kapak.webp'),
    images: [],
    sections: [
      {
        heading: 'Yeni uçaklar',
        bullets: [
          'Tu-14: Il-28\'den sonra açılır. Bomba koşusunda bölme kapakları açılır, kuyruktaki nişancının çift toplu tareti hedefini izler.',
          'B-57B: Canberra ve eksenel kompresörden sonra açılır. Döner bomba kapısı 8 bombayı dışarı çevirir, hava freniyle kanatlardan parmak frenleri kalkar.',
          'Ar 234 C-3: Ar 234\'ten sonra açılır, dört motorludur. Kalkış roketleri 30 saniye yanar, havada atılıp paraşütle düşer.',
        ],
      },
      {
        heading: 'Düzeltmeler',
        bullets: [
          'Uçakların altındaki bombalar ve tanklar artık askılarında; havada asılı durmuyor.',
          'Jetlerin iniş takımı katlanırken kanadın üstünden çıkmıyor.',
          'Ağır bombardıman uçakları iniş için alçalırken tırmanmıyor; daha kısa sürede iniyorlar.',
          'İki ve üç kişilik mürettebatın hepsi kokpitte görünüyor.',
        ],
      },
      {
        video: { src: img('3ucak.mp4'), poster: img('3ucak-poster.webp'), caption: '' },
      },
    ],
  },
  {
    id: 'hasar-duman',
    date: '2026-11-22',
    title: 'Uçaklar artık parçalanıyor: hasar, duman ve patlamalar yenilendi',
    summary: 'Kanadı ya da kuyruğu kopan uçak kendi modelinden parçalara ayrılıyor, havada infilak eden uçağın parçaları dört bir yana dağılıyor. Duman kesintisiz bir iz bırakıyor, flak bulutları gökte asılı kalıyor, düşen uçak yerde yanıyor. Oyuncularımızın bildirdiği sorunlar da düzeltildi.',
    cover: img('hasar-kapak.webp'),
    images: [
      { src: img('hasar-kiyas.webp'), caption: 'Havada infilak: solda eski, sağda yeni.' },
      { src: img('hasar-kanat.webp'), caption: 'Kanadı kopan He 111: kanat motoru ve pervanesiyle ayrı düşüyor.' },
      { src: img('hasar-motor.webp'), caption: 'Motoru yanan He 111: alev geriye uzanıyor, duman kahverengiden karaya dönüyor.' },
      { src: img('hasar-flak.webp'), caption: 'Bombardıman kolunun çevresinde asılı kalan flak bulutları.' },
    ],
    sections: [
      {
        heading: 'Parçalanma',
        bullets: [
          'Kanadı kopan uçağın kanadı motoru ve pervanesiyle ayrı düşüyor, uçak öbür yana yuvarlanıyor. Kuyruğu kopanın kuyruk takımı ayrılıyor.',
          'Havada infilak eden uçağın gövdesi, kanatları, kuyruğu ve pervanesi ayrı ayrı dağılıyor. Yanan parçalar arkalarında duman kolları bırakıyor.',
          'Parçalar uçağın kendi boyasını taşıyor; gövde hızlı, kanat yaprak gibi süzülerek düşüyor ve yere çarpınca patlıyor.',
        ],
      },
      {
        heading: 'Duman, alev ve patlamalar',
        bullets: [
          'Duman artık aralıklı toplar değil, kesintisiz bir iz. Alev motordan ya da kanat kökünden geriye uzanıp titriyor; yakıt sızıntısının beyaz izi ayrı görünüyor.',
          'Havada infilak: flaş, ateş topu, kıvılcımlar ve yarım dakika asılı kalan bir bulut.',
          'Flak bulutları 20 saniyeye kadar gökte kalıyor. Flak isabet edince uçakta kıvılcım çıkıyor, küçük parçalar kopuyor.',
          'Yere çakılan uçak bir süre yanıyor, duman sütunu rüzgârla yatıyor. Enkaz parçaları kutu değil, bükük sac.',
          'Bulut ve yangınların süresi grafik kalitesine bağlı; telefonlarda kare hızı korunuyor.',
        ],
      },
      {
        heading: 'Oyuncu bildirimleriyle düzeltilenler',
        text: ['Bize yazan oyuncularımıza teşekkür ederiz.'],
        bullets: [
          'Kollar artık bütünüyle geri dönmüyor: yakıtı azalan uçak tek başına üsse dönüyor, kolun kalanı görevde kalıyor. Hedef düşünce kol bölgesinde 3 dakika devriye geziyor. Dönüşün nedeni ekranda yazıyor.',
          'Uçaksavar bataryasının panelinde isabet ettirdiği ve düşürdüğü uçak sayısı görünüyor.',
          'Hedefini uçaksavarla koruyan düşmana giden kollar artık bataryanın çevresinde daire çizmiyor, hedefe varıyor.',
          'Jetler birbirine karşı daha çok dönüş savaşına giriyor ve daha sık düşürüyor. Jetler savunmalı bombardıman uçaklarına dalıp geçerek saldırıyor, kuyruk nişancısının önünde oturmuyor.',
        ],
      },
    ],
  },
  {
    id: 'modeller-doku',
    date: '2026-11-20',
    title: 'Uçaklar ve uçaksavar topları yeniden dokulandı',
    summary: 'Araştırma ağacındaki 51 uçak ve 15 uçaksavar topu artık boyası, perçini ve yıpranmasıyla dokulu. Toplar ateş edince namludan alev ve duman çıkıyor, ağır topların çevresinde toz kalkıyor.',
    cover: img('modeller-kapak.webp'),
    images: [
      { src: img('modeller-kiyas.webp'), caption: 'Hangarda Bofors 40 mm: solda eski, sağda yeni doku.' },
      { src: img('modeller-batarya.webp'), caption: 'Bataryada dokulu 8,8 cm Flak, ateşten hemen sonra.' },
    ],
    sections: [
      {
        heading: 'Uçaklar',
        bullets: [
          'Araştırma ağacındaki 51 uçağın hepsi ve MiG-15 yeniden dokulandı: panel çizgileri, perçinler, motor kaputu vidaları, kumaş kaplı kumanda yüzeylerinde nervür bantları.',
          'Kamuflajlar dönemin düzenleriyle: RAF uçaklarında dalgalı Dark Earth ve Dark Green, Alman uçaklarında kıymık desenler ve benekler. Üst yüzler güneşte solmuş, motorun altında yağ izi var, basma yerlerinde ve hücum kenarlarında boya dökülmüş.',
          'Uçakların biçimi, uçuşu ve hasarı aynı kaldı. Uzaklaşınca uçak daha sade bir modele geçer, yaklaşınca ayrıntılı hâli döner; kare hızı korunur.',
        ],
      },
      {
        heading: 'Uçaksavar topları',
        bullets: [
          '15 topun hepsi dokulandı: kenarlarda aşınmış boyanın altından çelik görünür, üst yüzler solmuş, yanlarda yağmur izleri, yarıklarda kir, tabanda toz var. Mermi sandıklarında tahta damarı, kovanlarda kararmış pirinç.',
          'Kutuların ve plakaların kenarları artık yuvarlak; ışığı gerçek metal gibi yakalar. Boyalar orduların belgeli renklerinde kaldı.',
          'Hangar vitrininde, ansiklopedide ve üretim listesinde de yeni görünüm var.',
        ],
      },
      {
        heading: 'Ateş eden toplar',
        bullets: [
          'Orta ve ağır toplarda namlu ağzından kalibreyle büyüyen alev ve duman çıkar; ağır toplar ateş edince çevrelerinde toz kalkar. Eskiden yalnız küçük bir parlama vardı, 8,8 cm ateş etmiyormuş gibi görünüyordu.',
          'Hangar vitrinindeki topun alevi de artık namlu boyunca uzanıyor.',
        ],
      },
      {
        heading: 'Hangi ayarda görünür?',
        bullets: [
          'Dokulu modeller Orta ve Yüksek kalitede ve hangarda görünür. Düşük kalitede telefon akıcı kalsın diye sade modeller sürer.',
          'Bir uçak ya da top ilk kez ekrana gelince dokusu iner; o ana dek sade hâli görünür. İnternetsiz oyunda sade modeller kullanılır.',
        ],
      },
      {
        heading: 'Görünümdeki öteki yenilikler',
        bullets: [
          'Yüksek kalitede yakından bakınca binalar ve park eden uçaklar güneş gölgesi düşürür (Ayarlar → Grafik → Güneş gölgesi).',
          'Haritadaki çiftlikler ahır, silo, kümes ve meyve bahçesiyle yeniden yapıldı. Kayalar, bombalar ve roketler, üs ve fabrika ayrıntıları da yenilendi; inşa edilen bina iskeleler arasında yerden yükselir.',
        ],
      },
    ],
  },
  {
    id: 'ayarlar-takilma',
    date: '2026-11-20',
    // Yalnız oyunda: e-postayla model haberi gider (2026-11-20, kullanıcının kararı)
    noMail: true,
    title: 'Ayarlar yenilendi; oyun takılırsa söylüyor',
    summary: 'Ayarlar sekmelere ayrıldı, her satırda ne işe yaradığı yazıyor. Oyun cihazında takılırsa grafik ayarını düşürmeyi öneriyor.',
    cover: img('ayarlar.webp'),
    images: [
      { src: img('takilma.webp'), caption: 'Oyun takılınca çıkan öneri.' },
    ],
    sections: [
      {
        heading: 'Yeni ayarlar penceresi',
        bullets: [
          'Ayarlar beş sekmede: Grafik, Ses, Harita, Bilgi paneli, Oyun. Her ayarın simgesi ve kısa açıklaması var; bilgi panelinin her satırında panelde ne gösterdiği yazıyor.',
          'Satırın herhangi bir yerine dokunmak ayarı açıp kapatır. Kalite ve çözünürlük tek dokunuşla seçilir, altında neyi değiştirdikleri yazar.',
          'Seçili kalitede olmayan seçenekler (Düşükte bulut, Yüksek dışında güneş gölgesi) soluk görünür.',
          'Ağaç, kaya ve yerleşimler ile duman ve patlamalar, kare hızını etkiledikleri için Grafik sekmesine taşındı.',
        ],
      },
      {
        heading: 'Takılmaya karşı öneri',
        bullets: [
          'Oyun harekât sırasında kare hızını izler. 20 saniye boyunca akıcı gitmezse grafik ayarını bir basamak düşürmeyi önerir: Yüksekten Ortaya, Ortadan Düşüğe; Düşükte önce çözünürlük, sonra ağaçlar.',
          '“Grafik ayarlarını aç” dersen ayarlar açılır, önerilen seçenek işaretli olur; istediğini seçersin.',
          '“Şimdi değil” öneriyi 10 dakika susturur, “Bir daha sorma” bu cihazda bir daha sormaz.',
        ],
      },
    ],
  },
  {
    id: 'kasaba-itfaiye',
    date: '2026-11-14',
    title: 'Kasabaya yol açıldı: itfaiye ve bakım personeli',
    summary: 'Harekâtta her taraf artık belediye binası ve ana caddesiyle başlıyor. Evler nüfus sağlar; uçaklar bakım personeli ister, itfaiye yollardan hasarlı yapılara ulaşır.',
    cover: img('kasaba-kapak.webp'),
    images: [
      { src: img('kasaba.webp'), caption: 'Yeni kasaba yolları ve yol kenarındaki evler.' },
      { src: img('itfaiye.webp'), caption: 'Üçüncü seviyeye yükseltilmiş itfaiye merkezi.' },
    ],
    sections: [
      {
        heading: 'Yollar ve kasaba',
        bullets: [
          'Her taraf harekâta bir belediye binası ve önünden çıkan ana caddeyle başlar. Evler artık yol kenarına kurulur; yeni sokakları mevcut yollardan uzatabilirsin.',
          'Kasaba büyüdükçe evler ve apartmanlar nüfus sağlar. Belediye ekranında gelir ve personel dökümünü görebilirsin.',
        ],
      },
      {
        heading: 'Uçakların bakım ekibi',
        bullets: [
          'Her uçak için bir bakım personeli gerekir. Uçuş mürettebatından ayrı olan bu kişiler evlerden gelir; uçak üretime alınınca bakımcı da ayrılır.',
          'Bakım personeli yetersizse yeni uçak siparişi verilemez. Eski kayıtlar açıldığında, önceki uçaklarını kullanmaya devam edebilmen için gereken konutlar ücretsiz eklenir.',
        ],
      },
      {
        heading: 'Yollara çıkan itfaiye',
        bullets: [
          'İtfaiye merkezi evlerden personel alır. Ekipler, merkezin ulaşabildiği ve yol bağlantısı olan hasarlı yapıları onarır.',
          'İtfaiyenin yaptığı onarım elle onarımın yarı maliyetindedir. Merkez büyüyen kasabanın ihtiyacına göre yükseltilebilir.',
        ],
      },
      {
        heading: 'Haritada yeni ayrıntılar',
        bullets: [
          'Harekât haritasında küçük köyler, tek çiftlik evleri, yıkık evler ve terk edilmiş maden ocakları görebilirsin. Bunlar görsel süslerdir; oyun ekonomisine katılmaz.',
        ],
      },
      {
        heading: 'Şehir güncellemesi videosu',
        video: {
          src: img('city-update.mp4'),
          poster: img('city-update-poster.webp'),
          caption: 'Kasabalar, yollar ve itfaiye merkezleri (oyundan görüntüler).',
        },
      },
    ],
  },
  {
    id: 'ogretici-konular',
    date: '2026-11-14',
    // Yalnız oyunda: e-postayla duyurulmaz (2026-11-14, kullanıcının kararı)
    noMail: true,
    title: 'Öğretici artık konu konu',
    summary: 'Oyunun içinden istediğin konuyu açıp yalnız o kısmı izleyebilirsin. Adımlar artık kamerayı senin yapılarına götürüyor ve dokunmanı bekliyor.',
    cover: img('ogretici-konu.jpg'),
    images: [
      { src: img('ogretici-adim.jpg'), caption: 'Para ve hazine konusu: kamera madenine gider, sol panelden hazineye girersin.' },
    ],
    sections: [
      {
        heading: 'Konu listesi',
        bullets: [
          'Üst çubuktaki düğmelerin en solunda Öğretici var (telefonda yalnız kitap simgesi); duraklatma menüsünde de.',
          'Yedi konu: harita ve kamera, görev planlama ve kalkış, para ve hazine, inşa ve personel, üretim ve uçaksavar, araştırma ve hangar, düşman ve savaş.',
          'Bir konuya basınca yalnız onun adımları bu harekâtın içinde gösterilir. Bitince liste yeniden açılır, konu izlendi diye işaretlenir.',
          'Her konunun altında adımları yazılı; arama kutusuyla aradığını (maden, radar, kalkış…) bulursun.',
          'Liste açıkken oyun durur, kapatınca kaldığı hızla sürer.',
        ],
      },
      {
        heading: 'Daha etkileşimli adımlar',
        bullets: [
          'Adımlar yalnız yazı değil: kamera haritadaki madenine, fabrikana ya da bataryana gider; üstüne dokunur, sol panelden ilgili pencereye girersin.',
          'Toplu üretim ve "Bitince tekrarla", araştırmada sekme, kart ve dosya, düşman listesinden hedefe gitme de adım adım gösteriliyor.',
          'İlk harekâttaki baştan sona öğretici de bu adımları içeriyor; istediğin yeri atlayabilirsin.',
          '"Adımı geç" ve "Kapat" telefonda daha kolay basılıyor.',
        ],
      },
    ],
  },
  {
    id: 'me262-u4',
    date: '2026-11-11',
    title: 'Yeni uçak: Me 262 A-1a/U4',
    summary: 'Burnunda tek 50 mm top taşıyan Me 262 araştırma ağacına geldi: bombardıman kollarına nişancıların menzili dışından ateş eder. İki Me 262’nin modeli de yenilendi.',
    cover: img('me262u4.jpg'),
    images: [
      { src: img('me262u4-model.jpg'), caption: 'Me 262 A-1a/U4: 50 mm’lik namlu burnun yaklaşık iki metre önüne taşar.' },
      { src: img('me262-model.jpg'), caption: 'Me 262 A-1a: yeni boya ve gövdeye oturan alçak kanopi.' },
    ],
    sections: [
      {
        heading: 'Me 262 A-1a/U4',
        bullets: [
          'Me 262’nin burnundaki dört 30 mm top yerine tek bir 50 mm Mauser MK 214 A taşıyan deneme sürümü. 1945 ilkbaharında iki uçak dönüştürülüp denendi.',
          'Top dakikada 150 mermi atar, mermi namludan 920 m/sn hızla çıkar; uçak yaklaşık 30 mermi taşır.',
          'İsabet eden her mermi ağır hasar verir. Atış yavaş olduğu için avcıya karşı zayıftır.',
          'Gövde ve motorlar Me 262 ile aynı; top ve mermileri uçağı yaklaşık 250 kg ağırlaştırır.',
          'Araştırma ağacında Me 262’den sonra gelir. Ansiklopedide kendi sayfası var.',
        ],
      },
      {
        heading: 'Uzaktan ateş',
        bullets: [
          'U4 bombardıman kutusunun en yakın uçağına arkadan yaklaşır ve nişancıların menzili dışından ateş eder.',
          'Menzile girmeden yana kırar, yeniden arkaya geçip bir sonraki atışı yapar.',
          'Her mermi ayrı ayrı duyulur; mermi uzun namlunun ucundan çıkar.',
        ],
      },
      {
        video: { src: img('me262.mp4'), poster: img('me262-video.jpg'), caption: 'Me 262 ve U4 gün doğumunda bombardıman kollarına karşı (oyundan çekim).' },
      },
      {
        heading: 'İki Me 262’nin modeli yenilendi',
        bullets: [
          'Yeni boya: yanlarda açık zemin üstünde sık koyu yeşil ve kahve benekler, panel birleşimlerinde ve hücum kenarlarında aşınmış boya.',
          'Yüzey artık her yerde aynı parlaklıkta değil: mat ve hafif parlak yerler var, uçak biraz daha koyu. Plastik görünüm gitti.',
          'Kokpit yeniden yapıldı: kanopi alçaldı ve gövdeye yayıldı, gerçekteki gibi gövdenin devamı olarak duruyor.',
        ],
      },
    ],
  },
  {
    id: 'kayit-yerleri',
    date: '2026-11-10',
    title: 'Kayıtlar artık 4 yerde',
    summary: 'Her hesapta 4 kayıt yeri var. Otomatik kayıt kendi yerine yazılır, elle kayıtta yeri sen seçersin. Daha fazla kaydı olanların bir haftası var.',
    cover: img('kayit.jpg'),
    images: [
      { src: img('kayit-uyari.jpg'), caption: 'Fazla kaydı olan hesaba her girişte bu uyarı çıkar.' },
    ],
    sections: [
      {
        heading: 'Kayıt yerleri',
        bullets: [
          'Her hesapta 4 kayıt yeri var; her yerde bir kayıt durur.',
          'Menü → Kaydet ile bir yer seçersin. Boş yere hemen kaydedilir, dolu yerin üstüne yazmadan önce sorulur.',
          'Kayıtlar listesinde 4 yer sırayla görünür; boş yerler de.',
        ],
      },
      {
        heading: 'Otomatik kayıt',
        bullets: [
          'Oyun her 5 dakikada otomatik kaydedilmeye devam eder.',
          'Otomatik kayıt, aynı adlı oyunun önceki otomatik kaydının üstüne yazılır. Yeni bir adla başlarsan önce 4. yere, o doluysa boş bir yere yazılır.',
          'Boş yer yoksa oyun başlamadan söylenir: bir kaydı silebilir ya da otomatik kayıtsız oynayabilirsin. Oyun sırasında bir yer açılırsa otomatik kayıt kendiliğinden başlar.',
        ],
      },
      {
        heading: 'Daha fazla kaydın varsa',
        bullets: [
          'Bu düzenden önce 4’ten fazla kaydın varsa oyuna her girişte bir uyarı çıkar. Eski kayıtların Kayıtlar listesinde ayrı bir bölümde durur.',
          'İstemediklerini sil. Uyarıdan sonraki bir hafta içinde 4’e inmezse en yeni 4 kayıt dışındakiler kendiliğinden silinir; kalanlar yerlere yerleşir.',
          '4 ya da daha az kaydın varsa bir şey yapman gerekmez: kayıtların kendiliğinden yerlere yerleşti.',
        ],
      },
    ],
  },
  {
    id: 'ansiklopedi-hava',
    date: '2026-11-06',
    title: 'Ansiklopedi yenilendi: hava savunması, arama ve çelik görünüm',
    summary: 'Ansiklopedide artık 10 uçaksavar topunun da sayfası var. Liste sayfalarında arama ve sıralama, yeni çelik görünüm; uçakların boyaları oyunda da daha gerçekçi.',
    cover: img('ansiklopedi2.jpg'),
    images: [
      { src: img('ansiklopedi2-liste.jpg'), caption: 'Hava savunması: hafif, orta ve ağır uçaksavar topları.' },
      { src: img('ansiklopedi2-arama.jpg'), caption: 'Arama ve sıralama: ad, kısaltma, ülke ya da yıl yaz; yıla, ada ya da hıza göre sırala.' },
    ],
    sections: [
      {
        text: [
          'warsimbox.com/ansiklopedi yenilendi: uçakların yanında artık uçaksavar topları da var.',
        ],
      },
      {
        heading: 'Hava savunması bölümü',
        bullets: [
          'M2 Browning’den 12,8 cm Flak 40’a, oyundaki 10 uçaksavar silahının her birinin sayfası var: tarihçe, künye ve oyundaki modelin görseli.',
          'WarSimBox’ta bölümü: topun oyundaki menzili, etkili tavanı, pratik atış hızı, merminin tavana varma süresi ve araştırmada nasıl açıldığı.',
          'Hangarın Hava savunma bölümünde her topun altında “Tarihçesini ansiklopedide oku” bağlantısı.',
        ],
      },
      {
        heading: 'Arama ve sıralama',
        bullets: [
          'Liste sayfalarında arama kutusu: ad, kısaltma (bf109, p51), ülke, rol ya da yıl yaz.',
          'Uçakları yıla, ada ya da azami hıza; topları yıla, ada ya da kalibreye göre sırala.',
        ],
      },
      {
        heading: 'Yeni görünüm',
        bullets: [
          'Ansiklopedi oyundaki çelik görünüme geçti: baklavalı sac üst çubuk, metal kartlar, uçakların arkasında hangar.',
          'Kartlarda uçaklar artık yakından ve sağa bakıyor.',
          'Sağda temaya uygun yeni bir kaydırma çubuğu.',
        ],
      },
      {
        heading: 'Uçak boyaları (oyunda da)',
        bullets: [
          'Boyasız uçaklar (P-51D, B-17G, MiG-15…) beyaz değil, gerçekteki gibi gümüş: daha keskin parlama, ayrı tonlu levhalar.',
          'Boyalı uçaklarda levhalar farklı solmuş, hava akışı yönünde silik kir izleri var; mat boyanın plastik gibi parlaması kalktı.',
          'Vampire FB.5 artık 1950’lerin RAF kamuflajında: üstte koyu yeşil ve koyu deniz grisi, altta PRU mavisi.',
          'İniş takımları düzeltildi: P-51 ve P-47 gibi avcılarda kapaklar artık bacaktan ayrı durmuyor; B-17 ve Lancaster gibi bombardıman uçaklarında bacak lastiğin içinden geçmiyor, iki yanından iniyor.',
        ],
      },
    ],
  },
  {
    id: 'hava-savunmasi',
    date: '2026-11-05',
    title: 'Hava savunması yenilendi: gerçek toplar ve yeni araştırma hattı',
    summary: 'Uçaksavarlar artık gerçek sistemler: M2’den 12,8 cm Flak 40’a 10 top, kendi araştırma hattı, fabrikada üretim, bataryada silah yuvaları ve hangarda kendi vitrini.',
    cover: img('hava.jpg'),
    images: [
      { src: img('hava-yuva.jpg'), caption: 'Silah yuvası: o an takılı top ve depodaki toplar.' },
      { src: img('hava-pano.jpg'), caption: 'Araştırmada hava savunma panosu: hafif, orta ve ağır toplar, atış kontrol, tahkimat ve ihbar.' },
      { src: img('hava-hangar.jpg'), caption: 'Hangarda hava savunma: top döner, gerçek ritmiyle ateş eder; menzil ve tavan grafiği yanında.' },
    ],
    sections: [
      {
        heading: 'Gerçek toplar',
        bullets: [
          'Bataryalarda 10 gerçek sistem var: M2 Browning, 2 cm Flak 38, Oerlikon 20 mm, 2 cm Flakvierling 38, 3,7 cm Flak 36, Bofors 40 mm L/60, 8,8 cm Flak 36, 90 mm M1, 8,8 cm Flak 41 ve 12,8 cm Flak 40.',
          'Oerlikon, 90 mm M1 ve Flak 41 yeni. Eski topların modelleri de fotoğraflara bakılarak yenilendi.',
          'Mermi artık havada yavaşlar; şarjör, tarak ve pratik atış hızı gerçek verilerden gelir. 8,8 cm’nin mermisi 8 km’ye yaklaşık 20 saniyede çıkar, bu yüzden rota değiştiren uçağı kaçırabilir.',
        ],
      },
      {
        heading: 'Yeni batarya sistemi',
        bullets: [
          'Yeni batarya 2 silah yuvası ve 12,7 mm M2 ile başlar.',
          'Topu araştır, fabrikada istediğin kadar üret; biten top depoya girer.',
          'Bataryaya dokun, yuvayı seç, depodaki topu tak. Çıkan top depoya döner; takılırken o yuva ateş edemez.',
          'Yükseltmeyle yuva sayısı 4’e çıkar. Topları istediğin gibi karıştırabilirsin.',
          'Tahkimat II ve III artık yuva eklemez, bomba ve roket hasarını %15 ve %30 azaltır.',
        ],
      },
      {
        heading: 'Araştırma ve hangar',
        bullets: [
          'Hava savunma artık ayrı, üçüncü bir hat: uçak programları ve mühendislikle aynı anda ilerler. Radarlar da bu panoda.',
          'Hangar’da yeni bir Hava savunma bölümü var: top döner, namlusunu kaldırır, gerçek ritmiyle ateş eder. Kalibre, mermi, menzil ve tavan bilgileri orada.',
        ],
      },
      {
        heading: 'Rakipler',
        bullets: [
          'Botlar da bataryalarına daha iyi toplar kurar.',
          'Baskına her seferinde aynı avcılarla ve aynı sayıda karşılık vermezler; bazen hazırlıksız yakalanırlar.',
        ],
      },
      {
        heading: 'Eski kayıtlar',
        bullets: [
          'Kayıtlardaki toplar ve fazla yuvalar korunur. Yarım kalan hava savunma araştırmaları yeni hatta geçer.',
        ],
      },
    ],
  },
  {
    id: 'uretim-celik',
    date: '2026-11-05',
    title: 'Üretim menüsü, çelik görünüm ve gerçek zamanlı sayaç',
    summary: 'Bütün uçaklar ve toplar tek üretim listesinde. Üretim, Araştırma, Hangar ve Haberler yeni çelik görünümde. Oyun sayacı artık hızlanmıyor, telefonda menüler daha rahat.',
    cover: img('uretim.jpg'),
    images: [
      { src: img('celik-arastirma.jpg'), caption: 'Araştırma panosu: siluetin ve kartın rengi durumu söyler.' },
      { src: img('celik-hangar.jpg'), caption: 'Hangar: uçak artık çatı makasları altında, beton zeminde duruyor.' },
    ],
    sections: [
      {
        heading: 'Üretim menüsü',
        bullets: [
          'Bütün uçaklar ve uçaksavar topları uzun satırlar hâlinde tek listede: model, bilgiler, serviste ve bantta kaç tane olduğu, kalan süre.',
          'Toplu üretim: adedi − ve + ile seç, "Üret"e dokun. Bantta en çok 30 sipariş durur.',
          'Üretilen satırda yavaş bir akış döner. Görsel efektler kapalıysa görünmez.',
          'Araştırılmamışlar gri ve kilitli; dokununca araştırmasına gider.',
          'Üst çubukta Üretim düğmesi ve U tuşu var. Üssün yanındaki fabrikaya dokunmak da artık kolay.',
        ],
      },
      {
        heading: 'Çelik görünüm',
        bullets: [
          'Üretim, Silah yuvası, Araştırma, Hangar ve Haberler ağır metal bir görünüme geçti: soldan sağa koyu yeşilden siyaha, baklavalı sac başlıklar.',
          'Araştırma panosunda yeşil kart bitmiş, parlak kart başlatılabilir, kehribar kart sürüyor, gri kart önkoşul bekliyor.',
        ],
      },
      {
        heading: 'Gerçek zamanlı sayaç',
        bullets: [
          'Saatin yanındaki oyun süresi artık hızlandırmadan etkilenmez, duraklatınca durur. Olay günlüğü ve kayıt adları da bu süreyi gösterir.',
          'Günün saati ve üretim süreleri oyun hızıyla akmaya devam eder. Eski kayıtlarda sayaç kaldığı yerden sürer.',
        ],
      },
      {
        heading: 'Telefonda daha rahat',
        bullets: [
          'Yeni pencerelerde düğmeler büyüdü; "+" ile "Üret" arası açıldı.',
          'Araştırma ilk açılışta artık donmuyor, üretim listesi hemen açılıyor.',
          'Pencere açıkken arkadaki oyun daha seyrek çizilir, liste akıcı kayar.',
        ],
      },
      {
        heading: 'Öğretici',
        bullets: [
          'Öğretici üretim menüsünü, top takmayı, araştırmanın üç hattını ve hangarı da anlatıyor.',
        ],
      },
    ],
  },
  {
    id: 'pervaneliler',
    date: '2026-11-05',
    title: 'Pervaneli uçakların hepsi yenilendi',
    summary: 'Araştırma ağacındaki 40 pervaneli uçağın hepsi çizimlerden yeniden kuruldu: Hurricane’den B-29’a her uçağın kendi gövdesi, kanadı ve takımı var. Kumanda yüzeyleri oynuyor, takımlar katlanıyor.',
    cover: img('pervane.jpg'),
    images: [
      { src: img('pervane-avci.jpg'), caption: 'Avcılar ve taarruz uçakları: her birinin biçimi kendi çiziminden.' },
      { src: img('pervane-bomba.jpg'), caption: 'Bombardıman uçakları: camlı burunlar, taretler ve motor naselleri.' },
    ],
    sections: [
      {
        heading: 'Yeni modeller',
        bullets: [
          'Bütün pervaneliler üç görünüş çizimlerinden yeniden yapıldı; ölçüleri çizimlerden ve uçakların bilinen boyutlarından alındı.',
          'Her uçağın kendine özgü ayrıntıları var: Stuka’nın ters martı kanadı ve teker tulumları, Corsair’in kırık kanadı, P-38’in çift kirişi, I-16’nın açık kokpiti, Zero’nun uzun kapağı, Sea Fury’nin beş palalı pervanesi.',
          'Bombardıman uçaklarında taretler artık modelde gerçek yerinde ve mermiler oradan çıkıyor.',
          'Ayrıntılar en çok Orta ve Yüksek grafik kalitesinde görünür. Düşük’te biçim aynıdır, çizim sadedir.',
        ],
      },
      {
        heading: 'Hareketli parçalar',
        bullets: [
          'Kanatçık, irtifa ve istikamet dümeni uçağın manevrasına göre oynar, flaplar iner.',
          'İniş takımı kalkıştan sonra toplanır; her uçakta gerçekteki yöne: içe, dışa, arkaya ya da öne. Stuka’nın takımı gerçekte olduğu gibi sabittir.',
          'Pike uçaklarında pike frenleri açılır.',
          'Seyir lambaları sol kanatta kırmızı, sağ kanatta yeşil yanar.',
        ],
      },
      {
        heading: 'Yerde',
        bullets: [
          'Kuyruk tekerlekli uçaklar pistte ve park yerinde kuyrukları üstünde durur; her uçağın duruş açısı kendi ölçülerinden.',
          'Hurricane Mk I’in boyu 9,58 m olarak düzeltildi. Ansiklopedideki görseller de yeni modellerden üretildi.',
        ],
      },
    ],
  },
  {
    id: 'jetler',
    date: '2026-11-04',
    title: 'Jetler gerçek çizimlerden yeniden yapıldı, hava üsleri yenilendi',
    summary: 'Araştırma ağacındaki 11 jetin hepsi üç görünüş çizimlerinden yeniden kuruldu: kumanda yüzeyleri oynuyor, iniş takımı gövdeye katlanıyor. Hava üslerinde açık hangarlar ve gece ışıkları var.',
    cover: img('jetler.jpg'),
    images: [
      { src: img('jetler-liste.jpg'), caption: 'Yenilenen 11 jet: Me 262, Meteor, He 162, Ar 234, Vampire, F-80, F-84, F-86, MiG-15, Canberra ve Il-28.' },
      { src: img('jetler-takim.jpg'), caption: 'Kalkıştan hemen sonra MiG-15: takım gövdeye katlanıyor.' },
      { src: img('us-hangar.jpg'), caption: 'Gece, kapısı açık hangarda bekleyen bir MiG-15.' },
    ],
    sections: [
      {
        heading: 'Yenilenen jetler',
        text: [
          'Me 262, Meteor F.3, He 162, Ar 234, Vampire, F-80C, F-84G, F-86F, MiG-15, Canberra ve Il-28. Ölçüler gerçek üç görünüş çizimlerinden okundu, sonuç fotoğraflarla karşılaştırıldı.',
        ],
        bullets: [
          'Gövde, kanopi, hava girişi ve egzoz baştan yapıldı. Her uçağın kendine özgü ayrıntıları var: Ar 234’ün camlı burnu, F-84’ün kanat ucu tankları, Vampire’ın kuyruk kirişleri, Il-28’in nişancı kabini.',
          'Kanatçık, flap, irtifa ve istikamet dümeni uçağın o anki manevrasına göre oynar.',
          'İniş takımı kalkıştan sonra gövdeye katlanır.',
          'Seyir lambaları sol kanatta kırmızı, sağ kanatta yeşil yanar. Geceleri iniş farı önündeki yeri aydınlatır.',
          'Ayrıntılar en çok Orta ve Yüksek grafik kalitesinde görünür. Düşük’te biçim aynıdır, çizim sadedir; telefonda kare hızı korunur.',
          'Pervaneli uçaklar şimdilik eski modelleriyle uçuyor.',
        ],
      },
      {
        heading: 'Hava üsleri',
        bullets: [
          'Kapıları açık kemer hangarlar, T2 hangarlar, çadır hangarlar, kemer sığınaklar ve toprak siperler.',
          'En yeni uçakların hangarlarda ve sığınaklarda, diğerleri apronda durur.',
          'Akşam olunca pist, taksi yolu, apron ve hangar ışıkları yanar.',
          'Pist betonu, asfalt, oluklu sac, kanvas ve delikli çelik plakalar daha ayrıntılı.',
        ],
      },
    ],
  },
  {
    id: 'eposta',
    date: '2026-11-04',
    title: 'Hesaplara e-posta: doğrulama, hesap silme, yeni geri bildirim',
    summary: 'Yeni hesap açmak için e-posta doğrulaması gerekiyor. Mevcut hesaplar için zorunlu değil. Hesabını Profil’den silebilir, geri bildirimini doğrudan bize e-postayla ulaştırabilirsin.',
    cover: img('eposta.jpg'),
    images: [
      { src: img('eposta-kod.jpg'), caption: 'warsimbox@gmail.com adresinden gelen 6 haneli kodu yazman yeterli.' },
      { src: img('eposta-profil.jpg'), caption: 'E-posta adresi, haber izni, dil ve hesap silme Profil’de.' },
    ],
    sections: [
      {
        heading: 'Yeni hesap açarken',
        bullets: [
          'E-posta adresin gerekir; herhangi bir e-posta servisi olur. warsimbox@gmail.com adresinden gelen 6 haneli kodu yazınca adres kaydedilir.',
          'Gizlilik Politikası ve KVKK Aydınlatma Metni’ni kabul etmen gerekir. İki metne ana menüden de ulaşabilirsin.',
          'Bir e-posta adresiyle tek hesap açılır. Gmail’de noktalı ve “+etiketli” yazımlar aynı adres sayılır.',
        ],
      },
      {
        heading: 'Mevcut hesabın varsa',
        bullets: [
          'Oyun açılınca ya da giriş yapınca e-posta adresin sorulur, ama zorunlu değildir; kayıtların ve skorların yerinde kalır.',
          'Pencereyi kapatırsan 7 gün boyunca sorulmaz. Adresi istediğin zaman Profil’den ekleyebilirsin.',
        ],
      },
      {
        heading: 'Yenilik e-postaları isteğe bağlı',
        bullets: [
          'Yenilik e-postaları yalnız izin verene gönderilir. Bu izni kayıt olurken verebilir, sonra Profil’den açıp kapatabilirsin.',
          'Hesabın dili oyunda seçtiğin dille eşitlenir ve Profil’de görünür. E-postalar o dilde gelir.',
        ],
      },
      {
        heading: 'Hesabını silme',
        bullets: [
          'Profil’den şifrenle hesabını kendin silebilirsin. Kayıtların, skorların ve e-posta adresin de silinir; bu işlem geri alınamaz.',
        ],
      },
      {
        heading: 'Geri bildirim',
        bullets: [
          'Görüş ve önerilerin artık doğrudan e-posta kutumuza düşüyor. Bunları göndermek için e-postalı bir hesap gerekir.',
          '“Ben bu oyuna Steam’de … $ veririm” kısmı herkese açık: hesabın yoksa yalnız komutan adın yeter, hesabın varsa ad da sorulmaz.',
        ],
      },
    ],
  },
  {
    id: 'gorunum',
    date: '2026-11-04',
    title: 'Yeni görünüm, düzenli hangar, telefonda kolay yazma',
    summary: 'Arayüz sadeleşti, hangar nesil sekmelerine ayrıldı. Telefonda klavye yazılan alanı artık örtmüyor. Haberlerde okunmamış işareti de var.',
    cover: img('gorunum.jpg'),
    images: [
      { src: img('gorunum-tel.jpg'), caption: 'Kısa telefon ekranında ana menü. Haberler’in üstünde okunmamış haber sayısı var.' },
    ],
    sections: [
      {
        heading: 'Arayüz',
        bullets: [
          'Seçili öğe açık zeminde ve altında sönen bir uçak iziyle görünür.',
          'Oyun içi üst çubuklar ekranın tepesinden sarkar, pencere köşeleri çapraz kanat biçiminde.',
          'Pazar sadeleşti: kutu içinde kutu yerine düz satırlar var.',
          'Yan panellerin kapatma tuşları panelin hemen yanında.',
        ],
      },
      {
        heading: 'Hangar',
        bullets: [
          'Uçaklar nesil sekmelerine ayrıldı; liste artık ekrandan taşmıyor.',
          'Henüz uçurulamayan gelecek jetler listeden çıkarıldı. Hangarda gördüğün her uçak oyunda var.',
        ],
      },
      {
        heading: 'Telefon',
        bullets: [
          'Adres çubuğu açıkken ve kısa ekranlarda ana menü ve pencereler sığıyor.',
          'Klavye açılınca pencere ekranın üstüne dayanır, yazdığın alan görünür kalır.',
          'Giriş penceresi açılınca klavye kendiliğinden açılmaz; yazı alanına dokununca açılır.',
          '90–144 Hz ekranlarda oyun saniyede yaklaşık 60 kare çizer: telefon daha az ısınır.',
          'Otomatik çözünürlük, kasma başlayınca daha çabuk düşer. Telefonlarda grafik bir kereliğine Düşük’e alındı; sonra seçimin korunur.',
        ],
      },
      {
        heading: 'Okunmamış haberler',
        bullets: [
          'Hesabınla girdiğinde yeni haberler için Haberler’in üstünde sayı çıkar, listede “Yeni” yazar. Haberi açınca işaret kalkar; başka cihazda da kalkmış olur.',
        ],
      },
    ],
  },
  {
    id: 'ansiklopedi',
    date: '2026-10-30',
    title: 'Uçak ansiklopedisi, daha hızlı açılış, gerçek tavanlar',
    summary: 'Oyundaki 51 uçağın tarihçesi ve verileri artık ansiklopedide. Oyun telefonda çok daha çabuk açılıyor; avcılar gerçek tavanlarına tırmanıyor.',
    cover: img('ansiklopedi.jpg'),
    images: [
      { src: img('ansiklopedi-ucak.jpg'), caption: 'Her uçağın sayfasında tarihçe, künye, oyundaki modelin görselleri ve oyundaki değerleri.' },
    ],
    sections: [
      {
        text: [
          'Oyundaki bütün uçakların, 1937’nin Hurricane’inden Kore Savaşı jetlerine, artık kendi sayfası var: warsimbox.com/ansiklopedi.',
        ],
      },
      {
        heading: 'Uçak ansiklopedisi',
        bullets: [
          'Uçaklar eskiden yeniye sıralı. Her sayfada uçağın tarihçesi, künyesi (ilk uçuş, hizmete giriş, tasarımcı, motor, silahlar…) ve oyundaki modelinin görselleri var.',
          'WarSimBox’ta bölümü: uçağın oyundaki azami hızı, tırmanması, dönüşü, tutunma hızı ve araştırmada nasıl açıldığı.',
          'Ana menüde Ansiklopedi düğmesi; hangarda uçağın açıklamasının altında “Tarihçesini ansiklopedide oku” bağlantısı.',
          'Türkçe ve İngilizce.',
        ],
      },
      {
        heading: 'Daha hızlı açılış',
        bullets: [
          'Harita artık cihazın birkaç çekirdeğinde aynı anda hazırlanıyor: oyun eskisinden çok daha çabuk açılır, yükleme ekranı donmaz.',
          'Açılışta Anakara, menüde seçtiğin büyüklükte hazırlanır: orada yeni harekât beklemeden başlar.',
          'Başka harita ya da büyüklük seçince bekleme de kısaldı.',
        ],
      },
      {
        heading: 'Uçuş düzeltmeleri',
        bullets: [
          'Avcılar gerçek servis tavanlarına kadar tırmanır: motor gücünün irtifayla azalması her avcı için ayrı ayarlandı.',
          'Her uçağın gerçek azami hızı, en hızlı olduğu irtifadaki hızıdır: hiçbir irtifada bu hızı aşmaz.',
          'Jetlerde ses hızına yaklaşınca hava direnci gerçekteki gibi dikleşir; F-86 ile MiG-15 en hızlı alçakta uçar.',
        ],
      },
    ],
  },
  {
    id: 'yeni-adres',
    date: '2026-10-30',
    title: 'Yeni adres warsimbox.com: şifreli hesap, bulut kayıtları, skorlar',
    summary: 'Oyun kendi adresine taşındı. Hesaplar artık şifreli, kayıtlar bulutta; Skorlar sekmesinde haftalık ve tüm zamanlar sıralaması.',
    cover: img('hesap.jpg'),
    images: [],
    sections: [
      {
        text: [
          'WarSimBox artık kendi adresinde: warsimbox.com. Eski adres (warsimbox.vercel.app) bir süre açık kalacak, sonra kapanacak.',
        ],
      },
      {
        heading: 'Eski adreste oynadıysan',
        bullets: [
          'Kayıtların o tarayıcıda duruyor; yeni adres onları kendiliğinden göremez. Taşımak için eski adresi aç ve ana menüdeki “Şifre belirle”ye bas.',
          'Hesabına bir şifre belirle: o tarayıcıdaki kayıtların buluta yüklenir.',
          'Sonra warsimbox.com’da “Giriş yap”a bas, aynı ad ve şifreyle gir. Kayıtların Kayıtlar sekmesinde.',
          'Adın başkasınca alınmışsa başka bir ad seç; kayıtların yine taşınır.',
        ],
      },
      {
        heading: 'Şifreli hesap',
        bullets: [
          'Hesap ad ve şifreyle açılır. Skor tablosunda adını gören biri artık hesabına giremez.',
          'Hesap açınca bir kurtarma kodu gösterilir; bir yere yaz. Şifreni unutursan Giriş yap → Şifremi unuttum’dan bu kodla yeni şifre belirlersin.',
          'Kodu da kaybedersen Geri bildirim’den ya da sosyal medyadan bize yaz. Hesabın sana ait olduğunu birkaç soruyla doğrulayınca yeni kod veririz.',
        ],
      },
      {
        heading: 'Bulut kayıtları',
        bullets: [
          'Kayıtların sunucuda saklanır: başka telefondan ya da bilgisayardan aynı hesapla kaldığın yerden devam edersin.',
          'Bağlantı yoksa kayıt önce cihazına yazılır (“bu cihazda” etiketi), bağlantı gelince kendiliğinden yüklenir.',
        ],
      },
      {
        heading: 'Skorlar ve profil',
        bullets: [
          'Ana menüde Skorlar sekmesi: Düşürme, Zafer, Kazanç, en büyük Hava kuvveti ve oynama Süresi. Tüm zamanlar ve bu hafta.',
          'Yalnız hesapla oynanan harekâtlar sayılır; senaryolar ve misafir oyun sayılmaz. Süre gerçek zamandır: oyun açık ama başında değilsen işlemez.',
          'Profil: sağ üstte adına dokun (harekâtta ☰ Menü → Profil ve skorlar). Skorların, sıran ve şifre değiştirme orada.',
        ],
      },
    ],
  },
  {
    id: 'yeni-gorunum',
    date: '2026-10-28',
    title: 'Yeni görünüm: gökyüzü, bulutlar ve gün batımı',
    summary: 'Gün döngüsü, bulutlar, dalgalı deniz, yoğuşma izleri; uçaklar gerçek boyalarında, yapılar baştan yapıldı.',
    cover: img('grafik.jpg'),
    images: [
      { src: img('grafik-iz.jpg'), caption: 'Gün batımında 8,6 km’de B-17’ler: yüksekte uçan motorların arkasında yoğuşma izi.' },
      { src: img('grafik-bulut.jpg'), caption: 'Bulutlar rüzgârla sürüklenir ve araziye gölge düşürür.' },
      { src: img('grafik-deniz.jpg'), caption: 'Dalgalı, göğü yansıtan deniz ve güneşin parıltı yolu.' },
      { src: img('grafik-ucak.jpg'), caption: 'P-51D gerçek boyasında: kanopi yansıması, egzozlar, dönen pervane diski.' },
      { src: img('grafik-gece.jpg'), caption: 'Gece baskını: fabrikanın pencerelerinde ışık, gökte iz mermileri.' },
      { src: img('grafik-duman.jpg'), caption: 'Bombalanan yapılardan yükselen, rüzgârla bükülen duman sütunları.' },
    ],
    sections: [
      {
        text: [
          'WarSimBox’ın görünümü baştan yenilendi. Sade, low-poly üslup aynı kaldı; ışık, gökyüzü, su ve ayrıntılar çok daha zengin.',
        ],
      },
      {
        heading: 'Gök ve hava',
        bullets: [
          'Gökyüzü, güneş ve yükseklikle azalan pus: vadilerde hafif sis, yüksekte berrak hava; harita ufka kadar görünür.',
          'Gün döngüsü: bir oyun günü 48 dakika sürer. Gün doğumu, altın saat, gün batımı ve yıldızlı, ay ışıklı gece.',
          'Bulutlar: alçakta kümülüs ve stratokümülüs, yüksekte sirrüs. Rüzgârla sürüklenir, araziye gölge düşürür, gün batımında kızarır. Strateji görünümünde söner, harita okunur kalır.',
          'Deniz: dalgalar, göğü yansıtan su, güneşin (gece ayın) parıltı yolu, kıyıda köpük.',
        ],
      },
      {
        heading: 'Uçaklar',
        bullets: [
          'Her uçak gerçek fabrika boyasında: kamuflaj desenleri ve millî işaretler. Yalnız gerçekte boyasız olanlar (P-51D, B-17G, MiG-15…) metal.',
          'Ahşap, kumaş ve metal yüzeyler, panel çizgileri, perçinler, egzoz isi; kanopi yansıması, pilot, anten teli, dönen pervane diski.',
          'Takım rengi kalktı: dostu ve düşmanı etiket renginden, uzak görünümde takım renkli oklardan ayırırsın.',
          'Yüksekte (6,8 km üstü) uçan motorların arkasında yoğuşma izi oluşur, gün batımında turuncu-pembe ışır. Yapay zekâ da bu izi görür: izli uçak uzaktan fark edilir.',
        ],
      },
      {
        heading: 'Duman, ateş ve yapılar',
        bullets: [
          'Yumuşak duman ve kora dönen ateş topu. Bomba dumanı mantar gibi yükselir, yanan yapılardan rüzgârla bükülen kara sütunlar çıkar.',
          'Yapılar baştan: tuğla, sıva, beton ve oluklu sac; testere dişi çatılı fabrikalar, hangarlı ve kuleli hava üsleri, kum torbalı uçaksavar mevzileri, Freya radarı. Gece pencerelerde ışık yanar, bombalanan yapı kararır.',
          'Arazide tarla izleri, orman benekleri ve kaya katmanları.',
        ],
      },
      {
        heading: 'Grafik ayarları',
        bullets: [
          'Ayarlar → Grafik → Kalite: Düşük, Orta ya da Yüksek. Telefonlar akıcı oynasın diye varsayılan Düşük.',
          'Bulutlar, dalgalı deniz ve uçakların ince ayrıntıları Orta ve Yüksek kalitede görünür. Cihazın güçlüyse Yüksek’i dene.',
          'Gün döngüsü ve bulutlar ayrı ayrı kapatılabilir (gün döngüsü kapalıyken hep gündüz).',
        ],
      },
    ],
  },
  {
    id: 'ogretici',
    date: '2026-10-28',
    title: 'Öğretici: oyunu adım adım öğren',
    summary: 'Yeni başlayanlar için kısa bir öğretici: ilk görevini birlikte planlıyoruz.',
    cover: img('ogretici.jpg'),
    images: [{ src: img('ogretici-soru.jpg'), caption: '“Oyuna başla”ya basınca sorar: öğreticiyi başlat, kapat ya da bir daha sorma.' }],
    sections: [
      {
        text: [
          'Oyuna ilk girenlerin kafası karışıyordu; artık kısa bir öğretici var. “Oyuna başla”ya basınca sorar, yaklaşık 5 dakika sürer.',
        ],
      },
      {
        heading: 'Beş bölüm',
        bullets: [
          'Ana menü: dil, harita ve büyüklüğü, hesap, haberler, sosyal medya ve geri bildirim.',
          'Harita: kamerayı kaydırma, yakınlaştırma, döndürme ve zamanı hızlandırma.',
          'İlk görev: üssünü seçer, hangarına bakar, ilk hava devriyeni birlikte planlayıp kaldırır, kolunu takip edersin.',
          'Ülkeni büyüt: hazine, inşa, fabrika ve araştırma.',
          'Savaş: düşman hedefleri, alarm kolu ve nasıl kazanılır.',
        ],
      },
      {
        heading: 'Nasıl çalışır',
        bullets: [
          'Gösterilen yer dışında ekran kararır; yalnız o yere dokunabilirsin. Sen okurken oyun durur.',
          '“Sonraki bölüm” ile bir bölümü atlar, “Öğreticiyi bitir” ile çıkarsın.',
          '“Bir daha sorma”yı işaretlersen hesabın açıksa hesabına, değilse bu tarayıcıya kaydedilir.',
          'Harekâtın içinden de başlatılabilir: ☰ Menü → Öğretici.',
        ],
      },
      {
        heading: 'Ayrıca',
        bullets: [
          'Bizi takip et: ana menüde ve Haberler’in başında Instagram, YouTube ve TikTok bağlantıları var; yeni videoları orada paylaşıyoruz.',
        ],
      },
    ],
  },
  {
    id: 'harita-buyuklugu',
    date: '2026-10-28',
    title: 'Daha hızlı savaş: harita büyüklüğü ve boş yolda 2×',
    summary: 'Küçük 150, Orta 200 ya da Büyük 300 km harita seç; kolların yoldayken oyun kendiliğinden 2× akar.',
    cover: img('harita-boyut.jpg'),
    images: [{ src: img('otomatik-2x.jpg'), caption: 'Kol yoldayken 1× düğmesi sıcak renkte “2×” olur.' }],
    sections: [
      {
        text: [
          'Büyük haritada uçaklar hedefe uzun yol gidiyordu; oyunu hızlandırınca da savaşın tadı kaçıyordu. İki çözüm geldi.',
        ],
      },
      {
        heading: 'Harita büyüklüğü',
        bullets: [
          'Ana menüde haritanın altında: Küçük 150 km, Orta 200 km (varsayılan), Büyük 300 km. Yanında en yakın düşman üssünün uzaklığı yazar.',
          'Küçük haritada üsler birbirine yakın, savaş çabuk başlar; büyükte uçuşlar uzun sürer.',
          'Arazinin biçimi her büyüklükte aynı; pistler, şehirler ve yakın ayrıntı gerçek boyda kalır.',
          'Eski kayıtlar 300 km haritada açılır.',
        ],
      },
      {
        heading: 'Boş yolda otomatik 2×',
        bullets: [
          'Oyun 1×’teyken kolların yalnız yoldaysa (toplanma, hedefe gidiş, dönüş) oyun kendiliğinden 2× akar; 1× düğmesi sıcak renkte “2×” olur.',
          'Görev başlayınca (devriye, bombalama, taarruz, önleme), çatışmada, kalkış ve inişte ya da bilinen bir düşman kollarına veya yapılarına yaklaşınca hemen 1×’e döner.',
          'Başka bir hız seçersen ona dokunulmaz. Ayarlar → Oyun → “Boş yolda otomatik 2×” ile kapatılır.',
        ],
      },
    ],
  },
  {
    id: 'ingilizce',
    date: '2026-10-28',
    title: 'Artık İngilizce de var',
    summary: 'Ana menüdeki EN | TR düğmesiyle oyunu tek dokunuşla İngilizceye ya da Türkçeye çevir.',
    cover: img('dil.jpg'),
    images: [{ src: img('dil-menu.jpg'), caption: 'Ana menünün sağ üstündeki EN | TR düğmesi: koyu taraf seçili dili gösterir.' }],
    sections: [
      {
        text: [
          'WarSimBox artık İngilizce de oynanabiliyor. Ana menünün sağ üstündeki EN | TR düğmesine bir kez dokun: koyu taraf öbür dile kayar, pankart çeken küçük bir uçak ekrandan geçer ve oyun yeni dille açılır.',
        ],
      },
      {
        heading: 'Neler çevrildi',
        bullets: [
          'Menüler, paneller, görev planlayıcı, araştırma ağacı, pazar, inşa ve ayarlar.',
          'Uçakların açıklamaları, hangardaki veriler, senaryolar, haritalar ve haberler.',
          'Olay günlüğü ve uçakların o anda ne yaptığını anlatan yazılar (“Defensive: break turn” gibi).',
          'Sayılar ve birimler dile göre yazılır: İngilizcede 40%, 7.7 mm, 25,000 kr.',
        ],
      },
      {
        heading: 'Bilmekte fayda var',
        bullets: [
          'Oyun ilk açılışta tarayıcının diline göre başlar; seçtiğin dil bu cihazda hatırlanır.',
          'Dil yalnız ana menüden değişir. Oyun sürerken değiştirmek istersen önce kaydet, sonra ana menüye dön.',
          'Eski kayıtlarda yapı adları ve geçmiş olaylar kaydedildikleri dilde kalır; yeni harekât seçtiğin dille başlar.',
        ],
      },
      {
        heading: 'Ayrıca',
        bullets: ['Dizüstü ekranlarda (1280–1600 px) üst çubuk artık taşmıyor, düğme yazıları iki satıra kırılmıyor.'],
      },
    ],
  },
  {
    id: 'sesler',
    date: '2026-10-22',
    title: 'Sesler geldi',
    summary: 'Gerçek kayıtlar: savaş uçağı motorları, makineli ve toplar, flak, patlamalar, hava saldırısı sireni.',
    cover: img('sesler.jpg'),
    images: [],
    sections: [
      {
        text: [
          'WarSimBox artık sesli ve seslerin hepsi gerçek kayıt: hava gösterilerinde uçan savaş uçakları, atış alanları, top atışları ve gerçek bir hava saldırısı sireni. Yakınlaştıkça savaşın içine girersin; uzaklaştıkça çatışma uzaktan, boğuk ve yankılı duyulur, strateji görünümünde harita sessizleşir. Önemli olaylar ise kamera nerede olursa olsun duyulur.',
        ],
      },
      {
        heading: 'Uçaklar',
        bullets: [
          'Sıra motorlular Bf 109E’nin Daimler-Benz DB 601’i, yıldız motorlular Fw 190A’nın BMW 801’i, çok motorlular dört motorlu bir pervaneli uçak, jetler J79 turbojeti ile duyulur; devir gaza göre değişir, perde Doppler’le kayar.',
          'Yanından bir uçak geçerken tipine göre gerçek geçiş kaydı çalar: Spitfire, Bf 109, P-47, Fw 190, Lancaster, jet.',
          'Ju 87 B dalışa geçince sireni öter, hızlandıkça tizleşir.',
        ],
      },
      {
        heading: 'Silahlar ve patlamalar',
        bullets: [
          'Silahlar kalibreye ve namlu sayısına göre: tüfek çaplı makineliler İkinci Dünya Savaşı Maxim’inden, 12,7 mm .50 BMG atışlarından, 20 mm Lahti L-39’dan; atışlar gerçek ateş hızında dizilir, seri bitince yankısı duyulur.',
          'Uçaksavarda 37–40 mm “pom-pom”, 88–128 mm ağır top; havada patlayan şarapnel.',
          'Yakın ve uzak bomba patlamaları ayrı; uzaktaki patlamanın sesi ışığından biraz sonra gelir.',
        ],
      },
      {
        heading: 'Uyarılar',
        bullets: [
          'Düşman uçakları bölgene yaklaşınca hava saldırısı sireni çalar, yapın vurulunca elle çevrilen yangın zili.',
          'Araştırma raporu daktilo ziliyle, görev raporu telsizden Mors’la gelir; zaferde süvari hücumu borazanı, yenilgide “Taps”.',
        ],
      },
      {
        heading: 'Ayarlar',
        bullets: [
          'Sağ üstteki hoparlör (ya da N tuşu) sesi kapatıp açar.',
          'Ayarlar → Ses: genel ses, savaş sesleri, uyarılar ve arayüz ayrı ayrı ayarlanır.',
          'Telefonda ses gelmiyorsa telefonun sessiz düğmesine bak.',
        ],
      },
      {
        heading: 'Ses kayıtları',
        text: ['Kayıtlar Freesound.org’dan; hepsi ticari kullanıma açık (CC0 ya da CC BY). Kaydedenlere teşekkürler:'],
        links: SOUND_CREDITS.map((c) => ({ text: `${c.title.replace(/\.(wav|mp3|flac|aif|ogg)$/i, '')} — ${c.user} (${c.license})`, href: c.url })),
      },
    ],
  },
  {
    id: 'telefonda-oyna',
    date: '2026-10-21',
    title: 'Telefonda oyna',
    summary: 'Yatay telefona uygun düzen, dokunmatik kamera, haberler ve geri bildirim.',
    cover: img('telefon.jpg'),
    images: [],
    sections: [
      {
        text: [
          'WarSimBox artık telefonda da oynanıyor. Telefonu yan çevir: üst çubuk sıkışık düzene geçer, yan paneller kapalı başlar ve bir şey seçince ilgili panel açılır.',
        ],
      },
      {
        heading: 'Dokunmatik',
        bullets: [
          'Tek parmak haritayı kaydırır; iki parmak yakınlaştırır, çevirince döndürür, birlikte yukarı ya da aşağı kaydırınca eğer.',
          'Dokun: seç · çift dokun: uçağı takip et · uzun bas: iptal.',
          'İnşa ederken dokunuş yapının yerini gösterir; alttaki “Döndür”, “Yerleştir” ve “İptal” düğmeleriyle kurarsın.',
          'Tarayıcıdan “Ana ekrana ekle” dersen oyun tarayıcı çubukları olmadan açılır.',
        ],
      },
      {
        heading: 'Ana menüde yeni',
        bullets: [
          'Sol üstte haberler: güncelleme notları ve görseller.',
          'Sağda geri bildirim: görüşünü yaz, “Ben bu oyuna Steam’de … $ veririm” kısmını doldur; hesap açman gerekmez.',
          'Bilgisayarda oyun başlarken tam ekrana geçer; ⛶ düğmesi tam ekranı açıp kapatır.',
        ],
      },
    ],
  },
  {
    id: 'son-kalan-kazanir',
    date: '2026-10-21',
    title: 'Son kalan kazanır',
    summary: 'Harekâtın artık bir sonu var: elenme, zafer ve onarım.',
    cover: img('zafer.jpg'),
    images: [{ src: img('onarim.jpg'), caption: 'Hasarlı yapıyı seçip “Onar”a basman yeter.' }],
    sections: [
      {
        text: [
          'Harekât artık haritada tek bir ülke kalınca bitiyor. Hava üssü kalmayan ülkenin yenisini kurmaya başlamak için 5 dakikası var; kuramazsa elenir, kalan yapıları terk edilir ve havadaki uçakları tarafsız ülkelere iner.',
          'Son hava üssün yıkılınca ekranın üstünde geri sayım çıkar. Elenince ya da zafer kazanınca harekâtın özeti açılır; istersen haritada kalıp izlemeyi sürdürebilirsin.',
        ],
      },
      {
        heading: 'Onarım',
        text: [
          'Hasarlı yapılar artık onarılabiliyor. Yapıyı seç ve “Onar”a bas: onarım yavaş ilerler, bedeli adım adım ödenir. Vurulan yapının onarımı 10 dakika bekler; baskınlar arasındaki hasar geri gelir ama süren bir kuşatma silinmez.',
        ],
      },
      {
        heading: 'Daha hızlı ilerleyen oyun',
        bullets: [
          'Uçak, bina, üs tesisi, uçaksavar ve araştırma fiyatları %30 indi.',
          'Hava üssünün dayanıklılığı 3.000’den 1.600’e indi; tek bombayla yine yıkılmaz.',
          'Bir ana üssü yıkmak önceki sürümün yaklaşık yarısı kadar sürüyor.',
        ],
      },
    ],
  },
  {
    id: 'rakip-komutanlar',
    date: '2026-10-21',
    title: 'Rakip komutanlar akıllandı',
    summary: 'Botlar bütçe yapıyor, genişliyor ve bir plana göre saldırıyor.',
    cover: img('rakip-us.jpg'),
    images: [{ src: img('genisleme.jpg'), caption: 'Botlar zamanla ikinci ve üçüncü hava üslerini kuruyor.' }],
    sections: [
      {
        text: [
          'Rakip ülkeler parasını artık bölerek harcıyor: bir payı yeni madenlere ve üslere, bir payı filoya ve savunmaya, kalanı araştırmaya. Eskiden maden parası biriktirirken araştırmayı ve üretimi tamamen durduruyorlardı.',
        ],
      },
      {
        heading: 'Savunma ve yerleşim',
        bullets: [
          'Uçaksavar bataryaları korudukları yerin dibine kuruluyor: pistin, fabrikanın ve madenlerin yanına.',
          'Bataryalar artık hava üssünün tel örgüsünün hemen dışına kurulabiliyor; bu senin için de geçerli.',
          'Madenler ve radar düşmana bakmayan tarafa kuruluyor.',
        ],
      },
      {
        heading: 'Genişleme',
        text: [
          'Botlar zamanla ikinci ve üçüncü hava üslerini kuruyor, yeni üslere fabrika ekliyor ve uçaklarını üsler arasında paylaştırıyor. Ana üssü yıkılan bot öbür üssüyle savaşmayı sürdürüyor.',
        ],
      },
      {
        heading: 'Saldırı planı',
        text: [
          'Her bot bir hedef ülke seçiyor: önce çevresini (uçaksavarlar, radar, fabrika, madenler) vuruyor, sonra ana üsse yükleniyor. Botlar hep aynı ülkeye toplanmamaya çalışıyor.',
          'Alarm önleyicileri en az çift kalkıyor, kalabalık kola dörtlü; bombardıman uçaklarını önceliyor ve savunma bölgesinden çıkan düşmanı fazla kovalamıyor.',
        ],
      },
    ],
  },
  {
    id: 'ucaksavar-dalas',
    date: '2026-10-21',
    title: 'Uçaksavar ve dalaş yapay zekâsı',
    summary: 'Gerçekçi uçaksavar, kaçınma manevraları ve daha akıllı avcılar.',
    cover: img('b17.jpg'),
    images: [{ src: img('dalas.jpg'), caption: 'Alçakta bir it dalaşı: Spitfire’lar ve havada parçalanan bir Bf 109 F.' }],
    sections: [
      {
        heading: 'Uçaksavar',
        bullets: [
          'Toplar hedefe dönme hızıyla sınırlı: alçaktan ve hızlı geçen uçağı ağır toplar izleyemez.',
          'Ağır toplar hedefin gideceği yere ateş eder; telemetre, atış hesaplayıcı ve radar araştırmaları isabeti artırır.',
          'Uçaklar uçaksavar bölgelerinden kaçınıyor, ateş altında yön ve irtifa değiştiriyor.',
        ],
      },
      {
        heading: 'Avcılar',
        bullets: [
          'Avcılar savunmalı bombardıman kutusuna arkadan sürünmek yerine önden saldırıyor.',
          'Hızlı avcılar alçakta daha iyi dönen rakipten dönerek değil, zikzakla hız farkını açarak kaçıyor.',
          'Eskortlar korudukları kolun yanında S dönüşleriyle uçup hızlarını koruyor.',
        ],
      },
      {
        heading: 'Nişancılar',
        text: ['Bombardıman uçaklarının nişancıları gerçekçi isabetle ateş ediyor; motorlu taretler elle çevrilenlerden daha iyi izliyor.'],
      },
    ],
  },
  {
    id: 'gorev-dagilimi',
    date: '2026-10-20',
    title: 'Görev planlayıcıda görev dağılımı',
    summary: 'Kollarını ikiye böl, başarı tahminini yüküne göre gör.',
    cover: img('planlayici.jpg'),
    images: [],
    sections: [
      {
        text: [
          'Bir uçak tipini iki işe bölebiliyorsun: devriyede bir kısmı eskort avcılarına, bir kısmı bombardıman uçaklarına; pike bombardımanı ve taarruzda bir kısmı önce hedefin çevresindeki uçaksavarı bastırır.',
        ],
      },
      {
        bullets: [
          'Başarı tahmini, taşıdığın yükün hedefi yıkmaya yetip yetmeyeceğini hesaplıyor (“Beklenen hasar ≈%21, gereken %12”).',
          'Yakın eskort koruduğu kol düşerse paketteki diğer kolu korumaya geçiyor.',
          'Aktif görevler panelinde her kolun görevi yazıyor.',
        ],
      },
    ],
  },
  {
    id: 'yeni-ucaklar',
    date: '2026-10-19',
    title: 'Görev sonuçları ve 16 yeni uçak',
    summary: 'Görevler başarılı, başarısız ya da sonuçsuz biter; ödül yalnız başarıda.',
    cover: img('arastirma.jpg'),
    images: [],
    sections: [
      {
        text: [
          'Her görev uçuşta gerçekten olana göre sonuçlanıyor. Ödül yalnız başarılı görevde veriliyor; planlayıcı tahmini başarı şansını gösteriyor. Araştırma şansı artırır ama hiçbir görev kesin değildir.',
        ],
      },
      {
        heading: 'Yeni uçaklar',
        text: [
          'I-16, A6M2 Sıfır, Blenheim, P-40E, Pe-2, Yak-3, La-7, P-38J, F6F-5 Hellcat, Lancaster, Mosquito, He 162, F-80C, Vampire, Ar 234 ve Il-28 araştırma ağacına eklendi.',
        ],
      },
    ],
  },
  {
    id: 'yeni-haritalar',
    date: '2026-10-19',
    title: '300 km’lik iki yeni harita',
    summary: 'Anakara ve Takımadalar: dört kat geniş savaş alanları.',
    cover: img('harita.jpg'),
    images: [],
    sections: [
      {
        text: [
          'Haritalar 300 × 300 km’ye büyüdü. Anakara dağlar ve körfezle ayrılmış geniş bir ülke; Takımadalar altı adadan ve ortadaki tarafsız volkan adasından oluşuyor. Ana menüden haritanı ve düşman sayısını (1–5) seçebilirsin.',
        ],
      },
      {
        bullets: [
          'Pike bombardımanında nişan düzeltildi: bombaların çoğu artık hedefin 60 m yakınına düşüyor.',
          'Yüksekten uçan jet bombardıman uçakları bombayı doğru mesafede bırakıyor.',
        ],
      },
    ],
  },
  {
    id: 'ana-menu',
    date: '2026-10-19',
    title: 'Ana menü, hesaplar ve kayıtlar',
    summary: 'Adınla giriş yap, oyununu kaydet, kaldığın yerden devam et.',
    cover: img('menu.jpg'),
    images: [],
    sections: [
      {
        text: [
          'Oyun artık ana menüyle açılıyor; arkada rakip ülkeler kendi aralarında savaşıyor. Sağ üstten yalnız bir adla giriş yapabilirsin; aynı adla tekrar girdiğinde kayıtların seni bekler.',
        ],
      },
      {
        bullets: [
          'Esc ile duraklatma menüsü: devam, kaydet, kayıtlar ve görünüm ayarları.',
          'Oyun akarken 5 dakikada bir otomatik kayıt alınır.',
          'Misafir oyunlar kaydedilmez.',
        ],
      },
    ],
  },
  {
    id: 'ekonomi',
    date: '2026-10-19',
    title: 'Ekonomi: para, madenler ve pazar',
    summary: 'Her şeyin bir bedeli var; gelir madenlerden ve savaştan.',
    cover: img('pazar.jpg'),
    images: [],
    sections: [
      {
        text: [
          'Uçak üretmek, bina kurmak ve araştırma yapmak para istiyor. Gelir dört yerden geliyor: maden ocakları, düşürülen düşman uçakları, yıkılan düşman yapıları ve tarafsız ülkelere uçak satışı.',
        ],
      },
      {
        bullets: [
          'Maden verimi yerden yere çok değişir ve haritada görünmez; kurmadan bilinmez.',
          'Pazarda İsveç, İsviçre, İspanya, Portekiz, Arjantin ve Türkiye uçak satıyor.',
          'Üst çubuktaki hazine çipinden kasanı ve defterini görebilirsin.',
        ],
      },
    ],
  },
  {
    id: 'gercek-ucaklar',
    date: '2026-10-18',
    title: 'Gerçek uçaklar, gerçek fizik',
    summary: 'Gerçek verilerle uçan uçaklar ve ayrıntılı hasar modeli.',
    cover: img('ucus.jpg'),
    images: [],
    sections: [
      {
        text: [
          'Her uçak gerçek kütlesi, kanat alanı, motor gücü ve silahlarıyla tanımlandı; atmosfer, Mach etkileri, pervane ve jet itkisi hesaplanıyor.',
        ],
      },
      {
        bullets: [
          'Bileşen hasarı: motor, yakıt, kumandalar, yangın ve infilak.',
          'Düşen uçağın mürettebatı paraşütle atlayabilir; kendi bölgesine inenler geri döner.',
          'Serbest mühimmat düzeni: askı noktası başına bomba, roket ya da yakıt tankı.',
        ],
      },
    ],
  },
];
