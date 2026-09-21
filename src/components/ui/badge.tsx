import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "accent" | "outline" | "success" | "danger";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-accent-surface text-primary",
  accent: "bg-primary text-primary-foreground",
  outline: "border border-border text-text-muted",
  // Status colors (e.g. an open vs. closed prompt request) — plain
  // Tailwind red/green at a single shade, matching this codebase's existing
  // convention for error text (`text-red-500` etc. throughout the auth/
  // create forms): no `dark:` variant, because this project's `dark` mode
  // is a manually-toggled `.dark` class on <html>, not the OS-level
  // `prefers-color-scheme` Tailwind's default `dark:` variant matches —
  // a `dark:` class here would silently never apply.
  success: "bg-green-500/15 text-green-600",
  danger: "bg-red-500/15 text-red-600",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
