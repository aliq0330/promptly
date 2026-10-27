/**
 * Promptly Spaces'in SAF kuralları (docs/history/213-*): türler, sekmeler, rol → arayüz yetkisi, adresler, öğe boyutları ve
 * kaynak durumları. Çerçeveden bağımsızdır, `npm test` ile sınanır (`spaces.test.ts`).
 *
 * ÖNEMLİ: buradaki yetki fonksiyonları yalnızca arayüzün NE GÖSTERECEĞİNİ belirler. Gerçek yetki veritabanındadır
 * (`can_read_space` / `can_edit_space` + RLS + RPC: `supabase/migrations/20260921130000_spaces.sql`).
 */
import type { TranslationKey } from "@/lib/i18n/translations";

export type SpaceKind = "moodboard" | "character" | "brand" | "game_world" | "interior" | "free";
export type SpaceVisibility = "private" | "link" | "public";
export type SpaceRole = "owner" | "editor" | "viewer";
export type SpaceItemKind = "image" | "prompt" | "note" | "palette" | "content";
export type SpaceContentType = "request" | "workflow" | "preset";
/** Not/grup rengi: palet token'ına eşlenir (hex DEĞİL — tema ve paletle birlikte değişir). */
export type SpaceColor = "primary" | "secondary" | "success" | "warning" | "danger" | "neutral";
export type SpaceTab = "overview" | "board" | "images" | "prompts" | "palette" | "notes" | "comments" | "activity" | "members";
/** Etkinlik geçmişini kimin görebileceği (docs/history/242-*): varsayılan herkes (Space'i okuyan), sahibi "yalnız üyeler"e çevirebilir. */
export type SpaceActivityVisibility = "everyone" | "members";
export type SpaceFilter = "all" | "mine" | "shared" | "favorites" | "public" | "archived";
export type SpaceSort = "updated" | "opened" | "created" | "title";

export const SPACE_KINDS: readonly SpaceKind[] = ["moodboard", "character", "brand", "game_world", "interior", "free"];
export const SPACE_VISIBILITIES: readonly SpaceVisibility[] = ["private", "link", "public"];
export const SPACE_TABS: readonly SpaceTab[] = ["overview", "board", "images", "prompts", "palette", "notes", "comments", "activity", "members"];
export const SPACE_FILTERS: readonly SpaceFilter[] = ["all", "mine", "shared", "favorites", "public", "archived"];
export const SPACE_SORTS: readonly SpaceSort[] = ["updated", "opened", "created", "title"];
export const SPACE_COLORS: readonly SpaceColor[] = ["neutral", "primary", "secondary", "success", "warning", "danger"];

export const SPACE_TITLE_MAX = 80;
export const SPACE_DESCRIPTION_MAX = 500;
export const SPACE_GROUP_NAME_MAX = 40;
export const SPACE_ITEM_TITLE_MAX = 120;
export const SPACE_ITEM_BODY_MAX = 8000;
export const SPACE_ITEM_NOTE_MAX = 2000;
export const SPACE_PALETTE_NAME_MAX = 60;
export const SPACE_PALETTE_DESCRIPTION_MAX = 300;
export const SPACE_PALETTE_COLORS_MAX = 24;
export const SPACE_ITEMS_MAX = 500;
export const SPACE_PAGE_SIZE = 24;

export const SPACE_KIND_LABEL: Record<SpaceKind, TranslationKey> = {
  moodboard: "spaces.kind.moodboard",
  character: "spaces.kind.character",
  brand: "spaces.kind.brand",
  game_world: "spaces.kind.game_world",
  interior: "spaces.kind.interior",
  free: "spaces.kind.free",
};

export const SPACE_VISIBILITY_LABEL: Record<SpaceVisibility, TranslationKey> = {
  private: "spaces.visibility.private",
  link: "spaces.visibility.link",
  public: "spaces.visibility.public",
};

