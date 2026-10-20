"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { CardBandBackdrop } from "@/features/content/content-card";
import { Eyebrow } from "@/features/content/detail-parts";
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
    // Albüm (docs/history/203-*): a small band — the trophy as its art, the theme as the big title, one big "Katıl".
    <section aria-label={t("challenge.eyebrow")} data-challenge-band className="relative rounded-xl">
      <CardBandBackdrop className="rounded-xl" />
      <div className="relative flex flex-wrap items-start gap-x-4 gap-y-3 p-4 sm:p-5">
        <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-surface text-primary shadow-pop">
          <Trophy size={26} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1 basis-40 space-y-1">
          <Eyebrow tone="primary">{t("challenge.eyebrow")}</Eyebrow>
          <h2 className="break-words font-display text-[1.375rem] font-extrabold leading-tight tracking-[-0.02em] text-text">{copy.title}</h2>
          <p className="text-caption text-text-muted">{t("challenge.endsIn", { time: formatRelativeTime(challenge.endsAt, language) })}</p>
        </div>
        {copy.description && <p className="w-full break-words text-small text-text-secondary">{copy.description}</p>}
        <div className="flex w-full flex-wrap items-center gap-2">
          <Link href={`/create?tag=${encodeURIComponent(challenge.tagSlug)}`} className={buttonClassName({ size: "lg", className: "h-11 px-6 shadow-pop" })}>
            {t("challenge.join")}
          </Link>
          <Link href={tagHref({ slug: challenge.tagSlug })} className={buttonClassName({ size: "md", variant: "ghost", className: "h-11" })}>
            {t("challenge.seeEntries")} · #{challenge.tagLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
