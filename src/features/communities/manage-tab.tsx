"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { GroupSettingsSection } from "@/features/groups/group-settings-section";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { AnnouncementsSection } from "./announcements-section";
import { AuditSection } from "./audit-section";
import { CommunitySettingsSection } from "./community-settings-section";
import { ModerationSection } from "./moderation-section";
import { StatsSection } from "./stats-section";
import type { CommunityTabProps } from "./community-page";
import { canSeeSettingsTab } from "@/lib/chat-groups";
import { communityHref, manageSections, type ManageSection } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Yönet (yalnız yetkililere): topluluğun YAPILANDIRMASI ve moderasyonu — özet · ayarlar (ad/görsel/görünürlük/yetkiler/kurallar/kapatma/silme) ·
 * duyurular · moderasyon kuyruğu · işlem geçmişi. Kişi yönetimi (üyeler, katılım istekleri, davetler) "Üyeler" sekmesindedir. Bölümler
 * YETENEĞE göre görünür (rol adına değil; `manageSections`), owner admin/moderatöre yetki verip alabilir. Gizlemek güvenlik değildir:
 * her işlem sunucuda yeniden yetkilendirilir (RPC + RLS).
 */
/** Ayar grubu kartı: topluluk ayarları ile temel bilgi/görünürlük/yetki ayrı kartlarda; içerik yoksa (yetki yok) kart gizlenir. */
const SETTINGS_CARD = "rounded-xl border border-border-soft bg-surface p-4 shadow-card empty:hidden sm:p-5";

export function ManageTab({ group, role, onToast, reload, section }: CommunityTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh } = useRealMessages();
  const perms = group.rolePermissions;

  const sections = useMemo(() => {
    const labels: Record<ManageSection, string> = {
      stats: t("communities.manage.stats"),
      settings: t("groups.tab.settings"),
      announcements: t("communities.manage.announcements"),
      moderation: t("communities.manage.moderation"),
      history: t("communities.manage.history"),
    };
    return manageSections(role, perms).map<TabItem<ManageSection>>((key) => ({ key, label: labels[key] }));
  }, [role, perms, t]);

  const active = (sections.find((item) => item.key === section)?.key ?? sections[0]?.key) as ManageSection | undefined;

  if (!active) return <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-small text-text-muted">{t("communities.manage.none")}</p>;

  return (
    <div className="space-y-5">
      <Tabs
        items={sections}
        active={active}
        variant="segmented"
        ariaLabel={t("communities.manage.aria")}
        onChange={(key) => router.replace(communityHref(group.id, "manage", key))}
      />
      <div>
        {active === "stats" && <StatsSection groupId={group.id} />}
        {active === "settings" && (
          <div className="space-y-4">
            <div className={SETTINGS_CARD}>
            <CommunitySettingsSection key={`${group.category}|${group.feedPolicy}|${group.rulesVersion}|${group.rulesRequired}|${group.closedAt ?? ""}`} group={group} onChanged={reload} onToast={onToast} />
            </div>
            {canSeeSettingsTab(role, perms) && (
              <div className={SETTINGS_CARD}>
              <GroupSettingsSection
                key={`${group.name}|${group.description}|${group.memberLimit}|${JSON.stringify(group.rolePermissions)}`}
                group={group}
                onChanged={reload}
                onToast={onToast}
                onDeleted={() => {
                  void refresh();
                  onToast(t("communities.settings.deletedToast"));
                  router.push("/communities");
                }}
              />
              </div>
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
