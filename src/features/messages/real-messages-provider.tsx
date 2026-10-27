"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  acceptMessageRequest,
  clearConversationHistory,
  declineMessageRequest,
  deleteConversationFromMyList,
  fetchConversationsForUser,
  getOrCreateDirectConversation,
  restoreConversationToList,
  setConversationArchived,
} from "@/lib/supabase/messages";
import { supabase } from "@/lib/supabase/client";
import { translateForRuntime } from "@/lib/i18n/translations";
import type { Conversation, UserProfile } from "@/types";

interface RealMessagesContextValue {
  /** Every membership row of the viewer, including archived ones and ones deleted from their list — derive visible lists with `bucketConversations`. */
  conversations: Conversation[];
  /** İlk liste yüklemesi bitti mi (yüklenmeden "bu sohbet yok" sonucu çıkarılmasın — ör. gruptan atılma tespiti). */
  ready: boolean;
  getCached: (id: string) => Conversation | undefined;
  /** Yerel listede bir konuşmanın kişisel/grup alanlarını günceller (sessize alma, grup ayarı, rol…); sunucu yazımından SONRA çağrılır. */
  patchConversation: (conversationId: string, patch: Partial<Conversation>) => void;
  /** Bir konuşmayı yerel listeden çıkarır (gruptan ayrıldı / grup silindi). */
  removeConversation: (conversationId: string) => void;
  refresh: () => Promise<void>;
  startConversationWith: (otherProfile: UserProfile) => Promise<Conversation>;
  /** Accepts a pending message request (Bölüm 21 Faz B) — also called automatically after the recipient's first reply. */
  acceptRequest: (conversationId: string) => Promise<void>;
  /** Declines a pending message request by leaving it — removes it from this list entirely. */
  declineRequest: (conversationId: string) => Promise<void>;
  /**
   * Chat-menu actions (docs/history/171-*). Each writes only the viewer's own
   * membership row, and updates local state only AFTER the backend confirmed —
   * a rejected promise means nothing changed, so callers show an error, never a success.
   */
  archiveConversation: (conversationId: string) => Promise<void>;
  unarchiveConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  clearConversation: (conversationId: string) => Promise<void>;
  /** Listemden kaldırılmış / arşivlenmiş sohbeti listeye geri koyar (örn. "Gruplarım"daki gizli grup). */
  restoreConversation: (conversationId: string) => Promise<void>;
}

const RealMessagesContext = createContext<RealMessagesContextValue | null>(null);

/**
 * Real, cross-user, cross-device direct messages — the same shape as
 * RealPromptsProvider/RealRequestsProvider, backed by the actual Supabase
 * `conversations`/`conversation_members`/`messages` tables. Only ever
 * holds a signed-in user's own conversations.
 */
/** Grup sohbetlerinin listede yenilenme aralığı (görünürken). */
const GROUP_REFRESH_MS = 120_000;

