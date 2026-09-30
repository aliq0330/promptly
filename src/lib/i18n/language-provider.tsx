"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { translations, type Language, type TranslationKey } from "./translations";

/** Values substituted into a `{{token}}` placeholder inside a translation string. */
type TranslationParams = Record<string, string | number>;

/**
 * The shape of `useTranslation().t` — exported so a plain (non-component)
 * helper function called from within a component's render (e.g. a shared
 * "compose this display string" function) can accept it as a parameter
 * instead of duplicating its own lookup logic. See `suggestedFieldsLine`
 * in `request-vision-assist.tsx` and `getSharePreview` in `share-modal.tsx`.
 */
export type TFunction = (key: TranslationKey, params?: TranslationParams) => string;

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  /**
   * Translates a key to the current language, falling back to the key
   * itself (never crashes on a missing entry). Pass `params` to substitute
   * `{{token}}` placeholders inside the translated string — e.g.
   * `t("notifications.commentedTimes", { user: "Ali", count: 3 })`.
   */
  t: TFunction;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "promptly-language";

/**
 * Inline script injected before hydration so `<html lang>` is correct
 * before first paint (same "avoid a flash" pattern as `themeInitScript`).
 */
export const languageInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("${STORAGE_KEY}");
    var lang;
    if (stored === "en" || stored === "tr") {
      lang = stored;
    } else {
      // First visit, no choice yet: Turkey (Istanbul time zone) → Turkish, anywhere else → English.
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      lang = tz === "Europe/Istanbul" || tz === "Asia/Istanbul" ? "tr" : "en";
    }
    document.documentElement.lang = lang;
  } catch (e) {}
})();
`;

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("tr");

  // Real value is applied to <html lang> synchronously by languageInitScript
  // before hydration; this effect only re-reads that into React state once,
  // so components (e.g. the settings toggle) render the right selection
  // after mount — the same pattern ThemeProvider uses for `theme`.
  useEffect(() => {
    const lang = document.documentElement.lang === "en" ? "en" : "tr";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanguageState(lang);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode); preference just won't persist.
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => {
      const raw = translations[key]?.[language] ?? key;
      if (!params) return raw;
      return raw.replace(/\{\{(\w+)\}\}/g, (match, token: string) =>
        token in params ? String(params[token]) : match,
      );
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}

/** Thin, semantically-named alias of `useLanguage()` for call sites that only need `t()`. */
export function useTranslation() {
  return useLanguage();
}
