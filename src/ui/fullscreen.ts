// Tarayıcının tam ekranı (sekme ve adres çubuğu gizlenir). Kullanıcı hareketi (tıklama) sırasında çağrılmalı.

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

/** Tarayıcı tam ekranı destekliyor mu (iPhone Safari desteklemez: düğmeler gizlenir). */
export function fullscreenSupported(): boolean {
  return !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
}

export function enterFullscreen(): void {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  // Gömülü sayfada ya da izin yoksa sessizce vazgeç; telefonda ekranı yataya kilitlemeyi dene (Android)
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (window.matchMedia('(pointer: coarse)').matches) o.lock?.('landscape').catch(() => undefined);
    })
    .catch(() => undefined);
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  else enterFullscreen();
}

/** Tam ekrana girip çıkınca çağrılır. */
export function onFullscreenChange(fn: () => void): void {
  document.addEventListener('fullscreenchange', fn);
}
