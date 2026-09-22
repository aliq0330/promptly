import Link from "next/link";
import { GitBranch } from "lucide-react";
import { formatCount, promptHref } from "@/lib/utils";
import { ShareButton } from "./share-button";
import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { CommentCountLink } from "./comment-count-link";
import type { Prompt } from "@/types";

/**
 * Shared action row for every prompt card type (image/text/video/code/
 * music) so the platform's social actions stay consistent regardless of
 * content shape. Author identity now lives in the card's `PostHeader`
 * instead of here (Lavender Studio card redesign), so this row is action
 * icons only. Like/save/comment are real, database-persisted actions
 * (CLAUDE.md Bölüm 21) — remix is real navigation, share is a genuinely
 * working Web Share/clipboard action.
 */
export function PromptCardFooter({ prompt }: { prompt: Prompt }) {
  return (
    <div className="relative z-10 flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-text-muted">
      <LikeButton id={prompt.id} likeCount={prompt.likeCount} />
      <CommentCountLink promptId={prompt.id} baseCount={prompt.commentCount} />
      <Link
        href={`/create?remix=${prompt.id}`}
        className="flex items-center gap-1 text-xs hover:text-text"
        title="Bu promptu remixle"
      >
        <GitBranch size={14} />
        {formatCount(prompt.remixCount)}
      </Link>
      <SaveButton promptId={prompt.id} />
      <ShareButton url={promptHref(prompt)} title={prompt.title} />
    </div>
  );
}
