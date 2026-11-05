# Yapılacaklar

Biten madde listeden silinir. Yeni iş en uygun başlığın altına eklenir.

## Sırada

- [ ] **Hava savunması yenileniyor.** Aşama 1, 2, 3A, 3B'nin ilk grubu (Oerlikon, 90 mm M1, Flak 41), üretim menüsü ve yuva sistemi 2026-11-05'te canlıya çıktı. Kalan toplar ve ansiklopedi aşağıda ayrı maddeler. Modeller ve radar (aşama 4 ve 5) kullanıcıyla konuşulacak.
  Kararlar ve aşamalar `docs/PLAN.md` "Hava savunması yenileniyor".
- [ ] **Kalan topları ekle.** M45, 61-K, QF 3.7 inç, 85 mm 52-K, 10,5 cm Flak 38. Her top için veri (`airDefense.ts`), model (`structures.ts`), araştırma (`tech.ts`, `techEn.ts`) ve resim (`npm run uretim:gorsel gun-<top>`). Öncesi ve sonrası `npm run sim:flak` ile karşılaştırılır.
- [ ] **Kalan menülerin tasarımını çelik yap.** Üretim, silah yuvası, araştırma, hangar ve haberler geçti. Kalanlar: pazar, ayarlar, inşa, planlayıcı, yan paneller, duraklatma, ana menü, hesap ve profil, geri bildirim, oyun sonu. Hazır altyapı: `style.css` `.modal-card.steel`. Hangisinin önce geçeceği kullanıcıyla konuşulacak.
- [ ] **Ansiklopediyi düzenle.** Hava savunma sistemleri eklenecek (`src/ansiklopedi`: makale, `liste.ts`, görseller). İlerde yardımcı olarak arama ve filtre gibi şeyler gelecek. Ansiklopedinin teması da çelik olacak (oyundaki `.steel` renkleri; ansiklopedinin kendi stili `src/ansiklopedi/stil.css`).
- [ ] **Öğreticiye istenen yerden başlama.** Öğreticiyi tekrar başlatma kısmı güncellenecek: eski Senaryo düğmesinin yerine oyuncunun öğreticide istediği yerden başlamasını ve öğrenmek istediği şeyi seçmesini sağlayan bir bölüm gelecek.
  - Senaryolar oyuncu arayüzünden 2026-11-05'te kaldırıldı (düğme, pencere, stiller; henüz push edilmedi). Simülasyondaki senaryolar (`src/sim/scenarios.ts`) ve `game.loadScenario` kaldı: testler, video kayıt kipi, performans aracı ve başsız ölçümler kullanıyor.
  - Bu bölüm yapılırken: duraklatma menüsü öğretici düğmesini senaryo grubuna göre gösteriyor (`pauseMenu.ts`); oyuncu adı yoksa kayıt başlığı ve duraklatma bilgi satırı "Senaryo" yazıyor (`game.ts`, `pauseMenu.ts`). Senaryolar oyuncuya kapalı olduğu için şimdilik zararsız.
- [ ] **Görevlerde uçaklar daha özgür davransın.** Kullanıcı isteği: uçaklar kuyruk gibi peş peşe gitmesin, hepsi aynı anda
  robot gibi hareket etmesin. İniş için yapıldı (`src/sim/ai/ops.ts` `LandingStyle`); kol, devriye, taarruz, bombardıman ve
  diğer görevler bekliyor. Aynı yöntem kullanılabilir: değişkenlik uçak kimliğinden türesin, ortak `Math.random` akışına
  dokunmasın. Kolun düzeni ve gerçekçilik bozulmasın.
- [ ] **İnişlere yeni düzenlemeler.** Kullanıcı ekleyecek.
- [ ] **İniş ve görev haberi (henüz yazılmadı).** Yeni iniş davranışı (farklı yaklaşma ve duruşlar, pas geçme) 2026-11-05'te
  canlıya çıktı ama bilerek duyurulmadı. Haberi, diğer görev düzenlemeleri bitince onlarla birlikte yazılır (TR ve EN).
  Duyurulacaksa `worker/newsMail.ts` `LATEST_NEWS_MAIL` de güncellenir, izin veren hesaplara e-postayla gider.

## Kontrol edilecekler

- [ ] Yeni modelleri kalabalık bir savaşta gerçek telefonda dene. Şimdiye kadar yalnız işlemci yavaşlatılarak ölçüldü. Safari/iPhone hiç denenmedi.
- [ ] Hangarda bir uçağın ilk gösterimi model kurduğu için bekletiyor: 4× yavaş işlemcide 0,3–1,3 sn, 6×'te B-17 ~2 sn. Araştırma artık model kurmadığı için bu maliyet hangarda kaldı; gerçek telefonda rahatsız ederse bakılacak.
- [ ] Hasarlı uçakların inişini ve yoğun savaş sırasında inişi dene.
- [ ] Pas geçen A-26'nın dönüşte yaklaşık 60 m alçalmasına bak.
- [ ] Bir ölçümde 8 Il-2'lik alçak kol tek koşuda, isabet almadan, hedefe giderken kayboldu (40 koşuda bir kez). Test kolu yandan başlatıldığı için test kaynaklı olabilir; arazi çarpması mı diye bak.
- [ ] Bot önlemesini oyunda dene (`commander.ts` `raidResponse`): tepki değişiyor mu, hazırlıksız yakalanma hissediliyor mu, eskortlu taarruz kaybı (~%23) sert mi. 8,8 cm hâlâ bataryalara çok geç geliyor.
