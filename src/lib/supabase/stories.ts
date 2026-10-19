import { supabase } from "./client";
import { sniffImageMime } from "./message-images";
import { translateForRuntime, type TranslationKey } from "@/lib/i18n/translations";
import { IMAGE_BYTE_BUDGETS, IMAGE_SOURCE_MAX_BYTES, shrinkImage } from "@/lib/image-processing";
import { STORY_LIMITS, parseDraftPayload, parseStoryLayout, sniffVideoMime, videoExtension, type StoryVideoMime } from "@/lib/stories";
import type {
  Story,
  StoryAudience,
  StoryAuthor,
  StoryDraft,
  StoryDraftPayload,
  StoryHighlight,
  StoryKind,
  StoryLayout,
  StoryLinkedType,
  StoryPollResults,
  StoryQuestionAnswer,
  StorySticker,
  StoryTrayItem,
  StoryViewer,
} from "@/types";

/**
 * Hikâyeler veri erişimi (docs/history/198-*). Okumalar RLS'ten geçer (görünürlük sunucudaki `_story_visible`); her yazma bir
 * SECURITY DEFINER RPC'dir — istemci yalnız kendi hikâyesini/öne çıkanını silebilir ve kendi taslaklarını yazar.
 */

export const STORY_MEDIA_BUCKET = "story-media";

/** Sunucunun kısa hata kodları → kullanıcıya gösterilecek çevrilmiş metin. */
const ERROR_KEYS: Record<string, TranslationKey> = {
  not_authenticated: "stories.error.signIn",
  forbidden: "stories.error.forbidden",
  story_not_found: "stories.error.notFound",
  story_expired: "stories.error.expired",
  own_story: "stories.error.ownStory",
  invalid_reaction: "stories.error.generic",
  invalid_vote: "stories.error.generic",
  invalid_answer: "stories.error.answer",
  answer_limit: "stories.error.answerLimit",
  invalid_reply: "stories.error.reply",
  reply_not_allowed: "stories.error.replyNotAllowed",
  story_rate_limit: "stories.error.rateLimit",
  invalid_media: "stories.error.media",
  media_missing: "stories.error.mediaMissing",
  video_too_long: "stories.error.videoTooLong",
  invalid_layout: "stories.error.layout",
  empty_story: "stories.error.empty",
  content_not_found: "stories.error.contentUnavailable",
  invalid_sticker: "stories.error.sticker",
  invalid_story: "stories.error.generic",
  community_closed: "stories.error.communityClosed",
  invalid_highlight: "stories.error.highlight",
  highlight_not_found: "stories.error.notFound",
  highlight_limit: "stories.error.highlightLimit",
  highlight_full: "stories.error.highlightFull",
  draft_limit: "stories.error.draftLimit",
};

export class StoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function toStoryError(raw: { message?: string } | null | undefined): StoryError {
  const text = raw?.message ?? "";
  const code = Object.keys(ERROR_KEYS).find((key) => text.includes(key)) ?? "generic";
  return new StoryError(code, translateForRuntime(ERROR_KEYS[code] ?? "stories.error.generic"));
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw toStoryError(error);
  return data as T;
}

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

const STORY_SELECT =
  "id, author_id, kind, media_url, media_mime, media_width, media_height, media_duration_ms, layout, linked_type, linked_id, sticker_kind, sticker_question, sticker_options, audience, community_id, created_at, expires_at, moderation_status, viewer_count, view_count, reaction_count, reshared_from, author:profiles!stories_author_id_fkey(id, username, display_name, avatar_url), community:chat_groups(id, name)";

interface AuthorRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface StoryRow {
  id: string;
  author_id: string;
  kind: StoryKind;
  media_url: string | null;
  media_mime: string | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_ms: number | null;
  layout: unknown;
  linked_type: StoryLinkedType | null;
  linked_id: string | null;
  sticker_kind: "poll" | "question" | null;
  sticker_question: string | null;
  sticker_options: string[] | null;
  audience: StoryAudience;
  community_id: string | null;
  created_at: string;
  expires_at: string;
  moderation_status: "visible" | "removed";
  viewer_count: number;
  view_count: number;
  reaction_count: number;
  reshared_from: string | null;
  author: AuthorRow | AuthorRow[] | null;
  community: { id: string; name: string } | { id: string; name: string }[] | null;
}

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

function mapAuthor(row: AuthorRow | null): StoryAuthor | null {
  if (!row) return null;
  return { id: row.id, username: row.username, displayName: row.display_name || row.username, avatarUrl: row.avatar_url };
}

