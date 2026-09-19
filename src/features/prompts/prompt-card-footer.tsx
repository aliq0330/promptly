import Link from "next/link";
import { Repeat2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatCount, profileHref, promptHref } from "@/lib/utils";
import { ShareButton } from "./share-button";
import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { CommentCountLink } from "./comment-count-link";
import type { Prompt } from "@/types";

/**
 * Shared action row for every prompt card type (image/text/video/code/
 * music) so the platform's social actions stay consistent regardless of
 * content shape. Like/save/comment are real, localStorage-persisted actions
 * (see CLAUDE.md section 14) — remix is real navigation, share is a
 * genuinely working Web Share/clipboard action.
 */
export function PromptCardFooter({ prompt }: { prompt: Prompt }) {
  return (
    <div className="relative z-10 flex items-center justify-between gap-2 border-t border-border px-4 py-3">
      <Link
        href={profileHref(prompt.author)}
        className="flex min-w-0 items-center gap-2 hover:opacity-80"
      >
        <Avatar src={prompt.author.avatarUrl} alt={prompt.author.displayName} size={24} />
        <span className="truncate text-xs font-medium text-text-muted">
          {prompt.author.displayName}
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2.5 text-text-muted">
        <LikeButton id={prompt.id} likeCount={prompt.likeCount} />
        <CommentCountLink promptId={prompt.id} baseCount={prompt.commentCount} />
        <Link
          href={`/create?remix=${prompt.id}`}
          className="flex items-center gap-1 text-xs hover:text-text"
          title="Bu promptu remixle"
        >
          <Repeat2 size={14} />
          {formatCount(prompt.remixCount)}
        </Link>
        <SaveButton promptId={prompt.id} />
        <ShareButton url={promptHref(prompt)} title={prompt.title} />
      </div>
    </div>
  );
}
