"use client";

import { SlidersHorizontal } from "lucide-react";
import { presetHref } from "@/lib/utils";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { presetParameterEntries } from "@/lib/preset-utils";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { AnnouncedChip } from "@/features/communities/announced-chip";
import { PostTargetMenu, postMeta } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Preset } from "@/types";

/**
 * PresetCard — the visual card (`ContentCardPost`, docs/history/266-*) like PromptCard/WorkflowCard (Hazır Ayar = the 5th
 * first-class content type); its art is a "parameters" tile (the first few parameter chips, the parameter count and the
 * tool — "Genel" when it is not tied to one). "Studio'da aç" lives on the detail page.
 */
export function PresetCard({
  preset,
  onDeleted,
  collectionRemoval,
}: {
  preset: Preset;
  onDeleted?: () => void;
  collectionRemoval?: { onRemove: () => Promise<void> };
}) {
  const { t, language } = useTranslation();
  const href = presetHref(preset);
  const entries = presetParameterEntries(preset, language);
  const shown = entries.slice(0, 3);
  const category = taxonomyPathLabel(preset, language, true);
  const toolLabel = resolveToolRefs(preset.tools)[0]?.label ?? null;

  return (
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={preset.creator}
        meta={postMeta(preset.creator.username, preset.createdAt, language)}
        typeIcon={SlidersHorizontal}
        status={
          preset.status === "draft" ? (
            <Badge variant="warning">{t("preset.draftBadge")}</Badge>
          ) : preset.visibility === "private" ? (
            <Badge variant="neutral">{t("preset.privateBadge")}</Badge>
          ) : undefined
        }
        badges={
          <>
            <ContentTypePill icon={SlidersHorizontal} label={t("preset.singular")} detail={category} />
            <AnnouncedChip kind="preset" id={preset.id} />
          </>
        }
        menu={<PostTargetMenu preset={preset} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />}
        art={
          <div className="flex aspect-[4/5] w-full flex-col justify-center space-y-3 bg-primary-soft p-5">
            {shown.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t("preset.contentsTitle")}>
                {shown.map((entry) => (
                  <li key={entry.fieldId} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-soft px-2.5 py-1 text-caption text-text-secondary">
                    <span className="shrink-0 text-text-muted">{entry.fieldLabel}:</span>
                    <span className="truncate font-medium text-text">{entry.valueLabel}</span>
                  </li>
                ))}
                {entries.length > shown.length && (
                  <li className="inline-flex items-center rounded-full bg-surface-soft px-2.5 py-1 text-caption font-medium text-text-muted">
                    +{entries.length - shown.length}
                  </li>
                )}
              </ul>
            )}
            <p className="text-caption text-text-muted">
              {t("preset.paramCount", { count: entries.length })} · {toolLabel ?? t("preset.generalTool")}
            </p>
          </div>
        }
        title={<ContentCardTitle href={href} title={preset.title} />}
        footer={<PromptCardFooter preset={preset} />}
      />
    </ContentCard>
  );
}
