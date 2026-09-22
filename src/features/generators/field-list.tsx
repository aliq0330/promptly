"use client";

import { useState } from "react";
import { Copy, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { countKeyUsageInTemplate } from "@/lib/generator-template";
import type { GeneratorField, GeneratorTemplate } from "@/types";

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
 * The active category's field list — add/edit/duplicate/delete + drag
 * reorder (native HTML5 drag-and-drop, same convention as
 * `category-manager.tsx`). Deleting a field never touches the template's own
 * `{{key}}` text (see `generator-template.ts`'s `renderTemplateSection` doc
 * comment — an orphaned token stays visible, it never silently vanishes),
 * so this only warns about it, never blocks it.
 */
export function FieldList({
  fields,
  template,
  onAddField,
  onEditField,
  onDuplicateField,
  onDeleteField,
  onReorderFields,
}: {
  fields: GeneratorField[];
  template: GeneratorTemplate;
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
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-text-muted">
          Bu kategoride henüz hiç alan yok — &quot;Alan ekle&quot; ile başla.
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
                {field.required && <span className="text-[10px] font-medium text-red-500">Zorunlu</span>}
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
                className={cn("rounded p-1.5", isConfirming ? "bg-red-600 text-white" : "text-text-muted hover:bg-accent-surface hover:text-red-600")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
      {confirmDeleteId && (() => {
        const field = fields.find((f) => f.id === confirmDeleteId);
        const usage = field ? countKeyUsageInTemplate(template, field.key) : 0;
        if (usage === 0) return null;
        return (
          <p className="rounded-md border border-red-500/40 bg-red-500/5 p-2 text-xs text-red-600">
            Bu alan prompt şablonunda {usage} yerde kullanılıyor. Silersen o {`{{${field?.key}}}`} referansları düz metin olarak kalır — silinmiş bir alana işaret ettiği için yayınlama sırasında hata gösterilir.
          </p>
        );
      })()}
    </div>
  );
}
