-- Hesaplar, oturumlar, bulut kayıtları ve skor tablosu (Cloudflare D1).

-- Hesap: ad + şifre. Şifre tarayıcıda PBKDF2 ile uzatılır (istemci özeti); sunucu onu rastgele tuzla bir kez daha
-- özetler. Kurtarma kodu yalnız özetiyle saklanır. Art arda yanlış denemede hesap bir süre kilitlenir.
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_login INTEGER NOT NULL,
  no_tutorial INTEGER NOT NULL DEFAULT 0,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- Oturum: tarayıcıdaki belirtecin özeti.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_account ON sessions (account_id);

-- Kayıt: özet (liste için) ve sıkıştırılmış veri (gzip) ayrı sütunlarda.
CREATE TABLE saves (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  created INTEGER NOT NULL,
  meta TEXT NOT NULL,
  data BLOB NOT NULL
);
CREATE INDEX saves_account ON saves (account_id, created);

-- Harekât başına en yüksek değerler: aynı harekât yeniden yüklenince istatistik ikinci kez sayılmaz.
CREATE TABLE campaigns (
  account_id INTEGER NOT NULL,
  campaign TEXT NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  earned INTEGER NOT NULL DEFAULT 0,
  peak INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  game_time REAL NOT NULL DEFAULT 0,
  play_sec INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL,
  PRIMARY KEY (account_id, campaign)
);

-- Skorlar: period 'all' (tüm zamanlar) ya da ISO hafta ('2026-W44').
CREATE TABLE stats (
  account_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  earned INTEGER NOT NULL DEFAULT 0,
  peak INTEGER NOT NULL DEFAULT 0,
  play_sec INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, period)
);
CREATE INDEX stats_kills ON stats (period, kills DESC);
CREATE INDEX stats_wins ON stats (period, wins DESC);
CREATE INDEX stats_earned ON stats (period, earned DESC);
CREATE INDEX stats_peak ON stats (period, peak DESC);
CREATE INDEX stats_play ON stats (period, play_sec DESC);
