"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Promptly has ONE palette (globals.css, docs/history/342-*); the only appearance choice is the mode. The six selectable
 * palettes were removed, so there is no palette state, attribute or storage key any more.
 */
export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "promptly-theme";
/** Where the removed palette choice used to live; cleared once so it does not linger in the visitor's storage. */
const LEGACY_PALETTE_STORAGE_KEY = "promptly-palette";

/**
 * Inline script injected before hydration so the correct mode class is
 * applied before first paint (no light/dark flash on load).
 */
export const themeInitScript = `
(function () {
  try {
    var root = document.documentElement;
    var stored = localStorage.getItem("${STORAGE_KEY}");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.classList.toggle("dark", theme === "dark");
    localStorage.removeItem("${LEGACY_PALETTE_STORAGE_KEY}");
  } catch (e) {}
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // The real mode is applied to <html> synchronously by themeInitScript
  // before hydration (to avoid a flash); this effect only re-reads that DOM
  // state into React state once, so controls like ThemeToggle / the settings
  // mode picker render the right state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    withInstantSwitch(() => document.documentElement.classList.toggle("dark", next === "dark"));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode); theme just won't persist.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // Browser / installed-app chrome (address bar, status bar) follows the page background of the
  // chosen mode. The DOM class is already switched by the time this runs.
  useEffect(() => {
    const color = getComputedStyle(document.body).backgroundColor;
    if (!color) return;
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/**
 * A mode switch must be instant. Many elements carry their own
 * `transition-colors`, so flipping the theme normally makes each one fade on
 * its own clock and the page looks like it stutters. `.theme-instant` turns
 * all transitions off, the switch is applied and flushed (forced reflow), and
 * the class is dropped on the next frame so hover/focus feedback is untouched.
 */
function withInstantSwitch(apply: () => void) {
  const root = document.documentElement;
  root.classList.add("theme-instant");
  apply();
  void root.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-instant")));
}

/**
 * Puts the whole document in dark mode for as long as a full-screen dark surface (Odak) is open, WITHOUT touching the saved
 * preference or React's theme state, and returns the call that undoes it: only if this call added `.dark`, only that is
 * removed — a visitor already on the dark theme stays on it, a light one comes back to light exactly as it was (docs/history/247-*).
 * iOS Safari draws its own bars from the DOCUMENT's mode, not from a dark subtree.
 */
export function holdDarkMode(): () => void {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return () => undefined;
  withInstantSwitch(() => root.classList.add("dark"));
  return () => withInstantSwitch(() => root.classList.remove("dark"));
}
