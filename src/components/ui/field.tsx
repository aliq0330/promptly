import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/*
 * Shared form-control look for the account surfaces (auth pages, settings):
 * the same soft border, inner surface and focus treatment as the rest of the
 * "Editorial Premium" language (Bölüm 9.110–9.112). Purely presentational.
 */

/** The shared control surface, without a height — inputs, textareas, selects. */
export const fieldControlClassName =
  "w-full rounded-lg border border-control-border bg-background px-3.5 text-small text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-text-muted focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** A single-line text input. */
export const fieldInputClassName = `h-11 ${fieldControlClassName}`;

/**
 * Control heights pair with button heights: `dense` 40 px sits beside a `Button md` (40), the default 44 px beside the 44 px
 * buttons of the auth / settings forms. Pick one — never a bare `h-9` / `h-12` on a text field (audit G4).
 */
export const fieldDenseInputClassName = `h-10 ${fieldControlClassName}`;

/** A multi-line field: same surface, a sensible minimum, vertical resize only. */
export const fieldTextareaClassName = `min-h-24 resize-y py-2.5 ${fieldControlClassName}`;

const invalidClassName = "border-danger focus:border-danger";

/** The text input. `dense` = 40 px (inline / dialog), default 44 px (forms). */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { dense?: boolean; invalid?: boolean }>(
  ({ dense, invalid, className, ...props }, ref) => (
    <input ref={ref} aria-invalid={invalid || undefined} className={cn(dense ? fieldDenseInputClassName : fieldInputClassName, invalid && invalidClassName, className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ invalid, className, ...props }, ref) => (
    <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(fieldTextareaClassName, invalid && invalidClassName, className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { dense?: boolean; invalid?: boolean }>(
  ({ dense, invalid, className, ...props }, ref) => (
    <select ref={ref} aria-invalid={invalid || undefined} className={cn(dense ? fieldDenseInputClassName : fieldInputClassName, invalid && invalidClassName, className)} {...props} />
  ),
);
Select.displayName = "Select";

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
        "flex cursor-pointer items-start gap-3 rounded-lg border border-border-soft bg-background px-3.5 py-3 text-small text-text transition-colors duration-200 ease-soft hover:border-border-strong has-checked:border-primary/50 has-checked:bg-primary-soft/40",
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
