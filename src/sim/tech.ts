// Araştırma: üç ağaç ve üç eşzamanlı araştırma hattı.
//
//  - Teknoloji (modifikasyonlar): dönem dönem motor, gövde, silah, nişan ve yakıt geliştirmeleri. Araştıran tarafın
//    uygun uçaklarına etki eder (mods.ts).
//  - Hava savunma: toplar, nişan aletleri, tahkimat, gözcü ve radar. Kendi hattında ilerler, uçak geliştirmelerini bekletmez.
//  - Araç ağacı: gerçek uçaklar, hat hat (dönüş avcısı, enerji avcısı, ağır avcı, taarruz, pike, bombardıman).
//    Bir uçağı açmak için yalnız temel şeyler gerekir: hattaki önceki uçak ve uçağı mümkün kılan motor/kanat
//    teknolojisi. Donanım (nişangâh, hidrolik kumanda, kabarcık kokpit, acil güç, silah geliştirmeleri…) uçağı açmaz,
//    araştırıldıkça uçağın değerlerine eklenir. Her taraf (oyuncu ya da bot) kendi araştırmasını yapar.
//
// Araştırma oyun zamanında süre alır; savaştan kazanılan puan (düşürme, isabet, görev) havuzda birikir ve
// araştırmayı en fazla iki kat hızlandırır.

import { computeMods, type ModEffects } from './mods';
import type { AircraftSpec } from './aircraft/specs';
import { EN, L } from '../i18n';
import { TECH_EN } from './techEn';

export type TechKind = 'mod' | 'aircraft' | 'aa' | 'radar';
export type ModCategory = 'motor' | 'govde' | 'silah' | 'nisan' | 'menzil';
export type AircraftLine = 'hafif' | 'enerji' | 'agir' | 'taarruz' | 'pike' | 'bombardiman';
export type AAGroup = 'silah' | 'nisan' | 'tahkimat';
export type Era = 1 | 2 | 3 | 4;
export type Slot = 'tech' | 'vehicle' | 'defense';
export const SLOT_ORDER: Slot[] = ['tech', 'vehicle', 'defense'];

export interface TechNode {
  id: string;
  name: string;
  kind: TechKind;
  era: Era;
  cat?: ModCategory;
  line?: AircraftLine;
  rank?: number;
  specId?: string;
  group?: AAGroup;
  /** Hava savunma/radar ağacındaki sütun. */
  tier: number;
  time: number;
  requires: string[];
  desc: string;
  /** Kısa etki özeti (kartta gösterilir). */
  effect?: string;
  /** Başlangıçta açık. */
  starting?: boolean;
  /** Bu sürümde araştırılamaz (sonraki aşama). */
  future?: boolean;
  /** Araştırma panosu aşaması (yoksa nesilden: pervaneli 1, jet 2). */
  stage?: number;
}

export const ERA_NAMES: Record<Era, string> = {
  1: L('Erken pervaneli dönem · 1936–1941', 'Early piston era · 1936–1941'),
  2: L('Gelişmiş pervaneli dönem · 1941–1945', 'Late piston era · 1941–1945'),
  3: L('İlk jetler · 1944–1955', 'First jets · 1944–1955'),
  4: L('Sonraki aşama · radar ve füze', 'Next stage · radar and missiles'),
};

export const CAT_NAMES: Record<ModCategory, string> = {
  motor: L('Motor', 'Engine'),
  govde: L('Gövde ve zırh', 'Airframe and armour'),
  silah: L('Silah', 'Weapons'),
  nisan: L('Nişan ve elektronik', 'Sights and electronics'),
  menzil: L('Yakıt ve menzil', 'Fuel and range'),
};

export const CAT_ICONS: Record<ModCategory, string> = { motor: '⚙', govde: '⛨', silah: '✦', nisan: '◎', menzil: '⛽' };

export const LINE_NAMES: Record<AircraftLine, string> = {
  hafif: L('Avcı · dönüş', 'Fighter · turn'),
  enerji: L('Avcı · enerji', 'Fighter · energy'),
  agir: L('Ağır avcı · avcı-bombardıman', 'Heavy fighter · fighter-bomber'),
  taarruz: L('Taarruz', 'Ground attack'),
  pike: L('Pike bombardıman', 'Dive bomber'),
  bombardiman: L('Bombardıman', 'Bomber'),
};

export const LINE_ORDER: AircraftLine[] = ['hafif', 'enerji', 'agir', 'taarruz', 'pike', 'bombardiman'];

export const RANK_NAMES: Record<number, string> = {
  1: 'I · 1936–40', 2: 'II · 1940–42', 3: 'III · 1942–44', 4: 'IV · 1944–45', 5: L('V · ilk jetler', 'V · first jets'), 6: L('VI · ok kanat', 'VI · swept wing'),
  7: L('Sonraki aşama', 'Next stage'),
};

export const AA_GROUP_NAMES: Record<AAGroup, string> = {
  silah: L('Silahlar', 'Guns'), nisan: L('Nişan ve atış kontrolü', 'Sighting and fire control'), tahkimat: L('Tahkimat', 'Fortification'),
};

