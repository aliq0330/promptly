/**
 * Ortak Image Analysis sisteminin TEK Supabase erişim noktası — mevcut,
 * zaten kurulu Supabase client'ı (`@/lib/supabase/client`) ile mevcut,
 * zaten deploy edilmiş `analyze-image` Edge Function'ını çağırıyor. Bu
 * dosya, üç ayrı kullanım (Generator Builder, Prompt Builder, Prompt
 * Request Builder) için tek bir ortak `analyzeImage()` çağırıcısı + üç ince,
 * tipli sarmalayıcı sağlıyor — üç ayrı invoke deseni yok.
 *
 * Hata kategorileri — ham Gemini/Edge Function metni KULLANICIYA HİÇ
 * gösterilmiyor, yalnızca `console.error` ile developer log'una yazılıyor;
 * kullanıcı her zaman `FRIENDLY_MESSAGES`'teki Türkçe, kısa mesajı görüyor.
 */

import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "./client";
import { readBlobAsBase64, resizeImageToBlob } from "@/lib/utils";
import type {
  GeneratorBuilderContext,
  GeneratorBuilderResult,
  ImageAnalysisMode,
  PromptBuilderResult,
  PromptRequestResult,
} from "@/lib/image-analysis-types";

export type ImageAnalysisErrorKind =
  | "api_key"
  | "model"
  | "invalid_image"
  | "network"
  | "malformed_response"
  | "timeout"
  | "unknown";

export interface ImageAnalysisError {
  kind: ImageAnalysisErrorKind;
  message: string;
}

export type ImageAnalysisOutcome<TData> =
  | { ok: true; data: TData; model: string | null }
  | { ok: false; error: ImageAnalysisError };

const FRIENDLY_MESSAGES: Record<ImageAnalysisErrorKind, string> = {
  api_key: "Görsel analiz servisi şu anda yapılandırma sorunu yaşıyor. Lütfen daha sonra tekrar dene.",
  model: "Görsel analiz servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.",
  invalid_image: "Bu görsel analiz edilemedi. Lütfen JPEG, PNG veya WebP formatında bir görsel seç.",
  network: "Bağlantı sorunu nedeniyle analiz tamamlanamadı. İnternet bağlantını kontrol edip tekrar dene.",
  malformed_response: "Analiz sonucu okunamadı. Lütfen tekrar dene.",
  timeout: "Analiz beklenenden uzun sürdü ve zaman aşımına uğradı. Lütfen tekrar dene.",
  unknown: "Görsel analiz sırasında bir sorun oluştu. Lütfen tekrar dene.",
};

/** Bu sistemin desteklediği görsel formatları (HEIC vb. dahil edilmedi, tarayıcı desteği garanti değil). */
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Kaynak dosya için üst sınır — bunun üstü zaten mantıksız derecede büyük bir dosya demektir, optimize etmeye bile değmez. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const REQUEST_TIMEOUT_MS = 30_000;

function categorizeFromText(text: string): ImageAnalysisErrorKind {
  const lower = text.toLowerCase();
  if (lower.includes("api key") || lower.includes("api_key") || lower.includes("unauthorized") || lower.includes("permission")) {
    return "api_key";
  }
  if (lower.includes("model")) return "model";
  if (lower.includes("json") || lower.includes("parse")) return "malformed_response";
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";
  return "unknown";
}

/**
 * Ortak, mode-bazlı analiz çağrısı — görseli optimize edip (max 1600px,
 * JPEG) `analyze-image` Edge Function'ına `{ mode, context, image,
 * mimeType }` olarak gönderir, response'u güvenle validate edip kategorize
 * edilmiş, kullanıcı dostu bir sonuca çevirir. Üç mode de aynı fonksiyonu
 * kullanıyor — yalnızca `mode`/`context` ve dönen `data`'nın TypeScript
 * tipi değişiyor (bkz. aşağıdaki üç ince sarmalayıcı).
 */
