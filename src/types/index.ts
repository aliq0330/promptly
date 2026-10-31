import type { ContentTypeId } from "@/lib/content-taxonomy";
import type { PromptLicense } from "@/lib/prompt-license";
import type { PresetField, PresetSelection } from "@/lib/preset-fields";
/**
 * Shared domain types for Promptly — mirror the real Supabase schema (see
 * `supabase/` migrations and `src/lib/supabase/*.ts`'s mappers).
 */

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  website: string | null;
  followerCount: number;
  followingCount: number;
  createdAt: string;
  /** Yaratıcı ilgi alanları / kategoriler (bkz. profile/interest-options.ts) — `profiles.interests`. */
  interests?: string[];
  /** Tanıtım için hazırlanmış örnek hesap (`profiles.is_demo`, yalnız sunucu yazar) — gerçek bir kişi değildir; arayüzde rozetle belirtilir. */
  isDemo?: boolean;
}

export interface Tag {
  slug: string;
  label: string;
  /**
   * Real usage stats (CLAUDE.md Bölüm 9.23, `tags.prompt_usage_count`/
   * `request_usage_count`/`usage_count` + `created_at`) — only populated by
   * a stats-aware query (popular/trending/all-tags/tag-detail lookups).
   * Left `undefined` everywhere a tag is just embedded in a prompt's or
   * request's own `tags` array (that join never selects these columns) —
   * never rendered as `0` in that case, only omitted.
   */
  usageCount?: number;
  promptUsageCount?: number;
  requestUsageCount?: number;
  createdAt?: string;
}

export interface PromptMedia {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
  /** Average colour `#rrggbb` (`prompt_media.dominant_color`) — painted before the picture arrives; absent on older rows. */
  color?: string | null;
  /** Tiny blurred stand-in (`prompt_media.placeholder`, a ≈24px JPEG data URL) — laid over the colour until the picture loads. */
  placeholder?: string | null;
}

export type PromptOrigin =
  | { type: "original" }
  | { type: "request-response"; requestId: string; responseId: string };

/**
 * Promptly isn't image-only: writing, video, code and music generation
 * prompts share the platform (see CLAUDE.md section 1). Only "image"
 * prompts render a media preview — the rest use a compact text-first card.
 */
export type PromptContentType = ContentTypeId;

/** Who can see a published post: everyone, or only its author (the shared "Görünürlük" switch, CLAUDE.md §9.88). */
export type ContentVisibility = "public" | "private";

export interface Prompt {
  id: string;
  author: UserProfile;
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  /** Recommended tool/model refs ("toolId" or "toolId:modelId", max 3) — see lib/ai-tool-catalog.ts. */
  tools: string[];
  contentType: PromptContentType;
  /** Taxonomy category/subcategory slug (see lib/content-taxonomy.ts) — optional, null when never chosen. */
  category: string | null;
  subcategory: string | null;
  media: PromptMedia[];
  tags: Tag[];
  origin: PromptOrigin;
  likeCount: number;
  /** Kaç kez alıntılandı (`quote_count`, docs/history/217-*; korumalı sayaç). */
  quoteCount?: number;
  /** Real, trigger-maintained `prompts.save_count` — one per distinct user who saved it into ANY of their own collections, not per collection. */
  saveCount: number;
  commentCount: number;
  /** Real `prompts.copy_count`: how many signed-in people copied / ran it (one per person per day, never the author). */
  copyCount: number;
  /** Kullanım hakkı (`prompts.license`, docs/history/296-*); null/yok = belirtilmedi. */
  license?: PromptLicense | null;
  isLiked: boolean;
  isSaved: boolean;
  status: "draft" | "published";
  /**
   * Whether this prompt appears in normal profile/feed/discover/search
   * results — `prompts.show_on_profile`. Only meaningful for a request
   * answer (`origin.type === "request-response"`): the author can choose
   * to keep an answer out of their own portfolio while it still stays
   * fully visible in the request's own answer list and at its own detail
   * page. Always `true` for an original prompt.
   */
  showOnProfile: boolean;
  /** Prompt bir referans fotoğraf/görselle birlikte kullanılır — `prompts.requires_reference_image`. */
  requiresReferenceImage: boolean;
  /** Prompt bir referans videoyla birlikte kullanılır — `prompts.requires_reference_video`. */
  requiresReferenceVideo: boolean;
  /** Prompt bir referans sesle birlikte kullanılır — `prompts.requires_reference_audio`. */
  requiresReferenceAudio: boolean;
  /** "Herkese açık" / "Sadece ben" — `prompts.visibility`. */
  visibility: ContentVisibility;
  createdAt: string;
  /**
   * Legacy/historical field — `prompts.deleted_at`. Originally set when a
   * prompt was "safely" soft-deleted while it still had real remixes
   * pointing at it (Bölüm 9.7); the remix system this protected has since
   * been fully removed (kullanıcının açık talebi), so no new row is ever
   * soft-deleted anymore — every delete is now a real, permanent DELETE.
   * The field/column stay only so any pre-existing historical soft-deleted
   * row (`title`/`description`/`promptText` empty) still renders its
   * honest "Bu paylaşım silindi" placeholder instead of reappearing with
   * blank content. `null` for a normal prompt.
   */
  deletedAt: string | null;
  /** Topluluğa özgü içerik: doluysa içerik yalnız o topluluğun okuyucularına görünür; profilde/aramada/koleksiyonda yer almaz (`docs/history/179-*`). */
  communityId?: string | null;
}

