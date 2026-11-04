// Dokunmatik ekranda klavye: yatay telefonda klavye ekranın çoğunu kaplar, ortalı pencerenin yazı alanı arkasında kalır. Yazı
// alanına odaklanınca kök öğeye .kb eklenir (style.css): pencereler üste dayanır ve kayabilir, alan görünür yerin tepesine
// getirilir. Tarayıcının klavye boyunu bildirmesine bağlı değil: alan zaten en üstte. Bilgisayarda hiçbir şey yapmaz.

/** Odak gidince .kb hemen kalkmasın: düğmeye dokunurken pencere kayarsa dokunuş boşa gider. */
const LEAVE_MS = 200;
/** Klavye kapandı sayılacak büyüme (Android'de geri tuşu klavyeyi odak gitmeden kapatır). */
const CLOSED_GROW_PX = 80;

const isText = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement => {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'hidden'].includes(el.type);
};

export function installKeyboardFit(): void {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const root = document.documentElement;
  let leave = 0;

  document.addEventListener('focusin', (e) => {
    const el = e.target as Element;
    if (!isText(el)) return;
    clearTimeout(leave);
    root.classList.add('kb');
    const show = () => {
      if (document.activeElement === el) el.scrollIntoView({ block: 'start' });
    };
    requestAnimationFrame(show);
    // Klavye açılırken tarayıcı kendi de kaydırabilir
    setTimeout(show, 320);
  });

  document.addEventListener('focusout', () => {
    clearTimeout(leave);
    leave = window.setTimeout(() => {
      if (!isText(document.activeElement)) root.classList.remove('kb');
    }, LEAVE_MS);
  });

  const vv = window.visualViewport;
  if (!vv) return;
  let last = vv.height;
  vv.addEventListener('resize', () => {
    if (vv.height > last + CLOSED_GROW_PX && isText(document.activeElement)) document.activeElement.blur();
    last = vv.height;
  });
}
