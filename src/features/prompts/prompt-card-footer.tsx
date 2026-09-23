import { generatorHref, promptHref } from "@/lib/utils";
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
 * actions (CLAUDE.md Bölüm 21/9.35), share is a genuinely working Web
 * Share/clipboard action. Remix was fully removed from this platform
 * (kullanıcının açık talebi) — no remix icon/count here anymore, evenly
 * spaced across the remaining three actions.
 */
export function PromptCardFooter(target: FooterTarget) {
  const view = target.generator
    ? {
        isGenerator: true as const,
        id: target.generator.id,
        title: target.generator.title,
        likeCount: target.generator.likeCount,
        commentCount: target.generator.commentCount,
        href: generatorHref(target.generator),
        generatorSlug: target.generator.slug,
      }
    : {
        isGenerator: false as const,
        id: target.prompt.id,
        title: target.prompt.title,
        likeCount: target.prompt.likeCount,
        commentCount: target.prompt.commentCount,
        href: promptHref(target.prompt),
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
      {view.isGenerator ? <SaveButton generatorId={view.id} /> : <SaveButton promptId={view.id} />}
      <ShareButton url={view.href} title={view.title} />
    </div>
  );
}
