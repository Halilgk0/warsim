-- Kayıt yerleri (en çok 4 kayıt): bu düzenden önce fazla kaydı olan hesaba ilk uyarının gösterildiği an (ms).
-- Bu andan 7 gün sonra temizlenmemişse sunucu en yeni 4 kayıt dışındakileri siler. Kayıt sayısı 4'e inince boşalır.
ALTER TABLE accounts ADD COLUMN saves_warned INTEGER;
