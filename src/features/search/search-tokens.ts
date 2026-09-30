import type { ContentTypeId } from "@/lib/content-taxonomy";
import type { ContentSearchFilters } from "@/lib/supabase/taxonomy-query";
import { findTool } from "@/lib/ai-tool-catalog";
import type { Tag, UserProfile } from "@/types";

export type ContentKind = "prompt" | "request" | "generator";

/** One chip in the advanced search box. */
export type SearchToken =
  | { kind: "user"; user: UserProfile }
  | { kind: "tag"; tag: Tag }
  | { kind: "media"; type: ContentTypeId }
  | { kind: "content"; type: ContentKind }
  | { kind: "tool"; toolId: string };

export const ALL_KINDS: ContentKind[] = ["prompt", "request", "generator"];

export function tokenKey(token: SearchToken): string {
  switch (token.kind) {
    case "user":
      return `user:${token.user.id}`;
    case "tag":
      return `tag:${token.tag.slug}`;
    case "media":
      return `media:${token.type}`;
    case "content":
      return `content:${token.type}`;
    case "tool":
      return `tool:${token.toolId}`;
  }
}

/** A tool chip matches the tool itself and any of its models. */
function toolRefs(toolId: string): string[] {
  const tool = findTool(toolId);
  return tool ? [toolId, ...tool.models.map((m) => `${toolId}:${m.id}`)] : [toolId];
}

/**
 * Chips -> query. A pure function of the SET of chips (never their order):
 * chips of different kinds are AND-ed; several users / media types / content
 * types / tools are alternatives (OR) inside their own kind; several tags
 * must ALL be present (AND).
 */
export function tokensToQuery(tokens: SearchToken[]): { filters: ContentSearchFilters; kinds: ContentKind[] } {
  const authorIds: string[] = [];
  const contentTypes: ContentTypeId[] = [];
  const tagSlugs: string[] = [];
  const tools: string[] = [];
  const kinds: ContentKind[] = [];
  for (const token of tokens) {
    if (token.kind === "user") authorIds.push(token.user.id);
    else if (token.kind === "media") contentTypes.push(token.type);
    else if (token.kind === "tag") tagSlugs.push(token.tag.slug);
    else if (token.kind === "tool") tools.push(...toolRefs(token.toolId));
    else kinds.push(token.type);
  }
  const uniq = <T,>(list: T[]) => Array.from(new Set(list)).sort();
  return {
    filters: {
      authorIds: uniq(authorIds),
      contentTypes: uniq(contentTypes),
      tagSlugs: uniq(tagSlugs),
      toolRefs: uniq(tools),
    },
    kinds: kinds.length ? ALL_KINDS.filter((k) => kinds.includes(k)) : ALL_KINDS,
  };
}