const mod = (
  id: string, name: string, era: Era, cat: ModCategory, time: number, requires: string[], desc: string, effect: string,
): TechNode => ({ id, name, kind: 'mod', era, cat, tier: era, time, requires, desc, effect });

const ac = (
  specId: string, line: AircraftLine, rank: number, time: number, requires: string[], o: Partial<TechNode> = {},
): TechNode => ({
  id: `ac_${specId}`, name: specId, kind: 'aircraft', era: rank <= 1 ? 1 : rank <= 4 ? 2 : rank <= 6 ? 3 : 4,
  line, rank, specId, tier: rank, time, requires, desc: '', ...o,
});

export const TECH: TechNode[] = [
  // ================================================================ Modifikasyonlar — 1. dönem
  mod('m_vp_prop', 'Sabit devirli pervane', 1, 'motor', 60, [],
    'Pervane palalarının açısı uçuşta otomatik ayarlanır: kalkış, tırmanış ve alçak hızda çok daha fazla itki.', '+%18 statik itki'),
  mod('m_v12', 'Gelişmiş V12 sıra motor', 1, 'motor', 110, ['m_vp_prop'],
    'Sıvı soğutmalı V12 motorlarda daha yüksek devir ve sıkıştırma. Spitfire, Bf 109 F ve Bf 110 hattını açar.', 'Sıra motorlar +%6 güç'),
  mod('m_100oct', '100 oktan yakıt', 1, 'motor', 90, ['m_v12'],
    'Yüksek oktanlı yakıtla süperşarj basıncı artırılır: kritik irtifanın altında belirgin güç artışı.', 'Alçakta +%14 güç'),
  mod('m_radial1', 'Çift sıra radyal motor', 1, 'motor', 110, ['m_vp_prop'],
    'Hava soğutmalı, dayanıklı 14 silindirli radyal motorlar.', 'Radyal motorlar +%6 güç'),
  mod('self_sealing', 'Kendini sızdırmaz yakıt deposu', 1, 'govde', 80, [],
    'Kauçuk katmanlı depo mermi deliğini kendiliğinden kapatır: sızıntı, yangın ve depo infilakı ihtimali çok azalır. 1941 sonrası tasarımlarda fabrikadan gelir (Japon uçakları hariç); bu araştırma eski ve korumasız uçaklara uygular.', 'Sızıntı/yangın ×0,4'),
  mod('pilot_armor', 'Pilot zırhı ve zırhlı ön cam', 1, 'govde', 70, [],
    'Koltuk arkasında çelik plaka, önde kurşun geçirmez cam. Arkadan gelen mermiler pilotu çok daha az yaralar.', 'Pilot isabeti ×0,4'),
  mod('a_metal', 'Gerilimli metal kaplama', 1, 'govde', 90, [],
    'Kumaş kaplama yerine yük taşıyan alüminyum kaplama: gövde isabetlere daha dayanıklı.', '+%12 gövde dayanımı'),
  mod('w_mg8', 'Kanat makineli bataryası', 1, 'silah', 60, [],
    'Kanatlarda daha büyük mühimmat kutuları ve ısıtmalı makineliler.', 'Makineli mühimmatı +%25'),
  mod('w_20mm', '20 mm kanat topu', 1, 'silah', 110, ['w_mg8'],
    'Patlayıcı mermili 20 mm toplar; tamburlu besleme yerine daha büyük şarjörler. Toplu avcıları açar.', 'Top mühimmatı +%30'),
  mod('w_turret', 'Çift namlulu savunma makineli', 1, 'silah', 90, [],
    'Bombardıman ve pike uçaklarının nişancı yerlerinde çift namlu.', 'Taret atış hızı +%40'),
  mod('n_reflector', 'Refleks nişangâh', 1, 'nisan', 60, [],
    'Ön camdaki ışıklı nişan halkası: pilot hedefe daha isabetli nişan alır.', 'Avcı nişan hatası −%15'),
  mod('bombsight2', 'Gelişmiş bomba nişangâhı', 1, 'nisan', 110, [],
    'Rüzgâr ve sürüklenme hesaplayan jiroskoplu nişangâh: yatay bombardımanda isabet iki katına çıkar.', 'Yatay bombardıman hatası ×0,5'),
  mod('n_divesight', 'Pike nişangâhı ve otomatik toparlanma', 1, 'nisan', 90, [],
    'Dalış açısı göstergesi ve bombayı bırakınca uçağı otomatik toparlayan sistem.', 'Pike isabet hatası −%40'),
  mod('n_recon', 'Hedef keşif fotoğrafları', 1, 'nisan', 100, ['bombsight2'],
    'Keşif uçuşlarında çekilen hedef fotoğraflarıyla brifing: pilotlar hedefi önceden tanır. Bütün saldırı görevlerinde başarı ihtimalini artırır.', 'Saldırı nişan hatası −%25'),
  mod('drop_tanks', 'Atılabilir yakıt tankı', 1, 'menzil', 60, [],
    'Avcılara gövde altı yakıt tankı. Çatışmaya girerken tank atılır.', 'Dış tank kullanılabilir'),
  // ================================================================ Modifikasyonlar — 2. dönem
  mod('m_2stage', 'İki kademeli süperşarj', 2, 'motor', 150, ['m_100oct'],
    'İki kademeli, ara soğutuculu süperşarj: motor yüksek irtifada da tam güç verir. Spitfire IX ve P-51D’yi açar.', 'Sıra motorlar +600 m kritik irtifa'),
  mod('m_wep', 'Su-metanol enjeksiyonu (acil güç)', 2, 'motor', 120, ['m_100oct'],
    'Kısa süre (en fazla 5 dk) fazladan güç: kaçarken ya da dalaşta kullanılır.', 'Acil güç açılır'),
  mod('m_radial2', '2000 bg radyal motor', 2, 'motor', 150, ['m_radial1'],
    '18 silindirli dev radyal motorlar. Fw 190, P-47 ve ağır bombardıman uçaklarını açar.', 'Radyal motorlar +%6 güç'),
  mod('m_turbo', 'Turbo süperşarj', 2, 'motor', 160, ['m_2stage', 'm_radial2'],
    'Egzozla dönen türbin: radyal motor 9 km’ye kadar deniz seviyesi gücünü korur. P-47D ve B-17G’yi açar.', 'Turbo süperşarjlı uçaklar'),
  mod('a_bubble', 'Kabarcık kokpit', 2, 'govde', 90, ['a_metal'],
    'Damla biçimli tek parça kanopi: pilot arkasını görebilir, sürpriz dalışlar daha erken fark edilir.', 'Arka görüş +%15'),
  mod('a_tub', 'Zırhlı kokpit küveti', 2, 'govde', 120, ['pilot_armor'],
    'Motoru, pilotu ve depoyu saran tek parça çelik küvet. Il-2 hattını açar.', 'Taarruz zırhı +0,1'),
  mod('p_gsuit', 'G elbisesi', 2, 'govde', 110, ['pilot_armor'],
    'Sert dönüşte bacak ve karına basınç uygulayan şişme elbise: kan beyinden çekilmez, pilot yüksek G’ye daha uzun dayanır. ABD avcı pilotları 1944’ten, Kore’de F-86 pilotları kullandı; MiG-15 pilotlarında yoktu.', 'Avcı pilotu: G yorgunluğu eşiği +1 G, birikim yarıya'),
  mod('a_laminar', 'Laminer akış kanadı', 2, 'govde', 140, ['a_metal'],
    'Akışın kanat yüzeyinde daha uzun düzgün kaldığı profil: yüksek hızda düşük sürükleme. P-51D’yi açar.', 'P-51D hattı'),
  mod('a_diveflap', 'Delikli pike flapları', 2, 'govde', 80, ['n_divesight'],
    'Dalışta hızı sınırlayan delikli flaplar: dalış kararlı ve isabetli. SBD ve Ju 88’i açar.', 'Pike uçakları'),
  mod('w_hispano', 'Hispano 20 mm (kayışlı)', 2, 'silah', 100, ['w_20mm'],
    'Yüksek namlu hızlı, kayışla beslenen 20 mm top: daha uzun ve öldürücü seriler.', 'Top hasarı +%12'),
  mod('rockets', 'Havadan karaya roket', 2, 'silah', 100, ['w_20mm'],
    'Kanat altı roket rayları: RS-82, RP-3, HVAR. Taarruz uçaklarına ve avcı-bombardımanlara roket yükü.', 'Roket yükleri'),
  mod('n_rocketsight', 'Roket nişangâhı ve taarruz eğitimi', 2, 'nisan', 110, ['rockets'],
    'Roket atışı için düzeltilmiş nişangâh ve alçak irtifa taarruz eğitimi: roketler hedefe çok daha toplu düşer.', 'Roket dağılması −%40'),
  mod('w_heavybomb', 'Ağır bomba askısı', 2, 'silah', 90, ['bombsight2'],
    '1000 kg / 1000 lb bombalar için güçlendirilmiş askı ve bomba bölmesi.', 'Ağır bomba yükleri'),
  mod('w_30mm', '30 mm MK 108 top', 2, 'silah', 120, ['w_hispano'],
    'Kısa namlulu, çok ağır mermili top: üç isabet bir bombardıman uçağını düşürür.', '30 mm silah seçenekleri'),
  mod('w_power_turret', 'Hidrolik güç taretleri', 2, 'silah', 120, ['w_turret'],
    'Motorlu, çift 12,7 mm taretler: nişancı hedefi çok daha iyi izler.', 'Taret nişan hatası −%28'),
  mod('n_gyro', 'Jiroskoplu nişangâh (K-14)', 2, 'nisan', 140, ['n_reflector'],
    'Dönüş hızından ön nişanı hesaplayan nişangâh: sapma atışlarında büyük isabet artışı.', 'Nişan hatası −%22, menzil +%20'),
  mod('f_bigtank', 'Büyük atılabilir tanklar', 2, 'menzil', 80, ['drop_tanks'],
    '108 galonluk tanklar: eskort avcıları bombardıman uçaklarına hedefe kadar eşlik eder.', 'Dış tank +%60'),
  mod('f_internal', 'Gövde içi ek yakıt tankı', 2, 'menzil', 90, ['f_bigtank'],
    'Kokpit arkasına ek tank (dolu iken ağırlık merkezi arkaya kayar).', 'İç yakıt +%15'),
  // ================================================================ Modifikasyonlar — 3. dönem
  mod('j_centrifugal', 'Santrifüj akışlı turbojet', 3, 'motor', 220, ['m_2stage'],
    'Sağlam, basit santrifüj kompresörlü jet motoru. Meteor ve Canberra’yı açar.', 'Jet çağı'),
  mod('j_axial', 'Eksenel akışlı turbojet', 3, 'motor', 240, ['m_2stage', 'm_wep'],
    'İnce, güçlü ama hassas eksenel kompresörlü jet motoru. Me 262 ve F-84’ü açar.', 'Jet çağı'),
  mod('j_nene', 'Yüksek itkili turbojet', 3, 'motor', 220, ['j_centrifugal'],
    '2,5 tonluk itki sınıfı motorlar (Nene / VK-1 / J47).', 'Jet itkisi +%5'),
  mod('j_swept', 'Ok kanat (35°)', 3, 'govde', 260, ['j_centrifugal', 'a_laminar'],
    'Geriye açılı kanat sıkıştırılabilirliği geciktirir: ses hızına yaklaşan avcılar.', 'MiG-15 ve F-86'),
  mod('j_eject', 'Fırlatma koltuğu', 3, 'govde', 120, ['a_bubble'],
    'Yüksek hızda bile pilot kurtulur. Yalnız jetlere takılır.', 'Jet pilotu kurtulma ihtimali artar'),
  mod('j_hydraulic', 'Hidrolik güç destekli kumandalar', 3, 'govde', 150, ['j_swept'],
    'Kanatçıklar yüksek hızda ağırlaşmaz: jetler transonikte de çevik yuvarlanır. Jeti açmak için gerekmez; araştırılınca tarafın bütün jetlerine eklenir.', 'Jet yuvarlanması yüksek hızda ×1,7'),
  mod('j_37mm', '37 mm hava topu', 3, 'silah', 120, ['w_30mm'],
    'Bombardıman uçaklarına karşı ağır top.', 'MiG-15 silahı'),
  mod('j_radarsight', 'Radar telemetreli nişangâh', 3, 'nisan', 160, ['n_gyro'],
    'Burun radarı mesafeyi ölçer, nişangâh ön nişanı tam verir (F-86’nın A-1CM’i). Yalnız jet avcılarına sığar; uçağı açmak için gerekmez, araştırılınca eklenir.', 'Jet avcısı nişan hatası −%28'),
  mod('j_tiptank', 'Kanat ucu yakıt tankları', 3, 'menzil', 90, ['f_bigtank'],
    'Jetler için kanat ucu tankları.', 'Jet dış tankları'),

  // ================================================================ Araç ağacı
  ac('hurricane1', 'hafif', 1, 0, [], { starting: true }),
  ac('spitfire1', 'hafif', 2, 150, ['ac_hurricane1', 'a_metal', 'm_v12']),
  ac('spitfire5', 'hafif', 3, 170, ['ac_spitfire1', 'm_100oct']),
  ac('spitfire9', 'hafif', 4, 210, ['ac_spitfire5', 'm_2stage']),
  ac('meteor3', 'hafif', 5, 260, ['ac_spitfire9', 'j_centrifugal']),
  ac('f86f', 'hafif', 6, 320, ['ac_meteor3', 'j_swept']),
  ac('bf109e', 'enerji', 1, 0, [], { starting: true }),
  ac('bf109f', 'enerji', 2, 150, ['ac_bf109e', 'm_100oct']),
  ac('bf109g', 'enerji', 3, 180, ['ac_bf109f']),
  ac('p51d', 'enerji', 4, 220, ['ac_bf109g', 'a_laminar', 'm_2stage']),
  ac('me262', 'enerji', 5, 270, ['ac_p51d', 'j_axial']),
  ac('mig15', 'enerji', 6, 320, ['ac_me262', 'j_swept', 'j_nene']),
  ac('bf110c', 'agir', 2, 140, ['m_v12']),
  ac('fw190a5', 'agir', 3, 180, ['ac_bf110c', 'm_radial2']),
  ac('p47d', 'agir', 4, 220, ['ac_fw190a5', 'm_turbo']),
  ac('f84g', 'agir', 6, 280, ['ac_p47d', 'j_axial']),
  ac('il2', 'taarruz', 2, 140, ['a_tub']),
  ac('il2m3', 'taarruz', 3, 160, ['ac_il2']),
  ac('typhoon', 'taarruz', 4, 190, ['ac_il2m3', 'm_100oct']),
  ac('il10', 'taarruz', 4, 190, ['ac_il2m3']),
  ac('ju87b', 'pike', 1, 0, [], { starting: true }),
  ac('sbd3', 'pike', 2, 140, ['ac_ju87b', 'a_diveflap', 'm_radial1']),
  ac('ju87d', 'pike', 3, 160, ['ac_sbd3']),
  ac('sb2c', 'pike', 4, 190, ['ac_ju87d', 'm_radial2']),
  ac('he111', 'bombardiman', 1, 0, [], { starting: true }),
  ac('ju88a4', 'bombardiman', 2, 170, ['ac_he111', 'a_diveflap']),
  ac('b25j', 'bombardiman', 3, 220, ['ac_ju88a4', 'm_radial2']),
  ac('b17g', 'bombardiman', 4, 280, ['ac_b25j', 'm_turbo']),
  ac('canberra', 'bombardiman', 6, 300, ['ac_b17g', 'j_centrifugal']),
  // Jet dönemiyle aynı yıllarda yapılmış son pervaneliler (ilk nesil jetler aşamasında)
  ac('seafury', 'hafif', 5, 240, ['ac_typhoon', 'm_radial2'], { stage: 2 }),
  ac('f8f', 'enerji', 5, 230, ['ac_p51d', 'm_radial2'], { stage: 2 }),
  ac('f4u4', 'agir', 5, 240, ['ac_p47d'], { stage: 2 }),
  ac('ad4', 'pike', 5, 260, ['ac_sb2c'], { stage: 2 }),
  ac('a26b', 'taarruz', 5, 250, ['ac_il10', 'ac_b25j'], { stage: 2 }),
  ac('b29', 'bombardiman', 5, 360, ['ac_b17g'], { stage: 2 }),
  // Çeşitlilik: aynı hatlarda başka ülkelerin uçakları
  ac('i16', 'hafif', 1, 90, ['m_vp_prop']),
  ac('blenheim', 'bombardiman', 1, 90, ['m_vp_prop']),
  ac('a6m2', 'hafif', 2, 150, ['ac_i16', 'm_radial1']),
  ac('p40e', 'agir', 2, 140, ['m_v12']),
  ac('pe2', 'pike', 3, 170, ['ac_ju87b', 'a_diveflap', 'm_v12']),
  ac('yak3', 'hafif', 4, 200, ['ac_spitfire5']),
  ac('la7', 'enerji', 4, 200, ['ac_bf109g', 'm_radial2']),
  ac('p38j', 'agir', 4, 230, ['ac_bf110c', 'm_turbo']),
  ac('f6f5', 'agir', 4, 220, ['ac_fw190a5', 'm_radial2']),
  ac('lancaster', 'bombardiman', 4, 290, ['ac_b25j']),
  ac('mosquito', 'taarruz', 4, 230, ['ac_il2m3', 'm_100oct']),
  ac('he162', 'enerji', 5, 220, ['ac_me262']),
  ac('me262u4', 'enerji', 5, 230, ['ac_me262']),
  ac('f80c', 'agir', 5, 250, ['ac_p47d', 'j_centrifugal']),
  ac('vampire', 'hafif', 5, 240, ['ac_spitfire9', 'j_centrifugal']),
  ac('ar234', 'bombardiman', 5, 280, ['ac_ju88a4', 'j_axial']),
  ac('il28', 'bombardiman', 6, 320, ['ac_ar234', 'j_nene']),
  ac('f15a', 'hafif', 7, 0, ['future'], { future: true }),
  ac('f22a', 'hafif', 7, 0, ['future'], { future: true }),
  ac('mig21', 'enerji', 7, 0, ['future'], { future: true }),
  ac('rafale', 'enerji', 7, 0, ['future'], { future: true }),
  ac('f4e', 'agir', 7, 0, ['future'], { future: true }),

  // ================================================================ Hava savunma
  { id: 'hd_20', name: '2 cm Flak 38', kind: 'aa', era: 1, group: 'silah', tier: 1, time: 80, requires: [],
    desc: 'Alman hafif uçaksavar topu: dakikada 200 mermi, 20’lik şarjörle seri atar. İzli mermi 6 sn’de, yaklaşık 2,2 km’de kendini imha eder.', effect: 'Mevzilere 20 mm takılabilir' },
  { id: 'hd_oerlikon', name: 'Oerlikon 20 mm', kind: 'aa', era: 1, group: 'silah', tier: 2, time: 90, requires: ['hd_20'],
    desc: 'İsviçre tasarımı hafif top: 60’lık tamburla uzun seri atar, elle çabuk döner. Menzili Flak 38’den kısa.', effect: 'Mevzilere Oerlikon takılabilir' },
  { id: 'hd_20q', name: '2 cm Flakvierling 38', kind: 'aa', era: 2, group: 'silah', tier: 2, time: 120, requires: ['hd_20', 'hd_fort1'],
    desc: 'Tek lafet üstünde dört 20 mm top: dakikada 800 mermi. Alçaktan gelen taarruz uçaklarına karşı ölümcül, ama menzili kısa.', effect: 'Mevzilere 4×20 mm takılabilir' },
  { id: 'hd_37', name: '3,7 cm Flak 36', kind: 'aa', era: 1, group: 'silah', tier: 2, time: 120, requires: ['hd_20'],
    desc: 'Alman orta uçaksavar topu: 6’lık taraklarla atar, izli mermi 4,2 km’de kendini imha eder.', effect: 'Mevzilere 37 mm takılabilir' },
  { id: 'hd_40', name: 'Bofors 40 mm L/60', kind: 'aa', era: 2, group: 'silah', tier: 3, time: 150, requires: ['hd_37', 'hd_rangefinder'],
    desc: 'İsveç tasarımı, savaşın en yaygın orta uçaksavarı: 3,8 km pratik tavan, 0,9 kg izli mermi, 4’lük taraklar. Namlusu hızlı döner, alçak uçağı izler. Hesaplayıcı ve yakınlık tapasıyla çok etkili.', effect: 'Mevzilere 40 mm takılabilir' },
  { id: 'hd_88', name: '8,8 cm Flak 36', kind: 'aa', era: 2, group: 'silah', tier: 3, time: 180, requires: ['hd_37', 'hd_rangefinder'],
    desc: 'Zaman tapalı ağır flak: etkili tavan 8 km. Mermi 8 km’ye yaklaşık 20 sn’de gider; o sırada rota değiştiren uçak kurtulur.', effect: 'Mevzilere 88 mm takılabilir' },
  { id: 'hd_90', name: '90 mm M1', kind: 'aa', era: 2, group: 'silah', tier: 4, time: 190, requires: ['hd_88', 'hd_predictor'],
    desc: 'ABD ağır topu: etkili tavan ~11,5 km, dakikada 20 atış. Atış kontrol aletleriyle çok verimli.', effect: 'Mevzilere 90 mm takılabilir' },
  { id: 'hd_flak41', name: '8,8 cm Flak 41', kind: 'aa', era: 3, group: 'silah', tier: 5, time: 210, requires: ['hd_90', 'hd_fort2'],
    desc: 'Yeni nesil 8,8 cm: 1.000 m/sn namlu hızı, etkili tavan 11,3 km. Mermi aynı yüksekliğe çok daha çabuk varır; pahalıdır.', effect: 'Mevzilere Flak 41 takılabilir' },
  { id: 'hd_128', name: '12,8 cm Flak 40', kind: 'aa', era: 3, group: 'silah', tier: 5, time: 220, requires: ['hd_88', 'hd_predictor', 'hd_fort2'],
    desc: '13 km tavan, 26 kg mermi, geniş parça yarıçapı. B-29 gibi çok yüksekten gelen bombardıman uçaklarının tek ilacı; yavaş ateş eder ve pahalıdır.', effect: 'Mevzilere 128 mm takılabilir' },
  { id: 'hd_ammo', name: 'Gelişmiş uçaksavar mühimmatı', kind: 'aa', era: 2, group: 'silah', tier: 4, time: 140, requires: ['hd_37', 'w_hispano'],
    desc: 'Daha güçlü patlayıcı ve iyileştirilmiş tapalar. Tüm bataryalarda geçerli; ayrıca kurulum gerekmez.', effect: 'Tüm uçaksavar hasarı +%15' },
  { id: 'hd_rangefinder', name: 'Optik telemetre', kind: 'aa', era: 1, group: 'nisan', tier: 1, time: 90, requires: ['hd_20'],
    desc: 'Mesafe ölçümü: tüm silahların nişan hatası azalır, hedef daha çabuk alınır.', effect: 'Mevziye kurulur' },
  { id: 'hd_predictor', name: 'Mekanik atış hesaplayıcı', kind: 'aa', era: 2, group: 'nisan', tier: 2, time: 150, requires: ['hd_88'],
    desc: 'Hedefin rotasını hesaplayıp ön nişanı otomatik verir. Ağır ve orta toplarda büyük isabet artışı.', effect: 'Mevziye kurulur' },
  { id: 'hd_gunradar', name: 'Atış kontrol radarı', kind: 'aa', era: 2, group: 'nisan', tier: 3, time: 200, requires: ['radar_ew1', 'hd_predictor'],
    desc: 'Uçaksavar mevzisine radar: hedefi gözle görmeden izler, ağır topların hatası çok azalır.', effect: 'Mevziye kurulur' },
  { id: 'hd_vt', name: 'Yakınlık tapası', kind: 'aa', era: 2, group: 'nisan', tier: 4, time: 240, requires: ['hd_gunradar'],
    desc: 'Mermiler hedefe yaklaşınca patlar: öldürücü yarıçap büyür.', effect: 'Mevziye kurulur' },
  { id: 'hd_crew', name: 'Uçaksavar topçu okulu', kind: 'aa', era: 1, group: 'nisan', tier: 2, time: 110, requires: ['hd_rangefinder', 'observer'],
    desc: 'Eğitimli nişancılar hedefi daha çabuk alır, daha az ıskalar. Tüm bataryalarda geçerli; kurulum gerekmez.', effect: 'Mürettebat becerisi +%22' },
  { id: 'hd_fort1', name: 'Mevzi tahkimatı I', kind: 'aa', era: 1, group: 'tahkimat', tier: 1, time: 60, requires: [],
    desc: 'Kum torbası yerine beton çukurlar ve cephane sığınakları: mevziler seviye 2’ye yükseltilebilir, silah yuvası 2’den 4’e çıkar.', effect: 'Seviye 2 yükseltmesi' },
  { id: 'hd_fort2', name: 'Mevzi tahkimatı II', kind: 'aa', era: 2, group: 'tahkimat', tier: 2, time: 90, requires: ['hd_fort1', 'hd_37'],
    desc: 'Derin beton çukurlar ve komuta sığınağı: mevziler seviye 3’e yükseltilebilir, bataryaya gelen bomba ve roket hasarı %15 azalır.', effect: 'Seviye 3 yükseltmesi' },
  { id: 'hd_camo', name: 'Kamuflaj ve sahte mevziler', kind: 'aa', era: 2, group: 'tahkimat', tier: 3, time: 120, requires: ['hd_fort2'],
    desc: 'Ağlar, boyalar ve tahta sahte toplar: saldıranlar gerçek yuvaları ayırt etmekte zorlanır. Tüm bataryalarda geçerli.', effect: 'Bataryalara bomba/roket hasarı −%25' },
  { id: 'hd_fort3', name: 'Mevzi tahkimatı III (flak kalesi)', kind: 'aa', era: 3, group: 'tahkimat', tier: 4, time: 160, requires: ['hd_fort2', 'hd_88', 'hd_camo'],
    desc: 'Beton flak kalesi: mevziler seviye 4’e yükseltilebilir, bataryaya gelen bomba ve roket hasarı toplam %30 azalır.', effect: 'Seviye 4 yükseltmesi' },

  // ================================================================ Radar ve komuta
  { id: 'observer', name: 'Hava gözetleme ağı', kind: 'radar', era: 1, tier: 1, time: 60, requires: [],
    desc: 'Yer gözcüleri ve telefon hattı: yapılarınızın çevresinde görülen uçaklar daha uzaktan ve kesin bildirilir.', effect: 'Gözcü menzili +%50' },
  { id: 'radio', name: 'Telsiz ağı', kind: 'radar', era: 1, tier: 1, time: 70, requires: [],
    desc: 'Görülen düşman uçakları tüm kollarla paylaşılır.', effect: 'Temas paylaşımı' },
  { id: 'radar_ew1', name: 'Erken ihbar radarı I', kind: 'radar', era: 1, tier: 2, time: 180, requires: ['hd_rangefinder'],
    desc: 'Radar istasyonu kurulabilir: 80 km menzil. Alçak irtifada (≈350 m altı) kör, tepelerin arkasını göremez.', effect: 'Radar istasyonu' },
  { id: 'gci', name: 'Yer kontrollü önleme', kind: 'radar', era: 2, tier: 3, time: 120, requires: ['radar_ew1', 'radio'],
    desc: 'Radar temasları avcılara iletilir; önleme ve devriye kolları gözle görmeden hedefe yönlendirilir.', effect: 'GCI' },
  { id: 'radar_ew2', name: 'Erken ihbar radarı II', kind: 'radar', era: 2, tier: 3, time: 200, requires: ['radar_ew1'],
    desc: '120 km menzil, alçak irtifa kör bölgesi ≈120 m’ye iner.', effect: 'Radarlar seviye II' },
];

