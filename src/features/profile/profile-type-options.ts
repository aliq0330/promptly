import type { PromptContentType } from "@/types";

/**
 * The content types the profile's type filter offers. The list is read a page at a time, so "which types occur in it" can no longer be
 * worked out from the loaded rows (docs/history/233-* did that) — the four types are always offered; a type with no prompts answers with the
 * "no match" state.
 */
export const PROFILE_TYPE_OPTIONS: PromptContentType[] = ["image", "text", "audio", "video"];
