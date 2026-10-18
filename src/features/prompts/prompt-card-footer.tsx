import { ShareTriggerButton } from "./share-modal";
import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { CommentCountLink } from "./comment-count-link";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import type { Preset, Prompt, Workflow } from "@/types";

type FooterTarget =
  | { prompt: Prompt; workflow?: never; preset?: never }
  | { workflow: Workflow; prompt?: never; preset?: never }
  | { preset: Preset; prompt?: never; workflow?: never };

/**
 * ContentActions — the one action row every content card uses (every prompt
 * content type, a workflow AND a preset), in the order of docs/history/196-*:
 * Beğeni · Yorum · Kaydet · İstatistikler on the left; Paylaş alone on the right.
 * Same icons, spacing and touch targets everywhere. Like/save/comment are the
 * real, database-persisted actions, Save opens the shared collection modal,
 * Share opens the shared `ShareModal` (never a direct native-share call).
 * Rendered inside `ContentCardPost`'s footer slot, which provides the row.
 */
export function PromptCardFooter(target: FooterTarget) {
  return (
    <>
      {target.preset ? (
        <>
          <LikeButton id={target.preset.id} likeCount={target.preset.likeCount} contentType="preset" />
          <CommentCountLink presetId={target.preset.id} baseCount={target.preset.commentCount} />
          <SaveButton presetId={target.preset.id} saveCount={target.preset.saveCount} />
          <StatisticsButton target={{ contentType: "preset", contentId: target.preset.id, likeCount: target.preset.likeCount, commentCount: target.preset.commentCount, saveCount: target.preset.saveCount }} />
        </>
      ) : target.workflow ? (
        <>
          <LikeButton id={target.workflow.id} likeCount={target.workflow.likeCount} contentType="workflow" />
          <CommentCountLink workflowId={target.workflow.id} baseCount={target.workflow.commentCount} />
          <SaveButton workflowId={target.workflow.id} saveCount={target.workflow.saveCount} />
          <StatisticsButton target={{ contentType: "workflow", contentId: target.workflow.id, likeCount: target.workflow.likeCount, commentCount: target.workflow.commentCount, saveCount: target.workflow.saveCount }} />
        </>
      ) : (
        <>
          <LikeButton id={target.prompt.id} likeCount={target.prompt.likeCount} contentType="prompt" />
          <CommentCountLink promptId={target.prompt.id} baseCount={target.prompt.commentCount} />
          <SaveButton promptId={target.prompt.id} saveCount={target.prompt.saveCount} />
          <StatisticsButton target={{ contentType: "prompt", contentId: target.prompt.id, likeCount: target.prompt.likeCount, commentCount: target.prompt.commentCount, saveCount: target.prompt.saveCount, copyCount: target.prompt.copyCount }} />
        </>
      )}
      <span className="ml-auto" />
      <ShareTriggerButton
        target={
          target.preset
            ? { contentType: "preset", preset: target.preset }
            : target.workflow
            ? { contentType: "workflow", workflow: target.workflow }
            : { contentType: "prompt", prompt: target.prompt }
        }
      />
    </>
  );
}
