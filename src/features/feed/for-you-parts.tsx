"use client";

import { useState } from "react";
import { Flame, Hash, Heart, Sparkle, UserCheck, Wrench, type LucideIcon } from "lucide-react";
import { Chip } from "@/components/ui/chip";
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
 * "Sana özel"'s interest chips (docs/history/209-*): the same `profiles.interests` the profile editor sets, so a pick here
 * is real and shows on the profile too. Saved at once (only this column), then the feed re-ranks (`onChanged`); a failed
 * save puts the previous picks back and says so.
 */
export function ForYouInterests({ onChanged }: { onChanged: () => void }) {
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
    <section aria-labelledby="for-you-interests" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 id="for-you-interests" className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
          {t("forYou.interestsTitle")}
        </h2>
        <p className="text-caption text-text-muted">{t("forYou.interestsHint")}</p>
      </div>
      <div className="scrollbar-none -mx-3 flex touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:flex-wrap sm:px-0">
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
