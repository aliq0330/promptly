/**
 * Odak'ın prompt kartı (`docs/history/436-*`) — saf kurallar (React / Supabase yok, `focus-sheet.test.ts` sınar): kartın üç durumu
 * (kapalı şerit → yarım → tam), sürükleme eşiği, sekmeler, sonuç görsellerinde gezinme, klavye eşlemesi ve etkin gönderi hesabı.
 */
import type { PostEntry } from "@/lib/supabase/feed";

/** `null` = kapalı (yalnız alttaki prompt şeridi görünür). */
export type FocusSheetState = "half" | "full";

/**
 * Kart yerden kopuk, yüzen bir alt penceredir (diğer alt pencerelerle aynı davranış; yalnız alttaki boşluk %3): yarım = sahnenin %75'i, büyük = %90'ı.
 * Oranlar sahne (kartın kabı) yüksekliğine göredir.
 */
export const FOCUS_SHEET_GAP = 0.03;
export const FOCUS_SHEET_HALF = 0.75;
export const FOCUS_SHEET_TALL = 0.9;
/** Bir dokunuş ile sürükleme arasındaki sınır (px): daha azı sekmeyi/düğmeyi seçer, fazlası kartı sürükler. */
export const FOCUS_SHEET_DRAG_SLOP = 6;

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

/** Sürükleme bırakılınca kartın gideceği yer: hız (px/ms, + = yukarı) 200 ms ileri izdüşürülür; yarımın %70'inin altı kapatır, yarımdan büyüğe giden yolun üçte birinin üstü büyütür. */
export function focusSheetRelease(height: number, velocity: number, half: number, tall: number): "closed" | FocusSheetState {
  const projected = height + velocity * 200;
  if (projected < half * 0.7) return "closed";
  if (projected > half + (tall - half) * 0.33) return "full";
  return "half";
}

export interface FocusSheetDragInput {
  /** Kartın görünen yüksekliği (px); yarımın altı = aşağı iniyor, `floor` altına inmez. */
  height: number;
  /** Bu hareketteki dikey değişim (+ = aşağı). */
  dy: number;
  /** `body` = içerik alanından başlayan sürükleme (kaydırılabilir bir atası var), `head` = başlık/tutamak/sekmeler/alt çubuk. */
  region: "head" | "body";
  /** İçerik kaydırıcısının şimdiki `scrollTop`'u (`head`'te önemsiz). */
  scrollTop: number;
  tall: number;
  floor: number;
}

/**
 * Bir sürükleme adımı: kartın yeni yüksekliği ve içeriğin ne kadar kaydırılacağı (`scroll`, + = aşağı kaydır).
 * Yukarı çekmek kartı büyütür, içerik %90'a varana kadar kaymaz; %90'da içerik kayar, en üstteyken aşağı çekmek kartı küçültür.
 */
export function focusSheetDrag({ height, dy, region, scrollTop, tall, floor }: FocusSheetDragInput): { height: number; scroll: number } {
  const wanted = height - dy;
  if (region === "body" && height >= tall - 0.5) {
    if (dy > 0 && scrollTop <= 0) return { height: Math.max(floor, wanted), scroll: 0 };
    return { height, scroll: -dy };
  }
  const over = wanted - tall;
  if (over > 0) return { height: tall, scroll: region === "body" ? over : 0 };
  return { height: Math.max(floor, wanted), scroll: 0 };
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
