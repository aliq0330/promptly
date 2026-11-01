import { supabase } from "./client";
import { mapOauthGrantRow, type OauthGrantRow } from "@/lib/oauth-connect";

/**
 * Kendi OAuth sunucumuzun kullanıcı yüzü (docs/history/317-*): dört RPC. Tablolar istemciye KAPALIdır; kimlik hep `auth.uid()`.
 * Kod yalnız `decideOauthRequest` yanıtında bir kez döner ve hemen uygulamaya (adres parametresi olarak) iletilir; saklanmaz.
 */

/** Onay sayfası bilgisi; süresi dolmuş/yok → null. */
export async function fetchOauthRequestInfo(request: string): Promise<unknown> {
  const { data, error } = await supabase.rpc("oauth_request_info", { p_request: request });
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Karar: onay ya da ret. Dönen nesne `{ redirect_uri, params }` — adresi `buildReturnUrl` kurar. İstek TEK KULLANIMLIKTIR. */
export async function decideOauthRequest(request: string, approve: boolean, write: boolean): Promise<unknown> {
  const { data, error } = await supabase.rpc("oauth_decide", { p_request: request, p_approve: approve, p_write: write });
  if (error) throw new Error(error.message);
  return data;
}

export async function listMyOauthGrants(): Promise<OauthGrantRow[]> {
  const { data, error } = await supabase.rpc("list_my_oauth_grants");
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : [])
    .map((raw) => mapOauthGrantRow(raw as Record<string, unknown>))
    .filter((row): row is OauthGrantRow => row !== null);
}

/** Bu çağrıda iptal edildiyse true. İzin ve elindeki bütün belirteçler hemen kapanır. */
export async function revokeMyOauthGrant(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("revoke_my_oauth_grant", { p_id: id });
  if (error) throw new Error(error.message);
  return data === true;
}
