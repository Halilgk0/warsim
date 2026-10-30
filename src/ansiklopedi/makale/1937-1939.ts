// Ansiklopedi makaleleri, 1937–1939 uçakları (katalog yılına göre).

import { t, type Article } from '../tur';

export const A1937_1939: Article[] = [
  {
    id: 'hurricane1',
    summary: t(
      'RAF’ın ilk tek kanatlı avcısı. Britanya Muharebesi’nde en kalabalık İngiliz avcısıydı.',
      'The RAF’s first monoplane fighter and the most numerous British fighter in the Battle of Britain.',
    ),
    lead: t(
      'Hawker Hurricane, Kraliyet Hava Kuvvetleri’nin (RAF) ilk tek kanatlı avcısı ve yatay uçuşta saatte 300 milin (483 km/sa) üstüne çıkan ilk RAF avcısıdır. 1940 yazında Britanya Muharebesi’nde Spitfire’dan daha kalabalıktı; RAF’ın o yaz düşürdüğü Alman uçaklarının çoğu Hurricane pilotlarına yazıldı.',
      'The Hawker Hurricane was the Royal Air Force’s first monoplane fighter and the first RAF fighter to exceed 300 mph (483 km/h) in level flight. In the summer of 1940 it outnumbered the Spitfire in the Battle of Britain, and Hurricane pilots were credited with most of the German aircraft the RAF shot down that summer.',
    ),
    facts: [
      { k: t('İlk uçuş', 'First flight'), v: t('6 Kasım 1935 (prototip K5083, Brooklands)', '6 November 1935 (prototype K5083, Brooklands)') },
      { k: t('Hizmete giriş', 'Entered service'), v: t('Aralık 1937, 111. Filo', 'December 1937, No. 111 Squadron') },
      { k: t('Tasarımcı', 'Designer'), v: t('Sydney Camm', 'Sydney Camm') },
      { k: t('Üretici', 'Manufacturer'), v: t('Hawker Aircraft; lisansla Gloster ve Kanada’da Canadian Car & Foundry', 'Hawker Aircraft; under licence by Gloster and Canadian Car & Foundry') },
      { k: t('Üretim', 'Number built'), v: t('14.500’ü aşkın (bütün sürümler)', 'More than 14,500 (all variants)') },
      { k: t('Motor', 'Engine'), v: t('Rolls-Royce Merlin II ya da III, V12, 1.030 bg', 'Rolls-Royce Merlin II or III, V12, 1,030 hp') },
      { k: t('Azami hız', 'Top speed'), v: t('Yaklaşık 520 km/sa, 5.300 m’de (pervaneye göre değişir)', 'About 520 km/h at 5,300 m (varies with the propeller)') },
      { k: t('Silahlar', 'Armament'), v: t('8 × 7,7 mm Browning makineli tüfek, namlu başına 334 mermi', '8 × .303 in (7.7 mm) Browning machine guns, 334 rounds per gun') },
      { k: t('Mürettebat', 'Crew'), v: t('1', '1') },
      { k: t('Kanat açıklığı / uzunluk', 'Span / length'), v: t('12,19 m / 9,84 m', '12.19 m / 9.84 m') },
    ],
    sections: [
      {
        h: t('Çift kanatlıdan tek kanatlıya', 'From biplane to monoplane'),
        p: [
          t(
            'Hawker’ın baş tasarımcısı Sydney Camm, şirketin başarılı Fury çift kanatlısından yola çıkarak kapalı kokpitli, içeri katlanan iniş takımlı bir tek kanatlı avcı çizdi. Gövde, Hawker’ın çift kanatlılarda kullandığı yöntemle yapıldı: çelik borulardan bir iskelet, arka yarısında ahşap çıtalar ve kumaş kaplama.',
            'Hawker’s chief designer Sydney Camm started from the company’s successful Fury biplane and drew a monoplane fighter with an enclosed cockpit and retractable undercarriage. The fuselage was built the way Hawker built its biplanes: a frame of steel tubes with wooden formers and fabric covering over the rear half.',
          ),
          t(
            'Bu tutucu yapı, uçağı hem çabuk üretilir hem de kolay onarılır yaptı: fabrikalar ve birlik atölyeleri zaten bildikleri işi yapıyordu. Hava Bakanlığı, kısa bir atışta bir bombardıman uçağını düşürecek ateş gücü istedi; bu yüzden kanatlara sekiz makineli tüfek kondu. Haziran 1936’da 600 uçaklık ilk sipariş verildi. İlk Hurricane’lerin kanadı da kumaş kaplıydı; 1939’dan itibaren metal kaplı kanat geldi.',
            'This conservative structure made the aircraft quick to build and easy to repair: factories and squadron workshops were doing work they already knew. The Air Ministry wanted enough firepower to bring down a bomber in a short burst, so eight machine guns went into the wings. The first production order, for 600 aircraft, came in June 1936. Early Hurricanes also had fabric-covered wings; metal-skinned wings arrived from 1939.',
          ),
        ],
      },
      {
        h: t('Britanya Muharebesi', 'The Battle of Britain'),
        p: [
          t(
            '1940 yazında RAF Savaş Komutanlığı’nın Hurricane filoları Spitfire filolarından fazlaydı. Genelde Hurricane’ler bombardıman kollarına, daha hızlı Spitfire’lar refakatçi Bf 109’lara gönderildi; ama bu bir kural değildi, iki uçak da her iki işi yaptı.',
            'In the summer of 1940 RAF Fighter Command had more Hurricane squadrons than Spitfire squadrons. Hurricanes were usually sent against the bomber formations and the faster Spitfires against the escorting Bf 109s, but this was no strict rule; both aircraft did both jobs.',
          ),
          t(
            'Kalın kanadı ve geniş iz açıklıklı iniş takımı onu sağlam, dengeli bir silah platformu yaptı; dönüşte de iyiydi. Kumaş kaplı gövdeden top mermileri çoğu zaman patlamadan geçip giderdi ve hasarlı uçak birlikte kısa sürede yeniden uçar hâle getirilebilirdi.',
            'Its thick wing and wide-track undercarriage made it a sturdy, steady gun platform, and it turned well. Cannon shells often passed through the fabric-covered fuselage without exploding, and a damaged aircraft could be made airworthy again quickly at squadron level.',
          ),
        ],
      },
      {
        h: t('Zayıf yanları', 'Weaknesses'),
        p: [
          t(
            'Hurricane, Bf 109 E’den yavaştı; fark yüksek irtifada büyüyordu. Kalın kanat dalışta hızı sınırlıyordu. İlk uçakların iki palalı, sabit adımlı ahşap pervanesi kalkışı ve tırmanışı zayıflatıyordu; 1940 yazına doğru sabit devirli pervaneler takılınca uçak belirgin biçimde iyileşti.',
            'The Hurricane was slower than the Bf 109 E, and the gap grew with altitude. The thick wing limited its speed in a dive. The two-bladed, fixed-pitch wooden propeller of early aircraft hurt take-off and climb; once constant-speed propellers were fitted towards the summer of 1940, the aircraft improved markedly.',
          ),
          t(
            'Merlin motorunun şamandıralı karbüratörü, burun aniden aşağı bastırılınca (eksi G) yakıtsız kalıyor ve motor bir an kesiliyordu. Doğrudan yakıt püskürtmeli motoru olan Bf 109 pilotları bunu biliyor, takipten burnu bastırıp pikeye geçerek kurtuluyordu.',
            'The Merlin’s float carburettor starved under negative g, when the nose was pushed down sharply, and the engine cut out for a moment. Bf 109 pilots, whose engine had direct fuel injection, knew this and escaped pursuit by pushing over into a dive.',
          ),
        ],
      },
      {
        h: t('Savaşın her cephesinde', 'On every front'),
        p: [
          t(
            'Hurricane 1940’ta Fransa’da, sonra Malta’da, Kuzey Afrika’da, Birmanya’da ve Uzak Doğu’da savaştı. Gemilerden mancınıkla fırlatılan "Hurricat"lar Atlantik konvoylarını korudu; Ödünç Verme ve Kiralama programıyla binlercesi Sovyetler Birliği’ne gönderildi. Türk Hava Kuvvetleri de savaş yıllarında Hurricane kullananlar arasındaydı.',
            'The Hurricane fought in France in 1940, then over Malta, in North Africa, Burma and the Far East. Catapult-launched "Hurricats" protected Atlantic convoys, and thousands went to the Soviet Union under Lend-Lease. The Turkish Air Force was also among its wartime users.',
          ),
          t(
            'Sonraki sürümler daha güçlü Merlin’ler ve daha ağır silahlar aldı: on iki makineli tüfekli Mk IIB, dört 20 mm toplu Mk IIC ve tanklara karşı iki 40 mm toplu Mk IID. Son Hurricane 1944 yazında, "The Last of the Many" (Çokların sonuncusu) adıyla fabrikadan çıktı.',
            'Later versions got more powerful Merlins and heavier weapons: the twelve-gun Mk IIB, the Mk IIC with four 20 mm cannon and the Mk IID with two 40 mm anti-tank guns. The last Hurricane left the factory in the summer of 1944, named "The Last of the Many".',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda dönüş avcısıdır: dalaşta yatay dönüşle kazanır, Bf 109 karşısında hızı ve tırmanışı yetmez. Tutunma kaybına girerken sarsılarak uyarır, kolay vrilleye girmez. Merlin’in eksi G’de kesilmesi de modellenmiştir: arkanıza takılan Bf 109 burnunu bastırıp kaçabilir.',
        'In the game it is a turn fighter: it wins dogfights in the horizontal and lacks the speed and climb to fight a Bf 109 on its terms. It shudders as a warning before it stalls and does not spin easily. The Merlin’s negative-g cut-out is modelled too: a Bf 109 on your tail can push over and get away.',
      ),
    ],
  },
  {
    id: 'spitfire1',
    summary: t(
      'Eliptik kanatlı efsane. Savaş boyunca üretimi hiç durmayan tek Müttefik avcısı.',
      'The legend with the elliptical wing, the only Allied fighter built throughout the entire war.',
    ),
    lead: t(
      'Supermarine Spitfire, eliptik kanadı ve Rolls-Royce Merlin motoruyla İkinci Dünya Savaşı’nın en tanınan avcılarından biridir. Savaştan önce üretimine başlanıp savaş boyunca hiç ara vermeden yapılan tek Müttefik avcısıdır; bütün sürümleriyle 20.000’i aşkın Spitfire üretildi.',
      'The Supermarine Spitfire, with its elliptical wing and Rolls-Royce Merlin engine, is one of the best-known fighters of the Second World War. It was the only Allied fighter in production before the war and throughout it without a break; more than 20,000 Spitfires of all versions were built.',
    ),
    facts: [
      { k: t('İlk uçuş', 'First flight'), v: t('5 Mart 1936 (prototip K5054, Eastleigh)', '5 March 1936 (prototype K5054, Eastleigh)') },
      { k: t('Hizmete giriş', 'Entered service'), v: t('Ağustos 1938, 19. Filo (Duxford)', 'August 1938, No. 19 Squadron (Duxford)') },
      { k: t('Tasarımcı', 'Designer'), v: t('R. J. Mitchell; 1937’deki ölümünden sonra Joseph Smith', 'R. J. Mitchell; after his death in 1937, Joseph Smith') },
      { k: t('Üretici', 'Manufacturer'), v: t('Supermarine (Vickers-Armstrongs); Castle Bromwich fabrikası', 'Supermarine (Vickers-Armstrongs); the Castle Bromwich factory') },
      { k: t('Üretim', 'Number built'), v: t('20.000’i aşkın (bütün sürümler)', 'More than 20,000 (all variants)') },
      { k: t('Motor', 'Engine'), v: t('Rolls-Royce Merlin II ya da III, V12, 1.030 bg', 'Rolls-Royce Merlin II or III, V12, 1,030 hp') },
      { k: t('Azami hız', 'Top speed'), v: t('Yaklaşık 580 km/sa, 5.600 m’de', 'About 580 km/h at 5,600 m') },
      { k: t('Silahlar', 'Armament'), v: t('8 × 7,7 mm Browning makineli tüfek, namlu başına 300 mermi', '8 × .303 in (7.7 mm) Browning machine guns, 300 rounds per gun') },
      { k: t('Mürettebat', 'Crew'), v: t('1', '1') },
      { k: t('Kanat açıklığı / uzunluk', 'Span / length'), v: t('11,23 m / 9,12 m', '11.23 m / 9.12 m') },
    ],
    sections: [
      {
        h: t('Yarış uçaklarından avcıya', 'From racing seaplanes to a fighter'),
        p: [
          t(
            'Supermarine’in baş tasarımcısı Reginald J. Mitchell, Schneider Kupası’nı kazanan yarış deniz uçaklarını tasarlamıştı; S.6B 1931’de kupayı İngiltere’ye kalıcı olarak kazandırdı. Mitchell’in ilk avcı denemesi olan açık kokpitli Type 224 başarısız olunca, bu yarış uçaklarının dersleriyle yepyeni bir uçak çizdi.',
            'Supermarine’s chief designer Reginald J. Mitchell had designed the racing seaplanes that won the Schneider Trophy; the S.6B won it outright for Britain in 1931. When his first fighter attempt, the open-cockpit Type 224, failed, he drew an entirely new aircraft using the lessons of those racers.',
          ),
          t(
            '"Spitfire" adını Vickers’ın başkanı Sir Robert McLean önerdi. Mitchell, uçağının hizmete girdiğini göremedi: Haziran 1937’de, 42 yaşında kanserden öldü. Tasarımı yardımcısı Joseph Smith sürdürdü ve Spitfire’ı savaş boyunca geliştiren ekibin başında o kaldı.',
            'The name "Spitfire" was suggested by Vickers chairman Sir Robert McLean. Mitchell did not live to see his aircraft enter service: he died of cancer in June 1937, aged 42. His deputy Joseph Smith carried the design on and led the team that developed the Spitfire throughout the war.',
          ),
        ],
      },
      {
        h: t('Eliptik kanat', 'The elliptical wing'),
        p: [
          t(
            'Spitfire’ın simgesi olan kanat, ince olduğu için sürüklemesi azdı; elips biçimi hem indüklenmiş sürüklemeyi düşük tutuyor hem de kökünde iniş takımına ve silahlara yer bırakıyordu. Kanadın aerodinamiğinde Kanadalı mühendis Beverley Shenstone’un büyük payı vardı.',
            'The wing that became the Spitfire’s signature was thin and therefore low in drag; its elliptical shape kept induced drag low while leaving room at the root for the undercarriage and guns. The Canadian engineer Beverley Shenstone had a large share in its aerodynamics.',
          ),
          t(
            'Bütünüyle metal, gerilimli kaplamalı yapı ve karmaşık kavisli kanat, üretimi zorlaştırdı. İlk siparişler gecikti; seri üretim ancak fabrikalar bu yapıya alıştıkça hızlandı.',
            'The all-metal stressed-skin structure and the complex curved wing made it hard to build. The first orders ran late, and mass production only gathered pace as the factories got used to the design.',
          ),
        ],
      },
      {
        h: t('Britanya Muharebesi', 'The Battle of Britain'),
        p: [
          t(
            '1940’ta Spitfire Mk I, Bf 109 E’ye en yakın İngiliz rakipti. Spitfire daha dar dönüyordu; Bf 109 ise tırmanışta ve dalışta üstündü ve topları vardı. Merlin’in şamandıralı karbüratörü eksi G’de motoru bir an kesiyordu; Alman pilotlar takipten burnu bastırıp pikeye geçerek kaçabiliyordu.',
            'In 1940 the Spitfire Mk I was the closest British match for the Bf 109 E. The Spitfire turned tighter; the Bf 109 was better in the climb and the dive, and it carried cannon. The Merlin’s float carburettor cut the engine out for a moment under negative g, so German pilots could escape by pushing over into a dive.',
          ),
          t(
            'Muharebeden hemen önce ve sırasında iki değişiklik Spitfire’ı belirgin biçimde güçlendirdi: sabit devirli pervaneler ve motora daha fazla basınç veren 100 oktan yakıt. Kanatçıklar alçak hızda hafifti, ama yüksek hızda giderek ağırlaşıyor ve dalışta yuvarlanmayı zorlaştırıyordu.',
            'Two changes just before and during the battle made the Spitfire markedly stronger: constant-speed propellers and 100-octane fuel, which allowed higher boost. The ailerons were light at low speed but grew ever heavier at high speed, making it hard to roll in a dive.',
          ),
        ],
      },
      {
        h: t('Sonraki sürümler', 'Later versions'),
        p: [
          t(
            'Spitfire savaş boyunca sürekli geliştirildi: 1941’de daha güçlü motorlu ve top taşıyan Mk V, 1942’de Fw 190’a yanıt olarak iki kademeli kompresörlü Merlin’le Mk IX, sonra daha büyük Griffon motorlu sürümler. Uçak gemisi sürümünün adı Seafire’dı. Üretim 1948’e kadar sürdü; Türk Hava Kuvvetleri de Spitfire kullanan hava kuvvetleri arasındaydı.',
            'The Spitfire was developed throughout the war: in 1941 the more powerful, cannon-armed Mk V; in 1942 the Mk IX with a two-stage supercharged Merlin as an answer to the Fw 190; later, versions with the larger Griffon engine. The carrier version was called the Seafire. Production continued until 1948, and the Turkish Air Force was among the Spitfire’s users.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda Hurricane’den hızlı ve çevik, ama daha az dayanıklıdır. Kanatçıkları gerçekteki gibi yüksek hızda ağırlaşır: alçak hızlı dönüş dalaşında güçlü, hızlı bir dalıştan sonra yuvarlanması yavaştır. Merlin’in eksi G’de kesilmesi burada da vardır.',
        'In the game it is faster and more agile than the Hurricane but less robust. As in reality, the ailerons stiffen at high speed: it is strong in a slow turning fight and slow to roll after a fast dive. The Merlin’s negative-g cut-out is here too.',
      ),
    ],
  },
  {
    id: 'ju87b',
    summary: t(
      'Ters martı kanatlı, sirenli pike bombardıman uçağı: yıldırım harbinin simgesi.',
      'The gull-winged, siren-wailing dive bomber that became the symbol of the Blitzkrieg.',
    ),
    lead: t(
      'Junkers Ju 87, kısaca “Stuka”, ters martı kanadı ve dalışta öten sirenleriyle İkinci Dünya Savaşı’nın en tanınan uçaklarından biridir. Adı, Almancada pike bombardıman uçağı anlamına gelen “Sturzkampfflugzeug” kelimesinin kısaltmasıdır. Neredeyse dik dalarak bombasını çok isabetli bırakırdı; ama yavaştı ve avcılara karşı savunmasızdı.',
      'The Junkers Ju 87, the “Stuka”, with its inverted gull wing and the sirens that wailed as it dived, is one of the best-known aircraft of the Second World War. Its name is short for “Sturzkampfflugzeug”, German for dive bomber. Diving almost vertically, it placed its bomb with great accuracy; but it was slow and vulnerable to fighters.',
    ),
    facts: [
      { k: t('İlk uçuş', 'First flight'), v: t('17 Eylül 1935 (prototip Ju 87 V1)', '17 September 1935 (prototype Ju 87 V1)') },
      { k: t('Hizmete giriş', 'Entered service'), v: t('Ju 87 A 1937; Ju 87 B 1938 sonu', 'Ju 87 A in 1937; Ju 87 B in late 1938') },
      { k: t('Tasarımcı', 'Designer'), v: t('Hermann Pohlmann (Junkers)', 'Hermann Pohlmann (Junkers)') },
      { k: t('Üretici', 'Manufacturer'), v: t('Junkers; lisansla Weserflug', 'Junkers; under licence by Weserflug') },
      { k: t('Üretim', 'Number built'), v: t('Yaklaşık 6.500 (bütün sürümler)', 'About 6,500 (all variants)') },
      { k: t('Motor', 'Engine'), v: t('Junkers Jumo 211Da, ters V12, 1.200 PS (kalkış)', 'Junkers Jumo 211Da, inverted V12, 1,200 PS (take-off)') },
      { k: t('Azami hız', 'Top speed'), v: t('Yaklaşık 390 km/sa, 4.000 m civarında', 'About 390 km/h at around 4,000 m') },
      { k: t('Silahlar', 'Armament'), v: t('Kanatlarda 2 × 7,92 mm MG 17, arkada 1 × 7,92 mm MG 15; gövde altında 500 kg’a kadar bomba, kanat altlarında 4 × 50 kg', '2 × 7.92 mm MG 17 in the wings, 1 × 7.92 mm MG 15 in the rear cockpit; up to 500 kg under the fuselage and 4 × 50 kg under the wings') },
      { k: t('Mürettebat', 'Crew'), v: t('2 (pilot ve arka nişancı)', '2 (pilot and rear gunner)') },
      { k: t('Kanat açıklığı / uzunluk', 'Span / length'), v: t('13,8 m / 11,1 m', '13.8 m / 11.1 m') },
    ],
    sections: [
      {
        h: t('Dik dalış fikri', 'The idea of the steep dive'),
        p: [
          t(
            '1930’ların başında bir bombayı küçük bir hedefe isabet ettirmenin en güvenilir yolu, hedefe neredeyse dik dalıp bombayı alçakta bırakmaktı. Ernst Udet, 1933’te ABD’de Curtiss pike bombardıman uçaklarının gösterisini izledi ve iki uçak satın aldırdı; fikir Alman Hava Bakanlığı’nda yandaş buldu.',
            'In the early 1930s the most reliable way to hit a small target was to dive at it almost vertically and release the bomb low. Ernst Udet watched Curtiss dive bombers being demonstrated in the United States in 1933 and had two bought; the idea found supporters in the German Air Ministry.',
          ),
          t(
            'Junkers’te Hermann Pohlmann’ın çizdiği uçak, kısa ve sağlam bir iniş takımı ile iyi bir aşağı görüş veren ters martı kanadı, sabit ve kaportalı tekerlekleri ve kanat altında hava frenleriyle tasarlandı. İlk prototip 1935’te İngiliz Rolls-Royce Kestrel motoruyla uçtu; Ocak 1936’da bir dalışta çift dikey kuyruğu dayanmadı ve uçak düştü. Seri uçaklar tek, büyük bir dikey kuyrukla yapıldı.',
            'The aircraft Hermann Pohlmann drew at Junkers had an inverted gull wing, which allowed a short, strong undercarriage and gave a good view downwards, fixed spatted wheels, and dive brakes under the wings. The first prototype flew in 1935 with a British Rolls-Royce Kestrel engine; in January 1936 its twin tail failed in a dive and the aircraft crashed. Production aircraft got a single, large fin.',
          ),
        ],
      },
      {
        h: t('Bir Stuka nasıl dalardı', 'How a Stuka dived'),
        p: [
          t(
            'Pilot hedefin üstünde uçağı yana yatırıp burnu aşağı verir, hava frenlerini açar ve 60 ila 90 derece arasında dalardı; kanopinin yanındaki çizgiler dalış açısını gösterirdi. Bomba gövdenin altında, pervaneye çarpmasın diye aşağı doğru savrulan bir kolda taşınırdı.',
            'Over the target the pilot rolled the aircraft over, put the nose down, opened the dive brakes and dived at between 60 and 90 degrees; lines on the side of the canopy showed the dive angle. The bomb hung under the fuselage on a crutch that swung it down and clear of the propeller.',
          ),
          t(
            'Bomba birkaç yüz metre yükseklikte bırakılınca otomatik toparlanma sistemi uçağı dalıştan kendiliğinden çıkarırdı; yüksek G’de pilot bir an kendinden geçse bile uçak toparlanırdı. İniş takımlarındaki küçük pervaneli sirenler, “Jericho trompetleri”, dalışta yükselen bir çığlık çıkarır ve yerdekileri korkuturdu.',
            'Once the bomb was released a few hundred metres up, an automatic pull-out system brought the aircraft out of the dive by itself, so it recovered even if the pilot briefly blacked out under the high g. Small propeller-driven sirens on the undercarriage legs, the “Jericho trumpets”, rose to a scream during the dive and terrified those on the ground.',
          ),
        ],
      },
      {
        h: t('Yıldırım harbi ve Britanya', 'Blitzkrieg and Britain'),
        p: [
          t(
            'Stuka, İspanya İç Savaşı’nda denendi; 1939’da Polonya’da ve 1940’ta Fransa’da, gökyüzü Luftwaffe’nin elindeyken kara birliklerine yakın destekte çok etkili oldu ve yıldırım harbinin simgesi hâline geldi.',
            'The Stuka was tried out in the Spanish Civil War. In Poland in 1939 and France in 1940, with the Luftwaffe in control of the sky, it was very effective in close support of the ground forces and became the symbol of the Blitzkrieg.',
          ),
          t(
            'Britanya Muharebesi bunun tersini gösterdi: Hurricane ve Spitfire’lara karşı yavaş Stuka’lar, özellikle dalıştan çıkarken çok savunmasızdı. Ağustos 1940’taki ağır kayıplardan sonra İngiltere’ye yapılan saldırılardan çekildi.',
            'The Battle of Britain showed the other side: against Hurricanes and Spitfires the slow Stukas were very vulnerable, above all as they pulled out of their dives. After heavy losses in August 1940 they were withdrawn from attacks on Britain.',
          ),
        ],
      },
      {
        h: t('Doğu Cephesi ve sonrası', 'The Eastern Front and after'),
        p: [
          t(
            'Stuka savaşın sonuna kadar kullanıldı. Daha güçlü motorlu ve zırhlı D sürümü Doğu Cephesi’nde kara desteğinin yükünü taşıdı; kanat altında iki 37 mm top taşıyan G sürümü tank avcısı oldu. Hava üstünlüğünün olmadığı yerde ise giderek daha çok gece saldırılarında kullanıldı. İtalya, Macaristan, Romanya ve Bulgaristan da Stuka kullandı.',
            'The Stuka served until the end of the war. The more powerful, more heavily armoured D version bore the brunt of ground support on the Eastern Front, and the G version, with two 37 mm cannon under the wings, became a tank hunter. Where air superiority was lost, it was used more and more for night attacks. Italy, Hungary, Romania and Bulgaria also flew Stukas.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda pike bombardıman uçağıdır: yaklaşık 75 derece dalar, hava frenlerini açar ve bombasını yaklaşık 650 m’de bırakır, isabeti yüksektir. “Pike nişangâhı ve otomatik toparlanma” araştırması isabet hatasını daha da azaltır. Yavaştır; düşman avcılarının olduğu yere refakatsiz gönderilirse ağır kayıp verir. Arkadaki nişancı tek bir MG 15 ile kendini savunur.',
        'In the game it is a dive bomber: it dives at about 75 degrees with its dive brakes open and releases its bomb at about 650 m, with high accuracy. The “Dive sight and automatic pull-out” research cuts its aiming error further. It is slow: sent without escort where enemy fighters are about, it suffers heavy losses. The rear gunner defends it with a single MG 15.',
      ),
    ],
  },
  {
    id: 'bf109e',
    summary: t(
      'Tarihin en çok üretilen avcısı. “Emil”, Britanya Muharebesi’nde Spitfire’ın baş rakibiydi.',
      'The most-produced fighter in history. The “Emil” was the Spitfire’s great rival in the Battle of Britain.',
    ),
    lead: t(
      'Messerschmitt Bf 109, savaş boyunca Alman avcı gücünün belkemiğiydi ve yaklaşık 34.000 adetle tarihin en çok üretilen avcı uçağıdır. Pilotların “Emil” dediği E sürümü 1939–1940’ta Polonya’da, Fransa’da ve Britanya Muharebesi’nde savaştı; Hurricane ve Spitfire’ın baş rakibiydi.',
      'The Messerschmitt Bf 109 was the backbone of the German fighter force throughout the war and, at about 34,000 built, is the most-produced fighter aircraft in history. The E version, which pilots called the “Emil”, fought in Poland, France and the Battle of Britain in 1939–1940 as the great rival of the Hurricane and the Spitfire.',
    ),
    facts: [
      { k: t('İlk uçuş', 'First flight'), v: t('29 Mayıs 1935 (prototip Bf 109 V1, Augsburg)', '29 May 1935 (prototype Bf 109 V1, Augsburg)') },
      { k: t('Hizmete giriş', 'Entered service'), v: t('Bf 109 B 1937; E sürümü 1939', 'Bf 109 B in 1937; the E version in 1939') },
      { k: t('Tasarımcı', 'Designer'), v: t('Willy Messerschmitt ve Robert Lusser', 'Willy Messerschmitt and Robert Lusser') },
      { k: t('Üretici', 'Manufacturer'), v: t('Bayerische Flugzeugwerke (1938’den Messerschmitt AG); lisansla Erla, Fieseler ve başka fabrikalar', 'Bayerische Flugzeugwerke (Messerschmitt AG from 1938); under licence by Erla, Fieseler and others') },
      { k: t('Üretim', 'Number built'), v: t('Yaklaşık 34.000 (bütün sürümler)', 'About 34,000 (all variants)') },
      { k: t('Motor', 'Engine'), v: t('Daimler-Benz DB 601A ya da Aa, ters V12, doğrudan yakıt püskürtmeli, 1.175 PS’e kadar', 'Daimler-Benz DB 601A or Aa, inverted V12 with direct fuel injection, up to 1,175 PS') },
      { k: t('Azami hız', 'Top speed'), v: t('Yaklaşık 560 km/sa, 4.500 m civarında', 'About 560 km/h at around 4,500 m') },
      { k: t('Silahlar', 'Armament'), v: t('Motor kaputunda 2 × 7,92 mm MG 17 (namlu başına 1.000 mermi), kanatlarda 2 × 20 mm MG FF/M (namlu başına 60 mermi)', '2 × 7.92 mm MG 17 above the engine (1,000 rounds per gun), 2 × 20 mm MG FF/M in the wings (60 rounds per gun)') },
      { k: t('Mürettebat', 'Crew'), v: t('1', '1') },
      { k: t('Kanat açıklığı / uzunluk', 'Span / length'), v: t('9,87 m / 8,64 m', '9.87 m / 8.64 m') },
    ],
    sections: [
      {
        h: t('Küçük, hafif, modern', 'Small, light, modern'),
        p: [
          t(
            'Bf 109, 1930’ların ortasında Luftwaffe’nin yeni avcı yarışması için tasarlandı: tamamen metal gövde, içeri katlanan iniş takımı, kapalı kokpit ve kanadın hücum kenarında, alçak hızda kendiliğinden açılan yarıklar (slat). Adındaki “Bf”, uçağı yapan Bayerische Flugzeugwerke’den gelir; şirket 1938’de Messerschmitt AG olunca sonraki tasarımlar “Me” diye anıldı.',
            'The Bf 109 was designed in the mid-1930s for the Luftwaffe’s new fighter competition: an all-metal fuselage, retractable undercarriage, an enclosed cockpit and slats on the wing’s leading edge that opened by themselves at low speed. The “Bf” in its name comes from Bayerische Flugzeugwerke, the company that built it; once the firm became Messerschmitt AG in 1938, later designs were called “Me”.',
          ),
          t(
            'Alman motorları henüz hazır olmadığı için ilk prototip, ilginç bir rastlantıyla, İngiliz Rolls-Royce Kestrel motoruyla uçtu. Yarışmada Heinkel He 112’ye üstün geldi.',
            'Because German engines were not yet ready, the first prototype flew, by an odd twist, with a British Rolls-Royce Kestrel engine. It won the competition against the Heinkel He 112.',
          ),
        ],
      },
      {
        h: t('İspanya’dan Britanya’ya', 'From Spain to Britain'),
        p: [
          t(
            'İlk Bf 109’lar 1937’de İspanya’da Lejyon Kondor ile savaştı. Burada Werner Mölders ve arkadaşları, avcıların sıkı kollar yerine gevşek ikili ve dörtlü gruplar hâlinde uçtuğu düzeni geliştirdi; bu “parmak dörtlüsü” düzenini sonra bütün hava kuvvetleri benimsedi.',
            'The first Bf 109s fought in Spain with the Condor Legion in 1937. There Werner Mölders and his comrades developed a system in which fighters flew in loose pairs and fours instead of tight formations; this “finger-four” formation was later adopted by every air force.',
          ),
          t(
            'Doğrudan yakıt püskürtmeli DB 601 motorlu E sürümü Polonya’da ve Fransa’da üstünlük kurdu. Britanya Muharebesi’nde Hurricane’den hızlıydı, tırmanışta ve dalışta Spitfire’dan da iyiydi; motoru eksi G’de kesilmediği için takipten burnu bastırıp pikeye geçerek kurtulabiliyordu. En büyük zayıflığı menziliydi: Fransa’dan kalkan bir Emil, Londra üzerinde ancak birkaç dakika kalabiliyordu.',
            'The E version, with the fuel-injected DB 601, dominated over Poland and France. In the Battle of Britain it was faster than the Hurricane and better than the Spitfire in the climb and the dive; because its engine did not cut out under negative g, it could escape pursuit by pushing over into a dive. Its greatest weakness was range: an Emil taking off from France could stay over London for only a few minutes.',
          ),
        ],
      },
      {
        h: t('Zayıf yanları', 'Weaknesses'),
        p: [
          t(
            'Gövdeye bağlı, dar açıklıklı iniş takımı yüzünden kalkış ve inişte çok kaza oldu. Kokpit dardı, kalın çerçeveli kanopi arkayı görmeyi zorlaştırıyordu. Yüksek hızda kumandaları, özellikle kanatçıkları çok ağırlaşırdı. Kanattaki 20 mm MG FF topları güçlüydü ama yavaş ateş ediyordu ve namlu başına yalnız 60 mermileri vardı.',
            'Its narrow-track undercarriage, attached to the fuselage, caused many accidents on take-off and landing. The cockpit was cramped and the heavily framed canopy made it hard to see behind. At high speed the controls, especially the ailerons, became very heavy. The 20 mm MG FF wing cannon were powerful but slow-firing, with only 60 rounds per gun.',
          ),
        ],
      },
      {
        h: t('Uzun bir hayat', 'A long life'),
        p: [
          t(
            'Bf 109, F ve G sürümleriyle savaşın sonuna kadar Alman avcı gücünün belkemiği kaldı; Finlandiya, İsviçre ve başka ülkeler de kullandı. Savaştan sonra Çekoslovakya’da yapılan Avia S-199’lar 1948’de İsrail’in ilk avcıları oldu; İspanya’nın HA-1112 “Buchón”ları ise 1960’lara kadar uçtu. Kestrel’le başlayan hikâye ironik biçimde bitti: Buchón’lar Rolls-Royce Merlin motoruyla uçuyordu.',
            'With the F and G versions, the Bf 109 remained the backbone of the German fighter force until the end of the war, and Finland, Switzerland and others flew it too. After the war, Avia S-199s built in Czechoslovakia became Israel’s first fighters in 1948, and Spain’s HA-1112 “Buchón” flew into the 1960s. The story that began with a Kestrel ended ironically: the Buchóns were powered by the Rolls-Royce Merlin.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji avcısıdır: dönüş dalaşına girmez, yukarıdan dalıp vurur, hızıyla ya da tırmanışıyla uzaklaşır. Takipte kalırsa burnunu bastırıp pikeye geçer; Hurricane, Spitfire Mk I ve I-16’nın karbüratörlü motorları bu manevrada bir an kesilir. İki topu güçlüdür ama mermisi çabuk biter. Yüksek hızda kumandası ağırlaşır.',
        'In the game it is an energy fighter: it stays out of turning fights, dives in from above, hits and leaves on its speed or climb. When pursued it pushes over into a dive; the carburetted engines of the Hurricane, Spitfire Mk I and I-16 cut out for a moment in that manoeuvre. Its two cannon are powerful but run dry quickly. Its controls stiffen at high speed.',
      ),
    ],
  },
  {
    id: 'bf110c',
    summary: t(
      'Çift motorlu “Zerstörer”. Gündüz zorlandı, radarlı gece avcısı olarak öne çıktı.',
      'The twin-engined “Zerstörer”: it struggled by day and made its name as a radar night fighter.',
    ),
    lead: t(
      'Messerschmitt Bf 110, bombardıman uçaklarına düşman topraklarının derinliklerinde eşlik etmesi için tasarlanan çift motorlu ağır avcıdır; Almanlar bu sınıfa “Zerstörer”, yani yok edici diyordu. Britanya Muharebesi’nde tek motorlu avcılar karşısında zorlandı, ama radarlı gece avcısı olarak Almanya’nın en önemli savunucularından biri oldu.',
      'The Messerschmitt Bf 110 was a twin-engined heavy fighter designed to escort bombers deep into enemy territory; the Germans called this class “Zerstörer”, destroyer. It struggled against single-engined fighters in the Battle of Britain, but as a radar-equipped night fighter it became one of Germany’s most important defenders.',
    ),
    facts: [
      { k: t('İlk uçuş', 'First flight'), v: t('12 Mayıs 1936 (prototip Bf 110 V1)', '12 May 1936 (prototype Bf 110 V1)') },
      { k: t('Hizmete giriş', 'Entered service'), v: t('1938; C sürümü 1939', '1938; the C version in 1939') },
      { k: t('Tasarımcı', 'Designer'), v: t('Willy Messerschmitt’in ekibi', 'Willy Messerschmitt’s team') },
      { k: t('Üretici', 'Manufacturer'), v: t('Messerschmitt AG; lisansla Gothaer Waggonfabrik ve başka fabrikalar', 'Messerschmitt AG; under licence by Gothaer Waggonfabrik and others') },
      { k: t('Üretim', 'Number built'), v: t('6.000’i aşkın (bütün sürümler)', 'More than 6,000 (all variants)') },
      { k: t('Motor', 'Engine'), v: t('2 × Daimler-Benz DB 601A, ters V12, her biri yaklaşık 1.100 PS', '2 × Daimler-Benz DB 601A, inverted V12, about 1,100 PS each') },
      { k: t('Azami hız', 'Top speed'), v: t('Yaklaşık 540–560 km/sa, 6.000 m civarında', 'About 540–560 km/h at around 6,000 m') },
      { k: t('Silahlar', 'Armament'), v: t('Burunda 2 × 20 mm MG FF/M ve 4 × 7,92 mm MG 17, arkada 1 × 7,92 mm MG 15', '2 × 20 mm MG FF/M and 4 × 7.92 mm MG 17 in the nose, 1 × 7.92 mm MG 15 in the rear cockpit') },
      { k: t('Mürettebat', 'Crew'), v: t('2 (pilot ve telsizci-nişancı)', '2 (pilot and radio operator/gunner)') },
      { k: t('Kanat açıklığı / uzunluk', 'Span / length'), v: t('16,27 m / 12,1 m', '16.27 m / 12.1 m') },
    ],
    sections: [
      {
        h: t('“Zerstörer” fikri', 'The “Zerstörer” idea'),
        p: [
          t(
            '1930’ların ortasında birçok hava kuvveti aynı soruyu soruyordu: tek motorlu avcıların menzili bombardıman uçaklarına uzak hedeflere kadar eşlik etmeye yetmiyordu. Almanya’nın yanıtı, iki motorlu, uzun menzilli ve burnunda ağır silahlar taşıyan bir avcıydı. Göring bu sınıfa büyük önem verdi; Zerstörer birlikleri seçkin sayılıyordu.',
            'In the mid-1930s many air forces faced the same problem: single-engined fighters lacked the range to escort bombers to distant targets. Germany’s answer was a long-range, twin-engined fighter carrying heavy guns in its nose. Göring set great store by the type, and the Zerstörer units were regarded as an elite.',
          ),
          t(
            'Silahların hepsi burunda toplandığı için kanattaki silahlar gibi belli bir uzaklıkta kesişmeleri gerekmiyordu: iki top ve dört makineli tüfek tek bir noktaya yoğun ateş açıyordu.',
            'With all its guns grouped in the nose, they did not need to be harmonised to converge at a set range like wing guns: two cannon and four machine guns poured concentrated fire at a single point.',
          ),
        ],
      },
      {
        h: t('İlk başarılar', 'Early successes'),
        p: [
          t(
            'Polonya’da, Norveç’te ve Fransa’da Bf 110 eski avcılara ve bombardıman uçaklarına karşı etkili oldu. Aralık 1939’da Heligoland Körfezi üzerinde Alman avcıları, Bf 110’lar da aralarında, gündüz saldırısına gelen RAF Wellington’larının büyük kısmını düşürdü; bu kayıplar RAF Bombardıman Komutanlığı’nın gece bombardımanına yönelmesinde rol oynadı.',
            'Over Poland, Norway and France the Bf 110 did well against older fighters and against bombers. In December 1939, over the Heligoland Bight, German fighters, Bf 110s among them, shot down most of a force of RAF Wellingtons attacking by day; these losses helped turn RAF Bomber Command towards night bombing.',
          ),
        ],
      },
      {
        h: t('Britanya Muharebesi', 'The Battle of Britain'),
        p: [
          t(
            'Britanya üzerinde Bf 110’un sınırları ortaya çıktı. Hurricane ve Spitfire’lar karşısında ağırdı; geç hızlanıyor, yavaş yuvarlanıyor ve dönüşte geride kalıyordu. Kayıplar o kadar ağırdı ki zamanla Bf 110 kollarına da Bf 109 refakati gerekti. Bf 110’lar birbirinin arkasını korumak için daire çizerek uçan savunma çemberleri kuruyordu.',
            'Over Britain the Bf 110’s limits became clear. It was heavy against Hurricanes and Spitfires: slow to accelerate, slow to roll and outturned. Losses were so heavy that in time Bf 110 formations needed Bf 109 escorts themselves. Bf 110 crews formed defensive circles, flying round in a ring so that each covered the tail of the one ahead.',
          ),
        ],
      },
      {
        h: t('Gece avcısı', 'Night fighter'),
        p: [
          t(
            'Bf 110 asıl yerini geceleri buldu. Burnuna Lichtenstein radarının antenleri takılan Bf 110’lar, savaşın büyük bölümünde Alman gece avcı gücünün çoğunu oluşturdu ve Almanya’yı RAF’ın gece bombardıman uçaklarına karşı savundu. Uçağın en ünlü uçuşlarından biri ise savaşla ilgisizdi: Rudolf Hess Mayıs 1941’de bir Bf 110 ile tek başına İskoçya’ya uçtu.',
            'The Bf 110 found its true role at night. Fitted with the antennas of the Lichtenstein radar on their noses, Bf 110s made up most of the German night-fighter force for much of the war, defending Germany against RAF night bombers. One of its most famous flights had nothing to do with combat: in May 1941 Rudolf Hess flew a Bf 110 to Scotland on his own.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ağır avcıdır ve enerji taktiğiyle savaşır. Burnundaki iki top ve dört makineli tüfek bir atışta ağır hasar verir; bombardıman kollarına karşı etkilidir. Tek motorlu avcılarla dönüş dalaşına girerse kaybeder; arkasındaki nişancı onu biraz korur. Yakıtı bol olduğu için uzun menzillidir; ek yakıt tankı ya da 2 × 250 kg bomba da taşıyabilir.',
        'In the game it is a heavy fighter that fights with energy tactics. The two cannon and four machine guns in its nose do heavy damage in a single burst, making it effective against bomber formations. Drawn into a turning fight with single-engined fighters it loses; its rear gunner gives it some protection. With plenty of fuel it has a long range, and it can carry a drop tank or 2 × 250 kg bombs.',
      ),
    ],
  },
  {
    id: 'he111',
    summary: t(
      'Sera burunlu orta bombardıman uçağı; Blitz’in en tanıdık silueti.',
      'The medium bomber with the glazed “greenhouse” nose, the best-known silhouette of the Blitz.',
    ),
    lead: t(
      'Heinkel He 111, savaşın ilk yıllarında Luftwaffe’nin ana orta bombardıman uçaklarından biriydi ve camlı “sera” burnuyla kolayca tanınır. Versay Antlaşması’nın askerî uçak yasağı yüzünden bir yolcu uçağı kılığında geliştirildi. Britanya Muharebesi’nde ve 1940–41’in gece bombardımanlarında, Blitz’de, en çok görülen Alman bombardıman uçağıydı.',
      'The Heinkel He 111 was one of the Luftwaffe’s main medium bombers in the early years of the war and is easy to recognise by its glazed “greenhouse” nose. Because of the Versailles Treaty’s ban on military aircraft, it was developed in the guise of an airliner. It was the most familiar German bomber of the Battle of Britain and of the 1940–41 night bombing campaign, the Blitz.',
    ),
    facts: [
      { k: t('İlk uçuş', 'First flight'), v: t('24 Şubat 1935 (prototip He 111 V1)', '24 February 1935 (prototype He 111 V1)') },
      { k: t('Hizmete giriş', 'Entered service'), v: t('1936–37; H sürümü 1939', '1936–37; the H version in 1939') },
      { k: t('Tasarımcı', 'Designer'), v: t('Siegfried ve Walter Günter', 'Siegfried and Walter Günter') },
      { k: t('Üretici', 'Manufacturer'), v: t('Heinkel ve başka Alman fabrikaları; savaştan sonra İspanya’da CASA 2.111 adıyla', 'Heinkel and other German factories; after the war in Spain as the CASA 2.111') },
      { k: t('Üretim', 'Number built'), v: t('6.500’ü aşkın (bütün sürümler)', 'More than 6,500 (all variants)') },
      { k: t('Motor', 'Engine'), v: t('2 × Junkers Jumo 211D, ters V12, her biri 1.200 PS', '2 × Junkers Jumo 211D, inverted V12, 1,200 PS each') },
      { k: t('Azami hız', 'Top speed'), v: t('Yaklaşık 400–415 km/sa, 5.000 m civarında', 'About 400–415 km/h at around 5,000 m') },
      { k: t('Silahlar', 'Armament'), v: t('Burun, sırt, karın ve yan pencerelerde 5–7 × 7,92 mm MG 15; gövde içinde 8 × 250 kg, toplam 2.000 kg bomba', '5–7 × 7.92 mm MG 15 in the nose, dorsal, ventral and beam positions; 8 × 250 kg, 2,000 kg in all, inside the fuselage') },
      { k: t('Mürettebat', 'Crew'), v: t('4–5', '4–5') },
      { k: t('Kanat açıklığı / uzunluk', 'Span / length'), v: t('22,6 m / 16,4 m', '22.6 m / 16.4 m') },
    ],
    sections: [
      {
        h: t('Yolcu uçağı kılığında', 'In the guise of an airliner'),
        p: [
          t(
            'Birinci Dünya Savaşı’ndan sonra Almanya’nın askerî uçak yapması yasaktı. Heinkel’de Günter kardeşlerin tasarladığı He 111 bu yüzden iki yüzlü geliştirildi: Lufthansa için birkaç yolcuyla posta taşıyan bir sivil uçak ve aynı gövdeden çıkan bir bombardıman uçağı. İlk sürümlerin kanadı eliptikti; üretimi kolaylaştırmak için sonra düz kenarlı kanada geçildi.',
            'After the First World War Germany was forbidden to build military aircraft. The He 111, designed at Heinkel by the Günter brothers, was therefore developed with two faces: a civil aircraft for Lufthansa carrying a few passengers and mail, and a bomber built on the same airframe. Early versions had an elliptical wing; it was later replaced by a straight-edged wing that was easier to build.',
          ),
        ],
      },
      {
        h: t('Sera burun', 'The greenhouse nose'),
        p: [
          t(
            'P ve H sürümleriyle basamaklı kokpit kalktı, yerine bütünüyle camlı, hafifçe asimetrik bir burun geldi; pilot bu camların arkasında solda oturuyordu. Görüş çok iyiydi, ama güneşte ve gece ışıklarında yansımalar sorun çıkarıyordu. Bombalar gövdenin içinde, sekiz dikey hücrede burunları yukarı bakacak biçimde taşınıyordu.',
            'With the P and H versions the stepped cockpit gave way to a fully glazed, slightly asymmetric nose, with the pilot sitting on the left behind the panes. The view was excellent, but reflections from the sun and from searchlights caused problems. The bombs were carried inside the fuselage, nose up, in eight vertical cells.',
          ),
        ],
      },
      {
        h: t('Britanya Muharebesi ve Blitz', 'The Battle of Britain and the Blitz'),
        p: [
          t(
            'He 111 İspanya’da, Polonya’da, Norveç’te ve Fransa’da savaştı. Britanya Muharebesi’nde Do 17 ve Ju 88 ile birlikte Luftwaffe’nin bombardıman gücünü oluşturdu. Elle döndürülen tek tek MG 15’ler, Hurricane ve Spitfire’ların sekiz makineli tüfeğine karşı zayıf kaldı; gündüz akınları pahalıya patladı ve uçağa sonradan daha çok silah eklendi.',
            'The He 111 fought in Spain, Poland, Norway and France. In the Battle of Britain it formed the Luftwaffe’s bomber force together with the Do 17 and the Ju 88. Its single, hand-aimed MG 15 guns were no match for the eight guns of the Hurricanes and Spitfires; daylight raids were costly, and more guns were added later.',
          ),
          t(
            '1940 sonbaharından itibaren Alman bombardıman uçakları çoğunlukla gece uçtu. Kasım 1940’ta Coventry’ye yapılan büyük akına, radyo ışınlarıyla hedef bulan özel donanımlı He 111’ler öncülük etti.',
            'From the autumn of 1940 the German bombers mostly flew at night. The great raid on Coventry in November 1940 was led by specially equipped He 111s that found the target by following radio beams.',
          ),
        ],
      },
      {
        h: t('Uzun bir hizmet', 'A long service'),
        p: [
          t(
            'He 111 savaş boyunca torpido uçağı, nakliye uçağı ve planör çekicisi olarak da kullanıldı; 1944’te havadan V-1 uçan bombası fırlattı. İspanya’da Rolls-Royce Merlin motorlarıyla yapılan CASA 2.111’ler 1970’lere kadar uçtu ve 1969 yapımı “Battle of Britain” filminde He 111’leri canlandırdı.',
            'During the war the He 111 also served as a torpedo bomber, a transport and a glider tug, and in 1944 it launched V-1 flying bombs from the air. In Spain, CASA 2.111s built with Rolls-Royce Merlin engines flew into the 1970s and played the He 111s in the 1969 film “Battle of Britain”.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda orta bombardıman uçağıdır. Gövdesinde 8 × 250 kg ya da alan bombardımanı için 32 × 50 kg, dış askılarda 4 × 500 kg taşır. Burun, sırt, karın ve iki yan penceredeki tek MG 15’ler avcıları uzak tutmaya yetmez: refakat avcısı olmadan gündüz göndermek pahalıya patlar. Yavaştır ama dayanıklıdır.',
        'In the game it is a medium bomber. It carries 8 × 250 kg or, for area bombing, 32 × 50 kg inside the fuselage, or 4 × 500 kg on external racks. The single MG 15s in the nose, dorsal, ventral and two beam positions are not enough to keep fighters away: sending it by day without a fighter escort is costly. It is slow but tough.',
      ),
    ],
  },
  {
    id: 'i16',
    summary: t(
      'Hizmete giren ilk modern tek kanatlı avcı: fıçı gövdeli, huysuz ve çok çevik.',
      'The first modern monoplane fighter to enter service: barrel-shaped, temperamental and very agile.',
    ),
    lead: t(
      'Polikarpov I-16, içeri katlanan iniş takımlı, alçak kanatlı ilk tek kanatlı avcı olarak hizmete giren uçaktır. Fıçı gibi kısa gövdesiyle çok çevikti ama uçurması zordu. İspanya’dan Çin’e ve Moğolistan’a kadar savaştı; Almanya Haziran 1941’de Sovyetler Birliği’ne saldırdığında en kalabalık Sovyet avcısıydı.',
      'The Polikarpov I-16 was the first low-wing monoplane fighter with a retractable undercarriage to enter service. With its short, barrel-like fuselage it was very agile but hard to fly. It fought from Spain to China and Mongolia, and when Germany attacked the Soviet Union in June 1941 it was the most numerous Soviet fighter.',
    ),
    facts: [
      { k: t('İlk uçuş', 'First flight'), v: t('30 Aralık 1933 (TsKB-12, pilot Valeri Çkalov)', '30 December 1933 (TsKB-12, flown by Valery Chkalov)') },
      { k: t('Hizmete giriş', 'Entered service'), v: t('1934; Tip 24 sürümü 1939', '1934; the Type 24 in 1939') },
      { k: t('Tasarımcı', 'Designer'), v: t('Nikolay Polikarpov', 'Nikolai Polikarpov') },
      { k: t('Üretici', 'Manufacturer'), v: t('Sovyet devlet uçak fabrikaları, en çok Gorki’deki 21 numaralı fabrika', 'Soviet state aircraft factories, above all Factory No. 21 at Gorky') },
      { k: t('Üretim', 'Number built'), v: t('8.000’i aşkın (bütün sürümler)', 'More than 8,000 (all variants)') },
      { k: t('Motor', 'Engine'), v: t('Shvetsov M-63, dokuz silindirli yıldız, yaklaşık 1.100 bg (kalkış)', 'Shvetsov M-63, nine-cylinder radial, about 1,100 hp (take-off)') },
      { k: t('Azami hız', 'Top speed'), v: t('Yaklaşık 490 km/sa, 4.800 m’de', 'About 490 km/h at 4,800 m') },
      { k: t('Silahlar', 'Armament'), v: t('4 × 7,62 mm ShKAS (ikisi motorun üstünde, ikisi kanatlarda)', '4 × 7.62 mm ShKAS (two above the engine, two in the wings)') },
      { k: t('Mürettebat', 'Crew'), v: t('1', '1') },
      { k: t('Kanat açıklığı / uzunluk', 'Span / length'), v: t('9,0 m / 6,1 m', '9.0 m / 6.1 m') },
    ],
    sections: [
      {
        h: t('Zamanının önünde', 'Ahead of its time'),
        p: [
          t(
            'Dünyanın avcıları hâlâ çoğunlukla açık kokpitli çift kanatlıyken, Nikolay Polikarpov alçak kanatlı, içeri katlanan iniş takımlı bir tek kanatlı avcı çizdi. Prototipi, sonradan Kuzey Kutbu üzerinden Amerika’ya uçuşuyla ünlenecek Valeri Çkalov uçurdu. Gövde ahşap kabuktan, kanatlar metal iskelet ve kumaş kaplamadan yapılmıştı; iniş takımı pilotun elle çevirdiği bir kolla toplanıyordu.',
            'While most of the world’s fighters were still open-cockpit biplanes, Nikolai Polikarpov drew a low-wing monoplane fighter with a retractable undercarriage. The prototype was flown by Valery Chkalov, later famous for his flight to America over the North Pole. The fuselage was a wooden shell and the wings a metal structure with fabric covering; the undercarriage was raised by a hand crank the pilot had to wind.',
          ),
        ],
      },
      {
        h: t('Huysuz ama çevik', 'Temperamental but agile'),
        p: [
          t(
            'Çok kısa gövdesi I-16’yı burun ekseninde dengesiz yapıyordu: uçak, pilotun bir an bile dikkatini ondan ayırmasını affetmezdi ve tutunma kaybında sert biçimde vrilleye girebilirdi. Karşılığında çok çabuk yuvarlanıyor ve dar dönüyordu. Sovyet pilotları ona “İşak” (eşek) dedi; İspanya’da Cumhuriyetçiler “Mosca” (sinek), karşı taraf ise “Rata” (fare) adını taktı.',
            'Its very short fuselage made the I-16 unstable in pitch: it did not forgive a pilot’s attention wandering even for a moment, and it could snap into a spin when it stalled. In return it rolled very quickly and turned tightly. Soviet pilots called it “Ishak” (donkey); in Spain the Republicans called it “Mosca” (fly) and their opponents “Rata” (rat).',
          ),
        ],
      },
      {
        h: t('İspanya’dan 1941’e', 'From Spain to 1941'),
        p: [
          t(
            'I-16 1936’da İspanya’da çift kanatlıları geride bıraktı; Çin’de ve 1939’da Halhin Gol’de Japonlara, Kış Savaşı’nda Finlere karşı savaştı. Halhin Gol’de I-16’lar, kanat altından atılan RS-82 roketlerini ilk kez hava muharebesinde kullandı.',
            'In Spain in 1936 the I-16 outclassed the biplanes; it fought the Japanese in China and at Khalkhin Gol in 1939, and the Finns in the Winter War. At Khalkhin Gol, I-16s were the first to use rockets in air combat, firing RS-82s from under their wings.',
          ),
          t(
            'Haziran 1941’de en kalabalık Sovyet avcısıydı ama artık Bf 109 F’nin gerisinde kalıyordu. Ağır kayıplara rağmen savaşmayı sürdürdü; bazı pilotlar mermisi bitince düşmana çarparak (taran) saldırdı. 1943’e doğru cepheden çekildi.',
            'In June 1941 it was the most numerous Soviet fighter, but by then it was outclassed by the Bf 109 F. It fought on despite heavy losses; some pilots, out of ammunition, attacked by ramming (taran). It was withdrawn from the front by around 1943.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda dönüş avcısıdır ve oyunun en çabuk yuvarlanan uçaklarından biridir. Dar döner, ama tutunma kaybında uyarı vermeden sert biçimde vrilleye girer; sınırda uçarken dikkat ister. Dört ShKAS çok hızlı ateş eder. Hızı Bf 109 E’nin gerisindedir ve karbüratörlü motoru eksi G’de bir an kesilir.',
        'In the game it is a turn fighter and one of the fastest-rolling aircraft in the game. It turns tightly, but it snaps into a spin without warning when it stalls, so it needs care at the limit. Its four ShKAS fire very fast. It is slower than the Bf 109 E, and its carburetted engine cuts out for a moment under negative g.',
      ),
    ],
  },
  {
    id: 'blenheim',
    summary: t(
      'RAF avcılarından hızlı doğan hafif bombardıman; savaşta Almanya üzerine giden ilk RAF uçağı.',
      'A light bomber born faster than the RAF’s fighters, and the first RAF aircraft over Germany in the war.',
    ),
    lead: t(
      'Bristol Blenheim, 1930’ların ortasında RAF’ın o günkü avcılarından bile hızlı bir hafif bombardıman uçağı olarak doğdu. Savaş başladığında artık hızlı sayılmazdı ve gündüz akınlarında ağır kayıplar verdi; ama savaşın ilk günü Almanya üzerine uçan ilk RAF uçağı bir Blenheim’dı.',
      'The Bristol Blenheim was born in the mid-1930s as a light bomber faster than even the RAF’s fighters of the day. By the time war broke out it was no longer fast and suffered heavy losses in daylight raids, but the first RAF aircraft to fly over Germany on the first day of the war was a Blenheim.',
    ),
    facts: [
      { k: t('İlk uçuş', 'First flight'), v: t('12 Nisan 1935 (Type 142 “Britain First”)', '12 April 1935 (Type 142 “Britain First”)') },
      { k: t('Hizmete giriş', 'Entered service'), v: t('Mk I 1937; uzun burunlu Mk IV 1939', 'Mk I in 1937; the long-nosed Mk IV in 1939') },
      { k: t('Tasarımcı', 'Designer'), v: t('Frank Barnwell', 'Frank Barnwell') },
      { k: t('Üretici', 'Manufacturer'), v: t('Bristol; lisansla Avro ve Rootes; Kanada’da Bolingbroke adıyla; Finlandiya ve Yugoslavya’da lisansla', 'Bristol; under licence by Avro and Rootes; in Canada as the Bolingbroke; under licence in Finland and Yugoslavia') },
      { k: t('Üretim', 'Number built'), v: t('İngiltere’de yaklaşık 4.400', 'About 4,400 in Britain') },
      { k: t('Motor', 'Engine'), v: t('2 × Bristol Mercury XV, dokuz silindirli yıldız, her biri yaklaşık 900 bg', '2 × Bristol Mercury XV, nine-cylinder radial, about 900 hp each') },
      { k: t('Azami hız', 'Top speed'), v: t('Yaklaşık 430 km/sa, 3.600 m’de', 'About 430 km/h at 3,600 m') },
      { k: t('Silahlar', 'Armament'), v: t('Kanatta 1 × 7,7 mm Browning, sırt taretinde 1–2 × 7,7 mm; birçoğunda burun altında geriye ateş eden 2 × 7,7 mm; 454 kg (1.000 lb) bomba', '1 × .303 in Browning in the wing, 1–2 × .303 in in the dorsal turret; on many, 2 × .303 in firing rearwards under the nose; 1,000 lb (454 kg) of bombs') },
      { k: t('Mürettebat', 'Crew'), v: t('3', '3') },
      { k: t('Kanat açıklığı / uzunluk', 'Span / length'), v: t('17,17 m / 12,98 m', '17.17 m / 12.98 m') },
    ],
    sections: [
      {
        h: t('Bir gazete sahibinin hızlı uçağı', 'A press baron’s fast aircraft'),
        p: [
          t(
            'Daily Mail gazetesinin sahibi Lord Rothermere, Britanya’nın ne kadar hızlı bir uçak yapabileceğini göstermek için Bristol’den kendine özel bir uçak ısmarladı. Frank Barnwell’in tasarladığı Type 142, “Britain First” (Önce Britanya) adıyla 1935’te uçtuğunda RAF’ın o günkü avcılarından hızlıydı. Rothermere uçağı ülkeye bağışladı; Hava Bakanlığı da ondan türetilen bir bombardıman uçağı ısmarladı: Blenheim.',
            'Lord Rothermere, owner of the Daily Mail, ordered a private aircraft from Bristol to show how fast an aircraft Britain could build. The Type 142, designed by Frank Barnwell and named “Britain First”, was faster than the RAF’s fighters of the day when it flew in 1935. Rothermere gave it to the nation, and the Air Ministry ordered a bomber derived from it: the Blenheim.',
          ),
          t(
            'Mk IV sürümünün burnu, seyrüseferci ve bomba nişancısına yer açmak için uzatıldı; pilotun önünden görüşü korumak için burnun sol üstü oyuktu.',
            'The Mk IV’s nose was lengthened to make room for the navigator and bomb aimer, with its upper left side scalloped to keep the pilot’s view ahead clear.',
          ),
        ],
      },
      {
        h: t('Savaşın ilk günleri', 'The first days of the war'),
        p: [
          t(
            '3 Eylül 1939’da, Britanya savaş ilan ettiği gün, bir Blenheim Mk IV Wilhelmshaven’daki Alman donanmasını fotoğraflamaya uçtu ve Almanya üzerine giden ilk RAF uçağı oldu. Ertesi gün Blenheim’lar aynı limandaki Alman savaş gemilerine RAF’ın savaştaki ilk bombardıman saldırısını yaptı ve kayıp verdi.',
            'On 3 September 1939, the day Britain declared war, a Blenheim Mk IV flew to photograph the German fleet at Wilhelmshaven and became the first RAF aircraft over Germany. The next day Blenheims made the RAF’s first bombing attack of the war against German warships in the same port, and suffered losses.',
          ),
          t(
            'Savaş başladığında Blenheim artık Alman avcılarından kaçacak kadar hızlı değildi ve savunma silahları zayıftı. 1940’ta Fransa’da ve gündüz akınlarında birlikler çok ağır kayıplar verdi.',
            'By the time the war began, the Blenheim was no longer fast enough to escape German fighters, and its defensive guns were weak. In France in 1940 and in daylight raids its squadrons suffered very heavy losses.',
          ),
        ],
      },
      {
        h: t('Başka görevler', 'Other roles'),
        p: [
          t(
            'Blenheim gece avcısı olarak da kullanıldı; erken hava radarlarını taşıyan ilk gece avcılarından biriydi. Kıyı Komutanlığı’nda, Malta’da, Kuzey Afrika’da, Yunanistan’da ve Uzak Doğu’da savaştı; yerini sonra Boston ve Mosquito gibi uçaklara bıraktı. Finlandiya ve Yugoslavya lisansla üretti; Türk Hava Kuvvetleri de Blenheim kullananlar arasındaydı.',
            'The Blenheim was also used as a night fighter and was one of the first night fighters to carry airborne radar. It fought with Coastal Command, over Malta, in North Africa, Greece and the Far East, and was later replaced by types such as the Boston and the Mosquito. Finland and Yugoslavia built it under licence, and the Turkish Air Force was among its users.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda hafif bombardıman uçağıdır: yalnız 4 × 250 lb, yaklaşık 450 kg bomba taşır. Ucuzdur ve çabuk üretilir. Sırttaki motorlu çift makineli taret ve burnun altında geriye ateş eden çift makineli onu biraz korur, ama avcılara karşı çok kırılgandır.',
        'In the game it is a light bomber: it carries only 4 × 250 lb, about 450 kg, of bombs. It is cheap and quick to build. The powered twin-gun dorsal turret and the rear-firing twin guns under the nose give it some protection, but it is very fragile against fighters.',
      ),
    ],
  },
];