/**
 * A comment belongs to exactly one of a prompt, a request, a
 * Kullanıcı Sonucu — never more than one (enforced by `prompt_comments_
 * exactly_one_target`, see CommentSection).
 */
export interface PromptComment {
  id: string;
  promptId?: string;
  requestId?: string;
  resultId?: string;
  workflowId?: string;
  presetId?: string;
  /** Topluluk gönderisi yorumu: yorum gönderinin kendi kimliğine bağlıdır, gönderinin işaret ettiği içeriğin yorumlarına karışmaz (`prompt_comments.community_post_id`). */
  communityPostId?: string;
  /** Akışta paylaşılmış bir Space'in yorumu (docs/history/215-*). */
  spaceId?: string;
  /** Space yorumunun bir ETKİNLİĞE düştüğü (docs/history/242-*); yoksa Space'in genel yorumu. */
  spaceActivityId?: string;
  /** Space'in genel yorumuyla verilen 1–5 puan (yanıtta ve etkinlik yorumunda yok). */
  rating?: number | null;
  /** Bir içeriğin alıntısının yorumu (docs/history/217-*): alıntının kendi kimliğine bağlıdır. */
  quoteId?: string;
  author: UserProfile;
  body: string;
  /** Points at another `PromptComment.id` — a reply can target a top-level comment OR another reply, to any depth (self-referencing `prompt_comments.parent_id`). */
  parentId: string | null;
  /** This comment/reply's own like count — entirely independent of the post's `Prompt.likeCount` and of any other comment's count (`comment_likes` table). */
  likeCount: number;
  createdAt: string;
  /** Set the moment `body` last changed — never touched by likes or by the delete flow below. */
  editedAt: string | null;
  /**
   * Set when the author deleted this comment/reply — the row itself is
   * kept (not hard-deleted) whenever it still has real replies, so the
   * thread structure and those replies are never silently lost; `body` is
   * cleared server-side and the UI shows a placeholder instead. A comment
   * with no replies is hard-deleted instead (never appears with this set).
   */
  deletedAt: string | null;
}

// === Kullanıcı Sonuçları / Prompt Çıktıları ================================
//
// A real, standalone "I used this prompt and got this" artifact
// (`public.prompt_results`) attached under its original prompt — this is
// NOT a remix/fork: the sharer never creates a prompt of their own, `prompt`
// itself is never touched, and there's no separate `prompts` row for it
// (see the migration's own header for the full architecture note).

export type PromptResultMediaType = "image" | "video" | "audio" | "text" | "other";

/**
 * The compact, card-safe shape — deliberately excludes the full-size
 * `mediaUrl`/`textContent`/modification detail fields (CLAUDE.md §16/§17:
 * a result grid must never eagerly load full media/metadata, only enough
 * for a small thumbnail). `fetchResultsForPrompt` returns this; only
 * `fetchResultById` (the detail page) fetches the full `PromptResult`.
 */
export interface PromptResultSummary {
  id: string;
  /** Empty for an orphaned result: its prompt was deleted and only its creator still sees it (docs/history/283-*). */
  promptId?: string;
  /** The prompt's title, only on the profile list (`profile_results`); absent elsewhere and for an orphaned result. */
  promptTitle?: string | null;
  creator: UserProfile;
  mediaType: PromptResultMediaType;
  /** A genuinely small preview — a resized image thumbnail, a captured video poster frame, or (for audio, which has no real extractable thumbnail) a deterministic offline placeholder cover. Never set for text/other. */
  thumbnailUrl: string | null;
  /** Only meaningful for text/other results — used for the card's short text preview. `null` for image/video/audio. */
  textContent: string | null;
  tool: string | null;
  hasModification: boolean;
  likeCount: number;
  createdAt: string;
}

/** The full shape — only ever fetched for one result at a time, when its own detail page actually opens (CLAUDE.md §16's "büyük medya/detay verisi yalnızca detay açılınca yüklenir"). */
export interface PromptResult extends PromptResultSummary {
  /** The real, full-size file — the original image, the video file, or the audio file. `null` for text/other (see `textContent` instead). */
  mediaUrl: string | null;
  /** Only set for `mediaType === "image"` — its real, non-distorted aspect ratio for the detail viewer. `null` otherwise (a `<video>`/`<audio>` element sizes itself). */
  width: number | null;
  height: number | null;
  modificationSummary: string | null;
  /** The full prompt text the creator says they actually used, if they chose to provide one instead of/alongside a plain-language summary. */
  modifiedPromptText: string | null;
  commentCount: number;
  /** Set only for a prompt-origin result — just enough to render the "Bu sonuç hangi promptla oluşturuldu?" back-link card (+ a prompt-comparison diff when modified) without a second round-trip. */
  originalPrompt?: { id: string; title: string; description: string; promptText: string };
}

export type PromptRequestStatus = "open" | "answered" | "closed";

