# Blender modelleri

Oyunun bazı modelleri Blender'da, Python betiğiyle kurulur ya da oyunun kendi geometrisi Blender'da dokulanır. Blender arka
planda çalışır (arayüz gerekmez):

```
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python tools/blender/<betik>.py -- <argümanlar>
```

- `mig15.py`: MiG-15 gövdesi, kanat, kuyruk, kanopi; kumanda yüzeyleri eklem (glTF extras: joint, pivot, axis). Çıktı
  `mig15.glb` → `public/ucak/` (dokuları `mig15_normal.webp`, `mig15_ao.webp`). Oyunda `render/models.ts` `loadSkin('mig15')`.
  Boya, arma, takım, hava freni, lamba ve pilot oyunun kodundan.

## Uçak dokuları (2026-11-19/20, yayında)

Oyunun kendi uçak geometrisi Blender'da UV açılıp dokulanır; şekil aynı kalır. Oyun bunları yalnız ayrıntılı modelde (Orta
ve Yüksek kalite, hangar) ve bir tür ilk kez çizilince yükler.

```
node tools/blender/geo_al.mjs <model> <geo.json>
blender ... --python tools/blender/doku.py -- <geo.json> <çıktı klasörü> <model>      # ham: tools/blender/cikti/
blender ... --python tools/blender/sikistir.py -- tools/blender/cikti/<model>_skin.glb public/ucak/<model>.glb 4
node tools/blender/dokular.mjs tools/blender/cikti public/ucak <model> ...
node tools/ansiklopedi/gorseller.mjs <uçak>   ve   node tools/uretim/gorseller.mjs ac-<uçak>
```

- `geo_al.mjs`: boyalı geometri (gövde `solid`, eklemler `j:<ad>`) ve `meta`: modelin `models.ts`'teki çizim satırları
  (WR kanat, TR yatay kuyruk, NR ve `podAt` nacelleler, gövde kesitleri, `hingedFin` kuyrukları, ön cam, pervane; jetlerde
  WingOpts, `jetFin`, NX/NY nacelle profili). Jet nacelle profili hava girişinin dudağını sarar: yalnız en öndeki noktadan
  sonrası alınır.
- `doku.py` ham çıktısı `<model>_skin.glb`, `_albedo.jpg` (boya), `_normal.png` (panel, perçin, Dzus vidası, kumaş
  nervürü), `_aos.png` (R ortam gölgesi, G parlaklık). Ham dosyalar `tools/blender/cikti/` (git dışı; `public`'e koyma: derlemeye
  girer).
- Yeni uçak çoğunlukla yalnız `doku.py` `STYLES` ayarı ister: boya düzeni (`plain`, `raf`, `splinter2d/3d`, `soft`, `metal`),
  renkler, gövdede ayrım (`demarc`, nacellede `ndemarc`: eksenden yükseklik), kaporta (`cowl`), ahşap kısımlar, kumaş yüzeyler,
  işaretler (bant, göbek, parlama önleyici, hücum kenarı, tozluk). Satırları kodda hesaplanan model (Fw 190, P-51D)
  `META_FIX`'e, aynı gövdeyi paylaşan sürüm `BASE`'e yazılır. İlk altı uçak (`LEGACY`) elle yazılmış dallardadır.
- `sikistir.py`: her parçanın yanına uzak görünüş için seyrek kopya (`-lod`) ekler, Draco ile sıkıştırır. Seyrek kopya
  düzlemsel seyreltmedir (açı sınırı 4°, UV sınırı geçilmez): daraltma tipi seyreltme UV'yi bozup dokuyu karıştırıyordu.
  Önce aynı konumdaki köşeler birleşir (içe aktarılan ağ binlerce kopuk parçadır). Normaller korunur; sarım oyunda düzelir.
- `dokular.mjs` (sharp): boya WebP 2048, normal haritası kayıpsız WebP 2048 (kayıplıda dikişler bozuluyordu), AO 1024.
- Bir pişirme ~4 dk (paralelde ~8 dk); 32 GB bellekte üç-dört tanesi aynı anda çalışabilir.

Eksen: oyunda x yan, y yukarı, z ileri (burun). Betiklerde `P(x, y, z)` Blender'a çevirir: (x, -z, y).
Nesne adı `<yüzey ya da parça>-<ad>`: oyun yüzey türünü (`arch.ts` SURF) ya da parça türünü (body, glass, dark) addan alır.
