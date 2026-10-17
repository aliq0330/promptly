"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Search, Settings2, UserCog, Users, X } from "lucide-react";
import { Collapsible } from "@/components/ui/collapsible";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { GroupAvatar } from "./group-avatar";
import { VisibilityLabel } from "@/features/communities/visibility-label";
import { ChatSettingsSection } from "./chat-settings-section";
import { GroupMembersSection } from "./group-members-section";
import { ChatMuteToggle, LeaveCommunitySection } from "./personal-prefs";
import { RoleBadge } from "./role-badge";
import { useToast } from "./use-toast";
import { can, canSeeChatSettings } from "@/lib/chat-groups";
import { communityHref, manageSections, membersSections } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types";

/** Pencerenin hangi bölümü açık başlayacağı (bildirimden `?panel=` ile gelince). */
export type GroupInfoFocus = "overview" | "members" | "settings";

/**
 * Sohbet başlığından açılan KOMPAKT sohbet paneli. Yalnızca sohbetle ilgili şeyleri taşır:
 *   kimlik + "Topluluk sayfası" bağlantısı · kişisel bildirim tercihi (sessize al) · sohbette arama · üyeler (salt okunur) ·
 *   sohbet ayarları (yetkililere: kim yazar / geçmiş / sabitleme) · topluluktan ayrılma.
 * Topluluğun kendisine ait işler — açıklama, kurallar, akış, katılım istekleri, davetler, rol/çıkarma, ad-görsel-görünürlük ayarları,
 * silme — BURADA DEĞİL, topluluk sayfasındadır; yetkili kişiye oraya kısa yol (bekleyen istek sayısıyla) gösterilir. Yönetim kontrollerini
 * yalnızca gizlemek yetmez: her işlem sunucuda yeniden yetkilendirilir (RPC + RLS).
 */
