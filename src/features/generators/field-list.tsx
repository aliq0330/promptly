"use client";

import { useState } from "react";
import { Copy, GripVertical, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { GENERATOR_FIELD_TYPE_LABELS } from "./generator-category-meta";
import type { GeneratorField } from "@/types";

/**
 * The generator's full field list — add/edit/duplicate/delete + drag
 * reorder (native HTML5 drag-and-drop). Flat and category-free: the
 * field-organization category system was removed (it didn't work in
 * practice, per an explicit user report — see CLAUDE.md).
 */
export function FieldList({
  fields,
  onAddField,
  onEditField,
  onDuplicateField,
  onDeleteField,
  onReorderFields,
  templateUsage,
}: {
  fields: GeneratorField[];
  onAddField: () => void;
  onEditField: (field: GeneratorField) => void;
  onDuplicateField: (field: GeneratorField) => void;
  onDeleteField: (fieldId: string) => void;
  onReorderFields: (orderedIds: string[]) => void;
  /** Alan anahtarı → prompt şablonunda kaç yerde kullanıldığı (yoksa 0/undefined). */
  templateUsage?: Record<string, number>;
}) {
  const { t } = useTranslation();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const ids = fields.map((f) => f.id);
    const fromIndex = ids.indexOf(dragId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, dragId);
    onReorderFields(reordered);
    setDragId(null);
    setDragOverId(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("field.fieldsHeading")}</p>
        <Button type="button" size="sm" variant="outline" onClick={onAddField}>
          <Plus size={14} /> {t("field.addField")}
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="rounded-md border border-dashed border-border bg-accent-surface/40 p-6 text-center text-sm text-text-muted">
          {t("generator.noFieldsYetStart")}
        </p>
      )}

      {fields.map((field) => {
        const isConfirming = confirmDeleteId === field.id;
        return (
          <div
            key={field.id}
            draggable
            onDragStart={() => setDragId(field.id)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverId(field.id);
            }}
            onDrop={() => handleDrop(field.id)}
            onDragEnd={() => {
              setDragId(null);
              setDragOverId(null);
            }}
            className={cn(
              "flex items-start gap-2 rounded-md border border-border bg-surface p-3",
              dragOverId === field.id && dragId && dragId !== field.id && "border-dashed border-primary",
            )}
          >
            <span className="mt-0.5 cursor-grab text-text-muted" aria-hidden="true">
              <GripVertical size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-medium text-text">{field.label || t("field.unnamedField")}</p>
                <span className="rounded-sm bg-accent-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                  {t(GENERATOR_FIELD_TYPE_LABELS[field.type])}
                </span>
                {field.options.some((o) => o.image || o.color) && (
                  <span
                    className="flex items-center gap-0.5 rounded-sm bg-accent-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
                    title={t("field.imageSupportHint")}
                  >
                    <ImageIcon size={10} /> {t("field.imageSupported")}
                  </span>
                )}
                {field.required && <span className="text-[10px] font-medium text-danger">{t("field.required")}</span>}
              </div>
              {(templateUsage?.[field.key] ?? 0) > 0 && (
                <p className="mt-0.5 text-xs text-secondary">
                  {isConfirming
                    ? t("generator.templateFieldUsage", { count: templateUsage?.[field.key] ?? 0 })
                    : t("field.usedInTemplate", { count: templateUsage?.[field.key] ?? 0 })}
                </p>
              )}
              <p className="mt-0.5 truncate font-mono text-xs text-text-muted">→ {field.jsonPath?.trim() || field.key}</p>
              {field.condition && <p className="mt-0.5 text-xs text-text-muted">{t("field.conditionalVisibilityDefined")}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => onEditField(field)} aria-label={t("field.editField")} className="rounded p-1.5 text-text-muted hover:bg-accent-surface hover:text-text">
                <Pencil size={14} />
              </button>
              <button type="button" onClick={() => onDuplicateField(field)} aria-label={t("field.duplicateField")} className="rounded p-1.5 text-text-muted hover:bg-accent-surface hover:text-text">
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={() => (isConfirming ? (onDeleteField(field.id), setConfirmDeleteId(null)) : setConfirmDeleteId(field.id))}
                aria-label={t("field.deleteField")}
                className={cn("rounded p-1.5", isConfirming ? "bg-danger text-white" : "text-text-muted hover:bg-accent-surface hover:text-danger")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
