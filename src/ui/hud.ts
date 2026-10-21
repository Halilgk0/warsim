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
import { settings, type InfoField } from './settings';
import { toggleFullscreen } from './fullscreen';
import { $, bar, esc, fmtTime, hpColor, nf } from './dom';

export function skillName(skill: number): string {
  if (skill > 1.25) return 'As';
  if (skill > 1.0) return 'Tecrübeli';
  if (skill > 0.8) return 'Ortalama';
  return 'Acemi';
}

const STAGE_NAMES: Record<string, string> = {
  hold: 'bekleme', toIaf: 'yaklaşma', final: 'son yaklaşma', flare: 'düzleştirme', rollout: 'iniş koşusu',
};

export class Hud {
  private info = $('info');
  private log = $('log');
  private clock = $('clock');
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
      else if (what === 'build') game.build.toggle();
      else if (what === 'pause') game.pause.open();
      else game.modals.open(what as 'scenarios' | 'research' | 'settings' | 'market');
    });
    this.researchChip.addEventListener('click', () => game.modals.open('research'));
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
      const word = r.outcome === 'success' ? 'başarılı' : r.outcome === 'fail' ? 'başarısız' : 'sonuçsuz';
      const icon = r.outcome === 'success' ? '✓' : r.outcome === 'fail' ? '✗' : '–';
      g.toast(`${icon} ${r.flight} · ${MISSION_NAMES[r.type]} ${word}${r.reward > 0 ? ` (+${fmtMoney(r.reward)})` : ''}`, r.outcome === 'fail');
    }
  }

  update(): void {
    const g = this.game;
    this.clock.textContent = fmtTime(g.world.time);
    for (const b of this.timebar.querySelectorAll<HTMLButtonElement>('button')) {
      b.classList.toggle('active', Number(b.dataset.speed) === g.timeScale);
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
      <div class="mc-sub"><span class="pos">+${fmtMoney(rate)}/dk</span><span class="muted-ink">maden ${fmtMoney(w.mineRate(me))}/dk</span></div>`;
  }

  private renderResearch(): void {
    const r = this.game.world.teams[this.game.playerTeam]?.research;
    if (!r) return;
    const line = (k: 'tech' | 'vehicle', label: string) => {
      const c = r.slots[k].current;
      const wt = r.waiting[k];
      if (!c && wt) return `<div class="rc-line" title="Sıradaki araştırmanın parası birikince başlar"><span class="muted-ink">${label}</span><span class="warn-ink">para bekleniyor · ${esc(techName(TECH_BY_ID[wt]))}</span></div>`;
      const q0 = r.slots[k].queue[0];
      if (!c && q0) return `<div class="rc-line" title="Sıradaki iş önkoşullarını bekliyor"><span class="muted-ink">${label}</span><span class="rc-name muted-ink">sırada · ${esc(techName(TECH_BY_ID[q0]))}</span></div>`;
      if (!c) return `<div class="rc-line"><span class="muted-ink">${label}</span><span class="muted-ink">boşta</span></div>`;
      return `<div class="rc-line"><span class="muted-ink">${label}</span><span class="rc-name">${esc(techName(TECH_BY_ID[c.id]))}</span></div>${bar(c.progress * 100, 'var(--accent)', true)}`;
    };
    const w = this.game.world;
    const p = w.teams[this.game.playerTeam].personnel;
    const crew = w.personnelEnabled
      ? `<div class="rc-line" title="Evler personel barındırır (1 ev = 4 kişi). Uçaklar mürettebatı kadar kişiyle kalkar."><span class="muted-ink">Personel</span><span class="${w.crewFree(this.game.playerTeam) <= 0 ? 'bad' : ''}">${w.crewFree(this.game.playerTeam)} boşta · ${p.people}/${p.capacity}</span></div>`
      : '';
    this.researchChip.innerHTML = `${line('tech', 'Teknoloji')}${line('vehicle', 'Araç')}
      <div class="rc-line"><span class="muted-ink">Savaş puanı</span><span class="${r.boosting ? 'rc-boost' : ''}">${nf.format(r.points)}${r.boosting ? ' · ×2' : ''}</span></div>${crew}`;
  }

  private row(f: InfoField, k: string, v: string): string {
    return settings.info[f] ? `<span>${k}</span><span>${v}</span>` : '';
  }

  private renderInfo(): void {
    const ac = this.game.selectedAircraft;
    if (!ac) {
      this.info.innerHTML = `
        <div class="info-empty">
          <div class="info-title">Seçim yok</div>
          <p class="muted">Uçağa tıkla ya da <b>Tab</b> ile gez. Üsse tıklayıp <b>görev planla</b>.
          <b>F</b> takip, <b>B</b> inşa, <b>T</b> araştırma, <b>V</b> görünüm ayarları.</p>
        </div>`;
      return;
    }
    const s = ac.spec;
    const gen = generationInfo(s.generation);
    const own = ac.team === this.game.playerTeam;
    const fl = ac.flight;
    const hpPct = Math.max(0, (ac.hp / ac.hpMax) * 100);
    const status = ac.status === 'falling' ? 'Vuruldu, düşüyor' : ac.brain.status;
    const warn = ac.groundAvoid ? ' <span class="warn">YER! Toparlanıyor</span>' : '';
    const agl = ac.pos.y - groundLevel(ac.pos.x, ac.pos.z);
    const d = ac.damage;
    const dmg: string[] = [];
    d.engines.forEach((e, i) => {
      if (e > 0.05) dmg.push(`${d.engines.length > 1 ? `${i + 1}. motor` : 'Motor'} %${Math.round(e * 100)}`);
    });
    if (d.fire > 0) dmg.push('<b class="bad">YANGIN</b>');
    if (d.fuelLeak > 0.05) dmg.push('yakıt sızıntısı');
    if (d.coolant > 0) dmg.push(`hararet %${Math.round(d.heat * 100)}`);
    if (d.controls > 0.05) dmg.push(`kumanda %${Math.round(d.controls * 100)}`);
    if (d.wings > 0.05) dmg.push(`kanat %${Math.round(d.wings * 100)}`);
    const burn = currentFuelFlow(ac) + d.fuelLeak * s.cruiseFlow;
    const fuelMin = ac.totalFuel / Math.max(burn, 1e-4) / 60;
    const stores: string[] = [];
    for (const sl of ac.stores.slots) if (sl.n > 0) stores.push(`${sl.n} × ${sl.store.short}`);
    const turretAmmo = ac.turrets.reduce((a, t) => a + t.ammo, 0);
    const ammo = [
      ac.guns.length ? `%${Math.round(ac.ammoFrac * 100)} · ${ac.belt.name.toLowerCase()}` : '',
      ac.turrets.length ? `taret ${turretAmmo}` : '',
    ].filter(Boolean).join(' · ') || '—';
    const ctl = ac.controls;
    const wep = ac.engine.wep ? `acil güç (${Math.round((WEP_LIMIT - ac.wepTime) / 60)} dk)` : '';
    const ab = ac.engine.afterburner ? 'art yakıcı' : '';
    const extras = [wep, ab, ctl.flaps ? 'flap' : '', ctl.diveBrake ? 'pike freni' : '', ctl.brake ? 'fren' : ''].filter(Boolean).join(', ');
    const spool = s.engine.kind === 'jet' ? ` · devir %${Math.round(ac.engine.spool * 100)}` : '';
    const role = fl ? (fl.wingLeaderOf(ac) ? 'kanat adamı' : ac.slot === 0 ? 'lider' : 'eleman lideri') : '';
    const flightTxt = fl
      ? `${fl.name} · ${role}${ac.brain.detached ? ` (koptu: ${ac.brain.detachReason})` : ''} · ${FORMATION_NAMES[fl.plan.formation]}`
      : '—';
    const task = fl?.plan.task && fl.plan.task !== 'auto' ? ` (${TASK_NAMES[fl.plan.task]})` : '';
    let missionTxt = fl ? `${MISSION_NAMES[fl.plan.type]}${task} · ${PHASE_NAMES[fl.phase]}` : '—';
    if (ac.brain.ops.mode === 'landing') missionTxt += ` · ${STAGE_NAMES[ac.brain.ops.stage]}`;
    if (ac.onGround && ac.brain.ops.mode === 'takeoff') missionTxt += ' · kalkış';
    const pilot = `${skillName(ac.skill)}${d.pilot === 1 ? ', yaralı' : ''}${ac.fatigue > 0.25 ? `, yorgun %${Math.round(ac.fatigue * 100)}` : ''}`;
    const following = this.game.renderer.rig.following;

    this.info.innerHTML = `
      <div class="info-title"><span class="dot" style="background:${PALETTE.teamCss[ac.team]}"></span>${esc(ac.callsign)}<span class="abbr">${s.abbr}</span></div>
      <div class="badges"><span class="badge">${esc(s.name)}</span><span class="badge">${gen.label}</span><span class="badge">${ROLE_NAMES[s.role]}</span>${own ? '' : '<span class="badge enemy">düşman</span>'}</div>
      ${settings.info.status ? `<div class="status">${esc(status)}${warn}</div>` : ''}
      <div class="kv">
        ${this.row('flight', 'Kol', esc(flightTxt))}
        ${this.row('mission', 'Görev', esc(missionTxt))}
        ${this.row('speed', 'Hız', `${nf.format(ac.speed * 3.6)} km/sa · gösterge ${nf.format(iasOf(ac) * 3.6)} · M ${machOf(ac).toFixed(2)}`)}
        ${this.row('alt', 'İrtifa', `${nf.format(ac.pos.y)} m`)}
        ${this.row('agl', 'Yerden', `${nf.format(Math.max(0, agl))} m`)}
        ${this.row('g', 'Yük', `${ac.n.toFixed(1)} G`)}
        ${this.row('heading', 'Yön', `${String(Math.round(ac.headingDeg)).padStart(3, '0')}°`)}
        ${this.row('attitude', 'Yatış / yunuslama', `${Math.round(ac.bankDeg)}° / ${Math.round(ac.pitchDeg)}°`)}
        ${this.row('throttle', 'Gaz', `%${Math.round(ctl.throttle * 100)}${spool}${extras ? ` · ${extras}` : ''}`)}
        ${this.row('fuel', 'Yakıt', `${nf.format(ac.totalFuel)} kg · ~${Math.round(fuelMin)} dk`)}
        ${this.row('mass', 'Kütle', `${nf.format(ac.mass)} kg`)}
        ${this.row('ammo', 'Mühimmat', ammo)}
        ${this.row('stores', 'Dış yük', stores.join(', ') || '—')}
        ${this.row('damage', 'Hasar', dmg.join(', ') || 'yok')}
        ${this.row('pilot', 'Pilot', pilot)}
        ${this.row('kills', 'Düşürülen', String(ac.kills + (ac.airframe?.kills ?? 0)))}
      </div>
      <div class="hp"><span>Gövde sağlamlığı</span>${bar(hpPct, hpColor(hpPct))}</div>
      <div class="btn-row">
        <button class="${following ? 'active' : ''}" data-act="follow">${following ? 'Takibi bırak' : 'Takip et'}<span class="kbd"> (F)</span></button>
        ${own && fl && fl.phase !== 'landing' && fl.phase !== 'rtb' ? '<button data-act="rtb">Kolu geri çağır</button>' : ''}
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
    const done = reports.length ? `<div class="mrep-h">Son görevler</div>${reports.map((r) => {
      const cls = r.outcome === 'success' ? 'ok' : r.outcome === 'fail' ? 'bad' : 'none';
      const icon = r.outcome === 'success' ? '✓' : r.outcome === 'fail' ? '✗' : '–';
      return `<div class="mrep ${cls}"><span class="mrep-i">${icon}</span><div><div class="mrep-t"><b>${esc(r.flight)}</b> ${MISSION_NAMES[r.type]}${r.reward > 0 ? ` <b class="pos">+${fmtMoney(r.reward)}</b>` : ''}</div>
        <small>${esc(r.reason)} · ${esc(r.aircraft)} · ${fmtTime(r.time)}</small></div></div>`;
    }).join('')}` : '';
    if (!flights.length) {
      this.missions.innerHTML = '<p class="muted small">Havada görev yok. Bir hava üssünü seçip görev planla<span class="kbd"> (P)</span>.</p>' + done;
      return;
    }
    const targetName = (f: (typeof flights)[number]): string => {
      const p = f.plan;
      if (p.targetStructureId !== null) return w.structureById(p.targetStructureId)?.name ?? '';
      if (p.targetAircraftId !== null) {
        const a = w.aircraftById(p.targetAircraftId);
        return a ? `${a.flight?.name ?? a.callsign} (${a.spec.abbr})` : 'hedef';
      }
      if (p.targetFlightId !== null) return `${w.flightById(p.targetFlightId)?.name ?? ''} kolu`;
      if (p.targetBaseId !== null) return w.structureById(p.targetBaseId)?.name ?? '';
      return p.targetPos ? 'devriye bölgesi' : '';
    };
    const row = (f: (typeof flights)[number]) => {
      const lead = f.members[0];
      const fuel = Math.round(fuelOf(f) * 100);
      const recall = f.phase !== 'landing' && f.phase !== 'rtb' && f.phase !== 'ground';
      return `<div class="mrow ${f.id === selFl ? 'sel' : ''} ${f.engaged ? 'hot' : ''}" data-fl="${f.id}">
        <div class="mr-top"><span class="mi">${MISSION_ICONS[f.plan.type]}</span><b>${f.name}</b><span class="mr-n">${f.alive.length}/${f.expected} ${esc(lead?.spec.abbr ?? '')}</span><span class="ph ph-${f.phase}">${PHASE_NAMES[f.phase]}</span></div>
        <div class="mr-sub">${MISSION_NAMES[f.plan.type]}${f.plan.task && f.plan.task !== 'auto' ? ` (${TASK_NAMES[f.plan.task]})` : ''}${targetName(f) ? ` → ${esc(targetName(f))}` : ''}${f.alive.length ? ` · yakıt %${fuel}` : ''}${f.engaged ? ' · <b class="bad">çatışmada</b>' : ''}</div>
        ${f.alive.length ? `<div class="mr-fuel">${bar(fuel, fuel < 30 ? 'var(--red)' : fuel < 50 ? 'var(--warn)' : 'var(--accent)', true)}</div>` : ''}
        <div class="mr-act"><button class="mini" data-mact="follow">Takip</button>${recall ? '<button class="mini" data-mact="rtb">Geri çağır</button>' : ''}</div>
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
      ? `<div class="mpk"><div class="mpk-h">Paket · ${MISSION_NAMES[list[0].plan.type]}${targetName(list[0]) ? ` → ${esc(targetName(list[0]))}` : ''}</div>${list.map(row).join('')}</div>`
      : row(list[0])).join('') + done;
  }

  private renderLog(): void {
    const logs = this.visibleLog();
    const key = `${logs.length}:${logs[logs.length - 1]?.time ?? 0}:${JSON.stringify(settings.log)}`;
    if (key === this.lastLogKey) return;
    this.lastLogKey = key;
    const rows = logs.slice(-40).reverse();
    this.log.innerHTML = rows
      .map((l) => `<div class="log-row ${l.team !== null ? `b${l.team}` : ''} c-${l.cat}"><span class="t">${fmtTime(l.time)}</span>${esc(l.text)}</div>`)
      .join('');
  }

  private renderHint(): void {
    const it = this.game.interaction;
    const touch = this.game.renderer.rig.lastTouch;
    const btn = (act: string, label: string, on = true) => `<button data-hint="${act}" ${on ? '' : 'disabled'}>${label}</button>`;
    let html: string;
    if (it.mode === 'build') {
      const msg = it.ok ? (touch ? 'Uygun yer' : 'Uygun yer — tıkla ve inşa et') : it.reason ?? (touch ? 'Yer seçmek için haritaya dokun' : 'Yer seç');
      html = `<span>${esc(msg)}${touch ? '' : ' · R: döndür · Sağ tık / Esc: iptal'}</span>${btn('rotate', '↻ Döndür')}${btn('place', '✓ Yerleştir', it.ok)}${btn('cancel', '✕ İptal')}`;
    } else if (it.mode === 'pickTarget') {
      const pick = this.game.planner.pickHint();
      html = `<span>${esc(touch ? pick.replace(/tıkla/g, 'dokun') : pick)}${touch ? '' : ' · Sağ tık / Esc: iptal'}</span>${btn('cancel', '✕ İptal')}`;
    } else if (it.mode === 'pickWaypoint') {
      html = `<span>Ara nokta eklemek için haritaya ${touch ? 'dokun' : 'tıkla'} (birden çok eklenebilir)</span>${btn('cancel', '✓ Bitir')}`;
    } else {
      html = touch
        ? '<span>Dokun: seç · Sürükle: kaydır · İki parmak: yakınlaş, çevir, eğ · Çift dokun: takip</span>'
        : '<span>Tık: seç · Sürükle: kaydır · Sağ sürükle: döndür · Tekerlek: yakınlaş · F: takip · Tab: sıradaki · Boşluk: duraklat · 1-6: hız · T: araştırma</span>';
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
