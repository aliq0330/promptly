/**
 * OAuth onay ekranının saf yardımcıları (docs/history/316-*): Supabase Auth'un OAuth 2.1 sunucusu kullanıcıyı `/oauth/consent?authorization_id=…` adresine
 * yollar; burada istek doğrulanır, istenen kapsamlar insan diline çevrilir ve yönlendirme adresi güvenle gösterilir. İstemci adı/adresi KONTROLÜ BAŞKASINDADIR
 * (dinamik kayıtla herkes istemci kaydedebilir) — ekran bunu açıkça gösterir ve metne güvenmez.
 */

/** `authorization_id`: Supabase'in ürettiği opak kimlik; yalnız güvenli karakterler, makul uzunluk. */
export function parseAuthorizationId(value: string | null | undefined): string | null {
  const id = (value ?? "").trim();
  return /^[A-Za-z0-9_-]{8,200}$/.test(id) ? id : null;
}

/** Yönlendirme adresinin yalnız kök alan adı (ör. `claude.ai`) — kimlik avı için kullanıcıya gösterilir. Geçersiz/https dışı → null. */
export function redirectHost(uri: string | null | undefined): string | null {
  try {
    const url = new URL(String(uri ?? ""));
    if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))) return null;
    return url.host;
  } catch {
    return null;
  }
}

/** Bilinen OpenID kapsamları; bilinmeyen kapsam olduğu gibi (çevrilmeden) gösterilir. */
export const KNOWN_SCOPES = ["openid", "profile", "email", "phone"] as const;

export function splitScopes(scope: string | null | undefined): string[] {
  return Array.from(new Set(String(scope ?? "").split(/\s+/).map((s) => s.trim()).filter(Boolean))).slice(0, 20);
}

/** Dönüş adresi (`redirect_url`) yalnız https (ya da yerel geliştirme) ise izlenir; aksi hâlde kullanıcı yönlendirilmez. */
export function safeRedirectUrl(url: string | null | undefined): string | null {
  return redirectHost(url) ? String(url) : null;
}
