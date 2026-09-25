"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, FolderMinus, Link2, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { absoluteUrl, cn, generatorHref, promptHref, requestHref, resultHref } from "@/lib/utils";
import { deleteRealPrompt } from "@/lib/supabase/prompts";
import { deleteGenerator } from "@/lib/supabase/generators";
import { deleteRealRequest } from "@/lib/supabase/requests";
import { deletePromptResult } from "@/lib/supabase/prompt-results";

/**
 * Every post card's three-dot menu (header, top-right) — not just the
 * profile gallery's own-content management menu it replaces
 * (`ProfileContentMenu`, now folded in here since every card gets a header
 * with this menu, not just the profile grid). "Bağlantıyı kopyala" works
 * for anyone; "Kopyasını oluştur"/"Sil" only appear for the post's own
 * author — there's no report/block feature built yet (CLAUDE.md Bölüm 22
 * is still open), so a non-owner's menu deliberately stays minimal rather
 * than showing an action that doesn't do anything real.
 *
 * Polymorphic since Bölüm 9.34's shared-social integration, widened to a
 * third target (a Prompt İsteği) by the "Prompt İsteği Etkileşim ve Menü
 * Sistemi Eşitleme" görevi, and to a fourth (a Kullanıcı Sonucu) by the
 * "Kullanıcı Sonuçları / Prompt Çıktıları" görevi — pass exactly one of
 * `promptId`, `generatorId` (also needs `generatorSlug` for its real link),
 * `requestId`, or `resultId`. A generator's, request's, or result's menu
 * never shows "Kopyasını oluştur" (no duplicate flow exists for any of the
 * three), and a result's menu additionally never shows "Düzenle" (a result
 * can only be shared or deleted, never edited — CLAUDE.md §23) — both
 * deliberately left out rather than wired to something that doesn't
 * actually work.
 *
 * "Mesajla gönder" used to live here as its own menu item (Bölüm 9.8) —
 * Bölüm 9.52 (Unified Share System) folded it into the "Paylaş" icon's own
 * `ShareModal` instead ("Promptly'de mesaj olarak gönder" option), so it's
 * no longer duplicated in this menu.
 */
export function PostMenu({
  promptId,
  generatorId,
  generatorSlug,
  requestId,
  resultId,
  authorId,
  onDeleted,
  collectionRemoval,
}: {
  promptId?: string;
  generatorId?: string;
  generatorSlug?: string;
  requestId?: string;
  resultId?: string;
  authorId: string;
  /** Called after a real, successful delete — lets a list (e.g. the profile grid) remove the card without a reload. */
  onDeleted?: () => void;
  /**
   * Present only when this card is rendered inside a collection the VIEWER
   * owns (not necessarily the post's own author — you can save/collect
   * someone else's post too) — adds a "kaydedilenlerden kaldır"/
   * "koleksiyondan kaldır" action, distinct from deleting the post itself
   * and gated by collection ownership, not post authorship (CLAUDE.md
   * Bölüm 9.22 §8/§9/§19 — a deliberately separate operation from `Sil`).
   * Works identically for a prompt or a generator target (both live in the
   * same multi-collection system since Bölüm 9.36) — the caller's own
   * `onRemove` already knows which real removal call to make.
   */
  collectionRemoval?: {
    /** Whether the collection being viewed is the caller's default ("Genel") — determines the label and whether removal cascades to every other collection (the caller already does the actual cascading via `onRemove`, this only decides wording). */
    isDefault: boolean;
    onRemove: () => Promise<void>;
  };
}) {
  const { user } = useAuth();
  const isOwn = user?.id === authorId;
  const isGenerator = Boolean(generatorId);
  const isRequest = Boolean(requestId);
  const isResult = Boolean(resultId);
  const href = isGenerator
    ? generatorHref({ slug: generatorSlug ?? "" })
    : isRequest
      ? requestHref({ id: requestId! })
      : isResult
        ? resultHref({ id: resultId! })
        : promptHref({ id: promptId! });
  const editHref = isGenerator
    ? `/generators/create?edit=${generatorId}`
    : isRequest
      ? `/requests/new?edit=${requestId}`
      : `/create?edit=${promptId}`;

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setConfirmingDelete(false);
        setConfirmingRemove(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmingDelete(false);
        setConfirmingRemove(false);
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
      await navigator.clipboard.writeText(absoluteUrl(href));
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
      if (isGenerator) await deleteGenerator(generatorId!);
      else if (isRequest) await deleteRealRequest(requestId!);
      else if (isResult) await deletePromptResult(resultId!);
      else await deleteRealPrompt(promptId!);
      setOpen(false);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi, lütfen tekrar dene.");
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function handleRemoveFromCollection(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!collectionRemoval) return;
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setIsRemoving(true);
    setRemoveError(null);
    try {
      await collectionRemoval.onRemove();
      setOpen(false);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Kaldırılamadı, lütfen tekrar dene.");
      setIsRemoving(false);
      setConfirmingRemove(false);
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
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors duration-200 hover:bg-surface-soft hover:text-text"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 top-8 z-30 w-52 overflow-hidden rounded-md border border-border-soft bg-surface-elevated py-1 shadow-pop animate-pop-in",
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCopyLink}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-soft"
          >
            <Link2 size={14} />
            {copied ? "Kopyalandı" : "Bağlantıyı kopyala"}
          </button>
          {collectionRemoval && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={handleRemoveFromCollection}
                disabled={isRemoving}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
              >
                {isRemoving ? <Loader2 size={14} className="animate-spin" /> : <FolderMinus size={14} />}
                {confirmingRemove
                  ? "Emin misin? Tekrar tıkla"
                  : collectionRemoval.isDefault
                    ? "Kaydedilenlerden kaldır"
                    : "Koleksiyondan kaldır"}
              </button>
              {removeError && <p className="px-3 py-1 text-xs text-danger">{removeError}</p>}
            </>
          )}
          {isOwn && (
            <>
              {!isResult && (
                <Link
                  href={editHref}
                  role="menuitem"
                  onClick={(event) => event.stopPropagation()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-soft"
                >
                  <Pencil size={14} />
                  Düzenle
                </Link>
              )}
              {!isGenerator && !isRequest && !isResult && (
                <Link
                  href={`/create?duplicate=${promptId}`}
                  role="menuitem"
                  onClick={(event) => event.stopPropagation()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-soft"
                >
                  <Copy size={14} />
                  Kopyasını oluştur
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {confirmingDelete ? "Emin misin? Tekrar tıkla" : "Sil"}
              </button>
            </>
          )}
          {error && <p className="px-3 py-1 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
