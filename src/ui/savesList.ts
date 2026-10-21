// Kayıt listesi (ana menü ve duraklatma menüsünde ortak): yükle, sil (onaylı).

import { type SaveMeta, deleteSave, listSaves } from '../persist';
import { fmtMoney } from '../sim/economy';
import { mapById } from '../sim/maps';
import { esc, fmtTime } from './dom';

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export class SavesPanel {
  list: SaveMeta[] = [];
  loading = false;
  private confirmDel: string | null = null;
  private error = '';

  constructor(
    private readonly onLoad: (id: string) => void,
    private readonly rerender: () => void,
  ) {}

  async refresh(account: string | null): Promise<void> {
    if (!account) {
      this.list = [];
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      this.list = await listSaves(account);
    } catch (e) {
      this.error = `Kayıtlar okunamadı: ${(e as Error).message}`;
      this.list = [];
    }
    this.loading = false;
    this.rerender();
  }

  html(): string {
    if (this.loading) return '<p class="muted">Kayıtlar yükleniyor…</p>';
    if (this.error) return `<p class="login-err">${esc(this.error)}</p>`;
    if (!this.list.length) {
      return '<p class="muted">Henüz kayıt yok. Oyunda Menü → <b>Kaydet</b> ile kaydedebilirsin; ayrıca her 5 dakikada otomatik kayıt alınır.</p>';
    }
    return `<div class="sv-list">${this.list.map((m) => {
      const del = this.confirmDel === m.id
        ? `<span class="sv-confirm">Silinsin mi? <button class="mini danger" data-sv="del-yes" data-id="${m.id}">Sil</button><button class="mini" data-sv="del-no">Vazgeç</button></span>`
        : `<button class="mini" data-sv="del" data-id="${m.id}" title="Kaydı sil">Sil</button>`;
      return `<div class="sv-row ${m.kind}">
        <span class="sv-ic">${m.kind === 'auto' ? '⟳' : '◆'}</span>
        <div class="sv-main"><b>${esc(m.title)}</b>
          <small>${m.v === 2 && m.mapId ? `${esc(mapById(m.mapId).name)} · ` : '<b class="warn-ink">eski harita</b> · '}${dateFmt.format(m.created)} · oyun ${fmtTime(m.gameTime)} · ${m.enemies} düşman · ${fmtMoney(m.money)} · ${m.structures} yapı</small></div>
        <div class="sv-act"><button class="primary mini" data-sv="load" data-id="${m.id}">Yükle</button>${del}</div>
      </div>`;
    }).join('')}</div>`;
  }

  /** Tıklamayı işler; listeyle ilgiliyse true. */
  handle(t: HTMLElement, account: string | null): boolean {
    const b = t.closest<HTMLElement>('[data-sv]');
    if (!b) return false;
    const id = b.dataset.id ?? '';
    switch (b.dataset.sv) {
      case 'load':
        this.onLoad(id);
        break;
      case 'del':
        this.confirmDel = id;
        this.rerender();
        break;
      case 'del-no':
        this.confirmDel = null;
        this.rerender();
        break;
      case 'del-yes':
        this.confirmDel = null;
        void deleteSave(id).then(() => this.refresh(account));
        break;
    }
    return true;
  }
}
