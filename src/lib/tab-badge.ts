/**
 * Sekme başlığı rozeti (docs/history/435-*) — SAF yardımcılar. `(3) Ana Sayfa · Promptly`: okunmamış bildirim KART sayısı (zil rozetiyle aynı sayı). Başlığı sayfaların kendisi
 * yazar (`page-title.tsx`); rozet üstüne bir önek olarak konur ve her başlık değişiminde yeniden uygulanır (bileşen `<title>`'ı izler).
 */
const PREFIX = /^\(\d+\+?\)\s/;

/** 100 ve üstü "99+" yazılır (zil rozetiyle aynı). */
export function tabBadgeLabel(count: number): string {
  return count > 99 ? "99+" : String(Math.max(0, Math.floor(count)));
}

/** Başlıktaki rozet önekini atar (yoksa aynen döner). */
export function stripBadge(title: string): string {
  return title.replace(PREFIX, "");
}

/** Başlığa rozet ekler; sayı 0 ise önceki rozeti de kaldırır. İdempotent: ikinci kez uygulamak başlığı değiştirmez. */
export function badgedTitle(title: string, count: number): string {
  const base = stripBadge(title);
  return count > 0 ? `(${tabBadgeLabel(count)}) ${base}` : base;
}
