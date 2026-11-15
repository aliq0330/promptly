import { supabase } from "./client";
import { fetchSkillsByIds } from "./skills";
import type { Skill } from "@/types";

/**
 * Skill ↔ Skill bağları (docs/history/397-*): bir Skill'in birlikte kullanılan / gerektirdiği DİĞER Skill'ler. Kimlik başvurusudur, kopya değil. Yazma yalnız sahibine açıktır
 * ve bağlanan Skill yayında + herkese açık olmalıdır (sunucu `skill_links_guard` zorlar); en çok 10 bağ. Kartlar bağlanan Skill'in KENDİ RLS'inden okunur (gizlenmişse dönmez).
 */
export const SKILL_LINK_MAX = 10;

export interface SkillLink {
  id: string;
  linkedSkillId: string;
  position: number;
}

export async function fetchSkillLinks(skillId: string): Promise<SkillLink[]> {
  const { data, error } = await supabase.from("skill_links").select("id, linked_skill_id, position").eq("skill_id", skillId).order("position", { ascending: true }).limit(SKILL_LINK_MAX);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; linked_skill_id: string; position: number }[]).map((row) => ({ id: row.id, linkedSkillId: row.linked_skill_id, position: row.position }));
}

/** Bağlanan Skill'lerin kartları; okuyucunun göremediği (gizlenmiş/silinmiş) Skill listede olmaz. */
export async function fetchLinkedSkills(links: SkillLink[]): Promise<Skill[]> {
  return fetchSkillsByIds(links.map((link) => link.linkedSkillId));
}

export async function addSkillLink(skillId: string, linkedSkillId: string, position: number): Promise<SkillLink> {
  const { data, error } = await supabase.from("skill_links").insert({ skill_id: skillId, linked_skill_id: linkedSkillId, position }).select("id, linked_skill_id, position").maybeSingle();
  if (error || !data) throw new Error(error?.message || "skill_not_found");
  const row = data as { id: string; linked_skill_id: string; position: number };
  return { id: row.id, linkedSkillId: row.linked_skill_id, position: row.position };
}

export async function removeSkillLink(skillId: string, linkId: string): Promise<void> {
  const { data, error } = await supabase.from("skill_links").delete().eq("id", linkId).eq("skill_id", skillId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("skill_not_found");
}
