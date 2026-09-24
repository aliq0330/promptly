import { ArrowRight, Blocks, SlidersHorizontal } from "lucide-react";
import { generatorHref } from "@/lib/utils";
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { PostHeader } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { GENERATOR_CATEGORY_TOPIC_LABELS } from "./generator-category-meta";
import type { Generator } from "@/types";

/**
 * GeneratorCard — the same ContentCard shell, header, tags and action row
 * as PromptCard; only the middle block differs. A generator is a
 * structured-prompt BUILDER, so instead of a large cover image (which would
 * read as an image-generation tool) its card shows a compact "builder"
 * panel — the same surface as the prompt block — naming what it builds and
 * inviting use. The cover, if any, is only a small thumbnail there.
 */
export function GeneratorCard({
  generator,
  onDeleted,
  collectionRemoval,
}: {
  generator: Generator;
  onDeleted?: () => void;
  /** Same "kaydedilenlerden kaldır"/"koleksiyondan kaldır" menu entry a prompt card gets inside a collection the viewer owns. */
  collectionRemoval?: { isDefault: boolean; onRemove: () => Promise<void> };
}) {
  const href = generatorHref(generator);
  const topic = GENERATOR_CATEGORY_TOPIC_LABELS[generator.category];

  return (
    <ContentCard href={href}>
      <ContentCardBody>
        <PostHeader generator={generator} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />

        <div className="space-y-2">
          <ContentTypeLabel icon={Blocks} label="Generator" detail={topic} />
          <ContentCardTitle href={href} title={generator.title} description={generator.description} />
        </div>

        <div className="flex items-center gap-3 rounded-md border border-border-soft bg-surface-soft p-2.5">
          {generator.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- real, potentially locally-produced data URL cover
            <img src={generator.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-sm object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
              <SlidersHorizontal size={20} strokeWidth={1.75} />
            </span>
          )}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-caption text-text-muted">Yapılandırılmış prompt oluşturucu</span>
            <span className="block truncate text-label font-medium text-text">
              {generator.subcategory ? `${topic} · ${generator.subcategory}` : topic}
              {generator.enableNegativePrompt ? " · Negatif prompt" : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-sm bg-surface px-2 py-1 text-caption font-semibold text-primary shadow-xs transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
            Kullan
            <ArrowRight size={12} />
          </span>
        </div>

        <ContentTags tags={generator.tags} />
      </ContentCardBody>

      <PromptCardFooter generator={generator} />
    </ContentCard>
  );
}
