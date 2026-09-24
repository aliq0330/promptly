/**
 * AI Vision Generator sisteminin tek Supabase erişim noktası — mevcut,
 * zaten kurulu Supabase client'ı (`@/lib/supabase/client`, CLAUDE.md Bölüm
 * 17) ile mevcut, zaten deploy edilmiş `analyze-image` Edge Function'ını
 * çağırıyor. Yeni bir Supabase client YOK, hardcode edilmiş bir URL YOK —
 * `supabase.functions.invoke()` hedef URL'i mevcut client'ın kendi
 * `NEXT_PUBLIC_SUPABASE_URL` yapılandırmasından türetiyor (`/dev/image-
 * analysis-test` test sayfasıyla BİREBİR AYNI çağrı yolu — CLAUDE.md'nin
 * "yeni paralel sistem kurma" kuralına uyarak aynı fonksiyon burada da
 * kullanılıyor, ikinci bir invoke deseni icat edilmedi).
 *
 * Hata kategorileri (§16) — ham Gemini/Edge Function metni KULLANICIYA
 * HİÇ gösterilmiyor, yalnızca `console.error` ile developer log'una
 * yazılıyor; kullanıcı her zaman `FRIENDLY_MESSAGES`'teki Türkçe, kısa
 * mesajı görüyor.
 */

import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "./client";
import { readBlobAsBase64, resizeImageToBlob } from "@/lib/utils";
import type { VisionAnalysisData } from "@/lib/vision-analysis";

export type VisionAnalysisErrorKind =
  | "api_key"
  | "model"
  | "invalid_image"
  | "network"
  | "malformed_response"
  | "timeout"
  | "unknown";

export interface VisionAnalysisError {
  kind: VisionAnalysisErrorKind;
  message: string;
}

export type VisionAnalysisOutcome =
  | { ok: true; data: VisionAnalysisData; model: string | null }
  | { ok: false; error: VisionAnalysisError };

const FRIENDLY_MESSAGES: Record<VisionAnalysisErrorKind, string> = {
  api_key: "Görsel analiz servisi şu anda yapılandırma sorunu yaşıyor. Lütfen daha sonra tekrar dene.",
  model: "Görsel analiz servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.",
  invalid_image: "Bu görsel analiz edilemedi. Lütfen JPEG, PNG veya WebP formatında bir görsel seç.",
  network: "Bağlantı sorunu nedeniyle analiz tamamlanamadı. İnternet bağlantını kontrol edip tekrar dene.",
  malformed_response: "Analiz sonucu okunamadı. Lütfen tekrar dene.",
  timeout: "Analiz beklenenden uzun sürdü ve zaman aşımına uğradı. Lütfen tekrar dene.",
  unknown: "Görsel analiz sırasında bir sorun oluştu. Lütfen tekrar dene.",
};

/** §15 — mevcut sistem hangi görsel formatlarını destekliyorsa (HEIC vb. dahil edilmedi, tarayıcı desteği garanti değil). */
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** §14'ün "5-10 MB'lık bir dosyayı reddetme, gerekirse optimize et" kuralının kaynak-taraflı üst sınırı — bunun üstü zaten mantıksız derecede büyük bir dosya demektir. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const REQUEST_TIMEOUT_MS = 30_000;

function categorizeFromText(text: string): VisionAnalysisErrorKind {
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
 * §2/§14 — görseli optimize edip (max 1600px, JPEG) mevcut `analyze-image`
 * Edge Function'ına gönderir, ve response'u güvenle validate edip (§13)
 * kategorize edilmiş, kullanıcı dostu bir sonuca çevirir (§16). Aynı
 * görseli tekrar analiz etmek (§10) — çağıran taraf bu fonksiyonu aynı
 * dosyayla tekrar çağırır, ayrı bir "yeniden analiz" kod yolu yok.
 */
export async function analyzeImageForGenerator(file: File): Promise<VisionAnalysisOutcome> {
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
    console.error("[vision-analysis] görsel işlenemedi", err);
    return { ok: false, error: { kind: "invalid_image", message: FRIENDLY_MESSAGES.invalid_image } };
  }

  try {
    const { data, error } = await supabase.functions.invoke("analyze-image", {
      body: { image: base64Image, mimeType },
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (error) {
      let kind: VisionAnalysisErrorKind = "unknown";
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
        // iptal ediyor — bu da burada bir FunctionsFetchError olarak geliyor,
        // context'i (ham fetch hatası) "AbortError" adını taşıyor.
        const context = error.context as { name?: string } | undefined;
        kind = context?.name === "AbortError" ? "timeout" : "network";
      } else if (error instanceof FunctionsRelayError) {
        kind = "network";
      }

      console.error("[vision-analysis] analyze-image hatası", rawMessage, error);
      return { ok: false, error: { kind, message: FRIENDLY_MESSAGES[kind] } };
    }

    if (!data || typeof data !== "object") {
      console.error("[vision-analysis] beklenmeyen response şekli", data);
      return { ok: false, error: { kind: "malformed_response", message: FRIENDLY_MESSAGES.malformed_response } };
    }

    const payload = data as { success?: unknown; data?: unknown; model?: unknown; error?: unknown };
    if (payload.success !== true || !payload.data || typeof payload.data !== "object") {
      const kind = typeof payload.error === "string" ? categorizeFromText(payload.error) : "malformed_response";
      console.error("[vision-analysis] analyze-image success:false", payload);
      return { ok: false, error: { kind, message: FRIENDLY_MESSAGES[kind] } };
    }

    return {
      ok: true,
      data: payload.data as VisionAnalysisData,
      model: typeof payload.model === "string" ? payload.model : null,
    };
  } catch (err) {
    console.error("[vision-analysis] beklenmeyen hata", err);
    return { ok: false, error: { kind: "unknown", message: FRIENDLY_MESSAGES.unknown } };
  }
}
