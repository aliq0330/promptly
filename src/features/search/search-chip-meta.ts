import { Hash, SlidersHorizontal, Sparkles, SquareTerminal, User as UserIcon, Workflow as WorkflowIcon, Wrench, type LucideIcon } from "lucide-react";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { findTool } from "@/lib/ai-tool-catalog";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ContentKind, SearchToken } from "./search-tokens";

/** The post-type icons are the site-wide ones (Prompt · İstek · Workflow · Hazır ayar). */
export const KIND_ICON: Record<ContentKind, LucideIcon> = {
  prompt: SquareTerminal,
  request: Sparkles,
  workflow: WorkflowIcon,
  preset: SlidersHorizontal,
};
export const KIND_LABEL: Record<ContentKind, TranslationKey> = {
  prompt: "search.kindPrompt",
  request: "request.title",
  workflow: "workflow.singular",
  preset: "preset.singular",
};

/** Icon + visible label of one chip — shared by the chip strip, the suggestion list and the filter sheet. */
export function tokenChip(token: SearchToken, t: (key: TranslationKey) => string): { icon: LucideIcon; label: string } {
  switch (token.kind) {
    case "user":
      return { icon: UserIcon, label: `@${token.user.username}` };
    case "tag":
      return { icon: Hash, label: token.tag.label };
    case "media":
      return { icon: CONTENT_TYPE_META[token.type].icon, label: t(CONTENT_TYPE_META[token.type].labelKey) };
    case "content":
      return { icon: KIND_ICON[token.type], label: t(KIND_LABEL[token.type]) };
    case "tool":
      return { icon: Wrench, label: findTool(token.toolId)?.name ?? token.toolId };
  }
}
