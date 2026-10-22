import './style.css';
import { Game } from './game';

// iOS: yazı kutusuna odaklanınca sayfayı büyütmesin diye kutular 16 px (style.css .ios)
if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
  document.documentElement.classList.add('ios');
}

/** Açılamadı: yükleme ekranında açıklama (yoksa oyuncu sonsuza dek "yükleniyor" görür). */
function fail(text: string): void {
  const el = document.getElementById('loading');
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = `<div><b>WarSimBox</b><span style="max-width: 340px; text-align: center; line-height: 1.45">${text}</span></div>`;
}

/** Three.js WebGL 2 ister (eski ya da grafik hızlandırması kapalı tarayıcılarda yok). */
function webgl2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

if (!webgl2()) {
  fail('Bu tarayıcı 3B grafiği (WebGL 2) desteklemiyor ya da grafik hızlandırması kapalı. Güncel Chrome, Safari, Edge ya da Firefox ile dene.');
} else {
  try {
    const game = new Game();
    // Konsoldan inceleme kolaylığı için
    (window as unknown as { game: Game }).game = game;
  } catch (e) {
    console.error(e);
    fail('Oyun başlatılamadı. Sayfayı yenile; düzelmezse başka bir tarayıcı dene.');
  }
}
