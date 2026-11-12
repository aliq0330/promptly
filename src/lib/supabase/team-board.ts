import { supabase } from "./client";
import { SPACE_MEDIA_BUCKET, SpaceError, fetchSpaceItems, toSpaceError, type SpaceItem } from "./spaces";
import { parseProtectedMediaUrl } from "./media-url";
import { rpc as teamRpc } from "./teams";
import { createBoard, createBoardInGroup } from "./team-projects";
import { translateForRuntime } from "@/lib/i18n/runtime";
import { copyTitle } from "@/lib/team-board";
import { chunk } from "./paged";
import type { TeamCreateKind } from "@/lib/team-create";

/**
 * Ekip panosu veri katmanı (docs/history/367-*): konumlu yorumlar, panolar arası taşıma/kopyalama, sıralama, çoğaltma.
 * Yazma yalnız SECURITY DEFINER RPC'dir (sunucu rol/onay kurallarını uygular); okuma RLS'e dayanır.
 */

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toSpaceError(error);
  return data as T;
}

// ---------------------------------------------------------------------------------------------
// Konumlu yorumlar
// ---------------------------------------------------------------------------------------------

export interface PinAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PinComment {
  id: string;
  spaceId: string;
  parentId: string | null;
  authorId: string | null;
  author: PinAuthor | null;
  body: string;
  x: number | null;
  y: number | null;
  itemId: string | null;
  offX: number | null;
  offY: number | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  editedAt: string | null;
  createdAt: string;
}