// Zorluk: yukarıdaki süreler taban değerdir. Gerçek süre dönemle (modifikasyon, hava savunma, radar) ya da
// rütbeyle (uçak) büyür: erken pervaneli 3-5 dk, ilk jetler 10-20 dk, F-86 / MiG-15 yarım saati bulur.
for (const t of TECH) {
  const en = EN ? TECH_EN[t.id] : undefined;
  if (en) [t.name, t.desc, t.effect] = en;
  if (t.kind === 'aircraft') t.time = Math.round(t.time * (2 + 0.6 * (t.rank ?? 1)));
  else t.time = Math.round(t.time * ([0, 3, 4, 5, 5][t.era] ?? 4));
}

export const TECH_BY_ID: Record<string, TechNode> = Object.fromEntries(TECH.map((t) => [t.id, t]));

export function aircraftNode(specId: string): TechNode | undefined {
  return TECH_BY_ID[`ac_${specId}`];
}

interface SlotState {
  current: { id: string; progress: number; paid: number } | null;
  queue: string[];
}

/** Savaş puanı havuzu araştırmayı en fazla bu kadar hızlandırır (1 + BOOST). */
export const BOOST = 1;

export class Research {
  readonly done = new Set<string>();
  readonly slots: Record<Slot, SlotState> = {
    tech: { current: null, queue: [] },
    vehicle: { current: null, queue: [] },
    defense: { current: null, queue: [] },
  };
  /** Savaş puanı havuzu (araştırma saniyesi cinsinden). */
  points = 0;
  totalPoints = 0;
  /** Her tamamlanan araştırmada artar (etki önbelleği için). */
  version = 0;
  /** Araştırma başlarken ödeme: ödenen tutar ya da (para yetmezse) null. Yoksa ücretsiz. */
  payer: ((t: TechNode) => number | null) | null = null;
  refunder: ((amount: number) => void) | null = null;
  /** Parası beklenen düğüm (hat başına). */
  readonly waiting: Record<Slot, string | null> = { tech: null, vehicle: null, defense: null };
  private modsCache: { version: number; mods: ModEffects } | null = null;
  private specMods = new Map<string, { version: number; mods: ModEffects }>();

