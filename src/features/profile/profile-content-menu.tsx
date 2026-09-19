"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Eye, EyeOff, Link2, MoreVertical } from "lucide-react";
import { absoluteUrl, cn, promptHref } from "@/lib/utils";

/**
 * Own-prompt management menu (CLAUDE.md section 14) — only ever shown on
 * the profile owner's own cards (wired in ProfileContentGrid, never on the
 * shared feed/discover cards). Deliberately limited to actions that are
 * genuinely real:
 *  - "Bağlantıyı kopyala" — real clipboard copy.
 *  - "Kopyasını oluştur" — real navigation that prefills /create with this
 *    prompt's fields (same prefill mechanism as the remix flow).
 *  - "Profilimden gizle" — a real, localStorage-persisted per-browser hide
 *    (see hidden-prompts-provider.tsx), NOT a delete: the prompt is static
 *    mock data with no backend, so nothing can actually be deleted or have
 *    its status changed. "Düzenle", "Taslağa al" and "Yeniden yayımla" from
 *    the original spec are intentionally omitted — none of them can be made
 *    to actually do anything without a backend, and faking them would
 *    violate CLAUDE.md's rule against pretending mock actions are real.
 */
export function ProfileContentMenu({
  promptId,
  hidden,
  onHide,
  onUnhide,
}: {
  promptId: string;
  hidden: boolean;
  onHide: () => void;
  onUnhide: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function handleCopyLink(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(absoluteUrl(promptHref({ id: promptId })));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable — nothing else we can do without a backend.
    }
  }

  return (
    <div ref={ref} className="relative z-20">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Prompt seçenekleri"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-text-muted shadow-sm backdrop-blur transition-colors hover:text-text"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 top-8 z-30 w-52 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-md",
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCopyLink}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-accent-surface"
          >
            <Link2 size={14} />
            {copied ? "Kopyalandı" : "Bağlantıyı kopyala"}
          </button>
          {!promptId.startsWith("local-") && (
            <Link
              href={`/create?duplicate=${promptId}`}
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-accent-surface"
            >
              <Copy size={14} />
              Kopyasını oluştur
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              if (hidden) {
                onUnhide();
              } else {
                onHide();
              }
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-accent-surface"
          >
            {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            {hidden ? "Profilime geri getir" : "Profilimden gizle"}
          </button>
        </div>
      )}
    </div>
  );
}
