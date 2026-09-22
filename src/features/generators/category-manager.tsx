"use client";

import { useState } from "react";
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fieldsInCategory } from "@/lib/generator-template";
import type { GeneratorSchema } from "@/types";

/** Sentinel `activeCategoryId` value for the always-present "Diğer" (uncategorized) bucket — never a real category id, so it can never collide with one. */
export const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";

/**
 * Category sidebar (§7/§76's "kategori... sürükle bırak ile yeniden
 * sıralanabilir olmalı") — add/rename/delete + reorder, using this
 * codebase's established no-external-library convention (native HTML5
 * drag-and-drop, same technique as e.g. `remix-branch-map.tsx`'s hand-rolled
 * pan/zoom; no drag-and-drop npm package exists in this project's
 * `package.json` and CLAUDE.md §2 says not to add one). Deleting a category
 * never deletes its fields — they fall back to the schema's "Diğer"
 * (uncategorized) group instead, a deliberately non-destructive choice (see
 * this file's delete handler).
 */
export function CategoryManager({
  schema,
  activeCategoryId,
  onSelectCategory,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onReorderCategories,
}: {
  schema: GeneratorSchema;
  activeCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  onAddCategory: (name: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onReorderCategories: (orderedIds: string[]) => void;
}) {
  const sorted = [...schema.categories].sort((a, b) => a.order - b.order);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function submitAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddCategory(trimmed);
    setNewName("");
    setAdding(false);
  }

  function submitRename(id: string) {
    const trimmed = editName.trim();
    if (trimmed) onRenameCategory(id, trimmed);
    setEditingId(null);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const ids = sorted.map((c) => c.id);
    const fromIndex = ids.indexOf(dragId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, dragId);
    onReorderCategories(reordered);
    setDragId(null);
    setDragOverId(null);
  }

  return (
    <div className="space-y-1.5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Kategoriler</p>
      {sorted.map((category) => {
        const count = fieldsInCategory(schema, category.id).length;
        const isActive = category.id === activeCategoryId;
        const isEditing = editingId === category.id;
        return (
          <div
            key={category.id}
            draggable={!isEditing}
            onDragStart={() => setDragId(category.id)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverId(category.id);
            }}
            onDrop={() => handleDrop(category.id)}
            onDragEnd={() => {
              setDragId(null);
              setDragOverId(null);
            }}
            className={cn(
              "group flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm transition-colors",
              isActive ? "border-primary bg-primary/10 text-primary" : "border-transparent text-text hover:bg-accent-surface",
              dragOverId === category.id && dragId && dragId !== category.id && "border-dashed border-primary",
            )}
          >
            <span className="cursor-grab text-text-muted opacity-0 group-hover:opacity-100" aria-hidden="true">
              <GripVertical size={14} />
            </span>
            {isEditing ? (
              <input
                autoFocus
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitRename(category.id);
                  if (event.key === "Escape") setEditingId(null);
                }}
                onBlur={() => submitRename(category.id)}
                className="h-7 flex-1 rounded border border-border bg-background px-1.5 text-sm text-text"
              />
            ) : (
              <button type="button" onClick={() => onSelectCategory(category.id)} className="flex-1 truncate text-left">
                {category.name} <span className="text-xs text-text-muted">({count})</span>
              </button>
            )}
            {!isEditing && (
              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(category.id);
                    setEditName(category.name);
                  }}
                  aria-label="Kategoriyi yeniden adlandır"
                  className="rounded p-1 text-text-muted hover:text-text"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(category.id)}
                  aria-label="Kategoriyi sil"
                  className="rounded p-1 text-text-muted hover:text-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {(() => {
        const uncategorized = schema.fields.filter((field) => !schema.categories.some((c) => c.id === field.categoryId));
        if (uncategorized.length === 0) return null;
        const isActive = activeCategoryId === UNCATEGORIZED_CATEGORY_ID;
        return (
          <button
            type="button"
            onClick={() => onSelectCategory(UNCATEGORIZED_CATEGORY_ID)}
            className={cn(
              "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm",
              isActive ? "border border-primary bg-primary/10 text-primary" : "border border-transparent text-text-muted hover:bg-accent-surface",
            )}
          >
            Diğer <span className="ml-1 text-xs">({uncategorized.length})</span>
          </button>
        );
      })()}

      {confirmDeleteId && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-2 text-xs text-text">
          <p className="mb-2">
            Bu kategoriyi silersen içindeki alanlar &quot;Diğer&quot; grubuna taşınır (silinmez). Devam edilsin mi?
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onDeleteCategory(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Sil
            </Button>
          </div>
        </div>
      )}

      {adding ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitAdd();
              if (event.key === "Escape") setAdding(false);
            }}
            placeholder="Kategori adı"
            className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm text-text placeholder:text-text-muted"
          />
          <button type="button" onClick={submitAdd} aria-label="Ekle" className="rounded p-1.5 text-primary hover:bg-accent-surface">
            <Plus size={16} />
          </button>
          <button type="button" onClick={() => setAdding(false)} aria-label="Vazgeç" className="rounded p-1.5 text-text-muted hover:bg-accent-surface">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent-surface"
        >
          <Plus size={14} /> Kategori ekle
        </button>
      )}
    </div>
  );
}
