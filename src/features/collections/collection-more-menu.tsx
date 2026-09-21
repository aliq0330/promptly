"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { deleteCollection } from "@/lib/supabase/collections";
import type { Collection } from "@/types";

const MENU_WIDTH = 208; // w-52
const VIEWPORT_MARGIN = 8;

/**
 * Koleksiyon kartının kebab menüsü — Düzenle / Sil (iki tıklamalı onay,
 * PostMenu ile aynı desen). The dropdown panel itself is portaled
 * (`Portal`) to `document.body` and positioned with real viewport pixel
 * coordinates instead of `position: absolute` inside the card: the card
 * grid is 2 columns even on mobile (CollectionsPanel), so a card is often
 * narrower than the menu's own width — an `absolute right-0` menu nested
 * inside the card's `overflow-hidden` root got its left side clipped off.
 * Portaling removes the menu from that ancestor's overflow/stacking
 * context entirely, and the position is computed from the trigger
 * button's real screen position, clamped so it always stays fully inside
 * the viewport (flips to open leftward near the right edge and vice
 * versa) rather than a single hardcoded `right-0` that only works when
 * there happens to be enough room.
 */
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
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the last computed position when the menu closes, nothing to measure
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const preferredLeft = rect.right - MENU_WIDTH;
    const left = Math.min(
      Math.max(preferredLeft, VIEWPORT_MARGIN),
      window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN,
    );
    setPosition({ top: rect.bottom + 4, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setConfirmingDelete(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmingDelete(false);
      }
    }
    function handleReposition() {
      setOpen(false);
      setConfirmingDelete(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  async function handleDelete(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    // Blocked entirely client-side for the default collection — no point
    // attempting a request the backend (`collections_before_delete`
    // trigger) will reject anyway; shows the exact required message
    // immediately instead of a round-trip error (CLAUDE.md Bölüm 9.22 §12).
    if (collection.isDefault) {
      setError("Varsayılan koleksiyon silinemez. İstersen koleksiyonun adını veya gizlilik ayarını değiştirebilirsin.");
      return;
    }
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
    <div className="relative">
      <button
        ref={triggerRef}
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

      {open && position && (
        <Portal>
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: position.top, left: position.left, width: MENU_WIDTH }}
            className="z-50 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-md"
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
        </Portal>
      )}
    </div>
  );
}
