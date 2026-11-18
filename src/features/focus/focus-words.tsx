"use client";

import { Fragment } from "react";
import { focusPromptTokens } from "@/lib/focus-feed";
import { segmentPromptAssembly } from "@/lib/prompt-variables";
import { cn } from "@/lib/utils";
import type { Prompt } from "@/types";
import type { PromptFill } from "./focus-fill";

/** Variable colour rule (CLAUDE.md §4): `{değişken}`s and their values are "yours to fill" — the secondary (orange) ink, never a button colour. */
const TOKEN_INK = "rounded-xs bg-secondary-soft px-1.5 text-secondary";

/**
 * A text prompt's own words as Odak's scene (docs/history/435-*): the signature mono block at reading size, every `{variable}` a
 * tappable chip (a filled one shows its value, an empty one its dashed `{name}`) that opens the picker. Until the variable
 * definitions have loaded the tokens are plain chips — the words themselves are real from the first paint.
 */
export function FocusPromptWords({
  prompt,
  fill,
  editing,
  onEdit,
  className,
}: {
  prompt: Prompt;
  fill: PromptFill | null;
  /** The variable the picker is open on (ringed). */
  editing: string | null;
  onEdit: (name: string) => void;
  className?: string;
}) {
  const ready = fill !== null && fill.variables.length > 0;
  return (
    <p className={cn("prompt-text whitespace-pre-line break-words text-body leading-[1.75] text-on-art", className)}>
      {ready
        ? segmentPromptAssembly(prompt.promptText, fill.values, fill.visible).map((segment, index) => {
            if (segment.kind === "text") return <Fragment key={index}>{segment.text}</Fragment>;
            const empty = segment.kind === "empty";
            return (
              <button
                key={index}
                type="button"
                data-focus-token={segment.name}
                onClick={() => onEdit(segment.name)}
                aria-label={segment.name}
                className={cn(
                  TOKEN_INK,
                  "inline cursor-pointer break-words text-left align-baseline font-medium transition-colors hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  empty && "border border-dashed border-secondary/60",
                  editing === segment.name && "bg-secondary text-secondary-foreground ring-2 ring-primary",
                )}
              >
                {empty ? `{${segment.text}}` : segment.text}
              </button>
            );
          })
        : focusPromptTokens(prompt.promptText).map((part, index) =>
            part.name ? (
              <span key={index} className={cn(TOKEN_INK, "font-medium")}>
                {part.text}
              </span>
            ) : (
              <Fragment key={index}>{part.text}</Fragment>
            ),
          )}
    </p>
  );
}

/** The one-line prompt of the strip: the resolved words with the variables' slots in the secondary ink; the line is cut by CSS. */
export function FocusPromptLine({ prompt, fill, className }: { prompt: Prompt; fill: PromptFill | null; className?: string }) {
  const ready = fill !== null && fill.variables.length > 0;
  const oneLine = (text: string) => text.replace(/\s+/g, " ");
  return (
    <span className={cn("prompt-text block truncate text-caption text-on-art", className)}>
      {ready
        ? segmentPromptAssembly(prompt.promptText, fill.values, fill.visible).map((segment, index) =>
            segment.kind === "text" ? (
              <Fragment key={index}>{oneLine(segment.text)}</Fragment>
            ) : (
              <span key={index} className="text-secondary">
                {segment.kind === "empty" ? `{${segment.text}}` : segment.text}
              </span>
            ),
          )
        : focusPromptTokens(prompt.promptText).map((part, index) => (
            <span key={index} className={part.name ? "text-secondary" : undefined}>
              {oneLine(part.text)}
            </span>
          ))}
    </span>
  );
}
