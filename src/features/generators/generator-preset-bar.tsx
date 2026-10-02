"use client";

import { useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { PresetPicker } from "@/features/presets/preset-picker";
import { SavePresetModal } from "@/features/presets/save-preset-modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { applyPresetToGeneratorValues, generatorValuesToPresetSelection } from "@/lib/preset-generator-mapping";
import { recordPresetUse } from "@/lib/supabase/presets";
import type { GeneratorSchema, GeneratorValues, PromptContentType } from "@/types";

/**
 * "Hazır ayar" row at the top of the generator's Form tab: pick a preset
 * (built-in / mine / saved / community) to pre-fill the matching fields —
 * the values stay fully editable — and "Yeni hazır ayar olarak kaydet" to turn
 * the current choices back into a preset. Only fields whose label matches a
 * preset parameter take part (see `preset-generator-mapping.ts`); the bar says
 * so honestly instead of pretending everything was applied.
 */
export function GeneratorPresetBar({
  schema,
  values,
  onValuesChange,
  contentType,
  category,
  subcategory,
}: {
  schema: GeneratorSchema;
  values: GeneratorValues;
  onValuesChange: (next: GeneratorValues) => void;
  contentType: PromptContentType;
  category: string | null;
  subcategory: string | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const currentSelection = generatorValuesToPresetSelection(schema, values);
  const savable = Object.keys(currentSelection).length > 0;

  if (schema.fields.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-border-soft bg-surface-soft p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted hover:text-text">
          {t("preset.generatorBarTitle")}
        </button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSaving(true)} disabled={!savable} title={savable ? undefined : t("preset.generatorNothingToSave")}>
          <BookmarkPlus size={14} aria-hidden />
          {t("preset.saveAsNew")}
        </Button>
      </div>
      {open && (
        <PresetPicker
          contentType={contentType}
          onApply={(selection, preset) => {
            const result = applyPresetToGeneratorValues(schema, values, selection);
            onValuesChange(result.values);
            setNotice(result.applied > 0 ? t("preset.generatorApplied", { count: result.applied }) : t("preset.generatorNoMatch"));
            if (preset && user) void recordPresetUse(preset.id, user.id);
          }}
        />
      )}
      {notice && (
        <p role="status" className="text-caption text-text-secondary">
          {notice}
        </p>
      )}
      {saving && (
        <SavePresetModal
          contentType={contentType}
          category={category}
          subcategory={subcategory}
          tools={[]}
          selection={currentSelection}
          onClose={() => setSaving(false)}
        />
      )}
    </div>
  );
}
