// Arayüz yerleşimi: yan panelleri gizle/göster, sağ paneldeki bölümleri (seçim, aktif görevler, olaylar) daralt.
// Tercihler tarayıcıda saklanır. Dar ekranda (yatay telefon) paneller kapalı başlar ve aynı anda biri açık kalır.

/** Dar ekran (yatay telefon ya da küçük pencere): style.css'teki sıkışık düzenle aynı eşik. */
const COMPACT = window.matchMedia('(max-height: 520px), (max-width: 900px)');

export function isCompact(): boolean {
  return COMPACT.matches;
}

const KEY = 'warsim.ui.v1';

interface UiState {
  collapsed: string[];
  hideLeft: boolean;
  hideRight: boolean;
}

function load(): UiState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { collapsed: [], hideLeft: false, hideRight: false, ...(JSON.parse(raw) as Partial<UiState>) };
  } catch {
    // depolama kapalı olabilir
  }
  return { collapsed: [], hideLeft: false, hideRight: false };
}

export class Layout {
  private st = load();
  /** Geniş ekrandaki panel tercihi (dar ekranda kapalı başlamak bunu ezmesin). */
  private wide = { hideLeft: this.st.hideLeft, hideRight: this.st.hideRight };
  private readonly left = document.getElementById('left')!;
  private readonly right = document.getElementById('right')!;
  private readonly leftBtn = document.getElementById('left-toggle')!;
  private readonly rightBtn = document.getElementById('right-toggle')!;

  constructor() {
    // Dar ekranda bir panel açılınca öbürü kapanır (harita görünsün)
    this.leftBtn.addEventListener('click', () => {
      this.st.hideLeft = !this.st.hideLeft;
      if (!this.st.hideLeft && isCompact()) this.st.hideRight = true;
      this.apply();
    });
    this.rightBtn.addEventListener('click', () => {
      this.st.hideRight = !this.st.hideRight;
      if (!this.st.hideRight && isCompact()) this.st.hideLeft = true;
      this.apply();
    });
    if (isCompact()) {
      this.st.hideLeft = true;
      this.st.hideRight = true;
    }
    // Dar düzene geçince (telefon döndü, pencere daraldı) paneller kapanır; genişleyince tercih geri gelir
    COMPACT.addEventListener('change', () => {
      if (isCompact()) {
        this.st.hideLeft = true;
        this.st.hideRight = true;
      } else {
        this.st.hideLeft = this.wide.hideLeft;
        this.st.hideRight = this.wide.hideRight;
      }
      this.apply();
    });
    this.right.addEventListener('click', (e) => {
      const h = (e.target as HTMLElement).closest<HTMLElement>('[data-toggle]');
      if (!h) return;
      const id = h.dataset.toggle!;
      const i = this.st.collapsed.indexOf(id);
      if (i >= 0) this.st.collapsed.splice(i, 1);
      else this.st.collapsed.push(id);
      this.apply();
    });
    this.apply();
  }

  /** Dar ekranda bir panel gerekince (seçim) açılır, öbürü kapanır; geniş ekranda kullanıcının tercihi kalır. */
  reveal(side: 'left' | 'right'): void {
    if (!isCompact()) return;
    const hideLeft = side !== 'left';
    const hideRight = side !== 'right';
    if (this.st.hideLeft === hideLeft && this.st.hideRight === hideRight) return;
    this.st.hideLeft = hideLeft;
    this.st.hideRight = hideRight;
    this.apply();
  }

  /** Sol panel planlayıcı açıkken zaten gizli; düğme de gizlenir. */
  update(plannerOpen: boolean): void {
    this.leftBtn.classList.toggle('hidden', plannerOpen);
  }

  get leftHidden(): boolean {
    return this.st.hideLeft;
  }

  private apply(): void {
    this.left.classList.toggle('collapsed', this.st.hideLeft);
    this.right.classList.toggle('collapsed', this.st.hideRight);
    this.leftBtn.textContent = this.st.hideLeft ? '›' : '‹';
    this.leftBtn.title = this.st.hideLeft ? 'Sol paneli aç' : 'Sol paneli kapat';
    this.leftBtn.classList.toggle('closed', this.st.hideLeft);
    this.rightBtn.textContent = this.st.hideRight ? '‹' : '›';
    this.rightBtn.title = this.st.hideRight ? 'Sağ paneli aç' : 'Sağ paneli kapat';
    this.rightBtn.classList.toggle('closed', this.st.hideRight);
    for (const sec of this.right.querySelectorAll<HTMLElement>('.rsec')) {
      sec.classList.toggle('folded', this.st.collapsed.includes(sec.dataset.sec!));
    }
    if (!isCompact()) this.wide = { hideLeft: this.st.hideLeft, hideRight: this.st.hideRight };
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...this.st, ...this.wide }));
    } catch {
      // depolama kapalı olabilir
    }
  }
}
