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
import { TextArt, TextArtTitle } from "@/features/content/text-art";
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
  const shown = entries.slice(0, 4);
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
        titleInArt
        art={
          <TextArt seed={preset.id}>
            <TextArtTitle>{preset.title}</TextArtTitle>
            {shown.length > 0 && (
              <ul aria-label={t("preset.contentsTitle")}>
                {shown.map((entry) => (
                  <li key={entry.fieldId} className="flex items-baseline justify-between gap-3 border-b border-current/15 py-1 text-small last:border-b-0">
                    <span className="shrink-0 opacity-70">{entry.fieldLabel}</span>
                    <span className="truncate font-semibold">{entry.valueLabel}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="truncate text-caption opacity-70">
              {t("preset.paramCount", { count: entries.length })} · {toolLabel ?? t("preset.generalTool")}
            </p>
          </TextArt>
        }
        title={<ContentCardTitle href={href} title={preset.title} />}
        footer={<PromptCardFooter preset={preset} />}
      />
    </ContentCard>
  );
}
