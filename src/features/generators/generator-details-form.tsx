"use client";

import { TitleField, DescriptionField } from "@/features/content/core-fields";
import { ToolPicker } from "@/features/content/tool-picker";
import { TagPicker } from "@/features/prompts/tag-picker";
import type { UseTagPickerResult } from "@/features/prompts/use-tag-picker";
import { useTranslation } from "@/lib/i18n/language-provider";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { MultiImagePicker } from "@/features/content/multi-image-picker";
import type { GeneratorMetaInput } from "@/lib/supabase/generators";

/**
 * Step 1 of the builder — the generator's own metadata (§4/§8/§27): title,
 * short description, topic category (the fixed `GeneratorCategoryTopic`
 * enum — the generator's own discovery topic, entirely unrelated to the
 * field-organization category system that used to exist in step 2 and was
 * removed, see CLAUDE.md), an optional free-typed subcategory, tags
 * (the shared, already-generic `TagPicker` — reused as-is, no
 * generator-specific fork), zero or more cover images (`MultiImagePicker`),
 and the generator-level toggles (visibility lives in the shared footer of the last step), (prompt-editing/saving/
 * negative-prompt). There is no dedicated `generator-covers` Storage
 * bucket (this feature's migration deliberately didn't add one — see
 * CLAUDE.md), so each cover is stored the same way this app already stores
 * every localStorage-era image (avatar edit, request reference image): a
 * real, compact data URL, in a real `generator_media` row — a real
 * Postgres `text` column has no size ceiling the way `localStorage` does,
 * so this is not a downgrade.
 */
export function GeneratorDetailsForm({
  meta,
  onChange,
  tagPicker,
}: {
  meta: GeneratorMetaInput;
  onChange: (patch: Partial<GeneratorMetaInput>) => void;
  tagPicker: UseTagPickerResult;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <TaxonomyPicker
        value={{ contentType: meta.contentType, category: meta.category, subcategory: meta.subcategory }}
        onChange={(next) => onChange({ contentType: next.contentType, category: next.category, subcategory: next.subcategory })}
      />

      <TitleField
        id="gen-title"
        label={t("generator.titleFieldLabel")}
        value={meta.title}
        onChange={(title) => onChange({ title })}
        placeholder={t("generator.titlePlaceholder")}
        required
      />

      <DescriptionField
        id="gen-description"
        label={t("generator.shortDescriptionLabel")}
        value={meta.description}
        onChange={(description) => onChange({ description })}
        placeholder={t("generator.shortDescriptionPlaceholder")}
        required
      />

      <MultiImagePicker items={meta.media} onChange={(media) => onChange({ media })} label={t("generator.coverImageLabel")} />

      <ToolPicker
        label={t("tool.recommendedLabel")}
        value={meta.tools}
        onChange={(next) => onChange({ tools: next })}
        contentType={meta.contentType}
        category={meta.category}
      />

      <div>
        <label className="mb-2 block text-sm font-medium text-text">
          {t("generator.tagsLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
        </label>
        <TagPicker picker={tagPicker} />
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("generator.settingsHeading")}</p>
        <ToggleRow
          label={t("generator.allowPromptEditingLabel")}
          description={t("generator.allowPromptEditingDescription")}
          checked={meta.allowPromptEditing}
          onChange={(checked) => onChange({ allowPromptEditing: checked })}
        />
        <ToggleRow
          label={t("generator.allowSavingLabel")}
          description={t("generator.allowSavingDescription")}
          checked={meta.allowSavingGeneratedPrompts}
          onChange={(checked) => onChange({ allowSavingGeneratedPrompts: checked })}
        />
        <ToggleRow
          label={t("generator.negativePromptSupportLabel")}
          description={t("generator.negativePromptSupportDescription")}
          checked={meta.enableNegativePrompt}
          onChange={(checked) => onChange({ enableNegativePrompt: checked })}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" />
      <span>
        <span className="block text-sm text-text">{label}</span>
        <span className="block text-xs text-text-muted">{description}</span>
      </span>
    </label>
  );
}
