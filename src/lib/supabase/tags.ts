import { supabase } from "./client";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import type { Prompt, Tag } from "@/types";

/** Every real tag (seeded once in supabase/migrations/20260919120600_seed_tags.sql), alphabetical. Public read (Bölüm 19). */
export async function fetchAllTags(): Promise<Tag[]> {
  try {
    const { data, error } = await supabase.from("tags").select("slug, label").order("label", { ascending: true });
    if (error) {
      console.error("fetchAllTags", error);
      return [];
    }
    return (data ?? []) as Tag[];
  } catch (err) {
    console.error("fetchAllTags", err);
    return [];
  }
}

/** Every real, published prompt tagged with `slug`, newest first — for `/tags/local?tag=…`. */
export async function fetchPromptsByTag(slug: string, limit = 60): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_tags")
      .select(`prompts:prompt_id ( ${PROMPT_SELECT} )`)
      .eq("tag_slug", slug)
      .order("created_at", { ascending: false, referencedTable: "prompts" })
      .limit(limit);
    if (error) {
      console.error("fetchPromptsByTag", error);
      return [];
    }
    return ((data ?? []) as unknown as { prompts: PromptRow | null }[])
      .map((row) => row.prompts)
      .filter((row): row is PromptRow => Boolean(row))
      .filter((row) => row.status === "published")
      .map((row) => mapPromptRow(row))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.error("fetchPromptsByTag", err);
    return [];
  }
}
