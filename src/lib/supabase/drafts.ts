import { supabase } from "./client";
import { fetchAllRows } from "./paged";
import { deleteRealPrompt } from "./prompts";
import { deleteRealRequest } from "./requests";
import { deleteWorkflow } from "./workflows";
import { deletePreset } from "./presets";
import { deleteSkill } from "./skills";
import type { DraftItem } from "@/features/drafts/drafts-button";
import { draftMissing, draftPreviewText, type DraftMissing } from "@/lib/draft-status";
import type { PromptContentType } from "@/types";

export type DraftKind = "prompt" | "request" | "workflow" | "preset" | "skill";

const SOURCES: Record<DraftKind, { table: string; ownerColumn: string; draftColumn: string; draftValue: string | boolean; editHref: (id: string) => string }> = {
  prompt: { table: "prompts", ownerColumn: "author_id", draftColumn: "status", draftValue: "draft", editHref: (id) => `/create?edit=${id}` },
  request: { table: "prompt_requests", ownerColumn: "author_id", draftColumn: "is_draft", draftValue: true, editHref: (id) => `/requests/new?edit=${id}` },
  workflow: { table: "workflows", ownerColumn: "creator_id", draftColumn: "status", draftValue: "draft", editHref: (id) => `/workflows/create?edit=${id}` },
  preset: { table: "presets", ownerColumn: "creator_id", draftColumn: "status", draftValue: "draft", editHref: (id) => `/presets/create?edit=${id}` },
  skill: { table: "skills", ownerColumn: "author_id", draftColumn: "status", draftValue: "draft", editHref: (id) => `/skills/create?edit=${id}` },
};

/** The caller's own drafts of ONE content type, most recently edited first. RLS already hides drafts from everyone else; the owner filter is for the list itself. */
export async function fetchOwnDrafts(kind: DraftKind, userId: string): Promise<DraftItem[]> {
  const source = SOURCES[kind];
  try {
    // Every draft, a page at a time (a bulk import leaves thousands of them; PostgREST stops at 1000 per request).
    const { rows } = await fetchAllRows((from, to) =>
      supabase
        .from(source.table)
        .select("id, title, updated_at")
        .eq(source.ownerColumn, userId)
        .eq(source.draftColumn, source.draftValue)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    );
    return (rows as unknown as { id: string; title: string; updated_at: string }[]).map((row) => ({
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

/** Taslak kartının ayrıntısı (docs/history/445-*, "Taslaklar · A"): küçük resim, tür, metin önizlemesi, sayılar ve eksikler. */
export interface DraftDetail {
  thumbnail: string | null;
  contentType: PromptContentType | null;
  previewText: string;
  variableCount: number | null;
  stepCount: number | null;
  missing: DraftMissing[];
}

const DETAIL_SELECT: Record<DraftKind, string> = {
  prompt: "id, title, content_type, description, prompt_text, prompt_media ( url, position ), prompt_variables ( count )",
  request: "id, title, content_type, description, prompt_request_media ( url, position )",
  workflow: "id, title, description, cover_url, workflow_steps ( count )",
  preset: "id, title, content_type, description, cover_url, selection",
  skill: "id, title, summary",
};

interface DetailRow {
  id: string;
  title: string | null;
  content_type?: PromptContentType;
  description?: string | null;
  prompt_text?: string | null;
  summary?: string | null;
  cover_url?: string | null;
  selection?: Record<string, unknown> | null;
  prompt_media?: { url: string; position: number }[] | null;
  prompt_request_media?: { url: string; position: number }[] | null;
  prompt_variables?: { count: number }[] | null;
  workflow_steps?: { count: number }[] | null;
}

function firstMedia(media: { url: string; position: number }[] | null | undefined): string | null {
  if (!media || media.length === 0) return null;
  return [...media].sort((a, b) => a.position - b.position)[0].url;
}

/**
 * Görünen taslak kartlarının ayrıntısı, `ids` için TEK sorgu (liste hafif kalır: binlerce taslakta prompt metni hep birden çekilmez;
 * pencere büyüdükçe yalnız yeni görünenler sorulur). Okunamazsa boş döner — kart yalnız başlık ve tarihle çizilir.
 */
export async function fetchDraftDetails(kind: DraftKind, ids: string[]): Promise<Record<string, DraftDetail>> {
  if (ids.length === 0) return {};
  const source = SOURCES[kind];
  try {
    const out: Record<string, DraftDetail> = {};
    for (let start = 0; start < ids.length; start += 100) {
      const { data, error } = await supabase.from(source.table).select(DETAIL_SELECT[kind]).in("id", ids.slice(start, start + 100));
      if (error) throw error;
      for (const row of (data ?? []) as unknown as DetailRow[]) {
        const stepCount = kind === "workflow" ? (row.workflow_steps?.[0]?.count ?? null) : null;
        const paramCount = kind === "preset" ? Object.keys(row.selection ?? {}).length : null;
        out[row.id] = {
          thumbnail: kind === "prompt" ? firstMedia(row.prompt_media) : kind === "request" ? firstMedia(row.prompt_request_media) : (row.cover_url ?? null),
          contentType: row.content_type ?? null,
          previewText: draftPreviewText(kind === "prompt" ? row.prompt_text || row.description : kind === "skill" ? row.summary : row.description),
          variableCount: kind === "prompt" ? (row.prompt_variables?.[0]?.count ?? null) : null,
          stepCount,
          missing: draftMissing(kind, { title: row.title, description: row.description, promptText: row.prompt_text, stepCount, paramCount }),
        };
      }
    }
    return out;
  } catch (err) {
    console.error("fetchDraftDetails", kind, err);
    return {};
  }
}

/** `userId` yalnız Skill silmede gerekir (sahiplik süzgeci; docs/history/408-*). */
export async function deleteDraft(kind: DraftKind, id: string, userId?: string): Promise<void> {
  if (kind === "skill") {
    if (!userId) throw new Error("not_signed_in");
    return deleteSkill(id, userId);
  }
  if (kind === "prompt") return deleteRealPrompt(id);
  if (kind === "request") return deleteRealRequest(id);
  if (kind === "preset") return deletePreset(id);
  return deleteWorkflow(id);
}
