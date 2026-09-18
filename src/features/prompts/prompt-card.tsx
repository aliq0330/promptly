import Link from "next/link";
import Image from "next/image";
import { Bookmark, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/lib/utils";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { getPromptById } from "@/mocks/prompts";
import { ShareButton } from "./share-button";
import type { Prompt } from "@/types";

export function PromptCard({ prompt }: { prompt: Prompt }) {
  const media = prompt.media[0];
  const isRemix = prompt.origin.type === "remix";
  const originalPrompt = prompt.origin.type === "remix" ? getPromptById(prompt.origin.sourcePromptId) : null;

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

        {isRemix && (
          <Link
            href={`/prompts/${prompt.origin.type === "remix" ? prompt.origin.sourcePromptId : ""}`}
            className="relative z-10 flex w-fit items-center gap-1 text-xs text-primary hover:underline"
          >
            <Repeat2 size={12} className="shrink-0" />
            <span className="line-clamp-1">
              {originalPrompt ? `"${originalPrompt.title}" içeriğinden remix` : "Bir prompttan remixlendi"}
            </span>
          </Link>
        )}

        <p className="line-clamp-2 text-xs text-text-muted">{prompt.description}</p>

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {prompt.tags.slice(0, 2).map((tag) => (
            <Badge key={tag.slug}>{tag.label}</Badge>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        <Link
          href={`/profile/${prompt.author.username}`}
          className="flex min-w-0 items-center gap-2 hover:opacity-80"
        >
          <Avatar src={prompt.author.avatarUrl} alt={prompt.author.displayName} size={24} />
          <span className="truncate text-xs font-medium text-text-muted">
            {prompt.author.displayName}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2.5 text-text-muted">
          <span
            className="flex cursor-default items-center gap-1 text-xs"
            title="Beğeni — girişten sonra aktif olacak"
          >
            <Heart size={14} />
            {formatCount(prompt.likeCount)}
          </span>
          <Link
            href={`/prompts/${prompt.id}`}
            className="flex items-center gap-1 text-xs hover:text-text"
            title="Yorumlar"
          >
            <MessageCircle size={14} />
            {formatCount(prompt.commentCount)}
          </Link>
          <Link
            href={`/prompts/${prompt.id}`}
            className="flex items-center gap-1 text-xs hover:text-text"
            title="Remixler"
          >
            <Repeat2 size={14} />
            {formatCount(prompt.remixCount)}
          </Link>
          <span
            className="flex cursor-default items-center text-xs"
            title="Kaydet — girişten sonra aktif olacak"
          >
            <Bookmark size={14} />
          </span>
          <ShareButton url={`/prompts/${prompt.id}`} title={prompt.title} />
        </div>
      </div>

      <Link href={`/prompts/${prompt.id}`} className="absolute inset-0 z-0" aria-label={prompt.title} />
    </div>
  );
}
