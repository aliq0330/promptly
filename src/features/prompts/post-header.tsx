import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { PostMenu } from "./post-menu";
import type { Generator, Prompt } from "@/types";

type PostHeaderTarget = { prompt: Prompt; generator?: never } | { generator: Generator; prompt?: never };

/**
 * Shared top-of-card identity row for every post type (normal/remix/request
 * response, and — since Bölüm 9.36's Prompt/Generator parity pass — a
 * generator too, same shell, same avatar/name/time/menu) — avatar, display
 * name, relative time (with an optional " · Yanıt paylaştı" / " · Remix
 * paylaştı" suffix), three-dot menu. There is no "verified" concept anywhere
 * in the real schema (`profiles` has no such column) — deliberately not
 * shown here rather than faked (CLAUDE.md's "don't show a feature the
 * backend doesn't have" rule).
 */
export function PostHeader({
  subtitle,
  onDeleted,
  collectionRemoval,
  ...target
}: PostHeaderTarget & {
  subtitle?: string;
  onDeleted?: () => void;
  collectionRemoval?: { isDefault: boolean; onRemove: () => Promise<void> };
}) {
  const author = target.generator ? target.generator.creator : target.prompt.author;
  const createdAt = target.generator ? target.generator.createdAt : target.prompt.createdAt;

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={profileHref(author)}
        className="relative z-10 flex min-w-0 items-center gap-2.5 hover:opacity-80"
      >
        <Avatar src={author.avatarUrl} alt={author.displayName} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-text">
            {author.displayName}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {formatRelativeTime(createdAt)}
            {subtitle ? ` · ${subtitle}` : ""}
          </span>
        </span>
      </Link>

      {target.generator ? (
        <PostMenu
          generatorId={target.generator.id}
          generatorSlug={target.generator.slug}
          authorId={target.generator.creator.id}
          onDeleted={onDeleted}
        />
      ) : (
        <PostMenu
          promptId={target.prompt.id}
          authorId={target.prompt.author.id}
          onDeleted={onDeleted}
          collectionRemoval={collectionRemoval}
        />
      )}
    </div>
  );
}
