"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn, copyTextToClipboard } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { recordPromptCopy } from "@/lib/supabase/prompt-usage";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Başarılı bir kopyalama kaydından sonra `window`'a atılır (`detail.promptId`); "Çalıştı mı?" bloğu dinler. */
export const PROMPT_COPIED_EVENT = "promptly:prompt-copied";

/**
 * The one shared "Kopyala" button used directly above a real prompt text
 * block on every content surface (CLAUDE.md §10) — a prompt gönderisi and a
 * prompt yanıtı are the SAME `prompts` row shape, so wiring this into
 * `PromptPreviewBox` (every card) and `PromptDetailView`'s own text block
 * (shared by both) covers both types without any per-type special-casing;
 * `RequestCard`/`RequestDetailView` use this same component directly above
 * a real request's own instruction text (its `description`).
 *
 * Always icon + visible "Kopyala" label together (never icon-only — §10.1),
 * keyboard/focus accessible (a real `<button>`, no custom div), and safe to
 * drop inside a "stretched-link" card (`event.preventDefault`/
 * `stopPropagation` + its own `relative z-10` stacking, matching this
 * project's existing LikeButton/SaveButton/ShareButton convention).
 */
export function CopyPromptButton({
  text,
  promptId,
  label,
  className,
  size = "sm",
  variant = "outline",
}: {
  /** The exact prompt/instruction text to copy — never a title, author, tag or other metadata (§10.1/§10.3). */
  text: string;
  /** When given, a successful copy counts one "use" for that prompt (signed-in viewers only; see `recordPromptCopy`). */
  promptId?: string;
  label?: string;
  className?: string;
  /** "lg" = the detail page's big primary action (a large pill, docs/history/201-*). */
  size?: "sm" | "md" | "lg";
  /** "primary" = the one filled action of a prompt block (detail page); "link" = bare text action (Meydan card prompt box);
   *  "segment" = the left half of the detail page's joined Kopyala | Çalıştır pill (docs/history/229-*; the wrapper rounds and clips it). */
  variant?: "outline" | "primary" | "link" | "segment";
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
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
    if (ok && promptId && user) {
      // Kopyalama kaydı yazıldıktan sonra "Çalıştı mı?" bloğu oy verebilir hâle gelir (docs/history/296-*): açık blok yeniden yüklenir.
      void recordPromptCopy(promptId).finally(() => window.dispatchEvent(new CustomEvent(PROMPT_COPIED_EVENT, { detail: { promptId } })));
    }
    resetTimer.current = setTimeout(
      () => {
        setState("idle");
        isBusyRef.current = false;
      },
      ok ? 1500 : 2500,
    );
  }

  const Icon = state === "copied" ? Check : Copy;
  const displayLabel = state === "copied" ? t("common.copied") : state === "failed" ? t("prompt.copyFailed") : (label ?? t("common.copy"));

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={displayLabel}
      title={state === "failed" ? t("prompt.copyFailedRetry") : undefined}
      className={cn(
        "relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-sm border font-medium transition-[background-color,border-color,color] duration-200 ease-soft",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        size === "sm" ? "h-7 px-2 text-caption" : size === "md" ? "h-9 px-3 text-label" : "h-14 gap-2 rounded-full px-7 text-body font-semibold shadow-pop",
        state === "copied"
          ? "border-primary/30 bg-primary-soft text-primary"
          : state === "failed"
            ? "border-danger/40 bg-danger/5 text-danger"
            : variant === "primary" || variant === "segment"
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
              : variant === "link"
                ? "border-transparent bg-transparent font-bold text-primary hover:text-primary-hover"
                : "border-border-soft bg-surface text-text-secondary hover:border-border hover:text-text",
        variant === "segment" && "h-11 flex-1 justify-center gap-2 rounded-none border-0 px-5 text-label font-bold focus-visible:ring-inset focus-visible:ring-offset-0",
        className,
      )}
    >
      <Icon key={state} size={variant === "segment" ? 16 : size === "sm" ? 12 : size === "md" ? 14 : 20} className={state === "copied" ? "animate-check-pop" : undefined} />
      {displayLabel}
    </button>
  );
}
