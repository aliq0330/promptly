import type { LucideIcon } from "lucide-react";

interface PlaceholderPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * Temporary stand-in for routes whose real feature module hasn't been
 * built yet (see CLAUDE.md section 8 for build order). Replace with the
 * real feature component when that module ships — never wire this up to
 * look like working functionality.
 */
export function PlaceholderPage({ icon: Icon, title, description }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-surface text-primary">
        <Icon size={28} />
      </div>
      <h1 className="text-h1 font-semibold text-text">{title}</h1>
      <p className="max-w-sm text-sm text-text-muted">{description}</p>
      <span className="mt-2 rounded-sm bg-accent-surface px-2 py-1 text-xs font-medium text-primary">
        Yakında
      </span>
    </div>
  );
}
