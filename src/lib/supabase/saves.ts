import { supabase } from "./client";

/** Did this viewer already save this real prompt? Unlike likes, RLS (Bölüm 19) keeps saves private — only the saver can ever see their own row. */
export async function fetchIsSaved(promptId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("prompt_saves")
      .select("prompt_id")
      .eq("prompt_id", promptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch (err) {
    console.error("fetchIsSaved", err);
    return false;
  }
}

/** Genuinely, permanently saves a real prompt for this user only. */
export async function savePrompt(promptId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("prompt_saves").insert({ prompt_id: promptId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unsavePrompt(promptId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("prompt_saves")
    .delete()
    .eq("prompt_id", promptId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
