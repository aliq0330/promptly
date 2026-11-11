"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocalConversationView } from "./local-conversation-view";
import { NewChatDraftView } from "./new-chat-draft-view";
import { CommunityHubView } from "./community-hub-view";
import { TeamHubView } from "./team-hub-view";

/** `/messages/local`: `?id=` is an existing conversation; `?to=` (and no id) is the empty composer behind "Yeni sohbet". */
export function ConversationRoute() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const to = searchParams.get("to");
  // Ekip / proje / topluluk sayfası (docs/history/369-*): kanalların listelendiği sayfa; sohbet ekranından AYRIDIR (`?id=` kanalın kendisidir).
  const hub = searchParams.get("hub");
  const hubTeam = searchParams.get("team");
  // Eski oda merkezi bağlantısı (`?view=rooms`, docs/history/352-*): Yön A'da (docs/history/353-*) oda listesi topluluk bilgi sayfasının "Odalar" bölümüdür.
  const legacyRoomsHub = Boolean(id) && searchParams.get("view") === "rooms";
  useEffect(() => {
    if (legacyRoomsHub && id) router.replace(`/messages/local?id=${encodeURIComponent(id)}&panel=about`);
  }, [legacyRoomsHub, id, router]);
  if (hub === "team" && hubTeam) return <TeamHubView key={`${hubTeam}:${searchParams.get("project") ?? ""}`} teamId={hubTeam} projectId={searchParams.get("project")} />;
  if (hub === "community" && id) return <CommunityHubView key={id} communityId={id} />;
  if (!id && to) return <NewChatDraftView key={to} userId={to} />;
  if (legacyRoomsHub) return null;
  return <LocalConversationView />;
}
