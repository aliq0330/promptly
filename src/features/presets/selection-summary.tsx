"use client";

import { X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { removeEntry, selectionEntries, type PresetField, type PresetSelection } from "@/lib/preset-fields";

/**
 * "Seçtiklerin": every chosen value as a removable chip (`Işık: Soft light ×`)
 * plus "Temizle". One chip per chosen option of a multi-select, so a single
 * option can be dropped without losing the rest. Renders nothing when empty.
 */
export function SelectionSummary({
  fields,
  selection,
  onChange,
  className,
}: {
  fields: readonly PresetField[];
  selection: PresetSelection;
  onChange: (next: PresetSelection) => void;
  className?: string;
}) {
  const { t, language } = useTranslation();
  const entries = selectionEntries(fields, selection, language);
  if (entries.length === 0) return null;
  return (
    <section aria-label={t("presetField.selected")} className={className} data-selection-summary>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
          {t("presetField.selected")} <span className="tabular-nums">({entries.length})</span>
        </h3>
        <button type="button" onClick={() => onChange({})} className="rounded px-1.5 py-0.5 text-caption font-medium text-text-muted underline hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {t("extra.clear")}
        </button>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {entries.map((entry) => (
          <li
            key={`${entry.fieldId}:${entry.optionValue ?? ""}`}
            data-extra-chip={entry.fieldId}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft py-1 pl-2.5 pr-1 text-caption font-medium text-text"
          >
            <span className="shrink-0 text-text-muted">{entry.fieldName}:</span>
            <span className="truncate">{entry.label}</span>
            <button
              type="button"
              aria-label={t("extra.removeAria", { name: entry.label })}
              onClick={() => onChange(removeEntry(selection, entry))}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-text-muted hover:bg-surface hover:text-text"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
