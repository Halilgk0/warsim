// Dil geçişi ekranı: yükleme ekranının renginde gök, süzülen iki bulut, ekranı soldan sağa geçen ve arkasında yeni
// dilin adını yazan pankart çeken küçük bir uçak; altta "Switching to English…" / "Türkçeye geçiliyor…". Uçak
// ekranın ortasını geçince sayfa yeni dille açılır. Hareket azaltma tercihinde yalnız yazı.

import type { Lang } from '../i18n';

const PLANE = `<svg class="ls-plane" viewBox="0 0 120 44" aria-hidden="true">
  <path d="M8 24 Q10 17 30 17 L84 18 Q98 19 104 24 Q98 29 84 30 L30 30 Q10 30 8 24 Z" fill="#86b3a2"/>
  <path d="M34 22 L62 22 L52 4 L44 4 Z" fill="#6f9d8c"/>
  <path d="M40 27 L64 27 L56 40 L48 40 Z" fill="#5f8a7a"/>
  <path d="M10 22 L20 22 L14 9 L8 9 Z" fill="#6f9d8c"/>
  <path d="M70 18 Q76 11 86 14 L88 19 Z" fill="#cfe3ec"/>
  <circle cx="106" cy="24" r="3" fill="#4a4857"/>
  <ellipse class="ls-prop" cx="108" cy="24" rx="2" ry="14" fill="rgba(74,72,87,0.35)"/>
</svg>`;

export function playLangSwap(next: Lang, done: () => void): void {
  const word = next === 'en' ? 'English' : 'Türkçe';
  const text = next === 'en' ? 'Switching to English' : 'Türkçeye geçiliyor';
  const el = document.createElement('div');
  el.className = 'lang-swap';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="ls-cloud c1"></div><div class="ls-cloud c2"></div>
    <div class="ls-flight"><span class="ls-banner">${word}</span><i class="ls-rope"></i>${PLANE}</div>
    <div class="ls-text"><b>${text}<span class="ls-dots"><i>.</i><i>.</i><i>.</i></span></b><small>WarSimBox</small></div>`;
  document.body.appendChild(el);
  // Bir kare sonra görünür (geçiş animasyonu başlasın)
  requestAnimationFrame(() => el.classList.add('on'));
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(done, calm ? 600 : 1500);
}
