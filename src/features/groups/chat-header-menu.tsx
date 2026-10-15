"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Grup sohbeti başlığındaki "⋮" menüsü (birebir sohbetteki `ProfileMoreMenu` ile aynı görünüm; engelle/şikayet yerine grup eylemleri). */
export function ChatHeaderMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("groups.chat.optionsAria")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-transparent text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-64 space-y-0.5 rounded-md border border-border-soft bg-surface-elevated p-2 shadow-pop animate-pop-in">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
