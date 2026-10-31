/**
 * Mesaj uzun basma / ⋮ sayfasının yerleşimi (docs/history/288-*): bulanık zeminde mesajın kopyası, üstünde tepki çubuğu, altında
 * işlem menüsü tek bir dikey grup olarak durur. Grup mesajın gerçek yerinde açılır; görünür alana sığmıyorsa yukarı/aşağı kayar,
 * ekrandan uzun mesaj kırpılarak kopyalanır. Saf fonksiyonlar — tarayıcısız birim testli (`message-sheet-layout.test.ts`).
 *
 * Tüm kutular aynı istemci koordinatlarındadır (`getBoundingClientRect`; `position: fixed` aynı çerçevededir). `bounds` görünür bölgedir:
 * görsel görünüm alanı (klavye/adres çubuğu dışarıda), güvenli alan boşlukları ve kenar payı düşülmüş.
 */
import type { Box } from "./popover-position";

export interface SheetLayout {
  /** Grubun üst kenarı (istemci koordinatı). */
  top: number;
  /** Mesaj kopyası bundan uzunsa kırpılır; sığıyorsa null. */
  cloneMaxHeight: number | null;
  /** Grubun, mesajın gerçek yerine göre dikey kayması: açılış animasyonu `shift` px'ten 0'a iner. */
  shift: number;
}

/** Kırpılan kopyanın alt sınırı: çok kısa bir görünür alanda bile mesajdan anlamlı bir parça kalır. */
const MIN_CLONE_HEIGHT = 96;

export function computeSheetLayout(params: {
  bounds: Box;
  bubbleTop: number;
  bubbleHeight: number;
  barHeight: number;
  menuHeight: number;
  /** Çubuk–mesaj–menü arası boşluk. */
  gap?: number;
}): SheetLayout {
  const gap = params.gap ?? 10;
  const boundsHeight = Math.max(0, params.bounds.bottom - params.bounds.top);
  const available = boundsHeight - params.barHeight - params.menuHeight - 2 * gap;
  const cloneHeight = params.bubbleHeight > available ? Math.max(MIN_CLONE_HEIGHT, Math.floor(available)) : params.bubbleHeight;
  const total = params.barHeight + gap + cloneHeight + gap + params.menuHeight;
  const natural = params.bubbleTop - params.barHeight - gap;
  // Grup tek parça sığıyorsa görünür alana oturur; sığmıyorsa üstten başlar (kapsayıcı kaydırılabilir).
  const top = clamp(natural, params.bounds.top, params.bounds.bottom - total);
  return {
    top: Math.round(top),
    cloneMaxHeight: cloneHeight < params.bubbleHeight ? cloneHeight : null,
    shift: Math.round(natural - top),
  };
}

/**
 * Bir parçanın (çubuk, mesaj kopyası, menü) sol kenarı: `end` = sağ kenarı mesajın sağ kenarıyla, `start` = sol kenarı mesajın sol kenarıyla
 * hizalı; sonra görünür bölgeye sıkıştırılır (parça bölgeden genişse sol kenara yaslanır).
 */
export function alignInBounds(params: {
  anchorLeft: number;
  anchorRight: number;
  width: number;
  bounds: Box;
  align: "start" | "end";
}): number {
  const preferred = params.align === "end" ? params.anchorRight - params.width : params.anchorLeft;
  return Math.round(clamp(preferred, params.bounds.left, params.bounds.right - params.width));
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
