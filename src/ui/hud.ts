// Üst çubuk (zaman, araştırma), sağ panel (seçili uçak + olay günlüğü) ve alt ipucu çubuğu.

import type { Game } from '../game';
import type { Aircraft } from '../sim/aircraft/aircraft';
import { ROLE_NAMES, generationInfo } from '../sim/aircraft/specs';
import { MISSION_ICONS, MISSION_NAMES, TASK_NAMES } from '../sim/ai/missions';
import { PHASE_NAMES } from '../sim/ai/flightGroup';
import { FORMATION_NAMES } from '../sim/ai/formation';
import { currentFuelFlow, iasOf, machOf, WEP_LIMIT } from '../sim/aircraft/flightModel';
import { TECH_BY_ID } from '../sim/tech';
import { fmtMoney } from '../sim/economy';
import { techName } from './research';
import { groundLevel } from '../sim/terrain';
import { PALETTE } from '../render/palette';
import { dayHour, sunAt } from '../render/atmosphere';
import { onSettingsChange, settings, type InfoField } from './settings';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';
import { sound } from '../audio/sound';
import { $, bar, esc, fmtStamp, fmtTime, hpColor, nf, pct } from './dom';
import { L, lower } from '../i18n';

export function skillName(skill: number): string {
  if (skill > 1.25) return L('As', 'Ace');
  if (skill > 1.0) return L('Tecrübeli', 'Veteran');
  if (skill > 0.8) return L('Ortalama', 'Average');
  return L('Acemi', 'Rookie');
}

const STAGE_NAMES: Record<string, string> = {
  hold: L('bekleme', 'holding'), toIaf: L('yaklaşma', 'approach'), final: L('son yaklaşma', 'final'),
  flare: L('düzleştirme', 'flare'), rollout: L('iniş koşusu', 'rollout'),
};

export class Hud {
  private info = $('info');
  private log = $('log');
  private clock = $('clock');
  private dayclock = $('dayclock');
  private hint = $('hint');
  private timebar = $('timebar');
  private researchChip = $('research-chip');
  private moneyChip = $('money-chip');
  private missions = $('missions');
  private missionCount = $('mission-count');
  private throttle = 0;
  private lastLogKey = '';
  private lastMissionKey = '';
  private nextMissions = 0;
  /** Bildirimi gösterilen son görev raporu. */
  private lastReportId = 0;
  private lastHint = '';