export const SPACE_ROLE_LABEL: Record<SpaceRole, TranslationKey> = {
  owner: "spaces.role.owner",
  editor: "spaces.role.editor",
  viewer: "spaces.role.viewer",
};

export const SPACE_TAB_LABEL: Record<SpaceTab, TranslationKey> = {
  overview: "spaces.tab.overview",
  board: "spaces.tab.board",
  images: "spaces.tab.images",
  prompts: "spaces.tab.prompts",
  palette: "spaces.tab.palette",
  notes: "spaces.tab.notes",
  comments: "spaces.tab.comments",
  activity: "spaces.tab.activity",
  members: "spaces.tab.members",
};

/**
 * "Hazır pano düzeni" şablonları: türün başlangıç grupları (adları oluşturma anında kullanıcının dilinde yazılır; DB'de saklanan ad
 * kullanıcı içeriği gibi davranır, sonradan çevrilmez). Tür ayrı bir veri modeli değildir — yalnız bir etiket + bu başlangıç.
 */
export const SPACE_TEMPLATE_GROUPS: Record<SpaceKind, TranslationKey[]> = {
  moodboard: ["spaces.group.references", "spaces.group.colorStyle", "spaces.group.done"],
  character: ["spaces.group.characters", "spaces.group.places", "spaces.group.objects", "spaces.group.references"],
  brand: ["spaces.group.logo", "spaces.group.colorStyle", "spaces.group.typography", "spaces.group.references"],
  game_world: ["spaces.group.characters", "spaces.group.places", "spaces.group.objects", "spaces.group.lore"],
  interior: ["spaces.group.rooms", "spaces.group.materials", "spaces.group.furniture", "spaces.group.references"],
  free: ["spaces.group.references", "spaces.group.done"],
};

export function isSpaceTab(value: string | null | undefined): value is SpaceTab {
  return SPACE_TABS.includes(value as SpaceTab);
}

export function isSpaceFilter(value: string | null | undefined): value is SpaceFilter {
  return SPACE_FILTERS.includes(value as SpaceFilter);
}

export function spaceHref(id: string, tab?: SpaceTab): string {
  return `/spaces/local?id=${encodeURIComponent(id)}${tab && tab !== "overview" ? `&tab=${tab}` : ""}`;
}

/** Bir etkinliğin özet sayfası (Etkinlik sekmesi + `event`; docs/history/242-*). */
export function spaceActivityHref(spaceId: string, activityId: string): string {
  return `${spaceHref(spaceId, "activity")}&event=${encodeURIComponent(activityId)}`;
}

/** Paylaşım bağlantısının açılış sayfası; token URL parçasında (sunucuya/günlüklere gitmez). */
export function spaceLinkHref(token: string): string {
  return `/spaces/link#${token}`;
}

