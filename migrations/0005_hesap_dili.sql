-- Hesabın dili ('tr' ya da 'en'): e-postalar oyuncunun seçtiği dilde gider. Oyun her açıldığında güncellenir; oyuncu
-- yeni sürümde oyunu açana kadar eski hesaplarda boş kalır.
ALTER TABLE accounts ADD COLUMN lang TEXT;
