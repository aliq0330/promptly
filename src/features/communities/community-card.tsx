"use client";

import { GroupAvatar } from "@/features/groups/group-avatar";
import { CommunityJoinButton, type JoinState } from "./community-join-button";
import { CommunityCover } from "./community-cover";
import { HUB_CARD_BADGE_CLASS, HUB_CARD_CHIP_CLASS, HUB_CARD_CORNER_BUTTON_CLASS, HubCard } from "@/features/hub/hub-kit";
import { PopoverMenu } from "@/components/ui/popover-menu";
import { Flag } from "@/components/icons/flag";
import { Link2 } from "@/components/icons/link-2";
import { useAuth } from "@/features/auth/auth-provider";
import { useReport } from "@/features/moderation/report-provider";
import { communityHref, communityTopicLabelKey, REASON_LABEL_KEYS, VISIBILITY_LABEL_KEYS } from "@/lib/communities";
import { memberCountText } from "@/lib/group-labels";
import { absoluteUrl, formatUnread } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunityReason, CommunitySummary } from "@/lib/supabase/communities";

/**
 * Topluluk kartı (Hub düzeni, docs/history/379-*): üç alanda aynı `HubCard` — 16:9 kapak (topluluğun görseli, renkleri bulanık arka plan),
 * sol üstte kategori, kapağın altında "N yeni" rozeti; gövdede ad, üye sayısı · aktif · gönderi · etkinlik · okunmamış özeti, alt satırda
 * görünürlük/rol/kapalı rozetleri ve TEK üyelik düğmesi (Katıl · İstek gönder · İstek gönderildi ▼ · Katıldın ▼ → ayrıl). Kart tamamı tıklanabilir bir
 * bağlantıdır; düğme ayrı bir hedeftir. Kapalı topluluğun kartında içerik istatistiği yoktur (üye olmayana sunucu vermez) ve "içerik yalnızca
 * üyelere" notu görünür; açıklama kartta yerine ad bağlantısının ipucundadır.
 */
export function CommunityCard({
  community,
  onStatusChange,
  onToast,
  onInvited,
  footerNote,
  reason,
  unseen = 0,
}: {
  community: CommunitySummary;
  onStatusChange: (next: JoinState) => void;
  onToast: (message: string) => void;
  onInvited?: () => void;
  footerNote?: string;
  /** Öneri listesinde: bu topluluk neden önerildi. */
  reason?: CommunityReason;
  /** Görmediğim gönderi sayısı (`my_community_unseen_counts`); kapağın altında "N yeni" rozeti olur. */
  unseen?: number;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { openReport } = useReport();
  const full = community.memberCount >= community.memberLimit;
  const isMember = community.myStatus === "member";
  const note = footerNote ?? (reason ? t(REASON_LABEL_KEYS[reason]) : community.visibility === "restricted" && !isMember ? t("communities.search.restrictedNote") : null);
  // Alt satırın solu: "480 üye · Yönetici · Görsel" (rol yalnız üyeyken; konu = alan adı); kapatılmış topluluk ve dolu kontenjan da buraya yazılır.
  const summary = [
    memberCountText(t, community.memberCount) + (full ? ` · ${t("groups.page.full")}` : ""),
    community.myRole ? t(`groups.role.${community.myRole}` as "groups.role.member") : null,
    t(communityTopicLabelKey(community)),
    community.closed ? t("communities.closedBadge") : null,
  ].filter(Boolean);

  return (
    <HubCard
      href={communityHref(community.id)}
      title={<span title={community.description || undefined}>{community.name}</span>}
      description={note ?? (community.description || undefined)}
      data-community-card={community.id}
      cover={
        <>
          <CommunityCover coverUrl={null} coverColor={null} avatarUrl={community.avatarUrl} className="h-full sm:h-full" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="inline-flex rounded-lg border-[3px] border-surface bg-surface shadow-card">
              <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={56} className="[&>span:first-child]:rounded-lg" />
            </span>
          </span>
        </>
      }
      chip={<span className={HUB_CARD_CHIP_CLASS}>{t(VISIBILITY_LABEL_KEYS[community.visibility])}</span>}
      badge={
        <>
          {unseen > 0 ? (
            <span data-shelf-unseen={unseen} className={HUB_CARD_BADGE_CLASS}>
              {t("communities.shelf.unseen", { count: unseen >= 99 ? "99+" : unseen })}
            </span>
          ) : (
            community.unreadCount > 0 && <span className={HUB_CARD_BADGE_CLASS}>{t("communities.card.unread", { count: formatUnread(community.unreadCount) })}</span>
          )}
          {community.pendingRequestCount > 0 && <span className={HUB_CARD_BADGE_CLASS}>{t("communities.card.pendingRequests", { count: community.pendingRequestCount })}</span>}
        </>
      }
      corner={
        // Kart ⋮ menüsü (Space kartıyla aynı yer ve ortak `PopoverMenu`): bağlantıyı kopyala · şikâyet (sahibi hariç, oturumlu).
        <PopoverMenu
          label={t("communities.card.menu", { name: community.name })}
          triggerClassName={HUB_CARD_CORNER_BUTTON_CLASS}
          items={[
            {
              key: "copy",
              label: t("common.copyLink"),
              icon: Link2,
              onSelect: () => void navigator.clipboard?.writeText(absoluteUrl(communityHref(community.id))).then(() => onToast(t("common.copied")), () => undefined),
            },
            {
              key: "report",
              label: t("communities.about.reportCommunity"),
              icon: Flag,
              danger: true,
              hidden: !user || community.myRole === "owner",
              onSelect: () => openReport({ type: "community", id: community.id, title: community.name }),
            },
          ]}
        />
      }
      footerStart={summary.map((part, index) => (
        <span key={index}>
          {index > 0 && " · "}
          <span>{part}</span>
        </span>
      ))}
      footerEnd={
        <CommunityJoinButton
          target={{
            id: community.id,
            name: community.name,
            visibility: community.visibility,
            rulesRequired: community.rulesRequired,
            memberCount: community.memberCount,
            memberLimit: community.memberLimit,
            closed: community.closed,
          }}
          status={community.myStatus}
          role={community.myRole}
          onChange={onStatusChange}
          onToast={onToast}
          onInvited={onInvited}
          size="sm"
        />
      }
    />
  );
}
