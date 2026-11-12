"use client";

import { Mail } from "@/components/icons/mail";
import { HubAttentionStrip } from "@/features/hub/hub-kit";
import { homeHref } from "@/lib/community-home";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { GroupInvitation } from "@/lib/supabase/chat-groups";

/**
 * Bekleyen davet tek satırlık dikkat şeridi olarak (Hub düzeni, docs/history/379-*): topluluk, davet eden ve "Gör" → davetler bölümü,
 * kabul mevcut akışla (kural onayı dahil) orada yapılır. Birden çok davette en yenisi, sayıyla.
 * ("Topluluklarım" rafı ve sağ yardımcı sütun artık yok: üye olunan topluluklar ilk sekmenin kart ızgarasındadır, sayılar sekme sayaçlarındadır.)
 */
export function HomeInviteNotice({ invitations }: { invitations: GroupInvitation[] }) {
  const { t } = useTranslation();
  const first = invitations[0];
  if (!first) return null;
  const name = first.group?.name ?? "";
  return (
    <HubAttentionStrip icon={Mail} actionLabel={t("communities.invite.noticeOpen")} href={homeHref("invites")} testId="home-invite-notice">
      {invitations.length > 1 ? t("communities.invite.noticeMany", { count: invitations.length }) : t("communities.invite.noticeOne")} · <b>{name}</b>
    </HubAttentionStrip>
  );
}
