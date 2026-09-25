import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { audioPlaceholderCover, captureVideoPosterBlob, detectMediaTypeFromFile, prepareImageResultUploads } from "@/lib/prompt-result-media";
import type { PromptResult, PromptResultMediaType, PromptResultSummary } from "@/types";

interface ResultSummaryRow {
  id: string;
  prompt_id: string;
  media_type: PromptResultMediaType;
  thumbnail_url: string | null;
  text_content: string | null;
  tool: string | null;
  has_modification: boolean;
  like_count: number;
  created_at: string;
  profiles: ProfileRow;
}

/**
 * Deliberately narrow — no `media_url`, `modification_summary`,
 * `modified_prompt_text` or `comment_count` (CLAUDE.md §16/§17: a result
 * GRID must never eagerly fetch full media/metadata, only what a compact
 * card actually renders). `RESULT_DETAIL_SELECT` below is the only query
 * that fetches the rest, and only for one result at a time.
 */
const RESULT_LIST_SELECT = `
  id, prompt_id, media_type, thumbnail_url, text_content, tool, has_modification, like_count, created_at,
  profiles:creator_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests )
`;

function mapResultSummaryRow(row: ResultSummaryRow): PromptResultSummary {
  return {
    id: row.id,
    promptId: row.prompt_id,
    creator: mapProfileRow(row.profiles),
    mediaType: row.media_type,
    thumbnailUrl: row.thumbnail_url,
    textContent: row.text_content,
    tool: row.tool,
    hasModification: row.has_modification,
    likeCount: row.like_count,
    createdAt: row.created_at,
  };
}

/**
 * A page of one prompt's real results, newest first, plus the real total
 * count — backs "Kullanıcı sonuçları N" and the "Daha fazla yükle"/"Tüm
 * sonuçları gör" pagination (CLAUDE.md §15/§17), never fetching more than
 * one page's worth at a time.
 */
