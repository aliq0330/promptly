"use client";

import { memo } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { promptHref } from "@/lib/utils";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import type { FeedItem } from "@/features/feed/types";
import { FocusGeneratorCard, FocusPresetCard, FocusRequestCard, FocusWorkflowCard } from "./focus-structure-cards";
import { FocusTextCard } from "./focus-text-card";
import { FocusVisualCard } from "./focus-visual-card";

function FocusPromptCard({ item }: { item: Extract<FeedItem, { kind: "prompt" }> }) {
  const { t } = useTranslation();
  const prompt = item.data;
  const image = prompt.media[0];
  // A prompt with a picture is shown as the picture; otherwise its own words are the hero.
  if (image) {
    const meta = CONTENT_TYPE_META[prompt.contentType];
    return (
      <FocusVisualCard
        item={item}
        href={promptHref(prompt)}
        image={image}
        creator={prompt.author}
        title={prompt.title}
        badgeIcon={meta.icon}
        badgeLabel={t(meta.labelKey)}
        moreImages={Math.max(0, prompt.media.length - 1)}
        playable={prompt.contentType === "video" || prompt.contentType === "audio"}
      />
    );
  }
  return <FocusTextCard prompt={prompt} />;
}

/**
 * Focus View's adaptive renderer: one entry point, the card shape follows the
 * content (picture → visual card, plain prompt → typography card, generator →
 * its parameters, workflow → its step chain, preset → its settings, request →
 * its brief). Memoised so a long mixed feed doesn't re-render when only an
 * unrelated list-level state (sort, filter chip) changes.
 */
export const FocusCard = memo(function FocusCard({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case "prompt":
      return <FocusPromptCard item={item} />;
    case "generator":
      return <FocusGeneratorCard generator={item.data} />;
    case "workflow":
      return <FocusWorkflowCard workflow={item.data} />;
    case "preset":
      return <FocusPresetCard preset={item.data} />;
    case "request":
      return <FocusRequestCard request={item.data} />;
  }
});
