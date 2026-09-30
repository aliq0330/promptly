import { supabase } from "./client";
import { batcherRegistry } from "./batched-lookup";

/**
 * `prompt_likes` now holds likes for four content types (Bölüm 9.34's
 * shared-social migration, widened to requests by the "Prompt İsteği
 * Etkileşim ve Menü Sistemi Eşitleme" görevi, and to Kullanıcı Sonuçları by
 * the "Kullanıcı Sonuçları / Prompt Çıktıları" görevi) — a nullable
 * `prompt_id`, `generator_id`, `request_id`, OR `result_id`, exactly one of
 * the four (DB-level CHECK). The table's own name stayed `prompt_likes`
 * (same reasoning `prompt_comments` already accepted for holding request/
 * result comments too — renaming a live table is a bigger, riskier
 * migration than the naming mismatch is worth).
 */
export type LikeableContentType = "prompt" | "generator" | "request" | "prompt_result" | "workflow";

function targetColumn(contentType: LikeableContentType): "prompt_id" | "generator_id" | "request_id" | "result_id" | "workflow_id" {
  if (contentType === "workflow") return "workflow_id";
  if (contentType === "generator") return "generator_id";
  if (contentType === "request") return "request_id";
  if (contentType === "prompt_result") return "result_id";
  return "prompt_id";
}

const likeLookup = batcherRegistry((key) => {
  const [userId, contentType] = key.split("|") as [string, LikeableContentType];
  const column = targetColumn(contentType);
  return async (ids) => {
    const { data, error } = await supabase.from("prompt_likes").select(column).eq("user_id", userId).in(column, ids);
    if (error || !data) return new Set();
    return new Set((data as unknown as Record<string, string>[]).map((row) => row[column]));
  };
});

/** Did this viewer already like this target? RLS (Bölüm 19) makes likes publicly readable. Concurrent calls (one per card) are batched into one query. */
export async function fetchIsLiked(id: string, userId: string, contentType: LikeableContentType = "prompt"): Promise<boolean> {
  return likeLookup(`${userId}|${contentType}`)(id);
}

/** Genuinely, permanently likes a real prompt or generator. `handle_prompt_like_change` (Bölüm 19/9.34) keeps like_count in sync, even across users. */
export async function likeContent(id: string, userId: string, contentType: LikeableContentType = "prompt"): Promise<void> {
  const { error } = await supabase.from("prompt_likes").insert({ [targetColumn(contentType)]: id, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unlikeContent(id: string, userId: string, contentType: LikeableContentType = "prompt"): Promise<void> {
  const { error } = await supabase
    .from("prompt_likes")
    .delete()
    .eq(targetColumn(contentType), id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
