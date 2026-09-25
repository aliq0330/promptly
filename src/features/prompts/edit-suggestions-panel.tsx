"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { acceptEditSuggestion, fetchSuggestionsForPrompt, rejectEditSuggestion } from "@/lib/supabase/prompt-edit-suggestions";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { DiffText } from "./diff-text";
import type { PromptEditSuggestion } from "@/types";

const STATUS_LABEL: Record<PromptEditSuggestion["status"], string> = {
  pending: "Bekliyor",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
};
const STATUS_VARIANT: Record<PromptEditSuggestion["status"], "warning" | "success" | "danger"> = {
  pending: "warning",
  accepted: "success",
  rejected: "danger",
};

/**
 * Owner-only "Düzenleme Önerileri" panel (CLAUDE.md şartnamesi §4/§5/§6/
 * §10) — only ever rendered by a caller that already confirmed `isOwn`
 * (RLS returns `[]` for anyone else's suggestions anyway, same precedent as
 * `EditHistoryPanel`). Lists every real suggestion on this prompt, lets the
 * owner preview a diff, and is the ONLY UI path that can call the real
 * accept/reject RPCs — a suggestion never changes the prompt on its own.
 */
export function EditSuggestionsPanel({
  promptId,
  currentPromptText,
  highlightSuggestionId,
  onAccepted,
}: {
  promptId: string;
  currentPromptText: string;
  /** A specific suggestion to land on when arriving from a notification (`?hl=suggestion:<id>`) — expanded and lightly highlighted, never auto-decided for the owner. */
  highlightSuggestionId?: string | null;
  /** Called with the newly-published prompt text right after a real accept succeeds, so the page's own prompt display updates without a reload. */
  onAccepted: (newPromptText: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<PromptEditSuggestion[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(highlightSuggestionId ?? null);
  const [acceptDraftId, setAcceptDraftId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [confirmingRejectId, setConfirmingRejectId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSuggestionsForPrompt(promptId).then((result) => {
      if (!cancelled) setSuggestions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  if (!suggestions || suggestions.length === 0) return null;

  function startAccept(suggestion: PromptEditSuggestion) {
    setError(null);
    setAcceptDraftId(suggestion.id);
    setDraftText(suggestion.proposedPromptText ?? currentPromptText);
    setExpandedId(suggestion.id);
  }

  async function confirmAccept(suggestion: PromptEditSuggestion) {
    if (!draftText.trim()) return;
    setBusyId(suggestion.id);
    setError(null);
    try {
      await acceptEditSuggestion(suggestion.id, draftText);
      setSuggestions((prev) =>
        (prev ?? []).map((item) =>
          item.id === suggestion.id ? { ...item, status: "accepted", resolvedAt: new Date().toISOString() } : item,
        ),
      );
      onAccepted(draftText.trim());
      setAcceptDraftId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kabul edilemedi, lütfen tekrar dene.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(suggestion: PromptEditSuggestion) {
    if (confirmingRejectId !== suggestion.id) {
      setConfirmingRejectId(suggestion.id);
      return;
    }
    setBusyId(suggestion.id);
    setError(null);
    try {
      await rejectEditSuggestion(suggestion.id);
      setSuggestions((prev) =>
        (prev ?? []).map((item) =>
          item.id === suggestion.id ? { ...item, status: "rejected", resolvedAt: new Date().toISOString() } : item,
        ),
      );
      setConfirmingRejectId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reddedilemedi, lütfen tekrar dene.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = suggestions.filter((s) => s.status === "pending");
  const resolved = suggestions.filter((s) => s.status !== "pending");

  return (
    <section className="space-y-3 rounded-lg border border-border-soft bg-surface p-4 sm:p-5">
      <h2 className="text-label font-semibold text-text">
        Düzenleme Önerileri {pending.length > 0 && <span className="text-primary">({pending.length})</span>}
      </h2>

      <ul className="space-y-3">
        {[...pending, ...resolved].map((suggestion) => {
          const isExpanded = expandedId === suggestion.id;
          const isAccepting = acceptDraftId === suggestion.id;
          const isBusy = busyId === suggestion.id;

          return (
            <li
              key={suggestion.id}
              className={
                "rounded-md border p-3 transition-colors " +
                (highlightSuggestionId === suggestion.id ? "border-primary/40 bg-primary/5" : "border-border-soft bg-surface-soft")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={profileHref(suggestion.proposer)} className="flex items-center gap-2">
                  <Avatar src={suggestion.proposer.avatarUrl} alt={suggestion.proposer.displayName} size={28} />
                  <span className="text-sm">
                    <span className="font-medium text-text">{suggestion.proposer.displayName}</span>{" "}
                    <span className="text-text-muted">· {formatRelativeTime(suggestion.createdAt)}</span>
                  </span>
                </Link>
                <Badge variant={STATUS_VARIANT[suggestion.status]}>{STATUS_LABEL[suggestion.status]}</Badge>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-text">{suggestion.suggestionText}</p>

              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : suggestion.id)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {isExpanded ? "Önizlemeyi gizle" : "Önizle"}
              </button>

              {isExpanded && (
                <div className="mt-2 space-y-2 rounded-md border border-border-soft bg-background p-3">
                  {suggestion.proposedPromptText ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Mevcut → Önerilen</p>
                      <DiffText before={currentPromptText} after={suggestion.proposedPromptText} />
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Mevcut prompt metni</p>
                      <p className="prompt-text whitespace-pre-wrap break-words text-sm text-text-muted">{currentPromptText}</p>
                      <p className="text-xs text-text-muted">
                        Bu öneri yalnızca bir not içeriyor, hazır bir prompt metni önermiyor — kabul edersen aşağıda kendi yeni
                        metnini yazabilirsin.
                      </p>
                    </>
                  )}
                </div>
              )}

              {suggestion.status === "pending" && (
                <div className="mt-3 space-y-2">
                  {isAccepting ? (
                    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                      <p className="text-xs font-medium text-text">
                        Onaylamadan önce son hâlini düzenleyebilirsin — kaydettiğinde promptun yeni bir sürümü oluşacak.
                      </p>
                      <textarea
                        rows={4}
                        value={draftText}
                        onChange={(event) => setDraftText(event.target.value)}
                        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-text"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" size="sm" onClick={() => confirmAccept(suggestion)} disabled={isBusy || !draftText.trim()}>
                          {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Kabul Et ve Yayınla
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setAcceptDraftId(null)} disabled={isBusy}>
                          Vazgeç
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => startAccept(suggestion)} disabled={isBusy}>
                        <Check size={14} />
                        Kabul Et
                      </Button>
                      <Button type="button" size="sm" variant="danger" onClick={() => handleReject(suggestion)} disabled={isBusy}>
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                        {confirmingRejectId === suggestion.id ? "Emin misin? Tekrar tıkla" : "Reddet"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
