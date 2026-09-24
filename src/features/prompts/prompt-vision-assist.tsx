"use client";

/**
 * "✨ Görselden İlham Al" — Ortak Image Analysis sisteminin `prompt_builder`
 * modu. Yalnızca düz Prompt oluşturma formunda (`CreatePromptForm`, içerik
 * türü "Görsel" seçiliyken) görünür. Generator şeması/field mapping'iyle
 * HİÇ ilgisi yok — burada tek amaç, görseli analiz edip kullanıcının kendi
 * prompt metnini yazmasına yardımcı olmak.
 *
 * AI sonucu kullanıcının promptunu ASLA sessizce üzerine yazmıyor —
 * "Prompt Alanına Yaz" (mevcut metni değiştirir) ve "Prompta Ekle" (mevcut
 * metnin sonuna ekler) iki AYRI, kullanıcının bilerek tıkladığı eylem.
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Camera, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, copyTextToClipboard } from "@/lib/utils";
import { analyzeImageForPrompt } from "@/lib/supabase/image-analysis";
import type { PromptBuilderResult } from "@/lib/image-analysis-types";

type Status = "idle" | "loading" | "error";

export function PromptVisionAssist({
  onApplyPrompt,
}: {
  onApplyPrompt: (prompt: string, mode: "replace" | "append") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<PromptBuilderResult | null>(null);
  const [copiedNegative, setCopiedNegative] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  function setSelectedFile(next: File | null) {
    setFile(next);
    setErrorMessage(null);
    setStatus("idle");
    setResult(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) setSelectedFile(dropped);
  }

  async function handleAnalyze() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setStatus("loading");
    setErrorMessage(null);
    setResult(null);

    const outcome = await analyzeImageForPrompt(file);
    busyRef.current = false;

    if (!outcome.ok) {
      setStatus("error");
      setErrorMessage(outcome.error.message);
      return;
    }

    setStatus("idle");
    setResult(outcome.data);
  }

  const analysisEntries = result
    ? Object.entries(result.analysis ?? {}).filter(([, v]) => typeof v === "string" && v.trim())
    : [];

  return (
    <div className="mb-4 rounded-md border border-dashed border-border bg-accent-surface/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="prompt-vision-assist-body"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-text"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1">Görselden İlham Al</span>
        <span className="text-xs font-normal text-text-muted">{expanded ? "Gizle" : "Göster"}</span>
      </button>

      {expanded && (
        <div id="prompt-vision-assist-body" className="space-y-3 border-t border-border/60 px-3 pb-3 pt-3">
          <p className="text-xs text-text-muted">
            Referans bir görsel yükle — yapay zekâ görseli analiz edip senin için bir prompt önersin. Sonucu dilediğin
            gibi değiştirebilir, ekleyebilir veya hiç kullanmayabilirsin.
          </p>

          {previewUrl ? (
            <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1 text-xs text-text-muted">
                <p className="truncate font-medium text-text">{file?.name}</p>
                <p>{file ? `${(file.size / 1024).toFixed(0)} KB` : null}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                aria-label="Görseli kaldır"
                className="rounded-full p-1 text-text-muted hover:bg-accent-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-border bg-surface",
              )}
            >
              <ImagePlus className="h-6 w-6 text-text-muted" aria-hidden="true" />
              <p className="text-xs text-text-muted">Görseli buraya sürükle bırak veya</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Görsel seç
                </Button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleInputChange}
                aria-label="Analiz edilecek görseli seç"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={handleAnalyze} disabled={!file || status === "loading"}>
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {status === "loading" ? "Analiz ediliyor…" : "Analiz Et"}
            </Button>
            {status === "loading" && (
              <span role="status" className="text-xs text-text-muted">
                Bu birkaç saniye sürebilir.
              </span>
            )}
          </div>

          {status === "error" && errorMessage && (
            <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">
              {errorMessage}
            </p>
          )}

          {result && (
            <div className="space-y-3 rounded-md border border-border bg-surface p-3">
              {analysisEntries.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Görsel Analizi</p>
                  <dl className="space-y-0.5 text-sm text-text">
                    {analysisEntries.map(([key, value]) => (
                      <div key={key} className="flex gap-1.5">
                        <dt className="shrink-0 font-medium">{key}:</dt>
                        <dd className="text-text-muted">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {result.prompt && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Oluşturulan Prompt</p>
                  <p className="whitespace-pre-wrap rounded-md bg-accent-surface/40 p-2.5 text-sm text-text">{result.prompt}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => onApplyPrompt(result.prompt, "replace")}>
                      Prompt Alanına Yaz
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => onApplyPrompt(result.prompt, "append")}>
                      Prompta Ekle
                    </Button>
                  </div>
                </div>
              )}

              {result.negativePrompt && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Kaçınılması Önerilen Öğeler</p>
                  <p className="whitespace-pre-wrap rounded-md bg-accent-surface/40 p-2.5 font-mono text-xs text-text-muted">
                    {result.negativePrompt}
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await copyTextToClipboard(result.negativePrompt)) {
                        setCopiedNegative(true);
                        setTimeout(() => setCopiedNegative(false), 1500);
                      }
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {copiedNegative ? "Kopyalandı" : "Kopyala"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
