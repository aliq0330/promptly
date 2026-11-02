// Telegram Bot API bağdaştırıcısı (docs/history/323-*): ELLE yazılmıştır (`_shared/promptly/` üretilmiş kopyadır, bu dosya değil).
// GÜVENLİK: bot belirteci adresin içindedir. Bu yüzden hata nesneleri/adres HİÇBİR yere yazılmaz ve çağırana yalnız Telegram'ın kendi `error_code`/`description` alanı döner.
import type { TelegramApi, TelegramCallResult } from "./promptly/lib/public-api/telegram/types.ts";

export function createTelegramApi(token: string): TelegramApi {
  const base = `https://api.telegram.org/bot${token}`;
  return {
    async call<T = unknown>(method: string, params: Record<string, unknown>): Promise<TelegramCallResult<T>> {
      try {
        const response = await fetch(`${base}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(10_000),
        });
        const body = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number; description?: string } | null;
        if (body?.ok) return { ok: true, result: body.result as T };
        return { ok: false, errorCode: Number(body?.error_code ?? response.status), description: String(body?.description ?? "error") };
      } catch {
        // Ağ hatası: `error.message` adresi (belirteci) içerebilir → hiçbir ayrıntı taşınmaz.
        return { ok: false, errorCode: 0, description: "network" };
      }
    },
  };
}
