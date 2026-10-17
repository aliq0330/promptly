"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchChatGroupRow, mapChatGroupRow } from "@/lib/supabase/chat-groups";
import { cardToChatGroup, fetchCommunityCard, fetchMyCommunityMembership, type MyCommunityMembership } from "@/lib/supabase/communities";
import { supabase } from "@/lib/supabase/client";
import type { ChatGroup } from "@/types";

export interface CommunityGate {
  invitationId: string | null;
  inviterName: string | null;
  requestId: string | null;
}

export type CommunityState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "notfound" }
  | { status: "ready"; group: ChatGroup; membership: MyCommunityMembership | null; gate: CommunityGate; limited: boolean };

/** Sekme tekrar görünür olunca, son okumadan bu kadar süre geçtiyse sessizce yeniden okunur (üyelik/görünürlük değişimi anında yansısın). */
const REFRESH_AFTER_HIDDEN_MS = 20 * 1000;

/**
 * Topluluk sayfasının veri kaynağı (docs/history/177-*):
 *   • ÜYE → `chat_groups` TAM satırı (yalnız üye okuyabilir) + kendi üyelik satırı (rol, bildirim tercihi, kural kabulü);
 *   • ÜYE DEĞİL (ziyaretçi, yabancı, davetli, başvuran) → `community_cards` KARTI (yönetim alanları yok) + bekleyen davet/başvurum.
 * Kart yoksa (tamamen kapalı / olmayan / yasaklı) → "bulunamadı": varlık sızmaz. `userId` boşsa ziyaretçi modudur: yalnız kart.
 * `reload()` sayaç/ayar/rol değişince sessizce yeniden okur (yükleniyor ekranına dönmeden); Realtime olayında ve sekme yeniden görünür
 * olunca da kendiliğinden yenilenir — çıkarılan/yasaklanan kişi ya da görünürlüğü değişen topluluk bayat bir ekranda kalmaz.
 */
export function useCommunity(id: string | null, userId: string | null): { state: CommunityState; reload: () => Promise<void> } {
  const [state, setState] = useState<CommunityState>({ status: "loading" });
  const lastLoadedAt = useRef(0);

  const load = useCallback(async (): Promise<CommunityState> => {
    if (!id) return { status: "notfound" };
    try {
      const row = userId ? await fetchChatGroupRow(id) : null;
      const membership = row && userId ? await fetchMyCommunityMembership(id, userId) : null;
      if (row && membership) {
        return { status: "ready", group: mapChatGroupRow(row, membership.role), membership, gate: { invitationId: null, inviterName: null, requestId: null }, limited: false };
      }
      const card = await fetchCommunityCard(id);
      if (!card) return { status: "notfound" };
      let gate: CommunityGate = { invitationId: null, inviterName: null, requestId: null };
      if (userId) {
        const [invitation, request] = await Promise.all([
          supabase
            .from("chat_group_invitations")
            .select("id, inviter:inviter_id ( display_name )")
            .eq("group_id", id)
            .eq("invitee_id", userId)
            .eq("status", "pending")
            .gt("expires_at", new Date().toISOString())
            .maybeSingle(),
          supabase.from("chat_group_join_requests").select("id").eq("group_id", id).eq("user_id", userId).eq("status", "pending").maybeSingle(),
        ]);
        const inv = invitation.data as { id: string; inviter: { display_name: string } | null } | null;
        gate = { invitationId: inv?.id ?? null, inviterName: inv?.inviter?.display_name ?? null, requestId: (request.data as { id: string } | null)?.id ?? null };
      }
      return { status: "ready", group: cardToChatGroup(card), membership: null, gate, limited: true };
    } catch (err) {
      console.error("useCommunity", err);
      return { status: "error" };
    }
  }, [id, userId]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kimlik değişince yükleniyor durumuna dönmek gerekir
    setState({ status: "loading" });
    load().then((next) => {
      if (!cancelled) {
        lastLoadedAt.current = Date.now();
        setState(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const reload = useCallback(async () => {
    const next = await load();
    lastLoadedAt.current = Date.now();
    setState(next);
  }, [load]);

  // Canlı eşitleme: topluluk satırı (bekleyen istek / üye sayısı / ayarlar) ya da kendi üyelik satırım (rol, çıkarılma) değişince sessizce yenilenir.
  // Böylece başka bir yönetici isteği işleyince ya da rolüm değişince sayfa bayat kalmaz. Üye olmayan satırı okuyamadığından olay almaz (zararsız).
  // Olay yağmuru tek yeniden okumaya indirgenir.
  useEffect(() => {
    if (!id || !userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reload(), 400);
    };
    const channel = supabase
      .channel(`community:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_groups", filter: `id=eq.${id}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${id}` }, schedule)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [id, userId, reload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoadedAt.current > REFRESH_AFTER_HIDDEN_MS) void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { state, reload };
}
