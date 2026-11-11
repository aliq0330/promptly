import { rpc, rows, type TeamTodo } from "./teams";
import type { ProjectRole, ReviewState } from "@/lib/team-projects";

/**
 * Ekip projeleri v2 veri katmanı (docs/history/362-*). Her çağrı tek bir SECURITY DEFINER RPC'dir; yetki kararı SUNUCUDADIR
 * (`_team_project_role`, onay tetikleyicileri). Satırlar camelCase'e çevrilir (`rpc` yardımcısı), veritabanının kısa hata kodları
 * `toTeamError` ile okunur cümleye dönüşür.
 */

export type ProjectAccessMode = "selected" | "all";

export interface ProjectFileSummary {
  id: string;
  title: string;
  position?: number;
  reviewRequired: boolean;
  mainAreaId: string | null;
  itemCount: number;
  /** Yalnız lider için dolu (onay bekleyen öğe sayısı). */
  pendingCount: number | null;
  boardCount?: number;
}

export interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  tone: string;
  archivedAt: string | null;
  reviewDefault: boolean;
  accessMode: ProjectAccessMode;
  baseRole: "view" | "edit";
  myRole: ProjectRole | null;
  mainAreaId: string | null;
  channelId: string | null;
  memberCount: number;
  boardCount: number;
  itemCount: number;
  pendingCount: number | null;
  files: ProjectFileSummary[];
}

export interface ProjectBoard {
  id: string;
  title: string;
  fileId: string | null;
  itemCount: number;
  position?: number;
  /** Pano grubu (docs/history/368-*); bağımsız panoda `null`. */
  groupId?: string | null;
}

/** Pano grubu: birden çok panonun bir arada olduğu küme (`team_board_groups`). */
export interface ProjectBoardGroup {
  id: string;
  title: string;
  fileId: string | null;
  boardCount: number;
}

/** Pano grubunun bir sayfası (docs/history/367-*): proje geneli ve her dosya için ana alan + ek panolar. Eski sunucuda yoktur. */
export interface ProjectArea {
  id: string;
  title: string;
  fileId: string | null;
  isMain: boolean;
  position: number;
  groupId?: string | null;
  itemCount: number;
  updatedAt: string | null;
  /** Yalnız lider için dolu. */
  pendingCount: number | null;
  openComments: number;
}

export interface ProjectPerson {
  type: "member" | "group";
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  role: ProjectRole;
  /** Ekip sahibi/yöneticisi: her projede örtük lider (değiştirilemez). */
  implicit: boolean;
  memberCount: number | null;
}

export interface ProjectVariable {
  id: string;
  fileId: string | null;
  name: string;
  value: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface ProjectDetail {
  project: {
    id: string;
    teamId: string;
    title: string;
    description: string;
    tone: string;
    accessMode: ProjectAccessMode;
    baseRole: "view" | "edit";
    reviewDefault: boolean;
    archivedAt: string | null;
    createdAt: string;
  };
  myRole: ProjectRole;
  mainAreaId: string | null;
  channelId: string | null;
  itemCount: number;
  pendingCount: number | null;
  files: ProjectFileSummary[];
  boards: ProjectBoard[];
  areas?: ProjectArea[];
  groups?: ProjectBoardGroup[];
  people: ProjectPerson[];
  variables: ProjectVariable[];
}

export interface ProjectAccessEntry {
  type: "member" | "group";
  id: string;
  role: ProjectRole;
  name?: string;
  username?: string | null;
  sub?: string | null;
}

export interface ProjectAccessSettings {
  mode: ProjectAccessMode;
  baseRole: "view" | "edit";
  entries: ProjectAccessEntry[];
}

/** Bir alanın (Space motoru satırı) proje bağlamı; ekip alanı değilse `null`. */
export interface AreaInfo {
  spaceId: string;
  teamId: string;
  projectId: string;
  fileId: string | null;
  isMain: boolean;
  myRole: ProjectRole;
  projectTitle: string;
  fileTitle: string | null;
  reviewRequired: boolean;
}

export interface ReviewQueueItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  note: string;
  mediaUrl: string | null;
  contentType: string | null;
  contentId: string | null;
  color: string;
  isDraft: boolean;
  spaceId: string;
  areaTitle: string;
  fileId: string | null;
  fileTitle: string | null;
  isMain: boolean;
  authorId: string | null;
  authorName: string | null;
  authorUsername: string | null;
  submittedAt: string | null;
  unit: string | null;
  unitCount: number;
}

export interface ReviewQueueProposal {
  itemId: string;
  kind: string;
  spaceId: string;
  fileId: string | null;
  fileTitle: string | null;
  current: { title: string; body: string; note: string };
  proposed: { title: string; body: string; note: string };
  proposerId: string | null;
  proposerName: string | null;
  proposedAt: string;
}

export interface ReviewQueue {
  items: ReviewQueueItem[];
  proposals: ReviewQueueProposal[];
}

export interface ProjectTodo {
  teamId: string;
  teamName: string;
  teamSlug: string;
  projectId: string;
  projectTitle: string;
  kind: "review" | "changes";
  n: number;
  href: string;
  at: string;
}

export interface ProjectChannelRef {
  channelId: string;
  projectId: string;
  projectTitle: string;
}

const entriesOut = (entries: ProjectAccessEntry[]) => entries.map((e) => ({ type: e.type, id: e.id, role: e.role }));

