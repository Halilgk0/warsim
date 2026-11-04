-- Hesabın okuduğu haberler (kimliklerin JSON dizisi): haberlerdeki okunmamış işareti cihazlar arasında aynı kalsın.
-- Hesap silinince satırla birlikte gider.
ALTER TABLE accounts ADD COLUMN news_seen TEXT NOT NULL DEFAULT '[]';
