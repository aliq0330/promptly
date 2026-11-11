/**
 * Bileşen dışı (React ağacı olmayan) kod için çeviri — `lib/*.ts` hataları vb. (CLAUDE.md §4.5).
 * `translations.ts`'ten taşındı (docs/history/372-*): orada kalsaydı her içe aktaran iki dilin tam sözlüğünü pakete sokardı.
 */
import type { Language, TranslationKey } from "./translations";
import { fillParams, lookupTranslation } from "./dictionary";

/**
 * Reads the current language directly off `<html lang>` — for the handful
 * of plain (non-component) `src/lib/*.ts` helpers that throw a real,
 * user-facing `Error` message (shown via `err.message` in a catch block)
 * from outside any React tree, so they have no `useTranslation()` to call.
 * `<html lang>` is always kept correct by `languageInitScript`/
 * `LanguageProvider`, so this reads the same source of truth every
 * component does — just without the hook.
 */
export function getRuntimeLanguage(): Language {
  if (typeof document === "undefined") return "tr";
  return document.documentElement.lang === "en" ? "en" : "tr";
}

/** Same as `useTranslation().t(key, params)`, for a plain (non-component) helper — see `getRuntimeLanguage`. */
export function translateForRuntime(key: TranslationKey, params?: Record<string, string | number>): string {
  return fillParams(lookupTranslation(key, getRuntimeLanguage()) ?? key, params);
}
