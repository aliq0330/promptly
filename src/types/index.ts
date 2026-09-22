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
}

export type PromptOrigin =
  | { type: "original" }
  | { type: "remix"; sourcePromptId: string; rootPromptId: string }
  | { type: "request-response"; requestId: string; responseId: string };

/**
 * Promptly isn't image-only: writing, video, code and music generation
 * prompts share the platform (see CLAUDE.md section 1). Only "image"
 * prompts render a media preview — the rest use a compact text-first card.
 */
export type PromptContentType = "image" | "text" | "video" | "code" | "music";

export interface Prompt {
  id: string;
  author: UserProfile;
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  contentType: PromptContentType;
  media: PromptMedia[];
  tags: Tag[];
  origin: PromptOrigin;
  likeCount: number;
  commentCount: number;
  remixCount: number;
  isLiked: boolean;
  isSaved: boolean;
  status: "draft" | "published";
  /**
   * Whether this prompt appears in normal profile/feed/discover/search
   * results — `prompts.show_on_profile`. Only meaningful for a request
   * answer (`origin.type === "request-response"`): the author can choose
   * to keep an answer out of their own portfolio while it still stays
   * fully visible in the request's own answer list and at its own detail
   * page. Always `true` for original/remix prompts.
   */
  showOnProfile: boolean;
  createdAt: string;
  /**
   * Set when this prompt was "safely" deleted while it still had real
   * remixes pointing at it (`source_prompt_id` can never be nulled out for
   * a remix — see `prompts_origin_shape`) — the row survives with its
   * content cleared instead of being removed, so the remix chain never
   * breaks. `title`/`description`/`promptText` are empty when this is set;
   * every normal listing (feed/discover/profile/search/saved/liked)
   * already filters these out, so this only ever needs to be checked at a
   * direct link or in a remix-source preview. `null` for a normal prompt.
   */
  deletedAt: string | null;
  /**
   * Set only when this prompt was produced via "Prompt olarak aç" from a
   * real generator run (`prompts.generator_id`/`generator_version_id`/
   * `generator_run_id` — Generator Builder + Runtime module) — purely
   * informational provenance metadata, orthogonal to `origin` (a
   * generator-produced prompt is still `origin: "original"` unless it's
   * ALSO a remix of something else).
   */
  generatedFrom: { generatorId: string; generatorVersionId: string; generatorRunId: string; generatorTitle: string; generatorSlug: string } | null;
}

/**
 * A comment belongs to exactly one of a prompt or a request — never both
 * (enforced by `prompt_comments_exactly_one_target`, see CommentSection).
 */
