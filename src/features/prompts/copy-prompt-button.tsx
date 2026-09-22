"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn, copyTextToClipboard } from "@/lib/utils";

/**
 * The one shared "Kopyala" button used directly above a real prompt text
 * block on all four content surfaces (CLAUDE.md §10) — a prompt gönderisi,
 * a remix gönderisi and a prompt yanıtı are all the SAME
 * `prompts` row shape, so wiring this into `PromptPreviewBox` (every card)
 * and `PromptDetailView`'s own text block (both shared by all three) covers
 * all three types without any per-type special-casing; `RequestCard`/
 * `RequestDetailView` use this same component directly above a real
 * request's own instruction text (its `description`).
 *
 * Always icon + visible "Kopyala" label together (never icon-only — §10.1),
 * keyboard/focus accessible (a real `<button>`, no custom div), and safe to
 * drop inside a "stretched-link" card (`event.preventDefault`/
 * `stopPropagation` + its own `relative z-10` stacking, matching this
 * project's existing LikeButton/SaveButton/ShareButton convention).
 */
export function CopyPromptButton({
  text,
  label = "Kopyala",
  className,
  size = "sm",
}: {
  /** The exact prompt/instruction text to copy — never a title, author, tag or other metadata (§10.1/§10.3). */
  text: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBusyRef = useRef(false);

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    // Guards against a rapid double-click firing two overlapping copy
    // attempts (§19's "birden fazla hızlı tıklamada hatalı çift işlem
    // oluşmasını önle") — the async clipboard write itself is idempotent,
    // this only prevents two racing timeouts from fighting over `state`.
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    if (resetTimer.current) clearTimeout(resetTimer.current);

    const ok = await copyTextToClipboard(text);
    setState(ok ? "copied" : "failed");
    resetTimer.current = setTimeout(
      () => {
        setState("idle");
        isBusyRef.current = false;
      },
      ok ? 1500 : 2500,
    );
  }

  const Icon = state === "copied" ? Check : Copy;
  const displayLabel = state === "copied" ? "Kopyalandı" : state === "failed" ? "Kopyalanamadı" : label;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={displayLabel}
      title={state === "failed" ? "Kopyalanamadı, lütfen tekrar dene." : undefined}
      className={cn(
        "relative z-10 inline-flex min-h-[28px] shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        size === "sm" ? "text-xs" : "text-sm",
        state === "copied"
          ? "border-primary/40 bg-primary/10 text-primary"
          : state === "failed"
            ? "border-red-500/40 bg-red-500/5 text-red-600"
            : "border-border bg-surface text-text-muted hover:border-primary/40 hover:text-primary",
        className,
      )}
    >
      <Icon size={size === "sm" ? 12 : 14} />
      {displayLabel}
    </button>
  );
}
