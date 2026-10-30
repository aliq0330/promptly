"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { DemoAccountBadge } from "@/components/ui/demo-badge";
import { ScrollRow } from "@/components/ui/scroll-row";
import { FollowButton } from "@/features/profile/follow-button";
import { announceNotice } from "@/lib/app-notice";
import {
  CREATOR_PAUSE_STORAGE_KEY,
  CREATOR_SHOWN_STORAGE_KEY,
  CREATOR_STRIP_PAUSE_MS,
  CREATOR_STRIP_POOL,
  creatorStripPausedUntil,
  creatorStripSlice,
  orderCreatorPool,
  parseShownMap,
  recordShownSuggestions,
} from "@/lib/creator-suggestions";
import { friendlyServerMessage } from "@/lib/supabase/server-errors";
import { dismissCreatorSuggestion, fetchSuggestedCreators, type SuggestedCreator } from "@/lib/supabase/creator-suggestions";
import { useTranslation } from "@/lib/i18n/language-provider";
import { profileHref } from "@/lib/utils";

/**
 * "Takip edilecek kişiler" (docs/history/285-*): a strip of people to follow between the posts of Ana Sayfa (both tabs, signed in only).
 * One hook owns the candidate pool of the list (`suggest_creators`, ranked on the server by the viewer's own signals) and cuts it into strips;
 * `CreatorStripSlot` draws one strip at a slot of `FeedGrid` (`lib/creator-suggestions.ts` decides which posts are slots).
 * Dismissing a person (✕ on the card) is stored on the server; the header ✕ only keeps the strips away for a few hours on this device.
 */

/** The pool is kept for a few minutes so a Back to Ana Sayfa does not ask the server again (the page is reloaded on an account change). */
const POOL_TTL_MS = 3 * 60 * 1000;
let poolCache: { at: number; pool: SuggestedCreator[] } | null = null;

export interface CreatorStrips {
  /** The people of the `ordinal`-th strip (people dismissed in it already left out); empty = nothing to draw. */
  peopleFor: (ordinal: number) => SuggestedCreator[];
  dismiss: (id: string) => void;
  /** Header ✕: no strip for a while, on every list. */
  pause: () => void;
  paused: boolean;
  /** Remembers that these people were on screen (they wait a week before the next strip repeats them). */
  noteShown: (ids: string[]) => void;
}

function readPausedUntil(): number {
  try {
    return creatorStripPausedUntil(window.localStorage.getItem(CREATOR_PAUSE_STORAGE_KEY), Date.now());
  } catch {
    return 0;
  }
}

