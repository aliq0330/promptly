"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, ChevronDown, ExternalLink, Pin, Search, Settings2, Star, UserCog, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Collapsible } from "@/components/ui/collapsible";
import { useAuth } from "@/features/auth/auth-provider";
import { ChatActionItems, type ChatConfirmKind } from "@/features/messages/chat-actions";
import { InfoCard, InfoIdentity, InfoPanelShell, InfoRow, InfoTile, InfoTiles } from "@/features/messages/info-panel-kit";
import { InfoPhotosCard } from "@/features/messages/info-photos-card";
import { InfoSharedRows } from "@/features/messages/info-shared-rows";
import { ChatHeaderMenu } from "./chat-header-menu";
import { GroupAvatar } from "./group-avatar";
import { VisibilityLabel } from "@/features/communities/visibility-label";
import { ChatSettingsSection } from "./chat-settings-section";
import { GroupMembersSection } from "./group-members-section";
import { LeaveCommunitySection, useChatMute } from "./personal-prefs";
import { RoleBadge } from "./role-badge";
import { useToast } from "./use-toast";
import { can, canSeeChatSettings } from "@/lib/chat-groups";
import { communityHref, manageSections, membersSections } from "@/lib/communities";
import { fetchCommunityMembers, type CommunityMember } from "@/lib/supabase/communities";
import { memberCountText } from "@/lib/group-labels";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types";

/** Pencerenin hangi bölümü açık başlayacağı (bildirimden `?panel=` ile gelince). */
export type GroupInfoFocus = "overview" | "members" | "settings";

/**
 * Sohbet başlığına dokununca açılan TOPLULUK BİLGİSİ sayfası (docs/history/270-*): birebir sohbetteki Kişi bilgisiyle AYNI iskelet
 * (`InfoPanelShell`; telefonda tam ekran, geniş ekranda sağdan panel). Büyük topluluk avatarı + ad + görünürlük/üye sayısı + açıklama,
 * Topluluk sayfası · Ara · Sessize al karoları, üye avatarları (dokununca salt-okunur liste), paylaşılan fotoğraflar, sabit/yıldızlı
 * mesajlar, sohbet ayarları (yetkililere: kim yazar / geçmiş / sabitleme) ve topluluktan ayrılma.
 * Topluluğun kendisine ait işler — kurallar, akış, katılım istekleri, davetler, rol/çıkarma, ad-görsel-görünürlük ayarları, silme —
 * BURADA DEĞİL, topluluk sayfasındadır; yetkili kişiye oraya kısa yol (bekleyen istek sayısıyla) gösterilir. Yönetim kontrollerini
 * yalnızca gizlemek yetmez: her işlem sunucuda yeniden yetkilendirilir (RPC + RLS).
 */
