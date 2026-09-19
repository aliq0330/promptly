import { supabase } from "./client";
import { placeholderArt } from "@/lib/placeholder-image";
import { resizeImageToBlob } from "@/lib/utils";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { Prompt, PromptContentType, PromptMedia, PromptOrigin, Tag, UserProfile } from "@/types";

/**
 * Hand-written mirror of the `public.prompts` row shape (joined with its
 * author profile, media and tags) — see
 * supabase/migrations/20260919120200_prompts_and_requests.sql. Kept in
 * sync by hand, same as mappers.ts's ProfileRow.
 */
interface PromptRow {
  id: string;
  title: string;
  description: string;
  prompt_text: string;
  tool: string | null;
  content_type: PromptContentType;
  status: "draft" | "published";
  origin_type: "original" | "remix" | "request_response";
  source_prompt_id: string | null;
  root_prompt_id: string | null;
  request_id: string | null;
  like_count: number;
  comment_count: number;
  remix_count: number;
  created_at: string;
  profiles: ProfileRow;
  prompt_media: { id: string; url: string; width: number; height: number; alt: string | null }[];
  prompt_tags: { tags: { slug: string; label: string } }[];
}

const PROMPT_SELECT = `
  id, title, description, prompt_text, tool, content_type, status,
  origin_type, source_prompt_id, root_prompt_id, request_id,
  like_count, comment_count, remix_count, created_at,
  profiles:author_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests ),
  prompt_media ( id, url, width, height, alt ),
  prompt_tags ( tags ( slug, label ) )
`;

function mapOrigin(row: PromptRow): PromptOrigin {
  if (row.origin_type === "remix" && row.source_prompt_id && row.root_prompt_id) {
    return { type: "remix", sourcePromptId: row.source_prompt_id, rootPromptId: row.root_prompt_id };
  }
  if (row.origin_type === "request_response" && row.request_id) {
    return { type: "request-response", requestId: row.request_id, responseId: row.id };
  }
  return { type: "original" };
}

function mapPromptRow(row: PromptRow): Prompt {
  const media: PromptMedia[] = (row.prompt_media ?? [])
    .map((m) => ({ id: m.id, url: m.url, width: m.width, height: m.height, alt: m.alt ?? row.title }));
  const tags: Tag[] = (row.prompt_tags ?? []).map((pt) => ({ slug: pt.tags.slug, label: pt.tags.label }));

  return {
    id: row.id,
    author: mapProfileRow(row.profiles),
    title: row.title,
    description: row.description,
    promptText: row.prompt_text,
    tool: row.tool,
    contentType: row.content_type,
    media,
    tags,
    origin: mapOrigin(row),
    likeCount: row.like_count,
    commentCount: row.comment_count,
    remixCount: row.remix_count,
    // Whether *this viewer* liked/saved it is still decided entirely by the
    // localStorage LikeProvider/SaveProvider (CLAUDE.md Bölüm 14) — real
    // per-user like/save rows aren't wired yet (a later Bölüm 21 phase).
    isLiked: false,
    isSaved: false,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Most recent published prompts, for mixing into the feed/discover pages alongside mock + local content. */
export async function fetchRecentPublishedPrompts(limit = 60): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompts")
      .select(PROMPT_SELECT)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("fetchRecentPublishedPrompts", error);
      return [];
    }
    return (data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow));
  } catch (err) {
    // A real network failure (e.g. no route to Supabase) throws instead of
    // resolving with a structured error — without this, a visitor with no
    // connectivity would see the feed hang loading forever instead of
    // gracefully falling back to mock/local content only.
    console.error("fetchRecentPublishedPrompts", err);
    return [];
  }
}

/** A single prompt by id — used when a direct link points at one that fell outside the recent-prompts batch above. RLS hides other users' drafts automatically. */
export async function fetchPromptById(id: string): Promise<Prompt | null> {
  try {
    const { data, error } = await supabase.from("prompts").select(PROMPT_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapPromptRow(data as unknown as PromptRow);
  } catch (err) {
    console.error("fetchPromptById", err);
    return null;
  }
}

/**
 * Every real prompt by one author, newest first — for a real profile page
 * (CLAUDE.md Bölüm 21 Faz 2). RLS (Bölüm 19) already does the right thing
 * here without any extra filtering: a visitor gets only that author's
 * published prompts, while the author viewing their own profile also sees
 * their own drafts.
 */
export async function fetchPromptsByAuthor(authorId: string): Promise<Prompt[]> {
  try {
    const { data, error } = await supabase
      .from("prompts")
      .select(PROMPT_SELECT)
      .eq("author_id", authorId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchPromptsByAuthor", error);
      return [];
    }
    return (data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow));
  } catch (err) {
    console.error("fetchPromptsByAuthor", err);
    return [];
  }
}

