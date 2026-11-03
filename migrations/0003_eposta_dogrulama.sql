-- E-posta doğrulama. accounts.email yalnız kodla doğrulanmış adres tutar.

-- Bekleyen kod: adres başına bir tane, yalnız özeti; süresi dolunca silinir.
CREATE TABLE email_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);

-- Gönderim sınırları: adres ve IP özeti başına, bir de toplam (Gmail'in günlük sınırı). Kısa süre tutulur.
CREATE TABLE mail_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
