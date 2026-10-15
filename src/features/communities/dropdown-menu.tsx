"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";

/**
 * Küçük "⋮" açılır menüsü (dışarı tıklama ve Escape ile kapanır). `children(close)` menü öğelerini çizer.
 * `trigger` + `triggerClassName` verilirse düğme "⋮" yerine o içerikle çizilir (ör. "Katıldın ▼").
 */
export function DropdownMenu({
  label,
  children,
  trigger,
  triggerClassName,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
  trigger?: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
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
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName ?? "flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"}
      >
        {trigger ?? <MoreVertical size={16} />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-48 animate-pop-in overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-pop">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, label, onClick, danger = false, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={"flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-small transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent " + (danger ? "text-danger" : "text-text")}
    >
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      {label}
    </button>
  );
}
