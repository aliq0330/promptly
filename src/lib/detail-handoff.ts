import type { Prompt } from "@/types";

/**
 * Card → detail handoff (docs/history/209-*): the card a visitor taps already holds the whole post, so the detail page
 * can draw at once from it instead of showing a skeleton while it fetches the same row again — and only then can the
 * cover's morph (`lib/card-transition.ts`) start from the very first frame. The detail page still refreshes nothing it
 * would not have shown anyway: this is the same row the list just read (RLS applied there). A small, bounded memory; a
 * page reload (or an identity change, which reloads — CLAUDE.md 8.10) empties it.
 */
const MAX_ENTRIES = 40;
const prompts = new Map<string, Prompt>();

export function handOffPrompt(prompt: Prompt): void {
  prompts.delete(prompt.id);
  prompts.set(prompt.id, prompt);
  if (prompts.size > MAX_ENTRIES) prompts.delete(prompts.keys().next().value as string);
}

export function handedOffPrompt(id: string): Prompt | undefined {
  return prompts.get(id);
}
