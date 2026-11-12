"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchProject } from "@/lib/supabase/team-projects";
import { updateSpaceItem } from "@/lib/supabase/spaces";
import { attachContent, fetchContentLocation } from "@/lib/supabase/team-board";
import { parseTeamCreateContext, teamCreateReturnHref, teamItemHref, type TeamCreateContext, type TeamCreateKind } from "@/lib/team-create";

/**
 * Ekip dosyasından içerik oluşturma (docs/history/376-*): `community-return.ts`'in ekip karşılığı. Oluşturma formları AYNI formdur; bağlam
 * `?teamProject=&teamFile=[&teamBoard=]` ile gelir. İçerik ekibe özgü oluşturulur (`teamFileId`), yayınlanınca dosyaya (ve panodan gelindiyse
 * panoya) eklenir ve kullanıcı geldiği dosyaya/panoya döner; normal akışta paylaşım ve görünürlük seçimi YOKTUR.
 */

export interface TeamCreateInfo extends TeamCreateContext {
  teamId: string | null;
  projectTitle: string | null;
  fileTitle: string | null;
  boardTitle: string | null;
}

function contextFromUrl(): TeamCreateContext | null {
  if (typeof window === "undefined") return null;
  return parseTeamCreateContext(window.location.search);
}

/**
 * Oluşturma ekranının ekip bağlamı (adres parametreleri ilk açılışta okunur: kaydederken adres `?edit=` ile değişse bile kaybolmaz) ve
 * başlıklar (proje/dosya/pano adı; gelene kadar null). Bağlam yoksa null — form eski davranışını sürdürür.
 */
export function useTeamCreateContext(): TeamCreateInfo | null {
  const [ctx, setCtx] = useState<TeamCreateContext | null>(null);
  const [titles, setTitles] = useState<{ teamId: string; projectTitle: string; fileTitle: string | null; boardTitle: string | null } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adres parametresi yalnızca tarayıcıda okunur
    setCtx(contextFromUrl());
  }, []);

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    fetchProject(ctx.projectId)
      .then((detail) => {
        if (cancelled) return;
        const file = detail.files.find((item) => item.id === ctx.fileId) ?? null;
        const board = ctx.boardId ? (detail.boards.find((item) => item.id === ctx.boardId) ?? null) : null;
        setTitles({ teamId: detail.project.teamId, projectTitle: detail.project.title, fileTitle: file?.title ?? null, boardTitle: board?.title ?? null });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  if (!ctx) return null;
  return { ...ctx, teamId: titles?.teamId ?? null, projectTitle: titles?.projectTitle ?? null, fileTitle: titles?.fileTitle ?? null, boardTitle: titles?.boardTitle ?? null };
}

/**
 * Yayından sonra: içeriği dosyaya (+ panoya) ekler ve dönülecek adresi verir. Ekip bağlamı yoksa null (form kendi yoluna gider).
 * Ekleme başarısız olursa hata fırlatır (içerik ekibe özgü oluştu ama dosyaya girmedi: form hatayı gösterir, kullanıcı "Paylaş"a tekrar basabilir —
 * `attachContent` aynı içerik varsa yenisini açmaz).
 */
export function useTeamReturn(team: TeamCreateInfo | null): (type: TeamCreateKind, contentId: string) => Promise<string | null> {
  return useCallback(
    async (type, contentId) => {
      if (!team) return null;
      const attached = await attachContent({ fileId: team.fileId, type, id: contentId, boardId: team.boardId });
      // Gruplar sekmesinde bir klasörden gelindiyse (docs/history/378-*) asıl öğe o gruba girer; grup yazılamazsa içerik dosyada kalır (hata yutulur).
      if (team.groupId) await updateSpaceItem(attached.itemId, { groupId: team.groupId }).catch(() => undefined);
      let teamId = team.teamId;
      if (!teamId) teamId = (await fetchProject(team.projectId)).project.teamId;
      return teamCreateReturnHref(teamId, team);
    },
    [team],
  );
}

/** Vazgeç / taslak sonrası dönülecek adres (bağlam yoksa null). */
export function useTeamLeaveHref(team: TeamCreateInfo | null): string | null {
  const [href, setHref] = useState<string | null>(null);
  const teamId = team?.teamId ?? null;
  const fileId = team?.fileId ?? null;
  const projectId = team?.projectId ?? null;
  const boardId = team?.boardId ?? null;
  const groupId = team?.groupId ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adres, başlıklar gelince bir kez kurulur
    setHref(teamId && fileId && projectId ? teamCreateReturnHref(teamId, { projectId, fileId, boardId, groupId }) : null);
  }, [teamId, fileId, projectId, boardId, groupId]);
  return href;
}

/** Ekip bağlamının kullanıcıya görünen özeti ("Villa → Mutfak · Pano A"). */
export function useTeamDestinationLabel(team: TeamCreateInfo | null): string | null {
  const { t } = useTranslation();
  if (!team) return null;
  const parts = [team.projectTitle ?? "…", team.fileTitle ?? "…"];
  const base = parts.join(" → ");
  return team.boardId ? t("tf.create.withBoard", { path: base, board: team.boardTitle ?? "…" }) : base;
}

/**
 * Ekibe özgü içeriğin kendi sayfası yoktur (dosyada yaşar): içerik sayfası (`/prompts/local?id=` …) ekip dosyasındaki öğe çekmecesine yönlenir.
 * `id` yalnız içerik ekibe özgüyse verilir (`teamFileId` dolu); yönlendirme sürerken `true` döner (sayfa o sırada çizilmez). Yer bulunamazsa
 * (erişim yok) `false`: normal sayfa çizilir.
 */
export function useTeamContentRedirect(type: TeamCreateKind, id: string | null): boolean {
  const router = useRouter();
  const [state, setState] = useState<{ id: string; to: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchContentLocation(type, id)
      .then((location) => {
        if (cancelled) return;
        const to = location ? teamItemHref(location.teamId, location.projectId, location.fileId, location.itemId) : null;
        setState({ id, to });
        if (to) router.replace(to);
      })
      .catch(() => !cancelled && setState({ id, to: null }));
    return () => {
      cancelled = true;
    };
  }, [type, id, router]);
  return id !== null && (state?.id !== id || state.to !== null);
}
