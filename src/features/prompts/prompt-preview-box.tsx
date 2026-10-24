"use client";

import { SquareTerminal } from "lucide-react";
import { CopyPromptButton } from "./copy-prompt-button";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { cn, formatCount } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Prompt } from "@/types";

/**
 * The prompt block — Promptly's signature element. The literal prompt text
 * is always shown in the same calm monospace panel (`prompt-text` utility),
 * so on every card the thing you actually copy is visually distinct from
 * the title/description written about it. Shared by every prompt card
 * (and a request response, which is the same `prompts` row shape).
 * `CopyPromptButton` always copies the real, full `promptText`, never this
 * block's clamped display text.
 *
 * Meydan (docs/history/190-*): a borderless soft panel headed "PROMPT · <tool>",
 * with the real use count (`copy_count`) and a bare "Kopyala" on the right.
 */
export function PromptPreviewBox({ prompt, lines = 4, variant = "panel" }: { prompt: Prompt; lines?: 3 | 4 | 6; variant?: "panel" | "art" }) {
  const { t } = useTranslation();
  const tool = resolveToolRefs(prompt.tools)[0]?.label ?? prompt.tool;
  if (variant === "art") {
    // The Albüm card's art for a prompt without a picture (docs/history/202-*): the prompt itself, lifted on the band. A text-only
    // feed would otherwise be a column of identical white boxes, so the panel reads as a small terminal (docs/history/224-*): a
    // brand edge, a "PROMPT" header strip (the platform's signature element) and a soft fade where a long prompt is cut off.
    // The card's own big "Kopyala" and its kicker (tool) still replace the panel variant's header.
    const isLong = prompt.promptText.length > 140;
    return (
      <div className="relative overflow-hidden rounded-lg bg-surface shadow-pop">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />
        <div className="flex items-center gap-1.5 border-b border-border-soft py-1.5 pl-5 pr-4 text-caption font-semibold uppercase tracking-[0.06em] text-text-muted">
          <SquareTerminal size={12} strokeWidth={1.75} aria-hidden />
          <span className="truncate">Prompt</span>
        </div>
        <div className="relative pb-3.5 pl-5 pr-4 pt-2.5">
          <p
            className={cn(
              "prompt-text break-words whitespace-pre-line text-text",
              lines === 3 && "line-clamp-3",
              lines === 4 && "line-clamp-4",
              lines === 6 && "line-clamp-6",
            )}
          >
            {prompt.promptText}
          </p>
          {isLong && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-surface to-transparent" />}
        </div>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-soft">
      <div className="flex items-center gap-2 pl-3.5 pr-1.5 pt-2">
        <span className="min-w-0 flex-1 truncate text-caption font-semibold uppercase tracking-[0.06em] text-text-secondary">
          Prompt{tool ? <span className="normal-case tracking-normal text-text-muted"> · {tool}</span> : null}
        </span>
        {prompt.copyCount > 0 && (
          <span className="shrink-0 text-caption tabular-nums text-text-muted">{t("prompt.usesShort", { count: formatCount(prompt.copyCount) })}</span>
        )}
        <CopyPromptButton text={prompt.promptText} promptId={prompt.id} variant="link" />
      </div>
      {/* Padding lives on the wrapper: padding on the clamped element itself
          would reveal part of the next (clamped-away) line. */}
      <div className="px-3.5 pb-3 pt-1">
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
