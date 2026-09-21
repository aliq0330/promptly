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
}

/**
 * A comment belongs to exactly one of a prompt or a request — never both
 * (enforced by `prompt_comments_exactly_one_target`, see CommentSection).
 */
export interface PromptComment {
  id: string;
  promptId?: string;
  requestId?: string;
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
  | "merge_request_cancelled";

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
