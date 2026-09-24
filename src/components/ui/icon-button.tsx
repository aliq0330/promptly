import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

/** Shared visual style, reused by non-<button> elements (e.g. Link) that need the same look. */
export const iconButtonClassName = (active?: boolean, className?: string) =>
  cn(
    "inline-flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors duration-200 hover:bg-surface-soft hover:text-text",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    active && "bg-primary-soft text-primary",
    className,
  );

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, label, active, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={iconButtonClassName(active, className)}
        {...props}
      />
    );
  },
);
IconButton.displayName = "IconButton";
