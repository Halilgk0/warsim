import './style.css';
import { Game } from './game';

// iOS: yazı kutusuna odaklanınca sayfayı büyütmesin diye kutular 16 px (style.css .ios)
if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
  document.documentElement.classList.add('ios');
}

const game = new Game();
// Konsoldan inceleme kolaylığı için
(window as unknown as { game: Game }).game = game;