export interface PromptComment {
  id: string;
  promptId?: string;
  requestId?: string;
  generatorId?: string;
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

export type PromptRequestStatus = "open" | "answered" | "closed";

export interface PromptRequest {
  id: string;
  author: UserProfile;
  title: string;
  description: string;
  creativeDirection: string;
  preferredTool: string | null;
  /** Requested content type (image/text/video/code/music) — same union as `Prompt.contentType`. */
  contentType?: PromptContentType;
  /** Optional reference image, added by the requester for creative direction. */
  referenceImage?: PromptMedia;
  tags: Tag[];
  status: PromptRequestStatus;
  responseCount: number;
  createdAt: string;
  /**
   * The id of the answer (a real `Prompt` with a `request-response` origin)
   * the requester picked as the best fit — `prompt_requests.
   * selected_response_prompt_id`. Only ever set by the request's own
   * author (RLS-enforced).
   */
  selectedResponsePromptId?: string;
}

export type NotificationType =
  | "follow"
  | "like"
  | "comment"
  | "comment_reply"
  | "remix"
  | "request_response"
  | "message"
  | "message_request"
  | "system"
  | "merge_request_received"
  | "merge_request_accepted"
  | "merge_request_rejected"
  | "merge_request_withdrawn"
  | "merge_request_cancelled"
  | "prompt_edited"
  | "request_edited";

export type MergeRequestStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "cancelled";

/**
 * A real merge request — remix owner offering their contribution back to
 * an ancestor prompt (Remix Dallanma Haritası / Merge sistemi). Mirrors
 * `merge_requests` (supabase/migrations/20260919250000_remix_merge_
 * system.sql) 1:1; every status transition happens through a dedicated
 * RPC (create/accept/reject/withdraw), never a raw client UPDATE.
 */
export interface MergeRequest {
  id: string;
  sourcePromptId: string;
  targetPromptId: string;
  requester: UserProfile;
  targetOwner: UserProfile;
  status: MergeRequestStatus;
  contributionSummary: string;
  description: string | null;
  decisionReason: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  withdrawnAt: string | null;
  resultingVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One entry in a prompt's real merge-derived version history (`prompt_versions`) — only ever created by an accepted merge, never by a plain edit (this app has no "edit prompt" feature at all). */
export interface PromptVersion {
  id: string;
  promptId: string;
  versionNumber: number;
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  changeSummary: string | null;
  mergeRequestId: string | null;
  previousVersionId: string | null;
  createdBy: UserProfile | null;
  createdAt: string;
}

/**
 * One node in the real remix branching graph (Remix Dallanma Haritası) —
 * a lightweight projection of a `Prompt` (never the full prompt object,
 * so a node the viewer can't fully open still renders safely) plus its
 * structural position in the tree.
 */
export interface RemixGraphNode {
  id: string;
  title: string;
  author: UserProfile;
  originType: "original" | "remix";
  sourcePromptId: string | null;
  rootPromptId: string | null;
  isDeleted: boolean;
  isAccessible: boolean;
  remixCount: number;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  actor: UserProfile | null;
  message: string;
  targetHref: string;
  isRead: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  participants: UserProfile[];
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  /** This viewer's own membership status — "pending" means it's an unaccepted message request in their inbox (Bölüm 21 Faz B). */
  myStatus: "accepted" | "pending";
}

/**
 * A real, permanent collection a user organizes saved prompts into
 * (`collections` — supabase/migrations/20260919260000_collections.sql).
 * Independent from the general "Kaydedilenler" bookmark (`prompt_saves`,
 * see saves.ts) by design — a prompt can belong to zero, one or several
 * collections regardless of whether it's also generally saved.
 */
export interface Collection {
  id: string;
  owner: UserProfile;
  name: string;
  visibility: "public" | "private";
  itemCount: number;
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
 * to prompts only (covers original/remix/request-answer content alike,
 * since all three are the same `prompts` row) — `prompt_requests` has no
 * separate "prompt metni" field to attach variables to, a deliberate scope
 * decision.
 */
export interface PromptVariable {
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

// === Generator (Generator Builder + Generator Runtime) =====================
//
// A generator's whole builder schema (categories + fields + template
// sections) is stored as real, versioned JSONB on `generator_versions`
// (`public.generator_versions.schema`/`template` —
// supabase/migrations/20260919300000_generators.sql) rather than as
// separate normalized tables — see that migration's own header comment for
// the reasoning. These types mirror that JSON shape exactly; nothing here
// is hard-coded per generator, every category/field is fully user-defined.

export type GeneratorCategoryTopic = "image" | "text" | "video" | "audio" | "code" | "design" | "marketing" | "writing" | "other";

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

export interface GeneratorSchema {
  fields: GeneratorField[];
}

export interface GeneratorTemplateSection {
  id: string;
  title: string;
  content: string;
  order: number;
  enabled: boolean;
}

export interface GeneratorTemplate {
  sections: GeneratorTemplateSection[];
}

/** Real key/value input a generator was run with — GeneratorFieldType-shaped values, keyed by field `key`. */
export type GeneratorValues = Record<string, string | string[]>;

/**
 * A generator's real, primary output — a fully creator-defined, arbitrarily
 * nested JSON object built by `buildGeneratorOutput()`
 * (`src/lib/generator-output.ts`) from the schema's per-field `jsonPath`s.
 * `prompt` (and, when the generator enables it, `negative_prompt`) are the
 * only two reserved/always-present keys — everything else is whatever the
 * creator's own fields define (`subject`/`environment`/`style_preset` in
 * the spec's own examples are illustrative only, never hard-coded here).
 */
export type GeneratorOutput = Record<string, unknown>;

export type GeneratorOrigin =
  | { type: "original" }
  | { type: "remix"; sourceGeneratorId: string; rootGeneratorId: string };

export interface Generator {
  id: string;
  creator: UserProfile;
  title: string;
  slug: string;
  description: string;
  coverUrl: string | null;
  category: GeneratorCategoryTopic;
  subcategory: string | null;
  tags: Tag[];
  visibility: "public" | "unlisted" | "private";
  status: "draft" | "published" | "archived";
  allowRemix: boolean;
  allowPromptEditing: boolean;
  allowSavingGeneratedPrompts: boolean;
  enableNegativePrompt: boolean;
  origin: GeneratorOrigin;
  currentVersionId: string | null;
  useCount: number;
  saveCount: number;
  remixCount: number;
  likeCount: number;
  commentCount: number;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One real, immutable (once published) version of a generator's schema+template — `public.generator_versions`. */
export interface GeneratorVersion {
  id: string;
  generatorId: string;
  versionNumber: number;
  schema: GeneratorSchema;
  template: GeneratorTemplate;
  createdBy: string;
  createdAt: string;
}

/** One real, logged use of a generator (`public.generator_runs`) — private to whoever ran it; only the denormalized `Generator.useCount` is ever public. */
export interface GeneratorRun {
  id: string;
  generatorId: string;
  generatorVersionId: string;
  userId: string;
  inputValues: GeneratorValues;
  generatedPrompt: string;
  generatedNegativePrompt: string | null;
  createdAt: string;
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
  editedAt: string | null;
  /** Set when the sender deleted this message "for everyone" — body/sharedPromptId/sharedRequestId are cleared server-side when this happens. */
  deletedAt: string | null;
  createdAt: string;
}
