"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fieldName, moveItem, type PresetField, type PresetSelection, type PresetValue } from "@/lib/preset-fields";
import { AddFieldModal } from "./add-field-modal";
import { FieldEditorModal } from "./field-editor-modal";
import { PresetFieldInput } from "./preset-field-input";

/**
 * The "fields" half of the preset editor — shared by the full editor page and
 * the quick "+ Hazır Ayar Oluştur" modal: add a platform field / one of my own
 * / a brand-new one, rename it, edit its options, reorder, delete, and pick the
 * default value each field starts with. It always holds the COMPLETE field list
 * and selection (`onChange` returns both), the caller just persists them.
 */
export function PresetFieldsBuilder({
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
  const [editing, setEditing] = useState<PresetField | null>(null);

  function setValue(field: PresetField, value: PresetValue | undefined) {
    const next = { ...selection };
    if (value === undefined) delete next[field.id];
    else next[field.id] = value;
    onChange(fields, next);
  }

  function remove(field: PresetField) {
    const next = { ...selection };
    delete next[field.id];
    onChange(
      fields.filter((f) => f.id !== field.id).map((f, i) => ({ ...f, sortOrder: i })),
      next,
    );
  }

  function move(index: number, delta: -1 | 1) {
    onChange(moveItem(fields, index, delta), selection);
  }

  function handleEdited(updated: PresetField, defaultValue: PresetValue | undefined) {
    const next = { ...selection };
    if (defaultValue === undefined) delete next[updated.id];
    else next[updated.id] = defaultValue;
    onChange(
      fields.map((f) => (f.id === updated.id ? { ...updated, sortOrder: f.sortOrder } : f)),
      next,
    );
    setEditing(null);
  }

  return (
    <section aria-labelledby="builder-fields-title" className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="builder-fields-title" className="text-label font-semibold text-text">
            {t("presetBuilder.fieldsTitle")} <span className="text-text-muted">({fields.length})</span>
          </h2>
          <p className="text-caption text-text-secondary">{t("presetBuilder.fieldsHint")}</p>
        </div>
        <Button type="button" size="sm" onClick={() => setAdding(true)} data-builder-add-field>
          <Plus size={14} aria-hidden />
          {t("presetField.addShort")}
        </Button>
      </div>

      {fields.length === 0 ? (
        <EmptyState compact icon={SlidersHorizontal} title={t("presetBuilder.emptyTitle")} description={t("presetBuilder.emptyBody")} action={{ label: t("presetField.addTitle"), onClick: () => setAdding(true) }} />
      ) : (
        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li key={field.id} data-builder-field={field.id} className="rounded-lg border border-border-soft bg-surface-soft p-3">
              <div className="mb-2.5 flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label font-semibold text-text">{fieldName(field, language)}</p>
                  <p className="truncate text-caption text-text-muted">
                    {t(`presetFieldType.${field.type}`)}
                    {field.options.length > 0 && ` · ${t("presetField.optionCount", { count: field.options.length })}`}
                  </p>
                </div>
                <button type="button" aria-label={t("fieldEditor.moveUp")} disabled={index === 0} onClick={() => move(index, -1)} className="grid h-9 w-8 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text disabled:opacity-30">
                  <ArrowUp size={15} />
                </button>
                <button type="button" aria-label={t("fieldEditor.moveDown")} disabled={index === fields.length - 1} onClick={() => move(index, 1)} className="grid h-9 w-8 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text disabled:opacity-30">
                  <ArrowDown size={15} />
                </button>
                <button type="button" aria-label={t("presetField.editAria", { name: fieldName(field, language) })} onClick={() => setEditing(field)} className="grid h-9 w-8 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-text" data-builder-edit-field>
                  <Pencil size={15} />
                </button>
                <button type="button" aria-label={t("presetField.removeAria", { name: fieldName(field, language) })} onClick={() => remove(field)} className="grid h-9 w-8 place-items-center rounded-md text-text-muted hover:bg-surface hover:text-danger">
                  <Trash2 size={15} />
                </button>
              </div>
              <PresetFieldInput field={field} value={selection[field.id]} onChange={(value) => setValue(field, value)} />
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddFieldModal
          contentType={contentType}
          category={category}
          subcategory={subcategory}
          tools={tools}
          existingIds={new Set()}
          target="preset"
          onAdd={(added) => onChange([...fields, ...added].map((f, i) => ({ ...f, sortOrder: i })), selection)}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && <FieldEditorModal initial={editing} contentType={contentType} showDefault initialValue={selection[editing.id]} onSave={handleEdited} onClose={() => setEditing(null)} />}
    </section>
  );
}
