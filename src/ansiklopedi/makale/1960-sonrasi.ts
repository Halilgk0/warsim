// Ansiklopedi makaleleri, 1960 sonrası jetler. Oyunda henüz uçurulamazlar (sonraki aşama: radar ve füzeler); hangarda
// incelenebilirler. "Oyunda" bölümü bunu söyler, sayfada oyun değerleri ve "Bu uçakla oyna" gösterilmez.

import { K, t, type Article } from '../tur';

const NEXT = t(
  'Bu uçak oyunda henüz uçurulamaz: radar ve güdümlü füzelerle birlikte sonraki aşamada savaşa girecek. Hangarda modeli ve verileri incelenebilir.',
  'This aircraft cannot yet be flown in the game: it will enter the war in the next stage, together with radar and guided missiles. Its model and data can be inspected in the hangar.',
);

export const A1960: Article[] = [
  {
    id: 'mig21',
    summary: t(
      'Delta kanatlı, iki Mach yapabilen hafif önleyici: en çok üretilen süpersonik jet.',
      'The delta-winged, Mach 2 light interceptor: the most-produced supersonic jet.',
    ),
    lead: t(
      'Mikoyan-Gurevich MiG-21, delta kanatlı, hafif ve basit bir süpersonik önleme avcısıdır. Ses hızının iki katını aşabiliyordu. 60’a yakın ülkede uçtu ve lisanslı kopyalarıyla birlikte tarihin en çok üretilen süpersonik jet uçağı oldu; Vietnam’dan Ortadoğu’ya ve Hindistan-Pakistan savaşlarına kadar onlarca çatışmada kullanıldı.',
      'The Mikoyan-Gurevich MiG-21 was a light, simple, delta-winged supersonic interceptor. It could exceed twice the speed of sound. It flew with nearly 60 countries and, with its licensed copies, became the most-produced supersonic jet aircraft in history; it was used in dozens of conflicts, from Vietnam to the Middle East and the India–Pakistan wars.',
    ),
    facts: [
      { k: K.first, v: t('16 Haziran 1955 (Ye-4 prototipi)', '16 June 1955 (Ye-4 prototype)') },
      { k: K.service, v: t('1959; MiG-21F-13 1960', '1959; the MiG-21F-13 in 1960') },
      { k: K.designer, v: t('Mikoyan-Gurevich tasarım bürosu', 'Mikoyan-Gurevich design bureau') },
      { k: K.maker, v: t('Sovyet fabrikaları; lisansla Çekoslovakya ve Hindistan’da; Çin’de J-7 adıyla', 'Soviet factories; under licence in Czechoslovakia and India; in China as the J-7') },
      { k: K.built, v: t('Sovyetler Birliği’nde 11.000’i aşkın; lisanslı ve kopya üretimle çok daha fazla', 'More than 11,000 in the Soviet Union; many more with licensed and copied production') },
      { k: K.engine, v: t('Tumansky R-11F-300, art yakıcılı turbojet, 38,7 kN (art yakıcıyla 56,4 kN)', 'Tumansky R-11F-300 afterburning turbojet, 38.7 kN (56.4 kN with afterburner)') },
      { k: K.speed, v: t('Yaklaşık Mach 2,05 (2.125 km/sa), yüksekte', 'About Mach 2.05 (2,125 km/h) at altitude') },
      { k: K.guns, v: t('1 × 30 mm NR-30 top; 2 × K-13 ısı güdümlü füze', '1 × 30 mm NR-30 cannon; 2 × K-13 heat-seeking missiles') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('7,15 m / 13,46 m (burun borusu hariç)', '7.15 m / 13.46 m (excluding the nose probe)') },
    ],
    sections: [
      {
        h: t('Hafif ve basit', 'Light and simple'),
        p: [
          t(
            'MiG-21, Kore deneyiminden sonra hafif, çabuk tırmanan ve yüksekte çok hızlı bir önleyici olarak tasarlandı. Delta kanat yüksek hızda düşük sürükleme ve sağlam bir yapı verdi. Uçak basitti, bakımı kolaydı ve ucuzdu; bu yüzden onlarca ülkeye verildi.',
            'After the experience of Korea, the MiG-21 was designed as a light interceptor that climbed quickly and was very fast at altitude. The delta wing gave low drag at high speed and a strong structure. The aircraft was simple, easy to maintain and cheap, which is why it went to dozens of countries.',
          ),
          t(
            'F-13 sürümünün K-13 füzesi, 1958’de bir Tayvan-Çin hava çatışmasında patlamadan bir MiG-17’ye saplanan bir Amerikan AIM-9 Sidewinder’ın incelenip kopyalanmasıyla yapıldı.',
            'The F-13’s K-13 missile was made by studying and copying an American AIM-9 Sidewinder that had lodged unexploded in a MiG-17 during a 1958 air clash between Taiwan and China.',
          ),
        ],
      },
      {
        h: t('Onlarca savaşta', 'In dozens of wars'),
        p: [
          t(
            'MiG-21’ler Vietnam’da Amerikan F-4’lerine karşı, Ortadoğu’daki Arap-İsrail savaşlarında ve Hindistan ile Pakistan arasındaki savaşlarda savaştı. Çin’in J-7 kopyaları ve sayısız modernizasyonla bazı hava kuvvetlerinde 2020’lere kadar uçtu.',
            'MiG-21s fought American F-4s over Vietnam, in the Arab–Israeli wars in the Middle East and in the wars between India and Pakistan. With China’s J-7 copies and countless upgrades, it flew with some air forces into the 2020s.',
          ),
        ],
      },
    ],
    inGame: [NEXT],
  },
  {
    id: 'f4e',
    summary: t(
      'Ağır, çift motorlu, iki kişilik çok amaçlı jet: Soğuk Savaş’ın simgesi; Türk Hava Kuvvetleri’nde de uçtu.',
      'The heavy, twin-engined, two-seat multirole jet: a Cold War icon that also flew with the Turkish Air Force.',
    ),
    lead: t(
      'McDonnell Douglas F-4 Phantom II, ABD Donanması için tasarlanan, sonra Hava Kuvvetleri ve Deniz Piyadeleri tarafından da kullanılan ağır, çift motorlu ve iki kişilik bir avcıdır. Güçlü radarı ve radar güdümlü füzeleriyle Soğuk Savaş’ın simgelerinden oldu; 5.000’i aşkın üretildi ve Türk Hava Kuvvetleri dahil birçok ülkede uzun yıllar uçtu.',
      'The McDonnell Douglas F-4 Phantom II was a heavy, twin-engined, two-seat fighter designed for the US Navy and later also used by the Air Force and the Marine Corps. With its powerful radar and radar-guided missiles it became one of the icons of the Cold War; more than 5,000 were built, and it flew for many years with many countries, the Turkish Air Force among them.',
    ),
    facts: [
      { k: K.first, v: t('27 Mayıs 1958', '27 May 1958') },
      { k: K.service, v: t('1960; F-4E 1967', '1960; the F-4E in 1967') },
      { k: K.maker, v: t('McDonnell (sonra McDonnell Douglas); Japonya’da lisansla Mitsubishi', 'McDonnell (later McDonnell Douglas); under licence by Mitsubishi in Japan') },
      { k: K.built, v: t('5.000’i aşkın (bütün sürümler)', 'More than 5,000 (all variants)') },
      { k: K.engine, v: t('2 × General Electric J79, art yakıcılı turbojet, her biri 52,8 kN (art yakıcıyla 79,6 kN)', '2 × General Electric J79 afterburning turbojets, 52.8 kN each (79.6 kN with afterburner)') },
      { k: K.speed, v: t('Yaklaşık Mach 2,2 (2.370 km/sa), yüksekte', 'About Mach 2.2 (2,370 km/h) at altitude') },
      { k: K.guns, v: t('Gövde içinde 1 × 20 mm M61 Vulcan; AIM-7 Sparrow ve AIM-9 Sidewinder füzeleri; 8 tona yakın dış yük', '1 × 20 mm M61 Vulcan internally; AIM-7 Sparrow and AIM-9 Sidewinder missiles; nearly 8 tonnes of external stores') },
      { k: K.crew, v: t('2 (pilot ve silah sistemleri subayı)', '2 (pilot and weapon systems officer)') },
      { k: K.size, v: t('11,7 m / 19,2 m', '11.7 m / 19.2 m') },
    ],
    sections: [
      {
        h: t('Topsuz avcı', 'A fighter without a gun'),
        p: [
          t(
            'İlk Phantom’ların topu yoktu: güdümlü füzelerin hava muharebesini tek başına kazanacağı düşünülüyordu. Vietnam’da füzeler beklenenden çok daha az isabet etti ve yakın dalaşta top eksikliği hissedildi. F-4E’ye burnunun altına 20 mm Vulcan topu kondu; ABD Donanması da pilotlarına yeniden dalaş öğretmek için ünlü “Top Gun” okulunu kurdu.',
            'The first Phantoms had no gun: guided missiles were expected to win air combat on their own. Over Vietnam the missiles hit far less often than expected and the lack of a gun was felt in close dogfights. The F-4E got a 20 mm Vulcan cannon under its nose, and the US Navy set up its famous “Top Gun” school to teach its pilots to dogfight again.',
          ),
        ],
      },
      {
        h: t('Uzun bir hizmet', 'A long service'),
        p: [
          t(
            'Phantom, hizmete girdiği yıllarda birçok hız ve irtifa rekoru kırdı. ABD’den başka İsrail, İran, Japonya, Almanya, Yunanistan, Güney Kore ve Türkiye gibi birçok ülkede uçtu. Türk Hava Kuvvetleri’nin F-4E’leri modernize edilerek uzun yıllar hizmette kaldı.',
            'In its early years the Phantom set many speed and altitude records. Besides the United States it flew with many countries, including Israel, Iran, Japan, Germany, Greece, South Korea and Turkey. The Turkish Air Force’s F-4Es were upgraded and remained in service for many years.',
          ),
        ],
      },
    ],
    inGame: [NEXT],
  },
  {
    id: 'f15a',
    summary: t(
      'Hava üstünlüğü için tasarlanan çift kuyruklu avcı: hava muharebesinde 100’ü aşkın zafer, hiç kayıp yok.',
      'The twin-tailed fighter designed for air superiority: more than 100 air-to-air victories and no losses.',
    ),
    lead: t(
      'McDonnell Douglas F-15 Eagle, yalnız hava üstünlüğü için tasarlanmış bir avcıdır: “kara saldırısı için bir kilo bile yok” ilkesiyle çizildi. İtkisi ağırlığından fazla olduğu için dik tırmanışta hızlanabilir. Hava muharebesinde 100’ü aşkın düşürme kaydetti ve bilinen hiçbir F-15 bir düşman uçağı tarafından düşürülmedi.',
      'The McDonnell Douglas F-15 Eagle was designed for air superiority alone, on the principle of “not a pound for air-to-ground”. With more thrust than weight, it can accelerate in a vertical climb. It has more than 100 air-to-air victories, and no F-15 is known to have been shot down by an enemy aircraft.',
    ),
    facts: [
      { k: K.first, v: t('27 Temmuz 1972', '27 July 1972') },
      { k: K.service, v: t('1976', '1976') },
      { k: K.maker, v: t('McDonnell Douglas (sonra Boeing); Japonya’da lisansla Mitsubishi', 'McDonnell Douglas (later Boeing); under licence by Mitsubishi in Japan') },
      { k: K.built, v: t('1.500’ü aşkın (F-15E dahil bütün sürümler)', 'More than 1,500 (all variants, including the F-15E)') },
      { k: K.engine, v: t('2 × Pratt & Whitney F100, art yakıcılı turbofan, her biri yaklaşık 65 kN (art yakıcıyla 106 kN)', '2 × Pratt & Whitney F100 afterburning turbofans, about 65 kN each (106 kN with afterburner)') },
      { k: K.speed, v: t('Mach 2,5’u aşkın, yüksekte', 'Over Mach 2.5 at altitude') },
      { k: K.guns, v: t('1 × 20 mm M61 Vulcan; AIM-7 Sparrow ve AIM-9 Sidewinder (sonra AIM-120) füzeleri', '1 × 20 mm M61 Vulcan; AIM-7 Sparrow and AIM-9 Sidewinder (later AIM-120) missiles') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('13,05 m / 19,43 m', '13.05 m / 19.43 m') },
    ],
    sections: [
      {
        h: t('Vietnam’ın dersi', 'The lesson of Vietnam'),
        p: [
          t(
            'F-15, Vietnam’da ağır ve hantal kalan avcıların dersleriyle tasarlandı. Büyük kanadı ve güçlü motorları ona hem yüksek hız hem de dalaşta çeviklik verdi; pilotun her yönü gördüğü bir kokpiti ve uzaktaki hedefleri yer kargaşası içinde bile görebilen bir radarı vardı. 1975’te özel hazırlanmış bir F-15 bir dizi tırmanma rekoru kırdı.',
            'The F-15 was designed with the lessons of the heavy, unwieldy fighters of Vietnam in mind. Its large wing and powerful engines gave it both high speed and agility in a dogfight; it had a cockpit with an all-round view and a radar that could find distant targets even against ground clutter. In 1975 a specially prepared F-15 set a series of time-to-climb records.',
          ),
        ],
      },
      {
        h: t('Yenilmeyen avcı', 'The unbeaten fighter'),
        p: [
          t(
            'F-15 ilk hava muharebesini 1979’da İsrail Hava Kuvvetleri’nde yaptı. İsrail, ABD ve Suudi Arabistan F-15’leri 100’ü aşkın hava zaferi kaydetti; bilinen hiçbir F-15 hava muharebesinde düşürülmedi. Kara saldırısı için geliştirilen iki kişilik F-15E Strike Eagle ise ayrı bir uçak gibi büyüdü.',
            'The F-15 fought its first air battle with the Israeli Air Force in 1979. Israeli, American and Saudi F-15s have recorded more than 100 air-to-air victories, and no F-15 is known to have been lost in air combat. The two-seat F-15E Strike Eagle, developed for ground attack, grew into almost a separate aircraft.',
          ),
        ],
      },
    ],
    inGame: [NEXT],
  },
  {
    id: 'rafale',
    summary: t(
      'Kanard-delta Fransız avcısı: tek tip uçakla her görevi yapan “çok rollü”.',
      'The canard-delta French fighter: an “omnirole” aircraft that does every job with a single type.',
    ),
    lead: t(
      'Dassault Rafale, kanard ve delta kanatlı, çift motorlu bir Fransız avcısıdır. Fransa, Avrupa ortak avcı projesinden ayrılıp kendi uçağını yaptı: aynı uçak hava üstünlüğü, kara saldırısı, keşif ve nükleer caydırıcılık görevlerini yapabiliyor. Fransız Hava ve Uzay Kuvvetleri ile donanmasının yanında Mısır, Katar, Hindistan, Yunanistan ve Hırvatistan da Rafale kullanıyor.',
      'The Dassault Rafale is a twin-engined French fighter with canards and a delta wing. France left the joint European fighter project to build its own aircraft, one that can perform air superiority, ground attack, reconnaissance and nuclear deterrence missions. Besides the French Air and Space Force and Navy, Egypt, Qatar, India, Greece and Croatia also fly the Rafale.',
    ),
    facts: [
      { k: K.first, v: t('4 Temmuz 1986 (Rafale A gösterim uçağı)', '4 July 1986 (Rafale A demonstrator)') },
      { k: K.service, v: t('2001 (donanma); hava kuvvetlerinde 2006', '2001 (Navy); in the Air Force in 2006') },
      { k: K.maker, v: t('Dassault Aviation', 'Dassault Aviation') },
      { k: K.built, v: t('Yüzlerce; üretim ve siparişler sürüyor', 'Hundreds; production and orders continue') },
      { k: K.engine, v: t('2 × Snecma M88, art yakıcılı turbofan, her biri yaklaşık 50 kN (art yakıcıyla 75 kN)', '2 × Snecma M88 afterburning turbofans, about 50 kN each (75 kN with afterburner)') },
      { k: K.speed, v: t('Yaklaşık Mach 1,8, yüksekte', 'About Mach 1.8 at altitude') },
      { k: K.guns, v: t('1 × 30 mm GIAT 30M791 top; MICA ve Meteor hava-hava füzeleri, SCALP seyir füzesi', '1 × 30 mm GIAT 30M791 cannon; MICA and Meteor air-to-air missiles, SCALP cruise missile') },
      { k: K.crew, v: t('1 (Rafale C)', '1 (Rafale C)') },
      { k: K.size, v: t('10,9 m / 15,27 m', '10.9 m / 15.27 m') },
    ],
    sections: [
      {
        h: t('Kendi yolunda', 'Going its own way'),
        p: [
          t(
            'Fransa 1980’lerin ortasında İngiltere, Almanya, İtalya ve İspanya ile ortak avcı projesinde yer alıyordu. Uçak gemilerinden de kalkabilecek daha hafif bir uçak ve tasarımda öncülük isteyen Fransa 1985’te projeden ayrıldı; öbür ülkeler Eurofighter Typhoon’u, Fransa Rafale’i yaptı.',
            'In the mid-1980s France was part of a joint fighter project with Britain, Germany, Italy and Spain. Wanting a lighter aircraft that could also fly from carriers, and design leadership, France left the project in 1985; the other countries built the Eurofighter Typhoon and France built the Rafale.',
          ),
        ],
      },
      {
        h: t('Her işe tek uçak', 'One aircraft for every job'),
        p: [
          t(
            'Dassault, Rafale’i “omnirole”, yani aynı uçuşta birden çok görevi yapabilen bir uçak olarak tanımlar. Kanard ve delta kanat düzeni ona alçak hızda çeviklik verir; elektronik harp sistemi düşman radarlarını algılayıp karıştırabilir. Rafale Afganistan, Libya, Mali, Irak ve Suriye üzerinde görev yaptı.',
            'Dassault describes the Rafale as “omnirole”: an aircraft able to carry out several missions on the same flight. Its canard-delta layout gives it agility at low speed, and its electronic warfare system can detect and jam enemy radars. The Rafale has flown missions over Afghanistan, Libya, Mali, Iraq and Syria.',
          ),
        ],
      },
    ],
    inGame: [NEXT],
  },
  {
    id: 'f22a',
    summary: t(
      'İlk hizmete giren beşinci nesil avcı: radar izi çok düşük, art yakıcısız süpersonik seyir.',
      'The first fifth-generation fighter in service: a very low radar signature and supersonic cruise without afterburner.',
    ),
    lead: t(
      'Lockheed Martin F-22 Raptor, hizmete giren ilk “beşinci nesil” avcıdır: radar izi çok düşüktür, art yakıcı kullanmadan ses hızının üstünde seyredebilir ve yön verilebilen egzozlarıyla çok çeviktir. Yalnız 195 adet üretildi; ABD yasaları ihracatını yasakladı.',
      'The Lockheed Martin F-22 Raptor was the first “fifth-generation” fighter to enter service: its radar signature is very low, it can cruise above the speed of sound without afterburner, and its vectoring nozzles make it very agile. Only 195 were built, and US law barred its export.',
    ),
    facts: [
      { k: K.first, v: t('29 Eylül 1990 (YF-22); F-22 olarak 7 Eylül 1997', '29 September 1990 (YF-22); as the F-22, 7 September 1997') },
      { k: K.service, v: t('Aralık 2005', 'December 2005') },
      { k: K.maker, v: t('Lockheed Martin ve Boeing', 'Lockheed Martin and Boeing') },
      { k: K.built, v: t('195 (deneme uçakları dahil); üretim 2011’de bitti', '195 (including test aircraft); production ended in 2011') },
      { k: K.engine, v: t('2 × Pratt & Whitney F119, yön verilebilen egzozlu art yakıcılı turbofan, her biri yaklaşık 116 kN (art yakıcıyla 156 kN)', '2 × Pratt & Whitney F119 afterburning turbofans with vectoring nozzles, about 116 kN each (156 kN with afterburner)') },
      { k: K.speed, v: t('Yaklaşık Mach 2,25; art yakıcısız Mach 1,5’u aşkın seyir', 'About Mach 2.25; cruise above Mach 1.5 without afterburner') },
      { k: K.guns, v: t('Gövde içinde 1 × 20 mm M61A2 Vulcan; iç bölmelerde AIM-120 ve AIM-9 füzeleri', '1 × 20 mm M61A2 Vulcan internally; AIM-120 and AIM-9 missiles in internal bays') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('13,56 m / 18,92 m', '13.56 m / 18.92 m') },
    ],
    sections: [
      {
        h: t('Görünmeden görmek', 'Seeing without being seen'),
        p: [
          t(
            'F-22’nin biçimi, kaplaması ve silahlarını gövde içinde taşıması radar izini çok küçültür: düşman radarı onu ancak çok yakından fark edebilir. Böylece F-22 düşmanı o kendisini görmeden görüp füzesini atabilir. Güçlü motorları art yakıcı kullanmadan ses hızının üstünde seyretmesini, yön verilebilen egzozları ise alçak hızda bile çok çevik dönmesini sağlar.',
            'The F-22’s shape, its coatings and the internal carriage of its weapons make its radar signature very small: enemy radar can detect it only at very short range. So the F-22 can see the enemy and launch its missiles before being seen. Its powerful engines let it cruise above the speed of sound without afterburner, and its vectoring nozzles let it turn very nimbly even at low speed.',
          ),
        ],
      },
      {
        h: t('Az ama çok değerli', 'Few but precious'),
        p: [
          t(
            'Yüksek maliyeti ve Soğuk Savaş’ın bitişi yüzünden planlanandan çok daha az F-22 üretildi; ABD yasaları en gelişmiş teknolojilerini korumak için ihracatını yasakladı. F-22 ilk muharebe görevini 2014’te Suriye üzerinde yaptı; ilk hava zaferi ise Şubat 2023’te ABD kıyılarında bir gözlem balonunu düşürmesiydi.',
            'Because of its high cost and the end of the Cold War, far fewer F-22s were built than planned, and US law barred its export to protect its most advanced technologies. The F-22 flew its first combat mission over Syria in 2014; its first air-to-air kill came in February 2023, when it shot down a surveillance balloon off the US coast.',
          ),
        ],
      },
    ],
    inGame: [NEXT],
  },
];
