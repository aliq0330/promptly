/**
 * Odak'ın prompt kartı (`docs/history/435-*`) — saf kurallar (React / Supabase yok, `focus-sheet.test.ts` sınar): kartın üç durumu
 * (kapalı şerit → yarım → tam), sürükleme eşiği, sekmeler, sonuç görsellerinde gezinme, klavye eşlemesi ve etkin gönderi hesabı.
 */
import type { PostEntry } from "@/lib/supabase/feed";

/** `null` = kapalı (yalnız alttaki prompt şeridi görünür). */
export type FocusSheetState = "half" | "full";

/** Kartın yüksekliği (dvh): yarım = %58, tam = üstte 84 px'lik küçük başlık kalacak kadar (CSS tarafında). */
export const FOCUS_SHEET_HALF_DVH = 58;

export function focusSheetStep(current: FocusSheetState | null, direction: "up" | "down"): FocusSheetState | null {
  if (direction === "up") return current === null ? "half" : "full";
  if (current === "full") return "half";
  return null;
}

/** Sürüklemenin yönü: 48 px'ten uzun ya da hızlı (px/ms) fırlatma sayılır; aksi hâlde karar yok (kart yerinde kalır). */
export function focusSheetGesture(dy: number, elapsedMs: number): "up" | "down" | null {
  const velocity = Math.abs(dy) / Math.max(1, elapsedMs);
  if (Math.abs(dy) > 48 || (Math.abs(dy) > 12 && velocity > 0.5)) return dy < 0 ? "up" : "down";
  return null;
}

export type FocusTabId = "main" | "comments" | "results" | "versions";

/** Kartın sekmeleri: yalnız prompt'un sonuçları ve (varsa) sürümleri vardır; diğer türlerde ana sekme + yorumlar. */
export function focusTabs(kind: PostEntry["kind"], hasVersions: boolean): FocusTabId[] {
  if (kind !== "prompt") return ["main", "comments"];
  return hasVersions ? ["main", "comments", "results", "versions"] : ["main", "comments", "results"];
}

/** Sonuç görselleri arasında bir adım (uçlarda sarmaz). */
export function focusResultStep(index: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index + direction, count - 1));
}

/** Dikey kaydırıcıda etkin gönderi: her gönderi bir ekran yüksekliğidir. */
export function focusActiveIndex(scrollTop: number, clientHeight: number, count: number): number {
  if (count <= 0 || clientHeight <= 0) return 0;
  return Math.max(0, Math.min(Math.round(scrollTop / clientHeight), count - 1));
}

export type FocusKeyAction = "next" | "prev" | "resultNext" | "resultPrev" | "first" | "last" | "panel" | "copy" | "close";

/** ↑ ↓ / PageUp PageDown / j k gönderiler, ← → / h l sonuç görselleri, P panel, C kopyala, Esc kapat. */
export function focusKeyAction(key: string): FocusKeyAction | null {
  switch (key) {
    case "ArrowDown":
    case "PageDown":
    case "j":
      return "next";
    case "ArrowUp":
    case "PageUp":
    case "k":
      return "prev";
    case "ArrowRight":
    case "l":
      return "resultNext";
    case "ArrowLeft":
    case "h":
      return "resultPrev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "p":
    case "P":
      return "panel";
    case "c":
    case "C":
      return "copy";
    case "Escape":
      return "close";
    default:
      return null;
  }
}
