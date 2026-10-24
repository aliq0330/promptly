import { announceNotice } from "@/lib/app-notice";
import { translateForRuntime, type TranslationKey } from "@/lib/i18n/translations";

/**
 * Veritabanının bilerek fırlattığı kısa kodlar (`raise exception 'rate_limit'` vb., docs/history/224-*) kullanıcıya ham kod olarak
 * değil, o anki dilde okunur bir cümleyle görünür. Tek yerde yapılır: her istemci çağrısı `error.message`'ı olduğu gibi gösterse de
 * (ya da yutsa da) kullanıcı doğru cümleyi görür.
 */
const SERVER_ERROR_KEYS: Record<string, TranslationKey> = {
  rate_limit: "error.rateLimit",
  interaction_blocked: "error.interactionBlocked",
  self_like_not_allowed: "error.selfLike",
  report_duplicate: "error.reportDuplicate",
};

/** Hata zaten kendi ekranında (ör. şikâyet penceresi) gösterildiğinden ayrıca toast çıkmayan kodlar. */
const INLINE_ONLY = new Set(["report_duplicate"]);

export function friendlyServerMessage(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const key = SERVER_ERROR_KEYS[code];
  return key ? translateForRuntime(key) : null;
}

/** `createClient({ global: { fetch } })` için: yalnız PostgREST (`/rest/v1/`) hata gövdelerindeki bilinen kodları çevirir. */
export function friendlyServerErrors(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    if (response.ok || response.status < 400 || response.status >= 500) return response;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/rest/v1/")) return response;
    try {
      const body = (await response.clone().json()) as { message?: unknown } | null;
      const friendly = friendlyServerMessage(body?.message);
      if (!friendly) return response;
      if (!INLINE_ONLY.has(String(body?.message)) && !url.includes("/rest/v1/reports")) announceNotice(friendly);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      return new Response(JSON.stringify({ ...body, message: friendly }), { status: response.status, statusText: response.statusText, headers });
    } catch {
      return response;
    }
  };
}