export function parseSpaceLinkToken(hash: string): string | null {
  const token = hash.replace(/^#/, "").trim();
  return /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}

/** Arayüz yetkisi (göster/gizle). Arşivlenen Space herkes için salt-okunurdur. */
export function spaceCapabilities(role: SpaceRole | null, archived: boolean, activityVisibility: SpaceActivityVisibility = "members") {
  const member = role !== null;
  const editor = (role === "owner" || role === "editor") && !archived;
  return {
    member,
    edit: editor,
    owner: role === "owner",
    manageMembers: role === "owner" && !archived,
    share: role === "owner" && !archived,
    archive: role === "owner",
    delete: role === "owner",
    // Etkinlik: üyeye her zaman; "herkes" ayarında Space'i okuyan herkese (ziyaretçi dahil).
    seeActivity: member || activityVisibility === "everyone",
    seePrivateNotes: member,
    leave: member && role !== "owner",
  };
}

export type SpaceCapabilities = ReturnType<typeof spaceCapabilities>;

/** Panoya yeni eklenen öğenin varsayılan boyutu (dünya birimi). Görsel kendi oranını korur, uzun kenar 260. */
export function defaultItemSize(kind: SpaceItemKind, media?: { width: number | null; height: number | null } | null): { w: number; h: number } {
  if (kind === "image") {
    const width = media?.width ?? 0;
    const height = media?.height ?? 0;
    if (width > 0 && height > 0) {
      const ratio = width / height;
      return ratio >= 1 ? { w: 260, h: Math.max(80, Math.round(260 / ratio)) } : { w: Math.max(80, Math.round(260 * ratio)), h: 260 };
    }
    return { w: 240, h: 240 };
  }
  if (kind === "prompt") return { w: 280, h: 200 };
  if (kind === "note") return { w: 220, h: 180 };
  if (kind === "palette") return { w: 280, h: 150 };
  return { w: 260, h: 160 };
}

/**
 * Bir öğenin kaynağının durumu:
 *  - `own`: kullanıcının kendi notu / taslağı / yüklediği görsel (kaynağı yok);
 *  - `ok`: kaynak gönderi okunuyor;
 *  - `unavailable`: kaynak var ama bu okuyucu göremiyor (gizlendi, taslağa döndü, engel…) — içeriği gösterilmez;
 *  - `deleted`: kaynak silindi (başvuru boşaldı).
 */
export type SourceState = "own" | "ok" | "unavailable" | "deleted";

export function sourceStateOf(
  item: { kind: SpaceItemKind; promptId: string | null; mediaUrl: string | null; isDraft: boolean; contentId: string | null },
  readable: (id: string) => boolean,
): SourceState {
  if (item.kind === "note" || item.kind === "palette") return "own";
  if (item.kind === "prompt" && item.isDraft) return "own";
  if (item.kind === "image" && !item.promptId) return item.mediaUrl?.includes("/space-media/") ? "own" : "deleted";
  if (item.kind === "content") return item.contentId && readable(item.contentId) ? "ok" : "unavailable";
  if (!item.promptId) return "deleted";
  return readable(item.promptId) ? "ok" : "unavailable";
}

/** Sunucunun `raise exception` kodları → çeviri anahtarı (bilinmeyen → genel hata; ham SQL metni asla gösterilmez). */
export const SPACE_ERROR_CODES = [
  "not_authenticated",
  "space_not_found",
  "space_forbidden",
  "space_limit",
  "space_title_required",
  "space_invalid",
  "space_user_not_found",
  "space_already_member",
  "space_invite_exists",
  "space_invite_not_found",
  "space_self_invite",
  "space_member_limit",
  "space_member_not_found",
  "space_link_invalid",
  "space_not_link_visible",
  "space_archived",
  "space_item_limit",
  "space_connection_limit",
  "space_group_limit",
  "space_palette_limit",
  "space_source_unavailable",
  "space_duplicate",
  "space_not_public",
  "space_too_empty",
  "space_rating_owner",
] as const;
export type SpaceErrorCode = (typeof SPACE_ERROR_CODES)[number];

export function extractSpaceErrorCode(error: { message?: string; code?: string } | null | undefined): SpaceErrorCode | null {
  if (!error) return null;
  if (error.code === "23505" || /duplicate key|space_items_unique_/.test(error.message ?? "")) return "space_duplicate";
  const message = error.message ?? "";
  // Uzun kodlar önce: "space_invite_exists" ile "space_invite_not_found" gibi önek çakışmaları olmasın.
  const sorted = [...SPACE_ERROR_CODES].sort((a, b) => b.length - a.length);
  return sorted.find((code) => new RegExp(`(^|[^a-z_])${code}($|[^a-z_])`).test(message)) ?? null;
}

/** Arama: büyük/küçük harf ve Türkçe İ/ı farkı gözetmeden metin eşleşmesi (galeri/prompt/not süzgeçleri istemcide). */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = foldText(query.trim());
  if (!needle) return true;
  return fields.some((field) => field && foldText(field).includes(needle));
}

function foldText(value: string): string {
  return value.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");
}
