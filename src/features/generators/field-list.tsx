"use client";

import { useState } from "react";
import { Copy, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GeneratorField } from "@/types";

const FIELD_TYPE_SHORT_LABELS: Record<GeneratorField["type"], string> = {
  text: "Kısa Metin",
  textarea: "Uzun Metin",
  select: "Seçim",
  multi_select: "Çoklu Seçim",
  number: "Sayı",
  slider: "Kaydırıcı",
  color: "Renk",
  checkbox: "Onay Kutusu",
  toggle: "Açma/Kapama",
  radio: "Radio",
  url: "URL",
};

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
}: {
  fields: GeneratorField[];
  onAddField: () => void;
  onEditField: (field: GeneratorField) => void;
  onDuplicateField: (field: GeneratorField) => void;
  onDeleteField: (fieldId: string) => void;
  onReorderFields: (orderedIds: string[]) => void;
}) {
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
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Alanlar</p>
        <Button type="button" size="sm" variant="outline" onClick={onAddField}>
          <Plus size={14} /> Alan ekle
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="rounded-md border border-dashed border-border bg-accent-surface/40 p-6 text-center text-sm text-text-muted">
          Bu generatorda henüz hiç alan yok — &quot;Alan ekle&quot; ile başla.
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
                <p className="truncate text-sm font-medium text-text">{field.label || "(adsız alan)"}</p>
                <span className="rounded-sm bg-accent-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                  {FIELD_TYPE_SHORT_LABELS[field.type]}
                </span>
                {field.required && <span className="text-[10px] font-medium text-danger">Zorunlu</span>}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-primary">{`{{${field.key}}}`}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-text-muted">→ {field.jsonPath?.trim() || field.key}</p>
              {field.condition && <p className="mt-0.5 text-xs text-text-muted">Koşullu görünürlük tanımlı</p>}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => onEditField(field)} aria-label="Alanı düzenle" className="rounded p-1.5 text-text-muted hover:bg-accent-surface hover:text-text">
                <Pencil size={14} />
              </button>
              <button type="button" onClick={() => onDuplicateField(field)} aria-label="Alanı çoğalt" className="rounded p-1.5 text-text-muted hover:bg-accent-surface hover:text-text">
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={() => (isConfirming ? (onDeleteField(field.id), setConfirmDeleteId(null)) : setConfirmDeleteId(field.id))}
                aria-label="Alanı sil"
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
