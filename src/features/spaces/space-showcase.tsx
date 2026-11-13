"use client";

import { useState } from "react";
import { Coverflow, CoverflowArrows } from "@/components/ui/coverflow";
import { stepIndex } from "@/lib/coverflow";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { SpaceItem } from "@/lib/supabase/spaces";
import { SpaceImage } from "./space-visuals";
import { useItemTitle } from "./space-items";

/** Most pictures the gallery carries; the full list stays in the grid below it. */
export const SPACE_SHOWCASE_MAX = 12;
/** Fewer than this and a coverflow would be mostly empty stage. */
export const SPACE_SHOWCASE_MIN = 3;

/**
 * The cover of the Space's "Görseller" tab for someone who is not a member (docs/history/346-*): the vitrin the Space shows
 * outsiders (`214-*`) opens on a coverflow of its newest pictures instead of going straight to the grid. A tap on a side picture
 * brings it forward, a tap on the centre one opens the same detail window the grid opens. `items` are already limited to
 * pictures the viewer can actually see (an unreadable source is never drawn), newest first.
 */
export function SpaceShowcase({ items, onOpen }: { items: SpaceItem[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const itemTitle = useItemTitle();
  const [active, setActive] = useState(0);
  const current = items[active];

  return (
    <section aria-label={t("spaces.images.showcaseAria")} className="overflow-hidden rounded-lg border border-border-soft bg-surface-soft" data-testid="space-showcase">
      <Coverflow
        items={items}
        active={active}
        onActiveChange={setActive}
        itemKey={(item) => item.id}
        itemLabel={itemTitle}
        label={t("spaces.images.showcaseAria")}
        aspect={4 / 3}
        widthShare={0.4}
        className="h-[15rem] sm:h-[19rem]"
        onActiveClick={(item) => onOpen(item.id)}
        renderCard={(item) => <SpaceImage url={item.mediaUrl} alt="" className="h-full w-full" />}
      />
      <div className="flex items-center gap-3 px-4 pb-4 pt-1 sm:px-5" aria-live="polite">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-body font-bold text-text">{current ? itemTitle(current) : ""}</p>
          <p className="text-caption text-text-muted">{t("spaces.images.showcaseHint")}</p>
        </div>
        <CoverflowArrows onPrev={() => setActive(stepIndex(active, -1, items.length))} onNext={() => setActive(stepIndex(active, 1, items.length))} />
      </div>
    </section>
  );
}
