// Harekât sonu: oyuncu elenince ya da haritada son kalınca açılan pencere; son hava üssü yıkılınca üstte geri sayım.

import type { Game } from '../game';
import type { World } from '../sim/world';
import { fmtMoney } from '../sim/economy';
import { $, esc, fmtTime } from './dom';

type Outcome = 'win' | 'lose';

export class EndScreen {
  isOpen = false;
  private el = $('endscreen');
  private banner = $('laststand');
  private bannerText = '';
  /** Bu dünyada gösterilmiş sonuç (aynı oyunda bir kez açılır). */
  private shown = new WeakMap<World, Outcome>();
  private resumeScale = 1;

  constructor(private readonly game: Game) {
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-end]');
      if (!b) return;
      if (b.dataset.end === 'watch') this.close();
      else if (b.dataset.end === 'menu') {
        this.close(false);
        this.game.exitToMenu();
      }
    });
  }

  update(): void {
    const g = this.game;
    const w = g.world;
    const me = w.teams[g.playerTeam];
    if (g.mode !== 'play' || !w.setup || !me) {
      this.setBanner('');
      return;
    }
    this.setBanner(
      !me.eliminated && me.lastStand !== null
        ? `Son hava üssün yıkıldı! Yeni üs kur (İnşa · B, ${fmtMoney(w.structureCost(me.id, 'airbase'))}): elenmeye ${fmtTime(Math.max(0, me.lastStand))}`
        : '',
    );
    if (this.isOpen) return;
    const prev = this.shown.get(w);
    if (me.eliminated && prev !== 'lose') this.open('lose');
    else if (w.winner === me.id && prev !== 'win') this.open('win');
  }

  private setBanner(text: string): void {
    if (text === this.bannerText) return;
    this.bannerText = text;
    this.banner.textContent = text;
    this.banner.classList.toggle('hidden', !text);
  }

  private open(kind: Outcome): void {
    const g = this.game;
    const w = g.world;
    this.shown.set(w, kind);
    this.isOpen = true;
    this.resumeScale = g.timeScale || 1;
    g.setTimeScale(0);
    if (g.pause.isOpen) g.pause.close(false);
    const me = w.teams[g.playerTeam];
    const foes = w.teams.filter((t) => t.id !== me.id);
    const out = foes.filter((t) => t.eliminated).length;
    const left = foes.filter((t) => !t.eliminated).map((t) => esc(t.name));
    let ok = 0;
    let fail = 0;
    for (const [k, v] of w.missionTally) {
      if (!k.startsWith(`${me.id}:`)) continue;
      ok += v.success;
      fail += v.fail;
    }
    const head = kind === 'win'
      ? `<h2>Zafer!</h2>
        <p>Haritada son kalan ülke sensin: ${out} düşman ülke elendi.</p>`
      : `<h2>Harekât kaybedildi</h2>
        <p>Son hava üssün yıkıldı ve yenisi kurulmadı.${left.length ? ` ${left.join(', ')} savaşmayı sürdürüyor.` : ''}</p>`;
    this.el.innerHTML = `<div class="pm-card end-card ${kind}">
      ${head}
      <div class="end-stats">
        <div><b>${fmtTime(w.time)}</b><span>oyun süresi</span></div>
        <div><b>${out}/${foes.length}</b><span>elenen düşman</span></div>
        <div><b>${ok} / ${fail}</b><span>başarılı / başarısız görev</span></div>
        <div><b>${me.research.done.size}</b><span>araştırma</span></div>
      </div>
      <div class="pm-col">
        <button class="primary big" data-end="watch">${kind === 'win' ? 'Haritada kal' : 'İzlemeye devam et'}</button>
        <button data-end="menu">Ana menüye dön</button>
      </div>
    </div>`;
    this.el.classList.remove('hidden');
  }

  close(resume = true): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.add('hidden');
    if (resume) this.game.setTimeScale(this.resumeScale);
  }
}
