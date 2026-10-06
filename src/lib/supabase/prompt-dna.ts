import { supabase } from "./client";
import { DNA_SECTION_TYPES, type DnaConfidence, type DnaSection, type DnaSectionType } from "@/lib/prompt-dna/types";

interface DnaRow {
  id: string;
  type: string;
  label: string | null;
  content: string;
  order_index: number;
  source: string;
  confidence: string | null;
}

const DNA_SELECT = "id, type, label, content, order_index, source, confidence";

function mapRow(row: DnaRow): DnaSection {
  return {
    id: row.id,
    type: (DNA_SECTION_TYPES as readonly string[]).includes(row.type) ? (row.type as DnaSectionType) : "custom",
    label: row.label,
    content: row.content,
    source: row.source === "auto" ? "auto" : "manual",
    confidence: row.confidence === "high" || row.confidence === "medium" || row.confidence === "low" ? (row.confidence as DnaConfidence) : null,
    orderIndex: row.order_index,
  };
}

/**
 * The DNA sections a prompt's author accepted, in display order. Soft-fails to
 * an empty list (also when the table isn't there yet): DNA is optional
 * metadata and must never break a prompt page.
 */
export async function fetchDnaSections(promptId: string): Promise<DnaSection[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_dna_sections")
      .select(DNA_SELECT)
      .eq("prompt_id", promptId)
      .order("order_index", { ascending: true });
    if (error) {
      console.error("fetchDnaSections", error);
      return [];
    }
    return ((data ?? []) as DnaRow[]).map(mapRow);
  } catch (err) {
    console.error("fetchDnaSections", err);
    return [];
  }
}

/**
 * Replaces a prompt's DNA sections (delete-all-then-insert, the same pattern
 * as variables/tags — only the prompt's own author can ever write, RLS).
 * Called once on save/publish, never while typing.
 */
export async function replaceDnaSections(promptId: string, sections: DnaSection[]): Promise<void> {
  const { error: deleteError } = await supabase.from("prompt_dna_sections").delete().eq("prompt_id", promptId);
  if (deleteError) throw new Error(deleteError.message);
  const rows = sections
    .filter((section) => section.content.trim() !== "")
    .map((section, index) => ({
      prompt_id: promptId,
      type: section.type,
      label: section.type === "custom" ? (section.label?.trim() || null) : null,
      content: section.content.trim().slice(0, 2000),
      order_index: index,
      source: section.source,
      confidence: section.confidence,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("prompt_dna_sections").insert(rows);
  if (error) throw new Error(error.message);
}
