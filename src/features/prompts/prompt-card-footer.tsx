import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { CommentCountLink } from "./comment-count-link";
import { CARD_SAVE_CLASS } from "@/features/content/action-styles";
import type { Preset, Prompt, Workflow } from "@/types";

type FooterTarget =
  | { prompt: Prompt; workflow?: never; preset?: never }
  | { workflow: Workflow; prompt?: never; preset?: never }
  | { preset: Preset; prompt?: never; workflow?: never };

/**
 * The compact counters of every content card (every prompt content type, a workflow AND a preset): Beğeni · Yorum · Kaydet
 * (icon only), right of the author on the visual card (`ContentCardPost`). Like/save/comment are the real, database-persisted
 * actions, Save opens the shared collection modal. Share and İstatistik live on the detail page's action row.
 */
export function PromptCardFooter(target: FooterTarget) {
  if (target.preset) {
    return (
      <>
        <LikeButton id={target.preset.id} likeCount={target.preset.likeCount} contentType="preset" />
        <CommentCountLink presetId={target.preset.id} baseCount={target.preset.commentCount} />
        <SaveButton presetId={target.preset.id} saveCount={target.preset.saveCount} className={CARD_SAVE_CLASS} />
      </>
    );
  }
  if (target.workflow) {
    return (
      <>
        <LikeButton id={target.workflow.id} likeCount={target.workflow.likeCount} contentType="workflow" />
        <CommentCountLink workflowId={target.workflow.id} baseCount={target.workflow.commentCount} />
        <SaveButton workflowId={target.workflow.id} saveCount={target.workflow.saveCount} className={CARD_SAVE_CLASS} />
      </>
    );
  }
  return (
    <>
      <LikeButton id={target.prompt.id} likeCount={target.prompt.likeCount} contentType="prompt" />
      <CommentCountLink promptId={target.prompt.id} baseCount={target.prompt.commentCount} />
      <SaveButton promptId={target.prompt.id} saveCount={target.prompt.saveCount} className={CARD_SAVE_CLASS} />
    </>
  );
}
