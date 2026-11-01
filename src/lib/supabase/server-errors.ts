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
  // "Çalıştı mı?" oyu (docs/history/296-*)
  self_vote_not_allowed: "error.selfVote",
  copy_required: "error.copyRequired",
  // Yorum eki (docs/history/308-*): içerik artık herkese açık/yayında değil
  attachment_not_public: "error.attachmentNotPublic",
};

/** Hata zaten kendi ekranında (ör. şikâyet penceresi) gösterildiğinden ayrıca toast çıkmayan kodlar. */
const INLINE_ONLY = new Set(["report_duplicate", "self_vote_not_allowed", "copy_required", "attachment_not_public"]);

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
      if (!INLINE_ONLY.has(String(body?.message)) && !url.includes("/rest/v1/reports") && !url.includes("/rpc/submit_report")) announceNotice(friendly);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      return new Response(JSON.stringify({ ...body, message: friendly }), { status: response.status, statusText: response.statusText, headers });
    } catch {
      return response;
    }
  };
}

/**
 * Yeni eklenen, İSTEĞE BAĞLI sütunlar (docs/history/226-*): istemci bunları seçer ama sütun henüz canlıda yoksa (migration gecikti ya da
 * geri alındı) PostgREST tüm isteği 400 (`42703`) ile reddeder ve site açılmaz. Bu sütunlar için istek, sütun çıkarılarak BİR kez
 * yeniden denenir; sütun o oturumda bir daha seçilmez. Yalnız burada listelenen, yokluğu işlevi bozmayan (rozet gibi) sütunlar için —
 * zorunlu bir sütunu listeye ekleme, sessizce `undefined` döner. Yeni bir isteğe bağlı sütun eklenince buraya da ekle.
 */
const OPTIONAL_COLUMNS = [
  "is_demo", "flow_show_io", "flow_show_links", "flow_show_relations", "source_workflow_id", "source_step_id", "source_role", "source_step_no", "locked", "reaction",
  // Yorum medyası/eki (docs/history/308-*): sütunlar yoksa yorumlar yine açılır, yalnız ek görünmez.
  "media_kind", "media_ref", "media_width", "media_height", "attach_type", "attach_id",
] as const;
const missingOptional = new Set<string>();

function stripColumn(select: string, column: string): string {
  return select.replace(new RegExp(`\\s*,\\s*${column}\\b`, "g"), "").replace(new RegExp(`\\b${column}\\s*,\\s*`, "g"), "");
}

function withoutMissingColumns(url: string): string {
  if (missingOptional.size === 0 || !url.includes("/rest/v1/")) return url;
  const parsed = new URL(url);
  const select = parsed.searchParams.get("select");
  if (!select) return url;
  let next = select;
  for (const column of missingOptional) next = stripColumn(next, column);
  if (next === select) return url;
  parsed.searchParams.set("select", next);
  return parsed.toString();
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

export function tolerateMissingOptionalColumns(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = requestUrl(input);
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    const adjusted = withoutMissingColumns(url);
    const send = (target: string) => baseFetch(typeof input === "string" || input instanceof URL ? target : new Request(target, input), init);
    const response = await send(adjusted);
    if (response.status !== 400 || method !== "GET" || !adjusted.includes("/rest/v1/")) return response;
    try {
      const body = (await response.clone().json()) as { code?: string; message?: string } | null;
      if (body?.code !== "42703") return response;
      const column = OPTIONAL_COLUMNS.find((c) => new RegExp(`\\b${c}\\b`).test(body.message ?? ""));
      if (!column) return response;
      missingOptional.add(column);
      const retry = withoutMissingColumns(adjusted);
      return retry === adjusted ? response : await send(retry);
    } catch {
      return response;
    }
  };
}
