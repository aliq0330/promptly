"use client";

import { useEffect, useState } from "react";
import { Globe2, Loader2, UserCheck, Users } from "lucide-react";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { listMyCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import type { StoryAudience } from "@/types";

const OPTIONS: { value: StoryAudience; icon: typeof Globe2; label: TranslationKey; hint: TranslationKey }[] = [
  { value: "public", icon: Globe2, label: "stories.audience.public", hint: "stories.audience.publicHint" },
  { value: "followers", icon: UserCheck, label: "stories.audience.followers", hint: "stories.audience.followersHint" },
  { value: "community", icon: Users, label: "stories.audience.community", hint: "stories.audience.communityHint" },
];

/**
 * Hikâyenin hedef kitlesi (docs/history/198-*): herkese açık · takipçiler · üyesi olunan tek bir topluluk. Liste yalnız üyesi
 * olunan ve kapatılmamış toplulukları gösterir; paylaşma yetkisini (örn. "yalnız yöneticiler paylaşır") sunucu yeniden denetler.
 */
export function StoryAudiencePicker({
  audience,
  communityId,
  onChange,
}: {
  audience: StoryAudience;
  communityId: string | null;
  onChange: (audience: StoryAudience, communityId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<CommunitySummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const needsCommunities = audience === "community";

  useEffect(() => {
    if (!needsCommunities || communities !== null) return;
    let alive = true;
    listMyCommunities("member")
      .then((result) => alive && setCommunities(result.communities.filter((c) => !c.closed)))
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setCommunities([]);
      });
    return () => {
      alive = false;
    };
  }, [needsCommunities, communities]);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-label font-semibold text-text">{t("stories.audience.title")}</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={audience === value}
            onClick={() => onChange(value, value === "community" ? communityId : null)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-caption font-medium transition-colors duration-200 ease-soft",
              audience === value ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text-secondary hover:border-border-strong",
            )}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden />
            {t(label)}
          </button>
        ))}
      </div>
      <p className="text-caption text-text-muted">{t(OPTIONS.find((o) => o.value === audience)!.hint)}</p>
      {needsCommunities && (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border-soft bg-surface p-1.5">
          {communities === null ? (
            <p className="flex items-center gap-2 px-2 py-3 text-small text-text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {t("common.loading")}
            </p>
          ) : communities.length === 0 ? (
            <p className="px-2 py-3 text-small text-text-muted">{failed ? t("stories.error.generic") : t("stories.audience.noCommunities")}</p>
          ) : (
            communities.map((community) => (
              <button
                key={community.id}
                type="button"
                aria-pressed={communityId === community.id}
                onClick={() => onChange("community", community.id)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-small transition-colors",
                  communityId === community.id ? "bg-primary-soft text-primary" : "text-text hover:bg-surface-soft",
                )}
              >
                <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={28} />
                <span className="min-w-0 flex-1 truncate font-medium">{community.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </fieldset>
  );
}
