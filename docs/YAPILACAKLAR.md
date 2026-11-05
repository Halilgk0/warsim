# Yapılacaklar

Biten madde listeden silinir. Yeni iş en uygun başlığın altına eklenir.

## Sırada

- [ ] **Hava savunması yenileniyor.** Aşama 1, 2, 3A, 3B'nin ilk grubu (Oerlikon, 90 mm M1, Flak 41), üretim menüsü ve yuva sistemi 2026-11-05'te canlıya çıktı. M45, 61-K, QF 3.7 inç, 85 mm 52-K, 10,5 cm Flak 38 kullanıcının kararıyla sonraya kaldı; eklenince `npm run uretim:gorsel` ile resimleri de üretilir. Modeller, radar ve ansiklopedi (aşama 4–6) kullanıcıyla konuşulacak.
  Kararlar ve aşamalar `docs/PLAN.md` "Hava savunması yenileniyor".
- [ ] **Çelik temayı kalan menülere de taşı.** Üretim, silah yuvası, araştırma, hangar ve haberler geçti. Kalanlar (pazar, ayarlar, senaryolar, yan paneller, planlayıcı) kullanıcının kararıyla şimdilik pastel kalıyor (2026-11-05); kullanıcı isteyince. Hazır altyapı: `style.css` `.modal-card.steel`.
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
