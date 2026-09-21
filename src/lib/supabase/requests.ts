import { supabase } from "./client";
import { resizeImageToBlob } from "@/lib/utils";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { PromptContentType, PromptRequest, PromptRequestStatus, Tag } from "@/types";

/**
 * Hand-written mirror of the `public.prompt_requests` row shape — see
 * supabase/migrations/20260919120200_prompts_and_requests.sql. Kept in
 * sync by hand, same as prompts.ts's PromptRow.
 */
interface RequestRow {
  id: string;
  title: string;
  description: string;
  creative_direction: string | null;
  preferred_tool: string | null;
  content_type: PromptContentType | null;
  reference_image_url: string | null;
  reference_image_width: number | null;
  reference_image_height: number | null;
  status: PromptRequestStatus;
  selected_response_prompt_id: string | null;
  response_count: number;
  created_at: string;
  profiles: ProfileRow;
  prompt_request_tags: { tags: { slug: string; label: string } }[];
}

const REQUEST_SELECT = `
  id, title, description, creative_direction, preferred_tool, content_type,
  reference_image_url, reference_image_width, reference_image_height,
  status, selected_response_prompt_id, response_count, created_at,
  profiles:author_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests ),
  prompt_request_tags ( tags ( slug, label ) )
`;

function mapRequestRow(row: RequestRow): PromptRequest {
  const tags: Tag[] = (row.prompt_request_tags ?? []).map((rt) => ({ slug: rt.tags.slug, label: rt.tags.label }));
  return {
    id: row.id,
    author: mapProfileRow(row.profiles),
    title: row.title,
    description: row.description,
    creativeDirection: row.creative_direction ?? "",
    preferredTool: row.preferred_tool,
    contentType: row.content_type ?? undefined,
    referenceImage: row.reference_image_url
      ? {
          id: `${row.id}-reference`,
          url: row.reference_image_url,
          width: row.reference_image_width ?? 0,
          height: row.reference_image_height ?? 0,
          alt: row.title,
        }
      : undefined,
    tags,
    status: row.status,
    responseCount: row.response_count,
    createdAt: row.created_at,
    selectedResponsePromptId: row.selected_response_prompt_id ?? undefined,
  };
}

/** Most recent requests (any status), for mixing into the feed/discover pages alongside mock + local content. */
export async function fetchRecentRequests(limit = 60): Promise<PromptRequest[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_requests")
      .select(REQUEST_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("fetchRecentRequests", error);
      return [];
    }
    return ((data ?? []) as unknown as RequestRow[]).map(mapRequestRow);
  } catch (err) {
    console.error("fetchRecentRequests", err);
    return [];
  }
}

/** A single request by id — for a direct link that fell outside the recent-requests batch above. */
export async function fetchRequestById(id: string): Promise<PromptRequest | null> {
  try {
    const { data, error } = await supabase.from("prompt_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapRequestRow(data as unknown as RequestRow);
  } catch (err) {
    console.error("fetchRequestById", err);
    return null;
  }
}

/**
 * Every real request by one author, newest-first — for that profile's
 * own "Prompt İstekleri" section. Requests have no draft/private concept
 * (unlike prompts) — every request is always fully public per Bölüm 19's
 * RLS ("Requests are publicly readable"), so this is safe to call for any
 * profile, not just the viewer's own.
 */
export async function fetchRequestsByAuthor(authorId: string): Promise<PromptRequest[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_requests")
      .select(REQUEST_SELECT)
      .eq("author_id", authorId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchRequestsByAuthor", error);
      return [];
    }
    return ((data ?? []) as unknown as RequestRow[]).map(mapRequestRow);
  } catch (err) {
    console.error("fetchRequestsByAuthor", err);
    return [];
  }
}

export interface CreateRealRequestInput {
  title: string;
  description: string;
  creativeDirection: string;
  contentType: PromptContentType;
  preferredTool: string | null;
  tags: Tag[];
  /** A real uploaded file, when the requester picked one. */
  imageFile: File | null;
}

/**
 * Genuinely, permanently publishes a prompt request: a real row in
 * `public.prompt_requests` (plus `prompt_request_tags`), visible to every
 * visitor per Bölüm 19's RLS policies — not a mock array or localStorage.
 */
