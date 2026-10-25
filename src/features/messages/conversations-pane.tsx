"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Inbox, MessageCircle, Plus, Search, Star, UsersRound } from "lucide-react";
import { ConversationList } from "./conversation-list";
import { NewChatModal } from "./new-chat-modal";
import { useRealMessages } from "./real-messages-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { bucketConversations } from "@/lib/conversation-lists";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, messageHref } from "@/lib/utils";
import { Eyebrow } from "@/features/content/detail-parts";
import { ListControlRow, SadeTitle } from "@/features/content/list-control-row";
import { CONTROL_ICON_BUTTON, type SectionMenuItem } from "@/features/content/section-menu";
import type { Conversation } from "@/types";

type MessagesView = "inbox" | "requests" | "archived" | "starred" | "communities";

/**
 * The conversation list (message requests + chats) with its own search box.
 * One component, two placements: full-page on phones (`/messages`) and the
 * fixed left pane beside the open chat on tablet/desktop (`embedded`) —
 * same data (`useRealMessages`), same rows, no second messaging list.
 */
export function ConversationsPane({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const { conversations, startConversationWith, unarchiveConversation } = useRealMessages();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MessagesView>("inbox");
  const [searchOpen, setSearchOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);

  const sharePromptId = searchParams.get("sharePromptId");
  const shareRequestId = searchParams.get("shareRequestId");
  // Workflow / preset ride the same conversation-picker via a client-side query param (no embed column), as plain text.
  const shareWorkflowId = searchParams.get("shareWorkflowId");
  const sharePresetId = searchParams.get("sharePresetId");
  // Topluluk başvuru gönderisi de aynı yolla (düz metin bloğu) taşınır.
  const sharePostId = searchParams.get("sharePostId");
  const isSharing = Boolean(sharePromptId || shareRequestId || shareWorkflowId || sharePresetId || sharePostId);
  const shareQuery = sharePromptId
    ? `sharePromptId=${sharePromptId}`
    : shareRequestId
      ? `shareRequestId=${shareRequestId}`
      : shareWorkflowId
        ? `shareWorkflowId=${shareWorkflowId}`
        : sharePresetId
          ? `sharePresetId=${sharePresetId}`
          : sharePostId
            ? `sharePostId=${sharePostId}`
            : undefined;

  const activeId = pathname.startsWith("/messages/local") ? searchParams.get("id") : null;

  // Archive / "deleted from my list" are per-viewer state: every list below derives from the viewer's own rows.
  const buckets = useMemo(() => bucketConversations(conversations), [conversations]);
  const q = query.trim().toLowerCase();
  const matches = (list: Conversation[]) =>
    !q
      ? list
      : list.filter((c) => {
          if (c.group) return c.group.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q);
          const p = c.participants[0];
          return p?.displayName.toLowerCase().includes(q) || p?.username.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q);
        });

  const accepted = matches(buckets.inbox);
  const pending = matches(buckets.requests);
  const archived = matches(buckets.archived);
  const searching = query.trim() !== "";
  const inArchive = view === "archived";
  const inRequests = view === "requests";
  const noMatches = searching && (inArchive ? archived.length === 0 : inRequests ? pending.length === 0 : accepted.length === 0 && pending.length === 0);
  const nothingAtAll = !searching && view === "inbox" && buckets.inbox.length === 0 && buckets.requests.length === 0;

  const withShare = (href: string) => (shareQuery ? `${href}&${shareQuery}` : href);

  async function handleUnarchive(conversationId: string) {
    setBusyId(conversationId);
    setActionError(false);
    try {
      await unarchiveConversation(conversationId);
    } catch (err) {
      console.error("unarchiveConversation", err);
      setActionError(true);
    } finally {
      setBusyId(null);
    }
  }

  const menuItems: SectionMenuItem<MessagesView>[] = [
    { key: "inbox", label: t("messages.chatsHeading"), icon: MessageCircle },
    { key: "requests", label: t("messages.messageRequestsHeading"), icon: Inbox, count: buckets.requests.length || undefined },
    { key: "archived", label: t("messages.archivedHeading"), icon: Archive, meta: buckets.archived.length },
    // Not views but doors: the starred messages screen and the communities (their chats live there).
    { key: "starred", label: t("chat.starred.title"), icon: Star, dividerBefore: true },
    { key: "communities", label: t("communities.messages.entryAria"), icon: UsersRound },
  ];
  function pickView(next: MessagesView) {
    if (next === "starred") return router.push("/messages/starred");
    if (next === "communities") return router.push("/communities");
    setView(next);
    setActionError(false);
  }
  const searchShown = searchOpen || searching;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", embedded ? "" : "mx-auto w-full max-w-3xl px-3 pb-6 pt-3 sm:px-5 sm:pt-5")}>
      <div className={cn(embedded && "px-4 pt-4")}>
        {embedded ? <h1 className="mb-3 font-display text-[1.875rem] font-bold leading-[1.1] tracking-[-0.02em] text-text">{t("header.messagesAriaLabel")}</h1> : <SadeTitle className="mb-4">{t("header.messagesAriaLabel")}</SadeTitle>}
        {/* Sade düzen (docs/history/234-*): tek "Sohbetler ▾" menüsü (istekler sayaçlı, arşiv, yıldızlı, topluluk sohbetleri) + arama simgesi + yeni sohbet. */}
        <div className="mb-3">
          <ListControlRow
            showView={false}
            menu={{ items: menuItems, active: view, onChange: pickView, ariaLabel: t("messages.sectionsAria"), title: t("header.messagesAriaLabel") }}
            search={{ open: searchShown, onToggle: () => (searchShown ? (setQuery(""), setSearchOpen(false)) : setSearchOpen(true)), label: t("messages.searchConversations") }}
            trailing={
              <button
                type="button"
                onClick={() => setNewChatOpen(true)}
                aria-label={t("messages.newChatAria")}
                title={t("messages.newChat")}
                aria-haspopup="dialog"
                className={cn(CONTROL_ICON_BUTTON, "bg-surface-soft hover:bg-border-soft")}
              >
                <Plus size={22} strokeWidth={1.75} aria-hidden />
              </button>
            }
          />
        </div>
        {searchShown && (
          <label className="relative mb-3 block">
            <span className="sr-only">{t("messages.searchConversations")}</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("messages.searchConversations")}
              autoFocus
              className="h-10 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </label>
        )}
        {view === "inbox" && buckets.requests.length > 0 && !searching && (
          <button
            type="button"
            onClick={() => setView("requests")}
            data-message-requests-banner=""
            className="mb-3 flex w-full items-center gap-3 rounded-lg border border-primary/25 bg-primary-soft/60 px-3 py-2.5 text-left transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
              <Inbox size={17} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-small font-semibold text-text">{t("messages.requestsBanner", { count: buckets.requests.length })}</span>
            <span className="shrink-0 text-small font-semibold text-primary">{t("messages.requestsOpen")}</span>
          </button>
        )}
        {actionError && (
          <p role="alert" className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {t("messages.stateUpdateFailed")}
          </p>
        )}
        {isSharing && (
          <p className="mb-3 rounded-lg border border-primary/20 bg-primary-soft/50 px-3 py-2 text-sm text-text">
            {t("messages.pickAConversationBody")}
          </p>
        )}
      </div>
      <div className={cn("min-h-0 flex-1", embedded && "overflow-y-auto")}>
        {noMatches ? (
          <p className="py-10 text-center text-sm text-text-muted">{t("messages.noConversationMatches")}</p>
        ) : inArchive ? (
          <ConversationList
            conversations={archived}
            shareQuery={shareQuery}
            activeId={activeId}
            flush={embedded}
            emptyLabel={t("messages.archivedEmpty")}
            onUnarchive={handleUnarchive}
            busyId={busyId}
          />
        ) : inRequests ? (
          <>
            <p className={cn("mb-2 text-xs text-text-muted", embedded ? "px-4" : "px-1")}>{t("messages.messageRequestsHint")}</p>
            <ConversationList conversations={pending} shareQuery={shareQuery} activeId={activeId} flush={embedded} emptyLabel={t("messages.requestsEmpty")} />
          </>
        ) : nothingAtAll ? (
          <EmptyState
            icon={MessageCircle}
            title={t("messages.emptyTitle")}
            description={t("messages.emptyDescription")}
            action={{ label: t("messages.startChat"), onClick: () => setNewChatOpen(true), variant: "primary" }}
            className="mx-1"
            compact
          />
        ) : (
          (accepted.length > 0 || pending.length === 0 || searching) && (
            <>
              {searching && pending.length > 0 && (
                <>
                  <Eyebrow as="h2" className={cn("mb-1.5", embedded ? "px-4" : "px-1")}>
                    {t("messages.messageRequestsHeading")} ({pending.length})
                  </Eyebrow>
                  <div className="mb-4">
                    <ConversationList conversations={pending} shareQuery={shareQuery} activeId={activeId} flush={embedded} />
                  </div>
                  {accepted.length > 0 && (
                    <Eyebrow as="h2" className={cn("mb-2", embedded ? "px-4" : "px-1")}>
                      {t("messages.chatsHeading")}
                    </Eyebrow>
                  )}
                </>
              )}
              <ConversationList conversations={accepted} shareQuery={shareQuery} activeId={activeId} flush={embedded} />
            </>
          )
        )}
      </div>
      {newChatOpen && (
        <NewChatModal
          onClose={() => setNewChatOpen(false)}
          showCommunitiesLink={!isSharing}
          onOpenConversation={(conversationId) => {
            setNewChatOpen(false);
            router.push(withShare(messageHref({ id: conversationId })));
          }}
          onStartDraft={async (person) => {
            if (shareQuery) {
              // Picking someone to SHARE content with is an immediate send intent, so the conversation is created now (same as the profile's "Mesaj Gönder").
              const conversation = await startConversationWith(person);
              setNewChatOpen(false);
              router.push(withShare(messageHref(conversation)));
              return;
            }
            setNewChatOpen(false);
            router.push(`/messages/local?to=${person.id}`);
          }}
        />
      )}
    </div>
  );
}
