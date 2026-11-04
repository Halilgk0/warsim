// Yönetici: şifresini ve kurtarma kodunu unutan oyuncu için (warsimbox@gmail.com ya da sosyal medyadan yazdığında) ve KVKK
// silme başvuruları için.
//   node tools/admin.mjs bilgi "Oyuncu Adı"       e-posta adresi, onaylar, açılış tarihi, son giriş, son kayıtlar, skorları
//   node tools/admin.mjs sifirla "Oyuncu Adı"     yeni kurtarma kodu (oyuncu "Şifremi unuttum"dan yeni şifre belirler)
//   node tools/admin.mjs sil "Oyuncu Adı"         silinecek hesabı gösterir, bir şey silmez
//   node tools/admin.mjs sil "Oyuncu Adı" evet    hesabı, kayıtları, skorları ve oturumları siler; GERİ ALINAMAZ
//
// Ortam değişkenleri: WARSIM_ADMIN_KEY (Cloudflare'de worker'ın ADMIN_KEY sırrı; verilmezse ~/.warsimbox-admin-key
// dosyasından okunur) ve WARSIM_API (varsayılan https://warsimbox.com/api; yerelde http://localhost:8787/api).
//
// Kodu vermeden önce hesabın gerçekten o kişinin olduğunu sor: "bilgi" çıktısındaki açılış tarihi (yaklaşık), son
// harekâtın haritası ve büyüklüğü, düşman sayısı, kayıtların adları. Bunları yalnız hesabın sahibi bilir. Emin
// değilsen kod verme; hesap başkasının eline geçer.
//
// Oyuncu hesabını Profil'den kendi silebilir; bu komut şifresini kaybedenler içindir. Silmeden önce de aynı doğrulamayı
// yap: başvuru hesaptaki (doğrulanmış) e-posta adresinden geldiyse bu güçlü bir işarettir. Silinen veri veritabanı
// yedeklerinde en çok 30 gün kalır, sonra kendiliğinden yok olur.
// Geri bildirimler hesaba bağlı değildir: varsa warsimbox@gmail.com kutusundan ve eski Google Formu yanıtlarından ayrıca silinir.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [cmd, name, confirm] = process.argv.slice(2);
const API = process.env.WARSIM_API ?? 'https://warsimbox.com/api';
const KEY_FILE = join(homedir(), '.warsimbox-admin-key');
const KEY = process.env.WARSIM_ADMIN_KEY ?? (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : undefined);
if (!KEY || !name || !['bilgi', 'sifirla', 'sil'].includes(cmd)) {
  console.log('Kullanım: WARSIM_ADMIN_KEY=... node tools/admin.mjs bilgi|sifirla|sil "Oyuncu Adı"');
  process.exit(1);
}
// "evet" yazılmadan silinmez: önce silinecek hesap gösterilir
const remove = cmd === 'sil' && confirm === 'evet';
const method = remove ? 'DELETE' : cmd === 'sifirla' ? 'POST' : 'GET';
const r = await fetch(`${API}/admin?name=${encodeURIComponent(name)}`, { method, headers: { 'x-admin-key': KEY } });
const j = await r.json().catch(() => ({ error: `yanıt okunamadı (${r.status})` }));
if (!r.ok) {
  console.log(j.error === 'no_account' ? 'Bu adla hesap yok.' : j.error === 'forbidden' ? 'Yönetici anahtarı yanlış.' : `Hata: ${j.error}`);
  process.exit(1);
}
if (cmd === 'sifirla') {
  console.log(`${j.name} için yeni kurtarma kodu: ${j.recoveryCode}`);
  console.log('Oyuncu: Giriş yap → Şifremi unuttum → adını ve bu kodu yazıp yeni şifre belirlesin. Eski kod artık geçmez.');
} else if (remove) {
  console.log(`${j.name} silindi. Silinen satırlar: ${JSON.stringify(j.deleted)}`);
} else {
  console.log(JSON.stringify(j, null, 2));
  if (cmd === 'sil') console.log(`Hiçbir şey silinmedi. Silmek için: node tools/admin.mjs sil "${j.name}" evet`);
}
