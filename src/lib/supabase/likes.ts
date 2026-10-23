import { supabase } from "./client";
import { batcherRegistry } from "./batched-lookup";

/**
 * `prompt_likes` holds likes for several content types — a nullable
 * `prompt_id`, `request_id`, `result_id`, `workflow_id`, `preset_id`, `community_post_id`, `space_id` OR `quote_id`,
 * exactly one of them (DB-level CHECK). The table's own name stayed `prompt_likes`
 * (same reasoning `prompt_comments` already accepted for holding request/
 * result comments too — renaming a live table is a bigger, riskier
 * migration than the naming mismatch is worth).
 */
export type LikeableContentType = "prompt" | "request" | "prompt_result" | "workflow" | "preset" | "community_post" | "space" | "quote";

/** `community_post` = bir topluluk gönderisinin KENDİ beğenisi: işaret ettiği içeriğin beğeni sayısından bağımsızdır. */
function targetColumn(
  contentType: LikeableContentType,
): "prompt_id" | "request_id" | "result_id" | "workflow_id" | "preset_id" | "community_post_id" | "space_id" | "quote_id" {
  if (contentType === "community_post") return "community_post_id";
  // Akışta paylaşılmış Space (docs/history/215-*): yalnız herkese açık + paylaşılmış Space beğenilir (sunucu tetikleyicisi denetler).
  if (contentType === "space") return "space_id";
  // Bir içeriğin alıntısı (docs/history/217-*): alıntının KENDİ beğenisi, alıntılanan içeriğin beğenisinden bağımsızdır.
  if (contentType === "quote") return "quote_id";
  if (contentType === "preset") return "preset_id";
  if (contentType === "workflow") return "workflow_id";
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

/** Genuinely, permanently likes a real prompt. `handle_prompt_like_change` (Bölüm 19/9.34) keeps like_count in sync, even across users. */
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
