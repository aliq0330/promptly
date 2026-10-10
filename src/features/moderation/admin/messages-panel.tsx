"use client";

import { useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  fetchAdminConversationMessages,
  fetchAdminUserConversations,
  type AdminConversation,
  type AdminMessage,
} from "@/lib/supabase/admin";
import { cn, formatRelativeTime } from "@/lib/utils";
import { formatDateTime } from "./format";

/**
 * Private messages. Nothing is fetched until the moderator explicitly asks,
 * because every view (conversation list and each thread) is written to the
 * audit log on the server.
 */
export function MessagesPanel({ userId }: { userId: string }) {
  const { t, language } = useTranslation();
  const [conversations, setConversations] = useState<AdminConversation[] | null>(null);
  const [active, setActive] = useState<AdminConversation | null>(null);
  const [messages, setMessages] = useState<AdminMessage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function show() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      setConversations(await fetchAdminUserConversations(userId));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function open(conversation: AdminConversation) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      setMessages(await fetchAdminConversationMessages(conversation.id, userId));
      setActive(conversation);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const notice = (
    <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-caption text-text-secondary">
      <Lock size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden /> {t("admin.user.messagesNotice")}
    </p>
  );

  if (!conversations) {
    return (
      <div className="space-y-3">
        {notice}
        <Button variant="secondary" size="sm" disabled={busy} onClick={show}>
          {busy ? t("common.loading") : t("admin.user.showMessages")}
        </Button>
        {error && <p className="text-small text-danger">{t("admin.loadFailed")}</p>}
      </div>
    );
  }

  if (active && messages) {
    return (
      <div className="space-y-3">
        {notice}
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => {
            setActive(null);
            setMessages(null);
          }}
        >
          <ArrowLeft size={16} aria-hidden /> {t("admin.user.backToConversations")}
        </Button>
        <p className="text-small font-semibold text-text">{t("admin.user.conversationWith", { name: active.counterpartUsername ?? "?" })}</p>
        <ul className="space-y-2" data-admin-thread>
          {messages.map((m) => {
            const mine = m.senderId === userId;
            const content = m.deletedAt
              ? t("admin.user.messageDeleted")
              : [m.body, m.attachmentCount > 0 ? `[${t("admin.user.attachments", { count: m.attachmentCount })}]` : null, m.sharedPromptId || m.sharedRequestId ? t("admin.user.sharedContent") : null]
                  .filter(Boolean)
                  .join(" ");
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-small", mine ? "bg-primary-soft text-text" : "border border-border-soft bg-surface text-text", m.deletedAt && "italic text-text-muted")}>
                  <p className="text-caption font-medium text-text-muted">@{m.senderUsername ?? "?"}</p>
                  <p className="whitespace-pre-wrap break-words">{content || "—"}</p>
                  <p className="mt-0.5 text-caption text-text-muted" title={formatDateTime(m.createdAt, language)}>
                    {formatRelativeTime(m.createdAt, language)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notice}
      {error && <p className="text-small text-danger">{t("admin.loadFailed")}</p>}
      {conversations.length === 0 && <p className="text-small text-text-muted">{t("admin.user.noConversations")}</p>}
      <ul className="space-y-2">
        {conversations.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => open(c)}
              className="w-full rounded-lg border border-border-soft p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-soft/50"
            >
              <p className="text-small font-medium text-text">
                @{c.counterpartUsername ?? "?"} <span className="text-caption font-normal text-text-muted">· {t("admin.user.conversationCount", { count: c.messageCount })}</span>
              </p>
              {c.lastBody && <p className="line-clamp-1 break-words text-caption text-text-secondary">{c.lastBody}</p>}
              {c.lastMessageAt && <p className="text-caption text-text-muted">{formatRelativeTime(c.lastMessageAt, language)}</p>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
