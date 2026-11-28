"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnnouncementsPage, AuditPage, ModerationPage, StatsPage } from "./manage-sx-content";
import { RoomsPage } from "./manage-sx-rooms";
import { DangerPage } from "./manage-sx-people";
import { ChatSettingsPage, CommunitySettingsPage, ManageListPage, PermissionsPage } from "./manage-sx";
import type { CommunityTabProps } from "./community-page";
import { can } from "@/lib/chat-groups";
import { communityHref, manageSections, type ManageSection } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Yönet (yalnız yetkililere): topluluğun YAPILANDIRMASI ve moderasyonu. Her boyutta aynı yapı (docs/history/482-*): kök = bölüm LİSTESİ
 * (`ManageListPage`), satır `?section=` alt sayfasını açar; telefonda tam ekran, tablet/masaüstünde aynı gövde okuma sütununda
 * (alt formlar `sub=` ile pencere). Kişi yönetimi (üyeler, istekler, davetler) "Üyeler" sekmesindedir. Bölümler YETENEĞE göre görünür
 * (rol adına değil; `manageSections`); gizlemek güvenlik değildir: her işlem sunucuda yeniden yetkilendirilir (RPC + RLS).
 */
export function ManageTab({ group, role, onToast, reload }: CommunityTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const perms = group.rolePermissions;
  const sections = useMemo(() => manageSections(role, perms), [role, perms]);

  if (sections.length === 0) {
    return <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-small text-text-muted">{t("communities.manage.none")}</p>;
  }

  const rawSection = searchParams.get("section");
  const sub = searchParams.get("sub");
  const setSub = (next: string | null) => router.replace(`${communityHref(group.id, "manage", rawSection ?? undefined)}${next ? `&sub=${next}` : ""}`);
  const allowed = (key: ManageSection) => sections.includes(key);

  if (rawSection === "settings") return <CommunitySettingsPage group={group} onChanged={reload} onToast={onToast} sub={sub} setSub={setSub} parent={`${group.name} · ${t("ay.manage.title")}`} />;
  if (rawSection === "permissions" && role === "owner") return <PermissionsPage group={group} onChanged={reload} onToast={onToast} />;
  if (rawSection === "rooms" && can(role, "manage_rooms", perms)) return <RoomsPage group={group} sub={sub} room={searchParams.get("room")} onToast={onToast} />;
  if (rawSection === "danger" && role === "owner") return <DangerPage group={group} onChanged={reload} onToast={onToast} sub={sub} setSub={setSub} />;
  if (rawSection === "chat") return <ChatSettingsPage group={group} onChanged={reload} onToast={onToast} />;
  if (rawSection === "stats" && allowed("stats")) return <StatsPage group={group} />;
  if (rawSection === "announcements" && allowed("announcements")) return <AnnouncementsPage group={group} onToast={onToast} />;
  if (rawSection === "moderation" && allowed("moderation")) return <ModerationPage group={group} onChanged={reload} />;
  if (rawSection === "history" && allowed("history")) return <AuditPage group={group} />;
  return <ManageListPage group={group} role={role} />;
}
