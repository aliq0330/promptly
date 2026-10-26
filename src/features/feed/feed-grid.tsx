"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { QuoteCard } from "@/features/quotes/quote-card";
import { AnnouncedProvider } from "@/features/communities/announced-chip";
import { useTranslation } from "@/lib/i18n/language-provider";
import { feedItemKey, type FeedItem } from "./types";
import { Reveal } from "@/components/ui/reveal";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";
import { prefersReducedMotion } from "@/lib/motion";

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
}: {
  items: FeedItem[];
  /** A short line drawn above a card ("Sana özel"'s reason, docs/history/209-*). */
  itemNote?: (item: FeedItem) => ReactNode;
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

  // "Duyuruldu" çipleri (docs/history/215-*): görünen içeriklerin başvuru gönderileri tek istekte okunur.
  return (
    <AnnouncedProvider entries={items.flatMap((item) => (item.kind === "quote" ? [] : [{ kind: item.kind, id: item.data.id }]))}>
      <div ref={gridRef}>
        <ContentGrid columns={layout === "home" ? "sm:columns-2" : undefined}>
          {items.map((item, index) => (
            <div key={feedItemKey(item)} data-flip-key={feedItemKey(item)} className={CONTENT_GRID_ITEM_CLASS}>
              <Reveal index={index}>
                {itemNote?.(item)}
                {card(item)}
              </Reveal>
            </div>
          ))}
        </ContentGrid>
      </div>
    </AnnouncedProvider>
  );
}

/**
 * After a re-render, every card that is still there but sits somewhere else glides from its old box to the new one
 * (First-Last-Invert-Play with the Web Animations API — nothing is left behind once it ends, so no stacking context
 * stays around a card's ⋮ menu). New cards just appear (their `Reveal`); reduced motion skips it.
 */
function useFlipReorder(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const boxes = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const container = ref.current;
    if (!enabled || !container) {
      boxes.current.clear();
      return;
    }
    const next = new Map<string, DOMRect>();
    const cells = container.querySelectorAll<HTMLElement>("[data-flip-key]");
    cells.forEach((cell) => next.set(cell.dataset.flipKey as string, cell.getBoundingClientRect()));
    if (!prefersReducedMotion()) {
      cells.forEach((cell) => {
        const before = boxes.current.get(cell.dataset.flipKey as string);
        const after = next.get(cell.dataset.flipKey as string);
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
  });
}
