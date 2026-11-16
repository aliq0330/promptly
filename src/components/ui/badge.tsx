import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "accent" | "outline" | "neutral" | "secondary" | "success" | "warning" | "danger" | "overlay";
type BadgeSize = "sm" | "md";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

/**
 * The one small label (content type, category, tag, status, role, review state — docs/history/406-*): `rounded-full`,
 * 12 px, medium. Status colours come from the `*-soft` tokens, so they stay legible in every mode; `overlay` is for a chip
 * drawn on a picture (`bg-art-chip`). Role / review / mute / dock badges are thin wrappers that only pick the label and tone.
 */
const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary-soft text-primary",
  accent: "bg-primary text-primary-foreground",
  outline: "border border-border text-text-secondary",
  neutral: "bg-surface-soft text-text-secondary",
  secondary: "bg-secondary-soft text-secondary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  overlay: "bg-art-chip text-on-art",
};

const sizeClasses: Record<BadgeSize, string> = {
  md: "gap-1 px-2.5 py-0.5",
  sm: "gap-1 px-2 py-0.5",
};

export function Badge({ className, variant = "default", size = "md", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full text-caption font-medium", sizeClasses[size], variantClasses[variant], className)}
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
