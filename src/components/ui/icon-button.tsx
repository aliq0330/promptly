import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

/** Shared visual style, reused by non-<button> elements (e.g. Link) that need the same look. */
export const iconButtonClassName = (active?: boolean, className?: string) =>
  cn(
    "inline-flex h-10 w-10 items-center justify-center rounded-sm text-text-muted transition-[background-color,color,transform] duration-200 ease-soft hover:bg-surface-soft hover:text-text active:scale-[0.92]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    active && "bg-primary-soft text-primary-text",
    className,
  );

/** `type` varsayılanı "button": çıplak <button> bir <form> içinde gönderim yapar (Skill editöründe ☰ formu kaydedip sayfadan atıyordu). Gönderen simge düğmesi `type="submit"` verir. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, label, active, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={iconButtonClassName(active, className)}
        {...props}
      />
    );
  },
);
IconButton.displayName = "IconButton";
