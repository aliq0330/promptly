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

/**
 * Proje (Space) erişim seviyeleri (docs/history/360-*, 361-*): view < edit < approve < manage. Veritabanında `_team_space_access_level` /
 * `_team_space_level_rank` ve `team_access_level_check` bunun aynasıdır (`teams.test.ts` karşılaştırır). Ekip sahibi/yöneticisi her projede `manage`;
 * konuk en çok `edit`; ekip düzeyi yetenekler (manage_members, view_audit, export…) proje seviyesinden ASLA gelmez.
 */
export type TeamSpaceLevel = "view" | "edit" | "approve" | "manage";
export const TEAM_SPACE_LEVELS: readonly TeamSpaceLevel[] = ["view", "edit", "approve", "manage"];
/** Konuğun alabileceği en yüksek proje seviyesi. */
export const GUEST_MAX_SPACE_LEVEL: TeamSpaceLevel = "edit";
/** `all` modunda girişler yalnız tabanı yükseltir; yalnız bu seviyeler yazılabilir. */
export const SPACE_ELEVATION_LEVELS: readonly TeamSpaceLevel[] = ["approve", "manage"];

export function isTeamSpaceLevel(value: unknown): value is TeamSpaceLevel {
  return typeof value === "string" && (TEAM_SPACE_LEVELS as readonly string[]).includes(value);
}

/** view=1 … manage=4; erişim yok = 0 (SQL `_team_space_level_rank`). */
export function spaceLevelRank(level: TeamSpaceLevel | null | undefined): number {
  return level ? TEAM_SPACE_LEVELS.indexOf(level) + 1 : 0;
}

/** `level`, `min` seviyesini kapsıyor mu (ör. `approve` seviyesi `edit` işlerini de yapar). */
export function spaceLevelAtLeast(level: TeamSpaceLevel | null | undefined, min: TeamSpaceLevel): boolean {
  return spaceLevelRank(level) >= spaceLevelRank(min);
}

/** Konuk için seviyeyi tavana indirir (sunucu aynı kuralı uygular; arayüz seçenekleri buna göre daraltır). */
export function clampSpaceLevelForRole(level: TeamSpaceLevel, role: TeamRole | null | undefined): TeamSpaceLevel {
  return role === "guest" && spaceLevelRank(level) > spaceLevelRank(GUEST_MAX_SPACE_LEVEL) ? GUEST_MAX_SPACE_LEVEL : level;
}

/** Bu rol bu seviyeyi alabilir mi (konuk approve/manage alamaz). */
export function roleCanHoldSpaceLevel(role: TeamRole | null | undefined, level: TeamSpaceLevel): boolean {
  return clampSpaceLevelForRole(level, role) === level;
}

/** Ekip sayfası sekmeleri (`/teams/local?id=&tab=`). */
/** `projects` sekmesi arayüzde "Genel bakış"tır (docs/history/366-*; adres korunur). `spaces` ve `library` ESKİ adreslerdir (docs/history/362-*): sayfa bunları `projects`'e yönlendirir. */
export type TeamTab = "projects" | "approvals" | "spaces" | "library" | "chat" | "members" | "panel" | "admin";
export const TEAM_TABS: readonly TeamTab[] = ["projects", "approvals", "spaces", "library", "chat", "members", "panel", "admin"];

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
