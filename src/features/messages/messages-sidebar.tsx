"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useTeamChannelList } from "@/features/teams/team-chat-data";
import { useMediaQuery } from "@/lib/use-media-query";
import { resolveHubTarget } from "@/lib/messages-hub";
import { CommunityHubView } from "./community-hub-view";
import { ConversationsPane } from "./conversations-pane";
import { useRealMessages } from "./real-messages-provider";
import { TeamHubView } from "./team-hub-view";

/**
 * Mesajlar'ın tablet/masaüstü SOL SÜTUNU (docs/history/381-*): varsayılan olarak sohbet listesidir; bir ekibe, projeye ya da topluluğa girilince (adreste `hub=` ya da açık sohbet
 * bir ekip kanalı / topluluk odası) o ekibin/projenin/topluluğun KANAL LİSTESİ sohbet listesinin yerine geçer. Sağ bölme hep sohbettir. Telefonda bu sütun yoktur
 * (liste sayfası ve kanal listesi sayfası ayrı ekranlardır).
 */
export function MessagesSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Sütun telefonda gizlidir (`hidden md:flex`) ama bağlıdır: kanal listesi telefonda KENDİ sayfasında çizilir, burada ikinci kez bağlanmaz (yinelenen satır/istek olmasın).
  const wide = useMediaQuery("(min-width: 768px)");
  const { conversations, ready } = useRealMessages();
  const onLocal = pathname.startsWith("/messages/local");
  const id = onLocal ? searchParams.get("id") : null;
  const hub = onLocal ? searchParams.get("hub") : null;
  const open = id ? (conversations.find((conversation) => conversation.id === id) ?? null) : null;
  const openTeamId = open?.group?.team?.id ?? null;
  // Açık sohbet bir proje kanalıysa sol sütun PROJENİN listesidir; projeyi kanal listesinden okuruz (ortak kısa ömürlü önbellek).
  const teamChannels = useTeamChannelList(openTeamId);
  const openProjectId = openTeamId && id ? (teamChannels.channels.find((channel) => channel.id === id)?.projectId ?? null) : null;
  const openCommunityId = open && open.kind === "group" && open.group && !open.group.team ? open.id : null;

  const target = useMemo(
    () =>
      resolveHubTarget(
        { hub, team: onLocal ? searchParams.get("team") : null, project: onLocal ? searchParams.get("project") : null, id },
        open ? { teamId: openTeamId, projectId: openProjectId, communityId: openCommunityId } : null,
      ),
    [hub, onLocal, searchParams, id, open, openTeamId, openProjectId, openCommunityId],
  );

  // Sohbetler henüz yüklenmediyse açık sohbetin kimliğini bilemeyiz: liste yerine boş bırak (kanal listesi → sohbet listesi sıçraması olmasın).
  if (id && !hub && !ready) return null;
  if (!target) return <ConversationsPane embedded />;
  if (!wide) return null;
  if (target.kind === "community") return <CommunityHubView key={target.communityId} communityId={target.communityId} embedded />;
  return <TeamHubView key={`${target.teamId}:${target.projectId ?? ""}`} teamId={target.teamId} projectId={target.projectId} embedded openId={id} />;
}
