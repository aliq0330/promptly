import Link from "next/link";
import Image from "next/image";
import { Heart, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/lib/utils";
import type { Prompt } from "@/types";

export function PromptCard({ prompt }: { prompt: Prompt }) {
  const media = prompt.media[0];

  return (
    <Link
      href={`/prompts/${prompt.id}`}
      className="group block overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-accent-surface">
        {media && (
          <Image
            src={media.url}
            alt={media.alt}
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        {prompt.origin.type === "remix" && (
          <span className="absolute left-2 top-2 rounded-sm bg-surface/90 px-2 py-0.5 text-xs font-medium text-primary backdrop-blur">
            Remix
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 text-sm font-semibold text-text">{prompt.title}</h3>
        <p className="line-clamp-2 text-xs text-text-muted">{prompt.description}</p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {prompt.tags.slice(0, 2).map((tag) => (
            <Badge key={tag.slug}>{tag.label}</Badge>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar src={prompt.author.avatarUrl} alt={prompt.author.displayName} size={24} />
            <span className="truncate text-xs font-medium text-text-muted">
              {prompt.author.displayName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 text-text-muted">
            <span className="flex items-center gap-1 text-xs">
              <Heart size={14} />
              {formatCount(prompt.likeCount)}
            </span>
            <span className="flex items-center gap-1 text-xs">
              <MessageCircle size={14} />
              {formatCount(prompt.commentCount)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
