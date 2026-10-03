"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormSection } from "@/features/content/form-section";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { getCatalogField } from "@/lib/prompt-extra-settings";
import { fieldName, type PresetField, type PresetSelection, type PresetValue } from "@/lib/preset-fields";
import { fromStoredValue, rewordOwnField, singleChoiceField, toStoredValue } from "@/lib/preset-utils";
import { cn } from "@/lib/utils";
import { PresetAddParameterModal } from "./preset-add-parameter-modal";
import { PresetFieldInput } from "./preset-field-input";

const INPUT =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * The "parameters" part of the preset editor. The list is the preset itself:
 * every row is one field with the single value this preset sets. Rows come
 * from the platform catalog (pick a field, pick one value) or are brand-new
 * preset-only fields — a name and one option, always single-select. Option
 * LISTS are never written here; they belong to the catalog.
 *
 * It always holds the complete list (`onChange` returns `fields` = the
 * preset's own fields and `selection` for both kinds); the caller persists it.
 */
export function PresetParametersBuilder({
  contentType,
  category,
  subcategory,
  tools,
  fields,
  selection,
  onChange,
}: {
  contentType: ContentTypeId;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  fields: PresetField[];
  selection: PresetSelection;
  onChange: (fields: PresetField[], selection: PresetSelection) => void;
}) {
  const { t, language } = useTranslation();
  const [adding, setAdding] = useState(false);

  const ownById = new Map(fields.map((f) => [f.id, f]));
  const rowIds = Object.keys(selection).filter((id) => ownById.has(id) || getCatalogField(id));

  function setCatalogValue(id: string, value: PresetValue | undefined) {
    const next = { ...selection };
    if (value === undefined) delete next[id];
    else next[id] = value;
    onChange(fields, next);
  }

  function remove(id: string) {
    const next = { ...selection };
    delete next[id];
    onChange(
      fields.filter((f) => f.id !== id).map((f, i) => ({ ...f, sortOrder: i })),
      next,
    );
  }

  function editOwn(field: PresetField, name: string, optionText: string) {
    const { field: updated, value } = rewordOwnField(field, name, optionText);
    onChange(
      fields.map((f) => (f.id === field.id ? updated : f)),
      { ...selection, [field.id]: value },
    );
  }

  return (
    <FormSection
      title={`${t("presetBuilder.fieldsTitle")} (${rowIds.length})`}
      description={t("presetBuilder.fieldsHint")}
      action={
        <Button type="button" size="sm" onClick={() => setAdding(true)} data-builder-add-field>
          <Plus size={14} aria-hidden />
          {t("presetField.addShort")}
        </Button>
      }
      className="space-y-3"
    >
      {rowIds.length === 0 ? (
        <EmptyState compact icon={SlidersHorizontal} title={t("presetBuilder.emptyTitle")} description={t("presetBuilder.emptyBody")} action={{ label: t("presetField.addTitle"), onClick: () => setAdding(true) }} />
      ) : (
        <ul className="space-y-3">
          {rowIds.map((id) => {
            const own = ownById.get(id);
            const catalog = own ? undefined : getCatalogField(id);
            return (
              <li key={id} data-builder-field={id} className="rounded-lg border border-border-soft bg-surface-soft p-3">
                {own ? (
                  <div className="flex items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      <input
                        value={own.name}
                        maxLength={60}
                        onChange={(event) => editOwn(own, event.target.value, own.options[0]?.label ?? "")}
                        placeholder={t("presetBuilder.newFieldName")}
                        aria-label={t("presetBuilder.newFieldName")}
                        className={INPUT}
                      />
                      <input
                        value={own.options[0]?.label ?? ""}
                        maxLength={120}
                        onChange={(event) => editOwn(own, own.name, event.target.value)}
                        placeholder={t("presetBuilder.newFieldOption")}
                        aria-label={t("presetBuilder.newFieldOption")}
                        className={INPUT}
                      />
                    </div>
                    <RemoveButton label={t("presetField.removeAria", { name: own.name || t("presetBuilder.newFieldName") })} onClick={() => remove(id)} />
                  </div>
                ) : catalog ? (
                  <>
                    <div className="mb-2.5 flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-label font-semibold text-text">{fieldName(catalog, language)}</p>
                        <p className="truncate text-caption text-text-muted">{t("presetBuilder.oneValue")}</p>
                      </div>
                      <RemoveButton label={t("presetField.removeAria", { name: fieldName(catalog, language) })} onClick={() => remove(id)} />
                    </div>
                    <PresetFieldInput
                      field={singleChoiceField(catalog)}
                      value={fromStoredValue(catalog, selection[id])}
                      onChange={(value) => setCatalogValue(id, value === undefined ? undefined : toStoredValue(catalog, value))}
                    />
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <PresetAddParameterModal
          contentType={contentType}
          category={category}
          subcategory={subcategory}
          tools={tools}
          takenIds={new Set(rowIds)}
          onAddCatalog={(id, value) => onChange(fields, { ...selection, [id]: value })}
          onAddOwn={(field, value) => onChange([...fields, { ...field, sortOrder: fields.length }], { ...selection, [field.id]: value })}
          onClose={() => setAdding(false)}
        />
      )}
    </FormSection>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn("grid h-9 w-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-danger")}>
      <Trash2 size={15} />
    </button>
  );
}
