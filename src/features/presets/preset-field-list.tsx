"use client";

import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Collapsible } from "@/components/ui/collapsible";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fieldName, selectionEntries, type PresetField, type PresetSelection } from "@/lib/preset-fields";
import { cn } from "@/lib/utils";
import { PresetFieldInput } from "./preset-field-input";

/**
 * The fields of a form as a tidy accordion: each row shows the field's name
 * and what is currently chosen, and opens to its value picker. Keeps a long
 * list calm — only the opened fields render their chips.
 */
export function PresetFieldList({
  fields,
  selection,
  onChange,
  fragmentLanguage,
  onRemoveField,
  removableIds,
  defaultOpenFirst = true,
}: {
  fields: readonly PresetField[];
  selection: PresetSelection;
  onChange: (next: PresetSelection) => void;
  fragmentLanguage?: "tr" | "en";
  /** When set, a field row offers "Alanı kaldır" (only for fields the user added, never the recommended ones). */
  onRemoveField?: (field: PresetField) => void;
  /** Restricts "Alanı kaldır" to these ids (the recommended fields stay). */
  removableIds?: ReadonlySet<string>;
  defaultOpenFirst?: boolean;
}) {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpenFirst && fields[0] ? [fields[0].id] : []));

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ul className="space-y-2">
      {fields.map((field) => {
        const isOpen = open.has(field.id);
        const summary = selectionEntries([field], selection, language)
          .map((entry) => entry.label)
          .join(", ");
        const panelId = `field-panel-${field.id}`;
        return (
          <li key={field.id} data-field-row={field.id} className={cn("overflow-hidden rounded-lg border bg-surface transition-colors", isOpen ? "border-border-strong" : "border-border")}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(field.id)}
              className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label font-semibold text-text">{fieldName(field, language)}</span>
                <span className={cn("block truncate text-caption", summary ? "text-primary" : "text-text-muted")}>{summary || t("presetField.notSet")}</span>
              </span>
              <ChevronDown size={18} className={cn("shrink-0 text-text-muted transition-transform duration-200", isOpen && "rotate-180")} aria-hidden />
            </button>
            <Collapsible open={isOpen} id={panelId}>
              <div className="space-y-3 border-t border-border-soft px-3 py-3">
                <PresetFieldInput
                  field={field}
                  value={selection[field.id]}
                  fragmentLanguage={fragmentLanguage}
                  onChange={(value) => {
                    const next = { ...selection };
                    if (value === undefined) delete next[field.id];
                    else next[field.id] = value;
                    onChange(next);
                  }}
                />
                {onRemoveField && (!removableIds || removableIds.has(field.id)) && (
                  <button type="button" onClick={() => onRemoveField(field)} className="inline-flex items-center gap-1 text-caption text-text-muted hover:text-danger">
                    <Trash2 size={12} aria-hidden />
                    {t("presetField.removeFromForm")}
                  </button>
                )}
              </div>
            </Collapsible>
          </li>
        );
      })}
    </ul>
  );
}
