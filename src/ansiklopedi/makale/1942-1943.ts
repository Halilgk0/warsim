// Ansiklopedi makaleleri, 1942–1943 uçakları (katalog yılına göre).

import { K, t, type Article } from '../tur';

export const A1942_1943: Article[] = [
  {
    id: 'spitfire9',
    summary: t(
      'İki kademeli Merlin’le Fw 190’a yetişen Spitfire: yine geçici diye yapıldı, kalıcı oldu.',
      'The Spitfire that caught up with the Fw 190 thanks to a two-stage Merlin: another stopgap that stayed.',
    ),
    lead: t(
      'Spitfire Mk IX, Fw 190’ın 1941–42’deki üstünlüğüne bir yanıt olarak Mk V gövdesine iki kademeli kompresörlü Merlin 61 motoru takılarak yapıldı. Yine geçici bir çözüm olarak düşünülmüştü, ama savaşın en iyi Müttefik avcılarından biri oldu ve yaklaşık 5.600 adet üretildi.',
      'The Spitfire Mk IX was built as an answer to the Fw 190’s superiority of 1941–42 by fitting the two-stage supercharged Merlin 61 into the Mk V airframe. It too was meant as a stopgap, but it became one of the best Allied fighters of the war, and about 5,600 were built.',
    ),
    facts: [
      { k: K.service, v: t('Temmuz 1942', 'July 1942') },
      { k: K.designer, v: t('Joseph Smith’in Supermarine ekibi', 'Joseph Smith’s Supermarine team') },
      { k: K.maker, v: t('Supermarine; en çok Castle Bromwich', 'Supermarine; most at Castle Bromwich') },
      { k: K.built, v: t('Yaklaşık 5.600 Mk IX', 'About 5,600 Mk IXs') },
      { k: K.engine, v: t('Rolls-Royce Merlin 61, 63 ya da 66, iki kademeli kompresör; Merlin 66 yaklaşık 1.700 bg', 'Rolls-Royce Merlin 61, 63 or 66 with two-stage supercharger; the Merlin 66 about 1,700 hp') },
      { k: K.speed, v: t('Yaklaşık 650 km/sa, 6.400 m’de', 'About 650 km/h at 6,400 m') },
      { k: K.guns, v: t('2 × 20 mm Hispano ile 4 × 7,7 mm ya da (1944’ten) 2 × 12,7 mm', '2 × 20 mm Hispano with 4 × .303 in or (from 1944) 2 × .50 in') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('11,23 m / 9,47 m', '11.23 m / 9.47 m') },
    ],
    sections: [
      {
        h: t('İki kademeli kompresör', 'The two-stage supercharger'),
        p: [
          t(
            'Kompresör, motora sıkıştırılmış hava vererek irtifada gücü korur. Merlin 61’de iki kompresör art arda çalışıyor ve aradaki soğutucu havayı soğutuyordu; böylece motor yüksek irtifada çok daha fazla güç verdi. Gövde neredeyse Mk V’inkiyle aynıydı; dışarıdan en belirgin farklar dört palalı pervane ve kanatların altındaki iki eşit radyatördü.',
            'A supercharger keeps up a piston engine’s power at altitude by feeding it compressed air. In the Merlin 61 two superchargers worked in series, with an intercooler cooling the air in between, so the engine gave far more power high up. The airframe was almost the same as the Mk V’s; from outside, the clearest differences were the four-bladed propeller and the two equal radiators under the wings.',
          ),
        ],
      },
      {
        h: t('Fw 190’a yanıt', 'The answer to the Fw 190'),
        p: [
          t(
            'Mk IX 1942 yazında hizmete girdiğinde Fw 190 A ile her irtifada boy ölçüşebiliyordu; dönüşte hâlâ üstündü. Dışarıdan Mk V’e çok benzediği için Alman pilotlar karşılarındaki Spitfire’ın hangisi olduğunu çoğu zaman anlayamadı. Alçak, orta ve yüksek irtifa için ayrı ayarlı motorlarla LF, F ve HF sürümleri yapıldı.',
            'When the Mk IX entered service in the summer of 1942 it could match the Fw 190 A at every altitude and still out-turned it. Because it looked so like the Mk V, German pilots often could not tell which Spitfire they faced. Versions with engines tuned for low, medium and high altitude were built as the LF, F and HF.',
          ),
          t(
            'Mk IX Avrupa’da savaşın sonuna kadar RAF’ın ana avcılarından biri kaldı. Savaştan sonra birçok ülkenin hava kuvvetlerinde uçtu; Türk Hava Kuvvetleri de Mk IX kullananlar arasındaydı.',
            'The Mk IX remained one of the RAF’s main fighters in Europe until the end of the war. After the war it flew with many air forces; the Turkish Air Force was among its users.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda iki kademeli kompresörü sayesinde yüksekte de güçlü bir dönüş avcısıdır: Fw 190 ile her irtifada boy ölçüşür ve dönüşte ondan iyidir. Kısa süreli acil güç kullanabilir. İki 20 mm topu ve iki 12,7 mm makinelisi vardır.',
        'In the game its two-stage supercharger keeps it strong high up: it matches the Fw 190 at every altitude and out-turns it. It has a short burst of emergency power. It carries two 20 mm cannon and two .50 in machine guns.',
      ),
    ],
  },
  {
    id: 'lancaster',
    summary: t(
      'Dört Merlinli gece bombardıman uçağı: dev bomba bölmesi, “Barajları Yıkanlar” ve Tirpitz.',
      'The four-Merlin night bomber: a huge bomb bay, the “Dambusters” and the Tirpitz.',
    ),
    lead: t(
      'Avro Lancaster, RAF Bombardıman Komutanlığı’nın Almanya’ya karşı gece bombardımanının ana uçağıdır. Bölmesiz, upuzun bomba bölmesi çağının en büyük yüklerini taşımasını sağladı: barajları yıkan zıplayan bomba da, Tirpitz’i batıran 5 tonluk Tallboy da Lancaster’larla atıldı.',
      'The Avro Lancaster was the main aircraft of RAF Bomber Command’s night offensive against Germany. Its long, unobstructed bomb bay let it carry the heaviest loads of its day: both the bouncing bomb that breached the dams and the 5-tonne Tallboy that sank the Tirpitz were dropped by Lancasters.',
    ),
    facts: [
      { k: K.first, v: t('9 Ocak 1941 (prototip BT308)', '9 January 1941 (prototype BT308)') },
      { k: K.service, v: t('1942 başı', 'Early 1942') },
      { k: K.designer, v: t('Roy Chadwick', 'Roy Chadwick') },
      { k: K.maker, v: t('Avro; Metropolitan-Vickers, Armstrong Whitworth, Vickers ve Kanada’da Victory Aircraft', 'Avro; Metropolitan-Vickers, Armstrong Whitworth, Vickers and, in Canada, Victory Aircraft') },
      { k: K.built, v: t('Yaklaşık 7.400', 'About 7,400') },
      { k: K.engine, v: t('4 × Rolls-Royce Merlin XX ya da 22/24, V12, her biri yaklaşık 1.300–1.600 bg', '4 × Rolls-Royce Merlin XX or 22/24, V12, about 1,300–1,600 hp each') },
      { k: K.speed, v: t('Yaklaşık 450 km/sa, 5.600 m’de', 'About 450 km/h at 5,600 m') },
      { k: K.guns, v: t('Burun, sırt ve kuyruk taretlerinde 8–10 × 7,7 mm Browning; normalde 6.350 kg’a (14.000 lb) kadar bomba', '8–10 × .303 in Browning in nose, dorsal and tail turrets; normally up to 14,000 lb (6,350 kg) of bombs') },
      { k: K.crew, v: t('7', '7') },
      { k: K.size, v: t('31,09 m / 21,11 m', '31.09 m / 21.11 m') },
    ],
    sections: [
      {
        h: t('Başarısız bir uçaktan', 'From a failure'),
        p: [
          t(
            'Lancaster, Avro’nun iki motorlu Manchester bombardıman uçağından doğdu. Manchester’ın Rolls-Royce Vulture motorları güvenilmezdi ve uçak başarısız oldu. Roy Chadwick ekibi kanadı uzatıp iki motor yerine dört Merlin taktı; ortaya çıkan uçak beklenenin çok üstünde başarılıydı.',
            'The Lancaster grew out of Avro’s twin-engined Manchester bomber. The Manchester’s Rolls-Royce Vulture engines were unreliable and the aircraft was a failure. Roy Chadwick’s team lengthened the wing and fitted four Merlins in place of the two engines; the result was far more successful than anyone expected.',
          ),
        ],
      },
      {
        h: t('Gece bombardımanı', 'The night offensive'),
        p: [
          t(
            'Lancaster’lar 1942’den savaşın sonuna kadar Alman şehirlerine ve sanayisine gece akınları yaptı. Bedeli ağırdı: Bombardıman Komutanlığı savaş boyunca 55.000’i aşkın uçucusunu kaybetti. Uçağın altında taret yoktu ve aşağıdan, yukarı doğru ateş eden toplarla gelen Alman gece avcılarına karşı korumasızdı.',
            'From 1942 to the end of the war Lancasters raided German cities and industry by night. The price was heavy: Bomber Command lost more than 55,000 aircrew during the war. The aircraft had no ventral turret and was defenceless against German night fighters that attacked from below with upward-firing guns.',
          ),
        ],
      },
      {
        h: t('Barajlar ve Tirpitz', 'The dams and the Tirpitz'),
        p: [
          t(
            'Mayıs 1943’te 617. Filo’nun özel donatılmış Lancaster’ları, Barnes Wallis’in suyun üstünde seken “zıplayan bomba”sıyla Ruhr’daki Möhne ve Eder barajlarını yıktı; filo bu akından sonra “Dambusters” (Barajları Yıkanlar) diye anıldı. Kasım 1944’te Lancaster’lar Alman zırhlısı Tirpitz’i 5 tonluk Tallboy bombalarıyla batırdı; bazıları 10 tonluk Grand Slam’i taşıyacak biçimde değiştirildi.',
            'In May 1943 the specially modified Lancasters of No. 617 Squadron breached the Möhne and Eder dams in the Ruhr with Barnes Wallis’s “bouncing bomb”, which skipped across the water; after the raid the squadron was known as the “Dambusters”. In November 1944 Lancasters sank the German battleship Tirpitz with 5-tonne Tallboy bombs, and some were modified to carry the 10-tonne Grand Slam.',
          ),
          t(
            'Savaşın son günlerinde Lancaster’lar bomba yerine yiyecek taşıdı: Nisan–Mayıs 1945’te açlık çeken Hollanda halkına havadan erzak atıldı.',
            'In the last days of the war Lancasters carried food instead of bombs: in April and May 1945 they dropped supplies to the starving people of the Netherlands.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ağır bombardıman uçağıdır ve en büyük bomba yükünü taşır: 14 × 1000 lb, 14 × 500 lb ya da alan bombardımanı için 14 × 250 lb. Savunması burun, sırt ve kuyruk taretlerindeki 7,7 mm makinelilerdir; altı korumasızdır. Yavaş ve hantaldır, refakat ya da gece ister.',
        'In the game it is a heavy bomber with the largest bomb load: 14 × 1,000 lb, 14 × 500 lb or, for area bombing, 14 × 250 lb. Its defence is .303 in guns in the nose, dorsal and tail turrets; its underside is unprotected. It is slow and ponderous and needs an escort or the night.',
      ),
    ],
  },
  {
    id: 'bf109g',
    summary: t(
      '“Gustav”: daha güçlü, daha ağır; en çok üretilen 109 sürümü.',
      'The “Gustav”: more powerful, heavier, and the most-produced 109 version.',
    ),
    lead: t(
      'Bf 109 G, pilotların “Gustav” dediği sürüm, daha büyük DB 605 motoru ve giderek ağırlaşan silahlarıyla 1942’den savaşın sonuna kadar Alman avcı gücünün çoğunu oluşturdu. G-6 en çok üretilen Bf 109 sürümüdür. Gücü arttı, ama her yeni yük uçağı biraz daha ağır uçar yaptı.',
      'The Bf 109 G, the version pilots called the “Gustav”, with the larger DB 605 engine and ever-heavier armament, made up most of the German fighter force from 1942 to the end of the war. The G-6 was the most-produced Bf 109 version. Its power grew, but each new load made it a little heavier to fly.',
    ),
    facts: [
      { k: K.service, v: t('1942; G-6 1943', '1942; the G-6 in 1943') },
      { k: K.maker, v: t('Messerschmitt AG ve lisanslı fabrikalar', 'Messerschmitt AG and licensed factories') },
      { k: K.built, v: t('Bf 109 ailesi yaklaşık 34.000; bunun büyük kısmı G sürümü', 'Bf 109 family about 34,000, most of them G versions') },
      { k: K.engine, v: t('Daimler-Benz DB 605A, ters V12, yaklaşık 1.475 PS; bazılarında MW 50 su-metanol takviyesi', 'Daimler-Benz DB 605A, inverted V12, about 1,475 PS; MW 50 water-methanol boost on some') },
      { k: K.speed, v: t('Yaklaşık 630 km/sa, 6.600 m’de', 'About 630 km/h at 6,600 m') },
      { k: K.guns, v: t('Pervane göbeğinden 1 × 20 mm MG 151/20 (ya da 30 mm MK 108), motor kaputunda 2 × 13 mm MG 131; isteğe bağlı kanat altı 2 × 20 mm gondol', '1 × 20 mm MG 151/20 (or 30 mm MK 108) through the hub, 2 × 13 mm MG 131 above the engine; optional 2 × 20 mm underwing gondolas') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('9,92 m / 9,02 m', '9.92 m / 9.02 m') },
    ],
    sections: [
      {
        h: t('Daha fazla güç, daha fazla ağırlık', 'More power, more weight'),
        p: [
          t(
            'G sürümünde daha büyük DB 605 motoru geldi. G-6’da motor kaputundaki makineliler 13 mm MG 131’lere büyütüldü; bunların mekanizması kaputa sığmadığı için iki yanda çıkıntılar oluştu ve uçak Almanlar arasında “Beule” (şişlik) diye anıldı. Bombardıman uçaklarına karşı kanat altına iki 20 mm top gondolu ya da pervane göbeğine 30 mm MK 108 topu takılabiliyordu.',
            'The G brought the larger DB 605 engine. On the G-6 the cowling guns were enlarged to 13 mm MG 131s; their breeches did not fit under the cowling, so bulges appeared on either side and the type was nicknamed the “Beule” (bump). Against bombers it could carry two 20 mm cannon gondolas under the wings or a 30 mm MK 108 in the propeller hub.',
          ),
          t(
            'Her ek, Bf 109’u biraz daha ağırlaştırdı ve yüksek hızdaki ağır kumandaları daha da belirgin oldu. Gondollu Gustav’lar bombardıman uçaklarına karşı güçlüydü ama avcılara karşı hantallaşıyordu.',
            'Each addition made the Bf 109 a little heavier, and its heavy controls at high speed became more noticeable still. Gondola-armed Gustavs were strong against bombers but sluggish against fighters.',
          ),
        ],
      },
      {
        h: t('Her cephede', 'On every front'),
        p: [
          t(
            'Bf 109 G, Doğu Cephesi’nde, Akdeniz’de ve Almanya’yı Amerikan gündüz bombardımanına karşı savunmada savaştı. Tarihin en çok düşürme kaydeden pilotu Erich Hartmann, düşürmelerinin çoğunu Bf 109 G ile yaptı. Finlandiya, Macaristan, Romanya, Bulgaristan ve İsviçre de Gustav kullandı; Finlandiya’daki 109’lar 1950’lerin ortasına kadar uçtu.',
            'The Bf 109 G fought on the Eastern Front, in the Mediterranean and in the defence of Germany against American daylight bombing. Erich Hartmann, the highest-scoring fighter pilot in history, made most of his claims in the Bf 109 G. Finland, Hungary, Romania, Bulgaria and Switzerland also flew the Gustav; Finland’s 109s flew until the mid-1950s.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji avcısıdır: hızlıdır, iyi tırmanır ve MW 50 ile kısa süreli acil güç kullanır. Bombardıman uçaklarına karşı kanat altı 20 mm gondolları ya da araştırmayla gelen 30 mm burun topu takılabilir; bunlar onu ağırlaştırır. Yüksek hızda kumandası ağırlaşır.',
        'In the game it is an energy fighter: fast, a strong climber, with a short burst of MW 50 emergency power. Against bombers it can carry the 20 mm underwing gondolas or, once researched, the 30 mm hub cannon, which make it heavier. Its controls stiffen at high speed.',
      ),
    ],
  },
  {
    id: 'fw190a5',
    summary: t(
      '“Würger”: yıldız motorlu, sağlam, çok çabuk yuvarlanan ve ağır silahlı Alman avcısı.',
      'The “Würger”: a radial-engined, rugged, fast-rolling and heavily armed German fighter.',
    ),
    lead: t(
      'Focke-Wulf Fw 190, 1941 sonbaharında Manş üzerinde ortaya çıktığında RAF’ın elindeki her avcıdan üstündü. Kurt Tank’ın tasarladığı uçak, Almanların sıvı soğutmalı motorlara yöneldiği bir dönemde yıldız motorla yapıldı; geniş iniş takımı, çok iyi yuvarlanması ve dört topuyla bir yıl kadar Batı’da gökyüzüne hâkim oldu.',
      'When the Focke-Wulf Fw 190 appeared over the Channel in the autumn of 1941, it outclassed every fighter the RAF had. Designed by Kurt Tank at a time when German fighters favoured liquid-cooled engines, it used a radial; with its wide undercarriage, superb roll and four cannon, it dominated the western skies for about a year.',
    ),
    facts: [
      { k: K.first, v: t('1 Haziran 1939 (prototip Fw 190 V1)', '1 June 1939 (prototype Fw 190 V1)') },
      { k: K.service, v: t('Ağustos 1941; A-5 1943', 'August 1941; the A-5 in 1943') },
      { k: K.designer, v: t('Kurt Tank', 'Kurt Tank') },
      { k: K.maker, v: t('Focke-Wulf; lisansla Arado, AGO, Fieseler ve başka fabrikalar', 'Focke-Wulf; under licence by Arado, AGO, Fieseler and others') },
      { k: K.built, v: t('20.000’i aşkın (bütün sürümler)', 'More than 20,000 (all variants)') },
      { k: K.engine, v: t('BMW 801D-2, 14 silindirli çift sıralı yıldız, yaklaşık 1.700 PS', 'BMW 801D-2, 14-cylinder twin-row radial, about 1,700 PS') },
      { k: K.speed, v: t('Yaklaşık 650 km/sa, 6.300 m’de', 'About 650 km/h at 6,300 m') },
      { k: K.guns, v: t('Kanat köklerinde 2 × 20 mm MG 151/20, kanatlarda 2 × 20 mm MG FF/M, motor kaputunda 2 × 7,92 mm MG 17', '2 × 20 mm MG 151/20 in the wing roots, 2 × 20 mm MG FF/M in the wings, 2 × 7.92 mm MG 17 above the engine') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('10,51 m / 8,95 m', '10.51 m / 8.95 m') },
    ],
    sections: [
      {
        h: t('Bir süvari atı', 'A cavalry horse'),
        p: [
          t(
            'Kurt Tank, Bf 109 gibi narin bir “yarış atı” değil, cephe koşullarında dayanıklı bir “süvari atı” istiyordu. Fw 190’ın geniş açıklıklı iniş takımı kanatlara bağlıydı ve bozuk pistlerde de güvenliydi. Yıldız motoru sağlamdı ve isabet alınca bile çalışmayı sürdürebiliyordu; motoru, pervaneyi ve karışımı tek kolla ayarlayan “Kommandogerät” düzeneği pilotun yükünü hafifletiyordu. Kabarcığa yakın kanopisi iyi görüş veriyordu.',
            'Kurt Tank wanted not a delicate “racehorse” like the Bf 109 but a “cavalry horse”, tough under front-line conditions. The Fw 190’s wide-track undercarriage was attached to the wings and safe on rough airfields. Its radial engine was robust and could keep running after being hit, and the “Kommandogerät”, which set throttle, propeller and mixture from a single lever, eased the pilot’s workload. Its near-bubble canopy gave a good view.',
          ),
        ],
      },
      {
        h: t('“Fw 190 bunalımı”', 'The “Fw 190 crisis”'),
        p: [
          t(
            'Fw 190 A, Spitfire Mk V’ten hızlıydı, daha iyi tırmanıyor ve çok daha çabuk yuvarlanıyordu. RAF bu üstünlüğü yaklaşık bir yıl çekti. Haziran 1942’de bir Alman pilot yolunu şaşırıp Galler’deki bir RAF üssüne inince İngilizler sağlam bir Fw 190’ı inceleme fırsatı buldu; yanıtları Spitfire Mk IX oldu.',
            'The Fw 190 A was faster than the Spitfire Mk V, climbed better and rolled much faster. The RAF suffered under this for about a year. In June 1942 a lost German pilot landed at an RAF airfield in Wales, giving the British an intact Fw 190 to study; their answer was the Spitfire Mk IX.',
          ),
        ],
      },
      {
        h: t('Zayıf yanı: yükseklik', 'Its weakness: altitude'),
        p: [
          t(
            'BMW 801’in kompresörü 6–7 km’nin üstünde yetersiz kalıyordu; Fw 190 A yüksekte hem Spitfire IX’a hem de Amerikan avcılarına göre zayıftı. Bu yüzden alçak ve orta irtifada, kara desteğinde ve ağır silahlarıyla bombardıman uçaklarına karşı kullanıldı. Sonraki uzun burunlu Fw 190 D, sıvı soğutmalı Jumo 213 motoruyla bu sorunu büyük ölçüde çözdü.',
            'The BMW 801’s supercharger fell short above 6–7 km, so high up the Fw 190 A was weaker than both the Spitfire IX and the American fighters. It was therefore used at low and medium altitude, in ground support and, with its heavy guns, against bombers. The later long-nosed Fw 190 D largely solved the problem with the liquid-cooled Jumo 213 engine.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji avcısıdır ve pervaneli uçakların en çabuk yuvarlananıdır. Dört 20 mm topuyla çok ağır ateş eder, sağlamdır ve bombardıman uçaklarına karşı etkilidir. Yüksek irtifada gücü düşer. Sabit hızda dönüş dalaşında Spitfire’a yenilir; yuvarlanma ve dal-vur ile kazanır.',
        'In the game it is an energy fighter and the fastest-rolling of the piston aircraft. Its four 20 mm cannon give it very heavy firepower, it is rugged and it is effective against bombers. It loses power at high altitude. In a sustained turning fight the Spitfire beats it; it wins with its roll and with dive-and-zoom attacks.',
      ),
    ],
  },
  {
    id: 'il2m3',
    summary: t(
      'Arkasına nişancı konan, ok açılı kanatlı ve 23 mm toplu iki kişilik Il-2.',
      'The two-seat Il-2, with a rear gunner, swept outer wings and 23 mm cannon.',
    ),
    lead: t(
      'Tek kişilik Il-2’ler Alman avcılarına karşı ağır kayıplar verince, kokpitin arkasına 12,7 mm makineli bir nişancı yeri eklendi. Ağırlık merkezi geriye kaydığı için dış kanatlara ok açısı verildi; daha güçlü AM-38F motoru ve 23 mm toplarla bu sürüm, batıda Il-2M3 diye bilinen iki kişilik Il-2 oldu. Il-2’nin büyük çoğunluğu bu biçimde üretildi.',
      'When single-seat Il-2s suffered heavy losses to German fighters, a gunner’s position with a 12.7 mm machine gun was added behind the cockpit. Because the centre of gravity moved back, the outer wings were given sweep; with the more powerful AM-38F engine and 23 mm cannon, this became the two-seat Il-2 known in the West as the Il-2M3. Most Il-2s were built in this form.',
    ),
    facts: [
      { k: K.service, v: t('1942–43', '1942–43') },
      { k: K.designer, v: t('Sergey İlyuşin', 'Sergey Ilyushin') },
      { k: K.built, v: t('Il-2 ailesi yaklaşık 36.000; çoğu iki kişilik', 'Il-2 family about 36,000, most of them two-seaters') },
      { k: K.engine, v: t('Mikulin AM-38F, V12, yaklaşık 1.700 bg', 'Mikulin AM-38F, V12, about 1,700 hp') },
      { k: K.speed, v: t('Yaklaşık 410 km/sa, alçakta', 'About 410 km/h, at low level') },
      { k: K.guns, v: t('Kanatlarda 2 × 23 mm VYa ve 2 × 7,62 mm ShKAS, arkada 1 × 12,7 mm UBT; roket ve 400–600 kg bomba', '2 × 23 mm VYa and 2 × 7.62 mm ShKAS in the wings, 1 × 12.7 mm UBT in the rear; rockets and 400–600 kg of bombs') },
      { k: K.crew, v: t('2 (pilot ve arka nişancı)', '2 (pilot and rear gunner)') },
      { k: K.size, v: t('14,6 m / 11,6 m', '14.6 m / 11.6 m') },
    ],
    sections: [
      {
        h: t('Nişancının bedeli', 'The price of a gunner'),
        p: [
          t(
            'Arka nişancı Alman avcılarına karşı Il-2’yi çok daha zor bir hedef yaptı; arkadan rahatça yaklaşmak artık mümkün değildi. Nişancının yeri ise pilotunki kadar zırhlı değildi ve nişancı kayıpları pilotlarınkinden çok daha yüksekti.',
            'The rear gunner made the Il-2 a much harder target for German fighters, which could no longer close in from behind at leisure. The gunner’s position, however, was not as well armoured as the pilot’s, and gunners were lost at a much higher rate than pilots.',
          ),
        ],
      },
      {
        h: t('Kursk ve sonrası', 'Kursk and after'),
        p: [
          t(
            'Temmuz 1943’teki Kursk Muharebesi’nde Il-2’ler ilk kez yüzlerce küçük tanksavar bombacığını (PTAB) birden atarak Alman zırhlı birliklerine ağır kayıp verdirdi. İki kişilik Il-2 savaşın sonuna kadar Kızıl Ordu’nun ana taarruz uçağı olarak kaldı ve yavaş yavaş Il-10’la değiştirildi.',
            'At the Battle of Kursk in July 1943, Il-2s for the first time dropped hundreds of small anti-tank bomblets (PTAB) at once, inflicting heavy losses on German armoured units. The two-seat Il-2 remained the Red Army’s main attack aircraft until the end of the war and was gradually replaced by the Il-10.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda taarruz uçağıdır. Ağır zırhı korunur; arkasındaki 12,7 mm’lik nişancı arkadan gelen avcılara karşı onu korur. 23 mm topları zırhlı hedeflere daha etkilidir. Roketler araştırmayla gelir.',
        'In the game it is a ground-attack aircraft. It keeps the heavy armour, and its 12.7 mm rear gunner protects it against fighters coming from behind. Its 23 mm cannon are more effective against armoured targets. Rockets come with research.',
      ),
    ],
  },
  {
    id: 'typhoon',
    summary: t(
      'Avcı olarak hayal kırıklığı, taarruz uçağı olarak efsane: roketli “Tiffy”.',
      'A disappointment as a fighter, a legend as a ground-attack aircraft: the rocket-firing “Tiffy”.',
    ),
    lead: t(
      'Hawker Typhoon, Hurricane’in yerini alacak bir önleme avcısı olarak tasarlandı, ama yüksek irtifada hayal kırıklığı yarattı. Alçakta ise çok hızlıydı; dört 20 mm topu ve sekiz roketiyle savaşın en etkili taarruz uçaklarından biri oldu. 1944’te Normandiya’da Alman zırhlı birliklerinin korkulu rüyasıydı.',
      'The Hawker Typhoon was designed as an interceptor to replace the Hurricane, but it disappointed at high altitude. Down low, though, it was very fast, and with its four 20 mm cannon and eight rockets it became one of the most effective ground-attack aircraft of the war. In Normandy in 1944 it was the terror of German armoured units.',
    ),
    facts: [
      { k: K.first, v: t('24 Şubat 1940', '24 February 1940') },
      { k: K.service, v: t('Eylül 1941', 'September 1941') },
      { k: K.designer, v: t('Sydney Camm', 'Sydney Camm') },
      { k: K.maker, v: t('Hawker; en çok Gloster', 'Hawker; most built by Gloster') },
      { k: K.built, v: t('Yaklaşık 3.300', 'About 3,300') },
      { k: K.engine, v: t('Napier Sabre, 24 silindirli H tipi, yaklaşık 2.200 bg', 'Napier Sabre, 24-cylinder H-type, about 2,200 hp') },
      { k: K.speed, v: t('Yaklaşık 660 km/sa', 'About 660 km/h') },
      { k: K.guns, v: t('Kanatlarda 4 × 20 mm Hispano; 8 × RP-3 roket ya da 2 × 1.000 lb bomba', '4 × 20 mm Hispano in the wings; 8 × RP-3 rockets or 2 × 1,000 lb bombs') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('12,67 m / 9,73 m', '12.67 m / 9.73 m') },
    ],
    sections: [
      {
        h: t('Zor bir başlangıç', 'A troubled start'),
        p: [
          t(
            'Typhoon, dönemin en güçlü motorlarından biri olan 24 silindirli Napier Sabre için tasarlandı. İlk yılları sorunlarla geçti: motor güvenilmezdi, kokpite egzoz gazı sızıyordu ve kuyruğun uçuşta koptuğu ölümcül kazalar oldu. Kalın kanadı yüksek irtifada ve çok hızlı dalışta sorun çıkarıyordu.',
            'The Typhoon was designed around the 24-cylinder Napier Sabre, one of the most powerful engines of its time. Its early years were troubled: the engine was unreliable, exhaust fumes leaked into the cockpit, and there were fatal accidents in which the tail broke off in flight. Its thick wing caused problems at high altitude and in very fast dives.',
          ),
          t(
            'Alçak irtifada ise Typhoon RAF’ın en hızlı uçaklarından biriydi. İlk büyük işi, güney İngiltere kıyılarına alçaktan vurup kaçan Fw 190 avcı-bombardımanlarını yakalamak oldu.',
            'At low altitude, though, the Typhoon was one of the RAF’s fastest aircraft. Its first big job was catching the Fw 190 fighter-bombers that made low-level hit-and-run raids on the south coast of England.',
          ),
        ],
      },
      {
        h: t('Roketli Typhoon’lar', 'Rocket Typhoons'),
        p: [
          t(
            '1943’ten itibaren Typhoon’lar kanat altında sekiz RP-3 roketi taşıdı. 1944’te Normandiya çıkarmasından sonra “kabin sırası” denen düzenle havada bekleyen Typhoon’lar, kara birliklerinin çağrısıyla dakikalar içinde Alman tanklarına, kamyonlarına ve toplarına saldırdı. Ağustos 1944’te Falaise cebinde geri çekilen Alman kollarına ağır kayıplar verdirdiler.',
            'From 1943 Typhoons carried eight RP-3 rockets under their wings. After the Normandy landings in 1944, Typhoons waiting in the air in the so-called “cab rank” could attack German tanks, lorries and guns within minutes of a call from the ground troops. In August 1944 they inflicted heavy losses on German columns retreating from the Falaise pocket.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda taarruz hattındadır ve enerji taktiğiyle savaşır: alçakta çok hızlıdır, dört 20 mm topu güçlüdür; araştırmayla gelen sekiz RP-3 roketiyle kara hedeflerine çok öldürücüdür. Kalın kanadı yüksek hızda sıkışmaya erken girer.',
        'In the game it sits in the attack line and fights with energy tactics: it is very fast down low and its four 20 mm cannon are powerful; with the eight RP-3 rockets that come with research it is deadly against ground targets. Its thick wing runs into compressibility early at high speed.',
      ),
    ],
  },
  {
    id: 'ju87d',
    summary: t(
      'Daha güçlü, daha zırhlı Stuka: Doğu Cephesi’nin kara destek uçağı.',
      'The more powerful, better armoured Stuka: the ground-support workhorse of the Eastern Front.',
    ),
    lead: t(
      'Ju 87 D, Stuka’nın daha güçlü Jumo 211J motorlu, daha zırhlı ve yeniden tasarlanmış motor kaputlu sürümüdür. Britanya’daki kayıplardan sonra Stuka, hava üstünlüğünün olduğu yerlerde, özellikle Doğu Cephesi’nde, kara desteğinde kullanılmaya devam etti. D-5’te kanat uçları uzatıldı ve kanattaki makinelilerin yerine iki 20 mm top kondu.',
      'The Ju 87 D was the version of the Stuka with the more powerful Jumo 211J, more armour and a redesigned cowling. After its losses over Britain, the Stuka went on serving in ground support where there was air superiority, above all on the Eastern Front. On the D-5 the wingtips were extended and two 20 mm cannon replaced the wing machine guns.',
    ),
    facts: [
      { k: K.service, v: t('1941–42; D-5 1943', '1941–42; the D-5 in 1943') },
      { k: K.maker, v: t('Junkers; Weserflug', 'Junkers; Weserflug') },
      { k: K.built, v: t('Ju 87 ailesi yaklaşık 6.500', 'Ju 87 family about 6,500') },
      { k: K.engine, v: t('Junkers Jumo 211J, ters V12, yaklaşık 1.400 PS (kalkış)', 'Junkers Jumo 211J, inverted V12, about 1,400 PS (take-off)') },
      { k: K.speed, v: t('Yaklaşık 410 km/sa, 4.100 m’de', 'About 410 km/h at 4,100 m') },
      { k: K.guns, v: t('Kanatlarda 2 × 20 mm MG 151/20, arkada çift 7,92 mm MG 81Z; gövde altında 1.000 kg ve üzeri bomba', '2 × 20 mm MG 151/20 in the wings, twin 7.92 mm MG 81Z in the rear; 1,000 kg or more of bombs under the fuselage') },
      { k: K.crew, v: t('2', '2') },
      { k: K.size, v: t('15,0 m / 11,5 m', '15.0 m / 11.5 m') },
    ],
    sections: [
      {
        h: t('Güçlendirilmiş Stuka', 'A strengthened Stuka'),
        p: [
          t(
            'D sürümünde motor kaputu ve radyatörler yeniden düzenlendi, kokpit daha temiz bir kanopi aldı, pilot ve nişancının zırhı arttırıldı. Arka nişancıya hızlı ateş eden çift MG 81Z verildi. Daha güçlü motor sayesinde Ju 87 D, B’den çok daha ağır bomba taşıyabiliyordu.',
            'On the D the cowling and radiators were redesigned, the cockpit got a cleaner canopy and armour for the pilot and gunner was increased. The rear gunner got the fast-firing twin MG 81Z. Thanks to the stronger engine, the Ju 87 D could carry much heavier bombs than the B.',
          ),
        ],
      },
      {
        h: t('Doğu Cephesi’nde', 'On the Eastern Front'),
        p: [
          t(
            'Ju 87 D, Doğu Cephesi’nde kara birliklerini destekleyen başlıca uçaklardan biri oldu: köprülere, tank kollarına, topçuya ve demiryollarına saldırdı. Hava üstünlüğü kaybedildikçe gündüz kayıpları arttı; birçok Ju 87 D, alev söndürücülü egzozlarla gece saldırı birliklerine verildi. Yerini yavaş yavaş Fw 190’ın avcı-bombardıman sürümlerine bıraktı.',
            'The Ju 87 D became one of the main aircraft supporting the ground forces on the Eastern Front, attacking bridges, tank columns, artillery and railways. As air superiority was lost, daylight losses rose, and many Ju 87 Ds went to night attack units with flame-damped exhausts. It was gradually replaced by fighter-bomber versions of the Fw 190.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda pike bombardıman uçağıdır. B gibi yaklaşık 75 derece dalar ve bombasını yaklaşık 650 m’de bırakır; daha zırhlı, kanatlarındaki 20 mm toplarla daha iyi silahlı ve arkasında çift MG 81Z ile daha iyi savunulur. Yine de yavaştır ve refakat ister.',
        'In the game it is a dive bomber. Like the B, it dives at about 75 degrees and releases at about 650 m; it is better armoured, better armed with its 20 mm wing cannon and better defended with the twin MG 81Z in the rear. It is still slow and needs an escort.',
      ),
    ],
  },
  {
    id: 'b25j',
    summary: t(
      'Doolittle akınının uçağı: her cephede savaşan, makineliyle dolu orta bombardıman.',
      'The aircraft of the Doolittle Raid: a gun-bristling medium bomber that fought on every front.',
    ),
    lead: t(
      'North American B-25 Mitchell, adını ABD’de bağımsız hava gücünün savunucusu General Billy Mitchell’den alan orta bombardıman uçağıdır. Nisan 1942’de uçak gemisi Hornet’ten kalkıp Tokyo’yu bombalayan Doolittle akınıyla ünlendi. Çift dikey kuyruğu ve burun tekerlekli iniş takımıyla tanınır; J sürümü en çok üretilenidir.',
      'The North American B-25 Mitchell was a medium bomber named after General Billy Mitchell, the advocate of an independent US air arm. It became famous with the Doolittle Raid of April 1942, when B-25s took off from the carrier Hornet to bomb Tokyo. It is recognisable by its twin tail and tricycle undercarriage; the J was the most-produced version.',
    ),
    facts: [
      { k: K.first, v: t('19 Ağustos 1940', '19 August 1940') },
      { k: K.service, v: t('1941; J sürümü 1943', '1941; the J in 1943') },
      { k: K.maker, v: t('North American Aviation', 'North American Aviation') },
      { k: K.built, v: t('Yaklaşık 9.800 (bütün sürümler)', 'About 9,800 (all variants)') },
      { k: K.engine, v: t('2 × Wright R-2600 Cyclone 14, çift sıralı yıldız, her biri yaklaşık 1.700 bg', '2 × Wright R-2600 Cyclone 14, twin-row radial, about 1,700 hp each') },
      { k: K.speed, v: t('Yaklaşık 440 km/sa, 3.900 m’de', 'About 440 km/h at 3,900 m') },
      { k: K.guns, v: t('12–13 × 12,7 mm M2 Browning (burun, sırt, yan, kuyruk); yaklaşık 1.360 kg (3.000 lb) bomba', '12–13 × .50 in M2 Browning (nose, dorsal, beam, tail); about 3,000 lb (1,360 kg) of bombs') },
      { k: K.crew, v: t('6', '6') },
      { k: K.size, v: t('20,6 m / 16,13 m', '20.6 m / 16.13 m') },
    ],
    sections: [
      {
        h: t('Doolittle akını', 'The Doolittle Raid'),
        p: [
          t(
            'Pearl Harbor’dan dört ay sonra, 18 Nisan 1942’de, Yarbay James Doolittle komutasındaki on altı B-25, uçak gemisi Hornet’in güvertesinden kalktı. Kara bombardıman uçaklarının bir uçak gemisinden kalkması daha önce hiç denenmemişti. Uçaklar Tokyo ve başka Japon şehirlerini bombalayıp Çin’e doğru uçtu. Verdikleri hasar küçüktü, ama akın Amerikan moralini yükseltti ve Japon komutasını Midway’e götüren kararları hızlandırdı.',
            'Four months after Pearl Harbor, on 18 April 1942, sixteen B-25s led by Lieutenant Colonel James Doolittle took off from the deck of the carrier Hornet. Land bombers had never before flown from an aircraft carrier. They bombed Tokyo and other Japanese cities and flew on towards China. The damage was small, but the raid lifted American morale and hastened the Japanese decisions that led to Midway.',
          ),
        ],
      },
      {
        h: t('Makineli tüfekle dolu bir burun', 'A nose full of guns'),
        p: [
          t(
            'B-25 her cephede savaştı: Akdeniz’de, Pasifik’te, Çin’de ve Sovyetler Birliği’nde. Pasifik’te bazı B-25’lerin camlı burnu kaldırılıp yerine çok sayıda makineli tüfek, hatta 75 mm top kondu; bu “gunship”ler Japon gemilerine ve hava üslerine çok alçaktan saldırdı. J sürümünde camlı burunla birlikte 12–13 makineli tüfek vardı.',
            'The B-25 fought on every front: in the Mediterranean, the Pacific, China and the Soviet Union. In the Pacific some B-25s had their glazed noses replaced with batteries of machine guns, even a 75 mm cannon; these “gunships” attacked Japanese ships and airfields from very low level. The J, with a glazed nose, carried 12–13 machine guns.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda orta bombardıman uçağıdır. Savunması güçlüdür: burun, motorlu sırt taretinde çift, iki yan pencere ve kuyrukta çift olmak üzere hepsi 12,7 mm makineliler. Burun tekerleklidir.',
        'In the game it is a medium bomber. Its defence is strong: all .50 in guns, in the nose, a twin powered dorsal turret, two beam windows and a twin tail position. It has a tricycle undercarriage.',
      ),
    ],
  },
  {
    id: 'b17g',
    summary: t(
      '“Uçan Kale”: on üç ağır makinelisiyle gündüz bombardımanının simgesi.',
      'The “Flying Fortress”: the symbol of daylight bombing, bristling with thirteen heavy machine guns.',
    ),
    lead: t(
      'Boeing B-17 Flying Fortress, ABD’nin Avrupa’daki gündüz bombardımanının simgesidir. Turbo kompresörlü dört motoru onu yüksekte uçurur, on üç 12,7 mm makinelisi kutu düzeninde uçan kolların birbirini korumasını sağlardı. Çok ağır hasar alıp yine de üssüne dönebilmesiyle ün kazandı.',
      'The Boeing B-17 Flying Fortress is the symbol of the American daylight bombing campaign in Europe. Its four turbo-supercharged engines carried it high, and its thirteen .50 in machine guns let formations flying in tight “boxes” protect each other. It became famous for bringing its crews home despite very heavy damage.',
    ),
    facts: [
      { k: K.first, v: t('28 Temmuz 1935 (Boeing Model 299)', '28 July 1935 (Boeing Model 299)') },
      { k: K.service, v: t('1938; G sürümü 1943', '1938; the G in 1943') },
      { k: K.maker, v: t('Boeing; lisansla Douglas ve Lockheed-Vega', 'Boeing; under licence by Douglas and Lockheed-Vega') },
      { k: K.built, v: t('Yaklaşık 12.700 (bütün sürümler); 8.600’ü aşkını G', 'About 12,700 (all variants), more than 8,600 of them Gs') },
      { k: K.engine, v: t('4 × Wright R-1820-97 Cyclone, dokuz silindirli yıldız, turbo kompresörlü, her biri 1.200 bg', '4 × Wright R-1820-97 Cyclone, nine-cylinder radial with turbo-supercharger, 1,200 hp each') },
      { k: K.speed, v: t('Yaklaşık 460 km/sa, 7.600 m’de', 'About 460 km/h at 7,600 m') },
      { k: K.guns, v: t('13 × 12,7 mm M2 Browning (çene, yanak, sırt, telsizci, küre, bel ve kuyruk); tipik 1.800–2.700 kg bomba', '13 × .50 in M2 Browning (chin, cheek, dorsal, radio room, ball, waist and tail); typically 4,000–6,000 lb of bombs') },
      { k: K.crew, v: t('10', '10') },
      { k: K.size, v: t('31,62 m / 22,66 m', '31.62 m / 22.66 m') },
    ],
    sections: [
      {
        h: t('Model 299 ve kontrol listesi', 'The Model 299 and the checklist'),
        p: [
          t(
            'Boeing’in Model 299’u 1935’te uçtuğunda bir gazeteci onu “uçan kale” diye niteledi ve ad kaldı. Ekim 1935’teki bir gösteri uçuşunda pilotlar kumanda kilitlerini açmayı unuttu ve uçak düştü. Bu kazadan sonra uçuştan önce adım adım okunan pilot kontrol listesi doğdu; bugün hâlâ havacılığın temel güvenlik araçlarından biridir.',
            'When Boeing’s Model 299 flew in 1935, a journalist called it a “flying fortress”, and the name stuck. On an evaluation flight in October 1935 the pilots forgot to release the control locks and the aircraft crashed. That accident gave birth to the pilot’s checklist read step by step before flight, still one of aviation’s basic safety tools.',
          ),
        ],
      },
      {
        h: t('Gündüz bombardımanı', 'Daylight bombing'),
        p: [
          t(
            'ABD 8. Hava Kuvvetleri, Norden nişangâhıyla gündüz ve yüksekten isabetli bombardıman yapmaya inanıyordu. Kutu düzeninde uçan B-17’ler birbirini ateşle koruyacaktı. Gerçek daha acıydı: 1943’te refakatsiz akınlarda, örneğin Schweinfurt’a yapılanlarda, tek günde onlarca B-17 kaybedildi. G sürümüne, Alman avcılarının önden saldırılarına karşı burnun altına çift makineli bir çene tareti eklendi.',
            'The US Eighth Air Force believed in accurate bombing by day from high altitude with the Norden bombsight. B-17s flying in box formations would protect each other with their guns. The reality was harsher: in unescorted raids in 1943, such as those on Schweinfurt, dozens of B-17s were lost in a single day. The G added a twin-gun chin turret against German fighters’ head-on attacks.',
          ),
          t(
            '1944’te P-51 Mustang gibi uzun menzilli refakat avcıları bombardıman uçaklarına Almanya’nın içlerine kadar eşlik etmeye başlayınca kayıplar azaldı ve gündüz bombardımanı Alman sanayisini ve hava kuvvetlerini ağır biçimde yıprattı.',
            'In 1944, once long-range escort fighters such as the P-51 Mustang began accompanying the bombers deep into Germany, losses fell and daylight bombing severely wore down German industry and the Luftwaffe.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ağır bombardıman uçağıdır: turbo kompresörlü motorları onu çok yüksekten uçurur, on üç 12,7 mm makinelisi her yönü korur ve çok dayanıklıdır. 12 × 500 lb, 6 × 1000 lb ya da alan bombardımanı için 24 × 100 lb taşır. Yavaş ve hantaldır; avcılar onu düşürmek için çok mermi harcar.',
        'In the game it is a heavy bomber: its turbo-supercharged engines carry it very high, its thirteen .50 in guns cover every direction and it is very tough. It carries 12 × 500 lb, 6 × 1,000 lb or, for area bombing, 24 × 100 lb. It is slow and ponderous; fighters spend a lot of ammunition bringing one down.',
      ),
    ],
  },
  {
    id: 'p38j',
    summary: t(
      'Çift kuyruk kirişli, turbo kompresörlü avcı: Yamamoto’yu düşüren uçak.',
      'The twin-boom, turbo-supercharged fighter that shot down Yamamoto.',
    ),
    lead: t(
      'Lockheed P-38 Lightning, iki motoru ve iki kuyruk kirişiyle savaşın en kolay tanınan avcılarından biridir. Turbo kompresörleri onu yüksekte hızlı, iki motoru çok uzun menzilli yaptı; bütün silahları burnunda toplandığı için ateşi çok isabetliydi. ABD’nin en çok düşürme kaydeden iki pilotu, Richard Bong ve Thomas McGuire, P-38 uçurdu.',
      'The Lockheed P-38 Lightning, with its two engines and twin tail booms, is one of the most recognisable fighters of the war. Its turbo-superchargers made it fast high up and its two engines gave it a very long range; with all its guns grouped in the nose, its fire was very accurate. The two highest-scoring American pilots, Richard Bong and Thomas McGuire, flew P-38s.',
    ),
    facts: [
      { k: K.first, v: t('27 Ocak 1939 (XP-38)', '27 January 1939 (XP-38)') },
      { k: K.service, v: t('1941; J sürümü 1943', '1941; the J in 1943') },
      { k: K.designer, v: t('Hall Hibbard ve Clarence “Kelly” Johnson', 'Hall Hibbard and Clarence “Kelly” Johnson') },
      { k: K.maker, v: t('Lockheed', 'Lockheed') },
      { k: K.built, v: t('Yaklaşık 10.000 (bütün sürümler)', 'About 10,000 (all variants)') },
      { k: K.engine, v: t('2 × Allison V-1710, V12, turbo kompresörlü, ters dönen pervaneli, her biri yaklaşık 1.400 bg', '2 × Allison V-1710, V12, turbo-supercharged with counter-rotating propellers, about 1,400 hp each') },
      { k: K.speed, v: t('Yaklaşık 665 km/sa, 7.600 m’de', 'About 665 km/h at 7,600 m') },
      { k: K.guns, v: t('Burunda 1 × 20 mm Hispano ve 4 × 12,7 mm M2 Browning', '1 × 20 mm Hispano and 4 × .50 in M2 Browning in the nose') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('15,85 m / 11,53 m', '15.85 m / 11.53 m') },
    ],
    sections: [
      {
        h: t('Alışılmadık bir biçim', 'An unusual shape'),
        p: [
          t(
            'P-38’in motorları iki kuyruk kirişinin önündeydi, pilot ortadaki küçük gövdede otururdu. Bu düzen turbo kompresörlere ve radyatörlere yer açtı, silahları da pervanesiz buruna toplamaya izin verdi: kanattaki silahlar gibi belli bir uzaklıkta kesişmeleri gerekmiyordu. Pervaneler ters yönlerde döndüğü için motor torku uçağı bir yana çekmiyordu.',
            'The P-38’s engines sat at the front of two tail booms, with the pilot in a small central nacelle. The layout made room for turbo-superchargers and radiators and let the guns be grouped in a propeller-free nose: unlike wing guns, they did not need to converge at a set range. The propellers turned in opposite directions, so engine torque did not pull the aircraft to one side.',
          ),
          t(
            'Hızlı dalışta P-38 ses hızına yaklaşınca sıkıştırılabilirlik etkileri kuyruğu sarsıyor ve burun aşağı kilitleniyordu; birkaç pilot dalıştan çıkamadı. Sorun ancak J sürümünün son serilerinde eklenen dalış flaplarıyla hafifletildi.',
            'In a fast dive, as the P-38 approached the speed of sound, compressibility effects buffeted the tail and locked the nose down; several pilots could not pull out. The problem was only eased by dive flaps added in late production Js.',
          ),
        ],
      },
      {
        h: t('Pasifik’te', 'In the Pacific'),
        p: [
          t(
            'Uzun menzili P-38’i Pasifik’te çok değerli yaptı. 18 Nisan 1943’te Guadalcanal’dan kalkan P-38’ler, şifreleri çözülmüş bir uçuş planını izleyerek Japon Birleşik Donanma komutanı Amiral Isoroku Yamamoto’yu taşıyan uçağı Bougainville üzerinde düşürdü. Avrupa’da ise soğuk ve nemli havada motor sorunları yüzünden daha az başarılı oldu ve bir süre sonra refakat görevini P-51’e bıraktı.',
            'Its long range made the P-38 very valuable in the Pacific. On 18 April 1943, P-38s from Guadalcanal, following a flight plan revealed by broken codes, shot down the aircraft carrying Admiral Isoroku Yamamoto, commander of the Japanese Combined Fleet, over Bougainville. In Europe, engine trouble in cold, damp air made it less successful, and it later handed over the escort role to the P-51.',
          ),
          t(
            'P-38’in keşif sürümleri de çok kullanıldı; “Küçük Prens”in yazarı Antoine de Saint-Exupéry Temmuz 1944’te böyle bir keşif uçağıyla uçarken kayboldu.',
            'Reconnaissance versions of the P-38 were widely used; Antoine de Saint-Exupéry, author of “The Little Prince”, disappeared in July 1944 while flying one.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ağır avcıdır ve enerji taktiğiyle savaşır: turbo kompresörleri onu yüksekte çok hızlı yapar, burnundaki toplu ateş isabetlidir ve menzili çok uzundur. Ağır yuvarlanır. Hızlı dalışta sıkıştırılabilirlik burnu aşağı kilitler; dalıştan erken çıkmak gerekir.',
        'In the game it is a heavy fighter that fights with energy tactics: its turbo-superchargers make it very fast high up, its concentrated nose guns are accurate and its range is very long. It rolls heavily. In a fast dive compressibility locks the nose down, so you have to pull out early.',
      ),
    ],
  },
  {
    id: 'mosquito',
    summary: t(
      '“Ahşap mucize”: savunma silahı taşımayan, hızına güvenen çok yönlü uçak.',
      'The “Wooden Wonder”: a versatile aircraft that carried no defensive guns and trusted its speed.',
    ),
    lead: t(
      'de Havilland Mosquito, büyük ölçüde ahşaptan yapılmış, iki Merlin motorlu, çok hızlı bir uçaktır. Savunma silahı taşımaz, avcılardan kaçmak için hızına güvenirdi. Bombardıman, avcı-bombardıman, gece avcısı, keşif ve öncü uçak olarak kullanıldı; “ahşap mucize” diye anıldı.',
      'The de Havilland Mosquito was a very fast aircraft with two Merlin engines, built largely of wood. It carried no defensive guns and relied on its speed to escape fighters. It served as a bomber, fighter-bomber, night fighter, reconnaissance aircraft and pathfinder, and was known as the “Wooden Wonder”.',
    ),
    facts: [
      { k: K.first, v: t('25 Kasım 1940', '25 November 1940') },
      { k: K.service, v: t('1941; FB Mk VI 1943', '1941; the FB Mk VI in 1943') },
      { k: K.designer, v: t('Ronald Bishop’un de Havilland ekibi', 'Ronald Bishop’s de Havilland team') },
      { k: K.maker, v: t('de Havilland; Kanada ve Avustralya’da da', 'de Havilland; also in Canada and Australia') },
      { k: K.built, v: t('Yaklaşık 7.800 (bütün sürümler)', 'About 7,800 (all variants)') },
      { k: K.engine, v: t('2 × Rolls-Royce Merlin 25, V12, her biri yaklaşık 1.600 bg', '2 × Rolls-Royce Merlin 25, V12, about 1,600 hp each') },
      { k: K.speed, v: t('Yaklaşık 600 km/sa, 4.300 m’de', 'About 600 km/h at 4,300 m') },
      { k: K.guns, v: t('Burunda 4 × 20 mm Hispano ve 4 × 7,7 mm Browning; 4 × 500 lb bomba ya da 8 × RP-3 roket', '4 × 20 mm Hispano and 4 × .303 in Browning in the nose; 4 × 500 lb bombs or 8 × RP-3 rockets') },
      { k: K.crew, v: t('2', '2') },
      { k: K.size, v: t('16,52 m / 12,47 m', '16.52 m / 12.47 m') },
    ],
    sections: [
      {
        h: t('Ahşaptan bir uçak', 'An aircraft of wood'),
        p: [
          t(
            'de Havilland, savunma taretleri olmayan, hızıyla avcılardan kaçabilecek bir bombardıman uçağı önerdi; Hava Bakanlığı başta kuşkuyla baktı. Gövde, balsa çekirdekli kontrplak katmanlardan iki yarım kabuk olarak kalıplarda yapıldı ve birleştirildi. Ahşap, savaşta kıt olan alüminyumu harcamıyordu ve parçaları mobilya atölyeleri de üretebiliyordu.',
            'De Havilland proposed a bomber with no defensive turrets that could escape fighters by its speed; the Air Ministry was sceptical at first. The fuselage was made in two half-shells of plywood layers with a balsa core, formed in moulds and then joined. Wood did not use up aluminium, which was scarce in wartime, and furniture workshops could make the parts.',
          ),
        ],
      },
      {
        h: t('Alçaktan isabetli akınlar', 'Precise low-level raids'),
        p: [
          t(
            'FB Mk VI avcı-bombardıman sürümü burnunda dört top ve dört makineli taşıyordu. Mosquito’lar alçaktan çok isabetli akınlarıyla ün kazandı: Şubat 1944’te Fransa’daki Amiens hapishanesinin duvarlarını yıkarak direniş üyelerinin kaçmasına yardım ettiler, Danimarka ve Norveç’te Gestapo binalarını vurdular.',
            'The FB Mk VI fighter-bomber carried four cannon and four machine guns in the nose. Mosquitoes became famous for very precise low-level raids: in February 1944 they breached the walls of Amiens prison in France to help members of the Resistance escape, and they struck Gestapo buildings in Denmark and Norway.',
          ),
          t(
            'Bombardıman sürümleri gece Almanya’ya hızlı akınlar yaptı ve büyük bombardıman kollarına hedefi işaretleyen öncü uçaklar olarak kullanıldı. Radarlı gece avcısı sürümleri de savaşın en başarılı gece avcılarındandı.',
            'Bomber versions made fast night raids on Germany and served as pathfinders marking targets for the main bomber streams. Radar-equipped night-fighter versions were among the most successful night fighters of the war.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda taarruz hattındadır ve enerji taktiğiyle savaşır: çok hızlıdır, burnundaki dört 20 mm top ve dört makineli güçlüdür. 4 × 500 lb bomba ya da 8 × RP-3 roket ve 2 × 500 lb taşıyabilir. Savunma silahı yoktur; avcılardan hızıyla kaçar.',
        'In the game it sits in the attack line and fights with energy tactics: it is very fast, and the four 20 mm cannon and four machine guns in its nose are powerful. It can carry 4 × 500 lb bombs, or 8 × RP-3 rockets with 2 × 500 lb. It has no defensive guns and escapes fighters by its speed.',
      ),
    ],
  },
];
