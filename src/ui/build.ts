// İnşa çubuğu: askerî tesisler, şehir yapıları ve ekonomi (maden ocağı). Yapı seç, haritada yerleşim hayaletiyle yer bul, tıkla.
// Para kuralları açıkken her kartta maliyet görünür; parası yetmeyen kart soluk durur.

import type { Game } from '../game';
import {
  CITY_KINDS, ECONOMY_KINDS, MILITARY_KINDS, STRUCTURE_DEFS, STRUCT_GLYPH, type StructureCategory, type StructureKind,
} from '../sim/structures/structure';
import { TECH_BY_ID } from '../sim/tech';
import { HOUSE_INCOME, ROAD_COST, fmtMoney } from '../sim/economy';
import { ROAD_MAX, TOWN_ROAD } from '../sim/roads';
import { $, esc, fmtDur, nf } from './dom';
import { L, count } from '../i18n';

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
        if (b.dataset.kind === 'road') game.beginRoad();
        else if (b.dataset.kind === 'roaddel') game.beginRoad(true);
        else game.beginBuild(b.dataset.kind as StructureKind);
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
    if (this.game.interaction.mode === 'build' || this.game.interaction.mode === 'road') {
      this.game.interaction = { mode: 'none' };
      this.game.renderer.ghost = null;
      this.game.renderer.roadGhost = null;
      this.game.renderer.gridFrame = null;
    }
  }

  /** Kip dışarıdan değişince (panelden "Yol ekle") kartları yeniden çiz. */
  refresh(): void {
    if (this.isOpen) this.render();
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
    const active = g.interaction.mode === 'build' ? g.interaction.kind : g.interaction.mode === 'road' ? (g.interaction.del ? 'roaddel' : 'road') : null;
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
        d.population ? L(`${d.population} kişi`, `${d.population} people`) : '',
        HOUSE_INCOME[k] ? `+${HOUSE_INCOME[k]} kr/${L('dk', 'min')}` : '',
        k === 'park' ? L('evlere +%10 kira', 'houses +10% rent') : '',
        k === 'townhall' ? L(`${TOWN_ROAD} m cadde`, `${TOWN_ROAD} m street`) : '',
        k === 'firestation' ? L('4 boşta personel', '4 free personnel') : '',
        d.jobs ? L(`iş ${d.jobs}`, `${d.jobs} jobs`) : '',
      ].filter(Boolean).join(' · ');
      return `<button class="bcard ${active === k ? 'active' : ''} ${poor ? 'poor' : ''}" data-kind="${k}" ${locked ? 'disabled' : ''} title="${esc(d.desc)}${poor ? L(' — para yetmiyor', ' — not enough money') : ''}">
        <span class="btop"><span class="bicon">${STRUCT_GLYPH[k]}</span>${costHtml}${count ? `<span class="bcount">${count}</span>` : ''}</span>
        <b>${d.name}</b>
        <small>${locked ? `${L('Araştırma', 'Research')}: ${esc(TECH_BY_ID[d.requires!].name)}` : stats}</small>
        <small class="bdesc">${esc(d.desc)}</small>
      </button>`;
    });
    // Yol: yapı değil, iki noktayla çizilir (belediye kartından sonra)
    if (this.tab === 'city') {
      const roads = w.roads.filter((r) => r.team === g.playerTeam);
      const desc = L('Mevcut bir yoldan başlayan sokak çiz: başlangıcı ve ucu seç. Evler ancak yolların yanına kurulur.',
        'Draw a street from an existing road: pick its start and its end. Houses can only be built beside roads.');
      cards.splice(1, 0, `<button class="bcard ${active === 'road' ? 'active' : ''}" data-kind="road" ${roads.length ? '' : 'disabled'} title="${esc(desc)}">
        <span class="btop"><span class="bicon">═</span>${econ ? `<span class="cost">${ROAD_COST} kr/m</span>` : ''}${roads.length ? `<span class="bcount">${roads.length}</span>` : ''}</span>
        <b>${L('Yol', 'Road')}</b>
        <small>${roads.length ? L(`hemen biter · en çok ${ROAD_MAX} m`, `built at once · up to ${ROAD_MAX} m`) : L('önce belediye binası', 'town hall first')}</small>
        <small class="bdesc">${esc(desc)}</small>
      </button>`);
      // Yol kaldırma (2026-11-20): belediyenin ana caddesi dışındaki yollar; bedelin yarısı iade
      const ddesc = L('Bir yol parçasını kaldır: bedelinin yarısı geri döner. Belediyenin ana caddesi kalkmaz; yanındaki evler yerinde kalır.',
        "Remove a piece of road: half its cost comes back. The town hall's main street stays; houses beside it stay too.");
      cards.splice(2, 0, `<button class="bcard ${active === 'roaddel' ? 'active' : ''}" data-kind="roaddel" ${roads.length > 1 ? '' : 'disabled'} title="${esc(ddesc)}">
        <span class="btop"><span class="bicon">⌫</span>${econ ? `<span class="cost">%50 ${L('iade', 'refund')}</span>` : ''}</span>
        <b>${L('Yol kaldır', 'Remove road')}</b>
        <small>${roads.length > 1 ? L('dokun ve kaldır', 'tap and remove') : L('kaldırılacak yol yok', 'no road to remove')}</small>
        <small class="bdesc">${esc(ddesc)}</small>
      </button>`);
    }
    const cardsHtml = cards.join('');
    const city = mine.filter((s) => s.def.category === 'city' && s.active);
    const pop = city.reduce((a, s) => a + (s.def.population ?? 0), 0);
    const pers = w.teams[g.playerTeam].personnel;
    const mines = mine.filter((s) => s.kind === 'mine');
    const info = this.tab === 'economy'
      ? (econ ? L(`Hazine <b>${fmtMoney(team.money)}</b> · maden üretimi <b>${fmtMoney(w.mineRate(g.playerTeam))}/dk</b> · `, `Treasury <b>${fmtMoney(team.money)}</b> · mine output <b>${fmtMoney(w.mineRate(g.playerTeam))}/min</b> · `) : '')
        + L(`${mines.length} ocak. Damarın verimi yere göre çok değişir ve ocak kurulana dek bilinmez; ocaklar yan yana kurulabilir. Her yeni ocak %30 daha pahalı. Aynı anda 2 ekonomi inşaatı.`,
          `${count(mines.length, 'mine')}. Yield varies a lot by place and is unknown until the mine is built; mines can stand side by side. Each new mine costs 30% more. 2 economy builds at a time.`)
      : this.tab === 'city'
      ? L(`Personel <b>${w.personnelEnabled ? `${w.crewFree(g.playerTeam)} boşta / ${pers.capacity}` : nf.format(pop)}</b> · kira <b>${fmtMoney(w.houseRate(g.playerTeam))}/dk</b> · ${city.length} yapı. Evler yolların yanına kurulur (yol: belediyenin caddesinden başlayan sokaklar); 2, 3 ya da 4, apartman 16 kişi barındırır ve kira getirir; parkın 300 m yakınındaki evler %10 fazla; kurmaya devam etmek için yer seçmeyi sürdür<span class="kbd"> (Esc bitirir)</span>. Aynı anda 4 şehir inşaatı ilerler (şu an ${busy('city')}).`,
        `Personnel <b>${w.personnelEnabled ? `${w.crewFree(g.playerTeam)} free / ${pers.capacity}` : nf.format(pop)}</b> · rent <b>${fmtMoney(w.houseRate(g.playerTeam))}/min</b> · ${count(city.length, 'building')}. Houses go beside roads (streets drawn from the town hall's street); they hold 2, 3 or 4 people, an apartment block 16, and pay rent; houses within 300 m of a park earn 10% more; keep picking spots to build more<span class="kbd"> (Esc to finish)</span>. 4 city builds progress at a time (now ${busy('city')}).`)
      : L(`Kendi bölgende (yapılarına 30 km) düz ve kuru bir yer seç; R ile döndür. Fabrikayı üs panelinden üssün yanına da kurabilirsin. Aynı anda en fazla 3 askerî inşaat (şu an ${busy('military')}).`,
        `Pick flat, dry ground in your territory (within 30 km of your structures); rotate with R. You can also build a factory next to a base from the base panel. At most 3 military builds at a time (now ${busy('military')}).`);
    // Yer seçerken kartlar dar ekranda gizlenir (harita görünsün; kontroller alt çubukta)
    this.el.classList.toggle('placing', !!active);
    this.el.innerHTML = `
      <div class="bhead">
        <div class="tabs slim">
          <button class="${this.tab === 'military' ? 'active' : ''}" data-tab="military">${L('Askerî', 'Military')}</button>
          <button class="${this.tab === 'city' ? 'active' : ''}" data-tab="city">${L('Şehir', 'City')}</button>
          <button class="${this.tab === 'economy' ? 'active' : ''}" data-tab="economy">${L('Ekonomi', 'Economy')}</button>
        </div>
        <span class="muted small">${info}</span>
        <button class="icon" data-act="close">✕</button>
      </div>
      <div class="bcards ${this.tab}">${cardsHtml}</div>`;
  }
}
