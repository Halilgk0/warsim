// Hangar: nesil sekmeleri ve seçili neslin uçakları, dönen 3B model, gerçek veriler ve irtifaya göre hız/tırmanma grafiği.
// Yalnız araştırma ağacında olan, uçurulabilen uçaklar listelenir. Hava savunma bölümü aynı pencerede: sınıf sekmeleri ve silahlar,
// namlusu kalkıp inen ve gerçek ritmiyle ateş eden model (bilgiler hangarAA.ts).

import * as THREE from 'three';
import { ENGINE_NAMES, GENERATIONS, ROLE_NAMES, SPEC_LIST, generationInfo, originName, type AircraftSpec } from '../sim/aircraft/specs';
import { aircraftNode, TECH, TECH_BY_ID, type Research } from '../sim/tech';
import { modAppliesTo } from '../sim/mods';
import { buildAircraftModel } from '../render/models';
import { buildAAGun, recoilAt } from '../render/structures';
import { AA_CLASS_NAMES, AA_CLASS_ORDER, AA_WEAPONS, AA_WEAPON_ORDER, type AAClass, type AAWeaponId } from '../sim/structures/airDefense';
import { aaDetails } from './hangarAA';
import { esc, nf } from './dom';
import { EN, L, LOCALE } from '../i18n';
import { ENCYCLOPEDIA, encUrl } from '../ansiklopedi/liste';

const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

const KMH = L('sa', 'h');
const SN = L('sn', 's');

