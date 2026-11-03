-- Bir e-posta adresiyle tek hesap. email_key adresin eşleştirme biçimidir (shared.ts emailKey): aynı kutuya giden yazımlar
-- aynı sayılır. E-postası olmayan eski hesaplarda boş kalır; boşlar çakışmaz.
ALTER TABLE accounts ADD COLUMN email_key TEXT;
CREATE UNIQUE INDEX accounts_email_key ON accounts (email_key);
