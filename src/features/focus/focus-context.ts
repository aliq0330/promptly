"use client";

import { createContext } from "react";
import type { PostFeedItem } from "@/features/feed/types";
import type { FocusTabId } from "@/lib/focus-sheet";

/**
 * Odak's one sound switch (top bar): videos start muted (browsers only autoplay silently); turning sound on, or tapping
 * an audio post's play button — or an audio post starting by itself with its sound — applies to every following post until it is
 * turned off again.
 */
export const FocusPlaybackContext = createContext<{ muted: boolean; setMuted: (muted: boolean) => void }>({ muted: true, setMuted: () => undefined });

/**
 * What a post's face can ask of Odak's screen (docs/history/436-*): open the prompt card (a phone's bottom sheet, a desktop's side panel) on a
 * tab, or edit one `{variable}` of the active text prompt (a phone's picker, a desktop's field in the panel).
 */
export interface FocusPanelApi {
  openSheet: (item: PostFeedItem, tab?: FocusTabId) => void;
  editVariable: (item: PostFeedItem, name: string) => void;
}

export const FocusPanelContext = createContext<FocusPanelApi>({ openSheet: () => undefined, editVariable: () => undefined });

/**
 * Faded out on a phone while a card is open over the post (`data-sheet` on Odak's stage): the post then shrinks to the space above
 * the card, so its words, rail and strip step aside.
 */
export const HIDE_WHILE_SHEET =
  "transition-opacity duration-200 ease-soft max-md:group-data-[sheet]/stage:pointer-events-none max-md:group-data-[sheet]/stage:opacity-0";

/** The top bar also steps aside when the card is full (its own compact header replaces it). */
export const HIDE_WHILE_FULL =
  "transition-opacity duration-200 ease-soft max-md:group-data-[sheet=full]/stage:pointer-events-none max-md:group-data-[sheet=full]/stage:opacity-0";
