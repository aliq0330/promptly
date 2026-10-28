"use client";

import { useState } from "react";
import Link from "next/link";
import { UserX, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { useLikeState } from "@/features/prompts/use-like-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { REACTION_KEYS, REACTION_LABEL, type ReactionCounts, type ReactionKey } from "@/lib/reactions";
import { fetchReactorsPage, type Reactor } from "@/lib/supabase/reactions";
import type { LikeableContentType } from "@/lib/supabase/likes";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import { ReactionIcon } from "./reaction-icon";

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-1 py-2.5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </li>
  );
}

function ReactorRow({ reactor, mine, onRemove, onNavigate }: { reactor: Reactor; mine: boolean; onRemove: () => void; onNavigate: () => void }) {
  const { t, language } = useTranslation();
  const time = formatRelativeTime(reactor.createdAt, language);
  const profile = reactor.user;
  const reaction = (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-caption font-semibold text-text-muted">
      <ReactionIcon reaction={reactor.reaction} size={28} />
      <span>{t(REACTION_LABEL[reactor.reaction])}</span>
    </span>
  );

  if (!profile) {
    return (
      <li className="flex items-center gap-3 px-1 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-muted">
          <UserX size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-semibold text-text-secondary">{t("statistics.deletedUser")}</p>
          <p className="text-caption text-text-muted">{time}</p>
        </div>
        {reaction}
      </li>
    );
  }

  return (
    <li data-reactor={profile.username} className={cn("flex items-center gap-3 rounded-lg px-1 py-2.5", mine && "bg-primary-soft/60 px-2")}>
      <Link href={profileHref(profile)} onClick={onNavigate} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Avatar src={profile.avatarUrl} alt={profile.displayName} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={profileHref(profile)} onClick={onNavigate} className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="block truncate text-small font-semibold text-text">
            {profile.displayName}
            {mine && <span className="ml-1.5 rounded-xs bg-surface px-1.5 py-0.5 text-caption font-semibold text-primary">{t("reaction.sheet.you")}</span>}
          </span>
          <span className="block truncate text-caption text-text-muted">
            @{profile.username} · {time}
          </span>
        </Link>
        {mine && (
          <button type="button" onClick={onRemove} className="mt-0.5 rounded-xs text-caption font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {t("reaction.sheet.removeMine")}
          </button>
        )}
      </div>
      {reaction}
    </li>
  );
}

/**
 * "Tepkiler": who reacted with what (docs/history/265-*). Total + one tab per reaction that was given (counts from `reaction_stats`), then the
 * people newest first, each with their reaction's emoji and name. A page at a time (`usePagedList`, auto "load more"). The viewer's own row is marked
 * and can take the reaction back from here. Bottom sheet on a phone, centred dialog from `sm` (the shared `Modal`).
 */
export function ReactionSheet({
  contentType,
  id,
  likeCount,
  counts,
  onClose,
}: {
  contentType: LikeableContentType;
  id: string;
  likeCount: number;
  counts: ReactionCounts;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { react, likeCount: total } = useLikeState(id, likeCount, contentType);
  const [tab, setTab] = useState<"all" | ReactionKey>("all");
  const tabs = REACTION_KEYS.filter((key) => counts[key] > 0);
  // The viewer removed the only reaction of the tab they are looking at: that tab is gone, back to "all".
  const active = tab === "all" || tabs.includes(tab) ? tab : "all";
  const list = usePagedList<Reactor>(`reactors|${contentType}|${id}|${active}`, true, (offset) => fetchReactorsPage(contentType, id, active === "all" ? null : active, offset), (row) => row.key);

  return (
    <Modal onClose={onClose} labelledBy="reaction-sheet-title">
      <div
        className="flex h-[640px] max-h-[75dvh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4">
          <div className="min-w-0">
            <h2 id="reaction-sheet-title" className="text-h3 font-semibold text-text">
              {t("reaction.sheet.title")}
            </h2>
            <p className="text-caption text-text-muted tabular-nums">{t("reaction.sheet.total", { count: total })}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={18} />
          </button>
        </div>

        <ScrollRow className="shrink-0 border-b border-border-soft px-3 pb-2.5" aria-label={t("reaction.sheet.tabsAria")}>
          <div role="tablist" aria-label={t("reaction.sheet.tabsAria")} className="flex gap-1.5">
            {(["all", ...tabs] as ("all" | ReactionKey)[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active === key}
                aria-label={key === "all" ? undefined : `${t(REACTION_LABEL[key])} ${counts[key]}`}
                onClick={() => setTab(key)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-small font-semibold tabular-nums transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active === key ? "border-border bg-primary-soft text-primary" : "border-transparent text-text-muted hover:bg-surface-soft hover:text-text",
                )}
              >
                {key === "all" ? (
                  <>
                    {t("reaction.sheet.all")} {total}
                  </>
                ) : (
                  <>
                    <ReactionIcon reaction={key} size={20} />
                    {counts[key]}
                  </>
                )}
              </button>
            ))}
          </div>
        </ScrollRow>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1" role="tabpanel">
          <PagedListState
            list={list}
            skeleton={
              <ul aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
                {Array.from({ length: 6 }, (_, index) => (
                  <RowSkeleton key={index} />
                ))}
              </ul>
            }
          >
            {list.items.length === 0 ? (
              <EmptyState compact icon={X} title={t("reaction.sheet.empty")} className="m-2" />
            ) : (
              <ul className="divide-y divide-border-soft">
                {list.items.map((reactor) => (
                  <ReactorRow key={reactor.key} reactor={reactor} mine={reactor.key === user?.id} onRemove={() => void react(null).then(list.refresh)} onNavigate={onClose} />
                ))}
              </ul>
            )}
          </PagedListState>
        </div>
      </div>
    </Modal>
  );
}
