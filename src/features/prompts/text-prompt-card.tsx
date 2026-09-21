import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { promptHref } from "@/lib/utils";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { PostHeader } from "./post-header";
import { RemixContext, RequestResponseContext } from "./post-context";
import { PromptPreviewBox } from "./prompt-preview-box";
import { PromptCardFooter } from "./prompt-card-footer";
import type { Prompt } from "@/types";

/**
 * Compact, media-free card for non-image prompt types. Never renders an
 * empty image placeholder — there is no real preview to show for these
 * content types, so the "Kullanılan prompt" box carries the card instead.
 */
export function TextPromptCard({
  prompt,
  onDeleted,
  collectionRemoval,
}: {
  prompt: Prompt;
  onDeleted?: () => void;
  collectionRemoval?: { isDefault: boolean; onRemove: () => Promise<void> };
}) {
  const meta = CONTENT_TYPE_META[prompt.contentType];
  const Icon = meta.icon;

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-surface pt-4 transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 px-4">
        <PostHeader
          prompt={prompt}
          subtitle={prompt.origin.type === "request-response" ? "Yanıt paylaştı" : undefined}
          onDeleted={onDeleted}
          collectionRemoval={collectionRemoval}
        />

        {prompt.origin.type === "remix" && <RemixContext sourcePromptId={prompt.origin.sourcePromptId} />}
        {prompt.origin.type === "request-response" && (
          <RequestResponseContext requestId={prompt.origin.requestId} currentPromptId={prompt.id} />
        )}

        <div className="flex items-center gap-1.5 text-primary">
          <Icon size={14} />
          <span className="text-xs font-medium">{meta.label} Prompt</span>
        </div>

        <div>
          <h3 className="text-base font-semibold text-text">{prompt.title}</h3>
          <p className="mt-1 line-clamp-3 text-sm text-text-muted">{prompt.description}</p>
        </div>

        {prompt.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {prompt.tags.slice(0, 2).map((tag) => (
              <Badge key={tag.slug}>{tag.label}</Badge>
            ))}
          </div>
        )}
      </div>

      <div className="px-4">
        <PromptPreviewBox prompt={prompt} />
      </div>

      <PromptCardFooter prompt={prompt} />

      <Link href={promptHref(prompt)} className="absolute inset-0 z-0" aria-label={prompt.title} />
    </div>
  );
}
