import { supabase } from "./client";
import { parseProtectedMediaUrl } from "./media-url";
import type { PlanItem, PlanPin } from "@/lib/space-copy-plan";
import { toSpaceError, uploadSpaceImage } from "./spaces";

/**
 * Space ↔ Space ↔ ekip dosyası köprüsü (docs/history/461-*): öğeleri bir alandan başka bir alana kopyalar (`space_copy_items`, SECURITY INVOKER —
 * kaynağı çağıranın RLS'i okur, hedefe yazma çağıranın yetkisiyle olur). Görsel dosyaları hedef klasöre BURADA (tarayıcıda) kopyalanır, çünkü
 * `space-media` bucket'ında dosya adresi Space klasörüne bağlıdır; kopyalanamayan görsel atlanır ve sayılır.
 */
export interface CopyResult {
  done: number;
  skipped: { privateNote: number; media: number; unavailable: number; drawingInFile: number; duplicate: number };
  oldIds: string[];
  newIds: string[];
}

interface ImageRow {
  id: string;
  kind: string;
  media_url: string | null;
  prompt_id: string | null;
  file_item_id: string | null;
}

/** Kopyalanacak görsel öğelerin kaynak dosyalarını hedef Space'e yükler; öğe kimliği → yeni adres eşlemesi döner. */
export async function copyImages(fromSpaceId: string, toSpaceId: string, itemIds: string[] | null): Promise<{ media: Record<string, string>; failed: number; total: number }> {
  let query = supabase.from("space_items").select("id, kind, media_url, prompt_id, file_item_id").eq("space_id", fromSpaceId).eq("kind", "image").limit(200);
  if (itemIds) query = query.in("id", itemIds);
  const { data, error } = await query;
  if (error) throw toSpaceError(error);
  const rows = (data ?? []) as ImageRow[];
  // Ekip panosundaki yansıma satırının gerçek dosyası asıl öğededir.
  const originalIds = rows.map((row) => row.file_item_id).filter((id): id is string => Boolean(id));
  const originals = new Map<string, ImageRow>();
  if (originalIds.length > 0) {
    const { data: extra } = await supabase.from("space_items").select("id, kind, media_url, prompt_id, file_item_id").in("id", originalIds).limit(200);
    for (const row of (extra ?? []) as ImageRow[]) originals.set(row.id, row);
  }
  const media: Record<string, string> = {};
  let failed = 0;
  let total = 0;
  for (const row of rows) {
    const source = row.file_item_id ? (originals.get(row.file_item_id) ?? null) : row;
    if (!source || source.prompt_id) continue; // yayınlanmış prompt'un görseli adresiyle başvurulur, dosya kopyalanmaz
    total += 1;
    const parsed = parseProtectedMediaUrl(source.media_url);
    if (!parsed) {
      failed += 1;
      continue;
    }
    try {
      const { data: blob, error: downloadError } = await supabase.storage.from(parsed.bucket).download(parsed.path);
      if (downloadError || !blob) throw downloadError ?? new Error("download");
      const uploaded = await uploadSpaceImage(toSpaceId, new File([blob], "copy.jpg", { type: blob.type || "image/jpeg" }));
      media[row.id] = uploaded.url;
    } catch {
      failed += 1;
    }
  }
  return { media, failed, total };
}

/** `space_copy_items` çağrısı (görseller `copyImages` ile ÖNCEDEN hedef klasöre kopyalanmış olmalı). Tek işlemdir: hata olursa hiçbir öğe yazılmaz. */
export async function copyItemsRpc(input: { fromSpaceId: string; toSpaceId: string; itemIds?: string[] | null; media: Record<string, string>; failedMedia: number }): Promise<CopyResult> {
  const itemIds = input.itemIds && input.itemIds.length > 0 ? input.itemIds : null;
  const { data, error } = await supabase.rpc("space_copy_items", { p_from: input.fromSpaceId, p_to: input.toSpaceId, p_ids: itemIds, p_media: input.media });
  if (error) throw toSpaceError(error);
  const raw = (data ?? {}) as { done?: number; old_ids?: string[]; new_ids?: string[]; skipped?: Record<string, number> };
  const skipped = raw.skipped ?? {};
  return {
    done: raw.done ?? 0,
    skipped: {
      privateNote: skipped.private_note ?? 0,
      media: (skipped.media ?? 0) + input.failedMedia,
      unavailable: skipped.unavailable ?? 0,
      drawingInFile: skipped.drawing_in_file ?? 0,
      duplicate: skipped.duplicate ?? 0,
    },
    oldIds: raw.old_ids ?? [],
    newIds: raw.new_ids ?? [],
  };
}

export async function copySpaceItems(input: { fromSpaceId: string; toSpaceId: string; itemIds?: string[] | null }): Promise<CopyResult> {
  const itemIds = input.itemIds && input.itemIds.length > 0 ? input.itemIds : null;
  const { media, failed } = await copyImages(input.fromSpaceId, input.toSpaceId, itemIds);
  return copyItemsRpc({ ...input, itemIds, media, failedMedia: failed });
}

export interface PinCopyResult {
  roots: number;
  replies: number;
  skippedPrivate: number;
}

/** Konumlu yorumları (yazar, tarih, "çözüldü" korunur; bildirim yok) bir panodan başkasına kopyalar. `floating=false` (seçimle kopyalama) yalnız eşlenen öğelerin yorumlarını alır. */
export async function copyPinComments(input: { fromSpaceId: string; toSpaceId: string; result: CopyResult; floating: boolean }): Promise<PinCopyResult> {
  const { data, error } = await supabase.rpc("space_copy_pin_comments", {
    p_from: input.fromSpaceId,
    p_to: input.toSpaceId,
    p_old_ids: input.result.oldIds,
    p_new_ids: input.result.newIds,
    p_floating: input.floating,
  });
  if (error) throw toSpaceError(error);
  const raw = (data ?? {}) as { roots?: number; replies?: number; skipped_private?: number };
  return { roots: raw.roots ?? 0, replies: raw.replies ?? 0, skippedPrivate: raw.skipped_private ?? 0 };
}

/** Pencerenin ön izlemesi için kaynağın öğe ve yorum satırları (yalnız kimlik/tür/gizlilik; içerik okunmaz). */
export async function fetchCopyScope(spaceId: string): Promise<{ items: PlanItem[]; pins: PlanPin[] }> {
  const [itemsRes, pinsRes] = await Promise.all([
    supabase.from("space_items").select("id, kind, is_private").eq("space_id", spaceId).limit(500),
    supabase.from("space_pin_comments").select("id, parent_id, item_id").eq("space_id", spaceId).limit(1000),
  ]);
  if (itemsRes.error) throw toSpaceError(itemsRes.error);
  const items = ((itemsRes.data ?? []) as { id: string; kind: string; is_private: boolean }[]).map((row) => ({ id: row.id, kind: row.kind, isPrivate: row.is_private }));
  const pins = pinsRes.error ? [] : ((pinsRes.data ?? []) as { id: string; parent_id: string | null; item_id: string | null }[]).map((row) => ({ id: row.id, parentId: row.parent_id, itemId: row.item_id }));
  return { items, pins };
}

export function totalSkipped(result: CopyResult): number {
  const { privateNote, media, unavailable, drawingInFile, duplicate } = result.skipped;
  return privateNote + media + unavailable + drawingInFile + duplicate;
}
