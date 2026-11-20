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
- `dokular.mjs` (sharp): boya WebP 2048, normal haritası yakın kayıpsız WebP 2048 (2026-11-20'ye dek kayıpsız; kayıplıda renk
  alt örneklemesi dikişleri bozuyordu, yakın kayıpsız 60 en çok 1,8° sapar), AO 1024.
- Bir pişirme ~4 dk (paralelde ~8 dk); 32 GB bellekte üç-dört tanesi aynı anda çalışabilir.

## Uçaksavar topu dokuları (2026-11-20)

Oyunun 15 topu da aynı yoldan: kodla kurulan geometri (`structures.ts` `aaGun`) UV açılıp dokulanır, şekil aynı kalır.
Oyun yalnız ayrıntılı modelde (Orta ve Yüksek, inşaat bitince; hangar vitrini her zaman) ve top ilk kez çizilince yükler
(`render/gunSkins.ts`).

```
node tools/blender/top_al.mjs [top ...]                                   # → tools/blender/cikti/top/<top>.json
blender ... --python tools/blender/top.py -- tools/blender/cikti/top/<top>.json tools/blender/cikti/top/out
copy tools/blender/cikti/top/out/<top>.glb public/top/
node tools/blender/dokular.mjs tools/blender/cikti/top/out public/top <top> ...
node tools/ansiklopedi/gorseller.mjs gun-<top>   ve   node tools/uretim/gorseller.mjs gun-<top>
```

- `top_al.mjs` oyunun kodunu tarayıcıda çalıştırır (`buildAAGun(top, true)`): dört hareketli parça ayrı (`base` sabit taban,
  `yaw` dönen kısım, `pitch` beşik, `recoil` geri tepen namlu), her biri kendi grup ekseninde; köşe rengi ve yüzey türüyle.
- `top.py`: malzeme sınıfı köşe renginden ve yüzey türünden (boya, koyu çelik, pirinç, ahşap, kanvas, beton, kadran).
  Normal haritası Bevel düğümüyle yuvarlanmış kenarlar (yumuşak gölgeli yüzler, yani namlu ve silindir yanları hariç: her
  yüzün kenarı çizgi gibi görünüyordu). Ortam gölgesi parça grubu başına (taban, dönen kısım, beşik+namlu; birbirine göre
  döndükleri için başkasının gölgesi yanlış yere düşerdi), taban ve dönen kısımda yer düzlemiyle. Boya: güneşte solma,
  yağmur izi, dışbükey kenarda aşınma (astar, altından çelik), yarıkta kir, dipte toz, namlu ağzında is. Doku 2048
  (yüzeyi 12 m²'den küçük toplarda 1024). Draco ile doğrudan dışa aktarır (seyrek kopya yok: top 600–2.300 üçgen).
- Bir pişirme ~2 dk.

Eksen: oyunda x yan, y yukarı, z ileri (burun). Betiklerde `P(x, y, z)` Blender'a çevirir: (x, -z, y).
Nesne adı `<yüzey ya da parça>-<ad>`: oyun yüzey türünü (`arch.ts` SURF) ya da parça türünü (body, glass, dark) addan alır.
