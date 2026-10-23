# Tanıtım videoları (kayıt kipi ve kurgu)

Oyunun içinden sinematik çekimler alıp sosyal medya videosu (1080×1920, 60 kare/sn) üretir. Oyunun kendisi bu klasöre
bağlı değildir; kayıt kipi (`src/rec`) yalnız geliştirme sunucusunda açılır, yayın derlemesine girmez.

## Kurulum

```
cd tools/rec
npm install
```

Google Chrome kurulu olmalı (tarayıcı indirilmez, `channel: 'chrome'`). Ekran kartı kullanılır.

## Çekim

Çekimler `src/rec/takes.ts` dosyasında. Her çekim bir dünya kurulumu, kaydı başlatan bir tetik ve her karede kamera
içerir. Simülasyon tohumludur: aynı çekim her seferinde aynı oynar.

```
node record.mjs --list                      çekimleri listele
node record.mjs --preview stuka_dive        hızlı deneme (540×960); out/stuka_dive.sheet.jpg kare tablosu
node record.mjs stuka_dive dogfight         tam kalite: out/<çekim>.mp4 ve .wav
node probe.mjs betik.js                     kayıt kipindeki dünyada betik çalıştır (tetik anı aramak için)
```

Kareler bilgisayarın hızından bağımsız çizilir; ses aynı zamana kilitli üretilir (OfflineAudioContext).

## Arayüz ekranları ve kurgu

```
node ui.mjs                 telefon yatay ekranında planlayıcı, araştırma, inşa ekranları → out/ui/
node edit.mjs               yazı kartları, arayüz bölümü, kurgu → release/sosyal/01-tanitim/tanitim.mp4
node edit.mjs assemble      yalnız kurgu (grafikler hazırsa)
```

Kurgu listesi (`CUTS`) ve yazı kartları (`CAPTIONS`) `edit.mjs` başında. Ses −14 LUFS'e getirilir.

## Görsel denetim ve performans (önce/sonra)

Grafik değişikliklerini karşılaştırmak için. İkisi de oyunun koduna dokunmaz; çıktı `out/audit/<etiket>/`.

```
node audit/stills.mjs sonra             kayıt kipinden sabit açılı kareler: 3 sahne, 1280×720 ve 844×390 (DPR 2)
PARCA=1 node audit/stills.mjs sonra     aynısı, katman katman üçgen/çağrı kırılımıyla (meta.json)
node audit/perf.mjs sonra tel 4         telefon taklidi: 844×390, DPR 2, işlemci 4 kat yavaş
node audit/perf.mjs sonra tel 1         ekran kartı süresi için yavaşlatmasız
node audit/perf.mjs sonra pc 1          1280×720
```

- Kareler tohumlu sahnelerden çizilir; aynı kod aynı kareyi bayt bayt aynı verir.
- `perf.mjs` yayın derlemesini `out/audit/dist`'e alır ve geçici Chrome profiliyle, ekranlı açar (başsız tarayıcı rAF'yi
  yavaşlatır). Ölçüm sürerken pencereyi küçültme.
- Taban (2026-10-23, grafik güncellemesi öncesi): `audit/taban-2026-10-23.json`; kareler `out/audit/once/`.
- Karşılaştırmada ms kullan (bütçe 16,7 ms); ekran 60 Hz'den hızlıysa fps de yüksek çıkar. Ekran kartı süresi işlemci
  yavaşlatılınca şişer, yavaşlatmasız koşudan oku.
