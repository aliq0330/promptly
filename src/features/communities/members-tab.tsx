"use client";

import { useState } from "react";
import { GroupMembersSection } from "@/features/groups/group-members-section";
import type { CommunityTabProps } from "./community-page";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { GroupRole } from "@/types";

const FILTERS: (GroupRole | null)[] = [null, "owner", "admin", "moderator", "member"];

/** Üyeler: arama + rol süzgeci + (yetkiye göre) rol atama / çıkarma / yasaklama / sahiplik devri. Süzme ve sayfalama sunucuda; gerçek yetki RPC'lerde. */
export function MembersTab({ group, viewerId, reload, onToast }: CommunityTabProps) {
  // Üye listesi yalnız üyelere açıktır (sayfa bu sekmeyi zaten yalnız üyeye gösterir); ziyaretçide hiçbir şey çizilmez.
  const { t } = useTranslation();
  const [filter, setFilter] = useState<GroupRole | null>(null);
  if (!viewerId) return null;
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t("communities.members.filterAria")}>
        {FILTERS.map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={
              "shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
              (filter === value ? "border-primary/50 bg-primary-soft text-primary" : "border-border-soft bg-surface text-text-secondary hover:border-border-strong")
            }
          >
            {value ? t(`communities.members.filter.${value}`) : t("communities.filter.all")}
          </button>
        ))}
      </div>
      <GroupMembersSection group={group} viewerId={viewerId} onChanged={reload} onToast={onToast} roleFilter={filter} />
    </div>
  );
}
