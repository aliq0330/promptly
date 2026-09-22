import Link from "next/link";
import { Blocks, GitBranch } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { GENERATOR_CATEGORY_TOPIC_LABELS } from "./generator-category-meta";
import { formatRelativeTime, generatorHref, profileHref } from "@/lib/utils";
import { PostMenu } from "@/features/prompts/post-menu";
import { LikeButton } from "@/features/prompts/like-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { GeneratorSaveButton } from "./generator-save-button";
import type { Generator } from "@/types";

/**
 * Discovery/search/profile-grid card for a real, published generator.
 * Real, database-backed social row (Bölüm 9.34) — same "stretched link"
 * pattern as `TextPromptCard`: interactive header/footer controls sit at
 * `z-10`, a full-card `Link` sits behind them at `z-0` for the rest of
 * the card's click area.
 */
export function GeneratorCard({ generator, onDeleted }: { generator: Generator; onDeleted?: () => void }) {
  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-surface pt-4 transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={profileHref(generator.creator)}
            className="relative z-10 flex min-w-0 items-center gap-2.5 hover:opacity-80"
          >
            <Avatar src={generator.creator.avatarUrl} alt={generator.creator.displayName} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-text">{generator.creator.displayName}</span>
              <span className="block truncate text-xs text-text-muted">{formatRelativeTime(generator.createdAt)}</span>
            </span>
          </Link>

          <PostMenu
            generatorId={generator.id}
            generatorSlug={generator.slug}
            authorId={generator.creator.id}
            onDeleted={onDeleted}
          />
        </div>

        {generator.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- real, potentially locally-produced data URL cover
          <img src={generator.coverUrl} alt="" className="h-32 w-full rounded-md object-cover" />
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-md bg-accent-surface text-primary">
            <Blocks size={28} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="accent">
            <Blocks size={10} className="mr-1" /> Generator
          </Badge>
          <Badge>{GENERATOR_CATEGORY_TOPIC_LABELS[generator.category]}</Badge>
          {generator.origin.type === "remix" && (
            <Badge variant="outline">
              <GitBranch size={10} className="mr-1" /> Remix
            </Badge>
          )}
        </div>

        <div>
          <h3 className="line-clamp-1 text-sm font-semibold text-text">{generator.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{generator.description}</p>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-4 border-t border-border px-4 py-3 text-text-muted">
        <LikeButton id={generator.id} likeCount={generator.likeCount} contentType="generator" />
        <CommentCountLink generatorSlug={generator.slug} baseCount={generator.commentCount} />
        <GeneratorSaveButton generatorId={generator.id} />
      </div>

      <Link href={generatorHref(generator)} className="absolute inset-0 z-0" aria-label={generator.title} />
    </div>
  );
}
