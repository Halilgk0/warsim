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

export class Tutorial {
  private readonly el: HTMLElement;
  private readonly hole: HTMLElement;
  private readonly blocks: HTMLElement[];
  private readonly bubble: HTMLElement;
  private readonly promptEl: HTMLElement;
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
    $('app').append(this.el, this.promptEl);
  }

  /** Öğretici ya da soru penceresi açık (ana menüde başlatma ve kısayollar beklesin). */
  get busy(): boolean {
    return this.active || !this.promptEl.classList.contains('hidden');
  }

  /** Oyun kısayolları kapalı (görünürken). */
  get capturesKeys(): boolean {
    return this.active && !this.el.classList.contains('hidden');
  }

  // ------------------------------------------------------------------ başlarken sorma

  /** "Oyuna başla": sorulacaksa pencere açılır (true), sorulmayacaksa false (oyun hemen başlar). */
  ask(): boolean {
    if (tutorialPromptOff()) return false;
    this.promptEl.innerHTML = `<div class="tut-card" role="dialog" aria-modal="true">
      <h2>${L('Öğretici', 'Tutorial')}</h2>
      <p>${L(
        'Oyunda yeni misin? Kısa bir öğretici, ilk görevini birlikte planlayarak temel şeyleri adım adım gösterir (yaklaşık 5 dakika; istediğin bölümü atlayabilirsin).',
        'New to the game? A short tutorial shows you the basics step by step while you plan your first mission (about 5 minutes; you can skip any part).',
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
      this.stop();
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
      const btn = st.button?.() ?? (last ? L('Bitir', 'Finish') : L('Devam et', 'Continue'));
      this.bubble.innerHTML = `
        <div class="tut-head"><b>${CH_NAME[st.ch]}</b><span>${L('Bölüm', 'Part')} ${ci + 1}/${nch} · ${k}/${inCh.length}</span></div>
        <p>${text}</p>
        <div class="tut-foot">
          ${action ? '' : `<button class="primary" data-tut="next">${btn}</button>`}
          ${lastCh ? '' : `<button data-tut="chapter">${L('Sonraki bölüm ›', 'Next part ›')}</button>`}
          <span class="sp"></span>
          ${action ? `<button class="link" data-tut="skip">${L('Adımı geç', 'Skip step')}</button>` : ''}
          ${last ? '' : `<button class="link" data-tut="end">${L('Öğreticiyi bitir', 'End tutorial')}</button>`}
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
          'Harita ve büyüklüğü: küçük haritada üsler birbirine yakın, savaş çabuk başlar; büyük haritada uçuşlar uzun sürer. İstersen burada değiştir.',
          'Map and size: on a small map the bases are close together and the fighting starts quickly; on a large map flights take longer. Change them here if you like.',
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
          'Savaş gerçek zamanlı akar. Buradan duraklatır ya da 32 katına kadar hızlandırırsın. Sen okurken öğretici zamanı durdurur.',
          'The war runs in real time. Pause it or speed it up to 32× here. While you read, the tutorial stops the clock.',
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
        text: () => L(
          'Hazinen. İnşaat, uçak ve araştırma para ister. Gelir madenlerden, düşürülen düşman uçaklarından ve yıkılan düşman yapılarından gelir.',
          'Your treasury. Construction, aircraft and research cost money. Income comes from mines, enemy aircraft shot down and enemy buildings destroyed.',
        ),
      },
      {
        id: 'build', ch: 'grow',
        target: () => visible('.top-actions [data-open="build"]'),
        text: () => L(
          'İnşa: maden, ev, uçaksavar, radar ve yeni üs kur. Uçaklar ancak yeterli personelle kalkar; her ev 4 kişi barındırır.',
          'Build: mines, houses, flak, radar and new bases. Aircraft take off only with enough personnel; each house holds 4 people.',
        ),
      },
      {
        id: 'research', ch: 'grow',
        target: () => visible('.top-actions [data-open="research"]'),
        text: () => L(
          `Fabrikan yeni uçak üretir; ona ${tapThen()} sıraya uçak ekle. Araştırma daha iyi motorlar, silahlar ve yeni uçaklar açar.`,
          `Your factory builds new aircraft; ${tap()} it to queue some. Research unlocks better engines, weapons and new aircraft.`,
        ),
      },
      // ---------------------------------------------------------- savaş
      {
        id: 'enemy', ch: 'war',
        enter: () => {
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
