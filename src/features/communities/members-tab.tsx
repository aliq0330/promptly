"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { GroupInvitesSection } from "@/features/groups/group-invites-section";
import { GroupMembersSection } from "@/features/groups/group-members-section";
import { GroupRequestsSection } from "@/features/groups/group-requests-section";
import type { CommunityTabProps } from "./community-page";
import { communityHref, membersSections, type MembersSection } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { GroupRole } from "@/types";

const FILTERS: (GroupRole | null)[] = [null, "owner", "admin", "moderator", "member"];

/**
 * Üyeler: KİŞİ YÖNETİMİNİN tek yeri. Liste (arama + rol süzgeci + yetkiye göre rol atama / çıkarma / yasaklama / sahiplik devri) her üyeye
 * açıktır; Katılım istekleri ve Davetler/bağlantılar/yasaklar yetkililere ek bölüm olarak görünür (bekleyen istek sayısıyla). Sohbet bilgi
 * penceresi ve bildirimler buraya bağlanır. Bölümler YETENEĞE göre belirlenir; gerçek yetki her işlemde sunucuda (RPC + RLS) yeniden doğrulanır.
 */
export function MembersTab({ group, role, viewerId, reload, onToast, section }: CommunityTabProps) {
  // Üye listesi yalnız üyelere açıktır (sayfa bu sekmeyi zaten yalnız üyeye gösterir); ziyaretçide hiçbir şey çizilmez.
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<GroupRole | null>(null);
  const available = membersSections(role, group.rolePermissions);
  const active: MembersSection = (available.find((key) => key === section) ?? "list") as MembersSection;
  if (!viewerId) return null;

  const items: TabItem<MembersSection>[] = available.map((key) => ({
    key,
    label: key === "list" ? t("communities.members.sectionList") : key === "requests" ? t("groups.tab.requests") : t("groups.tab.invites"),
    count: key === "requests" ? group.pendingRequestCount || undefined : undefined,
  }));

  return (
    <div className="space-y-4">
      {available.length > 1 && (
        <Tabs
          items={items}
          active={active}
          variant="segmented"
          ariaLabel={t("communities.members.sectionsAria")}
          onChange={(key) => router.replace(communityHref(group.id, "members", key === "list" ? undefined : key))}
        />
      )}
      {active === "list" && (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible" role="group" aria-label={t("communities.members.filterAria")}>
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
        </>
      )}
      {active === "requests" && <GroupRequestsSection group={group} onChanged={reload} onToast={onToast} />}
      {active === "invites" && <GroupInvitesSection group={group} onChanged={reload} onToast={onToast} />}
    </div>
  );
}
