"use client";

import { Button } from "@/components/ui/button";
import { HUB_GRID_CLASS, HubCardSkeleton } from "@/features/hub/hub-kit";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { JoinState } from "./community-join-button";
import type { CommunitySummary } from "@/lib/supabase/communities";

/** Topluluklar ana sayfasının sekmeleri ve alt sayfaları için ortak liste durumu ve küçük bileşenler. */
export interface ListState {
  key: string;
  items: CommunitySummary[];
  hasMore: boolean;
  error: string | null;
  /** Sonraki sayfanın sunucu konumu (yalnız `listMyCommunities` listelerinde; süzgeç satır saydığı için `items.length` ofset DEĞİLDİR). */
  nextOffset?: number;
}

/** Yüklenen kart ızgarasının yer tutucusu: gerçek `HubGrid` + `HubCardSkeleton` (Space/Ekip ile aynı; yükleme bitince düzen sıçramaz). */
export function LoadingRows({ count = 3 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <ul className={HUB_GRID_CLASS} aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
      {Array.from({ length: count }, (_, i) => (
        <HubCardSkeleton key={i} />
      ))}
    </ul>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-lg card-flat px-6 py-10 text-center">
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
