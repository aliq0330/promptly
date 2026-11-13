"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp } from "@/components/icons/chevron-up";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { PresenceAvatar } from "@/features/presence/presence-ui";
import { useTeamChannelList } from "@/features/teams/team-chat-data";
import { bucketConversations, unreadConversationCount } from "@/lib/conversation-lists";
import { useTranslation } from "@/lib/i18n/language-provider";
import { formatUnread, messageHref, roomHref } from "@/lib/utils";
import { DockHubView } from "./dock-hub-view";
import { DockListView } from "./dock-list-view";
import { LocalConversationView } from "./local-conversation-view";
import { NewChatDraftView } from "./new-chat-draft-view";
import { useMessageDock, useMessageDockEnabled } from "./message-dock-provider";
import { useRealMessages } from "./real-messages-provider";

/**
 * Mesajlar dock'u (docs/history/328-*): büyük ekranlarda (≥ lg) sağ altta SABİT duran "Mesajlar" hapı; basınca sayfayı değiştirmeden sağ altta bir panel açılır
 * (liste · mesaj istekleri · sohbet · yeni sohbet taslağı), arkası loşlanmaz, sayfa değişse de açık kalır. Telefonda/tablette ve `/messages`'ta çizilmez
 * (`useMessageDockEnabled`). Sohbet ekranı `LocalConversationView`'ın dock kipidir — ikinci bir mesajlaşma arayüzü yok. `data-app-chrome` taşır: yazma ekranı ve
 * hikâye açıkken CSS onu gizler.
 */
export function MessageDock() {
  const enabled = useMessageDockEnabled();
  const dock = useMessageDock();
  const pillRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Panel küçülünce odak kaybolmasın: hap geri gelir ve odağı alır.
  useEffect(() => {
    if (wasOpen.current && !dock.open) pillRef.current?.focus({ preventScroll: true });
    wasOpen.current = dock.open;
  }, [dock.open]);

  if (!enabled) return null;
  return dock.open ? (
    <Suspense fallback={null}>
      <DockPanel />
    </Suspense>
  ) : (
    <DockPill pillRef={pillRef} />
  );
}

/** En yeni üç sohbetin avatarları + okunmamış sohbet sayısı. */
function DockPill({ pillRef }: { pillRef: React.RefObject<HTMLButtonElement | null> }) {
  const { t } = useTranslation();
  const dock = useMessageDock();
  const { conversations } = useRealMessages();
  const unread = unreadConversationCount(conversations);
  const recent = bucketConversations(conversations).inbox.slice(0, 3);
  return (
    <button
      ref={pillRef}
      type="button"
      onClick={dock.toggle}
      aria-label={unread > 0 ? `${t("dock.open")} — ${t("dock.unreadAria", { count: unread })}` : t("dock.open")}
      aria-expanded={false}
      data-app-chrome=""
      data-message-dock-pill=""
      className="fixed bottom-4 right-6 z-40 flex h-12 animate-fade-in items-center gap-3 rounded-full border border-border-soft bg-surface py-1 pl-1.5 pr-4 text-small font-semibold text-text shadow-pop transition-transform duration-200 ease-soft hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {recent.length > 0 && (
        <span aria-hidden className="flex">
          {recent.map((conversation, index) => (
            <span key={conversation.id} className={index > 0 ? "-ml-2" : undefined}>
              {conversation.group ? (
                <GroupAvatar name={conversation.group.name} avatarUrl={conversation.group.avatarUrl} size={32} />
              ) : (
                <PresenceAvatar userId={conversation.participants[0]?.id} src={conversation.participants[0]?.avatarUrl} alt="" size={32} className="ring-2 ring-surface" />
              )}
            </span>
          ))}
        </span>
      )}
      <span className={recent.length > 0 ? undefined : "pl-2.5"}>{t("header.messagesAriaLabel")}</span>
      {unread > 0 && (
        <span aria-hidden data-dock-badge="" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-micro font-bold leading-none text-primary-foreground">
          {formatUnread(unread)}
        </span>
      )}
      <ChevronUp size={16} className="text-text-muted" aria-hidden />
    </button>
  );
}

function DockPanel() {
  const { t } = useTranslation();
  const dock = useMessageDock();
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);
  const { view } = dock;

  // Açılınca odak panele girer (klavye kullanıcısı hap'ın yokluğunda sayfada kaybolmasın).
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  /** "Tam sayfada aç": panel küçülür, ilgili `/messages` sayfası açılır (orada dock yoktur). */
  function expand(href: string) {
    dock.minimize();
    router.push(href);
  }
  const backToList = () => dock.setView({ kind: "list" });
  // Sohbetten geri bir ÜST SEVİYEYE döner (docs/history/382-*): proje kanalı → proje listesi, ekip kanalı → ekip listesi, topluluk odası → oda listesi; diğerleri → Mesajlar listesi.
  const chatId = view.kind === "chat" ? view.conversationId : null;
  const { conversations } = useRealMessages();
  const chatConversation = chatId ? conversations.find((conversation) => conversation.id === chatId) : undefined;
  const chatTeamId = chatConversation?.group?.team?.id ?? null;
  const { channels: chatTeamChannels } = useTeamChannelList(chatTeamId);
  const chatProjectId = chatTeamId && chatId ? (chatTeamChannels.find((channel) => channel.id === chatId)?.projectId ?? null) : null;
  const backFromChat = () => {
    if (chatTeamId) dock.setView({ kind: "team", teamId: chatTeamId, projectId: chatProjectId });
    else if (chatConversation?.group && chatId) dock.setView({ kind: "community", communityId: chatId });
    else backToList();
  };

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label={t("header.messagesAriaLabel")}
      data-app-chrome=""
      data-message-dock=""
      className="fixed bottom-4 right-6 z-40 flex h-[min(36rem,calc(100dvh-6rem))] w-[24rem] origin-bottom-right animate-pop-in flex-col overflow-hidden rounded-xl border border-border-soft bg-surface shadow-pop focus:outline-none"
    >
      {view.kind === "chat" ? (
        <LocalConversationView
          key={view.conversationId}
          dock={{
            conversationId: view.conversationId,
            roomId: view.roomId ?? null,
            onBack: backFromChat,
            onExpand: () => expand(view.roomId ? roomHref(view.conversationId, view.roomId) : messageHref({ id: view.conversationId })),
            onMinimize: dock.minimize,
            onOpenConversation: (conversationId: string) => dock.openChat(conversationId),
          }}
        />
      ) : view.kind === "team" || view.kind === "community" ? (
        <DockHubView view={view} />
      ) : view.kind === "draft" ? (
        <NewChatDraftView
          key={view.userId}
          userId={view.userId}
          dock={{
            onBack: backToList,
            onExpand: () => expand(`/messages/local?to=${view.userId}`),
            onMinimize: dock.minimize,
            onOpenConversation: (conversationId) => dock.setView({ kind: "chat", conversationId }),
          }}
        />
      ) : (
        <DockListView key={view.kind} kind={view.kind} onExpand={() => expand("/messages")} />
      )}
    </aside>
  );
}
