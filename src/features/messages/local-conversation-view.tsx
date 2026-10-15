"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type UIEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bell, BellOff, ChevronsDown, Info, LogOut, Search, Users, X } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { useBlockState } from "@/features/moderation/use-block-state";
import { ProfileMoreMenu } from "@/features/profile/profile-more-menu";
import { ChatActionItems, ChatConfirmModal, type ChatConfirmKind } from "./chat-actions";
import { ChatHeaderMenu } from "@/features/groups/chat-header-menu";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { GroupInfoModal, type GroupInfoTab } from "@/features/groups/group-info-modal";
import { useGroupSenders } from "@/features/groups/use-group-senders";
import { moderateChatGroupMessage, setChatGroupMuted, toGroupError } from "@/lib/supabase/chat-groups";
import { canModerateMessage, canPostInGroup } from "@/lib/chat-groups";
import { advanceReadAt, canPinMessages, formatTypingText, nextReadAck, readStateFor } from "@/lib/chat-features";
import {
  fetchPartnerReadAt,
  fetchStarredMessageIds,
  markConversationReadUpTo,
  starMessage,
  toChatFeatureError,
  unstarMessage,
} from "@/lib/supabase/chat-features";
import { PinnedMessagesBar } from "./pinned-messages-bar";
import { ConversationSearchPanel } from "./conversation-search-panel";
import { MessageInfoModal } from "./message-info-modal";
import { usePinnedMessages } from "./use-pinned-messages";
import { useTyping } from "./use-typing";
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
  fetchMessagePage,
  fetchMessageWindow,
  hideMessageForMe,
  mapMessageRow,
  sendMessage,
  type MessageRow,
} from "@/lib/supabase/messages";
import { fetchReactionsForConversation, removeMessageReaction, setMessageReaction } from "@/lib/supabase/message-reactions";
import { mergeIncomingMessage, applyMessageUpdate, removeReactionRow, upsertReaction } from "./realtime-helpers";
import { computeKeyboardInset } from "./viewport-helpers";
import { supabase } from "@/lib/supabase/client";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { parseHighlightValue } from "@/lib/notification-utils";
import { cn, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { memberCountText } from "@/lib/group-labels";
import { translateForRuntime, type TranslationKey } from "@/lib/i18n/translations";
import { composeWorkflowShareBody } from "./workflow-share-format";
import { composePresetShareBody } from "./preset-share-format";
import { fetchPresetById } from "@/lib/supabase/presets";
import { useRealPresets } from "@/features/presets/real-presets-provider";
import { fetchWorkflowById } from "@/lib/supabase/workflows";
import { useRealWorkflows } from "@/features/workflows/real-workflows-provider";
import type { Conversation, Message, MessageAttachment, UserProfile } from "@/types";

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
function translateSendError(message: string, isGroup = false): string {
  if (message.toLowerCase().includes("row-level security")) {
    // Grupta RLS reddi "engellendin" demek değildir: üyelik bitmiş ya da "yalnızca yöneticiler yazar" ayarı olabilir.
    return translateForRuntime(isGroup ? "groups.chat.sendDenied" : "messages.blockedSendError");
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
 *
 */
export function LocalConversationView() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const shareParamPromptId = searchParams.get("sharePromptId");
  const shareParamRequestId = searchParams.get("shareRequestId");
  const shareParamWorkflowId = searchParams.get("shareWorkflowId");
  const shareParamPresetId = searchParams.get("sharePresetId");
  const { user } = useAuth();
  const {
    getCached,
    refresh,
    acceptRequest,
    declineRequest,
    archiveConversation,
    unarchiveConversation,
    deleteConversation,
    clearConversation,
    conversations,
    ready,
    patchConversation,
    removeConversation,
  } = useRealMessages();
  const { getCached: getCachedPrompt, fetchById: fetchPromptById } = useRealPrompts();
  const { getCached: getCachedRequest, fetchById: fetchRequestById } = useRealRequests();
  const { getCached: getCachedWorkflow } = useRealWorkflows();
  const { getCached: getCachedPreset } = useRealPresets();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Daha eski mesajlar var mı (sayfalı yükleme) ve yükleniyor mu.
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Grup sohbeti: bilgi penceresi (hangi sekmede açık), üyelik kaybı, devam eden eylem.
  const [groupInfoTab, setGroupInfoTab] = useState<GroupInfoTab | null>(null);
  const [leftGroup, setLeftGroup] = useState<"left" | "deleted" | "removed" | null>(null);
  const panelParamHandled = useRef(false);
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const composerImages = useComposerImages();
  // Photo messages that have left the composer but aren't real rows yet (uploading, or failed and awaiting a retry).
  const [pendingSends, setPendingSends] = useState<PendingSend[]>([]);
  const pendingRef = useRef<PendingSend[]>([]);

  const [fetchedShareTitle, setFetchedShareTitle] = useState<string | null>(null);
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
  // Sohbet menüsü eylemleri (docs/history/171-*): onay penceresi, devam eden işlem, hata ve geçici bildirim.
  const [confirmKind, setConfirmKind] = useState<ChatConfirmKind | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Sohbeti sil" başarıyla bitince sohbet bu kullanıcının listesinde yok; bu ekran dürüst bir sonuç gösterir.
  const [removedFromList, setRemovedFromList] = useState(false);
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
  // docs/history/174-*: birebirde karşı tarafın okundu imleci, yıldızlı mesaj kimlikleri, sohbet içi arama, mesaj bilgisi penceresi ve
  // "mesaja atla" durumu (hedef pencere yüklendiyse `hasNewer`: ötesinde daha yeni mesaj var, canlı mesajlar listeye eklenmez).
  const [partnerReadAt, setPartnerReadAt] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState<Message | null>(null);
  const [hasNewer, setHasNewer] = useState(false);
  const hasNewerRef = useRef(false);
  const [ackVersion, setAckVersion] = useState(0);
  const [jumpTarget, setJumpTarget] = useState<{ id: string; nonce: number } | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const lastAckedRef = useRef<string | null>(null);
  const ackInFlightRef = useRef(false);
  const skipAutoScrollRef = useRef(false);

  // Profil sayfasıyla BİREBİR AYNI engelleme mekanizması (Aşama 8's "profil
  // menüsüyle tutarlılık" — bu, `ProfileMoreMenu`'nün kendisini üst barda
  // yeniden kullanabilmek için de gerekli, aşağıdaki header'a bakınız).
  // `conversation` henüz yüklenmeden hook'lar koşulsuz çağrılmalı, bu
  // yüzden gerçek katılımcı gelene kadar zararsız bir placeholder hedef
  // kullanılıyor — `useBlockState`'in `canBlock`'u zaten oturum yokken
  // false, ve id boş olduğunda sorgu hiçbir şeye eşleşmiyor.
  const isGroup = conversation?.kind === "group";
  const group = conversation?.group ?? null;
  const blockState = useBlockState(conversation?.participants[0] ?? EMPTY_PARTICIPANT);
  // Grup: gönderen adları/avatarları + kadro rolleri; "kim yazabilir" ayarı.
  const canPost = !isGroup || (group ? canPostInGroup(group.myRole, group.postingPolicy) : false);
  // "Yazıyor…" (docs/history/174-*): Realtime Broadcast, kalıcı değil. Bekleyen istekte, engelliyken ya da yazamıyorsam sinyal GÖNDERMEM.
  const { typingIds, notifyTyping, stopTyping } = useTyping({
    conversationId: id,
    userId: user?.id ?? null,
    enabled: checked && Boolean(conversation) && !leftGroup && !removedFromList,
    canSend: canPost && !blockState.isBlocked && conversation?.myStatus !== "pending",
  });
  // Sabitleme: birebirde iki taraf da; grupta yetkiye/ayara göre (sunucu da denetler). Sabit mesajlar yalnız gerçek (yüklenmiş) sohbet için okunur.
  const canPin = canPinMessages(group) && conversation?.myStatus !== "pending";
  const pinned = usePinnedMessages(id, user?.id ?? null, messages, checked && Boolean(conversation) && !leftGroup && !removedFromList);
  // Mesajı yüklü olmayan ama adı gereken kişiler (yazıyor diyenler, arama sonucu / sabit mesaj göndericileri) için ek profil sorgusu.
  const [searchSenderIds, setSearchSenderIds] = useState<string[]>([]);
  const extraSenderIds = useMemo(
    () => [...new Set([...typingIds, ...searchSenderIds, ...pinned.items.map((item) => item.message.senderId)])],
    [typingIds, searchSenderIds, pinned.items],
  );
  const groupSenders = useGroupSenders(isGroup && id ? id : null, messages, group ? `${group.myRole}:${group.memberCount}` : "", extraSenderIds);
  // Desktop drag-and-drop of photos anywhere on the conversation panel.
  const imageDrop = useImageDrop(composerImages.addFiles, !blockState.isBlocked && canPost);

  const highlight = parseHighlightValue(searchParams.get("hl"));
  const highlightMessageId = highlight?.kind === "message" ? highlight.id : null;
  const [flashedMessageId, setFlashedMessageId] = useState<string | null>(null);
  const [messageHighlightNotFound, setMessageHighlightNotFound] = useState(false);
  const processedMessageHighlight = useRef<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const messagesById = new Map(messages.map((m) => [m.id, m]));

  useEffect(() => {
    isNearBottomRef.current = isNearBottom;
  }, [isNearBottom]);

  useEffect(() => {
    hasNewerRef.current = hasNewer;
  }, [hasNewer]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    pendingRef.current = pendingSends;
  }, [pendingSends]);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    },
    [],
  );

  function showToast(message: string) {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2600);
  }

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
    lastAckedRef.current = null;
    setHasNewer(false);
    setSearchOpen(false);
    setPartnerReadAt(null);
    setStarredIds(new Set());

    (cached ? Promise.resolve(cached) : fetchConversationForUser(id, user.id)).then(async (found) => {
      if (cancelled) return;
      setConversation(found);
      if (!found) {
        setChecked(true);
        return;
      }
      const [page, reactions, partnerRead, starred] = await Promise.all([
        fetchMessagePage(id, user.id),
        fetchReactionsForConversation(id),
        found.kind === "direct" ? fetchPartnerReadAt(id, user.id) : Promise.resolve(null),
        fetchStarredMessageIds(id),
      ]);
      if (cancelled) return;
      setMessages(page.messages);
      setHasOlder(page.hasMore);
      setReactionRows(reactions);
      setPartnerReadAt(partnerRead);
      setStarredIds(new Set(starred));
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
    // Yüklü sayfadaysa doğrudan, değilse (eski mesaj, yıldız/sabit/bildirim bağlantısı) çevresindeki pencere yüklenir;
    // görünmüyorsa (silinmiş, "benden sil", temizlenmiş, erişim yok) dürüst bir not gösterilir.
    void goToMessage(highlightMessageId).then((ok) => {
      if (!ok) setMessageHighlightNotFound(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goToMessage okuma anındaki durumdan beslenir; yalnız hedef değişince çalışmalı
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
          // Eski bir pencerede (mesaja atlandıktan sonra) gezilirken canlı mesaj araya eklenmez; "güncel mesajlara dön" hepsini getirir.
          if (hasNewerRef.current) return;
          setMessages((prev) => mergeIncomingMessage(prev, incoming));
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

  // Okundu imleci (docs/history/174-*): yalnız mesajlar GERÇEKTEN görüntülenirken (sekme görünür, listenin sonundayım, atlama penceresinde
  // değilim, istek kabul edilmiş) başkalarının en yeni mesajına kadar ilerletilir. Aynı mesaj için ikinci yazma yapılmaz
  // (`nextReadAck` son bildirilenden ileri değilse null verir); sunucu da imleç/sayaç değişmediyse yazmaz.
  useEffect(() => {
    if (!id || !user || !checked || !conversation || conversation.myStatus !== "accepted" || hasNewer || !isNearBottom) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const ack = nextReadAck(messages, user.id, lastAckedRef.current);
    if (!ack || ackInFlightRef.current) return;
    ackInFlightRef.current = true;
    void markConversationReadUpTo(id, ack).then((result) => {
      ackInFlightRef.current = false;
      if (result) {
        lastAckedRef.current = ack;
        setAckVersion((v) => v + 1);
      }
    });
  }, [id, user, checked, conversation, messages, hasNewer, isNearBottom, ackVersion]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") setAckVersion((v) => v + 1);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Birebir: karşı tarafın okundu imleci canlı izlenir (kendi üyelik satırı + karşı tarafın satırı yalnız bu iki kişiye görünür).
  const conversationKind = conversation?.kind;
  useEffect(() => {
    if (!id || !user || !checked || conversationKind !== "direct") return;
    const channel = supabase
      .channel(`read:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${id}` }, (payload) => {
        const row = payload.new as { user_id?: string; last_read_at?: string | null };
        if (!row.user_id || row.user_id === user.id) return;
        setPartnerReadAt((prev) => advanceReadAt(prev, row.last_read_at));
      })
      .subscribe();
    function refetchOnFocus() {
      if (document.visibilityState !== "visible") return;
      void fetchPartnerReadAt(id as string, user?.id ?? "").then((value) => setPartnerReadAt((prev) => advanceReadAt(prev, value)));
    }
    document.addEventListener("visibilitychange", refetchOnFocus);
    return () => {
      document.removeEventListener("visibilitychange", refetchOnFocus);
      void supabase.removeChannel(channel);
    };
  }, [id, user, checked, conversationKind]);

  // Mesaja atlama: hedef (yüklü ya da yeni yüklenen pencerede) görünür olunca ortalanır ve kısa süre vurgulanır.
  useEffect(() => {
    if (!jumpTarget) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-message-id="${jumpTarget.id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashedMessageId(jumpTarget.id);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashedMessageId(null), HIGHLIGHT_DURATION_MS);
  }, [jumpTarget]);

  // ---- Grup sohbeti ---------------------------------------------------------------------------------------------
  // Sunucudan taze grup satırı/rol: ayar kaydı, sayaç, rol değişimi sonrası ve Realtime olayında. Satır artık okunamıyorsa
  // (gruptan çıkarıldım / grup silindi) sohbet "artık üye değilsin" durumuna geçer.
  const reloadGroup = useCallback(async () => {
    if (!id || !user) return;
    const fresh = await fetchConversationForUser(id, user.id);
    if (fresh) {
      setConversation(fresh);
      void refresh();
    } else {
      setLeftGroup((prev) => prev ?? "removed");
    }
  }, [id, user, refresh]);

  useEffect(() => {
    if (!id || !user || !isGroup) return;
    const channel = supabase
      .channel(`chat_group:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_groups", filter: `id=eq.${id}` }, () => {
        void reloadGroup();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user, isGroup, reloadGroup]);

  // Sohbet listesi (kendi üyelik satırımdaki değişimlerle Realtime'dan yenilenir) bu grup için değiştiğinde açık sohbet de sunucudan
  // taze okunur. Liste yüklendikten sonra bu grup listede YOKSA (çıkarıldım / grup silindi) yine sunucuya sorulur — liste bayat olabilir.
  const cachedGroupSignature = (() => {
    const cached = conversations.find((c) => c.id === id);
    const g = cached?.group;
    return cached && g
      ? [g.name, g.description, g.avatarUrl, g.visibility, g.postingPolicy, g.memberLimit, g.memberCount, g.pendingRequestCount, g.myRole, cached.mutedAt, cached.archivedAt, cached.deletedAt].join("|")
      : null;
  })();
  useEffect(() => {
    if (!id || !user || !isGroup) return;
    if (!cachedGroupSignature && !ready) return;
    let cancelled = false;
    fetchConversationForUser(id, user.id).then((found) => {
      if (cancelled) return;
      if (found) setConversation(found);
      else setLeftGroup((prev) => prev ?? "removed");
    });
    return () => {
      cancelled = true;
    };
  }, [cachedGroupSignature, ready, id, user, isGroup]);

  // Bildirimden gelen `?panel=requests|members|invites|settings`: bilgi penceresini ilgili sekmede bir kez açar.
  useEffect(() => {
    if (!checked || !isGroup || panelParamHandled.current) return;
    const panel = searchParams.get("panel");
    if (panel === "requests" || panel === "members" || panel === "invites" || panel === "settings" || panel === "about") {
      panelParamHandled.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL'den gelen tek seferlik açılış; render sırasında türetilemez
      setGroupInfoTab(panel);
    }
  }, [checked, isGroup, searchParams]);

  // Resolves a `?sharePromptId=`/`?shareRequestId=`deep link into a real title for the composer banner — cache hit resolves synchronously via the derivation below; a miss falls back to a real fetch here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state for a new share deep link, not reacting to an external system
    setFetchedShareTitle(null);
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareParamPromptId, shareParamRequestId, shareParamWorkflowId, shareParamPresetId]);

  const pendingShare = dismissedShare
    ? null
    : shareParamPromptId
      ? { type: "prompt" as const, id: shareParamPromptId, title: getCachedPrompt(shareParamPromptId)?.title ?? fetchedShareTitle ?? t("common.loading") }
      : shareParamRequestId
        ? { type: "request" as const, id: shareParamRequestId, title: getCachedRequest(shareParamRequestId)?.title ?? fetchedShareTitle ?? t("common.loading") }
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
    // Bir mesaja atlama penceresi yüklendiğinde liste en alta değil hedefe kayar.
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
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

  // A workflow/preset share line can't be sent until the item it links to has resolved.
  const isShareUnresolved =
    (pendingShare?.type === "workflow" && !pendingShare.resolved) || (pendingShare?.type === "preset" && !pendingShare.resolved);

  /** The finished `body` for an outgoing message — workflow/preset shares have no embed column (Bölüm 9.52), so they're composed into the text itself. */
  function composeOutgoingBody(trimmed: string): string | undefined {
    return pendingShare?.type === "workflow"
      ? composeWorkflowShareBody(trimmed, pendingShare.title, pendingShare.id)
      : pendingShare?.type === "preset"
        ? composePresetShareBody(trimmed, pendingShare.title, pendingShare.id)
        : trimmed || undefined;
  }

  function afterSuccessfulSend() {
    stopTyping();
    // Atlama penceresindeyken gönderilen mesaj en yeni sayfada görünsün.
    if (hasNewerRef.current) void returnToLatest();
    // A new message brings an archived / deleted chat back to the inbox (server trigger); mirror it here and resync the list.
    if (conversation?.archivedAt || conversation?.deletedAt) {
      setConversation((prev) => (prev ? { ...prev, archivedAt: null, deletedAt: null } : prev));
      void refresh();
    }
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
        if (user) fetchMessagePage(id, user.id).then((page) => setMessages(page.messages));
        return;
      }
      patchPending(initial.id, { status: "failed", error: raw ? translateSendError(raw, isGroup) : t("messages.sendFailed") });
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
    if ((!trimmed && !pendingShare && !hasPhotos) || !id || !user || isSending || isShareUnresolved || composerImages.isPreparing) return;

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
      setSendError(err instanceof Error ? translateSendError(err.message, isGroup) : t("messages.sendFailed"));
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

  /**
   * Chat-menu actions. The backend is asked FIRST; local state and the toast
   * change only on a confirmed success, a failure leaves everything as it was
   * and shows the error (in the confirm dialog when there is one).
   */
  async function runChatAction(action: "archive" | "unarchive" | ChatConfirmKind) {
    if (!id || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (action === "archive") {
        await archiveConversation(id);
        setConversation((prev) => (prev ? { ...prev, archivedAt: new Date().toISOString() } : prev));
        showToast(t("messages.archivedToast"));
      } else if (action === "unarchive") {
        await unarchiveConversation(id);
        setConversation((prev) => (prev ? { ...prev, archivedAt: null } : prev));
        showToast(t("messages.unarchivedToast"));
      } else if (action === "clear") {
        await clearConversation(id);
        setMessages([]);
        setReactionRows([]);
        setConfirmKind(null);
        showToast(t("messages.clearedToast"));
      } else {
        await deleteConversation(id);
        setConfirmKind(null);
        setRemovedFromList(true);
      }
    } catch (err) {
      console.error("chat action", action, err);
      setActionError(t("messages.stateUpdateFailed"));
      if (action === "archive" || action === "unarchive") showToast(t("messages.stateUpdateFailed"));
    } finally {
      setActionBusy(false);
    }
  }

  async function toggleGroupMute() {
    if (!id || !user || !conversation || actionBusy) return;
    const muting = !conversation.mutedAt;
    setActionBusy(true);
    try {
      const mutedAt = await setChatGroupMuted(id, user.id, muting);
      setConversation((prev) => (prev ? { ...prev, mutedAt } : prev));
      patchConversation(id, { mutedAt });
      showToast(muting ? t("groups.about.mutedToast") : t("groups.about.unmutedToast"));
    } catch (err) {
      console.error("setChatGroupMuted", err);
      showToast(toGroupError(err instanceof Error ? err : null).message);
    } finally {
      setActionBusy(false);
    }
  }

  function handleGroupGone(reason: "left" | "deleted") {
    if (id) removeConversation(id);
    setGroupInfoTab(null);
    setLeftGroup(reason);
  }

  async function loadOlderMessages() {
    if (!id || !user || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const el = listRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    try {
      const page = await fetchMessagePage(id, user.id, { before: messages[0].createdAt });
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...page.messages.filter((m) => !known.has(m.id)), ...prev];
      });
      setHasOlder(page.hasMore);
      // Eski mesajlar üste eklenince okunan yer kaymasın.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - previousHeight;
      });
    } catch (err) {
      console.error("loadOlderMessages", err);
      showToast(t("common.actionFailedRetry"));
    } finally {
      setLoadingOlder(false);
    }
  }

  /** Bir mesaja git: yüklüyse doğrudan, değilse çevresindeki pencere yüklenir. Mesaj bu kullanıcı için görünmüyorsa false (içerik gösterilmez). */
  async function goToMessage(messageId: string): Promise<boolean> {
    if (!id || !user) return false;
    if (messagesRef.current.some((m) => m.id === messageId)) {
      setJumpTarget({ id: messageId, nonce: Date.now() });
      return true;
    }
    const win = await fetchMessageWindow(id, user.id, messageId);
    if (!win) return false;
    skipAutoScrollRef.current = true;
    setMessages(win.messages);
    setHasOlder(win.hasOlder);
    setHasNewer(win.hasNewer);
    setJumpTarget({ id: messageId, nonce: Date.now() });
    return true;
  }

  async function jumpWithFeedback(messageId: string) {
    const ok = await goToMessage(messageId);
    if (!ok) showToast(t("chat.jump.failed"));
  }

  /** "Güncel mesajlara dön": atlama penceresinden çıkıp en yeni sayfayı yükler. */
  async function returnToLatest() {
    if (!id || !user) return;
    try {
      const page = await fetchMessagePage(id, user.id);
      setMessages(page.messages);
      setHasOlder(page.hasMore);
      setHasNewer(false);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    } catch (err) {
      console.error("returnToLatest", err);
      showToast(t("common.actionFailedRetry"));
    }
  }

  async function toggleStar(message: Message) {
    if (!user) return;
    const wasStarred = starredIds.has(message.id);
    const apply = (starred: boolean) =>
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (starred) next.add(message.id);
        else next.delete(message.id);
        return next;
      });
    apply(!wasStarred);
    try {
      if (wasStarred) await unstarMessage(user.id, message.id);
      else await starMessage(user.id, message.id);
      showToast(wasStarred ? t("chat.star.unstarredToast") : t("chat.star.starredToast"));
    } catch (err) {
      console.error("toggleStar", err);
      apply(wasStarred);
      showToast(toChatFeatureError(err instanceof Error ? err : null).message);
    }
  }

  async function setPinState(message: Message, pin: boolean) {
    try {
      await pinned.setPinned(message, pin);
      showToast(pin ? t("chat.pin.pinnedToast") : t("chat.pin.unpinnedToast"));
    } catch (err) {
      console.error("setPinState", err);
      showToast(toChatFeatureError(err instanceof Error ? err : null).message);
    }
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.body ?? "");
      showToast(t("common.copied"));
    } catch (err) {
      console.error("copyMessage", err);
      showToast(t("common.actionFailedRetry"));
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
      if (mode === "moderator") {
        await moderateChatGroupMessage(messageId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, body: null, sharedPromptId: null, sharedRequestId: null, attachments: [], deletedAt: new Date().toISOString() } : m,
          ),
        );
      } else if (mode === "everyone") {
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
      if (mode === "moderator") showToast(toGroupError(err instanceof Error ? err : null).message);
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

  if (removedFromList) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p role="status" className="mb-4 text-sm text-text-secondary">
          {t("messages.deletedChatToast")}
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

  if (leftGroup) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 text-text">
          {leftGroup === "left" ? t("groups.chat.leftTitle") : leftGroup === "deleted" ? t("groups.chat.deletedTitle") : t("groups.chat.removedTitle")}
        </h1>
        <p className="mb-4 text-sm text-text-muted">
          {leftGroup === "left" ? t("groups.chat.leftBody") : leftGroup === "deleted" ? t("groups.chat.deletedBody") : t("groups.chat.removedBody")}
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
  const senderLabel = (senderId: string): string =>
    senderId === user.id
      ? t("chat.starred.you")
      : isGroup
        ? (groupSenders.senderFor(senderId)?.displayName ?? t("chat.starred.unknownUser"))
        : (participant?.displayName ?? t("chat.starred.unknownUser"));
  // "Yazıyor…" metni: grupta adlar üyelik/profil verisinden çözülür (çözülemeyen kişi adlandırılmaz, sayılır); engellediğim kişinin göstergesi gizlenir.
  const typingNames = isGroup ? typingIds.map((uid) => groupSenders.senderFor(uid)?.displayName).filter((name): name is string => Boolean(name)) : [];
  const typingText =
    blockState.isBlocked || typingIds.length === 0
      ? ""
      : formatTypingText(typingNames, typingIds.length - typingNames.length, isGroup, (key, params) => t(key as TranslationKey, params));
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
        {group ? (
          <button
            type="button"
            onClick={() => setGroupInfoTab("about")}
            aria-haspopup="dialog"
            aria-label={t("groups.chat.openInfoAria", { name: group.name })}
            className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors duration-200 ease-soft hover:bg-surface-soft"
          >
            <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={36} badge />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-text transition-colors group-hover:text-primary">{group.name}</span>
              {typingText ? (
                <span data-typing-indicator role="status" className="block truncate text-caption font-medium text-primary">
                  {typingText}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 truncate text-caption text-text-muted">
                  <Users size={11} aria-hidden /> {memberCountText(t, group.memberCount)}
                  {conversation.mutedAt && <BellOff size={11} aria-label={t("groups.about.muteLabel")} />}
                </span>
              )}
            </span>
          </button>
        ) : (
          <Link
            href={profileHref(participant)}
            className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1 transition-colors duration-200 ease-soft hover:bg-surface-soft"
          >
            <Avatar src={participant.avatarUrl} alt={participant.displayName} size={36} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-text transition-colors group-hover:text-primary">{participant.displayName}</span>
              {typingText ? (
                <span data-typing-indicator role="status" className="block truncate text-caption font-medium text-primary">
                  {typingText}
                </span>
              ) : (
                <span className="block truncate text-caption text-text-muted">@{participant.username}</span>
              )}
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setSearchOpen((open) => !open)}
          aria-label={t("chat.search.open")}
          title={t("chat.search.open")}
          aria-pressed={searchOpen}
          data-chat-search-toggle
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-transparent text-text-muted transition-colors hover:bg-surface-soft hover:text-text",
            searchOpen && "bg-primary-soft text-primary",
          )}
        >
          <Search size={16} />
        </button>
        {group ? (
          <ChatHeaderMenu>
            {(close) => (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    setGroupInfoTab("about");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text hover:bg-surface-soft"
                >
                  <Info size={14} /> {t("groups.chat.info")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={actionBusy}
                  onClick={() => {
                    close();
                    void toggleGroupMute();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text hover:bg-surface-soft disabled:opacity-50"
                >
                  {conversation.mutedAt ? <Bell size={14} /> : <BellOff size={14} />}
                  {conversation.mutedAt ? t("groups.chat.unmute") : t("groups.chat.mute")}
                </button>
                <ChatActionItems
                  conversation={conversation}
                  busy={actionBusy}
                  close={close}
                  onToggleArchive={() => void runChatAction(conversation.archivedAt ? "unarchive" : "archive")}
                  onAsk={(kind) => {
                    setActionError(null);
                    setConfirmKind(kind);
                  }}
                />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    setGroupInfoTab("about");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-danger hover:bg-surface-soft"
                >
                  <LogOut size={14} /> {t("groups.about.leave")}
                </button>
              </>
            )}
          </ChatHeaderMenu>
        ) : (
        <ProfileMoreMenu
          user={participant}
          blockState={blockState}
          extraItems={
            conversation.myStatus === "accepted"
              ? (close) => (
                  <ChatActionItems
                    conversation={conversation}
                    busy={actionBusy}
                    close={close}
                    onToggleArchive={() => void runChatAction(conversation.archivedAt ? "unarchive" : "archive")}
                    onAsk={(kind) => {
                      setActionError(null);
                      setConfirmKind(kind);
                    }}
                  />
                )
              : undefined
          }
        />
        )}
      </div>
      {searchOpen && (
        <ConversationSearchPanel
          conversationId={conversation.id}
          senderLabel={senderLabel}
          onSenderIds={setSearchSenderIds}
          onJump={(hit) => void jumpWithFeedback(hit.id)}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <PinnedMessagesBar
        items={pinned.items}
        canPin={canPin}
        senderLabel={senderLabel}
        onJump={(message) => void jumpWithFeedback(message.id)}
        onUnpin={(message) => void setPinState(message, false)}
      />
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
        ref={listRef}
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
        {hasOlder && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void loadOlderMessages()}
              disabled={loadingOlder}
              className="rounded-full border border-border-soft bg-surface px-3.5 py-1.5 text-xs font-medium text-text-secondary shadow-xs transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
            >
              {loadingOlder ? t("common.loadingMore") : t("groups.chat.loadOlder")}
            </button>
          </div>
        )}
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
              sender={isGroup ? groupSenders.senderFor(message.senderId) : undefined}
              readState={!isGroup && message.senderId === user.id ? readStateFor(message.createdAt, partnerReadAt) : null}
              actions={{
                isStarred: (messageId) => starredIds.has(messageId),
                onToggleStar: toggleStar,
                canPin,
                isPinned: (messageId) => pinned.pinnedIds.has(messageId),
                onTogglePin: (target) => void setPinState(target, !pinned.pinnedIds.has(target.id)),
                onCopy: copyMessage,
                onShowInfo: isGroup ? setInfoMessage : undefined,
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
                canModerate: group
                  ? (target) => target.senderId !== user.id && !target.deletedAt && canModerateMessage(group.myRole, groupSenders.roleFor(target.senderId), group.rolePermissions)
                  : undefined,
              }}
            />
          ))
        )}
        {visiblePending.map((pending) => (
          <PendingMessageBubble key={pending.id} pending={pending} onRetry={retryPending} onDiscard={discardPending} />
        ))}
        {hasNewer && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void returnToLatest()}
              className="rounded-full border border-border-soft bg-surface px-3.5 py-1.5 text-xs font-medium text-primary shadow-xs transition-colors hover:border-border-strong"
            >
              {t("chat.jump.latest")}
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {hasNewer && (
        <button
          type="button"
          data-jump-latest
          onClick={() => void returnToLatest()}
          aria-label={t("chat.jump.latest")}
          title={t("chat.jump.latest")}
          className="absolute bottom-24 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border-soft bg-surface text-primary shadow-card transition-colors hover:border-border-strong"
        >
          <ChevronsDown size={18} />
        </button>
      )}
      {confirmKind && (
        <ChatConfirmModal
          kind={confirmKind}
          isGroup={isGroup}
          busy={actionBusy}
          error={actionError}
          onConfirm={() => void runChatAction(confirmKind)}
          onCancel={() => {
            setConfirmKind(null);
            setActionError(null);
          }}
        />
      )}
      {toast && (
        <Portal>
          <div
            role="status"
            className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6"
          >
            <div className="animate-pop-in rounded-md bg-text px-3.5 py-2 text-small text-background shadow-pop">{toast}</div>
          </div>
        </Portal>
      )}
      <MessageComposer
        draft={draft}
        onDraftChange={(value) => {
          setDraft(value);
          if (value.trim()) notifyTyping();
          else stopTyping();
        }}
        placeholder={pendingShare ? t("messages.addNotePlaceholder") : t("messages.writeMessagePlaceholder")}
        disabled={blockState.isBlocked || !canPost}
        canSend={
          (Boolean(draft.trim()) || Boolean(pendingShare) || composerImages.images.length > 0) &&
          !isSending &&
          !composerImages.isPreparing &&
          !isShareUnresolved
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
    {isGroup && !canPost && (
      <div role="status" className="mb-2 rounded-lg bg-surface-soft px-3 py-1.5 text-xs text-text-muted">
        {t("groups.chat.adminsOnly")}
      </div>
    )}
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
      {infoMessage && <MessageInfoModal message={infoMessage} onClose={() => setInfoMessage(null)} />}
      {groupInfoTab && isGroup && (
        <GroupInfoModal
          conversation={conversation}
          initialTab={groupInfoTab}
          onClose={() => setGroupInfoTab(null)}
          onGroupChanged={reloadGroup}
          onMutedChange={(mutedAt) => {
            setConversation((prev) => (prev ? { ...prev, mutedAt } : prev));
            if (id) patchConversation(id, { mutedAt });
          }}
          onGone={handleGroupGone}
        />
      )}
    </div>
  );
}
