# Ekonomi: gelirler, giderler ve fiyatlar

Koddaki değerlerin dökümü. Son düzenleme 2026-11-11: uçaklar ×1,4, hava savunması ×1,5, araştırmalar ×1,6, öbür
yapılar ve üs tesisleri ×3 (maden 11.000, apartman 6.300); evlere kira, parka kira bonusu; maden 550 kr/dk; başlangıç
parası 35.000; pazar, çarşı, iş merkezi ve ambar kaldırıldı. Para birimi **kr**. Süreler
**oyun zamanı**: 2× ve 4× hızda gerçek sürenin yarısı ya da dörtte biri kadar sürer. Kaynak: `src/sim/economy.ts`
(`PRICE_UP`, `HOUSE_INCOME`, `MARKET_ON`), `world.ts`, `missionResult.ts`, `structures/aaWeapons.ts`,
`structures/airDefense.ts`, `structures/structure.ts`, `tech.ts`.

## 1. Başlangıç

| Ne | Değer |
|---|---|
| Başlangıç parası (her taraf) | 35.000 kr (eskiden 25.000) |
| Başlangıç varlıkları | 1 ana hava üssü, 1 uçak fabrikası, 1 maden ocağı, belediye, 4 büyük ev (16 kişi; 2026-11-13'e dek 2 ev), 4 avcı, 2 pike bombardıman |
| Başlangıç personeli | 16 kişi: 6'sı uçakların bakımcısı, 8'i bütün uçaklar kalkınca uçuşta, 2'si boşta |
| Başta açık uçaklar | Hurricane I, Bf 109 E, Ju 87 B, He 111 H (araştırmasız) |

## 2. Gelirler

| Kaynak | Formül | Örnek |
|---|---|---|
| Maden ocağı (pasif) | 550 kr/dk × damar verimi (0,1–2,2) × hasar çarpanı (0,3 + 0,7 × can oranı) | Verim 1: 550 kr/dk · zengin damar 2,2: 1.210 kr/dk · çok zayıf 0,1: 55 kr/dk |
| Evler (pasif kira) | Küçük ev 20 · orta ev 25 · büyük ev 30 · apartman 60 kr/dk; 300 m içindeki her park +%10; hasar maden gibi düşürür | Başlangıçtaki 2 büyük ev: 60 kr/dk; yanında 2 park olan büyük ev: 36 kr/dk |
| Düşman uçağı düşürmek | Uçak fiyatının %20’si | Bf 109 E: 570 · B-17G: 5.690 · Me 262: 2.010 |
| Düşman yapısı yıkmak | Yapı maliyetinin %15’i (eskiden %25) | Hava üssü: 8.505 · fabrika: 5.670 · maden: 1.650 · uçaksavar: 600 |
| Görev: bombardıman, pike, taarruz | 1.200 + hedef yapı maliyetinin %15’i (hedef yoksa 9.000 sayılır); hedef yıkılırsa ×1,5 | Hava üssü hedefi: 9.700 (yıkılırsa 14.550) · uçaksavar: 1.800 |
| Görev: önleme | 800 + hedef kolun değerinin %5’i | 6 × Bf 109 E (17.100) kolu: 1.650 |
| Görev: eskort | 1.000 + korunan kolun değerinin %3’ü | 4 × He 111 (41.000): 2.250 |
| Görev: devriye (CAP) | 800 + düşürülenlerin değerinin %8’i | — |
| Görev: serbest av (sweep) | 600 + düşürülenlerin değerinin %10’u | — |
| Görev: intikal | Ödül yok | — |
| Sipariş ya da araştırma iptali | Ödenenin kalan kısmı geri gelir | — |
| Pazarda uçak satmak | **Kapalı** (pazar kaldırıldı; kodu duruyor, `MARKET_ON`) | — |
| Çarşı, iş merkezi, ambar | **Kaldırıldı** (inşa menüsünde yok; eski kayıtlarda duranlar kalır) | — |

Görev ödülleri 50’ye yuvarlanır ve yalnız görev başarılı sayılırsa ödenir. Görevlerin sabit kısmı ×2 oldu; yapı yıkma
ödülü %25’ten %15’e indi (yapılar ×3 olunca bir üs baskını 50 avcı düşürmeye eşit oluyordu).

### Maden damar kademeleri

| Kademe | Verim | Gelir (sağlam ocak) |
|---|---|---|
| Zengin damar | 1,5–2,2 | 825–1.210 kr/dk |
| Verimli | 0,9–1,5 | 495–825 kr/dk |
| Orta | 0,5–0,9 | 275–495 kr/dk |
| Zayıf | 0,25–0,5 | 138–275 kr/dk |
| Çok zayıf | 0,1–0,25 | 55–138 kr/dk |

Fiyat, sahip olunan (yıkılmamış) her ocak için taban fiyatın %30’u kadar artar. Herkes 1 ocakla başladığı için satın alınan
ilk ocak 14.300, sonra 17.600, 20.900, 24.200… Ocaklar yan yana kurulabilir (2026-11-13'e kadar aralarında en az 2,5 km gerekiyordu); aynı anda en çok 2 ekonomi inşaatı.

Satın alınan ocakların kendini ödeme süresi (dakika, sağlam ocak):

| Ocak | Fiyat | Verim 0,5 (275/dk) | Verim 1 (550/dk) | Verim 1,5 (825/dk) | Verim 2,2 (1.210/dk) |
|---|---|---|---|---|---|
| 2. ocak | 14.300 | 52 | 26 | 17 | 12 |
| 3. ocak | 17.600 | 64 | 32 | 21 | 15 |
| 4. ocak | 20.900 | 76 | 38 | 25 | 17 |
| 5. ocak | 24.200 | 88 | 44 | 29 | 20 |

Evler kendini 45–55 dakikada öder: parksız küçük ev 45, orta ev 51, büyük ev 55, apartman 105 dakika. 1 park yakınsa
41, 46, 50, 95; 2 park yakınsa 38, 43, 46, 88 dakika (park bedeli hariç).

## 3. Giderler

### Yapılar

| Yapı | Eski | Yeni | İnşaat | Not |
|---|---|---|---|---|
| Hava üssü | 18.900 | 56.700 | 4 dk | 24 uçak kapasitesi · üssü kalmamış taraf yenisini yarı fiyatına (28.350) kurar |
| Uçak fabrikası | 12.600 | 37.800 | 3 dk 20 sn | Uçak ve uçaksavar topu üretir |
| Radar istasyonu | 6.300 | 15.000 | 2 dk | Araştırma gerekir |
| Maden ocağı | 6.300 | 11.000 | 2 dk 30 sn | Her yenisi +%30 · 550 kr/dk (verim 1) |
| Uçaksavar bataryası | 2.650 | 4.000 | 1 dk | Hava savunması: ×1,5 |
| Küçük ev | 300 | 900 | 12 sn | 2 kişi · +20 kr/dk |
| Orta ev | 425 | 1.275 | 16 sn | 3 kişi · +25 kr/dk |
| Büyük ev | 550 | 1.650 | 20 sn | 4 kişi · +30 kr/dk |
| Apartman | 1.900 | 6.300 | 50 sn | 16 kişi · +60 kr/dk |
| Park | 400 | 1.200 | 25 sn | 300 m içindeki evlere +%10 kira (her park) · 2026-11-12'den beri orta ev kadar (27 × 27 m; eskiden 104 × 104 m) |
| Belediye binası | — | 5.500 | 1 dk | Gelir getirmez · başlangıçta 1 adet bedava · önünden 200 m ana cadde çıkar (2026-11-12) |
| İtfaiye merkezi | — | 4.200 | 45 sn | 4 boşta personel ister · 2. seviye 3.000, 3. seviye 4.500 kr (her biri +2 personel) · alanındaki ev, apartman ve belediyeyi (yola bağlıysa maden, batarya ve radarı da) elle onarımın yarı fiyatına onarır (2026-11-13) |
| Yol | — | 3 kr/m | hemen | 100 m yol 300 kr · evler ancak yolun yanına kurulur (2026-11-12) |

### Üs tesisleri (×3)

| Tesis | Eski | Yeni | Süre | Etkisi |
|---|---|---|---|---|
| Bakım atölyesi | 2.650 | 7.950 | 1 dk 30 sn | Onarım ve bakım %40 kısa |
| Ek hangarlar | 4.200 | 12.600 | 2 dk | +12 uçak |
| Toprak siperler | 1.550 | 4.650 | 1 dk 20 sn | Apronda bekleyen uçaklar bombadan az zarar görür |

### Hava savunması (×1,5)

| Top | Eski | Yeni | Kurulum | Gereken araştırma |
|---|---|---|---|---|
| M2 Browning 12,7 mm | 300 | 450 | 20 sn | — |
| 2 cm Flak 38 | 850 | 1.300 | 30 sn | hd_20 |
| Oerlikon 20 mm | 1.000 | 1.500 | 30 sn | hd_oerlikon |
| 2 cm Flakvierling 38 | 1.600 | 2.400 | 40 sn | hd_20q |
| 3,7 cm Flak 36 | 1.600 | 2.400 | 45 sn | hd_37 |
| Bofors 40 mm L/60 | 2.500 | 3.750 | 50 sn | hd_40 |
| 8,8 cm Flak 36 | 3.350 | 5.000 | 1 dk | hd_88 |
| 90 mm M1 | 3.900 | 5.850 | 1 dk 5 sn | hd_90 |
| 8,8 cm Flak 41 | 4.800 | 7.200 | 1 dk 15 sn | hd_flak41 |
| 12,8 cm Flak 40 | 6.300 | 9.450 | 1 dk 30 sn | hd_128 |

Top fabrikada üretilip depoya girer, sonra bataryaya takılır. Batarya yükseltmeleri:

| Yükseltme | Eski | Yeni | Süre |
|---|---|---|---|
| Seviye 2 (Mevzi tahkimatı I) | 1.600 | 2.400 | 1 dk |
| Seviye 3 (Mevzi tahkimatı II) | 3.150 | 4.750 | 1 dk 30 sn |
| Seviye 4 (Mevzi tahkimatı III) | 5.800 | 8.700 | 2 dk 20 sn |
| Optik telemetre | 950 | 1.450 | 30 sn |
| Mekanik atış hesaplayıcı | 1.900 | 2.850 | 40 sn |
| Atış kontrol radarı | 3.700 | 5.550 | 1 dk |
| Yakınlık tapası | 2.650 | 4.000 | 30 sn |

### Onarım

Hasarlı yapı son isabetten 10 dakika sonra kendiliğinden onarılmaya başlar. Tam yıkıma yakın hasarın onarımı yapı
maliyetinin %80’i ve 3 saat (oyun zamanı; 2026-11-13'e dek 6 saat) sürer; bedel ilerledikçe adım adım ödenir, para bitince onarım bekler.
Yapılar ×3 olduğu için onarım da ×3 (hava üssünün tam onarımı 45.360 kr).

### Pazar

Kapalı (2026-11-11). Tarafsız ülkelerin teklifleri gelmiyor; hazine penceresinde alım-satım bölümü yok, üst çubuktaki
düğme "Hazine" oldu. Kod duruyor: `economy.ts` `MARKET_ON = true` ile geri açılır.

## 4. Uçaklar (×1,4)

Fiyat formülü: (boş kütle × 0,55 + güç + mürettebat × 150 + taret × 250) × nesil × 0,91 × 1,4, 50’ye yuvarlanır, en
az 650. Güç: pervanelide kW × motor sayısı × 1,1, jette kN × motor sayısı × 100. Nesil çarpanı P1 1 · P2 1,25 · J1 1,8.
Formülün tutmadığı üç uçağın fiyatı elle verildi (`PRICE_OVERRIDE`): Hurricane I 2.600 (formül 3.150), Spitfire I 3.400
(2.950), Ar 234 14.500 (10.950).
Araştırma: (artışsız uçak fiyatı + araştırma süresi × 3) × 0,98 × 1,6.

Bir uçağın bütün bedeli (2026-11-13): araştırma ücreti ve süresi; üretimde fiyatı ve **1 bakım personeli**
(`economy.ts` `MAINT_CREW`; sipariş verilince ya da pazardan alınınca ayrılır, uçak düşene, satılana ya da sipariş iptal
edilene dek onda kalır); kalkarken uçuş mürettebatı (`spec.crew`, inince geri döner, düşerse kurtulamayanlar ölür).
Boşta kimse yoksa sipariş ve pazar alımı açılmaz. Bu kuraldan önceki bir kayıt açılınca her tarafa eksik konut bedava
kurulur (kira getirir): eskiden kalkabilen her uçak yine kalkabilsin diye, bakımcılardan eski konut fazlasıyla
karşılanamayan kadar. Yer bulunamazsa o kadar uçak bakımcısız kalır.

| Uçak | Rol | Yıl | Nesil | Fiyat | Üretim | Araştırma | Arş. süresi | Düşürme ödülü |
|---|---|---|---|---|---|---|---|---|
| Hurricane I | Avcı | 1937 | P1 | 2.600 | 1 dk 30 sn | başta açık | — | 520 |
| Spitfire I | Avcı | 1938 | P1 | 3.400 | 1 dk 50 sn | 6.050 | 8 dk | 680 |
| Ju 87 B | Pike | 1938 | P1 | 4.200 | 2 dk | başta açık | — | 840 |
| I-16 | Avcı | 1939 | P1 | 2.250 | 1 dk 40 sn | 3.600 | 3 dk 54 sn | 450 |
| Bf 109 E | Avcı | 1939 | P1 | 2.850 | 1 dk 35 sn | başta açık | — | 570 |
| Blenheim IV | Bombardıman | 1939 | P1 | 6.250 | 3 dk 20 sn | 8.100 | 3 dk 54 sn | 1.250 |
| Bf 110 C | Avcı | 1939 | P1 | 6.900 | 2 dk 50 sn | 9.850 | 7 dk 28 sn | 1.380 |
| He 111 H | Bombardıman | 1939 | P1 | 10.250 | 4 dk 20 sn | başta açık | — | 2.050 |
| A6M2 | Avcı | 1940 | P1 | 2.600 | 2 dk | 5.150 | 8 dk | 520 |
| Ju 88 A | Bombardıman | 1940 | P2 | 13.400 | 4 dk 40 sn | 17.550 | 9 dk 4 sn | 2.680 |
| Bf 109 F | Avcı | 1941 | P2 | 4.150 | 1 dk 55 sn | 6.900 | 8 dk | 830 |
| Spitfire Vb | Avcı | 1941 | P2 | 4.250 | 2 dk | 7.800 | 10 dk 46 sn | 850 |
| P-40E | Avcı | 1941 | P2 | 4.700 | 2 dk 30 sn | 7.350 | 7 dk 28 sn | 940 |
| SBD-3 | Pike | 1941 | P2 | 5.100 | 2 dk 10 sn | 7.800 | 7 dk 28 sn | 1.020 |
| Il-2 | Taarruz | 1941 | P2 | 6.500 | 2 dk 20 sn | 9.400 | 7 dk 28 sn | 1.300 |
| Pe-2 | Pike | 1941 | P2 | 9.550 | 4 dk | 13.750 | 10 dk 46 sn | 1.910 |
| Spitfire IX | Avcı | 1942 | P2 | 5.050 | 2 dk 20 sn | 10.000 | 15 dk 24 sn | 1.010 |
| Lancaster | Bombardıman | 1942 | P2 | 24.000 | 7 dk | 32.900 | 21 dk 16 sn | 4.800 |
| Bf 109 G | Avcı | 1943 | P2 | 4.500 | 2 dk 10 sn | 8.250 | 11 dk 24 sn | 900 |
| Fw 190 A | Avcı | 1943 | P2 | 5.350 | 2 dk 20 sn | 9.200 | 11 dk 24 sn | 1.070 |
| Ju 87 D | Pike | 1943 | P2 | 6.250 | 2 dk 20 sn | 9.850 | 10 dk 8 sn | 1.250 |
| Typhoon | Taarruz | 1943 | P2 | 6.950 | 2 dk 40 sn | 11.700 | 13 dk 56 sn | 1.390 |
| Il-2M3 | Taarruz | 1943 | P2 | 7.650 | 2 dk 30 sn | 11.450 | 10 dk 8 sn | 1.530 |
| P-38J | Avcı | 1943 | P2 | 9.950 | 3 dk 50 sn | 15.900 | 16 dk 52 sn | 1.990 |
| Mosquito | Taarruz | 1943 | P2 | 10.000 | 4 dk 10 sn | 15.950 | 16 dk 52 sn | 2.000 |
| B-25J | Bombardıman | 1943 | P2 | 18.250 | 5 dk | 24.350 | 13 dk 56 sn | 3.650 |
| B-17G | Bombardıman | 1943 | P2 | 28.450 | 6 dk 40 sn | 37.650 | 20 dk 32 sn | 5.690 |
| Yak-3 | Avcı | 1944 | P2 | 3.900 | 2 dk 20 sn | 8.500 | 14 dk 40 sn | 780 |
| La-7 | Avcı | 1944 | P2 | 4.800 | 2 dk 30 sn | 9.500 | 14 dk 40 sn | 960 |
| P-51D | Avcı | 1944 | P2 | 5.350 | 2 dk 40 sn | 10.550 | 16 dk 8 sn | 1.070 |
| F6F-5 | Avcı | 1944 | P2 | 7.250 | 3 dk | 12.650 | 16 dk 8 sn | 1.450 |
| P-47D | Avcı | 1944 | P2 | 7.300 | 2 dk 50 sn | 12.750 | 16 dk 8 sn | 1.460 |
| SB2C-4 | Pike | 1944 | P2 | 7.700 | 2 dk 40 sn | 12.550 | 13 dk 56 sn | 1.540 |
| Il-10 | Taarruz | 1944 | P2 | 8.250 | 2 dk 40 sn | 13.150 | 13 dk 56 sn | 1.650 |
| Me 262 | Avcı | 1944 | J1 | 10.050 | 3 dk 40 sn | 17.600 | 22 dk 30 sn | 2.010 |
| Ar 234 | Bombardıman | 1944 | J1 | 14.500 | 5 dk 20 sn | 22.850 | 23 dk 20 sn | 2.900 |
| A-26B | Taarruz | 1944 | P2 | 15.800 | 4 dk 40 sn | 23.600 | 20 dk 50 sn | 3.160 |
| He 162 | Avcı | 1945 | J1 | 4.950 | 2 dk 30 sn | 10.700 | 18 dk 20 sn | 990 |
| F8F-1 | Avcı | 1945 | P2 | 6.200 | 2 dk 40 sn | 12.350 | 19 dk 10 sn | 1.240 |
| F4U-4 | Avcı | 1945 | P2 | 7.250 | 3 dk 10 sn | 13.750 | 20 dk | 1.450 |
| Me 262/U4 | Avcı | 1945 | J1 | 10.350 | 4 dk | 17.000 | 19 dk 10 sn | 2.070 |
| Meteor F.3 | Avcı | 1945 | J1 | 10.650 | 3 dk 20 sn | 18.050 | 21 dk 40 sn | 2.130 |
| B-29 | Bombardıman | 1945 | P2 | 45.700 | 10 dk | 59.650 | 30 dk | 9.140 |
| Sea Fury | Avcı | 1947 | P2 | 7.850 | 3 dk 10 sn | 14.450 | 20 dk | 1.570 |
| F-80C | Avcı | 1948 | J1 | 10.350 | 3 dk 50 sn | 17.450 | 20 dk 50 sn | 2.070 |
| Vampire | Avcı | 1949 | J1 | 8.050 | 3 dk 10 sn | 14.650 | 20 dk | 1.610 |
| AD-4 | Pike | 1949 | P2 | 8.500 | 3 dk 30 sn | 15.650 | 21 dk 40 sn | 1.700 |
| MiG-15bis | Avcı | 1950 | J1 | 11.350 | 4 dk 10 sn | 21.150 | 29 dk 52 sn | 2.270 |
| Il-28 | Bombardıman | 1950 | J1 | 30.000 | 6 dk 20 sn | 42.050 | 29 dk 52 sn | 6.000 |
| F-84G | Avcı | 1951 | J1 | 13.650 | 4 dk | 22.650 | 26 dk 8 sn | 2.730 |
| Canberra | Bombardıman | 1951 | J1 | 27.800 | 6 dk | 39.050 | 28 dk | 5.560 |
| F-86F | Avcı | 1952 | J1 | 13.100 | 4 dk 20 sn | 23.100 | 29 dk 52 sn | 2.620 |

## 5. Diğer araştırmalar (×1,6)

Maliyet: araştırma süresi × 5 × 0,98 × 1,6, 50’ye yuvarlanır.

### Uçak geliştirmesi

| Araştırma | Fiyat | Süre |
|---|---|---|
| Sabit devirli pervane | 1.400 | 3 dk |
| Kanat makineli bataryası | 1.400 | 3 dk |
| Refleks nişangâh | 1.400 | 3 dk |
| Atılabilir yakıt tankı | 1.400 | 3 dk |
| Pilot zırhı ve zırhlı ön cam | 1.650 | 3 dk 30 sn |
| Kendini sızdırmaz yakıt deposu | 1.900 | 4 dk |
| 100 oktan yakıt | 2.100 | 4 dk 30 sn |
| Gerilimli metal kaplama | 2.100 | 4 dk 30 sn |
| Çift namlulu savunma makineli | 2.100 | 4 dk 30 sn |
| Pike nişangâhı ve otomatik toparlanma | 2.100 | 4 dk 30 sn |
| Hedef keşif fotoğrafları | 2.350 | 5 dk |
| Delikli pike flapları | 2.500 | 5 dk 20 sn |
| Büyük atılabilir tanklar | 2.500 | 5 dk 20 sn |
| Gelişmiş V12 sıra motor | 2.600 | 5 dk 30 sn |
| Çift sıra radyal motor | 2.600 | 5 dk 30 sn |
| 20 mm kanat topu | 2.600 | 5 dk 30 sn |
| Gelişmiş bomba nişangâhı | 2.600 | 5 dk 30 sn |
| Kabarcık kokpit | 2.800 | 6 dk |
| Ağır bomba askısı | 2.800 | 6 dk |
| Gövde içi ek yakıt tankı | 2.800 | 6 dk |
| Hispano 20 mm (kayışlı) | 3.150 | 6 dk 40 sn |
| Havadan karaya roket | 3.150 | 6 dk 40 sn |
| G elbisesi | 3.450 | 7 dk 20 sn |
| Roket nişangâhı ve taarruz eğitimi | 3.450 | 7 dk 20 sn |
| Kanat ucu yakıt tankları | 3.550 | 7 dk 30 sn |
| Su-metanol enjeksiyonu (acil güç) | 3.750 | 8 dk |
| Zırhlı kokpit küveti | 3.750 | 8 dk |
| 30 mm MK 108 top | 3.750 | 8 dk |
| Hidrolik güç taretleri | 3.750 | 8 dk |
| Laminer akış kanadı | 4.400 | 9 dk 20 sn |
| Jiroskoplu nişangâh (K-14) | 4.400 | 9 dk 20 sn |
| İki kademeli süperşarj | 4.700 | 10 dk |
| 2000 bg radyal motor | 4.700 | 10 dk |
| Fırlatma koltuğu | 4.700 | 10 dk |
| 37 mm hava topu | 4.700 | 10 dk |
| Turbo süperşarj | 5.000 | 10 dk 40 sn |
| Hidrolik güç destekli kumandalar | 5.900 | 12 dk 30 sn |
| Radar telemetreli nişangâh | 6.250 | 13 dk 20 sn |
| Santrifüj akışlı turbojet | 8.600 | 18 dk 20 sn |
| Yüksek itkili turbojet | 8.600 | 18 dk 20 sn |
| Eksenel akışlı turbojet | 9.400 | 20 dk |
| Ok kanat (35°) | 10.200 | 21 dk 40 sn |

### Hava savunması

| Araştırma | Fiyat | Süre |
|---|---|---|
| Mevzi tahkimatı I | 1.400 | 3 dk |
| 2 cm Flak 38 | 1.900 | 4 dk |
| Oerlikon 20 mm | 2.100 | 4 dk 30 sn |
| Optik telemetre | 2.100 | 4 dk 30 sn |
| Uçaksavar topçu okulu | 2.600 | 5 dk 30 sn |
| 3,7 cm Flak 36 | 2.800 | 6 dk |
| Mevzi tahkimatı II | 2.800 | 6 dk |
| 2 cm Flakvierling 38 | 3.750 | 8 dk |
| Kamuflaj ve sahte mevziler | 3.750 | 8 dk |
| Gelişmiş uçaksavar mühimmatı | 4.400 | 9 dk 20 sn |
| Bofors 40 mm L/60 | 4.700 | 10 dk |
| Mekanik atış hesaplayıcı | 4.700 | 10 dk |
| 8,8 cm Flak 36 | 5.650 | 12 dk |
| 90 mm M1 | 5.950 | 12 dk 40 sn |
| Atış kontrol radarı | 6.250 | 13 dk 20 sn |
| Mevzi tahkimatı III (flak kalesi) | 6.250 | 13 dk 20 sn |
| Yakınlık tapası | 7.550 | 16 dk |
| 8,8 cm Flak 41 | 8.250 | 17 dk 30 sn |
| 12,8 cm Flak 40 | 8.600 | 18 dk 20 sn |

### Radar ve ihbar

| Araştırma | Fiyat | Süre |
|---|---|---|
| Hava gözetleme ağı | 1.400 | 3 dk |
| Telsiz ağı | 1.650 | 3 dk 30 sn |
| Yer kontrollü önleme | 3.750 | 8 dk |
| Erken ihbar radarı I | 4.250 | 9 dk |
| Erken ihbar radarı II | 6.250 | 13 dk 20 sn |
