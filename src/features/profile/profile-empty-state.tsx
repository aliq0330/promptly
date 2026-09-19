import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Shared empty-state layout for every profile tab/filter (CLAUDE.md section
 * 22) — sade, tek illüstrasyon yerine ikon rozeti, açık/koyu temayla uyumlu.
 */
export function ProfileEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
        <Icon size={22} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="max-w-xs text-sm text-text-muted">{description}</p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="mt-1 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
