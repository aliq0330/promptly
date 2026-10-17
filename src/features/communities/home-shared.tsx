"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { JoinState } from "./community-join-button";
import type { CommunitySummary } from "@/lib/supabase/communities";

/** Topluluklar ana sayfasının sekmeleri ve alt sayfaları için ortak liste durumu ve küçük bileşenler. */
export interface ListState {
  key: string;
  items: CommunitySummary[];
  hasMore: boolean;
  error: string | null;
}

export function LoadingRows({ count = 3 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-3" aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="h-28 animate-pulse rounded-xl border border-border-soft bg-surface-soft" />
      ))}
    </ul>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-xl border border-border-soft bg-surface px-6 py-10 text-center">
      <p role="alert" className="text-small text-danger">
        {message}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

/** Bir listedeki kartın üyelik durumu değişince satırı (ve üye sayısını) günceller. */
export function applyJoinState(community: CommunitySummary, next: JoinState): CommunitySummary {
  const wasMember = community.myStatus === "member";
  const memberCount = next === "member" && !wasMember ? community.memberCount + 1 : next !== "member" && wasMember ? Math.max(0, community.memberCount - 1) : community.memberCount;
  return { ...community, myStatus: next, myRole: next === "member" ? (community.myRole ?? "member") : null, memberCount };
}
