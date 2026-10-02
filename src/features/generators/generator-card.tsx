"use client";

import { ToolChips } from "@/features/content/tool-chips";
import { ArrowRight, Blocks, SlidersHorizontal } from "lucide-react";
import { generatorHref } from "@/lib/utils";
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { PostHeader } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { useTranslation } from "@/lib/i18n/language-provider";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
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
  const { t, language } = useTranslation();
  const href = generatorHref(generator);
  const topic = taxonomyPathLabel(generator, language);

  return (
    <ContentCard href={href}>
      <ContentCardBody>
        <PostHeader generator={generator} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />

        <div className="space-y-2">
          <ContentTypeLabel icon={Blocks} label={t("generator.singular")} detail={topic} />
          <ContentCardTitle href={href} title={generator.title} description={generator.description} />
        </div>

        <div className="flex items-center gap-3 rounded-md border border-border-soft bg-surface-soft p-2.5">
          {generator.coverUrl ? (
            <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- real, potentially locally-produced data URL cover */}
              <img src={generator.coverUrl} alt="" className="h-full w-full object-cover" />
              {generator.media.length > 1 && (
                <span className="absolute bottom-0 right-0 rounded-tl-sm bg-black/70 px-0.5 text-[0.6rem] font-medium leading-tight text-white">
                  {t("media.moreImagesBadge", { count: generator.media.length - 1 })}
                </span>
              )}
            </span>
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary">
              <SlidersHorizontal size={20} strokeWidth={1.75} />
            </span>
          )}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-caption text-text-muted">{t("generator.structuredPromptBuilder")}</span>
            <span className="block truncate text-label font-medium text-text">
              {topic}
              {generator.enableNegativePrompt ? ` · ${t("generator.negativePromptSuffix")}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-sm bg-surface px-2 py-1 text-caption font-semibold text-primary shadow-xs transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
            {t("generator.use")}
            <ArrowRight size={12} />
          </span>
        </div>

        <ToolChips refs={generator.tools} />
        <ContentTags tags={generator.tags} />
      </ContentCardBody>

      <PromptCardFooter generator={generator} />
    </ContentCard>
  );
}
