import type { LucideIcon } from "lucide-react";
import { SlidersHorizontal, Sparkles, SquareTerminal, Workflow as WorkflowIcon } from "lucide-react";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { presetHref, promptHref, requestHref, workflowHref } from "@/lib/utils";
import type { CommunityPostContent, CommunityPostType } from "@/lib/supabase/communities";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PromptMedia, Tag, UserProfile } from "@/types";

/** Dört içerik türünün başvuru kartı ve başvuru sayfası için ortak özeti (kart/sayfa tür bilmeden çizilir). */
export interface ContentSummary {
  type: CommunityPostType;
  /** İçeriğin kendi sayfası ("Orijinal içeriği aç"). */
  href: string;
  title: string;
  description: string;
  author: UserProfile | null;
  /** Kapak/çıktı görselleri (kart ilk kapağı, sayfa hepsini gösterir). */
  media: PromptMedia[];
  /** Video/ses: kapak bir afiştir (oynat işareti). */
  playable: boolean;
  tags: Tag[];
  tools: string[];
  typeIcon: LucideIcon;
  typeLabelKey: TranslationKey;
  /** İçeriğin alt türü/kategorisi (etiket satırında). */
  detail: string | null;
  /** Yalnız ilgili türde: prompt metni, isteğin yaratıcı yönü, workflow adım sayısı, hazır ayar alan sayısı. */
  promptText?: string;
  creativeDirection?: string;
  stepCount?: number;
  fieldCount?: number;
}

const TYPE_LABEL: Record<CommunityPostType, TranslationKey> = {
  prompt: "communities.feed.type.prompt",
  request: "communities.feed.type.request",
  workflow: "communities.feed.type.workflow",
  preset: "communities.feed.type.preset",
};

export function summarizeContent(content: CommunityPostContent): ContentSummary {
  if (content.type === "prompt") {
    const x = content.data;
    const playable = x.contentType === "video" || x.contentType === "audio";
    return {
      type: "prompt",
      href: promptHref(x),
      title: x.title,
      description: x.description,
      author: x.author ?? null,
      media: x.contentType === "image" ? x.media : playable ? x.media.slice(0, 1) : [],
      playable,
      tags: x.tags,
      tools: x.tools,
      typeIcon: CONTENT_TYPE_META[x.contentType]?.icon ?? SquareTerminal,
      typeLabelKey: TYPE_LABEL.prompt,
      detail: x.tool,
      promptText: x.promptText,
    };
  }
  if (content.type === "request") {
    const x = content.data;
    return {
      type: "request",
      href: requestHref(x),
      title: x.title,
      description: x.description,
      author: x.author ?? null,
      media: x.media,
      playable: false,
      tags: x.tags,
      tools: x.tools,
      typeIcon: Sparkles,
      typeLabelKey: TYPE_LABEL.request,
      detail: x.preferredTool,
      creativeDirection: x.creativeDirection,
    };
  }
  if (content.type === "workflow") {
    const x = content.data;
    return {
      type: "workflow",
      href: workflowHref(x),
      title: x.title,
      description: x.description,
      author: x.creator ?? null,
      media: x.media,
      playable: false,
      tags: x.tags,
      tools: x.tools,
      typeIcon: WorkflowIcon,
      typeLabelKey: TYPE_LABEL.workflow,
      detail: null,
      stepCount: x.stepCount,
    };
  }
  const x = content.data;
  return {
    type: "preset",
    href: presetHref(x),
    title: x.title,
    description: x.description,
    author: x.creator ?? null,
    media: x.coverUrl ? [{ id: `${x.id}-cover`, url: x.coverUrl, width: 4, height: 3, alt: "" }] : [],
    playable: false,
    tags: x.tags,
    tools: x.tools,
    typeIcon: SlidersHorizontal,
    typeLabelKey: TYPE_LABEL.preset,
    detail: null,
    fieldCount: x.fields.length,
  };
}
