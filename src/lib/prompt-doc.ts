/**
 * Prompt belge modeli — ortak prompt düzenleyicinin (normal prompt değişkenleri
 * VE Generator şablon alanları) tek, saf ve DOM'suz çekirdeği.
 *
 * Bir belge, sıralı bir metin / jeton (token) listesidir:
 *
 *   "Profesyonel bir {Stil} tarzında, {Konu} konulu bir görsel oluştur."
 *    → [metin "Profesyonel bir "] [jeton Stil] [metin " tarzında, "] [jeton Konu] [metin " konulu …"]
 *
 * Saklanan form düz metindir (`{ad}` jetonlu) — bu, `prompts.prompt_text`'in
 * zaten kullandığı biçim olduğundan veritabanı değişmez; ama düzenleyici
 * metni her zaman `parseDoc` ile yapısal parçalara ayırır ve nihai metin
 * `serializeDoc` ile deterministik olarak yeniden üretilir
 * (`serializeDoc(parseDoc(x)) === x`, test edilir).
 *
 * Hiçbir import yok: Node'da doğrudan test edilebilir.
 */

export type DocSegment =
  | { type: "text"; text: string; start: number; end: number }
  | { type: "token"; name: string; start: number; end: number };

const TOKEN_PATTERN = /\{([^{}\n]+)\}/g;

/** Metindeki her `{ad}` jetonunun aralığı (yalnızca jetonlar, sırayla). */
export function tokenRanges(text: string): { name: string; start: number; end: number }[] {
  const ranges: { name: string; start: number; end: number }[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const start = match.index ?? 0;
    ranges.push({ name: match[1], start, end: start + match[0].length });
  }
  return ranges;
}

/** Metni sıralı metin/jeton parçalarına ayırır (boş metin parçası üretmez). */
export function parseDoc(text: string): DocSegment[] {
  const segments: DocSegment[] = [];
  let cursor = 0;
  for (const range of tokenRanges(text)) {
    if (range.start > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, range.start), start: cursor, end: range.start });
    }
    segments.push({ type: "token", name: range.name, start: range.start, end: range.end });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor), start: cursor, end: text.length });
  }
  return segments;
}

/** `parseDoc`'un tersi — nihai metni sıralı parçalardan deterministik üretir. */
export function serializeDoc(segments: DocSegment[]): string {
  return segments.map((segment) => (segment.type === "text" ? segment.text : `{${segment.name}}`)).join("");
}

/** `offset` bir jetonun TAM İÇİNDEYSE (sınırlar hariç) o jetonu döndürür. */
export function tokenStrictlyContaining(text: string, offset: number) {
  return tokenRanges(text).find((range) => range.start < offset && offset < range.end) ?? null;
}

/**
 * Bir seçimi jeton sınırlarına oturtur: seçimin ucu bir jetonun içine
 * düşüyorsa seçim o jetonu tamamen kapsayacak şekilde genişler. İmleç
 * (daralmış seçim) bir jetonun içindeyse jetonun tamamı seçilir — jeton
 * bölünemez bir öğedir.
 */
export function snapSelectionToTokens(text: string, start: number, end: number): { start: number; end: number } {
  let nextStart = start;
  let nextEnd = end;
  const startToken = tokenStrictlyContaining(text, start);
  if (startToken) nextStart = startToken.start;
  const endToken = tokenStrictlyContaining(text, end);
  if (endToken) nextEnd = endToken.end;
  return { start: nextStart, end: nextEnd };
}

/** `[start,end)` aralığına temas eden tüm jetonlar. */
export function tokensInRange(text: string, start: number, end: number) {
  return tokenRanges(text).filter((range) => range.start < end && range.end > start);
}

/**
 * Geri silme (Backspace) için silinecek aralık: seçim varsa seçim; imleç bir
 * jetonun hemen sağındaysa jetonun TAMAMI; aksi hâlde null (tarayıcının
 * kendi tek karakter silmesi yeterli).
 */
export function backwardDeleteRange(text: string, start: number, end: number): { start: number; end: number } | null {
  if (start !== end) return snapSelectionToTokens(text, start, end);
  const token = tokenRanges(text).find((range) => range.end === start);
  return token ? { start: token.start, end: token.end } : null;
}

/** İleri silme (Delete) için `backwardDeleteRange`'in aynası. */
export function forwardDeleteRange(text: string, start: number, end: number): { start: number; end: number } | null {
  if (start !== end) return snapSelectionToTokens(text, start, end);
  const token = tokenRanges(text).find((range) => range.start === start);
  return token ? { start: token.start, end: token.end } : null;
}

/** `[start,end)` aralığını `insertion` ile değiştirir; yeni imleç konumunu da döner. */
export function replaceRange(
  text: string,
  start: number,
  end: number,
  insertion: string,
): { text: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  return { text: text.slice(0, safeStart) + insertion + text.slice(safeEnd), cursor: safeStart + insertion.length };
}

