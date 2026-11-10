/**
 * Ekip alanı öğe detayının küçük saf yardımcıları (docs/history/364-*): adres parametresi biçimi ve prompt metnini `{değişken}` parçalarına bölme.
 * Birim testi: `team-item-kit.test.ts`.
 */

const PALETTE_PREFIX = "palette:";

/** `?item=` değeri: sıradan öğede öğe kimliği, paletlerde `palette:<palet kimliği>` (palet ayrı tablodur). */
export function paletteItemParam(paletteId: string): string {
  return `${PALETTE_PREFIX}${paletteId}`;
}

/** `?item=palette:<id>` ise palet kimliği, değilse `null`. */
export function paletteItemId(param: string): string | null {
  return param.startsWith(PALETTE_PREFIX) ? param.slice(PALETTE_PREFIX.length) : null;
}

export interface PromptToken {
  text: string;
  /** Yalnız `{ad}` jetonunda dolu: ad (süslü parantezsiz). */
  variable?: string;
}

/** Jeton biçimi `fillProjectVariables` ile aynıdır: `{ad}` — harf/alt çizgiyle başlar, harf/rakam/alt çizgi. */
export function splitPromptTokens(text: string): PromptToken[] {
  const out: PromptToken[] = [];
  const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let last = 0;
  for (let match = re.exec(text); match; match = re.exec(text)) {
    if (match.index > last) out.push({ text: text.slice(last, match.index) });
    out.push({ text: match[0], variable: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