export async function createRealRequest(
  input: CreateRealRequestInput,
  authorId: string,
  authorProfile: PromptRequest["author"],
): Promise<PromptRequest> {
  let referenceImage: { url: string; width: number; height: number } | null = null;

  if (input.imageFile) {
    const resized = await resizeImageToBlob(input.imageFile, 1000);
    const ext = resized.contentType === "image/png" ? "png" : "jpg";
    const path = `${authorId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("request-references")
      .upload(path, resized.blob, { contentType: resized.contentType, upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    const { data: publicUrlData } = supabase.storage.from("request-references").getPublicUrl(path);
    referenceImage = { url: publicUrlData.publicUrl, width: resized.width, height: resized.height };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("prompt_requests")
    .insert({
      author_id: authorId,
      title: input.title.trim(),
      description: input.description.trim(),
      creative_direction: input.creativeDirection.trim() || null,
      preferred_tool: input.preferredTool,
      content_type: input.contentType,
      reference_image_url: referenceImage?.url ?? null,
      reference_image_width: referenceImage?.width ?? null,
      reference_image_height: referenceImage?.height ?? null,
    })
    .select("id, created_at")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "İstek kaydedilemedi.");
  }

  const requestId = inserted.id as string;

  if (input.tags.length > 0) {
    await supabase
      .from("prompt_request_tags")
      .insert(input.tags.map((tag) => ({ request_id: requestId, tag_slug: tag.slug })));
  }

  return {
    id: requestId,
    author: authorProfile,
    title: input.title.trim(),
    description: input.description.trim(),
    creativeDirection: input.creativeDirection.trim(),
    preferredTool: input.preferredTool,
    contentType: input.contentType,
    referenceImage: referenceImage
      ? { id: `${requestId}-reference`, url: referenceImage.url, width: referenceImage.width, height: referenceImage.height, alt: input.title }
      : undefined,
    tags: input.tags,
    status: "open",
    responseCount: 0,
    createdAt: inserted.created_at,
  };
}

/**
 * Genuinely, permanently opens/closes a real request MANUALLY (the
 * "İsteği kapat"/"Açık olarak işaretle" toggle) — distinct from a request
 * auto-closing because a response got selected (`selectRealRequestResponse`
 * below). Only ever called with `"open"`/`"closed"`, never `"answered"` —
 * the UI hides this toggle whenever a response is currently selected (see
 * `RequestDetailView`), and the database's own `prompt_requests_status_
 * shape` CHECK constraint (Bölüm 21 prompt-request hardening) would reject
 * an attempt to set `"closed"`/`"open"` while a selection still exists
 * anyway. `closed_by_owner` records that this was a deliberate manual
 * close, so that later selecting-then-clearing a response doesn't
 * accidentally reopen it (see the RPC below).
 */
export async function updateRealRequestStatus(
  requestId: string,
  status: Extract<PromptRequestStatus, "open" | "closed">,
): Promise<void> {
  const { error } = await supabase
    .from("prompt_requests")
    .update({ status, closed_by_owner: status === "closed" })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
}

/** Genuinely, permanently deletes a real request the caller owns. */
export async function deleteRealRequest(requestId: string): Promise<void> {
  const { error } = await supabase.from("prompt_requests").delete().eq("id", requestId);
  if (error) throw new Error(error.message);
}

/**
 * Genuinely, permanently selects, changes, or clears (`promptId = null`)
 * a real request's chosen answer — via the `select_prompt_request_
 * response` RPC (Bölüm 21 prompt-request hardening), not a direct
 * `.update()`. That function does, atomically and server-side, everything
 * a direct update couldn't safely do on its own: verifies the caller
 * actually owns the request (a clear error instead of RLS's silent
 * "0 rows affected"), verifies the chosen prompt is genuinely a real
 * answer to *this* request (never some unrelated prompt), and — the part
 * that matters most — decides the right status to fall back to when
 * clearing a selection: `'open'` normally, but `'closed'` if the owner
 * had manually closed the request before ever selecting a response, so
 * that clearing a selection can never accidentally reopen a request the
 * owner deliberately closed.
 */
export async function selectRealRequestResponse(
  requestId: string,
  promptId: string | null,
): Promise<{ status: PromptRequestStatus; selectedResponsePromptId?: string }> {
  const { data, error } = await supabase.rpc("select_prompt_request_response", {
    p_request_id: requestId,
    p_response_prompt_id: promptId,
  });
  if (error || !data) throw new Error(error?.message ?? "Yanıt seçilemedi.");
  const row = data as { status: PromptRequestStatus; selected_response_prompt_id: string | null };
  return { status: row.status, selectedResponsePromptId: row.selected_response_prompt_id ?? undefined };
}
