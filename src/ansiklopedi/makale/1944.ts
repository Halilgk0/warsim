// Ansiklopedi makaleleri, 1944 uçakları (katalog yılına göre).

import { K, t, type Article } from '../tur';

export const A1944: Article[] = [
  {
    id: 'p51d',
    summary: t(
      'Bombardıman uçaklarına Berlin’e kadar eşlik eden uzun menzilli avcı.',
      'The long-range fighter that escorted the bombers all the way to Berlin.',
    ),
    lead: t(
      'North American P-51 Mustang, İngilizlerin isteğiyle tasarlandı, Rolls-Royce Merlin motoruyla savaşın en iyi avcılarından biri oldu. Laminer akış kanadı ve büyük yakıt kapasitesiyle 1944’ten itibaren ABD bombardıman uçaklarına Almanya’nın içlerine kadar eşlik etti ve Luftwaffe’nin gündüz avcı gücünü yıprattı. D sürümü kabarcık kokpitiyle tanınır.',
      'The North American P-51 Mustang was designed at British request and, with the Rolls-Royce Merlin, became one of the best fighters of the war. With its laminar-flow wing and large fuel capacity, from 1944 it escorted American bombers deep into Germany and wore down the Luftwaffe’s daylight fighter force. The D is recognisable by its bubble canopy.',
    ),
    facts: [
      { k: K.first, v: t('26 Ekim 1940 (NA-73X)', '26 October 1940 (NA-73X)') },
      { k: K.service, v: t('1942 (Allison motorlu); P-51D 1944', '1942 (Allison-engined); the P-51D in 1944') },
      { k: K.designer, v: t('Edgar Schmued (North American)', 'Edgar Schmued (North American)') },
      { k: K.maker, v: t('North American Aviation', 'North American Aviation') },
      { k: K.built, v: t('15.000’i aşkın (bütün sürümler); yaklaşık 8.000’i D', 'More than 15,000 (all variants), about 8,000 of them Ds') },
      { k: K.engine, v: t('Packard V-1650-7 (lisanslı Merlin), V12, iki kademeli kompresör, yaklaşık 1.500 bg; acil güçte daha fazla', 'Packard V-1650-7 (licence-built Merlin), V12 with two-stage supercharger, about 1,500 hp; more with emergency power') },
      { k: K.speed, v: t('Yaklaşık 700 km/sa, 7.600 m’de', 'About 700 km/h at 7,600 m') },
      { k: K.guns, v: t('Kanatlarda 6 × 12,7 mm M2 Browning; bomba ya da HVAR roket', '6 × .50 in M2 Browning in the wings; bombs or HVAR rockets') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('11,28 m / 9,83 m', '11.28 m / 9.83 m') },
    ],
    sections: [
      {
        h: t('İngilizler için bir avcı', 'A fighter for the British'),
        p: [
          t(
            '1940’ta İngiliz satın alma heyeti North American’dan Curtiss P-40 üretmesini istedi. Şirket bunun yerine yeni bir avcı tasarlamayı önerdi; Edgar Schmued’in ekibinin çizdiği prototip birkaç ay içinde hazırdı. NACA’nın laminer akış kanadı sürüklemeyi azalttı; gövdenin altındaki radyatör, ısınan havayı geriye doğru iterek neredeyse kendi sürüklemesini karşılıyordu.',
            'In 1940 the British purchasing commission asked North American to build Curtiss P-40s. The company proposed designing a new fighter instead; the prototype drawn by Edgar Schmued’s team was ready within months. The NACA laminar-flow wing reduced drag, and the radiator under the fuselage, by pushing the heated air out backwards, almost paid for its own drag.',
          ),
          t(
            'İlk Mustang’lar Allison motorluydu ve yüksek irtifada zayıftı. 1942’de İngilizler uçağa Merlin taktı; sonuç olağanüstüydü. Packard’ın lisansla yaptığı iki kademeli Merlin’le P-51B ve C, sonra kabarcık kokpitli P-51D geldi.',
            'The first Mustangs had Allison engines and were weak at high altitude. In 1942 the British fitted a Merlin, with outstanding results. With the two-stage Merlin built under licence by Packard came the P-51B and C, then the bubble-canopied P-51D.',
          ),
        ],
      },
      {
        h: t('Berlin’e kadar', 'All the way to Berlin'),
        p: [
          t(
            'Atılabilir tanklarla Mustang’ın menzili, İngiltere’den kalkan bombardıman uçaklarına Berlin’e kadar eşlik etmeye yetiyordu. 1944 başından itibaren refakat avcıları bombardıman kollarının çevresinde kalmak yerine Alman avcılarını avlamaya serbest bırakıldı; Luftwaffe birkaç ayda deneyimli pilotlarının büyük kısmını kaybetti.',
            'With drop tanks the Mustang had the range to escort bombers from England all the way to Berlin. From early 1944 the escort fighters were freed to hunt German fighters rather than stay close to the bombers, and within months the Luftwaffe lost most of its experienced pilots.',
          ),
          t(
            'Siyah Amerikalı pilotlardan oluşan Tuskegee birlikleri de kuyrukları kırmızı boyalı P-51’lerle refakat görevleri yaptı. Mustang Kore Savaşı’nda yeniden savaştı ve birçok ülkede 1950’lere, hatta daha sonrasına kadar uçtu.',
            'The Tuskegee Airmen, units of Black American pilots, also flew escort missions in P-51s with red-painted tails. The Mustang fought again in the Korean War and flew with many countries into the 1950s and beyond.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji avcısıdır: iki kademeli kompresörü sayesinde yüksekte çok hızlıdır, menzili çok uzundur ve kabarcık kokpiti arkayı iyi gösterir. Altı 12,7 mm makinelisi vardır; araştırmayla HVAR roketleri de taşıyabilir. Bombardıman kollarına refakat için en uygun avcılardan biridir.',
        'In the game it is an energy fighter: its two-stage supercharger makes it very fast high up, its range is very long and its bubble canopy gives a good view behind. It has six .50 in guns and, once researched, can carry HVAR rockets. It is one of the best fighters for escorting bomber formations.',
      ),
    ],
  },
  {
    id: 'me262',
    summary: t(
      'Savaşa giren ilk jet avcısı: dört 30 mm topla bombardıman avcısı.',
      'The first jet fighter in combat: a bomber hunter with four 30 mm cannon.',
    ),
    lead: t(
      'Messerschmitt Me 262 Schwalbe, muharebeye giren ilk jet avcısıdır. Müttefik avcılarından 150 km/sa’ten fazla hızlıydı ve dört 30 mm topuyla bir bombardıman uçağını birkaç isabetle düşürebiliyordu. Ama Jumo 004 motorlarının ömrü kısaydı ve gaz kolu ağır tepki veriyordu; uçak en savunmasız anını kalkış ve inişte yaşıyordu.',
      'The Messerschmitt Me 262 Schwalbe was the first jet fighter to see combat. It was more than 150 km/h faster than Allied fighters, and with its four 30 mm cannon it could bring down a bomber with a few hits. But its Jumo 004 engines had a short life and responded sluggishly to the throttle, and the aircraft was most vulnerable on take-off and landing.',
    ),
    facts: [
      { k: K.first, v: t('18 Nisan 1941 (pervane motoruyla); jetle 18 Temmuz 1942', '18 April 1941 (with a piston engine); on jet power 18 July 1942') },
      { k: K.service, v: t('1944', '1944') },
      { k: K.designer, v: t('Messerschmitt AG (Woldemar Voigt’un ekibi)', 'Messerschmitt AG (Woldemar Voigt’s team)') },
      { k: K.maker, v: t('Messerschmitt AG', 'Messerschmitt AG') },
      { k: K.built, v: t('Yaklaşık 1.400', 'About 1,400') },
      { k: K.engine, v: t('2 × Junkers Jumo 004B, eksenel akışlı turbojet, her biri 8,8 kN', '2 × Junkers Jumo 004B axial-flow turbojets, 8.8 kN each') },
      { k: K.speed, v: t('Yaklaşık 870 km/sa', 'About 870 km/h') },
      { k: K.guns, v: t('Burunda 4 × 30 mm MK 108; bazılarında kanat altında R4M roketleri', '4 × 30 mm MK 108 in the nose; R4M rockets under the wings on some') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('12,65 m / 10,6 m', '12.65 m / 10.6 m') },
    ],
    sections: [
      {
        h: t('Motor bekleyen bir gövde', 'An airframe waiting for engines'),
        p: [
          t(
            'Me 262’nin gövdesi jet motorlarından önce hazırdı; ilk uçuşlarını burnuna takılan bir pervane motoruyla yaptı. Kanatlarına verilen hafif ok açısı aslında aerodinamik için değil, beklenenden ağır çıkan motorlar yüzünden ağırlık merkezini düzeltmek içindi. Jetle ilk uçuş Temmuz 1942’de oldu.',
            'The Me 262’s airframe was ready before its jet engines; it made its first flights with a piston engine in the nose. The slight sweep of its wings was in fact not for aerodynamics but to correct the centre of gravity for engines that turned out heavier than expected. The first flight on jet power came in July 1942.',
          ),
          t(
            'Isıya dayanıklı alaşımlar için gereken nikel ve krom Almanya’da kıttı. Bu yüzden Jumo 004’ler genellikle birkaç on saatte bir değiştirilmek zorundaydı; gaz kolu hızlı açılırsa motor alev alabilir ya da sönebilirdi.',
            'The nickel and chromium needed for heat-resistant alloys were scarce in Germany. As a result the Jumo 004s usually had to be replaced after a few tens of hours, and if the throttle was opened quickly the engine could catch fire or flame out.',
          ),
        ],
      },
      {
        h: t('Muharebede', 'In combat'),
        p: [
          t(
            'Me 262 1944 yazında muharebeye girdi. Hitler’in uçağın hızlı bombardıman uçağı olarak da kullanılmasını istemesi, avcı birliklerinin kuruluşunu ne kadar geciktirdi, hâlâ tartışılır. Savaşın son aylarında Me 262’ler Amerikan bombardıman kollarına ağır darbeler vurdu, ama sayıları azdı, yakıt ve deneyimli pilot kıttı.',
            'The Me 262 entered combat in the summer of 1944. How far Hitler’s insistence on also using it as a fast bomber delayed the fighter units is still debated. In the last months of the war Me 262s dealt American bomber formations heavy blows, but they were few, and fuel and experienced pilots were scarce.',
          ),
          t(
            'Müttefik pilotlar Me 262’yi havada yakalayamıyordu; onu kalkış ve iniş sırasında, yavaşken, üslerinin çevresinde bekleyerek avladılar.',
            'Allied pilots could not catch the Me 262 in the air; they hunted it around its airfields, waiting for it while it was slow on take-off and landing.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji avcısıdır ve araştırma ağacındaki ilk jet avcısıdır: pervanelilerden çok hızlıdır, dört 30 mm topu bombardıman uçaklarını tek geçişte parçalar. Jumo 004’ler gaz koluna çok geç tepki verir; yavaşken, kalkışta ve inişte savunmasızdır. “Sturmvogel” yüküyle 2 × 250 kg bomba da taşıyabilir.',
        'In the game it is an energy fighter and the first jet fighter in the research tree: much faster than the piston aircraft, its four 30 mm cannon tear bombers apart in a single pass. The Jumo 004s respond very slowly to the throttle, and it is vulnerable when slow, on take-off and on landing. With the “Sturmvogel” load it can also carry 2 × 250 kg bombs.',
      ),
    ],
  },
  {
    id: 'p47d',
    summary: t(
      '“Jug”: dev motorlu, sekiz makineli, son derece dayanıklı avcı-bombardıman.',
      'The “Jug”: a huge-engined, eight-gun, extremely tough fighter-bomber.',
    ),
    lead: t(
      'Republic P-47 Thunderbolt, savaşın en ağır tek motorlu avcısıdır. Dev, turbo kompresörlü yıldız motoru onu yüksekte çok hızlı yaptı, ağırlığı dalışta yakalanamaz kıldı. Sekiz 12,7 mm makinelisi ve inanılmaz dayanıklılığıyla önce refakat avcısı, sonra savaşın en etkili avcı-bombardımanlarından biri oldu. 15.000’i aşkın üretildi.',
      'The Republic P-47 Thunderbolt was the heaviest single-engined fighter of the war. Its huge turbo-supercharged radial made it very fast high up, and its weight made it uncatchable in a dive. With eight .50 in guns and incredible toughness it was first an escort fighter and then one of the most effective fighter-bombers of the war. More than 15,000 were built.',
    ),
    facts: [
      { k: K.first, v: t('6 Mayıs 1941 (XP-47B)', '6 May 1941 (XP-47B)') },
      { k: K.service, v: t('1942; P-47D 1943', '1942; the P-47D in 1943') },
      { k: K.designer, v: t('Alexander Kartveli', 'Alexander Kartveli') },
      { k: K.maker, v: t('Republic Aviation; lisansla Curtiss', 'Republic Aviation; under licence by Curtiss') },
      { k: K.built, v: t('Yaklaşık 15.600 (bütün sürümler)', 'About 15,600 (all variants)') },
      { k: K.engine, v: t('Pratt & Whitney R-2800 Double Wasp, 18 silindirli çift sıralı yıldız, turbo kompresörlü, yaklaşık 2.000 bg', 'Pratt & Whitney R-2800 Double Wasp, 18-cylinder twin-row radial with turbo-supercharger, about 2,000 hp') },
      { k: K.speed, v: t('Yaklaşık 700 km/sa, 9.100 m’de', 'About 700 km/h at 9,100 m') },
      { k: K.guns, v: t('Kanatlarda 8 × 12,7 mm M2 Browning; bomba ve HVAR roket', '8 × .50 in M2 Browning in the wings; bombs and HVAR rockets') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('12,42 m / 11,0 m', '12.42 m / 11.0 m') },
    ],
    sections: [
      {
        h: t('Turbo kompresörün etrafında', 'Built around the turbo-supercharger'),
        p: [
          t(
            'Gürcü asıllı tasarımcı Alexander Kartveli, uçağı bir motorun ve onun turbo kompresörünün çevresine kurdu: turbo kompresör gövdenin arkasındaydı ve hava ile egzoz gazları uzun borularla ona taşınıyordu. Ortaya devasa bir gövde çıktı; pilotlar ona süt şişesine benzediği için “Jug” dedi.',
            'Georgian-born designer Alexander Kartveli built the aircraft around an engine and its turbo-supercharger: the turbo sat in the rear fuselage, with air and exhaust gases ducted to it through long pipes. The result was a massive fuselage, which pilots nicknamed the “Jug” for its milk-bottle shape.',
          ),
        ],
      },
      {
        h: t('Refakatten kara desteğine', 'From escort to ground attack'),
        p: [
          t(
            'P-47 1943’te Avrupa’da ilk uzun menzilli refakat avcılarından biri oldu; yüksekte hızlıydı ve dalışta hiçbir Alman avcısı ona yetişemiyordu. 1944’te refakat görevini büyük ölçüde P-51 üstlenince P-47 avcı-bombardıman olarak öne çıktı: bombalar, roketler ve sekiz makinelisiyle tanklara, trenlere ve kollara saldırdı.',
            'In 1943 the P-47 became one of the first long-range escort fighters in Europe; it was fast high up and no German fighter could follow it in a dive. When the P-51 largely took over the escort role in 1944, the P-47 came into its own as a fighter-bomber, attacking tanks, trains and columns with bombs, rockets and its eight guns.',
          ),
          t(
            'Yıldız motoru ve sağlam yapısı, ağır hasar almış P-47’lerin bile üslerine dönebilmesini sağladı. Brezilya ve Meksika birlikleri de P-47 ile savaştı; savaştan sonra Türk Hava Kuvvetleri dahil birçok hava kuvveti onu kullandı.',
            'Its radial engine and rugged structure let even badly damaged P-47s get home. Brazilian and Mexican squadrons also fought in P-47s, and after the war many air forces, the Turkish Air Force among them, flew it.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ağır avcıdır ve enerji taktiğiyle savaşır: turbo kompresörü onu yüksekte çok hızlı yapar, dalışta yakalanmaz ve yüksek hızda iyi yuvarlanır. Sekiz 12,7 mm makinelisi güçlüdür ve çok dayanıklıdır. Alçakta ve dönüşte ağırdır. Araştırmayla 10 HVAR roketi ve iki bomba taşır.',
        'In the game it is a heavy fighter that fights with energy tactics: its turbo-supercharger makes it very fast high up, it cannot be caught in a dive and it rolls well at high speed. Its eight .50 in guns are powerful and it is very tough. It is heavy low down and in the turn. Once researched, it carries 10 HVAR rockets and two bombs.',
      ),
    ],
  },
  {
    id: 'il10',
    summary: t(
      'Il-2’nin daha hızlı, tamamen metal halefi.',
      'The faster, all-metal successor to the Il-2.',
    ),
    lead: t(
      'Ilyushin Il-10, Il-2’nin deneyimiyle tasarlanan yeni bir taarruz uçağıdır. Zırhlı kabuk fikri korundu, ama uçak tamamen metal yapıldı, daha temiz bir gövde ve daha güçlü AM-42 motoru aldı. Il-2’den çok daha hızlıydı; savaşın son aylarında cepheye ulaştı ve Kore Savaşı’nda da kullanıldı.',
      'The Ilyushin Il-10 was a new attack aircraft designed with the experience of the Il-2. The idea of an armoured shell was kept, but the aircraft was built entirely of metal, with a cleaner airframe and the more powerful AM-42 engine. It was much faster than the Il-2; it reached the front in the last months of the war and was also used in the Korean War.',
    ),
    facts: [
      { k: K.first, v: t('1944', '1944') },
      { k: K.service, v: t('1944 sonu; muharebede 1945', 'Late 1944; in combat in 1945') },
      { k: K.designer, v: t('Sergey İlyuşin', 'Sergey Ilyushin') },
      { k: K.maker, v: t('Sovyet devlet fabrikaları; Çekoslovakya’da lisansla Avia B-33', 'Soviet state factories; in Czechoslovakia under licence as the Avia B-33') },
      { k: K.built, v: t('Sovyetler Birliği’nde yaklaşık 4.600; ayrıca Avia B-33’ler', 'About 4,600 in the Soviet Union, plus the Avia B-33s') },
      { k: K.engine, v: t('Mikulin AM-42, V12, yaklaşık 2.000 bg', 'Mikulin AM-42, V12, about 2,000 hp') },
      { k: K.speed, v: t('Yaklaşık 550 km/sa', 'About 550 km/h') },
      { k: K.guns, v: t('Kanatlarda 2 × 23 mm top ve 2 × 7,62 mm ShKAS, arkada 1 × 12,7 mm UBT; roket ve 400–600 kg bomba', '2 × 23 mm cannon and 2 × 7.62 mm ShKAS in the wings, 1 × 12.7 mm UBT in the rear; rockets and 400–600 kg of bombs') },
      { k: K.crew, v: t('2', '2') },
      { k: K.size, v: t('13,4 m / 11,12 m', '13.4 m / 11.12 m') },
    ],
    sections: [
      {
        h: t('Il-2’nin dersleri', 'The lessons of the Il-2'),
        p: [
          t(
            'Il-10, Il-2’nin yapısını değil fikrini aldı: motor, pilot, nişancı ve yakıt yine zırhlı bir kabuğun içindeydi, ama gövde tamamen metaldi ve çok daha temizdi. İniş takımı Il-2’deki gibi kanat altındaki çıkıntılara değil kanadın içine, tekerlekler dönerek geriye katlanıyordu. Daha güçlü motorla birlikte bu değişiklikler hızı belirgin biçimde artırdı.',
            'The Il-10 took the Il-2’s idea rather than its structure: the engine, pilot, gunner and fuel were still inside an armoured shell, but the airframe was all metal and much cleaner. The undercarriage retracted backwards into the wing, the wheels turning as they went, instead of into fairings under the wing as on the Il-2. Together with the stronger engine, these changes raised the speed markedly.',
          ),
        ],
      },
      {
        h: t('Savaşın sonu ve Kore', 'The end of the war and Korea'),
        p: [
          t(
            'Il-10 1945 başında muharebeye girdi ve savaşın son aylarında Almanya’ya karşı ve Ağustos 1945’te Japonlara karşı kullanıldı. Savaştan sonra Doğu Bloku ülkelerinin ve Çin’in hava kuvvetlerinde uçtu; Kore Savaşı’nda Kuzey Kore Il-10’ları savaştı.',
            'The Il-10 entered combat in early 1945 and was used against Germany in the last months of the war and against Japan in August 1945. After the war it flew with the air forces of the Eastern Bloc and China; North Korean Il-10s fought in the Korean War.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda taarruz uçağıdır: Il-2’den çok daha hızlıdır, ağır zırhını korur ve arkasında 12,7 mm’lik bir nişancı taşır. İki 23 mm topu, bombaları ve araştırmayla gelen roketleriyle kara hedeflerine saldırır.',
        'In the game it is a ground-attack aircraft: much faster than the Il-2, it keeps the heavy armour and carries a 12.7 mm rear gunner. It attacks ground targets with its two 23 mm cannon, bombs and, once researched, rockets.',
      ),
    ],
  },
  {
    id: 'sb2c',
    summary: t(
      'Zor doğan ama savaşın sonunda Japon donanmasını vuran büyük pike bombardıman uçağı.',
      'A large dive bomber with a troubled birth that struck the Japanese fleet at the end of the war.',
    ),
    lead: t(
      'Curtiss SB2C Helldiver, SBD Dauntless’ın yerini almak için tasarlanan büyük ve güçlü bir pike bombardıman uçağıdır. Gelişimi uzun ve sorunlu geçti, ekipler başta ondan hiç hoşlanmadı. Sorunları giderilen sonraki sürümler ise 1944–45’te Pasifik’teki büyük deniz muharebelerinde ABD Donanması’nın ana pike bombardıman uçağı oldu.',
      'The Curtiss SB2C Helldiver was a large, powerful dive bomber designed to replace the SBD Dauntless. Its development was long and troubled, and crews disliked it at first. Once its problems were sorted out, the later versions became the US Navy’s main dive bomber in the great naval battles of the Pacific in 1944–45.',
    ),
    facts: [
      { k: K.first, v: t('18 Aralık 1940', '18 December 1940') },
      { k: K.service, v: t('1943 sonu; SB2C-4 1944', 'Late 1943; the SB2C-4 in 1944') },
      { k: K.maker, v: t('Curtiss-Wright; Kanada’da Fairchild ve Canadian Car & Foundry', 'Curtiss-Wright; in Canada by Fairchild and Canadian Car & Foundry') },
      { k: K.built, v: t('7.000’i aşkın (bütün sürümler)', 'More than 7,000 (all variants)') },
      { k: K.engine, v: t('Wright R-2600-20 Cyclone 14, çift sıralı yıldız, yaklaşık 1.900 bg', 'Wright R-2600-20 Cyclone 14, twin-row radial, about 1,900 hp') },
      { k: K.speed, v: t('Yaklaşık 475 km/sa', 'About 475 km/h') },
      { k: K.guns, v: t('Kanatlarda 2 × 20 mm top, arkada çift 7,62 mm; iç bölmede 1.000 lb (454 kg), kanat altında ek bomba ya da roket', '2 × 20 mm cannon in the wings, twin .30 in in the rear; 1,000 lb (454 kg) in the internal bay, plus bombs or rockets under the wings') },
      { k: K.crew, v: t('2', '2') },
      { k: K.size, v: t('15,17 m / 11,18 m', '15.17 m / 11.18 m') },
    ],
    sections: [
      {
        h: t('Zor bir doğum', 'A troubled birth'),
        p: [
          t(
            'Helldiver, uçak gemisi asansörlerine sığması için kısa tutulmuş bir gövdeye büyük bir motor ve iç bomba bölmesi sığdırmak zorundaydı. Bu kısa gövde uçuş sorunlarına yol açtı; üretim sırasında yapılan sayısız değişiklik ise teslimatları geciktirdi. İlk sürümler ağır, dengesiz ve bakımı zordu; ekipler ona ağır lakaplar taktı.',
            'The Helldiver had to fit a large engine and an internal bomb bay into a fuselage kept short to fit aircraft carrier lifts. The short fuselage caused handling problems, and countless changes made during production delayed deliveries. The first versions were heavy, unstable and hard to maintain, and crews gave it harsh nicknames.',
          ),
        ],
      },
      {
        h: t('Pasifik’in son yılları', 'The last years in the Pacific'),
        p: [
          t(
            'Helldiver Kasım 1943’te Rabaul’a yapılan saldırıyla muharebeye girdi. Haziran 1944’teki Filipin Denizi Muharebesi’nde, Ekim 1944’teki Leyte Körfezi’nde ve Nisan 1945’te dev Japon zırhlısı Yamato’nun batırılmasında ABD uçak gemilerinden kalkan Helldiver’lar da vardı.',
            'The Helldiver went into combat with the raid on Rabaul in November 1943. Helldivers from American carriers were in action at the Battle of the Philippine Sea in June 1944, at Leyte Gulf in October 1944 and in the sinking of the giant Japanese battleship Yamato in April 1945.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda pike bombardıman uçağıdır: hava frenleriyle yaklaşık 70 derece dalar ve bombasını yaklaşık 700 m’de bırakır. Daha büyük ve güçlüdür; kanatlarındaki iki 20 mm top ve arkadaki çift makineli onu SBD’den iyi silahlandırır, ama ağır bir uçaktır.',
        'In the game it is a dive bomber: it dives at about 70 degrees with its dive brakes open and releases at about 700 m. It is bigger and more powerful; the two 20 mm wing cannon and the twin rear guns arm it better than the SBD, but it is a heavy aircraft.',
      ),
    ],
  },
  {
    id: 'yak3',
    summary: t(
      'Savaşın en hafif ve en çevik avcılarından: alçakta Bf 109 ve Fw 190’ı geride bıraktı.',
      'One of the lightest and most agile fighters of the war: down low it outclassed the Bf 109 and Fw 190.',
    ),
    lead: t(
      'Yakovlev Yak-3, savaşın en hafif ve en çevik avcılarından biridir. Alçak ve orta irtifada Bf 109 G ve Fw 190’dan daha iyi dönüyor ve tırmanıyordu; Luftwaffe’nin pilotlarını belli bir irtifanın altında onunla dalaşa girmemeleri için uyardığı anlatılır. Özgür Fransız Normandie-Niemen alayı Doğu Cephesi’nde Yak-3 uçurdu.',
      'The Yakovlev Yak-3 was one of the lightest and most agile fighters of the war. At low and medium altitude it out-turned and out-climbed the Bf 109 G and the Fw 190; the Luftwaffe is said to have warned its pilots not to dogfight it below a certain altitude. The Free French Normandie-Niemen regiment flew Yak-3s on the Eastern Front.',
    ),
    facts: [
      { k: K.first, v: t('1943', '1943') },
      { k: K.service, v: t('1944 ortası', 'Mid-1944') },
      { k: K.designer, v: t('Aleksandr Yakovlev', 'Alexander Yakovlev') },
      { k: K.maker, v: t('Sovyet devlet uçak fabrikaları', 'Soviet state aircraft factories') },
      { k: K.built, v: t('Yaklaşık 4.800', 'About 4,800') },
      { k: K.engine, v: t('Klimov VK-105PF2, V12, yaklaşık 1.300 bg', 'Klimov VK-105PF2, V12, about 1,300 hp') },
      { k: K.speed, v: t('Yaklaşık 645 km/sa, 4.100 m’de', 'About 645 km/h at 4,100 m') },
      { k: K.guns, v: t('Pervane göbeğinden 1 × 20 mm ShVAK, motor kaputunda 2 × 12,7 mm UBS', '1 × 20 mm ShVAK through the propeller hub, 2 × 12.7 mm UBS above the engine') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('9,2 m / 8,5 m', '9.2 m / 8.5 m') },
    ],
    sections: [
      {
        h: t('Her gramdan kısarak', 'Saving every gram'),
        p: [
          t(
            'Yak-3, Yak-1’in daha kısa kanatlı, hafifletilmiş ve aerodinamik olarak temizlenmiş bir hâliydi: yağ soğutucusu kanat köklerine taşındı, gövde ve kanat sadeleştirildi. Sonuç, daha güçlü bir motoru olmamasına rağmen çok hafif, çabuk tırmanan ve dar dönen bir avcıydı. Bunun bedeli kısa menzil ve hafif silahlardı.',
            'The Yak-3 was a shorter-winged, lightened and aerodynamically cleaned-up development of the Yak-1: the oil cooler moved to the wing roots and the fuselage and wing were simplified. The result, without a more powerful engine, was a very light fighter that climbed quickly and turned tightly. The price was short range and light armament.',
          ),
        ],
      },
      {
        h: t('Doğu Cephesi’nde', 'On the Eastern Front'),
        p: [
          t(
            'Sovyet pilotları Yak-3’ü alçak ve orta irtifada, kara birliklerinin üzerinde savaşırken çok etkili buldu; Doğu Cephesi’ndeki hava muharebelerinin çoğu zaten bu irtifalarda geçiyordu. Normandie-Niemen alayının Fransız pilotları da Yak-3’ü seçti; savaştan sonra Sovyetler Birliği uçakları onlara hediye etti ve pilotlar Yak-3’lerle Fransa’ya döndü.',
            'Soviet pilots found the Yak-3 very effective at low and medium altitude, fighting over the ground forces, where most air combat on the Eastern Front took place anyway. The French pilots of the Normandie-Niemen regiment chose the Yak-3 too; after the war the Soviet Union gave them the aircraft, and the pilots flew their Yak-3s home to France.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda dönüş avcısıdır: alçak ve orta irtifada çok hafif, çevik ve çabuk tırmanır; bu irtifalarda Bf 109 G ve Fw 190 ile dönüşte boy ölçüşür. Silahları hafif, menzili kısadır. Yüksekte gücü düşer ve karbüratörlü motoru eksi G’de bir an kesilir.',
        'In the game it is a turn fighter: very light, agile and quick to climb at low and medium altitude, where it out-turns the Bf 109 G and Fw 190. Its guns are light and its range short. It loses power high up, and its carburetted engine cuts out for a moment under negative g.',
      ),
    ],
  },
  {
    id: 'la7',
    summary: t(
      'Kozhedub’un uçağı: alçakta çok hızlı, yıldız motorlu Sovyet avcısı.',
      'Kozhedub’s aircraft: a radial-engined Soviet fighter, very fast at low level.',
    ),
    lead: t(
      'Lavochkin La-7, savaşın en iyi Sovyet avcılarından biridir. Güçlü yıldız motoru onu alçak ve orta irtifada çok hızlı ve çabuk tırmanır yaptı. Müttefiklerin en çok düşürme kaydeden pilotu Ivan Kozhedub savaşın son aylarında La-7 uçurdu ve onunla bir Me 262 jetini de düşürdü.',
      'The Lavochkin La-7 was one of the best Soviet fighters of the war. Its powerful radial engine made it very fast and a quick climber at low and medium altitude. Ivan Kozhedub, the highest-scoring Allied fighter pilot, flew the La-7 in the last months of the war and shot down an Me 262 jet with it.',
    ),
    facts: [
      { k: K.first, v: t('1944 başı', 'Early 1944') },
      { k: K.service, v: t('1944', '1944') },
      { k: K.designer, v: t('Semyon Lavochkin', 'Semyon Lavochkin') },
      { k: K.maker, v: t('Sovyet devlet uçak fabrikaları', 'Soviet state aircraft factories') },
      { k: K.built, v: t('Yaklaşık 5.750', 'About 5,750') },
      { k: K.engine, v: t('Shvetsov ASh-82FN, 14 silindirli çift sıralı yıldız, doğrudan yakıt püskürtmeli, yaklaşık 1.850 bg', 'Shvetsov ASh-82FN, 14-cylinder twin-row radial with direct fuel injection, about 1,850 hp') },
      { k: K.speed, v: t('Yaklaşık 660 km/sa, 6.000 m’de', 'About 660 km/h at 6,000 m') },
      { k: K.guns, v: t('Motor kaputunda 2 × 20 mm ShVAK (bazılarında 3 × 20 mm B-20)', '2 × 20 mm ShVAK above the engine (3 × 20 mm B-20 on some)') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('9,8 m / 8,6 m', '9.8 m / 8.6 m') },
    ],
    sections: [
      {
        h: t('LaGG-3’ten La-7’ye', 'From the LaGG-3 to the La-7'),
        p: [
          t(
            'La-7’nin kökü, başarısız sayılan ahşap LaGG-3’e dayanır. Lavochkin bu gövdeye sıvı soğutmalı motor yerine güçlü bir yıldız motor takarak La-5’i yarattı; La-7 de La-5’in aerodinamik olarak temizlenmiş, hafifletilmiş ve daha iyi silahlanmış sürümüdür. Kanat kirişleri ahşaptan metale geçirildi.',
            'The La-7’s roots go back to the wooden LaGG-3, regarded as a failure. By fitting a powerful radial in place of the liquid-cooled engine, Lavochkin created the La-5; the La-7 was the La-5 cleaned up aerodynamically, lightened and better armed. The wing spars changed from wood to metal.',
          ),
        ],
      },
      {
        h: t('Asların uçağı', 'An aircraft of aces'),
        p: [
          t(
            'La-7 1944–45’te en iyi Sovyet avcı birliklerine verildi. Ivan Kozhedub, toplam 62 düşürmesinin son bölümünü La-7 ile yaptı; Şubat 1945’te bir Me 262’yi düşürdü. Savaştan sonra Çekoslovakya ve başka ülkeler de La-7 kullandı.',
            'The La-7 went to the best Soviet fighter units in 1944–45. Ivan Kozhedub made the last part of his 62 victories in the La-7 and shot down an Me 262 in February 1945. After the war Czechoslovakia and other countries also flew the La-7.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji avcısıdır: alçakta ve orta irtifada çok hızlıdır, çabuk tırmanır ve kısa süreli acil güç kullanabilir. İki 20 mm topu motor kaputunda toplanmıştır. Yüksekte gücü düşer.',
        'In the game it is an energy fighter: very fast at low and medium altitude, a quick climber, with a short burst of emergency power. Its two 20 mm cannon are grouped above the engine. It loses power high up.',
      ),
    ],
  },
  {
    id: 'f6f5',
    summary: t(
      'Pasifik’te en çok düşürme yapan Amerikan uçağı: sağlam, güçlü, pilotunu koruyan.',
      'The American aircraft with the most kills in the Pacific: rugged, powerful and protective of its pilot.',
    ),
    lead: t(
      'Grumman F6F Hellcat, 1943’ten savaşın sonuna kadar ABD Donanması’nın ana uçak gemisi avcısıydı. Güçlü R-2800 motoru, büyük kanadı ve sağlam yapısıyla Japon Sıfır’ına karşı üstünlük kurdu. ABD Donanması ve Deniz Piyadeleri pilotları Hellcat ile 5.000’i aşkın düşürme kaydetti; bu, başka hiçbir Amerikan deniz uçağına nasip olmadı.',
      'The Grumman F6F Hellcat was the US Navy’s main carrier fighter from 1943 to the end of the war. With its powerful R-2800 engine, large wing and rugged structure, it gained the upper hand over the Japanese Zero. US Navy and Marine Corps pilots were credited with more than 5,000 kills in the Hellcat, more than any other American naval aircraft.',
    ),
    facts: [
      { k: K.first, v: t('26 Haziran 1942', '26 June 1942') },
      { k: K.service, v: t('1943; F6F-5 1944', '1943; the F6F-5 in 1944') },
      { k: K.maker, v: t('Grumman', 'Grumman') },
      { k: K.built, v: t('Yaklaşık 12.300', 'About 12,300') },
      { k: K.engine, v: t('Pratt & Whitney R-2800-10W Double Wasp, 18 silindirli çift sıralı yıldız, su enjeksiyonlu, yaklaşık 2.000 bg', 'Pratt & Whitney R-2800-10W Double Wasp, 18-cylinder twin-row radial with water injection, about 2,000 hp') },
      { k: K.speed, v: t('Yaklaşık 630 km/sa, 7.100 m’de', 'About 630 km/h at 7,100 m') },
      { k: K.guns, v: t('Kanatlarda 6 × 12,7 mm M2 Browning; bomba ve roket', '6 × .50 in M2 Browning in the wings; bombs and rockets') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('13,06 m / 10,24 m', '13.06 m / 10.24 m') },
    ],
    sections: [
      {
        h: t('Wildcat’in ağabeyi', 'Big brother to the Wildcat'),
        p: [
          t(
            'Hellcat, Grumman’ın F4F Wildcat’inin yerini almak üzere tasarlandı; daha büyük, çok daha güçlü motorlu ve daha geniş kanatlıydı. Pilot zırhı, sızdırmaz depoları ve sağlam yapısıyla, ateş altında dağılan Sıfır’ın tam tersiydi. İki yılda 12.000’i aşkın Hellcat üretildi.',
            'The Hellcat was designed to replace Grumman’s F4F Wildcat: bigger, with a much more powerful engine and a broader wing. With pilot armour, self-sealing tanks and a rugged structure, it was the opposite of the Zero, which came apart under fire. More than 12,000 Hellcats were built in two years.',
          ),
        ],
      },
      {
        h: t('“Marianalar hindi avı”', 'The “Marianas Turkey Shoot”'),
        p: [
          t(
            'Haziran 1944’teki Filipin Denizi Muharebesi’nde ABD uçak gemilerinden kalkan Hellcat’ler, saldırıya gelen Japon uçak gemisi uçaklarının çok büyük bölümünü düşürdü; pilotlar bu muharebeye “Büyük Marianalar hindi avı” dedi. Japon deniz havacılığı bu kayıptan sonra bir daha toparlanamadı.',
            'At the Battle of the Philippine Sea in June 1944, Hellcats from American carriers shot down a very large part of the attacking Japanese carrier aircraft; pilots called it the “Great Marianas Turkey Shoot”. Japanese naval aviation never recovered from the loss.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ağır hattaki bir dönüş avcısıdır: büyük kanadı sayesinde ağırlığına göre iyi döner, çok dayanıklıdır ve pilotunu korur. İki kademeli kompresörü yüksekte de güç verir. Altı 12,7 mm makinelisi vardır; bomba ve roket de taşıyabilir.',
        'In the game it is a turn fighter in the heavy line: its large wing lets it turn well for its weight, it is very tough and it protects its pilot. Its two-stage supercharger gives it power high up too. It has six .50 in guns and can also carry bombs and rockets.',
      ),
    ],
  },
  {
    id: 'a26b',
    summary: t(
      'Burnunda sekiz makineli taşıyan hızlı taarruz bombardıman uçağı; üç savaşta uçtu.',
      'A fast attack bomber with eight guns in its nose that flew in three wars.',
    ),
    lead: t(
      'Douglas A-26 Invader, iki motorlu, hızlı bir taarruz bombardıman uçağıdır. B sürümünün burnunda sekiz 12,7 mm makineli vardı ve uzaktan kumandalı taretlerle savunuluyordu. 1944’te savaşa girdi; savaştan sonra B-26 adıyla Kore’de ve Vietnam’da da savaştı.',
      'The Douglas A-26 Invader was a fast twin-engined attack bomber. The B version had eight .50 in guns in its nose and was defended by remotely controlled turrets. It entered the war in 1944, and afterwards, as the B-26, fought in Korea and Vietnam too.',
    ),
    facts: [
      { k: K.first, v: t('10 Temmuz 1942', '10 July 1942') },
      { k: K.service, v: t('1944', '1944') },
      { k: K.designer, v: t('Ed Heinemann, Robert Donovan ve Ted Smith (Douglas)', 'Ed Heinemann, Robert Donovan and Ted Smith (Douglas)') },
      { k: K.maker, v: t('Douglas Aircraft', 'Douglas Aircraft') },
      { k: K.built, v: t('Yaklaşık 2.500', 'About 2,500') },
      { k: K.engine, v: t('2 × Pratt & Whitney R-2800-79, 18 silindirli çift sıralı yıldız, her biri yaklaşık 2.000 bg', '2 × Pratt & Whitney R-2800-79, 18-cylinder twin-row radial, about 2,000 hp each') },
      { k: K.speed, v: t('Yaklaşık 570 km/sa', 'About 570 km/h') },
      { k: K.guns, v: t('Burunda 6–8 × 12,7 mm; uzaktan kumandalı sırt ve karın taretlerinde 2’şer × 12,7 mm; iç bölmede 1.800 kg’a kadar bomba', '6–8 × .50 in in the nose; 2 × .50 in each in remotely controlled dorsal and ventral turrets; up to 1,800 kg of bombs internally') },
      { k: K.crew, v: t('3', '3') },
      { k: K.size, v: t('21,34 m / 15,24 m', '21.34 m / 15.24 m') },
    ],
    sections: [
      {
        h: t('Hızlı ve ağır silahlı', 'Fast and heavily armed'),
        p: [
          t(
            'A-26, Douglas’ta SBD’yi de tasarlayan Ed Heinemann’ın ekibince, A-20 Havoc ve B-25 gibi uçakların yerini alacak bir taarruz bombardıman uçağı olarak tasarlandı. Laminer akış kanadı ve güçlü motorlarıyla zamanının çoğu avcısına yakın hızdaydı. Sırt ve karın taretleri gövdedeki bir nişancının periskopla yönettiği uzaktan kumandalı taretlerdi.',
            'The A-26 was designed by the team of Ed Heinemann, who also designed the SBD at Douglas, as an attack bomber to replace aircraft such as the A-20 Havoc and the B-25. With a laminar-flow wing and powerful engines it was nearly as fast as many fighters of its day. Its dorsal and ventral turrets were remotely controlled, aimed through a periscope by a gunner in the fuselage.',
          ),
        ],
      },
      {
        h: t('Üç savaş', 'Three wars'),
        p: [
          t(
            'A-26 1944 yazında Pasifik’te, sonbaharda Avrupa’da muharebeye girdi. 1948’de ABD Hava Kuvvetleri onu B-26 diye yeniden adlandırdı. Kore Savaşı’nda gece saldırılarında yoğun kullanıldı; Vietnam Savaşı’nda da gece taarruz uçağı olarak uçtu. Birçok ülkenin hava kuvvetlerinde 1970’lere kadar hizmet verdi.',
            'The A-26 went into combat in the Pacific in the summer of 1944 and in Europe that autumn. In 1948 the US Air Force redesignated it the B-26. It was used heavily for night attacks in the Korean War and flew as a night attack aircraft in the Vietnam War. It served with many air forces into the 1970s.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda taarruz hattındadır ve araştırma ağacının ikinci aşamasındadır. Burnundaki sekiz 12,7 mm makineli kara hedeflerine ve uçaklara çok ağır ateş açar; iç bölmesinde bomba, kanat altında roket taşır. Uzaktan kumandalı sırt ve karın taretleri onu savunur. Hızlıdır ama büyük bir hedeftir.',
        'In the game it sits in the attack line, in the second stage of the research tree. The eight .50 in guns in its nose pour very heavy fire on ground targets and aircraft; it carries bombs internally and rockets under the wings. Remotely controlled dorsal and ventral turrets defend it. It is fast but a large target.',
      ),
    ],
  },
  {
    id: 'ar234',
    summary: t(
      'Dünyanın ilk jet bombardıman ve keşif uçağı: savunma silahı yok, hızı yeter.',
      'The world’s first jet bomber and reconnaissance aircraft: no defensive guns, its speed was enough.',
    ),
    lead: t(
      'Arado Ar 234 Blitz, dünyanın ilk muharebede kullanılan jet bombardıman uçağıdır. Tek pilotluydu ve savunma silahı taşımazdı: pervaneli avcıların yetişemeyeceği hızına güvenirdi. Önce keşif uçağı olarak, Müttefiklerin Normandiya’daki yığınaklarını kimse engelleyemeden fotoğrafladı; savaşın sonunda Remagen köprüsüne saldırdı.',
      'The Arado Ar 234 Blitz was the world’s first jet bomber to see combat. It had a single pilot and carried no defensive guns, relying on a speed that piston-engined fighters could not match. First as a reconnaissance aircraft, it photographed the Allied build-up in Normandy unopposed; at the end of the war it attacked the bridge at Remagen.',
    ),
    facts: [
      { k: K.first, v: t('30 Temmuz 1943 (prototip; kalkış arabası ve iniş kızağıyla)', '30 July 1943 (prototype, with a take-off trolley and landing skid)') },
      { k: K.service, v: t('1944 yazı (keşif); bombardıman sürümü 1944 sonu', 'Summer 1944 (reconnaissance); bomber version late 1944') },
      { k: K.designer, v: t('Rüdiger Kosin’in Arado ekibi', 'Rüdiger Kosin’s Arado team') },
      { k: K.maker, v: t('Arado', 'Arado') },
      { k: K.built, v: t('Yaklaşık 210', 'About 210') },
      { k: K.engine, v: t('2 × Junkers Jumo 004B turbojet, her biri 8,8 kN', '2 × Junkers Jumo 004B turbojets, 8.8 kN each') },
      { k: K.speed, v: t('Yaklaşık 740 km/sa', 'About 740 km/h') },
      { k: K.guns, v: t('Savunma silahı yok; 1.500 kg’a kadar bomba', 'No defensive guns; up to 1,500 kg of bombs') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('14,41 m / 12,64 m', '14.41 m / 12.64 m') },
    ],
    sections: [
      {
        h: t('Arabayla kalkan uçak', 'An aircraft that took off from a trolley'),
        p: [
          t(
            'İlk Ar 234’lerin gövdesinde iniş takımına yer yoktu: uçak, kalkışta bırakılan tekerlekli bir arabadan havalanıyor ve gövdesinin altındaki kızakla iniyordu. Seri üretim B sürümü normal iniş takımı aldı. Pilot camlı burunda tek başına oturur; bombardımanda otomatik pilotu açıp nişangâha eğilirdi.',
            'The first Ar 234s had no room for an undercarriage in the fuselage: the aircraft took off from a wheeled trolley that was dropped on take-off and landed on a skid under its fuselage. The production B version got a normal undercarriage. The pilot sat alone in the glazed nose; when bombing he switched on the autopilot and leaned over the bombsight.',
          ),
        ],
      },
      {
        h: t('Görünmez keşif ve Remagen', 'Untouchable reconnaissance and Remagen'),
        p: [
          t(
            'Temmuz–Ağustos 1944’te Ar 234’ler Normandiya’daki Müttefik çıkarma bölgesini yüksekten ve hızla fotoğrafladı; aylardır bu bölgeyi göremeyen Alman komutanlığı ilk kez net keşif fotoğrafları aldı. Mart 1945’te Ar 234 bombardıman uçakları, Müttefiklerin Remagen’de sağlam ele geçirdiği Ren köprüsünü vurmaya çalıştı.',
            'In July and August 1944, Ar 234s photographed the Allied landing area in Normandy from high altitude at high speed, giving the German command, which had been unable to see the area for months, its first clear reconnaissance photographs. In March 1945, Ar 234 bombers tried to destroy the Rhine bridge the Allies had captured intact at Remagen.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda jet bombardıman uçağıdır: tek pilotludur ve savunma silahı yoktur; pervanelilerin yetişemeyeceği hızda ve yükseklikte kaçar. 1.500 kg’a kadar bomba taşır. Jumo 004’ler gaz koluna geç tepki verir; yavaşken savunmasızdır.',
        'In the game it is a jet bomber: it has a single pilot and no defensive guns, and escapes at a speed and altitude that piston aircraft cannot match. It carries up to 1,500 kg of bombs. The Jumo 004s respond slowly to the throttle, and it is vulnerable when slow.',
      ),
    ],
  },
];