export interface PromptRequest {
  id: string;
  author: UserProfile;
  title: string;
  description: string;
  creativeDirection: string;
  preferredTool: string | null;
  tools: string[];
  /** Requested content type (image/text/audio/video) — same union as `Prompt.contentType`. */
  contentType?: PromptContentType;
  category: string | null;
  subcategory: string | null;
  /**
   * Real, ordered reference images (`prompt_request_media`) — zero or more,
   * added by the requester for creative direction (mood-board style).
   * `referenceImage` below is kept, unchanged, as a derived convenience
   * (`media[0]`) so every pre-existing single-image call site keeps
   * working untouched.
   */
  media: PromptMedia[];
  /** Derived convenience — the first entry of `media`, if any. Prefer `media` for new code. */
  referenceImage?: PromptMedia;
  tags: Tag[];
  status: PromptRequestStatus;
  responseCount: number;
  /** Real, database-backed like count (`prompt_requests.like_count`) — the same `prompt_likes` system a prompt/generator uses (see `LikeableContentType`). */
  likeCount: number;
  /** Kaç kez alıntılandı (`quote_count`, docs/history/217-*; korumalı sayaç). */
  quoteCount?: number;
  /** Real, database-backed comment count (`prompt_requests.comment_count`) — the same `prompt_comments`/`handle_prompt_comment_change` system a prompt/generator uses. */
  commentCount: number;
  createdAt: string;
  /**
   * The id of the answer (a real `Prompt` with a `request-response` origin)
   * the requester picked as the best fit — `prompt_requests.
   * selected_response_prompt_id`. Only ever set by the request's own
   * author (RLS-enforced).
   */
  selectedResponsePromptId?: string;
  /**
   * `prompt_requests.deleted_at` — set only when the author tried to
   * delete a request that had at least one real response (a `Prompt` with
   * `origin.type === "request-response"`) still pointing at it. Mirrors
   * `Prompt.deletedAt`'s own soft-delete pattern (Bölüm 9.5's comment
   * delete, birebir aynı mantık): the row survives (its own responses'
   * `requestId` must always point at something real), but its content is
   * cleared and a "Bu istek silindi" placeholder renders instead. `null`
   * for a normal, live request. A request with no responses is always a
   * real, permanent DELETE — this field never gets set for it.
   */
  deletedAt: string | null;
  /** `prompt_requests.is_draft` — a private draft only its author can see; drafts never appear in any list but the author's own "Taslaklar". */
  isDraft?: boolean;
  /** "Herkese açık" / "Sadece ben" — `prompt_requests.visibility`; absent = public. */
  visibility?: ContentVisibility;
  /** Topluluğa özgü içerik: doluysa içerik yalnız o topluluğun okuyucularına görünür; profilde/aramada/koleksiyonda yer almaz (`docs/history/179-*`). */
  communityId?: string | null;
}

export type NotificationType =
  | "follow"
  | "like"
  | "comment"
  | "comment_reply"
  | "request_response"
  | "message"
  | "message_request"
  | "system"
  | "prompt_edited"
  | "request_edited"
  | "edit_suggestion_received"
  | "edit_suggestion_accepted"
  | "edit_suggestion_rejected"
  | "prompt_result_shared"
  | "story_reaction"
  | "story_poll_vote"
  | "story_question_answer"
  /** İçeriğin alıntılandı (docs/history/217-*). */
  | "quote";

export interface AppNotification {
  id: string;
  type: NotificationType;
  actor: UserProfile | null;
  message: string;
  targetHref: string;
  isRead: boolean;
  createdAt: string;
}

/** Grup üyelik rolleri (docs/history/172-*): owner > admin > moderator > member. */
export type GroupRole = "owner" | "admin" | "moderator" | "member";
/**
 * Topluluk görünürlüğü (docs/history/176-*): `public` herkese açık (Keşfet'te görünür, içerik herkese okunur) · `restricted` kapalı (Keşfet'te
 * yok, arama/öneride var, içerik üyelere, katılım başvuruyla) · `private` tamamen kapalı (hiçbir yerde görünmez, yalnız davet).
 */
export type GroupVisibility = "public" | "restricted" | "private";
/** Kim mesaj yazabilir: tüm üyeler ya da yalnızca owner/admin/moderator. */
export type GroupPostingPolicy = "members" | "admins";

/** Owner'ın admin/moderatöre verip geri alabildiği yetenekler (docs/history/173-*). */
export type GroupCapability =
  | "edit_settings"
  | "change_visibility"
  | "manage_invites"
  | "manage_requests"
  | "remove_members"
  | "ban_members"
  | "manage_roles"
  | "delete_messages"
  | "pin_messages"
  // Topluluk yetenekleri (docs/history/175-*)
  | "moderate_posts"
  | "pin_posts"
  | "manage_announcements"
  | "manage_events"
  | "edit_rules"
  | "view_stats";
export type RolePermissions = Record<"admin" | "moderator", Record<GroupCapability, boolean>>;

