"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { cn } from "@/lib/utils";

/**
 * A yes/no choice drawn like the "Kim görsün?" options (`PublishPanel`): a roomy bordered row, a ring that fills with the primary colour when
 * on, an optional icon, the label and a quiet hint. The native checkbox stays in the row (visually hidden) so keyboard, screen readers and
 * `onChange` behave as for any checkbox; `inputProps` passes attributes such as `data-*` to it.
 */
export function CheckRow({
  checked,
  onChange,
  label,
  hint,
  icon: Icon,
  disabled,
  inputProps,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  icon?: IconComponent;
  disabled?: boolean;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange" | "disabled"> & { [attribute: `data-${string}`]: string };
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors has-focus-visible:ring-2 has-focus-visible:ring-primary has-disabled:cursor-not-allowed has-disabled:opacity-50",
        checked ? "border-primary bg-primary-soft text-text" : "border-border-strong bg-surface text-text-secondary hover:border-primary/50",
        className,
      )}
    >
      <input type="checkbox" {...inputProps} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      <span aria-hidden className={cn("h-5 w-5 shrink-0 rounded-full border-2", checked ? "border-[6px] border-primary" : "border-border-strong")} />
      {Icon && <Icon size={20} aria-hidden className="shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold">{label}</span>
        {hint && <span className="block text-caption text-text-secondary">{hint}</span>}
      </span>
    </label>
  );
}
