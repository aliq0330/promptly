import { supabase } from "./client";
import { deleteRealPrompt } from "./prompts";
import { deleteRealRequest } from "./requests";
import { deleteGenerator } from "./generators";
import { deleteWorkflow } from "./workflows";
import { deletePreset } from "./presets";
import type { DraftItem } from "@/features/drafts/drafts-button";

export type DraftKind = "prompt" | "request" | "generator" | "workflow" | "preset";

const SOURCES: Record<DraftKind, { table: string; ownerColumn: string; draftColumn: string; draftValue: string | boolean; editHref: (id: string) => string }> = {
  prompt: { table: "prompts", ownerColumn: "author_id", draftColumn: "status", draftValue: "draft", editHref: (id) => `/create?edit=${id}` },
  request: { table: "prompt_requests", ownerColumn: "author_id", draftColumn: "is_draft", draftValue: true, editHref: (id) => `/requests/new?edit=${id}` },
  generator: { table: "generators", ownerColumn: "creator_id", draftColumn: "status", draftValue: "draft", editHref: (id) => `/generators/create?edit=${id}` },
  workflow: { table: "workflows", ownerColumn: "creator_id", draftColumn: "status", draftValue: "draft", editHref: (id) => `/workflows/create?edit=${id}` },
  preset: { table: "presets", ownerColumn: "creator_id", draftColumn: "status", draftValue: "draft", editHref: (id) => `/presets/create?edit=${id}` },
};

/** The caller's own drafts of ONE content type, most recently edited first. RLS already hides drafts from everyone else; the owner filter is for the list itself. */
export async function fetchOwnDrafts(kind: DraftKind, userId: string): Promise<DraftItem[]> {
  const source = SOURCES[kind];
  try {
    const { data, error } = await supabase
      .from(source.table)
      .select("id, title, updated_at")
      .eq(source.ownerColumn, userId)
      .eq(source.draftColumn, source.draftValue)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("fetchOwnDrafts", kind, error);
      return [];
    }
    return ((data ?? []) as unknown as { id: string; title: string; updated_at: string }[]).map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      href: source.editHref(row.id),
    }));
  } catch (err) {
    console.error("fetchOwnDrafts", kind, err);
    return [];
  }
}

export async function deleteDraft(kind: DraftKind, id: string): Promise<void> {
  if (kind === "prompt") return deleteRealPrompt(id);
  if (kind === "request") return deleteRealRequest(id);
  if (kind === "generator") return deleteGenerator(id);
  if (kind === "preset") return deletePreset(id);
  return deleteWorkflow(id);
}
