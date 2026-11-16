"use client";

import type { ReactNode } from "react";
import { X } from "@/components/icons/x";
import { cn } from "@/lib/utils";

/**
 * The one in-flow notice strip (docs/history/403-*): a quiet tinted row above content — a first-time hint, a guest-access reminder.
 * `tone="info"` is the blue `primary-soft`, `tone="warning"` the amber `warning-soft`. An optional × (`onDismiss`) sits at the end. Floating notices
 * (the terms update, the announce report) are cards on `FLOATING_PANEL_CLASS`; toasts are `ToastBar`; the Hub's one-line attention row is `HubAttentionStrip`.
 */
export function Banner({
  tone = "info",
  onDismiss,
  dismissLabel,
  className,
  children,
  as: Tag = "section",
  ...rest
}: {
  tone?: "info" | "warning";
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
  children: ReactNode;
  as?: "section" | "div";
  "aria-label"?: string;
  [data: `data-${string}`]: string | boolean | undefined;
}) {
  return (
    <Tag className={cn("flex min-h-12 items-center gap-1 rounded-lg px-4 text-small", tone === "warning" ? "bg-warning-soft text-text" : "bg-primary-soft text-text", onDismiss && "pr-1", className)} {...rest}>
      {children}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface/60 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </Tag>
  );
}
