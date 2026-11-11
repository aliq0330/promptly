"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useOnlineIds } from "@/features/presence/use-presence";
import { fetchChannelPreviews } from "@/lib/supabase/messages";
import { fetchMyProjectRole } from "@/lib/supabase/team-projects";
import type { ProjectRole } from "@/lib/team-projects";
import { fetchMyTeam, listChannelMembers, listMyTeamMutes, listTeamChannels, setTeamMute, type ChannelMember, type TeamActionError, type TeamChannel, type TeamSummary } from "@/lib/supabase/teams";

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

/**
 * Çağıranın ekip ve proje sessizlikleri (docs/history/369-*). Anahtarlar KENDİ satırını gösterir: ekip sessizken proje ayrıca sessiz olabilir ve ekibin sesi
 * açılınca o kalır; bu yüzden anahtar durumu kanalların etkin sessizliğinden değil `team_my_mutes` satırlarından okunur. Değişiklik iyimser, hata olursa geri döner.
 */
export function useTeamMutes(teamId: string | null | undefined, onChanged?: () => void): {
  loaded: boolean;
  teamMuted: boolean;
  isProjectMuted: (projectId: string) => boolean;
  busy: boolean;
  error: string | null;
  setTeamMuted: (muted: boolean) => Promise<void>;
  setProjectMuted: (projectId: string, muted: boolean) => Promise<void>;
} {
  const [state, setState] = useState<{ teamId: string; teamMuted: boolean; projects: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    void listMyTeamMutes().then(
      (rows) => {
        if (cancelled) return;
        const mine = rows.filter((row) => row.teamId === teamId);
        setState({ teamId, teamMuted: mine.some((row) => !row.projectId), projects: mine.filter((row) => row.projectId).map((row) => row.projectId as string) });
      },
      () => !cancelled && setState({ teamId, teamMuted: false, projects: [] }),
    );
    return () => {
      cancelled = true;
    };
  }, [teamId]);
  const current = state && state.teamId === teamId ? state : null;

  const apply = useCallback(
    async (projectId: string | null, muted: boolean) => {
      if (!teamId || busy) return;
      const before = current;
      setBusy(true);
      setError(null);
      setState((prev) => {
        const base = prev && prev.teamId === teamId ? prev : { teamId, teamMuted: false, projects: [] };
        if (!projectId) return { ...base, teamMuted: muted };
        return { ...base, projects: muted ? [...new Set([...base.projects, projectId])] : base.projects.filter((id) => id !== projectId) };
      });
      try {
        await setTeamMute(teamId, projectId, muted);
        onChanged?.();
      } catch (err) {
        setState(before);
        setError((err as TeamActionError).message);
      } finally {
        setBusy(false);
      }
    },
    [teamId, busy, current, onChanged],
  );

  return {
    loaded: current !== null,
    teamMuted: current?.teamMuted ?? false,
    isProjectMuted: (projectId) => current?.projects.includes(projectId) ?? false,
    busy,
    error,
    setTeamMuted: (muted) => apply(null, muted),
    setProjectMuted: (projectId, muted) => apply(projectId, muted),
  };
}

/** Kanal satırlarının "Ayşe: merhaba" önizlemeleri (kanal kimliği → son mesaj). Kimlik kümesi değişince yeniden okunur. */
export function useChannelPreviews(ids: readonly string[]): Map<string, { text: string; at: string }> {
  const { user } = useAuth();
  const key = ids.join(",");
  const [loaded, setLoaded] = useState<{ key: string; map: Map<string, { text: string; at: string }> } | null>(null);
  useEffect(() => {
    if (!user || !key) return;
    let cancelled = false;
    void fetchChannelPreviews(key.split(","), user.id).then(
      (map) => !cancelled && setLoaded({ key, map }),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [key, user]);
  return loaded && loaded.key === key ? loaded.map : EMPTY_PREVIEWS;
}
const EMPTY_PREVIEWS = new Map<string, { text: string; at: string }>();

/** Çağıranın bir projedeki rolü ("lead" proje kanallarını yönetir). Proje yoksa/rol yoksa null. */
export function useMyProjectRole(projectId: string | null | undefined): ProjectRole | null {
  const [loaded, setLoaded] = useState<{ projectId: string; role: ProjectRole | null } | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void fetchMyProjectRole(projectId).then(
      (role) => !cancelled && setLoaded({ projectId, role }),
      () => !cancelled && setLoaded({ projectId, role: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return projectId && loaded?.projectId === projectId ? loaded.role : null;
}
