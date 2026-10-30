"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { PostMenuExtras, type PostMenuExtra } from "@/features/prompts/post-menu-extras";
import { announceNotice } from "@/lib/app-notice";
import { INTEREST_PROMPT_PAUSE_MS, interestPromptPausedUntil, isInterestPromptSlot } from "@/lib/interest-feedback";
import { friendlyServerMessage } from "@/lib/supabase/server-errors";
import { fetchContentInterests, interestKey, setContentInterest, type InterestTarget, type InterestValue } from "@/lib/supabase/content-interest";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { FeedItem } from "./types";

/**
 * "İlgimi çekiyor / çekmiyor" (docs/history/275-*): the card "Bu gönderi ilgini çekiyor mu?" under a post every so often, and the same two
 * answers in every post's ⋮ menu — on Ana Sayfa → Sana özel and on Keşfet. The answers teach "Sana özel" only (`for_you_page`); Keşfet's
 * own ranking is untouched. One hook owns the answers of a list; `InterestCardFrame` wraps each card.
 */

const PAUSE_KEY = "promptly-interest-card-paused-until";

function readPausedUntil(): number {
  try {
    return interestPromptPausedUntil(window.localStorage.getItem(PAUSE_KEY), Date.now());
  } catch {
    return 0;
  }
}

/** The post a feedback answer is about — null for a quote (no answer to give). */
export function interestTarget(item: FeedItem): (InterestTarget & { authorId: string }) | null {
  if (item.kind === "quote") return null;
  const authorId = item.kind === "workflow" || item.kind === "preset" ? item.data.creator.id : item.data.author.id;
  return { kind: item.kind, id: item.data.id, authorId };
}

export interface InterestFeedback {
  /** The viewer's answer for a post (`undefined` = none). */
  statusOf: (key: string) => InterestValue | undefined;
  /** Answers are known for this post (so the card never asks about a post that was already answered). */
  known: (key: string) => boolean;
  answer: (target: InterestTarget, value: InterestValue | null) => void;
  /** Sana özel: a post answered "çekmiyor" this session collapses into a note with "Geri al". */
  isHidden: (key: string) => boolean;
  undoHidden: (target: InterestTarget) => void;
  /** ✕ on the card: no card for a while, on every list. */
  pausePrompts: () => void;
  promptsPaused: boolean;
  viewerId: string | null;
}

/**
 * Keeps the viewer's answers for a list. `loadExisting` reads the answers already stored for the posts on screen (Keşfet shows posts the
 * viewer may have answered before; Sana özel never lists an answered post, so it skips the read). `hideOnDislike` is Sana özel's behaviour.
 */
export function useInterestFeedback(items: FeedItem[], options: { enabled: boolean; loadExisting: boolean; hideOnDislike: boolean }): InterestFeedback | undefined {
  const { enabled, loadExisting, hideOnDislike } = options;
  const { t } = useTranslation();
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const [answers, setAnswers] = useState<Record<string, InterestValue | null>>({});
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [pausedUntil, setPausedUntil] = useState(readPausedUntil);
  const requested = useRef(new Set<string>());
  const active = enabled && viewerId !== null;

  useEffect(() => {
    if (!active || !loadExisting) return;
    const fresh: InterestTarget[] = [];
    for (const item of items) {
      const target = interestTarget(item);
      if (!target) continue;
      const key = interestKey(target);
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      fresh.push(target);
    }
    if (fresh.length === 0) return;
    fetchContentInterests(fresh)
      .then((found) => {
        setAnswers((prev) => ({ ...found, ...prev }));
        setLoaded((prev) => new Set([...prev, ...fresh.map(interestKey)]));
      })
      .catch((err) => {
        // The answers could not be read: leave these posts without a card (never ask twice) and let the menu still work.
        console.error("fetchContentInterests", err);
        for (const target of fresh) requested.current.delete(interestKey(target));
      });
  }, [active, loadExisting, items]);

  const statusOf = useCallback((key: string) => answers[key] ?? undefined, [answers]);
  const known = useCallback((key: string) => !loadExisting || loaded.has(key) || key in answers, [loadExisting, loaded, answers]);

  const answer = useCallback(
    (target: InterestTarget, value: InterestValue | null) => {
      const key = interestKey(target);
      let previous: InterestValue | null | undefined;
      setAnswers((prev) => {
        previous = prev[key];
        return { ...prev, [key]: value };
      });
      setHidden((prev) => {
        const next = new Set(prev);
        if (value === "not_interested" && hideOnDislike) next.add(key);
        else next.delete(key);
        return next;
      });
      setContentInterest(target, value).catch((err: unknown) => {
        console.error("setContentInterest", err);
        setAnswers((prev) => ({ ...prev, [key]: previous ?? null }));
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        // A known server code (rate limit) was already announced by the request layer.
        const message = err instanceof Error ? err.message : "";
        if (message !== friendlyServerMessage("rate_limit")) announceNotice(t("interest.failed"));
      });
    },
    [hideOnDislike, t],
  );

  const pausePrompts = useCallback(() => {
    const until = Date.now() + INTEREST_PROMPT_PAUSE_MS;
    setPausedUntil(until);
    try {
      window.localStorage.setItem(PAUSE_KEY, String(until));
    } catch {
      /* storage blocked — the pause only lasts for this page view */
    }
  }, []);

  const isHidden = useCallback((key: string) => hidden.has(key), [hidden]);
  const undoHidden = useCallback((target: InterestTarget) => answer(target, null), [answer]);

  return useMemo(
    () =>
      active
        ? { statusOf, known, answer, isHidden, undoHidden, pausePrompts, promptsPaused: pausedUntil > 0, viewerId }
        : undefined,
    [active, statusOf, known, answer, isHidden, undoHidden, pausePrompts, pausedUntil, viewerId],
  );
}

