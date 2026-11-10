// Oyun denetleyicisi: dünya, render ve arayüzü bağlar; seçim ve etkileşim kiplerini yönetir.
// Kipler: ana menü (arkada yapay zekâ ülkelerinin oynadığı saydam harita) ve oyun. Kayıt: elle ve 5 dakikada bir.

import { World } from './sim/world';
import { SCENARIOS } from './sim/scenarios';
import type { Aircraft } from './sim/aircraft/aircraft';
import type { Structure, StructureKind } from './sim/structures/structure';
import type { FlightGroup } from './sim/ai/flightGroup';
import { GameRenderer } from './render/gameRenderer';
import { Hud } from './ui/hud';
import { LeftPanel } from './ui/panels';
import { Planner } from './ui/planner';
import { Modals } from './ui/modals';
import { Hangar } from './ui/hangar';
import { BuildBar } from './ui/build';
import { Layout } from './ui/layout';
import { onSettingsChange, settings } from './ui/settings';
import { aircraftNode } from './sim/tech';
import { groundLevel, mapKey, terrainMap } from './sim/terrain';
import { loadMapParallel } from './render/mapLoad';
import { mapById } from './sim/maps';
import { setupCampaign } from './sim/campaign';
import { deserializeWorld, serializeWorld } from './sim/save';
import { type SaveKind, currentAccount, listSaves, readSave, refreshSession, savesCleanupBy, shouldAskEmail, syncPending, writeSave, markThanksShown, thanksShown } from './persist';
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
import { L, LOCALE } from './i18n';
import { SAVE_SLOTS } from './net/shared';
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
  | { mode: 'build'; kind: StructureKind; heading: number; x: number; z: number; ok: boolean; reason?: string };

