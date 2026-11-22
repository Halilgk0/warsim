# Başsız simülasyon betikleri

`npm run sim:*` komutlarının yanında, tek seferlik ölçüm betikleri. Hepsi `node tools/sim/calistir.mjs <ad> [argümanlar]` ile derlenip çalışır
(esbuild paketi `tools/sim/.out`, git dışı). Simülasyon `Math.random` kullandığı için sonuçlar koşudan koşuya oynar: değişiklik kararı için
birkaç koşu ve eski kodla yan yana ölçüm (eski kodu `git worktree add --detach <klasör> <commit>` ile al, betiğin içe aktarma yolunu ona çevir).

| Betik | Ne ölçer |
|---|---|
| `jet_donus` | Jet bombardıman kolunun hedefe gidişi, bombalaması, dönüşü ve inişi (dakikada bir durum). Canberra hatası bununla bulundu |
| `inis` | Hasarlı ve kalabalık iniş: `inis <uçak> <adet> <yok\|motor\|kanat\|kumanda\|hepsi\|yara> <koşu> [düşman]` |
| `inis_pas` | Zorla pas geçirilen uçakların yeniden inişi |
| `onleme_donus` | Önlemeden sonra kol: evre değişimleri, dönüş nedenleri, koldan tek başına ayrılan (yakıtı azalan) uçaklar, 3 dk devriye |
| `ucaksavar_daire` | `[koşu] [uçak] [görev]`: hedefini 5–7 km öteden ağır toplar koruyan kol hedefe varıyor mu, toplam dönüş (daire çizen binlerce derece) |
| `jet_dalas` | `[koşu] [A] [B]`: 4'e 4 dalaşta evre payı, en yakın düşmana uzaklık, arkada ve ateşte geçen süre (jetleri pervaneliyle karşılaştır) |
| `jet_bombaci` | `[koşu] [jet] [bombardıman] [adet]`: 4 jetin eskortsuz bombardıman koluna saldırısı |

`npm run sim:bench`, `sim:hits`, `sim:flak`, `sim:ceiling` ayrı betiklerdir (package.json).