  constructor(initial: string[] = []) {
    for (const t of TECH) if (t.starting) this.done.add(t.id);
    for (const id of initial) this.done.add(id);
  }

  has(id: string | undefined): boolean {
    return !id || this.done.has(id);
  }

  hasAircraft(specId: string): boolean {
    return this.done.has(`ac_${specId}`);
  }

  slotOf(t: TechNode): Slot {
    return t.kind === 'aircraft' ? 'vehicle' : t.kind === 'mod' ? 'tech' : 'defense';
  }

  available(t: TechNode): boolean {
    return !t.future && !this.done.has(t.id) && t.requires.every((r) => this.done.has(r));
  }

  isActive(id: string): boolean {
    return SLOT_ORDER.some((k) => this.slots[k].current?.id === id);
  }

  isQueued(id: string): boolean {
    return SLOT_ORDER.some((k) => this.slots[k].queue.includes(id));
  }

  /** Araştırmayı başlat ya da kuyruğa ekle. Önkoşulları eksikse onları da kendi hatlarına koyar. */
  enqueue(id: string): void {
    const t = TECH_BY_ID[id];
    if (!t || t.future || this.done.has(id) || this.isActive(id) || this.isQueued(id)) return;
    for (const r of t.requires) this.enqueue(r);
    this.slots[this.slotOf(t)].queue.push(id);
    this.startNext(this.slotOf(t));
  }

