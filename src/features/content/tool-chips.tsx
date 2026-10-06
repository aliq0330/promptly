import Link from "next/link";
import { Wrench } from "lucide-react";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { cn } from "@/lib/utils";

/**
 * Small tool chips for cards/detail pages. Renders nothing when no known tool is set.
 * `linked` turns each chip into a link to the search results for that tool
 * (`/discover?tool=<id>`; a model chip searches its tool and all its models).
 */
export function ToolChips({ refs, className, linked }: { refs: string[] | null | undefined; className?: string; linked?: boolean }) {
  const items = resolveToolRefs(refs);
  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((item) => {
        const chip = "inline-flex h-6 items-center gap-1 rounded-full bg-primary-soft px-2.5 text-caption font-medium text-text-secondary";
        return linked ? (
          <Link key={item.ref} href={`/discover?tool=${encodeURIComponent(item.tool.id)}`} className={cn(chip, "transition-colors hover:bg-primary/15 hover:text-primary")}>
            <Wrench size={11} aria-hidden />
            {item.label}
          </Link>
        ) : (
          <span key={item.ref} className={chip}>
            <Wrench size={11} aria-hidden />
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

/** Detail-page row: "Tavsiye edilen araç/model: [chips]" (legacy free text as fallback); nothing if unset. */
export function ToolLine({ label, refs, legacy }: { label: string; refs: string[] | null | undefined; legacy?: string | null }) {
  const hasKnown = resolveToolRefs(refs).length > 0;
  if (!hasKnown && !legacy) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-caption font-medium text-text-muted">{label}</span>
      {hasKnown ? (
        <ToolChips refs={refs} linked />
      ) : (
        <Link href={`/discover?q=${encodeURIComponent(legacy ?? "")}`} className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2.5 text-caption font-medium text-text-secondary transition-colors hover:bg-primary/15 hover:text-primary">{legacy}</Link>
      )}
    </div>
  );
}
