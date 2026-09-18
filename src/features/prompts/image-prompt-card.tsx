import Link from "next/link";
import Image from "next/image";
import { Repeat2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { PromptCardFooter } from "./prompt-card-footer";
import { RemixSourceLink } from "./remix-source-link";
import type { Prompt } from "@/types";

export function ImagePromptCard({ prompt }: { prompt: Prompt }) {
  const media = prompt.media[0];
  const isRemix = prompt.origin.type === "remix";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md">
      {media && (
        <div
          className="relative w-full shrink-0 overflow-hidden bg-accent-surface"
          style={{ aspectRatio: clampedAspectRatio(media.width, media.height) }}
        >
          <Image
            src={media.url}
            alt={media.alt}
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {isRemix && (
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-sm bg-primary/90 px-2 py-0.5 text-xs font-medium text-primary-foreground shadow-sm backdrop-blur">
              <Repeat2 size={12} />
              Remix
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 p-4">
        <h3 className="line-clamp-1 text-sm font-semibold text-text">{prompt.title}</h3>

        {prompt.origin.type === "remix" && <RemixSourceLink origin={prompt.origin} />}

        <p className="line-clamp-2 text-xs text-text-muted">{prompt.description}</p>

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {prompt.tags.slice(0, 2).map((tag) => (
            <Badge key={tag.slug}>{tag.label}</Badge>
          ))}
        </div>
      </div>

      <PromptCardFooter prompt={prompt} />

      <Link href={`/prompts/${prompt.id}`} className="absolute inset-0 z-0" aria-label={prompt.title} />
    </div>
  );
}
