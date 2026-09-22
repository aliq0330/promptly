import Link from "next/link";
import { Blocks, GitBranch } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { GENERATOR_CATEGORY_TOPIC_LABELS } from "./generator-category-meta";
import { formatCount, generatorHref } from "@/lib/utils";
import type { Generator } from "@/types";

/** Discovery/search/profile-grid card for a real, published generator. */
export function GeneratorCard({ generator }: { generator: Generator }) {
  return (
    <Link
      href={generatorHref(generator)}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-md"
    >
      {generator.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- real, potentially locally-produced data URL cover
        <img src={generator.coverUrl} alt="" className="h-32 w-full rounded-md object-cover" />
      ) : (
        <div className="flex h-32 w-full items-center justify-center rounded-md bg-accent-surface text-primary">
          <Blocks size={28} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="accent">
          <Blocks size={10} className="mr-1" /> Generator
        </Badge>
        <Badge>{GENERATOR_CATEGORY_TOPIC_LABELS[generator.category]}</Badge>
        {generator.origin.type === "remix" && (
          <Badge variant="outline">
            <GitBranch size={10} className="mr-1" /> Remix
          </Badge>
        )}
      </div>

      <div>
        <h3 className="line-clamp-1 text-sm font-semibold text-text">{generator.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{generator.description}</p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar src={generator.creator.avatarUrl} alt={generator.creator.displayName} size={20} />
          <span className="truncate text-xs text-text-muted">{generator.creator.displayName}</span>
        </div>
        <span className="shrink-0 text-xs text-text-muted">{formatCount(generator.useCount)} kullanım</span>
      </div>
    </Link>
  );
}
