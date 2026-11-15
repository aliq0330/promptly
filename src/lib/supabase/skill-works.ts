import { supabase } from "./client";
import type { WorksState } from "@/lib/prompt-works";

/**
 * Skill "Çalıştı mı?" oyu veri katmanı (docs/history/393-*): `prompt-works.ts` ile aynı iki RPC kalıbı. Sayılar ve "oy verebilir miyim" SUNUCUDA hesaplanır
 * (`skill_works_state`; kullanım kaydı `skill_uses` istemciye kapalıdır). Oyu yazan tek yol `set_skill_works` (indirmiş olmalı, yazar değil, engel yok, saatte 30).
 */
const n = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0);

function parseState(row: Record<string, unknown> | undefined): WorksState {
  return { yes: n(row?.yes_count), no: n(row?.no_count), myVote: typeof row?.my_vote === "boolean" ? row.my_vote : null, canVote: row?.can_vote === true };
}

/** Bir Skill'in oy durumu; hata olursa `null` (arayüz bloğu hiç çizmez: 0 yazan sahte sayı yalan olur). */
export async function fetchSkillWorks(skillId: string): Promise<WorksState | null> {
  try {
    const { data, error } = await supabase.rpc("skill_works_state", { p_skill_id: skillId });
    if (error) {
      console.error("fetchSkillWorks", error);
      return null;
    }
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    return row ? parseState(row) : null;
  } catch (error) {
    console.error("fetchSkillWorks", error);
    return null;
  }
}

/** Oy ver / değiştir (`true`/`false`) ya da geri al (`null`). Hata `Error` olarak fırlar (mesaj kullanıcıya gösterilebilir). */
export async function setSkillWorks(skillId: string, works: boolean | null): Promise<WorksState> {
  const { data, error } = await supabase.rpc("set_skill_works", { p_skill_id: skillId, p_works: works });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  return { ...parseState(row), canVote: true };
}