/** Topluluk kategorisi (DB'de sabit liste; etiket/taksonomi sisteminden bağımsız). */
export type CommunityCategory = "general" | "image" | "text" | "audio" | "video" | "workflow" | "learning" | "showcase";
/** Kim akışta paylaşım yapabilir: tüm üyeler ya da yalnızca owner/admin/moderatör. */
export type CommunityFeedPolicy = "members" | "admins";
/** Topluluk bildirim tercihi: tümü · yalnız önemli (duyuru, anma, hatırlatma, karar) · sessiz. */
export type CommunityNotifyLevel = "all" | "important" | "none";

/** Bir grup sohbetinin grup tarafı (`chat_groups` + bu kullanıcının üyeliği). Aynı satır topluluktur (docs/history/175-*). */
export interface ChatGroup {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  visibility: GroupVisibility;
  postingPolicy: GroupPostingPolicy;
  memberLimit: number;
  memberCount: number;
  /** Yalnızca yetkililer için anlamlı; diğerlerinde gösterilmez. */
  pendingRequestCount: number;
  /** Yeni üye katılmadan ÖNCEKİ mesajları görebilir mi (yalnız owner değiştirir). */
  historyVisible: boolean;
  /** Owner ayarı: yetkisiz (normal) üyeler de mesaj sabitleyebilir mi (docs/history/174-*). */
  membersCanPin: boolean;
  /** Admin ve moderatör yetkileri (yalnız owner değiştirir; owner her zaman her şeyi yapar). */
  rolePermissions: RolePermissions;
  createdAt: string;
  /** Bu kullanıcının grup içindeki rolü. */
  myRole: GroupRole;
  /** Topluluk alanları (docs/history/175-*). */
  category: CommunityCategory;
  feedPolicy: CommunityFeedPolicy;
  rules: string | null;
  rulesVersion: number;
  rulesRequired: boolean;
  /** Kapak fotoğrafı (özel `community-avatars` bucket'ı, signed URL ile gösterilir) ve kapak rengi (#rrggbb). Öncelik: fotoğraf > renk > otomatik. */
  coverUrl: string | null;
  coverColor: string | null;
  /** Kapatılmış (salt-okunur) topluluk: ne zaman. */
  closedAt: string | null;
  postCount: number;
  /** 'legacy_group' = topluluk sistemine geçmeden önce oluşturulmuş eski grup sohbeti. */
  origin: "native" | "legacy_group";
}

export interface Conversation {
  id: string;
  /** "direct" = birebir sohbet (participants[0] karşı taraf); "group" = grup sohbeti (participants boş, `group` dolu). */
  kind: "direct" | "group";
  group: ChatGroup | null;
  participants: UserProfile[];
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  /** This viewer's own membership status — "pending" means it's an unaccepted message request in their inbox (Bölüm 21 Faz B). */
  myStatus: "accepted" | "pending";
  /** Per-viewer state on their own membership row (docs/history/171-*): never visible to, or changing anything for, the other side. */
  archivedAt: string | null;
  deletedAt: string | null;
  /** Kişisel sessize alma (grup sohbetleri): listede kalır ama başlıktaki okunmamış noktasını yakmaz ve geri dönmez. */
  mutedAt: string | null;
  /** Messages created before this are hidden from THIS viewer only; the message rows themselves stay. */
  clearedAt: string | null;
}

/** Sabitlenmiş mesaj (`pinned_messages`): mesajın kendisi kopyalanmaz, yalnız başvuru + kim/ne zaman sabitledi. */
export interface PinnedMessage {
  messageId: string;
  conversationId: string;
  pinnedBy: string | null;
  pinnedAt: string;
}

/** Bir mesajın okundu ayrıntısı satırı (`message_read_receipts`): yalnız mesajın göndericisi görür. */
export interface MessageReceipt {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  hasRead: boolean;
  readAt: string | null;
}

