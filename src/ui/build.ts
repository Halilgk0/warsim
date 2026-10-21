// İnşa çubuğu: askerî tesisler, şehir yapıları ve ekonomi (maden ocağı). Yapı seç, haritada yerleşim hayaletiyle yer bul, tıkla.
// Para kuralları açıkken her kartta maliyet görünür; parası yetmeyen kart soluk durur.

import type { Game } from '../game';
import {
  CITY_KINDS, ECONOMY_KINDS, MILITARY_KINDS, STRUCTURE_DEFS, STRUCT_GLYPH, type StructureCategory, type StructureKind,
} from '../sim/structures/structure';
import { TECH_BY_ID } from '../sim/tech';
import { fmtMoney } from '../sim/economy';
import { $, esc, fmtDur, nf } from './dom';

export class BuildBar {
  isOpen = false;
  private el = $('buildbar');
  private next = 0;
  private tab: StructureCategory = 'military';

  constructor(private readonly game: Game) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLButtonElement>('button[data-kind]');
      if (b) {
        game.beginBuild(b.dataset.kind as StructureKind);
        this.render();
        return;
      }
      const tab = t.closest<HTMLButtonElement>('button[data-tab]');
      if (tab) {
        this.tab = tab.dataset.tab as StructureCategory;
        this.render();
        return;
      }
      if (t.closest('[data-act="close"]')) this.close();
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(tab?: StructureCategory): void {
    if (tab) this.tab = tab;
    this.isOpen = true;
    this.el.classList.remove('hidden');
    this.game.planner.close();
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.el.classList.add('hidden');
    if (this.game.interaction.mode === 'build') {
      this.game.interaction = { mode: 'none' };
      this.game.renderer.ghost = null;
    }
  }

  update(): void {
    if (!this.isOpen) return;
    const now = performance.now();
    if (now < this.next) return;
    this.next = now + 500;
    this.render();
  }

  private render(): void {
    const g = this.game;
    const w = g.world;
    const team = w.teams[g.playerTeam];
    const mine = w.structures.filter((s) => s.team === g.playerTeam && !s.destroyed);
    const busy = (cat: StructureCategory) => mine.filter((s) => s.build < 1 && s.def.category === cat).length;
    const active = g.interaction.mode === 'build' ? g.interaction.kind : null;
    const kinds = this.tab === 'city' ? CITY_KINDS : this.tab === 'economy' ? ECONOMY_KINDS : MILITARY_KINDS;
    const econ = w.economyEnabled;
    const cards = kinds.map((k) => {
      const d = STRUCTURE_DEFS[k];
      const locked = d.requires && !team.research.has(d.requires);
      const count = mine.filter((s) => s.kind === k).length;
      const cost = w.structureCost(g.playerTeam, k);
      const poor = econ && team.money < cost;
      const costHtml = econ ? `<span class="cost ${poor ? 'no' : ''}">${fmtMoney(cost)}</span>` : '';
      const stats = [
        `${fmtDur(d.buildTime)}`,
        `${Math.round(d.halfW * 2)}×${Math.round(d.halfL * 2)} m`,
        d.population ? `${d.population} kişi` : '',
        d.jobs ? `iş ${d.jobs}` : '',
      ].filter(Boolean).join(' · ');
      return `<button class="bcard ${active === k ? 'active' : ''} ${poor ? 'poor' : ''}" data-kind="${k}" ${locked ? 'disabled' : ''} title="${esc(d.desc)}${poor ? ' — para yetmiyor' : ''}">
        <span class="btop"><span class="bicon">${STRUCT_GLYPH[k]}</span>${costHtml}${count ? `<span class="bcount">${count}</span>` : ''}</span>
        <b>${d.name}</b>
        <small>${locked ? `Araştırma: ${esc(TECH_BY_ID[d.requires!].name)}` : stats}</small>
        <small class="bdesc">${esc(d.desc)}</small>
      </button>`;
    }).join('');
    const city = mine.filter((s) => s.def.category === 'city' && s.active);
    const pop = city.reduce((a, s) => a + (s.def.population ?? 0), 0);
    const jobs = city.reduce((a, s) => a + (s.def.jobs ?? 0), 0);
    const pers = w.teams[g.playerTeam].personnel;
    const mines = mine.filter((s) => s.kind === 'mine');
    const info = this.tab === 'economy'
      ? `${econ ? `Hazine <b>${fmtMoney(team.money)}</b> · maden üretimi <b>${fmtMoney(w.mineRate(g.playerTeam))}/dk</b> · ` : ''}${mines.length} ocak. Damarın verimi yere göre çok değişir ve ocak kurulana dek bilinmez; ocaklar arası en az 2,5 km. Her yeni ocak %30 daha pahalı. Aynı anda 2 ekonomi inşaatı.`
      : this.tab === 'city'
      ? `Personel <b>${w.personnelEnabled ? `${w.crewFree(g.playerTeam)} boşta / ${pers.capacity}` : nf.format(pop)}</b> · iş yeri <b>${nf.format(jobs)}</b> · ${city.length} yapı. Ev 4, apartman 16 kişi barındırır; kurmaya devam etmek için yer seçmeyi sürdür<span class="kbd"> (Esc bitirir)</span>. Aynı anda 4 şehir inşaatı ilerler (şu an ${busy('city')}).`
      : `Kendi bölgende (yapılarına 30 km) düz ve kuru bir yer seç; R ile döndür. Fabrikayı üs panelinden üssün yanına da kurabilirsin. Aynı anda en fazla 3 askerî inşaat (şu an ${busy('military')}).`;
    // Yer seçerken kartlar dar ekranda gizlenir (harita görünsün; kontroller alt çubukta)
    this.el.classList.toggle('placing', !!active);
    this.el.innerHTML = `
      <div class="bhead">
        <div class="tabs slim">
          <button class="${this.tab === 'military' ? 'active' : ''}" data-tab="military">Askerî</button>
          <button class="${this.tab === 'city' ? 'active' : ''}" data-tab="city">Şehir</button>
          <button class="${this.tab === 'economy' ? 'active' : ''}" data-tab="economy">Ekonomi</button>
        </div>
        <span class="muted small">${info}</span>
        <button class="icon" data-act="close">✕</button>
      </div>
      <div class="bcards ${this.tab}">${cards}</div>`;
  }
}
