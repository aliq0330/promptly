/**
 * Pencere odak yönetiminin SAF kuralları (Modal, docs/history/418-*): Tab ile odak pencerenin içinde döner; DOM erişimi `Modal`'dadır.
 */

/** Pencerenin içinde Tab ile gezilebilen öğeler. Görünürlüğü çağıran süzer (`getClientRects`). */
export const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

/**
 * Tab'a basılınca odaklanacak öğenin sırası; tarayıcının kendi sıralamasına bırakılacaksa -1.
 * `active` = şu an odaktaki öğenin listedeki sırası (listede değilse -1: pencerenin kendisi ya da dışı).
 */
export function tabTarget(count: number, active: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (active < 0) return shift ? count - 1 : 0;
  if (!shift && active === count - 1) return 0;
  if (shift && active === 0) return count - 1;
  return -1;
}

/**
 * Sekme satırında ok tuşları (WAI-ARIA tablist): yatay oklar sarar, Home/End uçlara gider. Odak sıra dışındaysa ya da tuş ilgisizse null.
 */
export function nextRovingIndex(count: number, current: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (current < 0) return null;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  return null;
}