// --- Okuma ---------------------------------------------------------------------------------
export const listProjects = (team: string) => rows<ProjectSummary>("team_projects_list", { p_team: team });
export const fetchProject = (project: string) => rpc<ProjectDetail>("team_project_get", { p_project: project });
export const fetchProjectAccess = (project: string) => rpc<ProjectAccessSettings>("team_project_access", { p_project: project });
export const fetchProjectVariables = (project: string) => rows<ProjectVariable>("team_variables_list", { p_project: project });
export const fetchAreaInfo = (space: string) => rpc<AreaInfo | null>("team_area_info", { p_space: space });
/** "Senden bekleyenler" listeleri `TeamTodo` biçimini çizer: proje onayları kendi türleriyle (`project_review` / `project_changes`) katılır. */
export const projectTodoAsTeamTodo = (todo: ProjectTodo): TeamTodo => ({
  teamId: todo.teamId,
  teamName: todo.teamName,
  teamSlug: todo.teamSlug,
  kind: todo.kind === "review" ? "project_review" : "project_changes",
  n: todo.n,
  label: todo.projectTitle,
  href: todo.href,
  at: todo.at,
});
export const fetchProjectChannels = (team: string) => rows<ProjectChannelRef>("team_project_channels", { p_team: team });
export const fetchProjectTodos = () => rows<ProjectTodo>("team_project_todos");
export const fetchReviewQueue = async (project: string): Promise<ReviewQueue> => {
  const data = await rpc<Partial<ReviewQueue> | null>("team_review_pending", { p_project: project });
  return { items: data?.items ?? [], proposals: data?.proposals ?? [] };
};

// --- Proje ---------------------------------------------------------------------------------
export const createProject = (
  team: string,
  input: { title: string; description: string; mode: ProjectAccessMode; baseRole: "view" | "edit"; entries: ProjectAccessEntry[]; tone?: string },
) =>
  rpc<string>("team_create_project", {
    p_team: team,
    p_title: input.title,
    p_description: input.description,
    p_mode: input.mode,
    p_base_role: input.baseRole,
    p_entries: entriesOut(input.entries),
    p_tone: input.tone ?? "primary",
  });
export const updateProject = (project: string, patch: { title?: string; description?: string; tone?: string; reviewDefault?: boolean }) =>
  rpc<void>("team_update_project", {
    p_project: project,
    p_patch: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.tone !== undefined ? { tone: patch.tone } : {}),
      ...(patch.reviewDefault !== undefined ? { review_default: patch.reviewDefault } : {}),
    },
  });
export const setProjectAccess = (project: string, mode: ProjectAccessMode, baseRole: "view" | "edit", entries: ProjectAccessEntry[]) =>
  rpc<void>("team_set_project_access", { p_project: project, p_mode: mode, p_base_role: baseRole, p_entries: entriesOut(entries) });
export const archiveProject = (project: string, archived: boolean) => rpc<void>("team_archive_project", { p_project: project, p_archived: archived });
export const deleteProject = (project: string, confirm: string) => rpc<void>("team_delete_project", { p_project: project, p_confirm: confirm });

// --- Dosya / pano ---------------------------------------------------------------------------
export const createFile = (project: string, title: string, review: boolean | null = null) =>
  rpc<string>("team_create_file", { p_project: project, p_title: title, p_review: review });
export const renameFile = (file: string, title: string) => rpc<void>("team_rename_file", { p_file: file, p_title: title });
/** Onay anahtarı; dönen sayı = onaysız kalan öğe (kapatınca kendiliğinden onaylanmaz). */
export const setFileReview = (file: string, on: boolean) => rpc<number>("team_file_set_review", { p_file: file, p_on: on });
export const deleteFile = (file: string) => rpc<void>("team_delete_file", { p_file: file });
/** Dosya içinde BAĞIMSIZ pano (proje geneli pano yok; `file` şarttır). */
export const createBoard = (project: string, title: string, file: string) =>
  rpc<string>("team_create_board", { p_project: project, p_title: title, p_file: file });
/** Açık panonun yanına yeni pano: ikisi bir pano grubu olur (grup yoksa kurulur, varsa pano gruba eklenir). */
export const createBoardInGroup = (fromBoard: string, title: string) => rpc<string>("team_create_board_in_group", { p_from: fromBoard, p_title: title });
export const renameBoardGroup = (group: string, title: string) => rpc<void>("team_rename_board_group", { p_group: group, p_title: title });
export const renameBoard = (space: string, title: string) => rpc<void>("team_rename_board", { p_space: space, p_title: title });
export const deleteBoard = (space: string) => rpc<void>("team_delete_board", { p_space: space });

// --- Değişkenler ----------------------------------------------------------------------------
export const setVariable = (project: string, name: string, value: string, file: string | null = null) =>
  rpc<string>("team_set_variable", { p_project: project, p_name: name, p_value: value, p_file: file });
export const deleteVariable = (variable: string) => rpc<void>("team_delete_variable", { p_variable: variable });

// --- Onay -----------------------------------------------------------------------------------
export const submitReview = (items: string[]) => rpc<number>("team_review_submit", { p_item_ids: items });
export const withdrawReview = (items: string[]) => rpc<number>("team_review_withdraw", { p_item_ids: items });
export const decideReview = (items: string[], decision: "approve" | "changes", note = "") =>
  rpc<number>("team_review_decide", { p_item_ids: items, p_decision: decision, p_note: note });
export const proposeChange = (item: string, patch: { title: string; body: string; note: string }) =>
  rpc<void>("team_review_propose", { p_item: item, p_title: patch.title, p_body: patch.body, p_note: patch.note });
export const withdrawProposal = (item: string) => rpc<void>("team_review_withdraw_proposal", { p_item: item });
export const decideProposal = (item: string, decision: "approve" | "changes", note = "") =>
  rpc<void>("team_review_decide_proposal", { p_item: item, p_decision: decision, p_note: note });

export type { ReviewState };