/** Sohbet içi arama sonucu (`search_conversation_messages`). */
export interface ConversationSearchHit {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

/** Yıldızlı mesajlar ekranındaki satır (`list_starred_messages`): birebir ve grup mesajları tek listede. */
export interface StarredMessage {
  messageId: string;
  conversationId: string;
  starredAt: string;
  senderId: string;
  senderName: string;
  body: string | null;
  hasAttachments: boolean;
  hasShared: boolean;
  createdAt: string;
  kind: "direct" | "group";
  /** Grup adı (grup) ya da karşı tarafın görünen adı (birebir). */
  chatName: string;
  chatAvatarUrl: string | null;
}

/**
 * A real, permanent collection a user organizes saved prompts into
 * (`collections` — supabase/migrations/20260919260000_collections.sql).
 * The general "Kaydedilenler" bookmark is itself membership in the user's
 * default ("Genel", `is_default`) collection — there is no separate saves
 * table any more (`prompt_saves` was dropped by migration 20260919840000).
 * A prompt can belong to zero, one or several collections.
 */
export interface Collection {
  id: string;
  owner: UserProfile;
  name: string;
  visibility: "public" | "private";
  itemCount: number;
  /** Real, trigger-maintained `collections.follower_count` — people following this (public) collection. */
  followerCount: number;
  /** The most recently added item's first media, or null for an empty/text-only collection — never a separate uploaded cover. */
  coverImage: PromptMedia | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Every user has exactly one of these — their "Genel" bucket, auto-created
   * at signup (`handle_new_user`) and backfilled for older accounts
   * (`ensure_default_collection`, `collections.is_default` +
   * `collections_one_default_per_owner`, CLAUDE.md Bölüm 9.22). This is the
   * ONLY durable way to recognize it — its `name` is freely renameable by
   * the owner (e.g. "Favorilerim"), so nothing in this codebase may ever
   * compare `name === "Genel"` to decide default-ness. Membership in this
   * one collection is now the single source of truth for the general
   * "kaydedildi" (bookmark-filled) state — see `use-save-state.ts`. It can
   * never be deleted (blocked by a DB trigger, defense-in-depth against the
   * frontend never offering the option either).
   */
  isDefault: boolean;
}

/**
 * A real, user-defined `{name}` token inside a prompt's `promptText`
 * (`public.prompt_variables` — CLAUDE.md "Prompt Değişken Sistemi"). Scoped
 * to prompts only (covers original/request-answer content alike, since
 * both are the same `prompts` row) — `prompt_requests` has no separate
 * "prompt metni" field to attach variables to, a deliberate scope
 * decision.
 */
/**
 * A prompt variable's input kind (CLAUDE.md §9.145). Whatever the kind, the
 * value substituted into the prompt text is always a plain string, so the
 * `{name}` token engine (`lib/prompt-variables.ts`) is kind-agnostic:
 *  - `text`: free text.
 *  - `select`: exactly one option; the option's `value` goes into the prompt.
 *  - `multi_select`: several options; their `value`s joined with ", ".
 *  - `number` / `slider`: a number within `config.min`..`config.max`.
 *  - `toggle`: `config.onText` when on, `config.offText` (may be empty) when off.
 */
export type PromptVariableType = "text" | "select" | "multi_select" | "number" | "slider" | "toggle";

/**
 * One choice of a `select`/`multi_select` variable: `label` is what the viewer
 * sees, `value` is what is written into the prompt. `image` (a small data URL)
 * and `color` (`#rrggbb`) are optional, UI-only and always added by the
 * prompt's author — never pre-filled; an option has at most one of them, and
 * the picker only switches to cards/swatches when EVERY option has it. They
 * never reach the prompt text.
 */
export interface PromptVariableOption {
  label: string;
  value: string;
  image?: string;
  color?: string;
}

/**
 * "Show this variable only when another variable has this value" (§9.145, 1c).
 * `variable` is the controlling variable's NAME (it must come EARLIER in the
 * list, so dependencies can never loop); `equals` is that variable's
 * prompt-facing value (an option's `value`, a toggle's on/off text, or free
 * text). For a multiple-choice controller it matches when the value is among
 * the selected ones. While hidden, the variable resolves to an empty string.
 */
export interface PromptVariableCondition {
  variable: string;
  equals: string;
}

/** Kind-specific settings (only the keys relevant to the variable's `type` are ever set) plus the optional visibility `condition`, which applies to every kind. */
export interface PromptVariableConfig {
  min?: number;
  max?: number;
  step?: number;
  onText?: string;
  offText?: string;
  condition?: PromptVariableCondition;
}

/** The kind-specific part of a variable, shared by the stored row and the editor's draft. */
export interface PromptVariableSpec {
  type: PromptVariableType;
  options: PromptVariableOption[];
  config: PromptVariableConfig;
}

export interface PromptVariable extends PromptVariableSpec {
  id: string;
  promptId: string;
  name: string;
  defaultValue: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One real, backend-verified edit event (`public.content_edits`) — only
 * ever created by a database trigger comparing OLD/NEW column values, never
 * by the client claiming "I made a meaningful edit". `previousValues` is
 * intentionally not exposed here (kept DB-only) — the UI only ever shows
 * which fields changed and when, never the full previous text, keeping the
 * "gizli/taslak içeriğin önceki sürümünü sızdırma" rule trivially true.
 */
export interface ContentEditEvent {
  id: string;
  contentType: "prompt" | "prompt_request";
  contentId: string;
  ownerId: string;
  editorId: string;
  changedFields: string[];
  createdAt: string;
}

/**
 * One real, full snapshot of a prompt's content (`public.prompt_versions`)
 * — "Düzenleme Önerisi ve Sürüm Geçmişi" module. Unlike `ContentEditEvent`
 * (a lightweight, owner-only audit log of WHICH fields changed), this is a
 * complete, publicly-readable-wherever-the-prompt-is copy of title/
 * description/promptText/tool at that point in time, created either when
 * the prompt's own author edited it directly (`source: "owner_edit"`) or
 * when they accepted someone else's edit suggestion
 * (`source: "edit_suggestion_accepted"`, `suggestionId` set). `version 1`
 * is always the content immediately before the very first such edit — a
 * database trigger backfills it retroactively the first time this feature
 * ever touches a given prompt, never a fabricated earlier history.
 */
export interface PromptVersion {
  id: string;
  promptId: string;
  versionNumber: number;
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  source: "initial" | "owner_edit" | "edit_suggestion_accepted";
  suggestionId: string | null;
  createdBy: string;
  createdAt: string;
}

/** A Prompt İsteği version (`public.request_versions`): the same four-field snapshot idea as `PromptVersion`, for title / description / creative direction / preferred tool. */
export interface RequestVersion {
  id: string;
  requestId: string;
  versionNumber: number;
  title: string;
  description: string;
  creativeDirection: string | null;
  preferredTool: string | null;
  source: "initial" | "owner_edit";
  createdBy: string;
  createdAt: string;
}

/** A Workflow version (`public.workflow_versions`): title + description plus the whole step graph (`snapshot`). */
export interface WorkflowVersion {
  id: string;
  workflowId: string;
  versionNumber: number;
  title: string;
  description: string;
  snapshot: import("@/lib/version-history").WorkflowSnapshot;
  source: "initial" | "owner_edit";
  createdBy: string;
  createdAt: string;
}

/** A Hazır Ayar version (`public.preset_versions`): title + description plus the field tree and the chosen values (`snapshot`). */
export interface PresetVersion {
  id: string;
  presetId: string;
  versionNumber: number;
  title: string;
  description: string;
  snapshot: import("@/lib/version-history").PresetSnapshot;
  source: "initial" | "owner_edit";
  createdBy: string;
  createdAt: string;
}

export type PromptEditSuggestionStatus = "pending" | "accepted" | "rejected";

/**
 * A real, standalone "please consider changing this" proposal made by
 * someone OTHER than the prompt's own author (`public.
 * prompt_edit_suggestions`) — deliberately NOT a remix/fork: the proposer
 * never creates a prompt of their own, and nothing here ever mutates the
 * real prompt unless its actual owner explicitly accepts it (see
 * `acceptEditSuggestion`/`rejectEditSuggestion`, `src/lib/supabase/
 * prompt-edit-suggestions.ts`). `proposedPromptText` is optional — the
 * proposer may write out a full suggested replacement, or just leave a
 * plain-language note; either way the owner always sees and can still edit
 * the final text before it's ever applied.
 */
export interface PromptEditSuggestion {
  id: string;
  promptId: string;
  proposer: UserProfile;
  ownerId: string;
  suggestionText: string;
  proposedPromptText: string | null;
  status: PromptEditSuggestionStatus;
  createdAt: string;
  resolvedAt: string | null;
  acceptedVersionId: string | null;
}

// === Katalog alan tipleri (Generator kaldırıldı — CLAUDE.md §9.145) =========
//
// Generator içerik türü kaldırıldı; geriye yalnızca hazır alan kütüphanesinin
// (`generator-field-catalog.ts`) ve görselden alan çıkarmanın (`generator-vision-
// mapping.ts`) kullandığı alan şekli kaldı. Bunlar artık prompt değişkenlerinin
// "hazır alan" kaynağıdır; veritabanında karşılıkları yoktur.

export type GeneratorFieldType =
  | "text"
  | "textarea"
  | "select"
  | "multi_select"
  | "number"
  | "slider"
  | "color"
  | "checkbox"
  | "toggle"
  | "radio"
  | "url";

/**
 * A field only renders/counts toward the generated prompt when its one
 * optional condition (if set) is satisfied by the current runtime values —
 * a deliberately minimal version of §34's conditional-field system (one
 * condition per field, `equals` only) that's still fully generic: any field
 * can gate any other field, by key, for any generator. Chained/AND/OR
 * conditions and the "dependent options" idea from §35 are NOT built —
 * documented as a conscious scope decision (CLAUDE.md).
 */
export interface GeneratorFieldCondition {
  fieldKey: string;
  equals: string;
}

/**
 * One selectable option for a select/multi_select/radio field — `label` is
 * what the creator/user actually sees ("Yeşil"), `value` is the real,
 * canonical machine value that gets written into the structured JSON output
 * (`subject.eye_color: "green"`) and into runtime `GeneratorValues`. The two
 * are deliberately separate (per the JSON Output Engine architecture
 * correction, CLAUDE.md) — a Turkish display label should never leak into a
 * generator's structured output as-is unless the creator's `value` happens
 * to equal it.
 */
export interface GeneratorFieldOption {
  label: string;
  value: string;
  /**
   * Optional, UI-only thumbnail (a data URL — uploaded or auto-generated,
   * same "no external image-service dependency" rule as this app's other
   * offline placeholder art) shown when picking this option. Purely
   * representational: the JSON Output Engine and prompt generation
   * (`generator-output.ts`) never read this, only ever `value`/`label` —
   * see CLAUDE.md's "Generator Hazır Alanları + Varsayılan Görsel
   * Seçenekleri" module. Optional and additive, so a generator saved before
   * this feature existed (no option ever carries it) renders exactly as it
   * always did — plain text/chip UI, never broken.
   */
  image?: string;
  /**
   * Optional, UI-only swatch color (hex, e.g. `#5A3825`) shown next to this
   * option's label — for color-name options (Saç Rengi: Kahverengi, Göz
   * Rengi: Mavi, …), never for the free-pick `"color"` field type (that
   * already has its own live color input, no options at all). Same
   * UI-only/backward-compatible rule as `image` above.
   */
  color?: string;
}

export interface GeneratorField {
  id: string;
  key: string;
  label: string;
  description: string;
  type: GeneratorFieldType;
  required: boolean;
  /** select/multi_select/radio only. */
  options: GeneratorFieldOption[];
  /** A single value for most types; multiple selected values for multi_select — always the option's `value`, never its `label`. */
  defaultValue: string | string[];
  placeholder: string;
  min: number | null;
  max: number | null;
  step: number | null;
  order: number;
  condition: GeneratorFieldCondition | null;
  /**
   * Where this field's real value is written in the generator's structured
   * JSON output (dot-notation, e.g. `subject.eye_color`) — the JSON Output
   * Engine's (`src/lib/generator-output.ts`) whole reason for existing.
   * Falls back to the field's own `key` (a flat, top-level property) when
   * empty/unset. Fully creator-defined — nothing in this app ever assumes a
   * particular top-level key exists.
   */
  jsonPath: string;
}

/** A photo attached to a message — `path` is the object key inside the private `message-images` bucket (read through short-lived signed URLs, never stored as a URL). */
export interface MessageAttachment {
  path: string;
  width: number | null;
  height: number | null;
  mime: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  /** Null when this message is only a shared prompt/request with no caption text. */
  body: string | null;
  /** Set when this message shares a real prompt — mutually exclusive with sharedRequestId. */
  sharedPromptId: string | null;
  /** Set when this message shares a real prompt request — mutually exclusive with sharedPromptId. */
  sharedRequestId: string | null;
  /** The message this one is replying to, if any. */
  replyToMessageId: string | null;
  /** Photos sent with (or instead of) text — empty for every message that has none. */
  attachments: MessageAttachment[];
  editedAt: string | null;
  /** Set when the sender deleted this message "for everyone" — body/sharedPromptId/sharedRequestId/attachments are cleared server-side when this happens. */
  deletedAt: string | null;
  createdAt: string;
  /** Bir topluluk duyurusuna bağlı mesajsa duyurunun kimliği (gövde = duyuru başlığı); sohbette kart olarak çizilir. */
  announcementId: string | null;
  /** Hikâyeye özel yanıt (docs/history/198-*): yanıtlanan hikâye; hikâye silinince null olur ama `isStoryReply` kalır. */
  storyId: string | null;
  isStoryReply: boolean;
}

/* ---------------------------------------------------------------------- */
/* Workflows — see supabase/migrations/20260919470000_workflows.sql        */
/* ---------------------------------------------------------------------- */

export type WorkflowStepType = "prompt" | "request";

/** One named input or output of a step. */
export interface WorkflowIO {
  id: string;
  label: string;
}

/** An input, optionally fed by an EARLIER step's output. */
export interface WorkflowInput extends WorkflowIO {
  source: { stepId: string; outputId: string } | null;
}

/** Light summary of the prompt / generator / request a step points to (never a copy). */
export interface WorkflowContentRef {
  type: WorkflowStepType;
  id: string;
  title: string;
  contentType: PromptContentType | null;
  category: string | null;
  authorName: string;
  authorUsername: string;
  thumbnailUrl: string | null;
  /** false for an unpublished generator/draft — others can't open it. */
  published: boolean;
  href: string;
}

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  instructions: string;
  stepType: WorkflowStepType;
  /** null while the step has no content yet (or its content was deleted — see `contentMissing`). */
  content: WorkflowContentRef | null;
  /** The step referenced content that no longer exists / isn't visible. */
  contentMissing: boolean;
  inputs: WorkflowInput[];
  outputs: WorkflowIO[];
}

export interface Workflow {
  id: string;
  creator: UserProfile;
  title: string;
  description: string;
  /** Real, ordered cover images (`workflow_media`) — zero or more. `coverUrl` below is kept, unchanged, as a derived convenience (`media[0]?.url`) so every pre-existing single-cover call site keeps working untouched. */
  media: PromptMedia[];
  /** Derived convenience — `media[0]?.url`. Prefer `media` for new code. */
  coverUrl: string | null;
  contentTypes: PromptContentType[];
  category: string | null;
  subcategory: string | null;
  tools: string[];
  status: "draft" | "published";
  /** "Herkese açık" / "Sadece ben" — `workflows.visibility`. */
  visibility: ContentVisibility;
  stepCount: number;
  likeCount: number;
  /** Kaç kez alıntılandı (`quote_count`, docs/history/217-*; korumalı sayaç). */
  quoteCount?: number;
  /** Real, trigger-maintained `workflows.save_count` — same "one per distinct user" rule as `Prompt.saveCount`/`Generator.saveCount`. */
  saveCount: number;
  commentCount: number;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
  /** Topluluğa özgü içerik: doluysa içerik yalnız o topluluğun okuyucularına görünür; profilde/aramada/koleksiyonda yer almaz (`docs/history/179-*`). */
  communityId?: string | null;
}

/**
 * Hazır Ayar (Preset) — Promptly's 5th first-class content type (CLAUDE.md
 * Bölüm 9.83). A reusable, structured settings pack: a content type +
 * (shared-taxonomy) category + recommended tools + a `selection` — the very
 * same `{ settingGroupId: optionId }` shape the Prompt form's "Ek Ayar
 * Önerileri" (Bölüm 9.62) uses, so one preset applies to the Prompt form and
 * to a Generator against the same fixed group/option catalog. It is a
 * STARTING configuration, never a locked one.
 */
export interface Preset {
  id: string;
  creator: UserProfile;
  title: string;
  description: string;
  coverUrl: string | null;
  contentType: PromptContentType;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  /**
   * The user's own fields (`preset_fields` + `preset_options`), each with its
   * own option list. Empty for a preset saved before custom fields existed or
   * built only from platform fields — those are resolved from the catalog
   * (`resolvePresetFields`).
   */
  fields: PresetField[];
  /** `{ fieldId: value }` — the default values (see `src/lib/preset-fields.ts`); old presets' `{ groupId: optionId }` is the same shape. */
  selection: PresetSelection;
  status: "draft" | "published";
  visibility: "public" | "private";
  /** Real, trigger-maintained counters (`presets.*_count`). */
  likeCount: number;
  /** Kaç kez alıntılandı (`quote_count`, docs/history/217-*; korumalı sayaç). */
  quoteCount?: number;
  commentCount: number;
  saveCount: number;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
  /** Topluluğa özgü içerik: doluysa içerik yalnız o topluluğun okuyucularına görünür; profilde/aramada/koleksiyonda yer almaz (`docs/history/179-*`). */
  communityId?: string | null;
}

/* ---------------------------------------------------------------------- */
/* Hikâyeler — see supabase/migrations/20260920170000_stories.sql          */
/* ---------------------------------------------------------------------- */

export type StoryKind = "image" | "video" | "text";
export type StoryAudience = "public" | "followers" | "community";
export type StoryLinkedType = "prompt" | "request" | "workflow" | "preset";
/** Metin hikâyesi zemini — adlandırılmış (hex saklanmaz); her izleyicide aynı görünür (`--color-story-*`). */
export type StoryBackground = "cobalt" | "sunset" | "ink" | "paper" | "forest" | "berry";
export type StoryTextColor = "white" | "black" | "yellow" | "cobalt" | "orange" | "mint";
export type StoryTextSize = "s" | "m" | "l" | "xl";
export type StoryTextAlign = "left" | "center" | "right";

/** Tuval üzerindeki bir metin katmanı; `x`/`y` tuvalin 0–1 oranıdır (katmanın merkezi). */
export interface StoryTextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  align: StoryTextAlign;
  size: StoryTextSize;
  color: StoryTextColor;
  /** Okunabilirlik için yarı saydam zemin. */
  bg: boolean;
}

