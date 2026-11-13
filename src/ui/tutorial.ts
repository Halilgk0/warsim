// Öğretici: "Oyuna başla"da soran pencere (başlat / kapat / bir daha sorma), sonra beş bölümlük rehber: ana menü
// (dil, hesap, haberler, geri bildirim), harita, ilk görev (üsten devriye kaldır), ülkeni büyüt, savaş.
// Gösterilen yer dışı kararır. Bilgi adımlarında oyun durur, yalnız kutudaki düğmeler tıklanır ("Devam et").
// Eylem adımlarında yalnız vurgulanan yer tıklanır; oyuncu işi yapınca adım kendiliğinden ilerler. Her adımda
// "Sonraki bölüm" ve "Öğreticiyi bitir" var. Ana menü bölümünde dil değişirse sayfa yeniden açılır ve öğretici
// sonraki adımdan sürer (sessionStorage).

import { Vector3 } from 'three';
import type { Game } from '../game';
import type { Airbase } from '../sim/structures/airbase';
import { SPECS } from '../sim/aircraft/specs';
import { currentAccount, setTutorialPromptOff, tutorialPromptOff } from '../persist';
import { L } from '../i18n';
import { $, esc } from './dom';

type Chapter = 'menu' | 'map' | 'mission' | 'grow' | 'war';
const CHAPTERS: Chapter[] = ['menu', 'map', 'mission', 'grow', 'war'];
const CH_NAME: Record<Chapter, string> = {
  menu: L('Ana menü', 'Main menu'),
  map: L('Harita', 'The map'),
  mission: L('İlk görev', 'First mission'),
  grow: L('Ülkeni büyüt', 'Grow your nation'),
  war: L('Savaş', 'War'),
};

type Target = Element | Element[] | DOMRect | null;

interface Step {
  id: string;
  ch: Chapter;
  text: () => string;
  /** Vurgulanan yer (yoksa kutu ortada, bütün ekran kararır). */
  target?: () => Target;
  /** Oyuncunun yapacağı iş: yapılınca adım ilerler. Yoksa bilgi adımı ("Devam et"). */
  done?: () => boolean;
  /** Vurgulanan yer tıklanabilir (eylem adımlarında hep). */
  click?: boolean;
  /** Harita serbest, arayüz kapalı (kamera denemesi). */
  map?: boolean;
  /** Oyun hızı (yoksa durur). */
  speed?: number;
  /** Adım başlarken hazırlık (panel aç, kamerayı üsse çevir). */
  enter?: () => void;
  /** Bilgi adımının düğmesi (varsayılan "Devam et"). */
  button?: () => string;
  /** Ayrıntılı, etkileşimli adım (kamera yapıya gider, oyuncu dokunur, panelden girer). Hem baştan sona turda hem konularda. */
  deep?: boolean;
}

/** Dokunmatik ekran: "dokun", yoksa "tıkla". */
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const tap = (): string => (TOUCH ? L('dokun', 'tap') : L('tıkla', 'click'));
const Tap = (): string => (TOUCH ? L('Dokun', 'Tap') : L('Tıkla', 'Click'));
/** Türkçe ekli biçimler: "dokunup / tıklayıp", "dokunarak / tıklayarak". */
const tapThen = (): string => (TOUCH ? 'dokunup' : 'tıklayıp');
const tapBy = (): string => (TOUCH ? 'dokunarak' : 'tıklayarak');

const RESUME = 'warsim.tutorial.resume';
const _v = new Vector3();

/** Görünür ilk öğe (gizli olanlar atlanır). */
function visible(sel: string): Element | null {
  for (const e of document.querySelectorAll<HTMLElement>(sel)) {
    const r = e.getBoundingClientRect();
    if (e.offsetParent !== null && r.width > 0 && r.height > 0) return e;
  }
  return null;
}

/** "a, b ve c" / "a, b and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${L('ve', 'and')} ${items[items.length - 1]}`;
}

// ------------------------------------------------------------------ konular (2026-11-13)
// Oyunun içinden (üst çubuktaki Öğretici düğmesi ve duraklatma menüsü) konu listesi açılır: ana maddeye basınca yalnız o
// konunun adımları, bu harekâtın içinde, kaldığı yerden gösterilir. Alt maddeler yalnız göstermek ve aramak için.

/** Konu simgeleri: 24×24 çizgi siluetler (konunun kendisi). */
const TOPIC_ICON: Record<string, string> = {
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  mission: '<path d="M12 2.5v19M4 12.5l8-3 8 3M8.5 20.5 12 19l3.5 1.5"/><path d="M12 2.5c1 1 1.4 2.4 1.4 4"/>',
  money: '<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v5c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-5M5 11.5v5c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-5"/>',
  town: '<path d="M2.5 20.5h19M4 20.5V11l4.5-4 4.5 4v9.5M13 20.5v-7l4-3.5 4 3.5v7"/><path d="M7 20.5v-4h3v4"/>',
  factory: '<path d="M2.5 20.5V10l5 3V10l5 3V10l5 3V4h4v16.5z"/><path d="M6 17h2.5M11 17h2.5"/>',
  research: '<path d="M9.5 3h5M10.5 3v6L5 19a1.3 1.3 0 0 0 1.2 2h11.6a1.3 1.3 0 0 0 1.2-2l-5.5-10V3"/><path d="M7.5 15h9"/>',
  war: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/>',
};

interface Topic {
  id: string;
  title: () => string;
  icon: string;
  /** Adım kimlikleri ve alt madde adları (göstermek ve aramak için). */
  steps: [string, () => string][];
}

const TOPICS: Topic[] = [
  {
    id: 'map', title: () => L('Harita ve kamera', 'Map and camera'), icon: 'map',
    steps: [
      ['welcome', () => L('Harita ve ülken', 'The map and your nation')],
      ['camera', () => L('Kamerayı kaydırma, yakınlaştırma, döndürme', 'Panning, zooming and rotating')],
      ['time', () => L('Oyun hızı ve süre', 'Game speed and play time')],
      ['mapSpeed', () => L('Hızlandırma', 'Speeding up')],
      ['mapPause', () => L('Duraklatma', 'Pausing')],
    ],
  },
  {
    id: 'mission', title: () => L('Görev planlama ve kalkış', 'Planning and launching a mission'), icon: 'mission',
    steps: [
      ['base', () => L('Hava üssünü seçme', 'Selecting your airbase')],
      ['hangar', () => L('Hangar ve pilotlar', 'Hangar and pilots')],
      ['plan', () => L('Görev planı', 'Mission plan')],
      ['force', () => L('Uçak sayısı ve tipi', 'Number and type of aircraft')],
      ['pick', () => L('Haritadan bölge seçme', 'Picking an area on the map')],
      ['point', () => L('Devriye noktası', 'Patrol point')],
      ['launch', () => L('Kalkış ve mürettebat', 'Take-off and crews')],
      ['missions', () => L('Aktif görevler', 'Active missions')],
      ['follow', () => L('Uçağı takip etme', 'Following an aircraft')],
      ['info', () => L('Uçağın bilgileri', 'Aircraft details')],
    ],
  },
  {
    id: 'money', title: () => L('Para ve hazine', 'Money and treasury'), icon: 'money',
    steps: [
      ['money', () => L('Hazine', 'Treasury')],
      ['treasury', () => L('Gelirler ve madenler', 'Income and mines')],
      ['mineMap', () => L('Haritada madene gitme', 'Finding the mine on the map')],
      ['minePanel', () => L('Maden paneli ve hazineye giriş', 'Mine panel and treasury')],
      ['moneyEnd', () => L('Hazineye iki giriş', 'Two ways into the treasury')],
    ],
  },
  {
    id: 'build', title: () => L('İnşa ve personel', 'Building and personnel'), icon: 'town',
    steps: [
      ['build', () => L('Neler kurulur', 'What you can build')],
      ['bOpen', () => L('İnşa menüsünü açma', 'Opening the Build menu')],
      ['bCity', () => L('Şehir sekmesi', 'City tab')],
      ['bHomes', () => L('Ev, apartman ve personel', 'Houses, apartments and personnel')],
    ],
  },
  {
    id: 'factory', title: () => L('Üretim ve uçaksavar', 'Production and anti-aircraft guns'), icon: 'factory',
    steps: [
      ['prod', () => L('Üretim menüsü', 'Production menu')],
      ['prodRow', () => L('Uçak üretimi', 'Building aircraft')],
      ['prodQty', () => L('Toplu üretim', 'Batch production')],
      ['prodBuild', () => L('Üret düğmesi, iptal', 'Build button, cancelling')],
      ['prodRepeat', () => L('Bitince tekrarla', 'Repeat when done')],
      ['prodGuns', () => L('Uçaksavar topları', 'Anti-aircraft guns')],
      ['prodStock', () => L('Depo, batarya ve yuvalar', 'Stock, batteries and gun pits')],
      ['facMap', () => L('Haritada fabrikaya gitme', 'Finding the factory on the map')],
      ['facPanel', () => L('Fabrika paneli', 'Factory panel')],
      ['aaMap', () => L('Haritada bataryaya gitme', 'Finding a battery on the map')],
      ['aaPanel', () => L('Top yuvaları', 'Gun pits')],
    ],
  },
  {
    id: 'research', title: () => L('Araştırma ve hangar', 'Research and hangar'), icon: 'research',
    steps: [
      ['research', () => L('Araştırma', 'Research')],
      ['researchLines', () => L('Üç araştırma hattı', 'The three research lines')],
      ['rTab', () => L('Mühendislik sekmesi', 'Engineering tab')],
      ['rCard', () => L('Bir program seçme', 'Picking a programme')],
      ['rDossier', () => L('Dosya: bedel, süre, önkoşul', 'Dossier: cost, time, prerequisites')],
      ['rChip', () => L('Araştırma göstergesi', 'Research indicator')],
      ['showroom', () => L('Hangar vitrini: gerçek veriler', 'Hangar showroom: real data')],
    ],
  },
  {
    id: 'war', title: () => L('Düşman ve savaş', 'Enemies and war'), icon: 'war',
    steps: [
      ['enemy', () => L('Bilinen düşman hedefleri', 'Known enemy targets')],
      ['enemyTap', () => L('Hedefe gitme', 'Going to a target')],
      ['enemyInfo', () => L('Hedefi vurma', 'Hitting a target')],
      ['end', () => L('Elenme ve zafer', 'Elimination and victory')],
    ],
  },
];

