/**
 * Metinden değişken adı önerisi (docs/history/288-*): bir kelime/ifadeyi "Değişken yap"ın hazır adına çevirir.
 * Saf ve DOM'suz; kataloğu import ETMEZ (katalog yalnızca ad ipuçları aranırken tembel yüklenir).
 */
import { normalizeVariableName } from "./prompt-variables.ts";

const MAX_NAME_LENGTH = 40;
const MAX_WORDS = 3;

/** "Ay Işığı!" → "ay_işığı". Harf/rakam dışı her şey ayraçtır; ilk üç kelime alınır; sonuç geçerli bir değişken adıdır ya da boştur. */
export function suggestNameFromText(text: string): string {
  const words = text
    // "İ" varsayılan küçültmede "i" + birleşik nokta olur: önce düz "i"ye çevrilir.
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, MAX_WORDS);
  return normalizeVariableName(words.join(" ")).slice(0, MAX_NAME_LENGTH);
}

/** Aday adları (büyük/küçük harf duyarsız) tekilleştirir, geçersizleri ve `taken` içindekileri atar, en çok `limit` döndürür. */
export function pickNameCandidates(candidates: string[], taken: Set<string>, limit = 3): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const name = suggestNameFromText(candidate);
    const key = name.toLowerCase();
    if (!name || seen.has(key) || taken.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= limit) break;
  }
  return result;
}