export function GroupInfoModal({
  conversation,
  focus = "overview",
  starredCount,
  pinnedCount,
  busy,
  onClose,
  onGroupChanged,
  onMutedChange,
  onGone,
  onSearch,
  onJumpToMessage,
  onShowPinned,
  onToggleArchive,
  onAsk,
}: {
  conversation: Conversation;
  focus?: GroupInfoFocus;
  starredCount: number;
  pinnedCount: number;
  /** Sohbet eylemi sürerken ⋮ menüsü pasif. */
  busy: boolean;
  onClose: () => void;
  /** Ayar / sayaç / rol değişti: üst bileşen grubu yeniden okur (liste + açık sohbet). */
  onGroupChanged: () => void | Promise<void>;
  onMutedChange: (mutedAt: string | null) => void;
  /** Kullanıcı artık üye değil (ayrıldı) ya da topluluk silindi. */
  onGone: (reason: "left" | "deleted") => void;
  /** "Sohbette ara": pencereyi kapatır ve sohbet içi aramayı açar. */
  onSearch: () => void;
  onJumpToMessage: (messageId: string) => void;
  onShowPinned: () => void;
  onToggleArchive: () => void;
  onAsk: (kind: ChatConfirmKind) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const { node: toastNode, show } = useToast();
  const group = conversation.group;
  const [membersOpen, setMembersOpen] = useState(focus === "members");
  const [settingsOpen, setSettingsOpen] = useState(focus === "settings");
  const [stack, setStack] = useState<CommunityMember[]>([]);
  const groupId = group?.id ?? "";
  const mute = useChatMute({ groupId, mutedAt: conversation.mutedAt ?? null, onMutedChange, onToast: show });

  // Avatar yığını için ilk sayfa (aynı `community_members` RPC'si; liste açıldığında kendi okumasını yapar).
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    fetchCommunityMembers(groupId, { search: "", role: null, offset: 0 })
      .then((page) => {
        if (alive) setStack(page.members.slice(0, 5));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [groupId, group?.memberCount]);

  if (!group || !user) return null;
  const role = group.myRole;
  const perms = group.rolePermissions;
  const memberSections = membersSections(role, perms);
  const pendingRequests = can(role, "manage_requests", perms) ? group.pendingRequestCount : 0;
  const canManagePeople = memberSections.length > 1 || can(role, "remove_members", perms) || can(role, "manage_roles", perms) || can(role, "ban_members", perms);
  const canManageCommunity = manageSections(role, perms).includes("settings");
  const showChatSettings = canSeeChatSettings(role, perms);
  const extraMembers = Math.max(0, group.memberCount - stack.length);

  return (
    <InfoPanelShell
      title={t("groups.info.title")}
      titleId="group-info-title"
      onClose={onClose}
      attrs={{ "data-community-info": "" }}
      menu={
        conversation.myStatus === "accepted" ? (
          <ChatHeaderMenu>
            {(close) => <ChatActionItems conversation={conversation} busy={busy} close={close} onToggleArchive={onToggleArchive} onAsk={onAsk} />}
          </ChatHeaderMenu>
        ) : undefined
      }
    >
      <InfoIdentity
        media={<GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={104} />}
        name={group.name}
        nameAttr="data-community-info-name"
        sub={
          <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
            <VisibilityLabel visibility={group.visibility} className="flex items-center gap-1" />
            <span aria-hidden>·</span>
            <span>{memberCountText(t, group.memberCount)}</span>
            <RoleBadge role={role} />
          </span>
        }
        description={group.description}
      />

      <InfoTiles>
        <InfoTile icon={<ExternalLink size={22} strokeWidth={1.75} />} label={t("groups.info.communityPageTile")} href={communityHref(group.id)} badge={pendingRequests} testId="community" attrs={{ "data-info-community-link": "" }} />
        <InfoTile icon={<Search size={22} strokeWidth={1.75} />} label={t("messages.contact.search")} onClick={onSearch} testId="search" />
        <InfoTile
          icon={mute.muted ? <Bell size={22} strokeWidth={1.75} /> : <BellOff size={22} strokeWidth={1.75} />}
          label={mute.muted ? t("messages.contact.unmute") : t("messages.contact.mute")}
          onClick={() => void mute.toggle()}
          pressed={mute.muted}
          disabled={mute.busy}
          testId="mute"
        />
      </InfoTiles>
      {mute.error && (
        <p role="alert" className="px-6 pt-2 text-caption text-danger">
          {mute.error}
        </p>
      )}

      {pendingRequests > 0 && (
        <Link
          href={communityHref(group.id, "members", "requests")}
          data-info-requests-link
          className="mx-4 mt-3 flex shrink-0 items-center gap-3 rounded-[22px] bg-primary-soft px-4 py-3 text-sm text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <UserCog size={18} className="shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{t("groups.info.pendingRequests", { count: pendingRequests })}</span>
            <span className="block text-caption text-text-muted">{t("groups.info.pendingRequestsHelp")}</span>
          </span>
        </Link>
      )}

      <InfoCard aria-labelledby="info-members-title">
        <button
          type="button"
          onClick={() => setMembersOpen((open) => !open)}
          aria-expanded={membersOpen}
          aria-controls="info-members-panel"
          data-info-members-toggle
          className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <span className="flex items-center pl-2" aria-hidden>
            {stack.length === 0 ? (
              <Users size={20} className="text-text-secondary" />
            ) : (
              stack.map((member) => (
                <span key={member.userId} className="-ml-2 rounded-full ring-2 ring-surface">
                  <Avatar src={member.avatarUrl} alt={member.displayName} size={36} />
                </span>
              ))
            )}
            {stack.length > 0 && extraMembers > 0 && (
              <span className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-caption font-semibold text-text-secondary ring-2 ring-surface">+{extraMembers}</span>
            )}
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-body font-medium text-text">
            <span id="info-members-title">{t("groups.tab.members")}</span>
            <span className="text-small font-normal text-text-muted">{group.memberCount}</span>
            <ChevronDown size={17} aria-hidden className={cn("text-text-muted transition-transform", membersOpen && "rotate-180")} />
          </span>
        </button>
        <Collapsible open={membersOpen} id="info-members-panel">
          <div className="px-3 pb-3 pt-1">
            <GroupMembersSection group={group} viewerId={user.id} onChanged={onGroupChanged} onToast={show} manage={false} />
            {canManagePeople && (
              <Link href={communityHref(group.id, "members")} className="mt-3 inline-block text-caption font-medium text-primary hover:underline">
                {t("groups.info.manageMembers")}
              </Link>
            )}
          </div>
        </Collapsible>
      </InfoCard>

      <InfoPhotosCard conversationId={conversation.id} onJumpToMessage={onJumpToMessage} />

      <InfoSharedRows conversationId={conversation.id} onJumpToMessage={onJumpToMessage} />

      <InfoCard>
        <InfoRow icon={<Pin size={18} strokeWidth={1.75} />} onClick={pinnedCount > 0 ? onShowPinned : undefined} value={pinnedCount > 0 ? pinnedCount : t("messages.contact.none")} testId="pinned">
          {t("messages.contact.pinned")}
        </InfoRow>
        <InfoRow icon={<Star size={18} strokeWidth={1.75} />} href="/messages/starred" value={starredCount > 0 ? starredCount : t("messages.contact.none")} testId="starred">
          {t("messages.contact.starred")}
        </InfoRow>
        <InfoRow icon={<Bell size={18} strokeWidth={1.75} />} href={communityHref(group.id, "about")} value={t("groups.info.communityNotifyValue")} testId="notify">
          {t("groups.about.notifications")}
        </InfoRow>
      </InfoCard>

      <InfoCard aria-labelledby="info-chat-title">
        <h3 id="info-chat-title" className="px-4 pb-1 pt-3.5 text-label font-semibold text-text">
          {t("groups.info.chatTitle")}
        </h3>
        <dl className="px-4 pb-3.5 text-small">
          <Fact label={t("groups.settings.postingLabel")}>{group.postingPolicy === "admins" ? t("groups.settings.postingAdmins") : t("groups.settings.postingMembers")}</Fact>
          <Fact label={t("groups.about.history")}>{group.historyVisible ? t("groups.about.historyVisibleValue") : t("groups.about.historyHiddenValue")}</Fact>
        </dl>
        {showChatSettings && (
          <>
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              aria-controls="info-settings-panel"
              className="flex h-14 w-full items-center gap-3.5 px-4 text-left text-body text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-secondary" aria-hidden>
                <Settings2 size={18} strokeWidth={1.75} />
              </span>
              <span id="info-settings-title" className="min-w-0 flex-1">
                {t("groups.info.chatSettings")}
              </span>
              <ChevronDown size={17} aria-hidden className={cn("shrink-0 text-text-muted transition-transform", settingsOpen && "rotate-180")} />
            </button>
            <Collapsible open={settingsOpen} id="info-settings-panel">
              <div className="px-4 pb-4 pt-2">
                <ChatSettingsSection
                  key={`${group.postingPolicy}|${group.historyVisible}|${group.membersCanPin}`}
                  group={group}
                  onChanged={onGroupChanged}
                  onToast={show}
                />
              </div>
            </Collapsible>
          </>
        )}
      </InfoCard>

      {canManageCommunity && (
        <p className="mx-6 mt-3 shrink-0 text-caption text-text-muted">
          {t("groups.info.communitySettingsHint")}{" "}
          <Link href={communityHref(group.id, "manage", "settings")} className="font-medium text-primary hover:underline">
            {t("groups.info.communitySettingsLink")}
          </Link>
        </p>
      )}

      <InfoCard>
        <LeaveCommunitySection compact group={group} onLeft={() => onGone("left")} onGoToMembers={() => router.push(communityHref(group.id, "members"))} />
      </InfoCard>
      {toastNode}
    </InfoPanelShell>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-text">{children}</dd>
    </div>
  );
}
