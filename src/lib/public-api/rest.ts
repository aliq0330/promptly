/**
 * Promptly açık API çekirdeği — Supabase REST (PostgREST) için en küçük istemci. `supabase-js` KULLANMAZ: aynı dosya hem Node'da
 * (MCP paketi, `node --test`) hem Deno'da (Edge Function `api`) bağımlılıksız çalışsın diye yalnız `fetch` kullanır.
 *
 * GÜVENLİK: bu istemci her zaman ANON anahtarla konuşur — sitenin oturumsuz ziyaretçisiyle birebir aynı yetki. RLS, engel, görünürlük
 * kararları veritabanındadır; burada hiçbir kural genişletilmez ve service role ASLA kullanılmaz (`docs/history/297-*`).
 */

export interface PublicApiConfig {
  /** `https://<ref>.supabase.co` (sonunda `/` olabilir). */
  url: string;
  /** Anon / publishable anahtar — sitenin derlemesine zaten gömülü olan herkese açık anahtar. */
  anonKey: string;
  /** Test için değiştirilebilir. */
  fetch?: typeof fetch;
  /** Tek isteğin zaman aşımı (ms). */
  timeoutMs?: number;
  /** Paylaşım bağlantılarının kökü; varsayılan canlı site. */
  siteUrl?: string;
}

export type PublicApiErrorCode = "bad_request" | "not_found" | "upstream" | "timeout" | "not_configured";

export class PublicApiError extends Error {
  code: PublicApiErrorCode;
  constructor(code: PublicApiErrorCode, message: string) {
    super(message);
    this.name = "PublicApiError";
    this.code = code;
  }
}

export interface RestClient {
  readonly siteUrl: string;
  /** `GET /rest/v1/<table>?<params>` — satır dizisi. */
  select<T>(table: string, params: URLSearchParams): Promise<T[]>;
  /** `POST /rest/v1/rpc/<fn>` — fonksiyonun döndürdüğü JSON. */
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
}

export const DEFAULT_SITE_URL = "https://aliq0330.github.io/promptly";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Eski anon anahtarı bir JWT'dir (`eyJ…`); yeni publishable anahtar (`sb_publishable_…`) değildir ve `Authorization`'a konmaz. */
function authHeaders(anonKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: anonKey };
  if (anonKey.startsWith("eyJ")) headers.Authorization = `Bearer ${anonKey}`;
  return headers;
}

export function createRestClient(config: PublicApiConfig): RestClient {
  const base = config.url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/i.test(base) || !config.anonKey.trim()) {
    throw new PublicApiError("not_configured", "Supabase URL and anon key are required.");
  }
  const doFetch = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = { ...authHeaders(config.anonKey.trim()), Accept: "application/json" };

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${base}/rest/v1/${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new PublicApiError("timeout", "Promptly did not answer in time.");
      throw new PublicApiError("upstream", `Could not reach Promptly: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    if (!response.ok) {
      // PostgREST hata gövdesi `{code, message}`; kullanıcıya iç ayrıntı değil kısa bir özet gider.
      let detail = "";
      try {
        const body = JSON.parse(text) as { message?: string; code?: string };
        detail = [body.code, body.message].filter(Boolean).join(" ");
      } catch {
        detail = text.slice(0, 200);
      }
      throw new PublicApiError("upstream", `Promptly request failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  return {
    siteUrl: (config.siteUrl ?? DEFAULT_SITE_URL).replace(/\/+$/, ""),
    select: <T>(table: string, params: URLSearchParams) => call<T[]>(`${table}?${params.toString()}`, { method: "GET", headers }),
    rpc: <T>(fn: string, args: Record<string, unknown>) =>
      call<T>(`rpc/${fn}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(args) }),
  };
}
