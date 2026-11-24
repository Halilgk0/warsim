-- Geri bildirim kararına yöneticinin notu (2026-11-24): ör. reddetme nedeni. Oyuncunun durum e-postasına ve Profil'deki mesaj
-- satırına gider. Boş bırakılırsa önceki not kalır.
ALTER TABLE feedback ADD COLUMN note TEXT;
