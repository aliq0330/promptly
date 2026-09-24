import { SquareTerminal } from "lucide-react";
import { CopyPromptButton } from "./copy-prompt-button";
import { cn } from "@/lib/utils";
import type { Prompt } from "@/types";

/**
 * The prompt block — Promptly's signature element. The literal prompt text
 * is always shown in the same calm monospace panel (`prompt-text` utility),
 * so on every card the thing you actually copy is visually distinct from
 * the title/description written about it. Shared by every prompt card
 * (and a request response, which is the same `prompts` row shape).
 * `CopyPromptButton` always copies the real, full `promptText`, never this
 * block's clamped display text.
 */
export function PromptPreviewBox({ prompt, lines = 4 }: { prompt: Prompt; lines?: 3 | 4 | 6 }) {
  return (
    <div className="relative overflow-hidden rounded-md border border-border-soft bg-surface-soft">
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <span className="flex items-center gap-1.5 text-caption font-semibold tracking-wide text-text-muted">
          <SquareTerminal size={13} strokeWidth={2} />
          Prompt
        </span>
        <CopyPromptButton text={prompt.promptText} />
      </div>
      {/* Padding lives on the wrapper: padding on the clamped element itself
          would reveal part of the next (clamped-away) line. */}
      <div className="px-3 pb-3 pt-1.5">
        <p
          className={cn(
            "prompt-text break-words whitespace-pre-line text-text-secondary",
            lines === 3 && "line-clamp-3",
            lines === 4 && "line-clamp-4",
            lines === 6 && "line-clamp-6",
          )}
        >
          {prompt.promptText}
        </p>
      </div>
    </div>
  );
}
