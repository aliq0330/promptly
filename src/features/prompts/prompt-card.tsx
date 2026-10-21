"use client";

import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { StorageImage } from "@/components/ui/storage-media";
import { promptHref } from "@/lib/utils";
import { handOffPrompt } from "@/lib/detail-handoff";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { PostTargetMenu, postMeta } from "./post-header";
import { RequestResponseContext } from "./post-context";
import { PromptCardFooter } from "./prompt-card-footer";
import { PromptPreviewBox } from "./prompt-preview-box";
import { CopyPromptButton } from "./copy-prompt-button";
import { OutputPosterPreview, OutputThumbnailStrip } from "./multi-image-output-options";
import type { Prompt } from "@/types";

type CollectionRemoval = { onRemove: () => Promise<void> };

/**
 * PromptCard — one card for every prompt content type (image / text / video / audio) and for a request response (same
 * `prompts` row), on the Albüm card (`ContentCardPost`, docs/history/202-*):
 *
 *   band: art (the output picture; the poster of a video/audio prompt; the prompt itself when there is no picture)
 *         → (request response provenance) → kicker (type · tool) → title → author line
 *   row:  [Kopyala]            ♥ · 💬 · 🔖 · 📊 · ↗
 *
 * The prompt text is what people come for: a prompt without a picture shows it as the art (`PromptPreviewBox` "art"),
 * and every prompt with text has the big "Kopyala" (copies the full `promptText`, counts a use). More than one output
 * image adds the small, non-interactive strip under the cover (`OutputThumbnailStrip`); browsing every image is a
 * detail-page job (the lightbox).
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
  const picture = media[0] ?? poster;
  const isResponse = prompt.origin.type === "request-response";
  const hasPromptText = prompt.promptText.trim().length > 0;
  const tool = resolveToolRefs(prompt.tools)[0]?.label ?? prompt.tool ?? null;

  return (
    <ContentCard href={href} onOpen={() => handOffPrompt(prompt)}>
      <ContentCardPost
        author={prompt.author}
        meta={postMeta(prompt.author.username, prompt.createdAt, language, isResponse ? t("prompt.sharedAReply") : undefined)}
        badges={<ContentTypePill icon={meta.icon} label={`${t(meta.labelKey)} Prompt`} detail={tool} />}
        menu={<PostTargetMenu prompt={prompt} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />}
        art={
          media.length > 0 ? (
            <OutputThumbnailStrip media={media} />
          ) : poster ? (
            <OutputPosterPreview media={poster} />
          ) : hasPromptText ? (
            <PromptPreviewBox prompt={prompt} lines={4} variant="art" />
          ) : undefined
        }
        backdrop={picture ? <StorageImage src={picture.url} alt="" fill sizes="240px" className="object-cover" /> : undefined}
        tint={picture?.color}
        title={<ContentCardTitle href={href} title={prompt.title} />}
        primary={hasPromptText ? <CopyPromptButton text={prompt.promptText} promptId={prompt.id} size="md" variant="primary" className="h-10 rounded-full px-4" /> : undefined}
        footer={<PromptCardFooter prompt={prompt} />}
      >
        {prompt.origin.type === "request-response" && (
          <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
        )}
      </ContentCardPost>
    </ContentCard>
  );
}
