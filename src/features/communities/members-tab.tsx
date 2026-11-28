"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { GroupMembersSection } from "@/features/groups/group-members-section";
import { GroupRequestsSection } from "@/features/groups/group-requests-section";
import type { CommunityTabProps } from "./community-page";
import { communityHref, membersSections, type MembersSection } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { GroupRole } from "@/types";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Chip } from "@/components/ui/chip";
import { useMediaQuery } from "@/lib/use-media-query";
import { InvitesPage } from "./manage-sx-people";
import { useSearchParams } from "next/navigation";

/** "online" = şu an çevrimiçi üyeler (docs/history/329-*; kişi başına gizlilik sunucuda). */
type MemberFilter = GroupRole | null | "online";
const FILTERS: MemberFilter[] = [null, "online", "owner", "admin", "moderator", "member"];

/**
 * Üyeler: KİŞİ YÖNETİMİNİN tek yeri. Liste (arama + rol süzgeci + yetkiye göre rol atama / çıkarma / yasaklama / sahiplik devri) her üyeye
 * açıktır; Katılım istekleri ve Davetler/bağlantılar/yasaklar yetkililere ek bölüm olarak görünür (bekleyen istek sayısıyla). Sohbet bilgi
 * penceresi ve bildirimler buraya bağlanır. Bölümler YETENEĞE göre belirlenir; gerçek yetki her işlemde sunucuda (RPC + RLS) yeniden doğrulanır.
 */
export function MembersTab({ group, role, viewerId, reload, onToast, section }: CommunityTabProps) {
  // Üye listesi yalnız üyelere açıktır (sayfa bu sekmeyi zaten yalnız üyeye gösterir); ziyaretçide hiçbir şey çizilmez.
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<MemberFilter>(null);
  const phone = useMediaQuery("(max-width: 767px)");
  const searchParams = useSearchParams();
  const available = membersSections(role, group.rolePermissions);
  const active: MembersSection = (available.find((key) => key === section) ?? "list") as MembersSection;
  if (!viewerId) return null;
  const invitesPage = (root: boolean) => (
    <InvitesPage root={root} group={group} onChanged={reload} onToast={onToast} sub={searchParams.get("sub")} setSub={(next) => router.replace(`${communityHref(group.id, "members", "invites")}${next ? `&sub=${next}` : ""}`)} />
  );
  // Telefon: davetler tam ekran sayfa; md+: "Üyeler" sekmesinin altındaki bölüm (aynı gövde, başlık çubuğu yok).
  if (phone && section === "invites" && available.includes("invites")) return invitesPage(false);

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
          <ScrollRow className="flex gap-1.5 pb-1 md:flex-wrap md:overflow-visible" role="group" aria-label={t("communities.members.filterAria")}>
            {FILTERS.map((value) => (
              <Chip key={value ?? "all"} selected={filter === value} onClick={() => setFilter(value)}>
                {value === "online" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
                    {t("presence.filterOnline")}
                  </span>
                ) : value ? (
                  t(`communities.members.filter.${value}`)
                ) : (
                  t("communities.filter.all")
                )}
              </Chip>
            ))}
          </ScrollRow>
          <GroupMembersSection
            group={group}
            viewerId={viewerId}
            onChanged={reload}
            onToast={onToast}
            roleFilter={filter === "online" ? null : filter}
            onlineOnly={filter === "online"}
          />
        </>
      )}
      {active === "requests" && <GroupRequestsSection group={group} onChanged={reload} onToast={onToast} />}
      {active === "invites" && invitesPage(true)}
    </div>
  );
}
