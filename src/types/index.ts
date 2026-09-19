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
  | "system";

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
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