  cancel(id: string): void {
    for (const k of SLOT_ORDER) {
      const sl = this.slots[k];
      const i = sl.queue.indexOf(id);
      if (i >= 0) sl.queue.splice(i, 1);
      if (sl.current?.id === id) {
        // İptalde harcanmamış kısmın %80'i geri döner
        if (sl.current.paid > 0) this.refunder?.(Math.round(sl.current.paid * (1 - sl.current.progress) * 0.8));
        sl.current = null;
        this.startNext(k);
      }
      if (this.waiting[k] === id) this.waiting[k] = null;
    }
  }

  /** Savaş puanı kazan (düşürme, isabet, görev). */
  award(points: number): void {
    if (points <= 0) return;
    this.points += points;
    this.totalPoints += points;
  }

  /** Şu an puan havuzu araştırmayı hızlandırıyor mu. */
  get boosting(): boolean {
    return this.points > 0 && SLOT_ORDER.some((k) => !!this.slots[k].current);
  }

  get mods(): ModEffects {
    if (!this.modsCache || this.modsCache.version !== this.version) {
      this.modsCache = { version: this.version, mods: computeMods(this.done) };
    }
    return this.modsCache.mods;
  }

  /** Bu uçağa uygulanan etkiler (yalnız ona uygun araştırmalar). */
  modsFor(spec: AircraftSpec): ModEffects {
    const c = this.specMods.get(spec.id);
    if (c && c.version === this.version) return c.mods;
    const mods = computeMods(this.done, spec);
    this.specMods.set(spec.id, { version: this.version, mods });
    return mods;
  }