function mapSticker(row: StoryRow): StorySticker | null {
  if (row.sticker_kind === "poll" && row.sticker_question && row.sticker_options) {
    return { kind: "poll", question: row.sticker_question, options: row.sticker_options };
  }
  if (row.sticker_kind === "question" && row.sticker_question) return { kind: "question", question: row.sticker_question };
  return null;
}

export function mapStoryRow(row: StoryRow): Story {
  return {
    id: row.id,
    authorId: row.author_id,
    author: mapAuthor(one(row.author)),
    kind: row.kind,
    mediaUrl: row.media_url,
    mediaMime: row.media_mime,
    mediaWidth: row.media_width,
    mediaHeight: row.media_height,
    mediaDurationMs: row.media_duration_ms,
    // Sunucu CHECK'i geçersiz düzeni zaten reddeder; yine de okunamayan bir düzen boş tuval olarak çizilir, hata vermez.
    layout: parseStoryLayout(row.layout) ?? { v: 1, layers: [] },
    linkedType: row.linked_type,
    linkedId: row.linked_id,
    sticker: mapSticker(row),
    audience: row.audience,
    communityId: row.community_id,
    communityName: one(row.community)?.name ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    moderationStatus: row.moderation_status,
    viewerCount: row.viewer_count,
    viewCount: row.view_count,
    reactionCount: row.reaction_count,
    resharedFrom: row.reshared_from,
  };
}

interface TrayRow {
  author_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  story_ids: string[];
  unseen_count: number;
  latest_at: string;
  community_story_count: number;
}

/** Şerit: sıra sunucuda (ben → görülmemişler → görülmüşler, en yeni önce). `communityId` verilirse yalnız o topluluk. */
export async function fetchStoryTray(communityId?: string | null): Promise<StoryTrayItem[]> {
  const rows = await rpc<TrayRow[] | null>("story_tray", { p_community_id: communityId ?? null });
  return (rows ?? []).map((row) => ({
    author: { id: row.author_id, username: row.username, displayName: row.display_name || row.username, avatarUrl: row.avatar_url },
    storyIds: row.story_ids ?? [],
    unseenCount: row.unseen_count,
    latestAt: row.latest_at,
    communityStoryCount: row.community_story_count,
  }));
}

/** Kimliklere göre (RLS: göremediğin, süresi dolan ya da silinen hikâye listede olmaz). Sıra verilen kimlik sırasıdır. */
export async function fetchStoriesByIds(ids: string[]): Promise<Story[]> {
  const unique = Array.from(new Set(ids)).slice(0, 200);
  if (unique.length === 0) return [];
  const { data, error } = await supabase.from("stories").select(STORY_SELECT).in("id", unique);
  if (error) throw toStoryError(error);
  const byId = new Map((data as unknown as StoryRow[]).map((row) => [row.id, mapStoryRow(row)]));
  return unique.map((id) => byId.get(id)).filter((story): story is Story => Boolean(story));
}

export async function fetchStoryById(id: string): Promise<Story | null> {
  const [story] = await fetchStoriesByIds([id]);
  return story ?? null;
}

