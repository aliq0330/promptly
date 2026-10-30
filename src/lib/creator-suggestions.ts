/**
 * Pure rules of the "Takip edilecek kişiler" strip between the posts of Ana Sayfa (docs/history/285-*): where it may appear, how many
 * people each strip holds and how a pool of server-ranked candidates is cut into strips. Kept out of the components so the cadence is unit-tested.
 */
import { parseShownMap, recordShownSuggestions, reduceRepeatedSuggestions, type ShownMap } from "./community-home.ts";
import { interestPromptPausedUntil } from "./interest-feedback.ts";

/** The first strip sits under the 12th post (index 11) … */
export const CREATOR_STRIP_FIRST_INDEX = 11;
/**
 * … and then again every 30 posts (12th, 42nd, 72nd …). Index-based, like the "ilgini çekiyor mu?" card (6th, 21st, 36th …): a list that grows
 * (next page) never moves an earlier strip, and the two never land under the same post.
 */
export const CREATOR_STRIP_EVERY = 30;
/** People in one strip. */
export const CREATOR_STRIP_SIZE = 10;
/** Candidates asked from the server (`suggest_creators`): enough for three strips. */
export const CREATOR_STRIP_POOL = 30;
/** After the header ✕ no strip comes for this long (every list). */
export const CREATOR_STRIP_PAUSE_MS = 6 * 60 * 60 * 1000;
/** A person shown in a strip waits this long before being shown again (when there are enough others). */
export const CREATOR_REPEAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const CREATOR_SHOWN_STORAGE_KEY = "promptly-creator-suggestions-shown";
export const CREATOR_PAUSE_STORAGE_KEY = "promptly-creator-strip-paused-until";

export function isCreatorStripSlot(index: number): boolean {
  return index >= CREATOR_STRIP_FIRST_INDEX && (index - CREATOR_STRIP_FIRST_INDEX) % CREATOR_STRIP_EVERY === 0;
}

/** 0 for the first strip, 1 for the second … (only meaningful for a slot index). */
export function creatorStripOrdinal(index: number): number {
  return Math.floor((index - CREATOR_STRIP_FIRST_INDEX) / CREATOR_STRIP_EVERY);
}

/** Why a person is suggested — the order of the server's signal weights (`suggest_creators`). */
export type CreatorReasonKind = "mutual" | "liked" | "tag" | "tool" | "active";

const REASON_KINDS: readonly string[] = ["mutual", "liked", "tag", "tool", "active"];

/** An unknown kind (a newer server) reads as the plain "active" reason instead of breaking the card. */
export function parseCreatorReasonKind(value: unknown): CreatorReasonKind {
  return typeof value === "string" && REASON_KINDS.includes(value) ? (value as CreatorReasonKind) : "active";
}

/** The pause stamp (same parsing as the interest card's: anything that is not a future time means "not paused"). */
export const creatorStripPausedUntil = interestPromptPausedUntil;

/**
 * Orders the server's candidates for display — people shown in the last week go last — and cuts the pool into strips of `size`:
 * strip `ordinal` gets its own slice, so what an earlier strip shows never changes when a person is dismissed in it.
 */
export function orderCreatorPool<T extends { id: string }>(candidates: readonly T[], shown: ShownMap, now: number, poolSize: number = CREATOR_STRIP_POOL): T[] {
  return reduceRepeatedSuggestions(candidates, shown, now, poolSize, CREATOR_REPEAT_WINDOW_MS);
}

export function creatorStripSlice<T>(pool: readonly T[], ordinal: number, size: number = CREATOR_STRIP_SIZE): T[] {
  if (ordinal < 0) return [];
  return pool.slice(ordinal * size, (ordinal + 1) * size);
}

export { parseShownMap, recordShownSuggestions };
export type { ShownMap };
