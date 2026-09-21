import { supabase } from "./client";

/** Did this viewer already like this real prompt? RLS (Bölüm 19) makes likes publicly readable. */
export async function fetchIsLiked(promptId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("prompt_likes")
      .select("prompt_id")
      .eq("prompt_id", promptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch (err) {
    console.error("fetchIsLiked", err);
    return false;
  }
}

/** Genuinely, permanently likes a real prompt. `handle_prompt_like_change` (Bölüm 19) keeps prompts.like_count in sync, even across users. */
export async function likePrompt(promptId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("prompt_likes").insert({ prompt_id: promptId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unlikePrompt(promptId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("prompt_likes")
    .delete()
    .eq("prompt_id", promptId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
