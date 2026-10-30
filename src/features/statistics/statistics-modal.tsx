"use client";

import { useState } from "react";
import { Bookmark, Copy, Heart, MessageCircle, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { ReactionIcon } from "@/features/reactions/reaction-icon";
import { useReactionBreakdown } from "@/features/reactions/reaction-breakdown";
import { REACTION_KEYS, REACTION_LABEL, type ReactionKey } from "@/lib/reactions";
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
  /** Ignored for prompt requests (not savable) and for community posts unless `savable`. */
  saveCount?: number;
  /** Community posts only: an application post of a savable type (prompt/workflow/preset) can be saved (docs/history/184-*). */
  savable?: boolean;
  /** Prompts only (`prompts.copy_count`): shown as a fourth summary tile; there is no per-person list for it. */
  copyCount?: number;
}

/** The bar's colour per reaction — semantic tokens only; the emoji next to each count is what names it. */
const REACTION_TONE: Record<ReactionKey, string> = {
  love: "bg-danger",
  fire: "bg-secondary",
  wow: "bg-primary",
  clap: "bg-success",
  haha: "bg-warning",
  idea: "bg-text-secondary",
};

/**
 * The ONE statistics surface for all four post types (prompt, prompt
 * request, generator, workflow — CLAUDE.md Bölüm 9.82): summary tiles that ARE the
 * Reacted / Commenters / Saved-by tabs (docs/history/281-*), a reaction mix bar, real Supabase data, pagination. Bottom sheet on mobile, centered dialog from `sm` up (the
 * shared `Modal` shell); the panel has a FIXED height so switching tabs or
 * loading never makes it jump. Requests have no save feature, so they get
 * two tabs/tiles instead of three.
 */
export function StatisticsModal({ target, onClose }: { target: StatisticsTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { contentType, contentId } = target;
  const canSave = contentType === "request" || contentType === "space" || contentType === "quote" ? false : contentType === "community_post" ? target.savable === true : true;
  const kinds: StatisticsKind[] = canSave ? ["likes", "comments", "saves"] : ["likes", "comments"];
  const [active, setActive] = useState<StatisticsKind>("likes");
  const copyCount = target.copyCount;
  const tileCount = kinds.length + (copyCount === undefined ? 0 : 1);

  // Live totals — the same shared stores the Like/Save/Comment buttons write to.
  const likes = useEngagementEntry("like", contentType, contentId, target.likeCount).count;
  const saves = useEngagementEntry("save", contentType, contentId, target.saveCount ?? 0).count;
  const commentDelta = useCommentCountDelta(contentId);
  const totals: Record<StatisticsKind, number> = {
    likes,
    comments: Math.max(0, target.commentCount + commentDelta),
    saves,
  };
  const breakdown = useReactionBreakdown(contentType, contentId, user?.id ?? null, active === "likes" && likes > 0);
  const mix = REACTION_KEYS.filter((key) => breakdown.counts[key] > 0);

  // All three hooks always run (hooks can't be conditional); a tab's first
  // page is only fetched once it's been opened.
  const [opened, setOpened] = useState<Set<StatisticsKind>>(() => new Set(["likes"]));
  const likesList = useEngagers(contentType, contentId, "likes", opened.has("likes"));
  const commentsList = useEngagers(contentType, contentId, "comments", opened.has("comments"));
  const savesList = useEngagers(contentType, contentId, "saves", opened.has("saves") && canSave);
  const lists = { likes: likesList, comments: commentsList, saves: savesList };

  function selectTab(kind: StatisticsKind) {
    setActive(kind);
    setOpened((previous) => (previous.has(kind) ? previous : new Set(previous).add(kind)));
  }

  const activeMeta = KIND_META[active];

  return (
    <Modal onClose={onClose} labelledBy="statistics-title">
      <div
        className="flex h-[640px] max-h-[75dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border-soft bg-surface shadow-pop"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5">
          <h2 id="statistics-title" className="font-display text-h2 font-bold text-text">
            {t("statistics.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-soft text-text transition-colors hover:bg-border-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div role="tablist" aria-label={t("statistics.tabsAria")} className={cn("grid shrink-0 gap-2 px-4 sm:gap-2.5 sm:px-5", tileCount === 4 ? "grid-cols-4" : tileCount === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {kinds.map((kind) => {
            const Icon = KIND_META[kind].icon;
            const selected = active === kind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`${t(KIND_META[kind].tab)} ${formatCount(totals[kind])}`}
                onClick={() => selectTab(kind)}
                className={cn(
                  "flex min-w-0 flex-col items-start gap-0.5 rounded-lg border-[1.5px] px-2 pb-2 pt-2.5 text-left transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3.5 sm:pt-3",
                  selected ? "border-primary bg-primary-soft text-primary" : "border-transparent bg-surface-soft text-text-secondary hover:bg-border-soft",
                )}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                <span aria-hidden className="font-display text-h2 font-bold leading-tight tabular-nums">{formatCount(totals[kind])}</span>
                <span aria-hidden className="max-w-full truncate text-caption font-medium">{t(KIND_META[kind].tile)}</span>
              </button>
            );
          })}
          {copyCount !== undefined && (
            <div className="flex min-w-0 flex-col items-start gap-0.5 rounded-lg border-[1.5px] border-dashed border-border px-2 pb-2 pt-2.5 text-text-secondary sm:px-3.5 sm:pt-3">
              <Copy size={16} strokeWidth={1.75} aria-hidden />
              <span className="font-display text-h2 font-bold leading-tight tabular-nums">{formatCount(copyCount)}</span>
              <span className="max-w-full truncate text-caption font-medium">{t("statistics.tileCopies")}</span>
            </div>
          )}
        </div>

        {active === "likes" && mix.length > 0 && (
          <div className="shrink-0 px-5 pt-4">
            <div aria-hidden className="flex h-2.5 gap-0.5">
              {mix.map((key) => (
                <span key={key} style={{ flexGrow: breakdown.counts[key], flexBasis: 0 }} className={cn("rounded-full", REACTION_TONE[key])} />
              ))}
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {mix.map((key) => (
                <li key={key} aria-label={`${t(REACTION_LABEL[key])} ${breakdown.counts[key]}`} className="inline-flex items-center gap-1.5 text-small tabular-nums text-text-secondary">
                  <ReactionIcon reaction={key} size={18} />
                  <strong className="font-semibold text-text">{breakdown.counts[key]}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border-soft" role="tabpanel">
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
