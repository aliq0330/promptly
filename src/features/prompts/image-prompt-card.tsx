import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { promptHref } from "@/lib/utils";
import { PostHeader } from "./post-header";
import { RemixContext, RequestResponseContext } from "./post-context";
import { PromptPreviewBox } from "./prompt-preview-box";
import { PromptCardFooter } from "./prompt-card-footer";
import type { Prompt } from "@/types";

export function ImagePromptCard({ prompt, onDeleted }: { prompt: Prompt; onDeleted?: () => void }) {
  const media = prompt.media[0];

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-surface pt-4 transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 px-4">
        <PostHeader
          prompt={prompt}
          subtitle={prompt.origin.type === "request-response" ? "Yanıt paylaştı" : undefined}
          onDeleted={onDeleted}
        />

        {prompt.origin.type === "remix" && <RemixContext sourcePromptId={prompt.origin.sourcePromptId} />}
        {prompt.origin.type === "request-response" && (
          <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
        )}

        <div>
          <h3 className="text-base font-semibold text-text">{prompt.title}</h3>
          <p className="mt-1 line-clamp-3 text-sm text-text-muted">{prompt.description}</p>
        </div>

        {prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {prompt.tags.slice(0, 2).map((tag) => (
              <Badge key={tag.slug}>{tag.label}</Badge>
            ))}
          </div>
        )}
      </div>

      {media && (
        <div className="px-4">
          <div
            className="relative w-full overflow-hidden rounded-md bg-accent-surface"
            style={{ aspectRatio: clampedAspectRatio(media.width, media.height) }}
          >
            <Image
              src={media.url}
              alt={media.alt}
              fill
              sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        </div>
      )}

      <div className="px-4">
        <PromptPreviewBox prompt={prompt} />
      </div>

      <PromptCardFooter prompt={prompt} />

      <Link href={promptHref(prompt)} className="absolute inset-0 z-0" aria-label={prompt.title} />
    </div>
  );
}
