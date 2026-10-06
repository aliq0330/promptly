/**
 * Turkish-first text normalization for the Prompt DNA rule engine.
 *
 * `foldText` lower-cases and strips Turkish diacritics CHARACTER BY
 * CHARACTER, so the folded string always has exactly the same length as the
 * original — a match found in the folded text maps straight back to the
 * original text by index (we show the user's own words, not our labels).
 */

const FOLD_MAP: Record<string, string> = {
  "ç": "c", "Ç": "c",
  "ğ": "g", "Ğ": "g",
  "ı": "i", "İ": "i", "I": "i",
  "ö": "o", "Ö": "o",
  "ş": "s", "Ş": "s",
  "ü": "u", "Ü": "u",
  "â": "a", "Â": "a", "î": "i", "Î": "i", "û": "u", "Û": "u",
  "é": "e", "è": "e", "á": "a", "à": "a", "ó": "o", "ñ": "n",
  // Separators that should not glue words together ("tilt-shift", "İstanbul'da").
  "-": " ", "_": " ", "'": " ", "’": " ", "‘": " ", "`": " ", "\"": " ", "“": " ", "”": " ", "–": " ", "—": " ",
};

export function foldText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const mapped = FOLD_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
    } else if (ch === "\n") {
      out += "\n"; // sentence/paragraph boundaries still matter to the analyzer
    } else if (/\s/.test(ch)) {
      out += " ";
    } else {
      const lower = ch.toLowerCase();
      out += lower.length === 1 ? lower : ch;
    }
  }
  return out;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

export function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && ch !== "" && WORD_CHAR.test(ch);
}

/** Longest suffix a Turkish stem match may swallow ("yağmur" → "yağmurlarında"). */
const MAX_STEM_SUFFIX = 8;

export interface TermMatch {
  start: number;
  end: number;
}

/**
 * Every whole-word occurrence of `term` in `folded`. A term ending in `*`
 * is a stem: it may be followed by up to MAX_STEM_SUFFIX more letters (the
 * returned `end` covers the whole inflected word). Without `*` the next
 * character must end the word.
 */
export function findTerm(folded: string, rawTerm: string): TermMatch[] {
  const stem = rawTerm.endsWith("*");
  const term = stem ? rawTerm.slice(0, -1) : rawTerm;
  if (!term) return [];
  const matches: TermMatch[] = [];
  let from = 0;
  while (from <= folded.length - term.length) {
    const at = folded.indexOf(term, from);
    if (at === -1) break;
    from = at + 1;
    if (isWordChar(folded[at - 1])) continue;
    let end = at + term.length;
    if (stem) {
      let extra = 0;
      while (isWordChar(folded[end]) && extra <= MAX_STEM_SUFFIX) {
        end++;
        extra++;
      }
      if (isWordChar(folded[end])) continue; // the word is longer than a plausible suffix
    } else if (isWordChar(folded[end])) {
      continue;
    }
    matches.push({ start: at, end });
    from = end;
  }
  return matches;
}

/** Collapses inner whitespace, trims surrounding punctuation/space. */
export function cleanValue(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:!?()[\]{}"'“”‘’\-–—]+/, "")
    .replace(/[\s,.;:!?()[\]{}"'“”‘’\-–—]+$/, "");
}
