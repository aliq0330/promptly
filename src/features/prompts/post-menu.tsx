"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Link2, Loader2, MoreVertical, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { absoluteUrl, cn, promptHref } from "@/lib/utils";
import { deleteRealPrompt } from "@/lib/supabase/prompts";

/**
 * Every post card's three-dot menu (header, top-right) — not just the
 * profile gallery's own-content management menu it replaces
 * (`ProfileContentMenu`, now folded in here since every card gets a header
 * with this menu, not just the profile grid). "Bağlantıyı kopyala" works
 * for anyone; "Kopyasını oluştur"/"Sil" only appear for the post's own
 * author — there's no report/block feature built yet (CLAUDE.md Bölüm 22
 * is still open), so a non-owner's menu deliberately stays minimal rather
 * than showing an action that doesn't do anything real.
 */
export function PostMenu({
  promptId,
  authorId,
  onDeleted,
}: {
  promptId: string;
  authorId: string;
  /** Called after a real, successful delete — lets a list (e.g. the profile grid) remove the card without a reload. */
  onDeleted?: () => void;
}) {
  const { user } = useAuth();
  const isOwn = user?.id === authorId;

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

  async function handleCopyLink(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(absoluteUrl(promptHref({ id: promptId })));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable — nothing else we can do.
    }
  }

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
      await deleteRealPrompt(promptId);
      setOpen(false);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi, lütfen tekrar dene.");
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div ref={ref} className="relative z-20 shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Gönderi seçenekleri"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-accent-surface hover:text-text"
      >
        <MoreVertical size={16} />
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
          {user && (
            <Link
              href={`/messages?sharePromptId=${promptId}`}
              role="menuitem"
              onClick={(event) => event.stopPropagation()}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-accent-surface"
            >
              <Send size={14} />
              Mesajla gönder
            </Link>
          )}
          {isOwn && (
            <>
              <Link
                href={`/create?duplicate=${promptId}`}
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-accent-surface"
              >
                <Copy size={14} />
                Kopyasını oluştur
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/10"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {confirmingDelete ? "Emin misin? Tekrar tıkla" : "Sil"}
              </button>
            </>
          )}
          {error && <p className="px-3 py-1 text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
