"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ConversationList } from "./conversation-list";
import { useRealMessages } from "./real-messages-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/features/content/detail-parts";

/**
 * The conversation list (message requests + chats) with its own search box.
 * One component, two placements: full-page on phones (`/messages`) and the
 * fixed left pane beside the open chat on tablet/desktop (`embedded`) —
 * same data (`useRealMessages`), same rows, no second messaging list.
 */
export function ConversationsPane({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const { conversations } = useRealMessages();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const sharePromptId = searchParams.get("sharePromptId");
  const shareRequestId = searchParams.get("shareRequestId");
  // A generator has no rich embed in the messages schema (Bölüm 9.52's own
  // "no new messaging table/column" rule) — it rides this exact same
  // conversation-picker screen anyway, purely via a client-side query
  // param, and turns into a plain-text message (title + link) once a
  // conversation is picked (see `LocalConversationView`).
  const shareGeneratorId = searchParams.get("shareGeneratorId");
  const shareWorkflowId = searchParams.get("shareWorkflowId");
  const sharePresetId = searchParams.get("sharePresetId");
  const isSharing = Boolean(sharePromptId || shareRequestId || shareGeneratorId || shareWorkflowId || sharePresetId);
  const shareQuery = sharePromptId
    ? `sharePromptId=${sharePromptId}`
    : shareRequestId
      ? `shareRequestId=${shareRequestId}`
      : shareGeneratorId
        ? `shareGeneratorId=${shareGeneratorId}`
        : shareWorkflowId
          ? `shareWorkflowId=${shareWorkflowId}`
          : sharePresetId
            ? `sharePresetId=${sharePresetId}`
            : undefined;

  const activeId = pathname.startsWith("/messages/local") ? searchParams.get("id") : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const p = c.participants[0];
      return (
        p?.displayName.toLowerCase().includes(q) ||
        p?.username.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [conversations, query]);

  const accepted = filtered.filter((c) => c.myStatus === "accepted");
  const pending = filtered.filter((c) => c.myStatus === "pending");
  const noMatches = query.trim() !== "" && filtered.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", embedded ? "" : "mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-6")}>
      <div className={cn(embedded && "px-4 pt-4")}>
        <h1 className={cn("mb-3 text-text", embedded ? "text-h2" : "text-h1")}>{t("header.messagesAriaLabel")}</h1>
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
        {isSharing && (
          <p className="mb-3 rounded-lg border border-primary/20 bg-primary-soft/50 px-3 py-2 text-sm text-text">
            {t("messages.pickAConversationBody")}
          </p>
        )}
      </div>
      <div className={cn("min-h-0 flex-1", embedded && "overflow-y-auto")}>
        {noMatches ? (
          <p className="py-10 text-center text-sm text-text-muted">{t("messages.noConversationMatches")}</p>
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
    </div>
  );
}
