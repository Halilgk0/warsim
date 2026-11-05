// Teşekkür penceresi: toplam oynama süresi 6 saati geçen herkese oyunun içinde bir kez. Hesapta süre sunucudan gelir
// (skor istatistiği, harekâtta geçen gerçek süre), misafirde bu tarayıcıda sayılır. E-posta ayrı: yalnız yenilik e-postasına
// izin verenlere (worker/thanksMail.ts). Görünüm çelik pencere.

import { L, EN } from '../i18n';
import { esc } from './dom';
import { SOCIAL } from './social';

/** Eşik (sn): 6 saat. worker/thanksMail.ts THANKS_PLAY_SEC ile aynı. */
export const THANKS_PLAY_SEC = 6 * 3600;

/** Gösterildi işareti: hesapta haber izinde, misafirde tarayıcıda. */
export const THANKS_SEEN_ID = 'tesekkur-6s';

/** "8 saat 18 dakika" / "8 hours 18 minutes". */
export function playTimeText(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (EN) return `${h} ${h === 1 ? 'hour' : 'hours'}${m ? ` ${m} ${m === 1 ? 'minute' : 'minutes'}` : ''}`;
  return `${h} saat${m ? ` ${m} dakika` : ''}`;
}

export function thanksTitle(name: string): string {
  return name ? L(`Teşekkürler, ${esc(name)}!`, `Thank you, ${esc(name)}!`) : L('Teşekkürler!', 'Thank you!');
}

export function thanksBody(sec: number): string {
  const time = `<b>${playTimeText(sec)}</b>`;
  const links = SOCIAL.map((s) => `<a class="thanks-soc" href="${s.url}" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${s.path}"/></svg>${s.name}</a>`).join('');
  return `<p class="thanks-lead">${L(
    `WarSimBox’ı bugüne kadar toplam ${time} oynadınız. Oyunumuzu bu kadar süre oynadığınız için çok teşekkür ederiz.`,
    `You have played WarSimBox for ${time} so far. Thank you so much for spending this much time with our game.`,
  )}</p>
    <p>${L('Bizi sosyal medyadan da desteklemeyi unutmayın:', 'Please don’t forget to support us on social media too:')}</p>
    <div class="thanks-social">${links}</div>
    <p>${L('Lütfen oyunu arkadaşlarınıza da önerin; bu sayede oyun daha hızlı ve daha büyük gelişir.', 'And please recommend the game to your friends: that way it grows faster and bigger.')}</p>
    <div class="btn-row"><button class="primary" data-act="close">${L('Devam et', 'Continue')}</button></div>`;
}
