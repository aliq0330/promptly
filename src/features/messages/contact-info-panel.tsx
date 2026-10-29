"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Pin, Search, Star, User, Ban, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ReportButton } from "@/features/moderation/report-button";
import type { useBlockState } from "@/features/moderation/use-block-state";
import { ChatHeaderMenu } from "@/features/groups/chat-header-menu";
import { fetchProfileContentStats } from "@/lib/supabase/prompts";
import { fetchCommonCommunities } from "@/lib/supabase/communities";
import type { CommunityCard } from "@/lib/supabase/chat-groups";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatCount, profileHref } from "@/lib/utils";
import { ChatActionItems, type ChatConfirmKind } from "./chat-actions";
import { InfoCard, InfoIdentity, InfoPanelShell, InfoRow, InfoTile, InfoTiles } from "./info-panel-kit";
import { InfoPhotosCard } from "./info-photos-card";
import { InfoSharedRows } from "./info-shared-rows";
import { CommonCommunitiesModal } from "./common-communities-modal";
import type { Conversation, UserProfile } from "@/types";

/**
 * Kişi bilgisi (docs/history/268-*, yeniden çizim 270-*): sohbet başlığında kişiye dokununca açılır. Telefonda tam ekran, geniş ekranda sağdan açılan
 * panel (`InfoPanelShell`, topluluk bilgisiyle AYNI iskelet). Profil resmi + ad + kullanıcı adı + özgeçmiş + sayılar, Profil / Ara / Sessize al karoları,
 * bu sohbette paylaşılan fotoğraflar, yıldızlı ve sabit mesajlar, engelle · şikâyet; arşivle · mesajları temizle · sil sağ üstteki ⋮ menüsündedir. Fotoğraflar yalnız bu kişinin GÖREBİLDİĞİ mesajlardan gelir.
 * İşlemlerin hepsi sohbet başlığındaki ⋮ menüsüyle AYNI yoldan çalışır (aynı onay pencereleri, aynı sunucu yazımı).
 */
export function ContactInfoPanel({
  conversation,
  participant,
  starredCount,
  pinnedCount,
  blockState,
  busy,
  onClose,
  onSearch,
  onJumpToMessage,
  onShowPinned,
  onToggleArchive,
  onAsk,
  muted,
  muteBusy,
  onToggleMute,
}: {
  conversation: Conversation;
  participant: UserProfile;
  starredCount: number;
  pinnedCount: number;
  blockState: ReturnType<typeof useBlockState>;
  busy: boolean;
  onClose: () => void;
  onSearch: () => void;
  onJumpToMessage: (messageId: string) => void;
  onShowPinned: () => void;
  onToggleArchive: () => void;
  onAsk: (kind: ChatConfirmKind) => void;
  /** Bu sohbet kişisel olarak sessizde mi (`conversation_members.muted_at`) ve değiştirme eylemi. */
  muted: boolean;
  muteBusy: boolean;
  onToggleMute: () => void;
}) {
  const { t } = useTranslation();
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [stats, setStats] = useState<{ prompts: number } | null>(null);
  const [common, setCommon] = useState<CommunityCard[] | null>(null);
  const [commonOpen, setCommonOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchProfileContentStats(participant.id).then((result) => {
      if (alive && result) setStats({ prompts: result.prompts });
    });
    return () => {
      alive = false;
    };
  }, [participant.id]);

  async function handleBlock() {
    if (!blockState.isBlocked && !confirmingBlock) {
      setConfirmingBlock(true);
      return;
    }
    setConfirmingBlock(false);
    await blockState.toggle();
  }

  useEffect(() => {
    let alive = true;
    fetchCommonCommunities(participant.id)
      .then((cards) => {
        if (alive) setCommon(cards);
      })
      .catch(() => {
        if (alive) setCommon([]);
      });
    return () => {
      alive = false;
    };
  }, [participant.id]);

  const followers = formatCount(participant.followerCount);
  const following = formatCount(participant.followingCount);
  const statsText = stats
    ? t("messages.contact.stats", { prompts: formatCount(stats.prompts), followers, following })
    : t("messages.contact.statsNoPrompts", { followers, following });

  return (
    <InfoPanelShell
      title={t("messages.contact.title")}
      titleId="contact-info-title"
      onClose={onClose}
      attrs={{ "data-contact-info": "" }}
      menu={
        conversation.myStatus === "accepted" ? (
          <ChatHeaderMenu label={t("messages.chatMenuAria")}>
            {(close) => <ChatActionItems conversation={conversation} busy={busy} close={close} onToggleArchive={onToggleArchive} onAsk={onAsk} />}
          </ChatHeaderMenu>
        ) : undefined
      }
    >
      <InfoIdentity
        media={<Avatar src={participant.avatarUrl} alt={participant.displayName} size={104} />}
        name={participant.displayName}
        nameAttr="data-contact-name"
        sub={`@${participant.username}`}
        subAttr="data-contact-username"
        description={participant.bio}
        footer={
          <p className="mt-2.5 text-small text-text-muted" data-contact-stats>
            {statsText}
          </p>
        }
      />

      <InfoTiles>
        <InfoTile icon={<User size={22} strokeWidth={1.75} />} label={t("messages.contact.profile")} href={profileHref(participant)} testId="profile" />
        <InfoTile icon={<Search size={22} strokeWidth={1.75} />} label={t("messages.contact.search")} onClick={onSearch} testId="search" />
        <InfoTile
          icon={muted ? <Bell size={22} strokeWidth={1.75} /> : <BellOff size={22} strokeWidth={1.75} />}
          label={muted ? t("messages.contact.unmute") : t("messages.contact.mute")}
          onClick={onToggleMute}
          pressed={muted}
          disabled={muteBusy}
          testId="mute"
        />
      </InfoTiles>

      <InfoPhotosCard conversationId={conversation.id} onJumpToMessage={onJumpToMessage} />

      <InfoSharedRows conversationId={conversation.id} onJumpToMessage={onJumpToMessage} />

      <InfoCard>
        <InfoRow icon={<Users size={18} strokeWidth={1.75} />} onClick={common && common.length > 0 ? () => setCommonOpen(true) : undefined} value={common ? (common.length > 0 ? common.length : t("messages.contact.none")) : "…"} testId="common-communities">
          {t("messages.contact.commonCommunities")}
        </InfoRow>
        <InfoRow icon={<Star size={18} strokeWidth={1.75} />} href="/messages/starred" value={starredCount > 0 ? starredCount : t("messages.contact.none")} testId="starred">
          {t("messages.contact.starred")}
        </InfoRow>
        <InfoRow icon={<Pin size={18} strokeWidth={1.75} />} onClick={pinnedCount > 0 ? onShowPinned : undefined} value={pinnedCount > 0 ? pinnedCount : t("messages.contact.none")} testId="pinned">
          {t("messages.contact.pinned")}
        </InfoRow>
      </InfoCard>

      <InfoCard>
        {blockState.canBlock && (
          <InfoRow icon={<Ban size={18} strokeWidth={1.75} />} onClick={() => void handleBlock()} danger={!blockState.isBlocked} testId="block">
            {blockState.isBlocked ? t("profile.unblock") : confirmingBlock ? t("common.confirmDelete") : t("profile.block")}
          </InfoRow>
        )}
        <div data-contact-row="report">
          <ReportButton targetType="user" targetId={participant.id} label={t("profile.reportThisUser")} menuItem={false} row />
        </div>
      </InfoCard>
      {commonOpen && common && <CommonCommunitiesModal communities={common} name={participant.displayName} onClose={() => setCommonOpen(false)} />}
    </InfoPanelShell>
  );
}
