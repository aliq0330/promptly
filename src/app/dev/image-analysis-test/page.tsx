"use client";

/**
 * GEÇİCİ TEST SAYFASI — yalnızca geliştirme/tanı amaçlı.
 *
 * Ortak Image Analysis sisteminin (`supabase/functions/analyze-image`,
 * `src/lib/supabase/image-analysis.ts`) ÜÇ modunu da (`generator_builder`,
 * `prompt_builder`, `prompt_request`) tek bir yerden, gerçek Prompt/
 * Generator/İstek formlarına hiç girmeden test edebilmek için var — hiçbir
 * gerçek özelliğe bağlı DEĞİL, kendi başına izole bir route, kaldırılması
 * güvenlidir.
 *
 * İlk üç sekme (Generator/Prompt/İstek), üretim formlarının KULLANDIĞI
 * BİREBİR AYNI fonksiyonları (`analyzeImageForGenerator`/
 * `analyzeImageForPrompt`/`analyzeImageForRequest`) çağırıyor — yani burada
 * çalışan/çalışmayan bir şey, gerçek sitede de aynı şekilde çalışır/
 * çalışmaz. Dördüncü sekme ("Ham İstek — Edge Function") bu sarmalayıcıları
 * atlayıp Edge Function'a doğrudan `{ mode, context, image, mimeType }`
 * gönderip HAM cevabı gösteriyor — Edge Function'ın deploy edilmiş sürümü
 * eski mi yeni mi (mode farkındalıklı mi değil mi) net olarak bunda görünür.
 *
 * Kurallar (bilinçli olarak izleniyor, eski test sayfasıyla aynı):
 * - Görsel Supabase Storage'a hiç yüklenmiyor, yalnızca Base64'e çevrilip
 *   Edge Function'a gönderiliyor.
 * - Hiçbir API key burada yok — yalnızca projenin mevcut, public anon
 *   key'li Supabase client'ı kullanılıyor.
 * - Gemini'ye (veya başka bir AI servisine) frontend'den doğrudan istek
 *   ATILMIYOR — tek çağrı hedefi, projenin kendi Supabase Edge Function'ı.
 */

import { useState, type ChangeEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, readBlobAsBase64, resizeImageToBlob } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { analyzeImageForGenerator, analyzeImageForPrompt, analyzeImageForRequest, type ImageAnalysisOutcome } from "@/lib/supabase/image-analysis";
import type { GeneratorBuilderContext, ImageAnalysisMode } from "@/lib/image-analysis-types";

type Tab = "generator_builder" | "prompt_builder" | "prompt_request" | "raw";

const TABS: { id: Tab; label: string }[] = [
  { id: "generator_builder", label: "Generator Builder" },
  { id: "prompt_builder", label: "Prompt Builder" },
  { id: "prompt_request", label: "Prompt İsteği" },
  { id: "raw", label: "Ham İstek — Edge Function" },
];

const DEFAULT_GENERATOR_CONTEXT: GeneratorBuilderContext = {
  generator: {
    name: "Karakter Portresi Generator",
    description: "Fantastik karakterler için detaylı portre promptu üreten bir generator.",
    category: "image",
  },
  fields: [
    { key: "hair_color", label: "Saç Rengi", type: "select", options: ["Kahverengi", "Sarı", "Siyah", "Kızıl", "Gri"] },
    { key: "eye_color", label: "Göz Rengi", type: "select", options: ["Mavi", "Yeşil", "Kahverengi", "Ela", "Gri"] },
    { key: "art_style", label: "Sanat Stili", type: "text" },
    { key: "mood", label: "Ruh Hali / Atmosfer", type: "text" },
  ],
};

const DEFAULT_RAW_CONTEXT: Record<Tab, unknown> = {
  generator_builder: DEFAULT_GENERATOR_CONTEXT,
  prompt_builder: {},
  prompt_request: { contentType: "image" },
  raw: {},
};

interface RunResult {
  elapsedMs: number;
  outcome?: ImageAnalysisOutcome<unknown>;
  raw?: { success: boolean; ok: boolean; status: number | null; body: unknown };
}

