// Yönetici: şifresini ve kurtarma kodunu unutan oyuncu için (Geri bildirim ya da sosyal medyadan yazdığında).
//   node tools/admin.mjs bilgi "Oyuncu Adı"     hesabın açılış tarihi, son giriş, son kayıtlar, skorları
//   node tools/admin.mjs sifirla "Oyuncu Adı"   yeni kurtarma kodu (oyuncu "Şifremi unuttum"dan yeni şifre belirler)
//
// Ortam değişkenleri: WARSIM_ADMIN_KEY (Cloudflare'de worker'ın ADMIN_KEY sırrı; verilmezse ~/.warsimbox-admin-key
// dosyasından okunur) ve WARSIM_API (varsayılan https://warsimbox.com/api; yerelde http://localhost:8787/api).
//
// Kodu vermeden önce hesabın gerçekten o kişinin olduğunu sor: "bilgi" çıktısındaki açılış tarihi (yaklaşık), son
// harekâtın haritası ve büyüklüğü, düşman sayısı, kayıtların adları. Bunları yalnız hesabın sahibi bilir. Emin
// değilsen kod verme; hesap başkasının eline geçer.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [cmd, name] = process.argv.slice(2);
const API = process.env.WARSIM_API ?? 'https://warsimbox.com/api';
const KEY_FILE = join(homedir(), '.warsimbox-admin-key');
const KEY = process.env.WARSIM_ADMIN_KEY ?? (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : undefined);
if (!KEY || !name || !['bilgi', 'sifirla'].includes(cmd)) {
  console.log('Kullanım: WARSIM_ADMIN_KEY=... node tools/admin.mjs bilgi|sifirla "Oyuncu Adı"');
  process.exit(1);
}
const r = await fetch(`${API}/admin?name=${encodeURIComponent(name)}`, { method: cmd === 'bilgi' ? 'GET' : 'POST', headers: { 'x-admin-key': KEY } });
const j = await r.json().catch(() => ({ error: `yanıt okunamadı (${r.status})` }));
if (!r.ok) {
  console.log(j.error === 'no_account' ? 'Bu adla hesap yok.' : j.error === 'forbidden' ? 'Yönetici anahtarı yanlış.' : `Hata: ${j.error}`);
  process.exit(1);
}
if (cmd === 'sifirla') {
  console.log(`${j.name} için yeni kurtarma kodu: ${j.recoveryCode}`);
  console.log('Oyuncu: Giriş yap → Şifremi unuttum → adını ve bu kodu yazıp yeni şifre belirlesin. Eski kod artık geçmez.');
} else console.log(JSON.stringify(j, null, 2));
