import { supabase } from "./client";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import { fetchRequestsByIds } from "./requests";
import { fetchWorkflowsByIds } from "./workflows";
import { fetchPresetsByIds } from "./presets";
import { translateForRuntime, type TranslationKey } from "@/lib/i18n/translations";
import { resizeImageToBlob } from "@/lib/utils";
import {
  extractSpaceErrorCode,
  SPACE_PAGE_SIZE,
  type SpaceColor,
  type SpaceContentType,
  type SpaceErrorCode,
  type SpaceActivityVisibility,
  type SpaceFilter,
  type SpaceItemKind,
  type SpaceKind,
  type SpaceRole,
  type SpaceSort,
  type SpaceVisibility,
} from "@/lib/spaces";
import type { Preset, Prompt, PromptRequest, Workflow } from "@/types";

/**
 * Promptly Spaces veri katmanı (docs/history/213-*). Okuma RLS'e dayanır (`can_read_space`: üye · herkese açık · açılmış bağlantı);
 * yazma RLS (düzenleyici/sahip) ya da SECURITY DEFINER RPC'lerden geçer. Sahiplik/rol istemciden GÖNDERİLMEZ, sunucu `auth.uid()`
 * ile karar verir. Her yazma gerçekten etkilenen satırı geri okur: "0 satır" sessiz başarı sayılmaz (`SpaceError`).
 */

export const SPACE_MEDIA_BUCKET = "space-media";

const SPACE_ERROR_KEYS: Record<SpaceErrorCode, TranslationKey> = {
  not_authenticated: "spaces.error.notAuthenticated",
  space_not_found: "spaces.error.notFound",
  space_forbidden: "spaces.error.forbidden",
  space_limit: "spaces.error.limit",
  space_title_required: "spaces.error.titleRequired",
  space_invalid: "spaces.error.invalid",
  space_user_not_found: "spaces.error.userNotFound",
  space_already_member: "spaces.error.alreadyMember",
  space_invite_exists: "spaces.error.inviteExists",
  space_invite_not_found: "spaces.error.inviteNotFound",
  space_self_invite: "spaces.error.selfInvite",
  space_member_limit: "spaces.error.memberLimit",
  space_member_not_found: "spaces.error.memberNotFound",
  space_link_invalid: "spaces.error.linkInvalid",
  space_not_link_visible: "spaces.error.notLinkVisible",
  space_archived: "spaces.error.archived",
  space_item_limit: "spaces.error.itemLimit",
  space_group_limit: "spaces.error.groupLimit",
  space_palette_limit: "spaces.error.paletteLimit",
  space_source_unavailable: "spaces.error.sourceUnavailable",
  space_duplicate: "spaces.error.duplicate",
  space_not_public: "spaces.error.notPublic",
  space_too_empty: "spaces.error.tooEmpty",
  space_rating_owner: "spaces.error.ratingOwner",
};

export class SpaceError extends Error {
  readonly code: SpaceErrorCode | "generic";
  constructor(code: SpaceErrorCode | "generic", message: string) {
    super(message);
    this.name = "SpaceError";
    this.code = code;
  }
}

export function toSpaceError(error: { message?: string; code?: string } | null | undefined): SpaceError {
  const code = extractSpaceErrorCode(error);
  // RLS reddi (ör. görüntüleyici ekleme denedi) yetki hatasıdır; ham SQL metni gösterilmez.
  if (!code && /row-level security|permission denied/i.test(error?.message ?? "")) {
    return new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
  }
  return new SpaceError(code ?? "generic", translateForRuntime(code ? SPACE_ERROR_KEYS[code] : "spaces.error.generic"));
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toSpaceError(error);
  return data as T;
}

// ---------------------------------------------------------------------------------------------
// Modeller
// ---------------------------------------------------------------------------------------------

