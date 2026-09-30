"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Chip, ChipRow } from "@/components/ui/chip";
import { ToolPicker } from "@/features/content/tool-picker";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { CONTENT_TYPE_IDS, getCategories, taxonomyLabel, type ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { resizeImageToDataUrlFit } from "@/lib/utils";

export interface WorkflowMeta {
  title: string;
  description: string;
  coverUrl: string | null;
  contentTypes: ContentTypeId[];
  category: string | null;
  tools: string[];
}

export const EMPTY_META: WorkflowMeta = { title: "", description: "", coverUrl: null, contentTypes: [], category: null, tools: [] };

/** Workflow-level details: cover, name, description, content types (multi), category (only of the chosen types) and recommended tools. */
export function WorkflowMetaForm({ meta, onChange, titleError }: { meta: WorkflowMeta; onChange: (patch: Partial<WorkflowMeta>) => void; titleError?: boolean }) {
  const { t, language } = useTranslation();
  const [coverError, setCoverError] = useState(false);

  // Categories exist per content type; show only those of the selected types.
  const categories = meta.contentTypes.flatMap((type) => getCategories(type).map((category) => ({ type, category })));

  function toggleType(type: ContentTypeId) {
    const next = meta.contentTypes.includes(type) ? meta.contentTypes.filter((x) => x !== type) : [...meta.contentTypes, type];
    const stillValid = meta.category && next.some((x) => getCategories(x).some((c) => c.id === meta.category));
    onChange({ contentTypes: next, category: stillValid ? meta.category : null });
  }

  async function handleCover(file: File | undefined) {
    if (!file) return;
    try {
      const image = await resizeImageToDataUrlFit(file, 900);
      setCoverError(false);
      onChange({ coverUrl: image.url });
    } catch {
      setCoverError(true);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <div>
        <p className="mb-1.5 text-sm font-medium text-text">
          {t("workflow.coverLabel")} <span className="text-text-muted">({t("common.optional")})</span>
        </p>
        {meta.coverUrl ? (
          <div className="relative aspect-video w-full max-w-xs overflow-hidden rounded-md border border-border md:max-w-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- real local data URL */}
            <img src={meta.coverUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange({ coverUrl: null })}
              aria-label={t("workflow.coverRemove")}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <label className="flex aspect-video w-full max-w-xs cursor-pointer items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-soft text-label font-medium text-text-secondary hover:border-primary md:max-w-none">
            {t("workflow.coverAdd")}
            <input type="file" accept="image/*" className="sr-only" onChange={(event) => handleCover(event.target.files?.[0])} />
          </label>
        )}
        {coverError && <p className="mt-1 text-caption text-danger">{t("prompt.imageUploadFailed")}</p>}
      </div>

      <div className="min-w-0 space-y-4">
        <div>
          <label htmlFor="wf-title" className="mb-1.5 block text-sm font-medium text-text">
            {t("workflow.titleLabel")} <span className="text-danger">*</span>
          </label>
          <input
            id="wf-title"
            value={meta.title}
            maxLength={120}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder={t("workflow.titlePlaceholder")}
            aria-invalid={titleError}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted aria-[invalid=true]:border-danger"
          />
          {titleError && <p className="mt-1 text-caption text-danger">{t("workflow.issueTitleRequired")}</p>}
        </div>
        <div>
          <label htmlFor="wf-desc" className="mb-1.5 block text-sm font-medium text-text">
            {t("workflow.descriptionLabel")}
          </label>
          <textarea
            id="wf-desc"
            rows={3}
            value={meta.description}
            maxLength={1000}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder={t("workflow.descriptionPlaceholder")}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
          />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-text">{t("workflow.contentTypesLabel")}</p>
          <ChipRow>
            {CONTENT_TYPE_IDS.map((type) => (
              <Chip key={type} icon={CONTENT_TYPE_META[type].icon} selected={meta.contentTypes.includes(type)} onClick={() => toggleType(type)}>
                {t(CONTENT_TYPE_META[type].labelKey)}
              </Chip>
            ))}
          </ChipRow>
        </div>
        {categories.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-text">
              {t("workflow.categoryLabel")} <span className="text-text-muted">({t("common.optional")})</span>
            </p>
            <ChipRow>
              {categories.map(({ type, category }) => (
                <Chip
                  key={`${type}-${category.id}`}
                  selected={meta.category === category.id}
                  onClick={() => onChange({ category: meta.category === category.id ? null : category.id })}
                >
                  {meta.contentTypes.length > 1 ? `${t(CONTENT_TYPE_META[type].labelKey)} · ` : ""}
                  {taxonomyLabel(category.labelKey, language)}
                </Chip>
              ))}
            </ChipRow>
          </div>
        )}
        <div>
          <ToolPicker
            label={t("tool.recommendedLabel")}
            value={meta.tools}
            onChange={(tools) => onChange({ tools })}
            contentTypes={meta.contentTypes}
            category={meta.category}
          />
          <p className="mt-1 text-caption text-text-muted">{t("workflow.noteToolsMeta")}</p>
        </div>
      </div>
    </div>
  );
}
