import { ShareTriggerButton } from "./share-modal";
import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { CommentCountLink } from "./comment-count-link";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import type { Generator, Preset, Prompt, Workflow } from "@/types";

type FooterTarget =
  | { prompt: Prompt; generator?: never; workflow?: never; preset?: never }
  | { generator: Generator; prompt?: never; workflow?: never; preset?: never }
  | { workflow: Workflow; prompt?: never; generator?: never; preset?: never }
  | { preset: Preset; prompt?: never; generator?: never; workflow?: never };

/**
 * ContentActions — the one action row every content card uses (every prompt
 * content type, a generator AND a workflow): Beğeni · Yorum · Kaydet grouped
 * together on the left, Paylaş always alone on the far right (Promptly
 * Etkileşim Butonları Düzeni görevi — Paylaş never joins the left group).
 * Plus the İstatistikler action (Bölüm 9.82) right after Kaydet. Same icons, order, spacing and touch targets everywhere. Like/save/comment
 * are the real, database-persisted actions (CLAUDE.md Bölüm 21/9.35/9.36 —
 * Save opens the shared collection modal for prompts, generators and
 * workflows), share opens the shared `ShareModal` (never a direct
 * native-share call). No new action system — this only arranges the
 * existing components.
 */
export function PromptCardFooter(target: FooterTarget) {
  return (
    <div className="relative z-10 flex items-center gap-0.5 border-t border-border-soft px-2 py-1.5">
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
      ) : target.generator ? (
        <>
          <LikeButton id={target.generator.id} likeCount={target.generator.likeCount} contentType="generator" />
          <CommentCountLink generatorSlug={target.generator.slug} generatorId={target.generator.id} baseCount={target.generator.commentCount} />
          <SaveButton generatorId={target.generator.id} saveCount={target.generator.saveCount} />
          <StatisticsButton target={{ contentType: "generator", contentId: target.generator.id, likeCount: target.generator.likeCount, commentCount: target.generator.commentCount, saveCount: target.generator.saveCount }} />
        </>
      ) : (
        <>
          <LikeButton id={target.prompt.id} likeCount={target.prompt.likeCount} contentType="prompt" />
          <CommentCountLink promptId={target.prompt.id} baseCount={target.prompt.commentCount} />
          <SaveButton promptId={target.prompt.id} saveCount={target.prompt.saveCount} />
          <StatisticsButton target={{ contentType: "prompt", contentId: target.prompt.id, likeCount: target.prompt.likeCount, commentCount: target.prompt.commentCount, saveCount: target.prompt.saveCount }} />
        </>
      )}
      <span className="ml-auto" />
      <ShareTriggerButton
        target={
          target.preset
            ? { contentType: "preset", preset: target.preset }
            : target.workflow
            ? { contentType: "workflow", workflow: target.workflow }
            : target.generator
              ? { contentType: "generator", generator: target.generator }
              : { contentType: "prompt", prompt: target.prompt }
        }
      />
    </div>
  );
}
