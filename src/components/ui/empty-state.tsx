import Link from "next/link";
import type { IconComponent } from "@/components/icons/icon";
import { LineArtScene } from "@/components/line-art/line-art-scene";
import type { LineArtKind } from "@/components/line-art/kinds";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one empty-state layout for the whole app: a small icon tile, a title, one line of explanation, an optional action.
 * `scene` (docs/history/374-*) swaps the icon tile for a small animated line-art scene of the same story — used on the empty
 * states of the app's main places (lists, inbox, library), not on every in-panel "nothing here" line, which keep the tile.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
  scene,
}: {
  icon: IconComponent;
  title: string;
  description?: React.ReactNode;
  action?: { label: string; href: string } | { label: string; onClick: () => void; variant?: "primary" | "outline" };
  className?: string;
  compact?: boolean;
  scene?: LineArtKind;
}) {
  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center gap-3 rounded-lg px-6 text-center",
        scene ? "border-0" : "border border-dashed border-border",
        scene ? (compact ? "py-4" : "py-8") : compact ? "py-8" : "py-14",
        className,
      )}
    >
      {scene ? (
        <LineArtScene kind={scene} className={cn("w-full rounded-xl border border-border-soft", compact ? "max-w-[16rem]" : "max-w-sm")} />
      ) : (
      <div className="mi-empty-tile flex h-11 w-11 items-center justify-center rounded-md bg-primary-soft text-primary-text">
        <Icon size={20} />
      </div>
      )}
      <div className="space-y-1">
        <h2 className="font-sans text-h3 font-bold text-text">{title}</h2>
        {description && <p className="mx-auto max-w-sm text-small text-text-muted">{description}</p>}
      </div>
      {action &&
        ("href" in action ? (
          <Link href={action.href} className={buttonClassName({ size: "sm", className: "mt-1" })}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={buttonClassName({ size: "sm", variant: action.variant ?? "outline", className: "mt-1" })}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
