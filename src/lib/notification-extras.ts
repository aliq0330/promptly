/**
 * Bildirimde yorum/yanıt eklerinin önizleme kuralı (docs/history/327-*). Saf: yalnız KAÇ ek olduğuna ve hangilerinin önizleneceğine karar verir.
 *
 * Kart (kısa görünüm): yazı kısaltılır; 1 ek varsa "1 ek var" + o ekin önizlemesi; 2 ek varsa iki önizleme (etiketsiz); 3 ve fazlaysa "N ek var" + İLK İKİSİNİN önizlemesi.
 * Ayrıntı: yorumun/yanıtın tamamı + HER ek (`all: true`). Bugün bir yorumda en çok bir görsel (fotoğraf ya da GIF) ve bir içerik eki olabilir (docs/history/308-*), yani 3+ dalı
 * şemaya yeni bir ek türü eklenirse kendiliğinden doğru çalışsın diye var.
 */

export interface ExtrasPlan<T> {
  /** Yazıyla gösterilecek ek sayısı ("N ek var"); `null` = etiket yok. */
  labelCount: number | null;
  /** Önizlemesi çizilecek ekler (sırayla). */
  previews: T[];
}

/** Kartta en çok bu kadar ek önizlenir. */
export const CARD_PREVIEW_LIMIT = 2;

export function extrasPlan<T>(items: readonly T[], all = false): ExtrasPlan<T> {
  const count = items.length;
  if (count === 0) return { labelCount: null, previews: [] };
  if (all) return { labelCount: null, previews: [...items] };
  return {
    labelCount: count === 2 ? null : count,
    previews: items.slice(0, CARD_PREVIEW_LIMIT),
  };
}