export interface StoryPoint {
  x: number;
  y: number;
}

/** Sürümlü düzen (sunucuda `_story_layout_ok` aynı kuralları uygular). */
export interface StoryLayout {
  v: 1;
  bg?: StoryBackground;
  fit?: "cover" | "contain";
  layers: StoryTextLayer[];
  link?: StoryPoint;
  sticker?: StoryPoint;
}

export type StorySticker = { kind: "poll"; question: string; options: string[] } | { kind: "question"; question: string };

export interface StoryAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Story {
  id: string;
  authorId: string;
  author: StoryAuthor | null;
  kind: StoryKind;
  /** Kimlik URL'si (private `story-media`); gösterirken `Storage*` bileşenleriyle imzalanır. */
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
  /** Topluluk adı — yalnız topluluğu okuyabilen (üye) için dolu. */
  communityName: string | null;
  createdAt: string;
  expiresAt: string;
  moderationStatus: "visible" | "removed";
  /** Sayılar yalnız sahibine anlamlıdır (başkasına da okunur ama gösterilmez). */
  viewerCount: number;
  viewCount: number;
  reactionCount: number;
  resharedFrom: string | null;
}

/** Hikâye şeridinde kişi başına bir halka (`story_tray`). */
export interface StoryTrayItem {
  author: StoryAuthor;
  storyIds: string[];
  unseenCount: number;
  latestAt: string;
  communityStoryCount: number;
}

