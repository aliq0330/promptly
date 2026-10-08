"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type UIEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { useBlockState } from "@/features/moderation/use-block-state";
import { ProfileMoreMenu } from "@/features/profile/profile-more-menu";
import { useRealMessages } from "./real-messages-provider";
import { MessageBubble, type DeleteMode, type MessageReactionEntry } from "./message-bubble";
import { MessageComposer, useImageDrop } from "./message-composer";
import { PendingMessageBubble, type PendingSend } from "./pending-message-bubble";
import { useComposerImages } from "./use-composer-images";
import { removeMessageImages, uploadMessageImage } from "@/lib/supabase/message-images";
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
import { fetchReactionsForConversation, removeMessageReaction, setMessageReaction } from "@/lib/supabase/message-reactions";
import { mergeIncomingMessage, applyMessageUpdate, removeReactionRow, upsertReaction } from "./realtime-helpers";
import { computeKeyboardInset } from "./viewport-helpers";
import { supabase } from "@/lib/supabase/client";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useRealGenerators } from "@/features/generators/real-generators-provider";
import { fetchGeneratorById } from "@/lib/supabase/generators";
import { parseHighlightValue } from "@/lib/notification-utils";
import { profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { translateForRuntime } from "@/lib/i18n/translations";
import { composeGeneratorShareBody } from "./generator-share-format";
import { composeWorkflowShareBody } from "./workflow-share-format";
import { composePresetShareBody } from "./preset-share-format";
import { fetchPresetById } from "@/lib/supabase/presets";
import { useRealPresets } from "@/features/presets/real-presets-provider";
import { fetchWorkflowById } from "@/lib/supabase/workflows";
import { useRealWorkflows } from "@/features/workflows/real-workflows-provider";
import type { Conversation, Generator, Message, MessageAttachment, UserProfile } from "@/types";

/** Used only to give `useBlockState` a stable, always-defined target before the real conversation/participant has loaded — hooks must run unconditionally, and `canBlock` inside it is false until a real user session exists anyway, so this placeholder never actually reaches a query with a meaningful id. */
const EMPTY_PARTICIPANT: UserProfile = {
  id: "",
  username: "",
  displayName: "",
  avatarUrl: null,
  coverUrl: null,
  bio: null,
  website: null,
  followerCount: 0,
  followingCount: 0,
  createdAt: new Date(0).toISOString(),
};

/** Same fade timing as the comment-thread/response flash — one shared feel across the app for "you just jumped here from a notification". */
const HIGHLIGHT_DURATION_MS = 2500;

/** The raw Postgres RLS-denial message for a blocked-either-direction send — translated into something a user can actually act on. */
function translateSendError(message: string): string {
  if (message.toLowerCase().includes("row-level security")) {
    return translateForRuntime("messages.blockedSendError");
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
 * `?sharePromptId=`/`?shareRequestId=` (set by `ShareModal`'s "Promptly'de
 * mesaj olarak gönder" option, Bölüm 9.52) attach that content to the next
 * message sent in this conversation as a real, database-backed embed.
 * `?shareGeneratorId=` (same option, for a generator) has no embed column
 * to attach to (Bölüm 9.52's own "no new messaging schema" rule) — it's
 * resolved into a plain-text title+link line instead, composed at send
 * time in `handleSubmit` below.
 */
export function LocalConversationView() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const shareParamPromptId = searchParams.get("sharePromptId");
  const shareParamRequestId = searchParams.get("shareRequestId");
  const shareParamGeneratorId = searchParams.get("shareGeneratorId");
  const shareParamWorkflowId = searchParams.get("shareWorkflowId");
  const shareParamPresetId = searchParams.get("sharePresetId");
  const { user } = useAuth();
  const { getCached, acceptRequest, declineRequest } = useRealMessages();
  const { getCached: getCachedPrompt, fetchById: fetchPromptById } = useRealPrompts();
  const { getCached: getCachedRequest, fetchById: fetchRequestById } = useRealRequests();
  const { getCached: getCachedGenerator } = useRealGenerators();
  const { getCached: getCachedWorkflow } = useRealWorkflows();
  const { getCached: getCachedPreset } = useRealPresets();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const composerImages = useComposerImages();
  // Photo messages that have left the composer but aren't real rows yet (uploading, or failed and awaiting a retry).
  const [pendingSends, setPendingSends] = useState<PendingSend[]>([]);
  const pendingRef = useRef<PendingSend[]>([]);

  const [fetchedShareTitle, setFetchedShareTitle] = useState<string | null>(null);
  // Only needed for a shared generator — its plain-text share line needs a
  // real `slug` (for `generatorHref`), not just a title, and a cache miss
  // here means fetching the whole object rather than just a title string.
  const [fetchedShareGenerator, setFetchedShareGenerator] = useState<Generator | null>(null);
  const [fetchedShareWorkflowTitle, setFetchedShareWorkflowTitle] = useState<string | null>(null);
  const [fetchedSharePresetTitle, setFetchedSharePresetTitle] = useState<string | null>(null);
  const [dismissedShare, setDismissedShare] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; mode: DeleteMode } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDecliningRequest, setIsDecliningRequest] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  // Aşama 1: which single message currently has its ⋮/emoji icons revealed
  // via a mobile tap — activating a new one (or a tap on blank list space,
  // see handleListBackgroundClick) automatically closes the previous one's,
  // since this is one shared piece of state for the whole thread.
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  // Aşama 2: every reaction currently on any message in this conversation,
  // loaded once with the thread and kept live via the Realtime subscription
  // below — one flat list, not per-message state, so a single query/
  // subscription covers the whole open conversation.
  const [reactionRows, setReactionRows] = useState<{ messageId: string; userId: string; emoji: string }[]>([]);

  // Profil sayfasıyla BİREBİR AYNI engelleme mekanizması (Aşama 8's "profil
  // menüsüyle tutarlılık" — bu, `ProfileMoreMenu`'nün kendisini üst barda
  // yeniden kullanabilmek için de gerekli, aşağıdaki header'a bakınız).
  // `conversation` henüz yüklenmeden hook'lar koşulsuz çağrılmalı, bu
  // yüzden gerçek katılımcı gelene kadar zararsız bir placeholder hedef
  // kullanılıyor — `useBlockState`'in `canBlock`'u zaten oturum yokken
  // false, ve id boş olduğunda sorgu hiçbir şeye eşleşmiyor.
  const blockState = useBlockState(conversation?.participants[0] ?? EMPTY_PARTICIPANT);
  // Desktop drag-and-drop of photos anywhere on the conversation panel.
  const imageDrop = useImageDrop(composerImages.addFiles, !blockState.isBlocked);

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

  useEffect(() => {
    pendingRef.current = pendingSends;
  }, [pendingSends]);

  // Revoke any local previews still held by unsent photo messages when the thread unmounts.
  useEffect(
    () => () => {
      for (const pending of pendingRef.current) for (const image of pending.images) URL.revokeObjectURL(image.previewUrl);
    },
    [],
  );

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
      const [thread, reactions] = await Promise.all([
        fetchMessages(id, user.id),
        fetchReactionsForConversation(id),
        markConversationRead(id, user.id),
      ]);
      if (cancelled) return;
      setMessages(thread);
      setReactionRows(reactions);
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

  // Aynı Realtime deseni, tepkiler için (Aşama 2/6 — "tepki ekleme,
  // değiştirme ve kaldırma gerçek zamanlı olarak karşı tarafa
  // yansıtılmalı"). Ekleme/değiştirme aynı satırın UPSERT'i olduğundan
  // (aynı birincil anahtar `(message_id, user_id)`) ikisi de tek bir
  // INSERT-veya-UPDATE olayı üretiyor; DELETE, `REPLICA IDENTITY FULL`
  // sayesinde (migration'daki not) `conversation_id` filtresini gerçekten
  // değerlendirebiliyor.
  useEffect(() => {
    if (!id || !user) return;

    const channel = supabase
      .channel(`message_reactions:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { message_id: string; user_id: string; emoji: string };
          setReactionRows((prev) => upsertReaction(prev, { messageId: row.message_id, userId: row.user_id, emoji: row.emoji }));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { message_id: string; user_id: string; emoji: string };
          setReactionRows((prev) => upsertReaction(prev, { messageId: row.message_id, userId: row.user_id, emoji: row.emoji }));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const row = payload.old as { message_id: string; user_id: string };
          setReactionRows((prev) => removeReactionRow(prev, row.message_id, row.user_id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user]);

  // Resolves a `?sharePromptId=`/`?shareRequestId=`/`?shareGeneratorId=` deep link into a real title (and, for a generator, the real object) for the composer banner — cache hit resolves synchronously via the derivation below; a miss falls back to a real fetch here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state for a new share deep link, not reacting to an external system
    setFetchedShareTitle(null);
    setFetchedShareGenerator(null);
    setFetchedShareWorkflowTitle(null);
    setFetchedSharePresetTitle(null);
    setDismissedShare(false);
    if (shareParamPromptId && !getCachedPrompt(shareParamPromptId)) {
      fetchPromptById(shareParamPromptId).then((result) => {
        if (result) setFetchedShareTitle(result.title);
      });
    } else if (shareParamRequestId && !getCachedRequest(shareParamRequestId)) {
      fetchRequestById(shareParamRequestId).then((result) => {
        if (result) setFetchedShareTitle(result.title);
      });
    } else if (shareParamWorkflowId && !getCachedWorkflow(shareParamWorkflowId)) {
      fetchWorkflowById(shareParamWorkflowId).then((result) => {
        if (result) setFetchedShareWorkflowTitle(result.workflow.title);
      });
    } else if (shareParamPresetId && !getCachedPreset(shareParamPresetId)) {
      fetchPresetById(shareParamPresetId).then((result) => {
        if (result) setFetchedSharePresetTitle(result.title);
      });
    } else if (shareParamGeneratorId && !getCachedGenerator(shareParamGeneratorId)) {
      fetchGeneratorById(shareParamGeneratorId).then((result) => {
        if (result) setFetchedShareGenerator(result);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareParamPromptId, shareParamRequestId, shareParamGeneratorId, shareParamWorkflowId, shareParamPresetId]);

  const shareGenerator = shareParamGeneratorId ? (getCachedGenerator(shareParamGeneratorId) ?? fetchedShareGenerator) : null;

  const pendingShare = dismissedShare
    ? null
    : shareParamPromptId
      ? { type: "prompt" as const, id: shareParamPromptId, title: getCachedPrompt(shareParamPromptId)?.title ?? fetchedShareTitle ?? t("common.loading") }
      : shareParamRequestId
        ? { type: "request" as const, id: shareParamRequestId, title: getCachedRequest(shareParamRequestId)?.title ?? fetchedShareTitle ?? t("common.loading") }
        : shareParamGeneratorId
          ? {
              type: "generator" as const,
              id: shareParamGeneratorId,
              title: shareGenerator?.title ?? t("common.loading"),
              slug: shareGenerator?.slug ?? null,
            }
          : shareParamWorkflowId
            ? {
                type: "workflow" as const,
                id: shareParamWorkflowId,
                title: getCachedWorkflow(shareParamWorkflowId)?.title ?? fetchedShareWorkflowTitle ?? t("common.loading"),
                resolved: Boolean(getCachedWorkflow(shareParamWorkflowId) ?? fetchedShareWorkflowTitle),
              }
            : shareParamPresetId
              ? {
                  type: "preset" as const,
                  id: shareParamPresetId,
                  title: getCachedPreset(shareParamPresetId)?.title ?? fetchedSharePresetTitle ?? t("common.loading"),
                  resolved: Boolean(getCachedPreset(shareParamPresetId) ?? fetchedSharePresetTitle),
                }
              : null;

  // Yeni bir mesaj geldiğinde yalnızca kullanıcı zaten en alttaysa (ya da
  // yeni mesajı kendisi gönderdiyse) en alta kaydır — eski mesajları
  // incelerken gelen bir mesaj scroll konumunu zorla değiştirmesin.
  useEffect(() => {
    const last = messages[messages.length - 1];
    const isOwnMessage = Boolean(last && user && last.senderId === user.id) || pendingRef.current.length > 0;
    if (isNearBottomRef.current || isOwnMessage) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only reacts to the message/pending counts changing, reads the rest fresh via refs/closures
  }, [messages.length, pendingSends.length]);

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

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, MessageReactionEntry[]>();
    for (const row of reactionRows) {
      const entries = map.get(row.messageId) ?? [];
      entries.push({ userId: row.userId, emoji: row.emoji });
      map.set(row.messageId, entries);
    }
    return map;
  }, [reactionRows]);

  // Aşama 2's "tek emoji" kuralı: aynı emojiye tekrar basmak tepkiyi
  // kaldırır, farklı bir emoji seçmek eskisinin yerini alır — ikisi de
  // optimistik olarak uygulanıp başarısızlıkta geri alınıyor (Follow/
  // Like/Save provider'larından beri bu projenin standart deseni).
  async function handleReact(messageId: string, emoji: string) {
    if (!user || !id) return;
    const mine = reactionRows.find((r) => r.messageId === messageId && r.userId === user.id);
    if (mine && mine.emoji === emoji) {
      setReactionRows((prev) => removeReactionRow(prev, messageId, user.id));
      try {
        await removeMessageReaction(messageId, user.id);
      } catch (err) {
        console.error("removeMessageReaction", err);
        setReactionRows((prev) => upsertReaction(prev, mine));
      }
      return;
    }
    const previous = mine;
    setReactionRows((prev) => upsertReaction(prev, { messageId, userId: user.id, emoji }));
    try {
      await setMessageReaction(messageId, id, user.id, emoji);
    } catch (err) {
      console.error("setMessageReaction", err);
      setReactionRows((prev) => (previous ? upsertReaction(prev, previous) : removeReactionRow(prev, messageId, user.id)));
    }
  }

  function clearShareParams() {
    if (!id) return;
    router.replace(`/messages/local?id=${id}`);
  }

  // A generator's share line can't be sent until its real slug (for a
  // working link) has resolved — never send a message with a missing/
  // broken link just because the fetch above hasn't finished yet.
  const isGeneratorShareUnresolved =
    (pendingShare?.type === "generator" && !pendingShare.slug) || (pendingShare?.type === "workflow" && !pendingShare.resolved) ||
    (pendingShare?.type === "preset" && !pendingShare.resolved);

  /** The finished `body` for an outgoing message — generator/workflow/preset shares have no embed column (Bölüm 9.52), so they're composed into the text itself. */
  function composeOutgoingBody(trimmed: string): string | undefined {
    // A generator has no rich embed column in `messages` (only
    // shared_prompt_id/shared_request_id exist, Bölüm 9.8) — deliberately
    // not extended with a new column for the Unified Share System task
    // (its own hard rule: no new messaging table/column/architecture).
    // So sharing a generator reuses the exact same plain-text `body`
    // send path every other message already goes through, composed via
    // `composeGeneratorShareBody` (shared with `message-bubble.tsx`'s
    // matching parser, so a shared generator still renders as a real
    // card, Bölüm 9.52's follow-up fix) instead of a database-backed
    // shared-content card.
    return pendingShare?.type === "generator" && pendingShare.slug
      ? composeGeneratorShareBody(trimmed, pendingShare.title, pendingShare.slug)
      : pendingShare?.type === "workflow"
        ? composeWorkflowShareBody(trimmed, pendingShare.title, pendingShare.id)
        : pendingShare?.type === "preset"
          ? composePresetShareBody(trimmed, pendingShare.title, pendingShare.id)
          : trimmed || undefined;
  }

  function afterSuccessfulSend() {
    // Replying to a pending message request auto-accepts it (Bölüm 21 Faz B) — matches how most real messaging apps treat a reply as implicit acceptance.
    if (id && conversation?.myStatus === "pending") {
      setConversation((prev) => (prev ? { ...prev, myStatus: "accepted" } : prev));
      acceptRequest(id).catch((err) => console.error("acceptRequest (auto, on reply)", err));
    }
  }

  function patchPending(pendingId: string, patch: Partial<PendingSend>) {
    setPendingSends((prev) => prev.map((p) => (p.id === pendingId ? { ...p, ...patch } : p)));
  }

  function dropPending(pendingId: string, { revoke }: { revoke: boolean }) {
    const target = pendingRef.current.find((p) => p.id === pendingId);
    if (revoke && target) for (const image of target.images) URL.revokeObjectURL(image.previewUrl);
    setPendingSends((prev) => prev.filter((p) => p.id !== pendingId));
  }

  /**
   * Upload → insert for one photo message. Safe to call again for a failed
   * one: photos that already uploaded are reused (`uploaded`), and the
   * message keeps the same client-generated id, so a retry — or the Realtime
   * echo of an earlier attempt that actually went through — can never
   * produce a second copy.
   */
  async function runPendingSend(initial: PendingSend) {
    if (!id || !user) return;
    patchPending(initial.id, { status: "sending", error: null });
    const uploaded = [...initial.uploaded];
    try {
      for (let i = 0; i < initial.images.length; i += 1) {
        if (uploaded[i]) continue;
        const prepared = initial.images[i].prepared;
        if (!prepared) throw new Error(t("image.processFailed"));
        uploaded[i] = await uploadMessageImage(id, user.id, prepared);
        patchPending(initial.id, { uploaded: [...uploaded] });
      }
      const sent = await sendMessage(id, user.id, {
        id: initial.id,
        body: initial.body,
        attachments: uploaded.filter((a): a is MessageAttachment => Boolean(a)),
        sharedPromptId: initial.sharedPromptId,
        sharedRequestId: initial.sharedRequestId,
        replyToMessageId: initial.replyToMessageId,
      });
      setMessages((prev) => mergeIncomingMessage(prev, sent));
      dropPending(initial.id, { revoke: true });
      afterSuccessfulSend();
    } catch (err) {
      console.error("send photo message", err);
      const raw = err instanceof Error ? err.message : "";
      if (raw.toLowerCase().includes("duplicate key")) {
        // An earlier attempt did land — the message exists (Realtime/refetch shows it); nothing to retry.
        dropPending(initial.id, { revoke: true });
        if (user) fetchMessages(id, user.id).then(setMessages);
        return;
      }
      patchPending(initial.id, { status: "failed", error: raw ? translateSendError(raw) : t("messages.sendFailed") });
    }
  }

  function retryPending(pendingId: string) {
    const target = pendingRef.current.find((p) => p.id === pendingId);
    if (target && target.status === "failed") void runPendingSend(target);
  }

  async function discardPending(pendingId: string) {
    const target = pendingRef.current.find((p) => p.id === pendingId);
    dropPending(pendingId, { revoke: true });
    // Photos that already reached storage but will never be attached to a message.
    const orphaned = (target?.uploaded ?? []).filter((a): a is MessageAttachment => Boolean(a));
    if (orphaned.length > 0) await removeMessageImages(orphaned.map((a) => a.path));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    const stagedImages = composerImages.images.filter((image) => image.status === "ready");
    const hasPhotos = stagedImages.length > 0;
    if ((!trimmed && !pendingShare && !hasPhotos) || !id || !user || isSending || isGeneratorShareUnresolved || composerImages.isPreparing) return;

    if (hasPhotos) {
      // Optimistic: the composer empties and the message appears right away with its local previews; upload + insert run in the background.
      const pending: PendingSend = {
        id: crypto.randomUUID(),
        body: composeOutgoingBody(trimmed),
        sharedPromptId: pendingShare?.type === "prompt" ? pendingShare.id : undefined,
        sharedRequestId: pendingShare?.type === "request" ? pendingShare.id : undefined,
        replyToMessageId: replyingTo?.id,
        images: composerImages.take(),
        uploaded: stagedImages.map(() => null),
        status: "sending",
        error: null,
      };
      setPendingSends((prev) => [...prev, pending]);
      setDraft("");
      setReplyingTo(null);
      setSendError(null);
      if (pendingShare) {
        setDismissedShare(true);
        clearShareParams();
      }
      void runPendingSend(pending);
      return;
    }

    setIsSending(true);
    setSendError(null);
    try {
      const sent = await sendMessage(id, user.id, {
        body: composeOutgoingBody(trimmed),
        sharedPromptId: pendingShare?.type === "prompt" ? pendingShare.id : undefined,
        sharedRequestId: pendingShare?.type === "request" ? pendingShare.id : undefined,
        replyToMessageId: replyingTo?.id,
      });
      setMessages((prev) => mergeIncomingMessage(prev, sent));
      setDraft("");
      setReplyingTo(null);
      if (pendingShare) {
        setDismissedShare(true);
        clearShareParams();
      }
      afterSuccessfulSend();
    } catch (err) {
      setSendError(err instanceof Error ? translateSendError(err.message) : t("messages.sendFailed"));
    } finally {
      setIsSending(false);
    }
  }

  function handleBack() {
    // Tarayıcının kendi geri davranışıyla çakışmaması ve `/messages`'ın
    // scroll konumunu mümkün olduğunca korumak için (Aşama 7) `router.
    // back()` — düz bir `router.push("/messages")` her zaman sayfanın en
    // üstüne sıfırlar. Doğrudan bir bildirim/derin bağlantıyla buraya
    // gelinmiş olabilir (tarayıcı geçmişinde önceki sayfa hiç yok) — bu
    // durumda `back()`'in gidecek bir yeri olmaz, bu yüzden gerçek bir
    // geçmiş olup olmadığı kontrol ediliyor.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/messages");
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
    const target = messages.find((m) => m.id === messageId);
    const hasPhotos = (target?.attachments.length ?? 0) > 0;
    // A photo message may have its caption emptied; a text-only one may not (that would leave nothing).
    if (!user || (!editDraft.trim() && !hasPhotos)) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const updated = await editMessage(messageId, user.id, editDraft.trim(), hasPhotos);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t("messages.editFailed"));
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
        await deleteMessageForEveryone(messageId, user.id, messages.find((m) => m.id === messageId)?.attachments ?? []);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, body: null, sharedPromptId: null, sharedRequestId: null, attachments: [], deletedAt: new Date().toISOString() } : m,
          ),
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
        <h1 className="mb-2 text-h2 text-text">{t("auth.loginRequiredTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">
          {t("messages.loginRequiredToViewBody")}
        </p>
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text shadow-xs transition-colors hover:border-border-strong"
        >
          {t("common.login")}
        </Link>
      </div>
    );
  }

  if (!checked) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("common.loading")}</div>
    );
  }

  if (!conversation) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 text-text">{t("messages.conversationNotFoundTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">
          {t("messages.conversationNotFoundBody")}
        </p>
        <Link
          href="/messages"
          className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text shadow-xs transition-colors hover:border-border-strong"
        >
          {t("messages.backToMessages")}
        </Link>
      </div>
    );
  }

  const participant = conversation.participants[0];
  // A pending bubble is hidden the instant its real message is in the thread (the INSERT response or the Realtime echo, whichever lands first) — never both at once.
  const visiblePending = pendingSends.filter((p) => !messagesById.has(p.id));

  return (
    <div
      ref={panelRef}
      {...imageDrop.handlers}
      className="fixed inset-x-0 top-16 z-10 flex flex-col bg-background bottom-[calc(4rem+env(safe-area-inset-bottom))] md:static md:inset-auto md:z-auto md:h-full md:min-h-0 md:flex-1"
    >
      <div className="flex items-center gap-1 border-b border-border-soft bg-surface px-2 py-2 lg:px-4">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("messages.backToListAriaLabel")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text md:hidden"
        >
          <ArrowLeft size={20} />
        </button>
        <Link
          href={profileHref(participant)}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1 transition-colors duration-200 ease-soft hover:bg-surface-soft"
        >
          <Avatar src={participant.avatarUrl} alt={participant.displayName} size={36} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-text transition-colors group-hover:text-primary">{participant.displayName}</span>
            <span className="block truncate text-caption text-text-muted">@{participant.username}</span>
          </span>
        </Link>
        <ProfileMoreMenu user={participant} blockState={blockState} />
      </div>
      {conversation.myStatus === "pending" && (
        <div className="flex items-center justify-between gap-3 border-b border-primary/15 bg-primary-soft/50 px-4 py-2.5 lg:px-6">
          <p className="text-xs text-text">
            {t("messages.pendingRequestNotice", { name: participant?.displayName ?? "" })}
          </p>
          <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
            <button type="button" onClick={handleAcceptRequest} className="text-primary hover:underline">
              {t("messages.acceptAction")}
            </button>
            <button
              type="button"
              onClick={handleDeclineRequest}
              disabled={isDecliningRequest}
              className="text-danger hover:underline disabled:opacity-50"
            >
              {isDecliningRequest ? t("messages.deletingEllipsis") : t("common.delete")}
            </button>
          </div>
        </div>
      )}
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 lg:px-6"
        onScroll={handleListScroll}
        onClick={(event) => {
          // A tap on truly blank list space (not on any message's own
          // wrapper, which stops propagation via its own onClick) closes
          // whichever message currently has its icons revealed — Aşama 1's
          // "menü ve emoji seçici dışına dokunulduğunda kapansın", for the
          // "outside every bubble entirely" case.
          if (event.target === event.currentTarget) setActiveMessageId(null);
        }}
      >
        {messageHighlightNotFound && (
          <p className="mx-auto w-fit max-w-full rounded-full border border-border-soft bg-surface px-3.5 py-1.5 text-center text-xs text-text-muted shadow-xs">
            {t("messages.messageNotViewable")}
          </p>
        )}
        {messages.length === 0 && visiblePending.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            {t("messages.noMessagesYet")}
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
              isActive={activeMessageId === message.id}
              onActivate={setActiveMessageId}
              reactions={reactionsByMessage.get(message.id) ?? []}
              currentUserId={user.id}
              onReact={handleReact}
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
        {visiblePending.map((pending) => (
          <PendingMessageBubble key={pending.id} pending={pending} onRetry={retryPending} onDiscard={discardPending} />
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageComposer
        draft={draft}
        onDraftChange={setDraft}
        placeholder={pendingShare ? t("messages.addNotePlaceholder") : t("messages.writeMessagePlaceholder")}
        disabled={blockState.isBlocked}
        canSend={
          (Boolean(draft.trim()) || Boolean(pendingShare) || composerImages.images.length > 0) &&
          !isSending &&
          !composerImages.isPreparing &&
          !isGeneratorShareUnresolved
        }
        isSending={isSending}
        onSubmit={handleSubmit}
        images={composerImages.images}
        imageNotice={composerImages.notice}
        onAddFiles={composerImages.addFiles}
        onRemoveImage={composerImages.remove}
        onDismissNotice={composerImages.dismissNotice}
        error={sendError}
        dragActive={imageDrop.isDragging}
        banners={
          <>
    {blockState.isBlocked && (
      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
        <span>{t("messages.youBlockedCantSend")}</span>
        <button type="button" onClick={() => blockState.toggle()} className="font-medium hover:underline">
          {t("profile.unblock")}
        </button>
      </div>
    )}
    {replyingTo && (
      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border-soft bg-surface-soft px-3 py-1.5 text-xs text-text-muted">
        <span className="truncate">
          {t("messages.replyingToPrefix")} {replyingTo.body ?? (replyingTo.sharedPromptId ? t("messages.aPrompt") : replyingTo.attachments.length > 0 ? t("messages.aPhoto") : t("request.aRequest"))}
        </span>
        <button type="button" onClick={() => setReplyingTo(null)} aria-label={t("messages.cancelReplyAriaLabel")}>
          <X size={14} />
        </button>
      </div>
    )}
    {pendingShare && (
      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border-soft bg-surface-soft px-3 py-1.5 text-xs text-text-muted">
        <span className="truncate">
          {t("messages.sharingPrefix")} {pendingShare.title} — {t("messages.sharingSuffix")}
        </span>
        <button
          type="button"
          onClick={() => {
            setDismissedShare(true);
            clearShareParams();
          }}
          aria-label={t("messages.cancelShareAriaLabel")}
        >
          <X size={14} />
        </button>
      </div>
    )}
          </>
        }
      />
    </div>
  );
}
