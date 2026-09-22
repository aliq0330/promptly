import { supabase } from "./client";

/**
 * `prompt_likes` now holds likes for two content types (Bölüm 9.34's
 * shared-social migration) — a nullable `prompt_id` OR a nullable
 * `generator_id`, never both (DB-level CHECK). The table's own name
 * stayed `prompt_likes` (same reasoning `prompt_comments` already
 * accepted for holding request comments too — renaming a live table is a
 * bigger, riskier migration than the naming mismatch is worth).
 */
export type LikeableContentType = "prompt" | "generator";

function targetColumn(contentType: LikeableContentType): "prompt_id" | "generator_id" {
  return contentType === "generator" ? "generator_id" : "prompt_id";
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