export async function fetchResultsForPrompt(
  promptId: string,
  { limit = 6, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ results: PromptResultSummary[]; total: number }> {
  try {
    const { data, error, count } = await supabase
      .from("prompt_results")
      .select(RESULT_LIST_SELECT, { count: "exact" })
      .eq("prompt_id", promptId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error("fetchResultsForPrompt", error);
      return { results: [], total: 0 };
    }
    return { results: ((data ?? []) as unknown as ResultSummaryRow[]).map(mapResultSummaryRow), total: count ?? 0 };
  } catch (err) {
    console.error("fetchResultsForPrompt", err);
    return { results: [], total: 0 };
  }
}

interface ResultDetailRow extends ResultSummaryRow {
  media_url: string | null;
  width: number | null;
  height: number | null;
  modification_summary: string | null;
  modified_prompt_text: string | null;
  comment_count: number;
  prompts: { id: string; title: string; description: string; prompt_text: string };
}

const RESULT_DETAIL_SELECT = `
  id, prompt_id, media_type, media_url, thumbnail_url, width, height, text_content, tool, has_modification,
  modification_summary, modified_prompt_text, like_count, comment_count, created_at,
  profiles:creator_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests ),
  prompts:prompt_id ( id, title, description, prompt_text )
`;

function mapResultDetailRow(row: ResultDetailRow): PromptResult {
  return {
    ...mapResultSummaryRow(row),
    mediaUrl: row.media_url,
    width: row.width,
    height: row.height,
    modificationSummary: row.modification_summary,
    modifiedPromptText: row.modified_prompt_text,
    commentCount: row.comment_count,
    originalPrompt: {
      id: row.prompts.id,
      title: row.prompts.title,
      description: row.prompts.description,
      promptText: row.prompts.prompt_text,
    },
  };
}

/**
 * The full shape of one real result, including its own original prompt's
 * title/description/promptText (embedded via the one join above) so the
 * detail page's "Bu sonuç hangi promptla oluşturuldu?" card never needs a
 * second round-trip. RLS (the migration) already limits this to a result
 * whose own prompt is readable.
 */
export async function fetchResultById(id: string): Promise<PromptResult | null> {
  try {
    const { data, error } = await supabase.from("prompt_results").select(RESULT_DETAIL_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapResultDetailRow(data as unknown as ResultDetailRow);
  } catch (err) {
    console.error("fetchResultById", err);
    return null;
  }
}

/** File extension used for a raw video/audio upload — falls back to splitting the original filename when the MIME subtype isn't one of the obvious ones. */
function extensionForRawFile(file: File): string {
  const bySubtype: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/webm": "webm",
  };
  if (bySubtype[file.type]) return bySubtype[file.type];
  const fromName = file.name.split(".").pop();
  return fromName && fromName.length <= 5 ? fromName.toLowerCase() : "bin";
}

export interface CreatePromptResultInput {
  promptId: string;
  /** Set for an image/video/audio result — mutually exclusive with `textContent` (the compose modal only ever fills one). */
  file: File | null;
  /** Set for a text result — the raw text output being shared. */
  textContent: string;
  tool: string;
  hasModification: boolean;
  modificationSummary: string;
  modifiedPromptText: string;
}

/**
 * Genuinely, permanently shares a real result under a real prompt — never a
 * new `prompts` row, never a remix (CLAUDE.md §19). The result's id is
 * generated client-side (`crypto.randomUUID()`, same reasoning as Bölüm 21
 * Faz 6's `getOrCreateDirectConversation` fix: every media file needs a
 * real storage path *before* the one `prompt_results` INSERT can happen,
 * since the row's own CHECK constraint requires its media shape to already
 * be correct at insert time — there's no valid "insert first, fill in media
 * after" intermediate state here, unlike `createRealPrompt`'s separate
 * `prompt_media` table).
 */
export async function createPromptResult(input: CreatePromptResultInput, creatorId: string): Promise<string> {
  const resultId = crypto.randomUUID();

  let mediaType: PromptResultMediaType;
  let mediaUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  let textContent: string | null = null;
  let width: number | null = null;
  let height: number | null = null;

  const trimmedText = input.textContent.trim();

  if (input.file) {
    const detected = detectMediaTypeFromFile(input.file);
    if (!detected) {
      throw new Error("Bu dosya türü şu an desteklenmiyor. Lütfen görsel, video veya ses dosyası yükle.");
    }
    mediaType = detected;

    if (detected === "image") {
      const { full, thumb } = await prepareImageResultUploads(input.file);
      const fullPath = `${creatorId}/${resultId}-full.jpg`;
      const thumbPath = `${creatorId}/${resultId}-thumb.jpg`;
      const [fullUpload, thumbUpload] = await Promise.all([
        supabase.storage.from("result-media").upload(fullPath, full.blob, { contentType: full.contentType, upsert: true }),
        supabase.storage.from("result-media").upload(thumbPath, thumb.blob, { contentType: thumb.contentType, upsert: true }),
      ]);
      if (fullUpload.error) throw new Error(fullUpload.error.message);
      if (thumbUpload.error) throw new Error(thumbUpload.error.message);
      mediaUrl = supabase.storage.from("result-media").getPublicUrl(fullPath).data.publicUrl;
      thumbnailUrl = supabase.storage.from("result-media").getPublicUrl(thumbPath).data.publicUrl;
      width = full.width;
      height = full.height;
    } else if (detected === "video") {
      const ext = extensionForRawFile(input.file);
      const videoPath = `${creatorId}/${resultId}-full.${ext}`;
      const { error: videoError } = await supabase.storage
        .from("result-media")
        .upload(videoPath, input.file, { contentType: input.file.type, upsert: true });
      if (videoError) throw new Error(videoError.message);
      mediaUrl = supabase.storage.from("result-media").getPublicUrl(videoPath).data.publicUrl;

      try {
        const poster = await captureVideoPosterBlob(input.file);
        const posterPath = `${creatorId}/${resultId}-poster.jpg`;
        const { error: posterError } = await supabase.storage
          .from("result-media")
          .upload(posterPath, poster.blob, { contentType: poster.contentType, upsert: true });
        if (posterError) throw new Error(posterError.message);
        thumbnailUrl = supabase.storage.from("result-media").getPublicUrl(posterPath).data.publicUrl;
      } catch {
        // A poster couldn't be captured (an unusual codec/container the
        // browser's own <video> element can't decode client-side) — fall
        // back to a deterministic placeholder rather than failing the
        // whole share, same "never block on the artistic extra" spirit as
        // this app's other offline placeholder art.
        thumbnailUrl = audioPlaceholderCover(resultId);
      }
    } else {
      const ext = extensionForRawFile(input.file);
      const audioPath = `${creatorId}/${resultId}-full.${ext}`;
      const { error: audioError } = await supabase.storage
        .from("result-media")
        .upload(audioPath, input.file, { contentType: input.file.type, upsert: true });
      if (audioError) throw new Error(audioError.message);
      mediaUrl = supabase.storage.from("result-media").getPublicUrl(audioPath).data.publicUrl;
      thumbnailUrl = audioPlaceholderCover(resultId);
    }
  } else if (trimmedText) {
    mediaType = "text";
    textContent = trimmedText;
  } else {
    throw new Error("Bir dosya yükle veya paylaşacağın metni gir.");
  }

  const { error } = await supabase.from("prompt_results").insert({
    id: resultId,
    prompt_id: input.promptId,
    creator_id: creatorId,
    media_type: mediaType,
    media_url: mediaUrl,
    thumbnail_url: thumbnailUrl,
    width,
    height,
    text_content: textContent,
    tool: input.tool.trim() || null,
    has_modification: input.hasModification,
    modification_summary: input.hasModification && input.modificationSummary.trim() ? input.modificationSummary.trim() : null,
    modified_prompt_text: input.hasModification && input.modifiedPromptText.trim() ? input.modifiedPromptText.trim() : null,
  });
  if (error) throw new Error(error.message);

  return resultId;
}

/** Deletes a real result the caller owns — RLS (the migration) enforces `auth.uid() = creator_id`. */
export async function deletePromptResult(resultId: string): Promise<void> {
  const { error } = await supabase.from("prompt_results").delete().eq("id", resultId);
  if (error) throw new Error(error.message);
}
