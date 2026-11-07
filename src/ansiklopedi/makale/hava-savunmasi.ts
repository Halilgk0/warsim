// Ansiklopedi makaleleri: hava savunma silahları (uçaksavar topları), oyundaki sırayla (airDefense AA_WEAPON_ORDER).
// Ülke, yıl, sınıf ve "Oyunda" bölümünün sayıları silah tablosundan (sim/structures/aaWeapons.ts) gelir; burada yalnız elle yazılan
// metin durur. Tarih ve sayılar yaygın kaynaklarla uyuşmalı; emin olunmayan bilgi yazılmaz, aralıkla ya da "yaklaşık" ile verilir.

import type { AAWeaponId } from '../../sim/structures/aaWeapons';
import { t, type Tx } from '../tur';

export interface GunArticle {
  id: AAWeaponId;
  /** Sayfa ve kart başlığı (Türkçede ondalık virgül: 8,8 cm). */
  name: Tx;
  summary: Tx;
  lead: Tx;
  facts: { k: Tx; v: Tx }[];
  sections: { h: Tx; p: Tx[] }[];
  inGame: Tx[];
}

const K = {
  country: t('Ülke', 'Country'),
  maker: t('Tasarım ve üretim', 'Design and manufacture'),
  service: t('Hizmete giriş', 'Entered service'),
  round: t('Fişek', 'Cartridge'),
  shell: t('Mermi', 'Projectile'),
  mv: t('Namlu hızı', 'Muzzle velocity'),
  rate: t('Atış hızı', 'Rate of fire'),
  feed: t('Besleme', 'Feed'),
  ceiling: t('Tavan', 'Ceiling'),
  crew: t('Mürettebat', 'Crew'),
  built: t('Üretim', 'Number built'),
};

