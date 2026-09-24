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
        "inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-caption font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
