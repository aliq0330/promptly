"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { PostMenu } from "./post-menu";
import type { Generator, Preset, Prompt, Workflow } from "@/types";

type PostHeaderTarget =
  | { prompt: Prompt; generator?: never; workflow?: never; preset?: never }
  | { generator: Generator; prompt?: never; workflow?: never; preset?: never }
  | { workflow: Workflow; prompt?: never; generator?: never; preset?: never }
  | { preset: Preset; prompt?: never; generator?: never; workflow?: never };

/**
 * Shared top-of-card identity row for every post type (normal/request
 * response, and — since Bölüm 9.36's Prompt/Generator parity pass — a
 * generator too, same shell, same avatar/name/time/menu) — avatar, display
 * name, relative time (with an optional " · Yanıt paylaştı" suffix),
 * three-dot menu. There is no "verified" concept anywhere in the real
 * schema (`profiles` has no such column) — deliberately not shown here
 * rather than faked (CLAUDE.md's "don't show a feature the backend
 * doesn't have" rule).
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
  const { language } = useTranslation();
  const author = target.preset ? target.preset.creator : target.workflow ? target.workflow.creator : target.generator ? target.generator.creator : target.prompt.author;
  const createdAt = target.preset ? target.preset.createdAt : target.workflow ? target.workflow.createdAt : target.generator ? target.generator.createdAt : target.prompt.createdAt;

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={profileHref(author)}
        className="group/author relative z-10 flex min-w-0 items-center gap-2.5 rounded-md"
      >
        <Avatar src={author.avatarUrl} alt={author.displayName} size={32} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-label font-semibold text-text group-hover/author:text-primary">
            {author.displayName}
          </span>
          <span className="block truncate text-caption text-text-muted">
            @{author.username} · {formatRelativeTime(createdAt, language)}
            {subtitle ? ` · ${subtitle}` : ""}
          </span>
        </span>
      </Link>

      {target.preset ? (
        <PostMenu
          presetId={target.preset.id}
          authorId={target.preset.creator.id}
          onDeleted={onDeleted}
          collectionRemoval={collectionRemoval}
        />
      ) : target.workflow ? (
        <PostMenu
          workflowId={target.workflow.id}
          authorId={target.workflow.creator.id}
          onDeleted={onDeleted}
          collectionRemoval={collectionRemoval}
        />
      ) : target.generator ? (
        <PostMenu
          generatorId={target.generator.id}
          generatorSlug={target.generator.slug}
          authorId={target.generator.creator.id}
          onDeleted={onDeleted}
          collectionRemoval={collectionRemoval}
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