  private startNext(slot: Slot): void {
    const sl = this.slots[slot];
    if (sl.current) return;
    const i = sl.queue.findIndex((id) => this.available(TECH_BY_ID[id]));
    if (i < 0) {
      this.waiting[slot] = null;
      return;
    }
    const id = sl.queue[i];
    const paid = this.payer ? this.payer(TECH_BY_ID[id]) : 0;
    if (paid === null) {
      // Para yetmiyor: sırada bekler, her adımda yeniden denenir
      this.waiting[slot] = id;
      return;
    }
    this.waiting[slot] = null;
    sl.queue.splice(i, 1);
    sl.current = { id, progress: 0, paid };
  }

  /**
   * Eski kayıt: hava savunma ve radar işleri mühendislik hattındaydı. Sürmekte olan iş ilerlemesi ve ödenen parasıyla, sıradakiler
   * sırasıyla yeni hatta geçer.
   */
  moveOldDefenseJobs(): void {
    const old = this.slots.tech;
    const def = this.slots.defense;
    const isDef = (id: string) => TECH_BY_ID[id] && this.slotOf(TECH_BY_ID[id]) === 'defense';
    if (old.current && isDef(old.current.id) && !def.current) {
      def.current = old.current;
      old.current = null;
    }
    const moved = old.queue.filter(isDef);
    if (moved.length) {
      def.queue.push(...moved);
      old.queue.splice(0, old.queue.length, ...old.queue.filter((id) => !isDef(id)));
    }
  }

  /** Tamamlanan araştırmaların kimlikleri. */
  update(dt: number): string[] {
    const out: string[] = [];
    for (const k of SLOT_ORDER) {
      const sl = this.slots[k];
      if (!sl.current) {
        this.startNext(k);
        continue;
      }
      const t = TECH_BY_ID[sl.current.id];
      const drain = Math.min(this.points, BOOST * dt);
      this.points -= drain;
      sl.current.progress += (dt + drain) / Math.max(t.time, 1);
      if (sl.current.progress >= 1) {
        this.done.add(t.id);
        this.version++;
        sl.current = null;
        out.push(t.id);
        for (const n of SLOT_ORDER) this.startNext(n);
      }
    }
    return out;
  }

  /** Kalan süre tahmini (puan havuzu dahil). */
  remaining(id: string): number {
    const t = TECH_BY_ID[id];
    const cur = this.slots[this.slotOf(t)].current;
    const left = t.time * (1 - (cur?.id === id ? cur.progress : 0));
    const boosted = Math.min(this.points, left * BOOST / (1 + BOOST));
    return left - boosted;
  }
}
