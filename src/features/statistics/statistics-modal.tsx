"use client";

import { useState } from "react";
import { Bookmark, Heart, MessageCircle, SlidersHorizontal, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useEngagementEntry } from "@/features/content/engagement-store";
import { useCommentCountDelta } from "@/features/prompts/comment-count-store";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { StatisticsContentType, StatisticsKind } from "@/lib/supabase/content-statistics";
import { cn, formatCount } from "@/lib/utils";
import { UserInteractionList } from "./user-interaction-list";
import { useEngagers } from "./use-engagers";

const KIND_META: Record<StatisticsKind, { icon: LucideIcon; tab: TranslationKey; tile: TranslationKey }> = {
  likes: { icon: Heart, tab: "statistics.tabLikes", tile: "statistics.tileLikes" },
  comments: { icon: MessageCircle, tab: "statistics.tabComments", tile: "statistics.tileComments" },
  saves: { icon: Bookmark, tab: "statistics.tabSaves", tile: "statistics.tileSaves" },
};

export interface StatisticsTarget {
  contentType: StatisticsContentType;
  contentId: string;
  /** Counts the post was loaded with — the modal layers the live session deltas on top (same stores the action buttons use). */
  likeCount: number;
  commentCount: number;
  /** Ignored for prompt requests — they can't be saved. */
  saveCount?: number;
  /** Hazır Ayar only — how many times "Bu hazır ayarı kullan" was pressed (`presets.use_count`); shown as a fourth tile. */
  useCount?: number;
}

/**
 * The ONE statistics surface for all four post types (prompt, prompt
 * request, generator, workflow — CLAUDE.md Bölüm 9.82): summary tiles +
 * Liked by / Commenters / Saved by tabs, real Supabase data, keyset
 * pagination. Bottom sheet on mobile, centered dialog from `sm` up (the
 * shared `Modal` shell); the panel has a FIXED height so switching tabs or
 * loading never makes it jump. Requests have no save feature, so they get
 * two tabs/tiles instead of three.
 */
export function StatisticsModal({ target, onClose }: { target: StatisticsTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const { contentType, contentId } = target;
  const kinds: StatisticsKind[] = contentType === "request" ? ["likes", "comments"] : ["likes", "comments", "saves"];
  const [active, setActive] = useState<StatisticsKind>("likes");

  // Live totals — the same shared stores the Like/Save/Comment buttons write to.
  const likes = useEngagementEntry("like", contentType, contentId, target.likeCount).count;
  const saves = useEngagementEntry("save", contentType, contentId, target.saveCount ?? 0).count;
  const commentDelta = useCommentCountDelta(contentId);
  const totals: Record<StatisticsKind, number> = {
    likes,
    comments: Math.max(0, target.commentCount + commentDelta),
    saves,
  };

  // All three hooks always run (hooks can't be conditional); a tab's first
  // page is only fetched once it's been opened.
  const [opened, setOpened] = useState<Set<StatisticsKind>>(() => new Set(["likes"]));
  const likesList = useEngagers(contentType, contentId, "likes", opened.has("likes"));
  const commentsList = useEngagers(contentType, contentId, "comments", opened.has("comments"));
  const savesList = useEngagers(contentType, contentId, "saves", opened.has("saves") && contentType !== "request");
  const lists = { likes: likesList, comments: commentsList, saves: savesList };

  function selectTab(kind: StatisticsKind) {
    setActive(kind);
    setOpened((previous) => (previous.has(kind) ? previous : new Set(previous).add(kind)));
  }

  const tabItems: TabItem<StatisticsKind>[] = kinds.map((kind) => ({ key: kind, label: t(KIND_META[kind].tab), icon: KIND_META[kind].icon }));
  const activeMeta = KIND_META[active];

  return (
    <Modal onClose={onClose} labelledBy="statistics-title">
      <div
        className="flex h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg sm:h-[640px] sm:max-h-[88dvh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
          <h2 id="statistics-title" className="text-h3 font-semibold text-text">
            {t("statistics.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className={cn("grid gap-2 px-4", kinds.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {kinds.map((kind) => {
            const Icon = KIND_META[kind].icon;
            return (
              <div key={kind} className="flex flex-col items-center gap-0.5 rounded-md border border-border-soft bg-surface-soft px-2 py-2.5">
                <Icon size={16} strokeWidth={1.75} className="text-primary" aria-hidden />
                <span className="text-h3 font-semibold tabular-nums text-text">{formatCount(totals[kind])}</span>
                <span className="text-caption text-text-muted">{t(KIND_META[kind].tile)}</span>
              </div>
            );
          })}
        </div>

        {typeof target.useCount === "number" && (
          <p className="mx-4 mt-2 flex items-center justify-center gap-1.5 rounded-md border border-border-soft bg-surface-soft px-2 py-2 text-small font-medium text-text-secondary">
            <SlidersHorizontal size={14} strokeWidth={1.75} className="text-primary" aria-hidden />
            {t("preset.useCount", { count: formatCount(target.useCount) })}
          </p>
        )}

        <div className="mt-3 px-4">
          <Tabs items={tabItems} active={active} onChange={selectTab} ariaLabel={t("statistics.tabsAria")} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1" role="tabpanel">
          <UserInteractionList
            key={active}
            kind={active}
            icon={activeMeta.icon}
            list={lists[active]}
            onNavigate={onClose}
          />
        </div>
      </div>
    </Modal>
  );
}

