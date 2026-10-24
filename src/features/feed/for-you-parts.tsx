"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Flame, Hash, Heart, RotateCw, SlidersHorizontal, Sparkle, UserCheck, Wrench, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { INTEREST_OPTION_LABELS, INTEREST_OPTIONS, type InterestOption } from "@/features/profile/interest-options";
import { useTranslation } from "@/lib/i18n/language-provider";
import { updateOwnInterests } from "@/lib/supabase/profiles";
import { findTool } from "@/lib/ai-tool-catalog";
import type { ForYouReason } from "@/lib/supabase/feed";
import type { FeedItem } from "./types";

function interestLabel(value: string, t: ReturnType<typeof useTranslation>["t"]): string {
  return (INTEREST_OPTIONS as readonly string[]).includes(value) ? t(INTEREST_OPTION_LABELS[value as InterestOption]) : value;
}

/**
 * The interest chips (docs/history/209-*, moved out of the feed in 222-*): the same `profiles.interests` the profile editor sets, so a pick
 * here is real and shows on the profile too. They are a LASTING preference that adds weight to matching posts in "Sana özel" — not a
 * filter — so they live in the settings sheet / the first-time card, not above the feed. Saved at once (only this column), then
 * `onChanged` (the feed re-ranks); a failed save puts the previous picks back and says so.
 */
export function InterestChips({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile, setProfile } = useOwnProfile();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const chosen = optimistic ?? profile?.interests ?? [];

  async function toggle(value: InterestOption) {
    if (!user || saving) return;
    const previous = chosen;
    const next = previous.includes(value) ? previous.filter((v) => v !== value) : [...previous, value];
    setOptimistic(next);
    setSaving(true);
    setFailed(false);
    try {
      const saved = await updateOwnInterests(user.id, next);
      setProfile(saved);
      setOptimistic(null);
      onChanged();
    } catch (err) {
      console.error("updateOwnInterests", err);
      setOptimistic(null);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div role="group" aria-label={t("forYou.interestsTitle")} className="flex flex-wrap gap-1.5">
        {INTEREST_OPTIONS.map((value) => (
          <Chip key={value} selected={chosen.includes(value)} onClick={() => void toggle(value)} disabled={saving} className="disabled:opacity-60">
            {t(INTEREST_OPTION_LABELS[value])}
          </Chip>
        ))}
      </div>
      {failed && (
        <p className="text-small text-danger" role="alert">
          {t("forYou.interestsSaveFailed")}
        </p>
      )}
    </div>
  );
}

/**
 * The row above the "Sana özel" feed: "Yenile" (re-rank from the top as of now — the order is frozen for the session, so new posts
 * only show after this) and "Sana özel'i ayarla" (the settings sheet: interests + what else shapes the feed).
 */
export function ForYouToolbar({ onRefresh, onChanged, refreshing }: { onRefresh: () => void; onChanged: () => void; refreshing: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <div className="flex items-center justify-end gap-2" data-for-you-toolbar>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-1.5">
        <RotateCw size={14} aria-hidden className={refreshing ? "animate-spin" : undefined} />
        {t("forYou.refresh")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog" className="gap-1.5">
        <SlidersHorizontal size={14} aria-hidden />
        {t("forYou.settings")}
      </Button>
      {open && (
        <Modal onClose={() => setOpen(false)} labelledBy={titleId}>
          <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
              <h2 id={titleId} className="text-h3 font-semibold text-text">
                {t("forYou.settingsTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("common.close")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
              <section className="space-y-2.5">
                <h3 className="text-label font-semibold text-text">{t("forYou.interestsTitle")}</h3>
                <p className="text-caption text-text-muted">{t("forYou.interestsHint")}</p>
                <InterestChips onChanged={onChanged} />
              </section>
              <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-secondary">{t("forYou.settingsHow")}</p>
              <Link href="/discover" onClick={() => setOpen(false)} className="inline-flex text-small font-medium text-primary hover:text-primary-hover">
                {t("feed.goToDiscover")}
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * First-time card (docs/history/222-*): someone with no interests and no followed tag or AI tool gets a way to teach "Sana özel" what they
 * like, instead of a feed that can only say "popular" or an empty state that says nothing useful.
 */
export function ForYouSetupCard({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="for-you-setup" data-for-you-setup className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card">
      <div className="space-y-1">
        <h2 id="for-you-setup" className="text-h3 font-semibold text-text">
          {t("forYou.setupTitle")}
        </h2>
        <p className="text-small text-text-secondary">{t("forYou.setupDescription")}</p>
      </div>
      <InterestChips onChanged={onChanged} />
      <Link href="/discover" className="inline-flex text-small font-medium text-primary hover:text-primary-hover">
        {t("feed.goToDiscover")}
      </Link>
    </section>
  );
}

const REASON_ICON: Record<ForYouReason["kind"], LucideIcon> = {
  creator: UserCheck,
  tag: Hash,
  tool: Wrench,
  interest: Sparkle,
  liked_tag: Heart,
  popular: Flame,
};

/** The one-line reason above a "Sana özel" card — always the server's real signal (`for_you_page`). */
export function ForYouReasonNote({ item, reason }: { item: FeedItem; reason: ForYouReason | undefined }) {
  const { t } = useTranslation();
  // "Sana özel" never ranks a Space (docs/history/215-*); the guard narrows the item to a content post.
  if (!reason || item.kind === "space" || item.kind === "quote") return null;
  const tagLabel = (slug: string | null) => (slug ? (item.data.tags.find((tag) => tag.slug === slug)?.label ?? slug) : "");
  const person = item.kind === "workflow" || item.kind === "preset" ? item.data.creator : item.data.author;
  const text =
    reason.kind === "creator"
      ? t("forYou.reasonCreator", { name: person.displayName })
      : reason.kind === "tag"
        ? t("forYou.reasonTag", { tag: tagLabel(reason.ref) })
        : reason.kind === "tool"
          ? t("forYou.reasonTool", { tool: findTool(reason.ref ?? "")?.name ?? reason.ref ?? "" })
          : reason.kind === "interest"
            ? t("forYou.reasonInterest", { interest: interestLabel(reason.ref ?? "", t) })
            : reason.kind === "liked_tag"
              ? t("forYou.reasonLikedTag", { tag: tagLabel(reason.ref) })
              : t("forYou.reasonPopular");
  const Icon = REASON_ICON[reason.kind];
  return (
    <p className="mb-1.5 flex min-w-0 items-center gap-1.5 px-1 text-caption font-semibold text-text-secondary">
      <Icon size={13} strokeWidth={2} aria-hidden className="shrink-0 text-primary" />
      <span className="truncate">{text}</span>
    </p>
  );
}
