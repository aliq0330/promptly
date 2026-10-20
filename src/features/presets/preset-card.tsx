"use client";

import { SlidersHorizontal, WandSparkles } from "lucide-react";
import { presetHref } from "@/lib/utils";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { presetParameterEntries } from "@/lib/preset-utils";
import Link from "next/link";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { CARD_PRIMARY_CLASS, ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { PostTargetMenu, postMeta } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Preset } from "@/types";

/**
 * PresetCard — the Albüm card (`ContentCardPost`, docs/history/202-*) like PromptCard/WorkflowCard (Hazır Ayar = the 5th
 * first-class content type); its art is a "parameters" tile (the first few parameter chips, the parameter count and the
 * tool — "Genel" when it is not tied to one), its big action "Studio'da aç".
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
    <ContentCard href={href}>
      <ContentCardPost
        author={preset.creator}
        meta={postMeta(preset.creator.username, preset.createdAt, language)}
        badges={
          <>
            <ContentTypePill icon={SlidersHorizontal} label={t("preset.singular")} detail={category} />
            {preset.status === "draft" ? (
              <Badge variant="warning">{t("preset.draftBadge")}</Badge>
            ) : preset.visibility === "private" ? (
              <Badge variant="neutral">{t("preset.privateBadge")}</Badge>
            ) : null}
          </>
        }
        menu={<PostTargetMenu preset={preset} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />}
        art={
          <div className="space-y-2.5 rounded-lg bg-surface p-3.5 shadow-pop">
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
        primary={
          // Short visible label ("Studio'da aç" pushed the counters out of a phone-width card); the full name stays the accessible one.
          <Link href={`/studio?preset=${preset.id}`} aria-label={t("studio.openInStudio")} title={t("studio.openInStudio")} className={CARD_PRIMARY_CLASS}>
            <WandSparkles size={14} aria-hidden />
            Studio
          </Link>
        }
        footer={<PromptCardFooter preset={preset} />}
      />
    </ContentCard>
  );
}
