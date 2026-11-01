/**
 * Açık API ve MCP üzerinden bir promptun "kullanıldığı" (tek prompt okunduğu ya da doldurulduğu) sayısı — docs/history/304-*. Bağımlılıksız.
 *
 * NE SAYILIR: `GET /v1/prompts/{id}` (ve `?format=`), `POST /v1/prompts/{id}/fill`; MCP'de `get_prompt` ve `fill_prompt`. Arama ve popüler listeleri SAYILMAZ
 * (bir listede görmek kullanmak değildir). Bir istemci aynı promptu aynı gün aynı yüzeyden bir kez sayar (kararı veritabanı verir).
 *
 * KİMLİK: hesap yoktur; istemci IP'den türer (`clientKeyOf`). Veritabanına ham IP gitmez: kova = sha256(sır|use|yüzey|IP). IP belirlenemezse SAYILMAZ
 * (hepsini tek kovaya koymak sayacı anlamsız kılar). Sayım hata verirse (ağ, sır yok, yavaş) sessizce atlanır: sayaç API'yi asla düşürmemeli.
 *
 * `prompts.copy_count`'a DOKUNMAZ — site kopyalaması oturumlu kullanıcı başınadır, bu kimliksizdir; ayrı tutulur (migration başlığına bak).
 */
import { sha256Hex, type RateLimitRpc } from "./rate-limit.ts";

export type PromptUseSource = "api" | "mcp";

export interface PromptUseRecorder {
  /** `clientKey` = `clientKeyOf(headers)`. Asla fırlatmaz; sayılamadıysa sessizce döner. */
  record(promptId: string, clientKey: string | null): Promise<void>;
}

export interface RemotePromptUseRecorderConfig {
  /** Kısa zaman aşımlı bir istemci verin (`createRestClient({ timeoutMs: 1500 })`): sayaç yavaşsa istek beklememeli. */
  client: RateLimitRpc;
  /** Edge Function ortamındaki `RATE_LIMIT_SECRET` (hız sınırıyla aynı sır); veritabanında yalnız özeti vardır. */
  secret: string;
  source: PromptUseSource;
  onError?: (error: unknown) => void;
}

/** Üretim kaydedicisi: sayım veritabanındadır (`record_public_api_prompt_use`, sırla korunur). */
export function createRemotePromptUseRecorder(config: RemotePromptUseRecorderConfig): PromptUseRecorder {
  return {
    async record(promptId, clientKey) {
      if (!clientKey) return;
      try {
        const client = (await sha256Hex(`${config.secret}|use|${config.source}|${clientKey}`)).slice(0, 32);
        await config.client.rpc<boolean>("record_public_api_prompt_use", {
          p_secret: config.secret,
          p_prompt_id: promptId,
          p_source: config.source,
          p_client: client,
        });
      } catch (error) {
        config.onError?.(error);
      }
    },
  };
}
