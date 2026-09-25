"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fetchOwnPendingSuggestion, proposeEditSuggestion } from "@/lib/supabase/prompt-edit-suggestions";

/**
 * "Düzenleme öner" compose modal (CLAUDE.md şartnamesi §2) — always opened
 * for a prompt that isn't the signed-in user's own (gated by the caller,
 * `PromptDetailView`). Only ever CREATES a suggestion row; never touches the
 * real prompt (§11) — the target's own owner decides everything from here
 * on via `EditSuggestionsPanel`.
 *
 * Checks §16's "already have a pending suggestion on this prompt" rule the
 * moment it opens (not on every page load for every visitor — only when
 * someone actually starts this flow) and blocks the form with a plain
 * Turkish sentence instead of letting a duplicate insert fail with a raw
 * constraint error; the database's own partial unique index is the real,
 * unbypassable guarantee either way.
 */
export function SuggestEditModal({
  promptId,
  proposerId,
  promptText,
  onClose,
}: {
  promptId: string;
  proposerId: string;
  /** The prompt's current text, shown read-only for context (§2 — "promptun mevcut hali ... okunabilir şekilde gösterilebilir"). */
  promptText: string;
  onClose: () => void;
}) {
  const [pendingCheck, setPendingCheck] = useState<"checking" | "already-pending" | "ready">("checking");
  const [suggestionText, setSuggestionText] = useState("");
  const [proposedPromptText, setProposedPromptText] = useState("");
  const [showProposedField, setShowProposedField] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOwnPendingSuggestion(promptId, proposerId).then((alreadyPending) => {
      if (!cancelled) setPendingCheck(alreadyPending ? "already-pending" : "ready");
    });
    return () => {
      cancelled = true;
    };
  }, [promptId, proposerId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    const trimmed = suggestionText.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await proposeEditSuggestion(promptId, proposerId, trimmed, proposedPromptText);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Öneri gönderilemedi, lütfen tekrar dene.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="suggest-edit-modal-title">
      <div
        className="w-full max-w-lg space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="suggest-edit-modal-title" className="text-base font-semibold text-text">
            Düzenleme öner
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        {pendingCheck === "checking" ? (
          <p className="py-4 text-sm text-text-muted">Kontrol ediliyor…</p>
        ) : pendingCheck === "already-pending" ? (
          <div className="space-y-4">
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              Zaten bekleyen bir düzenleme önerin var.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>
                Kapat
              </Button>
            </div>
          </div>
        ) : sent ? (
          <div className="space-y-4">
            <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              Öneri gönderildi. Prompt sahibi kabul ederse promptun yeni bir sürümü oluşacak.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>
                Kapat
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Mevcut prompt metni</p>
              <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-border-soft bg-surface-soft px-3 py-2 font-mono text-xs text-text-muted">
                {promptText}
              </p>
            </div>

            <div>
              <label htmlFor="suggest-edit-text" className="mb-1.5 block text-sm font-medium text-text">
                Bu promptta neyin değiştirilmesini öneriyorsun?
              </label>
              <textarea
                id="suggest-edit-text"
                rows={3}
                value={suggestionText}
                onChange={(event) => setSuggestionText(event.target.value)}
                maxLength={2000}
                placeholder="Örn. Arka planı cyberpunk şehir yap ve ışığı mavi neon olarak değiştir."
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
                autoFocus
              />
            </div>

            {showProposedField ? (
              <div>
                <label htmlFor="suggest-edit-proposed" className="mb-1.5 block text-sm font-medium text-text">
                  Önerdiğin yeni prompt metni <span className="text-text-muted">(opsiyonel)</span>
                </label>
                <textarea
                  id="suggest-edit-proposed"
                  rows={4}
                  value={proposedPromptText}
                  onChange={(event) => setProposedPromptText(event.target.value)}
                  placeholder="Tam olarak nasıl bir prompt metni önerdiğini buraya yazabilirsin — sahip önizleyip karşılaştırabilecek."
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-text placeholder:text-text-muted"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowProposedField(true)}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Tam bir prompt metni de önerebilirsin (opsiyonel)
              </button>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>
                İptal
              </Button>
              <Button type="submit" disabled={!suggestionText.trim() || isSubmitting}>
                {isSubmitting ? "Gönderiliyor…" : "Öneriyi gönder"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