/** Kısa, sabit kimlik özeti (FNV-1a, onaltılık). */
function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
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
  readonly profile = new ProfileBox((notice) => this.showMainMenu(notice), () => this.menu.scoresChanged());
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
  /** Otomatik 2× ilk kez devreye girince bir kez açıklanır. */
  private autoFastTold = false;
  /** Savaş sesleri (yakınlaştıkça) ve oyuncuya uyarılar. */
  private readonly battle = new BattleSound();
  private readonly alerts = new AlertSound();
  /** Kameranın takip ettiği uçak (motor seslerinde Doppler dinleyicisi). */
  private followId: number | null = null;
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
  /** Son işlenen karenin zamanı (kare sınırı). */
  private lastDraw = 0;
  private errorShown = false;

  constructor() {
    this.renderer = new GameRenderer(document.getElementById('viewport')!, document.getElementById('labels')!);
    this.renderer.rig.onClick = (x, y) => this.handleClick(x, y);
    this.renderer.rig.onDoubleClick = (x, y) => this.handleDoubleClick(x, y);
    this.renderer.rig.onRightClick = () => this.cancelInteraction();
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
    this.bindPageLifecycle();
    sound.install();
    this.showMainMenu();
    // Dil değişince sayfa yeniden açıldı: ana menüdeki öğretici kaldığı yerden sürer
    this.tutorial.resume();
    // Oturum hâlâ geçerli mi; bu cihazda bekleyen kayıtlar buluta
    void refreshSession().then(() => {
      if (this.mode === 'menu') this.menu.render();
      const acc = currentAccount();
      if (acc) void syncPending(acc.key).catch(() => {});
      // E-postası olmayan eski hesaba her açılışta sorulur (adres bağlanana kadar; pencere kapatılabilir)
      if (shouldAskEmail() && this.mode === 'menu' && !this.login.isOpen) this.login.askEmail();
      void this.checkSaveCleanup();
    });
    requestAnimationFrame(this.loop);
    $('loading').classList.add('hidden');
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
          el.classList.add('hidden');
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
    this.toast(`${L('Kayıt yüklendi', 'Save loaded')} · ${mapById(d.mapId).name} · ${L('oyun', 'game')} ${fmtTime(w.playTime)}`);
  }

  exitToMenu(): void {
    this.showMainMenu();
  }

  private enterPlay(w: World, scenarioId: string): void {
    this.attachWorld(w, scenarioId);
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
    const left = Math.max(0, Math.ceil((c.by - Date.now()) / 86400000));
    const when = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' }).format(c.by);
    this.modals.openNotice(
      L('Kayıtlarını temizle', 'Clean up your saves'),
      `<p>${L(
        `Artık her hesapta en çok <b>${SAVE_SLOTS} kayıt</b> var. Senin <b>${c.count} kaydın</b> var.`,
        `Each account now has at most <b>${SAVE_SLOTS} saves</b>. You have <b>${c.count} saves</b>.`,
      )}</p>
      <p>${L(
        `Kayıtlar sekmesinden istemediklerini sil. <b>${when}</b> tarihine kadar (${left} gün) ${SAVE_SLOTS}'e inmezse en yeni ${SAVE_SLOTS} kayıt dışındakiler kendiliğinden silinir.`,
        `Delete the ones you don't need in the Saves tab. If you still have more than ${SAVE_SLOTS} by <b>${when}</b> (${left} ${left === 1 ? 'day' : 'days'}), all but your newest ${SAVE_SLOTS} are deleted automatically.`,
      )}</p>`,
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
        const s = autoSlotFor(await listSaves(acc.key), this.world.playerName);
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
      if (!cloud) this.toast(L('Bu cihaza kaydedildi; bağlantı gelince buluta yüklenecek', 'Saved on this device; it will upload when you are online'));
      else this.toast(kind === 'auto' ? L('Otomatik kayıt alındı', 'Autosaved') : L('Oyun kaydedildi', 'Game saved'));
      return true;
    } catch (e) {
      this.toast(`${L('Kayıt başarısız', 'Save failed')}: ${(e as Error).message}`, true);
      return false;
    }
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

  cancelInteraction(): void {
    const mode = this.interaction.mode;
    if (mode === 'build') this.build.close();
    this.interaction = { mode: 'none' };
    this.renderer.ghost = null;
    // Haritadan seçim bitince planlayıcının düğmeleri ("Ekleniyor… (Esc bitir)") eski hâlinde kalmasın
    if ((mode === 'pickTarget' || mode === 'pickWaypoint') && this.planner.isOpen) this.planner.refresh();
  }

  beginBuild(kind: StructureKind): void {
    this.planner.close();
    this.interaction = { mode: 'build', kind, heading: 0, x: 0, z: 0, ok: false };
  }

  private handleHover(x: number, y: number): void {
    const it = this.interaction;
    if (it.mode !== 'build') return;
    const p = this.renderer.groundPoint(x, y);
    if (!p) return;
    it.x = p.x;
    it.z = p.z;
    this.refreshBuild();
  }

  /** Yerleşim uygunluğunu mevcut konum ve yönle yeniden değerlendir. */
  private refreshBuild(): void {
    const it = this.interaction;
    if (it.mode !== 'build') return;
    const chk = this.world.checkPlacement(this.playerTeam, it.kind, it.x, it.z, it.heading);
    it.ok = chk.ok;
    it.reason = chk.reason;
    this.renderer.ghost = { kind: it.kind, x: it.x, z: it.z, heading: it.heading, ok: chk.ok };
  }

  /** İnşa: yapıyı 15° döndür (R). */
  rotateBuild(): void {
    if (this.interaction.mode !== 'build') return;
    this.interaction.heading = (this.interaction.heading + Math.PI / 12) % Math.PI;
    this.refreshBuild();
  }

  /** İnşa: hayaletin durduğu yere kur (tıklama ya da "Yerleştir"). */
  placeBuild(): void {
    const it = this.interaction;
    if (it.mode !== 'build') return;
    if (!it.ok) {
      sound.play('error', 'ui');
      return;
    }
    const s = this.world.placeStructure(this.playerTeam, it.kind, it.x, it.z, it.heading);
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
    if (it.mode === 'build') {
      this.handleHover(x, y);
      // Dokunmatikte üzerine gelme yok: dokunuş hayaleti taşır, "Yerleştir" kurar
      if (!this.renderer.rig.lastTouch) this.placeBuild();
      return;
    }
    if (it.mode === 'pickTarget' || it.mode === 'pickWaypoint') {
      this.planner.handleMapClick(x, y, it.mode);
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
        case 'Tab':
          e.preventDefault();
          this.cycle(e.shiftKey ? -1 : 1);
          break;
        case 'Escape':
          if (this.hangar.isOpen) this.hangar.close();
          else if (this.modals.isOpen) this.modals.close();
          else if (this.interaction.mode !== 'none') this.cancelInteraction();
          else if (this.planner.isOpen) this.planner.close();
          else if (this.build.isOpen) this.build.close();
          else if (this.selectedAircraftId !== null || this.selectedStructureId !== null) {
            this.selectAircraft(null);
            this.selectStructure(null);
          } else this.pause.open();
          break;
      }
    });
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
    if (this.mapLoading) {
      // Harita yükleniyor (withMap): dünya ve çizim bekler; dönüşte uzun bir adım atılmasın
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
      if (this.mode === 'play') this.alerts.update(this.world, this.playerTeam, (p) => this.battle.loudness(p));
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