export default function ImageAnalysisTestPage() {
  const [tab, setTab] = useState<Tab>("generator_builder");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextText, setContextText] = useState(() => JSON.stringify(DEFAULT_GENERATOR_CONTEXT, null, 2));
  const [rawModeSelect, setRawModeSelect] = useState<ImageAnalysisMode>("generator_builder");
  const [rawContextText, setRawContextText] = useState(() => JSON.stringify(DEFAULT_GENERATOR_CONTEXT, null, 2));
  const [contextError, setContextError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  function handleTabChange(next: Tab) {
    setTab(next);
    setResult(null);
    setContextError(null);
    if (next === "generator_builder") setContextText(JSON.stringify(DEFAULT_GENERATOR_CONTEXT, null, 2));
  }

  function resetContextToDefault() {
    if (tab === "raw") {
      setRawContextText(JSON.stringify(DEFAULT_RAW_CONTEXT[rawModeSelect], null, 2));
    } else {
      setContextText(JSON.stringify(DEFAULT_GENERATOR_CONTEXT, null, 2));
    }
    setContextError(null);
  }

  async function handleAnalyze() {
    if (!file || loading) return;
    setContextError(null);
    setLoading(true);
    setResult(null);
    const startedAt = performance.now();

    try {
      if (tab === "generator_builder") {
        let context: GeneratorBuilderContext;
        try {
          context = JSON.parse(contextText);
        } catch {
          setContextError("Bağlam (context) geçerli bir JSON değil.");
          return;
        }
        const outcome = await analyzeImageForGenerator(file, context);
        setResult({ elapsedMs: Math.round(performance.now() - startedAt), outcome });
        return;
      }

      if (tab === "prompt_builder") {
        const outcome = await analyzeImageForPrompt(file);
        setResult({ elapsedMs: Math.round(performance.now() - startedAt), outcome });
        return;
      }

      if (tab === "prompt_request") {
        const outcome = await analyzeImageForRequest(file);
        setResult({ elapsedMs: Math.round(performance.now() - startedAt), outcome });
        return;
      }

      // "raw" — Edge Function'ı hiçbir şekil doğrulaması olmadan, doğrudan çağırıyor.
      let context: unknown;
      try {
        context = JSON.parse(rawContextText);
      } catch {
        setContextError("Bağlam (context) geçerli bir JSON değil.");
        return;
      }
      const { blob, contentType } = await resizeImageToBlob(file, 1600);
      const base64Image = await readBlobAsBase64(blob);

      try {
        const { data, error } = await supabase.functions.invoke("analyze-image", {
          body: { mode: rawModeSelect, context, image: base64Image, mimeType: contentType },
        });
        if (error) {
          let status: number | null = null;
          let body: unknown = null;
          if (error instanceof FunctionsHttpError) {
            status = error.context.status;
            try {
              body = await error.context.clone().json();
            } catch {
              try {
                body = await error.context.clone().text();
              } catch {
                body = null;
              }
            }
          }
          setResult({
            elapsedMs: Math.round(performance.now() - startedAt),
            raw: { success: false, ok: false, status, body: body ?? { error: error.message } },
          });
          return;
        }
        setResult({
          elapsedMs: Math.round(performance.now() - startedAt),
          raw: { success: true, ok: true, status: 200, body: data },
        });
      } catch (err) {
        setResult({
          elapsedMs: Math.round(performance.now() - startedAt),
          raw: { success: false, ok: false, status: null, body: { error: err instanceof Error ? err.message : String(err) } },
        });
      }
    } finally {
      setLoading(false);
    }
  }

  const activeContextText = tab === "raw" ? rawContextText : contextText;
  const activeSetContextText = tab === "raw" ? setRawContextText : setContextText;

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          Geçici test sayfası — /dev/image-analysis-test
        </p>
        <h1 className="mt-1 text-xl font-semibold text-text">Görsel Analiz Testi — üç akış</h1>
        <p className="mt-1 text-sm text-text/60">
          Generator Builder, Prompt Builder ve Prompt İsteği akışlarının üçünü de gerçek üretim formlarına
          girmeden, tek bir yerden test et. İlk üç sekme, formların kullandığı BİREBİR AYNI fonksiyonları çağırır.
          Dördüncü sekme, Edge Function&apos;a doğrudan istek atıp ham cevabı (hangi şekilde döndüğünü) gösterir —
          canlı fonksiyonun deploy edilmiş sürümünü teşhis etmek için en faydalısı budur.
        </p>
      </div>

      <div role="tablist" aria-label="Test edilecek akış" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => handleTabChange(t.id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-text/70 hover:bg-accent-surface",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            <span className="inline-flex h-10 cursor-pointer items-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-text transition-colors hover:bg-accent-surface">
              [ Görsel seç ]
            </span>
          </label>

          <Button onClick={handleAnalyze} disabled={!file || loading}>
            [ Analiz Et ]
          </Button>

          {loading && <span className="text-sm text-text/60">Analiz ediliyor...</span>}
        </div>

        {file && (
          <div className="flex items-center gap-3 rounded-md border border-border bg-accent-surface/40 p-3">
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="h-16 w-16 rounded object-cover" />
            )}
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium text-text">{file.name}</p>
              <p className="text-text/60">
                {file.type || "bilinmeyen tür"} · {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
        )}

        {tab === "raw" && (
          <div className="flex items-center gap-2">
            <label htmlFor="raw-mode-select" className="text-sm font-medium text-text">
              mode:
            </label>
            <select
              id="raw-mode-select"
              value={rawModeSelect}
              onChange={(e) => {
                const next = e.target.value as ImageAnalysisMode;
                setRawModeSelect(next);
                setRawContextText(JSON.stringify(DEFAULT_RAW_CONTEXT[next], null, 2));
              }}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-text"
            >
              <option value="generator_builder">generator_builder</option>
              <option value="prompt_builder">prompt_builder</option>
              <option value="prompt_request">prompt_request</option>
            </select>
          </div>
        )}

        {(tab === "generator_builder" || tab === "raw") && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="context-json" className="text-sm font-medium text-text">
                Bağlam (context) — düzenlenebilir JSON
              </label>
              <button type="button" onClick={resetContextToDefault} className="text-xs font-medium text-primary hover:underline">
                Varsayılana dön
              </button>
            </div>
            <textarea
              id="context-json"
              value={activeContextText}
              onChange={(e) => activeSetContextText(e.target.value)}
              rows={10}
              spellCheck={false}
              className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {contextError && <p className="text-xs text-danger">{contextError}</p>}
          </div>
        )}
      </Card>

      {result?.outcome && (
        <Card className={cn("space-y-2 p-5", !result.outcome.ok && "border-danger/40")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={cn("text-sm font-semibold", result.outcome.ok ? "text-text" : "text-danger")}>
              {result.outcome.ok ? "Başarılı" : `Hata — ${result.outcome.error.kind}`}
            </p>
            <p className="text-xs text-text/60">
              {result.outcome.ok && result.outcome.model && <span>model: {result.outcome.model} · </span>}
              {result.elapsedMs} ms
            </p>
          </div>
          {!result.outcome.ok && <p className="text-sm text-text">{result.outcome.error.message}</p>}
          {result.outcome.ok && (
            <pre className="max-h-[480px] overflow-auto rounded-md bg-accent-surface/40 p-3 text-xs text-text">
              {JSON.stringify(result.outcome.data, null, 2)}
            </pre>
          )}
        </Card>
      )}

      {result?.raw && (
        <Card className={cn("space-y-2 p-5", !result.raw.ok && "border-danger/40")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={cn("text-sm font-semibold", result.raw.ok ? "text-text" : "text-danger")}>
              Ham response {result.raw.status !== null ? `(HTTP ${result.raw.status})` : ""}
            </p>
            <p className="text-xs text-text/60">{result.elapsedMs} ms</p>
          </div>
          <pre className="max-h-[480px] overflow-auto rounded-md bg-accent-surface/40 p-3 text-xs text-text">
            {JSON.stringify(result.raw.body, null, 2)}
          </pre>
        </Card>
      )}
    </main>
  );
}
