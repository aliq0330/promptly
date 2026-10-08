import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Shared form-control look for the account surfaces (auth pages, settings):
 * the same soft border, inner surface and focus treatment as the rest of the
 * "Editorial Premium" language (Bölüm 9.110–9.112). Purely presentational.
 */

/** The shared control surface, without a height — inputs, textareas, selects. */
export const fieldControlClassName =
  "w-full rounded-lg border border-border bg-background px-3.5 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60";

/** A single-line text input. */
export const fieldInputClassName = `h-11 ${fieldControlClassName}`;

/** A field's label line. */
export const fieldLabelClassName = "mb-1.5 block text-label font-medium text-text";

/**
 * A radio/checkbox choice rendered as a selectable card. The checked state
 * comes from the nested input (`has-checked`), so callers keep plain inputs.
 */
export function ChoiceCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border border-border-soft bg-background px-3.5 py-3 text-sm text-text transition-colors duration-200 ease-soft hover:border-border-strong has-checked:border-primary/50 has-checked:bg-primary-soft/40",
        className,
      )}
    >
      {children}
    </label>
  );
}

/** The round icon badge above an auth form's title. */
export function FormIconBadge({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-soft bg-primary-soft text-primary shadow-xs">
      {children}
    </div>
  );
}
