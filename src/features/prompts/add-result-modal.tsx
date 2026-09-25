"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { RESULT_MEDIA_TYPE_LABELS, detectMediaTypeFromFile } from "@/lib/prompt-result-media";
import { createPromptResult } from "@/lib/supabase/prompt-results";
import type { PromptResultMediaType } from "@/types";

type Mode = "file" | "text";

/**
 * The modal's own target — a prompt (with its current text, so a
 * modification can be diffed against something) or a generator (no
 * modification concept at all, CLAUDE.md §5/§23). Mirrors
 * `CreatePromptResultSource` (`prompt-results.ts`) one-to-one; kept as a
 * separate type here only because the modal also needs `promptText` for
 * its read-only "Orijinal prompt metni" preview, which the create-call
 * itself doesn't.
 */
export type AddResultModalTarget = { type: "prompt"; promptId: string; promptText: string } | { type: "generator"; generatorId: string };

/** Free-text suggestions for the result's own "Araç / Model" field — the same "free text + datalist" pattern `CreatePromptForm`'s own `tool` field already uses (CLAUDE.md §3: "mevcut bir araç/model sistemi varsa onu kullan... yeni paralel taxonomy oluşturma" — there is no separate tool/model table anywhere in this project to reuse, so this *is* the existing system). */
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
 * "+ Sonuç ekle" compose modal (CLAUDE.md şartnamesi §3/§4, ve Generator
 * Local entegrasyonu şartnamesinin §4/§22'si) — shares a real result under
 * a real prompt OR a real generator, the exact same modal either way
 * (§22's "TEK SİSTEM" kuralı). Deliberately NEVER creates a `prompts`/
 * `generators` row and never touches Remix in any way (§19): a result is a
 * flat, standalone `prompt_results` insert, full stop. Reuses this app's
 * existing modal shell (`Modal`, same panel/close-button structure as
 * `SuggestEditModal`/`PersonalizeModal`) and its existing free-text
 * "tool" input pattern — no second design system, no second tool
 * taxonomy. The whole "Promptu değiştirdin mi?" block only exists at all
 * for a prompt target — a generator target never renders it (§5/§23).
 */
export function AddResultModal({
  target,
  onClose,
  onAdded,
}: {
  target: AddResultModalTarget;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { user } = useAuth();
  const isPromptTarget = target.type === "prompt";
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [detectedType, setDetectedType] = useState<Extract<PromptResultMediaType, "image" | "video" | "audio"> | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [tool, setTool] = useState("");
  const [hasModification, setHasModification] = useState(false);
  const [modificationSummary, setModificationSummary] = useState("");
  const [modifiedPromptText, setModifiedPromptText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      setDetectedType(null);
      setFileError(null);
      return;
    }
    const detected = detectMediaTypeFromFile(picked);
    if (!detected) {
      setFile(null);
      setDetectedType(null);
      setFileError("Bu dosya türü desteklenmiyor. Lütfen bir görsel, video veya ses dosyası seç.");
      event.target.value = "";
      return;
    }
    setFile(picked);
    setDetectedType(detected);
    setFileError(null);
  }

  const canSubmit = mode === "file" ? Boolean(file && !fileError) : textContent.trim().length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!user || !canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createPromptResult(
        {
          source: isPromptTarget
            ? { type: "prompt", promptId: target.promptId, hasModification, modificationSummary, modifiedPromptText }
            : { type: "generator", generatorId: target.generatorId },
          file: mode === "file" ? file : null,
          textContent: mode === "text" ? textContent : "",
          tool,
        },
        user.id,
      );
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sonuç paylaşılamadı, lütfen tekrar dene.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="add-result-modal-title">
      <div
        className="w-full max-w-lg space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="add-result-modal-title" className="text-base font-semibold text-text">
            Sonuç ekle
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
        <p className="text-sm text-text-muted">
          {isPromptTarget ? "Bu promptu kullanarak oluşturduğun sonucu paylaş." : "Bu generatoru kullanarak oluşturduğun sonucu paylaş."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-1 rounded-md border border-border-soft bg-surface-soft p-1">
            {(["file", "text"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`flex-1 rounded-sm px-2 py-1.5 text-sm font-medium transition-colors ${
                  mode === option ? "bg-surface text-text shadow-card" : "text-text-muted hover:text-text"
                }`}
              >
                {option === "file" ? "Dosya yükle" : "Metin gir"}
              </button>
            ))}
          </div>

          {mode === "file" ? (
            <div>
              <label htmlFor="result-file" className="mb-1.5 block text-sm font-medium text-text">
                Görsel, video veya ses dosyası
              </label>
              <input
                id="result-file"
                type="file"
                accept="image/*,video/*,audio/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-accent-surface/80"
              />
              {detectedType && (
                <p className="mt-1.5 text-xs text-text-muted">
                  Algılanan tür: <span className="font-medium text-text">{RESULT_MEDIA_TYPE_LABELS[detectedType]}</span>
                </p>
              )}
              {fileError && <p className="mt-1.5 text-xs text-danger">{fileError}</p>}
            </div>
          ) : (
            <div>
              <label htmlFor="result-text" className="mb-1.5 block text-sm font-medium text-text">
                Paylaşacağın metin
              </label>
              <textarea
                id="result-text"
                rows={4}
                value={textContent}
                onChange={(event) => setTextContent(event.target.value)}
                placeholder="Bu promptu kullanarak elde ettiğin metin çıktısını buraya yapıştır."
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
              />
            </div>
          )}

          <div>
            <label htmlFor="result-tool" className="mb-1.5 block text-sm font-medium text-text">
              Araç / Model <span className="text-text-muted">(opsiyonel)</span>
            </label>
            <input
              id="result-tool"
              list="result-tool-suggestions"
              type="text"
              value={tool}
              onChange={(event) => setTool(event.target.value)}
              placeholder="Örn. Midjourney v6"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
            <datalist id="result-tool-suggestions">
              {TOOL_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>

          {/*
            §5/§23: this whole "Promptu değiştirdin mi?" feature (question +
            modification-detail fields) only exists for a prompt target — a
            generator target renders none of it, not even the question.
          */}
          {isPromptTarget && (
            <>
              <div>
                <p className="mb-1.5 text-sm font-medium text-text">Promptu değiştirdin mi?</p>
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
                      {value ? "Evet" : "Hayır"}
                    </button>
                  ))}
                </div>
              </div>

              {hasModification && (
                <div className="space-y-3 rounded-md border border-border-soft bg-surface-soft p-3">
                  <div>
                    <label htmlFor="result-mod-summary" className="mb-1.5 block text-sm font-medium text-text">
                      Kullandığın değişiklikler <span className="text-text-muted">(kısa özet)</span>
                    </label>
                    <input
                      id="result-mod-summary"
                      type="text"
                      value={modificationSummary}
                      onChange={(event) => setModificationSummary(event.target.value)}
                      placeholder="Örn. Arka planı değiştirdim, ışığı daha sıcak yaptım."
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Orijinal prompt metni</p>
                    <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-border-soft bg-background px-3 py-2 font-mono text-xs text-text-muted">
                      {target.promptText}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="result-mod-text" className="mb-1.5 block text-sm font-medium text-text">
                      Kullandığın tam prompt metni <span className="text-text-muted">(opsiyonel)</span>
                    </label>
                    <textarea
                      id="result-mod-text"
                      rows={4}
                      value={modifiedPromptText}
                      onChange={(event) => setModifiedPromptText(event.target.value)}
                      placeholder="Değiştirdiğin tam prompt metnini buraya yazarsan, sonucun detay sayfasında orijinaliyle karşılaştırmalı gösterilir."
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-text placeholder:text-text-muted"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              İptal
            </Button>
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? "Paylaşılıyor…" : "Paylaş"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
