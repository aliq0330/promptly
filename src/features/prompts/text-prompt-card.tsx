import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, promptHref } from "@/lib/utils";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { PromptCardFooter } from "./prompt-card-footer";
import { RemixSourceLink } from "./remix-source-link";
import type { Prompt } from "@/types";

/**
 * Compact, media-free card for non-image prompt types. Never renders an
 * empty image placeholder — there is no real preview to show for these
 * content types, so the prompt text preview carries the card instead.
 */
export function TextPromptCard({ prompt }: { prompt: Prompt }) {
  const meta = CONTENT_TYPE_META[prompt.contentType];
  const Icon = meta.icon;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center gap-1.5 text-primary">
          <Icon size={14} />
          <span className="text-xs font-medium">{meta.label} Prompt</span>
        </div>

        <h3 className="line-clamp-1 text-sm font-semibold text-text">{prompt.title}</h3>

        {prompt.origin.type !== "original" && <RemixSourceLink origin={prompt.origin} />}

        <p className="line-clamp-2 text-xs text-text-muted">{prompt.description}</p>

        <div
          className={cn(
            "rounded-md bg-accent-surface/60 px-3 py-2 text-xs text-text-muted",
            prompt.contentType === "code" && "font-mono",
          )}
        >
          <p className="line-clamp-3">{prompt.promptText}</p>
        </div>

        <div className="pointer-events-none flex items-center gap-1 text-xs font-medium text-primary">
          Tamamını görüntüle
          <ArrowRight size={12} />
        </div>

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {prompt.tags.slice(0, 2).map((tag) => (
            <Badge key={tag.slug}>{tag.label}</Badge>
          ))}
        </div>
      </div>

      <PromptCardFooter prompt={prompt} />

      <Link href={promptHref(prompt)} className="absolute inset-0 z-0" aria-label={prompt.title} />
    </div>
  );
}
