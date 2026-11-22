// Oyun denetleyicisi: dünya, render ve arayüzü bağlar; seçim ve etkileşim kiplerini yönetir.
// Kipler: ana menü (arkada yapay zekâ ülkelerinin oynadığı saydam harita) ve oyun. Kayıt: elle ve 5 dakikada bir.

import { World } from './sim/world';
import { SCENARIOS } from './sim/scenarios';
import type { Aircraft } from './sim/aircraft/aircraft';
import { STRUCTURE_DEFS, type Structure, type StructureKind } from './sim/structures/structure';
import { GRID, LOT_LINE, ROAD_MIN, lotAt, nearestRoad } from './sim/roads';
import type { GridFrame } from './render/roads';
import type { FlightGroup } from './sim/ai/flightGroup';
import { GameRenderer } from './render/gameRenderer';
import { Hud } from './ui/hud';
import { LeftPanel } from './ui/panels';
import { Planner } from './ui/planner';
import { Modals } from './ui/modals';
import { Hangar } from './ui/hangar';
import { BuildBar } from './ui/build';
import { Layout } from './ui/layout';
import { MAP_LAYERS, QUALITY, onSettingsChange, settings, type GraphicsQuality } from './ui/settings';
import { PerfWatch, silencePerfHint, type PerfHint } from './perfWatch';
import { aircraftNode } from './sim/tech';
import { groundLevel, mapKey, terrainMap } from './sim/terrain';
import { loadMapParallel } from './render/mapLoad';
import { mapById } from './sim/maps';
import { setupCampaign, type MaintGift } from './sim/campaign';
import { deserializeWorld, serializeWorld } from './sim/save';
import { type SaveKind, currentAccount, listSaves, readSave, refreshSession, saveSlotCount, savesCleanupBy, shouldAskEmail, syncPending, writeSave, markThanksShown, thanksShown } from './persist';
import { autoSlotFor } from './saveSlots';
import { rollStartSites } from './sim/startSites';
import type { SiteDef } from './sim/mapData';

/** Ana menünün gösterdiği başlangıç dizilişi: hangi harita (terrainMap.key) için atıldığıyla. */
export interface StartLayout { key: string; sites: SiteDef[] }
import { StatsTracker } from './net/stats';
import { THANKS_PLAY_SEC } from './ui/thanks';
import { MainMenu } from './ui/mainMenu';
import { PauseMenu } from './ui/pauseMenu';
import { EndScreen } from './ui/endScreen';
import { LoginBox } from './ui/loginBox';
import { ProfileBox } from './ui/profile';
import { NewsView } from './ui/news';
import { FeedbackBox } from './ui/feedback';
import { installKeyboardFit } from './ui/keyboard';
import { isFullscreen, onFullscreenChange } from './ui/fullscreen';
import { $, fmtTime } from './ui/dom';
import { sound } from './audio/sound';
import { BattleSound } from './audio/battle';
import { AlertSound } from './audio/alerts';
import { Vector3 } from 'three';
import { L, count } from './i18n';
import { SAVE_SLOTS_BASE } from './net/shared';
import { overText } from './ui/savesList';
import { SupportBox } from './ui/support';
import { Tutorial } from './ui/tutorial';
import { MAP_BASE, MAP_SCALE } from './sim/mapData';
import { AutoFast } from './autoFast';

const STEP = 1 / 60;
/** En yüksek oyun hızı (düğmeler 1×, 2×, 4×). */
const MAX_SPEED = 4;
/** Otomatik kayıt aralığı (gerçek zaman, oyun akarken). */
const AUTOSAVE_SEC = 300;
/** Sekme arka plana geçince kayıt: son kayıttan bu kadar oyun saniyesi geçmişse. */
const HIDE_SAVE_MIN = 30;

export type Interaction =
  | { mode: 'none' }
  | { mode: 'pickTarget' }
  | { mode: 'pickWaypoint' }
  /** Avcıya hava hedefi verme: sıradaki dokunuş düşman uçağını seçer. */
  | { mode: 'pickAir'; acId: number }
  /** heading: oyuncunun R ile verdiği yön; face: kurulacak yön (yola dizilince yol belirler). px, pz: imlecin yerdeki yeri. */
  | { mode: 'build'; kind: StructureKind; heading: number; face: number; x: number; z: number; px: number; pz: number; ok: boolean; reason?: string; move?: number }
  /** Yol çizimi: önce başlangıç (mevcut yolun üstünde), sonra uç; kurulunca uçtan devam eder. ux, uz: ızgaranın doğrultusu. */
  | { mode: 'road'; start: { x: number; z: number; ux: number; uz: number } | null; x: number; z: number; ux: number; uz: number; px: number; pz: number; ok: boolean; reason?: string; cost: number; length: number; del?: boolean; hit?: number | null };

/** Yerleşim ızgarası açık mı (tarayıcıda saklanır). */
const GRID_KEY = 'warsim.grid';

/** Kısa, sabit kimlik özeti (FNV-1a, onaltılık). */
function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Tarayıcı geçmişinde geri tuşunun nöbetçi kaydındayız (`Game.bindBackButton`). */
function onSentinel(): boolean {
  return !!(history.state as { wsb?: number } | null)?.wsb;
}

export class Game {
  world = new World();
  readonly renderer: GameRenderer;
  readonly hud: Hud;
  readonly left: LeftPanel;
  readonly planner: Planner;
  readonly modals: Modals;
  readonly hangar = new Hangar();
  readonly build: BuildBar;
  readonly layout = new Layout();
  readonly login = new LoginBox();
  readonly profile = new ProfileBox((notice) => this.showMainMenu(notice), () => this.menu.scoresChanged(), () => this.support.open());
  /** Destekçi paketi penceresi (Google Play uygulamasında kapalı). */
  readonly support = new SupportBox(this);
  readonly news = new NewsView();
  readonly feedback = new FeedbackBox({
    login: () => this.login.open((a, created) => {
      if (this.mode === 'menu') this.menu.loggedIn(a, created);
      else if (this.pause.isOpen) this.pause.render();
    }),
    addEmail: () => this.login.askEmail(),
  });
  readonly menu: MainMenu;
  readonly pause: PauseMenu;
  /** Harekât sonu (zafer / yenilgi) ve son üs geri sayımı. */
  readonly end: EndScreen;
  /** Öğretici ("Oyuna başla"da sorulur; duraklatma menüsünden de açılır). */
  readonly tutorial: Tutorial;
  /** Boş yolda otomatik 2× (HUD'daki 1× düğmesi gösterir). */
  readonly autoFast = new AutoFast();
  /** Skor tablosu istatistikleri (hesap açıkken harekâtta). */
  readonly stats = new StatsTracker();
  /** Takılma algılama: uzun süre akıcı değilse grafik ayarlarını düşürmeyi önerir (perfWatch.ts). */
  private readonly perf = new PerfWatch();
  /** Otomatik 2× ilk kez devreye girince bir kez açıklanır. */
  private autoFastTold = false;
  /** Savaş sesleri (yakınlaştıkça) ve oyuncuya uyarılar. */
  private readonly battle = new BattleSound();
  private readonly alerts = new AlertSound();
  /** Kameranın takip ettiği uçak (motor seslerinde Doppler dinleyicisi). */
  private followId: number | null = null;
  /** "Üsse dön" kaç kez kullanıldı (öğretici adımı bunu bekler). */
  homeCount = 0;
  /** Ana menü ya da oyun. */
  mode: 'menu' | 'play' = 'menu';
  /** Son kayıt (gerçek zaman, oyun zamanı, tür). */
  lastSave: { real: number; gameTime: number; kind: SaveKind } | null = null;
  private autosaveClock = 0;
  /** Otomatik kayıt için yer olmadığı söylendi (yer açılınca sıfırlanır). */
  private autoNoSlotTold = false;
  /** Gösterilecek fazla kayıt uyarısı (silme tarihi, kayıt sayısı). */
  private cleanupDue: { by: number; count: number } | null = null;
  private toastTimer = 0;
  timeScale = 1;
  scenarioId = SCENARIOS[0].id;
  selectedAircraftId: number | null = null;
  selectedStructureId: number | null = null;
  interaction: Interaction = { mode: 'none' };
  private lastScale = 1;
  private acc = 0;
  /** Pencere açıkken seyrek çizim: bu kare çizilecek mi, çizilmeyen karelerin süresi (kamera sonraki çizimde yetişir). */
  private drawTurn = true;
  /** Teşekkür penceresi bekliyor (toplam süre): pencere ya da öğretici açıkken açılmaz. */
  private thanksDue = 0;
  private drawDebt = 0;
  private last = performance.now();
  private lastErrorLog = 0;
  /** withMap haritayı işçilerde yüklerken (döngü bekler). */
  private mapLoading = false;
  /** warmUp sahneyi hazırlayıp gölgelendiricileri derlerken (döngü bekler, yükleme ekranı açık). */
  private warming = false;
  /** Son işlenen karenin zamanı (kare sınırı). */
  private lastDraw = 0;
  private errorShown = false;

