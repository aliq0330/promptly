"use client";

import { MultiImagePicker } from "@/features/content/multi-image-picker";
import { ComposeSection, FormField, formTextInputClassName, formTextareaClassName } from "@/features/content/compose-form";
import { ContentTypePicker } from "@/features/content/compose-fields";
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
 * Workflow'un "Temel bilgiler" bölümü (docs/history/244-*): tür, ad, açıklama ve küçük kapak şeridi — Prompt / İstek / Hazır ayarla aynı etiketli
 * form düzeni. Kategori, Araç ve Etiketler editörün "İsteğe bağlı ayrıntılar" bölümündedir.
 */
export function WorkflowMetaForm({
  meta,
  onChange,
  titleError,
}: {
  meta: WorkflowMeta;
  onChange: (patch: Partial<WorkflowMeta>) => void;
  titleError?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <ComposeSection title={t("formSection.basics")}>
      <FormField label={t("compose.whatMaking")} required>
        <ContentTypePicker value={meta.contentType} onChange={(type) => onChange({ contentType: type, category: null, subcategory: null })} />
      </FormField>
      <FormField label={t("workflow.titleLabel")} htmlFor="wf-title" required error={titleError ? t("workflow.issueTitleRequired") : null}>
        <input
          id="wf-title"
          value={meta.title}
          onChange={(event) => onChange({ title: event.target.value })}
          maxLength={120}
          placeholder={t("workflow.titlePlaceholder")}
          aria-invalid={Boolean(titleError)}
          className={formTextInputClassName}
        />
      </FormField>
      <FormField label={t("workflow.descriptionLabel")} htmlFor="wf-desc" optional>
        <textarea
          id="wf-desc"
          value={meta.description}
          onChange={(event) => onChange({ description: event.target.value })}
          maxLength={1000}
          rows={3}
          placeholder={t("workflow.descriptionPlaceholder")}
          className={formTextareaClassName}
        />
      </FormField>
      <FormField label={t("formSection.cover")} optional>
        <MultiImagePicker max={4} items={meta.media} onChange={(media) => onChange({ media })} hint="" />
      </FormField>
    </ComposeSection>
  );
}