/** Bir kişinin şu an etkin olan ve çağıranın görebildiği hikâyeleri (eskiden yeniye). */
export async function fetchActiveStoryIds(authorId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("id")
    .eq("author_id", authorId)
    .eq("moderation_status", "visible")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw toStoryError(error);
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

/** Bu hikâyelerden hangilerini daha önce izledim (kendi görüntüleme satırlarım). */
export async function fetchSeenStoryIds(viewerId: string, storyIds: string[]): Promise<Set<string>> {
  if (storyIds.length === 0) return new Set();
  const { data } = await supabase.from("story_views").select("story_id").eq("viewer_id", viewerId).in("story_id", storyIds.slice(0, 200));
  return new Set(((data ?? []) as { story_id: string }[]).map((row) => row.story_id));
}

export const ARCHIVE_PAGE_SIZE = 30;

/** Arşiv (yalnız sahibine): etkin + süresi dolmuş, en yeni önce, `created_at` keyset. */
export async function fetchStoryArchive(ownerId: string, before?: string | null): Promise<{ stories: Story[]; hasMore: boolean }> {
  let query = supabase
    .from("stories")
    .select(STORY_SELECT)
    .eq("author_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(ARCHIVE_PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw toStoryError(error);
  const rows = (data ?? []) as unknown as StoryRow[];
  return { stories: rows.slice(0, ARCHIVE_PAGE_SIZE).map(mapStoryRow), hasMore: rows.length > ARCHIVE_PAGE_SIZE };
}

export async function fetchMyReaction(storyId: string, userId: string): Promise<string | null> {
  const { data } = await supabase.from("story_reactions").select("emoji").eq("story_id", storyId).eq("user_id", userId).maybeSingle();
  return (data as { emoji: string } | null)?.emoji ?? null;
}

export async function fetchStoryViewers(storyId: string): Promise<StoryViewer[]> {
  const rows = await rpc<
    Array<{ viewer_id: string; username: string; display_name: string | null; avatar_url: string | null; first_viewed_at: string; last_viewed_at: string; view_count: number; reaction: string | null }> | null
  >("story_viewers", { p_story_id: storyId });
  return (rows ?? []).map((row) => ({
    user: { id: row.viewer_id, username: row.username, displayName: row.display_name || row.username, avatarUrl: row.avatar_url },
    firstViewedAt: row.first_viewed_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
    reaction: row.reaction,
  }));
}

export async function fetchPollResults(storyId: string): Promise<StoryPollResults> {
  const raw = await rpc<{ revealed: boolean; my_vote: number | null; total: number | null; counts: number[] | null }>("story_poll_results", { p_story_id: storyId });
  return { revealed: raw.revealed === true, myVote: raw.my_vote ?? null, total: raw.total ?? null, counts: raw.counts ?? null };
}

/** Sahibine: soruya gelen yanıtlar; yanıtlayana: yalnız kendi yanıtları (RLS). */
export async function fetchQuestionAnswers(storyId: string): Promise<StoryQuestionAnswer[]> {
  const { data, error } = await supabase
    .from("story_question_answers")
    .select("id, story_id, body, created_at, responder:profiles!story_question_answers_responder_id_fkey(id, username, display_name, avatar_url)")
    .eq("story_id", storyId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw toStoryError(error);
  return ((data ?? []) as unknown as Array<{ id: string; story_id: string; body: string; created_at: string; responder: AuthorRow | AuthorRow[] | null }>).map((row) => ({
    id: row.id,
    storyId: row.story_id,
    body: row.body,
    createdAt: row.created_at,
    responder: mapAuthor(one(row.responder)),
  }));
}

/** Sahibine: anket oylarının kim → hangi seçenek listesi. */
export async function fetchPollVoters(storyId: string): Promise<Array<{ user: StoryAuthor; option: number }>> {
  const { data, error } = await supabase
    .from("story_poll_votes")
    .select("option_index, voter:profiles!story_poll_votes_voter_id_fkey(id, username, display_name, avatar_url)")
    .eq("story_id", storyId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw toStoryError(error);
  return ((data ?? []) as unknown as Array<{ option_index: number; voter: AuthorRow | AuthorRow[] | null }>)
    .map((row) => ({ user: mapAuthor(one(row.voter)), option: row.option_index }))
    .filter((row): row is { user: StoryAuthor; option: number } => row.user !== null);
}

// ---------------------------------------------------------------------------
// Etkileşim
// ---------------------------------------------------------------------------

export async function markStoryViewed(storyId: string): Promise<void> {
  await rpc<null>("mark_story_viewed", { p_story_id: storyId });
}

export async function setStoryReaction(storyId: string, emoji: string | null): Promise<void> {
  await rpc<null>("set_story_reaction", { p_story_id: storyId, p_emoji: emoji });
}

export async function voteStoryPoll(storyId: string, option: number): Promise<void> {
  await rpc<null>("vote_story_poll", { p_story_id: storyId, p_option: option });
}

export async function answerStoryQuestion(storyId: string, body: string): Promise<void> {
  await rpc<string>("answer_story_question", { p_story_id: storyId, p_body: body });
}

/** Özel yanıt: mevcut birebir sohbete normal mesaj. Döner: sohbet kimliği. */
export async function replyToStory(storyId: string, body: string): Promise<string> {
  const result = await rpc<{ conversation_id: string; message_id: string }>("reply_to_story", { p_story_id: storyId, p_body: body });
  return result.conversation_id;
}

// ---------------------------------------------------------------------------
// Oluşturma, silme, yönetim
// ---------------------------------------------------------------------------

export interface CreateStoryInput {
  clientToken: string;
  kind: StoryKind;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationMs: number | null;
  layout: StoryLayout;
  linkedType: StoryLinkedType | null;
  linkedId: string | null;
  sticker: StorySticker | null;
  audience: StoryAudience;
  communityId: string | null;
}

/** İdempotent: aynı `clientToken` ile tekrar çağrı (çift dokunma, ağ yeniden denemesi) aynı hikâyeyi döner. */
export async function createStory(input: CreateStoryInput): Promise<string> {
  return rpc<string>("create_story", {
    p: {
      client_token: input.clientToken,
      kind: input.kind,
      media_url: input.mediaUrl,
      media_mime: input.mediaMime,
      media_width: input.mediaWidth,
      media_height: input.mediaHeight,
      media_duration_ms: input.mediaDurationMs,
      layout: input.layout,
      linked_type: input.linkedType,
      linked_id: input.linkedId,
      sticker_kind: input.sticker?.kind ?? null,
      sticker_question: input.sticker?.question ?? null,
      sticker_options: input.sticker?.kind === "poll" ? input.sticker.options : null,
      audience: input.audience,
      community_id: input.audience === "community" ? input.communityId : null,
    },
  });
}

export async function reshareStory(storyId: string, audience: StoryAudience, communityId: string | null, clientToken: string): Promise<string> {
  return rpc<string>("reshare_story", {
    p_story_id: storyId,
    p_audience: audience,
    p_community_id: audience === "community" ? communityId : null,
    p_client_token: clientToken,
  });
}

/** Sahibinin silmesi; "0 satır" sessiz başarı sayılmaz. Dosya yetim kalır ve yetim süpürücüsüyle silinir (başka hikâye kullanıyor olabilir). */
export async function deleteStory(storyId: string): Promise<void> {
  const { data, error } = await supabase.from("stories").delete().eq("id", storyId).select("id");
  if (error) throw toStoryError(error);
  if (!data || data.length === 0) throw new StoryError("story_not_found", translateForRuntime("stories.error.notFound"));
}

export async function moderateStory(storyId: string, remove: boolean): Promise<void> {
  await rpc<null>("moderate_story", { p_story_id: storyId, p_remove: remove });
}

export async function removeCommunityStory(storyId: string): Promise<void> {
  await rpc<null>("remove_community_story", { p_story_id: storyId });
}

export async function fetchStoryArchiveEnabled(userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("story_archive_enabled").eq("id", userId).maybeSingle();
  return (data as { story_archive_enabled: boolean } | null)?.story_archive_enabled ?? true;
}

export async function setStoryArchiveEnabled(userId: string, enabled: boolean): Promise<void> {
  const { data, error } = await supabase.from("profiles").update({ story_archive_enabled: enabled }).eq("id", userId).select("id").maybeSingle();
  if (error || !data) throw new StoryError("generic", translateForRuntime("stories.error.generic"));
}

// ---------------------------------------------------------------------------
// Öne çıkanlar
// ---------------------------------------------------------------------------

interface HighlightRow {
  id: string;
  owner_id: string;
  title: string;
  cover_story_id: string | null;
  position: number;
  story_highlight_items: Array<{ story_id: string; position: number }> | null;
}

/** Bir profilin öne çıkanları; öğeler RLS'le süzülür (görülemeyen hikâye listede yok, hiç öğesi görünmeyen öne çıkan da yok). */
export async function fetchHighlights(ownerId: string): Promise<StoryHighlight[]> {
  const { data, error } = await supabase
    .from("story_highlights")
    .select("id, owner_id, title, cover_story_id, position, story_highlight_items(story_id, position)")
    .eq("owner_id", ownerId)
    .order("position", { ascending: true })
    .limit(50);
  if (error) throw toStoryError(error);
  return ((data ?? []) as HighlightRow[])
    .map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      coverStoryId: row.cover_story_id,
      position: row.position,
      storyIds: (row.story_highlight_items ?? []).slice().sort((a, b) => a.position - b.position).map((item) => item.story_id),
    }))
    .filter((highlight) => highlight.storyIds.length > 0);
}

export async function saveHighlight(input: { id: string | null; title: string; storyIds: string[]; coverStoryId: string | null }): Promise<string> {
  return rpc<string>("save_story_highlight", {
    p_highlight_id: input.id,
    p_title: input.title.trim(),
    p_story_ids: input.storyIds,
    p_cover_story_id: input.coverStoryId,
  });
}

export async function addStoryToHighlight(highlightId: string, storyId: string): Promise<void> {
  await rpc<null>("add_story_to_highlight", { p_highlight_id: highlightId, p_story_id: storyId });
}

export async function deleteHighlight(highlightId: string): Promise<void> {
  const { data, error } = await supabase.from("story_highlights").delete().eq("id", highlightId).select("id");
  if (error) throw toStoryError(error);
  if (!data || data.length === 0) throw new StoryError("highlight_not_found", translateForRuntime("stories.error.notFound"));
}

// ---------------------------------------------------------------------------
// Taslaklar (yalnız sahibine)
// ---------------------------------------------------------------------------

export async function fetchDrafts(ownerId: string): Promise<StoryDraft[]> {
  const { data, error } = await supabase
    .from("story_drafts")
    .select("id, payload, media_url, media_mime, updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw toStoryError(error);
  return ((data ?? []) as Array<{ id: string; payload: unknown; media_url: string | null; media_mime: string | null; updated_at: string }>)
    .map((row) => {
      const payload = parseDraftPayload(row.payload);
      return payload ? { id: row.id, payload, mediaUrl: row.media_url, mediaMime: row.media_mime, updatedAt: row.updated_at } : null;
    })
    .filter((draft): draft is StoryDraft => draft !== null);
}

export async function saveDraft(ownerId: string, draftId: string | null, payload: StoryDraftPayload, mediaUrl: string | null, mediaMime: string | null): Promise<string> {
  const row = { owner_id: ownerId, payload, media_url: mediaUrl, media_mime: mediaMime };
  if (draftId) {
    const { data, error } = await supabase.from("story_drafts").update(row).eq("id", draftId).select("id").maybeSingle();
    if (error) throw toStoryError(error);
    if (data) return draftId;
  }
  // Id istemcide üretilir (INSERT … RETURNING'e güvenilmez — CLAUDE.md Bölüm 6).
  const id = crypto.randomUUID();
  const { error } = await supabase.from("story_drafts").insert({ id, ...row });
  if (error) throw toStoryError(error);
  return id;
}

export async function deleteDraft(draftId: string): Promise<void> {
  await supabase.from("story_drafts").delete().eq("id", draftId);
}

// ---------------------------------------------------------------------------
// Medya: hazırlama + ilerlemeli yükleme
// ---------------------------------------------------------------------------

export interface PreparedStoryMedia {
  kind: "image" | "video";
  blob: Blob;
  mime: "image/jpeg" | StoryVideoMime;
  width: number;
  height: number;
  durationMs: number | null;
}

/** Videonun boyutunu/süresini tarayıcıya okutur (dosyanın tamamı belleğe alınmaz: nesne URL'si + yalnız metadata). */
function readVideoMetadata(file: Blob): Promise<{ width: number; height: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      const result = { width: video.videoWidth, height: video.videoHeight, durationMs: Math.round(video.duration * 1000) };
      done();
      if (!Number.isFinite(result.durationMs) || result.durationMs <= 0) reject(new StoryError("invalid_media", translateForRuntime("stories.error.videoUnreadable")));
      else resolve(result);
    };
    video.onerror = () => {
      done();
      reject(new StoryError("invalid_media", translateForRuntime("stories.error.videoUnreadable")));
    };
    video.src = url;
  });
}

