"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOnlineIds } from "@/features/presence/use-presence";
import { fetchMyTeam, listChannelMembers, listTeamChannels, type ChannelMember, type TeamChannel, type TeamSummary } from "@/lib/supabase/teams";

/**
 * Mesajlar'daki ekip sohbetinin başlığı, kanal çipleri ve bilgi sayfası için ortak okumalar (docs/history/353-*, Yön A).
 * Kısa ömürlü modül önbelleği: sohbet ekranı her açıldığında/kanal değiştiğinde aynı ekibi yeniden istemez; kimlik değişince sayfa baştan yüklenir
 * (CLAUDE.md §8.10), önbellek ayrıca temizlenmez.
 */
const TTL_MS = 30_000;
const channelCache = new Map<string, { at: number; rows: TeamChannel[] }>();
const summaryCache = new Map<string, { at: number; team: TeamSummary | null }>();

/** Ekibin kanalları (arşivlenmemiş, sıralı). `reload` önbelleği atlayıp yeniden okur (kanal ekleyip silince). */
export function useTeamChannelList(teamId: string | null | undefined): { channels: TeamChannel[]; loaded: boolean; reload: () => void } {
  const [tick, setTick] = useState(0);
  // Satırlar hangi ekibe ait olduğuyla tutulur: ekip değişince eski ekibin kanalları gösterilmez (önbellek anında devralır).
  const [loaded, setLoaded] = useState<{ teamId: string; rows: TeamChannel[] } | null>(null);
  const rows = teamId ? (loaded?.teamId === teamId ? loaded.rows : (channelCache.get(teamId)?.rows ?? null)) : null;
  useEffect(() => {
    if (!teamId) return;
    const cached = channelCache.get(teamId);
    if (cached && Date.now() - cached.at < TTL_MS && tick === 0) return;
    let cancelled = false;
    void listTeamChannels(teamId).then(
      (next) => {
        channelCache.set(teamId, { at: Date.now(), rows: next });
        if (!cancelled) setLoaded({ teamId, rows: next });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [teamId, tick]);
  const channels = useMemo(() => (rows ?? []).filter((channel) => !channel.archivedAt), [rows]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { channels, loaded: rows !== null, reload };
}

/** Ekibin özeti (rol, açıklama, üye sayısı, konuk bitişi). Üye olmayan/bulunamayan ekip için null. */
export function useTeamSummary(teamId: string | null | undefined): TeamSummary | null {
  const [loaded, setLoaded] = useState<{ teamId: string; team: TeamSummary | null } | null>(null);
  const team = teamId ? (loaded?.teamId === teamId ? loaded.team : (summaryCache.get(teamId)?.team ?? null)) : null;
  useEffect(() => {
    if (!teamId) return;
    const cached = summaryCache.get(teamId);
    if (cached && Date.now() - cached.at < TTL_MS) return;
    let cancelled = false;
    void fetchMyTeam(teamId).then(
      (next) => {
        summaryCache.set(teamId, { at: Date.now(), team: next });
        if (!cancelled) setLoaded({ teamId, team: next });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [teamId]);
  return team;
}

/** Kanalın üyeleri (ilk 200) ve çevrimiçi olanların sayısı — başlıkta "N çevrimiçi". */
export function useChannelPresence(channelId: string | null | undefined): { members: ChannelMember[]; onlineCount: number } {
  const [loaded, setLoaded] = useState<{ channelId: string; members: ChannelMember[] } | null>(null);
  const members = useMemo(() => (channelId && loaded?.channelId === channelId ? loaded.members : []), [channelId, loaded]);
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    void listChannelMembers(channelId).then(
      (rows) => !cancelled && setLoaded({ channelId, members: rows }),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [channelId]);
  const online = useOnlineIds(members.map((member) => member.userId));
  return { members, onlineCount: members.filter((member) => online.has(member.userId)).length };
}
