import Image from "next/image";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { promptHref } from "@/lib/utils";
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { PostHeader } from "./post-header";
import { GeneratorSourceContext, RequestResponseContext } from "./post-context";
import { PromptPreviewBox } from "./prompt-preview-box";
import { PromptCardFooter } from "./prompt-card-footer";
import type { Prompt } from "@/types";

type CollectionRemoval = { isDefault: boolean; onRemove: () => Promise<void> };

/**
 * PromptCard — one card for every prompt content type (image / text /
 * video / code / music) and for a request response (same `prompts` row).
 *
 *   Creator  →  provenance (request / generator)  →  type · tool
 *   →  title + description  →  PROMPT BLOCK  →  output preview (image only)
 *   →  tags  →  actions
 *
 * The prompt itself is the hero; an image prompt's generated result is a
 * supporting "çıktı" preview under it (never taller than square), never the
 * whole card — Promptly is a prompt community, not an image gallery.
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
  const meta = CONTENT_TYPE_META[prompt.contentType];
  const href = promptHref(prompt);
  const media = prompt.contentType === "image" ? prompt.media[0] : undefined;
  const isResponse = prompt.origin.type === "request-response";

  return (
    <ContentCard href={href}>
      <ContentCardBody>
        <PostHeader
          prompt={prompt}
          subtitle={isResponse ? "Yanıt paylaştı" : undefined}
          onDeleted={onDeleted}
          collectionRemoval={collectionRemoval}
        />

        {prompt.origin.type === "request-response" && (
          <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
        )}
        {prompt.generatedFrom && <GeneratorSourceContext generatedFrom={prompt.generatedFrom} />}

        <div className="space-y-2">
          <ContentTypeLabel icon={meta.icon} label={`${meta.label} Prompt`} detail={prompt.tool} />
          <ContentCardTitle href={href} title={prompt.title} description={prompt.description} />
        </div>

        <PromptPreviewBox prompt={prompt} lines={media ? 3 : 4} />

        {media && (
          <figure className="relative w-full overflow-hidden rounded-md border border-border-soft bg-surface-soft" style={{ aspectRatio: Math.max(1, clampedAspectRatio(media.width, media.height)) }}>
            <Image
              src={media.url}
              alt={media.alt}
              fill
              sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw"
              className="object-cover"
            />
            <figcaption className="absolute bottom-2 left-2 rounded-xs bg-black/55 px-1.5 py-0.5 text-caption font-medium text-white backdrop-blur-sm">
              Çıktı
            </figcaption>
          </figure>
        )}

        <ContentTags tags={prompt.tags} />
      </ContentCardBody>

      <PromptCardFooter prompt={prompt} />
    </ContentCard>
  );
}