/**
 * Seçilen dosyayı yüklemeye hazırlar. Tür, uzantıya/`file.type`'a değil ilk baytlara bakılarak belirlenir. Fotoğraf otomatik
 * küçültülür (ortak `shrinkImage`, metadata/GPS düşer); video olduğu gibi yüklenir ama süre (≤ 60 sn) ve boyut (≤ 40 MB) denetlenir.
 */
export async function prepareStoryMedia(file: File): Promise<PreparedStoryMedia> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const videoMime = sniffVideoMime(head);
  if (videoMime) {
    if (file.size > STORY_LIMITS.videoMaxBytes) {
      throw new StoryError("invalid_media", translateForRuntime("stories.error.videoTooBig", { max: String(STORY_LIMITS.videoMaxBytes / (1024 * 1024)) }));
    }
    const meta = await readVideoMetadata(file);
    if (meta.durationMs > STORY_LIMITS.videoMaxMs + 500) {
      throw new StoryError("video_too_long", translateForRuntime("stories.error.videoTooLong"));
    }
    return { kind: "video", blob: file, mime: videoMime, width: meta.width, height: meta.height, durationMs: Math.min(meta.durationMs, STORY_LIMITS.videoMaxMs) };
  }
  const imageMime = await sniffImageMime(file);
  if (!imageMime) throw new StoryError("invalid_media", translateForRuntime("stories.error.unsupportedFile"));
  if (file.size > IMAGE_SOURCE_MAX_BYTES) {
    throw new StoryError("invalid_media", translateForRuntime("image.sourceTooLarge", { max: String(Math.round(IMAGE_SOURCE_MAX_BYTES / (1024 * 1024))) }));
  }
  const shrunk = await shrinkImage(file, { maxDimension: STORY_LIMITS.imageMaxDimension, maxBytes: IMAGE_BYTE_BUDGETS.media });
  return { kind: "image", blob: shrunk.blob, mime: "image/jpeg", width: shrunk.width, height: shrunk.height, durationMs: null };
}

