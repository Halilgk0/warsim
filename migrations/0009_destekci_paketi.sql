-- Destekçi paketi (2026-11-21): ödeme Polar'ın sayfasında; kart bilgisi buraya gelmez. Polar'ın sipariş bildirimi (webhook)
-- siparişi yazar; hesabın toplamı iadeler düşülerek buradan hesaplanır. Rozet ve fazla kayıt yeri toplamdan çıkar
-- (src/net/shared.ts supportTier, slotsFor). Hesap silinince siparişleri de silinir (worker eraseAccount).
ALTER TABLE accounts ADD COLUMN support_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE support_orders (
  -- Polar sipariş kimliği (aynı bildirim iki kez gelirse üstüne yazılır)
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  -- İndirim sonrası, vergi öncesi tutar (sent, USD) ve iade edilen kısmı
  net_cents INTEGER NOT NULL,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  -- Polar'daki durum: paid, partially_refunded, refunded, ...
  status TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX support_orders_account ON support_orders (account_id);
