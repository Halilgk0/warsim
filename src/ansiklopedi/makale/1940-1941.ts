// Ansiklopedi makaleleri, 1940–1941 uçakları (katalog yılına göre).

import { K, t, type Article } from '../tur';

export const A1940_1941: Article[] = [
  {
    id: 'ju88a4',
    summary: t(
      'Hızlı bombardıman olarak doğdu, savaşın en çok iş gören Alman uçağı oldu.',
      'Born as a fast bomber, it became the most versatile German aircraft of the war.',
    ),
    lead: t(
      'Junkers Ju 88, avcılardan kaçabilecek kadar hızlı bir “Schnellbomber” olarak tasarlandı. Sonradan pike bombardımanı da yapabilmesi istendi; uçak ağırlaştı, ama ortaya savaşın en çok yönlü Alman uçağı çıktı: bombardıman, pike bombardımanı, gece avcısı, keşif ve torpido uçağı. 15.000’i aşkın üretildi.',
      'The Junkers Ju 88 was designed as a “Schnellbomber”, a bomber fast enough to outrun fighters. It was later required to dive-bomb as well; it grew heavier, but the result was the most versatile German aircraft of the war: bomber, dive bomber, night fighter, reconnaissance and torpedo aircraft. More than 15,000 were built.',
    ),
    facts: [
      { k: K.first, v: t('21 Aralık 1936 (prototip Ju 88 V1)', '21 December 1936 (prototype Ju 88 V1)') },
      { k: K.service, v: t('1939; A-4 sürümü 1940', '1939; the A-4 in 1940') },
      { k: K.designer, v: t('W. H. Evers ve Alfred Gassner (Junkers)', 'W. H. Evers and Alfred Gassner (Junkers)') },
      { k: K.maker, v: t('Junkers ve başka Alman fabrikaları', 'Junkers and other German factories') },
      { k: K.built, v: t('15.000’i aşkın (bütün sürümler)', 'More than 15,000 (all variants)') },
      { k: K.engine, v: t('2 × Junkers Jumo 211J, ters V12, her biri yaklaşık 1.400 PS (kalkış)', '2 × Junkers Jumo 211J, inverted V12, about 1,400 PS each (take-off)') },
      { k: K.speed, v: t('Yaklaşık 470 km/sa, 5.300 m’de', 'About 470 km/h at 5,300 m') },
      { k: K.guns, v: t('Burunda, kokpit arkasında ve karın gondolunda 7,92 mm MG 81 ve MG 15 makineliler; gövde içinde ve kanat altında 2 tonu aşan bomba', '7.92 mm MG 81 and MG 15 guns in the nose, behind the cockpit and in the ventral gondola; more than 2 tonnes of bombs inside the fuselage and under the wings') },
      { k: K.crew, v: t('4', '4') },
      { k: K.size, v: t('20,08 m / 14,36 m', '20.08 m / 14.36 m') },
    ],
    sections: [
      {
        h: t('“Schnellbomber”', 'The “Schnellbomber”'),
        p: [
          t(
            'Ju 88, 1930’ların ortasında Luftwaffe’nin hızlı bombardıman uçağı isteğine yanıt olarak Junkers’te W. H. Evers ve ABD’de çalışmış mühendis Alfred Gassner tarafından tasarlandı. Prototipi 1936 sonunda uçtu ve zamanının en hızlı bombardıman uçaklarından biriydi.',
            'The Ju 88 was designed at Junkers by W. H. Evers and Alfred Gassner, an engineer who had worked in the United States, in answer to the Luftwaffe’s mid-1930s call for a fast bomber. The prototype flew at the end of 1936 and was one of the fastest bombers of its day.',
          ),
          t(
            'Sonra uçaktan dik dalışla bomba atabilmesi de istendi. Kanatlara hava frenleri ve yapıya ek dayanım eklendi; ağırlık arttı, hız düştü ve seri üretim gecikti. Yine de Ju 88 60 derecelik dalışla isabetli bombardıman yapabilen ender çift motorlu uçaklardan biri oldu.',
            'It was then also required to drop bombs in a steep dive. Dive brakes went into the wings and extra strength into the structure; weight rose, speed fell and production was delayed. Even so, the Ju 88 became one of the few twin-engined aircraft that could bomb accurately in a 60-degree dive.',
          ),
        ],
      },
      {
        h: t('Her işe koşulan uçak', 'An aircraft for every job'),
        p: [
          t(
            'Britanya Muharebesi’nde Luftwaffe’nin en hızlı bombardıman uçağıydı, ama yine de Hurricane ve Spitfire’lara karşı kayıp verdi. Savaş ilerledikçe Akdeniz’de gemilere karşı, Doğu Cephesi’nde kara desteğinde, keşifte ve torpido uçağı olarak kullanıldı.',
            'In the Battle of Britain it was the Luftwaffe’s fastest bomber, but it still took losses against Hurricanes and Spitfires. As the war went on it was used against shipping in the Mediterranean, in ground support on the Eastern Front, for reconnaissance and as a torpedo bomber.',
          ),
          t(
            'Radarlı Ju 88 gece avcıları, Bf 110’la birlikte Almanya’nın gece savunmasının belkemiği oldu. Temmuz 1944’te bir Ju 88 G gece avcısı yanlışlıkla İngiltere’ye indi; İngilizler üzerindeki radarı ve bombardıman uçaklarının radar yayınlarını izleyen düzeneği inceleyip karşı önlem geliştirdi. Savaşın sonunda eski Ju 88’ler, üzerlerine bir avcı bağlanıp patlayıcıyla doldurularak “Mistel” uçan bombalarına dönüştürüldü.',
            'Radar-equipped Ju 88 night fighters became, with the Bf 110, the backbone of Germany’s night defences. In July 1944 a Ju 88 G night fighter landed in England by mistake; the British studied its radar and the device that homed on bombers’ radar emissions, and devised countermeasures. Late in the war, old Ju 88s were filled with explosives and had a fighter mounted on top, becoming “Mistel” flying bombs.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda orta bombardıman uçağıdır ve hava frenleriyle 60 derece dalarak pike bombardımanına da gönderilebilir; bombayı yaklaşık 1.000 m’de bırakır. He 111’den hızlıdır. Savunması burun, kokpit arkası ve karındaki MG 81’lerdir; avcılara karşı yine de refakat ister.',
        'In the game it is a medium bomber that can also be sent on dive-bombing missions, diving at 60 degrees with its dive brakes and releasing at about 1,000 m. It is faster than the He 111. Its defence is MG 81 guns in the nose, behind the cockpit and in the belly; against fighters it still needs an escort.',
      ),
    ],
  },
  {
    id: 'a6m2',
    summary: t(
      'Çok hafif, çok çevik, çok uzun menzilli: savaşın başında Pasifik’in hâkimi.',
      'Very light, very agile, very long-ranged: master of the Pacific skies early in the war.',
    ),
    lead: t(
      'Mitsubishi A6M Sıfır, Japon İmparatorluk Donanması’nın uçak gemisi avcısıdır. Savaşın başında hafifliği, dönüşteki çevikliği ve olağanüstü menziliyle rakiplerini şaşırttı. Bu üstünlüğün bedeli zırhsızlık ve sızdırmaz depo yokluğuydu; Müttefik pilotlar ona karşı doğru taktiği bulunca Sıfır’ın üstünlüğü sona erdi.',
      'The Mitsubishi A6M Zero was the carrier fighter of the Imperial Japanese Navy. Early in the war it stunned its opponents with its lightness, agility in the turn and extraordinary range. The price was no armour and no self-sealing tanks; once Allied pilots found the right tactics against it, the Zero’s advantage was gone.',
    ),
    facts: [
      { k: K.first, v: t('1 Nisan 1939 (prototip A6M1)', '1 April 1939 (prototype A6M1)') },
      { k: K.service, v: t('Temmuz 1940', 'July 1940') },
      { k: K.designer, v: t('Jiro Horikoshi', 'Jiro Horikoshi') },
      { k: K.maker, v: t('Mitsubishi; lisansla Nakajima', 'Mitsubishi; under licence by Nakajima') },
      { k: K.built, v: t('10.000’i aşkın (bütün sürümler)', 'More than 10,000 (all variants)') },
      { k: K.engine, v: t('Nakajima Sakae 12, 14 silindirli çift sıralı yıldız, yaklaşık 940 bg', 'Nakajima Sakae 12, 14-cylinder twin-row radial, about 940 hp') },
      { k: K.speed, v: t('Yaklaşık 533 km/sa, 4.550 m’de', 'About 533 km/h at 4,550 m') },
      { k: K.guns, v: t('Kanatlarda 2 × 20 mm Tip 99 top (namlu başına 60 mermi), motor kaputunda 2 × 7,7 mm Tip 97 makineli', '2 × 20 mm Type 99 cannon in the wings (60 rounds per gun), 2 × 7.7 mm Type 97 machine guns above the engine') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('12,0 m / 9,06 m', '12.0 m / 9.06 m') },
    ],
    sections: [
      {
        h: t('Ağırlıktan kazanılan her gram', 'Every gram saved'),
        p: [
          t(
            'Donanmanın istediği uçak, hem uzun menzilli hem de kara avcıları kadar çevik olmalıydı. Jiro Horikoshi bunu ağırlıktan kısarak başardı: gövdede ve kanatta ince, hafif bir alaşım, en az parça, pilot zırhı ve sızdırmaz depo yok. “Sıfır” adı, kabul edildiği yılın Japon takvimindeki 2600 yılının son hanesinden gelir; Müttefiklerin kod adı “Zeke”ti.',
            'The navy wanted an aircraft with both a long range and the agility of a land-based fighter. Jiro Horikoshi achieved it by saving weight: a thin, light alloy in the fuselage and wing, as few parts as possible, no pilot armour and no self-sealing tanks. The name “Zero” comes from the last digit of the Japanese imperial year 2600, the year it was adopted; the Allied code name was “Zeke”.',
          ),
        ],
      },
      {
        h: t('Savaşın başında', 'Early in the war'),
        p: [
          t(
            'Sıfır, Eylül 1940’ta Çin üzerinde ilk muharebesinde kayıp vermeden çok sayıda Çin avcısı düşürdü. Aralık 1941’de Pearl Harbor saldırısında ve ardından Filipinler’den Hint Okyanusu’na kadar Müttefik avcılarına üstün geldi. Alçak hızlı bir dönüş dalaşında onu yakalamak neredeyse imkânsızdı.',
            'In its first combat, over China in September 1940, the Zero shot down many Chinese fighters without loss. At Pearl Harbor in December 1941, and then from the Philippines to the Indian Ocean, it outclassed Allied fighters. In a slow turning fight it was almost impossible to catch.',
          ),
        ],
      },
      {
        h: t('Zayıf noktalar bulununca', 'When its weaknesses were found'),
        p: [
          t(
            'Temmuz 1942’de Aleut Adaları’nda neredeyse sağlam ele geçirilen bir Sıfır, ABD’de baştan sona incelendi. Müttefik pilotlar onunla dönüşe girmemeyi, yüksekten dalıp vurup uzaklaşmayı öğrendi; ABD Donanması’ndan John Thach’ın geliştirdiği, iki avcının birbirini koruyarak makas çizdiği “Thach örgüsü” Sıfır’a karşı çok etkili oldu.',
            'A Zero captured almost intact in the Aleutian Islands in July 1942 was studied from end to end in the United States. Allied pilots learned not to turn with it but to dive from above, strike and leave; the “Thach Weave”, devised by the US Navy’s John Thach, in which two fighters scissored to cover each other, proved very effective against it.',
          ),
          t(
            'Yüksek hızda kanatçıkları çok ağırlaşıyordu, dalışta da daha ağır Amerikan avcılarına yetişemiyordu. Zırhsız ve sızdırmaz deposuz olduğu için birkaç isabet onu düşürmeye yetiyordu. Savaşın sonuna doğru birçok Sıfır kamikaze saldırılarında kullanıldı.',
            'At high speed its ailerons became very heavy, and in a dive it could not keep up with the heavier American fighters. With no armour and no self-sealing tanks, a few hits were enough to bring it down. Towards the end of the war many Zeros were used in kamikaze attacks.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda çok hafif bir dönüş avcısıdır: alçak hızda dalaşta neredeyse hiçbir avcı onunla dönemez, menzili de çok uzundur. Ama zırhı ve sızdırmaz deposu yoktur; birkaç isabet yeter. Yüksek hızda kanatçıkları ağırlaşır ve karbüratörlü motoru eksi G’de bir an kesilir.',
        'In the game it is a very light turn fighter: in a slow dogfight almost no fighter can turn with it, and its range is very long. But it has no armour and no self-sealing tanks, so a few hits are enough. At high speed its ailerons stiffen, and its carburetted engine cuts out for a moment under negative g.',
      ),
    ],
  },
  {
    id: 'spitfire5',
    summary: t(
      'Bf 109 F’ye yanıt olarak çıkarılan, en çok üretilen Spitfire sürümü.',
      'The most-produced Spitfire, rushed out as the answer to the Bf 109 F.',
    ),
    lead: t(
      'Spitfire Mk V, 1941’de Bf 109 F’ye yetişebilmek için Mk I ve Mk II gövdesine daha güçlü Merlin 45 motoru takılarak hızla üretildi. Geçici bir çözüm olarak düşünülmüştü, ama yaklaşık 6.500 adetle en çok üretilen Spitfire sürümü oldu. Malta’dan Kuzey Afrika’ya, yurt dışında savaşan ilk Spitfire’lar Mk V’lerdi.',
      'The Spitfire Mk V was rushed out in 1941 by fitting the more powerful Merlin 45 to the Mk I and Mk II airframe, so as to keep pace with the Bf 109 F. It was meant as a stopgap, but at about 6,500 built it became the most-produced Spitfire version. The first Spitfires to fight overseas, from Malta to North Africa, were Mk Vs.',
    ),
    facts: [
      { k: K.service, v: t('1941 başı', 'Early 1941') },
      { k: K.designer, v: t('Joseph Smith’in Supermarine ekibi', 'Joseph Smith’s Supermarine team') },
      { k: K.maker, v: t('Supermarine; Castle Bromwich ve Westland', 'Supermarine; Castle Bromwich and Westland') },
      { k: K.built, v: t('Yaklaşık 6.500 Mk V', 'About 6,500 Mk Vs') },
      { k: K.engine, v: t('Rolls-Royce Merlin 45, V12, tek kademeli kompresör, yaklaşık 1.450 bg', 'Rolls-Royce Merlin 45, V12 with single-stage supercharger, about 1,450 hp') },
      { k: K.speed, v: t('Yaklaşık 595 km/sa, 5.900 m’de', 'About 595 km/h at 5,900 m') },
      { k: K.guns, v: t('2 × 20 mm Hispano top ve 4 × 7,7 mm Browning makineli tüfek', '2 × 20 mm Hispano cannon and 4 × .303 in Browning machine guns') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('11,23 m (kırpık kanatlılarda 9,93 m) / 9,12 m', '11.23 m (9.93 m with clipped wings) / 9.12 m') },
    ],
    sections: [
      {
        h: t('Geçici bir çözüm', 'A stopgap'),
        p: [
          t(
            '1941 başında Luftwaffe’nin yeni Bf 109 F’si Spitfire Mk I ve II’den üstündü. Asıl yanıt olarak daha büyük değişiklikler planlanıyordu, ama zaman yoktu: var olan gövdeye daha güçlü Merlin 45 takıldı ve Mk V çıktı. Vb sürümünde kanatlarda iki 20 mm Hispano topu ve dört makineli tüfek vardı; topların gücü Mk I’in sekiz makineli tüfeğine göre büyük bir sıçramaydı.',
            'In early 1941 the Luftwaffe’s new Bf 109 F outclassed the Spitfire Mk I and II. Bigger changes were planned as the real answer, but there was no time: the more powerful Merlin 45 went into the existing airframe and the Mk V was born. The Vb had two 20 mm Hispano cannon and four machine guns in the wings, a great step in hitting power over the eight machine guns of the Mk I.',
          ),
          t(
            'Merlin’in eksi G’de kesilmesi, 1941’de mühendis Beatrice Shilling’in karbüratöre eklediği küçük bir delikli pulla büyük ölçüde azaltıldı; pilotlar buna “Miss Shilling’in deliği” dedi. Sorun tümüyle ancak sonraki basınçlı karbüratörlerle çözüldü.',
            'The Merlin’s negative-g cut-out was largely cured in 1941 by a small restrictor that engineer Beatrice Shilling added to the carburettor; pilots called it “Miss Shilling’s orifice”. The problem only went away entirely with the pressure carburettors that came later.',
          ),
        ],
      },
      {
        h: t('Fw 190 sürprizi', 'The Fw 190 shock'),
        p: [
          t(
            '1941 sonbaharında Manş üzerinde beliren Focke-Wulf Fw 190, Spitfire Mk V’ten hızlıydı, daha iyi tırmanıyor ve çok daha çabuk yuvarlanıyordu. RAF bu üstünlüğü bir yıl kadar çekti; yanıt, iki kademeli kompresörlü Merlin 61’li Spitfire Mk IX oldu. Alçak irtifada yuvarlanmayı iyileştirmek için bazı Mk V’lerin kanat uçları kırpıldı.',
            'The Focke-Wulf Fw 190, which appeared over the Channel in the autumn of 1941, was faster than the Spitfire Mk V, climbed better and rolled much faster. The RAF suffered under this for about a year; the answer was the Spitfire Mk IX with the two-stage Merlin 61. Some Mk Vs had their wingtips clipped to improve their roll at low level.',
          ),
        ],
      },
      {
        h: t('Malta’dan Kuzey Afrika’ya', 'From Malta to North Africa'),
        p: [
          t(
            '1942’de kuşatma altındaki Malta’ya Spitfire Mk V’ler uçak gemilerinden kaldırılarak ulaştırıldı. Toza karşı burnun altına büyük bir hava filtresi takılan Mk V’ler Kuzey Afrika’da, İtalya’da ve Uzak Doğu’da savaştı; ABD Ordusu Hava Kuvvetleri’nin bazı birlikleri ve Sovyetler Birliği de Mk V kullandı.',
            'In 1942 Spitfire Mk Vs reached besieged Malta by flying off aircraft carriers. With a large air filter under the nose against the dust, Mk Vs fought in North Africa, Italy and the Far East; some US Army Air Forces groups and the Soviet Union flew Mk Vs too.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda alçak ve orta irtifada çok iyi bir dönüş avcısıdır; iki 20 mm topu onu Mk I’den çok daha öldürücü yapar. Tek kademeli kompresörü yüksekte güç kaybettirir. Merlin’in eksi G’de kesilmesi azalmıştır ama tümüyle kalkmamıştır.',
        'In the game it is a very good turn fighter at low and medium altitude, and its two 20 mm cannon make it far deadlier than the Mk I. Its single-stage supercharger loses power high up. The Merlin’s negative-g cut-out is reduced but not entirely gone.',
      ),
    ],
  },
  {
    id: 'bf109f',
    summary: t(
      '“Friedrich”: yuvarlak kanat uçlu, burun toplu, 109 ailesinin en dengelisi.',
      'The “Friedrich”: round-tipped, hub-cannon armed, the best-balanced member of the 109 family.',
    ),
    lead: t(
      'Bf 109 F, pilotların “Friedrich” dediği sürüm, Bf 109’un aerodinamik açıdan baştan elden geçirilmiş hâlidir: yuvarlak kanat uçları, daha temiz bir motor kaputu, desteksiz kuyruk ve pervane göbeğinden ateş eden tek bir top. Birçok pilot onu 109 ailesinin en iyi uçan üyesi sayar.',
      'The Bf 109 F, the version pilots called the “Friedrich”, was the Bf 109 aerodynamically reworked from end to end: rounded wingtips, a cleaner engine cowling, a strut-free tail and a single cannon firing through the propeller hub. Many pilots consider it the best-flying member of the 109 family.',
    ),
    facts: [
      { k: K.service, v: t('1941 başı; F-4 1941 ortası', 'Early 1941; the F-4 in mid-1941') },
      { k: K.designer, v: t('Willy Messerschmitt’in ekibi', 'Willy Messerschmitt’s team') },
      { k: K.maker, v: t('Messerschmitt AG ve lisanslı fabrikalar', 'Messerschmitt AG and licensed factories') },
      { k: K.built, v: t('Bf 109 ailesi yaklaşık 34.000 (bütün sürümler)', 'Bf 109 family about 34,000 (all variants)') },
      { k: K.engine, v: t('Daimler-Benz DB 601E, ters V12, doğrudan yakıt püskürtmeli, yaklaşık 1.350 PS', 'Daimler-Benz DB 601E, inverted V12 with direct fuel injection, about 1,350 PS') },
      { k: K.speed, v: t('Yaklaşık 635 km/sa, 6.200 m’de', 'About 635 km/h at 6,200 m') },
      { k: K.guns, v: t('Pervane göbeğinden ateş eden 1 × 20 mm MG 151/20 (200 mermi), motor kaputunda 2 × 7,92 mm MG 17', '1 × 20 mm MG 151/20 firing through the propeller hub (200 rounds), 2 × 7.92 mm MG 17 above the engine') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('9,92 m / 8,94 m', '9.92 m / 8.94 m') },
    ],
    sections: [
      {
        h: t('Daha temiz bir 109', 'A cleaner 109'),
        p: [
          t(
            'F sürümünde kanat uçları yuvarlatıldı, motor kaputu inceltildi, radyatörler yeniden düzenlendi ve yatay kuyruğun dış destekleri kaldırıldı; kuyruk tekerleği de içeri katlanır oldu. Kanattaki toplar kalktı, yerine motorun içinden pervane göbeğinden ateş eden tek bir top geldi. Ateş gücü azaldı, ama uçak hafifledi, hızlandı ve çok daha iyi yuvarlanır oldu.',
            'On the F the wingtips were rounded, the cowling slimmed, the radiators redesigned and the external struts of the tailplane removed; the tailwheel became retractable too. The wing cannon went, replaced by a single cannon firing through the propeller hub from inside the engine. Firepower dropped, but the aircraft grew lighter, faster and much better in the roll.',
          ),
          t(
            'İlk F’lerde kuyrukta titreşim sorunları çıktı ve birkaç uçak kuyruğunu kaybetti; yapı güçlendirilince sorun çözüldü.',
            'Early Fs suffered from tail flutter and several aircraft lost their tails; the problem was solved by strengthening the structure.',
          ),
        ],
      },
      {
        h: t('1941–42’nin üstün avcısı', 'The top fighter of 1941–42'),
        p: [
          t(
            'Bf 109 F, 1941’de Manş üzerinde Spitfire Mk V’ten üstündü. Haziran 1941’de Sovyetler Birliği’ne saldırıda Alman avcı gücünün çoğunu oluşturdu ve I-16 gibi eski Sovyet avcılarına karşı ezici üstünlük kurdu. Kuzey Afrika’da Hans-Joachim Marseille gibi pilotlar Bf 109 F ile ün kazandı.',
            'In 1941 the Bf 109 F outclassed the Spitfire Mk V over the Channel. In the attack on the Soviet Union in June 1941 it made up most of the German fighter force and had a crushing advantage over older Soviet fighters such as the I-16. In North Africa pilots like Hans-Joachim Marseille made their names in the Bf 109 F.',
          ),
          t(
            '1942’de yerini daha güçlü motorlu, daha ağır silahlı ama daha ağır uçan Bf 109 G’ye bıraktı.',
            'In 1942 it gave way to the Bf 109 G, with a more powerful engine and heavier armament, but heavier to fly.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji avcısıdır ve 109 ailesinin en dengelisidir: hızlıdır, iyi tırmanır ve yuvarlanır. Tek topu Emil’in iki topuna göre daha çok mermi taşır. Dönüş dalaşına girmez, yukarıdan dalıp vurur; takip edilirse eksi G pikesiyle kurtulur.',
        'In the game it is an energy fighter and the best balanced of the 109 family: fast, a good climber and a good roller. Its single cannon carries more ammunition than the Emil’s two. It avoids turning fights and dives in from above; when pursued it escapes with a negative-g push-over.',
      ),
    ],
  },
  {
    id: 'il2',
    summary: t(
      '“Uçan tank”: tarihin en çok üretilen askerî uçağı.',
      'The “flying tank”: the most-produced military aircraft in history.',
    ),
    lead: t(
      'Ilyushin Il-2 Şturmovik, motoru, pilotu ve yakıtı taşıyıcı zırhlı bir kabuğun içine alan alçak irtifa taarruz uçağıdır. Yaklaşık 36.000 adetle tarihin en çok üretilen askerî uçağıdır. Stalin’in fabrikalara yazdığına göre Kızıl Ordu’ya “hava gibi, ekmek gibi” gerekliydi.',
      'The Ilyushin Il-2 Shturmovik was a low-level attack aircraft whose engine, pilot and fuel sat inside a load-bearing armoured shell. At about 36,000 built, it is the most-produced military aircraft in history. As Stalin wrote to its factories, the Red Army needed it “like air, like bread”.',
    ),
    facts: [
      { k: K.first, v: t('30 Aralık 1939 (TsKB-55 prototipi)', '30 December 1939 (TsKB-55 prototype)') },
      { k: K.service, v: t('1941', '1941') },
      { k: K.designer, v: t('Sergey İlyuşin', 'Sergey Ilyushin') },
      { k: K.maker, v: t('Sovyet devlet uçak fabrikaları', 'Soviet state aircraft factories') },
      { k: K.built, v: t('Yaklaşık 36.000 (bütün sürümler)', 'About 36,000 (all variants)') },
      { k: K.engine, v: t('Mikulin AM-38, V12, yaklaşık 1.600 bg', 'Mikulin AM-38, V12, about 1,600 hp') },
      { k: K.speed, v: t('Yaklaşık 420 km/sa, alçakta', 'About 420 km/h, at low level') },
      { k: K.guns, v: t('Kanatlarda 2 × 20 mm ShVAK (sonra 23 mm VYa) ve 2 × 7,62 mm ShKAS; 8 × RS-82 roket ve 400–600 kg bomba', '2 × 20 mm ShVAK (later 23 mm VYa) and 2 × 7.62 mm ShKAS in the wings; 8 × RS-82 rockets and 400–600 kg of bombs') },
      { k: K.crew, v: t('1 (1942’den sonra 2)', '1 (2 from 1942)') },
      { k: K.size, v: t('14,6 m / 11,6 m', '14.6 m / 11.6 m') },
    ],
    sections: [
      {
        h: t('Zırhlı kabuk', 'The armoured shell'),
        p: [
          t(
            'İlyuşin’in fikri, zırhı uçağa sonradan vidalanan plakalar olarak değil, gövdenin kendisi olarak kullanmaktı: motoru, kokpiti ve yakıt deposunu saran çelik kabuk aynı zamanda yapının taşıyıcı parçasıydı. Böylece ağır zırh, uçağı fazla ağırlaştırmadan taşınabildi. Alçaktan uçan Il-2, tüfek ve makineli tüfek ateşine karşı neredeyse dokunulmazdı.',
            'Ilyushin’s idea was to use the armour not as plates bolted on later but as the fuselage itself: the steel shell around the engine, cockpit and fuel tank was also a load-bearing part of the structure. That way heavy armour could be carried without making the aircraft too heavy. Flying low, the Il-2 was almost immune to rifle and machine-gun fire.',
          ),
        ],
      },
      {
        h: t('Arkası açık uçak', 'Open from behind'),
        p: [
          t(
            'Üretime giren ilk Il-2’ler tek kişilikti, arkayı koruyan bir nişancı yoktu. Alman avcıları arkadan ve alttan saldırarak ağır kayıplar verdirdi. Cephedeki birlikler kokpitin arkasına kendi imkânlarıyla nişancı yeri açmaya başladı; 1942’den sonra fabrikalar iki kişilik Il-2 üretti.',
            'The first Il-2s to enter production were single-seaters, with no gunner to cover the rear. German fighters attacking from behind and below inflicted heavy losses. Front-line units began to cut gunner positions behind the cockpit themselves, and from 1942 the factories built two-seat Il-2s.',
          ),
        ],
      },
      {
        h: t('Doğu Cephesi’nin taarruz uçağı', 'The attack aircraft of the Eastern Front'),
        p: [
          t(
            'Il-2 Doğu Cephesi’nin her yerinde, çoğunlukla çok alçaktan, toplar, roketler ve bombalarla tanklara, topçuya, demiryollarına ve birliklere saldırdı. 1941 sonunda üretim aksadığında Stalin, fabrika yöneticilerine gönderdiği telgrafta Il-2’nin Kızıl Ordu’ya “hava gibi, ekmek gibi” gerekli olduğunu yazdı. Savaşın sonuna doğru yerini daha gelişmiş Il-10’a bırakmaya başladı.',
            'The Il-2 attacked tanks, artillery, railways and troops all along the Eastern Front, usually from very low level, with cannon, rockets and bombs. When production faltered at the end of 1941, Stalin wrote in a telegram to the factory directors that the Red Army needed the Il-2 “like air, like bread”. Towards the end of the war it began to give way to the more advanced Il-10.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda taarruz uçağıdır: oyundaki en ağır zırhlardan birini taşır, yerden ateşe ve makinelilere karşı çok dayanıklıdır. Alçaktan top, bomba ve araştırmayla gelen RS-82 roketleriyle saldırır. Tek kişilik olduğu için arkası korumasızdır; düşman avcılarının olduğu yerde refakat ister.',
        'In the game it is a ground-attack aircraft with some of the heaviest armour in the game, very resistant to ground fire and machine guns. It attacks from low level with cannon, bombs and, once researched, RS-82 rockets. As a single-seater its rear is unprotected; where enemy fighters are about it needs an escort.',
      ),
    ],
  },
  {
    id: 'sbd3',
    summary: t(
      '“Slow But Deadly”: Midway’de dört Japon uçak gemisini batıran pike bombardıman uçağı.',
      '“Slow But Deadly”: the dive bomber that sank four Japanese carriers at Midway.',
    ),
    lead: t(
      'Douglas SBD Dauntless, savaşın ilk yıllarında ABD Donanması’nın ana pike bombardıman uçağıydı. Yavaştı ve zamanının ötesinde değildi, ama kararlı ve çok isabetli bir dalışı vardı. Haziran 1942’de Midway Muharebesi’nde dört Japon uçak gemisini batırarak Pasifik Savaşı’nın gidişatını değiştirdi.',
      'The Douglas SBD Dauntless was the US Navy’s main dive bomber in the early years of the war. It was slow and not especially advanced, but its dive was steady and very accurate. At the Battle of Midway in June 1942 it sank four Japanese aircraft carriers and changed the course of the Pacific War.',
    ),
    facts: [
      { k: K.first, v: t('Öncülü Northrop BT-1 1935’te uçtu', 'Its forerunner, the Northrop BT-1, flew in 1935') },
      { k: K.service, v: t('1940; SBD-3 1941', '1940; the SBD-3 in 1941') },
      { k: K.designer, v: t('Ed Heinemann (Douglas, eski Northrop bölümü)', 'Ed Heinemann (Douglas, formerly the Northrop division)') },
      { k: K.maker, v: t('Douglas Aircraft', 'Douglas Aircraft') },
      { k: K.built, v: t('Yaklaşık 5.900 (bütün sürümler)', 'About 5,900 (all variants)') },
      { k: K.engine, v: t('Wright R-1820-52 Cyclone, dokuz silindirli yıldız, 1.000 bg', 'Wright R-1820-52 Cyclone, nine-cylinder radial, 1,000 hp') },
      { k: K.speed, v: t('Yaklaşık 410 km/sa', 'About 410 km/h') },
      { k: K.guns, v: t('Motor kaputunda 2 × 12,7 mm, arkada 1–2 × 7,62 mm; gövde altında 454 kg’a (1.000 lb) kadar bomba', '2 × .50 in above the engine, 1–2 × .30 in in the rear cockpit; up to 1,000 lb (454 kg) of bombs under the fuselage') },
      { k: K.crew, v: t('2 (pilot ve arka nişancı)', '2 (pilot and rear gunner)') },
      { k: K.size, v: t('12,66 m / 10,09 m', '12.66 m / 10.09 m') },
    ],
    sections: [
      {
        h: t('Delikli flaplar', 'The perforated flaps'),
        p: [
          t(
            'Dauntless, Northrop’un BT-1’inden geliştirildi; Northrop’un bu bölümü Douglas’a geçince uçak SBD adını aldı. En tanınan özelliği, kanadın arka kenarında açılan delikli flaplardı: “İsviçre peyniri” denen bu flaplar dalışta uçağı yavaşlatıyor, delikleri de kuyruğu sarsan hava girdabını önlüyordu. Böylece SBD 70 derecelik dalışta kararlı kalıyor ve bombayı çok isabetli bırakabiliyordu.',
            'The Dauntless was developed from Northrop’s BT-1; when that part of Northrop passed to Douglas, the aircraft became the SBD. Its best-known feature was its perforated split flaps: these “Swiss cheese” flaps slowed it in the dive, and the holes prevented the buffeting that would otherwise shake the tail. So the SBD stayed steady in a 70-degree dive and could release its bomb very accurately.',
          ),
        ],
      },
      {
        h: t('Mercan Denizi ve Midway', 'Coral Sea and Midway'),
        p: [
          t(
            'Mayıs 1942’de Mercan Denizi Muharebesi’nde Dauntless’lar Japon uçak gemisi Shoho’yu batırdı. Bir ay sonra Midway’de, Japon uçak gemilerinin güverteleri yakıt ve cephaneyle dolu uçaklarla kalabalıkken yukarıdan dalan SBD’ler Akagi, Kaga, Soryu ve Hiryu’yu vurdu. Dört gemi de battı; Japon donanması bu kaybı hiçbir zaman telafi edemedi.',
            'In May 1942, at the Battle of the Coral Sea, Dauntlesses sank the Japanese carrier Shoho. A month later at Midway, as the Japanese carriers’ decks were crowded with fuelled and armed aircraft, SBDs diving from above hit the Akagi, Kaga, Soryu and Hiryu. All four sank, a loss the Japanese navy never made good.',
          ),
          t(
            'Ekipleri uçağın adının baş harflerini “Slow But Deadly”, yani “yavaş ama ölümcül” diye okurdu. SBD, 1943–44’te yerini SB2C Helldiver’a bıraktı.',
            'Its crews read the letters SBD as “Slow But Deadly”. In 1943–44 it gave way to the SB2C Helldiver.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda pike bombardıman uçağıdır: hava frenleriyle yaklaşık 70 derece dalar ve bombasını yaklaşık 700 m’de bırakır. Stuka’dan daha sağlam ve iyi silahlıdır; motor kaputunda iki 12,7 mm ve arkada çift makineli taşır. Yine de yavaştır ve avcılara karşı refakat ister.',
        'In the game it is a dive bomber: it dives at about 70 degrees with its dive brakes open and releases at about 700 m. It is tougher and better armed than the Stuka, with two .50 in guns above the engine and twin guns in the rear. It is still slow and needs an escort against fighters.',
      ),
    ],
  },
  {
    id: 'p40e',
    summary: t(
      'Sağlam ve dalışta hızlı; Uçan Kaplanlar’dan Kuzey Afrika’ya her cephede.',
      'Rugged and fast in a dive; from the Flying Tigers to North Africa, on every front.',
    ),
    lead: t(
      'Curtiss P-40, savaşın ilk yıllarında ABD’nin en çok bulunan avcısıydı; İngilizler ilk sürümlerine Tomahawk, sonrakilere Kittyhawk, Amerikalılar Warhawk dedi. Yüksek irtifada zayıftı, ama sağlamdı, dalışta hızlıydı ve iyi silahlıydı. Çin’de “Uçan Kaplanlar”la, Kuzey Afrika’da ve Pasifik’te avcı ve avcı-bombardıman olarak savaştı.',
      'The Curtiss P-40 was the most numerous American fighter in the early years of the war; the British called the early versions Tomahawk and the later ones Kittyhawk, and the Americans called it the Warhawk. It was weak at high altitude, but rugged, fast in a dive and well armed. It fought with the “Flying Tigers” in China and as a fighter and fighter-bomber in North Africa and the Pacific.',
    ),
    facts: [
      { k: K.first, v: t('14 Ekim 1938 (XP-40)', '14 October 1938 (XP-40)') },
      { k: K.service, v: t('1940; P-40E 1941', '1940; the P-40E in 1941') },
      { k: K.designer, v: t('Donovan Berlin', 'Donovan Berlin') },
      { k: K.maker, v: t('Curtiss-Wright', 'Curtiss-Wright') },
      { k: K.built, v: t('Yaklaşık 13.700 (bütün sürümler)', 'About 13,700 (all variants)') },
      { k: K.engine, v: t('Allison V-1710-39, V12, tek kademeli kompresör, 1.150 bg', 'Allison V-1710-39, V12 with single-stage supercharger, 1,150 hp') },
      { k: K.speed, v: t('Yaklaşık 580 km/sa, 4.600 m’de', 'About 580 km/h at 4,600 m') },
      { k: K.guns, v: t('Kanatlarda 6 × 12,7 mm M2 Browning; gövde ve kanat altında bomba', '6 × .50 in M2 Browning in the wings; bombs under the fuselage and wings') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('11,38 m / 9,66 m', '11.38 m / 9.66 m') },
    ],
    sections: [
      {
        h: t('P-36’dan P-40’a', 'From the P-36 to the P-40'),
        p: [
          t(
            'P-40, Curtiss’in yıldız motorlu P-36 Hawk’ına sıvı soğutmalı Allison V12 motoru takılarak geliştirildi. Hazır bir gövdeden türediği için çabuk ve bol üretildi; savaşın başında ABD’nin ve müttefiklerinin elindeki en kalabalık modern avcı oydu.',
            'The P-40 was developed by fitting a liquid-cooled Allison V12 to Curtiss’s radial-engined P-36 Hawk. Because it came from an existing airframe it was built quickly and in large numbers; early in the war it was the most numerous modern fighter the United States and its allies had.',
          ),
          t(
            'Allison’un tek kademeli kompresörü yüksek irtifada güç vermiyordu; P-40 bu yüzden en çok alçak ve orta irtifada savaştı. Buna karşılık sağlam yapısı, yüksek hızdaki iyi yuvarlanması ve dalış hızı onu tehlikeli bir rakip yapıyordu.',
            'The Allison’s single-stage supercharger gave little power at high altitude, so the P-40 fought mostly low and at medium altitude. On the other hand its rugged structure, good roll at high speed and diving speed made it a dangerous opponent.',
          ),
        ],
      },
      {
        h: t('Uçan Kaplanlar ve çöl', 'The Flying Tigers and the desert'),
        p: [
          t(
            'Çin’de savaşan Amerikalı gönüllü pilotların Amerikan Gönüllü Grubu, “Uçan Kaplanlar”, burunlarına köpekbalığı ağzı boyadıkları P-40’larla 1941–42’de Japon uçaklarına karşı ün kazandı. Pilotlar, daha çevik Japon avcılarıyla dönüşe girmeden dalıp vurmayı öğrendi.',
            'The American Volunteer Group of American volunteer pilots fighting in China, the “Flying Tigers”, made their name against Japanese aircraft in 1941–42 with P-40s painted with shark mouths on the nose. The pilots learned to dive, strike and leave rather than turn with the more agile Japanese fighters.',
          ),
          t(
            'Kuzey Afrika’da İngiliz Milletler Topluluğu birliklerinin Tomahawk ve Kittyhawk’ları önce avcı, sonra bombalarla kara birliklerini destekleyen avcı-bombardıman olarak yoğun biçimde kullanıldı. Sovyetler Birliği de Ödünç Verme ve Kiralama ile binlerce P-40 aldı.',
            'In North Africa the Tomahawks and Kittyhawks of the British Commonwealth squadrons were used heavily, first as fighters and then as fighter-bombers supporting the ground forces. The Soviet Union also received thousands of P-40s under Lend-Lease.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda sağlam bir enerji avcısıdır: altı 12,7 mm makinelisi güçlüdür, dalışta hızlıdır ve yüksek hızda iyi yuvarlanır. Yüksek irtifada güç kaybeder; dönüş dalaşında çevik avcılara yenilir. Bomba taşıyıp kara hedeflerine de gönderilebilir.',
        'In the game it is a rugged energy fighter: its six .50 in guns are powerful, it is fast in a dive and rolls well at high speed. It loses power high up and loses turning fights to agile fighters. It can also carry bombs against ground targets.',
      ),
    ],
  },
  {
    id: 'pe2',
    summary: t(
      'Avcı kadar hızlı pike bombardıman: Kızıl Ordu’nun en çok üretilen bombardıman uçağı.',
      'A dive bomber as fast as a fighter, and the Red Army’s most-produced bomber.',
    ),
    lead: t(
      'Petlyakov Pe-2, çift motorlu, hızlı bir pike bombardıman uçağıdır. Aslında yüksek irtifa avcısı olarak tasarlanmıştı; savaşın hemen öncesinde pike bombardımanına çevrildi. Yaklaşık 11.400 adetle savaşın en çok üretilen Sovyet bombardıman uçağıdır; pilotlar ona “Peşka” (piyon) derdi.',
      'The Petlyakov Pe-2 was a fast twin-engined dive bomber. It had originally been designed as a high-altitude fighter and was turned into a dive bomber just before the war. At about 11,400 built, it was the most-produced Soviet bomber of the war; crews called it the “Peshka” (pawn).',
    ),
    facts: [
      { k: K.first, v: t('Aralık 1939 (VI-100 prototipi)', 'December 1939 (VI-100 prototype)') },
      { k: K.service, v: t('1941', '1941') },
      { k: K.designer, v: t('Vladimir Petlyakov', 'Vladimir Petlyakov') },
      { k: K.maker, v: t('Sovyet devlet uçak fabrikaları', 'Soviet state aircraft factories') },
      { k: K.built, v: t('Yaklaşık 11.400 (bütün sürümler)', 'About 11,400 (all variants)') },
      { k: K.engine, v: t('2 × Klimov M-105R, V12, her biri yaklaşık 1.100 bg', '2 × Klimov M-105R, V12, about 1,100 hp each') },
      { k: K.speed, v: t('Yaklaşık 540 km/sa, 5.000 m’de', 'About 540 km/h at 5,000 m') },
      { k: K.guns, v: t('Burunda ve sırtta 7,62 mm ShKAS ve 12,7 mm UB makineliler; 600 kg (en fazla 1.000 kg) bomba', '7.62 mm ShKAS and 12.7 mm UB guns in the nose and dorsal position; 600 kg (up to 1,000 kg) of bombs') },
      { k: K.crew, v: t('3', '3') },
      { k: K.size, v: t('17,16 m / 12,66 m', '17.16 m / 12.66 m') },
    ],
    sections: [
      {
        h: t('Hapishanede tasarlanan uçak', 'An aircraft designed in prison'),
        p: [
          t(
            'Vladimir Petlyakov, Stalin döneminin baskılarında tutuklanmış ve tutuklu mühendislerin çalıştırıldığı kapalı bir tasarım bürosuna gönderilmişti. Orada basınçlı kabinli, çift motorlu bir yüksek irtifa avcısı olan VI-100’ü tasarladı. 1940’ta Sovyet hava kuvvetleri hızlı bir pike bombardıman uçağına daha çok ihtiyaç duyunca tasarım birkaç haftada pike bombardıman uçağına çevrildi: Pe-2 böyle doğdu.',
            'Vladimir Petlyakov had been arrested in the purges of the Stalin era and sent to a closed design bureau where imprisoned engineers were put to work. There he designed the VI-100, a twin-engined high-altitude fighter with a pressurised cabin. In 1940, when the Soviet air force needed a fast dive bomber more, the design was turned into one in a few weeks: that is how the Pe-2 was born.',
          ),
          t(
            'Petlyakov serbest bırakıldı, ama uçağının başarısını uzun süre göremedi: Ocak 1942’de bir Pe-2 kazasında öldü.',
            'Petlyakov was released, but did not see his aircraft’s success for long: he died in a Pe-2 crash in January 1942.',
          ),
        ],
      },
      {
        h: t('Doğu Cephesi’nde', 'On the Eastern Front'),
        p: [
          t(
            'Pe-2 hızlıydı ve kanat altındaki hava frenleriyle dik dalış yapabiliyordu; alçak irtifada birçok avcı kadar hızlıydı. Savunma silahları ise zayıftı ve uçağı uçurmak, özellikle iniş ve kalkışta, deneyim istiyordu. Pike bombardımanının yanında düz bombardımanda, keşifte ve ağır avcı olarak da kullanıldı.',
            'The Pe-2 was fast and could dive steeply with the dive brakes under its wings; at low altitude it was as fast as many fighters. Its defensive armament was weak, though, and the aircraft took experience to fly, especially on take-off and landing. Besides dive bombing it was used for level bombing, reconnaissance and as a heavy fighter.',
          ),
          t(
            'Kadın pilot Marina Raskova’nın kurduğu, mürettebatı kadınlardan oluşan 587. Bombardıman Alayı da Pe-2 uçurdu.',
            'The 587th Bomber Regiment, formed by the woman pilot Marina Raskova and crewed by women, also flew the Pe-2.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda pike bombardıman uçağıdır: hava frenleriyle yaklaşık 70 derece dalar ve bombasını yaklaşık 800 m’de bırakır. Tek motorlu pike bombardıman uçaklarından çok daha hızlıdır, ama savunması zayıftır.',
        'In the game it is a dive bomber: it dives at about 70 degrees with its dive brakes open and releases at about 800 m. It is much faster than the single-engined dive bombers, but its defence is weak.',
      ),
    ],
  },
];