/**
 * `story-media/{kullanıcı}/{uuid}.{uzantı}` yoluna ilerleme bildirerek yükler (supabase-js ilerleme vermediği için doğrudan Storage
 * REST'i, kullanıcının kendi oturum anahtarıyla; servis anahtarı yok). Aynı yola ikinci deneme "zaten var" derse başarı sayılır
 * (ilk deneme aslında bitmiş olabilir). Döner: kimlik URL'si.
 */
export async function uploadStoryMedia(
  ownerId: string,
  media: PreparedStoryMedia,
  path: string | null,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ url: string; path: string }> {
  const ext = media.kind === "image" ? "jpg" : videoExtension(media.mime as StoryVideoMime);
  const objectPath = path ?? `${ownerId}/${crypto.randomUUID()}.${ext}`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !base || !anonKey) throw new StoryError("not_authenticated", translateForRuntime("stories.error.signIn"));

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${STORY_MEDIA_BUCKET}/${objectPath}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", media.mime);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const alreadyThere = xhr.status === 409 || (xhr.status === 400 && /exists|Duplicate/i.test(xhr.responseText));
      if ((xhr.status >= 200 && xhr.status < 300) || alreadyThere) {
        onProgress(1);
        resolve();
      } else {
        reject(new StoryError("upload", translateForRuntime("stories.error.upload")));
      }
    };
    xhr.onerror = () => reject(new StoryError("upload", translateForRuntime("stories.error.upload")));
    xhr.onabort = () => reject(new StoryError("aborted", translateForRuntime("stories.error.upload")));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(media.blob);
  });

  return { url: supabase.storage.from(STORY_MEDIA_BUCKET).getPublicUrl(objectPath).data.publicUrl, path: objectPath };
}

