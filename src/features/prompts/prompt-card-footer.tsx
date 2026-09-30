import { ShareTriggerButton } from "./share-modal";
import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { CommentCountLink } from "./comment-count-link";
import type { Generator, Prompt, Workflow } from "@/types";

type FooterTarget =
  | { prompt: Prompt; generator?: never; workflow?: never }
  | { generator: Generator; prompt?: never; workflow?: never }
  | { workflow: Workflow; prompt?: never; generator?: never };

/**
 * ContentActions — the one action row every content card uses (every prompt
 * content type, a generator AND a workflow): Beğeni · Yorum · Kaydet grouped
 * together on the left, Paylaş always alone on the far right (Promptly
 * Etkileşim Butonları Düzeni görevi — Paylaş never joins the left group).
 * Same icons, order, spacing and touch targets everywhere. Like/save/comment
 * are the real, database-persisted actions (CLAUDE.md Bölüm 21/9.35/9.36 —
 * Save opens the shared collection modal for prompts, generators and
 * workflows), share opens the shared `ShareModal` (never a direct
 * native-share call). No new action system — this only arranges the
 * existing components.
 */
export function PromptCardFooter(target: FooterTarget) {
  return (
    <div className="relative z-10 flex items-center gap-0.5 border-t border-border-soft px-2 py-1.5">
      {target.workflow ? (
        <>
          <LikeButton id={target.workflow.id} likeCount={target.workflow.likeCount} contentType="workflow" />
          <CommentCountLink workflowId={target.workflow.id} baseCount={target.workflow.commentCount} />
          <SaveButton workflowId={target.workflow.id} />
        </>
      ) : target.generator ? (
        <>
          <LikeButton id={target.generator.id} likeCount={target.generator.likeCount} contentType="generator" />
          <CommentCountLink generatorSlug={target.generator.slug} baseCount={target.generator.commentCount} />
          <SaveButton generatorId={target.generator.id} />
        </>
      ) : (
        <>
          <LikeButton id={target.prompt.id} likeCount={target.prompt.likeCount} contentType="prompt" />
          <CommentCountLink promptId={target.prompt.id} baseCount={target.prompt.commentCount} />
          <SaveButton promptId={target.prompt.id} />
        </>
      )}
      <span className="ml-auto" />
      <ShareTriggerButton
        target={
          target.workflow
            ? { contentType: "workflow", workflow: target.workflow }
            : target.generator
              ? { contentType: "generator", generator: target.generator }
              : { contentType: "prompt", prompt: target.prompt }
        }
      />
    </div>
  );
}
