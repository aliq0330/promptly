"use client";

import { MultiImagePicker } from "@/features/content/multi-image-picker";
import { TitleField, DescriptionField } from "@/features/content/core-fields";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { ToolPicker } from "@/features/content/tool-picker";
import { FormSection, FormSections } from "@/features/content/form-section";
import { TagPicker } from "@/features/prompts/tag-picker";
import type { UseTagPickerResult } from "@/features/prompts/use-tag-picker";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import type { MultiImageItem } from "@/lib/supabase/media-input";
import { useTranslation } from "@/lib/i18n/language-provider";

export interface WorkflowMeta {
  title: string;
  description: string;
  media: MultiImageItem[];
  /** The workflow's main content type (same single-type picker as every other creation screen). The full `content_types` list stored on the row is this plus the types of the steps' linked content. */
  contentType: ContentTypeId;
  category: string | null;
  subcategory: string | null;
  tools: string[];
}

export const EMPTY_META: WorkflowMeta = { title: "", description: "", media: [], contentType: "image", category: null, subcategory: null, tools: [] };

/**
 * Workflow-level details, in the SAME order and with the same controls as the
 * Prompt / İstek / Generator / Hazır Ayar forms: Kategori → Başlık → Açıklama →
 * Kapak → Araç → Etiketler.
 */
export function WorkflowMetaForm({
  meta,
  onChange,
  titleError,
  tagPicker,
}: {
  meta: WorkflowMeta;
  onChange: (patch: Partial<WorkflowMeta>) => void;
  titleError?: boolean;
  tagPicker: UseTagPickerResult;
}) {
  const { t } = useTranslation();

  return (
    <FormSections>
      <FormSection title={t("taxonomy.categoryLabel")}>
        <TaxonomyPicker
          bare
          value={{ contentType: meta.contentType, category: meta.category, subcategory: meta.subcategory }}
          onChange={(next) => onChange({ contentType: next.contentType, category: next.category, subcategory: next.subcategory })}
        />
      </FormSection>

      <FormSection title={t("formSection.basics")}>
        <div className="space-y-4">
          <TitleField
            id="wf-title"
            label={t("workflow.titleLabel")}
            value={meta.title}
            onChange={(title) => onChange({ title })}
            placeholder={t("workflow.titlePlaceholder")}
            maxLength={120}
            required
            error={titleError ? t("workflow.issueTitleRequired") : null}
          />

          <DescriptionField
            id="wf-desc"
            label={t("workflow.descriptionLabel")}
            value={meta.description}
            onChange={(description) => onChange({ description })}
            placeholder={t("workflow.descriptionPlaceholder")}
            maxLength={1000}
            optional
          />
        </div>
      </FormSection>

      <FormSection title={t("formSection.cover")}>
        <MultiImagePicker items={meta.media} onChange={(media) => onChange({ media })} max={4} />
      </FormSection>

      <FormSection title={t("formSection.tool")}>
        <ToolPicker value={meta.tools} onChange={(tools) => onChange({ tools })} contentType={meta.contentType} category={meta.category} />
        <p className="mt-2 text-caption text-text-muted">{t("workflow.noteToolsMeta")}</p>
      </FormSection>

      <FormSection title={t("forms.tags")}>
        <TagPicker picker={tagPicker} />
      </FormSection>
    </FormSections>
  );
}
