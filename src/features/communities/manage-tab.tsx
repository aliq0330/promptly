"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3 } from "@/components/icons/bar-chart-3";
import { History } from "@/components/icons/history";
import { Megaphone } from "@/components/icons/megaphone";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Settings } from "@/components/icons/settings";
import { ShieldCheck } from "@/components/icons/shield-check";
import { PhoneSectionList, PhoneSubBar, type PhoneSectionItem } from "@/features/content/phone-sections";
import { SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
import { useMediaQuery } from "@/lib/use-media-query";
import { GroupSettingsSection } from "@/features/groups/group-settings-section";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { AnnouncementsSection } from "./announcements-section";
import { RoomsPage } from "./manage-sx-rooms";
import { DangerPage } from "./manage-sx-people";
import { ChatSettingsPage, CommunitySettingsPage, ManageListPage, PermissionsPage } from "./manage-sx";
import { AuditSection } from "./audit-section";
import { CommunitySettingsSection } from "./community-settings-section";
import { ModerationSection } from "./moderation-section";
import { StatsSection } from "./stats-section";
import { RoomsManageSection } from "@/features/messages/rooms/rooms-manage-section";
import type { CommunityTabProps } from "./community-page";
import { can, canSeeSettingsTab } from "@/lib/chat-groups";
import { communityHref, manageSections, type ManageSection } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Yönet (yalnız yetkililere): topluluğun YAPILANDIRMASI ve moderasyonu — özet · ayarlar (ad/görsel/görünürlük/yetkiler/kurallar/kapatma/silme) ·
 * duyurular · moderasyon kuyruğu · işlem geçmişi. Kişi yönetimi (üyeler, katılım istekleri, davetler) "Üyeler" sekmesindedir. Bölümler
 * YETENEĞE göre görünür (rol adına değil; `manageSections`), owner admin/moderatöre yetki verip alabilir. Gizlemek güvenlik değildir:
 * her işlem sunucuda yeniden yetkilendirilir (RPC + RLS).
 */
/** Ayar grubu kartı: topluluk ayarları ile temel bilgi/görünürlük/yetki ayrı kartlarda; içerik yoksa (yetki yok) kart gizlenir. */
const SETTINGS_CARD = "rounded-lg card-flat p-5 shadow-card empty:hidden sm:p-6";

export function ManageTab({ group, role, onToast, reload, section }: CommunityTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useRealMessages();
  const perms = group.rolePermissions;
  const phone = useMediaQuery("(max-width: 767.98px)");

  const sections = useMemo(() => {
    const labels: Record<ManageSection, string> = {
      stats: t("communities.manage.stats"),
      settings: t("groups.tab.settings"),
      rooms: t("rooms.manage.title"),
      announcements: t("communities.manage.announcements"),
      moderation: t("communities.manage.moderation"),
      history: t("communities.manage.history"),
    };
    return manageSections(role, perms).map<SectionMenuItem<ManageSection>>((key) => ({ key, label: labels[key] }));
  }, [role, perms, t]);

  const active = (sections.find((item) => item.key === section)?.key ?? sections[0]?.key) as ManageSection | undefined;

  if (!active) return <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-small text-text-muted">{t("communities.manage.none")}</p>;

  const content = (
    <div>
        {active === "stats" && <StatsSection groupId={group.id} />}
        {active === "settings" && (
          <div className="space-y-4">
            <div className={SETTINGS_CARD}>
            <CommunitySettingsSection key={`${group.category}|${group.domain ?? ""}|${group.feedPolicy}|${group.rulesVersion}|${group.rulesRequired}|${group.closedAt ?? ""}`} group={group} onChanged={reload} onToast={onToast} />
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
        {active === "rooms" && <RoomsManageSection group={group} onToast={onToast} />}
        {active === "announcements" && <AnnouncementsSection group={group} role={role} limit={50} onToast={onToast} />}
        {active === "moderation" && <ModerationSection groupId={group.id} onChanged={reload} />}
        {active === "history" && <AuditSection groupId={group.id} />}
      </div>
  );

  // Telefon (docs/history/357-*, Yön C): Yönetim = bölüm listesi; satır alt sayfayı açar, alt sayfa kendi geri çubuğunu çizer.
  if (phone) {
    const rawSection = searchParams.get("section");
    const sub = searchParams.get("sub");
    const setSub = (next: string | null) => router.replace(`${communityHref(group.id, "manage", rawSection ?? undefined)}${next ? `&sub=${next}` : ""}`);
    if (!rawSection) return <ManageListPage group={group} role={role} />;
    if (rawSection === "settings") return <CommunitySettingsPage group={group} onChanged={reload} onToast={onToast} sub={sub} setSub={setSub} parent={`${group.name} · ${t("ay.manage.title")}`} />;
    if (rawSection === "permissions" && role === "owner") return <PermissionsPage group={group} onChanged={reload} onToast={onToast} />;
    if (rawSection === "rooms" && can(role, "manage_rooms", perms)) return <RoomsPage group={group} sub={sub} room={searchParams.get("room")} onToast={onToast} />;
    if (rawSection === "danger" && role === "owner") return <DangerPage group={group} onChanged={reload} onToast={onToast} sub={sub} setSub={setSub} />;
    if (rawSection === "chat") return <ChatSettingsPage group={group} onChanged={reload} onToast={onToast} />;
    const ICONS: Record<ManageSection, PhoneSectionItem["icon"]> = { stats: BarChart3, settings: Settings, rooms: MessagesSquare, announcements: Megaphone, moderation: ShieldCheck, history: History };
    const chosen = sections.find((item) => item.key === section)?.key ?? null;
    if (!chosen) {
      return (
        <div data-testid="community-manage-list">
          <PhoneSubBar className="-mt-3" parent={group.name} title={t("communities.detail.tab.manage")} backHref={communityHref(group.id)} />
          <PhoneSectionList
            ariaLabel={t("communities.manage.aria")}
            items={sections.map((item) => ({ key: item.key, label: item.label, href: communityHref(group.id, "manage", item.key), icon: ICONS[item.key] }))}
          />
        </div>
      );
    }
    return (
      <div>
        <PhoneSubBar className="-mt-3" parent={`${group.name} · ${t("communities.detail.tab.manage")}`} title={sections.find((item) => item.key === chosen)?.label ?? ""} backHref={communityHref(group.id, "manage")} />
        {content}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* docs/history/235-*: 5 bölüm = tek "Özet ▾" menüsü (4+ bölüm kuralı). */}
      <SectionMenu
        items={sections.map((item) => ({ key: item.key, label: item.label }))}
        active={active}
        ariaLabel={t("communities.manage.aria")}
        title={t("communities.manage.aria")}
        onChange={(key) => router.replace(communityHref(group.id, "manage", key))}
      />
      {content}
    </div>
  );
}
