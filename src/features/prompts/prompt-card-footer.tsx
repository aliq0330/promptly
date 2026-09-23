import Link from "next/link";
import { GitBranch } from "lucide-react";
import { formatCount, generatorHref, promptHref } from "@/lib/utils";
import { ShareButton } from "./share-button";
import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { CommentCountLink } from "./comment-count-link";
import type { Generator, Prompt } from "@/types";

type FooterTarget = { prompt: Prompt; generator?: never } | { generator: Generator; prompt?: never };

/**
 * Shared action row for every card type this platform has — every prompt
 * content type (image/text/video/code/music) AND, since Bölüm 9.36's
 * Prompt/Generator parity pass, a generator card too — same icons, same
 * order, same spacing, same footer class, no separate "generator footer"
 * (§6/§24 of that pass). Author identity now lives in the card's
 * `PostHeader` instead of here (Lavender Studio card redesign), so this row
 * is action icons only. Like/save/comment are real, database-persisted
 * actions (CLAUDE.md Bölüm 21/9.35) — remix is real navigation, share is a
 * genuinely working Web Share/clipboard action.
 *
 * A generator's real remix action is an immediate server call
 * (`remixGenerator`, only wired to the detail page's "Remixle" button) —
 * not a `?remix=` prefill link like a prompt's — so this footer's remix
 * icon deliberately opens the generator's own detail page (where that real,
 * unmodified action already lives) instead of re-implementing the async
 * remix call inside every card on a feed (which would mean a per-card
 * version fetch just to have somewhere for an icon to link).
 */
export function PromptCardFooter(target: FooterTarget) {
  const view = target.generator
    ? {
        isGenerator: true as const,
        id: target.generator.id,
        title: target.generator.title,
        likeCount: target.generator.likeCount,
        commentCount: target.generator.commentCount,
        remixCount: target.generator.remixCount,
        href: generatorHref(target.generator),
        remixHref: generatorHref(target.generator),
        generatorSlug: target.generator.slug,
      }
    : {
        isGenerator: false as const,
        id: target.prompt.id,
        title: target.prompt.title,
        likeCount: target.prompt.likeCount,
        commentCount: target.prompt.commentCount,
        remixCount: target.prompt.remixCount,
        href: promptHref(target.prompt),
        remixHref: `/create?remix=${target.prompt.id}`,
        generatorSlug: undefined,
      };

  return (
    <div className="relative z-10 flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-text-muted">
      <LikeButton id={view.id} likeCount={view.likeCount} contentType={view.isGenerator ? "generator" : "prompt"} />
      {view.isGenerator ? (
        <CommentCountLink generatorSlug={view.generatorSlug} baseCount={view.commentCount} />
      ) : (
        <CommentCountLink promptId={view.id} baseCount={view.commentCount} />
      )}
      <Link
        href={view.remixHref}
        className="flex items-center gap-1 text-xs hover:text-text"
        title={view.isGenerator ? "Bu generatoru remixle" : "Bu promptu remixle"}
      >
        <GitBranch size={14} />
        {formatCount(view.remixCount)}
      </Link>
      {view.isGenerator ? <SaveButton generatorId={view.id} /> : <SaveButton promptId={view.id} />}
      <ShareButton url={view.href} title={view.title} />
    </div>
  );
}
