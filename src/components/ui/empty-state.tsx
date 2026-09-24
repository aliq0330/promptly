import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one empty-state layout for the whole app: a small icon tile (no large
 * illustrations), a title, one line of explanation, an optional action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 text-center",
        compact ? "py-8" : "py-14",
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <p className="text-h3 font-semibold text-text">{title}</p>
        {description && <p className="mx-auto max-w-sm text-small text-text-muted">{description}</p>}
      </div>
      {action &&
        ("href" in action ? (
          <Link href={action.href} className={buttonClassName({ size: "sm", className: "mt-1" })}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={buttonClassName({ size: "sm", variant: "outline", className: "mt-1" })}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
