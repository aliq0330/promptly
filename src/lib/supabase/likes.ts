import { supabase } from "./client";

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
export type LikeableContentType = "prompt" | "generator" | "request" | "prompt_result";

function targetColumn(contentType: LikeableContentType): "prompt_id" | "generator_id" | "request_id" | "result_id" {
  if (contentType === "generator") return "generator_id";
  if (contentType === "request") return "request_id";
  if (contentType === "prompt_result") return "result_id";
  return "prompt_id";
}

/** Did this viewer already like this real prompt/generator? RLS (Bölüm 19) makes likes publicly readable. */
export async function fetchIsLiked(id: string, userId: string, contentType: LikeableContentType = "prompt"): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("prompt_likes")
      .select("user_id")
      .eq(targetColumn(contentType), id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch (err) {
    console.error("fetchIsLiked", err);
    return false;
  }
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
