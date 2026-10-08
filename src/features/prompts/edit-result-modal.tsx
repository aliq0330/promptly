"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RESULT_MEDIA_TYPE_LABELS } from "@/lib/prompt-result-media";
import { updatePromptResult } from "@/lib/supabase/prompt-results";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptResult } from "@/types";

/** Same free-text "tool" suggestions as `AddResultModal` — one list, shared by create and edit. */
const TOOL_SUGGESTIONS = [
  "Midjourney v6",
  "Stable Diffusion XL",
  "DALL-E 3",
  "Flux",
  "Sora",
  "Runway Gen-3",
  "Kling",
  "Suno",
  "Udio",
  "ChatGPT",
  "Claude",
  "Gemini",
];

/**
 * "Düzenle" compose modal for a result the caller owns — same modal shell
 * as `AddResultModal`/`SuggestEditModal`, but only for the fields a result
 * can actually change after it's shared (the media file/origin never
 * changes, enforced at the DB level too — see `20260919430000_result_
 * edit.sql`): the "Araç/Model" badge, the text content of a text/other
 * result, and (only for a prompt-origin result, §5/§23 keeps this out for
 * a generator-origin one) the "Promptu değiştirdin mi?" fields.
 */
export function EditResultModal({ result, onClose, onUpdated }: { result: PromptResult; onClose: () => void; onUpdated: () => void }) {
  const { t } = useTranslation();
  const isTextLike = result.mediaType === "text" || result.mediaType === "other";
  const isPromptOrigin = Boolean(result.originalPrompt);

  const [tool, setTool] = useState(result.tool ?? "");
  const [textContent, setTextContent] = useState(result.textContent ?? "");
  const [hasModification, setHasModification] = useState(result.hasModification);
  const [modificationSummary, setModificationSummary] = useState(result.modificationSummary ?? "");
  const [modifiedPromptText, setModifiedPromptText] = useState(result.modifiedPromptText ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !isTextLike || textContent.trim().length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await updatePromptResult(result.id, {
        tool,
        textContent: isTextLike ? textContent : undefined,
        modification: isPromptOrigin ? { hasModification, modificationSummary, modifiedPromptText } : undefined,
      });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("result.updateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="edit-result-modal-title">
      <div
        className="w-full max-w-lg space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="edit-result-modal-title" className="text-base font-semibold text-text">
            {t("result.modalEditTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isTextLike ? (
            <div>
              <label htmlFor="edit-result-text" className="mb-1.5 block text-sm font-medium text-text">
                {t("result.sharedText")}
              </label>
              <textarea
                id="edit-result-text"
                rows={4}
                value={textContent}
                onChange={(event) => setTextContent(event.target.value)}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
              />
            </div>
          ) : (
            <p className="rounded-md border border-border-soft bg-surface-soft px-3 py-2 text-xs text-text-muted">
              {t(RESULT_MEDIA_TYPE_LABELS[result.mediaType])} {t("result.mediaFileLocked")}
            </p>
          )}

          <div>
            <label htmlFor="edit-result-tool" className="mb-1.5 block text-sm font-medium text-text">
              {t("result.toolFieldLabel")} <span className="text-text-muted">({t("common.optional")})</span>
            </label>
            <input
              id="edit-result-tool"
              list="edit-result-tool-suggestions"
              type="text"
              value={tool}
              onChange={(event) => setTool(event.target.value)}
              placeholder={t("result.toolFieldPlaceholder")}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
            />
            <datalist id="edit-result-tool-suggestions">
              {TOOL_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>

          {isPromptOrigin && (
            <>
              <div>
                <p className="mb-1.5 text-sm font-medium text-text">{t("result.didYouModifyPrompt")}</p>
                <div className="flex gap-1 rounded-md border border-border-soft bg-surface-soft p-1">
                  {([false, true] as const).map((value) => (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={() => setHasModification(value)}
                      className={`flex-1 rounded-sm px-2 py-1.5 text-sm font-medium transition-colors ${
                        hasModification === value ? "bg-surface text-text shadow-card" : "text-text-muted hover:text-text"
                      }`}
                    >
                      {value ? t("common.yes") : t("common.no")}
                    </button>
                  ))}
                </div>
              </div>

              {hasModification && (
                <div className="space-y-3 rounded-md border border-border-soft bg-surface-soft p-3">
                  <div>
                    <label htmlFor="edit-result-mod-summary" className="mb-1.5 block text-sm font-medium text-text">
                      {t("result.modificationSummaryLabel")} <span className="text-text-muted">({t("result.modificationSummaryShort")})</span>
                    </label>
                    <input
                      id="edit-result-mod-summary"
                      type="text"
                      value={modificationSummary}
                      onChange={(event) => setModificationSummary(event.target.value)}
                      placeholder={t("result.modificationSummaryPlaceholder")}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
                    />
                  </div>
                  {result.originalPrompt && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("result.originalPromptText")}</p>
                      <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-border-soft bg-background px-3 py-2 font-mono text-xs text-text-muted">
                        {result.originalPrompt.promptText}
                      </p>
                    </div>
                  )}
                  <div>
                    <label htmlFor="edit-result-mod-text" className="mb-1.5 block text-sm font-medium text-text">
                      {t("result.fullModifiedTextLabel")} <span className="text-text-muted">({t("common.optional")})</span>
                    </label>
                    <textarea
                      id="edit-result-mod-text"
                      rows={4}
                      value={modifiedPromptText}
                      onChange={(event) => setModifiedPromptText(event.target.value)}
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
