"use client";

import { resolveToolRefs } from "@/lib/ai-tool-catalog";
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
import { OutputThumbnailStrip } from "./multi-image-output-options";
import { PlayableCardArt } from "./playable-card-art";
import type { Prompt } from "@/types";

type CollectionRemoval = { onRemove: () => Promise<void> };

/**
 * PromptCard — one card for every prompt content type (image / text / video / audio) and for a request response (same
 * `prompts` row), on the visual card (`ContentCardPost`, docs/history/266-*):
 *
 *   picture: the output image; a video/audio prompt's poster that PLAYS by itself while the card is in view (`PlayableCardArt`:
 *            silent looping video / audio, round play-pause button in the middle, no progress) (+ the type glyph in the corner); the prompt itself
 *            when there is no picture. Kicker (type · tool) and title are drawn on the picture at all times (docs/history/277-*).
 *   row:     (·) Name                 ♥ · 💬 · 🔖 · ⋮
 *
 * The prompt text is what people come for: a prompt without a picture shows it as the art (`PromptPreviewBox` "art").
 * Kopyala / Studio'da aç live on the detail page. More than one output image adds a small "+N" chip on the cover
 * (`OutputThumbnailStrip`); browsing every image is a detail-page job (the lightbox).
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
  const tool = resolveToolRefs(prompt.tools)[0]?.label ?? prompt.tool ?? null;

  return (
    <ContentCard variant="visual" href={href} onOpen={() => handOffPrompt(prompt)}>
      <ContentCardPost
        author={prompt.author}
        meta={postMeta(prompt.author.username, prompt.createdAt, language, isResponse ? t("prompt.sharedAReply") : undefined)}
        typeIcon={meta.icon}
        badges={
          <>
            <ContentTypePill icon={meta.icon} label={`${t(meta.labelKey)} Prompt`} detail={tool} />
          </>
        }
        menu={<PostTargetMenu prompt={prompt} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />}
        art={
          media.length > 0 ? (
            <OutputThumbnailStrip media={media} />
          ) : poster ? (
            <PlayableCardArt prompt={prompt} poster={poster} />
          ) : hasPromptText ? (
            <PromptPreviewBox prompt={prompt} lines={4} variant="art" />
          ) : undefined
        }
        title={<ContentCardTitle href={href} title={prompt.title} />}
        footer={<PromptCardFooter prompt={prompt} />}
      >
        {prompt.origin.type === "request-response" && (
          <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
        )}
      </ContentCardPost>
    </ContentCard>
  );
}
