"use client";

import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { presetHref } from "@/lib/utils";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { presetParameterEntries } from "@/lib/preset-utils";
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ToolChips } from "@/features/content/tool-chips";
import { ContentTags } from "@/features/content/content-tags";
import { PostHeader } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Preset } from "@/types";

/**
 * PresetCard — the same ContentCard shell, PostHeader (author, time,
 * three-dot menu), type line and Beğeni · Yorum · Kaydet · İstatistik · Paylaş
 * footer as PromptCard/GeneratorCard/WorkflowCard (Hazır Ayar = the 5th
 * first-class content type, CLAUDE.md Bölüm 9.83); only the middle block
 * differs: a compact "parameters" panel (the same surface as the prompt
 * block) with the first few parameter chips, the parameter and use counts and
 * the tool chips ("Genel" when it is not tied to one tool).
 */
export function PresetCard({
  preset,
  onDeleted,
  collectionRemoval,
}: {
  preset: Preset;
  onDeleted?: () => void;
  collectionRemoval?: { isDefault: boolean; onRemove: () => Promise<void> };
}) {
  const { t, language } = useTranslation();
  const href = presetHref(preset);
  const entries = presetParameterEntries(preset, language);
  const shown = entries.slice(0, 3);
  const category = taxonomyPathLabel(preset, language, true);

  return (
    <ContentCard href={href}>
      <ContentCardBody>
        <PostHeader preset={preset} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <ContentTypeLabel icon={SlidersHorizontal} label={t("preset.singular")} detail={category} />
            {preset.status === "draft" ? (
              <Badge variant="warning">{t("preset.draftBadge")}</Badge>
            ) : preset.visibility === "private" ? (
              <Badge variant="neutral">{t("preset.privateBadge")}</Badge>
            ) : null}
          </div>
          <ContentCardTitle href={href} title={preset.title} description={preset.description} />
        </div>

        <div className="space-y-2 rounded-md border border-border-soft bg-surface-soft p-2.5">
          {shown.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label={t("preset.contentsTitle")}>
              {shown.map((entry) => (
                <li key={entry.fieldId} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-caption text-text-secondary">
                  <span className="shrink-0 text-text-muted">{entry.fieldLabel}:</span>
                  <span className="truncate font-medium text-text">{entry.valueLabel}</span>
                </li>
              ))}
              {entries.length > shown.length && (
                <li className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-caption font-medium text-text-muted">
                  +{entries.length - shown.length}
                </li>
              )}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 text-caption text-text-muted">
            <span>
              {t("preset.paramCount", { count: entries.length })} · {t("preset.useCount", { count: preset.useCount })}
            </span>
            <span className="flex shrink-0 items-center gap-1 font-semibold text-primary transition-colors duration-200 group-hover:text-primary-hover">
              {t("preset.view")}
              <ArrowRight size={12} />
            </span>
          </div>
        </div>

        {preset.tools.length > 0 ? (
          <ToolChips refs={preset.tools} />
        ) : (
          <span className="inline-flex h-6 w-fit items-center rounded-full bg-surface-soft px-2.5 text-caption font-medium text-text-muted">{t("preset.generalTool")}</span>
        )}
        <ContentTags tags={preset.tags} />
      </ContentCardBody>

      <PromptCardFooter preset={preset} />
    </ContentCard>
  );
}
