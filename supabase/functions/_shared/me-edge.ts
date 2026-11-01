// Edge Function'lar için "benim hesabım" bağdaştırıcıları (docs/history/315-*): ELLE yazılmıştır (`_shared/promptly/` üretilmiş kopyadır, bu dosya değil).
// Çekirdek (`me.ts`) bağımlılıksızdır; Postgres sürücüsü ve Supabase Auth çağrısı yalnız burada, Deno'ya özgü olarak bulunur.
//
// GÜVENLİK: `SUPABASE_DB_URL` Supabase'in Edge Function'lara verdiği, sahip rolle doğrudan Postgres bağlantısıdır. Bu bağlantıyla yapılan HER ŞEY çekirdekte
// (`createMeBackend`) tek işlemde `set local role authenticated` + kullanıcı iddialarıyla kısıtlanır; bu dosya o işlemi kurmaz, yalnız ham işlemi verir.
// Service role anahtarı kullanılmaz. Bağlantı dizesi hiçbir yanıta/loga yazılmaz.
import postgres from "npm:postgres@3.4.5";
import type { MeDb, MeTx } from "./promptly/lib/public-api/me.ts";

/** Tek bağlantılı (max 1), hazırlıksız (`prepare:false`: havuz/pgbouncer uyumlu) Postgres; işlem fırlatırsa geri alınır. */
export function createPostgresMeDb(url: string): MeDb {
  let sql: ReturnType<typeof postgres> | null = null;
  const get = () =>
    (sql ??= postgres(url, { max: 1, prepare: false, connect_timeout: 10, idle_timeout: 20, connection: { statement_timeout: 8000 } }));
  return {
    transaction<T>(fn: (tx: MeTx) => Promise<T>): Promise<T> {
      return get().begin((tx) =>
        fn(async (text, params = []) => (await tx.unsafe(text, params as never[])) as unknown as Record<string, unknown>[]),
      ) as Promise<T>;
    },
  };
}

/** OAuth erişim belirteci → kullanıcı kimliği: Supabase Auth'a doğrulatılır (imza/süre/iptal onun işi). Geçersiz ya da ulaşılamazsa null. */
export function createJwtVerifier(supabaseUrl: string, anonKey: string): (jwt: string) => Promise<string | null> {
  const base = supabaseUrl.replace(/\/+$/, "");
  return async (jwt) => {
    try {
      const response = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { id?: unknown } | null;
      return typeof body?.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
    } catch {
      return null;
    }
  };
}
