import { ArrowRight, Terminal } from "lucide-react";
import { CopyPromptButton } from "./copy-prompt-button";
import { cn } from "@/lib/utils";
import type { Prompt } from "@/types";

/**
 * The lavender "Kullanılan prompt" box shown on every card regardless of
 * content type — a short, clamped preview of the actual prompt text plus a
 * link to the full post. Shared by image and text/video/code/music cards
 * so there's exactly one place this preview is built, not one per card
 * shape (it replaces text-prompt-card.tsx's old bespoke version). Since a
 * prompt gönderisi, bir remix gönderisi and a prompt yanıtı are
 * all the SAME `prompts` row shape (`origin_type` is all that differs),
 * rendering the "Kopyala" button here (CLAUDE.md §10) covers all three
 * content types on every card they appear in — no per-type special-casing
 * needed. `CopyPromptButton` always copies the real, full `promptText`,
 * never this box's own `line-clamp-3`-truncated display text.
 */
export function PromptPreviewBox({ prompt }: { prompt: Prompt }) {
  return (
    <div className="rounded-md bg-accent-surface/60 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-primary">
          <Terminal size={14} />
          <span className="text-xs font-semibold">Kullanılan prompt</span>
        </div>
        <CopyPromptButton text={prompt.promptText} />
      </div>
      <p className={cn("line-clamp-3 text-xs text-text-muted", prompt.contentType === "code" && "font-mono")}>
        {prompt.promptText}
      </p>
      <span className="pointer-events-none mt-1.5 flex items-center gap-1 text-xs font-medium text-primary">
        Promptun tamamını gör
        <ArrowRight size={12} />
      </span>
    </div>
  );
}
