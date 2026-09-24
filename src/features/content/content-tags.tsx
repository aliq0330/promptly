import Link from "next/link";
import { tagHref } from "@/lib/utils";
import type { Tag } from "@/types";

/** Quiet `#tag` links at the bottom of a card — each opens that tag's page. */
export function ContentTags({ tags, max = 3 }: { tags: Tag[]; max?: number }) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {shown.map((tag) => (
        <Link
          key={tag.slug}
          href={tagHref(tag)}
          className="relative z-10 rounded-xs text-caption font-medium text-text-muted transition-colors hover:text-primary"
        >
          #{tag.label}
        </Link>
      ))}
      {rest > 0 && <span className="text-caption text-text-muted">+{rest}</span>}
    </div>
  );
}
