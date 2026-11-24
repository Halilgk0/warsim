-- Geri bildirim incelemesi ve katkı puanı (2026-11-24). Yalnız oyuncunun "incelensin" dediği mesajlar saklanır (ötekiler
-- eskisi gibi yalnız e-postayla gelir). Durum: review (incelemede), verified (hata doğrulandı), accepted (öneri kabul),
-- done (yapıldı), rejected (uygun değil), duplicate (tekrar). points: bu mesajın kazandırdığı toplam puan.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review',
  points INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX feedback_account ON feedback (account_id, created);
CREATE INDEX feedback_status ON feedback (status, created);

-- Hesabın toplam katkı puanı: her kararda mesajlarından yeniden hesaplanır.
ALTER TABLE accounts ADD COLUMN contrib INTEGER NOT NULL DEFAULT 0;