export function GroupInfoModal({
  conversation,
  focus = "overview",
  onClose,
  onGroupChanged,
  onMutedChange,
  onGone,
  onSearch,
}: {
  conversation: Conversation;
  focus?: GroupInfoFocus;
  onClose: () => void;
  /** Ayar / sayaç / rol değişti: üst bileşen grubu yeniden okur (liste + açık sohbet). */
  onGroupChanged: () => void | Promise<void>;
  onMutedChange: (mutedAt: string | null) => void;
  /** Kullanıcı artık üye değil (ayrıldı) ya da topluluk silindi. */
  onGone: (reason: "left" | "deleted") => void;
  /** "Sohbette ara": pencereyi kapatır ve sohbet içi aramayı açar. */
  onSearch: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const { node: toastNode, show } = useToast();
  const group = conversation.group;
  const [membersOpen, setMembersOpen] = useState(focus === "members");
  const [settingsOpen, setSettingsOpen] = useState(focus === "settings");

  if (!group || !user) return null;
  const role = group.myRole;
  const perms = group.rolePermissions;
  const memberSections = membersSections(role, perms);
  const pendingRequests = can(role, "manage_requests", perms) ? group.pendingRequestCount : 0;
  const canManagePeople = memberSections.length > 1 || can(role, "remove_members", perms) || can(role, "manage_roles", perms) || can(role, "ban_members", perms);
  const canManageCommunity = manageSections(role, perms).includes("settings");
  const showChatSettings = canSeeChatSettings(role, perms);

  return (
    <Modal onClose={onClose} labelledBy="group-info-title">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={56} />
          <div className="min-w-0 flex-1">
            <h2 id="group-info-title" className="break-words text-base font-semibold text-text">
              {group.name}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-text-muted">
              <span>{memberCountText(t, group.memberCount)}</span>
              <VisibilityLabel visibility={group.visibility} className="flex items-center gap-1" />
              <RoleBadge role={role} />
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-2">
          <Link
            href={communityHref(group.id)}
            data-info-community-link
            className="flex items-center gap-3 rounded-lg border border-border-soft px-3 py-2.5 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ExternalLink size={16} className="shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              {t("groups.info.openCommunity")}
              <span className="block text-caption font-normal text-text-muted">{t("groups.info.openCommunityHelp")}</span>
            </span>
          </Link>

          {pendingRequests > 0 && (
            <Link
              href={communityHref(group.id, "members", "requests")}
              data-info-requests-link
              className="flex items-center gap-3 rounded-lg bg-primary-soft/60 px-3 py-2.5 text-sm text-text transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <UserCog size={16} className="shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{t("groups.info.pendingRequests", { count: pendingRequests })}</span>
                <span className="block text-caption text-text-muted">{t("groups.info.pendingRequestsHelp")}</span>
              </span>
            </Link>
          )}

          <section className="space-y-2" aria-labelledby="info-notify-title">
            <h3 id="info-notify-title" className="text-label font-semibold text-text">
              {t("groups.about.notifications")}
            </h3>
            <ChatMuteToggle groupId={group.id} mutedAt={conversation.mutedAt} onMutedChange={onMutedChange} onToast={show} />
            <Link href={communityHref(group.id, "about")} className="inline-block text-caption font-medium text-primary hover:underline">
              {t("groups.info.communityNotifyLink")}
            </Link>
          </section>

          <section className="space-y-2" aria-labelledby="info-chat-title">
            <h3 id="info-chat-title" className="text-label font-semibold text-text">
              {t("groups.info.chatTitle")}
            </h3>
            <button type="button" onClick={onSearch} className={rowClass}>
              <Search size={16} className="shrink-0 text-text-muted" aria-hidden />
              <span className="min-w-0 flex-1">{t("chat.search.open")}</span>
            </button>
            <dl className="grid gap-2 text-small sm:grid-cols-2">
              <Fact label={t("groups.settings.postingLabel")}>{group.postingPolicy === "admins" ? t("groups.settings.postingAdmins") : t("groups.settings.postingMembers")}</Fact>
              <Fact label={t("groups.about.history")}>{group.historyVisible ? t("groups.about.historyVisibleValue") : t("groups.about.historyHiddenValue")}</Fact>
            </dl>
          </section>

          <section className="space-y-2" aria-labelledby="info-members-title">
            <Disclosure
              id="info-members"
              open={membersOpen}
              onToggle={() => setMembersOpen((open) => !open)}
              icon={<Users size={16} aria-hidden />}
              label={<span id="info-members-title">{t("groups.tab.members")}</span>}
              count={group.memberCount}
            />
            <Collapsible open={membersOpen} id="info-members-panel">
              <div className="pt-2">
                <GroupMembersSection group={group} viewerId={user.id} onChanged={onGroupChanged} onToast={show} manage={false} />
                {canManagePeople && (
                  <Link href={communityHref(group.id, "members")} className="mt-3 inline-block text-caption font-medium text-primary hover:underline">
                    {t("groups.info.manageMembers")}
                  </Link>
                )}
              </div>
            </Collapsible>
          </section>

          {showChatSettings && (
            <section className="space-y-2" aria-labelledby="info-settings-title">
              <Disclosure
                id="info-settings"
                open={settingsOpen}
                onToggle={() => setSettingsOpen((open) => !open)}
                icon={<Settings2 size={16} aria-hidden />}
                label={<span id="info-settings-title">{t("groups.info.chatSettings")}</span>}
              />
              <Collapsible open={settingsOpen} id="info-settings-panel">
                <div className="pt-3">
                  <ChatSettingsSection
                    key={`${group.postingPolicy}|${group.historyVisible}|${group.membersCanPin}`}
                    group={group}
                    onChanged={onGroupChanged}
                    onToast={show}
                  />
                </div>
              </Collapsible>
            </section>
          )}

          {canManageCommunity && (
            <p className="text-caption text-text-muted">
              {t("groups.info.communitySettingsHint")}{" "}
              <Link href={communityHref(group.id, "manage", "settings")} className="font-medium text-primary hover:underline">
                {t("groups.info.communitySettingsLink")}
              </Link>
            </p>
          )}

          <LeaveCommunitySection group={group} onLeft={() => onGone("left")} onGoToMembers={() => router.push(communityHref(group.id, "members"))} />
        </div>
        {toastNode}
      </div>
    </Modal>
  );
}

const rowClass =
  "flex w-full items-center gap-3 rounded-lg border border-border-soft px-3 py-2.5 text-left text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border-soft bg-surface-soft/50 px-3 py-2">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-text">{children}</dd>
    </div>
  );
}

function Disclosure({
  id,
  open,
  onToggle,
  icon,
  label,
  count,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  label: ReactNode;
  count?: number;
}) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`${id}-panel`} className={rowClass}>
      <span className="shrink-0 text-text-muted">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
      {count !== undefined && <span className="text-caption font-normal text-text-muted">{count}</span>}
      <ChevronDown size={16} aria-hidden className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-180")} />
    </button>
  );
}
