"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One logical section of a creation screen in its own card — the surface
 * pattern shared by Prompt, Prompt İsteği, Generator, Workflow and Hazır Ayar:
 * a card per MAIN topic (Kategori, Temel Bilgiler, Görseller, Araç / Model,
 * Etiketler, Görünürlük, …), never one big form card and never a card per
 * single input. `FormSections` is the vertical stack that spaces them.
 */
export function FormSection({
  title,
  description,
  action,
  children,
  className,
  ...rest
}: {
  title?: string;
  description?: string;
  /** Small control aligned to the right of the heading (e.g. "clear"). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5", className)} {...rest}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-caption text-text-secondary">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** The vertical stack of `FormSection` cards. */
export function FormSections({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 space-y-4", className)}>{children}</div>;
}
