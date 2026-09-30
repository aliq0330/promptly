"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "./auth-provider";
import { useLanguage } from "@/lib/i18n/language-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { fetchOwnPreferences, updateOwnPreferences } from "@/lib/supabase/profiles";

/**
 * Keeps the signed-in user's language / color mode / palette in their
 * `profiles` row so the choice follows the account across devices.
 *
 * - On sign-in the saved values (when the user has ever chosen one) are
 *   applied; a value that is still null keeps the current one (the
 *   location-based first-visit default) and is NOT written back, so an
 *   untouched default never counts as a choice.
 * - Afterwards, any change is written to the backend.
 * - localStorage is still written by the providers, but only as a
 *   first-paint cache (no flash) and for signed-out visitors; the account
 *   value always wins on sign-in.
 */
export function PreferencesSync() {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme, palette, setPalette } = useTheme();

  const current = useRef({ language, theme, palette });
  useEffect(() => {
    current.current = { language, theme, palette };
  }, [language, theme, palette]);
  // What the backend is known to hold (null until sign-in hydration finishes).
  const synced = useRef<{ language: string; theme: string; palette: string } | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    synced.current = null;
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const prefs = await fetchOwnPreferences(userId);
      if (cancelled) return;
      const now = current.current;
      const next = {
        language: prefs?.language ?? now.language,
        theme: prefs?.themeMode ?? now.theme,
        palette: prefs?.themePalette ?? now.palette,
      };
      // Mark as synced first so applying the saved values below is not echoed back.
      synced.current = next;
      if (next.language !== now.language) setLanguage(next.language as "tr" | "en");
      if (next.theme !== now.theme) setTheme(next.theme as "light" | "dark");
      if (next.palette !== now.palette) setPalette(next.palette as "lavender");
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, setLanguage, setTheme, setPalette]);

  useEffect(() => {
    const known = synced.current;
    if (!userId || !known) return;
    const patch: Record<string, string> = {};
    if (language !== known.language) patch.language = language;
    if (theme !== known.theme) patch.themeMode = theme;
    if (palette !== known.palette) patch.themePalette = palette;
    if (Object.keys(patch).length === 0) return;
    synced.current = { language, theme, palette };
    updateOwnPreferences(userId, patch).catch((err) => console.error("updateOwnPreferences", err));
  }, [userId, language, theme, palette]);

  return null;
}
