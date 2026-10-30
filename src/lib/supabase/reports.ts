import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";
import { REPORT_DETAILS_MAX, reportReasonsFor, type ReportReasonCode, type ReportTargetType } from "@/lib/report-reasons";

export type { ReportTargetType } from "@/lib/report-reasons";

/** Gönderim hatasının türü: arayüz `generic` için "bağlantını kontrol et" cümlesini, diğerleri için kendi (çevrilmiş) mesajını gösterir. */
export type ReportErrorKind = "duplicate" | "rateLimit" | "notFound" | "forbidden" | "self" | "invalid" | "generic";

export class ReportError extends Error {
  constructor(
    readonly kind: ReportErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ReportError";
  }
}

/**
 * Sunucunun kısa hata kodunu (ya da `friendlyServerErrors`'ın çevirdiği cümleyi) türe çevirir. Ham SQL metni kullanıcıya ASLA gösterilmez.
 * `rate_limit` / `report_duplicate` PostgREST sarmalayıcısında zaten okunur cümleye çevrilmiş olabilir; ikisi de tanınır.
 */
export function classifyReportError(message: string | null | undefined): ReportError {
  const text = message ?? "";
  const has = (code: string) => text.includes(code);
  if (has("report_duplicate") || has("already_reported") || text === translateForRuntime("error.reportDuplicate")) {
    return new ReportError("duplicate", translateForRuntime("error.reportDuplicate"));
  }
  if (has("rate_limit") || has("report_limit") || text === translateForRuntime("error.rateLimit")) {
    return new ReportError("rateLimit", translateForRuntime("error.rateLimit"));
  }
  if (has("report_target_not_found")) return new ReportError("notFound", translateForRuntime("report.modal.notFound"));
  if (has("forbidden")) return new ReportError("forbidden", translateForRuntime("report.modal.forbidden"));
  if (has("cannot_target_self")) return new ReportError("self", translateForRuntime("report.modal.self"));
  if (has("invalid_report_reason") || has("details_required") || has("details_too_long")) {
    return new ReportError("invalid", translateForRuntime("report.modal.invalid"));
  }
  return new ReportError("generic", translateForRuntime("report.modal.sendFailed"));
}

/**
 * TEK şikâyet gönderme yolu (docs/history/284-*): `submit_report` RPC'si. Raportör oturumdan gelir (istemci kimlik göndermez), hedef sunucuda
 * çağıranın görebildiği içerik olarak doğrulanır, neden o hedef türüne uygun olmalıdır, yinelenen açık şikâyet ve günlük hız sınırı sunucuda
 * uygulanır. Şikâyet içeriği kaldırmaz; karar yalnız moderasyondadır.
 */
export async function submitReport(input: { targetType: ReportTargetType; targetId: string; reasonCode: ReportReasonCode; details?: string }): Promise<void> {
  const details = (input.details ?? "").trim();
  // İstemci ön kontrolü (sunucu yine doğrular): geçersiz neden/çok uzun ayrıntı ağa hiç çıkmaz.
  if (!reportReasonsFor(input.targetType).includes(input.reasonCode) || [...details].length > REPORT_DETAILS_MAX) {
    throw new ReportError("invalid", translateForRuntime("report.modal.invalid"));
  }
  let message: string | null | undefined;
  try {
    const { error } = await supabase.rpc("submit_report", {
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_reason_code: input.reasonCode,
      p_details: details || null,
    });
    message = error?.message;
    if (!error) return;
  } catch (err) {
    message = err instanceof Error ? err.message : "network";
  }
  throw classifyReportError(message);
}

export interface ReportPreview {
  title: string | null;
  subtitle: string | null;
}

type Embedded = { username?: string | null } | { username?: string | null }[] | null | undefined;
function handle(embedded: Embedded): string | null {
  const one = Array.isArray(embedded) ? embedded[0] : embedded;
  return one?.username ? `@${one.username}` : null;
}

/**
 * Şikâyet penceresindeki küçük önizleme için en iyi çaba okuması (başlık + "@yazar"): çağıran önizlemeyi vermediyse (örn. her yerden açılan ⋮ menüsü)
 * hedefin kendi RLS'i altında tek satır okunur. Okunamazsa (silindi / görünmüyor / ağ) sessizce null döner — pencere yine çalışır.
 */
export async function fetchReportPreview(type: ReportTargetType, id: string): Promise<ReportPreview | null> {
  try {
    const trim = (text: string | null | undefined) => (text ? text.slice(0, 140) : null);
    if (type === "prompt" || type === "request") {
      const { data } = await supabase.from(type === "prompt" ? "prompts" : "prompt_requests").select("title, author:author_id ( username )").eq("id", id).maybeSingle();
      const row = data as { title?: string; author?: Embedded } | null;
      return row ? { title: trim(row.title), subtitle: handle(row.author) } : null;
    }
    if (type === "workflow" || type === "preset") {
      const { data } = await supabase.from(type === "workflow" ? "workflows" : "presets").select("title, creator:creator_id ( username )").eq("id", id).maybeSingle();
      const row = data as { title?: string; creator?: Embedded } | null;
      return row ? { title: trim(row.title), subtitle: handle(row.creator) } : null;
    }
    if (type === "space") {
      const { data } = await supabase.from("spaces").select("title").eq("id", id).maybeSingle();
      return data ? { title: trim((data as { title?: string }).title), subtitle: null } : null;
    }
    if (type === "user") {
      const { data } = await supabase.from("profiles").select("display_name, username").eq("id", id).maybeSingle();
      const row = data as { display_name?: string; username?: string } | null;
      return row ? { title: trim(row.display_name), subtitle: row.username ? `@${row.username}` : null } : null;
    }
    if (type === "comment") {
      const { data } = await supabase.from("prompt_comments").select("body, author:author_id ( username )").eq("id", id).maybeSingle();
      const row = data as { body?: string; author?: Embedded } | null;
      return row ? { title: trim(row.body), subtitle: handle(row.author) } : null;
    }
  } catch {
    return null;
  }
  return null;
}
