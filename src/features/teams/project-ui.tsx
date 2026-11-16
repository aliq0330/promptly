"use client";

import type { ReactNode } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { REVIEW_STATE_TONE, type ProjectRole, type ReviewState } from "@/lib/team-projects";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Ekip projeleri ortak küçük parçaları (docs/history/362-*): rol rozeti ve onay durumu rozeti. Renk tek başına anlam taşımaz:
 * rozet HER ZAMAN metin de gösterir (taslak / onay bekliyor / onaylı / değişiklik istendi).
 */
const ROLE_KEY: Record<ProjectRole, TranslationKey> = { lead: "tp.role.lead", edit: "tp.role.edit", view: "tp.role.view" };
export const projectRoleLabelKey = (role: ProjectRole): TranslationKey => ROLE_KEY[role];

export function ProjectRoleChip({ role, className }: { role: ProjectRole; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant={role === "lead" ? "default" : "neutral"} className={cn("shrink-0", className)} data-project-role={role}>
      {t(ROLE_KEY[role])}
    </Badge>
  );
}

const REVIEW_KEY: Record<ReviewState, TranslationKey> = {
  draft: "tp.review.draft",
  pending: "tp.review.pending",
  approved: "tp.review.approved",
  changes: "tp.review.changes",
};
export const reviewLabelKey = (state: ReviewState): TranslationKey => REVIEW_KEY[state];


export function ReviewChip({ state, className }: { state: ReviewState; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant={REVIEW_STATE_TONE[state]} className={cn("shrink-0 whitespace-nowrap", className)} data-review-state={state}>
      {t(REVIEW_KEY[state])}
    </Badge>
  );
}

/** Öğe rozeti: onaylı (ve kişisel Space) öğelerde HİÇ çizilmez; taslak / bekliyor / değişiklik istendi için çizilir. */
export function ItemReviewBadge({ state, className }: { state: ReviewState | undefined; className?: string }) {
  if (!state || state === "approved") return null;
  return <ReviewChip state={state} className={className} />;
}

/** Başlıklı kart bölümü (proje/dosya sayfaları): sol başlık + isteğe bağlı sağ eylem. */
export function ProjectSection({ title, hint, action, children, className, testId }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={cn("space-y-3", className)} data-testid={testId}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-h3 font-display font-bold text-text">{title}</h2>
        {hint && <span className="min-w-0 flex-1 text-caption text-text-muted">{hint}</span>}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      {children}
    </section>
  );
}
