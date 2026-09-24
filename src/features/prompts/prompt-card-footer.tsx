import { ShareTriggerButton } from "./share-modal";
import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { CommentCountLink } from "./comment-count-link";
import type { Generator, Prompt } from "@/types";

type FooterTarget = { prompt: Prompt; generator?: never } | { generator: Generator; prompt?: never };

/**
 * ContentActions — the one action row every content card uses (every prompt
 * content type AND a generator): Like · Comment on the left, Save · Share
 * on the right. Same icons, order, spacing and touch targets everywhere.
 * Like/save/comment are the real, database-persisted actions (CLAUDE.md
 * Bölüm 21/9.35/9.36 — Save opens the shared collection modal for both
 * prompts and generators), share is the real Web Share/clipboard action.
 * No new action system — this only arranges the existing components.
 */
export function PromptCardFooter(target: FooterTarget) {
  const view = target.generator
    ? {
        isGenerator: true as const,
        id: target.generator.id,
        likeCount: target.generator.likeCount,
        commentCount: target.generator.commentCount,
        generatorSlug: target.generator.slug,
      }
    : {
        isGenerator: false as const,
        id: target.prompt.id,
        likeCount: target.prompt.likeCount,
        commentCount: target.prompt.commentCount,
        generatorSlug: undefined,
      };

  return (
    <div className="relative z-10 flex items-center gap-0.5 border-t border-border-soft px-2 py-1.5">
      <LikeButton id={view.id} likeCount={view.likeCount} contentType={view.isGenerator ? "generator" : "prompt"} />
      {view.isGenerator ? (
        <CommentCountLink generatorSlug={view.generatorSlug} baseCount={view.commentCount} />
      ) : (
        <CommentCountLink promptId={view.id} baseCount={view.commentCount} />
      )}
      <span className="ml-auto" />
      {view.isGenerator ? <SaveButton generatorId={view.id} /> : <SaveButton promptId={view.id} />}
      <ShareTriggerButton
        target={target.generator ? { contentType: "generator", generator: target.generator } : { contentType: "prompt", prompt: target.prompt }}
      />
    </div>
  );
}
