"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { deleteCollection } from "@/lib/supabase/collections";
import type { Collection } from "@/types";

/** Koleksiyon kartının kebab menüsü — Düzenle / Sil (iki tıklamalı onay, PostMenu ile aynı desen). */
export function CollectionMoreMenu({
  collection,
  onEdit,
  onDeleted,
}: {
  collection: Collection;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setConfirmingDelete(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmingDelete(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function handleDelete(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      await deleteCollection(collection.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi, lütfen tekrar dene.");
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Koleksiyon seçenekleri"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-text-muted shadow-sm transition-colors hover:bg-accent-surface hover:text-text"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-30 w-52 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-md"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-accent-surface"
          >
            <Pencil size={14} />
            Koleksiyonu düzenle
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/10"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {confirmingDelete ? "Emin misin? Tekrar tıkla" : "Koleksiyonu sil"}
          </button>
          {error && <p className="px-3 py-1 text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
