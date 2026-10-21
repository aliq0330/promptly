import { supabase } from "./client";
import type { ImageAppearance } from "@/lib/image-appearance";

/**
 * Moderators' backfill for the prompt pictures stored before the speed-feel columns existed (docs/history/209-*): every
 * call goes through a SECURITY DEFINER RPC behind `_admin_guard()` — a non-moderator gets an error, never data.
 */
export async function fetchMediaAppearanceStats(): Promise<{ missing: number; total: number }> {
  const { data, error } = await supabase.rpc("admin_media_appearance_stats");
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as { missing: number | string; total: number | string }[])[0];
  return { missing: Number(row?.missing ?? 0), total: Number(row?.total ?? 0) };
}

export async function fetchMediaMissingAppearance(limit: number, exclude: string[]): Promise<{ id: string; url: string }[]> {
  const { data, error } = await supabase.rpc("admin_media_missing_appearance", { p_limit: limit, p_exclude: exclude });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; url: string }[];
}

export async function saveMediaAppearance(mediaId: string, appearance: ImageAppearance): Promise<void> {
  const { data, error } = await supabase.rpc("admin_set_media_appearance", {
    p_media_id: mediaId,
    p_color: appearance.color,
    p_placeholder: appearance.placeholder,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("media_not_found");
}
