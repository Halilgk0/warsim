// Video kaydı (yalnız geliştirme sunucusunda, adres ?rec): sinematik çekimler kare kare çizilir, ses aynı zamana
// kilitli olarak OfflineAudioContext'te üretilir. Bilgisayarın hızından bağımsız, takılmasız 60 kare/sn.
// tools/rec/record.mjs sayfayı Playwright ile açar ve çekim ister; kareler JPEG, ses WAV olarak ona gider.
// Simülasyon kendi tohumlu rastgele dizisini kullanır (görüntü ve ses ayrı dizi): aynı çekim her seferinde aynı
// oynar. Önce tetik anı aranır (yalnız simülasyon, hızlı), sonra dünya yeniden kurulup o andan biraz önceye kadar
// ileri alınır ve kayda başlanır. İlk saniye ısınma: arazi, süs ve motor sesleri otursun diye çizilir ama kayda
// girmez.

import { World } from '../sim/world';
import { resetAircraftIds } from '../sim/aircraft/aircraft';
import { resetFlightIds } from '../sim/ai/flightGroup';
import { resetAirframeIds } from '../sim/structures/airbase';
import { resetStructureIds } from '../sim/structures/structure';
import { loadMap, terrainMap } from '../sim/terrain';
import { GameRenderer } from '../render/gameRenderer';
import { settings, type MapLayer } from '../ui/settings';
import { sound } from '../audio/sound';
import { BattleSound } from '../audio/battle';
import { Director } from './director';
import { TAKES, beginTake, type Take, type TakeCtx, type Subject } from './takes';

const FPS = 60;
const STEP = 1 / FPS;
const SR = 48000;

/** Kayıtta kapalı katmanlar (oyun arayüzü öğeleri). */
const CINEMA: Partial<Record<MapLayer, boolean>> = {
  labels: false, icons: false, trails: false, dropLines: false, routes: false, aaRanges: false,
  radarCoverage: false, contacts: false, fogOfWar: false, scenery: true, shadows: true, tracers: true, effects: true,
};

interface RecWindow {
  __frame?(b64: string): Promise<void>;
  __audio?(b64: string, last: boolean): Promise<void>;
  __rec?: unknown;
}
const win = window as unknown as RecWindow;

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let renderer: GameRenderer;
let simRand = mulberry32(1);
let fxRand = mulberry32(2);

function simStep(w: World): void {
  Math.random = simRand;
  try {
    w.step(STEP);
  } finally {
    Math.random = fxRand;
  }
}

/** Çekimin dünyası: harita, tohum, kurulum. */
function build(take: Take): World {
  if (terrainMap.id !== take.map) {
    loadMap(take.map);
    renderer.prepareMap();
  }
  simRand = mulberry32(take.seed);
  fxRand = mulberry32(take.seed * 7919 + 13);
  resetAircraftIds();
  resetFlightIds();
  resetAirframeIds();
  resetStructureIds();
  Math.random = simRand;
  try {
    const w = new World();
    take.setup(w);
    return w;
  } finally {
    Math.random = fxRand;
  }
}

/** Tetik anını ve öznesini bul (yalnız simülasyon). */
function scan(take: Take): { t: number; subject: Subject } {
  if (!take.trigger) return { t: take.at ?? 0, subject: { ids: [] } };
  const w = build(take);
  const max = Math.ceil(take.maxWait / STEP);
  for (let i = 0; i < max; i++) {
    simStep(w);
    const s = take.trigger(w);
    w.events.length = 0;
    if (s) return { t: w.time, subject: s };
  }
  throw new Error(`${take.id}: tetik ${take.maxWait} sn içinde gelmedi`);
}

function applyLayers(take: Take): void {
  Object.assign(settings.map, CINEMA, take.layers ?? {});
  renderer.rings = !!take.rings;
}

/** Yakındaki patlamalar kamerayı sarsar. */
function shakeFromEvents(w: World, d: Director, gain: number): void {
  const cam = renderer.camera.position;
  for (const e of w.events) {
    let size = 0;
    let pos = null;
    switch (e.kind) {
      case 'groundExplosion': size = e.size; pos = e.pos; break;
      case 'airExplosion': size = e.size * 2; pos = e.pos; break;
      case 'crash': size = 25; pos = e.pos; break;
      case 'flak': size = e.size * 10; pos = e.pos; break;
      case 'structureDestroyed': size = 140; pos = w.structureById(e.id)?.pos ?? null; break;
    }
    if (!pos || !size) continue;
    d.shake(Math.min(1, (size * 5) / Math.max(pos.distanceTo(cam), 40)) * gain);
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function sendFrame(quality: number): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    renderer.dom.toBlob((b) => (b ? resolve(b) : reject(new Error('kare alınamadı'))), 'image/jpeg', quality));
  await win.__frame!(await toBase64(blob));
}

