/**
 * Ekip rolleri ve yetenek matrisi (docs/history/353-*). TEK doğruluk kaynağı veritabanıdır (`_team_role_caps`, `_team_can`);
 * burası aynasıdır ve `teams.test.ts` migration'la karşılaştırır. Arayüz yalnız GÖSTERİM için kullanır: gerçek karar sunucudadır.
 */
export type TeamRole = "owner" | "admin" | "editor" | "member" | "guest";
export const TEAM_ROLES: readonly TeamRole[] = ["owner", "admin", "editor", "member", "guest"];

export type TeamCapability =
  | "manage_members"
  | "manage_team"
  | "create_spaces"
  | "manage_channels"
  | "approve_library"
  | "write_variables"
  | "publish_external"
  | "view_audit"
  | "manage_groups"
  | "invite_guests"
  | "export";

export const TEAM_CAPABILITIES: readonly TeamCapability[] = [
  "manage_members",
  "manage_team",
  "create_spaces",
  "manage_channels",
  "approve_library",
  "write_variables",
  "publish_external",
  "view_audit",
  "manage_groups",
  "invite_guests",
  "export",
];

/** Role göre ham yetenekler (politikayla değişen üçü — publish_external, invite_guests, export — `teamRoleCan` içinde ayrıca karara bağlanır). */
export const TEAM_ROLE_CAPS: Record<TeamRole, readonly TeamCapability[]> = {
  owner: TEAM_CAPABILITIES,
  admin: TEAM_CAPABILITIES,
  editor: ["create_spaces", "write_variables"],
  member: [],
  guest: [],
};

/** Ekip başına / kişi başına sınırlar (SQL ile aynı). */
export const TEAM_LIMITS = {
  members: 500,
  guests: 50,
  spaces: 50,
  channels: 50,
  groups: 50,
  ownedPerUser: 10,
  pendingInvites: 200,
} as const;

export type TeamPolicyRole = "owner" | "admin" | "editor";

/** Politikayla belirlenen üç yeteneğin eşik rolleri (teams.publish_external_role / guest_invite_role / export_role). */
export interface TeamRolePolicy {
  publish_external_role: TeamPolicyRole;
  guest_invite_role: TeamPolicyRole;
  export_role: "owner" | "admin";
}

export const DEFAULT_TEAM_ROLE_POLICY: TeamRolePolicy = { publish_external_role: "admin", guest_invite_role: "admin", export_role: "owner" };

export function teamRank(role: TeamRole | null | undefined): number {
  switch (role) {
    case "owner":
      return 4;
    case "admin":
      return 3;
    case "editor":
      return 2;
    case "member":
      return 1;
    default:
      return 0;
  }
}

/** `_team_can` aynası: role + (varsa) politika eşikleri. */
export function teamRoleCan(role: TeamRole | null | undefined, cap: TeamCapability, policy: TeamRolePolicy = DEFAULT_TEAM_ROLE_POLICY): boolean {
  if (!role) return false;
  if (cap === "publish_external") return teamRank(role) >= teamRank(policy.publish_external_role);
  if (cap === "invite_guests") return teamRank(role) >= teamRank(policy.guest_invite_role);
  if (cap === "export") return teamRank(role) >= teamRank(policy.export_role);
  return TEAM_ROLE_CAPS[role].includes(cap);
}

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}

/** Ekip sayfası sekmeleri (`/teams/local?id=&tab=`). */
export type TeamTab = "spaces" | "library" | "chat" | "members" | "panel" | "admin";
export const TEAM_TABS: readonly TeamTab[] = ["spaces", "library", "chat", "members", "panel", "admin"];

export function isTeamTab(value: unknown): value is TeamTab {
  return typeof value === "string" && (TEAM_TABS as readonly string[]).includes(value);
}

/** Ekip sayfası adresi; `id` kimlik ya da kısa ad olabilir. `extra` ek sorgu parametreleridir (ör. `channel`, `status`, `section`). */
export function teamLink(id: string, tab?: TeamTab, extra: Record<string, string | null | undefined> = {}): string {
  const params = new URLSearchParams({ id });
  if (tab) params.set("tab", tab);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return `/teams/local?${params.toString()}`;
}
