import { projectLink } from "./team-projects.ts";

/**
 * Ekip dosyasından oluşturma (docs/history/376-*): bir proje dosyasından ya da panodan "Oluştur" denince oluşturma formu AYNI form açılır
 * (ikinci bir form yok), bağlam yalnız adres parametreleriyle taşınır — topluluk bağlamının (`?community=`) ekip karşılığı:
 *   `?teamProject=<proje>&teamFile=<dosya>[&teamBoard=<pano>]`
 * İçerik ekibe özgü oluşur (akışa/aramaya/profile düşmez), yayınlanınca dosyaya (ve panodan gelindiyse panoya) eklenir.
 */

export type TeamCreateKind = "prompt" | "request" | "workflow" | "preset";

export interface TeamCreateContext {
  projectId: string;
  fileId: string;
  /** Panodan gelindiyse o pano; yalnız dosyadan gelindiyse null. */
  boardId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mevcut oluşturma ekranları (topluluk bağlamıyla aynı adresler). */
export const TEAM_CREATE_PATH: Record<TeamCreateKind, string> = {
  prompt: "/create?mode=prompt",
  request: "/requests/new",
  workflow: "/workflows/create",
  preset: "/presets/create",
};

export function teamCreateHref(kind: TeamCreateKind, ctx: TeamCreateContext): string {
  const base = TEAM_CREATE_PATH[kind];
  const params = new URLSearchParams({ teamProject: ctx.projectId, teamFile: ctx.fileId });
  if (ctx.boardId) params.set("teamBoard", ctx.boardId);
  return `${base}${base.includes("?") ? "&" : "?"}${params.toString()}`;
}

/** Adres parametrelerinden bağlam; eksik ya da kimliği bozuksa null (form eski davranışını sürdürür). */
export function parseTeamCreateContext(search: string | URLSearchParams): TeamCreateContext | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const projectId = params.get("teamProject");
  const fileId = params.get("teamFile");
  const boardId = params.get("teamBoard");
  if (!projectId || !fileId || !UUID.test(projectId) || !UUID.test(fileId)) return null;
  return { projectId, fileId, boardId: boardId && UUID.test(boardId) ? boardId : null };
}

/** Yayından / vazgeçmekten sonra dönülecek sayfa: panodan gelindiyse pano tuvali, değilse dosya. */
export function teamCreateReturnHref(teamId: string, ctx: TeamCreateContext): string {
  return ctx.boardId
    ? projectLink(teamId, ctx.projectId, { file: ctx.fileId, board: ctx.boardId, sub: "board" })
    : projectLink(teamId, ctx.projectId, { file: ctx.fileId });
}

/** Bir ekip içeriğinin (asıl öğe) açıldığı adres: dosya sayfası + öğe çekmecesi. */
export function teamItemHref(teamId: string, projectId: string, fileId: string, itemId: string | null): string {
  return projectLink(teamId, projectId, { file: fileId, item: itemId });
}
