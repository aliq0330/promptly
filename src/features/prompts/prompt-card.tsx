"use client";

import { ToolChips } from "@/features/content/tool-chips";
import { promptHref } from "@/lib/utils";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { PostTargetMenu, postMeta } from "./post-header";
import { RequestResponseContext } from "./post-context";
import { PromptCardFooter } from "./prompt-card-footer";
import { PromptPreviewBox } from "./prompt-preview-box";
import { OutputPosterPreview, OutputThumbnailStrip } from "./multi-image-output-options";
import type { Prompt } from "@/types";

type CollectionRemoval = { onRemove: () => Promise<void> };

/**
 * PromptCard — one card for every prompt content type (image / text /
 * video / code / music) and for a request response (same `prompts` row).
 *
 *   [avatar] Creator · time · [type pill]  →  provenance (request response)
 *   →  title + description  →  output preview  →  prompt box (PROMPT · tool)
 *   →  tags  →  actions (Meydan post layout, `ContentCardPost`)
 *
 * Since Meydan (docs/history/190-*) the card also shows the prompt itself in
 * the shared mono block (`PromptPreviewBox`, clamped, with "Kopyala") — the
 * thing people come for is visible without opening the post. A row with no
 * text (hidden/empty) shows no block. An image prompt's generated result is a supporting
 * "çıktı" preview (never taller than square), never the whole card —
 * Promptly is a prompt community, not an image gallery. More
 * than one output image adds a small, non-interactive preview strip below
 * the cover (`OutputThumbnailStrip`) rather than enlarging the card's own
 * footprint — browsing every image is a detail-page job (the lightbox).
 */
export function PromptCard({
  prompt,
  onDeleted,
  collectionRemoval,
}: {
  prompt: Prompt;
  onDeleted?: () => void;
  /** Only passed by a collection's own detail page — see PostMenu. */
  collectionRemoval?: CollectionRemoval;
}) {
  const { t, language } = useTranslation();
  const meta = CONTENT_TYPE_META[prompt.contentType];
  const href = promptHref(prompt);
  const media = prompt.contentType === "image" ? prompt.media : [];
  const isPlayable = prompt.contentType === "video" || prompt.contentType === "audio";
  const poster = isPlayable ? prompt.media[0] : undefined;
  const isResponse = prompt.origin.type === "request-response";
  const hasPromptText = prompt.promptText.trim().length > 0;

  return (
    <ContentCard href={href}>
      <ContentCardPost
        author={prompt.author}
        meta={postMeta(prompt.author.username, prompt.createdAt, language, isResponse ? t("prompt.sharedAReply") : undefined)}
        badges={<ContentTypePill icon={meta.icon} label={`${t(meta.labelKey)} Prompt`} />}
        menu={<PostTargetMenu prompt={prompt} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />}
        footer={<PromptCardFooter prompt={prompt} />}
      >
        {prompt.origin.type === "request-response" && (
          <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
        )}

        <ContentCardTitle href={href} title={prompt.title} description={prompt.description} />

        {media.length > 0 && <OutputThumbnailStrip media={media} />}
        {poster && <OutputPosterPreview media={poster} />}
        {hasPromptText ? <PromptPreviewBox prompt={prompt} lines={3} /> : <ToolChips refs={prompt.tools} />}
        <ContentTags tags={prompt.tags} />
      </ContentCardPost>
    </ContentCard>
  );
}
