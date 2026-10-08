import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Shared class builder so a `<Link>` that must look exactly like a button
 * (e.g. "Giriş yap", "Prompt oluştur" CTAs) uses the same tokens instead of
 * re-typing them.
 */
export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center rounded-md font-medium tracking-[-0.005em] whitespace-nowrap",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-soft active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

const variantClasses: Record<ButtonVariant, string> = {
  // Primary carries a faint top light-catch (inset highlight) + hairline
  // shadow: the small detail that makes a filled button feel pressed-glass
  // rather than flat paint.
  primary:
    "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(var(--p-shadow)/calc(0.12*var(--p-sa)))] hover:bg-primary-hover",
  secondary: "bg-primary-soft text-primary hover:bg-primary-soft/70",
  ghost: "bg-transparent text-text-secondary hover:bg-surface-soft hover:text-text",
  outline: "border border-border bg-surface text-text shadow-xs hover:border-border-strong hover:bg-surface-soft",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-label",
  md: "h-10 gap-2 px-4 text-small",
  lg: "h-12 gap-2 px-6 text-body",
  icon: "h-10 w-10 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return <button ref={ref} className={buttonClassName({ variant, size, className })} {...props} />;
  },
);
Button.displayName = "Button";
