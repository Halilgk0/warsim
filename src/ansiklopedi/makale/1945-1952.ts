// Ansiklopedi makaleleri, 1945–1952 uçakları (katalog yılına göre): savaşın son pervanelileri ve ilk jetler.

import { K, t, type Article } from '../tur';

export const A1945_1952: Article[] = [
  {
    id: 'meteor3',
    summary: t(
      'Müttefiklerin savaşta kullandığı tek jet avcısı; ilk işi V-1 uçan bombalarını avlamaktı.',
      'The only Allied jet fighter used in the war; its first job was hunting V-1 flying bombs.',
    ),
    lead: t(
      'Gloster Meteor, İngiltere’nin ilk jet avcısı ve İkinci Dünya Savaşı’nda muharebeye giren tek Müttefik jetidir. Düz kanatlı, iki motorlu Meteor 1944 yazında V-1 uçan bombalarına karşı kullanıldı. Savaştan sonra hız rekorları kırdı ve onlarca hava kuvvetinde uçtu.',
      'The Gloster Meteor was Britain’s first jet fighter and the only Allied jet to see combat in the Second World War. The straight-winged, twin-engined Meteor was used against V-1 flying bombs in the summer of 1944. After the war it set speed records and flew with dozens of air forces.',
    ),
    facts: [
      { k: K.first, v: t('5 Mart 1943', '5 March 1943') },
      { k: K.service, v: t('Temmuz 1944 (F.1); F.3 1944 sonu', 'July 1944 (F.1); the F.3 at the end of 1944') },
      { k: K.designer, v: t('George Carter (Gloster)', 'George Carter (Gloster)') },
      { k: K.maker, v: t('Gloster; sonra Armstrong Whitworth da', 'Gloster; later Armstrong Whitworth as well') },
      { k: K.built, v: t('Yaklaşık 3.900 (bütün sürümler)', 'About 3,900 (all variants)') },
      { k: K.engine, v: t('2 × Rolls-Royce Derwent I, santrifüj akışlı turbojet, her biri 8,9 kN', '2 × Rolls-Royce Derwent I centrifugal-flow turbojets, 8.9 kN each') },
      { k: K.speed, v: t('Yaklaşık 790 km/sa', 'About 790 km/h') },
      { k: K.guns, v: t('Burunda 4 × 20 mm Hispano', '4 × 20 mm Hispano in the nose') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('13,11 m / 12,57 m', '13.11 m / 12.57 m') },
    ],
    sections: [
      {
        h: t('V-1 avcısı', 'V-1 hunter'),
        p: [
          t(
            'Meteor’un ilk birliği, Temmuz 1944’te Londra’ya fırlatılan V-1 uçan bombalarına karşı görevlendirildi. Ağustos 1944’te topları tutukluk yapan bir Meteor pilotu, kanat ucunu bir V-1’in kanadının altına sokup onu devirerek düşürdü. Savaşın son aylarında Meteor’lar Avrupa’ya da gönderildi, ama bir Me 262 ile hiç karşılaşmadılar.',
            'The Meteor’s first squadron was sent against the V-1 flying bombs launched at London in July 1944. In August 1944 a Meteor pilot whose guns had jammed brought down a V-1 by sliding his wingtip under its wing and tipping it over. In the last months of the war Meteors were sent to Europe too, but they never met an Me 262.',
          ),
        ],
      },
      {
        h: t('Savaştan sonra', 'After the war'),
        p: [
          t(
            'Kasım 1945’te özel hazırlanmış bir Meteor dünya hız rekorunu kırdı. Meteor sonraki on yılda RAF’ın ve birçok hava kuvvetinin ana jet avcısı oldu; Kore’de Avustralya birlikleriyle savaştı, ama ok kanatlı MiG-15 karşısında geride kaldı ve kara saldırısına kaydırıldı.',
            'In November 1945 a specially prepared Meteor set a world speed record. Over the next decade the Meteor was the main jet fighter of the RAF and many other air forces; it fought in Korea with Australian squadrons, but was outclassed by the swept-wing MiG-15 and moved to ground attack.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ilk İngiliz jetidir: pervanelilerden çok hızlıdır ve burnunda dört 20 mm top taşır. Erken jet motorları gaz koluna geç tepki verir; yavaşken hantaldır, hızını kaybetmemek gerekir.',
        'In the game it is the first British jet: much faster than the piston aircraft, with four 20 mm cannon in the nose. Its early jet engines respond slowly to the throttle; it is sluggish when slow, so it must keep its speed up.',
      ),
    ],
  },
  {
    id: 'f8f',
    summary: t(
      'En küçük gövdeye en büyük motor: tırmanışta ilk jetlerle yarışan son Grumman pervanelisi.',
      'The biggest engine in the smallest airframe: the last Grumman piston fighter, climbing like the early jets.',
    ),
    lead: t(
      'Grumman F8F Bearcat, olabildiğince küçük ve hafif bir gövdeye Hellcat’in dev R-2800 motorunu takarak yapılmış bir uçak gemisi avcısıdır. Tırmanışı ilk jetlerle yarışacak kadar iyiydi. Savaşa yetişmedi, ama pervaneli avcıların en iyilerinden biri sayılır; değiştirilmiş bir Bearcat 1989’da pervaneli uçaklar için dünya hız rekorunu kırdı.',
      'The Grumman F8F Bearcat was a carrier fighter made by fitting the Hellcat’s huge R-2800 engine into the smallest, lightest airframe possible. It climbed well enough to rival the early jets. It arrived too late for the war, but is counted among the best piston fighters; a modified Bearcat set the world speed record for piston-engined aircraft in 1989.',
    ),
    facts: [
      { k: K.first, v: t('21 Ağustos 1944', '21 August 1944') },
      { k: K.service, v: t('Mayıs 1945', 'May 1945') },
      { k: K.maker, v: t('Grumman', 'Grumman') },
      { k: K.built, v: t('Yaklaşık 1.265', 'About 1,265') },
      { k: K.engine, v: t('Pratt & Whitney R-2800-34W Double Wasp, 18 silindirli çift sıralı yıldız, yaklaşık 2.100 bg', 'Pratt & Whitney R-2800-34W Double Wasp, 18-cylinder twin-row radial, about 2,100 hp') },
      { k: K.speed, v: t('Yaklaşık 680 km/sa', 'About 680 km/h') },
      { k: K.guns, v: t('Kanatlarda 4 × 12,7 mm M2 Browning', '4 × .50 in M2 Browning in the wings') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('10,92 m / 8,61 m', '10.92 m / 8.61 m') },
    ],
    sections: [
      {
        h: t('Kamikazelere karşı', 'Against the kamikazes'),
        p: [
          t(
            'ABD Donanması, kamikaze saldırılarına karşı küçük uçak gemilerinden de kalkabilecek, çok hızlı tırmanan bir önleme avcısı istiyordu. Grumman, Hellcat’in motorunu çok daha küçük bir gövdeye taktı; kabarcık kokpit ve hafif yapı Bearcat’i hem çevik hem de çok hızlı tırmanır yaptı. İlk birlik 1945 baharında hazırdı, ama savaş biterken henüz muharebeye girmemişti.',
            'The US Navy wanted an interceptor that climbed very fast and could also fly from small carriers, to counter the kamikaze attacks. Grumman fitted the Hellcat’s engine into a much smaller airframe; the bubble canopy and light structure made the Bearcat both agile and an outstanding climber. The first squadron was ready in the spring of 1945, but had not yet seen combat when the war ended.',
          ),
        ],
      },
      {
        h: t('Rekorlar ve Çinhindi', 'Records and Indochina'),
        p: [
          t(
            'Bearcat, ABD Donanması’nın gösteri takımı Blue Angels’ın ilk uçaklarından biriydi. Fransa onu Çinhindi Savaşı’nda kullandı; Tayland’ın hava kuvvetlerinde de uçtu. Yarış için değiştirilen “Rare Bear” adlı Bearcat, 1989’da pervaneli uçaklar için dünya hız rekorunu kırdı.',
            'The Bearcat was one of the first aircraft of the US Navy’s display team, the Blue Angels. France used it in the Indochina War, and it also flew with the Thai air force. A Bearcat modified for racing, “Rare Bear”, set the world speed record for piston-engined aircraft in 1989.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji avcısıdır ve araştırma ağacının ikinci aşamasındadır: tırmanışı çok güçlüdür, çok çeviktir ve acil güç kullanabilir. Dört 12,7 mm makinelisi vardır; menzili kısadır.',
        'In the game it is an energy fighter in the second stage of the research tree: it climbs very strongly, is very agile and has emergency power. It has four .50 in guns and a short range.',
      ),
    ],
  },
  {
    id: 'f4u4',
    summary: t(
      'Ters martı kanatlı Corsair: Pasifik’ten Kore’ye uzanan uzun bir hizmet.',
      'The gull-winged Corsair: a long career from the Pacific to Korea.',
    ),
    lead: t(
      'Vought F4U Corsair, ters martı kanadı ve upuzun burnuyla kolayca tanınan bir avcı ve avcı-bombardıman uçağıdır. Saatte 400 milin üstüne çıkan ilk Amerikan tek motorlu avcısıydı. Pasifik’te önce Deniz Piyadeleri’nin kara üslerinden savaştı; savaştan sonra Kore’de yakın hava desteğinin belkemiği oldu ve üretimi 1953’e kadar sürdü.',
      'The Vought F4U Corsair, instantly recognisable by its inverted gull wing and very long nose, was a fighter and fighter-bomber. It was the first American single-engined fighter to exceed 400 mph. In the Pacific it fought first from Marine Corps land bases; after the war it was the backbone of close air support in Korea, and production continued until 1953.',
    ),
    facts: [
      { k: K.first, v: t('29 Mayıs 1940 (XF4U-1)', '29 May 1940 (XF4U-1)') },
      { k: K.service, v: t('1942; F4U-4 1945', '1942; the F4U-4 in 1945') },
      { k: K.designer, v: t('Rex Beisel (Vought)', 'Rex Beisel (Vought)') },
      { k: K.maker, v: t('Vought; lisansla Goodyear ve Brewster', 'Vought; under licence by Goodyear and Brewster') },
      { k: K.built, v: t('Yaklaşık 12.500 (bütün sürümler)', 'About 12,500 (all variants)') },
      { k: K.engine, v: t('Pratt & Whitney R-2800-18W, 18 silindirli çift sıralı yıldız, yaklaşık 2.100 bg', 'Pratt & Whitney R-2800-18W, 18-cylinder twin-row radial, about 2,100 hp') },
      { k: K.speed, v: t('Yaklaşık 720 km/sa', 'About 720 km/h') },
      { k: K.guns, v: t('Kanatlarda 6 × 12,7 mm M2 Browning; bomba ve HVAR roket', '6 × .50 in M2 Browning in the wings; bombs and HVAR rockets') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('12,5 m / 10,27 m', '12.5 m / 10.27 m') },
    ],
    sections: [
      {
        h: t('Ters martı kanat', 'The inverted gull wing'),
        p: [
          t(
            'Corsair’in dev R-2800 motoru çok büyük bir pervane döndürüyordu. Pervanenin yere değmemesi için iniş takımı uzun olmalıydı; ters martı kanat, iniş takımını kısa ve sağlam tutarken pervaneye yer açtı. Uzun burun ise iniş sırasında pilotun önünü görmesini zorlaştırıyordu; uçak bu yüzden uçak gemilerinde kullanılmaya ancak sonradan alındı.',
            'The Corsair’s huge R-2800 engine turned a very large propeller. To keep it clear of the ground, the undercarriage had to be long; the inverted gull wing made room for the propeller while keeping the undercarriage short and strong. The long nose made it hard for the pilot to see ahead when landing, which is why the aircraft was only later cleared for carrier operations.',
          ),
        ],
      },
      {
        h: t('Pasifik, Kore ve son dalaşlar', 'The Pacific, Korea and the last dogfights'),
        p: [
          t(
            'Deniz Piyadeleri Corsair’le Solomon Adaları’nda savaştı; Gregory “Pappy” Boyington’ın “Kara Koyun” filosu bunların en ünlüsüdür. Kore’de Corsair’ler kara birliklerine yakın destek verdi. 1969’da Honduras ile El Salvador arasındaki kısa savaşta Corsair’ler Mustang’lerle karşılaştı: bunlar pervaneli avcılar arasındaki son hava muharebeleriydi.',
            'The Marines fought with the Corsair in the Solomon Islands; Gregory “Pappy” Boyington’s “Black Sheep” squadron is the most famous. In Korea, Corsairs flew close support for the ground troops. In the short war between Honduras and El Salvador in 1969, Corsairs met Mustangs in what were the last air battles between piston-engined fighters.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ağır hattadır ve araştırma ağacının ikinci aşamasındadır. Hızlıdır, dayanıklıdır ve çok yük taşır; iki kademeli kompresörü yüksekte de güç verir. Altı 12,7 mm makinelisi vardır; bomba ve roketle kara hedeflerine gönderilebilir.',
        'In the game it is in the heavy line, in the second stage of the research tree. It is fast, tough and carries a large load; its two-stage supercharger gives it power high up too. It has six .50 in guns and can be sent against ground targets with bombs and rockets.',
      ),
    ],
  },
  {
    id: 'b29',
    summary: t(
      'Basınçlı kabinli dev stratejik bombardıman: pervaneli dönemin zirvesi.',
      'The giant pressurised strategic bomber: the peak of the piston era.',
    ),
    lead: t(
      'Boeing B-29 Superfortress, İkinci Dünya Savaşı’nın en gelişmiş bombardıman uçağıdır: basınçlı kabin, uzaktan kumandalı taretler ve dev Wright R-3350 motorları. Geliştirilmesi Manhattan Projesi’nden de pahalıya mal oldu. Japonya’ya karşı stratejik bombardımanı yürüttü; Hiroşima ve Nagazaki’ye atom bombalarını B-29’lar attı.',
      'The Boeing B-29 Superfortress was the most advanced bomber of the Second World War: a pressurised cabin, remotely controlled turrets and huge Wright R-3350 engines. Its development cost more than the Manhattan Project. It carried out the strategic bombing of Japan, and B-29s dropped the atomic bombs on Hiroshima and Nagasaki.',
    ),
    facts: [
      { k: K.first, v: t('21 Eylül 1942', '21 September 1942') },
      { k: K.service, v: t('1944', '1944') },
      { k: K.maker, v: t('Boeing; lisansla Bell ve Martin', 'Boeing; under licence by Bell and Martin') },
      { k: K.built, v: t('Yaklaşık 3.970', 'About 3,970') },
      { k: K.engine, v: t('4 × Wright R-3350 Duplex-Cyclone, 18 silindirli, turbo kompresörlü, her biri yaklaşık 2.200 bg', '4 × Wright R-3350 Duplex-Cyclone, 18-cylinder, turbo-supercharged, about 2,200 hp each') },
      { k: K.speed, v: t('Yaklaşık 575 km/sa, 7.600 m’de', 'About 575 km/h at 7,600 m') },
      { k: K.guns, v: t('Merkezi atış kontrollü, uzaktan kumandalı taretlerde 10–12 × 12,7 mm; 9.000 kg’a kadar bomba', '10–12 × .50 in in remotely controlled turrets with central fire control; up to 9,000 kg of bombs') },
      { k: K.crew, v: t('11', '11') },
      { k: K.size, v: t('43,1 m / 30,18 m', '43.1 m / 30.18 m') },
    ],
    sections: [
      {
        h: t('Zamanının ötesinde', 'Ahead of its time'),
        p: [
          t(
            'B-29’un mürettebat bölümleri basınçlıydı ve birbirine bir tünelle bağlıydı: ekip 9 km’nin üstünde oksijen maskesi ve kalın giysiler olmadan çalışabiliyordu. Taretler uzaktan kumandalıydı ve nişancılar, menzili ve hızı hesaba katan bir atış kontrol bilgisayarıyla nişan alıyordu. Yeni R-3350 motorları ise uzun süre sorun çıkardı; motor yangınları ilk yılların en büyük tehlikesiydi.',
            'The B-29’s crew compartments were pressurised and joined by a tunnel, so the crew could work above 9 km without oxygen masks and heavy clothing. The turrets were remotely controlled, and the gunners aimed through a fire-control computer that allowed for range and speed. The new R-3350 engines gave trouble for a long time; engine fires were the greatest danger of the early years.',
          ),
        ],
      },
      {
        h: t('Japonya üzerinde', 'Over Japan'),
        p: [
          t(
            'B-29’lar 1944’te Çin’den, sonra Mariana Adaları’ndan Japonya’ya akın etmeye başladı. Yüksek irtifadaki güçlü rüzgârlar isabeti bozunca General Curtis LeMay taktiği değiştirdi: B-29’lar geceleri alçaktan yangın bombası attı. Mart 1945’te Tokyo’ya yapılan akında on binlerce sivil öldü. Ağustos 1945’te “Enola Gay” Hiroşima’ya, “Bockscar” Nagazaki’ye atom bombası attı.',
            'B-29s began raiding Japan in 1944 from China, then from the Mariana Islands. When strong winds at high altitude spoiled their accuracy, General Curtis LeMay changed tactics: the B-29s dropped incendiaries from low level at night. The raid on Tokyo in March 1945 killed tens of thousands of civilians. In August 1945 “Enola Gay” dropped an atomic bomb on Hiroshima and “Bockscar” on Nagasaki.',
          ),
          t(
            'Sovyetler Birliği, Sibirya’ya zorunlu iniş yapan B-29’ları kopyalayarak Tu-4’ü yaptı. B-29 Kore Savaşı’nda da kullanıldı, ama MiG-15’ler karşısında gündüz akınlarından vazgeçildi.',
            'The Soviet Union built the Tu-4 by copying B-29s that had made forced landings in Siberia. The B-29 was also used in the Korean War, but daylight raids had to be abandoned in the face of the MiG-15.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda en ağır bombardıman uçağıdır ve araştırma ağacının ikinci aşamasındadır: çok yüksekten uçar, en büyük yüklerden birini taşır ve beş uzaktan kumandalı çift makineli taretle her yönü savunur. Çok dayanıklıdır, ama yavaş ve büyüktür; jet avcılarına karşı zorlanır.',
        'In the game it is the heaviest bomber, in the second stage of the research tree: it flies very high, carries one of the largest loads and defends every direction with five remotely controlled twin-gun turrets. It is very tough, but slow and large, and struggles against jet fighters.',
      ),
    ],
  },
  {
    id: 'he162',
    summary: t(
      '“Halk avcısı”: 90 günde tasarlanıp uçurulan, sırtında motoru olan küçük jet.',
      'The “People’s Fighter”: a small jet with its engine on its back, designed and flown in 90 days.',
    ),
    lead: t(
      'Heinkel He 162 Salamander, savaşın son aylarında az malzemeyle çok sayıda üretilebilecek ucuz bir jet avcısı istenince doğdu: “Volksjäger”, yani halk avcısı. Tasarımdan ilk uçuşa yalnız 90 gün geçti. Hızlı ve çevikti, ama uçurması zordu ve yakıtı yarım saat kadar yetiyordu.',
      'The Heinkel He 162 Salamander was born when, in the last months of the war, a cheap jet fighter was wanted that could be built in large numbers from scarce materials: the “Volksjäger”, the People’s Fighter. Only 90 days passed from design to first flight. It was fast and agile, but hard to fly, and its fuel lasted about half an hour.',
    ),
    facts: [
      { k: K.first, v: t('6 Aralık 1944', '6 December 1944') },
      { k: K.service, v: t('1945 başı', 'Early 1945') },
      { k: K.designer, v: t('Siegfried Günter (Heinkel)', 'Siegfried Günter (Heinkel)') },
      { k: K.maker, v: t('Heinkel ve yeraltı fabrikaları', 'Heinkel and underground factories') },
      { k: K.built, v: t('Yaklaşık 320', 'About 320') },
      { k: K.engine, v: t('BMW 003E-1, eksenel akışlı turbojet, 7,8 kN (gövdenin üstünde)', 'BMW 003E-1 axial-flow turbojet, 7.8 kN (on top of the fuselage)') },
      { k: K.speed, v: t('Yaklaşık 790–900 km/sa (kaynağa ve irtifaya göre)', 'About 790–900 km/h (depending on source and altitude)') },
      { k: K.guns, v: t('Burunda 2 × 20 mm MG 151/20', '2 × 20 mm MG 151/20 in the nose') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('7,2 m / 9,05 m', '7.2 m / 9.05 m') },
    ],
    sections: [
      {
        h: t('90 günde bir jet', 'A jet in 90 days'),
        p: [
          t(
            'Eylül 1944’te açılan yarışmayı Heinkel kazandı. Siegfried Günter’in tasarladığı küçük uçağın motoru gövdenin sırtına oturtuldu, kanatları kıt alüminyum yerine ahşaptan yapıldı. Pilot için fırlatma koltuğu vardı. Planlara göre uçağı kısa bir planör eğitiminden geçmiş genç pilotlar uçuracaktı; ama He 162 deneyimli pilotlar için bile affetmeyen bir uçaktı.',
            'Heinkel won the competition opened in September 1944. Siegfried Günter’s small design had its engine mounted on the back of the fuselage and wings made of wood instead of scarce aluminium. The pilot had an ejection seat. The plan was for young pilots with only brief glider training to fly it, but the He 162 was unforgiving even for experienced pilots.',
          ),
          t(
            'Ahşap kanatlarda kullanılan yapıştırıcı sorun çıkardı: asıl yapıştırıcının fabrikası bombalanınca kullanılan yedeği ahşabı zayıflattı ve uçuşta parçalanan uçaklar oldu.',
            'The glue used in the wooden wings caused problems: when the factory making the original glue was bombed, the substitute weakened the wood, and some aircraft broke up in flight.',
          ),
        ],
      },
      {
        h: t('Savaşın son haftaları', 'The last weeks of the war'),
        p: [
          t(
            'He 162’ler Nisan 1945’te tek bir avcı alayına verildi ve birkaç hava muharebesine girdi. Savaş bittiğinde birçoğu sağlam olarak Müttefiklerin eline geçti ve incelendi.',
            'He 162s went to a single fighter wing in April 1945 and took part in a few air battles. When the war ended many were captured intact by the Allies and studied.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji hattında bir jet avcısıdır: hızlı ve çeviktir, iki 20 mm topu vardır. Yakıtı yarım saat kadar yeter, motoru gaz koluna geç tepki verir ve tutunma kaybında sert biçimde vrilleye girer; dikkatli uçurulmalıdır.',
        'In the game it is a jet fighter in the energy line: fast and agile, with two 20 mm cannon. Its fuel lasts about half an hour, its engine responds slowly to the throttle and it snaps into a spin when it stalls, so it needs careful flying.',
      ),
    ],
  },
  {
    id: 'seafury',
    summary: t(
      'Pervaneli avcıların son ve en hızlılarından: Kore’de bir MiG-15 bile düşürdü.',
      'One of the last and fastest piston fighters: in Korea it even shot down a MiG-15.',
    ),
    lead: t(
      'Hawker Sea Fury, İngiliz donanmasının son pervaneli avcısıdır ve hizmete girmiş en hızlı pervaneli uçaklardan biridir. 2.480 bg’lik Bristol Centaurus motoru, dört 20 mm topu ve roketleriyle Kore Savaşı’nda uçak gemilerinden kalkıp kara hedeflerine saldırdı; bir Sea Fury pilotu bir MiG-15 jetini düşürdü.',
      'The Hawker Sea Fury was the Royal Navy’s last piston-engined fighter and one of the fastest piston aircraft ever to enter service. With its 2,480 hp Bristol Centaurus engine, four 20 mm cannon and rockets, it flew from carriers in the Korean War to attack ground targets; one Sea Fury pilot shot down a MiG-15 jet.',
    ),
    facts: [
      { k: K.first, v: t('21 Şubat 1945 (Sea Fury prototipi)', '21 February 1945 (Sea Fury prototype)') },
      { k: K.service, v: t('1947', '1947') },
      { k: K.designer, v: t('Sydney Camm', 'Sydney Camm') },
      { k: K.maker, v: t('Hawker', 'Hawker') },
      { k: K.built, v: t('Yaklaşık 860', 'About 860') },
      { k: K.engine, v: t('Bristol Centaurus XVIII, 18 silindirli kovan valfli yıldız, 2.480 bg', 'Bristol Centaurus XVIII, 18-cylinder sleeve-valve radial, 2,480 hp') },
      { k: K.speed, v: t('Yaklaşık 740 km/sa', 'About 740 km/h') },
      { k: K.guns, v: t('Kanatlarda 4 × 20 mm Hispano; 12 × RP-3 roket ya da 2 × 1.000 lb bomba', '4 × 20 mm Hispano in the wings; 12 × RP-3 rockets or 2 × 1,000 lb bombs') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('11,7 m / 10,57 m', '11.7 m / 10.57 m') },
    ],
    sections: [
      {
        h: t('Tempest’in küçük kardeşi', 'The Tempest’s little brother'),
        p: [
          t(
            'Sea Fury, Hawker Tempest’in daha küçük ve hafif bir gövdeye indirgenmiş hâlinden doğdu. Savaşın sonunda RAF ilgisini kaybedince proje donanmaya kaldı. Dev Centaurus motoru beş palalı bir pervane döndürüyordu; Sea Fury ses hızına yaklaşan jetlerin geldiği yıllarda pervaneli avcının zirvesiydi.',
            'The Sea Fury grew out of a smaller, lighter version of the Hawker Tempest. When the RAF lost interest at the end of the war, the project went on for the Navy. The huge Centaurus engine turned a five-bladed propeller; at a time when jets approaching the speed of sound were arriving, the Sea Fury was the peak of the piston fighter.',
          ),
        ],
      },
      {
        h: t('Kore ve sonrası', 'Korea and after'),
        p: [
          t(
            'Kore Savaşı’nda İngiliz ve Avustralya uçak gemilerinden kalkan Sea Fury’ler köprülere, demiryollarına ve birliklere saldırdı. Ağustos 1952’de Teğmen Peter Carmichael’ın da içinde olduğu bir Sea Fury kolu, saldırıya uğradığı MiG-15’lerden birini düşürdü. Sea Fury Hollanda, Kanada, Avustralya, Pakistan ve Küba gibi ülkelerde de uçtu; bugün hava yarışlarının sevilen uçaklarındandır.',
            'In the Korean War, Sea Furies from British and Australian carriers attacked bridges, railways and troops. In August 1952 a flight of Sea Furies that included Lieutenant Peter Carmichael shot down one of the MiG-15s attacking it. The Sea Fury also flew with the Netherlands, Canada, Australia, Pakistan and Cuba, among others, and is a favourite at air races today.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda araştırma ağacının ikinci aşamasında, hafif hatta bir pervaneli avcıdır: çok hızlıdır, dört 20 mm topu güçlüdür ve iki kademeli kompresörüyle yüksekte de güçlüdür. Bomba ya da 12 roketle avcı-bombardıman olarak da kullanılır.',
        'In the game it is a piston fighter in the light line, in the second stage of the research tree: very fast, with four powerful 20 mm cannon, and strong high up thanks to its two-stage supercharger. With bombs or 12 rockets it also serves as a fighter-bomber.',
      ),
    ],
  },
  {
    id: 'f80c',
    summary: t(
      'ABD’nin ilk hizmete giren jet avcısı; Kore’de avcı-bombardıman oldu.',
      'America’s first operational jet fighter, which became a fighter-bomber in Korea.',
    ),
    lead: t(
      'Lockheed P-80 (sonra F-80) Shooting Star, ABD’nin ilk hizmete giren jet avcısıdır. Kelly Johnson’ın ekibi onu yalnız 143 günde tasarlayıp yaptı; bu ekip sonradan Lockheed’in ünlü “Skunk Works” bürosu oldu. Kore Savaşı’nda ilk jet-jet muharebelerine girdi, ama MiG-15 karşısında geride kalınca avcı-bombardıman olarak kullanıldı.',
      'The Lockheed P-80 (later F-80) Shooting Star was America’s first operational jet fighter. Kelly Johnson’s team designed and built it in just 143 days; that team later became Lockheed’s famous “Skunk Works”. It took part in the first jet-versus-jet battles of the Korean War, but once outclassed by the MiG-15 it was used as a fighter-bomber.',
    ),
    facts: [
      { k: K.first, v: t('8 Ocak 1944 (XP-80)', '8 January 1944 (XP-80)') },
      { k: K.service, v: t('1945; F-80C 1948', '1945; the F-80C in 1948') },
      { k: K.designer, v: t('Clarence “Kelly” Johnson (Lockheed)', 'Clarence “Kelly” Johnson (Lockheed)') },
      { k: K.maker, v: t('Lockheed', 'Lockheed') },
      { k: K.built, v: t('Yaklaşık 1.700 (eğitim sürümü T-33 hariç)', 'About 1,700 (not counting the T-33 trainer)') },
      { k: K.engine, v: t('Allison J33-A-35, santrifüj akışlı turbojet, yaklaşık 20–24 kN (su enjeksiyonuyla)', 'Allison J33-A-35 centrifugal-flow turbojet, about 20–24 kN (with water injection)') },
      { k: K.speed, v: t('Yaklaşık 965 km/sa, deniz seviyesine yakın', 'About 965 km/h, near sea level') },
      { k: K.guns, v: t('Burunda 6 × 12,7 mm M3 Browning; kanat ucu tankları, bomba ve roket', '6 × .50 in M3 Browning in the nose; wingtip tanks, bombs and rockets') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('11,81 m / 10,49 m', '11.81 m / 10.49 m') },
    ],
    sections: [
      {
        h: t('143 gün', '143 days'),
        p: [
          t(
            '1943’te Me 262 haberleri ABD’yi telaşlandırınca Lockheed’e hızlıca bir jet avcısı yapması istendi. Kelly Johnson’ın küçük ekibi gizlilik içinde, ayrı bir çadır-atölyede çalışarak prototipi 143 günde bitirdi. Birkaç P-80 savaşın sonunda İtalya’ya gönderildi ama muharebeye girmedi.',
            'In 1943, when news of the Me 262 alarmed the United States, Lockheed was asked to build a jet fighter quickly. Kelly Johnson’s small team, working in secrecy in a separate tent-workshop, finished the prototype in 143 days. A few P-80s were sent to Italy at the end of the war but did not see combat.',
          ),
        ],
      },
      {
        h: t('Kore’de', 'In Korea'),
        p: [
          t(
            'Kore Savaşı başladığında F-80’ler bölgedeki ana ABD jet avcılarıydı ve Kasım 1950’de ilk jet-jet muharebelerine girdiler. Ok kanatlı MiG-15’in gelişiyle düz kanatlı F-80’ler hava üstünlüğü görevini F-86’ya bıraktı ve kanat ucu tankları, bombaları ve roketleriyle kara birliklerini destekledi. Gövdesi uzatılmış iki kişilik eğitim sürümü T-33, binlerce adet üretilip onlarca ülkede jet pilotlarını yetiştirdi.',
            'When the Korean War began, F-80s were the main American jet fighters in the theatre, and in November 1950 they took part in the first jet-versus-jet battles. With the arrival of the swept-wing MiG-15, the straight-winged F-80s handed air superiority to the F-86 and supported the ground troops with their tip tanks, bombs and rockets. The stretched two-seat trainer version, the T-33, was built in thousands and trained jet pilots in dozens of countries.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ağır hatta bir jet avcısıdır: alçakta çok hızlıdır ve burnundaki altı 12,7 mm makineli isabetlidir. Kanat ucu tanklarıyla menzili uzar; bomba ve roketle kara hedeflerine saldırabilir.',
        'In the game it is a jet fighter in the heavy line: very fast down low, with six accurate .50 in guns in the nose. Wingtip tanks extend its range, and it can attack ground targets with bombs and rockets.',
      ),
    ],
  },
  {
    id: 'ad4',
    summary: t(
      'Jet çağında doğan pervaneli taarruz uçağı: saatlerce hedefin üstünde kalan “Spad”.',
      'A piston attack aircraft born in the jet age: the “Spad” that could loiter over the target for hours.',
    ),
    lead: t(
      'Douglas AD Skyraider, jetlerin geldiği yıllarda tasarlanmış pervaneli bir taarruz uçağıdır. Tek motoruna rağmen bir B-17’nin taşıdığı kadar bomba taşıyabiliyor ve saatlerce hedefin üstünde kalabiliyordu. Kore’de ve Vietnam’da savaştı; jetlerin yapamadığını, yavaş, alçak ve uzun süre uçmayı iyi yapıyordu.',
      'The Douglas AD Skyraider was a piston-engined attack aircraft designed just as the jets were arriving. Despite its single engine it could carry as many bombs as a B-17 and stay over the target for hours. It fought in Korea and Vietnam, doing well what jets could not: flying slow, low and long.',
    ),
    facts: [
      { k: K.first, v: t('18 Mart 1945 (XBT2D-1)', '18 March 1945 (XBT2D-1)') },
      { k: K.service, v: t('1946; AD-4 1949', '1946; the AD-4 in 1949') },
      { k: K.designer, v: t('Ed Heinemann (Douglas)', 'Ed Heinemann (Douglas)') },
      { k: K.maker, v: t('Douglas Aircraft', 'Douglas Aircraft') },
      { k: K.built, v: t('Yaklaşık 3.180 (bütün sürümler)', 'About 3,180 (all variants)') },
      { k: K.engine, v: t('Wright R-3350-26WA, 18 silindirli yıldız, yaklaşık 2.700 bg', 'Wright R-3350-26WA, 18-cylinder radial, about 2,700 hp') },
      { k: K.speed, v: t('Yaklaşık 520 km/sa', 'About 520 km/h') },
      { k: K.guns, v: t('Kanatlarda 4 × 20 mm top; 15 askı noktasında 3.600 kg’a kadar bomba, roket ya da torpido', '4 × 20 mm cannon in the wings; up to 3,600 kg of bombs, rockets or torpedoes on 15 hardpoints') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('15,25 m / 11,84 m', '15.25 m / 11.84 m') },
    ],
    sections: [
      {
        h: t('Bir otel odasında', 'In a hotel room'),
        p: [
          t(
            'Anlatıya göre Ed Heinemann ve ekibi, ABD Donanması’nın yeni bir pike ve torpido bombardıman uçağı isteğine yanıt olarak Skyraider’ı Haziran 1944’te Washington’daki bir otel odasında bir gecede çizdi. Uçak 1945’te uçtu, ama savaş bitmişti. Basit, sağlam ve bakımı kolay yapısıyla jetlerin yanında yıllarca hizmet verdi.',
            'As the story goes, Ed Heinemann and his team drew the Skyraider overnight in a Washington hotel room in June 1944, in answer to the US Navy’s call for a new dive and torpedo bomber. It flew in 1945, but the war was over. Simple, rugged and easy to maintain, it served for years alongside the jets.',
          ),
        ],
      },
      {
        h: t('Kore ve Vietnam', 'Korea and Vietnam'),
        p: [
          t(
            'Kore’de Skyraider’lar köprülere ve barajlara saldırdı; Mayıs 1951’de torpidolarla Hwacheon Barajı’nın kapaklarını vurdular. Vietnam’da A-1 adıyla düşmüş pilotları kurtaran helikopterlere eşlik etti ve kara birliklerini destekledi; 1966’da bir Skyraider kolu bir MiG-17 jetini düşürdü.',
            'In Korea Skyraiders attacked bridges and dams; in May 1951 they hit the floodgates of the Hwacheon Dam with torpedoes. In Vietnam, as the A-1, they escorted the helicopters rescuing downed pilots and supported ground troops; in 1966 a flight of Skyraiders shot down a MiG-17 jet.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda pike hattının ikinci aşamasındaki uçağıdır: yavaştır ama çok dayanıklıdır, 15 askısında 3.600 kg’a kadar yük taşır ve dört 20 mm topu vardır. Uzun süre hedef üstünde kalabilir.',
        'In the game it is the dive-bomber line’s second-stage aircraft: slow but very tough, it carries up to 3,600 kg on 15 hardpoints and has four 20 mm cannon. It can stay over the target for a long time.',
      ),
    ],
  },
  {
    id: 'vampire',
    summary: t(
      'Çift kuyruk kirişli küçük jet: uçak gemisine inen ilk jet.',
      'The small twin-boom jet that was the first jet to land on an aircraft carrier.',
    ),
    lead: t(
      'de Havilland Vampire, İngiltere’nin ikinci jet avcısıdır: tek motorlu, çift kuyruk kirişli ve küçük. Kısa egzoz borusu motorun gücünü az kayıpla kullanmasını sağladı. Aralık 1945’te uçak gemisine inen ilk jet uçak oldu ve 30’dan fazla ülkede hizmet verdi.',
      'The de Havilland Vampire was Britain’s second jet fighter: single-engined, twin-boomed and small. Its short exhaust pipe let the engine use its power with little loss. In December 1945 it became the first jet aircraft to land on an aircraft carrier, and it served in more than 30 countries.',
    ),
    facts: [
      { k: K.first, v: t('20 Eylül 1943', '20 September 1943') },
      { k: K.service, v: t('1946; FB.5 1949', '1946; the FB.5 in 1949') },
      { k: K.maker, v: t('de Havilland; lisansla İsviçre, Fransa, Hindistan ve Avustralya’da', 'de Havilland; under licence in Switzerland, France, India and Australia') },
      { k: K.built, v: t('3.000’i aşkın (bütün sürümler)', 'More than 3,000 (all variants)') },
      { k: K.engine, v: t('de Havilland Goblin 2, santrifüj akışlı turbojet, 13,8 kN', 'de Havilland Goblin 2 centrifugal-flow turbojet, 13.8 kN') },
      { k: K.speed, v: t('Yaklaşık 860 km/sa', 'About 860 km/h') },
      { k: K.guns, v: t('Burunda 4 × 20 mm Hispano; bomba ya da roket', '4 × 20 mm Hispano in the nose; bombs or rockets') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('11,58 m / 9,37 m', '11.58 m / 9.37 m') },
    ],
    sections: [
      {
        h: t('Kısa egzoz, çift kiriş', 'Short exhaust, twin booms'),
        p: [
          t(
            'Erken jet motorları güçsüzdü; uzun bir egzoz borusu gücün bir kısmını yiyordu. Vampire’da motor, pilotun arkasındaki kısa gövdenin içindeydi ve egzozu doğrudan geriye, iki kuyruk kirişinin arasından çıkıyordu. Gövde Mosquito’daki gibi kontrplak ve balsadan yapılmıştı.',
            'Early jet engines were weak, and a long exhaust pipe ate up part of their power. In the Vampire the engine sat in the short nacelle behind the pilot and exhausted straight back between the two tail booms. The nacelle was built of plywood and balsa, like the Mosquito.',
          ),
        ],
      },
      {
        h: t('İlkler', 'Firsts'),
        p: [
          t(
            '3 Aralık 1945’te deneme pilotu Eric “Winkle” Brown, bir Sea Vampire ile HMS Ocean uçak gemisine indi: bu, bir uçak gemisine inen ilk jet uçağıydı. 1948’de RAF Vampire’ları Atlantik’i geçen ilk jetler oldu. Vampire birçok hava kuvvetinin ilk jet avcısıydı; İsviçre onu 1990’a kadar kullandı.',
            'On 3 December 1945 test pilot Eric “Winkle” Brown landed a Sea Vampire on the carrier HMS Ocean, the first jet aircraft to land on an aircraft carrier. In 1948 RAF Vampires became the first jets to fly across the Atlantic. The Vampire was the first jet fighter of many air forces; Switzerland flew it until 1990.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda hafif hatta bir jet avcısıdır: küçük ve çok çeviktir, burnunda dört 20 mm top taşır. Düz kanadı yüksek hızda Mach sınırına erken ulaşır; dalışta hızına dikkat etmek gerekir.',
        'In the game it is a jet fighter in the light line: small and very agile, with four 20 mm cannon in the nose. Its straight wing reaches its Mach limit early at high speed, so its speed needs watching in a dive.',
      ),
    ],
  },
  {
    id: 'mig15',
    summary: t(
      'Ok kanatlı Sovyet jeti: Kore’de ortaya çıkışıyla Batı’yı şaşırttı.',
      'The swept-wing Soviet jet whose appearance over Korea stunned the West.',
    ),
    lead: t(
      'Mikoyan-Gurevich MiG-15, ok kanatlı ilk başarılı jet avcılarından biridir. Kasım 1950’de Kore üzerinde ortaya çıktığında Birleşmiş Milletler’in elindeki her uçaktan üstündü; ancak F-86 Sabre ona denk gelebildi. Motoru, İngiltere’nin Sovyetler Birliği’ne sattığı Rolls-Royce Nene’nin kopyasıydı. 18.000’i aşkın üretildi.',
      'The Mikoyan-Gurevich MiG-15 was one of the first successful swept-wing jet fighters. When it appeared over Korea in November 1950 it outclassed every aircraft the United Nations had; only the F-86 Sabre could match it. Its engine was a copy of the Rolls-Royce Nene that Britain had sold to the Soviet Union. More than 18,000 were built.',
    ),
    facts: [
      { k: K.first, v: t('30 Aralık 1947', '30 December 1947') },
      { k: K.service, v: t('1949; MiG-15bis 1950', '1949; the MiG-15bis in 1950') },
      { k: K.designer, v: t('Artem Mikoyan ve Mihail Gureviç', 'Artem Mikoyan and Mikhail Gurevich') },
      { k: K.maker, v: t('Sovyet fabrikaları; lisansla Polonya, Çekoslovakya ve Çin’de', 'Soviet factories; under licence in Poland, Czechoslovakia and China') },
      { k: K.built, v: t('18.000’i aşkın (bütün sürümler)', 'More than 18,000 (all variants)') },
      { k: K.engine, v: t('Klimov VK-1, santrifüj akışlı turbojet, 26,5 kN', 'Klimov VK-1 centrifugal-flow turbojet, 26.5 kN') },
      { k: K.speed, v: t('Yaklaşık 1.060 km/sa, alçakta', 'About 1,060 km/h, at low level') },
      { k: K.guns, v: t('Burnun altında 1 × 37 mm N-37 ve 2 × 23 mm NR-23', '1 × 37 mm N-37 and 2 × 23 mm NR-23 under the nose') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('10,08 m / 10,1 m', '10.08 m / 10.1 m') },
    ],
    sections: [
      {
        h: t('İngiliz motoru, Sovyet uçağı', 'A British engine, a Soviet aircraft'),
        p: [
          t(
            'Savaştan sonra Sovyet tasarımcıları ok kanat konusunda Alman araştırmalarından yararlandı, ama güçlü bir jet motoru yoktu. 1946–47’de İngiliz hükümeti Sovyetler Birliği’ne Rolls-Royce Nene motorları sattı; Sovyetler bunu kopyalayıp geliştirerek MiG-15’in motorunu yaptı. Uçak hafif, basit ve çabuk tırmanan bir bombardıman önleyicisiydi; toplarının ağırlığı B-29 gibi büyük hedefler içindi.',
            'After the war Soviet designers drew on German research into swept wings, but they had no powerful jet engine. In 1946–47 the British government sold Rolls-Royce Nene engines to the Soviet Union, which copied and developed it into the MiG-15’s engine. The aircraft was a light, simple bomber interceptor that climbed quickly; its heavy cannon were meant for large targets such as the B-29.',
          ),
        ],
      },
      {
        h: t('MiG Koridoru', 'MiG Alley'),
        p: [
          t(
            'Kore’de MiG-15’ler Yalu Nehri boyunca, Amerikalıların “MiG Koridoru” dediği bölgede F-86’larla savaştı; uçakların bir kısmını gizlice Sovyet pilotları uçuruyordu. Ekim 1951’de gündüz akınına gelen B-29’lara ağır kayıplar verdirince ABD gündüz B-29 akınlarını durdurdu. Savaş bittikten sonra bir Kuzey Koreli pilot MiG-15’iyle Güney Kore’ye iltica etti ve uçak ABD’de baştan sona incelendi.',
            'In Korea, MiG-15s fought F-86s along the Yalu River, in what the Americans called “MiG Alley”; some of them were secretly flown by Soviet pilots. After they inflicted heavy losses on a daylight B-29 raid in October 1951, the US stopped daylight B-29 raids. After the war ended, a North Korean pilot defected to South Korea in his MiG-15, and the aircraft was studied from end to end in the United States.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda enerji hattında bir jet avcısıdır: hafiftir, çok çabuk tırmanır ve 37 mm ile iki 23 mm topu bombardıman uçaklarına karşı çok güçlüdür, ama mermisi azdır. Ses hızına yaklaşınca kumandası zorlaşır ve tutunma kaybında sert biçimde vrilleye girer.',
        'In the game it is a jet fighter in the energy line: light, a very fast climber, with a 37 mm and two 23 mm cannon that are very powerful against bombers but carry little ammunition. Its controls become difficult near the speed of sound, and it snaps into a spin when it stalls.',
      ),
    ],
  },
  {
    id: 'il28',
    summary: t(
      'Düz kanatlı, ok kuyruklu Sovyet jet bombardıman uçağı: basit, sağlam, uzun ömürlü.',
      'The straight-winged, swept-tailed Soviet jet bomber: simple, rugged and long-lived.',
    ),
    lead: t(
      'Ilyushin Il-28, Sovyetler Birliği’nin ilk seri üretilen jet bombardıman uçağıdır. Düz kanatlı, ok kuyruklu ve üç kişilikti; basit ve sağlam yapısıyla 6.000’i aşkın üretildi ve onlarca ülkede uçtu. 1962’deki Küba Füze Krizi’nde Küba’daki Il-28’ler de krizin konularından biriydi.',
      'The Ilyushin Il-28 was the Soviet Union’s first mass-produced jet bomber. It had a straight wing, a swept tail and a crew of three; simple and rugged, it was built in more than 6,000 examples and flew in dozens of countries. In the Cuban Missile Crisis of 1962, the Il-28s in Cuba were also one of the issues.',
    ),
    facts: [
      { k: K.first, v: t('8 Temmuz 1948', '8 July 1948') },
      { k: K.service, v: t('1950', '1950') },
      { k: K.designer, v: t('Sergey İlyuşin', 'Sergey Ilyushin') },
      { k: K.maker, v: t('Sovyet fabrikaları; Çin’de H-5 adıyla', 'Soviet factories; in China as the H-5') },
      { k: K.built, v: t('Sovyetler Birliği’nde 6.000’i aşkın', 'More than 6,000 in the Soviet Union') },
      { k: K.engine, v: t('2 × Klimov VK-1A, santrifüj akışlı turbojet, her biri 26,5 kN', '2 × Klimov VK-1A centrifugal-flow turbojets, 26.5 kN each') },
      { k: K.speed, v: t('Yaklaşık 900 km/sa', 'About 900 km/h') },
      { k: K.guns, v: t('Burunda 2 × 23 mm sabit top, kuyruk taretinde 2 × 23 mm; 3.000 kg’a kadar bomba', '2 × 23 mm fixed cannon in the nose, 2 × 23 mm in the tail turret; up to 3,000 kg of bombs') },
      { k: K.crew, v: t('3', '3') },
      { k: K.size, v: t('21,45 m / 17,65 m', '21.45 m / 17.65 m') },
    ],
    sections: [
      {
        h: t('Basit ve sağlam', 'Simple and rugged'),
        p: [
          t(
            'Il-28’in kanadı düzdü, ama yüksek hızda kumandayı korumak için kuyruğuna ok açısı verilmişti. Motorları MiG-15’inkiyle aynı aileden, kopyalanan Nene’den türemişti. Pilot, camlı burundaki seyrüseferci-bombacı ve kuyruktaki nişancıdan oluşan üç kişilik ekip, uçağı zorlu koşullarda da kolayca kullanabiliyordu. NATO kod adı “Beagle”dı.',
            'The Il-28’s wing was straight, but its tail was swept to keep control at high speed. Its engines came from the same family as the MiG-15’s, derived from the copied Nene. Its crew of three, a pilot, a navigator-bombardier in the glazed nose and a gunner in the tail, could operate it easily in harsh conditions. Its NATO code name was “Beagle”.',
          ),
        ],
      },
      {
        h: t('Uzun bir hizmet', 'A long service'),
        p: [
          t(
            'Il-28 Varşova Paktı ülkelerine, Çin’e, Ortadoğu’ya ve başka ülkelere verildi. 1962’de Sovyetler Birliği’nin Küba’ya gönderdiği Il-28’ler, füzelerle birlikte geri çekilmesi istenen silahlar arasındaydı. Çin’in H-5 adıyla ürettiği kopyalar onlarca yıl hizmette kaldı.',
            'The Il-28 went to the Warsaw Pact countries, China, the Middle East and elsewhere. In 1962 the Il-28s that the Soviet Union had sent to Cuba were among the weapons whose withdrawal was demanded along with the missiles. Copies built in China as the H-5 stayed in service for decades.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda jet bombardıman uçağıdır: hızlıdır, 3 tona kadar bomba taşır ve kuyruktaki motorlu taretin iki 23 mm topuyla arkasını savunur. Burnunda da iki sabit 23 mm top vardır.',
        'In the game it is a jet bomber: fast, carrying up to 3 tonnes of bombs, it defends its tail with the two 23 mm cannon of the powered tail turret. It also has two fixed 23 mm cannon in the nose.',
      ),
    ],
  },
  {
    id: 'f84g',
    summary: t(
      'Düz kanatlı jet avcı-bombardıman: Kore’nin ve NATO’nun iş atı.',
      'The straight-winged jet fighter-bomber: workhorse of Korea and NATO.',
    ),
    lead: t(
      'Republic F-84 Thunderjet, P-47’nin tasarımcısı Alexander Kartveli’nin ilk jetidir. Kore Savaşı’nda ABD’nin ana jet avcı-bombardımanıydı; köprülere, demiryollarına ve barajlara saldırdı. G sürümü havada yakıt ikmali yapabiliyordu ve 1950’lerde Türk Hava Kuvvetleri dahil birçok NATO hava kuvvetinin belkemiği oldu.',
      'The Republic F-84 Thunderjet was the first jet of Alexander Kartveli, designer of the P-47. In the Korean War it was the main American jet fighter-bomber, attacking bridges, railways and dams. The G version could refuel in flight, and in the 1950s it became the backbone of many NATO air forces, the Turkish Air Force among them.',
    ),
    facts: [
      { k: K.first, v: t('28 Şubat 1946 (XP-84)', '28 February 1946 (XP-84)') },
      { k: K.service, v: t('1947; F-84G 1951', '1947; the F-84G in 1951') },
      { k: K.designer, v: t('Alexander Kartveli (Republic)', 'Alexander Kartveli (Republic)') },
      { k: K.maker, v: t('Republic Aviation', 'Republic Aviation') },
      { k: K.built, v: t('Yaklaşık 7.500 düz kanatlı F-84; 3.000’i aşkını G', 'About 7,500 straight-winged F-84s, more than 3,000 of them Gs') },
      { k: K.engine, v: t('Allison J35-A-29, eksenel akışlı turbojet, yaklaşık 25 kN', 'Allison J35-A-29 axial-flow turbojet, about 25 kN') },
      { k: K.speed, v: t('Yaklaşık 1.000 km/sa', 'About 1,000 km/h') },
      { k: K.guns, v: t('6 × 12,7 mm M3 Browning; kanat ucu tankları, bomba ve roket', '6 × .50 in M3 Browning; wingtip tanks, bombs and rockets') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('11,1 m / 11,6 m', '11.1 m / 11.6 m') },
    ],
    sections: [
      {
        h: t('Kore’nin avcı-bombardımanı', 'Korea’s fighter-bomber'),
        p: [
          t(
            'Düz kanatlı F-84 MiG-15 karşısında hava muharebesinde geride kalıyordu, ama ağır yük taşıyan sağlam bir avcı-bombardıman olarak çok değerliydi. Kore’de F-84’ler köprüleri, demiryollarını, hava üslerini ve 1953’te Kuzey Kore’nin sulama barajlarını vurdu.',
            'The straight-winged F-84 was outclassed by the MiG-15 in air combat, but as a rugged fighter-bomber with a heavy load it was very valuable. In Korea F-84s struck bridges, railways, airfields and, in 1953, North Korea’s irrigation dams.',
          ),
        ],
      },
      {
        h: t('NATO’nun iş atı', 'NATO’s workhorse'),
        p: [
          t(
            'F-84G havada yakıt ikmali yapabilen ve taktik nükleer silah taşıyabilen ilk tek kişilik avcılardandı. 1950’lerde ABD yardım programlarıyla Batı Avrupa’nın birçok hava kuvvetine verildi; Türk Hava Kuvvetleri’nin ilk jet avcılarından biri oldu. ABD Hava Kuvvetleri’nin gösteri takımı Thunderbirds’ün ilk uçağı da F-84G’ydi.',
            'The F-84G was one of the first single-seat fighters able to refuel in flight and to carry a tactical nuclear weapon. In the 1950s it was supplied under American aid programmes to many Western European air forces, and it was one of the Turkish Air Force’s first jet fighters. It was also the first aircraft of the US Air Force display team, the Thunderbirds.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda ağır hatta bir jet avcı-bombardımandır: alçakta hızlıdır, kanat ucu tanklarıyla menzili uzundur ve altı 12,7 mm makinelisi vardır. Bomba ve araştırmayla gelen sekiz HVAR roketiyle kara hedeflerine dalar.',
        'In the game it is a jet fighter-bomber in the heavy line: fast down low, with a long range thanks to its wingtip tanks and six .50 in guns. It dives on ground targets with bombs and, once researched, eight HVAR rockets.',
      ),
    ],
  },
  {
    id: 'canberra',
    summary: t(
      'Savunma silahı olmayan, yüksek ve hızlı uçan ilk İngiliz jet bombardıman uçağı.',
      'Britain’s first jet bomber, with no defensive guns, flying high and fast.',
    ),
    lead: t(
      'English Electric Canberra, İngiltere’nin ilk jet bombardıman uçağıdır. Mosquito gibi savunma silahı taşımaz, avcıların ve uçaksavarın ulaşamayacağı yükseklik ve hıza güvenirdi. Çok başarılı oldu: ABD onu B-57 adıyla lisansla üretti ve keşif sürümleri RAF’ta 2006’ya kadar, 57 yıl uçtu.',
      'The English Electric Canberra was Britain’s first jet bomber. Like the Mosquito it carried no defensive guns, relying on an altitude and speed that fighters and anti-aircraft guns could not reach. It was very successful: the United States built it under licence as the B-57, and reconnaissance versions flew with the RAF until 2006, 57 years in all.',
    ),
    facts: [
      { k: K.first, v: t('13 Mayıs 1949', '13 May 1949') },
      { k: K.service, v: t('Mayıs 1951', 'May 1951') },
      { k: K.designer, v: t('W. E. W. “Teddy” Petter (English Electric)', 'W. E. W. “Teddy” Petter (English Electric)') },
      { k: K.maker, v: t('English Electric ve başka İngiliz fabrikaları; ABD’de Martin B-57, Avustralya’da lisansla', 'English Electric and other British factories; the Martin B-57 in the US, and under licence in Australia') },
      { k: K.built, v: t('Yaklaşık 1.300 (B-57 dahil)', 'About 1,300 (including the B-57)') },
      { k: K.engine, v: t('2 × Rolls-Royce Avon RA.3, eksenel akışlı turbojet, her biri 28,9 kN', '2 × Rolls-Royce Avon RA.3 axial-flow turbojets, 28.9 kN each') },
      { k: K.speed, v: t('Yaklaşık 920 km/sa, yüksekte', 'About 920 km/h, at altitude') },
      { k: K.guns, v: t('Savunma silahı yok; iç bölmede 2.700 kg’ı aşan bomba', 'No defensive guns; more than 2,700 kg of bombs internally') },
      { k: K.crew, v: t('3', '3') },
      { k: K.size, v: t('19,51 m / 19,96 m', '19.51 m / 19.96 m') },
    ],
    sections: [
      {
        h: t('Yükseklik ve hız', 'Height and speed'),
        p: [
          t(
            'Teddy Petter’in tasarladığı Canberra’nın geniş, kalın kanadı ona yüksek irtifada büyük çeviklik veriyordu; ilk yıllarında birçok avcı onu yakalamakta zorlandı. 1951’de Atlantik’i durmadan geçen ilk jet bombardıman uçağı oldu, 1957’de ise özel hazırlanmış bir Canberra 21 km’yi aşan bir irtifa rekoru kırdı.',
            'Designed by Teddy Petter, the Canberra had a broad, thick wing that made it very agile at high altitude; in its early years many fighters struggled to catch it. In 1951 it became the first jet bomber to fly the Atlantic non-stop, and in 1957 a specially prepared Canberra set an altitude record of more than 21 km.',
          ),
        ],
      },
      {
        h: t('Yarım asırlık hizmet', 'Half a century of service'),
        p: [
          t(
            'Canberra 1956’daki Süveyş krizinde kullanıldı; ABD’nin lisansla ürettiği B-57’ler Vietnam’da savaştı, Arjantin Canberra’ları 1982’de Falkland Savaşı’nda uçtu. Yüksek irtifa keşif sürümleri RAF’ta 2006’ya kadar görev yaptı; NASA’nın araştırma uçağı olarak kullandığı WB-57’ler ise bugün de uçmaktadır.',
            'The Canberra was used in the 1956 Suez Crisis; licence-built B-57s fought in Vietnam, and Argentine Canberras flew in the 1982 Falklands War. High-altitude reconnaissance versions served with the RAF until 2006, and the WB-57s that NASA uses as research aircraft still fly today.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda jet bombardıman uçağıdır: savunma silahı yoktur, 12 km’nin üstünde, pervaneli avcıların ve uçaksavarın ulaşamayacağı yükseklikte ve hızda uçar. İç bölmesinde ve kanat altında bomba taşır.',
        'In the game it is a jet bomber with no defensive guns: it flies above 12 km, at a height and speed that piston fighters and anti-aircraft guns cannot reach. It carries bombs internally and under the wings.',
      ),
    ],
  },
  {
    id: 'f86f',
    summary: t(
      'Kore’de MiG-15’e karşı savaşan ok kanatlı Amerikan avcısı.',
      'The swept-wing American fighter that fought the MiG-15 over Korea.',
    ),
    lead: t(
      'North American F-86 Sabre, ABD’nin ilk ok kanatlı jet avcısıdır. Kore Savaşı’nda MiG-15’e karşı Birleşmiş Milletler’in tek denk avcısıydı. Hidrolik kumandaları yüksek hızda bile çevik yuvarlanmasını sağladı, radar telemetreli nişangâhı ise uzaktan isabeti artırdı. Türk Hava Kuvvetleri dahil 30’u aşkın ülkede uçtu.',
      'The North American F-86 Sabre was America’s first swept-wing jet fighter. In the Korean War it was the United Nations’ only fighter able to match the MiG-15. Its hydraulic controls kept it agile in the roll even at high speed, and its radar-ranging gunsight improved accuracy at long range. It flew in more than 30 countries, Turkey among them.',
    ),
    facts: [
      { k: K.first, v: t('1 Ekim 1947 (XP-86)', '1 October 1947 (XP-86)') },
      { k: K.service, v: t('1949; F-86F 1952', '1949; the F-86F in 1952') },
      { k: K.designer, v: t('North American (Edgar Schmued’in ekibi)', 'North American (Edgar Schmued’s team)') },
      { k: K.maker, v: t('North American; lisansla Kanada’da Canadair, Avustralya, İtalya ve Japonya’da', 'North American; under licence by Canadair in Canada, and in Australia, Italy and Japan') },
      { k: K.built, v: t('9.800’ü aşkın (bütün sürümler)', 'More than 9,800 (all variants)') },
      { k: K.engine, v: t('General Electric J47-GE-27, eksenel akışlı turbojet, 26,3 kN', 'General Electric J47-GE-27 axial-flow turbojet, 26.3 kN') },
      { k: K.speed, v: t('Yaklaşık 1.100 km/sa, deniz seviyesinde', 'About 1,100 km/h at sea level') },
      { k: K.guns, v: t('Burnun yanlarında 6 × 12,7 mm M3 Browning; radar telemetreli nişangâh', '6 × .50 in M3 Browning beside the nose; radar-ranging gunsight') },
      { k: K.crew, v: t('1', '1') },
      { k: K.size, v: t('11,3 m / 11,4 m', '11.3 m / 11.4 m') },
    ],
    sections: [
      {
        h: t('Ok kanat', 'The swept wing'),
        p: [
          t(
            'F-86 başta düz kanatla tasarlanıyordu. Savaştan sonra ele geçen Alman araştırmaları, ok açılı kanadın ses hızına yaklaşırken sürüklemeyi çok azalttığını gösterdi ve tasarım 35 derece ok açılı kanatla yeniden yapıldı. Sonraki sürümlerde bütünüyle hareketli yatay kuyruk geldi; F sürümünün kanat hücum kenarı uzatıldı ve yüksek irtifada çevikliği arttı.',
            'The F-86 was first being designed with a straight wing. German research captured after the war showed that a swept wing greatly reduced drag near the speed of sound, and the design was redone with a 35-degree swept wing. Later versions got an all-moving tailplane; on the F the wing leading edge was extended, improving its agility at high altitude.',
          ),
        ],
      },
      {
        h: t('MiG Koridoru', 'MiG Alley'),
        p: [
          t(
            'Kore’de Sabre’lar Yalu Nehri boyunca MiG-15’lerle savaştı. MiG daha hızlı tırmanıyor ve yüksekte daha iyiydi; Sabre ise yüksek hızda daha çevikti, nişangâhı daha iyiydi ve dalışta daha iyi kalıyordu. İki tarafın düşürme iddiaları hâlâ tartışılır, ama Sabre pilotlarının eğitimi ve deneyimi belirleyici oldu.',
            'In Korea Sabres fought MiG-15s along the Yalu River. The MiG climbed faster and was better high up; the Sabre was more agile at high speed, had a better gunsight and held together better in a dive. Both sides’ kill claims are still debated, but the training and experience of the Sabre pilots proved decisive.',
          ),
          t(
            'Sabre 1950’lerde ve 1960’larda birçok hava kuvvetinin ana avcısı oldu; Türk Hava Kuvvetleri de F-86 kullandı. Pakistan Sabre’ları 1965 Hindistan-Pakistan Savaşı’nda savaştı.',
            'In the 1950s and 1960s the Sabre was the main fighter of many air forces; the Turkish Air Force flew F-86s too. Pakistani Sabres fought in the 1965 India–Pakistan war.',
          ),
        ],
      },
    ],
    inGame: [
      t(
        'Oyunda hafif hattın jet avcısıdır: ses hızına yakın uçar ve hidrolik kumandaları sayesinde yüksek hızda bile çabuk yuvarlanır. Altı 12,7 mm makinelisi vardır; ek yakıt tankı ya da 2 × 1000 lb bomba taşıyabilir.',
        'In the game it is the light line’s jet fighter: it flies close to the speed of sound and, thanks to its hydraulic controls, rolls quickly even at high speed. It has six .50 in guns and can carry a drop tank or 2 × 1,000 lb bombs.',
      ),
    ],
  },
];
