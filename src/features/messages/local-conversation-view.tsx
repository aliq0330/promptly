"use client";

import { useEffect, useRef, useState, type FormEvent, type UIEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "./real-messages-provider";
import { MessageBubble, type DeleteMode } from "./message-bubble";
import {
  deleteMessageForEveryone,
  editMessage,
  fetchConversationForUser,
  fetchMessages,
  hideMessageForMe,
  mapMessageRow,
  markConversationRead,
  sendMessage,
  type MessageRow,
} from "@/lib/supabase/messages";
import { mergeIncomingMessage, applyMessageUpdate } from "./realtime-helpers";
import { computeKeyboardInset } from "./viewport-helpers";
import { supabase } from "@/lib/supabase/client";
import { fetchIsBlockedByMe, unblockUser } from "@/lib/supabase/blocks";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { parseHighlightValue } from "@/lib/notification-utils";
import { profileHref } from "@/lib/utils";
import type { Conversation, Message } from "@/types";

/** Same fade timing as the comment-thread/response flash — one shared feel across the app for "you just jumped here from a notification". */
const HIGHLIGHT_DURATION_MS = 2500;

/** The raw Postgres RLS-denial message for a blocked-either-direction send — translated into something a user can actually act on. */
function translateSendError(message: string): string {
  if (message.toLowerCase().includes("row-level security")) {
    return "Bu mesaj gönderilemedi. Kullanıcı seni engellemiş olabilir.";
  }
  return message;
}

/**
 * Client-rendered counterpart to `/messages/[conversationId]` for a
 * genuinely real conversation (CLAUDE.md Bölüm 21 Faz 6 / Faz A). Looked up
 * by a `?id=` query param, same pattern as `/prompts/local`/`/requests/
 * local`. The composer here genuinely, permanently sends — this is the one
 * messaging surface in the whole app where that's true.
 *
 * `?sharePromptId=`/`?shareRequestId=` (set by a post's "Mesajla gönder")
 * attach that content to the next message sent in this conversation.
 */
export function LocalConversationView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const shareParamPromptId = searchParams.get("sharePromptId");
  const shareParamRequestId = searchParams.get("shareRequestId");
  const { user } = useAuth();
  const { getCached, acceptRequest, declineRequest } = useRealMessages();
  const { getCached: getCachedPrompt, fetchById: fetchPromptById } = useRealPrompts();
  const { getCached: getCachedRequest, fetchById: fetchRequestById } = useRealRequests();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [fetchedShareTitle, setFetchedShareTitle] = useState<string | null>(null);
  const [dismissedShare, setDismissedShare] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; mode: DeleteMode } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [isDecliningRequest, setIsDecliningRequest] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const highlight = parseHighlightValue(searchParams.get("hl"));
  const highlightMessageId = highlight?.kind === "message" ? highlight.id : null;
  const [flashedMessageId, setFlashedMessageId] = useState<string | null>(null);
  const [messageHighlightNotFound, setMessageHighlightNotFound] = useState(false);
  const processedMessageHighlight = useRef<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const messagesById = new Map(messages.map((m) => [m.id, m]));

  useEffect(() => {
    isNearBottomRef.current = isNearBottom;
  }, [isNearBottom]);

  function handleListScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distanceFromBottom < 80);
  }

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
      const [thread] = await Promise.all([fetchMessages(id, user.id), markConversationRead(id, user.id)]);
      if (cancelled) return;
      setMessages(thread);
      setChecked(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  // Land on the specific message a mesaj bildirimi pointed at (Aşama 4.8) —
  // once the thread has actually loaded. A message that isn't in the loaded
  // list (deleted for everyone and long gone, or hidden by this viewer via
  // "benden sil" — `fetchMessages` already filters those out) gets an
  // honest fallback instead of silently landing at the top (Aşama 6).
  useEffect(() => {
    if (!highlightMessageId || !checked) return;
    if (processedMessageHighlight.current === highlightMessageId) return;
    processedMessageHighlight.current = highlightMessageId;
    const found = messages.some((m) => m.id === highlightMessageId);
    if (!found) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time result of a lookup that only ever runs once per highlightMessageId (guarded above), not a render-time derivation
      setMessageHighlightNotFound(true);
      return;
    }
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-message-id="${highlightMessageId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashedMessageId(highlightMessageId);
    const timer = setTimeout(() => setFlashedMessageId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [checked, messages, highlightMessageId]);

  // Gerçek zamanlı senkronizasyon (Bölüm 21 Faz C) — bu, karşı tarafın
  // gönderdiği bir mesajın sayfa yeniden ziyaret edilene kadar görünmediği,
  // Faz 6'dan beri bilinen sınırlamanın karşılığı. `messages` INSERT/UPDATE
  // olaylarına, yalnızca bu konuşma için abone oluyor — Realtime, Bölüm 19'un
  // `is_conversation_member(conversation_id)` SELECT politikasını zaten
  // Postgres Changes yetkilendirmesinde kullandığından (Supabase'in
  // belgelenmiş davranışı), üye olmayan biri bu kanala hiç abone olamıyor;
  // ekstra bir yetkilendirme kontrolü burada gerekmiyor. Gerçek satır ↔
  // `Message` eşlemesi `mapMessageRow`'la REST yolundaki BİREBİR aynı
  // fonksiyon; birleştirme mantığı (`mergeIncomingMessage`/
  // `applyMessageUpdate`) test edilebilir olsun diye saf fonksiyonlara
  // ayrıldı — bu sandbox'ın ağ kısıtı gerçek bir WebSocket bağlantısını hiç
  // test edemediğinden (Bölüm 21 Faz 6'dan beri bilinen sınırlama), asıl
  // doğrulanabilir olan kısım bu.
  useEffect(() => {
    if (!id || !user) return;

    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const incoming = mapMessageRow(payload.new as MessageRow);
          setMessages((prev) => mergeIncomingMessage(prev, incoming));
          if (incoming.senderId !== user.id) {
            markConversationRead(id, user.id).catch((err) => console.error("markConversationRead (realtime)", err));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const updated = mapMessageRow(payload.new as MessageRow);
          setMessages((prev) => applyMessageUpdate(prev, updated));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user]);

  // Whether the viewer themselves has blocked the other participant — the
  // composer disables when true. Deliberately does NOT try to detect "they
  // blocked me" ahead of time (the blocks SELECT policy can't see that
  // side, see fetchIsBlockedByMe's own comment) — that case only surfaces
  // when an actual send fails, handled in handleSubmit's catch below.
  useEffect(() => {
    let cancelled = false;
    const participantId = conversation?.participants[0]?.id;
    if (!user || !participantId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no conversation loaded yet, nothing to check
      setBlockedByMe(false);
      return;
    }
    fetchIsBlockedByMe(user.id, participantId).then((result) => {
      if (!cancelled) setBlockedByMe(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user, conversation]);

  // Resolves a `?sharePromptId=`/`?shareRequestId=` deep link into a real title for the composer banner — cache hit resolves synchronously via the derivation below; a miss falls back to a real fetch here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state for a new share deep link, not reacting to an external system
    setFetchedShareTitle(null);
    setDismissedShare(false);
    if (shareParamPromptId && !getCachedPrompt(shareParamPromptId)) {
      fetchPromptById(shareParamPromptId).then((result) => {
        if (result) setFetchedShareTitle(result.title);
      });
    } else if (shareParamRequestId && !getCachedRequest(shareParamRequestId)) {
      fetchRequestById(shareParamRequestId).then((result) => {
        if (result) setFetchedShareTitle(result.title);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareParamPromptId, shareParamRequestId]);

  const pendingShare = dismissedShare
    ? null
    : shareParamPromptId
      ? { type: "prompt" as const, id: shareParamPromptId, title: getCachedPrompt(shareParamPromptId)?.title ?? fetchedShareTitle ?? "Yükleniyor…" }
      : shareParamRequestId
        ? { type: "request" as const, id: shareParamRequestId, title: getCachedRequest(shareParamRequestId)?.title ?? fetchedShareTitle ?? "Yükleniyor…" }
        : null;

  // Yeni bir mesaj geldiğinde yalnızca kullanıcı zaten en alttaysa (ya da
  // yeni mesajı kendisi gönderdiyse) en alta kaydır — eski mesajları
  // incelerken gelen bir mesaj scroll konumunu zorla değiştirmesin.
  useEffect(() => {
    const last = messages[messages.length - 1];
    const isOwnMessage = Boolean(last && user && last.senderId === user.id);
    if (isNearBottomRef.current || isOwnMessage) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only reacts to the message count changing, reads the rest fresh via refs/closures
  }, [messages.length]);

  // Mobil klavye desteği (iPhone) — `panelRef`'in taban (bottom) boşluğu
  // varsayılan olarak Tailwind sınıflarından geliyor (mobil bottom
  // navigation + safe-area, masaüstünde 0). VisualViewport API klavye
  // açıldığında küçülüyor; aradaki fark klavyenin kapladığı alan
  // (`computeKeyboardInset`, ayrı bir saf fonksiyona çıkarıldı ki gerçek
  // bir klavye olmadan da doğrulanabilsin — bu sandbox'ta gerçek bir iOS
  // klavyesi hiç açılamıyor). Klavye kapladığı alan, CSS'in zaten ayırdığı
  // taban boşluğundan büyükse, composer'ı klavyenin hemen üstüne çekmek
  // için `bottom`'u JS ile klavye yüksekliğine eşitliyoruz; klavye
  // kapanınca inline stili temizleyip CSS'e geri dönüyoruz.
  useEffect(() => {
    const panel = panelRef.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!panel || !vv) return;

    let baselineBottom: number | null = null;

    function update() {
      if (!panel || !vv) return;
      if (baselineBottom === null) {
        baselineBottom = parseFloat(getComputedStyle(panel).bottom) || 0;
      }
      const keyboardInset = computeKeyboardInset({
        windowInnerHeight: window.innerHeight,
        visualViewportHeight: vv.height,
        visualViewportOffsetTop: vv.offsetTop,
      });
      if (keyboardInset > baselineBottom + 1) {
        panel.style.bottom = `${keyboardInset}px`;
      } else {
        panel.style.bottom = "";
      }
      if (isNearBottomRef.current) {
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
      }
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      panel.style.bottom = "";
    };
  }, []);

  function clearShareParams() {
    if (!id) return;
    router.replace(`/messages/local?id=${id}`);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if ((!trimmed && !pendingShare) || !id || !user || isSending) return;
    setIsSending(true);
    setSendError(null);
    try {
      const sent = await sendMessage(id, user.id, {
        body: trimmed || undefined,
        sharedPromptId: pendingShare?.type === "prompt" ? pendingShare.id : undefined,
        sharedRequestId: pendingShare?.type === "request" ? pendingShare.id : undefined,
        replyToMessageId: replyingTo?.id,
      });
      setMessages((prev) => [...prev, sent]);
      setDraft("");
      setReplyingTo(null);
      if (pendingShare) {
        setDismissedShare(true);
        clearShareParams();
      }
      // Replying to a pending message request auto-accepts it (Bölüm 21 Faz B) — matches how most real messaging apps treat a reply as implicit acceptance.
      if (conversation?.myStatus === "pending") {
        setConversation((prev) => (prev ? { ...prev, myStatus: "accepted" } : prev));
        acceptRequest(id).catch((err) => console.error("acceptRequest (auto, on reply)", err));
      }
    } catch (err) {
      setSendError(err instanceof Error ? translateSendError(err.message) : "Mesaj gönderilemedi, lütfen tekrar dene.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleUnblock() {
    if (!user || !conversation) return;
    setIsUnblocking(true);
    try {
      await unblockUser(user.id, conversation.participants[0].id);
      setBlockedByMe(false);
    } catch (err) {
      console.error("unblockUser", err);
    } finally {
      setIsUnblocking(false);
    }
  }

  async function handleAcceptRequest() {
    if (!id) return;
    setConversation((prev) => (prev ? { ...prev, myStatus: "accepted" } : prev));
    try {
      await acceptRequest(id);
    } catch (err) {
      console.error("acceptRequest", err);
    }
  }

  async function handleDeclineRequest() {
    if (!id) return;
    setIsDecliningRequest(true);
    try {
      await declineRequest(id);
      router.push("/messages");
    } catch (err) {
      console.error("declineRequest", err);
      setIsDecliningRequest(false);
    }
  }

  function startEdit(message: Message) {
    setEditingId(message.id);
    setEditDraft(message.body ?? "");
    setEditError(null);
  }

  async function submitEdit(messageId: string) {
    if (!user || !editDraft.trim()) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const updated = await editMessage(messageId, user.id, editDraft.trim());
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Düzenlenemedi, lütfen tekrar dene.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function requestDelete(messageId: string, mode: DeleteMode) {
    if (!user) return;
    if (!deleteConfirm || deleteConfirm.id !== messageId || deleteConfirm.mode !== mode) {
      setDeleteConfirm({ id: messageId, mode });
      return;
    }
    setDeletingId(messageId);
    try {
      if (mode === "everyone") {
        await deleteMessageForEveryone(messageId, user.id);
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, body: null, sharedPromptId: null, sharedRequestId: null, deletedAt: new Date().toISOString() } : m)),
        );
      } else {
        await hideMessageForMe(messageId, user.id);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } catch (err) {
      console.error("delete message", err);
    } finally {
      setDeletingId(null);
      setDeleteConfirm(null);
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
    <div
      ref={panelRef}
      className="fixed inset-x-0 top-16 z-10 flex flex-col bg-background bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:left-64 lg:bottom-0"
    >
      <Link
        href={profileHref(participant)}
        className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3 hover:bg-accent-surface/40 lg:px-6"
      >
        <Avatar src={participant.avatarUrl} alt={participant.displayName} size={36} />
        <span className="truncate text-sm font-semibold text-text">{participant.displayName}</span>
      </Link>
      {conversation.myStatus === "pending" && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-accent-surface/60 px-4 py-2.5 lg:px-6">
          <p className="text-xs text-text">
            Bu bir mesaj isteği — {participant?.displayName} seni takip etmiyor. Yanıtlarsan otomatik kabul edilir.
          </p>
          <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
            <button type="button" onClick={handleAcceptRequest} className="text-primary hover:underline">
              Kabul Et
            </button>
            <button
              type="button"
              onClick={handleDeclineRequest}
              disabled={isDecliningRequest}
              className="text-red-600 hover:underline disabled:opacity-50"
            >
              {isDecliningRequest ? "Siliniyor..." : "Sil"}
            </button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 lg:px-6" onScroll={handleListScroll}>
        {messageHighlightNotFound && (
          <p className="rounded-md bg-accent-surface/60 px-3 py-2 text-center text-xs text-text-muted">
            Bu mesaj görüntülenemiyor.
          </p>
        )}
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            Bu konuşmada henüz mesaj yok. İlk mesajı sen gönder.
          </p>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isMe={message.senderId === user.id}
              replyPreview={message.replyToMessageId ? (messagesById.get(message.replyToMessageId) ?? null) : null}
              isEditingHere={editingId === message.id}
              isHighlighted={flashedMessageId === message.id}
              actions={{
                onStartReply: setReplyingTo,
                onStartEdit: startEdit,
                onCancelEdit: () => setEditingId(null),
                onSubmitEdit: submitEdit,
                editDraft,
                onEditDraftChange: setEditDraft,
                isSavingEdit,
                editError,
                onRequestDelete: requestDelete,
                onCancelDeleteConfirm: () => setDeleteConfirm(null),
                deleteConfirm,
                isDeletingId: deletingId,
              }}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="border-t border-border p-4 lg:px-6">
        {blockedByMe && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-600">
            <span>Bu kullanıcıyı engelledin, mesaj gönderemezsin.</span>
            <button type="button" onClick={handleUnblock} disabled={isUnblocking} className="font-medium hover:underline disabled:opacity-50">
              {isUnblocking ? "Kaldırılıyor..." : "Engeli kaldır"}
            </button>
          </div>
        )}
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-accent-surface/60 px-3 py-1.5 text-xs text-text-muted">
            <span className="truncate">
              Yanıtlıyorsun: {replyingTo.body ?? (replyingTo.sharedPromptId ? "Bir prompt" : "Bir istek")}
            </span>
            <button type="button" onClick={() => setReplyingTo(null)} aria-label="Yanıtı iptal et">
              <X size={14} />
            </button>
          </div>
        )}
        {pendingShare && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-accent-surface/60 px-3 py-1.5 text-xs text-text-muted">
            <span className="truncate">
              Paylaşılıyor: {pendingShare.title} — istersen bir not ekleyip gönder
            </span>
            <button
              type="button"
              onClick={() => {
                setDismissedShare(true);
                clearShareParams();
              }}
              aria-label="Paylaşımı iptal et"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={pendingShare ? "İstersen bir not ekle (opsiyonel)..." : "Bir mesaj yaz..."}
            disabled={blockedByMe}
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <Button type="submit" disabled={(!draft.trim() && !pendingShare) || isSending || blockedByMe}>
            {isSending ? "Gönderiliyor..." : "Gönder"}
          </Button>
        </div>
        {sendError && <p className="mt-2 text-xs text-red-500">{sendError}</p>}
      </form>
    </div>
  );
}
