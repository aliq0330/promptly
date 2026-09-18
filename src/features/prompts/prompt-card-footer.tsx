import Link from "next/link";
import { Bookmark, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatCount } from "@/lib/utils";
import { ShareButton } from "./share-button";
import type { Prompt } from "@/types";

/**
 * Shared action row for every prompt card type (image/text/video/code/
 * music) so the platform's social actions stay consistent regardless of
 * content shape. Like/save are intentionally non-interactive (no backend
 * to persist them, see CLAUDE.md section 14) — comment/remix are real
 * navigation, share is a genuinely working Web Share/clipboard action.
 */
export function PromptCardFooter({ prompt }: { prompt: Prompt }) {
  return (
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
  );
}
