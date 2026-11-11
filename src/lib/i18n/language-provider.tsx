"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Language, TranslationKey } from "./translations";
import { fillParams, isDictionaryLoaded, loadDictionary, lookupTranslation } from "./dictionary";

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

/**
 * Same decision as `languageInitScript`, but callable from React. The
 * provider must NOT trust `<html lang>` alone: when React recovers from a
 * hydration mismatch it re-creates the root, and `<html lang="tr">` from the
 * JSX then overwrites whatever the init script wrote — so reading it back
 * would silently flip an English visitor to Turkish.
 */
function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "tr") return stored;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz === "Europe/Istanbul" || tz === "Asia/Istanbul" ? "tr" : "en";
  } catch {
    return document.documentElement.lang === "en" ? "en" : "tr";
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("tr");
  // Sözlük sonradan inince (İngilizce ayrı parçadır, docs/history/372-*) `t` yeniden hesaplansın diye artar.
  const [dictionaryVersion, setDictionaryVersion] = useState(0);

  // Kullanıcı dil SEÇİNCE (radyo) seçim anında değişir; metinler sözlük inince güncellenir (o ana dek Türkçe metin — anahtar
  // ya da boş metin asla görünmez). Açılıştaki dil belirlemede ise durum sözlük inene kadar Türkçe kalır: böylece `t`
  // eskisi gibi YALNIZ BİR KEZ değişir (t'ye bağlı effect'ler fazladan çalışmaz). Yükleme başarısızsa sayfa Türkçe kalır.
  const applyLanguage = useCallback((next: Language, waitForDictionary: boolean) => {
    if (isDictionaryLoaded(next)) {
      setLanguageState(next);
      return;
    }
    if (!waitForDictionary) setLanguageState(next);
    loadDictionary(next).then(
      () => {
        if (waitForDictionary) {
          // Bu arada kullanıcı başka bir dil seçtiyse onu ezme.
          if (document.documentElement.lang === next) setLanguageState(next);
        } else {
          setDictionaryVersion((v) => v + 1);
        }
      },
      () => {
        // Ağ hatası: sayfa Türkçe metinle çalışmaya devam eder.
      },
    );
  }, []);

  // The real value is applied to <html lang> synchronously by
  // languageInitScript before hydration; this effect re-derives it into React
  // state once (and re-asserts <html lang>, in case a hydration recovery reset
  // it), the same pattern ThemeProvider uses for `theme`.
  useEffect(() => {
    const lang = detectLanguage();
    document.documentElement.lang = lang;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tek seferlik: ilk boyamadan önce belirlenen dili React'e taşır (eskisiyle aynı)
    applyLanguage(lang, true);
  }, [applyLanguage]);

  const setLanguage = useCallback(
    (next: Language) => {
      document.documentElement.lang = next;
      applyLanguage(next, false);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // localStorage may be unavailable (private mode); preference just won't persist.
      }
    },
    [applyLanguage],
  );

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => fillParams(lookupTranslation(key, language) ?? key, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dictionaryVersion: sözlük indikçe yeni bir `t` kimliği (tüketenler yeniden çizilsin)
    [language, dictionaryVersion],
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

/**
 * Bir alt ağaçta çevrilmiş metni yeniden yazar (örn. ekip alanında "Space" → "alan", docs/history/363-*). Yeniden yazma HAM
 * çeviriye uygulanır, `{{param}}` değerleri (kullanıcının yazdığı ad vb.) ona dokunmaz. Dil/anahtar mantığı `LanguageProvider`'ınkiyle aynıdır.
 */
export function LanguageTermScope({ rewrite, children }: { rewrite: (text: string, language: Language) => string; children: React.ReactNode }) {
  const parent = useLanguage();
  const { language } = parent;
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => {
      const raw = lookupTranslation(key, language);
      if (raw === undefined) return parent.t(key, params);
      return fillParams(rewrite(raw, language), params);
    },
    [language, rewrite, parent],
  );
  const value = useMemo(() => ({ ...parent, t }), [parent, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