  constructor() {
    this.renderer = new GameRenderer(document.getElementById('viewport')!, document.getElementById('labels')!);
    this.renderer.rig.onClick = (x, y) => this.handleClick(x, y);
    this.renderer.rig.onDoubleClick = (x, y) => this.handleDoubleClick(x, y);
    this.renderer.rig.onRightClick = () => this.cancelStep();
    this.renderer.rig.onHover = (x, y) => this.handleHover(x, y);
    this.hud = new Hud(this);
    this.left = new LeftPanel(this);
    this.planner = new Planner(this);
    this.modals = new Modals(this);
    this.build = new BuildBar(this);
    this.menu = new MainMenu(this);
    this.pause = new PauseMenu(this);
    this.end = new EndScreen(this);
    this.tutorial = new Tutorial(this);
    this.stats.onTotal = (sec) => {
      if (sec >= THANKS_PLAY_SEC && !thanksShown()) this.thanksDue = sec;
    };
    onSettingsChange(() => this.renderer.invalidateCoverage());
    onFullscreenChange(() => {
      document.querySelector('.fs-btn')?.classList.toggle('active', isFullscreen());
      this.menu.render();
    });
    this.login.onClosed = () => {
      if (this.feedback.isOpen) this.feedback.refresh();
    };
    installKeyboardFit();
    this.bindKeys();
    this.bindBackButton();
    this.bindPageLifecycle();
    sound.install();
    this.showMainMenu();
    // Dil değişince sayfa yeniden açıldı: ana menüdeki öğretici kaldığı yerden sürer
    this.tutorial.resume();
    // Oturum hâlâ geçerli mi; bu cihazda bekleyen kayıtlar buluta
    void refreshSession().then(() => {
      if (this.mode === 'menu') this.menu.render();
      const acc = currentAccount();
      if (acc) {
        void syncPending(acc.key).catch(() => {});
        // İnternetsiz oynanan harekâtların skorları: bağlantı varsa şimdi gönderilir
        void this.stats.flushPending();
      }
      // E-postası olmayan eski hesaba her açılışta sorulur (adres bağlanana kadar; pencere kapatılabilir)
      if (shouldAskEmail() && this.mode === 'menu' && !this.login.isOpen) this.login.askEmail();
      void this.checkSaveCleanup();
    });
    // Bağlantı geri gelince: bekleyen kayıtlar ve skorlar gönderilir, açık menü yenilenir
    window.addEventListener('online', () => {
      const acc = currentAccount();
      if (!acc) return;
      void syncPending(acc.key).catch(() => {});
      void this.stats.flushPending();
      if (this.mode === 'menu') this.menu.render();
    });
    window.addEventListener('offline', () => {
      if (this.mode === 'menu') this.menu.render();
    });
    requestAnimationFrame(this.loop);
    this.warmUp();
  }

  /**
   * Yükleme ekranı açıkken sahneyi bir kez çizmeden hazırla ve gölgelendiricileri arka planda derle (GameRenderer.warm),
   * sonra ekranı kaldır. İlk kare derlemeyi beklemez: telefonda açılışta ve harekât başında saniyelerce donuyordu.
   */
  private warmUp(text?: string): void {
    const el = $('loading');
    if (text) el.querySelector('span')!.textContent = text;
    el.classList.remove('hidden');
    this.warming = true;
    void this.renderer.warm()
      .catch((e) => this.reportError(e))
      .finally(() => {
        this.warming = false;
        if (!this.mapLoading) el.classList.add('hidden');
      });
  }

  /**
   * Harita gerekiyorsa önce onu yükle, sonra devam et. Arazi ve örtüsü işçilerde paralel üretilir (render/mapLoad.ts);
   * bu sırada yükleme ekranı açık kalır, oyun döngüsü durur (eski dünya yarı yüklenmiş araziyi okumasın).
   */
  private withMap(mapId: string, size: number, then: () => void): void {
    if (terrainMap.key === mapKey(mapById(mapId).id, size)) {
      then();
      return;
    }
    const el = $('loading');
    const name = `${mapById(mapId).name} · ${size / 1000} km`;
    el.querySelector('span')!.textContent = L(`${name} hazırlanıyor…`, `Preparing ${name}…`);
    el.classList.remove('hidden');
    this.mapLoading = true;
    // Yükleme ekranı çizilsin diye iki kare bekle
    requestAnimationFrame(() => requestAnimationFrame(() => {
      void loadMapParallel(mapId, size)
        .then(() => {
          this.renderer.prepareMap();
          then();
        })
        .catch((e) => this.reportError(e))
        .finally(() => {
          this.mapLoading = false;
          // Ardından sahne hazırlanıyorsa (warmUp) ekran o bitince kalkar
          if (!this.warming) el.classList.add('hidden');
        });
    }));
  }

  // ------------------------------------------------------------------ kipler

  /** Ana menü: arkada yapay zekâ ülkelerinin oynadığı harita yavaşça döner. */
  showMainMenu(notice = ''): void {
    this.buildBackdrop();
    this.mode = 'menu';
    $('app').classList.add('menu-mode');
    this.pause.close(false);
    this.end.close(false);
    this.menu.open(notice);
  }

  /** Ana menünün arka planı: yüklü haritada yapay zekâ ülkeleri. */
  private buildBackdrop(): void {
    const w = new World();
    setupCampaign(w, { enemies: 3, playerName: '', demo: true });
    this.attachWorld(w, 'menu');
    // Haritanın tamamı görünür: üsler birkaç piksel, yalnız halkaları çizilir (ağır görünümleri kurulmaz)
    this.renderer.viewMinPx = 8;
    this.setTimeScale(2);
    const rig = this.renderer.rig;
    // Haritanın tamamı görünsün (küçük haritada kamera da yakın)
    rig.target.set(0, 0, 6000 * MAP_SCALE);
    rig.distance = 215000 * MAP_SCALE;
    rig.pitch = 0.98;
  }

  /** Ana menüde seçilen harita (ve büyüklüğü) arka plana gelir. */
  previewMap(mapId: string, size: number): void {
    if (this.mode !== 'menu') return;
    this.withMap(mapId, size, () => {
      this.buildBackdrop();
      // Harita yüklendi: menü önizlemesinde rastgele başlangıç yerleri atılabilir
      this.menu.refreshLayout();
      this.warmUp();
    });
  }

  /**
   * Yeni harekât: oyuncu + düşmanlar, herkes aynı varlıklarla başlar. Ana üsler rastgele yerlerde (ana menünün gösterdiği
   * diziliş; uymuyorsa yeniden atılır, bulunamazsa haritanın sabit yerleri).
   */
  newCampaign(playerName: string, enemies: number, mapId = terrainMap.id, size = terrainMap.size, layout?: StartLayout): void {
    this.withMap(mapId, size, () => {
      const w = new World();
      const sites = layout && layout.key === terrainMap.key && layout.sites.length === enemies + 1 ? layout.sites : rollStartSites(enemies + 1) ?? undefined;
      setupCampaign(w, { enemies, playerName, sites });
      w.campaignId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      this.enterPlay(w, 'kampanya');
      this.lastSave = null;
      this.focusHome();
      this.warmUp(L('Harekât hazırlanıyor…', 'Preparing the campaign…'));
    });
  }

  /** Kayıttan devam (kaydın haritası gerekiyorsa önce o yüklenir). */
  async loadSave(id: string): Promise<void> {
    try {
      const d = await readSave(id);
      if (d.v !== 2 || !d.mapId) throw new Error(L('bu kayıt eski bir harita sürümüne ait; yeni haritalarda açılamaz', 'this save belongs to an old map version and cannot be opened on the new maps'));
      // Büyüklüğü olmayan (önceki) kayıtlar 300 km
      await new Promise<void>((resolve, reject) => this.withMap(d.mapId, d.mapSize ?? MAP_BASE, () => {
        try {
          this.applySave(d);
          // Kimliksiz (eski) harekât kaydı: kimlik kayıttan türer, aynı kayıt yeniden yüklenince yine aynı
          if (d.scenarioId === 'kampanya' && !this.world.campaignId) this.world.campaignId = `legacy-${hashId(id)}`;
          resolve();
        } catch (e) {
          reject(e);
        }
      }));
    } catch (e) {
      this.toast(`${L('Kayıt yüklenemedi', 'Could not load the save')}: ${(e as Error).message}`, true);
    }
  }

