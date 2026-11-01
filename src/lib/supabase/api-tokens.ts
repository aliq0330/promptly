import { supabase } from "./client";
import { mapApiTokenRow, type ApiTokenRow, type ApiTokenScope } from "@/lib/api-tokens";

/**
 * Kişisel API anahtarları veri katmanı (docs/history/313-*, 314-*): üç RPC. Tablo istemciye KAPALIdır; kimlik hep `auth.uid()`.
 * Ham anahtar yalnız `createApiToken` yanıtında bir kez döner — sunucuda yalnız özeti durur, bir daha okunamaz.
 * Bilinen sunucu kodları (`token_limit`, `invalid_name`, `invalid_scope`, `invalid_expiry`, `rate_limit`) `server-errors.ts` ile çevrilmiş mesajla gelir.
 */

export interface CreatedApiToken {
  id: string;
  /** Ham anahtar — yalnız bu yanıtta; saklanmaz, loglanmaz. */
  token: string;
  prefix: string;
  name: string;
}

/** Kendi anahtarların (en yeni önce, en çok 50). Hata `Error` olarak fırlar. */
export async function listMyApiTokens(): Promise<ApiTokenRow[]> {
  const { data, error } = await supabase.rpc("list_my_api_tokens");
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : [])
    .map((raw) => mapApiTokenRow(raw as Record<string, unknown>))
    .filter((row): row is ApiTokenRow => row !== null);
}

export async function createApiToken(input: { name: string; scopes: ApiTokenScope[]; expiresInDays: number | null }): Promise<CreatedApiToken> {
  const { data, error } = await supabase.rpc("create_api_token", {
    p_name: input.name.trim(),
    p_scopes: input.scopes,
    p_expires_in_days: input.expiresInDays,
  });
  if (error) throw new Error(error.message);
  const body = (data ?? {}) as Record<string, unknown>;
  if (typeof body.token !== "string" || typeof body.id !== "string") throw new Error("create_api_token: unexpected response");
  return { id: body.id, token: body.token, prefix: typeof body.prefix === "string" ? body.prefix : body.token.slice(0, 8), name: typeof body.name === "string" ? body.name : input.name.trim() };
}

/** Bu çağrıda iptal edildiyse true (zaten iptal edilmişse / sana ait değilse false). */
export async function revokeApiToken(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("revoke_api_token", { p_id: id });
  if (error) throw new Error(error.message);
  return data === true;
}