export interface StoryHighlight {
  id: string;
  ownerId: string;
  title: string;
  coverStoryId: string | null;
  position: number;
  /** Çağıranın görebildiği öğeler, sıralı. */
  storyIds: string[];
}

export interface StoryViewer {
  user: StoryAuthor;
  firstViewedAt: string;
  lastViewedAt: string;
  viewCount: number;
  reaction: string | null;
}

export interface StoryPollResults {
  revealed: boolean;
  myVote: number | null;
  total: number | null;
  counts: number[] | null;
}

export interface StoryQuestionAnswer {
  id: string;
  storyId: string;
  responder: StoryAuthor | null;
  body: string;
  createdAt: string;
}

/** Taslağın düzenleyici durumu (sahibine özel `story_drafts.payload`; yüklenirken yeniden doğrulanır). */
export interface StoryDraftPayload {
  v: 1;
  kind: StoryKind;
  layout: StoryLayout;
  linkedType: StoryLinkedType | null;
  linkedId: string | null;
  sticker: StorySticker | null;
  audience: StoryAudience;
  communityId: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaDurationMs: number | null;
}

export interface StoryDraft {
  id: string;
  payload: StoryDraftPayload;
  mediaUrl: string | null;
  mediaMime: string | null;
  updatedAt: string;
}
