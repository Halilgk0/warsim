// Kayıt yerleri (2026-11-10): hesap başına 4 yer. Otomatik kayıt, aynı adlı oyunun önceki otomatik kaydının yerine yazılır;
// yoksa önce 4. yere, o doluysa boş bir yere. Boş yer yoksa otomatik kayıt alınamaz (oyun başlamadan söylenir).
// Elle kayıtta oyuncu yeri seçer; dolu yerin üstüne onayla yazar. Yeri olmayan kayıtlar bu düzenden önceki fazla kayıtlardır.

import type { SaveMeta } from './persist';
import { SAVE_AUTO_HOME, SAVE_SLOTS, nameKey, validSlot } from './net/shared';

/** Yer başına kayıt (1..4 → dizinde 0..3); aynı yerde iki kayıt görünürse (bekleyen yerel kopya) en yenisi. */
export function slotsOf(list: SaveMeta[]): (SaveMeta | null)[] {
  const out: (SaveMeta | null)[] = Array.from({ length: SAVE_SLOTS }, () => null);
  for (const m of list) {
    if (!validSlot(m.slot)) continue;
    const cur = out[m.slot - 1];
    if (!cur || m.created > cur.created) out[m.slot - 1] = m;
  }
  return out;
}

/** Kayıt yerlerinden önceki, yeri olmayan kayıtlar (temizlenmeyi bekleyen). */
export function legacySaves(list: SaveMeta[]): SaveMeta[] {
  return list.filter((m) => !validSlot(m.slot));
}

/** Bu adlı oyunun otomatik kaydı hangi yere yazılır: önceki otomatik kaydının yeri, yoksa 4, 3, 2, 1'den ilk boşu. Yer yoksa null. */
export function autoSlotFor(list: SaveMeta[], playerName: string): number | null {
  const slots = slotsOf(list);
  const key = nameKey(playerName);
  const own = slots.find((m) => m?.kind === 'auto' && nameKey(m.playerName) === key);
  if (own) return own.slot!;
  for (let s = SAVE_AUTO_HOME; s >= 1; s--) if (!slots[s - 1]) return s;
  for (let s = SAVE_AUTO_HOME + 1; s <= SAVE_SLOTS; s++) if (!slots[s - 1]) return s;
  return null;
}

/** Bütün yerler dolu mu. */
export function slotsFull(list: SaveMeta[]): boolean {
  return slotsOf(list).every(Boolean);
}