  private applySave(d: Awaited<ReturnType<typeof readSave>>): void {
    const w = deserializeWorld(d);
    this.enterPlay(w, d.scenarioId);
    this.lastSave = { real: performance.now(), gameTime: w.time, kind: 'manual' };
    const cam = d.camera;
    const rig = this.renderer.rig;
    if (cam) {
      rig.target.set(cam.x, groundLevel(cam.x, cam.z), cam.z);
      rig.distance = cam.distance;
      rig.yaw = cam.yaw;
      rig.pitch = cam.pitch;
    } else this.focusHome();
    this.warmUp(L('Kayıt açılıyor…', 'Opening the save…'));
    this.toast(`${L('Kayıt yüklendi', 'Save loaded')} · ${mapById(d.mapId).name} · ${L('oyun', 'game')} ${fmtTime(w.playTime)}`);
    // Bakım personeli kuralından önceki kayıt: kural ve bedava konut bir kez söylenir (sonraki kayıtta maintRule var)
    const gift = w.maintGift;
    w.maintGift = null;
    if (gift) this.showMaintGift(gift);
  }

  private showMaintGift(g: MaintGift): void {
    const built = g.buildings > 0
      ? L(`Filon eskisi gibi uçabilsin diye kasabana <b>${g.buildings} konut (${g.people} kişi)</b> bedava kuruldu.`,
        `So your fleet can fly as before, <b>${count(g.buildings, 'home')} (${g.people} people)</b> were built in your town for free.`)
      : L('Konutun yetiyordu, ek bina gerekmedi.', 'Your housing was enough; no new buildings were needed.');
    const exempt = g.exempt > 0
      ? `<p>${L(`Kasabada yer kalmadığı için ${g.exempt} uçak bakımcısız uçmaya devam edecek.`, `There was no room left in town, so ${count(g.exempt, 'aircraft', 'aircraft')} keep flying without ground crew.`)}</p>`
      : '';
    this.modals.openNotice(
      L('Yeni kural: bakım personeli', 'New rule: ground crew'),
      `<p>${L(
        'Artık her uçak <b>1 bakım personeli</b> ister: üretimde ayrılır, uçak düşene ya da satılana dek onda kalır. Uçuş mürettebatı ayrıca gerekir.',
        'Every aircraft now needs <b>1 ground crew</b>: assigned when it is built, they stay with it until it is lost or sold. Its flight crew is needed on top.',
      )}</p><p>${built}</p>${exempt}`,
      [{ label: L('Devam et', 'Continue'), primary: true, run: () => {} }],
    );
  }

  exitToMenu(): void {
    // Skor bildirimi dakikada birdi: misafir oynayıp hesap açan, kaydedip bir dakika dolmadan menüye dönen oyuncunun hiç
    // bildirimi gitmiyordu (2026-11-13). Menüye dönerken hemen bildir
    if (this.mode === 'play' && currentAccount()) this.stats.flush(this.world, this.playerTeam);
    this.showMainMenu();
  }

  private enterPlay(w: World, scenarioId: string): void {
    this.attachWorld(w, scenarioId);
    this.renderer.viewMinPx = 3;
    this.mode = 'play';
    $('app').classList.remove('menu-mode');
    this.menu.close();
    this.pause.close(false);
    this.end.close(false);
    this.login.close();
    this.news.close();
    this.feedback.close();
    this.autosaveClock = 0;
    this.setTimeScale(1);
  }

  /** Dünyayı render ve arayüze bağla (seçimler ve açık pencereler sıfırlanır). */
  private attachWorld(w: World, scenarioId: string): void {
    this.scenarioId = scenarioId;
    this.world = w;
    this.perf.reset();
    this.battle.reset();
    this.renderer.setWorld(w);
    this.hangar.hasAircraft = (id) => !aircraftNode(id) || this.world.teams[this.playerTeam].research.hasAircraft(id);
    this.hangar.research = () => this.world.teams[this.playerTeam]?.research ?? null;
    this.planner.close();
    this.build.close();
    if (this.modals.isOpen) this.modals.close();
    if (this.hangar.isOpen) this.hangar.close();
    this.interaction = { mode: 'none' };
    this.selectAircraft(null);
    this.selectStructure(null);
    const rig = this.renderer.rig;
    rig.followFn = null;
    rig.stopFly();
    this.hud.onScenarioChanged();
    this.left.render(true);
    const sub = document.querySelector('.brand span');
    if (sub) sub.textContent = w.playerName ? `${L('Komutan', 'Commander')} ${w.playerName}` : '';
  }

  /** Kamera oyuncunun ana üssüne. */
  private focusHome(): void {
    const base = this.world.airbasesOf(this.playerTeam)[0];
    const rig = this.renderer.rig;
    rig.yaw = 0;
    rig.pitch = 58 * (Math.PI / 180);
    if (base) {
      rig.target.set(base.s.pos.x, base.s.pos.y, base.s.pos.z);
      rig.distance = 26000;
    } else {
      rig.target.set(0, 0, 0);
      rig.distance = 250000;
    }
  }

  /**
   * Üsse dön (üst çubuktaki ev düğmesi, G): kamera nerede olursa olsun ana üsse; takip bırakılır. Üs kalmadıysa oyuncunun
   * başka bir yapısına, hiç yapı yoksa söyler. Yön korunur (oyuncu haritada yönünü kaybetmesin), üs ekrana sığar.
   */
  goHome(): void {
    this.homeCount++;
    const rig = this.renderer.rig;
    if (rig.following) rig.release();
    const base = this.world.airbasesOf(this.playerTeam).find((b) => b.s.active) ?? this.world.airbasesOf(this.playerTeam)[0];
    const s = base?.s ?? this.world.structures.find((x) => x.team === this.playerTeam && !x.destroyed);
    if (!s) {
      this.toast(L('Üs ya da yapı kalmadı', 'No base or structure left'));
      return;
    }
    rig.target.set(s.pos.x, s.pos.y, s.pos.z);
    rig.distance = base ? 9000 : 4000;
    rig.pitch = 52 * (Math.PI / 180);
  }

  // ------------------------------------------------------------------ kayıt

  defaultSaveTitle(): string {
    const who = this.world.playerName || L('Senaryo', 'Scenario');
    return `${who} · ${fmtTime(this.world.playTime)}`;
  }

  /** Son kayıttan sonra oyun ilerledi mi. */
  unsavedProgress(): boolean {
    return !this.lastSave || this.world.time - this.lastSave.gameTime > 2;
  }

  /** Sıradaki otomatik kayda kalan (gerçek saniye). */
  autosaveLeft(): number {
    return AUTOSAVE_SEC - this.autosaveClock;
  }

  ago(real: number): string {
    const s = Math.max(0, (performance.now() - real) / 1000);
    if (s < 60) return L('az önce', 'just now');
    const m = Math.round(s / 60);
    return m < 60 ? L(`${m} dk önce`, `${m} min ago`) : L(`${Math.floor(m / 60)} sa ${m % 60} dk önce`, `${Math.floor(m / 60)} h ${m % 60} min ago`);
  }

  /**
   * Kayıt yerlerinden önceki fazla kayıtlar: sunucu silme tarihini verdiyse (savesCleanupBy) uyarı her girişte (oyun açılınca
   * ve hesaba girince) gösterilir, ana menüde başka pencere yokken.
   */
  async checkSaveCleanup(): Promise<void> {
    const acc = currentAccount();
    if (!acc) return;
    const list = await listSaves(acc.key).catch(() => null);
    if (!list || !savesCleanupBy()) return;
    this.cleanupDue = { by: savesCleanupBy()!, count: list.length };
  }

