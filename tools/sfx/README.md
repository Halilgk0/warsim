# WarSimBox sesleri

Oyundaki bütün sesler gerçek kayıtlardan üretilir (Freesound.org, yalnız CC0 ve CC BY: ticari kullanıma açık).
Çıktı `public/sounds/*.mp3` + `manifest.json` + `CREDITS.txt` ve `src/audio/credits.ts` (oyundaki künye listesi).

```bash
cd tools/sfx
npm install          # ffmpeg-static (yalnız bu klasöre)
npm run fetch        # ham kayıtlar raw/ altına (~80 MB, depoya girmez)
npm run build        # sesleri üretir
npm run verify       # lisansları kayıtların sayfasından yeniden doğrular
```

- `sources.json`: kullanılan kayıtlar (ad, kaydeden, lisans, sayfa, önizleme adresi). Yeni kayıt eklerken lisansı
  sayfasından kontrol et: **NC (ticari olmayan) ve ND lisanslar kullanılamaz** (Freesound aramasında "Attribution"
  filtresi NC kayıtları da getirebiliyor).
- `build.mjs`: her sesin tarifi. Motorlar: kaydın en kararlı bölümünden dikişsiz döngü. Silahlar: gerçek tek atışlar
  gerçek ateş hızında üst üste bindirilir (namlu sayısına göre seri döngüsü) ve seri sonu yankısı. Geçişler: en
  yakın anın çevresi, `peak` manifestte (oyun bu anı uçağın kameraya en yakın anına denk getirir).
- CC BY kayıtların künyesi oyunda Haberler → "Sesler geldi" sayfasında listelenir; kayıt değişirse `build` künyeyi
  de yeniler.