/** İrtifaya göre azami hız (düz çizgi, alt eksen) ve tırmanma hızı (kesikli, üst eksen). */
function perfChart(s: AircraftSpec): string {
  const W = 320;
  const H = 170;
  const pad = { l: 34, r: 10, t: 18, b: 22 };
  const top = Math.max(s.ceiling + 1000, 6000);
  const n = s.perf.alt.findIndex((a) => a > top);
  const alt = s.perf.alt.slice(0, n < 0 ? undefined : n);
  const vmax = s.perf.vmax.slice(0, alt.length).map((v) => v * 3.6);
  const climb = s.perf.climb.slice(0, alt.length);
  const vTop = Math.ceil((Math.max(...vmax) * 1.08) / 100) * 100;
  const cTop = Math.max(5, Math.ceil(Math.max(...climb) / 5) * 5);
  const y = (h: number) => pad.t + (1 - h / top) * (H - pad.t - pad.b);
  const xv = (v: number) => pad.l + (v / vTop) * (W - pad.l - pad.r);
  const xc = (c: number) => pad.l + (c / cTop) * (W - pad.l - pad.r);
  const lineV = alt.map((h, i) => `${xv(vmax[i]).toFixed(1)},${y(h).toFixed(1)}`).filter((_, i) => vmax[i] > 0).join(' ');
  const lineC = alt.map((h, i) => `${xc(climb[i]).toFixed(1)},${y(h).toFixed(1)}`).join(' ');
  const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(top * f)}" y2="${y(top * f)}" class="g"/>
    <text x="${pad.l - 4}" y="${y(top * f) + 3}" text-anchor="end">${nf.format((top * f) / 1000)} km</text>`).join('');
  return `<svg class="pchart" viewBox="0 0 ${W} ${H}">
    ${grid}
    <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${H - pad.b}" class="a"/>
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" class="a"/>
    <polyline points="${lineV}" class="v"/>
    <polyline points="${lineC}" class="c"/>
    <text x="${W - pad.r}" y="${H - 6}" text-anchor="end">${L('azami hız', 'top speed')} → ${nf.format(vTop)} km/${L('sa', 'h')}</text>
    <text x="${W - pad.r}" y="11" text-anchor="end" class="ct">${L('tırmanma', 'climb')} → ${cTop} m/${L('sn', 's')}</text>
    <circle cx="${xv(s.vMax * 3.6)}" cy="${y(s.vMaxAlt)}" r="3" class="v"/>
  </svg>`;
}

/** Hangar zemini: beton plakalar, ortada ışık havuzu, kenara doğru söner. Arka plan CSS'te (`.steel .preview`), sahne saydam. */
function hangarFloor(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(200, 226, 210, 0.36)');
  g.addColorStop(0.55, 'rgba(150, 182, 165, 0.17)');
  g.addColorStop(1, 'rgba(120, 150, 135, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  // Derzler yalnız ışığın düştüğü yerde görünür
  x.globalCompositeOperation = 'source-atop';
  x.strokeStyle = 'rgba(6, 10, 8, 0.4)';
  x.lineWidth = 2;
  for (let i = 1; i < 8; i++) {
    const p = (S * i) / 8;
    x.beginPath();
    x.moveTo(p, 0);
    x.lineTo(p, S);
    x.moveTo(0, p);
    x.lineTo(S, p);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Listede görünen uçaklar: araştırma ağacında olup uçurulabilenler. */
const inTree = (s: AircraftSpec): boolean => {
  const node = aircraftNode(s.id);
  return !!node && !node.future;
};

export class Hangar {
  isOpen = false;
  private el = document.getElementById('hangar')!;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 2000);
  private pivot = new THREE.Group();
  private raf = 0;
  private spec: AircraftSpec = SPEC_LIST[0];
  private preview!: HTMLElement;
  private details!: HTMLElement;
  private last = 0;
  /** Araştırma durumu için (oyun bağlanınca). */
  hasAircraft: (id: string) => boolean = () => true;
  /** Oyuncunun araştırması (geliştirmelerin listesi için). */
  research: () => Research | null = () => null;
  private mode: 'ac' | 'aa' = 'ac';
  private gunId: AAWeaponId = 'aa88';
  private readonly guns = new Map<AAWeaponId, THREE.Group>();
  private readonly flash = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  /** Vitrindeki topun ateş ritmi. */
  private shot = { cooldown: 1, rounds: 0, recoilT: 1e9, reloading: false };
  /** Yapı malzemesi sis tanımlarını ister (arch.ts atmoSky); bu kadar yakında sis görünmez. */
  private readonly aaFog = new THREE.Fog(0xf6f1ea, 1e6, 2e6);
  private stateEl!: HTMLElement;
  private subEl!: HTMLElement;

  constructor() {
    const list = SPEC_LIST.filter(inTree);
    const gens = GENERATIONS.filter((g) => list.some((s) => s.generation === g.id));
    this.el.innerHTML = `
      <div class="modal-card hangar-card steel">
        <div class="modal-head">
          <div>
            <h2>${L('Hangar', 'Hangar')}</h2>
            <p class="muted hg-sub"></p>
          </div>
          <div class="seg hg-mode"><button data-mode="ac">${L('Uçaklar', 'Aircraft')}</button><button data-mode="aa">${L('Hava savunma', 'Air defence')}</button></div>
          <button class="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button>
        </div>
        <div class="gens gens-aa hidden">
          <div class="gen-tabs">${AA_CLASS_ORDER.map((c) => `<button data-cls="${c}"><b>${AA_CLASS_NAMES[c].name}</b><small>${AA_CLASS_NAMES[c].sub}</small></button>`).join('')}</div>
          ${AA_CLASS_ORDER.map((c) => `<div class="gen-planes" data-cls="${c}">${AA_WEAPON_ORDER.filter((id) => AA_WEAPONS[id].cls === c)
            .map((id) => `<button data-gun="${id}">${esc(AA_WEAPONS[id].name)}</button>`).join('')}</div>`).join('')}
        </div>
        <div class="gens gens-ac">
          <div class="gen-tabs">${gens.map((g) => `<button data-gen="${g.id}"><b>${g.label}</b> ${g.name}<small>${g.era}</small></button>`).join('')}</div>
          ${gens.map((g) => `<div class="gen-planes" data-gen="${g.id}">${list.filter((s) => s.generation === g.id)
            .map((s) => `<button data-spec="${s.id}" title="${esc(s.name)}">${esc(s.abbr)}</button>`).join('')}</div>`).join('')}
        </div>
        <div class="hangar-body">
          <div class="preview"><span class="aa-state hidden"></span></div>
          <div class="details"></div>
        </div>
      </div>`;
    this.preview = this.el.querySelector('.preview')!;
    this.details = this.el.querySelector('.details')!;
    this.stateEl = this.el.querySelector('.aa-state')!;
    this.subEl = this.el.querySelector('.hg-sub')!;
    this.el.querySelector('.close')!.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
      const mode = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
      if (mode) this.setMode(mode.dataset.mode as 'ac' | 'aa');
      const cls = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cls]');
      if (cls) {
        const first = AA_WEAPON_ORDER.find((id) => AA_WEAPONS[id].cls === cls.dataset.cls);
        if (first) this.showGun(first);
      }
      const gun = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-gun]');
      if (gun) this.showGun(gun.dataset.gun as AAWeaponId);
      const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('.gen-tabs button[data-gen]');
      if (tab) this.showGen(tab.dataset.gen!);
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-spec]');
      if (b) {
        const s = SPEC_LIST.find((x) => x.id === b.dataset.spec);
        if (s) this.show(s);
      }
    });

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cfbf, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-3, 6, 4);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: hangarFloor(), transparent: true, depthWrite: false }));
    floor.name = 'floor';
    floor.renderOrder = -1;
    this.scene.add(floor);
    this.scene.add(this.pivot);
    window.addEventListener('resize', () => this.isOpen && this.resize());
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Hava savunma bölümünde belirli silahı aç. */
  openGun(id: AAWeaponId): void {
    this.gunId = id;
    this.mode = 'aa';
    this.open();
  }

  private setMode(mode: 'ac' | 'aa'): void {
    this.mode = mode;
    if (mode === 'aa') this.showGun(this.gunId);
    else this.show(this.spec);
  }

  /** Bölüm düğmeleri, başlık altı metni ve sekme satırları. */
  private syncMode(): void {
    const aa = this.mode === 'aa';
    for (const b of this.el.querySelectorAll<HTMLElement>('button[data-mode]')) b.classList.toggle('active', b.dataset.mode === this.mode);
    this.el.querySelector('.gens-aa')!.classList.toggle('hidden', !aa);
    this.el.querySelector('.gens-ac')!.classList.toggle('hidden', aa);
    this.stateEl.classList.add('hidden');
    this.scene.fog = aa ? this.aaFog : null;
    this.subEl.textContent = aa
      ? L('Gerçek uçaksavar sistemlerinden alınmış kalibre, mermi ve atış verileri. Menzil, tavan ve mermi uçuş süresi oyundaki hesapla aynıdır.',
        'Calibre, shell and rate-of-fire data taken from real anti-aircraft systems. Range, ceiling and shell flight time use the same calculation as the game.')
      : L('Gerçek uçaklardan alınmış kütle, kanat, motor ve silah verileri. Azami hız, tırmanış, dönüş ve menzil aynı uçuş modelinden türetilir: oyunda uçak tam olarak burada yazdığı gibi uçar.',
        'Mass, wing, engine and weapon data taken from the real aircraft. Top speed, climb, turn and range all come from the same flight model: in game, each aircraft flies exactly as written here.');
  }

  open(specId?: string): void {
    this.isOpen = true;
    if (specId) this.mode = 'ac';
    this.el.classList.remove('hidden');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.preview.appendChild(this.renderer.domElement);
    }
    this.resize();
    const s = specId ? SPEC_LIST.find((x) => x.id === specId) : undefined;
    if (this.mode === 'aa') this.showGun(this.gunId);
    else this.show(s ?? this.spec);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.animate);
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
    cancelAnimationFrame(this.raf);
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = this.preview.clientWidth || 600;
    const h = this.preview.clientHeight || 400;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Nesil sekmesi: o neslin uçakları görünür; satır sayısı değişirse önizleme yeni boyuta uyar. */
  private showGen(gen: string): void {
    for (const t of this.el.querySelectorAll<HTMLElement>('.gen-tabs button[data-gen]')) t.classList.toggle('active', t.dataset.gen === gen);
    for (const p of this.el.querySelectorAll<HTMLElement>('.gen-planes[data-gen]')) p.classList.toggle('hidden', p.dataset.gen !== gen);
    this.resize();
  }

  private showGun(id: AAWeaponId): void {
    this.gunId = id;
    const w = AA_WEAPONS[id];
    const r = this.research();
    this.syncMode();
    const cls: AAClass = w.cls;
    for (const t of this.el.querySelectorAll<HTMLElement>('button[data-cls]')) t.classList.toggle('active', t.dataset.cls === cls);
    for (const p of this.el.querySelectorAll<HTMLElement>('.gen-planes[data-cls]')) p.classList.toggle('hidden', p.dataset.cls !== cls);
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button[data-gun]')) {
      const g = AA_WEAPONS[b.dataset.gun as AAWeaponId];
      b.classList.toggle('active', g.id === id);
      b.classList.toggle('locked', !!r && !r.has(g.requires ?? undefined));
    }
    this.resize();
    this.pivot.clear();
    this.pivot.userData.props = [];
    this.pivot.rotation.z = 0;
    let gun = this.guns.get(id);
    if (!gun) {
      gun = buildAAGun(id);
      this.guns.set(id, gun);
    }
    const u = gun.userData;
    this.pivot.rotation.y = 0.5;
    this.pivot.add(gun);
    // Çerçeve: topun boyuna göre; namlu ucuna ateş işareti
    // Çerçeve namlu en dik açıdayken ölçülür: top yukarı bakınca da sığsın
    (u.pitch as THREE.Object3D).rotation.x = -1.25;
    gun.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(gun).getSize(new THREE.Vector3());
    (u.pitch as THREE.Object3D).rotation.x = -0.6;
    // Yerdeki uzun kollar (90 mm) çerçeveyi büyütüp topu küçültmesin: yükseklik ölçü, kollar taşabilir
    const rad = Math.min(Math.max(size.x, size.y, size.z), size.y * 1.15);
    (u.muzzle as THREE.Object3D).add(this.flash);
    this.flash.scale.setScalar(Math.max(0.05, w.bore / 900));
    this.flash.visible = false;
    const floor = this.scene.getObjectByName('floor')!;
    floor.scale.setScalar(rad * 1.7);
    floor.position.y = 0;
    this.camera.position.set(rad * 1.2, rad * 0.82, rad * 1.42);
    this.camera.lookAt(0, size.y * 0.26, 0);
    this.shot = { cooldown: 0.8, rounds: w.mag, recoilT: 1e9, reloading: false };
    this.details.innerHTML = aaDetails(w, r);
    this.details.scrollTop = 0;
  }

  /** Vitrindeki topun hareketi: namlu yavaşça kalkıp iner, simülasyonla aynı seri ve şarjör ritmiyle ateş eder. */
  private animateGun(now: number, dt: number): void {
    const w = AA_WEAPONS[this.gunId];
    const gun = this.guns.get(this.gunId);
    if (!gun) return;
    const u = gun.userData;
    const pitch = u.pitch as THREE.Object3D;
    pitch.rotation.x = -(0.8 + Math.sin(now / 3200) * 0.45);
    const s = this.shot;
    s.cooldown -= dt;
    s.recoilT += dt;
    if (s.cooldown <= 0) {
      s.reloading = false;
      s.recoilT = 0;
      // Dörtlü topta parlama sırayla namlu uçlarında (modeldeki namlu aralığı)
      if (w.barrels === 4) this.flash.position.set(s.rounds % 2 ? 0.25 : -0.25, s.rounds % 4 < 2 ? 0.2 : -0.18, 0);
      else this.flash.position.set(0, 0, 0);
      s.cooldown += 1 / w.rate;
      if (w.mag > 0 && --s.rounds <= 0) {
        s.rounds = w.mag;
        s.cooldown += w.reload;
        s.reloading = true;
      }
    }
    (u.recoil as THREE.Object3D).position.z = -recoilAt(s.recoilT, u.recoilLen as number, u.recoilBack as number);
    this.flash.visible = s.recoilT < 0.045;
    const busy = s.reloading && s.recoilT > 0.15;
    this.stateEl.classList.toggle('hidden', !busy);
    if (busy) this.stateEl.textContent = w.drum ? L('Tambur değişiyor', 'Changing drum') : w.clip ? L('Tarak değişiyor', 'Changing clip') : L('Şarjör değişiyor', 'Changing magazine');
  }

  private show(spec: AircraftSpec): void {
    this.spec = spec;
    this.syncMode();
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button[data-spec]')) {
      b.classList.toggle('active', b.dataset.spec === spec.id);
      b.classList.toggle('locked', !this.hasAircraft(b.dataset.spec!));
    }
    this.showGen(spec.generation);
    this.pivot.clear();
    const model = buildAircraftModel(spec.model, { gear: true });
    this.pivot.add(model.root);
    this.pivot.userData.props = model.props;
    const r = model.radius;
    const floor = this.scene.getObjectByName('floor')!;
    floor.scale.setScalar(r * 2);
    floor.position.y = -r * 0.35;
    this.camera.position.set(r * 2.3, r * 1.25, r * 2.6);
    this.camera.lookAt(0, -r * 0.08, 0);
    this.details.scrollTop = 0;

    const gen = generationInfo(spec.generation);
    const e = spec.engine;
    const m = spec.massEmpty + spec.fuelKg * 0.75;
    const engine = e.kind === 'jet'
      ? `${esc(e.name)} · ${nf1.format((e.kn ?? 0) * e.count)} kN${e.abKn ? L(` (art yakıcıyla ${nf1.format(e.abKn * e.count)} kN)`, ` (${nf1.format(e.abKn * e.count)} kN with afterburner)`) : ''} · ${L('gaz tepkisi', 'spool-up')} ~${e.spool} ${L('sn', 's')}`
      : `${esc(e.name)} · ${nf.format((e.kw ?? 0) * e.count)} kW (${nf.format(((e.kw ?? 0) * e.count) / 0.7355)} ${L('bg', 'hp')}) · ${L('kritik irtifa', 'critical altitude')} ${nf.format(e.critAlt)} m${e.wep > 1 ? ` · ${L('acil güç', 'WEP')} +${Math.round((e.wep - 1) * 100)}%` : ''}`;
    const node = aircraftNode(spec.id);
    const research = !spec.playable ? L('sonraki aşama', 'later stage') : node?.starting ? L('başlangıçta açık', 'available from the start') : this.hasAircraft(spec.id) ? L('araştırıldı', 'researched') : `${L('araç ağacında', 'in the aircraft tree')}: ${node ? node.requires.map((q) => TECH_BY_ID[q]?.specId ? SPEC_LIST.find((x) => x.id === TECH_BY_ID[q].specId)?.abbr : TECH_BY_ID[q]?.name).join(', ') : '—'}`;
    const rows: [string, string][] = [
      [L('Azami hız', 'Top speed'), L(`${nf.format(spec.vMax * 3.6)} km/sa · ${nf.format(spec.vMaxAlt)} m’de`, `${nf.format(spec.vMax * 3.6)} km/h at ${nf.format(spec.vMaxAlt)} m`)],
      [L('Deniz seviyesinde', 'At sea level'), `${nf.format(spec.vMaxSL * 3.6)} km/${KMH}`],
      [L('Tırmanma (deniz s.)', 'Climb (sea level)'), `${nf1.format(spec.climbRate)} m/${SN}`],
      [L('En iyi sürekli dönüş', 'Best sustained turn'), `${nf1.format(spec.turnTime)} ${SN} · ${nf.format(spec.turnSpeed * 3.6)} km/${KMH}`],
      [L('Tutunma hızı', 'Stall speed'), `${nf.format(spec.vStall * 3.6)} km/${KMH}`],
      [L('Kanat yükü', 'Wing loading'), `${nf.format(m / spec.wingArea)} kg/m²`],
      [e.kind === 'jet' ? L('İtki / ağırlık', 'Thrust / weight') : L('Güç / ağırlık', 'Power / weight'), e.kind === 'jet' ? nf1.format(((e.kn ?? 0) * e.count * 1000) / (m * 9.81)) : `${nf1.format((((e.kw ?? 0) * e.count) / m) * 1000)} W/kg`],
      [L('Yuvarlanma', 'Roll rate'), L(`${nf.format((spec.rollPeak * 180) / Math.PI)}°/sn · ${nf.format(spec.rollIas * 3.6)} km/sa’de`, `${nf.format((spec.rollPeak * 180) / Math.PI)}°/s at ${nf.format(spec.rollIas * 3.6)} km/h`)],
      [L('Dalış sınırı (Vne)', 'Dive limit (Vne)'), L(`${nf.format(spec.vne * 3.6)} km/sa gösterge · kritik Mach ${nf1.format(spec.mcrit)}`, `${nf.format(spec.vne * 3.6)} km/h IAS · critical Mach ${nf1.format(spec.mcrit)}`)],
      [L('Servis tavanı', 'Service ceiling'), `${nf.format(spec.ceiling)} m`],
      [L('Seyir', 'Cruise'), `${nf.format(spec.cruiseSpeed * 3.6)} km/${KMH} · ${nf.format(spec.cruiseAlt)} m`],
      [L('Dayanıklılık / menzil', 'Endurance / range'), `${nf.format(spec.fuelMinutes)} ${L('dk', 'min')} · ~${nf.format((spec.cruiseSpeed * spec.fuelMinutes * 60) / 1000)} km`],
      [L('Kütle (boş / yakıt)', 'Mass (empty / fuel)'), `${nf.format(spec.massEmpty)} kg / ${nf.format(spec.fuelKg)} kg`],
      [L('Mürettebat / zırh', 'Crew / armour'), `${spec.crew} · ${spec.armor > 0.5 ? L('ağır zırh', 'heavy armour') : spec.armor > 0.12 ? L('hafif zırh', 'light armour') : L('zırh yok', 'no armour')}`],
      [L('Üretim', 'Production'), `${spec.buildTime} ${SN} · ${research}`],
    ];
    const guns = spec.guns.map((g) => `<span class="chip">${esc(g.name)}</span>`).join('') || `<span class="muted small">${L('yok', 'none')}</span>`;
    const turrets = spec.turrets.map((t) => `<span class="chip">${esc(t.name)}: ${esc(t.gun.name)}</span>`).join('');
    const loadouts = spec.loadouts.map((l) =>
      `<span class="chip">${esc(l.name)}${l.reqs.length ? ` · ${esc(l.reqs.map((r) => TECH_BY_ID[r]?.name ?? r).join(', '))}` : ''}</span>`).join('');
    const hps = spec.hardpoints.map((h) =>
      `<span class="chip">${esc(h.name)}${h.pylons > 1 ? ` ×${h.pylons}` : ''} · ${h.cap}${h.heavyCap ? `/${h.heavyCap}` : ''} kg</span>`).join('');
    this.details.innerHTML = `
      <div class="info-title">${esc(spec.name)} <span class="abbr">${esc(spec.abbr)}</span></div>
      <div class="badges"><span class="badge">${esc(originName(spec.origin))} · ${spec.year}</span><span class="badge">${gen.label} · ${gen.name}</span><span class="badge">${ROLE_NAMES[spec.role]}</span><span class="badge">${ENGINE_NAMES[e.kind]}</span></div>
      <p>${esc(spec.description)}</p>
      ${ENCYCLOPEDIA[spec.id] ? `<p><a class="enc-link" href="${encUrl(EN, spec.id)}" target="_blank" rel="noopener">${L('Tarihçesini ansiklopedide oku', 'Read its history in the encyclopedia')} ↗</a></p>` : ''}
      ${perfChart(spec)}
      <div class="kv"><span>${L('Motor', 'Engine')}</span><span>${engine}</span>${rows.map(([k, v]) => `<span>${k}</span><span>${esc(v)}</span>`).join('')}</div>
      <h3>${L('Silahlar', 'Guns')}</h3><div class="chips">${guns}</div>
      ${turrets ? `<h3>${L('Savunma taretleri', 'Defensive turrets')}</h3><div class="chips">${turrets}</div>` : ''}
      <h3>${L(`Askı noktaları · azami ${nf.format(spec.maxLoad)} kg`, `Hardpoints · max ${nf.format(spec.maxLoad)} kg`)}</h3><div class="chips">${hps || `<span class="muted small">${L('dış yük taşımaz', 'carries no external stores')}</span>`}</div>
      <h3>${L('Hazır yükler', 'Preset loadouts')}</h3><div class="chips">${loadouts}</div>
      ${this.upgrades(spec)}
      <h3>${L('Nesil özellikleri', 'Generation features')}</h3>
      <p class="muted">${esc(gen.summary)}</p>
      ${spec.playable ? '' : `<p class="note">${L('Bu uçak radar ve füze sistemiyle birlikte sonraki aşamada savaşa girecek.', 'This aircraft enters the war in a later stage, together with radar and missiles.')}</p>`}`;
  }

  /**
   * Bu uçağa etki eden geliştirmeler: uçağı açmak için gerekmez, araştırıldıkça değerlerine eklenir. Yalnız araştıran
   * tarafın uçaklarına uygulanır.
   */
  private upgrades(spec: AircraftSpec): string {
    const r = this.research();
    const list = TECH.filter((t) => t.kind === 'mod' && !t.future && modAppliesTo(t.id, spec));
    if (!list.length) return '';
    const chips = list.map((t) => {
      const done = r?.has(t.id) ?? false;
      return `<span class="chip ${done ? '' : 'chip-off'}" title="${esc(t.desc)}">${done ? '✓' : '○'} ${esc(t.name)}${t.effect ? ` · ${esc(t.effect)}` : ''}</span>`;
    }).join('');
    return `<h3>${L('Geliştirmeler', 'Upgrades')}</h3>
      <p class="muted small">${L('Uçağı açmak için gerekmez; araştırdıkça bu uçağın değerlerine eklenir (✓ araştırıldı).', 'Not needed to unlock the aircraft; each one improves its figures once researched (✓ researched).')}</p>
      <div class="chips">${chips}</div>`;
  }

  private animate = (now: number): void => {
    if (!this.isOpen || !this.renderer) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.pivot.rotation.y += dt * (this.mode === 'aa' ? 0.3 : 0.45);
    if (this.mode === 'aa') this.animateGun(now, dt);
    else this.pivot.rotation.z = Math.sin(now / 1800) * 0.12;
    const props = (this.pivot.userData.props ?? []) as THREE.Object3D[];
    for (const p of props) p.rotation.z += dt * 30;
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.animate);
  };
}