export interface CreateRealPromptInput {
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  contentType: PromptContentType;
  tags: Tag[];
  /** A real uploaded file, when the author picked one. */
  imageFile: File | null;
  /** Used for `contentType === "image"` when no file was uploaded — the same auto-generated placeholder the live preview already shows. */
  fallbackImage: { url: string; width: number; height: number } | null;
}

/**
 * Genuinely, permanently publishes a prompt: a real row in `public.prompts`
 * (plus `prompt_media`/`prompt_tags`), visible to every visitor per Bölüm
 * 19's RLS policies — not a mock array, not localStorage. Only ever called
 * for `origin: "original"` prompts (plain "Prompt Oluştur" and "Kopyasını
 * Oluştur") — see real-prompts-provider.tsx for why remix/request-answer
 * don't go through here yet.
 */
export async function createRealPrompt(
  input: CreateRealPromptInput,
  authorId: string,
  authorProfile: UserProfile,
): Promise<Prompt> {
  const { data: inserted, error: insertError } = await supabase
    .from("prompts")
    .insert({
      author_id: authorId,
      title: input.title.trim(),
      description: input.description.trim(),
      prompt_text: input.promptText.trim(),
      tool: input.tool,
      content_type: input.contentType,
      status: "published",
    })
    .select("id, created_at")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Prompt kaydedilemedi.");
  }

  const promptId = inserted.id as string;
  let media: PromptMedia[] = [];

  if (input.contentType === "image") {
    try {
      let descriptor: { url: string; width: number; height: number };

      if (input.imageFile) {
        const resized = await resizeImageToBlob(input.imageFile, 1600);
        const ext = resized.contentType === "image/png" ? "png" : "jpg";
        const path = `${authorId}/${promptId}-0.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("prompt-media")
          .upload(path, resized.blob, { contentType: resized.contentType, upsert: true });
        if (uploadError) throw new Error(uploadError.message);

        const { data: publicUrlData } = supabase.storage.from("prompt-media").getPublicUrl(path);
        descriptor = { url: publicUrlData.publicUrl, width: resized.width, height: resized.height };
      } else if (input.fallbackImage) {
        descriptor = input.fallbackImage;
      } else {
        descriptor = { url: placeholderArt(input.title || promptId, 900, 1100), width: 900, height: 1100 };
      }

      const { data: mediaRow, error: mediaError } = await supabase
        .from("prompt_media")
        .insert({
          prompt_id: promptId,
          url: descriptor.url,
          width: descriptor.width,
          height: descriptor.height,
          alt: input.title,
          position: 0,
        })
        .select("id, url, width, height, alt")
        .single();
      if (mediaError || !mediaRow) throw new Error(mediaError?.message ?? "Görsel kaydedilemedi.");

      media = [
        {
          id: mediaRow.id,
          url: mediaRow.url,
          width: mediaRow.width,
          height: mediaRow.height,
          alt: mediaRow.alt ?? input.title,
        },
      ];
    } catch (err) {
      // Don't leave a half-published image prompt with no image behind.
      await supabase.from("prompts").delete().eq("id", promptId);
      throw err instanceof Error ? err : new Error("Görsel yüklenemedi.");
    }
  }

  if (input.tags.length > 0) {
    // Non-fatal if this fails — the prompt itself is already real and
    // published; missing tags are a lesser problem than losing the post.
    await supabase
      .from("prompt_tags")
      .insert(input.tags.map((tag) => ({ prompt_id: promptId, tag_slug: tag.slug })));
  }

  return {
    id: promptId,
    author: authorProfile,
    title: input.title.trim(),
    description: input.description.trim(),
    promptText: input.promptText.trim(),
    tool: input.tool,
    contentType: input.contentType,
    media,
    tags: input.tags,
    origin: { type: "original" },
    likeCount: 0,
    commentCount: 0,
    remixCount: 0,
    isLiked: false,
    isSaved: false,
    status: "published",
    createdAt: inserted.created_at,
  };
}
