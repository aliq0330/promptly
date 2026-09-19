"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "./real-messages-provider";
import { fetchConversationForUser, fetchMessages, markConversationRead, sendMessage } from "@/lib/supabase/messages";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Conversation, Message } from "@/types";

/**
 * Client-rendered counterpart to `/messages/[conversationId]` for a
 * genuinely real conversation (CLAUDE.md Bölüm 21 Faz 6) — its id is a real
 * Supabase UUID, never one of the fixed mock conversation ids
 * `generateStaticParams` pre-rendered a page for at build time. Looked up
 * by a `?id=` query param, same pattern as `/prompts/local`/`/requests/
 * local`. Unlike the mock conversation page, the composer here genuinely,
 * permanently sends — this is the one messaging surface in the whole app
 * where that's true.
 */
export function LocalConversationView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { user } = useAuth();
  const { getCached } = useRealMessages();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    if (!id || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no id to look up, or not signed in — nothing to fetch
      setChecked(true);
      return;
    }

    const cached = getCached(id);
    setChecked(false);

    (cached ? Promise.resolve(cached) : fetchConversationForUser(id, user.id)).then(async (found) => {
      if (cancelled) return;
      setConversation(found);
      if (!found) {
        setChecked(true);
        return;
      }
      const [thread] = await Promise.all([fetchMessages(id), markConversationRead(id, user.id)]);
      if (cancelled) return;
      setMessages(thread);
      setChecked(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !id || !user || isSending) return;
    setIsSending(true);
    setSendError(null);
    try {
      const sent = await sendMessage(id, user.id, trimmed);
      setMessages((prev) => [...prev, sent]);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Mesaj gönderilemedi, lütfen tekrar dene.");
    } finally {
      setIsSending(false);
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Giriş yapmalısın</h1>
        <p className="mb-4 text-sm text-text-muted">
          Gerçek konuşmaları görebilmek için giriş yapmış olman gerekiyor.
        </p>
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          Giriş Yap
        </Link>
      </div>
    );
  }

  if (!checked) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">Yükleniyor…</div>
    );
  }

  if (!conversation) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Konuşma bulunamadı</h1>
        <p className="mb-4 text-sm text-text-muted">
          Bu konuşma silinmiş olabilir, ya da bu hesap bu konuşmanın bir üyesi değil.
        </p>
        <Link
          href="/messages"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          Mesajlara Dön
        </Link>
      </div>
    );
  }

  const participant = conversation.participants[0];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:px-6">
        <Avatar src={participant?.avatarUrl} alt={participant?.displayName ?? "Kullanıcı"} size={36} />
        <span className="text-sm font-semibold text-text">{participant?.displayName}</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 lg:px-6">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            Bu konuşmada henüz mesaj yok. İlk mesajı sen gönder.
          </p>
        ) : (
          messages.map((message) => {
            const isMe = message.senderId === user.id;
            return (
              <div key={message.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                    isMe ? "bg-primary text-primary-foreground" : "bg-accent-surface text-text",
                  )}
                >
                  <p>{message.body}</p>
                  <span
                    className={cn(
                      "mt-1 block text-[11px]",
                      isMe ? "text-primary-foreground/70" : "text-text-muted",
                    )}
                  >
                    {formatRelativeTime(message.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="border-t border-border p-4 lg:px-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Bir mesaj yaz..."
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button type="submit" disabled={!draft.trim() || isSending}>
            {isSending ? "Gönderiliyor..." : "Gönder"}
          </Button>
        </div>
        {sendError && <p className="mt-2 text-xs text-red-500">{sendError}</p>}
      </form>
    </div>
  );
}
