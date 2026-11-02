/**
 * Uzun belge sayfalarının bölüm gezinmesi için saf yardımcılar (/developers önceki-sonraki şeridi, docs/history/319-*).
 * Bileşen bölümlerin ekrandaki üst konumlarını (`getBoundingClientRect().top`) verir; hangisinin "şimdiki" sayılacağı burada karar verilir.
 */

/**
 * Şimdiki bölümün sırası: üstü `anchor` çizgisini geçmiş (yani `top <= anchor`) son bölüm. Hiçbiri geçmediyse ilk bölüm; sayfa sonuna
 * gelindiyse (`atBottom`) son bölüm — kısa son bölümler çizgiye hiç ulaşamayabilir. Boş liste → -1.
 */
export function activeSectionIndex(tops: number[], anchor: number, atBottom: boolean): number {
  if (tops.length === 0) return -1;
  if (atBottom) return tops.length - 1;
  let active = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= anchor) active = i;
  }
  return active;
}

/** Şeridin altındaki ince ilerleme çubuğunun doluluğu (0–1): şimdiki bölüm dahil, "3 / 6" → 0.5. */
export function pagerProgress(index: number, total: number): number {
  if (total <= 0 || index < 0) return 0;
  return Math.min(index + 1, total) / total;
}

/** Önceki/sonraki bölüm sırası; uçlarda aynı sırayı verir (düğme zaten pasiftir). */
export function neighborSection(index: number, total: number, direction: -1 | 1): number {
  if (total <= 0) return -1;
  return Math.min(Math.max(index + direction, 0), total - 1);
}
