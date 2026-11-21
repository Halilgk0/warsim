// Kayıt listesi (ana menü ve duraklatma menüsünde ortak): hesabın kayıt yerleri (3; destekçi paketiyle 4 ya da 5); yükle,
// sil (onaylı). Duraklatma menüsünde ayrıca "Buraya kaydet" / "Üstüne yaz" (onaylı). Kayıt sayısı yer sayısını aşınca
// (yer 4'ten 3'e inen eski hesap, iade) uyarı ve silinme tarihi; yer sayısının dışındaki dolu yer "fazla" işaretli.
// Kayıt yerlerinden önceki fazla kayıtlar ayrı bölümde.

import { type SaveMeta, deleteSave, listSaves, saveSlotCount, savesCleanupBy } from '../persist';
import { canFill, legacySaves, slotsOf } from '../saveSlots';
import { fmtMoney } from '../sim/economy';
import { mapById } from '../sim/maps';
import { MAP_BASE } from '../sim/mapData';
import { esc, fmtTime } from './dom';
import { L, LOCALE } from '../i18n';

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' });

/** Kayıt sayısı yer sayısını aşınca: kaç kayıt silinmeli, ne zamana kadar (liste ve giriş uyarısı aynı metni kullanır). */
export function overText(n: number, count: number, by: number): string {
  const k = count - n;
  const when = dayFmt.format(by);
  const left = Math.max(0, Math.ceil((by - Date.now()) / 86400000));
  return L(
    `Hesabında <b>${n} kayıt yeri</b> var, senin <b>${count} kaydın</b> var. İstemediğin ${k === 1 ? 'bir kaydı' : `${k} kaydı`} sil: <b>${when}</b> tarihine kadar (${left} gün) silmezsen en eski ${k === 1 ? 'kaydın' : `${k} kaydın`} kendiliğinden silinir.`,
    `Your account has <b>${n} save slots</b> and you have <b>${count} saves</b>. Delete ${k === 1 ? 'one save' : `${k} saves`} you don't need: if you don't by <b>${when}</b> (${left} ${left === 1 ? 'day' : 'days'}), your oldest ${k === 1 ? 'save is' : `${k} saves are`} deleted automatically.`,
  );
}

