import { supabase } from "./client";
import { parseProtectedMediaUrl } from "./media-url";
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
async function copyImages(fromSpaceId: string, toSpaceId: string, itemIds: string[] | null): Promise<{ media: Record<string, string>; failed: number }> {
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
  for (const row of rows) {
    const source = row.file_item_id ? (originals.get(row.file_item_id) ?? null) : row;
    if (!source || source.prompt_id) continue; // yayınlanmış prompt'un görseli adresiyle başvurulur, dosya kopyalanmaz
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
  return { media, failed };
}

export async function copySpaceItems(input: { fromSpaceId: string; toSpaceId: string; itemIds?: string[] | null }): Promise<CopyResult> {
  const itemIds = input.itemIds && input.itemIds.length > 0 ? input.itemIds : null;
  const { media, failed } = await copyImages(input.fromSpaceId, input.toSpaceId, itemIds);
  const { data, error } = await supabase.rpc("space_copy_items", { p_from: input.fromSpaceId, p_to: input.toSpaceId, p_ids: itemIds, p_media: media });
  if (error) throw toSpaceError(error);
  const raw = (data ?? {}) as { done?: number; old_ids?: string[]; new_ids?: string[]; skipped?: Record<string, number> };
  const skipped = raw.skipped ?? {};
  return {
    done: raw.done ?? 0,
    skipped: {
      privateNote: skipped.private_note ?? 0,
      media: (skipped.media ?? 0) + failed,
      unavailable: skipped.unavailable ?? 0,
      drawingInFile: skipped.drawing_in_file ?? 0,
      duplicate: skipped.duplicate ?? 0,
    },
    oldIds: raw.old_ids ?? [],
    newIds: raw.new_ids ?? [],
  };
}

export function totalSkipped(result: CopyResult): number {
  const { privateNote, media, unavailable, drawingInFile, duplicate } = result.skipped;
  return privateNote + media + unavailable + drawingInFile + duplicate;
}
