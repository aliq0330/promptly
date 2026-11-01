import { redirectHost, safeRedirectUrl } from "./oauth-consent.ts";

/**
 * Kendi OAuth sunucumuzun onay sayfasının saf yardımcıları (docs/history/317-*). Sayfa `/oauth/connect/?request=…` adresine gelir; `request` sunucunun
 * ürettiği 32 baytlık opak belirteçtir (base64url, 43 karakter). Uygulamanın adı/adresi KAYIT SAHİBİNİN yazdığı bilgidir (dinamik kayıt) — güvenilmez, ekran bunu söyler.
 */

export function parseConnectRequest(value: string | null | undefined): string | null {
  const id = (value ?? "").trim();
  return /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null;
}

export interface ConnectInfo {
  clientName: string;
  clientUri: string | null;
  redirectHost: string | null;
}

/** `oauth_request_info` yanıtı → ekranda gösterilecek bilgi. Süresi dolmuş/yok (null) ve biçimi bozuk yanıt → null. */
export function parseConnectInfo(raw: unknown): ConnectInfo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const name = typeof body.client_name === "string" ? body.client_name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) : "";
  if (!name) return null;
  const host = typeof body.redirect_uri === "string" ? redirectHost(body.redirect_uri) : null;
  return { clientName: name, clientUri: typeof body.client_uri === "string" ? redirectHost(body.client_uri) : null, redirectHost: host };
}

/**
 * Karardan sonra gidilecek adres: sunucunun verdiği kayıtlı `redirect_uri` + parametreler (kod/durum ya da hata). Yalnız https (ya da yerel geliştirme)
 * adreslerine yönlendirilir; aksi hâlde null (kullanıcı hiçbir yere gönderilmez).
 */
export function buildReturnUrl(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const body = result as { redirect_uri?: unknown; params?: unknown };
  const base = typeof body.redirect_uri === "string" ? safeRedirectUrl(body.redirect_uri) : null;
  if (!base) return null;
  const url = new URL(base);
  if (body.params && typeof body.params === "object" && !Array.isArray(body.params)) {
    for (const [key, value] of Object.entries(body.params as Record<string, unknown>)) {
      if (typeof value === "string" && value !== "") url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export interface OauthGrantRow {
  id: string;
  name: string;
  host: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export function mapOauthGrantRow(raw: Record<string, unknown>): OauthGrantRow | null {
  if (typeof raw.id !== "string" || typeof raw.client_name !== "string") return null;
  const scopes = Array.isArray(raw.scopes) ? raw.scopes.filter((s): s is string => s === "read" || s === "write") : [];
  return {
    id: raw.id,
    name: raw.client_name.slice(0, 80) || "—",
    host: typeof raw.redirect_host === "string" ? raw.redirect_host : null,
    scopes,
    createdAt: typeof raw.created_at === "string" ? raw.created_at : "",
    lastUsedAt: typeof raw.last_used_at === "string" ? raw.last_used_at : null,
  };
}
