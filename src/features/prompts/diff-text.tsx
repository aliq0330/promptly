"use client";

import { diffWords } from "@/lib/prompt-diff";

/**
 * Renders a word-level diff between two strings inline — shared by the edit
 * suggestion preview (CLAUDE.md §5/§9) and the version-history comparison
 * (§9), so there's exactly one visual diff language in the app rather than
 * one per feature. Removed text is struck through in a muted danger tone,
 * added text is highlighted in a success tone — never color alone: the
 * strikethrough on removed text and the different background on added text
 * both carry meaning independent of hue.
 */
export function DiffText({ before, after, className }: { before: string; after: string; className?: string }) {
  const tokens = diffWords(before, after);
  return (
    <p className={`prompt-text whitespace-pre-wrap break-words text-sm ${className ?? ""}`}>
      {tokens.map((token, index) => {
        if (token.type === "same") return <span key={index}>{token.text}</span>;
        if (token.type === "removed") {
          return (
            <span key={index} className="rounded-[2px] bg-danger/10 text-danger line-through decoration-danger/60">
              {token.text}
            </span>
          );
        }
        return (
          <span key={index} className="rounded-[2px] bg-success/15 text-success">
            {token.text}
          </span>
        );
      })}
    </p>
  );
}
