# Yapılacaklar

Biten madde listeden silinir. Yeni iş en uygun başlığın altına eklenir.

## Sırada

- [ ] **Hava savunması yenileniyor.** Aşama 1, 2, 3A, 3B'nin ilk grubu (Oerlikon, 90 mm M1, Flak 41), üretim menüsü ve yuva sistemi 2026-11-05'te canlıya çıktı. Kalan toplar ve ansiklopedi aşağıda ayrı maddeler. Modeller ve radar (aşama 4 ve 5) kullanıcıyla konuşulacak.
  Kararlar ve aşamalar `docs/PLAN.md` "Hava savunması yenileniyor".
- [ ] **Kalan topları ekle.** M45, 61-K, QF 3.7 inç, 85 mm 52-K, 10,5 cm Flak 38. Her top için veri (`aaWeapons.ts`), model (`structures.ts`), araştırma (`tech.ts`, `techEn.ts`), resim (`npm run uretim:gorsel gun-<top>`) ve ansiklopedi (makale `makale/hava-savunmasi.ts`, adres `liste.ts`, görsel `gorseller.mjs gun-<top>`). Öncesi ve sonrası `npm run sim:flak` ile karşılaştırılır.
- [ ] **Kalan menülerin tasarımını çelik yap.** Üretim, silah yuvası, araştırma, hangar ve haberler geçti. Kalanlar: pazar, ayarlar, inşa, planlayıcı, yan paneller, duraklatma, ana menü, hesap ve profil, geri bildirim, oyun sonu. Hazır altyapı: `style.css` `.modal-card.steel`. Hangisinin önce geçeceği kullanıcıyla konuşulacak.
- [ ] **Öğretici konu listesi ana menüde.** Oyunun içindeki konu listesi 2026-11-13'te yapıldı (üst çubuk ve duraklatma
  menüsü; yerelde). Ana menüde eski Senaryo düğmesinin yeri boş: istenirse liste oradan da açılır (menü konuları seçilebilir,
  oyun konularında kısa bir harekât başlar).
  - Duraklatma menüsü öğretici düğmesini senaryo grubuna göre gösteriyor (`pauseMenu.ts`); oyuncu adı yoksa kayıt başlığı ve
    duraklatma bilgi satırı "Senaryo" yazıyor (`game.ts`, `pauseMenu.ts`). Senaryolar oyuncuya kapalı olduğu için zararsız.
- [ ] **Görevlerde uçaklar daha özgür davransın.** Kullanıcı isteği: uçaklar kuyruk gibi peş peşe gitmesin, hepsi aynı anda
  robot gibi hareket etmesin. İniş için yapıldı (`src/sim/ai/ops.ts` `LandingStyle`); kol, devriye, taarruz, bombardıman ve
  diğer görevler bekliyor. Aynı yöntem kullanılabilir: değişkenlik uçak kimliğinden türesin, ortak `Math.random` akışına
  dokunmasın. Kolun düzeni ve gerçekçilik bozulmasın.
- [ ] **İnişlere yeni düzenlemeler.** Kullanıcı ekleyecek.
- [ ] **5 yeni harita.** Şu an iki harita var: Anakara ve Takımadalar (`src/sim/maps.ts`). Her biri öncekilerden belirgin
  biçimde farklı olsun. Haritalar 300 km için çizilir (`MAP_BASE`), Küçük ve Orta'da ölçeklenir. Arazi işçilerde üretilir
  (`sim/terrainGen.ts`, `render/landcoverGen.ts`). Eski kayıtların haritaları bit bit aynı kalmalı. Ana menüdeki harita
  seçimine, öğreticiye ve ansiklopediye etkisine bakılır.
- [ ] **Şehir, itfaiye, bakım personeli ve harita süsleri push bekliyor** (2026-11-13, yerelde, testleri geçti). Push'tan
  önce telefonda kısa deneme; haber yazılacak (bakım personeli oyunu değiştiriyor, eski kayıtlara bedava konut veriliyor).
- [ ] **Zorluk seçeneği (Kolay, Normal, Zor).** Ana menüde harekât başlarken seçilir. Şimdilik botlar hep Normal (2026-11-13 bot ekonomisi: ilk 3 maden üsten önce, tehdide göre harcama). Kolay: en çok 3 maden, yavaş araştırma, küçük filo; Zor: biraz daha hızlı. Ölçüt: oyuncuların sunucudaki harekât verisi (`campaigns`: kazanç, en büyük filo, oyun süresi); 2026-11-13'te ilk 2 saatte bot ≈ ortalama oyuncu, 4. saatte bot önde (veri az: 10 harekât).
- [ ] **İniş ve görev haberi (henüz yazılmadı).** Yeni iniş davranışı (farklı yaklaşma ve duruşlar, pas geçme) 2026-11-05'te
  canlıya çıktı ama bilerek duyurulmadı. Haberi, diğer görev düzenlemeleri bitince onlarla birlikte yazılır (TR ve EN).
  Haber eklenince izin veren hesaplara e-postayla kendiliğinden gider (`worker/newsMail.ts` `latestNewsMail`).

## Kontrol edilecekler

- [ ] Boya ve metal ayarının (2026-11-06: gümüş metal, levha tonları, kir izleri) telefon kare hızını ölç: eski ve yeni hâl aynı koşuda.
- [ ] Yeni modelleri kalabalık bir savaşta gerçek telefonda dene. Şimdiye kadar yalnız işlemci yavaşlatılarak ölçüldü. Safari/iPhone hiç denenmedi.
- [ ] Hangarda bir uçağın ilk gösterimi model kurduğu için bekletiyor: 4× yavaş işlemcide 0,3–1,3 sn, 6×'te B-17 ~2 sn. Araştırma artık model kurmadığı için bu maliyet hangarda kaldı; gerçek telefonda rahatsız ederse bakılacak.
- [ ] Hasarlı uçakların inişini ve yoğun savaş sırasında inişi dene.
- [ ] Pas geçen A-26'nın dönüşte yaklaşık 60 m alçalmasına bak.
- [ ] Bir ölçümde 8 Il-2'lik alçak kol tek koşuda, isabet almadan, hedefe giderken kayboldu (40 koşuda bir kez). Test kolu yandan başlatıldığı için test kaynaklı olabilir; arazi çarpması mı diye bak.
- [ ] Bot önlemesini oyunda dene (`commander.ts` `raidResponse`): tepki değişiyor mu, hazırlıksız yakalanma hissediliyor mu, eskortlu taarruz kaybı (~%23) sert mi. 8,8 cm hâlâ bataryalara çok geç geliyor.

yeni uçak araştırması zorlaşmalı ve genel fiyatlar incelenip güncellenmeli
sosyal medya için bir seriye başlanabilir mizahi hikayeler gibi


görev içinde istediğimiz uçağımızın hedefini istediğimiz şey ile değiştirebilelim yanında başka bir düşman varken daha uzaktakine gidebiliyor veya düşman dönmeye başladığında onu tam olarak etkisif hale getirmeden uzaka olana gitmeye başlıyor
elle ev onarma süreleri düşürülmeli mi? (itfaiye 2026-11-13'te eklendi, yerelde)

pastel hava gitmeli artık