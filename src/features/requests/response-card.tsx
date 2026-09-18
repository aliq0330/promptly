import { Heart, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatRelativeTime } from "@/lib/utils";
import type { PromptRequestResponse } from "@/types";

export function ResponseCard({ response }: { response: PromptRequestResponse }) {
  const media = response.media[0];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface sm:flex">
      {media && (
        // eslint-disable-next-line @next/next/no-img-element -- fixed-size row thumbnail, next/image's fill sizing adds no value here
        <img
          src={media.url}
          alt={media.alt}
          className="h-48 w-full shrink-0 object-cover sm:h-auto sm:w-48"
          loading="lazy"
        />
      )}
      <div className="flex-1 space-y-2 p-4">
        <div className="flex items-center gap-2">
          <Avatar src={response.author.avatarUrl} alt={response.author.displayName} size={24} />
          <span className="text-xs font-medium text-text">{response.author.displayName}</span>
          <span className="text-xs text-text-muted">
            · {formatRelativeTime(response.createdAt)}
          </span>
        </div>
        {response.title && <h4 className="text-sm font-semibold text-text">{response.title}</h4>}
        <p className="line-clamp-2 text-xs text-text-muted">{response.promptText}</p>
        <div className="flex flex-wrap gap-1.5">
          {response.tags.map((tag) => (
            <Badge key={tag.slug} variant="outline">
              {tag.label}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-1 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <Heart size={14} />
            {formatCount(response.likeCount)}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle size={14} />
            {formatCount(response.commentCount)}
          </span>
        </div>
      </div>
    </div>
  );
}
