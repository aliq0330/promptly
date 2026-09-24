"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "light" | "dark";

/**
 * Color palettes of the Promptly 2.0 design system (globals.css). Each one
 * defines the full semantic token set for BOTH modes, so palette and mode
 * are two independent choices.
 */
export const PALETTES = ["lavender", "ocean", "forest", "sand"] as const;
export type Palette = (typeof PALETTES)[number];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "promptly-theme";
const PALETTE_STORAGE_KEY = "promptly-palette";

function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && (PALETTES as readonly string[]).includes(value);
}

/**
 * Inline script injected before hydration so the correct mode class and
 * palette attribute are applied before first paint (no light/dark or
 * lavender→other-palette flash on load).
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
    var palette = localStorage.getItem("${PALETTE_STORAGE_KEY}");
    if (${JSON.stringify(PALETTES)}.indexOf(palette) > 0) {
      root.setAttribute("data-palette", palette);
    }
  } catch (e) {}
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [palette, setPaletteState] = useState<Palette>("lavender");

  // The real theme/palette are applied to <html> synchronously by
  // themeInitScript before hydration (to avoid a flash); this effect only
  // re-reads that DOM state into React state once, so controls like
  // ThemeToggle / the settings palette picker render the right state.
  useEffect(() => {
    const root = document.documentElement;
    const attr = root.getAttribute("data-palette");
    /* eslint-disable react-hooks/set-state-in-effect */
    setThemeState(root.classList.contains("dark") ? "dark" : "light");
    setPaletteState(isPalette(attr) ? attr : "lavender");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode); theme just won't persist.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const setPalette = useCallback((next: Palette) => {
    setPaletteState(next);
    const root = document.documentElement;
    if (next === "lavender") root.removeAttribute("data-palette");
    else root.setAttribute("data-palette", next);
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode); palette just won't persist.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, palette, setPalette }),
    [theme, setTheme, toggleTheme, palette, setPalette],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
