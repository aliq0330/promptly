"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { GroupInvitesSection } from "@/features/groups/group-invites-section";
import { GroupRequestsSection } from "@/features/groups/group-requests-section";
import { GroupSettingsSection } from "@/features/groups/group-settings-section";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { AnnouncementsSection } from "./announcements-section";
import { AuditSection } from "./audit-section";
import { CommunitySettingsSection } from "./community-settings-section";
import { ModerationSection } from "./moderation-section";
import { StatsSection } from "./stats-section";
import type { CommunityTabProps } from "./community-page";
import { can, canSeeSettingsTab, isGroupManager } from "@/lib/chat-groups";
import { communityHref } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

export type ManageSection = "stats" | "requests" | "invites" | "settings" | "announcements" | "moderation" | "history";

/**
 * Yönetim (yalnız yetkililere): özet · başvurular · davetler · ayarlar (ad/görsel/görünürlük/yetkiler/kurallar/kapatma/silme) ·
 * duyurular · moderasyon kuyruğu · işlem geçmişi. Bölümler YETENEĞE göre görünür (rol adına değil); owner admin/moderatöre yetki verip
 * alabilir. Gizlemek güvenlik değildir: her işlem sunucuda yeniden yetkilendirilir (RPC + RLS).
 */
export function ManageTab({ group, role, onToast, reload }: CommunityTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useRealMessages();
  const perms = group.rolePermissions;

  const sections = useMemo(() => {
    const items: TabItem<ManageSection>[] = [];
    if (can(role, "view_stats", perms)) items.push({ key: "stats", label: t("communities.manage.stats") });
    if (can(role, "manage_requests", perms)) items.push({ key: "requests", label: t("groups.tab.requests"), count: group.pendingRequestCount || undefined });
    if (can(role, "manage_invites", perms)) items.push({ key: "invites", label: t("groups.tab.invites") });
    if (canSeeSettingsTab(role, perms) || can(role, "edit_rules", perms)) items.push({ key: "settings", label: t("groups.tab.settings") });
    if (can(role, "manage_announcements", perms)) items.push({ key: "announcements", label: t("communities.manage.announcements") });
    if (can(role, "moderate_posts", perms) || can(role, "delete_messages", perms)) items.push({ key: "moderation", label: t("communities.manage.moderation") });
    if (isGroupManager(role)) items.push({ key: "history", label: t("communities.manage.history") });
    return items;
  }, [role, perms, group.pendingRequestCount, t]);

  const requested = searchParams.get("section");
  const active = (sections.find((item) => item.key === requested)?.key ?? sections[0]?.key) as ManageSection | undefined;

  if (!active) return <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-small text-text-muted">{t("communities.manage.none")}</p>;

  return (
    <div className="space-y-5">
      <Tabs
        items={sections}
        active={active}
        variant="segmented"
        ariaLabel={t("communities.manage.aria")}
        onChange={(key) => router.replace(`${communityHref(group.id, "manage")}&section=${key}`)}
      />
      <div>
        {active === "stats" && <StatsSection groupId={group.id} />}
        {active === "requests" && <GroupRequestsSection group={group} onChanged={reload} onToast={onToast} />}
        {active === "invites" && <GroupInvitesSection group={group} onChanged={reload} onToast={onToast} />}
        {active === "settings" && (
          <div className="space-y-8">
            <CommunitySettingsSection key={`${group.category}|${group.feedPolicy}|${group.rulesVersion}|${group.rulesRequired}|${group.closedAt ?? ""}`} group={group} onChanged={reload} onToast={onToast} />
            {canSeeSettingsTab(role, perms) && (
              <GroupSettingsSection
                key={`${group.name}|${group.description}|${group.memberLimit}|${group.postingPolicy}|${group.historyVisible}|${group.membersCanPin}|${JSON.stringify(group.rolePermissions)}`}
                group={group}
                onChanged={reload}
                onToast={onToast}
                onDeleted={() => {
                  void refresh();
                  onToast(t("communities.settings.deletedToast"));
                  router.push("/communities");
                }}
              />
            )}
          </div>
        )}
        {active === "announcements" && <AnnouncementsSection group={group} role={role} limit={50} onToast={onToast} />}
        {active === "moderation" && <ModerationSection groupId={group.id} onChanged={reload} />}
        {active === "history" && <AuditSection groupId={group.id} />}
      </div>
    </div>
  );
}
