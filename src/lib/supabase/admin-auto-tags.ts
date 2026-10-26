import { supabase } from "./client";
import { getOrCreateTag } from "./tags";
import { pickAutoTagsBatch, type AutoTagOptions, type AutoTagPick } from "@/lib/exchange/auto-tags";
import type { Tag } from "@/types";

/**
 * Moderatör: KENDİ promptlarına otomatik / önerilen etiket ekler (docs/history/252-*). Etiketleme oluşturma formundaki analizle aynı motorla
 * tarayıcıda yapılır; yazım `prompt_tags` üzerindedir (sahibin kendi satırları — RLS), yeni etiket yalnız `get_or_create_tag` ile oluşur.
 * Var olan etiketler silinmez/değişmez; yayınlı promptlarda etiket sayacı mevcut tetikleyiciyle artar.
 */

/** Promptlar RPC'siz okunur/yazılır; bir turda bu kadar prompt okunur ve etiketleri tek upsert'le yazılır. */
export const AUTO_TAG_CHUNK = 100;

export interface AutoTagProgress {
  /** Okunup analiz edilen + yazılan prompt sayısı. */
  done: number;
  total: number;
  /** En az bir etiket eklenen prompt sayısı. */
  tagged: number;
  /** Yazılan etiket bağı sayısı. */
  added: number;
  /** Bu çalıştırmada yeni oluşturulan etiket sayısı. */
  created: number;
}

export interface AutoTagOutcome extends AutoTagProgress {
  /** Hata ya da durdurma nedeniyle yarıda kaldıysa ilk işlenmeyen sıra (0 tabanlı); tamamlandıysa null. */
  stoppedAt: number | null;
  error: string | null;
}

interface PromptRow {
  id: string;
  title: string;
  prompt_text: string;
  prompt_tags: { tag_slug: string }[] | null;
}

export async function autoTagOwnPrompts(
  ids: string[],
  userId: string,
  catalog: Tag[],
  options: AutoTagOptions,
  control: { onProgress?: (progress: AutoTagProgress) => void; shouldStop?: () => boolean } = {},
): Promise<AutoTagOutcome> {
  const outcome: AutoTagOutcome = { done: 0, total: ids.length, tagged: 0, added: 0, created: 0, stoppedAt: null, error: null };
  const resolved = new Map<string, string>(); // aday slug → gerçek slug (oluşturulduktan sonra)
  const known = new Set(catalog.map((tag) => tag.slug));

  async function slugFor(pick: AutoTagPick): Promise<string> {
    if (!pick.isNew || known.has(pick.slug)) return pick.slug;
    const cached = resolved.get(pick.slug);
    if (cached) return cached;
    const tag = await getOrCreateTag(pick.label);
    resolved.set(pick.slug, tag.slug);
    known.add(tag.slug);
    outcome.created += 1;
    return tag.slug;
  }

  for (let offset = 0; offset < ids.length; offset += AUTO_TAG_CHUNK) {
    if (control.shouldStop?.()) {
      outcome.stoppedAt = offset;
      return outcome;
    }
    const chunk = ids.slice(offset, offset + AUTO_TAG_CHUNK);
    try {
      // Yalnız çağıranın kendi promptları (RLS zaten başkasının taslağını göstermez; `author_id` süzgeci yayınlı başkası içindir).
      const { data, error } = await supabase.from("prompts").select("id, title, prompt_text, prompt_tags(tag_slug)").in("id", chunk).eq("author_id", userId);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as PromptRow[];
      const picks = await pickAutoTagsBatch(
        rows.map((row) => ({ title: row.title, text: row.prompt_text, existing: (row.prompt_tags ?? []).map((t) => t.tag_slug) })),
        catalog,
        options,
        { shouldStop: control.shouldStop },
      );
      if (!picks) {
        outcome.stoppedAt = offset;
        return outcome;
      }
      const links: { prompt_id: string; tag_slug: string; source: "manual" | "automatic" }[] = [];
      let tagged = 0;
      for (let i = 0; i < rows.length; i++) {
        if (picks[i].length === 0) continue;
        tagged += 1;
        for (const pick of picks[i]) links.push({ prompt_id: rows[i].id, tag_slug: await slugFor(pick), source: pick.kind === "automatic" ? "automatic" : "manual" });
      }
      if (links.length > 0) {
        const { error: writeError } = await supabase.from("prompt_tags").upsert(links, { onConflict: "prompt_id,tag_slug", ignoreDuplicates: true });
        if (writeError) throw new Error(writeError.message);
      }
      outcome.tagged += tagged;
      outcome.added += links.length;
    } catch (err) {
      outcome.stoppedAt = offset;
      outcome.error = err instanceof Error ? err.message : String(err);
      return outcome;
    }
    outcome.done = offset + chunk.length;
    control.onProgress?.({ done: outcome.done, total: outcome.total, tagged: outcome.tagged, added: outcome.added, created: outcome.created });
  }
  return outcome;
}
