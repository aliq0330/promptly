"use client";

/**
 * "Görselden Prompt Çıkar" — AI Vision Generator sisteminin gerçek giriş
 * noktası. `GeneratorPlayground` (hem builder'ın Live Preview'ı hem gerçek
 * public generator runtime sayfası TARAFINDAN AYNI, DEĞİŞTİRİLMEDEN
 * paylaşılan bileşen) içine gömülü — yani bu özellik "gerçek Generator"da
 * (§19) otomatik olarak var, ayrı bir demo sayfası değil.
 *
 * Bu bileşen yalnızca yükleme/analiz/hata-durumu UI'ını yönetiyor; AI
 * sonucunu hangi generator alanına yazacağını HİÇ bilmiyor — o eşleme,
 * merkezi olarak `src/lib/vision-analysis.ts`'te, çağıran tarafta
 * (`GeneratorPlayground`) yapılıyor (§7'nin "mapping dağınık olmasın"
 * kuralı).
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Camera, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { analyzeImageForGenerator } from "@/lib/supabase/vision-analysis";
import type { VisionAnalysisData } from "@/lib/vision-analysis";

type Status = "idle" | "loading" | "error";

export function VisionAnalysisPanel({
  onAnalyzed,
}: {
  onAnalyzed: (result: VisionAnalysisData, model: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  function setSelectedFile(next: File | null) {
    setFile(next);
    setErrorMessage(null);
    setStatus("idle");
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
    // §26 — art arda tıklama/tekrar istek engeli: bir istek zaten
    // sürüyorsa (ref, aynı render turunda state güncellemesini beklemeden
    // hemen görünür) ikinci bir çağrı hiç başlamaz.
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setStatus("loading");
    setErrorMessage(null);

    const outcome = await analyzeImageForGenerator(file);
    busyRef.current = false;

    if (!outcome.ok) {
      setStatus("error");
      setErrorMessage(outcome.error.message);
      return;
    }

    setStatus("idle");
    onAnalyzed(outcome.data, outcome.model);
  }

  return (
    <div className="rounded-md border border-dashed border-border bg-accent-surface/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="vision-analysis-panel-body"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-text"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1">Görselden Prompt Çıkar</span>
        <span className="text-xs font-normal text-text-muted">{expanded ? "Gizle" : "Göster"}</span>
      </button>

      {expanded && (
        <div id="vision-analysis-panel-body" className="space-y-3 border-t border-border/60 px-3 pb-3 pt-3">
          <p className="text-xs text-text-muted">
            Bir fotoğraf yükle, yapay zekâ görseli analiz edip aşağıdaki alanları senin için doldursun — sonucu
            dilediğin gibi değiştirebilirsin.
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
        </div>
      )}
    </div>
  );
}
