const KEY = "promptly-recent-searches";
const MAX = 5;

/** The last typed searches, newest first. Per browser only (localStorage) — never sent anywhere; every access is guarded (private windows, blocked storage). */
export function readRecentSearches(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberSearch(text: string): void {
  const value = text.trim();
  if (value.length < 2 || value.startsWith("@") || value.startsWith("#")) return;
  try {
    const next = [value, ...readRecentSearches().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Recents are a convenience; the search works without them.
  }
}

export function clearRecentSearches(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // see above
  }
}
