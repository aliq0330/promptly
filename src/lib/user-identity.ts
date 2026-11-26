/**
 * Oturumdaki kullanıcının "aynı kişi, aynı görünen bilgi" imzası (docs/history/466-*). supabase-js her oturum olayında (getSession,
 * INITIAL_SESSION, SIGNED_IN, saatlik TOKEN_REFRESHED) yeni bir `user` nesnesi verir; imza aynıysa `AuthProvider` önceki nesneyi kullanır, böylece
 * `[user]`'a bağlı efektler aynı kullanıcı için baştan çalışıp aynı istekleri tekrar göndermez. Kimlik, e-posta/telefon ya da kullanıcı/uygulama
 * meta verisi değişince imza değişir (profil adı, rol gibi bilgileri okuyan ekranlar yine güncellenir). Belirteç alanları imzaya GİRMEZ.
 */
export interface IdentityLike {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: unknown;
  app_metadata?: unknown;
  role?: string | null;
}

/** Anahtar sırası ne olursa olsun aynı nesne aynı metni verir. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

export function userSignature(user: IdentityLike | null | undefined): string {
  if (!user) return "";
  return [user.id, user.email ?? "", user.phone ?? "", user.role ?? "", stableJson(user.user_metadata), stableJson(user.app_metadata)].join("\u0001");
}
