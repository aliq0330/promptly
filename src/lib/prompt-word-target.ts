/**
 * Tam ekran yazma ekranının sabit "Değişkene dönüştür" düğmesinin kararı (docs/history/288-*): imleç/seçim → düğme ne yapar?
 * Saf ve DOM'suz; kendi başına Node'da test edilir.
 *
 *  - Seçim varsa (boşluk kırpılır): seçilen metin dönüştürülür.
 *  - Daralmış imleç bir kelimenin içinde ya da hemen yanındaysa: kelimenin TAMAMI dönüştürülür.
 *  - İmleç hazır bir `{değişken}`in içinde/yanındaysa ya da seçim tam bir jetonsa: düğme "düzenle" olur.
 *  - Boşlukta/noktalamada ya da seçimde `{ }` varsa: dönüştürülecek bir şey yok.
 *
 * Kelime = harf, rakam ve birleşik işaret + alt çizgi. Tire/kesme işareti ayraçtır: "Adana'da" üzerinde yalnız "Adana" yakalanır
 * (Türkçe ek metinde kalır, `{Adana}'da`).
 */
import { tokenRanges } from "./prompt-doc.ts";

export type ConvertTarget =
  | { kind: "none" }
  /** Seçimde `{` ya da `}` var: dönüştürülemez. */
  | { kind: "blocked" }
  | { kind: "word" | "selection"; start: number; end: number; text: string }
  | { kind: "token"; start: number; end: number; name: string };

const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;

function isWordChar(text: string, index: number): boolean {
  return index >= 0 && index < text.length && WORD_CHAR.test(text[index]);
}

export function findConvertTarget(text: string, selectionStart: number, selectionEnd: number): ConvertTarget {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd, text.length));
  const end = Math.max(start, Math.min(Math.max(selectionStart, selectionEnd), text.length));
  const tokens = tokenRanges(text);

  if (start !== end) {
    const exact = tokens.find((token) => token.start === start && token.end === end);
    if (exact) return { kind: "token", start: exact.start, end: exact.end, name: exact.name };
    let a = start;
    let b = end;
    while (a < b && /\s/.test(text[a])) a += 1;
    while (b > a && /\s/.test(text[b - 1])) b -= 1;
    if (a === b) return { kind: "none" };
    const selected = text.slice(a, b);
    if (/[{}]/.test(selected)) return { kind: "blocked" };
    return { kind: "selection", start: a, end: b, text: selected };
  }

  const token = tokens.find((candidate) => start >= candidate.start && start <= candidate.end);
  if (token) return { kind: "token", start: token.start, end: token.end, name: token.name };

  if (!isWordChar(text, start - 1) && !isWordChar(text, start)) return { kind: "none" };
  let a = start;
  let b = start;
  while (isWordChar(text, a - 1)) a -= 1;
  while (isWordChar(text, b)) b += 1;
  return { kind: "word", start: a, end: b, text: text.slice(a, b) };
}

const MAX_NAME_LENGTH = 40;
const MAX_WORDS = 3;

/**
 * Kelime/ifadeden değişken adı: harf/rakam dışı her şey ayraç, ilk üç kelime `_` ile birleşir, ilk harf büyük
 * ("covered bridge" → "Covered_bridge"). Sonuç geçerli bir değişken adıdır ya da boştur.
 */
export function suggestVariableName(text: string): string {
  const words = text
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean)
    .slice(0, MAX_WORDS);
  const joined = words.join("_").slice(0, MAX_NAME_LENGTH).replace(/_+$/, "");
  if (!joined) return "";
  const first = joined.charAt(0);
  const upper = first.toUpperCase();
  return (upper.length === 1 ? upper : first) + joined.slice(1);
}
