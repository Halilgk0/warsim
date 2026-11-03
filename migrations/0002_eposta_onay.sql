-- Hesap açarken alınan e-posta ve onay kayıtları. Eski hesaplarda bunlar boş kalır.
-- legal_version / legal_at: kabul edilen Gizlilik Politikası ve KVKK metninin sürümü ve tarihi.
-- news_opt / news_at: yenilik e-postası için ayrı ve isteğe bağlı izin, verildiği tarih.
ALTER TABLE accounts ADD COLUMN email TEXT;
ALTER TABLE accounts ADD COLUMN legal_version TEXT;
ALTER TABLE accounts ADD COLUMN legal_at INTEGER;
ALTER TABLE accounts ADD COLUMN news_opt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN news_at INTEGER;