/**
 * The card around one post of the list: the two answers in the post's ⋮ menu, the "Bu gönderi ilgini çekiyor mu?" strip under the post at
 * its slot, and — on Sana özel — the "Geri al" note that replaces a post the viewer just said they are not interested in.
 */
export function InterestCardFrame({ interest, item, index, children }: { interest: InterestFeedback; item: FeedItem; index: number; children: ReactNode }) {
  const { t } = useTranslation();
  const target = interestTarget(item);
  if (!target || target.authorId === interest.viewerId) return <>{children}</>;
  const key = interestKey(target);
  const status = interest.statusOf(key);

  if (interest.isHidden(key)) {
    return (
      <section data-interest-hidden className="rounded-xl border border-dashed border-border bg-surface-soft px-4 py-5 text-center">
        <p className="text-label font-semibold text-text">{t("interest.hiddenTitle")}</p>
        <p className="mt-0.5 text-small text-text-muted">{t("interest.hiddenHint")}</p>
        <button
          type="button"
          onClick={() => interest.undoHidden(target)}
          className="mt-3 inline-flex min-h-10 items-center rounded-full border border-border bg-surface px-5 text-label font-semibold text-primary transition-colors duration-200 hover:bg-surface-soft"
        >
          {t("interest.undo")}
        </button>
      </section>
    );
  }

  const toggle = (value: InterestValue) => interest.answer(target, status === value ? null : value);
  const extras: PostMenuExtra[] = [
    { key: "interest-yes", label: t("interest.yes"), icon: <Check size={14} aria-hidden />, selected: status === "interested", onSelect: () => toggle("interested") },
    { key: "interest-no", label: t("interest.no"), icon: <X size={14} aria-hidden />, selected: status === "not_interested", onSelect: () => toggle("not_interested") },
  ];

  return (
    <>
      <PostMenuExtras items={extras}>{children}</PostMenuExtras>
      {isInterestPromptSlot(index) && !interest.promptsPaused && interest.known(key) && (
        <InterestPromptStrip interest={interest} target={target} answered={status !== undefined} />
      )}
    </>
  );
}

/** "Bu gönderi ilgini çekiyor mu?" under a post: two pills and a ✕. After an answer it thanks for ~2 s and goes away. */
function InterestPromptStrip({ interest, target, answered }: { interest: InterestFeedback; target: InterestTarget; answered: boolean }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"ask" | "thanks" | "gone">("ask");
  useEffect(() => {
    if (phase !== "thanks") return;
    const timer = window.setTimeout(() => setPhase("gone"), 2200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // A post already answered (before, or from the menu) is not asked about again.
  if (phase === "gone" || (phase === "ask" && answered)) return null;

  if (phase === "thanks") {
    return (
      <StripShell data-interest-thanks role="status" className="px-3.5 py-3">
        <p className="flex items-center gap-2 text-label font-semibold text-text-secondary">
          <Check size={16} strokeWidth={2.2} aria-hidden className="text-primary" />
          {t("interest.thanks")}
        </p>
        <p className="mt-0.5 text-caption text-text-muted">{t("interest.thanksHint")}</p>
      </StripShell>
    );
  }

  function reply(value: InterestValue) {
    interest.answer(target, value);
    setPhase("thanks");
  }

  return (
    <StripShell data-interest-prompt aria-label={t("interest.promptTitle")} className="py-3 pl-3.5 pr-2.5">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-label font-semibold text-text">{t("interest.promptTitle")}</p>
        <button
          type="button"
          onClick={() => {
            interest.pausePrompts();
            setPhase("gone");
          }}
          aria-label={t("interest.dismiss")}
          className="-mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-200 hover:bg-surface hover:text-text"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 pr-1">
        <ReplyPill onClick={() => reply("not_interested")} icon={<X size={16} strokeWidth={2.2} aria-hidden />}>
          {t("interest.no")}
        </ReplyPill>
        <ReplyPill onClick={() => reply("interested")} icon={<Check size={16} strokeWidth={2.2} aria-hidden />} primary>
          {t("interest.yes")}
        </ReplyPill>
      </div>
    </StripShell>
  );
}

/**
 * The box under a post: a small notch on its top edge points UP at the post it is about (docs/history/276-*). The notch is a rotated square that
 * shares the box's fill and shows only its top-left borders, so it reads as one shape with the box.
 */
function StripShell({ className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { [data: `data-${string}`]: string | undefined }) {
  return (
    <section {...rest} className={cn("relative mt-3 rounded-xl border border-border-soft bg-surface-soft", className)}>
      <span aria-hidden data-interest-notch className="absolute -top-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-tl-[4px] border-l border-t border-border-soft bg-surface-soft" />
      {children}
    </section>
  );
}

function ReplyPill({ onClick, icon, primary, children }: { onClick: () => void; icon: ReactNode; primary?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-3 text-label font-semibold transition-colors duration-200 hover:bg-surface-elevated",
        primary ? "text-primary" : "text-text",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}
