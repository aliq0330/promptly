/**
 * Shared domain types for Promptly.
 * These mirror the planned Supabase schema (see CLAUDE.md section 6) but are
 * not yet backed by a real database — used for mock data and component props.
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
  createdAt: string;
}

export interface PromptComment {
  id: string;
  promptId: string;
  author: UserProfile;
  body: string;
  parentId: string | null;
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
  tags: Tag[];
  status: PromptRequestStatus;
  responseCount: number;
  createdAt: string;
}

export interface PromptRequestResponse {
  id: string;
  requestId: string;
  author: UserProfile;
  title: string | null;
  description: string | null;
  promptText: string;
  media: PromptMedia[];
  tags: Tag[];
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  createdAt: string;
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
