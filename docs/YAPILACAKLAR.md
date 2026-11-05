# Yapılacaklar

Biten madde listeden silinir. Yeni iş en uygun başlığın altına eklenir.

## Sırada

- [ ] **Görevlerde uçaklar daha özgür davransın.** Kullanıcı isteği: uçaklar kuyruk gibi peş peşe gitmesin, hepsi aynı anda
  robot gibi hareket etmesin. İniş için yapıldı (`src/sim/ai/ops.ts` `LandingStyle`); kol, devriye, taarruz, bombardıman ve
  diğer görevler bekliyor. Aynı yöntem kullanılabilir: değişkenlik uçak kimliğinden türesin, ortak `Math.random` akışına
  dokunmasın. Kolun düzeni ve gerçekçilik bozulmasın.
- [ ] **İnişlere yeni düzenlemeler.** Kullanıcı ekleyecek.
- [ ] **İniş ve görev haberi (henüz yazılmadı).** Yeni iniş davranışı (farklı yaklaşma ve duruşlar, pas geçme) 2026-11-05'te
  canlıya çıktı ama bilerek duyurulmadı. Haberi, diğer görev düzenlemeleri bitince onlarla birlikte yazılır (TR ve EN).
  Duyurulacaksa `worker/newsMail.ts` `LATEST_NEWS_MAIL` de güncellenir, izin veren hesaplara e-postayla gider.

## Kontrol edilecekler

- [ ] Yeni modelleri kalabalık bir savaşta gerçek telefonda dene. Şimdiye kadar yalnız işlemci yavaşlatılarak ölçüldü.
- [ ] Hasarlı uçakların inişini ve yoğun savaş sırasında inişi dene.
- [ ] Pas geçen A-26'nın dönüşte yaklaşık 60 m alçalmasına bak.

## Sorulacaklar

- [ ] Haber e-postası ticari elektronik ileti sayılır mı, İYS kaydı gerekir mi: avukata sor.