/** İmleç/seçim konumuna `{ad}` jetonu ekler (seçim varsa onun yerine geçer). */
export function insertToken(text: string, start: number, end: number, name: string) {
  return replaceRange(text, start, end, `{${name}}`);
}

/** Bir jetonu (aralığıyla) başka bir konuma taşır; `toOffset` jetonun kendi içine düşerse hiçbir şey yapmaz. */
export function moveToken(
  text: string,
  token: { start: number; end: number },
  toOffset: number,
): { text: string; cursor: number } {
  if (toOffset >= token.start && toOffset <= token.end) return { text, cursor: token.end };
  const raw = text.slice(token.start, token.end);
  const without = text.slice(0, token.start) + text.slice(token.end);
  const adjusted = toOffset > token.end ? toOffset - raw.length : toOffset;
  const next = without.slice(0, adjusted) + raw + without.slice(adjusted);
  return { text: next, cursor: adjusted + raw.length };
}

/**
 * Bir jetonu bir kelime sola/sağa taşır (dokunmatikte sürükleme olmadan
 * yeniden sıralama). Komşu "kelime" boşlukla ayrılmış parçadır; taşınacak yer
 * yoksa null döner. Dönen `token` jetonun yeni aralığıdır.
 */
export function moveTokenByWord(
  text: string,
  token: { start: number; end: number },
  direction: "left" | "right",
): { text: string; token: { start: number; end: number } } | null {
  const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);
  const raw = text.slice(token.start, token.end);
  // Jeton ile komşu kelimenin yer değiştirmesi: aradaki boşluk korunur,
  // böylece taşıma çift boşluk bırakmaz.
  if (direction === "left") {
    let wordEnd = token.start;
    while (wordEnd > 0 && isSpace(text[wordEnd - 1])) wordEnd -= 1;
    let wordStart = wordEnd;
    while (wordStart > 0 && !isSpace(text[wordStart - 1])) wordStart -= 1;
    const inside = tokenStrictlyContaining(text, wordStart);
    if (inside) wordStart = inside.start;
    if (wordStart >= wordEnd) return null;
    const word = text.slice(wordStart, wordEnd);
    const gap = text.slice(wordEnd, token.start);
    const next = text.slice(0, wordStart) + raw + gap + word + text.slice(token.end);
    return { text: next, token: { start: wordStart, end: wordStart + raw.length } };
  }
  let wordStart = token.end;
  while (wordStart < text.length && isSpace(text[wordStart])) wordStart += 1;
  let wordEnd = wordStart;
  while (wordEnd < text.length && !isSpace(text[wordEnd])) wordEnd += 1;
  const inside = tokenStrictlyContaining(text, wordEnd);
  if (inside) wordEnd = inside.end;
  if (wordEnd <= wordStart) return null;
  const word = text.slice(wordStart, wordEnd);
  const gap = text.slice(token.end, wordStart);
  const next = text.slice(0, token.start) + word + gap + raw + text.slice(wordEnd);
  const start = token.start + word.length + gap.length;
  return { text: next, token: { start, end: start + raw.length } };
}

/** Aynı adlı jetonun metindeki kullanım sayısı. */
export function countTokenUsages(text: string, name: string): number {
  return tokenRanges(text).filter((range) => range.name === name).length;
}

/** Her ada göre kullanım sayısı. */
export function tokenUsageMap(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const range of tokenRanges(text)) map.set(range.name, (map.get(range.name) ?? 0) + 1);
  return map;
}

/** Belgedeki tüm `{eski}` jetonlarını `{yeni}` yapar (yalnızca tam jeton eşleşmesi). */
export function renameToken(text: string, oldName: string, newName: string): string {
  if (!oldName || oldName === newName) return text;
  let result = "";
  let cursor = 0;
  for (const range of tokenRanges(text)) {
    if (range.name !== oldName) continue;
    result += text.slice(cursor, range.start) + `{${newName}}`;
    cursor = range.end;
  }
  return result + text.slice(cursor);
}

/**
 * Belgedeki tüm `{ad}` jetonlarını kaldırır. Yalnızca kaldırılan yerin
 * çevresindeki fazla boşluğu toparlar (iki yanında da boşluk varsa biri,
 * noktalama/satır sonu önündeyse öndeki boşluk gider); metnin geri kalanına
 * dokunmaz.
 */
export function removeToken(text: string, name: string): string {
  if (!name) return text;
  const targets = tokenRanges(text).filter((range) => range.name === name);
  let result = text;
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    let { start, end } = targets[i];
    const before = result[start - 1];
    const after = result[end];
    if (before === " " && (after === " " || after === undefined || after === "\n" || /[,.;:!?]/.test(after))) {
      start -= 1;
    } else if (after === " " && (before === undefined || before === "\n")) {
      end += 1;
    }
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}

/** Bir metni (tırnaklar, boşluklar vb.) güvenli bir jeton adına çevirir. */
export function sanitizeTokenName(raw: string): string {
  return raw.replace(/[{}\n]/g, "").replace(/\s+/g, " ").trim();
}
