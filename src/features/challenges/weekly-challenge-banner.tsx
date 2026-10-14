"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { localizeChallenge } from "@/lib/challenge";
import { formatRelativeTime, tagHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useActiveChallenge } from "./use-active-challenge";

/**
 * The running weekly theme as a band on Home and Keşfet. Taking part = sharing
 * content with the theme's tag, so "Katıl" opens the create form with that tag
 * already chosen and "Katılımları gör" is the tag's page. Renders nothing when
 * no theme is running (or it could not be loaded).
 */
export function WeeklyChallengeBanner() {
  const { t, language } = useTranslation();
  const challenge = useActiveChallenge();
  if (!challenge) return null;
  const copy = localizeChallenge(challenge, language);

  return (
    <section aria-label={t("challenge.eyebrow")} className="rounded-lg border border-border-soft bg-surface-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
        <span className="flex items-center gap-1.5 text-primary">
          <Trophy size={14} strokeWidth={1.75} aria-hidden />
          {t("challenge.eyebrow")}
        </span>
        <span className="normal-case tracking-normal font-medium">{t("challenge.endsIn", { time: formatRelativeTime(challenge.endsAt, language) })}</span>
      </div>
      <h2 className="mt-2 text-h3 font-semibold text-text break-words">{copy.title}</h2>
      {copy.description && <p className="mt-1 text-small text-text-secondary break-words">{copy.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/create?tag=${encodeURIComponent(challenge.tagSlug)}`} className={buttonClassName({ size: "sm" })}>
          {t("challenge.join")}
        </Link>
        <Link href={tagHref({ slug: challenge.tagSlug })} className={buttonClassName({ size: "sm", variant: "outline" })}>
          {t("challenge.seeEntries")} · #{challenge.tagLabel}
        </Link>
      </div>
    </section>
  );
}
