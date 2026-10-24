"use client";

import { Chip, ChipRow } from "@/components/ui/chip";
import { fieldLabelClassName } from "@/components/ui/field";
import { findTool } from "@/lib/ai-tool-catalog";
import { fieldName, type PresetField, type PresetSelection } from "@/lib/preset-fields";
import { fieldToolOnly } from "@/lib/preset-fit";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * "Eklenecek alanlar" (docs/history/228-*): which of a preset's fields go into the final prompt. A field that belongs to one tool
 * (Midjourney's `--ar` …) and does not fit the model Studio sends to is switched off by itself and says why; the rest can be
 * switched off by hand. Only fields that actually carry a value are listed.
 */
export function StudioFieldSwitches({
  fields,
  selection,
  off,
  unavailable,
  onToggle,
}: {
  fields: readonly PresetField[];
  selection: PresetSelection;
  off: readonly string[];
  unavailable: readonly string[];
  onToggle: (fieldId: string) => void;
}) {
  const { t, language } = useTranslation();
  const listed = fields.filter((field) => selection[field.id] !== undefined && selection[field.id] !== "");
  if (listed.length === 0) return null;
  const blocked = listed.filter((field) => unavailable.includes(field.id));
  return (
    <div className="space-y-2">
      <span className={fieldLabelClassName}>{t("presetFit.fields")}</span>
      <ChipRow aria-label={t("presetFit.fields")}>
        {listed.map((field) => {
          const isBlocked = unavailable.includes(field.id);
          return (
            <Chip key={field.id} selected={!isBlocked && !off.includes(field.id)} disabled={isBlocked} onClick={() => onToggle(field.id)}>
              {fieldName(field, language)}
            </Chip>
          );
        })}
      </ChipRow>
      {blocked.map((field) => (
        <p key={field.id} className="text-caption text-warning">
          {fieldName(field, language)} — {t("presetFit.fieldToolOnly", { tool: findTool(fieldToolOnly(field.id) ?? "")?.name ?? fieldToolOnly(field.id) ?? "" })}
        </p>
      ))}
    </div>
  );
}
