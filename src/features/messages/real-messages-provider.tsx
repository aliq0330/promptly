"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  acceptMessageRequest,
  declineMessageRequest,
  fetchConversationsForUser,
  getOrCreateDirectConversation,
} from "@/lib/supabase/messages";
import type { Conversation, UserProfile } from "@/types";

interface RealMessagesContextValue {
  conversations: Conversation[];
  getCached: (id: string) => Conversation | undefined;
  refresh: () => Promise<void>;
  startConversationWith: (otherProfile: UserProfile) => Promise<Conversation>;
  /** Accepts a pending message request (Bölüm 21 Faz B) — also called automatically after the recipient's first reply. */
  acceptRequest: (conversationId: string) => Promise<void>;
  /** Declines a pending message request by leaving it — removes it from this list entirely. */
  declineRequest: (conversationId: string) => Promise<void>;
}

const RealMessagesContext = createContext<RealMessagesContextValue | null>(null);

/**
 * Real, cross-user, cross-device direct messages — the same shape as
 * RealPromptsProvider/RealRequestsProvider, backed by the actual Supabase
 * `conversations`/`conversation_members`/`messages` tables. Only ever
 * holds a signed-in user's own conversations.
 */
export function RealMessagesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- signed out, no real conversations to fetch
      setConversations([]);
      return;
    }
    fetchConversationsForUser(user.id).then((result) => {
      if (!cancelled) setConversations(result);
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

  const getCached = useCallback(
    (id: string) => conversations.find((conversation) => conversation.id === id),
    [conversations],
  );

  const startConversationWith = useCallback(
    async (otherProfile: UserProfile) => {
      if (!user) throw new Error("Giriş yapmadan mesaj gönderilemez.");
      const conversation = await getOrCreateDirectConversation(user.id, otherProfile.id, otherProfile);
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversation.id);
        const next = exists ? prev.map((c) => (c.id === conversation.id ? conversation : c)) : [conversation, ...prev];
        return [...next].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      });
      return conversation;
    },
    [user],
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

  const value = useMemo(
    () => ({ conversations, getCached, refresh, startConversationWith, acceptRequest, declineRequest }),
    [conversations, getCached, refresh, startConversationWith, acceptRequest, declineRequest],
  );

  return <RealMessagesContext.Provider value={value}>{children}</RealMessagesContext.Provider>;
}

export function useRealMessages() {
  const ctx = useContext(RealMessagesContext);
  if (!ctx) throw new Error("useRealMessages must be used within a RealMessagesProvider");
  return ctx;
}
