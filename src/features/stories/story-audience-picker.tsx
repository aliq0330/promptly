"use client";

import { useEffect, useState } from "react";
import { Globe2 } from "@/components/icons/globe-2";
import { Loader2 } from "@/components/icons/loader-2";
import { UserCheck } from "@/components/icons/user-check";
import { Users } from "@/components/icons/users";
import { Globe } from "@/components/icons/globe";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { OptionGroup } from "@/components/ui/option-group";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { listMyCommunities, type CommunitySummary } from "@/lib/supabase/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { StoryAudience } from "@/types";

const OPTIONS: { value: StoryAudience; icon: typeof Globe2; label: TranslationKey; hint: TranslationKey }[] = [
  { value: "public", icon: Globe, label: "stories.audience.public", hint: "stories.audience.publicHint" },
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
    <div className="space-y-2">
      <p id="story-audience-label" className="mb-1.5 text-label font-semibold text-text">
        {t("stories.audience.title")}
      </p>
      <ChoiceGroup<StoryAudience>
        labelledBy="story-audience-label"
        variant="tile"
        showHint
        value={audience}
        onChange={(value) => onChange(value, value === "community" ? communityId : null)}
        options={OPTIONS.map(({ value, icon, label, hint }) => ({ key: value, label: t(label), hint: t(hint), icon }))}
      />
      {needsCommunities &&
        (communities === null ? (
          <p className="flex items-center gap-2 px-2 py-3 text-small text-text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden /> {t("common.loading")}
          </p>
        ) : communities.length === 0 ? (
          <p className="px-2 py-3 text-small text-text-muted">{failed ? t("stories.error.generic") : t("stories.audience.noCommunities")}</p>
        ) : (
          <div className="max-h-56 overflow-y-auto">
            <OptionGroup<string>
              ariaLabel={t("stories.audience.community")}
              value={communityId}
              onChange={(id) => onChange("community", id)}
              options={communities.map((community) => ({
                key: community.id,
                leading: <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={32} />,
                label: <span className="truncate">{community.name}</span>,
              }))}
            />
          </div>
        ))}
    </div>
  );
}
