import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "accent" | "outline" | "neutral" | "success" | "warning" | "danger";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/**
 * Small, quiet labels (content type, category, tag, status). Status colors
 * come from the theme's `success`/`warning`/`danger` tokens, so they stay
 * legible in every palette and in dark mode.
 */
const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary-soft text-primary",
  accent: "bg-primary text-primary-foreground",
  outline: "border border-border text-text-secondary",
  neutral: "bg-surface-soft text-text-secondary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

const COUNT_TONES = {
  secondary: "bg-secondary text-secondary-foreground",
  primary: "bg-primary text-primary-foreground",
  danger: "bg-danger text-danger-foreground",
} as const;

/**
 * The one count bubble (unread, pending, section totals): 20 px minimum, `micro` bold digits, text colour from the matching
 * `*-foreground` token so it is readable in both modes (audit G1). Position / ring are passed in `className`.
 */
export function CountBadge({ tone = "secondary", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof COUNT_TONES }) {
  return (
    <span
      className={cn("inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-micro font-bold leading-none tabular-nums", COUNT_TONES[tone], className)}
      {...props}
    />
  );
}
