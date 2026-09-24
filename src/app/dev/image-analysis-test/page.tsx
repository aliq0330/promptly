"use client";

/**
 * GEÇİCİ TEST SAYFASI — yalnızca geliştirme/test amaçlı.
 *
 * Mevcut, zaten deploy edilmiş Supabase Edge Function'ı ("analyze-image")
 * manuel olarak çağırıp ham response'u göstermek için var. Generator
 * sistemine, prompt oluşturma akışına veya başka hiçbir gerçek özelliğe
 * bağlı DEĞİL — kendi başına, izole bir route. Kaldırılması güvenlidir.
 *
 * Kurallar (bilinçli olarak izleniyor):
 * - Görsel Supabase Storage'a hiç yüklenmiyor, yalnızca Base64'e çevrilip
 *   Edge Function'a gönderiliyor.
 * - Hiçbir API key burada yok — yalnızca projenin mevcut, public anon key'li
 *   Supabase client'ı (`@/lib/supabase/client`) kullanılıyor.
 * - Gemini'ye (veya başka bir AI servisine) frontend'den doğrudan istek
 *   ATILMIYOR — tek çağrı hedefi, projenin kendi Supabase Edge Function'ı.
 * - Edge Function URL'i hiçbir yerde hardcode edilmiyor: `supabase.functions
 *   .invoke()` bunu mevcut client'ın kendi `NEXT_PUBLIC_SUPABASE_URL`
 *   yapılandırmasından türetiyor.
 */

import { useState, type ChangeEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ErrorInfo {
  status: number | null;
  error: string;
  details: string | null;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Dosya okunamadı."));
        return;
      }
      // data:image/png;base64,AAAA... -> yalnızca "AAAA..." kısmını gönder.
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

export default function ImageAnalysisTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setRawResponse(null);
    setErrorInfo(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  async function handleAnalyze() {
    if (!file || loading) return;
    setLoading(true);
    setRawResponse(null);
    setErrorInfo(null);

    try {
      const base64Image = await readFileAsBase64(file);
      const mimeType = file.type || "application/octet-stream";

      const { data, error } = await supabase.functions.invoke("analyze-image", {
        body: { image: base64Image, mimeType },
      });

      if (error) {
        let status: number | null = null;
        let details: string | null = null;
        let message = error.message;

        if (error instanceof FunctionsHttpError) {
          status = error.context.status;
          try {
            const body = await error.context.clone().json();
            if (body && typeof body === "object") {
              setRawResponse(body);
              if (typeof body.error === "string") message = body.error;
              if (typeof body.details === "string") details = body.details;
              else if (body.details) details = JSON.stringify(body.details, null, 2);
            }
          } catch {
            try {
              details = await error.context.clone().text();
            } catch {
              // Gövde hiç okunamadıysa yalnızca mesajla devam et.
            }
          }
        }

        setErrorInfo({ status, error: message, details });
        return;
      }

      setRawResponse(data);
    } catch (err) {
      setErrorInfo({
        status: null,
        error: err instanceof Error ? err.message : "Bilinmeyen bir hata oluştu.",
        details: null,
      });
    } finally {
      setLoading(false);
    }
  }

  const isSuccess = Boolean(
    rawResponse && typeof rawResponse === "object" && (rawResponse as Record<string, unknown>).success === true,
  );

  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-6 px-4 py-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          Geçici test sayfası — /dev/image-analysis-test
        </p>
        <h1 className="mt-1 text-xl font-semibold text-text">Görsel Analiz Testi</h1>
        <p className="mt-1 text-sm text-text/60">
          Yalnızca geliştirme/test amaçlı. Seçilen görsel Supabase&apos;in{" "}
          <code className="rounded bg-accent-surface px-1 py-0.5 text-xs">analyze-image</code> Edge Function&apos;ına
          gönderilir; Storage&apos;a hiçbir şey yüklenmez.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <span
              className={cn(
                "inline-flex h-10 cursor-pointer items-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-text transition-colors hover:bg-accent-surface",
              )}
            >
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
              <p className="text-text/60">{file.type || "bilinmeyen tür"} · {(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        )}
      </Card>

      {errorInfo && (
        <Card className="space-y-2 border-red-300 p-5">
          <p className="text-sm font-semibold text-red-600">Hata</p>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-text/60">HTTP status</dt>
              <dd className="text-text">{errorInfo.status ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-text/60">error</dt>
              <dd className="text-text">{errorInfo.error}</dd>
            </div>
            {errorInfo.details && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-text/60">details</dt>
                <dd className="whitespace-pre-wrap break-words text-text">{errorInfo.details}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {rawResponse !== null && (
        <Card className="space-y-2 p-5">
          <p className="text-sm font-semibold text-text">
            {isSuccess ? "Analiz sonucu (success: true)" : "Ham response"}
          </p>
          <pre className="max-h-[480px] overflow-auto rounded-md bg-accent-surface/40 p-3 text-xs text-text">
            {JSON.stringify(rawResponse, null, 2)}
          </pre>
        </Card>
      )}
    </main>
  );
}
