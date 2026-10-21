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
import { onSettingsChange } from './ui/settings';
import { aircraftNode } from './sim/tech';
import { groundLevel, loadMap, terrainMap } from './sim/terrain';
import { mapById } from './sim/maps';
import { setupCampaign } from './sim/campaign';
import { deserializeWorld, serializeWorld } from './sim/save';
import { type SaveKind, currentAccount, pruneAutosaves, readSave, writeSave } from './persist';
import { MainMenu } from './ui/mainMenu';
import { PauseMenu } from './ui/pauseMenu';
import { EndScreen } from './ui/endScreen';
import { LoginBox } from './ui/loginBox';
import { NewsView } from './ui/news';
import { FeedbackBox } from './ui/feedback';
import { isFullscreen, onFullscreenChange } from './ui/fullscreen';
import { $, fmtTime } from './ui/dom';
import { Vector3 } from 'three';

const STEP = 1 / 60;
/** Otomatik kayıt aralığı (gerçek zaman, oyun akarken). */
const AUTOSAVE_SEC = 300;

export type Interaction =
  | { mode: 'none' }
  | { mode: 'pickTarget' }
  | { mode: 'pickWaypoint' }
  | { mode: 'build'; kind: StructureKind; heading: number; x: number; z: number; ok: boolean; reason?: string };

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
  readonly news = new NewsView();
  readonly feedback = new FeedbackBox();
  readonly menu: MainMenu;
  readonly pause: PauseMenu;
  /** Harekât sonu (zafer / yenilgi) ve son üs geri sayımı. */
  readonly end: EndScreen;
  /** Ana menü ya da oyun. */
  mode: 'menu' | 'play' = 'menu';
  /** Son kayıt (gerçek zaman, oyun zamanı, tür). */
  lastSave: { real: number; gameTime: number; kind: SaveKind } | null = null;
  private autosaveClock = 0;
  private toastTimer = 0;
  timeScale = 1;
  scenarioId = SCENARIOS[0].id;
  selectedAircraftId: number | null = null;
  selectedStructureId: number | null = null;
  interaction: Interaction = { mode: 'none' };
  private lastScale = 1;
  private acc = 0;
  private last = performance.now();

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
    onSettingsChange(() => this.renderer.invalidateCoverage());
    onFullscreenChange(() => {
      document.querySelector('.fs-btn')?.classList.toggle('active', isFullscreen());
      this.menu.render();
    });
    this.bindKeys();
    this.showMainMenu();
    requestAnimationFrame(this.loop);
    $('loading').classList.add('hidden');
  }

  /**
   * Harita gerekiyorsa önce onu yükle (arazi üretimi birkaç saniye sürer: yükleme ekranı gösterilir), sonra devam et.
   */
  private withMap(mapId: string, then: () => void): void {
    if (terrainMap.id === mapById(mapId).id) {
      then();
      return;
    }
    const el = $('loading');
    el.querySelector('span')!.textContent = `${mapById(mapId).name} hazırlanıyor…`;
    el.classList.remove('hidden');
    // Yükleme ekranı çizilsin diye iki kare bekle
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        loadMap(mapId);
        this.renderer.prepareMap();
        then();
      } finally {
        el.classList.add('hidden');
      }
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
    rig.target.set(0, 0, 6000);
    rig.distance = 215000;
    rig.pitch = 0.98;
  }

  /** Ana menüde seçilen harita arka plana gelir. */
  previewMap(mapId: string): void {
    if (this.mode !== 'menu') return;
    this.withMap(mapId, () => this.buildBackdrop());
  }

  /** Yeni harekât: oyuncu + düşmanlar, herkes aynı varlıklarla başlar. */
  newCampaign(playerName: string, enemies: number, mapId = terrainMap.id): void {
    this.withMap(mapId, () => {
      const w = new World();
      setupCampaign(w, { enemies, playerName });
      this.enterPlay(w, 'kampanya');
      this.lastSave = null;
      this.focusHome();
    });
  }

  /** Kayıttan devam (kaydın haritası gerekiyorsa önce o yüklenir). */
  async loadSave(id: string): Promise<void> {
    try {
      const d = await readSave(id);
      if (d.v !== 2 || !d.mapId) throw new Error('bu kayıt eski harita sürümüne ait (150 km); yeni haritalarda açılamaz');
      await new Promise<void>((resolve, reject) => this.withMap(d.mapId, () => {
        try {
          this.applySave(d);
          resolve();
        } catch (e) {
          reject(e);
        }
      }));
    } catch (e) {
      this.toast(`Kayıt yüklenemedi: ${(e as Error).message}`, true);
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
    this.toast(`Kayıt yüklendi · ${mapById(d.mapId).name} · oyun ${fmtTime(w.time)}`);
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
    if (sub) sub.textContent = w.playerName ? `Komutan ${w.playerName}` : 'hava harbi prototipi';
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
    const who = this.world.playerName || 'Senaryo';
    return `${who} · ${fmtTime(this.world.time)}`;
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
    if (s < 60) return 'az önce';
    const m = Math.round(s / 60);
    return m < 60 ? `${m} dk önce` : `${Math.floor(m / 60)} sa ${m % 60} dk önce`;
  }

  /** Hesaba kaydet (giriş yoksa false). */
  async saveNow(kind: SaveKind, title?: string): Promise<boolean> {
    const acc = currentAccount();
    if (!acc || this.mode !== 'play') return false;
    try {
      const d = serializeWorld(this.world, this.scenarioId);
      const rig = this.renderer.rig;
      d.camera = { x: rig.target.x, z: rig.target.z, distance: rig.distance, yaw: rig.yaw, pitch: rig.pitch };
      await writeSave(acc.key, title ?? this.defaultSaveTitle(), kind, d);
      if (kind === 'auto') await pruneAutosaves(acc.key, 3);
      this.lastSave = { real: performance.now(), gameTime: this.world.time, kind };
      this.autosaveClock = 0;
      this.toast(kind === 'auto' ? 'Otomatik kayıt alındı' : 'Oyun kaydedildi');
      return true;
    } catch (e) {
      this.toast(`Kayıt başarısız: ${(e as Error).message}`, true);
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

  /** Hazır senaryo (Senaryo penceresinden: it dalaşı, saldırı testleri, 1 düşmanlı harekât). */
  loadScenario(id: string): void {
    const sc = SCENARIOS.find((s) => s.id === id);
    if (!sc) return;
    // Hazır senaryolar Anakara'da kurulu
    this.withMap('anakara', () => {
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
    const rig = this.renderer.rig;
    rig.followFn = () => {
      const a = this.world.aircraftById(id);
      return a && a.status !== 'dead' ? this.renderer.viewPos(a) : null;
    };
    if (rig.distance > 8000) rig.distance = 1200;
  }

  /** Kolu üsse geri çağır. */
  recallFlight(fl: FlightGroup): void {
    fl.rtbReason = 'komuta emri';
    fl.stats.recalled = true;
    if (fl.phase === 'enroute' || fl.phase === 'action' || fl.phase === 'formup') fl.setPhase('egress', this.world, 'komuta emri');
    else if (fl.phase === 'egress') fl.setPhase('rtb', this.world);
  }

  toggleFollow(): void {
    const rig = this.renderer.rig;
    if (rig.following) rig.release();
    else if (this.selectedAircraftId !== null) this.follow(this.selectedAircraftId);
  }

  setTimeScale(n: number): void {
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
    if (it.mode !== 'build' || !it.ok) return;
    const s = this.world.placeStructure(this.playerTeam, it.kind, it.x, it.z, it.heading);
    if (!s) return;
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
      if (this.mode === 'menu') return;
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
        case 'Digit4': this.setTimeScale(8); break;
        case 'Digit5': this.setTimeScale(16); break;
        case 'Digit6': this.setTimeScale(32); break;
        case 'KeyF': this.toggleFollow(); break;
        case 'KeyH': this.hangar.toggle(); break;
        case 'KeyB': this.build.toggle(); break;
        case 'KeyT': this.modals.open('research'); break;
        case 'KeyV': this.modals.open('settings'); break;
        case 'KeyM': this.modals.open('market'); break;
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

  private loop = (now: number): void => {
    const real = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.acc += real * this.timeScale;
    let steps = 0;
    const maxSteps = 80;
    while (this.acc >= STEP && steps < maxSteps) {
      this.world.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= maxSteps) this.acc = 0;
    if (this.mode === 'menu') {
      // Arka plan: harita yavaşça döner; oyun arayüzü gizli
      const rig = this.renderer.rig;
      rig.yaw += real * 0.025;
      this.renderer.frame(real, Math.min(this.acc / STEP, 1));
      requestAnimationFrame(this.loop);
      return;
    }
    // Otomatik kayıt: oyun akarken her 5 dakikada bir (giriş yapılmışsa)
    if (!this.pause.isOpen && this.timeScale > 0) {
      this.autosaveClock += real;
      if (this.autosaveClock >= AUTOSAVE_SEC) {
        this.autosaveClock = 0;
        if (currentAccount()) void this.saveNow('auto', `Otomatik · ${this.defaultSaveTitle()}`);
      }
    }
    // Seçili uçak indi/düştüyse seçim kalksın
    if (this.selectedAircraftId !== null && !this.world.aircraftById(this.selectedAircraftId)) this.selectAircraft(null);
    this.renderer.frame(real, Math.min(this.acc / STEP, 1));
    this.hud.update();
    this.end.update();
    this.left.update();
    this.layout.update(this.planner.isOpen);
    this.planner.update();
    this.build.update();
    this.modals.update();
    requestAnimationFrame(this.loop);
  };
}
