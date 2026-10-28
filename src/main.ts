import './style.css';
import { Game } from './game';
import { EN, L, LANG } from './i18n';

// Sayfanın dili (büyük harfe çevirme: Türkçede i → İ, İngilizcede i → I) ve index.html'deki sabit metinler
document.documentElement.lang = LANG;
if (EN) {
  for (const el of document.querySelectorAll<HTMLElement>('[data-en]')) el.textContent = el.dataset.en!;
  for (const el of document.querySelectorAll<HTMLElement>('[data-en-title]')) el.title = el.dataset.enTitle!;
}

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

if (import.meta.env.DEV && new URLSearchParams(location.search).has('rec')) {
  // Video kaydı (yalnız geliştirme sunucusunda; tools/rec)
  void import('./rec/recorder').then((m) => m.startRecorder());
} else if (!webgl2()) {
  fail(L(
    'Bu tarayıcı 3B grafiği (WebGL 2) desteklemiyor ya da grafik hızlandırması kapalı. Güncel Chrome, Safari, Edge ya da Firefox ile dene.',
    'This browser does not support 3D graphics (WebGL 2), or hardware acceleration is turned off. Try an up-to-date Chrome, Safari, Edge or Firefox.',
  ));
} else {
  try {
    const game = new Game();
    // Konsoldan inceleme kolaylığı için
    (window as unknown as { game: Game }).game = game;
  } catch (e) {
    console.error(e);
    fail(L('Oyun başlatılamadı. Sayfayı yenile; düzelmezse başka bir tarayıcı dene.', 'The game could not start. Reload the page; if that does not help, try another browser.'));
  }
}
