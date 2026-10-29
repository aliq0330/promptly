/**
 * Pure rules of the "Bu gönderi ilgini çekiyor mu?" card (docs/history/275-*): where it may appear and how long it stays away after a ✕.
 * Kept out of the component so the cadence is unit-tested.
 */

/** The first card may sit under the 7th post (index 6) … */
export const INTEREST_PROMPT_FIRST_INDEX = 6;
/** … and then again every 15 posts. Index-based so a list that grows (next page) never moves an earlier card. */
export const INTEREST_PROMPT_EVERY = 15;
/** After a ✕ the card stays away this long (all lists). */
export const INTEREST_PROMPT_PAUSE_MS = 6 * 60 * 60 * 1000;

export function isInterestPromptSlot(index: number): boolean {
  return index >= INTEREST_PROMPT_FIRST_INDEX && (index - INTEREST_PROMPT_FIRST_INDEX) % INTEREST_PROMPT_EVERY === 0;
}

/** Parses the stored "paused until" stamp; anything that is not a future time means "not paused". */
export function interestPromptPausedUntil(raw: string | null, now: number): number {
  const until = raw === null ? 0 : Number(raw);
  return Number.isFinite(until) && until > now ? until : 0;
}
