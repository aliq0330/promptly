/**
 * Tag-name normalization — must produce byte-identical results to the
 * server's `normalize_tag_name(text)` SQL function (see
 * supabase/migrations/20260919280000_smart_tags.sql) so a slug computed
 * here always matches the slug the database would compute for the same
 * label (CLAUDE.md §10: "frontend ve backend aynı normalizasyon
 * kurallarını kullanmalı"). Never strips/merges Turkish letters as if they
 * were accents — ç/ğ/ı/ö/ş/ü are transliterated to their closest ASCII
 * letter (matching the existing seed catalog's own slug convention, e.g.
 * "Şiir" → "siir", "Karakter Tasarımı" → "karakter-tasarimi") purely for
 * comparison purposes; the original label is always kept, unmodified, as
 * the tag's display name.
 */

const TURKISH_TO_ASCII: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

/** Turns a free-text tag label into its normalized comparison key (slug). */
export function normalizeTagLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  const transliterated = trimmed.replace(/[çÇğĞıİöÖşŞüÜI]/g, (ch) => TURKISH_TO_ASCII[ch] ?? ch);
  const lowered = transliterated.toLowerCase();
  return lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** True when two labels normalize to the same tag ("apple"/"Apple"/"APPLE"). */
export function tagLabelsMatch(a: string, b: string): boolean {
  return normalizeTagLabel(a) === normalizeTagLabel(b);
}
