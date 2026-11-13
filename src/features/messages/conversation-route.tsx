"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare } from "@/components/icons/messages-square";
import { EmptyState } from "@/components/ui/empty-state";
import { useTeamChannelList } from "@/features/teams/team-chat-data";
import { useTranslation } from "@/lib/i18n/language-provider";
import { hubRouteView, pickDefaultChannel, pickProjectChannel } from "@/lib/messages-hub";
import { teamHubHref } from "@/lib/team-chat";
import { LocalConversationView } from "./local-conversation-view";
import { NewChatDraftView } from "./new-chat-draft-view";
import { CommunityHubView } from "./community-hub-view";
import { TeamHubView } from "./team-hub-view";

/** Tablet/masaüstü (md+) mü? İlk boyamada bilinmez (null): kanal listesi sayfası ile sohbet arasında yanlış bir ilk kare çizilmesin diye o an hiçbir şey çizilmez. */
function useDesktopView(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    (onChange) => {
      const media = window.matchMedia("(min-width: 768px)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => null,
  );
}

/**
 * Bilgisayarda ekip kanal listesi sol sütundadır; sağ bölme sohbettir. `?hub=team&team=` kanal seçilmeden açıldıysa (Mesajlar'dan ekip satırı) ekibin varsayılan kanalı
 * (projede ana kanalı) adrese yazılır, sohbet açılır (docs/history/381-*). Kanalı olmayan ekipte yer tutucu kalır.
 */
function OpenDefaultChannel({ teamId, projectId }: { teamId: string; projectId: string | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { channels, loaded } = useTeamChannelList(teamId);
  const pick = projectId ? pickProjectChannel(channels.filter((channel) => channel.projectId === projectId)) : pickDefaultChannel(channels);
  const pickId = pick?.id ?? null;
  useEffect(() => {
    if (pickId) router.replace(teamHubHref(teamId, projectId, pickId));
  }, [pickId, teamId, projectId, router]);
  if (loaded && !pickId) return <EmptyState icon={MessagesSquare} title={t("th.noChannels")} className="m-auto" compact />;
  return null;
}

/** `/messages/local`: `?id=` is an existing conversation; `?to=` (and no id) is the empty composer behind "Yeni sohbet". */
export function ConversationRoute() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const desktop = useDesktopView();
  const id = searchParams.get("id");
  const to = searchParams.get("to");
  // Ekip / proje / topluluk kanal listesi (docs/history/369-*, 381-*): telefonda ayrı sayfa, bilgisayarda sol sütun (sohbet listesinin yerine). `?id=` kanalın/topluluğun kendisidir.
  const hub = searchParams.get("hub");
  const hubTeam = searchParams.get("team");
  // Eski oda merkezi bağlantısı (`?view=rooms`, docs/history/352-*): Yön A'da (docs/history/353-*) oda listesi topluluk bilgi sayfasının "Odalar" bölümüdür.
  const legacyRoomsHub = Boolean(id) && searchParams.get("view") === "rooms";
  useEffect(() => {
    if (legacyRoomsHub && id) router.replace(`/messages/local?id=${encodeURIComponent(id)}&panel=about`);
  }, [legacyRoomsHub, id, router]);

  const isTeamHub = hub === "team" && Boolean(hubTeam);
  const isCommunityHub = hub === "community" && Boolean(id);
  if (isTeamHub || isCommunityHub) {
    if (desktop === null) return null;
    const view = hubRouteView({ hub, team: hubTeam, project: searchParams.get("project"), id, room: searchParams.get("room") }, desktop);
    if (view === "hub") {
      return isTeamHub ? (
        <TeamHubView key={`${hubTeam}:${searchParams.get("project") ?? ""}`} teamId={hubTeam as string} projectId={searchParams.get("project")} />
      ) : (
        <CommunityHubView key={id as string} communityId={id as string} />
      );
    }
    if (view === "open-default") return <OpenDefaultChannel key={`${hubTeam}:${searchParams.get("project") ?? ""}`} teamId={hubTeam as string} projectId={searchParams.get("project")} />;
  }
  if (!id && to) return <NewChatDraftView key={to} userId={to} />;
  if (legacyRoomsHub) return null;
  return <LocalConversationView />;
}
