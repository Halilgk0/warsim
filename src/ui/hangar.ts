// Hangar: nesil nesil uçaklar, dönen 3B model, gerçek veriler ve irtifaya göre hız/tırmanma grafiği.

import * as THREE from 'three';
import { ENGINE_NAMES, GENERATIONS, ROLE_NAMES, SPEC_LIST, generationInfo, originName, type AircraftSpec } from '../sim/aircraft/specs';
import { aircraftNode, TECH, TECH_BY_ID, type Research } from '../sim/tech';
import { modAppliesTo } from '../sim/mods';
import { buildAircraftModel } from '../render/models';
import { esc, nf } from './dom';
import { L, LOCALE } from '../i18n';

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

  constructor() {
    this.el.innerHTML = `
      <div class="modal-card hangar-card">
        <div class="modal-head">
          <div>
            <h2>${L('Hangar ve uçak nesilleri', 'Hangar and aircraft generations')}</h2>
            <p class="muted">${L(
              'Gerçek uçaklardan alınmış kütle, kanat, motor ve silah verileri. Azami hız, tırmanış, dönüş ve menzil aynı uçuş modelinden türetilir: oyunda uçak tam olarak burada yazdığı gibi uçar. Radar ve füzeli nesiller sonraki aşamada.',
              'Mass, wing, engine and weapon data taken from the real aircraft. Top speed, climb, turn and range all come from the same flight model: in game, each aircraft flies exactly as written here. Radar and missile generations come in a later stage.',
            )}</p>
          </div>
          <button class="close" title="${L('Kapat (Esc)', 'Close (Esc)')}">✕</button>
        </div>
        <div class="tree">${GENERATIONS.map((g, i) => `
          ${i > 0 ? '<div class="tree-link"></div>' : ''}
          <div class="node ${g.playable ? '' : 'locked'}" data-gen="${g.id}" style="flex-grow:${Math.max(1, SPEC_LIST.filter((s) => s.generation === g.id).length / 3)}">
            <div class="node-top"><b>${g.label}</b><span>${g.era}</span></div>
            <div class="node-name">${g.name}</div>
            <div class="node-planes">${SPEC_LIST.filter((s) => s.generation === g.id)
              .map((s) => `<button data-spec="${s.id}" title="${esc(s.name)}">${esc(s.abbr)}</button>`).join('')}</div>
          </div>`).join('')}
        </div>
        <div class="hangar-body">
          <div class="preview"></div>
          <div class="details"></div>
        </div>
      </div>`;
    this.preview = this.el.querySelector('.preview')!;
    this.details = this.el.querySelector('.details')!;
    this.el.querySelector('.close')!.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-spec]');
      if (b) {
        const s = SPEC_LIST.find((x) => x.id === b.dataset.spec);
        if (s) this.show(s);
      }
    });

    this.scene.background = new THREE.Color(0xf6f1ea);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cfbf, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-3, 6, 4);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xebe3d6 }));
    floor.name = 'floor';
    this.scene.add(floor);
    this.scene.add(this.pivot);
    window.addEventListener('resize', () => this.isOpen && this.resize());
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(specId?: string): void {
    this.isOpen = true;
    this.el.classList.remove('hidden');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.preview.appendChild(this.renderer.domElement);
    }
    this.resize();
    const s = specId ? SPEC_LIST.find((x) => x.id === specId) : undefined;
    this.show(s ?? this.spec);
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

  private show(spec: AircraftSpec): void {
    this.spec = spec;
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button[data-spec]')) {
      b.classList.toggle('active', b.dataset.spec === spec.id);
      b.classList.toggle('locked', !this.hasAircraft(b.dataset.spec!));
    }
    for (const n of this.el.querySelectorAll<HTMLElement>('.node')) n.classList.toggle('current', n.dataset.gen === spec.generation);
    this.pivot.clear();
    const model = buildAircraftModel(spec.model, { gear: true });
    this.pivot.add(model.root);
    this.pivot.userData.props = model.props;
    const r = model.radius;
    const floor = this.scene.getObjectByName('floor')!;
    floor.scale.setScalar(r * 1.5);
    floor.position.y = -r * 0.35;
    this.camera.position.set(r * 2.3, r * 1.25, r * 2.6);
    this.camera.lookAt(0, -r * 0.08, 0);

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
    this.pivot.rotation.y += dt * 0.45;
    this.pivot.rotation.z = Math.sin(now / 1800) * 0.12;
    const props = (this.pivot.userData.props ?? []) as THREE.Object3D[];
    for (const p of props) p.rotation.z += dt * 30;
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.animate);
  };
}
