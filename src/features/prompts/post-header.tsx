import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { PostMenu } from "./post-menu";
import type { Prompt } from "@/types";

/**
 * Shared top-of-card identity row for every post type (normal/remix/request
 * response) — avatar, display name, relative time (with an optional
 * " · Yanıt paylaştı" / " · Remix paylaştı" suffix), three-dot menu. There
 * is no "verified" concept anywhere in the real schema (`profiles` has no
 * such column) — deliberately not shown here rather than faked (CLAUDE.md's
 * "don't show a feature the backend doesn't have" rule).
 */
export function PostHeader({
  prompt,
  subtitle,
  onDeleted,
}: {
  prompt: Prompt;
  subtitle?: string;
  onDeleted?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={profileHref(prompt.author)}
        className="relative z-10 flex min-w-0 items-center gap-2.5 hover:opacity-80"
      >
        <Avatar src={prompt.author.avatarUrl} alt={prompt.author.displayName} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-text">
            {prompt.author.displayName}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {formatRelativeTime(prompt.createdAt)}
            {subtitle ? ` · ${subtitle}` : ""}
          </span>
        </span>
      </Link>

      <PostMenu promptId={prompt.id} authorId={prompt.author.id} onDeleted={onDeleted} />
    </div>
  );
}