async function analyzeImage<TData>(
  file: File,
  mode: ImageAnalysisMode,
  context: unknown,
): Promise<ImageAnalysisOutcome<TData>> {
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: { kind: "invalid_image", message: FRIENDLY_MESSAGES.invalid_image } };
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return {
      ok: false,
      error: { kind: "invalid_image", message: "Bu görsel çok büyük. Lütfen 20 MB'tan küçük bir dosya seç." },
    };
  }

  let base64Image: string;
  let mimeType: string;
  try {
    const { blob, contentType } = await resizeImageToBlob(file, 1600);
    base64Image = await readBlobAsBase64(blob);
    mimeType = contentType;
  } catch (err) {
    console.error("[image-analysis] görsel işlenemedi", err);
    return { ok: false, error: { kind: "invalid_image", message: FRIENDLY_MESSAGES.invalid_image } };
  }

  try {
    const { data, error } = await supabase.functions.invoke("analyze-image", {
      body: { mode, context, image: base64Image, mimeType },
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (error) {
      let kind: ImageAnalysisErrorKind = "unknown";
      let rawMessage = error.message;

      if (error instanceof FunctionsHttpError) {
        try {
          const body: unknown = await error.context.clone().json();
          if (body && typeof body === "object") {
            const record = body as Record<string, unknown>;
            const errText = typeof record.error === "string" ? record.error : "";
            const detailsText =
              typeof record.details === "string" ? record.details : record.details ? JSON.stringify(record.details) : "";
            rawMessage = `${errText} ${detailsText}`.trim() || rawMessage;
          }
        } catch {
          // Gövde JSON değil — yalnızca HTTP status'e bakılıyor.
        }
        kind =
          error.context.status === 401 || error.context.status === 403
            ? "api_key"
            : categorizeFromText(rawMessage);
      } else if (error instanceof FunctionsFetchError) {
        // Doğal `timeout` seçeneği süresi dolunca fetch'i AbortController ile
        // iptal ediyor — bu da burada bir FunctionsFetchError olarak geliyor.
        const context = error.context as { name?: string } | undefined;
        kind = context?.name === "AbortError" ? "timeout" : "network";
      } else if (error instanceof FunctionsRelayError) {
        kind = "network";
      }

      console.error("[image-analysis] analyze-image hatası", rawMessage, error);
      return { ok: false, error: { kind, message: FRIENDLY_MESSAGES[kind] } };
    }

    if (!data || typeof data !== "object") {
      console.error("[image-analysis] beklenmeyen response şekli", data);
      return { ok: false, error: { kind: "malformed_response", message: FRIENDLY_MESSAGES.malformed_response } };
    }

    const payload = data as { success?: unknown; data?: unknown; model?: unknown; error?: unknown };
    if (payload.success !== true || !payload.data || typeof payload.data !== "object") {
      const kind = typeof payload.error === "string" ? categorizeFromText(payload.error) : "malformed_response";
      console.error("[image-analysis] analyze-image success:false", payload);
      return { ok: false, error: { kind, message: FRIENDLY_MESSAGES[kind] } };
    }

    return {
      ok: true,
      data: payload.data as TData,
      model: typeof payload.model === "string" ? payload.model : null,
    };
  } catch (err) {
    console.error("[image-analysis] beklenmeyen hata", err);
    return { ok: false, error: { kind: "unknown", message: FRIENDLY_MESSAGES.unknown } };
  }
}

/** Yalnızca Generator Builder'ın "Alanlar" adımında kullanılır — asla Generator'ın gerçek public runtime sayfasında (`/generators/local`). */
export function analyzeImageForGenerator(
  file: File,
  context: GeneratorBuilderContext,
): Promise<ImageAnalysisOutcome<GeneratorBuilderResult>> {
  return analyzeImage<GeneratorBuilderResult>(file, "generator_builder", context);
}

/** Prompt oluşturma sayfasının "Görselden İlham Al" yardımcısı — Generator şema/field mapping'iyle hiç ilgisi yok. */
export function analyzeImageForPrompt(file: File): Promise<ImageAnalysisOutcome<PromptBuilderResult>> {
  return analyzeImage<PromptBuilderResult>(file, "prompt_builder", {});
}

/** Prompt İsteği oluşturma sayfasının, yalnızca içerik türü "Görsel" iken görünen yardımcısı. */
export function analyzeImageForRequest(file: File): Promise<ImageAnalysisOutcome<PromptRequestResult>> {
  return analyzeImage<PromptRequestResult>(file, "prompt_request", { contentType: "image" });
}