/** 32 bit kayan noktalı WAV (sıkıştırıcı sonrası tepeler kırpılmasın), from saniyeden sonrası. */
function wav(buf: AudioBuffer, from: number): Blob {
  const s0 = Math.min(buf.length, Math.round(from * buf.sampleRate));
  const n = buf.length - s0;
  const ch = buf.numberOfChannels;
  const dv = new DataView(new ArrayBuffer(44 + n * ch * 4));
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * ch * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 3, true);
  dv.setUint16(22, ch, true);
  dv.setUint32(24, buf.sampleRate, true);
  dv.setUint32(28, buf.sampleRate * ch * 4, true);
  dv.setUint16(32, ch * 4, true);
  dv.setUint16(34, 32, true);
  str(36, 'data');
  dv.setUint32(40, n * ch * 4, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = s0; i < buf.length; i++) {
    for (let c = 0; c < ch; c++) {
      dv.setFloat32(o, data[c][i], true);
      o += 4;
    }
  }
  return new Blob([dv.buffer], { type: 'audio/wav' });
}

async function sendAudio(blob: Blob): Promise<void> {
  const CHUNK = 3 * 1024 * 1024;
  for (let i = 0; i < blob.size; i += CHUNK) {
    await win.__audio!(await toBase64(blob.slice(i, i + CHUNK)), i + CHUNK >= blob.size);
  }
}

interface RecordOpts {
  /** Isınma süresi (s): çizilir, kayda girmez. */
  warm?: number;
  /** false: kareler gönderilmez (yalnız deneme). */
  send?: boolean;
  quality?: number;
}

/** Çekimi kaydet: kareler __frame'e, ses __audio'ya. */
async function record(id: string, opts: RecordOpts = {}): Promise<{ t0: number; frames: number; subject: Subject }> {
  const take = TAKES.find((t) => t.id === id);
  if (!take) throw new Error(`çekim yok: ${id}`);
  const send = opts.send !== false;
  const warm = opts.warm ?? 1;
  const found = scan(take);
  const start = Math.max(0, found.t + take.offset);
  const w = build(take);
  while (w.time < start - warm - STEP / 2) {
    simStep(w);
    w.events.length = 0;
  }
  renderer.setWorld(w);
  applyLayers(take);

  const total = warm + take.duration;
  const N = Math.round(total * FPS);
  const warmN = Math.round(warm * FPS);
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
  await sound.startOffline(ctx);
  const battle = new BattleSound();
  beginTake();
  const d = new Director(renderer.camera);
  const c: TakeCtx = { t: -warm, dt: STEP, w, s: found.subject, d, ac: (i) => w.aircraftById(i) };
  const rig = renderer.rig;

  const frame = async (k: number): Promise<void> => {
    simStep(w);
    c.t = (k - warmN) / FPS;
    d.apply(take.shot(c), STEP);
    shakeFromEvents(w, d, take.shake ?? 1);
    rig.target.copy(d.look);
    rig.distance = take.fxDist ?? d.lookDist;
    battle.frame(w, renderer.camera, d.lookDist, true, 1, null, () => true, d.vel);
    renderer.frame(STEP, 1);
    if (send && k >= warmN) await sendFrame(opts.quality ?? 0.93);
  };

  let failure: unknown = null;
  await frame(0);
  const chain = (k: number): void => {
    void ctx.suspend(k / FPS).then(async () => {
      try {
        if (!failure) await frame(k);
      } catch (e) {
        failure = e;
      }
      if (k + 1 < N) chain(k + 1);
      void ctx.resume();
    });
  };
  if (N > 1) chain(1);
  const buf = await ctx.startRendering();
  if (failure) throw failure;
  if (send) await sendAudio(wav(buf, warm));
  return { t0: start, frames: N - warmN, subject: found.subject };
}

export function startRecorder(): void {
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#000';
  const vp = document.createElement('div');
  vp.style.cssText = 'position:fixed;inset:0';
  const labels = document.createElement('div');
  labels.style.display = 'none';
  document.body.append(vp, labels);
  renderer = new GameRenderer(vp, labels, { preserveBuffer: true });
  renderer.rig.director = () => {};
  Math.random = fxRand;
  const gl = renderer.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  win.__rec = {
    takes: () => TAKES.map((t) => ({ id: t.id, duration: t.duration })),
    scan: (id: string) => {
      const take = TAKES.find((t) => t.id === id);
      if (!take) throw new Error(`çekim yok: ${id}`);
      return scan(take);
    },
    record,
    // Denemeler için (Playwright evaluate): dünya kurup ileri almak
    build: (id: string) => build(TAKES.find((t) => t.id === id)!),
    step: simStep,
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'bilinmiyor',
    size: [renderer.dom.width, renderer.dom.height],
  };
}