// ---------------------------------------------------------------------------
// Bağlanabilir içerik (yalnız yayında + herkese açık + topluluğa ait olmayan; sunucu yeniden denetler)
// ---------------------------------------------------------------------------

export interface LinkableContent {
  type: StoryLinkedType;
  id: string;
  title: string;
  description: string;
}

/** Sorgu boşsa kendi paylaşımlarım; doluysa sitedeki herkese açık içerikte başlık araması. */
export async function fetchLinkableContent(ownerId: string, query: string): Promise<LinkableContent[]> {
  const q = query.trim().replace(/[%_,()]/g, " ").trim();
  const mine = !q;
  const limit = 12;
  const prompts = supabase.from("prompts").select("id, title, description").eq("status", "published").eq("visibility", "public").is("community_id", null).is("deleted_at", null);
  const requests = supabase.from("prompt_requests").select("id, title, description").eq("is_draft", false).eq("visibility", "public").is("community_id", null).is("deleted_at", null);
  const workflows = supabase.from("workflows").select("id, title, description").eq("status", "published").eq("visibility", "public").is("community_id", null);
  const presets = supabase.from("presets").select("id, title, description").eq("status", "published").eq("visibility", "public").is("community_id", null);
  const scoped = <T extends { eq: (c: string, v: string) => T; ilike: (c: string, v: string) => T }>(builder: T, ownerColumn: string) =>
    mine ? builder.eq(ownerColumn, ownerId) : builder.ilike("title", `%${q}%`);
  const [p, r, w, s] = await Promise.all([
    scoped(prompts, "author_id").order("created_at", { ascending: false }).limit(limit),
    scoped(requests, "author_id").order("created_at", { ascending: false }).limit(limit),
    scoped(workflows, "creator_id").order("created_at", { ascending: false }).limit(limit),
    scoped(presets, "creator_id").order("created_at", { ascending: false }).limit(limit),
  ]);
  const pick = (type: StoryLinkedType, rows: unknown) =>
    ((rows ?? []) as Array<{ id: string; title: string; description: string | null }>).map((row) => ({ type, id: row.id, title: row.title, description: row.description ?? "" }));
  return [...pick("prompt", p.data), ...pick("workflow", w.data), ...pick("preset", s.data), ...pick("request", r.data)];
}