  constructor(private readonly game: Game) {
    this.timebar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.speed) game.setTimeScale(Number(b.dataset.speed));
    });
    document.querySelector('.top-actions')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-open]');
      if (!b) return;
      const what = b.dataset.open!;
      if (what === 'hangar') game.hangar.toggle();
      else if (what === 'fullscreen') toggleFullscreen();
      else if (what === 'sound') sound.toggleMute();
      else if (what === 'build') game.build.toggle();
      else if (what === 'production') game.modals.toggleFactory();
      else if (what === 'pause') game.pause.open();
      else game.modals.open(what as 'scenarios' | 'research' | 'settings' | 'market');
    });
    this.researchChip.addEventListener('click', () => game.modals.open('research'));
    this.renderSoundButton();
    onSettingsChange(() => this.renderSoundButton());
    document.querySelector('.fs-btn')?.classList.toggle('hidden', !fullscreenSupported());
    // Alt çubuktaki inşa ve haritadan seçim düğmeleri (klavyesiz kullanım: R, Esc yerine)
    this.hint.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-hint]')?.dataset.hint;
      if (act === 'rotate') game.rotateBuild();
      else if (act === 'place') game.placeBuild();
      else if (act === 'cancel') game.cancelInteraction();
    });
    this.moneyChip.addEventListener('click', () => game.modals.open('market'));
    this.info.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!b) return;
      const ac = game.selectedAircraft;
      const act = b.dataset.act;
      if (act === 'follow') game.toggleFollow();
      else if (act === 'rtb' && ac?.flight) game.recallFlight(ac.flight);
      else if (act === 'route' && ac?.flight) game.renderer.routeFlightId = ac.flight.id;
    });
    this.missions.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('[data-fl]');
      if (!row) return;
      const fl = game.world.flightById(Number(row.dataset.fl));
      if (!fl) return;
      const act = t.closest<HTMLElement>('[data-mact]')?.dataset.mact;
      if (act === 'rtb') game.recallFlight(fl);
      else if (act === 'follow') {
        game.selectFlight(fl);
        const lead = fl.leader() ?? fl.alive[0];
        if (lead) game.follow(lead.id);
      } else game.selectFlight(fl);
      this.lastMissionKey = '';
    });
  }

  /** Üst çubuktaki ses düğmesi: hoparlör, sessizde çarpı. */
  private renderSoundButton(): void {
    const b = document.querySelector<HTMLElement>('.snd-btn');
    if (!b) return;
    const muted = settings.sound.muted;
    b.classList.toggle('muted', muted);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="spk" d="M4 9.5v5h3.6L12.5 19V5L7.6 9.5H4z"/>${muted
      ? '<path d="M16 9.5l5 5M21 9.5l-5 5"/>'
      : '<path d="M15.6 9a4.2 4.2 0 0 1 0 6"/><path d="M18.4 6.4a8 8 0 0 1 0 11.2"/>'}</svg>`;
  }

  onScenarioChanged(): void {
    this.lastLogKey = '';
    this.throttle = 0;
    this.lastMissionKey = '';
    const reps = this.game.world.missionReports;
    this.lastReportId = reps.length ? reps[reps.length - 1].id : 0;
  }

  /** Oyuncunun yeni biten görevleri: kısa bildirim. */
  private notifyReports(): void {
    const g = this.game;
    for (const r of g.world.missionReports) {
      if (r.id <= this.lastReportId) continue;
      this.lastReportId = r.id;
      if (r.team !== g.playerTeam) continue;
      const word = r.outcome === 'success' ? L('başarılı', 'succeeded') : r.outcome === 'fail' ? L('başarısız', 'failed') : L('sonuçsuz', 'inconclusive');
      const icon = r.outcome === 'success' ? '✓' : r.outcome === 'fail' ? '✗' : '–';
      g.toast(`${icon} ${r.flight} · ${MISSION_NAMES[r.type]} ${word}${r.reward > 0 ? ` (+${fmtMoney(r.reward)})` : ''}`, r.outcome === 'fail');
    }
  }

  update(): void {
    const g = this.game;
    this.clock.textContent = fmtTime(g.world.playTime);
    // Günün saati: güneş ufkun üstündeyse güneş, değilse ay
    this.dayclock.classList.toggle('hidden', !settings.graphics.dayCycle);
    if (settings.graphics.dayCycle) {
      const h = dayHour(g.world.time);
      const up = sunAt(h).elevation > -1;
      this.dayclock.textContent = `${up ? '☀' : '☾'} ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    }
    for (const b of this.timebar.querySelectorAll<HTMLButtonElement>('button')) {
      const sp = Number(b.dataset.speed);
      b.classList.toggle('active', sp === g.timeScale);
      // Boş yolda otomatik 2×: 1× düğmesi "2×" olur, rengi değişir
      if (sp === 1) {
        const auto = g.autoFast.active && g.timeScale === 1;
        if (auto !== b.classList.contains('auto')) {
          b.classList.toggle('auto', auto);
          b.textContent = auto ? '2×' : '1×';
          b.title = auto
            ? L('Boş yol: otomatik 2× (çatışma ve görevde 1×) · Ayarlar\'dan kapatılır', 'Open road: automatic 2× (1× in combat and missions) · can be turned off in Settings')
            : '1';
        }
      }
    }
    const now = performance.now();
    if (now < this.throttle) return;
    this.throttle = now + 140;
    this.renderInfo();
    this.notifyReports();
    this.renderMissions();
    this.renderLog();
    this.renderHint();
    this.renderResearch();
    this.renderMoney();
  }

  /** Hazine: kasa, son bir dakikanın geliri, maden üretimi. */
  private renderMoney(): void {
    const w = this.game.world;
    this.moneyChip.classList.toggle('hidden', !w.economyEnabled);
    if (!w.economyEnabled) return;
    const me = this.game.playerTeam;
    const t = w.teams[me];
    const rate = w.incomeRate(me);
    this.moneyChip.innerHTML = `<div class="mc-top"><span class="mc-coin">◈</span><b>${fmtMoney(t.money)}</b></div>
      <div class="mc-sub"><span class="pos">+${fmtMoney(rate)}/${L('dk', 'min')}</span><span class="muted-ink">${L('maden', 'mines')} ${fmtMoney(w.mineRate(me))}/${L('dk', 'min')}</span></div>`;
  }

  private renderResearch(): void {
    const r = this.game.world.teams[this.game.playerTeam]?.research;
    if (!r) return;
    const line = (k: 'tech' | 'vehicle' | 'defense', label: string) => {
      const c = r.slots[k].current;
      const wt = r.waiting[k];
      if (!c && wt) return `<div class="rc-line" title="${L('Sıradaki araştırmanın parası birikince başlar', 'The next project starts once its cost is saved up')}"><span class="muted-ink">${label}</span><span class="warn-ink">${L('para bekleniyor', 'awaiting funds')} · ${esc(techName(TECH_BY_ID[wt]))}</span></div>`;
      const q0 = r.slots[k].queue[0];
      if (!c && q0) return `<div class="rc-line" title="${L('Sıradaki iş önkoşullarını bekliyor', 'The next project is waiting for its prerequisites')}"><span class="muted-ink">${label}</span><span class="rc-name muted-ink">${L('sırada', 'queued')} · ${esc(techName(TECH_BY_ID[q0]))}</span></div>`;
      if (!c) return `<div class="rc-line"><span class="muted-ink">${label}</span><span class="muted-ink">${L('boşta', 'idle')}</span></div>`;
      return `<div class="rc-line"><span class="muted-ink">${label}</span><span class="rc-name">${esc(techName(TECH_BY_ID[c.id]))}</span></div>${bar(c.progress * 100, 'var(--accent)', true)}`;
    };
    const w = this.game.world;
    const p = w.teams[this.game.playerTeam].personnel;
    const crew = w.personnelEnabled
      ? `<div class="rc-line" title="${L('Evler personel barındırır (1 ev = 4 kişi). Uçaklar mürettebatı kadar kişiyle kalkar.', 'Houses hold personnel (1 house = 4 people). An aircraft takes off only with its full crew.')}"><span class="muted-ink">${L('Personel', 'Personnel')}</span><span class="${w.crewFree(this.game.playerTeam) <= 0 ? 'bad' : ''}">${w.crewFree(this.game.playerTeam)} ${L('boşta', 'free')} · ${p.people}/${p.capacity}</span></div>`
      : '';
    this.researchChip.innerHTML = `${line('tech', L('Teknoloji', 'Technology'))}${line('vehicle', L('Araç', 'Aircraft'))}${line('defense', L('Savunma', 'Defence'))}
      <div class="rc-line"><span class="muted-ink">${L('Savaş puanı', 'War points')}</span><span class="${r.boosting ? 'rc-boost' : ''}">${nf.format(r.points)}${r.boosting ? ' · ×2' : ''}</span></div>${crew}`;
  }

  private row(f: InfoField, k: string, v: string): string {
    return settings.info[f] ? `<span>${k}</span><span>${v}</span>` : '';
  }

  private renderInfo(): void {
    const ac = this.game.selectedAircraft;
    if (!ac) {
      this.info.innerHTML = `
        <div class="info-empty">
          <div class="info-title">${L('Seçim yok', 'Nothing selected')}</div>
          <p class="muted">${L(
            'Uçağa tıkla ya da <b>Tab</b> ile gez. Üsse tıklayıp <b>görev planla</b>. <b>F</b> takip, <b>B</b> inşa, <b>T</b> araştırma, <b>V</b> ayarlar, <b>N</b> ses.',
            'Click an aircraft or cycle with <b>Tab</b>. Click a base to <b>plan a mission</b>. <b>F</b> follow, <b>B</b> build, <b>T</b> research, <b>V</b> settings, <b>N</b> sound.',
          )}</p>
        </div>`;
      return;
    }
    const s = ac.spec;
    const gen = generationInfo(s.generation);
    const own = ac.team === this.game.playerTeam;
    const fl = ac.flight;
    const hpPct = Math.max(0, (ac.hp / ac.hpMax) * 100);
    const status = ac.status === 'falling' ? L('Vuruldu, düşüyor', 'Hit, going down') : ac.brain.status;
    const warn = ac.groundAvoid ? ` <span class="warn">${L('YER! Toparlanıyor', 'GROUND! Pulling up')}</span>` : '';
    const agl = ac.pos.y - groundLevel(ac.pos.x, ac.pos.z);
    const d = ac.damage;
    const dmg: string[] = [];
    d.engines.forEach((e, i) => {
      if (e > 0.05) dmg.push(`${d.engines.length > 1 ? L(`${i + 1}. motor`, `engine ${i + 1}`) : L('Motor', 'Engine')} ${pct(e)}`);
    });
    if (d.fire > 0) dmg.push(`<b class="bad">${L('YANGIN', 'FIRE')}</b>`);
    if (d.fuelLeak > 0.05) dmg.push(L('yakıt sızıntısı', 'fuel leak'));
    if (d.coolant > 0) dmg.push(`${L('hararet', 'overheat')} ${pct(d.heat)}`);
    if (d.controls > 0.05) dmg.push(`${L('kumanda', 'controls')} ${pct(d.controls)}`);
    if (d.wings > 0.05) dmg.push(`${L('kanat', 'wings')} ${pct(d.wings)}`);
    const burn = currentFuelFlow(ac) + d.fuelLeak * s.cruiseFlow;
    const fuelMin = ac.totalFuel / Math.max(burn, 1e-4) / 60;
    const stores: string[] = [];
    for (const sl of ac.stores.slots) if (sl.n > 0) stores.push(`${sl.n} × ${sl.store.short}`);
    const turretAmmo = ac.turrets.reduce((a, t) => a + t.ammo, 0);
    const ammo = [
      ac.guns.length ? `${pct(ac.ammoFrac)} · ${lower(ac.belt.name)}` : '',
      ac.turrets.length ? `${L('taret', 'turrets')} ${turretAmmo}` : '',
    ].filter(Boolean).join(' · ') || '—';
    const ctl = ac.controls;
    const wep = ac.engine.wep ? `${L('acil güç', 'WEP')} (${Math.round((WEP_LIMIT - ac.wepTime) / 60)} ${L('dk', 'min')})` : '';
    const ab = ac.engine.afterburner ? L('art yakıcı', 'afterburner') : '';
    const extras = [wep, ab, ctl.flaps ? L('flap', 'flaps') : '', ctl.diveBrake ? L('pike freni', 'dive brakes') : '', ctl.brake ? L('fren', 'brakes') : ''].filter(Boolean).join(', ');
    const spool = s.engine.kind === 'jet' ? ` · ${L('devir', 'rpm')} ${pct(ac.engine.spool)}` : '';
    const role = fl ? (fl.wingLeaderOf(ac) ? L('kanat adamı', 'wingman') : ac.slot === 0 ? L('lider', 'leader') : L('eleman lideri', 'element lead')) : '';
    const flightTxt = fl
      ? `${fl.name} · ${role}${ac.brain.detached ? ` (${L('koptu', 'detached')}: ${ac.brain.detachReason})` : ''} · ${FORMATION_NAMES[fl.plan.formation]}`
      : '—';
    const task = fl?.plan.task && fl.plan.task !== 'auto' ? ` (${TASK_NAMES[fl.plan.task]})` : '';
    let missionTxt = fl ? `${MISSION_NAMES[fl.plan.type]}${task} · ${PHASE_NAMES[fl.phase]}` : '—';
    if (ac.brain.ops.mode === 'landing') missionTxt += ` · ${STAGE_NAMES[ac.brain.ops.stage]}`;
    if (ac.onGround && ac.brain.ops.mode === 'takeoff') missionTxt += ` · ${L('kalkış', 'takeoff')}`;
    const pilot = `${skillName(ac.skill)}${d.pilot === 1 ? L(', yaralı', ', wounded') : ''}${ac.fatigue > 0.25 ? `, ${L('yorgun', 'fatigue')} ${pct(ac.fatigue)}` : ''}`;
    const following = this.game.renderer.rig.following;

    this.info.innerHTML = `
      <div class="info-title"><span class="dot" style="background:${PALETTE.teamCss[ac.team]}"></span>${esc(ac.callsign)}<span class="abbr">${s.abbr}</span></div>
      <div class="badges"><span class="badge">${esc(s.name)}</span><span class="badge">${gen.label}</span><span class="badge">${ROLE_NAMES[s.role]}</span>${own ? '' : `<span class="badge enemy">${L('düşman', 'enemy')}</span>`}</div>
      ${settings.info.status ? `<div class="status">${esc(status)}${warn}</div>` : ''}
      <div class="kv">
        ${this.row('flight', L('Kol', 'Flight'), esc(flightTxt))}
        ${this.row('mission', L('Görev', 'Mission'), esc(missionTxt))}
        ${this.row('speed', L('Hız', 'Speed'), `${nf.format(ac.speed * 3.6)} km/${L('sa', 'h')} · ${L('gösterge', 'IAS')} ${nf.format(iasOf(ac) * 3.6)} · M ${machOf(ac).toFixed(2)}`)}
        ${this.row('alt', L('İrtifa', 'Altitude'), `${nf.format(ac.pos.y)} m`)}
        ${this.row('agl', L('Yerden', 'Above ground'), `${nf.format(Math.max(0, agl))} m`)}
        ${this.row('g', L('Yük', 'Load'), `${ac.n.toFixed(1)} G`)}
        ${this.row('heading', L('Yön', 'Heading'), `${String(Math.round(ac.headingDeg)).padStart(3, '0')}°`)}
        ${this.row('attitude', L('Yatış / yunuslama', 'Bank / pitch'), `${Math.round(ac.bankDeg)}° / ${Math.round(ac.pitchDeg)}°`)}
        ${this.row('throttle', L('Gaz', 'Throttle'), `${pct(ctl.throttle)}${spool}${extras ? ` · ${extras}` : ''}`)}
        ${this.row('fuel', L('Yakıt', 'Fuel'), `${nf.format(ac.totalFuel)} kg · ~${Math.round(fuelMin)} ${L('dk', 'min')}`)}
        ${this.row('mass', L('Kütle', 'Mass'), `${nf.format(ac.mass)} kg`)}
        ${this.row('ammo', L('Mühimmat', 'Ammo'), ammo)}
        ${this.row('stores', L('Dış yük', 'Stores'), stores.join(', ') || '—')}
        ${this.row('damage', L('Hasar', 'Damage'), dmg.join(', ') || L('yok', 'none'))}
        ${this.row('pilot', L('Pilot', 'Pilot'), pilot)}
        ${this.row('kills', L('Düşürülen', 'Kills'), String(ac.kills + (ac.airframe?.kills ?? 0)))}
      </div>
      <div class="hp"><span>${L('Gövde sağlamlığı', 'Airframe integrity')}</span>${bar(hpPct, hpColor(hpPct))}</div>
      <div class="btn-row">
        <button class="${following ? 'active' : ''}" data-act="follow">${following ? L('Takibi bırak', 'Stop following') : L('Takip et', 'Follow')}<span class="kbd"> (F)</span></button>
        ${own && fl && fl.phase !== 'landing' && fl.phase !== 'rtb' ? `<button data-act="rtb">${L('Kolu geri çağır', 'Recall flight')}</button>` : ''}
      </div>`;
  }

  private visibleLog(): typeof this.game.world.logs {
    const g = this.game;
    const me = g.playerTeam;
    return g.world.logs.filter((l) => {
      if (!settings.log[l.cat]) return false;
      // Rakibin iç işleri (inşaat, araştırma, kol hareketleri) görünmez
      if (l.team !== null && l.team !== me && (l.cat === 'build' || l.cat === 'research' || l.cat === 'ops' || l.cat === 'defense' || l.cat === 'info')) return false;
      return true;
    });
  }

  /** Aktif görevler: oyuncunun kolları (paketler birlikte), aşama, kalan uçak, yakıt, hedef. */
  private renderMissions(): void {
    const now = performance.now();
    if (now < this.nextMissions) return;
    this.nextMissions = now + 450;
    const g = this.game;
    const w = g.world;
    const flights = w.flights.filter((f) => f.team === g.playerTeam && f.phase !== 'done');
    const selFl = g.selectedAircraft?.flight?.id ?? -1;
    const fuelOf = (f: (typeof flights)[number]) => {
      const al = f.alive;
      return al.length ? Math.min(...al.map((a) => a.totalFuel / a.fuelCap)) : 0;
    };
    const reports = w.missionReports.filter((r) => r.team === g.playerTeam).slice(-6).reverse();
    const key = flights.map((f) => `${f.id}:${f.phase}:${f.alive.length}:${f.engaged ? 1 : 0}:${Math.round(fuelOf(f) * 20)}`).join('|') + `#${selFl}#${reports[0]?.id ?? 0}`;
    this.missionCount.textContent = flights.length ? String(flights.length) : '';
    if (key === this.lastMissionKey) return;
    this.lastMissionKey = key;
    // Biten görevler: sonuç, neden ve ödül
    const done = reports.length ? `<div class="mrep-h">${L('Son görevler', 'Recent missions')}</div>${reports.map((r) => {
      const cls = r.outcome === 'success' ? 'ok' : r.outcome === 'fail' ? 'bad' : 'none';
      const icon = r.outcome === 'success' ? '✓' : r.outcome === 'fail' ? '✗' : '–';
      return `<div class="mrep ${cls}"><span class="mrep-i">${icon}</span><div><div class="mrep-t"><b>${esc(r.flight)}</b> ${MISSION_NAMES[r.type]}${r.reward > 0 ? ` <b class="pos">+${fmtMoney(r.reward)}</b>` : ''}</div>
        <small>${esc(r.reason)} · ${esc(r.aircraft)} · ${fmtStamp(r)}</small></div></div>`;
    }).join('')}` : '';
    if (!flights.length) {
      this.missions.innerHTML = `<p class="muted small">${L('Havada görev yok. Bir hava üssünü seçip görev planla', 'No missions in the air. Select an airbase and plan one')}<span class="kbd"> (P)</span>.</p>` + done;
      return;
    }
    const targetName = (f: (typeof flights)[number]): string => {
      const p = f.plan;
      if (p.targetStructureId !== null) return w.structureById(p.targetStructureId)?.name ?? '';
      if (p.targetAircraftId !== null) {
        const a = w.aircraftById(p.targetAircraftId);
        return a ? `${a.flight?.name ?? a.callsign} (${a.spec.abbr})` : L('hedef', 'target');
      }
      if (p.targetFlightId !== null) return L(`${w.flightById(p.targetFlightId)?.name ?? ''} kolu`, `${w.flightById(p.targetFlightId)?.name ?? ''} flight`);
      if (p.targetBaseId !== null) return w.structureById(p.targetBaseId)?.name ?? '';
      return p.targetPos ? L('devriye bölgesi', 'patrol area') : '';
    };
    const row = (f: (typeof flights)[number]) => {
      const lead = f.members[0];
      const fuel = Math.round(fuelOf(f) * 100);
      const recall = f.phase !== 'landing' && f.phase !== 'rtb' && f.phase !== 'ground';
      return `<div class="mrow ${f.id === selFl ? 'sel' : ''} ${f.engaged ? 'hot' : ''}" data-fl="${f.id}">
        <div class="mr-top"><span class="mi">${MISSION_ICONS[f.plan.type]}</span><b>${f.name}</b><span class="mr-n">${f.alive.length}/${f.expected} ${esc(lead?.spec.abbr ?? '')}</span><span class="ph ph-${f.phase}">${PHASE_NAMES[f.phase]}</span></div>
        <div class="mr-sub">${MISSION_NAMES[f.plan.type]}${f.plan.task && f.plan.task !== 'auto' ? ` (${TASK_NAMES[f.plan.task]})` : ''}${targetName(f) ? ` → ${esc(targetName(f))}` : ''}${f.alive.length ? ` · ${L('yakıt', 'fuel')} ${pct(fuel / 100)}` : ''}${f.engaged ? ` · <b class="bad">${L('çatışmada', 'engaged')}</b>` : ''}</div>
        ${f.alive.length ? `<div class="mr-fuel">${bar(fuel, fuel < 30 ? 'var(--red)' : fuel < 50 ? 'var(--warn)' : 'var(--accent)', true)}</div>` : ''}
        <div class="mr-act"><button class="mini" data-mact="follow">${L('Takip', 'Follow')}</button>${recall ? `<button class="mini" data-mact="rtb">${L('Geri çağır', 'Recall')}</button>` : ''}</div>
      </div>`;
    };
    // Paket kolları birlikte
    const groups = new Map<string, typeof flights>();
    for (const f of flights) {
      const k = f.packageId ? `p${f.packageId}` : `f${f.id}`;
      const list = groups.get(k) ?? [];
      list.push(f);
      groups.set(k, list);
    }
    this.missions.innerHTML = [...groups.values()].map((list) => list.length > 1
      ? `<div class="mpk"><div class="mpk-h">${L('Paket', 'Package')} · ${MISSION_NAMES[list[0].plan.type]}${targetName(list[0]) ? ` → ${esc(targetName(list[0]))}` : ''}</div>${list.map(row).join('')}</div>`
      : row(list[0])).join('') + done;
  }

  private renderLog(): void {
    const logs = this.visibleLog();
    const key = `${logs.length}:${logs[logs.length - 1]?.time ?? 0}:${JSON.stringify(settings.log)}`;
    if (key === this.lastLogKey) return;
    this.lastLogKey = key;
    const rows = logs.slice(-40).reverse();
    this.log.innerHTML = rows
      .map((l) => `<div class="log-row ${l.team !== null ? `b${l.team}` : ''} c-${l.cat}"><span class="t">${fmtStamp(l)}</span>${esc(l.text)}</div>`)
      .join('');
  }

  private renderHint(): void {
    const it = this.game.interaction;
    const touch = this.game.renderer.rig.lastTouch;
    const btn = (act: string, label: string, on = true) => `<button data-hint="${act}" ${on ? '' : 'disabled'}>${label}</button>`;
    let html: string;
    if (it.mode === 'build') {
      const msg = it.ok
        ? (touch ? L('Uygun yer', 'Good spot') : L('Uygun yer — tıkla ve inşa et', 'Good spot — click to build'))
        : it.reason ?? (touch ? L('Yer seçmek için haritaya dokun', 'Tap the map to choose a spot') : L('Yer seç', 'Choose a spot'));
      html = `<span>${esc(msg)}${touch ? '' : L(' · R: döndür · Sağ tık / Esc: iptal', ' · R: rotate · Right click / Esc: cancel')}</span>${btn('rotate', L('↻ Döndür', '↻ Rotate'))}${btn('place', L('✓ Yerleştir', '✓ Place'), it.ok)}${btn('cancel', L('✕ İptal', '✕ Cancel'))}`;
    } else if (it.mode === 'pickTarget') {
      const pick = this.game.planner.pickHint();
      html = `<span>${esc(touch ? pick.replace(/tıkla/g, 'dokun').replace(/\bclick/g, 'tap').replace(/\bClick/g, 'Tap') : pick)}${touch ? '' : L(' · Sağ tık / Esc: iptal', ' · Right click / Esc: cancel')}</span>${btn('cancel', L('✕ İptal', '✕ Cancel'))}`;
    } else if (it.mode === 'pickWaypoint') {
      html = `<span>${touch
        ? L('Ara nokta eklemek için haritaya dokun (birden çok eklenebilir)', 'Tap the map to add waypoints (you can add several)')
        : L('Ara nokta eklemek için haritaya tıkla (birden çok eklenebilir)', 'Click the map to add waypoints (you can add several)')}</span>${btn('cancel', L('✓ Bitir', '✓ Done'))}`;
    } else {
      html = touch
        ? `<span>${L('Dokun: seç · Sürükle: kaydır · İki parmak: yakınlaş, çevir, eğ · Çift dokun: takip', 'Tap: select · Drag: pan · Two fingers: zoom, rotate, tilt · Double tap: follow')}</span>`
        : `<span>${L(
          'Tık: seç · Sürükle: kaydır · Sağ sürükle: döndür · Tekerlek: yakınlaş · F: takip · Tab: sıradaki · Boşluk: duraklat · 1-6: hız · T: araştırma',
          'Click: select · Drag: pan · Right drag: rotate · Wheel: zoom · F: follow · Tab: next · Space: pause · 1-6: speed · T: research',
        )}</span>`;
    }
    // Her karede yeniden yazılırsa düğmeye dokunuş kaçıyor
    if (html === this.lastHint) return;
    this.lastHint = html;
    this.hint.innerHTML = html;
    this.hint.classList.toggle('pick', it.mode !== 'none');
    this.hint.classList.toggle('bad', it.mode === 'build' && !it.ok);
  }
}

export function aircraftLine(ac: Aircraft): string {
  return `${ac.callsign} ${ac.spec.abbr}`;
}