export class SavesPanel {
  list: SaveMeta[] = [];
  loading = false;
  private confirmDel: string | null = null;
  private confirmSlot: number | null = null;
  private error = '';
  /** Duraklatma menüsü: seçilen yere kaydet (yoksa liste yalnız yükler ve siler). */
  saveTo: ((slot: number) => void) | null = null;
  /** Kaydediliyor (düğmeler kapalı). */
  busy = false;

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
      this.error = `${L('Kayıtlar okunamadı', 'Could not read saves')}: ${(e as Error).message}`;
      this.list = [];
    }
    this.loading = false;
    this.rerender();
  }

  /** Dolu kayıt yeri sayısı (sekme rozeti). */
  used(): number {
    return slotsOf(this.list, saveSlotCount()).filter(Boolean).length + legacySaves(this.list).length;
  }

  private info(m: SaveMeta): string {
    return `${m.v === 2 && m.mapId ? `${esc(mapById(m.mapId).name)} ${(m.mapSize ?? MAP_BASE) / 1000} km · ` : `<b class="warn-ink">${L('eski harita', 'old map')}</b> · `}${dateFmt.format(m.created)} · ${L('oyun', 'game')} ${fmtTime(m.gameTime)} · ${m.enemies} ${L('düşman', m.enemies === 1 ? 'enemy' : 'enemies')} · ${fmtMoney(m.money)} · ${m.structures} ${L('yapı', 'structures')}`;
  }

  private row(m: SaveMeta | null, slot: number | null): string {
    const dis = this.busy ? 'disabled' : '';
    const n = saveSlotCount();
    let acts = '';
    if (m) {
      acts += `<button class="primary mini" data-sv="load" data-id="${m.id}" ${dis}>${L('Yükle', 'Load')}</button>`;
      acts += this.confirmDel === m.id
        ? `<span class="sv-confirm">${L('Silinsin mi?', 'Delete it?')} <button class="mini danger" data-sv="del-yes" data-id="${m.id}">${L('Sil', 'Delete')}</button><button class="mini" data-sv="del-no">${L('Vazgeç', 'Cancel')}</button></span>`
        : `<button class="mini" data-sv="del" data-id="${m.id}" title="${L('Kaydı sil', 'Delete save')}" ${dis}>${L('Sil', 'Delete')}</button>`;
    }
    if (this.saveTo && slot !== null) {
      if (!m) {
        if (canFill(this.list, n, slot)) acts += `<button class="mini sv-put" data-sv="put" data-slot="${slot}" ${dis}>${L('Buraya kaydet', 'Save here')}</button>`;
      }
      else if (this.confirmSlot === slot) {
        acts += `<span class="sv-confirm">${L('Üstüne yazılsın mı?', 'Overwrite it?')} <button class="mini danger" data-sv="put-yes" data-slot="${slot}">${L('Üstüne yaz', 'Overwrite')}</button><button class="mini" data-sv="put-no">${L('Vazgeç', 'Cancel')}</button></span>`;
      } else acts += `<button class="mini sv-put" data-sv="put" data-slot="${slot}" ${dis}>${L('Üstüne yaz', 'Overwrite')}</button>`;
    }
    const head = slot !== null ? `<span class="sv-slot">${slot}</span>` : `<span class="sv-ic">${m?.kind === 'auto' ? '⟳' : '◆'}</span>`;
    // Yer sayısının dışındaki dolu yer: silinmeyi bekler
    const extra = slot !== null && slot > n;
    const main = m
      ? `<b>${m.kind === 'auto' ? '<span class="sv-auto">⟳</span> ' : ''}${esc(m.title)}</b>${extra ? ` <span class="sv-extra" title="${L('Kayıt yeri sayının dışında: kayıt sayın inmezse silinir', 'Outside your slot count: deleted unless your save count goes down')}">${L('fazla', 'extra')}</span>` : ''}${m.pending ? ` <span class="sv-pending" title="${L('Bağlantı gelince buluta yüklenecek', 'Will upload to the cloud when online')}">${L('bu cihazda', 'on this device')}</span>` : ''}
          <small>${this.info(m)}</small>`
      : `<b class="muted">${L('Boş', 'Empty')}</b>${slot === n ? `<small>${L('Otomatik kayıt önce bu yere yazılır.', 'Autosave goes to this slot first.')}</small>` : ''}`;
    return `<div class="sv-row ${m ? m.kind : 'empty'}${extra ? ' sv-over' : ''}">${head}<div class="sv-main">${main}</div><div class="sv-act">${acts}</div></div>`;
  }

  html(): string {
    if (this.loading && !this.list.length) return `<p class="muted">${L('Kayıtlar yükleniyor…', 'Loading saves…')}</p>`;
    if (this.error) return `<p class="login-err">${esc(this.error)}</p>`;
    const n = saveSlotCount();
    const slots = slotsOf(this.list, n);
    const legacy = legacySaves(this.list).sort((a, b) => b.created - a.created);
    const by = savesCleanupBy();
    const count = slots.filter(Boolean).length + legacy.length;
    const full = count >= n;
    let out = '';
    if (by && count > n) out += `<div class="sv-warn">${overText(n, count, by)}</div>`;
    if (this.saveTo && full) {
      out += `<div class="sv-warn">${L(
        'Bütün kayıt yerleri dolu. Birinin üstüne yazabilir ya da birini silip yer açabilirsin.',
        'All save slots are full. Overwrite one, or delete one to make room.',
      )}</div>`;
    }
    // Temizlenecek eski kayıtlar önce: telefonda boş yerlerin altında kalıp görünmesinler
    if (legacy.length) {
      out += `<h3 class="sv-legacy-h">${L('Eski kayıtlar', 'Old saves')} <small class="muted">${L('kayıt yerlerinden önce', 'from before save slots')}</small></h3>
        <div class="sv-list">${legacy.map((m) => this.row(m, null)).join('')}</div>
        <h3 class="sv-legacy-h">${L('Kayıt yerleri', 'Save slots')}</h3>`;
    }
    out += `<div class="sv-list">${slots.map((m, i) => this.row(m, i + 1)).join('')}</div>`;
    if (!this.list.length && !this.saveTo) {
      out += `<p class="muted small">${L(
        'Oyunda Menü → <b>Kaydet</b> ile bir yer seçip kaydedebilirsin; oyun her 5 dakikada otomatik de kaydedilir.',
        'In game, use Menu → <b>Save</b> and pick a slot; the game also autosaves every 5 minutes.',
      )}</p>`;
    }
    return out;
  }

  /** Tıklamayı işler; listeyle ilgiliyse true. */
  handle(t: HTMLElement, account: string | null): boolean {
    const b = t.closest<HTMLElement>('[data-sv]');
    if (!b) return false;
    const id = b.dataset.id ?? '';
    const slot = Number(b.dataset.slot);
    switch (b.dataset.sv) {
      case 'load':
        this.onLoad(id);
        break;
      case 'del':
        this.confirmDel = id;
        this.confirmSlot = null;
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
      case 'put':
        // Boş yere hemen, dolu yere onayla
        if (slotsOf(this.list, saveSlotCount())[slot - 1]) {
          this.confirmSlot = slot;
          this.confirmDel = null;
          this.rerender();
        } else this.saveTo?.(slot);
        break;
      case 'put-no':
        this.confirmSlot = null;
        this.rerender();
        break;
      case 'put-yes':
        this.confirmSlot = null;
        this.saveTo?.(slot);
        break;
    }
    return true;
  }
}
