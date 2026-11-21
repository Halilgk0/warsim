// Oyunun nerede açıldığı. Google Play'deki uygulama (TWA) siteyi Chrome'da açar; Play kuralları uygulama içinden Play dışı
// ödemeye yönlendirmeyi yasaklar, bu yüzden destekçi paketi orada gösterilmez (sitede alınan rozet ve kayıt yerleri yine geçer).
// Tanıma: TWA ilk açılışta yönlendireni android-app://<paket> verir; sonraki yeniden yüklemelerde kaybolmasın diye sekme
// boyunca saklanır. Uygulamanın başlangıç adresine ?kaynak=play eklenirse o da tanınır.

const PACKAGE = 'com.warsimbox.app';
const KEY = 'warsim.play';

function detect(): boolean {
  try {
    const on = document.referrer.startsWith(`android-app://${PACKAGE}`)
      || new URLSearchParams(location.search).get('kaynak') === 'play'
      || sessionStorage.getItem(KEY) === '1';
    if (on) sessionStorage.setItem(KEY, '1');
    return on;
  } catch {
    return false;
  }
}

/** Google Play uygulamasının içinde mi. */
export const IN_PLAY_APP = typeof document !== 'undefined' && detect();
