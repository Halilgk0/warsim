// Haberler (güncelleme notları): ana menünün sol üstünde en son haberin kutusu; tıklayınca bütün haberlerin listesi,
// bir habere tıklayınca ayrıntı sayfası (metin ve diğer görseller). Görseller public/news altında.

import { $, esc } from './dom';
import { SOUND_CREDITS } from '../audio/credits';
import { EN, L } from '../i18n';
import { NEWS_EN } from './newsEn';
import { socialLinks } from './social';

export interface NewsSection {
  heading?: string;
  text?: string[];
  bullets?: string[];
  /** Bağlantılı liste (yeni sekmede açılır): kaynak künyeleri. */
  links?: { text: string; href: string }[];
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
}

const img = (file: string) => `${import.meta.env.BASE_URL}news/${file}`;

/** En yeni en üstte. */
const NEWS_TR: NewsItem[] = [
  {
    id: 'ansiklopedi',
    date: '2026-10-30',
    title: 'Uçak ansiklopedisi, daha hızlı açılış, gerçek tavanlar',
    summary: 'Oyundaki 56 uçağın tarihçesi ve verileri artık ansiklopedide. Oyun telefonda çok daha çabuk açılıyor; avcılar gerçek tavanlarına tırmanıyor.',
    cover: img('ansiklopedi.jpg'),
    images: [
      { src: img('ansiklopedi-ucak.jpg'), caption: 'Her uçağın sayfasında tarihçe, künye, oyundaki modelin görselleri ve oyundaki değerleri.' },
    ],
    sections: [
      {
        text: [
          'Oyundaki bütün uçakların, 1937’nin Hurricane’inden süpersonik jetlere, artık kendi sayfası var: warsimbox.com/ansiklopedi.',
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

/** Geçerli dildeki haberler (İngilizcesi newsEn.ts'te; görsel ve tarih ortak). */
export const NEWS: NewsItem[] = EN
  ? NEWS_TR.map((n) => {
    const t = NEWS_EN[n.id];
    if (!t) return n;
    return { ...n, title: t.title, summary: t.summary, sections: t.sections, images: n.images.map((g, i) => ({ ...g, caption: t.captions?.[i] ?? g.caption })) };
  })
  : NEWS_TR;

const MONTHS = EN
  ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  : ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

/** Görsel ve üstünde tabana ortalanmış başlık (kutu, listede de aynı). */
export function newsCard(n: NewsItem, attrs: string, small = false): string {
  return `<button class="news-card${small ? ' small' : ''}" ${attrs}>
    <img src="${n.cover}" alt="" width="1280" height="720" loading="lazy">
    <span class="news-cap"><b>${esc(n.title)}</b><small>${fmtDate(n.date)}</small></span>
  </button>`;
}

/** Haberler penceresi: liste ya da tek haber. */
export class NewsView {
  isOpen = false;
  private el = $('news');
  private current: string | null = null;

  constructor() {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el) {
        this.close();
        return;
      }
      const b = t.closest<HTMLElement>('[data-nw]');
      if (!b) return;
      if (b.dataset.nw === 'close') this.close();
      else if (b.dataset.nw === 'back') this.show(null);
      else if (b.dataset.nw === 'open') this.show(b.dataset.id ?? null);
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.current) this.show(null);
        else this.close();
      }
      e.stopPropagation();
    });
  }

  /** Listeyi (id yoksa) ya da bir haberi aç. */
  open(id: string | null = null): void {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.show(id);
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  private show(id: string | null): void {
    this.current = id;
    const n = id ? NEWS.find((x) => x.id === id) : undefined;
    this.el.innerHTML = `<div class="news-sheet" tabindex="-1">${n ? this.article(n) : this.list()}</div>`;
    const sheet = this.el.querySelector<HTMLElement>('.news-sheet');
    sheet?.focus();
    if (sheet) sheet.scrollTop = 0;
  }

  private list(): string {
    return `<div class="news-head"><h2>${L('Haberler', 'News')}</h2>${socialLinks(true)}<button class="icon" data-nw="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
      <div class="news-list">${NEWS.map((n) => newsCard(n, `data-nw="open" data-id="${n.id}"`)).join('')}</div>`;
  }

  private article(n: NewsItem): string {
    const sec = n.sections.map((s) => `
      ${s.heading ? `<h3>${esc(s.heading)}</h3>` : ''}
      ${(s.text ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}
      ${s.bullets ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      ${s.links ? `<ul class="news-links">${s.links.map((l) => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.text)}</a></li>`).join('')}</ul>` : ''}`).join('');
    const gallery = n.images.map((g) => `<figure><img src="${g.src}" alt="" loading="lazy"><figcaption>${esc(g.caption)}</figcaption></figure>`).join('');
    return `<div class="news-head"><button class="news-back" data-nw="back">‹ ${L('Haberler', 'News')}</button><button class="icon" data-nw="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button></div>
      <article class="news-article">
        <img class="news-hero" src="${n.cover}" alt="">
        <div class="news-date">${fmtDate(n.date)}</div>
        <h2>${esc(n.title)}</h2>
        <p class="news-lead">${esc(n.summary)}</p>
        ${sec}
        ${gallery ? `<div class="news-gallery">${gallery}</div>` : ''}
      </article>`;
  }
}
