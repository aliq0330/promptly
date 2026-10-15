"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Archive, ArrowLeft, MessageCircle, Plus, Search, Star, UsersRound } from "lucide-react";
import { ConversationList } from "./conversation-list";
import { NewChatModal } from "./new-chat-modal";
import { CreateGroupModal } from "@/features/groups/create-group-modal";
import { useRealMessages } from "./real-messages-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { bucketConversations } from "@/lib/conversation-lists";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, messageHref } from "@/lib/utils";
import { Eyebrow } from "@/features/content/detail-parts";
import type { Conversation } from "@/types";

/**
 * The conversation list (message requests + chats) with its own search box.
 * One component, two placements: full-page on phones (`/messages`) and the
 * fixed left pane beside the open chat on tablet/desktop (`embedded`) —
 * same data (`useRealMessages`), same rows, no second messaging list.
 */
export function ConversationsPane({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const { conversations, startConversationWith, unarchiveConversation, refresh } = useRealMessages();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"inbox" | "archived">("inbox");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);

  const sharePromptId = searchParams.get("sharePromptId");
  const shareRequestId = searchParams.get("shareRequestId");
  // Workflow / preset ride the same conversation-picker via a client-side query param (no embed column), as plain text.
  const shareWorkflowId = searchParams.get("shareWorkflowId");
  const sharePresetId = searchParams.get("sharePresetId");
  const isSharing = Boolean(sharePromptId || shareRequestId || shareWorkflowId || sharePresetId);
  const shareQuery = sharePromptId
    ? `sharePromptId=${sharePromptId}`
    : shareRequestId
      ? `shareRequestId=${shareRequestId}`
      : shareWorkflowId
        ? `shareWorkflowId=${shareWorkflowId}`
        : sharePresetId
          ? `sharePresetId=${sharePresetId}`
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
  const noMatches = searching && (inArchive ? archived.length === 0 : accepted.length === 0 && pending.length === 0);
  const nothingAtAll = !searching && !inArchive && buckets.inbox.length === 0 && buckets.requests.length === 0;

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

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", embedded ? "" : "mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-6")}>
      <div className={cn(embedded && "px-4 pt-4")}>
        <div className="mb-3 flex items-center justify-between gap-2">
          {inArchive ? (
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setView("inbox");
                  setActionError(false);
                }}
                aria-label={t("messages.backToChats")}
                className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
              >
                <ArrowLeft size={20} />
              </button>
              <h1 className={cn("truncate text-text", embedded ? "text-h2" : "text-h1")}>{t("messages.archivedHeading")}</h1>
            </div>
          ) : (
            <h1 className={cn("text-text", embedded ? "text-h2" : "text-h1")}>{t("header.messagesAriaLabel")}</h1>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/groups"
              aria-label={t("groups.discoverAria")}
              title={t("groups.discoverAria")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-soft bg-surface text-text-secondary shadow-xs transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <UsersRound size={17} />
            </Link>
            <Link
              href="/messages/starred"
              aria-label={t("chat.starred.entryAria")}
              title={t("chat.starred.title")}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-soft bg-surface text-text-secondary shadow-xs transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                pathname.startsWith("/messages/starred") && "border-primary/40 bg-primary-soft text-primary",
              )}
            >
              <Star size={17} />
            </Link>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              aria-label={t("messages.newChatAria")}
              title={t("messages.newChat")}
              aria-haspopup="dialog"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
        <label className="relative mb-3 block">
          <span className="sr-only">{t("messages.searchConversations")}</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("messages.searchConversations")}
            className="h-10 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </label>
        {!inArchive && buckets.archived.length > 0 && (
          <button
            type="button"
            onClick={() => setView("archived")}
            className="mb-3 flex w-full items-center gap-2 rounded-lg border border-border-soft bg-surface px-3 py-2 text-left text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-soft"
          >
            <Archive size={16} className="text-text-muted" />
            <span className="flex-1">{t("messages.archivedHeading")}</span>
            <span className="text-caption tabular-nums text-text-muted">{buckets.archived.length}</span>
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
          <>
            {pending.length > 0 && (
              <div className="mb-4">
                <Eyebrow as="h2" className={cn("mb-1.5", embedded ? "px-4" : "px-1")}>
                  {t("messages.messageRequestsHeading")} ({pending.length})
                </Eyebrow>
                <p className={cn("mb-2 text-xs text-text-muted", embedded ? "px-4" : "px-1")}>
                  {t("messages.messageRequestsHint")}
                </p>
                <ConversationList conversations={pending} shareQuery={shareQuery} activeId={activeId} flush={embedded} />
              </div>
            )}
            {pending.length > 0 && accepted.length > 0 && (
              <Eyebrow as="h2" className={cn("mb-2", embedded ? "px-4" : "px-1")}>
                {t("messages.chatsHeading")}
              </Eyebrow>
            )}
            {(accepted.length > 0 || pending.length === 0) && (
              <ConversationList conversations={accepted} shareQuery={shareQuery} activeId={activeId} flush={embedded} />
            )}
          </>
        )}
      </div>
      {newChatOpen && (
        <NewChatModal
          onClose={() => setNewChatOpen(false)}
          onCreateGroup={
            isSharing
              ? undefined
              : () => {
                  setNewChatOpen(false);
                  setCreateGroupOpen(true);
                }
          }
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
      {createGroupOpen && (
        <CreateGroupModal
          onClose={() => setCreateGroupOpen(false)}
          onCreated={(groupId) => {
            setCreateGroupOpen(false);
            void refresh();
            router.push(messageHref({ id: groupId }));
          }}
        />
      )}
    </div>
  );
}
