import { rows, rpc } from "./teams";

/**
 * Ekip "Merkez" görünümleri veri katmanı (docs/history/366-*): Onay panosu, Son etkinlik, Üye proje rolleri. Üç OKUMA RPC'si;
 * yetki kararı sunucudadır (`_team_project_role`, `_team_item_visible`), burası yalnız çağırır ve camelCase'e çevirir.
 */

export type BoardState = "pending" | "changes" | "approved";

export interface BoardItem {
  id: string;
  kind: string;
  state: BoardState;
  title: string;
  body: string;
  note: string | null;
  mediaUrl: string | null;
  contentType: string | null;
  color: string;
  spaceId: string;
  projectId: string;
  projectTitle: string;
  fileId: string | null;
  fileTitle: string | null;
  authorId: string | null;
  authorName: string | null;
  authorUsername: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  unit: string | null;
  unitCount: number;
  /** Yalnız projede lider olan için true (karar yine sunucuda). */
  canDecide: boolean;
  mine: boolean;
}

export interface BoardProposal {
  itemId: string;
  kind: string;
  spaceId: string;
  projectId: string;
  projectTitle: string;
  fileId: string | null;
  fileTitle: string | null;
  currentTitle: string;
  proposedTitle: string;
  proposedBody: string;
  note: string;
  proposerId: string | null;
  proposerName: string | null;
  proposedAt: string;
}

export interface ReviewBoard {
  items: BoardItem[];
  proposals: BoardProposal[];
}

export type ActivityKind = "added" | "approved" | "changes" | "file" | "joined";

export interface TeamActivity {
  kind: ActivityKind;
  actorId: string | null;
  actorName: string | null;
  title: string | null;
  itemKind: string | null;
  projectId: string | null;
  projectTitle: string | null;
  fileTitle: string | null;
  at: string;
}

export interface MemberProjectRoles {
  userId: string;
  leadCount: number;
  editCount: number;
  viewCount: number;
}

export const fetchReviewBoard = async (team: string): Promise<ReviewBoard> => {
  const data = await rpc<Partial<ReviewBoard> | null>("team_review_board", { p_team: team });
  return { items: data?.items ?? [], proposals: data?.proposals ?? [] };
};

export const fetchRecentActivity = async (team: string, limit = 8): Promise<TeamActivity[]> => (await rpc<TeamActivity[] | null>("team_recent_activity", { p_team: team, p_limit: limit })) ?? [];

export const fetchMemberProjectRoles = (team: string) => rows<MemberProjectRoles>("team_member_project_roles", { p_team: team });