  private showCleanup(): void {
    const c = this.cleanupDue!;
    this.cleanupDue = null;
    const n = saveSlotCount();
    if (c.count <= n) return;
    const k = c.count - n;
    this.modals.openNotice(
      k === 1 ? L('Bir kaydını sil', 'Delete one save') : L(`${k} kaydını sil`, `Delete ${k} saves`),
      // Temel yer sayısı 4'ten 3'e indi (2026-11-21): eski hesaplara nedeni de söylenir
      `${n === SAVE_SLOTS_BASE ? `<p>${L(`Kayıt yeri sayısı <b>${SAVE_SLOTS_BASE}</b>'e indi.`, `The number of save slots is now <b>${SAVE_SLOTS_BASE}</b>.`)}</p>` : ''}
      <p>${overText(n, c.count, c.by)}</p>`,
      [
        { label: L('Kayıtları aç', 'Open saves'), primary: true, run: () => this.menu.openSaves() },
        { label: L('Sonra', 'Later'), run: () => {} },
      ],
    );
  }

  /**
   * Hesaba kaydet (giriş yoksa false). Elle kayıtta yer verilir; otomatikte yer kayıt listesinden seçilir (saveSlots.ts
   * autoSlotFor). Otomatik kayıt için boş yer yoksa kaydedilmez, oyuncuya bir kez söylenir.
   */
  async saveNow(kind: SaveKind, title?: string, slot?: number): Promise<boolean> {
    const acc = currentAccount();
    if (!acc || this.mode !== 'play') return false;
    try {
      if (kind === 'auto') {
        const s = autoSlotFor(await listSaves(acc.key), this.world.playerName, saveSlotCount());
        if (s === null) {
          if (!this.autoNoSlotTold) this.toast(L('Otomatik kayıt alınamadı: boş kayıt yeri yok. Menü → Kayıtlar\'dan birini silebilirsin.', 'Could not autosave: no free save slot. You can delete one in Menu → Saves.'), true);
          this.autoNoSlotTold = true;
          this.autosaveClock = 0;
          return false;
        }
        slot = s;
        this.autoNoSlotTold = false;
      }
      if (slot === undefined) return false;
      const d = serializeWorld(this.world, this.scenarioId);
      const rig = this.renderer.rig;
      d.camera = { x: rig.target.x, z: rig.target.z, distance: rig.distance, yaw: rig.yaw, pitch: rig.pitch };
      const { cloud } = await writeSave(acc.key, title ?? this.defaultSaveTitle(), kind, d, slot);
      this.lastSave = { real: performance.now(), gameTime: this.world.time, kind };
      this.autosaveClock = 0;
      // Kayıtla birlikte skor da bildirilir (misafirken oynanıp hesap açılınca alınan ilk kayıt dahil)
      this.stats.flush(this.world, this.playerTeam);
      if (!cloud) this.toast(L('Bu cihaza kaydedildi; bağlantı gelince buluta yüklenecek', 'Saved on this device; it will upload when you are online'));
      else this.toast(kind === 'auto' ? L('Otomatik kayıt alındı', 'Autosaved') : L('Oyun kaydedildi', 'Game saved'));
      return true;
    } catch (e) {
      this.toast(`${L('Kayıt başarısız', 'Save failed')}: ${(e as Error).message}`, true);
      return false;
    }
  }

  /** Oyuncunun kollarının evresi: dönüşe geçen kol kısa bildirimle söylenir (neden panelde de yazar; 2026-11-21 oyuncu bildirimi). */
  private flightPhases = new Map<number, string>();
  private flightWatchAt = 0;

  private watchFlights(): void {
    const now = performance.now();
    if (now < this.flightWatchAt) return;
    this.flightWatchAt = now + 500;
    const seen = new Set<number>();
    for (const f of this.world.flights) {
      if (f.team !== this.playerTeam) continue;
      seen.add(f.id);
      const prev = this.flightPhases.get(f.id);
      if (prev !== undefined && prev !== f.phase && f.phase === 'egress') {
        const why = f.rtbReason ? `: ${f.rtbReason}` : '';
        this.toast(L(`${f.name} kolu üsse dönüyor${why}`, `${f.name} flight is returning to base${why}`));
      }
      this.flightPhases.set(f.id, f.phase);
    }
    for (const id of this.flightPhases.keys()) if (!seen.has(id)) this.flightPhases.delete(id);
  }