const topicSvg = (k: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${TOPIC_ICON[k] ?? ''}</svg>`;
/** Arama için sadeleştirme (Türkçe küçük harf, aksansız). */
const fold = (s: string): string => s.toLocaleLowerCase('tr').replace(/[ıi̇]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

export class Tutorial {
  private readonly el: HTMLElement;
  private readonly hole: HTMLElement;
  private readonly blocks: HTMLElement[];
  private readonly bubble: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly topicsEl: HTMLElement;
  /** Konu kipi: yalnız bu konunun adımları; bitince liste yeniden açılır. */
  private topic: string | null = null;
  /** Bu oturumda izlenen konular (listede işaretli). */
  private readonly topicsDone = new Set<string>();
  /** Liste kapanınca dönülecek oyun hızı. */
  private topicsResume = 1;
  private steps: Step[] = [];
  private i = 0;
  private active = false;
  /** Adımın hazırlığı yapıldı mı (oyun yüklenirken bekler). */
  private entered = false;
  /** Ana menü bölümü bitti, harekât yükleniyor. */
  private waitPlay = false;
  /** Öğreticinin yürüdüğü dünya (kayıt yüklenir ya da menüye dönülürse biter). */
  private world: unknown = null;
  private doneAt = 0;
  private lastText = '';
  private lastLayout = '';
  private cam = { x: 0, z: 0, d: 0, yaw: 0, pitch: 0 };
  /** İlk görevde kalkan kol. */
  private flightId = -1;
  /** Araştırma adımı başlarken seçili program. */
  private selAt: string | null = null;
  private flightMax = -1;

  constructor(private readonly game: Game) {
    this.el = document.createElement('div');
    this.el.className = 'tut hidden';
    this.el.innerHTML = `<div class="tut-hole"></div>${'<div class="tut-block"></div>'.repeat(4)}<div class="tut-bubble" role="dialog" aria-live="polite"></div>`;
    this.hole = this.el.querySelector('.tut-hole')!;
    this.blocks = [...this.el.querySelectorAll<HTMLElement>('.tut-block')];
    this.bubble = this.el.querySelector('.tut-bubble')!;
    this.bubble.addEventListener('click', (e) => this.onBubble(e));
    this.promptEl = document.createElement('div');
    this.promptEl.className = 'tut-prompt hidden';
    this.promptEl.addEventListener('click', (e) => this.onPrompt(e));
    this.promptEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.promptEl.classList.add('hidden');
      e.stopPropagation();
    });
    this.topicsEl = document.createElement('div');
    this.topicsEl.className = 'tut-topics hidden';
    this.topicsEl.innerHTML = `<div class="tt-card" role="dialog" aria-modal="true" aria-label="${L('Öğretici', 'Tutorial')}">
      <svg class="tt-route" viewBox="0 0 220 60" aria-hidden="true"><path d="M4 50C40 52 60 14 104 22s70 30 112-14"/><circle cx="4" cy="50" r="3"/><path class="pl" d="M206 9l9-3-3 9-2-4z"/></svg>
      <div class="tt-head"><span class="tt-book"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5c3-1.2 6-1.2 9 .6 3-1.8 6-1.8 9-.6v13c-3-1.2-6-1.2-9 .6-3-1.8-6-1.8-9-.6z"/><path d="M12 6.1v13.1"/></svg></span><div><h2>${L('Öğretici', 'Tutorial')}</h2><p>${L(
        'Bir konu seç: o kısım bu harekâtın içinde gösterilir, sonra oyun kaldığı yerden sürer.',
        'Pick a topic: that part is shown inside this campaign, then the game carries on where it was.',
      )}</p></div><button class="tt-x" data-tt="close" aria-label="${L('Kapat', 'Close')}">✕</button></div>
      <div class="tt-prog"><span></span><i><b></b></i></div>
      <label class="tt-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5"/></svg><input type="search" name="tt-q" autocomplete="off" placeholder="${L('Ara: maden, radar, kalkış…', 'Search: mine, radar, take-off…')}" aria-label="${L('Konularda ara', 'Search topics')}"></label>
      <div class="tt-list"></div>
    </div>`;
    this.topicsEl.addEventListener('click', (e) => this.onTopics(e));
    this.topicsEl.querySelector('input')!.addEventListener('input', (e) => this.renderTopics((e.target as HTMLInputElement).value));
    this.topicsEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeTopics();
      e.stopPropagation();
    });
    $('app').append(this.el, this.promptEl, this.topicsEl);
  }

  /** Konu listesi açık. */
  get topicsOpen(): boolean {
    return !this.topicsEl.classList.contains('hidden');
  }

  /**
   * Konu listesini aç (üst çubuktaki Öğretici düğmesi ve duraklatma menüsü). Liste açıkken oyun durur; kapatılınca
   * resume hızına döner (duraklatma menüsünden gelince onun saklı hızı). Yalnız harekâtta.
   */
  openTopics(resume?: number): void {
    const g = this.game;
    if (g.mode !== 'play' || !g.world.setup) {
      g.toast(L('Öğretici konuları harekâtta açılır.', 'Tutorial topics open during a campaign.'), true);
      return;
    }
    if (this.active) this.stop();
    this.topicsResume = resume ?? (g.timeScale || 1);
    g.setTimeScale(0);
    const input = this.topicsEl.querySelector('input')!;
    input.value = '';
    this.renderTopics('');
    this.topicsEl.classList.remove('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private closeTopics(resume = true): void {
    if (!this.topicsOpen) return;
    this.topicsEl.classList.add('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
    if (resume) this.game.setTimeScale(this.topicsResume);
  }

  /** Liste: ana madde (başlatır) ve altında adımları (yalnız gösterir; aramada eşleşenler vurgulanır). */
  private renderTopics(q: string): void {
    const f = fold(q.trim());
    const list = this.topicsEl.querySelector('.tt-list')!;
    let shown = 0;
    const html = TOPICS.map((t) => {
      const subs = t.steps.map(([, name]) => name());
      const hitTitle = !f || fold(t.title()).includes(f);
      const hits = subs.map((x) => !!f && fold(x).includes(f));
      if (!hitTitle && !hits.some(Boolean)) return '';
      shown++;
      const done = this.topicsDone.has(t.id);
      const n = t.steps.length;
      const no = TOPICS.indexOf(t) + 1;
      return `<section class="tt-topic h-${t.icon}${done ? ' done' : ''}" style="--bg:url('${import.meta.env.BASE_URL}ogretici/${t.id}.webp')">
        <button class="tt-main" data-tt="start" data-id="${t.id}"><span class="tt-ic">${topicSvg(t.icon)}${done ? '<i class="tt-ok">✓</i>' : ''}</span><span class="tt-t"><b><em>${no}</em>${esc(t.title())}</b><small>${L(`${n} adım`, `${n} ${n === 1 ? 'step' : 'steps'}`)}${done ? L(' · izlendi', ' · watched') : ''}</small></span><span class="tt-go">${done ? L('Tekrar', 'Again') : L('Başlat', 'Start')} ›</span></button>
        <ul class="tt-sub">${subs.map((x, i) => `<li${hits[i] ? ' class="hit"' : ''}>${esc(x)}</li>`).join('')}</ul>
      </section>`;
    }).join('');
    list.innerHTML = shown ? html : `<p class="tt-none">${L('Bu aramayla eşleşen konu yok.', 'No topic matches this search.')}</p>`;
    // İlerleme: izlenen konu sayısı
    const k = TOPICS.filter((t) => this.topicsDone.has(t.id)).length;
    const pr = this.topicsEl.querySelector<HTMLElement>('.tt-prog')!;
    pr.querySelector('span')!.textContent = k ? L(`${TOPICS.length} konudan ${k}'i izlendi`, `${k} of ${TOPICS.length} topics watched`) : L(`${TOPICS.length} konu · istediğinden başla`, `${TOPICS.length} topics · start anywhere`);
    pr.querySelector<HTMLElement>('b')!.style.width = `${(k / TOPICS.length) * 100}%`;
  }

  private onTopics(e: Event): void {
    if (e.target === this.topicsEl) {
      this.closeTopics();
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tt]');
    if (!b) return;
    if (b.dataset.tt === 'close') this.closeTopics();
    else if (b.dataset.tt === 'start' && b.dataset.id) this.beginTopic(b.dataset.id);
  }

  /** Konudan listeye dön: konunun açtığı pencere ve inşa çubuğu kapanır (liste kapanınca oyuncu haritaya döner). */
  private leaveTopic(): void {
    this.game.modals.close();
    this.game.build.close();
    this.openTopics();
  }

  /** Yalnız bu konunun adımları, bu harekâtın içinde. */
  private beginTopic(id: string): void {
    const t = TOPICS.find((x) => x.id === id);
    if (!t) return;
    const ids = t.steps.map(([sid]) => sid);
    this.closeTopics(false);
    this.game.modals.close();
    this.game.build.close();
    this.begin(false);
    this.topic = id;
    this.steps = this.buildSteps().filter((st) => ids.includes(st.id));
  }

  /** Öğretici ya da soru penceresi açık (ana menüde başlatma ve kısayollar beklesin). */
  get busy(): boolean {
    return this.active || !this.promptEl.classList.contains('hidden') || this.topicsOpen;
  }

  /** Oyun kısayolları kapalı (görünürken). */
  get capturesKeys(): boolean {
    return (this.active && !this.el.classList.contains('hidden')) || this.topicsOpen;
  }

  // ------------------------------------------------------------------ başlarken sorma

  /** "Oyuna başla": sorulacaksa pencere açılır (true), sorulmayacaksa false (oyun hemen başlar). */
  ask(): boolean {
    if (tutorialPromptOff()) return false;
    this.promptEl.innerHTML = `<div class="tut-card" role="dialog" aria-modal="true">
      <h2>${L('Öğretici', 'Tutorial')}</h2>
      <p>${L(
        'Oyunda yeni misin? Kısa bir öğretici, ilk görevini birlikte planlayarak temel şeyleri adım adım gösterir (yaklaşık 10 dakika; istediğin bölümü atlayabilirsin, sonra Öğretici düğmesinden istediğin konuya yeniden bakabilirsin).',
        'New to the game? A short tutorial shows you the basics step by step while you plan your first mission (about 10 minutes; you can skip any part and later revisit any topic from the Tutorial button).',
      )}</p>
      <div class="tut-actions"><button class="primary" data-tp="start">${L('Öğreticiyi başlat', 'Start tutorial')}</button><button data-tp="close">${L('Kapat', 'Close')}</button></div>
      <label class="check"><input type="checkbox" name="tutoff"> ${L('Bir daha sorma', 'Don\'t ask again')}</label>
    </div>`;
    this.promptEl.classList.remove('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
    this.promptEl.querySelector<HTMLButtonElement>('[data-tp="start"]')?.focus();
    return true;
  }

  private onPrompt(e: Event): void {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tp]')?.dataset.tp;
    if (!act) return;
    if (this.promptEl.querySelector<HTMLInputElement>('input[name="tutoff"]')?.checked) setTutorialPromptOff(true);
    this.promptEl.classList.add('hidden');
    if (act === 'start') this.begin(true);
    else this.game.menu.launch();
  }

  // ------------------------------------------------------------------ akış

  /** fromMenu: ana menüden (önce ana menü bölümü); değilse oyunun içinden (duraklatma menüsü). */
  begin(fromMenu: boolean, startId?: string): void {
    this.topic = null;
    this.steps = this.buildSteps().filter((s) => fromMenu || s.ch !== 'menu');
    this.i = Math.max(0, startId ? this.steps.findIndex((s) => s.id === startId) : 0);
    this.active = true;
    this.entered = false;
    this.waitPlay = false;
    this.world = fromMenu ? null : this.game.world;
    this.lastText = '';
    this.lastLayout = '';
    (document.activeElement as HTMLElement | null)?.blur();
  }

  /** Dil değişimi sonrası (sayfa yeniden açıldı): ana menü bölümünde kalınan yerin ardından sür. */
  resume(): void {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(RESUME);
      sessionStorage.removeItem(RESUME);
    } catch {
      return;
    }
    if (!id || this.game.mode !== 'menu') return;
    const steps = this.buildSteps();
    let k = steps.findIndex((s) => s.id === id);
    if (k < 0) return;
    if (id === 'lang') k++;
    this.begin(true, steps[k].id);
  }

  /** Öğreticiyi kapat. Ana menüdeyken bitirilirse oyun başlar (oyuncu "Oyuna başla"ya basmıştı). */
  private stop(launch = false): void {
    const st = this.steps[this.i];
    this.active = false;
    this.el.classList.add('hidden');
    document.body.classList.remove('tut-maponly');
    try {
      sessionStorage.removeItem(RESUME);
    } catch {
      /* yok say */
    }
    if (st && st.ch !== 'menu' && this.game.mode === 'play' && this.game.world === this.world) this.game.setTimeScale(1);
    if (launch) this.game.menu.launch();
  }

  private advance(to = this.i + 1): void {
    const from = this.steps[this.i];
    if (to >= this.steps.length) {
      // Konu bitti: işaretle, listeye dön
      const t = this.topic;
      this.stop();
      if (t) {
        this.topicsDone.add(t);
        this.leaveTopic();
      }
      return;
    }
    this.i = to;
    this.entered = false;
    this.doneAt = 0;
    this.lastText = '';
    this.lastLayout = '';
    // Ana menü bölümü bitti: harekât başlar, sonraki adım oyun yüklenince
    if (from.ch === 'menu' && this.steps[to].ch !== 'menu') {
      this.waitPlay = true;
      this.el.classList.add('hidden');
      if (!this.game.menu.launch()) this.stop();
    }
  }

  private nextChapter(): void {
    const ch = this.steps[this.i].ch;
    let k = this.i;
    while (k < this.steps.length && this.steps[k].ch === ch) k++;
    this.advance(k);
  }

  private onBubble(e: Event): void {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tut]')?.dataset.tut;
    if (act === 'next' || act === 'skip') this.advance();
    else if (act === 'chapter') this.nextChapter();
    else if (act === 'end') this.stop(this.steps[this.i]?.ch === 'menu');
    else if (act === 'topics') {
      this.stop();
      this.leaveTopic();
    }
  }

  /** Her kare: bağlam, adımın işi yapıldı mı, vurgunun ve kutunun yeri. */
  update(): void {
    if (!this.active) return;
    const g = this.game;
    const st = this.steps[this.i];
    const loading = !$('loading').classList.contains('hidden');
    if (st.ch === 'menu') {
      if (g.mode !== 'menu') {
        this.stop();
        return;
      }
    } else if (this.waitPlay) {
      if (g.mode !== 'play' || loading) return;
      this.waitPlay = false;
      this.world = g.world;
      // Personel saniyede bir güncellenir: zaman 0. saniyede durursa evlerin sakinleri hiç gelmez (kalkış olmaz)
      while (g.world.time < 1.2) g.world.step(1 / 60);
    } else if (g.mode !== 'play' || g.world !== this.world || g.end.isOpen) {
      // Menüye dönüldü, kayıt yüklendi ya da harekât bitti
      this.stop();
      return;
    }
    const covered = loading || g.login.isOpen || g.profile.isOpen || g.news.isOpen || g.feedback.isOpen || g.pause.isOpen;
    this.el.classList.toggle('hidden', covered);
    if (covered) return;
    if (!this.entered) this.enter(st);
    if (st.done?.()) {
      // Kamera denemesinde hareket bitsin diye kısa bekleme
      const now = performance.now();
      if (!this.doneAt) this.doneAt = now + (st.map ? 700 : 150);
      if (now >= this.doneAt) {
        this.advance();
        return;
      }
    }
    this.layout(st);
  }

  private enter(st: Step): void {
    this.entered = true;
    st.enter?.();
    if (st.ch !== 'menu') this.game.setTimeScale(st.speed ?? 0);
    document.body.classList.toggle('tut-maponly', !!st.map);
    if (st.map) {
      const r = this.game.renderer.rig;
      this.cam = { x: r.target.x, z: r.target.z, d: r.distance, yaw: r.yaw, pitch: r.pitch };
    }
    try {
      if (st.ch === 'menu') sessionStorage.setItem(RESUME, st.id);
      else sessionStorage.removeItem(RESUME);
    } catch {
      /* yok say */
    }
    // Vurgulanan yer kaydırılan bir panelin içindeyse görünür olsun
    const t = st.target?.();
    const first = Array.isArray(t) ? t[0] : t instanceof Element ? t : null;
    // (ortaya: planlayıcının altındaki yapışkan "Kalkış" çubuğu düğmenin üstüne binmesin)
    first?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  // ------------------------------------------------------------------ çizim

  private rectOf(t: Target): DOMRect | null {
    if (!t) return null;
    if (t instanceof DOMRect) return t;
    const list = (Array.isArray(t) ? t : [t]).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    if (!list.length) return null;
    const l = Math.max(0, Math.min(...list.map((r) => r.left)));
    const tp = Math.max(0, Math.min(...list.map((r) => r.top)));
    const rt = Math.min(innerWidth, Math.max(...list.map((r) => r.right)));
    const bt = Math.min(innerHeight, Math.max(...list.map((r) => r.bottom)));
    return rt - l > 2 && bt - tp > 2 ? new DOMRect(l, tp, rt - l, bt - tp) : null;
  }

  private layout(st: Step): void {
    const last = this.i === this.steps.length - 1;
    const action = !!st.done;
    const text = st.text();
    if (text !== this.lastText) {
      this.lastText = text;
      const ci = CHAPTERS.filter((c) => this.steps.some((s) => s.ch === c)).indexOf(st.ch);
      const nch = new Set(this.steps.map((s) => s.ch)).size;
      const inCh = this.steps.filter((s) => s.ch === st.ch);
      const k = inCh.indexOf(st) + 1;
      const lastCh = st.ch === this.steps[this.steps.length - 1].ch;
      const tp = this.topic ? TOPICS.find((x) => x.id === this.topic) : undefined;
      const btn = st.button?.() ?? (last ? (tp ? L('Konuyu bitir', 'Finish topic') : L('Bitir', 'Finish')) : L('Devam et', 'Continue'));
      // Konu kipinde başlık konunun adı, bölüm geçişi yok; "Konular" listeye döner
      const headHtml = tp
        ? `<b>${esc(tp.title())}</b><span>${this.i + 1}/${this.steps.length}</span>`
        : `<b>${CH_NAME[st.ch]}</b><span>${L('Bölüm', 'Part')} ${ci + 1}/${nch} · ${k}/${inCh.length}</span>`;
      this.bubble.innerHTML = `
        <div class="tut-head">${headHtml}</div>
        <p>${text}</p>
        <div class="tut-foot">
          ${action ? '' : `<button class="primary" data-tut="next">${btn}</button>`}
          ${lastCh || tp ? '' : `<button data-tut="chapter">${L('Sonraki bölüm ›', 'Next part ›')}</button>`}
          ${tp ? `<button data-tut="topics">‹ ${L('Konular', 'Topics')}</button>` : ''}
          <span class="sp"></span>
          ${action ? `<button class="link" data-tut="skip">${L('Adımı geç', 'Skip step')}</button>` : ''}
          ${last ? '' : `<button class="link" data-tut="end">${tp ? L('Kapat', 'Close') : L('Öğreticiyi bitir', 'End tutorial')}</button>`}
        </div>`;
      this.lastLayout = '';
    }
    const r = st.map ? null : this.rectOf(st.target?.() ?? null);
    const pad = 6;
    const hole = r ? new DOMRect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2) : null;
    const W = innerWidth;
    const H = innerHeight;
    const key = `${st.id}|${hole ? `${hole.x | 0},${hole.y | 0},${hole.width | 0},${hole.height | 0}` : '-'}|${W}x${H}`;
    if (key === this.lastLayout) return;
    this.lastLayout = key;
    const click = !!(st.click || action) && !!hole;
    this.el.classList.toggle('full', !hole && !st.map);
    this.el.classList.toggle('map', !!st.map);
    this.hole.classList.toggle('hidden', !hole);
    this.hole.classList.toggle('act', click);
    const box = (e: HTMLElement, x: number, y: number, w: number, h: number) => {
      e.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px`;
    };
    if (hole) box(this.hole, hole.left, hole.top, hole.width, hole.height);
    // Tıklama engelleri: tıklanabilir delik varsa çevresinde dört parça, yoksa bütün ekran (kamera denemesinde hiç)
    const [b0, b1, b2, b3] = this.blocks;
    if (st.map) for (const b of this.blocks) box(b, 0, 0, 0, 0);
    else if (click && hole) {
      box(b0, 0, 0, W, hole.top);
      box(b1, 0, hole.bottom, W, H - hole.bottom);
      box(b2, 0, hole.top, hole.left, hole.height);
      box(b3, hole.right, hole.top, W - hole.right, hole.height);
    } else {
      box(b0, 0, 0, W, H);
      box(b1, 0, 0, 0, 0);
      box(b2, 0, 0, 0, 0);
      box(b3, 0, 0, 0, 0);
    }
    this.placeBubble(hole, !!st.map);
  }

  /** Kutu vurgunun altına, üstüne, sağına ya da soluna (sığan ilk yana); yoksa ortaya. */
  private placeBubble(hole: DOMRect | null, map: boolean): void {
    const b = this.bubble;
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    const W = innerWidth;
    const H = innerHeight;
    const m = 10;
    let x = (W - bw) / 2;
    let y = (H - bh) / 2;
    // Kamera denemesi: kutu üst çubuğun altında, haritanın ortası (üs) açık kalsın
    if (map) y = (document.getElementById('topbar')?.getBoundingClientRect().bottom ?? 0) + m;
    else if (hole) {
      const cx = hole.left + hole.width / 2 - bw / 2;
      const cy = hole.top + hole.height / 2 - bh / 2;
      if (H - hole.bottom >= bh + m * 2) [x, y] = [cx, hole.bottom + m];
      else if (hole.top >= bh + m * 2) [x, y] = [cx, hole.top - bh - m];
      else if (W - hole.right >= bw + m * 2) [x, y] = [hole.right + m, cy];
      else if (hole.left >= bw + m * 2) [x, y] = [hole.left - bw - m, cy];
      else [x, y] = [W - bw - m, H - bh - m];
    }
    x = Math.min(Math.max(m, x), W - bw - m);
    y = Math.min(Math.max(m, y), H - bh - m);
    b.style.left = `${Math.round(x)}px`;
    b.style.top = `${Math.round(y)}px`;
  }

  // ------------------------------------------------------------------ yardımcılar

  private base(): Airbase | null {
    const g = this.game;
    const list = g.world.airbasesOf(g.playerTeam);
    return list.find((b) => b.s.active) ?? list[0] ?? null;
  }

  /** Dünyadaki bir noktanın çevresi ekranda (r metre yarıçaplı kare, en az 110×80 px). */
  private worldRect(p: Vector3, r: number): DOMRect | null {
    const g = this.game;
    const dom = g.renderer.dom.getBoundingClientRect();
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      _v.set(p.x + dx, p.y, p.z + dz).project(g.renderer.camera);
      if (_v.z > 1) return null;
      xs.push(dom.left + ((_v.x + 1) / 2) * dom.width);
      ys.push(dom.top + ((1 - _v.y) / 2) * dom.height);
    }
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const w = Math.max(110, Math.max(...xs) - Math.min(...xs));
    const h = Math.max(80, Math.max(...ys) - Math.min(...ys));
    return new DOMRect(cx - w / 2, cy - h / 2, w, h);
  }

  /** Haritanın panellerle örtülmeyen kısmı (devriye bölgesi seçerken). */
  private freeMap(): DOMRect {
    const top = (document.getElementById('topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
    const hint = document.getElementById('hint')?.getBoundingClientRect();
    const bottom = (hint && hint.height > 0 ? hint.top : innerHeight) - 8;
    const pl = visible('#planner');
    const left = (pl ? pl.getBoundingClientRect().right : 0) + 8;
    const rp = visible('#right:not(.collapsed)');
    const right = (rp ? rp.getBoundingClientRect().left : innerWidth) - 8;
    return new DOMRect(left, top, Math.max(40, right - left), Math.max(40, bottom - top));
  }

  /** Oyuncunun bu türden ilk sağlam yapısı. */
  private own(kind: string): import('../sim/structures/structure').Structure | null {
    const g = this.game;
    return g.world.structures.find((s) => s.team === g.playerTeam && s.kind === kind && !s.destroyed) ?? null;
  }

  /** Kamera yapıya uçar (seçmez: oyuncu kendisi dokunsun); açık pencere ve seçim kapanır. */
  private flyToOwn(kind: string, distance: number): void {
    const g = this.game;
    const s = this.own(kind);
    g.modals.close();
    g.build.close();
    g.selectStructure(null);
    if (!s) return;
    const rig = g.renderer.rig;
    rig.release();
    rig.stopFly();
    rig.pitch = 52 * (Math.PI / 180);
    rig.flyTo(s.pos, distance, 0.9);
  }

  /** Kamerayı üssün üstüne çevir. */
  private frameBase(distance: number): void {
    const g = this.game;
    const b = this.base();
    const rig = g.renderer.rig;
    rig.release();
    rig.stopFly();
    rig.yaw = 0;
    rig.pitch = 58 * (Math.PI / 180);
    if (b) {
      rig.target.set(b.s.pos.x, b.s.pos.y, b.s.pos.z);
      rig.distance = distance;
    }
  }

  private cameraMoved(): boolean {
    const r = this.game.renderer.rig;
    const c = this.cam;
    return Math.hypot(r.target.x - c.x, r.target.z - c.z) > c.d * 0.04 || Math.abs(r.distance / c.d - 1) > 0.12
      || Math.abs(r.yaw - c.yaw) > 0.15 || Math.abs(r.pitch - c.pitch) > 0.08;
  }

  /** Üsteki hazır uçaklar: "4 Hurricane I ve 2 Ju 87 B". */
  private hangarList(): string {
    const b = this.base();
    if (!b) return '';
    const n = new Map<string, number>();
    for (const af of b.inventory) {
      if (af.status !== 'ready') continue;
      n.set(af.specId, (n.get(af.specId) ?? 0) + 1);
    }
    return joinList([...n].map(([id, k]) => `${k} ${esc(SPECS[id]?.abbr ?? id)}`));
  }

  // ------------------------------------------------------------------ adımlar

  private buildSteps(): Step[] {
    const g = this.game;
    const name = () => esc(g.world.playerName || currentAccount()?.name || '');
    const steps: Step[] = [
      // ---------------------------------------------------------- ana menü
      {
        id: 'lang', ch: 'menu', click: true,
        target: () => visible('#mainmenu [data-mm="lang"]'),
        text: () => L(
          `Hoş geldin! Önce dil: oyunu buradan tek ${TOUCH ? 'dokunuşla' : 'tıkla'} İngilizceye ya da Türkçeye çevirebilirsin.`,
          `Welcome! First, language: switch the whole game between English and Turkish here with one ${TOUCH ? 'tap' : 'click'}.`,
        ),
      },
      {
        id: 'mapsize', ch: 'menu', click: true,
        target: () => visible('#mainmenu .mm-s-map'),
        text: () => L(
          'Harita ve büyüklüğü: küçük haritada üsler birbirine yakın, savaş çabuk başlar; büyük haritada uçuşlar uzun sürer. Herkes her harekâtta rastgele bir yerde başlar; “Yeni yerler” ile yeniden seçebilirsin. İstersen burada değiştir.',
          'Map and size: on a small map the bases are close together and the fighting starts quickly; on a large map flights take longer. Everyone starts somewhere random in each campaign; “New positions” picks again. Change them here if you like.',
        ),
      },
      {
        id: 'account', ch: 'menu', click: true,
        target: () => visible('#mainmenu [data-mm="login"]') ?? visible('#mainmenu .mm-user'),
        text: () => {
          const acc = currentAccount();
          return acc
            ? L(
              `<b>${esc(acc.name)}</b> hesabıyla girdin: oyunun 5 dakikada bir kendiliğinden buluta kaydedilir, başka cihazdan da devam edersin. Harekâtların Skorlar sekmesindeki tabloya yazılır.`,
              `You are logged in as <b>${esc(acc.name)}</b>: your game autosaves to the cloud every 5 minutes, so you can continue on another device. Your campaigns count towards the Scores tab.`,
            )
            : L(
              'Misafir oyun kaydedilmez. Buradan ad ve şifreyle hesap aç: oyunun bulutta saklanır, 5 dakikada bir otomatik kaydedilir, başka cihazdan da devam edersin ve Skorlar tablosuna girersin.',
              'Guest games are not saved. Create an account here with a name and password: your game is kept in the cloud, autosaved every 5 minutes, you can continue on another device and you appear in the Scores table.',
            );
        },
      },
      {
        id: 'news', ch: 'menu', click: true,
        target: () => visible('#mainmenu [data-mm="news"]'),
        text: () => L('Her güncellemede neyin değiştiğini Haberler\'de anlatıyoruz.', 'In News we explain what changed in each update.'),
      },
      {
        id: 'social', ch: 'menu', click: true,
        target: () => visible('#mainmenu .mm-foot .social'),
        text: () => L(
          'Yeni videoları ve yenilikleri Instagram, YouTube ve TikTok\'ta paylaşıyoruz. Bizi takip et!',
          'We post new videos and updates on Instagram, YouTube and TikTok. Follow us!',
        ),
      },
      {
        id: 'feedback', ch: 'menu', click: true,
        target: () => visible('#mainmenu [data-mm="feedback"]'),
        text: () => L('Bir hata gördün ya da bir fikrin mi var? Hesabınla buradan bize yaz.', 'Spotted a bug or have an idea? Write to us here with your account.'),
        button: () => L('Oyuna geç ›', 'Start playing ›'),
      },
      // ---------------------------------------------------------- harita
      {
        id: 'welcome', ch: 'map',
        enter: () => this.frameBase(26000),
        text: () => {
          const n = name();
          return L(
            `${n ? `Komutan ${n}, k` : 'K'}amera ana hava üssünün üstünde. Amacın: düşman ülkelerin hava üslerini yıkıp haritada son kalan olmak.`,
            `${n ? `Commander ${n}, the` : 'The'} camera is over your main airbase. Your goal: destroy the enemy nations' airbases and be the last one standing.`,
          );
        },
      },
      {
        id: 'camera', ch: 'map', map: true,
        done: () => this.cameraMoved(),
        text: () => (TOUCH
          ? L('Haritayı tek parmakla kaydır; iki parmakla yakınlaştır ve çevir. Bir dene.', 'Drag the map with one finger; pinch to zoom and twist to rotate. Give it a try.')
          : L('Sürükle: kaydır · tekerlek: yakınlaş · sağ tıkla sürükle: döndür. Bir dene.', 'Drag: pan · wheel: zoom · right-drag: rotate. Give it a try.')),
      },
      {
        id: 'time', ch: 'map',
        target: () => visible('#timebar'),
        text: () => L(
          'Savaş gerçek zamanlı akar. Buradan duraklatır ya da 4 katına kadar hızlandırırsın; yanındaki sayaç gerçek oynama süreni gösterir, hızlanmaz. Sen okurken öğretici zamanı durdurur.',
          'The war runs in real time. Pause it or speed it up to 4× here; the counter beside it shows your real play time and does not speed up. While you read, the tutorial stops the clock.',
        ),
      },
      {
        id: 'mapSpeed', ch: 'map', deep: true,
        target: () => visible('#timebar [data-speed="2"]'),
        done: () => g.timeScale === 2,
        text: () => L(`"2×"e ${tap()}: savaş iki kat hızlı akar.`, `${Tap()} "2×": the war runs twice as fast.`),
      },
      {
        id: 'mapPause', ch: 'map', deep: true, speed: 2,
        target: () => visible('#timebar [data-speed="0"]'),
        done: () => g.timeScale === 0,
        text: () => L(
          `Şimdi "❚❚"e ${tap()}: oyun durur. Durmuşken de harita gezilir, görev planlanır, inşa edilir.${TOUCH ? '' : ' Klavyede boşluk tuşu.'}`,
          `Now ${tap()} "❚❚": the game pauses. While paused you can still look around, plan missions and build.${TOUCH ? '' : ' Space on the keyboard.'}`,
        ),
      },
      // ---------------------------------------------------------- ilk görev
      {
        id: 'base', ch: 'mission',
        enter: () => {
          g.planner.close();
          g.selectAircraft(null);
          g.selectStructure(null);
          this.frameBase(9000);
        },
        target: () => {
          const b = this.base();
          return b ? this.worldRect(b.s.pos, 650) : null;
        },
        done: () => {
          const s = g.selectedStructure;
          return !!s?.airbase && s.team === g.playerTeam;
        },
        text: () => L(`Ana hava üssüne ${tap()}.`, `${Tap()} your main airbase.`),
      },
      {
        id: 'hangar', ch: 'mission',
        target: () => visible('#left .aflist') ?? visible('#left'),
        text: () => {
          const list = this.hangarList();
          return list
            ? L(
              `Hangarında ${list} var. Her uçağın pilotu, düşürmeleri ve bakım durumu burada.`,
              `Your hangar holds ${list}. Each aircraft's pilot, kills and servicing status are shown here.`,
            )
            : L('Hangarındaki uçaklar, pilotları ve bakım durumları burada.', 'Your hangar\'s aircraft, their pilots and servicing status are shown here.');
        },
      },
      {
        id: 'plan', ch: 'mission',
        target: () => visible('#left [data-act="plan"]'),
        done: () => g.planner.isOpen,
        text: () => L(
          `İlk görevin: üssünün üstünde hava devriyesi. "Görev planla"ya ${tap()}.`,
          `Your first mission: a combat air patrol over your base. ${Tap()} "Plan mission".`,
        ),
      },
      {
        id: 'force', ch: 'mission',
        target: () => [...document.querySelectorAll('#planner .psec')].slice(0, 2),
        text: () => L(
          'Hava devriyesi seçili: avcılar bir bölgenin üstünde dolaşır, bölgeye giren düşmanla çatışır. Kaç uçağın gideceğini + ve − ile seçersin.',
          'Combat air patrol is selected: fighters circle an area and engage any enemy that enters it. Choose how many aircraft go with + and −.',
        ),
      },
      {
        id: 'pick', ch: 'mission',
        target: () => visible('#planner [data-act="pick"]'),
        done: () => g.interaction.mode === 'pickTarget' || g.planner.hasTarget(),
        text: () => L(`Şimdi devriye bölgesi: "Haritadan seç"e ${tap()}.`, `Now the patrol area: ${tap()} "Pick on map".`),
      },
      {
        id: 'point', ch: 'mission',
        target: () => this.freeMap(),
        done: () => g.planner.hasTarget(),
        text: () => L(
          `Haritada devriye bölgesinin merkezine ${tap()}; üssünün yakını iyi bir yer.`,
          `${Tap()} the map where the patrol should be; near your base is a good spot.`,
        ),
      },
      {
        id: 'launch', ch: 'mission',
        enter: () => {
          this.flightMax = Math.max(-1, ...g.world.flights.map((f) => f.id));
        },
        target: () => visible('#planner [data-act="launch"]'),
        done: () => {
          const f = g.world.flights.find((x) => x.team === g.playerTeam && x.id > this.flightMax);
          if (f) this.flightId = f.id;
          return !!f;
        },
        text: () => L(
          `Yukarıdaki özette başarı tahmini, ödül ve yakıt yazar. Hazırsan "Kalkış"a ${tap()}.`,
          `The summary above shows the estimated success, reward and fuel. When you are ready, ${tap()} "Take off".`,
        ),
      },
      {
        id: 'missions', ch: 'mission', speed: 4,
        enter: () => {
          g.layout.reveal('right');
          g.layout.unfold('missions');
        },
        target: () => visible('#right .rsec[data-sec="missions"]'),
        text: () => L(
          'Kolun kalkışa hazırlanıyor. Havadaki kolların burada: aşama ve yakıt. "Geri çağır" kolu üsse döndürür.',
          'Your flight is getting ready to take off. Your flights in the air are listed here, with their phase and fuel. "Recall" sends a flight home.',
        ),
      },
      {
        id: 'follow', ch: 'mission', speed: 4,
        enter: () => {
          g.renderer.rig.release();
          g.layout.reveal('right');
          g.layout.unfold('missions');
        },
        target: () => visible(`#missions .mrow[data-fl="${this.flightId}"] [data-mact="follow"]`) ?? visible('#missions [data-mact="follow"]'),
        done: () => g.renderer.rig.following,
        text: () => L(`"Takip"e ${tap()}: kamera uçağa kilitlenir.`, `${Tap()} "Follow": the camera locks onto the aircraft.`),
      },
      {
        id: 'info', ch: 'mission',
        enter: () => {
          g.layout.reveal('right');
          g.layout.unfold('info');
        },
        target: () => visible('#right .rsec[data-sec="info"]'),
        text: () => L(
          `Seçili uçağın hızı, irtifası, yakıtı, hasarı ve o anda ne yaptığı burada. Haritada bir uçağa ${tapBy()} da seçebilirsin.`,
          `Here are the selected aircraft's speed, altitude, fuel, damage and what it is doing right now. You can also select any aircraft by ${TOUCH ? 'tapping' : 'clicking'} it on the map.`,
        ),
      },
      // ---------------------------------------------------------- ülkeni büyüt
      {
        id: 'money', ch: 'grow',
        target: () => visible('#money-chip'),
        done: () => g.modals.openKind === 'market',
        text: () => L(
          `Hazinen. İnşaat, uçak ve araştırma para ister. Ayrıntısını görmek için hazineye ${tap()}.`,
          `Your treasury. Construction, aircraft and research cost money. ${Tap()} the treasury to see the details.`,
        ),
      },
      {
        id: 'treasury', ch: 'grow',
        enter: () => {
          if (g.modals.openKind !== 'market') g.modals.open('market');
        },
        target: () => visible('.modal-card.market .mk-sum'),
        text: () => L(
          'Gelir madenlerden, düşürülen düşman uçaklarından, yıkılan düşman yapılarından ve pazardaki satışlardan gelir. Bu pencerede hazine, son dakikanın geliri, her madenin damarı, üretimi ve sağlamlığı, altta da pazardaki uçak teklifleri var.',
          'Income comes from mines, enemy aircraft shot down, enemy buildings destroyed and market sales. This window shows the treasury, last minute\'s income, each mine\'s vein, output and condition, and below that the aircraft offers on the market.',
        ),
      },
      {
        id: 'mineMap', ch: 'grow', deep: true,
        enter: () => this.flyToOwn('mine', 900),
        target: () => {
          const m = this.own('mine');
          return m ? this.worldRect(m.pos, 75) : null;
        },
        done: () => !this.own('mine') || g.selectedStructureId === this.own('mine')?.id,
        text: () => this.own('mine')
          ? L(`Hazineye haritadan da girilir. Bu senin maden ocağın: üstüne ${tap()}.`, `You can reach the treasury from the map too. This is your mine: ${tap()} it.`)
          : L('Hiç maden ocağın kalmamış: İnşa → Ekonomi\'den yenisini kur.', 'You have no mine left: build one from Build → Economy.'),
      },
      {
        id: 'minePanel', ch: 'grow', deep: true,
        enter: () => g.layout.reveal('left'),
        target: () => visible('#left [data-act="market"]'),
        done: () => g.modals.openKind === 'market',
        text: () => L(
          `Sol panelde madenin damarı, üretimi, toplam kazancı ve geri ödeme süresi var. Buradaki "Hazine ve pazar ›"a ${tap()}: hazine açılır.`,
          `The left panel shows the mine's vein, output, total earnings and payback time. ${Tap()} "Treasury and market ›" here: the treasury opens.`,
        ),
      },
      {
        id: 'moneyEnd', ch: 'grow', deep: true,
        text: () => L(
          'Hazineye iki yoldan girersin: üst çubuktaki para ve maden ocağının paneli. Gelirin çoğu madenlerden gelir; yeni maden İnşa → Ekonomi\'de.',
          'There are two ways into the treasury: the money on the top bar and a mine\'s panel. Most income comes from mines; new mines are in Build → Economy.',
        ),
      },
      {
        id: 'build', ch: 'grow',
        enter: () => g.modals.close(),
        target: () => visible('.top-actions [data-open="build"]'),
        text: () => L(
          'İnşa: maden, ev, uçaksavar, radar ve yeni üs kur. Uçaklar ancak yeterli personelle kalkar; her ev 4 kişi barındırır.',
          'Build: mines, houses, flak, radar and new bases. Aircraft take off only with enough personnel; each house holds 4 people.',
        ),
      },
      {
        id: 'bOpen', ch: 'grow', deep: true,
        enter: () => {
          g.modals.close();
          g.build.close();
        },
        target: () => visible('.top-actions [data-open="build"]'),
        done: () => g.build.isOpen,
        text: () => L(`İnşa'ya ${tap()}.`, `${Tap()} Build.`),
      },
      {
        id: 'bCity', ch: 'grow', deep: true,
        target: () => visible('#buildbar [data-tab="city"]'),
        done: () => !!visible('#buildbar [data-tab="city"].active'),
        text: () => L(`Üç sekme var: askerî, şehir, ekonomi. "Şehir"e ${tap()}.`, `There are three tabs: military, city, economy. ${Tap()} "City".`),
      },
      {
        id: 'bHomes', ch: 'grow', deep: true,
        target: () => [...document.querySelectorAll('#buildbar .bcard[data-kind="house"], #buildbar .bcard[data-kind="apartment"]')],
        text: () => L(
          `Ev 4, apartman 16 kişi barındırır; her kişi bir pilot ya da mürettebat. Uçaklar ancak yeterli boşta personelle kalkar. Kartına ${tapThen()} haritada yer seç; üstteki satırda boştaki personel yazar.`,
          `A house holds 4 people, an apartment block 16; every person is a pilot or crew member. Aircraft take off only with enough free personnel. ${Tap()} a card, then pick a spot on the map; the line above shows your free personnel.`,
        ),
      },
      {
        id: 'prod', ch: 'grow',
        target: () => visible('.top-actions [data-open="production"]'),
        done: () => g.modals.openKind === 'factory',
        text: () => L(
          `Uçakları ve uçaksavar toplarını fabrikan üretir. "Üretim"e ${tap()}.`,
          `Your factory builds aircraft and anti-aircraft guns. ${Tap()} "Factory".`,
        ),
      },
      {
        id: 'prodRow', ch: 'grow',
        enter: () => g.modals.openFactory(null, 'ucak'),
        target: () => visible('.prd-row:not(.locked)'),
        text: () => L(
          `Her satırda serviste ve bantta kaç tane olduğu görünür. Adedi − ve + ile seç, "Üret"e ${tap()}; biten uçak üssüne gelir. Gri satırlar önce araştırma ister.`,
          `Each row shows how many are in service and on the line. Choose the number with − and +, then ${tap()} "Build"; finished aircraft go to your base. Grey rows need research first.`,
        ),
      },
      {
        id: 'prodQty', ch: 'grow', deep: true,
        enter: () => {
          if (g.modals.openKind !== 'factory') g.modals.openFactory(null, 'ucak');
        },
        target: () => visible('.prd-row.ac:not(.locked) [data-act="fab-qty"][data-d="1"]'),
        done: () => Number(visible('.prd-row.ac:not(.locked) .prd-qty b')?.textContent ?? 1) > 1,
        text: () => L(`Toplu üretim: "+"ya ${tap()}, adet artar; düğmedeki fiyat da o kadar olur.`, `Batch production: ${tap()} "+" to raise the number; the price on the button grows with it.`),
      },
      {
        id: 'prodBuild', ch: 'grow', deep: true,
        target: () => visible('.prd-row.ac:not(.locked) [data-act="fab-add"]'),
        text: () => L(
          'Üret düğmesinde toplam fiyat yazar. Para ya da bant yeri yetmezse düğme kararır. Bantta bekleyen siparişi ✕ ile iptal edersin, parası geri döner.',
          'The Build button shows the total price. If money or line space runs short, it greys out. Cancel a queued order with ✕ and get the money back.',
        ),
      },
      {
        id: 'prodRepeat', ch: 'grow', deep: true,
        target: () => visible('.modal-card [data-act="fab-repeat"]')?.closest('label') ?? null,
        text: () => L(
          '"Bitince tekrarla" açıkken biten uçağın yerine aynısı kendiliğinden sipariş edilir; para bitince durur.',
          'With "Repeat when done" on, a finished aircraft is reordered automatically; it stops when the money runs out.',
        ),
      },
      {
        id: 'prodGuns', ch: 'grow',
        enter: () => {
          if (g.modals.openKind !== 'factory') g.modals.openFactory(null, 'ucak');
        },
        target: () => visible('[data-act="fab-tab"][data-v="top"]'),
        done: () => !!visible('[data-rowkey="gun-mg"]'),
        text: () => L(
          `Uçaksavar topları da burada: "Hava savunma"ya ${tap()}.`,
          `Anti-aircraft guns are here too: ${tap()} "Air defence".`,
        ),
      },
      {
        id: 'prodStock', ch: 'grow',
        enter: () => g.modals.openFactory(null, 'top'),
        target: () => visible('[data-rowkey="gun-mg"]'),
        text: () => L(
          `Biten top depoya girer. Bataryayı İnşa'dan kurarsın: 2 yuva ve 12,7 mm M2 ile başlar. Bataryaya ${tapThen()} bir yuva seç, depodaki topu tak. Yükseltince yuva 4'e çıkar.`,
          `A finished gun goes into stock. You build batteries from Build: they start with 2 gun pits and 12.7 mm M2s. ${Tap()} a battery, pick a pit and fit a gun from stock. Upgrading gives up to 4 pits.`,
        ),
      },
      {
        id: 'facMap', ch: 'grow', deep: true,
        enter: () => this.flyToOwn('factory', 1500),
        target: () => {
          const f = this.own('factory');
          return f ? this.worldRect(f.pos, 160) : null;
        },
        done: () => !this.own('factory') || g.selectedStructureId === this.own('factory')?.id,
        text: () => this.own('factory')
          ? L(`Fabrikaya haritadan da girilir. Bu senin uçak fabrikan: üstüne ${tap()}.`, `You can reach the factory from the map too. This is your aircraft factory: ${tap()} it.`)
          : L('Fabrikan yıkılmış: İnşa → Askerî\'den yenisini kur.', 'Your factory is destroyed: build a new one from Build → Military.'),
      },
      {
        id: 'facPanel', ch: 'grow', deep: true,
        enter: () => g.layout.reveal('left'),
        target: () => visible('#left [data-act="fac-open"]'),
        done: () => g.modals.openKind === 'factory',
        text: () => L(`Panelde bandın durumu ve fabrikanın topları var. Üretim penceresini buradan da açarsın: ${tap()}.`, `The panel shows the line and the factory's own guns. You can open the production window from here too: ${tap()} it.`),
      },
      {
        id: 'aaMap', ch: 'grow', deep: true,
        enter: () => this.flyToOwn('aa', 700),
        target: () => {
          const a = this.own('aa');
          return a ? this.worldRect(a.pos, 45) : null;
        },
        done: () => !this.own('aa') || g.selectedStructureId === this.own('aa')?.id,
        text: () => this.own('aa')
          ? L(`Bu senin uçaksavar bataryan: üstüne ${tap()}.`, `This is your anti-aircraft battery: ${tap()} it.`)
          : L('Henüz bataryan yok. İnşa → Askerî\'den kurulur; bir sonraki adımda panelini anlatıyoruz.', 'You have no battery yet. Build one from Build → Military; the next step explains its panel.'),
      },
      {
        id: 'aaPanel', ch: 'grow', deep: true,
        enter: () => {
          if (this.own('aa')) g.layout.reveal('left');
        },
        target: () => (this.own('aa') ? visible('#left .gun-pit') : null),
        text: () => (this.own('aa') ? '' : L('Bataryayı kurunca: ', 'Once you build one: ')) + L(
          'her satır bir top yuvası. Yuvaya dokununca depodaki topları görür, birini takarsın; takılması biraz sürer. Bataryayı yükseltince yuva 4\'e çıkar, nişan aletleri eklenir.',
          'each row is a gun pit. Tap a pit to see the guns in stock and fit one; fitting takes a moment. Upgrading the battery gives up to 4 pits and adds fire-control gear.',
        ),
      },
      {
        id: 'research', ch: 'grow',
        enter: () => g.modals.close(),
        target: () => visible('.top-actions [data-open="research"]'),
        done: () => g.modals.openKind === 'research',
        text: () => L(
          `Araştırma yeni uçaklar, daha iyi motorlar, silahlar ve toplar açar. "Araştırma"ya ${tap()}.`,
          `Research unlocks new aircraft, better engines, weapons and guns. ${Tap()} "Research".`,
        ),
      },
      {
        id: 'researchLines', ch: 'grow',
        enter: () => {
          if (g.modals.openKind !== 'research') g.modals.open('research', 'arac');
        },
        target: () => [...document.querySelectorAll('.rtabs button')],
        text: () => L(
          `Üç hat aynı anda ilerler: uçak programları, mühendislik ve hava savunma. Bir karta ${tapThen()} sağdaki dosyadan başlat. Yeşil kart bitmiş, parlak kart başlatılabilir, gri kart önce önkoşul ister.`,
          `Three lines progress at the same time: aircraft programmes, engineering and air defence. ${Tap()} a card and start it from the dossier on the right. Green cards are done, bright ones can start, grey ones need prerequisites first.`,
        ),
      },
      {
        id: 'rTab', ch: 'grow', deep: true,
        enter: () => {
          if (g.modals.openKind !== 'research') g.modals.open('research', 'arac');
        },
        target: () => visible('.rtabs [data-tab="mod"]'),
        done: () => !!visible('.rtabs [data-tab="mod"].active'),
        text: () => L(`"Mühendislik"e ${tap()}: motor, gövde ve silah geliştirmeleri.`, `${Tap()} "Engineering": engine, airframe and gun upgrades.`),
      },
      {
        id: 'rCard', ch: 'grow', deep: true,
        // Pencere açılınca bir program zaten seçili: başka bir karta dokununca ilerle
        enter: () => {
          this.selAt = (g.modals as unknown as { sel: string | null }).sel;
        },
        target: () => visible('.modal-card.research [data-act="rsel"]:not(.ds-req):not(.sel)'),
        done: () => (g.modals as unknown as { sel: string | null }).sel !== this.selAt,
        text: () => L(`Bir karta ${tap()}: dosyası açılır.`, `${Tap()} a card: its dossier opens.`),
      },
      {
        id: 'rDossier', ch: 'grow', deep: true,
        target: () => visible('.modal-card.research [data-act="tech"]') ?? visible('.modal-card.research .ds-stamp'),
        text: () => L(
          'Dosyada etkisi, süresi, bedeli ve önkoşulları var. "Araştır" başlatır; önkoşulu eksikse önkoşullarıyla birlikte sıraya alır. Bedel başlarken ödenir, durdurursan kalanın %80\'i geri döner.',
          'The dossier shows the effect, time, cost and prerequisites. "Research" starts it; if prerequisites are missing it queues them too. The cost is paid at the start; stop it and 80% of the rest comes back.',
        ),
      },
      {
        id: 'rChip', ch: 'grow', deep: true,
        enter: () => g.modals.close(),
        // Telefonda gösterge gizli: araştırma düğmesi gösterilir
        target: () => visible('#research-chip') ?? visible('.top-actions [data-open="research"]'),
        text: () => (visible('#research-chip')
          ? L(
            'Bu gösterge üç hattın durumunu hep gösterir: süren iş, kalan süre ya da "boşta". Dokununca araştırma açılır.',
            'This indicator always shows the three lines: the job under way, the time left or "idle". Tap it to open research.',
          )
          : L(
            'Süren araştırmaları Araştırma penceresinde görürsün; bir hat boşalınca olaylara yazılır.',
            'You can see research under way in the Research window; an idle line is noted in the events.',
          )),
      },
      {
        id: 'showroom', ch: 'grow',
        enter: () => g.modals.close(),
        target: () => visible('.top-actions [data-open="hangar"]'),
        text: () => L(
          'Hangar\'da uçakların ve uçaksavar toplarının gerçek verileri ve dönen modelleri var. İstediğin zaman bak.',
          'The Hangar shows the real data and rotating models of every aircraft and anti-aircraft gun. Look in whenever you like.',
        ),
      },
      // ---------------------------------------------------------- savaş
      {
        id: 'enemy', ch: 'war',
        enter: () => {
          // "Sonraki bölüm" pencere açıkken de gelebilir
          g.modals.close();
          g.planner.close();
          g.selectAircraft(null);
          g.selectStructure(null);
          g.layout.reveal('left');
        },
        // Başlık + liste (uzun listede başlık görünür kalsın diye ilk öğe başlık)
        target: () => {
          const list = visible('#left .enemy-list');
          return list?.previousElementSibling ? [list.previousElementSibling, list] : visible('#left');
        },
        text: () => L(
          `Bilinen düşman hedeflerin burada. Birine ${tapThen()} "Bu hedefe saldırı planla" de. Üs panelindeki "Alarm kolu", düşman yaklaşınca avcılarını kendiliğinden kaldırır.`,
          `Your known enemy targets are listed here. ${Tap()} one and choose "Plan a strike on this target". The "Alert flight" in the base panel scrambles your fighters automatically when enemies approach.`,
        ),
      },
      {
        id: 'enemyTap', ch: 'war', deep: true,
        enter: () => g.layout.reveal('left'),
        target: () => visible('#left .enemy-list .row-btn'),
        done: () => !visible('#left .enemy-list .row-btn') || g.world.structureById(g.selectedStructureId ?? -1)?.team !== undefined && g.world.structureById(g.selectedStructureId ?? -1)?.team !== g.playerTeam,
        text: () => visible('#left .enemy-list .row-btn')
          ? L(`Listeden bir hedefe ${tap()}: kamera ona gider.`, `${Tap()} a target in the list: the camera flies to it.`)
          : L('Henüz bilinen düşman hedefi yok: radar kurup ya da keşif uçuşuyla bulursun.', 'No enemy target known yet: find them with radar or a reconnaissance flight.'),
      },
      {
        id: 'enemyInfo', ch: 'war', deep: true,
        target: () => (g.world.structureById(g.selectedStructureId ?? -1)?.team !== g.playerTeam ? visible('#left') : null),
        text: () => L(
          'Düşman yapısının sağlamlığı burada. Vurmak için üssünü seç, görev planında taarruz, pike ya da yatay bombardıman seç ve hedef olarak bunu göster. Yıkılan düşman yapısı ganimet getirir.',
          'The enemy structure\'s condition is shown here. To hit it, select your base, choose ground attack, dive or level bombing in the mission plan and point it at this target. A destroyed enemy structure brings loot.',
        ),
      },
      {
        id: 'end', ch: 'war',
        text: () => L(
          'Hava üssü kalmayan ülkenin yenisini kurmak için 5 dakikası var; kuramazsa elenir. Son kalan kazanır. Menü\'den kaydedebilirsin. İyi uçuşlar Komutan!',
          'A nation that loses all its airbases has 5 minutes to build a new one, or it is eliminated. The last one standing wins. You can save from the Menu. Good hunting, Commander!',
        ),
      },
    ];
    return steps;
  }
}
