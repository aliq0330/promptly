"use client";

import { Fragment, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { QuoteCard } from "@/features/quotes/quote-card";
import { useTranslation } from "@/lib/i18n/language-provider";
import { feedItemKey, type FeedItem } from "./types";
import { InterestCardFrame, type InterestFeedback } from "./interest-feedback";
import { CreatorStripSlot, type CreatorStrips } from "./creator-suggestions";
import { creatorStripOrdinal, isCreatorStripSlot } from "@/lib/creator-suggestions";
import { Reveal } from "@/components/ui/reveal";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { prefersReducedMotion } from "@/lib/motion";
import { FEED_PAGE_SIZE } from "@/lib/supabase/feed";
import { chunk } from "@/lib/supabase/paged";

/**
 * Same CSS-columns masonry as PromptGrid (see prompt-grid.tsx), but for a
 * mixed list of prompts (any content type), prompt requests, and — since
 * Bölüm 9.36's Prompt/Generator parity pass — generators too, all through
 * the same card shell/masonry, not a separate generator feed.
 */
export function FeedGrid({
  items,
  emptyIcon = Inbox,
  emptyTitle,
  emptyDescription,
  emptyAction,
  layout = "grid",
  itemNote,
  flip = false,
  interest,
  creatorStrips,
}: {
  items: FeedItem[];
  /** A short line drawn above a card ("Sana özel"'s reason, docs/history/209-*). */
  itemNote?: (item: FeedItem) => ReactNode;
  /** "İlgimi çekiyor / çekmiyor" (docs/history/275-*): the answers in each card's ⋮ menu + the occasional question strip. Sana özel and Keşfet only. */
  interest?: InterestFeedback;
  /** "Takip edilecek kişiler" (docs/history/285-*): a strip of people to follow after the 12th post and every 30th. Ana Sayfa, signed in only. */
  creatorStrips?: CreatorStrips;
  /** When the list is re-ordered (same posts, new ranking) the cards glide to their new places (FLIP). */
  flip?: boolean;
  /** "home" = Ana Sayfa's column next to its right rail (two columns at most); "grid" = the full-width lists (up to three). */
  layout?: "grid" | "home";
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ComponentProps<typeof EmptyState>["action"];
}) {
  const { t } = useTranslation();
  const gridRef = useRef<HTMLDivElement>(null);
  useFlipReorder(gridRef, flip);
  if (items.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle ?? t("feed.emptyDefault")}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const card = (item: FeedItem) =>
    item.kind === "prompt" ? (
      <PromptCard prompt={item.data} />
    ) : item.kind === "request" ? (
      <RequestCard request={item.data} />
    ) : item.kind === "preset" ? (
      <PresetCard preset={item.data} />
    ) : item.kind === "quote" ? (
      <QuoteCard quote={item.data} />
    ) : (
      <WorkflowCard workflow={item.data} />
    );

  // Each loaded page is its OWN column block (docs/history/276-*): a single CSS-columns container re-balances every card whenever one is appended, so
  // posts already on screen jumped between columns while the next page loaded. Blocks of one page never change once drawn (the last, partial one balances itself).
  const blocks = chunk(items, FEED_PAGE_SIZE);
  return (
    <div ref={gridRef}>
      {blocks.map((block, blockIndex) => (
        <ContentGrid key={`block-${blockIndex}`} columns={layout === "home" ? "sm:columns-2" : undefined}>
          {block.map((item, offset) => {
            const index = blockIndex * FEED_PAGE_SIZE + offset;
            return (
              <Fragment key={feedItemKey(item)}>
                <div data-flip-key={feedItemKey(item)} className={CONTENT_GRID_ITEM_CLASS}>
                  <Reveal index={index}>
                    {itemNote?.(item)}
                    {interest ? (
                      <InterestCardFrame interest={interest} item={item} index={index}>
                        {card(item)}
                      </InterestCardFrame>
                    ) : (
                      card(item)
                    )}
                  </Reveal>
                </div>
                {/* Full-width break inside the columns (column-span): the cards before and after it stay mounted. The wrapper is there from the
                    first render whether or not a strip has anything to show, so people arriving later never re-flow the cards. */}
                {creatorStrips && isCreatorStripSlot(index) && (
                  <div data-creator-strip-slot className="[column-span:all]">
                    <CreatorStripSlot strips={creatorStrips} ordinal={creatorStripOrdinal(index)} />
                  </div>
                )}
              </Fragment>
            );
          })}
        </ContentGrid>
      ))}
    </div>
  );
}

/**
 * After a RE-RANKING (same posts, new order) every card that is still there but sits somewhere else glides from its old box to the new one
 * (First-Last-Invert-Play with the Web Animations API — nothing is left behind once it ends, so no stacking context
 * stays around a card's ⋮ menu). New cards just appear (their `Reveal`); reduced motion skips it.
 *
 * Only a changed ORDER animates (docs/history/276-*): a re-render with the same list, or one that only APPENDS the next page, moves nothing —
 * comparing viewport boxes at every render took the user's own scrolling for movement and slid every card ("kayma" while the next page loaded).
 * Boxes are kept in page coordinates (viewport + scroll) so a scroll between two renders is not a move either; a resized window is not a re-rank.
 */
function useFlipReorder(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const boxes = useRef(new Map<string, { left: number; top: number }>());
  const order = useRef<string[]>([]);
  const width = useRef(0);
  useLayoutEffect(() => {
    const container = ref.current;
    if (!enabled || !container) {
      boxes.current.clear();
      order.current = [];
      return;
    }
    const next = new Map<string, { left: number; top: number }>();
    const keys: string[] = [];
    const cells = container.querySelectorAll<HTMLElement>("[data-flip-key]");
    cells.forEach((cell) => {
      const key = cell.dataset.flipKey as string;
      const rect = cell.getBoundingClientRect();
      keys.push(key);
      next.set(key, { left: rect.left + window.scrollX, top: rect.top + window.scrollY });
    });
    const previous = order.current;
    const onlyAppended = previous.every((key, i) => keys[i] === key);
    if (!onlyAppended && width.current === window.innerWidth && !prefersReducedMotion()) {
      cells.forEach((cell) => {
        const key = cell.dataset.flipKey as string;
        const before = boxes.current.get(key);
        const after = next.get(key);
        if (!before || !after) return;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        cell.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
          duration: 460,
          easing: "cubic-bezier(0.22, 0.8, 0.24, 1)",
        });
      });
    }
    boxes.current = next;
    order.current = keys;
    width.current = window.innerWidth;
  });
}
