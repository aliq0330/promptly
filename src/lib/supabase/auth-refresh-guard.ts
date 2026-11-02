/**
 * Oturum yenileme isteklerine karşı koruma (docs/history/320-*): `createClient({ global: { fetch } })` zinciri auth isteklerini de taşır.
 * (1) AYNI yenileme belirteciyle kısa sürede gelen tekrar istekler ağa gitmez, ilk yanıt yeniden kullanılır: kayıt başarısızlığı/yarış yüzünden aynı
 *     belirteç saniyede birkaç kez gönderildiğinde (canlıda ~4/sn görüldü) Supabase'in IP başına yenileme sınırına (429) takılmayız.
 * (2) Yenilemede 429 (`over_request_rate_limit`) 503'e çevrilir: auth-js 5xx'i "geçici ağ hatası" sayar ve oturumu SİLMEZ; 429'u kalıcı hata sayıp
 *     (erişim belirteci dolmuşsa) oturumu silerdi — kullanıcı hız sınırı yüzünden çıkış yapmış olurdu. Hız sınırı bir süre önbelleğe alınır ki
 *     auth-js'nin geri çekilmeli yeniden denemeleri sınırı daha da zorlamasın.
 * Yalnız `POST …/auth/v1/token?grant_type=refresh_token` etkilenir; başka hiçbir istek (parola girişi, REST…) değişmez. Belirteç yalnız bellekte ve kısa süre tutulur.
 */

const REUSE_WINDOW_MS = 10_000;
const THROTTLE_MS = 30_000;
const MAX_ENTRIES = 20;

interface Template {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
}

interface Entry {
  at: number;
  kind: "ok" | "throttled" | "pending";
  template: Promise<Template>;
}

export interface RefreshGuardOptions {
  now?: () => number;
  reuseWindowMs?: number;
  throttleMs?: number;
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

function isRefreshRequest(url: string, init?: RequestInit): boolean {
  if (!url.includes("/auth/v1/token") || !url.includes("grant_type=refresh_token")) return false;
  return (init?.method ?? "GET").toUpperCase() === "POST";
}

function refreshTokenOf(init?: RequestInit): string | null {
  if (typeof init?.body !== "string") return null;
  try {
    const parsed = JSON.parse(init.body) as { refresh_token?: unknown } | null;
    return typeof parsed?.refresh_token === "string" && parsed.refresh_token ? parsed.refresh_token : null;
  } catch {
    return null;
  }
}

function toResponse(template: Template): Response {
  return new Response(template.body, { status: template.status, statusText: template.statusText, headers: template.headers });
}

async function toTemplate(response: Response): Promise<Template> {
  return { status: response.status, statusText: response.statusText, headers: Array.from(response.headers.entries()), body: await response.text() };
}

export function guardAuthRefresh(baseFetch: typeof fetch, options: RefreshGuardOptions = {}): typeof fetch {
  const { now = Date.now, reuseWindowMs = REUSE_WINDOW_MS, throttleMs = THROTTLE_MS } = options;
  const recent = new Map<string, Entry>();

  function prune(at: number) {
    for (const [token, entry] of recent) {
      const ttl = entry.kind === "throttled" ? throttleMs : reuseWindowMs;
      if (entry.kind !== "pending" && at - entry.at >= ttl) recent.delete(token);
    }
    while (recent.size > MAX_ENTRIES) {
      const oldest = recent.keys().next().value;
      if (oldest === undefined) break;
      recent.delete(oldest);
    }
  }

  return async (input, init) => {
    const url = requestUrl(input);
    if (!isRefreshRequest(url, init)) return baseFetch(input, init);
    const token = refreshTokenOf(init);
    if (!token) return baseFetch(input, init);

    const at = now();
    prune(at);
    const hit = recent.get(token);
    if (hit) return toResponse(await hit.template);

    const entry: Entry = {
      at,
      kind: "pending",
      template: baseFetch(input, init).then(async (response) => {
        if (response.status === 429) {
          entry.kind = "throttled";
          const template = await toTemplate(response);
          return { ...template, status: 503, statusText: "Service Unavailable" };
        }
        const template = await toTemplate(response);
        if (response.ok) entry.kind = "ok";
        else recent.delete(token); // başka hatalar (ör. belirteç geçersiz) önbelleğe alınmaz
        return template;
      }),
    };
    recent.set(token, entry);
    try {
      return toResponse(await entry.template);
    } catch (error) {
      recent.delete(token); // ağ hatası: bir sonraki deneme gerçekten gitsin
      throw error;
    }
  };
}
