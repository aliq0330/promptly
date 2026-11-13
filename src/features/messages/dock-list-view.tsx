"use client";

import { useMemo, useState } from "react";
import { Inbox } from "@/components/icons/inbox";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Search } from "@/components/icons/search";
import { SquarePen } from "@/components/icons/square-pen";
import { EmptyState } from "@/components/ui/empty-state";
import { bucketConversations, filterConversationsByQuery, rollUpTeamChannels } from "@/lib/conversation-lists";
import { useTranslation } from "@/lib/i18n/language-provider";
import { ConversationList } from "./conversation-list";
import { DockHeader, DOCK_ICON_BUTTON } from "./dock-header";
import { NewChatModal } from "./new-chat-modal";
import { useMessageDock } from "./message-dock-provider";
import { useRealMessages } from "./real-messages-provider";

/**
 * Dock panelinin liste görünümü (docs/history/328-*): aynı veri (`useRealMessages`), aynı satırlar (`ConversationList`) — yalnız satıra basınca sayfaya gitmek yerine
 * sohbet panelde açılır. `requests` = mesaj istekleri listesi (geri okuyla gelen kutusuna döner). "Yeni sohbet" mevcut `NewChatModal`'dır: var olan sohbet panelde açılır,
 * yeni kişi için taslak görünümü açılır (sohbet ilk gerçek mesajla oluşur).
 */
export function DockListView({ kind, onExpand }: { kind: "list" | "requests"; onExpand: () => void }) {
  const { t } = useTranslation();
  const dock = useMessageDock();
  const { conversations } = useRealMessages();
  const [query, setQuery] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const buckets = useMemo(() => bucketConversations(conversations), [conversations]);
  const inRequests = kind === "requests";
  const source = inRequests ? buckets.requests : buckets.inbox;
  // Ekip kanalları panelde de ekip başına tek satırdır (Yön A, docs/history/353-*).
  const shown = rollUpTeamChannels(filterConversationsByQuery(source, query));
  const searching = query.trim() !== "";
  const nothingAtAll = !inRequests && buckets.inbox.length === 0 && buckets.requests.length === 0;

  return (
    <>
      <DockHeader
        onBack={inRequests ? () => dock.setView({ kind: "list" }) : undefined}
        actions={
          !inRequests && (
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              aria-label={t("messages.newChatAria")}
              title={t("messages.newChat")}
              aria-haspopup="dialog"
              data-dock-new-chat=""
              className={DOCK_ICON_BUTTON}
            >
              <SquarePen size={18} aria-hidden />
            </button>
          )
        }
        onExpand={onExpand}
        expandLabel={t("dock.openPage")}
        onMinimize={dock.minimize}
      >
        <h2 className="truncate font-display text-[1.25rem] font-bold leading-none tracking-[-0.02em] text-text">
          {inRequests ? t("messages.messageRequestsHeading") : t("header.messagesAriaLabel")}
        </h2>
      </DockHeader>
      {!nothingAtAll && (
        <label className="relative mx-3 mt-3 block shrink-0">
          <span className="sr-only">{t("messages.searchConversations")}</span>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("messages.searchConversations")}
            data-dock-search=""
            className="h-10 w-full rounded-full border border-border-soft bg-surface-soft pl-10 pr-3 text-small text-text transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </label>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pt-2">
        {!inRequests && buckets.requests.length > 0 && !searching && (
          <button
            type="button"
            onClick={() => dock.setView({ kind: "requests" })}
            data-dock-requests-banner=""
            className="mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-lg border border-primary/25 bg-primary-soft/60 px-3 py-2.5 text-left transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
              <Inbox size={17} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-small font-semibold text-text">{t("messages.requestsBanner", { count: buckets.requests.length })}</span>
            <span className="shrink-0 text-small font-semibold text-primary">{t("messages.requestsOpen")}</span>
          </button>
        )}
        {inRequests && <p className="px-4 pb-2 text-caption text-text-muted">{t("messages.messageRequestsHint")}</p>}
        {nothingAtAll ? (
          <EmptyState
            icon={MessagesSquare}
            title={t("messages.emptyTitle")}
            description={t("messages.emptyDescription")}
            action={{ label: t("messages.startChat"), onClick: () => setNewChatOpen(true), variant: "primary" }}
            className="mx-3 mt-2"
            compact
          />
        ) : searching && shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">{t("messages.noConversationMatches")}</p>
        ) : (
          <ConversationList
            conversations={shown}
            flush
            emptyLabel={inRequests ? t("messages.requestsEmpty") : undefined}
            onOpen={(conversation) => {
              // Ekip (kanalları toplanmış) ve topluluk satırı panelin içinde KANAL/ODA LİSTESİNE açılır (docs/history/382-*); diğerleri sohbeti açar.
              const team = conversation.group?.team ?? null;
              if (team && conversation.teamRollup) dock.openTeam(team.id);
              else if (conversation.group && !team) dock.openCommunity(conversation.group.id);
              else dock.openChat(conversation.id);
            }}
          />
        )}
      </div>
      {newChatOpen && (
        <NewChatModal
          onClose={() => setNewChatOpen(false)}
          onOpenConversation={(conversationId) => {
            setNewChatOpen(false);
            dock.openChat(conversationId);
          }}
          onStartDraft={(person) => {
            setNewChatOpen(false);
            dock.openDraft(person.id);
          }}
        />
      )}
    </>
  );
}