  toast(text: string, bad = false): void {
    const el = $('toast');
    el.textContent = text;
    el.classList.toggle('bad', bad);
    el.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.add('hidden'), bad ? 5000 : 2600);
  }

  get playerTeam(): number {
    return this.world.playerTeam;
  }

  get selectedAircraft(): Aircraft | null {
    return this.selectedAircraftId !== null ? this.world.aircraftById(this.selectedAircraftId) ?? null : null;
  }

  get selectedStructure(): Structure | null {
    return this.selectedStructureId !== null ? this.world.structureById(this.selectedStructureId) ?? null : null;
  }

  /**
   * Hazır senaryo: it dalaşı, saldırı denemeleri, 1 düşmanlı harekât. Oyuncu arayüzünde yok (kafa karıştırıyordu, 2026-11-05);
   * test betikleri, video kayıt kipi ve ölçüm araçları koddan çağırır (konsoldan da: game.loadScenario('b17_raid')).
   */
  loadScenario(id: string): void {
    const sc = SCENARIOS.find((s) => s.id === id);
    if (!sc) return;
    // Hazır senaryolar Anakara'da kurulu
    this.withMap('anakara', MAP_BASE, () => {
      const w = new World();
      sc.build(w);
      this.enterPlay(w, id);
      this.lastSave = null;
      const rig = this.renderer.rig;
      // Kamera: oyuncunun uçakları varsa onların üstüne, yoksa ana üsse
      const mine = this.world.aircraft.filter((a) => a.team === this.playerTeam);
      if (mine.length && sc.group !== 'harekat') {
        const c = mine.reduce((s, a) => ({ x: s.x + a.pos.x / mine.length, z: s.z + a.pos.z / mine.length }), { x: 0, z: 0 });
        rig.target.set(c.x, 0, c.z);
        rig.distance = 9000;
      } else this.focusHome();
    });
  }

  selectAircraft(id: number | null): void {
    this.selectedAircraftId = id;
    this.renderer.selectedAircraftId = id;
    const ac = id !== null ? this.world.aircraftById(id) : undefined;
    this.renderer.routeFlightId = ac?.flight?.id ?? null;
    if (id !== null) this.selectStructure(null, false);
    if (this.renderer.rig.following && id !== null) this.follow(id);
    // Telefonda seçim bilgisi sağ panelde: kapalıysa açılır
    if (id !== null) this.layout.reveal('right');
  }

  selectStructure(id: number | null, render = true): void {
    this.selectedStructureId = id;
    this.renderer.selectedStructureId = id;
    if (id !== null) {
      this.selectedAircraftId = null;
      this.renderer.selectedAircraftId = null;
      this.renderer.routeFlightId = null;
      this.layout.reveal('left');
    }
    if (render) this.left.render(true);
  }

  selectFlight(fl: FlightGroup): void {
    const lead = fl.leader() ?? fl.alive[0];
    if (lead) this.selectAircraft(lead.id);
    this.renderer.routeFlightId = fl.id;
    if (lead) {
      const rig = this.renderer.rig;
      rig.flyTo(new Vector3(lead.pos.x, groundLevel(lead.pos.x, lead.pos.z), lead.pos.z), rig.distance > 16000 ? 6000 : rig.distance);
    }
  }

  focusStructure(s: Structure): void {
    this.selectStructure(s.id);
    this.renderer.rig.flyTo(s.pos, this.focusDistance(s));
  }

  /** Yapıya bakış uzaklığı (türüne göre yakın plan). */
  private focusDistance(s: Structure): number {
    return s.kind === 'airbase' ? 4200 : s.kind === 'factory' ? 1900 : s.def.category === 'city' ? 650 : 1000;
  }

  /** Çift tık: kendi yapımıza kamera uçar; uçağa çift tık onu takip eder. */
  private handleDoubleClick(x: number, y: number): void {
    if (this.interaction.mode !== 'none') return;
    const hit = this.renderer.pick(x, y);
    if (hit?.kind === 'structure') {
      this.selectStructure(hit.s.id);
      this.renderer.rig.flyTo(hit.s.pos, this.focusDistance(hit.s));
    } else if (hit?.kind === 'aircraft') {
      this.selectAircraft(hit.ac.id);
      this.follow(hit.ac.id);
    }
  }

  follow(id: number): void {
    this.followId = id;
    const rig = this.renderer.rig;
    rig.followFn = () => {
      const a = this.world.aircraftById(id);
      return a && a.status !== 'dead' ? this.renderer.viewPos(a) : null;
    };
    if (rig.distance > 8000) rig.distance = 1200;
  }

  /** Kolu üsse geri çağır. */
  recallFlight(fl: FlightGroup): void {
    fl.rtbReason = L('komuta emri', 'ordered back');
    fl.stats.recalled = true;
    if (fl.phase === 'enroute' || fl.phase === 'action' || fl.phase === 'formup') fl.setPhase('egress', this.world, L('komuta emri', 'ordered back'));
    else if (fl.phase === 'egress') fl.setPhase('rtb', this.world);
  }

  /** Avcı kendi kolunda emir alabilir mi: havada, silahlı, kopmamış, kolu görevde. */
  canOrder(ac: Aircraft): boolean {
    const fl = ac.flight;
    return ac.team === this.playerTeam && ac.spec.role === 'fighter' && ac.status === 'flying' && ac.airborne && ac.armed &&
      !ac.brain.detached && !!fl && (fl.phase === 'formup' || fl.phase === 'enroute' || fl.phase === 'action');
  }

  /** Hedef verme: oyuncu sıradaki dokunuşla düşman uçağını seçer. */
  beginAirOrder(acId: number): void {
    this.planner.close();
    this.interaction = { mode: 'pickAir', acId };
  }

  /** Avcıya hava hedefi ver (kol o avcıya bu hedefi atar; hedef düşünce kol yeniden seçer). */
  orderTarget(ac: Aircraft, e: Aircraft): void {
    ac.brain.order = e.id;
    const msg = L(`${ac.callsign}: emir alındı, ${e.callsign} (${e.spec.abbr}) hedefine yöneliyor`, `${ac.callsign}: order received, going after ${e.callsign} (${e.spec.abbr})`);
    this.world.log(msg, ac.team, 'combat');
    this.toast(msg);
  }

  clearOrder(ac: Aircraft): void {
    if (ac.brain.order === null) return;
    ac.brain.order = null;
    this.world.log(L(`${ac.callsign}: emir kaldırıldı, hedefini kol seçecek`, `${ac.callsign}: order cancelled, the flight picks targets again`), ac.team, 'combat');
  }

  toggleFollow(): void {
    const rig = this.renderer.rig;
    if (rig.following) rig.release();
    else if (this.selectedAircraftId !== null) this.follow(this.selectedAircraftId);
  }

  /** Oyun hızı: duraklat, 1×, 2×, 4×. Üstü yok (2026-11-10 kararı: hızlandırma en çok 4×). */
  setTimeScale(n: number): void {
    n = Math.min(n, MAX_SPEED);
    this.timeScale = n;
    if (n > 0) this.lastScale = n;
  }

  togglePause(): void {
    this.setTimeScale(this.timeScale === 0 ? this.lastScale : 0);
  }

  /** İptal düğmesi, Esc, sağ tık: yol çiziminde önce başlangıç noktasını bırakır, sonra kipten çıkar. */
  cancelStep(): void {
    const it = this.interaction;
    if (it.mode === 'road' && it.start) {
      it.start = null;
      this.refreshBuild();
      return;
    }
    this.cancelInteraction();
  }

  /** Yerleşim ızgarası: açıkken yapı ızgarada gezer (şehir yapıları yola dizilir), kapalıyken serbest. */
  buildGrid = ((): boolean => {
    try {
      return localStorage.getItem(GRID_KEY) !== '0';
    } catch {
      return true;
    }
  })();

  toggleGrid(): void {
    this.buildGrid = !this.buildGrid;
    try {
      localStorage.setItem(GRID_KEY, this.buildGrid ? '1' : '0');
    } catch { /* gizli pencere: yalnız bu oturum */ }
    this.refreshBuild();
  }

  cancelInteraction(): void {
    const mode = this.interaction.mode;
    if (mode === 'build' || mode === 'road') this.build.close();
    this.interaction = { mode: 'none' };
    this.renderer.ghost = null;
    this.renderer.roadGhost = null;
    this.renderer.gridFrame = null;
    // Haritadan seçim bitince planlayıcının düğmeleri ("Ekleniyor… (Esc bitir)") eski hâlinde kalmasın
    if ((mode === 'pickTarget' || mode === 'pickWaypoint') && this.planner.isOpen) this.planner.refresh();
  }

  beginBuild(kind: StructureKind): void {
    this.planner.close();
    this.renderer.roadGhost = null;
    this.interaction = { mode: 'build', kind, heading: 0, face: 0, x: 0, z: 0, px: 0, pz: 0, ok: false };
  }

  /** Şehir binasını taşı ya da döndür: inşa kipi, ama yerleştirince bina yeni yerine geçer (bedel kuruluşun beşte biri). */
  beginMove(s: Structure): void {
    this.planner.close();
    this.renderer.roadGhost = null;
    this.interaction = { mode: 'build', kind: s.kind, heading: s.heading, face: s.heading, x: s.pos.x, z: s.pos.z, px: s.pos.x, pz: s.pos.z, ok: false, move: s.id };
    this.refreshBuild();
  }

  /** Yol çizimine başla (İnşa → Şehir → Yol); del: yol kaldırma kipi (İnşa → Şehir → Yol kaldır). */
  beginRoad(del = false): void {
    this.planner.close();
    this.renderer.ghost = null;
    this.interaction = { mode: 'road', start: null, x: 0, z: 0, ux: 1, uz: 0, px: 0, pz: 0, ok: false, cost: 0, length: 0, del, hit: null };
  }

  private handleHover(x: number, y: number): void {
    const it = this.interaction;
    if (it.mode !== 'build' && it.mode !== 'road') return;
    const p = this.renderer.groundPoint(x, y);
    if (!p) return;
    it.px = p.x;
    it.pz = p.z;
    this.refreshBuild();
  }

  /**
   * Yerleşimi imlecin yerine göre yeniden değerlendir. Izgara açıkken yapı ızgara noktalarına oturur; şehir yapıları
   * kendi yolunun yakınındaysa yolun kenarındaki arsaya dizilir ve ön cephesiyle yola döner (ızgara da yolun
   * doğrultusuna döner). Izgara kapalıyken yapı imlecin durduğu yerde, oyuncunun verdiği yönle kalır.
   */
  private refreshBuild(): void {
    const it = this.interaction;
    if (it.mode === 'road') {
      this.refreshRoad();
      return;
    }
    if (it.mode !== 'build') return;
    const def = STRUCTURE_DEFS[it.kind];
    let x = it.px;
    let z = it.pz;
    let face = it.heading;
    let frame: GridFrame | null = null;
    if (this.buildGrid) {
      const radius = Math.min(260, Math.max(120, Math.max(def.halfW, def.halfL) + 90));
      const road = def.category === 'city' && it.kind !== 'townhall'
        ? nearestRoad(this.world.roads, this.playerTeam, x, z, LOT_LINE + 2 * Math.max(def.halfW, def.halfL) + 20) : null;
      if (road) {
        const lot = lotAt(road, Math.min(road.len, Math.round(road.s / GRID) * GRID), road.side, def.halfL);
        x = lot.x;
        z = lot.z;
        face = lot.heading;
        // Arsa çizgisi (LOT_LINE) ızgara çizgisine denk gelsin: başlangıç yarım hücre yana
        frame = { x, z, ox: road.road.ax - road.dz * (GRID / 2), oz: road.road.az + road.dx * (GRID / 2), ux: road.dx, uz: road.dz, radius };
      } else {
        x = Math.round(x / GRID) * GRID;
        z = Math.round(z / GRID) * GRID;
        frame = { x, z, ox: 0, oz: 0, ux: 1, uz: 0, radius };
      }
    }
    it.x = x;
    it.z = z;
    it.face = face;
    const moving = it.move !== undefined ? this.world.structureById(it.move) : undefined;
    const chk = moving ? this.world.checkMove(moving, x, z, face) : this.world.checkPlacement(this.playerTeam, it.kind, x, z, face);
    it.ok = chk.ok;
    it.reason = chk.reason;
    this.renderer.ghost = { kind: it.kind, x, z, heading: face, ok: chk.ok };
    this.renderer.gridFrame = frame;
  }

  /** Yol çizimi: başlangıç mevcut yolun üstüne yapışır; uç önce yakındaki yola, yoksa (ızgara açıksa) ızgaraya. */
  private refreshRoad(): void {
    const it = this.interaction;
    if (it.mode !== 'road') return;
    const w = this.world;
    const team = this.playerTeam;
    let x = it.px;
    let z = it.pz;
    if (it.del) {
      // Yol kaldırma: imlecin altındaki kendi yol parçası kırmızı vurgulanır; iade ya da neden alt satırda
      const h = nearestRoad(w.roads, team, x, z, 14);
      const chk = h ? w.roadRemoval(team, h.road.id) : null;
      it.hit = h ? h.road.id : null;
      it.ok = !!chk?.ok;
      it.reason = chk ? chk.reason : L('Kaldırılacak yolun üstünü seç', 'Pick a road to remove');
      it.cost = chk?.refund ?? 0;
      it.length = h ? Math.hypot(h.road.bx - h.road.ax, h.road.bz - h.road.az) : 0;
      this.renderer.roadGhost = h ? { ax: h.road.ax, az: h.road.az, bx: h.road.bx, bz: h.road.bz, ok: false } : null;
      this.renderer.gridFrame = null;
      return;
    }
    const snapEnds = (h: { s: number; len: number }): number => (h.s < 6 ? 0 : h.len - h.s < 6 ? h.len : h.s);
    if (!it.start) {
      const h = nearestRoad(w.roads, team, x, z, 60);
      if (h) {
        const s = snapEnds({ s: this.buildGrid ? Math.min(h.len, Math.round(h.s / GRID) * GRID) : h.s, len: h.len });
        it.x = h.road.ax + h.dx * s;
        it.z = h.road.az + h.dz * s;
        it.ux = h.dx;
        it.uz = h.dz;
        it.ok = true;
        it.reason = undefined;
      } else {
        it.x = x;
        it.z = z;
        it.ok = false;
        it.reason = w.roads.some((r) => r.team === team)
          ? L('Yolun başlayacağı yeri mevcut bir yolun üstünde seç', 'Pick the starting point on an existing road')
          : L('Önce belediye binası kur: yollar onun caddesinden başlar', 'Build a town hall first: roads start from its street');
      }
      it.cost = 0;
      it.length = 0;
      this.renderer.roadGhost = { ax: it.x, az: it.z, ok: it.ok };
      this.renderer.gridFrame = this.buildGrid && h ? { x: it.x, z: it.z, ox: it.x, oz: it.z, ux: it.ux, uz: it.uz, radius: 150 } : null;
      return;
    }
    const st = it.start;
    const h = nearestRoad(w.roads, team, x, z, 8);
    if (h && Math.hypot(h.x - st.x, h.z - st.z) > ROAD_MIN) {
      const s = snapEnds(h);
      x = h.road.ax + h.dx * s;
      z = h.road.az + h.dz * s;
    } else if (this.buildGrid) {
      const u = Math.round(((x - st.x) * st.ux + (z - st.z) * st.uz) / GRID) * GRID;
      const v = Math.round(((x - st.x) * -st.uz + (z - st.z) * st.ux) / GRID) * GRID;
      x = st.x + st.ux * u - st.uz * v;
      z = st.z + st.uz * u + st.ux * v;
    }
    const chk = w.checkRoad(team, st.x, st.z, x, z);
    it.x = x;
    it.z = z;
    it.ok = chk.ok;
    it.reason = chk.reason;
    it.cost = chk.cost;
    it.length = chk.length;
    this.renderer.roadGhost = { ax: st.x, az: st.z, bx: x, bz: z, ok: chk.ok };
    this.renderer.gridFrame = this.buildGrid ? { x, z, ox: st.x, oz: st.z, ux: st.ux, uz: st.uz, radius: 150 } : null;
  }

  /** İnşa: yapıyı 15° döndür (R). Taşırken tam tur: binanın ön cephesi ters yöne de dönebilsin. */
  rotateBuild(): void {
    if (this.interaction.mode !== 'build') return;
    const turn = this.interaction.move !== undefined ? 2 * Math.PI : Math.PI;
    this.interaction.heading = (this.interaction.heading + Math.PI / 12) % turn;
    this.refreshBuild();
  }

  /** İnşa: hayaletin durduğu yere kur (tıklama ya da "Yerleştir"). */
  placeBuild(): void {
    const it = this.interaction;
    if (it.mode === 'road') {
      if (!it.ok) {
        sound.play('error', 'ui');
        return;
      }
      if (it.del) {
        if (it.hit === null || it.hit === undefined || !this.world.removeRoad(this.playerTeam, it.hit)) {
          sound.play('error', 'ui');
          return;
        }
        sound.play('place', 'ui');
        this.refreshBuild();
        this.build.refresh();
        return;
      }
      if (!it.start) {
        it.start = { x: it.x, z: it.z, ux: it.ux, uz: it.uz };
        sound.play('click', 'ui');
      } else {
        const st = it.start;
        if (!this.world.placeRoad(this.playerTeam, st.x, st.z, it.x, it.z)) {
          sound.play('error', 'ui');
          return;
        }
        sound.play('place', 'ui');
        // Yol uçtan devam eder; ızgara yeni yolun doğrultusunda
        const len = Math.hypot(it.x - st.x, it.z - st.z) || 1;
        it.start = { x: it.x, z: it.z, ux: (it.x - st.x) / len, uz: (it.z - st.z) / len };
      }
      this.refreshBuild();
      return;
    }
    if (it.mode !== 'build') return;
    if (!it.ok) {
      sound.play('error', 'ui');
      return;
    }
    if (it.move !== undefined) {
      const m = this.world.structureById(it.move);
      if (!m || !this.world.moveStructure(m, it.x, it.z, it.face)) {
        sound.play('error', 'ui');
        return;
      }
      sound.play('place', 'ui');
      this.cancelInteraction();
      this.selectStructure(m.id);
      return;
    }
    const s = this.world.placeStructure(this.playerTeam, it.kind, it.x, it.z, it.face);
    if (!s) {
      sound.play('error', 'ui');
      return;
    }
    sound.play('place', 'ui');
    // Şehir binaları art arda yerleştirilir (Esc ya da sağ tık bitirir)
    if (s.def.category === 'city') {
      this.refreshBuild();
      return;
    }
    this.cancelInteraction();
    this.selectStructure(s.id);
  }

  private handleClick(x: number, y: number): void {
    const it = this.interaction;
    if (it.mode === 'build' || it.mode === 'road') {
      this.handleHover(x, y);
      // Dokunmatikte üzerine gelme yok: dokunuş hayaleti taşır, "Yerleştir" kurar
      if (!this.renderer.rig.lastTouch) this.placeBuild();
      return;
    }
    if (it.mode === 'pickTarget' || it.mode === 'pickWaypoint') {
      this.planner.handleMapClick(x, y, it.mode);
      return;
    }
    if (it.mode === 'pickAir') {
      const ac = this.world.aircraftById(it.acId);
      const hit = this.renderer.pick(x, y);
      if (!ac || !this.canOrder(ac)) {
        this.cancelInteraction();
        return;
      }
      if (hit?.kind === 'aircraft' && hit.ac.team !== ac.team && hit.ac.airborne && hit.ac.status === 'flying') {
        this.orderTarget(ac, hit.ac);
        this.cancelInteraction();
      } else this.toast(this.renderer.rig.lastTouch ? L('Düşman uçağına dokun', 'Tap an enemy aircraft') : L('Düşman uçağına tıkla', 'Click an enemy aircraft'));
      return;
    }
    const hit = this.renderer.pick(x, y);
    if (hit?.kind === 'aircraft') this.selectAircraft(hit.ac.id);
    else if (hit?.kind === 'structure') this.selectStructure(hit.s.id);
    else {
      this.selectAircraft(null);
      this.selectStructure(null);
    }
  }

  private cycle(dir: number): void {
    const list = this.world.aircraft
      .filter((a) => a.status === 'flying' && !a.onGround && this.renderer.isVisible(a))
      .sort((a, b) => a.team - b.team || a.id - b.id);
    if (!list.length) return;
    const idx = list.findIndex((a) => a.id === this.selectedAircraftId);
    this.selectAircraft(list[(idx + dir + list.length) % list.length].id);
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLSelectElement || tgt instanceof HTMLTextAreaElement) return;
      // Ödeme penceresi, destekçi paketi ve bildirim en üstte: Esc önce onları kapatır, kısayollar çalışmaz
      if (this.support.paying) {
        if (e.code === 'Escape') this.support.closeEmbed();
        return;
      }
      const top = this.modals.openKind;
      if (top === 'support' || top === 'notice') {
        if (e.code === 'Escape') this.modals.close();
        return;
      }
      // Profil penceresi ana menüde de açılır: odak dışındayken de Esc kapatsın
      if (this.profile.isOpen) {
        if (e.code === 'Escape') this.profile.close();
        return;
      }
      if (this.mode === 'menu') return;
      // Öğretici açıkken kısayollar kapalı (yalnız gösterilen yere tıklanır)
      if (this.tutorial.capturesKeys) return;
      if (this.login.isOpen) {
        if (e.code === 'Escape') this.login.close();
        return;
      }
      if (this.feedback.isOpen || this.news.isOpen) return;
      // Harekât sonu penceresi: Esc haritada kalır
      if (this.end.isOpen) {
        if (e.code === 'Escape') this.end.close();
        return;
      }
      // Duraklatma menüsü açıkken yalnız Esc (üstte ayar penceresi varsa önce o kapanır)
      if (this.pause.isOpen) {
        if (e.code === 'Escape') {
          if (this.modals.isOpen) this.modals.close();
          else this.pause.close();
        }
        return;
      }
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePause();
          break;
        case 'Digit1': this.setTimeScale(1); break;
        case 'Digit2': this.setTimeScale(2); break;
        case 'Digit3': this.setTimeScale(4); break;
        case 'KeyF': this.toggleFollow(); break;
        case 'KeyG': this.goHome(); break;
        case 'KeyH': this.hangar.toggle(); break;
        case 'KeyB': this.build.toggle(); break;
        case 'KeyU': this.modals.toggleFactory(); break;
        case 'KeyT': this.modals.open('research'); break;
        case 'KeyV': this.modals.open('settings'); break;
        case 'KeyM': this.modals.open('market'); break;
        case 'KeyN': sound.toggleMute(); break;
        case 'KeyP': {
          const s = this.selectedStructure;
          if (s?.airbase && s.team === this.playerTeam) this.planner.open(s.airbase);
          break;
        }
        case 'KeyR':
          this.rotateBuild();
          break;
        case 'KeyX':
          if (this.interaction.mode === 'build' || this.interaction.mode === 'road') this.toggleGrid();
          break;
        case 'Tab':
          e.preventDefault();
          this.cycle(e.shiftKey ? -1 : 1);
          break;
        case 'Escape':
          this.escapeInPlay();
          break;
      }
    });
  }

  /** Oyunda Esc ve geri tuşu: en üstteki pencere ya da adım kapanır; boştaysa duraklatma menüsü açılır. */
  private escapeInPlay(): void {
    if (this.hangar.isOpen) this.hangar.close();
    else if (this.modals.isOpen) this.modals.close();
    else if (this.interaction.mode !== 'none') this.cancelStep();
    else if (this.planner.isOpen) this.planner.close();
    else if (this.build.isOpen) this.build.close();
    else if (this.selectedAircraftId !== null || this.selectedStructureId !== null) {
      this.selectAircraft(null);
      this.selectStructure(null);
    } else this.pause.open();
  }

  /**
   * Android geri tuşu (2026-11-19; Play'deki TWA ve telefon tarayıcısı). Tarayıcı geçmişine bir nöbetçi kayıt konur; geri tuşu
   * onu geri alınca popstate gelir ve nöbetçi yeniden konur: Esc gibi en üstteki pencere kapanır, oyunda boştaysa duraklatma
   * menüsü açılır (geri tuşu oyundan hiç çıkmaz). Ana menüde boşta ilk basış uyarır, nöbetçi oyuncu ekrana dokunana dek konmaz:
   * ikinci basış oyundan çıkar (TWA kapanır, tarayıcıda önceki sayfa).
   * Chrome, kullanıcı dokunmadan eklenen geçmiş kaydını geri tuşunda atlar: nöbetçi açılışta değil ilk dokunuşta konur.
   * Sayfadan ayrılırken (dil değişimi, ansiklopedi bağlantısı) önce nöbetçi geri alınır (`leavePage`): yoksa dönüşte altındaki
   * kayıt eski sayfanındır ve geri tuşu oyunu yeniden yükler.
   */
  private bindBackButton(): void {
    // Sayfa nöbetçi kayıtta açıldı (ör. telefon sekmeyi atıp geri getirdi): alttaki kayıt eski sayfanın, kullanılmaz
    if (onSentinel()) history.replaceState(null, '');
    const arm = () => {
      if (!onSentinel()) history.pushState({ wsb: 1 }, '');
    };
    window.addEventListener('pointerdown', arm, true);
    window.addEventListener('keydown', arm, true);
    window.addEventListener('popstate', () => {
      if (this.leaving) {
        const go = this.leaving;
        this.leaving = null;
        go();
        return;
      }
      if (onSentinel()) return; // ileri tuşuyla nöbetçiye dönüldü
      if (this.onBack()) arm();
      else this.toast(L('Çıkmak için geri tuşuna bir kez daha bas.', 'Press back again to exit.'));
    });
    // Aynı sekmede açılan bağlantılar (ansiklopedi) da önce nöbetçiyi geri alır
    document.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.<HTMLAnchorElement>('a[href]');
      if (!a || a.target || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (a.origin !== location.origin || !onSentinel()) return;
      e.preventDefault();
      this.leavePage(() => location.assign(a.href));
    });
  }

  private leaving: (() => void) | null = null;

  /** Sayfadan ayrıl (yeniden yükleme ya da başka adres): önce geri tuşunun nöbetçi kaydı geri alınır. */
  leavePage(go: () => void): void {
    if (!onSentinel()) {
      go();
      return;
    }
    this.leaving = go;
    history.back();
    // Geri alma gelmezse yine de git
    setTimeout(() => {
      if (this.leaving !== go) return;
      this.leaving = null;
      go();
    }, 500);
  }

  /** Geri tuşu: bir şey kapandıysa ya da yok sayıldıysa true; ana menüde boştaysa false (sonraki basış çıkar). */
  private onBack(): boolean {
    if (this.tutorial.back()) return true;
    // Ödeme penceresi (Polar) en üstte
    if (this.support.closeEmbed()) return true;
    // Destekçi paketi ve bildirim pencereleri profilin ve ana menünün üstünde açılır: önce onlar kapanır
    const top = this.modals.openKind;
    if (top === 'support' || top === 'notice') this.modals.close();
    else if (this.profile.isOpen) this.profile.close();
    else if (this.login.isOpen) this.login.close();
    else if (this.feedback.isOpen) this.feedback.close();
    else if (this.news.isOpen) this.news.close();
    else if (this.mode === 'menu') {
      if (this.modals.isOpen) this.modals.close();
      // Ana menü öğreticisi yürürken geri tuşu bir şey yapmaz (öğreticinin kendi kapatma düğmesi var)
      else if (!this.tutorial.capturesKeys) return false;
    } else if (this.tutorial.capturesKeys || this.mode !== 'play') {
      /* öğretici adımı ya da yükleme: yok say */
    } else if (this.end.isOpen) this.end.close();
    else if (this.pause.isOpen) {
      if (this.modals.isOpen) this.modals.close();
      else this.pause.close();
    } else this.escapeInPlay();
    return true;
  }

  /**
   * Telefonda uygulama değiştirince ya da ekran kilitlenince tarayıcı sekmeyi her an kapatabilir: arka plana geçerken
   * otomatik kayıt al. Kaydedilmemiş ilerlemeyle sayfa kapatılırken tarayıcı onay sorar.
   */
  private bindPageLifecycle(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden' || this.mode !== 'play' || !currentAccount()) return;
      this.stats.flush(this.world, this.playerTeam);
      if (this.lastSave && this.world.time - this.lastSave.gameTime < HIDE_SAVE_MIN) return;
      void this.saveNow('auto', `${L('Otomatik', 'Auto')} · ${this.defaultSaveTitle()}`);
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.mode !== 'play' || !this.unsavedProgress()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  /** Kare döngüsü: bir sonraki kare önce istenir, karedeki hata oyunu dondurmaz. */
  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    // 90–144 Hz ekranlarda saniyede ~60 kare: iş ve ısınma yarıya iner (telefon ısınıp yavaşlamaz); 60 Hz'de fark yok
    if (now - this.lastDraw < 10) return;
    this.lastDraw = now;
    if (this.mapLoading || this.warming) {
      // Harita yükleniyor (withMap) ya da sahne hazırlanıyor (warmUp): dünya ve çizim bekler; dönüşte uzun bir adım atılmasın
      this.last = now;
      return;
    }
    try {
      this.tick(now);
    } catch (e) {
      this.reportError(e);
    }
  };

  /** Hata konsola yazılır (en çok 5 sn'de bir), oyuncuya bir kez bildirilir. */
  private reportError(e: unknown): void {
    const now = performance.now();
    if (now - this.lastErrorLog > 5000) {
      this.lastErrorLog = now;
      console.error(e);
    }
    if (!this.errorShown) {
      this.errorShown = true;
      this.toast(L('Beklenmeyen bir hata oldu; oyun sürüyor. Sorun devam ederse kaydedip sayfayı yenile.', 'Something unexpected went wrong; the game goes on. If it keeps happening, save and reload the page.'), true);
    }
  }

  /** Teşekkür penceresi: bir kez (hesapta haber izi, misafirde tarayıcı). */
  private showThanks(): void {
    const sec = this.thanksDue;
    this.thanksDue = 0;
    if (thanksShown()) return;
    markThanksShown();
    this.modals.openThanks(this.world.playerName || currentAccount()?.name || '', sec);
  }

  /**
   * Takılma önerisi (perfWatch.ts): neyin önerildiği yazılır; kabul edilirse ayarlar Grafik sekmesinde, önerilen seçenek
   * işaretli açılır, oyuncu istediğini seçer. Pencere dışına dokunmak "Şimdi değil" sayılır (öneri 10 dk susar).
   */
  private offerPerfHint(h: PerfHint): void {
    this.perf.snooze();
    const fps = Math.round(h.fps);
    const what = h.set === 'quality' ? `${L('Kalite', 'Quality')}: ${QUALITY[h.v as GraphicsQuality].name}`
      : h.set === 'resolution' ? `${L('Çözünürlük', 'Resolution')}: ${L('%50', '50%')}`
        : `${MAP_LAYERS.find((l) => l.id === h.k)?.name ?? ''}: ${L('kapalı', 'off')}`;
    const why = h.stutter
      ? L('Son 20 saniyede kareler sık sık takıldı: her dört kareden birinden fazlası gecikti.', 'Over the last 20 seconds the picture kept hitching: more than one frame in four was late.')
      : L(`Son 20 saniyede ortalama <b>${fps} kare/sn</b> çizilebildi: bu cihazda oyun akıcı değil.`, `Over the last 20 seconds only <b>${fps} frames per second</b> were drawn on average: the game is not running smoothly on this device.`);
    this.modals.openNotice(L('Oyun takılıyor', 'The game is stuttering'), `<p>${why}</p>
      <p>${L('Grafik ayarlarını düşürmek oyunu akıcılaştırır. Önerimiz', 'Lowering the graphics settings makes the game smoother. Our suggestion')}: <b>${what}</b>. ${L('Ayarlarda işaretli olacak; istediğini seçebilirsin.', 'It will be marked in the settings; choose whatever you like.')}</p>`, [
      { label: L('Grafik ayarlarını aç', 'Open graphics settings'), primary: true, run: () => this.modals.openSettings('grafik', h) },
      { label: L('Şimdi değil', 'Not now'), run: () => undefined },
      { label: L('Bir daha sorma', 'Don’t ask again'), run: silencePerfHint },
    ]);
  }

  /** Oyunun önünde pencere var mı (arka plan buğulu ya da örtülü). */
  private get windowOpen(): boolean {
    return this.modals.isOpen || this.hangar.isOpen || this.pause.isOpen || this.news.isOpen || this.feedback.isOpen || this.login.isOpen || this.profile.isOpen;
  }

  private tick(now: number): void {
    const raw = (now - this.last) / 1000;
    const real = Math.min(raw, 0.1);
    this.last = now;
    // Oyunun bu karedeki hızı: seçilen hız, 1× seçiliyken boş yolda 2×
    const scale = this.mode === 'play'
      ? this.autoFast.update(this.world, this.playerTeam, this.timeScale, real, settings.game.autoFast)
      : this.timeScale;
    if (this.autoFast.active && !this.autoFastTold && this.mode === 'play') {
      this.autoFastTold = true;
      this.toast(L('Boş yol: kolların yoldayken oyun 2× akar; çatışma ve görevde 1×\'e döner.', 'Open road: while your flights travel the game runs at 2×; it drops to 1× for combat and missions.'));
    }
    this.acc += real * scale;
    // Oyun süresi sayacı gerçek zamanlı: hızlandırma etkilemez, duraklatınca durur. Yavaş karede de geri kalmasın diye kırpılmamış süre;
    // üst sınır sekmeye dönüş için (arka planda kare çizilmez).
    if (this.mode === 'play' && scale > 0) this.world.playTime += Math.min(raw, 1);
    // Pencere açıkken arkadaki oyun iki karede bir çizilir: pencerenin kaydırması akıcı kalır (4× yavaş işlemcide en yavaş kareler
    // ~110 ms'den ~20 ms'ye iner), buğulu arka planda fark edilmez. Ses de yalnız çizilen karede çalışır: olayları çizim siler,
    // atlanan karenin olayları sonraki karede ikisine birden gider; ne iki kez çalar ne kaybolur.
    const covered = this.mode === 'play' && this.windowOpen;
    this.drawTurn = covered ? !this.drawTurn : true;
    const draw = this.drawTurn;
    this.drawDebt += real;
    let steps = 0;
    const maxSteps = 80;
    while (this.acc >= STEP && steps < maxSteps) {
      this.world.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= maxSteps) this.acc = 0;
    // Sesler render'dan önce: dünya olaylarını render tüketip siler. Sesteki bir hata görüntüyü durdurmasın.
    const rig = this.renderer.rig;
    try {
      const playing = this.mode === 'play' && !this.pause.isOpen && this.timeScale > 0;
      const listener = rig.following && this.followId !== null ? this.world.aircraftById(this.followId) ?? null : null;
      if (draw) this.battle.frame(this.world, this.renderer.camera, rig.distance, playing, scale, listener, (ac) => this.renderer.isVisible(ac));
      if (this.mode === 'play') {
        this.alerts.update(this.world, this.playerTeam, (p) => this.battle.loudness(p));
        this.watchFlights();
      }
    } catch (e) {
      this.reportError(e);
    }
    if (this.mode === 'menu') {
      // Arka plan: harita yavaşça döner; oyun arayüzü gizli
      rig.yaw += real * 0.025;
      this.drawDebt = 0;
      this.renderer.frame(real, Math.min(this.acc / STEP, 1));
      this.tutorial.update();
      // Fazla kayıt uyarısı: e-posta penceresi ya da öğretici açıksa onlar kapanınca
      if (this.cleanupDue && !this.login.isOpen && !this.modals.isOpen && !this.tutorial.busy) this.showCleanup();
      return;
    }
    const visible = document.visibilityState === 'visible';
    if (currentAccount()) this.stats.update(real, this.world, this.playerTeam, visible);
    else this.stats.guest(real, this.world, visible);
    if (this.thanksDue && !this.windowOpen && !this.tutorial.busy && !this.end.isOpen) this.showThanks();
    // Takılma: yalnız harekâtta (senaryolar test ve kayıt içindir), oyunun önünde pencere yokken, sekme görünürken ve 4× dışında
    // sayılır (4×'te yavaş kare simülasyondan gelir, grafikten değil)
    const slow = this.perf.update(raw, this.scenarioId === 'kampanya' && visible && !this.windowOpen && !this.tutorial.busy && !this.end.isOpen && this.timeScale < 4);
    if (slow) this.offerPerfHint(slow);
    // Otomatik kayıt: oyun akarken her 5 dakikada bir (giriş yapılmışsa)
    if (!this.pause.isOpen && this.timeScale > 0) {
      this.autosaveClock += real;
      if (this.autosaveClock >= AUTOSAVE_SEC) {
        this.autosaveClock = 0;
        if (currentAccount()) void this.saveNow('auto', `${L('Otomatik', 'Auto')} · ${this.defaultSaveTitle()}`);
      }
    }
    // Seçili uçak indi/düştüyse seçim kalksın
    if (this.selectedAircraftId !== null && !this.world.aircraftById(this.selectedAircraftId)) this.selectAircraft(null);
    if (draw) {
      this.renderer.frame(this.drawDebt, Math.min(this.acc / STEP, 1), covered);
      this.drawDebt = 0;
    }
    this.hud.update();
    this.end.update();
    this.left.update();
    this.layout.update(this.planner.isOpen);
    this.planner.update();
    this.build.update();
    this.modals.update();
    this.tutorial.update();
  }
}
