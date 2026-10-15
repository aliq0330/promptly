"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { GroupAvatar } from "./group-avatar";
import { VisibilityLabel } from "@/features/communities/visibility-label";
import { GroupAboutSection } from "./group-about-section";
import { GroupMembersSection } from "./group-members-section";
import { GroupRequestsSection } from "./group-requests-section";
import { GroupInvitesSection } from "./group-invites-section";
import { GroupSettingsSection } from "./group-settings-section";
import { useToast } from "./use-toast";
import { can, canSeeSettingsTab } from "@/lib/chat-groups";
import { useTranslation } from "@/lib/i18n/language-provider";
import { memberCountText } from "@/lib/group-labels";
import type { Conversation } from "@/types";

export type GroupInfoTab = "about" | "members" | "requests" | "invites" | "settings";

/**
 * Grup başlığından açılan bilgi ekranı. Bölümler yetkiye göre görünür (üye: Genel + Üyeler; moderatör: + İstekler;
 * owner/admin: + Davet + Ayarlar). Yönetim kontrollerini yalnızca gizlemek yetmez — her işlem sunucuda yeniden yetkilendirilir.
 */
export function GroupInfoModal({
  conversation,
  initialTab = "about",
  onClose,
  onGroupChanged,
  onMutedChange,
  onGone,
}: {
  conversation: Conversation;
  initialTab?: GroupInfoTab;
  onClose: () => void;
  /** Ayar / sayaç / rol değişti: üst bileşen grubu yeniden okur (liste + açık sohbet). */
  onGroupChanged: () => void | Promise<void>;
  onMutedChange: (mutedAt: string | null) => void;
  /** Kullanıcı artık üye değil (ayrıldı) ya da grup silindi. */
  onGone: (reason: "left" | "deleted") => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { node: toastNode, show } = useToast();
  const group = conversation.group;
  const role = group?.myRole ?? "member";
  const [requestedTab, setTab] = useState<GroupInfoTab>(initialTab);
  const [transferHint, setTransferHint] = useState(false);

  const tabs = useMemo<TabItem<GroupInfoTab>[]>(() => {
    if (!group) return [];
    const items: TabItem<GroupInfoTab>[] = [
      { key: "about", label: t("groups.tab.about") },
      { key: "members", label: t("groups.tab.members"), count: group.memberCount },
    ];
    // Sekmeler YETKİYE göre (rol adına değil): owner admin/moderatöre yetki verip alabilir. Gerçek yetki sunucuda.
    if (can(role, "manage_requests", group.rolePermissions)) items.push({ key: "requests", label: t("groups.tab.requests"), count: group.pendingRequestCount || undefined });
    if (can(role, "manage_invites", group.rolePermissions)) items.push({ key: "invites", label: t("groups.tab.invites") });
    if (canSeeSettingsTab(role, group.rolePermissions)) items.push({ key: "settings", label: t("groups.tab.settings") });
    return items;
  }, [group, role, t]);

  if (!group || !user) return null;
  // Yetkisi düşen kullanıcı (ör. rolü alındı) görünmeyen bir sekmede kalmasın.
  const tab = tabs.some((item) => item.key === requestedTab) ? requestedTab : "about";

  return (
    <Modal onClose={onClose} labelledBy="group-info-title">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={56} />
          <div className="min-w-0 flex-1">
            <h2 id="group-info-title" className="break-words text-base font-semibold text-text">
              {group.name}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-text-muted">
              <span>{memberCountText(t, group.memberCount)}</span>
              <VisibilityLabel visibility={group.visibility} className="flex items-center gap-1" />
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
        <div className="px-5">
          <Tabs items={tabs} active={tab} onChange={setTab} ariaLabel={t("groups.tab.aria")} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4" role="tabpanel">
          {tab === "about" && (
            <GroupAboutSection
              group={group}
              mutedAt={conversation.mutedAt}
              onMutedChange={onMutedChange}
              onLeft={() => onGone("left")}
              onGoToMembers={() => {
                setTransferHint(true);
                setTab("members");
              }}
              onToast={show}
            />
          )}
          {tab === "members" && (
            <GroupMembersSection
              group={group}
              viewerId={user.id}
              onChanged={onGroupChanged}
              onToast={show}
              showTransferHint={transferHint && role === "owner"}
            />
          )}
          {tab === "requests" && <GroupRequestsSection group={group} onChanged={onGroupChanged} onToast={show} />}
          {tab === "invites" && <GroupInvitesSection group={group} onChanged={onGroupChanged} onToast={show} />}
          {tab === "settings" && <GroupSettingsSection key={`${group.name}|${group.description}|${group.memberLimit}|${group.postingPolicy}|${group.historyVisible}|${group.membersCanPin}|${JSON.stringify(group.rolePermissions)}`} group={group} onChanged={onGroupChanged} onToast={show} onDeleted={() => onGone("deleted")} />}
        </div>
        {toastNode}
      </div>
    </Modal>
  );
}
