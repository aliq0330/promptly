"use client";

import { ToolChips } from "@/features/content/tool-chips";
import { promptHref } from "@/lib/utils";
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { PostHeader } from "./post-header";
import { GeneratorSourceContext, RequestResponseContext } from "./post-context";
import { PromptCardFooter } from "./prompt-card-footer";
import { OutputPosterPreview, OutputThumbnailStrip } from "./multi-image-output-options";
import type { Prompt } from "@/types";

type CollectionRemoval = { isDefault: boolean; onRemove: () => Promise<void> };

/**
 * PromptCard — one card for every prompt content type (image / text /
 * video / code / music) and for a request response (same `prompts` row).
 *
 *   Creator  →  provenance (request / generator)  →  type · tool
 *   →  title + description  →  output preview (image only)
 *   →  tags  →  actions
 *
 * The prompt text itself is deliberately NOT on the card — it is revealed on
 * the detail page. An image prompt's generated result is a supporting
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
  const { t } = useTranslation();
  const meta = CONTENT_TYPE_META[prompt.contentType];
  const href = promptHref(prompt);
  const media = prompt.contentType === "image" ? prompt.media : [];
  const isPlayable = prompt.contentType === "video" || prompt.contentType === "audio";
  const poster = isPlayable ? prompt.media[0] : undefined;
  const isResponse = prompt.origin.type === "request-response";

  return (
    <ContentCard href={href}>
      <ContentCardBody>
        <PostHeader
          prompt={prompt}
          subtitle={isResponse ? t("prompt.sharedAReply") : undefined}
          onDeleted={onDeleted}
          collectionRemoval={collectionRemoval}
        />

        {prompt.origin.type === "request-response" && (
          <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
        )}
        {prompt.generatedFrom && <GeneratorSourceContext generatedFrom={prompt.generatedFrom} />}

        <div className="space-y-2">
          <ContentTypeLabel icon={meta.icon} label={`${t(meta.labelKey)} Prompt`} detail={prompt.tools.length ? null : prompt.tool} />
          <ContentCardTitle href={href} title={prompt.title} description={prompt.description} />
        </div>

        {media.length > 0 && <OutputThumbnailStrip media={media} />}
        {poster && <OutputPosterPreview media={poster} />}

        <ToolChips refs={prompt.tools} />
        <ContentTags tags={prompt.tags} />
      </ContentCardBody>

      <PromptCardFooter prompt={prompt} />
    </ContentCard>
  );
}