interface PinRow {
  id: string;
  space_id: string;
  parent_id: string | null;
  author_id: string | null;
  body: string;
  x: number | null;
  y: number | null;
  item_id: string | null;
  off_x: number | null;
  off_y: number | null;
  resolved_at: string | null;
  resolved_by: string | null;
  edited_at: string | null;
  created_at: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

const PIN_COLS = "id, space_id, parent_id, author_id, body, x, y, item_id, off_x, off_y, resolved_at, resolved_by, edited_at, created_at, author:author_id(id, username, display_name, avatar_url)";

export function mapPinComment(row: PinRow): PinComment {
  return {
    id: row.id,
    spaceId: row.space_id,
    parentId: row.parent_id,
    authorId: row.author_id,
    author: row.author ? { id: row.author.id, username: row.author.username, displayName: row.author.display_name, avatarUrl: row.author.avatar_url } : null,
    body: row.body,
    x: row.x === null ? null : Number(row.x),
    y: row.y === null ? null : Number(row.y),
    itemId: row.item_id,
    offX: row.off_x === null ? null : Number(row.off_x),
    offY: row.off_y === null ? null : Number(row.off_y),
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

/** Bir panonun yorumları (okuyucunun RLS'iyle: görünmeyen taslağa bağlı yorum gelmez). En çok 1000 satır: sınır sunucuda (500 kök + yanıtlar). */
export async function fetchPinComments(spaceId: string): Promise<PinComment[]> {
  const { data, error } = await supabase.from("space_pin_comments").select(PIN_COLS).eq("space_id", spaceId).order("created_at", { ascending: true }).limit(1000);
  if (error) {
    // Eski veritabanı (tablo yok): yorum özelliği yok sayılır, pano çalışır.
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw toSpaceError(error);
  }
  return (data ?? []).map((row) => mapPinComment(row as unknown as PinRow));
}

export interface NewPinComment {
  spaceId: string;
  body: string;
  x?: number;
  y?: number;
  itemId?: string | null;
  offX?: number | null;
  offY?: number | null;
  parentId?: string | null;
}

export async function createPinComment(input: NewPinComment): Promise<string> {
  const id = crypto.randomUUID();
  await call<string>("pin_comment_create", {
    p_space: input.spaceId,
    p_body: input.body,
    p_x: input.x ?? null,
    p_y: input.y ?? null,
    p_item: input.itemId ?? null,
    p_off_x: input.offX ?? null,
    p_off_y: input.offY ?? null,
    p_parent: input.parentId ?? null,
    p_id: id,
  });
  return id;
}

export const updatePinComment = (id: string, body: string) => call<void>("pin_comment_update", { p_id: id, p_body: body });
export const setPinResolved = (id: string, resolved: boolean) => call<void>("pin_comment_set_resolved", { p_id: id, p_resolved: resolved });
export const deletePinComment = (id: string) => call<void>("pin_comment_delete", { p_id: id });

// ---------------------------------------------------------------------------------------------
// Pano grubu: sıra, taşı / kopyala, çoğalt
// ---------------------------------------------------------------------------------------------

export const reorderBoards = (projectId: string, fileId: string | null, ids: string[]) => teamRpc<void>("team_reorder_boards", { p_project: projectId, p_file: fileId, p_ids: ids });

export interface TransferResult {
  done: number;
  skipped: number;
  oldIds: string[];
  newIds: string[];
}

/** Uploaded (`space-media/{alan}/…`) görsel dosyasını hedef alanın klasörüne kopyalar; eski kimlik URL'si → yeni kimlik URL'si. */
async function copyBoardMedia(items: readonly SpaceItem[], fromSpace: string, toSpace: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const item of items) {
    if (item.kind !== "image" || !item.mediaUrl || !item.mediaUrl.includes(`/space-media/${fromSpace}/`) || map[item.mediaUrl]) continue;
    const parsed = parseProtectedMediaUrl(item.mediaUrl);
    if (!parsed || parsed.bucket !== SPACE_MEDIA_BUCKET) continue;
    const name = parsed.path.split("/").pop() ?? "";
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : ".jpg";
    const target = `${toSpace}/${crypto.randomUUID()}${ext}`;
    const { error } = await supabase.storage.from(SPACE_MEDIA_BUCKET).copy(parsed.path, target);
    if (error) throw new SpaceError("generic", translateForRuntime("spaces.error.upload"));
    map[item.mediaUrl] = supabase.storage.from(SPACE_MEDIA_BUCKET).getPublicUrl(target).data.publicUrl;
  }
  return map;
}

/**
 * Öğeleri başka panoya taşır ya da kopyalar. Görsel dosyaları önce hedef klasöre kopyalanır; sunucu (`team_transfer_items`) rol/onay kurallarını uygular
 * ve atlananları sayar. Dosya kopyası yarıda kalırsa hiçbir öğe değişmez (yetim dosya yetim süpürücüye kalır).
 */
export async function transferItems(args: { fromSpace: string; toSpace: string; items: readonly SpaceItem[]; copy: boolean }): Promise<TransferResult> {
  const media = await copyBoardMedia(args.items, args.fromSpace, args.toSpace);
  const data = await call<{ done: number; skipped: number; old_ids: string[]; new_ids: string[] }>("team_transfer_items", {
    p_from: args.fromSpace,
    p_to: args.toSpace,
    p_ids: args.items.map((item) => item.id),
    p_copy: args.copy,
    p_media: media,
  });
  return { done: data.done, skipped: data.skipped, oldIds: data.old_ids ?? [], newIds: data.new_ids ?? [] };
}

/**
 * Panoyu çoğaltır: yeni pano + tüm öğelerin (ve aralarındaki okların) kopyası. Kopya aynı GRUBA girer (panonun bir grubu varsa ya da `grouped` ise);
 * dosyanın eski ana alanı (pano değil) çoğaltılırsa kopya bağımsız pano olur. Onay açıksa düzenleyicinin kopyası taslak başlar.
 */
export async function duplicateBoard(args: { projectId: string; fileId: string | null; fromSpace: string; title: string; suffix: string; asBoard: boolean }): Promise<string> {
  const items = await fetchSpaceItems(args.fromSpace);
  const title = copyTitle(args.title, args.suffix);
  const id = args.asBoard ? await createBoardInGroup(args.fromSpace, title) : await createBoard(args.projectId, title, args.fileId ?? "");
  // 200'lük parçalar: sunucu tek çağrıda en çok 200 öğe alır.
  for (let i = 0; i < items.length; i += 200) await transferItems({ fromSpace: args.fromSpace, toSpace: id, items: items.slice(i, i + 200), copy: true });
  return id;
}

// ---------------------------------------------------------------------------------------------
// Küçük resim (genel bakış / pano menüsü)
// ---------------------------------------------------------------------------------------------

export interface ThumbItem {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const thumbCache = new Map<string, { at: number; items: ThumbItem[] }>();
const THUMB_TTL_MS = 60_000;

/** Bir panonun öğe kutuları (yalnız konum/tür; RLS: taslak görünürlüğü korunur). 60 sn önbellek. */
export async function fetchBoardThumb(spaceId: string, force = false): Promise<ThumbItem[]> {
  const cached = thumbCache.get(spaceId);
  if (!force && cached && Date.now() - cached.at < THUMB_TTL_MS) return cached.items;
  const { data, error } = await supabase.from("space_items").select("kind, x, y, w, h").eq("space_id", spaceId).limit(500);
  if (error) throw toSpaceError(error);
  const items = (data ?? []).map((row) => ({ kind: String(row.kind), x: Number(row.x), y: Number(row.y), w: Number(row.w), h: Number(row.h) }));
  thumbCache.set(spaceId, { at: Date.now(), items });
  return items;
}

export function clearBoardThumbs(): void {
  thumbCache.clear();
}

// ---------------------------------------------------------------------------------------------
// Dosya asıl, pano yansıma (docs/history/376-*)
// ---------------------------------------------------------------------------------------------

export interface PlaceResult {
  placed: number;
  skipped: number;
  /** Panoda açılan yansıma satırlarının kimlikleri. */
  ids: string[];
}

/** Dosyadaki öğeleri panoya yerleştirir (yansıma kurar; aynı öğe aynı panoda zaten varsa atlanır). Yansıma kimliği verilse bile asıl öğe yerleştirilir. */
export async function placeItems(boardId: string, itemIds: readonly string[], at?: { x: number; y: number }): Promise<PlaceResult> {
  const out: PlaceResult = { placed: 0, skipped: 0, ids: [] };
  // Sunucu tek çağrıda en çok 200 öğe alır.
  for (const part of chunk([...itemIds], 200)) {
    const data = await call<{ placed: number; skipped: number; ids: string[] }>("team_board_place_items", {
      p_board: boardId,
      p_items: part,
      p_x: at?.x ?? null,
      p_y: at?.y ?? null,
    });
    out.placed += data.placed;
    out.skipped += data.skipped;
    out.ids.push(...(data.ids ?? []));
  }
  return out;
}

/** Dosyadan sil: asıl öğe ve bütün yansımaları gider (panodan kaldırmak değil — o, yansıma satırını düz silmektir). Yansıma kimliği de verilebilir. */
export async function deleteFileItem(itemId: string): Promise<void> {
  await call<void>("team_item_delete", { p_item: itemId });
}

export interface AttachResult {
  itemId: string;
  boardItemId: string | null;
  /** Aynı içerik dosyada zaten vardı; yeni asıl öğe açılmadı. */
  existing: boolean;
}

/** Yayınlanmış içeriği (herkese açık başvuru ya da bu dosyaya özgü içerik) dosyaya, istenirse panoya da ekler. */
export async function attachContent(args: { fileId: string; type: TeamCreateKind; id: string; boardId?: string | null }): Promise<AttachResult> {
  const data = await call<{ item_id: string; board_item_id: string | null; existing: boolean }>("team_attach_content", {
    p_file: args.fileId,
    p_type: args.type,
    p_id: args.id,
    p_board: args.boardId ?? null,
  });
  return { itemId: data.item_id, boardItemId: data.board_item_id ?? null, existing: Boolean(data.existing) };
}

/** Asıl öğe → öğenin gösterildiği panoların kimlikleri (RLS: görünmeyen taslak yansıması çıkmaz). */
export async function fetchPlacements(itemIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const part of chunk([...new Set(itemIds)], 100)) {
    const { data, error } = await supabase.from("space_items").select("file_item_id, space_id").in("file_item_id", part).limit(1000);
    if (error) throw toSpaceError(error);
    for (const row of (data ?? []) as { file_item_id: string | null; space_id: string }[]) {
      if (!row.file_item_id) continue;
      out.set(row.file_item_id, [...(out.get(row.file_item_id) ?? []), row.space_id]);
    }
  }
  return out;
}

export interface ContentLocation {
  teamId: string;
  projectId: string;
  fileId: string;
  itemId: string | null;
}

/** Ekibe özgü içeriğin yeri (içerik sayfası dosyadaki öğeye yönlenir). Ekibe özgü değilse ya da erişim yoksa null. */
export async function fetchContentLocation(type: TeamCreateKind, id: string): Promise<ContentLocation | null> {
  const { data, error } = await supabase.rpc("team_content_location", { p_type: type, p_id: id });
  if (error || !data) return null;
  const row = data as { team_id: string; project_id: string; file_id: string; item_id: string | null };
  return { teamId: row.team_id, projectId: row.project_id, fileId: row.file_id, itemId: row.item_id ?? null };
}