export interface SpacePerson {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SpaceSummary {
  id: string;
  ownerId: string;
  owner: SpacePerson | null;
  title: string;
  description: string;
  kind: SpaceKind;
  visibility: SpaceVisibility;
  coverUrl: string | null;
  coverItemId: string | null;
  coverItemUrl: string | null;
  previewUrls: string[];
  imageCount: number;
  promptCount: number;
  noteCount: number;
  /** Yalnız üyeye (üye olmayan için `null`). */
  memberCount: number | null;
  myRole: SpaceRole | null;
  isFavorite: boolean;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface Space {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  kind: SpaceKind;
  visibility: SpaceVisibility;
  coverUrl: string | null;
  coverItemId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  /**
   * "N kez alıntılandı" (docs/history/241-*): Space'in kendi beğeni/yorumu YOK; akışta görünmek ve tartışılmak alıntı üzerinden olur
   * (sahibinin kendi paylaşımı da bir alıntıdır). Korumalı sayaç (`spaces.quote_count`).
   */
  quoteCount: number;
  /** Space'in kendi yorumları ve 1–5 puanı (docs/history/242-*): ortalama + puan sayısı korumalı sayaçlardır. */
  ratingAvg: number;
  ratingCount: number;
  /** Genel yorum sayısı (etkinlik yorumları hariç). */
  commentCount: number;
  activityVisibility: SpaceActivityVisibility;
}

export interface SpaceItem {
  id: string;
  spaceId: string;
  kind: SpaceItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  groupId: string | null;
  promptId: string | null;
  mediaUrl: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  isDraft: boolean;
  sourcePromptId: string | null;
  contentType: SpaceContentType | null;
  contentId: string | null;
  paletteId: string | null;
  title: string;
  body: string;
  note: string;
  color: SpaceColor;
  attachedItemId: string | null;
  isPrivate: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceGroup {
  id: string;
  spaceId: string;
  name: string;
  color: SpaceColor;
  position: number;
  createdAt: string;
}

export interface SpacePalette {
  id: string;
  spaceId: string;
  name: string;
  description: string;
  colors: string[];
  source: "manual" | "image";
  sourceItemId: string | null;
  position: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceMember {
  userId: string;
  role: SpaceRole;
  createdAt: string;
  profile: SpacePerson | null;
}

export interface SpaceInvitation {
  id: string;
  inviteeId: string;
  role: Exclude<SpaceRole, "owner">;
  createdAt: string;
  invitee: SpacePerson | null;
}

export interface MySpaceInvitation {
  id: string;
  spaceId: string;
  role: Exclude<SpaceRole, "owner">;
  createdAt: string;
  spaceTitle: string;
  spaceKind: SpaceKind;
  inviter: Omit<SpacePerson, "id"> | null;
}

export type SpaceActivityAction =
  | "created" | "renamed" | "visibility_changed" | "archived" | "unarchived"
  | "image_added" | "image_removed" | "prompt_added" | "note_added" | "content_added" | "item_removed"
  | "palette_created" | "palette_updated" | "palette_deleted" | "group_created" | "group_deleted"
  | "member_invited" | "member_joined" | "member_removed" | "role_changed" | "link_created" | "link_revoked";

/** Etkinliğin önce/sonra ayrıntısı (`space_activity.details`, docs/history/242-*). Alanlar eylem türüne göre dolar. */
export interface SpaceActivityItem {
  kind: string;
  title?: string | null;
  text?: string | null;
  thumb?: string | null;
}

export interface SpaceActivityDetails {
  /** Ad / görünürlük için metin, palet için renk listesi. */
  before?: string | string[] | null;
  after?: string | string[] | null;
  items?: SpaceActivityItem[];
}

export interface SpaceActivity {
  id: string;
  action: SpaceActivityAction;
  label: string | null;
  count: number;
  createdAt: string;
  actor: SpacePerson | null;
  actorId: string | null;
  details: SpaceActivityDetails | null;
  /** Değişikliği yapanın notu (yalnız o yazar). */
  authorNote: string | null;
  commentCount: number;
}

interface PersonRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

const PERSON_COLS = "id, username, display_name, avatar_url";

function mapPerson(row: PersonRow | null | undefined): SpacePerson | null {
  return row ? { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url } : null;
}

interface SpaceRow {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  kind: SpaceKind;
  visibility: SpaceVisibility;
  cover_url: string | null;
  cover_item_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  quote_count: number | null;
  rating_avg: number | string | null;
  rating_count: number | null;
  comment_count: number | null;
  activity_visibility: SpaceActivityVisibility | null;
}

const SPACE_COLS =
  "id, owner_id, title, description, kind, visibility, cover_url, cover_item_id, archived_at, created_at, updated_at, updated_by, quote_count, rating_avg, rating_count, comment_count, activity_visibility";

function mapSpace(row: SpaceRow): Space {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? "",
    kind: row.kind,
    visibility: row.visibility,
    coverUrl: row.cover_url,
    coverItemId: row.cover_item_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    quoteCount: row.quote_count ?? 0,
    ratingAvg: Number(row.rating_avg ?? 0),
    ratingCount: row.rating_count ?? 0,
    commentCount: row.comment_count ?? 0,
    activityVisibility: row.activity_visibility ?? "everyone",
  };
}

export interface SpaceItemRow {
  id: string;
  space_id: string;
  kind: SpaceItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  group_id: string | null;
  prompt_id: string | null;
  media_url: string | null;
  media_width: number | null;
  media_height: number | null;
  is_draft: boolean;
  source_prompt_id: string | null;
  content_type: SpaceContentType | null;
  content_id: string | null;
  palette_id: string | null;
  title: string;
  body: string;
  note: string;
  color: SpaceColor;
  attached_item_id: string | null;
  is_private: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const ITEM_COLS =
  "id, space_id, kind, x, y, w, h, z, group_id, prompt_id, media_url, media_width, media_height, is_draft, source_prompt_id, content_type, content_id, palette_id, title, body, note, color, attached_item_id, is_private, created_by, updated_by, created_at, updated_at";

export function mapSpaceItem(row: SpaceItemRow): SpaceItem {
  return {
    id: row.id,
    spaceId: row.space_id,
    kind: row.kind,
    x: Number(row.x),
    y: Number(row.y),
    w: Number(row.w),
    h: Number(row.h),
    z: Number(row.z),
    groupId: row.group_id,
    promptId: row.prompt_id,
    mediaUrl: row.media_url,
    mediaWidth: row.media_width,
    mediaHeight: row.media_height,
    isDraft: Boolean(row.is_draft),
    sourcePromptId: row.source_prompt_id,
    contentType: row.content_type,
    contentId: row.content_id,
    paletteId: row.palette_id,
    title: row.title ?? "",
    body: row.body ?? "",
    note: row.note ?? "",
    color: row.color ?? "neutral",
    attachedItemId: row.attached_item_id,
    isPrivate: Boolean(row.is_private),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface GroupRow {
  id: string;
  space_id: string;
  name: string;
  color: SpaceColor;
  position: number;
  created_at: string;
}

const GROUP_COLS = "id, space_id, name, color, position, created_at";

function mapGroup(row: GroupRow): SpaceGroup {
  return { id: row.id, spaceId: row.space_id, name: row.name, color: row.color, position: row.position, createdAt: row.created_at };
}

interface PaletteRow {
  id: string;
  space_id: string;
  name: string;
  description: string;
  colors: string[] | null;
  source: "manual" | "image";
  source_item_id: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const PALETTE_COLS = "id, space_id, name, description, colors, source, source_item_id, position, created_by, created_at, updated_at";

function mapPalette(row: PaletteRow): SpacePalette {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    description: row.description ?? "",
    colors: row.colors ?? [],
    source: row.source,
    sourceItemId: row.source_item_id,
    position: row.position,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------------------------
// Liste + Space
// ---------------------------------------------------------------------------------------------

interface SummaryRow {
  id: string;
  owner_id: string;
  owner_username: string | null;
  owner_display_name: string | null;
  owner_avatar_url: string | null;
  title: string;
  description: string;
  kind: SpaceKind;
  visibility: SpaceVisibility;
  cover_url: string | null;
  cover_item_id: string | null;
  cover_item_url: string | null;
  preview_urls: string[] | null;
  image_count: number;
  prompt_count: number;
  note_count: number;
  member_count: number | null;
  my_role: SpaceRole | null;
  is_favorite: boolean;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export function mapSpaceSummary(row: SummaryRow): SpaceSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    owner: row.owner_username
      ? { id: row.owner_id, username: row.owner_username, displayName: row.owner_display_name ?? row.owner_username, avatarUrl: row.owner_avatar_url }
      : null,
    title: row.title,
    description: row.description ?? "",
    kind: row.kind,
    visibility: row.visibility,
    coverUrl: row.cover_url,
    coverItemId: row.cover_item_id ?? null,
    coverItemUrl: row.cover_item_url,
    previewUrls: row.preview_urls ?? [],
    imageCount: row.image_count ?? 0,
    promptCount: row.prompt_count ?? 0,
    noteCount: row.note_count ?? 0,
    memberCount: row.member_count,
    myRole: row.my_role,
    isFavorite: Boolean(row.is_favorite),
    lastOpenedAt: row.last_opened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

/** Kapak sanatı: seçilen kapak (yüklenen › seçilen görsel öğe) tek başına; yoksa son dört görselin kolajı (Space sayfasıyla aynı). */
export function summaryArt(summary: Pick<SpaceSummary, "coverUrl" | "coverItemUrl" | "previewUrls">): string[] {
  const chosen = summary.coverUrl ?? summary.coverItemUrl;
  return chosen ? [chosen] : summary.previewUrls;
}

/** Kapak: yüklenen kapak › seçilen görsel öğe › en yeni görsel. */
export function summaryCover(summary: Pick<SpaceSummary, "coverUrl" | "coverItemUrl" | "previewUrls">): string | null {
  return summary.coverUrl ?? summary.coverItemUrl ?? summary.previewUrls[0] ?? null;
}

export async function listSpaces({
  filter,
  query = "",
  sort = "updated",
  limit = SPACE_PAGE_SIZE,
  offset = 0,
}: {
  filter: SpaceFilter | "recent";
  query?: string;
  /** `recommended` yalnız Keşfet → Spaces'te (alıntı sayısı + en az 3 puan olan Space'te puan; docs/history/242-*). */
  sort?: SpaceSort | "recommended";
  limit?: number;
  offset?: number;
}): Promise<SpaceSummary[]> {
  const rows = await rpc<SummaryRow[]>("list_spaces", {
    p_filter: filter,
    p_query: query.trim() || null,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  });
  return (rows ?? []).map(mapSpaceSummary);
}

/**
 * Vitrin (docs/history/214-*): yalnız herkese açık + arşivlenmemiş Space'ler, bir sahibe (profil "Spaces" sekmesi) ya da bir
 * prompt'a (detaydaki "Bu prompt şu Space'lerde") göre. Okuma çağıranın RLS'inden geçer (engel iki yönlü).
 */
export async function listPublicSpaces({ ownerId, promptId, limit = SPACE_PAGE_SIZE }: { ownerId?: string; promptId?: string; limit?: number }): Promise<SpaceSummary[]> {
  const rows = await rpc<SummaryRow[]>("list_public_spaces", { p_owner: ownerId ?? null, p_prompt: promptId ?? null, p_limit: limit, p_offset: 0 });
  return (rows ?? []).map(mapSpaceSummary);
}

/**
 * Alıntı kartı / önizlemesi için Space (docs/history/215-*, 241-*): özet + ilk paletin renkleri. Eski gönderi alanları (`shared_at`,
 * beğeni/yorum sayıları) sunucuda duruyor ama kullanılmaz: Space'in kendi etkileşimi yok.
 */
export interface SpaceFeedCard extends SpaceSummary {
  palette: string[];
}

interface FeedCardRow extends SummaryRow {
  palette_colors: string[] | null;
}

/** Kimliklere göre Space önizleme kartları (`space_feed_cards`, INVOKER: okunamayan Space hiç gelmez). Sıra çağıranındır. */
export async function fetchSpaceFeedCards(ids: string[]): Promise<SpaceFeedCard[]> {
  if (ids.length === 0) return [];
  const rows = await rpc<FeedCardRow[]>("space_feed_cards", { p_ids: Array.from(new Set(ids)).slice(0, 100) });
  return (rows ?? []).map((row) => ({
    ...mapSpaceSummary(row),
    palette: row.palette_colors ?? [],
  }));
}

/** Her Space'in ilk paletinin renkleri (kartın palet çizgisi). Okunamayan Space'in paleti RLS ile hiç gelmez. */
export async function fetchLeadPalettes(spaceIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (spaceIds.length === 0) return result;
  const { data, error } = await supabase.from("space_palettes").select("space_id, colors").in("space_id", spaceIds).order("position").order("created_at");
  if (error) throw toSpaceError(error);
  for (const row of (data ?? []) as { space_id: string; colors: string[] | null }[]) {
    if (!result.has(row.space_id) && row.colors && row.colors.length > 0) result.set(row.space_id, row.colors);
  }
  return result;
}

export async function createSpace(input: {
  title: string;
  description: string;
  kind: SpaceKind;
  visibility: SpaceVisibility;
  groups: string[];
}): Promise<string> {
  return rpc<string>("create_space", {
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_kind: input.kind,
    p_visibility: input.visibility,
    p_groups: input.groups,
  });
}

/** Okunamayan (yok, özel, iptal edilmiş bağlantı…) Space için `null` — varlığı sızmaz. */
export async function fetchSpace(id: string): Promise<Space | null> {
  const { data, error } = await supabase.from("spaces").select(SPACE_COLS).eq("id", id).maybeSingle();
  if (error) throw toSpaceError(error);
  return data ? mapSpace(data as SpaceRow) : null;
}

/** Kartlar için sayaçlar (alıntı sayısı + puan); okuma Space'in RLS'ini izler, okunamayan hiç gelmez. */
export async function fetchSpaceStats(ids: string[]): Promise<Map<string, { quoteCount: number; ratingAvg: number; ratingCount: number }>> {
  const result = new Map<string, { quoteCount: number; ratingAvg: number; ratingCount: number }>();
  if (ids.length === 0) return result;
  const { data, error } = await supabase.from("spaces").select("id, quote_count, rating_avg, rating_count").in("id", ids);
  if (error) throw toSpaceError(error);
  for (const row of (data ?? []) as { id: string; quote_count: number | null; rating_avg: number | string | null; rating_count: number | null }[]) {
    result.set(row.id, { quoteCount: row.quote_count ?? 0, ratingAvg: Number(row.rating_avg ?? 0), ratingCount: row.rating_count ?? 0 });
  }
  return result;
}

/** Puan dağılımı (1–5 → kaç puan): yorum satırlarındaki `rating`ten; okuma Space'in RLS'ini izler (docs/history/242-*). */
export async function fetchSpaceRatingDistribution(spaceId: string): Promise<Record<1 | 2 | 3 | 4 | 5, number>> {
  const { data, error } = await supabase.from("prompt_comments").select("rating").eq("space_id", spaceId).not("rating", "is", null);
  if (error) throw toSpaceError(error);
  const out: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of (data ?? []) as { rating: number | null }[]) {
    if (row.rating && row.rating >= 1 && row.rating <= 5) out[row.rating as 1 | 2 | 3 | 4 | 5] += 1;
  }
  return out;
}

export async function fetchMyRole(spaceId: string, userId: string | null): Promise<SpaceRole | null> {
  if (!userId) return null;
  const { data, error } = await supabase.from("space_members").select("role").eq("space_id", spaceId).eq("user_id", userId).maybeSingle();
  if (error) throw toSpaceError(error);
  return (data?.role as SpaceRole | undefined) ?? null;
}

export async function fetchSpaceItems(spaceId: string): Promise<SpaceItem[]> {
  const { data, error } = await supabase.from("space_items").select(ITEM_COLS).eq("space_id", spaceId).order("z", { ascending: true }).limit(1000);
  if (error) throw toSpaceError(error);
  return (data ?? []).map((row) => mapSpaceItem(row as SpaceItemRow));
}

export async function fetchSpaceGroups(spaceId: string): Promise<SpaceGroup[]> {
  const { data, error } = await supabase.from("space_groups").select(GROUP_COLS).eq("space_id", spaceId).order("position").order("created_at");
  if (error) throw toSpaceError(error);
  return (data ?? []).map((row) => mapGroup(row as GroupRow));
}

export async function fetchSpacePalettes(spaceId: string): Promise<SpacePalette[]> {
  const { data, error } = await supabase.from("space_palettes").select(PALETTE_COLS).eq("space_id", spaceId).order("position").order("created_at");
  if (error) throw toSpaceError(error);
  return (data ?? []).map((row) => mapPalette(row as PaletteRow));
}

export type SpacePatch = Partial<Pick<Space, "title" | "description" | "kind" | "visibility" | "coverUrl" | "coverItemId" | "archivedAt" | "activityVisibility">>;

/** Yalnız sahip (RLS). Etkilenen satır yoksa yetki hatası — sessiz başarı yok. */
export async function updateSpace(id: string, patch: SpacePatch): Promise<Space> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title.trim();
  if (patch.description !== undefined) body.description = patch.description.trim();
  if (patch.kind !== undefined) body.kind = patch.kind;
  if (patch.visibility !== undefined) body.visibility = patch.visibility;
  if (patch.coverUrl !== undefined) body.cover_url = patch.coverUrl;
  if (patch.coverItemId !== undefined) body.cover_item_id = patch.coverItemId;
  if (patch.archivedAt !== undefined) body.archived_at = patch.archivedAt;
  if (patch.activityVisibility !== undefined) body.activity_visibility = patch.activityVisibility;
  const { data, error } = await supabase.from("spaces").update(body).eq("id", id).select(SPACE_COLS).maybeSingle();
  if (error) throw toSpaceError(error);
  if (!data) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
  return mapSpace(data as SpaceRow);
}

export async function deleteSpace(id: string): Promise<void> {
  const { data, error } = await supabase.from("spaces").delete().eq("id", id).select("id");
  if (error) throw toSpaceError(error);
  if (!data || data.length === 0) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
}

export async function setSpaceFavorite(spaceId: string, favorite: boolean): Promise<void> {
  await rpc("set_space_favorite", { p_space_id: spaceId, p_favorite: favorite });
}

/** "Son açılanlar" için; sonucu beklenmez, hatası sessizce yutulur (görüntülemeyi engellemez). */
export function touchSpace(spaceId: string): void {
  void supabase.rpc("touch_space", { p_space_id: spaceId }).then(() => undefined, () => undefined);
}

// ---------------------------------------------------------------------------------------------
// Öğeler
// ---------------------------------------------------------------------------------------------

export interface NewSpaceItem {
  id?: string;
  spaceId: string;
  kind: SpaceItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  groupId?: string | null;
  promptId?: string | null;
  mediaUrl?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  isDraft?: boolean;
  sourcePromptId?: string | null;
  contentType?: SpaceContentType | null;
  contentId?: string | null;
  paletteId?: string | null;
  title?: string;
  body?: string;
  note?: string;
  color?: SpaceColor;
  attachedItemId?: string | null;
  isPrivate?: boolean;
}

function itemInsertRow(item: NewSpaceItem, userId: string): Record<string, unknown> {
  return {
    // Kimlik istemcide üretilir: geri alınan silme aynı kimlikle geri gelir (ilişkili not/kapak bağlantıları korunur).
    id: item.id ?? crypto.randomUUID(),
    space_id: item.spaceId,
    kind: item.kind,
    x: Math.round(item.x),
    y: Math.round(item.y),
    w: Math.round(item.w),
    h: Math.round(item.h),
    z: item.z ?? 0,
    group_id: item.groupId ?? null,
    prompt_id: item.promptId ?? null,
    media_url: item.mediaUrl ?? null,
    media_width: item.mediaWidth ?? null,
    media_height: item.mediaHeight ?? null,
    is_draft: item.isDraft ?? false,
    source_prompt_id: item.sourcePromptId ?? null,
    content_type: item.contentType ?? null,
    content_id: item.contentId ?? null,
    palette_id: item.paletteId ?? null,
    title: item.title ?? "",
    body: item.body ?? "",
    note: item.note ?? "",
    color: item.color ?? "neutral",
    attached_item_id: item.attachedItemId ?? null,
    is_private: item.isPrivate ?? false,
    created_by: userId,
  };
}

export async function addSpaceItems(items: NewSpaceItem[], userId: string): Promise<SpaceItem[]> {
  if (items.length === 0) return [];
  const { data, error } = await supabase.from("space_items").insert(items.map((item) => itemInsertRow(item, userId))).select(ITEM_COLS);
  if (error) throw toSpaceError(error);
  if (!data || data.length !== items.length) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
  return data.map((row) => mapSpaceItem(row as SpaceItemRow));
}

/** Kaldırılmış bir öğeyi aynı kimlikle geri koyar (geri al). Kaynağı artık okunamıyorsa sunucu reddeder. */
export async function restoreSpaceItems(items: SpaceItem[], userId: string): Promise<SpaceItem[]> {
  return addSpaceItems(items, userId);
}

export type SpaceItemPatch = Partial<Pick<SpaceItem, "title" | "body" | "note" | "color" | "isPrivate" | "attachedItemId" | "groupId">>;

export async function updateSpaceItem(id: string, patch: SpaceItemPatch): Promise<SpaceItem> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.body !== undefined) body.body = patch.body;
  if (patch.note !== undefined) body.note = patch.note;
  if (patch.color !== undefined) body.color = patch.color;
  if (patch.isPrivate !== undefined) body.is_private = patch.isPrivate;
  if (patch.attachedItemId !== undefined) body.attached_item_id = patch.attachedItemId;
  if (patch.groupId !== undefined) body.group_id = patch.groupId;
  const { data, error } = await supabase.from("space_items").update(body).eq("id", id).select(ITEM_COLS).maybeSingle();
  if (error) throw toSpaceError(error);
  if (!data) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
  return mapSpaceItem(data as SpaceItemRow);
}

/** Silinen kimlikleri döner (başkası zaten silmişse eksik gelir; çağıran yine yerelden düşer). */
export async function deleteSpaceItems(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("space_items").delete().in("id", ids).select("id");
  if (error) throw toSpaceError(error);
  return (data ?? []).map((row) => (row as { id: string }).id);
}

export interface LayoutEntry {
  id: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
  /** `undefined` = grup değişmez; `null` = gruptan çıkar. */
  groupId?: string | null;
}

/** Toplu yerleşim kaydı (tek istek). Dönen = gerçekten güncellenen öğeler. */
export async function saveSpaceLayout(spaceId: string, entries: LayoutEntry[]): Promise<string[]> {
  if (entries.length === 0) return [];
  const payload = entries.map((entry) => ({
    id: entry.id,
    x: entry.x === undefined ? null : Math.round(entry.x),
    y: entry.y === undefined ? null : Math.round(entry.y),
    w: entry.w === undefined ? null : Math.round(entry.w),
    h: entry.h === undefined ? null : Math.round(entry.h),
    z: entry.z === undefined ? null : Math.round(entry.z),
    group_id: entry.groupId ?? null,
    set_group: entry.groupId !== undefined,
  }));
  const ids = await rpc<string[] | null>("space_save_layout", { p_space_id: spaceId, p_items: payload });
  return ids ?? [];
}

// ---------------------------------------------------------------------------------------------
// Gruplar + paletler
// ---------------------------------------------------------------------------------------------

export async function createSpaceGroup(spaceId: string, name: string, userId: string, position = 0, color: SpaceColor = "primary"): Promise<SpaceGroup> {
  const { data, error } = await supabase
    .from("space_groups")
    .insert({ id: crypto.randomUUID(), space_id: spaceId, name: name.trim(), position, color, created_by: userId })
    .select(GROUP_COLS)
    .maybeSingle();
  if (error) throw toSpaceError(error);
  if (!data) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
  return mapGroup(data as GroupRow);
}

export async function updateSpaceGroup(id: string, patch: { name?: string; color?: SpaceColor }): Promise<SpaceGroup> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.color !== undefined) body.color = patch.color;
  const { data, error } = await supabase.from("space_groups").update(body).eq("id", id).select(GROUP_COLS).maybeSingle();
  if (error) throw toSpaceError(error);
  if (!data) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
  return mapGroup(data as GroupRow);
}

/** Grubu siler; içindeki öğeler SİLİNMEZ, gruptan çıkar (sunucu: `on delete set null`). */
export async function deleteSpaceGroup(id: string): Promise<void> {
  const { data, error } = await supabase.from("space_groups").delete().eq("id", id).select("id");
  if (error) throw toSpaceError(error);
  if (!data || data.length === 0) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
}

export interface PaletteInput {
  name: string;
  description: string;
  colors: string[];
  source?: "manual" | "image";
  sourceItemId?: string | null;
}

export async function createSpacePalette(spaceId: string, input: PaletteInput, userId: string, position = 0): Promise<SpacePalette> {
  const { data, error } = await supabase
    .from("space_palettes")
    .insert({
      id: crypto.randomUUID(),
      space_id: spaceId,
      name: input.name.trim(),
      description: input.description.trim(),
      colors: input.colors,
      source: input.source ?? "manual",
      source_item_id: input.sourceItemId ?? null,
      position,
      created_by: userId,
    })
    .select(PALETTE_COLS)
    .maybeSingle();
  if (error) throw toSpaceError(error);
  if (!data) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
  return mapPalette(data as PaletteRow);
}

export async function updateSpacePalette(id: string, input: Partial<PaletteInput>): Promise<SpacePalette> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name.trim();
  if (input.description !== undefined) body.description = input.description.trim();
  if (input.colors !== undefined) body.colors = input.colors;
  if (input.source !== undefined) body.source = input.source;
  if (input.sourceItemId !== undefined) body.source_item_id = input.sourceItemId;
  const { data, error } = await supabase.from("space_palettes").update(body).eq("id", id).select(PALETTE_COLS).maybeSingle();
  if (error) throw toSpaceError(error);
  if (!data) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
  return mapPalette(data as PaletteRow);
}

export async function deleteSpacePalette(id: string): Promise<void> {
  const { data, error } = await supabase.from("space_palettes").delete().eq("id", id).select("id");
  if (error) throw toSpaceError(error);
  if (!data || data.length === 0) throw new SpaceError("space_forbidden", translateForRuntime("spaces.error.forbidden"));
}

// ---------------------------------------------------------------------------------------------
// Üyeler, davetler, bağlantı, etkinlik
// ---------------------------------------------------------------------------------------------

export async function fetchSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  const { data, error } = await supabase
    .from("space_members")
    .select(`user_id, role, created_at, profile:profiles!space_members_user_id_fkey(${PERSON_COLS})`)
    .eq("space_id", spaceId)
    .order("created_at");
  if (error) throw toSpaceError(error);
  const order: Record<SpaceRole, number> = { owner: 0, editor: 1, viewer: 2 };
  return (data ?? [])
    .map((row) => {
      const r = row as unknown as { user_id: string; role: SpaceRole; created_at: string; profile: PersonRow | null };
      return { userId: r.user_id, role: r.role, createdAt: r.created_at, profile: mapPerson(r.profile) };
    })
    .sort((a, b) => order[a.role] - order[b.role] || a.createdAt.localeCompare(b.createdAt));
}

export async function fetchPendingSpaceInvitations(spaceId: string): Promise<SpaceInvitation[]> {
  const { data, error } = await supabase
    .from("space_invitations")
    .select(`id, invitee_id, role, created_at, invitee:profiles!space_invitations_invitee_id_fkey(${PERSON_COLS})`)
    .eq("space_id", spaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw toSpaceError(error);
  return (data ?? []).map((row) => {
    const r = row as unknown as { id: string; invitee_id: string; role: "editor" | "viewer"; created_at: string; invitee: PersonRow | null };
    return { id: r.id, inviteeId: r.invitee_id, role: r.role, createdAt: r.created_at, invitee: mapPerson(r.invitee) };
  });
}

export async function fetchMySpaceInvitations(): Promise<MySpaceInvitation[]> {
  const rows = await rpc<
    {
      id: string;
      space_id: string;
      role: "editor" | "viewer";
      created_at: string;
      space_title: string;
      space_kind: SpaceKind;
      inviter_username: string | null;
      inviter_display_name: string | null;
      inviter_avatar_url: string | null;
    }[]
  >("my_space_invitations", {});
  return (rows ?? []).map((r) => ({
    id: r.id,
    spaceId: r.space_id,
    role: r.role,
    createdAt: r.created_at,
    spaceTitle: r.space_title,
    spaceKind: r.space_kind,
    inviter: r.inviter_username
      ? { username: r.inviter_username, displayName: r.inviter_display_name ?? r.inviter_username, avatarUrl: r.inviter_avatar_url }
      : null,
  }));
}

export async function inviteSpaceMember(spaceId: string, username: string, role: "editor" | "viewer"): Promise<string> {
  return rpc<string>("invite_space_member", { p_space_id: spaceId, p_username: username.trim().replace(/^@/, ""), p_role: role });
}

export async function respondSpaceInvitation(invitationId: string, accept: boolean): Promise<string> {
  return rpc<string>("respond_space_invitation", { p_invitation_id: invitationId, p_accept: accept });
}

export async function revokeSpaceInvitation(invitationId: string): Promise<void> {
  await rpc("revoke_space_invitation", { p_invitation_id: invitationId });
}

export async function setSpaceMemberRole(spaceId: string, userId: string, role: "editor" | "viewer"): Promise<void> {
  await rpc("set_space_member_role", { p_space_id: spaceId, p_user_id: userId, p_role: role });
}

/** Sahip çıkarır ya da üye kendisi ayrılır. */
export async function removeSpaceMember(spaceId: string, userId: string): Promise<void> {
  await rpc("remove_space_member", { p_space_id: spaceId, p_user_id: userId });
}

export async function createSpaceLink(spaceId: string): Promise<{ token: string; createdAt: string }> {
  const data = await rpc<{ token: string; created_at: string }>("create_space_link", { p_space_id: spaceId });
  return { token: data.token, createdAt: data.created_at };
}

export async function revokeSpaceLink(spaceId: string): Promise<number> {
  return rpc<number>("revoke_space_link", { p_space_id: spaceId });
}

export async function fetchSpaceLinkStatus(spaceId: string): Promise<{ createdAt: string; openedCount: number } | null> {
  const rows = await rpc<{ active: boolean; created_at: string; opened_count: number }[]>("space_link_status", { p_space_id: spaceId });
  const row = rows?.[0];
  return row ? { createdAt: row.created_at, openedCount: row.opened_count } : null;
}

export async function openSpaceLink(token: string): Promise<string> {
  return rpc<string>("open_space_link", { p_token: token });
}

const ACTIVITY_COLS = `id, action, label, count, created_at, actor_id, details, author_note, comment_count, actor:profiles!space_activity_actor_id_fkey(${PERSON_COLS})`;

interface ActivityRow {
  id: string;
  action: SpaceActivityAction;
  label: string | null;
  count: number;
  created_at: string;
  actor_id: string | null;
  details: SpaceActivityDetails | null;
  author_note: string | null;
  comment_count: number | null;
  actor: PersonRow | null;
}

function mapActivity(r: ActivityRow): SpaceActivity {
  return {
    id: r.id,
    action: r.action,
    label: r.label,
    count: r.count,
    createdAt: r.created_at,
    actor: mapPerson(r.actor),
    actorId: r.actor_id,
    details: r.details ?? null,
    authorNote: r.author_note,
    commentCount: r.comment_count ?? 0,
  };
}

export async function fetchSpaceActivity(spaceId: string, limit = 30): Promise<SpaceActivity[]> {
  const { data, error } = await supabase
    .from("space_activity")
    .select(ACTIVITY_COLS)
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw toSpaceError(error);
  return (data ?? []).map((row) => mapActivity(row as unknown as ActivityRow));
}

/** Tek etkinlik + bir önceki / bir sonraki (etkinlik sayfasındaki "önceki etkinliğe dön" için). Okunamayan etkinlik `null` döner. */
export async function fetchSpaceActivityEvent(spaceId: string, activityId: string): Promise<{ event: SpaceActivity; previous: SpaceActivity | null; next: SpaceActivity | null } | null> {
  const { data, error } = await supabase.from("space_activity").select(ACTIVITY_COLS).eq("space_id", spaceId).eq("id", activityId).maybeSingle();
  if (error) throw toSpaceError(error);
  if (!data) return null;
  const event = mapActivity(data as unknown as ActivityRow);
  const [older, newer] = await Promise.all([
    supabase.from("space_activity").select(ACTIVITY_COLS).eq("space_id", spaceId).lt("created_at", event.createdAt).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("space_activity").select(ACTIVITY_COLS).eq("space_id", spaceId).gt("created_at", event.createdAt).order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  return {
    event,
    previous: older.data ? mapActivity(older.data as unknown as ActivityRow) : null,
    next: newer.data ? mapActivity(newer.data as unknown as ActivityRow) : null,
  };
}

/** Etkinliğe not (yalnız değişikliği yapan; en çok 280 karakter, boş not siler). */
export async function setSpaceActivityNote(activityId: string, note: string): Promise<void> {
  await rpc("set_space_activity_note", { p_activity_id: activityId, p_note: note });
}

// ---------------------------------------------------------------------------------------------
// Görsel yükleme + kaynak içerik
// ---------------------------------------------------------------------------------------------

/**
 * Kullanıcının kendi görselini (referans/kapak) Space'in klasörüne yükler: `space-media/{space}/{uuid}.jpg`. Fotoğraf reddedilmez,
 * bayt bütçesine kadar küçülür (`image-processing.ts`). Dönen URL kimliktir; gösterirken signed URL'ye çevrilir.
 */
export async function uploadSpaceImage(spaceId: string, file: File): Promise<{ url: string; width: number; height: number }> {
  const { blob, width, height, contentType } = await resizeImageToBlob(file);
  const path = `${spaceId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(SPACE_MEDIA_BUCKET).upload(path, blob, { contentType, upsert: false });
  if (error) throw new SpaceError("generic", translateForRuntime("spaces.error.upload"));
  return { url: supabase.storage.from(SPACE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl, width, height };
}

export interface SpaceSources {
  prompts: Map<string, Prompt>;
  requests: Map<string, PromptRequest>;
  workflows: Map<string, Workflow>;
  presets: Map<string, Preset>;
}

export function emptySources(): SpaceSources {
  return { prompts: new Map(), requests: new Map(), workflows: new Map(), presets: new Map() };
}

/**
 * Öğelerin başvurduğu Promptly içeriği, OKUYUCUNUN kendi yetkisiyle (RLS). Dönmeyen kaynak = bu okuyucu için erişilemez
 * (gizlendi/silindi/engel) — öğe yer tutucuyla çizilir, içerik hiçbir yoldan gösterilmez.
 */
export async function fetchSpaceSources(items: SpaceItem[]): Promise<SpaceSources> {
  const promptIds = new Set<string>();
  const ids: Record<SpaceContentType, Set<string>> = { request: new Set(), workflow: new Set(), preset: new Set() };
  for (const item of items) {
    if (item.promptId) promptIds.add(item.promptId);
    if (item.sourcePromptId) promptIds.add(item.sourcePromptId);
    if (item.kind === "content" && item.contentType && item.contentId) ids[item.contentType].add(item.contentId);
  }
  const [prompts, requests, workflows, presets] = await Promise.all([
    promptIds.size
      ? supabase
          .from("prompts")
          .select(PROMPT_SELECT)
          .in("id", [...promptIds])
          .then(({ data, error }) => {
            if (error) throw toSpaceError(error);
            return (data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow)).filter((p) => !p.deletedAt);
          })
      : Promise.resolve([] as Prompt[]),
    ids.request.size ? fetchRequestsByIds([...ids.request]) : Promise.resolve([] as PromptRequest[]),
    ids.workflow.size ? fetchWorkflowsByIds([...ids.workflow]) : Promise.resolve([] as Workflow[]),
    ids.preset.size ? fetchPresetsByIds([...ids.preset]) : Promise.resolve([] as Preset[]),
  ]);
  return {
    prompts: new Map(prompts.map((p) => [p.id, p])),
    requests: new Map(requests.map((r) => [r.id, r])),
    workflows: new Map(workflows.map((w) => [w.id, w])),
    presets: new Map(presets.map((p) => [p.id, p])),
  };
}

/** Kullanıcının ekleyebildiği (sahip/düzenleyici, arşivlenmemiş) Space'leri — "Space'e ekle" penceresi. */
export async function listEditableSpaces(): Promise<SpaceSummary[]> {
  const all = await listSpaces({ filter: "all", sort: "opened", limit: 60 });
  return all.filter((space) => space.myRole === "owner" || space.myRole === "editor");
}

/** Bir Space'te bu kaynağın zaten olup olmadığı (yinelenen ekleme uyarısı). */
export async function findExistingItems(spaceIds: string[], ref: { promptId?: string; mediaUrl?: string; contentId?: string }): Promise<Set<string>> {
  if (spaceIds.length === 0) return new Set();
  let query = supabase.from("space_items").select("space_id").in("space_id", spaceIds);
  if (ref.mediaUrl) query = query.eq("kind", "image").eq("media_url", ref.mediaUrl);
  else if (ref.promptId) query = query.eq("kind", "prompt").eq("is_draft", false).eq("prompt_id", ref.promptId);
  else if (ref.contentId) query = query.eq("kind", "content").eq("content_id", ref.contentId);
  else return new Set();
  const { data, error } = await query;
  if (error) return new Set();
  return new Set((data ?? []).map((row) => (row as { space_id: string }).space_id));
}

/** Liste satırından (kart menüsü) ayar penceresinin beklediği Space modeli. */
export function spaceFromSummary(summary: SpaceSummary): Space {
  return {
    id: summary.id,
    ownerId: summary.ownerId,
    title: summary.title,
    description: summary.description,
    kind: summary.kind,
    visibility: summary.visibility,
    coverUrl: summary.coverUrl,
    coverItemId: summary.coverItemId,
    archivedAt: summary.archivedAt,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    updatedBy: null,
    quoteCount: 0,
    ratingAvg: 0,
    ratingCount: 0,
    commentCount: 0,
    activityVisibility: "everyone",
  };
}

/** Sahip kartı için herkese açık profil alanları (üye olmayan da sahibi görür; üye listesi görmez). */
export async function fetchSpacePerson(userId: string): Promise<SpacePerson | null> {
  const { data, error } = await supabase.from("profiles").select(PERSON_COLS).eq("id", userId).maybeSingle();
  if (error) return null;
  return mapPerson(data as PersonRow | null);
}

export async function fetchSpaceFavorite(spaceId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase.from("space_user_state").select("favorite").eq("space_id", spaceId).eq("user_id", userId).maybeSingle();
  return Boolean((data as { favorite?: boolean } | null)?.favorite);
}