function readShown() {
  try {
    return parseShownMap(window.localStorage.getItem(CREATOR_SHOWN_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function useCreatorStrips(enabled: boolean): CreatorStrips | undefined {
  const { t } = useTranslation();
  const [pool, setPool] = useState<SuggestedCreator[] | null>(() => (poolCache && Date.now() - poolCache.at < POOL_TTL_MS ? poolCache.pool : null));
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [pausedUntil, setPausedUntil] = useState(readPausedUntil);
  const paused = pausedUntil > 0;

  useEffect(() => {
    if (!enabled || paused || pool !== null) return;
    let cancelled = false;
    fetchSuggestedCreators(CREATOR_STRIP_POOL)
      .then((candidates) => {
        if (cancelled) return;
        const ordered = orderCreatorPool(
          candidates.map((candidate) => ({ ...candidate, id: candidate.profile.id })),
          readShown(),
          Date.now(),
        );
        poolCache = { at: Date.now(), pool: ordered };
        setPool(ordered);
      })
      .catch((err) => {
        // No suggestions this time: the posts simply continue without a strip.
        console.error("fetchSuggestedCreators", err);
        if (!cancelled) setPool([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, paused, pool]);

  const peopleFor = useCallback(
    (ordinal: number) => creatorStripSlice(pool ?? [], ordinal).filter((candidate) => !dismissed.has(candidate.profile.id)),
    [pool, dismissed],
  );

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => new Set(prev).add(id));
      dismissCreatorSuggestion(id)
        .then(() => {
          if (poolCache) poolCache = { ...poolCache, pool: poolCache.pool.filter((candidate) => candidate.profile.id !== id) };
        })
        .catch((err: unknown) => {
          console.error("dismissCreatorSuggestion", err);
          setDismissed((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          // A known server code (rate limit) was already announced by the request layer.
          const message = err instanceof Error ? err.message : "";
          if (message !== friendlyServerMessage("rate_limit")) announceNotice(t("creators.dismissFailed"));
        });
    },
    [t],
  );

  const pause = useCallback(() => {
    const until = Date.now() + CREATOR_STRIP_PAUSE_MS;
    setPausedUntil(until);
    try {
      window.localStorage.setItem(CREATOR_PAUSE_STORAGE_KEY, String(until));
    } catch {
      /* storage blocked — the pause only lasts for this page view */
    }
  }, []);

  const noteShown = useCallback((ids: string[]) => {
    try {
      window.localStorage.setItem(CREATOR_SHOWN_STORAGE_KEY, JSON.stringify(recordShownSuggestions(readShown(), ids, Date.now())));
    } catch {
      /* storage blocked — the repeat rule just does not apply */
    }
  }, []);

  return useMemo(() => (enabled ? { peopleFor, dismiss, pause, paused, noteShown } : undefined), [enabled, peopleFor, dismiss, pause, paused, noteShown]);
}

/**
 * One strip at a slot of the list. It draws nothing (no box, no spacing) while the pool loads, when it is empty, when the viewer paused
 * the strips or when every person of this strip was dismissed — the slot's wrapper in `FeedGrid` stays, so the cards never re-flow.
 */
export function CreatorStripSlot({ strips, ordinal }: { strips: CreatorStrips; ordinal: number }) {
  const { t } = useTranslation();
  const people = strips.peopleFor(ordinal);
  const { noteShown, paused } = strips;
  const key = people.map((candidate) => candidate.profile.id).join(",");
  const noted = useRef("");
  useEffect(() => {
    if (!key || paused || noted.current === key) return;
    noted.current = key;
    noteShown(key.split(","));
  }, [key, paused, noteShown]);

  if (paused || people.length === 0) return null;
  return (
    <section aria-labelledby={`creator-strip-${ordinal}`} data-creator-strip className="pb-5 sm:pb-6">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 id={`creator-strip-${ordinal}`} className="text-h3 text-text">
          {t("creators.strip.title")}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <Link href="/discover?section=creators" data-creator-strip-all className="rounded-sm px-1 text-small font-medium text-text-secondary transition-colors duration-200 hover:text-text">
            {t("common.viewAll")}
          </Link>
          <button
            type="button"
            onClick={strips.pause}
            data-creator-strip-pause
            aria-label={t("creators.strip.hide")}
            title={t("creators.strip.hide")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors duration-200 hover:bg-surface-soft hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
      <ScrollRow as="ul" className="-mx-3 snap-x scroll-px-3 gap-2.5 px-3 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0" data-testid="creator-strip-list">
        {people.map((candidate) => (
          <CreatorCard key={candidate.profile.id} candidate={candidate} onDismiss={() => strips.dismiss(candidate.profile.id)} />
        ))}
      </ScrollRow>
    </section>
  );
}

function CreatorCard({ candidate, onDismiss }: { candidate: SuggestedCreator; onDismiss: () => void }) {
  const { t } = useTranslation();
  const { profile, reason } = candidate;
  const reasonText =
    reason.kind === "mutual" && reason.ref
      ? reason.count > 1
        ? t("creators.reason.mutualMany", { name: reason.ref, count: reason.count - 1 })
        : t("creators.reason.mutual", { name: reason.ref })
      : reason.kind === "liked"
        ? t("creators.reason.liked")
        : reason.kind === "tag" && reason.ref
          ? t("creators.reason.tag", { tag: reason.ref })
          : reason.kind === "tool"
            ? t("creators.reason.tool")
            : t("creators.reason.active");

  return (
    <li
      data-creator-card
      data-creator-id={profile.id}
      data-reason={reason.kind}
      className="relative flex w-[46%] shrink-0 snap-start flex-col items-center rounded-xl border border-border-soft bg-surface px-3 pb-3 pt-4 text-center shadow-card sm:w-44"
    >
      <button
        type="button"
        onClick={onDismiss}
        data-creator-dismiss
        aria-label={t("creators.dismissPerson", { name: profile.displayName })}
        title={t("creators.dismissPerson", { name: profile.displayName })}
        className="absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors duration-200 hover:bg-surface-soft hover:text-text"
      >
        <X size={16} aria-hidden />
      </button>
      <Link href={profileHref(profile)} className="flex min-w-0 flex-col items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Avatar src={profile.avatarUrl} alt="" size={72} />
        <span className="w-full min-w-0 space-y-0.5">
          <span className="block truncate text-label font-semibold text-text">{profile.displayName}</span>
          {profile.isDemo && <DemoAccountBadge />}
        </span>
      </Link>
      <p className="mt-1 line-clamp-2 min-h-[2.5rem] w-full break-words text-caption text-text-muted" data-creator-reason>
        {reasonText}
      </p>
      <FollowButton user={profile} size="md" className="mt-2 w-full" />
    </li>
  );
}
