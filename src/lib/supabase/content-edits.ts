import { supabase } from "./client";
import type { ContentEditEvent } from "@/types";

interface ContentEditRow {
  id: string;
  content_type: "prompt" | "prompt_request";
  content_id: string;
  owner_id: string;
  editor_id: string;
  changed_fields: string[];
  created_at: string;
}

const CONTENT_EDIT_SELECT = "id, content_type, content_id, owner_id, editor_id, changed_fields, created_at";

function mapContentEditRow(row: ContentEditRow): ContentEditEvent {
  return {
    id: row.id,
    contentType: row.content_type,
    contentId: row.content_id,
    ownerId: row.owner_id,
    editorId: row.editor_id,
    changedFields: row.changed_fields,
    createdAt: row.created_at,
  };
}

/**
 * A real content's real edit history (`public.content_edits`) — only ever
 * populated by a database trigger comparing OLD/NEW values (see
 * 20260919290000_prompt_variables_and_edit_tracking.sql), so an empty
 * result here genuinely means "never meaningfully edited", not "not
 * tracked yet". RLS restricts this to the content's own owner/editor —
 * calling it for someone else's content always resolves to `[]`, so
 * callers should only invoke this for the signed-in viewer's own content
 * (an owner-only "Düzenleme geçmişi" panel), never speculatively.
 */
export async function fetchEditHistory(
  contentType: "prompt" | "prompt_request",
  contentId: string,
  limit = 20,
): Promise<ContentEditEvent[]> {
  try {
    const { data, error } = await supabase
      .from("content_edits")
      .select(CONTENT_EDIT_SELECT)
      .eq("content_type", contentType)
      .eq("content_id", contentId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("fetchEditHistory", error);
      return [];
    }
    return ((data ?? []) as ContentEditRow[]).map(mapContentEditRow);
  } catch (err) {
    console.error("fetchEditHistory", err);
    return [];
  }
}
