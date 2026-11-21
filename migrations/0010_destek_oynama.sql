-- Destekçi paketi iade kuralı (2026-11-21): ödemeden sonra toplam 2,5 saat ve üstü oynandıysa iade yapılmaz. Sipariş ilk
-- yazıldığında hesabın o anki toplam oynama süresi (stats 'all' play_sec, sn) saklanır; yönetici aracı aradaki farkı gösterir.
ALTER TABLE support_orders ADD COLUMN play_sec_at INTEGER;

-- Hesabın destekçi seviyesi (0–3, rozet) ve sayılan ödeme sayısı (iadesi tam yapılmamış ödemeler). Toplam tutar zaten
-- support_cents'te (0009). Üçü de her sipariş bildiriminde siparişlerden yeniden hesaplanır.
ALTER TABLE accounts ADD COLUMN support_tier INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN support_count INTEGER NOT NULL DEFAULT 0;