export const GUN_ARTICLES: GunArticle[] = [
  {
    id: 'mg',
    name: t('M2 Browning 12,7 mm', 'M2 Browning 12.7 mm'),
    summary: t(
      'Su soğutmalı .50 kalibre ağır makineli: savaşın başında ABD gemilerinin ve üslerinin yakın hava savunmasıydı.',
      'The water-cooled .50 calibre heavy machine gun: the close-in air defence of US ships and bases early in the war.',
    ),
    lead: t(
      'M2 Browning, John M. Browning’in Birinci Dünya Savaşı’nın sonunda geliştirdiği 12,7 mm’lik (.50 kalibre) ağır makinelinin 1933’te kabul edilen biçimidir. Aynı mekanizma su soğutmalı namluyla uçaksavar, ağır namluyla piyade ve araç, hafif namluyla uçak silahı olarak üretildi. Su soğutmalı uçaksavar biçimi kayışla beslenip uzun seriler atabildiği için savaşın başında ABD gemilerinin ve hava üslerinin yakın hava savunma silahıydı.',
      'The M2 Browning is the 1933 form of the 12.7 mm (.50 calibre) heavy machine gun that John M. Browning developed at the end of the First World War. The same mechanism was built with a water-cooled barrel as an anti-aircraft gun, with a heavy barrel for infantry and vehicles, and with a light barrel as an aircraft gun. Because the water-cooled anti-aircraft version was belt-fed and could fire long bursts, it was the close-in air defence weapon of US ships and air bases at the start of the war.',
    ),
    facts: [
      { k: K.country, v: t('ABD', 'USA') },
      { k: K.maker, v: t('John M. Browning (M1921); 1933’te M2 olarak yeniden düzenlendi', 'John M. Browning (M1921); reworked as the M2 in 1933') },
      { k: K.round, v: t('12,7 × 99 mm (.50 BMG)', '12.7 × 99 mm (.50 BMG)') },
      { k: K.rate, v: t('Su soğutmalı uçaksavar biçiminde dakikada yaklaşık 450–600', 'About 450–600 rounds per minute in the water-cooled anti-aircraft form') },
      { k: K.feed, v: t('Kayış', 'Belt') },
    ],
    sections: [
      {
        h: t('Büyütülmüş bir Browning', 'A scaled-up Browning'),
        p: [
          t(
            'Birinci Dünya Savaşı’nda tanklar ve uçaklar ortaya çıkınca ABD ordusu tüfek mermisinden çok daha güçlü bir makineli istedi. Browning, kendi .30 kalibre makinelisinin mekanizmasını büyüttü; fişek de .30-06’nın büyütülmüş bir biçimiydi. İlk sürüm, su soğutmalı M1921 oldu.',
            'When tanks and aircraft appeared in the First World War, the US Army wanted a machine gun far more powerful than a rifle-calibre weapon. Browning scaled up the mechanism of his own .30 calibre machine gun, and the cartridge was a scaled-up form of the .30-06. The first version was the water-cooled M1921.',
          ),
          t(
            'Browning 1926’da öldü. Sonraki yıllarda tasarım, aynı gövdenin su soğutmalı, ağır namlulu ya da uçak silahı olarak kurulabileceği biçimde yeniden düzenlendi ve 1933’te M2 adıyla kabul edildi. Ağır namlulu M2HB bugün de dünyanın birçok ordusunda kullanılmaktadır.',
            'Browning died in 1926. In the following years the design was reworked so that the same receiver could be set up as a water-cooled gun, a heavy-barrel gun or an aircraft gun, and it was adopted as the M2 in 1933. The heavy-barrel M2HB is still in service with many armies today.',
          ),
        ],
      },
      {
        h: t('Gemilerde ve karada', 'At sea and on land'),
        p: [
          t(
            'Savaşın başında ABD donanmasının birçok gemisi yakın hava savunması için su soğutmalı .50 kalibre makineliler taşıyordu. 1942’deki çatışmalar bu makinelilerin menzilinin ve vuruş gücünün modern uçaklara yetmediğini gösterdi; gemilerde yerlerini büyük ölçüde Oerlikon 20 mm ve Bofors 40 mm toplar aldı.',
            'At the start of the war many US Navy ships carried water-cooled .50 calibre machine guns for close-in air defence. The fighting of 1942 showed that their range and hitting power were not enough against modern aircraft, and on ships they were largely replaced by Oerlikon 20 mm and Bofors 40 mm guns.',
          ),
          t(
            'Karada ise .50 kalibre savaş boyunca hafif hava savunmasının parçası kaldı. Dört ağır namlulu M2’yi elektrikli bir kulede birleştiren M45 dörtlü kule, M16 yarı paletli araçlara takıldı ve alçaktan saldıran uçaklara karşı kullanıldı; yer hedeflerine karşı da çok etkiliydi.',
            'On land the .50 calibre remained part of light air defence throughout the war. The M45 quad mount, which combined four heavy-barrel M2s in a powered turret, was fitted to M16 half-tracks and used against low-flying attackers; it was also very effective against ground targets.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda başlangıçtaki hafif silahtır. Kayışla beslendiği için hiç durmadan atar ve namlusu hızlı döner; ama küçük mermisi kendini imha etmez, yalnız doğrudan isabetle hasar verir ve zırhlı taarruz uçağına az işler.',
        'In the game it is the starting light weapon. Being belt-fed, it fires without pause and swings quickly, but its small bullet does not self-destruct, only damages with a direct hit and does little to an armoured attacker.',
      ),
    ],
  },
  {
    id: 'aa20',
    name: t('2 cm Flak 38', '2 cm Flak 38'),
    summary: t(
      'Almanların en çok kullandığı hafif uçaksavar topu: 20’lik şarjörü üç saniyede boşaltır.',
      'Germany’s most widely used light anti-aircraft gun: it empties its 20-round magazine in three seconds.',
    ),
    lead: t(
      '2 cm Flak 38, Mauser’in geliştirdiği 20 mm’lik Alman hafif uçaksavar topudur. Daha yavaş atan 2 cm Flak 30’un yerine geçti; aynı mermiyi ve şarjörü kullanırken atış hızı neredeyse iki katına çıktı. Savaş boyunca Alman kara ordusunun, Luftwaffe’nin ve donanmanın en yaygın hafif uçaksavar silahı oldu; dörtlü biçimi Flakvierling 38 de bu topun dört namlusudur.',
      'The 2 cm Flak 38 is the 20 mm German light anti-aircraft gun developed by Mauser. It replaced the slower-firing 2 cm Flak 30; using the same ammunition and magazine, it almost doubled the rate of fire. Throughout the war it was the most common light anti-aircraft weapon of the German army, the Luftwaffe and the navy, and its quadruple form, the Flakvierling 38, is four of these guns.',
    ),
    facts: [
      { k: K.country, v: t('Almanya', 'Germany') },
      { k: K.maker, v: t('Mauser', 'Mauser') },
      { k: K.service, v: t('1939’dan itibaren', 'From 1939') },
      { k: K.round, v: t('20 × 138 mm B', '20 × 138 mm B') },
      { k: K.rate, v: t('Dakikada 420–480 (seri), yaklaşık 180–220 (pratik)', '420–480 rounds per minute (cyclic), about 180–220 (practical)') },
      { k: K.feed, v: t('20 mermilik şarjör', '20-round magazine') },
    ],
    sections: [
      {
        h: t('Flak 30’dan Flak 38’e', 'From Flak 30 to Flak 38'),
        p: [
          t(
            'Rheinmetall’in 2 cm Flak 30’u 1930’ların ortasında hizmete girmiş ve İspanya İç Savaşı’nda Kondor Lejyonu’yla kullanılmıştı. Güvenilirdi ama dakikada 300 dolayındaki atış hızı, giderek hızlanan uçaklara karşı yetersiz kalıyordu.',
            'Rheinmetall’s 2 cm Flak 30 entered service in the mid-1930s and was used by the Condor Legion in the Spanish Civil War. It was reliable, but its rate of fire of about 300 rounds a minute was too low against ever faster aircraft.',
          ),
          t(
            'Mauser’in Flak 38’i aynı fişeği, aynı 20’lik şarjörü ve benzer bir lafeti kullanırken mekanizması daha hafif ve hızlıydı. Böylece ordunun elindeki mühimmat ve eğitim değişmeden ateş gücü arttı.',
            'Mauser’s Flak 38 used the same cartridge, the same 20-round magazine and a similar mount, but its mechanism was lighter and faster. Firepower rose without changing the army’s ammunition or training.',
          ),
        ],
      },
      {
        h: t('Her yerde bir 20 mm', 'A 20 mm everywhere'),
        p: [
          t(
            'Flak 38 çekili lafetiyle taşındı; yarı paletli araçlara, kamyonlara, demiryolu vagonlarına, gemilere ve sabit mevzilere de kuruldu. Alçaktan gelen avcı ve taarruz uçaklarına karşı ilk savunma hattıydı; çoğu zaman yer hedeflerine karşı da kullanıldı.',
            'The Flak 38 was moved on a towed mount and was also fitted to half-tracks, lorries, railway wagons, ships and fixed positions. It was the first line of defence against low-flying fighters and attack aircraft, and it was often turned on ground targets too.',
          ),
          t(
            'Savaş ilerledikçe 20 mm’lik merminin, Il-2 gibi zırhlı taarruz uçaklarına ve ağırlaşan avcı-bombardıman uçaklarına karşı gücü yetersiz kaldı. Almanlar bu yüzden dörtlü Flakvierling’e ve 3,7 cm’lik toplara daha çok yaslandı.',
            'As the war went on, the 20 mm shell proved too weak against armoured attackers such as the Il-2 and ever heavier fighter-bombers. The Germans therefore leaned more on the quadruple Flakvierling and on 3.7 cm guns.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda 20’lik şarjörünü üç saniyeden kısa sürede boşaltır, sonra mürettebat şarjör değiştirirken ateş durur. İzli mermisi 6 saniyede, yaklaşık 2,2 km’de kendini imha eder; yalnız doğrudan isabetle hasar verir.',
        'In the game it empties its 20-round magazine in under three seconds, then stops firing while the crew changes it. Its tracer self-destructs after 6 seconds, at about 2.2 km, and only damages with a direct hit.',
      ),
    ],
  },
  {
    id: 'oerlikon',
    name: t('Oerlikon 20 mm', 'Oerlikon 20 mm'),
    summary: t(
      'İsviçre tasarımı 20 mm: İngiliz ve Amerikan donanmalarının standart yakın savunma topu oldu.',
      'The Swiss-designed 20 mm that became the standard close-in gun of the British and American navies.',
    ),
    lead: t(
      'Oerlikon 20 mm, kökeni Birinci Dünya Savaşı’ndaki Alman Becker topuna dayanan ve İsviçreli Oerlikon şirketinin geliştirdiği otomatik toptur. İkinci Dünya Savaşı’nda İngiliz Kraliyet Donanması’nın ve ABD donanmasının standart yakın hava savunma topu oldu; ABD’de ve Birleşik Krallık’ta lisansla on binlercesi üretildi. Dış güç gerektirmeden neredeyse her güverteye kurulabiliyordu.',
      'The Oerlikon 20 mm is an automatic cannon developed by the Swiss firm Oerlikon, with roots in the German Becker cannon of the First World War. In the Second World War it became the standard close-in air defence gun of the Royal Navy and the US Navy, and tens of thousands were built under licence in the United States and Britain. Needing no external power, it could be mounted on almost any deck.',
    ),
    facts: [
      { k: K.country, v: t('İsviçre (tasarım); lisansla ABD ve Birleşik Krallık', 'Switzerland (design); under licence in the USA and Britain') },
      { k: K.maker, v: t('Oerlikon (Becker topundan geliştirildi)', 'Oerlikon (developed from the Becker cannon)') },
      { k: K.round, v: t('20 × 110 mm RB', '20 × 110 mm RB') },
      { k: K.rate, v: t('Dakikada yaklaşık 450 (seri)', 'About 450 rounds per minute (cyclic)') },
      { k: K.feed, v: t('60 mermilik tambur', '60-round drum') },
    ],
    sections: [
      {
        h: t('Becker’den Oerlikon’a', 'From Becker to Oerlikon'),
        p: [
          t(
            'Almanya’da Reinhold Becker’in tasarladığı 20 mm’lik top Birinci Dünya Savaşı’nın sonunda bazı uçaklarda kullanıldı. Savaştan sonra Versay Antlaşması Almanya’nın bu tür silah üretmesini kısıtlayınca haklar İsviçre’ye geçti ve tasarım Oerlikon’da geliştirildi.',
            'The 20 mm cannon designed by Reinhold Becker in Germany was used in some aircraft at the end of the First World War. After the war, when the Treaty of Versailles restricted German production of such weapons, the rights passed to Switzerland and the design was developed further at Oerlikon.',
          ),
          t(
            'Silah, geri tepen kütlenin mermiyi ateşleyip mekanizmayı çalıştırdığı basit bir düzenle çalışıyordu. Hafifti, az parçalıydı ve elektrik ya da hidrolik güç istemiyordu.',
            'The gun worked on a simple blowback principle, in which the recoiling mass fired the round and cycled the mechanism. It was light, had few parts and needed no electric or hydraulic power.',
          ),
        ],
      },
      {
        h: t('Donanmaların topu', 'The navies’ gun'),
        p: [
          t(
            'Kraliyet Donanması savaşın başında Oerlikon’u benimsedi; ABD donanması da 1941’den itibaren gemilerindeki .50 kalibre makinelilerin yerine bu topu takmaya başladı. Nişancı omuz desteklerine yaslanır, topu gövdesiyle çevirir ve doğrudan nişangâhtan bakarak ateş ederdi.',
            'The Royal Navy adopted the Oerlikon early in the war, and from 1941 the US Navy began fitting it to its ships in place of .50 calibre machine guns. The gunner leaned into the shoulder rests, swung the gun with his body and fired looking straight through the sight.',
          ),
          t(
            'Savaşın sonlarında, özellikle kamikaze saldırılarına karşı, 20 mm’lik merminin dalışa geçmiş bir uçağı durdurmaya yetmediği görüldü; gemilerde ağırlık giderek Bofors 40 mm’ye kaydı. Oerlikon yine de savaş boyunca en kalabalık gemi uçaksavar silahlarından biri olarak kaldı.',
            'Late in the war, especially against kamikaze attacks, the 20 mm shell proved unable to stop an aircraft already in its dive, and ships increasingly relied on the Bofors 40 mm. Even so, the Oerlikon remained one of the most numerous shipboard anti-aircraft weapons throughout the war.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda nişancı topu elle çevirdiği için çabuk döner. 60’lık tamburu Flak 38’in şarjöründen uzun seri attırır; ama izli mermisi daha yakında, yaklaşık 1,9 km’ye kadar işe yarar ve yalnız doğrudan isabetle hasar verir.',
        'In the game the gunner swings it by hand, so it turns quickly. Its 60-round drum gives longer bursts than the Flak 38 magazine, but its tracer is useful only to about 1.9 km and it only damages with a direct hit.',
      ),
    ],
  },
  {
    id: 'aa20q',
    name: t('2 cm Flakvierling 38', '2 cm Flakvierling 38'),
    summary: t(
      'Tek lafette dört Flak 38: alçaktan gelen taarruz uçağına karşı Almanların en tehlikeli hafif silahı.',
      'Four Flak 38s on one mount: Germany’s most dangerous light weapon against low-flying attackers.',
    ),
    lead: t(
      '2 cm Flakvierling 38, dört 2 cm Flak 38 topunu tek bir lafette birleştiren Alman dörtlü uçaksavar silahıdır. Mauser’in tasarımıdır ve 1940’ta hizmete girdi. Dört namlu birlikte dakikada 1.800’e yakın seri hızla atar; kısa bir seride tek topun dört katı mermiyi havaya gönderir. Alçaktan saldıran avcı-bombardıman ve taarruz uçaklarına karşı Almanların en etkili hafif silahlarından biriydi.',
      'The 2 cm Flakvierling 38 is a German quadruple anti-aircraft weapon that combines four 2 cm Flak 38 guns on a single mount. It was designed by Mauser and entered service in 1940. The four barrels together reach a cyclic rate of nearly 1,800 rounds a minute, sending four times as many shells into the air in a short burst as a single gun. It was one of Germany’s most effective light weapons against low-flying fighter-bombers and attack aircraft.',
    ),
    facts: [
      { k: K.country, v: t('Almanya', 'Germany') },
      { k: K.maker, v: t('Mauser', 'Mauser') },
      { k: K.service, v: t('1940', '1940') },
      { k: K.round, v: t('20 × 138 mm B', '20 × 138 mm B') },
      { k: K.rate, v: t('Dakikada yaklaşık 1.800 (dört namlu, seri), 700–800 (pratik)', 'About 1,800 rounds per minute (four barrels, cyclic), 700–800 (practical)') },
      { k: K.feed, v: t('Namlu başına 20 mermilik şarjör', 'A 20-round magazine per barrel') },
    ],
    sections: [
      {
        h: t('Dört namlu, bir nişancı', 'Four barrels, one gunner'),
        p: [
          t(
            'Tek bir 20 mm’nin bir uçağı düşürecek kadar isabet alması zordu; çözüm, aynı nişancının dört topu birlikte yönetmesiydi. Flakvierling’de toplar ikişer ikişer üst üste dizilir, nişancı ortadaki koltuktan hepsini birlikte çevirir ve ateşler. Her top kendi şarjörüyle beslendiği için mürettebat şarjörleri sırayla değiştirerek ateşi sürdürebilirdi.',
            'It was hard for a single 20 mm to score enough hits to bring down an aircraft; the answer was for one gunner to control four guns at once. On the Flakvierling the guns are arranged in pairs, one above the other, and the gunner traverses and fires them all from the central seat. Since each gun had its own magazine, the crew could keep firing by changing magazines in turn.',
          ),
        ],
      },
      {
        h: t('Araçlarda ve gemilerde', 'On vehicles and ships'),
        p: [
          t(
            'Flakvierling çekili lafetinin yanı sıra yarı paletli araçlara, demiryolu uçaksavar vagonlarına, gemilere ve denizaltıların kulelerine kuruldu. 1944’te Panzer IV gövdesi üzerine açık tepeli bir kuleyle yerleştirilerek Flakpanzer IV “Wirbelwind” (kasırga) yapıldı.',
            'Besides its towed mount, the Flakvierling was fitted to half-tracks, railway flak wagons, ships and submarine conning towers. In 1944 it was placed in an open-topped turret on a Panzer IV hull to create the Flakpanzer IV “Wirbelwind” (whirlwind).',
          ),
          t(
            'Müttefik pilotları alçak irtifada en çok bu tür hafif silahlardan kayıp verdi: ağır flakın yetişemediği yükseklikte, birkaç saniyelik yoğun ateş bir taarruz uçağını düşürmeye yetebiliyordu.',
            'Allied pilots suffered many of their low-level losses to light weapons like this: at heights the heavy flak could not cover, a few seconds of dense fire could be enough to bring down an attack aircraft.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda dört namlu birlikte atar: birkaç saniyelik seride tek Flak 38’in dört katı mermi gönderir. Alçaktan gelen taarruz uçağına karşı en tehlikeli hafif silahtır; izli mermisi Flak 38’inki gibi yaklaşık 2,2 km’de kendini imha eder.',
        'In the game all four barrels fire together, sending four times as many shells as a single Flak 38 in a burst of a few seconds. It is the most dangerous light weapon against low attackers; like the Flak 38, its tracer self-destructs at about 2.2 km.',
      ),
    ],
  },
  {
    id: 'aa37',
    name: t('3,7 cm Flak 36', '3.7 cm Flak 36'),
    summary: t(
      'Alman orta uçaksavar topu: 20 mm’nin yetişemediği, ağır topların hızlı izleyemediği yüksekliği kapatır.',
      'The German medium anti-aircraft gun, covering heights the 20 mm cannot reach and heavy guns cannot track quickly.',
    ),
    lead: t(
      '3,7 cm Flak 36, Rheinmetall’in 37 mm’lik orta uçaksavar topudur. 1935’te hizmete giren Flak 18’in taşıyıcısı ve lafeti yenilenmiş biçimidir. 20 mm’lik topların menzilinin bittiği, ağır topların ise alçakta hızlı geçen uçağı izlemekte zorlandığı orta yükseklik için kullanıldı. Tek bir 37 mm’lik isabet küçük bir uçağı ağır yaralayabiliyordu.',
      'The 3.7 cm Flak 36 is Rheinmetall’s 37 mm medium anti-aircraft gun, a version of the Flak 18 of 1935 with a new carriage and mount. It was used at medium heights, where the range of 20 mm guns ran out and heavy guns struggled to track aircraft passing quickly at low level. A single 37 mm hit could badly damage a small aircraft.',
    ),
    facts: [
      { k: K.country, v: t('Almanya', 'Germany') },
      { k: K.maker, v: t('Rheinmetall-Borsig', 'Rheinmetall-Borsig') },
      { k: K.service, v: t('1936 (Flak 18: 1935)', '1936 (Flak 18: 1935)') },
      { k: K.round, v: t('37 × 263 mm B', '37 × 263 mm B') },
      { k: K.rate, v: t('Dakikada yaklaşık 160 (seri), pratikte 80–120', 'About 160 rounds per minute (cyclic), 80–120 in practice') },
      { k: K.feed, v: t('6 mermilik tarak, elle', '6-round clip, hand-fed') },
    ],
    sections: [
      {
        h: t('Orta yükseklik boşluğu', 'The medium-height gap'),
        p: [
          t(
            'Hafif toplar birkaç kilometreden sonra etkisizleşir, ağır toplar ise ağır döner ve zaman tapası ayarlamak için zaman ister. Arada, birkaç yüz metreyle üç-dört kilometre arasında uçan dalış bombardıman ve taarruz uçakları için daha büyük mermili ama yine hızlı atan bir top gerekiyordu.',
            'Light guns become ineffective after a few kilometres, while heavy guns traverse slowly and need time to set their time fuzes. In between, against dive bombers and attack aircraft flying from a few hundred metres to three or four kilometres up, a gun with a bigger shell that still fired quickly was needed.',
          ),
          t(
            'Rheinmetall’in 3,7 cm Flak 18’i bu işi gördü; Flak 36 aynı topu daha yeni bir taşıyıcı ve lafetle, Flak 37 de yeni bir nişangâhla getirdi. Mermiler altışarlık taraklarla elle doldurulurdu; izli mermi belli bir sürenin sonunda kendini imha ederek dost mevzilere düşmezdi.',
            'Rheinmetall’s 3.7 cm Flak 18 filled this role; the Flak 36 brought the same gun with a newer carriage and mount, and the Flak 37 added a new sight. Rounds were hand-loaded in clips of six, and the tracer self-destructed after a set time so that it did not fall on friendly positions.',
          ),
        ],
      },
      {
        h: t('Kullanımı', 'In service'),
        p: [
          t(
            'Flak 36 çekili olarak, yarı paletli araçların üstünde, gemilerde ve sabit mevzilerde kullanıldı. Savaşın sonlarına doğru daha hızlı atan 3,7 cm Flak 43 geldi; ama Flak 36 ve 37 savaşın sonuna kadar hizmette kaldı.',
            'The Flak 36 was used towed, mounted on half-tracks, aboard ships and in fixed positions. Towards the end of the war the faster-firing 3.7 cm Flak 43 arrived, but the Flak 36 and 37 stayed in service until the end.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda 6’lık taraklarla elle beslenir. İzli mermisi 4,2 km’de kendini imha eder ve patladığı yerde parça saçar. Orta top olduğu için atış hesaplayıcıdan ve yakınlık tapasından da yararlanır.',
        'In the game it is hand-fed in 6-round clips. Its tracer self-destructs at 4.2 km and scatters splinters where it bursts. As a medium gun it also benefits from the predictor and the proximity fuze.',
      ),
    ],
  },
  {
    id: 'aa40',
    name: t('Bofors 40 mm L/60', 'Bofors 40 mm L/60'),
    summary: t(
      'İsveç tasarımı 40 mm: savaşın iki tarafında da kullanılan, en yaygın orta uçaksavar topu.',
      'The Swedish-designed 40 mm: the most widespread medium anti-aircraft gun, used by both sides in the war.',
    ),
    lead: t(
      'Bofors 40 mm L/60, İsveçli AB Bofors’un 1930’ların başında geliştirdiği otomatik uçaksavar topudur. Adındaki L/60, namlunun kalibresinin 60 katı uzunlukta olduğunu söyler. Hızlı atışı, ağır mermisi ve sağlamlığıyla İkinci Dünya Savaşı’nın en yaygın orta uçaksavar topu oldu: Müttefikler de Mihver devletleri de kullandı, birçok ülkede lisansla üretildi. Geliştirilmiş biçimleri bugün de kullanılmaktadır.',
      'The Bofors 40 mm L/60 is an automatic anti-aircraft gun developed by the Swedish company AB Bofors in the early 1930s. The L/60 in its name means the barrel is 60 calibres long. With its high rate of fire, heavy shell and robustness it became the most widespread medium anti-aircraft gun of the Second World War: both the Allies and the Axis used it, and it was built under licence in many countries. Improved versions are still in use today.',
    ),
    facts: [
      { k: K.country, v: t('İsveç (tasarım); lisansla Birleşik Krallık, ABD ve başka ülkeler', 'Sweden (design); under licence in Britain, the USA and other countries') },
      { k: K.maker, v: t('AB Bofors', 'AB Bofors') },
      { k: K.service, v: t('1934', '1934') },
      { k: K.round, v: t('40 × 311 mm R', '40 × 311 mm R') },
      { k: K.shell, v: t('Yaklaşık 0,9 kg', 'About 0.9 kg') },
      { k: K.rate, v: t('Dakikada yaklaşık 120', 'About 120 rounds per minute') },
      { k: K.feed, v: t('4 mermilik tarak, sürekli beslenir', '4-round clips, fed continuously') },
    ],
    sections: [
      {
        h: t('İsveç’ten dünyaya', 'From Sweden to the world'),
        p: [
          t(
            'İsveç donanması, uçaklara karşı hızlı atan ve tek mermisi etkili olan bir top istedi. Bofors’un 40 mm’lik topu mermileri dört mermilik taraklarla üstten alır; yükleyiciler tarakları arka arkaya koydukça top durmadan atabilir.',
            'The Swedish navy wanted a fast-firing gun whose single shell would be effective against aircraft. The Bofors 40 mm takes its rounds from above in four-round clips; as long as the loaders keep dropping clips in, the gun can keep firing.',
          ),
          t(
            'Savaştan önce Polonya, Macaristan, Finlandiya ve Birleşik Krallık bu topu satın aldı ya da lisansla üretti. ABD 1940–41’de benimsedi ve büyük ölçekte üretti. Almanya, Polonya ve Norveç’te ele geçirdiği Bofors’ları 4 cm Flak 28 adıyla kullandı.',
            'Before the war Poland, Hungary, Finland and Britain bought the gun or built it under licence. The United States adopted it in 1940–41 and produced it on a huge scale. Germany used Bofors guns captured in Poland and Norway under the name 4 cm Flak 28.',
          ),
        ],
      },
      {
        h: t('Karada ve denizde', 'On land and at sea'),
        p: [
          t(
            'İngiliz ordusunun hafif uçaksavar alayları Bofors’la donatıldı; çekili lafeti hızla mevziye girer, namlusu çabuk döner. ABD donanması ise topu ikili ve dörtlü kulelerde uçak gemilerine, zırhlılara ve muhriplere yerleştirdi.',
            'The British Army’s light anti-aircraft regiments were equipped with the Bofors; its towed mount came into action quickly and its barrel swung fast. The US Navy fitted the gun in twin and quadruple mounts to carriers, battleships and destroyers.',
          ),
          t(
            'Pasifik’te, özellikle kamikaze saldırılarına karşı, 40 mm’lik merminin dalıştaki bir uçağı parçalayabilmesi Bofors’u gemilerin en değerli yakın savunma toplarından biri yaptı.',
            'In the Pacific, especially against kamikaze attacks, the 40 mm shell’s ability to break up an aircraft in its dive made the Bofors one of the most valued close-in guns on ships.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda 4’lük taraklarla sürekli beslenir ve namlusu hızlı döner; 0,9 kg’lık mermisiyle alçaktan geçen uçağı izleyebilir. İzli mermisi kendini imha ettiği yerde parça saçar; orta top olarak hesaplayıcı ve yakınlık tapasından yararlanır.',
        'In the game it is fed continuously with 4-round clips and its barrel swings fast; with its 0.9 kg shell it can follow a low aircraft. Its tracer scatters splinters where it self-destructs, and as a medium gun it benefits from the predictor and the proximity fuze.',
      ),
    ],
  },
  {
    id: 'aa88',
    name: t('8,8 cm Flak 36', '8.8 cm Flak 36'),
    summary: t(
      'Ünlü “Flak 88”: Alman ağır uçaksavar savunmasının temeli, aynı zamanda savaşın en bilinen tanksavar toplarından biri.',
      'The famous “Flak 88”: the backbone of German heavy anti-aircraft defence and one of the best-known anti-tank guns of the war.',
    ),
    lead: t(
      '8,8 cm Flak 36, Almanların “Acht-acht” (sekiz-sekiz) dediği, Türkçede çoğu zaman “88’lik” ya da “Flak 88” diye anılan ağır uçaksavar toplarının en yaygın biçimidir. Krupp’un 1933’te hizmete giren Flak 18’inin geliştirilmiş sürümüdür. Almanya’nın ağır uçaksavar savunmasının temeliydi; yüksek namlu hızı ve düz yörüngesi sayesinde savaşın en ünlü tanksavar toplarından biri olarak da kullanıldı.',
      'The 8.8 cm Flak 36 is the most common form of the heavy anti-aircraft guns the Germans called the “Acht-acht” (eight-eight) and that are widely known as the “88” or “Flak 88”. It is an improved version of Krupp’s Flak 18, which entered service in 1933. It was the backbone of German heavy anti-aircraft defence, and thanks to its high muzzle velocity and flat trajectory it was also used as one of the most famous anti-tank guns of the war.',
    ),
    facts: [
      { k: K.country, v: t('Almanya', 'Germany') },
      { k: K.maker, v: t('Krupp', 'Krupp') },
      { k: K.service, v: t('1936 (Flak 18: 1933)', '1936 (Flak 18: 1933)') },
      { k: K.shell, v: t('Yaklaşık 9 kg, zaman tapalı', 'About 9 kg, time-fuzed') },
      { k: K.mv, v: t('Yaklaşık 820 m/sn', 'About 820 m/s') },
      { k: K.rate, v: t('Dakikada 15–20', '15–20 rounds per minute') },
      { k: K.ceiling, v: t('Etkili yaklaşık 8.000 m', 'Effective about 8,000 m') },
      { k: K.crew, v: t('10', '10') },
    ],
    sections: [
      {
        h: t('Krupp’un 88’liği', 'Krupp’s 88'),
        p: [
          t(
            'Versay Antlaşması Almanya’nın ağır silah geliştirmesini kısıtladığı yıllarda Krupp’un tasarımcılarından bir kısmı İsveç’te Bofors’la birlikte çalıştı. Bu çalışmalardan çıkan 88 mm’lik uçaksavar topu, Almanya yeniden silahlanmaya başlayınca 1933’te Flak 18 adıyla hizmete girdi.',
            'In the years when the Treaty of Versailles restricted German heavy weapons development, some of Krupp’s designers worked with Bofors in Sweden. The 88 mm anti-aircraft gun that came out of this work entered service in 1933 as the Flak 18, once Germany began to rearm.',
          ),
          t(
            'Flak 36 1936’da geldi. En önemli farkı birkaç parçalı namlusuydu: en çabuk aşınan ön parça tek başına değiştirilebiliyordu. Flak 37 ise bataryanın atış kontrol cihazından gelen bilgileri gösteren yeni göstergelerle donatıldı.',
            'The Flak 36 arrived in 1936. Its main difference was a barrel made in several sections: the front section, which wore fastest, could be replaced on its own. The Flak 37 was fitted with new dials showing data from the battery’s fire-control director.',
          ),
        ],
      },
      {
        h: t('Batarya ateşi', 'Battery fire'),
        p: [
          t(
            'Ağır uçaksavar topları tek tek değil bataryalar hâlinde kullanılırdı. Bataryanın atış kontrol cihazı (Kommandogerät) hedefin yüksekliğini, hızını ve yönünü ölçer, merminin hedefe varacağı noktayı ve tapa süresini hesaplayıp toplara iletirdi. Mermi 8 km yüksekliğe 20 saniye kadar sürede çıktığı için, bu sürede rota değiştiren uçak kaçabiliyordu.',
            'Heavy anti-aircraft guns were used not singly but in batteries. The battery’s fire-control director (Kommandogerät) measured the target’s height, speed and heading, calculated where the shell would meet it and the fuze time, and passed the results to the guns. Because the shell took around 20 seconds to climb to 8 km, an aircraft that changed course in that time could escape.',
          ),
          t(
            'Bu yüzden düşürme başına harcanan mermi çok yüksekti; bazı kaynaklara göre savaşın sonlarında bir ağır bombardıman uçağı için ortalama 16.000 dolayında 88 mm’lik mermi atılıyordu. Flak’ın asıl etkisi bombardıman uçaklarını daha yükseğe çıkmaya ve dağınık bombalamaya zorlamasıydı; isabet alan uçaklar da çoğu zaman hasarla dönüyordu.',
            'The number of shells fired per kill was therefore very high; according to some sources, late in the war about 16,000 88 mm shells were fired on average for each heavy bomber brought down. Flak’s main effect was to force bombers higher and spoil their aim, and many of the aircraft it hit came home damaged.',
          ),
        ],
      },
      {
        h: t('Tanksavar topu olarak', 'As an anti-tank gun'),
        p: [
          t(
            '88’liğin yüksek namlu hızı onu yer hedeflerine karşı da korkunç bir silah yaptı. İspanya İç Savaşı’nda Kondor Lejyonu’yla denendi; 1940’ta Fransa’da ve sonra Kuzey Afrika’da, sıradan tanksavar toplarının işlemediği ağır zırhlı Müttefik tanklarına karşı kullanıldı. Tiger tankının topu da bu silahtan geliştirildi.',
            'The 88’s high muzzle velocity also made it a terrible weapon against ground targets. It was tried out with the Condor Legion in the Spanish Civil War, and in France in 1940 and later in North Africa it was used against heavily armoured Allied tanks that ordinary anti-tank guns could not stop. The Tiger tank’s gun was developed from this weapon.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda zaman tapalı mermisi 8 km’ye yaklaşık 20 saniyede çıkar; bu sürede rota değiştiren uçağı kaçırır. Tek topla isabet nadirdir; etkisi bataryaların çokluğundan ve telemetre, hesaplayıcı, radar gibi nişan aletlerinden gelir.',
        'In the game its time-fuzed shell takes about 20 seconds to reach 8 km and misses an aircraft that changes course in that time. Hits from a single gun are rare; its effect comes from massed batteries and from sights such as the rangefinder, predictor and radar.',
      ),
    ],
  },
  {
    id: 'aa90',
    name: t('90 mm M1', '90 mm M1'),
    summary: t(
      'ABD’nin ağır uçaksavar topu: radar ve yakınlık tapasıyla V-1 uçan bombalarına karşı başarılı oldu.',
      'The US heavy anti-aircraft gun that, with radar and proximity fuzes, did well against V-1 flying bombs.',
    ),
    lead: t(
      '90 mm M1, ABD ordusunun İkinci Dünya Savaşı’ndaki ağır uçaksavar topudur. 1940’ta kabul edildi; geliştirilmiş M1A1 ve M2 biçimleriyle savaş boyunca kullanıldı. 1944’te SCR-584 atış kontrol radarı, elektrikli atış hesaplayıcısı ve yakınlık tapasıyla birlikte kullanılınca savaşın en etkili ağır uçaksavar sistemlerinden biri oldu; İngiltere’nin güney kıyısında ve Anvers çevresinde V-1 uçan bombalarına karşı büyük başarı gösterdi.',
      'The 90 mm M1 was the US Army’s heavy anti-aircraft gun of the Second World War. It was adopted in 1940 and served throughout the war in its improved M1A1 and M2 forms. Used in 1944 with the SCR-584 fire-control radar, an electrical director and the proximity fuze, it became one of the most effective heavy anti-aircraft systems of the war, with great success against V-1 flying bombs on the south coast of England and around Antwerp.',
    ),
    facts: [
      { k: K.country, v: t('ABD', 'USA') },
      { k: K.service, v: t('Mart 1940’ta kabul edildi', 'Adopted in March 1940') },
      { k: K.shell, v: t('Yaklaşık 10,6 kg', 'About 10.6 kg') },
      { k: K.mv, v: t('Yaklaşık 820 m/sn', 'About 820 m/s') },
      { k: K.rate, v: t('Dakikada yaklaşık 20 (M1A1)', 'About 20 rounds per minute (M1A1)') },
    ],
    sections: [
      {
        h: t('Daha büyük bir top', 'A bigger gun'),
        p: [
          t(
            'ABD ordusunun 1930’lardaki ağır uçaksavar topu 3 inçlik (76 mm) M3’tü. Bombardıman uçakları hızlanıp yükseldikçe daha güçlü bir top gerekti ve 90 mm’lik M1 1940’ta kabul edildi. Top dört açılır kollu, yuvarlak platformlu bir lafete oturur; mevziye girince tekerlekler kaldırılır ve top kolların üstünde durur.',
            'The US Army’s heavy anti-aircraft gun in the 1930s was the 3-inch (76 mm) M3. As bombers grew faster and flew higher a more powerful gun was needed, and the 90 mm M1 was adopted in 1940. The gun sits on a mount with four folding outriggers and a round platform; when it goes into action the wheels are lifted and the gun rests on the outriggers.',
          ),
          t(
            'M1A1’e yaylı bir mermi itici ve uzaktan kumandayla çevrilebilen bir lafet eklendi; böylece toplar atış hesaplayıcısından gelen bilgiyle kendiliğinden yönlendirilebildi. Savaşın sonlarında gelen M2 lafeti topu ayrıca yer hedeflerine de ateş edebilir hâle getirdi.',
            'The M1A1 added a spring rammer and a mount that could be driven by remote control, so the guns could be laid automatically from the director’s data. The M2 mount that came late in the war also allowed the gun to fire at ground targets.',
          ),
        ],
      },
      {
        h: t('Radar ve yakınlık tapası', 'Radar and the proximity fuze'),
        p: [
          t(
            '1944 yazında Almanya V-1 uçan bombalarını Londra’ya ve sonra Anvers’e göndermeye başladı. Mikrodalga SCR-584 radarı hedefi izliyor, M9 elektrikli hesaplayıcı topları yönlendiriyor, yakınlık tapası da merminin hedefin yanından geçerken patlamasını sağlıyordu. Bu sistemle 90 mm’lik bataryaların düşürme oranı büyük ölçüde arttı.',
            'In the summer of 1944 Germany began launching V-1 flying bombs at London and later at Antwerp. The microwave SCR-584 radar tracked the target, the M9 electrical director laid the guns, and the proximity fuze made the shell burst as it passed near the target. With this system the kill rate of the 90 mm batteries rose sharply.',
          ),
          t(
            'Topun kendisi de başka silahlara temel oldu: M26 Pershing tankının ve M36 tank avcısının 90 mm’lik topu bu uçaksavar topundan geliştirildi.',
            'The gun itself also became the basis for other weapons: the 90 mm gun of the M26 Pershing tank and the M36 tank destroyer was developed from this anti-aircraft gun.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda dakikada 20 atış yapar ve zaman tapalı mermiyle ateş eder. Ağır toplar arasında nişan aletlerinden en çok yararlananlardandır: atış kontrol radarı ve yakınlık tapasıyla isabeti belirgin biçimde artar.',
        'In the game it fires 20 rounds a minute with time-fuzed shells. It is among the heavy guns that gain most from sights: the gun-laying radar and the proximity fuze raise its hit rate markedly.',
      ),
    ],
  },
  {
    id: 'aa41',
    name: t('8,8 cm Flak 41', '8.8 cm Flak 41'),
    summary: t(
      '88’liğin yeni nesli: 1.000 m/sn namlu hızı, 11 km’yi aşan etkili tavan; ama yalnız 556 adet üretildi.',
      'The new generation of the 88: 1,000 m/s muzzle velocity and an effective ceiling above 11 km, but only 556 were built.',
    ),
    lead: t(
      '8,8 cm Flak 41, Rheinmetall-Borsig’in Flak 36’nın yerini alması için geliştirdiği yeni nesil 88 mm’lik uçaksavar topudur. Daha uzun kovanlı fişeği ve uzun namlusuyla 1.000 m/sn namlu hızına ulaşır; mermisi daha yükseğe ve daha kısa sürede çıkar. Ama karmaşık ve pahalıydı: ilk toplar 1943’te teslim edildi ve yalnız 556 adet üretildi, çoğu Almanya’nın kendi hava savunmasında kullanıldı.',
      'The 8.8 cm Flak 41 is the new-generation 88 mm anti-aircraft gun that Rheinmetall-Borsig developed to replace the Flak 36. With a longer-cased cartridge and a long barrel it reaches a muzzle velocity of 1,000 m/s, and its shell climbs higher in less time. But it was complex and expensive: the first guns were delivered in 1943, only 556 were built, and most served in the air defence of Germany itself.',
    ),
    facts: [
      { k: K.country, v: t('Almanya', 'Germany') },
      { k: K.maker, v: t('Rheinmetall-Borsig', 'Rheinmetall-Borsig') },
      { k: K.service, v: t('1943 (ilk teslimat)', '1943 (first deliveries)') },
      { k: K.mv, v: t('Yaklaşık 1.000 m/sn', 'About 1,000 m/s') },
      { k: K.rate, v: t('Dakikada 20–25', '20–25 rounds per minute') },
      { k: K.ceiling, v: t('Etkili yaklaşık 11.300 m', 'Effective about 11,300 m') },
      { k: K.built, v: t('556', '556') },
    ],
    sections: [
      {
        h: t('Daha yükseğe, daha çabuk', 'Higher and faster'),
        p: [
          t(
            'Luftwaffe, 1939’da daha yükseğe ulaşan bir ağır uçaksavar topu istedi. Flak 36’nın etkili tavanı yaklaşık 8 km’ydi ve mermi bu yüksekliğe çıkana kadar uçak birkaç kilometre yol alıyordu. Flak 41’in daha güçlü fişeği, merminin hem daha yükseğe çıkmasını hem de hedefe daha çabuk varmasını sağladı; böylece hesaplanan noktadan sapma azaldı.',
            'In 1939 the Luftwaffe asked for a heavy anti-aircraft gun that reached higher. The Flak 36 had an effective ceiling of about 8 km, and by the time its shell got there an aircraft had flown several kilometres. The Flak 41’s more powerful cartridge let the shell climb higher and reach the target sooner, reducing the error from the calculated point.',
          ),
          t(
            'Top, alçak bir döner tabla üstüne oturur ve yüksek bir kalkan taşır; bu yüzden Flak 36’dan kolay ayırt edilir.',
            'The gun sits on a low turntable and carries a tall shield, which makes it easy to tell apart from the Flak 36.',
          ),
        ],
      },
      {
        h: t('Az ve geç', 'Too few, too late'),
        p: [
          t(
            'Geliştirme uzun sürdü ve ilk toplarda boş kovanların çıkarılmasında sorunlar yaşandı. Üretim pahalıydı ve sınırlı kaldı; 556 adetle Flak 36’nın yerini alamadı. Toplar daha çok Müttefik bombardıman uçaklarının yöneldiği Almanya’nın sanayi bölgelerinin savunmasına verildi.',
            'Development took a long time and the early guns had trouble extracting spent cases. Production was expensive and stayed limited; with 556 built it could not replace the Flak 36. The guns went mostly to the defence of Germany’s industrial regions, which Allied bombers were targeting.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda 1.000 m/sn’lik namlu hızıyla mermisi tavana Flak 36’nınkinden çok daha çabuk çıkar; etkili tavanı 11,3 km’dir. Gerçekte olduğu gibi pahalı bir toptur ve araştırma ağacının sonlarında açılır.',
        'In the game its 1,000 m/s muzzle velocity gets the shell to altitude much sooner than the Flak 36, and its effective ceiling is 11.3 km. As in reality it is an expensive gun, unlocked late in the research tree.',
      ),
    ],
  },
  {
    id: 'aa128',
    name: t('12,8 cm Flak 40', '12.8 cm Flak 40'),
    summary: t(
      'Almanya’nın en ağır uçaksavar topu: flak kulelerinin tepesinde ikiz kuleler hâlinde kullanıldı.',
      'Germany’s heaviest anti-aircraft gun, used in twin mounts on top of the flak towers.',
    ),
    lead: t(
      '12,8 cm Flak 40, Almanya’nın savaşta yaygın olarak kullandığı en ağır uçaksavar topudur. 26 kg’lık mermisini çok yükseğe atabiliyordu ve geniş bir alana parça saçıyordu. Ama taşınması zor olduğu için çoğunlukla sabit mevzilerde, demiryolu vagonlarında ve Berlin, Hamburg ve Viyana’daki dev beton flak kulelerinin tepesinde, ikiz toplu kuleler (Flakzwilling 40) hâlinde kullanıldı.',
      'The 12.8 cm Flak 40 is the heaviest anti-aircraft gun Germany used in numbers during the war. It could throw its 26 kg shell very high and spread splinters over a wide area. Because it was hard to move, however, it was used mostly in fixed positions, on railway wagons and, as twin-gun mounts (Flakzwilling 40), on top of the huge concrete flak towers of Berlin, Hamburg and Vienna.',
    ),
    facts: [
      { k: K.country, v: t('Almanya', 'Germany') },
      { k: K.maker, v: t('Rheinmetall-Borsig', 'Rheinmetall-Borsig') },
      { k: K.service, v: t('1942', '1942') },
      { k: K.shell, v: t('Yaklaşık 26 kg', 'About 26 kg') },
      { k: K.mv, v: t('Yaklaşık 880 m/sn', 'About 880 m/s') },
      { k: K.rate, v: t('Dakikada 10–12', '10–12 rounds per minute') },
    ],
    sections: [
      {
        h: t('Çok ağır bir top', 'A very heavy gun'),
        p: [
          t(
            '12,8 cm’lik top başlangıçta çekili bir silah olarak düşünüldü; ama ağırlığı yüzünden bu biçim pratik olmadı. Toplar sabit beton mevzilere ve demiryolu vagonlarına yerleştirildi. Bu büyüklükte bir topun mermisi ve namlusu elle kolayca yönetilemediği için doldurma ve nişan almada güç tahrikinden yararlanılırdı.',
            'The 12.8 cm gun was first conceived as a towed weapon, but its weight made that impractical. The guns were placed in fixed concrete emplacements and on railway wagons. Because the shell and barrel of a gun this size could not easily be handled by hand, powered drives were used for loading and laying.',
          ),
        ],
      },
      {
        h: t('Flak kuleleri', 'The flak towers'),
        p: [
          t(
            'Berlin, Hamburg ve Viyana’da savaş sırasında dev beton flak kuleleri (Flaktürme) yapıldı. Kulelerin tepesindeki ikiz 12,8 cm’lik toplar şehirlerin üstüne gelen bombardıman uçaklarına ateş ederken, kulelerin içi binlerce sivil için sığınak oldu. Kulelerin birçoğu bugün de ayaktadır.',
            'Huge concrete flak towers (Flaktürme) were built in Berlin, Hamburg and Vienna during the war. While the twin 12.8 cm guns on top fired at the bombers over the cities, the interiors sheltered thousands of civilians. Many of the towers still stand today.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda en ağır toptur: 26 kg’lık mermisi çok yükseğe çıkar ve parça yarıçapı geniştir. Ama dakikada ancak 10–12 atış yapar ve namlusu çok yavaş döner; hızla geçen uçağı izleyemez.',
        'In the game it is the heaviest gun: its 26 kg shell climbs very high with a wide splinter radius. But it fires only 10–12 rounds a minute and its barrel turns very slowly, so it cannot follow a fast-crossing aircraft.',
      ),
    ],
  },
];
