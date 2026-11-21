// Kayıt yerleri (2026-11-10; 2026-11-21'de 4 → 3, destekçi paketiyle 4 ya da 5): hesabın yer sayısı sunucudan gelir
// (persist.ts saveSlotCount). Otomatik kayıt, aynı adlı oyunun önceki otomatik kaydının yerine yazılır; yoksa son yere, o doluysa
// boş bir yere. Boş yer yoksa otomatik kayıt alınamaz (oyun başlamadan söylenir). Elle kayıtta oyuncu yeri seçer; dolu yerin
// üstüne onayla yazar. Yer sayısı azalmış hesapta (4 kaydı olan eski hesap, iade) yer sayısının dışındaki dolu yerler de
// gösterilir: silinmeyi bekler, üstüne yazılabilir. Yeri olmayan kayıtlar kayıt yerlerinden önceki fazla kayıtlardır.

import type { SaveMeta } from './persist';
import { nameKey, validSlot } from './net/shared';

/** Gösterilen yer sayısı: hesabın yer sayısı; dışında kalan dolu yer varsa ona kadar. */
export function shownSlots(list: SaveMeta[], n: number): number {
  let max = n;
  for (const m of list) if (validSlot(m.slot) && m.slot > max) max = m.slot;
  return max;
}

/** Yer başına kayıt (1..k → dizinde 0..k−1); aynı yerde iki kayıt görünürse (bekleyen yerel kopya) en yenisi. */
export function slotsOf(list: SaveMeta[], n: number): (SaveMeta | null)[] {
  const out: (SaveMeta | null)[] = Array.from({ length: shownSlots(list, n) }, () => null);
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

/** Boş yere yeni kayıt yazılabilir mi: yer, yer sayısının içinde ve kayıt sayısı yer sayısının altında. */
export function canFill(list: SaveMeta[], n: number, slot: number): boolean {
  return slot <= n && slotsOf(list, n).filter(Boolean).length + legacySaves(list).length < n;
}

/**
 * Bu adlı oyunun otomatik kaydı hangi yere yazılır: önceki otomatik kaydının yeri (yer sayısının dışında olsa da), yoksa son
 * yerden geriye ilk boşu. Yer yoksa null.
 */
export function autoSlotFor(list: SaveMeta[], playerName: string, n: number): number | null {
  const slots = slotsOf(list, n);
  const key = nameKey(playerName);
  const own = slots.find((m) => m?.kind === 'auto' && nameKey(m.playerName) === key);
  if (own) return own.slot!;
  for (let s = n; s >= 1; s--) if (!slots[s - 1] && canFill(list, n, s)) return s;
  return null;
}
