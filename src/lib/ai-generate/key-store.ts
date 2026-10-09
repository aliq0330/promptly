import type { AiProvider } from "./types";

/**
 * The user's own API keys. They NEVER leave the browser: not sent to Promptly,
 * not written to Supabase. By default a key lives only in memory (gone on
 * reload); with "remember" it is also written to localStorage of this browser.
 */
const STORAGE_KEY = "promptly-ai-keys";

const memory: Partial<Record<AiProvider, string>> = {};

function readStored(): Partial<Record<AiProvider, string>> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Partial<Record<AiProvider, string>>) : {};
  } catch {
    return {};
  }
}

function writeStored(value: Partial<Record<AiProvider, string>>) {
  try {
    if (Object.keys(value).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode / blocked): the key simply stays memory-only.
  }
}

export function loadKey(provider: AiProvider): { key: string; remembered: boolean } {
  const stored = readStored()[provider];
  if (stored) return { key: stored, remembered: true };
  return { key: memory[provider] ?? "", remembered: false };
}

export function saveKey(provider: AiProvider, key: string, remember: boolean) {
  const trimmed = key.trim();
  const stored = readStored();
  if (!trimmed) {
    delete memory[provider];
    delete stored[provider];
    writeStored(stored);
    return;
  }
  memory[provider] = trimmed;
  if (remember) stored[provider] = trimmed;
  else delete stored[provider];
  writeStored(stored);
}

export function clearKey(provider: AiProvider) {
  saveKey(provider, "", false);
}
