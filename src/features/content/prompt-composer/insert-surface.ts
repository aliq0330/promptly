/**
 * Ekleme yüzeyi (değişken / alan seçici) hangi biçimde açılacak?
 *
 *  - mobil ve dikey tablet  → `sheet`   (alttan açılan Bottom Sheet)
 *  - yatay dokunmatik tablet → `panel`  (sağ panel)
 *  - fare/klavyeli masaüstü  → `popover` (imlece yakın küçük pencere)
 *
 * Üç yüzey de AYNI içeriği (`InsertPicker`) ve aynı ekleme fonksiyonunu
 * kullanır; yalnızca yerleşim farklıdır. Karar, yüzey açıldığı anda
 * verilir (render sırasında değil), böylece SSR/hydration'a dokunmaz.
 */
export type InsertSurface = "sheet" | "panel" | "popover";

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** Birincil işaretçi dokunmatik mi (telefon/tablet)? */
export function isCoarsePointer(): boolean {
  return matches("(pointer: coarse)");
}

export function resolveInsertSurface(): InsertSurface {
  if (matches("(max-width: 767px)")) return "sheet";
  if (isCoarsePointer()) return matches("(orientation: portrait)") ? "sheet" : "panel";
  return "popover";
}
