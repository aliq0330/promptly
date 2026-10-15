"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchChatGroupRow, mapChatGroupRow } from "@/lib/supabase/chat-groups";
import { fetchMyCommunityMembership, type MyCommunityMembership } from "@/lib/supabase/communities";
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
  | { status: "ready"; group: ChatGroup; membership: MyCommunityMembership | null; gate: CommunityGate };

/**
 * Topluluk sayfasının veri kaynağı: `chat_groups` satırı (RLS: herkese açık ya da kapalı ya da üye ya da davetli/başvurucu), kendi üyelik satırım
 * (rol, bildirim tercihi, kural kabulü) ve bekleyen davet/başvurum. Okunamayan topluluk → "bulunamadı" (tamamen kapalı topluluğun
 * varlığı sızmaz; kapalı topluluğun kartı herkese okunur ama içeriği değil). `reload()` sayaç/ayar/rol değişince sessizce yeniden okur (yükleniyor ekranına dönmeden).
 */
export function useCommunity(id: string | null, userId: string | null): { state: CommunityState; reload: () => Promise<void> } {
  const [state, setState] = useState<CommunityState>({ status: "loading" });

  const load = useCallback(async (): Promise<CommunityState> => {
    if (!id || !userId) return { status: "notfound" };
    try {
      const row = await fetchChatGroupRow(id);
      if (!row) return { status: "notfound" };
      const membership = await fetchMyCommunityMembership(id, userId);
      let gate: CommunityGate = { invitationId: null, inviterName: null, requestId: null };
      if (!membership) {
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
      return { status: "ready", group: mapChatGroupRow(row, membership?.role ?? "member"), membership, gate };
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
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const reload = useCallback(async () => {
    const next = await load();
    setState(next);
  }, [load]);

  return { state, reload };
}