export function RealMessagesProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- signed out, no real conversations to fetch
      setConversations([]);
      setReady(false);
      return;
    }
    fetchConversationsForUser(user.id).then((result) => {
      if (cancelled) return;
      setConversations(result);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const result = await fetchConversationsForUser(user.id);
    setConversations(result);
  }, [user]);

  // Gerçek zamanlı senkronizasyon (Bölüm 21 Faz C) — bir mesaj gelince
  // `handle_new_message` (Bölüm 18) bu kullanıcının `conversation_members`
  // satırındaki `unread_count`'u zaten günceller; buradaki abonelik yalnızca
  // o güncellemeyi header'ın okunmamış noktasına ve `/messages` listesinin
  // önizleme/sıralamasına canlı yansıtıyor. Tek bir kaynaktan (kendi
  // `conversation_members` satırlarım) gelen HER olayda tüm listeyi yeniden
  // çekmek — INSERT (yeni bir konuşmaya eklendim), UPDATE (unread_count/
  // status değişti), DELETE (bir konuşmadan ayrıldım) — burada gerçek
  // içerik hacmiyle (birkaç konuşma) performans sorunu yaratmayacak kadar
  // basit; `messages` tablosuna ayrıca abone olmaya gerek yok.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`conversation-members:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_members", filter: `user_id=eq.${user.id}` },
        () => {
          fetchConversationsForUser(user.id).then(setConversations);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Grup/topluluk sohbetlerinde yeni mesaj artık üyelerin satırını güncellemez (docs/history/258-*: 100 000 üyeli toplulukta mesaj başına 100 000 güncelleme
  // olurdu) — yukarıdaki abonelik yalnız birebir sohbetleri canlı tutar. Gruplar sekme tekrar görününce ve görünürken seyrek aralıkla yenilenir.
  const hasGroups = conversations.some((c) => c.kind === "group");
  useEffect(() => {
    if (!user || !hasGroups) return;
    const reload = () => {
      if (document.visibilityState === "visible") fetchConversationsForUser(user.id).then(setConversations);
    };
    const timer = setInterval(reload, GROUP_REFRESH_MS);
    document.addEventListener("visibilitychange", reload);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [user, hasGroups]);

  const getCached = useCallback(
    (id: string) => conversations.find((conversation) => conversation.id === id),
    [conversations],
  );

  const startConversationWith = useCallback(
    async (otherProfile: UserProfile) => {
      if (!user) throw new Error(t("messages.loginRequiredToSend"));
      const conversation = await getOrCreateDirectConversation(user.id, otherProfile.id, otherProfile);
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversation.id);
        const next = exists ? prev.map((c) => (c.id === conversation.id ? conversation : c)) : [conversation, ...prev];
        return [...next].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      });
      return conversation;
    },
    [user, t],
  );

  const acceptRequest = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, myStatus: "accepted" } : c)),
      );
      await acceptMessageRequest(conversationId, user.id);
    },
    [user],
  );

  const declineRequest = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      await declineMessageRequest(conversationId, user.id);
    },
    [user],
  );

  const patchConversation = useCallback((conversationId: string, patch: Partial<Conversation>) => {
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, ...patch } : c)));
  }, []);

  const removeConversation = useCallback((conversationId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
  }, []);

  const archiveConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      const archivedAt = await setConversationArchived(conversationId, user.id, true);
      patchConversation(conversationId, { archivedAt });
    },
    [user, patchConversation],
  );

  const unarchiveConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      await setConversationArchived(conversationId, user.id, false);
      patchConversation(conversationId, { archivedAt: null });
    },
    [user, patchConversation],
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      const { deletedAt, clearedAt } = await deleteConversationFromMyList(conversationId, user.id);
      patchConversation(conversationId, {
        deletedAt,
        archivedAt: null,
        unreadCount: 0,
        lastMessage: translateForRuntime("messages.noMessagesYetShort"),
        ...(clearedAt ? { clearedAt } : {}),
      });
    },
    [user, patchConversation],
  );

  const clearConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      const clearedAt = await clearConversationHistory(conversationId, user.id);
      if (clearedAt) {
        patchConversation(conversationId, { clearedAt, unreadCount: 0, lastMessage: translateForRuntime("messages.noMessagesYetShort") });
      }
    },
    [user, patchConversation],
  );

  const restoreConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      await restoreConversationToList(conversationId, user.id);
      patchConversation(conversationId, { deletedAt: null, archivedAt: null });
    },
    [user, patchConversation],
  );

  const value = useMemo(
    () => ({
      conversations,
      ready,
      getCached,
      patchConversation,
      removeConversation,
      refresh,
      startConversationWith,
      acceptRequest,
      declineRequest,
      archiveConversation,
      unarchiveConversation,
      deleteConversation,
      clearConversation,
      restoreConversation,
    }),
    [
      conversations,
      ready,
      getCached,
      patchConversation,
      removeConversation,
      refresh,
      startConversationWith,
      acceptRequest,
      declineRequest,
      archiveConversation,
      unarchiveConversation,
      deleteConversation,
      clearConversation,
      restoreConversation,
    ],
  );

  return <RealMessagesContext.Provider value={value}>{children}</RealMessagesContext.Provider>;
}

export function useRealMessages() {
  const ctx = useContext(RealMessagesContext);
  if (!ctx) throw new Error("useRealMessages must be used within a RealMessagesProvider");
  return ctx;
}
