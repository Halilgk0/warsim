-- Oyuncu skorlarını herkese açık tabloda gösterip göstermeyeceğini Profil'den seçer. Varsayılan açık (mevcut hesaplar dahil).
ALTER TABLE accounts ADD COLUMN score_public INTEGER NOT NULL DEFAULT 1;
