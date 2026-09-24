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

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  /** Translates a key to the current language, falling back to the key itself (never crashes on a missing entry). */
  t: (key: TranslationKey) => string;
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
    var lang = stored === "en" ? "en" : "tr";
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
    (key: TranslationKey) => translations[key]?.[language] ?? key,
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
